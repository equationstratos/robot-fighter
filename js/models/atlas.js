'use strict';
/* =========================================================
   Modèle 3D : ATLAS électrique (Boston Dynamics, 2024)
   Contrat : voir js/kit.js.  Repères : torse/tête/épaules avant = +X ;
   membres (th/sh/ua/fa/kn/el/hi) : origine à l'articulation proximale, +Y vers l'os,
   avant du membre = -X quand il pend. Côté 'f' = +Z (vers la caméra).
   Matières : alu brossé satiné (structure), alu poli (bassin/taille), panneaux gris foncé,
   coussins noirs caoutchouc, tête en plastique blanc + objectif noir + anneau LED ambré.
   ========================================================= */
if (typeof RK !== 'undefined' && RK) RK.models.atlas = function (ctx) {
  const { T, ch, g, M, L } = ctx;
  const lo = ctx.lod === 'low';
  const PI = Math.PI, H = PI / 2;
  const self = RK.models.atlas;
  const LC = self._lc || (self._lc = {}); // cache local des géométries composées
  const P = {};

  /* ---------------- matériaux ---------------- */
  const brushed = ctx.tex('brushed');
  const alu = ctx.mat({ color: 0xd2d6dc, roughness: 0.4, metalness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 1.25, roughnessMap: brushed });
  const aluPol = ctx.mat({ color: 0xe4e8ec, roughness: 0.27, metalness: 0.6, clearcoat: 0.6, clearcoatRoughness: 0.12, envMapIntensity: 1.4 });
  const cast = ctx.mat({ color: 0xd3d7dc, roughness: 0.3, metalness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 1.3 });
  const aluDk = ctx.mat({ color: 0x9aa0a8, roughness: 0.34, metalness: 0.75, envMapIntensity: 1.1, roughnessMap: brushed });
  const panel = ctx.mat({ color: 0x4f535a, roughness: 0.4, metalness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.22, envMapIntensity: 0.75 });
  const pad = ctx.mat({ color: 0x141518, roughness: 0.55, metalness: 0.08, clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 0.55 });
  const satin = ctx.mat({ color: 0x18191c, roughness: 0.32, metalness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 0.7 });
  const wrap = ctx.mat({ color: 0x1d1e21, roughness: 0.8, metalness: 0.05, sheen: 0.4, sheenColor: 0x50545c, sheenRoughness: 0.6, envMapIntensity: 0.45 });
  const white = ctx.mat({ color: 0xe8eaed, roughness: 0.3, metalness: 0.02, clearcoat: 0.85, clearcoatRoughness: 0.12, envMapIntensity: 0.55 });
  const fineG = self._fineG || (self._fineG = (() => { const t = ctx.tex('grille').clone(); t.repeat.set(1 / 11, 1 / 11); t.needsUpdate = true; return t; })());
  const grille = ctx.mat({ color: 0xa3a9b1, map: ctx.tex('grille'), roughness: 0.38, metalness: 0.7, envMapIntensity: 0.8 });
  const grilleDk = ctx.mat({ color: 0x4a4e55, map: ctx.tex('grille'), roughness: 0.5, metalness: 0.3, envMapIntensity: 0.6 });
  const grilleHd = ctx.mat({ color: 0x5a5f66, map: fineG, roughness: 0.45, metalness: 0.4, envMapIntensity: 0.6 });
  const lens = ctx.mat({ color: 0x170d06, roughness: 0.04, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.3 });
  const steel = M.steel, dark = M.dark, seam = M.seam, chrome = M.chrome, rubber = M.rubber;
  const ring = ctx.glow(ch.accent, 3.2);
  const ringHot = ctx.glow(0xffe6a8, 2.6);
  const amber = ctx.glow(0xff7a1a, 1.4);
  const led = ctx.glow(0xff3020, 2.5);

  /* ---------------- outils ---------------- */
  const grp = () => ctx.group();
  const add = (par, geo, mat, p, r, s) => ctx.add(par, geo, mat, { p, r, s });
  const sg = n => lo ? Math.max(6, Math.round(n / 2)) : n;
  // révolution à arêtes vives : [rayon, y, vif?]
  // (découpée en tronçons lisses fusionnés : arêtes vives sans triangles dégénérés)
  const lathe = (pts, seg, axis = 'y') => {
    if (lo) return g.lathe(pts.map(q => [q[0], q[1]]), sg(seg), axis);
    const runs = []; let cur = [];
    pts.forEach((q, i) => { cur.push([q[0], q[1]]); if (q[2] && i > 0 && i < pts.length - 1) { runs.push(cur); cur = [[q[0], q[1]]]; } });
    runs.push(cur);
    if (runs.length === 1) return g.lathe(runs[0], seg, axis);
    return combo('lathe' + JSON.stringify(pts) + seg + axis, () => runs.filter(r => r.length > 1).map(r => [g.lathe(r, seg, axis)]));
  };
  // cylindre chanfreiné à arêtes vives
  const cc = (r, h, c = 0.6, seg = 24, axis = 'y') => lathe([[0, -h / 2], [r - c, -h / 2, 1], [r, -h / 2 + c, 1], [r, h / 2 - c, 1], [r - c, h / 2, 1], [0, h / 2]], seg, axis);
  // anneau cannelé (ailettes / moletage) : extrudé selon Z
  const gear = (r, h, n, dep) => {
    const pts = [], da = 2 * PI / n, f = v => +v.toFixed(3);
    for (let i = 0; i < n; i++) {
      const a = i * da;
      for (const [k, rr] of [[0.04, r - dep], [0.2, r], [0.56, r], [0.72, r - dep]]) pts.push([f(Math.cos(a + k * da) * rr), f(Math.sin(a + k * da) * rr)]);
    }
    return g.prism(pts, h, 0);
  };
  // polygone à coins arrondis (pour g.shape) : pts [[x,y,rayon]]
  const rpoly = (s, pts) => {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n], r = p[2] || 0;
      const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const ka = Math.min(r / da, 0.5), kb = Math.min(r / db, 0.5);
      const p1 = [p[0] + (a[0] - p[0]) * ka, p[1] + (a[1] - p[1]) * ka], p2 = [p[0] + (b[0] - p[0]) * kb, p[1] + (b[1] - p[1]) * kb];
      if (i === 0) s.moveTo(p1[0], p1[1]); else s.lineTo(p1[0], p1[1]);
      if (r > 0) s.quadraticCurveTo(p[0], p[1], p2[0], p2[1]); else s.lineTo(p2[0], p2[1]);
    }
    s.closePath();
  };
  // le biseau d'ExtrudeGeometry élargit le contour de c : on le rétrécit d'autant (décalage en onglet)
  const inset = (pts, c) => {
    if (!c) return pts;
    const n = pts.length; let A = 0;
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; A += p[0] * q[1] - q[0] * p[1]; }
    const sgn = A > 0 ? 1 : -1;
    return pts.map((p, i) => {
      const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
      const l1 = Math.hypot(p[0] - a[0], p[1] - a[1]), l2 = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const n1 = [-(p[1] - a[1]) / l1 * sgn, (p[0] - a[0]) / l1 * sgn], n2 = [-(b[1] - p[1]) / l2 * sgn, (b[0] - p[0]) / l2 * sgn];
      const k = c / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
      return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k, Math.max(0, (p[2] || 0) - c)];
    });
  };
  const shp = (key, pts, d, c = 0.6, curve = 4) => g.shape('atlas' + key + (lo ? 'L' : ''), s => rpoly(s, inset(pts, c)), d, c, lo ? 2 : curve);
  // géométrie composée (plusieurs petites pièces fusionnées en un seul mesh) : items [geo, p, r, s]
  const V = new T.Vector3(), Q = new T.Quaternion(), E = new T.Euler(), S3 = new T.Vector3(), MX = new T.Matrix4();
  const combo = (key, make) => {
    key = key + (lo ? 'L' : 'H');
    if (LC[key]) return LC[key];
    const list = make().map(([geo, p = [0, 0, 0], r = [0, 0, 0], s = 1]) => {
      const gg = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const n of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(n)) gg.deleteAttribute(n);
      if (!gg.attributes.uv) gg.setAttribute('uv', new T.BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
      gg.clearGroups();
      if (typeof s === 'number') s = [s, s, s];
      MX.compose(V.set(p[0], p[1], p[2]), Q.setFromEuler(E.set(r[0], r[1], r[2])), S3.set(s[0], s[1], s[2]));
      gg.applyMatrix4(MX);
      if (MX.determinant() < 0) for (const name of ['position', 'normal', 'uv']) {
        const at = gg.attributes[name], is = at.itemSize, arr = at.array;
        for (let i = 0; i < at.count; i += 3) for (let k = 0; k < is; k++) { const t = arr[(i + 1) * is + k]; arr[(i + 1) * is + k] = arr[(i + 2) * is + k]; arr[(i + 2) * is + k] = t; }
      }
      return gg;
    });
    return (LC[key] = T.BufferGeometryUtils.mergeGeometries(list, false));
  };
  // pavé à coins arrondis dans le plan XY, extrudé en Z (arêtes chanfreinées 2 segments)
  const rr = (w, h, d, r, c = 0.8, curve = 4) => shp(`rr${w},${h},${r}`, [[-w / 2, -h / 2, r], [w / 2, -h / 2, r], [w / 2, h / 2, r], [-w / 2, h / 2, r]], d, c, curve);
  // déformation de sommets (effilement…) d'une géométrie composée ; normales plates recalculées
  const deform = (key, make, fn) => {
    const k2 = 'def' + key + (lo ? 'L' : 'H');
    if (LC[k2]) return LC[k2];
    const geo = combo('src' + key, make).clone(), pa = geo.attributes.position, v = [0, 0, 0];
    for (let i = 0; i < pa.count; i++) { v[0] = pa.getX(i); v[1] = pa.getY(i); v[2] = pa.getZ(i); fn(v); pa.setXYZ(i, v[0], v[1], v[2]); }
    geo.computeVertexNormals();
    return (LC[k2] = geo);
  };
  const clamp01 = x => Math.min(1, Math.max(0, x));
  // vis à tête hexagonale, axe donné
  const boltG = (r = 0.7, h = 0.6, axis = 'y') => g.cyl(r, r, h, 6, axis);

  /* =========================================================
     TORSE : bassin poli + taille mécanique + buste (boîtier alu + plastron gris foncé)
     ========================================================= */
  const shZ = 22.5, hpZ = 13;
  const SHY = 0.86 * L.to;
  function torso() {
    const t = grp();
    if (lo) {
      add(t, g.cbox(17, 15, 40, 5), aluPol, [1, 0.5, 0]);
      add(t, g.cbox(27, 35, 32, 4), alu, [-1.5, 43.5, 0]);
      add(t, g.cyl(9, 9, 14, 8), dark, [0, 18, 0], null, [1, 1, 1.2]);
      return t;
    }
    /* --- bassin : corps central coulé + lobes de hanche + disques noirs --- */
    const pelv = shp('pelvis', [[8.6, 10, 2], [9.6, 2, 4], [7, -5.5, 4], [0, -7.5, 3], [-7, -5.5, 4], [-9.6, 2, 4], [-8.6, 10, 2]], 19, 1.6, 6);
    add(t, pelv, cast);
    // pli central (fonderie) + joint
    add(t, g.box(0.5, 13, 0.5), seam, [9.3, 2, 0], [0, 0, -0.08]);
    for (const sd of [1, -1]) {
      // lobe de hanche : bulbe coulé, axe vers l'extérieur et l'avant (disques visibles de face comme de profil)
      const lob = grp(); lob.position.set(1.6, 0.6, 14 * sd); lob.rotation.set(0, 0.82 * sd, 0); lob.scale.set(1.08, 1.08, 1.08 * sd); t.add(lob);
      add(lob, lathe([[0, 6.8], [5.4, 6.8, 1], [6.2, 6.2, 1], [8.1, 4.6], [9.1, 2.2], [9.4, -0.5], [8.8, -3.8], [7, -6.4], [3.6, -7.9], [0, -8.3]], 28, 'z'), cast);
      add(lob, cc(5.4, 1.4, 0.35, 28, 'z'), pad, [0, 0, 7.1]); // disque noir
      add(lob, combo('hipscrews', () => [0, 1, 2].map(i => [boltG(0.38, 0.5, 'z'), [Math.cos(i * 2.09 + 0.5) * 4.1, Math.sin(i * 2.09 + 0.5) * 4.1, 7.9]])), steel);
    }
    // jonction bassin -> taille : galette noire épaisse
    const rrect = (w, d, r) => [[-w / 2, -d / 2, r], [w / 2, -d / 2, r], [w / 2, d / 2, r], [-w / 2, d / 2, r]];
    add(t, shp('waistPlate', rrect(20, 24, 7.5), 2.6, 0.5, 4), pad, [0, 11.2, 0], [H, 0, 0]);
    /* --- taille : carter poli (plan arrondi) boulonné + bielles visibles --- */
    add(t, shp('waistLow', rrect(18.6, 22.6, 7), 3.6, 0.8, 4), aluPol, [0, 14.2, 0], [H, 0, 0]);
    add(t, shp('waistSeam', rrect(18.9, 22.9, 7.1), 0.4, 0, 4), seam, [0, 16.1, 0], [H, 0, 0]);
    add(t, shp('waistTop', rrect(17.6, 21.6, 6.6), 3.6, 1.2, 4), aluPol, [0, 18, 0], [H, 0, 0]);
    add(t, combo('waistbolts', () => [-0.9, -0.45, 0, 0.45, 0.9, PI - 0.6, PI, PI + 0.6].map(a => [boltG(0.6, 0.7, 'y'), [Math.cos(a) * 7.2, 0, Math.sin(a) * 9]])), steel, [0, 19.9, 0]);
    // noyau sombre + cardan central + 4 vérins à rotules
    add(t, g.cbox(15, 9, 20, 1.5), dark, [-2, 24, 0]);
    add(t, g.cbox(6, 6.5, 7, 1), aluPol, [2.5, 22.6, 0]);
    add(t, g.cyl(1.3, 1.3, 9, 10, 'z'), steel, [2.5, 22.6, 0]);
    for (const sd of [1, -1]) for (const [x, k] of [[5.5, 1], [-7.5, -1]]) {
      add(t, g.cyl(1.1, 1.1, 8, 10), steel, [x, 24, 6.4 * sd], [0, 0, -0.12 * k]);
      add(t, g.sphere(1.6, 10, 8), chrome, [x - 0.5 * k, 20.4, 6.4 * sd]);
      add(t, g.cbox(3.4, 3, 3.4, 0.6), aluDk, [x + 0.5 * k, 28, 6.4 * sd]);
    }
    /* --- buste : coque alu (profil latéral extrudé) --- */
    // le buste s'affine vers le bas (vue de face trapézoïdale, comme sur le vrai robot)
    const chestTaper = v => { const u = Math.min(1, Math.max(0, (v[1] - 27) / 25)); v[2] *= 0.86 + 0.14 * u * (2 - u); };
    const chestPts = [[10.2, 60.4, 3], [12, 56, 2], [12, 30.6, 3], [9.5, 26.6, 2], [-6, 26, 3], [-13.2, 28.6, 4], [-16, 34, 3], [-16, 55.5, 4], [-12, 60.4, 3], [-2, 61.2, 2]];
    const sideP = shp('chestside', [[9, 57, 2], [9, 32.5, 3], [-10, 30, 4], [-13.6, 35.5, 2], [-13.6, 54, 3], [-9, 58, 2]], 1.2, 0.4, 3);
    const lowP = shp('chestLow', [[6, 36, 1], [6, 32.6, 2], [-9.5, 31.2, 3], [-12, 36, 1]], 0.8, 0.25, 3);
    add(t, deform('chestShell', () => [[shp('chest', chestPts, 32, 1.6, 4)], [sideP, [0, 0, 16.2]], [sideP, [0, 0, -16.2]]], chestTaper), alu);
    // flancs : grilles perforées, jonctions, bas de flanc plus sombre
    add(t, deform('chestGrille', () => [[g.cbox(10, 9, 0.8, 0.3), [-1.5, 44, 16.75]], [g.cbox(10, 9, 0.8, 0.3), [-1.5, 44, -16.75]]], chestTaper), grille);
    add(t, deform('chestLow', () => [[lowP, [0, 0, 16.75]], [lowP, [0, 0, -16.75]]], chestTaper), aluDk);
    // plastron gris foncé trapézoïdal (vue de face : z horizontal), extrudé selon X
    const plast = shp('plastron', [[-13.4, 57.6, 2.5], [13.4, 57.6, 2.5], [11.8, 29.5, 5], [-11.8, 29.5, 5]], 2.6, 0.7, 6);
    add(t, deform('chestPanel', () => [[plast, [11.6, 0, 0], [0, H, 0]]], chestTaper), panel);
    add(t, deform('chestSeams', () => [
      [shp('plastronSeam', [[-14, 58.2, 2.8], [14, 58.2, 2.8], [12.4, 28.9, 5.4], [-12.4, 28.9, 5.4]], 1.6, 0, 6), [11.4, 0, 0], [0, H, 0]],
      [g.box(0.3, 0.35, 25.4), [12.95, 46.5, 0]],
      ...[1, -1].flatMap(sd => [[g.box(22, 0.3, 0.4), [-1, 37, 16.7 * sd]], [g.box(0.35, 24, 0.4), [7.2, 44, 16.7 * sd]], [g.box(16, 0.3, 0.4), [-3, 52.5, 16.7 * sd]]])
    ], chestTaper), seam);
    for (const sd of [1, -1]) add(t, cc(7, 3, 0.8, 28, 'z'), aluDk, [1, SHY, 16.5 * sd]); // logement de l'actionneur d'épaule
    // "logo" (traits blancs)
    add(t, combo('logo', () => [[-4.6, 1.5], [-3.2, 0.9], [-2.1, 0.8], [-1.0, 0.9], [0.3, 1.3], [1.9, 1.2], [3.2, 0.9], [4.4, 1.1]].map(q => [g.box(0.2, 0.55, q[1]), [0, 0, q[0]]])), M.white, [12.95, 54.2, 0]);
    // dos : sac (batterie) avec grille et vis
    add(t, g.cbox(3.4, 24, 24, 1.1), alu, [-17, 42.5, 0]);
    add(t, g.cbox(0.8, 9, 15, 0.3), grilleDk, [-18.75, 40, 0]);
    add(t, g.box(0.4, 0.4, 24.2), seam, [-18.7, 50.5, 0]);
    add(t, combo('backbolts', () => [[-10, 53], [10, 53], [-10, 32], [10, 32]].map(q => [boltG(0.55, 0.6, 'x'), [0, q[1], q[0]]])), steel, [-18.8, 0, 0]);
    // haut du buste : coupelle polie autour du cou
    add(t, lathe([[9, 0], [8.4, 0.9, 1], [6.4, 1.4], [5.4, 2.1, 1], [0, 2.1]], 28), aluPol, [-0.5, 59.9, 0]);
    return t;
  }

  /* =========================================================
     ÉPAULE (sc) : actionneur + gros coussin noir
     ========================================================= */
  function shoulderCap(sd) {
    const s = grp();
    if (lo) { add(s, g.cbox(12, 9, 9, 2.5), pad, [0, 3, 0]); return s; }
    add(s, cc(6.4, 6, 0.8, 28, 'z'), alu, [0, 0, -3.5 * sd]);
    add(s, gear(6.6, 1, 24, 0.35), steel, [0, 0, -6.3 * sd]);
    // coussin : gros pavé noir arrondi, sur le dessus/l'extérieur de l'épaule
    add(s, rr(13, 11.6, 10.6, 3.8, 1.8, 4), pad, [0.6, 2.6, 1.4 * sd], [0.1 * sd, 0, 0]);
    add(s, rr(11, 9.6, 1, 3, 0.3, 4), satin, [0.6, 2.6, 6.45 * sd], [0.1 * sd, 0, 0]);
    return s;
  }

  /* =========================================================
     BRAS (ua) : origine épaule, coude à y = L.ua ; avant = -X
     ========================================================= */
  function upperArm(sd) {
    const a = grp(), la = L.ua;
    if (lo) { add(a, g.cbox(11, la, 11, 2), alu, [0, la / 2, 0]); return a; }
    // carter d'épaule
    add(a, cc(6.3, 10, 1, 24), alu, [0, 4, 0]);
    add(a, g.box(13, 0.5, 13), seam, [0, 6.5, 0], [0, 0, 0.35]);
    // bague sombre + bague usinée
    add(a, cc(5.9, 1.6, 0.3, 24), dark, [0, 9.8, 0]);
    add(a, gear(6.1, 1.2, 24, 0.3), steel, [0, 11.2, 0], [H, 0, 0]);
    // tube principal
    add(a, lathe([[5.8, 11.8, 1], [5.6, 18], [5.3, 24.6, 1]], 24), alu);
    add(a, g.cbox(6.5, 7, 1.2, 0.4), grille, [0.5, 19, 5.2 * sd]);
    add(a, g.box(0.4, 11.5, 0.6), seam, [-5.5, 18.2, 0]);
    add(a, combo('uaBolts' + sd, () => [[-2.6, 1.6], [2.6, 1.6], [-2.6, 6.4], [2.6, 6.4]].map(q => [boltG(0.42, 0.6, 'z'), [q[0], q[1], 6.15 * sd]])), steel);
    // empilement d'actionneurs avant le coude
    add(a, cc(5.6, 1.8, 0.3, 24), dark, [0, 25.4, 0]);
    add(a, gear(5.8, 1.4, 24, 0.3), steel, [0, 26.9, 0], [H, 0, 0]);
    add(a, cc(5.5, 1.6, 0.3, 24), pad, [0, 28.3, 0]);
    // chape du coude (deux flasques)
    for (const z of [1, -1]) add(a, shp('elbowFork', [[-4.5, 27, 1], [4.5, 27, 1], [4.6, 33, 4], [-4.6, 33, 4]], 1.6, 0.4, 4), alu, [0, 0, 4.4 * z]);
    return a;
  }
  // coude (el) : moyeu + carter noir
  function elbow(sd) {
    const e = grp();
    if (lo) return e;
    add(e, cc(4.6, 7.2, 0.6, 24, 'z'), dark);
    add(e, cc(5.3, 3.4, 0.8, 24, 'z'), pad, [0, 0, 3.6 * sd]);
    add(e, cc(2.4, 0.6, 0.15, 16, 'z'), steel, [0, 0, 5.4 * sd]);
    add(e, g.sphere(0.45, 8, 6), led, [-2.4, -2.6, 5.2 * sd]);
    add(e, g.cbox(6.5, 9, 9, 2.2), pad, [3.2, 1.5, 0]);
    return e;
  }

  /* =========================================================
     AVANT-BRAS (fa) : origine coude, poignet à y = L.fa
     ========================================================= */
  function foreArm(sd) {
    const f = grp(), lf = L.fa;
    if (lo) { add(f, g.cbox(9.5, lf, 9.5, 2), alu, [0, lf / 2, 0]); return f; }
    // sortie de coude polie
    add(f, lathe([[4.6, 3, 1], [5.2, 4.2, 1], [5.2, 8, 1], [4.6, 9, 1]], 24), aluPol);
    add(f, combo('faBolts', () => [0, 1, 2, 3, 4, 5].map(i => [boltG(0.4, 0.6, 'x'), [Math.cos(i * PI / 3) * 5.15, 6, Math.sin(i * PI / 3) * 5.15], [0, -i * PI / 3, 0]])), steel);
    // section à ailettes (dissipateur)
    add(f, gear(5.2, 7, 18, 0.75), aluPol, [0, 12.8, 0], [H, 0, 0]);
    add(f, cc(4.6, 1, 0.2, 24), dark, [0, 16.8, 0]);
    // actionneur de poignet noir (coussins)
    add(f, cc(4.4, 7, 0.9, 24), satin, [0, 20.6, 0]);
    add(f, g.cbox(5.5, 7.5, 9.6, 2), pad, [1.6, 21, 0]);
    add(f, cc(3.9, 1, 0.2, 24), steel, [0, 24.6, 0]);
    // bride de poignet polie
    add(f, lathe([[3.9, 25, 1], [3.6, 26.5], [3.4, 29.5, 1], [3.8, 30.2, 1], [3.8, 31.4, 1]], 20), aluPol);
    return f;
  }
  // main : pince 3 doigts + pouce (kit), noire, avec caméras de paume
  function hand(sd) {
    const h = RK.hand(ctx, { side: sd, palm: [8.5, 4.8, 8.4], fingers: 3, style: 'gripper', palmMat: satin, fingerMat: pad, jointMat: aluDk });
    if (lo) return h;
    add(h, cc(3.9, 1.4, 0.3, 20, 'x'), aluPol, [0.3, 0, 0]);
    add(h, g.cbox(6, 1.2, 7.2, 0.4), aluPol, [7, 2.9, 0]);
    add(h, combo('handHoles', () => [[-1.6, -1.8], [-1.6, 1.8], [1.6, -1.8], [1.6, 1.8]].map(q => [g.cyl(0.55, 0.55, 0.4, 10), [q[0], 0, q[1]]])), seam, [7, 3.4, 0]);
    // barre caméras (dos de la main) : 2 objectifs
    add(h, g.cbox(8.4, 2.6, 2.6, 0.6), satin, [7.2, 0.4, 4.9 * sd]);
    for (const x of [4.2, 10.2]) {
      add(h, g.cyl(1.05, 1.05, 0.6, 14, 'z'), steel, [x, 0.4, 6.3 * sd]);
      add(h, g.cyl(0.7, 0.7, 0.7, 14, 'z'), lens, [x, 0.4, 6.4 * sd]);
    }
    return h;
  }

  /* =========================================================
     HANCHE (hi) : moyeu sombre (suit la cuisse)
     ========================================================= */
  function hipJoint(sd) {
    const h = grp();
    if (lo) return h;
    add(h, cc(5.6, 9, 0.8, 24, 'z'), cast, [0, 0, -0.5 * sd]);
    return h;
  }

  /* =========================================================
     CUISSE (th) : origine hanche, genou à y = L.th ; avant = -X
     ========================================================= */
  function thigh(sd) {
    const t = grp(), lt = L.th;
    if (lo) { add(t, g.cbox(16, lt - 4, 15, 3), alu, [0, lt / 2 + 1, 0]); return t; }
    add(t, cc(6.4, 6, 0.8, 24), cast, [0, 2.2, 0]);
    // couronne moletée + bague noire + bande caoutchouc
    add(t, gear(8, 1.8, 28, 0.55), aluPol, [0, 5.6, 0], [H, 0, 0]);
    add(t, cc(7.9, 0.8, 0.2, 28), dark, [0, 6.9, 0]);
    add(t, lathe([[8.1, 7.2, 1], [8.3, 8], [8.3, 12], [8, 12.9, 1]], 28), rubber);
    // corps usiné : profil latéral extrudé
    const prof = [[-9, 12.6, 1.5], [8.8, 12.6, 1.5], [9.4, 19, 5], [8.4, 31, 5], [6, 41.5, 3], [-6.6, 41.5, 2], [-8.6, 33, 4], [-9.4, 20, 4]];
    // (effilement vers le genou : vue de face trapézoïdale)
    const thT = v => { v[2] *= 1 - 0.17 * clamp01((v[1] - 15) / 27); };
    add(t, deform('thigh', () => [[shp('thigh', prof, 16.4, 1.8, 4)]], thT), alu);
    // plaque ovale extérieure (bord usiné brillant) + vis
    const ts = 'thigh' + sd;
    add(t, deform(ts + 'plate', () => [[shp('thighPlate', [[-4.8, 15.5, 4.5], [4.8, 15.5, 4.5], [4.4, 38, 4.5], [-4.4, 38, 4.5]], 1.8, 0.5, 5), [0.8, 0, 8.7 * sd]], [cc(2.6, 1.6, 0.5, 20, 'z'), [-4.6, 18.5, 8.0 * sd]]], thT), aluPol);
    add(t, deform(ts + 'plateIn', () => [[shp('thighPlateIn', [[-3.8, 17, 3.5], [3.8, 17, 3.5], [3.4, 36.5, 3.5], [-3.4, 36.5, 3.5]], 1, 0.3, 5), [0.8, 0, 9.5 * sd]]], thT), alu);
    add(t, deform(ts + 'bolts', () => [[-3.5, 17.4], [3.5, 17.4], [-3, 36], [3, 36], [-2.6, 26.5], [2.6, 26.5]].map(q => [boltG(0.4, 0.4, 'z'), [0.8 + q[0], q[1], 10.1 * sd]]), thT), steel);
    add(t, deform(ts + 'bore', () => [[g.cyl(1.6, 1.6, 1.8, 16, 'z'), [-4.6, 18.5, 8.2 * sd]]], thT), seam);
    add(t, g.cyl(0.8, 0.8, 1.8, 12, 'x'), seam, [-8.1, 26, 3 * sd]);
    // joints de panneaux
    add(t, g.box(18.4, 0.35, 16.8), seam, [0, 14.8, 0]);
    // coussin noir avant (au-dessus du genou)
    add(t, g.cbox(2, 5.2, 9, 0.6), pad, [-6.6, 37.6, 0], [0, 0, 0.18]);
    // chape du genou
    for (const z of [1, -1]) add(t, shp('kneeFork', [[-5.4, 38, 1], [5, 38, 1], [4.6, lt + 1, 4], [-4.6, lt + 1, 4]], 2, 0.5, 4), alu, [0, 0, 7.2 * z]);
    // câble arrière (cuisse -> tibia)
    add(t, g.tube([[6.5, 30, 3 * sd], [8.5, 38, 4 * sd], [8.2, 46, 4.5 * sd], [6.5, 52, 4 * sd]], 0.55, 16, 6), rubber);
    return t;
  }
  // genou (kn) : moyeu + rotule noire
  function knee(sd) {
    const k = grp();
    if (lo) return k;
    add(k, cc(5.2, 13, 0.7, 24, 'z'), dark);
    add(k, combo('kneeCap', () => [[cc(3.2, 0.8, 0.2, 18, 'z'), [0, 0, 8.5]], [cc(3.2, 0.8, 0.2, 18, 'z'), [0, 0, -8.5]]]), aluPol);
    add(k, g.cbox(2.6, 6.5, 10, 0.8), pad, [-5.8, 3.6, 0]);
    return k;
  }

  /* =========================================================
     TIBIA (sh) : origine genou, cheville à y = L.sh ; avant = -X
     ========================================================= */
  function shin(sd) {
    const s = grp(), ls = L.sh;
    if (lo) { add(s, g.cbox(12, ls - 4, 11, 2.5), wrap, [0.5, ls / 2, 0]); return s; }
    // carter supérieur alu
    add(s, shp('shinTop', [[-6.2, 2.5, 2], [6, 2.5, 2], [7.4, 9, 3], [6.9, 17.5, 2], [-5.4, 17.5, 2], [-6.6, 8, 2]], 12.4, 1.2, 4), alu);
    add(s, g.cyl(1.5, 1.5, 0.8, 14, 'z'), seam, [0.5, 9, 6.1 * sd]);
    add(s, combo('shinBolts' + sd, () => [[-3.6, 5], [3.8, 5], [-3.2, 14.5], [3.6, 14.5]].map(q => [boltG(0.4, 0.5, 'z'), [q[0], q[1], 6.2 * sd]])), steel);
    add(s, g.cbox(2.2, 5.5, 8.5, 0.6), pad, [-6.4, 10, 0]);
    // mollet enveloppé noir + sangles
    const calfT = v => { v[2] *= 1 - 0.24 * clamp01((v[1] - 19) / 17); };
    add(s, deform('calf', () => [[shp('calf', [[-5.3, 16, 1], [6.9, 16, 2], [7.3, 21, 5], [5.6, 29, 5], [3.6, 36.5, 2], [-4.2, 36.5, 2], [-4.9, 26, 3]], 11.4, 1.6, 5)]], calfT), wrap);
    add(s, deform('calfStraps', () => [[20.6, 14], [31.2, 11.2]].map(([y, w]) => [g.cbox(w, 1.6, 12.2, 0.4), [0.9, y, 0]]), calfT), satin);
    // structure de cheville alu (deux bielles + bloc)
    add(s, g.cbox(8.6, 3.2, 9.6, 1), alu, [-0.2, 36.8, 0]);
    for (const z of [1, -1]) add(s, shp('ankleStrut', [[-2.4, 36, 1], [2.6, 36, 1], [2.2, ls + 1, 2], [-2.2, ls + 1, 2]], 1.6, 0.4, 3), alu, [0, 0, 4 * z]);
    add(s, g.cyl(1, 1, 8, 10), steel, [2.4, 38.5, 0]);
    add(s, g.cbox(3, 3.4, 4.6, 0.6), satin, [-0.5, 40.8, 0]);
    return s;
  }

  /* =========================================================
     PIED (fo) : origine cheville, pointe +X, semelle à y ≈ -7.6
     ========================================================= */
  function foot(sd) {
    const f = grp();
    if (lo) { add(f, g.cbox(24, 4, 10.5, 1.2), alu, [4.5, -4.5, 0]); return f; }
    // palette (vue de dessus extrudée en Y)
    const plan = [[-6.8, -5.1, 2.5], [14, -5.1, 4], [17.2, -2, 3], [17.2, 2, 3], [14, 5.1, 4], [-6.8, 5.1, 2.5]];
    add(f, shp('footPlate', plan, 3.4, 1, 4), alu, [0, -3.85, 0], [H, 0, 0]);
    add(f, shp('footSole', plan, 1.2, 0.3, 4), rubber, [0, -5.95, 0], [H, 0, 0], [1.01, 1.01, 1]);
    add(f, shp('footTop', [[-4.5, -3.6, 2], [11.5, -3.6, 3], [13.4, 0, 2], [11.5, 3.6, 3], [-4.5, 3.6, 2]], 0.8, 0.25, 4), aluPol, [0, -2.0, 0], [H, 0, 0]);
    // fourche de cheville
    for (const z of [1, -1]) add(f, shp('ankleFork', [[-4, -2.4, 1], [3.6, -2.4, 1], [2.4, 1.8, 2.2], [-2.4, 1.8, 2.2]], 1.5, 0.4, 3), alu, [-0.4, 0, 3.9 * z]);
    add(f, cc(2.8, 9.4, 0.5, 18, 'z'), dark);
    add(f, combo('ankleCaps', () => [[cc(1.8, 0.6, 0.15, 14, 'z'), [0, 0, 4.85]], [cc(1.8, 0.6, 0.15, 14, 'z'), [0, 0, -4.85]]]), aluPol);
    add(f, g.cbox(3.4, 2.2, 5, 0.5), satin, [-3.8, -1.2, 0]);
    return f;
  }

  /* =========================================================
     COU + TÊTE
     ========================================================= */
  function neck() {
    const n = grp();
    if (lo) { add(n, g.cyl(4, 4, L.nk, 8), steel, [0, L.nk / 2, 0]); return n; }
    add(n, lathe([[4.4, 0, 1], [4.4, 1.2, 1], [3.7, 1.8, 1], [3.7, 6.5, 1], [3.2, 7, 1], [0, 7]], 24), chrome);
    add(n, g.cyl(3, 3, L.nk - 6, 16), dark, [0, 6 + (L.nk - 6) / 2 - 1, 0]);
    return n;
  }
  function head() {
    const h0 = grp(), h = grp(); h.position.y = 1.9; h.scale.setScalar(1.06); h0.add(h); // tambour un peu au-dessus du pivot : cou visible
    const R = 11.8;
    if (lo) {
      add(h, g.cyl(R, R, 11, 14, 'x'), white, [1, 0, 0]);
      add(h, g.cbox(12, 19, 19, 3), white, [-8, -0.5, 0]);
      add(h, g.torus(9.7, 1.1, 18, 4, PI * 2, 'x'), ring, [7, 0, 0]);
      return h0;
    }
    // tambour blanc (axe X), lèvre avant arrondie mais nette
    add(h, lathe([[0, -6.5], [10.4, -6.5, 1], [R, -5, 1], [R, 4.4, 1], [11.7, 5.4], [11.2, 6.3], [10.5, 6.75, 1], [10.1, 6.75, 1], [10.1, 6.1, 1]], 40, 'x'), white, [0.5, 0, 0]);
    add(h, g.torus(R + 0.02, 0.18, 40, 4, PI * 2, 'x'), seam, [-4.2, 0, 0]);
    // anneau LED : bord extérieur ambré + cœur chaud
    add(h, lathe([[10.15, 6.45], [9.2, 6.2]], 48, 'x'), ring, [0.5, 0, 0]);
    add(h, lathe([[9.2, 6.2], [8.55, 5.9]], 48, 'x'), ringHot, [0.5, 0, 0]);
    add(h, lathe([[8.55, 5.9], [8.25, 5.4]], 48, 'x'), amber, [0.5, 0, 0]);
    // objectif (verre noir légèrement bombé)
    add(h, lathe([[8.25, 5.3], [7.2, 5.75], [4.5, 6.2], [0, 6.4]], 40, 'x'), lens, [0.5, 0, 0]);
    // capteurs derrière le verre
    add(h, combo('headSensors', () => [[-4.6, 2.6], [-1.6, 3.3], [1.6, 3.3], [4.6, 2.6]].map(q => [g.cyl(0.55, 0.55, 0.3, 10, 'x'), [0, q[1], q[0]]])), panel, [6.85, 0, 0]);
    add(h, combo('headLeds', () => [[0, -1.6], [1.2, -1.6]].map(q => [g.box(0.2, 0.35, 0.5), [0, q[1], q[0]]])), ringHot, [6.9, 0, 0]);
    // module arrière (boîte blanche) + grilles d'aération sombres sur les flancs
    add(h, shp('headBox', [[-15.2, -8.8, 4.5], [-3, -8.8, 1], [-3, 10, 1], [-15.2, 10, 4.5]], 19, 1.6, 5), white);
    add(h, g.cbox(9.5, 0.9, 12, 0.3), panel, [-9.4, 10.1, 0]);
    for (const sd of [1, -1]) {
      add(h, rr(8, 12.6, 1, 2.4, 0.3, 4), seam, [-9.3, 0.6, 9.35 * sd]);
      add(h, rr(7.2, 11.8, 1, 2, 0.25, 4), grilleHd, [-9.3, 0.6, 9.6 * sd]);
    }
    // embase (bride noire + vis)
    add(h, cc(5.4, 1.9, 0.4, 24), dark, [-0.5, -13, 0]);
    add(h, combo('headBolts', () => [0, 1, 2, 3, 4, 5].map(i => [boltG(0.45, 0.5, 'x'), [Math.cos(i * PI / 3) * 5.4, 0, Math.sin(i * PI / 3) * 5.4], [0, i * PI / 3, 0]])), steel, [-0.5, -13, 0]);
    // antenne (arrière gauche) avec bagues jaunes
    add(h, g.cyl(0.55, 0.75, 15, 10), aluDk, [-11.5, 17, -5]);
    add(h, combo('antBands', () => [[g.cyl(0.8, 0.8, 0.7, 10), [0, 0, 0]], [g.cyl(0.8, 0.8, 0.7, 10), [0, 1.5, 0]]]), M.yellow, [-11.5, 20.8, -5]);
    add(h, g.cbox(3.4, 1.4, 3.4, 0.4), white, [-11.5, 10.4, -5]);
    return h0;
  }

  /* ---------------- assemblage ---------------- */
  P.torso = torso();
  P.neck = neck();
  P.head = head();
  for (const [sd, z] of [['f', 1], ['b', -1]]) {
    P[sd + 'sc'] = shoulderCap(z);
    P[sd + 'ua'] = upperArm(z);
    P[sd + 'el'] = elbow(z);
    P[sd + 'fa'] = foreArm(z);
    P[sd + 'ha'] = hand(z);
    P[sd + 'hi'] = hipJoint(z);
    P[sd + 'th'] = thigh(z);
    P[sd + 'kn'] = knee(z);
    P[sd + 'sh'] = shin(z);
    P[sd + 'fo'] = foot(z);
  }
  const tick = (lo || ctx.override) ? undefined : (t) => {
    const k = 0.9 + 0.1 * Math.sin(t * 2.1);
    ring.emissiveIntensity = ring.userData.baseI * k;
    ringHot.emissiveIntensity = ringHot.userData.baseI * k;
  };
  return { parts: P, shZ, hpZ, tick };
};
