# CMS Prime SEO Reporting

Automated weekly monitoring + Google Sheets push + Looker Studio dashboard for cmsprime.com.

**Stack:** Python script → Semrush API + technical audit → Google Sheet → Looker Studio dashboard → client.

**Schedule:** Runs every Monday at 09:00 UTC (13:00 Dubai) via GitHub Actions.

---

## What it does each Monday

| Step | Source | Destination |
|---|---|---|
| 1 | Fetch sitemap URL counts (EN/AR/FA) | `Auto - Weekly KPIs` (one row appended) |
| 2 | Test the 10 phantom-slug 301 redirects from April 2026 fix | `Auto - Phantom Redirects` (replace) |
| 3 | Audit 6 sample pages (hreflang, canonical, schema, CWV risk) | `Auto - Page Health` (replace) |
| 4 | Pull Semrush domain overview (UAE database) | `Auto - Weekly KPIs` (same row) |
| 5 | Pull top 50 organic ranking keywords from Semrush | `Auto - Keyword Rankings` (replace) |
| 6 | Pull backlinks overview from Semrush | `Auto - Weekly KPIs` (same row) |
| 7 | Pull top 100 referring domains from Semrush | `Auto - Top Referring Domains` (replace) |
| 8 | Archive full JSON snapshot to GitHub Actions artifacts | retained 90 days |

**Total Semrush API units per run:** ~4,300 (out of 50,000/mo budget — sustainable for years).

---

## Files in this folder

| File | Purpose |
|---|---|
| `monitor.py` | Main orchestrator — runs the full weekly pipeline |
| `semrush_client.py` | Semrush API wrapper |
| `sheets_writer.py` | Google Sheets writer module |
| `kpi_tracker.csv` | Local KPI tracker fallback (regenerated each run, gitignored) |
| `audit_YYYY-MM-DD.json` | Per-run full archive (gitignored, written to local + GHA artifacts) |
| `monitor_run.log` | Latest run console output (gitignored) |
| `status_report_template.md` | Manual narrative status report template |
| `.github/workflows/weekly.yml` | GitHub Actions cron config |

---

## First-time deployment (one-off setup)

### A. Push code to a private GitHub repo

```powershell
cd "D:\Claude Code Project\cmsprime-audit\reporting"
gh repo create adnika/cmsprime-seo-monitor --private --source=. --remote=origin
git add .
git commit -m "Initial weekly SEO monitor"
git push -u origin main
```

(If `gh` isn't logged in: `gh auth login` first.)

### B. Add the 3 secrets in GitHub

Repo → Settings → Secrets and variables → Actions → New repository secret. Add:

| Secret name | Value |
|---|---|
| `SEMRUSH_API_KEY` | Your Semrush API key |
| `SHEET_ID` | `1vV_xTnRtmbVx4FtNtl3J7bTUTIK1e7bShhHCCJSsVqc` |
| `GSC_CREDS_JSON` | Paste the entire contents of `cmsprime-gsc-creds.json` (all JSON) |

### C. Enable Actions + run once manually

1. Repo → Actions tab → "I understand my workflows, go ahead and enable them"
2. Click the workflow "CMS Prime weekly SEO monitor"
3. Click "Run workflow" → "Run workflow" (green button) to verify everything works
4. Watch the run; if green, you're done — it'll auto-run every Monday from now on.

### D. Build the Looker Studio dashboard

1. Go to [lookerstudio.google.com](https://lookerstudio.google.com)
2. Sign in with `Support@adnika.com`
3. Create → Blank report
4. Add data → Google Sheets → CMS Prime - SEO & Content Tracker
5. Select each `Auto - *` tab as a separate data source
6. Build charts (suggested below)
7. File → Share → "Anyone with the link" → Viewer
8. Copy share link → send to client

### Suggested dashboard layout

**Page 1: Executive summary**
- Scorecard: Semrush visibility % (from `Auto - Weekly KPIs`)
- Scorecard: Total ranking keywords (UAE)
- Scorecard: Referring domains count
- Scorecard: Authority Score
- Time-series chart: visibility % over time (date on X, value on Y)
- Time-series chart: indexed pages over time (3 lines: EN/AR/FA)

**Page 2: Rankings detail**
- Table from `Auto - Keyword Rankings` — keyword, position, volume, URL
- Filter by position range
- Highlight movers (position vs previous)

**Page 3: Backlinks**
- Time-series: total backlinks + referring domains
- Table from `Auto - Top Referring Domains` — sort by Domain Authority

**Page 4: Technical health**
- Scorecard: phantom 301s firing (e.g. 10/10)
- Scorecard: pages with hreflang
- Scorecard: pages with credential schema
- Table from `Auto - Page Health`

---

## Weekly workflow for Adnika team (after this is set up)

**Monday morning (~10 min total):**

1. Open the Google Sheet — confirm `Auto - Weekly KPIs` got a new row (cron ran successfully)
2. Open the Looker Studio dashboard — verify charts updated
3. Open `status_report_template.md` → copy → fill in:
   - Executive summary (~3 sentences on what changed this week)
   - "What we deployed this week" section
   - "Coming next week" section
4. Email the status report + dashboard link to the client

**That's it.** All numbers come from Sheets automatically.

If GitHub Actions failed (red X in the Actions tab), check the run log — the error is usually a Semrush quota issue or transient HTTP timeout, both retriable.

---

## Local development / manual run

To run the monitor from your own PC instead of GitHub Actions:

```powershell
cd "D:\Claude Code Project\cmsprime-audit\reporting"
python monitor.py                       # run for today UTC
python monitor.py --date 2026-06-15     # backdate
python monitor.py --skip-sheets         # local only, no Sheets push
python monitor.py --skip-semrush        # technical audit only, no Semrush API spend
```

`.env` is loaded automatically from `D:\Claude Code Project\cmsprime-audit\.env`.

## Sharing with the client

**Best option:** Looker Studio dashboard link (read-only). Client opens any browser, sees live data.

**Backup option:** Share the Google Sheet itself with viewer permission. They can see raw `Auto -` tabs and use the existing project tabs (Dashboard, SEO Master Tasks, etc.) alongside.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| GitHub Actions run fails with `SEMRUSH_API_KEY not set` | Secret missing or misnamed | Re-add the secret in repo settings |
| Sheet says "permission denied" | Service account dropped from share | Re-share sheet with `cmsprime-seo-bot@healthy-mender-498105-v7.iam.gserviceaccount.com` as Editor |
| Semrush returns empty | API units exhausted | Check `https://www.semrush.com/users/countapiunits.html?key=<KEY>` — wait for monthly reset or top up |
| `pages_with_org_schema` drops below 6 | Yoast filter unregistered after WP update | Re-check `functions.php` on the affected install via FTP |
| Phantom redirects show FAIL | `.htaccess` overwritten by plugin | Restore from `D:\Claude Code Project\cmsprime-audit\backups\` |

## Data lineage

```
GitHub Actions cron (Mon 09:00 UTC)
    │
    ├─► monitor.py
    │      ├─► technical_audit (sitemap, on-page audit, phantom 301s)
    │      └─► semrush_client (domain ranks, organic kw, backlinks)
    │
    ├─► Google Sheet "CMS Prime - SEO & Content Tracker"
    │      ├─► Auto - Weekly KPIs        (one row appended)
    │      ├─► Auto - Keyword Rankings   (snapshot replace)
    │      ├─► Auto - Top Referring Domains (snapshot replace)
    │      ├─► Auto - Page Health        (snapshot replace)
    │      └─► Auto - Phantom Redirects  (snapshot replace)
    │
    ├─► audit_YYYY-MM-DD.json (GitHub Actions artifact, 90-day retention)
    │
    └─► Looker Studio dashboard (reads from Sheet)
            └─► Client share link (view-only)
```

---

## What this does NOT include (open items)

- **Email digest** — could be added later via SendGrid in the workflow. ~30 min build.
- **Slack notifications** — could ping a channel when the run completes. ~15 min.
- **CWV automation** — PageSpeed Insights API is quota-blocked; tracked via static audit + manual GSC review.
- **Index Coverage / search analytics** — requires GSC API access, which is currently blocked by service account permission issue.
