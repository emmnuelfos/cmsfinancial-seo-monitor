// Shared dashboard utilities — data loading, formatting, table sort, count-up.

// ---- Data fetching with cache-bust ----
async function loadData(name) {
  const r = await fetch(`./data/${name}.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Failed to load ${name}: ${r.status}`);
  return r.json();
}

// ---- Number formatting ----
const fmt = {
  int: (n) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US'),
  comma: (n) => fmt.int(n),
  decimal: (n, d = 2) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }),
  pct: (n, d = 1) => (n == null || isNaN(n)) ? '—' : `${Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}%`,
  delta: (n, d = 0) => {
    if (n == null || isNaN(n)) return '—';
    const sign = n > 0 ? '+' : '';
    return `${sign}${Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  },
  short: (n) => {
    if (n == null || isNaN(n)) return '—';
    n = Number(n);
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
  },
  date: (s) => {
    if (!s) return '—';
    const d = new Date(s);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  dateShort: (s) => {
    if (!s) return '—';
    const d = new Date(s);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },
};

// ---- Animated count-up ----
function countUp(el, target, opts = {}) {
  const { duration = 900, decimals = 0, suffix = '', prefix = '' } = opts;
  const start = 0;
  const startTime = performance.now();
  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    const current = start + (target - start) * eased;
    el.textContent = prefix + Number(current).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ---- Scorecard delta builder ----
function scorecardDelta(curr, prev) {
  if (prev == null || curr == null) return { text: '—', cls: 'is-flat', arrow: '' };
  const diff = curr - prev;
  if (Math.abs(diff) < 0.0001) return { text: 'No change', cls: 'is-flat', arrow: '' };
  const pct = prev !== 0 ? (diff / prev) * 100 : null;
  const arrow = diff > 0
    ? `<svg class="scorecard__delta-icon" viewBox="0 0 12 12" fill="none"><path d="M6 2L10 8H2L6 2Z" fill="currentColor"/></svg>`
    : `<svg class="scorecard__delta-icon" viewBox="0 0 12 12" fill="none"><path d="M6 10L2 4H10L6 10Z" fill="currentColor"/></svg>`;
  const cls = diff > 0 ? 'is-pos' : 'is-neg';
  const text = pct != null ? `${diff > 0 ? '+' : ''}${pct.toFixed(1)}%` : fmt.delta(diff);
  return { text, cls, arrow };
}

// ---- Table sorting ----
function makeTableSortable(table) {
  const ths = table.querySelectorAll('th[data-sort]');
  ths.forEach((th, idx) => {
    th.addEventListener('click', () => {
      const tbody = table.querySelector('tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const type = th.dataset.sort; // 'num' | 'str' | 'date'
      const isActive = th.hasAttribute('data-sort-active');
      const newDir = isActive && th.dataset.sortDir === 'asc' ? 'desc' : 'asc';
      // clear other ths
      ths.forEach(t => { t.removeAttribute('data-sort-active'); t.dataset.sortDir = ''; const arr = t.querySelector('.sort-arrow'); if (arr) arr.textContent = ''; });
      th.setAttribute('data-sort-active', '');
      th.dataset.sortDir = newDir;
      const arrow = th.querySelector('.sort-arrow');
      if (arrow) arrow.textContent = newDir === 'asc' ? '▲' : '▼';

      rows.sort((a, b) => {
        const av = a.children[idx].dataset.sortValue ?? a.children[idx].textContent;
        const bv = b.children[idx].dataset.sortValue ?? b.children[idx].textContent;
        let cmp;
        if (type === 'num') cmp = (parseFloat(av) || 0) - (parseFloat(bv) || 0);
        else if (type === 'date') cmp = new Date(av).getTime() - new Date(bv).getTime();
        else cmp = String(av).localeCompare(String(bv));
        return newDir === 'asc' ? cmp : -cmp;
      });
      rows.forEach(r => tbody.appendChild(r));
    });
  });
}

// ---- Position pill class ----
function positionClass(pos) {
  pos = Number(pos);
  if (pos >= 1 && pos <= 3)  return 'is-top';
  if (pos >= 4 && pos <= 10) return 'is-mid';
  if (pos >= 11 && pos <= 30) return 'is-low';
  if (pos >= 31) return 'is-bottom';
  return 'is-bottom';
}

// ---- Smart helpers ----
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

window.CMS = { loadData, fmt, countUp, scorecardDelta, makeTableSortable, positionClass, $, $$ };
