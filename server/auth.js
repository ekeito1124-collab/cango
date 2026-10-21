import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from './db.js';
import { HttpError, parseCookies } from './http.js';

const COOKIE = 'cango_session';
const MAX_AGE = 60 * 60 * 24 * 30;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    // Vercel 上（本番・プレビューとも）では必須。固定の開発用キーはローカル開発でのみ使う
    if (process.env.VERCEL_ENV) throw new Error('AUTH_SECRET が設定されていません');
    return new TextEncoder().encode('cango-local-development-secret-change-me');
  }
  return new TextEncoder().encode(s);
}

const secure = () => process.env.VERCEL_ENV !== undefined || process.env.NODE_ENV === 'production';

export async function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw, hash) {
  return bcrypt.compare(pw, hash);
}

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 200) throw new HttpError(400, 'weak_password');
}

export function validateEmail(email) {
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'invalid_email');
  }
  return email.trim().toLowerCase();
}

export async function setSession(res, user) {
  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure() ? '; Secure' : ''}`,
  );
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure() ? '; Secure' : ''}`);
}

export async function currentUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return await prisma.user.findUnique({ where: { id: payload.sub }, include: { shop: { select: { id: true, slug: true, name: true } } } });
  } catch {
    return null;
  }
}

export function requireUser(user, roles) {
  if (!user) throw new HttpError(401, 'login_required');
  if (roles && !roles.includes(user.role)) throw new HttpError(403, 'forbidden');
  return user;
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    lang: u.lang,
    currency: u.currency,
    cardDemoCompleted: u.cardDemoCompleted,
    shop: u.shop || null,
  };
}

export function newToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: crypto.createHash('sha256').update(token).digest('hex') };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
