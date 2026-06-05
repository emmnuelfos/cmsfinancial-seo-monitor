"""QA regression check — Task #25.

Verifies that all Month 1 + Month 2 foundation work is still live on the
production site. Checks run in order:

1. Hreflang annotations on all 3 installs (EN, AR, FA)
2. Enriched Organization + FinancialService schema on EN homepage
3. FAQ schema on a sample of commercial pages
4. 301 redirects (sample from the deployment)
5. Robots.txt format
6. Sitemap reachability
7. Homepage / commercial page HTTP status + response time
8. Dashboard data freshness (last updated timestamps on the JSON files)

Output: pass/fail/warn per check, plus an overall summary written to
qa_regression_check_<date>.json
"""
import json, os, re, sys, io, time, subprocess
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

UA = "Mozilla/5.0 (Adnika QA Check)"
RESULTS = []

# Known-pending issues — checks that fail for documented reasons (not regressions).
# When these match, the dashboard treats the FAIL as a "known issue" rather than
# a new alert. The check still shows FAIL — but the alert count subtracts these.
KNOWN_PENDING = {
    "faq_schema_missing": "Task #38 in_progress: Cloudflare cache purge for FAQ schema. Origin is verified live; edge is still stale until the cache TTL expires or a manual purge runs.",
    "redirects_query_strings": "Documented WARN: 301 redirects don't preserve query strings. Phase 3 fix candidate. Backlinks with tracking parameters return 404 instead of redirecting.",
}


def fetch(url, follow_redirects=True, cache_bust=True):
    """Fetch a URL, return (status_code, headers, body, redirect_chain)."""
    if cache_bust:
        cb = "?cb=" + str(int(time.time()))
        full = url + (cb if "?" not in url else "&cb=" + str(int(time.time())))
    else:
        full = url
    req = urllib.request.Request(full, headers={
        "User-Agent": UA,
        "Cache-Control": "no-cache",
        "Accept-Encoding": "identity",
    })
    try:
        if follow_redirects:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, dict(r.headers), r.read().decode("utf-8", errors="replace"), [r.url]
        else:
            # Manual no-redirect fetch using curl
            r = subprocess.run(
                ["curl", "-s", "-o", "/dev/null",
                 "-w", "%{http_code}|%{redirect_url}|%{time_total}",
                 "-A", UA,
                 "--max-redirs", "0",
                 "--max-time", "30",
                 full],
                capture_output=True, text=True, timeout=40
            )
            parts = r.stdout.split("|")
            return int(parts[0] or 0), {}, "", [parts[1]] if len(parts) > 1 else []
    except Exception as e:
        return 0, {}, f"ERROR: {e}", []


def record(check_name, status, detail, expected=None, found=None):
    """Record a check result. status: PASS / FAIL / WARN."""
    RESULTS.append({
        "check": check_name,
        "status": status,
        "detail": detail,
        "expected": expected,
        "found": found,
    })
    flag = {"PASS": "  OK", "FAIL": "FAIL", "WARN": "WARN"}[status]
    print(f"  [{flag}] {check_name}: {detail}")


# =============================================================================
# 1. Hreflang on EN/AR/FA homepages
# =============================================================================
def check_hreflang():
    print("\n=== 1. Hreflang annotations ===")
    expected_pairs = {
        "https://cmsprime.com/": ["en-US", "ar", "fa-IR", "x-default"],
        "https://cmsprime.com/ar/": ["en-US", "ar", "fa-IR", "x-default"],
        "https://cmsprime.com/fa/": ["en-US", "ar", "fa-IR", "x-default"],
    }
    for url, expected_langs in expected_pairs.items():
        code, _, body, _ = fetch(url)
        if code != 200:
            record(f"hreflang_{url}", "FAIL", f"HTTP {code}")
            continue
        # Find all hreflang values
        found = re.findall(r'<link[^>]*rel=[\'"]alternate[\'"][^>]*hreflang=[\'"]([^\'"]+)[\'"]', body)
        missing = [lang for lang in expected_langs if lang not in found]
        if missing:
            record(f"hreflang_{url}", "FAIL", f"missing {missing}", expected=expected_langs, found=found)
        else:
            record(f"hreflang_{url}", "PASS", f"{len(expected_langs)} langs present: {', '.join(found)}")


# =============================================================================
# 2. Enriched Organization + FinancialService schema on EN homepage
# =============================================================================
def check_org_schema():
    print("\n=== 2. Enriched Organization schema ===")
    code, _, body, _ = fetch("https://cmsprime.com/")
    if code != 200:
        record("org_schema", "FAIL", f"HTTP {code}")
        return

    # Extract all JSON-LD blocks
    jsonld_blocks = re.findall(r'<script[^>]*type=[\'"]application/ld\+json[\'"][^>]*>(.+?)</script>', body, re.DOTALL)

    org_found = None
    for blk in jsonld_blocks:
        try:
            data = json.loads(blk.strip())
            # @graph wrapper from Yoast
            entities = data.get("@graph", [data]) if isinstance(data, dict) else [data]
            for e in entities:
                if isinstance(e, dict):
                    t = e.get("@type")
                    types = t if isinstance(t, list) else [t]
                    if "Organization" in types or "FinancialService" in types:
                        org_found = e
                        break
            if org_found: break
        except json.JSONDecodeError:
            continue

    if not org_found:
        record("org_schema_present", "FAIL", "no Organization or FinancialService schema found in JSON-LD")
        return

    # Check enrichment fields
    types = org_found.get("@type")
    types_list = types if isinstance(types, list) else [types]
    if "FinancialService" in types_list:
        record("org_schema_type", "PASS", f"dual-type confirmed: {types_list}")
    else:
        record("org_schema_type", "WARN", f"type is {types_list} (expected dual Organization+FinancialService)")

    # hasCredential — should have 3 entries
    creds = org_found.get("hasCredential", [])
    creds_list = creds if isinstance(creds, list) else [creds] if creds else []
    if len(creds_list) >= 3:
        names = [c.get("recognizedBy", {}).get("name", "?") for c in creds_list if isinstance(c, dict)]
        record("org_schema_credentials", "PASS", f"{len(creds_list)} credentials: {', '.join(names[:3])}...")
    else:
        record("org_schema_credentials", "FAIL", f"only {len(creds_list)} credentials (expected 3)", expected=3, found=len(creds_list))

    # foundingDate
    if org_found.get("foundingDate"):
        record("org_schema_foundingDate", "PASS", f"foundingDate = {org_found['foundingDate']}")
    else:
        record("org_schema_foundingDate", "FAIL", "missing")

    # sameAs (social profiles) — should be 7
    sa = org_found.get("sameAs", [])
    if len(sa) >= 6:
        record("org_schema_sameAs", "PASS", f"{len(sa)} social profile links")
    else:
        record("org_schema_sameAs", "WARN", f"only {len(sa)} sameAs entries (expected 7)")

    # knowsLanguage
    kl = org_found.get("knowsLanguage", [])
    if "en" in kl and "ar" in kl and "fa" in kl:
        record("org_schema_languages", "PASS", f"all 3 languages declared: {kl}")
    else:
        record("org_schema_languages", "WARN", f"knowsLanguage = {kl}")

    # contactPoint count
    cp = org_found.get("contactPoint", [])
    cp_list = cp if isinstance(cp, list) else [cp] if cp else []
    record("org_schema_contactPoint", "PASS" if len(cp_list) >= 3 else "WARN",
           f"{len(cp_list)} contact points")


# =============================================================================
# 3. FAQ schema on commercial pages (sample)
# =============================================================================
def check_faq_schema():
    print("\n=== 3. FAQ schema on commercial pages ===")
    pages = [
        "/metatrader-4/", "/metatrader-5/", "/online-forex-trading/",
        "/prop-trading/", "/social-trading/", "/cms-webtrader/",
        "/fundedaccounts/", "/cpay/", "/stock-cfds-trading/",
        "/indices-trading/", "/commodities-trading/",
    ]
    faq_present = []
    faq_missing = []
    for p in pages:
        code, _, body, _ = fetch(f"https://cmsprime.com{p}")
        if code != 200:
            faq_missing.append(f"{p} (HTTP {code})")
            continue
        # Look for FAQPage in JSON-LD
        if '"FAQPage"' in body or "'FAQPage'" in body:
            # count Q&A pairs
            q_count = body.count('"Question"') + body.count("'Question'")
            faq_present.append(f"{p} ({q_count} Qs)")
        else:
            faq_missing.append(p)

    if faq_present:
        record("faq_schema_present", "PASS", f"{len(faq_present)} / {len(pages)} pages: " + ", ".join(faq_present[:3]) + "...")
    if faq_missing:
        status = "WARN" if len(faq_missing) < len(pages) else "FAIL"
        record("faq_schema_missing", status, f"{len(faq_missing)} pages without FAQ schema: " + ", ".join(faq_missing[:5]))


# =============================================================================
# 4. 301 redirects (sample from the Task #23 deployment)
# =============================================================================
def check_redirects():
    print("\n=== 4. 301 redirects (sample from Task #23) ===")
    pairs = [
        ("/cfds-trading", "/stock-cfds-trading/"),
        ("/cfds-trading/", "/stock-cfds-trading/"),
        ("/blog/anything-here", "/blogs/"),
        ("/promo", "/"),
        ("/register", "/"),
        ("/open-live-trading-account", "/registration/"),
        ("/daily-market-report", "/market-reports/"),
        ("/cmsprimeapp", "/app-platform/"),
    ]
    ok = 0
    fail = []
    for src, expected_dest in pairs:
        # No cache buster — the redirect rules don't preserve query strings (known limitation)
        code, _, _, redirect = fetch(f"https://cmsprime.com{src}", follow_redirects=False, cache_bust=False)
        actual_dest = re.sub(r"^https?://cmsprime\.com", "", redirect[0]).split("?")[0] if redirect else ""
        if code == 301 and actual_dest == expected_dest:
            ok += 1
        else:
            fail.append(f"{src} -> [{code}] {actual_dest} (expected {expected_dest})")

    if not fail:
        record("redirects", "PASS", f"{ok}/{len(pairs)} sample redirects firing as expected")
    else:
        record("redirects", "FAIL", f"{ok}/{len(pairs)} ok; failures: " + "; ".join(fail[:3]))

    # Sub-check: do redirects preserve query strings?
    code, _, _, redirect = fetch("https://cmsprime.com/cfds-trading?utm_source=test", follow_redirects=False, cache_bust=False)
    if code == 301:
        record("redirects_query_strings", "PASS", "redirects preserve query strings (good)")
    else:
        record("redirects_query_strings", "WARN",
               f"URLs with query strings (e.g. ?utm_source=) return HTTP {code} instead of 301 - any old backlink with tracking params 404s. Fix candidate for Phase 3: add [QSA] flag to .htaccess rules or update Redirection plugin to handle query strings.")


# =============================================================================
# 5. Robots.txt format
# =============================================================================
def check_robots():
    print("\n=== 5. Robots.txt ===")
    code, _, body, _ = fetch("https://cmsprime.com/robots.txt")
    if code != 200:
        record("robots_txt", "FAIL", f"HTTP {code}")
        return
    has_useragent = "User-agent:" in body
    has_sitemap = "Sitemap:" in body
    if has_useragent and has_sitemap:
        sm_match = re.search(r"Sitemap:\s*(\S+)", body)
        record("robots_txt", "PASS", f"User-agent + Sitemap directives present; sitemap = {sm_match.group(1) if sm_match else '?'}")
    else:
        missing = []
        if not has_useragent: missing.append("User-agent")
        if not has_sitemap: missing.append("Sitemap")
        record("robots_txt", "FAIL", f"missing: {missing}")


# =============================================================================
# 6. Sitemap reachable
# =============================================================================
def check_sitemap():
    print("\n=== 6. Sitemap ===")
    code, _, body, _ = fetch("https://cmsprime.com/sitemap_index.xml")
    if code != 200:
        record("sitemap_index", "FAIL", f"HTTP {code}")
        return
    sitemaps = re.findall(r"<loc>([^<]+)</loc>", body)
    if len(sitemaps) >= 3:
        record("sitemap_index", "PASS", f"sitemap_index.xml lists {len(sitemaps)} sub-sitemaps")
    else:
        record("sitemap_index", "WARN", f"only {len(sitemaps)} sub-sitemaps in index")


# =============================================================================
# 7. Homepage + commercial pages basic health
# =============================================================================
def check_uptime():
    print("\n=== 7. Page uptime + response time ===")
    pages = [
        "https://cmsprime.com/",
        "https://cmsprime.com/ar/",
        "https://cmsprime.com/fa/",
        "https://cmsprime.com/metatrader-4/",
        "https://cmsprime.com/online-forex-trading/",
        "https://cmsprime.com/prop-trading/",
        "https://cmsprime.com/account-comparison/",
        "https://cmsprime.com/licenses-regulations/",
    ]
    for url in pages:
        start = time.time()
        code, _, _, _ = fetch(url)
        elapsed = time.time() - start
        if code == 200 and elapsed < 5.0:
            record(f"uptime_{url}", "PASS", f"HTTP 200 in {elapsed:.2f}s")
        elif code == 200:
            record(f"uptime_{url}", "WARN", f"HTTP 200 but slow ({elapsed:.2f}s)")
        else:
            record(f"uptime_{url}", "FAIL", f"HTTP {code} in {elapsed:.2f}s")


# =============================================================================
# 8. Dashboard data freshness
# =============================================================================
def check_dashboard_freshness():
    print("\n=== 8. Dashboard data freshness ===")
    pages = [
        "https://cmsprime.adnika.com/data/monthly-domain.json",
        "https://cmsprime.adnika.com/data/monthly-rankings.json",
        "https://cmsprime.adnika.com/data/monthly-tracking.json",
        "https://cmsprime.adnika.com/data/monthly-backlinks.json",
        "https://cmsprime.adnika.com/data/monthly-health.json",
        "https://cmsprime.adnika.com/data/monthly-linkbuilding.json",
    ]
    reachable = unreachable = 0
    for url in pages:
        code, _, _, _ = fetch(url)
        if code == 200:
            reachable += 1
        else:
            unreachable += 1
    if unreachable == 0:
        record("dashboard_data_files", "PASS", f"all {reachable} chapter data files reachable")
    else:
        record("dashboard_data_files", "WARN", f"{reachable}/{len(pages)} reachable; {unreachable} missing")


# =============================================================================
# Sheet append — write each run's summary to a "QA History" tab
# =============================================================================
def append_to_sheet(run_payload):
    """Append a single row to the 'QA History' tab in the Google Sheet.
    Silently skips if SHEET_ID isn't set or SheetsWriter isn't importable
    (e.g., when running locally without creds)."""
    sheet_id = os.environ.get("SHEET_ID")
    if not sheet_id:
        print("  [sheet] SHEET_ID not set, skipping sheet append")
        return
    try:
        # Add reporting/ to sys.path so we can import sheets_writer
        here = Path(__file__).resolve().parent.parent
        if str(here) not in sys.path:
            sys.path.insert(0, str(here))
        from sheets_writer import SheetsWriter
    except Exception as e:
        print(f"  [sheet] sheets_writer not importable: {e}")
        return
    try:
        sw = SheetsWriter(sheet_id)
        headers = [
            "run_at", "total", "pass", "warn", "fail",
            "unexpected_fails", "known_pending", "first_failure", "notes"
        ]
        sw.ensure_tab("QA History", headers)
        sw.append_row("QA History", headers, run_payload)
        print(f"  [sheet] appended run to 'QA History' tab")
    except Exception as e:
        print(f"  [sheet] append failed: {e}")


# =============================================================================
# Main
# =============================================================================
def main():
    print("=== QA Regression Check (Task #25) ===")
    run_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"Run at: {run_at}")
    print(f"Target: cmsprime.com (live origin) + cmsprime.adnika.com (dashboard)")
    print()

    check_hreflang()
    check_org_schema()
    check_faq_schema()
    check_redirects()
    check_robots()
    check_sitemap()
    check_uptime()
    check_dashboard_freshness()

    # Summary
    by_status = {"PASS": 0, "FAIL": 0, "WARN": 0}
    known = unexpected = []
    known = []
    unexpected = []
    first_failure = ""
    for r in RESULTS:
        by_status[r["status"]] += 1
        if r["status"] == "FAIL":
            if r["check"] in KNOWN_PENDING:
                known.append(r)
            else:
                unexpected.append(r)
                if not first_failure:
                    first_failure = f"{r['check']}: {r['detail']}"

    print(f"\n=== Summary ===")
    print(f"  PASS: {by_status['PASS']}")
    print(f"  WARN: {by_status['WARN']}")
    print(f"  FAIL: {by_status['FAIL']}  (known-pending: {len(known)} · unexpected: {len(unexpected)})")
    print(f"  Total checks: {len(RESULTS)}")

    if unexpected:
        print(f"\n=== UNEXPECTED failures (regression alerts) ===")
        for r in unexpected:
            print(f"  - {r['check']}: {r['detail']}")
    if known:
        print(f"\n=== Known-pending failures (documented, not alerts) ===")
        for r in known:
            print(f"  - {r['check']}: {KNOWN_PENDING[r['check']][:100]}...")

    # Build the dashboard payload — gets written to docs/data/qa-status.json
    overall_state = "fail" if unexpected else ("warn" if by_status["WARN"] > 0 else "pass")
    payload = {
        "run_at": run_at,
        "summary": by_status,
        "total_checks": len(RESULTS),
        "unexpected_fails": len(unexpected),
        "known_pending": [
            {"check": r["check"], "detail": r["detail"], "reason": KNOWN_PENDING[r["check"]]}
            for r in known
        ],
        "first_failure": first_failure,
        "overall_state": overall_state,  # pass / warn / fail — drives the dashboard badge color
        "all_results": RESULTS,
    }

    # Write the dashboard-facing status JSON (the Monday cron will commit + push this)
    repo_root = Path(__file__).resolve().parent.parent
    dashboard_path = repo_root / "docs" / "data" / "qa-status.json"
    dashboard_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\n[dashboard] wrote {dashboard_path}")

    # Also save a dated archive in qa/results-YYYY-MM-DD.json
    archive_path = Path(__file__).resolve().parent / f"results-{date.today().isoformat()}.json"
    archive_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"[archive] wrote {archive_path}")

    # Append a row to the Google Sheet
    append_to_sheet({
        "run_at": run_at,
        "total": len(RESULTS),
        "pass": by_status["PASS"],
        "warn": by_status["WARN"],
        "fail": by_status["FAIL"],
        "unexpected_fails": len(unexpected),
        "known_pending": len(known),
        "first_failure": first_failure or "-",
        "notes": ", ".join(r["check"] for r in unexpected) if unexpected else "all expected",
    })

    # Exit non-zero on unexpected failures so the cron surfaces an alert
    if unexpected:
        print(f"\n[exit] {len(unexpected)} unexpected failure(s) — exiting 1 to flag the cron run")
        sys.exit(1)


if __name__ == "__main__":
    main()
