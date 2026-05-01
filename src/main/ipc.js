const { ipcMain } = require('electron');

function registerIpc({ pbsApi, offersApi, pairingApi, statusApi }) {
  ipcMain.handle('pbs:list', () => pbsApi.list());
  ipcMain.handle('offer:send', (_e, slots) => offersApi.send(slots));
  ipcMain.handle('offer:listPending', () => offersApi.listPending());
  ipcMain.handle('offer:decide', (_e, args) =>
    offersApi.decide(args.id, args.accept, args)
  );
  ipcMain.handle('pair:start', (_e, mode) => pairingApi.start(mode));
  ipcMain.handle('pair:enterPin', (_e, pin) => pairingApi.enterPin(pin));
  ipcMain.handle('status', () => statusApi.snapshot());
}

module.exports = { registerIpc };
