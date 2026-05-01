const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const MAX_AUTO_BACKUPS = 10;

function autoDir(rootDir) {
  const d = path.join(rootDir, 'auto');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function autoBackup(srcFile, rootDir) {
  const dir = autoDir(rootDir);
  // Use hr time to guarantee uniqueness even within the same millisecond.
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const seq = process.hrtime.bigint().toString().slice(-6);
  const dst = path.join(dir, `rksys-${ts}-${seq}.dat`);
  fs.copyFileSync(srcFile, dst);
  for (const old of listAutoBackups(rootDir).slice(MAX_AUTO_BACKUPS)) {
    fs.unlinkSync(old);
  }
  return dst;
}

function listAutoBackups(rootDir) {
  const dir = autoDir(rootDir);
  return fs.readdirSync(dir)
    .filter(n => n.startsWith('rksys-') && n.endsWith('.dat'))
    .map(n => path.join(dir, n))
    .sort()
    .reverse();
}

function userBackupDir(rootDir) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(rootDir, ts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// rkgEntries: [{ rkg: Buffer, slot: number, trackName?: string }]
function zipGhosts(rkgEntries, rootDir) {
  const dir = userBackupDir(rootDir);
  const file = path.join(dir, 'ghosts.zip');
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file);
    const z = archiver('zip');
    z.on('error', reject);
    out.on('close', () => resolve(file));
    z.pipe(out);
    for (const e of rkgEntries) {
      const name = `${e.trackName || 'ghost'}-${e.slot}.rkg`;
      z.append(e.rkg, { name });
    }
    z.finalize();
  });
}

module.exports = { autoBackup, listAutoBackups, userBackupDir, zipGhosts };
