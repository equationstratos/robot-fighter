#!/usr/bin/env node
/* Capture d'écran d'un modèle de robot + rapport technique (JSON sur la sortie standard).
   Usage : node tools/shoot.js <id> <sortie.png> [clé=valeur ...]
     ex.  node tools/shoot.js optimus /tmp/o.png
          node tools/shoot.js atlas /tmp/a-head.png view=custom frame=head yaw=-0.8 plate=warehouse
   Paramètres : voir tools/viewer.js (view, plate, pose, yaw, frame, w, h). */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const [id, outPng, ...rest] = process.argv.slice(2);
if (!id || !outPng) { console.error('usage: node tools/shoot.js <id> <out.png> [k=v ...]'); process.exit(2); }
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.webm': 'video/webm', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const q = new URLSearchParams({ id }); for (const kv of rest) { const i = kv.indexOf('='); if (i > 0) q.set(kv.slice(0, i), kv.slice(i + 1)); }
  const view = q.get('view') || 'sheet';
  const W = view === 'custom' ? +(q.get('w') || 900) : 1600, H = view === 'custom' ? +(q.get('h') || 900) : 900;
  const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let code = 0;
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const pageErr = [];
    page.on('pageerror', e => pageErr.push('pageerror: ' + e.message));
    await page.goto(`http://127.0.0.1:${port}/tools/viewer.html?${q}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000, polling: 200 });
    const rep = await page.evaluate(() => window.__report);
    rep.errors = (rep.errors || []).concat(pageErr);
    await page.locator('#out').screenshot({ path: outPng });
    rep.image = path.resolve(outPng);
    console.log(JSON.stringify(rep, null, 1));
    if (rep.errors.length) code = 1;
  } catch (e) { console.error('ÉCHEC: ' + e.message); code = 1; }
  await browser.close(); server.close(); process.exit(code);
});
