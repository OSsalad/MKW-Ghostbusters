const { app, dialog, shell, ipcMain, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

const { Config, defaultDir } = require('./config');
const { detectRksysPath } = require('./paths');
const { createTray } = require('./tray');
const { buildAppMenu } = require('./app-menu');
const { getOrCreateWindow, ensureWindowReady, broadcast } = require('./window');
const { registerIpc } = require('./ipc');
const { Discovery } = require('./net/discovery');
const { startServer } = require('./net/server');
const { localLanIPv4, parseAddr } = require('./net/addr');
const { makePairingFlow } = require('./pairing-flow');
const { makePbsApi } = require('./pbs');
const { makeSender } = require('./sender');
const { makeReceiver } = require('./receiver');
const { makeReceivedGhosts } = require('./received-ghosts');
const { DeferredImports } = require('./deferred-imports');
const { listDownloads } = require('../shared/rksys');
const { RksysWatcher } = require('./file-watcher');
const { makeAutoShare } = require('./auto-share');
const { autoUpdater } = require('electron-updater');

let tray = null;
let cfg = null;
let server = null;
let discovery = null;
let watcher = null;
let autoShare = null;
let updateState = { hasUpdate: false, remoteVersion: null, downloadUrl: null, notes: null, lastChecked: null };
const peerState = { current: null };

function backupRoot() {
  return path.join(defaultDir(), 'Backups');
}

function applyManualPeer() {
  if (!cfg) return;
  const m = cfg.load().manualPeer;
  if (!m) return;
  const parsed = parseAddr(m);
  if (!parsed || !parsed.port) return;
  // If mDNS already found a real peer, leave it. Manual is fallback only.
  if (peerState.current && peerState.current.via === 'mdns') return;
  // Reuse uuid from any paired peer recorded with this host (best effort).
  const peers = cfg.load().peers || {};
  let uuid = null;
  for (const [u, info] of Object.entries(peers)) {
    if (info.lastHost === parsed.host || info.lastAddress === m) { uuid = u; break; }
  }
  peerState.current = {
    uuid,
    addresses: [parsed.host],
    port: parsed.port,
    host: parsed.host,
    via: 'manual',
  };
  broadcast('peer:status', { connected: true, name: `${parsed.host} (manual)` });
}

function restartWatcher() {
  if (watcher) { watcher.stop(); watcher = null; }
  const p = cfg && cfg.load().savePath;
  if (!p) return;
  watcher = new RksysWatcher(p);
  watcher.on('changed', () => {
    broadcast('save:changed', {});
    if (autoShare) autoShare.onSaveChanged();
  });
  watcher.start();
  broadcast('save:changed', {});
  if (autoShare) autoShare.snapshotNow();
}

async function setup() {
  cfg = new Config(defaultDir());
  let cfgData = cfg.load();

  // Pre-create directories so tray menu actions don't fail before first import.
  fs.mkdirSync(backupRoot(), { recursive: true });

  // Auto-detect Dolphin save on first run
  if (!cfgData.savePath) {
    const detected = detectRksysPath();
    if (detected) {
      cfgData.savePath = detected;
      cfg.save(cfgData);
    }
  }

  const getOwnUuid = () => cfg.load().uuid;
  const getPeer = () => peerState.current;
  const getPeerKey = (uuid) => {
    const hex = cfg.load().peers[uuid] && cfg.load().peers[uuid].hmacKey;
    return hex ? Buffer.from(hex, 'hex') : null;
  };
  const savePeer = (uuid, key) => {
    const data = cfg.load();
    const cur = peerState.current;
    data.peers[uuid] = {
      hmacKey: Buffer.from(key).toString('hex'),
      lastHost: cur && cur.host,
      lastAddress: cur ? `${cur.addresses && cur.addresses[0]}:${cur.port}` : null,
    };
    cfg.save(data);
    // Once paired, stamp the current peer with its now-known UUID so the
    // sender can look up the HMAC key.
    if (cur && !cur.uuid) cur.uuid = uuid;
  };

  const isPeerKnown = (uuid, addr) => {
    if (!uuid) return false;
    if (peerState.current && peerState.current.uuid === uuid) return true;
    if (discovery && discovery.getPeers().some(p => p.uuid === uuid)) return true;
    if (cfg.load().peers && cfg.load().peers[uuid]) return true;
    if (addr) {
      const m = addr.match(/^([^:]+):(\d+)$/);
      if (m) {
        const host = m[1];
        const manual = cfg.load().manualPeer;
        if (manual && manual.startsWith(host + ':')) return true;
        if (discovery && discovery.getPeers().some(p =>
          (p.addresses || []).includes(host)
        )) return true;
      }
    }
    return false;
  };

  const setPeer = (p) => { peerState.current = p; broadcast('peer:status', { connected: true, name: p.host || (p.uuid && p.uuid.slice(0, 8)) || 'peer' }); };

  const pairingFlow = makePairingFlow({
    getOwnUuid, getPeer, setPeer, isPeerKnown, savePeer, broadcast,
    getOwnAddress: () => {
      const ip = localLanIPv4();
      return ip && server ? `${ip}:${server.port}` : null;
    },
  });

  // Resolve a peer object {uuid, addresses, port, host} for any paired peer
  // by combining its config record with current discovery info or last-known
  // address. Returns null if we have no idea where it is right now.
  const getPeerByUuid = (uuid) => {
    if (!uuid) return null;
    if (peerState.current && peerState.current.uuid === uuid) return peerState.current;
    const dpeers = (discovery && discovery.getPeers()) || [];
    const found = dpeers.find(p => p.uuid === uuid);
    if (found) return { ...found, via: 'mdns' };
    const info = (cfg.load().peers || {})[uuid];
    if (info && info.lastAddress) {
      const m = info.lastAddress.match(/^([^:]+):(\d+)$/);
      if (m) return { uuid, addresses: [m[1]], port: Number(m[2]), host: m[1], via: 'last-known' };
    }
    return null;
  };

  // List ALL paired peers we currently know how to reach.
  const getReachablePairedPeers = () => {
    const peers = cfg.load().peers || {};
    return Object.keys(peers)
      .map(uuid => getPeerByUuid(uuid))
      .filter(Boolean);
  };

  const sender = makeSender({
    getSavePath: () => cfg.load().savePath,
    getActiveLicense: () => 0,
    getPeer, getPeerKey, getOwnUuid,
    getPeerByUuid,
  });

  autoShare = makeAutoShare({
    getSavePath: () => cfg.load().savePath,
    getActiveLicense: () => 0,
    isEnabled: () => !!cfg.load().autoShareEnabled,
    getPairedPeers: getReachablePairedPeers,
    sendOne: (peer, slots) => sender.sendToPeer(peer, slots),
    broadcast,
  });

  const pbsApi = makePbsApi({
    getSavePath: () => cfg.load().savePath,
    getActiveLicense: () => 0,
  });

  const received = makeReceivedGhosts({ cfg });
  const deferred = new DeferredImports({
    getSavePath: () => cfg.load().savePath,
  });
  deferred.onChange((list) => broadcast('deferred:changed', list));

  const getPeerInfo = (uuid) => {
    if (!uuid) return null;
    const data = cfg.load();
    return (data.peers && data.peers[uuid]) || null;
  };

  const receiver = makeReceiver({
    getSavePath: () => cfg.load().savePath,
    getActiveLicense: () => 0,
    getPeerKey,
    broadcast,
    backupRoot: backupRoot(),
    getPeerInfo,
    recordReceived: received.record,
    clearReceived: received.clear,
    deferred,
  });

  const offersApi = {
    send: (slots) => sender.send(slots),
    listPending: async () => receiver.listPending(),
    decide: (id, accept, opts) => receiver.decide(id, accept, opts),
  };

  const pairingApi = {
    start: (mode) => pairingFlow.start(mode),
    enterPin: (pin) => pairingFlow.enterPin(pin),
  };

  const statusApi = {
    snapshot: async () => ({
      peer: peerState.current,
      savePath: cfg.load().savePath,
    }),
  };

  registerIpc({ pbsApi, offersApi, pairingApi, statusApi });

  // Settings IPC — exposed via preload as window.api.settings*
  const appVersion = require('../../package.json').version;
  ipcMain.handle('settings:get', () => {
    const d = cfg.load();
    const lanIp = localLanIPv4();
    return {
      uuid: d.uuid,
      savePath: d.savePath,
      pairedPeers: Object.keys(d.peers || {}).map(uuid => ({
        uuid,
        lastHost: d.peers[uuid].lastHost || null,
        nickname: d.peers[uuid].nickname || null,
      })),
      backupDir: backupRoot(),
      version: appVersion,
      localAddress: lanIp ? `${lanIp}:${server ? server.port : '?'}` : null,
      manualPeer: d.manualPeer || null,
      peerConnected: !!peerState.current,
      peerVia: peerState.current ? peerState.current.via : null,
      autoShareEnabled: !!d.autoShareEnabled,
      updateState,
    };
  });

  ipcMain.handle('settings:setManualPeer', (_e, addr) => {
    if (addr === null || addr === '' || addr === undefined) {
      const d = cfg.load(); d.manualPeer = null; cfg.save(d);
      // If the current peer was manual, drop it so mDNS can take over.
      if (peerState.current && peerState.current.via === 'manual') {
        peerState.current = null;
        broadcast('peer:status', { connected: false });
      }
      return { ok: true };
    }
    const parsed = parseAddr(addr);
    if (!parsed || !parsed.port) return { ok: false, reason: 'expected ip:port' };
    const d = cfg.load();
    d.manualPeer = `${parsed.host}:${parsed.port}`;
    cfg.save(d);
    applyManualPeer();
    return { ok: true };
  });

  ipcMain.handle('settings:pickSavePath', async () => {
    const win = getOrCreateWindow();
    const result = await dialog.showOpenDialog(win, {
      title: 'Select rksys.dat',
      properties: ['openFile'],
      filters: [{ name: 'Dolphin save', extensions: ['dat'] }],
    });
    if (result.canceled || !result.filePaths.length) return { ok: false };
    const picked = result.filePaths[0];
    const d = cfg.load();
    d.savePath = picked;
    cfg.save(d);
    restartWatcher();
    return { ok: true, savePath: picked };
  });

  ipcMain.handle('settings:autoDetect', () => {
    const detected = detectRksysPath();
    if (!detected) return { ok: false, reason: 'not found' };
    const d = cfg.load();
    d.savePath = detected;
    cfg.save(d);
    restartWatcher();
    return { ok: true, savePath: detected };
  });

  ipcMain.handle('settings:forgetPeers', () => {
    const d = cfg.load();
    d.peers = {};
    cfg.save(d);
    return { ok: true };
  });

  // Start HTTP server first so we know the port for mDNS announcement
  server = await startServer({
    onOffer: receiver.onOffer,
    onPairInit: pairingFlow.onPairInit,
    onPairConfirm: pairingFlow.onPairConfirm,
    onPairRequest: async (body, ip) => {
      // Make sure the window is fully loaded BEFORE the pairing flow
      // broadcasts its 'enter' status — otherwise the renderer hasn't
      // attached its IPC listeners yet and the prompt is lost.
      await ensureWindowReady();
      return pairingFlow.onPairRequest(body, ip);
    },
  });

  discovery = new Discovery({ uuid: getOwnUuid(), port: server.port });
  discovery.on('error', (err) => console.warn('[discovery]', err.message));
  const broadcastPeerList = () => {
    const mdns = discovery.getPeers().map(p => ({ ...p, via: 'mdns' }));
    const manual = cfg.load().manualPeer;
    const list = [...mdns];
    if (manual && !mdns.some(p => p.addresses && p.addresses.includes(manual.split(':')[0]))) {
      const [host, port] = manual.split(':');
      list.push({ uuid: null, host, addresses: [host], port: Number(port), via: 'manual' });
    }
    // Mark already-paired peers
    const known = cfg.load().peers || {};
    list.forEach(p => { p.paired = !!(p.uuid && known[p.uuid]); });
    broadcast('discovery:peers', list);
  };
  discovery.on('peer-up', (p) => {
    peerState.current = { ...p, via: 'mdns' };
    broadcast('peer:status', { connected: true, name: p.host || p.uuid.slice(0, 8) });
    broadcastPeerList();
  });
  discovery.on('peer-down', (p) => {
    if (peerState.current && peerState.current.uuid === p.uuid) {
      peerState.current = null;
      broadcast('peer:status', { connected: false });
      applyManualPeer();
    }
    broadcastPeerList();
  });
  discovery.start();
  setInterval(broadcastPeerList, 5000);

  ipcMain.handle('discovery:list', () => {
    const mdns = discovery.getPeers().map(p => ({ ...p, via: 'mdns' }));
    const manual = cfg.load().manualPeer;
    const list = [...mdns];
    if (manual && !mdns.some(p => p.addresses && p.addresses.includes(manual.split(':')[0]))) {
      const [host, port] = manual.split(':');
      list.push({ uuid: null, host, addresses: [host], port: Number(port), via: 'manual' });
    }
    const known = cfg.load().peers || {};
    list.forEach(p => { p.paired = !!(p.uuid && known[p.uuid]); });
    return list;
  });

  ipcMain.handle('pair:initiate', (_e, target) => pairingFlow.startAsInitiator(target));
  ipcMain.handle('pair:current', () => pairingFlow.current());

  ipcMain.handle('settings:setNickname', (_e, uuid, nickname) => {
    if (!uuid) return { ok: false, reason: 'missing uuid' };
    const data = cfg.load();
    if (!data.peers) data.peers = {};
    if (!data.peers[uuid]) return { ok: false, reason: 'unknown peer' };
    data.peers[uuid].nickname = nickname ? String(nickname).trim().slice(0, 64) : null;
    cfg.save(data);
    broadcast('peers:changed', {});
    return { ok: true };
  });

  ipcMain.handle('received:list', () => {
    const savePath = cfg.load().savePath;
    if (!savePath) return [];
    const license = 0;
    let buf;
    try { buf = fs.readFileSync(savePath); } catch { return []; }
    const slots = listDownloads(buf, license);
    return slots.map(s => {
      const meta = received.get(license, s.slot) || {};
      const senderUuid = meta.senderUuid;
      const peer = senderUuid && cfg.load().peers && cfg.load().peers[senderUuid];
      const nickname = (peer && peer.nickname) || meta.senderNickname;
      return {
        slot: s.slot,
        trackId: s.trackId,
        trackIndex: s.trackIndex,
        trackName: s.trackName,
        timeStr: s.timeStr,
        timeMs: s.timeMs,
        vehicle: s.vehicle,
        character: s.character,
        miiName: s.miiName,
        lapTimes: s.lapTimes.map(l => ({ timeMs: l.timeMs, timeStr: l.timeStr })),
        senderUuid: senderUuid || null,
        senderName: nickname || (senderUuid ? senderUuid.slice(0, 8) : 'unknown'),
        receivedAt: meta.receivedAt || null,
      };
    });
  });

  // For a given track, return your PB time and any received ghosts on that
  // track grouped by sender. The renderer uses this for inline delta badges.
  ipcMain.handle('compare:track', (_e, trackId) => {
    const savePath = cfg.load().savePath;
    if (!savePath) return null;
    const license = 0;
    let buf;
    try { buf = fs.readFileSync(savePath); } catch { return null; }
    const myPbs = require('../shared/rksys').listPbs(buf, license);
    const myPb = myPbs.find(p => p.trackId === trackId);
    const dlSlots = require('../shared/rksys').listDownloads(buf, license);
    const friends = dlSlots
      .filter(d => d.trackId === trackId)
      .map(d => {
        const meta = received.get(license, d.slot) || {};
        const peer = meta.senderUuid && cfg.load().peers && cfg.load().peers[meta.senderUuid];
        const nickname = (peer && peer.nickname) || meta.senderNickname;
        return {
          senderName: nickname || (meta.senderUuid ? meta.senderUuid.slice(0, 8) : 'unknown'),
          timeMs: d.timeMs,
          timeStr: d.timeStr,
          lapTimes: d.lapTimes.map(l => ({ timeMs: l.timeMs, timeStr: l.timeStr })),
        };
      });
    return {
      trackId,
      myTime: myPb ? { timeMs: myPb.timeMs, timeStr: myPb.timeStr, lapTimes: myPb.lapTimes.map(l => ({ timeMs: l.timeMs, timeStr: l.timeStr })) } : null,
      friends,
    };
  });

  ipcMain.handle('received:delete', (_e, slot) => receiver.deleteReceived(slot));

  ipcMain.handle('deferred:list', () => deferred.list());

  ipcMain.handle('settings:setAutoShare', (_e, enabled) => {
    const d = cfg.load();
    d.autoShareEnabled = !!enabled;
    cfg.save(d);
    if (enabled && autoShare) autoShare.snapshotNow();
    return { ok: true, enabled: !!enabled };
  });

  // electron-updater: pulls release info from the GitHub repo configured in
  // electron-builder.yml (publish: github). When a new release exists, it
  // downloads the .exe in the background and quitAndInstall replaces it.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('checking-for-update', () => {
    updateState = { ...updateState, status: 'checking' };
    broadcast('update:status', updateState);
  });
  autoUpdater.on('update-available', (info) => {
    updateState = {
      ...updateState,
      status: 'available',
      hasUpdate: true,
      remoteVersion: info.version,
      currentVersion: appVersion,
      notes: info.releaseNotes || null,
      lastChecked: new Date().toISOString(),
    };
    broadcast('update:status', updateState);
  });
  autoUpdater.on('update-not-available', (info) => {
    updateState = {
      ...updateState,
      status: 'up-to-date',
      hasUpdate: false,
      remoteVersion: info && info.version,
      currentVersion: appVersion,
      lastChecked: new Date().toISOString(),
    };
    broadcast('update:status', updateState);
  });
  autoUpdater.on('download-progress', (p) => {
    updateState = {
      ...updateState,
      status: 'downloading',
      progress: { percent: p.percent, transferred: p.transferred, total: p.total, bytesPerSecond: p.bytesPerSecond },
    };
    broadcast('update:status', updateState);
  });
  autoUpdater.on('update-downloaded', (info) => {
    updateState = {
      ...updateState,
      status: 'ready',
      hasUpdate: true,
      remoteVersion: info.version,
      readyToInstall: true,
    };
    broadcast('update:status', updateState);
  });
  autoUpdater.on('error', (err) => {
    updateState = { ...updateState, status: 'error', error: err && err.message };
    broadcast('update:status', updateState);
  });

  ipcMain.handle('update:check', async () => {
    try { await autoUpdater.checkForUpdates(); return { ok: true }; }
    catch (err) { return { ok: false, reason: err.message }; }
  });
  ipcMain.handle('update:download', async () => {
    try { await autoUpdater.downloadUpdate(); return { ok: true }; }
    catch (err) { return { ok: false, reason: err.message }; }
  });
  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall(true, true);
    return { ok: true };
  });
  ipcMain.handle('update:status', () => updateState);

  // Multi-friend: explicit send to one peer (or all paired) by uuid.
  ipcMain.handle('offer:sendTo', async (_e, args) => {
    const slots = (args && args.slots) || [];
    const target = args && args.targetUuid;
    if (target === '__all__') {
      const peers = getReachablePairedPeers();
      if (peers.length === 0) return { ok: false, reason: 'no paired peers reachable' };
      const results = await sender.sendToAll(peers, slots);
      const okCount = results.filter(r => r.ok).length;
      return { ok: okCount > 0, results, summary: `${okCount}/${results.length} accepted` };
    }
    return sender.send(slots, target);
  });

  // After server + discovery are running, surface any configured manual peer.
  applyManualPeer();

  restartWatcher();

  Menu.setApplicationMenu(buildAppMenu({
    onOpenSettings: () => {
      getOrCreateWindow();
      broadcast('view:show', { view: 'settings' });
    },
    onOpenBackups: () => shell.openPath(backupRoot()),
  }));

  tray = createTray({
    onOpenWindow: () => getOrCreateWindow(),
    onSendPbs: () => getOrCreateWindow(),
    onSettings: () => {
      getOrCreateWindow();
      broadcast('view:show', { view: 'settings' });
    },
    onOpenBackups: () => shell.openPath(backupRoot()),
  });

  // Open the window automatically on launch.
  getOrCreateWindow();

  // Background update check on launch + every 6h.
  const tryUpdateCheck = async () => {
    try { await autoUpdater.checkForUpdates(); }
    catch (err) { console.warn('[updater]', err && err.message); }
  };
  setTimeout(tryUpdateCheck, 5_000);
  setInterval(tryUpdateCheck, 6 * 60 * 60_000);
}

app.whenReady().then(setup);

app.on('window-all-closed', (e) => e.preventDefault());

app.on('before-quit', async () => {
  if (watcher) watcher.stop();
  if (discovery) discovery.stop();
  if (server) await server.close();
});
