const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const net = require('node:net');
const { URL } = require('node:url');

const MAX_BODY = 5 * 1024 * 1024;
const MAX_RESPONSE = 10 * 1024 * 1024;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const BLOCKED_HEADERS = new Set([
  'host', 'content-length', 'connection', 'transfer-encoding',
  'x-proxy-key', 'authorization', 'proxy-authorization'
]);

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      a === 0 || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    return s === '::1' || s === '::' || s.startsWith('fc') || s.startsWith('fd') ||
      s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') ||
      s.startsWith('feb') || s.startsWith('ff');
  }
  return true;
}

function constantTime(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

function allowedHost(host) {
  const list = (process.env.PROXY_ALLOWED_HOSTS || '')
    .split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return !list.length || list.some(x => host === x || host.endsWith('.' + x));
}

function sessionSecret() {
  return process.env.PROXY_SESSION_SECRET || process.env.PROXY_API_KEY || '';
}

function signSession(timestamp) {
  return crypto.createHmac('sha256', sessionSecret()).update(String(timestamp)).digest('base64url');
}

function validSession(value) {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 2) return false;
  const timestamp = Number(parts[0]);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || Date.now() - timestamp > SESSION_TTL_MS) return false;
  const expected = signSession(timestamp);
  return constantTime(expected, parts[1]);
}

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const item of cookies) {
    const [key, ...rest] = item.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function setSessionCookie(res) {
  const timestamp = Date.now();
  const token = `${timestamp}.${signSession(timestamp)}`;
  res.setHeader('Set-Cookie', `proxy_session=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; HttpOnly; Secure; SameSite=Lax`);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!ALLOWED_METHODS.has(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const expected = process.env.PROXY_API_KEY || '';
  const configured = Boolean(expected && sessionSecret());
  const existingSession = validSession(cookieValue(req, 'proxy_session'));
  const headerKey = req.headers['x-proxy-key'] || '';
  const authenticatedByKey = configured && constantTime(expected, headerKey);

  if (!configured || (!existingSession && !authenticatedByKey)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (authenticatedByKey && !existingSession) setSessionCookie(res);

  let target;
  try {
    target = new URL(String(req.query.url || ''));
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (!['http:', 'https:'].includes(target.protocol) || !target.hostname) {
    return res.status(400).json({ error: 'Only HTTP(S) URLs are allowed' });
  }

  const host = target.hostname.toLowerCase();
  if (!allowedHost(host)) return res.status(403).json({ error: 'Destination not allowed' });

  try {
    const records = await dns.lookup(host, { all: true });
    if (!records.length || records.some(x => isPrivate(x.address))) {
      return res.status(403).json({ error: 'Private destination blocked' });
    }
  } catch {
    return res.status(502).json({ error: 'Destination cannot be resolved' });
  }

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!BLOCKED_HEADERS.has(k.toLowerCase()) && typeof v === 'string') headers[k] = v;
  }

  let body;
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    if (Number(req.headers['content-length'] || 0) > MAX_BODY) return res.status(413).json({ error: 'Request too large' });
    if (typeof req.body === 'string') body = req.body;
    else if (req.body !== undefined) body = JSON.stringify(req.body);
    if (body && Buffer.byteLength(body) > MAX_BODY) return res.status(413).json({ error: 'Request too large' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      signal: controller.signal
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_RESPONSE) return res.status(502).json({ error: 'Upstream response too large' });

    res.status(upstream.status);
    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('content-type', ct);
    const location = upstream.headers.get('location');
    if (location) res.setHeader('location', location);
    res.setHeader('cache-control', 'no-store');
    return res.send(buf);
  } catch {
    return res.status(502).json({ error: 'Upstream request failed' });
  } finally {
    clearTimeout(timer);
  }
};
