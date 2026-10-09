'use strict';
/* =========================================================
   Modèle 3D : ENGINEAI T800 (Shenzhen, 2025) — star des combats REK (San Francisco)
   Contrat : voir js/kit.js.
   Design (d'après photo) : casque façon moto (coque blanche, visière fumée, mentonnière
   blanche en V, oreillettes grises à fentes, crête sur le dessus) ; buste blanc large
   (empiècement d'épaules), plastron central bleu nuit avec logo circulaire bleu lumineux
   et deux filets LED en diagonale sous les pectoraux ; abdomen gris foncé en coupe ;
   bassin blanc à logo triangle ; disques gris aux épaules / coudes / hanches / genoux ;
   avant-bras à rayures noires ; cuisses blanches à panneau gris encastré ; tibias blancs
   à flancs gris et logo orange ; chaussures type basket (semelle noire, accents orange).
   Technique : coques « patch » découpées dans des profils superelliptiques (chanfrein +
   paroi intérieure, joints sombres), plaques angulaires extrudées, détails fusionnés.
   ========================================================= */
if (typeof RK !== 'undefined' && RK) RK.models.t800 = (function () {
  const T = RK.T, BGU = T.BufferGeometryUtils, PI = Math.PI, D = PI / 180;
  const GC = {};
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = x => Math.min(1, Math.max(0, x));
  const sstep = x => { x = clamp01(x); return x * x * (3 - 2 * x); };

  /* ---------- interpolation ---------- */
  const crs = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
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
     o.tab : profil ; o.map(u, v) -> [theta, y] ; o.nu, o.nv : résolution
     o.off : décalage normal ; o.c : chanfrein du bord ; o.t : profondeur de la paroi
     o.closed : anneau complet ; o.capB / o.capT : fermer le bas / le haut
     o.axis : 'y' | 'x' (y du profil -> +X, x du profil -> -Y) | 'z' (y du profil -> +Z, z du profil -> -Y) */
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
  // fusion locale de petites géométries : items = [[geo, [x,y,z], [rx,ry,rz] | Matrix4, échelle]]
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();
  function fuse(key, items) {
    if (GC[key]) return GC[key];
    const list = items.map(([geo, p, r, s]) => {
      const gg = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const n of Object.keys(gg.attributes)) if (n !== 'position' && n !== 'normal') gg.deleteAttribute(n);
      if (r && r.isMatrix4) _m.copy(r);
      else _m.compose(_v.set(...(p || [0, 0, 0])), _q.setFromEuler(_e.set(...(r || [0, 0, 0]))), Array.isArray(s) ? _s.set(...s) : _s.setScalar(s || 1));
      gg.applyMatrix4(_m);
      if (_m.determinant() < 0) {
        const at = gg.attributes.position, arr = at.array, nn = gg.attributes.normal ? gg.attributes.normal.array : null;
        for (let i = 0; i < at.count; i += 3) for (let k = 0; k < 3; k++) {
          let t = arr[(i + 1) * 3 + k]; arr[(i + 1) * 3 + k] = arr[(i + 2) * 3 + k]; arr[(i + 2) * 3 + k] = t;
          if (nn) { t = nn[(i + 1) * 3 + k]; nn[(i + 1) * 3 + k] = nn[(i + 2) * 3 + k]; nn[(i + 2) * 3 + k] = t; }
        }
      }
      return gg;
    });
    return (GC[key] = BGU.mergeGeometries(list, false));
  }
  // repère tangent sur un profil : X = tangente (theta croissant), Y = normale sortante, Z = X × Y (≈ +y du profil)
  const _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Vector3(), _n = new T.Vector3();
  function frame(tab, th, y, lift = 0, spin = 0) {
    const p0 = SP(tab, th, y, lift), p1 = SP(tab, th + 0.01, y, lift), p2 = SP(tab, th, y + 0.05, lift);
    _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize();
    _b.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]).normalize();
    _n.copy(_b).cross(_a).normalize();
    _b.copy(_a).cross(_n).normalize();               // Z = X × Y
    if (spin) { const cs = Math.cos(spin), sn = Math.sin(spin); _c.copy(_a).multiplyScalar(cs).addScaledVector(_b, -sn); _b.multiplyScalar(cs).addScaledVector(_a, sn); _a.copy(_c); }
    return new T.Matrix4().makeBasis(_a, _n, _b).setPosition(p0[0], p0[1], p0[2]);
  }
  const mul = (A, B) => A.clone().multiply(B);
  const MT = (p, r, s) => new T.Matrix4().compose(new T.Vector3(...p), new T.Quaternion().setFromEuler(new T.Euler(...(r || [0, 0, 0]))), new T.Vector3(...(Array.isArray(s) ? s : [s || 1, s || 1, s || 1])));

  // cartes (u, v) -> [theta, y]
  const fv = (f, th) => typeof f === 'function' ? f(th) : f;
  const band = (th0, th1, yb, yt) => (u, v) => { const th = lerp(th0, th1, u); return [th, lerp(fv(yb, th), fv(yt, th), v)]; };
  const shield = (y0, y1, wf, c0 = 0) => (u, v) => { const y = lerp(y0, y1, v), w = wf(y); return [c0 + lerp(-w, w, u), y]; };
  // bande oblique (rayure) : centre (thc, yc), longueur angulaire dth, largeur w (en y), pente sl (dy sur la longueur)
  const slant = (thc, yc, dth, w, sl) => (u, v) => [thc + (u - 0.5) * dth, yc + (u - 0.5) * sl + (v - 0.5) * w];
  // ovale arrondi (panneau encastré) : demi-largeur angulaire w, extrémités arrondies (superellipse)
  const ovalW = (y0, y1, w, n = 3) => y => { const t = Math.abs((y - (y0 + y1) / 2) / ((y1 - y0) / 2)); return w * Math.pow(Math.max(0.02, 1 - Math.pow(Math.min(1, t), n)), 1 / n); };

  /* ---------- profils du robot (unités design, 1 ≈ 1 cm) ---------- */
  // casque (centre = origine, visage +X)
  const HEAD = (() => {
    const yT = 11.4, yB = -10.4, yc = 0.4, list = [];
    const se = (t, n) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(t)), n)), 1 / n);
    for (let i = 0; i <= 40; i++) {
      const y = yB + (yT - yB) * (1 - Math.cos(i / 40 * PI)) / 2;
      const up = y >= yc;
      const kx = up ? se((y - yc) / (yT - yc), 2.25) : se((yc - y) / (yc - yB) * 0.86, 2.8);
      const kz = up ? se((y - yc) / (yT - yc + 0.6), 2.5) : se((yc - y) / (yc - yB) * 0.8, 3.2);
      const lowK = y < 0 ? Math.min(1, -y / 9.4) : 0;
      list.push({ y, xf: 9.9 * kx + 0.9 * lowK, xb: 10.7 * kx * (1 - 0.16 * lowK), z: 8.8 * kz * (1 - 0.2 * lowK), x0: 0.7 * lowK, nf: 2.5 - 1.15 * lowK, nb: 2.3 });
    }
    return prof(list);
  })();
  // crâne d'endosquelette (skin ENDOSQUELETTE) : boîte crânienne haute et étroite, face verticale,
  // mâchoire en U plus étroite que les pommettes, nuque qui remonte derrière la mandibule
  const SK = prof([
    { y: -11.2, xf: 0.8, xb: 0.6, z: 1.6, x0: 6.3, nf: 2.8, nb: 2.4 },
    { y: -10.5, xf: 2.0, xb: 2.0, z: 3.3, x0: 5.8, nf: 2.8, nb: 2.4 },
    { y: -9.2, xf: 2.8, xb: 3.3, z: 4.45, x0: 5.25, nf: 2.9, nb: 2.4 },
    { y: -7.4, xf: 3.3, xb: 4.6, z: 5.25, x0: 4.9, nf: 2.9, nb: 2.4 },
    { y: -5.6, xf: 3.6, xb: 6.4, z: 6.3, x0: 4.7, nf: 2.8, nb: 2.4 },
    { y: -3.8, xf: 4.2, xb: 9.0, z: 7.5, x0: 4.3, nf: 2.7, nb: 2.4 },
    { y: -1.8, xf: 5.2, xb: 10.0, z: 7.9, x0: 3.5 },
    { y: 0.8, xf: 7.2, xb: 10.6, z: 7.75, x0: 1.8, nf: 2.6, nb: 2.5 },
    { y: 3.6, xf: 8.6, xb: 9.5, z: 7.7, x0: 0.6, nf: 2.7, nb: 2.6 },
    { y: 6.6, xf: 8.5, xb: 8.8, z: 7.1, x0: 0, nf: 2.7, nb: 2.6 },
    { y: 9.0, xf: 6.9, xb: 7.2, z: 5.7, x0: 0, nf: 2.6, nb: 2.5 },
    { y: 10.6, xf: 4.2, xb: 4.7, z: 3.6, x0: 0 },
    { y: 11.3, xf: 1.6, xb: 2.0, z: 1.5, x0: 0 },
    { y: 11.45, xf: 0.3, xb: 0.3, z: 0.3, x0: 0 }
  ].map(s => Object.assign({ nf: 2.5, nb: 2.3 }, s)));
  // buste (origine = bassin)
  const TB = prof([
    { y: 20.5, xf: 7.0, xb: 6.8, z: 8.0 },
    { y: 23, xf: 8.0, xb: 7.6, z: 9.3 },
    { y: 28, xf: 9.8, xb: 8.9, z: 11.3 },
    { y: 34, xf: 11.2, xb: 10.0, z: 13.1 },
    { y: 40, xf: 12.2, xb: 10.8, z: 14.7 },
    { y: 46, xf: 12.6, xb: 11.2, z: 15.7 },
    { y: 51, xf: 12.3, xb: 11.2, z: 15.9 },
    { y: 55, xf: 11.4, xb: 10.7, z: 15.1 },
    { y: 57.6, xf: 10.1, xb: 9.8, z: 13.7 },
    { y: 59.9, xf: 8.3, xb: 8.3, z: 11.4 },
    { y: 61.7, xf: 6.4, xb: 6.6, z: 8.8 },
    { y: 63.0, xf: 5.0, xb: 5.2, z: 6.6 }
  ].map(s => Object.assign({ nf: 3.3, nb: 2.8 }, s)));
  // taille
  const WB = prof([
    { y: 12, xf: 8.0, xb: 7.8, z: 9.6 },
    { y: 16, xf: 7.1, xb: 6.9, z: 8.1 },
    { y: 20, xf: 6.9, xb: 6.7, z: 7.9 },
    { y: 24, xf: 7.5, xb: 7.1, z: 8.7 }
  ].map(s => Object.assign({ n: 2.8 }, s)));
  // bassin
  const PB = prof([
    { y: -11, xf: 5.0, xb: 4.8, z: 5.2 },
    { y: -8, xf: 7.2, xb: 7.0, z: 8.0 },
    { y: -4, xf: 8.8, xb: 8.6, z: 10.6 },
    { y: 1, xf: 9.4, xb: 9.2, z: 12.0 },
    { y: 6, xf: 9.2, xb: 9.0, z: 12.0 },
    { y: 11, xf: 8.6, xb: 8.4, z: 10.9 },
    { y: 15.5, xf: 8.0, xb: 7.8, z: 9.6 }
  ].map(s => Object.assign({ n: 3.0 }, s)));
  // membres : AVANT = -X (xb), extérieur = +Z (zo) ; côté 'b' par miroir
  const UA = prof([
    { y: 0, xf: 5.4, xb: 5.4, zo: 5.4, zi: 5.2 },
    { y: 6, xf: 5.7, xb: 5.9, zo: 5.9, zi: 5.5 },
    { y: 13, xf: 5.6, xb: 5.9, zo: 5.8, zi: 5.4 },
    { y: 20, xf: 5.2, xb: 5.4, zo: 5.3, zi: 5.0 },
    { y: 26, xf: 4.8, xb: 4.9, zo: 4.9, zi: 4.7 },
    { y: 33, xf: 4.5, xb: 4.5, zo: 4.5, zi: 4.4 }
  ].map(s => Object.assign({ n: 2.9 }, s)));
  const FA = prof([
    { y: 0, xf: 4.9, xb: 4.9, zo: 5.0, zi: 4.8 },
    { y: 5, xf: 5.4, xb: 5.5, zo: 5.6, zi: 5.2 },
    { y: 11, xf: 5.3, xb: 5.3, zo: 5.5, zi: 5.0 },
    { y: 18, xf: 4.6, xb: 4.6, zo: 4.8, zi: 4.4 },
    { y: 24, xf: 4.0, xb: 4.0, zo: 4.2, zi: 3.9 },
    { y: 31, xf: 3.7, xb: 3.7, zo: 3.8, zi: 3.6 }
  ].map(s => Object.assign({ n: 2.9 }, s)));
  const TH = prof([
    { y: 0, xf: 7.0, xb: 7.6, zo: 7.7, zi: 6.6 },
    { y: 6, xf: 7.9, xb: 8.7, zo: 8.5, zi: 7.2 },
    { y: 15, xf: 7.9, xb: 8.7, zo: 8.3, zi: 7.1 },
    { y: 26, xf: 7.0, xb: 7.7, zo: 7.4, zi: 6.4 },
    { y: 36, xf: 6.0, xb: 6.4, zo: 6.3, zi: 5.5 },
    { y: 44, xf: 5.3, xb: 5.5, zo: 5.5, zi: 4.8 }
  ].map(s => Object.assign({ nf: 2.6, nb: 3.0 }, s)));
  const SH = prof([
    { y: 0, xf: 5.8, xb: 6.1, zo: 5.9, zi: 5.4 },
    { y: 6, xf: 6.7, xb: 6.5, zo: 6.3, zi: 5.6 },
    { y: 16, xf: 7.1, xb: 6.1, zo: 6.1, zi: 5.4 },
    { y: 28, xf: 5.8, xb: 5.2, zo: 5.2, zi: 4.7 },
    { y: 38, xf: 4.4, xb: 4.4, zo: 4.4, zi: 4.0 },
    { y: 44, xf: 3.9, xb: 3.9, zo: 3.9, zi: 3.7 }
  ].map(s => Object.assign({ nf: 2.4, nb: 3.0 }, s)));
  // chaussure : profil le long de +X (axis 'x') ; x du profil = -Y (xf = dessous, xb = dessus)
  const FT = prof([
    { y: -8.2, xf: 1.0, xb: 3.0, z: 3.0 },
    { y: -7.6, xf: 1.0, xb: 6.6, z: 4.5 },
    { y: -5.5, xf: 1.0, xb: 8.3, z: 5.1 },
    { y: -2, xf: 1.0, xb: 8.5, z: 5.3 },
    { y: 2, xf: 1.0, xb: 7.2, z: 5.4 },
    { y: 6, xf: 1.0, xb: 5.4, z: 5.6 },
    { y: 10, xf: 1.0, xb: 4.2, z: 5.7 },
    { y: 14, xf: 1.0, xb: 3.4, z: 5.4 },
    { y: 17.4, xf: 1.0, xb: 2.6, z: 4.4 },
    { y: 19.4, xf: 0.9, xb: 1.5, z: 2.6 },
    { y: 20.1, xf: 0.6, xb: 0.5, z: 0.8 }
  ].map(s => Object.assign({ x0: 4.0, nf: 4, nb: 2.5 }, s)));
  // épaulière : profil le long de +Z (axis 'z') ; z du profil = -Y (zo = bas, zi = haut)
  const CAP = prof([
    { y: -3.5, xf: 5.5, xb: 5.9, zo: 4.3, zi: 6.3 },
    { y: 0, xf: 6.2, xb: 6.6, zo: 5.0, zi: 7.0 },
    { y: 3.4, xf: 6.2, xb: 6.6, zo: 5.0, zi: 6.8 },
    { y: 5.5, xf: 5.5, xb: 5.9, zo: 4.5, zi: 6.0 },
    { y: 6.3, xf: 3.6, xb: 3.8, zo: 3.0, zi: 3.6 }
  ].map(s => Object.assign({ n: 3.6 }, s)));

  /* ---------- zones du casque ---------- */
  const VW = 70 * D;                                                    // demi-largeur de la visière
  const VT = th => 3.2 - 0.3 * Math.pow(Math.min(1, Math.abs(th) / VW), 2);
  const VB = th => -2.4 - 2.4 * Math.pow(Math.min(1, Math.abs(th) / VW), 2.2);
  const HBOT = th => -9.8 + 3.8 * sstep((Math.abs(th) - 40 * D) / (110 * D));
  // largeur du plastron central (bleu nuit) en fonction de y
  const PW = curve([[31.5, 2.5 * D], [33, 5.2 * D], [36, 7.0 * D], [42, 8.6 * D], [48, 9.8 * D], [54, 10.8 * D]]);
  // cadre gris autour du plastron (en U)
  const PWF = curve([[29.4, 3.5 * D], [31, 8.6 * D], [34, 11.6 * D], [40, 13.4 * D], [48, 14.6 * D], [54.5, 15.6 * D]]);

  /* =========================================================
     SKINS : palette / finitions par ctx.skin ('classic' = matériaux d'origine, modèle strictement identique)
     Emplacements de matériau :
       shell (coques blanches) · shoe (dessus des chaussures) · grey (disques, cadres gris) · dark (gris foncé)
       dark2 (anthracite) · plate (plastron bleu nuit) · visor · black · seam · steel · rubber · orange (accents)
       palm / finger (main) · waist (anneaux de la taille) · logo / hot / strip (lumières : logo, arc chaud, filets LED)
       eye / tooth / socket (yeux, dents, lueur des orbites des skins à crâne)
     Valeur : paramètres de ctx.mat (+ pat/ps/rk : motif triplanaire, inner/ii : lueur interne),
              { glow, i } pour un matériau émissif, ou le nom d'un autre emplacement.
     geo : 'endo' → géométrie propre au skin (crâne à mâchoire et yeux rouges, côtes, vérins hydrauliques, câbles).
     ========================================================= */
  const SKINS = {
    // ENDOSQUELETTE : hyper-alliage chromé (plaques à joints et rivets), vérins et câbles gunmetal à nu,
    // crâne à dents et yeux rouges incandescents, noyau d'énergie rouge
    endo: {
      geo: 'endo',
      // (alliage poli-brossé sans vernis : un chrome miroir verni renvoyait les spots néon des arènes bien au-delà
      //  du seuil du bloom → grosses taches roses ; rugosité 0.36 = reflets larges, chrome encore lisible)
      shell: { color: 0xe4e8ed, pat: 'endo', ps: 1 / 22, rk: 0.5, roughness: 0.36, metalness: 0.72, envMapIntensity: 1.15 },
      shoe: 'shell', plate: 'shell', waist: 'dark',
      grey: { color: 0xc4c9d0, pat: 'brush', ps: 1 / 14, rk: 0.35, roughness: 0.36, metalness: 0.85, envMapIntensity: 1.05 },
      dark: { color: 0x44474e, pat: 'brush', ps: 1 / 14, rk: 0.3, roughness: 0.36, metalness: 0.9, envMapIntensity: 1.0 },
      dark2: { color: 0x26282c, roughness: 0.3, metalness: 0.95, envMapIntensity: 0.9 },
      black: { color: 0x0e0f11, roughness: 0.3, metalness: 0.85, envMapIntensity: 0.7 },
      steel: { color: 0xeef1f5, roughness: 0.12, metalness: 1, envMapIntensity: 1.1 },
      rubber: { color: 0x1d1e22, roughness: 0.4, metalness: 0.9, envMapIntensity: 0.7 },
      orange: 'dark2',
      palm: { color: 0x585c63, roughness: 0.26, metalness: 1, envMapIntensity: 1.1 },
      finger: 'shell',
      logo: { glow: 0xff2410, i: 2.4 }, hot: { glow: 0xff8a70, i: 1.8 }, strip: { glow: 0xff2a14, i: 1.5 },
      eye: { glow: 0xff3a1c, i: 10 }, socket: { glow: 0xff1806, i: 2.2 },   // lentille > seuil du bloom : halo rouge lisible à taille de jeu
      tooth: { color: 0xe4e8ed, roughness: 0.3, metalness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.1, envMapIntensity: 1.2 }
    },
    // REK ARÈNE : livrée de ligue de combat — coques noir laqué, disques d'articulation et plastron orange
    // anodisé, filets LED et logo orange, cœur blanc chaud
    rek: {
      shell: { color: 0x2a2c32, roughness: 0.3, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.85 },   // anthracite laqué (le noir pur disparaissait dans les arènes de nuit)
      shoe: 'shell',
      grey: { color: 0xff5f12, roughness: 0.3, metalness: 0.55, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 0.8 },
      dark: { color: 0x4a4d55, roughness: 0.34, metalness: 0.7, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.75 },
      visor: { color: 0xd8641e, roughness: 0.07, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.0 },   // visière iridium orangée
      plate: { color: 0xff5a10, roughness: 0.28, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.7 },
      logo: { glow: 0xff7a1a, i: 3.6 }, hot: { glow: 0xffe2b8, i: 3.0 }, strip: { glow: 0xff8a2a, i: 3.8 }
    }
  };

  /* ---------- motifs procéduraux (dessinés une fois, en cache module) ---------- */
  const PATS = {};
  function patTex(kind) {
    if (PATS[kind]) return PATS[kind];
    const n = 256, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const c = cv.getContext('2d'), img = c.createImageData(n, n), d = img.data;
    let r = 8800; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    const buf = new Float32Array(n * n);
    // brossage : stries horizontales raccordables (valeur par rangée + grain)
    const rows = Array.from({ length: n }, () => rnd() - 0.5);
    for (let y = 0; y < n; y++) {
      const sm = (rows[y] + 0.6 * rows[(y + 1) % n] + 0.6 * rows[(y + n - 1) % n]) / 2.2;
      for (let x = 0; x < n; x++) buf[y * n + x] = 0.9 + 0.08 * sm + 0.03 * (rnd() - 0.5);
    }
    const P = (x, y) => ((y % n + n) % n) * n + ((x % n + n) % n);
    if (kind === 'endo') {
      // joints de plaques (sombres, avec liseré clair en bord de chanfrein) + rivets le long des joints
      const hl = (y, x0, x1) => { for (let x = x0; x <= x1; x++) { buf[P(x, y)] = 0.22; buf[P(x, y + 1)] *= 0.62; buf[P(x, y - 1)] = Math.min(1.12, buf[P(x, y - 1)] * 1.16); } };
      const vl = (x, y0, y1) => { for (let y = y0; y <= y1; y++) { buf[P(x, y)] = 0.22; buf[P(x + 1, y)] *= 0.62; buf[P(x - 1, y)] = Math.min(1.12, buf[P(x - 1, y)] * 1.16); } };
      const rivet = (cx, cy) => {
        for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
          const q = Math.hypot(x, y); if (q > 3.4) continue;
          buf[P(cx + x, cy + y)] = q > 2.5 ? 0.45 : 1.18 - 0.16 * q - 0.05 * (x + y);
        }
      };
      const bands = [0, 88, 168];                     // joints horizontaux (raccord en 0 / 256)
      bands.forEach(y => hl(y, 0, n - 1));
      bands.forEach((y0, i) => {
        const y1 = i < bands.length - 1 ? bands[i + 1] : n;
        const xs = i === 0 ? [40, 150] : i === 1 ? [96, 212] : [12, 120, 188];
        xs.forEach(x => vl(x, y0 + 1, y1 - 1));
        for (let x = 10; x < n; x += 22) { rivet(x, y0 + 6); }
        xs.forEach(x => { for (let y = y0 + 14; y < y1 - 6; y += 20) rivet(x + 6, y); });
      });
    }
    // valeurs linéaires (pas d'espace sRGB) : 1 = teinte du matériau, joints ≈ 0.2
    for (let i = 0; i < n * n; i++) { const v = Math.max(0, Math.min(255, buf[i] * 255)); d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    c.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4;
    return (PATS[kind] = t);
  }
  /* ---------- matériau d'un emplacement de skin ----------
     Motif triplanaire (repère local de la pièce, unités design) : teinte × motif, rugosité plus forte dans les joints ;
     lueur interne par uniform (n'utilise pas .emissive, réservé au flash d'impact). */
  function fxMat(ctx, spec) {
    if (spec.glow != null) return ctx.glow(spec.glow, spec.i == null ? 3 : spec.i);
    const p = Object.assign({}, spec), pat = p.pat, ps = p.ps || 0.05, rk = p.rk || 0, inner = p.inner, ii = p.ii || 0;
    for (const k of ['pat', 'ps', 'rk', 'inner', 'ii']) delete p[k];
    const m = ctx.mat(p);
    if (ctx.override || (!pat && inner == null)) return m;
    const key = 't8Skin' + (pat ? 'P' : '') + (inner != null ? 'I' : '');
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
roughnessFactor = clamp(roughnessFactor + uTriR * (0.8 - dot(triC, vec3(0.333))), 0.04, 1.0);`);
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
    const { g, M, L, ch } = ctx;
    const low = ctx.lod === 'low';
    const P = {};
    const add = (parent, geo, mat, p, r, s) => ctx.add(parent, geo, mat, { p, r, s });
    const full = (key, tab, y0, y1, nu, nv, o = {}) => patch(key, Object.assign({ tab, map: band(0, 2 * PI, y0, y1), closed: true, nu, nv, c: 0, t: 0 }, o));
    // fusion de plusieurs géométries d'un même matériau : list = [[geo, échelle?]] (échelle [1,1,-1] = miroir)
    const F = (key, list) => fuse('t8F' + key, list.map(([geo, sc]) => [geo, null, null, sc || 1]));
    const MZ = [1, 1, -1];
    const sidePart = (sd, build, ly = 1) => { const part = ctx.group(), inner = ctx.group(); inner.scale.set(1, ly, sd < 0 ? -1 : 1); part.add(inner); build(inner); return part; };

    /* ---------- matériaux (skin : SKINS[ctx.skin] ; 'classic' = mêmes matériaux qu'avant → modèle identique) ---------- */
    const SKN = SKINS[ctx.skin] || null, ENDO = !!(SKN && SKN.geo === 'endo');
    const slot = {};
    const pick = (k, dflt) => { const sp = SKN && SKN[k]; return (slot[k] = sp == null ? dflt() : typeof sp === 'string' ? slot[sp] : fxMat(ctx, sp)); };
    const WH = pick('shell', () => M.shell);                                                                                   // blanc laqué
    const WH2 = pick('shoe', () => ctx.mat({ color: 0xdfe2e6, roughness: 0.3, metalness: 0.05, clearcoat: 0.9, clearcoatRoughness: 0.12, envMapIntensity: 0.5 }));
    const GR = pick('grey', () => ctx.mat({ color: 0x8e939b, roughness: 0.36, metalness: 0.32, clearcoat: 0.55, clearcoatRoughness: 0.25, envMapIntensity: 0.75 }));   // gris disques
    const DK = pick('dark', () => ctx.mat({ color: 0x62666e, roughness: 0.42, metalness: 0.2, clearcoat: 0.45, clearcoatRoughness: 0.3, envMapIntensity: 0.6 }));      // gris foncé
    const DK2 = pick('dark2', () => ctx.mat({ color: 0x3a3d44, roughness: 0.4, metalness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.6 }));
    const NV = pick('plate', () => ctx.mat({ color: 0x222a38, roughness: 0.2, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.85 }));         // plastron bleu nuit
    const VI = pick('visor', () => ctx.mat({ color: 0x15181d, roughness: 0.05, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.3 }));       // visière fumée
    const BK = pick('black', () => M.black), SE = pick('seam', () => M.seam), ST = pick('steel', () => M.steel), RU = pick('rubber', () => M.rubber);
    const OR = pick('orange', () => ctx.mat({ color: 0xff5a1e, roughness: 0.35, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.15 }));
    const HM = pick('palm', () => ctx.mat({ color: 0x777c84, roughness: 0.3, metalness: 0.82, envMapIntensity: 0.95 }));
    const FM = pick('finger', () => ctx.mat({ color: 0x969ba3, roughness: 0.28, metalness: 0.85, envMapIntensity: 1.0 }));
    const LOGO = pick('logo', () => ctx.glow(ch.accent, 3.6)), HOT = pick('hot', () => ctx.glow(0xdff1ff, 3.2)), STRIP = pick('strip', () => ctx.glow(0x9ad6ff, 3.8));
    // emplacements propres aux skins (classic : le matériau d'origine de la pièce, aucun nouveau matériau)
    const WST = pick('waist', () => DK);
    const EYE = ENDO && !low ? pick('eye', () => ctx.glow(0xff1a08, 7)) : null;
    const TT = ENDO && !low ? pick('tooth', () => ST) : null, SOCK = ENDO && !low ? pick('socket', () => ctx.glow(0xff2008, 0.45)) : null;

    /* =====================================================
       SKIN ENDOSQUELETTE : géométrie propre (crâne, côtes, vertèbres, vérins hydrauliques, câbles) — jamais en LOD bas.
       Tout est fusionné par matériau (quelques meshes par pièce).
       ===================================================== */
    const YV = new T.Vector3(0, 1, 0);
    const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
    // tige a → b (cylindre unitaire étiré) : élément pour fuse()
    const rodIt = (a, b, r, seg = 8) => {
      const va = new T.Vector3(a[0], a[1], a[2]), vb = new T.Vector3(b[0], b[1], b[2]), dd = vb.clone().sub(va), l = dd.length();
      return [g.cyl(r, r, 1, seg), null, new T.Matrix4().compose(va.add(vb).multiplyScalar(0.5), new T.Quaternion().setFromUnitVectors(YV, dd.normalize()), new T.Vector3(1, l, 1))];
    };
    // vérin : corps gunmetal (a → k) avec bagues, tige polie (k → b), embouts de chape
    const piston = (Ls, a, b, r, k = 0.55) => {
      const m = mix3(a, b, k);
      Ls.dk.push(rodIt(mix3(a, b, -0.03), m, r, 8), rodIt(mix3(a, b, k - 0.07), m, r * 1.18, 8));
      Ls.st.push(rodIt(m, mix3(a, b, 1.04), r * 0.44, 6));
    };
    const cable = (Ls, pts, r) => Ls.bk.push([g.tube(pts.map(p => p.map(v => +v.toFixed(2))), r, 8, 4)]);
    const endoAdd = (gr, key, Ls) => {
      if (Ls.dk.length) add(gr, fuse('t8En' + key + 'D', Ls.dk), DK2);
      if (Ls.st.length) add(gr, fuse('t8En' + key + 'S', Ls.st), ST);
      if (Ls.bk.length) add(gr, fuse('t8En' + key + 'B', Ls.bk), BK);
    };
    const Sd = (tab, th, y, off) => SP(tab, th * D, y, off);
    /* membres « os + vérins » : à la place des coques, deux os chromés (avant / arrière) laissent deux fenêtres
       (extérieur / intérieur) sur le noyau gunmetal enfoncé, où courent un vérin hydraulique et un câble.
       (repère de la pièce : avant = -X = theta 180°, extérieur = +Z = theta 90°) */
    const LIMB_E = {
      //    profil, os avant [th0, th1], os arrière, y0, y1, vérin [y0, y1, rayon, prof.], câble (theta ext.)
      ua: { tab: UA, f: [146, 214], b: [-34, 34], y0: 8.6, y1: 24.2, p: [6.2, 26.6, 1.15, -1.05], c: 58 },
      fa: { tab: FA, f: [148, 212], b: [-32, 32], y0: 3.4, y1: 24.8, p: [2.6, 26.0, 0.95, -0.95], c: 56 },
      th: { tab: TH, f: [134, 206], b: [-38, 38], y0: 10.2, y1: 34.6, p: [7.0, 38.0, 1.45, -1.25], c: 62 },
      sh: { tab: SH, f: [136, 224], b: [-30, 30], y0: 6.8, y1: 34.0, by1: 27.0, p: [4.2, 35.6, 1.2, -1.1], c: 60 }
    };
    function endoLimb(gr, kind) {
      if (!ENDO || low) return;
      const E = LIMB_E[kind], tab = E.tab;
      // os chromés (paroi profonde jusqu'au noyau)
      const bf = patch('t8EnB' + kind + 'F', { tab, map: band(E.f[0] * D, E.f[1] * D, E.y0, E.y1), nu: 6, nv: 6, off: 0.15, c: 0.5, t: 2.5 });
      const bb = patch('t8EnB' + kind + 'B', { tab, map: band(E.b[0] * D, E.b[1] * D, E.y0, E.by1 || E.y1), nu: 6, nv: 6, off: 0.15, c: 0.5, t: 2.5 });
      add(gr, F('enBone' + kind, [[bf], [bb]]), WH);
      // vérins (fenêtres extérieure et intérieure) + câbles
      const Ls = { dk: [], st: [], bk: [] }, p = E.p;
      for (const th of [90, 270]) {
        piston(Ls, Sd(tab, th, p[0], p[3]), Sd(tab, th, p[1], p[3]), p[2], 0.56);
        const tc = th === 90 ? E.c : 360 - E.c, yl = E.y0 + 0.8, yh = (E.by1 || E.y1) - 0.8;
        cable(Ls, [Sd(tab, tc, yl - 2.5, -0.2), Sd(tab, tc + 4, yl + 2, -1.3), Sd(tab, tc + 4, yh - 2, -1.3), Sd(tab, tc, yh + 2.5, -0.2)], 0.48);
      }
      endoAdd(gr, kind, Ls);
    }

    /* =====================================================
       LOD bas (images rémanentes)
       ===================================================== */
    if (low) {
      const torso = ctx.group();
      add(torso, full('t8LoTB', TB, 20.5, 63.0, 10, 5, { capB: true }), WH);
      add(torso, full('t8LoWB', WB, 12, 24, 8, 2), DK);
      add(torso, full('t8LoPB', PB, -11, 15.5, 8, 3, { capB: true }), WH);
      P.torso = torso;
      P.neck = ctx.group(ctx.mesh(g.cyl(4, 4.4, L.nk, 8), DK, { p: [0, L.nk / 2, 0] }));
      P.head = ctx.group(ctx.mesh(full('t8LoHD', HEAD, -9.8, 11.4, 12, 6, { capB: true }), WH));
      for (const [sd, z] of [['f', 1], ['b', -1]]) {
        P[sd + 'ua'] = ctx.group(ctx.mesh(full('t8LoUA', UA, 0, 33, 8, 2), WH, { s: [1, L.ua / 33, 1] }));
        P[sd + 'fa'] = ctx.group(ctx.mesh(full('t8LoFA', FA, 0, 31, 8, 2), WH, { s: [1, L.fa / 31, 1] }));
        P[sd + 'th'] = ctx.group(ctx.mesh(full('t8LoTH', TH, 0, 44, 8, 3), WH, { s: [1, L.th / 44, 1] }));
        P[sd + 'sh'] = ctx.group(ctx.mesh(full('t8LoSH', SH, 0, 44, 8, 3), WH, { s: [1, L.sh / 44, 1] }));
        P[sd + 'kn'] = ctx.group(ctx.mesh(g.cyl(5.9, 5.9, 12, 10, 'z'), GR));
        P[sd + 'el'] = ctx.group(ctx.mesh(g.cyl(4.6, 4.6, 10, 10, 'z'), GR));
        P[sd + 'hi'] = ctx.group(ctx.mesh(g.cyl(5.8, 5.8, 11, 10, 'z'), GR));
        P[sd + 'sc'] = ctx.group(ctx.mesh(full('t8LoCAP', CAP, -3.5, 6.3, 8, 3, { axis: 'z' }), WH, { s: [1, 1, z] }));
        P[sd + 'fo'] = ctx.group(ctx.mesh(g.cbox(28, 9, 11, 2.4), WH, { p: [5.8, -2.6, 0] }));
        P[sd + 'ha'] = RK.hand(ctx, { side: z, palm: [8, 3, 7.2], palmMat: HM, fingerMat: FM });
      }
      return { parts: P, shZ: 21.5, hpZ: 11 };
    }

    /* =====================================================
       TORSE : bassin, taille, buste, épaules
       ===================================================== */
    const torso = ctx.group();
    {
      /* --- bassin : noyau sombre, slip blanc (logo triangle), lobes de hanche blancs --- */
      add(torso, full('t8PBcore', PB, -11, 15.5, 18, 6, { capB: true, off: -0.6 }), DK);
      const BW = curve([[-10.6, 16 * D], [-7, 28 * D], [-2, 42 * D], [3, 52 * D], [8, 58 * D], [11, 60 * D]]);
      const briefMap = (u, v) => { const s = u * 2 - 1, yt = 4.0 + 6.4 * Math.pow(Math.abs(s), 1.6), y = lerp(-10.6, yt, v); return [s * BW(y), y]; };
      add(torso, patch('t8Brief', { tab: PB, map: briefMap, nu: 16, nv: 8, off: 0.45, c: 0.45, t: 1.4 }), WH);
      const BBW = curve([[-9.6, 18 * D], [-5, 34 * D], [2, 48 * D], [10, 54 * D]]);
      add(torso, patch('t8PBback', { tab: PB, map: shield(-9.6, 10, BBW, PI), nu: 12, nv: 7, off: 0.45, c: 0.45, t: 1.4 }), WH);
      const lobe = patch('t8PBlobe', { tab: PB, map: band(63 * D, 117 * D, -4.6, 12.6), nu: 8, nv: 6, off: 0.45, c: 0.45, t: 1.4 });
      add(torso, F('lobes', [[lobe], [lobe, MZ]]), WH);
      // logo triangle (contour noir, cœur blanc)
      const fp = SP(PB, 0, -1.2, 0.45);
      if (!ENDO) add(torso, g.prism([[-2.6, 1.7], [2.6, 1.7], [0, -2.6]], 0.6, 0.15), BK, [fp[0] + 0.15, -1.2, 0], [0, PI / 2, 0]);
      if (!ENDO) add(torso, g.prism([[-1.45, 1.05], [1.45, 1.05], [0, -1.35]], 0.6, 0.12), WH, [fp[0] + 0.3, -1.2, 0], [0, PI / 2, 0]);
      // ceinture grise (jonction bassin / taille)
      add(torso, full('t8Belt', WB, 13.4, 15.6, 24, 1, { off: 0.25, c: 0.3, t: 0.9 }), GR);

      /* --- taille gris foncé segmentée --- */
      add(torso, full('t8WBcore', WB, 12, 24, 12, 2, { off: -0.6 }), SE);
      add(torso, F('waist', [[full('t8WBb1', WB, 16.1, 19.0, 24, 2, { c: 0.45, t: 1.3 })], [full('t8WBb2', WB, 19.6, 22.6, 24, 2, { c: 0.45, t: 1.3 })]]), WST);

      /* --- buste --- */
      add(torso, full('t8TBcore', TB, 20.5, 63.0, 12, 5, { off: -0.8, capB: true }), SE);
      // abdomen gris foncé (coupe)
      if (ENDO) add(torso, patch('t8AbdE', { tab: TB, map: band(0, 2 * PI, 20.5, 50), closed: true, nu: 24, nv: 8, off: -0.7, c: 0.55, t: 1.4 }), DK);
      else add(torso, patch('t8Abd', { tab: TB, map: band(0, 2 * PI, 20.5, 50), closed: true, nu: 24, nv: 8, c: 0.55, t: 1.4 }), DK);
      // plastron central bleu nuit
      add(torso, patch('t8Plate', { tab: TB, map: shield(31.5, 52.9, PW), nu: 10, nv: 10, off: 0.85, c: 0.45, t: 1.7 }), NV);
      // pectoraux blancs (bord inférieur en diagonale, filet LED dessous)
      const VN = y => lerp(13.5 * D, 34 * D, clamp01((y - 57.2) / 5.8));          // col en V gris foncé
      const pecIn = y => Math.max(PWF(Math.min(y, 53.4)) + 1.7 * D, VN(y) + 1.8 * D);
      const pecBot = u => lerp(39.5, 45.5, Math.pow(u, 0.75));
      const PEC_O = 117 * D;
      const pecMap = (u, v) => { const y = lerp(pecBot(u), 63.0, v); return [lerp(pecIn(y), PEC_O, u), y]; };
      const pec = patch('t8Pec', { tab: TB, map: pecMap, nu: 14, nv: 9, off: 0.95, c: 0.55, t: 1.9 });
      add(torso, patch('t8PlateFrame', { tab: TB, map: shield(29.4, 53.4, PWF), nu: 12, nv: 10, off: 0.45, c: 0.4, t: 1.3 }), GR);
      add(torso, F('pecs', [[pec], [pec, MZ]]), WH);
      // col blanc (au-dessus de la fente) + empiècement dorsal
      add(torso, patch('t8Collar', { tab: TB, map: band(-15.7 * D, 15.7 * D, 54.7, 56.9), nu: 4, nv: 2, off: 0.95, c: 0.45, t: 1.9 }), WH);
      add(torso, patch('t8VNeck', { tab: TB, map: shield(57.3, 63.0, VN), nu: 8, nv: 5, off: 0.5, c: 0.4, t: 1.4 }), DK);
      add(torso, patch('t8BackYoke', { tab: TB, map: band(119.5 * D, 240.5 * D, 56.4, 63.0), nu: 22, nv: 5, off: 0.6, c: 0.5, t: 1.5 }), WH);
      // fente noire laquée sous le col
      add(torso, patch('t8Slot', { tab: TB, map: band(-15.2 * D, 15.2 * D, 53.3, 54.4), nu: 6, nv: 2, off: 0.75, c: 0.2, t: 0.9 }), BK);
      // flancs gris
      const side = patch('t8Flank', { tab: TB, map: band(120 * D, 139 * D, 36, 55.9), nu: 6, nv: 7, off: 0.45, c: 0.45, t: 1.3 });
      add(torso, F('flanks', [[side], [side, MZ]]), GR);
      // dos : omoplates blanches, colonne sombre, boîtier batterie
      const blade = patch('t8Blade', { tab: TB, map: band(142 * D, 175 * D, 33, 55.9), nu: 8, nv: 7, off: 0.6, c: 0.5, t: 1.5 });
      add(torso, F('blades', [[blade], [blade, MZ]]), WH);
      add(torso, F('backDk', [[patch('t8Spine', { tab: TB, map: band(177.5 * D, 182.5 * D, 31, 55.6), nu: 2, nv: 8, off: 0.35, c: 0.3, t: 1.0 })],
        [patch('t8Batt', { tab: TB, map: band(150 * D, 210 * D, 23.2, 31.2), nu: 12, nv: 5, off: 0.55, c: 0.45, t: 1.4 })]]), DK2);
      // joints / fentes du buste (tous en noir mat, fusionnés)
      const torsoSeams = [];
      for (let i = 0; i < 4; i++) torsoSeams.push([patch('t8BattV' + i, { tab: TB, map: band(162 * D, 198 * D, 24.6 + i * 1.6, 25.2 + i * 1.6), nu: 6, nv: 1, off: 0.62, c: 0.1, t: 0.4 })]);
      // filets LED (bord inférieur des pectoraux)
      const ledPts = [];
      for (let i = 0; i <= 12; i++) { const u = 0.02 + 0.93 * i / 12, th = lerp(pecIn(pecBot(u)), PEC_O, u); ledPts.push(SP(TB, th, pecBot(u) - 0.55, 0.75)); }
      const ledG = g.tube(ledPts, 0.44, 20, 5);
      if (!ENDO) add(torso, F('leds', [[ledG], [ledG, MZ]]), STRIP);   // (endosquelette : ni filets LED ni logo — seuls les yeux brillent, comme au cinéma)
      // logo circulaire lumineux (anneau + arc + point)
      if (!ENDO) {
        const lp = SP(TB, 0, 45.4, 0.85);
        const lg = ctx.group(); lg.position.set(lp[0] - 0.05, lp[1], lp[2]); lg.rotation.z = 0.06; torso.add(lg);
        add(lg, g.ccyl(4.5, 0.6, 0.2, 24, 'x'), BK, [0.2, 0, 0]);
        add(lg, g.torus(3.35, 0.42, 32, 5, PI * 2, 'x'), LOGO, [0.45, 0, 0]);
        add(lg, g.torus(2.0, 0.36, 24, 5, PI * 1.45, 'x'), HOT, [0.5, 0, 0], [0.9, 0, 0]);
        add(lg, g.ccyl(0.9, 0.4, 0.15, 14, 'x'), LOGO, [0.55, 0, 0]);
      }
      // grille sous le plastron + marquage
      for (let i = 0; i < 3; i++) torsoSeams.push([patch('t8Grl' + i, { tab: TB, map: band(-12 * D, 12 * D, 27.4 + i * 1.15, 27.9 + i * 1.15), nu: 6, nv: 1, off: 0.12, c: 0.1, t: 0.5 })]);
      torsoSeams.push([patch('t8AbdSeam', { tab: TB, map: band(0, 2 * PI, 23.6, 24.0), closed: true, nu: 28, nv: 1, off: 0.06, c: 0, t: 0.3 })]);
      // joints de panneaux de l'abdomen (flancs)
      {
        const sv = patch('t8AbdSeamV', { tab: TB, map: band(95.5 * D, 96.5 * D, 22.2, 43.6), nu: 1, nv: 6, off: 0.05, c: 0, t: 0.35 });
        const sh = patch('t8AbdSeamH', { tab: TB, map: band(58 * D, 118 * D, 30.6, 31.0), nu: 8, nv: 1, off: 0.05, c: 0, t: 0.35 });
        torsoSeams.push([sv], [sv, MZ], [sh], [sh, MZ]);
        add(torso, F('torsoSeams', torsoSeams), SE);
        add(torso, fuse('t8AbdBolts', [[96, 25.2], [96, 41], [72, 33], [116, 33]].flatMap(([a, y]) => [1, -1].map(zz => [g.cyl(0.42, 0.42, 0.5, 6), null, mul(MT([0, 0, 0], [0, 0, 0], [1, 1, zz]), frame(TB, a * D, y, 0.1))]))), ST);
      }
      // étiquette du haut du buste (texte stylisé)
      add(torso, fuse('t8Label', [-1.95, -1.17, -0.39, 0.39, 1.17, 1.95].map((zz, i) => [g.box(0.5 + (i % 2) * 0.12, 0.2, 0.7), null, frame(TB, zz / 10.5, 55.8, 0.97)])), DK2);
      // emboîtures d'épaule + collerette du cou
      add(torso, fuse('t8Sockets', [1, -1].map(z => [g.ccyl(5.4, 4, 0.8, 16, 'z'), [0, 51.6, z * 15.6]])), DK2);
      add(torso, g.ccyl(6.4, 2.0, 0.6, 24), DK, [0, 62.0, 0]);
      add(torso, g.ccyl(5.2, 0.9, 0.3, 24), GR, [0, 63.3, 0]);
      /* --- ENDOSQUELETTE : cage thoracique chromée, vertèbres dorsales, vérins abdominaux --- */
      if (ENDO) {
        const torsoSeamsE = [];
        const rib = (key, y0) => patch(key, { tab: TB, map: (u, v) => { const th = lerp(PWF(y0) + 3 * D, 116 * D, u); return [th, y0 - 1.6 * Math.pow(1 - u, 1.6) + v * 1.55]; }, nu: 12, nv: 1, off: 0.8, c: 0.4, t: 1.5 });
        // côtes basses : deux demi-arcs (la colonne lombaire reste visible au centre)
        const ribL = (key, y0) => patch(key, { tab: TB, map: (u, v) => { const th = lerp(13 * D, 116 * D, u); return [th, y0 - 1.4 * Math.pow(1 - u, 1.5) + v * 1.5]; }, nu: 12, nv: 1, off: 0.75, c: 0.4, t: 2.4 });
        const r1 = rib('t8EnRib1', 31.8), r2 = rib('t8EnRib2', 35.2), r3 = rib('t8EnRib3', 38.6), l1 = ribL('t8EnRibL1', 25.0), l2 = ribL('t8EnRibL2', 28.3);
        add(torso, F('enRibs', [[r1], [r1, MZ], [r2], [r2, MZ], [r3], [r3, MZ], [l1], [l1, MZ], [l2], [l2, MZ]]), WH);
        // sternum segmenté (le plastron chromé devient un sternum à 4 segments)
        torsoSeamsE.push(...[36.2, 40.6, 45.0, 49.2].map((y, i) => [patch('t8EnStern' + i, { tab: TB, map: band(-PW(y) - 0.5 * D, PW(y) + 0.5 * D, y, y + 0.55), nu: 6, nv: 1, off: 0.92, c: 0.08, t: 0.5 })]));
        add(torso, F('enStern', torsoSeamsE), SE);
        add(torso, fuse('t8EnVert', Array.from({ length: 8 }, (_, i) => [g.cbox(3.6, 1.6, 2.1, 0.4), null, frame(TB, PI, 32.4 + i * 2.95, 0.7)])), WH);
        // colonne avant (vertèbres lombaires visibles dans l'abdomen ouvert, du bassin au plastron)
        add(torso, fuse('t8EnLumb', [12.6, 14.8, 17.0, 19.2, 21.4, 23.6, 25.8, 28.0, 30.2].map(y => [g.cbox(3.4, 1.9, 1.7, 0.45), null, y < 21 ? frame(WB, 0, y, 0.5) : frame(TB, 0, y, -0.25)])), WH);
        const Ls = { dk: [], st: [], bk: [] };
        for (const zz of [1, -1]) {
          const M3 = p => [p[0], p[1], p[2] * zz];
          piston(Ls, M3(SP(TB, 74 * D, 41.2, 1.1)), M3(SP(PB, 72 * D, 9.0, 1.1)), 0.95, 0.5);
          cable(Ls, [SP(TB, 104 * D, 40.5, 0.9), SP(TB, 102 * D, 30, 1.4), SP(WB, 98 * D, 18, 1.8), SP(PB, 100 * D, 8.0, 0.9)].map(M3), 0.5);
        }
        endoAdd(torso, 'Torso', Ls);
      }
    }
    P.torso = torso;

    /* =====================================================
       COU : colonne gris foncé, bagues, plaque de gorge
       ===================================================== */
    {
      const n = ctx.group();
      add(n, g.ccyl(3.7, 14, 0.7, 16), DK, [0, 8, 0]);
      add(n, g.ccyl(4.9, 2.4, 0.6, 24), DK2, [0, 1.4, 0]);
      for (let i = 0; i < 3; i++) add(n, g.ccyl(4.0, 0.8, 0.25, 16), GR, [0, 4.6 + i * 2.6, 0]);
      add(n, g.prism([[2.4, 1.6], [5.2, 2.2], [4.6, 10.0], [2.2, 11.4]], 6.4, 0.6), DK2);
      for (const z of [1, -1]) add(n, g.cyl(0.55, 0.55, 11, 8), ST, [-3.0, 7.5, z * 2.2], [0, 0, 0.12]);
      add(n, g.ccyl(3.0, 8.2, 0.6, 12, 'z'), DK2, [0, 14.6, 0]);
      if (ENDO) { // vérins de cou (avant) + câbles (arrière)
        const Ls = { dk: [], st: [], bk: [] };
        for (const zz of [1, -1]) {
          piston(Ls, [2.6, 1.8, 3.6 * zz], [2.1, 13.2, 3.0 * zz], 0.6, 0.5);
          cable(Ls, [[-2.7, 0.8, 3.5 * zz], [-3.9, 7, 3.7 * zz], [-2.8, 13.6, 2.6 * zz]], 0.5);
        }
        endoAdd(n, 'Neck', Ls);
      }
      P.neck = n;
    }

    /* =====================================================
       TÊTE : casque blanc, visière fumée, mentonnière en V, oreillettes grises, crête
       (skin ENDOSQUELETTE : crâne chromé à la place du casque)
       ===================================================== */
    if (ENDO) {
      /* crâne propre (profil SK) : boîte crânienne chromée à joints, arcade froncée très saillante au-dessus
         d'orbites profondes (noyau noir), yeux rouges incandescents sertis d'acier, arête nasale, cavité nasale
         en poire, pommettes et arcades zygomatiques, maxillaire + deux rangées de dents, joues ouvertes
         (vérins de mâchoire visibles), mandibule en U à branches montantes et charnières */
      const h = ctx.group();
      const A = th => Math.abs(th);
      const dome = (y0, y1) => (u, v) => { const th = u * 2 * PI - PI; return [th, lerp(fv(y0, th), y1, Math.sin(v * PI / 2))]; };
      add(h, full('t8SkCore', SK, -11.2, 11.45, 18, 10, { off: -0.7, capB: true }), SE);
      const EI = 9.5 * D, EO = 45 * D, EB = -2.55, EC = 27.5 * D, EY = -0.6;                 // orbite : bords int. / ext., bas, centre
      const eyeT = th => clamp01((A(th) - EI) / (EO - EI));
      // bas de l'arcade : glabelle basse (froncement), arc au-dessus de chaque orbite, retombée vers la tempe
      const BROW = th => { const a = A(th); return a < EI ? 0.55 + 0.35 * a / EI : a < EO ? 0.9 + 0.95 * Math.sin(eyeT(th) * PI * 0.92) : 1.02 + 0.6 * sstep((a - EO) / (20 * D)); };
      // haut de la pommette : arrondit le bas de l'orbite
      const EBc = th => EB - 0.25 - 0.55 * Math.sin(eyeT(th) * PI);
      const CRB = th => {                                                                        // bas de la boîte crânienne
        const a = A(th);
        if (a < 48 * D) return BROW(th) + 1.95;
        if (a < 66 * D) return lerp(BROW(48 * D) + 1.95, -2.45, sstep((a - 48 * D) / (18 * D)));
        if (a < 102 * D) return -2.45;                                                          // tempe : jusqu'à l'arcade zygomatique
        if (a < 124 * D) return lerp(-2.45, -4.9, sstep((a - 102 * D) / (22 * D)));             // derrière la charnière (os temporal)
        return lerp(-4.9, -5.4, sstep((a - 124 * D) / (40 * D)));
      };
      const NOSE = y => lerp(8.8 * D, 2.4 * D, clamp01((y + 4.75) / 2.2));                     // demi-largeur de la cavité nasale
      const JT = th => { const a = A(th); return a < 40 * D ? -8.5 : lerp(-8.5, -7.7, sstep((a - 40 * D) / (18 * D))); };
      const JB = th => -11.0 + 2.8 * sstep((A(th) - 24 * D) / (66 * D));
      const skull = [], skullSE = [], dk = [], st = [], teeth = [];
      skull.push([full('t8SkCran', SK, 0, 0, 32, 9, { c: 0.4, t: 1.1, map: dome(CRB, 11.45) })]);
      skull.push([patch('t8SkBrow', { tab: SK, map: band(-64 * D, 64 * D, BROW, th => BROW(th) + 2.0), nu: 22, nv: 2, off: 1.15, c: 0.5, t: 2.0 })]);
      skull.push([patch('t8SkBridge', { tab: SK, map: band(-EI, EI, EB - 0.2, th => BROW(th) + 0.3), nu: 4, nv: 4, off: 0.8, c: 0.35, t: 1.6 })]);
      skull.push([patch('t8SkMax', { tab: SK, map: band(-46 * D, 46 * D, -5.25, -4.7), nu: 14, nv: 1, off: 0.75, c: 0.2, t: 1.4 })]);
      const rim = patch('t8SkRim', { tab: SK, map: band(EO, 64 * D, EB - 0.2, th => BROW(th) + 0.4), nu: 4, nv: 4, off: 1.0, c: 0.4, t: 1.8 });
      const cheek = patch('t8SkCheek', { tab: SK, map: (u, v) => { const th = lerp(NOSE(lerp(-4.75, EB, v)), 74 * D, u); return [th, lerp(-4.75, EBc(th), v)]; }, nu: 14, nv: 3, off: 0.8, c: 0.4, t: 1.6 });
      const zyg = patch('t8SkZyg', { tab: SK, map: band(73 * D, 102 * D, -3.75, -2.55), nu: 6, nv: 1, off: 0.65, c: 0.3, t: 1.3 });
      // plaques temporales en relief (tempes carrées, casse la rondeur du dôme ; bord haut = joint de tempe)
      const tplate = patch('t8SkTplate', { tab: SK, map: band(64 * D, 140 * D, -1.95, th => 1.95 + 2.4 * Math.sin(clamp01((th - 66 * D) / (84 * D)) * PI)), nu: 10, nv: 3, off: 0.42, c: 0.38, t: 1.1 });
      skull.push([rim], [rim, MZ], [cheek], [cheek, MZ], [zyg], [zyg, MZ], [tplate], [tplate, MZ]);
      // mandibule squelettique : arc en U à l'avant, corps fin + branche montante vers la charnière (joue ouverte :
      // le vérin de mâchoire reste visible entre pommette et mandibule)
      skull.push([patch('t8SkJaw', { tab: SK, map: (u, v) => { const th = lerp(-58 * D, 58 * D, u); return [th, lerp(JB(th), JT(th), v)]; }, nu: 20, nv: 4, off: 0.9, c: 0.5, t: 1.8 })]);
      const jbar = patch('t8SkJawBar', { tab: SK, map: (u, v) => { const th = lerp(52 * D, 86 * D, u); return [th, lerp(JB(th), JB(th) + 1.8, v)]; }, nu: 6, nv: 1, off: 0.9, c: 0.45, t: 1.6 });
      const ramus = patch('t8SkRamus', { tab: SK, map: band(80 * D, 96 * D, JB, -4.5), nu: 3, nv: 4, off: 0.9, c: 0.45, t: 1.6 });
      skull.push([jbar], [jbar, MZ], [ramus], [ramus, MZ]);
      add(h, F('skull', skull), WH);
      // joints du crâne (sagittal avant / arrière, tempes)
      skullSE.push([patch('t8SkSag', { tab: SK, map: band(-0.8 * D, 0.8 * D, BROW(0) + 2.4, 11.2), nu: 1, nv: 6, off: 0.06, c: 0.08, t: 0.4 })]);
      skullSE.push([patch('t8SkSagB', { tab: SK, map: band(PI - 0.8 * D, PI + 0.8 * D, -5.0, 11.2), nu: 1, nv: 8, off: 0.06, c: 0.08, t: 0.4 })]);
      const tmp = patch('t8SkTemple', { tab: SK, map: (u, v) => { const th = lerp(66 * D, 150 * D, u); return [th, 2.4 + 2.4 * Math.sin(u * PI) + (v - 0.5) * 0.45]; }, nu: 10, nv: 1, off: 0.06, c: 0.08, t: 0.4 });
      skullSE.push([tmp], [tmp, MZ]);
      add(h, F('skullSE', skullSE), SE);
      // dents : deux rangées longues (acier poli), interstices sombres (noyau du crâne)
      for (let i = 0; i < 6; i++) for (const sg of [1, -1]) {
        teeth.push([g.box(0.8, 1.5, 1.55), null, frame(SK, sg * (3.2 + 6.3 * i) * D, -6.0, 0.15)]);
        teeth.push([g.box(0.78, 1.5, 1.5), null, frame(SK, sg * (3.2 + 6.1 * i) * D, -7.62, 0.15)]);
      }
      // charnières de mâchoire (disques chromés à moyeu sombre) + petits vérins pommette → mandibule (joues ouvertes)
      for (const sg of [1, -1]) {
        const fr = frame(SK, sg * 90 * D, -4.4, 0.95);
        st.push([g.ccyl(1.9, 1.0, 0.3, 14), null, fr], [g.cyl(0.45, 0.45, 1.5, 6), null, mul(fr, MT([0, 0.45, 0]))]);
        dk.push([g.ccyl(1.2, 1.1, 0.25, 12), null, mul(fr, MT([0, 0.12, 0]))]);
        const Ls = { dk, st, bk: [] };
        piston(Ls, Sd(SK, sg * 62, -3.3, 0.1), Sd(SK, sg * 60, -8.6, 0.55), 0.42, 0.5);
        // yeux : lunette d'acier sombre qui cercle la lentille rouge (pas de cible : rouge uniquement à l'intérieur)
        dk.push([g.torus(1.66, 0.22, 18, 4, PI * 2, 'y'), null, frame(SK, sg * EC, EY, -0.66)]);
      }
      add(h, fuse('t8SkSt', st), ST);
      add(h, fuse('t8SkTeeth', teeth), TT);
      add(h, fuse('t8SkDk', dk), DK2);
      // œil : noyau incandescent (blanc-rouge sous le bloom) au centre d'une lentille rouge pleine, sertie par la lunette
      add(h, fuse('t8SkEyes', [1, -1].map(sg => [g.sphere(0.6, 12, 8), SP(SK, sg * EC, EY, -1.0)])), EYE);
      add(h, fuse('t8SkSocket', [1, -1].map(sg => [g.sphere(1.48, 16, 8, 0, PI * 2, 0, PI / 2), null, mul(frame(SK, sg * EC, EY, -1.15), MT([0, 0, 0], [0, 0, 0], [1, 0.34, 1]))])), SOCK);
      P.head = ctx.group(h);
    } else {
      const h = ctx.group();
      const dome = (y0, y1) => (u, v) => { const th = u * 2 * PI - PI; return [th, lerp(fv(y0, th), y1, Math.sin(v * PI / 2))]; };
      add(h, full('t8HDcore', HEAD, -9.8, 11.4, 16, 6, { off: -0.6, capB: true, map: dome(-9.8, 11.4) }), SE);
      const headWH = [[full('t8HDshell', HEAD, 0, 0, 36, 12, { c: 0.4, t: 1.0, map: dome(HBOT, 11.4) })]], headSE = [];
      // visière (verre fumé en relief) + arcade au-dessus
      add(h, patch('t8Visor', { tab: HEAD, map: band(-VW, VW, VB, VT), nu: 22, nv: 4, off: 0.45, c: 0.3, t: 1.2 }), VI);
      headWH.push([patch('t8Brow', { tab: HEAD, map: band(-VW - 5 * D, VW + 5 * D, th => VT(th) + 0.1, th => VT(th) + 2.1), nu: 22, nv: 2, off: 1.25, c: 0.45, t: 1.9 })]);
      // mentonnière (V)
      const chinMap = (u, v) => { const w = lerp(19 * D, VW + 4 * D, Math.pow(v, 0.85)), th = lerp(-w, w, u); return [th, lerp(HBOT(th) + 0.3, VB(th) - 0.35, v)]; };
      headWH.push([patch('t8Chin', { tab: HEAD, map: chinMap, nu: 16, nv: 8, off: 0.7, c: 0.45, t: 1.7 })]);
      headWH.push([patch('t8ChinRidge', { tab: HEAD, map: band(-2.4 * D, 2.4 * D, th => HBOT(th) + 0.6, -5.2), nu: 2, nv: 5, off: 1.15, c: 0.3, t: 1.2 })]);
      add(h, patch('t8ChinNotch', { tab: HEAD, map: band(-3.2 * D, 3.2 * D, -4.7, th => VB(th) - 0.5), nu: 2, nv: 2, off: 0.85, c: 0.12, t: 0.7 }), DK2);
      for (const z of [1, -1]) for (let i = 0; i < 2; i++) {
        const k = 't8ChinV' + i;
        const vg = patch(k, { tab: HEAD, map: slant(22 * D + i * 7 * D, -7.0 + i * 0.6, 4.5 * D, 0.55, 1.6), nu: 2, nv: 1, off: 0.8, c: 0.1, t: 0.5 });
        headSE.push([vg, [1, 1, z]]);
      }
      // oreillettes grises à fentes
      const ear = patch('t8Ear', { tab: HEAD, map: band(79 * D, 122 * D, th => -6.4 + 2.4 * (th - 79 * D) / (43 * D), th => 1.9 - 2.6 * sstep((th - 92 * D) / (30 * D))), nu: 10, nv: 6, off: 0.35, c: 0.35, t: 1.0 });
      add(h, F('ears', [[ear], [ear, MZ]]), GR);
      for (const z of [1, -1]) for (let i = 0; i < 3; i++) headSE.push([patch('t8EarV' + i, { tab: HEAD, map: slant(95 * D + i * 6 * D, -2.4, 4 * D, 0.55, 3.2), nu: 2, nv: 1, off: 0.45, c: 0.1, t: 0.5 }), [1, 1, z]]);
      // crête (dessus) avec fente noire au front
      {
        const pts = [], inn = [];
        const N = 16;
        for (let i = 0; i <= N; i++) {
          const a = lerp(28 * D, 172 * D, i / N);           // angle depuis l'avant (dans le plan XY)
          // point du profil dans ce plan (bissection sur y le long du rayon)
          let r0 = 0, r1 = 16;
          for (let it = 0; it < 24; it++) {
            const r = (r0 + r1) / 2, x = Math.cos(a) * r, y = Math.sin(a) * r + 0.4;
            const th = x >= 0 ? 0 : PI, s = SP(HEAD, th, y, 0);
            if (Math.abs(x) < Math.abs(s[0]) && y < 11.4) r0 = r; else r1 = r;
          }
          const r = (r0 + r1) / 2, hgt = lerp(0.95, 0.45, i / N);
          pts.push([Math.cos(a) * (r + hgt), Math.sin(a) * (r + hgt) + 0.4]);
          inn.push([Math.cos(a) * (r - 1.6), Math.sin(a) * (r - 1.6) + 0.4]);
        }
        const poly = pts.concat(inn.reverse()).map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]);
        headWH.push([g.prism(poly, 6.4, 0.6)]);
        // fente noire à l'avant de la crête (rayon mesuré sur le contour)
        const a0 = 60 * D, k0 = (a0 - 28 * D) / (144 * D) * N, i0 = Math.floor(k0), f0 = k0 - i0;
        const rr = lerp(Math.hypot(pts[i0][0], pts[i0][1] - 0.4), Math.hypot(pts[i0 + 1][0], pts[i0 + 1][1] - 0.4), f0);
        add(h, g.cbox(0.7, 4.4, 4.8, 0.2), BK, [Math.cos(a0) * (rr + 0.05), Math.sin(a0) * (rr + 0.05) + 0.4, 0], [0, 0, a0]);
      }
      // bandes grises obliques (haut des flancs du casque)
      for (const z of [1, -1]) for (let i = 0; i < 2; i++) headSE.push([patch('t8HSlit' + i, { tab: HEAD, map: slant(50 * D + i * 9 * D, 7.6 - i * 0.4, 9 * D, 0.7, -2.4), nu: 3, nv: 1, off: 0.2, c: 0.12, t: 0.6 }), [1, 1, z]]);
      // nervures latérales du dessus
      { const fin = patch('t8Fin', { tab: HEAD, map: band(28 * D, 40 * D, 6.2, 9.6), nu: 3, nv: 4, off: 0.5, c: 0.3, t: 1.0 }); headWH.push([fin], [fin, MZ]); }
      // fentes arrière
      for (let i = 0; i < 3; i++) headSE.push([patch('t8BackV' + i, { tab: HEAD, map: band(PI - 14 * D, PI + 14 * D, -1.0 - i * 1.3, -0.45 - i * 1.3), nu: 4, nv: 1, off: 0.1, c: 0.1, t: 0.5 })]);
      add(h, F('headWH', headWH), WH);
      add(h, F('headSE', headSE), SE);
      // menton (dessous sombre)
      add(h, g.cbox(8, 2.6, 9.6, 1), DK2, [3.4, -9.4, 0]);
      P.head = ctx.group(h);
    }

    /* =====================================================
       MAIN : paume grise métallique, dos gris, 5 doigts articulés (contrat de RK.hand)
       ===================================================== */
    const PALM_L = 7.0, PALM_T = 2.9, FL = [3.4, 2.5, 2.0], FW = 1.6, FTH = [2.1, 1.95, 1.75];
    const phal = (Lp, t, w, tip) => fuse(`t8Phal${Lp},${t},${w},${tip}`, [
      [g.cbox(Lp, t, w, 0.42), [Lp / 2, 0, 0]],
      [g.cyl(t * 0.5, t * 0.5, w * 0.94, 8, 'z'), [0, 0, 0]],
      ...(tip ? [[g.cyl(t * 0.46, t * 0.46, w * 0.9, 8, 'z'), [Lp - 0.1, -0.05, 0]]] : [])
    ]);
    function t8Hand(side) {
      const root = ctx.group();
      add(root, g.ccyl(2.2, 2.6, 0.4, 14, 'x'), DK, [1.0, 0, 0]);
      add(root, g.ccyl(2.7, 0.9, 0.3, 14, 'x'), GR, [2.3, 0, 0]);
      const palm = g.shape('t800Palm', sh => {
        sh.moveTo(2.4, -2.9); sh.lineTo(2.6 + PALM_L - 0.6, -3.65); sh.quadraticCurveTo(2.6 + PALM_L, -3.65, 2.6 + PALM_L, -3.1);
        sh.lineTo(2.6 + PALM_L, 3.1); sh.quadraticCurveTo(2.6 + PALM_L, 3.65, 2.6 + PALM_L - 0.6, 3.65); sh.lineTo(2.4, 2.9); sh.lineTo(2.4, -2.9);
      }, PALM_T, 0.55, 3);
      add(root, palm, HM, [0, 0, 0], [PI / 2, 0, 0]);
      add(root, palm, GR, [0.3, 1.1, 0], [PI / 2, 0, 0], [0.92, 0.8, 0.45]);
      add(root, g.cbox(PALM_L - 1.6, 0.5, 5.8, 0.2), RU, [3.4 + (PALM_L - 1.6) / 2, -1.5, 0]);
      add(root, fuse('t8Knuck', [0, 1, 2, 3].map(i => [g.cyl(1.0, 1.0, 1.25, 8, 'z'), [2.6 + PALM_L, 0.15, ((i + 0.5) / 4 - 0.5) * 7.0]])), ST);
      const fingers = [];
      for (let i = 0; i < 4; i++) {
        const zz = ((i + 0.5) / 4 - 0.5) * 7.0 * side, k = [0.94, 1, 0.97, 0.85][i];
        let parent = root; const segs = [];
        for (let j = 0; j < 3; j++) {
          const piv = ctx.group(); piv.userData.noMerge = true;
          if (j === 0) piv.position.set(2.6 + PALM_L + 0.5, 0, zz); else piv.position.set(FL[j - 1] * k, 0, 0);
          add(piv, phal(+(FL[j] * k).toFixed(2), FTH[j], FW, j === 2), j === 1 ? HM : FM);
          parent.add(piv); parent = piv; segs.push(piv);
        }
        fingers.push(segs);
      }
      const t0 = ctx.group(); t0.position.set(3.6, -0.7, -side * 3.2); t0.userData.noMerge = true;
      add(t0, phal(3.7, 2.2, 1.9, false), FM);
      const t1 = ctx.group(); t1.position.set(3.7, 0, 0); t0.add(t1);
      add(t1, phal(2.9, 2.0, 1.8, true), HM);
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
       MEMBRES (côté 'f' = +Z ; 'b' = miroir)
       ===================================================== */
    for (const [sd, z] of [['f', 1], ['b', -1]]) {
      /* ---------- épaule (suit le torse, avant = +X) ---------- */
      P[sd + 'sc'] = sidePart(z, gr => {
        add(gr, full('t8CapCore', CAP, -3.5, 6.3, 16, 4, { off: -0.5, axis: 'z' }), DK, [0, 1.0, 0]);
        add(gr, patch('t8Cap', { tab: CAP, map: band(116 * D, 424 * D, -3.5, 5.6), nu: 24, nv: 6, c: 0.45, t: 1.2, axis: 'z' }), WH, [0, 1.0, 0]);
        add(gr, patch('t8CapPad', { tab: CAP, map: band(198 * D, 258 * D, -3.0, 4.6), nu: 6, nv: 4, off: 0.35, c: 0.35, t: 1.0, axis: 'z' }), DK, [0, 1.0, 0]);
        add(gr, g.ccyl(5.6, 1.2, 0.35, 24, 'z'), DK2, [0, 0.6, 5.7]);
        add(gr, g.ccyl(4.9, 1.3, 0.45, 24, 'z'), GR, [0, 0.6, 6.25]);
        add(gr, g.box(0.35, 2.2, 0.3), DK2, [0, 2.4, 6.95]);
        add(gr, g.ccyl(0.9, 0.5, 0.15, 16, 'z'), DK2, [0, 0.6, 6.95]);
      });
      /* ---------- bras ---------- */
      P[sd + 'ua'] = sidePart(z, gr => {
        if (ENDO) add(gr, full('t8UAcoreE', UA, 0, 33, 12, 3, { off: -2.3 }), DK);
        else add(gr, full('t8UAcore', UA, 0, 33, 10, 3, { off: -0.9 }), DK);
        add(gr, full('t8UAring', UA, 2.6, 8.0, 20, 2, { off: 0.05, c: 0.35, t: 0.9 }), DK);
        add(gr, full('t8UAring2', UA, 5.0, 5.5, 20, 1, { off: 0.1, c: 0.1, t: 0.5 }), GR);
        if (!ENDO) {
          add(gr, patch('t8UAout', { tab: UA, map: band(-52 * D, 126 * D, 8.6, 23.6), nu: 14, nv: 6 }), WH);
          add(gr, patch('t8UAin', { tab: UA, map: band(129 * D, 305 * D, 8.6, 23.6), nu: 14, nv: 6 }), WH);
        }
        add(gr, full('t8UAband', UA, 24.2, 28.8, 28, 2, { off: 0.1, c: 0.35, t: 1.0 }), DK);
        add(gr, fuse('t8UAbolts', [50, 130, 230, 310].map(a => [g.cyl(0.42, 0.42, 0.5, 6), null, frame(UA, a * D, 26.5, 0.15)])), ST);
        add(gr, patch('t8UAor', { tab: UA, map: band(120 * D, 150 * D, 25.4, 27.4), nu: 3, nv: 1, off: 0.22, c: 0.12, t: 0.6 }), OR);
        add(gr, fuse('t8ElbFork', [1, -1].map(zz => [g.prism([[-4.0, 28.5], [4.0, 28.5], [3.8, 33.2], [-3.8, 33.2]], 1.3, 0.4), [0, 0, 3.75 * zz]])), DK2);
        endoLimb(gr, 'ua');
      });
      /* ---------- coude ---------- */
      P[sd + 'el'] = sidePart(z, gr => {
        add(gr, g.ccyl(4.2, 9.4, 0.7, 16, 'z'), DK);
        add(gr, g.ccyl(5.0, 2.4, 0.6, 24, 'z'), WH, [0, 0, 3.8]);
        add(gr, g.ccyl(4.5, 2.4, 0.6, 24, 'z'), WH, [0, 0, -3.8]);
        add(gr, g.ccyl(4.2, 0.8, 0.25, 24, 'z'), DK2, [0, 0, 5.1]);
        add(gr, g.ccyl(3.6, 0.9, 0.3, 24, 'z'), GR, [0, 0, 5.5]);
        add(gr, g.box(0.3, 1.7, 0.25), DK2, [0, 1.5, 5.98]);
        add(gr, g.cbox(3.0, 5.8, 6.8, 0.9), DK2, [3.2, -1.0, 0]);
      });
      /* ---------- avant-bras ---------- */
      P[sd + 'fa'] = sidePart(z, gr => {
        if (ENDO) add(gr, full('t8FAcoreE', FA, 0, 31, 12, 3, { off: -2.1 }), DK);
        else {
          add(gr, full('t8FAcore', FA, 0, 31, 10, 3, { off: -0.9 }), DK);
          add(gr, patch('t8FAtop', { tab: FA, map: band(-60 * D, 118 * D, 3.4, 24.6), nu: 14, nv: 6 }), WH);
          add(gr, patch('t8FAbot', { tab: FA, map: band(121 * D, 297 * D, 3.4, 24.6), nu: 14, nv: 6 }), WH);
          add(gr, F('stripes', [0, 1, 2, 3, 4].map(i => [patch('t8Stripe' + i, { tab: FA, map: slant(88 * D, 14.8 + i * 2.0, 34 * D, 0.85, 3.0), nu: 4, nv: 1, off: 0.1, c: 0.12, t: 0.5 })])), BK);
        }
        add(gr, full('t8Cuff', FA, 25.2, 30.8, 24, 2, { off: 0.3, c: 0.35, t: 1.1 }), DK);
        add(gr, fuse('t8CuffBolts', [65, 115, 245, 295].map(a => [g.cyl(0.38, 0.38, 0.5, 6), null, frame(FA, a * D, 29.7, 0.36)])), ST);
        add(gr, full('t8CuffR', FA, 27.4, 28.0, 24, 1, { off: 0.42, c: 0.1, t: 0.6 }), DK2);
        endoLimb(gr, 'fa');
      });
      P[sd + 'ha'] = t8Hand(z);
      /* ---------- hanche : disque gris avant-extérieur ---------- */
      P[sd + 'hi'] = sidePart(z, gr => {
        add(gr, g.ccyl(5.8, 10, 0.9, 20, 'z'), DK, [0, 0, 1.0]);
        const dg = ctx.group(); dg.position.set(-3.6, 1.2, 4.9); dg.rotation.y = -0.9; gr.add(dg);
        add(dg, g.ccyl(6.0, 2.6, 0.7, 24, 'z'), WH, [0, 0, -0.6]);
        add(dg, g.ccyl(5.3, 0.8, 0.25, 24, 'z'), DK2, [0, 0, 0.9]);
        add(dg, g.ccyl(4.8, 1.0, 0.35, 24, 'z'), GR, [0, 0, 1.3]);
        add(dg, g.box(0.35, 2.2, 0.3), DK2, [0, 2.4, 1.85]);
      });
      /* ---------- cuisse : coque blanche, panneau gris encastré ---------- */
      P[sd + 'th'] = sidePart(z, gr => {
        const PC = 164 * D, PWd = 33 * D, y0 = 9.2, y1 = 34.6;
        if (ENDO) {
          // collets chromés (hanche / genou) autour du fémur ajouré
          add(gr, full('t8THcoreE', TH, 0, 44, 12, 4, { off: -2.4 }), DK);
          add(gr, F('enThCol', [[full('t8EnThColT', TH, 5.6, 10.2, 24, 2, { c: 0.5, t: 2.5 })], [full('t8EnThColB', TH, 34.6, 39.6, 24, 2, { c: 0.5, t: 2.5 })]]), WH);
        } else {
          add(gr, full('t8THcore', TH, 0, 44, 10, 4, { off: -0.8 }), DK);
          add(gr, patch('t8THmain', { tab: TH, map: band(PC + PWd + 1.5 * D, PC - PWd - 1.5 * D + 2 * PI, 5.6, 39.6), nu: 20, nv: 9, c: 0.5, t: 1.4 }), WH);
          add(gr, patch('t8THtop', { tab: TH, map: band(PC - PWd - 1.5 * D, PC + PWd + 1.5 * D, 5.6, y0 - 0.5), nu: 8, nv: 1, c: 0.45, t: 1.4 }), WH);
          add(gr, patch('t8THbot', { tab: TH, map: band(PC - PWd - 1.5 * D, PC + PWd + 1.5 * D, y1 + 0.5, 39.6), nu: 8, nv: 2, c: 0.45, t: 1.4 }), WH);
          add(gr, patch('t8THpanel', { tab: TH, map: shield(y0, y1, ovalW(y0, y1, PWd, 4), PC), nu: 10, nv: 12, off: -0.45, c: 0.3, t: 0.6 }), DK);
          add(gr, patch('t8THinner', { tab: TH, map: (u, v) => { const y = lerp(17, 39.2, v); return [lerp(262 * D, 318 * D, u) - 14 * D * (1 - v), y]; }, nu: 5, nv: 6, off: 0.3, c: 0.35, t: 1.2 }), DK);
          add(gr, F('thMark', [[patch('t8THmarkH', { tab: TH, map: band(PC - 9 * D, PC + 9 * D, 25.6, 26.1), nu: 3, nv: 1, off: -0.3, c: 0.08, t: 0.3 })],
            [patch('t8THmarkV', { tab: TH, map: band(PC - 1.3 * D, PC + 1.3 * D, 23.2, 28.6), nu: 1, nv: 2, off: -0.3, c: 0.08, t: 0.3 })]]), GR);
        }
        endoLimb(gr, 'th');
      }, L.th / 44);
      /* ---------- genou : grand disque gris extérieur ---------- */
      P[sd + 'kn'] = sidePart(z, gr => {
        add(gr, g.ccyl(5.3, 11.2, 0.9, 20, 'z'), DK);
        add(gr, g.ccyl(6.7, 2.4, 0.6, 24, 'z'), DK2, [0, 0, 4.9]);
        add(gr, g.ccyl(5.9, 1.2, 0.4, 24, 'z'), GR, [0, 0, 6.2]);
        add(gr, g.ccyl(1.2, 0.5, 0.15, 16, 'z'), DK2, [0, 0, 6.85]);
        add(gr, g.box(0.4, 2.8, 0.3), DK2, [-0.8, 2.3, 6.85], [0, 0, 0.35]);
        add(gr, g.ccyl(4.6, 1.4, 0.4, 20, 'z'), GR, [0, 0, -5.4]);
        add(gr, g.prism([[-6.1, -2.0], [-5.0, -3.8], [-3.9, -3.8], [-3.9, 2.6], [-5.5, 3.1]], 5.6, 0.6), DK2);
        add(gr, g.prism([[-6.35, -1.3], [-5.7, -2.5], [-5.7, 1.6], [-6.15, 2.0]], 2.6, 0.25), GR);
      });
      /* ---------- tibia : plaque blanche avant, flancs gris, mollet foncé ---------- */
      P[sd + 'sh'] = sidePart(z, gr => {
        const SB = th => 36.6 - 3.0 * Math.pow(Math.abs(Math.cos(th)), 2);
        if (ENDO) {
          add(gr, full('t8SHcoreE', SH, 0, 44, 12, 4, { off: -2.2 }), DK);
          add(gr, full('t8EnShCol', SH, 2.4, 6.8, 24, 2, { off: 0.15, c: 0.5, t: 2.5 }), WH);
        } else {
          add(gr, full('t8SHcore', SH, 0, 44, 10, 4, { off: -0.8 }), DK);
          add(gr, patch('t8SHcalf', { tab: SH, map: band(-74 * D, 84 * D, 3.2, 37.5), nu: 12, nv: 6, c: 0.45, t: 1.2 }), DK);
          add(gr, patch('t8SHplate', { tab: SH, map: band(94 * D, 264 * D, 2.4, SB), nu: 16, nv: 8, off: 0.2, c: 0.5, t: 1.4 }), WH);
          const swoosh = (u, v) => { const y = lerp(3.2, 38.6, v), c = lerp(72 * D, 136 * D, Math.pow(v, 1.25)); return [c + (u - 0.5) * lerp(34 * D, 16 * D, v), y]; };
          add(gr, patch('t8SHswoosh', { tab: SH, map: swoosh, nu: 4, nv: 10, off: 0.5, c: 0.35, t: 1.3 }), DK);
          add(gr, patch('t8SHline', { tab: SH, map: (u, v) => { const y = lerp(12, 30, v), c = lerp(158 * D, 182 * D, v); return [c + (u - 0.5) * 2.4 * D, y]; }, nu: 1, nv: 4, off: 0.24, c: 0.06, t: 0.4 }), DK2);
          add(gr, patch('t8SHsideI', { tab: SH, map: band(267 * D, 283 * D, 4.5, 35.4), nu: 3, nv: 8, off: 0.12, c: 0.35, t: 1.0 }), DK2);
          add(gr, patch('t8SHslot', { tab: SH, map: band(196 * D, 226 * D, 6.6, 8.6), nu: 4, nv: 1, off: 0.32, c: 0.15, t: 0.6 }), BK);
          // logo orange + marquage
          add(gr, g.prism([[-0.9, 0.8], [0.9, 0.8], [0.9, -0.2], [0, -1.0], [-0.9, -0.2]], 0.5, 0.1), OR, null, null).applyMatrix4(mul(frame(SH, 150 * D, 21, 0.25), MT([0, 0, 0], [-PI / 2, 0, 0], 1)));
          add(gr, fuse('t8ShinTxt', [0, 1, 2, 3].map(i => [g.box(0.9, 0.18, 0.55), null, frame(SH, 150 * D, 24.0 + i * 0.95, 0.24)])), DK2);
        }
        // cheville
        add(gr, full('t8Ankle', SH, 37.4, 44, 24, 2, { off: 0.25, c: 0.35, t: 1.0 }), DK);
        add(gr, fuse('t8AnkBolts', [60, 120, 240, 300].map(a => [g.cyl(0.4, 0.4, 0.5, 6), null, frame(SH, a * D, 40.4, 0.3)])), ST);
        add(gr, g.ccyl(3.2, 8.2, 0.6, 20, 'z'), DK2, [0, 44, 0]);
        // vérin d'Achille (arrière du bas de jambe)
        add(gr, g.ccyl(1.0, 7, 0.3, 10), DK2, [5.3, 31.5, 0], [0, 0, 0.1]);
        add(gr, g.cyl(0.45, 0.45, 8.5, 8), ST, [4.65, 38.8, 0], [0, 0, 0.1]);
        endoLimb(gr, 'sh');
      }, L.sh / 44);
      /* ---------- pied : basket blanche, semelle noire, accents orange ---------- */
      P[sd + 'fo'] = sidePart(z, gr => {
        if (ENDO) {
          /* pied d'endosquelette : talon et tarse chromés compacts, 4 longs métatarsiens en tige polie, orteils à
             2 phalanges articulées sur moyeux sombres, patins caoutchouc (contact au sol à -7 comme la semelle d'origine) */
          const ef = ctx.group(); ef.position.y = 1.8; gr.add(ef);
          add(ef, g.prism([[-3.4, 0.6], [2.6, 0.6], [6.0, -3.2], [6.4, -6.3], [-6.4, -6.9], [-8.3, -5.2], [-6.4, -1.4]], 6.4, 0.75), WH);
          add(ef, g.prism([[-1.6, -1.0], [2.2, -1.0], [5.4, -3.6], [-0.6, -4.6]], 7.4, 0.4), DK2);
          const Ls = { dk: [], st: [], bk: [] }, toes = [], hubs = [], pads = [];
          const TZ = [-3.75, -1.25, 1.25, 3.6], TK = [1.0, 0.96, 0.9, 0.82], TW = [2.0, 1.65, 1.6, 1.5];
          for (let i = 0; i < 4; i++) {
            const zt = TZ[i], zm = zt * 0.6, k = TK[i], w = TW[i];
            const xk = 12.4 + 1.4 * k, xa = xk + 3.6 * k;
            Ls.st.push(rodIt([5.6, -4.8, zm], [xk, -6.35, zt], 0.6 + 0.12 * (w - 1.5), 8));
            hubs.push([g.cyl(1.0, 1.0, w + 0.2, 10, 'z'), [xk, -6.5, zt]], [g.cyl(0.8, 0.8, w + 0.1, 10, 'z'), [xa, -7.2, zt]]);
            toes.push([g.cbox(+(3.6 * k).toFixed(2), 1.55, w, 0.4), [(xk + xa) / 2, -6.85, zt], [0, 0, -0.18]],
              [g.cbox(+(3.0 * k).toFixed(2), 1.3, w - 0.1, 0.4), [xa + 1.35 * k, -7.55, zt], [0, 0, -0.24]]);
            pads.push([g.cbox(2.0, 0.8, w - 0.2, 0.3), [xa + 1.45 * k, -8.4, zt]]);
          }
          // tendons extenseurs (cheville → orteils) et vérin du talon
          for (const zz of [-2.3, 2.3]) Ls.st.push(rodIt([2.2, -0.4, zz * 0.75], [12.4, -5.4, zz], 0.4, 6));
          piston(Ls, [-6.6, -2.4, 0], [-2.6, 1.4, 0], 0.8, 0.5);
          pads.push([g.cbox(6.8, 1.6, 6.0, 0.45), [-3.4, -8.0, 0]], [g.cbox(3.2, 1.4, 8.6, 0.45), [13.6, -8.1, -0.1]]);
          add(ef, fuse('t8EnToes', toes), WH);
          add(ef, fuse('t8EnHubs', hubs), DK2);
          add(ef, fuse('t8EnPads', pads), RU);
          endoAdd(ef, 'Foot', Ls);
          add(gr, g.ccyl(3.2, 10.2, 0.6, 16, 'z'), DK2);
          add(gr, fuse('t8AnkCaps', [1, -1].map(zz => [g.ccyl(2.4, 0.8, 0.3, 12, 'z'), [0, 0, 5.2 * zz]])), GR);
          return;
        }
        add(gr, patch('t8FTcore', { tab: FT, map: band(0, 2 * PI, -8.1, 19.9), closed: true, nu: 10, nv: 5, off: -0.6, c: 0, t: 0, axis: 'x' }), SE);
        add(gr, patch('t8FTup', { tab: FT, map: band(-126 * D, 126 * D, -8.2, 20.0), nu: 14, nv: 9, c: 0.4, t: 1.0, axis: 'x' }), WH2);
        add(gr, patch('t8FTcol', { tab: FT, map: band(129 * D, 231 * D, -8.0, 1.6), nu: 10, nv: 5, off: 0.1, c: 0.35, t: 1.0, axis: 'x' }), DK);
        add(gr, patch('t8FTtng', { tab: FT, map: band(131 * D, 229 * D, 2.1, 12.2), nu: 8, nv: 6, off: 0.2, c: 0.35, t: 1.0, axis: 'x' }), GR);
        const heel = patch('t8FTheel', { tab: FT, map: band(56 * D, 125 * D, -8.15, th => 0.8 - 4.2 * (th - 56 * D) / (69 * D)), nu: 6, nv: 3, off: 0.15, c: 0.3, t: 0.9, axis: 'x' });
        add(gr, F('heels', [[heel], [heel, MZ]]), DK);
        add(gr, patch('t8FTtoe', { tab: FT, map: band(129 * D, 231 * D, 12.7, 19.9), nu: 8, nv: 4, c: 0.35, t: 1.0, axis: 'x' }), WH2);
        // semelle + insert orange au talon
        const solePts = [[-8.7, -5.0, 3.6], [3, -5.9, 6], [16, -5.7, 5], [20.7, -2.4, 2.4], [20.7, 2.4, 2.4], [16, 5.7, 5], [3, 5.9, 6], [-8.7, 5.0, 3.6]];
        add(gr, g.shape('t800Sole', s => rpoly(s, solePts), 2.4, 0.6, 3), RU, [0, -5.8, 0], [PI / 2, 0, 0]);
        add(gr, g.shape('t800HeelOr', s => rpoly(s, [[-8.9, -4.9, 3.4], [-1.5, -5.9, 0.5], [-1.5, 5.9, 0.5], [-8.9, 4.9, 3.4]]), 0.7, 0.2, 3), OR, [0, -4.4, 0], [PI / 2, 0, 0]);
        // aérations de la pointe, laçage orange, languette de talon
        add(gr, F('toeV', [1, -1].flatMap(zz => [0, 1].map(i => [patch('t8ToeV' + i, { tab: FT, map: slant(108 * D, 15.0 + i * 1.6, 14 * D, 0.5, -0.6), nu: 2, nv: 1, off: 0.1, c: 0.08, t: 0.4, axis: 'x' }), [1, 1, zz]]))), SE);
        add(gr, fuse('t8FootOr', [[patch('t8Lace', { tab: FT, map: band(172 * D, 188 * D, 5.0, 6.0), nu: 2, nv: 1, off: 0.32, c: 0.1, t: 0.4, axis: 'x' })],
          [patch('t8Lace2', { tab: FT, map: band(172 * D, 188 * D, 7.4, 8.4), nu: 2, nv: 1, off: 0.32, c: 0.1, t: 0.4, axis: 'x' })],
          [g.cbox(0.4, 3.0, 2.0, 0.1), [-9.25, 2.4, 0], [0, 0, -0.2]]]), OR);
        add(gr, g.cbox(1.6, 4.2, 3.4, 0.5), DK2, [-8.5, 2.2, 0], [0, 0, -0.2]);
        add(gr, g.ccyl(3.2, 10.2, 0.6, 16, 'z'), DK2);
        add(gr, fuse('t8AnkCaps', [1, -1].map(zz => [g.ccyl(2.4, 0.8, 0.3, 12, 'z'), [0, 0, 5.2 * zz]])), GR);
      });
    }

    const tick = ctx.override ? undefined : (t, state) => {
      const sup = state && (state.st === 'super' || state.st === 'special');
      const k = (sup ? 1.45 : 0.9) + 0.1 * Math.sin(t * 2.2);
      LOGO.emissiveIntensity = LOGO.userData.baseI * k;
      HOT.emissiveIntensity = HOT.userData.baseI * (0.92 + 0.08 * Math.sin(t * 2.2 + 0.6));
      STRIP.emissiveIntensity = STRIP.userData.baseI * (sup ? 1.4 : 0.88 + 0.12 * Math.sin(t * 2.2 + 1.2));
      if (EYE) EYE.emissiveIntensity = EYE.userData.baseI * (sup ? 1.35 : 0.94 + 0.06 * Math.sin(t * 7.3) * Math.sin(t * 2.9));
    };
    return { parts: P, shZ: 21.5, hpZ: 11, tick };
  };

  // polygone à coins arrondis (pour g.shape) : pts [[x, y, rayon]]
  function rpoly(s, pts) {
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
  }
})();
