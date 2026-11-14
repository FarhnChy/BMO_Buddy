import { handleApi } from './core.mjs';
import { getDatabase } from './database.mjs';
import { sameSecret, verifyPassword, sessionCookie, hasSession, clearSessionCookie, loginBucket } from './auth.mjs';
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } });

export async function handleRequest(request, env = process.env, suppliedDb) {
  const url = new URL(request.url);
  // The explicit route query survives Vercel's internal function rewrite.
  const routed = url.searchParams.get('route');
  if (routed !== null) { url.pathname = `/api/${routed}`; url.searchParams.delete('route'); }
  if (!/^\/api\/[a-z0-9/-]+$/.test(url.pathname)) return json({ error: 'Action not found.' }, 404);
  const path = url.pathname;
  if (!env.BMO_SESSION_SECRET || env.BMO_SESSION_SECRET.length < 32 || !env.BMO_OWNER_PASSWORD_HASH) return json({ error: 'App setup is incomplete. Configure the owner sign-in and database.' }, 503);
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'Request origin is not allowed.' }, 403);
    if (Number(request.headers.get('content-length') || 0) > 8192) return json({ error: 'Request is too large.' }, 413);
  }
  try {
    if (path === '/api/session' && request.method === 'GET') return json({ signed_in: hasSession(request, env.BMO_SESSION_SECRET) });
    if (path === '/api/logout' && request.method === 'POST') return json({ signed_in: false }, 200, { 'Set-Cookie': clearSessionCookie() });
    const db = suppliedDb || getDatabase(env.DATABASE_URL);
    if (path === '/api/login' && request.method === 'POST') {
      const raw = await request.text();
      if (raw.length > 8192) return json({ error: 'Request is too large.' }, 413);
      let body;
      try { body = JSON.parse(raw); } catch { return json({ error: 'Enter your password.' }, 400); }
      const bucket = loginBucket(request, env.BMO_SESSION_SECRET);
      const cutoff = new Date(Date.now() - 15 * 60000).toISOString();
      // Atomic increment: concurrent requests cannot evade the attempt limit.
      const attempt = await db.prepare("INSERT INTO login_attempts (bucket, started_at, attempts) VALUES (?, ?, 1) ON CONFLICT (bucket) DO UPDATE SET attempts = CASE WHEN login_attempts.started_at < ? THEN 1 ELSE login_attempts.attempts + 1 END, started_at = CASE WHEN login_attempts.started_at < ? THEN excluded.started_at ELSE login_attempts.started_at END RETURNING attempts").bind(bucket, new Date().toISOString(), cutoff, cutoff).first();
      if (attempt.attempts > 5) return json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' }, 429, { 'Retry-After': '900' });
      if (!await verifyPassword(body?.password, env.BMO_OWNER_PASSWORD_HASH)) return json({ error: 'That password did not match.' }, 401);
      await db.prepare('DELETE FROM login_attempts WHERE bucket = ? OR started_at < ?').bind(bucket, cutoff).run();
      return json({ signed_in: true }, 200, { 'Set-Cookie': sessionCookie(env.BMO_SESSION_SECRET) });
    }
    if (path === '/api/readings' && request.method === 'POST') {
      const token = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
      if (!sameSecret(token, env.BMO_DEVICE_TOKEN)) return json({ error: 'Device authentication failed.' }, 401);
    } else if (!hasSession(request, env.BMO_SESSION_SECRET)) return json({ error: 'Please sign in to your fridge.' }, 401);
    // Never trust identity headers supplied by visitors or the uploader.
    const headers = new Headers(request.headers);
    headers.delete('oai-authenticated-user-id');
    if (hasSession(request, env.BMO_SESSION_SECRET)) headers.set('oai-authenticated-user-id', 'owner');
    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text();
    if (body && body.length > 8192) return json({ error: 'Request is too large.' }, 413);
    const coreRequest = new Request(url, { method: request.method, headers, body });
    return await handleApi(coreRequest, { DB: db });
  } catch (e) {
    // Database errors can include connection details; do not expose them.
    console.error('BMO request failed:', e?.name || 'Error');
    return json({ error: 'The fridge service is unavailable. Please try again shortly.' }, 503);
  }
}
