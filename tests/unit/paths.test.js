const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectRksysPath, candidateBases } = require('../../src/main/paths');

describe('paths', () => {
  test('candidateBases returns at least one path', () => {
    expect(candidateBases().length).toBeGreaterThan(0);
  });

  test('detectRksysPath finds an existing candidate', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dolphin-'));
    const realPath = path.join(root, 'Wii', 'title', '00010004', '524d4350', 'data', 'rksys.dat');
    fs.mkdirSync(path.dirname(realPath), { recursive: true });
    fs.writeFileSync(realPath, Buffer.alloc(16));
    expect(detectRksysPath([root])).toBe(realPath);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('detectRksysPath returns null when no candidates exist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'no-dolphin-'));
    expect(detectRksysPath([root])).toBeNull();
    fs.rmSync(root, { recursive: true, force: true });
  });
});
