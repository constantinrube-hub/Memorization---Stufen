/* phone: tall box for wide maps, answers in one row; places export for map-making.app and rows without a location */
const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
const feats=[];for(let i=0;i<9;i++)for(let j=0;j<3;j++){const x=105+i,y=-9+j;feats.push({type:'Feature',properties:{name:'K'+i+'_'+j},geometry:{type:'Polygon',coordinates:[[[x,y],[x+1,y],[x+1,y+1],[x,y+1],[x,y]]]}});}
fs.writeFileSync('/tmp/stufen-wide.geojson',JSON.stringify({type:'FeatureCollection',features:feats}));
(async()=>{
 const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:390,height:720},hasTouch:true});await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:'+(process.env.PORT||8765)+'/');await p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 const S=f=>p.evaluate(f);
 await p.setInputFiles('#bigpick','/tmp/stufen-wide.geojson');await p.waitForSelector('#geo-name');await p.click('[data-act="impRun"]');await p.waitForFunction(()=>window.__stufen.S.imp.step==='done');await p.click('[data-act="impClose"]');
 await p.click('[data-act="tab"][data-v="study"]');await p.click('[data-act="start"]');await p.waitForSelector('#clickmap .rmap svg');await p.waitForTimeout(1200);
 const box=await p.locator('#clickmap .rmap').boundingBox(),ar=await S(()=>{const s=window.__stufen.S,d=s.decks[s.cur];return d.fields.find(f=>f.kind==='region').ar;});
 ok(box.width>340&&box.height>380,'wide map (height/width '+ar.toFixed(2)+') gets a tall box on the phone: '+Math.round(box.width)+' × '+Math.round(box.height)+' instead of '+Math.round(box.width*ar)+' high');
 const vb=await S(()=>{const v=document.querySelector('#clickmap svg').viewBox.baseVal;return [v.x,v.y,v.width,v.height];});ok(vb[1]<0&&Math.abs(vb[2]-1000)<1,'the whole map is shown at first, in the middle of the box');
 ok(await p.locator('.maphelp').isHidden(),'the instruction line is left out on the phone');
 const cur=()=>S(()=>{const A=window.__stufen,s=A.S,d=s.decks[s.cur],f=d.fields.find(f=>f.kind==='region'),n=s.notes[d.id].get(s.study.cur.nid);return {c:A.centroidOf(A.parseRegion(n.f[f.id])),nid:n.id};});
 // a tap on the empty band is not an answer
 await p.touchscreen.tap(box.x+box.width/2,box.y+12);await p.waitForTimeout(150);ok(await p.locator('.grades').count()===0,'a tap on the empty band above the map does nothing');
 // zoom in with the + button twice, then tap the right cell
 await p.tap('#clickmap [data-act="zoom"][data-v="in"]');await p.tap('#clickmap [data-act="zoom"][data-v="in"]');
 let c=await cur();const v=await S(()=>{const v=window.__stufen.VIEW.study;return {k:v.k,x:v.x,y:v.y,r:v.r};});
 ok(v.r>2&&v.k>2.4,'zoomed view: map now '+Math.round(box.width*ar*v.k)+' px high in the box');
 // bring the card's cell into view by setting the view, as a drag would
 await p.evaluate(([cx,cy])=>{const v=window.__stufen.VIEW.study;v.x=cx-0.5/v.k;v.y=cy-0.5*v.r/v.k;document.querySelector('[data-act="zoom"][data-v="in"]').click();document.querySelector('[data-act="zoom"][data-v="out"]').click();},c.c);
 const v2=await S(()=>{const v=window.__stufen.VIEW.study;return {k:v.k,x:v.x,y:v.y,r:v.r};});
 await p.touchscreen.tap(box.x+(c.c[0]-v2.x)*v2.k*box.width,box.y+(c.c[1]-v2.y)*v2.k/v2.r*box.height);await p.waitForSelector('.grades');
 ok((await p.textContent('.verdict'))==='Inside the region','a tap on the cell in the zoomed tall box hits it');
 const gs=await p.locator('.grades .g').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.top),Math.round(r.width),getComputedStyle(e.querySelector('small')).display];}));
 ok(gs.length===5&&new Set(gs.map(g=>g[0])).size===1&&gs.every(g=>g[2]==='none')&&gs.every(g=>g[1]>55),'all five answers offered after a right click without any setting, side by side, names only: widths '+gs.map(g=>g[1]).join(' '));
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no sideways scroll');
 await p.screenshot({path:'/tmp/stufen-phone-wide.png'});
 await p.locator('.grades .g').nth(3).tap();ok((await cur()).nid!==c.nid,'tapping an answer moves on');
 await p.screenshot({path:'/tmp/stufen-phone-wide-q.png'});
 ok(errs.length===0,'phone: no page errors '+errs.join(' | '));await ctx.close();
 // desktop is unchanged
 const c2=await b.newContext({viewport:{width:1300,height:900}});await c2.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));const q=await c2.newPage();
 await q.goto('http://localhost:'+(process.env.PORT||8765)+'/');await q.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 await q.setInputFiles('#bigpick','/tmp/stufen-wide.geojson');await q.waitForSelector('#geo-name');await q.click('[data-act="impRun"]');await q.waitForFunction(()=>window.__stufen.S.imp.step==='done');await q.click('[data-act="impClose"]');
 await q.click('[data-act="tab"][data-v="study"]');await q.click('[data-act="start"]');await q.waitForSelector('#clickmap .rmap svg');
 await q.waitForTimeout(1500);const db=await q.locator('#clickmap .rmap').boundingBox();ok(Math.abs(db.height/db.width-ar)<0.01&&await q.locator('.maphelp').isVisible(),'desktop keeps the map’s own shape and the instruction line');
 await q.click('[data-act="stop"]');
 // places file for map-making.app
 await q.click('[data-act="tab"][data-v="cards"]');await q.click('[data-act="msOpen"]');await q.click('[data-act="msExport"]');await q.waitForFunction(()=>window.__dl.length===1);
 const pj=await q.evaluate(()=>{const o=JSON.parse(window.__dl[0].data);return {n:o.customCoordinates.length,first:o.customCoordinates[0],name:window.__dl[0].filename};});
 ok(pj.n===27&&Math.abs(pj.first.lat-(-8.5))<0.01&&Math.abs(pj.first.lng-105.5)<0.01&&pj.first.extra.tags[0]==='K0_0'&&pj.first.extra.tags[1].startsWith('row:'),'places file: 27 coordinates at the cell centres, tagged with the row: '+JSON.stringify(pj.first.extra.tags));
 // what comes back: 20 rows kept (two of them moved outside their cell but still tagged), 7 dropped
 const back=await q.evaluate(()=>{const o=JSON.parse(window.__dl[0].data);const keep=o.customCoordinates.slice(0,20).map((c,i)=>Object.assign({},c,{panoId:'P'+i,lat:i<2?c.lat+1.2:c.lat+0.01}));return JSON.stringify({name:'checked',customCoordinates:keep});});
 fs.writeFileSync('/tmp/stufen-checked.json',back);
 await q.setInputFiles('#covpick','/tmp/stufen-checked.json');await q.waitForFunction(()=>window.__stufen.S.ms&&/locations stored/.test(window.__stufen.S.ms.msg),null,{timeout:15000});
 await q.waitForSelector('#ms-miss');const mt=await q.textContent('#ms-miss');ok(mt.startsWith('7 rows of this map have no location'),'rows without a location are counted; a moved but tagged one still counts as found: '+mt);
 await q.click('[data-act="ask"][data-v^="msPrune"]');await q.click('[data-act="msPrune"]');await q.waitForFunction(()=>window.__stufen.S.ms&&/7 rows deleted/.test(window.__stufen.S.ms.msg),null,{timeout:15000});
 ok(await q.evaluate(()=>{const s=window.__stufen.S;return s.notes[s.cur].size;})===20&&(await q.textContent('#ms-miss')).startsWith('Every row'),'the 7 rows are deleted, 20 remain, each with a location');
 ok(await q.evaluate(()=>window.__stufen.S.meta.snaps.some(x=>x.why.startsWith('Before deleting rows without a location'))),'a snapshot was saved first');
 await b.close();
})();
