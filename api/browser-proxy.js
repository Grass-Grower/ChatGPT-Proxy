const dns=require('node:dns').promises;
const net=require('node:net');
const crypto=require('node:crypto');
const {URL}=require('node:url');
const MAX_BODY=5*1024*1024,MAX_RESPONSE=10*1024*1024,SESSION_TTL=3600,MAX_REDIRECTS=5;
const METHODS=new Set(['GET','POST','PUT','PATCH','DELETE']);
const BLOCKED=new Set(['host','content-length','connection','transfer-encoding','x-proxy-key','authorization','proxy-authorization','cookie']);
function privateIp(ip){if(net.isIPv4(ip)){const[a,b]=ip.split('.').map(Number);return a===0||a===10||a===127||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||a>=224;}if(net.isIPv6(ip)){const s=ip.toLowerCase();return s==='::'||s==='::1'||s.startsWith('fc')||s.startsWith('fd')||s.startsWith('fe8')||s.startsWith('fe9')||s.startsWith('fea')||s.startsWith('feb')||s.startsWith('ff');}return true;}
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;return crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function allowed(host){const list=(process.env.PROXY_ALLOWED_HOSTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);return !list.length||list.some(x=>host===x||host.endsWith('.'+x));}
function signature(ts){return crypto.createHmac('sha256',process.env.PROXY_API_KEY||'').update(String(ts)).digest('base64url');}
function sessionValid(cookie){try{const m=String(cookie||'').match(/(?:^|;\s*)proxy_session=([^;]+)/);if(!m)return false;const[t,s]=decodeURIComponent(m[1]).split('.');const now=Math.floor(Date.now()/1000);return /^\d+$/.test(t)&&now-Number(t)>=0&&now-Number(t)<=SESSION_TTL&&equal(s,signature(t));}catch{return false;}}
function sessionCookie(){const ts=Math.floor(Date.now()/1000);return `proxy_session=${encodeURIComponent(ts+'.'+signature(ts))}; Path=/; Max-Age=${SESSION_TTL}; HttpOnly; Secure; SameSite=Strict`;}
function proxied(raw,base){try{const v=String(raw||'').trim();if(!v||/^(data:|javascript:|mailto:|tel:|#)/i.test(v))return null;const u=new URL(v,base);if(!['http:','https:'].includes(u.protocol)||!u.hostname)return null;return '/proxy?url='+encodeURIComponent(u.href);}catch{return null;}}
function escapeScriptString(v){return JSON.stringify(String(v)).replace(/<\//g,'<\\/');}
function navigationBridge(base){return `<script>(function(){const BASE=${escapeScriptString(base)};function toProxy(h){try{const u=new URL(h,BASE);if(!['http:','https:'].includes(u.protocol)||!u.hostname)return null;return '/proxy?url='+encodeURIComponent(u.href)}catch{return null}}function stop(e){const a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a||e.defaultPrevented)return;const p=toProxy(a.getAttribute('href'));if(!p||a.target&&a.target!=='_self')return;e.preventDefault();e.stopImmediatePropagation();window.location.assign(p)}document.addEventListener('click',stop,true);document.addEventListener('auxclick',function(e){if(e.button!==0)return;const a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;const p=toProxy(a.getAttribute('href'));if(!p||a.target&&a.target!=='_self')return;e.preventDefault();e.stopImmediatePropagation();window.location.assign(p)},true);const oldOpen=window.open;window.open=function(h){const p=toProxy(h);return p?oldOpen.call(window,p):oldOpen.apply(window,arguments)};})();</script>`;}
function rewriteHtml(html,base){const re=/(<(?:a|area|form)\b[^>]*\s)(href|action)(\s*=\s*["'])([^"']+)(["'])/ig;let out=html.replace(re,(m,p,a,e,v,q)=>{const n=proxied(v,base);return n?`${p}${a}${e}${n}${q}`:m;}).replace(/<base\b[^>]*>/ig,'');const bridge=navigationBridge(base);if(/<head\b[^>]*>/i.test(out))return out.replace(/<head\b[^>]*>/i,m=>m+bridge);return bridge+out;}
async function resolveUpstream(target,options){let current=target;for(let i=0;i<=MAX_REDIRECTS;i++){const up=await fetch(current,{...options,redirect:'manual'});const loc=up.headers.get('location');if(!loc||up.status<300||up.status>=400)return{up,target:current};const next=new URL(loc,current);if(!['http:','https:'].includes(next.protocol))return{up,target:current};const host=next.hostname.toLowerCase();if(!allowed(host))return{up,target:current};const records=await dns.lookup(host,{all:true});if(!records.length||records.some(r=>privateIp(r.address)))throw new Error('Private redirect blocked');current=next.href;}throw new Error('Too many redirects');}
module.exports=async function handler(req,res){
  if(req.method==='OPTIONS')return res.status(204).end();
  const key=String(req.headers['x-proxy-key']||''),expected=process.env.PROXY_API_KEY||'';
  if(!expected)return res.status(500).json({error:'Proxy is not configured'});
  const authed=equal(key,expected)||sessionValid(req.headers.cookie);if(!authed)return res.status(401).json({error:'Unauthorized'});
  if(equal(key,expected))res.setHeader('set-cookie',sessionCookie());
  if(!METHODS.has(req.method))return res.status(405).json({error:'Method not allowed'});
  let target;try{target=new URL(String(req.query.url||''));}catch{return res.status(400).json({error:'Invalid URL'});}
  if(!['http:','https:'].includes(target.protocol)||!target.hostname)return res.status(400).json({error:'Only HTTP(S) URLs are allowed'});
  const host=target.hostname.toLowerCase();if(!allowed(host))return res.status(403).json({error:'Destination not allowed'});
  try{const records=await dns.lookup(host,{all:true});if(!records.length||records.some(r=>privateIp(r.address)))return res.status(403).json({error:'Private destination blocked'});}catch{return res.status(502).json({error:'Destination cannot be resolved'});}
  const headers={};for(const[k,v]of Object.entries(req.headers)){if(!BLOCKED.has(k.toLowerCase())&&typeof v==='string')headers[k]=v;}
  let body;if(req.method!=='GET'&&req.method!=='DELETE'){if(Number(req.headers['content-length']||0)>MAX_BODY)return res.status(413).json({error:'Request too large'});if(typeof req.body==='string')body=req.body;else if(req.body!==undefined)body=JSON.stringify(req.body);if(body&&Buffer.byteLength(body)>MAX_BODY)return res.status(413).json({error:'Request too large'});}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{const {up,target:finalTarget}=await resolveUpstream(target.href,{method:req.method,headers,body,signal:controller.signal});const buf=Buffer.from(await up.arrayBuffer());if(buf.length>MAX_RESPONSE)return res.status(502).json({error:'Upstream response too large'});res.status(up.status);const ct=up.headers.get('content-type')||'';res.setHeader('cache-control','no-store');
    if(ct.toLowerCase().includes('text/html')){res.setHeader('content-type','text/html; charset=utf-8');return res.send(Buffer.from(rewriteHtml(buf.toString('utf8'),finalTarget),'utf8'));}
    if(ct)res.setHeader('content-type',ct);return res.send(buf);
  }catch(e){return res.status(504).json({error:e&&e.message==='Too many redirects'?'Too many upstream redirects':'Upstream request timed out or failed'});}finally{clearTimeout(timer);}
};
