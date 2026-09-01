const form=document.querySelector('#search-form');
const input=document.querySelector('#search');
const keyInput=document.querySelector('#api-key');
const result=document.querySelector('#result');
const status=document.querySelector('#status');
const output=document.querySelector('#output');
function destination(v){try{const s=/^[a-z][a-z\d+.-]*:\/\//i.test(v)?v:`https://${v}`;const u=new URL(s);return['http:','https:'].includes(u.protocol)&&u.hostname?u.href:null}catch{return null}}
form.addEventListener('submit',async e=>{e.preventDefault();const v=input.value.trim();const key=keyInput.value;if(!v||!key)return;const url=destination(v);const target=url||`https://www.google.com/search?q=${encodeURIComponent(v)}`;result.hidden=false;status.textContent='Loading…';output.textContent='';try{const r=await fetch(`/proxy?url=${encodeURIComponent(target)}`,{headers:{'X-Proxy-Key':key}});status.textContent=`${r.status} ${r.statusText}`;output.textContent=await r.text()||'(empty response)'}catch(err){status.textContent='Request failed';output.textContent=err.message}});