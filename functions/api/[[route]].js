/* The page's storage: documents addressed by path (as in the artifact's store), stored files, and the login. */
import {clearCookie, fail, json, makeCookie, same, signedIn} from '../../server/lib.js';

const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const okPath = p => typeof p === 'string' && p.length <= 1000 && p.split('/').every(s => SEG.test(s) && s !== '.' && s !== '..');
const isDoc = p => okPath(p) && p.split('/').length % 2 === 0;
const isColl = p => okPath(p) && p.split('/').length % 2 === 1;
const split = p => { const i = p.lastIndexOf('/'); return [p.slice(0, i), p.slice(i + 1)]; };
const MAX_DOC = 1000000, MAX_BLOB = 20 * 1048576, PART = 1000000, MAX_STORE = 350 * 1048576;
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
/* fields of `b` go into `a`; maps are merged key by key, everything else is replaced */
function merge(a, b){ for(const k in b){ if(plain(b[k]) && plain(a[k])) merge(a[k], b[k]); else a[k] = b[k]; } return a; }

async function body(request, max){
  const len = +request.headers.get('content-length') || 0;
  if(len > max) return null;
  const buf = await request.arrayBuffer();
  return buf.byteLength > max ? null : buf;
}

export async function onRequest({request, env}){
  const url = new URL(request.url), route = url.pathname.slice(5), m = request.method, DB = env.DB, secure = url.protocol === 'https:';

  /* ----- login ----- */
  if(route === 'session') return json({in: await signedIn(request, env)});
  if(route === 'logout' && m === 'POST') return json({ok: true}, 200, {'set-cookie': clearCookie(secure)});
  if(route === 'login' && m === 'POST'){
    const ip = request.headers.get('cf-connecting-ip') || 'local', now = Date.now();
    const tries = await DB.prepare('SELECT COUNT(*) AS n FROM logins WHERE ip = ? AND t > ?').bind(ip, now - 600000).first();
    if(tries && tries.n >= 8) return fail(429, 'slow_down', 'Too many attempts. Wait ten minutes.');
    let pw = ''; try{ pw = String((await request.json()).password || ''); }catch(e){}
    if(!same(pw, env.STUFEN_PASSWORD)){
      await DB.batch([DB.prepare('INSERT INTO logins (ip, t) VALUES (?, ?)').bind(ip, now), DB.prepare('DELETE FROM logins WHERE t < ?').bind(now - 86400000)]);
      return fail(401, 'wrong_password', 'That is not the password.');
    }
    return json({ok: true}, 200, {'set-cookie': await makeCookie(env, secure)});
  }

  /* what the page needs to know about this site; the Google Maps key lives in a Pages variable, not in the repository */
  if(route === 'config' && m === 'GET') return json({gmaps: env.GOOGLE_MAPS_KEY || ''});

  /* ----- documents ----- */
  if(route === 'doc'){
    const path = url.searchParams.get('path');
    if(!isDoc(path)) return fail(400, 'invalid_argument', 'Not a document path.');
    if(m === 'GET'){
      const r = await DB.prepare('SELECT body, v FROM docs WHERE path = ?').bind(path).first();
      return r ? json({exists: true, v: r.v, data: JSON.parse(r.body)}) : json({exists: false, v: 0});
    }
    if(m === 'DELETE'){ await DB.prepare('DELETE FROM docs WHERE path = ?').bind(path).run(); return json({ok: true}); }
    if(m === 'PUT' || m === 'PATCH'){
      const buf = await body(request, MAX_DOC * 2);
      if(!buf) return fail(413, 'invalid_argument', 'That document is too large.');
      let data; try{ data = JSON.parse(new TextDecoder().decode(buf)); }catch(e){ return fail(400, 'invalid_argument', 'Not JSON.'); }
      if(!plain(data)) return fail(400, 'invalid_argument', 'A document is an object.');
      const [parent, id] = split(path), now = Date.now();
      if(m === 'PUT'){
        const text = JSON.stringify(data);
        if(text.length > MAX_DOC) return fail(413, 'invalid_argument', 'That document is too large.');
        const r = await DB.prepare('INSERT INTO docs (path, parent, id, body, v, t) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(path) DO UPDATE SET body = excluded.body, v = docs.v + 1, t = excluded.t RETURNING v').bind(path, parent, id, text, now).first();
        return json({ok: true, v: r ? r.v : 1});
      }
      /* merge: read, combine, write only if nobody wrote in between; otherwise read again */
      for(let i = 0; i < 6; i++){
        const cur = await DB.prepare('SELECT body, v FROM docs WHERE path = ?').bind(path).first();
        if(!cur) return fail(404, 'invalid_argument', 'No such document.');
        const text = JSON.stringify(merge(JSON.parse(cur.body), data));
        if(text.length > MAX_DOC) return fail(413, 'invalid_argument', 'That document is too large.');
        const r = await DB.prepare('UPDATE docs SET body = ?, v = v + 1, t = ? WHERE path = ? AND v = ?').bind(text, now, path, cur.v).run();
        if(r.meta && r.meta.changes) return json({ok: true, v: cur.v + 1});
      }
      return fail(503, 'unavailable', 'Busy, try again.');
    }
  }
  /* several whole-document writes in one request, stored together or not at all (a restore writes thousands of rows) */
  if(route === 'batch' && m === 'POST'){
    const buf = await body(request, 8 * 1048576);
    if(!buf) return fail(413, 'invalid_argument', 'That batch is too large.');
    let ops; try{ ops = JSON.parse(new TextDecoder().decode(buf)).ops; }catch(e){}
    if(!Array.isArray(ops) || !ops.length || ops.length > 100) return fail(400, 'invalid_argument', 'A batch holds 1 to 100 writes.');
    const now = Date.now(), st = [];
    for(const o of ops){
      if(!o || !isDoc(o.path)) return fail(400, 'invalid_argument', 'Not a document path.');
      if(o.op === 'delete'){ st.push(DB.prepare('DELETE FROM docs WHERE path = ?').bind(o.path)); continue; }
      if(o.op !== 'set' || !plain(o.data)) return fail(400, 'invalid_argument', 'A write is a set with an object, or a delete.');
      const text = JSON.stringify(o.data), [parent, id] = split(o.path);
      if(text.length > MAX_DOC) return fail(413, 'invalid_argument', 'That document is too large.');
      st.push(DB.prepare('INSERT INTO docs (path, parent, id, body, v, t) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(path) DO UPDATE SET body = excluded.body, v = docs.v + 1, t = excluded.t').bind(o.path, parent, id, text, now));
    }
    await DB.batch(st);
    return json({ok: true, n: st.length});
  }
  if(route === 'coll' && m === 'GET'){
    const path = url.searchParams.get('path'), after = url.searchParams.get('after');
    if(!isColl(path)) return fail(400, 'invalid_argument', 'Not a collection path.');
    const limit = Math.min(1000, Math.max(1, +url.searchParams.get('limit') || 1000));
    const q = after == null
      ? DB.prepare('SELECT id, body FROM docs WHERE parent = ? ORDER BY id LIMIT ?').bind(path, limit)
      : DB.prepare('SELECT id, body FROM docs WHERE parent = ? AND id > ? ORDER BY id LIMIT ?').bind(path, after, limit);
    const rows = (await q.all()).results || [];
    /* the bodies are already JSON: put them together without parsing each one */
    return new Response('{"docs":[' + rows.map(r => '{"id":' + JSON.stringify(r.id) + ',"data":' + r.body + '}').join(',') + ']}',
      {headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'}});
  }

  /* ----- stored files ----- */
  if(route === 'blob' && m === 'GET'){
    const rows = (await DB.prepare('SELECT id, type, size FROM blobs ORDER BY t').all()).results || [];
    return json({assets: rows.map(r => ({id: r.id, url: '/_blob/' + r.id, sizeBytes: r.size, contentType: r.type})),
      usage: {files: rows.length, bytes: rows.reduce((a, r) => a + r.size, 0), maxBytes: MAX_STORE, maxFiles: 5000}});
  }
  /* POST stores a new file under a fresh id; PUT puts a file from a backup back under its old id (and leaves an existing one alone) */
  const putId = m === 'PUT' && route.startsWith('blob/') ? route.slice(5) : '';
  if(putId && !/^[0-9a-f]{32}$/.test(putId)) return fail(400, 'invalid_argument', 'Not a file id.');
  if((route === 'blob' && m === 'POST') || putId){
    if(putId){ const ex = await DB.prepare('SELECT id, type, size FROM blobs WHERE id = ?').bind(putId).first(); if(ex) return json({id: ex.id, url: '/_blob/' + ex.id, sizeBytes: ex.size, contentType: ex.type}); }
    const buf = await body(request, MAX_BLOB);
    if(!buf) return fail(413, 'too_large', 'One stored file holds at most 20 MB.');
    const used = await DB.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM blobs').first();
    if((used ? used.n : 0) + buf.byteLength > MAX_STORE) return fail(507, 'quota_or_state', 'The file storage is full.');
    const id = putId || crypto.randomUUID().replace(/-/g, ''), type = (request.headers.get('content-type') || 'application/octet-stream').slice(0, 100), now = Date.now();
    const bytes = new Uint8Array(buf), parts = [];
    for(let o = 0, n = 0; o < bytes.length || n === 0; o += PART, n++) parts.push(DB.prepare('INSERT INTO blob_parts (id, n, data) VALUES (?, ?, ?)').bind(id, n, bytes.slice(o, o + PART)));
    /* the file is listed only once every piece is stored */
    try{
      if(putId) await DB.prepare('DELETE FROM blob_parts WHERE id = ?').bind(id).run();   // pieces left by an upload that broke off
      for(let i = 0; i < parts.length; i += 4) await DB.batch(parts.slice(i, i + 4));
      await DB.prepare('INSERT INTO blobs (id, type, size, t) VALUES (?, ?, ?, ?)').bind(id, type, bytes.length, now).run();
    }catch(e){ await DB.prepare('DELETE FROM blob_parts WHERE id = ?').bind(id).run().catch(() => {}); throw e; }
    return json({id, url: '/_blob/' + id, sizeBytes: bytes.length, contentType: type});
  }
  if(route.startsWith('blob/') && m === 'DELETE'){
    const id = route.slice(5);
    if(!/^[0-9a-f]{32}$/.test(id)) return fail(400, 'invalid_argument', 'Not a file id.');
    const r = await DB.batch([DB.prepare('DELETE FROM blobs WHERE id = ?').bind(id), DB.prepare('DELETE FROM blob_parts WHERE id = ?').bind(id)]);
    return json({deleted: !!(r[0].meta && r[0].meta.changes)});
  }
  return fail(404, 'not_found', 'No such address.');
}
