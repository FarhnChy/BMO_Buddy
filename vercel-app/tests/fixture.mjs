import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createDatabase } from '../lib/database.mjs';
import { passwordHash, sessionCookie } from '../lib/auth.mjs';
import { handleRequest } from '../lib/handler.mjs';
export async function fixture() {
  const pg = new PGlite();
  await pg.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const db = createDatabase(async (query, params) => (await pg.query(query, params)).rows,
    statements => pg.transaction(async tx => { const results = []; for (const s of statements) results.push(await tx.query(s.query, s.params)); return results; }));
  const password = 'test-only-password-123';
  const env = { BMO_OWNER_PASSWORD_HASH: await passwordHash(password), BMO_SESSION_SECRET: 'test-only-session-secret-32-characters', BMO_DEVICE_TOKEN: 'test-only-device-token-1234567890' };
  const cookie = sessionCookie(env.BMO_SESSION_SECRET).split(';')[0];
  async function call(path, { method = 'GET', body, authenticated = true, headers = {} } = {}) {
    const response = await handleRequest(new Request(`https://fridge.example/api/${path}`, { method,
      headers: { 'content-type':'application/json', ...(authenticated ? {cookie} : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body) }), env, db);
    return { status:response.status, body:await response.json(), headers:response.headers };
  }
  return { pg, db, env, password, cookie, call };
}
