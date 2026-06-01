// Chart.js configuration for the Terminal Editorial aesthetic.
// All charts: dark canvas, subtle grids, JetBrains Mono for axes, gradient area fills.

const CHART_COLORS = {
  pos: '#22C55E',
  neg: '#EF4444',
  info: '#38BDF8',
  warn: '#F59E0B',
  gold: '#FBBF24',
  blue: '#60A5FA',
  text: '#94A3B8',
  textStrong: '#F8FAFC',
  grid: 'rgba(51, 65, 85, 0.4)',
  gridFaint: 'rgba(51, 65, 85, 0.2)',
};

// Set Chart.js defaults once
function setupChartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = CHART_COLORS.text;
  Chart.defaults.borderColor = CHART_COLORS.grid;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.legend.labels.font = { family: "'JetBrains Mono', monospace", size: 10, weight: '500' };
  Chart.defaults.plugins.tooltip.backgroundColor = '#0F172A';
  Chart.defaults.plugins.tooltip.borderColor = '#334155';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.titleFont = { family: "'Inter', sans-serif", size: 12, weight: '600' };
  Chart.defaults.plugins.tooltip.bodyFont = { family: "'JetBrains Mono', monospace", size: 11 };
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.boxPadding = 4;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.displayColors = true;
  Chart.defaults.elements.point.radius = 0;
  Chart.defaults.elements.point.hoverRadius = 5;
  Chart.defaults.elements.point.hoverBorderWidth = 2;
  Chart.defaults.elements.line.tension = 0.3;
  Chart.defaults.elements.line.borderWidth = 2;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.responsive = true;
  Chart.defaults.animation.duration = 800;
  Chart.defaults.animation.easing = 'easeOutCubic';
}

// Helper to make a gradient fill below a line
function makeAreaGradient(ctx, area, hex) {
  if (!area) return 'transparent';
  const gradient = ctx.createLinearGradient(0, area.top, 0, area.bottom);
  const r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16);
  gradient.addColorStop(0, `rgba(${r},${g},${b},0.25)`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},0.0)`);
  return gradient;
}

// ---- Time-series with gradient fill ----
function timeSeriesChart(canvas, { labels, datasets, yLabel }) {
  setupChartDefaults();
  const data = {
    labels,
    datasets: datasets.map(ds => ({
      label: ds.label,
      data: ds.data,
      borderColor: ds.color || CHART_COLORS.info,
      backgroundColor: (ctx) => makeAreaGradient(ctx.chart.ctx, ctx.chart.chartArea, ds.color || CHART_COLORS.info),
      fill: true,
      pointBackgroundColor: ds.color || CHART_COLORS.info,
      pointBorderColor: '#0F172A',
    })),
  };
  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data,
    options: {
      interaction: { intersect: false, mode: 'index' },
      scales: {
        x: { grid: { color: CHART_COLORS.gridFaint, drawTicks: false }, ticks: { padding: 8 } },
        y: { grid: { color: CHART_COLORS.grid, drawTicks: false }, ticks: { padding: 8 }, beginAtZero: false,
              title: yLabel ? { display: true, text: yLabel, color: CHART_COLORS.text, font: { family: "'JetBrains Mono', monospace", size: 10, weight: '500' } } : undefined },
      },
      plugins: {
        legend: { display: datasets.length > 1, position: 'top', align: 'end' },
      },
    },
  });
}

// ---- Sparkline (used inside scorecards) ----
function sparkline(canvas, values, color = CHART_COLORS.info) {
  setupChartDefaults();
  return new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: values.map((_, i) => i),
      datasets: [{
        data: values,
        borderColor: color,
        backgroundColor: (ctx) => makeAreaGradient(ctx.chart.ctx, ctx.chart.chartArea, color),
        fill: true,
        tension: 0.4,
        borderWidth: 1.5,
      }],
    },
    options: {
      scales: { x: { display: false }, y: { display: false } },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      elements: { point: { radius: 0 } },
      animation: { duration: 1200 },
    },
  });
}

// ---- Bar chart ----
function barChart(canvas, { labels, data, colors, horizontal = false, label = '' }) {
  setupChartDefaults();
  return new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label,
        data,
        backgroundColor: colors || labels.map(() => CHART_COLORS.info),
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      scales: {
        x: { grid: { color: horizontal ? CHART_COLORS.grid : CHART_COLORS.gridFaint, drawTicks: false }, ticks: { padding: 8 }, beginAtZero: true },
        y: { grid: { color: horizontal ? CHART_COLORS.gridFaint : CHART_COLORS.grid, drawTicks: false }, ticks: { padding: 8 }, beginAtZero: true },
      },
      plugins: { legend: { display: false } },
    },
  });
}

// ---- Doughnut / pie ----
function doughnutChart(canvas, { labels, data, colors }) {
  setupChartDefaults();
  return new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: '#0F172A',
        borderWidth: 2,
      }],
    },
    options: {
      cutout: '68%',
      plugins: {
        legend: { display: true, position: 'right', align: 'center' },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed}` } },
      },
    },
  });
}

window.CMSCharts = { timeSeriesChart, sparkline, barChart, doughnutChart, COLORS: CHART_COLORS };
