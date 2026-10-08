/* scheduler core: runs the page's own functions against a small deck in memory */
const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext();await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));
 const p=await ctx.newPage();await p.goto('http://localhost:'+(process.env.PORT||8765)+'/');await p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 const r=await p.evaluate(()=>{
  const A=window.__stufen,S=A.S,out=[],ok=(c,m)=>out.push([!!c,m]),DAY=86400000;
  const cl={id:'c1',name:'D',stages:[0,10,1440,4320],kinds:['q','h','d','d'],moves:{none:'reset',close:-1,hard:0,easy:1,brainer:2},end:'repeat',grow:2};
  const now=new Date(2026,9,7,15,0,0).getTime();
  // moves
  let s=A.schedule(null,'easy',cl,now,4);ok(s.st===0&&s.q===true&&s.due===now,'new + Easy -> stage 1 (end of queue), due now');
  s=A.schedule(null,'brainer',cl,now,4);ok(s.st===1&&s.due===now+600000,'new + No brainer -> stage 2, exact 10 min');
  s=A.schedule({st:1,iv:10,reps:1,lapses:0,first:1},'easy',cl,now,4);ok(s.st===2&&new Date(s.due).getHours()===4&&s.due>now&&s.due-now<DAY,'day stage comes due at 04:00 next morning');
  s=A.schedule({st:2,iv:1440,reps:2,lapses:0,first:1},'hard',cl,now,4);ok(s.st===2,'Right but hard repeats the stage');
  s=A.schedule({st:2,iv:1440,reps:2,lapses:0,first:1},'close',cl,now,4);ok(s.st===1&&s.lapses===1,'Wrong but close: one stage back, counts a lapse');
  s=A.schedule({st:3,iv:4320,reps:5,lapses:0,first:1},'none',cl,now,4);ok(s.st===0&&s.lapses===1,'No idea: back to stage 1');
  s=A.schedule({st:3,iv:4320,reps:5,lapses:0,first:1},'brainer',cl,now,4);ok(s.st===3&&s.iv===4320&&!s.done,'past the last stage: repeat the last wait');
  s=A.schedule({st:3,iv:4320,reps:5,lapses:0,first:1},'easy',{...cl,end:'grow',grow:2},now,4);ok(s.iv===8640,'grow doubles the last wait');
  s=A.schedule({st:3,iv:4320,reps:5,lapses:0,first:1},'easy',{...cl,end:'retire'},now,4);ok(s.done&&s.due===null,'retire');
  s=A.schedule({st:9,iv:1,reps:1,lapses:0,first:1},'hard',cl,now,4);ok(s.st===3,'a stage beyond the ladder is clamped');
  // queue
  const d={id:'q',name:'Q',created:1,newPerDay:3,rollover:4,css:'',fields:[{id:'fa',name:'Front',kind:'text'},{id:'fb',name:'Back',kind:'text'}],types:[{id:'t1',name:'t',front:'{{Front}}',back:'{{Back}}',typed:''}],clusters:[cl]};
  S.decks.q=d;const m=new Map();for(let i=0;i<6;i++)m.set('n'+i,{id:'n'+i,c:'c1',f:{fa:'F'+i,fb:'B'+i},s:{},o:i+1,t:1});S.notes.q=m;S.logs.q=new Map();
  const nx=(t,early,extra,skip)=>A.nextCard(d,'',t,!!early,extra||0,skip||null),id=x=>x.card?x.card.n.id:null;
  ok(id(nx(now))==='n0','first new card is the first row');
  m.get('n0').s.t1=A.schedule(null,'none',cl,now,4);   // end of queue at `now`
  ok(id(nx(now+1000))==='n1','end-of-queue card waits behind the new cards that were in line');
  m.get('n1').s.t1=A.schedule(null,'brainer',cl,now+1000,4);m.get('n2').s.t1=A.schedule(null,'brainer',cl,now+2000,4);
  ok(A.counts(d,now+3000).newAvail===0,'daily new limit of 3 reached');
  ok(id(nx(now+3000))==='n0','with no new cards left the end-of-queue card returns');
  m.get('n0').s.t1=A.schedule(m.get('n0').s.t1,'brainer',cl,now+3000,4);   // -> stage 3 (day)
  const e=nx(now+4000);ok(e.card===null&&e.moreNew===true&&e.soon===now+601000,'nothing due: reports the next due time and that more new cards exist');
  ok(id(nx(now+4000,true))==='n1','“show it now” reaches 30 minutes ahead');
  ok(id(nx(now+4000,true,0,'n1/t1'))==='n2','…but not the card just answered');
  ok(id(nx(now+4000,false,10))==='n3','10 more new cards lifts the limit');
  ok(id(nx(now+700000))==='n1','due cards come in due order');
  m.get('n9')||m.set('n9',{id:'n9',c:'c1',f:{fa:'late',fb:'x'},s:{},o:9,t:now+5000});
  const c=A.counts(d,now+700000);ok(c.due===2&&c.nw===4&&c.wait===1&&c.total===7,'counts '+[c.due,c.nw,c.wait,c.total]);
  A.setMark(m.get('n1'),'t1','s',1);ok(id(nx(now+700000))==='n2'&&A.counts(d,now+700000).sus===1,'a suspended card is skipped and counted');
  A.setMark(m.get('n1'),'t1','s',0);ok(!m.get('n1').x,'mark removed cleanly');
  delete S.decks.q;delete S.notes.q;delete S.logs.q;return out;});
 r.forEach(([c,m])=>ok(c,m));await b.close();
})();
