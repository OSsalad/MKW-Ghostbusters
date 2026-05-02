let _receivedCache = [];

async function renderReceivedList() {
  const root = document.getElementById('received-list');
  if (!root) return;
  const items = await window.api.listReceived();
  _receivedCache = items;
  if (!items || items.length === 0) {
    root.innerHTML = `
      <h3 class="section-title">Received ghosts (0/32)</h3>
      <p style="color:var(--muted);">Nothing yet. Ghosts your friends send you will appear here.</p>`;
    return;
  }
  items.sort((a, b) => (b.receivedAt || '').localeCompare(a.receivedAt || ''));
  const rows = items.map(g => {
    const date = g.receivedAt ? new Date(g.receivedAt).toLocaleString() : '—';
    return `
      <tr data-slot="${g.slot}" data-track="${g.trackId}" data-expanded="0">
        <td>${g.trackName}</td>
        <td>${g.timeStr}</td>
        <td>${g.senderName}</td>
        <td style="color:var(--muted); font-size:var(--fs-xs);">${date}</td>
        <td><button data-slot="${g.slot}" class="del-ghost secondary" onclick="event.stopPropagation()">Delete</button></td>
      </tr>`;
  }).join('');
  root.innerHTML = `
    <h3 class="section-title">Received ghosts (${items.length}/32)</h3>
    <table>
      <thead><tr><th>Track</th><th>Time</th><th>From</th><th>Received</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  root.querySelectorAll('.del-ghost').forEach(btn => {
    btn.onclick = async () => {
      const slot = Number(btn.dataset.slot);
      if (!confirm('Delete this ghost?')) return;
      btn.disabled = true;
      const r = await window.api.deleteReceived(slot);
      if (!r.ok) {
        btn.disabled = false;
        if (r.reason === 'locked') alert('Save file is locked — close Dolphin and try again.');
        else alert(`Delete failed: ${r.reason || 'unknown'}`);
      }
    };
  });
  root.querySelectorAll('tbody tr[data-slot]').forEach(tr => {
    tr.addEventListener('click', () => {
      const slot = Number(tr.dataset.slot);
      toggleGhostDetail(tr, async () => _receivedCache.find(g => g.slot === slot));
    });
  });
}
