/* serves public/ for the page tests (they bring their own storage, see mock.js) */
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../public');
const TYPES={'.js':'text/javascript','.json':'application/json','.html':'text/html; charset=utf-8'};
http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u==='/')u='/index.html';
 const f=path.join(root,u);if(!f.startsWith(root)||!fs.existsSync(f)){r.statusCode=404;return r.end('no');}
 r.setHeader('content-type',TYPES[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(r);}).listen(+process.env.PORT||8765);
