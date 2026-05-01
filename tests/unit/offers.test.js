const { signOffer, verifyOffer, OfferQueue } = require('../../src/main/net/offers');

describe('offer signing', () => {
  const key = Buffer.alloc(32, 1);

  test('sign + verify good offer', () => {
    const body = { senderUuid: 'x', ghosts: [] };
    const headers = signOffer(key, body);
    expect(verifyOffer(key, headers, body)).toBe(true);
  });

  test('reject tampered body', () => {
    const body = { senderUuid: 'x', ghosts: [] };
    const headers = signOffer(key, body);
    expect(verifyOffer(key, headers, { ...body, senderUuid: 'y' })).toBe(false);
  });

  test('reject missing headers', () => {
    expect(verifyOffer(key, {}, { x: 1 })).toBe(false);
  });

  test('reject wrong key', () => {
    const body = { x: 1 };
    const headers = signOffer(key, body);
    const wrong = Buffer.alloc(32, 2);
    expect(verifyOffer(wrong, headers, body)).toBe(false);
  });
});

describe('OfferQueue', () => {
  test('pending offer resolves when accept is called', async () => {
    const q = new OfferQueue();
    const { id, promise } = q.enqueue({ senderUuid: 's', ghosts: [] });
    expect(q.list().some(p => p.id === id)).toBe(true);
    q.resolve(id, { accepted: true });
    await expect(promise).resolves.toEqual({ accepted: true });
    expect(q.list().some(p => p.id === id)).toBe(false);
  });

  test('expireOlderThan resolves stale entries with timeout', async () => {
    const q = new OfferQueue();
    const { id, promise } = q.enqueue({});
    // Force createdAt into the past
    q.get(id).createdAt = Date.now() - 10_000;
    q.expireOlderThan(5_000);
    await expect(promise).resolves.toEqual({ accepted: false, reason: 'timeout' });
  });
});
