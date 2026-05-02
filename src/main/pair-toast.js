const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

let toastWin = null;
let pendingResolver = null;

function showPairToast({ initiator, onSubmit, onCancel }) {
  closePairToast();

  const display = screen.getPrimaryDisplay();
  const W = 360;
  const H = 230;
  const margin = 20;

  toastWin = new BrowserWindow({
    width: W,
    height: H,
    x: display.workArea.x + display.workArea.width - W - margin,
    y: display.workArea.y + display.workArea.height - H - margin,
    frame: false,
    transparent: false,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'pair-toast-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  toastWin.loadFile(path.join(__dirname, '..', 'renderer', 'pair-toast.html'));
  toastWin.once('ready-to-show', () => {
    toastWin.show();
    toastWin.focus();
    toastWin.webContents.send('toast:initiator', { initiator });
  });
  toastWin.on('closed', () => { toastWin = null; });

  // Wire one-shot handlers tied to this toast.
  pendingResolver = { onSubmit, onCancel };
}

function closePairToast() {
  if (toastWin && !toastWin.isDestroyed()) toastWin.close();
  toastWin = null;
  pendingResolver = null;
}

function registerIpc() {
  ipcMain.handle('toast:submit', async (_e, pin) => {
    if (!pendingResolver) return { ok: false, reason: 'no active toast' };
    const r = await pendingResolver.onSubmit(pin);
    return r;
  });
  ipcMain.on('toast:cancel', () => {
    if (pendingResolver && pendingResolver.onCancel) pendingResolver.onCancel();
    closePairToast();
  });
  ipcMain.on('toast:close', () => closePairToast());
}

module.exports = { showPairToast, closePairToast, registerIpc };
