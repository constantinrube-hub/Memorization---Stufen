const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
// 4x3 grid of squares around Luzon-ish coordinates
const feats=[];for(let i=0;i<4;i++)for(let j=0;j<3;j++){const x=120+i,y=14+j;feats.push({type:'Feature',properties:{name:'Cell '+String.fromCharCode(65+i)+(j+1)},geometry:{type:'Polygon',coordinates:[[[x,y],[x+1,y],[x+1,y+1],[x,y+1],[x,y]]]}});}
fs.writeFileSync('/tmp/stufen-grid.geojson',JSON.stringify({type:'FeatureCollection',features:feats}));
(async()=>{
 const b=await chromium.launch();
 for(const vp of [{width:1300,height:900,name:'desk'},{width:390,height:844,name:'phone',touch:true}]){
 const ctx=await b.newContext({viewport:{width:vp.width,height:vp.height},hasTouch:!!vp.touch});
 await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:'+(process.env.PORT||8765)+'/');await p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 await p.setInputFiles('#bigpick','/tmp/stufen-grid.geojson');await p.waitForSelector('#geo-name');await p.click('[data-act="impRun"]');await p.waitForFunction(()=>window.__stufen.S.imp.step==='done');await p.click('[data-act="impClose"]');
 await p.click('[data-act="tab"][data-v="types"]');ok(await p.locator('[data-tf="gl"]').count()===1,vp.name+': maps-link option offered');
 await p.selectOption('[data-tf="gl"]','miss');
 await p.click('[data-act="tab"][data-v="study"]');await p.click('[data-act="start"]');await p.waitForSelector('#clickmap .rmap svg');await p.waitForTimeout(1500);
 const info=await p.evaluate(()=>{const S=window.__stufen.S,d=S.decks[S.cur],n=S.notes[d.id].get(S.study.cur.nid),f=d.fields.find(f=>f.kind==='region');const c=window.__stufen.centroidOf(window.__stufen.parseRegion(n.f[f.id]));const far=[...S.notes[d.id].values()].find(x=>x.id!==n.id&&!((n.r&&n.r[f.id]&&n.r[f.id].close)||[]).includes(x.id));const fc=window.__stufen.centroidOf(window.__stufen.parseRegion(far.f[f.id]));return {name:n.f[d.fields[0].id],c,fc};});
 const box=await p.locator('#clickmap .rmap').boundingBox();
 const clickAt=async c=>{const v=await p.evaluate(()=>{const v=window.__stufen.VIEW.study;return {k:v.k,x:v.x,y:v.y,r:v.r||1};});const x=box.x+(c[0]-v.x)*v.k*box.width,y=box.y+(c[1]-v.y)*v.k/v.r*box.height;if(vp.touch)await p.touchscreen.tap(x,y);else await p.mouse.click(x,y);};
 // right click -> no links under 'miss'
 await clickAt(info.c);await p.waitForSelector('.grades');ok(await p.locator('.glinks').count()===0,vp.name+': no links after a right answer');
 if(vp.touch){await p.click('[data-act="cMore"]');ok(await p.locator('.ctools.open [data-act="cEdit"]').isVisible(),'phone: card actions unfold');await p.screenshot({path:'/tmp/stufen-phone-study.png'});}
 else {ok(await p.locator('[data-act="cEdit"]').isVisible()&&!(await p.locator('.morebtn').isVisible()),'desk: tools inline');}
 await p.locator('[data-act="grade"]').first().click();
 // wrong click on next card
 const i2=await p.evaluate(()=>{const S=window.__stufen.S,d=S.decks[S.cur],n=S.notes[d.id].get(S.study.cur.nid),f=d.fields.find(f=>f.kind==='region');const far=[...S.notes[d.id].values()].find(x=>x.id!==n.id&&!((n.r&&n.r[f.id]&&n.r[f.id].close)||[]).includes(x.id));return {name:n.f[d.fields[0].id],fc:window.__stufen.centroidOf(window.__stufen.parseRegion(far.f[f.id]))};});
 await clickAt(i2.fc);await p.waitForSelector('.glinks');
 const links=await p.locator('.glinks a').evaluateAll(as=>as.map(a=>a.textContent+' '+a.href));console.log(vp.name,i2.name,links);
 const m=/center=([\d.\-]+),([\d.\-]+)&zoom=(\d+)/.exec(links[0]);const col=i2.name.charCodeAt(5)-65,row=+i2.name[6];
 ok(m&&Math.abs(+m[1]-(14+row-0.5))<0.05&&Math.abs(+m[2]-(120+col+0.5))<0.05,vp.name+': link points at the cell centre '+(m&&m.slice(1)));
 ok(links.length===3&&links[1].includes('map_action=pano'),vp.name+': street view + your click links');
 // borders toggle
 await p.click('#clickmap [data-act="borders"]');ok(await p.locator('#clickmap .rmap.nobd').count()===1,vp.name+': borders hidden');
 ok(await p.evaluate(()=>getComputedStyle(document.querySelector('#clickmap .ib')).display)==='none',vp.name+': shared borders not drawn');
 await p.waitForFunction(()=>{const S=window.__stufen.S,d=window.__store.get('decks/'+S.cur);return d&&d.fields.some(f=>f.nobd);});ok(true,vp.name+': choice saved with the deck');
 await p.screenshot({path:'/tmp/stufen-'+vp.name+'-map.png'});
 await p.click('#clickmap [data-act="borders"]');ok(await p.locator('#clickmap .rmap.nobd').count()===0,vp.name+': borders back');
 // keys still grade
 if(!vp.touch){await p.keyboard.press('1');ok(await p.locator('.grades').count()===0,'desk: key 1 grades');}
 ok(errs.length===0,vp.name+': no page errors '+errs.join('|'));
 await ctx.close();}
 await b.close();
})();
