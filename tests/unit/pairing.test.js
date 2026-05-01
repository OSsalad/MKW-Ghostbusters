const { generatePin, deriveKey, makeProof, verifyProof } = require('../../src/main/net/pairing');

describe('pairing', () => {
  test('generatePin returns 6 digits', () => {
    expect(generatePin()).toMatch(/^\d{6}$/);
  });

  test('matching PIN derives the same key', () => {
    const ka = deriveKey('123456', 'na', 'nb');
    const kb = deriveKey('123456', 'na', 'nb');
    expect(ka.equals(kb)).toBe(true);
    expect(ka.length).toBe(32);
  });

  test('mismatched PIN derives different keys', () => {
    const ka = deriveKey('123456', 'na', 'nb');
    const kb = deriveKey('999999', 'na', 'nb');
    expect(ka.equals(kb)).toBe(false);
  });

  test('makeProof / verifyProof round trip', () => {
    const k = deriveKey('111111', 'a', 'b');
    const p = makeProof(k, 'transcript-data');
    expect(verifyProof(k, 'transcript-data', p)).toBe(true);
    expect(verifyProof(k, 'tampered', p)).toBe(false);
  });

  test('verifyProof rejects tampered proof bytes', () => {
    const k = deriveKey('111111', 'a', 'b');
    const p = makeProof(k, 'data');
    const bad = (p[0] === '0' ? '1' : '0') + p.slice(1);
    expect(verifyProof(k, 'data', bad)).toBe(false);
  });
});
