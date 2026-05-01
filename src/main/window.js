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

function broadcast(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

module.exports = { getOrCreateWindow, ensureWindowReady, broadcast };
