const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mykoshiarlfhvpvrblvi.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ZETUPAY_SECRET_KEY = process.env.ZETUPAY_SECRET_KEY;
const SITE_URL = (process.env.SITE_URL || 'https://black-dear-tips.com').replace(/\/$/, '');

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function allowCors(res) {
  res.setHeader('Access-Control-Allow-Origin', SITE_URL);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function requirePost(req, res) {
  if (req.method === 'OPTIONS') {
    allowCors(res);
    res.status(204).end();
    return false;
  }
  if (req.method !== 'POST') {
    allowCors(res);
    json(res, 405, { success: false, error: 'Method not allowed' });
    return false;
  }
  return true;
}

function requireConfig(res) {
  const missing = [];
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!ZETUPAY_SECRET_KEY) missing.push('ZETUPAY_SECRET_KEY');
  if (missing.length) {
    json(res, 500, { success: false, error: 'Server payment configuration is incomplete.' });
    return false;
  }
  return true;
}

function normalizePhone(value) {
  let p = String(value || '').trim().replace(/[\s-]/g, '');
  if (p.startsWith('+254')) p = p.slice(1);
  if (p.startsWith('07') || p.startsWith('01')) p = '254' + p.slice(1);
  return p;
}

function isValidKenyanPhone(phone) {
  return /^254(?:7|1)\d{8}$/.test(phone);
}

function safeRefPart(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24) || 'VIP';
}

function makeReference(plan) {
  return `BDT-${safeRefPart(plan)}-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function makeAccessToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function getRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (req.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body));
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function verifyZetuPaySignature(req, rawBody) {
  const header = String(req.headers['x-zetupay-signature'] || '');
  const parts = {};
  for (const item of header.split(',')) {
    const i = item.indexOf('=');
    if (i > 0) parts[item.slice(0, i)] = item.slice(i + 1);
  }
  const t = Number(parts.t);
  const v1 = String(parts.v1 || '');
  if (!Number.isFinite(t) || !v1) return false;
  if (Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = crypto.createHmac('sha256', ZETUPAY_SECRET_KEY).update(`${t}.${rawBody.toString()}`).digest('hex');
  const a = Buffer.from(v1);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function supabase(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };
  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!response.ok) {
    const message = data && data.message ? data.message : `Supabase request failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function getPlan(plan) {
  const fallback = {
    daily: { name: 'DAILY', amount: 500, duration_days: 1 },
    weekly: { name: 'WEEKLY', amount: 3500, duration_days: 7 },
    monthly: { name: 'MONTHLY', amount: 15000, duration_days: 30 },
  };
  if (!fallback[plan]) return null;
  try {
    const rows = await supabase(`vip_plans?select=name,price,duration_days,active&name=ilike.${encodeURIComponent(plan)}&limit=1`);
    if (Array.isArray(rows) && rows[0] && rows[0].active !== false) {
      const amount = Number(rows[0].price);
      const days = Number(rows[0].duration_days);
      if (Number.isFinite(amount) && amount > 0 && Number.isFinite(days) && days > 0) {
        return { name: String(rows[0].name || plan).toUpperCase(), amount, duration_days: days };
      }
    }
  } catch (_) {
    // Keep the known-safe fallback prices if the optional pricing table is unavailable.
  }
  return fallback[plan];
}

module.exports = {
  SITE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ZETUPAY_SECRET_KEY,
  json, allowCors, requirePost, requireConfig, normalizePhone, isValidKenyanPhone,
  makeReference, makeAccessToken, getRawBody, verifyZetuPaySignature, supabase, getPlan,
};
