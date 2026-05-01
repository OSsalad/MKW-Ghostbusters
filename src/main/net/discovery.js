const { Bonjour } = require('bonjour-service');
const { EventEmitter } = require('events');

const SERVICE_TYPE = 'mkw-ghost';

class Discovery extends EventEmitter {
  constructor({ uuid, port }) {
    super();
    this.uuid = uuid;
    this.port = port;
    this.bonjour = new Bonjour();
    this.publication = null;
    this.browser = null;
    this.peers = new Map(); // uuid -> { host, addresses, port }
  }

  start() {
    // Suffix with a random nonce so re-launches don't collide with stale mDNS
    // entries the OS hasn't yet evicted.
    const nonce = Math.random().toString(36).slice(2, 8);
    this.publication = this.bonjour.publish({
      name: `mkw-${this.uuid.slice(0, 8)}-${nonce}`,
      type: SERVICE_TYPE,
      port: this.port,
      txt: { uuid: this.uuid },
    });
    this.publication.on('error', (err) => this.emit('error', err));
    this.browser = this.bonjour.find({ type: SERVICE_TYPE });
    this.browser.on('up', (svc) => {
      const peerUuid = svc.txt && svc.txt.uuid;
      if (!peerUuid || peerUuid === this.uuid) return;
      const info = { host: svc.host, addresses: svc.addresses, port: svc.port };
      this.peers.set(peerUuid, info);
      this.emit('peer-up', { uuid: peerUuid, ...info });
    });
    this.browser.on('down', (svc) => {
      const peerUuid = svc.txt && svc.txt.uuid;
      if (peerUuid && this.peers.delete(peerUuid)) {
        this.emit('peer-down', { uuid: peerUuid });
      }
    });
  }

  stop() {
    if (this.browser) this.browser.stop();
    if (this.publication) this.publication.stop();
    this.bonjour.destroy();
  }

  getPeers() {
    return Array.from(this.peers.entries()).map(([uuid, info]) => ({ uuid, ...info }));
  }
}

module.exports = { Discovery, SERVICE_TYPE };
