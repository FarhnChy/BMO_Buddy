import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { fixture } from '../tests/fixture.mjs';
import { handleRequest } from '../lib/handler.mjs';
const f=await fixture();
const publicRoot=resolve('public');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.json':'application/json'};
let origin;
const server=createServer(async(req,res)=>{
  try{
    if(req.url.startsWith('/api/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=Buffer.concat(chunks);
      const request=new Request(origin+req.url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:body});
      const response=await handleRequest(request,f.env,f.db);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const pathname=new URL(req.url,origin).pathname;
    const file=resolve(publicRoot,pathname==='/'||pathname==='/fridge'?'index.html':pathname.slice(1));
    if(!file.startsWith(publicRoot+String.fromCharCode(92))&&!file.startsWith(publicRoot+'/')){res.writeHead(403);res.end();return;}
    const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://localhost:${server.address().port}`;
mkdirSync('test-results',{recursive:true});
let browser;
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const requests=[];page.on('request',r=>requests.push(r.url()));
  await page.goto(origin+'/fridge');
  await page.locator('#login-panel').waitFor({state:'visible'});
  await page.locator('#login-password').fill(f.password);
  await page.locator('#login-form button').click();
  await page.locator('#app-content').waitFor({state:'visible'});
  assert.equal(await page.locator('.hero .eyebrow').textContent(),'BMO Fridge Buddy');
  assert.equal(requests.some(url=>url.includes('zxing-browser')),false,'Scanner bundle should load only on demand');
  await page.locator('#name').fill('Mobile test soup');await page.locator('#expires-on').fill('2030-01-02');
  await page.locator('#quantity').fill('2');await page.locator('#item-form [type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('.item-card strong')?.textContent==='Mobile test soup');
  for(const width of [360,390,768,1280]){
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`Horizontal overflow at ${width}px`);
    await page.screenshot({path:`test-results/fridge-${width}.png`,fullPage:true});
  }
  await page.locator('.edit-item').click();await page.locator('#edit-name').fill('Edited soup');await page.locator('#edit-quantity').fill('3');
  await page.locator('#edit-form [type=submit]').click();await page.waitForFunction(()=>document.querySelector('.item-card strong')?.textContent==='Edited soup');
  await page.locator('.remove-one').click();await page.waitForFunction(()=>document.querySelector('.quantity')?.textContent==='x2');
  await page.locator('#search-food').fill('not-in-the-fridge');assert.equal(await page.locator('.item-card').count(),0);await page.locator('#search-food').fill('');
  await page.evaluate(()=>handleScan('{"name":"QR test leftovers","quantity":1,"expires_on":"2030-02-03"}'));
  assert.equal(await page.locator('#name').inputValue(),'QR test leftovers');
  await page.locator('#item-form [type=submit]').click();await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===2);
  await page.locator('#sign-out').click();await page.locator('#login-panel').waitFor({state:'visible'});
  assert.equal(await page.locator('.item-card').count(),0);
  assert.deepEqual(errors,[]);
  console.log('Mobile/desktop browser checks passed at 360, 390, 768 and 1280px; sign-in, manual add, edit, remove one, search, food QR entry and sign-out passed.');
  console.log('Screenshots: test-results/fridge-{width}.png. Real-device camera testing is still required.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));await f.pg.close();}
