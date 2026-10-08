#!/usr/bin/env node
/* Prévisualisation d'une arène dans le VRAI jeu (index.html) + rapport technique (JSON sur la sortie standard).
   Usage : node tools/arena.js <id|index> <sortie.png|.jpg> [clé=valeur ...]
     view=sheet (défaut : 4 vues 800×450 — combat au centre, SUPER (caméra qui tourne), bord gauche, bord droit)
         | fight | super | left | right | ko | thumb (640×360, vignette du menu)
     p1=apollo p2=figure skin1= skin2=   robots et skins (défaut : Apollo contre Figure 02)
     t=<secondes>                         temps d'animation du décor avant la capture (défaut 2)
     q=0|1|2                              qualité de rendu (0 = max)
   ex.  node tools/arena.js tokyo /tmp/tokyo.png
        node tools/arena.js tokyo assets/arenas/tokyo.jpg view=thumb */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const [id, outFile, ...rest] = process.argv.slice(2);
if (!id || !outFile) { console.error('usage: node tools/arena.js <id> <out.png|jpg> [k=v ...]'); process.exit(2); }
const Q = {}; for (const kv of rest) { const i = kv.indexOf('='); if (i > 0) Q[kv.slice(0, i)] = kv.slice(i + 1); }
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.webm': 'video/webm', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? '/index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const view = Q.view || 'sheet';
  const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let code = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text()); });
    page.on('response', r => { if (r.status() >= 400 && !/assets\/arenas\//.test(r.url())) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
    await page.goto(`http://127.0.0.1:${port}/index.html?q=${Q.q || 0}`);
    await page.waitForFunction(() => typeof R3 !== 'undefined' && typeof scene !== 'undefined' && scene, null, { timeout: 120000 });
    const setup = await page.evaluate(([id, Q]) => {
      const ai = isNaN(+id) ? ARENAS.findIndex(a => a.id === id) : +id;
      if (ai < 0) return { err: 'arène inconnue: ' + id };
      const pick = (rid, sk, def) => { const c = ROSTER.find(r => r.id === (rid || def)) || ROSTER[0]; return sk ? withSkin(c, sk) : c; };
      const t0 = performance.now();
      const f = new Fight(pick(Q.p1, Q.skin1, 'apollo'), pick(Q.p2, Q.skin2, 'figure'), ai, { versus: false, onEnd() { } });
      window.__nf = f; setScene(new FightScene(f));
      window.__t0 = t0;
      return { ai, arena: ARENAS[ai] };
    }, [id, Q]);
    if (setup.err) throw new Error(setup.err);
    await page.waitForFunction(() => scene.f === window.__nf && scene.f.phase === 'fight', null, { timeout: 240000, polling: 100 });
    // on fige les robots (garde), le décor continue de s'animer
    await page.evaluate(() => { const F = scene.f; F.ann = null; F._upd = F.update; F.update = function () { this.frame++; FX.update(); }; F._hud = F.drawHUD; F.drawCutIn = () => { }; });
    const T = +(Q.t || 2);
    const shots = {
      fight: async () => { await page.evaluate(() => { const F = scene.f; F.p[0].x = 520; F.p[1].x = 780; F.camX = (STAGE_W - VIEW_W) / 2; F.superFreeze = 0; }); },
      left: async () => { await page.evaluate(() => { const F = scene.f; F.p[0].x = 150; F.p[1].x = 420; F.camX = 0; F.superFreeze = 0; }); },
      right: async () => { await page.evaluate(() => { const F = scene.f; F.p[0].x = 880; F.p[1].x = 1150; F.camX = STAGE_W - VIEW_W; F.superFreeze = 0; }); },
      super: async () => { await page.evaluate(() => { const F = scene.f; F.p[0].x = 560; F.p[1].x = 760; F.camX = (STAGE_W - VIEW_W) / 2; F.superBy = F.p[0]; F.superFreeze = 40; }); },
      ko: async () => { await page.evaluate(() => { const F = scene.f; F.p[0].x = 560; F.p[1].x = 740; F.camX = (STAGE_W - VIEW_W) / 2; F.superFreeze = 0; F.phase = 'ko'; F.phaseT = 20; F.p[1].ko = true; }); }
    };
    const grab = async (name, settle) => {
      await shots[name]();
      await page.evaluate((hud) => { const F = scene.f; F.drawHUD = hud ? F._hud : () => { }; }, name === 'fight');
      await page.waitForTimeout(settle);
      return page.evaluate(() => document.getElementById('game').toDataURL('image/png'));
    };
    const toBuf = d => Buffer.from(d.split(',')[1], 'base64');
    await page.waitForTimeout(T * 1000);
    let rep = await page.evaluate(([ai]) => ({ arena: ARENAS[ai].id, kind: ARENAS[ai].kind, stats: R3.arenaStats(ARENAS[ai].id), buildMsTotal: Math.round(performance.now() - window.__t0) }), [setup.ai]);
    if (view === 'sheet') {
      const imgs = [];
      for (const [n, lab] of [['fight', 'COMBAT'], ['super', 'SUPER (caméra cinématique)'], ['left', 'BORD GAUCHE'], ['right', 'BORD DROIT']]) imgs.push([await grab(n, 1500), lab]);
      const data = await page.evaluate(async (imgs) => {
        const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 900; const c = cv.getContext('2d');
        for (let i = 0; i < imgs.length; i++) {
          const im = new Image(); im.src = imgs[i][0]; await im.decode();
          const x = (i % 2) * 800, y = ((i / 2) | 0) * 450; c.drawImage(im, x, y, 800, 450);
          c.font = 'bold 16px sans-serif'; c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x, y, c.measureText(imgs[i][1]).width + 14, 24); c.fillStyle = '#ffd23a'; c.fillText(imgs[i][1], x + 7, y + 17);
        }
        return cv.toDataURL('image/png');
      }, imgs);
      fs.writeFileSync(outFile, toBuf(data));
    } else if (view === 'thumb') {
      await page.evaluate(() => { const F = scene.f; F.p[0].x = 540; F.p[1].x = 760; F.camX = (STAGE_W - VIEW_W) / 2; });
      await page.evaluate(() => { scene.f.drawHUD = () => { }; });
      await page.waitForTimeout(1500);
      const d = await page.evaluate(() => { const g = document.getElementById('game'), cv = document.createElement('canvas'); cv.width = 640; cv.height = 360; cv.getContext('2d').drawImage(g, 0, 0, 640, 360); return cv.toDataURL('image/jpeg', 0.86); });
      fs.writeFileSync(outFile, toBuf(d));
    } else {
      if (!shots[view]) throw new Error('vue inconnue: ' + view);
      fs.writeFileSync(outFile, toBuf(await grab(view, 1500)));
    }
    rep.errors = errors; rep.image = path.resolve(outFile);
    console.log(JSON.stringify(rep, null, 1));
    if (errors.length) code = 1;
  } catch (e) { console.error('ÉCHEC: ' + e.message); code = 1; }
  await browser.close(); server.close(); process.exit(code);
});
