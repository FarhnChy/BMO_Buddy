import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
const file=process.argv[2];
if(!file||!process.env.DATABASE_URL)throw new Error('Provide an inventory JSON file and DATABASE_URL.');
const rows=JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
if(!Array.isArray(rows)||rows.length>10000)throw new Error('Expected an inventory array of at most 10000 batches.');
const statements=rows.map(row=>{
  if(!row||typeof row.name!=='string'||!row.name.trim()||row.name.length>160||typeof row.barcode!=='string'||!(/^[0-9]{4,18}$/.test(row.barcode)||/^manual:[a-f0-9-]{16,40}$/.test(row.barcode))||!Number.isInteger(row.quantity)||row.quantity<1)throw new Error('Invalid inventory row.');
  const date=row.expires_on||'';
  if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new Error('Invalid inventory date.');
  return [row.barcode,row.name.trim(),row.quantity,date];
});
const sql=neon(process.env.DATABASE_URL);
// Holding the inventory table lock makes the empty-destination check and all
// inserts one atomic operation, including concurrent application writes.
await sql.transaction([
  sql.query('LOCK TABLE inventory IN ACCESS EXCLUSIVE MODE',[]),
  sql.query("DO $$ BEGIN IF EXISTS (SELECT 1 FROM inventory) THEN RAISE EXCEPTION 'Destination inventory is not empty; import stopped.'; END IF; END $$",[]),
  ...statements.map(args=>sql.query('INSERT INTO inventory (barcode,name,quantity,expires_on) VALUES ($1,$2,$3,$4)',args)),
]);
console.log(`Imported ${rows.length} inventory batches. Verify them before switching apps.`);
