const express = require('express');

function startServer({ onOffer, onPairInit, onPairConfirm, onPairRequest } = {}) {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // simple per-IP rate limiter (~30 req/min)
  const buckets = new Map();
  app.use((req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const bucket = buckets.get(ip) || { count: 0, reset: now + 60_000 };
    if (now > bucket.reset) { bucket.count = 0; bucket.reset = now + 60_000; }
    bucket.count++;
    buckets.set(ip, bucket);
    if (bucket.count > 30) return res.status(429).end();
    next();
  });

  app.get('/health', (_req, res) => res.send('ok'));

  app.post('/offer', async (req, res) => {
    if (!onOffer) return res.status(503).end();
    try {
      const decision = await onOffer(req.body, req.headers);
      res.status(decision.accepted ? 200 : 403).json(decision.result || {});
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/pair/request', async (req, res) => {
    if (!onPairRequest) return res.status(503).end();
    try { res.json(await onPairRequest(req.body, req.ip)); }
    catch (err) { res.status(403).json({ error: err.message }); }
  });

  app.post('/pair/init', async (req, res) => {
    if (!onPairInit) return res.status(503).end();
    try { res.json(await onPairInit(req.body)); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });

  app.post('/pair/confirm', async (req, res) => {
    if (!onPairConfirm) return res.status(503).end();
    try { res.json(await onPairConfirm(req.body)); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });

  return new Promise((resolve) => {
    const httpSrv = app.listen(0, '0.0.0.0', () => {
      const port = httpSrv.address().port;
      resolve({
        port,
        close: () => new Promise(r => httpSrv.close(() => r())),
      });
    });
  });
}

module.exports = { startServer };
