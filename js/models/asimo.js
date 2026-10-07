'use strict';
/* =========================================================
   Modèle 3D : HONDA ASIMO (2005–2011)
   Contrat : voir js/kit.js.
   Design : grand casque blanc sphérique avec large visière fumée noire enveloppante,
   « oreilles » circulaires gris clair ; buste blanc à plastron gris argent, gros sac à dos
   blanc (batterie) avec grille d'aération ; bassin « short » blanc découpé en V ;
   épaules en dômes blancs ; bras/cuisses/tibias en coques blanches lustrées, articulations
   grises ; genoux toujours fléchis ; grands pieds blancs à semelle grise et orteil articulé.
   Technique : coques = sections superelliptiques interpolées (loft) avec chanfreins nets
   aux extrémités et parois, panneaux découpés dans les mêmes profils (joints sombres),
   lignes de joint posées sur la surface. Géométries mises en cache localement.
   ========================================================= */
if (typeof RK !== 'undefined' && RK) RK.models.asimo = (function () {
  const T = RK.T, BGU = T.BufferGeometryUtils, PI = Math.PI, D = PI / 180;
  const GC = {};
  let RES = 1; // résolution courante (1 = haute, 0.4 = basse)
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
    const nu = resN(o.nu || 28, 8), nv = resN(o.nv || 8, 2);
    return sheet(`${key}|${nu}x${nv}`, (u, v, of) => pt(tb, u * 2 * PI, lerp(s0, s1, v), of + off),
      Object.assign({}, o, { nu, nv, closed: true, flip: tb.axis !== 'y' }));
  }
  // panneau découpé dans le profil : map(u, v) -> [theta, s]
  function panel(key, tb, map, o = {}) {
    const off = o.off || 0, nu = resN(o.nu || 16, 4), nv = resN(o.nv || 8, 2);
    return sheet(`${key}|${nu}x${nv}`, (u, v, of) => { const m = map(u, v); return pt(tb, m[0], m[1], of + off); },
      Object.assign({}, o, { nu, nv, closed: !!o.closed, flip: tb.axis !== 'y' }));
  }
  const band = (th0, th1, s0, s1) => (u, v) => { const th = lerp(th0, th1, u); return [th, lerp(typeof s0 === 'function' ? s0(th) : s0, typeof s1 === 'function' ? s1(th) : s1, v)]; };
  const shield = (s0, s1, wf, c0 = 0) => (u, v) => { const s = lerp(s0, s1, v), w = wf(s); return [c0 + lerp(-w, w, u), s]; };
  // ligne de joint posée sur la surface : path(t) -> [theta, s]
  function sline(g, tb, path, off, r, n = 20) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const [th, s] = path(i / n); pts.push(pt(tb, th, s, off).map(v => Math.round(v * 100) / 100)); }
    return g.tube(pts, r, Math.max(6, Math.round(n * 1.5 * RES)), 5);
  }
  // fusion de petites géométries : items = [[geo, [x,y,z], [rx,ry,rz], échelle]]
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();
  function fuse(key, items) {
    if (GC[key]) return GC[key];
    const list = items.map(([geo, p, r, s]) => {
      const gg = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const nm of Object.keys(gg.attributes)) if (nm !== 'position' && nm !== 'normal') gg.deleteAttribute(nm);
      _m.compose(_v.set(...(p || [0, 0, 0])), _q.setFromEuler(_e.set(...(r || [0, 0, 0]))), Array.isArray(s) ? _s.set(...s) : _s.setScalar(s || 1));
      gg.applyMatrix4(_m); return gg;
    });
    return (GC[key] = BGU.mergeGeometries(list, false));
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
  const visorMap = (y0, y1, grow) => (u, v) => { const y = lerp(y0, y1, v); return [lerp(-1, 1, u) * (VIS_W(y) + grow), y]; };

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
    { x: -9.4, yt: 2.2, yb: 1.6, z: 5.2, y0: -3.2 },
    { x: -8, yt: 3.4, yb: 2.0, z: 6.4, y0: -2.6 },
    { x: -3, yt: 4.6, yb: 2.0, z: 6.9, y0: -2.3 },
    { x: 4, yt: 4.0, yb: 2.0, z: 7.0, y0: -2.5 },
    { x: 10, yt: 2.9, yb: 2.0, z: 7.0, y0: -2.7 },
    { x: 13.6, yt: 2.5, yb: 2.0, z: 6.9, y0: -2.8 }
  ], 3.6);
  const TOE = tab('x', [
    { x: 14.2, yt: 2.3, yb: 2.0, z: 6.8, y0: -2.9 },
    { x: 18.5, yt: 1.9, yb: 1.9, z: 6.3, y0: -3.1 },
    { x: 21, yt: 1.5, yb: 1.7, z: 5.2, y0: -3.3 },
    { x: 22.2, yt: 1.0, yb: 1.2, z: 3.6, y0: -3.6 }
  ], 3.6);
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
    const { ch, g } = ctx;
    const lo = ctx.lod === 'low';
    RES = lo ? 0.4 : 1;
    const P = {};
    const add = (p, geo, mat, pos, rot, scl) => ctx.add(p, geo, mat, { p: pos, r: rot, s: scl });

    /* ---------- matériaux ---------- */
    const M = ctx.M;
    const W = M.shell;                                         // blanc laqué
    const GL = ctx.mat({ color: 0xc9c9c4, roughness: 0.42, metalness: 0.2, clearcoat: 0.55, clearcoatRoughness: 0.2, envMapIntensity: 0.55 }); // gris clair
    const GM = ctx.mat({ color: 0x8e9198, roughness: 0.36, metalness: 0.6, clearcoat: 0.3, envMapIntensity: 0.7 });   // gris moyen métal
    const GD = ctx.mat({ color: 0x3c3f46, roughness: 0.48, metalness: 0.35, clearcoat: 0.25, envMapIntensity: 0.5 });  // gris foncé (articulations)
    const VIS = ctx.mat({ color: 0x06070b, roughness: 0.04, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5 });
    const SEAM = M.seam, RUB = M.rubber, STEEL = M.steel;
    const RED = ctx.mat({ color: ch.accent, roughness: 0.3, clearcoat: 0.8 });
    const LED = ctx.glow(ch.accent, 2.4);

    /* ---------- TÊTE ---------- */
    function head() {
      const h = ctx.group();
      add(h, tube('aHead', HEAD, { nu: 44, nv: 30, cB: 0.9, cT: 0, vmap: v => Math.sin(v * PI / 2) }), W);
      if (!lo) {
        // rebord blanc de la visière + visière fumée
        add(h, panel('aVisRim', HEAD, visorMap(-13.6, 9.2, 3.2 * D), { off: 0.3, c: 0.45, t: 1.2, nu: 30, nv: 16 }), W);
        add(h, panel('aVisor', HEAD, visorMap(-12.8, 8.2, 0), { off: 0.75, c: 0.55, t: 1.6, nu: 30, nv: 16 }), VIS);
        // joints du casque : par-dessus le crâne (d'une oreille à l'autre) et sous la nuque
        add(h, sline(g, HEAD, t => { const a = lerp(-1, 1, t); return [a < 0 ? -103 * D : 103 * D, 3 + (19.3 - 3) * (1 - Math.abs(a))]; }, 0.02, 0.32, 24), SEAM);
        add(h, sline(g, HEAD, t => [lerp(118, 242, t) * D, -7.5], 0.02, 0.3, 16), SEAM);
        add(h, sline(g, HEAD, t => [lerp(-58, 58, t) * D, -15.2], 0.02, 0.28, 14), SEAM);
        // oreilles (capteurs) circulaires
        for (const sd of [1, -1]) {
          const p = pt(HEAD, sd * 99 * D, -1.6, 0);
          const ear = ctx.group(); ear.position.set(p[0], p[1], p[2]); ear.rotation.y = sd > 0 ? -9 * D : PI + 9 * D;
          add(ear, g.ccyl(6.6, 2.4, 0.7, 32, 'z'), GL, [0, 0, 0.2]);
          add(ear, g.torus(5.2, 0.5, 32, 6), GD, [0, 0, 1.4]);
          add(ear, g.ccyl(4.3, 1.8, 0.5, 28, 'z'), GL, [0, 0, 1.9]);
          add(ear, g.ccyl(2.2, 1.0, 0.3, 20, 'z'), GM, [0, 0, 2.8]);
          add(ear, fuse('aEarBolts', Array.from({ length: 6 }, (_, i) => { const a = i / 6 * 2 * PI + PI / 6; return [g.cyl(0.42, 0.42, 0.6, 6, 'z'), [Math.cos(a) * 3.3, Math.sin(a) * 3.3, 0]]; })), GM, [0, 0, 2.8]);
          h.add(ear);
        }
        // fond : anneau de cou sombre
        add(h, g.ccyl(10.5, 1.4, 0.4, 32), GD, [-0.6, -16.6, 0]);
      } else {
        add(h, panel('aVisor', HEAD, visorMap(-12.8, 8.2, 0), { off: 0.75, c: 0.55, t: 1.6, nu: 30, nv: 16 }), VIS);
        add(h, g.ccyl(6, 3, 0.6, 10, 'z'), GL, [-1.5, -1.6, 17]);
        add(h, g.ccyl(6, 3, 0.6, 10, 'z'), GL, [-1.5, -1.6, -17]);
      }
      return h;
    }

    /* ---------- COU ---------- */
    function neck() {
      const n = ctx.group();
      add(n, g.cyl(4.8, 5.4, 14, lo ? 8 : 18), GD, [0, 7, 0]);
      if (!lo) for (const y of [2.5, 5.5, 8.5]) add(n, g.ccyl(5.9, 1.4, 0.4, 20), GM, [0, y, 0]);
      return n;
    }

    /* ---------- TORSE ---------- */
    function torso() {
      const t = ctx.group();
      // bassin « short » blanc, découpé en V devant/derrière
      add(t, panel('aPel', PEL, (u, v) => { const th = u * 2 * PI; return [th, lerp(PEL_B(th), 14.5, v)]; }, { closed: true, nu: 40, nv: 8, c: 0.8 }), W);
      // taille sombre + nervures
      add(t, tube('aWaist', WAIST, { nu: 28, nv: 4, c: 0.4 }), GD);
      // buste : noyau sombre + 2 coques blanches séparées par un joint
      add(t, tube('aChestCore', CHEST, { s0: 19, s1: 62, off: -1.1, nu: 24, nv: 6, c: 0 }), GD);
      add(t, tube('aChestLo', CHEST, { s0: 18.8, s1: 32.6, nu: 36, nv: 5, c: 0.6 }), W);
      add(t, tube('aChestUp', CHEST, { s0: 33.4, s1: 63.6, nu: 36, nv: 12, c: 0.7, cT: 0.4 }), W);
      // épaules : axes sombres
      for (const sd of [1, -1]) add(t, g.ccyl(6.2, 10, 0.6, lo ? 10 : 22, 'z'), GD, [0, 51.6, sd * 17]);
      // sac à dos
      add(t, tube('aPack', PACK, { nu: 36, nv: 10, c: 0.9 }), W);
      if (!lo) {
        // plastron gris argent
        add(t, panel('aChestPl', CHEST, shield(37.5, 54.5, y => (22 + (y - 37.5) * 0.75) * D), { off: 0.35, c: 0.45, t: 1, nu: 14, nv: 8 }), GL);
        // logo rouge
        add(t, g.cbox(1.2, 1.3, 7.5, 0.25), RED, [13.6, 52.2, 0]);
        // col
        add(t, g.ccyl(8.6, 2.6, 0.6, 28), GL, [0.4, 62.4, 0]);
        // nervures de taille
        add(t, tube('aWaistRib', WAIST, { s0: 15, s1: 16.3, off: 0.7, nu: 28, nv: 1, c: 0.3 }), GM);
        add(t, tube('aWaistRib2', WAIST, { s0: 18.4, s1: 19.7, off: 0.7, nu: 28, nv: 1, c: 0.3 }), GM);
        // joints latéraux du sac à dos
        add(t, sline(g, PACK, t => [90 * D, lerp(19, 62, t)], 0.02, 0.3, 10), SEAM);
        add(t, sline(g, PACK, t => [-90 * D, lerp(19, 62, t)], 0.02, 0.3, 10), SEAM);
        // panneau dorsal + grille d'aération
        add(t, panel('aPackPl', PACK, band(PI - 52 * D, PI + 52 * D, 23, 46), { off: 0.35, c: 0.45, t: 1, nu: 14, nv: 6 }), W);
        add(t, panel('aPackGr', PACK, band(PI - 46 * D, PI + 46 * D, 49, 59), { off: 0.15, c: 0.35, t: 1, nu: 12, nv: 4 }), GD);
        const slats = [];
        for (let i = 0; i < 5; i++) slats.push([g.cbox(1.2, 0.8, 17, 0.25), [-30.4, 50.4 + i * 1.8, 0]]);
        add(t, fuse('aSlats', slats), GL);
        // voyant d'état
        add(t, g.ccyl(0.9, 0.8, 0.3, 12, 'x'), LED, [-30.6, 42, 9]);
        // hanches : moyeux sombres
        for (const sd of [1, -1]) add(t, g.ccyl(5.5, 6, 0.6, 18, 'z'), GD, [0, 0, sd * 7.5]);
        // entrejambe
        add(t, g.cbox(8, 6, 7, 1.2), GD, [0, -7.5, 0]);
      }
      return t;
    }

    /* ---------- ÉPAULE (dôme) ---------- */
    function shoulderCap(sd) {
      const s = ctx.group(), m = ctx.group(); m.scale.set(1, 1, sd); s.add(m);
      add(m, tube('aShc', SHC, { nu: 32, nv: 8, c: 0.8 }), W);
      if (!lo) {
        add(m, g.ccyl(4.6, 1.2, 0.35, 28, 'z'), GL, [0, 1, 11.8]);
        add(m, g.ccyl(1.6, 0.8, 0.25, 14, 'z'), GM, [0, 1, 12.5]);
        add(m, g.torus(8.4, 0.75, 32, 6, PI * 2, 'z'), GD, [0, 1, -6.2]);
      }
      return s;
    }

    /* ---------- BRAS ---------- */
    function upperArm() {
      const a = ctx.group();
      add(a, g.cyl(4.2, 4.2, 30, lo ? 8 : 14), GD, [0, 16, 0]);
      add(a, tube('aUA', UA, { s0: 5, s1: 27.4, nu: 28, nv: 6, c: 0.6 }), W);
      if (!lo) add(a, tube('aUAband', UA, { s0: 1.2, s1: 4.4, off: -0.2, nu: 28, nv: 1, c: 0.4 }), GL);
      return a;
    }
    function elbow() {
      const e = ctx.group();
      add(e, g.ccyl(5.1, 10.6, 0.7, lo ? 10 : 24, 'z'), GD);
      if (!lo) for (const z of [1, -1]) {
        add(e, g.ccyl(3.6, 1, 0.3, 20, 'z'), GL, [0, 0, z * 5.4]);
        add(e, g.ccyl(1.2, 0.6, 0.2, 10, 'z'), STEEL, [0, 0, z * 5.9]);
      }
      return e;
    }
    function foreArm() {
      const f = ctx.group();
      add(f, g.cyl(3.8, 3.8, 28, lo ? 8 : 14), GD, [0, 15, 0]);
      add(f, tube('aFA', FA, { s0: 3.4, s1: 25.2, nu: 28, nv: 7, c: 0.6 }), W);
      add(f, g.ccyl(4.5, 4.4, 0.6, lo ? 10 : 22), GL, [0, 28, 0]);
      if (!lo) add(f, g.ccyl(3.4, 2.2, 0.3, 18), GD, [0, 30.6, 0]);
      return f;
    }
    function hand(sd) {
      const h = RK.hand(ctx, { side: sd, palm: [8.4, 4.4, 8.4], fingers: 4, fLen: [3.3, 2.6, 2.2], fW: 1.85, style: 'human', palmMat: W, fingerMat: GL, jointMat: GD });
      if (!lo) {
        add(h, g.cbox(6.6, 1.4, 8.2, 0.5), W, [6.6, 2.6, 0]);   // dos de la main
        add(h, g.cbox(1.6, 1.0, 7.4, 0.35), GL, [10.4, 2.4, 0]); // barre des articulations
      }
      return h;
    }

    /* ---------- JAMBES ---------- */
    function hip(sd) {
      const hp = ctx.group();
      if (!lo) {
        add(hp, g.ccyl(6.2, 2.2, 0.6, 28, 'z'), GL, [0, 1.5, sd * 8.7]);
        add(hp, g.torus(4.4, 0.45, 28, 6), GD, [0, 1.5, sd * 9.9]);
        add(hp, g.ccyl(1.8, 1, 0.3, 14, 'z'), GM, [0, 1.5, sd * 10]);
      }
      return hp;
    }
    function thigh(sd) {
      const t = ctx.group();
      add(t, g.cyl(5.5, 5.5, 44, lo ? 8 : 14), GD, [0, 18, 0]);
      add(t, tube('aTH', TH, { s0: -3, s1: 35.6, nu: 32, nv: 9, c: 0.8 }), W);
      if (!lo) add(t, panel('aTHfront', TH, band(PI - 46 * D, PI + 46 * D, 7, 31), { off: 0.3, c: 0.45, t: 0.9, nu: 14, nv: 6 }), W);
      return t;
    }
    function knee(sd) {
      const k = ctx.group();
      add(k, g.ccyl(6.5, 14.2, 0.8, lo ? 10 : 26, 'z'), GD);
      add(k, g.prism([[-5.2, -7], [-8.4, -5.4], [-9.9, -1], [-9.5, 4], [-7.6, 7.8], [-4.8, 8.8], [-5.8, 4.6], [-6.6, 0], [-5.4, -4.4]], 12.4, 0.7), W);
      if (!lo) for (const z of [1, -1]) {
        add(k, g.ccyl(4.6, 1.2, 0.35, 24, 'z'), GL, [0.4, 0, z * 7.2]);
        add(k, g.ccyl(1.5, 0.8, 0.25, 12, 'z'), STEEL, [0.4, 0, z * 7.9]);
      }
      return k;
    }
    function shin(sd) {
      const s = ctx.group();
      add(s, g.cyl(4.6, 4.4, 42, lo ? 8 : 14), GD, [0, 21, 0]);
      add(s, tube('aSH', SH, { s0: 3.6, s1: 37.4, nu: 32, nv: 9, c: 0.8 }), W);
      if (!lo) add(s, panel('aSHfront', SH, band(PI - 40 * D, PI + 40 * D, 8, 33), { off: 0.3, c: 0.45, t: 0.9, nu: 12, nv: 6 }), W);
      return s;
    }
    function foot(sd) {
      const f = ctx.group();
      add(f, g.ccyl(4.6, 10.8, 0.6, lo ? 10 : 22, 'z'), GD);
      add(f, tube('aFoot', FOOT, { nu: 32, nv: 8, c: 0.7 }), W);
      add(f, tube('aSole', SOLE, { nu: 20, nv: 6, c: 0.5 }), RUB);
      if (!lo) {
        add(f, tube('aToe', TOE, { nu: 32, nv: 4, c: 0.6 }), W);
        add(f, tube('aMid', MID, { nu: 20, nv: 6, c: 0.4 }), GL);
        add(f, g.cbox(1.4, 4, 12, 0.3), GD, [13.9, -3, 0]);
        for (const z of [1, -1]) add(f, g.ccyl(3.4, 1.2, 0.35, 20, 'z'), GL, [0, 0, z * 5.6]);
      } else add(f, tube('aToe', TOE, { nu: 32, nv: 4, c: 0.6 }), W);
      return f;
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
      P[sd + 'fo'] = foot(z);
    }
    const tick = (lo || ctx.override) ? undefined : (t, state) => {
      const sup = state && (state.st === 'super' || state.st === 'special');
      LED.emissiveIntensity = LED.userData.baseI * ((sup ? 1.6 : 0.75) + 0.25 * Math.sin(t * 2.2));
    };
    return { parts: P, shZ: 23.5, hpZ: 10.5, tick };
  };
})();
