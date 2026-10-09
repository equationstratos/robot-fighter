'use strict';
/* =========================================================
   Modèle 3D : MENLO RESEARCH ASIMOV v1 (2025-2026, humanoïde open source, CERN-OHL-S-2.0)
   Contrat : voir js/kit.js.
   D'après les photos officielles (livrée orange / noir, plein pied 3/4 + bustes de face).
   Taille : le vrai robot mesure 1,2 m ; la « version combat » mesure 1,85 m (squelette du jeu inchangé,
   tête plus petite en proportion, jambes allongées) — sommet du crâne au même niveau que l'ancien modèle.
   Livrée ORIGINAL : coques ORANGE métallisé satiné (buste, casque, plaques) + pièces graphite / noires
   (membres, taille, bassin, visière noire laquée, pieds). Skin NOIR : coques noir satiné, détails orange.
   Tête : casque « rectangle arrondi » plus haut que large, grande visière noire laquée encadrée par la coque,
   bandeau noir sur le crâne (joints de panneaux), oreillettes latérales + LED orange, petite caméra au menton.
   Buste : plastron sculpté (pectoraux arrondis, joint central, empiècement en V sous le cou), logo « m »
   en relief, 2 anneaux en D sur les épaules, panneau ventral noir en arche, taille étroite, liseré orange,
   bassin noir à panneau ovale.
   Épaules : capsules latérales (actionneur de tangage) à 6 pastilles, carters noirs fixés au buste.
   Bras : cylindre noir (vis, bague orange), chape de coude, flasques et plaques latérales orange,
   poignet = bague orange autour d'un embout noir (le kit n'a pas de mains).
   Jambes : cuisses noires carrées arrondies + bagues orange de hanche, plaques orange perforées de part
   et d'autre du genou, tibias noirs effilés, biellettes orange de cheville, chaussures noires.
   Technique : coques = « patchs » découpés dans des profils à section rectangle arrondi (même boîte à
   outils que figure.js) ; logo extrudé dans un groupe noMerge retourné en Z quand le robot regarde à gauche.
   ========================================================= */
if (typeof RK !== 'undefined' && RK) RK.models.asimov = (function () {
  const T = RK.T, BGU = T.BufferGeometryUtils, PI = Math.PI, D = PI / 180;
  const GC = {};
  const CREASE = 34 * D;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fv = (f, a) => typeof f === 'function' ? f(a) : f;
  const na = a => { a = ((a % 360) + 360) % 360; return a > 180 ? a - 360 : a; };
  const crs = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };

  /* ---------- sections « rectangle arrondi » (voir figure.js) ----------
     plan XZ, axe Y ; xp / xn : demi-épaisseur côté +X / -X ; zp / zn : demi-largeur ; rp / rn : rayons des coins ;
     bxp… : bombé des faces. Angles nominaux : 0 = +X, 90 = +Z, 180 = -X, 270 = -Z. */
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
  const KEYS = ['xp', 'xn', 'zp', 'zn', 'rp', 'rn', 'bxp', 'bxn', 'bzp', 'bzn', 'x0', 'z0', 'pec'];
  function prof(L, list, def) {
    const tab = list.map(s => {
      const o = Object.assign({ x0: 0, z0: 0, rp: 2, rn: 2, bxp: 0, bxn: 0, bzp: 0, bzn: 0, pec: 0 }, def || {});
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
    const seg = (ax, az, bx, bz, n, nx, nz, bu, pc = 0) => { for (let i = 0; i < n; i++) { const t = i / n, k = bu * 4 * t * (1 - t) + pc * Math.pow(Math.sin(2 * PI * t), 2); pts.push([ax + (bx - ax) * t + nx * k, az + (bz - az) * t + nz * k]); } };
    const arc = (cx, cz, r, a0) => { for (let i = 0; i < cs; i++) { const a = (a0 + 90 * i / cs) * D; pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } };
    seg(xp, -zn + rp, xp, zp - rp, nF, 1, 0, d.bxp, d.pec || 0);
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
  const SP = (tab, a, y, off = 0) => { const p = ringAt(ring(dims(tab, y), off, tab.lay), a2s(tab.lay, a)); return [p[0], y, p[1]]; };

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
  /* patch : panneau de coque découpé dans un profil (o.closed : anneau complet, sinon secteur a0 → a1) ;
     o.y0 / o.y1 : bornes (nombre ou fonction de l'angle nominal) ; o.off : décalage normal ; o.c : chanfrein ;
     o.t : profondeur de la paroi ; o.capB / o.capT ; o.axis : 'y' | 'x' (y→+X, x→-Y) | 'z' (y→+Z, z→-Y) */
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
  // repère de surface d'un profil → matrice (axe Y de l'objet le long de la normale : vis, pastilles…)
  const YV = new T.Vector3(0, 1, 0);
  const frameAt = (tab, a, y, off = 0) => {
    const p0 = SP(tab, a, y, off), p1 = SP(tab, a + 0.5, y, off), p2 = SP(tab, a, y + 0.05, off);
    const tu = new T.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize();
    const tv = new T.Vector3(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]).normalize();
    return { p: new T.Vector3(p0[0], p0[1], p0[2]), n: tv.clone().cross(tu).normalize(), tu, tv };
  };
  const nMat = (tab, a, y, lift = 0, off = 0) => {
    const f = frameAt(tab, a, y, off);
    return new T.Matrix4().compose(f.p.addScaledVector(f.n, lift), new T.Quaternion().setFromUnitVectors(YV, f.n), new T.Vector3(1, 1, 1));
  };

  /* ---------- contours 2D ---------- */
  const rr = (s, w, h, r) => { // rectangle arrondi centré
    const x0 = -w / 2, y0 = -h / 2; r = Math.min(r, w / 2 - 0.01, h / 2 - 0.01);
    s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.absarc(x0 + w - r, y0 + r, r, -PI / 2, 0, false);
    s.lineTo(x0 + w, y0 + h - r); s.absarc(x0 + w - r, y0 + h - r, r, 0, PI / 2, false);
    s.lineTo(x0 + r, y0 + h); s.absarc(x0 + r, y0 + h - r, r, PI / 2, PI, false);
    s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, PI, 1.5 * PI, false);
  };
  // « demi-stade » : u de u0 à u1, bout extérieur (u1) en demi-cercle de rayon h/2, coins intérieurs de rayon ri
  const halfStadium = (s, u0, u1, h, ri) => {
    const R = h / 2, cx = u1 - R;
    s.moveTo(u0 + ri, -R); s.lineTo(cx, -R); s.absarc(cx, 0, R, -PI / 2, PI / 2, false);
    s.lineTo(u0 + ri, R); s.absarc(u0 + ri, R - ri, ri, PI / 2, PI, false);
    s.lineTo(u0, -R + ri); s.absarc(u0 + ri, -R + ri, ri, PI, 1.5 * PI, false);
  };
  // flasque : disque de rayon r autour de l'axe + languette vers +Y jusqu'à y1 (bout rond de rayon r1)
  const tab2 = (s, r, y1, r1) => {
    s.moveTo(r, 0); s.absarc(0, 0, r, 0, PI, true);
    s.lineTo(-r1, y1); s.absarc(0, y1, r1, PI, 0, true); s.lineTo(r, 0);
  };

  /* ---------- profils (unités design, 1 ≈ 1 cm ; origine = articulation) ---------- */
  const LT = lay(12, 8, 8, 4), LL = lay(4, 4, 4, 4), LH = lay(4, 6, 4, 7);
  // buste (origine = hanche) : plastron large et bombé, taille étroite
  const CH = prof(LT, [
    { y: 13.5, xp: 7.6, xn: 7.4, z: 9.0, rp: 3.6, rn: 3.6 },
    { y: 16.5, xp: 8.0, xn: 7.8, z: 9.3, rp: 3.8, rn: 3.8 },
    { y: 20.5, xp: 8.9, xn: 8.6, z: 10.2, rp: 4.2, rn: 4.2 },
    { y: 26, xp: 10.0, xn: 9.6, z: 11.6, rp: 4.6, rn: 4.6 },
    { y: 32, xp: 10.9, xn: 10.3, z: 12.7, rp: 5.0, rn: 4.9, pec: 0.15 },
    { y: 38, xp: 11.4, xn: 10.8, z: 13.5, rp: 5.2, rn: 5.1, pec: 0.75 },
    { y: 44, xp: 11.6, xn: 11.1, z: 14.0, rp: 5.3, rn: 5.2, pec: 0.95 },
    { y: 49, xp: 11.6, xn: 11.3, z: 14.2, rp: 5.3, rn: 5.3, pec: 0.7 },
    { y: 53.5, xp: 11.2, xn: 11.2, z: 14.2, rp: 5.2, rn: 5.2, pec: 0.25 },
    { y: 56.6, xp: 10.3, xn: 10.6, z: 13.9, rp: 4.8, rn: 4.9 },
    { y: 58.8, xp: 8.9, xn: 9.6, z: 13.0, rp: 4.3, rn: 4.5 },
    { y: 60.2, xp: 7.2, xn: 8.0, z: 11.0, rp: 3.6, rn: 3.9 },
    { y: 61.0, xp: 5.8, xn: 6.4, z: 8.4, rp: 3.0, rn: 3.2 },
    { y: 61.4, xp: 4.8, xn: 5.3, z: 6.4, rp: 2.6, rn: 2.8 }
  ], { bxp: 0.9, bxn: 0.5, bzp: 0.35, bzn: 0.35 });
  // casque : profil le long de X (axis 'x' : xp = vers le bas, xn = vers le haut), centre à HY au-dessus de l'origine
  const HY = 2.2, HX0 = -11.4, HX1 = 10.9;
  const HEAD = (() => {
    const list = [], NS = 30, xb = -5.0, xf = HX1 - 1.8, Rf = 1.8;
    const se = (t, n) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(t)), n)), 1 / n);
    for (let i = 0; i <= NS; i++) {
      const t = i / NS, x = HX0 + (HX1 - HX0) * (t - Math.sin(2 * PI * t) * 0.12);
      const k = x < xb ? Math.max(0.02, se((xb - x) / (xb - HX0), 2.3)) : 1;          // dôme arrière
      const d = x > xf ? Rf - Math.sqrt(Math.max(0, Rf * Rf - (x - xf) * (x - xf))) : 0; // arrondi du visage plat
      const dn = (x >= -1 ? 12.4 : 12.4 - 5.2 * Math.pow((-1 - x) / 10.4, 1.6)) * k - d;  // mâchoire remontant vers la nuque
      const up = 12.4 * k - d;
      const zz = (8.4 - (x > 2 ? 0.4 * Math.pow((x - 2) / 8.9, 2) : 0) - (x < -4 ? 0.6 * Math.pow((-4 - x) / 7.4, 2) : 0)) * k - d;
      list.push({ y: x, xp: Math.max(0.08, dn), xn: Math.max(0.08, up), z: Math.max(0.08, zz), rp: Math.max(0.05, 4.6 * k - d), rn: Math.max(0.05, 7.6 * k - d), bzp: 0.25 * k, bzn: 0.25 * k });
    }
    return prof(LH, list);
  })();
  // membres : origine = articulation proximale, +Y vers l'extrémité ; AVANT = -X (xn), extérieur = +Z (zp)
  const FA = prof(LL, [
    { y: -0.5, xp: 3.6, xn: 3.8, z: 3.0, r: 2.4 },
    { y: 3.0, xp: 4.2, xn: 4.4, z: 3.1, r: 2.6 },
    { y: 6.5, xp: 4.5, xn: 4.6, z: 4.2, r: 3.0 },
    { y: 14, xp: 4.4, xn: 4.5, z: 4.2, r: 3.0 },
    { y: 22, xp: 4.1, xn: 4.1, z: 3.9, r: 2.8 },
    { y: 28.8, xp: 3.7, xn: 3.7, z: 3.6, r: 2.6 }
  ], { b: 0.08 });
  const TH = prof(LL, [
    { y: -1.5, xp: 4.8, xn: 5.0, z: 6.3, r: 2.7 },
    { y: 3, xp: 6.8, xn: 7.2, z: 6.6, r: 3.3 },
    { y: 10, xp: 7.5, xn: 7.9, z: 6.7, r: 3.6 },
    { y: 22, xp: 7.4, xn: 7.8, z: 6.6, r: 3.6 },
    { y: 33, xp: 6.8, xn: 7.2, z: 6.2, r: 3.3 },
    { y: 41, xp: 5.8, xn: 6.0, z: 5.6, r: 2.9 },
    { y: 46, xp: 5.0, xn: 5.0, z: 5.2, r: 2.6 }
  ], { b: 0.15 });
  const SHN = prof(LL, [
    { y: -4.5, xp: 4.2, xn: 4.6, z: 5.6, r: 2.6 },
    { y: -1, xp: 5.6, xn: 6.2, z: 6.0, r: 3.0 },
    { y: 5, xp: 6.0, xn: 6.4, z: 6.0, r: 3.2 },
    { y: 15, xp: 5.7, xn: 5.8, z: 5.7, r: 3.1 },
    { y: 27, xp: 5.0, xn: 4.9, z: 5.0, r: 2.8 },
    { y: 38, xp: 4.3, xn: 4.2, z: 4.3, r: 2.5 },
    { y: 44.5, xp: 3.8, xn: 3.7, z: 3.8, r: 2.3 },
    { y: 47, xp: 3.3, xn: 3.2, z: 3.3, r: 2.0 }
  ], { b: 0.12 });
  // pied : profil le long de +X (axis 'x') ; [x, bas, haut, demi-largeur]
  const footTab = (rows, rp, rn, b) => prof(LL, rows.map(([x, yb, yt, w]) => ({ y: x, x0: -(yb + yt) / 2, x: (yt - yb) / 2, z: w, rp, rn })), { b });
  const FT = footTab([
    [-7.8, -5.3, -0.8, 3.8], [-7.0, -5.5, 1.6, 4.9], [-4, -5.5, 2.8, 5.2], [0, -5.5, 3.0, 5.3], [3.5, -5.5, 2.0, 5.4],
    [7.5, -5.5, 0.2, 5.5], [11.5, -5.5, -1.2, 5.4], [14.8, -5.5, -2.2, 5.0], [17.0, -5.5, -3.0, 4.0], [18.0, -5.4, -3.8, 2.2]
  ], 1.0, 3.0, 0.3);
  const SOLE = footTab([
    [-8.1, -7.0, -5.3, 3.8], [-7.3, -7.0, -5.3, 5.0], [-4, -7.0, -5.3, 5.4], [0, -7.0, -5.3, 5.5], [3.5, -7.0, -5.3, 5.6],
    [7.5, -7.0, -5.3, 5.7], [11.5, -7.0, -5.3, 5.6], [15, -6.9, -5.3, 5.2], [17.3, -6.6, -5.3, 4.1], [18.4, -6.2, -5.3, 2.3]
  ], 0.6, 0.5, 0);
  const FLO = footTab([
    [-8.1, -7.0, -0.8, 3.8], [-7.0, -7.0, 1.6, 4.9], [-4, -7.0, 2.8, 5.2], [0, -7.0, 3.0, 5.3], [3.5, -7.0, 2.0, 5.4],
    [7.5, -7.0, 0.2, 5.5], [11.5, -7.0, -1.2, 5.4], [15, -6.9, -2.2, 5.0], [17.3, -6.6, -3.0, 4.0], [18.4, -6.2, -3.8, 2.2]
  ], 0.8, 2.8, 0);

  // contours du buste (angle nominal a) : arche ventrale, empiècement en V sous le cou
  const BEL = a => { const u = Math.abs(na(a)); return u <= 34 ? 31.5 - 7.5 * Math.pow(u / 34, 2) : 24 - 2.6 * Math.min(1, (u - 34) / 56); };
  const VY = u => 49.5 + 9.3 * Math.pow(Math.min(u, 28) / 28, 1.6);
  const PEC_TOP = a => { const u = Math.abs(na(a)); return u < 28 ? VY(u) - 0.3 : u < 40 ? lerp(VY(28) - 0.3, 60.4, (u - 28) / 12) : 60.4; };

  /* ---------- skins : finitions (couleurs : ch.body = coques, ch.trim = détails, ch.joint = graphite) ---------- */
  const SKINS = {
    classic: { dots: 'dark' },
    // NOIR : coques noir satiné (reflets doux), mêmes détails orange, pastilles d'épaule orange
    noir: { shell: { roughness: 0.36, metalness: 0.3, clearcoat: 0.55, clearcoatRoughness: 0.26, envMapIntensity: 0.85 }, dots: 'trim' },
    // PROTOTYPE DIY : PA12 blanc brut mat, alu brut, LED cyan
    proto: { shell: { roughness: 0.62, metalness: 0.02, clearcoat: 0.1, sheen: 0.4, sheenRoughness: 0.5, sheenColor: 0xffffff, envMapIntensity: 0.5 },
      trim: { roughness: 0.3, metalness: 0.95, clearcoat: 0, envMapIntensity: 1.0 }, dots: 'dark' },
    // HACKER : noir profond, alu anodisé vert « terminal »
    hacker: { shell: { roughness: 0.45, metalness: 0.25, clearcoat: 0.35 }, trim: { roughness: 0.28, metalness: 0.8 }, dots: 'trim' },
    // ANODISÉ COBALT : coques gris perle métallisé, détails bleu électrique
    cobalt: { shell: { roughness: 0.3, metalness: 0.5, clearcoat: 0.6 }, trim: { roughness: 0.25, metalness: 0.9 }, dots: 'trim' }
  };

  return function (ctx) {
    const { g, M, L, ch } = ctx;
    const low = ctx.lod === 'low';
    const P = {};
    const SK = SKINS[ctx.skin] || SKINS.classic;
    let nMesh = 0;
    const add = (parent, geo, mat, p, r, s) => { nMesh++; return ctx.add(parent, geo, mat, { p, r, s }); };
    const addNS = (parent, geo, mat, p, r, s) => { nMesh++; return ctx.add(parent, geo, mat, { p, r, s, shadow: false }); };
    const sidePart = (sd, build) => { const part = ctx.group(), inner = ctx.group(); if (sd < 0) inner.scale.z = -1; part.add(inner); build(inner); return part; };

    /* ---------- matériaux ---------- */
    const SHL = ctx.mat(Object.assign({ color: ch.body, roughness: 0.38, metalness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.32, envMapIntensity: 0.95 }, SK.shell || {}));   // coques orange métallisé satiné
    const SHF = ctx.mat(Object.assign({ color: ch.body, roughness: 0.55, metalness: 0.35, clearcoat: 0.2, clearcoatRoughness: 0.55, envMapIntensity: 0.7 }, SK.shellFlat || {})); // plaques planes (capsules)
    const TR = ctx.mat(Object.assign({ color: ch.trim, roughness: 0.36, metalness: 0.45, clearcoat: 0.45, clearcoatRoughness: 0.3, envMapIntensity: 0.95 }, SK.trim || {}));     // détails orange (bagues, plaques)
    const BK = ctx.mat(Object.assign({ color: ch.joint, roughness: 0.6, metalness: 0.25, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.6 }, SK.black || {})); // graphite satiné
    const BKD = ctx.mat({ color: new T.Color(ch.joint).multiplyScalar(0.5), roughness: 0.45, metalness: 0.5, clearcoat: 0.2, envMapIntensity: 0.6 });                     // mécanique sombre
    const GB = ctx.mat({ color: 0x060708, roughness: 0.1, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.15 });                                  // noir laqué (visière, crâne)
    const SE = M.seam, CHR = M.chrome;
    const RU = ctx.mat({ color: 0x141518, roughness: 0.75, metalness: 0.05, envMapIntensity: 0.35 });
    const LENS = ctx.mat({ color: 0x05080f, roughness: 0.03, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 });
    const LED = ctx.glow(ch.accent, 2.6);
    const DOT = SK.dots === 'trim' ? TR : SE;
    const shZ = 22.5, hpZ = 12;

    /* =====================================================
       LOD bas (images rémanentes) : même silhouette, très peu de triangles
       ===================================================== */
    if (low) {
      const torso = ctx.group();
      add(torso, loft('asvLoCH', CH, 13.5, 61.4, 5, { capB: true, capT: true }), SHL);
      add(torso, g.box(14, 21.6, 12), BK, [0, 3.2, 0]);
      P.torso = torso;
      P.neck = ctx.group(ctx.mesh(g.cyl(4.4, 5.8, 10, 8), BK, { p: [0, 4, 0] }));
      P.head = ctx.group(ctx.mesh(loft('asvLoHD', HEAD, HX0, HX1, 7, { capB: true, capT: true, axis: 'x' }), SHL, { p: [0, HY, 0] }),
        ctx.mesh(g.box(0.8, 18, 12), GB, { p: [HX1 + 0.3, HY + 0.6, 0] }));
      for (const [sd, z] of [['f', 1], ['b', -1]]) {
        P[sd + 'sc'] = sidePart(z, gr => add(gr, g.box(13, 17.6, 4.6), BK, [0, -1.8, -6.8]));
        P[sd + 'ua'] = sidePart(z, gr => { add(gr, g.box(12.4, 10.4, 12.3), BK, [0, 0, 1.45]); add(gr, g.cyl(4.85, 4.85, 30, 8), BK, [0, 18.5, 0]); });
        P[sd + 'el'] = ctx.group(ctx.mesh(g.cyl(3.8, 3.8, 8.6, 8, 'z'), BK));
        P[sd + 'fa'] = ctx.group(ctx.mesh(loft('asvLoFA', FA, -0.5, 28.8, 2, { capB: true, capT: true }), BK));
        P[sd + 'ha'] = ctx.group(ctx.mesh(g.cyl(4.7, 4.7, 5.6, 10, 'x'), TR, { p: [-0.6, 0, 0] }));
        P[sd + 'ha'].userData.setCurl = () => {};
        P[sd + 'th'] = ctx.group(ctx.mesh(loft('asvLoTH', TH, -1.5, 46, 3, { capB: true, capT: true }), BK));
        P[sd + 'sh'] = ctx.group(ctx.mesh(loft('asvLoSH', SHN, -4.5, 47, 3, { capB: true, capT: true }), BK));
        P[sd + 'kn'] = ctx.group(ctx.mesh(g.cyl(4.6, 4.6, 12.4, 8, 'z'), BK));
        P[sd + 'fo'] = ctx.group(ctx.mesh(loft('asvLoFT', FLO, -8.1, 18.4, 4, { capB: true, capT: true, axis: 'x' }), BK));
      }
      return { parts: P, shZ, hpZ };
    }

    /* =====================================================
       TORSE : bassin noir (panneau ovale), taille étroite, plastron sculpté, anneaux en D
       ===================================================== */
    const torso = ctx.group();
    let logoG = null;
    {
      // --- bassin en T : bloc haut large, bloc bas entre les cuisses, panneau ovale avant ---
      add(torso, g.rbox(14.0, 8.4, 18.8, 2.4, 2), BK, [0, 9.9, 0]);
      add(torso, g.rbox(14.0, 14.0, 10.0, 1.6, 2), BK, [0, -0.6, 0]);
      const ovalF = g.shape('asvOvalF', s => { rr(s, 6.0, 11.4, 3.0); const h = new T.Path(); rr(h, 5.0, 10.4, 2.5); s.holes.push(h); }, 0.3, 0, 4);
      add(torso, ovalF, SE, [7.02, 2.4, 0], [0, PI / 2, 0]);
      add(torso, g.shape('asvOvalP', s => rr(s, 4.8, 10.2, 2.4), 0.3, 0.1, 4), BKD, [6.98, 2.4, 0], [0, PI / 2, 0]);
      add(torso, fuse('asvPelScr', [[-1.6, 1], [1.6, 1]].map(([zz, k]) => [g.cyl(0.3, 0.3, 0.3, 8, 'x'), [7.05, 10.6, zz]])), SE);
      // --- buste : âme sombre (visible dans les joints), bande ventrale noire, plastron ---
      add(torso, loft('asvCHcore', CH, 13.5, 61.4, 10, { off: -0.75, capB: true, capT: true }), BKD);
      add(torso, patch('asvBelly', { tab: CH, closed: true, y0: 13.5, y1: BEL, nv: 8, c: 0.35, t: 1.0 }), BK);
      add(torso, patch('asvWaistRing', { tab: CH, closed: true, y0: 13.6, y1: 14.5, nv: 1, off: 0.22, c: 0.12, t: 0.5 }), TR);
      for (const s of [1, -1]) {
        add(torso, patch('asvPec' + s, { tab: CH, a0: s > 0 ? 0.8 : -131, a1: s > 0 ? 131 : -0.8, y0: a => BEL(a) + 0.55, y1: PEC_TOP, nv: 16, off: 0.12, c: 0.45, t: 1.3 }), SHL);
      }
      add(torso, patch('asvBib', { tab: CH, a0: -27.2, a1: 27.2, y0: a => VY(Math.abs(na(a))) + 0.3, y1: a => 59.0 + 1.8 * Math.pow(Math.abs(na(a)) / 27.2, 2), nv: 5, c: 0.35, t: 1.0 }), SHL);
      add(torso, patch('asvBack', { tab: CH, a0: 132.5, a1: 227.5, y0: 21.95, y1: 60.4, nv: 12, off: 0.12, c: 0.45, t: 1.3 }), SHL);
      add(torso, patch('asvBackPan', { tab: CH, a0: 150, a1: 210, y0: 30, y1: a => 52.5 - 2.0 * Math.pow((180 - Math.abs(na(a))) / 30, 2), nv: 6, off: 0.42, c: 0.3, t: 0.6 }), BK);
      // vis (coins de l'arche, flancs, dos)
      const scr = [];
      for (const s of [1, -1]) for (const [a, y, l] of [[37, 24.3, 0.2], [70, 27, 0.2], [95, 36, 0.2], [155, 34, 0.5], [155, 49, 0.5], [118, 56, 0.2]]) scr.push([g.cyl(0.34, 0.27, 0.16, 8), null, nMat(CH, s * a, y, l)]);
      add(torso, fuse('asvChScr', scr), SE);
      // anneaux en D (acier) sur le dessus des épaules
      for (const s of [1, -1]) {
        add(torso, g.cbox(2.6, 0.9, 3.4, 0.3), BKD, [-3.0, 59.1, s * 12.4]);
        add(torso, g.torus(1.15, 0.24, 20, 6, PI, 'x'), CHR, [-3.0, 59.5, s * 12.4]);
      }
      // logo « m » en relief (groupe retourné en Z quand le robot regarde à gauche → jamais en miroir)
      const mPts = [[-2.2, -2.2], [-1.3, -2.2], [-1.3, 1.3], [-0.15, 1.3], [-0.15, -2.2], [0.75, -2.2], [0.75, 1.3], [1.9, 1.3], [1.9, -2.2], [2.8, -2.2], [2.8, 1.5], [2.1, 2.2], [-2.8, 2.2], [-2.8, 1.4], [-2.2, 1.4]];
      const ly = 45.6, lp = SP(CH, 0, ly, 0);
      logoG = ctx.group(); logoG.userData.noMerge = true; logoG.position.set(lp[0], ly, 0); torso.add(logoG);
      add(logoG, g.prism(mPts, 0.6, 0.12), GB, [0.32, 0, 0], [0, PI / 2, 0], 0.86);
    }
    P.torso = torso;

    /* ---------- cou noir fin ---------- */
    {
      const n = ctx.group();
      add(n, g.lathe([[0, -1.5], [6.4, -1.5], [6.2, 0.4], [5.3, 2.0], [4.6, 3.8], [4.35, 6.0], [4.3, 12.8], [0, 12.8]], 24), BK);
      add(n, g.cyl(4.62, 4.62, 0.35, 28, 'y', true), BKD, [0, 4.6, 0]);
      P.neck = n;
    }

    /* =====================================================
       TÊTE : casque rectangle arrondi, visière noire laquée, bandeau de crâne, oreillettes + LED, caméra
       ===================================================== */
    {
      const h = ctx.group(), hg = ctx.group(); hg.position.y = HY; h.add(hg);
      const vm = v => v - Math.sin(2 * PI * v) * 0.12;
      add(hg, patch('asvHDshell', { tab: HEAD, closed: true, y0: HX0, y1: HX1, nv: 30, c: 0, t: 0, capT: true, capB: true, vmap: vm, axis: 'x' }), SHL);
      // bandeau de crâne noir (de la visière à la nuque), bords chanfreinés = joints de panneaux
      add(hg, patch('asvHDcrown', { tab: HEAD, a0: 152, a1: 208, y0: -8.4, y1: HX1 - 0.02, nv: 18, off: 0.07, c: 0.25, t: 0.5, axis: 'x' }), GB);
      // visière : grande plaque noire laquée (haut arrondi, bas en écusson)
      const visor = g.shape('asvVisor', s => {
        const W = 5.3, TOP = 10.0, R = 4.6, SY = -1.6, BX = 3.0, BY = -7.6, BOT = -8.2;
        s.moveTo(0, BOT); s.quadraticCurveTo(BX * 0.65, BOT, BX, BY); s.quadraticCurveTo(W - 0.2, -5.2, W, SY);
        s.lineTo(W, TOP - R); s.absarc(W - R, TOP - R, R, 0, PI / 2, false);
        s.lineTo(-(W - R), TOP); s.absarc(-(W - R), TOP - R, R, PI / 2, PI, false);
        s.lineTo(-W, SY); s.quadraticCurveTo(-(W - 0.2), -5.2, -BX, BY); s.quadraticCurveTo(-BX * 0.65, BOT, 0, BOT);
      }, 0.9, 0.4, 7);
      add(hg, visor, GB, [HX1 + 0.3, 0, 0], [0, PI / 2, 0]);
      addNS(hg, g.box(0.06, 0.12, 8.6), SE, [HX1 + 0.77, -3.5, 0]);            // joint de la mentonnière
      // caméra ronde en bas de la visière
      add(hg, g.torus(0.82, 0.17, 20, 6, 2 * PI, 'x'), CHR, [HX1 + 0.8, -6.1, 0]);
      add(hg, g.cyl(0.72, 0.72, 0.3, 18, 'x'), LENS, [HX1 + 0.75, -6.1, 0]);
      // oreillettes (demi-gélules noires laquées) + disque + 2 LED orange sur le bord avant
      const ear = g.shape('asvEar', s => rr(s, 5.6, 11.0, 2.8), 2.4, 0.6, 5);
      for (const s of [1, -1]) {
        add(hg, ear, GB, [-1.0, 0.6, s * 9.05]);
        add(hg, g.ccyl(2.2, 0.5, 0.15, 24, 'z'), BKD, [-1.4, 0.6, s * 10.3]);
        addNS(hg, fuse('asvEarLed' + s, [[g.sphere(0.45, 8, 6), [1.75, 4.6, s * 10.2]], [g.sphere(0.45, 8, 6), [1.75, -3.4, s * 10.2]]]), LED);
      }
      P.head = h;
    }

    /* =====================================================
       BRAS
       ===================================================== */
    // capsule d'épaule (repère du bras : z = latéral, avant = -X) : contour u = z, v = y, extrudé selon X
    const podGeo = g.shape('asvPod', s => halfStadium(s, -3.2, 6.1, 7.4, 1.2), 12.4, 1.5, 7);
    const podPlate = g.shape('asvPodPl', s => halfStadium(s, -2.4, 5.4, 6.6, 1.4), 0.7, 0.25, 6);
    const podDots = fuse('asvPodDots', Array.from({ length: 6 }, (_, i) => [g.cyl(0.46, 0.46, 0.3, 10, 'x'), [-6.62, 2.15 * Math.sin(i * PI / 3), 2.0 + 2.15 * Math.cos(i * PI / 3)]]));
    const cheek = g.shape('asvCheek', s => { s.moveTo(-3.6, 24.6); s.lineTo(3.6, 24.6); s.lineTo(3.6, 33); s.absarc(0, 33, 3.6, 0, PI, false); s.lineTo(-3.6, 24.6); }, 1.1, 0.3, 6);
    const bracket = g.shape('asvBrk', s => tab2(s, 3.3, 7.8, 1.9), 1.4, 0.3, 6);
    for (const [sd, z] of [['f', 1], ['b', -1]]) {
      // carter d'épaule (actionneur de tangage) fixé au buste
      P[sd + 'sc'] = sidePart(z, gr => {
        add(gr, g.rbox(13.0, 17.6, 4.6, 1.8, 2), BK, [0, -1.8, -6.8]);
        add(gr, g.ccyl(3.6, 1.4, 0.3, 24, 'z'), BKD, [0, 0, -4.2]);
        add(gr, fuse('asvScScr', [[-3.6, 3.2], [3.6, 3.2], [-3.6, -7.0], [3.6, -7.0]].map(([x, y]) => [g.cyl(0.3, 0.3, 0.3, 8, 'z'), [x, y, -4.47]])), SE);
      });
      // bras : capsule (tourne avec le bras), cylindre noir, joint + vis, bague orange, chape de coude
      P[sd + 'ua'] = sidePart(z, gr => {
        add(gr, podGeo, BK, [0, 0, 0], [0, -PI / 2, 0]);
        add(gr, podPlate, SHF, [-6.3, 0, 0], [0, -PI / 2, 0]);
        add(gr, podDots, DOT);
        add(gr, g.ccyl(4.85, 21.6, 0.7, 32), BK, [0, 14.4, 0]);
        add(gr, g.cyl(4.9, 4.9, 0.32, 32, 'y', true), SE, [0, 20.4, 0]);
        add(gr, fuse('asvUAscr', [0, 1, 2, 3].map(i => { const a = (i * 90 + 45) * D; return [g.cyl(0.3, 0.3, 0.3, 8, 'x'), [-4.86 * Math.cos(a), 22.4, 4.86 * Math.sin(a)], [0, a, 0]]; })), SE);
        add(gr, g.ccyl(5.05, 1.1, 0.3, 32), TR, [0, 25.3, 0]);
        add(gr, g.ccyl(4.2, 1.6, 0.4, 24), BKD, [0, 26.4, 0]);
        for (const zz of [1, -1]) add(gr, cheek, BK, [0, 0, zz * 3.85]);
      });
      // coude : moyeu + flasques orange de part et d'autre (suivent l'avant-bras)
      P[sd + 'el'] = sidePart(z, gr => {
        add(gr, g.ccyl(3.3, 6.6, 0.4, 24, 'z'), BKD);
        for (const zz of [1, -1]) {
          add(gr, bracket, TR, [0, 0, zz * 5.05]);
          add(gr, g.ccyl(1.6, 0.5, 0.15, 16, 'z'), BKD, [0, 0, zz * 5.85]);
        }
      });
      // avant-bras noir, plaques latérales orange, bague de poignet orange
      P[sd + 'fa'] = sidePart(z, gr => {
        add(gr, loft('asvFA', FA, -0.5, 28.8, 8, { capB: true, capT: true }), BK);
        add(gr, patch('asvFAplO', { tab: FA, a0: 52, a1: 128, y0: 9.6, y1: 24.6, nv: 5, off: 0.1, c: 0.25, t: 0.5 }), TR);
        add(gr, patch('asvFAplI', { tab: FA, a0: 232, a1: 308, y0: 9.6, y1: 24.6, nv: 5, off: 0.1, c: 0.25, t: 0.5 }), TR);
        add(gr, fuse('asvFAscr', [[180, 5.5], [180, 26], [0, 5.5], [0, 26]].map(([a, y]) => [g.cyl(0.28, 0.22, 0.14, 8), null, nMat(FA, a, y, 0.04)])), SE);
        add(gr, g.lathe([[2.95, 0], [4.3, 0], [4.75, 0.45], [4.75, 3.05], [4.3, 3.5], [2.95, 3.5], [2.95, 0]], 32), TR, [0, 28.3, 0]);
      });
      // « main » : embout rond noir dans la bague (le kit n'a pas de mains)
      {
        const hd = ctx.group();
        add(hd, g.ccyl(2.95, 5.0, 0.5, 28, 'x'), BK, [-0.6, 0, 0]);
        add(hd, g.torus(1.85, 0.16, 24, 4, 2 * PI, 'x'), SE, [1.92, 0, 0]);
        add(hd, g.ccyl(1.0, 0.5, 0.15, 16, 'x'), BKD, [1.95, 0, 0]);
        hd.userData.setCurl = () => {};
        P[sd + 'ha'] = hd;
      }
    }

    /* =====================================================
       JAMBES
       ===================================================== */
    const kneePlate = g.shape('asvKnPl', s => tab2(s, 4.0, 17.0, 1.5), 1.0, 0.3, 8);
    const kneeHoles = fuse('asvKnHoles', [
      ...Array.from({ length: 5 }, (_, i) => [g.cyl(0.36, 0.36, 0.3, 8, 'z'), [2.55 * Math.sin(i * 2 * PI / 5), -2.55 * Math.cos(i * 2 * PI / 5), 0.42]]),
      [g.cyl(0.8, 0.8, 0.3, 14, 'z'), [0, 0, 0.42]],
      ...[7.6, 10.6, 13.6].map(y => [g.cyl(0.36, 0.36, 0.3, 8, 'z'), [0, y, 0.42]])
    ]);
    for (const [sd, z] of [['f', 1], ['b', -1]]) {
      // hanche : bagues orange sur les faces du moyeu (tournent avec la cuisse)
      P[sd + 'hi'] = sidePart(z, gr => {
        for (const zz of [1, -1]) add(gr, g.torus(3.7, 0.3, 28, 5, 2 * PI, 'z'), TR, [0, 0, zz * 6.7]);
        add(gr, g.ccyl(3.2, 0.6, 0.2, 24, 'z'), BKD, [0, 0, 6.75]);
      });
      // cuisse graphite carrée arrondie (moyeu de hanche intégré), vis
      P[sd + 'th'] = sidePart(z, gr => {
        add(gr, g.ccyl(5.7, 13.2, 0.9, 32, 'z'), BK);
        add(gr, loft('asvTH', TH, -1.5, 46, 12, { capB: true, capT: true }), BK);
        add(gr, patch('asvTHseam', { tab: TH, closed: true, y0: 30.6, y1: 30.9, nv: 1, off: 0.02, c: 0, t: 0 }), SE);
        add(gr, fuse('asvTHscr', [[90, 10], [90, 18], [90, 26], [135, 36], [180, 8], [180, 24], [270, 14]].map(([a, y]) => [g.cyl(0.32, 0.26, 0.16, 8), null, nMat(TH, a, y, 0.05)])), SE);
      });
      // genou : moyeu sombre
      P[sd + 'kn'] = ctx.group(ctx.mesh(g.ccyl(4.6, 12.4, 0.6, 28, 'z'), BKD)); nMesh++;
      // tibia noir effilé, plaques orange perforées des deux côtés du genou, détails sombres, biellettes de cheville
      P[sd + 'sh'] = sidePart(z, gr => {
        add(gr, loft('asvSH', SHN, -4.5, 47, 12, { capB: true, capT: true }), BK);
        for (const zz of [1, -1]) {
          add(gr, kneePlate, TR, [0, 0, zz * 6.45]);
          add(gr, kneeHoles, SE, [0, 0, zz * 6.45], zz < 0 ? [0, PI, 0] : undefined);
        }
        add(gr, fuse('asvSHdet', [[135, 25], [135, 33], [225, 29]].flatMap(([a, y]) => [[g.cyl(0.95, 0.95, 0.3, 14), null, nMat(SHN, a, y, 0.05)], [g.cyl(0.4, 0.4, 0.42, 8), null, nMat(SHN, a, y, 0.12)]])), SE);
        add(gr, fuse('asvSHscr', [[180, 9], [180, 40], [0, 12], [0, 36]].map(([a, y]) => [g.cyl(0.3, 0.24, 0.14, 8), null, nMat(SHN, a, y, 0.04)])), SE);
        add(gr, fuse('asvAnkLnk', [1, -1].map(zz => [g.cbox(1.5, 5.2, 1.0, 0.3), [-0.6, 45.2, zz * 3.75]])), TR);
      });
      // pied : chaussure noire (tige, semelle caoutchouc, sangle), cheville sombre + chapes orange
      P[sd + 'fo'] = sidePart(z, gr => {
        add(gr, loft('asvSOLE', SOLE, -8.1, 18.4, 8, { capB: true, capT: true, axis: 'x' }), RU);
        add(gr, loft('asvFTup', FT, -7.8, 18.0, 11, { capB: true, capT: true, axis: 'x' }), BK);
        add(gr, patch('asvFTstrap', { tab: FT, a0: 100, a1: 260, y0: 4.2, y1: 6.6, nv: 2, off: 0.18, c: 0.2, t: 0.5, axis: 'x' }), BKD);
        add(gr, patch('asvFTtoe', { tab: FT, a0: 100, a1: 260, y0: 13.2, y1: 18.0, nv: 3, off: 0.15, c: 0.22, t: 0.6, axis: 'x' }), BK);
        add(gr, g.ccyl(3.0, 7.6, 0.5, 20, 'z'), BKD);
        for (const zz of [1, -1]) add(gr, g.ccyl(1.9, 0.7, 0.2, 18, 'z'), TR, [0, 0, zz * 4.0]);
      });
    }

    if (typeof window !== 'undefined' && window.__report) {
      window.__report.asimovMeshes = nMesh;
      const tp = {}; for (const k in P) { let n = 0; P[k].traverse(o => { if (o.isMesh) { const gg = o.geometry; n += (gg.index ? gg.index.count : gg.attributes.position.count) / 3; } }); tp[k] = Math.round(n); }
      window.__report.asimovTris = tp;
    }
    const tick = ctx.override ? undefined : (t, state) => {
      const sup = state && (state.st === 'super' || state.st === 'special');
      LED.emissiveIntensity = LED.userData.baseI * ((sup ? 1.6 : 0.85) + 0.15 * Math.sin(t * 2.4));
      // robot tourné vers la gauche (modèle en miroir) : logo retourné → toujours lisible
      if (logoG) logoG.scale.z = state && state.face < 0 ? -1 : 1;
    };
    return { parts: P, shZ, hpZ, tick };
  };
})();
