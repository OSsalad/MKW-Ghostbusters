const fs = require('fs');
const { listPbs } = require('../shared/rksys');
const { postJson } = require('./net/client');
const { signOffer } = require('./net/offers');

function makeSender({ getSavePath, getActiveLicense, getPeer, getPeerKey, getOwnUuid, getPeerByUuid }) {
  // Build the request body for a set of selected slots from a save buffer.
  function buildBody(buf, license, selectedSlots) {
    const pbs = listPbs(buf, license);
    const ghosts = selectedSlots.map(s => {
      const pb = pbs.find(p => p.slot === s.slot);
      if (!pb) return null;
      return {
        trackId: pb.trackId,
        timeMs: pb.timeMs,
        rkgBase64: pb.rkg.toString('base64'),
      };
    }).filter(Boolean);
    return { senderUuid: getOwnUuid(), ghosts };
  }

  // Send to a specific peer object {uuid, addresses, port, ...}.
  async function sendToPeer(peer, selectedSlots) {
    if (!peer) return { ok: false, reason: 'no peer' };
    const key = getPeerKey(peer.uuid);
    if (!key) return { ok: false, reason: 'not paired' };
    const savePath = getSavePath();
    if (!savePath || !fs.existsSync(savePath)) return { ok: false, reason: 'save not found' };
    const buf = fs.readFileSync(savePath);
    const body = buildBody(buf, getActiveLicense(), selectedSlots);
    if (body.ghosts.length === 0) return { ok: false, reason: 'no valid ghosts' };
    const headers = signOffer(key, body);
    const host = peer.addresses && peer.addresses[0];
    try {
      const resp = await postJson(host, peer.port, '/offer', body, headers);
      return { ok: resp.status === 200, status: resp.status, body: resp.body, peer: peer.uuid };
    } catch (err) {
      return { ok: false, reason: err.message, peer: peer.uuid };
    }
  }

  return {
    // Default: send to the active mDNS/manual peer (back-compat with single-friend flow).
    send: async (selectedSlots, targetUuid) => {
      let peer = null;
      if (targetUuid && getPeerByUuid) peer = getPeerByUuid(targetUuid);
      if (!peer) peer = getPeer();
      return sendToPeer(peer, selectedSlots);
    },
    sendToPeer,
    // Send to all paired peers in parallel; returns array of per-peer results.
    sendToAll: async (peers, selectedSlots) => {
      return Promise.all(peers.map(p => sendToPeer(p, selectedSlots)));
    },
  };
}

module.exports = { makeSender };
