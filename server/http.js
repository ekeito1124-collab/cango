export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export const bad = (code, message) => new HttpError(400, code, message);
export const notFound = (code = 'not_found') => new HttpError(404, code);
export const forbidden = (code = 'forbidden') => new HttpError(403, code);
export const conflict = (code, message) => new HttpError(409, code, message);

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  // Vercel Functions は JSON を req.body に展開済み。ローカル開発時は自前で読む
  if (req.body !== undefined) {
    if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
    return req.body || {};
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw bad('invalid_json');
  }
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// 入力値の検証ヘルパー
export function str(v, { max = 2000, required = false, name = 'value' } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad('missing_' + name);
    return null;
  }
  if (typeof v !== 'string') throw bad('invalid_' + name);
  const s = v.trim();
  if (s.length > max) throw bad('too_long_' + name);
  if (required && !s) throw bad('missing_' + name);
  return s;
}

export function int(v, { min = -Infinity, max = Infinity, name = 'value', required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad('missing_' + name);
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad('invalid_' + name);
  return n;
}

export function codes(v, allowed, name = 'codes') {
  if (v === undefined || v === null || v === '') return [];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  const list = arr.map((x) => String(x).trim()).filter(Boolean);
  for (const c of list) if (!allowed.includes(c)) throw bad('invalid_' + name);
  return [...new Set(list)];
}

export function isDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export function isTime(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}
