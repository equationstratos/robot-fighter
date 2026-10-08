'use strict';
/* =========================================================
   Modèle 3D : TESLA OPTIMUS Gen 2 (révélé en décembre 2023)
   Contrat : voir js/kit.js.
   Design : tête noire laquée en « œuf » (visière avec filet LED cyan sur les côtés),
   plastron blanc brillant façon cuirasse (col/épaules noirs, « TESLA » discret),
   taille noire segmentée, bassin mécanique noir avec actionneurs de hanche apparents,
   bras/cuisses en coques blanches, genoux/coudes noirs, bas de jambe et pieds noirs
   avec vérins linéaires derrière le mollet, mains graphite à 5 doigts.
   Technique : les coques sont des « patchs » découpés dans des profils superelliptiques
   (sections interpolées), avec chanfrein + paroi : arêtes nettes, joints sombres entre
   panneaux, surfaces lisses. Géométries mises en cache localement (helper `patch`).
   ========================================================= */
if (typeof RK !== 'undefined' && RK) RK.models.optimus = (function () {
  const T = RK.T, BGU = T.BufferGeometryUtils, PI = Math.PI, D = PI / 180;
  const GC = {};
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- interpolation ---------- */
  const crs = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  // courbe 1D lisse passant par [[x, y], ...]
  const curve = pts => x => {
    const n = pts.length;
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0; while (i < n - 2 && pts[i + 1][0] < x) i++;
    const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
    return crs(pts[Math.max(0, i - 1)][1], pts[i][1], pts[i + 1][1], pts[Math.min(n - 1, i + 2)][1], t);
  };

  /* ---------- profils : sections superelliptiques le long de Y ----------
     xf / xb : demi-épaisseur côté +X / -X ; zo / zi : demi-largeur côté +Z / -Z ;
     x0 / z0 : décalage du centre ; nf / nb : exposant (2 = ellipse, 3+ = carré arrondi) */
  const KEYS = ['xf', 'xb', 'zo', 'zi', 'x0', 'z0', 'nf', 'nb'];
  const prof = list => list.map(s => {
    const o = Object.assign({ x0: 0, z0: 0, nf: 2.5, nb: 2.5 }, s);
    if (o.z != null) { o.zo = o.zo == null ? o.z : o.zo; o.zi = o.zi == null ? o.z : o.zi; }
    if (o.n != null) { o.nf = o.n; o.nb = o.n; }
    return o;
  });
  function dims(tab, y) {
    const n = tab.length;
    if (y <= tab[0].y) return tab[0];
    if (y >= tab[n - 1].y) return tab[n - 1];
    let i = 0; while (i < n - 2 && tab[i + 1].y < y) i++;
    const a = tab[i], b = tab[i + 1], t = (y - a.y) / (b.y - a.y);
    const p0 = tab[Math.max(0, i - 1)], p3 = tab[Math.min(n - 1, i + 2)];
    const o = {};
    for (const k of KEYS) o[k] = crs(p0[k], a[k], b[k], p3[k], t);
    return o;
  }
  const spow = (c, e) => (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), e);
  // point de la surface : angle th (0 = +X, 90° = +Z), hauteur y, décalage normal off
  function SP(tab, th, y, off) {
    const d = dims(tab, y), c = Math.cos(th), s = Math.sin(th);
    const ex = Math.max(0.02, (c >= 0 ? d.xf : d.xb) + off), ez = Math.max(0.02, (s >= 0 ? d.zo : d.zi) + off);
    const e = 2 / (c >= 0 ? d.nf : d.nb);
    return [d.x0 + ex * spow(c, e), y, d.z0 + ez * spow(s, e)];
  }

  /* ---------- grilles ---------- */
  function grid(rows, closeU) {
    const nv = rows.length, nu = rows[0].length;
    const pos = new Float32Array(nv * nu * 3);
    let k = 0;
    for (const r of rows) for (const p of r) { pos[k++] = p[0]; pos[k++] = p[1]; pos[k++] = p[2]; }
    const idx = [], uMax = closeU ? nu : nu - 1;
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < uMax; i++) {
      const i2 = (i + 1) % nu;
      const a = j * nu + i, b = j * nu + i2, c = (j + 1) * nu + i2, d = (j + 1) * nu + i;
      idx.push(a, c, b, a, d, c);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }
  function fan(ring, down) {
    const n = ring.length, pos = new Float32Array((n + 1) * 3);
    let cx = 0, cy = 0, cz = 0;
    ring.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; cx += p[0]; cy += p[1]; cz += p[2]; });
    pos[n * 3] = cx / n; pos[n * 3 + 1] = cy / n; pos[n * 3 + 2] = cz / n;
    const idx = [];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (down) idx.push(n, i, j); else idx.push(n, j, i); }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }

  /* ---------- patch : panneau de coque découpé dans un profil ----------
     o.tab : profil ; o.map(u, v) -> [theta, y] (u, v ∈ [0,1]) ; o.nu, o.nv : résolution
     o.off : décalage normal ; o.c : chanfrein du bord ; o.t : profondeur de la paroi du bord
     o.closed : anneau complet (u périodique) ; o.capB / o.capT : fermer le bas / le haut
     o.axis : 'y' (défaut) | 'x' (y du profil -> +X) | 'z' (y du profil -> +Z, z du profil -> -Y) */
  function patch(key, o) {
    const nu = o.nu, nv = o.nv, ck = key + '|' + nu + 'x' + nv;
    if (GC[ck]) return GC[ck];
    const tab = o.tab, map = o.map, closed = !!o.closed;
    const off = o.off || 0, c = o.c == null ? 0.45 : o.c, t = o.t == null ? 1.2 : o.t;
    const at = (u, v, of) => { const m = map(u, v); return SP(tab, m[0], m[1], of); };
    const len = f => { let s = 0, p = f(0); for (let i = 1; i <= 24; i++) { const q = f(i / 24); s += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); p = q; } return s; };
    let du = 0, dv = 0;
    if (c > 0) {
      dv = Math.min(0.25, c / Math.max(0.01, len(v => at(0.5, v, off))));
      if (!closed) du = Math.min(0.25, c / Math.max(0.01, len(u => at(u, 0.5, off))));
    }
    const us = [], vs = [], ub = [], vb = [];
    const nU = closed ? nu : nu + 1;
    for (let i = 0; i < nU; i++) { const s = i / nu; us.push(closed ? s : du + (1 - 2 * du) * s); ub.push(s); }
    for (let j = 0; j <= nv; j++) { const s = j / nv; vs.push(dv + (1 - 2 * dv) * s); vb.push(s); }
    const rows = vs.map(v => us.map(u => at(u, v, off)));
    const geos = [grid(rows, closed)];
    const oc = c > 0 ? off - c : off, ow = off - t;
    const loops = [];
    if (closed) {
      loops.push([rows[0], us.map(u => at(u, 0, oc)), us.map(u => at(u, 0, ow))]);
      loops.push([rows[nv].slice().reverse(), us.map(u => at(u, 1, oc)).reverse(), us.map(u => at(u, 1, ow)).reverse()]);
    } else {
      const A = [], B = [], W = [];
      const push = (a, u, v) => { A.push(a); B.push(at(u, v, oc)); W.push(at(u, v, ow)); };
      for (let i = 0; i <= nu; i++) push(rows[0][i], ub[i], 0);
      for (let j = 0; j <= nv; j++) push(rows[j][nu], 1, vb[j]);
      for (let i = nu; i >= 0; i--) push(rows[nv][i], ub[i], 1);
      for (let j = nv; j >= 0; j--) push(rows[j][0], 0, vb[j]);
      loops.push([A, B, W]);
    }
    for (const [A, B, W] of loops) {
      if (c > 0) geos.push(grid([B, A], true));
      if (t > 0) geos.push(grid([W, c > 0 ? B : A], true));
    }
    if (closed && o.capB) geos.push(fan(us.map(u => at(u, 0, t > 0 ? ow : oc)), true));
    if (closed && o.capT) geos.push(fan(us.map(u => at(u, 1, t > 0 ? ow : oc)), false));
    const geo = geos.length > 1 ? BGU.mergeGeometries(geos, false) : geos[0];
    if (o.axis === 'x') geo.rotateZ(-PI / 2); else if (o.axis === 'z') geo.rotateX(PI / 2);
    return (GC[ck] = geo);
  }
  // fusion locale de petites géométries (une seule mesh) : items = [[geo, [x,y,z], [rx,ry,rz] | Matrix4, échelle]]
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();
  function fuse(key, items) {
    if (GC[key]) return GC[key];
    const list = items.map(([geo, p, r, s]) => {
      const gg = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const n of Object.keys(gg.attributes)) if (n !== 'position' && n !== 'normal') gg.deleteAttribute(n);
      if (r && r.isMatrix4) _m.copy(r);
      else _m.compose(_v.set(...(p || [0, 0, 0])), _q.setFromEuler(_e.set(...(r || [0, 0, 0]))), Array.isArray(s) ? _s.set(...s) : _s.setScalar(s || 1));
      gg.applyMatrix4(_m); return gg;
    });
    return (GC[key] = BGU.mergeGeometries(list, false));
  }
  // couronne de vis (axe Z)
  const boltRing = (g, n, R, r, h, a0 = 0) => fuse(`optBolts${n},${R},${r},${h},${a0}`, Array.from({ length: n }, (_, i) => { const a = a0 + i / n * 2 * PI; return [g.cyl(r, r, h, 6, 'z'), [Math.cos(a) * R, Math.sin(a) * R, 0]]; }));
  // cartes (u, v) -> [theta, y]
  const fv = (f, th) => typeof f === 'function' ? f(th) : f;
  const band = (th0, th1, yb, yt) => (u, v) => { const th = lerp(th0, th1, u); return [th, lerp(fv(yb, th), fv(yt, th), v)]; };
  const shield = (y0, y1, wf, c0 = 0) => (u, v) => { const y = lerp(y0, y1, v), w = wf(y); return [c0 + lerp(-w, w, u), y]; };

  /* ---------- profils du robot (unités design, 1 ≈ 1 cm) ---------- */
  // tête (centre = origine, visage vers +X) : profil analytique (dôme superelliptique,
  // menton étroit avancé, nuque coupée), échantillonné finement
  const HEAD = (() => {
    const yT = 13.4, yB = -11.8, yc = 2.2, yz = 3.2, list = [];
    const se = (t, n) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(t)), n)), 1 / n);
    for (let i = 0; i <= 50; i++) {
      const y = yB + (yT - yB) * (1 - Math.cos(i / 50 * PI)) / 2;
      const kx = y >= yc ? se((y - yc) / (yT - yc), 2.5) : se((yc - y) / (yc - yB), 2.1);
      const kz = y >= yz ? se((y - yz) / (yT - yz), 2.4) : se((yz - y) / (yz - yB), 1.75);
      const lowK = y < -2 ? Math.min(1, (-2 - y) / 9) : 0;          // 0 → 1 vers le menton
      list.push({ y, xf: Math.max(0.05, 10.1 * kx), xb: Math.max(0.05, 10.7 * kx * (1 - 0.3 * lowK)), z: Math.max(0.05, 8.7 * kz),
        x0: 2.6 * lowK - 0.25 * Math.max(0, (y - 4) / 9), nf: 2.35, nb: 2.15 });
    }
    return prof(list);
  })();
  // largeur angulaire de la visière en fonction de y
  const FACE_W = curve([[-10.6, 24], [-8, 44], [-3, 58], [3, 62], [7, 57], [9.8, 40]].map(([y, a]) => [y, a * D]));
  // buste (origine = bassin)
  const TB = prof([
    { y: 22.5, xf: 8.32, xb: 7.9, z: 11.98 },
    { y: 25, xf: 9.15, xb: 8.32, z: 12.73 },
    { y: 30, xf: 11.23, xb: 9.78, z: 14.55 },
    { y: 36, xf: 13.1, xb: 11.02, z: 16.69 },
    { y: 42, xf: 13.94, xb: 11.75, z: 18.19 },
    { y: 48, xf: 13.52, xb: 12.06, z: 19.05 },
    { y: 53, xf: 12.06, xb: 11.44, z: 18.62 },
    { y: 57, xf: 9.78, xb: 10.19, z: 16.05 },
    { y: 60.2, xf: 6.66, xb: 7.49, z: 10.49 },
    { y: 62.4, xf: 4.78, xb: 5.2, z: 5.99 }
  ].map(s => Object.assign({ nf: 3.0, nb: 2.6 }, s)));
  const YOKE = th => Math.cos(th) >= 0 ? 52.6 + 3.6 * (1 - Math.cos(th)) : 56.2 + 2.4 * Math.cos(th);
  const PEC_B = th => 36.4 + 7 * Math.pow(Math.min(1, Math.abs(th) / (100 * D)), 1.4);
  const RIB_B = th => 23.6 + 3.2 * Math.pow(Math.min(1, Math.abs(Math.sin(th / 2)) * 1.6), 0.8);
  // taille (abdomen)
  const WB = prof([
    { y: 4, xf: 10.09, xb: 9.68, z: 13.61 },
    { y: 9, xf: 9.68, xb: 9.27, z: 12.74 },
    { y: 15, xf: 9.06, xb: 8.86, z: 11.88 },
    { y: 21, xf: 9.17, xb: 8.86, z: 11.99 },
    { y: 27, xf: 9.68, xb: 9.27, z: 12.96 },
    { y: 31, xf: 10.51, xb: 9.68, z: 14.04 }
  ].map(s => Object.assign({ n: 2.8 }, s)));
  // bassin
  const PB = prof([
    { y: -11, xf: 5.6, xb: 5.4, z: 5.72 },
    { y: -7, xf: 8.6, xb: 8.4, z: 10.6 },
    { y: -2, xf: 10.2, xb: 10.2, z: 13.57 },
    { y: 4, xf: 10.6, xb: 10.4, z: 14.63 },
    { y: 9.5, xf: 10, xb: 9.6, z: 13.78 }
  ].map(s => Object.assign({ n: 2.9 }, s)));
  // membres : repère du membre (origine = articulation proximale, +Y vers l'extrémité,
  // AVANT = -X (donc xb), extérieur = +Z (zo) ; le côté 'b' est obtenu par miroir)
  const UA = prof([
    { y: 0, xf: 6.16, xb: 6.16, zo: 6.16, zi: 5.94 },
    { y: 7, xf: 6.71, xb: 6.93, zo: 7.04, zi: 6.49 },
    { y: 14, xf: 6.6, xb: 6.93, zo: 6.82, zi: 6.27 },
    { y: 22, xf: 5.94, xb: 6.27, zo: 6.05, zi: 5.72 },
    { y: 29, xf: 5.17, xb: 5.39, zo: 5.28, zi: 5.06 },
    { y: 33, xf: 4.73, xb: 4.95, zo: 4.84, zi: 4.62 }
  ].map(s => Object.assign({ n: 2.6 }, s)));
  const FA = prof([
    { y: 0, xf: 5.29, xb: 5.29, zo: 5.4, zi: 5.18 },
    { y: 4, xf: 5.83, xb: 6.05, zo: 6.05, zi: 5.72 },
    { y: 10, xf: 5.94, xb: 6.05, zo: 6.16, zi: 5.72 },
    { y: 18, xf: 5.18, xb: 5.18, zo: 5.29, zi: 4.97 },
    { y: 24, xf: 4.21, xb: 4.21, zo: 4.32, zi: 4.1 },
    { y: 27, xf: 3.67, xb: 3.67, zo: 3.78, zi: 3.56 },
    { y: 31, xf: 3.24, xb: 3.24, zo: 3.35, zi: 3.13 }
  ].map(s => Object.assign({ n: 2.6 }, s)));
  const TH = prof([
    { y: 0, xf: 7.7, xb: 8.99, zo: 8.86, zi: 7.13 },
    { y: 6, xf: 8.77, xb: 10.27, zo: 9.72, zi: 7.88 },
    { y: 16, xf: 8.56, xb: 9.95, zo: 9.4, zi: 7.67 },
    { y: 28, xf: 7.49, xb: 8.45, zo: 8.1, zi: 6.8 },
    { y: 38, xf: 6.21, xb: 6.74, zo: 6.7, zi: 5.72 },
    { y: 44, xf: 5.35, xb: 5.56, zo: 5.62, zi: 4.97 }
  ].map(s => Object.assign({ nf: 2.4, nb: 2.9 }, s)));
  const SH = prof([
    { y: 0, xf: 5.72, xb: 6.36, zo: 6.15, zi: 5.51 },
    { y: 6, xf: 7, xb: 6.68, zo: 6.47, zi: 5.72 },
    { y: 16, xf: 7.31, xb: 6.04, zo: 6.15, zi: 5.41 },
    { y: 28, xf: 6.04, xb: 4.98, zo: 5.09, zi: 4.66 },
    { y: 38, xf: 4.45, xb: 4.24, zo: 4.24, zi: 3.92 },
    { y: 44, xf: 3.6, xb: 3.6, zo: 3.6, zi: 3.39 }
  ].map(s => Object.assign({ nf: 2.4, nb: 2.8 }, s)));
  // pied : profil le long de +X (axis 'x') ; x du profil = -Y du pied (xf = vers le bas, xb = vers le haut)
  const FT = prof([
    { y: -7.4, xf: 0.6, xb: 0.8, z: 2.0 },
    { y: -6.9, xf: 0.6, xb: 4.4, z: 3.9 },
    { y: -5, xf: 0.6, xb: 6.2, z: 4.6 },
    { y: -2, xf: 0.6, xb: 6.8, z: 4.8 },
    { y: 1.5, xf: 0.6, xb: 6.6, z: 4.9 },
    { y: 5, xf: 0.6, xb: 5.3, z: 5.0 },
    { y: 9, xf: 0.6, xb: 4.0, z: 5.1 },
    { y: 12.6, xf: 0.6, xb: 3.1, z: 4.9 },
    { y: 16.4, xf: 0.6, xb: 2.3, z: 4.3 },
    { y: 18.6, xf: 0.6, xb: 1.4, z: 3.0 },
    { y: 19.5, xf: 0.5, xb: 0.4, z: 1.0 }
  ].map(s => Object.assign({ x0: 5.2, nf: 2.2, nb: 2.6 }, s)));
  // épaulière : profil le long de +Z (axis 'z') ; z du profil = -Y (zo = vers le bas, zi = vers le haut)
  const CAP = prof([
    { y: -7.5, xf: 7.13, xb: 7.56, zo: 4.54, zi: 7.99 },
    { y: 0, xf: 7.88, xb: 8.32, zo: 5.62, zi: 8.64 },
    { y: 4.8, xf: 7.56, xb: 7.99, zo: 5.4, zi: 8.21 },
    { y: 7.3, xf: 5.72, xb: 6.16, zo: 4.21, zi: 6.37 },
    { y: 8.2, xf: 1.84, xb: 2.05, zo: 1.4, zi: 2.05 }
  ].map(s => Object.assign({ n: 3.3 }, s)));

  // rotule : petit profil le long de +Z (axis 'z')
  const KNEE = prof([{ y: -4.8, xf: 5.72, xb: 6.78, zo: 6.36, zi: 5.94 }, { y: 0, xf: 5.94, xb: 7.1, zo: 6.57, zi: 6.15 }, { y: 4.8, xf: 5.72, xb: 6.78, zo: 6.36, zi: 5.94 }].map(s => Object.assign({ n: 2.6 }, s)));

  /* ---------- lettrage TESLA (barres : [a, b, largeur, hauteur, angle]) ---------- */
  const GLYPHS = {
    T: [[0, 1.1, 2.7, 0.42], [0, -0.2, 0.42, 2.2]],
    E: [[0, 1.1, 2.2, 0.42], [0, 0, 2.2, 0.42], [0, -1.1, 2.2, 0.42]],
    S: [[0.15, 1.1, 2.0, 0.42], [0, 0, 2.0, 0.42], [-0.15, -1.1, 2.0, 0.42], [-0.95, 0.55, 0.42, 1.1], [0.95, -0.55, 0.42, 1.1]],
    L: [[-0.9, 0.05, 0.42, 2.6], [0.1, -1.1, 2.0, 0.42]],
    A: [[-0.55, 0, 0.42, 2.75, -0.4], [0.55, 0, 0.42, 2.75, 0.4]]
  };

  /* =========================================================
     SKINS : palette / finitions par ctx.skin (ORIGINAL = matériaux d'origine, rien ne change)
     Chaque entrée remplace des « emplacements » de matériau du modèle :
       shell (coques blanches) · black (noir laqué) · satin (noir satiné) · visor · graph (actionneurs)
       steel (vis, disques, tiges) · seam · rubber · text (vis latérales) · letters (lettrage TESLA)
       gun (plaque de bassin) · palm / finger (main) · led (filet lumineux de la visière)
       helmet (casque) · coreT / coreS (noyaux visibles dans les joints entre panneaux : torse /
       taille-tête-épaules-pieds) · coreL (liserés ajoutés au fond des joints des membres)
       → liserés lumineux ou métalliques
     Valeur : paramètres de ctx.mat (+ pat/ps/rk : motif triplanaire, inner/ii : lueur interne),
              { glow, i } pour un matériau émissif, ou le nom d'un autre emplacement.
     ========================================================= */
  const SKINS = {
    // NOIR CARBONE : coques en fibre de carbone vernie, liserés et visserie or, filet LED doré
    carbon: {
      shell: { color: 0xffffff, pat: 'carbon', ps: 0.3, rk: 0.7, roughness: 0.4, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 0.85 },
      gun: { color: 0xffffff, pat: 'carbon', ps: 0.3, rk: 0.7, roughness: 0.4, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 0.85 },
      graph: { color: 0x2b2824, roughness: 0.28, metalness: 0.9, envMapIntensity: 0.9 },
      steel: { color: 0xe9bc62, roughness: 0.2, metalness: 1, envMapIntensity: 1.2 },
      letters: { color: 0xf3c466, roughness: 0.16, metalness: 1, envMapIntensity: 1.3, inner: 0xffa21a, ii: 0.25 },
      coreT: { color: 0xd9a64a, roughness: 0.24, metalness: 1, envMapIntensity: 1.2, inner: 0xffa020, ii: 0.5 },
      coreL: 'coreT', coreS: 'coreT',
      palm: { color: 0x1c1d21, roughness: 0.18, metalness: 1, envMapIntensity: 1.1 },
      finger: { color: 0x2c2d33, roughness: 0.2, metalness: 1, envMapIntensity: 1.1 },
      led: { glow: 0xffbe3c, i: 3.8 }
    },
    // CHROME LIQUIDE : coques et casque miroir, pièces noires en chrome fumé violine, LED ultraviolet épaissie
    // (envMapIntensity modéré : un miroir à 1.8 renvoyait les enseignes néon au-delà du seuil du bloom → taches roses)
    chrome: {
      shell: { color: 0xe2e6ec, roughness: 0.12, metalness: 1, envMapIntensity: 1.3 },
      helmet: 'shell',
      black: { color: 0x2a2240, roughness: 0.14, metalness: 1, envMapIntensity: 1.25 },
      satin: { color: 0x1d1928, roughness: 0.3, metalness: 0.85, envMapIntensity: 0.9 },
      letters: { color: 0x07080a, roughness: 0.2, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 },
      steel: { color: 0x2a2c31, roughness: 0.12, metalness: 1, envMapIntensity: 1.2 },
      visor: { color: 0x07050d, roughness: 0.03, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.2 },
      led: { glow: 0xa070ff, i: 6 }, ledR: 0.5
    },
    // ROUGE TESLA : rouge métallisé multicouche (« Ultra Red »), noir laqué, lettrage blanc nacré, LED blanche
    rouge: {
      shell: { color: 0xb40f20, roughness: 0.3, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.025, envMapIntensity: 0.85 },
      letters: { color: 0xf2f4f8, roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.6 },
      led: { glow: 0xf2f4ff, i: 3.4 }
    },
    // OR 24 CARATS : placage or poli miroir (sans vernis, qui délavait l'or en cyan), légère chaleur interne
    // pour qu'il reste « or » sous les néons cyan / verts, noir laqué, LED ambre
    or: {
      shell: { color: 0xffcf5c, roughness: 0.15, metalness: 1, envMapIntensity: 1.05, inner: 0xffa230, ii: 0.05 },
      steel: { color: 0xffd98a, roughness: 0.12, metalness: 1, envMapIntensity: 1.3 },
      graph: { color: 0x1d1d20, roughness: 0.22, metalness: 1, envMapIntensity: 1.0 },
      letters: { color: 0x0a0a0c, roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.1 },
      finger: { color: 0xe7b354, roughness: 0.22, metalness: 1, envMapIntensity: 1.0 },
      led: { glow: 0xff9326, i: 3.8 }
    },
    // CYBERPUNK : noir mat, joints de panneaux lumineux magenta / cyan, arcs de visière roses
    cyber: {
      shell: { color: 0x1c1c23, roughness: 0.62, metalness: 0.1, clearcoat: 0.15, clearcoatRoughness: 0.5, envMapIntensity: 0.5 },
      gun: { color: 0x1c1c23, roughness: 0.62, metalness: 0.1, clearcoat: 0.15, clearcoatRoughness: 0.5, envMapIntensity: 0.5 },
      visor: { color: 0x12051a, roughness: 0.03, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.2 },
      letters: { glow: 0x37ecff, i: 2.6 },
      coreT: { glow: 0xff2bd6, i: 2.6 },
      coreL: { glow: 0x2fe6ff, i: 2.4 },
      coreS: 'coreT',
      led: { glow: 0xff3cdc, i: 4.2 }
    },
    // ARCTIQUE : blanc nacré irisé, pièces en glace givrée, joints bleu glacier
    arctic: {
      shell: { color: 0xeef4ff, roughness: 0.22, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.55, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 520], envMapIntensity: 0.55 },
      black: { color: 0xb4e0ff, pat: 'frost', ps: 1 / 9, roughness: 0.4, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.6, inner: 0x4aa8ff, ii: 0.16 },
      satin: { color: 0x3b4e66, roughness: 0.32, metalness: 0.75, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.8 },
      helmet: 'shell',
      visor: { color: 0x03101f, roughness: 0.03, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.2 },
      letters: { color: 0x5aa8e0, roughness: 0.25, metalness: 0.6, envMapIntensity: 1.0 },
      coreT: { glow: 0x7fd4ff, i: 1.5 }, coreL: 'coreT', coreS: 'coreT',
      led: { glow: 0xc6f3ff, i: 3.6 }
    },
    // MILITAIRE : camouflage olive mat, noir olive « cerakote », marquages au pochoir, LED vert nuit
    // (camouflage éclairci + vernis satiné : l'ancien olive mat se fondait dans les décors sombres)
    army: {
      shell: { color: 0xffffff, pat: 'camo', ps: 1 / 56, roughness: 0.56, metalness: 0.05, clearcoat: 0.3, clearcoatRoughness: 0.42, envMapIntensity: 0.5 },
      black: { color: 0x30342a, roughness: 0.5, metalness: 0.25, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 0.45 },
      satin: { color: 0x22251d, roughness: 0.55, metalness: 0.25, envMapIntensity: 0.4 },
      helmet: { color: 0x6c7448, roughness: 0.52, metalness: 0.05, clearcoat: 0.3, clearcoatRoughness: 0.42, envMapIntensity: 0.5 },
      graph: { color: 0x3a3d37, roughness: 0.45, metalness: 0.8, envMapIntensity: 0.6 },
      steel: { color: 0x9c8a5a, roughness: 0.4, metalness: 0.9, envMapIntensity: 0.7 },
      letters: { color: 0xd9d0a8, roughness: 0.82 },
      visor: { color: 0x0b0d08, roughness: 0.05, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.0 },
      led: { glow: 0x9cff3a, i: 3.2 }
    }
  };

  /* ---------- motifs procéduraux (dessinés une fois, en cache) ---------- */
  const PATS = {};
  function patTex(kind) {
    if (PATS[kind]) return PATS[kind];
    const n = kind === 'camo' ? 512 : 256, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const c = cv.getContext('2d'), img = c.createImageData(n, n), d = img.data;
    let r = 9137; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    const put = (i, R, G, B) => { d[i * 4] = R; d[i * 4 + 1] = G; d[i * 4 + 2] = B; d[i * 4 + 3] = 255; };
    if (kind === 'carbon') { // sergé 2/2 : mèches horizontales / verticales en escalier
      const cell = 32;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const cx = (x / cell) | 0, cy = (y / cell) | 0, fx = (x % cell + 0.5) / cell, fy = (y % cell + 0.5) / cell;
        const hor = ((cx + 3 * cy) & 3) < 2;
        const a = hor ? fy : fx, al = hor ? fx : fy;
        const round = Math.pow(Math.sin(a * Math.PI), 0.6);
        const fib = 0.86 + 0.14 * Math.sin((hor ? y : x) * 2.7 + Math.sin((hor ? x : y) * 0.09) * 2);
        const end = 0.75 + 0.25 * Math.pow(Math.sin(al * Math.PI), 0.3);
        const v = (hor ? 72 : 40) * round * fib * end + 12;
        put(y * n + x, v, v, v * 1.06);
      }
    } else if (kind === 'camo') { // camouflage « woodland » raccordable (bruit de valeur périodique)
      const mk = (G) => { const t = Array.from({ length: G * G }, rnd); return (x, y) => {
        x *= G; y *= G; const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const v = (i, j) => t[(((j % G) + G) % G) * G + (((i % G) + G) % G)];
        return lerp(lerp(v(xi, yi), v(xi + 1, yi), sx), lerp(v(xi, yi + 1), v(xi + 1, yi + 1), sx), sy);
      }; };
      const fbm = () => { const a = mk(4), b = mk(8), e = mk(16); return (x, y) => a(x, y) * 0.58 + b(x, y) * 0.3 + e(x, y) * 0.12; };
      const A = fbm(), B = fbm(), C = fbm(), E = fbm();
      const COL = { base: [150, 156, 98], brown: [134, 104, 68], dark: [80, 94, 52], black: [38, 40, 33], tan: [204, 192, 142] };
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const u = x / n, v = y / n;
        let col = COL.base;
        if (E(u, v) > 0.6) col = COL.tan;
        if (A(u, v) > 0.54) col = COL.brown;
        if (B(u, v) > 0.56) col = COL.dark;
        const k = C(u, v); if (k > 0.6 && k < 0.66) col = COL.black;
        const gr = 0.94 + rnd() * 0.08;
        put(y * n + x, col[0] * gr, col[1] * gr, col[2] * gr);
      }
    } else if (kind === 'frost') { // glace craquelée : facettes de Voronoï à teinte franche + fines fêlures blanches (raccordable)
      const pts = Array.from({ length: 26 }, () => [rnd() * n, rnd() * n, rnd()]);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        let d1 = 1e9, d2 = 1e9, cv = 0;
        for (const [px, py, pv] of pts) for (let oy = -n; oy <= n; oy += n) for (let ox = -n; ox <= n; ox += n) {
          const dd = (x - px - ox) ** 2 + (y - py - oy) ** 2;
          if (dd < d1) { d2 = d1; d1 = dd; cv = pv; } else if (dd < d2) d2 = dd;
        }
        const e = Math.sqrt(d2) - Math.sqrt(d1);
        const v = 150 + 40 * cv + (e < 1.2 ? 90 : e < 3 ? 35 * (1 - (e - 1.2) / 1.8) : 0) + 18 * Math.exp(-Math.sqrt(d1) / 30) + rnd() * 6;
        put(y * n + x, Math.max(0, v - 26), Math.min(255, v + 6), 255);
      }
    }
    c.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return (PATS[kind] = t);
  }

  /* ---------- décalcomanies (canvas transparent ; flip = version miroir pour un combattant tourné à gauche) ---------- */
  function decalTex(kind, flip) {
    const key = kind + (flip ? '|f' : '');
    if (PATS[key]) return PATS[key];
    const W = 256, H = kind === 'roundel' ? 256 : 192, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    if (flip) { c.translate(W, 0); c.scale(-1, 1); }
    c.fillStyle = '#fff'; c.strokeStyle = '#fff';
    if (kind === 'roundel') { // étoile dans un cercle (symétrique)
      c.lineWidth = 16; c.beginPath(); c.arc(128, 128, 104, 0, 2 * PI); c.stroke();
      c.beginPath();
      for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, rr = i % 2 ? 36 : 88; c.lineTo(128 + Math.cos(a) * rr, 134 + Math.sin(a) * rr); }
      c.closePath(); c.fill();
    } else if (kind === 'unit') { // numéro d'unité au pochoir + matricule
      const F = '"DejaVu Sans", "Liberation Sans", Arial, sans-serif';
      c.font = `bold 132px ${F}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillText('0', 84, 122); c.fillText('7', 174, 122);
      c.fillRect(20, 136, 216, 7);
      c.font = `bold 34px ${F}`; c.fillText('OPT-2', 128, 178);
      // ponts du pochoir (haut et bas du 0, coude du 7)
      c.globalCompositeOperation = 'destination-out';
      c.fillRect(80, 0, 8, 46); c.fillRect(80, 92, 8, 40); c.fillRect(150, 44, 50, 7);
    }
    // usure de peinture
    c.globalCompositeOperation = 'destination-out';
    let r = 4242; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 140; i++) { c.globalAlpha = 0.3 + rnd() * 0.6; c.beginPath(); c.arc(rnd() * W, rnd() * H, 0.5 + rnd() * 1.8, 0, 2 * PI); c.fill(); }
    const t = new T.CanvasTexture(cv);
    t.flipY = false; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return (PATS[key] = t);
  }
  // panneau de décalcomanie épousant un profil (avec UV : u le long de theta, v le long de y)
  function decalGeo(key, tab, th0, th1, y0, y1, off, nu = 10, nv = 8) {
    const ck = 'optDecal' + key;
    if (GC[ck]) return GC[ck];
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      pos.push(...SP(tab, lerp(th0, th1, u), lerp(y0, y1, v), off)); uv.push(u, v);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
      idx.push(a, c, b, a, d, c);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return (GC[ck] = geo);
  }

  /* ---------- matériau d'un emplacement de skin ----------
     Motif triplanaire (repère local de la pièce, unités design) et lueur interne passent par
     onBeforeCompile + uniforms : la lueur interne n'utilise pas .emissive (réservé au flash d'impact). */
  function fxMat(ctx, spec) {
    if (spec.glow != null) return ctx.glow(spec.glow, spec.i == null ? 3 : spec.i);
    const p = Object.assign({}, spec), pat = p.pat, ps = p.ps || 0.05, rk = p.rk || 0, inner = p.inner, ii = p.ii || 0;
    for (const k of ['pat', 'ps', 'rk', 'inner', 'ii']) delete p[k];
    const m = ctx.mat(p);
    if (ctx.override || (!pat && inner == null)) return m;
    const key = 'optSkin' + (pat ? 'P' : '') + (inner != null ? 'I' : '');
    m.customProgramCacheKey = () => key;
    m.onBeforeCompile = sh => {
      let v = sh.vertexShader, f = sh.fragmentShader;
      if (pat) {
        Object.assign(sh.uniforms, { uTri: { value: patTex(pat) }, uTriS: { value: ps }, uTriR: { value: rk } });
        v = v.replace('#include <common>', '#include <common>\nvarying vec3 vTriP;\nvarying vec3 vTriN;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTriP = position;\nvTriN = normal;');
        f = f.replace('#include <common>', '#include <common>\nuniform sampler2D uTri;\nuniform float uTriS;\nuniform float uTriR;\nvarying vec3 vTriP;\nvarying vec3 vTriN;')
          .replace('#include <map_fragment>', `#include <map_fragment>
vec3 triW = pow(abs(normalize(vTriN)), vec3(4.0)); triW /= (triW.x + triW.y + triW.z + 1e-5);
vec3 triC = texture2D(uTri, vTriP.zy * uTriS).rgb * triW.x + texture2D(uTri, vTriP.xz * uTriS).rgb * triW.y + texture2D(uTri, vTriP.xy * uTriS).rgb * triW.z;
diffuseColor.rgb *= triC;`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * (1.0 + uTriR * (0.25 - dot(triC, vec3(0.333)) * 4.0)), 0.04, 1.0);`);
      }
      if (inner != null) {
        sh.uniforms.uInner = { value: new T.Color(inner).multiplyScalar(ii) };
        f = f.replace('#include <common>', '#include <common>\nuniform vec3 uInner;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uInner;');
      }
      sh.vertexShader = v; sh.fragmentShader = f;
    };
    return m;
  }

  return function (ctx) {
    const { g, M, L } = ctx;
    const low = ctx.lod === 'low';
    const P = {};
    const add = (parent, geo, mat, p, r, s) => ctx.add(parent, geo, mat, { p, r, s });

    /* ---------- matériaux (skin : SKINS[ctx.skin] ; ORIGINAL = matériaux d'origine) ---------- */
    const SKN = SKINS[ctx.skin] || null;
    const slot = {};
    const pick = (k, dflt) => {
      const sp = SKN && SKN[k];
      return (slot[k] = sp == null ? dflt() : typeof sp === 'string' ? slot[sp] : fxMat(ctx, sp));
    };
    const WH = pick('shell', () => M.shell);  // coque blanche laquée
    const BK = pick('black', () => M.black);  // noir laqué
    const SB = pick('satin', () => ctx.mat({ color: 0x141519, roughness: 0.38, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 0.55 })); // noir satiné
    const VI = pick('visor', () => M.visor);  // visière
    const GR = pick('graph', () => ctx.mat({ color: 0x4d5159, roughness: 0.3, metalness: 0.9, envMapIntensity: 0.9 })); // graphite (actionneurs)
    const ST = pick('steel', () => M.steel), SE = pick('seam', () => M.seam), RU = pick('rubber', () => ctx.mat({ color: 0x0e0f11, roughness: 0.62, metalness: 0.05, envMapIntensity: 0.3 }));
    const TX = pick('text', () => ctx.mat({ color: 0x5b5e65, roughness: 0.45, metalness: 0.25 }));   // lettrage
    const LED = pick('led', () => ctx.glow(0x46f0ff, 3.4));
    let LETTERS = null; // lettrage « TESLA » (retourné selon le sens du combattant)
    const GM = pick('gun', () => ctx.mat({ color: 0x24272d, roughness: 0.28, metalness: 0.55, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: 0.7 })); // gunmetal (bassin)
    const HM = pick('palm', () => ctx.mat({ color: 0x4a4e57, roughness: 0.32, metalness: 0.85, envMapIntensity: 0.95 })); // main
    const FM = pick('finger', () => ctx.mat({ color: 0x6b7079, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.0 })); // doigts
    // emplacements propres aux skins (ORIGINAL : mêmes objets matériau qu'avant → modèle identique)
    const HELM = pick('helmet', () => BK);    // casque
    const LT = pick('letters', () => TX);     // lettrage TESLA
    const CT = pick('coreT', () => BK), CL = pick('coreL', () => SB), CS = pick('coreS', () => SE); // noyaux visibles entre panneaux

    // pièce latérale : le côté 'b' est un miroir en Z ; ly = facteur de longueur (os réel / os de conception)
    const sidePart = (sd, build, ly = 1) => { const part = ctx.group(), inner = ctx.group(); inner.scale.set(1, ly, sd < 0 ? -1 : 1); part.add(inner); build(inner); return part; };
    const YV = new T.Vector3(0, 1, 0);
    // tige / vérin entre deux points a et b
    const rod = (parent, a, b, r, mat, seg = 10) => {
      const va = new T.Vector3(...a), vb = new T.Vector3(...b), d = vb.clone().sub(va), l = d.length();
      const m = ctx.add(parent, g.cyl(r, r, l, seg), mat, { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] });
      m.quaternion.setFromUnitVectors(YV, d.normalize()); return m;
    };
    // petit élément posé sur la surface d'un profil (axe Y du géo = normale)
    const onSurf = (parent, tab, th, y, geo, mat, lift = 0) => {
      const p0 = SP(tab, th, y, 0), p1 = SP(tab, th + 0.01, y, 0), p2 = SP(tab, th, y + 0.05, 0);
      const tu = new T.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), tv = new T.Vector3(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
      const n = tv.cross(tu).normalize();
      const m = ctx.add(parent, geo, mat, { p: [p0[0] + n.x * lift, p0[1] + n.y * lift, p0[2] + n.z * lift] });
      m.quaternion.setFromUnitVectors(YV, n); return m;
    };
    const full = (key, tab, y0, y1, nu, nv, o = {}) => patch(key, Object.assign({ tab, map: band(0, 2 * PI, y0, y1), closed: true, nu, nv, c: 0, t: 0 }, o));
    // skins : liseré (lumineux / métallique) au fond d'un joint entre deux panneaux de membre ; ORIGINAL : rien
    const SEAMS = !!(SKN && SKN.coreL);
    // MILITAIRE : marquages au pochoir (n° d'unité sur la cuisse côté caméra, cocarde étoilée sur les bras)
    const decMat = map => ctx.mat({ map, color: 0xd9d0a8, roughness: 0.82, metalness: 0, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, envMapIntensity: 0.3 });
    const DEC = ctx.skin === 'army' && !ctx.override ? { unit: decMat(decalTex('unit')), star: decMat(decalTex('roundel')) } : null;
    const seam = (gr, key, tab, th0, th1, y0, y1, nu = 2, nv = 8) => {
      if (SEAMS) add(gr, patch('optSeam' + key, { tab, map: band(th0 * D, th1 * D, y0, y1), nu, nv, off: -0.2, c: 0, t: 0 }), CL);
    };

    /* =====================================================
       LOD bas (images rémanentes) : même silhouette, très peu de triangles
       ===================================================== */
    if (low) {
      const torso = ctx.group();
      add(torso, full('optLoTB', TB, 22.5, 62.4, 10, 5, { capB: true }), WH);
      add(torso, full('optLoWB', WB, 4, 31, 8, 2), BK);
      add(torso, full('optLoPB', PB, -11, 9.5, 8, 3, { capB: true }), BK);
      P.torso = torso;
      P.neck = ctx.group(ctx.mesh(g.cyl(3.4, 3.8, 16, 8), BK, { p: [0, 8, 0] }));
      P.head = ctx.group(ctx.mesh(full('optLoHD', HEAD, -11.8, 13.4, 12, 6, { capB: true }), HELM, { s: 0.93 }));
      for (const [sd, z] of [['f', 1], ['b', -1]]) {
        P[sd + 'ua'] = ctx.group(ctx.mesh(full('optLoUA', UA, 0, 33, 8, 2), WH, { s: [1, L.ua / 33, 1] }));
        P[sd + 'fa'] = ctx.group(ctx.mesh(full('optLoFA', FA, 0, 31, 8, 2), WH, { s: [1, L.fa / 31, 1] }));
        P[sd + 'th'] = ctx.group(ctx.mesh(full('optLoTH', TH, 0, 44, 8, 3), WH, { s: [1, L.th / 44, 1] }));
        P[sd + 'sh'] = ctx.group(ctx.mesh(full('optLoSH', SH, 0, 44, 8, 3), WH, { s: [1, L.sh / 44, 1] }));
        P[sd + 'kn'] = ctx.group(ctx.mesh(g.cyl(5.4, 5.4, 11.8, 8, 'z'), BK));
        P[sd + 'el'] = ctx.group(ctx.mesh(g.cyl(4.9, 4.9, 10.6, 8, 'z'), BK));
        P[sd + 'hi'] = ctx.group(ctx.mesh(g.cyl(6, 6, 12, 8, 'z'), BK));
        P[sd + 'sc'] = ctx.group(ctx.mesh(patch('optLoCAP', { tab: CAP, map: band(0, 2 * PI, -7.5, 8.2), closed: true, nu: 8, nv: 3, c: 0, t: 0, axis: 'z' }), BK, { p: [0, 2.2, 0], s: [1, 1, z] }));
        P[sd + 'fo'] = ctx.group(ctx.mesh(g.cbox(26, 7.5, 10, 2.2), BK, { p: [6, -3.3, 0] }));
        P[sd + 'ha'] = RK.hand(ctx, { side: z, palm: [7.8, 2.9, 6.9], palmMat: HM, fingerMat: FM });
      }
      return { parts: P, shZ: 22, hpZ: 10.6 };
    }

    /* =====================================================
       TORSE : bassin, taille, buste, épaules
       ===================================================== */
    const torso = ctx.group();
    {
      // --- bassin mécanique noir ---
      add(torso, full('optPB', PB, -11, 9.6, 28, 8, { capB: true }), SB);
      // plaque avant laquée en écusson (se resserre vers l'entrejambe)
      add(torso, patch('optPBfront', { tab: PB, map: shield(-10.2, 6.6, curve([[-10.2, 22 * D], [-5, 40 * D], [2, 54 * D], [6.6, 56 * D]])), nu: 14, nv: 8, off: 0.35, c: 0.35, t: 0.9 }), GM);
      // plaque arrière
      add(torso, patch('optPBback', { tab: PB, map: shield(-8.5, 6.6, curve([[-8.5, 24 * D], [-3, 42 * D], [6.6, 50 * D]]), PI), nu: 14, nv: 7, off: 0.35, c: 0.35, t: 0.9 }), BK);
      // ceinture graphite (jonction bassin / taille)
      add(torso, full('optBelt', WB, 6.4, 8.6, 28, 1, { off: 0.25, c: 0.3, t: 0.8 }), GR);
      // carters latéraux des actionneurs de hanche (fixes)
      for (const z of [1, -1]) {
        add(torso, g.ccyl(6.4, 3.2, 0.8, 24, 'z'), GR, [0, 0.5, z * 13.4]);
        add(torso, g.ccyl(4.6, 1.2, 0.4, 24, 'z'), ST, [0, 0.5, z * 15.1]);
        add(torso, boltRing(g, 6, 5.5, 0.42, 0.8, PI / 6), ST, [0, 0.5, z * 15.1]);
        // bielle d'actionneur hanche (abduction) apparente
        add(torso, g.cyl(1.1, 1.1, 9, 10), GR, [-4.2, 5.2, z * 13.2], [0, 0, 0.25]);
      }

      // --- taille noire segmentée ---
      add(torso, full('optWBcore', WB, 4, 31, 16, 4, { off: -1.4 }), CS);
      const bands = [[8.8, 13.6], [14.2, 19.0], [19.6, 24.6]];
      bands.forEach(([a, b], i) => add(torso, full('optWBband' + i, WB, a, b, 32, 3, { c: 0.55, t: 1.6 }), BK));
      // biellettes obliques de la taille (actionneurs de flexion latérale)
      for (const z of [1, -1]) {
        rod(torso, [-3.0, 7.0, z * 13.0], [-3.9, 15.0, z * 13.1], 1.35, SB);
        rod(torso, [-3.8, 14.0, z * 13.1], [-4.5, 20.6, z * 12.9], 0.6, ST, 8);
        add(torso, g.ccyl(1.5, 2.2, 0.4, 12, 'z'), ST, [-3.0, 7.0, z * 13.2]);
        add(torso, g.ccyl(1.2, 2.0, 0.4, 12, 'z'), GR, [-4.5, 20.8, z * 12.8]);
      }
      // colonne vertébrale (dos)
      add(torso, g.cbox(3.2, 21, 4.6, 0.8), GR, [-8.2, 17.5, 0]);
      for (let i = 0; i < 4; i++) add(torso, g.cbox(1.6, 1.4, 6.4, 0.4), SB, [-9.4, 10.5 + i * 5, 0]);

      // --- buste : noyau noir, empiècement noir du col, plastron blanc ---
      add(torso, full('optTBcore', TB, 22.5, 62.4, 24, 8, { off: -0.7, capB: true }), CT);
      add(torso, patch('optYoke', { tab: TB, map: band(0, 2 * PI, YOKE, 62.4), closed: true, nu: 40, nv: 6, c: 0.4, t: 1.0 }), BK);
      // plastron (pectoraux) : bord supérieur sous le col, pli en V en bas
      add(torso, patch('optPec', { tab: TB, map: band(-100 * D, 100 * D, PEC_B, th => YOKE(th) - 0.65), nu: 32, nv: 7, c: 0.45, t: 1.3 }), WH);
      // plaque côtes
      add(torso, patch('optRib', { tab: TB, map: band(-100 * D, 100 * D, RIB_B, th => PEC_B(th) - 0.6), nu: 32, nv: 5, c: 0.45, t: 1.3 }), WH);
      // dos : deux omoplates blanches, gouttière noire au centre
      add(torso, patch('optBackL', { tab: TB, map: band(104 * D, 172 * D, th => RIB_B(th) + 2.5, th => YOKE(th) - 0.65), nu: 14, nv: 8, c: 0.45, t: 1.3 }), WH);
      add(torso, patch('optBackR', { tab: TB, map: band(188 * D, 256 * D, th => RIB_B(th) + 2.5, th => YOKE(th) - 0.65), nu: 14, nv: 8, c: 0.45, t: 1.3 }), WH);

      // --- lettrage TESLA sur le haut du plastron ---
      const word = 'TESLA', yL = 49.4, strokes = [];
      const Mg = new T.Matrix4(), Ms = new T.Matrix4();
      for (let k = 0; k < 5; k++) {
        const zt = (2 - k) * 4.7;
        // point de la surface à cette largeur (bissection sur theta, face avant)
        let lo = -PI / 2, hi = PI / 2;
        for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (SP(TB, m, yL, 0)[2] < zt) lo = m; else hi = m; }
        const th = (lo + hi) / 2, p0 = SP(TB, th, yL, 0), p1 = SP(TB, th + 0.01, yL, 0);
        const tx = p1[0] - p0[0], tz = p1[2] - p0[2], tl = Math.hypot(tx, tz);
        const nx = tz / tl, nz = -tx / tl; // normale sortante
        Mg.compose(new T.Vector3(p0[0] + nx * 0.02, yL, p0[2] + nz * 0.02), new T.Quaternion().setFromEuler(new T.Euler(0, Math.atan2(-nz, nx), 0)), new T.Vector3(1, 1, 1));
        for (const st of GLYPHS[word[k]]) {
          Ms.compose(new T.Vector3(0.12, st[1] * 0.78, -st[0] * 0.78), new T.Quaternion().setFromEuler(new T.Euler(st[4] || 0, 0, 0)), new T.Vector3(1, 0.78, 0.78));
          strokes.push([g.box(0.5, st[3], st[2]), null, Mg.clone().multiply(Ms)]);
        }
      }
      // groupe à part (non fusionné) : retourné selon le sens du combattant pour rester lisible
      LETTERS = new T.Group(); LETTERS.userData.noMerge = true; torso.add(LETTERS);
      add(LETTERS, fuse('optTESLA', strokes), LT);

      // --- structure d'épaule (pont vers les épaulières) ---
      for (const z of [1, -1]) {
        add(torso, g.ccyl(4.8, 7, 0.8, 20, 'z'), SB, [0, 51.6, z * 17.2]);
        add(torso, g.cbox(9, 6, 5, 1.2), BK, [-1, 55.4, z * 15.4], [z * 0.35, 0, 0]);
      }
      // vis du col (comme sur le vrai robot)
      for (const z of [1, -1]) onSurf(torso, TB, z * 34 * D, 57.2, g.ccyl(0.75, 0.6, 0.2, 12), ST, 0.1);
      for (const z of [1, -1]) onSurf(torso, TB, z * 62 * D, 45, g.ccyl(0.6, 0.5, 0.15, 12), TX, 0.05);
      // collerette du cou
      add(torso, g.ccyl(5.4, 2.2, 0.7, 24), GR, [0, 61.6, 0]);
    }
    P.torso = torso;

    /* =====================================================
       COU : colonne noire + tendons/vérins
       ===================================================== */
    {
      const n = ctx.group();
      add(n, g.ccyl(3.7, 13, 0.8, 18), SB, [0, 7.5, 0]);
      add(n, g.ccyl(5.0, 2.4, 0.6, 24), BK, [0, 1.4, 0]);
      for (let i = 0; i < 3; i++) add(n, g.ccyl(3.95, 0.7, 0.25, 18), GR, [0, 4.6 + i * 2.2, 0]);
      for (const z of [1, -1]) {
        rod(n, [3.8, 1.6, z * 2.2], [3.0, 13.2, z * 1.7], 0.6, ST, 8);
        add(n, g.ccyl(1.05, 4.6, 0.3, 10), GR, [3.75, 4.0, z * 2.2]);
        rod(n, [-3.4, 1.0, z * 2.1], [-2.6, 12.5, z * 1.8], 0.8, RU, 8);
      }
      add(n, g.ccyl(2.9, 8.6, 0.6, 16, 'z'), GR, [0, 14.4, 0]);
      P.neck = n;
    }

    /* =====================================================
       TÊTE : œuf noir laqué, visière, filet LED cyan latéral
       ===================================================== */
    {
      const h = ctx.group();
      const SEAM = th => -3.6 + 3.0 * Math.cos(th);   // joint casque / nuque (descend vers l'arrière)
      const dome = (y0, y1) => (u, v) => { const th = u * 2 * PI; return [th, lerp(fv(y0, th), y1, Math.sin(v * PI / 2))]; };
      add(h, full('optHDcore', HEAD, -11.8, 13.4, 18, 9, { off: -0.6, capB: true, map: dome(-11.8, 13.4) }), CS);
      // casque (crâne + nuque), séparé par un joint horizontal à l'arrière
      add(h, full('optHDtop', HEAD, 0, 0, 40, 16, { c: 0.35, t: 0.9, map: dome(SEAM, 13.4) }), HELM);
      add(h, patch('optHDlow', { tab: HEAD, map: band(0, 2 * PI, -11.8, th => SEAM(th) - 0.6), closed: true, nu: 36, nv: 6, c: 0.35, t: 0.9, capB: true }), HELM);
      // visière (face) légèrement en relief
      add(h, patch('optFace', { tab: HEAD, map: shield(-10.8, 9.6, FACE_W), nu: 22, nv: 16, off: 0.4, c: 0.35, t: 1.0 }), VI);
      // filets LED le long des bords latéraux du visage
      for (const z of [1, -1]) {
        const pts = [];
        for (let i = 0; i <= 12; i++) { const y = lerp(-6.4, 8.6, i / 12); pts.push(SP(HEAD, z * (FACE_W(y) + 2.6 * D), y, 0.15)); }
        add(h, g.tube(pts, (SKN && SKN.ledR) || 0.34, 24, 6), LED);
      }
      h.scale.setScalar(0.93);
      P.head = ctx.group(h);
    }

    /* =====================================================
       MAIN (même contrat que RK.hand : origine = poignet, +X = doigts, paume -Y,
       userData.setCurl(c)) : paume effilée, dos noir, phalanges arrondies, pouce opposable
       ===================================================== */
    const PALM_L = 6.6, PALM_T = 2.7, FL = [3.2, 2.35, 1.9], FW = 1.5, FTH = [2.0, 1.85, 1.65];
    const phal = (L, t, w, tip) => fuse(`optPhal${L},${t},${w},${tip}`, [
      [g.cbox(L, t, w, 0.42), [L / 2, 0, 0]],
      [g.cyl(t * 0.5, t * 0.5, w * 0.94, 12, 'z'), [0, 0, 0]],
      ...(tip ? [[g.cyl(t * 0.46, t * 0.46, w * 0.9, 12, 'z'), [L - 0.1, -0.05, 0]]] : [])
    ]);
    function optHand(side) {
      const root = ctx.group(), Dg = D;
      add(root, g.ccyl(2.0, 2.6, 0.4, 14, 'x'), GR, [1.0, 0, 0]);
      add(root, g.ccyl(2.5, 0.9, 0.3, 14, 'x'), BK, [2.3, 0, 0]);
      const palm = g.shape('optimusPalm', sh => {
        sh.moveTo(2.4, -2.7); sh.lineTo(2.6 + PALM_L - 0.6, -3.45); sh.quadraticCurveTo(2.6 + PALM_L, -3.45, 2.6 + PALM_L, -2.9);
        sh.lineTo(2.6 + PALM_L, 2.9); sh.quadraticCurveTo(2.6 + PALM_L, 3.45, 2.6 + PALM_L - 0.6, 3.45); sh.lineTo(2.4, 2.7); sh.lineTo(2.4, -2.7);
      }, PALM_T, 0.55, 4);
      add(root, palm, HM, [0, 0, 0], [PI / 2, 0, 0]);
      add(root, palm, BK, [0.3, 1.05, 0], [PI / 2, 0, 0], [0.92, 0.8, 0.45]);            // dos de main noir laqué
      add(root, g.cbox(PALM_L - 1.6, 0.5, 5.6, 0.2), RU, [3.4 + (PALM_L - 1.6) / 2, -1.45, 0]); // coussinet de paume
      add(root, fuse('optKnuck', [0, 1, 2, 3].map(i => [g.cyl(0.95, 0.95, 1.2, 12, 'z'), [2.6 + PALM_L, 0.15, ((i + 0.5) / 4 - 0.5) * 6.6]])), ST);
      const fingers = [];
      for (let i = 0; i < 4; i++) {
        const zz = ((i + 0.5) / 4 - 0.5) * 6.6 * side, k = [0.94, 1, 0.97, 0.85][i];
        let parent = root; const segs = [];
        for (let j = 0; j < 3; j++) {
          const piv = ctx.group(); piv.userData.noMerge = true;
          if (j === 0) piv.position.set(2.6 + PALM_L + 0.5, 0, zz); else piv.position.set(FL[j - 1] * k, 0, 0);
          add(piv, phal(+(FL[j] * k).toFixed(2), FTH[j], FW, j === 2), j === 1 ? HM : FM);
          parent.add(piv); parent = piv; segs.push(piv);
        }
        fingers.push(segs);
      }
      const t0 = ctx.group(); t0.position.set(3.6, -0.7, -side * 3.0); t0.userData.noMerge = true;
      add(t0, phal(3.6, 2.1, 1.8, false), FM);
      const t1 = ctx.group(); t1.position.set(3.6, 0, 0); t0.add(t1);
      add(t1, phal(2.8, 1.9, 1.7, true), HM);
      root.add(t0);
      root.userData.setCurl = c => {
        for (const sg of fingers) { sg[0].rotation.z = -88 * c * Dg; sg[1].rotation.z = -96 * c * Dg; sg[2].rotation.z = -70 * c * Dg; }
        t0.rotation.set(-side * (20 + 30 * c) * Dg, side * (25 + 20 * c) * Dg, -(25 + 45 * c) * Dg);
        t1.rotation.z = -45 * c * Dg;
      };
      root.userData.setCurl(1);
      return root;
    }

    /* =====================================================
       MEMBRES (côté 'f' = +Z ; 'b' = miroir)
       ===================================================== */
    for (const [sd, z] of [['f', 1], ['b', -1]]) {
      // ---------- épaulière (suit le torse, avant = +X) ----------
      P[sd + 'sc'] = sidePart(z, gr => {
        add(gr, patch('optCapIn', { tab: CAP, map: band(0, 2 * PI, -7.5, 1.6), closed: true, nu: 32, nv: 4, c: 0.35, t: 1.0, axis: 'z' }), SB, [0, 2.2, 0]);
        add(gr, patch('optCapOut', { tab: CAP, map: band(0, 2 * PI, 2.2, 8.2), closed: true, nu: 32, nv: 7, c: 0.35, t: 1.0, axis: 'z' }), BK, [0, 2.2, 0]);
        add(gr, patch('optCapCore', { tab: CAP, map: band(0, 2 * PI, -7.5, 8.2), closed: true, nu: 12, nv: 4, off: -0.7, c: 0, t: 0, axis: 'z' }), CS, [0, 2.2, 0]);
        add(gr, g.ccyl(3.6, 0.8, 0.3, 24, 'z'), GR, [0, 1.8, 8.2]);
        add(gr, g.ccyl(1.7, 0.6, 0.2, 16, 'z'), ST, [0, 1.8, 8.7]);
      });
      // ---------- bras ----------
      P[sd + 'ua'] = sidePart(z, gr => {
        add(gr, full('optUAcore', UA, 0, 33, 14, 4, { off: -0.9 }), SB);
        add(gr, g.ccyl(5.8, 11.2, 1, 24, 'z'), SB, [0, 1.2, 0]);
        add(gr, patch('optUAout', { tab: UA, map: band(-50 * D, 128 * D, 7, 28.6), nu: 18, nv: 8 }), WH);
        add(gr, patch('optUAin', { tab: UA, map: band(131 * D, 307 * D, 7, 28.6), nu: 18, nv: 8 }), WH);
        seam(gr, 'UA1', UA, 126.5, 133.5, 7.6, 28); seam(gr, 'UA2', UA, 305.5, 311.5, 7.6, 28);
        if (DEC) add(gr, decalGeo('star', UA, 55 * D, 125 * D, 10.8, 19.2, 0.05), DEC.star).userData.noShadow = true;
      }, L.ua / 33);
      P[sd + 'el'] = sidePart(z, gr => {
        add(gr, g.ccyl(4.9, 10.6, 0.9, 24, 'z'), SB);
        add(gr, g.ccyl(3.2, 1.0, 0.3, 24, 'z'), GR, [0, 0, 5.3]);
        add(gr, g.ccyl(1.5, 0.6, 0.2, 16, 'z'), ST, [0, 0, 5.9]);
        add(gr, g.ccyl(3.2, 1.0, 0.3, 24, 'z'), GR, [0, 0, -5.3]);
        add(gr, g.cbox(3.2, 6.5, 7.6, 1), BK, [3.4, -1.2, 0]);
      });
      P[sd + 'fa'] = sidePart(z, gr => {
        add(gr, full('optFAcore', FA, 0, 31, 14, 4, { off: -0.9 }), SB);
        add(gr, patch('optFAtop', { tab: FA, map: band(-62 * D, 116 * D, 3.2, 25.2), nu: 16, nv: 8 }), WH);
        add(gr, patch('optFAbot', { tab: FA, map: band(119 * D, 295 * D, 3.2, 25.2), nu: 16, nv: 8 }), WH);
        seam(gr, 'FA1', FA, 114.5, 120.5, 3.8, 24.6); seam(gr, 'FA2', FA, 293.5, 299.5, 3.8, 24.6);
        add(gr, full('optWrist', FA, 25.9, 30.6, 20, 2, { off: -0.25, c: 0.3, t: 0.8 }), BK);
        add(gr, g.ccyl(1.5, 5.6, 0.3, 12, 'z'), GR, [0, 30.6, 0]);
      }, L.fa / 31);
      // ---------- main (graphite, 5 doigts) ----------
      P[sd + 'ha'] = optHand(z);
      // ---------- hanche ----------
      P[sd + 'hi'] = sidePart(z, gr => {
        add(gr, g.ccyl(6.0, 12, 1, 28, 'z'), GR, [0, 0, 1.2]);
        add(gr, g.ccyl(4.0, 0.8, 0.3, 24, 'z'), ST, [0, 0, 7.5]);
        add(gr, g.ccyl(2.0, 0.6, 0.2, 16, 'z'), SB, [0, 0, 8.0]);
      });
      // ---------- cuisse ----------
      P[sd + 'th'] = sidePart(z, gr => {
        add(gr, full('optTHcore', TH, 0, 44, 16, 6, { off: -0.8 }), SB);
        add(gr, patch('optTHmain', { tab: TH, map: band(55 * D, 205 * D, th => 5.6 - 2.6 * Math.sin(th), th => 38.5 - 1.2 * Math.sin(th)), nu: 22, nv: 12, c: 0.5, t: 1.3 }), WH);
        add(gr, patch('optTHfront', { tab: TH, map: band(208 * D, 252 * D, 8, 36.6), nu: 6, nv: 10, c: 0.45, t: 1.3 }), WH);
        seam(gr, 'TH1', TH, 203.5, 209.5, 8.6, 36, 2, 10);
        seam(gr, 'TH2', TH, 50.5, 58, 4.4, 36.6, 2, 10); seam(gr, 'TH3', TH, 248.5, 255.5, 8.6, 36, 2, 10);
        if (DEC && z > 0) add(gr, decalGeo('unit', TH, 60 * D, 130 * D, 11.5, 20, 0.05), DEC.unit).userData.noShadow = true;
      }, L.th / 44);
      // ---------- genou ----------
      P[sd + 'kn'] = sidePart(z, gr => {
        add(gr, g.ccyl(5.4, 11.8, 0.9, 28, 'z'), SB);
        add(gr, g.ccyl(3.6, 1.0, 0.3, 24, 'z'), GR, [0, 0, 6.1]);
        add(gr, g.ccyl(1.8, 0.6, 0.2, 16, 'z'), ST, [0, 0, 6.7]);
        add(gr, g.ccyl(3.6, 1.0, 0.3, 24, 'z'), GR, [0, 0, -6.1]);
        add(gr, patch('optKneecap', { tab: KNEE, map: band(118 * D, 242 * D, -4.8, 4.8), nu: 12, nv: 6, c: 0.4, t: 1.2, axis: 'z' }), BK, [0, -1.2, 0]);
      });
      // ---------- tibia ----------
      P[sd + 'sh'] = sidePart(z, gr => {
        const SHIN_B = th => 22 - 5 * Math.cos(th);
        add(gr, full('optSHcore', SH, 0, 44, 16, 6, { off: -0.8 }), SB);
        add(gr, patch('optSHwhite', { tab: SH, map: band(92 * D, 268 * D, 3.6, SHIN_B), nu: 18, nv: 8, c: 0.45, t: 1.2 }), WH);
        add(gr, patch('optSHblack', { tab: SH, map: band(92 * D, 268 * D, th => SHIN_B(th) + 0.7, 40.6), nu: 18, nv: 6, c: 0.45, t: 1.2 }), BK);
        add(gr, patch('optSHcalf', { tab: SH, map: band(-86 * D, 88 * D, 3.2, 37.5), nu: 16, nv: 8, c: 0.45, t: 1.2 }), SB);
        seam(gr, 'SH1', SH, 94, 266, th => SHIN_B(th) - 0.7, th => SHIN_B(th) + 1.4, 16, 1);
        seam(gr, 'SH2', SH, 86.5, 93.5, 4.2, 36.8); seam(gr, 'SH3', SH, 266.5, 273.5, 4.2, 36.8);
        // vérins linéaires du mollet
        for (const zz of [2.5, -2.5]) {
          add(gr, g.ccyl(1.6, 22, 0.4, 12), BK, [6.3, 19, zz], [0, 0, 0.085]);
          add(gr, g.cyl(0.72, 0.72, 8, 8), ST, [5.0, 33.6, zz], [0, 0, 0.085]);
          add(gr, g.ccyl(1.4, 3.4, 0.3, 12, 'z'), GR, [7.0, 7.6, zz]);
        }
        add(gr, g.ccyl(3.0, 7.6, 0.6, 20, 'z'), SB, [0, 44, 0]);
        // support d'actionneurs de cheville (cache l'extrémité des tiges)
        add(gr, g.cbox(3.4, 5.6, 7.6, 0.9), BK, [4.0, 38.6, 0], [0, 0, 0.12]);
      }, L.sh / 44);
      // ---------- pied noir ----------
      P[sd + 'fo'] = sidePart(z, gr => {
        add(gr, patch('optFTcore', { tab: FT, map: band(0, 2 * PI, -7.2, 19.2), closed: true, nu: 12, nv: 7, off: -0.7, c: 0, t: 0, axis: 'x' }), CS);
        add(gr, patch('optFTrear', { tab: FT, map: band(0, 2 * PI, -7.3, 12.4), closed: true, nu: 24, nv: 10, c: 0.4, t: 1.0, axis: 'x' }), BK);
        add(gr, patch('optFTtoe', { tab: FT, map: band(0, 2 * PI, 13.0, 19.5), closed: true, nu: 22, nv: 4, c: 0.4, t: 1.0, axis: 'x' }), BK);
        // languette / cou-de-pied en relief + contrefort de talon
        add(gr, patch('optFTtongue', { tab: FT, map: band(146 * D, 214 * D, 1.8, 11.6), nu: 8, nv: 8, off: 0.3, c: 0.3, t: 0.9, axis: 'x' }), SB);
        add(gr, patch('optFTheel', { tab: FT, map: band(62 * D, 298 * D, -7.15, -3.4), nu: 14, nv: 3, off: 0.25, c: 0.25, t: 0.8, axis: 'x' }), SB);
        add(gr, g.shape('optimusSole', s => {
          s.moveTo(-5, -4.9); s.lineTo(14, -5.4); s.quadraticCurveTo(20.2, -5.2, 20.2, 0); s.quadraticCurveTo(20.2, 5.2, 14, 5.4);
          s.lineTo(-5, 4.9); s.quadraticCurveTo(-7.9, 4.7, -7.9, 0); s.quadraticCurveTo(-7.9, -4.7, -5, -4.9);
        }, 2.0, 0.45, 5), RU, [0, -6.0, 0], [PI / 2, 0, 0]);
        add(gr, g.ccyl(3.3, 8.6, 0.6, 20, 'z'), SB);
        add(gr, g.ccyl(2.4, 0.8, 0.3, 16, 'z'), GR, [0, 0, 4.6]);
        add(gr, g.ccyl(2.4, 0.8, 0.3, 16, 'z'), GR, [0, 0, -4.6]);
      });
    }

    const PULSE = [...new Set([CT, CL, CS, LT])].filter(m => m !== LED && m.userData && m.userData.baseI != null); // liserés lumineux des skins
    const tick = ctx.override ? undefined : (t, state) => {
      if (LETTERS && state && state.face) LETTERS.scale.z = state.face;
      if (DEC && state && state.face) { const tx = decalTex('unit', state.face < 0); if (DEC.unit.map !== tx) DEC.unit.map = tx; }
      const sup = state && (state.st === 'super' || state.st === 'special');
      LED.emissiveIntensity = LED.userData.baseI * ((sup ? 1.5 : 0.88) + 0.12 * Math.sin(t * 2.4));
      for (const m of PULSE) m.emissiveIntensity = m.userData.baseI * ((sup ? 1.6 : 0.94) + 0.08 * Math.sin(t * 2.4 + 1.2));
    };
    return { parts: P, shZ: 22, hpZ: 10.6, tick };
  };
})();
