#!/usr/bin/env node
/* Planche d'images d'un mouvement dans le VRAI jeu (index.html), image par image, + rapport JSON.
   Usage : node tools/move.js <robot[#skin]> <quoi> <sortie.png> [clé=valeur ...]
     quoi : intro | victory          animation personnelle sur l'écran de sélection (js/motions/<id>.js)
            win                      célébration en combat (état 'win' du Fighter)
            lp | hp | lk | hk | flk | fhk | fhp | clk | chk | jlk | jhk ...   coup normal (clé de NORMALS)
            sp:<type>[:l|h]          coup spécial (clé de SPECIAL_MV, ex. sp:cyclone, sp:proj:h)
            su                       super
            in                       uniquement les entrées données par in=
     in=lp,_*3,lp,_*3,hp             entrées image par image : étapes séparées par des virgules, chacune
                                     « boutons[*images] » ; boutons joints par + : f b u d (avant / arrière / haut / bas),
                                     lp hp lk hk sp1 sp2 su ; _ = rien. (ex. in=d*2,d+f,f+hp = quart de cercle + HP)
     step=3 n=24 cols=6              une vignette toutes les <step> images, au plus <n> vignettes
     tile=240                        largeur d'une vignette (px)
     p2=figure dist=190 arena=0 q=1  adversaire, distance, arène, qualité de rendu
     top=260                         (combat) hauteur du cadre au-dessus du sol (unités du jeu ≈ cm) ; plus pour les sauts
     view=game                       (combat) tout l'écran du jeu au lieu du cadre autour du robot
   ex.  node tools/move.js t800 sp:cyclone /tmp/cyclone.png
        node tools/move.js atlas in /tmp/coude.png in=lp,_*4,lp,_*4,hp step=2
        node tools/move.js optimus intro /tmp/intro.png step=6 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const [who, what, outFile, ...rest] = process.argv.slice(2);
if (!who || !what || !outFile) { console.error('usage: node tools/move.js <robot[#skin]> <quoi> <out.png> [k=v ...]'); process.exit(2); }
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
// entrées de coups normaux
function normalInput(k) {
  if (/^(lp|hp|lk|hk)$/.test(k)) return k;
  if (/^f(lp|hp|lk|hk)$/.test(k)) return 'f*2,f+' + k.slice(1);
  if (/^c(lp|hp|lk|hk)$/.test(k)) return 'd*3,d+' + k.slice(1);
  if (/^j(lp|hp|lk|hk)$/.test(k)) return 'u,_*12,' + k.slice(1);
  return null;
}
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const [rid, skin] = who.split('#');
  const menu = what === 'intro' || what === 'victory';
  const step = +(Q.step || (menu || what === 'win' ? 6 : 3)), n = +(Q.n || (menu || what === 'win' ? 30 : 24)), cols = +(Q.cols || 6);
  let input = Q.in || null;
  if (!menu && !input && !/^(win|su|in)$/.test(what) && !what.startsWith('sp:')) { input = normalInput(what); if (!input) { console.error('coup inconnu: ' + what); process.exit(2); } }
  const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let code = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text()); });
    await page.goto(`http://127.0.0.1:${port}/index.html?q=${Q.q || 1}`);
    await page.waitForFunction(() => typeof R3 !== 'undefined' && typeof scene !== 'undefined' && scene, null, { timeout: 120000 });
    const setup = await page.evaluate(([rid, skin, what, Q, menu]) => {
      const idx = ROSTER.findIndex(r => r.id === rid); if (idx < 0) return { err: 'robot inconnu: ' + rid };
      const ch = skin ? withSkin(ROSTER[idx], skin) : ROSTER[idx];
      window.__mv = { ch, idx };
      if (menu) {
        const S = new SelectScene('arcade'); S.cur[0] = idx; S.skin[0] = skin ? skinList(ROSTER[idx]).findIndex(s => s.id === skin) : 0;
        if (S.skin[0] < 0) S.skin[0] = 0;
        setScene(S); window.__S = S; return { ok: 1, seq: !!motionOf(ch, what) };
      }
      const c2 = ROSTER.find(r => r.id === (Q.p2 || 'figure')) || ROSTER[0];
      const f = new Fight(ch, c2.id === ch.id ? withSkin(c2, 'mirror') : c2, +(Q.arena || 0), { training: true, versus: false, onEnd() { } });
      window.__nf = f; setScene(new FightScene(f));
      return { ok: 1, seq: what === 'win' ? !!motionOf(ch, 'victory') : undefined };
    }, [rid, skin, what, Q, menu]);
    if (setup.err) throw new Error(setup.err);
    const raf = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    let crop;
    if (menu) {
      await page.waitForFunction(() => scene === window.__S, null, { timeout: 60000, polling: 100 });
      await page.evaluate((what) => {
        const S = window.__S; S._upd = S.update; S.update = () => { };
        FX.clear(); if (what === 'victory') S.done[0] = true;
        S.pup[0].playMotion(S.chOf(0), what); S.pup[0].idleT = 0;
      }, what);
      crop = { x: 150 - 175, y: 58, w: 350, h: 432 };
    } else {
      await page.waitForFunction(() => scene.f === window.__nf && scene.f.phase === 'fight', null, { timeout: 240000, polling: 100 });
      await page.evaluate(([what, dist]) => {
        const F = scene.f; F.ann = null; F._upd = F.update; F.update = function () { }; F.drawCutIn = () => { };
        if (F.tr) F.tr.superInf = false; // pas de clignotement « super prêt » sur les vignettes
        const a = F.p[0], b = F.p[1]; a.meter = b.meter = 0; a.x = 560; b.x = 560 + dist; a.face = 1; b.face = -1; a.setSt('idle'); b.setSt('idle');
        F.camX = (a.x + b.x) / 2 - VIEW_W / 2; BTNS.forEach(k => { pads[0].held[k] = pads[0].pressed[k] = false; });
        for (let i = 0; i < 8; i++) F._upd();
        if (what === 'win') a.setSt('win');
      }, [what, +(Q.dist || 190)]);
      await raf();
      // cadre : autour du robot (monde : de x-200 à x+dist+60, du sol à 330 au-dessus)
      crop = await page.evaluate(([dist, game, top]) => {
        if (game) return { x: 0, y: 0, w: W, h: H };
        const a = scene.f.p[0], p0 = R3.project(a.x - 130, GROUND + 12), p1 = R3.project(a.x + dist + 40, GROUND - top);
        const x = Math.max(0, p0.x), y = Math.max(0, p1.y);
        return { x, y, w: Math.min(W, p1.x) - x, h: Math.min(H, p0.y) - y };
      }, [+(Q.dist || 190), Q.view === 'game', +(Q.top || 260)]);
    }
    // entrées
    const steps = [];
    if (input) for (const tok of input.split(',')) { const [b, k] = tok.split('*'); for (let i = 0; i < (+k || 1); i++) steps.push(b === '_' ? [] : b.split('+')); }
    const tiles = [], log = [];
    let total = 0;
    const maxF = (n - 1) * step;
    for (let fr = 0; fr <= maxF; fr++) {
      const info = await page.evaluate(([fr, menu, what, btns, start]) => {
        if (menu) { const S = window.__S; S.t++; S.anim++; if (S.flash) S.flash--; S.shake = 0; FX.update(); S.pup[0].update(); return { busy: S.pup[0].busy, t: S.pup[0].t }; }
        const F = scene.f, a = F.p[0], pd = pads[0];
        if (start) {
          if (what === 'su') { a.meter = 100; F.startSuper(a); }
          else if (what.startsWith('sp:')) { const [, type, str] = what.split(':'); if (!SPECIAL_MV[type] && !['proj', 'uppercut', 'flip', 'spin', 'rush'].includes(type)) return { err: 'spécial inconnu: ' + type }; a.startSpecial(type, str || 'h', F); }
        }
        const map = { f: a.face > 0 ? 'r' : 'l', b: a.face > 0 ? 'l' : 'r', u: 'u', d: 'd' };
        const want = {}; (btns || []).forEach(k => { want[map[k] || k] = true; });
        BTNS.forEach(k => { const h = !!want[k]; pd.pressed[k] = h && !pd.held[k]; pd.held[k] = h; });
        F._upd();
        const hit = a.activeHit ? a.activeHit() : null;
        return { st: a.st, t: a.t, mv: a.mv && a.mv.name, sp: a.sp, hit: !!hit, hp2: F.p[1].hp, air: a.y < GROUND - 0.5, neutral: a.st === 'idle' || a.st === 'crouch' || a.st === 'walk', ann: F.moveTxt && F.moveTxt.name };
      }, [fr, menu, what, steps[fr] || [], fr === 0]);
      if (info.err) throw new Error(info.err);
      log.push(info); total = fr;
      if (fr % step === 0) {
        await raf();
        const d = await page.evaluate(([c, tw]) => {
          const g = document.getElementById('game'), s = g.width / W, th = Math.round(tw * c.h / c.w);
          const cv = document.createElement('canvas'); cv.width = tw; cv.height = th;
          cv.getContext('2d').drawImage(g, c.x * s, c.y * s, c.w * s, c.h * s, 0, 0, tw, th); return cv.toDataURL('image/png');
        }, [crop, +(Q.tile || 240)]);
        tiles.push([d, fr, info]);
      }
      // fin automatique : retour au neutre après le coup (combat) ou fin de séquence (menu, hors victoire qui boucle)
      if (fr > 6 && !input?.length && what !== 'win' && !menu && info.neutral && !info.air && fr % step === 0) break;
      if (fr > steps.length + 6 && input && info.neutral && !info.air && fr % step === 0) break;
      if (menu && !info.busy && fr % step === 0) break;
    }
    const data = await page.evaluate(async ([tiles, cols, title]) => {
      const im0 = new Image(); im0.src = tiles[0][0]; await im0.decode();
      const tw = im0.width, th = im0.height, rows = Math.ceil(tiles.length / cols);
      const cv = document.createElement('canvas'); cv.width = tw * Math.min(cols, tiles.length); cv.height = th * rows + 26; const c = cv.getContext('2d');
      c.fillStyle = '#111'; c.fillRect(0, 0, cv.width, cv.height);
      c.font = 'bold 15px sans-serif'; c.fillStyle = '#ffd23a'; c.fillText(title, 8, 18);
      for (let i = 0; i < tiles.length; i++) {
        const im = new Image(); im.src = tiles[i][0]; await im.decode();
        const x = (i % cols) * tw, y = 26 + ((i / cols) | 0) * th; c.drawImage(im, x, y);
        const inf = tiles[i][2], lab = 'f' + tiles[i][1] + (inf.st ? ' ' + inf.st : '') + (inf.hit ? ' ● HIT' : '');
        c.font = 'bold 12px sans-serif'; c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(x, y, c.measureText(lab).width + 10, 18);
        c.fillStyle = inf.hit ? '#ff5a5a' : '#fff'; c.fillText(lab, x + 5, y + 13);
        c.strokeStyle = '#333'; c.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
      }
      return cv.toDataURL('image/png');
    }, [tiles, cols, `${who} · ${what}${input ? ' · in=' + input : ''} · une vignette / ${step} images`]);
    fs.writeFileSync(outFile, Buffer.from(data.split(',')[1], 'base64'));
    const hitFrames = log.map((l, i) => l.hit ? i : -1).filter(i => i >= 0);
    const rep = { robot: who, what, crop, frames: total + 1, tiles: tiles.length, hasMotion: setup.seq, activeFrames: hitFrames.length ? [hitFrames[0], hitFrames[hitFrames.length - 1]] : null, damage: log.length && log[0].hp2 != null ? log[0].hp2 - log[log.length - 1].hp2 : undefined, announce: [...new Set(log.map(l => l.ann).filter(Boolean))], states: [...new Set(log.map(l => l.st).filter(Boolean))], errors, image: path.resolve(outFile) };
    console.log(JSON.stringify(rep, null, 1));
    if (errors.length) code = 1;
  } catch (e) { console.error('ÉCHEC: ' + e.message); code = 1; }
  await browser.close(); server.close(); process.exit(code);
});
