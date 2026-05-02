let _pbsCache = [];

async function renderTrackPicker() {
  const root = document.getElementById('track-picker');
  const pbs = await window.api.listPbs();
  _pbsCache = pbs;
  if (pbs.length === 0) {
    root.innerHTML = '<p>No PBs found. Configure save path in Settings, or play a track in Dolphin first.</p>';
    document.getElementById('btn-send').disabled = true;
    return;
  }
  pbs.sort((a, b) => a.trackId - b.trackId);

  // Fetch per-track comparison data so we can show inline deltas.
  const comparisons = {};
  await Promise.all(pbs.map(async p => {
    try { comparisons[p.trackId] = await window.api.compareTrack(p.trackId); } catch (_) {}
  }));

  const rows = pbs.map(p => {
    const cmp = comparisons[p.trackId];
    let badge = '';
    if (cmp && cmp.friends && cmp.friends.length) {
      const best = cmp.friends.reduce((a, b) => a.timeMs < b.timeMs ? a : b);
      // Racing convention: negative = you ahead, positive = you behind.
      const delta = p.timeMs - best.timeMs;
      const color = delta < 0 ? 'var(--ok)' : delta > 0 ? 'var(--bad)' : 'var(--muted)';
      const sign = delta < 0 ? '−' : delta > 0 ? '+' : '±';
      const abs = Math.abs(delta);
      badge = `<span style="margin-left:8px; padding:2px 6px; background:var(--border); border-radius:3px; font-size:11px; color:${color};">
        vs ${best.senderName} ${sign}${(abs / 1000).toFixed(3)}s
      </span>`;
    }
    return `
      <tr data-track="${p.trackId}" data-slot="${p.slot}" data-expanded="0">
        <td><input type="checkbox" data-slot="${p.slot}" data-track="${p.trackId}" data-nopropagate></td>
        <td>${p.trackName}${badge}</td>
        <td>${p.timeStr}</td>
      </tr>`;
  }).join('');
  root.innerHTML = `<table>
    <thead><tr><th></th><th>Track</th><th>PB Time</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  root.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', updateSendButton);
    cb.addEventListener('click', (e) => e.stopPropagation());
  });
  // Click anywhere on the row except the checkbox to expand the detail card.
  root.querySelectorAll('tbody tr[data-track]').forEach(tr => {
    tr.addEventListener('click', () => {
      const trackId = Number(tr.dataset.track);
      const slot = Number(tr.dataset.slot);
      toggleGhostDetail(tr, async () => _pbsCache.find(p => p.slot === slot));
    });
  });
  updateSendButton();
}

function selectedPbs() {
  return Array.from(document.querySelectorAll('#track-picker input:checked'))
    .map(cb => ({ slot: Number(cb.dataset.slot), trackId: Number(cb.dataset.track) }));
}

function updateSendButton() {
  document.getElementById('btn-send').disabled = selectedPbs().length === 0;
}
