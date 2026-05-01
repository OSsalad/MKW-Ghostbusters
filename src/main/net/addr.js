const os = require('os');

// Pick the most likely LAN IPv4: prefer 192.168.x.x, then 10.x.x.x, then 172.16-31.x.x.
// Skip loopback, virtual adapters (Hyper-V, vEthernet), and anything internal.
function localLanIPv4() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (/loopback|virtual|vethernet|vmware|hyper-v/i.test(name)) continue;
    for (const a of addrs) {
      if (a.family !== 'IPv4' || a.internal) continue;
      let priority = 99;
      if (/^192\.168\./.test(a.address)) priority = 1;
      else if (/^10\./.test(a.address)) priority = 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) priority = 3;
      candidates.push({ priority, address: a.address, name });
    }
  }
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0] ? candidates[0].address : null;
}

function parseAddr(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  // Accept "ip", "ip:port", or "host:port"
  const m = trimmed.match(/^([^:]+)(?::(\d+))?$/);
  if (!m) return null;
  const host = m[1];
  const port = m[2] ? Number(m[2]) : null;
  if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) return null;
  return { host, port };
}

module.exports = { localLanIPv4, parseAddr };
