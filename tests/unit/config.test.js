const fs = require('fs');
const os = require('os');
const path = require('path');
const { Config } = require('../../src/main/config');

describe('Config', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('load on missing file returns default with new uuid', () => {
    const c = new Config(dir);
    const data = c.load();
    expect(data.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.peers).toEqual({});
    expect(data.savePath).toBeNull();
  });

  test('save then reload round-trips peers', () => {
    const c = new Config(dir);
    const data = c.load();
    data.peers['abc'] = { hmacKey: 'aa', lastHost: 'h' };
    c.save(data);
    const c2 = new Config(dir);
    expect(c2.load().peers.abc).toEqual({ hmacKey: 'aa', lastHost: 'h' });
  });

  test('uuid is stable across reloads', () => {
    const c = new Config(dir);
    const a = c.load().uuid;
    const b = c.load().uuid;
    expect(a).toBe(b);
  });
});
