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

async function request(target, key = '') {
  const headers = key ? { 'X-Proxy-Key': key } : undefined;
  return fetch(`/proxy?url=${encodeURIComponent(target)}`, {
    headers,
    credentials: 'same-origin'
  });
}

async function authenticateAndOpen(target) {
  let response = await request(target);
  if (response.status !== 401) return response;

  const key = window.prompt('Enter the proxy key once to start your browser session:');
  if (!key) return response;

  response = await request(target, key);
  if (response.ok || response.status >= 300 && response.status < 400) {
    window.location.assign(`/proxy?url=${encodeURIComponent(target)}`);
  }
  return response;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value) return;

  const url = destination(value);
  const target = url || `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  result.hidden = false;
  status.textContent = 'Connecting…';
  output.textContent = '';

  try {
    const response = await authenticateAndOpen(target);
    if (response.status === 401) {
      status.textContent = 'Authentication required';
      output.textContent = 'Enter the proxy key once. Your browser will then keep the secure session automatically.';
      return;
    }
    if (!response.ok) {
      status.textContent = `${response.status} ${response.statusText}`;
      output.textContent = await response.text() || '(empty response)';
    }
  } catch (error) {
    status.textContent = 'Request failed';
    output.textContent = error?.message || 'Request failed';
  }
});
