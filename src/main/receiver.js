const fs = require('fs');
const { validateRkg, summarize, MAX_RKG_BYTES } = require('../shared/rkg');
const {
  writeDownloadSlot, listDownloads, findFreeDownloadSlot,
  clearDownloadSlot, SLOTS,
} = require('../shared/rksys');
const { autoBackup, zipGhosts } = require('./backups');
const { OfferQueue, verifyOffer } = require('./net/offers');

const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 5 * 60_000;

function makeReceiver({
  getSavePath, getActiveLicense, getPeerKey, broadcast, backupRoot,
  notifier, getPeerInfo, recordReceived, clearReceived, deferred,
}) {
  const { offerToast, infoToast } = notifier || require('./notifications');
  const queue = new OfferQueue();
  const expireTimer = setInterval(() => {
    const expired = queue.expireOlderThan(TIMEOUT_MS);
    if (expired && expired.length) {
      for (const id of expired) broadcast('offer:expired', { id });
    }
  }, 30_000);

  const peerName = (uuid) => {
    const info = getPeerInfo && getPeerInfo(uuid);
    if (info && info.nickname) return info.nickname;
    return (uuid || '').slice(0, 8);
  };

  // Build a {trackName, timeStr, ...} summary array for an offer.
  function summarizeGhosts(ghosts) {
    return ghosts.map(g => {
      const s = summarize(g.rkg);
      return {
        trackId: s.trackId,
        trackIndex: s.trackIndex,
        trackName: s.trackName,
        timeStr: s.timeStr,
        timeMs: s.timeMs,
      };
    });
  }

  async function onOffer(body, headers) {
    if (typeof body !== 'object' || !body || !Array.isArray(body.ghosts) || !body.senderUuid) {
      return { accepted: false, result: { reason: 'malformed' } };
    }
    const key = getPeerKey(body.senderUuid);
    if (!key) return { accepted: false, result: { reason: 'unknown peer' } };
    if (!verifyOffer(key, headers, body)) {
      return { accepted: false, result: { reason: 'bad signature' } };
    }

    let totalBytes = 0;
    const decoded = [];
    for (const g of body.ghosts) {
      const buf = Buffer.from(g.rkgBase64 || '', 'base64');
      if (buf.length > MAX_RKG_BYTES) return { accepted: false, result: { reason: 'rkg too large' } };
      totalBytes += buf.length;
      const v = validateRkg(buf);
      if (!v.ok) return { accepted: false, result: { reason: `invalid rkg: ${v.reason}` } };
      decoded.push({ rkg: buf });
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      return { accepted: false, result: { reason: 'offer too large' } };
    }

    const tracks = summarizeGhosts(decoded);
    const senderName = peerName(body.senderUuid);

    const { id, promise } = queue.enqueue({
      senderUuid: body.senderUuid,
      ghosts: decoded,
      tracks,
    });

    // Toast body: full track list if 1-3 ghosts, summary otherwise.
    const tracksText = tracks.length <= 3
      ? tracks.map(t => `${t.trackName} ${t.timeStr}`).join(', ')
      : `${tracks.length} ghosts`;
    offerToast({
      senderName,
      count: decoded.length,
      tracksText,
      onAccept: () => decideAccept(id, {}),
      onReject: () => queue.resolve(id, { accepted: false }),
    });
    broadcast('offer:incoming', {
      id,
      senderUuid: body.senderUuid,
      senderName,
      count: decoded.length,
      tracks,
    });

    return promise;
  }

  // Actually write ghosts to rksys.dat. Throws on EBUSY/EPERM so the caller
  // can decide whether to defer or surface.
  function writeGhostsToSave(buf, license, ghosts, senderUuid) {
    let working = buf;
    const writtenSlots = [];
    const tracks = summarizeGhosts(ghosts);
    for (let i = 0; i < ghosts.length; i++) {
      const slot = findFreeDownloadSlot(working, license);
      if (slot === -1) {
        throw new Error(`no free download slot for ghost ${i + 1}/${ghosts.length}`);
      }
      try {
        working = writeDownloadSlot(working, license, slot, ghosts[i].rkg);
      } catch (err) {
        throw new Error(`writing ghost ${i + 1}/${ghosts.length}: ${err.message}`);
      }
      writtenSlots.push({ slot, track: tracks[i] });
    }
    return { working, writtenSlots };
  }

  // Persist metadata so the Received Ghosts list can show sender + track.
  function persistMetadata(license, writtenSlots, senderUuid) {
    if (!recordReceived) return;
    const senderNickname = (getPeerInfo && getPeerInfo(senderUuid) || {}).nickname || null;
    for (const w of writtenSlots) {
      recordReceived(license, w.slot, {
        senderUuid,
        senderNickname,
        trackName: w.track.trackName,
        trackId: w.track.trackId,
        timeStr: w.track.timeStr,
      });
    }
  }

  async function decideAccept(id, opts = {}) {
    const pending = queue.get(id);
    if (!pending) return { ok: false, reason: 'unknown id' };

    const savePath = getSavePath();
    const license = getActiveLicense();
    if (!savePath) {
      queue.resolve(id, { accepted: false, result: { reason: 'save path not configured' } });
      return { ok: false, reason: 'no save path' };
    }

    let buf;
    try {
      buf = fs.readFileSync(savePath);
    } catch (err) {
      if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
        return deferImport(id, pending);
      }
      queue.resolve(id, { accepted: false, result: { reason: err.message } });
      throw err;
    }

    let working = buf;
    const slotsToFree = Array.isArray(opts.slotsToFree) ? opts.slotsToFree : [];

    if (slotsToFree.length && opts.backup) {
      const dls = listDownloads(working, license);
      const entries = slotsToFree.map(slot => {
        const e = dls.find(d => d.slot === slot);
        return e ? { rkg: e.rkg, slot, trackName: e.trackName } : null;
      }).filter(Boolean);
      if (entries.length) {
        try { await zipGhosts(entries, backupRoot); }
        catch (err) {
          queue.resolve(id, { accepted: false, result: { reason: `backup failed: ${err.message}` } });
          return { ok: false, reason: 'backup failed' };
        }
      }
    }

    for (const slot of slotsToFree) {
      working = clearDownloadSlot(working, license, slot);
      if (clearReceived) clearReceived(license, slot);
    }

    const occupied = listDownloads(working, license).length;
    const need = occupied + pending.body.ghosts.length - SLOTS;
    if (need > 0) {
      broadcast('offer:needs-room', {
        id,
        currentDownloads: listDownloads(working, license).map(d => ({
          slot: d.slot,
          trackId: d.trackId,
          trackName: d.trackName,
          timeStr: d.timeStr,
        })),
        required: need,
      });
      return { ok: false, reason: 'needs-room' };
    }

    autoBackup(savePath, backupRoot);

    let writtenSlots;
    try {
      const result = writeGhostsToSave(working, license, pending.body.ghosts, pending.body.senderUuid);
      working = result.working;
      writtenSlots = result.writtenSlots;
    } catch (err) {
      queue.resolve(id, { accepted: false, result: { reason: err.message } });
      infoToast('Import failed', err.message);
      return { ok: false, reason: err.message };
    }

    try {
      fs.writeFileSync(savePath, working);
    } catch (err) {
      if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
        return deferImport(id, pending);
      }
      queue.resolve(id, { accepted: false, result: { reason: err.message } });
      throw err;
    }

    persistMetadata(license, writtenSlots, pending.body.senderUuid);
    queue.resolve(id, { accepted: true });
    broadcast('received:changed', {});
    const senderName = peerName(pending.body.senderUuid);
    const tracksText = pending.body.tracks && pending.body.tracks.length <= 3
      ? pending.body.tracks.map(t => `${t.trackName} ${t.timeStr}`).join(', ')
      : `${pending.body.ghosts.length} ghosts`;
    infoToast('Imported', `Imported from ${senderName}: ${tracksText}`);
    return { ok: true };
  }

  // Defer this offer until Dolphin releases the file lock. Resolves the
  // sender immediately as accepted (best-effort UX) and queues the actual
  // write for later. If the write later fails, fires an error toast.
  function deferImport(id, pending) {
    if (!deferred) {
      // No deferred infrastructure — fall back to old "click Retry" flow.
      broadcast('offer:lock-blocked', { id });
      infoToast('Save file locked', 'Close Dolphin and click Retry in the window.');
      return { ok: false, reason: 'locked' };
    }
    deferred.defer({
      ghosts: pending.body.ghosts,
      senderUuid: pending.body.senderUuid,
      importFn: async (ghosts, senderUuid) => {
        const license = getActiveLicense();
        const savePath = getSavePath();
        const buf = fs.readFileSync(savePath);
        autoBackup(savePath, backupRoot);
        const { working, writtenSlots } = writeGhostsToSave(buf, license, ghosts, senderUuid);
        fs.writeFileSync(savePath, working);
        persistMetadata(license, writtenSlots, senderUuid);
        broadcast('received:changed', {});
        const senderName = peerName(senderUuid);
        const tracksText = ghosts.length <= 3
          ? summarizeGhosts(ghosts).map(t => `${t.trackName} ${t.timeStr}`).join(', ')
          : `${ghosts.length} ghosts`;
        infoToast('Imported (deferred)', `From ${senderName}: ${tracksText}`);
      },
      onError: (err) => {
        infoToast('Deferred import failed', err.message);
      },
    });
    queue.resolve(id, { accepted: true }); // sender stops hanging
    const senderName = peerName(pending.body.senderUuid);
    infoToast('Queued for later', `Will import from ${senderName} when Dolphin closes.`);
    broadcast('deferred:changed', deferred.list());
    return { ok: true, deferred: true };
  }

  function decideReject(id) {
    queue.resolve(id, { accepted: false });
    return { ok: true };
  }

  function decide(id, accept, opts) {
    if (accept) return decideAccept(id, opts || {});
    return Promise.resolve(decideReject(id));
  }

  function listPending() {
    return queue.list().map(p => ({
      id: p.id,
      senderUuid: p.body.senderUuid,
      senderName: peerName(p.body.senderUuid),
      count: p.body.ghosts.length,
      tracks: p.body.tracks || [],
    }));
  }

  // Delete a single download slot (called by the Received Ghosts UI).
  // Returns { ok, reason } and may defer if Dolphin holds the lock.
  async function deleteReceived(slot) {
    const savePath = getSavePath();
    const license = getActiveLicense();
    if (!savePath) return { ok: false, reason: 'no save path' };
    let buf;
    try { buf = fs.readFileSync(savePath); }
    catch (err) {
      if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
        return { ok: false, reason: 'locked' };
      }
      throw err;
    }
    const cleared = clearDownloadSlot(buf, license, slot);
    autoBackup(savePath, backupRoot);
    try { fs.writeFileSync(savePath, cleared); }
    catch (err) {
      if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
        return { ok: false, reason: 'locked' };
      }
      throw err;
    }
    if (clearReceived) clearReceived(license, slot);
    broadcast('received:changed', {});
    return { ok: true };
  }

  function shutdown() { clearInterval(expireTimer); }

  return { onOffer, decide, listPending, deleteReceived, shutdown };
}

module.exports = { makeReceiver };
