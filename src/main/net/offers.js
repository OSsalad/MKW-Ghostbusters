const crypto = require('crypto');

function signOffer(key, body) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = nonce + '|' + JSON.stringify(body);
  const sig = crypto.createHmac('sha256', key).update(payload).digest('hex');
  return { 'x-nonce': nonce, 'x-sig': sig };
}

function verifyOffer(key, headers, body) {
  const nonce = headers['x-nonce'];
  const sig = headers['x-sig'];
  if (!nonce || !sig) return false;
  const expected = crypto.createHmac('sha256', key)
    .update(nonce + '|' + JSON.stringify(body)).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

class OfferQueue {
  constructor() { this.pending = new Map(); }

  enqueue(body) {
    const id = crypto.randomUUID();
    let resolveFn;
    const promise = new Promise((resolve) => { resolveFn = resolve; });
    this.pending.set(id, { id, body, resolve: resolveFn, createdAt: Date.now() });
    return { id, promise };
  }

  list() {
    return [...this.pending.values()].map(({ resolve, ...rest }) => rest);
  }

  get(id) { return this.pending.get(id); }

  resolve(id, result) {
    const e = this.pending.get(id);
    if (!e) return false;
    this.pending.delete(id);
    e.resolve(result);
    return true;
  }

  expireOlderThan(ms) {
    const cutoff = Date.now() - ms;
    const expiredIds = [];
    for (const [id, e] of this.pending) {
      if (e.createdAt < cutoff) {
        e.resolve({ accepted: false, reason: 'timeout' });
        this.pending.delete(id);
        expiredIds.push(id);
      }
    }
    return expiredIds;
  }
}

module.exports = { signOffer, verifyOffer, OfferQueue };
