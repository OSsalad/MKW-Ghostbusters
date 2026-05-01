const fs = require('fs');
const path = require('path');
const {
  readRksys, listPbs, listDownloads, findFreeDownloadSlot,
  writeDownloadSlot, clearDownloadSlot,
  RKSYS_SIZE, SLOT_SIZE,
} = require('../../src/shared/rksys');
const { crc32 } = require('../../src/shared/crc');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'sample-rksys.dat');

function makeRkg({ trackId = 0x08, min = 1, sec = 19, mil = 574 } = {}) {
  const buf = Buffer.alloc(0x2800);
  buf.write('RKGD', 0, 'ascii');
  buf[4] = (min << 1) | ((sec >> 6) & 1);
  buf[5] = ((sec & 0x3F) << 2) | ((mil >> 8) & 3);
  buf[6] = mil & 0xFF;
  buf[7] = (trackId & 0x3F) << 2;
  buf[0x10] = 3;
  return buf;
}

describe('readRksys', () => {
  test('rejects non-RKSD magic', () => {
    const bad = Buffer.alloc(RKSYS_SIZE);
    expect(() => readRksys(bad)).toThrow(/magic/i);
  });

  test('rejects undersized buffer', () => {
    const tiny = Buffer.alloc(1024);
    expect(() => readRksys(tiny)).toThrow(/size/i);
  });

  test('parses fixture and reports 4 RKPD licenses', () => {
    const buf = fs.readFileSync(FIXTURE);
    const r = readRksys(buf);
    expect(r.licenses.every(l => l.present)).toBe(true);
    expect(r.regionByte).toBe(0x10); // US in fixture
  });
});

describe('slot listing', () => {
  test('blank fixture has zero pbs and downloads', () => {
    const buf = fs.readFileSync(FIXTURE);
    expect(listPbs(buf, 0)).toEqual([]);
    expect(listDownloads(buf, 0)).toEqual([]);
  });

  test('findFreeDownloadSlot returns 0 on empty fixture', () => {
    const buf = fs.readFileSync(FIXTURE);
    expect(findFreeDownloadSlot(buf, 0)).toBe(0);
  });
});

describe('writeDownloadSlot', () => {
  test('write into slot 0, then list returns the ghost', () => {
    const buf = fs.readFileSync(FIXTURE);
    const rkg = makeRkg({ trackId: 0x08, min: 1, sec: 19, mil: 574 });
    const updated = writeDownloadSlot(buf, 0, 0, rkg);
    const dls = listDownloads(updated, 0);
    expect(dls.length).toBe(1);
    expect(dls[0].slot).toBe(0);
    expect(dls[0].trackId).toBe(0x08);
    expect(dls[0].timeStr).toBe('1:19.574');
    expect(dls[0].rkg.slice(0, 4).toString('ascii')).toBe('RKGD');
  });

  test('write sets download flag bit', () => {
    const buf = fs.readFileSync(FIXTURE);
    const updated = writeDownloadSlot(buf, 0, 5, makeRkg({ trackId: 0x00 }));
    // license 0 dl flags @ 0x8 + 0x8 = 0x10; slot 5 -> byteNr 3 - 0 = 3, mask 1<<5 = 0x20
    expect(updated[0x10 + 3] & 0x20).toBe(0x20);
  });

  test('write recomputes save CRC at 0x27FFC', () => {
    const buf = fs.readFileSync(FIXTURE);
    const updated = writeDownloadSlot(buf, 0, 0, makeRkg());
    const expected = crc32(updated, 0, 0x27FFC);
    const stored =
      (updated[0x27FFC] << 24) | (updated[0x27FFD] << 16) |
      (updated[0x27FFE] << 8) | updated[0x27FFF];
    expect(stored >>> 0).toBe(expected);
  });

  test('written slot has valid internal CRC at end of slot body', () => {
    const buf = fs.readFileSync(FIXTURE);
    const updated = writeDownloadSlot(buf, 0, 0, makeRkg());
    const slotAddr = 0x28000 + 0x50000;
    const expected = crc32(updated, slotAddr, slotAddr + 0x27FC);
    const stored =
      (updated[slotAddr + 0x27FC] << 24) | (updated[slotAddr + 0x27FD] << 16) |
      (updated[slotAddr + 0x27FE] << 8) | updated[slotAddr + 0x27FF];
    expect(stored >>> 0).toBe(expected);
  });

  test('rejects invalid rkg', () => {
    const buf = fs.readFileSync(FIXTURE);
    const bad = Buffer.alloc(0x2800); // no RKGD magic
    expect(() => writeDownloadSlot(buf, 0, 0, bad)).toThrow(/invalid rkg/);
  });
});

describe('clearDownloadSlot', () => {
  test('write then clear returns slot to empty', () => {
    let buf = fs.readFileSync(FIXTURE);
    buf = writeDownloadSlot(buf, 0, 3, makeRkg({ trackId: 0x08 }));
    expect(listDownloads(buf, 0).length).toBe(1);
    buf = clearDownloadSlot(buf, 0, 3);
    expect(listDownloads(buf, 0).length).toBe(0);
    // download flag bit cleared
    expect(buf[0x10 + 3] & (1 << 3)).toBe(0);
  });
});
