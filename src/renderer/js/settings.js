function updateStatusLine(s) {
  if (!s) return '<span style="color:var(--muted);">No check yet</span>';
  if (s.status === 'checking') return '<span style="color:var(--muted);">Checking...</span>';
  if (s.status === 'downloading') {
    const pct = s.progress ? Math.floor(s.progress.percent) : 0;
    return `<span style="color:#ffd400;">Downloading update ${s.remoteVersion}: ${pct}%</span>`;
  }
  if (s.status === 'ready') {
    return `<span style="color:#34c759;">Update ${s.remoteVersion} downloaded — restart to install.</span>`;
  }
  if (s.hasUpdate) return `<span style="color:#ffd400;">Update ${s.remoteVersion} available (you have ${s.currentVersion}).</span>`;
  if (s.status === 'error') return `<span style="color:#ff453a;">Update error: ${s.error || 'unknown'}</span>`;
  if (s.lastChecked) return `<span style="color:var(--muted);">Up to date (checked ${new Date(s.lastChecked).toLocaleString()})</span>`;
  return '<span style="color:var(--muted);">No check yet</span>';
}

async function renderSettings() {
  hideAllViews();
  const root = document.getElementById('settings-view');
  root.hidden = false;
  const s = await window.api.settings.get();
  const peerData = await Promise.all(s.pairedPeers.map(async p => p));
  const peers = s.pairedPeers.length === 0
    ? '<em>No paired peers yet.</em>'
    : '<table style="width:100%;"><thead><tr><th>UUID</th><th>Host</th><th>Nickname</th><th></th></tr></thead><tbody>' +
      s.pairedPeers.map(p => {
        const nick = (p.nickname || '').replace(/"/g, '&quot;');
        return `<tr>
          <td><code>${p.uuid.slice(0, 8)}</code></td>
          <td style="color:var(--muted); font-size:12px;">${p.lastHost || '—'}</td>
          <td><input class="nick-edit" data-uuid="${p.uuid}" value="${nick}" placeholder="(no nickname)" style="width:100%; padding:4px;"></td>
          <td><button class="nick-save-btn secondary" data-uuid="${p.uuid}">Save</button></td>
        </tr>`;
      }).join('') + '</tbody></table>';
  const peerStatus = s.peerConnected
    ? `Connected (via ${s.peerVia || 'unknown'})`
    : 'Not connected';

  root.innerHTML = `
    <h2>Settings</h2>

    <div class="settings-row">
      <label>Dolphin save file</label>
      <div class="settings-value">${s.savePath || '<em>not configured</em>'}</div>
      <div style="display:flex; gap:8px;">
        <button id="set-auto">Auto-detect</button>
        <button id="set-browse" class="secondary">Browse...</button>
      </div>
    </div>

    <div class="settings-row">
      <label>Your address</label>
      <div class="settings-value">
        ${s.localAddress ? `<code>${s.localAddress}</code> &nbsp; <small>(read this to your friend if auto-discovery isn't working)</small>` : '<em>could not detect LAN IP</em>'}
      </div>
      <div></div>
    </div>

    <div class="settings-row">
      <label>Friend's address</label>
      <div class="settings-value">
        <input id="set-manual" type="text" placeholder="e.g. 192.168.1.42:54321"
               value="${s.manualPeer || ''}" style="width:100%; padding:6px;">
        <small style="color:var(--muted);">Optional — fills in if auto-discovery (mDNS) doesn't find your friend. Status: ${peerStatus}</small>
      </div>
      <div style="display:flex; gap:8px;">
        <button id="set-manual-save">Save</button>
        <button id="set-manual-clear" class="secondary">Clear</button>
      </div>
    </div>

    <div class="settings-row">
      <label>Your device ID</label>
      <div class="settings-value"><code>${s.uuid}</code></div>
    </div>

    <div class="settings-row">
      <label>Backup folder</label>
      <div class="settings-value"><code>${s.backupDir}</code></div>
    </div>

    <div class="settings-row">
      <label>Paired peers</label>
      <div class="settings-value"><ul>${peers}</ul></div>
      <div><button id="set-forget" class="secondary">Forget all peers</button></div>
    </div>

    <div class="settings-row">
      <label>Auto-share new PBs</label>
      <div class="settings-value">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="set-autoshare" ${s.autoShareEnabled ? 'checked' : ''}>
          <span>Automatically send new PBs to all paired friends as soon as they're set</span>
        </label>
      </div>
      <div></div>
    </div>

    <div class="settings-row">
      <label>Updates</label>
      <div class="settings-value">
        <div style="font-size:13px;">${updateStatusLine(s.updateState)}</div>
        <small style="color:var(--muted);">Updates are pulled from the GitHub repo automatically. Checked every 6h on launch.</small>
      </div>
      <div style="display:flex; gap:8px;">
        <button id="set-update-check" class="secondary">Check now</button>
      </div>
    </div>

    <div style="margin-top:24px;">
      <button id="set-back">Back</button>
    </div>`;

  document.getElementById('set-auto').onclick = async () => {
    const r = await window.api.settings.autoDetect();
    if (!r.ok) alert('Could not auto-detect rksys.dat. Use Browse instead.');
    renderSettings();
  };
  document.getElementById('set-browse').onclick = async () => {
    const r = await window.api.settings.pickSavePath();
    if (r.ok) renderSettings();
  };
  document.getElementById('set-manual-save').onclick = async () => {
    const val = document.getElementById('set-manual').value.trim();
    const r = await window.api.settings.setManualPeer(val);
    if (!r.ok) { alert(`Couldn't save: ${r.reason}`); return; }
    renderSettings();
  };
  document.getElementById('set-manual-clear').onclick = async () => {
    await window.api.settings.setManualPeer(null);
    renderSettings();
  };
  root.querySelectorAll('.nick-save-btn').forEach(btn => {
    btn.onclick = async () => {
      const uuid = btn.dataset.uuid;
      const input = root.querySelector(`.nick-edit[data-uuid="${uuid}"]`);
      const r = await window.api.settings.setNickname(uuid, input.value);
      if (!r.ok) alert(`Couldn't save: ${r.reason}`);
      else renderSettings();
    };
  });

  document.getElementById('set-forget').onclick = async () => {
    if (!confirm('Forget all paired peers? You and your friend will need to re-pair.')) return;
    await window.api.settings.forgetPeers();
    renderSettings();
  };
  document.getElementById('set-autoshare').onchange = async (e) => {
    await window.api.settings.setAutoShare(e.target.checked);
  };
  document.getElementById('set-update-check').onclick = async () => {
    const r = await window.api.update.check();
    if (!r.ok) alert(`Couldn't check: ${r.reason}`);
  };
  document.getElementById('set-back').onclick = () => {
    showMainView();
  };
}

async function renderOnboarding() {
  hideAllViews();
  const root = document.getElementById('onboarding-view');
  root.hidden = false;
  const s = await window.api.settings.get();
  if (s.savePath) { showMainView(); return; }

  root.innerHTML = `
    <h2>Welcome to MKW Ghostbusters!</h2>
    <p>To get started, point the app to your Dolphin <code>rksys.dat</code>.</p>
    <p>It usually lives somewhere like<br>
      <code>C:\\Users\\you\\AppData\\Roaming\\Dolphin Emulator\\Wii\\title\\00010004\\&lt;game&gt;\\data\\rksys.dat</code></p>
    <div style="display:flex; gap:8px; margin-top:16px;">
      <button id="onb-auto">Try auto-detect</button>
      <button id="onb-browse" class="secondary">Browse...</button>
    </div>
    <p id="onb-status" style="margin-top:12px; color:var(--muted);"></p>`;

  document.getElementById('onb-auto').onclick = async () => {
    const status = document.getElementById('onb-status');
    status.textContent = 'Searching...';
    const r = await window.api.settings.autoDetect();
    if (r.ok) {
      status.textContent = `Found: ${r.savePath}`;
      setTimeout(showMainView, 1000);
    } else {
      status.textContent = 'Could not find rksys.dat automatically. Use Browse to pick it.';
    }
  };
  document.getElementById('onb-browse').onclick = async () => {
    const r = await window.api.settings.pickSavePath();
    if (r.ok) showMainView();
  };
}

function hideAllViews() {
  ['onboarding-view', 'settings-view', 'main-view'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });
  const footer = document.getElementById('main-footer');
  if (footer) footer.hidden = true;
}

function showMainView() {
  hideAllViews();
  document.getElementById('main-view').hidden = false;
  const footer = document.getElementById('main-footer');
  if (footer) footer.hidden = false;
  if (typeof renderTrackPicker === 'function') renderTrackPicker();
}
