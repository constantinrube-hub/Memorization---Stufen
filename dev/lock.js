/* cluster lock: held-back clusters open once enough of the other cards reach a stage */
const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1300,height:900}});
 await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 const url='http://localhost:'+(process.env.PORT||8765)+'/',ready=()=>p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 await p.goto(url);await ready();
 // 20 Basics rows (18 of them at stage 4 = index 3, waiting) and 10 new Advanced rows
 await p.evaluate(()=>{const st=window.__store,now=Date.now(),D=86400000;
  const lad=n=>({id:n,name:n==='c1'?'Basics':'Advanced',stages:[10,1440,4320,10080,23040,50400],kinds:['h','d','d','d','d','d'],moves:{none:'reset',close:-1,hard:0,easy:1,brainer:2},end:'repeat',grow:2});
  st.set('decks/u',{id:'u',name:'USA',created:1,newPerDay:20,rollover:4,css:'',fields:[{id:'fa',name:'Front',kind:'text'},{id:'fb',name:'Back',kind:'text'}],types:[{id:'t1',name:'F→B',front:'{{Front}}',back:'{{Back}}',typed:''}],clusters:[lad('c1'),lad('c2')]});
  for(let i=0;i<20;i++){const s=i<18?{t1:{st:3,iv:10080,due:now+5*D,reps:4,lapses:0,first:1,last:1,done:false}}:{};st.set('decks/u/notes/b'+i,{id:'b'+i,c:'c1',f:{fa:'Basic '+i,fb:'x'},s,o:i+1,t:1});}
  for(let i=0;i<10;i++)st.set('decks/u/notes/a'+i,{id:'a'+i,c:'c2',f:{fa:'Adv '+i,fb:'y'},s:{},o:100+i,t:1});
  localStorage.setItem('__db',JSON.stringify([...st]));});
 await p.reload();await ready();const S=f=>p.evaluate(f);
 const cnt=()=>S(()=>{const A=window.__stufen,c=A.counts(A.S.decks.u);return {nw:c.nw,lck:c.lck};});
 let c=await cnt();ok(c.nw===12&&c.lck===0,'without a lock all 12 new cards are available '+JSON.stringify(c));
 // switch it on in the Schedule tab
 await p.click('.deck >> text=USA');await p.click('[data-act="tab"][data-v="schedule"]');
 await p.check('#d-lock');
 ok(await p.inputValue('#d-lock-pct')==='95'&&await p.inputValue('#d-lock-stage')==='4','defaults: 95 % at stage 4');
 await p.check('#d-lockcl-c2');
 ok(await p.locator('#d-lockcl-c1').isDisabled(),'the last open cluster cannot be held back too');
 c=await cnt();ok(c.nw===2&&c.lck===10,'Advanced locked: only the 2 new Basics are available '+JSON.stringify(c));
 const t1=await p.textContent('#lock-panel');ok(t1.includes('18 of 20')&&t1.includes('1 card to go')&&t1.includes('10 cards in Advanced wait'),'status line: '+t1.split('Once open they stay open.')[1]);
 // the queue never offers an Advanced card while locked
 const offered=await S(()=>{const A=window.__stufen,d=A.S.decks.u,seen=new Set();for(let i=0;i<5;i++){const r=A.nextCard(d,'',Date.now(),false,50,null);if(r.card)seen.add(r.card.n.c);}return [...seen];});
 ok(offered.length===1&&offered[0]==='c1','queue offers Basics only: '+offered);
 const fc=await S(()=>{const R=window.__stufen.simulate(30);return R.per.u.nw.reduce((a,v)=>a+v,0);});ok(Math.abs(fc-2)<0.01,'forecast counts only the 2 open new cards: '+fc);
 // study overview shows the lock
 await p.click('[data-act="tab"][data-v="study"]');
 ok((await p.textContent('.stats')).includes('locked'),'study overview has a “locked” tile');
 ok((await p.textContent('#main, body')).includes('locked until 95 % of the other cards stand at stage 4'),'study overview explains the lock');
 // a suspended Basic leaves the count: 18 of 19 is 94.7 %, still short
 await S(()=>{const A=window.__stufen,d=A.S.decks.u,n=A.S.notes.u.get('b19');A.setMark(n,'t1','s',1);A.replan();});
 c=await S(()=>{const A=window.__stufen,c=A.counts(A.S.decks.u);return [c.lock.base,c.lock.ok,c.lock.open];});ok(c[0]===19&&c[1]===18&&c[2]===false,'suspended card left out of the count: '+c);
 // one more card reaches stage 4 → opens and remembers when
 await S(()=>{const A=window.__stufen,n=A.S.notes.u.get('b18');n.s.t1={st:3,iv:10080,due:Date.now()+5*86400000,reps:4,lapses:0,first:1,last:1,done:false};A.replan();});
 c=await cnt();ok(c.lck===0&&c.nw===10,'95 % reached: Advanced opens '+JSON.stringify(c));
 const at=await S(()=>window.__stufen.S.decks.u.lock.at);ok(at>0,'the opening time is stored');
 // a lapse later does not lock it again
 await S(()=>{const A=window.__stufen,n=A.S.notes.u.get('b0');n.s.t1.st=0;A.replan();});
 c=await cnt();ok(c.lck===0,'stays open after a lapse');
 // Lock again starts the count over
 await p.click('[data-act="tab"][data-v="schedule"]');ok(await p.locator('[data-act="lockAgain"]').count()===1,'“Lock again” is offered once open');
 await p.click('[data-act="lockAgain"]');c=await cnt();ok(c.lck===10,'locked again (18 of 19 after the lapse) '+JSON.stringify(c));
 // lower the bar to 90 %: opens
 await p.fill('#d-lock-pct','90');await p.locator('#d-lock-pct').blur();c=await cnt();ok(c.lck===0,'90 % opens it '+JSON.stringify(c));
 // higher stage: closes again (only the card states at index ≥4 count)
 await p.fill('#d-lock-stage','5');await p.locator('#d-lock-stage').blur();c=await cnt();ok(c.lck===10,'stage 5 needed: locked again '+JSON.stringify(c));
 // settings survive a reload (once the write has reached the store); switching off releases everything
 await p.waitForFunction(()=>{const m=new Map(JSON.parse(localStorage.getItem('__db')||'[]')),d=m.get('decks/u');return d&&d.lock&&d.lock.stage===5;});
 await p.reload();await ready();
 const L=await S(()=>window.__stufen.S.decks.u.lock);ok(L.on&&L.cls.join()==='c2'&&L.pct===90&&L.stage===5,'stored on the deck: '+JSON.stringify(L));
 await p.click('.deck >> text=USA');await p.click('[data-act="tab"][data-v="schedule"]');await p.uncheck('#d-lock');
 c=await cnt();ok(c.lck===0&&c.nw===12,'switched off: nothing locked (the test’s unsaved card edits are gone after the reload) '+JSON.stringify(c));
 // a deck with one cluster explains instead
 await S(()=>{const A=window.__stufen,d=A.S.decks.u;d.clusters=d.clusters.slice(0,1);A.replan();});await p.click('[data-act="tab"][data-v="study"]');await p.click('[data-act="tab"][data-v="schedule"]');
 ok((await p.textContent('body')).includes('With two or more clusters you can hold some back'),'one-cluster deck shows the hint');
 ok(errs.length===0,'no page errors '+errs.join(' | '));
 await b.close();
})();
