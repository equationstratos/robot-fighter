'use strict';
/* =========================================================
   Arène 3D : TERRAIN D'ESSAI — piste d'essai de robots en plein désert, au coucher du soleil
   (arène « à domicile » d'Atlas). Contrat : voir js/arenas.js.
   Plans : dalle d'essai en béton (marquages, chevrons, traces de pneus, flaques d'arrosage qui reflètent le ciel)
     → parcours de parkour (caisses en contreplaqué, rampes, poutre, plots) → conteneurs, mâts d'éclairage,
     hangar éclairé, tour de contrôle, arbres de Josué → dunes, mirage → mesas en couches de brume
     → ciel or / magenta / violet, gros soleil bas, rayons, nuages qui dérivent.
   Vie : poussière et sable soufflés, voiles de brume au ras du sol, mirage qui ondule, manche à air, drone,
     pick-up et son panache, vautours, tourbillon de poussière, radar, balises, projecteurs qui s'allument.
   ========================================================= */
ARENA3D.desert = (function () {
  const D = Math.PI / 180;
  const CX = 650, CZ = 689, CY = 148, FPX = 1171;          // caméra de combat au centre ; focale en pixels (écran 960×540)
  const SUN_AZ = -16 * D, SUN_EL = 6.5 * D;
  const SUN = [Math.sin(SUN_AZ) * Math.cos(SUN_EL), Math.sin(SUN_EL), -Math.cos(SUN_AZ) * Math.cos(SUN_EL)];
  const KEY = [-1000, 470, -120];                          // soleil rasant venant de la gauche
  const SH = [-KEY[0] / KEY[1], -KEY[2] / KEY[1]];         // décalage de l'ombre au sol par unité de hauteur

  const light = {
    hemi: [0x8a76c8, 0x7a4a36, 0.85],
    key: [0xffb27a, 2.2], keyPos: KEY,
    rims: [[0xff8a40, 1.6, [-0.55, 0.2, -1]], [0x8e6cff, 1.35, [1, 0.35, -0.65]], [0xffd8b8, 0.3, [0, 1, 0.45]]],
    fog: { color: 0xa8667c, near: 2200, far: 16500 },
    bg: 0x2a1c48, refl: 0.2, dim: 0.72
  };

  // thème : galop « western » en mi phrygien dominant (E – F – E – D)
  const DRD = { k: 'x..x..x...x..x..', s: '....x.......x..x', h: 'x.xxx.xxx.xxx.xx' };
  const track = {
    bpm: 150, root: 40, prog: [0, 1, 0, -2],
    bass: [0, null, 0, 0, 12, null, 0, 0, 0, null, 0, 0, 10, null, 12, 7],
    lead: [12, null, 13, 12, 8, null, 7, null, 8, 7, 4, null, 5, 4, 1, 0,
      7, null, 4, 7, 12, null, 11, 7, 4, null, 3, 4, 7, null, null, null,
      12, 16, 19, 16, 17, 16, 13, 12, 13, null, 12, 8, 7, null, 4, null,
      7, null, 10, 7, 3, null, 2, 3, 7, null, 9, 10, 12, null, 14, null],
    drums: DRD
  };

  /* ---------- petits outils ---------- */
  const hash = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const n1 = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; };
  const mesa = (x, c, w, h, cliff, talus, ledge) => {
    const d = Math.abs(x - c) - w / 2;
    if (d <= 0) return h;
    if (d < cliff) return h - (1 - ledge) * h * (d / cliff);
    const t = Math.min(1, (d - cliff) / talus); return ledge * h * Math.pow(1 - t, 1.8);
  };
  const sunProx = (x, z, wd = 15) => { const az = Math.atan2(x - CX, CZ - z); return Math.exp(-Math.pow((az - SUN_AZ) / (wd * D), 2)); };
  const hexRGB = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const mixRGB = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const FONT = "'Arial Black', 'Arial', 'Helvetica', 'Liberation Sans', sans-serif";

  function build(S) {
    const T = S.T, g = S.g, Q = S.quality || 0;
    const BGU = T.BufferGeometryUtils;
    const root = S.group(), stat = S.group();
    const rnd = S.rng(4242);
    const lin = h => new T.Color(h);
    const casters = [];   // ombres « peintes » au sol (le décor ne projette pas d'ombre)

    /* ---------- géométrie ---------- */
    const _m4 = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();
    function xf(geo, p = [0, 0, 0], r = [0, 0, 0], s = 1) {
      const gg = geo.index ? geo.toNonIndexed() : geo.clone();
      _m4.compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), typeof s === 'number' ? _s.set(s, s, s) : _s.set(s[0], s[1], s[2]));
      gg.applyMatrix4(_m4); return gg;
    }
    function mergeG(list) {
      return BGU.mergeGeometries(list.map(gg => {
        gg = gg.index ? gg.toNonIndexed() : gg;
        for (const n of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(n)) gg.deleteAttribute(n);
        if (!gg.attributes.uv) gg.setAttribute('uv', new T.BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
        return gg;
      }), false);
    }
    function uvRect(geo, u0, v0, u1, v1) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0)); uv.needsUpdate = true; return geo; }
    function uvScale(geo, k) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k); return geo; }
    // quadrilatère quelconque (4 coins, ordre TL TR BR BL), uv (0,1) (1,1) (1,0) (0,0)
    function quad(a, b, c, d) {
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(new Float32Array([...a, ...b, ...c, ...d]), 3));
      geo.setAttribute('uv', new T.BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), 2));
      geo.setIndex([0, 3, 1, 1, 3, 2]); geo.computeVertexNormals(); return geo;
    }
    const add = (geo, mat, o, parent = stat) => S.add(parent, geo, mat, o);
    function caster(x, z, w, d, ry, y0, y1) { casters.push({ x, z, w, d, ry: ry || 0, y0: y0 || 0, y1 }); }

    /* ---------- outils de dessin ---------- */
    function grain(c, w, h, amp) {
      const im = c.getImageData(0, 0, w, h), d = im.data;
      for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * amp; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      c.putImageData(im, 0, 0);
    }
    function rg(c, x, y, r, rgb, a, sx = 1, sy = 1) {
      c.save(); c.translate(x, y); c.scale(sx, sy);
      const gr = c.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, css(rgb, a)); gr.addColorStop(1, css(rgb, 0));
      c.fillStyle = gr; c.fillRect(-r, -r, 2 * r, 2 * r); c.restore();
    }
    function rgW(c, x, y, r, rgb, a, w, h) { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) if (x + dx > -r && x + dx < w + r && y + dy > -r && y + dy < h + r) rg(c, x + dx, y + dy, r, rgb, a); }
    function txt(c, s, x, y, wpx, hpx, col, weight = 900) {
      c.save(); c.font = `${weight} 100px ${FONT}`; const m = Math.max(1, c.measureText(s).width);
      c.translate(x, y); c.scale(wpx / m, hpx / 100); c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, 0, 0); c.restore();
    }
    // bruit doux répétable (pour poussière, nuages, tourbillon)
    function softNoise(size, cells, oct, seed) {
      const r = S.rng(seed), cv = document.createElement('canvas'); cv.width = cv.height = size;
      const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, size, size);
      for (let o = 0; o < oct; o++) {
        const n = cells << o, sm = document.createElement('canvas'); sm.width = sm.height = n;
        const sc = sm.getContext('2d'), im = sc.createImageData(n, n);
        for (let i = 0; i < n * n; i++) { const v = r() * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
        sc.putImageData(im, 0, 0);
        c.globalAlpha = 1 / (o + 1.6); c.imageSmoothingEnabled = true;
        const k = size / n; // tuile 3×3 pour un raccord sans couture
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) c.drawImage(sm, dx * size - k / 2, dy * size - k / 2, size + k, size + k);
      }
      c.globalAlpha = 1;
      // normalisation du contraste
      const im = c.getImageData(0, 0, size, size), d = im.data; let lo = 255, hi = 0;
      for (let i = 0; i < d.length; i += 4) { lo = Math.min(lo, d[i]); hi = Math.max(hi, d[i]); }
      for (let i = 0; i < d.length; i += 4) { const v = (d[i] - lo) / Math.max(1, hi - lo) * 255; d[i] = d[i + 1] = d[i + 2] = v; }
      c.putImageData(im, 0, 0);
      return cv;
    }
    const texFrom = (cv, o = {}) => S.canvasTex(cv.width, cv.height, (c) => c.drawImage(cv, 0, 0), o);

    /* =========================================================
       TEXTURES
       ========================================================= */
    // sable (répété)
    const sandTex = S.canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#c49a72'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) rgW(c, rnd() * w, rnd() * h, 30 + rnd() * 90, rnd() < 0.5 ? [140, 100, 72] : [226, 190, 150], 0.08 + rnd() * 0.12, w, h);
      c.lineWidth = 2;
      for (let k = 0; k < 26; k++) {
        const y0 = k * h / 26, ph = rnd() * 6.28, a = 2 + rnd() * 3;
        for (const [dy, col] of [[0, 'rgba(105,70,48,0.24)'], [2.4, 'rgba(244,214,176,0.2)']]) for (const oy of [0, h]) {
          c.strokeStyle = col; c.beginPath();
          for (let x = 0; x <= w; x += 8) { const y = y0 + dy - oy + Math.sin(x / w * 6.283 * 3 + ph) * a + Math.sin(x / w * 6.283 * 7 + ph * 2) * 1.5; x ? c.lineTo(x, y) : c.moveTo(x, y); }
          c.stroke();
        }
      }
      grain(c, w, h, 30);
      for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(${70 + rnd() * 60 | 0},${50 + rnd() * 40 | 0},${40 + rnd() * 30 | 0},${0.5 + rnd() * 0.4})`; c.beginPath(); c.ellipse(rnd() * w, rnd() * h, 0.8 + rnd() * 2, 0.6 + rnd() * 1.5, 0, 0, 7); c.fill(); }
    }, { repeat: [56, 46], aniso: 8 });
    // grain du béton (relief fin, répété)
    const grainTex = S.canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#808080'; c.fillRect(0, 0, w, h); grain(c, w, h, 90);
      for (let i = 0; i < 120; i++) { c.fillStyle = rnd() < 0.5 ? 'rgba(40,40,40,0.5)' : 'rgba(200,200,200,0.4)'; c.beginPath(); c.arc(rnd() * w, rnd() * h, 0.5 + rnd() * 1.6, 0, 7); c.fill(); }
    }, { repeat: [14, 9], srgb: false });
    const noiseCv = softNoise(256, 4, 4, 77);
    const noiseTex = texFrom(noiseCv, { repeat: [1, 1], srgb: false });

    /* ---------- dalle d'essai (béton peint) ---------- */
    const PX0 = -300, PX1 = 1600, PZ0 = -460, PZ1 = 700, padW = 2048, padH = 1024;
    const kx = padW / (PX1 - PX0), kz = padH / (PZ1 - PZ0);
    const PX = x => (x - PX0) * kx, PZ = z => (z - PZ0) * kz;
    const wet = [];
    for (let i = 0; i < 30; i++) wet.push([120 + rnd() * 1060, -380 + rnd() * 420, 40 + rnd() * 150, rnd() < 0.4]);
    wet.push([650, -110, 330, false], [380, -260, 200, false], [960, -220, 220, false]);
    function puddle(c, x, y, r, sx, sy) {
      c.beginPath();
      for (let k = 0; k <= 24; k++) { const a = k / 24 * 6.283, rr = r * (0.7 + 0.3 * n1(k * 0.7 + x * 0.01) + 0.15 * Math.sin(a * 3 + y)); const px = x + Math.cos(a) * rr * sx, py = y + Math.sin(a) * rr * sy; k ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.closePath(); c.fill();
    }
    const padTex = S.canvasTex(padW, padH, (c, w, h) => {
      c.fillStyle = '#a99f94'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 160; i++) rg(c, rnd() * w, rnd() * h, 40 + rnd() * 220, rnd() < 0.5 ? [120, 106, 94] : [204, 194, 182], 0.05 + rnd() * 0.1);
      // dalles (teinte propre à chacune)
      for (let x = PX0; x < PX1; x += 380) for (let z = PZ0; z < PZ1; z += 290) { c.fillStyle = rnd() < 0.5 ? `rgba(90,80,70,${rnd() * 0.07})` : `rgba(230,222,210,${rnd() * 0.07})`; c.fillRect(PX(x), PZ(z), 380 * kx, 290 * kz); }
      grain(c, w, h, 24);
      // sable soufflé sur les bords
      for (let i = 0; i < 260; i++) {
        const side = rnd(); let x, z;
        if (side < 0.4) { x = PX0 + rnd() * (PX1 - PX0); z = PZ0 + Math.pow(rnd(), 2) * 120; }
        else if (side < 0.7) { x = PX0 + Math.pow(rnd(), 2) * 160; z = PZ0 + rnd() * (PZ1 - PZ0); }
        else { x = PX1 - Math.pow(rnd(), 2) * 160; z = PZ0 + rnd() * (PZ1 - PZ0); }
        rg(c, PX(x), PZ(z), 10 + rnd() * 50, [198, 158, 114], 0.25 + rnd() * 0.35, 1.8, 1);
      }
      // traînées de sable (vent vers +x)
      for (let i = 0; i < 70; i++) rg(c, rnd() * w, rnd() * h, 20 + rnd() * 50, [196, 160, 118], 0.12 + rnd() * 0.12, 4, 0.5);
      // joints sciés
      c.lineWidth = 2.2;
      for (let x = PX0 + 380; x < PX1; x += 380) { c.strokeStyle = 'rgba(48,40,34,0.75)'; c.beginPath(); c.moveTo(PX(x), 0); c.lineTo(PX(x), h); c.stroke(); c.strokeStyle = 'rgba(220,210,196,0.35)'; c.beginPath(); c.moveTo(PX(x) + 2, 0); c.lineTo(PX(x) + 2, h); c.stroke(); }
      for (let z = PZ0 + 290; z < PZ1; z += 290) { c.strokeStyle = 'rgba(48,40,34,0.75)'; c.beginPath(); c.moveTo(0, PZ(z)); c.lineTo(w, PZ(z)); c.stroke(); c.strokeStyle = 'rgba(220,210,196,0.35)'; c.beginPath(); c.moveTo(0, PZ(z) + 2); c.lineTo(w, PZ(z) + 2); c.stroke(); }
      // fissures
      c.lineWidth = 1.1;
      for (let i = 0; i < 40; i++) {
        let x = rnd() * w, y = rnd() * h, a = rnd() * 6.28; c.strokeStyle = `rgba(40,34,30,${0.35 + rnd() * 0.3})`; c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 14; k++) { a += (rnd() - 0.5) * 1.1; x += Math.cos(a) * 9; y += Math.sin(a) * 9; c.lineTo(x, y); }
        c.stroke();
      }
      // taches d'huile
      for (let i = 0; i < 14; i++) rg(c, PX(-200 + rnd() * 1700), PZ(-420 + rnd() * 500), 14 + rnd() * 40, [40, 32, 30], 0.3 + rnd() * 0.3, 1.4, 1);
      // --- marquages sur un calque usé ---
      const mk = document.createElement('canvas'); mk.width = w; mk.height = h; const m = mk.getContext('2d');
      const Y = '#f0b81e', WH = '#efe9dc';
      m.fillStyle = Y;
      m.fillRect(PX(-262), PZ(-432), PX(1562) - PX(-262), 13 * kz);          // ligne de fond
      m.fillRect(PX(-262), PZ(-432), 13 * kx, h);                             // côté gauche
      m.fillRect(PX(1549), PZ(-432), 13 * kx, h);                             // côté droit
      // bande de chevrons (danger) le long du fond
      m.save(); m.beginPath(); m.rect(PX(-262), PZ(-458), PX(1562) - PX(-262), 24 * kz); m.clip();
      m.fillStyle = '#16130f'; m.fillRect(0, 0, w, h); m.fillStyle = Y;
      for (let x = -300; x < 1700; x += 44) { m.beginPath(); m.moveTo(PX(x), PZ(-434)); m.lineTo(PX(x + 22), PZ(-434)); m.lineTo(PX(x + 46), PZ(-458)); m.lineTo(PX(x + 24), PZ(-458)); m.closePath(); m.fill(); }
      m.restore();
      // grille de calibration (motion capture)
      m.strokeStyle = 'rgba(239,233,220,0.42)'; m.lineWidth = 1.6;
      for (let x = 100; x <= 1200; x += 100) { m.beginPath(); m.moveTo(PX(x), PZ(-360)); m.lineTo(PX(x), PZ(260)); m.stroke(); }
      for (let z = -360; z <= 260; z += 100) { m.beginPath(); m.moveTo(PX(100), PZ(z)); m.lineTo(PX(1200), PZ(z)); m.stroke(); }
      m.lineWidth = 3.4; m.strokeStyle = 'rgba(239,233,220,0.7)'; m.strokeRect(PX(100), PZ(-360), PX(1200) - PX(100), PZ(260) - PZ(-360));
      for (let x = 100; x <= 1200; x += 100) for (let z = -360; z <= 260; z += 100) { m.fillStyle = WH; m.fillRect(PX(x) - 6, PZ(z) - 1.5, 12, 3); m.fillRect(PX(x) - 1.5, PZ(z) - 5, 3, 10); }
      // cercle central + axe
      m.strokeStyle = 'rgba(240,184,30,0.9)'; m.lineWidth = 5;
      m.beginPath(); m.ellipse(PX(650), PZ(-40), 150 * kx, 150 * kz, 0, 0, 6.283); m.stroke();
      m.setLineDash([18, 14]); m.beginPath(); m.moveTo(PX(650), PZ(-425)); m.lineTo(PX(650), h); m.stroke(); m.setLineDash([]);
      // marques de départ
      for (const [x, s] of [[420, '1'], [880, '2']]) { m.strokeStyle = WH; m.lineWidth = 4; m.strokeRect(PX(x - 40), PZ(-20), 80 * kx, 50 * kz); txt(m, s, PX(x), PZ(5), 40 * kx, 44 * kz, WH); }
      // pochoirs
      txt(m, 'TEST ZONE 07', PX(800), PZ(-322), 760 * kx, 92 * kz, WH);
      txt(m, 'ATLAS', PX(0), PZ(-322), 360 * kx, 92 * kz, Y);
      txt(m, '▲ SAFETY LINE ▲', PX(650), PZ(80), 420 * kx, 26 * kz, Y);
      m.fillStyle = Y; m.fillRect(PX(-262), PZ(64), PX(1562) - PX(-262), 6 * kz);
      for (const x of [-140, 1440]) { m.fillStyle = Y; m.beginPath(); m.moveTo(PX(x - 60), PZ(-250)); m.lineTo(PX(x), PZ(-380)); m.lineTo(PX(x + 60), PZ(-250)); m.lineTo(PX(x + 30), PZ(-250)); m.lineTo(PX(x), PZ(-310)); m.lineTo(PX(x - 30), PZ(-250)); m.closePath(); m.fill(); }
      // usure : arrachements, rayures
      m.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 16000; i++) { m.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.7})`; m.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 4, 1 + rnd() * 2.5); }
      for (let i = 0; i < 60; i++) rg(m, rnd() * w, rnd() * h, 20 + rnd() * 80, [0, 0, 0], 0.5);
      m.globalCompositeOperation = 'source-over';
      c.globalAlpha = 0.88; c.drawImage(mk, 0, 0); c.globalAlpha = 1;
      // traces de pneus (camion d'arrosage) et gommes
      c.lineCap = 'round';
      const track2 = (pts, wd, sep, col, dash) => {
        for (const off of [-sep / 2, sep / 2]) {
          c.strokeStyle = col; c.lineWidth = wd * kx; c.setLineDash(dash || []); c.beginPath();
          pts.forEach((p, i) => { const q = pts[Math.min(i + 1, pts.length - 1)], pp = pts[Math.max(i - 1, 0)], dx = q[0] - pp[0], dz = q[1] - pp[1], L = Math.hypot(dx, dz) || 1; const x = PX(p[0] - dz / L * off), y = PZ(p[1] + dx / L * off); i ? c.lineTo(x, y) : c.moveTo(x, y); });
          c.stroke();
        }
        c.setLineDash([]);
      };
      const curve = (a, b, cc, n = 30) => { const r = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; r.push([u * u * a[0] + 2 * u * t * cc[0] + t * t * b[0], u * u * a[1] + 2 * u * t * cc[1] + t * t * b[1]]); } return r; };
      track2(curve([-320, 120], [1620, -300], [700, -40]), 24, 170, 'rgba(70,52,40,0.22)');
      track2(curve([-320, 120], [1620, -300], [700, -40]), 22, 170, 'rgba(40,30,24,0.18)', [3, 5]);
      track2(curve([1620, 260], [900, -440], [1100, 20]), 20, 150, 'rgba(160,120,84,0.28)');
      for (let i = 0; i < 9; i++) { const x = 200 + rnd() * 900, z = -380 + rnd() * 380, a = rnd() * 6.28; c.strokeStyle = `rgba(22,18,16,${0.15 + rnd() * 0.2})`; c.lineWidth = 9; c.beginPath(); c.arc(PX(x), PZ(z), 60 + rnd() * 120, a, a + 0.6 + rnd() * 1.2); c.stroke(); }
      // empreintes de pas de robot (poussiéreuses)
      for (let i = 0; i < 28; i++) { const x = -200 + i * 62, z = -395 + Math.sin(i * 0.4) * 14 + (i % 2) * 22; c.fillStyle = 'rgba(176,138,100,0.45)'; c.beginPath(); c.ellipse(PX(x), PZ(z), 13 * kx, 7 * kz, 0, 0, 7); c.fill(); }
      // flaques et zones mouillées (assombrissement)
      const wt = document.createElement('canvas'); wt.width = w; wt.height = h; const q = wt.getContext('2d');
      q.fillStyle = '#fff'; q.fillRect(0, 0, w, h);
      for (const [x, z, r, crisp] of wet) {
        if (crisp) { q.fillStyle = 'rgb(118,112,122)'; puddle(q, PX(x), PZ(z), r * 0.55 * kx, 1, kz / kx * 0.8); }
        else rg(q, PX(x), PZ(z), r * kx, [150, 142, 150], 0.75, 1, kz / kx * 0.8);
      }
      c.globalCompositeOperation = 'multiply'; c.drawImage(wt, 0, 0); c.globalCompositeOperation = 'source-over';
    }, { aniso: 8 });
    const padRough = S.canvasTex(1024, 512, (c, w, h) => {
      const sx = w / padW, sy = h / padH;
      c.fillStyle = 'rgb(214,214,214)'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) rg(c, rnd() * w, rnd() * h, 20 + rnd() * 70, [240, 240, 240], 0.3);
      for (const [x, z, r, crisp] of wet) {
        if (crisp) { c.fillStyle = 'rgb(10,10,10)'; puddle(c, PX(x) * sx, PZ(z) * sy, r * 0.55 * kx * sx, 1, kz / kx * 0.8); }
        else rg(c, PX(x) * sx, PZ(z) * sy, r * kx * sx, [26, 26, 26], 0.85, 1, kz / kx * 0.8);
      }
    }, { srgb: false });

    /* ---------- calque au sol (traces, chemins, ombres longues du couchant) — rempli plus bas ---------- */
    const OX0 = -2400, OX1 = 3600, OZ0 = -4600, OZ1 = -300, ovW = 2048, ovH = 1024;
    const OX = x => (x - OX0) / (OX1 - OX0) * ovW, OZ = z => (z - OZ0) / (OZ1 - OZ0) * ovH;

    // contreplaqué (parkour)
    const plyTex = S.canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#caa274'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { c.strokeStyle = `rgba(${130 + rnd() * 40 | 0},${90 + rnd() * 30 | 0},${55 + rnd() * 20 | 0},${0.15 + rnd() * 0.2})`; c.lineWidth = 0.6 + rnd() * 1.6; c.beginPath(); const y = rnd() * h, a = 2 + rnd() * 5, f = rnd() * 0.05; for (let x = 0; x <= w; x += 6) { const yy = y + Math.sin(x * f + i) * a; x ? c.lineTo(x, yy) : c.moveTo(x, yy); } c.stroke(); }
      for (let i = 0; i < 5; i++) rg(c, rnd() * w, rnd() * h, 4 + rnd() * 6, [110, 70, 40], 0.6, 1.8, 1);
      grain(c, w, h, 16);
      for (let i = 0; i < 18; i++) rg(c, rnd() * w, h * (0.6 + rnd() * 0.4), 8 + rnd() * 18, [60, 50, 44], 0.25);
      c.strokeStyle = 'rgba(80,52,30,0.75)'; c.lineWidth = 7; c.strokeRect(3, 3, w - 6, h - 6);
      c.strokeStyle = 'rgba(236,206,160,0.5)'; c.lineWidth = 2; c.strokeRect(9, 9, w - 18, h - 18);
      txt(c, '07', w * 0.78, h * 0.2, 44, 34, 'rgba(30,24,20,0.55)');
    });
    const crateTex = S.canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#8e6440'; c.fillRect(0, 0, w, h);
      for (let k = 0; k < 5; k++) { c.fillStyle = `rgb(${130 + rnd() * 30 | 0},${92 + rnd() * 20 | 0},${58 + rnd() * 14 | 0})`; c.fillRect(0, k * 51 + 2, w, 47); }
      grain(c, w, h, 22);
      c.fillStyle = '#6e4a2c'; c.fillRect(0, 0, w, 22); c.fillRect(0, h - 22, w, 22); c.fillRect(0, 0, 22, h); c.fillRect(w - 22, 0, 22, h);
      c.save(); c.translate(w / 2, h / 2); c.rotate(-0.78); c.fillRect(-180, -11, 360, 22); c.restore();
      txt(c, 'FRAGILE', w / 2, h * 0.36, 150, 30, 'rgba(25,18,14,0.75)');
      txt(c, '▲ ▲', w / 2, h * 0.66, 90, 34, 'rgba(25,18,14,0.75)');
    });
    // conteneurs : flancs (moitié haute), portes (bas gauche), toit (bas, 2e quart)
    const contTex = S.canvasTex(1024, 512, (c, w, h) => {
      c.fillStyle = '#e4e0d8'; c.fillRect(0, 0, w, h);
      // flanc ondulé
      for (let x = 0; x < w; x += 16) { c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(x, 0, 3, 256); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x + 8, 0, 3, 256); c.fillStyle = 'rgba(0,0,0,0.1)'; c.fillRect(x + 11, 0, 5, 256); }
      c.fillStyle = 'rgba(40,36,34,0.5)'; c.fillRect(0, 0, w, 12); c.fillRect(0, 244, w, 12); c.fillRect(0, 0, 14, 256); c.fillRect(w - 14, 0, 14, 256);
      for (let i = 0; i < 70; i++) { const x = rnd() * w, l = 30 + rnd() * 150, gr = c.createLinearGradient(0, 10, 0, 10 + l); gr.addColorStop(0, 'rgba(110,52,24,0.45)'); gr.addColorStop(1, 'rgba(110,52,24,0)'); c.fillStyle = gr; c.fillRect(x, 10, 2 + rnd() * 5, l); }
      const gb = c.createLinearGradient(0, 160, 0, 256); gb.addColorStop(0, 'rgba(150,110,70,0)'); gb.addColorStop(1, 'rgba(150,110,70,0.5)'); c.fillStyle = gb; c.fillRect(0, 160, w, 96);
      txt(c, 'RBTU 207451 3', 880, 36, 190, 22, 'rgba(25,22,20,0.8)', 700);
      txt(c, '45G1', 880, 62, 60, 18, 'rgba(25,22,20,0.8)', 700);
      txt(c, 'TEST·LAB 07', 300, 120, 360, 60, 'rgba(25,22,20,0.55)');
      // portes
      c.fillStyle = '#dedad2'; c.fillRect(0, 256, 256, 256);
      c.strokeStyle = 'rgba(30,28,26,0.7)'; c.lineWidth = 6; c.strokeRect(8, 264, 240, 240); c.beginPath(); c.moveTo(128, 264); c.lineTo(128, 504); c.stroke();
      for (const x of [40, 96, 160, 216]) { c.fillStyle = 'rgba(40,38,36,0.8)'; c.fillRect(x - 3, 270, 6, 228); c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(x + 3, 270, 2, 228); c.fillStyle = 'rgba(30,28,26,0.9)'; c.fillRect(x - 8, 380, 16, 10); }
      for (let y = 272; y < 500; y += 14) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(12, y, 232, 4); }
      for (let i = 0; i < 25; i++) { const x = rnd() * 256, l = 20 + rnd() * 80; c.fillStyle = 'rgba(110,52,24,0.35)'; c.fillRect(x, 266, 2 + rnd() * 3, l); }
      // toit
      for (let x = 256; x < 512; x += 12) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x, 256, 4, 256); }
      for (let i = 0; i < 20; i++) rg(c, 256 + rnd() * 256, 256 + rnd() * 256, 10 + rnd() * 40, [120, 60, 30], 0.35);
      grain(c, w, h, 18);
    });
    const coneTex = S.canvasTex(32, 128, (c, w, h) => {
      c.fillStyle = '#ff5a12'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#f4f2ee'; c.fillRect(0, h * 0.32, w, h * 0.16); c.fillRect(0, h * 0.58, w, h * 0.08);
      c.fillStyle = '#1b1715'; c.fillRect(0, h * 0.9, w, h * 0.1);
    });
    const metalTex = S.canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#b9b0a2'; c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) { c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(x, 0, 4, h); c.fillStyle = 'rgba(255,255,255,0.2)'; c.fillRect(x + 8, 0, 3, h); }
      for (let i = 0; i < 30; i++) { const x = rnd() * w, l = 40 + rnd() * 160, gr = c.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(110,60,30,0.35)'); gr.addColorStop(1, 'rgba(110,60,30,0)'); c.fillStyle = gr; c.fillRect(x, 0, 2 + rnd() * 4, l); }
      grain(c, w, h, 14);
    }, { repeat: [6, 1] });
    // faisceau lumineux (cône vu de face) et halo
    const beamTex = S.canvasTex(128, 256, (c, w, h) => {
      const im = c.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = x / (w - 1) * 2 - 1, v = 1 - y / (h - 1); // v = 1 en haut (lampe)
        const across = Math.exp(-u * u * 3.2) * (0.75 + 0.25 * Math.cos(u * 9 + v * 3));
        const along = Math.pow(v, 0.9) * 0.85 + 0.15 * Math.exp(-(1 - v) * 18) + 0.0;
        const a = Math.max(0, across * along * Math.min(1, (1 - v) * 30 + 0.1) * Math.min(1, v * 6));
        const i = (y * w + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255 * Math.min(1, a); im.data[i + 3] = 255;
      }
      c.putImageData(im, 0, 0);
    }, { srgb: false });
    const flareTex = S.canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.08, 'rgba(255,255,255,0.8)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
    }, { srgb: false });

    /* =========================================================
       MATÉRIAUX
       ========================================================= */
    const M = {
      sand: S.mat({ map: sandTex, bumpMap: sandTex, bumpScale: 1.4, roughness: 0.96, envMapIntensity: 0.25 }),
      pad: S.mat({ map: padTex, roughnessMap: padRough, roughness: 1, bumpMap: grainTex, bumpScale: 0.6, envMapIntensity: 1.0 }),
      ply: S.mat({ map: plyTex, roughness: 0.78, envMapIntensity: 0.3 }),
      crate: S.mat({ map: crateTex, roughness: 0.82, envMapIntensity: 0.3 }),
      foam: S.mat({ color: 0x1d5fc4, roughness: 0.5, envMapIntensity: 0.5 }),
      steel: S.mat({ color: 0x9a9da3, roughness: 0.42, metalness: 0.75, envMapIntensity: 0.8 }),
      dark: S.mat({ color: 0x2c2b30, roughness: 0.55, metalness: 0.4, envMapIntensity: 0.4 }),
      concrete: S.mat({ color: 0xa79e93, map: grainTex, roughness: 0.92, envMapIntensity: 0.3 }),
      rubber: S.mat({ color: 0x18181a, roughness: 0.85, envMapIntensity: 0.3 }),
      cont: S.mat({ map: contTex, roughness: 0.62, metalness: 0.3, envMapIntensity: 0.5 }),
      cone: S.mat({ map: coneTex, roughness: 0.45 }),
      wall: S.mat({ map: metalTex, roughness: 0.6, metalness: 0.35, envMapIntensity: 0.5 }),
      roof: S.mat({ color: 0x5a5560, roughness: 0.5, metalness: 0.6, envMapIntensity: 0.7 }),
      wood: S.mat({ color: 0x4a3426, roughness: 0.9 }),
      lamp: S.glow(0xfff1d8, 4.5),
      sodium: S.glow(0xffb45a, 3.6),
    };
    const additive = (map, color, I, order = -2.8) => { const m = S.basic({ map, color, transparent: false, depthWrite: false, blending: T.AdditiveBlending, fog: false, side: T.DoubleSide, toneMapped: false }); m.color.multiplyScalar(I); m.userData.baseI = I; return m; };
    const M2 = {
      beam: additive(beamTex, 0xcfe0ff, 0.22),
      beamWarm: additive(beamTex, 0xffc27a, 0.3),
      beamFlick: additive(beamTex, 0xcfe0ff, 0.22),
      flare: additive(flareTex, 0xfff0d8, 1.6),
      pool: additive(flareTex, 0xffb060, 0.35),
      lampFlick: S.glow(0xfff1d8, 4.5),
      beacon: S.glow(0xff2a1a, 5),
    };

    /* =========================================================
       SOL : dalle + sable + dunes
       ========================================================= */
    {
      const pad = new T.PlaneGeometry(PX1 - PX0, PZ1 - PZ0); pad.rotateX(-Math.PI / 2);
      add(pad, M.pad, { p: [(PX0 + PX1) / 2, 0, (PZ0 + PZ1) / 2] });
      // lèvre de béton légèrement érodée autour de la dalle
      add(g.box(PX1 - PX0 + 16, 6, 10), M.concrete, { p: [(PX0 + PX1) / 2, -1, PZ0 - 3] });
      add(g.box(10, 6, PZ1 - PZ0), M.concrete, { p: [PX0 - 3, -1, (PZ0 + PZ1) / 2] });
      add(g.box(10, 6, PZ1 - PZ0), M.concrete, { p: [PX1 + 3, -1, (PZ0 + PZ1) / 2] });
      const sand = new T.PlaneGeometry(22000, 18000); sand.rotateX(-Math.PI / 2);
      add(sand, M.sand, { p: [650, -1.2, -6000] });
      // dunes lointaines
      const dune = (cx, cz, w, d, hgt, seed) => {
        const geo = new T.PlaneGeometry(w, d, 48, 14); geo.rotateX(-Math.PI / 2);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), z = p.getZ(i), u = x / w * 2, v = z / d * 2;
          const fall = Math.max(0, 1 - u * u) * Math.max(0, 1 - v * v);
          const ridge = Math.pow(fall, 1.4) * (0.75 + 0.25 * Math.sin(u * 5 + seed)) * (1 - 0.35 * Math.max(0, v));
          p.setY(i, hgt * ridge - 2);
        }
        geo.computeVertexNormals(); uvScale(geo, 1);
        const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 393, uv.getY(i) * d / 391);
        add(geo, M.sand, { p: [cx, 0, cz] });
      };
      dune(-2600, -4300, 3400, 1300, 260, 1); dune(1200, -4900, 4200, 1400, 200, 2); dune(4300, -4200, 3200, 1200, 280, 3); dune(-500, -5300, 3000, 900, 150, 4);
    }

    /* =========================================================
       PARCOURS DE PARKOUR (premier plan arrière)
       ========================================================= */
    const box = (mat, x, z, w, h, d, ry = 0, y0 = 0) => { add(g.box(w, h, d), mat, { p: [x, y0 + h / 2, z], r: [0, ry, 0] }); caster(x, z, w, d, ry, y0, y0 + h); };
    box(M.ply, 60, -620, 120, 60, 120); box(M.ply, 180, -620, 120, 100, 120); box(M.ply, 300, -620, 120, 140, 120);
    box(M.ply, 160, -800, 240, 80, 120);
    box(M.crate, 120, -800, 80, 80, 80, 0.1, 80); box(M.crate, 380, -830, 80, 80, 80, -0.08); box(M.crate, 380, -830, 80, 80, 80, 0.12, 80); box(M.crate, 468, -846, 80, 80, 80, 0.3);
    box(M.foam, 300, -505, 200, 28, 140);
    {
      const ramp = g.prism([[0, 0], [160, 0], [160, 60]], 120, 1); // rampe vers la caisse A
      add(uvScale(ramp.clone(), 1 / 160), M.ply, { p: [-160, 0, -620] });
      const ramp2 = g.prism([[0, 0], [180, 0], [0, 150]], 140, 1);
      add(uvScale(ramp2.clone(), 1 / 160), M.ply, { p: [1370, 0, -640] });
      caster(-80, -620, 160, 120, 0, 0, 40); caster(1460, -640, 180, 140, 0, 0, 80);
    }
    // poutre d'équilibre
    add(g.box(420, 14, 14), M.ply, { p: [710, 80, -720] }); caster(710, -720, 420, 14, 0, 73, 87);
    for (const x of [520, 710, 900]) { for (const s of [-1, 1]) add(g.box(6, 84, 6), M.steel, { p: [x + s * 12, 40, -720], r: [0, 0, s * 0.28] }); add(g.box(70, 5, 30), M.steel, { p: [x, 2.5, -720] }); }
    // saut de vide (côté droit)
    box(M.ply, 1040, -640, 140, 150, 140); box(M.ply, 1300, -640, 140, 150, 140);
    box(M.ply, 1150, -880, 120, 100, 120); box(M.ply, 1300, -900, 200, 200, 200);
    box(M.crate, 1520, -880, 80, 80, 80, 0.2);
    // plots de slalom + pneus
    {
      const cg = mergeG([xf(g.cone(13, 46, 14), [0, 23, 0]), xf(g.box(30, 3, 30), [0, 1.5, 0])]);
      const list = [];
      for (let i = 0; i < 5; i++) list.push({ p: [970 + i * 62, 0, -520 - (i % 2) * 18], r: [0, rnd(), 0] });
      list.push({ p: [-220, 0, -520], r: [0, 0.4, 0] }, { p: [-250, 0, -560], r: [0.0, 0, 1.45] }, { p: [440, 0, -540], r: [0, 1, 0] }, { p: [1620, 0, -560], r: [0, 0, 0] }, { p: [1660, 0, -600], r: [0, 0, 0] });
      const im = S.instanced(cg, M.cone, list); im.userData.noMerge = true; root.add(im);
      const tg = g.torus(30, 11, 18, 8, Math.PI * 2, 'y');
      const tl = [{ p: [1500, 11, -780] }, { p: [1500, 33, -780] }, { p: [1503, 55, -782] }, { p: [1560, 11, -720] }, { p: [-300, 11, -700] }, { p: [-238, 11, -712] }, { p: [-270, 33, -705] }];
      const ti = S.instanced(tg, M.rubber, tl); ti.userData.noMerge = true; root.add(ti);
    }
    // câbles au sol (du générateur vers les mâts)
    {
      const cab = (pts) => add(g.tube(pts, 2.2, 40, 5), M.rubber, {});
      cab([[-40, 1.5, -470], [80, 1.5, -500], [260, 2, -480], [420, 1.5, -520], [520, 2, -600], [620, 1.5, -640]]);
      cab([[1560, 1.5, -470], [1500, 2, -540], [1400, 1.5, -560], [1280, 1.5, -540], [1200, 2, -580], [1180, 1.5, -720]]);
      // générateur
      add(g.rbox(160, 90, 80, 6), M.dark, { p: [-120, 45, -900] }); add(g.box(150, 8, 70), M.steel, { p: [-120, 94, -900] });
      caster(-120, -900, 160, 80, 0, 0, 90);
    }
    // barrières de béton (type jersey) sur les côtés de la dalle
    {
      const jp = g.prism([[-30, 0], [30, 0], [30, 8], [12, 26], [9, 80], [-9, 80], [-12, 26], [-30, 8]], 300, 1.5);
      for (const [x, z, ry] of [[-640, -560, Math.PI / 2], [-950, -540, Math.PI / 2 + 0.05], [1980, -560, Math.PI / 2], [2290, -580, Math.PI / 2 - 0.08], [-520, -820, 0.3], [2000, -820, -0.4]]) {
        add(jp, M.concrete, { p: [x, 0, z], r: [0, ry, 0] }); caster(x, z, 60, 300, ry, 0, 80);
      }
    }

    /* =========================================================
       CONTENEURS
       ========================================================= */
    {
      const cgeo = (L) => {
        const geo = new T.BoxGeometry(L, 259, 244).toNonIndexed();
        const uv = geo.attributes.uv;
        // ordre des faces : +x, -x, +y, -y, +z, -z (6 sommets chacune en non indexé)
        const R = [[0, 0, 0.25, 0.5], [0, 0, 0.25, 0.5], [0.25, 0, 0.5, 0.5], [0.25, 0, 0.5, 0.5], [0, 0.5, L / 1219, 1], [0, 0.5, L / 1219, 1]];
        for (let f = 0; f < 6; f++) for (let k = 0; k < 6; k++) { const i = f * 6 + k, r = R[f]; uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1])); }
        return geo;
      };
      const COL = { rust: 0xb4542c, teal: 0x2f7480, blue: 0x2d4f96, white: 0xd8d4ca, maroon: 0x7c2c2c, green: 0x416e3c, orange: 0xd27a2a };
      const L40 = [
        { p: [-500, 129.5, -1150], ry: 0, c: 'rust' }, { p: [-1150, 129.5, -1430], ry: 0.04, c: 'teal' },
        { p: [1960, 129.5, -1080], ry: 0, c: 'white' }, { p: [2060, 388.5, -1100], ry: -0.04, c: 'maroon' },
        { p: [2330, 129.5, -1860], ry: Math.PI / 2, c: 'orange' }, { p: [-1500, 129.5, -2200], ry: 0.25, c: 'blue' }
      ];
      const L20 = [{ p: [-1250, 388.5, -1430], ry: 0.1, c: 'blue' }, { p: [2560, 129.5, -1360], ry: 0.5, c: 'green' }, { p: [-80, 129.5, -1600], ry: 0.12, c: 'white' }];
      for (const [list, L] of [[L40, 1219], [L20, 610]]) {
        const im = S.instanced(cgeo(L), M.cont, list.map(o => ({ p: o.p, r: [0, o.ry, 0] })));
        list.forEach((o, i) => { im.setColorAt(i, lin(COL[o.c])); caster(o.p[0], o.p[2], L, 244, o.ry, o.p[1] - 129.5, o.p[1] + 129.5); });
        im.instanceColor.needsUpdate = true; im.userData.noMerge = true; root.add(im);
      }
    }

    /* =========================================================
       MÂTS D'ÉCLAIRAGE (projecteurs qui s'allument)
       ========================================================= */
    const flares = [];
    function mast(x, z, H, tx, tz, flick) {
      add(g.cyl(10, 18, H, 10), M.steel, { p: [x, H / 2, z] });
      add(g.box(70, 30, 70), M.concrete, { p: [x, 15, z] });
      caster(x, z, 30, 30, 0, 0, H);
      const ang = Math.atan2(tx - x, tz - z);
      const head = S.group(); head.position.set(x, H, z); head.rotation.y = ang;
      S.add(head, g.box(200, 8, 10), M.steel, { p: [0, -10, 0] });
      S.add(head, g.box(10, 50, 10), M.steel, { p: [0, 15, -10] });
      const panel = S.group(); panel.rotation.x = 0.45; head.add(panel);
      S.add(panel, g.box(190, 100, 22), M.dark, { p: [0, 0, 0] });
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) S.add(panel, g.cyl(17, 17, 4, 12, 'z'), flick ? M2.lampFlick : M.lamp, { p: [-69 + i * 46, -22 + j * 44, 12] });
      stat.add(head);
      // halo + faisceau (vers la caméra : quad dans le plan XY)
      const fl = S.mesh(new T.PlaneGeometry(1, 1), M2.flare, { p: [x, H - 6, z + 30], s: [420, 300, 1] }); stat.add(fl); flares.push(fl);
      const top = [x, H - 20, z + 10], wT = 70, wB = 520;
      add(quad([top[0] - wT, top[1], top[2]], [top[0] + wT, top[1], top[2]], [tx + wB, 0, tz], [tx - wB, 0, tz]), flick ? M2.beamFlick : M2.beam, {});
    }
    mast(-260, -1450, 1350, 320, -330, false);
    mast(1720, -1500, 1350, 1020, -360, true);
    mast(1950, -3700, 950, 1700, -2700, false);
    mast(300, -4300, 900, 450, -3500, false);
    mast(-1200, -3900, 950, -900, -3000, false);
    // le projecteur droit éclaire vraiment la dalle (lumière froide)
    const spot = new T.SpotLight(0xd4e2ff, 1.25, 0, 0.3, 0.75, 0);
    spot.position.set(1720, 1340, -1480); spot.target.position.set(820, 0, -80);
    root.add(spot); root.add(spot.target);

    /* =========================================================
       HANGAR (droite) — porte ouverte, intérieur éclairé
       ========================================================= */
    {
      const HX0 = 1500, HW = 1600, HZ = -2400, HD = 1200, HH = 560, HA = 680;
      const fw = 1024, fh = 448, ku = fw / HW, kv = fh / HA;
      const FX = x => (x - HX0) * ku, FY = y => fh - y * kv;
      const door = [1570, 1900, 0, 430];
      const hangTex = S.canvasTex(fw, fh, (c, w, h) => {
        c.fillStyle = '#c4baaa'; c.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 10) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x, 0, 3, h); c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(x + 5, 0, 2, h); }
        for (let y = 60; y < h; y += 96) { c.fillStyle = 'rgba(40,34,30,0.35)'; c.fillRect(0, y, w, 2); }
        for (let i = 0; i < 60; i++) { const x = rnd() * w, l = 30 + rnd() * 160, y = rnd() * h * 0.5, gr = c.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(105,56,30,0.4)'); gr.addColorStop(1, 'rgba(105,56,30,0)'); c.fillStyle = gr; c.fillRect(x, y, 2 + rnd() * 4, l); }
        const gb = c.createLinearGradient(0, h - 120, 0, h); gb.addColorStop(0, 'rgba(170,120,80,0)'); gb.addColorStop(1, 'rgba(170,120,80,0.65)'); c.fillStyle = gb; c.fillRect(0, h - 120, w, 120);
        grain(c, w, h, 18);
        // ouverture de porte : intérieur
        const [d0, d1, , dt] = door;
        c.fillStyle = '#2a2420'; c.fillRect(FX(d0), FY(dt), FX(d1) - FX(d0), FY(0) - FY(dt));
        // porte coulissante à moitié ouverte
        c.fillStyle = '#8e877c'; c.fillRect(FX(d1 - 70), FY(dt), FX(d1) - FX(d1 - 70) + 30, FY(0) - FY(dt));
        for (let x = FX(d1 - 70); x < FX(d1) + 30; x += 8) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, FY(dt), 3, FY(0) - FY(dt)); }
        c.strokeStyle = '#2b2622'; c.lineWidth = 6; c.strokeRect(FX(d0) - 3, FY(dt) - 3, FX(d1) - FX(d0) + 36, FY(0) - FY(dt) + 6);
        c.fillStyle = '#e8b51e'; for (let y = FY(dt) + 6; y < FY(0); y += 22) { c.fillRect(FX(d0) - 12, y, 8, 11); }
        // enseignes
        txt(c, 'HANGAR 02', FX(1735), FY(500), 230, 44, '#1d1a18');
        txt(c, 'ROBOTICS TEST FACILITY', FX(2500), FY(470), 520, 36, '#1d1a18');
        c.fillStyle = '#a3261c'; c.fillRect(FX(2240), FY(420), FX(2760) - FX(2240), 6);
        txt(c, 'AUTHORIZED PERSONNEL ONLY', FX(2500), FY(380), 330, 18, '#a3261c', 700);
        // fenêtres hautes
        for (let x = 2000; x < 3060; x += 90) { c.fillStyle = '#20232a'; c.fillRect(FX(x), FY(560), 34, 16); }
        // lampe au-dessus de la porte
        c.fillStyle = '#2a2622'; c.fillRect(FX(1720), FY(462), 30, 10);
      });
      const hangEm = S.canvasTex(fw, fh, (c, w, h) => {
        c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
        const [d0, d1, , dt] = door;
        const x0 = FX(d0), x1 = FX(d1 - 70), y0 = FY(dt), y1 = FY(0);
        const gr = c.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#ffcf8a'); gr.addColorStop(0.45, '#c88a50'); gr.addColorStop(1, '#ffb870');
        c.fillStyle = gr; c.fillRect(x0, y0, x1 - x0, y1 - y0);
        // fond de l'atelier : établis, portique, silhouette d'un robot suspendu
        c.fillStyle = 'rgba(40,26,18,0.85)';
        c.fillRect(x0, y1 - 40, x1 - x0, 6); c.fillRect(x0 + 10, y1 - 70, 70, 30); c.fillRect(x1 - 60, y1 - 90, 50, 50);
        c.fillRect(x0 + 90, y0 + 10, 6, y1 - y0 - 10); c.fillRect(x0 + 150, y0 + 10, 6, y1 - y0 - 10); c.fillRect(x0 + 84, y0 + 14, 80, 6);
        const rx = x0 + 124, ry = y0 + 36;
        c.fillRect(rx - 1, y0 + 18, 2, 18);
        c.beginPath(); c.ellipse(rx, ry + 8, 8, 9, 0, 0, 7); c.fill();
        c.fillRect(rx - 14, ry + 18, 28, 38); c.fillRect(rx - 22, ry + 20, 7, 36); c.fillRect(rx + 15, ry + 20, 7, 36);
        c.fillRect(rx - 12, ry + 56, 10, 52); c.fillRect(rx + 2, ry + 56, 10, 52);
        for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(255,240,220,1)'; c.fillRect(x0 + 14 + i * 48, y0 + 4, 26, 4); }
        // fenêtres allumées
        for (let x = 2000; x < 3060; x += 90) { if (rnd() < 0.55) { c.fillStyle = rnd() < 0.5 ? '#ffd9a0' : '#bfe0ff'; c.fillRect(FX(x) + 2, FY(560) + 2, 30, 12); } }
        c.fillStyle = '#fff2d8'; c.fillRect(FX(1720) + 2, FY(462) + 7, 26, 4);
      });
      const hmat = S.mat({ map: hangTex, emissiveMap: hangEm, emissive: 0xffffff, emissiveIntensity: 1.7, roughness: 0.62, metalness: 0.35, envMapIntensity: 0.5 });
      M.hangar = hmat;
      const shp = new T.Shape(); shp.moveTo(0, 0); shp.lineTo(HW, 0); shp.lineTo(HW, HH); shp.quadraticCurveTo(HW / 2, HH + 2 * (HA - HH), 0, HH); shp.closePath();
      const fgeo = new T.ShapeGeometry(shp, 16); const fuv = fgeo.attributes.uv;
      for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) / HW, fuv.getY(i) / HA);
      add(fgeo, hmat, { p: [HX0, 0, HZ] });
      // flanc gauche (éclairé par le soleil) + toit arrondi
      const side = new T.PlaneGeometry(HD, HH); uvRect(side, 0, 0, 1, 1);
      add(side, M.wall, { p: [HX0, HH / 2, HZ - HD / 2], r: [0, -Math.PI / 2, 0] });
      const N = 16, pos = [], idx = [];
      for (let i = 0; i <= N; i++) { const t = i / N, u = 1 - t; const x = u * u * 0 + 2 * u * t * (HW / 2) + t * t * HW, y = u * u * HH + 2 * u * t * (HH + 2 * (HA - HH)) + t * t * HH; pos.push(HX0 + x, y, HZ, HX0 + x, y, HZ - HD); }
      for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
      const rg2 = new T.BufferGeometry(); rg2.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3)); rg2.setIndex(idx); rg2.computeVertexNormals();
      add(rg2, M.roof, {});
      add(g.box(HW, HH, 10), M.dark, { p: [HX0 + HW / 2, HH / 2, HZ - HD] });
      caster(HX0 + HW / 2, HZ - HD / 2, HW, HD, 0, 0, 620);
      // lumière de porte : lampe sodium + faisceau + flaque de lumière au sol
      add(g.box(40, 10, 24), M.sodium, { p: [1735, 462, HZ + 14] });
      add(quad([1700, 455, HZ + 20], [1770, 455, HZ + 20], [1880, 0, HZ + 150], [1590, 0, HZ + 150]), M2.beamWarm, {});
      const pool = new T.PlaneGeometry(700, 420); pool.rotateX(-Math.PI / 2);
      add(pool, M2.pool, { p: [1700, 1.5, HZ + 200] });
      // tablier de béton devant le hangar
      const ap = new T.PlaneGeometry(1700, 520); ap.rotateX(-Math.PI / 2); uvScale(ap, 6);
      add(ap, M.concrete, { p: [HX0 + 820, 0.3, HZ + 260] });
      // balise rouge sur le toit
      add(g.sphere(9, 10, 8), M2.beacon, { p: [HX0 + HW / 2, HA + 14, HZ - 20] });
    }

    /* =========================================================
       TOUR DE CONTRÔLE (gauche) + radar tournant
       ========================================================= */
    let radar;
    {
      const TX = -700, TZ = -3200, TH = 640;
      const shaftTex = S.canvasTex(128, 512, (c, w, h) => {
        c.fillStyle = '#b3aa9e'; c.fillRect(0, 0, w, h); grain(c, w, h, 20);
        for (let y = 0; y < h; y += 32) { c.fillStyle = 'rgba(40,34,30,0.3)'; c.fillRect(0, y, w, 1.5); }
        for (let y = 20; y < h - 20; y += 40) { c.fillStyle = '#2a2a30'; c.fillRect(w / 2 - 8, y, 16, 22); }
        const gb = c.createLinearGradient(0, h - 80, 0, h); gb.addColorStop(0, 'rgba(160,110,70,0)'); gb.addColorStop(1, 'rgba(160,110,70,0.5)'); c.fillStyle = gb; c.fillRect(0, h - 80, w, 80);
      });
      const shaftEm = S.canvasTex(128, 512, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); for (let y = 20; y < h - 20; y += 40) if (rnd() < 0.45) { c.fillStyle = '#ffd49a'; c.fillRect(w / 2 - 6, y + 2, 12, 18); } });
      const tmat = S.mat({ map: shaftTex, emissiveMap: shaftEm, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.85, envMapIntensity: 0.3 });
      add(g.box(110, TH, 110), tmat, { p: [TX, TH / 2, TZ] });
      caster(TX, TZ, 110, 110, 0, 0, TH + 160);
      const cabTex = S.canvasTex(512, 64, (c, w, h) => {
        c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 8; i++) { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffe2b0'); gr.addColorStop(1, '#ff9d5a'); c.fillStyle = gr; c.fillRect(i * 64 + 6, 6, 52, h - 12); c.fillStyle = 'rgba(20,14,10,0.9)'; if (rnd() < 0.6) c.fillRect(i * 64 + 18 + rnd() * 20, h - 30, 10, 24); }
      });
      const cmat = S.mat({ color: 0x141820, roughness: 0.12, metalness: 0.7, emissive: 0xffffff, emissiveMap: cabTex, emissiveIntensity: 2.0, envMapIntensity: 1.2 });
      add(g.cyl(150, 118, 120, 8), cmat, { p: [TX, TH + 80, TZ], r: [0, Math.PI / 8, 0] });
      add(g.cyl(132, 132, 22, 8), M.concrete, { p: [TX, TH + 10, TZ], r: [0, Math.PI / 8, 0] });
      add(g.cyl(165, 160, 14, 8), M.dark, { p: [TX, TH + 147, TZ], r: [0, Math.PI / 8, 0] });
      add(g.torus(150, 2, 24, 4, Math.PI * 2, 'y'), M.steel, { p: [TX, TH + 40, TZ] });
      add(g.cyl(3, 3, 200, 6), M.steel, { p: [TX + 60, TH + 250, TZ] });
      add(g.sphere(8, 10, 8), M2.beacon, { p: [TX + 60, TH + 352, TZ] });
      add(g.box(320, 170, 220), M.concrete, { p: [TX + 40, 85, TZ + 40] });
      add(g.box(60, 90, 6), M.sodium, { p: [TX + 120, 50, TZ + 152] });
      caster(TX + 40, TZ + 40, 320, 220, 0, 0, 170);
      // radar (tourne)
      radar = S.group(); radar.position.set(TX - 50, TH + 156, TZ);
      S.add(radar, g.cyl(4, 4, 30, 6), M.steel, { p: [0, 15, 0] });
      S.add(radar, g.box(110, 18, 6), M.steel, { p: [0, 38, 0] });
      S.add(radar, g.box(110, 4, 16), M.dark, { p: [0, 30, 6] });
      S.merge(radar); radar.userData.noMerge = true; root.add(radar);
    }

    /* =========================================================
       CONSTRUCTIONS SECONDAIRES : bungalows, clôture, manche à air
       ========================================================= */
    {
      const trTex = S.canvasTex(256, 128, (c, w, h) => {
        c.fillStyle = '#d9d3c8'; c.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 8) { c.fillStyle = 'rgba(0,0,0,0.1)'; c.fillRect(0, y, w, 2); }
        for (let i = 0; i < 4; i++) { c.fillStyle = '#272a30'; c.fillRect(20 + i * 60, 40, 30, 26); }
        c.fillStyle = '#3a3330'; c.fillRect(220, 50, 22, 70);
        const gb = c.createLinearGradient(0, h - 40, 0, h); gb.addColorStop(0, 'rgba(170,120,80,0)'); gb.addColorStop(1, 'rgba(170,120,80,0.6)'); c.fillStyle = gb; c.fillRect(0, h - 40, w, 40);
        grain(c, w, h, 14);
      });
      const trEm = S.canvasTex(256, 128, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) if (i !== 2) { c.fillStyle = i % 2 ? '#cfe6ff' : '#ffd6a0'; c.fillRect(22 + i * 60, 42, 26, 22); } });
      const trm = S.mat({ map: trTex, emissiveMap: trEm, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.7, envMapIntensity: 0.4 });
      for (const [x, z, ry] of [[-1900, -2700, 0.1], [3500, -2900, -0.2], [-2600, -3600, 0.4]]) {
        const geo = new T.BoxGeometry(900, 280, 300); add(geo, trm, { p: [x, 160, z], r: [0, ry, 0] });
        add(g.box(880, 20, 280), M.dark, { p: [x, 10, z], r: [0, ry, 0] });
        caster(x, z, 900, 300, ry, 0, 300);
      }
      // clôture grillagée (bandes latérales)
      const fenceTex = S.canvasTex(128, 128, (c, w, h) => {
        c.clearRect(0, 0, w, h); c.strokeStyle = 'rgba(200,200,205,0.9)'; c.lineWidth = 2;
        for (let i = -h; i < w + h; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + h, h); c.stroke(); c.beginPath(); c.moveTo(i + h, 0); c.lineTo(i, h); c.stroke(); }
      }, { repeat: [1, 1] });
      const fm = S.mat({ map: fenceTex, color: 0x9a9aa4, transparent: true, opacity: 0.55, alphaTest: 0.02, depthWrite: false, side: T.DoubleSide, roughness: 0.5, metalness: 0.6 });
      const fence = (x0, x1, z) => {
        const L = x1 - x0, geo = new T.PlaneGeometry(L, 230); uvScale(geo, 1); const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 60, uv.getY(i) * 230 / 60);
        add(geo, fm, { p: [(x0 + x1) / 2, 115, z] });
        for (let x = x0; x <= x1; x += 300) add(g.cyl(4, 4, 250, 6), M.steel, { p: [x, 125, z] });
        add(g.cyl(3, 3, L, 6, 'x'), M.steel, { p: [(x0 + x1) / 2, 240, z] });
      };
      fence(-2200, -350, -1900); fence(1450, 3000, -1750);
      // manche à air
      add(g.cyl(4, 6, 420, 8), M.steel, { p: [1180, 210, -760] });
      add(g.box(40, 4, 40), M.concrete, { p: [1180, 2, -760] });
      caster(1180, -760, 12, 12, 0, 0, 420);
    }
    const sockTex = S.canvasTex(256, 32, (c, w, h) => { for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? '#f2eee6' : '#ff5a12'; c.fillRect(i * w / 5, 0, w / 5 + 1, h); } });
    const sockMat = S.mat({ map: sockTex, roughness: 0.7, side: T.DoubleSide });
    const sockU = { value: 0 };
    sockMat.onBeforeCompile = (sh) => {
      sh.uniforms.time = sockU;
      sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float sx = clamp(position.x / 150.0, 0.0, 1.0);
        transformed.y += sin(position.x * 0.05 - time * 9.0) * 5.0 * sx - sx * sx * 14.0;
        transformed.z += sin(position.x * 0.04 - time * 7.0 + 1.3) * 6.0 * sx;`);
    };
    const sock = S.group(); sock.position.set(1180, 405, -760);
    {
      const sg = new T.CylinderGeometry(9, 20, 150, 12, 8, true); sg.rotateZ(Math.PI / 2); sg.translate(75, 0, 0);
      S.add(sock, sg, sockMat, {}); S.add(sock, g.torus(20, 1.5, 16, 4, Math.PI * 2, 'x'), M.steel, { p: [0, 0, 0] });
      sock.userData.noMerge = true; root.add(sock);
    }

    /* =========================================================
       VÉGÉTATION : arbres de Josué, buissons, rochers
       ========================================================= */
    {
      // arbre de Josué : tronc + branches + touffes de feuilles en pointes
      const parts = [], R = S.rng(9);
      const limb = (x0, y0, x1, y1, r, rz) => { const L = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(x1 - x0, y1 - y0); parts.push(xf(g.cyl(r * 0.8, r, L, 6), [(x0 + x1) / 2, (y0 + y1) / 2, rz], [0, 0, -a])); };
      limb(0, 0, 4, 170, 13, 0);
      const tips = [[-70, 270], [60, 300], [10, 330], [-110, 220], [110, 250]];
      for (const [tx, ty] of tips) { limb(2, 160, tx * 0.6, ty * 0.8, 7, 0); limb(tx * 0.6, ty * 0.8, tx, ty, 5, 0); }
      for (const [tx, ty] of tips) for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; parts.push(xf(g.cone(5, 34, 4), [tx + Math.cos(a) * 6, ty + 8, Math.sin(a) * 6], [Math.sin(a) * 0.9, 0, Math.cos(a) * 0.9])); }
      const jt = mergeG(parts);
      const jtMat = S.mat({ color: 0x3e3a2a, roughness: 0.9 });
      const pl = [[-420, -1950, 1.2], [-1100, -2600, 1.4], [1380, -2000, 1.1], [-260, -3300, 1.3], [1050, -3600, 1.2], [2600, -3400, 1.5], [-1700, -4200, 1.6], [3600, -4600, 1.4], [-3000, -2900, 1.5], [700, -5000, 1.3], [-2300, -1600, 1.4]];
      const ji = S.instanced(jt, jtMat, pl.map(([x, z, s]) => ({ p: [x, 0, z], r: [0, R() * 6.28, 0], s: s * (0.85 + R() * 0.3) })));
      ji.userData.noMerge = true; root.add(ji);
      // buissons (créosote)
      const bush = mergeG([xf(new T.IcosahedronGeometry(30, 0), [0, 14, 0], [0, 0, 0], [1.2, 0.55, 1]), xf(new T.IcosahedronGeometry(20, 0), [24, 10, 8], [0.5, 0.3, 0], [1, 0.6, 1]), xf(new T.IcosahedronGeometry(18, 0), [-22, 8, -6], [0.2, 1, 0], [1, 0.7, 1])]);
      const bl = [], NB = Q >= 2 ? 50 : 110;
      for (let i = 0; i < NB; i++) {
        const x = -3500 + R() * 8000, z = -480 - Math.pow(R(), 1.3) * 5000;
        if (x > PX0 - 60 && x < PX1 + 60 && z > -520) continue;
        if (x > 1450 && x < 3150 && z < -2300 && z > -3700) continue;
        bl.push({ p: [x, 0, z], r: [0, R() * 6.28, 0], s: 0.6 + R() * 0.9 });
      }
      const bi = S.instanced(bush, S.mat({ color: 0x5a5a34, roughness: 0.95, flatShading: true }), bl); bi.userData.noMerge = true; root.add(bi);
      // rochers
      const rockMat = S.mat({ color: 0x8a5e48, roughness: 0.9, flatShading: true });
      for (let i = 0; i < 26; i++) {
        const geo = new T.IcosahedronGeometry(1, 1), p = geo.attributes.position;
        for (let k = 0; k < p.count; k++) { const f = 0.75 + R() * 0.5; p.setXYZ(k, p.getX(k) * f, p.getY(k) * f, p.getZ(k) * f); }
        geo.computeVertexNormals();
        const s = 15 + R() * 45, x = -2800 + R() * 6400, z = -500 - R() * 3200;
        if (x > PX0 - 80 && x < PX1 + 80 && z > -540) continue;
        add(geo, rockMat, { p: [x, s * 0.25, z], r: [R(), R() * 6, R()], s: [s * (1 + R()), s * 0.7, s] });
      }
    }

    /* =========================================================
       CALQUE AU SOL : chemins, traces, ombres longues
       ========================================================= */
    {
      const hull = (pts) => { pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = []; for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); } for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); } up.pop(); lo.pop(); return lo.concat(up); };
      const ovTex = S.canvasTex(ovW, ovH, (c, w, h) => {
        c.clearRect(0, 0, w, h);
        for (let i = 0; i < 90; i++) rg(c, rnd() * w, rnd() * h, 30 + rnd() * 140, rnd() < 0.6 ? [96, 64, 46] : [236, 204, 162], 0.08 + rnd() * 0.12, 2.2, 1);
        // pistes de terre battue
        c.lineCap = 'round';
        const road = (pts, wd, a) => { c.strokeStyle = `rgba(104,72,52,${a})`; c.lineWidth = wd; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(OX(p[0]), OZ(p[1])) : c.moveTo(OX(p[0]), OZ(p[1]))); c.stroke(); };
        const tracks = (pts, sep, a) => { for (const off of [-sep / 2, sep / 2]) { c.strokeStyle = `rgba(60,40,30,${a})`; c.lineWidth = 3; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(OX(p[0]), OZ(p[1] + off)) : c.moveTo(OX(p[0]), OZ(p[1] + off))); c.stroke(); } };
        const bez = (a, b, cc, n = 40) => { const r = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; r.push([u * u * a[0] + 2 * u * t * cc[0] + t * t * b[0], u * u * a[1] + 2 * u * t * cc[1] + t * t * b[1]]); } return r; };
        const p1 = bez([1735, -2300], [1650, -320], [1500, -1300]); road(p1, 30, 0.28); tracks(p1, 70, 0.3);
        const p2 = [[-2400, -4200], [-800, -4150], [600, -4230], [2000, -4180], [3600, -4260]]; road(p2, 22, 0.32); tracks(p2, 60, 0.3);
        const p3 = bez([-2400, -1200], [-300, -480], [-900, -700]); road(p3, 20, 0.2); tracks(p3, 60, 0.25);
        for (let i = 0; i < 6; i++) { const a = [OX0 + rnd() * 6000, -4400 + rnd() * 3800], b = [OX0 + rnd() * 6000, -4400 + rnd() * 3800], cc = [OX0 + rnd() * 6000, -4400 + rnd() * 3800]; tracks(bez(a, b, cc), 50, 0.18); }
        // ombres longues du couchant
        c.filter = 'blur(3px)';
        c.fillStyle = 'rgba(40,22,70,0.52)';
        for (const k of casters) {
          const cs = Math.cos(k.ry), sn = Math.sin(k.ry), pts = [];
          for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const lx = a * k.w / 2, lz = b * k.d / 2, x = k.x + lx * cs + lz * sn, z = k.z - lx * sn + lz * cs;
            pts.push([x + SH[0] * k.y0, z + SH[1] * k.y0], [x + SH[0] * k.y1, z + SH[1] * k.y1]);
          }
          const hp = hull(pts); c.beginPath(); hp.forEach((p, i) => i ? c.lineTo(OX(p[0]), OZ(p[1])) : c.moveTo(OX(p[0]), OZ(p[1]))); c.closePath(); c.fill();
        }
        c.filter = 'none';
      });
      const ov = new T.PlaneGeometry(OX1 - OX0, OZ1 - OZ0); ov.rotateX(-Math.PI / 2);
      const ovm = S.basic({ map: ovTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const ovMesh = S.mesh(ov, ovm, { p: [(OX0 + OX1) / 2, 0.6, (OZ0 + OZ1) / 2] });
      ovMesh.renderOrder = -2.95; ovMesh.userData.noMerge = true; root.add(ovMesh);
    }

    /* =========================================================
       LOINTAIN : mesas en couches de brume (atlas 4 rangées)
       ========================================================= */
    const FAR = [
      { z: -6000, x0: -5800, w: 13000, yb: -150, ht: 1150, near: [118, 60, 86], away: [62, 40, 76], haze: [176, 104, 124], hazeA: 0.55, rim: [255, 170, 110], rimA: 0.9, rimW: 2.2,
        prof: x => Math.max(230 + 60 * Math.sin(x * 0.0012 + 0.5) + 50 * n1(x * 0.004), mesa(x, 1450, 2300, 830, 60, 520, 0.66), mesa(x, 4400, 1000, 600, 50, 400, 0.6), mesa(x, -2900, 900, 560, 50, 380, 0.62), mesa(x, -5200, 600, 700, 40, 300, 0.6)) + 12 * n1(x * 0.05) + 6 * n1(x * 0.17) },
      { z: -8500, x0: -8000, w: 17500, yb: -150, ht: 1650, near: [170, 92, 116], away: [92, 62, 108], haze: [200, 126, 140], hazeA: 0.6, rim: [255, 190, 130], rimA: 0.8, rimW: 2,
        prof: x => Math.max(300 + 90 * Math.sin(x * 0.0008 + 2) + 60 * n1(x * 0.003 + 5), mesa(x, -2900, 240, 1350, 30, 160, 0.82), mesa(x, -3350, 150, 1150, 30, 140, 0.8), mesa(x, -800, 700, 900, 50, 420, 0.6), mesa(x, 2500, 1800, 1200, 60, 600, 0.65), mesa(x, 6000, 1400, 1000, 60, 500, 0.6), mesa(x, -6200, 1600, 1100, 60, 500, 0.6)) + 15 * n1(x * 0.04) },
      { z: -11500, x0: -10500, w: 22500, yb: -150, ht: 1250, near: [210, 128, 136], away: [124, 90, 140], haze: [222, 150, 152], hazeA: 0.6, rim: [255, 200, 150], rimA: 0.6, rimW: 2,
        prof: x => Math.max(380 + 120 * Math.sin(x * 0.0005 + 1) + 70 * n1(x * 0.0016 + 9), mesa(x, -500, 2600, 760, 60, 900, 0.7), mesa(x, 4200, 3000, 880, 60, 900, 0.7), mesa(x, -6500, 2400, 820, 60, 900, 0.7)) + 14 * n1(x * 0.03) },
      { z: -14500, x0: -13000, w: 28000, yb: -150, ht: 1300, near: [232, 158, 150], away: [150, 116, 160], haze: [236, 172, 160], hazeA: 0.5, rim: [255, 214, 170], rimA: 0.4, rimW: 2,
        prof: x => 520 + 260 * n1(x * 0.0007) + 160 * n1(x * 0.0019 + 3) + 70 * n1(x * 0.006 + 7) + 25 * n1(x * 0.02) }
    ];
    {
      const farTex = S.canvasTex(2048, 2048, (c) => {
        const W = 2048, H = 512;
        FAR.forEach((L, r) => {
          const y0 = r * H, toY = yw => y0 + H - (yw - L.yb) / L.ht * H, prof = [];
          for (let i = 0; i <= W; i += 2) prof.push(L.prof(L.x0 + i / W * L.w));
          c.save(); c.beginPath(); c.rect(0, y0, W, H); c.clip();
          const path = () => { c.beginPath(); c.moveTo(0, y0 + H); for (let k = 0; k < prof.length; k++) c.lineTo(k * 2, toY(prof[k])); c.lineTo(W, y0 + H); c.closePath(); };
          const grd = c.createLinearGradient(0, 0, W, 0);
          for (let s = 0; s <= 40; s++) { const p = sunProx(L.x0 + s / 40 * L.w, L.z, 18); grd.addColorStop(s / 40, css(mixRGB(L.away, L.near, p))); }
          path(); c.fillStyle = grd; c.fill();
          c.globalCompositeOperation = 'source-atop';
          // strates et ravines
          for (let k = 0; k < 50; k++) { c.fillStyle = `rgba(20,8,20,${0.03 + rnd() * 0.06})`; c.fillRect(0, y0 + rnd() * H, W, 1 + rnd() * 3); }
          for (let k = 0; k < 260; k++) { const x = rnd() * W, yy = toY(prof[Math.min(prof.length - 1, x / 2 | 0)]); c.fillStyle = `rgba(20,8,24,${0.05 + rnd() * 0.08})`; c.fillRect(x, yy, 1 + rnd() * 2, 20 + rnd() * 120); }
          const vg = c.createLinearGradient(0, y0 + H * 0.35, 0, y0 + H); vg.addColorStop(0, css(L.haze, 0)); vg.addColorStop(1, css(L.haze, L.hazeA));
          c.fillStyle = vg; c.fillRect(0, y0, W, H);
          c.globalCompositeOperation = 'source-over';
          // liseré de lumière sur les crêtes (contre-jour)
          c.lineWidth = L.rimW;
          for (let k = 1; k < prof.length; k++) {
            const p = sunProx(L.x0 + k * 2 / W * L.w, L.z, 22); if (p < 0.04) continue;
            c.strokeStyle = css(L.rim, L.rimA * p); c.beginPath(); c.moveTo((k - 1) * 2, toY(prof[k - 1]) + 0.6); c.lineTo(k * 2, toY(prof[k]) + 0.6); c.stroke();
          }
          c.restore();
        });
      }, { aniso: 4 });
      const fm = S.basic({ map: farTex, alphaTest: 0.5, fog: false });
      const fg = S.group();
      for (let r = FAR.length - 1; r >= 0; r--) { const L = FAR[r], geo = new T.PlaneGeometry(L.w, L.ht); uvRect(geo, 0, 1 - (r + 1) / 4, 1, 1 - r / 4); S.add(fg, geo, fm, { p: [L.x0 + L.w / 2, L.yb + L.ht / 2, L.z] }); }
      S.merge(fg); fg.children.forEach(m => { m.renderOrder = -4; }); fg.userData.noMerge = true; root.add(fg);
    }

    /* =========================================================
       CIEL : dégradé or → magenta → violet, soleil, rayons, nuages
       ========================================================= */
    const cloudCv = (() => {
      const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 512; const c = cv.getContext('2d');
      c.fillStyle = '#000'; c.fillRect(0, 0, 2048, 512);
      const R = S.rng(31);
      for (let i = 0; i < 260; i++) {
        const y = 512 - Math.pow(R(), 1.5) * 470, x = R() * 2048, r = 20 + R() * 60 * (1 - y / 700), sx = 4 + R() * 7, a = 0.12 + R() * 0.25;
        for (const dx of [-2048, 0, 2048]) rg(c, x + dx, y, r, [255, 255, 255], a, sx, 1);
      }
      for (let i = 0; i < 60; i++) { const y = R() * 300, x = R() * 2048; for (const dx of [-2048, 0, 2048]) rg(c, x + dx, y, 14 + R() * 20, [255, 255, 255], 0.2, 12, 0.6); }
      return cv;
    })();
    const cloudTex = texFrom(cloudCv, { repeat: [1, 1], srgb: false });
    cloudTex.wrapT = T.ClampToEdgeWrapping;
    const skyU = {
      time: { value: 0 }, clouds: { value: cloudTex }, sunDir: { value: new T.Vector3(SUN[0], SUN[1], SUN[2]) },
      cZen: { value: lin(0x1a1440) }, cUp: { value: lin(0x4a2a7c) }, cMid: { value: lin(0xb4447e) }, cPink: { value: lin(0xf07c7a) }, cGold: { value: lin(0xffb15e) },
      cHaze: { value: lin(0xc07a82) }, cSun: { value: new T.Color(6.0, 4.0, 2.2) }, cGlow: { value: new T.Color(1.0, 0.5, 0.2) },
      cCloudD: { value: lin(0x45204e) }, cCloudL: { value: lin(0xff8a78) }
    };
    {
      const sm = new T.ShaderMaterial({
        uniforms: skyU, side: T.BackSide, depthWrite: false, fog: false, toneMapped: false,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float time; uniform sampler2D clouds; uniform vec3 sunDir, cZen, cUp, cMid, cPink, cGold, cHaze, cSun, cGlow, cCloudD, cCloudL; varying vec3 vDir;
          void main(){
            vec3 d = normalize(vDir); float h = d.y;
            float cAz = dot(normalize(d.xz + vec2(1e-5)), normalize(sunDir.xz));
            float tw = pow(0.5 + 0.5 * cAz, 5.0);
            vec3 low = mix(cPink, cGold, tw);
            float e = max(h, 0.0);
            vec3 c = mix(low, cMid, smoothstep(0.0, 0.11, e));
            c = mix(c, cUp, smoothstep(0.08, 0.32, e));
            c = mix(c, cZen, smoothstep(0.3, 0.85, e));
            c = mix(c, cHaze, smoothstep(0.0, -0.05, h));
            float cs = dot(d, sunDir), cp = max(cs, 0.0);
            vec3 sd = normalize(cross(sunDir, vec3(0.0, 1.0, 0.0))), su = cross(sd, sunDir);
            float an = atan(dot(d, su), dot(d, sd));
            float rays = pow(0.5 + 0.5 * sin(an * 21.0 + sin(an * 5.0 + time * 0.05) * 2.5), 3.0) * pow(cp, 10.0) * step(0.0, h);
            c += cGlow * (pow(cp, 5.0) * 0.32 + pow(cp, 40.0) * 0.55 + pow(cp, 380.0) * 1.3 + rays * 0.22);
            c = mix(c, cSun, smoothstep(0.99930, 0.99948, cs));
            float az = atan(d.x, -d.z), el = asin(clamp(h, -1.0, 1.0));
            vec2 uv = vec2(az * 0.4775 + time * 0.0012, (el - 0.03) / 0.27);
            if (uv.y > 0.0 && uv.y < 1.0) {
              float m = smoothstep(0.0, 0.1, uv.y) * smoothstep(1.0, 0.55, uv.y);
              float dn = texture2D(clouds, uv).r, db = texture2D(clouds, uv - vec2(0.0, 0.03)).r;
              float dn2 = texture2D(clouds, uv * vec2(1.7, 1.0) + vec2(time * 0.002, 0.0)).r;
              float dens = smoothstep(0.18, 0.75, dn * 0.8 + dn2 * 0.35) * m;
              float lit = clamp(0.35 + (dn - db) * 3.5 + uv.y * -0.2, 0.0, 1.0);
              vec3 cc = mix(cCloudD, cCloudL, lit);
              cc = mix(cc, cGold * 1.1, tw * 0.55 * lit);
              cc += cGlow * pow(cp, 14.0) * 2.2;
              c = mix(c, cc, dens * 0.92);
            }
            gl_FragColor = vec4(c, 1.0);
          }`
      });
      const sky = S.mesh(new T.SphereGeometry(15000, 48, 24), sm, { p: [650, 140, 0] });
      sky.renderOrder = -10; sky.userData.noMerge = true; sky.frustumCulled = false; root.add(sky);
    }

    /* =========================================================
       ATMOSPHÈRE : brume, mirage, voiles de poussière, particules
       ========================================================= */
    const timeU = { value: 0 };
    const fxMat = (frag, uniforms, order, additiveB) => {
      const m = new T.ShaderMaterial({
        uniforms: Object.assign({ time: timeU, tex: { value: noiseTex } }, uniforms), transparent: false, depthWrite: false, fog: false, side: T.DoubleSide,
        blending: additiveB ? T.AdditiveBlending : T.CustomBlending, blendSrc: T.SrcAlphaFactor, blendDst: T.OneMinusSrcAlphaFactor,
        vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: frag
      });
      m.userData.order = order; return m;
    };
    const fx = (geo, mat, o) => { const m = S.mesh(geo, mat, o); m.renderOrder = mat.userData.order; m.userData.noMerge = true; m.frustumCulled = false; root.add(m); return m; };
    // mur de brume au pied des mesas
    const hazeMat = fxMat(`uniform vec3 col; varying vec2 vUv; void main(){ gl_FragColor = vec4(col, pow(1.0 - vUv.y, 1.6) * 0.85); }`, { col: { value: lin(0xc0808a) } }, -3.9);
    fx(new T.PlaneGeometry(30000, 520), hazeMat, { p: [650, 200, -5700] });
    // mirage : bande scintillante à l'horizon (reflet du ciel)
    const mirMat = fxMat(`uniform float time; uniform vec3 cA, cB; varying vec2 vUv; varying vec3 vW;
      void main(){
        float az = atan(vW.x - 650.0, 689.0 - vW.z);
        float p = exp(-pow((az + 0.279) / 0.32, 2.0));
        vec3 c = mix(cA, cB, p) * (1.0 + p * 0.5);
        float s = 0.5 + 0.5 * sin(vW.x * 0.011 + time * 2.0 + sin(vW.x * 0.0037 - time * 0.8) * 3.0);
        s *= 0.6 + 0.4 * sin(vW.x * 0.029 - time * 3.3 + vUv.y * 4.0);
        float prof = smoothstep(0.0, 0.4, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
        gl_FragColor = vec4(c, prof * (0.2 + 0.55 * s) * (0.35 + 0.65 * p));
      }`, { cA: { value: lin(0xe08a8a) }, cB: { value: lin(0xffc27a) } }, -3.85);
    fx(new T.PlaneGeometry(26000, 110), mirMat, { p: [650, 30, -5400] });
    // voiles de poussière au ras du sol (plans verticaux, bruit qui défile avec le vent)
    if (Q < 2) {
      const dustMat = fxMat(`uniform float time; uniform sampler2D tex; uniform vec3 col; varying vec2 vUv; varying vec3 vW;
        void main(){
          vec2 q = vec2(vW.x / 900.0, vUv.y);
          float n = texture2D(tex, vec2(q.x - time * 0.045, q.y * 0.45 + vW.z * 0.0003)).r;
          float n2 = texture2D(tex, vec2(q.x * 2.3 - time * 0.09, q.y * 0.9 - time * 0.015)).r;
          float a = smoothstep(0.3, 0.95, n * 0.65 + n2 * 0.5) * pow(1.0 - vUv.y, 1.7) * smoothstep(0.0, 0.06, vUv.y);
          gl_FragColor = vec4(col, a * 0.42);
        }`, { col: { value: lin(0xd8a07c) } }, -2.9);
      fx(new T.PlaneGeometry(5000, 150), dustMat, { p: [650, 75, -950] });
      fx(new T.PlaneGeometry(8000, 240), dustMat, { p: [650, 120, -2000] });
      fx(new T.PlaneGeometry(12000, 340), dustMat, { p: [650, 170, -3600] });
      // rafales de sable sur le sol (traînées horizontales)
      const gustMat = fxMat(`uniform float time; uniform sampler2D tex; uniform vec3 col; varying vec3 vW;
        void main(){
          float n = texture2D(tex, vec2(vW.x / 2600.0 - time * 0.11, vW.z / 120.0)).r;
          float n2 = texture2D(tex, vec2(vW.x / 1400.0 - time * 0.16, vW.z / 300.0 + 0.3)).r;
          float edge = smoothstep(-2600.0, -1800.0, vW.z) * smoothstep(-200.0, -500.0, vW.z) * smoothstep(-1700.0, -900.0, vW.x) * smoothstep(3100.0, 2300.0, vW.x);
          gl_FragColor = vec4(col, smoothstep(0.55, 0.95, n * 0.7 + n2 * 0.45) * 0.38 * edge);
        }`, { col: { value: lin(0xe2b48a) } }, -2.92);
      const gg = new T.PlaneGeometry(5000, 2600); gg.rotateX(-Math.PI / 2);
      fx(gg, gustMat, { p: [700, 2, -1450] });
    }
    // particules : poussière dorée en suspension + grains de sable rasants
    root.add(S.particles({ kind: 'dust', count: Q >= 2 ? 250 : 600, box: [-750, 750, 0, 480, -1100, 260], speed: 7, wind: [70, 0], size: 3.2, color: 0xffc890, opacity: 0.55 }));
    root.add(S.particles({ kind: 'dust', count: Q >= 2 ? 300 : 900, box: [-800, 800, 0, 50, -900, 200], speed: 4, wind: [420, 0], size: 1.8, color: 0xe8b88c, opacity: 0.5, blending: 'normal', seed: 19 }));

    /* =========================================================
       VIE : tourbillon de poussière, pick-up, drone, vautours
       ========================================================= */
    const devilMat = new T.ShaderMaterial({
      uniforms: { time: timeU, tex: { value: noiseTex }, col: { value: lin(0xe6b088) } }, transparent: false, depthWrite: false, fog: false, side: T.DoubleSide,
      blending: T.CustomBlending, blendSrc: T.SrcAlphaFactor, blendDst: T.OneMinusSrcAlphaFactor,
      vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; uniform float time; void main(){ vUv = uv; vec3 p = position; p.x += sin(p.y * 0.004 + time * 0.7) * 60.0 * (p.y / 1000.0); vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform float time; uniform sampler2D tex; uniform vec3 col; varying vec2 vUv; varying vec3 vN, vV;
        void main(){ float n = texture2D(tex, vec2(vUv.x * 2.0 + time * 0.5 - vUv.y * 0.8, vUv.y * 1.3 - time * 0.3)).r;
          float f = pow(abs(dot(vN, vV)), 1.3);
          float a = smoothstep(0.3, 0.85, n) * f * pow(1.0 - vUv.y, 0.6) * smoothstep(0.0, 0.08, vUv.y);
          gl_FragColor = vec4(col * (0.8 + 0.4 * n), a * 0.5); }`
    });
    const devil = S.mesh(new T.CylinderGeometry(160, 22, 1000, 20, 8, true), devilMat, { p: [-1700, 500, -5000] });
    devil.renderOrder = -2.9; devil.userData.noMerge = true; root.add(devil);

    // pick-up sur la piste lointaine
    const truck = S.group();
    {
      const body = S.mat({ color: 0x2c3440, roughness: 0.45, metalness: 0.5, envMapIntensity: 0.8 });
      S.add(truck, g.box(520, 70, 190), body, { p: [0, 75, 0] });
      S.add(truck, g.box(200, 75, 180), body, { p: [40, 145, 0] });
      S.add(truck, g.box(190, 50, 182), S.mat({ color: 0x0c1016, roughness: 0.1, metalness: 0.8 }), { p: [42, 150, 0] });
      for (const x of [-170, 170]) for (const z of [-90, 90]) S.add(truck, g.cyl(38, 38, 26, 12, 'z'), M.rubber, { p: [x, 38, z] });
      S.add(truck, g.box(6, 16, 40), S.glow(0xfff4dc, 6), { p: [262, 90, -60] });
      S.add(truck, g.box(6, 16, 40), S.glow(0xfff4dc, 6), { p: [262, 90, 60] });
      S.add(truck, g.box(6, 14, 30), S.glow(0xff2010, 4), { p: [-262, 92, -70] });
      S.add(truck, g.box(6, 14, 30), S.glow(0xff2010, 4), { p: [-262, 92, 70] });
      S.add(truck, g.box(10, 16, 60), S.glow(0xffa020, 5), { p: [40, 190, 0] }); // gyrophare
      S.merge(truck);
      const hf = S.mesh(new T.PlaneGeometry(1, 1), M2.flare, { p: [300, 90, 100], s: [260, 120, 1] }); truck.add(hf);
      truck.userData.noMerge = true; truck.position.set(-3000, 0, -4200); root.add(truck);
    }
    const plumeMat = fxMat(`uniform float time; uniform sampler2D tex; uniform vec3 col; varying vec2 vUv;
      void main(){
        float n = texture2D(tex, vec2(vUv.x * 1.6 + time * 0.08, vUv.y * 0.8 - time * 0.05)).r;
        float body = smoothstep(0.0, 0.25, vUv.x) * pow(vUv.x, 1.5) * smoothstep(1.0, 0.92, vUv.x);
        float hgt = smoothstep(0.0, 0.1, vUv.y) * (1.0 - smoothstep(0.15 + 0.6 * (1.0 - vUv.x), 0.95, vUv.y));
        gl_FragColor = vec4(col, smoothstep(0.25, 0.8, n) * body * hgt * 0.75);
      }`, { col: { value: lin(0xd8a07a) } }, -2.85);
    const plume = S.mesh(new T.PlaneGeometry(1500, 380), plumeMat, { p: [-1000, 180, -4230] });
    plume.renderOrder = -2.85; plume.userData.noMerge = true; plume.frustumCulled = false; root.add(plume);

    // drone d'observation
    const drone = S.group(), rotors = [];
    const ledR = S.glow(0xff2a20, 5), ledG = S.glow(0x30ff60, 5), ledW = S.glow(0xffffff, 5);
    {
      const dk = S.mat({ color: 0x1c1d22, roughness: 0.35, metalness: 0.5, envMapIntensity: 0.9 });
      const dg = S.group();
      S.add(dg, g.rbox(36, 12, 30, 4), dk, {}); S.add(dg, g.sphere(7, 10, 8), S.mat({ color: 0x050505, roughness: 0.05, metalness: 0.9 }), { p: [14, -9, 0] });
      for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { S.add(dg, g.box(46, 3, 4), dk, { p: [x * 20, 2, z * 20], r: [0, x * z * Math.PI / 4, 0] }); S.add(dg, g.cyl(3, 3, 8, 8), dk, { p: [x * 34, 5, z * 34] }); }
      for (const x of [-1, 1]) S.add(dg, g.box(2, 14, 30), dk, { p: [x * 12, -12, 0] });
      S.merge(dg); drone.add(dg);
      const blur = S.basic({ color: 0x2a2a30, transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide });
      for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const r = S.mesh(g.cyl(17, 17, 0.6, 16), blur, { p: [x * 34, 9, z * 34] }); drone.add(r); rotors.push(r); }
      drone.add(S.mesh(g.sphere(2.2, 6, 4), ledR, { p: [-34, 3, -34] })); drone.add(S.mesh(g.sphere(2.2, 6, 4), ledR, { p: [-34, 3, 34] }));
      drone.add(S.mesh(g.sphere(2.2, 6, 4), ledG, { p: [34, 3, -34] })); drone.add(S.mesh(g.sphere(2.2, 6, 4), ledG, { p: [34, 3, 34] }));
      drone.add(S.mesh(g.sphere(2.6, 6, 4), ledW, { p: [0, -4, 0] }));
      drone.scale.setScalar(0.8); drone.userData.noMerge = true; root.add(drone);
    }
    // vautours qui tournoient
    const birdGeo = mergeG([xf(g.box(70, 1.5, 16), [36, 6, 0], [0, 0, 0.18]), xf(g.box(70, 1.5, 16), [-36, 6, 0], [0, 0, -0.18]), xf(g.box(8, 6, 30), [0, 4, 0])]);
    const birds = new T.InstancedMesh(birdGeo, S.basic({ color: 0x1c1018 }), 3);
    birds.frustumCulled = false; birds.userData.noMerge = true; root.add(birds);

    // fusion du décor statique
    S.merge(stat); root.add(stat);

    /* =========================================================
       ANIMATION
       ========================================================= */
    const bM = new T.Matrix4(), bQ = new T.Quaternion(), bE = new T.Euler(), bP = new T.Vector3(), bS = new T.Vector3(1, 1, 1);
    const beaconBase = M2.beacon.color.clone(), lampBase = M2.lampFlick.color.clone(), ledRB = ledR.color.clone(), ledGB = ledG.color.clone(), ledWB = ledW.color.clone();
    const beamBase = M2.beamFlick.color.clone(), hangI = M.hangar.emissiveIntensity;
    function update(t) {
      timeU.value = t; skyU.time.value = t; sockU.value = t;
      // balises rouges : clignotement lent
      const bl = (t % 1.6) < 0.18 ? 1 : 0.06; M2.beacon.color.copy(beaconBase).multiplyScalar(bl);
      // projecteur droit qui « chauffe » : grésillements périodiques
      const cyc = t % 17, fl = cyc < 2.2 ? ((Math.sin(t * 61) > 0.2 ? 1 : 0.15) * (0.4 + 0.6 * cyc / 2.2)) : 1;
      M2.lampFlick.color.copy(lampBase).multiplyScalar(fl); M2.beamFlick.color.copy(beamBase).multiplyScalar(fl); spot.intensity = 1.25 * fl;
      // atelier du hangar : éclairs de soudure
      const w = Math.sin(t * 37) * Math.sin(t * 23.3) > 0.55 && (t % 6) < 3 ? 1.5 : 1;
      M.hangar.emissiveIntensity = hangI * w;
      // radar
      radar.rotation.y = t * 1.4;
      // manche à air (orientation qui oscille avec le vent)
      sock.rotation.set(0, 0.25 + Math.sin(t * 0.7) * 0.2 + Math.sin(t * 2.3) * 0.05, -0.08 + Math.sin(t * 1.9) * 0.05);
      // tourbillon de poussière : dérive lente
      devil.position.x = -1700 + Math.sin(t * 0.05) * 500; devil.rotation.z = Math.sin(t * 0.3) * 0.06;
      // pick-up : traverse la piste toutes les 46 s (gauche → droite)
      const tc = (t + 12) % 46, tx = -3200 + tc * 160;
      truck.position.set(tx, Math.sin(t * 9) * 1.5, -4200 + Math.sin(tx * 0.0007) * 30);
      plume.position.set(tx - 950, 180, truck.position.z - 30);
      plume.visible = truck.visible = tc < 44;
      // drone : vol stationnaire avec dérive
      drone.position.set(980 + Math.sin(t * 0.23) * 170, 330 + Math.sin(t * 1.3) * 8 + Math.sin(t * 0.37) * 18, -520 + Math.sin(t * 0.17) * 90);
      drone.rotation.set(Math.sin(t * 0.9) * 0.05, -0.6 + Math.sin(t * 0.2) * 0.4, Math.cos(t * 0.23) * 0.08);
      for (let i = 0; i < 4; i++) rotors[i].rotation.y = t * 40 + i;
      const lb = (t % 1) < 0.1 ? 1 : 0.15; ledR.color.copy(ledRB).multiplyScalar(lb); ledG.color.copy(ledGB).multiplyScalar(lb); ledW.color.copy(ledWB).multiplyScalar((t % 1.3) < 0.06 ? 1.2 : 0.05);
      // vautours
      for (let i = 0; i < 3; i++) {
        const a = t * 0.18 + i * 2.1, r = 260 + i * 70;
        bP.set(-300 + Math.cos(a) * r, 760 + i * 40 + Math.sin(a * 2) * 20, -2900 + Math.sin(a) * r * 0.5);
        bE.set(0, -a, 0.3); bQ.setFromEuler(bE); const fp = 1 + Math.sin(t * 2 + i) * 0.08; bS.set(1, fp, 1);
        bM.compose(bP, bQ, bS); birds.setMatrixAt(i, bM);
      }
      birds.instanceMatrix.needsUpdate = true;
    }
    return { root, update };
  }

  return { light, track, build };
})();
