/* the built-in Street View check (Map settings). Google cannot be reached from the tests: a stand-in answers the lookups and counts what was created. */
const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
const feats=[];for(let i=0;i<4;i++)for(let j=0;j<3;j++){const x=120+i,y=14+j;feats.push({type:'Feature',properties:{name:'Cell '+String.fromCharCode(65+i)+(j+1)},geometry:{type:'Polygon',coordinates:[[[x,y],[x+1,y],[x+1,y+1],[x,y+1],[x,y]]]}});}
fs.writeFileSync('/tmp/stufen-grid.geojson',JSON.stringify({type:'FeatureCollection',features:feats}));
/* column A has no Street View; B1 only a user's photo sphere; C1 fails once before it answers */
const FAKE=`(()=>{window.__g={maps:0,panos:0,asks:[],delay:0,flaky:1};
 class M{constructor(div,o){__g.maps++;__g.opts=o;__g.type=o.mapTypeId;} moveCamera(){} setOptions(){} getMapTypeId(){return __g.type;} setMapTypeId(t){__g.type=t;}}
 class P{constructor(){__g.panos++;}}
 class SV{async getPanorama(q){__g.asks.push(q);if(__g.delay)await new Promise(r=>setTimeout(r,__g.delay));const {lat,lng}=q.location,e=c=>Object.assign(new Error('STREETVIEW_GET_PANORAMA: '+c),{code:c});
   if(lng<121)throw e('ZERO_RESULTS');if(lng>122&&lng<123&&lat<15&&__g.flaky){__g.flaky=0;throw e('UNKNOWN_ERROR');}
   const user=lng>121&&lng<122&&lat<15;return {data:{location:{latLng:{lat:()=>lat+0.002,lng:()=>lng+0.003},pano:user?'CAoSLEFGMVFpcE5fdXNlcl9waG90b19zcGhlcmU':('p'+Math.round(lat*10)+'x'+Math.round(lng*10)+'aaaaaaaaaaaaaaaaaaaaaa').slice(0,22)},links:[{heading:137.4}]}};}}
 window.google={maps:{Map:M,StreetViewPanorama:P,StreetViewService:SV,StreetViewSource:{DEFAULT:'default',GOOGLE:'google',OUTDOOR:'outdoor'},StreetViewPreference:{BEST:'best',NEAREST:'nearest'}}};window.__gmReady();})();`;
(async()=>{
 const b=await chromium.launch();
 const mk=async key=>{const ctx=await b.newContext({viewport:{width:1300,height:900}});await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));
  if(key) await ctx.addInitScript(()=>{window.claude.config=async()=>({gmaps:'TESTKEY'});});
  const p=await ctx.newPage();p.errs=[];p.reqs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('request',r=>p.reqs.push(r.url()));
  await p.route('https://maps.googleapis.com/**',r=>r.fulfill({contentType:'text/javascript',body:FAKE}));
  await p.goto('http://localhost:'+(process.env.PORT||8765)+'/');await p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
  await p.setInputFiles('#bigpick','/tmp/stufen-grid.geojson');await p.waitForSelector('#geo-name');await p.click('[data-act="impRun"]');await p.waitForFunction(()=>window.__stufen.S.imp.step==='done');await p.click('[data-act="impClose"]');
  await p.click('[data-act="tab"][data-v="cards"]');await p.click('[data-act="msOpen"]');await p.waitForSelector('.sheet.ms');return p;};
 const cov=p=>p.evaluate(()=>{const S=window.__stufen.S,f=S.decks[S.cur].fields.find(f=>f.kind==='region'),c=f.cov&&window.__stufen.covC.get(f.cov.id);return f.cov?{n:f.cov.n,name:f.cov.name,id:f.cov.id,p:c&&c.p}:null;});
 const msg=(p,re)=>p.waitForFunction(s=>{const m=window.__stufen.S.ms;return m&&!m.chk&&new RegExp(s).test(m.msg);},re,{timeout:20000});
 // without a key the check is not offered
 let p=await mk(false);ok(await p.locator('[data-act="msCheck"]').count()===0,'without a Google key the check is not offered');await p.context().close();
 p=await mk(true);await p.waitForSelector('[data-act="msCheck"]');
 ok(!p.reqs.some(u=>u.includes('googleapis.com/maps')),'with a key the button is there, and Google is not contacted before it is pressed');
 await p.click('[data-act="msCheck"]');await msg(p,'8 of 12 rows have Street View within 1 km');
 const g=await p.evaluate(()=>({maps:__g.maps,panos:__g.panos,n:__g.asks.length,q:__g.asks[0]}));
 ok(g.maps===0&&g.panos===0,'the check creates no map and no panorama viewer: nothing billable');
 ok(g.n===13,'every row is asked once, and the one Google failed on is asked again ('+g.n+' lookups for 12 rows)');
 ok(g.q.radius===1000&&g.q.preference==='nearest'&&JSON.stringify(g.q.sources)==='["google"]','it asks for the nearest official panorama within 1 km');
 let c=await cov(p);ok(c&&c.n===8&&c.name.startsWith('Street View check')&&c.p.length===8,'the 8 rows with Street View are stored as the map’s locations ('+(c&&c.name)+')');
 ok(c.p.every(q=>q[4].length===22&&q[5].startsWith('row:')&&q[2]===137)&&Math.abs(c.p[0][0]%1-0.502)<0.01,'each with its panorama, the direction of the road and its row');
 await p.click('[data-act="msRev"]');const mt=await p.textContent('#ms-miss')+' '+await p.textContent('#ms-revl');ok(mt.startsWith('4 rows of this map have no location')&&mt.includes('Cell A1')&&mt.includes('Cell B1')&&!mt.includes('Cell C1'),'the rows without official Street View are listed, the user photo sphere among them: '+mt);
 ok((await p.textContent('#ms-msg')).includes('The 4 without are listed below'),'and the result says so');
 const hr=await p.locator('#ms-rev a').evaluateAll(l=>l.map(a=>a.href));ok(hr.length===4&&hr[0].includes('center=14.5')&&hr[0].includes(',120.5'),'each listed row is a link to its place on Google Maps: '+hr[0]);await p.click('[data-act="msRev"]');
 // a second run replaces the file, after a confirmation, with another distance
 ok(await p.locator('[data-act="msCheck"]').count()===0&&await p.locator('[data-act="ask"][data-v^="msCheck"]').count()===1,'with locations loaded, the check asks before replacing them');
 await p.selectOption('#ms-rad','3000');await p.click('[data-act="ask"][data-v^="msCheck"]');
 // …stopped half way: nothing changes
 await p.evaluate(()=>{__g.delay=150;__g.asks=[];});await p.click('[data-act="msCheck"]');await p.waitForSelector('#ms-chk');await p.waitForFunction(()=>/[1-9]\d* of 12 rows checked/.test(document.querySelector('#ms-chk').textContent));
 await p.click('[data-act="msCheckStop"]');await msg(p,'Check stopped after \\d+ of 12 rows. Nothing was changed');
 let c2=await cov(p);ok(c2.id===c.id&&c2.n===8&&await p.evaluate(()=>__g.asks.length)<12,'a stopped check leaves the stored locations as they were');
 ok(await p.evaluate(()=>__g.asks[0].radius)===3000,'the chosen distance is used (3 km)');
 // Google stops answering: nothing changes
 await p.evaluate(()=>{__g.delay=0;const o=google.maps.StreetViewService.prototype.getPanorama;window.__o=o;google.maps.StreetViewService.prototype.getPanorama=async()=>{throw Object.assign(new Error('x'),{code:'UNKNOWN_ERROR'});};});
 await p.click('[data-act="ask"][data-v^="msCheck"]');await p.click('[data-act="msCheck"]');await msg(p,'Google stopped answering after 0 of 12 rows. Nothing was changed');
 ok((await cov(p)).id===c.id,'if Google stops answering, the check gives up and changes nothing');
 // nothing at all found is treated as a fault
 await p.evaluate(()=>{google.maps.StreetViewService.prototype.getPanorama=async()=>{throw Object.assign(new Error('x'),{code:'ZERO_RESULTS'});};});
 await p.click('[data-act="ask"][data-v^="msCheck"]');await p.click('[data-act="msCheck"]');await msg(p,'no Street View near any of the 12 rows');ok((await cov(p)).id===c.id,'a run that finds nothing anywhere is not stored');
 // a full second run replaces the file
 await p.evaluate(()=>{google.maps.StreetViewService.prototype.getPanorama=window.__o;});
 await p.click('[data-act="ask"][data-v^="msCheck"]');await p.click('[data-act="msCheck"]');await msg(p,'8 of 12 rows have Street View within 3 km');
 c2=await cov(p);ok(c2.id!==c.id&&c2.n===8&&await p.evaluate(id=>!JSON.parse(localStorage.getItem('__blobs')||'[]').some(e=>e[0]===id),c.id),'a finished second run replaces the stored locations');
 // closing Map settings stops a running check
 await p.evaluate(()=>{__g.delay=200;});await p.click('[data-act="ask"][data-v^="msCheck"]');await p.click('[data-act="msCheck"]');await p.waitForSelector('#ms-chk');await p.keyboard.press('Escape');await p.waitForTimeout(900);
 const n1=await p.evaluate(()=>__g.asks.length);await p.waitForTimeout(600);ok(await p.evaluate(()=>__g.asks.length)===n1&&(await cov(p)).id===c2.id,'closing Map settings stops a running check');
 // the map shown afterwards is still the one map, from the one script
 await p.evaluate(()=>{__g.delay=0;});await p.click('[data-act="tab"][data-v="study"]');await p.click('[data-act="start"]');await p.waitForSelector('#clickmap .rmap.gg .gbg');
 ok(await p.evaluate(()=>__g.maps)===1&&p.reqs.filter(u=>u.includes('googleapis.com/maps')).length===1,'studying afterwards loads the Google map once, from the script already fetched');
 // after a reload the stored locations are fetched again when Map settings opens, so the list is there without a new check
 await p.waitForTimeout(1500);await p.reload();await p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');await p.click('.deck');await p.click('[data-act="tab"][data-v="cards"]');await p.click('[data-act="msOpen"]');
 await p.waitForSelector('#ms-miss',{timeout:8000}).then(async()=>ok((await p.textContent('#ms-miss')).startsWith('4 rows')&&p.reqs.filter(u=>u.includes('googleapis.com/maps')).length===1,'after reloading the page, Map settings still lists the rows without a location, without asking Google'),()=>ok(false,'after reloading the page, Map settings lists the rows without a location'));
 // choosing which of the rows without a location to delete
 const rows=()=>p.evaluate(()=>{const s=window.__stufen.S;return s.notes[s.cur].size;});
 ok(await p.locator('[data-act="ask"][data-v^="msPrune"]').count()===0,'there is no delete button until the list is opened');
 await p.click('[data-act="msRev"]');ok(await p.locator('#ms-revl input').count()===4&&await p.locator('#ms-revl input:checked').count()===4&&(await p.textContent('[data-act="ask"][data-v^="msPrune"]'))==='Delete 4 rows','the list shows the 4 rows, all ticked');
 await p.click('[data-act="msRevAll"][data-v="0"]');ok(await p.locator('#ms-revl input:checked').count()===0&&await p.locator('[data-v^="msPrune"]').count()===0&&(await p.textContent('#ms-revn')).startsWith('0 of 4'),'“None” unticks them all, and nothing can be deleted then');
 await p.click('[data-act="msRevAll"][data-v="1"]');await p.locator('#ms-revl label',{hasText:'Cell B1'}).locator('input').uncheck();
 ok((await p.textContent('[data-act="ask"][data-v^="msPrune"]'))==='Delete 3 rows'&&(await p.textContent('#ms-revn')).startsWith('3 of 4'),'unticking one row leaves 3 to delete');
 await p.click('[data-act="ask"][data-v^="msPrune"]');await p.click('[data-act="msPrune"]');await msg(p,'3 rows deleted, 1 kept');
 ok(await rows()===9&&(await p.textContent('#ms-miss')).startsWith('1 row of this map has no location')&&(await p.textContent('#ms-revl')).includes('Cell B1')&&await p.locator('#ms-revl input:checked').count()===0,'the 3 ticked rows are deleted; the unticked one stays in the deck and in the list, still unticked');
 ok(p.errs.length===0,'no page errors '+p.errs.join(' | '));
 await b.close();
})();
