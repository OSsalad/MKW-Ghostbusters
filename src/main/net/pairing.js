const crypto = require('crypto');

function generatePin() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function deriveKey(pin, nonceA, nonceB) {
  // HKDF-SHA256(salt = nonceA || nonceB, ikm = pin, info = 'mkw-ghost-pair', length = 32)
  const salt = Buffer.concat([Buffer.from(nonceA), Buffer.from(nonceB)]);
  // hkdfSync returns ArrayBuffer; wrap so .equals() / .copy() work like a Buffer.
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(pin), salt, 'mkw-ghost-pair', 32));
}

function makeProof(key, transcript) {
  return crypto.createHmac('sha256', Buffer.from(key))
    .update(transcript).digest('hex');
}

function verifyProof(key, transcript, proofHex) {
  const expected = makeProof(key, transcript);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(proofHex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { generatePin, deriveKey, makeProof, verifyProof };
