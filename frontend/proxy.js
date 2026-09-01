const form = document.querySelector('#search-form');
const input = document.querySelector('#search');
const result = document.querySelector('#result');
const status = document.querySelector('#status');
const output = document.querySelector('#output');

function destination(value) {
  try {
    const source = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(source);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.href : null;
  } catch {
    return null;
  }
}

function clearPreview() {
  result.querySelector('.html-preview')?.remove();
  output.hidden = false;
  output.textContent = '';
}

function renderHtml(html, target) {
  const wrapper = document.createElement('div');
  wrapper.className = 'html-preview';
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-forms allow-popups allow-scripts');
  iframe.setAttribute('title', 'Proxied page preview');
  iframe.style.width = '100%';
  iframe.style.minHeight = '520px';
  iframe.style.border = '0';
  iframe.srcdoc = `<base href="${target.replace(/"/g, '&quot;')}">${html}`;
  wrapper.appendChild(iframe);
  output.replaceWith(wrapper);
  return wrapper;
}

async function request(target, key = '') {
  const headers = key ? { 'X-Proxy-Key': key } : undefined;
  return fetch(`/api/proxy?url=${encodeURIComponent(target)}`, {
    headers,
    credentials: 'same-origin'
  });
}

async function getResponse(target) {
  let response = await request(target);
  if (response.status !== 401) return response;

  const key = window.prompt('Enter the proxy key once to start your browser session:');
  if (!key) return response;
  return request(target, key);
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value) return;

  const url = destination(value);
  const target = url || `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  result.hidden = false;
  status.textContent = 'Loading…';
  clearPreview();

  try {
    const response = await getResponse(target);
    const text = await response.text();
    status.textContent = `${response.status} ${response.statusText}`;
    const contentType = (response.headers.get('content-type') || '').toLowerCase();

    if (contentType.includes('text/html') && response.ok) {
      output.hidden = true;
      renderHtml(text, target);
    } else {
      output.textContent = text || '(empty response)';
    }
  } catch (error) {
    status.textContent = 'Request failed';
    output.hidden = false;
    output.textContent = error?.message || 'Request failed';
  }
});
