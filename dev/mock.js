/* stand-in for the page's store, file storage and downloads. The store lives in localStorage, so two pages
   opened in one browser context behave like two devices on the same data, with live change notices. */
(() => {
  const cl = o => JSON.parse(JSON.stringify(o));
  const read = k => new Map(JSON.parse(localStorage.getItem(k) || '[]')), write = (k, m) => localStorage.setItem(k, JSON.stringify([...m]));
  const listeners = [];   // {path, fn, last}
  const notify = () => { const st = read('__db'); for(const l of listeners){ const cur = st.has(l.path) ? JSON.stringify(st.get(l.path)) : null; if(cur !== l.last){ l.last = cur; l.fn(mkdoc(l.path, st)); } } };
  window.addEventListener('storage', e => { if(e.key === '__db') notify(); });
  const mkdoc = (p, st) => ({id: p.split('/').pop(), exists: st.has(p), data: () => st.has(p) ? cl(st.get(p)) : undefined, metadata: {fromCache: false, hasPendingWrites: false}});
  const merge = (a, b) => { for(const k in b){ if(b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) merge(a[k], b[k]); else a[k] = b[k]; } return a; };
  const coll = (path, flt = [], lim = 1e9) => ({
    where(f, op, v){ return coll(path, flt.concat([[f, op, v]]), lim); }, limit(n){ return coll(path, flt, n); },
    async get(){ const st = read('__db'); let ids = [...st.keys()].filter(k => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/')).map(k => k.slice(path.length + 1)).sort();
      for(const [f, op, v] of flt) if(f === 'id' && op === '>') ids = ids.filter(i => i > v);
      ids = ids.slice(0, lim); const docs = ids.map(i => mkdoc(path + '/' + i, st)); return {docs, size: docs.length}; }});
  const db = {collection: p => coll(p), doc: p => ({
    async get(){ return mkdoc(p, read('__db')); },
    async set(o){ window.__writes = (window.__writes || 0) + 1; const st = read('__db'); st.set(p, cl(o)); write('__db', st); notify(); },
    async update(o){ const st = read('__db'); if(!st.has(p)) throw {code: 'invalid_argument', message: 'no such document'}; st.set(p, merge(st.get(p), cl(o))); write('__db', st); notify(); },
    async delete(){ const st = read('__db'); st.delete(p); write('__db', st); notify(); },
    onSnapshot(fn){ const st = read('__db'), l = {path: p, fn, last: st.has(p) ? JSON.stringify(st.get(p)) : null}; listeners.push(l); setTimeout(() => fn(mkdoc(p, read('__db'))), 0); return () => { const i = listeners.indexOf(l); if(i >= 0) listeners.splice(i, 1); }; }})};
  let an = 0;
  const assets = {async upload(blob, o){ const b = read('__blobs'), id = 'a' + String(++an + b.size * 1000 + Date.now() % 100000).padStart(31, '0'); b.set(id, await blob.text()); write('__blobs', b); return {id, url: '/_blob/' + id, sizeBytes: blob.size, contentType: (o && o.type) || blob.type}; },
    async list(){ let n = 0; const b = read('__blobs'), l = []; for(const [id, t] of b){ n += t.length; l.push({id, url: '/_blob/' + id, sizeBytes: t.length, contentType: 'application/json'}); } return {assets: l, usage: {files: b.size, bytes: n, maxBytes: 500 * 1048576, maxFiles: 1000}}; },
    async delete(id){ const b = read('__blobs'), h = b.delete(id); write('__blobs', b); return {deleted: h}; }};
  window.__dl = [];
  const downloads = {async save(o){ const data = typeof o.data === 'string' ? o.data : await o.data.text(); window.__dl.push({filename: o.filename, data}); return 'saved'; }};
  const of = window.fetch.bind(window);
  window.fetch = (u, ...a) => { if(typeof u === 'string' && u.startsWith('/_blob/')){ const t = read('__blobs').get(u.slice(7)); return Promise.resolve(new Response(t == null ? '' : t, {status: t == null ? 404 : 200})); } return of(u, ...a); };
  /* what the tests look at: always the stored state */
  window.__store = {get: k => read('__db').get(k), has: k => read('__db').has(k), set(k, v){ const st = read('__db'); st.set(k, v); write('__db', st); }, delete(k){ const st = read('__db'); st.delete(k); write('__db', st); }, keys: () => read('__db').keys(), get size(){ return read('__db').size; }, [Symbol.iterator](){ return read('__db')[Symbol.iterator](); }};
  window.__blobs = {get size(){ return read('__blobs').size; }, get: k => read('__blobs').get(k)};
  window.claude = {use: async n => ({db, assets, downloads})[n] || null};
})();
