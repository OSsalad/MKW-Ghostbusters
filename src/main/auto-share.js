const fs = require('fs');
const { listPbs } = require('../shared/rksys');

// Watches rksys.dat changes and detects when a track's PB has improved.
// When auto-share is enabled, fires sender.send for each newly-improved PB
// to all paired peers.
//
// Snapshot is in-memory only — restart of the app re-snapshots on launch,
// so auto-sharing only kicks in for PBs set during a running session.

function makeAutoShare({ getSavePath, getActiveLicense, isEnabled, getPairedPeers, sendOne, broadcast, debounceMs = 2000 }) {
  let snapshot = null; // Map<trackId, timeMs>
  let pending = false;

  function snapshotNow() {
    const path = getSavePath();
    if (!path || !fs.existsSync(path)) { snapshot = new Map(); return; }
    try {
      const buf = fs.readFileSync(path);
      const pbs = listPbs(buf, getActiveLicense());
      snapshot = new Map(pbs.map(p => [p.trackId, p.timeMs]));
    } catch (err) {
      // Locked? Just keep old snapshot.
    }
  }

  async function checkForImprovements() {
    if (!isEnabled || !isEnabled()) return;
    const path = getSavePath();
    if (!path || !fs.existsSync(path)) return;
    let buf;
    try { buf = fs.readFileSync(path); }
    catch { return; } // probably locked, retry next change event

    const pbs = listPbs(buf, getActiveLicense());
    const improved = [];
    if (!snapshot) snapshot = new Map();
    for (const p of pbs) {
      const prev = snapshot.get(p.trackId);
      if (prev === undefined || p.timeMs < prev) {
        improved.push(p);
        snapshot.set(p.trackId, p.timeMs);
      }
    }
    if (improved.length === 0) return;
    const peers = (getPairedPeers && getPairedPeers()) || [];
    if (peers.length === 0) return;
    if (broadcast) {
      broadcast('auto-share:firing', {
        ghosts: improved.map(p => ({ trackId: p.trackId, trackName: p.trackName, timeStr: p.timeStr })),
        peerCount: peers.length,
      });
    }
    for (const peer of peers) {
      for (const p of improved) {
        try {
          await sendOne(peer, [{ slot: p.slot, trackId: p.trackId }]);
        } catch (err) {
          console.warn('[auto-share] send failed:', err && err.message);
        }
      }
    }
  }

  function onSaveChanged() {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      checkForImprovements().catch(err => console.warn('[auto-share]', err));
    }, debounceMs);
  }

  return { snapshotNow, onSaveChanged, checkForImprovements };
}

module.exports = { makeAutoShare };
