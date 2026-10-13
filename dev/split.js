/* 13 Oct 2026 batch: deck actions above the list, the page coming back up after picking a deck low in the list,
   splitting a deck along its clusters (rows, progress and log go along), the overview map in the Cards tab,
   and the know-it map in Statistics coloured violet / green / red against the map's own average */
const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1300,height:700}});
 await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:'+(process.env.PORT||8765)+'/');await p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 await p.evaluate(()=>{const st=window.__store;
  const mk=(id,name)=>({id,name,stages:[10,1440],kinds:['h','d'],moves:{none:'reset',close:-1,hard:0,easy:1,brainer:2},end:'repeat',grow:2});
  const sq=(x,y,w)=>[x,y,x+w,y,x+w,y+w,x,y+w].reduce((a,v,i)=>a+(i%2?','+v.toFixed(3)+' ':(v).toFixed(3)),'').trim();
  st.set('decks/d0',{id:'d0',name:'Cities · Test',created:1,newPerDay:20,rollover:4,css:'',fields:[{id:'fa',name:'Name',kind:'text'},{id:'fb',name:'Region',kind:'text'},{id:'fr',name:'Map',kind:'region',map:'vec',ar:1,geo:{m:0,w:0,x0:0,y0:-Math.PI/180,s:180/Math.PI,pad:0,b:[0,0,1,1]}}],
   types:[{id:'t1',name:'Click',front:'{{Name}}',back:'{{Region}}',typed:'',click:'fr',free:true}],clusters:[mk('c1','Big'),mk('c2','Small'),mk('c3','Tiny')]});
  const rows=[['a','Alpha','c1',0.1,0.1],['b','Beta','c1',0.4,0.1],['c','Gamma','c2',0.1,0.5],['e','Delta','c2',0.5,0.5],['g','Eta','c3',0.75,0.75]];
  rows.forEach(([id,name,c,x,y],i)=>st.set('decks/d0/notes/'+id,{id,c,f:{fa:name,fb:'R'+i,fr:sq(x,y,0.1)},s:{t1:{st:1,iv:1440,due:Date.now()+86400000,reps:2,lapses:0,first:1,last:1}},o:i+1,t:1,...(id==='c'?{r:{fr:{close:['a','e']}}}:{})}));
  const now=Date.now(),L=(nid,g)=>[now-5000,nid,'t1',g,'r',3,1,''].join('|');
  // Alpha always easy/no brainer; Beta mostly hard; Gamma misses; Delta mixed; Eta unanswered
  st.set('decks/d0/log/'+new Date(now-4*3600e3).toISOString().slice(0,10),{id:new Date(now-4*3600e3).toISOString().slice(0,10),e:[L('a',3),L('a',4),L('b',2),L('b',3),L('c',0),L('c',1),L('e',2),L('e',4)]});
  // many decks so the side list is long
  for(let i=0;i<40;i++)st.set('decks/z'+i,{id:'z'+i,name:'Filler '+String(i).padStart(2,'0'),created:10+i,newPerDay:20,rollover:4,css:'',fields:[{id:'f1',name:'Front',kind:'text'}],types:[{id:'t1',name:'C',front:'{{Front}}',back:'',typed:''}],clusters:[mk('k'+i,'Default')]});
 });
 await p.reload();await p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');

 /* 1, 2: actions on top, page back up */
 const order=await p.evaluate(()=>{const s=document.querySelector('#side'),i=e=>[...s.querySelectorAll('*')].indexOf(e);return [i(s.querySelector('#new-deck')),i(s.querySelector('#imp-open')),i(s.querySelector('#open-settings')),i(s.querySelector('.dlist'))];});
 ok(order[0]>=0&&order[0]<order[3]&&order[1]<order[3]&&order[2]<order[3],'New deck, Import and Settings sit above the deck list '+order.join(','));
 const sticky=await p.evaluate(()=>getComputedStyle(document.querySelector('#side')).position);ok(sticky==='sticky','the deck list scrolls on its own on a wide screen');
 await p.evaluate(()=>{const S=window.__stufen.S;S.view='deck';S.cur='z0';});
 await p.setViewportSize({width:1300,height:500});
 await p.evaluate(()=>{document.querySelector('#main').style.minHeight='3000px';window.scrollTo(0,1500);});
 const y0=await p.evaluate(()=>scrollY);
 await p.evaluate(()=>{const b=[...document.querySelectorAll('#side .deck')].pop();b.click();});await p.waitForTimeout(900);
 const y1=await p.evaluate(()=>scrollY);ok(y0>1000&&y1<5,'picking a deck brings the page back to the top ('+y0+' → '+y1+')');
 await p.setViewportSize({width:1300,height:900});

 /* 5: heat map colours */
 await p.evaluate(()=>{const S=window.__stufen.S;S.cur='d0';S.view='deck';});await p.click('#side [data-act="open"][data-v="d0"]');
 await p.click('[data-act="tab"][data-v="stats"]');await p.waitForSelector('#statmap .rmap svg');
 const hm=await p.evaluate(()=>[...document.querySelectorAll('#statmap path.hm')].map(e=>e.getAttribute('class')+'|'+e.dataset.tip.split('\n')[0]));
 const cls=n=>(hm.find(x=>x.endsWith('|'+n))||'').split('|')[0];
 ok(hm.length===4,'four answered shapes are coloured, the unanswered one is not ('+hm.length+')');
 ok(cls('Alpha')==='hm top','always Easy/No brainer is violet: '+cls('Alpha'));
 ok(cls('Beta')==='hm ok'&&cls('Delta')==='hm ok','above the map average is green: '+cls('Beta')+', '+cls('Delta'));
 ok(cls('Gamma')==='hm','below the average is red: '+cls('Gamma'));
 ok(await p.locator('.hmkey').count()===1&&/How well you know the map/.test(await p.textContent('#view')),'new heading and key');

 /* 4: overview map */
 await p.click('[data-act="tab"][data-v="cards"]');await p.click('#ov-open');await p.waitForSelector('#ovmap .rmap svg');await p.waitForTimeout(300);
 const dots=await p.locator('#ovmap circle.ovd').count(),labs=await p.evaluate(()=>[...document.querySelectorAll('#ovmap text.ovl')].filter(t=>t.style.display!=='none').map(t=>t.textContent));
 ok(dots===5,'one dot per row ('+dots+')');ok(labs.length>=3&&labs.includes('Alpha'),'names next to the dots: '+labs.join(', '));
 const tip=await p.locator('#ovmap circle.ovd').first().getAttribute('data-tip');ok(/Alpha · R0/.test(tip),'a dot tells its row: '+tip);
 const vb0=await p.locator('#ovmap svg').getAttribute('viewBox');await p.click('#ovmap [data-act="zoom"][data-v="in"]');const vb1=await p.locator('#ovmap svg').getAttribute('viewBox');ok(vb0!==vb1,'the overview zooms');
 await p.click('#ovmap [data-act="labels"]');ok(await p.locator('#ovmap .rmap.nolab').count()===1,'Aa hides the names');await p.click('#ovmap [data-act="labels"]');
 await p.selectOption('#cards-cl','c2');await p.waitForTimeout(200);ok(await p.locator('#ovmap circle.ovd').count()===2,'the cluster filter narrows the overview');
 await p.selectOption('#cards-cl','');await p.click('[data-act="cardsView"][data-v="table"]');ok(await p.locator('#rows tr').count()>=5,'back to the table');
 ok(await p.locator('#ov-open').count()===1,'the Table / Overview map switch is offered on a deck with a map');

 /* 3: split */
 await p.click('#split-open');await p.waitForSelector('#modal2 .splitp');
 ok(await p.locator('#sp-c2').inputValue()==='go'&&await p.locator('#sp-c1').inputValue()==='stay','by default the first cluster stays and the others move');
 await p.fill('#spn-c3','Cities · Test · Small');   // Tiny joins Small's deck
 await p.fill('#spn-c2','Cities · Test · Small');
 ok(/New deck[\s\S]*Small[\s\S]*“Small”, “Tiny”, 3 rows/.test(await p.textContent('#sp-sum')),'two clusters with one name go into one deck: '+(await p.textContent('#sp-sum')).replace(/\s+/g,' '));
 await p.click('#sp-run');await p.waitForFunction(()=>/made/.test(document.querySelector('#modal2').textContent),null,{timeout:8000});
 const R=await p.evaluate(()=>{const S=window.__stufen.S,A=S.decks.d0,B=Object.values(S.decks).find(d=>d.name==='Cities · Test · Small');
   const bn=B&&S.notes[B.id],an=S.notes.d0;
   return {a:[...an.keys()].sort().join(''),acl:A.clusters.map(c=>c.name).join(','),b:bn?[...bn.keys()].sort().join(''):'',bcl:B?B.clusters.map(c=>c.name).join(','):'',
     prog:bn?bn.get('c').s.t1.st:-1,close:bn?JSON.stringify(bn.get('c').r):'',flds:B?B.fields.length+'/'+B.types.length:'',
     alog:[...S.logs.d0.values()].flatMap(x=>x.e).map(s=>s.split('|')[1]).sort().join(''),blog:B?[...(S.logs[B.id]||new Map()).values()].flatMap(x=>x.e).map(s=>s.split('|')[1]).sort().join(''):''};});
 ok(R.a==='ab'&&R.acl==='Big','the original keeps cluster Big with its rows: '+R.a+' / '+R.acl);
 ok(R.b==='ceg'&&R.bcl==='Small,Tiny','the new deck has Small and Tiny with their rows: '+R.b+' / '+R.bcl);
 ok(R.prog===1,'rows keep their progress');ok(R.close==='{"fr":{"close":["e"]}}','close links to rows left behind are dropped: '+R.close);
 ok(R.flds==='3/1','columns and card types come along');ok(R.alog==='aabb'&&R.blog==='ccee','the answer log is split by row: '+R.alog+' / '+R.blog);
 await p.waitForTimeout(500);
 const stored=await p.evaluate(()=>{const db=new Map(JSON.parse(localStorage.getItem('__db')||'[]'));return [...db.keys()].filter(k=>k.startsWith('decks/d0/notes/')).length;});
 ok(stored===2,'moved rows are gone from the original deck in storage ('+stored+')');
 await p.click('[data-act="impClose"]');
 // one-cluster deck: an explanation instead
 await p.evaluate(()=>{const S=window.__stufen.S;S.cur='z1';});await p.click('#side [data-act="open"][data-v="z1"]').catch(()=>{});
 await p.evaluate(()=>{const S=window.__stufen.S,d=S.decks.z1;S.notes.z1=S.notes.z1||new Map();S.notes.z1.set('q',{id:'q',c:d.clusters[0].id,f:{f1:'x'},s:{},o:1,t:1});S.cur='z1';S.view='deck';});
 await p.click('[data-act="tab"][data-v="cards"]');await p.click('#split-open');ok(/one cluster/.test(await p.textContent('#modal2')),'a deck with one cluster explains how to make clusters first');
 ok(errs.length===0,'no page errors '+errs.join(' | '));
 await b.close();
})();
