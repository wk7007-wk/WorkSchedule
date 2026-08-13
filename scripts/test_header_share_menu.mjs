import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const html=fs.readFileSync('docs/index.html','utf8');
const js=fs.readFileSync('docs/app.js','utf8');
const css=fs.readFileSync('docs/style.css','utf8');
const header=html.slice(html.indexOf('class="header-actions"'),html.indexOf('class="header-actions"')+1400);
assert.equal((header.match(/id="(?:shareMenuBtn|imageShareAction|shareLinkAction|refreshBtn)"/g)||[]).length,4,'header has share, two menu items, refresh');
assert.match(header,/id="shareMenuBtn"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
assert.match(header,/id="shareMenu"[^>]*role="menu"[^>]*hidden/);
assert.match(header,/role="menuitem"[^>]*id="imageShareAction"/);
assert.match(header,/role="menuitem"[^>]*id="shareLinkAction"/);
assert.doesNotMatch(header,/id="shareBtn"|id="urlBtn"/);
assert.match(js,/queueCompositeShare\('header_share'\)/);
assert.match(js,/function copyScheduleLink\(\)/);
assert.match(js,/location\.reload\(\)/);
assert.match(js,/e\.key==='Escape'/);
assert.match(js,/pointerdown/);
assert.match(css,/\.share-menu-popover button\{[^}]*min-height:44px/);
assert.match(css,/\.header-actions\{[^}]*display:flex/);
assert.doesNotMatch(js.slice(js.indexOf("$('imageShareAction')"),js.indexOf("$('imageShareAction')")+220),/fetch\([^)]*method/);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const loaderPaths=['playwright','playwright-core','/tmp/hynix-browser/node_modules/playwright-core','/tmp/hynix-pw/node_modules/playwright-core','/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core'];
let chromium,loader='';
for(const candidate of loaderPaths){try{const mod=createRequire(import.meta.url)(candidate);chromium=mod.chromium;loader=candidate;break;}catch{}}
assert.ok(chromium,'portable playwright/playwright-core loader unavailable');
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const safe=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');
  const file=path.resolve(root,'docs',safe);
  if(!file.startsWith(path.resolve(root,'docs')+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return;}
  res.writeHead(200,{'content-type':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const result={simulation_only:true,loader,viewports:[],nonGetFirebase:0,pageErrors:[]};
const browser=await chromium.launch({headless:true,executablePath:'/tmp/hynix-pw-browsers/chromium-1228/chrome-linux/chrome'});
try{
  for(const viewport of [{name:'desktop',width:1280,height:720},{name:'mobile',width:390,height:844}]){
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}});
    const page=await context.newPage();let clipboard='',downloads=0,reloads=0;
    page.on('pageerror',error=>result.pageErrors.push(error.message));
    await page.route('https://poskds-4ba60-default-rtdb.asia-southeast1.firebasedatabase.app/**',route=>{
      if(route.request().method()!=='GET')result.nonGetFirebase++;
      return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    });
    await page.addInitScript(()=>{
      window.confirm=()=>true;
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__shareTestClipboard=text;}}});
      document.addEventListener('click',event=>{if(event.target.closest('#refreshBtn')){event.preventDefault();event.stopImmediatePropagation();window.__shareTestReload=(window.__shareTestReload||0)+1;}},true);
      const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download)window.__shareTestDownloads=(window.__shareTestDownloads||0)+1;return click.call(this);};
    });
    await page.goto(`http://127.0.0.1:${port}/?testAuth=1`,{waitUntil:'networkidle'});
    await page.locator('#authBtn').click();await page.locator('body').waitFor({state:'visible'});await page.waitForFunction(()=>!document.body.classList.contains('auth-locked'));
    const actions=page.locator('.header-actions > *');assert.equal(await actions.count(),2,`${viewport.name}: two visible header actions`);
    await page.locator('#shareMenuBtn').focus();await page.keyboard.press('ArrowDown');
    await assertMenu(page,viewport.name);
    await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.id),'shareLinkAction');
    await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>document.activeElement.id),'imageShareAction');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#shareMenu').isHidden(),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'shareMenuBtn');
    await page.keyboard.press('Space');await assertMenu(page,viewport.name);
    await page.locator('body').click({position:{x:1,y:700}});await page.waitForTimeout(20);assert.equal(await page.locator('#shareMenu').isHidden(),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'shareMenuBtn');
    await page.locator('#shareMenuBtn').click();await page.locator('#imageShareAction').press('Enter');
    await page.waitForTimeout(50);downloads=await page.evaluate(()=>window.__shareTestDownloads||0);assert.ok(downloads>=1,`${viewport.name}: image action reached composite-share output seam`);
    await page.locator('#shareMenuBtn').click();await page.locator('#shareLinkAction').press('Space');clipboard=await page.evaluate(()=>window.__shareTestClipboard||'');assert.match(clipboard,/127\.0\.0\.1/,`${viewport.name}: link action used clipboard path`);
    await page.locator('#refreshBtn').click();reloads=await page.evaluate(()=>window.__shareTestReload||0);assert.equal(reloads,1,`${viewport.name}: refresh remains distinct`);
    const geometry=await page.evaluate(()=>{const doc=document.documentElement,controls=[...document.querySelectorAll('.header-actions button,[role="menuitem"]')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;});const rects=controls.map(el=>({id:el.id,r:el.getBoundingClientRect()}));const bad=rects.filter(({r})=>r.width<44||r.height<44).map(({id})=>id);const overlaps=rects.flatMap((a,i)=>rects.slice(i+1).filter(b=>Math.max(a.r.left,b.r.left)<Math.min(a.r.right,b.r.right)&&Math.max(a.r.top,b.r.top)<Math.min(a.r.bottom,b.r.bottom)).map(b=>[a.id,b.id]));return {overflow:doc.scrollWidth>window.innerWidth,bad,overlaps};});
    assert.equal(geometry.overflow,false,`${viewport.name}: no document horizontal overflow`);assert.deepEqual(geometry.bad,[],`${viewport.name}: no sub-44 header actionable control`);assert.deepEqual(geometry.overlaps,[],`${viewport.name}: no visible header-control overlap`);
    await page.screenshot({path:`/tmp/workschedule-share-menu-${viewport.name}-simulation.png`,fullPage:false});
    result.viewports.push({viewport,downloads,clipboard:!!clipboard,reloads,geometry});await context.close();
  }
  assert.equal(result.nonGetFirebase,0,'Firebase non-GET must remain zero');assert.deepEqual(result.pageErrors,[],'page errors must remain zero');
  fs.writeFileSync('/tmp/workschedule-share-menu-browser-result.json',JSON.stringify(result,null,2)+'\n');
  console.log('PASS header share disclosure browser contract '+JSON.stringify(result));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

async function assertMenu(page,name){
  assert.equal(await page.locator('#shareMenu').isVisible(),true,`${name}: menu opens`);
  assert.equal(await page.locator('[role="menuitem"]').count(),2,`${name}: menu exposes two items`);
  const sizes=await page.locator('[role="menuitem"]').evaluateAll(items=>items.map(item=>{const r=item.getBoundingClientRect();return [r.width,r.height];}));
  for(const [width,height] of sizes)assert.ok(width>=44&&height>=44,`${name}: menu item is at least 44x44`);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'imageShareAction',`${name}: open focuses first action`);
  await page.screenshot({path:`/tmp/workschedule-share-menu-${name}-open-simulation.png`,fullPage:false});
}
