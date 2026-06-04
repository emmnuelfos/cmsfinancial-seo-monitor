/* Shared rendering helpers for the 3 Monthly Report sub-pages.
   Loaded BEFORE the per-page initializer.
   Depends on Chart.js (loaded inline in the HTML). */
(function (root) {
  "use strict";

  // ---- Chart palette aligned to the editorial design ----
  const PAL = {
    gold:     "#FBBF24",
    goldSoft: "rgba(251, 191, 36, 0.18)",
    amber:    "#F59E0B",
    amberSoft:"rgba(245, 158, 11, 0.18)",
    blue:     "#60A5FA",
    blueSoft: "rgba(96, 165, 250, 0.18)",
    pos:      "#22C55E",
    neg:      "#EF4444",
    muted:    "#475569",
    grid:     "rgba(30, 41, 59, 0.6)",
    rule:     "rgba(30, 41, 59, 0.9)",
    text:     "#94A3B8",
    textStrong: "#F8FAFC",
  };

  const FONT_MONO = "JetBrains Mono, Menlo, monospace";
  const FONT_BODY = "Inter, system-ui, sans-serif";

  // ---- Number formatting helpers ----
  function fmt(n) {
    if (n === null || n === undefined || n === "") return "—";
    if (typeof n === "number") {
      if (Number.isInteger(n)) return n.toLocaleString();
      return n.toFixed(2);
    }
    return String(n);
  }
  function fmtSigned(n) {
    if (n === null || n === undefined) return "—";
    if (n === 0) return "0";
    return (n > 0 ? "+" : "") + fmt(n);
  }
  function deltaClass(direction) {
    if (direction === "pos") return "is-pos";
    if (direction === "neg") return "is-neg";
    return "is-flat";
  }

  // ---- Common Chart.js setup ----
  if (root.Chart) {
    Chart.defaults.font.family = FONT_MONO;
    Chart.defaults.font.size = 11;
    Chart.defaults.color = PAL.text;
    Chart.defaults.borderColor = PAL.grid;
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.plugins.tooltip.backgroundColor = "#020617";
    Chart.defaults.plugins.tooltip.borderColor = "#334155";
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.titleFont = { family: FONT_MONO, size: 10, weight: 600 };
    Chart.defaults.plugins.tooltip.bodyFont = { family: FONT_MONO, size: 11 };
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.titleColor = PAL.text;
    Chart.defaults.plugins.tooltip.bodyColor = PAL.textStrong;
    Chart.defaults.plugins.tooltip.cornerRadius = 0;
    Chart.defaults.animation.duration = 800;
    Chart.defaults.animation.easing = "easeOutQuart";
  }

  // ---- Feature line chart with annotated last point ----
  function drawFeatureChart(ctx, months, series, opts) {
    opts = opts || {};
    const datasets = series.map((s, i) => {
      const colorKey = s.color || "amber";
      const colorMain = PAL[colorKey] || PAL.amber;
      const colorSoft = PAL[colorKey + "Soft"] || PAL.amberSoft;
      return {
        label: s.label,
        data: s.data,
        borderColor: colorMain,
        backgroundColor: colorSoft,
        borderWidth: 2.5,
        pointRadius: function (c) {
          // Larger point at the last non-null value
          const arr = c.dataset.data;
          let lastIdx = arr.length - 1;
          while (lastIdx >= 0 && arr[lastIdx] === null) lastIdx--;
          return c.dataIndex === lastIdx ? 6 : 3;
        },
        pointHoverRadius: 7,
        pointBackgroundColor: colorMain,
        pointBorderColor: "#020617",
        pointBorderWidth: 2,
        tension: 0.28,
        spanGaps: false,
        fill: opts.fill !== false && series.length === 1 ? "origin" : false,
      };
    });

    return new Chart(ctx, {
      type: "line",
      data: { labels: months, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: series.length > 1,
            position: "bottom",
            align: "start",
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              padding: 16,
              font: { family: FONT_MONO, size: 11 },
              color: PAL.text,
              usePointStyle: true,
              pointStyle: "rect",
            },
          },
          tooltip: {
            callbacks: {
              title: function (items) { return items[0].label.toUpperCase(); },
              label: function (item) {
                if (item.parsed.y === null) return item.dataset.label + ": pending";
                return item.dataset.label + ": " + fmt(item.parsed.y) + (opts.unit || "");
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: "transparent", drawBorder: false },
            ticks: {
              font: { family: FONT_MONO, size: 11, weight: 500 },
              color: PAL.text,
              padding: 8,
            },
            border: { color: PAL.rule, width: 1 },
          },
          y: {
            position: opts.yPosition || "right",
            beginAtZero: opts.beginAtZero === true,
            reverse: opts.reverse === true,
            grid: { color: PAL.grid, drawTicks: false, drawBorder: false },
            ticks: {
              font: { family: FONT_MONO, size: 10 },
              color: PAL.text,
              padding: 8,
              callback: function (v) { return fmt(v) + (opts.yUnit || ""); },
            },
            border: { display: false },
          },
        },
      },
    });
  }

  // ---- Sparkline (mini chart inside a cell) ----
  function drawSpark(ctx, data, opts) {
    opts = opts || {};
    const filtered = data.filter(d => d !== null);
    const all0 = filtered.every(v => v === filtered[0]);
    const color = opts.color || (filtered.length === 0 ? PAL.muted : (filtered[filtered.length - 1] >= filtered[0] ? PAL.pos : PAL.neg));
    return new Chart(ctx, {
      type: "line",
      data: {
        labels: data.map((_, i) => i),
        datasets: [{
          data: data,
          borderColor: color,
          backgroundColor: color + "22",
          borderWidth: 1.6,
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0.28,
          fill: "origin",
          spanGaps: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600 },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false, grid: { display: false } },
          y: {
            display: false,
            grid: { display: false },
            reverse: opts.reverse === true,
            min: opts.min,
            max: opts.max,
          },
        },
      },
    });
  }

  // ===========================================================
  // COMPARISON CHART HELPERS — replace bar-lists / tables where
  // a visual comparison story lands harder than raw numbers.
  // ===========================================================

  // Grouped vertical bars: May vs June side-by-side per metric
  function drawCompareBars(ctx, labels, beforeVals, afterVals, opts) {
    opts = opts || {};
    return new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: opts.beforeLabel || "Before",
            data: beforeVals,
            backgroundColor: PAL.muted,
            borderColor: PAL.muted,
            borderWidth: 1,
            borderRadius: 2,
            barPercentage: 0.85,
            categoryPercentage: 0.65,
          },
          {
            label: opts.afterLabel || "After",
            data: afterVals,
            backgroundColor: PAL.gold,
            borderColor: PAL.gold,
            borderWidth: 1,
            borderRadius: 2,
            barPercentage: 0.85,
            categoryPercentage: 0.65,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: "top",
            align: "end",
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              padding: 14,
              font: { family: FONT_MONO, size: 10.5, weight: 600 },
              color: PAL.text,
              usePointStyle: false,
              textTransform: "uppercase",
            },
          },
          tooltip: {
            callbacks: {
              label: (item) => item.dataset.label + ": " + fmt(item.parsed.y) + (opts.unit || ""),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: FONT_MONO, size: 10.5 }, color: PAL.text },
            border: { color: PAL.rule },
          },
          y: {
            beginAtZero: true,
            grid: { color: PAL.grid, drawBorder: false },
            ticks: {
              font: { family: FONT_MONO, size: 10 },
              color: PAL.text,
              padding: 6,
              callback: (v) => opts.shortNum ? shortFmt(v) : fmt(v),
            },
            border: { display: false },
          },
        },
      },
    });
  }

  function shortFmt(n) {
    if (n === null || n === undefined) return "";
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "K";
    return fmt(n);
  }

  // Horizontal bar chart — for distributions (authority, TLD, countries, etc.)
  function drawHorizontalBars(ctx, labels, values, opts) {
    opts = opts || {};
    const colors = opts.colors || values.map((_, i) => i === 0 ? PAL.gold : (i < 3 ? PAL.amber : PAL.blueSoft));
    return new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: colors,
          borderWidth: 0,
          borderRadius: 2,
          barPercentage: 0.85,
          categoryPercentage: 0.75,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => fmt(item.parsed.x) + (opts.unit || ""),
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: PAL.grid },
            ticks: { font: { family: FONT_MONO, size: 10 }, color: PAL.text },
            border: { display: false },
          },
          y: {
            grid: { display: false },
            ticks: {
              font: { family: FONT_MONO, size: 11 },
              color: PAL.text,
              padding: 4,
            },
            border: { color: PAL.rule },
          },
        },
      },
    });
  }

  // Donut chart — for share/proportion data (intent, TLD, brand split)
  function drawDonut(ctx, labels, values, opts) {
    opts = opts || {};
    const colors = opts.colors || [PAL.gold, PAL.blue, PAL.amber, PAL.muted, PAL.text];
    return new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: "#020617",
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: {
            display: true,
            position: "right",
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              padding: 10,
              font: { family: FONT_MONO, size: 11 },
              color: PAL.text,
              usePointStyle: false,
              generateLabels: (chart) => {
                const data = chart.data;
                return data.labels.map((label, i) => ({
                  text: label + " · " + data.datasets[0].data[i] + (opts.unit || ""),
                  fillStyle: data.datasets[0].backgroundColor[i],
                  strokeStyle: data.datasets[0].backgroundColor[i],
                  lineWidth: 0,
                  index: i,
                }));
              },
            },
          },
          tooltip: {
            callbacks: {
              label: (item) => item.label + ": " + fmt(item.parsed) + (opts.unit || ""),
            },
          },
        },
      },
    });
  }

  // Slope chart — keyword position movement (multiple lines, May -> June)
  // Best for showing rank changes (lower = better, so reversed y-axis)
  function drawSlope(ctx, items, opts) {
    opts = opts || {};
    // items: [{label, before, after, color}]
    const labels = [opts.leftLabel || "Before", opts.rightLabel || "After"];
    const datasets = items.map((it, i) => ({
      label: it.label,
      data: [it.before, it.after],
      borderColor: it.color || (i % 2 ? PAL.gold : PAL.blue),
      backgroundColor: it.color || (i % 2 ? PAL.gold : PAL.blue),
      borderWidth: 2.5,
      pointRadius: 5,
      pointHoverRadius: 7,
      pointBackgroundColor: it.color || (i % 2 ? PAL.gold : PAL.blue),
      pointBorderColor: "#020617",
      pointBorderWidth: 2,
      tension: 0,
    }));
    return new Chart(ctx, {
      type: "line",
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: true,
            position: "right",
            labels: {
              boxWidth: 8,
              boxHeight: 8,
              padding: 8,
              font: { family: FONT_MONO, size: 11 },
              color: PAL.text,
              usePointStyle: true,
              pointStyle: "circle",
            },
          },
          tooltip: {
            callbacks: {
              title: (items) => items[0].label,
              label: (item) => item.dataset.label + ": rank #" + item.parsed.y,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { family: FONT_MONO, size: 11, weight: 600 },
              color: PAL.text,
              padding: 8,
            },
            border: { color: PAL.rule, width: 1 },
          },
          y: {
            reverse: true,
            beginAtZero: false,
            grid: { color: PAL.grid, drawBorder: false },
            ticks: {
              font: { family: FONT_MONO, size: 10 },
              color: PAL.text,
              padding: 6,
              callback: (v) => "#" + v,
            },
            border: { display: false },
          },
        },
      },
    });
  }

  // ---- Win-strip renderer (compact tile row for the executive summary style) ----
  function renderWinStrip(el, tiles) {
    if (!el) return;
    el.innerHTML = "";
    tiles.forEach((t, idx) => {
      const tile = document.createElement("div");
      tile.className = "win-tile is-" + (t.direction || "pos");
      // Right-edge variant on the last tile to keep tooltip in viewport
      const tipPosCls = (idx >= tiles.length - 2) ? " is-right" : "";
      const tipMarkup = t.tip
        ? '<span class="info-tip' + tipPosCls + '" tabindex="0" data-tip="' + t.tip.replace(/"/g, "&quot;") + '">i</span>'
        : '';
      tile.innerHTML =
        '<div class="win-tile__num">' + (t.num || "") + '</div>' +
        '<div class="win-tile__unit">' + (t.unit || "") + '</div>' +
        '<div class="win-tile__label">' + (t.label || "") + tipMarkup + '</div>' +
        (t.source ? '<div class="win-tile__source">' + t.source + '</div>' : '');
      el.appendChild(tile);
    });
  }

  // ---- Marquee row renderer ----
  function renderMarquee(el, cells) {
    el.innerHTML = "";
    cells.forEach((c) => {
      const cell = document.createElement("div");
      cell.className = "marquee-cell";
      const deltaCls = deltaClass(c.direction);
      cell.innerHTML =
        '<div class="marquee-cell__label">' + c.label + '</div>' +
        '<div class="marquee-cell__value">' + c.value + (c.unit ? '<span style="font-size:18px;color:var(--text-muted);margin-left:6px;font-weight:500;">' + c.unit + '</span>' : '') + '</div>' +
        '<div class="marquee-cell__sub">' + (c.sub || '') + '</div>' +
        '<span class="marquee-cell__delta ' + deltaCls + '">' + c.delta + '</span>';
      el.appendChild(cell);
    });
  }

  // ---- Trend strip renderer (4 sparklines) ----
  function renderTrendStrip(el, items, months) {
    el.innerHTML = "";
    items.forEach((it, i) => {
      const cell = document.createElement("div");
      cell.className = "trend-cell";
      const deltaCls = it.delta_pct > 0 ? "is-pos" : (it.delta_pct < 0 ? "is-neg" : "is-flat");
      const deltaTxt = it.delta_pct === null || it.delta_pct === undefined ? "—" :
                      (it.delta_pct > 0 ? "+" : "") + it.delta_pct + "%";
      cell.innerHTML =
        '<div class="trend-cell__label">' + it.label + '</div>' +
        '<div class="trend-cell__head">' +
          '<span class="trend-cell__current">' + fmt(it.current) + '<span style="font-size:14px;color:var(--text-muted);margin-left:4px;font-weight:500;font-variant-numeric:tabular-nums;">' + (it.unit || '') + '</span></span>' +
          '<span class="trend-cell__delta ' + deltaCls + '">' + deltaTxt + '</span>' +
        '</div>' +
        '<div class="trend-cell__spark-wrap"><canvas id="trend-spark-' + i + '" width="200" height="36"></canvas></div>';
      el.appendChild(cell);
      // Render the spark after the canvas is in the DOM (positioned wrapper has a fixed height now)
      setTimeout(() => {
        const c = document.getElementById("trend-spark-" + i);
        if (c && it.series) drawSpark(c.getContext("2d"), it.series);
      }, 50 + i * 40);
    });
  }

  // ---- Issue bar + editorial head common rendering ----
  function renderHead(data, sel) {
    const iss = document.querySelector(sel.issueNum); if (iss) iss.textContent = "Issue №" + (data.issue || "01");
    const per = document.querySelector(sel.periodLabel); if (per) per.textContent = data.period_label || "—";
    const ttl = document.querySelector(sel.title); if (ttl) ttl.innerHTML = data.headline || "";
    const std = document.querySelector(sel.standfirst); if (std) std.textContent = data.standfirst || "";
    if (data.byline) {
      const i = document.querySelector(sel.issuedAt); if (i) i.innerHTML = "<strong>" + (data.byline.issued || "") + "</strong>";
      const a = document.querySelector(sel.author); if (a) a.textContent = data.byline.author || "";
      const ds = document.querySelector(sel.dataSource); if (ds) ds.textContent = data.byline.data_source || "";
    }
  }

  // ---- Compare Hero — big before/after callout ----
  function renderCompareHero(el, data) {
    if (!el || !data) return;
    const cls = data.direction === "pos" ? "is-pos" : (data.direction === "neg" ? "is-neg" : "is-flat");
    el.innerHTML =
      '<div class="compare-hero__head">' +
      '  <div>' +
      '    <h2 class="compare-hero__title">' + (data.title || '') + '</h2>' +
      '    <div class="compare-hero__subtitle">' + (data.subtitle || '') + '</div>' +
      '  </div>' +
      '</div>' +
      '<div class="compare-hero__body">' +
      '  <div class="compare-hero__side compare-hero__side--left">' +
      '    <span class="compare-hero__period">' + (data.left_label || '') + '</span>' +
      '    <span class="compare-hero__value">' + (data.left_value || '—') + '</span>' +
      '    <span class="compare-hero__sub">' + (data.left_sub || '') + '</span>' +
      '  </div>' +
      '  <div class="compare-hero__arrow">' +
      '    <svg viewBox="0 0 160 24" fill="none">' +
      '      <line x1="4" y1="12" x2="140" y2="12" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 4"/>' +
      '      <path d="M130 4 L154 12 L130 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      '    </svg>' +
      '    <span class="compare-hero__delta ' + cls + '">' + (data.delta_value || '') + '</span>' +
      '    <span class="compare-hero__delta-pct ' + cls + '">' + (data.delta_pct || '') + '</span>' +
      '  </div>' +
      '  <div class="compare-hero__side compare-hero__side--right">' +
      '    <span class="compare-hero__period">' + (data.right_label || '') + '</span>' +
      '    <span class="compare-hero__value">' + (data.right_value || '—') + '</span>' +
      '    <span class="compare-hero__sub">' + (data.right_sub || '') + '</span>' +
      '  </div>' +
      '</div>' +
      (data.caption ? '<p class="compare-hero__caption">' + data.caption + '</p>' : '');
  }

  // ---- Deliverables grid — what shipped from 0 to N ----
  function renderDeliverables(el, items) {
    if (!el || !items) return;
    el.innerHTML = "";
    items.forEach(item => {
      const card = document.createElement("div");
      card.className = "deliverable-card" + (item.is_held ? " is-held" : "");
      const catCls = (item.category || "").replace(/\s+/g, "");
      const arrowChar = item.is_held ? "=" : "→";
      const heldTag = item.is_held ? '<span class="deliverable-card__tag">held</span>' : '';
      card.innerHTML =
        '<div class="deliverable-card__head">' +
        '  <div class="deliverable-card__metric">' + item.metric + '</div>' +
        '  <span class="deliverable-card__category is-' + catCls + '">' + (item.category || '') + '</span>' +
        '</div>' +
        '<div class="deliverable-card__values">' +
        '  <span class="deliverable-card__before">' + item.before + '</span>' +
        '  <span class="deliverable-card__arrow">' + arrowChar + '</span>' +
        '  <span class="deliverable-card__after">' + item.after + '<span class="deliverable-card__unit">' + (item.unit || '') + '</span>' + heldTag + '</span>' +
        '</div>' +
        '<p class="deliverable-card__why">' + (item.why || '') + '</p>';
      el.appendChild(card);
    });
  }

  // ---- Compare table ----
  function renderCompareTable(el, rows) {
    if (!el || !rows) return;
    el.innerHTML = "";
    rows.forEach(r => {
      const dCls = r.direction === "pos" ? "is-pos" : (r.direction === "neg" ? "is-neg" : "is-flat");
      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td class="col-metric">' + r.metric + '</td>' +
        '<td class="col-num col-may">' + r.may + '</td>' +
        '<td class="col-num col-jun">' + r.jun + '</td>' +
        '<td class="col-delta ' + dCls + '">' + r.delta + '</td>' +
        '<td class="col-delta ' + dCls + '">' + r.delta_pct + '</td>' +
        '<td class="col-note">' + (r.note || '') + '</td>';
      el.appendChild(tr);
    });
  }

  // ---- Public API ----
  root.MonthlyReport = {
    PAL: PAL,
    fmt: fmt,
    fmtSigned: fmtSigned,
    deltaClass: deltaClass,
    drawFeatureChart: drawFeatureChart,
    drawSpark: drawSpark,
    renderMarquee: renderMarquee,
    renderWinStrip: renderWinStrip,
    drawCompareBars: drawCompareBars,
    drawHorizontalBars: drawHorizontalBars,
    drawDonut: drawDonut,
    drawSlope: drawSlope,
    renderTrendStrip: renderTrendStrip,
    renderHead: renderHead,
    renderCompareHero: renderCompareHero,
    renderDeliverables: renderDeliverables,
    renderCompareTable: renderCompareTable,
  };
})(window);
