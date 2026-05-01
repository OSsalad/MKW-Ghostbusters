const fs = require('fs');

// Holds offers that hit a locked rksys.dat. Polls every 2s; when the file
// can be opened with write access (Dolphin closed) it drains the queue.
//
// Queue items: { ghosts, senderUuid, importFn, onSuccess, onError }
//   importFn: async (ghosts, senderUuid) => any
//             must do the actual rksys mutation; called when lock is free.
//
// Single global instance per main-process; created in index.js.

class DeferredImports {
  constructor({ getSavePath, intervalMs = 2000, notifier } = {}) {
    this.getSavePath = getSavePath;
    this.intervalMs = intervalMs;
    this.queue = [];
    this.timer = null;
    this.notifier = notifier;
    this.changeListeners = [];
  }

  count() { return this.queue.length; }
  list() {
    return this.queue.map((q, i) => ({
      i,
      senderUuid: q.senderUuid,
      ghostCount: q.ghosts.length,
      queuedAt: q.queuedAt,
    }));
  }

  defer(item) {
    this.queue.push({ ...item, queuedAt: Date.now() });
    this._notifyListeners();
    this._startPolling();
  }

  onChange(cb) { this.changeListeners.push(cb); }
  _notifyListeners() {
    for (const cb of this.changeListeners) {
      try { cb(this.list()); } catch (_) {}
    }
  }

  _startPolling() {
    if (this.timer) return;
    this.timer = setInterval(() => this._tryDrain(), this.intervalMs);
  }
  _stopPolling() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  async _tryDrain() {
    if (this.queue.length === 0) { this._stopPolling(); return; }
    const path = this.getSavePath && this.getSavePath();
    if (!path) return;
    let handle;
    try {
      handle = fs.openSync(path, 'r+'); // succeeds only if no other writer
      fs.closeSync(handle);
    } catch (err) {
      if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
        return; // still locked
      }
      // unexpected; bail this round
      console.warn('[deferred] check failed:', err.message);
      return;
    }
    // Lock is free. Drain.
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      try {
        await item.importFn(item.ghosts, item.senderUuid);
        if (item.onSuccess) item.onSuccess();
      } catch (err) {
        // Re-queue if it locked again mid-drain; otherwise drop.
        if (err && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES')) {
          this.queue.unshift(item);
          break;
        }
        console.warn('[deferred] import failed:', err && err.message);
        if (item.onError) item.onError(err);
      }
    }
    this._notifyListeners();
    if (this.queue.length === 0) this._stopPolling();
  }

  shutdown() { this._stopPolling(); }
}

module.exports = { DeferredImports };
