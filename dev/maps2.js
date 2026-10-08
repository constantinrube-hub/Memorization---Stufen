/* map settings (labels, crop, coverage), session filter, sibling spacing, start view, health check */
const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
const feats=[];for(let i=0;i<4;i++)for(let j=0;j<3;j++){const x=120+i,y=14+j;feats.push({type:'Feature',properties:{name:'Cell '+String.fromCharCode(65+i)+(j+1),zone:i<2?'West (W)':'East (E)'},geometry:{type:'Polygon',coordinates:[[[x,y],[x+1,y],[x+1,y+1],[x,y+1],[x,y]]]}});}
fs.writeFileSync('/tmp/stufen-grid2.geojson',JSON.stringify({type:'FeatureCollection',features:feats}));
const locs=[];for(let i=0;i<4;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)locs.push({lat:14+j+0.3+k*0.2,lng:120+i+0.3+k*0.2,heading:90+k,pitch:-5,zoom:0,panoId:'PANO_'+i+'_'+j+'_'+k,countryCode:'PH',stateCode:null,extra:{tags:['t']}});
for(let k=0;k<5;k++)locs.push({lat:48+k,lng:11+k,heading:0,pitch:0,zoom:0,panoId:null});
fs.writeFileSync('/tmp/stufen-mma.json',JSON.stringify({name:'My coverage',customCoordinates:locs,extra:{tags:{}}}));
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1300,height:900}});
 await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:'+(process.env.PORT||8765)+'/');await p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 const S=f=>p.evaluate(f);
 await p.setInputFiles('#bigpick','/tmp/stufen-grid2.geojson');await p.waitForSelector('#geo-name');await p.selectOption('#geo-name','name');await p.locator('[data-geox="zone"]').check();await p.click('[data-act="impRun"]');await p.waitForFunction(()=>window.__stufen.S.imp.step==='done');await p.click('[data-act="impClose"]');
 await p.click('[data-act="tab"][data-v="types"]');await p.selectOption('[data-tf="gl"]','all');await p.click('[data-act="tab"][data-v="cards"]');
 const info=()=>S(()=>{const A=window.__stufen,s=A.S,d=s.decks[s.cur],f=d.fields.find(f=>f.kind==='region'),zf=d.fields.find(f=>f.name==='zone'),n=[...s.notes[d.id].values()].find(n=>n.f[d.fields[0].id]==='Cell B2'),c=A.centroidOf(A.parseRegion(n.f[f.id])),ll=A.geoInvOf(f)(c[0],c[1]);return {fid:f.id,zid:zf.id,b:f.geo.b,c:f.geo.c||0,ar:f.ar,ll,home:f.home||null,lab:f.lab||null,cov:f.cov||null};});
 // labels
 await p.click('[data-act="msOpen"]');const i0=await info();
 await p.selectOption('#ms-lab',i0.zid);ok((await info()).lab.f===i0.zid&&await p.locator('#ms-labafter').count()===1,'labels set to the zone column');
 // crop
 await p.selectOption('#ms-crop','25');await p.waitForFunction(()=>window.__stufen.S.ms&&/Crop changed/.test(window.__stufen.S.ms.msg),null,{timeout:15000});
 const i1=await info();ok(i1.c===25&&i1.b[0]<i0.b[0]-0.9&&i1.b[2]>i0.b[2]+0.9&&i1.b[3]>i0.b[3]+0.7,'the frame is wider: '+i1.b.join(', '));
 ok(Math.abs(i1.ll[0]-i0.ll[0])<0.002&&Math.abs(i1.ll[1]-i0.ll[1])<0.002,'shapes stay where they are on the globe: '+i1.ll.map(v=>v.toFixed(4)).join(', '));
 ok((await p.textContent('#ms-msg')).includes('12 rows redrawn')&&await S(()=>window.__stufen.S.meta.snaps.some(x=>x.why.startsWith('Before changing the crop'))),'12 rows redrawn, snapshot saved first');
 // coverage import
 await p.setInputFiles('#covpick','/tmp/stufen-mma.json');await p.waitForFunction(()=>window.__stufen.S.ms&&/locations stored/.test(window.__stufen.S.ms.msg),null,{timeout:15000});
 const msg=await p.textContent('#ms-msg');ok(msg.startsWith('36 locations stored')&&msg.includes('5 outside'),'coverage file read: '+msg);
 ok((await info()).cov.n===36&&(await info()).cov.show===1&&await S(()=>window.__blobs.size)>=2,'locations kept as a stored file, dots after the answer by default');
 await p.click('[data-act="msClose"]');
 // session filter
 await p.click('[data-act="tab"][data-v="study"]');await p.selectOption('#study-ff',i0.zid);ok(await p.locator('#study-fv option').count()===2,'filter offers the two zones');
 await p.selectOption('#study-fv','East (E)');ok((await p.textContent('#filt-info')).startsWith('6 cards: 0 due, 6 new'),'selection count: '+await p.textContent('#filt-info'));
 await p.click('[data-act="start"]');await p.waitForSelector('#clickmap .rmap svg');await p.waitForTimeout(1200);
 const zoneOfCur=()=>S(()=>{const s=window.__stufen.S,d=s.decks[s.cur];return s.study.cur?s.notes[d.id].get(s.study.cur.nid).f[d.fields.find(f=>f.name==='zone').id]:null;});
 ok(await p.locator('.glbs text').count()===2&&(await p.locator('.glbs text').allTextContents()).sort().join()==='E,W','two zone labels, shortened to the bracket text');
 ok(await p.evaluate(()=>[...document.querySelectorAll('#clickmap .glbs text')].every(t=>t.style.display!=='none')),'labels are visible on the map');
 ok(await p.locator('#clickmap .cv').count()===0,'no coverage dots before the answer');
 // click the right cell after the crop
 const cur=await S(()=>{const A=window.__stufen,s=A.S,d=s.decks[s.cur],f=d.fields.find(f=>f.kind==='region'),n=s.notes[d.id].get(s.study.cur.nid);return {c:A.centroidOf(A.parseRegion(n.f[f.id])),name:n.f[d.fields[0].id]};});
 const box=await p.locator('#clickmap .rmap').boundingBox();await p.mouse.click(box.x+cur.c[0]*box.width,box.y+cur.c[1]*box.height);await p.waitForSelector('.grades');
 ok((await p.textContent('.verdict'))==='Inside the region','a click on the cell still counts after the crop');
 ok(await p.locator('#clickmap .cv').count()===1&&(await p.locator('#clickmap .cv').getAttribute('d')).split('M').length-1===36,'36 coverage dots after the answer');
 const sv=await p.locator('.glinks a').nth(1).getAttribute('href');const col=cur.name.charCodeAt(5)-65,row=+cur.name[6]-1;const m=/pano=PANO_(\d)_(\d)_\d&viewpoint=([\d.]+),([\d.]+)&heading=9\d&pitch=-5/.exec(sv);
 ok(m&&+m[1]===col&&+m[2]===row&&+m[3]>14+row&&+m[3]<15+row&&+m[4]>120+col&&+m[4]<121+col,'Street View opens one of my own locations inside the answer: '+sv);
 ok((await p.locator('.glinks a').nth(1).textContent()).includes('1 of 3'),'link says 1 of 3');
 const seen=[await zoneOfCur()];for(let i=0;i<5;i++){await p.keyboard.press('5');seen.push(await zoneOfCur());if(i<4)await p.keyboard.press('Space');}
 ok(seen.every(z=>z==='East (E)'),'the session only brings East rows: '+seen.length);
 // coverage toggle, start view
 await p.keyboard.press('Space');await p.click('#clickmap [data-act="covTog"]');await p.keyboard.press('5');
 ok(await S(()=>{const s=window.__stufen.S;return s.decks[s.cur].fields.find(f=>f.cov).cov.show;})===2,'coverage button switches to “always”');
 await p.click('[data-act="stop"]');await p.selectOption('#study-ff','');await p.click('[data-act="start"]');await p.waitForSelector('#clickmap .cv');ok(true,'dots now show while answering');
 await p.keyboard.press('+');await p.keyboard.press('+');await p.click('[data-act="setHome"]');
 ok((await info()).home&&(await info()).home.k>2&&(await p.textContent('.study .row')).includes('Start view saved'),'start view saved from the session');
 await p.click('[data-act="stop"]');await p.click('[data-act="start"]');ok(await S(()=>window.__stufen.S&&document.querySelector('#clickmap svg').viewBox.baseVal.width<500),'the next session starts zoomed in');
 await p.click('[data-act="stop"]');await p.click('[data-act="tab"][data-v="cards"]');await p.click('[data-act="msOpen"]');await p.click('[data-act="msHomeDel"]');ok((await info()).home===null,'start view cleared in Map settings');
 // back to tight crop
 await p.selectOption('#ms-crop','0');await p.waitForFunction(()=>window.__stufen.S.ms&&/Crop changed/.test(window.__stufen.S.ms.msg),null,{timeout:15000});
 const i2=await info();ok(i2.b.every((v,k)=>Math.abs(v-i0.b[k])<0.001)&&Math.abs(i2.ar-i0.ar)<0.001&&Math.abs(i2.ll[0]-i0.ll[0])<0.003,'tight crop returns to the original frame');
 await p.screenshot({path:'/tmp/stufen-ms.png'});await p.click('[data-act="msClose"]');
 // sibling spacing
 const sib=await S(()=>{const A=window.__stufen,s=A.S,d=s.decks[s.cur],f=d.fields.find(f=>f.kind==='region'),t=d.types[0],now=Date.now(),ns=[...s.notes[d.id].values()];
  for(const n of ns)n.s={};const a=ns[0],b2=ns[1],c=ns[2];b2.f[f.id]=a.f[f.id];   // b shares a's shape (an overlay code)
  const due=(n,ago)=>{n.s[t.id]={st:1,iv:1440,due:now-ago,reps:1,lapses:0,first:1,last:1,done:false};};due(a,3000);due(b2,2000);due(c,1000);A.replan();
  const first=A.nextCard(d,{c:''},now,false,0,null).card.n.id;const av={did:d.id,nid:a.id,tid:t.id,shape:a.f[f.id]};a.s[t.id].due=now+86400000;
  const withAv=A.nextCard(d,{c:'',avoid:av},now,false,0,null).card.n.id,without=A.nextCard(d,{c:''},now,false,0,null).card.n.id;c.s[t.id].due=now+86400000;
  const only=A.nextCard(d,{c:'',avoid:av},now,false,0,null).card.n.id;return [first===a.id,without===b2.id,withAv===c.id,only===b2.id];});
 ok(sib[0]&&sib[1]&&sib[2],'after a card, the row sharing its shape is passed over while another card is due');ok(sib[3],'…but it comes when nothing else is due');
 // health check
 await S(()=>{const s=window.__stufen.S,d=s.decks[s.cur],f=d.fields.find(f=>f.kind==='region'),n=[...s.notes[d.id].values()][5];n.r=n.r||{};n.r[f.id]=n.r[f.id]||{};n.r[f.id].close=(n.r[f.id].close||[]).concat(['gone1']);});
 await p.click('#open-settings');await p.click('[data-act="healthRun"]');await p.waitForSelector('#hc');
 const hc=await p.textContent('#hc');ok(hc.includes('of 25,000 documents')&&hc.includes('1 reference to a “close” neighbour row that no longer exists')&&hc.includes('file storage used'),'health check reports documents, storage and the loose reference');
 await p.click('[data-act="healthFix"][data-v="close"]');await p.waitForFunction(()=>document.querySelector('#hc').textContent.includes('Every “close” neighbour reference points at an existing row'));ok(true,'Fix removes the loose reference');
 // file formats
 const fm=await S(()=>{const f=window.__stufen.covParse;return [f('[{"lat":1.5,"lng":2.5}]').length,f('48.1,11.5\n48.2;11.6\nabc').length,f('{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[11.5,48.1]}}]}')[0].slice(0,2).join()];});
 ok(fm[0]===1&&fm[1]===2&&fm[2]==='48.1,11.5','plain arrays, latitude,longitude lines and GeoJSON points are read too');
 ok(errs.length===0,'no page errors '+errs.join(' | '));
 await b.close();
})();
