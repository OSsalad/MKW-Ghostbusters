function renderPair(stage, data = {}) {
  const root = document.getElementById('pairing-ui');
  root.hidden = false;
  if (stage === 'display') {
    root.innerHTML = `
      <h2>Pairing — share this PIN</h2>
      <p>Tell your friend to type this PIN on their machine:</p>
      <div class="pin">${data.pin}</div>`;
  } else if (stage === 'enter') {
    const who = data.initiator ? `<code>${data.initiator}</code> wants to pair with you.` : '';
    root.innerHTML = `
      <h2>Enter the 6-digit PIN your friend is showing</h2>
      <p>${who}</p>
      <input id="pin-input" maxlength="6" inputmode="numeric" autocomplete="off" autofocus>
      <button id="pin-submit">Confirm</button>
      <div id="pin-status"></div>`;
    setTimeout(() => { const el = document.getElementById('pin-input'); if (el) el.focus(); }, 50);
    document.getElementById('pin-submit').addEventListener('click', async () => {
      const pin = document.getElementById('pin-input').value.trim();
      const status = document.getElementById('pin-status');
      status.textContent = 'Pairing...';
      const r = await window.api.enterPin(pin);
      status.textContent = r.ok ? 'Paired!' : `Failed: ${r.reason || 'unknown'}`;
    });
  } else if (stage === 'paired') {
    const uuid = data.peerUuid || '';
    root.innerHTML = `
      <h2>Paired! 🎉</h2>
      <p>What do you want to call this friend?</p>
      <input id="nick-input" maxlength="64" placeholder="e.g. ${uuid.slice(0, 8)}" autocomplete="off" autofocus>
      <div style="margin-top:8px; display:flex; gap:8px;">
        <button id="nick-save">Save</button>
        <button id="nick-skip" class="secondary">Skip</button>
      </div>
      <div id="nick-status" style="margin-top:8px; color:var(--muted); font-size:12px;"></div>`;
    setTimeout(() => { const el = document.getElementById('nick-input'); if (el) el.focus(); }, 50);
    document.getElementById('nick-save').onclick = async () => {
      const name = document.getElementById('nick-input').value.trim();
      if (!name) { document.getElementById('nick-skip').click(); return; }
      const r = await window.api.settings.setNickname(uuid, name);
      if (r.ok) {
        document.getElementById('nick-status').textContent = 'Saved.';
        setTimeout(() => { root.hidden = true; root.innerHTML = ''; }, 800);
      } else {
        document.getElementById('nick-status').textContent = `Failed: ${r.reason}`;
      }
    };
    document.getElementById('nick-skip').onclick = () => {
      root.hidden = true; root.innerHTML = '';
    };
  } else if (stage === 'failed') {
    root.innerHTML = `<h2>Pairing failed: ${data.reason || 'unknown'}</h2>`;
  }
}
