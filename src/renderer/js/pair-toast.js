window.toast.onInitiator((d) => {
  const who = document.getElementById('who');
  if (who) who.textContent = `${d.initiator || 'Someone'} wants to pair with you.`;
});

const pin = document.getElementById('pin');
const submit = document.getElementById('submit');
const cancel = document.getElementById('cancel');
const status = document.getElementById('status');

setTimeout(() => pin && pin.focus(), 80);

async function confirm() {
  const value = pin.value.trim();
  if (!/^\d{6}$/.test(value)) {
    status.textContent = 'Enter the 6-digit PIN your friend is showing.';
    return;
  }
  submit.disabled = true;
  cancel.disabled = true;
  status.textContent = 'Pairing...';
  const r = await window.toast.submit(value);
  if (r && r.ok) {
    status.textContent = '✓ Paired!';
    setTimeout(() => window.toast.close(), 1000);
  } else {
    submit.disabled = false;
    cancel.disabled = false;
    status.textContent = `Failed: ${r && r.reason ? r.reason : 'unknown'}`;
  }
}

submit.addEventListener('click', confirm);
pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirm(); });
cancel.addEventListener('click', () => window.toast.cancel());
