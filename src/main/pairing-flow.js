const crypto = require('crypto');
const { generatePin, deriveKey, makeProof, verifyProof } = require('./net/pairing');
const { postJson } = require('./net/client');

function makePairingFlow({ getOwnUuid, getPeer, setPeer, isPeerKnown, savePeer, broadcast, getOwnAddress }) {
  let session = null;

  function publicSession() {
    if (!session) return null;
    if (session.mode === 'display') return { stage: 'display', pin: session.pin };
    if (session.mode === 'enter') return { stage: 'enter', initiator: session.peerUuid && session.peerUuid.slice(0, 8) };
    return null;
  }

  return {
    start: async (mode) => {
      if (mode === 'display') {
        const pin = generatePin();
        const ownNonce = crypto.randomBytes(8).toString('hex');
        session = { mode, pin, ownNonce, peerNonce: null, peerUuid: null };
        broadcast('pair:status', { stage: 'display', pin });
        return { ok: true, pin };
      }
      if (mode === 'enter') {
        const ownNonce = crypto.randomBytes(8).toString('hex');
        session = { mode, pin: null, ownNonce, peerNonce: null, peerUuid: null };
        broadcast('pair:status', { stage: 'enter' });
        return { ok: true };
      }
      return { ok: false, reason: 'unknown mode' };
    },

    current: () => publicSession(),

    enterPin: async (pin) => {
      if (!session || session.mode !== 'enter') return { ok: false, reason: 'not in enter mode' };
      const peer = getPeer();
      if (!peer) return { ok: false, reason: 'no peer discovered' };
      session.pin = pin;
      try {
        const init = await postJson(peer.addresses[0], peer.port, '/pair/init', {
          from: getOwnUuid(),
          nonce: session.ownNonce,
        });
        if (init.status !== 200) return { ok: false, reason: 'peer rejected init' };
        session.peerNonce = init.body.nonce;
        session.peerUuid = init.body.uuid;
        const key = deriveKey(pin, session.peerNonce, session.ownNonce);
        const transcript = `confirm|${session.peerUuid}|${getOwnUuid()}`;
        const proof = makeProof(key, transcript);
        const conf = await postJson(peer.addresses[0], peer.port, '/pair/confirm', {
          from: getOwnUuid(),
          proof,
        });
        if (conf.status !== 200) {
          session = null;
          broadcast('pair:status', { stage: 'failed', reason: 'pin mismatch' });
          return { ok: false, reason: 'pin mismatch' };
        }
        savePeer(session.peerUuid, key);
        broadcast('pair:status', { stage: 'paired', peerUuid: session.peerUuid });
        try { require('./pair-toast').closePairToast(); } catch (_) {}
        session = null;
        return { ok: true };
      } catch (err) {
        session = null;
        broadcast('pair:status', { stage: 'failed', reason: err.message });
        return { ok: false, reason: err.message };
      }
    },

    onPairInit: async ({ from, nonce: peerNonce }) => {
      if (!session || session.mode !== 'display') throw new Error('not displaying');
      session.peerUuid = from;
      session.peerNonce = peerNonce;
      return { uuid: getOwnUuid(), nonce: session.ownNonce };
    },

    // Initiator clicks "Pair" on a discovered/manual peer entry. We become the
    // PIN displayer locally and ping the peer so its UI prompts for the PIN.
    startAsInitiator: async (target) => {
      if (!target || !target.host || !target.port) {
        return { ok: false, reason: 'invalid target' };
      }
      // Provisionally adopt this peer so subsequent /pair/init responses route here.
      if (setPeer) setPeer({
        uuid: target.uuid || null,
        addresses: [target.host],
        port: target.port,
        host: target.host,
        via: target.via || 'initiator',
      });
      const pin = generatePin();
      const ownNonce = crypto.randomBytes(8).toString('hex');
      session = { mode: 'display', pin, ownNonce, peerNonce: null, peerUuid: null };
      broadcast('pair:status', { stage: 'display', pin });
      const ownAddr = getOwnAddress ? getOwnAddress() : null;
      try {
        const resp = await postJson(target.host, target.port, '/pair/request', {
          from: getOwnUuid(),
          addr: ownAddr,
        });
        if (resp.status !== 200) {
          session = null;
          broadcast('pair:status', { stage: 'failed', reason: 'peer rejected request' });
          return { ok: false, reason: 'peer rejected request' };
        }
      } catch (err) {
        session = null;
        broadcast('pair:status', { stage: 'failed', reason: err.message });
        return { ok: false, reason: err.message };
      }
      return { ok: true, pin };
    },

    // Receiver-side handler for /pair/request: peer is asking us to start
    // entering a PIN. Allowed only from a peer we already see (mDNS/manual).
    onPairRequest: async ({ from, addr }, _ip) => {
      if (!from) throw new Error('missing from');
      // Deliberately not gating on isPeerKnown here — the PIN exchange is
      // the actual security boundary, and the previous gate was too brittle
      // (asymmetric mDNS visibility would lock pairing out entirely).
      if (addr && setPeer) {
        const m = addr.match(/^([^:]+):(\d+)$/);
        if (m) {
          setPeer({
            uuid: from,
            addresses: [m[1]],
            port: Number(m[2]),
            host: m[1],
            via: 'pair-request',
          });
        }
      }
      const ownNonce = crypto.randomBytes(8).toString('hex');
      session = { mode: 'enter', pin: null, ownNonce, peerNonce: null, peerUuid: from };
      broadcast('pair:status', { stage: 'enter', initiator: from.slice(0, 8) });
      return { ok: true };
    },

    onPairConfirm: async ({ from, proof }) => {
      if (!session || session.mode !== 'display' || from !== session.peerUuid) {
        throw new Error('no session');
      }
      // For display side: deriveKey(pin, peerNonce, ownNonce) — same input order
      // as the enter side's deriveKey(pin, peerNonce, ownNonce).
      const key = deriveKey(session.pin, session.ownNonce, session.peerNonce);
      const transcript = `confirm|${getOwnUuid()}|${from}`;
      if (!verifyProof(key, transcript, proof)) {
        session = null;
        broadcast('pair:status', { stage: 'failed', reason: 'pin mismatch' });
        throw new Error('pin mismatch');
      }
      savePeer(session.peerUuid, key);
      broadcast('pair:status', { stage: 'paired', peerUuid: session.peerUuid });
      session = null;
      return { ok: true };
    },
  };
}

module.exports = { makePairingFlow };
