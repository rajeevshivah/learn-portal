#!/usr/bin/env node
/**
 * One-time setup for "Meet link per class": gets a Google Calendar refresh token
 * for the account that owns your class meetings (rajeev@rajeevshivah.me).
 *
 *   cd backend
 *   node scripts/google-calendar-token.js <CLIENT_ID> <CLIENT_SECRET>
 *
 * It opens the Google permission page in your browser (or prints the link to
 * copy). Choose the class account, allow access, and the token is printed here. Put the three values on Render (Environment):
 *   GOOGLE_CAL_CLIENT_ID, GOOGLE_CAL_CLIENT_SECRET, GOOGLE_CAL_REFRESH_TOKEN
 *
 * The OAuth client must be type "Desktop app", in a Google Cloud project where
 * the Google Calendar API is enabled.
 */
const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');

const [clientId, clientSecret] = process.argv.slice(2).map(s => String(s || '').trim());
if (!clientId || !clientSecret) {
  console.error('Usage: node scripts/google-calendar-token.js <CLIENT_ID> <CLIENT_SECRET>');
  process.exit(1);
}

const PORT = 5055;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const state = crypto.randomBytes(12).toString('hex');

const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline',
  prompt: 'consent',          // makes Google return a refresh token every time
  state,
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  if (url.pathname !== '/callback') { res.writeHead(404); return res.end(); }
  const done = (code, text) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(text); };

  if (url.searchParams.get('state') !== state) return done(400, 'State mismatch. Run the script again.');
  if (url.searchParams.get('error')) {
    done(400, `Google said: ${url.searchParams.get('error')}. You can close this tab.`);
    console.error(`\nGoogle said: ${url.searchParams.get('error')}`);
    return server.close();
  }

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: url.searchParams.get('code'), client_id: clientId, client_secret: clientSecret,
        redirect_uri: REDIRECT, grant_type: 'authorization_code',
      }),
    });
    const data = await r.json();
    if (!r.ok || !data.refresh_token) throw new Error(data.error_description || data.error || 'No refresh token returned');

    done(200, 'Done. Go back to the terminal. You can close this tab.');
    console.log('\nAdd these on Render → your backend → Environment, then redeploy:\n');
    console.log(`GOOGLE_CAL_CLIENT_ID=${clientId}`);
    console.log(`GOOGLE_CAL_CLIENT_SECRET=${clientSecret}`);
    console.log(`GOOGLE_CAL_REFRESH_TOKEN=${data.refresh_token}`);
    console.log('\nKeep the refresh token secret: it can edit events in that calendar.\n');
  } catch (e) {
    done(500, 'Something went wrong. See the terminal.');
    console.error(`\nCould not get the token: ${e.message}`);
  }
  server.close();
});

server.listen(PORT, '127.0.0.1', () => {
  // Open the browser ourselves: a long link copied from a wrapped terminal line gets cut.
  const open = process.platform === 'win32' ? `start "" "${authUrl}"`
    : process.platform === 'darwin' ? `open "${authUrl}"` : `xdg-open "${authUrl}"`;
  exec(open, () => {});
  console.log('\n1. Your browser should open Google’s permission page now.');
  console.log('   If it doesn’t, copy this link (all of it, it’s one line) into the browser:\n');
  console.log(authUrl);
  console.log('\n2. Pick your class account and allow access to its calendar events.');
  console.log('   If Google warns the app is unverified: Advanced → Go to … (it is your own app).\n');
  console.log(`Waiting on ${REDIRECT} …`);
});
