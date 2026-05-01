const { TRACK_IDS, TRACK_NAMES, VEHICLES, CHARACTERS } = require('./constants');

const MAX_RKG_BYTES = 64 * 1024;
const MIN_RKG_BYTES = 0x90;

function validateRkg(buf) {
  if (!(buf instanceof Uint8Array)) return { ok: false, reason: 'not bytes' };
  if (buf.length < MIN_RKG_BYTES) return { ok: false, reason: 'rkg size below minimum' };
  if (buf.length > MAX_RKG_BYTES) return { ok: false, reason: 'rkg size above maximum (64KB)' };
  if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== 'RKGD') {
    return { ok: false, reason: 'bad rkg magic' };
  }
  const trackId = buf[0x07] >> 2;
  if (trackId < 0 || trackId > 31) return { ok: false, reason: 'track id out of range' };
  if (!(trackId in TRACK_IDS)) return { ok: false, reason: 'unknown track id' };
  const min = buf[0x04] >> 1;
  if (min > 99) return { ok: false, reason: 'insane minute field' };
  return { ok: true };
}

function formatTime(min, sec, mil) {
  return `${min}:${sec.toString().padStart(2, '0')}.${mil.toString().padStart(3, '0')}`;
}

function readTime(buf, off) {
  const min = buf[off] >> 1;
  const sec = ((buf[off] & 1) << 6) | (buf[off + 1] >> 2);
  const mil = ((buf[off + 1] & 3) << 8) | buf[off + 2];
  const timeMs = min * 60_000 + sec * 1000 + mil;
  return { min, sec, mil, timeMs, timeStr: formatTime(min, sec, mil) };
}

function summarize(buf) {
  const trackId = buf[0x07] >> 2;
  const mapping = TRACK_IDS[trackId];
  const trackIndex = mapping ? mapping[1] : trackId;
  const trackName = TRACK_NAMES[trackIndex] || `track ${trackId}`;

  const total = readTime(buf, 0x04);

  // Vehicle: byte 0x08 bits 7..2; Character: bits (0x08[1..0] << 4) | (0x09[7..4])
  const vehicleId = buf[0x08] >> 2;
  const characterId = ((buf[0x08] & 0x3) << 4) | (buf[0x09] >> 4);
  const vehicle = VEHICLES[vehicleId] || `vehicle ${vehicleId}`;
  const character = CHARACTERS[characterId] || `character ${characterId}`;

  // Lap count at 0x10, then 3 bytes per lap starting 0x11.
  const lapCount = buf[0x10];
  const lapTimes = [];
  for (let i = 0; i < lapCount; i++) {
    lapTimes.push(readTime(buf, 0x11 + i * 3));
  }

  // Mii name: UTF-16BE characters at 0x3E..0x52 (10 chars max).
  let miiName = '';
  for (let i = 0x3E; i < 0x52; i += 2) {
    const code = (buf[i] << 8) | buf[i + 1];
    if (code === 0) break;
    miiName += String.fromCharCode(code);
  }

  return {
    trackId, trackIndex, trackName,
    min: total.min, sec: total.sec, mil: total.mil,
    timeMs: total.timeMs, timeStr: total.timeStr,
    vehicleId, vehicle,
    characterId, character,
    lapCount, lapTimes,
    miiName,
  };
}

module.exports = { validateRkg, summarize, MAX_RKG_BYTES, MIN_RKG_BYTES };
