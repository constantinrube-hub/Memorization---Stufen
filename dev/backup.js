/* a backup file carries everything: decks, settings, folders, groups and stored files; restoring it on an empty page brings all of it back */
const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1300,height:900}});
 await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));
 const url='http://localhost:'+(process.env.PORT||8765)+'/',ready=p=>p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(url);await ready(p);
 const ID='c0ffee00c0ffee00c0ffee00c0ffee00',PIC='00112233445566778899aabbccddeeff';
 await p.evaluate(([ID,PIC])=>{const st=window.__store;
  const cl={id:'c1',name:'Default',stages:[10,1440],kinds:['h','d'],moves:{none:'reset',close:-1,hard:0,easy:1,brainer:2},end:'repeat',grow:2};
  st.set('decks/d0',{id:'d0',name:'With files',created:1,newPerDay:20,rollover:4,css:'',fields:[{id:'fa',name:'Front',kind:'text'},{id:'fi',name:'Pic',kind:'image'},{id:'fr',name:'Map',kind:'region',map:'vec',ar:1,geo:{m:1,w:0,x0:0,y0:0,s:1,pad:0,b:[0,0,1,1]},cov:{id:ID,n:2,name:'locs',show:1}}],types:[{id:'t1',name:'F',front:'{{Front}}',back:'{{Pic}}',typed:''}],clusters:[cl]});
  st.set('decks/d0/notes/n0',{id:'n0',c:'c1',f:{fa:'Q',fi:'/_blob/'+PIC},s:{t1:{st:1,iv:1440,due:9e12,reps:2,lapses:0,first:1,last:2}},o:1,t:1});
  st.set('decks/d1',{id:'d1',name:'Plain',created:2,newPerDay:20,rollover:4,css:'',fields:[{id:'fa',name:'Front',kind:'text'},{id:'fb',name:'Back',kind:'text'}],types:[{id:'t1',name:'F',front:'{{Front}}',back:'{{Back}}',typed:''}],clusters:[cl]});
  st.set('decks/d1/notes/n0',{id:'n0',c:'c1',f:{fa:'A',fb:'B'},s:{},o:1,t:1});
  st.set('meta/settings',{snaps:[],groups:[{id:'g1',name:'Pair',decks:['d0','d1']}],folders:{d0:['Geo','Asia'],d1:['Misc','']},cap:150,newCap:12,strict:true,backupDays:3});
  localStorage.setItem('__blobs',JSON.stringify([[ID,JSON.stringify({v:1,p:[[1,2,0,0,0],[3,4,0,0,0]]})],[PIC,'not really a picture: äö']]));},[ID,PIC]);
 await p.reload();await ready(p);
 await p.click('#open-settings');await p.click('[data-act="exportAll"]');await p.waitForFunction(()=>window.__dl.length===1);
 const file=await p.evaluate(()=>window.__dl[0].data),o=JSON.parse(file);
 ok(o.app==='stufen'&&o.decks.length===2&&o.settings.cap===150&&o.settings.folders.d0[1]==='Asia'&&o.settings.groups.length===1,'the backup holds decks, folders, groups and settings');
 ok(Object.keys(o.files).sort().join()===[PIC,ID].sort().join()&&!('snaps' in o.settings)&&!('lastDl' in o.settings),'and both stored files, but nothing tied to this page’s own storage');
 fs.writeFileSync('/tmp/stufen-full-backup.json',file);
 // an empty page
 await p.evaluate(()=>{localStorage.clear();});await p.reload();await ready(p);
 ok(await p.evaluate(()=>Object.keys(window.__stufen.S.decks).length)===0&&await p.evaluate(()=>window.__blobs.size)===0,'start again from nothing');
 await p.setInputFiles('#bigpick','/tmp/stufen-full-backup.json');await p.waitForSelector('#rs-sets');
 ok(await p.isChecked('#rs-sets')&&(await p.textContent('.sheet')).includes('2 stored files'),'the restore dialog offers the settings and names the stored files');
 await p.click('[data-act="impRun"]');await p.waitForFunction(()=>window.__stufen.S.imp&&window.__stufen.S.imp.step==='done',null,{timeout:20000});
 const msg=await p.evaluate(()=>window.__stufen.S.imp.msg);ok(/Restored 2 decks/.test(msg)&&/2 stored files put back/.test(msg)&&/Folders, groups and settings/.test(msg),'the result says what came back');
 await p.click('[data-act="impClose"]');await p.waitForFunction(()=>document.querySelector('#status').textContent==='Saved',null,{timeout:20000});
 const r=await p.evaluate(([ID,PIC])=>{const S=window.__stufen.S,M=window.__store.get('meta/settings');return [window.__blobs.get(ID),window.__blobs.get(PIC),M.folders.d0.join('/'),M.groups[0].decks.join(),M.cap,M.newCap,M.strict,M.backupDays,S.decks.d0.fields[2].cov.id,S.notes.d0.get('n0').f.fi,S.notes.d0.get('n0').s.t1.reps];},[ID,PIC]);
 ok(JSON.parse(r[0]).p.length===2&&r[1]==='not really a picture: äö','both files are back under their old ids, byte for byte');
 ok(r[2]==='Geo/Asia'&&r[3]==='d0,d1','folders and groups are back');ok(r[4]===150&&r[5]===12&&r[6]===true&&r[7]===3,'daily limits and the other settings are back');
 ok(r[8]===ID&&r[9]==='/_blob/'+PIC&&r[10]===2,'the decks still point at their files; progress kept');
 // restoring again changes nothing and stores nothing twice
 await p.setInputFiles('#bigpick','/tmp/stufen-full-backup.json');await p.waitForSelector('#rs-sets');await p.click('[data-act="impRun"]');await p.waitForFunction(()=>window.__stufen.S.imp&&window.__stufen.S.imp.step==='done',null,{timeout:20000});
 ok(/all here already/.test(await p.evaluate(()=>window.__stufen.S.imp.msg))&&await p.evaluate(()=>window.__store.get('meta/settings').groups.length)===1,'a second restore finds the files here and does not double the group');
 await p.click('[data-act="impClose"]');
 // a file with settings and files only (no decks) is accepted
 fs.writeFileSync('/tmp/stufen-extras.json',JSON.stringify({app:'stufen',v:2,saved:Date.now(),decks:[],settings:{folders:{d1:['Moved','']},groups:[],cap:99},files:{'ffffffffffffffffffffffffffffffff':{t:'application/json',d:Buffer.from('{"v":1,"p":[]}').toString('base64')}}}));
 await p.setInputFiles('#bigpick','/tmp/stufen-extras.json');await p.waitForSelector('#rs-sets');ok((await p.textContent('.sheet')).includes('holds no decks'),'a file without decks is accepted and says so');
 await p.click('[data-act="impRun"]');await p.waitForFunction(()=>window.__stufen.S.imp&&window.__stufen.S.imp.step==='done',null,{timeout:20000});await p.click('[data-act="impClose"]');
 await p.waitForFunction(()=>document.querySelector('#status').textContent==='Saved',null,{timeout:20000});
 const e=await p.evaluate(()=>{const M=window.__store.get('meta/settings');return [M.folders.d1[0],M.folders.d0[0],M.cap,window.__blobs.get('ffffffffffffffffffffffffffffffff'),Object.keys(window.__stufen.S.decks).length];});
 ok(e[0]==='Moved'&&e[1]==='Geo'&&e[2]===99&&e[3]==='{"v":1,"p":[]}'&&e[4]===2,'its folders, settings and file are applied; the decks stay');
 // an old backup without settings or files still restores
 fs.writeFileSync('/tmp/stufen-old.json',JSON.stringify({app:'stufen',v:2,saved:1,schedules:[],decks:o.decks.slice(1)}));
 await p.setInputFiles('#bigpick','/tmp/stufen-old.json');await p.waitForSelector('#rs-keep');ok(await p.locator('#rs-sets').count()===0,'an older backup shows no settings option');
 await p.click('[data-act="impRun"]');await p.waitForFunction(()=>window.__stufen.S.imp&&window.__stufen.S.imp.step==='done',null,{timeout:20000});ok(/Restored 1 deck\./.test(await p.evaluate(()=>window.__stufen.S.imp.msg)),'and restores as before');
 ok(errs.length===0,'no page errors '+errs.join(' | '));
 await b.close();
})();
