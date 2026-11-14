import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before migrating.');
const statements = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8').split(';').map(s => s.trim()).filter(Boolean);
const sql = neon(process.env.DATABASE_URL);
await sql.transaction(statements.map(statement => sql.query(statement, [])));
console.log('Database schema is ready.');
