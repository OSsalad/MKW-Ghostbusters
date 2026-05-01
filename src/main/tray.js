const { Tray, Menu, app, nativeImage } = require('electron');
const path = require('path');

function createTray({ onOpenWindow, onSendPbs, onSettings, onOpenBackups }) {
  const assetsDir = path.join(__dirname, '..', '..', 'assets');
  // Prefer the multi-resolution .ico — Windows picks the best embedded size
  // for the tray (typically 16x16 or 32x32 on high-DPI), giving sharper
  // edges than a downscaled PNG.
  const icoPath = path.join(assetsDir, 'tray.ico');
  const pngPath = path.join(assetsDir, 'tray.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(icoPath);
    if (icon.isEmpty()) icon = nativeImage.createFromPath(pngPath).resize({ width: 32, height: 32 });
  } catch {
    icon = nativeImage.createFromPath(pngPath).resize({ width: 32, height: 32 });
  }
  const tray = new Tray(icon);
  const menu = Menu.buildFromTemplate([
    { label: 'Open Ghost Manager', click: onOpenWindow },
    { label: 'Send PBs...', click: onSendPbs },
    { type: 'separator' },
    { label: 'Settings...', click: onSettings },
    { label: 'Open backups folder', click: onOpenBackups },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip('MKW Ghostbusters');
  tray.on('click', onOpenWindow);
  return tray;
}

module.exports = { createTray };
