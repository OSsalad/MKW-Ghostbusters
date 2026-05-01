const fs = require('fs');
const os = require('os');
const path = require('path');
const { autoBackup, listAutoBackups, zipGhosts } = require('../../src/main/backups');

describe('autoBackup', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('creates timestamped copy', () => {
    const src = path.join(dir, 'rksys.dat');
    fs.writeFileSync(src, 'hello');
    const out = autoBackup(src, dir);
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.readFileSync(out, 'utf8')).toBe('hello');
  });

  test('keeps only 10 most recent', () => {
    const src = path.join(dir, 'rksys.dat');
    fs.writeFileSync(src, 'data');
    for (let i = 0; i < 15; i++) autoBackup(src, dir);
    expect(listAutoBackups(dir).length).toBe(10);
  });
});

describe('zipGhosts', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('writes a non-empty zip file', async () => {
    const entries = [
      { rkg: Buffer.from('RKGD-aaa'), slot: 0, trackName: 'LC' },
      { rkg: Buffer.from('RKGD-bbb'), slot: 1, trackName: 'MMM' },
    ];
    const file = await zipGhosts(entries, dir);
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.statSync(file).size).toBeGreaterThan(0);
  });
});
