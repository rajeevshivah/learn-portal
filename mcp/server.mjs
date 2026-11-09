#!/usr/bin/env node
/**
 * Learn Portal MCP server — run learn.rajeevshivah.me's admin panel from
 * Claude (Desktop / Code) or GPT (Codex). Talks ONLY to the public API with a
 * personal access key, so every action goes through the same permission
 * checks as the website. It never touches the database directly.
 *
 * Environment:
 *   LEARN_API_URL   e.g. https://learn-portal-backend.onrender.com/api
 *   LEARN_API_KEY   an "lp_…" key from Admin → Settings → AI access keys
 *
 * `node server.mjs --check` verifies the URL and key, then exits.
 *
 * You don't need this file to use Claude on your phone or on claude.ai: add the
 * connector URL from Admin → Settings → AI access keys instead (see README).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
// The tools live in backend/mcp/tools.mjs so the same set is served over HTTPS from
// Render (for Claude on your phone). This file is the local stdio wrapper around them.
// Run `npm install` in ../backend first: the SDK is resolved from there.
import { buildServer, stdioTransport } from '../backend/mcp/tools.mjs';

// ─────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────
const RAW_URL = (process.env.LEARN_API_URL || '').trim().replace(/\/+$/, '');
const KEY = (process.env.LEARN_API_KEY || '').trim();

function fatal(msg) { console.error(`[learn-portal-mcp] ${msg}`); process.exit(1); }
if (!RAW_URL) fatal('Set LEARN_API_URL, e.g. https://learn-portal-backend.onrender.com/api');
if (!KEY.startsWith('lp_')) fatal('Set LEARN_API_KEY to an "lp_…" key from Admin → Settings → AI access keys');
let BASE;
try { BASE = new URL(RAW_URL.endsWith('/api') ? RAW_URL : `${RAW_URL}/api`); }
catch { fatal('LEARN_API_URL is not a valid URL'); }
const local = ['localhost', '127.0.0.1', '[::1]'].includes(BASE.hostname);
if (BASE.protocol !== 'https:' && !local) fatal('LEARN_API_URL must use https:// (keys must never travel unencrypted)');

// ─────────────────────────────────────────────────────────
// HTTP helper
// ─────────────────────────────────────────────────────────
async function api(method, route, { query, body, form } = {}) {
  const url = new URL(`${BASE.pathname.replace(/\/$/, '')}/${route.replace(/^\//, '')}`, BASE);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));

  const headers = { Authorization: `Bearer ${KEY}` };
  let payload;
  if (form) payload = form;                       // multipart: fetch sets the boundary
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  // Render's free tier can take ~50s to wake up — allow for it, retry once on network errors.
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { method, headers, body: payload, redirect: 'error', signal: AbortSignal.timeout(90_000) });
      const text = await res.text();
      let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text.slice(0, 300) }; }
      if (!res.ok) {
        const e = new Error(data.message || `HTTP ${res.status}`);
        e.status = res.status;
        throw e;
      }
      return data;
    } catch (e) {
      if (e.status || attempt >= 2 || method !== 'GET') throw e;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function fileForm(filePath, fields = {}) {
  const abs = path.resolve(filePath);
  const buf = await fs.readFile(abs);
  const fd = new FormData();
  fd.append('file', new Blob([buf]), path.basename(abs));
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) fd.append(k, String(v));
  return { fd, name: path.basename(abs), ext: path.extname(abs).slice(1).toLowerCase(), size: buf.length };
}

// ─────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────
if (process.argv.includes('--check')) {
  try {
    const o = await api('GET', 'events/admin/all');
    console.log(`✓ Connected to ${BASE.href} — ${o.length} events visible. The key works.`);
    process.exit(0);
  } catch (e) { fatal(`Check failed: ${e.message}`); }
} else {
  await buildServer({ api, fileForm }).connect(await stdioTransport());
}
