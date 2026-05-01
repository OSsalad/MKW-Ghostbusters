const { crc32 } = require('./crc');
const { summarize, validateRkg } = require('./rkg');
const { TRACK_IDS } = require('./constants');

// Layout (from ghostmanager/Scripts/import_export.js):
//   0x000000..0x027FFC : save data (header, 4 license blocks, time entries, flags)
//   0x027FFC..0x028000 : CRC32 over the preceding save data
//   0x028000..0x2BC000 : ghost files area (4 licenses * 0xA5000)
//     Per-license: 32 PB slots (0x2800 each) starting at offset 0,
//                  then 32 download slots starting at offset 0x50000.
const RKSYS_SIZE = 0x2BC000;
const SAVE_DATA_END = 0x27FFC;
const SAVE_CRC_OFFSET = 0x27FFC;
const GHOST_AREA_BASE = 0x28000;
const LICENSE_GHOST_STRIDE = 0xA5000;
const SLOT_SIZE = 0x2800;
const DOWNLOAD_OFFSET = 0x50000;
const SLOTS = 32;
const RKG_BODY_SIZE = 0x27FC; // ghost bytes before its own internal CRC32

// Per-save-data license bookkeeping
const LICENSE_HEADER_OFFSET = 0x8;
const LICENSE_HEADER_STRIDE = 0x8CC0;
const PB_FLAGS_OFFSET = 0x4;       // relative to license header
const DL_FLAGS_OFFSET = 0x8;       // relative to license header
const TIME_ENTRY_BASE = 0xDB8;     // relative to license header
const TIME_ENTRY_STRIDE = 0x60;
const REGION_OFFSET = 0x26B0A;

function ghostAreaAddr(licenseIndex) {
  return GHOST_AREA_BASE + LICENSE_GHOST_STRIDE * licenseIndex;
}

function licenseHeaderAddr(licenseIndex) {
  return LICENSE_HEADER_OFFSET + LICENSE_HEADER_STRIDE * licenseIndex;
}

function readRksys(buf) {
  if (buf.length < RKSYS_SIZE) {
    throw new Error(`rksys.dat wrong size: got ${buf.length}, expected ${RKSYS_SIZE}`);
  }
  if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== 'RKSD') {
    throw new Error('rksys.dat magic missing');
  }
  const licenses = [];
  for (let i = 0; i < 4; i++) {
    const off = licenseHeaderAddr(i);
    const present = String.fromCharCode(buf[off], buf[off+1], buf[off+2], buf[off+3]) === 'RKPD';
    licenses.push({ index: i, present });
  }
  return { regionByte: buf[REGION_OFFSET], licenses };
}

function listSlots(buf, licenseIndex, kind) {
  const base = ghostAreaAddr(licenseIndex) + (kind === 'download' ? DOWNLOAD_OFFSET : 0);
  const out = [];
  for (let slot = 0; slot < SLOTS; slot++) {
    const addr = base + slot * SLOT_SIZE;
    if (String.fromCharCode(buf[addr], buf[addr+1], buf[addr+2], buf[addr+3]) === 'RKGD') {
      const rkg = Buffer.from(buf.slice(addr, addr + SLOT_SIZE));
      out.push({ slot, addr, rkg, ...summarize(rkg) });
    }
  }
  return out;
}

const listPbs = (buf, i) => listSlots(buf, i, 'pb');
const listDownloads = (buf, i) => listSlots(buf, i, 'download');

function findFreeDownloadSlot(buf, licenseIndex) {
  const base = ghostAreaAddr(licenseIndex) + DOWNLOAD_OFFSET;
  for (let slot = 0; slot < SLOTS; slot++) {
    const addr = base + slot * SLOT_SIZE;
    if (String.fromCharCode(buf[addr], buf[addr+1], buf[addr+2], buf[addr+3]) !== 'RKGD') {
      return slot;
    }
  }
  return -1;
}

// Prepare an rkg for embedding in the save: pad/truncate to RKG_BODY_SIZE,
// set the ghost-type byte at 0xD, and append a 4-byte CRC32 at the end so
// the slot is exactly SLOT_SIZE bytes.
function prepareRkgForDownloadSlot(rkg, slot) {
  const body = Buffer.alloc(RKG_BODY_SIZE);
  rkg.copy(body, 0, 0, Math.min(rkg.length, RKG_BODY_SIZE));
  // decompression flag at 0xC: 0x00 (uncompressed in slot)
  body[0x0C] = 0x00;
  // ghost type at 0xD: friend ghosts (slots 0..29) use (0x7 + slot) << 2;
  // slots 30-31 are wr/cr style (slot - 28) << 2.
  let ghostType;
  if (slot < 30) ghostType = (0x7 + slot) << 2;
  else ghostType = (slot - 28) << 2;
  body[0x0D] = (body[0x0D] & 0x03) | ghostType;
  // Internal CRC32 over the prepared body.
  const c = crc32(body);
  const out = Buffer.alloc(SLOT_SIZE);
  body.copy(out, 0);
  out[RKG_BODY_SIZE]     = (c >>> 24) & 0xFF;
  out[RKG_BODY_SIZE + 1] = (c >>> 16) & 0xFF;
  out[RKG_BODY_SIZE + 2] = (c >>> 8) & 0xFF;
  out[RKG_BODY_SIZE + 3] = c & 0xFF;
  return out;
}

function setDownloadFlag(buf, licenseIndex, slot, on) {
  const flagsBase = licenseHeaderAddr(licenseIndex) + DL_FLAGS_OFFSET;
  const byteNr = 3 - Math.floor(slot / 8);
  const mask = 1 << (slot % 8);
  if (on) buf[flagsBase + byteNr] |= mask;
  else buf[flagsBase + byteNr] &= ~mask;
}

function writeSaveCrc(buf) {
  const c = crc32(buf, 0, SAVE_CRC_OFFSET);
  buf[SAVE_CRC_OFFSET]     = (c >>> 24) & 0xFF;
  buf[SAVE_CRC_OFFSET + 1] = (c >>> 16) & 0xFF;
  buf[SAVE_CRC_OFFSET + 2] = (c >>> 8) & 0xFF;
  buf[SAVE_CRC_OFFSET + 3] = c & 0xFF;
}

function writeDownloadSlot(buf, licenseIndex, slot, rkg) {
  const v = validateRkg(rkg);
  if (!v.ok) throw new Error(`invalid rkg: ${v.reason}`);
  const out = Buffer.from(buf);
  const addr = ghostAreaAddr(licenseIndex) + DOWNLOAD_OFFSET + slot * SLOT_SIZE;
  const prepared = prepareRkgForDownloadSlot(rkg, slot);
  prepared.copy(out, addr);
  setDownloadFlag(out, licenseIndex, slot, true);
  writeSaveCrc(out);
  return out;
}

function clearDownloadSlot(buf, licenseIndex, slot) {
  const out = Buffer.from(buf);
  const addr = ghostAreaAddr(licenseIndex) + DOWNLOAD_OFFSET + slot * SLOT_SIZE;
  out.fill(0, addr, addr + SLOT_SIZE);
  setDownloadFlag(out, licenseIndex, slot, false);
  writeSaveCrc(out);
  return out;
}

// Helper for tests / first-run: pad a partial blank rksys.dat (only save data)
// up to the full RKSYS_SIZE so it can be used as a write target.
function expandToFullSize(blank) {
  const out = Buffer.alloc(RKSYS_SIZE);
  blank.copy(out, 0, 0, Math.min(blank.length, RKSYS_SIZE));
  return out;
}

module.exports = {
  readRksys,
  listPbs, listDownloads,
  findFreeDownloadSlot,
  writeDownloadSlot, clearDownloadSlot,
  prepareRkgForDownloadSlot,
  setDownloadFlag, writeSaveCrc,
  expandToFullSize,
  RKSYS_SIZE, SLOTS, SLOT_SIZE,
};
