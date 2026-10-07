'use strict';
/* =========================================================
   Modèle 3D : FIGURE 02 (Figure AI, 2024)
   Contrat : voir js/kit.js.
   Design : robot entièrement noir (coques anthracite satinées-vernies, panneaux noir mat,
   articulations gunmetal), proportions humaines athlétiques.
   Tête : casque noir arrondi, grand écran facial noir brillant serti d'un cadre mat,
   barre lumineuse cyan pâle, caméras latérales. Buste sculpté à pans nets
   (plastron, côtes fendues, flancs mats, dos à batterie intégrée), taille segmentée,
   bassin en écusson, actionneurs de hanche/genou/coude apparents, mains à 5 doigts.
   Technique : coques = « patchs » découpés dans des profils à section rectangle
   arrondi (rayon/bombé variables, interpolés le long de l'axe), avec chanfrein + paroi
   (arêtes vives qui accrochent les néons, joints sombres entre panneaux) ; normales
   « à pli » (crease) pour garder des arêtes nettes sur des surfaces lisses.
   ========================================================= */
if (typeof RK !== 'undefined' && RK) RK.models.figure = (function () {
  const T = RK.T, BGU = T.BufferGeometryUtils, PI = Math.PI, D = PI / 180;
  const GC = {};
  const CREASE = 34 * D;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fv = (f, a) => typeof f === 'function' ? f(a) : f;
  const na = a => { a = ((a % 360) + 360) % 360; return a > 180 ? a - 360 : a; }; // angle normalisé (-180, 180]
  const crs = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };

  /* ---------- sections « rectangle arrondi » ----------
     Repère de la section (plan XZ, axe de la pièce = Y) :
       xp / xn : demi-épaisseur côté +X / -X ; zp / zn : demi-largeur côté +Z / -Z
       rp / rn : rayon des coins côté +X / côté -X ; bxp, bxn, bzp, bzn : bombé de chaque face
       x0 / z0 : décalage du centre.
     L'anneau est un polygone à nombre de sommets fixe (faces subdivisées + arcs de coin),
     paramétré par s (indice de sommet, fractionnaire). s = 0 : centre de la face +X.
     Les angles « nominaux » a (degrés) : 0 = +X, 90 = +Z, 180 = -X, 270 = -Z. */
  function lay(nF, nS, nB, cs) {
    const N = nF + 2 * nS + nB + 4 * cs, h = nF / 2;
    const K = [[0, 0], [45, h + cs / 2], [90, h + cs + nS / 2], [135, h + 1.5 * cs + nS], [180, h + 2 * cs + nS + nB / 2],
      [225, h + 2.5 * cs + nS + nB], [270, h + 3 * cs + 1.5 * nS + nB], [315, h + 3.5 * cs + 2 * nS + nB], [360, N]];
    return { nF, nS, nB, cs, N, K };
  }
  function a2s(L, a) {
    const q = Math.floor(a / 360), r = a - q * 360, K = L.K;
    let i = 0; while (i < K.length - 2 && K[i + 1][0] < r) i++;
    const t = (r - K[i][0]) / (K[i + 1][0] - K[i][0]);
    return q * L.N + lerp(K[i][1], K[i + 1][1], t);
  }
  function s2a(L, s) {
    const q = Math.floor(s / L.N), r = s - q * L.N, K = L.K;
    let i = 0; while (i < K.length - 2 && K[i + 1][1] < r) i++;
    const t = (r - K[i][1]) / (K[i + 1][1] - K[i][1]);
    return q * 360 + lerp(K[i][0], K[i + 1][0], t);
  }
  const KEYS = ['xp', 'xn', 'zp', 'zn', 'rp', 'rn', 'bxp', 'bxn', 'bzp', 'bzn', 'x0', 'z0'];
  function prof(L, list, def) {
    const tab = list.map(s => {
      const o = Object.assign({ x0: 0, z0: 0, rp: 2, rn: 2, bxp: 0, bxn: 0, bzp: 0, bzn: 0 }, def || {});
      if (s.x != null) o.xp = o.xn = s.x;
      if (s.z != null) o.zp = o.zn = s.z;
      if (s.r != null) o.rp = o.rn = s.r;
      if (s.b != null) o.bxp = o.bxn = o.bzp = o.bzn = s.b;
      return Object.assign(o, s);
    });
    tab.lay = L; return tab;
  }
  function dims(tab, y) {
    const n = tab.length;
    if (y <= tab[0].y) return tab[0];
    if (y >= tab[n - 1].y) return tab[n - 1];
    let i = 0; while (i < n - 2 && tab[i + 1].y < y) i++;
    const a = tab[i], b = tab[i + 1], t = (y - a.y) / (b.y - a.y);
    const p0 = tab[Math.max(0, i - 1)], p3 = tab[Math.min(n - 1, i + 2)];
    const o = { y };
    for (const k of KEYS) o[k] = crs(p0[k], a[k], b[k], p3[k], t);
    return o;
  }
  function ring(d, off, L) {
    const { nF, nS, nB, cs } = L;
    const xp = Math.max(0.05, d.xp + off), xn = Math.max(0.05, d.xn + off), zp = Math.max(0.05, d.zp + off), zn = Math.max(0.05, d.zn + off);
    let rp = Math.max(0.02, d.rp + off), rn = Math.max(0.02, d.rn + off);
    const hz = (zp + zn) / 2 - 0.005; rp = Math.min(rp, hz); rn = Math.min(rn, hz);
    const sx = xp + xn - 0.01; if (rp + rn > sx) { const k = sx / (rp + rn); rp *= k; rn *= k; }
    const pts = [];
    const seg = (ax, az, bx, bz, n, nx, nz, bu) => { for (let i = 0; i < n; i++) { const t = i / n, k = bu * 4 * t * (1 - t); pts.push([ax + (bx - ax) * t + nx * k, az + (bz - az) * t + nz * k]); } };
    const arc = (cx, cz, r, a0) => { for (let i = 0; i < cs; i++) { const a = (a0 + 90 * i / cs) * D; pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } };
    seg(xp, -zn + rp, xp, zp - rp, nF, 1, 0, d.bxp);
    arc(xp - rp, zp - rp, rp, 0);
    seg(xp - rp, zp, -xn + rn, zp, nS, 0, 1, d.bzp);
    arc(-xn + rn, zp - rn, rn, 90);
    seg(-xn, zp - rn, -xn, -zn + rn, nB, -1, 0, d.bxn);
    arc(-xn + rn, -zn + rn, rn, 180);
    seg(-xn + rn, -zn, xp - rp, -zn, nS, 0, -1, d.bzn);
    arc(xp - rp, -zn + rp, rp, 270);
    const h = nF / 2, N = L.N, out = new Array(N);
    for (let i = 0; i < N; i++) { const p = pts[(i + h) % N]; out[i] = [p[0] + d.x0, p[1] + d.z0]; }
    return out;
  }
  const ringAt = (r, s) => {
    const N = r.length, i = Math.floor(s), f = s - i;
    const a = r[((i % N) + N) % N], b = r[(((i + 1) % N) + N) % N];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  // point de surface (repère du profil) : angle nominal a (degrés), hauteur y, décalage normal off
  const SP = (tab, a, y, off = 0) => { const p = ringAt(ring(dims(tab, y), off, tab.lay), a2s(tab.lay, a)); return [p[0], y, p[1]]; };

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
    geo.setIndex(idx);
    return geo;
  }
  function fan(ring3, down) {
    const n = ring3.length, pos = new Float32Array((n + 1) * 3);
    let cx = 0, cy = 0, cz = 0;
    ring3.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; cx += p[0]; cy += p[1]; cz += p[2]; });
    pos[n * 3] = cx / n; pos[n * 3 + 1] = cy / n; pos[n * 3 + 2] = cz / n;
    const idx = [];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (down) idx.push(n, i, j); else idx.push(n, j, i); }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    return geo;
  }
  const finish = (geos, o) => {
    let geo = geos.length > 1 ? BGU.mergeGeometries(geos, false) : geos[0];
    geo = BGU.toCreasedNormals(geo, o.crease || CREASE);
    if (o.axis === 'x') geo.rotateZ(-PI / 2); else if (o.axis === 'z') geo.rotateX(PI / 2);
    return geo;
  };

  /* ---------- patch : panneau de coque découpé dans un profil ----------
     o.tab : profil ; o.closed : anneau complet, sinon secteur a0 → a1 (degrés nominaux)
     o.y0 / o.y1 : bornes (nombre ou fonction de l'angle nominal) ; o.nv : rangées ; o.vmap : répartition
     o.off : décalage normal ; o.c : chanfrein du bord ; o.t : profondeur de la paroi
     o.capB / o.capT : fermer (anneau complet) ; o.axis : 'y' | 'x' (y→+X, x→-Y) | 'z' (y→+Z, z→-Y) */
  function patch(key, o) {
    if (GC[key]) return GC[key];
    const tab = o.tab, L = tab.lay, N = L.N, closed = !!o.closed;
    const off = o.off || 0, c = o.c == null ? 0.4 : o.c, t = o.t == null ? 1.0 : o.t, nv = o.nv || 6, vm = o.vmap || (v => v);
    const rc = new Map();
    const RG = (y, of) => { const k = Math.round(y * 1000) + ':' + Math.round(of * 1000); let r = rc.get(k); if (!r) rc.set(k, r = ring(dims(tab, y), of, L)); return r; };
    const at = (s, y, of) => { const p = ringAt(RG(y, of), s); return [p[0], y, p[1]]; };
    const s0 = closed ? 0 : a2s(L, o.a0), s1 = closed ? N : a2s(L, o.a1);
    const Y0 = s => fv(o.y0, s2a(L, s)), Y1 = s => fv(o.y1, s2a(L, s));
    const yAt = (s, v) => lerp(Y0(s), Y1(s), vm(v));
    const sm = (s0 + s1) / 2;
    let dv = 0, ds0 = 0, ds1 = 0;
    if (c > 0) {
      let Lv = 0, p = at(sm, Y0(sm), off);
      for (let i = 1; i <= 16; i++) { const q = at(sm, yAt(sm, i / 16), off); Lv += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); p = q; }
      dv = Math.min(0.3, c / Math.max(0.01, Lv));
      if (!closed) {
        const ym = yAt(sm, 0.5), r = RG(ym, off);
        const sl = s => { const a = ringAt(r, s), b = ringAt(r, s + 0.02); return Math.hypot(a[0] - b[0], a[1] - b[1]) / 0.02; };
        ds0 = Math.min((s1 - s0) * 0.3, c / Math.max(0.01, sl(s0)));
        ds1 = Math.min((s1 - s0) * 0.3, c / Math.max(0.01, sl(s1 - 0.02)));
      }
    }
    const us = [], ub = [];
    if (closed) for (let i = 0; i < N; i++) { us.push(i); ub.push(i); }
    else {
      const a = s0 + ds0, b = s1 - ds1;
      us.push(a); ub.push(s0);
      for (let i = Math.floor(a) + 1; i < b; i++) if (i - a > 0.12 && b - i > 0.12) { us.push(i); ub.push(i); }
      us.push(b); ub.push(s1);
    }
    const nu = us.length, vs = [], vb = [];
    for (let j = 0; j <= nv; j++) { const v = j / nv; vs.push(dv + (1 - 2 * dv) * v); vb.push(v); }
    const rows = vs.map(v => us.map(s => at(s, yAt(s, v), off)));
    const geos = [grid(rows, closed)];
    const oc = c > 0 ? off - c : off, ow = off - t;
    const loops = [];
    if (closed) {
      loops.push([rows[0], us.map(s => at(s, Y0(s), oc)), us.map(s => at(s, Y0(s), ow))]);
      loops.push([rows[nv].slice().reverse(), us.map(s => at(s, Y1(s), oc)).reverse(), us.map(s => at(s, Y1(s), ow)).reverse()]);
    } else {
      const A = [], B = [], W = [];
      const push = (pa, s, y) => { A.push(pa); B.push(at(s, y, oc)); W.push(at(s, y, ow)); };
      for (let i = 0; i < nu; i++) push(rows[0][i], ub[i], Y0(ub[i]));
      for (let j = 1; j <= nv; j++) push(rows[j][nu - 1], s1, yAt(s1, vb[j]));
      for (let i = nu - 2; i >= 0; i--) push(rows[nv][i], ub[i], Y1(ub[i]));
      for (let j = nv - 1; j >= 1; j--) push(rows[j][0], s0, yAt(s0, vb[j]));
      loops.push([A, B, W]);
    }
    for (const [A, B, W] of loops) {
      if (c > 0) geos.push(grid([B, A], true));
      if (t > 0) geos.push(grid([W, c > 0 ? B : A], true));
    }
    if (closed && o.capB) geos.push(fan(us.map(s => at(s, Y0(s), t > 0 ? ow : oc)), true));
    if (closed && o.capT) geos.push(fan(us.map(s => at(s, Y1(s), t > 0 ? ow : oc)), false));
    return (GC[key] = finish(geos, o));
  }
  const loft = (key, tab, y0, y1, nv, o = {}) => patch(key, Object.assign({ tab, closed: true, y0, y1, nv, c: 0, t: 0 }, o));

  // fusion locale de petites géométries : items = [[geo, [x,y,z], [rx,ry,rz] | Matrix4, échelle]]
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();
  function fuse(key, items) {
    if (GC[key]) return GC[key];
    const list = items.map(([geo, p, r, s]) => {
      const gg = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const n of Object.keys(gg.attributes)) if (n !== 'position' && n !== 'normal') gg.deleteAttribute(n);
      if (!gg.attributes.normal) gg.computeVertexNormals();
      if (r && r.isMatrix4) _m.copy(r);
      else _m.compose(_v.set(...(p || [0, 0, 0])), _q.setFromEuler(_e.set(...(r || [0, 0, 0]))), Array.isArray(s) ? _s.set(...s) : _s.setScalar(s || 1));
      gg.applyMatrix4(_m); return gg;
    });
    return (GC[key] = BGU.mergeGeometries(list, false));
  }
  const boltRing = (g, n, R, r, h, a0 = 0) => fuse(`figBolts${n},${R},${r},${h},${a0}`, Array.from({ length: n }, (_, i) => { const a = a0 + i / n * 2 * PI; return [g.ccyl(r, h, Math.min(0.12, r * 0.3), 6, 'z'), [Math.cos(a) * R, Math.sin(a) * R, 0]]; }));

  /* ---------- profils (unités design, 1 ≈ 1 cm) ---------- */
  const LT = lay(6, 6, 6, 3), LL = lay(4, 4, 4, 3);
  // buste (origine = bassin) : avant = +X
  const CH = prof(LT, [
    { y: 23.5, xp: 9.4, xn: 8.9, z: 12.2, rp: 4.4, rn: 4.4 },
    { y: 28, xp: 10.8, xn: 9.8, z: 13.8, rp: 5.0, rn: 4.8 },
    { y: 34, xp: 12.0, xn: 10.6, z: 15.3, rp: 5.4, rn: 5.2 },
    { y: 40, xp: 12.8, xn: 11.2, z: 16.2, rp: 5.6, rn: 5.4 },
    { y: 46, xp: 12.9, xn: 11.5, z: 16.7, rp: 5.8, rn: 5.6 },
    { y: 51, xp: 12.0, xn: 11.2, z: 16.4, rp: 5.6, rn: 5.6 },
    { y: 55, xp: 10.2, xn: 10.2, z: 14.8, rp: 5.0, rn: 5.2 },
    { y: 58.4, xp: 7.8, xn: 8.2, z: 11.4, rp: 4.2, rn: 4.4 },
    { y: 61.6, xp: 5.0, xn: 5.4, z: 6.6, rp: 3.2, rn: 3.4 }
  ], { bxp: 0.8, bxn: 0.5, bzp: 0.5, bzn: 0.5 });
  // taille
  const WS = prof(LT, [
    { y: 6.5, x: 9.0, z: 11.4, r: 4.2 },
    { y: 10, x: 8.5, z: 10.7, r: 4.0 },
    { y: 15, xp: 8.2, xn: 8.0, z: 10.2, r: 3.9 },
    { y: 20, xp: 8.6, xn: 8.2, z: 10.6, r: 4.0 },
    { y: 25, xp: 9.6, xn: 8.9, z: 12.0, r: 4.4 },
    { y: 29, xp: 10.6, xn: 9.6, z: 13.4, r: 4.8 }
  ], { b: 0.3 });
  // bassin
  const PV = prof(LT, [
    { y: -13.5, xp: 3.6, xn: 4.0, z: 4.4, r: 2.2 },
    { y: -11.2, xp: 6.6, xn: 7.0, z: 7.8, r: 3.4 },
    { y: -7, xp: 8.9, xn: 9.1, z: 11.4, r: 4.4 },
    { y: -2, x: 9.9, z: 12.7, r: 5.0 },
    { y: 3, x: 10.0, z: 12.8, r: 5.0 },
    { y: 7.5, xp: 9.3, xn: 9.5, z: 11.8, r: 4.6 },
    { y: 10, xp: 8.9, xn: 9.1, z: 11.3, r: 4.4 }
  ], { b: 0.4 });
  // tête (centre = origine, visage vers +X)
  const HEAD = (() => {
    const yT = 12.2, yB = -10.6, yc = 2.6, list = [], NS = 40;
    const se = (t, n) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(t)), n)), 1 / n);
    for (let i = 0; i <= NS; i++) {
      const y = yB + (yT - yB) * (1 - Math.cos(i / NS * PI)) / 2;
      const k = y >= yc ? se((y - yc) / (yT - yc), 2.5) : se((yc - y) / (yc - yB), 3.6);
      const lw = clamp((-1 - y) / 9, 0, 1);
      list.push({ y, xp: Math.max(0.06, 9.7 * k * (1 - 0.1 * lw)), xn: Math.max(0.06, 10.3 * k * (1 - 0.22 * lw)),
        z: Math.max(0.06, 8.5 * k * (1 - 0.16 * lw)), rp: 4.4 * k + 0.2, rn: 6.8 * k + 0.2,
        bxp: 0.5 * k, bxn: 1.0 * k, bzp: 0.5 * k, bzn: 0.5 * k });
    }
    return prof(lay(6, 6, 6, 3), list);
  })();
  // membres : origine = articulation proximale, +Y vers l'extrémité ; AVANT = -X (xn), extérieur = +Z (zp)
  const UA = prof(LL, [
    { y: -1, xp: 5.4, xn: 5.4, zp: 5.6, zn: 5.4, r: 3.6 },
    { y: 4, xp: 6.0, xn: 5.9, zp: 6.2, zn: 5.8, r: 3.8 },
    { y: 10, xp: 6.1, xn: 6.3, zp: 6.3, zn: 5.8, r: 3.9 },
    { y: 17, xp: 5.8, xn: 6.2, zp: 6.0, zn: 5.5, r: 3.8 },
    { y: 24, xp: 5.2, xn: 5.5, zp: 5.4, zn: 5.0, r: 3.4 },
    { y: 30, xp: 4.7, xn: 4.8, zp: 4.8, zn: 4.5, r: 3.0 },
    { y: 34, xp: 4.4, xn: 4.4, zp: 4.5, zn: 4.2, r: 2.8 }
  ], { b: 0.3 });
  const FA = prof(LL, [
    { y: -1, xp: 4.6, xn: 4.6, zp: 4.8, zn: 4.6, r: 3.0 },
    { y: 4, xp: 5.4, xn: 5.4, zp: 5.5, zn: 5.1, r: 3.4 },
    { y: 10, xp: 5.5, xn: 5.6, zp: 5.5, zn: 5.0, r: 3.5 },
    { y: 18, xp: 4.7, xn: 4.9, zp: 4.7, zn: 4.3, r: 3.1 },
    { y: 25, xp: 3.8, xn: 4.0, zp: 3.9, zn: 3.6, r: 2.6 },
    { y: 29, xp: 3.4, xn: 3.5, zp: 3.4, zn: 3.2, r: 2.3 },
    { y: 32, xp: 3.2, xn: 3.3, zp: 3.2, zn: 3.0, r: 2.2 }
  ], { b: 0.25 });
  const TH = prof(LL, [
    { y: -2, xp: 7.4, xn: 7.8, zp: 8.4, zn: 6.8, r: 4.5 },
    { y: 4, xp: 8.4, xn: 9.0, zp: 9.0, zn: 7.4, r: 5.0 },
    { y: 12, xp: 8.2, xn: 9.4, zp: 8.8, zn: 7.3, r: 5.0 },
    { y: 22, xp: 7.4, xn: 8.8, zp: 8.0, zn: 6.7, r: 4.6 },
    { y: 32, xp: 6.4, xn: 7.6, zp: 6.9, zn: 5.9, r: 4.0 },
    { y: 39, xp: 5.8, xn: 6.4, zp: 6.1, zn: 5.3, r: 3.6 },
    { y: 44, xp: 5.4, xn: 5.6, zp: 5.6, zn: 4.9, r: 3.3 }
  ], { b: 0.5 });
  const SHN = prof(LL, [
    { y: -2, xp: 5.8, xn: 5.4, zp: 5.8, zn: 5.3, r: 3.6 },
    { y: 5, xp: 7.2, xn: 5.8, zp: 6.1, zn: 5.6, r: 3.8 },
    { y: 13, xp: 7.6, xn: 5.7, zp: 6.0, zn: 5.4, r: 3.8 },
    { y: 22, xp: 6.6, xn: 5.2, zp: 5.4, zn: 4.9, r: 3.4 },
    { y: 31, xp: 5.0, xn: 4.6, zp: 4.6, zn: 4.2, r: 3.0 },
    { y: 38, xp: 4.0, xn: 4.0, zp: 4.0, zn: 3.7, r: 2.6 },
    { y: 45, xp: 3.5, xn: 3.5, zp: 3.6, zn: 3.3, r: 2.4 }
  ], { b: 0.4 });
  // épaulière : profil le long de +Z (axis 'z') ; z du profil = -Y (zp = vers le bas, zn = vers le haut)
  const CAP = prof(LL, [
    { y: -4.6, xp: 6.4, xn: 6.6, zp: 5.0, zn: 6.6, r: 4.2 },
    { y: 1.5, xp: 7.4, xn: 7.6, zp: 5.8, zn: 7.4, r: 4.8 },
    { y: 5.4, xp: 7.1, xn: 7.3, zp: 5.6, zn: 7.1, r: 4.6 },
    { y: 7.6, xp: 5.8, xn: 6.0, zp: 4.4, zn: 5.8, r: 3.8 },
    { y: 8.6, xp: 3.6, xn: 3.8, zp: 2.6, zn: 3.6, r: 2.4 }
  ], { b: 0.4 });
  // pied : profil le long de +X (axis 'x') ; x du profil = -Y du pied (xp = vers le bas, xn = vers le haut)
  const footTab = (rows, rp, rn, b) => prof(LL, rows.map(([x, yb, yt, w]) => ({ y: x, x0: -(yb + yt) / 2, x: (yt - yb) / 2, z: w, rp, rn })), { b });
  const FT = footTab([
    [-8.2, -5.4, -1.8, 3.0], [-7.4, -5.6, 0.6, 4.3], [-4.5, -5.6, 2.0, 4.7], [0, -5.6, 2.3, 4.8], [3.5, -5.6, 1.0, 4.9],
    [7.5, -5.6, -1.4, 5.0], [11.5, -5.6, -2.8, 4.9], [15, -5.6, -3.6, 4.4], [17.4, -5.6, -4.2, 3.4], [18.4, -5.5, -4.8, 1.8]
  ], 0.8, 2.6, 0.3);
  const SOLE = footTab([
    [-8.4, -7.2, -5.4, 3.2], [-7.6, -7.2, -5.4, 4.5], [-4.5, -7.2, -5.4, 4.9], [0, -7.2, -5.4, 5.0], [3.5, -7.2, -5.4, 5.1],
    [7.5, -7.2, -5.4, 5.2], [11.5, -7.2, -5.4, 5.1], [15, -7.2, -5.4, 4.6], [17.6, -7.2, -5.4, 3.6], [18.8, -7.0, -5.4, 1.9]
  ], 0.5, 0.5, 0);

  /* ---------- lettrage F.02 (barres : [cx, cy, largeur, hauteur]) ---------- */
  const GLYPHS = {
    F: { w: 1.2, s: [[-0.4, 0, 0.24, 1.6], [0.08, 0.68, 0.96, 0.24], [-0.02, 0.04, 0.76, 0.24]] },
    '.': { w: 0.6, s: [[0, -0.68, 0.26, 0.24]] },
    0: { w: 1.3, s: [[-0.4, 0, 0.24, 1.6], [0.4, 0, 0.24, 1.6], [0, 0.68, 1.04, 0.24], [0, -0.68, 1.04, 0.24]] },
    2: { w: 1.3, s: [[0, 0.68, 1.04, 0.24], [0.4, 0.34, 0.24, 0.68], [0, 0, 1.04, 0.24], [-0.4, -0.34, 0.24, 0.68], [0, -0.68, 1.04, 0.24]] }
  };

  return function (ctx) {
    const { g, M, L, ch } = ctx;
    const low = ctx.lod === 'low';
    const P = {};
    let nMesh = 0;
    const add = (parent, geo, mat, p, r, s) => { nMesh++; return ctx.add(parent, geo, mat, { p, r, s }); };

    /* ---------- matériaux ---------- */
    const SH = ctx.mat({ color: 0x25272c, roughness: 0.4, metalness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.14, envMapIntensity: 0.95 }); // coque anthracite vernie
    const MT = ctx.mat({ color: 0x131417, roughness: 0.62, metalness: 0.1, clearcoat: 0.3, clearcoatRoughness: 0.45, envMapIntensity: 0.6 }); // noir mat
    const GL = M.black;                                   // noir laqué
    const GM = ctx.mat({ color: ch.joint, roughness: 0.3, metalness: 0.88, envMapIntensity: 1.0 }); // gunmetal
    const SE = M.seam, ST = M.steel, RU = M.rubber, VI = M.visor;
    const TX = ctx.mat({ color: 0x9aa1ab, roughness: 0.3, metalness: 0.75, envMapIntensity: 0.9 }); // marquage argent
    const LED = ctx.glow(ch.accent, 2.8);

    // pièce latérale : le côté 'b' est un miroir en Z ; ly = facteur de longueur (os réel / os de conception)
    const sidePart = (sd, build, ly = 1) => { const part = ctx.group(), inner = ctx.group(); inner.scale.set(1, ly, sd < 0 ? -1 : 1); part.add(inner); build(inner); return part; };
    const YV = new T.Vector3(0, 1, 0);
    const rod = (parent, a, b, r, mat, seg = 10) => {
      const va = new T.Vector3(...a), vb = new T.Vector3(...b), d = vb.clone().sub(va), l = d.length();
      const m = add(parent, g.cyl(r, r, l, seg), mat, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
      m.quaternion.setFromUnitVectors(YV, d.normalize()); return m;
    };
    // élément posé sur la surface d'un profil (axe Y du géo = normale sortante)
    const onSurf = (parent, tab, a, y, geo, mat, lift = 0) => {
      const p0 = SP(tab, a, y), p1 = SP(tab, a + 0.5, y), p2 = SP(tab, a, y + 0.05);
      const tu = new T.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), tv = new T.Vector3(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
      const n = tv.cross(tu).normalize();
      const m = add(parent, geo, mat, [p0[0] + n.x * lift, p0[1] + n.y * lift, p0[2] + n.z * lift]);
      m.quaternion.setFromUnitVectors(YV, n); return m;
    };

    /* =====================================================
       LOD bas (images rémanentes) : même silhouette, très peu de triangles
       ===================================================== */
    if (low) {
      const torso = ctx.group();
      add(torso, loft('figLoCH', CH, 23.5, 61.6, 4, { capB: true, capT: true }), SH);
      add(torso, loft('figLoWS', WS, 6.5, 29, 2), SH);
      add(torso, loft('figLoPV', PV, -13.5, 10, 3, { capB: true }), SH);
      for (const z of [1, -1]) add(torso, g.ccyl(6.0, 5.0, 0.8, 10, 'z'), SH, [0, 51.6, z * 15.6]);
      P.torso = torso;
      P.neck = ctx.group(ctx.mesh(g.cyl(3.6, 3.9, 16, 8), SH, { p: [0, 8, 0] }));
      P.head = ctx.group(ctx.mesh(loft('figLoHD', HEAD, -9.8, 12.2, 8, { capB: true, capT: true }), SH));
      for (const [sd, z] of [['f', 1], ['b', -1]]) {
        P[sd + 'ua'] = sidePart(z, gr => add(gr, loft('figLoUA', UA, -1, 33, 3), SH));
        P[sd + 'fa'] = sidePart(z, gr => add(gr, loft('figLoFA', FA, -1, 31.5, 3), SH));
        P[sd + 'th'] = sidePart(z, gr => add(gr, loft('figLoTH', TH, -2, 44, 3), SH), L.th / 44);
        P[sd + 'sh'] = sidePart(z, gr => add(gr, loft('figLoSH', SHN, -2, 45, 3), SH), L.sh / 44);
        P[sd + 'kn'] = ctx.group(ctx.mesh(g.cyl(5, 5, 12.4, 10, 'z'), SH));
        P[sd + 'el'] = ctx.group(ctx.mesh(g.cyl(4.5, 4.5, 10.4, 10, 'z'), SH));
        P[sd + 'hi'] = ctx.group(ctx.mesh(g.cyl(6, 6, 6, 10, 'z'), SH, { p: [0, 0, z * 8] }));
        P[sd + 'sc'] = sidePart(z, gr => add(gr, loft('figLoCAP', CAP, -4.6, 8.6, 2, { capT: true, axis: 'z' }), SH, [0, 0.6, 0]));
        P[sd + 'fo'] = sidePart(z, gr => add(gr, loft('figLoFT', FT, -8.2, 18.4, 4, { capB: true, capT: true, axis: 'x' }), SH, [0, -1.6, 0]));
        P[sd + 'ha'] = RK.hand(ctx, { side: z, palm: [7.6, 3.0, 7.2], palmMat: SH, fingerMat: SH });
      }
      return { parts: P, shZ: 19.5, hpZ: 9.5 };
    }

    /* =====================================================
       TORSE : bassin, taille, buste, épaules
       ===================================================== */
    const torso = ctx.group();
    {
      // --- bassin : noyau mécanique gunmetal, écusson avant + plaque arrière ---
      add(torso, loft('figPVcore', PV, -13.5, 10, 8, { off: -0.7, capB: true }), GM);
      const PVF = a => -12.4 + 8.5 * Math.pow(Math.min(1, Math.abs(na(a)) / 58), 1.7);
      add(torso, patch('figPVfront', { tab: PV, a0: -58, a1: 58, y0: PVF, y1: 6.0, nv: 8, c: 0.45, t: 1.2 }), SH);
      const PVB = a => -9.6 + 5.5 * Math.pow(Math.min(1, (180 - Math.abs(na(a))) / 60), 1.7);
      add(torso, patch('figPVback', { tab: PV, a0: 120, a1: 240, y0: PVB, y1: 6.0, nv: 7, c: 0.45, t: 1.2 }), SH);
      // ceinture
      add(torso, patch('figBelt', { tab: WS, closed: true, y0: 6.6, y1: 9.4, nv: 2, off: 0.2, c: 0.35, t: 0.9 }), GM);
      // --- abdomen segmenté ---
      add(torso, loft('figWScore', WS, 6.5, 29, 6, { off: -1.3 }), SE);
      [[10.0, 13.9], [14.5, 18.4], [19.0, 23.0]].forEach(([a, b], i) => add(torso, patch('figWSband' + i, { tab: WS, closed: true, y0: a, y1: b, nv: 3, c: 0.5, t: 1.5 }), MT));
      add(torso, g.cbox(3.4, 19, 5.2, 0.8), GM, [-8.0, 17, 0]);           // colonne (dos)

      // --- buste ---
      const YOKE = a => 55.0 + 2.4 * (1 - Math.cos(a * D)) / 2;
      const PEC = a => 36.8 + 6.2 * Math.pow(Math.min(1, Math.abs(na(a)) / 66), 1.4);
      const RIB = a => 25.4 + 2.6 * Math.pow(Math.min(1, Math.abs(na(a)) / 70), 1.2);
      add(torso, loft('figCHcore', CH, 23.5, 61.6, 10, { off: -0.9, capB: true, capT: true }), SE);
      add(torso, patch('figYoke', { tab: CH, closed: true, y0: YOKE, y1: 61.6, nv: 5, c: 0.4, t: 1.0, capT: true }), MT);
      add(torso, patch('figPec', { tab: CH, a0: -67, a1: 67, y0: PEC, y1: a => YOKE(a) - 0.6, nv: 8, c: 0.5, t: 1.4 }), SH);
      add(torso, patch('figRibR', { tab: CH, a0: 1.0, a1: 69, y0: RIB, y1: a => PEC(a) - 0.65, nv: 6, c: 0.5, t: 1.4 }), SH);
      add(torso, patch('figRibL', { tab: CH, a0: -69, a1: -1.0, y0: RIB, y1: a => PEC(a) - 0.65, nv: 6, c: 0.5, t: 1.4 }), SH);
      add(torso, patch('figSideR', { tab: CH, a0: 71, a1: 113, y0: 27.4, y1: a => YOKE(a) - 0.6, nv: 8, c: 0.45, t: 1.2 }), MT);
      add(torso, patch('figSideL', { tab: CH, a0: -113, a1: -71, y0: 27.4, y1: a => YOKE(a) - 0.6, nv: 8, c: 0.45, t: 1.2 }), MT);
      add(torso, patch('figBack', { tab: CH, a0: 116, a1: 244, y0: 26.6, y1: a => YOKE(a) - 0.6, nv: 8, c: 0.5, t: 1.4 }), SH);
      // batterie intégrée (dos) + ouïes
      add(torso, patch('figBatt', { tab: CH, a0: 146, a1: 214, y0: 31, y1: 50.5, nv: 6, off: 1.1, c: 0.6, t: 2.4 }), GL);
      const vents = [];
      for (let i = 0; i < 5; i++) { const y = 34 + i * 2.6, p = SP(CH, 180, y, 1.1); vents.push([g.cbox(0.9, 0.8, 9, 0.2), [p[0] + 0.1, y, 0]]); }
      add(torso, fuse('figVents', vents), SE);

      // --- structure d'épaule ---
      for (const z of [1, -1]) {
        add(torso, g.ccyl(6.0, 5.0, 0.8, 24, 'z'), GM, [0, 51.6, z * 15.6]);
        add(torso, g.cbox(9.5, 4.2, 7.5, 1.3), MT, [-0.6, 57.0, z * 13.2], [z * 0.3, 0, 0]);
      }
      add(torso, g.ccyl(6.0, 1.8, 0.5, 24), GM, [0, 61.6, 0]);

      // --- marquage « F.02 » sur le plastron (côté caméra) ---
      {
        const word = 'F.02', yL = 50.6, hgt = 1.9, sc = hgt / 1.6;
        let width = 0; for (const c of word) width += GLYPHS[c].w * sc;
        const zc = 6.6, strokes = [];
        let zcur = zc + width / 2;                         // le texte se lit vers -Z (vu de face)
        const s0 = a2s(CH.lay, -60), s1 = a2s(CH.lay, 60);
        const ptAt = s => { const p = ringAt(ring(dims(CH, yL), 0, CH.lay), s); return p; };
        for (const c of word) {
          const gl = GLYPHS[c], zt = zcur - gl.w * sc / 2; zcur -= gl.w * sc;
          let lo = s0, hi = s1;
          for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (ptAt(m)[1] < zt) lo = m; else hi = m; }
          const s = (lo + hi) / 2, p0 = ptAt(s), p1 = ptAt(s + 0.01);
          const tx = p1[0] - p0[0], tz = p1[1] - p0[1], tl = Math.hypot(tx, tz);
          const nrm = new T.Vector3(tz / tl, 0, -tx / tl), right = new T.Vector3(-tx / tl, 0, -tz / tl), up = new T.Vector3(0, 1, 0);
          const Mb = new T.Matrix4().makeBasis(right, up, nrm).setPosition(p0[0] + nrm.x * 0.02, yL, p0[1] + nrm.z * 0.02);
          for (const st of gl.s) strokes.push([g.box(st[2] * sc, st[3] * sc, 0.25), null, Mb.clone().multiply(new T.Matrix4().makeTranslation(st[0] * sc, st[1] * sc, 0))]);
        }
        add(torso, fuse('figF02', strokes), TX);
      }
    }
    P.torso = torso;

    /* =====================================================
       COU
       ===================================================== */
    {
      const n = ctx.group();
      add(n, g.ccyl(2.9, 16, 0.5, 16), GM, [0, 8, 0]);
      add(n, fuse('figNeckRings', [0, 1, 2, 3].map(i => [g.ccyl(3.9, 2.0, 0.6, 20), [0, 2.6 + i * 2.7, 0]])), MT);
      for (const z of [1, -1]) rod(n, [2.9, 1.0, z * 1.8], [2.4, 13.2, z * 1.5], 0.45, ST, 8);
      add(n, g.ccyl(2.4, 7.6, 0.5, 16, 'z'), GM, [0, 14.4, 0]);
      P.neck = n;
    }

    /* =====================================================
       TÊTE : casque noir, écran facial, barre lumineuse, caméras latérales
       ===================================================== */
    {
      const h = ctx.group();
      const SEAMH = a => 5.4 + 2.8 * Math.cos(a * D);
      add(h, loft('figHDcore', HEAD, -10.6, 12.2, 12, { off: -0.5, capB: true, capT: true }), SE);
      add(h, patch('figHDtop', { tab: HEAD, closed: true, y0: SEAMH, y1: 12.2, nv: 12, c: 0.35, t: 0.9, capT: true, vmap: v => Math.sin(v * PI / 2) }), SH);
      add(h, patch('figHDlow', { tab: HEAD, closed: true, y0: -9.8, y1: a => SEAMH(a) - 0.55, nv: 12, c: 0.4, t: 0.9, capB: true }), SH);
      const rnd = a => Math.pow(Math.max(0, (Math.abs(na(a)) - 26) / 14), 2);
      const SCR_T = a => 6.0 - 2.0 * rnd(a), SCR_B = a => -7.2 + 2.0 * rnd(a);
      add(h, patch('figHDframe', { tab: HEAD, a0: -44, a1: 44, y0: a => SCR_B(a * 40 / 44) - 0.9, y1: a => SCR_T(a * 40 / 44) + 0.9, nv: 10, off: 0.18, c: 0.3, t: 0.8 }), MT);
      add(h, patch('figHDscreen', { tab: HEAD, a0: -40, a1: 40, y0: SCR_B, y1: SCR_T, nv: 10, off: 0.42, c: 0.3, t: 0.8 }), VI);
      add(h, patch('figHDled', { tab: HEAD, a0: -22, a1: 22, y0: 0.55, y1: 1.15, nv: 1, off: 0.6, c: 0, t: 0.25 }), LED);
      for (const z of [1, -1]) {
        const a = z * 74, y = 1.0;
        onSurf(h, HEAD, a, y, g.ccyl(2.0, 1.0, 0.3, 20), GM, 0.2);
        onSurf(h, HEAD, a, y, g.ccyl(1.3, 0.8, 0.25, 20), VI, 0.75);
        onSurf(h, HEAD, a, y, g.torus(1.45, 0.16, 20, 6, PI * 2, 'y'), ST, 0.75);
      }
      add(h, patch('figHDback', { tab: HEAD, a0: 150, a1: 210, y0: -5.5, y1: 2.5, nv: 4, off: 0.25, c: 0.3, t: 0.8 }), MT);
      add(h, g.ccyl(4.6, 1.6, 0.5, 20), GM, [0, -10.0, 0]);
      P.head = h;
    }

    /* =====================================================
       BRAS
       ===================================================== */
    for (const [sd, z] of [['f', 1], ['b', -1]]) {
      // épaulière
      P[sd + 'sc'] = sidePart(z, gr => {
        add(gr, patch('figCAPin', { tab: CAP, closed: true, y0: -4.6, y1: 1.2, nv: 3, c: 0.4, t: 1.0, axis: 'z' }), MT, [0, 0.6, 0]);
        add(gr, patch('figCAPout', { tab: CAP, closed: true, y0: 1.8, y1: 8.6, nv: 6, c: 0.4, t: 1.0, capT: true, axis: 'z' }), SH, [0, 0.6, 0]);
        add(gr, g.ccyl(3.0, 0.8, 0.3, 24, 'z'), GM, [0, 0.6, 8.7]);
      });
      // bras
      P[sd + 'ua'] = sidePart(z, gr => {
        add(gr, loft('figUAcore', UA, -1, 33, 6, { off: -0.8 }), GM);
        add(gr, patch('figUAcol', { tab: UA, closed: true, y0: 0.4, y1: 5.6, nv: 2, c: 0.35, t: 0.9 }), MT);
        add(gr, patch('figUAup', { tab: UA, closed: true, y0: 6.2, y1: 18.6, nv: 5, c: 0.45, t: 1.2 }), SH);
        add(gr, patch('figUAfr', { tab: UA, a0: 96, a1: 264, y0: 19.2, y1: 28.6, nv: 4, c: 0.45, t: 1.2 }), SH);
        add(gr, patch('figUAbk', { tab: UA, a0: -80, a1: 91, y0: 19.2, y1: 28.6, nv: 4, c: 0.45, t: 1.2 }), MT);
        add(gr, patch('figUAins', { tab: UA, a0: 66, a1: 112, y0: 9.4, y1: 15.6, nv: 3, off: 0.35, c: 0.3, t: 0.8 }), MT);
      });
      // coude
      P[sd + 'el'] = sidePart(z, gr => {
        add(gr, g.ccyl(4.5, 10.6, 0.7, 24, 'z'), GM);
        add(gr, g.ccyl(3.3, 1.0, 0.35, 24, 'z'), SH, [0, 0, 5.6]);
        add(gr, boltRing(g, 5, 2.4, 0.32, 0.5), ST, [0, 0, 6.05]);
        add(gr, g.ccyl(3.3, 1.0, 0.35, 24, 'z'), MT, [0, 0, -5.6]);
        add(gr, g.prism([[1.8, -3.6], [4.6, -2.0], [5.0, 1.0], [3.6, 3.4], [1.6, 3.0]], 7.6, 0.5), SH);
      });
      // avant-bras
      P[sd + 'fa'] = sidePart(z, gr => {
        add(gr, loft('figFAcore', FA, -1, 31.5, 6, { off: -0.7 }), GM);
        add(gr, patch('figFAtop', { tab: FA, a0: -40, a1: 140, y0: 3.6, y1: 25.4, nv: 7, c: 0.45, t: 1.2 }), SH);
        add(gr, patch('figFAbot', { tab: FA, a0: 144, a1: 316, y0: 3.6, y1: 25.4, nv: 7, c: 0.45, t: 1.2 }), SH);
        add(gr, patch('figFAven', { tab: FA, a0: 160, a1: 220, y0: 7.0, y1: 20.5, nv: 5, off: 0.3, c: 0.3, t: 0.8 }), MT);
        add(gr, patch('figFAwr', { tab: FA, closed: true, y0: 26.0, y1: 30.6, nv: 2, c: 0.3, t: 0.8 }), MT);
      });
      P[sd + 'ha'] = figHand(z);
    }

    /* =====================================================
       JAMBES
       ===================================================== */
    for (const [sd, z] of [['f', 1], ['b', -1]]) {
      P[sd + 'hi'] = sidePart(z, gr => {
        add(gr, g.ccyl(6.2, 4.6, 0.8, 24, 'z'), GM, [0, 0, 8.2]);
        add(gr, g.ccyl(4.4, 1.0, 0.35, 24, 'z'), SH, [0, 0, 10.8]);
        add(gr, boltRing(g, 6, 3.4, 0.36, 0.5), ST, [0, 0, 11.3]);
      });
      P[sd + 'th'] = sidePart(z, gr => {
        add(gr, loft('figTHcore', TH, -2, 44, 8, { off: -0.9 }), GM);
        add(gr, patch('figTHtop', { tab: TH, closed: true, y0: -0.5, y1: 4.0, nv: 2, c: 0.35, t: 0.9 }), MT);
        add(gr, patch('figTHfr', { tab: TH, a0: 128, a1: 262, y0: 4.6, y1: 38.8, nv: 8, c: 0.5, t: 1.3 }), SH);
        add(gr, patch('figTHout', { tab: TH, a0: 54, a1: 124, y0: 4.6, y1: 37.0, nv: 8, c: 0.5, t: 1.3 }), SH);
        add(gr, patch('figTHbk', { tab: TH, a0: -94, a1: 50, y0: 4.6, y1: 36.0, nv: 8, c: 0.5, t: 1.3 }), MT);
        add(gr, patch('figTHvent', { tab: TH, a0: 70, a1: 108, y0: 12, y1: 24, nv: 3, off: 0.3, c: 0.3, t: 0.8 }), MT);
        add(gr, patch('figTHknee', { tab: TH, closed: true, y0: 39.4, y1: 43.0, nv: 2, c: 0.35, t: 0.9 }), GM);
      }, L.th / 44);
      P[sd + 'kn'] = sidePart(z, gr => {
        add(gr, g.ccyl(5.0, 12.6, 0.7, 24, 'z'), GM);
        add(gr, g.ccyl(3.6, 1.0, 0.35, 24, 'z'), SH, [0, 0, 6.6]);
        add(gr, boltRing(g, 6, 2.6, 0.3, 0.5), ST, [0, 0, 7.1]);
        add(gr, g.ccyl(3.6, 1.0, 0.35, 24, 'z'), MT, [0, 0, -6.6]);
        add(gr, g.prism([[-4.6, -4.4], [-6.4, -2.4], [-6.9, 1.6], [-5.6, 4.8], [-3.8, 5.6], [-3.8, -3.6]], 8.6, 0.6), SH);
      });
      P[sd + 'sh'] = sidePart(z, gr => {
        add(gr, loft('figSHcore', SHN, -2, 45, 8, { off: -0.8 }), GM);
        add(gr, patch('figSHtop', { tab: SHN, closed: true, y0: 0.6, y1: 4.2, nv: 2, c: 0.35, t: 0.9 }), MT);
        add(gr, patch('figSHfr', { tab: SHN, a0: 118, a1: 242, y0: 4.8, y1: 38.0, nv: 8, c: 0.5, t: 1.3 }), SH);
        add(gr, patch('figSHcalf', { tab: SHN, a0: -112, a1: 113, y0: 4.8, y1: 30.5, nv: 8, c: 0.5, t: 1.3 }), SH);
        add(gr, patch('figSHpan', { tab: SHN, a0: 62, a1: 100, y0: 8.5, y1: 22, nv: 4, off: 0.3, c: 0.3, t: 0.8 }), MT);
        add(gr, patch('figSHank', { tab: SHN, closed: true, y0: 38.6, y1: 43.6, nv: 2, c: 0.35, t: 0.9 }), GM);
        for (const zz of [1, -1]) {
          rod(gr, [5.2, 31, zz * 2.0], [4.0, 41.5, zz * 1.8], 0.55, ST, 8);
          add(gr, g.ccyl(1.1, 2.4, 0.3, 12), GM, [5.2, 31.2, zz * 2.0]);
        }
      }, L.sh / 44);
      P[sd + 'fo'] = sidePart(z, gr => {
        add(gr, loft('figSOLE', SOLE, -8.4, 18.8, 10, { capB: true, capT: true, axis: 'x' }), RU);
        add(gr, loft('figFTup', FT, -8.2, 18.4, 14, { capB: true, capT: true, axis: 'x' }), SH);
        add(gr, patch('figFTtoe', { tab: FT, a0: 104, a1: 256, y0: 10.6, y1: 18.4, nv: 4, off: 0.25, c: 0.3, t: 0.8, axis: 'x' }), GL);
        add(gr, g.ccyl(3.3, 8.8, 0.5, 20, 'z'), GM);
        for (const zz of [1, -1]) add(gr, g.prism([[-4, -3.6], [4.5, -3.6], [3, 1.5], [1.5, 3], [-1.5, 3], [-3.5, 1]], 1.4, 0.4), SH, [0, 0, zz * 4.6]);
        add(gr, g.cbox(2.2, 3.2, 7.4, 0.5), GM, [-7.6, -3.2, 0]);
      });
    }

    /* =====================================================
       MAIN (contrat de RK.hand : origine = poignet, +X = doigts, paume -Y, userData.setCurl)
       ===================================================== */
    function figHand(side) {
      const root = ctx.group(), inner = ctx.group();
      if (side < 0) inner.scale.z = -1;
      root.add(inner);
      const PL = 7.6, PT = 3.0, FW = 1.45, FL = [3.4, 2.4, 2.0], FTH = [2.1, 1.9, 1.7];
      add(inner, g.ccyl(2.4, 2.8, 0.5, 16, 'x'), GM, [1.2, 0, 0]);
      const palm = g.shape('figurePalm', s => {
        s.moveTo(2.2, -3.0); s.lineTo(2.2 + PL - 0.8, -3.7); s.lineTo(2.2 + PL, -3.2); s.lineTo(2.2 + PL, 3.2); s.lineTo(2.2 + PL - 0.8, 3.7); s.lineTo(2.2, 3.0); s.lineTo(2.2, -3.0);
      }, PT, 0.5, 1);
      add(inner, palm, MT, [0, 0, 0], [PI / 2, 0, 0]);
      add(inner, palm, SH, [0.4, 1.1, 0], [PI / 2, 0, 0], [0.9, 0.86, 0.4]);
      add(inner, g.cbox(PL - 2.0, 0.6, 5.8, 0.25), RU, [3.4 + (PL - 2.0) / 2, -1.5, 0]);
      add(inner, fuse('figKnuck', [0, 1, 2, 3].map(i => [g.ccyl(0.95, 1.25, 0.2, 10, 'z'), [2.2 + PL, 0.2, ((i + 0.5) / 4 - 0.5) * 6.6]])), GM);
      const phal = (Lx, t, w, tip) => fuse(`figPhal${Lx},${t},${w},${tip}`, [
        [g.cbox(Lx, t, w, 0.35), [Lx / 2, 0, 0]],
        [g.cyl(t * 0.5, t * 0.5, w * 0.92, 10, 'z'), [0, 0, 0]],
        ...(tip ? [[g.cyl(t * 0.48, t * 0.48, w * 0.9, 10, 'z'), [Lx - 0.1, -0.05, 0]]] : [])
      ]);
      const fingers = [];
      for (let i = 0; i < 4; i++) {
        const zz = ((i + 0.5) / 4 - 0.5) * 6.6, k = [0.92, 1, 0.97, 0.84][i];
        let parent = inner; const segs = [];
        for (let j = 0; j < 3; j++) {
          const piv = ctx.group(); piv.userData.noMerge = true;
          if (j === 0) piv.position.set(2.2 + PL + 0.6, 0.1, zz); else piv.position.set(FL[j - 1] * k, 0, 0);
          add(piv, phal(+(FL[j] * k).toFixed(2), FTH[j], FW, j === 2), j === 1 ? GM : SH);
          parent.add(piv); parent = piv; segs.push(piv);
        }
        fingers.push(segs);
      }
      // pouce (côté -Z pour la main 'f')
      const t0 = ctx.group(); t0.position.set(3.4, -0.6, -3.2); t0.userData.noMerge = true;
      add(t0, phal(3.6, 2.4, 2.0, false), SH);
      const t1 = ctx.group(); t1.position.set(3.6, 0, 0); t0.add(t1);
      add(t1, phal(2.8, 2.1, 1.8, false), GM);
      const t2 = ctx.group(); t2.position.set(2.8, 0, 0); t1.add(t2);
      add(t2, phal(2.3, 1.9, 1.7, true), SH);
      inner.add(t0);
      root.userData.setCurl = c => {
        for (const segs of fingers) { segs[0].rotation.z = -(6 + 82 * c) * D; segs[1].rotation.z = -(8 + 88 * c) * D; segs[2].rotation.z = -(6 + 64 * c) * D; }
        t0.rotation.set(-(20 + 30 * c) * D, (25 + 20 * c) * D, -(25 + 45 * c) * D);
        t1.rotation.z = -(10 + 35 * c) * D; t2.rotation.z = -(8 + 40 * c) * D;
      };
      root.userData.setCurl(1);
      return root;
    }

    if (typeof window !== 'undefined' && window.__report) window.__report.figureMeshes = nMesh;
    const tick = ctx.override ? undefined : (t, state) => {
      const sup = state && (state.st === 'super' || state.st === 'special');
      LED.emissiveIntensity = LED.userData.baseI * ((sup ? 1.6 : 0.85) + 0.15 * Math.sin(t * 2.2));
    };
    return { parts: P, shZ: 19.5, hpZ: 9.5, tick };
  };
})();
