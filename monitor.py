"""CMS Prime weekly SEO monitor — full automated version.

Pulls:
  1. Technical health (in-house — sitemap counts, on-page audit, phantom-301 health)
  2. Semrush metrics (visibility, organic keywords, backlinks)

Pushes to:
  - Google Sheet "Auto - *" tabs
  - Local kpi_tracker.csv (fallback)
  - Local audit_YYYY-MM-DD.json archive

Usage:
  python monitor.py                   # run for today UTC
  python monitor.py --date 2026-06-15 # backdate
  python monitor.py --skip-sheets     # local only (for testing)
  python monitor.py --skip-semrush    # technical audit only (saves API units)
"""
import argparse
import csv
import json
import os
import re
import subprocess
import sys, io
from datetime import datetime
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# Load .env
HERE = Path(__file__).parent
ENV = HERE.parent / ".env"
if ENV.exists():
    for line in ENV.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

# Local imports
sys.path.insert(0, str(HERE))
from semrush_client import SemrushClient, SemrushError
from sheets_writer import SheetsWriter

UA = "Mozilla/5.0 (Adnika SEO Monitor)"

SITEMAPS = {
    "en": "https://cmsprime.com/sitemap_index.xml",
    "ar": "https://cmsprime.com/ar/sitemap_index.xml",
    "fa": "https://cmsprime.com/fa/sitemap_index.xml",
}
SAMPLE_PAGES = [
    "https://cmsprime.com/",
    "https://cmsprime.com/metatrader-4/",
    "https://cmsprime.com/online-forex-trading/",
    "https://cmsprime.com/stock-cfds-trading/",
    "https://cmsprime.com/ar/metatrader-4/",
    "https://cmsprime.com/fa/metatrader-4/",
]
PHANTOM_REDIRECTS = [
    ("/mt4-trading-platform", "/metatrader-4/"),
    ("/mt5-trading-platform", "/metatrader-5/"),
    ("/cfd-trading", "/stock-cfds-trading/"),
    ("/index-trading", "/indices-trading/"),
    ("/funded-account", "/fundedaccounts/"),
    ("/commodity-trading-uae", "/commodities-trading/"),
    ("/forex-trading-uae", "/online-forex-trading/"),
    ("/forex-web-trading-platform", "/online-forex-trading/"),
    ("/best-online-trading-platform-in-uae", "/online-forex-trading/"),
    ("/cms-card", "/cpay/"),
]


# ---- HTTP helpers ----

def fetch(url, timeout=30):
    r = subprocess.run(
        ["curl.exe", "-s", "-A", UA, "-L", "-w", "\n---STATUS:%{http_code} TIME:%{time_total}---", url],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
    )
    body = r.stdout
    code, time_s = "?", None
    if "---STATUS:" in body:
        parts = body.rsplit("---STATUS:", 1)
        body = parts[0]
        m = re.match(r"(\d+)\s+TIME:([\d.]+)", parts[1])
        if m:
            code = m.group(1)
            time_s = float(m.group(2))
    return code, time_s, body


def count_sitemap_urls(sitemap_index_url):
    code, _, idx_xml = fetch(sitemap_index_url)
    if code != "200":
        return None
    children = re.findall(r"<sitemap>\s*<loc>([^<]+)</loc>", idx_xml)
    total = 0
    for sm in children:
        code2, _, body = fetch(sm)
        if code2 == "200":
            total += len(re.findall(r"<url>\s*<loc>", body))
    return total


# ---- Per-page audit ----

def audit_page(url):
    code, time_s, html = fetch(url)
    if code != "200" or not html:
        return {"url": url, "http_code": code, "fetch_time_s": time_s, "ok": False}

    canon = re.search(r'<link\s+rel="canonical"\s+href="([^"]+)"', html, re.I)
    hreflangs = re.findall(r'<link\s+rel="alternate"\s+hreflang="([^"]+)"', html, re.I)
    title = re.search(r"<title[^>]*>([^<]+)</title>", html, re.I)
    desc = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', html, re.I)
    h1_count = len(re.findall(r"<h1\b", html, re.I))

    blocks = re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>([\s\S]*?)</script>', html)
    has_org = has_cred = False
    for b in blocks:
        try:
            data = json.loads(b.strip())
            for c in data.get("@graph", [data] if "@type" in data else []):
                t = c.get("@type")
                if t == "Organization" or (isinstance(t, list) and "Organization" in t):
                    has_org = True
                    if c.get("hasCredential"):
                        has_cred = True
                    break
        except Exception:
            pass

    head_match = re.search(r"(?si)<head\b[^>]*>(.*?)</head>", html)
    head = head_match.group(1) if head_match else ""
    rb_css = len(re.findall(r'<link[^>]+rel=["\']stylesheet["\'][^>]*>', head, re.I))
    rb_js_blocking = len([
        s for s in re.findall(r'<script\b[^>]*\bsrc=[^>]*></script>', head, re.I)
        if not re.search(r'\b(defer|async|type=["\']module["\'])', s, re.I)
    ])

    body_match = re.search(r"(?si)<body\b[^>]*>(.*)</body>", html)
    body = body_match.group(1) if body_match else html
    imgs = re.findall(r'<img\b[^>]*>', body, re.I)
    imgs_no_dims = sum(1 for i in imgs if not (re.search(r'\bwidth=', i, re.I) and re.search(r'\bheight=', i, re.I)))
    imgs_no_lazy = sum(1 for i in imgs if "loading=\"lazy\"" not in i.lower() and "loading='lazy'" not in i.lower())

    return {
        "url": url,
        "http_code": code,
        "fetch_time_s": round(time_s, 2) if time_s else None,
        "html_size_kb": round(len(html) / 1024),
        "ok": True,
        "title": title.group(1)[:120] if title else "",
        "title_len": len(title.group(1)) if title else 0,
        "desc_len": len(desc.group(1)) if desc else 0,
        "canonical": canon.group(1) if canon else "",
        "canonical_self": (canon.group(1) == url) if canon else False,
        "h1_count": h1_count,
        "hreflang_count": len(hreflangs),
        "has_organization_schema": has_org,
        "has_credential_schema": has_cred,
        "rb_css_head": rb_css,
        "rb_js_head_blocking": rb_js_blocking,
        "imgs_total": len(imgs),
        "imgs_no_dimensions": imgs_no_dims,
        "imgs_no_lazy": imgs_no_lazy,
    }


def check_phantom_redirects():
    results = []
    for src, expected in PHANTOM_REDIRECTS:
        r = subprocess.run(
            ["curl.exe", "-s", "-o", "NUL", "-w", "%{http_code}|%{redirect_url}", "-A", UA,
             "--max-redirs", "0", f"https://cmsprime.com{src}"],
            capture_output=True, text=True, timeout=15
        )
        parts = r.stdout.split("|", 1)
        code = parts[0]
        dst = re.sub(r"^https?://cmsprime\.com", "", parts[1] if len(parts) > 1 else "").split("?")[0]
        results.append({
            "src": src, "code": code, "dst": dst, "expected": expected,
            "ok": code == "301" and dst == expected,
        })
    return results


# ---- Main pipeline ----

def run(date_str=None, skip_sheets=False, skip_semrush=False):
    date_str = date_str or datetime.utcnow().strftime("%Y-%m-%d")
    print(f"\n{'=' * 70}\nCMS Prime weekly SEO monitor — {date_str}\n{'=' * 70}\n")

    # ---- 1. Technical audit ----
    print("1. Technical audit")
    summary = {"date": date_str}

    for label, url in SITEMAPS.items():
        n = count_sitemap_urls(url)
        summary[f"sitemap_{label}_count"] = n if n is not None else 0
        print(f"   sitemap {label.upper()}: {n}")

    print("   phantom-slug 301s:")
    redirects = check_phantom_redirects()
    summary["phantom_301s_ok"] = sum(1 for r in redirects if r["ok"])
    summary["phantom_301s_total"] = len(redirects)
    for r in redirects[:3]:
        print(f"     [{('OK' if r['ok'] else 'FAIL')}] {r['src']} -> {r['code']} {r['dst']}")
    print(f"     ... ({summary['phantom_301s_ok']}/{summary['phantom_301s_total']} firing correctly)")

    print(f"   sample page audits ({len(SAMPLE_PAGES)} pages):")
    page_audits = []
    for u in SAMPLE_PAGES:
        a = audit_page(u)
        page_audits.append(a)
    valid = [a for a in page_audits if a.get("ok")]
    if valid:
        summary["pages_sampled"] = len(valid)
        summary["avg_fetch_time_s"] = round(sum(a["fetch_time_s"] for a in valid) / len(valid), 2)
        summary["avg_html_kb"] = round(sum(a["html_size_kb"] for a in valid) / len(valid))
        summary["pages_with_hreflang_3plus"] = sum(1 for a in valid if a["hreflang_count"] >= 3)
        summary["pages_with_org_schema"] = sum(1 for a in valid if a["has_organization_schema"])
        summary["pages_with_credentials"] = sum(1 for a in valid if a["has_credential_schema"])
        summary["avg_imgs_no_dims"] = round(sum(a["imgs_no_dimensions"] for a in valid) / len(valid))
    print(f"     avg fetch: {summary.get('avg_fetch_time_s')}s  avg size: {summary.get('avg_html_kb')}KB  hreflang ok: {summary.get('pages_with_hreflang_3plus')}/{len(valid)}")

    # ---- 2. Semrush ----
    semrush_data = {}
    if not skip_semrush:
        print("\n2. Semrush API")
        try:
            sr = SemrushClient()
            units_before = sr.api_units_remaining()
            print(f"   units before run: {units_before}")

            # Domain overview (UAE)
            ov = sr.domain_overview("cmsprime.com", "ae")
            summary["semrush_organic_kw_ae"] = int(ov.get("Organic Keywords", 0) or 0)
            summary["semrush_organic_traffic_ae"] = int(ov.get("Organic Traffic", 0) or 0)
            summary["semrush_rank_ae"] = int(ov.get("Rank", 0) or 0)
            print(f"   UAE: {summary['semrush_organic_kw_ae']} keywords, {summary['semrush_organic_traffic_ae']} traffic, rank {summary['semrush_rank_ae']}")

            # Top keywords (AE)
            top_kw = sr.domain_organic_keywords("cmsprime.com", "ae", limit=50)
            semrush_data["top_keywords_ae"] = top_kw
            print(f"   pulled top {len(top_kw)} organic keywords (UAE)")

            # Backlinks overview
            bl = sr.backlinks_overview("cmsprime.com")
            summary["semrush_total_backlinks"] = int(bl.get("total", 0) or 0)
            summary["semrush_referring_domains"] = int(bl.get("domains_num", 0) or 0)
            summary["semrush_ascore"] = int(bl.get("ascore", 0) or 0)
            summary["semrush_follow_links"] = int(bl.get("follows_num", 0) or 0)
            summary["semrush_nofollow_links"] = int(bl.get("nofollows_num", 0) or 0)
            print(f"   backlinks: {summary['semrush_total_backlinks']} from {summary['semrush_referring_domains']} domains, AS={summary['semrush_ascore']}")

            # Top referring domains
            ref_doms = sr.backlinks_referring_domains("cmsprime.com", limit=100)
            semrush_data["top_referring_domains"] = ref_doms
            print(f"   pulled top {len(ref_doms)} referring domains")

            units_after = sr.api_units_remaining()
            summary["semrush_units_used"] = units_before - units_after
            print(f"   units used this run: {summary['semrush_units_used']}  (remaining: {units_after})")
        except SemrushError as e:
            print(f"   SEMRUSH ERROR: {e}")
            summary["semrush_error"] = str(e)[:200]
    else:
        print("\n2. Semrush: SKIPPED (--skip-semrush)")

    # ---- 3. Local archive ----
    archive = HERE / f"audit_{date_str}.json"
    with open(archive, "w", encoding="utf-8") as f:
        json.dump({
            "date": date_str,
            "summary": summary,
            "phantom_redirects": redirects,
            "page_audits": page_audits,
            "semrush": semrush_data,
        }, f, indent=2, ensure_ascii=False)
    print(f"\n3. Archived JSON -> {archive.name}")

    # Append to local CSV (fallback)
    csv_path = HERE / "kpi_tracker.csv"
    write_header = not csv_path.exists()
    fields = sorted(summary.keys())
    with open(csv_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        if write_header:
            writer.writeheader()
        writer.writerow(summary)
    print(f"   appended row to {csv_path.name}")

    # ---- 4. Sheets push ----
    if skip_sheets:
        print("\n4. Sheets push: SKIPPED (--skip-sheets)")
        return summary

    print("\n4. Pushing to Google Sheet...")
    sheet_id = os.environ.get("SHEET_ID")
    if not sheet_id:
        print("   ERROR: SHEET_ID env var not set; skipping sheets push")
        return summary

    sw = SheetsWriter(sheet_id)

    # Tab 1: Weekly KPIs (append-row, time series)
    kpi_headers = [
        "date",
        "sitemap_en_count", "sitemap_ar_count", "sitemap_fa_count",
        "phantom_301s_ok", "phantom_301s_total",
        "pages_sampled", "avg_fetch_time_s", "avg_html_kb",
        "pages_with_hreflang_3plus", "pages_with_org_schema", "pages_with_credentials",
        "avg_imgs_no_dims",
        "semrush_organic_kw_ae", "semrush_organic_traffic_ae", "semrush_rank_ae",
        "semrush_total_backlinks", "semrush_referring_domains", "semrush_ascore",
        "semrush_follow_links", "semrush_nofollow_links",
    ]
    sw.ensure_tab("Auto - Weekly KPIs", kpi_headers)
    sw.append_row("Auto - Weekly KPIs", kpi_headers, summary)
    print("   - Auto - Weekly KPIs: 1 row appended")

    # Tab 2: Keyword Rankings (replace each run — snapshot of current state)
    kw_headers = ["date", "Keyword", "Position", "Previous position", "Search Volume", "CPC", "Traffic (%)", "URL"]
    kw_rows = []
    for k in semrush_data.get("top_keywords_ae", []):
        kw_rows.append({
            "date": date_str,
            "Keyword": k.get("Keyword", ""),
            "Position": k.get("Position", ""),
            "Previous position": k.get("Previous position", ""),
            "Search Volume": k.get("Search Volume", ""),
            "CPC": k.get("CPC", ""),
            "Traffic (%)": k.get("Traffic (%)", ""),
            "URL": k.get("Url", ""),
        })
    if kw_rows:
        sw.replace_tab("Auto - Keyword Rankings", kw_headers, kw_rows)
        print(f"   - Auto - Keyword Rankings: {len(kw_rows)} keywords")

    # Tab 3: Top Referring Domains (replace each run)
    ref_headers = ["date", "Domain Authority", "Domain", "Backlinks", "Country", "First seen", "Last seen"]
    ref_rows = []
    for d in semrush_data.get("top_referring_domains", []):
        ref_rows.append({
            "date": date_str,
            "Domain Authority": d.get("domain_ascore", ""),
            "Domain": d.get("domain", ""),
            "Backlinks": d.get("backlinks_num", ""),
            "Country": d.get("country", ""),
            "First seen": d.get("first_seen", ""),
            "Last seen": d.get("last_seen", ""),
        })
    if ref_rows:
        sw.replace_tab("Auto - Top Referring Domains", ref_headers, ref_rows)
        print(f"   - Auto - Top Referring Domains: {len(ref_rows)} domains")

    # Tab 4: Page Health (replace each run)
    page_headers = [
        "date", "URL", "HTTP", "Fetch (s)", "Size (KB)", "Title length", "Desc length",
        "Canonical OK", "H1 count", "Hreflang count", "Org schema", "Credentials",
        "RB CSS in head", "RB JS in head", "Total images", "Images no dims", "Images no lazy",
    ]
    page_rows = []
    for a in page_audits:
        page_rows.append({
            "date": date_str,
            "URL": a.get("url", ""),
            "HTTP": a.get("http_code", ""),
            "Fetch (s)": a.get("fetch_time_s", ""),
            "Size (KB)": a.get("html_size_kb", ""),
            "Title length": a.get("title_len", ""),
            "Desc length": a.get("desc_len", ""),
            "Canonical OK": "Y" if a.get("canonical_self") else "N",
            "H1 count": a.get("h1_count", ""),
            "Hreflang count": a.get("hreflang_count", ""),
            "Org schema": "Y" if a.get("has_organization_schema") else "N",
            "Credentials": "Y" if a.get("has_credential_schema") else "N",
            "RB CSS in head": a.get("rb_css_head", ""),
            "RB JS in head": a.get("rb_js_head_blocking", ""),
            "Total images": a.get("imgs_total", ""),
            "Images no dims": a.get("imgs_no_dimensions", ""),
            "Images no lazy": a.get("imgs_no_lazy", ""),
        })
    sw.replace_tab("Auto - Page Health", page_headers, page_rows)
    print(f"   - Auto - Page Health: {len(page_rows)} pages")

    # Tab 5: Phantom Redirects health (replace each run)
    redir_headers = ["date", "Source", "HTTP code", "Destination", "Expected", "OK"]
    redir_rows = [{
        "date": date_str,
        "Source": r["src"],
        "HTTP code": r["code"],
        "Destination": r["dst"],
        "Expected": r["expected"],
        "OK": "Y" if r["ok"] else "N",
    } for r in redirects]
    sw.replace_tab("Auto - Phantom Redirects", redir_headers, redir_rows)
    print(f"   - Auto - Phantom Redirects: {len(redir_rows)} redirects")

    print(f"\n{'=' * 70}\nDone. View at https://docs.google.com/spreadsheets/d/{sheet_id}/edit")
    return summary


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--date", help="Run date YYYY-MM-DD (default: today UTC)")
    p.add_argument("--skip-sheets", action="store_true")
    p.add_argument("--skip-semrush", action="store_true")
    args = p.parse_args()
    run(args.date, skip_sheets=args.skip_sheets, skip_semrush=args.skip_semrush)
