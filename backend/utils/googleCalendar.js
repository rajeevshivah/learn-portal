// ─────────────────────────────────────────────────────────
// Minimal Google Calendar client for the account that hosts the classes.
//
// Env (Render). Get them once with: node scripts/google-calendar-token.js
//   GOOGLE_CAL_CLIENT_ID       OAuth client (type "Desktop app"), Calendar API enabled
//   GOOGLE_CAL_CLIENT_SECRET
//   GOOGLE_CAL_REFRESH_TOKEN   for the account that hosts your classes
//   GOOGLE_CAL_ID              optional, default "primary"
// ─────────────────────────────────────────────────────────

const TOKEN_URL = () => process.env.GOOGLE_OAUTH_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const CAL_API   = () => (process.env.GOOGLE_CAL_API_BASE || 'https://www.googleapis.com/calendar/v3').replace(/\/$/, '');
const CAL_ID    = () => process.env.GOOGLE_CAL_ID || 'primary';

const isConfigured = () => Boolean(
  process.env.GOOGLE_CAL_CLIENT_ID && process.env.GOOGLE_CAL_CLIENT_SECRET && process.env.GOOGLE_CAL_REFRESH_TOKEN
);

// Access token from the stored refresh token, cached until shortly before it expires.
let cached = { token: '', exp: 0 };
async function accessToken() {
  if (cached.token && Date.now() < cached.exp) return cached.token;
  const res = await fetch(TOKEN_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CAL_CLIENT_ID,
      client_secret: process.env.GOOGLE_CAL_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_CAL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error === 'invalid_grant'
      ? 'Google rejected the saved permission (expired or revoked). Run scripts/google-calendar-token.js again and update GOOGLE_CAL_REFRESH_TOKEN on Render.'
      : `Could not get Google access (${data.error_description || data.error || res.status})`);
  }
  cached = { token: data.access_token, exp: Date.now() + Math.max(60, (data.expires_in || 3600) - 120) * 1000 };
  return cached.token;
}

async function gcal(method, path, { query, body } = {}) {
  const url = new URL(`${CAL_API()}/calendars/${encodeURIComponent(CAL_ID())}${path}`);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return {};
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Google Calendar error (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

module.exports = { isConfigured, gcal };
