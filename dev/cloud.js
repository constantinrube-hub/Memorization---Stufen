/* the site as Cloudflare runs it: sign-in, storage in the database, stored files, two devices.
   Needs the local site running, see dev/cloud.sh. */
const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
const url='http://localhost:'+(process.env.CPORT||8799)+'/',PW=process.env.STUFEN_PASSWORD||'test-pass-1';
const feats=[];for(let i=0;i<3;i++)for(let j=0;j<2;j++){const x=120+i,y=14+j;feats.push({type:'Feature',properties:{name:'Cell '+String.fromCharCode(65+i)+(j+1)},geometry:{type:'Polygon',coordinates:[[[x,y],[x+1,y],[x+1,y+1],[x,y+1],[x,y]]]}});}
fs.writeFileSync('/tmp/stufen-grid6.geojson',JSON.stringify({type:'FeatureCollection',features:feats}));
(async()=>{
 const b=await chromium.launch();const ready=p=>p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…',null,{timeout:30000});
 // signed out: nothing is readable
 for(const u of ['api/doc?path=meta/settings','api/coll?path=decks','api/blob','_blob/'+'0'.repeat(32)]){const r=await fetch(url+u);ok(r.status===401,'signed out: /'+u.split('?')[0]+' answers 401');}
 ok((await fetch(url+'api/doc?path=meta/x',{method:'PUT',body:'{}'})).status===401,'signed out: nothing can be written');
 ok((await fetch(url+'api/doc?path=meta/x',{method:'PUT',body:'{}',headers:{origin:'https://elsewhere.example'}})).status===403,'a request from another site is refused');
 const ctx=await b.newContext({viewport:{width:1300,height:900},acceptDownloads:true});
 const A=await ctx.newPage();const errs=[];A.on('pageerror',e=>errs.push('A '+e.message));
 await A.goto(url);await A.waitForSelector('#cloud-gate input');ok(true,'the sign-in box is shown first');
 ok((await A.textContent('#status'))==='Loading…','the page waits behind it');
 await A.fill('#cloud-gate input','nope');await A.click('#cloud-gate button');await A.waitForFunction(()=>document.querySelector('#cloud-gate .e').textContent.length>0);
 ok((await A.textContent('#cloud-gate .e')).includes('not the password'),'a wrong password is refused');
 await A.fill('#cloud-gate input',PW);await A.click('#cloud-gate button');await ready(A);
 ok(await A.locator('#cloud-gate').count()===0&&(await A.textContent('#status'))==='Saved','signed in, empty store loaded');
 // a deck made in the page lands in the database
 await A.click('#new-deck');await A.fill('#deck-name','Cloud deck');await A.locator('#deck-name').blur();
 await A.waitForFunction(()=>document.querySelector('#status').textContent==='Saved',null,{timeout:20000});
 await A.reload();await ready(A);ok(await A.locator('#cloud-gate').count()===0,'a reload does not ask for the password again');
 ok(await A.evaluate(()=>Object.values(window.__stufen.S.decks).some(d=>d.name==='Cloud deck')),'the deck survived the reload');
 // GeoJSON import: many documents at once, with shapes
 await A.setInputFiles('#bigpick','/tmp/stufen-grid6.geojson');await A.waitForSelector('#geo-name');await A.click('[data-act="impRun"]');await A.waitForFunction(()=>window.__stufen.S.imp.step==='done',null,{timeout:30000});await A.click('[data-act="impClose"]');
 await A.waitForFunction(()=>document.querySelector('#status').textContent==='Saved',null,{timeout:30000});
 const gid=await A.evaluate(()=>window.__stufen.S.cur);
 const srv=await A.evaluate(async id=>{const r=await (await fetch('/api/coll?path=decks/'+id+'/notes')).json();return r.docs.length;},gid);ok(srv===6,'the database holds the 6 imported rows ('+srv+')');
 // answer cards; progress and the log are stored
 await A.click('[data-act="tab"][data-v="study"]');await A.click('[data-act="start"]');await A.waitForSelector('#clickmap .rmap svg');
 const B=await ctx.newPage();B.on('pageerror',e=>errs.push('B '+e.message));await B.goto(url);await ready(B);
 ok(await B.evaluate(id=>window.__stufen.S.notes[id].size,gid)===6,'a second tab has the same decks');
 const box=await A.locator('#clickmap .rmap').boundingBox();
 const first=await A.evaluate(()=>{const S=window.__stufen.S,d=S.decks[S.cur],n=S.notes[d.id].get(S.study.cur.nid),f=d.fields.find(f=>f.kind==='region'),v=window.__stufen.VIEW.study;return {nid:n.id,c:window.__stufen.centroidOf(window.__stufen.parseRegion(n.f[f.id])),v:{k:v.k,x:v.x,y:v.y,r:v.r||1}};});
 await A.mouse.click(box.x+(first.c[0]-first.v.x)*first.v.k*box.width,box.y+(first.c[1]-first.v.y)*first.v.k/first.v.r*box.height);await A.waitForSelector('.grades');await A.locator('[data-act="grade"]').last().click();
 await A.waitForFunction(()=>document.querySelector('#status').textContent==='Saved',null,{timeout:20000});
 const st=await A.evaluate(async a=>{const n=await (await fetch('/api/doc?path=decks/'+a[0]+'/notes/'+a[1])).json(),l=await (await fetch('/api/coll?path=decks/'+a[0]+'/log')).json(),p=await (await fetch('/api/doc?path=meta/pulse')).json();return [Object.keys(n.data.s).length,l.docs.reduce((x,d)=>x+d.data.e.length,0),p.exists&&!!p.data.decks[a[0]]];},[gid,first.nid]);
 ok(st[0]===1&&st[1]===1,'the answer is stored: progress on the row and one log line');ok(st[2],'the change stamp was written');
 // the other tab picks it up by itself (asks every 12 s)
 await B.waitForFunction(a=>{const n=window.__stufen.S.notes[a[0]].get(a[1]);return n&&Object.keys(n.s).length===1;},[gid,first.nid],{timeout:30000}).then(()=>ok(true,'the other tab receives the answer without a reload'),()=>ok(false,'the other tab receives the answer without a reload'));
 // merge of the stamp document keeps both devices' entries
 const mg=await A.evaluate(async()=>{await fetch('/api/doc?path=meta/t1',{method:'PUT',body:JSON.stringify({a:1,decks:{x:'1'}})});await fetch('/api/doc?path=meta/t1',{method:'PATCH',body:JSON.stringify({b:2,decks:{y:'2'}})});const r=await (await fetch('/api/doc?path=meta/t1')).json();const miss=(await fetch('/api/doc?path=meta/none',{method:'PATCH',body:'{}'})).status;await fetch('/api/doc?path=meta/t1',{method:'DELETE'});const gone=await (await fetch('/api/doc?path=meta/t1')).json();return [r.data,r.v,miss,gone.exists];});
 ok(mg[0].a===1&&mg[0].b===2&&mg[0].decks.x==='1'&&mg[0].decks.y==='2'&&mg[1]===2,'update merges maps key by key');ok(mg[2]===404&&mg[3]===false,'update of a missing document is refused; delete removes');
 // stored files: a 5 MB file goes in whole and comes back byte for byte
 const bl=await A.evaluate(async()=>{const a=await window.claude.use('assets');const big=new Uint8Array(5*1048576+123);for(let i=0;i<big.length;i++)big[i]=(i*31+7)&255;const up=await a.upload(new Blob([big],{type:'application/octet-stream'}),{type:'application/octet-stream'});
   const back=new Uint8Array(await (await fetch('/_blob/'+up.id)).arrayBuffer());let same=back.length===big.length;for(let i=0;same&&i<big.length;i+=997)same=back[i]===big[i];
   const l=await a.list(),del=await a.delete(up.id),after=await fetch('/_blob/'+up.id,{cache:'no-store'});let big2=null;try{await a.upload(new Blob([new Uint8Array(21*1048576)]),{});}catch(e){big2=e.code;}
   return [up.id.length,same,l.assets.some(x=>x.id===up.id&&x.sizeBytes===big.length),l.usage.bytes>=big.length&&l.usage.maxBytes>0,del.deleted,after.status,big2];});
 ok(bl[0]===32&&bl[1],'a 5 MB file is stored in pieces and read back unchanged');ok(bl[2]&&bl[3],'it is listed with its size; usage is reported');ok(bl[4]&&bl[5]===404,'deleting removes it');ok(bl[6]==='too_large','a file over 20 MB is refused with the code the page expects');
 // a file from a backup goes back under its old id; a second put leaves it alone
 const pt=await A.evaluate(async()=>{const a=await window.claude.use('assets'),id='abcdefabcdefabcdefabcdefabcdef12';const r1=await a.put(id,new Blob(['first']),{type:'text/plain'}),r2=await a.put(id,new Blob(['second, longer']),{type:'text/plain'});const t=await (await fetch('/_blob/'+id,{cache:'no-store'})).text();let bad=null;try{await a.put('nope',new Blob(['x']),{});}catch(e){bad=e.code;}await a.delete(id);return [r1.id===id,r2.sizeBytes,t,bad];});
 ok(pt[0]&&pt[1]===5&&pt[2]==='first'&&pt[3]==='invalid_argument','a backup’s file is stored under its own id and never overwritten');
 // a restore-sized burst: 600 rows written at once arrive complete and in few requests
 const burst=await A.evaluate(async()=>{const db=await window.claude.use('db');let calls=0;const of=window.fetch;window.fetch=(...a)=>{if(String(a[0]).startsWith('/api/batch'))calls++;return of(...a);};
   const big='x'.repeat(20000);await Promise.all(Array.from({length:600},(_,i)=>db.doc('test/b/rows/r'+String(i).padStart(4,'0')).set({id:'r'+i,i,big})));
   let n=0,last=null,sum=0;for(;;){let q=db.collection('test/b/rows');if(last)q=q.where('id','>',last);const s=await q.limit(250).get();n+=s.size;for(const d of s.docs)sum+=d.data().i;if(s.size<250)break;last=s.docs[s.size-1].id;}
   await Promise.all(Array.from({length:600},(_,i)=>db.doc('test/b/rows/r'+String(i).padStart(4,'0')).delete()));const left=(await db.collection('test/b/rows').get()).size;
   let tooBig=null;try{await db.doc('test/b/rows/huge').set({v:'y'.repeat(1100000)});}catch(e){tooBig=e.code;}window.fetch=of;return [n,sum,calls,left,tooBig];});
 ok(burst[0]===600&&burst[1]===600*599/2,'600 rows written together all arrive, read back in pages');ok(burst[2]<40,'they travel in few requests ('+burst[2]+' for 1,200 writes)');ok(burst[3]===0&&burst[4]==='invalid_argument','deletes go the same way; a document over 1 MB is refused');
 // snapshot through the page (Settings → Backups) and a backup download
 await A.click('[data-act="stop"]').catch(()=>{});await A.click('#open-settings');await A.waitForSelector('[data-act="snapNow"]');await A.click('[data-act="snapNow"]');
 await A.waitForFunction(()=>/Snapshot saved|Nothing has changed/.test(window.__stufen.S.setMsg),null,{timeout:30000});
 const sn=await A.evaluate(async()=>{const x=window.__stufen.S.meta.snaps[0];if(!x)return null;const r=await fetch('/_blob/'+x.ids[0]);return [r.status,(await r.text()).length>100];});ok(sn&&sn[0]===200&&sn[1],'a snapshot is stored as a file and can be read back');
 const [dl]=await Promise.all([A.waitForEvent('download',{timeout:15000}),A.click('[data-act="exportAll"]')]);const pth=await dl.path();const bk=JSON.parse(fs.readFileSync(pth,'utf8'));
 ok(/^stufen-backup-.*\.json$/.test(dl.suggestedFilename())&&bk.app==='stufen'&&bk.decks.length===2,'“Back up all decks” saves a file with both decks');
 // sign out: the data is closed again
 await A.evaluate(()=>window.claude.signOut());await A.waitForSelector('#cloud-gate input');ok(true,'signing out brings the sign-in box back');
 ok(await A.evaluate(async()=>(await fetch('/api/coll?path=decks')).status)===401,'and the data is closed');
 ok(errs.length===0,'no page errors '+errs.join(' | '));
 await b.close();
})();
