const form=document.querySelector('#search-form');
const input=document.querySelector('#search');
const keyInput=document.querySelector('#api-key');
const result=document.querySelector('#result');
const status=document.querySelector('#status');
const output=document.querySelector('#output');
function destination(v){try{const s=/^[a-z][a-z\d+.-]*:\/\//i.test(v)?v:`https://${v}`;const u=new URL(s);return['http:','https:'].includes(u.protocol)&&u.hostname?u.href:null}catch{return null}}
function renderHtml(html, target){
  const wrapper=document.createElement('div');
  wrapper.className='html-preview';
  const iframe=document.createElement('iframe');
  iframe.setAttribute('sandbox','');
  iframe.setAttribute('title','Proxied page preview');
  iframe.style.width='100%';
  iframe.style.minHeight='520px';
  iframe.style.border='0';
  iframe.srcdoc=`<base href="${target.replace(/"/g,'&quot;')}">${html}`;
  wrapper.appendChild(iframe);
  output.replaceWith(wrapper);
  return wrapper;
}
form.addEventListener('submit',async e=>{
  e.preventDefault();
  const v=input.value.trim();
  const key=keyInput.value;
  if(!v||!key)return;
  const url=destination(v);
  const target=url||`https://www.google.com/search?q=${encodeURIComponent(v)}`;
  result.hidden=false;
  status.textContent='Loading…';
  const existing=result.querySelector('.html-preview');
  if(existing)existing.remove();
  output.textContent='';
  output.hidden=false;
  try{
    const r=await fetch(`/api/proxy?url=${encodeURIComponent(target)}`,{headers:{'X-Proxy-Key':key}});
    const text=await r.text();
    status.textContent=`${r.status} ${r.statusText}`;
    const ct=(r.headers.get('content-type')||'').toLowerCase();
    if(ct.includes('text/html') && r.ok){
      output.hidden=true;
      renderHtml(text,target);
    }else{
      output.textContent=text||'(empty response)';
    }
  }catch(err){
    status.textContent='Request failed';
    output.hidden=false;
    output.textContent=err.message||'Request failed';
  }
});
