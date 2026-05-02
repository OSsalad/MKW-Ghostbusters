const { BrowserWindow } = require('electron');
const path = require('path');

let win = null;
let readyPromise = null;

function getOrCreateWindow() {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return win;
  }
  win = new BrowserWindow({
    width: 1000,
    height: 760,
    title: 'MKW Ghostbusters',
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Without this, when the window comes from a tray-only state Chromium
      // throttles the renderer and keystrokes silently don't propagate
      // until DevTools is opened. Disabling throttling keeps input alive.
      backgroundThrottling: false,
    },
  });
  readyPromise = new Promise((resolve) => {
    win.webContents.once('did-finish-load', resolve);
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('closed', () => { win = null; readyPromise = null; });
  return win;
}

async function ensureWindowReady() {
  const w = getOrCreateWindow();
  if (readyPromise) await readyPromise;
  return w;
}

// Returns the existing main window, or null if it hasn't been created /
// has been closed. Use this when you want to check visibility WITHOUT
// implicitly creating the window.
function existingWindow() {
  return win && !win.isDestroyed() ? win : null;
}

// Force the window to grab the foreground on Windows, bypassing the OS's
// anti-focus-stealing protection. Used when an incoming pair request /
// offer needs the user's immediate attention.
function claimFocus() {
  if (!win || win.isDestroyed()) return;
  win.show();
  win.setAlwaysOnTop(true);
  win.focus();
  if (win.isMinimized()) win.restore();
  win.moveTop();
  setTimeout(() => {
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(false);
  }, 200);
  if (process.platform === 'win32') {
    try { win.flashFrame(true); } catch (_) {}
  }
}

function broadcast(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

module.exports = { getOrCreateWindow, ensureWindowReady, existingWindow, claimFocus, broadcast };
