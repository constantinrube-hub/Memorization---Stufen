/* Shared by the functions: the tables, the login cookie, small helpers.
   Bindings (set in the Cloudflare dashboard): DB = the D1 database, STUFEN_PASSWORD = the login password (secret). */

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers}});
export const fail = (status, code, message) => json({error: code, message: message || code}, status);

const SCHEMA = [
  /* one row per stored document; `parent` is the collection path, `id` the last path segment */
  `CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, parent TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, v INTEGER NOT NULL DEFAULT 1, t INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS docs_parent ON docs (parent, id)`,
  /* stored files (map pictures, coverage files, snapshots), cut into pieces because one D1 value holds at most 2 MB */
  `CREATE TABLE IF NOT EXISTS blobs (id TEXT PRIMARY KEY, type TEXT NOT NULL, size INTEGER NOT NULL, t INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS blob_parts (id TEXT NOT NULL, n INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (id, n))`,
  `CREATE TABLE IF NOT EXISTS logins (ip TEXT NOT NULL, t INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS logins_ip ON logins (ip, t)`
];
let ready = null;
/* the tables are created on first use, so there is no SQL to run by hand */
export function setup(env){
  if(!ready) ready = env.DB.batch(SCHEMA.map(s => env.DB.prepare(s))).catch(e => { ready = null; throw e; });
  return ready;
}

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function keyOf(env){
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('stufen-cookie-v1:' + env.STUFEN_PASSWORD));
  return crypto.subtle.importKey('raw', raw, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
}
const sign = async (env, text) => hex(await crypto.subtle.sign('HMAC', await keyOf(env), enc.encode(text)));
/* compares without stopping at the first difference */
export function same(a, b){
  a = enc.encode(String(a)); b = enc.encode(String(b)); let d = a.length ^ b.length;
  for(let i = 0; i < Math.max(a.length, b.length); i++) d |= (a[i] || 0) ^ (b[i] || 0);
  return d === 0;
}
export const COOKIE = 'stufen_s', DAYS = 180;
export async function makeCookie(env, secure){
  const exp = Date.now() + DAYS * 86400000, val = exp + '.' + await sign(env, String(exp));
  return `${COOKIE}=${val}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
export const clearCookie = secure => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
export async function signedIn(request, env){
  if(!env.STUFEN_PASSWORD) return false;
  const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=(\\d+)\\.([0-9a-f]{64})').exec(request.headers.get('cookie') || '');
  if(!m || +m[1] < Date.now()) return false;
  return same(m[2], await sign(env, m[1]));
}
/* what must be in place before anything else works; null when all is set */
export function missing(env){
  if(!env.DB) return 'The database is not connected yet (binding DB).';
  if(!env.STUFEN_PASSWORD) return 'No password is set yet (secret STUFEN_PASSWORD).';
  return null;
}
