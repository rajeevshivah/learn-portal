/**
 * Remote MCP endpoint — lets Claude (phone, claude.ai, desktop) run the admin panel.
 *
 *   https://<this backend>/mcp/<lp_key>
 *
 * The lp_ key is an "AI access key" made in Admin → Settings. It sits in the URL
 * because connector apps can't add headers; the URL is the secret, treat it like
 * a password. Every tool call goes through the normal REST API as that key's
 * owner, so permissions (read-only keys, revocation, expiry) all apply.
 *
 * Streamable HTTP in stateless mode: one transport per request, nothing kept in
 * memory, so it survives Render's free-tier sleeps and restarts.
 */
const express = require('express');
const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const User = require('../models/User');

const router = express.Router();
let mods = null;
const load = () => (mods ||= Promise.all([
  import('./tools.mjs'),
  import('@modelcontextprotocol/sdk/server/streamableHttp.js'),
]).then(([t, h]) => ({ buildServer: t.buildServer, Transport: h.StreamableHTTPServerTransport })));

// Calls our own API over loopback as the key's owner
const apiFor = (key, port) => async (method, route, { query, body, form } = {}) => {
  const url = new URL(`http://127.0.0.1:${port}/api/${route.replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  const headers = { Authorization: `Bearer ${key}` };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(url, { method, headers, body: payload, signal: AbortSignal.timeout(60_000) });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text.slice(0, 300) }; }
  if (!res.ok) { const e = new Error(data.message || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return data;
};
const noFiles = async () => { throw new Error('Uploading a file from a computer only works with the local MCP server. Share a link instead, or upload it in the admin panel.'); };

// Key in the URL → valid, not expired/revoked, owned by an admin. (MCP itself is
// all POSTs, so read-only vs write is enforced on each tool's API call, not here.)
router.use('/:key', async (req, res, next) => {
  const key = String(req.params.key || '');
  if (!key.startsWith('lp_')) return res.status(404).json({ message: 'Not found' });
  try {
    const digest = crypto.createHash('sha256').update(key).digest('hex');
    const k = await ApiKey.findOne({ digest, revokedAt: null, expiresAt: { $gt: new Date() } });
    if (!k) return res.status(401).json({ message: 'Access key is invalid, expired or revoked' });
    const user = await User.findById(k.user).select('name email role');
    if (!user || user.role !== 'admin') return res.status(403).json({ message: 'This key is not an admin key' });
    req.user = user;
    ApiKey.updateOne({ _id: k._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
    next();
  } catch (e) { next(e); }
});

router.all('/:key', async (req, res) => {
  // A browser opening the URL: say what it is instead of a JSON-RPC error
  if (req.method === 'GET' && !String(req.headers.accept || '').includes('text/event-stream')) {
    return res.type('text').send(`learn-portal MCP is running for ${req.user.email}. Add this URL as a custom connector in Claude.`);
  }
  try {
    const { buildServer, Transport } = await load();
    const server = buildServer({ api: apiFor(req.params.key, req.socket.localPort || process.env.PORT || 5000), fileForm: noFiles });
    const transport = new Transport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error('MCP error:', e.message);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
  }
});

module.exports = router;
