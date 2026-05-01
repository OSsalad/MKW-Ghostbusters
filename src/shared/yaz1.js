// Ported from ghostmanager/Scripts/YAZ1_comp.js and YAZ1_decomp.js.
// Inputs/outputs are Uint8Array (Buffer is a subclass, accepted transparently).

function decompress(input) {
  const src = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (src.length < 16) throw new Error('Yaz1 input too short');
  const magic = String.fromCharCode(src[0], src[1], src[2], src[3]);
  if (magic !== 'Yaz1') throw new Error('Yaz1 magic missing');
  const decompressedSize =
    ((src[4] << 24) | (src[5] << 16) | (src[6] << 8) | src[7]) >>> 0;
  const out = new Uint8Array(decompressedSize);
  let srcPos = 16;
  let dstPos = 0;
  let validBits = 0;
  let codeByte = 0;
  while (dstPos < decompressedSize) {
    if (validBits === 0) {
      codeByte = src[srcPos++];
      validBits = 8;
    }
    if ((codeByte & 0x80) !== 0) {
      out[dstPos++] = src[srcPos++];
    } else {
      const b1 = src[srcPos++];
      const b2 = src[srcPos++];
      const dist = ((b1 & 0x0F) << 8) | b2;
      const copySrc = dstPos - dist - 1;
      let n = b1 >> 4;
      if (n === 0) n = src[srcPos++] + 0x12;
      else n += 2;
      for (let i = 0; i < n; i++) out[dstPos++] = out[copySrc + i];
    }
    codeByte = (codeByte << 1) & 0xFF;
    validBits--;
  }
  return out;
}

function compress(input) {
  const src = input instanceof Uint8Array ? input : new Uint8Array(input);
  // Header: "Yaz1" + uint32 BE decompressed size + 8 bytes reserved
  const header = new Uint8Array(16);
  header[0] = 0x59; header[1] = 0x61; header[2] = 0x7A; header[3] = 0x31;
  const len = src.length;
  header[4] = (len >>> 24) & 0xFF;
  header[5] = (len >>> 16) & 0xFF;
  header[6] = (len >>> 8) & 0xFF;
  header[7] = len & 0xFF;

  // Simple non-matching encoder: emit every byte as literal.
  // Adequate here — rkg ghosts are small and we don't compress for transit.
  // Each group: 1 flag byte (8 bits, 1 = literal, 0 = back-ref) + up to 8 bytes.
  const chunks = [header];
  let i = 0;
  while (i < len) {
    const groupLen = Math.min(8, len - i);
    const group = new Uint8Array(1 + groupLen);
    // Top groupLen bits set = all literals.
    group[0] = (0xFF << (8 - groupLen)) & 0xFF;
    for (let j = 0; j < groupLen; j++) group[1 + j] = src[i + j];
    chunks.push(group);
    i += groupLen;
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

module.exports = { compress, decompress };
