function renderPeerList(peers) {
  const root = document.getElementById('peer-list');
  if (!root) return;
  if (!peers || peers.length === 0) {
    root.innerHTML = `
      <h3 class="section-title">Available friends</h3>
      <p style="color:var(--muted);">Searching for friends on your LAN... If your friend's app is running but doesn't show up, set their IP in <a href="#" id="open-settings">Settings</a>.</p>`;
    const link = document.getElementById('open-settings');
    if (link) link.onclick = (e) => { e.preventDefault(); renderSettings(); };
    return;
  }
  const rows = peers.map((p, i) => {
    const label = p.host || (p.uuid && p.uuid.slice(0, 8)) || 'unknown';
    const tag = p.via === 'manual' ? '<span class="peer-tag">manual</span>'
      : p.via === 'mdns' ? '<span class="peer-tag">auto</span>'
      : '';
    const pairedTag = p.paired ? '<span class="peer-tag paired">paired</span>' : '';
    const pairBtn = p.paired ? '' : `<button data-i="${i}" class="pair-btn">Pair</button>`;
    const testBtn = `<button data-i="${i}" class="test-btn ghost">Test</button>`;
    return `
      <div class="peer-row">
        <div>
          <strong>${label}</strong> ${tag} ${pairedTag}
          <div style="color:var(--muted); font-size:var(--fs-xs); margin-top:2px;">${(p.addresses && p.addresses[0]) || p.host}:${p.port}</div>
          <div class="probe-status" data-i="${i}" style="margin-top:4px; font-size:var(--fs-xs); color:var(--muted);"></div>
        </div>
        <div class="row-actions">${testBtn} ${pairBtn}</div>
      </div>`;
  }).join('');
  root.innerHTML = `
    <h3 class="section-title">Available friends</h3>
    ${rows}`;
  root.querySelectorAll('.test-btn').forEach(btn => {
    btn.onclick = async () => {
      const peer = peers[Number(btn.dataset.i)];
      const status = root.querySelector(`.probe-status[data-i="${btn.dataset.i}"]`);
      btn.disabled = true;
      btn.textContent = 'Testing...';
      const r = await window.api.probePeer({
        host: (peer.addresses && peer.addresses[0]) || peer.host,
        port: peer.port,
      });
      btn.disabled = false;
      btn.textContent = 'Test';
      if (r.ok) {
        status.textContent = '✓ reachable';
        status.style.color = 'var(--ok)';
      } else {
        status.textContent = `✗ ${r.reason || 'unreachable'}`;
        status.style.color = 'var(--bad)';
      }
    };
  });
  root.querySelectorAll('.pair-btn').forEach(btn => {
    btn.onclick = async () => {
      const peer = peers[Number(btn.dataset.i)];
      btn.disabled = true;
      btn.textContent = 'Pairing...';
      const r = await window.api.initiatePair({
        uuid: peer.uuid,
        host: (peer.addresses && peer.addresses[0]) || peer.host,
        port: peer.port,
        via: peer.via,
      });
      if (!r.ok) {
        btn.disabled = false;
        btn.textContent = 'Pair';
        alert(`Pair failed: ${r.reason || 'unknown'}`);
      }
    };
  });
}
