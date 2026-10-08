/* Everything under /api and /_blob needs the login cookie; the page itself and its libraries hold no data and are public. */
import {fail, missing, setup, signedIn} from '../server/lib.js';

const OPEN = new Set(['/api/login', '/api/session', '/api/logout']);

export async function onRequest(ctx){
  const {request, env, next} = ctx, url = new URL(request.url);
  const guarded = url.pathname.startsWith('/api/') || url.pathname.startsWith('/_blob/');
  if(!guarded) return next();
  const miss = missing(env);
  if(miss) return fail(503, 'setup', miss);
  /* a page on another site must not be able to change data through the visitor's cookie */
  if(request.method !== 'GET' && request.method !== 'HEAD'){
    const origin = request.headers.get('origin');
    if(origin && new URL(origin).host !== url.host) return fail(403, 'forbidden', 'Wrong origin.');
  }
  try{ await setup(env); }catch(e){ return fail(503, 'unavailable', 'The database could not be prepared.'); }
  if(!OPEN.has(url.pathname) && !(await signedIn(request, env))) return fail(401, 'signed_out', 'Sign in first.');
  try{ return await next(); }
  catch(e){ return fail(503, 'unavailable', String(e && e.message || e).slice(0, 200)); }
}
