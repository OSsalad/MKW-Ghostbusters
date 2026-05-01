const fs = require('fs');
const path = require('path');
const os = require('os');

// Mario Kart Wii game IDs as ASCII, then hex-encoded the way Dolphin stores
// the directory name on disk (e.g. "RMCP" -> "524d4350").
const GAME_IDS_ASCII = ['RMCE', 'RMCP', 'RMCJ', 'RMCK'];
const GAME_IDS = GAME_IDS_ASCII.map(id =>
  Buffer.from(id, 'ascii').toString('hex')
);

// Dolphin stores disc-based game saves under title category 00010004.
const TITLE_CATEGORY = '00010004';

function candidateBases() {
  const home = os.homedir();
  return [
    path.join(home, 'AppData', 'Roaming', 'Dolphin Emulator'),
    path.join(home, 'Documents', 'Dolphin Emulator'),
  ];
}

function detectRksysPath(bases = candidateBases()) {
  for (const base of bases) {
    for (const gid of GAME_IDS) {
      const p = path.join(base, 'Wii', 'title', TITLE_CATEGORY, gid, 'data', 'rksys.dat');
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

module.exports = { detectRksysPath, candidateBases, GAME_IDS, GAME_IDS_ASCII, TITLE_CATEGORY };
