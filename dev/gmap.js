/* the real Google map under the shapes. Google itself cannot be reached from the tests, so a stand-in records what the page asks of it. */
const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
const feats=[];for(let i=0;i<4;i++)for(let j=0;j<3;j++){const x=120+i,y=14+j;feats.push({type:'Feature',properties:{name:'Cell '+String.fromCharCode(65+i)+(j+1)},geometry:{type:'Polygon',coordinates:[[[x,y],[x+1,y],[x+1,y+1],[x,y+1],[x,y]]]}});}
fs.writeFileSync('/tmp/stufen-grid.geojson',JSON.stringify({type:'FeatureCollection',features:feats}));
const FAKE=`(()=>{window.__g={maps:0,moves:0,cam:null,opts:null,type:null};
 class M{constructor(div,o){__g.maps++;__g.opts=o;__g.type=o.mapTypeId;this.div=div;div.innerHTML='<div style="position:absolute;right:0;bottom:0;font-size:10px;background:#fff"><a href="https://www.google.com/intl/en/help/terms_maps/">Terms</a></div>';}
  moveCamera(c){__g.moves++;__g.cam=c;} setOptions(o){Object.assign(__g.opts,o);} getMapTypeId(){return __g.type;} setMapTypeId(t){__g.type=t;}}
 window.google={maps:{Map:M}};window.__gmReady();})();`;
(async()=>{
 const b=await chromium.launch();
 const mk=async(key)=>{const ctx=await b.newContext({viewport:{width:1300,height:900}});
  await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));
  if(key) await ctx.addInitScript(()=>{window.claude.config=async()=>({gmaps:'TESTKEY'});});
  await ctx.addInitScript(()=>{window.__opened=[];window.open=u=>{window.__opened.push(u);return null;};});
  const p=await ctx.newPage();p.errs=[];p.reqs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('request',r=>p.reqs.push(r.url()));
  await p.route('https://maps.googleapis.com/**',r=>r.fulfill({contentType:'text/javascript',body:FAKE}));
  await p.goto('http://localhost:'+(process.env.PORT||8765)+'/');await p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
  await p.setInputFiles('#bigpick','/tmp/stufen-grid.geojson');await p.waitForSelector('#geo-name');await p.click('[data-act="impRun"]');await p.waitForFunction(()=>window.__stufen.S.imp.step==='done');await p.click('[data-act="impClose"]');
  return p;};
 // ---- no key: nothing changes, Google is never asked ----
 let p=await mk(false);
 await p.click('[data-act="tab"][data-v="study"]');await p.click('[data-act="start"]');await p.waitForSelector('#clickmap .rmap svg');await p.waitForTimeout(600);
 ok(await p.locator('.rmap.gg').count()===0&&await p.locator('#clickmap .sea').count()===1,'without a key the map is drawn by the page');
 ok(!p.reqs.some(u=>u.includes('googleapis.com/maps')),'and Google is not contacted');
 await p.click('#open-settings');ok(await p.locator('#g-on').count()===0,'Settings shows no Google switch then');
 await p.context().close();
 // ---- with a key ----
 p=await mk(true);
 ok(!p.reqs.some(u=>u.includes('googleapis.com/maps')),'with a key, Google is still not loaded before a map is shown');
 await p.click('[data-act="tab"][data-v="study"]');await p.click('[data-act="start"]');await p.waitForSelector('#clickmap .rmap.gg .gbg');
 const req=p.reqs.find(u=>u.includes('googleapis.com/maps'))||'';ok(req.includes('key=TESTKEY')&&req.includes('callback=__gmReady'),'the Google script is asked for with the site’s key');
 ok(await p.locator('#clickmap .sea').count()===0&&await p.locator('#clickmap .cl').count()===0&&!p.reqs.some(u=>u.includes('world.json')),'the page draws no sea or land of its own and does not fetch its world file');
 const o=await p.evaluate(()=>window.__g.opts);ok(o.gestureHandling==='none'&&o.disableDefaultUI===true&&o.clickableIcons===false,'the Google map takes no gestures itself');
 // the picture under the shapes is in the right place and at the right size
 const geo=()=>p.evaluate(()=>{const A=window.__stufen,S=A.S,d=S.decks[S.cur],f=d.fields.find(f=>f.kind==='region'),rm=document.querySelector('#clickmap .rmap'),v=A.S.study.shown&&A.S.study.rview?A.S.study.rview:A.VIEW.study,inv=A.geoInv(f),r=v.r||1;
   const c=inv(v.x+0.5/v.k,v.y+0.5*r/v.k),l=inv(v.x,v.y),R=inv(v.x+1/v.k,v.y),g=document.querySelector('.gbg'),sc=+/scale\(([\d.]+)\)/.exec(g.style.transform)[1];
   return {c,dl:R[0]-l[0],W:rm.clientWidth,H:rm.clientHeight,sc,gw:parseFloat(g.style.width),gh:parseFloat(g.style.height),cam:window.__g.cam,k:v.k,inside:g.parentNode===rm,first:rm.firstElementChild===g};});
 let g=await geo();
 ok(g.inside&&g.first,'the Google map sits inside the map box, under the shapes');
 ok(Math.abs(g.cam.center.lng-g.c[0])<1e-6&&Math.abs(g.cam.center.lat-g.c[1])<1e-6,'its centre is the middle of the view ('+g.cam.center.lat.toFixed(3)+', '+g.cam.center.lng.toFixed(3)+')');
 ok(Number.isInteger(g.cam.zoom)&&g.sc>0.7&&g.sc<1.42,'it uses a whole zoom level ('+g.cam.zoom+') scaled by '+g.sc.toFixed(3));
 const pxPerDeg=x=>256*2**x.cam.zoom*x.sc/360;
 ok(Math.abs(g.dl*pxPerDeg(g)-g.W)<0.6,'one degree on Google is as wide as one degree of the shapes ('+(g.dl*pxPerDeg(g)).toFixed(2)+' px across a '+g.W+' px box)');
 ok(Math.abs(g.gw*g.sc-g.W)<0.6&&Math.abs(g.gh*g.sc-g.H)<0.6,'scaled, it fills the box exactly, so Google’s logo and notices stay in its corners');
 // zooming with the wheel settles on a whole level
 const box=await p.locator('#clickmap .rmap').boundingBox();await p.mouse.move(box.x+box.width*0.5,box.y+box.height*0.5);await p.mouse.wheel(0,-45);
 let g1=await geo();ok(g1.k>g.k&&Math.abs(g1.dl*pxPerDeg(g1)-g1.W)<0.6,'while zooming it follows the view');
 await p.waitForTimeout(450);let g2=await geo();ok(Math.abs(g2.sc-1)<0.005&&g2.k>1,'when the zoom stops, the view settles on a whole Google level (scale '+g2.sc.toFixed(4)+')');
 ok(Math.abs(g2.dl*pxPerDeg(g2)-g2.W)<0.6,'and still matches the shapes');
 // a small flowing zoom (trackpad) glides on to the next level instead of springing back; the spot under the pointer stays put
 const PX=Math.round(box.x+box.width*0.3),PY=Math.round(box.y+box.height*0.4);
 const under=()=>p.evaluate(([px,py])=>{const A=window.__stufen,S=A.S,d=S.decks[S.cur],f=d.fields.find(f=>f.kind==='region'),v=A.VIEW.study,r=document.querySelector('#clickmap .rmap').getBoundingClientRect();return A.geoInv(f)(v.x+(px-r.left)/r.width/v.k,v.y+(py-r.top)/r.height*(v.r||1)/v.k);},[PX,PY]);
 const notch=(dy,n=1)=>p.evaluate(([x,y,dy,n])=>{const el=document.querySelector('#clickmap .rmap svg');for(let i=0;i<n;i++)el.dispatchEvent(new WheelEvent('wheel',{deltaY:dy,deltaMode:1,clientX:x,clientY:y,bubbles:true,cancelable:true}));},[PX,PY,dy,n]);
 await notch(-3,2);await p.waitForTimeout(450);g2=await geo();
 await p.mouse.move(PX,PY);const u0=await under();await p.mouse.wheel(0,-40);await p.waitForTimeout(60);const gs=await geo();await p.waitForTimeout(500);let gt=await geo();const u1=await under();
 ok(gs.k>g2.k&&gs.k<g2.k*1.3&&gt.cam.zoom===g2.cam.zoom+1&&Math.abs(gt.sc-1)<0.005,'a small trackpad zoom in ends one level further in, not back where it began (level '+g2.cam.zoom+' → '+gt.cam.zoom+')');
 ok(Math.abs(u1[0]-u0[0])<4e-4&&Math.abs(u1[1]-u0[1])<4e-4,'and the place under the pointer has not moved (within a pixel)');
 await p.mouse.wheel(0,30);await p.waitForTimeout(500);let gu=await geo();ok(gu.cam.zoom===gt.cam.zoom-1&&Math.abs(gu.sc-1)<0.005,'a small zoom out ends one level further out');
 // one notch of a mouse wheel is one level, in a glide; quick notches add up
 await notch(-3);await p.waitForTimeout(40);const gm=await geo();await p.waitForTimeout(400);let gn=await geo();const u2=await under();
 ok(gm.k>gu.k*1.02&&gm.k<gu.k*1.98&&gn.cam.zoom===gu.cam.zoom+1&&Math.abs(gn.sc-1)<0.005,'one notch of the mouse wheel glides one level in');
 ok(Math.abs(u2[0]-u0[0])<4e-4&&Math.abs(u2[1]-u0[1])<4e-4,'around the pointer');
 await notch(-3,2);await p.waitForTimeout(450);let go2=await geo();ok(go2.cam.zoom===gn.cam.zoom+2&&Math.abs(go2.sc-1)<0.005,'two quick notches go two levels');
 await notch(3,3);await p.waitForTimeout(450);g2=await geo();ok(g2.cam.zoom===go2.cam.zoom-3&&Math.abs(g2.sc-1)<0.005,'three notches back go three levels out');
 await p.click('#clickmap [data-act="zoom"][data-v="in"]');await p.waitForTimeout(350);let g3=await geo();ok(Math.abs(g3.k/g2.k-2)<0.01&&g3.cam.zoom===g2.cam.zoom+1&&Math.abs(g3.sc-1)<0.005,'the + button goes one Google level in');
 for(let i=0;i<30;i++){ await p.click('#clickmap [data-act="zoom"][data-v="in"]');await p.waitForTimeout(40); } await p.waitForTimeout(400);let g4=await geo();ok(g4.k>500&&g4.cam.zoom>=17&&g4.cam.zoom<=19,'the map can be zoomed to street level (level '+g4.cam.zoom+')');
 await p.click('#clickmap [data-act="zoom"][data-v="fit"]');let g5=await geo();ok(g5.k===1,'the fit button shows the whole map again');
 // dragging moves it
 await p.mouse.wheel(0,-300);await p.waitForTimeout(450);const a0=await geo();await p.mouse.move(box.x+300,box.y+200);await p.mouse.down();await p.mouse.move(box.x+360,box.y+240,{steps:4});await p.mouse.up();const a1=await geo();
 ok(a1.cam.center.lng<a0.cam.center.lng&&a1.cam.center.lat>a0.cam.center.lat&&Math.abs(a1.sc-a0.sc)<1e-6,'dragging moves the Google map along with the shapes');
 await p.click('#clickmap [data-act="zoom"][data-v="fit"]');
 // an answer, the next card, another session: always the same one map
 const clickAt=async c=>{const v=await p.evaluate(()=>{const v=window.__stufen.VIEW.study;return {k:v.k,x:v.x,y:v.y,r:v.r||1};});await p.mouse.click(box.x+(c[0]-v.x)*v.k*box.width,box.y+(c[1]-v.y)*v.k/v.r*box.height);};
 const cen=()=>p.evaluate(()=>{const S=window.__stufen.S,d=S.decks[S.cur],n=S.notes[d.id].get(S.study.cur.nid),f=d.fields.find(f=>f.kind==='region');return window.__stufen.centroidOf(window.__stufen.parseRegion(n.f[f.id]));});
 await clickAt(await cen());await p.waitForSelector('.grades');
 ok((await p.textContent('.verdict'))==='Inside the region'&&await p.locator('#clickmap .rmap.gg .gbg').count()===1&&await p.locator('#clickmap .pp').count()===1,'a click on the right shape counts, and the answer is drawn on the Google map');
 await p.locator('[data-act="grade"]').first().click();await p.waitForSelector('#clickmap.live .rmap.gg .gbg');
 await p.click('[data-act="stop"]');await p.click('[data-act="start"]');await p.waitForSelector('#clickmap .rmap.gg .gbg');
 ok(await p.evaluate(()=>window.__g.maps)===1&&p.reqs.filter(u=>u.includes('googleapis.com/maps')).length===1,'across cards and sessions it is one Google map: one map load');
 // names hidden until the answer
 await p.evaluate(()=>{const S=window.__stufen.S,d=S.decks[S.cur];d.fields.find(f=>f.kind==='region').nolab=true;});await p.click('[data-act="stop"]');await p.click('[data-act="start"]');await p.waitForSelector('#clickmap .rmap.gg .gbg');
 const st=()=>p.evaluate(()=>JSON.stringify(window.__g.opts.styles));
 ok((await st()).includes('"elementType":"labels"'),'with “hide names until the answer”, Google’s names are off during the question');
 await p.keyboard.press('Space');await p.waitForSelector('.grades');ok(!(await st()).includes('"elementType":"labels"'),'and back on with the answer');
 await p.locator('[data-act="grade"]').first().click();await p.waitForSelector('#clickmap.live');
 // satellite
 await p.click('#clickmap [data-act="gType"]');ok(await p.evaluate(()=>window.__g.type)==='hybrid'&&await p.locator('#clickmap .rmap.gg.sat').count()===1,'the ◐ button switches to satellite with names');
 await p.click('#clickmap [data-act="gType"]');ok(await p.evaluate(()=>window.__g.type)==='roadmap','and back');
 // Google's own links stay usable under the shapes
 await p.mouse.click(box.x+box.width-12,box.y+box.height-5);
 ok((await p.evaluate(()=>window.__opened)).some(u=>u.includes('terms_maps'))&&await p.locator('#clickmap.live').count()===1,'a tap on Google’s terms link opens it and is not taken as an answer');
 // the region editor borrows the map and gives it back
 await p.click('[data-act="stop"]');await p.click('[data-act="tab"][data-v="cards"]');await p.locator('[data-act="edOpen"], td[data-reg] button, .imgbtn').first().click();
 await p.waitForSelector('#edmap .rmap',{timeout:5000}).then(async()=>{ok(await p.locator('#edmap .rmap.gg .gbg').count()===1&&await p.evaluate(()=>window.__g.maps)===1,'the region editor shows the same Google map');},()=>ok(false,'the region editor opened'));
 await p.keyboard.press('Escape');
 // switched off in Settings: drawn again, and no second map later
 await p.click('#open-settings');await p.waitForSelector('#g-on');ok((await p.textContent('#view')).includes('Google Maps Additional Terms of Service'),'Settings carries the Google terms notice');
 await p.uncheck('#g-on');await p.click('.deck');await p.click('[data-act="tab"][data-v="study"]');await p.click('[data-act="start"]');await p.waitForSelector('#clickmap .rmap svg');
 ok(await p.locator('.rmap.gg').count()===0&&await p.locator('#clickmap .sea').count()===1,'switched off, the map is drawn by the page again');
 await p.click('[data-act="stop"]');await p.click('#open-settings');await p.check('#g-on');await p.click('.deck');await p.click('[data-act="tab"][data-v="study"]');await p.click('[data-act="start"]');await p.waitForSelector('#clickmap .rmap.gg .gbg');
 ok(await p.evaluate(()=>window.__g.maps)===1,'switched on again, the same map is reused');
 // Google refuses the key: fall back at once
 await p.evaluate(()=>window.gm_authFailure());await p.waitForSelector('#clickmap .sea');
 ok(await p.locator('.rmap.gg').count()===0,'if Google refuses the key, the map is drawn by the page');
 await p.click('[data-act="stop"]');await p.click('#open-settings');ok((await p.textContent('#view')).includes('Google refused the key'),'and Settings says why');
 ok(p.errs.length===0,'no page errors '+p.errs.join(' | '));
 await p.context().close();
 // ---- phone: the tall box ----
 const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true});await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));await ctx.addInitScript(()=>{window.claude.config=async()=>({gmaps:'TESTKEY'});});
 const q=await ctx.newPage();const qe=[];q.on('pageerror',e=>qe.push(e.message));await q.route('https://maps.googleapis.com/**',r=>r.fulfill({contentType:'text/javascript',body:FAKE}));
 await q.goto('http://localhost:'+(process.env.PORT||8765)+'/');await q.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 await q.setInputFiles('#bigpick','/tmp/stufen-grid.geojson');await q.waitForSelector('#geo-name');await q.click('[data-act="impRun"]');await q.waitForFunction(()=>window.__stufen.S.imp.step==='done');await q.click('[data-act="impClose"]');
 await q.click('[data-act="tab"][data-v="study"]');await q.click('[data-act="start"]');await q.waitForSelector('#clickmap .rmap.gg .gbg');
 const m=await q.evaluate(()=>{const A=window.__stufen,S=A.S,d=S.decks[S.cur],f=d.fields.find(f=>f.kind==='region'),rm=document.querySelector('#clickmap .rmap'),v=A.VIEW.study,inv=A.geoInv(f),r=v.r||1,g=document.querySelector('.gbg'),sc=+/scale\(([\d.]+)\)/.exec(g.style.transform)[1],c=inv(v.x+0.5/v.k,v.y+0.5*r/v.k),t=inv(0.5,v.y),bt=inv(0.5,v.y+r/v.k);
   const my=l=>Math.log(Math.tan(Math.PI/4+l*Math.PI/360));return {r,W:rm.clientWidth,H:rm.clientHeight,gh:parseFloat(g.style.height)*sc,cam:window.__g.cam,c,span:(my(t[1])-my(bt[1]))*256*2**window.__g.cam.zoom*sc/(2*Math.PI)};});
 ok(m.r>1&&Math.abs(m.gh-m.H)<0.6&&Math.abs(m.cam.center.lat-m.c[1])<1e-6,'phone: in the tall box the Google map fills the box and is centred on it');
 ok(Math.abs(m.span-m.H)<1,'phone: north to south it matches the shapes too ('+m.span.toFixed(1)+' px in a '+m.H+' px box)');
 ok(qe.length===0,'phone: no page errors '+qe.join(' | '));
 await b.close();
})();
