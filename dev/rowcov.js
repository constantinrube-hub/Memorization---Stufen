/* a location file split by row (car-and-month decks): after the answer only that card's own dots show and the Street View link picks one of them;
   while the question is open no dots show; links written in a text column open in a new tab */
const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1300,height:900}});
 await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:'+(process.env.PORT||8765)+'/');await p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 const ID='abcdefabcdefabcdefabcdefabcdef01';
 await p.evaluate(ID=>{const st=window.__store;
  const cl={id:'c1',name:'Default',stages:[10,1440],kinds:['h','d'],moves:{none:'reset',close:-1,hard:0,easy:1,brainer:2},end:'repeat',grow:2};
  // two rows with the SAME big square; each has its own two locations
  const sq='0.1,0.1 0.9,0.1 0.9,0.9 0.1,0.9';
  st.set('decks/d0',{id:'d0',name:'Rows',created:1,newPerDay:20,rollover:4,css:'',fields:[{id:'fa',name:'Name',kind:'text'},{id:'fs',name:'Sources',kind:'text'},{id:'fr',name:'Map',kind:'region',map:'vec',ar:1,geo:{m:0,w:0,x0:0,y0:-Math.PI/180,s:180/Math.PI,pad:0,b:[0,0,1,1]},cov:{id:ID,n:4,name:'locs',show:1,row:1}}],
   types:[{id:'t1',name:'Click',front:'{{Name}}',back:'{{Sources}}',typed:'',click:'fr',free:true,gl:'all'}],clusters:[cl]});
  st.set('decks/d0/notes/a',{id:'a',c:'c1',f:{fa:'Row A',fs:'Guide: [Finbarr doc](https://docs.google.com/document/d/x) · https://www.plonkit.net/russia',fr:sq},s:{},o:1,t:1});
  st.set('decks/d0/notes/b',{id:'b',c:'c1',f:{fa:'Row B',fs:'none',fr:sq},s:{},o:2,t:1});
  // degrees map: lat = -y, lng = x  (geo m:0, s:1, y0:-1 -> y = -lat + 1 ... keep the points inside the square either way)
  const pt=(x,y,tag)=>[1-y,x,0,0,'',tag];
  localStorage.setItem('__blobs',JSON.stringify([[ID,JSON.stringify({v:1,p:[pt(0.2,0.2,'row:a'),pt(0.3,0.3,'row:a'),pt(0.7,0.7,'row:b'),pt(0.8,0.8,'row:b')]})]]));},ID);
 await p.reload();await p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 await p.evaluate(()=>{window.__stufen.S.cur='d0';});await p.click('[data-act="tab"][data-v="study"]');await p.click('[data-act="start"]');await p.waitForSelector('#clickmap .rmap svg');await p.waitForTimeout(800);
 ok(await p.locator('#clickmap path.cv').count()===0,'no dots while the question is open');
 const nid=await p.evaluate(()=>window.__stufen.S.study.cur.nid);
 const box=await p.locator('#clickmap .rmap').boundingBox();await p.mouse.click(box.x+box.width*0.5,box.y+box.height*0.5);await p.waitForSelector('.grades');await p.waitForTimeout(800);
 const d=await p.locator('#clickmap path.cv').getAttribute('d');const n=(d.match(/M/g)||[]).length;
 ok(n===2,'after the answer only this card’s two dots show ('+n+')');
 const xs=[...d.matchAll(/M([\d.]+) /g)].map(m=>+m[1]);ok(nid==='a'?xs.every(x=>x<500):xs.every(x=>x>500),'and they are its own ('+nid+': '+xs.join(',')+')');
 const sv=await p.locator('.glinks a',{hasText:'Street View'}).textContent();ok(/1 of 2/.test(sv),'the Street View link picks one of the card’s two locations: '+sv.trim());
 if(nid==='a'){const links=await p.evaluate(()=>[...document.querySelector('#face2').shadowRoot.querySelectorAll('a')].map(a=>a.textContent+'|'+a.href+'|'+a.target));
  ok(links.length===2&&links[0].startsWith('Finbarr doc ↗|https://docs.google.com/document/d/x|_blank')&&links[1].startsWith('plonkit.net ↗|https://www.plonkit.net/russia'),'addresses in a text column are links: '+links.join(' ; '));}
 else { ok(true,'(row B first; link check runs on row A below)'); }
 await p.locator('[data-act="grade"]').nth(2).click();await p.waitForTimeout(500);
 const box2=await p.locator('#clickmap .rmap').boundingBox();await p.mouse.click(box2.x+box2.width*0.5,box2.y+box2.height*0.5);await p.waitForSelector('.grades');await p.waitForTimeout(500);
 const d2=await p.locator('#clickmap path.cv').getAttribute('d');const xs2=[...d2.matchAll(/M([\d.]+) /g)].map(m=>+m[1]);
 const nid2=await p.evaluate(()=>window.__stufen.S.study.cur.nid);ok(nid2!==nid&&xs2.length===2&&(nid==='a'?xs2.every(x=>x>500):xs2.every(x=>x<500)),'the second card shows the other row’s dots ('+nid2+': '+xs2.join(',')+')');
 if(nid!=='a'){const links=await p.evaluate(()=>[...document.querySelector('#face2').shadowRoot.querySelectorAll('a')].map(a=>a.textContent+'|'+a.href));ok(links.length===2,'addresses in a text column are links: '+links.join(' ; '));}
 const miss=await p.evaluate(()=>{const W=window.__stufen,S=W.S,d=S.decks.d0;return W.covMissing(d,d.fields[2]).length;});ok(miss===0,'every row has its own locations');
 ok(errs.length===0,'no page errors '+errs.join(' | '));
 await b.close();
})();
