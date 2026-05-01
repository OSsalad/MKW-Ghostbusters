const chokidar = require('chokidar');
const { EventEmitter } = require('events');

class RksysWatcher extends EventEmitter {
  constructor(savePath) {
    super();
    this.savePath = savePath;
    this.watcher = null;
  }

  start() {
    this.watcher = chokidar.watch(this.savePath, {
      awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 },
      ignoreInitial: true,
    });
    this.watcher.on('change', () => this.emit('changed', this.savePath));
    this.watcher.on('error', (err) => this.emit('error', err));
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

module.exports = { RksysWatcher };
