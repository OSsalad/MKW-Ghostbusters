const https = require('https');
const http = require('http');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    lib.get(url, (res) => {
      // Follow one redirect (e.g. github.com -> raw.githubusercontent.com).
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        return resolve(fetchJson(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (err) { reject(new Error('invalid JSON: ' + err.message)); }
      });
    }).on('error', reject);
  });
}

// Compare two semver-ish strings ("0.6.0" vs "0.5.3"). Returns -1, 0, 1.
function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0, db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

// Manifest schema:
//   { "version": "0.6.0", "downloadUrl": "https://...", "notes": "..." }
async function checkForUpdate({ manifestUrl, currentVersion }) {
  if (!manifestUrl) return { ok: false, reason: 'no manifest url' };
  try {
    const m = await fetchJson(manifestUrl);
    if (!m || !m.version) return { ok: false, reason: 'invalid manifest' };
    const cmp = compareVersions(m.version, currentVersion);
    return {
      ok: true,
      hasUpdate: cmp > 0,
      remoteVersion: m.version,
      currentVersion,
      downloadUrl: m.downloadUrl || null,
      notes: m.notes || null,
    };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = { checkForUpdate, compareVersions };
