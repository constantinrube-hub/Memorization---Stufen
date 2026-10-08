/* saved schedules in Settings: folded rows that open on click */
const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1300,height:900}});await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 const ready=()=>p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 await p.goto('http://localhost:'+(process.env.PORT||8765)+'/');await ready();
 await p.click('#new-deck');await p.fill('#deck-name','US area codes');await p.click('[data-act="tab"][data-v="schedule"]');await p.click('[data-act="saveSched"]');
 await p.click('#open-settings');
 ok(await p.locator('.librow').count()===1&&await p.locator('#view .stage').count()===0,'a saved schedule shows as one folded row, no stage clocks');
 const row=await p.textContent('.librow');ok(row.includes('US area codes')&&row.includes('8 stages')&&row.includes('10m · 1d · 3d')&&row.includes('used by 1 cluster'),'the row names it and sums it up: '+row.replace(/\s+/g,' '));
 await p.click('.librow');ok(await p.locator('#view .stage').count()===8&&await p.locator('.librow').count()===0,'a click opens it with its 8 stages');
 await p.locator('#view [data-act="stg"][data-v="0:m:1"]').click();ok(await p.evaluate(()=>window.__stufen.S.lib[0].stages[0])===11,'editing a stage inside still works');
 await p.fill('#view .clname','Area codes ladder');
 await p.click('[data-act="newSched"]');ok(await p.locator('#view [data-lib]').count()===2,'a new schedule opens straight away for editing');
 await p.locator('#view [data-act="libTog"]').first().click();await p.locator('#view [data-act="libTog"][aria-expanded="true"]').click();
 ok(await p.locator('.librow').count()===2&&await p.locator('#view .stage').count()===0,'both fold again');
 ok((await p.locator('.librow').first().textContent()).includes('Area codes ladder')&&(await p.locator('.librow').first().textContent()).includes('11m'),'the folded row shows the new name and the changed stage');
 await p.locator('.librow').nth(1).click();ok(await p.locator('.librow').count()===1&&await p.locator('#view [data-lib]').count()===1,'opening the second leaves the first folded');
 await p.screenshot({path:'/tmp/stufen-sched.png'});
 await p.waitForFunction(()=>document.querySelector('#status').textContent==='Saved');await p.reload();await ready();await p.click('#open-settings');
 ok(await p.locator('.librow').count()===2,'after a reload every schedule starts folded');
 ok(errs.length===0,'no page errors '+errs.join(' | '));await b.close();
})();
