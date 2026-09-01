const form = document.querySelector('#proxy-form');
const result = document.querySelector('#result');
const status = document.querySelector('#status');
const output = document.querySelector('#output');
const button = form.querySelector('button');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = document.querySelector('#url').value.trim();
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
