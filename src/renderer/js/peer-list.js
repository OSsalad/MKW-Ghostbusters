function renderPeerList(peers) {
  const root = document.getElementById('peer-list');
  if (!root) return;
  if (!peers || peers.length === 0) {
    root.innerHTML = `
      <h3 style="margin:0 0 8px 0; color:var(--muted); text-transform:uppercase; font-size:11px;">Available friends</h3>
      <p style="color:var(--muted); font-size:13px;">Searching for friends on your LAN... If your friend's app is running but doesn't show up, set their IP in <a href="#" id="open-settings">Settings</a>.</p>`;
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
    const action = p.paired
      ? '<span style="color:var(--muted); font-size:12px;">Already paired</span>'
      : `<button data-i="${i}" class="pair-btn">Pair</button>`;
    return `
      <div class="peer-row">
        <div>
          <strong>${label}</strong> ${tag} ${pairedTag}
          <div style="color:var(--muted); font-size:11px;">${(p.addresses && p.addresses[0]) || p.host}:${p.port}</div>
        </div>
        <div>${action}</div>
      </div>`;
  }).join('');
  root.innerHTML = `
    <h3 style="margin:0 0 8px 0; color:var(--muted); text-transform:uppercase; font-size:11px;">Available friends</h3>
    ${rows}`;
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
