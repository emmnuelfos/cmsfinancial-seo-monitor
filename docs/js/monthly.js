/* Monthly Report — comparison-focused renderer */
(function () {
  "use strict";

  function fmt(n) {
    if (n === null || n === undefined || n === "") return "—";
    if (typeof n === "number") {
      // Preserve decimals for fractional values; commas for big ints
      if (Math.abs(n) < 100 && !Number.isInteger(n)) return n.toFixed(2);
      return n.toLocaleString();
    }
    return String(n);
  }

  function deltaSignedText(delta, deltaPct, direction) {
    if (delta === null || delta === undefined) return "—";
    if (delta === 0) return "no change";
    const sign = delta > 0 ? "+" : "";
    const pctPart = deltaPct !== null && deltaPct !== undefined ? ` (${sign}${deltaPct}%)` : "";
    return `${sign}${fmt(delta)}${pctPart}`;
  }

  function deltaClass(isImprovement) {
    if (isImprovement === true) return "is-pos";
    if (isImprovement === false) return "is-neg";
    return "is-flat";
  }

  function arrowSvg() {
    return '<svg viewBox="0 0 18 14" fill="none"><path d="M2 7 L13 7 M10 2 L15 7 L10 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function safeCategoryClass(cat) {
    return (cat || "").replace(/\s+/g, "");
  }

  function render(data) {
    if (!data) return;

    // ---- Header ----
    document.getElementById("comparisonPeriod").textContent = data.comparison_period || "—";
    document.getElementById("generatedAt").textContent = data.generated_at || "—";

    // ---- Summary strip ----
    const s = data.summary || {};
    document.getElementById("sumImprovements").textContent = s.improvements ?? "—";
    document.getElementById("sumNeutral").textContent = s.neutral ?? "—";
    document.getElementById("sumDeclines").textContent = s.declines ?? "—";
    document.getElementById("sumTotal").textContent = s.total_metrics ?? "—";

    // ---- Headline ----
    if (data.headline) {
      const h = data.headline;
      document.getElementById("headlineBefore").textContent = fmt(h.before);
      document.getElementById("headlineAfter").textContent = fmt(h.value);
      document.getElementById("headlineUnit").textContent = h.unit || "";
      document.getElementById("headlineLabel").textContent = h.label || "";
      document.getElementById("headlineWhy").textContent = h.why || "";
    } else {
      const card = document.getElementById("headlineCard");
      if (card) card.style.display = "none";
    }

    // ---- Wins grid ----
    const winsEl = document.getElementById("winsGrid");
    winsEl.innerHTML = "";
    (data.wins || []).forEach((w) => {
      const catCls = safeCategoryClass(w.category);
      const card = document.createElement("div");
      card.className = "win-card";
      card.innerHTML =
        '<div class="win-card__head">' +
        '  <div class="win-card__metric">' + w.metric + '</div>' +
        '  <span class="win-card__category is-' + catCls + '">' + (w.category || "") + '</span>' +
        '</div>' +
        '<div class="win-card__delta">' +
        '  <span class="win-card__before">' + fmt(w.before) + '</span>' +
        '  <span class="win-card__arrow">' + arrowSvg() + '</span>' +
        '  <span class="win-card__after">' + fmt(w.after) + '<span class="win-card__unit">' + (w.unit || "") + '</span></span>' +
        '</div>' +
        '<p class="win-card__why">' + (w.why || "") + '</p>';
      winsEl.appendChild(card);
    });

    // ---- Comparison table ----
    const tbody = document.getElementById("comparisonTable").querySelector("tbody");
    tbody.innerHTML = "";
    (data.comparison || []).forEach((row) => {
      const tr = document.createElement("tr");
      const deltaTxt = deltaSignedText(row.delta, row.delta_pct, row.direction);
      const pctTxt = (row.delta_pct !== null && row.delta_pct !== undefined && row.delta !== 0)
                    ? (row.delta > 0 ? "+" : "") + row.delta_pct + "%"
                    : "—";
      const cls = deltaClass(row.is_improvement);
      tr.innerHTML =
        '<td class="metric-label">' + row.metric + '</td>' +
        '<td class="is-numeric val-before">' + fmt(row.before) + '</td>' +
        '<td class="is-numeric val-after">' + fmt(row.after) + '</td>' +
        '<td class="is-numeric"><span class="delta-pill ' + cls + '">' +
          (row.delta === null || row.delta === undefined ? "—" :
           (row.delta === 0 ? "0" : (row.delta > 0 ? "+" : "") + fmt(row.delta))) +
        '</span></td>' +
        '<td class="is-numeric"><span class="delta-pill ' + cls + '">' + pctTxt + '</span></td>';
      tbody.appendChild(tr);
    });

    // ---- Pending grid ----
    const pendingEl = document.getElementById("pendingGrid");
    pendingEl.innerHTML = "";
    (data.still_pending || []).forEach((p) => {
      const card = document.createElement("div");
      card.className = "pending-card is-" + (p.severity || "med");
      card.innerHTML =
        '<div class="pending-card__head">' +
        '  <div class="pending-card__metric">' + p.label + '</div>' +
        '  <span class="pending-card__severity">' + (p.severity || "") + ' priority</span>' +
        '</div>' +
        '<div class="pending-card__current">' + p.current + '</div>' +
        '<p class="pending-card__next">' + p.next + '</p>';
      pendingEl.appendChild(card);
    });

    // ---- Timeline ----
    const tlEl = document.getElementById("timeline");
    tlEl.innerHTML = "";
    (data.timeline || []).forEach((t) => {
      const item = document.createElement("div");
      item.className = "timeline__item";
      item.innerHTML =
        '<div class="timeline__window">' + t.window + '</div>' +
        '<div class="timeline__body"><span class="timeline__label">' + t.label + '</span>' + t.detail + '</div>';
      tlEl.appendChild(item);
    });
  }

  // ---- Boot ----
  fetch("./data/monthly.json?cb=" + Date.now())
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(render)
    .catch((err) => {
      console.error("Failed to load monthly.json:", err);
      const main = document.querySelector(".main");
      if (main) {
        const errBox = document.createElement("div");
        errBox.style.cssText = "margin-top: var(--space-5); padding: var(--space-4); background: var(--neg-bg); border: 1px solid var(--neg); border-radius: var(--radius-md); color: var(--neg);";
        errBox.textContent = "Couldn't load monthly report data. Try refreshing the page.";
        main.appendChild(errBox);
      }
    });
})();
