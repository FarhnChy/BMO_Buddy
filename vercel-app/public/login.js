const loginPanel = document.querySelector('#login-panel');
const appContent = document.querySelector('#app-content');
function showSignIn() {
  stopScanner(); appContent.hidden = true; loginPanel.hidden = false;
}
function showApp() {
  loginPanel.hidden = true; appContent.hidden = false;
  document.dispatchEvent(new Event('bmo:signed-in'));
}
document.addEventListener('bmo:signed-out', showSignIn);
document.querySelector('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  const password = document.querySelector('#login-password');
  const message = document.querySelector('#login-message');
  button.disabled = true; message.textContent = 'Signing in...';
  try {
    const response = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:password.value}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Sign-in failed.');
    password.value = ''; message.textContent = ''; showApp();
  } catch(error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});
document.querySelector('#sign-out').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/logout', { method:'POST' });
    if (!response.ok) throw new Error('Sign-out failed.');
    state.inventory = []; document.querySelector('#inventory').replaceChildren(); showSignIn();
  } catch(error) { setMessage(error.message, true); }
});
fetch('/api/session').then(r => { if (!r.ok) throw new Error('The app is not ready.'); return r.json(); })
  .then(result => result.signed_in ? showApp() : showSignIn())
  .catch(error => { showSignIn(); document.querySelector('#login-message').textContent = error.message; });
