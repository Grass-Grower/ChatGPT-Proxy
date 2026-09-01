const form = document.querySelector('#proxy-form');
const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search');
const urlInput = document.querySelector('#url');
const result = document.querySelector('#result');
const status = document.querySelector('#status');
const output = document.querySelector('#output');
const button = form.querySelector('button[type="submit"]');

function parseDestination(value) {
  const input = value.trim();
  if (!input) return null;
  try {
    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`;
    const parsed = new URL(candidate);
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname) return parsed.href;
  } catch (_) {}
  return null;
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = searchInput.value.trim();
  const destination = parseDestination(value);
  if (destination) {
    urlInput.value = destination;
    form.requestSubmit();
    return;
  }
  if (value) {
    // Search URL is intentionally configurable rather than accepting an arbitrary
    // redirect target from the client. The proxy itself still validates destinations.
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(value)}`;
    urlInput.value = searchUrl;
    form.requestSubmit();
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = parseDestination(urlInput.value);
  if (!url) {
    result.hidden = false;
    status.textContent = 'Invalid URL';
    output.textContent = 'Enter a valid http:// or https:// URL.';
    return;
  }
  const method = document.querySelector('#method').value;
  const body = document.querySelector('#body').value;
  button.disabled = true;
  button.textContent = 'Sending…';
  result.hidden = false;
  status.textContent = '';
  output.textContent = 'Loading…';
  try {
    const options = { method };
    if (body && method !== 'GET' && method !== 'DELETE') {
      options.body = body;
      options.headers = { 'Content-Type': 'application/json' };
    }
    const response = await fetch(`/proxy?url=${encodeURIComponent(url)}`, options);
    const text = await response.text();
    status.textContent = `${response.status} ${response.statusText}`;
    output.textContent = text || '(empty response)';
  } catch (error) {
    status.textContent = 'Request failed';
    output.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Send request';
  }
});
