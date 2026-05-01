const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class Config {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'config.json');
  }

  load() {
    if (!fs.existsSync(this.file)) {
      const data = { uuid: crypto.randomUUID(), peers: {}, savePath: null, manualPeer: null };
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(data, null, 2));
      return data;
    }
    return JSON.parse(fs.readFileSync(this.file, 'utf8'));
  }

  save(data) {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2));
  }
}

function defaultDir() {
  const appData = process.env.APPDATA || path.join(os.homedir(), '.config');
  return path.join(appData, 'mkw-ghost-share');
}

module.exports = { Config, defaultDir };
