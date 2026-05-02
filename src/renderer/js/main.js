function renderIncoming(offer) {
  const root = document.getElementById('incoming-offers');
  let row = document.getElementById(`incoming-${offer.id}`);
  if (row) return; // already rendered
  row = document.createElement('div');
  row.id = `incoming-${offer.id}`;
  row.style.cssText = 'padding:12px; margin:8px 0; background:var(--border); border-radius:6px;';
  const senderLabel = offer.senderName || (offer.senderUuid || '').slice(0, 8);
  const tracksHtml = (offer.tracks && offer.tracks.length)
    ? `<ul style="margin:6px 0 0 0; padding-left:20px;">${
        offer.tracks.map(t => `<li>${t.trackName} — <code>${t.timeStr}</code></li>`).join('')
      }</ul>`
    : '';
  row.innerHTML = `
    <strong>${senderLabel}</strong> wants to send ${offer.count} ghost${offer.count > 1 ? 's' : ''}:
    ${tracksHtml}
    <div style="margin-top:8px; display:flex; gap:8px;">
      <button data-action="accept">Accept</button>
      <button data-action="reject" class="secondary">Reject</button>
    </div>`;
  root.appendChild(row);
  row.querySelector('[data-action=accept]').onclick = async () => {
    row.querySelector('[data-action=accept]').disabled = true;
    row.querySelector('[data-action=reject]').disabled = true;
    const r = await window.api.decideOffer(offer.id, true);
    if (r.ok) {
      row.remove();
      const label = offer.senderName || (offer.senderUuid || '').slice(0, 8);
      if (r.deferred) {
        setOfferStatus(`Queued ${offer.count} ghost(s) from ${label} — will import when Dolphin closes.`);
      } else {
        setOfferStatus(`Imported ${offer.count} ghost(s) from ${label}.`);
      }
      renderReceivedList();
    } else if (r.reason === 'needs-room') {
      // slot-manager will render via onOfferNeedsRoom
    } else if (r.reason === 'locked') {
      // lock-blocked handler renders Retry
    } else if (r.reason === 'unknown id') {
      row.remove();
      setOfferStatus('That offer expired before you accepted (5 min timeout). Ask your friend to resend.');
    } else {
      row.querySelector('[data-action=accept]').disabled = false;
      row.querySelector('[data-action=reject]').disabled = false;
      setOfferStatus(`Accept failed: ${r.reason || 'unknown'}`);
    }
  };
  row.querySelector('[data-action=reject]').onclick = async () => {
    await window.api.decideOffer(offer.id, false);
    row.remove();
    setOfferStatus(`Rejected offer from ${offer.senderName || (offer.senderUuid || '').slice(0,8)}.`);
  };
}

function setOfferStatus(msg) {
  document.getElementById('offer-status').textContent = msg;
}

function renderDeferred(list) {
  const root = document.getElementById('deferred-list');
  if (!root) return;
  if (!list || list.length === 0) { root.innerHTML = ''; return; }
  const total = list.reduce((acc, x) => acc + x.ghostCount, 0);
  root.innerHTML = `
    <div class="banner warn">
      <span>⏳ ${total} ghost${total > 1 ? 's' : ''} queued — will import automatically the moment you close Dolphin.</span>
    </div>`;
}

async function init() {
  // peer-status was removed from the header; the peer-list section now
  // surfaces discovered/manual peers directly. Keep the listener as a
  // no-op to avoid unhandled IPC.
  window.api.onPeerStatus(() => {});

  window.api.onPairStatus((s) => renderPair(s.stage, s));
  window.api.onSaveChanged(() => renderTrackPicker());
  window.api.onOfferIncoming((d) => renderIncoming(d));
  window.api.onOfferExpired((d) => {
    const row = document.getElementById(`incoming-${d.id}`);
    if (row) {
      row.remove();
      setOfferStatus('Offer expired (5 min timeout). Ask your friend to resend.');
    }
  });
  window.api.onOfferNeedsRoom((d) => renderSlotManager(d));
  function showRetry(data, message) {
    const status = document.getElementById('offer-status');
    status.innerHTML = `${message} <button id="retry-${data.id}">Retry</button>`;
    document.getElementById(`retry-${data.id}`).onclick = async () => {
      status.textContent = 'Retrying...';
      const r = await window.api.decideOffer(data.id, true);
      if (r.ok) status.textContent = 'Imported.';
      else if (r.reason === 'locked') showRetry(data, 'Still locked.');
      else status.textContent = `Failed: ${r.reason || 'unknown'}`;
    };
  }
  window.api.onOfferLockBlocked((data) => {
    showRetry(data, 'Save file is locked (Dolphin open?).');
  });

  document.getElementById('btn-settings').addEventListener('click', () => renderSettings());

  document.getElementById('btn-send').addEventListener('click', async () => {
    const btn = document.getElementById('btn-send');
    const slots = Array.from(document.querySelectorAll('#track-picker input:checked'))
      .map(cb => ({ slot: Number(cb.dataset.slot), trackId: Number(cb.dataset.track) }));
    const target = document.getElementById('send-target').value;
    const targetUuid = target === '__primary__' ? null : target;

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.classList.remove('is-success', 'is-error');
    btn.classList.add('is-sending');
    btn.textContent = 'Sending ghost...';
    setOfferStatus(`Sending ${slots.length} ghost${slots.length > 1 ? 's' : ''}...`);

    const r = await window.api.sendPbsTo(slots, targetUuid);
    btn.classList.remove('is-sending');

    let success = false;
    if (target === '__all__') {
      success = !!r.ok;
      setOfferStatus(r.summary || (r.ok ? 'Sent to everyone.' : 'No friends accepted.'));
    } else if (r.ok) {
      success = true;
      setOfferStatus('Friend imported the ghost(s).');
    } else if (r.status === 403) {
      setOfferStatus('Friend rejected the offer.');
    } else {
      setOfferStatus(`Send failed: ${r.reason || r.status}`);
    }

    btn.classList.add(success ? 'is-success' : 'is-error');
    btn.textContent = success ? 'Sent!' : 'Failed';
    setTimeout(() => {
      btn.classList.remove('is-success', 'is-error');
      btn.textContent = originalText;
      btn.disabled = false;
      updateSendButton();
    }, 1500);
  });

  // Populate send-target dropdown from paired peers.
  async function refreshSendTarget() {
    const sel = document.getElementById('send-target');
    if (!sel) return;
    const settings = await window.api.settings.get();
    const prev = sel.value;
    const opts = ['<option value="__primary__">First connected friend</option>'];
    if (settings.pairedPeers.length > 1) {
      opts.push('<option value="__all__">All paired friends</option>');
    }
    for (const p of settings.pairedPeers) {
      const label = p.nickname || p.uuid.slice(0, 8);
      opts.push(`<option value="${p.uuid}">${label}</option>`);
    }
    sel.innerHTML = opts.join('');
    if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
  }
  refreshSendTarget();
  window.api.onPeersChanged(() => refreshSendTarget());

  // Update banner: morphs through available → downloading → ready states.
  function applyUpdateState(s) {
    const banner = document.getElementById('update-banner');
    const textEl = document.getElementById('update-banner-text');
    const dlBtn = document.getElementById('update-download');
    const dismissBtn = document.getElementById('update-dismiss');
    if (!s || !s.hasUpdate) { banner.hidden = true; return; }
    banner.hidden = false;
    if (s.status === 'downloading') {
      const pct = s.progress ? Math.floor(s.progress.percent) : 0;
      const mb = s.progress ? (s.progress.transferred / 1024 / 1024).toFixed(1) : '0';
      const total = s.progress ? (s.progress.total / 1024 / 1024).toFixed(1) : '?';
      textEl.textContent = `Downloading ${s.remoteVersion}: ${pct}% (${mb} / ${total} MB)`;
      dlBtn.disabled = true;
      dlBtn.textContent = 'Downloading...';
      dismissBtn.style.display = 'none';
    } else if (s.status === 'ready') {
      textEl.textContent = `Update ${s.remoteVersion} downloaded. Restart to install.`;
      dlBtn.disabled = false;
      dlBtn.textContent = 'Restart and install';
      dismissBtn.style.display = '';
    } else {
      textEl.textContent = `New version ${s.remoteVersion} available (you're on ${s.currentVersion}).`;
      dlBtn.disabled = false;
      dlBtn.textContent = 'Download update';
      dismissBtn.style.display = '';
    }
  }
  document.getElementById('update-download').onclick = async () => {
    const s = await window.api.update.status();
    if (s && s.status === 'ready') {
      await window.api.update.install();
    } else {
      await window.api.update.download();
    }
  };
  document.getElementById('update-dismiss').onclick = () => { document.getElementById('update-banner').hidden = true; };
  window.api.update.status().then(applyUpdateState);
  window.api.update.onStatus(applyUpdateState);

  // Toast-equivalent for auto-share firing.
  window.api.update.onAutoShareFiring((d) => {
    const tracks = (d.ghosts || []).map(g => `${g.trackName} ${g.timeStr}`).join(', ');
    setOfferStatus(`Auto-shared ${d.ghosts.length} new PB(s) to ${d.peerCount} friend(s): ${tracks}`);
  });

  window.api.onDiscoveryPeers((peers) => renderPeerList(peers));
  // Initial fetch in case the broadcast hasn't fired yet
  window.api.listDiscoveredPeers().then(renderPeerList);

  window.api.onReceivedChanged(() => renderReceivedList());
  window.api.onPeersChanged(() => { renderReceivedList(); renderPeerList(undefined); });
  window.api.onDeferredChanged((list) => renderDeferred(list));
  window.api.listDeferred().then(renderDeferred);
  renderReceivedList();

  window.api.onShowView((d) => {
    if (d.view === 'settings') renderSettings();
    else if (d.view === 'onboarding') renderOnboarding();
    else showMainView();
  });

  // Pull any in-flight pending offers in case the window opened after a toast.
  const pending = await window.api.listPendingOffers();
  pending.forEach(renderIncoming);

  // If a pairing session is already active when the window mounts (e.g. a
  // /pair/request just opened the window), render its UI immediately.
  const pair = await window.api.currentPair();
  if (pair) renderPair(pair.stage, pair);

  // First-run dispatch: if save path is missing, show onboarding.
  const settings = await window.api.settings.get();
  document.getElementById('version-stamp').textContent = `v${settings.version}`;
  if (!settings.savePath) {
    renderOnboarding();
  } else {
    showMainView();
  }
}

window.addEventListener('DOMContentLoaded', init);
