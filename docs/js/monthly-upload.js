/* Monthly report — upload-and-merge widget.
   Lets the user drop in a Semrush HTML export each month; we parse it,
   merge into the loaded JSON, cache to localStorage, and re-render the page.
   The user can also Download the merged JSON to commit upstream.

   Public API:
     MonthlyUpload.init({pageKey, parser, mergeFn, onApplied, fileLabel})
     MonthlyUpload.loadData(pageKey, sourceUrl) -> Promise<merged data>
     MonthlyUpload.applyOverride(pageKey, data)
     MonthlyUpload.clearOverride(pageKey)
     MonthlyUpload.parsers.health(htmlText) -> partial data object
     MonthlyUpload.parsers.* (other page parsers)
*/
(function (root) {
  "use strict";

  const STORAGE_PREFIX = "cms-prime:monthly:";

  // ============================================================
  // Storage helpers
  // ============================================================
  function getOverride(pageKey) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + pageKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function setOverride(pageKey, data) {
    try { localStorage.setItem(STORAGE_PREFIX + pageKey, JSON.stringify(data)); }
    catch (e) { console.warn("[upload] localStorage write failed:", e); }
  }
  function removeOverride(pageKey) {
    try { localStorage.removeItem(STORAGE_PREFIX + pageKey); } catch (e) {}
  }

  // ============================================================
  // Deep merge — override wins when both have the same key
  // ============================================================
  function deepMerge(base, override) {
    if (override === null || override === undefined) return base;
    if (typeof override !== "object" || Array.isArray(override)) return override;
    if (typeof base !== "object" || base === null || Array.isArray(base)) return override;
    const out = Object.assign({}, base);
    Object.keys(override).forEach(k => {
      out[k] = deepMerge(base[k], override[k]);
    });
    return out;
  }

  // ============================================================
  // Public loader: fetch source JSON + merge override (if any)
  // ============================================================
  async function loadData(pageKey, sourceUrl) {
    const r = await fetch(sourceUrl + "?cb=" + Date.now());
    if (!r.ok) throw new Error("HTTP " + r.status + " loading " + sourceUrl);
    const base = await r.json();
    const override = getOverride(pageKey);
    if (!override) return base;
    return deepMerge(base, override);
  }

  // ============================================================
  // Text extraction helper (Semrush HTML -> clean text)
  // ============================================================
  function htmlToText(htmlString) {
    let t = htmlString
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    return t;
  }
  // DOM parser handle (richer than text regex when we need it)
  function htmlToDoc(htmlString) {
    try { return new DOMParser().parseFromString(htmlString, "text/html"); }
    catch (e) { return null; }
  }

  // ============================================================
  // Date extraction — Semrush exports include "Updated: <date>"
  // ============================================================
  function extractAuditDate(text) {
    // "Updated: Mon, Jun 1, 2026" or similar
    const m = text.match(/Updated:\s*[A-Z][a-z]+,?\s*([A-Z][a-z]+\s+\d{1,2},?\s*\d{4})/);
    if (m) return m[1].replace(/,\s*$/, "");
    // Fallback: any "Month DD, YYYY" pattern
    const m2 = text.match(/([A-Z][a-z]+\s+\d{1,2},\s*\d{4})/);
    return m2 ? m2[1] : null;
  }
  function shortDate(longDate) {
    if (!longDate) return null;
    // "Jun 1, 2026" -> "Jun 1, 2026"; "June 1, 2026" -> "Jun 1, 2026"
    const m = longDate.match(/([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/);
    if (!m) return longDate;
    const monthShort = m[1].substr(0, 3);
    return `${monthShort} ${parseInt(m[2], 10)}, ${m[3]}`;
  }
  function tierForScore(score) {
    if (score >= 90) return "good";
    if (score >= 70) return "fair";
    return "poor";
  }
  function signedDelta(n) {
    if (n === 0 || n === null || n === undefined) return "held";
    return (n > 0 ? "+" : "") + n;
  }

  // ============================================================
  // SITE HEALTH parser (fully functional — anchored to Semrush
  // Site Audit Overview export structure as of Jun 2026)
  // ============================================================
  function parseSiteHealth(htmlString) {
    const text = htmlToText(htmlString);
    const doc = htmlToDoc(htmlString);
    const out = { _meta: { source: "semrush-site-audit-overview", parsed_at: new Date().toISOString() } };

    // ---- Audit date ----
    const auditDate = extractAuditDate(text);
    out._meta.audit_date = shortDate(auditDate);

    // ---- Site Health Score (the big number) ----
    // Pattern: "Site Health Press \"Tab\" ... NN% +N" or "NN% no changes"
    const shMatch = text.match(/Site Health[^%\d]+(\d{1,3})%\s*([\+\-]?\d+|no changes)?/i);
    let siteHealthScore = null, siteHealthDelta = null;
    if (shMatch) {
      siteHealthScore = parseInt(shMatch[1], 10);
      siteHealthDelta = shMatch[2] && shMatch[2] !== "no changes" ? parseInt(shMatch[2], 10) : 0;
    }
    out._meta.site_health_score = siteHealthScore;
    out._meta.site_health_delta = siteHealthDelta;

    // ---- Top-10% benchmark ----
    const topMatch = text.match(/Top-10%\s+websites\s+(\d{1,3})%/i);
    out._meta.top10_benchmark = topMatch ? parseInt(topMatch[1], 10) : 92;

    // ---- Page breakdown ----
    // "Crawled Pages 100 no changes  Healthy 30 +4  Broken 7  Have issues 49 -3  Redirects 14 -1  Blocked 0"
    function extractPage(label) {
      const re = new RegExp(label + "\\s+(\\d+)\\s*(no changes|[\\+\\-]?\\d+)?", "i");
      const m = text.match(re);
      if (!m) return null;
      return {
        count: parseInt(m[1], 10),
        delta: m[2] && m[2] !== "no changes" ? parseInt(m[2], 10) : 0,
      };
    }
    const healthy = extractPage("Healthy");
    const broken = extractPage("Broken");
    const haveIssues = extractPage("Have issues");
    const redirects = extractPage("Redirects");
    const blocked = extractPage("Blocked");
    const crawled = extractPage("Crawled Pages");

    // ---- AI Search Health ----
    const aiMatch = text.match(/AI Search Health[^%\d]+(\d{1,3})%\s*(no changes|[\+\-]?\d+)?/i);
    const aiScore = aiMatch ? parseInt(aiMatch[1], 10) : null;
    const aiDelta = aiMatch && aiMatch[2] && aiMatch[2] !== "no changes" ? parseInt(aiMatch[2], 10) : 0;
    const aiIssuesMatch = text.match(/AI Search Health[\s\S]{1,400}?(\d+)\s+issues/i);
    const aiIssues = aiIssuesMatch ? parseInt(aiIssuesMatch[1], 10) : null;

    // Bot statuses (rough parse)
    const bots = [];
    const botSection = text.match(/Blocked from AI Search[\s\S]{1,600}/i);
    if (botSection) {
      const s = botSection[0];
      ["ChatGPT-User", "OAI-SearchBot", "Googlebot", "Google-Extended"].forEach(name => {
        const re = new RegExp(name.replace("-", "\\-") + "\\s+(All good|\\d+\\s+(?:page|pages))", "i");
        const m = s.match(re);
        if (m) {
          let status = m[1];
          if (/\d+\s+page/i.test(status)) {
            const n = status.match(/(\d+)/)[1];
            status = `${n} pages — partial`;
          }
          bots.push({ name, status });
        } else {
          // Fallback: name without explicit status near it
          if (s.indexOf(name) >= 0) bots.push({ name, status: "All good" });
        }
      });
    }

    // ---- Thematic reports ----
    // Score donuts have data-ui-name="MiniChart.ScoreDonut" value=99
    // Each is preceded by its category <h3> label.
    const thematic = [];
    if (doc) {
      const donuts = doc.querySelectorAll('[data-ui-name="MiniChart.ScoreDonut"]');
      const wantedLabels = [
        "Crawlability", "HTTPS", "International SEO", "Core Web Vitals",
        "Site Performance", "Internal Linking", "Markup"
      ];
      // Walk each donut, find nearest preceding label containing one of the names
      donuts.forEach(node => {
        const v = parseInt(node.getAttribute("value") || "0", 10);
        // Look backwards for a containing card with one of the labels
        let cursor = node.parentElement;
        let label = null;
        for (let depth = 0; depth < 6 && cursor && !label; depth++) {
          const t = cursor.textContent || "";
          for (const w of wantedLabels) {
            if (t.indexOf(w) === 0 || new RegExp("^\\s*" + w.replace(/\s+/g, "\\s+")).test(t)) {
              label = w;
              break;
            }
          }
          // Fallback: take the first wantedLabel that appears as a standalone word
          if (!label) {
            for (const w of wantedLabels) {
              const re = new RegExp("\\b" + w.replace(/\s+/g, "\\s+") + "\\b");
              if (re.test(t) && t.length < 200) {
                label = w;
                break;
              }
            }
          }
          cursor = cursor.parentElement;
        }
        if (label && !thematic.find(x => x.label === label)) {
          thematic.push({ label, score: v });
        }
      });
    }
    // Fallback to text parse if DOM parse came up short
    if (thematic.length < 3) {
      ["Crawlability", "HTTPS", "International SEO", "Core Web Vitals",
       "Site Performance", "Internal Linking", "Markup"].forEach(label => {
        const re = new RegExp(label.replace(/\s+/g, "\\s+") + "\\s+(\\d{1,3})%", "i");
        const m = text.match(re);
        if (m && !thematic.find(x => x.label === label)) {
          thematic.push({ label, score: parseInt(m[1], 10) });
        }
      });
    }

    // ---- Build the override payload ----
    // We RETURN a partial JSON that will deep-merge over monthly-health.json.

    // a) Append a new reading + mark it current (clear is_current on others)
    let newReading = null;
    if (siteHealthScore !== null && out._meta.audit_date) {
      newReading = {
        date: out._meta.audit_date,
        score: siteHealthScore,
        label: "current · post-upload",
        context: signedDelta(siteHealthDelta) + " pts since previous reading",
        tier: tierForScore(siteHealthScore),
        is_current: true,
      };
    }
    out.site_health_score = { _appendReading: newReading };

    // b) thematic_reports rows (replace, since these are current-state snapshots)
    if (thematic.length) {
      const tipFor = {
        "Crawlability": "How easily Google's crawler can access and process pages.",
        "HTTPS": "Security and certificate health.",
        "International SEO": "Hreflang coverage and language targeting.",
        "Core Web Vitals": "Google's mobile loading speed metrics (LCP, INP, CLS).",
        "Site Performance": "Loading speed and asset optimization.",
        "Internal Linking": "Quality and structure of links between pages on your own site.",
        "Markup": "Structured data and schema quality.",
      };
      const tierFor = s => (s >= 95 ? "core" : s >= 80 ? "supporting" : "miss");
      out.thematic_reports = {
        title: "Thematic reports · category-by-category score",
        subtitle: "Semrush groups issues into 7 thematic categories · " + (out._meta.audit_date || "current"),
        rows: thematic.map(t => ({
          label: t.label,
          score: t.score,
          delta: "current",
          tier: tierFor(t.score),
          tip: tipFor[t.label] || ""
        })),
      };
    }

    // c) page_health rows
    if (healthy || broken || haveIssues || redirects || blocked) {
      const rows = [];
      if (healthy) rows.push({ label: "Healthy pages (no issues)", count: healthy.count, delta: signedDelta(healthy.delta), tier: "core", tip: "Pages with zero detected issues — no errors, warnings, or notices." });
      if (haveIssues) rows.push({ label: "Pages with issues", count: haveIssues.count, delta: signedDelta(haveIssues.delta), tier: "supporting", tip: "Pages with at least one issue but otherwise functional." });
      if (redirects) rows.push({ label: "Redirects", count: redirects.count, delta: signedDelta(redirects.delta), tier: "supporting", tip: "Pages that redirect somewhere else (intentional 301s plus a few legacy ones)." });
      if (broken) rows.push({ label: "Broken", count: broken.count, delta: signedDelta(broken.delta), tier: "miss", tip: "Pages that returned a 4xx or 5xx response." });
      if (blocked) rows.push({ label: "Blocked from crawling", count: blocked.count, delta: signedDelta(blocked.delta), tier: "core", tip: "Pages excluded via robots.txt or other directives." });
      out.page_health = {
        title: "Pages · how the audited pages break down",
        subtitle: "Current snapshot from the " + (out._meta.audit_date || "latest") + " crawl",
        rows
      };
    }

    // d) AI Search Health
    if (aiScore !== null) {
      out.ai_search_health = {
        title: "AI Search Health (beta)",
        subtitle: "How well the site is optimized for AI search engines like ChatGPT, Gemini, AI Overviews",
        score: aiScore,
        delta: signedDelta(aiDelta) === "held" ? "no changes" : signedDelta(aiDelta) + " pts",
        tier: tierForScore(aiScore),
        verdict: aiScore >= 90 ? "Website is well optimized for AI search engines" : "Improvements still needed for AI search visibility",
        issues_count: aiIssues || 0,
        bots: bots.length ? bots : [
          {"name": "ChatGPT-User", "status": "All good"},
          {"name": "OAI-SearchBot", "status": "All good"},
          {"name": "Googlebot", "status": "All good"},
          {"name": "Google-Extended", "status": "All good"},
        ],
      };
    }

    return out;
  }

  // ============================================================
  // DOMAIN OVERVIEW parser (Semrush Domain Overview export)
  // Heuristic — looks for common stat-card labels. Best-effort.
  // ============================================================
  function parseDomain(htmlString) {
    const text = htmlToText(htmlString);
    const out = { _meta: { source: "semrush-domain-overview", parsed_at: new Date().toISOString() } };
    out._meta.audit_date = shortDate(extractAuditDate(text));

    function extractNumber(label, opts) {
      opts = opts || {};
      const pattern = opts.unit
        ? new RegExp(label + "\\s+([\\d,.]+[KMB]?)\\s*" + opts.unit, "i")
        : new RegExp(label + "\\s+([\\d,.]+[KMB]?)", "i");
      const m = text.match(pattern);
      if (!m) return null;
      let s = m[1].replace(/,/g, "");
      const mult = s.endsWith("K") ? 1e3 : s.endsWith("M") ? 1e6 : s.endsWith("B") ? 1e9 : 1;
      s = s.replace(/[KMB]/, "");
      return parseFloat(s) * mult;
    }

    const authority = extractNumber("Authority Score");
    const organicTraffic = extractNumber("Organic Search Traffic") || extractNumber("Organic Traffic");
    const keywords = extractNumber("Organic Keywords") || extractNumber("Organic\\s+Keywords");
    const backlinks = extractNumber("Backlinks");
    const referringDomains = extractNumber("Referring Domains");
    const trafficCost = extractNumber("Organic Traffic Cost");

    out._meta.metrics_extracted = {
      authority_score: authority,
      organic_traffic: organicTraffic,
      organic_keywords: keywords,
      backlinks,
      referring_domains: referringDomains,
      traffic_cost: trafficCost,
    };

    // Inform user this parser is heuristic
    out._meta.parser_status = "heuristic — extracted values shown in upload preview; refine the JSON manually if any number is off";
    return out;
  }

  // ============================================================
  // ORGANIC RANKINGS parser
  // ============================================================
  function parseRankings(htmlString) {
    const text = htmlToText(htmlString);
    const out = { _meta: { source: "semrush-organic-rankings", parsed_at: new Date().toISOString() } };
    out._meta.audit_date = shortDate(extractAuditDate(text));

    function extractNumber(label) {
      const m = text.match(new RegExp(label + "\\s+([\\d,.]+[KMB]?)", "i"));
      if (!m) return null;
      let s = m[1].replace(/,/g, "");
      const mult = s.endsWith("K") ? 1e3 : s.endsWith("M") ? 1e6 : 1;
      return parseFloat(s.replace(/[KMB]/, "")) * mult;
    }

    out._meta.metrics_extracted = {
      organic_keywords: extractNumber("Keywords") || extractNumber("Organic Keywords"),
      organic_traffic: extractNumber("Traffic") || extractNumber("Organic Traffic"),
      // Position buckets
      top_3: extractNumber("Top 3") || extractNumber("1-3"),
      top_10: extractNumber("Top 10") || extractNumber("1-10"),
      top_20: extractNumber("Top 20") || extractNumber("1-20"),
      top_100: extractNumber("Top 100") || extractNumber("21-100"),
    };
    out._meta.parser_status = "heuristic — verify extracted numbers in the upload preview";
    return out;
  }

  // ============================================================
  // POSITION TRACKING parser
  // ============================================================
  function parseTracking(htmlString) {
    const text = htmlToText(htmlString);
    const out = { _meta: { source: "semrush-position-tracking", parsed_at: new Date().toISOString() } };
    out._meta.audit_date = shortDate(extractAuditDate(text));

    function extractNumber(label) {
      const m = text.match(new RegExp(label + "\\s+([\\d,.]+%?)", "i"));
      return m ? m[1] : null;
    }
    out._meta.metrics_extracted = {
      visibility: extractNumber("Visibility"),
      estimated_traffic: extractNumber("Estimated Traffic"),
      avg_position: extractNumber("Average Position") || extractNumber("Avg\\.?\\s*Position"),
    };
    out._meta.parser_status = "heuristic — verify extracted numbers in the upload preview";
    return out;
  }

  // ============================================================
  // BACKLINKS parser
  // ============================================================
  function parseBacklinks(htmlString) {
    const text = htmlToText(htmlString);
    const out = { _meta: { source: "semrush-backlinks-overview", parsed_at: new Date().toISOString() } };
    out._meta.audit_date = shortDate(extractAuditDate(text));

    function extractNumber(label) {
      const m = text.match(new RegExp(label + "\\s+([\\d,.]+[KMB]?)", "i"));
      if (!m) return null;
      let s = m[1].replace(/,/g, "");
      const mult = s.endsWith("K") ? 1e3 : s.endsWith("M") ? 1e6 : 1;
      return parseFloat(s.replace(/[KMB]/, "")) * mult;
    }
    out._meta.metrics_extracted = {
      total_backlinks: extractNumber("Total Backlinks") || extractNumber("Backlinks"),
      referring_domains: extractNumber("Referring Domains"),
      referring_ips: extractNumber("Referring IPs"),
      authority_score: extractNumber("Authority Score"),
      dofollow_pct: extractNumber("Dofollow"),
      toxicity: extractNumber("Toxicity"),
    };
    out._meta.parser_status = "heuristic — verify extracted numbers in the upload preview";
    return out;
  }

  // ============================================================
  // Upload widget UI
  // ============================================================
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function renderPreview(parsed) {
    const meta = parsed._meta || {};
    const m = meta.metrics_extracted || {};
    let rows = "";
    if (meta.audit_date) rows += `<dt>Audit date</dt><dd>${escapeHtml(meta.audit_date)}</dd>`;
    if (meta.site_health_score !== null && meta.site_health_score !== undefined) {
      rows += `<dt>Site Health Score</dt><dd>${meta.site_health_score} / 100${meta.site_health_delta ? ` (${signedDelta(meta.site_health_delta)})` : ""}</dd>`;
    }
    Object.keys(m).forEach(k => {
      if (m[k] !== null && m[k] !== undefined) {
        const label = k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        rows += `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(m[k]))}</dd>`;
      }
    });
    // Sections that this override patches
    const patches = [];
    if (parsed.site_health_score) patches.push("Site Health Score block (+ new reading)");
    if (parsed.thematic_reports) patches.push(`Thematic Reports (${parsed.thematic_reports.rows.length} rows)`);
    if (parsed.page_health) patches.push(`Page Health (${parsed.page_health.rows.length} rows)`);
    if (parsed.ai_search_health) patches.push("AI Search Health");
    if (patches.length) {
      rows += `<dt>Sections updated</dt><dd>${patches.map(escapeHtml).join(" · ")}</dd>`;
    }
    if (meta.parser_status) {
      rows += `<dt>Notes</dt><dd>${escapeHtml(meta.parser_status)}</dd>`;
    }
    return rows;
  }

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 0);
  }

  // ============================================================
  // init(opts) — renders a discrete floating upload button + modal
  // ============================================================
  function init(opts) {
    opts = opts || {};
    const {
      pageKey,        // "health", "domain", "rankings", "tracking", "backlinks"
      parser,         // function(htmlText) -> partial data object
      sourceUrl,      // "./data/monthly-X.json"
      fileLabel,      // "Semrush Site Audit Overview export (.htm / .html)"
      onApplied,      // function() — called after override applied or cleared
    } = opts;

    // If init was already called this page (e.g. hot-reload), nuke the old mount
    document.querySelectorAll(".upload-fab, .upload-modal").forEach(n => n.remove());
    // Empty out the legacy inline placeholder so it's truly invisible
    const inlinePlaceholder = document.getElementById("uploadWidget");
    if (inlinePlaceholder) inlinePlaceholder.innerHTML = "";

    const hasOverride = !!getOverride(pageKey);

    // ---- Floating action button (bottom-right) ----
    const fab = document.createElement("button");
    fab.type = "button";
    fab.className = "upload-fab" + (hasOverride ? " has-override" : "");
    fab.setAttribute("aria-label", hasOverride ? "Update Semrush data — override active" : "Upload new Semrush data");
    fab.setAttribute("title", hasOverride ? "Update Semrush data (override currently active)" : "Upload next month's Semrush export");
    fab.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
      '  <polyline points="17 8 12 3 7 8"/>' +
      '  <line x1="12" y1="3" x2="12" y2="15"/>' +
      '</svg>' +
      (hasOverride ? '<span class="upload-fab__dot" aria-hidden="true"></span>' : '');
    document.body.appendChild(fab);

    // ---- Modal (hidden until FAB is clicked) ----
    const modal = document.createElement("div");
    modal.className = "upload-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "uploadModalTitle");
    modal.hidden = true;
    modal.innerHTML =
      '<div class="upload-modal__backdrop" data-action="close"></div>' +
      '<div class="upload-modal__panel">' +
      '  <div class="upload-modal__head">' +
      '    <div>' +
      '      <div class="upload-modal__kicker">Upload Semrush export</div>' +
      '      <h2 class="upload-modal__title" id="uploadModalTitle">' + (hasOverride ? "Replace current upload" : "Add next month's data") + '</h2>' +
      '    </div>' +
      '    <button type="button" class="upload-modal__close" data-action="close" aria-label="Close">' +
      '      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      '    </button>' +
      '  </div>' +
      '  <div class="upload-modal__body">' +
      '    <p class="upload-widget__help">' + escapeHtml(fileLabel || "Drop in the latest Semrush HTML export (.htm or .html, saved via SingleFile)") + '. ' +
      '      Parsed client-side and cached in your browser. <strong>Download the merged JSON</strong> to commit permanently.</p>' +
      '    <div class="upload-widget__drop" data-action="drop">' +
      '      <input type="file" id="uploadFile_' + pageKey + '" accept=".htm,.html,text/html" hidden>' +
      '      <label for="uploadFile_' + pageKey + '" class="upload-widget__pick">Choose file</label>' +
      '      <span class="upload-widget__filename" data-role="filename">No file chosen</span>' +
      '    </div>' +
      '    <div class="upload-widget__preview" data-role="preview" hidden>' +
      '      <div class="upload-widget__preview-head">Extracted</div>' +
      '      <dl class="upload-widget__preview-list" data-role="preview-list"></dl>' +
      '      <div class="upload-widget__actions">' +
      '        <button type="button" class="upload-widget__btn upload-widget__btn--primary" data-action="apply">Apply to dashboard</button>' +
      '        <button type="button" class="upload-widget__btn" data-action="download">Download merged JSON</button>' +
      '        <button type="button" class="upload-widget__btn upload-widget__btn--ghost" data-action="cancel">Cancel</button>' +
      '      </div>' +
      '    </div>' +
      (hasOverride ?
      '    <div class="upload-widget__current">' +
      '      <span>This page is currently showing an uploaded override.</span>' +
      '      <button type="button" class="upload-widget__btn upload-widget__btn--ghost" data-action="reset">Reset to default</button>' +
      '    </div>' : '') +
      '    <div class="upload-widget__status" data-role="status"></div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(modal);

    const fileInput = modal.querySelector("#uploadFile_" + pageKey);
    const filenameLabel = modal.querySelector('[data-role="filename"]');
    const previewBox = modal.querySelector('[data-role="preview"]');
    const previewList = modal.querySelector('[data-role="preview-list"]');
    const statusBox = modal.querySelector('[data-role="status"]');
    let stagedOverride = null;

    function setStatus(msg, tone) {
      if (!statusBox) return;
      statusBox.textContent = msg || "";
      statusBox.className = "upload-widget__status" + (tone ? " is-" + tone : "");
    }

    function openModal() {
      modal.hidden = false;
      requestAnimationFrame(() => modal.classList.add("is-open"));
      document.body.classList.add("has-upload-modal-open");
    }
    function closeModal() {
      modal.classList.remove("is-open");
      document.body.classList.remove("has-upload-modal-open");
      setTimeout(() => { modal.hidden = true; }, 200);
    }

    fab.addEventListener("click", openModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) closeModal();
    });

    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      filenameLabel.textContent = file.name + " (" + Math.round(file.size/1024) + " KB)";
      setStatus("Parsing…");
      try {
        const text = await file.text();
        const parsed = parser(text);
        stagedOverride = parsed;
        previewList.innerHTML = renderPreview(parsed);
        previewBox.removeAttribute("hidden");
        setStatus("Parsed. Click Apply to update the dashboard, or Download to save the JSON.", "ok");
      } catch (err) {
        console.error(err);
        setStatus("Could not parse: " + err.message, "err");
      }
    });

    modal.addEventListener("click", async (e) => {
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      if (action === "close") {
        closeModal();
      } else if (action === "apply" && stagedOverride) {
        const finalized = await finalizeOverride(pageKey, stagedOverride, sourceUrl);
        setOverride(pageKey, finalized);
        setStatus("Applied. Reloading…", "ok");
        if (onApplied) onApplied();
        setTimeout(() => location.reload(), 400);
      } else if (action === "download" && stagedOverride) {
        const finalized = await finalizeOverride(pageKey, stagedOverride, sourceUrl);
        const base = await (await fetch(sourceUrl + "?cb=" + Date.now())).json();
        const merged = deepMerge(base, finalized);
        delete merged._meta;
        downloadJson("monthly-" + pageKey + ".json", merged);
        setStatus("Downloaded. Commit this file to docs/data/ to make it permanent.", "ok");
      } else if (action === "cancel") {
        stagedOverride = null;
        previewBox.setAttribute("hidden", "");
        filenameLabel.textContent = "No file chosen";
        fileInput.value = "";
        setStatus("");
      } else if (action === "reset") {
        if (confirm("Remove the uploaded override and show the default data again?")) {
          removeOverride(pageKey);
          location.reload();
        }
      }
    });
  }

  // ============================================================
  // Finalize site-health override — handle the readings append
  // (so that uploading a new audit appends to the historical list
  // rather than overwriting it).
  // ============================================================
  async function finalizeOverride(pageKey, staged, sourceUrl) {
    const out = Object.assign({}, staged);
    if (pageKey === "health" && staged.site_health_score && staged.site_health_score._appendReading) {
      const base = await (await fetch(sourceUrl + "?cb=" + Date.now())).json();
      const baseReadings = (base.site_health_score && base.site_health_score.readings) || [];
      // Strip is_current from all previous and demote their label
      const updated = baseReadings.map(r => {
        if (r.is_current) {
          return Object.assign({}, r, { is_current: false, label: r.label.replace(/current\s*·?\s*/i, "previous · ") });
        }
        return r;
      });
      const newReading = staged.site_health_score._appendReading;
      // Avoid duplicating the same date
      if (!updated.find(r => r.date === newReading.date)) {
        updated.push(newReading);
      }
      out.site_health_score = {
        title: `Site Health Score · ${updated[0].score} → ${newReading.score} across the engagement`,
        subtitle: `Semrush's overall site quality rating (0-100). ${updated.length} readings across the engagement.`,
        readings: updated,
        caption: base.site_health_score?.caption || "",
      };
    }
    return out;
  }

  // ============================================================
  // Export
  // ============================================================
  root.MonthlyUpload = {
    init,
    loadData,
    applyOverride: setOverride,
    clearOverride: removeOverride,
    getOverride,
    parsers: {
      health: parseSiteHealth,
      domain: parseDomain,
      rankings: parseRankings,
      tracking: parseTracking,
      backlinks: parseBacklinks,
    },
    _internal: { htmlToText, htmlToDoc, deepMerge, finalizeOverride },
  };
})(typeof window !== "undefined" ? window : this);
