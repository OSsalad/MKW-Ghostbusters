const { Menu, app, shell } = require('electron');

function buildAppMenu({ onOpenSettings, onOpenBackups }) {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Settings...', accelerator: 'CmdOrCtrl+,', click: onOpenSettings },
        { label: 'Open backups folder', click: onOpenBackups },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Project source',
          click: () => shell.openExternal('https://github.com/'),
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

module.exports = { buildAppMenu };
