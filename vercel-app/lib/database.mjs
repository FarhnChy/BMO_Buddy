import { neon } from '@neondatabase/serverless';

// Keep the tested inventory API while using durable Postgres on Vercel.
export function postgresStatement(query) {
  let index = 0;
  return query.replace("date('now', '+3 days')", "to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date + 3, 'YYYY-MM-DD')")
    .replace(/\?/g, () => `$${++index}`);
}
export function createDatabase(execute, executeBatch) {
  const prepare = (query, params = []) => ({
    query: postgresStatement(query), params,
    bind: (...values) => prepare(query, values),
    async first() { return (await execute(this.query, this.params))[0] || null; },
    async all() { return { results: await execute(this.query, this.params) }; },
    async run() { return execute(this.query, this.params); },
  });
  return { prepare, batch: executeBatch };
}
let cached;
export function getDatabase(url) {
  if (!url) throw new Error('Database configuration is missing.');
  if (cached?.url === url) return cached.db;
  const sql = neon(url);
  const db = createDatabase((query, params) => sql.query(query, params),
    statements => sql.transaction(statements.map(s => sql.query(s.query, s.params))));
  cached = { url, db };
  return db;
}
