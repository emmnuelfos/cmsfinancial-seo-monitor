// Auth gate — single password, SHA-256 hash compared client-side.
// Hash is loaded from data/auth.json (written by GitHub Actions from DASHBOARD_PASSWORD secret).
// Session persists in localStorage. Not bulletproof — sufficient for SEO dashboard privacy.

const AUTH_KEY = 'cmsfinancial_seo_auth_v1';
const AUTH_TTL_DAYS = 30;

// ---------- SHA-256 (Web Crypto with pure-JS fallback for non-HTTPS) ----------
async function sha256(str) {
  // Web Crypto path — fast, available on HTTPS and localhost
  try {
    if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
      const buf = new TextEncoder().encode(str);
      const hash = await window.crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    // fall through to pure-JS path
  }
  // Pure-JS fallback — works over plain HTTP. Slower (~5ms) but correct.
  return sha256Pure(str);
}

// Compact pure-JS SHA-256. Source: public-domain implementation widely used as a fallback.
function sha256Pure(input) {
  // UTF-8 encode the input string into a byte array
  function utf8Encode(s) {
    const out = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F)); }
      else if (c < 0xD800 || c >= 0xE000) { out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)); }
      else {
        i++;
        c = 0x10000 + (((c & 0x3FF) << 10) | (s.charCodeAt(i) & 0x3FF));
        out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
    }
    return out;
  }

  const bytes = utf8Encode(input);
  const bitLen = bytes.length * 8;

  // SHA-256 constants
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];

  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];

  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  // 64-bit big-endian bit-length. JS bitwise ops are 32-bit, so high 4 bytes are always 0
  // (works correctly for messages up to 2^32 bits / 512 MB — fine for any password).
  for (let i = 7; i >= 0; i--) {
    const shift = i * 8;
    bytes.push(shift < 32 ? (bitLen >>> shift) & 0xff : 0);
  }

  function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
  function w32(arr, off) { return (arr[off] << 24) | (arr[off+1] << 16) | (arr[off+2] << 8) | arr[off+3]; }

  const W = new Uint32Array(64);
  for (let blk = 0; blk < bytes.length; blk += 64) {
    for (let t = 0; t < 16; t++) W[t] = w32(bytes, blk + t * 4) >>> 0;
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, W[t-15]) ^ rotr(18, W[t-15]) ^ (W[t-15] >>> 3);
      const s1 = rotr(17, W[t-2]) ^ rotr(19, W[t-2]) ^ (W[t-2] >>> 10);
      W[t] = (W[t-16] + s0 + W[t-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ ((~e) & g);
      const T1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const T2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + T1) >>> 0;
      d = c; c = b; b = a; a = (T1 + T2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }

  return H.map(v => v.toString(16).padStart(8, '0')).join('');
}

// ---------- Auth flow ----------
async function checkAuth() {
  const stored = localStorage.getItem(AUTH_KEY);
  if (!stored) return false;
  try {
    const { hash, expires } = JSON.parse(stored);
    if (Date.now() > expires) return false;
    const meta = await fetch('./data/auth.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
    if (!meta || !meta.hash) return false;
    return hash === meta.hash;
  } catch (e) {
    return false;
  }
}

async function attemptLogin(password) {
  try {
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
  } catch (e) {
    return { ok: false, error: 'Login failed: ' + (e && e.message ? e.message : 'unknown error') };
  }
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
    const back = window.location.pathname.split('/').pop() || 'monthly.html';
    window.location.href = `./login.html?back=${encodeURIComponent(back)}`;
  }
}

// Auto-run gate
if (typeof window !== 'undefined') {
  gatePage();
}

window.CMSAuth = { checkAuth, attemptLogin, logout, sha256 };
