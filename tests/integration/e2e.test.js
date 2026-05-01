const fs = require('fs');
const os = require('os');
const path = require('path');

const { Config } = require('../../src/main/config');
const { startServer } = require('../../src/main/net/server');
const { makePairingFlow } = require('../../src/main/pairing-flow');
const { makeReceiver } = require('../../src/main/receiver');
const { makeSender } = require('../../src/main/sender');
const { listDownloads, listPbs, writeDownloadSlot } = require('../../src/shared/rksys');

jest.setTimeout(15_000);

function makeRkg({ trackId = 0x08, min = 1, sec = 19, mil = 574 } = {}) {
  const buf = Buffer.alloc(0x2800);
  buf.write('RKGD', 0, 'ascii');
  buf[4] = (min << 1) | ((sec >> 6) & 1);
  buf[5] = ((sec & 0x3F) << 2) | ((mil >> 8) & 3);
  buf[6] = mil & 0xFF;
  buf[7] = (trackId & 0x3F) << 2;
  buf[0x10] = 3;
  return buf;
}

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'sample-rksys.dat');

async function setupNode(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `e2e-${label}-`));
  const cfg = new Config(dir);
  cfg.load();
  const savePath = path.join(dir, 'rksys.dat');
  fs.copyFileSync(FIXTURE, savePath);
  const data = cfg.load();
  data.savePath = savePath;
  cfg.save(data);

  const node = {
    dir, cfg, savePath,
    peerState: { current: null },
    displayedPin: null,
    broadcasts: [],
  };

  const broadcast = (channel, payload) => {
    node.broadcasts.push({ channel, payload });
    if (channel === 'pair:status' && payload && payload.stage === 'display') {
      node.displayedPin = payload.pin;
    }
  };

  const getOwnUuid = () => cfg.load().uuid;
  const getPeer = () => node.peerState.current;
  const getPeerKey = (uuid) => {
    const hex = cfg.load().peers[uuid] && cfg.load().peers[uuid].hmacKey;
    return hex ? Buffer.from(hex, 'hex') : null;
  };
  const savePeer = (uuid, key) => {
    const d = cfg.load();
    d.peers[uuid] = { hmacKey: Buffer.from(key).toString('hex') };
    cfg.save(d);
  };

  node.pairingFlow = makePairingFlow({ getOwnUuid, getPeer, savePeer, broadcast });
  node.receiver = makeReceiver({
    getSavePath: () => cfg.load().savePath,
    getActiveLicense: () => 0,
    getPeerKey,
    broadcast,
    backupRoot: path.join(dir, 'Backups'),
    notifier: { offerToast: () => {}, infoToast: () => {} },
  });
  node.sender = makeSender({
    getSavePath: () => cfg.load().savePath,
    getActiveLicense: () => 0,
    getPeer, getPeerKey, getOwnUuid,
  });

  node.server = await startServer({
    onOffer: node.receiver.onOffer,
    onPairInit: node.pairingFlow.onPairInit,
    onPairConfirm: node.pairingFlow.onPairConfirm,
  });

  return node;
}

function wirePeers(a, b) {
  a.peerState.current = {
    uuid: b.cfg.load().uuid,
    addresses: ['127.0.0.1'],
    port: b.server.port,
    host: 'B',
  };
  b.peerState.current = {
    uuid: a.cfg.load().uuid,
    addresses: ['127.0.0.1'],
    port: a.server.port,
    host: 'A',
  };
}

async function pair(displaySide, enterSide) {
  await displaySide.pairingFlow.start('display');
  await enterSide.pairingFlow.start('enter');
  // wait one tick for the broadcast to fire
  await new Promise(r => setImmediate(r));
  expect(displaySide.displayedPin).toMatch(/^\d{6}$/);
  const r = await enterSide.pairingFlow.enterPin(displaySide.displayedPin);
  expect(r.ok).toBe(true);
}

describe('E2E: pair + send + accept', () => {
  let A, B;
  afterEach(async () => {
    await A.server.close();
    await B.server.close();
    A.receiver.shutdown();
    B.receiver.shutdown();
    fs.rmSync(A.dir, { recursive: true, force: true });
    fs.rmSync(B.dir, { recursive: true, force: true });
  });

  test('paired peers can transfer a ghost', async () => {
    A = await setupNode('A');
    B = await setupNode('B');
    wirePeers(A, B);

    // Plant a PB in slot 0 of A's save (the fixture is blank).
    let aBuf = fs.readFileSync(A.savePath);
    aBuf = writeDownloadSlot(aBuf, 0, 0, makeRkg({ trackId: 0x08, min: 1, sec: 19, mil: 574 }));
    // Move it from download slot 0 to PB slot 0 by writing directly.
    // (Simpler: write into the PB area too.)
    const pbAddr = 0x28000 + 0 * 0x2800; // license 0, PB slot 0
    aBuf = Buffer.from(aBuf);
    makeRkg({ trackId: 0x08, min: 1, sec: 19, mil: 574 }).copy(aBuf, pbAddr);
    fs.writeFileSync(A.savePath, aBuf);

    expect(listPbs(fs.readFileSync(A.savePath), 0).length).toBe(1);

    await pair(A, B);

    // Set up B to auto-accept after offer arrives.
    setTimeout(() => {
      const pending = B.receiver.listPending();
      if (pending.length) B.receiver.decide(pending[0].id, true, {});
    }, 200);

    const result = await A.sender.send([{ slot: 0 }]);
    expect(result.ok).toBe(true);

    const dls = listDownloads(fs.readFileSync(B.savePath), 0);
    expect(dls.length).toBe(1);
    expect(dls[0].trackId).toBe(0x08);
  });

  test('rejected offer surfaces as 403 to sender', async () => {
    A = await setupNode('A');
    B = await setupNode('B');
    wirePeers(A, B);

    let aBuf = fs.readFileSync(A.savePath);
    const pbAddr = 0x28000;
    makeRkg({ trackId: 0x08 }).copy(aBuf, pbAddr);
    fs.writeFileSync(A.savePath, aBuf);

    await pair(A, B);

    setTimeout(() => {
      const pending = B.receiver.listPending();
      if (pending.length) B.receiver.decide(pending[0].id, false);
    }, 200);

    const result = await A.sender.send([{ slot: 0 }]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  test('unpaired peer offers are rejected silently', async () => {
    A = await setupNode('A');
    B = await setupNode('B');
    wirePeers(A, B);

    // Skip pairing — A has no key for B.
    let aBuf = fs.readFileSync(A.savePath);
    makeRkg({ trackId: 0x08 }).copy(aBuf, 0x28000);
    fs.writeFileSync(A.savePath, aBuf);

    // Sender returns ok=false because there's no paired key.
    const result = await A.sender.send([{ slot: 0 }]);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not paired');
  });
});
