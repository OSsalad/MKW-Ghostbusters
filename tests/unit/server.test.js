const http = require('http');
const { startServer } = require('../../src/main/net/server');

function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (r) => {
      let body = '';
      r.on('data', d => body += d);
      r.on('end', () => resolve({ status: r.statusCode, body }));
    }).on('error', reject);
  });
}

function postJson(port, path, body, headers = {}) {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: 'POST', host: '127.0.0.1', port, path,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
    }, (r) => {
      let buf = '';
      r.on('data', d => buf += d);
      r.on('end', () => resolve({ status: r.statusCode, body: buf ? JSON.parse(buf) : null }));
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

describe('server', () => {
  test('serves /health', async () => {
    const srv = await startServer({});
    const r = await get(srv.port, '/health');
    expect(r.status).toBe(200);
    expect(r.body).toBe('ok');
    await srv.close();
  });

  test('/offer 503 when no handler wired', async () => {
    const srv = await startServer({});
    const r = await postJson(srv.port, '/offer', { x: 1 });
    expect(r.status).toBe(503);
    await srv.close();
  });

  test('/offer routes to handler and returns its decision', async () => {
    const srv = await startServer({
      onOffer: async () => ({ accepted: true, result: { ok: 1 } }),
    });
    const r = await postJson(srv.port, '/offer', { x: 1 });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: 1 });
    await srv.close();
  });

  test('/offer returns 403 when handler rejects', async () => {
    const srv = await startServer({ onOffer: async () => ({ accepted: false }) });
    const r = await postJson(srv.port, '/offer', {});
    expect(r.status).toBe(403);
    await srv.close();
  });

  test('/pair/init forwards body', async () => {
    const srv = await startServer({
      onPairInit: async (body) => ({ echoed: body.from }),
    });
    const r = await postJson(srv.port, '/pair/init', { from: 'abc' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ echoed: 'abc' });
    await srv.close();
  });
});
