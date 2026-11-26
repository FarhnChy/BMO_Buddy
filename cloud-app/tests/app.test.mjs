import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { handleApi } from '../lib/server.mjs';
function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../drizzle/0000_striped_viper.sql', import.meta.url), 'utf8'));
  const wrap = (query, args = []) => ({
    bind: (...values) => wrap(query, values),
    first: async () => sql.prepare(query).get(...args) || null,
    all: async () => ({ results: sql.prepare(query).all(...args) }),
    run: async () => sql.prepare(query).run(...args),
  });
  const DB = { prepare: wrap, batch: async (queries) => { sql.exec('BEGIN'); try { const results = []; for (const q of queries) results.push(await q.run()); sql.exec('COMMIT'); return results; } catch(e) { sql.exec('ROLLBACK'); throw e; } } };
  const call = async (path, method = 'GET', body, signedIn = true, origin) => {
    const headers = { 'Content-Type': 'application/json' };
    if (signedIn) headers['oai-authenticated-user-id'] = 'owner';
    if (origin) headers.Origin = origin;
    const response = await handleApi(new Request(`https://fridge.example/api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), { DB });
    return { status: response.status, body: await response.json() };
  };
  return { call, sql };
}
test('manual food persists, remains separate, edits and removes', async () => {
  const { call } = fixture();
  const food = { name: 'Soup', quantity: 2, expires_on: '2026-11-15' };
  assert.equal((await call('inventory', 'POST', food)).status, 201);
  await call('inventory', 'POST', food);
  const items = (await call('inventory')).body;
  assert.equal(items.length, 2);
  assert.equal((await call(`inventory/${items[0].id}`, 'PATCH', { ...food, quantity: 3 })).status, 200);
  await call(`inventory/${items[0].id}`, 'DELETE');
  assert.equal((await call('inventory')).body[0].quantity, 2);
  await call(`inventory/${items[0].id}?all=1`, 'DELETE');
  assert.equal((await call('inventory')).body.length, 1);
});
test('barcodes merge only within the same expiration batch and conflicts are actionable', async () => {
  const { call } = fixture();
  const food = { name: 'Milk', barcode: '12345678', quantity: 1, expires_on: '2026-11-15' };
  await call('inventory', 'POST', food); await call('inventory', 'POST', food);
  await call('inventory', 'POST', { ...food, expires_on: '2026-11-20' });
  const items = (await call('inventory')).body;
  assert.equal(items.length, 2); assert.equal(items[0].quantity, 2);
  assert.equal((await call(`inventory/${items[1].id}`, 'PATCH', food)).status, 409);
});
test('input and access boundaries', async () => {
  const { call } = fixture();
  assert.equal((await call('inventory', 'GET', undefined, false)).status, 401);
  assert.equal((await call('inventory', 'POST', { name: 'Soup' }, true, 'https://other.example')).status, 403);
  for (const food of [{}, {name:'Soup', quantity:1.5}, {name:'Soup', expires_on:'2026-02-30'}, {name:'Soup', barcode:'https://example.com'}]) assert.equal((await call('inventory', 'POST', food)).status, 400);
});
test('Pi offline, online, missing sensor and stale values', async () => {
  const { call, sql } = fixture();
  assert.equal((await call('status')).body.pi_online, false);
  assert.equal((await call('readings', 'POST', { temperature_c: 4 }, false)).status, 201);
  let status = (await call('status')).body;
  assert.equal(status.pi_online, true); assert.equal(status.temperature_f, 39.2);
  assert.equal((await call('temperature-history?hours=24')).body.points.length, 1);
  await call('readings', 'POST', { temperature_c: null }, false);
  status = (await call('status')).body;
  assert.equal(status.pi_online, true); assert.equal(status.temperature_f, null);
  sql.exec("UPDATE readings SET timestamp = '2020-01-01T00:00:00.000Z'");
  status = (await call('status')).body;
  assert.equal(status.pi_online, false); assert.equal(status.temperature_f, null);
  assert.equal((await call('readings', 'POST', { temperature_c: 200 }, false)).status, 400);
});
test('QR labels populate form without saving; invalid QR preserves the form', async () => {
  const nodes = new Map();
  const document = { querySelector: selector => { if (!nodes.has(selector)) nodes.set(selector, { value: '', hidden: false, textContent: '', classList: { toggle() {} } }); return nodes.get(selector); } };
  const source = readFileSync(new URL('../public/static/app.js', import.meta.url), 'utf8').split('$("#lookup").addEventListener')[0];
  const context = vm.createContext({ document, console, Date, Intl, setTimeout });
  vm.runInContext(source, context);
  await context.handleScan('{"name":"Soup","quantity":2,"expires_on":"2026-11-15"}');
  assert.equal(document.querySelector('#name').value, 'Soup');
  assert.equal(document.querySelector('#quantity').value, 2);
  for (const text of ['https://example.com', '{}', '{"name":"Bad","quantity":0}', '{"name":"Bad","expires_on":"2026-02-30"}']) {
    await context.handleScan(text);
    assert.match(document.querySelector('#form-message').textContent, /Unsupported/);
    assert.equal(document.querySelector('#name').value, 'Soup');
  }
});
