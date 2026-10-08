/* A stored file, under the same address the page used on the artifact (/_blob/<id>). */
import {fail} from '../../server/lib.js';

export async function onRequestGet({params, env}){
  const id = String(params.id || '');
  if(!/^[0-9a-f]{32}$/.test(id)) return fail(404, 'not_found', 'No such file.');
  const meta = await env.DB.prepare('SELECT type, size FROM blobs WHERE id = ?').bind(id).first();
  if(!meta) return fail(404, 'not_found', 'No such file.');
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM blob_parts WHERE id = ?').bind(id).first();
  const n = count ? count.n : 0; let i = 0;
  /* one piece at a time, so a 20 MB file never sits in memory whole */
  const stream = new ReadableStream({async pull(c){
    if(i >= n){ c.close(); return; }
    const r = await env.DB.prepare('SELECT data FROM blob_parts WHERE id = ? AND n = ?').bind(id, i++).first();
    if(!r){ c.error(new Error('piece missing')); return; }
    c.enqueue(r.data instanceof Uint8Array ? r.data : new Uint8Array(r.data));
  }});
  /* a file never changes once stored, so the browser may keep it; `private` because it is the owner's data */
  return new Response(stream, {headers: {'content-type': meta.type, 'content-length': String(meta.size), 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox"}});
}
