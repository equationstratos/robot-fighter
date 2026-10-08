'use strict';
/* =========================================================
   Arène 3D : PAS DE TIR — complexe de lancement au bord de l'océan, à l'aube
   (arène « à domicile » d'Apptronik Apollo, héritage NASA). Contrat : voir js/arenas.js.
   Plans : dalle de béton mouillée (joints, marquages jaunes/noirs, caillebotis, reflets des projecteurs)
     → tranchée du déluge (vapeur, liseré lumineux) → conduites d'ergols qui filent vers la fusée, mâts
     d'éclairage, compte à rebours, sphères d'hydrogène / d'oxygène → fusée blanche à bandes noires sur sa
     table de lancement, tour ombilicale orange à bras articulés → océan, pas de tir jumeau, phare
     → ciel d'aube bleu profond → orange, soleil levant, nuages.
   Vie : dégazage d'oxygène liquide (panaches animés), vapeur de la tranchée, brume côtière, faisceaux
     des projecteurs xénon, scintillement du soleil sur l'océan et sur le béton mouillé, compte à rebours,
     feux d'obstacle clignotants, faisceau du phare, mouettes, véhicule de sécurité.
   Placement « à l'écran » : WX(sx, d) donne le x monde d'un objet vu en sx (0..960) dans la vue centrale
   à la profondeur d (distance à la caméra) — la composition est pensée en pixels.
   ========================================================= */
ARENA3D.launchpad = (function () {
  const D = Math.PI / 180;
  const CX = 650, CZ = 689, FP = 1171;                     // caméra de combat (centre) ; focale en pixels (écran 960×540)
  const WX = (sx, d) => CX + (sx - 480) * d / FP, WZ = d => CZ - d;
  const SUN_AZ = 12.5 * D, SUN_EL = 4.3 * D;               // soleil levant, un peu à droite, au-dessus de l'océan
  const SUN = [Math.sin(SUN_AZ) * Math.cos(SUN_EL), Math.sin(SUN_EL), -Math.cos(SUN_AZ) * Math.cos(SUN_EL)];
  // fusée (plan moyen gauche) : base du 1er étage YB, pont de la table de lancement YD
  const RD = 7000, RX = Math.round(WX(180, RD)), RZ = WZ(RD), R0 = 150, YD = 280, YB = 450, YT = 2650;
  const TW = 320, TX = RX - R0 - 420 - TW / 2, TZ = RZ;   // tour ombilicale
  const TR = { x0: -150, x1: 2200, z0: -1150, z1: -1750, d: 300 };   // tranchée du déluge
  const NR = { x0: -700, x1: 2000, z0: -1150, z1: 200 };             // texture fine du sol (zone de combat)
  const FR = { x0: -3000, x1: 4300, z0: -7000, z1: 900 };            // texture large du sol
  const MD = 3400, MZ = WZ(MD), MLX = Math.round(WX(55, MD)), MRX = Math.round(WX(845, MD)), MH = 560;   // mâts d'éclairage
  const COAST = -7000, SEA = -7700;

  const light = {
    hemi: [0x8ea2d6, 0x3a3238, 0.8],
    key: [0xe6ecff, 1.3], keyPos: [-420, 950, 640],
    rims: [[0xffa868, 2.1, [0.6, 0.12, -1]], [0x6688ff, 1.05, [-1, 0.45, -0.55]], [0xffe2c4, 0.25, [0, 1, 0.4]]],
    fog: { color: 0x8a86ae, near: 1800, far: 26000 },
    bg: 0x1c2550, refl: 0.3, dim: 0.72
  };

  // thème : fanfare héroïque en sol mixolydien (G – F – C – D), caisse claire « militaire »
  const DRL = { k: 'x...x...x...x...', s: '....x.......x.xx', h: 'x.x.x.x.x.x.x.x.' };
  const track = {
    bpm: 152, root: 43, prog: [0, -2, 5, 7],
    bass: [0, null, 12, 0, 0, null, 12, 0, 0, null, 12, 0, 7, null, 12, 7],
    lead: [7, null, 12, null, 14, 12, 7, null, 12, null, 16, null, 19, null, 16, 14,
      16, null, 14, 12, 14, null, 9, null, 7, null, 9, 12, 14, null, null, null,
      12, 14, 16, 19, 16, 14, 12, 11, 9, null, 11, null, 12, 11, 9, 7,
      12, null, 16, null, 19, null, 17, 16, 14, null, 12, null, 11, 7, 9, 11],
    drums: DRL
  };
  const FONT = "'Arial Black', 'Arial Bold', Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif";

  function build(S) {
    const T = S.T, g = S.g, Q = S.quality || 0;
    const BGU = T.BufferGeometryUtils;
    const root = S.group(), stat = S.group();
    const rnd = S.rng(3939);
    const lin = h => new T.Color(h);
    const timeU = { value: 0 };
    const _m4 = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();
    const _up = new T.Vector3(0, 1, 0), _dn = new T.Vector3(0, -1, 0), _d = new T.Vector3();

    /* =========================================================
       OUTILS
       ========================================================= */
    function xf(geo, p, r, s) {
      const gg = geo.index ? geo.toNonIndexed() : geo.clone();
      _m4.compose(_v.set(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0), _q.setFromEuler(_e.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0)),
        s == null ? _s.set(1, 1, 1) : typeof s === 'number' ? _s.set(s, s, s) : _s.set(s[0], s[1], s[2]));
      gg.applyMatrix4(_m4); return gg;
    }
    function clean(gg, col) {
      gg = gg.index ? gg.toNonIndexed() : gg;
      for (const n of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) gg.deleteAttribute(n);
      if (!gg.attributes.normal) gg.computeVertexNormals();
      if (!gg.attributes.uv) gg.setAttribute('uv', new T.BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
      if (col != null) {
        const c = lin(col), n = gg.attributes.position.count, a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
        gg.setAttribute('color', new T.BufferAttribute(a, 3));
      }
      return gg;
    }
    const mergeG = list => BGU.mergeGeometries(list.map(x => clean(x)), false);
    function uvRect(geo, u0, v0, u1, v1) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0)); uv.needsUpdate = true; return geo; }
    const add = (geo, mat, o, parent) => S.add(parent || stat, geo, mat, o || {});
    const box = (w, h, d, mat, p, r, parent) => add(g.box(w, h, d), mat, { p, r }, parent);
    // poutre / tuyau droit entre deux points
    function strut(a, b, t, mat, parent, round) {
      _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _d.length(); if (L < 1e-3) return null;
      const m = new T.Mesh(round ? g.cyl(t, t, 1, round) : g.box(t, 1, t), mat);
      m.scale.set(1, L, 1);
      m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      m.quaternion.setFromUnitVectors(_up, _d.normalize());
      (parent || stat).add(m); return m;
    }
    // tuile de bruit de valeur (répétable) : Float32Array 0..1
    function tileVN(size, cells, oct, seed) {
      const R = S.rng(seed), out = new Float32Array(size * size);
      let amp = 1;
      for (let o = 0; o < oct; o++) {
        const n = cells << o, lat = new Float32Array(n * n); for (let i = 0; i < n * n; i++) lat[i] = R();
        for (let y = 0; y < size; y++) {
          const fy = y / size * n, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty), y0 = (iy % n) * n, y1 = ((iy + 1) % n) * n;
          for (let x = 0; x < size; x++) {
            const fx = x / size * n, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx), x0 = ix % n, x1 = (ix + 1) % n;
            const a = lat[y0 + x0], b = lat[y0 + x1], c = lat[y1 + x0], d = lat[y1 + x1];
            out[y * size + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
          }
        }
        amp *= 0.5;
      }
      let mn = 1e9, mx = -1e9; for (let i = 0; i < out.length; i++) { if (out[i] < mn) mn = out[i]; if (out[i] > mx) mx = out[i]; }
      for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) / (mx - mn);
      return out;
    }
    const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
    function rg(c, x, y, r, rgb, a, sx = 1, sy = 1) {
      c.save(); c.translate(x, y); c.scale(sx, sy);
      const gr = c.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, css(rgb, a)); gr.addColorStop(1, css(rgb, 0));
      c.fillStyle = gr; c.fillRect(-r, -r, 2 * r, 2 * r); c.restore();
    }
    function txt(c, s, x, y, wpx, hpx, col, weight = 900, font = FONT) {
      c.save(); c.font = `${weight} 100px ${font}`; const m = Math.max(1, c.measureText(s).width);
      c.translate(x, y); c.scale(wpx / m, hpx / 100); c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, 0, 0); c.restore();
    }

    /* =========================================================
       TEXTURES PROCÉDURALES
       ========================================================= */
    // bruit RVB (3 fréquences) pour nuages, vapeur, vagues, ondulations
    const noiseTex = S.canvasTex(256, 256, (c, w, h) => {
      const r = tileVN(w, 4, 5, 11), gg = tileVN(w, 8, 4, 12), b = tileVN(w, 16, 3, 13), im = c.createImageData(w, h), d = im.data;
      for (let i = 0; i < w * h; i++) { d[i * 4] = r[i] * 255; d[i * 4 + 1] = gg[i] * 255; d[i * 4 + 2] = b[i] * 255; d[i * 4 + 3] = 255; }
      c.putImageData(im, 0, 0);
    }, { srgb: false, repeat: [1, 1], aniso: 1 });
    // grain du béton (répété), moyenne 0.5
    const detTex = S.canvasTex(512, 512, (c, w, h) => {
      const R = S.rng(21), n1 = tileVN(w, 16, 4, 31), n2 = tileVN(w, 64, 3, 32), im = c.createImageData(w, h), d = im.data;
      for (let i = 0; i < w * h; i++) { const v = 128 + (n1[i] - 0.5) * 46 + (n2[i] - 0.5) * 34 + (R() - 0.5) * 30; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
      c.putImageData(im, 0, 0);
      for (let i = 0; i < 2600; i++) { c.fillStyle = R() < 0.6 ? 'rgba(55,55,55,0.45)' : 'rgba(205,205,205,0.3)'; c.beginPath(); c.arc(R() * w, R() * h, 0.5 + R() * 1.5, 0, 7); c.fill(); }
      c.strokeStyle = 'rgba(35,35,35,0.4)'; c.lineWidth = 0.8;
      for (let k = 0; k < 6; k++) { let x = 40 + R() * (w - 80), y = 40 + R() * (h - 80), a = R() * 6.28; c.beginPath(); c.moveTo(x, y); for (let s = 0; s < 30; s++) { a += (R() - 0.5) * 0.9; x += Math.cos(a) * 3; y += Math.sin(a) * 3; c.lineTo(x, y); } c.stroke(); }
    }, { srgb: false, repeat: [1, 1], aniso: 8 });
    // rayures de danger jaune / noir
    const hazTex = S.canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#e2a614'; c.fillRect(0, 0, w, h); c.fillStyle = '#141414';
      for (let i = -2; i < 4; i++) { c.beginPath(); c.moveTo(i * 64, 0); c.lineTo(i * 64 + 32, 0); c.lineTo(i * 64 + 32 + h, h); c.lineTo(i * 64 + h, h); c.closePath(); c.fill(); }
      const R = S.rng(5); for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(60,50,40,${R() * 0.25})`; c.fillRect(R() * w, R() * h, 1 + R() * 4, 1 + R() * 3); }
    }, { repeat: [1, 1] });

    // ---- sol fin (zone de combat) : dalles, joints, caillebotis, marquages, taches ----
    const NW = NR.x1 - NR.x0, NH = NR.z1 - NR.z0;
    const nearTex = S.canvasTex(2048, 1024, (c, w, h) => {
      const kx = w / NW, kz = h / NH, X = x => (x - NR.x0) * kx, Z = z => (z - NR.z0) * kz, R = S.rng(77);
      c.fillStyle = '#8b8984'; c.fillRect(0, 0, w, h);
      const jx = [], jz = [];
      for (let x = 50 - 800; x <= NR.x1 + 400; x += 400) jx.push(x);
      for (let z = 230; z >= NR.z0 - 330; z -= 330) jz.push(z);
      for (let i = 0; i < jx.length - 1; i++) for (let j = 0; j < jz.length - 1; j++) {
        const v = (R() - 0.5) * 16, x0 = X(jx[i]), x1 = X(jx[i + 1]), z0 = Z(jz[j + 1]), z1 = Z(jz[j]);
        c.fillStyle = `rgb(${139 + v | 0},${137 + v | 0},${132 + v | 0})`; c.fillRect(x0, z0, x1 - x0, z1 - z0);
        for (let k = 0; k < 4; k++) rg(c, x0 + R() * (x1 - x0), z0 + R() * (z1 - z0), 30 + R() * 90, [70, 66, 60], 0.06 + R() * 0.1, 1.5, 0.7);
        // bord de dalle légèrement plus sombre (usure)
        c.strokeStyle = 'rgba(70,68,64,0.25)'; c.lineWidth = 6; c.strokeRect(x0 + 3, z0 + 3, x1 - x0 - 6, z1 - z0 - 6);
      }
      // suie vers la tranchée
      const gS = c.createLinearGradient(0, Z(-1150), 0, Z(-700)); gS.addColorStop(0, 'rgba(30,28,26,0.55)'); gS.addColorStop(1, 'rgba(30,28,26,0)');
      c.fillStyle = gS; c.fillRect(0, 0, w, Z(-700));
      // traces de pneus
      c.strokeStyle = 'rgba(35,33,30,0.22)'; c.lineWidth = 9;
      for (const [ox, oz, ex, ez] of [[-700, -250, 900, -900], [-650, -330, 950, -980], [1300, 200, 2000, -700], [1240, 200, 1950, -760]]) {
        c.beginPath(); c.moveTo(X(ox), Z(oz)); c.bezierCurveTo(X(ox + 500), Z(oz - 50), X(ex - 400), Z(ez + 300), X(ex), Z(ez)); c.stroke();
      }
      // joints
      for (const x of jx) { c.fillStyle = 'rgba(36,35,33,0.9)'; c.fillRect(X(x) - 2.5, 0, 5, h); c.fillStyle = 'rgba(190,188,182,0.25)'; c.fillRect(X(x) + 2.5, 0, 2, h); }
      for (const z of jz) { c.fillStyle = 'rgba(36,35,33,0.9)'; c.fillRect(0, Z(z) - 2.5, w, 5); c.fillStyle = 'rgba(190,188,182,0.25)'; c.fillRect(0, Z(z) + 2.5, w, 2); }
      // caillebotis (caniveau) le long de x
      const gz0 = Z(-445), gz1 = Z(-365);
      c.fillStyle = '#26282b'; c.fillRect(0, gz0, w, gz1 - gz0);
      c.fillStyle = 'rgba(120,124,130,0.55)';
      for (let x = 0; x < w; x += 4.5) c.fillRect(x, gz0, 1.2, gz1 - gz0);
      for (let z = gz0; z < gz1; z += 9) c.fillRect(0, z, w, 1);
      c.fillStyle = '#4a4e54'; c.fillRect(0, gz0 - 4, w, 5); c.fillRect(0, gz1 - 1, w, 5);
      for (let x = X(-650); x < w; x += 300 * kx) { c.fillStyle = '#3c4046'; c.fillRect(x - 3, gz0, 6, gz1 - gz0); }
      for (let i = 0; i < 26; i++) rg(c, R() * w, gz0 + R() * (gz1 - gz0), 20 + R() * 40, [120, 70, 35], 0.25, 1.8, 0.7);   // rouille
      // double ligne jaune (limite de sécurité)
      for (const z of [-930, -968]) {
        c.fillStyle = '#d6a21c'; c.fillRect(0, Z(z) - 7, w, 14);
        for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(110,100,85,${0.3 + R() * 0.5})`; c.fillRect(R() * w, Z(z) - 7, 6 + R() * 40, 14); }
      }
      // bord de tranchée : bande de danger
      const hz0 = Z(-1150), hz1 = Z(-1085);
      c.save(); c.beginPath(); c.rect(0, hz0, w, hz1 - hz0); c.clip();
      c.fillStyle = '#d9a417'; c.fillRect(0, hz0, w, hz1 - hz0); c.fillStyle = '#151515';
      for (let x = -100; x < w + 100; x += 44) { c.beginPath(); c.moveTo(x, hz0); c.lineTo(x + 22, hz0); c.lineTo(x + 22 + 50, hz1); c.lineTo(x + 50, hz1); c.closePath(); c.fill(); }
      for (let i = 0; i < 200; i++) { c.fillStyle = `rgba(60,55,45,${R() * 0.45})`; c.fillRect(R() * w, hz0 + R() * (hz1 - hz0), 3 + R() * 20, 2 + R() * 6); }
      c.restore();
      // cible peinte (usée) au centre de l'aire de combat + « 39A »
      c.save(); c.translate(X(650), Z(-420)); c.scale(1, 0.62);
      c.strokeStyle = 'rgba(214,162,30,0.42)'; c.lineWidth = 15; c.beginPath(); c.arc(0, 0, 360 * kx, 0, 7); c.stroke();
      c.lineWidth = 5; c.beginPath(); c.arc(0, 0, 320 * kx, 0, 7); c.stroke();
      c.restore();
      txt(c, '39A', X(650), Z(-740), 280 * kx, 300 * kz, 'rgba(230,228,220,0.32)');
      // plaques d'ancrage
      for (const x of jx) for (const z of jz) if (R() < 0.45) {
        const px = X(x), pz = Z(z);
        c.fillStyle = '#45474b'; c.beginPath(); c.arc(px, pz, 14, 0, 7); c.fill();
        c.fillStyle = '#6d7076'; c.beginPath(); c.arc(px, pz, 9, 0, 7); c.fill();
        rg(c, px + 6, pz + 10, 26, [125, 72, 36], 0.3, 0.7, 1.6);
      }
      // marquages latéraux (visibles aux bords)
      txt(c, 'ZONE 2', X(-420), Z(-640), 260 * kx, 330 * kz, 'rgba(230,228,220,0.5)');
      for (let i = 0; i < 4; i++) { const x = X(1650), z = Z(-250 - i * 170); c.fillStyle = 'rgba(214,162,30,0.6)'; c.beginPath(); c.moveTo(x - 60, z + 30); c.lineTo(x, z - 30); c.lineTo(x + 60, z + 30); c.lineTo(x + 40, z + 30); c.lineTo(x, z - 5); c.lineTo(x - 40, z + 30); c.closePath(); c.fill(); }
      // fissures fines + taches d'huile
      c.strokeStyle = 'rgba(30,30,30,0.35)'; c.lineWidth = 1.4;
      for (let k = 0; k < 40; k++) { let x = R() * w, y = R() * h, a = R() * 6.28; c.beginPath(); c.moveTo(x, y); for (let s = 0; s < 18; s++) { a += (R() - 0.5) * 0.8; x += Math.cos(a) * 7; y += Math.sin(a) * 7; c.lineTo(x, y); } c.stroke(); }
      for (let i = 0; i < 30; i++) rg(c, R() * w, R() * h, 10 + R() * 30, [25, 24, 26], 0.35, 1.4, 0.8);
    }, { aniso: 8 });
    // humidité (flaques) sur la zone fine
    const wetTex = S.canvasTex(1024, 512, (c, w, h) => {
      const kx = w / NW, kz = h / NH, X = x => (x - NR.x0) * kx, Z = z => (z - NR.z0) * kz, R = S.rng(91);
      c.fillStyle = 'rgb(85,85,85)'; c.fillRect(0, 0, w, h);
      const pud = (x, z, r, a, sx = 2.2) => { for (let k = 0; k < 5; k++) rg(c, X(x) + (R() - 0.5) * r * kx, Z(z) + (R() - 0.5) * r * 0.5 * kz, r * kx * (0.5 + R() * 0.5), [255, 255, 255], a, sx, 1); };
      for (let x = -700; x < 2000; x += 120) pud(x + R() * 60, -405, 90, 0.55);           // le long du caniveau
      for (let x = -700; x < 2000; x += 160) pud(x + R() * 80, -1080, 110, 0.5);          // bord de tranchée
      for (let i = 0; i < 26; i++) pud(-700 + R() * 2700, -1000 + R() * 1150, 60 + R() * 150, 0.5 + R() * 0.4);
      pud(250, -180, 200, 0.9); pud(1080, -250, 230, 0.85); pud(650, -620, 260, 0.75); pud(1500, -700, 200, 0.9); pud(-250, -700, 220, 0.9);
    }, { srgb: false });
    // ---- sol large : tablier, routes, chemin de roulement, herbe, aire de la table de lancement ----
    const farTex = S.canvasTex(1024, 1024, (c, w, h) => {
      const kx = w / (FR.x1 - FR.x0), kz = h / (FR.z1 - FR.z0), X = x => (x - FR.x0) * kx, Z = z => (z - FR.z0) * kz, R = S.rng(55);
      c.fillStyle = '#353c37'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) rg(c, R() * w, R() * h, 4 + R() * 14, R() < 0.5 ? [30, 40, 32] : [70, 72, 58], 0.4);
      // tablier de béton
      c.fillStyle = '#8a8882'; c.fillRect(X(-2650), Z(-5100), X(3400) - X(-2650), h);
      c.fillStyle = '#8e8b85'; c.fillRect(X(-2800), Z(-7000), X(-150) - X(-2800), Z(-5100) - Z(-7000));
      c.strokeStyle = 'rgba(40,40,40,0.5)'; c.lineWidth = 1;
      for (let x = -2650; x < 3400; x += 400) { c.beginPath(); c.moveTo(X(x), Z(-7000)); c.lineTo(X(x), h); c.stroke(); }
      for (let z = -7000; z < 900; z += 330) { c.beginPath(); c.moveTo(X(-2800), Z(z)); c.lineTo(X(3400), Z(z)); c.stroke(); }
      for (let i = 0; i < 160; i++) rg(c, X(-2600 + R() * 6000), Z(-6800 + R() * 7600), 6 + R() * 22, [60, 58, 54], 0.2, 1.8, 0.6);
      // route périphérique
      c.fillStyle = '#3b3c3f'; c.fillRect(0, Z(-5260), w, Z(-5090) - Z(-5260));
      c.fillStyle = 'rgba(220,200,120,0.7)'; for (let x = 0; x < w; x += 9) c.fillRect(x, Z(-5175) - 0.6, 5, 1.2);
      // chemin de roulement (gravier) : deux voies qui filent vers la table de lancement
      c.fillStyle = '#9a9283';
      for (const off of [-170, 170]) { c.beginPath(); c.moveTo(X(RX - 300 + off - 110), Z(RZ + 650)); c.lineTo(X(RX - 300 + off + 110), Z(RZ + 650)); c.lineTo(X(-700 + off + 110), Z(-1800)); c.lineTo(X(-700 + off - 110), Z(-1800)); c.closePath(); c.fill(); }
      // tranchée des flammes devant la table : ouverture sombre + bords de sécurité
      c.fillStyle = '#d6a21c'; c.fillRect(X(RX - 230), Z(RZ + 1350), X(RX + 230) - X(RX - 230), Z(RZ + 680) - Z(RZ + 1350));
      c.fillStyle = '#121214'; c.fillRect(X(RX - 200), Z(RZ + 1330), X(RX + 200) - X(RX - 200), Z(RZ + 680) - Z(RZ + 1330));
      rg(c, X(RX), Z(RZ + 1500), 120, [25, 23, 22], 0.6, 1.6, 1);
      // lignes jaunes du tablier
      c.fillStyle = 'rgba(214,162,30,0.7)';
      c.fillRect(X(-2650), Z(-5050), X(3400) - X(-2650), 2); c.fillRect(X(-2650), Z(-1900), X(3400) - X(-2650), 2);
    }, { aniso: 8 });

    // ---- fusée : 1er étage S-IC (motif de roulis noir/blanc, « USA », drapeau), inter-étage, 2e étage ----
    const rocketTex = S.canvasTex(1024, 2048, (c, w, h) => {
      const PY = y => (YT - y) / (YT - YB) * h, R = S.rng(8), W8 = w / 8;
      c.fillStyle = '#eef0f2'; c.fillRect(0, 0, w, h);
      // panneaux discrets
      c.fillStyle = 'rgba(120,128,140,0.12)';
      for (let i = 0; i < 64; i++) c.fillRect(i * w / 64, 0, 1.5, h);
      for (let y = YB; y < YT; y += 55) c.fillRect(0, PY(y), w, 1.5);
      const band = (y0, y1, off) => { c.fillStyle = '#111214'; for (let i = 0; i < 8; i++) if ((i + off) % 2 === 0) c.fillRect(i * W8, PY(y1), W8, PY(y0) - PY(y1)); };
      c.fillStyle = '#1a1b1d'; c.fillRect(0, PY(475), w, PY(YB) - PY(475));
      band(475, 660, 0);
      band(1050, 1175, 1);
      c.fillStyle = '#111214'; c.fillRect(0, PY(1698), w, PY(1615) - PY(1698));
      c.fillStyle = '#eef0f2'; for (let i = 0; i < 8; i++) if (i % 2) c.fillRect(i * W8 + W8 * 0.35, PY(1698), W8 * 0.3, PY(1615) - PY(1698));
      band(1745, 1861, 0);
      c.fillStyle = '#111214'; c.fillRect(0, PY(YT), w, PY(2530) - PY(YT));
      // « USA » vertical et drapeau, centrés côté caméra (u ≈ 0.04)
      const uc = 0.04 * w, lw = 80 / (2 * Math.PI * R0) * w, lh = (YT - YB) > 0 ? 92 / (YT - YB) * h : 0;
      for (const dx of [0, w]) {
        ['U', 'S', 'A'].forEach((L, i) => txt(c, L, uc + dx, PY(1000 - i * 108), lw, lh, '#101114'));
        // drapeau
        const fx = uc + dx - 70 / (2 * Math.PI * R0) * w, fw = 140 / (2 * Math.PI * R0) * w, fy = PY(1560), fh = PY(1470) - PY(1560);
        for (let s = 0; s < 13; s++) { c.fillStyle = s % 2 ? '#f2f2f2' : '#b3192e'; c.fillRect(fx, fy + s * fh / 13, fw, fh / 13 + 0.5); }
        c.fillStyle = '#1d2a66'; c.fillRect(fx, fy, fw * 0.42, fh * 7 / 13);
        c.fillStyle = '#f2f2f2'; for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) c.fillRect(fx + 4 + i * fw * 0.08, fy + 4 + j * fh * 0.12, 2, 2);
      }
      // salissures (givre et coulures)
      for (let i = 0; i < 70; i++) { const x = R() * w, y = PY(YB + 40 + R() * 1200); c.fillStyle = `rgba(150,140,130,${R() * 0.08})`; c.fillRect(x, y, 1 + R() * 3, 20 + R() * 120); }
    }, { aniso: 8 });

    // ---- panneaux (atlas 1024×512) ----
    const signTex = S.canvasTex(1024, 512, (c) => {
      // [0] DANGER — oxygène liquide
      c.fillStyle = '#f1f1ee'; c.fillRect(0, 0, 512, 256); c.fillStyle = '#c3161c'; c.fillRect(0, 0, 512, 92);
      c.fillStyle = '#111'; c.fillRect(0, 0, 512, 6); c.fillRect(0, 250, 512, 6); c.fillRect(0, 0, 6, 256); c.fillRect(506, 0, 6, 256);
      txt(c, 'DANGER', 256, 48, 300, 62, '#ffffff'); txt(c, 'OXYGÈNE LIQUIDE', 256, 140, 440, 48, '#111111'); txt(c, 'ZONE DE LANCEMENT', 256, 205, 400, 36, '#111111', 700);
      // [1] PAS DE TIR 39A
      c.fillStyle = '#16264f'; c.fillRect(512, 0, 512, 256); c.strokeStyle = '#e8e8e8'; c.lineWidth = 6; c.strokeRect(524, 12, 488, 232);
      txt(c, 'PAS DE TIR', 768, 80, 380, 60, '#ffffff'); txt(c, '39A', 768, 175, 220, 110, '#f2b632');
      // [2] losange de danger
      c.save(); c.translate(128, 384); c.rotate(Math.PI / 4); c.fillStyle = '#e2a614'; c.fillRect(-80, -80, 160, 160); c.lineWidth = 8; c.strokeStyle = '#111'; c.strokeRect(-72, -72, 144, 144); c.restore();
      txt(c, '!', 128, 384, 30, 100, '#111');
      // [3] sens interdit
      c.fillStyle = '#c3161c'; c.beginPath(); c.arc(384, 384, 110, 0, 7); c.fill(); c.fillStyle = '#fff'; c.fillRect(304, 366, 160, 36);
      // [4] KENNEDY-like : « COMPLEXE 39 » bandeau
      c.fillStyle = '#e9e9e4'; c.fillRect(512, 256, 512, 256); c.fillStyle = '#16264f'; c.fillRect(512, 256, 512, 70);
      txt(c, 'COMPLEXE DE LANCEMENT', 768, 291, 440, 40, '#ffffff'); txt(c, '39', 768, 410, 200, 150, '#16264f');
    });
    const SIGN = { danger: [0, 0.5, 0.5, 1], pad: [0.5, 0.5, 1, 1], diamond: [0, 0, 0.25, 0.5], noentry: [0.25, 0, 0.5, 0.5], complex: [0.5, 0, 1, 0.5] };
    const signPlane = (key, w, h) => uvRect(new T.PlaneGeometry(w, h), ...SIGN[key]);

    /* =========================================================
       MATÉRIAUX
       ========================================================= */
    // béton en projection triplanaire (UV inutiles après fusion)
    function triplanar(mat, tex, scale, key) {
      mat.onBeforeCompile = sh => {
        sh.uniforms.tTri = { value: tex };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW; varying vec3 vTN;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTN = normalize(mat3(modelMatrix) * objectNormal);');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW; varying vec3 vTN; uniform sampler2D tTri;')
          .replace('#include <map_fragment>', `#include <map_fragment>
            vec3 bw = pow(abs(normalize(vTN)), vec3(4.0)); bw /= dot(bw, vec3(1.0));
            float tri = texture2D(tTri, vTW.zy * ${scale}).r * bw.x + texture2D(tTri, vTW.xz * ${scale}).r * bw.y + texture2D(tTri, vTW.xy * ${scale}).r * bw.z;
            float tri2 = texture2D(tTri, vTW.xy * ${scale * 0.21} + 0.3).g;
            diffuseColor.rgb *= (0.55 + 0.9 * tri) * (0.8 + 0.4 * tri2);`);
      };
      mat.customProgramCacheKey = () => 'lpTri' + key;
      return mat;
    }
    const M = {
      concrete: triplanar(S.mat({ color: 0x9a9893, roughness: 0.88, envMapIntensity: 0.35 }), detTex, 0.006, 'c'),
      conDark: triplanar(S.mat({ color: 0x4a4b4e, roughness: 0.9, envMapIntensity: 0.25 }), detTex, 0.006, 'd'),
      steel: S.mat({ color: 0x3c424b, roughness: 0.48, metalness: 0.6, envMapIntensity: 0.7 }),
      galv: S.mat({ color: 0x8c939b, roughness: 0.38, metalness: 0.75, envMapIntensity: 0.8 }),
      white: S.mat({ color: 0xd9dde3, roughness: 0.42, envMapIntensity: 0.55 }),
      orange: S.mat({ color: 0xb4431c, roughness: 0.55, metalness: 0.25, envMapIntensity: 0.5 }),
      yellow: S.mat({ color: 0xd9a114, roughness: 0.5, envMapIntensity: 0.4 }),
      black: S.mat({ color: 0x141518, roughness: 0.6, envMapIntensity: 0.3 }),
      haz: S.mat({ map: hazTex, roughness: 0.55, envMapIntensity: 0.35 }),
      engine: S.mat({ color: 0x2c2e33, roughness: 0.32, metalness: 0.85, envMapIntensity: 0.9 }),
      ml: triplanar(S.mat({ color: 0x5f6670, roughness: 0.62, metalness: 0.35, envMapIntensity: 0.5 }), detTex, 0.01, 'm'),
      sand: S.mat({ color: 0xa89884, roughness: 0.95, envMapIntensity: 0.2 }),
      scrub: S.mat({ color: 0x2c332d, roughness: 0.95, envMapIntensity: 0.15 }),
      sign: S.mat({ map: signTex, roughness: 0.5, envMapIntensity: 0.4 }),
      glass: S.mat({ color: 0x0c1016, roughness: 0.1, metalness: 0.8, envMapIntensity: 1.0 }),
      lamp: S.glow(0xe8f0ff, 6),
      lampWarm: S.glow(0xffbf73, 4),
      strip: S.glow(0x6fb6ff, 2.2),
      window: S.glow(0xffc887, 1.6),
      red: S.glow(0xff2a1a, 2.5)
    };
    // la fusée, éclairée par les projecteurs xénon depuis le sol (émission qui décroît avec la hauteur)
    const rocketMat = S.mat({ map: rocketTex, roughness: 0.45, envMapIntensity: 0.6 });
    const upLight = mat => {
      mat.onBeforeCompile = sh => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vUW; varying vec3 vUN;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvUW = (modelMatrix * vec4(transformed, 1.0)).xyz; vUN = normalize(mat3(modelMatrix) * objectNormal);');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vUW; varying vec3 vUN;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            float upk = (1.0 - smoothstep(${YD.toFixed(1)}, ${(YD + 1500).toFixed(1)}, vUW.y)) * (0.45 + 0.55 * max(dot(vUN, normalize(vec3(0.25, 0.0, 1.0))), 0.0));
            totalEmissiveRadiance += diffuseColor.rgb * vec3(0.42, 0.46, 0.58) * upk;`);
      };
      mat.customProgramCacheKey = () => 'lpUp';
      return mat;
    };
    upLight(rocketMat);
    const rocketWhite = upLight(S.mat({ color: 0xe4e7ea, roughness: 0.45, envMapIntensity: 0.6 }));

    /* =========================================================
       CIEL D'AUBE + OCÉAN (dôme : au-dessus de l'horizon le ciel, en dessous l'océan)
       ========================================================= */
    const skyU = {
      time: timeU, tN: { value: noiseTex }, sunD: { value: new T.Vector3(SUN[0], SUN[1], SUN[2]) }, sunAz: { value: SUN_AZ },
      cZen: { value: lin(0x0b1435) }, cUp: { value: lin(0x1a2b62) }, cMid: { value: lin(0x45508c) },
      cLowC: { value: lin(0x9a7ea6) }, cLowW: { value: lin(0xe89a86) }, cHorC: { value: lin(0xc49aa8) }, cHorW: { value: lin(0xffc488) },
      cGlow: { value: new T.Color(1.0, 0.55, 0.25) }, cSun: { value: new T.Color(9.0, 6.2, 3.6) },
      cBankD: { value: lin(0x3b3658) }, cBankL: { value: lin(0xff9a6a) }, cCirD: { value: lin(0x6c5f8e) }, cCirL: { value: lin(0xffb59a) },
      cSea: { value: lin(0x1f2a48) }
    };
    {
      const sm = new T.ShaderMaterial({
        uniforms: skyU, side: T.BackSide, depthWrite: false, fog: false, toneMapped: false,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float time, sunAz; uniform sampler2D tN; uniform vec3 sunD, cZen, cUp, cMid, cLowC, cLowW, cHorC, cHorW, cGlow, cSun, cBankD, cBankL, cCirD, cCirL, cSea;
          varying vec3 vDir;
          vec3 skyBase(vec3 d){
            float e = degrees(asin(clamp(d.y, 0.0, 1.0)));
            vec2 hz = normalize(d.xz + vec2(1e-6, 0.0));
            float cAz = dot(hz, normalize(sunD.xz));
            float tw = pow(max(cAz, 0.0), 6.0);
            vec3 c = mix(mix(cHorC, cHorW, tw), mix(cLowC, cLowW, tw * 0.75), smoothstep(0.0, 2.6, e));
            c = mix(c, cMid, smoothstep(2.2, 8.0, e));
            c = mix(c, cUp, smoothstep(6.5, 16.0, e));
            c = mix(c, cZen, smoothstep(15.0, 60.0, e));
            float cs = max(dot(d, sunD), 0.0);
            c += cGlow * (pow(cs, 6.0) * 0.16 + pow(cs, 60.0) * 0.42 + pow(cs, 700.0) * 1.3);
            return c;
          }
          void main(){
            vec3 d = normalize(vDir);
            float az = atan(d.x, -d.z);
            vec3 c;
            if (d.y >= 0.0) {
              c = skyBase(d);
              float e = degrees(asin(d.y));
              float tw = exp(-pow((az - sunAz) / 0.35, 2.0));
              // cirrus étirés (allumés en rose / orange côté soleil)
              vec2 cu = vec2(az * 1.3 + time * 0.0012, e * 0.075);
              float n1 = texture2D(tN, cu).r, n2 = texture2D(tN, cu * vec2(3.1, 2.4) + vec2(time * 0.002, 0.31)).g;
              float nb = texture2D(tN, cu - vec2(0.0, 0.012)).r;
              float dens = smoothstep(0.5, 0.86, n1 * 0.78 + n2 * 0.35) * smoothstep(3.2, 5.5, e) * smoothstep(18.0, 11.0, e);
              float lit = clamp(0.35 + (n1 - nb) * 5.0, 0.0, 1.0);
              vec3 cc = mix(cCirD, cCirL, clamp(lit * 0.6 + tw * 0.7, 0.0, 1.0));
              c = mix(c, cc, dens * 0.75);
              // banc de nuages bas sur l'horizon (bord supérieur doré près du soleil)
              float top = 0.9 + 1.7 * texture2D(tN, vec2(az * 0.55 + time * 0.0006, 0.5)).g + 0.5 * texture2D(tN, vec2(az * 2.2, 0.2)).b;
              float bank = smoothstep(top + 0.18, top - 0.22, e) * smoothstep(0.05, 0.5, e);
              float rim = smoothstep(top - 0.5, top, e) * bank;
              vec3 bc = mix(cBankD, cBankL, rim * (0.25 + 0.95 * tw));
              c = mix(c, bc, bank * 0.92);
              // soleil (disque + traînée anamorphique)
              float cs = dot(d, sunD);
              c += cGlow * exp(-pow((d.y - sunD.y) * 260.0, 2.0)) * exp(-abs(az - sunAz) * 3.0) * 0.55;
              c = mix(c, cSun, smoothstep(0.999955, 0.999972, cs) * (1.0 - bank * 0.6));
              // Vénus
              vec3 ve = normalize(vec3(-0.16, 0.13, -1.0));
              c += vec3(1.6, 1.7, 2.0) * smoothstep(0.999994, 0.999999, dot(d, ve));
            } else {
              // océan : intersection avec le plan de la mer, vagues, reflet du ciel, chemin de scintillement
              float t = 148.0 / max(-d.y, 1e-5);
              vec2 p = d.xz * t;
              vec2 w1 = texture2D(tN, p * vec2(1.0 / 1500.0, 1.0 / 420.0) + vec2(time * 0.004, time * 0.012)).rg - 0.5;
              vec2 w2 = texture2D(tN, p * vec2(1.0 / 560.0, 1.0 / 160.0) + vec2(-time * 0.006, time * 0.018)).gb - 0.5;
              vec2 wv = (w1 + w2 * 0.6) * mix(1.0, 0.3, smoothstep(3000.0, 40000.0, t));
              vec3 r = normalize(vec3(d.x + wv.x * 0.03, max(-d.y + wv.y * 0.02 + 0.002, 0.0005), d.z));
              vec3 refl = skyBase(r);
              float fres = 0.55 + 0.45 * pow(1.0 - min(-d.y * 12.0, 1.0), 3.0);
              c = mix(cSea, refl * 0.92, fres);
              float dAz = az - sunAz;
              float path = exp(-dAz * dAz / (0.0009 + 0.25 * (-d.y)));
              float sp = texture2D(tN, p * vec2(1.0 / 110.0, 1.0 / 30.0) + vec2(time * 0.03, -time * 0.05)).b * 0.6 + texture2D(tN, p * vec2(1.0 / 47.0, 1.0 / 14.0) - vec2(time * 0.05, time * 0.02)).r * 0.5;
              c += cGlow * path * (0.25 + smoothstep(0.62, 0.92, sp) * 3.5) * 1.1;
              c = mix(c, cSea * 1.4, smoothstep(0.0, -0.0025, d.y) * 0.0);
            }
            gl_FragColor = vec4(c, 1.0);
          }`
      });
      const sky = S.mesh(new T.SphereGeometry(15000, 64, 40), sm, { p: [650, 148, 689] });
      sky.renderOrder = -10; sky.userData.noMerge = true; sky.frustumCulled = false; sky.userData.receiveShadow = false; root.add(sky);
    }

    /* =========================================================
       SOL : dalle mouillée (texture fine + large, flaques, reflets étirés des projecteurs et du soleil)
       ========================================================= */
    const LAMPS = [];   // [x, y, z, largeur, couleur, intensité]
    const floorMat = S.mat({ color: 0xffffff, roughness: 0.8, envMapIntensity: 1.0 });
    const floorU = {
      tDet: { value: detTex }, tNear: { value: nearTex }, tFar: { value: farTex }, tWet: { value: wetTex }, tN: { value: noiseTex }, time: timeU,
      nRect: { value: new T.Vector4(NR.x0, NR.z0, NR.x1, NR.z1) }, fRect: { value: new T.Vector4(FR.x0, FR.z0, FR.x1, FR.z1) },
      sunD: { value: new T.Vector3(SUN[0], SUN[1], SUN[2]) }, sunC: { value: new T.Color(2.2, 1.15, 0.5) },
      lampP: { value: [] }, lampC: { value: [] }
    };
    const NL = 8;
    floorMat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, floorU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec3 vFW; uniform sampler2D tDet, tNear, tFar, tWet, tN; uniform float time; uniform vec4 nRect, fRect;
          uniform vec3 sunD, sunC; uniform vec4 lampP[${NL}]; uniform vec3 lampC[${NL}];
          float fWet;`)
        .replace('#include <map_fragment>', `
          vec2 nuv = vec2((vFW.x - nRect.x) / (nRect.z - nRect.x), (nRect.w - vFW.z) / (nRect.w - nRect.y));
          vec2 fuv = vec2((vFW.x - fRect.x) / (fRect.z - fRect.x), (fRect.w - vFW.z) / (fRect.w - fRect.y));
          float bN = smoothstep(0.0, 0.03, min(nuv.x, 1.0 - nuv.x)) * smoothstep(0.0, 0.02, min(nuv.y, 1.0 - nuv.y));
          vec3 alb = mix(texture2D(tFar, fuv).rgb, texture2D(tNear, clamp(nuv, 0.0, 1.0)).rgb, bN);
          float det = texture2D(tDet, vFW.xz / 260.0).r, det2 = texture2D(tDet, vFW.xz / 1300.0 + 0.37).g;
          alb *= (0.7 + 0.6 * det) * (0.85 + 0.3 * det2);
          float wn = texture2D(tN, vFW.xz / 2600.0).r;
          float wetFar = 0.22 + 0.7 * smoothstep(0.42, 0.78, wn);
          fWet = mix(wetFar, texture2D(tWet, clamp(nuv, 0.0, 1.0)).r, bN);
          alb *= mix(1.0, 0.58, fWet);
          diffuseColor.rgb *= alb;`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.8, 0.1, smoothstep(0.3, 0.78, fWet));')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            vec3 ray = vFW - cameraPosition; float rz = max(-ray.z, 1.0); vec2 sv = ray.xy / rz;
            vec3 acc = vec3(0.0);
            for (int i = 0; i < ${NL}; i++) {
              vec4 L = lampP[i];
              vec3 m = vec3(L.x, -L.y, L.z) - cameraPosition; vec2 dd = sv - m.xy / max(-m.z, 1.0);
              float wx = L.w, wy = L.w * 16.0;
              float k = exp(-dd.x * dd.x / (wx * wx)) * exp(-max(-dd.y, 0.0) / wy - max(dd.y, 0.0) / (wy * 0.12));
              acc += lampC[i] * k * smoothstep(L.z - 60.0, L.z + 120.0, vFW.z);
            }
            vec3 ms = vec3(sunD.x, -sunD.y, sunD.z); vec2 ds = sv - ms.xy / -ms.z;
            acc += sunC * exp(-ds.x * ds.x / (0.016 * 0.016)) * exp(-max(-ds.y, 0.0) / 0.11 - max(ds.y, 0.0) / 0.01);
            float rip = texture2D(tN, vFW.xz / 140.0 + vec2(time * 0.012, time * 0.007)).g * 0.6 + texture2D(tN, vFW.xz / 60.0 - vec2(time * 0.02, 0.0)).b * 0.6;
            totalEmissiveRadiance += acc * (0.12 + 0.88 * smoothstep(0.3, 0.8, fWet)) * (0.35 + rip);
          }`);
    };
    floorMat.customProgramCacheKey = () => 'lpFloor';
    const floorG = S.group();
    const plane = (x0, x1, z0, z1, y = 0) => { const p = new T.PlaneGeometry(x1 - x0, z0 - z1); p.rotateX(-Math.PI / 2); p.translate((x0 + x1) / 2, y, (z0 + z1) / 2); return p; };
    floorG.add(new T.Mesh(mergeG([
      plane(FR.x0, FR.x1, FR.z1, TR.z0), plane(FR.x0, FR.x1, TR.z1, FR.z0),
      plane(FR.x0, TR.x0, TR.z0, TR.z1), plane(TR.x1, FR.x1, TR.z0, TR.z1)
    ]), floorMat));
    floorG.children[0].userData.noMerge = true;
    root.add(floorG);

    // tranchée du déluge : fond, parois, cornières, conduites, liseré lumineux
    {
      const tw = TR.x1 - TR.x0, td = TR.z0 - TR.z1, cx = (TR.x0 + TR.x1) / 2, cz = (TR.z0 + TR.z1) / 2;
      add(new T.PlaneGeometry(tw, td).rotateX(-Math.PI / 2), M.conDark, { p: [cx, -TR.d, cz] });
      add(new T.PlaneGeometry(tw, TR.d), M.concrete, { p: [cx, -TR.d / 2, TR.z1] });
      add(new T.PlaneGeometry(td, TR.d), M.concrete, { p: [TR.x0, -TR.d / 2, cz], r: [0, Math.PI / 2, 0] });
      add(new T.PlaneGeometry(td, TR.d), M.concrete, { p: [TR.x1, -TR.d / 2, cz], r: [0, -Math.PI / 2, 0] });
      add(new T.PlaneGeometry(tw, TR.d), M.conDark, { p: [cx, -TR.d / 2, TR.z0], r: [0, Math.PI, 0] });
      box(tw, 6, 8, M.galv, [cx, -3, TR.z1 + 4]); box(tw, 6, 8, M.galv, [cx, -3, TR.z0 - 4]);
      box(tw, 4, 3, M.strip, [cx, -26, TR.z1 + 2]);
      for (const [y, r] of [[-120, 34], [-205, 26]]) strut([TR.x0, y, TR.z1 + r + 8], [TR.x1, y, TR.z1 + r + 8], r, M.steel, null, 14);
      for (let x = TR.x0 + 100; x < TR.x1; x += 260) { box(14, 140, 40, M.steel, [x, -150, TR.z1 + 20]); box(12, 240, 4, M.galv, [x + 60, -150, TR.z1 + 2]); }
      // passerelle en caillebotis avec garde-corps jaune (côté droit)
      const bx = 1900;
      box(160, 8, td + 20, M.steel, [bx, -4, cz]);
      for (const s of [-1, 1]) {
        for (let z = TR.z1 - 10; z <= TR.z0 + 10; z += 150) box(6, 105, 6, M.yellow, [bx + s * 78, 52, z]);
        box(6, 6, td + 20, M.yellow, [bx + s * 78, 105, cz]); box(5, 5, td + 20, M.yellow, [bx + s * 78, 55, cz]);
      }
    }

    /* =========================================================
       FUSÉE (type Saturn V) + TABLE DE LANCEMENT + TOUR OMBILICALE
       ========================================================= */
    const ML = { x0: TX - TW / 2 - 120, x1: RX + 500, z0: RZ - 650, z1: RZ + 650 };
    {
      // corps : profil de révolution (UV v = hauteur pour la texture)
      const prof = [[0, YB - 2], [R0, YB], [R0, 1698], [R0 - 2, 1700], [R0, 1702], [R0, 2601], [98, 2773], [98, 3302], [97, 3329], [58, 3581], [58, 3804], [9, 3908], [0, 3912]];
      const body = new T.LatheGeometry(prof.map(p => new T.Vector2(p[0], p[1])), 48);
      body.rotateY(0);
      const pos = body.attributes.position, uv = body.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setY(i, Math.min(1, Math.max(0, (pos.getY(i) - YB) / (YT - YB))));
      // au-dessus de YT : matière blanche unie (géométrie séparée)
      const lower = new T.LatheGeometry([[0, YB - 2], [R0, YB], [R0, YT], [0, YT]].map(p => new T.Vector2(p[0], p[1])), 48);
      const lp = lower.attributes.position, lu = lower.attributes.uv;
      for (let i = 0; i < lp.count; i++) lu.setY(i, Math.min(1, Math.max(0, (lp.getY(i) - YB) / (YT - YB))));
      add(lower, rocketMat, { p: [RX, 0, RZ] });
      const upper = new T.LatheGeometry([[R0, YT], [R0, 2601], [98, 2773], [98, 3302], [97, 3329], [58, 3581], [58, 3804], [9, 3908], [0, 3912]].map(p => new T.Vector2(p[0], p[1])), 40);
      add(upper, rocketWhite, { p: [RX, 0, RZ] });
      body.dispose();
      add(g.cyl(R0 + 1, R0 + 1, 60, 48), M.black, { p: [RX, 2560, RZ] });
      add(g.cyl(99, 99, 70, 40), M.black, { p: [RX, 2808, RZ] });
      add(g.cyl(98.5, 98.5, 26, 40), M.black, { p: [RX, 3316, RZ] });
      add(g.cyl(58.5, 58.5, 220, 32), M.galv, { p: [RX, 3693, RZ] });
      // tour de sauvetage
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) strut([RX + a * 20, 3905, RZ + b * 20], [RX + a * 8, 4060, RZ + b * 8], 3, M.orange);
      add(g.cyl(12, 12, 170, 12), M.white, { p: [RX, 4140, RZ] }); add(g.cone(12, 70, 12), M.black, { p: [RX, 4260, RZ] });
      // ailerons + carénages moteurs (à 45°)
      const fin = g.prism([[0, 0], [115, 0], [115, 120], [0, 330]], 10, 1);
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + k * Math.PI / 2;
        add(fin, rocketWhite, { p: [RX + Math.sin(a) * R0, YB - 30, RZ + Math.cos(a) * R0], r: [0, a - Math.PI / 2, 0] });
        add(g.lathe([[52, 0], [44, 120], [22, 260], [0, 300]], 16), rocketWhite, { p: [RX + Math.sin(a) * (R0 - 18), YB - 20, RZ + Math.cos(a) * (R0 - 18)] });
      }
      // moteurs F-1
      const bell = g.lathe([[24, 165], [30, 120], [42, 60], [52, 0], [50, 0]], 20);
      add(bell, M.engine, { p: [RX, YD, RZ] });
      for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; add(bell, M.engine, { p: [RX + Math.sin(a) * 92, YD, RZ + Math.cos(a) * 92] }); }
      add(g.cyl(R0 - 4, R0 - 4, 12, 40), M.black, { p: [RX, YB - 6, RZ] });

      // table de lancement mobile
      const mw = ML.x1 - ML.x0, md = ML.z1 - ML.z0, mcx = (ML.x0 + ML.x1) / 2;
      box(mw, 220, md, M.ml, [mcx, YD - 110, RZ]);
      for (const x of [ML.x0 + 160, mcx, ML.x1 - 160]) for (const z of [ML.z0 + 160, ML.z1 - 160]) box(140, 60, 140, M.concrete, [x, 30, z]);
      for (let x = ML.x0 + 60; x < ML.x1; x += 120) box(10, 200, 8, M.steel, [x, YD - 110, ML.z1 + 4]);
      box(mw, 12, 10, M.steel, [mcx, YD - 8, ML.z1 + 6]); box(mw, 10, 10, M.steel, [mcx, YD - 210, ML.z1 + 6]);
      for (let x = ML.x0 + 30; x < ML.x1; x += 90) box(4, 100, 4, M.yellow, [x, YD + 50, ML.z1 - 10]);
      box(mw, 4, 4, M.yellow, [mcx, YD + 100, ML.z1 - 10]); box(mw, 4, 4, M.yellow, [mcx, YD + 55, ML.z1 - 10]);
      const sg = signPlane('pad', 300, 150); add(sg, M.sign, { p: [ML.x0 + 520, YD - 105, ML.z1 + 12] });
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; box(50, 70, 50, M.steel, [RX + Math.sin(a) * (R0 + 40), YD + 35, RZ + Math.cos(a) * (R0 + 40)]); }
      // mâts de service de queue
      for (const [dx, dz] of [[260, 120], [-80, 290], [200, -230]]) { box(70, 260, 90, M.orange, [RX + dx, YD + 130, RZ + dz]); box(80, 20, 100, M.steel, [RX + dx, YD + 260, RZ + dz]); }
      // tour ombilicale (treillis orange) + cage d'ascenseur + grue
      const H = 3900, lev = 16, hw = TW / 2, dy = H / lev, y0 = YD;
      const C = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]];
      for (const [cx, cz] of C) box(22, H, 22, M.orange, [TX + cx, y0 + H / 2, TZ + cz]);
      box(150, H, 150, M.steel, [TX, y0 + H / 2, TZ]);
      for (let i = 0; i <= lev; i++) {
        const y = y0 + i * dy;
        for (let k = 0; k < 4; k++) { const a = C[k], b = C[(k + 1) % 4]; strut([TX + a[0], y, TZ + a[1]], [TX + b[0], y, TZ + b[1]], 14, M.orange); }
        if (i < lev) for (let k = 0; k < 4; k++) {
          const a = C[k], b = C[(k + 1) % 4], y2 = y + dy;
          strut([TX + a[0], y, TZ + a[1]], [TX + b[0], y2, TZ + b[1]], 8, M.orange);
          strut([TX + b[0], y, TZ + b[1]], [TX + a[0], y2, TZ + a[1]], 8, M.orange);
        }
        if (i % 2 === 0 && i > 0) box(TW + 40, 6, 60, M.steel, [TX, y, TZ + hw + 30]);
      }
      box(700, 40, 40, M.orange, [TX + 120, y0 + H + 40, TZ]); box(40, 160, 40, M.orange, [TX, y0 + H + 100, TZ]);
      // bras de service vers la fusée (+ tuyaux ombilicaux qui pendent)
      const ax0 = TX + hw, ax1 = RX - R0 - 12;
      for (const y of [1100, 1460, 1880, 2300, 2750, 3200]) {
        const L = ax1 - ax0, n = 6, s = 32;
        for (const [py, pz] of [[s, s], [s, -s], [-s, s], [-s, -s]]) strut([ax0, y + py, TZ + pz], [ax1, y + py, TZ + pz], 9, M.orange);
        for (let i = 0; i <= n; i++) {
          const x = ax0 + L * i / n;
          strut([x, y - s, TZ + s], [x, y + s, TZ + s], 6, M.orange); strut([x, y - s, TZ - s], [x, y + s, TZ - s], 6, M.orange);
          if (i < n) { const x2 = ax0 + L * (i + 1) / n; strut([x, y - s, TZ + s], [x2, y + s, TZ + s], 5, M.orange); strut([x, y + s, TZ - s], [x2, y - s, TZ - s], 5, M.orange); }
        }
        box(60, 90, 90, M.steel, [ax1 - 20, y, TZ]);
        add(g.tube([[ax0 + 60, y - 30, TZ + 20], [ax0 + L * 0.5, y - 150, TZ + 30], [ax1 - 10, y - 70, TZ + 20]], 7, 16, 6), M.black);
        add(g.tube([[ax0 + 90, y - 30, TZ - 20], [ax0 + L * 0.55, y - 120, TZ - 25], [ax1 - 10, y - 50, TZ - 15]], 5, 16, 6), M.white);
      }
    }

    /* =========================================================
       CONDUITES D'ERGOLS (lignes de fuite vers la fusée) + chemin de câbles
       ========================================================= */
    {
      const P0 = [-150, -500], P1 = [ML.x1 - 60, ML.z1 + 40];
      const ux = P1[0] - P0[0], uz = P1[1] - P0[1], L = Math.hypot(ux, uz), dx = ux / L, dz = uz / L, nx = -dz, nz = dx;
      const at = (s, off, y) => [P0[0] + dx * s + nx * off, y, P0[1] + dz * s + nz * off];
      const pipes = [[-70, 72, 22, M.white], [-20, 64, 16, M.galv], [25, 70, 26, M.white], [70, 58, 9, M.yellow]];
      for (const [off, y, r, mat] of pipes) {
        strut(at(0, off, y), at(L, off, y), r, mat, null, 14);
        strut(at(0, off, 0), at(0, off, y), r, mat, null, 14);
        add(g.sphere(r * 1.08, 12, 8), mat, { p: at(0, off, y) });
        for (let s = 300; s < L; s += 620) strut(at(s - 8, off, y), at(s + 8, off, y), r + 5, M.steel, null, 14);
      }
      for (let s = 120; s < L; s += 380) {
        const a = at(s, -110, 0), b = at(s, 110, 0);
        strut([a[0], 0, a[2]], [a[0], 46, a[2]], 7, M.steel); strut([b[0], 0, b[2]], [b[0], 46, b[2]], 7, M.steel);
        strut([a[0], 46, a[2]], [b[0], 46, b[2]], 8, M.steel);
      }
      // vanne à volant
      const vp = at(0, 25, 40); add(g.cyl(34, 34, 30, 14), M.steel, { p: vp });
      add(g.torus(26, 3, 20, 6, Math.PI * 2, 'x'), M.red, { p: [vp[0], vp[1] + 52, vp[2]] }); add(g.cyl(4, 4, 40, 6), M.steel, { p: [vp[0], vp[1] + 30, vp[2]] });
      // chemin de câbles
      for (let s = 0; s < L; s += 1) { break; }
      const c0 = at(0, 150, 28), c1 = at(L, 150, 28);
      strut(c0, c1, 4, M.steel); strut(at(0, 175, 34), at(L, 175, 34), 3, M.galv); strut(at(0, 125, 34), at(L, 125, 34), 3, M.galv);
      for (const o of [138, 150, 162]) strut(at(0, o, 34), at(L, o, 34), 4, M.black, null, 6);
      // bornes jaunes / noires
      for (let s = 200; s < 2400; s += 330) { const p = at(s, -150, 50); add(g.cyl(10, 10, 100, 10), M.yellow, { p }); add(g.cyl(10.5, 10.5, 16, 10), M.black, { p: [p[0], 70, p[2]] }); add(g.cyl(10.5, 10.5, 16, 10), M.black, { p: [p[0], 34, p[2]] }); }
    }

    /* =========================================================
       PROPS DU PREMIER PLAN (visibles aux bords) + lampadaires
       ========================================================= */
    // gauche : râtelier de bouteilles de gaz, panneau DANGER, lampadaire au sodium, borne incendie
    {
      const rx = -520, rz = -930;
      box(240, 8, 70, M.steel, [rx, 4, rz]); box(240, 8, 6, M.steel, [rx, 130, rz + 32]); box(240, 8, 6, M.steel, [rx, 70, rz + 32]);
      for (const x of [-118, 118]) box(8, 170, 70, M.steel, [rx + x, 85, rz]);
      for (let i = 0; i < 6; i++) { const x = rx - 95 + i * 38; add(g.cyl(15, 15, 140, 12), i % 3 === 1 ? M.galv : M.white, { p: [x, 78, rz] }); add(g.sphere(15, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.yellow, { p: [x, 148, rz] }); }
      for (const x of [-400, -300]) box(8, 150, 8, M.galv, [x, 75, -1180]);
      add(signPlane('danger', 170, 85), M.sign, { p: [-350, 175, -1176], r: [0, 0.35, 0] }); box(180, 95, 4, M.steel, [-350, 175, -1179], [0, 0.35, 0]);
      add(g.cyl(14, 18, 70, 12), M.red, { p: [-250, 35, -360] }); add(g.sphere(15, 10, 6), M.red, { p: [-250, 72, -360] });
      // lampadaire
      add(g.cyl(6, 9, 430, 8), M.galv, { p: [-430, 215, -1320] }); box(120, 8, 8, M.galv, [-375, 425, -1320]);
      box(60, 14, 28, M.steel, [-320, 420, -1320]); box(48, 4, 20, M.lampWarm, [-320, 412, -1320]);
    }
    // droite : tour d'éclairage mobile, malles, dewar, barrière
    {
      const tx = 1640, tz = -860;
      box(300, 100, 150, M.yellow, [tx, 90, tz]); box(320, 12, 160, M.steel, [tx, 36, tz]);
      for (const x of [-90, 90]) add(g.cyl(30, 30, 18, 14, 'z'), M.black, { p: [tx + x, 30, tz + 80] });
      for (const [x, z] of [[-170, -95], [-170, 95], [170, -95], [170, 95]]) { strut([tx + x * 0.8, 60, tz + z * 0.7], [tx + x, 5, tz + z], 6, M.steel); box(30, 6, 30, M.steel, [tx + x, 3, tz + z]); }
      add(g.cyl(9, 12, 560, 8), M.galv, { p: [tx - 40, 140 + 280, tz] });
      const hd = S.group(); hd.position.set(tx - 40, 700, tz); hd.rotation.set(-0.28, -0.6, 0);
      box(230, 14, 14, M.steel, [0, 0, 0], null, hd);
      for (const [x, y] of [[-75, 50], [75, 50], [-75, -40], [75, -40]]) { box(70, 70, 34, M.steel, [x, y, 0], null, hd); box(58, 58, 2, M.lamp, [x, y, 18], null, hd); }
      stat.add(hd);
      for (let i = 0; i < 3; i++) box(90, 60, 70, M.black, [1390 + (i % 2) * 20, 30 + i * 60, -1040 + i * 8]);
      add(g.cyl(34, 34, 150, 16), M.galv, { p: [1420, 80, -560] }); add(g.sphere(34, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.galv, { p: [1420, 155, -560] });
      box(220, 80, 30, M.haz, [1560, 40, -1250]);
    }

    /* =========================================================
       MÂTS D'ÉCLAIRAGE (+ compte à rebours sur le mât droit)
       ========================================================= */
    const lampWorld = [];   // positions des lampes (halos)
    function floodMast(x, z, h, yaw) {
      add(g.cyl(10, 20, h, 8), M.galv, { p: [x, h / 2, z] });
      box(80, 34, 80, M.concrete, [x, 17, z]);
      for (let y = 40; y < h - 120; y += 28) box(36, 3, 3, M.galv, [x, y, z + 22]);
      box(260, 8, 80, M.steel, [x, h - 120, z + 16]);
      for (const xx of [-125, 125]) box(4, 80, 4, M.yellow, [x + xx, h - 80, z + 50]);
      box(254, 4, 4, M.yellow, [x, h - 42, z + 50]);
      const hd = S.group(); hd.position.set(x, h, z); hd.rotation.set(-0.32, yaw, 0, 'YXZ');
      box(250, 10, 14, M.steel, [0, 82, 0], null, hd); box(250, 10, 14, M.steel, [0, -82, 0], null, hd);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
        const lx = (c - 1) * 80, ly = (r - 0.5) * 80;
        box(66, 66, 36, M.steel, [lx, ly, 0], null, hd); box(54, 54, 2, M.lamp, [lx, ly, 19], null, hd);
        lampWorld.push([hd, lx, ly, 24]);
      }
      stat.add(hd);
      return hd;
    }
    floodMast(MLX, MZ, MH, 0.42);
    floodMast(MRX, MZ, MH, -0.38);
    // compte à rebours (canvas redessiné une fois par seconde)
    const cdCv = document.createElement('canvas'); cdCv.width = 512; cdCv.height = 128;
    const cdCtx = cdCv.getContext('2d');
    const cdTex = new T.CanvasTexture(cdCv); cdTex.colorSpace = T.SRGBColorSpace; cdTex.anisotropy = 4;
    const SEG = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
    function seg7(c, dgt, x, y, w, h, on, off) {
      const t = w * 0.2, s = SEG[dgt] || '', hh = h / 2;
      const R = { a: [x + t, y, w - 2 * t, t], b: [x + w - t, y + t * 0.6, t, hh - t * 0.9], c: [x + w - t, y + hh + t * 0.3, t, hh - t * 0.9], d: [x + t, y + h - t, w - 2 * t, t], e: [x, y + hh + t * 0.3, t, hh - t * 0.9], f: [x, y + t * 0.6, t, hh - t * 0.9], g: [x + t, y + hh - t / 2, w - 2 * t, t] };
      for (const k of 'abcdefg') { c.fillStyle = s.includes(k) ? on : off; const r = R[k]; c.fillRect(r[0], r[1], r[2], r[3]); }
    }
    let cdLast = -1;
    function drawCountdown(rem, hold) {
      const c = cdCtx;
      c.fillStyle = '#050403'; c.fillRect(0, 0, 512, 128);
      c.fillStyle = 'rgba(255,190,90,0.05)'; for (let x = 0; x < 512; x += 6) c.fillRect(x, 0, 1, 128);
      txt(c, 'LANCEMENT', 92, 17, 150, 20, '#ffb24a', 800);
      txt(c, hold ? 'ATTENTE' : 'EN COURS', 430, 17, 120, 18, hold ? '#ff5a3a' : '#7dffb0', 800);
      const on = '#ffd27a', off = 'rgba(255,170,60,0.09)';
      txt(c, 'T-', 50, 76, 62, 70, on);
      const hh = 0, mm = Math.floor(rem / 60), ss = rem % 60, D6 = [0, hh, Math.floor(mm / 10), mm % 10, Math.floor(ss / 10), ss % 10];
      let x = 92;
      for (let i = 0; i < 6; i++) {
        seg7(c, D6[i], x, 38, 46, 78, hold && (Math.floor(Date.now() / 500) % 2) ? off : on, off);
        x += 54; if (i === 1 || i === 3) { c.fillStyle = on; c.fillRect(x + 3, 58, 9, 9); c.fillRect(x + 3, 92, 9, 9); x += 20; }
      }
      cdTex.needsUpdate = true;
    }
    drawCountdown(300, false);
    {
      const bw = 560, bh = 150, by = 440, bz = MZ + 30;
      box(bw + 24, bh + 24, 22, M.steel, [MRX, by, bz - 14]);
      const scr = S.mesh(new T.PlaneGeometry(bw, bh), S.glow(0xffffff, 2.2, { map: cdTex }), { p: [MRX, by, bz] });
      stat.add(scr);
      box(30, 260, 30, M.steel, [MRX, by - 60, bz - 30]);
    }

    /* =========================================================
       SPHÈRES DE STOCKAGE (hydrogène / oxygène liquides) + phare + pas de tir jumeau
       ========================================================= */
    function sphereTank(x, z, r, cy) {
      add(g.sphere(r, 40, 28), M.white, { p: [x, cy, z] });
      add(g.torus(r * 1.005, 6, 48, 6, Math.PI * 2, 'y'), M.galv, { p: [x, cy, z] });
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, px = x + Math.cos(a) * r * 0.98, pz = z + Math.sin(a) * r * 0.98;
        strut([px, cy, pz], [x + Math.cos(a) * r * 1.02, 0, z + Math.sin(a) * r * 1.02], 9, M.galv);
        const b = (i + 1) / n * Math.PI * 2;
        strut([x + Math.cos(a) * r, cy * 0.45, z + Math.sin(a) * r], [x + Math.cos(b) * r, cy * 0.1, z + Math.sin(b) * r], 4, M.galv);
      }
      add(g.cyl(r * 0.25, r * 0.25, 10, 16), M.steel, { p: [x, cy + r, z] });
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; box(3, 40, 3, M.yellow, [x + Math.cos(a) * r * 0.25, cy + r + 22, z + Math.sin(a) * r * 0.25]); }
      add(g.cyl(10, 10, 160, 8), M.steel, { p: [x + 30, cy + r + 80, z] });
    }
    const SA = { x: Math.round(WX(905, 5600)), z: WZ(5600), r: 270, cy: 400 };
    const SB = { x: Math.round(WX(1000, 6600)), z: WZ(6600), r: 220, cy: 330 };
    sphereTank(SA.x, SA.z, SA.r, SA.cy);
    sphereTank(SB.x, SB.z, SB.r, SB.cy);
    // conduites basses des sphères vers la fusée
    strut([SA.x - SA.r, 40, SA.z], [ML.x1, 40, SA.z - 900], 18, M.white, null, 12);
    strut([SB.x - SB.r, 30, SB.z], [SA.x, 30, SB.z + 300], 14, M.galv, null, 12);
    // clôture d'enceinte lointaine
    for (let x = -2900; x < 4200; x += 260) { if (x > ML.x0 - 100 && x < ML.x1 + 100) continue; box(6, 200, 6, M.galv, [x, 100, -5400]); }
    box(7100, 3, 3, M.galv, [650, 198, -5400]); box(7100, 3, 3, M.galv, [650, 110, -5400]);
    // plage + dunes basses
    add(new T.PlaneGeometry(FR.x1 - FR.x0 + 2000, SEA - COAST).rotateX(-Math.PI / 2), M.sand, { p: [650, 0.5, (COAST + SEA) / 2] });
    for (let i = 0; i < 26; i++) {
      const left = i < 13, x = left ? -3600 + rnd() * 1700 : 2900 + rnd() * 1900, z = COAST - 80 - rnd() * 500;
      add(g.ell(220 + rnd() * 260, 50 + rnd() * 50, 120 + rnd() * 80, 12, 6), M.scrub, { p: [x, 0, z] });
    }
    // phare (rayé noir / blanc) sur la côte droite
    const LH = { x: 4300, z: SEA + 60 };
    for (let i = 0; i < 6; i++) add(g.cyl(44 - i * 2.4 - 2.4, 44 - i * 2.4, 100, 16), i % 2 ? M.black : M.white, { p: [LH.x, 50 + i * 100, LH.z] });
    add(g.cyl(30, 30, 50, 12), M.lampWarm, { p: [LH.x, 625, LH.z] }); add(g.cone(36, 40, 12), M.black, { p: [LH.x, 670, LH.z] });
    // pas de tir jumeau, au loin (silhouettes non éclairées)
    const farMat = S.basic({ vertexColors: true, fog: false });
    {
      const fx = 650, fz = -15300, list = [];
      const cb = (w, h, d, p, col) => list.push(clean(xf(g.box(w, h, d), p), col));
      list.push(clean(xf(g.box(2400, 40, 700), [fx + 300, 0, fz + 100]), 0x4a4664));
      cb(520, 120, 420, [fx, 60, fz], 0x55506e);
      list.push(clean(xf(g.cyl(48, 48, 1500, 12), [fx + 60, 120 + 750, fz]), 0x8e88a6));
      list.push(clean(xf(g.cone(48, 140, 12), [fx + 60, 120 + 1570, fz]), 0x8e88a6));
      cb(140, 1750, 140, [fx - 120, 120 + 875, fz], 0x5a5272);
      cb(260, 40, 60, [fx - 40, 1500, fz], 0x5a5272);
      for (const dx of [-700, 900]) list.push(clean(xf(g.cyl(10, 18, 2000, 6), [fx + dx, 1000, fz - 100]), 0x5e5878));
      const fm = new T.Mesh(BGU.mergeGeometries(list, false), farMat); fm.userData.noMerge = true; fm.userData.receiveShadow = false; root.add(fm);
    }

    /* =========================================================
       FAISCEAUX (cônes additifs) : projecteurs xénon vers la fusée, mâts, phare tournant, pas de tir jumeau
       ========================================================= */
    const BEAMS = [];
    const beam = (a, dir, len, r0, r1, col, I, sw) => BEAMS.push({ a, dir, len, r0, r1, col, I, sw: sw || [0, 0, 0, 0] });
    // xénons au pied de la fusée
    const XEN = [[RX - 620, RZ + 860, -0.18, 0.02], [RX - 280, RZ + 900, -0.05, 0.03], [RX + 180, RZ + 880, 0.06, 0.035], [RX + 470, RZ + 820, 0.16, 0.03]];
    XEN.forEach(([x, z, lean, sw], i) => beam([x, 40, z], [lean + (RX - x) * 0.00025, 1, -0.22], 3600, 10, 230, 0xcfdcff, 0.18, [sw, 0.01, 0.13, i * 1.7]));
    // pas de tir jumeau : balayage lent dans le ciel
    [[-0.25, 0.0], [0.05, 1.3], [0.32, 2.4]].forEach(([lean, ph]) => beam([650 + lean * 400, 60, -15300], [lean, 1, 0.05], 7000, 20, 520, 0xb8c8ff, 0.07, [0.18, 0.04, 0.09, ph]));
    // mâts : cônes de lumière vers le sol
    beam([MLX + 30, MH - 10, MZ + 25], [0.18, -1, 0.75], 1200, 90, 520, 0xdde6ff, 0.05);
    beam([MRX - 30, MH - 10, MZ + 25], [-0.1, -1, 0.75], 1200, 90, 520, 0xdde6ff, 0.05);
    beam([1600, 700, -840], [-0.75, -0.55, 0.45], 900, 60, 380, 0xdde6ff, 0.05);
    // phare : faisceau horizontal qui tourne
    beam([LH.x, 625, LH.z], [-1, 0.02, 0], 5200, 10, 260, 0xfff0d0, 0.16, [-1, 0, 0.55, 0]);
    {
      const geos = BEAMS.map(b => {
        const gg = new T.CylinderGeometry(b.r0, b.r1, b.len, 20, 1, true).toNonIndexed();
        gg.translate(0, -b.len / 2, 0);
        _d.set(b.dir[0], b.dir[1], b.dir[2]).normalize(); _q.setFromUnitVectors(_dn, _d);
        _m4.makeRotationFromQuaternion(_q).setPosition(b.a[0], b.a[1], b.a[2]); gg.applyMatrix4(_m4);
        const n = gg.attributes.position.count, piv = new Float32Array(n * 3), sw = new Float32Array(n * 4), col = new Float32Array(n * 3), c = lin(b.col).multiplyScalar(b.I);
        for (let i = 0; i < n; i++) { piv.set(b.a, i * 3); sw.set(b.sw, i * 4); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        gg.setAttribute('aPiv', new T.BufferAttribute(piv, 3)); gg.setAttribute('aSw', new T.BufferAttribute(sw, 4)); gg.setAttribute('aCol', new T.BufferAttribute(col, 3));
        return gg;
      });
      const bm = new T.ShaderMaterial({
        uniforms: { time: timeU, tN: { value: noiseTex } }, transparent: false, depthWrite: false, blending: T.AdditiveBlending, fog: false,
        vertexShader: `attribute vec3 aPiv; attribute vec4 aSw; attribute vec3 aCol; uniform float time;
          varying vec2 vUv; varying vec3 vN, vV, vCol;
          void main(){
            vec3 p = position - aPiv, nn = normal;
            if (aSw.x < 0.0) { float a = time * aSw.z + aSw.w; mat3 ry = mat3(cos(a), 0.0, -sin(a), 0.0, 1.0, 0.0, sin(a), 0.0, cos(a)); p = ry * p; nn = ry * nn; }
            else { float a1 = aSw.x * sin(time * aSw.z + aSw.w), a2 = aSw.y * sin(time * aSw.z * 0.73 + aSw.w * 1.7);
              mat3 rz = mat3(cos(a1), sin(a1), 0.0, -sin(a1), cos(a1), 0.0, 0.0, 0.0, 1.0); mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cos(a2), sin(a2), 0.0, -sin(a2), cos(a2));
              p = rz * rx * p; nn = rz * rx * nn; }
            vec4 mv = modelViewMatrix * vec4(p + aPiv, 1.0);
            vN = normalize(normalMatrix * nn); vV = normalize(-mv.xyz); vUv = uv; vCol = aCol;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `uniform float time; uniform sampler2D tN; varying vec2 vUv; varying vec3 vN, vV, vCol;
          void main(){
            float f = abs(dot(normalize(vN), normalize(vV)));
            float a = pow(f, 2.2) * pow(vUv.y, 1.5);
            float dust = texture2D(tN, vec2(vUv.x * 3.0, vUv.y * 2.0 - time * 0.03)).r;
            gl_FragColor = vec4(vCol * a * (0.7 + 0.6 * dust), 1.0);
          }`
      });
      const bmesh = new T.Mesh(BGU.mergeGeometries(geos, false), bm);
      bmesh.frustumCulled = false; bmesh.renderOrder = -2.9; bmesh.userData.noMerge = true; bmesh.userData.receiveShadow = false; root.add(bmesh);
    }

    /* =========================================================
       VAPEUR : dégazage de la fusée, cascades sous les bras, nappe au pied, vapeur de la tranchée, brume côtière
       ========================================================= */
    const VP = [];
    // kind 0 panache, 1 colonne discrète, 2 nappe (dense en bas)
    function plume(o, dir, len, w0, w1, seed, spd, op, kind = 0, droop = 0, segs = 8) {
      const dl = Math.hypot(dir[0], dir[1]), fx = dir[0] / dl, fy = dir[1] / dl;
      let ax = -fy, ay = fx; if (ay < -0.1 || (Math.abs(ay) <= 0.1 && ax < 0)) { ax = -ax; ay = -ay; }
      VP.push({ o, fx, fy, ax, ay, len, w0, w1, seed, spd, op, kind, droop, segs });
    }
    // dégazage d'oxygène liquide du 1er étage (dérive vers la droite et retombe)
    plume([RX + R0 - 10, 1180, RZ + 40], [1, -0.05], 1300, 50, 520, 0.1, 0.05, 0.75, 0, 260);
    plume([RX + R0 - 20, 1540, RZ + 30], [1, 0.02], 1500, 60, 600, 0.6, 0.045, 0.7, 0, 200);
    plume([RX + R0 - 30, 880, RZ + 50], [1, -0.12], 900, 40, 380, 0.33, 0.06, 0.6, 0, 160);
    // cascades froides sous les bras de service
    plume([RX - R0 - 30, 1080, RZ + 60], [0.08, -1], 760, 40, 340, 0.8, 0.07, 0.6, 0, 0);
    plume([RX - R0 - 40, 1440, RZ + 50], [0.05, -1], 1000, 40, 360, 0.45, 0.06, 0.5, 0, 0);
    // nappe qui déborde de la table de lancement
    plume([ML.x0 - 200, 0, ML.z1 + 120], [1, 0], ML.x1 - ML.x0 + 900, 300, 380, 0.2, 0.025, 0.55, 2);
    plume([RX - 300, YD - 40, RZ + 160], [1, 0.25], 1200, 120, 520, 0.9, 0.05, 0.5, 0, -120);
    // vapeur de la tranchée (discrète, derrière les combattants)
    for (let i = 0; i < 7; i++) plume([TR.x0 + 150 + i * 330 + rnd() * 80, -60, (TR.z0 + TR.z1) / 2], [0.12, 1], 520 + rnd() * 160, 160, 420, i * 0.17, 0.035, 0.16, 1);
    // brume côtière / matinale (nappes lointaines)
    plume([-4000, 0, -4600], [1, 0], 10000, 260, 260, 0.3, 0.008, 0.45, 2);
    plume([-4500, 0, -6600], [1, 0], 12000, 420, 420, 0.7, 0.006, 0.55, 2);
    plume([-6000, 0, -9000], [1, 0], 15000, 500, 500, 0.5, 0.004, 0.5, 2);
    {
      const pos = [], uv = [], prm = [], idx = [];
      for (const p of VP) {
        const base = pos.length / 3;
        for (let i = 0; i <= p.segs; i++) {
          const x = i / p.segs, cx = p.o[0] + p.fx * p.len * x, cy = p.o[1] + p.fy * p.len * x - p.droop * x * x, hw = (p.w0 + (p.w1 - p.w0) * Math.pow(x, 0.7)) / 2;
          const ox = p.kind === 2 ? 0 : p.ax * hw, oy = p.kind === 2 ? 0 : p.ay * hw;
          if (p.kind === 2) { pos.push(cx, cy, p.o[2], cx, cy + hw * 2, p.o[2]); }
          else pos.push(cx - ox, cy - oy, p.o[2], cx + ox, cy + oy, p.o[2]);
          uv.push(x, 0, x, 1);
          for (let k = 0; k < 2; k++) prm.push(p.seed, p.spd, p.op, p.kind);
          if (i < p.segs) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        }
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setAttribute('aP', new T.Float32BufferAttribute(prm, 4)); geo.setIndex(idx);
      const vm = new T.ShaderMaterial({
        uniforms: { time: timeU, tN: { value: noiseTex }, sunAz: { value: SUN_AZ }, cShade: { value: lin(0x7d82a8) }, cLit: { value: lin(0xf4ecf0) }, cWarm: { value: lin(0xffc59a) }, cMist: { value: lin(0xb59cb4) } },
        transparent: false, depthWrite: false, side: T.DoubleSide, fog: false,
        blending: T.CustomBlending, blendSrc: T.SrcAlphaFactor, blendDst: T.OneMinusSrcAlphaFactor,
        vertexShader: 'attribute vec4 aP; varying vec2 vUv; varying vec4 vP; varying vec3 vW; void main(){ vUv = uv; vP = aP; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform float time, sunAz; uniform sampler2D tN; uniform vec3 cShade, cLit, cWarm, cMist; varying vec2 vUv; varying vec4 vP; varying vec3 vW;
          float dens(vec2 uv, float t, float seed, float sx){
            vec2 q = vec2(uv.x * sx - t, uv.y * 0.7 + seed);
            return texture2D(tN, q * vec2(0.55, 0.5)).r * 0.55 + texture2D(tN, q * vec2(1.25, 1.1) + vec2(-t * 0.3, 0.37)).g * 0.35 + texture2D(tN, q * vec2(2.6, 2.3) + vec2(seed, -t * 0.6)).b * 0.22;
          }
          void main(){
            float seed = vP.x, t = time * vP.y, x = vUv.x, y = vUv.y, kind = vP.w;
            float sx = kind > 1.5 ? 6.0 : 1.4;
            float n = dens(vUv, t, seed, sx), nu = dens(vUv + vec2(0.0, 0.06), t, seed, sx);
            float env, d;
            if (kind > 1.5) { env = pow(1.0 - y, 1.6) * smoothstep(0.0, 0.08, x) * smoothstep(1.0, 0.92, x); d = smoothstep(0.25, 0.8, n) * env; }
            else { float ac = abs(y - 0.5) * 2.0; env = smoothstep(1.0, 0.3, ac) * smoothstep(0.0, 0.07, x) * smoothstep(1.0, 0.45, x); d = smoothstep(0.36 + x * 0.14, 0.8, n) * env; }
            float lit = clamp(0.5 + (n - nu) * 4.0 + (y - 0.5) * 0.5, 0.0, 1.0);
            vec3 col = mix(cShade, cLit, lit);
            float az = atan(vW.x - 650.0, 689.0 - vW.z);
            col = mix(col, cWarm, exp(-pow((az - sunAz) / 0.22, 2.0)) * (0.3 + 0.5 * lit));
            if (kind > 1.5) col = mix(cMist, col, 0.35);
            if (kind > 0.5 && kind < 1.5) col *= 0.82;
            gl_FragColor = vec4(col, d * vP.z);
          }`
      });
      const vmesh = new T.Mesh(geo, vm); vmesh.frustumCulled = false; vmesh.renderOrder = -2.92; vmesh.userData.noMerge = true; vmesh.userData.receiveShadow = false; root.add(vmesh);
    }

    /* =========================================================
       HALOS DE LUMIÈRE (billboards additifs, clignotements sur GPU)
       mode : 0 fixe, 1 clignotant, 2 flash, 3 gyrophare
       ========================================================= */
    const FL = [];
    const fl = (p, s, hex, I, m = 0, f = 1, ph = 0) => { const c = lin(hex).multiplyScalar(I); FL.push([p[0], p[1], p[2], s, c.r, c.g, c.b, m, f, ph]); };
    stat.updateMatrixWorld(true);
    for (const [hd, lx, ly, lz] of lampWorld) { hd.updateMatrixWorld(true); _v.set(lx, ly, lz + 6).applyMatrix4(hd.matrixWorld); fl([_v.x, _v.y, _v.z], 46, 0xdfe8ff, 1.6, 0, 1.3, rnd() * 6); }
    // tour mobile (premier plan droit)
    { const hd = stat.children.find(o => o.isGroup && Math.abs(o.position.x - 1600) < 1 && o.position.y === 700);
      if (hd) for (const [x, y] of [[-75, 50], [75, 50], [-75, -40], [75, -40]]) { _v.set(x, y, 26).applyMatrix4(hd.matrixWorld); fl([_v.x, _v.y, _v.z], 60, 0xe6eeff, 1.8, 0, 1.1, rnd() * 6); } }
    fl([-320, 408, -1300], 42, 0xffb866, 1.6, 0, 2.0, 1.0);
    // xénons
    XEN.forEach(([x, z]) => fl([x, 46, z + 10], 70, 0xe0e8ff, 2.4, 0, 0.8, rnd() * 6));
    // tour ombilicale : feux de niveaux + feux d'obstacle
    for (let i = 1; i <= 16; i++) { const y = YD + i * 3900 / 16; fl([TX + TW / 2 + 6, y - 20, TZ + TW / 2 + 6], 14, 0xffd9a0, 1.2, 0, 0.7, i); if (i % 3 === 0) fl([TX - TW / 2 - 6, y - 20, TZ + TW / 2 + 6], 12, 0xffffff, 1.0, 0, 0.5, i * 2); }
    for (const y of [1500, 2600, YD + 3900 + 40]) fl([TX, y, TZ + TW / 2 + 10], 26, 0xff2a1a, 3.0, 1, 2.6, y);
    fl([TX + 470, YD + 3940, TZ], 22, 0xff2a1a, 3.0, 1, 2.6, 0.8);
    // table de lancement : hublots et feux
    for (let x = ML.x0 + 90; x < ML.x1; x += 160) fl([x, YD - 60, ML.z1 + 14], 16, 0xffc887, 1.1, 0, 0.6, x);
    // mâts : feux rouges au sommet
    fl([MLX, MH + 110, MZ], 18, 0xff2a1a, 3.0, 1, 2.2, 0.3); fl([MRX, MH + 110, MZ], 18, 0xff2a1a, 3.0, 1, 2.2, 1.9);
    // sphères
    fl([SA.x + 30, SA.cy + SA.r + 165, SA.z], 20, 0xff2a1a, 3.0, 1, 2.0, 2.5); fl([SB.x + 30, SB.cy + SB.r + 165, SB.z], 20, 0xff2a1a, 3.0, 1, 2.0, 0.1);
    fl([SA.x - SA.r - 20, 60, SA.z + 80], 22, 0xffb866, 1.4, 0, 0.5, 2);
    // clôture lointaine : lampes au sodium
    for (let x = -2600; x < 4000; x += 900) if (x < ML.x0 || x > ML.x1) fl([x, 330, -5400], 30, 0xffa955, 1.3, 0, 0.4, x);
    // pas de tir jumeau
    for (const [dx, y, c, m] of [[-120, 1780, 0xff2a1a, 1], [-700, 2010, 0xff2a1a, 1], [900, 2010, 0xff2a1a, 1], [60, 300, 0xffffff, 0], [-200, 200, 0xffd9a0, 0], [300, 160, 0xffd9a0, 0], [-120, 1000, 0xffffff, 2]]) fl([650 + dx, y, -15300 + 80], 60, c, m === 2 ? 2.5 : 1.6, m, m === 2 ? 0.9 : 1.7, dx);
    // phare (pulsation quand le faisceau passe) + côte
    fl([LH.x, 625, LH.z + 40], 90, 0xfff0d0, 2.0, 3, 0.55, Math.PI * 0.5);
    for (let i = 0; i < 6; i++) fl([3200 + i * 260, 40, SEA + 40], 26, 0xffc887, 1.0, 0, 0.5, i);
    // trace d'un avion (feu clignotant très loin)
    {
      const n = FL.length;
      for (const f of FL.slice(0, n)) { /* les halos sont statiques ; le mouvement est porté par la vapeur / les faisceaux */ }
    }
    {
      const n = FL.length, pos = new Float32Array(n * 12), off = new Float32Array(n * 8), col = new Float32Array(n * 12), prm = new Float32Array(n * 16), idx = [];
      const CO = [-1, -1, 1, -1, 1, 1, -1, 1];
      FL.forEach((f, i) => {
        for (let k = 0; k < 4; k++) { const j = i * 4 + k; pos.set([f[0], f[1], f[2]], j * 3); off[j * 2] = CO[k * 2]; off[j * 2 + 1] = CO[k * 2 + 1]; col.set([f[4], f[5], f[6]], j * 3); prm.set([f[3], f[7], f[8], f[9]], j * 4); }
        idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
      });
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('aO', new T.BufferAttribute(off, 2)); geo.setAttribute('aCol', new T.BufferAttribute(col, 3)); geo.setAttribute('aB', new T.BufferAttribute(prm, 4)); geo.setIndex(idx);
      const fm = new T.ShaderMaterial({
        uniforms: { time: timeU }, transparent: false, depthWrite: false, blending: T.AdditiveBlending, fog: false,
        vertexShader: `attribute vec2 aO; attribute vec3 aCol; attribute vec4 aB; uniform float time; varying vec2 vO; varying vec3 vCol;
          void main(){
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float depth = max(-mv.z, 1.0);
            float s = max(aB.x, 2.6 * depth / 1171.0);
            float e = clamp(aB.x / s, 0.25, 1.0);
            float m = aB.y, ph = time * aB.z + aB.w, k;
            if (m > 2.5) k = 0.18 + 1.2 * pow(max(sin(ph), 0.0), 10.0);
            else if (m > 1.5) k = pow(max(sin(ph), 0.0), 40.0) * 2.0;
            else if (m > 0.5) k = 0.06 + 0.94 * step(0.35, sin(ph));
            else k = 0.9 + 0.1 * sin(ph * 5.0) * sin(ph * 3.1);
            vCol = aCol * k * e;
            mv.xy += vec2(aO.x * 3.0, aO.y) * s;
            mv.z += s * 0.5;
            vO = aO;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `varying vec2 vO; varying vec3 vCol;
          void main(){
            vec2 q = vec2(vO.x * 3.0, vO.y); float r2 = dot(q, q);
            float a = exp(-r2 * 26.0) * 1.6 + exp(-r2 * 5.0) * 0.3 + exp(-abs(vO.y) * 34.0) * pow(1.0 - abs(vO.x), 3.0) * 0.35;
            gl_FragColor = vec4(vCol * a, 1.0);
          }`
      });
      const fmesh = new T.Mesh(geo, fm); fmesh.frustumCulled = false; fmesh.renderOrder = -2.85; fmesh.userData.noMerge = true; fmesh.userData.receiveShadow = false; root.add(fmesh);
    }
    // lampes qui se reflètent dans le sol mouillé
    LAMPS.push([MLX + 30, MH, MZ + 30, 0.007, 0xdfe8ff, 1.3], [MRX - 30, MH, MZ + 30, 0.007, 0xdfe8ff, 1.3], [MRX, 440, MZ + 40, 0.012, 0xffb24a, 0.5],
      [1600, 700, -830, 0.009, 0xe6eeff, 1.2], [-320, 410, -1300, 0.008, 0xffb866, 1.1], [RX - 100, 46, RZ + 880, 0.01, 0xe0e8ff, 0.9],
      [SA.x - SA.r - 20, 60, SA.z + 80, 0.006, 0xffb866, 0.5], [LH.x, 625, LH.z, 0.004, 0xfff0d0, 0.4]);
    for (let i = 0; i < NL; i++) { const L = LAMPS[i]; floorU.lampP.value.push(new T.Vector4(L[0], L[1], L[2], L[3])); floorU.lampC.value.push(lin(L[4]).multiplyScalar(L[5])); }

    /* =========================================================
       MOUETTES (instances, battement d'ailes dans le vertex shader) + VÉHICULE DE SÉCURITÉ
       ========================================================= */
    const NG = 6;
    const gullGeo = mergeG([
      xf(g.box(5, 5, 30), [0, 0, 0]),
      xf(g.box(34, 1.6, 11), [18, 3, -2], [0, 0, 0.22]), xf(g.box(34, 1.6, 11), [-18, 3, -2], [0, 0, -0.22]),
      xf(g.box(32, 1.4, 8), [49, 5, -5], [0, 0.18, -0.2]), xf(g.box(32, 1.4, 8), [-49, 5, -5], [0, -0.18, 0.2]),
      xf(g.box(10, 1.4, 8), [0, 0, -18])
    ]);
    const gullMat = S.basic({ color: 0x3a3a52 });
    gullMat.onBeforeCompile = sh => {
      sh.uniforms.time = timeU;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float time;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat gph = time * 6.5 + float(gl_InstanceID) * 2.3; float gfl = sin(gph) * (0.55 + 0.45 * step(0.0, sin(gph * 0.13 + float(gl_InstanceID))));\ntransformed.y += gfl * max(abs(transformed.x) - 4.0, 0.0) * 0.5;');
    };
    gullMat.customProgramCacheKey = () => 'lpGull';
    const gulls = new T.InstancedMesh(gullGeo, gullMat, NG);
    gulls.frustumCulled = false; gulls.userData.noMerge = true; gulls.userData.receiveShadow = false; root.add(gulls);
    const GU = []; for (let i = 0; i < NG; i++) GU.push({ cx: WX(560 + rnd() * 380, 4200), cy: 700 + rnd() * 500, cz: WZ(3600 + rnd() * 1800), r: 300 + rnd() * 500, w: (0.12 + rnd() * 0.1) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6.28, s: 1.2 + rnd() * 0.5 });
    const gM = new T.Matrix4(), gQ = new T.Quaternion(), gE = new T.Euler(), gP = new T.Vector3(), gS = new T.Vector3();
    // véhicule (va-et-vient sur la route périphérique, côté gauche)
    const veh = S.group();
    {
      const vg = S.group();
      box(420, 120, 190, M.white, [0, 95, 0], null, vg); box(200, 70, 186, M.white, [-40, 190, 0], null, vg);
      box(196, 56, 190, M.glass, [-40, 192, 0], null, vg); box(420, 18, 194, M.orange, [0, 110, 0], null, vg);
      for (const x of [-140, 140]) for (const z of [-92, 92]) add(g.cyl(38, 38, 24, 12, 'z'), M.black, { p: [x, 38, z] }, vg);
      box(4, 18, 40, M.lamp, [212, 110, -62], null, vg); box(4, 18, 40, M.lamp, [212, 110, 62], null, vg);
      box(4, 16, 30, M.red, [-212, 112, -70], null, vg); box(4, 16, 30, M.red, [-212, 112, 70], null, vg);
      S.merge(vg); veh.add(vg);
    }
    const beaconMat = S.glow(0xffa020, 5);
    const beacon = S.mesh(g.box(26, 18, 70), beaconMat, { p: [-40, 236, 0] }); veh.add(beacon);
    veh.userData.noMerge = true; veh.position.set(-2400, 0, -5175); root.add(veh);
    const beaconBase = beaconMat.color.clone();

    // particules : gouttelettes / poussière en suspension dans la lumière
    root.add(S.particles({ kind: 'dust', count: Q >= 2 ? 200 : 520, box: [-700, 700, 10, 460, -1100, 260], speed: 5, wind: [26, 0], size: 2.6, color: 0xffe4cc, opacity: 0.45 }));

    // fusion du décor statique
    S.merge(stat); root.add(stat);

    /* =========================================================
       ANIMATION
       ========================================================= */
    const CD0 = 300;
    function update(t, info) {
      timeU.value = t;
      // compte à rebours (T-05:00 → 0, puis attente clignotante, puis reprise)
      const cyc = t % (CD0 + 12), rem = Math.max(0, Math.ceil(CD0 - cyc)), hold = cyc >= CD0;
      const key = hold ? -1 - (Math.floor(t * 2) % 2) : rem;
      if (key !== cdLast) { cdLast = key; drawCountdown(rem, hold); }
      // mouettes
      for (let i = 0; i < NG; i++) {
        const u = GU[i], a = u.ph + t * u.w;
        gP.set(u.cx + Math.cos(a) * u.r, u.cy + Math.sin(a * 2.0) * 40, u.cz + Math.sin(a) * u.r * 0.45);
        gE.set(0.0, -a + (u.w > 0 ? 0 : Math.PI) + Math.PI, (u.w > 0 ? -0.25 : 0.25), 'YXZ');
        gQ.setFromEuler(gE); gS.setScalar(u.s);
        gulls.setMatrixAt(i, gM.compose(gP, gQ, gS));
      }
      gulls.instanceMatrix.needsUpdate = true;
      // véhicule : va-et-vient lent avec pauses
      const vp = (t * 0.045) % 2, k = vp < 1 ? vp : 2 - vp, e = k < 0.1 ? 0 : k > 0.9 ? 1 : (k - 0.1) / 0.8;
      const ee = e * e * (3 - 2 * e);
      veh.position.x = -2700 + ee * 1500;
      veh.rotation.y = vp < 1 ? 0 : Math.PI;
      const bk = 0.25 + 1.6 * Math.pow(Math.max(Math.sin(t * 9.0), 0), 6);
      beaconMat.color.copy(beaconBase).multiplyScalar(bk / 5 * 5 / 5);
    }
    return { root, update };
  }

  return { light, track, build };
})();
