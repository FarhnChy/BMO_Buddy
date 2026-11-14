import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './fixture.mjs';
import { hasSession, sessionCookie } from '../lib/auth.mjs';

test('Postgres inventory lifecycle, expiration batches, conflict, and status', async () => {
  const f = await fixture();
  try {
    const food = {name:'Milk',barcode:'12345678',quantity:2,expires_on:'2026-11-15'};
    assert.equal((await f.call('inventory',{method:'POST',body:food})).status,201);
    await f.call('inventory',{method:'POST',body:food});
    await f.call('inventory',{method:'POST',body:{...food,expires_on:'2026-11-20'}});
    const items = (await f.call('inventory')).body;
    assert.equal(items.length,2); assert.equal(items[0].quantity,4);
    assert.equal((await f.call(`inventory/${items[1].id}`,{method:'PATCH',body:food})).status,409);
    await f.call('inventory',{method:'POST',body:{name:'Leftover soup',quantity:2}});
    let soup = (await f.call('inventory')).body.find(row=>row.name==='Leftover soup');
    assert.match(soup.barcode,/^manual:/);
    await f.call(`inventory/${soup.id}`,{method:'PATCH',body:{name:'Soup',quantity:3,expires_on:'2026-11-18'}});
    await f.call(`inventory/${soup.id}`,{method:'DELETE'});
    soup = (await f.call('inventory')).body.find(row=>row.name==='Soup'); assert.equal(soup.quantity,2);
    assert.equal(soup.expires_on,'2026-11-18');
    await f.call(`inventory/${soup.id}?all=1`,{method:'DELETE'});
    assert.equal((await f.call('inventory')).body.length,2);
    assert.equal(Number((await f.call('status')).body.inventory_count),6);
    for (const body of [{name:'Bad',expires_on:'2026-02-30'},{name:'Bad',quantity:1.2},{name:'Bad',barcode:'https://example.com'}]) assert.equal((await f.call('inventory',{method:'POST',body})).status,400);
  } finally {await f.pg.close();}
});
test('identity spoofing and device token never grant inventory access',async()=>{
  const f=await fixture(); try {
    assert.equal((await f.call('inventory',{authenticated:false,headers:{'oai-authenticated-user-id':'owner'}})).status,401);
    assert.equal((await f.call('inventory',{authenticated:false,headers:{authorization:`Bearer ${f.env.BMO_DEVICE_TOKEN}`}})).status,401);
    assert.equal((await f.call('readings',{method:'POST',body:{temperature_c:4},authenticated:false})).status,401);
    assert.equal((await f.call('readings',{method:'POST',body:{temperature_c:4},authenticated:false,headers:{authorization:`Bearer ${f.env.BMO_DEVICE_TOKEN}`}})).status,201);
    let status=(await f.call('status')).body; assert.equal(status.pi_online,true); assert.equal(status.temperature_f,39.2);
    assert.equal((await f.call('temperature-history?hours=24')).body.points.length,1);
    await f.pg.exec("UPDATE readings SET timestamp = '2020-01-01T00:00:00.000Z'");
    status=(await f.call('status')).body;assert.equal(status.pi_online,false);assert.equal(status.temperature_f,null);
  } finally {await f.pg.close();}
});
test('password sign-in, secure cookies, expiry, logout and origin checks',async()=>{
  const f=await fixture();try{
    assert.equal((await f.call('login',{method:'POST',authenticated:false,body:{password:'wrong'}})).status,401);
    const login=await f.call('login',{method:'POST',authenticated:false,body:{password:f.password}});
    assert.equal(login.status,200);const setCookie=login.headers.get('set-cookie');assert.match(setCookie,/HttpOnly; Secure; SameSite=Strict/);
    assert.equal((await f.call('session',{authenticated:false,headers:{cookie:setCookie.split(';')[0]}})).body.signed_in,true);
    const expired=sessionCookie(f.env.BMO_SESSION_SECRET,Date.now()-8*86400000).split(';')[0];
    assert.equal(hasSession(new Request('https://fridge.example',{headers:{cookie:expired}}),f.env.BMO_SESSION_SECRET),false);
    assert.equal((await f.call('inventory',{method:'POST',body:{name:'Bad'},headers:{origin:'https://evil.example'}})).status,403);
    const logout=await f.call('logout',{method:'POST'});assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
    const bad=f.cookie.slice(0,-1)+(f.cookie.endsWith('0')?'1':'0');assert.equal((await f.call('inventory',{authenticated:false,headers:{cookie:bad}})).status,401);
  } finally {await f.pg.close();}
});
test('database-backed sign-in limit persists across requests',async()=>{
  const f=await fixture();try{
    for(let i=0;i<5;i++) assert.equal((await f.call('login',{method:'POST',authenticated:false,body:{password:'wrong'}})).status,401);
    assert.equal((await f.call('login',{method:'POST',authenticated:false,body:{password:f.password}})).status,429);
  }finally{await f.pg.close();}
});
test('function rewrite preserves route and query parameters',async()=>{
  const f=await fixture();try{
    assert.equal((await f.call('index?route=inventory')).status,200);
    assert.equal((await f.call('index?route=temperature-history&hours=24')).status,200);
  }finally{await f.pg.close();}
});
