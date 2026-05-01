// Shared detail-card renderer. Given a ghost record (from listPbs or
// listReceived) and an optional comparison ({myTime, friends}), produces
// a panel with vehicle/character/mii info, lap splits, and a delta chart.

function fmtDelta(ms) {
  if (ms === 0) return '±0.000s';
  const sign = ms < 0 ? '−' : '+';
  const abs = Math.abs(ms);
  return `${sign}${(abs / 1000).toFixed(3)}s`;
}

function lapDeltaBars(myLaps, friendLaps) {
  if (!myLaps || !friendLaps) return '';
  const n = Math.min(myLaps.length, friendLaps.length);
  if (n === 0) return '';
  const deltas = [];
  let maxAbs = 1;
  for (let i = 0; i < n; i++) {
    const d = myLaps[i].timeMs - friendLaps[i].timeMs;
    deltas.push(d);
    if (Math.abs(d) > maxAbs) maxAbs = Math.abs(d);
  }
  const rows = deltas.map((d, i) => {
    const pct = (Math.abs(d) / maxAbs) * 100;
    const color = d < 0 ? '#34c759' : d > 0 ? '#ff453a' : '#888';
    const side = d < 0 ? 'right: 50%;' : 'left: 50%;';
    return `
      <div style="display:flex; align-items:center; gap:8px; margin:3px 0;">
        <div style="width:48px; color:var(--muted); font-size:11px;">Lap ${i + 1}</div>
        <div style="flex:1; height:14px; background:var(--border); position:relative; border-radius:2px;">
          <div style="position:absolute; top:0; bottom:0; left:50%; width:1px; background:#666;"></div>
          <div style="position:absolute; top:0; bottom:0; ${side} width:${pct / 2}%; background:${color}; border-radius:2px;"></div>
        </div>
        <div style="width:80px; text-align:right; color:${color}; font-size:11px;">${fmtDelta(d)}</div>
      </div>`;
  }).join('');
  return `
    <div style="margin-top:8px; padding:8px; background:var(--bg); border-radius:4px;">
      <div style="font-size:11px; color:var(--muted); margin-bottom:4px;">Per-lap delta (you vs friend; green = you faster)</div>
      ${rows}
    </div>`;
}

function ghostDetailHtml(g, comparison) {
  const lapList = (g.lapTimes || []).map((lt, i) =>
    `<li>Lap ${i + 1} — <code>${lt.timeStr}</code></li>`
  ).join('');
  let comparisonHtml = '';
  if (comparison && comparison.friends && comparison.friends.length) {
    const myLaps = comparison.myTime && comparison.myTime.lapTimes;
    const friendBlocks = comparison.friends.map(f => {
      const delta = comparison.myTime ? f.timeMs - comparison.myTime.timeMs : null;
      const deltaHtml = delta !== null
        ? `<span style="color:${delta > 0 ? '#34c759' : delta < 0 ? '#ff453a' : '#888'};"> (${fmtDelta(delta)} vs you)</span>`
        : '';
      return `
        <div style="margin-top:6px;">
          <strong>${f.senderName}</strong>: <code>${f.timeStr}</code>${deltaHtml}
          ${myLaps && f.lapTimes ? lapDeltaBars(myLaps, f.lapTimes) : ''}
        </div>`;
    }).join('');
    comparisonHtml = `
      <div style="margin-top:12px; padding-top:12px; border-top:1px dashed var(--border);">
        <strong style="font-size:12px; text-transform:uppercase; color:var(--muted);">Friend times</strong>
        ${friendBlocks}
      </div>`;
  }
  return `
    <div class="ghost-detail" style="padding:12px; background:var(--border); border-radius:6px; margin:6px 0;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:13px;">
        <div><span style="color:var(--muted);">Vehicle:</span> ${g.vehicle || '—'}</div>
        <div><span style="color:var(--muted);">Character:</span> ${g.character || '—'}</div>
        <div><span style="color:var(--muted);">Mii name:</span> ${g.miiName || '—'}</div>
        <div><span style="color:var(--muted);">Total:</span> <code>${g.timeStr}</code></div>
      </div>
      ${lapList ? `<ul style="margin:8px 0 0 0; padding-left:20px; font-size:12px;">${lapList}</ul>` : ''}
      ${comparisonHtml}
    </div>`;
}

async function toggleGhostDetail(rowEl, getRecord) {
  const next = rowEl.nextElementSibling;
  if (next && next.classList.contains('ghost-detail-row')) {
    next.remove();
    rowEl.dataset.expanded = '0';
    return;
  }
  // Close other open details in the same table
  rowEl.parentElement.querySelectorAll('.ghost-detail-row').forEach(el => el.remove());
  rowEl.parentElement.querySelectorAll('tr[data-expanded="1"]').forEach(el => { el.dataset.expanded = '0'; });

  const g = await getRecord();
  let comparison = null;
  if (typeof g.trackId === 'number') {
    try { comparison = await window.api.compareTrack(g.trackId); } catch (_) {}
  }
  const detail = document.createElement('tr');
  detail.className = 'ghost-detail-row';
  const cell = document.createElement('td');
  cell.colSpan = rowEl.children.length;
  cell.innerHTML = ghostDetailHtml(g, comparison);
  detail.appendChild(cell);
  rowEl.after(detail);
  rowEl.dataset.expanded = '1';
}
