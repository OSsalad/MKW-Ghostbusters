// Persistent metadata for ghosts received from peers. Keyed by
// "<licenseIndex>:<slot>" so we don't lose attribution when slots are
// reused. Slot metadata is removed when a slot is cleared.

function key(license, slot) { return `${license}:${slot}`; }

function makeReceivedGhosts({ cfg }) {
  function record(license, slot, info) {
    const data = cfg.load();
    if (!data.receivedGhosts) data.receivedGhosts = {};
    data.receivedGhosts[key(license, slot)] = {
      ...info,
      receivedAt: new Date().toISOString(),
    };
    cfg.save(data);
  }

  function clear(license, slot) {
    const data = cfg.load();
    if (!data.receivedGhosts) return;
    delete data.receivedGhosts[key(license, slot)];
    cfg.save(data);
  }

  function listAll(license) {
    const data = cfg.load();
    const map = data.receivedGhosts || {};
    const out = [];
    for (const [k, v] of Object.entries(map)) {
      const [lic, slot] = k.split(':').map(Number);
      if (lic !== license) continue;
      out.push({ slot, ...v });
    }
    return out;
  }

  function get(license, slot) {
    const data = cfg.load();
    return (data.receivedGhosts || {})[key(license, slot)] || null;
  }

  return { record, clear, listAll, get };
}

module.exports = { makeReceivedGhosts };
