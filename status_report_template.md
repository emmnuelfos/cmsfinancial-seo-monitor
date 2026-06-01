# CMS Prime SEO — Weekly Status Report

**Reporting period:** WEEK_START → WEEK_END
**Prepared by:** Adnika SEO Team
**Project baseline:** 2026-06-01

---

## Executive summary

> One-paragraph plain-language summary of what changed this week, what was deployed, and the trajectory. Aim for 3-5 sentences. Skip jargon — this is what gets read first.

---

## Key metrics — this week vs baseline

| Metric | Baseline (Jun 1) | Last week | This week | Δ vs baseline | Trend |
|---|---:|---:|---:|---:|:---:|
| Semrush visibility % | 4.55% | — | — | — | — |
| Keywords ranking in top 100 | 4 of 31 | — | — | — | — |
| Avg position (tracked KW) | — | — | — | — | — |
| Indexed pages (EN sitemap) | 300 | — | — | — | — |
| Indexed pages (AR sitemap) | 262 | — | — | — | — |
| Indexed pages (FA sitemap) | 37 | — | — | — | — |
| Domain Authority (Moz) | 27 | — | — | — | — |
| Site Health (Semrush) | 72% | — | — | — | — |
| Core Web Vitals passing | 0% | — | — | — | — |
| Avg page fetch time | 1.04s | — | — | — | — |
| Backlinks (referring domains) | — | — | — | — | — |

**Source data:**
- Semrush: project "CMS Prime" → Position Tracking tab → export
- GSC: Performance → Search results → date range
- DA / Site Health: Semrush Domain Overview
- CWV: search.google.com/search-console → Core Web Vitals
- Avg fetch time + technical health: automated via `weekly_monitor.py`

---

## Ranking movement — top commercial keywords

> Pull this from Semrush Position Tracking. Show only keywords with movement (don't list the ones still at 0).

| Keyword | Last week pos | This week pos | Δ | Landing page |
|---|---:|---:|---:|---|
| cms prime | 1 | 1 | — | / |
| pamm forex trading | — | — | — | /blogs/pamm-account/ |

**Keywords newly entering top 100 this week:** —
**Keywords lost from top 100 this week:** —

---

## What we deployed this week

> Bullet list of every change shipped (FTP, GSC, content edits). Each item: what + impact + where it was deployed.

- (example) Deployed enriched Organization schema via Yoast filter on EN/AR/FA installs — adds 3 regulatory licenses (FSC GB19024331, SVG 3060 LLC 2023, Saint Lucia 2023-00661) + 7 social profiles + contact points. Affects all 599 indexable pages. Files: `/wp-content/themes/hello-elementor-child/functions.php`, `/ar/.../functions.php`, `/fa/.../hub-child/functions.php`.

---

## Issues discovered

| Issue | Severity | Pages affected | Plan |
|---|---|---:|---|
| (example) 250+ images per page missing width/height attrs | High | 5 commercial pages | Auto-inject via PHP filter — pending |
| | | | |

---

## Backlinks acquired this week

> Manual entry — pull from Semrush Backlink Analytics weekly delta.

- (none yet)

**Total referring domains:** —
**New referring domains this week:** —
**Lost referring domains:** —

---

## Content shipped this week

> List blog posts, expanded pages, new landing pages.

- (none this week)

---

## What's coming next week

> 3-5 bullets on planned work + who owns it.

- (e.g.) Deploy Phase B Core Web Vitals fixes (resource hints, lazy loading, LCP preload) — owner: Adnika dev
- (e.g.) Draft content expansion brief for /metatrader-4/ and /metatrader-5/ — owner: copywriter
- (e.g.) Pull Semrush backlink CSV for 404-equity recovery analysis — owner: client

---

## Risks / blockers

> Anything stuck or needing decisions.

- (e.g.) GSC API service account permission still rejecting — manual GSC actions required for now.
- (e.g.) PageSpeed Insights API quota = 0 without API key — using static HTML analysis instead.

---

## Appendix: data files for this report

- `kpi_tracker.csv` — multi-week trend data
- `audit_YYYY-MM-DD.json` — full technical audit snapshot
- `baseline_2026-06-01.md` — locked-in starting point

---
