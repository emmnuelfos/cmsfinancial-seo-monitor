# CMS Prime SEO — Looker Studio Dashboard Build Guide

Click-by-click guide to build the client-facing dashboard from your Google Sheet data.

**You'll need:** the Google account `Support@adnika.com` (verified GSC owner) and ~30 minutes.

---

## Pre-flight check

Open the tracker sheet once before starting — confirm these 5 tabs exist and have data:
- ✅ `Auto - Weekly KPIs`
- ✅ `Auto - Keyword Rankings`
- ✅ `Auto - Top Referring Domains`
- ✅ `Auto - Page Health`
- ✅ `Auto - Phantom Redirects`

If they're not there, run the monitor first (or wait for next Monday 09:00 UTC).

---

## Step 1 — Open Looker Studio and create the report (2 min)

1. Go to **[lookerstudio.google.com](https://lookerstudio.google.com)**
2. Sign in with `Support@adnika.com`
3. Top-left → **Create** → **Report**
4. The "Add data" panel opens automatically. Search for **Google Sheets** → click the Google Sheets connector

### Connect data source 1 — Weekly KPIs

5. **Spreadsheet:** type or paste: `CMS Prime - SEO & Content Tracker`
6. **Worksheet:** select `Auto - Weekly KPIs`
7. **Options:** ✅ "Use first row as headers" — leave checked
8. Click **Add** (bottom-right) → confirm the field types Looker auto-detected (most should be Numbers; `date` should be **Date**)
9. The blank report opens with the data source attached. Rename the report (top-left): `CMS Prime SEO Dashboard`

---

## Step 2 — Add the other 4 data sources (5 min)

In the report toolbar: **Resource → Manage added data sources → + Add a data source**

Repeat for each:

| Data source name | Source | Worksheet |
|---|---|---|
| Weekly KPIs | Google Sheets | `Auto - Weekly KPIs` (already added) |
| Keyword Rankings | Google Sheets | `Auto - Keyword Rankings` |
| Top Referring Domains | Google Sheets | `Auto - Top Referring Domains` |
| Page Health | Google Sheets | `Auto - Page Health` |
| Phantom Redirects | Google Sheets | `Auto - Phantom Redirects` |

For each one, leave the defaults and click **Add**.

After all 5 are connected, click **Done** to close the data sources panel.

---

## Step 3 — Page 1: Executive Summary (10 min)

This is the page the client opens first. It should answer: *"how are we doing right now, and what's the trend?"*

### 3a. Add the page title

1. Top toolbar → **Insert → Text**
2. Drag a text box across the top of the canvas (full width)
3. Type: `CMS Prime SEO — Weekly Performance Dashboard`
4. Format (right panel): font size 28, bold, color `#1a73e8` (Google blue)

### 3b. Add a "Last updated" date stamp

5. Insert → **Text** → smaller box below the title
6. Format → click in box, type then add a **Calculated field**
   - Actually simpler: just add a Scorecard:
   - Insert → **Scorecard** → drop in top-right
   - Data source: **Weekly KPIs**
   - Metric: **date** → click the metric → set aggregation to **Max**
   - Label: "Last updated"

### 3c. The 4 hero scorecards (top row)

Drag 4 Scorecards across the top of the page. For each, configure as follows:

| # | Data source | Metric | Aggregation | Label | Color |
|---|---|---|---|---|---|
| 1 | Weekly KPIs | `semrush_organic_kw_ae` | Max (latest) | **Organic keywords (UAE)** | Green if up |
| 2 | Weekly KPIs | `semrush_organic_traffic_ae` | Max | **Estimated traffic** | Green if up |
| 3 | Weekly KPIs | `semrush_referring_domains` | Max | **Referring domains** | Green if up |
| 4 | Weekly KPIs | `semrush_ascore` | Max | **Authority Score** | Green if up |

How to configure each:
1. Click the scorecard
2. Right panel → **SETUP** tab → drag the field name from the available-fields list into the **Metric** slot
3. Click the metric chip → set **Aggregation** to **Max**
4. Type the label in the **Optional metric name** field
5. **STYLE** tab → enable "Show comparison" → set comparison to "Previous period" → this makes the up/down arrow appear

### 3d. Time-series chart — visibility trend

6. Insert → **Time series chart** → place below the scorecards, full width, about 250px tall
7. Data source: **Weekly KPIs**
8. **Dimension:** `date`
9. **Breakdown dimension:** (leave empty)
10. **Metric:** drag in `semrush_organic_kw_ae` AND `semrush_organic_traffic_ae` (you can stack multiple)
11. **STYLE tab:** set series colors — keywords in blue, traffic in green
12. **Style tab → Background and border:** add a subtle shadow

### 3e. Time-series chart — indexation across languages

13. Insert → another **Time series chart** → place to the right, half-width
14. Data source: **Weekly KPIs**
15. **Dimension:** `date`
16. **Metrics:** add `sitemap_en_count`, `sitemap_ar_count`, `sitemap_fa_count` (3 separate lines)
17. **STYLE:** name them "EN pages", "AR pages", "FA pages"
18. Set colors: EN=blue, AR=orange, FA=green

### 3f. Health summary card (bottom)

19. Insert → **Table** → place below the time-series charts
20. Data source: **Weekly KPIs**
21. **Dimensions:** `date`
22. **Metrics:**
    - `phantom_301s_ok` (label: "Redirects firing")
    - `pages_with_hreflang_3plus` (label: "Hreflang OK")
    - `pages_with_org_schema` (label: "Org schema OK")
    - `pages_with_credentials` (label: "Credentials in schema")
    - `avg_html_kb` (label: "Avg page weight KB")
    - `avg_fetch_time_s` (label: "Avg fetch time s")
23. Sort: date descending
24. Show only the last 8 rows: STYLE → Pagination → Rows per page: 8

---

## Step 4 — Page 2: Keyword Rankings (5 min)

1. Bottom of canvas: **Add Page** → name it `Keyword Rankings`

### 4a. Position distribution

Insert → **Pie chart** OR **Bar chart**
- Data source: **Keyword Rankings**
- Dimension: create a calculated field: `Position bucket` =
  ```
  CASE
    WHEN Position <= 3 THEN "1-3"
    WHEN Position <= 10 THEN "4-10"
    WHEN Position <= 30 THEN "11-30"
    WHEN Position <= 100 THEN "31-100"
    ELSE "100+"
  END
  ```
  How: Resource → Manage added data sources → Edit Keyword Rankings → Add field → name "Position bucket" → formula above
- Metric: `Record Count` (count of keywords in each bucket)

### 4b. Full ranking table

Insert → **Table** (or **Pivot table** if you prefer grouped view)
- Data source: **Keyword Rankings**
- Dimensions: `Keyword`, `URL`
- Metrics: `Position`, `Search Volume`, `CPC`, `Traffic (%)`
- Sort: `Traffic (%)` descending
- Style: rows striped, headers bold
- Pagination: 50 rows per page

### 4c. Top movers (optional, requires "Previous position" data after week 2+)

Once you have multiple weeks of data:
- Insert another table
- Add calculated field `Movement` = `Position - "Previous position"`
- Sort by Movement (negative = improved)
- Show top 10

---

## Step 5 — Page 3: Backlinks (3 min)

1. Add Page → `Backlinks`

### 5a. Backlinks trend

Time series → **Weekly KPIs** →
- Dimension: `date`
- Metrics: `semrush_total_backlinks`, `semrush_referring_domains` (2 separate Y-axes if possible)
- Style: dual axis if Looker version supports it; otherwise stack

### 5b. Follow vs Nofollow split

Insert → **Pie chart**
- Data source: **Weekly KPIs**
- Dimension: (none — using metric values directly)
- Actually: use a **Bar chart** with dimension = "Type" (create calculated field) — easier:
  - Just use a Scorecard showing the latest values of `semrush_follow_links` and `semrush_nofollow_links` side by side

### 5c. Top referring domains table

Insert → **Table**
- Data source: **Top Referring Domains**
- Dimensions: `Domain`, `Country`
- Metrics: `Domain Authority`, `Backlinks`, `First seen`, `Last seen`
- Sort: `Domain Authority` descending
- Filter: optional — show only DA ≥ 20 to filter out spam

---

## Step 6 — Page 4: Technical Health (3 min)

1. Add Page → `Technical Health`

### 6a. Health scorecards

Row of 4 scorecards at the top:

| Metric | Label |
|---|---|
| Weekly KPIs → `phantom_301s_ok` (max) / `phantom_301s_total` (max) | "Phantom 301s firing" |
| Weekly KPIs → `pages_with_org_schema` | "Pages with Org schema" |
| Weekly KPIs → `pages_with_credentials` | "Pages with regulatory credentials" |
| Weekly KPIs → `avg_imgs_no_dims` | "Avg images missing dimensions" |

### 6b. Phantom redirect detail table

Insert → **Table**
- Data source: **Phantom Redirects**
- Dimensions: `Source`, `Destination`, `Expected`
- Metrics: `HTTP code` (set aggregation to "None"), `OK`
- Filter: latest date only (use date filter at page level)

### 6c. Page Health table

Insert → **Table**
- Data source: **Page Health**
- Dimensions: `URL`
- Metrics: `Fetch (s)`, `Size (KB)`, `Hreflang count`, `Org schema`, `Credentials`, `Images no dims`, `Images no lazy`
- Conditional formatting (Style tab):
  - `Hreflang count` < 3 → red
  - `Org schema` = "N" → red
  - `Size (KB)` > 700 → orange
  - `Images no dims` > 100 → red

---

## Step 7 — Date range control (1 min)

Add a date range filter to the whole report so the client can change the time window:

1. Top toolbar → **Insert → Date range control**
2. Place at the top-right of Page 1
3. Default: Last 30 days
4. This will affect all charts using `date` as a dimension

---

## Step 8 — Style polish (5 min)

### Branding

1. Top toolbar → **Theme and layout** → Theme tab
2. Pick a theme or customize:
   - Background: `#FFFFFF` or `#F8F9FA`
   - Primary color: pull from CMS Prime brand if you have it, else `#1a73e8`
   - Accent: `#34A853` (green for positive metrics)
3. Layout: ensure canvas size is **Full screen** or **16:9**

### Header on every page

4. On Page 1, copy the title text box
5. Paste on every page → edit the text to reflect that page (`CMS Prime SEO — Keyword Rankings`, etc.)

### Footer

6. Add a text box at the bottom: `Data refreshes automatically every Monday at 09:00 UTC. Powered by Adnika.`

---

## Step 9 — Share with the client (1 min)

1. Top-right → **Share** button
2. Three options:
   - **Get link** → set to "Anyone with the link" → "Viewer" → Copy
   - **Schedule email delivery** → optional, send weekly PDF to client email
   - **Add people** → invite by email (more restrictive, recommended for confidential dashboards)
3. Send the link

**The dashboard auto-updates** because it's connected to the live Google Sheet. Every Monday after GitHub Actions runs, the dashboard reflects the new data.

---

## What it looks like when done

- **Page 1 (Executive Summary):** Big numbers + trend lines — the "is it working?" page
- **Page 2 (Keyword Rankings):** Distribution + full keyword table — "what's ranking?"
- **Page 3 (Backlinks):** Trend + top domains — "is authority growing?"
- **Page 4 (Technical Health):** Schema/redirect/page health checks — "is everything still configured correctly?"

Each page is filterable by date range. Client can dig in or stay on the summary.

---

## Common pitfalls

| Issue | Fix |
|---|---|
| `date` field shows as Text not Date | Edit data source → click "date" field → change type to Date YYYYMMDD or YYYY-MM-DD |
| Scorecard shows blank | Check the metric exists in the data source — if you just added the column to the sheet, refresh the data source (right-click → Refresh fields) |
| Time series only shows one point | Need at least 2 weekly runs to draw a line; come back next Monday |
| Color comparison arrows showing wrong direction | For metrics where lower is better (like `avg_html_kb`), invert the comparison color in the Style tab |

---

## Maintenance

When new weekly rows arrive in the Sheet, the dashboard updates **automatically**. No action needed.

If you add new columns to the Sheet later (e.g., from extending `monitor.py`):
1. Looker Studio → Resource → Manage added data sources
2. Click the affected data source → click "Refresh fields"
3. New columns appear and can be added to charts

If a data source disconnects (rare — happens if the sheet is deleted/renamed), you'll see a "Configuration error" — just reconnect via the same flow as Step 2.
