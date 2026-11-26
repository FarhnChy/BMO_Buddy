import { createHmac, createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const COOKIE = 'bmo_session';
const TTL = 7 * 24 * 60 * 60;
export function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
export async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
export async function verifyPassword(password, hash) {
  if (typeof password !== 'string' || password.length > 1024 || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash || '')) return false;
  const [salt, digest] = hash.split(':');
  const candidate = await scrypt(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(digest, 'hex'));
}
export function sessionCookie(secret, now = Date.now()) {
  const value = `${Math.floor(now / 1000) + TTL}.${randomBytes(16).toString('hex')}`;
  const signature = createHmac('sha256', secret).update(value).digest('hex');
  return `${COOKIE}=${value}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL}`;
}
export function hasSession(request, secret, now = Date.now()) {
  if (!secret || secret.length < 32) return false;
  const token = (request.headers.get('cookie') || '').split(';').map(p => p.trim()).find(p => p.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token || !/^\d+\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expires, nonce, signature] = token.split('.');
  if (Number(expires) <= now / 1000 || Number(expires) > now / 1000 + TTL + 60) return false;
  return sameSecret(signature, createHmac('sha256', secret).update(`${expires}.${nonce}`).digest('hex'));
}
export const clearSessionCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
export function loginBucket(request, secret) {
  // Vercel replaces this header with the connecting client's address.
  const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  return createHmac('sha256', secret).update(ip).digest('hex');
}
