const { validateRkg, summarize } = require('../../src/shared/rkg');

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

describe('rkg.validateRkg', () => {
  test('accepts a well-formed rkg', () => {
    expect(validateRkg(makeRkg())).toEqual({ ok: true });
  });
  test('rejects bad magic', () => {
    const bad = makeRkg();
    bad[0] = 0;
    const r = validateRkg(bad);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/magic/i);
  });
  test('rejects oversized buffer', () => {
    const big = Buffer.alloc(70_000);
    big.write('RKGD', 0, 'ascii');
    const r = validateRkg(big);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/size/i);
  });
  test('rejects undersized buffer', () => {
    const tiny = Buffer.alloc(0x80);
    tiny.write('RKGD', 0, 'ascii');
    const r = validateRkg(tiny);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/size/i);
  });
});

describe('rkg.summarize', () => {
  test('extracts track and time', () => {
    const s = summarize(makeRkg({ trackId: 0x08, min: 1, sec: 19, mil: 574 }));
    expect(s.trackId).toBe(0x08);
    // TRACK_IDS[0x08] = [0, 0]; TRACK_NAMES[0] = "Luigi Circuit"
    expect(s.trackIndex).toBe(0);
    expect(s.trackName).toBe('Luigi Circuit');
    expect(s.timeMs).toBe(1 * 60_000 + 19 * 1000 + 574);
    expect(s.timeStr).toBe('1:19.574');
  });

  test('maps Grumble Volcano course id correctly', () => {
    // Raw rkg byte 0x03 → TRACK_IDS[0x03] = [10, 11] → TRACK_NAMES[11] = "Grumble Volcano"
    const s = summarize(makeRkg({ trackId: 0x03 }));
    expect(s.trackName).toBe('Grumble Volcano');
  });

  test('zero-pads sec and mil', () => {
    const s = summarize(makeRkg({ trackId: 0x00, min: 0, sec: 5, mil: 7 }));
    expect(s.timeStr).toBe('0:05.007');
  });
});
