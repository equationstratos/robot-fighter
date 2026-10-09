'use strict';
/* =========================================================
   Modèle 3D : UNITREE H1 (2023) — maillages CAO officiels (js/meshes/h1.js, MuJoCo Menagerie, BSD-3)
   + skins « robots » : UNITREE G1 ('g1') et UNITREE R1 ('r1'), même squelette, coques procédurales.
   Contrat : voir js/kit.js.

   SKIN 'classic' (H1) — placement : une seule échelle réel → conception (k = 0,88) pour le bassin, les hanches
   et les jambes (os alignés sur le squelette par to/len) ; coffre légèrement tassé pour que les axes
   d'épaule réels tombent sur les épaules du squelette ; bras à 0,97 (avant-bras découpé en tête de coude +
   tube, seul le tube est étiré). Découpe des maillages réels par triangles (helper splitGeo) :
     torso_link → coffre (noir satiné anodisé, arêtes usinées alu brillant, bac inférieur gris métal), carters
     d'épaule (pièces <s>sc), béquille en A + anneau facial (cou), casque + dôme lidar + fente caméra (tête).
     membres → alu anodisé graphite + chanfreins usinés brillants (faces planes obliques) ; tube du tibia
     en carbone (texture sergé, UV planaires).
   Détails procéduraux placés dans l'espace réel (realGroup) : moteurs à disque (carter gris métal, bague
   usinée acier + fines stries d'usinage, couronne de vis chromées, moyeu) sur tangage/roulis de hanche,
   roulis/lacet d'épaule, coude, cheville ; chapeaux d'axe ; semelle caoutchouc ; voyants d'état (fente de la
   caméra de profondeur, flancs du coffre) ; logo CAO « Unitree H1 » retourné selon le sens du combattant ;
   marquage blanc « UNITREE H1 » sur le flanc des cuisses (atlas canvas, version miroir quand face < 0).
   Le tube du bras (épaule → coude, perdu à la décimation de la CAO) est reconstruit procéduralement.
   Mains : le H1 d'origine n'en a pas (pommeau) → manchette de poignet usinée + main compacte foncée
   (paume, 4 doigts à 2 phalanges, pouce) qui se ferme en poing (userData.setCurl).

   SKINS 'g1' / 'r1' (buildAlt) : coques « lofts » à sections super-elliptiques (loft), décalcomanies qui
   épousent les coques (patch), visage / visière ovales posés sur la surface de la tête (oval, ovalRing).
     G1 : alu poli argent partout (coffre « Unitree », capots d'épaule, cuisses, tibias), articulations
          graphite, tête noire à visage ovale laqué cerclé d'un anneau LED BLEU, mains gantées noires, pieds noirs.
     R1 : livrée canvas (blanc / bleu marine / rouge) : casque blanc à chevron rouge + visière noire + oreillettes
          marine à lentille violette ; buste marine à plastron blanc en panneaux hexagonaux + logo triangle
          rouge ; gros pods d'épaule blancs à disque marine ; « 01 » rouge + bande rouge sur les bras ;
          avant-bras marine, poings gris ; cuisses blanches à chevrons de danger rouges ; genoux marine à
          disque gris ; tibias blancs / mollets marine ; baskets blanches à triangle marine.
   ========================================================= */
if (typeof RK !== 'undefined' && RK) RK.models.h1 = (function () {
  const T = RK.T, BGU = T.BufferGeometryUtils, PI = Math.PI, D = PI / 180;
  const SPLIT = {}, GC = {}, TX = {};

  // découpe une géométrie réelle (non indexée, coordonnées réelles en cm) en classes de triangles
  // cls(cx, cy, cz, nx, ny, nz, kf) : kf = min(normale de sommet · normale de face) (≈ 1 : face plane, facettée)
  // flat : faces quasi parallèles à un plan principal → normales plates ; uvf(x, y, z) → [u, v] (facultatif)
  function splitGeo(geo, cls, flat, uvf) {
    const P = geo.attributes.position.array, N = geo.attributes.normal.array, nt = P.length / 9;
    const FN = new Float32Array(nt * 3);
    const buckets = {};
    for (let t = 0; t < nt; t++) {
      const o = t * 9;
      const cx = (P[o] + P[o + 3] + P[o + 6]) / 3, cy = (P[o + 1] + P[o + 4] + P[o + 7]) / 3, cz = (P[o + 2] + P[o + 5] + P[o + 8]) / 3;
      const ax = P[o + 3] - P[o], ay = P[o + 4] - P[o + 1], az = P[o + 5] - P[o + 2];
      const bx = P[o + 6] - P[o], by = P[o + 7] - P[o + 1], bz = P[o + 8] - P[o + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl; FN[t * 3] = nx; FN[t * 3 + 1] = ny; FN[t * 3 + 2] = nz;
      let kf = 1;
      for (let v = 0; v < 3; v++) kf = Math.min(kf, N[o + v * 3] * nx + N[o + v * 3 + 1] * ny + N[o + v * 3 + 2] * nz);
      const c = cls(cx, cy, cz, nx, ny, nz, kf);
      if (!c) continue;
      (buckets[c] || (buckets[c] = [])).push(t);
    }
    const out = {};
    for (const c in buckets) {
      const list = buckets[c], pos = new Float32Array(list.length * 9), nor = new Float32Array(list.length * 9);
      list.forEach((t, i) => {
        pos.set(P.subarray(t * 9, t * 9 + 9), i * 9);
        const fx = FN[t * 3], fy = FN[t * 3 + 1], fz = FN[t * 3 + 2];
        if (flat && Math.max(Math.abs(fx), Math.abs(fy), Math.abs(fz)) > flat) for (let v = 0; v < 3; v++) { nor[i * 9 + v * 3] = fx; nor[i * 9 + v * 3 + 1] = fy; nor[i * 9 + v * 3 + 2] = fz; }
        else nor.set(N.subarray(t * 9, t * 9 + 9), i * 9);
      });
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setAttribute('normal', new T.BufferAttribute(nor, 3));
      if (uvf) {
        const uv = new Float32Array(list.length * 6);
        for (let i = 0; i < list.length * 3; i++) { const q = uvf(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); uv[i * 2] = q[0]; uv[i * 2 + 1] = q[1]; }
        g.setAttribute('uv', new T.BufferAttribute(uv, 2));
      }
      g.computeBoundingSphere();
      out[c] = g;
    }
    return out;
  }
  // fusion locale de petites géométries : items = [[geo, [x,y,z], [rx,ry,rz], échelle]]
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();
  function fuse(key, items) {
    if (GC[key]) return GC[key];
    const list = items.map(([geo, p, r, s]) => {
      const gg = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const n of Object.keys(gg.attributes)) if (n !== 'position' && n !== 'normal') gg.deleteAttribute(n);
      _m.compose(_v.set(...(p || [0, 0, 0])), _q.setFromEuler(_e.set(...(r || [0, 0, 0]))), Array.isArray(s) ? _s.set(...s) : _s.setScalar(s || 1));
      gg.applyMatrix4(_m); return gg;
    });
    return (GC[key] = BGU.mergeGeometries(list, false));
  }

  /* ---------- textures canvas (cache module) ---------- */
  const FONT = '"Inter", "Helvetica Neue", "Segoe UI", Roboto, Arial, sans-serif';
  function fitText(c, s, x, y, wt, px, maxW, ls) {
    c.font = `${wt} ${px}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const hasLS = 'letterSpacing' in c; if (hasLS) c.letterSpacing = ls + 'px';
    const mw = c.measureText(s).width;
    if (mw > maxW) c.font = `${wt} ${(px * maxW / mw).toFixed(2)}px ${FONT}`;
    c.fillText(s, x, y);
    if (hasLS) c.letterSpacing = '0px';
  }
  // atlas des marquages (blanc sur transparent, teinté par la couleur du matériau) ; version miroir pour face < 0
  const TW = 512, TH = 128;
  const TR = { uni: [0, 0, 256, 64], UNI: [256, 0, 256, 40], n01: [0, 64, 128, 64] };
  const TDRAW = {
    uni: (c, w, h) => fitText(c, 'Unitree', w / 2, h * 0.76, 600, 50, w * 0.92, 0),
    UNI: (c, w, h) => fitText(c, 'UNITREE  H1', w / 2, h * 0.76, 700, 27, w * 0.95, 5),
    n01: (c, w, h) => fitText(c, '01', w / 2, h * 0.86, 800, 64, w * 0.92, 2)
  };
  function txtAtlas(mirror) {
    const key = mirror ? 'txtM' : 'txt';
    if (TX[key]) return TX[key];
    const cv = document.createElement('canvas'); cv.width = TW; cv.height = TH;
    const c = cv.getContext('2d');
    for (const k in TR) {
      const [x, y, w, h] = TR[k];
      c.save();
      if (mirror) { c.translate(x + w, y); c.scale(-1, 1); } else c.translate(x, y);
      c.beginPath(); c.rect(0, 0, w, h); c.clip();
      c.fillStyle = '#fff'; TDRAW[k](c, w, h);
      c.restore();
    }
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return (TX[key] = t);
  }
  // sergé de carbone (tube du tibia du H1)
  function carbonTex() {
    if (TX.cf) return TX.cf;
    const n = 64, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const c = cv.getContext('2d');
    for (let y = 0; y < n; y += 8) for (let x = 0; x < n; x += 8) {
      const k = ((x >> 3) + (y >> 3)) & 3, hz = k < 2;
      const gr = hz ? c.createLinearGradient(x, y, x, y + 8) : c.createLinearGradient(x, y, x + 8, y);
      gr.addColorStop(0, '#1c1e22'); gr.addColorStop(0.5, k & 1 ? '#4a4e56' : '#3a3d44'); gr.addColorStop(1, '#1c1e22');
      c.fillStyle = gr; c.fillRect(x, y, 8, 8);
    }
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return (TX.cf = t);
  }
  // livrée du R1 (atlas 1024² : blanc / bleu marine / rouge), régions [x, y, w, h] — u = 0,5 : avant de la pièce
  const AW = 1024;
  const LV = { tor: [0, 0, 512, 512], hel: [512, 0, 256, 256], thi: [768, 0, 256, 256], shi: [512, 256, 256, 256], ua: [768, 256, 256, 256] };
  const R1C = { white: '#eef0f3', navy: '#1e2b5c', red: '#c8132f' };
  function r1Livery() {
    if (TX.r1) return TX.r1;
    const cv = document.createElement('canvas'); cv.width = cv.height = AW;
    const c = cv.getContext('2d');
    c.fillStyle = R1C.white; c.fillRect(0, 0, AW, AW);
    const XY = (R, u, v) => [R[0] + u * R[2], R[1] + v * R[3]];
    const poly = (R, pts, col) => { c.fillStyle = col; c.beginPath(); pts.forEach(([u, v], i) => { const [x, y] = XY(R, u, v); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.fill(); };
    const box = (R, u0, v0, u1, v1, col) => { c.fillStyle = col; c.fillRect(R[0] + u0 * R[2], R[1] + v0 * R[3], (u1 - u0) * R[2], (v1 - v0) * R[3]); };
    // triangle (apex en bas si down) dessiné en unités « u-pixels », ky = rapport d'échelle v/u de la surface
    const tri = (R, u, v, w, h, ky, col, stroke, down = true) => {
      const [x, y] = XY(R, u, v);
      c.save(); c.translate(x, y); c.scale(1, ky); c.beginPath();
      const s = down ? 1 : -1;
      c.moveTo(-w / 2, -s * h / 2); c.lineTo(w / 2, -s * h / 2); c.lineTo(0, s * h / 2); c.closePath();
      if (stroke) { c.strokeStyle = col; c.lineWidth = stroke; c.lineJoin = 'round'; c.stroke(); } else { c.fillStyle = col; c.fill(); }
      c.restore();
    };
    // --- buste : corps marine, plastron blanc + panneaux hexagonaux (liserés marine), logo triangle rouge ---
    const RT = LV.tor;
    box(RT, 0, 0, 1, 1, R1C.navy);
    poly(RT, [[0.335, 0.03], [0.665, 0.03], [0.665, 0.42], [0.615, 0.42], [0.588, 0.475], [0.412, 0.475], [0.385, 0.42], [0.335, 0.42]], R1C.white);
    poly(RT, [[0.41, 0.5], [0.59, 0.5], [0.63, 0.59], [0.59, 0.68], [0.41, 0.68], [0.37, 0.59]], R1C.white);
    poly(RT, [[0.415, 0.71], [0.585, 0.71], [0.61, 0.76], [0.565, 0.92], [0.435, 0.92], [0.39, 0.76]], R1C.white);
    tri(RT, 0.5, 0.215, 40, 30, 2.05, R1C.red, 7);
    // évents noirs sur les flancs
    c.fillStyle = '#0d1022';
    for (const u of [0.2, 0.8]) for (let i = 0; i < 5; i++) { const [x, y] = XY(RT, u + (i % 2 ? 0.012 : -0.012), 0.6 + i * 0.035); c.beginPath(); c.ellipse(x, y, 2.6, 5.2, 0, 0, 7); c.fill(); }
    // --- casque : blanc, chevron rouge sur le dessus jusqu'au front, petit triangle blanc ---
    const RH = LV.hel;
    poly(RH, [[0.445, 0], [0.555, 0], [0.585, 0.21], [0.5, 0.29], [0.415, 0.21]], R1C.red);
    box(RH, 0, 0, 0.035, 0.1, R1C.red); box(RH, 0.965, 0, 1, 0.1, R1C.red);
    tri(RH, 0.5, 0.205, 18, 9, 1.6, R1C.white);
    c.strokeStyle = '#c3c8d0'; c.lineWidth = 1.5;
    for (const u of [0.26, 0.74]) { const [x0, y0] = XY(RH, u, 0.2), [x1, y1] = XY(RH, u + (u < 0.5 ? -0.02 : 0.02), 0.75); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
    // --- cuisse : blanche, deux colonnes de chevrons de danger rouges (avant) ---
    const RTh = LV.thi;
    c.fillStyle = R1C.red;
    for (const [u0, dir] of [[0.335, 1], [0.665, -1]]) for (let i = 0; i < 6; i++) {
      const [x, y] = XY(RTh, u0, 0.46 + i * 0.068);
      c.beginPath(); c.moveTo(x - 11 * dir, y); c.lineTo(x + 11 * dir, y - 7); c.lineTo(x + 11 * dir, y + 2); c.lineTo(x - 11 * dir, y + 9); c.closePath(); c.fill();
    }
    c.fillStyle = '#c3c8d0';
    for (const u of [0.42, 0.58]) { const [x, y] = XY(RTh, u, 0.12); c.beginPath(); c.arc(x, y, 2.2, 0, 7); c.fill(); }
    // --- tibia : avant blanc (protège-tibia), mollet marine, triangle rouge sous le genou ---
    const RS = LV.shi;
    box(RS, 0, 0, 0.3, 1, R1C.navy); box(RS, 0.7, 0, 1, 1, R1C.navy);
    poly(RS, [[0.3, 0], [0.335, 0], [0.335, 1], [0.3, 1]], '#c3c8d0'); poly(RS, [[0.665, 0], [0.7, 0], [0.7, 1], [0.665, 1]], '#c3c8d0');
    tri(RS, 0.5, 0.13, 16, 9, 1.5, R1C.red);
    // --- bras : blanc, bande rouge près du coude, petit triangle rouge à l'avant ---
    const RU = LV.ua;
    box(RU, 0, 0.76, 1, 0.82, R1C.red);
    box(RU, 0, 0.33, 1, 0.345, '#c3c8d0');
    tri(RU, 0.5, 0.17, 16, 9, 1.4, R1C.red);
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return (TX.r1 = t);
  }

  /* ---------- coques procédurales : lofts à sections super-elliptiques ----------
     section { y, x | xp (demi-épaisseur côté +X) / xn (côté -X), z | zp / zn, n (exposant : 2 ellipse, 3-4 carré
     arrondi, hérité de la section précédente), x0, z0 (décalage du centre) } ; interpolation Catmull-Rom.
     θ = angle autour de l'axe Y (0 = +X, 90° = +Z). UV : u = tour (θ0 → θ0 + 360°), v = long de Y (0 = 1re section). */
  const SKEYS = ['xp', 'xn', 'zp', 'zn', 'n', 'x0', 'z0'];
  function secs(list) {
    let n = 2.5;
    return list.map(s => {
      if (s.n != null) n = s.n;
      return { y: s.y, xp: s.xp != null ? s.xp : s.x, xn: s.xn != null ? s.xn : s.x, zp: s.zp != null ? s.zp : s.z, zn: s.zn != null ? s.zn : s.z, n, x0: s.x0 || 0, z0: s.z0 || 0 };
    });
  }
  const crs = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
  function dimsAt(tab, y) {
    const n = tab.length;
    if (y <= tab[0].y) return tab[0];
    if (y >= tab[n - 1].y) return tab[n - 1];
    let i = 0; while (i < n - 2 && tab[i + 1].y < y) i++;
    const a = tab[i], b = tab[i + 1], t = (y - a.y) / (b.y - a.y), p0 = tab[Math.max(0, i - 1)], p3 = tab[Math.min(n - 1, i + 2)];
    const o = { y };
    for (const k of SKEYS) o[k] = crs(p0[k], a[k], b[k], p3[k], t);
    for (const k of ['xp', 'xn', 'zp', 'zn']) o[k] = Math.max(0.05, o[k]);
    o.n = Math.max(1.6, o.n);
    return o;
  }
  function ringPt(d, th, off = 0) {
    const c = Math.cos(th), s = Math.sin(th), e = 2 / d.n;
    return [d.x0 + Math.sign(c) * Math.pow(Math.abs(c), e) * ((c >= 0 ? d.xp : d.xn) + off),
      d.z0 + Math.sign(s) * Math.pow(Math.abs(s), e) * ((s >= 0 ? d.zp : d.zn) + off)];
  }
  // abscisse de la surface avant (+X) au point (y, z)
  function surfX(tab, y, z, off = 0) {
    const d = dimsAt(tab, y), zz = z - d.z0, R = (zz >= 0 ? d.zp : d.zn) + off;
    const t = Math.min(1, Math.abs(zz) / R);
    return d.x0 + (d.xp + off) * Math.pow(Math.max(0, 1 - Math.pow(t, d.n)), 1 / d.n);
  }
  // o : nu (segments autour), sub (rangées par intervalle), th0, rect (région de la livrée), flipU, vflip, capB/capT (false = ouvert)
  function loft(key, list, o = {}) {
    if (GC[key]) return GC[key];
    const tab = secs(list), nu = o.nu || 32, sub = o.sub || 3, th0 = o.th0 || 0, R = o.rect, W = nu + 1;
    const ys = [];
    for (let i = 0; i < tab.length - 1; i++) for (let j = 0; j < sub; j++) ys.push(tab[i].y + (tab[i + 1].y - tab[i].y) * j / sub);
    ys.push(tab[tab.length - 1].y);
    const y0 = ys[0], y1 = ys[ys.length - 1], nr = ys.length;
    const UV = (u, v) => { if (o.flipU) u = 1 - u; if (o.vflip) v = 1 - v; return R ? [(R[0] + u * R[2]) / AW, 1 - (R[1] + v * R[3]) / AW] : [u, v]; };
    const pos = [], uv = [], idx = [];
    for (const y of ys) {
      const d = dimsAt(tab, y);
      for (let i = 0; i <= nu; i++) { const p = ringPt(d, th0 + 2 * PI * i / nu); pos.push(p[0], y, p[1]); uv.push(...UV(i / nu, (y - y0) / (y1 - y0))); }
    }
    for (let j = 0; j < nr - 1; j++) for (let i = 0; i < nu; i++) { const a = j * W + i, b = a + 1, c = a + W + 1, d = a + W; idx.push(a, c, b, a, d, c); }
    const cap = (j, down) => {
      const d = dimsAt(tab, ys[j]), base = pos.length / 3;
      pos.push(d.x0, ys[j], d.z0); uv.push(...UV(0.5, j ? 1 : 0));
      for (let i = 0; i <= nu; i++) { const k = j * W + i; pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]); uv.push(uv[k * 2], uv[k * 2 + 1]); }
      for (let i = 0; i < nu; i++) { const a = base + 1 + i; if (down) idx.push(base, a, a + 1); else idx.push(base, a + 1, a); }
    };
    if (o.capB !== false) cap(0, true);
    if (o.capT !== false) cap(nr - 1, false);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const nm = geo.attributes.normal; // couture : normales moyennées
    for (let j = 0; j < nr; j++) {
      const a = j * W, b = a + nu, x = nm.getX(a) + nm.getX(b), y = nm.getY(a) + nm.getY(b), z = nm.getZ(a) + nm.getZ(b), l = Math.hypot(x, y, z) || 1;
      nm.setXYZ(a, x / l, y / l, z / l); nm.setXYZ(b, x / l, y / l, z / l);
    }
    return (GC[key] = geo);
  }
  // inverse l'ordre des triangles si la normale du 1er triangle ne va pas dans le sens voulu (want · n < 0)
  function orient(pos, idx, want) {
    const p = i => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    const [a, b, c] = [p(idx[0]), p(idx[1]), p(idx[2])];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  }
  // décalcomanie épousant un loft : θ de thA (gauche du lecteur) à thB, y de yA (haut du motif) à yB ; R = région de l'atlas texte
  function patch(key, list, thA, thB, yA, yB, off, R, nu = 10, nv = 4) {
    if (GC[key]) return GC[key];
    const tab = secs(list), pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) {
      const y = yA + (yB - yA) * j / nv, d = dimsAt(tab, y);
      for (let i = 0; i <= nu; i++) {
        const p = ringPt(d, thA + (thB - thA) * i / nu, off); pos.push(p[0], y, p[1]);
        const u = i / nu, v = j / nv; uv.push((R[0] + u * R[2]) / TW, 1 - (R[1] + v * R[3]) / TH);
      }
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1; idx.push(a, c, b, a, d, c); }
    const dm = dimsAt(tab, (yA + yB) / 2), pm = ringPt(dm, (thA + thB) / 2);
    orient(pos, idx, [pm[0] - dm.x0, 0, pm[1] - dm.z0]);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return (GC[key] = geo);
  }
  // point du contour ovale (super-ellipse d'exposant m) posé sur la face avant (+X) d'un loft
  const ovalPt = (tab, yc, ry, rz, m, off, rho, f) => {
    const c = Math.cos(f), s = Math.sin(f), e = 2 / m;
    const z = rz * rho * Math.sign(c) * Math.pow(Math.abs(c), e), y = yc + ry * rho * Math.sign(s) * Math.pow(Math.abs(s), e);
    return [surfX(tab, y, z, off), y, z];
  };
  function oval(key, list, yc, ry, rz, m, off, nf = 36, nr = 5) {
    if (GC[key]) return GC[key];
    const tab = secs(list), pos = [...ovalPt(tab, yc, ry, rz, m, off, 0, 0)], idx = [];
    for (let r = 1; r <= nr; r++) for (let i = 0; i < nf; i++) pos.push(...ovalPt(tab, yc, ry, rz, m, off, r / nr, 2 * PI * i / nf));
    for (let i = 0; i < nf; i++) idx.push(0, 1 + i, 1 + (i + 1) % nf);
    for (let r = 1; r < nr; r++) for (let i = 0; i < nf; i++) { const a = 1 + (r - 1) * nf + i, b = 1 + (r - 1) * nf + (i + 1) % nf; idx.push(a, a + nf, b + nf, a, b + nf, b); }
    orient(pos, idx, [1, 0, 0]);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    return (GC[key] = geo);
  }
  function ovalRing(key, list, yc, ry, rz, m, off, r, seg = 64, rseg = 6) {
    if (GC[key]) return GC[key];
    const tab = secs(list), pts = [];
    for (let i = 0; i < seg; i++) pts.push(new T.Vector3(...ovalPt(tab, yc, ry, rz, m, off, 1, 2 * PI * i / seg)));
    return (GC[key] = new T.TubeGeometry(new T.CatmullRomCurve3(pts, true), seg, r, rseg, true));
  }
  // plaque plane (face +Z) portant une région de l'atlas texte
  function plateGeo(key, w, h, R) {
    if (GC[key]) return GC[key];
    const geo = new T.PlaneGeometry(w, h), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (R[0] + uv.getX(i) * R[2]) / TW, 1 - (R[1] + (1 - uv.getY(i)) * R[3]) / TH);
    return (GC[key] = geo);
  }

  /* ---------- main : manchette de poignet + paume + 4 doigts articulés + pouce ----------
     repère : origine = poignet, +X = prolongement de l'avant-bras, paume côté -Y, side = +1 ('f') / -1 ('b')
     Mt : { cuff, ring, flange, palm, back, pad, knuck, f0, f1 } ; k : échelle */
  const FL = [3.7, 3.0], FW = 1.62, FT = 2.15, PX = 3.6, PL = 6.4, PW = 7.0;
  const phal = (Lp, t, w, tip) => fuse(`h1phal${Lp},${t},${w},${tip}`, [
    [RK.g.cbox(Lp, t, w, 0.38), [Lp / 2, 0, 0]],
    [RK.g.cyl(t * 0.5, t * 0.5, w * 0.96, 10, 'z'), [0, 0, 0]],
    ...(tip ? [[RK.g.cyl(t * 0.5, t * 0.5, w * 0.92, 10, 'z'), [Lp, -0.02, 0]]] : [])
  ]);
  const XV = new T.Vector3(1, 0, 0);
  function makeHand(ctx, side, Mt, k = 1) {
    const g = RK.g, root = ctx.group();
    const add = (parent, geo, mat, p, r, s) => ctx.add(parent, geo, mat, { p, r, s });
    if (k !== 1) root.scale.setScalar(k);
    if (ctx.lod === 'low') { add(root, g.cbox(11, 4.8, 7.2, 1.2), Mt.palm, [5.5, -0.5, 0]); root.userData.setCurl = () => {}; return root; }
    add(root, g.lathe([[0, -3.2], [2.35, -3.2], [2.75, -1.2], [2.95, 0.6], [2.95, 1.6], [0, 1.6]], 24, 'x'), Mt.cuff, [0, 0, 0]);
    add(root, g.cyl(3.05, 3.05, 0.9, 28, 'x'), Mt.ring, [2.0, 0, 0]);
    add(root, g.ccyl(2.75, 1.2, 0.3, 24, 'x'), Mt.flange, [3.0, 0, 0]);
    add(root, g.cbox(PL, 3.6, PW, 0.8), Mt.palm, [PX + PL / 2, -0.2, 0]);
    add(root, g.cbox(PL - 1.2, 0.7, PW - 1.4, 0.28), Mt.back, [PX + PL / 2 - 0.2, 1.75, 0]);
    add(root, g.cbox(PL - 1.6, 0.5, PW - 1.6, 0.2), Mt.pad, [PX + PL / 2 + 0.2, -2.05, 0]);
    add(root, fuse('h1knuck', [0, 1, 2, 3].map(i => [g.cyl(1.05, 1.05, 1.5, 10, 'z'), [PX + PL + 0.2, 0.15, ((i + 0.5) / 4 - 0.5) * 6.7]])), Mt.knuck);
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const zz = ((i + 0.5) / 4 - 0.5) * 6.7 * side, kk = [0.94, 1, 0.97, 0.86][i];
      let parent = root; const segs = [];
      for (let j = 0; j < 2; j++) {
        const piv = ctx.group(); piv.userData.noMerge = true;
        if (j === 0) piv.position.set(PX + PL + 0.4, 0, zz); else piv.position.set(+(FL[0] * kk).toFixed(2), 0, 0);
        const Lp = +(FL[j] * kk).toFixed(2);
        add(piv, phal(Lp, FT - j * 0.15, FW, j === 1), j ? Mt.f1 : Mt.f0);
        if (j === 1) add(piv, g.cbox(1.4, 0.5, FW * 0.82, 0.15), Mt.pad, [Lp - 0.6, -0.95, 0]);
        parent.add(piv); parent = piv; segs.push(piv);
      }
      fingers.push(segs);
    }
    // pouce : la direction passe de « ouvert » (vers l'avant, écarté) à « fermé » (en travers devant les doigts)
    const t0 = ctx.group(); t0.position.set(PX + 1.6, -1.7, -side * 3.2); t0.userData.noMerge = true;
    add(t0, phal(3.6, 2.2, 1.9, false), Mt.f0);
    const t1 = ctx.group(); t1.position.set(3.6, 0, 0); t0.add(t1);
    add(t1, phal(2.8, 2.0, 1.8, true), Mt.f1);
    root.add(t0);
    const dOpen = new T.Vector3(0.8, -0.3, -side * 0.52).normalize(), dShut = new T.Vector3(0.86, -0.3, side * 0.42).normalize(), dv = new T.Vector3();
    root.userData.setCurl = c => {
      for (const sg of fingers) { sg[0].rotation.z = -(6 + 86 * c) * D; sg[1].rotation.z = -(8 + 98 * c) * D; }
      dv.copy(dOpen).lerp(dShut, c).normalize();
      t0.quaternion.setFromUnitVectors(XV, dv);
      t1.rotation.z = -(6 + 16 * c) * D; t1.rotation.y = side * 22 * c * D;
    };
    root.userData.setCurl(1);
    return root;
  }
  // matériaux des marquages (atlas texte, teinte = couleur) : échangés contre l'atlas miroir quand face < 0
  const DECP = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };
  function decalMat(ctx, color) {
    const m = ctx.mat(Object.assign({ color, map: ctx.override ? null : txtAtlas(false), roughness: 0.45, metalness: 0, clearcoat: 0.3, envMapIntensity: 0.3 }, DECP));
    return m;
  }
  const mirrorDecals = (list, face) => {
    const A = face < 0 ? txtAtlas(true) : txtAtlas(false);
    for (const m of list) if (m.map && m.map !== A) m.map = A;
  };
  const meshCount = (P) => { let n = 0; for (const k in P) P[k].traverse(o => { if (o.isMesh) n++; }); return n; };

  /* =====================================================
     SKIN 'classic' : UNITREE H1 (CAO)
     ===================================================== */
  function buildH1(ctx) {
    const R = ctx.realData('h1');
    if (!R) return RK.models.default(ctx);
    const { g, M, L, ch } = ctx;
    const low = ctx.lod === 'low';
    const B = R.bodies;
    const P = {};
    const add = (parent, geo, mat, p, r, s) => ctx.add(parent, geo, mat, { p, r, s });

    /* ---------- matériaux ---------- */
    const ANO = ctx.mat({ color: 0x474c55, roughness: 0.36, metalness: 0.72, clearcoat: 0.55, clearcoatRoughness: 0.22, envMapIntensity: 1.15 }); // alu anodisé graphite (membres)
    const EDG = ctx.mat({ color: 0x9da4ae, roughness: 0.2, metalness: 1, clearcoat: 0.6, clearcoatRoughness: 0.1, envMapIntensity: 1.3 });   // arêtes / chanfreins usinés (alu brillant)
    const BLK = ctx.mat({ color: 0x23262c, roughness: 0.3, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.15 }); // coques noir satiné anodisé
    const MOT = ctx.mat({ color: 0x4b5058, roughness: 0.33, metalness: 0.86, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 0.95 }); // carters moteurs gris métal
    const BOX = ctx.mat({ color: 0x2b2f36, roughness: 0.34, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.2 }); // coffre graphite satiné
    const PEL = ctx.mat({ color: 0x272a30, roughness: 0.42, metalness: 0.6, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.85 }); // bassin graphite
    const RIM = ctx.mat({ color: 0x8e949d, roughness: 0.22, metalness: 1, envMapIntensity: 1.1 });                                        // bague usinée
    const CF = ctx.mat({ color: 0xffffff, map: ctx.override ? null : carbonTex(), roughness: 0.3, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.9 }); // carbone
    const ST = M.steel, CH = M.chrome, RU = M.rubber, VI = M.visor, WH = M.white;
    const LED = ctx.glow(ch.accent, 3.2);
    const DECW = low ? null : decalMat(ctx, 0xf2f4f7);

    /* ---------- échelles (réel cm → unités de conception) ---------- */
    const k = 0.88, kA = 0.97, kF = 1.0, kH = 1.0;
    const hipP = [B.right_hip_pitch_link[0], B.right_hip_pitch_link[1], 0];
    const shR = B.right_shoulder_roll_link;
    const box0 = 106;                                        // bas du coffre (origine torso_link)
    const yBox = (box0 - hipP[1]) * k;                       // bas du coffre dans le repère du torse
    const sy = (0.86 * L.to - yBox) / (k * (shR[1] - box0)); // tassement du coffre : épaules réelles → épaules du squelette
    const yTop = yBox + (153.5 - box0) * k * sy;             // dessus du coffre
    const NB = [0, 153.5 + (L.to - yTop) / kH, 0];           // point réel placé à la base du cou
    const HB = [0, NB[1] + L.nk / kH, 0];                    // point réel placé au centre de la tête
    const shZ = shR[2] * k, hpZ = B.right_hip_pitch_link[2] * k;

    const TORSO_O = { pivot: [0, box0, 0], k, s: [1, sy, 1], p: [0, yBox, 0], flat: 0.996 };
    const NECK_O = { pivot: NB, k: kH, crease: 50 }, HEAD_O = { pivot: HB, k: kH, crease: 50 };

    // groupe dont le repère local = espace réel (cm), placé comme ctx.real(…, o)
    const realGroup = (o) => { const gr = new T.Group(); gr.matrixAutoUpdate = false; gr.matrix.copy(ctx.realMatrix(o)); return gr; };
    // pièce réelle découpée en matériaux : cls(cx,cy,cz,nx,ny,nz,kf) -> clé ; mats : clé -> matériau
    const realSplit = (name, key, cls, mats, o, uvf) => {
      const src = ctx.real('h1', name, ANO, o);
      const m0 = src.children[0];
      if (!m0) return src;
      const ck = name + '|' + ctx.lod + '|' + key + '|' + (o.crease || 32) + '|' + (o.flat || 0);
      const parts = SPLIT[ck] || (SPLIT[ck] = splitGeo(m0.geometry, cls, o.flat, uvf));
      const gr = ctx.group();
      for (const c in parts) {
        const mt = mats[c]; if (!mt) continue;
        const m = new T.Mesh(parts[c], mt); m.matrixAutoUpdate = false; m.matrix.copy(m0.matrix); gr.add(m);
      }
      return gr;
    };

    // pièce réelle : coque graphite + chanfreins plans obliques (latéraux) en alu usiné brillant
    const EDGE = (x, y, z, nx, ny, nz, kf) => {
      const az = Math.abs(nz);
      return kf > 0.995 && az > 0.3 && az < 0.86 && Math.abs(ny) < 0.75 ? 'e' : 'a';
    };
    const realPart = (names, mat, o, edge = EDG) => {
      const gr = ctx.group();
      for (const n of [].concat(names)) gr.add(realSplit(n, low ? 'one' : 'edge', low ? () => 'a' : EDGE, { a: mat, e: edge }, Object.assign({ flat: 0.997 }, o)));
      return gr;
    };

    /* ---------- moteur à disque (coordonnées réelles) ----------
       c : centre ; ax : axe 'x'|'y'|'z' ; r : rayon ; a0..a1 : étendue le long de l'axe ;
       faces : [-1] / [1] / [-1, 1] = faces usinées visibles ; o.n : nb de vis ; o.body : matériau du carter */
    const AXI = { x: 0, y: 1, z: 2 };
    const ROT_FLIP = { x: [0, 0, PI], y: [PI, 0, 0], z: [PI, 0, 0] };
    const faceGeo = (r, ax) => g.lathe([[r * 0.47, 0.32], [r * 0.5, 0], [r * 0.92, 0], [r * 0.92, 0.18], [r * 0.85, 0.36], [r * 0.5, 0.36]], 28, ax);
    function motor(gr, c, ax, r, a0, a1, faces, o = {}) {
      const i = AXI[ax], len = a1 - a0;
      const at = (a) => { const p = c.slice(); p[i] = a; return p; };
      if (o.body !== null) add(gr, g.ccyl(r, len, Math.min(0.45, r * 0.08), 28, ax), o.body || MOT, at((a0 + a1) / 2));
      for (const sg of faces) {
        const af = sg > 0 ? a1 : a0, rot = sg > 0 ? [0, 0, 0] : ROT_FLIP[ax];
        add(gr, faceGeo(r, ax), o.ring || ST, at(af), rot);
        // fines stries d'usinage (2 filets) sur la face
        add(gr, machRings(+(r * 0.6).toFixed(2), +(r * 0.74).toFixed(2), ax), RIM, at(af + sg * 0.38), rot);
        if (o.n !== 0) add(gr, boltRing(o.n || 6, +(r * 0.69).toFixed(2), 0.27, 0.55, ax), CH, at(af), rot);
        add(gr, g.cyl(r * 0.47, r * 0.47, 0.5, 20, ax), o.hub || RIM, at(af));
        add(gr, g.cyl(r * 0.17, r * 0.17, 1.0, 10, ax), CH, at(af));
      }
    }
    const machRings = (r1, r2, ax) => fuse(`h1mach${r1},${r2},${ax}`, [[g.lathe([[r1 + 0.12, 0], [r1, 0]], 24, ax)], [g.lathe([[r2 + 0.12, 0], [r2, 0]], 24, ax)]]);
    const boltRing = (n, Rr, r, h, ax) => fuse(`h1bolts${n},${Rr},${r},${h},${ax}`, Array.from({ length: n }, (_, i) => {
      const a = (i + 0.5) / n * 2 * PI, p = [0, 0, 0];
      const o = [0, 1, 2].filter(j => j !== AXI[ax]);
      p[o[0]] = Math.cos(a) * Rr; p[o[1]] = Math.sin(a) * Rr; p[AXI[ax]] = h / 2;
      return [g.cyl(r, r, h, 5, ax), p];
    }));

    /* =====================================================
       TORSE : coffre, bassin, liaisons de hanche (lacet / roulis)
       ===================================================== */
    const torso = ctx.group();
    const clsTorso = (x, y, z, nx, ny, nz) => {
      if (y > 171.4 && y < 174.4 && x > 0 && x < 6 && Math.abs(z) < 2.9) return 'dome';
      if (y > 172.4 && y < 175.2 && x > 8.8 && x < 11.9 && Math.abs(z) < 5 && nx > 0.45) return 'slot';
      if (y > 174.5) return 'helmet';
      if (y > 153.6) return 'neck';
      if (Math.abs(z) > 10.6 && y > 141.5 && y < 155.5) return z > 0 ? 'shf' : 'shb';
      if (y < 110.6) return 'base';
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      if (ax > 0.2 && az > 0.2 && ax < 0.98 && az < 0.98) return 'edge';
      if (ay > 0.25 && ay < 0.97 && (ax > 0.25 || az > 0.25)) return 'edge';
      return 'box';
    };
    torso.add(realSplit('torso_link', 'parts', clsTorso, { box: BOX, edge: EDG, base: MOT }, TORSO_O));
    torso.add(realPart('pelvis', PEL, { pivot: [0, hipP[1], 0], k }));
    for (const [sd, s, z] of [['f', 'right', 1], ['b', 'left', -1]]) {
      const dx = sd === 'f' ? 1.8 : -1.8, HO = { pivot: hipP, k, p: [dx, 0, 0] };
      torso.add(realPart([s + '_hip_yaw_link', s + '_hip_roll_link'], ANO, HO));
      if (!low) {
        const hg = realGroup(HO); torso.add(hg);
        // moteur de tangage de hanche (face usinée côté intérieur)
        const zi = z * 2.8, zo = z * 10.6;
        motor(hg, [hipP[0], hipP[1], 0], 'z', 6.55, Math.min(zi, zo), Math.max(zi, zo), sd === 'b' ? [1] : []);
        // moteur de roulis de hanche (axe avant-arrière, face usinée à l'arrière)
        motor(hg, [0, 88.6, z * 8.75], 'x', 5.45, -10.25, -3.2, [-1], { n: 0 });
      }
    }
    let LOGO = null;
    if (!low) {
      // logo « Unitree H1 » (avant + dos), retourné selon le sens du combattant pour rester lisible
      LOGO = ctx.group(ctx.real('h1', 'logo_link', WH, TORSO_O));
      LOGO.userData.noMerge = true; torso.add(LOGO);
      // voyants d'état sur les flancs du coffre
      const tg = realGroup(TORSO_O); torso.add(tg);
      for (const z of [1, -1]) for (const [y, x] of [[131.5, 4.6], [129.6, 4.6]]) add(tg, g.cyl(0.36, 0.36, 0.3, 12, 'z'), LED, [x, y, z * 10.62]);
      add(tg, g.cbox(0.5, 0.42, 4.2, 0.12), LED, [7.36, 109.2, 0]); // filet lumineux bas du coffre
      // chanfreins usinés (alu brillant) sur les 4 arêtes verticales du coffre
      for (const sx of [1, -1]) for (const sz of [1, -1]) add(tg, g.box(0.55, 29, 0.55), EDG, [sx * 7.08, 125.6, sz * 10.28], [0, PI / 4, 0]);
    }
    P.torso = torso;

    /* ---------- cou (béquille en A + anneau facial + casque) et tête (capteurs) ---------- */
    P.neck = realSplit('torso_link', 'parts', clsTorso, { neck: BLK }, NECK_O);
    {
      const h = ctx.group();
      h.add(realSplit('torso_link', 'parts', clsTorso, { helmet: BLK, dome: VI, slot: VI }, HEAD_O));
      if (!low) {
        const hg = realGroup(HEAD_O); h.add(hg);
        // dôme du lidar / caméra sous le casque
        add(hg, g.sphere(2.45, 28, 14, 0, 2 * PI, PI / 2, PI / 2), VI, [3.0, 174.3, 0]);
        add(hg, g.torus(2.45, 0.22, 32, 6, 2 * PI, 'y'), EDG, [3.0, 174.2, 0]);
        // voyant d'état dans la fente de la caméra de profondeur
        add(hg, g.cyl(0.38, 0.38, 0.3, 12, 'x'), LED, [11.0, 173.9, 3.4]);
      }
      P.head = h;
    }

    /* =====================================================
       BRAS / JAMBES
       ===================================================== */
    const HMT = { cuff: MOT, ring: ST, flange: RIM, palm: ANO, back: BLK, pad: RU, knuck: RIM, f0: ANO, f1: BLK };
    for (const [sd, s, z] of [['f', 'right', 1], ['b', 'left', -1]]) {
      const sh = B[s + '_shoulder_roll_link'], el = B[s + '_elbow_link'], hp = B[s + '_hip_pitch_link'], kn = B[s + '_knee_link'], an = B[s + '_ankle_link'];
      // épaule : carter du moteur de tangage (fixé au coffre)
      const SC_O = { pivot: [0, sh[1], sh[2]], k, s: [1, sy, 1] };
      P[sd + 'sc'] = realSplit('torso_link', 'parts', clsTorso, { ['sh' + sd]: MOT }, SC_O);
      // bras : moteur de roulis + étrier (moteur de lacet) + bras (moteur de coude)
      const UA_O = { pivot: sh, to: el, len: L.ua, frame: 'limb', k: kA };
      const ua = realPart([s + '_shoulder_pitch_link', s + '_shoulder_roll_link', s + '_shoulder_yaw_link'], ANO, UA_O);
      // tube du bras entre le moteur de roulis et le haut du maillage de lacet (ce tronçon, y 124..145, a été perdu
      // à la décimation de la CAO) : tube anodisé légèrement aplati, comme sur le vrai H1
      const tg = realGroup(UA_O); ua.add(tg);
      add(tg, g.cyl(3.5, 3.3, 22, low ? 8 : 20, 'y'), ANO, [1.2, 134.5, sh[2]], null, [1, 1, 0.88]);
      if (!low) {
        const ag = realGroup(UA_O); ua.add(ag);
        add(ag, g.torus(3.45, 0.32, 24, 6, 2 * PI, 'y'), RIM, [1.2, 124.6, sh[2]]);          // bague de jonction
        add(ag, g.torus(3.6, 0.32, 24, 6, 2 * PI, 'y'), RIM, [1.2, 145.0, sh[2]]);
        motor(ag, [0, sh[1], sh[2]], 'x', 4.95, -3.55, 3.55, [1], { n: 6 });                     // roulis d'épaule
        motor(ag, [0, 138.6, sh[2]], 'y', 4.95, 136.1, 141.1, []);                              // lacet d'épaule
        motor(ag, [el[0], el[1], sh[2]], 'z', 4.95, z > 0 ? 18.5 : -23.9, z > 0 ? 23.9 : -18.5, [1], { n: 6 }); // coude
      }
      P[sd + 'ua'] = ua;
      // avant-bras : tête de coude (non étirée) + tube étiré jusqu'au poignet ; le pommeau d'extrémité est remplacé par la manchette de la main
      const wr = [30.5, 114.8, el[2]];
      const FA_O = { pivot: el, to: wr, frame: 'limb', k: kA };
      const st = (L.fa - kA * (30.5 - 27.9) - kA * (6 - el[0])) / (kA * (27.9 - 6));
      const FT_O = Object.assign({}, FA_O, { s: [1, st, 1], p: [0, kA * (6 - el[0]) * (1 - st), 0] });
      const clsFA = (x) => x < 6 ? 'prox' : x < 27.9 ? 'tube' : 'knob';
      P[sd + 'fa'] = ctx.group(
        realSplit(s + '_elbow_link', 'fa', clsFA, { prox: ANO }, FA_O),
        realSplit(s + '_elbow_link', 'fa', clsFA, { tube: ANO }, FT_O));
      // main (le pommeau réel de l'extrémité est remplacé par une manchette de poignet)
      P[sd + 'ha'] = makeHand(ctx, z, HMT);
      // jambe
      const TH_O = { pivot: hp, to: kn, len: L.th, frame: 'limb', k };
      const th = realPart(s + '_hip_pitch_link', ANO, TH_O);
      if (!low) {
        const tg2 = realGroup(TH_O); th.add(tg2);
        motor(tg2, [hipP[0], hipP[1], 0], 'z', 4.4, z * 23.25, z * 23.25, [z], { body: null, n: 6 });
        // marquage « UNITREE H1 » vertical sur le flanc plat de la cuisse (lecture de bas en haut)
        add(tg2, plateGeo('h1uniT', 13, 2.0, TR.UNI), DECW, [6.7, 66.5, z * 22.42], z > 0 ? [0, 0, PI / 2] : [0, PI, PI / 2]);
      }
      P[sd + 'th'] = th;
      // tibia : tube en carbone (y 5..30.5), tête de genou et moteur de cheville en graphite
      const SH_O = { pivot: kn, to: an, len: L.sh, frame: 'limb', k };
      const clsShin = low ? () => 'a' : (x, y, z2, nx, ny, nz, kf) => (y > 5 && y < 30.5 ? 'c' : EDGE(x, y, z2, nx, ny, nz, kf));
      const shin = realSplit(s + '_knee_link', low ? 'one' : 'cf', clsShin, { a: ANO, e: EDG, c: low ? ANO : CF }, Object.assign({ flat: 0.997 }, SH_O),
        low ? null : (x, y, z2) => [(x * 0.8 + z2 * 0.6) / 4.5, y / 4.5]);
      if (!low) {
        const sg = realGroup(SH_O); shin.add(sg);
        motor(sg, [2.95, 37.1, 0], 'z', 4.85, z > 0 ? 15.4 : -23.9, z > 0 ? 23.9 : -15.4, [1], { n: 6 }); // moteur de cheville
        motor(sg, [kn[0], kn[1], 0], 'z', 2.2, z * 23.3, z * 23.3, [z], { body: null, n: 0 });                     // axe de genou
      }
      P[sd + 'sh'] = shin;
      P[sd + 'fo'] = realSplit(s + '_ankle_link', 'foot', (x, y, z, nx, ny) => y < 2.6 && ny < -0.6 ? 'sole' : 'foot', { foot: ANO, sole: RU }, { pivot: an, k: kF });
    }

    if (typeof window !== 'undefined' && window.__report && !low) window.__report.h1MeshesBeforeMerge = meshCount(P);
    const tick = ctx.override ? undefined : (t, state) => {
      if (LOGO && state && state.face) LOGO.scale.z = state.face;
      if (DECW && state) mirrorDecals([DECW], state.face);
      const sup = state && (state.st === 'super' || state.st === 'special');
      LED.emissiveIntensity = LED.userData.baseI * ((sup ? 1.6 : 0.85) + 0.15 * Math.sin(t * 3.1));
    };
    return { parts: P, shZ, hpZ, tick };
  }

  /* =====================================================
     SKINS 'g1' / 'r1' : coques procédurales sur le squelette du H1
     ===================================================== */
  // profils (unités de conception ; membres : avant = -X → xn, arrière = +X → xp)
  const PRO = {
    g1: {
      pel: [{ y: -8, x: 5.2, z: 5.6, n: 2.6 }, { y: -5.5, xp: 7.6, xn: 7.0, z: 9.2 }, { y: 1.5, xp: 8.5, xn: 7.8, z: 10.2, n: 3.0 }, { y: 7, xp: 8.2, xn: 7.6, z: 9.8 }, { y: 9, xp: 7.2, xn: 7.0, z: 8.6 }],
      ch: [{ y: 18.2, xp: 7.6, xn: 7.4, z: 9.6, n: 3.0 }, { y: 21, xp: 9.0, xn: 8.8, z: 11.4, n: 3.4 }, { y: 32, xp: 9.9, xn: 9.4, z: 12.4 }, { y: 46, xp: 10.3, xn: 9.6, z: 13.2 },
        { y: 54.5, xp: 9.6, xn: 9.2, z: 12.8 }, { y: 58.2, xp: 7.4, xn: 7.4, z: 10.2, n: 3.0 }, { y: 59.6, xp: 4.0, xn: 4.0, z: 6.0 }],
      head: [{ y: -9.6, xp: 3.2, xn: 3.4, z: 3.0, n: 2.2 }, { y: -8.0, xp: 6.0, xn: 5.4, z: 5.2 }, { y: -4, xp: 7.7, xn: 6.9, z: 6.6, n: 2.4 }, { y: 1, xp: 8.3, xn: 7.4, z: 7.1 },
        { y: 5.2, xp: 7.9, xn: 7.2, z: 6.9 }, { y: 8.3, xp: 6.2, xn: 6.0, z: 5.8 }, { y: 10.2, xp: 3.3, xn: 3.4, z: 3.2 }, { y: 10.9, xp: 0.8, xn: 0.8, z: 0.8 }],
      ua: [{ y: 8, x: 4.5, z: 4.4, n: 2.4 }, { y: 12, x: 5.0, z: 4.8 }, { y: 20, x: 4.8, z: 4.6 }, { y: 26, x: 4.3, z: 4.2 }, { y: 28.2, x: 3.5, z: 3.5 }],
      fa: [{ y: 3.6, x: 3.5, z: 3.7, n: 2.4 }, { y: 7, x: 4.4, z: 4.3 }, { y: 15, x: 4.1, z: 4.0 }, { y: 24, x: 3.3, z: 3.4 }, { y: 26, x: 2.9, z: 3.0 }],
      th: [{ y: 3.5, xp: 5.0, xn: 5.6, z: 5.6, n: 2.6 }, { y: 8, xp: 6.0, xn: 7.0, z: 6.5 }, { y: 16, xp: 5.9, xn: 7.0, z: 6.5 }, { y: 25, xp: 5.2, xn: 6.0, z: 5.7 },
        { y: 31, xp: 4.6, xn: 5.0, z: 5.0 }, { y: 33.4, xp: 3.6, xn: 3.8, z: 4.0 }],
      sh: [{ y: 4, xp: 4.6, xn: 4.2, z: 4.6, n: 2.5 }, { y: 8, xp: 5.8, xn: 4.6, z: 5.0 }, { y: 16, xp: 5.4, xn: 4.2, z: 4.7 }, { y: 24, xp: 4.0, xn: 3.4, z: 3.8 },
        { y: 28.4, xp: 3.0, xn: 2.8, z: 3.0 }]
    },
    r1: {
      pel: [{ y: -8.4, x: 5.0, z: 5.8, n: 2.6 }, { y: -5.5, xp: 8.0, xn: 7.4, z: 9.8 }, { y: 2, xp: 9.0, xn: 8.2, z: 11.0, n: 3.0 }, { y: 8, xp: 8.6, xn: 8.0, z: 10.6 }, { y: 10, xp: 7.4, xn: 7.2, z: 9.4 }],
      ch: [{ y: 18.6, xp: 8.4, xn: 8.2, z: 10.8, n: 3.2 }, { y: 21.5, xp: 9.8, xn: 9.4, z: 12.4, n: 3.6 }, { y: 32, xp: 10.5, xn: 10.0, z: 13.2 }, { y: 46, xp: 10.9, xn: 10.2, z: 13.9 },
        { y: 54.8, xp: 10.2, xn: 9.8, z: 13.4 }, { y: 58.4, xp: 8.0, xn: 8.0, z: 10.8, n: 3.0 }, { y: 59.9, xp: 4.4, xn: 4.4, z: 6.2 }],
      head: [{ y: -10.0, xp: 4.0, xn: 4.2, z: 4.0, n: 2.3 }, { y: -8.4, xp: 7.0, xn: 6.6, z: 6.6 }, { y: -4, xp: 8.6, xn: 7.8, z: 7.8 }, { y: 1.5, xp: 9.0, xn: 8.4, z: 8.2 },
        { y: 6, xp: 8.4, xn: 8.0, z: 7.8 }, { y: 9.2, xp: 6.2, xn: 6.0, z: 5.8 }, { y: 11.0, xp: 3.0, xn: 3.0, z: 2.8 }, { y: 11.6, xp: 0.6, xn: 0.6, z: 0.6 }],
      ua: [{ y: 5, x: 5.3, z: 5.3, n: 2.4 }, { y: 10, x: 5.6, z: 5.5 }, { y: 24, x: 5.2, z: 5.2 }, { y: 28.5, x: 4.6, z: 4.7 }, { y: 30, x: 3.8, z: 3.9 }],
      fa: [{ y: 3, x: 4.4, z: 4.5, n: 2.6 }, { y: 7, x: 5.4, z: 5.2 }, { y: 15, x: 5.0, z: 4.8 }, { y: 24, x: 4.0, z: 3.9 }, { y: 26.5, x: 3.5, z: 3.5 }],
      th: [{ y: 3, xp: 6.0, xn: 6.6, z: 6.6, n: 2.6 }, { y: 8, xp: 6.6, xn: 7.6, z: 7.2 }, { y: 18, xp: 6.2, xn: 7.2, z: 7.0 }, { y: 26, xp: 5.6, xn: 6.4, z: 6.4 },
        { y: 30, xp: 5.2, xn: 5.8, z: 6.0 }, { y: 31.5, xp: 4.6, xn: 5.0, z: 5.4 }],
      kn: [{ y: 29.5, x: 5.4, z: 6.0, n: 3.0 }, { y: 32.5, x: 6.2, z: 6.6 }, { y: 39, x: 5.8, z: 6.4 }, { y: 41.6, x: 4.4, z: 5.2 }],
      sh: [{ y: 3.5, xp: 5.2, xn: 5.0, z: 5.4, n: 2.6 }, { y: 8, xp: 6.2, xn: 5.4, z: 5.6 }, { y: 16, xp: 5.8, xn: 4.8, z: 5.2 }, { y: 24, xp: 4.4, xn: 3.8, z: 4.2 },
        { y: 28.5, xp: 3.4, xn: 3.0, z: 3.4 }, { y: 29.6, xp: 2.8, xn: 2.4, z: 2.8 }]
    }
  };

  function buildAlt(ctx, kind) {
    const { g, M, ch } = ctx;
    const low = ctx.lod === 'low', G1 = kind === 'g1', PR = PRO[kind];
    const P = {};
    const add = (parent, geo, mat, p, r, s) => ctx.add(parent, geo, mat, { p, r, s });
    const S = (n) => low ? Math.max(8, Math.round(n / 2.5)) : n;   // segments des pièces de révolution
    const RB = (w, h, d, r, seg = 2) => low ? g.cbox(w, h, d, Math.min(r, 1)) : g.rbox(w, h, d, r, seg); // boîte arrondie (chanfreinée en LOD bas)
    // loft en cache (clé par skin / LOD)
    const LO = (key, list, o = {}) => loft(kind + key + (low ? '_lo' : ''), list, Object.assign({}, o, { nu: low ? 12 : (o.nu || 32), sub: low ? 1 : (o.sub || 3) }));
    const shZ = G1 ? 19.0 : 20.0, hpZ = G1 ? 11.6 : 12.2;

    /* ---------- matériaux ---------- */
    const VI = M.visor, RU = M.rubber, CHR = M.chrome;
    let SH, JT, BK, RIM, GL, LIV, WH, NV, GR, DG, RD, LENS, DEC;
    if (G1) {
      SH = ctx.mat({ color: 0xc9ced6, roughness: 0.19, metalness: 0.92, clearcoat: 0.7, clearcoatRoughness: 0.12, envMapIntensity: 1.3 });  // alu poli
      JT = ctx.mat({ color: 0x2c2f35, roughness: 0.36, metalness: 0.75, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.9 });  // articulations graphite
      BK = ctx.mat({ color: 0x101114, roughness: 0.3, metalness: 0.25, clearcoat: 0.9, clearcoatRoughness: 0.16, envMapIntensity: 0.8 });  // tête / gants / pieds noirs
      RIM = ctx.mat({ color: 0x8e949d, roughness: 0.22, metalness: 1, envMapIntensity: 1.1 });
      GL = ctx.glow(0x2563ff, 2.8);   // bleu profond (pas de saturation cyan sans tone mapping)
      DEC = low ? null : decalMat(ctx, 0x2c3138);
    } else {
      LIV = ctx.mat({ color: 0xffffff, map: ctx.override ? null : r1Livery(), roughness: 0.3, metalness: 0.02, clearcoat: 0.8, clearcoatRoughness: 0.14, envMapIntensity: 0.55 });
      WH = ctx.mat({ color: 0xeef0f3, roughness: 0.3, metalness: 0.02, clearcoat: 0.8, clearcoatRoughness: 0.14, envMapIntensity: 0.55 });
      NV = ctx.mat({ color: 0x1e2b5c, roughness: 0.36, metalness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 0.6 });
      GR = ctx.mat({ color: 0x6c7179, roughness: 0.42, metalness: 0.35, clearcoat: 0.3, envMapIntensity: 0.65 });
      DG = ctx.mat({ color: 0x33363c, roughness: 0.4, metalness: 0.5, clearcoat: 0.3, envMapIntensity: 0.6 });
      RD = ctx.mat({ color: 0xc8132f, roughness: 0.35, clearcoat: 0.6, envMapIntensity: 0.5 });
      BK = ctx.mat({ color: 0x0e0f12, roughness: 0.34, metalness: 0.3, clearcoat: 0.6, envMapIntensity: 0.6 });
      RIM = ctx.mat({ color: 0xa2a8b0, roughness: 0.3, metalness: 0.6, clearcoat: 0.3, envMapIntensity: 0.8 });
      LENS = ctx.glow(0x7b63ff, 2.4);
      GL = ctx.glow(ch.accent, 3.0);
      DEC = low ? null : decalMat(ctx, 0xc8132f);
    }
    // disque d'articulation (axe Z) : carter + face usinée côté extérieur (side)
    const joint = (gr, p, r, len, side, body, face = true) => {
      add(gr, g.ccyl(r, len, Math.min(0.6, r * 0.12), S(32), 'z'), body, p);
      if (!low && face) {
        add(gr, g.ccyl(r * 0.66, 0.6, 0.15, S(28), 'z'), RIM, [p[0], p[1], p[2] + side * len / 2]);
        add(gr, g.cyl(r * 0.3, r * 0.3, 0.9, S(16), 'z'), body, [p[0], p[1], p[2] + side * len / 2]);
      }
    };
    // ligne de joint sombre autour d'une coque (anneau ouvert légèrement plus grand que la coque à la hauteur y)
    const seam = (gr, key, list, y, mat, h = 0.6, out = 0.1) => {
      if (low) return;
      const d = dimsAt(secs(list), y), sc = (o) => ({ y: y + o, xp: d.xp + out, xn: d.xn + out, zp: d.zp + out, zn: d.zn + out, n: d.n, x0: d.x0, z0: d.z0 });
      add(gr, loft(kind + 'seam' + key, [sc(-h / 2), sc(h / 2)], { nu: 32, sub: 1, capB: false, capT: false }), mat);
    };
    const triPts = (w, h, down) => down ? [[-w / 2, h / 2], [w / 2, h / 2], [0, -h / 2]] : [[-w / 2, -h / 2], [w / 2, -h / 2], [0, h / 2]];

    /* =====================================================
       TORSE : bassin, taille, buste
       ===================================================== */
    const torso = ctx.group();
    if (G1) {
      add(torso, LO('pel', PR.pel, { nu: 32 }), SH);
      add(torso, g.ccyl(6.4, 11.5, 0.8, S(32)), JT, [0, 13.4, 0]);                       // moteur de taille
      if (!low) for (const y of [8.4, 18.4]) add(torso, g.torus(6.3, 0.35, S(32), 6, 2 * PI, 'y'), RIM, [0, y, 0]);
      add(torso, LO('ch', PR.ch, { nu: 40, th0: PI }), SH);
      add(torso, g.ccyl(4.4, 2.4, 0.6, S(24)), JT, [0, 59.8, 0]);                         // collerette du cou
      if (!low) {
        // flancs sombres (logement des moteurs d'épaule) et liseré bas du buste
        for (const s of [1, -1]) add(torso, patch(`g1side${s}`, PR.ch, s * 74 * D, s * 106 * D, 30, 50, 0.08, [0, 0, 1, 1], 6, 6), JT);
        add(torso, LO('chSeam', [{ y: 22.6, xp: 9.25, xn: 9.05, z: 11.75, n: 3.4 }, { y: 23.4, xp: 9.35, xn: 9.15, z: 11.85 }], { nu: 40, sub: 1, capB: false, capT: false }), JT);
        // « Unitree » gris sur le haut du plastron
        add(torso, patch('g1uni', PR.ch, 25 * D, -25 * D, 50.2, 45.6, 0.06, TR.uni, 12, 3), DEC);
        // voyants bleus sous la collerette + ouïes du dos
        add(torso, g.torus(4.55, 0.3, 32, 6, 2 * PI, 'y'), GL, [0, 60.6, 0]);
        add(torso, RB(1.2, 14, 9, 0.5, 1), JT, [-9.4, 38, 0]);
      }
    } else {
      add(torso, LO('pel', PR.pel, { nu: 32 }), NV);
      add(torso, RB(12.6, 10.4, 13.4, 2.2, 2), DG, [0, 14.2, 0]);                      // bloc de taille gris
      if (!low) {
        add(torso, RB(12.9, 0.5, 13.7, 0.2, 1), BK, [0, 14.2, 0]);                       // joint
        for (const s of [1, -1]) add(torso, g.prism([[1.6, 0], [0.8, 1.4], [-0.8, 1.4], [-1.6, 0], [-0.8, -1.4], [0.8, -1.4]], 0.8, 0.2), BK, [8.2, -1.6, s * 4.6], [0, PI / 2, 0]);
      }
      add(torso, LO('ch', PR.ch, { nu: 40, th0: PI, rect: LV.tor, vflip: true }), LIV);
      add(torso, g.ccyl(4.6, 2.2, 0.6, S(24)), NV, [0, 60, 0]);
      if (!low) for (const s of [1, -1]) add(torso, g.torus(1.5, 0.3, 14, 6, PI), GR, [-0.5, 59.7, s * 7.2]); // anneaux de levage
    }
    P.torso = torso;

    /* ---------- cou + tête ---------- */
    {
      const n = ctx.group();
      add(n, g.ccyl(G1 ? 3.0 : 3.4, 13.6, 0.5, S(24)), G1 ? JT : NV, [0, 5.8, 0]);
      if (!low) add(n, g.torus(G1 ? 3.15 : 3.55, 0.3, S(24), 6, 2 * PI, 'y'), G1 ? RIM : GR, [0, 1.6, 0]);
      P.neck = n;
    }
    const head = ctx.group();
    if (G1) {
      add(head, LO('head', PR.head, { nu: 40, sub: 3 }), BK);
      if (!low) {
        add(head, oval('g1face', PR.head, 0.4, 7.2, 5.5, 2.2, 0.16), VI);                 // visage laqué
        add(head, ovalRing('g1ring', PR.head, 0.4, 7.2, 5.5, 2.2, 0.32, 0.42), GL);     // anneau LED bleu
        add(head, oval('g1cam', PR.head, 5.7, 0.45, 1.5, 2.4, 0.3, 16, 2), GL);           // fente de caméra lumineuse (front)
        add(head, g.ccyl(2.6, 1.4, 0.4, 24), JT, [-2.2, 10.2, 0], [0, 0, 0.25]);          // lidar sur le dessus
        for (const s of [1, -1]) add(head, g.ccyl(1.6, 0.5, 0.15, 20, 'z'), JT, [-0.6, 0.4, s * 7.15]); // micros latéraux
      } else add(head, g.ell(1.2, 6.6, 5, 10, 8), GL, [7.4, 0.4, 0]);
    } else {
      add(head, LO('head', PR.head, { nu: 40, sub: 3, th0: PI, rect: LV.hel, vflip: true }), LIV);
      if (!low) add(head, oval('r1visor', PR.head, -1.6, 6.5, 6.4, 3.0, 0.14), VI);
      else add(head, g.ell(1.5, 6, 6, 10, 8), VI, [8.2, -1.6, 0]);
      for (const s of [1, -1]) {
        add(head, g.ccyl(3.9, 2.8, 0.7, S(32), 'z'), NV, [-0.8, 0.6, s * 8.7]);          // oreillettes marine
        if (!low) {
          add(head, g.cyl(2.5, 2.5, 0.3, 28, 'z'), VI, [-0.8, 0.6, s * 10.12]);
          add(head, g.sphere(1.5, 20, 10), LENS, [-0.8, 0.6, s * 9.9], null, [1, 1, 0.45]);
        }
      }
    }
    P.head = head;

    /* =====================================================
       BRAS / JAMBES
       ===================================================== */
    for (const [sd, z] of [['f', 1], ['b', -1]]) {
      const zs = [1, 1, z];   // échelle miroir pour les pièces de révolution orientées vers l'extérieur
      /* ---- épaule (suit le torse : avant = +X) ---- */
      const sc = ctx.group();
      if (G1) {
        add(sc, g.lathe([[0, -5.0], [5.4, -5.0], [6.1, -4.0], [6.4, -1.0], [6.2, 1.6], [5.6, 3.3], [4.2, 4.5], [2.2, 5.1], [0, 5.3]], S(32), 'z'), SH, [0, 0.4, 0], null, zs);
        add(sc, g.cyl(4.6, 4.6, 3.0, S(28), 'z'), JT, [0, 0, -z * 6.3]);
        if (!low) add(sc, g.torus(5.45, 0.3, 32, 6, 2 * PI, 'z'), JT, [0, 0.4, -z * 4.4]);
      } else {
        add(sc, g.lathe([[0, -5.2], [6.4, -5.2], [7.1, -4.4], [7.4, -2.5], [7.4, 2.6], [7.0, 4.3], [6.2, 5.0], [0, 5.2]], S(36), 'z'), WH, [0, 0.4, 0], null, zs);
        add(sc, g.cyl(4.8, 4.8, 3.2, S(28), 'z'), NV, [0, 0, -z * 6.6]);
        if (!low) {
          add(sc, g.cyl(4.2, 4.2, 0.4, 32, 'z'), NV, [0, 0.4, z * 5.25]);                // disque marine
          add(sc, g.prism(triPts(2.2, 1.9, true), 0.3, 0.06), RD, [3.4, 4.1, z * 5.12]);
        }
      }
      P[sd + 'sc'] = sc;

      /* ---- bras (origine épaule, +Y vers le coude, avant = -X) ---- */
      const ua = ctx.group();
      if (G1) {
        add(ua, g.ccyl(4.6, 6.4, 0.6, S(28)), JT, [0, 6.2, 0]);                          // moteur de roulis
        add(ua, LO('ua', PR.ua, { nu: 28 }), SH);
        seam(ua, 'ua', PR.ua, 21.5, JT);
        add(ua, g.ccyl(3.3, 5.2, 0.4, S(24)), JT, [0, 29.8, 0]);
        joint(ua, [0, ctx.L.ua, 0], 3.9, 8.8, z, JT);
      } else {
        add(ua, LO('ua' + sd, PR.ua, { nu: 28, rect: LV.ua, flipU: z < 0 }), LIV);
        add(ua, g.ccyl(3.6, 4.4, 0.4, S(24)), WH, [0, 31.2, 0]);
        joint(ua, [0, ctx.L.ua, 0], 4.4, 9.6, z, GR);
        if (!low) add(ua, patch('r1n01' + sd, PR.ua, z > 0 ? 60 * D : 240 * D, z > 0 ? 120 * D : 300 * D, 15.2, 21.6, 0.06, TR.n01, 8, 3), DEC);
      }
      P[sd + 'ua'] = ua;

      /* ---- avant-bras (origine coude, +Y vers le poignet) ---- */
      const fa = ctx.group();
      if (G1) {
        add(fa, LO('fa', PR.fa, { nu: 28 }), SH);
        seam(fa, 'fa', PR.fa, 6.0, JT);
        add(fa, g.ccyl(2.9, 5.2, 0.4, S(24)), JT, [0, 28.2, 0]);
        if (!low) add(fa, g.torus(3.0, 0.22, 24, 5, 2 * PI, 'y'), RIM, [0, 25.8, 0]);
      } else {
        add(fa, LO('fa', PR.fa, { nu: 28 }), NV);
        add(fa, g.ccyl(3.1, 5.0, 0.4, S(24)), DG, [0, 28.0, 0]);
        if (!low) for (let i = 0; i < 3; i++) add(fa, g.cyl(0.32, 0.32, 0.4, 8, 'z'), BK, [-1.2 + i * 1.2, 10 + i * 0.6, z * 5.05]);
      }
      P[sd + 'fa'] = fa;
      P[sd + 'ha'] = makeHand(ctx, z, G1
        ? { cuff: JT, ring: RIM, flange: JT, palm: BK, back: JT, pad: RU, knuck: JT, f0: BK, f1: BK }
        : { cuff: DG, ring: GR, flange: DG, palm: GR, back: GR, pad: DG, knuck: DG, f0: GR, f1: GR }, G1 ? 1.04 : 1.1);

      /* ---- cuisse (origine hanche, +Y vers le genou) ---- */
      const th = ctx.group();
      const LTH = ctx.L.th;
      if (G1) {
        add(th, g.ell(6.4, 6.0, 6.2, S(28), S(16)), JT, [0, 0, 0]);                       // hanche (tangage)
        if (!low) add(th, g.ccyl(4.2, 0.6, 0.15, 28, 'z'), RIM, [0, 0, z * 6.1]);
        add(th, LO('th', PR.th, { nu: 32 }), SH);
        seam(th, 'th', PR.th, 27.5, JT);
        joint(th, [0, LTH, 0], 4.6, 9.8, z, JT);
      } else {
        add(th, g.ell(6.6, 6.2, 6.4, S(28), S(16)), DG, [0, 0, 0]);
        if (!low) add(th, g.ccyl(4.4, 0.6, 0.15, 28, 'z'), GR, [0, 0, z * 6.3]);
        add(th, LO('th' + sd, PR.th, { nu: 32, rect: LV.thi, flipU: z < 0 }), LIV);
        add(th, LO('kn', PR.kn, { nu: 28 }), NV);                                          // bloc de genou marine
        joint(th, [0, LTH, 0], 4.8, 13.4, z, GR);
        if (!low) add(th, g.prism(triPts(2.0, 1.7, false), 0.3, 0.06), RD, [-6.25, 33.2, 0], [0, PI / 2, 0]);
      }
      P[sd + 'th'] = th;

      /* ---- tibia (origine genou, +Y vers la cheville) ---- */
      const shn = ctx.group();
      const LSH = ctx.L.sh;
      if (G1) { add(shn, LO('sh', PR.sh, { nu: 32 }), SH); seam(shn, 'sh', PR.sh, 6.2, JT); }
      else add(shn, LO('sh', PR.sh, { nu: 32, rect: LV.shi }), LIV);
      // cheville : biellettes noires + jambe de force
      add(shn, g.ccyl(1.7, 7.4, 0.3, S(16)), G1 ? JT : DG, [-0.6, 31.6, 0]);
      if (!low) for (const s of [1, -1]) add(shn, g.cyl(0.55, 0.55, 10.5, 8), BK, [1.9, 31.6, s * 1.9]);
      P[sd + 'sh'] = shn;

      /* ---- pied (origine cheville, +X = pointe, semelle à y ≈ -8,7) ---- */
      const fo = ctx.group(), fz = ctx.group();
      fz.position.y = 0.5; fo.add(fz);   // pied légèrement remonté : la pointe ne s'enfonce pas dans le sol en garde
      if (G1) {
        joint(fo, [0, 0, 0], 2.5, 6.6, z, JT, false);
        add(fz, RB(7.2, 4.4, 7.2, 1.6, 2), BK, [-1.0, -3.9, 0]);
        add(fz, RB(20, 3.6, 8.2, 1.5, 2), BK, [4.6, -6.5, 0]);
        add(fz, g.ell(4.4, 2.2, 4.1, S(20), S(10)), BK, [12.0, -5.5, 0]);
        add(fz, RB(20.4, 0.8, 8.4, 0.35, 1), RU, [4.6, -8.4, 0]);
      } else {
        joint(fo, [0, 0, 0], 2.5, 6.6, z, DG, false);
        add(fz, RB(7.2, 3.4, 7.6, 1.3, 2), NV, [-1.4, -3.2, 0]);
        add(fz, RB(19.6, 4.6, 8.4, 2.0, 2), WH, [4.4, -6.0, 0]);
        add(fz, g.ell(4.6, 2.6, 4.2, S(20), S(10)), WH, [11.6, -5.0, 0]);
        add(fz, RB(19.9, 0.7, 8.6, 0.3, 1), GR, [4.4, -8.4, 0]);
        if (!low) {
          add(fz, RB(15.5, 0.45, 8.62, 0.2, 1), NV, [5.4, -7.65, 0]);
          add(fz, g.prism([[1.7, 0], [-1.2, 1.25], [-1.2, -1.25]], 0.3, 0.06), NV, [4.0, -5.4, z * 4.3]);
        }
      }
      P[sd + 'fo'] = fo;
    }

    if (typeof window !== 'undefined' && window.__report && !low) window.__report.h1MeshesBeforeMerge = meshCount(P);
    const tick = ctx.override ? undefined : (t, state) => {
      if (DEC && state) mirrorDecals([DEC], state.face);
      const sup = state && (state.st === 'super' || state.st === 'special');
      GL.emissiveIntensity = GL.userData.baseI * ((sup ? 1.5 : 0.9) + 0.12 * Math.sin(t * 2.4));
      if (LENS) LENS.emissiveIntensity = LENS.userData.baseI * (0.85 + 0.15 * Math.sin(t * 1.7));
    };
    return { parts: P, shZ, hpZ, tick };
  }

  return function (ctx) {
    if (ctx.skin === 'g1' || ctx.skin === 'r1') return buildAlt(ctx, ctx.skin);
    return buildH1(ctx);
  };
})();
