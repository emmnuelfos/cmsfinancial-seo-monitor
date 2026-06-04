"""Build the Monthly Report data file for the dashboard.

Reads:
  - SEO Master Tasks tab (status, category, hours, month per task)
  - docs/data/kpis.json (existing weekly KPI snapshots — no new Semrush calls)
  - docs/data/meta.json (last-refreshed date)

Writes:
  - docs/data/monthly.json — what the monthly-report.html page consumes

Run weekly via the same cron as monitor.py, or anytime tasks change.
This script makes NO external API calls (no Semrush, no GSC). Sheet read only.
"""
import os, json, sys, io
from datetime import datetime, date
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HERE = Path(__file__).parent
DATA_DIR = HERE / "docs" / "data"

# Load .env so sheets_writer can find creds
env = HERE.parent / ".env"
if env.exists():
    for line in env.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

from sheets_writer import SheetsWriter

# ---- Deployment log — what was actually shipped per month ----
# Hand-curated. Each item is a real, verifiable change with a date and impact tier.
# This is the source of truth for the "What was deployed" section.
DEPLOYMENTS = {
    "Month 1": [
        {"date": "2026-04-20", "title": "Phantom slug 301s in .htaccess", "detail": "10 commonly-searched-but-missing slugs (mt4-trading-platform, cfd-trading, etc.) now redirect to real pages so ranking signals land correctly.", "impact": "high", "category": "Technical"},
        {"date": "2026-04-21", "title": "Duplicate title tags fixed", "detail": "8 pages had identical titles; each now has a unique, descriptive title tag.", "impact": "med", "category": "Technical"},
        {"date": "2026-04-22", "title": "Missing H1 tags added", "detail": "10 pages were missing H1 headings; each got a single, keyword-aligned H1.", "impact": "med", "category": "Technical"},
        {"date": "2026-04-23", "title": "Meta descriptions completed", "detail": "11 pages had no meta description; each now has a 140-160 char CTR-optimized description.", "impact": "med", "category": "Technical"},
        {"date": "2026-04-24", "title": "robots.txt formatting fix", "detail": "Removed malformed directives, added proper Sitemap line.", "impact": "low", "category": "Technical"},
        {"date": "2026-04-25", "title": "63 internal broken links repaired", "detail": "Audit found 63 internal links pointing at 404s — all updated to live URLs.", "impact": "med", "category": "Technical"},
    ],
    "Month 2": [
        {"date": "2026-06-01", "title": "Hreflang on all 3 installs", "detail": "EN /, AR /ar, FA /fa each emit proper hreflang annotations via child-theme functions.php. Resolves the multilingual indexing fragmentation that was costing rankings.", "impact": "high", "category": "Technical"},
        {"date": "2026-06-01", "title": "Enriched Organization + FinancialService schema", "detail": "Yoast graph filter extended with sameAs (7 socials), 5 contactPoint entries, 3 regulatory credentials (FSC GB19024331, SVG 3060 LLC 2023, Saint Lucia 2023-00661). Stronger E-E-A-T signals.", "impact": "high", "category": "Technical"},
        {"date": "2026-06-02", "title": "Phantom 301 verification", "detail": "All 10 phantom redirects re-tested live and confirmed firing — they survived two month-end cache rebuilds.", "impact": "low", "category": "Technical"},
        {"date": "2026-06-02", "title": "Top SEO article #1 published", "detail": "Commercial-intent article targeting a Tier 1 keyword cluster. Internal links connected.", "impact": "med", "category": "Content"},
        {"date": "2026-06-03", "title": "Top SEO article #2 published", "detail": "Second commercial-intent article. Linked from related-topic pages.", "impact": "med", "category": "Content"},
        {"date": "2026-06-03", "title": "Backlink audit + disavow (Task #23)", "detail": "Pulled 430+ backlinks from Semrush, tested every target URL, generated 54 new disavow entries, merged with existing 532 → 586 spam domains submitted to Google. Toxic link drag stops.", "impact": "high", "category": "Link Building"},
        {"date": "2026-06-03", "title": "301 recovery for broken backlink targets", "detail": "40 backlinks pointed at 404 URLs. Created 18 redirect rules via Redirection plugin to recover their equity.", "impact": "med", "category": "Link Building"},
        {"date": "2026-06-04", "title": "FAQ schema on 11 commercial pages (Task #18)", "detail": "76 Q&As pulled from existing visible accordion content, wrapped in FAQPage JSON-LD via child theme. Schema matches on-page content per Google's same-content rule. AI Overviews and rich-result eligibility unlocked.", "impact": "high", "category": "Content"},
    ],
}

# ---- Helpers ----

def status_normalize(s):
    s = (s or "").strip().lower()
    if s in ("complete", "completed", "done"): return "complete"
    if s in ("in progress", "in-progress"): return "in_progress"
    if s in ("not started", "pending", ""): return "not_started"
    return "not_started"

def month_key(s):
    # "Month 1" -> "Month 1"
    s = (s or "").strip()
    return s if s.startswith("Month ") else "Unassigned"

def impact_score(impact):
    return {"high": 3, "med": 2, "low": 1}.get(impact, 0)

# ---- Main ----

def main():
    sheet_id = os.environ.get("SHEET_ID")
    if not sheet_id:
        print("FATAL: SHEET_ID not in environment", file=sys.stderr)
        sys.exit(1)

    w = SheetsWriter(sheet_id)
    rows = w.get_tab_values("SEO Master Tasks", "A:H")

    # Header row is at index 2 (R3); tasks at index 3+ (R4+)
    HEADER_ROW = 2
    tasks = []
    for raw in rows[HEADER_ROW + 1:]:
        if not raw or not raw[0] or not raw[0].strip().isdigit():
            continue
        # Columns: A=#, B=Task, C=Category, D=Hours, E=Month, F=Status, G=Progress, H=Notes
        def col(i, default=""):
            return raw[i].strip() if i < len(raw) and raw[i] else default
        tasks.append({
            "id": int(col(0)),
            "task": col(1),
            "category": col(2) or "Other",
            "hours": float(col(3)) if col(3).replace(".", "", 1).isdigit() else 0,
            "month": month_key(col(4)),
            "status": status_normalize(col(5)),
            "progress": col(6),
            "notes": col(7),
        })

    print(f"Read {len(tasks)} tasks from sheet")

    # ---- Build per-month rollup ----
    months = {}
    for t in tasks:
        m = t["month"]
        if m not in months:
            months[m] = {
                "month": m,
                "tasks_total": 0, "tasks_complete": 0, "tasks_in_progress": 0,
                "hours_total": 0, "hours_complete": 0,
                "categories": {},
                "complete_list": [],
                "open_list": [],
            }
        d = months[m]
        d["tasks_total"] += 1
        d["hours_total"] += t["hours"]
        if t["status"] == "complete":
            d["tasks_complete"] += 1
            d["hours_complete"] += t["hours"]
            d["complete_list"].append({"id": t["id"], "task": t["task"], "category": t["category"], "hours": t["hours"]})
        elif t["status"] == "in_progress":
            d["tasks_in_progress"] += 1
            d["open_list"].append({"id": t["id"], "task": t["task"], "category": t["category"], "status": "in_progress"})
        else:
            d["open_list"].append({"id": t["id"], "task": t["task"], "category": t["category"], "status": "not_started"})

        cat = t["category"]
        if cat not in d["categories"]:
            d["categories"][cat] = {"total": 0, "complete": 0}
        d["categories"][cat]["total"] += 1
        if t["status"] == "complete":
            d["categories"][cat]["complete"] += 1

    # Convert categories dict to list, compute pct
    for m, d in months.items():
        cats = []
        for cat, vals in d["categories"].items():
            pct = round(100 * vals["complete"] / vals["total"]) if vals["total"] else 0
            cats.append({"name": cat, "complete": vals["complete"], "total": vals["total"], "pct": pct})
        cats.sort(key=lambda c: c["total"], reverse=True)
        d["categories"] = cats
        d["pct_complete"] = round(100 * d["tasks_complete"] / d["tasks_total"]) if d["tasks_total"] else 0

    # ---- Pick "current" and "previous" months ----
    today = date(2026, 6, 4)  # use a fixed reference since Date.now() isn't deterministic here
    # Month 1 = first month of engagement, Month 2 = second, etc.
    # Sort month keys by their natural order
    month_keys = sorted([m for m in months.keys() if m.startswith("Month ")],
                       key=lambda m: int(m.split()[1]))
    current_month = month_keys[-1] if month_keys else "Month 1"
    prev_month = month_keys[-2] if len(month_keys) >= 2 else None

    # ---- Attach deployment log ----
    for m, d in months.items():
        d["deployments"] = DEPLOYMENTS.get(m, [])
        # Sort deployments by impact (high first), then date
        d["deployments"].sort(key=lambda x: (-impact_score(x.get("impact", "")), x.get("date", "")))

    # ---- Load KPI snapshot ----
    kpis_path = DATA_DIR / "kpis.json"
    kpi_rows = []
    if kpis_path.exists():
        kpi_rows = json.loads(kpis_path.read_text(encoding="utf-8")).get("rows", [])

    latest_kpi = kpi_rows[-1] if kpi_rows else {}
    previous_kpi = kpi_rows[-2] if len(kpi_rows) >= 2 else None

    # Build "KPI cards" — current value + delta if a prior snapshot exists
    KPI_DEFS = [
        ("organic_keywords_ae", "semrush_organic_kw_ae", "Organic keywords (UAE)", "kw"),
        ("organic_traffic_ae", "semrush_organic_traffic_ae", "Est. monthly traffic", "tr"),
        ("referring_domains", "semrush_referring_domains", "Referring domains", "rd"),
        ("authority_score", "semrush_ascore", "Authority Score", "as"),
        ("indexed_pages_total", None, "Pages indexed (EN+AR+FA)", "ix"),  # computed below
        ("backlinks_total", "semrush_total_backlinks", "Total backlinks", "bl"),
    ]
    kpi_cards = []
    for key, src_key, label, short in KPI_DEFS:
        if src_key is None and key == "indexed_pages_total":
            val = (latest_kpi.get("sitemap_en_count", 0)
                   + latest_kpi.get("sitemap_ar_count", 0)
                   + latest_kpi.get("sitemap_fa_count", 0))
            prev_val = None
            if previous_kpi:
                prev_val = (previous_kpi.get("sitemap_en_count", 0)
                            + previous_kpi.get("sitemap_ar_count", 0)
                            + previous_kpi.get("sitemap_fa_count", 0))
        else:
            val = latest_kpi.get(src_key, 0) if src_key else 0
            prev_val = previous_kpi.get(src_key) if previous_kpi and src_key else None
        delta = None
        delta_pct = None
        if prev_val is not None and prev_val != 0:
            delta = val - prev_val
            delta_pct = round(100 * delta / prev_val, 1)
        kpi_cards.append({
            "key": key, "short": short, "label": label,
            "value": val, "prev": prev_val,
            "delta": delta, "delta_pct": delta_pct,
        })

    # ---- Expected impact timeline (educational, important for client expectations) ----
    timeline = [
        {"window": "3 to 14 days", "label": "Schema recrawl", "detail": "Google fetches updated structured data on its next crawl of each page. New FAQ markup, hreflang, and Organization schema start being read into the index. No ranking shift yet — Google just reading the new signals."},
        {"window": "2 to 4 weeks", "label": "Indexing settles", "detail": "Pages with new content (the 2 new articles, expanded thin pages) finish indexing. Hreflang clusters get recognized — Google stops treating EN/AR/FA versions as competing for the same query."},
        {"window": "4 to 8 weeks", "label": "First ranking lifts", "detail": "Disavow file gets processed in Google's algorithmic review. Toxic link drag releases. Phantom 301s consolidate their parent pages' equity. Expect movement on the 27 keywords currently outside top 20."},
        {"window": "8 to 12 weeks", "label": "Compounding effect", "detail": "Schema rich results start appearing in SERPs (FAQ accordions under listings, Organization knowledge panel). Click-through-rate lifts feed back into rankings. Authority Score expected to move from 27 toward 30+."},
    ]

    # ---- Final payload ----
    out = {
        "generated_at": today.isoformat(),
        "current_month": current_month,
        "previous_month": prev_month,
        "months": months,
        "kpi_cards": kpi_cards,
        "kpi_snapshot_date": latest_kpi.get("date"),
        "timeline": timeline,
        "totals": {
            "all_tasks": sum(d["tasks_total"] for d in months.values()),
            "all_complete": sum(d["tasks_complete"] for d in months.values()),
            "all_hours_budget": sum(d["hours_total"] for d in months.values()),
            "all_hours_spent": sum(d["hours_complete"] for d in months.values()),
        },
    }
    out["totals"]["pct"] = round(100 * out["totals"]["all_complete"] / out["totals"]["all_tasks"]) if out["totals"]["all_tasks"] else 0

    out_path = DATA_DIR / "monthly.json"
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out_path}")
    print(f"  Current month: {current_month}")
    print(f"  Tasks complete this month: {months[current_month]['tasks_complete']}/{months[current_month]['tasks_total']}")
    print(f"  Deployments this month: {len(months[current_month]['deployments'])}")
    print(f"  Total file size: {out_path.stat().st_size:,} bytes")

if __name__ == "__main__":
    main()
