/* two devices on the same data: two pages in one browser context share the stand-in store */
const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1300,height:900}});
 await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));
 const url='http://localhost:'+(process.env.PORT||8765)+'/',ready=p=>p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 const A=await ctx.newPage();const errs=[];A.on('pageerror',e=>errs.push('A '+e.message));
 await A.goto(url);await ready(A);
 await A.evaluate(()=>{const st=window.__store;for(const [id,name] of [['d0','Alpha'],['d1','Bravo'],['d2','Charlie']]){st.set('decks/'+id,{id,name,created:st.size+1,newPerDay:20,rollover:4,css:'',fields:[{id:'fa',name:'Front',kind:'text'},{id:'fb',name:'Back',kind:'text'}],types:[{id:'t1',name:'F→B',front:'{{Front}}',back:'{{Back}}',typed:''}],clusters:[{id:'c1',name:'Default',stages:[10,1440,4320],kinds:['h','d','d'],moves:{none:'reset',close:-1,hard:0,easy:1,brainer:2},end:'repeat',grow:2}]});for(let i=0;i<8;i++)st.set('decks/'+id+'/notes/n'+i,{id:'n'+i,c:'c1',f:{fa:'Q'+i+' '+name,fb:'A'+i},s:{},o:i+1,t:1});}});
 await A.reload();await ready(A);
 const B=await ctx.newPage();B.on('pageerror',e=>errs.push('B '+e.message));await B.goto(url);await ready(B);
 const open=async(p,name)=>{await p.click('.deck >> text='+name);await p.click('[data-act="tab"][data-v="study"]');};
 const SA=f=>A.evaluate(f),SB=f=>B.evaluate(f);
 // 1. A answers two cards; B, which is just sitting there, picks them up
 await open(A,'Alpha');await open(B,'Alpha');await A.click('[data-act="start"]');
 for(let i=0;i<2;i++){await A.keyboard.press('Space');await A.keyboard.press('5');}
 await B.waitForFunction(()=>{const s=window.__stufen.S,n=s.notes.d0;return n.get('n0').s.t1&&n.get('n1').s.t1;},null,{timeout:8000}).then(()=>ok(true,'B receives A’s two answers without a reload'),()=>ok(false,'B receives A’s two answers without a reload'));
 ok(await SB(()=>[...window.__stufen.S.logs.d0.values()].reduce((a,x)=>a+x.e.length,0))===2,'B has both log lines');
 ok((await B.textContent('#status'))==='Updated from another device','B says where the change came from');
 ok(await B.locator('.stat b').nth(3).textContent()==='2','B’s overview of the deck shows 2 reviewed today');
 // 2. B answers a third card: the day's log must keep all three lines (whole-document writes would lose A's two on old data)
 await B.click('[data-act="start"]');ok(await SB(()=>window.__stufen.S.study.cur.nid)==='n2','B continues with the third card, not the first');
 await B.keyboard.press('Space');await B.keyboard.press('5');
 await A.waitForFunction(()=>!!window.__stufen.S.notes.d0.get('n2').s.t1,null,{timeout:8000});
 const lines=await SA(()=>{const k=[...window.__store.keys()].find(k=>k.startsWith('decks/d0/log/'));return window.__store.get(k).e.length;});ok(lines===3,'the stored log for today holds all 3 answers ('+lines+')');
 ok(await SA(()=>[...window.__stufen.S.logs.d0.values()].reduce((a,x)=>a+x.e.length,0))===3,'A has all 3 as well');
 // 3. both on the same open card: A answers it, B's copy moves on
 const ca=await SA(()=>window.__stufen.S.study.cur.nid),cb=await SB(()=>window.__stufen.S.study.cur.nid);ok(ca==='n3'&&cb==='n3','both pages show the fourth card');
 await B.keyboard.press('Space');   // B has the answer open
 await A.keyboard.press('Space');await A.keyboard.press('5');
 await B.waitForFunction(()=>window.__stufen.S.study.cur&&window.__stufen.S.study.cur.nid!=='n3',null,{timeout:8000}).then(()=>ok(true,'B drops the card A just answered and shows the next'),()=>ok(false,'B drops the card A just answered and shows the next'));
 ok(await SB(()=>window.__stufen.S.notes.d0.get('n3').s.t1.reps)===1,'the card was counted once');
 await A.click('[data-act="stop"]');await B.click('[data-act="stop"]');
 // 4. deck settings, groups, new and deleted decks travel too
 await A.click('[data-act="tab"][data-v="schedule"]');await A.fill('#d-new','7');await A.locator('#d-new').blur();
 await B.waitForFunction(()=>window.__stufen.S.decks.d0.newPerDay===7,null,{timeout:8000}).then(()=>ok(true,'a deck setting changed on A arrives on B'),()=>ok(false,'a deck setting changed on A arrives on B'));
 await A.click('#open-home');await A.check('#hs-d0');await A.check('#hs-d1');await A.fill('#grp-name','Pair');await A.click('[data-act="grpNew"]');
 await B.waitForFunction(()=>window.__stufen.S.meta.groups.length===1,null,{timeout:8000}).then(()=>ok(true,'a group made on A arrives on B'),()=>ok(false,'a group made on A arrives on B'));
 await B.click('#open-home');ok(await B.locator('.gh').count()===2,'B’s deck list shows the group');
 await A.click('#new-deck');await A.fill('#deck-name','Made on A');
 await B.waitForFunction(()=>Object.values(window.__stufen.S.decks).some(d=>d.name==='Made on A'),null,{timeout:8000}).then(()=>ok(true,'a new deck appears on B'),()=>ok(false,'a new deck appears on B'));
 await A.click('[data-act="ask"][data-v^="delDeck"]');await A.click('[data-act="delDeck"]');
 await B.waitForFunction(()=>Object.keys(window.__stufen.S.decks).length===3,null,{timeout:12000}).then(()=>ok(true,'a deleted deck disappears on B'),()=>ok(false,'a deleted deck disappears on B'));
 // 5. B is typing while a change arrives: the field is not torn away, the data is still current
 await open(B,'Bravo');await B.click('[data-act="tab"][data-v="cards"]');await B.click('#c-n0-fb');await B.keyboard.type('xyz');
 await open(A,'Charlie');await A.click('[data-act="tab"][data-v="cards"]');await A.fill('#c-n5-fb','changed on A');
 await B.waitForFunction(()=>window.__stufen.S.notes.d2.get('n5').f.fb==='changed on A',null,{timeout:8000});
 ok(await B.evaluate(()=>document.activeElement.id==='c-n0-fb')&&(await B.inputValue('#c-n0-fb')).endsWith('xyz'),'B keeps typing undisturbed');
 await B.waitForFunction(()=>document.querySelector('#status').textContent==='Saved'||document.querySelector('#status').textContent==='Updated from another device');
 await A.waitForFunction(()=>(window.__stufen.S.notes.d1.get('n0').f.fb||'').endsWith('xyz'),null,{timeout:8000}).then(()=>ok(true,'B’s edit reaches A; neither edit is lost'),()=>ok(false,'B’s edit reaches A; neither edit is lost'));
 ok(await SA(()=>window.__stufen.S.notes.d2.get('n5').f.fb)==='changed on A','A’s own edit is still there');
 // 6. a page that missed everything (no live notice) catches up when it comes back to the foreground
 const C=await ctx.newPage();await C.goto(url);await ready(C);
 await C.evaluate(()=>{window.__stufen.seen.decks.d1='old';const n=window.__stufen.S.notes.d1.get('n7');n.f.fb='stale copy';});
 const during=await C.evaluate(async()=>{const p=window.__stufen.forceCheck(),v=window.__stufen.S.syncing;await p;return v;});ok(during===true,'while it checks, answers are held');
ok(await C.evaluate(()=>window.__stufen.S.notes.d1.get('n7').f.fb)==='A7'&&await C.evaluate(()=>window.__stufen.S.syncing)===false,'coming back to the page re-reads the changed deck');
 // 7. nothing changed elsewhere -> no reload work
 const w0=await C.evaluate(()=>window.__stufen.S.syncNote||0);await C.evaluate(()=>window.__stufen.forceCheck());ok(await C.evaluate(()=>window.__stufen.S.syncNote||0)===w0,'a check with nothing new changes nothing');
 // 8. the stamp document merges per deck instead of being replaced
 const pulse=await SA(()=>window.__store.get('meta/pulse'));const tabs=new Set(Object.values(pulse.decks).map(v=>v.split('.')[1]));ok(Object.keys(pulse.decks).length>=3&&tabs.size>=2&&typeof pulse.meta==='string','stamps of both devices sit side by side: '+Object.keys(pulse.decks).join(','));
 ok(errs.length===0,'no page errors '+errs.join(' | '));
 await b.close();
})();
