// Auth gate — single password, SHA-256 hash compared client-side.
// Hash is loaded from data/auth.json (written by GitHub Actions from DASHBOARD_PASSWORD secret).
// Session persists in localStorage. Not bulletproof — sufficient for SEO dashboard privacy.

const AUTH_KEY = 'cmsprime_seo_auth_v1';
const AUTH_TTL_DAYS = 30;

async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkAuth() {
  const stored = localStorage.getItem(AUTH_KEY);
  if (!stored) return false;
  try {
    const { hash, expires } = JSON.parse(stored);
    if (Date.now() > expires) return false;
    // Verify the stored hash still matches the current expected hash
    const meta = await fetch('./data/auth.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
    if (!meta || !meta.hash) return false;
    return hash === meta.hash;
  } catch (e) {
    return false;
  }
}

async function attemptLogin(password) {
  const meta = await fetch('./data/auth.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
  if (!meta || !meta.hash) {
    return { ok: false, error: 'Auth configuration not found.' };
  }
  const candidate = await sha256(password);
  if (candidate !== meta.hash) {
    return { ok: false, error: 'Incorrect password.' };
  }
  const session = {
    hash: candidate,
    expires: Date.now() + AUTH_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return { ok: true };
}

function logout() {
  localStorage.removeItem(AUTH_KEY);
  window.location.href = './login.html';
}

// Gate any page that includes this script (except login.html itself)
async function gatePage() {
  if (window.location.pathname.endsWith('/login.html') || window.location.pathname.endsWith('/login')) return;
  const ok = await checkAuth();
  if (!ok) {
    const back = window.location.pathname.split('/').pop() || 'index.html';
    window.location.href = `./login.html?back=${encodeURIComponent(back)}`;
  }
}

// Auto-run gate
if (typeof window !== 'undefined') {
  gatePage();
}

window.CMSAuth = { checkAuth, attemptLogin, logout, sha256 };
