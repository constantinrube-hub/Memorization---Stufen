/* overview, groups, sessions over several decks, new cards per weekday */
const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1300,height:900}});
 await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 const url='http://localhost:'+(process.env.PORT||8765)+'/',ready=()=>p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 await p.goto(url);await ready();
 await p.evaluate(()=>{const st=window.__store;const mk=(id,name,n)=>{const d={id,name,created:Date.now()+st.size,newPerDay:4,rollover:4,css:'',fields:[{id:'fa',name:'Front',kind:'text'},{id:'fb',name:'Back',kind:'text'}],types:[{id:'t1',name:'F→B',front:'{{Front}}',back:'{{Back}}',typed:''}],clusters:[{id:'c1',name:'Default',stages:[0,10,1440,4320],kinds:['q','h','d','d'],moves:{none:'reset',close:-1,hard:0,easy:1,brainer:2},end:'repeat',grow:2}]};st.set('decks/'+id,d);for(let i=0;i<n;i++){const nid='n'+String(i).padStart(3,'0');st.set('decks/'+id+'/notes/'+nid,{id:nid,c:'c1',f:{fa:'Q'+(i+1)+' '+name,fb:'A'+(n-i)},s:{},o:i+1,t:1});}};
   ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel'].forEach((n,i)=>mk('d'+i,n,10));localStorage.setItem('__db',JSON.stringify([...st]));});
 await p.reload();await ready();
 const S=f=>p.evaluate(f);
 ok(await p.textContent('.pagetitle')==='Overview','lands on the overview');
 ok(await p.locator('table.home tbody tr').count()===8,'8 decks in the table');
 ok((await p.textContent('.stat.hot b'))==='0'&&(await p.locator('.stat b').nth(1).textContent())==='32','tiles: 0 due, 32 new (8 decks × 4)');
 // group from ticks
 for(const id of ['d1','d3','d5'])await p.check('#hs-'+id);
 ok((await p.textContent('#sel-bar')).includes('3 decks ticked'),'selection bar');
 await p.fill('#grp-name','Trio');await p.click('[data-act="grpNew"]');
 await p.waitForFunction(()=>{const m=window.__store.get('meta/settings');return m&&m.groups&&m.groups.length===1&&m.groups[0].decks.length===3;});ok(true,'group saved in the store');
 ok(await p.locator('.gh').count()===2&&(await p.locator('.gh').first().textContent()).includes('Trio'),'sidebar shows Trio and Other decks');
 ok(await p.locator('.gchip').count()===3,'group chips in the table');
 // session over the group
 await p.click('[data-act="studyGroup"]');ok(await p.textContent('.pagetitle')==='Trio','session header names the group');
 ok(await p.locator('.tabs').count()===0,'no deck tabs during a group session');
 const seq=[];for(let i=0;i<6;i++){seq.push(await S(()=>window.__stufen.S.cur));await p.keyboard.press('Space');await p.keyboard.press('5');}
 ok(new Set(seq).size===3&&seq.every(x=>['d1','d3','d5'].includes(x))&&seq[0]!==seq[1],'new cards come from the three decks in turn: '+seq.join(' '));
 ok((await p.textContent('#card-deck')).length>0,'the card names its deck');
 // undo across decks
 const before=await S(()=>{const s=window.__stufen.S;return [s.cur,s.study.cur.nid];});await p.keyboard.press('Space');await p.keyboard.press('5');
 const after=await S(()=>window.__stufen.S.cur);await p.click('[data-act="undo"]');
 const back=await S(()=>{const s=window.__stufen.S;return [s.cur,s.study.cur.nid,!!s.notes[s.cur].get(s.study.cur.nid).s.t1];});
 ok(after!==before[0]&&back[0]===before[0]&&back[1]===before[1]&&back[2]===false,'undo returns to the card in the other deck');
 // end of queue across decks: "No idea" card waits behind the new cards of every deck in the session
 await p.keyboard.press('Space');await p.keyboard.press('1');const qd=before;
 let seen=0,ret=null;for(let i=0;i<12&&!ret;i++){const c=await S(()=>{const s=window.__stufen.S;return s.study.cur?[s.cur,s.study.cur.nid]:null;});if(!c)break;if(c[0]===qd[0]&&c[1]===qd[1]){ret=i;break;}seen++;await p.keyboard.press('Space');await p.keyboard.press('5');}
 ok(ret!==null&&seen===5,'the “No idea” card returns after the 5 new cards still in line ('+seen+')');
 await p.keyboard.press('Space');await p.keyboard.press('5');
 ok(await p.locator('h2:has-text("Next card")').count()===1||await p.locator('h2:has-text("Done for now")').count()===1,'session ends when the three decks are done for now');
 await p.click('[data-act="stop"]');ok(await p.textContent('.pagetitle')==='Overview','leaving the session returns to the overview');
 ok((await p.locator('.stat b').nth(2).textContent())==='13','answers today counted across decks ('+await p.locator('.stat b').nth(2).textContent()+')');
 // most overdue first across decks
 const pickd=await S(()=>{const A=window.__stufen,s=A.S,now=Date.now();s.notes.d0.get('n000').s.t1={st:2,iv:1440,due:now-3600000,reps:1,lapses:0,first:1,last:1,done:false};s.notes.d7.get('n000').s.t1={st:2,iv:1440,due:now-7200000,reps:1,lapses:0,first:1,last:1,done:false};const r=A.nextAcross(Object.keys(s.decks),'',now,false,0,null);return [r.card.d.id,r.card.n.id];});
 ok(pickd[0]==='d7','the most overdue card wins whichever deck holds it');
 // everything
 await p.click('#open-home');await p.click('#study-all');ok(await p.textContent('.pagetitle')==='All decks'&&await S(()=>window.__stufen.S.cur)==='d7','“Study everything” starts with the most overdue card');
 await p.click('[data-act="stop"]');
 // single deck from the table returns to the overview
 await p.locator('table.home [data-act="studyOne"][data-v="d2"]').click();ok(await p.inputValue('#deck-name')==='Charlie','Study in a row opens that deck’s session');await p.click('[data-act="stop"]');ok(await p.textContent('.pagetitle')==='Overview','…and returns to the overview');
 // group editing
 await p.click('[data-act="grpTick"]');ok(await p.locator('table.home [data-hs]:checked').count()===3,'“Tick its decks” ticks 3');
 await p.check('#hs-d0');await p.click('[data-act="grpSet"]');ok(await S(()=>window.__stufen.S.meta.groups[0].decks.length)===4,'group set to the 4 ticked decks');
 await p.fill('.gname','Quartet');ok((await p.locator('.gh').first().textContent()).includes('Quartet'),'rename shows in the sidebar');
 await p.locator('.gh').first().click();ok(await p.locator('.dlist .deck').count()===4,'collapsing a group hides its decks');
 await p.waitForFunction(()=>document.querySelector('#status').textContent==='Saved');await p.reload();await ready();ok(await p.locator('.dlist .deck').count()===4&&(await p.locator('.gh').first().textContent()).includes('Quartet'),'collapse and group survive a reload');
 await p.locator('.gh').first().click();
 // weekday limits
 await p.click('.deck >> text=Golf');await p.click('[data-act="tab"][data-v="schedule"]');await p.check('#d-byday');
 ok(await p.locator('[data-nbd]').count()===7&&await p.locator('#d-new').isDisabled(),'seven weekday boxes');
 const dow=await S(()=>{const d=new Date();if(d.getHours()<4)d.setDate(d.getDate()-1);return (d.getDay()+6)%7;});
 await p.fill('#d-nbd-'+dow,'2');await p.locator('#d-nbd-'+dow).blur();
 ok(await S(()=>window.__stufen.counts(window.__stufen.S.decks.d6).newAvail)===2,'today’s limit of 2 applies');
 const other=await S(()=>{const A=window.__stufen,d=A.S.decks.d6,t=Date.now();return [0,1,2,3,4,5,6].map(i=>A.newLimit(d,t+i*86400000));});ok(other.filter(v=>v===2).length===1&&other.filter(v=>v===4).length===6,'other weekdays keep 4: '+other);
 await p.uncheck('#d-byday');ok(await S(()=>!window.__stufen.S.decks.d6.newByDay&&window.__stufen.counts(window.__stufen.S.decks.d6).newAvail===4),'switching it off restores the single number');
 // delete group
 await p.click('#open-home');await p.screenshot({path:'/tmp/stufen-home.png',fullPage:true});
 await p.click('[data-act="ask"][data-v^="grpDel"]');await p.click('[data-act="grpDel"]');ok(await p.locator('.gh').count()===0,'deleting the group removes the sections');
 ok(errs.length===0,'no page errors '+errs.join(' | '));
 // phone
 const c2=await b.newContext({viewport:{width:390,height:844},hasTouch:true});await c2.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));const q=await c2.newPage();
 await q.goto(url);await q.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 await q.evaluate(()=>{const st=window.__store;for(let k=0;k<3;k++){const id='p'+k;st.set('decks/'+id,{id,name:'Phone deck '+k,created:k+1,newPerDay:5,rollover:4,css:'',fields:[{id:'fa',name:'Front',kind:'text'},{id:'fb',name:'Back',kind:'text'}],types:[{id:'t1',name:'t',front:'{{Front}}',back:'{{Back}}',typed:''}],clusters:[{id:'c1',name:'Default',stages:[10,1440],kinds:['h','d'],moves:{none:'reset',close:-1,hard:0,easy:1,brainer:2},end:'repeat',grow:2}]});for(let i=0;i<6;i++)st.set('decks/'+id+'/notes/n'+i,{id:'n'+i,c:'c1',f:{fa:'Q'+i,fb:'A'+i},s:{},o:i,t:1});}localStorage.setItem('__db',JSON.stringify([...st]));});
 await q.reload();await q.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 ok(await q.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'phone: overview has no sideways scroll');
 await q.screenshot({path:'/tmp/stufen-home-phone.png',fullPage:true});
 await q.tap('#study-all');ok(await q.locator('#card-deck').isVisible(),'phone: session over all decks runs');
 await b.close();
})();
