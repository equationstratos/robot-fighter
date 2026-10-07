'use strict';
/* =========================================================
   Modèle 3D : HONDA ASIMO (2005–2011)
   Contrat : voir js/kit.js.
   Design : grand casque blanc sphérique avec large visière fumée noire enveloppante,
   « oreilles » circulaires gris clair ; buste blanc à plastron gris argent, fenêtre de
   capteurs noire, gros sac à dos blanc (batterie) avec grille d'aération et lettrage ASIMO ;
   bassin « short » blanc découpé en V ; épaules en dômes blancs ; bras/cuisses/tibias en
   coques blanches lustrées découpées en panneaux (joints sombres), articulations grises ;
   genoux toujours fléchis ; grands pieds blancs à semelle grise et orteil articulé ;
   mains blanches à 4 doigts + pouce gris clair.
   Technique : coques = sections superelliptiques interpolées (loft) ; panneaux découpés
   dans les mêmes profils avec chanfrein + paroi rentrante (arêtes nettes), posés sur un
   noyau sombre : les interstices forment de vrais joints. Lignes de joint posées sur la
   surface ; petites pièces fusionnées (fuse). Géométries mises en cache localement.
   ========================================================= */
if (typeof RK !== 'undefined' && RK) RK.models.asimo = (function () {
  const T = RK.T, BGU = T.BufferGeometryUtils, PI = Math.PI, D = PI / 180;
  const GC = {};
  let RES = 1; // résolution courante
  const lerp = (a, b, t) => a + (b - a) * t;
  const spow = (c, e) => (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), e);
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

  /* ---------- profils superelliptiques ----------
     axe 'y' : {y, xf (+X), xb (-X), zo (+Z), zi (-Z), x0, z0, n}
     axe 'x' : {x, yt (+Y), yb (-Y), zo, zi, y0, z0, n}
     axe 'z' : {z, xf, xb, yt, yb, x0, y0, n}           */
  const KEYS = ['ap', 'an', 'bp', 'bn', 'a0', 'b0', 'n'];
  function tab(axis, list, nd = 2.6) {
    return { axis, list: list.map(o => {
      const r = { n: o.n || nd };
      if (axis === 'y') { r.s = o.y; r.ap = o.xf ?? o.x; r.an = o.xb ?? o.x; r.bp = o.zo ?? o.z; r.bn = o.zi ?? o.z; r.a0 = o.x0 || 0; r.b0 = o.z0 || 0; }
      else if (axis === 'x') { r.s = o.x; r.ap = o.yt ?? o.y; r.an = o.yb ?? o.y; r.bp = o.zo ?? o.z; r.bn = o.zi ?? o.z; r.a0 = o.y0 || 0; r.b0 = o.z0 || 0; }
      else { r.s = o.z; r.ap = o.xf ?? o.x; r.an = o.xb ?? o.x; r.bp = o.yt ?? o.y; r.bn = o.yb ?? o.y; r.a0 = o.x0 || 0; r.b0 = o.y0 || 0; }
      return r;
    }) };
  }
  function dims(tb, s) {
    const L = tb.list, n = L.length;
    if (s <= L[0].s) return L[0];
    if (s >= L[n - 1].s) return L[n - 1];
    let i = 0; while (i < n - 2 && L[i + 1].s < s) i++;
    const a = L[i], b = L[i + 1], t = (s - a.s) / (b.s - a.s);
    const p0 = L[Math.max(0, i - 1)], p3 = L[Math.min(n - 1, i + 2)];
    const o = {};
    for (const k of KEYS) o[k] = crs(p0[k], a[k], b[k], p3[k], t);
    return o;
  }
  // point de surface : th = angle (0 = +a, 90° = +b), s = position sur l'axe, off = décalage normal
  function pt(tb, th, s, off) {
    const d = dims(tb, s), c = Math.cos(th), si = Math.sin(th), e = 2 / Math.max(1.2, d.n);
    const ea = Math.max(0.02, (c >= 0 ? d.ap : d.an) + off), eb = Math.max(0.02, (si >= 0 ? d.bp : d.bn) + off);
    const a = d.a0 + ea * spow(c, e), b = d.b0 + eb * spow(si, e);
    return tb.axis === 'y' ? [a, s, b] : tb.axis === 'x' ? [s, a, b] : [a, b, s];
  }
  // repère local de la surface : position + normale sortante + tangente « montante » (le long de l'axe)
  const _a = new T.Vector3(), _b = new T.Vector3();
  function frame(tb, th, s, lift = 0) {
    const p0 = pt(tb, th, s, 0), p1 = pt(tb, th + 0.01, s, 0), p2 = pt(tb, th, s + 0.05, 0);
    _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]); _b.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
    const n = _b.clone().cross(_a).normalize(); if (tb.axis !== 'y') n.negate();
    const up = _b.clone().normalize(); up.addScaledVector(n, -up.dot(n)).normalize();
    return { p: new T.Vector3(p0[0] + n.x * lift, p0[1] + n.y * lift, p0[2] + n.z * lift), n, up };
  }

  /* ---------- maillages ---------- */
  function grid(rows, closeU, flip) {
    const nv = rows.length, nu = rows[0].length;
    const pos = new Float32Array(nv * nu * 3);
    let k = 0;
    for (const r of rows) for (const p of r) { pos[k++] = p[0]; pos[k++] = p[1]; pos[k++] = p[2]; }
    const idx = [], uMax = closeU ? nu : nu - 1;
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < uMax; i++) {
      const i2 = (i + 1) % nu, a = j * nu + i, b = j * nu + i2, c = (j + 1) * nu + i2, d = (j + 1) * nu + i;
      if (flip) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }
  function fan(ring, down, flip) {
    const n = ring.length, pos = new Float32Array((n + 1) * 3);
    let cx = 0, cy = 0, cz = 0;
    ring.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; cx += p[0]; cy += p[1]; cz += p[2]; });
    pos[n * 3] = cx / n; pos[n * 3 + 1] = cy / n; pos[n * 3 + 2] = cz / n;
    const idx = [], f = down !== flip;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (f) idx.push(n, i, j); else idx.push(n, j, i); }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }
  /* feuille paramétrique P(u, v, off) -> [x,y,z] avec bords chanfreinés (c), paroi (t), bouchons.
     o : { nu, nv, closed, flip, c, cB, cT, t, capB, capT, vmap } */
  function sheet(key, P, o) {
    if (GC[key]) return GC[key];
    const nu = o.nu, nv = o.nv, closed = !!o.closed, flip = !!o.flip;
    const c = o.c == null ? 0.5 : o.c, cB = o.cB == null ? c : o.cB, cT = o.cT == null ? c : o.cT, t = o.t || 0;
    const vmap = o.vmap || (x => x);
    const len = f => { let s = 0, p = f(0); for (let i = 1; i <= 16; i++) { const q = f(i / 16); s += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); p = q; } return s; };
    const lv = Math.max(0.01, len(v => P(0.5, v, 0)));
    const dv0 = cB > 0 ? Math.min(0.3, cB / lv) : 0, dv1 = cT > 0 ? Math.min(0.3, cT / lv) : 0;
    const du = (!closed && c > 0) ? Math.min(0.3, c / Math.max(0.01, len(u => P(u, 0.5, 0)))) : 0;
    const us = [], ub = [], vs = [], vb = [];
    const NU = closed ? nu : nu + 1;
    for (let i = 0; i < NU; i++) { const s = i / nu; us.push(closed ? s : du + (1 - 2 * du) * s); ub.push(s); }
    for (let j = 0; j <= nv; j++) { const s = vmap(j / nv); vs.push(dv0 + (1 - dv0 - dv1) * s); vb.push(s); }
    const rows = vs.map(v => us.map(u => P(u, v, 0)));
    const geos = [grid(rows, closed, flip)];
    if (closed) {
      const B0 = cB > 0 ? us.map(u => P(u, 0, -cB)) : rows[0], B1 = cT > 0 ? us.map(u => P(u, 1, -cT)) : rows[nv];
      if (cB > 0) geos.push(grid([B0, rows[0]], true, flip));
      if (cT > 0) geos.push(grid([rows[nv], B1], true, flip));
      if (o.capB !== false) geos.push(fan(B0, true, flip));
      else if (t > 0) geos.push(grid([us.map(u => P(u, 0, -t)), B0], true, flip));
      if (o.capT !== false) geos.push(fan(B1, false, flip));
      else if (t > 0) geos.push(grid([B1, us.map(u => P(u, 1, -t))], true, flip));
    } else {
      const A = [], B = [], W = [];
      const push = (a, u, v) => { A.push(a); B.push(P(u, v, -c)); W.push(P(u, v, -t)); };
      for (let i = 0; i <= nu; i++) push(rows[0][i], ub[i], 0);
      for (let j = 0; j <= nv; j++) push(rows[j][nu], 1, vb[j]);
      for (let i = nu; i >= 0; i--) push(rows[nv][i], ub[i], 1);
      for (let j = nv; j >= 0; j--) push(rows[j][0], 0, vb[j]);
      if (c > 0) geos.push(grid([B, A], true, flip));
      if (t > 0) geos.push(grid([W, c > 0 ? B : A], true, flip));
    }
    const geo = geos.length > 1 ? BGU.mergeGeometries(geos, false) : geos[0];
    return (GC[key] = geo);
  }
  const resN = (n, min) => Math.max(min, Math.round(n * RES));
  // tube fermé le long de l'axe du profil
  function tube(key, tb, o = {}) {
    const L = tb.list, s0 = o.s0 ?? L[0].s, s1 = o.s1 ?? L[L.length - 1].s, off = o.off || 0;
    const nu = resN(o.nu || 28, 6), nv = resN(o.nv || 8, 1);
    return sheet(`${key}|${nu}x${nv}`, (u, v, of) => pt(tb, u * 2 * PI, lerp(s0, s1, v), of + off),
      Object.assign({}, o, { nu, nv, closed: true, flip: tb.axis !== 'y' }));
  }
  // panneau découpé dans le profil : map(u, v) -> [theta, s]
  function panel(key, tb, map, o = {}) {
    const off = o.off || 0, nu = resN(o.nu || 16, 3), nv = resN(o.nv || 8, 1);
    return sheet(`${key}|${nu}x${nv}`, (u, v, of) => { const m = map(u, v); return pt(tb, m[0], m[1], of + off); },
      Object.assign({}, o, { nu, nv, closed: !!o.closed, flip: tb.axis !== 'y' }));
  }
  const fv = (f, x) => typeof f === 'function' ? f(x) : f;
  const band = (th0, th1, s0, s1) => (u, v) => { const th = lerp(th0, th1, u); return [th, lerp(fv(s0, th), fv(s1, th), v)]; };
  const shield = (s0, s1, wf, c0 = 0) => (u, v) => { const s = lerp(s0, s1, v), w = fv(wf, s); return [c0 + lerp(-w, w, u), s]; };
  // ligne de joint posée sur la surface : path(t) -> [theta, s]
  function sline(g, tb, path, off, r, n = 20) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const [th, s] = path(i / n); pts.push(pt(tb, th, s, off).map(v => Math.round(v * 100) / 100)); }
    return g.tube(pts, r, Math.max(6, Math.round(n * 1.25 * RES)), 4);
  }
  // fusion de petites géométries : items = [[geo, [x,y,z], [rx,ry,rz] | Matrix4, échelle]]
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();
  function fuse(key, items) {
    if (GC[key]) return GC[key];
    const list = items.map(([geo, p, r, s]) => {
      const gg = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const nm of Object.keys(gg.attributes)) if (nm !== 'position' && nm !== 'normal') gg.deleteAttribute(nm);
      if (r && r.isMatrix4) _m.copy(r);
      else _m.compose(_v.set(...(p || [0, 0, 0])), _q.setFromEuler(_e.set(...(r || [0, 0, 0]))), Array.isArray(s) ? _s.set(...s) : _s.setScalar(s || 1));
      gg.applyMatrix4(_m); return gg;
    });
    return (GC[key] = BGU.mergeGeometries(list, false));
  }
  // couronne de vis (axe Z)
  const boltRing = (g, n, R, r, h, a0 = 0) => fuse(`aBolts${n},${R},${r},${h},${a0}`, Array.from({ length: n }, (_, i) => { const a = a0 + i / n * 2 * PI; return [g.cyl(r, r, h, 6, 'z'), [Math.cos(a) * R, Math.sin(a) * R, 0]]; }));

  /* ---------- lettrage (barres : [a (vers la droite du lecteur), b (haut), largeur, hauteur, angle]) ---------- */
  const GLYPHS = {
    A: [[-0.62, 0, 0.42, 2.75, -0.42], [0.62, 0, 0.42, 2.75, 0.42], [0, -0.42, 1.3, 0.38]],
    S: [[0.15, 1.1, 2.0, 0.42], [0, 0, 2.0, 0.42], [-0.15, -1.1, 2.0, 0.42], [-0.95, 0.55, 0.42, 1.1], [0.95, -0.55, 0.42, 1.1]],
    I: [[0, 0, 0.44, 2.6]],
    M: [[-1.0, 0, 0.42, 2.6], [1.0, 0, 0.42, 2.6], [-0.5, 0.5, 0.4, 1.95, 0.56], [0.5, 0.5, 0.4, 1.95, -0.56]],
    O: [[0, 1.1, 1.5, 0.42], [0, -1.1, 1.5, 0.42], [-0.95, 0, 0.42, 1.6], [0.95, 0, 0.42, 1.6],
      [-0.78, 0.92, 0.42, 0.62, 0.785], [0.78, 0.92, 0.42, 0.62, -0.785], [-0.78, -0.92, 0.42, 0.62, -0.785], [0.78, -0.92, 0.42, 0.62, 0.785]],
    H: [[-0.95, 0, 0.42, 2.6], [0.95, 0, 0.42, 2.6], [0, 0, 1.6, 0.42]],
    N: [[-0.95, 0, 0.42, 2.6], [0.95, 0, 0.42, 2.6], [0, 0, 0.42, 3.0, 0.63]],
    D: [[-0.95, 0, 0.42, 2.6], [-0.2, 1.1, 1.5, 0.42], [-0.2, -1.1, 1.5, 0.42], [0.95, 0, 0.42, 1.6], [0.72, 0.88, 0.42, 0.7, 0.785], [0.72, -0.88, 0.42, 0.7, -0.785]]
  };
  // mot posé sur un profil 'y' : à la hauteur y, face = +1 (avant, +X) / -1 (arrière, -X), h = hauteur des lettres, sp = pas
  function word(key, g, tb, text, y, h, sp, face, lift = 0.05, depth = 0.4) {
    if (GC[key]) return GC[key];
    const items = [], n = text.length, k = h / 2.6, Mg = new T.Matrix4(), Ms = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler();
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * sp, zt = face > 0 ? -a : a;
      let lo = face > 0 ? -PI / 2 : PI / 2, hi = face > 0 ? PI / 2 : 1.5 * PI;
      for (let it = 0; it < 32; it++) { const m = (lo + hi) / 2, z = pt(tb, m, y, 0)[2]; if ((z < zt) === (face > 0)) lo = m; else hi = m; }
      const f = frame(tb, (lo + hi) / 2, y, lift), right = f.n.clone().cross(f.up);
      Mg.makeBasis(f.n, f.up, right).setPosition(f.p);
      for (const st of GLYPHS[text[i]] || []) {
        Ms.compose(new T.Vector3(depth * 0.3, st[1] * k, -st[0] * k), Q.setFromEuler(E.set(st[4] || 0, 0, 0)), new T.Vector3(1, k, k));
        items.push([g.box(depth, st[3], st[2]), null, Mg.clone().multiply(Ms)]);
      }
    }
    return fuse(key, items);
  }

  /* =========================================================
     PROFILS DU ROBOT (unités design ; ASIMO est réduit par ch.scale)
     ========================================================= */
  // ---- casque (centre = origine, visage +X)
  const HEAD = (() => {
    const yB = -16.4, yT = 19.4, yC = 0.8, yV = -22.5, list = [], N = 40;
    for (let i = 0; i <= N; i++) {
      const y = yB + (yT - yB) * Math.sin(i / N * PI / 2);
      const k = y >= yC ? Math.pow(Math.max(0, 1 - Math.pow((y - yC) / (yT - yC), 2.25)), 1 / 2.25)
        : Math.pow(Math.max(0, 1 - Math.pow((yC - y) / (yC - yV), 2.3)), 1 / 2.3);
      list.push({ y, xf: Math.max(0.04, 18.3 * k), xb: Math.max(0.04, 18.9 * k), z: Math.max(0.04, 17.7 * k), x0: -0.2, n: 2.18 });
    }
    return tab('y', list);
  })();
  const VIS_W = curve([[-12.8, 20], [-11.8, 40], [-9.5, 56], [-5, 66], [0, 69], [4.5, 66], [6.8, 56], [8.2, 36]].map(([y, a]) => [y, a * D]));
  // contour de la visière (verre : y ∈ [-12.8, 8.2]) ; le rebord et le joint en sont des homothéties
  // (même forme, coins compris) : v ∈ [0, 1] parcourt la hauteur
  const VY0 = -12.8, VY1 = 8.2;
  const visorMap = (y0, y1, grow) => (u, v) => [lerp(-1, 1, u) * (VIS_W(lerp(VY0, VY1, v)) + grow), lerp(y0, y1, v)];
  // contour fermé (pour le joint) : t ∈ [0, 1]
  const visorLoop = (y0, y1, grow) => t => {
    const q = t * 4, k = Math.min(3, Math.floor(q)), f = q - k;
    const P = (u, v) => visorMap(y0, y1, grow)(u, v);
    return k === 0 ? P(f, 0) : k === 1 ? P(1, f) : k === 2 ? P(1 - f, 1) : P(0, 1 - f);
  };

  // ---- bassin, taille, buste, sac à dos (origine = bassin)
  const PEL = tab('y', [
    { y: -9.5, xf: 7.2, xb: 8.2, z: 12.6 },
    { y: -6.5, xf: 10.2, xb: 11.2, z: 17 },
    { y: -1, xf: 11.5, xb: 12.4, z: 18.7 },
    { y: 5, xf: 11.7, xb: 12.6, z: 18.9 },
    { y: 10.5, xf: 11.1, xb: 12, z: 17.9 },
    { y: 14.5, xf: 10, xb: 11, z: 16 }
  ], 3.2);
  const PEL_B = th => -8.6 + 10.2 * Math.pow(Math.abs(Math.sin(th)), 1.5);
  const WAIST = tab('y', [{ y: 10, x: 9.4, z: 13.8 }, { y: 16, x: 9, z: 13.2 }, { y: 23, x: 9.6, z: 14 }], 3);
  const CHEST = tab('y', [
    { y: 18.5, xf: 9.8, xb: 9.6, z: 14.2 },
    { y: 24, xf: 11.4, xb: 10.6, z: 15.6 },
    { y: 32, xf: 12.6, xb: 11.6, z: 16.8 },
    { y: 41, xf: 13.4, xb: 12, z: 17.6 },
    { y: 49, xf: 13.5, xb: 12, z: 17.8 },
    { y: 55, xf: 12.4, xb: 11.6, z: 17.1 },
    { y: 59.5, xf: 10.2, xb: 10.4, z: 14.6 },
    { y: 62.5, xf: 7.2, xb: 8, z: 10.2 },
    { y: 63.6, xf: 5.8, xb: 6.6, z: 8.2 }
  ], 3.3);
  const PACK = tab('y', [
    { y: 16.5, x0: -19, xf: 7, xb: 7.2, z: 11.4 },
    { y: 19.5, x0: -19.8, xf: 8.6, xb: 9.2, z: 13.6 },
    { y: 26, x0: -20.4, xf: 9.2, xb: 9.8, z: 14.6 },
    { y: 50, x0: -20.6, xf: 9.2, xb: 9.9, z: 14.8 },
    { y: 58, x0: -20.2, xf: 9, xb: 9.5, z: 14.4 },
    { y: 62.5, x0: -19.4, xf: 8, xb: 8.2, z: 12.6 },
    { y: 64.8, x0: -18.8, xf: 6, xb: 6.2, z: 9.4 }
  ], 4.2);
  // ---- épaule (dôme, axe Z vers l'extérieur)
  const SHC = tab('z', [
    { z: -7, x: 7.4, yt: 7.6, yb: 6.6, y0: 1 },
    { z: -3, x: 9.8, yt: 10, yb: 9, y0: 1 },
    { z: 2, x: 10.8, yt: 11, yb: 10, y0: 1 },
    { z: 6.5, x: 10.4, yt: 10.6, yb: 9.6, y0: 1 },
    { z: 9.8, x: 8.6, yt: 8.8, yb: 8, y0: 1 },
    { z: 11.6, x: 5.8, yt: 6, yb: 5.4, y0: 1 }
  ], 2.3);
  // ---- bras (avant du membre = -X)
  const UA = tab('y', [{ y: 0, x: 6.3, z: 6.3 }, { y: 9, x: 6.5, z: 6.5 }, { y: 20, xf: 6.1, xb: 6, z: 6.1 }, { y: 29, xf: 5.6, xb: 5.4, z: 5.7 }], 2.6);
  const FA = tab('y', [{ y: 1, x: 5.4, z: 5.6 }, { y: 8, xf: 6.6, xb: 6.3, z: 6.5 }, { y: 16, xf: 6.3, xb: 5.9, z: 6.2 }, { y: 24, xf: 5, xb: 4.8, z: 5 }, { y: 27, x: 4.5, z: 4.6 }], 2.6);
  // ---- jambes (avant = -X ; +X = mollet / arrière de la cuisse)
  const TH = tab('y', [
    { y: -4, xf: 8.4, xb: 8.8, z: 7.8 },
    { y: 6, xf: 9.2, xb: 9.8, z: 8.3 },
    { y: 18, xf: 8.8, xb: 9.7, z: 8.2 },
    { y: 30, xf: 8, xb: 8.7, z: 7.6 },
    { y: 36, xf: 7.2, xb: 7.8, z: 7 }
  ], 3);
  const SH = tab('y', [
    { y: 2, xf: 8, xb: 7.8, z: 7.6 },
    { y: 10, xf: 9.5, xb: 8.2, z: 8.3 },
    { y: 20, xf: 9.4, xb: 8, z: 8.2 },
    { y: 30, xf: 8.2, xb: 7.5, z: 7.6 },
    { y: 37.5, xf: 7, xb: 6.9, z: 6.9 }
  ], 3);
  // ---- pied (axe X : talon -X → pointe +X ; cheville = origine ; sol à y = -7.2)
  const FOOT = tab('x', [
    { x: -9.6, yt: 2.0, yb: 1.6, z: 5.4, y0: -2.8 },
    { x: -8.2, yt: 3.6, yb: 2.0, z: 6.6, y0: -2.2 },
    { x: -3, yt: 5.2, yb: 2.0, z: 7.0, y0: -2.0 },
    { x: 4, yt: 4.4, yb: 2.0, z: 7.1, y0: -2.3 },
    { x: 10, yt: 3.0, yb: 2.0, z: 7.1, y0: -2.6 },
    { x: 13.6, yt: 2.6, yb: 2.0, z: 7.0, y0: -2.8 }
  ], 3.6);
  const TOE = tab('x', [
    { x: 14.2, yt: 2.3, yb: 2.0, z: 6.8, y0: -2.9 },
    { x: 18.5, yt: 1.9, yb: 1.9, z: 6.3, y0: -3.1 },
    { x: 21, yt: 1.5, yb: 1.7, z: 5.2, y0: -3.3 },
    { x: 22.2, yt: 1.0, yb: 1.2, z: 3.6, y0: -3.6 }
  ], 3.6);
  // ---- main : corps de la main (axe X : poignet → jointures ; dos = +Y, paume = -Y)
  const HANDB = tab('x', [
    { x: 2.3, yt: 1.45, yb: 1.25, z: 3.15, y0: 0.15 },
    { x: 4.6, yt: 2.05, yb: 1.6, z: 3.65, y0: 0.2 },
    { x: 8.0, yt: 1.95, yb: 1.6, z: 3.95, y0: 0.15 },
    { x: 9.7, yt: 1.45, yb: 1.35, z: 3.9, y0: 0.0 }
  ], 3.2);
  const SOLE = tab('x', [
    { x: -9.9, y: 0.8, z: 5.6, y0: -6.4 },
    { x: -8.6, y: 0.8, z: 6.9, y0: -6.4 },
    { x: 13, y: 0.8, z: 7.3, y0: -6.4 },
    { x: 18.5, y: 0.8, z: 6.8, y0: -6.1 },
    { x: 21.6, y: 0.8, z: 5.3, y0: -5.6 },
    { x: 22.8, y: 0.7, z: 3.4, y0: -5.2 }
  ], 6);
  const MID = tab('x', [
    { x: -9.6, y: 0.7, z: 5.4, y0: -4.9 },
    { x: -8.4, y: 0.7, z: 6.8, y0: -4.9 },
    { x: 13, y: 0.7, z: 7.15, y0: -4.9 },
    { x: 18.5, y: 0.7, z: 6.6, y0: -4.7 },
    { x: 21.4, y: 0.6, z: 5.1, y0: -4.3 },
    { x: 22.5, y: 0.5, z: 3.3, y0: -4.0 }
  ], 6);

  /* =========================================================
     CONSTRUCTION
     ========================================================= */
  return function (ctx) {
    const { ch, g, L } = ctx;
    const lo = ctx.lod === 'low';
    RES = 1;
    const P = {};
    const add = (p, geo, mat, pos, rot, scl) => ctx.add(p, geo, mat, { p: pos, r: rot, s: scl });
    // pièce latérale : le côté 'b' est un miroir en Z (détails « extérieurs » toujours dehors)
    const sidePart = (sd, build) => { const part = ctx.group(), inner = ctx.group(); if (sd < 0) inner.scale.set(1, 1, -1); part.add(inner); build(inner); return part; };
    const YV = new T.Vector3(0, 1, 0);
    // petit élément posé sur un profil (axe Y du géo = normale)
    const onSurf = (parent, tb, th, s, geo, mat, lift = 0) => {
      const f = frame(tb, th, s, lift);
      const m = ctx.add(parent, geo, mat, { p: [f.p.x, f.p.y, f.p.z] });
      m.quaternion.setFromUnitVectors(YV, f.n); return m;
    };

    /* ---------- matériaux ---------- */
    const M = ctx.M;
    const W = M.shell;                                         // blanc laqué
    const GL = ctx.mat({ color: ch.trim, roughness: 0.38, metalness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.18, envMapIntensity: 0.6 }); // gris clair
    const SV = ctx.mat({ color: 0xa9adb4, roughness: 0.3, metalness: 0.75, clearcoat: 0.35, clearcoatRoughness: 0.2, envMapIntensity: 0.95 }); // gris argent
    const GM = ctx.mat({ color: 0x80848c, roughness: 0.36, metalness: 0.6, clearcoat: 0.3, envMapIntensity: 0.7 });   // gris moyen métal
    const GD = ctx.mat({ color: ch.joint, roughness: 0.48, metalness: 0.35, clearcoat: 0.25, envMapIntensity: 0.5 });  // gris foncé (articulations)
    const BK = ctx.mat({ color: 0x17181c, roughness: 0.5, metalness: 0.2, envMapIntensity: 0.35 });                     // creux sombres
    const VIS = ctx.mat({ color: 0x06070b, roughness: 0.04, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5 });
    const SEN = ctx.mat({ color: 0x0a0b0e, roughness: 0.08, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 });
    const SEAM = M.seam, RUB = M.rubber, STEEL = M.steel;
    const RED = ctx.mat({ color: ch.accent, roughness: 0.3, clearcoat: 0.8 });
    const LED = ctx.glow(ch.accent, 2.4);

    /* =====================================================
       LOD bas (images rémanentes) : même silhouette, très peu de triangles
       ===================================================== */
    if (lo) {
      const t = ctx.group();
      add(t, panel('aLoPel', PEL, (u, v) => { const th = u * 2 * PI; return [th, lerp(PEL_B(th), 14.5, v)]; }, { closed: true, nu: 10, nv: 2, c: 0 }), W);
      add(t, tube('aLoChest', CHEST, { s0: 18.8, s1: 63.6, nu: 12, nv: 5, c: 0 }), W);
      add(t, tube('aLoPack', PACK, { nu: 8, nv: 3, c: 0 }), W);
      add(t, g.cyl(9.2, 9.2, 10, 8), GD, [0, 16, 0], null, [1, 1, 1.45]);
      P.torso = t;
      P.neck = ctx.group(ctx.mesh(g.cyl(4.8, 5.4, 14, 6), GD, { p: [0, 7, 0] }));
      const h = ctx.group();
      add(h, tube('aLoHead', HEAD, { nu: 14, nv: 7, c: 0, vmap: v => Math.sin(v * PI / 2) }), W, [0, 0.9, 0], null, 1.1);
      add(h, panel('aLoVisor', HEAD, visorMap(-12.8, 8.2, 0), { off: 0.75, c: 0, nu: 6, nv: 3 }), VIS, [0, 0.9, 0], null, 1.1);
      P.head = h;
      for (const [sd, z] of [['f', 1], ['b', -1]]) {
        P[sd + 'sc'] = ctx.group(ctx.mesh(tube('aLoShc', SHC, { nu: 8, nv: 3, c: 0 }), W, { s: [1, 1, z] }));
        P[sd + 'ua'] = ctx.group(ctx.mesh(tube('aLoUA', UA, { s0: 2, s1: 29, nu: 8, nv: 2, c: 0 }), W));
        P[sd + 'fa'] = ctx.group(ctx.mesh(tube('aLoFA', FA, { s0: 1, s1: 30, nu: 8, nv: 2, c: 0 }), W));
        P[sd + 'th'] = ctx.group(ctx.mesh(tube('aLoTH', TH, { s0: -3, s1: 37, nu: 8, nv: 3, c: 0 }), W));
        P[sd + 'sh'] = ctx.group(ctx.mesh(tube('aLoSH', SH, { s0: 2, s1: 40, nu: 8, nv: 3, c: 0 }), W));
        P[sd + 'kn'] = ctx.group(ctx.mesh(g.cyl(6.5, 6.5, 14, 8, 'z'), GD));
        P[sd + 'el'] = ctx.group(ctx.mesh(g.cyl(5.1, 5.1, 10.6, 8, 'z'), GD));
        P[sd + 'hi'] = ctx.group(ctx.mesh(g.cyl(6, 6, 4, 8, 'z'), GL, { p: [0, 1.5, z * 8.7] }));
        P[sd + 'fo'] = ctx.group(ctx.mesh(tube('aLoFoot', FOOT, { nu: 8, nv: 3, c: 0 }), W), ctx.mesh(g.box(32, 2.6, 13.6), RUB, { p: [6.4, -5.9, 0] }));
        P[sd + 'ha'] = RK.hand(ctx, { side: z, palm: [7.4, 3.6, 7.6], palmMat: W, fingerMat: GL });
      }
      return { parts: P, shZ: 23.5, hpZ: 10.5 };
    }

    /* =====================================================
       TÊTE : casque blanc, visière fumée, oreilles grises
       ===================================================== */
    function head() {
      const h0 = ctx.group(), h = ctx.group(); h.scale.setScalar(1.1); h.position.y = 0.9; h0.add(h);
      add(h, tube('aHead', HEAD, { nu: 38, nv: 24, cB: 0.9, cT: 0, vmap: v => Math.sin(v * PI / 2) }), W);
      // rebord blanc de la visière + visière fumée + joint sombre autour du rebord
      add(h, panel('aVisRim', HEAD, visorMap(-13.6, 9.2, 3.2 * D), { off: 0.3, c: 0.45, t: 1.2, nu: 26, nv: 12 }), W);
      add(h, panel('aVisor', HEAD, visorMap(-12.8, 8.2, 0), { off: 0.75, c: 0.55, t: 1.6, nu: 26, nv: 12 }), VIS);
      add(h, sline(g, HEAD, visorLoop(-13.75, 9.35, 3.6 * D), 0.03, 0.2, 48), SEAM);
      // joints du casque : par-dessus le crâne (d'une oreille à l'autre) et sous la nuque
      add(h, sline(g, HEAD, t => { const a = lerp(-1, 1, t); return [a < 0 ? -103 * D : 103 * D, 3 + (19.3 - 3) * (1 - Math.abs(a))]; }, 0.02, 0.32, 24), SEAM);
      add(h, sline(g, HEAD, t => [lerp(118, 242, t) * D, -7.5], 0.02, 0.3, 16), SEAM);
      add(h, sline(g, HEAD, t => [lerp(-58, 58, t) * D, -15.2], 0.02, 0.28, 14), SEAM);
      // oreilles (capteurs) circulaires : disque gris clair encastré, gorge, anneau argent, micro
      for (const sd of [1, -1]) {
        const p = pt(HEAD, sd * 99 * D, -1.6, 0);
        const ear = ctx.group(); ear.position.set(p[0], p[1], p[2]); ear.rotation.y = sd > 0 ? -9 * D : PI + 9 * D;
        add(ear, g.cyl(7.1, 7.1, 3.0, 24, 'z', true), SEAM, [0, 0, -0.7]);
        add(ear, g.ccyl(6.5, 3.6, 0.75, 32, 'z'), GL, [0, 0, -0.2]);
        add(ear, g.torus(5.0, 0.42, 24, 4), GD, [0, 0, 1.6]);
        add(ear, g.ccyl(4.1, 1.5, 0.5, 28, 'z'), SV, [0, 0, 2.0]);
        add(ear, g.ccyl(2.4, 1.0, 0.35, 16, 'z'), GD, [0, 0, 2.7]);
        add(ear, boltRing(g, 6, 3.25, 0.36, 0.5, PI / 6), GM, [0, 0, 2.8]);
        add(ear, fuse('aEarMic', [[-0.7, 0], [0.7, 0], [0, 0.7], [0, -0.7], [0, 0]].map(q => [g.cyl(0.26, 0.26, 0.4, 6, 'z'), [q[0], q[1], 0]])), SEAM, [0, 0, 3.1]);
        h.add(ear);
      }
      // fond : anneau de cou sombre
      add(h, g.cyl(10.5, 10.5, 1.4, 24, 'y', true), GD, [-0.6, -16.6, 0]);
      return h0;
    }

    /* ---------- COU ---------- */
    function neck() {
      const n = ctx.group();
      add(n, g.cyl(4.8, 5.4, 14, 18), GD, [0, 7, 0]);
      for (const y of [2.5, 5.5, 8.5]) add(n, g.ccyl(5.9, 1.4, 0.4, 16), GM, [0, y, 0]);
      return n;
    }

    /* =====================================================
       TORSE : bassin « short », taille, buste, épaules, sac à dos
       ===================================================== */
    function torso() {
      const t = ctx.group();
      // bassin « short » blanc, découpé en V devant/derrière
      add(t, panel('aPel', PEL, (u, v) => { const th = u * 2 * PI; return [th, lerp(PEL_B(th), 14.5, v)]; }, { closed: true, nu: 34, nv: 7, c: 0.8 }), W);
      add(t, sline(g, PEL, u => [u * 2 * PI, 9.6], 0.02, 0.3, 32), SEAM);                 // ceinture
      add(t, sline(g, PEL, u => [PI, lerp(-8, 9.4, u)], 0.02, 0.26, 10), SEAM);            // joint arrière
      // capteurs à ultrasons (avant du bassin)
      for (const z of [1, -1]) {
        onSurf(t, PEL, z * 26 * D, 6.6, g.ccyl(1.05, 0.5, 0.15, 14), GL, 0.05);
        onSurf(t, PEL, z * 26 * D, 6.6, g.cyl(0.6, 0.6, 0.6, 12), SEN, 0.12);
      }
      // taille sombre + nervures
      add(t, tube('aWaist', WAIST, { nu: 24, nv: 3, c: 0, capB: false, capT: false }), GD);
      add(t, tube('aWaistRib', WAIST, { s0: 15, s1: 16.3, off: 0.7, nu: 28, nv: 1, c: 0.3, capB: false, capT: false }), GM);
      add(t, tube('aWaistRib2', WAIST, { s0: 18.4, s1: 19.7, off: 0.7, nu: 28, nv: 1, c: 0.3, capB: false, capT: false }), GM);
      // buste : noyau sombre + 2 coques blanches séparées par un joint
      add(t, tube('aChestCore', CHEST, { s0: 19, s1: 62, off: -1.1, nu: 20, nv: 6, c: 0, capB: false, capT: false }), GD);
      add(t, tube('aChestLo', CHEST, { s0: 18.8, s1: 32.6, nu: 32, nv: 4, c: 0.6 }), W);
      add(t, tube('aChestUp', CHEST, { s0: 33.4, s1: 63.6, nu: 32, nv: 10, c: 0.7, cT: 0.4 }), W);
      // joints verticaux (plastron / flancs)
      for (const z of [1, -1]) add(t, sline(g, CHEST, u => [z * 74 * D, lerp(34, 58.5, u)], 0.02, 0.28, 12), SEAM);
      // plastron gris argent + son joint
      // (coins arrondis : la largeur angulaire se resserre aux extrémités)
      const plW = y => { const d = Math.max(0, 1 - Math.min(y - 36, 53.6 - y) / 2.8); return (26 + (y - 36) * 0.45 - 7 * (1 - Math.sqrt(Math.max(0, 1 - d * d)))) * D; };
      add(t, panel('aChestPl', CHEST, shield(36, 53.6, plW), { off: 0.35, c: 0.45, t: 1.1, nu: 14, nv: 12 }), GL);
      for (const z of [1, -1]) for (const y of [38.2, 51.6]) onSurf(t, CHEST, z * (plW(y) - 3.2 * D), y, g.cyl(0.45, 0.45, 0.3, 6), GM, 0.38);
      // fenêtre des capteurs de sol (noire) dans un cadre gris
      add(t, panel('aSensFr', CHEST, shield(21.4, 29.6, 29 * D), { off: 0.15, c: 0.35, t: 0.9, nu: 10, nv: 4 }), GL);
      add(t, panel('aSensWin', CHEST, shield(22.4, 28.6, 25 * D), { off: 0.4, c: 0.3, t: 0.6, nu: 10, nv: 4 }), SEN);
      // logo HONDA (rouge) sur le haut du buste
      add(t, word('aHonda', g, CHEST, 'HONDA', 56.6, 1.55, 1.75, 1, 0.05, 0.3), RED);
      // col
      add(t, g.ccyl(8.6, 2.6, 0.6, 28), GL, [0.4, 62.4, 0]);
      add(t, g.cyl(7.2, 7.2, 1.2, 24), GD, [0.4, 64.0, 0]);
      // épaules : axes sombres
      for (const sd of [1, -1]) add(t, g.cyl(6.2, 6.2, 10, 18, 'z'), GD, [0, 51.6, sd * 17]);
      // ---- sac à dos (batterie)
      add(t, tube('aPack', PACK, { nu: 32, nv: 8, c: 0.9 }), W);
      for (const z of [1, -1]) add(t, sline(g, PACK, u => [z * 90 * D, lerp(19, 62, u)], 0.02, 0.3, 10), SEAM);
      add(t, sline(g, PACK, u => [lerp(-80, 80, u) * D, 61.2], 0.02, 0.28, 16), SEAM);
      // panneau dorsal + lettrage ASIMO
      add(t, panel('aPackPl', PACK, band(PI - 52 * D, PI + 52 * D, 23, 46), { off: 0.35, c: 0.45, t: 1, nu: 14, nv: 6 }), W);
      add(t, word('aAsimo', g, PACK, 'ASIMO', 37.5, 3.6, 4.0, -1, 0.35, 0.45), GM);
      // grille d'aération haute
      add(t, panel('aPackGr', PACK, band(PI - 46 * D, PI + 46 * D, 49, 59), { off: 0.15, c: 0.35, t: 1, nu: 12, nv: 4 }), GD);
      const slats = [];
      for (let i = 0; i < 5; i++) slats.push([g.cbox(1.2, 0.8, 17, 0.25), [-30.4, 50.4 + i * 1.8, 0]]);
      add(t, fuse('aSlats', slats), GL);
      // ouïes latérales (grilles sombres)
      for (const z of [1, -1]) {
        add(t, panel('aPackSide', PACK, band(90 * D - 11 * D, 90 * D + 11 * D, 30, 42), { off: 0.1, c: 0.3, t: 0.8, nu: 5, nv: 3 }), GL, null, null, [1, 1, z]);
        const fins = [];
        for (let i = 0; i < 4; i++) fins.push([g.cbox(3.6, 0.55, 0.5, 0.15), [-20.6, 32.1 + i * 2.6, 14.95]]);
        add(t, fuse('aPackFins', fins), GD, null, null, [1, 1, z]);
      }
      // vis + voyant d'état
      add(t, fuse('aPackBolts', [[-9, 24.5], [9, 24.5], [-9, 44.6], [9, 44.6]].map(q => [g.cyl(0.5, 0.5, 0.6, 6, 'x'), [0, q[1], q[0]]])), GM, [-30.85, 0, 0]);
      add(t, g.ccyl(0.9, 0.8, 0.3, 12, 'x'), LED, [-30.6, 42, 9]);
      // hanches : moyeux sombres + entrejambe
      for (const sd of [1, -1]) add(t, g.cyl(5.5, 5.5, 6, 14, 'z'), GD, [0, 0, sd * 7.5]);
      add(t, g.cbox(8, 6, 7, 1.2), GD, [0, -7.5, 0]);
      return t;
    }

    /* ---------- ÉPAULE (dôme) ---------- */
    function shoulderCap(sd) {
      return sidePart(sd, m => {
        add(m, tube('aShc', SHC, { nu: 28, nv: 7, c: 0.8 }), W);
        add(m, sline(g, SHC, u => [u * 2 * PI, 0.2], 0.02, 0.3, 28), SEAM);
        add(m, g.ccyl(4.6, 1.2, 0.35, 28, 'z'), GL, [0, 1, 11.8]);
        add(m, boltRing(g, 6, 3.4, 0.36, 0.5, 0), GM, [0, 1, 12.45]);
        add(m, g.ccyl(1.6, 0.8, 0.25, 14, 'z'), GM, [0, 1, 12.5]);
        add(m, g.torus(8.4, 0.75, 24, 4, PI * 2, 'z'), GD, [0, 1, -6.2]);
      });
    }

    /* ---------- BRAS ---------- */
    function upperArm(sd) {
      return sidePart(sd, a => {
        add(a, g.cyl(4.2, 4.2, 30, 14), GD, [0, 16, 0]);
        // bague d'épaule grise nervurée
        add(a, tube('aUAband', UA, { s0: 1.0, s1: 4.6, off: -0.2, nu: 28, nv: 1, c: 0.4 }), GL);
        add(a, tube('aUArib', UA, { s0: 2.4, s1: 3.1, off: 0.05, nu: 28, nv: 1, c: 0.2 }), GD);
        // coque blanche + panneau extérieur en relief
        add(a, tube('aUA', UA, { s0: 5.4, s1: 27.4, nu: 28, nv: 6, c: 0.6 }), W);
        add(a, panel('aUAout', UA, band(52 * D, 128 * D, 9.5, 23.5), { off: 0.3, c: 0.4, t: 1, nu: 10, nv: 6 }), W);
        add(a, sline(g, UA, u => [lerp(-60, 60, u) * D + PI, 25.2], 0.02, 0.24, 12), SEAM);
      });
    }
    function elbow(sd) {
      return sidePart(sd, e => {
        add(e, g.ccyl(5.1, 10.6, 0.7, 24, 'z'), GD);
        for (const z of [1, -1]) {
          add(e, g.ccyl(3.6, 1, 0.3, 18, 'z'), GL, [0, 0, z * 5.4]);
          add(e, g.cyl(1.2, 1.2, 0.6, 8, 'z'), STEEL, [0, 0, z * 5.9]);
        }
        add(e, boltRing(g, 5, 2.4, 0.3, 0.4, 0), GM, [0, 0, 5.95]);
        // coude : capot blanc à l'arrière (+X)
        add(e, g.shape('asimoElbowCap', s => { s.moveTo(3.2, -4.6); s.quadraticCurveTo(7.4, -3.4, 7.2, 0.4); s.quadraticCurveTo(7.0, 3.6, 3.6, 5.0); s.lineTo(3.0, 0.4); s.closePath(); }, 8.6, 0.7, 6), W);
      });
    }
    function foreArm(sd) {
      return sidePart(sd, f => {
        add(f, g.cyl(3.8, 3.8, 28, 14), GD, [0, 15, 0]);
        add(f, tube('aFAband', FA, { s0: 1.4, s1: 3.0, off: -0.3, nu: 28, nv: 1, c: 0.3 }), GL);
        add(f, tube('aFA', FA, { s0: 3.6, s1: 26.6, nu: 28, nv: 7, c: 0.6 }), W);
        // panneau extérieur + joint inférieur
        add(f, panel('aFAout', FA, band(46 * D, 134 * D, 6.5, 21.5), { off: 0.3, c: 0.4, t: 1, nu: 10, nv: 6 }), W);
        add(f, sline(g, FA, u => [-90 * D, lerp(5, 23.5, u)], 0.02, 0.26, 10), SEAM);
        // poignet : bracelet gris + rotule sombre
        add(f, g.ccyl(4.35, 2.6, 0.55, 22), GL, [0, 28.4, 0]);
        add(f, g.cyl(4.0, 4.0, 0.5, 22), GD, [0, 27.0, 0]);
        add(f, g.ccyl(3.2, 1.6, 0.3, 18), GD, [0, 30.4, 0]);
      });
    }

    /* ---------- MAIN : dos blanc, paume grise, 4 doigts + pouce gris clair ---------- */
    const PL = 7.0, PT = 3.2, PW = 7.4, FL = [3.3, 2.5, 2.0], FTK = [2.2, 2.0, 1.8], FWD = 1.62;
    const phal = (Lf, th, w, tip) => fuse(`aPhal${Lf},${th},${w},${tip}`, [
      [g.cbox(Lf, th, w, 0.42), [Lf / 2, 0, 0]],
      [g.cyl(th * 0.5, th * 0.5, w * 0.94, 10, 'z'), [0, 0, 0]],
      ...(tip ? [[g.cyl(th * 0.46, th * 0.46, w * 0.9, 10, 'z'), [Lf - 0.1, -0.05, 0]]] : [])
    ]);
    function hand(side) {
      const root = ctx.group();
      add(root, g.ccyl(2.6, 2.4, 0.4, 16, 'x'), GD, [1.0, 0, 0]);
      // corps de main bombé (dos blanc), paume grise rapportée, joint transversal
      add(root, tube('aHandB', HANDB, { nu: 20, nv: 4, c: 0.5 }), W);
      add(root, panel('aHandPalm', HANDB, band(116 * D, 244 * D, 3.0, 9.5), { off: 0.12, c: 0.3, t: 0.6, nu: 8, nv: 4 }), GL);
      add(root, sline(g, HANDB, u => [lerp(-104, 104, u) * D, 4.3], 0.02, 0.15, 10), SEAM);
      add(root, g.cbox(3.2, 0.5, 4.4, 0.2), GD, [6.6, -1.62, 0]);                          // coussinet de paume
      add(root, fuse('aKnuck', [0, 1, 2, 3].map(i => [g.cyl(0.95, 0.95, 1.45, 10, 'z'), [2.6 + PL, 0.25, ((i + 0.5) / 4 - 0.5) * PW * 0.92]])), GD);
      const fingers = [];
      for (let i = 0; i < 4; i++) {
        const zz = ((i + 0.5) / 4 - 0.5) * PW * 0.92 * side, k = [0.94, 1, 0.97, 0.84][i];
        let parent = root; const segs = [];
        for (let j = 0; j < 3; j++) {
          const piv = ctx.group(); piv.userData.noMerge = true;
          if (j === 0) piv.position.set(2.6 + PL + 0.5, 0, zz); else piv.position.set(FL[j - 1] * k, 0, 0);
          add(piv, phal(+(FL[j] * k).toFixed(2), FTK[j], FWD, j === 2), GL);
          parent.add(piv); parent = piv; segs.push(piv);
        }
        fingers.push(segs);
      }
      const t0 = ctx.group(); t0.position.set(3.6, -0.8, -side * 3.1); t0.userData.noMerge = true;
      add(t0, phal(3.6, 2.2, 1.9, false), GL);
      const t1 = ctx.group(); t1.position.set(3.6, 0, 0); t0.add(t1);
      add(t1, phal(2.8, 2.0, 1.8, true), GL);
      root.add(t0);
      root.userData.setCurl = c => {
        for (const sg of fingers) { sg[0].rotation.z = -88 * c * D; sg[1].rotation.z = -96 * c * D; sg[2].rotation.z = -70 * c * D; }
        t0.rotation.set(-side * (20 + 30 * c) * D, side * (25 + 20 * c) * D, -(25 + 45 * c) * D);
        t1.rotation.z = -45 * c * D;
      };
      root.userData.setCurl(1);
      return root;
    }

    /* =====================================================
       JAMBES
       ===================================================== */
    function hip(sd) {
      return sidePart(sd, hp => {
        add(hp, g.ccyl(6.2, 2.2, 0.6, 24, 'z'), GL, [0, 1.5, 8.7]);
        add(hp, g.torus(4.4, 0.45, 20, 4), GD, [0, 1.5, 9.9]);
        add(hp, g.cyl(1.8, 1.8, 1, 12, 'z'), GM, [0, 1.5, 10]);
        add(hp, boltRing(g, 6, 3.2, 0.34, 0.5, PI / 6), GM, [0, 1.5, 9.9]);
      });
    }
    function thigh(sd) {
      return sidePart(sd, t => {
        add(t, tube('aTHcore', TH, { s0: -3, s1: 38, off: -0.9, nu: 16, nv: 5, c: 0, capB: false }), GD);
        // 3 panneaux : arrière/intérieur, extérieur, avant (joints sombres entre eux)
        add(t, panel('aTHrear', TH, band(-138 * D, 38 * D, -3, 35.6), { c: 0.5, t: 1.3, nu: 22, nv: 9 }), W);
        add(t, panel('aTHout', TH, band(41.5 * D, 136.5 * D, -1, 35.2), { c: 0.5, t: 1.3, nu: 12, nv: 9 }), W);
        add(t, panel('aTHfront', TH, band(140 * D, 218.5 * D, 1, 35.4), { off: 0.15, c: 0.5, t: 1.3, nu: 10, nv: 9 }), W);
        // joint horizontal bas + liseré gris au-dessus du genou
        add(t, tube('aTHcuff', TH, { s0: 36.0, s1: 38.2, off: -0.5, nu: 24, nv: 1, c: 0.3 }), GL);
      });
    }
    function knee(sd) {
      return sidePart(sd, k => {
        add(k, g.ccyl(6.5, 14.2, 0.8, 26, 'z'), GD);
        add(k, g.shape('asimoKneecap', s => {
          s.moveTo(-5.0, -7.2); s.quadraticCurveTo(-8.6, -6.0, -9.8, -1.6); s.quadraticCurveTo(-10.4, 3.4, -7.8, 7.6);
          s.lineTo(-5.2, 8.8); s.quadraticCurveTo(-6.4, 4.4, -6.6, 0); s.quadraticCurveTo(-6.4, -3.8, -5.0, -7.2);
        }, 12.4, 0.7, 6), W);
        add(k, g.cbox(1.2, 5.2, 9.6, 0.3), GL, [-9.6, 0.6, 0], [0, 0, 0.05]);
        add(k, g.ccyl(4.6, 1.2, 0.35, 20, 'z'), GL, [0.4, 0, 7.2]);
        add(k, g.ccyl(4.6, 1.2, 0.35, 20, 'z'), GL, [0.4, 0, -7.2]);
        add(k, g.cyl(1.5, 1.5, 0.8, 10, 'z'), STEEL, [0.4, 0, 7.9]);
        add(k, boltRing(g, 6, 3.3, 0.34, 0.5, 0), GM, [0.4, 0, 7.85]);
      });
    }
    function shin(sd) {
      return sidePart(sd, s => {
        add(s, g.cyl(4.6, 4.4, 42, 14), GD, [0, 21, 0]);
        add(s, tube('aSHcore', SH, { s0: 3, s1: 37.4, off: -0.9, nu: 16, nv: 5, c: 0, capB: false, capT: false }), GD);
        // mollet (arrière + côtés) en deux pièces, plaque de tibia avant en relief
        add(s, panel('aSHcalf', SH, band(-118 * D, 118 * D, 3.6, 27.4), { c: 0.5, t: 1.3, nu: 24, nv: 7 }), W);
        add(s, panel('aSHcalfLo', SH, band(-118 * D, 118 * D, 28.2, 37.4), { c: 0.5, t: 1.3, nu: 24, nv: 3 }), W);
        add(s, panel('aSHfront', SH, band(121.5 * D, 238.5 * D, 3.0, 37.2), { off: 0.2, c: 0.5, t: 1.3, nu: 14, nv: 8 }), W);
        add(s, panel('aSHfrontIn', SH, band(150 * D, 210 * D, 9, 30), { off: 0.45, c: 0.35, t: 0.5, nu: 8, nv: 6 }), W);
        // bracelet de cheville gris
        add(s, tube('aSHcuff', SH, { s0: 37.8, s1: 40.0, off: -0.6, nu: 24, nv: 1, c: 0.3 }), GL);
      });
    }
    // pied : coque blanche, semelle intermédiaire grise, semelle caoutchouc ; orteil articulé
    // (pivot passif animé dans tick : reste à plat quand le pied bascule pointe en bas)
    const TOEX = 14, TOEY = -5.4, toes = [];
    function foot(sd, key) {
      return sidePart(sd, f => {
        add(f, g.ccyl(4.6, 10.8, 0.6, 20, 'z'), GD);
        add(f, tube('aFoot', FOOT, { nu: 26, nv: 7, c: 0.7 }), W);
        add(f, tube('aSole', SOLE, { s1: 13.7, nu: 16, nv: 4, c: 0.5 }), RUB);
        add(f, tube('aMid', MID, { s1: 13.7, nu: 16, nv: 4, c: 0.4 }), GL);
        add(f, g.cbox(1.4, 5.2, 12, 0.3), GD, [13.9, -4.0, 0]);
        add(f, sline(g, FOOT, u => [lerp(-80, 80, u) * D, -6.8], 0.02, 0.24, 12), SEAM);
        for (const z of [1, -1]) {
          add(f, g.ccyl(3.4, 1.2, 0.35, 16, 'z'), GL, [0, 0, z * 5.6]);
          add(f, g.cyl(1.3, 1.3, 0.5, 8, 'z'), STEEL, [0, 0, z * 6.25]);
        }
        const toe = ctx.group(); toe.position.set(TOEX, TOEY, 0); toe.userData.noMerge = true;
        add(toe, fuse('aToeW', [[tube('aToe', TOE, { nu: 24, nv: 3, c: 0.6 }), [-TOEX, -TOEY, 0]]]), W);
        add(toe, fuse('aToeS', [[tube('aSoleT', SOLE, { s0: 14.3, nu: 14, nv: 3, c: 0.5 }), [-TOEX, -TOEY, 0]], [tube('aMidT', MID, { s0: 14.3, nu: 14, nv: 3, c: 0.4 }), [-TOEX, -TOEY, 0]]]), GL);
        f.add(toe); toes.push([key, toe]);
      });
    }

    /* ---------- assemblage ---------- */
    P.torso = torso();
    P.neck = neck();
    P.head = head();
    for (const [sd, z] of [['f', 1], ['b', -1]]) {
      P[sd + 'sc'] = shoulderCap(z);
      P[sd + 'ua'] = upperArm(z);
      P[sd + 'el'] = elbow(z);
      P[sd + 'fa'] = foreArm(z);
      P[sd + 'ha'] = hand(z);
      P[sd + 'hi'] = hip(z);
      P[sd + 'th'] = thigh(z);
      P[sd + 'kn'] = knee(z);
      P[sd + 'sh'] = shin(z);
      P[sd + 'fo'] = foot(z, sd + 'fo');
    }
    const tick = ctx.override ? undefined : (t, state) => {
      const sup = state && (state.st === 'super' || state.st === 'special');
      LED.emissiveIntensity = LED.userData.baseI * ((sup ? 1.6 : 0.75) + 0.25 * Math.sin(t * 2.2));
      for (const [k, toe] of toes) toe.rotation.z = Math.min(38 * D, Math.max(0, -P[k].rotation.z * 0.85));
    };
    return { parts: P, shZ: 23.5, hpZ: 10.5, tick };
  };
})();
