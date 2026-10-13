/* a map can be dragged until its edge reaches the middle of the box (also fully zoomed out), and the statistics map draws
   far-away parts (Alaska, Hawaii) shrunk in corner boxes, framed on the rest */
const {chromium}=require('playwright');const fs=require('fs');
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1;};
(async()=>{
 const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1300,height:900}});
 await ctx.addInitScript(fs.readFileSync(__dirname+'/mock.js','utf8'));
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:'+(process.env.PORT||8765)+'/');await p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 await p.evaluate(()=>{const st=window.__store;
  const cl={id:'c1',name:'Default',stages:[10,1440],kinds:['h','d'],moves:{none:'reset',close:-1,hard:0,easy:1,brainer:2},end:'repeat',grow:2};
  const sq=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([a,b])=>a.toFixed(4)+','+b.toFixed(4)).join(' ');
  // a "lower 48" of 3x2 cells in the lower right, a big "Alaska" top left, a small "Hawaii" bottom left
  const rows=[];for(let i=0;i<3;i++)for(let j=0;j<2;j++)rows.push(['m'+i+j,'Main '+i+j,sq(0.55+i*0.13,0.6+j*0.13,0.13,0.13)]);
  rows.push(['ak','Alaska',sq(0.02,0.02,0.4,0.35)]);rows.push(['hi','Hawaii',sq(0.2,0.9,0.05,0.04)]);
  st.set('decks/u',{id:'u',name:'US test',created:1,newPerDay:20,rollover:4,css:'',fields:[{id:'fa',name:'Code',kind:'text'},{id:'fr',name:'Map',kind:'region',map:'vec',ar:1,hide:true,home:{k:2.2,x:0.53,y:0.55},outline:'0.68,0.6 0.68,0.86;0.1,0.1 0.3,0.3',geo:{m:0,w:0,x0:0,y0:-Math.PI/180,s:180/Math.PI,pad:0,b:[0,0,1,1]}}],
   types:[{id:'t1',name:'Click',front:'{{Code}}',back:'',typed:'',click:'fr',free:true}],clusters:[cl]});
  rows.forEach(([id,name,shape],i)=>st.set('decks/u/notes/'+id,{id,c:'c1',f:{fa:name,fr:shape},s:{},o:i+1,t:1}));
  const now=Date.now(),k=new Date(now-3600e3).toISOString().slice(0,10);
  st.set('decks/u/log/'+k,{id:k,e:rows.map(([id],i)=>[now-1000,id,'t1',i%5,'r',2,1,''].join('|'))});});
 await p.reload();await p.waitForFunction(()=>document.querySelector('#status').textContent!=='Loading…');
 await p.click('[data-act="tab"][data-v="stats"]');await p.waitForSelector('#statmap .rmap svg');
 const L=await p.evaluate(()=>{const rm=document.querySelector('#statmap .rmap'),paths=[...rm.querySelectorAll('path.hm')].map(e=>{const nums=e.getAttribute('d').match(/-?[\d.]+/g).map(Number),xs=nums.filter((v,i)=>i%2==0),ys=nums.filter((v,i)=>i%2);return {t:e.dataset.tip.split('\n')[0],x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)};});
   return {h:+rm.dataset.h,paths,frames:rm.querySelectorAll('rect.inb').length,ol:rm.querySelector('path.ol').getAttribute('d')};});
 const P=n=>L.paths.find(x=>x.t===n),ak=P('Alaska'),hi=P('Hawaii'),m=P('Main 00'),m2=P('Main 21');
 ok(L.frames===2,'two corner boxes: Alaska and Hawaii ('+L.frames+')');
 ok(m.x0<80&&m2.x1>920,'the map is framed on the main part: it spans the width ('+m.x0.toFixed(0)+'…'+m2.x1.toFixed(0)+')');
 ok(ak.x1-ak.x0<=0.25*1000+1&&ak.x1-ak.x0<400,'Alaska is shrunk to at most a quarter of the width ('+(ak.x1-ak.x0).toFixed(0)+' of 1000; was 400 of the old frame)');
 ok(ak.y0>=0&&ak.y1<=L.h+0.5&&hi.y1<=L.h+0.5&&hi.x0>ak.x1,'both boxes sit inside the frame, side by side');
 ok(!/NaN/.test(L.ol)&&L.ol.split('M').length===3,'state lines follow into the new frame and the box');
 // dragging past the edge, fully zoomed out
 await p.locator('#statmap .rmap').scrollIntoViewIfNeeded();const box=await p.locator('#statmap .rmap').boundingBox();
 const v0=await p.locator('#statmap svg').getAttribute('viewBox');
 await p.mouse.move(box.x+box.width*0.5,box.y+box.height*0.5);await p.mouse.down();await p.mouse.move(box.x+box.width*0.5+150,box.y+box.height*0.5+100,{steps:10});await p.mouse.up();
 const v1=await p.locator('#statmap svg').getAttribute('viewBox');ok(v0!==v1&&+v1.split(' ')[0]<0,'fully zoomed out, the map still moves: '+v0+' → '+v1);
 await p.mouse.move(box.x+box.width*0.5,box.y+box.height*0.5);await p.mouse.down();await p.mouse.move(box.x+box.width*0.5+900,box.y+box.height*0.5+900,{steps:10});await p.mouse.up();
 const v2=(await p.locator('#statmap svg').getAttribute('viewBox')).split(' ').map(Number);ok(Math.abs(v2[0]+v2[2]/2)<1&&Math.abs(v2[1]+v2[3]/2)<1,'it stops when the map’s corner reaches the middle: '+v2.join(' '));
 await p.click('#statmap [data-act="zoom"][data-v="fit"]');ok(await p.locator('#statmap svg').getAttribute('viewBox')===v0,'⤢ brings back the whole map');
 // zoomed in, the far corner can be brought to the middle
 for(let i=0;i<3;i++)await p.click('#statmap [data-act="zoom"][data-v="in"]');
 await p.mouse.move(box.x+box.width*0.5,box.y+box.height*0.5);await p.mouse.down();await p.mouse.move(box.x+box.width*0.5-2000,box.y+box.height*0.5-2000,{steps:12});await p.mouse.up();
 const v3=(await p.locator('#statmap svg').getAttribute('viewBox')).split(' ').map(Number);ok(Math.abs(v3[0]+v3[2]/2-1000)<1&&Math.abs(v3[1]+v3[3]/2-L.h)<1,'zoomed in, the bottom-right corner reaches the middle: '+v3.join(' '));
 ok(errs.length===0,'no page errors '+errs.join(' | '));
 await b.close();
})();
