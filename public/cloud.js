/* Stands in for the storage the page had as an artifact: window.claude.use('db' | 'assets' | 'downloads').
   The data lives in the site's own database; this file talks to it and shows the sign-in box when needed. */
(() => {
  'use strict';
  if(window.claude && window.claude.use) return;   // the test harness brings its own storage

  /* ---------- sign-in ---------- */
  let gate = null;   // one sign-in box at a time; every waiting request continues once it is passed
  function signIn(setupMsg){
    if(gate) return gate;
    return gate = new Promise(done => {
      const box = document.createElement('div');
      box.id = 'cloud-gate';
      box.innerHTML = '<form><h1>Stufen<i>.</i></h1><p class="m"></p><input type="password" autocomplete="current-password" placeholder="Password" aria-label="Password"><button type="submit">Sign in</button><p class="e" role="alert"></p></form>';
      const css = document.createElement('style');
      css.textContent = '#cloud-gate{position:fixed;inset:0;z-index:1000;background:var(--bg,#f2f5f4);color:var(--ink,#16201e);display:flex;align-items:center;justify-content:center;padding:20px}' +
        '#cloud-gate form{width:min(340px,100%);display:flex;flex-direction:column;gap:12px}#cloud-gate h1{font:700 30px/1 var(--f-display,sans-serif);margin:0 0 4px}#cloud-gate h1 i{font-style:normal;color:var(--accent,#0c6b6b)}' +
        '#cloud-gate p{margin:0;font-size:14px;color:var(--muted,#5a6966)}#cloud-gate .e{color:var(--wrong,#b23b2a);min-height:20px}' +
        '#cloud-gate input{font:inherit;font-size:16px;padding:10px 12px;border:1px solid var(--line,#d3dad8);border-radius:6px;background:var(--surface,#fff);color:inherit}' +
        '#cloud-gate button{font:600 15px inherit;font-family:inherit;padding:11px;border-radius:6px;border:0;background:var(--accent,#0c6b6b);color:var(--accent-ink,#fff);cursor:pointer}#cloud-gate button:disabled{opacity:.6}';
      document.head.appendChild(css); document.body.appendChild(box);
      const form = box.querySelector('form'), pw = box.querySelector('input'), err = box.querySelector('.e'), btn = box.querySelector('button'), msg = box.querySelector('.m');
      if(setupMsg){ msg.textContent = 'This site is not set up yet. ' + setupMsg; pw.hidden = true; btn.textContent = 'Check again'; }
      else { msg.textContent = 'Your decks are behind a password.'; setTimeout(() => pw.focus(), 0); }
      form.addEventListener('submit', async e => {
        e.preventDefault(); err.textContent = ''; btn.disabled = true;
        try{
          if(setupMsg){ location.reload(); return; }
          const r = await fetch('/api/login', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({password: pw.value})});
          if(r.ok){ box.remove(); css.remove(); gate = null; done(); return; }
          const o = await r.json().catch(() => ({}));
          err.textContent = o.message || 'Could not sign in.'; pw.select();
        }catch(e2){ err.textContent = 'No connection. Try again.'; }
        btn.disabled = false;
      });
    });
  }

  /* ---------- requests ---------- */
  const E = (code, message) => Object.assign(new Error(message || code), {code});
  async function call(method, url, body, headers){
    for(let again = 0;; again++){
      let r;
      try{ r = await fetch(url, {method, body, headers, credentials: 'same-origin', cache: 'no-store'}); }
      catch(e){ throw E('unavailable', 'No connection.'); }
      if(r.ok) return r;
      const o = await r.json().catch(() => ({}));
      if(r.status === 401 && again < 3){ await signIn(); continue; }          // signed out meanwhile: ask, then repeat the request
      if(r.status === 503 && o.error === 'setup'){ await signIn(o.message); continue; }
      throw E(o.error || (r.status === 413 ? 'too_large' : r.status === 429 || r.status >= 500 ? 'unavailable' : 'invalid_argument'), o.message);
    }
  }
  const q = (route, path, extra) => '/api/' + route + '?path=' + encodeURIComponent(path) + (extra || '');
  const copy = o => JSON.parse(JSON.stringify(o));
  const snap = (path, r) => ({id: path.split('/').pop(), exists: !!r.exists, data: () => r.exists ? copy(r.data) : undefined, metadata: {fromCache: false, hasPendingWrites: false}});

  /* ---------- documents ---------- */
  const watchers = new Set();
  let timer = 0;
  /* live notices: the watched document is asked for again every 12 s while the page is visible, and at once when it returns to view */
  async function poll(){
    clearTimeout(timer); timer = 0;
    if(document.visibilityState === 'visible'){
      for(const w of [...watchers]){
        try{ const r = await (await call('GET', q('doc', w.path))).json(); if(r.v !== w.v){ w.v = r.v; w.fn(snap(w.path, r)); } }
        catch(e){ if(w.err) try{ w.err(e); }catch(e2){} }
      }
    }
    if(watchers.size) timer = setTimeout(poll, 12000);
  }
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible' && watchers.size) poll(); });

  /* whole-document writes that arrive close together travel in one request */
  let queue = [], qBytes = 0, qTimer = 0;
  function flush(){
    clearTimeout(qTimer); qTimer = 0; if(!queue.length) return;
    const batch = queue; queue = []; qBytes = 0;
    call('POST', '/api/batch', JSON.stringify({ops: batch.map(x => x.op)}), {'content-type': 'application/json'})
      .then(() => batch.forEach(x => x.ok()), e => batch.forEach(x => x.no(e)));
  }
  function write(op, size){
    if(size > 1000000) return Promise.reject(E('invalid_argument', 'That document is too large.'));
    if(queue.length >= 100 || qBytes + size > 4000000) flush();
    return new Promise((ok, no) => { queue.push({op, ok, no}); qBytes += size; if(!qTimer) qTimer = setTimeout(flush, 25); });
  }

  const coll = (path, after, lim) => ({
    where(f, op, v){ if(f !== 'id' || op !== '>') throw E('invalid_argument', 'Only id > value is supported.'); return coll(path, v, lim); },
    limit(n){ return coll(path, after, n); },
    async get(){
      const o = await (await call('GET', q('coll', path, (after != null ? '&after=' + encodeURIComponent(after) : '') + '&limit=' + (lim || 1000)))).json();
      const docs = o.docs.map(d => ({id: d.id, exists: true, data: () => d.data}));
      return {docs, size: docs.length};
    }
  });
  const db = {
    collection: p => coll(p, null, 0),
    doc: p => ({
      async get(){ return snap(p, await (await call('GET', q('doc', p))).json()); },
      set(o){ const data = copy(o); return write({op: 'set', path: p, data}, JSON.stringify(data).length); },
      async update(o){ await call('PATCH', q('doc', p), JSON.stringify(o), {'content-type': 'application/json'}); },
      delete(){ return write({op: 'delete', path: p}, 100); },
      onSnapshot(fn, err){ const w = {path: p, fn, err, v: -1}; watchers.add(w); poll(); return () => watchers.delete(w); }
    })
  };

  /* ---------- stored files ---------- */
  const assets = {
    async upload(blob, o){
      if(blob.size > 20 * 1048576) throw E('too_large', 'One stored file holds at most 20 MB.');
      return (await call('POST', '/api/blob', blob, {'content-type': (o && o.type) || blob.type || 'application/octet-stream'})).json();
    },
    /* a file from a backup goes back under the id the decks refer to */
    async put(id, blob, o){
      if(blob.size > 20 * 1048576) throw E('too_large', 'One stored file holds at most 20 MB.');
      return (await call('PUT', '/api/blob/' + encodeURIComponent(id), blob, {'content-type': (o && o.type) || blob.type || 'application/octet-stream'})).json();
    },
    async list(){ return (await call('GET', '/api/blob')).json(); },
    async delete(id){ return (await call('DELETE', '/api/blob/' + encodeURIComponent(id))).json(); }
  };

  /* ---------- saving a file to the device ---------- */
  const downloads = {
    async save(o){
      const blob = o.data instanceof Blob ? o.data : new Blob([o.data], {type: o.type || 'application/json'});
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = o.filename || 'download'; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      return 'saved';
    }
  };

  const ready = (async () => {   // the first thing the page asks for waits until the visitor is signed in
    try{ const r = await (await call('GET', '/api/session')).json(); if(!r.in) await signIn(); }catch(e){}
  })();
  window.claude = {writers: 48, config: async () => { await ready; try{ return await (await call('GET', '/api/config')).json(); }catch(e){ return {}; } }, use: async n => { await ready; return ({db, assets, downloads})[n] || null; }, signOut: async () => { try{ await fetch('/api/logout', {method: 'POST'}); }catch(e){} location.reload(); }};
})();
