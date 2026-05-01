function renderSlotManager(data) {
  const root = document.getElementById('slot-manager');
  root.hidden = false;
  const required = data.required;
  const rows = data.currentDownloads.map(d => `
    <tr>
      <td><input type="checkbox" data-slot="${d.slot}"></td>
      <td>${d.trackName || `track ${d.trackId}`}</td>
      <td>${d.timeStr}</td>
    </tr>`).join('');
  root.innerHTML = `
    <h2>Make room for incoming ghosts</h2>
    <p>Your Downloaded slot is full. Remove at least <strong>${required}</strong> ghost${required > 1 ? 's' : ''} to import.</p>
    <table>
      <thead><tr><th></th><th>Track</th><th>Time</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:12px; display:flex; gap:8px;">
      <button id="bk-and-remove">Backup & remove</button>
      <button id="rm-only" class="secondary">Remove without backup</button>
      <button id="cancel-import" class="secondary">Cancel import</button>
    </div>`;

  const sel = () => Array.from(root.querySelectorAll('input:checked'))
    .map(cb => Number(cb.dataset.slot));

  const finish = (result) => { root.hidden = true; root.innerHTML = ''; return result; };

  document.getElementById('bk-and-remove').onclick = async () => {
    if (sel().length < required) {
      alert(`Select at least ${required} ghost(s) to remove.`);
      return;
    }
    const r = await window.api.decideOffer(data.id, true, { slotsToFree: sel(), backup: true });
    setOfferStatus(r.ok ? 'Imported.' : `Failed: ${r.reason || 'unknown'}`);
    finish(r);
  };
  document.getElementById('rm-only').onclick = async () => {
    if (sel().length < required) {
      alert(`Select at least ${required} ghost(s) to remove.`);
      return;
    }
    if (!confirm(`Permanently delete ${sel().length} ghost(s) without backup?`)) return;
    const r = await window.api.decideOffer(data.id, true, { slotsToFree: sel(), backup: false });
    setOfferStatus(r.ok ? 'Imported.' : `Failed: ${r.reason || 'unknown'}`);
    finish(r);
  };
  document.getElementById('cancel-import').onclick = async () => {
    await window.api.decideOffer(data.id, false);
    setOfferStatus('Import canceled.');
    finish({ ok: false });
  };
}

function setOfferStatus(msg) {
  const el = document.getElementById('offer-status');
  if (el) el.textContent = msg;
}
