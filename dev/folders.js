/* folders on the overview and in the deck list: continent → country → deck */
const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1300,height:900}});
 await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 const url='http://localhost:'+(process.env.PORT||8765)+'/',ready=()=>p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 await p.goto(url);await ready();
 await p.evaluate(()=>{const st=window.__store;const mk=(id,name,n)=>{const d={id,name,created:Date.now()+st.size,newPerDay:4,rollover:4,css:'',fields:[{id:'fa',name:'Front',kind:'text'},{id:'fb',name:'Back',kind:'text'}],types:[{id:'t1',name:'F→B',front:'{{Front}}',back:'{{Back}}',typed:''}],clusters:[{id:'c1',name:'Default',stages:[0,10,1440,4320],kinds:['q','h','d','d'],moves:{none:'reset',close:-1,hard:0,easy:1,brainer:2},end:'repeat',grow:2}]};st.set('decks/'+id,d);for(let i=0;i<n;i++){const nid='n'+String(i).padStart(3,'0');st.set('decks/'+id+'/notes/'+nid,{id:nid,c:'c1',f:{fa:'Q'+(i+1)+' '+name,fb:'A'+(n-i)},s:{},o:i+1,t:1});}};
   ['Cities · Japan','Japan · Prefectures','Cities · Italy','US area codes','Kenya · Counties','Cities · South Korea','Misc'].forEach((n,i)=>mk('d'+i,n,6));localStorage.setItem('__db',JSON.stringify([...st]));});
 await p.reload();await ready();
 const g=await p.evaluate(()=>{const A=window.__stufen;return ['Cities · Japan','US area codes','UK · Councils Wales','Nigeria states','Papua New Guinea','Misc','Australia · LGAs New South Wales','Cities · South Africa','Bus stops'].map(n=>(A.guessFolder(n)||['-']).join('/'));});
 ok(g.join('|')==='Asia/Japan|North America/United States|Europe/United Kingdom|Africa/Nigeria|Oceania/Papua New Guinea|-|Oceania/Australia|Africa/South Africa|-','country is read from the deck name: '+g.join('|'));
 ok(await p.locator('table.home tbody tr').count()===7&&await p.locator('tr.fold').count()===0,'no folders yet: flat table');
 ok((await p.textContent('#fo-auto')).includes('Sort 6 decks'),'offer to sort 6 of 7 decks');
 await p.click('[data-act="foAuto"]');
 await p.waitForFunction(()=>{const m=window.__store.get('meta/settings');return m&&m.folders&&Object.keys(m.folders).length===6;});ok(true,'folders saved in the store');
 ok(await p.locator('tr.fold.f1').count()===5,'continent rows: Africa, Asia, Europe, North America, Not in a folder');
 ok(await p.locator('tr.fold.f2').count()===5&&await p.locator('table.home .linkbtn').count()===1,'countries shown closed; only the unsorted deck is listed');
 const asia=p.locator('tr.fold[data-fold="Asia"]');ok((await asia.textContent()).includes('3 decks')&&(await asia.locator('td.n').nth(1).textContent())==='12','Asia row sums its decks (3 decks, 12 new)');
 await p.click('[data-act="treeTog"][data-v="Asia/Japan"]');ok(await p.locator('td.ind2 .linkbtn').count()===2,'opening Japan lists its two decks');
 ok(await p.locator('#side .gh').count()>=5&&await p.locator('#side .in2 .deck').count()===2,'deck list on the left follows the folders');
 await p.reload();await ready();ok(await p.locator('td.ind2 .linkbtn').count()===2,'open folders are remembered on this device');
 // tick a folder, move it
 await p.check('[data-hsf="Asia/Japan"]');ok((await p.textContent('#sel-bar')).includes('2 decks ticked'),'ticking a country ticks its decks');
 await p.fill('#fo-a','East Asia');await p.fill('#fo-b','Nippon');await p.check('#hs-d6');
 ok(await p.inputValue('#fo-a')==='East Asia','typed folder name survives another tick');
 await p.click('[data-act="foMove"]');
 ok(await p.evaluate(()=>{const f=window.__stufen.S.meta.folders;return f.d0.join('/')==='East Asia/Nippon'&&f.d6.join('/')==='East Asia/Nippon'&&f.d5.join('/')==='Asia/South Korea';}),'three decks moved to East Asia → Nippon');
 ok(await p.locator('tr.fold[data-fold="~none"]').count()===0,'no “Not in a folder” row once every deck has one');
 // study a folder
 await p.click('tr.fold[data-fold="East Asia/Nippon"] [data-act="studyFolder"]');ok((await p.textContent('.pagetitle')).includes('Nippon')&&(await p.textContent('.head')).includes('3 decks'),'Study on a country starts a session over its decks');
 await p.click('[data-act="stop"]');
 // take out
 await p.click('[data-act="treeTog"][data-v="East Asia/Nippon"]');await p.check('#hs-d6');await p.click('[data-act="foClear"]');
 ok(await p.evaluate(()=>!window.__stufen.S.meta.folders.d6)&&await p.locator('tr.fold[data-fold="~none"]').count()===1,'a deck can be taken out of its folder');
 // phone
 await p.setViewportSize({width:390,height:800});await p.waitForTimeout(200);
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'no sideways scroll on a phone');
 ok(errs.length===0,'no page errors '+errs.join(' | '));
 await b.close();
})();
