const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1300,height:900}});
 await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text());});
 // seed: 8 text decks
 await p.goto('http://localhost:'+(process.env.PORT||8765)+'/');await p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 await p.evaluate(()=>{const S=window.__stufen.S;const rows=[];});
 // build decks through the UI state directly, then reload
 await p.evaluate(()=>{const st=window.__store;const mk=(id,name,n)=>{const d={id,name,created:Date.now()+st.size,newPerDay:20,rollover:4,css:'',fields:[{id:'fa',name:'Front',kind:'text'},{id:'fb',name:'Back',kind:'text'}],types:[{id:'t1',name:'F→B',front:'{{Front}}',back:'{{Back}}',typed:''}],clusters:[{id:'c1',name:'Default',stages:[10,1440,4320],kinds:['h','d','d'],moves:{none:'reset',close:-1,hard:0,easy:1,brainer:2},end:'repeat',grow:2},{id:'c2',name:'Second',stages:[10,1440],kinds:['h','d'],moves:{none:'reset',close:-1,hard:0,easy:1,brainer:2},end:'repeat',grow:2}]};st.set('decks/'+id,d);for(let i=0;i<n;i++){const nid='n'+String(i).padStart(3,'0');st.set('decks/'+id+'/notes/'+nid,{id:nid,c:i<n-3?'c1':'c2',f:{fa:'Q'+(i+1)+' '+name,fb:'A'+(n-i)},s:{},o:i+1,t:1});}};
   ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel'].forEach((n,i)=>mk('d'+i,n,12));localStorage.setItem('__db',JSON.stringify([...st]));});
 await p.reload();await p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 ok(await p.locator('.deck').count()===8,'8 decks listed');
 // 8 deck search
 await p.fill('#deck-q','charl');ok(await p.locator('.deck').count()===1,'search filters to Charlie');
 ok(await p.evaluate(()=>document.activeElement.id==='deck-q'),'search keeps focus');
 await p.keyboard.press('Enter');ok(await p.inputValue('#deck-name')==='Charlie','Enter opens the match');ok(await p.locator('.deck').count()===8,'list restored');
 // reminder
 await p.waitForSelector('#remind');ok(true,'reminder banner shown');
 // study: edit, flag, bury, suspend
 await p.click('[data-act="tab"][data-v="study"]');await p.click('[data-act="start"]');
 const cur=()=>p.evaluate(()=>window.__stufen.S.study.cur.nid);
 const n0=await cur();ok(n0==='n000','first new card is first row');
 await p.keyboard.press('e');await p.waitForSelector('#modal3 textarea');await p.fill('#ce-fb','Edited answer');await p.keyboard.press('Control+Enter');
 ok(await p.locator('#modal3').isHidden(),'editor closed');
 await p.waitForFunction(()=>window.__store.get('decks/d2/notes/n000').f.fb==='Edited answer');ok(true,'edit saved to store');
 ok(await cur()===n0,'still on the same card after edit');
 await p.keyboard.press('f');ok(await p.locator('[data-act="cFlag"].on').count()===1,'flag shown');
 await p.keyboard.press('b');const n1=await cur();ok(n1==='n001','bury moves on');
 ok(await p.evaluate(()=>window.__stufen.counts(window.__stufen.S.decks.d2).bur)===1,'1 buried');
 await p.click('[data-act="undo"]');ok(await cur()===n0,'undo bury returns the card');ok(await p.evaluate(()=>window.__stufen.counts(window.__stufen.S.decks.d2).bur)===0,'unburied');
 ok(await p.evaluate(()=>window.__stufen.markOf(window.__stufen.S.notes.d2.get('n000'),'t1').f)===1,'flag kept through undo');
 await p.keyboard.press('s');ok(await cur()==='n001','suspend moves on');
 // grade a few
 for(let i=0;i<3;i++){await p.keyboard.press('Space');await p.keyboard.press('4');}
 const c=await p.evaluate(()=>{const c=window.__stufen.counts(window.__stufen.S.decks.d2);return [c.sus,c.today,c.nw];});ok(c[0]===1&&c[1]===3&&c[2]===8,'counts sus/today/new '+c);
 await p.click('[data-act="stop"]');ok(await p.locator('.stat:has-text("suspended")').count()===1,'suspended tile');
 // cards tab filter + bulk
 await p.click('[data-act="tab"][data-v="cards"]');await p.selectOption('#cards-mk','s');ok(await p.locator('#rows tr[data-id]:not(.ghost)').count()===1,'filter suspended = 1 row');
 ok((await p.locator('#rows tr td.prog').first().innerHTML()).includes('Suspended'),'S mark in stage cell');
 await p.check('#rows tr[data-id="n000"] [data-sel]');await p.click('[data-act="bulkMark"][data-v="s:0"]');ok(await p.locator('#rows tr[data-id]:not(.ghost)').count()===0,'unsuspended');
 await p.selectOption('#cards-mk','f');ok(await p.locator('#rows tr[data-id]:not(.ghost)').count()===1,'filter flagged = 1');await p.selectOption('#cards-mk','');
 // new order
 await p.click('[data-act="tab"][data-v="schedule"]');
 const nx=()=>p.evaluate(()=>{const S=window.__stufen.S;return window.__stufen.nextCard(S.decks.d2,'',Date.now(),false,0,null).card.n.f.fb;});
 ok(await nx()==='Edited answer','list order: n000 first again');
 await p.selectOption('#d-order','cod:fb');ok(await nx()==='Edited answer','Z→A by Back: "Edited answer" first');
 await p.selectOption('#d-order','col:fb');ok(await nx()==='A1','A→Z numeric: A1 first ('+await nx()+')');
 await p.selectOption('#d-order','random');const r1=await nx();await p.click('[data-act="reshuffle"]');let diff=false;for(let i=0;i<6&&!diff;i++){diff=(await nx())!==r1;if(!diff)await p.click('[data-act="reshuffle"]');}ok(diff,'reshuffle changes the first card');
 // reset cluster + deck with snapshot
 await p.click('[data-act="ask"][data-v="resetDeck:d2"]');await p.click('[data-act="resetDeck"]');
 await p.waitForFunction(()=>window.__stufen.S.setMsg.startsWith('Progress reset'));
 ok(await p.evaluate(()=>window.__stufen.counts(window.__stufen.S.decks.d2).today)===0,'progress reset');
 const snaps=()=>p.evaluate(()=>window.__stufen.S.meta.snaps.map(x=>x.why));
 ok((await snaps()).includes('Before resetting Charlie'),'snapshot taken before reset: '+JSON.stringify(await snaps()));
 ok((await p.textContent('.banner:not(#remind)')).includes('Settings → Backups'),'message mentions snapshot');
 // restore from snapshot
 await p.click('#open-settings');await p.waitForSelector('table.snap');
 await p.click('[data-act="snapRestore"]');await p.waitForSelector('#rs-mode');ok(await p.locator('[data-impi]').count()===8,'restore dialog lists 8 decks');
 await p.click('[data-act="impRun"]');await p.waitForFunction(()=>window.__stufen.S.imp&&window.__stufen.S.imp.step==='done');
 ok(await p.evaluate(()=>window.__stufen.counts(window.__stufen.S.decks.d2).today)===3,'progress back after restoring the snapshot');
 ok(await p.evaluate(()=>!!window.__stufen.S.notes.d2.get('n000').x),'marks restored');
 ok((await snaps()).some(w=>w.startsWith('Before restoring')),'snapshot before restore');
 await p.click('[data-act="impClose"]');
 // vacation
 await p.click('#open-settings');const due0=await p.evaluate(()=>window.__stufen.S.notes.d2.get('n001').s.t1.due);
 await p.fill('#vac-n','7');await p.locator('#vac-n').blur();await p.selectOption('#vac-deck','d2');await p.click('[data-act="ask"][data-v="vacShift:x"]');await p.click('[data-act="vacShift"]');
 await p.waitForFunction(()=>window.__stufen.S.setMsg.includes('moved'));
 const due1=await p.evaluate(()=>window.__stufen.S.notes.d2.get('n001').s.t1.due);ok(Math.abs((due1-due0)/86400000-7)<0.05,'due moved 7 days: '+(due1-due0)/86400000);
 console.log('  msg:',await p.evaluate(()=>window.__stufen.S.setMsg));
 // snap now -> new (state changed), again -> same
 await p.click('[data-act="snapNow"]');await p.waitForFunction(()=>/Snapshot saved|Nothing has changed/.test(window.__stufen.S.setMsg));const m1=await p.evaluate(()=>window.__stufen.S.setMsg);
 await p.waitForFunction(()=>!window.__stufen.S.busy);await p.click('[data-act="snapNow"]');await p.waitForFunction(()=>/Nothing has changed/.test(window.__stufen.S.setMsg));ok(true,'second manual snapshot is deduplicated (first: '+m1+')');
 const cnt=await p.evaluate(()=>[window.__stufen.S.meta.snaps.length,window.__blobs.size]);ok(cnt[0]===cnt[1]&&cnt[0]<=10,'snapshots = stored files: '+cnt);
 // backup file
 await p.click('#remind [data-act="exportAll"]');await p.waitForFunction(()=>window.__dl.length===1);
 const dl=await p.evaluate(()=>{const o=JSON.parse(window.__dl[0].data);return [window.__dl[0].filename,o.app,o.decks.length,!!o.decks[2].notes[0].x];});ok(dl[1]==='stufen'&&dl[2]===8&&dl[3],'backup file valid, has marks: '+dl);
 await p.waitForFunction(()=>!document.querySelector('#remind'));ok(true,'reminder gone after saving');
 await p.screenshot({path:'/tmp/stufen-settings.png',fullPage:true});
 // merge still works (async now)
 await p.click('.deck >> text=Alpha');await p.click('[data-act="mergeOpen"]');await p.check('#mg-d1');await p.click('[data-act="impRun"]');await p.waitForFunction(()=>window.__stufen.S.imp&&window.__stufen.S.imp.step==='done');
 ok(await p.evaluate(()=>window.__stufen.S.notes.d0.size)===24&&await p.locator('.deck').count()===7,'merge ok');await p.click('[data-act="impClose"]');
 // delete deck takes snapshot
 await p.click('[data-act="ask"][data-v^="delDeck"]');await p.click('[data-act="delDeck"]');await p.waitForFunction(()=>Object.keys(window.__stufen.S.decks).length===6);ok((await snaps()).some(w=>w.startsWith('Before deleting'))||await p.evaluate(()=>{const l=window.__stufen.S.meta.snaps.slice().sort((a,b)=>b.t-a.t)[0];return !!l&&l.decks===7;}),'snapshot before delete (or the daily one already holds that exact state)');
 await p.waitForFunction(()=>document.querySelector('#status').textContent==='Saved',null,{timeout:20000});
 // reload: persisted, auto snapshot after 4 s
 await p.reload();await p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 ok(await p.locator('.deck').count()===6,'state persisted');
 await p.waitForFunction(()=>window.__stufen.S.meta.snaps.some(x=>x.auto),null,{timeout:15000}).then(()=>ok(true,'daily snapshot taken'),()=>ok(false,'daily snapshot taken'));
 ok(errs.filter(e=>!/ERR_TUNNEL|Failed to load resource/.test(e)).length===0,'no page errors '+errs.join(' | '));
 await b.close();
})();
