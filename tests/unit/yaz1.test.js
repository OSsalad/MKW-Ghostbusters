const { compress, decompress } = require('../../src/shared/yaz1');

describe('YAZ1', () => {
  test('decompress(compress(data)) returns original bytes', () => {
    const original = Buffer.from([0x52, 0x4B, 0x47, 0x44, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C]);
    const compressed = compress(original);
    expect(Buffer.from(compressed.slice(0, 4)).toString('ascii')).toBe('Yaz1');
    const decompressed = decompress(compressed);
    expect(Buffer.from(decompressed)).toEqual(original);
  });

  test('round-trips a longer non-aligned buffer', () => {
    const original = new Uint8Array(133);
    for (let i = 0; i < original.length; i++) original[i] = (i * 37) & 0xFF;
    const out = decompress(compress(original));
    expect(Buffer.from(out)).toEqual(Buffer.from(original));
  });

  test('decompress rejects non-Yaz1 magic', () => {
    const bad = Buffer.from([0x00, 0x00, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() => decompress(bad)).toThrow(/magic/i);
  });
});
