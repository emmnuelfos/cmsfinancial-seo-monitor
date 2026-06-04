/* Monthly Report — loader + renderer for monthly.json */
(function () {
  "use strict";

  function fmt(n) {
    if (n === null || n === undefined || n === "") return "—";
    if (typeof n === "number") return n.toLocaleString();
    return String(n);
  }

  function deltaClass(delta) {
    if (delta === null || delta === undefined || delta === 0) return "is-flat";
    return delta > 0 ? "is-pos" : "is-neg";
  }

  function deltaText(delta, deltaPct) {
    if (delta === null || delta === undefined) return "baseline";
    if (delta === 0) return "no change";
    const sign = delta > 0 ? "+" : "";
    const pctPart = deltaPct !== null && deltaPct !== undefined ? ` (${sign}${deltaPct}%)` : "";
    return `${sign}${fmt(delta)}${pctPart}`;
  }

  function fadeUpAll() {
    const els = document.querySelectorAll(".fade-up");
    els.forEach((el, i) => {
      const stagger = parseInt(el.dataset.stagger || "0", 10);
      setTimeout(() => el.classList.add("is-visible"), 60 + stagger * 80);
    });
  }

  function render(data) {
    if (!data) {
      console.error("monthly.json not loaded");
      return;
    }

    // ---- Top meta ----
    const curMonth = data.current_month;
    const month = data.months[curMonth] || {};

    document.getElementById("reportPeriod").textContent = curMonth;
    document.getElementById("generatedAt").textContent = data.generated_at || "—";

    document.getElementById("monthLabel").textContent = curMonth.toUpperCase();
    document.getElementById("monthHeadline").textContent = month.tasks_complete + " of " + month.tasks_total + " tasks shipped.";

    const hoursSpent = (month.hours_complete || 0).toFixed(0);
    const hoursTotal = (month.hours_total || 0).toFixed(0);
    document.getElementById("monthSub").textContent =
      "Hours used: " + hoursSpent + " of " + hoursTotal + " budgeted. " +
      (month.tasks_in_progress > 0
        ? month.tasks_in_progress + " task" + (month.tasks_in_progress === 1 ? "" : "s") + " currently in progress."
        : "Remaining tasks are queued for the rest of the month.");

    // ---- Progress ring ----
    const pct = month.pct_complete || 0;
    document.getElementById("progressPct").textContent = pct;
    const circle = document.getElementById("progressCircle");
    if (circle) {
      const circ = 2 * Math.PI * 44;
      const offset = circ - (pct / 100) * circ;
      // Small delay so the animation is visible
      setTimeout(() => { circle.style.strokeDashoffset = offset; }, 250);
    }

    document.getElementById("hoursBreakdown").innerHTML =
      '<strong>' + month.tasks_complete + '</strong> complete · ' +
      '<strong>' + month.tasks_in_progress + '</strong> in progress · ' +
      '<strong>' + (month.tasks_total - month.tasks_complete - month.tasks_in_progress) + '</strong> queued';

    // ---- Category bars ----
    const barsEl = document.getElementById("categoryBars");
    barsEl.innerHTML = "";
    (month.categories || []).forEach((c) => {
      const row = document.createElement("div");
      row.className = "cat-row";
      const fillClass = c.pct >= 100 ? "is-complete" : c.pct > 0 ? "is-partial" : "is-empty";
      row.innerHTML =
        '<div class="cat-row__name">' + c.name + '</div>' +
        '<div class="cat-row__track"><div class="cat-row__fill ' + fillClass + '" style="width:0%"></div></div>' +
        '<div class="cat-row__count">' + c.complete + '/' + c.total + ' · ' + c.pct + '%</div>';
      barsEl.appendChild(row);
      // Animate
      requestAnimationFrame(() => {
        const fill = row.querySelector(".cat-row__fill");
        fill.style.width = c.pct + "%";
      });
    });

    // ---- Deployment log ----
    const logEl = document.getElementById("deployLog");
    logEl.innerHTML = "";
    document.getElementById("deployCount").textContent = (month.deployments || []).length + " shipped";
    (month.deployments || []).forEach((d) => {
      const li = document.createElement("li");
      li.className = "deploy-item is-" + (d.impact || "low");
      const catClass = (d.category || "").replace(/\s+/g, "");
      li.innerHTML =
        '<div class="deploy-item__dot"></div>' +
        '<div class="deploy-item__body">' +
        '  <div class="deploy-item__head">' +
        '    <span class="deploy-item__title">' + d.title + '</span>' +
        '    <span class="cat-badge is-' + catClass + '">' + d.category + '</span>' +
        '    <span class="impact-badge is-' + d.impact + '">' + d.impact + ' impact</span>' +
        '    <span class="deploy-item__date">' + d.date + '</span>' +
        '  </div>' +
        '  <p class="deploy-item__detail">' + d.detail + '</p>' +
        '</div>';
      logEl.appendChild(li);
    });

    // ---- KPI snapshot ----
    document.getElementById("kpiDateLabel").textContent =
      (data.kpi_snapshot_date || "—") + " · baseline measurement, deltas will appear on the next weekly snapshot";
    const grid = document.getElementById("kpiGrid");
    grid.innerHTML = "";
    (data.kpi_cards || []).forEach((k) => {
      const card = document.createElement("div");
      card.className = "kpi-card";
      const deltaCls = deltaClass(k.delta);
      card.innerHTML =
        '<div class="kpi-card__label">' + k.label + '</div>' +
        '<div class="kpi-card__value">' + fmt(k.value) + '</div>' +
        '<div class="kpi-card__delta ' + deltaCls + '">' + deltaText(k.delta, k.delta_pct) + '</div>';
      grid.appendChild(card);
    });

    // ---- Open list ----
    const openEl = document.getElementById("openList");
    openEl.innerHTML = "";
    document.getElementById("openCount").textContent = (month.open_list || []).length + " open";
    if ((month.open_list || []).length === 0) {
      openEl.innerHTML = '<li style="color: var(--text-muted); justify-content: center;">All tasks shipped — nothing open for this month.</li>';
    } else {
      (month.open_list || []).forEach((t) => {
        const li = document.createElement("li");
        const sCls = t.status === "in_progress" ? "is-progress" : "is-pending";
        const sLabel = t.status === "in_progress" ? "in progress" : "queued";
        li.innerHTML =
          '<span class="open-list__id">#' + t.id + '</span>' +
          '<span class="open-list__task">' + t.task + '</span>' +
          '<span class="open-list__status ' + sCls + '">' + sLabel + '</span>';
        openEl.appendChild(li);
      });
    }

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

    fadeUpAll();
  }

  // ---- Boot ----
  fetch("./data/monthly.json?cb=" + Date.now())
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(render)
    .catch((err) => {
      console.error("Failed to load monthly.json:", err);
      document.querySelector(".main").innerHTML +=
        '<div style="margin-top: var(--space-5); padding: var(--space-4); background: var(--neg-bg); border: 1px solid var(--neg); border-radius: var(--radius-md); color: var(--neg);">Couldn\'t load monthly report data. Try refreshing the page.</div>';
    });
})();
