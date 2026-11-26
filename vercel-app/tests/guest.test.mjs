import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('guest inventory stays local and supports add, edit, and removal', async () => {
  const data = new Map();
  const localStorage = { getItem: k => data.has(k) ? data.get(k) : null, setItem: (k, v) => data.set(k, v) };
  const context = { window: {}, localStorage, location: { origin:'https://example.com' }, URL, Date };
  vm.runInNewContext(readFileSync(new URL('../public/guest.js', import.meta.url), 'utf8'), context);
  const api = context.window.bmoGuestApi;
  assert.equal((await api('/api/inventory')).length, 3);
  await api('/api/inventory', { method:'POST', body:JSON.stringify({name:'Yogurt', quantity:2}) });
  const item = (await api('/api/inventory')).find(i => i.name === 'Yogurt');
  await api(`/api/inventory/${item.id}`, {method:'PATCH', body:JSON.stringify({name:'Yogurt', quantity:3})});
  await api(`/api/inventory/${item.id}`, {method:'DELETE'});
  assert.equal((await api('/api/inventory')).find(i => i.id === item.id).quantity, 2);
  await api(`/api/inventory/${item.id}?all=1`, {method:'DELETE'});
  assert.equal((await api('/api/inventory')).some(i => i.id === item.id), false);
  await assert.rejects(api('/api/products/lookup', {method:'POST'}), /unavailable/);
  assert.equal((await api('/api/temperature-history?hours=24')).points.length, 4);
});
