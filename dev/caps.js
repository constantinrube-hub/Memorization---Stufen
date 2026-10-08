/* daily cap, new-card limit, deck priority, workload forecast, hints */
const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1300,height:900}});
 await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 const url='http://localhost:'+(process.env.PORT||8765)+'/',ready=()=>p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 await p.goto(url);await ready();
 await p.evaluate(()=>{const st=window.__store,now=Date.now(),H=3600000;
  const mk=(id,name,prio,iv,late)=>{st.set('decks/'+id,{id,name,prio,created:st.size+1,newPerDay:4,rollover:4,css:'',fields:[{id:'fa',name:'Front',kind:'text'},{id:'fb',name:'Back',kind:'text'},{id:'fc',name:'Empty',kind:'text'},{id:'fm',name:'Mn',kind:'text'}],types:[{id:'t1',name:'F→B',front:'{{Front}}',back:'{{Back}}',typed:'',hints:'Back starts: {{initials:Back}}\nNothing: {{Empty}}\n{{letters:Mn}}',hintCap:true}],clusters:[{id:'c1',name:'Default',stages:[0,1440,4320],kinds:['q','d','d'],moves:{none:'reset',close:-1,hard:0,easy:1,brainer:2},end:'repeat',grow:2}]});
   for(let i=0;i<10;i++){const nid='n'+i;st.set('decks/'+id+'/notes/'+nid,{id:nid,c:'c1',f:{fa:'435 '+name+i,fb:'Rum Mill '+i,fm:'RML → Rommel'},s:i<4?{t1:{st:1,iv,due:now-late-i*1000,reps:1,lapses:0,first:1,last:1,done:false}}:{},o:i+1,t:1});}};
  mk('a','Alpha',5,1440,24*H);mk('b','Bravo',3,1440,48*H);mk('c','Charlie',1,10,2*H);localStorage.setItem('__db',JSON.stringify([...st]));});
 await p.reload();await ready();const S=f=>p.evaluate(f);
 // no limits: as before
 ok((await p.textContent('#lim-text')).startsWith('No limit'),'no limit by default');
 ok((await p.textContent('.stat.hot b'))==='12'&&(await p.locator('.stat b').nth(1).textContent())==='12','12 due, 12 new without limits');
 // new-card limit shared by priority
 await p.fill('#cap-new','6');await p.locator('#cap-new').blur();
 const na=await S(()=>{const A=window.__stufen,s=A.S;return ['a','b','c'].map(id=>A.counts(s.decks[id]).newAvail);});ok(na.join()==='4,2,0','6 new cards shared 5:3:1 → '+na);
 ok((await p.textContent('#lim-text')).includes('0 of 6'),'limit line: '+await p.textContent('#lim-text'));
 await p.selectOption('#pr-c','5');const nb=await S(()=>{const A=window.__stufen,s=A.S;return ['a','b','c'].map(id=>A.counts(s.decks[id]).newAvail);});ok(nb[2]>0&&nb[0]+nb[1]+nb[2]===6,'raising Charlie’s priority gives it a share: '+nb);
 await p.selectOption('#pr-c','1');await p.fill('#cap-new','0');await p.locator('#cap-new').blur();
 // joint cap
 await p.fill('#cap-all','6');await p.locator('#cap-all').blur();
 const lt=await p.textContent('#lim-text');ok(lt.includes('0 of 6')&&lt.includes('6 of 12 due cards fit')&&lt.includes('0 new cards'),'cap line: '+lt);
 ok((await p.locator('.stat b').nth(1).textContent())==='0','no new cards while due cards fill the cap');
 const plan=await S(()=>{const P=window.__stufen.dayPlan(Date.now());const top=[];for(const id in P.per)for(const x of P.per[id].fresh)top.push([id,x.sc]);top.sort((x,y)=>y[1]-x[1]);return top.slice(0,6).map(x=>x[0]).join('');});
 ok(plan==='ccccbb','most urgent six: Charlie’s short-stage cards, then Bravo’s longer-overdue ones ('+plan+')');
 await p.click('#study-all');
 const seq=[];const cur=()=>S(()=>{const s=window.__stufen.S;return s.study.cur?s.cur+s.study.cur.nid:null;});
 seq.push(await cur());await p.keyboard.press('Space');await p.keyboard.press('1');   // No idea -> end of queue
 for(let i=0;i<5;i++){seq.push(await cur());await p.keyboard.press('Space');await p.keyboard.press('5');}
 ok(seq.filter(x=>x[0]==='b').length===2&&seq.filter(x=>x[0]==='c').length===4&&new Set(seq).size===6,'the session shows exactly those six: '+seq.join(' '));
 ok(await cur()===seq[0],'the card started today returns although the cap is reached');
 await p.keyboard.press('Space');await p.keyboard.press('5');
 ok(await p.locator('h2:has-text("Daily cap reached")').count()===1&&(await p.textContent('.cardbox')).includes('6 due cards'),'cap message with 6 cards held back');
 await p.click('[data-act="capMore"]');ok((await cur())!==null,'“Study 20 more today” continues');
 await p.click('[data-act="stop"]');
 ok((await p.textContent('#lim-text')).includes('6 of 6'),'overview counts 6 different cards studied');
 // forecast
 ok(await p.locator('#fc-all .colw').count()===30,'forecast has 30 days');
 const sim=await S(()=>{const R=window.__stufen.simulate(30),sum=(k,t)=>Object.values(R.per).reduce((a,o)=>a+o[k][t],0);return {rev0:sum('rev',0),held0:sum('held',0),max:Math.max(...Array.from({length:30},(_,t)=>sum('rev',t)+sum('nw',t)))};});
 ok(sim.rev0===0&&sim.held0===6&&sim.max<=6.01,'forecast respects the cap: today 0 more, 6 held back, never above 6 a day '+JSON.stringify(sim));
 ok((await p.textContent('#fc-all')).includes('held back'),'legend shows the held-back series');
 await p.fill('#cap-all','0');await p.locator('#cap-all').blur();
 const sim2=await S(()=>{const R=window.__stufen.simulate(30),sum=(k,t)=>Object.values(R.per).reduce((a,o)=>a+o[k][t],0);return [sum('rev',0),sum('nw',0),sum('held',0)];});
 ok(sim2[0]===6&&sim2[1]===12&&sim2[2]===0,'without a cap today shows the 6 remaining reviews and 12 new cards '+sim2);
 await p.screenshot({path:'/tmp/stufen-limits.png',fullPage:true});
 // hints
 await p.click('.deck >> text=Alpha');await p.click('[data-act="tab"][data-v="study"]');await p.click('[data-act="start"]');
 ok((await p.textContent('#hint-btn')).startsWith('Hint 0/2'),'two usable hints (the empty one is skipped)');
 await p.keyboard.press('h');ok((await p.textContent('#hints')).includes('R… M…'),'first hint: initials');
 await p.keyboard.press('h');ok((await p.locator('.hint').nth(1).textContent())==='R-M-L','second hint: “RML → Rommel” shows R-M-L');
 ok(await p.locator('#hint-btn').isDisabled(),'no hints left');
 await p.keyboard.press('Space');ok(await p.locator('.g').count()===3&&await p.locator('.g-easy').count()===0,'after a hint Easy and No brainer are gone');
 await p.keyboard.press('4');ok(await p.locator('.grades').count()===1,'key 4 is refused');await p.keyboard.press('3');
 const line=await S(()=>{const s=window.__stufen.S;const docs=[...s.logs.a.values()];return docs[docs.length-1].e.slice(-1)[0].split('|');});ok(line.length===9&&line[8]==='2','the log records 2 hints');
 await p.keyboard.press('Space');ok(await p.locator('.g').count()===5,'without a hint all five answers are offered');
 await p.click('[data-act="stop"]');
 await p.click('[data-act="tab"][data-v="types"]');ok(await p.locator('[data-tf="hints"]').count()===1&&await p.locator('[data-hintcap]').isChecked(),'hint editor in Card types');
 await p.click('[data-act="tab"][data-v="schedule"]');ok(await p.locator('#fc-deck .colw').count()===30&&await p.inputValue('#d-prio')==='5','deck forecast and priority in the Schedule tab');
 await p.locator('[data-act="stg"][data-v="1:d:1"]').first().click();await p.waitForTimeout(600);ok(await p.locator('#fc-deck .colw').count()===30,'forecast redraws after a ladder change');
 const L=await S(()=>{const f=window.__stufen.lettersOf;return [f('RML → Rommel'),f('N-S-F → Unsafe'),f('GGS'),f('SCHRM -> Schirm'),f('')];});ok(L.join('|')==='R-M-L|N-S-F|G-G-S|SCH-R-M|','letters come from the mnemonic itself: '+L.join(' | '));
 ok(await S(()=>window.__stufen.majorOf('731'))==='K/G-M-T/D','major spells out the choices per digit');
 await p.click('#open-settings');await p.fill('#mj-4','Q');await p.locator('#mj-4').blur();ok(await S(()=>window.__stufen.majorOf('435'))==='Q-M-L','major letters are editable');
 // speed with a large store
 const ms=await S(()=>{const A=window.__stufen,s=A.S,now=Date.now();for(let k=0;k<10;k++){const id='big'+k,d=JSON.parse(JSON.stringify(s.decks.a));d.id=id;d.name='Big '+k;d.newPerDay=20;s.decks[id]=d;const m=new Map();for(let i=0;i<600;i++)m.set('n'+i,{id:'n'+i,c:'c1',f:{fa:'F'+i,fb:'B'+i},s:i<400?{t1:{st:1+i%2,iv:1440,due:now+(i%20-5)*86400000,reps:1,lapses:0,first:1,last:1,done:false}}:{},o:i,t:1});s.notes[id]=m;s.logs[id]=new Map();}A.replan();const t=performance.now();A.simulate(30);const a=performance.now()-t;const t2=performance.now();A.dayPlan(Date.now());return [Math.round(a),Math.round(performance.now()-t2)];});
 ok(ms[0]<2500&&ms[1]<300,'6,000 cards: forecast in '+ms[0]+' ms, day plan in '+ms[1]+' ms');
 ok(errs.length===0,'no page errors '+errs.join(' | '));
 await b.close();
})();
