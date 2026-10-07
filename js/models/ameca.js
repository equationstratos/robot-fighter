'use strict';
/* =========================================================
   Modèle 3D : AMECA (Engineered Arts, 2021) — « le visage humanoïde le plus expressif »
   Contrat : voir js/kit.js.
   Design : tête au VISAGE HUMAIN sculpté en peau grise mate (front, arcades, orbites, grands
   yeux blancs à iris bleutés + limbe sombre, paupières à bord libre ombré et paupière mobile
   (clignement), nez avec ailes et narines, lèvres à bord du vermillon net, menton), lisière du
   front arrondie, crâne en coque grise (joint horizontal, trappe arrière), oreilles (hélix,
   anthélix, conque). Cou mécanique apparent (plateforme de 6 vérins, colonne, câbles, paire de
   vérins « sterno-cléido-mastoïdiens »). Corps : coques grises satinées (pectoraux séparés par
   une fente laissant voir le sternum et ses entretoises, côtes, omoplates, deltoïdes, bras et
   cuisses en deux panneaux, avant-bras, mollets, bassin) sur une mécanique sombre visible
   (abdomen segmenté, colonne, vérins, câbles, coudes/genoux/chevilles en chapes à nu). Mains
   en peau grise à 5 doigts (phalanges arrondies, éminences, pouce qui se replie devant le poing).
   Technique : coques = « patchs » découpés dans des surfaces paramétriques (profils
   superelliptiques ; tête = surface déplacée par des reliefs anatomiques, rangées resserrées
   aux yeux/nez/bouche), chanfrein + paroi (arêtes nettes, joints sombres) ; paupières = anneau
   calculé entre le globe et la peau (max sphère/visage, bord extérieur plongé dans l'orbite).
   ========================================================= */
if (typeof RK !== 'undefined' && RK) RK.models.ameca = (function () {
  const T = RK.T, BGU = T.BufferGeometryUtils, PI = Math.PI, D = PI / 180;
  const GC = {};
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = x => Math.min(1, Math.max(0, x));
  const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const G2 = (a, s) => Math.exp(-(a * a) / (s * s));

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
  function SP(tab, th, y, off) {
    const d = dims(tab, y), c = Math.cos(th), s = Math.sin(th);
    const ex = Math.max(0.02, (c >= 0 ? d.xf : d.xb) + off), ez = Math.max(0.02, (s >= 0 ? d.zo : d.zi) + off);
    const e = 2 / (c >= 0 ? d.nf : d.nb);
    return [d.x0 + ex * spow(c, e), y, d.z0 + ez * spow(s, e)];
  }

  /* ---------- grilles ---------- */
  // drop(cx, cy, cz) facultatif : quadrilatères à retirer (trous, ex. yeux sous les paupières)
  function grid(rows, closeU, drop) {
    const nv = rows.length, nu = rows[0].length;
    const pos = new Float32Array(nv * nu * 3);
    let k = 0;
    for (const r of rows) for (const p of r) { pos[k++] = p[0]; pos[k++] = p[1]; pos[k++] = p[2]; }
    const idx = [], uMax = closeU ? nu : nu - 1;
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < uMax; i++) {
      const i2 = (i + 1) % nu;
      const a = j * nu + i, b = j * nu + i2, c = (j + 1) * nu + i2, d = (j + 1) * nu + i;
      if (drop) {
        const q = [a, b, c, d].map(n => pos.subarray(n * 3, n * 3 + 3));
        if (drop((q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4, (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4)) continue;
      }
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

  /* ---------- patch : panneau de coque découpé dans une surface ----------
     o.tab : profil (ou o.S(th, y, off) : surface quelconque) ; o.map(u, v) -> [theta, y]
     o.nu, o.nv : résolution ; o.off : décalage normal ; o.c : chanfrein ; o.t : paroi
     o.closed : anneau complet ; o.capB / o.capT ; o.axis : 'y' | 'x' | 'z' */
  function patch(key, o) {
    const nu = o.nu, nv = o.nv, ck = key + '|' + nu + 'x' + nv;
    if (GC[ck]) return GC[ck];
    const tab = o.tab, map = o.map, closed = !!o.closed;
    const S = o.S || ((th, y, of) => SP(tab, th, y, of));
    const off = o.off || 0, c = o.c == null ? 0.45 : o.c, t = o.t == null ? 1.2 : o.t;
    const at = (u, v, of) => { const m = map(u, v); return S(m[0], m[1], of); };
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
    const geos = [grid(rows, closed, o.drop)];
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
      if (!gg.attributes.normal) gg.computeVertexNormals();
      if (r && r.isMatrix4) _m.copy(r);
      else _m.compose(_v.set(...(p || [0, 0, 0])), _q.setFromEuler(_e.set(...(r || [0, 0, 0]))), Array.isArray(s) ? _s.set(...s) : _s.setScalar(s || 1));
      gg.applyMatrix4(_m);
      if (_m.determinant() < 0) {
        for (const name of ['position', 'normal']) {
          const at = gg.attributes[name], arr = at.array;
          for (let i = 0; i < at.count; i += 3) for (let k = 0; k < 3; k++) { const tt = arr[(i + 1) * 3 + k]; arr[(i + 1) * 3 + k] = arr[(i + 2) * 3 + k]; arr[(i + 2) * 3 + k] = tt; }
        }
      }
      return gg;
    });
    return (GC[key] = BGU.mergeGeometries(list, false));
  }
  const boltRing = (g, n, R, r, h, a0 = 0) => fuse(`amBolts${n},${R},${r},${h},${a0}`, Array.from({ length: n }, (_, i) => { const a = a0 + i / n * 2 * PI; return [g.cyl(r, r, h, 6, 'z'), [Math.cos(a) * R, Math.sin(a) * R, 0]]; }));
  // cartes (u, v) -> [theta, y]
  const fv = (f, th) => typeof f === 'function' ? f(th) : f;
  const band = (th0, th1, yb, yt) => (u, v) => { const th = lerp(th0, th1, u); return [th, lerp(fv(yb, th), fv(yt, th), v)]; };
  const shield = (y0, y1, wf, c0 = 0) => (u, v) => { const y = lerp(y0, y1, v), w = wf(y); return [c0 + lerp(-w, w, u), y]; };
  const nrm = th => Math.atan2(Math.sin(th), Math.cos(th));
  // polygone à coins arrondis (pour g.shape) : pts [[x, y, rayon]]
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
  // le biseau d'ExtrudeGeometry élargit le contour de c : on le rétrécit d'autant
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

  /* =========================================================
     TÊTE : surface paramétrique (theta, y) + reliefs anatomiques du visage
     (centre de la tête = origine, visage vers +X ; unités ≈ cm)
     ========================================================= */
  const HEADB = (() => {
    const yB = -12.3, yT = 12.4, yM = 3, list = [];
    const se = (t, n) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(t)), n)), 1 / n);
    const LZ = curve([[-12.3, 1.3], [-11.6, 2.9], [-10.2, 4.1], [-8, 5.3], [-5.5, 6.45], [-3, 7.3], [0, 7.75], [3, 7.95]]);
    const LXF = curve([[-12.3, 1.9], [-11.6, 5.3], [-10.2, 7.0], [-8, 7.9], [-5.5, 8.6], [-3, 9.0], [0, 9.3], [3, 9.4]]);
    const LXB = curve([[-12.3, 1.2], [-11.6, 2.6], [-10.2, 3.7], [-8, 5.1], [-5.5, 7.4], [-3, 9.2], [0, 10.1], [3, 10.4]]);
    const LX0 = curve([[-12.3, 5.4], [-11.6, 4.2], [-10.2, 2.9], [-8, 1.3], [-5.5, 0.5], [-3, 0.1], [0, -0.2], [3, -0.4]]);
    for (let i = 0; i <= 64; i++) {
      const y = yB + (yT - yB) * (1 - Math.cos(i / 64 * PI)) / 2;
      let xf, xb, z, x0;
      if (y >= yM) {
        const t = (y - yM) / (yT - yM);
        xf = 9.4 * se(t, 2.7); xb = 10.4 * se(t, 2.25); z = 7.95 * se(t, 2.45); x0 = -0.4 - 0.5 * t;
      } else { xf = LXF(y); xb = LXB(y); z = LZ(y); x0 = LX0(y); }
      list.push({ y, xf: Math.max(0.05, xf), xb: Math.max(0.05, xb), z: Math.max(0.05, z), x0, nf: 2.3, nb: 2.2 });
    }
    return prof(list);
  })();
  // œil : amande des paupières dans le plan de l'œil (Z latéral : + vers la tempe, Y vers le haut)
  const ER = 1.45, EYE_Y = 0.35, EYE_Z = 3.2, EZIN = 1.22, EZOUT = 1.36, EHU = 0.66, EHL = 0.6;
  function almond(Z) { // -> [y bas, y haut, y canthus] ou null hors de l'œil
    const t = 2 * (Z + EZIN) / (EZIN + EZOUT) - 1;
    if (t <= -1 || t >= 1) return null;
    const yc = lerp(-0.06, 0.1, (t + 1) / 2), k = 1 - t * t;
    return [yc - EHL * Math.pow(k, 0.85) * (1 + 0.1 * t), yc + EHU * Math.pow(k, 0.68) * (1 - 0.16 * t), yc];
  }
  const EZC = (EZOUT - EZIN) / 2;
  // dans l'amande dilatée ? (y, |z| : coordonnées de la tête)
  function inEye(y, az, ku, kl, kz) {
    const Z = EZC + (az - EYE_Z - EZC) / kz, a = almond(Z);
    if (!a) return false;
    const Y = y - EYE_Y;
    return Y >= a[2] ? (Y - a[2]) / ku < a[1] - a[2] : (a[2] - Y) / kl < a[2] - a[0];
  }
  let EYE_K = 1; // 0 = surface sans orbites (pour placer le globe)
  const NOSE_H = curve([[2.4, 0], [1.4, 0.36], [0, 0.85], [-1.5, 1.5], [-2.8, 2.3], [-3.55, 2.78], [-3.95, 2.8], [-4.35, 2.3], [-4.75, 1.25], [-5.05, 0.4], [-5.35, 0]]);
  const NOSE_W = curve([[2.4, 0.95], [1.0, 0.6], [-1.0, 0.58], [-2.6, 0.72], [-3.6, 0.9], [-4.4, 1.05], [-5.3, 1.15]]);
  const LIP_UT = curve([[0, -6.38], [0.45, -6.22], [1.1, -6.36], [1.7, -6.62], [2.15, -6.95]]);
  const LIP_LB = curve([[0, -7.78], [0.85, -7.7], [1.45, -7.45], [1.9, -7.15], [2.2, -6.98]]);
  const MOUTH = az => -6.95 - 0.05 * Math.max(0, 1 - (az / 2.2) ** 2);
  const lipB = s => s <= 0 || s >= 1 ? 0 : Math.pow(Math.sin(PI * Math.pow(s, 0.8)), 0.5);
  function faceDisp(y, z) {
    const az = Math.abs(z);
    let d = 0;
    d += 0.32 * G2(y - 4.8, 2.8) * G2(z, 4.8);                   // front bombé
    const yb = 2.0 + 0.32 * G2(az - 3.0, 1.5);                    // arcades sourcilières (arc)
    d += 0.5 * G2(y - yb, 0.72) * G2(az - 3.1, 2.0) * (1 - 0.55 * G2(z, 0.9));
    d += 0.16 * G2(y - 1.7, 0.9) * G2(z, 1.1);                   // glabelle
    // orbites (creusées autour de l'amande des paupières)
    const eZ = az - EYE_Z - 0.1, eY = y - EYE_Y;
    const e = (eZ / 1.75) ** 2 + (eY / (eY > 0 ? 1.0 : 0.9)) ** 2;
    d -= EYE_K * 0.95 * (1 - sstep(0.35, 1.7, e));
    if (y > -5.4 && y < 2.5) d += NOSE_H(y) * Math.exp(-Math.pow(az / NOSE_W(y), 2.4)); // nez
    d += 0.22 * G2(y + 3.85, 0.5) * G2(z, 0.62);                 // lobule
    d += 0.48 * G2(y + 4.3, 0.52) * G2(az - 1.22, 0.42);         // ailes du nez
    d -= 0.2 * G2(y + 4.1, 0.75) * G2(az - 1.78, 0.22);          // sillon alaire
    d += 0.1 * G2(y + 5.6, 0.5) * G2(az - 0.42, 0.2);            // philtrum
    d += 0.22 * G2(y + 4.6, 2.2) * G2(az - 4.7, 1.5);            // joues
    d += 0.42 * G2(y + 1.3, 1.2) * G2(az - 4.8, 1.2);            // pommettes
    d -= 0.16 * G2(y + 5.6, 1.4) * G2(az - 5.2, 1.1);            // joues creusées
    if (y < -4.0 && y > -8.2) {                                   // sillon naso-génien
      const af = lerp(2.0, 3.0, (-4.0 - y) / 4.2), w = sstep(-4.0, -4.6, y) * sstep(-8.2, -7.2, y);
      d += w * (0.08 * G2(az - af - 0.55, 0.5) - 0.06 * G2(az - af, 0.16));
    }
    d += 0.16 * G2(y + 6.9, 1.8) * G2(z, 2.8);                   // museau (bouche)
    if (az < 2.22) {                                              // lèvres (bord du vermillon net)
      const ym = MOUTH(az), k = Math.pow(Math.max(0, 1 - (az / 2.22) ** 2), 0.4);
      const yu = LIP_UT(az), yl = LIP_LB(az);
      if (y > ym && y < yu) d += 0.27 * k * lipB((y - ym) / (yu - ym));
      if (y < ym && y > yl) d += 0.36 * k * lipB((ym - y) / (ym - yl)) - 0.06 * k;
    }
    d -= 0.2 * G2(y + 6.95, 0.3) * G2(az - 2.28, 0.26);          // commissures
    d -= 0.3 * G2(y + 8.6, 0.45) * G2(z, 1.9);                   // sillon mentonnier
    d += 0.85 * G2(y + 10.2, 1.15) * G2(z, 1.7);                 // menton
    d -= 0.3 * G2(y - 2.6, 1.8) * G2(az - 6.8, 1.2);             // tempes
    return d;
  }
  function hp(th, y) {
    const b = SP(HEADB, th, y, 0), c = Math.cos(th);
    if (c <= 0.05) return b;
    const d = faceDisp(y, b[2]) * Math.min(1, (c - 0.05) / 0.35);
    return [b[0] + c * d, b[1], b[2] + Math.sin(th) * d];
  }
  // surface de la tête avec décalage normal (normale numérique)
  function HS(th, y, off) {
    const p = hp(th, y);
    if (!off) return p;
    const e = 1e-3, a = hp(th + e, y), b = hp(th, y + e);
    const ux = a[0] - p[0], uy = a[1] - p[1], uz = a[2] - p[2], vx = b[0] - p[0], vy = b[1] - p[1], vz = b[2] - p[2];
    let nx = vy * uz - vz * uy, ny = vz * ux - vx * uz, nz = vx * uy - vy * ux;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-10) { nx = Math.cos(th); ny = 0; nz = Math.sin(th); } else { nx /= l; ny /= l; nz /= l; }
    return [p[0] + nx * off, p[1] + ny * off, p[2] + nz * off];
  }
  // contour du masque facial : demi-largeur angulaire en fonction de y
  const Y_HAIR = 7.4, Y_CHIN = -12.0, HAIR_UP = 0.9;
  const HAIRL = th => Y_HAIR + HAIR_UP * Math.max(0, 1 - (nrm(th) / (50 * D)) ** 2); // lisière du front arrondie
  const FW = curve([[-12, 24], [-11.2, 42], [-10, 56], [-8.5, 68], [-6, 75], [-3, 76], [0, 73], [3, 66], [5.5, 59], [7.4, 50]].map(([y, a]) => [y, a * D]));
  function faceSD(th, y) { // distance signée approx. (unités) à l'intérieur du masque
    if (y > Y_HAIR + 3 || y < Y_CHIN - 3) return -9;
    const yc = Math.min(Y_HAIR, Math.max(Y_CHIN, y));
    return Math.min((FW(yc) - Math.abs(nrm(th))) * 8.5, HAIRL(th) - y, (y - Y_CHIN) * 1.5);
  }
  // crâne : creusé sous le masque (le masque le recouvre sans jamais le traverser)
  const SK = (th, y, off) => HS(th, y, off - 1.4 * sstep(0.5, 1.9, faceSD(th, y)));
  const CAPB = th => 2.6 + 4.6 * Math.pow(0.5 + 0.5 * Math.cos(th), 1.4); // joint calotte / bas du crâne
  // rangées du masque : plus serrées aux yeux, au nez et à la bouche
  const FACE_Y = (() => {
    const N = 300, ys = [], cum = [0];
    const dens = y => 1 + 2.6 * G2(y + 7.0, 1.05) + 1.4 * G2(y - 0.35, 1.3) + 1.0 * G2(y + 4.4, 0.75) + 0.5 * G2(y + 10.2, 1.2);
    for (let i = 0; i <= N; i++) ys.push(Y_CHIN + (Y_HAIR - Y_CHIN) * i / N);
    for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + (dens(ys[i - 1]) + dens(ys[i])) / 2);
    return v => {
      const c = v * cum[N]; let lo = 0, hi = N;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= c) lo = m; else hi = m; }
      return ys[lo] + (ys[hi] - ys[lo]) * Math.min(1, (c - cum[lo]) / ((cum[hi] - cum[lo]) || 1));
    };
  })();
  const faceMap = (u, v) => {
    let y = FACE_Y(v); const w = FW(y), s = 2 * u - 1, a = Math.pow(Math.abs(s), 1.5);
    if (y > 3) y += (y - 3) / (Y_HAIR - 3) * HAIR_UP * Math.max(0, 1 - (a * w / (50 * D)) ** 2);
    return [w * Math.sign(s) * a, y];
  };
  const FOFF = 0.18; // épaisseur du masque au-dessus du crâne
  // point du masque à la hauteur y et à l'abscisse latérale z (bissection sur theta)
  function facePt(y, z, off = FOFF) {
    let lo = -PI / 2, hi = PI / 2;
    for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (HS(m, y, off)[2] < z) lo = m; else hi = m; }
    return { th: (lo + hi) / 2, p: HS((lo + hi) / 2, y, off) };
  }
  // centre du globe oculaire (côté +Z) et direction du regard
  const EYE_TILT = 6 * D;
  const EYE_C = (() => {
    EYE_K = 0; const p = facePt(EYE_Y, EYE_Z).p; EYE_K = 1;
    return [p[0] - Math.cos(EYE_TILT) * (ER - 0.12), p[1], p[2] - Math.sin(EYE_TILT) * (ER - 0.12)];
  })();
  /* paupières : anneau de peau entre le bord libre (posé sur le globe) et la surface du visage.
     d = max(sphère paupière, visage) : le pli palpébral se forme tout seul. */
  function lidRing(N) {
    if (GC['amLidRing' + N]) return GC['amLidRing' + N];  // [bord libre (sombre), paupière]
    const E = EYE_C, ct = Math.cos(EYE_TILT), st = Math.sin(EYE_TILT);
    const S = [0, 0, 0.07, 0.16, 0.26, 0.36, 0.46];
    const rows = S.map(() => []);
    for (let i = 0; i < N; i++) {
      const a = i / N, t = -Math.cos(2 * PI * a), up = a < 0.5;
      const Z = lerp(-EZIN, EZOUT, (t + 1) / 2) * 0.9999;
      const al = almond(Math.max(-EZIN + 1e-4, Math.min(EZOUT - 1e-4, Z)));
      const yc = al[2], Ym = up ? al[1] : al[0];
      S.forEach((s, j) => {
        const ky = 1 + s * (up ? 1.15 : 0.95), kz = 1 + s * 0.28;
        const Zs = EZC + (Z - EZC) * kz, Ys = yc + (Ym - yc) * ky;
        // point du plan de l'œil -> sphère / visage
        const sx = Math.sqrt(Math.max(0.02, ER * ER - Ys * Ys - Zs * Zs));
        const dir = [sx * ct - Zs * st, Ys, sx * st + Zs * ct];
        let p;
        if (j <= 1) { const r = ER + (j ? 0.15 : 0.03), l = Math.hypot(...dir); p = dir.map((c, k) => E[k] + c / l * r); }
        else {
          const F = facePt(E[1] + Ys, E[2] + dir[2]).p;
          const v = [F[0] - E[0], F[1] - E[1], F[2] - E[2]], dF = Math.hypot(...v);
          const lid = ER + 0.14 + 0.06 * sstep(0, 0.18, s);
          let dd = Math.max(lid, dF + 0.07);
          dd = lerp(dd, dF - 0.2, sstep(0.24, 0.46, s)); // le bord extérieur plonge dans l'orbite (pli net)
          p = v.map((c, k) => E[k] + c / dF * dd);
        }
        rows[j].push(p);
      });
    }
    return (GC['amLidRing' + N] = [grid(rows.slice(0, 3), true), grid(rows.slice(2), true)]);
  }

  /* =========================================================
     PROFILS DU CORPS (origine = bassin pour le torse)
     ========================================================= */
  const TB = prof([
    { y: 25.6, xf: 9.0, xb: 8.2, z: 11.8 },
    { y: 30, xf: 10.6, xb: 9.2, z: 13.6 },
    { y: 36, xf: 11.9, xb: 10.2, z: 15.0 },
    { y: 42, xf: 12.5, xb: 10.8, z: 15.9 },
    { y: 48, xf: 12.2, xb: 11.0, z: 16.2 },
    { y: 53, xf: 10.9, xb: 10.6, z: 15.5 },
    { y: 57, xf: 8.4, xb: 9.0, z: 12.6 },
    { y: 60, xf: 5.7, xb: 6.2, z: 7.8 },
    { y: 61.6, xf: 4.5, xb: 4.9, z: 5.0 }
  ].map(s => Object.assign({ nf: 2.7, nb: 2.4 }, s)));
  const WB = prof([
    { y: 9, xf: 8.4, xb: 8.0, z: 10.8 },
    { y: 14, xf: 7.9, xb: 7.6, z: 10.0 },
    { y: 19, xf: 7.8, xb: 7.5, z: 9.8 },
    { y: 24, xf: 8.4, xb: 7.8, z: 10.6 },
    { y: 30, xf: 9.6, xb: 8.7, z: 12.0 }
  ].map(s => Object.assign({ n: 2.6 }, s)));
  const PB = prof([
    { y: -10.4, xf: 5.0, xb: 5.8, z: 5.6 },
    { y: -7, xf: 8.0, xb: 9.0, z: 10.8 },
    { y: -2, xf: 9.4, xb: 10.2, z: 13.2 },
    { y: 3.5, xf: 9.4, xb: 10.0, z: 13.6 },
    { y: 9.0, xf: 8.9, xb: 9.4, z: 12.6 },
    { y: 11.6, xf: 8.4, xb: 8.8, z: 11.4 }
  ].map(s => Object.assign({ n: 2.8 }, s)));
  // membres : avant = -X (xb), extérieur = +Z (zo)
  const UA = prof([
    { y: 0, xf: 5.6, xb: 5.6, zo: 5.8, zi: 5.4 },
    { y: 6, xf: 5.9, xb: 6.0, zo: 6.2, zi: 5.6 },
    { y: 13, xf: 5.7, xb: 6.4, zo: 5.9, zi: 5.4 },
    { y: 20, xf: 5.3, xb: 5.8, zo: 5.4, zi: 5.0 },
    { y: 26, xf: 4.7, xb: 4.9, zo: 4.8, zi: 4.5 },
    { y: 33, xf: 4.3, xb: 4.3, zo: 4.4, zi: 4.2 }
  ].map(s => Object.assign({ n: 2.4 }, s)));
  const FA = prof([
    { y: 0, xf: 4.5, xb: 4.5, z: 4.6 },
    { y: 5, xf: 5.2, xb: 5.1, zo: 5.4, zi: 5.1 },
    { y: 10, xf: 5.2, xb: 5.0, zo: 5.4, zi: 5.0 },
    { y: 17, xf: 4.6, xb: 4.3, zo: 4.7, zi: 4.3 },
    { y: 24, xf: 3.6, xb: 3.4, zo: 3.7, zi: 3.4 },
    { y: 31, xf: 2.7, xb: 2.6, zo: 3.0, zi: 2.8 }
  ].map(s => Object.assign({ n: 2.4 }, s)));
  const TH = prof([
    { y: 0, xf: 8.0, xb: 8.6, zo: 8.7, zi: 7.3 },
    { y: 6, xf: 8.8, xb: 9.7, zo: 9.3, zi: 7.7 },
    { y: 16, xf: 8.4, xb: 9.5, zo: 8.9, zi: 7.4 },
    { y: 28, xf: 7.3, xb: 8.2, zo: 7.8, zi: 6.5 },
    { y: 37, xf: 6.1, xb: 6.6, zo: 6.4, zi: 5.6 },
    { y: 44, xf: 5.2, xb: 5.3, zo: 5.3, zi: 4.8 }
  ].map(s => Object.assign({ nf: 2.4, nb: 2.6 }, s)));
  const SH = prof([
    { y: 0, xf: 5.2, xb: 5.4, zo: 5.4, zi: 5.0 },
    { y: 6, xf: 7.0, xb: 5.9, zo: 6.0, zi: 5.4 },
    { y: 15, xf: 7.3, xb: 5.5, zo: 5.9, zi: 5.3 },
    { y: 26, xf: 5.8, xb: 4.7, zo: 4.9, zi: 4.5 },
    { y: 36, xf: 3.9, xb: 3.7, zo: 3.7, zi: 3.4 },
    { y: 44, xf: 3.3, xb: 3.3, z: 3.3 }
  ].map(s => Object.assign({ nf: 2.4, nb: 2.7 }, s)));
  // pied : profil le long de +X (axis 'x') ; x du profil = -Y du pied (xf = bas, xb = haut)
  const FT = prof([
    { y: -7.2, xf: 0.6, xb: 0.8, z: 2.0 },
    { y: -6.7, xf: 0.6, xb: 4.2, z: 3.7 },
    { y: -4.8, xf: 0.6, xb: 6.0, z: 4.4 },
    { y: -2, xf: 0.6, xb: 6.6, z: 4.6 },
    { y: 1.5, xf: 0.6, xb: 6.3, z: 4.7 },
    { y: 5, xf: 0.6, xb: 5.0, z: 4.8 },
    { y: 9, xf: 0.6, xb: 3.8, z: 4.9 },
    { y: 12.6, xf: 0.6, xb: 3.0, z: 4.7 },
    { y: 16.2, xf: 0.6, xb: 2.2, z: 4.1 },
    { y: 18.4, xf: 0.6, xb: 1.3, z: 2.9 },
    { y: 19.3, xf: 0.5, xb: 0.4, z: 1.0 }
  ].map(s => Object.assign({ x0: 5.2, nf: 2.2, nb: 2.5 }, s)));
  // épaulière (axis 'z') : y du profil -> +Z ; zo -> bas, zi -> haut
  const CAP = prof([
    { y: -6.2, xf: 6.2, xb: 6.6, zo: 4.0, zi: 6.8 },
    { y: 0, xf: 6.9, xb: 7.3, zo: 5.0, zi: 7.5 },
    { y: 4.2, xf: 6.6, xb: 7.0, zo: 4.8, zi: 7.1 },
    { y: 6.3, xf: 5.0, xb: 5.3, zo: 3.7, zi: 5.4 },
    { y: 7.1, xf: 1.7, xb: 1.9, zo: 1.3, zi: 1.9 }
  ].map(s => Object.assign({ n: 2.6 }, s)));

  return function (ctx) {
    const { g, M, L, ch } = ctx;
    const low = ctx.lod === 'low';
    const P = {};
    const add = (parent, geo, mat, p, r, s) => ctx.add(parent, geo, mat, { p, r, s });

    /* ---------- matériaux ---------- */
    const GRY = ctx.mat({ color: ch.body, roughness: 0.4, metalness: 0.05, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.6 }); // coque grise
    const SKIN = ctx.mat({ color: 0xa6abb2, roughness: 0.6, metalness: 0, sheen: 0.6, sheenColor: 0xcfd6df, sheenRoughness: 0.45, envMapIntensity: 0.45 }); // peau du visage
    const SAT = ctx.mat({ color: 0x1c1d21, roughness: 0.42, metalness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.6 }); // noyau noir satiné
    const GM = ctx.mat({ color: 0x3b3e45, roughness: 0.3, metalness: 0.75, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.85 }); // gunmetal
    const DK = M.dark, TR = M.trim, ST = M.steel, CH = M.chrome, SE = M.seam, RU = M.rubber;
    const EYE = ctx.mat({ color: 0xeceef0, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.8 });
    const IRIS = ctx.glow(0x3a5590, 0.45);
    const PUP = M.visor;
    const LIDM = ctx.mat({ color: 0x6a6f77, roughness: 0.7, metalness: 0, envMapIntensity: 0.3 }); // bord libre des paupières (ombré)
    const LED = ctx.glow(ch.accent, 2.4);

    const sidePart = (sd, build, ly = 1, key) => { const part = ctx.group(), inner = ctx.group(); inner.scale.set(1, ly, sd < 0 ? -1 : 1); part.add(inner); build(inner); if (key) pack(inner, key); return part; };
    const YV = new T.Vector3(0, 1, 0);
    const rod = (parent, a, b, r, mat, seg = 10) => {
      const va = new T.Vector3(...a), vb = new T.Vector3(...b), d = vb.clone().sub(va), l = d.length();
      const m = ctx.add(parent, g.cyl(r, r, l, seg), mat, { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] });
      m.quaternion.setFromUnitVectors(YV, d.normalize()); return m;
    };
    const full = (key, tab, y0, y1, nu, nv, o = {}) => patch(key, Object.assign({ tab, map: band(0, 2 * PI, y0, y1), closed: true, nu, nv, c: 0, t: 0 }, o));
    const shp = (key, pts, d, c = 0.6, cv = 4) => g.shape('ameca' + key, s => rpoly(s, inset(pts, c)), d, c, cv);
    // regroupe les meshes statiques (enfants directs) par matériau en une géométrie mise en cache :
    // beaucoup moins de meshes avant la fusion du kit, et rien à recalculer aux constructions suivantes
    const pack = (gr, key) => {
      if (ctx.override) return gr;
      const by = new Map();
      const ntri = geo => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      for (const o of gr.children) if (o.isMesh && !o.userData.noMerge && ntri(o.geometry) < 700) { if (!by.has(o.material)) by.set(o.material, []); by.get(o.material).push(o); }
      let i = 0;
      for (const [mat, list] of by) {
        i++;
        if (list.length < 2) continue;
        const items = list.map(o => { o.updateMatrix(); return [o.geometry, null, o.matrix.clone()]; });
        for (const o of list) gr.remove(o);
        gr.add(ctx.mesh(fuse('amPack' + key + '#' + i, items), mat));
      }
      return gr;
    };

    /* =====================================================
       LOD bas (images rémanentes)
       ===================================================== */
    if (low) {
      const torso = ctx.group();
      add(torso, full('amLoTB', TB, 25.6, 61.6, 10, 4, { capB: true }), GRY);
      add(torso, full('amLoWB', WB, 6, 30, 8, 2), DK);
      add(torso, full('amLoPB', PB, -10.4, 9.6, 8, 3, { capB: true }), GRY);
      P.torso = torso;
      P.neck = ctx.group(ctx.mesh(g.cyl(3.4, 4.2, 16, 8), DK, { p: [0, 8, 0] }));
      const hd = ctx.group(); hd.position.y = 2.2; hd.scale.setScalar(0.95);
      add(hd, patch('amLoHD', { S: HS, map: band(0, 2 * PI, -12.3, 12.4), closed: true, nu: 12, nv: 8, c: 0, t: 0, capB: true }), GRY);
      P.head = ctx.group(hd);
      for (const [sd, z] of [['f', 1], ['b', -1]]) {
        P[sd + 'ua'] = ctx.group(ctx.mesh(full('amLoUA', UA, 0, 33, 8, 2), GRY));
        P[sd + 'fa'] = ctx.group(ctx.mesh(full('amLoFA', FA, 0, 31, 8, 2), GRY));
        P[sd + 'th'] = ctx.group(ctx.mesh(full('amLoTH', TH, 0, 44, 8, 3), GRY));
        P[sd + 'sh'] = ctx.group(ctx.mesh(full('amLoSH', SH, 0, 44, 8, 3), GRY));
        P[sd + 'kn'] = ctx.group(ctx.mesh(g.cyl(4.4, 4.4, 10, 8, 'z'), DK));
        P[sd + 'el'] = ctx.group(ctx.mesh(g.cyl(3.6, 3.6, 8, 8, 'z'), DK));
        P[sd + 'hi'] = ctx.group(ctx.mesh(g.cyl(5, 5, 8, 8, 'z'), DK));
        P[sd + 'sc'] = ctx.group(ctx.mesh(patch('amLoCAP', { tab: CAP, map: band(0, 2 * PI, -6.2, 7.1), closed: true, nu: 8, nv: 3, c: 0, t: 0, axis: 'z' }), GRY, { p: [0, 2, 0], s: [1, 1, z] }));
        P[sd + 'fo'] = ctx.group(ctx.mesh(g.cbox(25, 7, 9.4, 2.2), GRY, { p: [6, -3.5, 0] }));
        // poing compact (même encombrement que la main fermée du LOD haut)
        const hd = ctx.group(ctx.mesh(g.cbox(2.6, 3.6, 4.4, 0.6), DK, { p: [1.3, 0, 0] }), ctx.mesh(g.cbox(9.4, 3.4, 6.8, 1.2), SKIN, { p: [6.6, 0, 0] }), ctx.mesh(g.cbox(3.6, 4.8, 6.8, 1.4), SKIN, { p: [10.4, -1.1, 0] }));
        hd.userData.setCurl = () => {};
        P[sd + 'ha'] = hd;
      }
      return { parts: P, shZ: 21.2, hpZ: 10.4 };
    }

    /* =====================================================
       TORSE : bassin gris, abdomen mécanique apparent, buste anatomique
       ===================================================== */
    const torso = ctx.group();
    {
      // --- bassin ---
      add(torso, full('amPBcore', PB, -10.4, 11.6, 16, 5, { off: -0.9, capB: true }), SAT);
      add(torso, patch('amPBfront', { tab: PB, map: shield(-9.8, 9.2, curve([[-9.8, 18 * D], [-7, 34 * D], [-3, 52 * D], [2, 60 * D], [9.2, 64 * D]])), nu: 14, nv: 8, c: 0.45, t: 1.2 }), GRY);
      add(torso, patch('amPBback', { tab: PB, map: shield(-9.0, 9.2, curve([[-9.0, 24 * D], [-5, 44 * D], [0, 58 * D], [9.2, 64 * D]]), PI), nu: 14, nv: 8, c: 0.45, t: 1.2 }), GRY);
      add(torso, full('amBelt', PB, 9.8, 11.6, 28, 1, { off: -0.1, c: 0.3, t: 0.8 }), TR);
      for (const z of [1, -1]) {
        add(torso, g.ccyl(5.6, 3.2, 0.8, 12, 'z'), GM, [0, 0, z * 12.2]);
        add(torso, g.ccyl(3.4, 0.8, 0.3, 12, 'z'), ST, [0, 0, z * 13.9]);
        add(torso, boltRing(g, 6, 4.5, 0.38, 0.7, PI / 6), ST, [0, 0, z * 13.8]);
      }

      // --- abdomen mécanique (anneaux segmentés, vérins, colonne, câbles) ---
      add(torso, full('amWBcore', WB, 9, 30, 16, 5), SAT);
      [[13.8, 15.2], [18.2, 19.6], [22.6, 24.0]].forEach(([a, b], i) =>
        add(torso, full('amWBr' + i, WB, a, b, 24, 1, { off: 0.5, c: 0.3, t: 1.0 }), TR));
      for (const z of [1, -1]) {
        rod(torso, [8.4, 11.4, z * 4.0], [8.9, 19.6, z * 4.6], 1.05, GM, 12);
        rod(torso, [8.9, 18.6, z * 4.6], [9.5, 28.0, z * 5.2], 0.5, CH, 10);
        add(torso, g.cbox(2.6, 2.0, 2.6, 0.5), DK, [8.4, 11.0, z * 4.0]);
        add(torso, g.cbox(2.4, 1.8, 2.4, 0.5), DK, [9.5, 28.2, z * 5.2]);
        // faisceaux de câbles latéraux
        for (let k = 0; k < 2; k++) {
          const dx = (k - 0.5) * 1.4;
          add(torso, g.tube([[1.5 + dx, 10.6, z * 11.0], [0.8 + dx, 14.5, z * 11.2], [0.4 + dx, 19.5, z * 11.1], [0.6 + dx, 25, z * 11.7], [0.2 + dx, 29.6, z * 12.4]], 0.5, 10, 4), RU);
        }
      }
      add(torso, g.cbox(3.2, 19, 4.2, 0.8), GM, [-7.9, 20, 0]);
      for (let i = 0; i < 4; i++) add(torso, g.cbox(2.0, 1.5, 6.2, 0.5), DK, [-9.0, 12.6 + i * 4.3, 0]);

      // --- buste ---
      add(torso, full('amTBcore', TB, 25.6, 61.6, 14, 5, { off: -0.9, capB: true }), SAT);
      const YK = th => 56.4 - 1.6 * Math.pow(Math.min(1, Math.abs(th) / (90 * D)), 1.3);
      const PEC_B = th => 38.6 + 8 * Math.pow(Math.min(1, Math.abs(th) / (86 * D)), 1.8);
      const RIB_B = th => 26.8 + 5 * Math.pow(Math.max(0, 1 - Math.abs(th) / (62 * D)), 1.4);
      add(torso, patch('amPecL', { tab: TB, map: band(3.6 * D, 87.5 * D, PEC_B, YK), nu: 16, nv: 6, c: 0.45, t: 1.3 }), GRY);
      add(torso, patch('amPecR', { tab: TB, map: band(-87.5 * D, -3.6 * D, PEC_B, YK), nu: 16, nv: 6, c: 0.45, t: 1.3 }), GRY);
      add(torso, patch('amRibL', { tab: TB, map: band(3.6 * D, 87.5 * D, RIB_B, th => PEC_B(th) - 0.6), nu: 16, nv: 4, c: 0.45, t: 1.3 }), GRY);
      add(torso, patch('amRibR', { tab: TB, map: band(-87.5 * D, -3.6 * D, RIB_B, th => PEC_B(th) - 0.6), nu: 16, nv: 4, c: 0.45, t: 1.3 }), GRY);
      add(torso, patch('amBackL', { tab: TB, map: band(92.5 * D, 178 * D, 32.2, 55.2), nu: 13, nv: 7, c: 0.45, t: 1.3 }), GRY);
      add(torso, patch('amBackR', { tab: TB, map: band(182 * D, 267.5 * D, 32.2, 55.2), nu: 13, nv: 7, c: 0.45, t: 1.3 }), GRY);
      add(torso, patch('amLumbL', { tab: TB, map: band(92.5 * D, 178 * D, 26.6, 31.6), nu: 14, nv: 3, c: 0.45, t: 1.3 }), GRY);
      add(torso, patch('amLumbR', { tab: TB, map: band(182 * D, 267.5 * D, 26.6, 31.6), nu: 14, nv: 3, c: 0.45, t: 1.3 }), GRY);
      add(torso, patch('amColL', { tab: TB, map: band(7 * D, 173 * D, th => Math.max(YK(th), 55.2) + 0.6, 61.0), nu: 16, nv: 3, c: 0.4, t: 1.1 }), GRY);
      add(torso, patch('amColR', { tab: TB, map: band(187 * D, 353 * D, th => Math.max(YK(th), 55.2) + 0.6, 61.0), nu: 16, nv: 3, c: 0.4, t: 1.1 }), GRY);
      // détails : vis des plaques, barre de sternum, côtes visibles dans les flancs, vertèbres dorsales
      const bolts = [];
      for (const s of [1, -1]) {
        for (const [th, y] of [[72, 50.6], [62, 30.2], [118, 52.4], [166, 52.6], [166, 34.2]]) {
          const p0 = SP(TB, s * th * D, y, 0), p1 = SP(TB, s * th * D + 0.01, y, 0);
          const nx = (p1[2] - p0[2]) * s, nz = -(p1[0] - p0[0]) * s, nl = Math.hypot(nx, nz);
          bolts.push([g.cyl(0.42, 0.42, 0.5, 6), [p0[0] + nx / nl * 0.1, y, p0[2] + nz / nl * 0.1], [0, 0, 0]]);
          const m = bolts[bolts.length - 1];
          m[2] = [PI / 2, 0, -Math.atan2(nx / nl, nz / nl)];
        }
        for (const y of [34.5, 38.5, 42.5]) {
          const p = SP(TB, s * 90 * D, y, -0.35);
          add(torso, g.cbox(3.6, 1.0, 1.4, 0.3), TR, p);
        }
      }
      add(torso, fuse('amChestBolts', bolts), ST);
      // sternum : fente centrale laissant voir la structure (barre + entretoises)
      const stern = []; for (let i = 0; i <= 8; i++) { const y = lerp(28.0, 56.0, i / 8); stern.push(SP(TB, 0, y, -0.75)); }
      add(torso, g.tube(stern, 0.45, 8, 5), GM);
      add(torso, fuse('amStrut', [31.5, 36.5, 41.5, 46.5, 51.5].map(y => [g.cbox(0.7, 0.55, 2.6, 0.15), SP(TB, 0, y, -0.55)])), ST);
      const vert = []; for (let i = 0; i < 7; i++) { const y = 33.5 + i * 3.4; vert.push([g.cbox(1.6, 1.6, 2.4, 0.4), SP(TB, PI, y, -0.25)]); }
      add(torso, fuse('amVert', vert), GM);
      // actionneurs d'épaule (logements)
      for (const z of [1, -1]) {
        add(torso, g.ccyl(4.8, 3.6, 0.8, 12, 'z'), GM, [0, 51.6, z * 16.3]);
        add(torso, g.ccyl(3.0, 0.8, 0.3, 12, 'z'), ST, [0, 51.6, z * 18.3]);
      }
      add(torso, g.ccyl(5.6, 1.6, 0.5, 16), GM, [0, 61.2, 0]);
      // LED d'état (accent violet, discrète) dans le dos
      add(torso, g.cbox(0.6, 2.4, 0.9, 0.2), LED, [-11.0, 47, 0]);
    }
    P.torso = pack(torso, 'torso');

    /* =====================================================
       COU mécanique : plateforme de 6 vérins, colonne, câbles
       ===================================================== */
    {
      const n = ctx.group();
      add(n, g.ccyl(6.2, 1.8, 0.5, 12), GM, [0, 0.9, 0]);
      add(n, g.ccyl(2.9, 14.5, 0.6, 14), SAT, [0, 8.4, 0]);
      for (let i = 0; i < 4; i++) add(n, g.ccyl(3.6, 0.9, 0.3, 14), i % 2 ? ST : DK, [0, 3.3 + i * 2.5, 0]);
      for (let i = 0; i < 6; i++) {
        const a = (i + 0.5) / 6 * 2 * PI, b = a + (i % 2 ? 1 : -1) * 36 * D;
        const A = [Math.cos(a) * 5.0, 1.9, Math.sin(a) * 5.0], B = [Math.cos(b) * 3.6, 13.0, Math.sin(b) * 3.6];
        const M_ = [lerp(A[0], B[0], 0.55), lerp(A[1], B[1], 0.55), lerp(A[2], B[2], 0.55)];
        rod(n, A, M_, 0.85, TR, 8);
        rod(n, M_, B, 0.45, CH, 8);
        add(n, g.sphere(0.95, 6, 4), ST, A);
        add(n, g.sphere(0.75, 6, 4), ST, B);
      }
      add(n, g.ccyl(4.4, 1.3, 0.35, 12), GM, [0, 13.6, 0]);
      for (const z of [1, -1]) add(n, g.tube([[-4.8, 1.6, z * 1.8], [-5.7, 6.5, z * 2.6], [-5.2, 11, z * 2.2], [-3.6, 14.2, z * 1.6]], 0.55, 12, 5), RU);
      // « sterno-cléido-mastoïdiens » : paire de vérins sternum -> derrière l'oreille (silhouette humaine du cou)
      for (const z of [1, -1]) {
        const A = [3.4, 1.0, z * 1.7], B = [-1.6, 12.6, z * 4.7], M_ = [lerp(A[0], B[0], 0.5), lerp(A[1], B[1], 0.5), lerp(A[2], B[2], 0.5)];
        rod(n, A, M_, 0.78, DK, 8);
        rod(n, M_, B, 0.42, CH, 8);
        add(n, g.sphere(0.85, 6, 4), GM, A);
        add(n, g.cbox(1.6, 1.6, 1.6, 0.4), GM, B);
      }
      P.neck = pack(n, 'neck');
    }

    /* =====================================================
       TÊTE : masque facial gris + crâne + yeux + oreilles
       ===================================================== */
    let lids = [], irises = [];
    {
      const h = ctx.group();
      const dome = (y0, y1) => (u, v) => { const th = u * 2 * PI; return [th, lerp(fv(y0, th), y1, Math.sin(v * PI / 2))]; };
      add(h, patch('amHDcore', { S: SK, map: dome(-12.3, 12.4), closed: true, nu: 16, nv: 8, off: -0.6, c: 0, t: 0, capB: true }), SE);
      // calotte + bas du crâne, séparés par un joint ; trappe arrière en léger relief
      add(h, patch('amHDcap', { S: SK, map: dome(CAPB, 12.4), closed: true, nu: 32, nv: 10, c: 0.3, t: 0.9 }), GRY);
      add(h, patch('amHDlow', { S: SK, map: band(0, 2 * PI, -12.3, th => CAPB(th) - 0.55), closed: true, nu: 32, nv: 9, c: 0.3, t: 0.9 }), GRY);
      add(h, patch('amHDhatch', { S: SK, map: band(150 * D, 210 * D, -8.6, th => CAPB(th) - 1.6), nu: 10, nv: 8, off: 0.16, c: 0.18, t: 0.7 }), GRY);
      // masque facial (peau grise mate), troué sous les paupières
      add(h, patch('amFace', { S: HS, map: faceMap, nu: 48, nv: 78, off: FOFF, c: 0.25, t: 0.8, drop: (x, y, z) => inEye(y, Math.abs(z), 1.12, 1.12, 1.04) }), SKIN);
      // narines + fente de la bouche
      for (const s of [1, -1]) {
        const q = facePt(-4.72, s * 0.76, FOFF - 0.14);
        add(h, g.ell(0.4, 0.19, 0.3, 10, 6), SE, q.p, [s * 0.25, 0, 0.4]);
      }
      const mouth = [];
      for (let i = 0; i <= 16; i++) { const zz = lerp(-2.25, 2.25, i / 16); mouth.push(facePt(MOUTH(Math.abs(zz)), zz, FOFF - 0.06).p); }
      add(h, g.tube(mouth, 0.075, 32, 4), SE);
      // yeux : globe blanc, iris bleuté (limbe sombre), pupille ; paupières en anneau + paupière mobile (clignement)
      const lidGeo = lidRing(40);
      for (const s of [1, -1]) {
        const eg = ctx.group(); eg.scale.set(1, 1, s); h.add(eg);
        add(eg, lidGeo[0], LIDM);
        add(eg, lidGeo[1], SKIN);
        const eye = ctx.group(); eye.position.set(...EYE_C); eye.rotation.y = -EYE_TILT; eg.add(eye);
        add(eye, g.sphere(ER, 16, 11), EYE);
        const ir = ctx.group(); ir.userData.noMerge = true; eye.add(ir);
        add(ir, g.sphere(ER + 0.006, 18, 3, 0, 2 * PI, 0, 32 * D), PUP, [0, 0, 0], [0, 0, -PI / 2]);
        add(ir, g.sphere(ER + 0.018, 18, 3, 0, 2 * PI, 0, 29 * D), IRIS, [0, 0, 0], [0, 0, -PI / 2]);
        add(ir, g.sphere(ER + 0.03, 12, 2, 0, 2 * PI, 0, 12 * D), PUP, [0, 0, 0], [0, 0, -PI / 2]);
        irises.push(ir);
        const lid = ctx.group(); lid.userData.noMerge = true; eye.add(lid);
        add(lid, g.sphere(ER + 0.06, 14, 5, 0, 2 * PI, 0, 60 * D), SKIN);
        lids.push(lid);
      }
      // oreilles : pavillon gris (hélix en bourrelet, anthélix, conque sombre, tragus)
      const earPts = [[0.95, 2.1, 0.7], [0.2, 3.05, 1.0], [-1.25, 3.0, 1.2], [-2.05, 1.7, 1.0], [-2.0, -0.1, 1.0], [-1.5, -1.7, 1.0], [-0.8, -3.05, 0.8], [0.2, -3.1, 0.7], [0.65, -2.2, 0.6], [0.95, -0.6, 0.5]];
      const helix = [[0.75, 2.25, 0], [0.1, 2.75, 0], [-1.0, 2.7, 0], [-1.7, 1.6, 0], [-1.7, -0.1, 0], [-1.25, -1.5, 0], [-0.6, -2.55, 0]];
      const anti = [[-0.75, 2.0, 0], [-1.05, 1.0, 0], [-0.95, -0.2, 0], [-0.45, -1.35, 0]];
      const earGeo = fuse('amEar', [
        [shp('earPlate', earPts, 0.9, 0.3, 2), [0, 0, 0]],
        [g.tube(helix, 0.36, 14, 5), [0, 0, 0.42]],
        [g.tube(anti, 0.2, 8, 4), [0, 0, 0.42]]
      ]);
      for (const s of [1, -1]) {
        const eg = ctx.group(); eg.scale.set(1, 1, s); h.add(eg);
        const zS = Math.abs(SK(95 * D, -1.2, 0)[2]);
        const e1 = ctx.group(); e1.position.set(-1.35, -1.2, zS + 0.05); e1.rotation.set(0, 0.22, -0.16); e1.scale.setScalar(1.08); eg.add(e1);
        add(e1, earGeo, GRY);
        add(e1, g.ell(0.55, 1.1, 0.16, 10, 6), GM, [0.05, -0.55, 0.4], [0, 0, 0.12]);
      }
      pack(h, 'head');
      h.position.y = 2.2; h.scale.setScalar(0.95);
      P.head = ctx.group(h);
    }

    /* =====================================================
       MAIN grise à 5 doigts (contrat RK.hand : origine poignet, +X doigts, paume -Y)
       ===================================================== */
    const PALM_L = 7.0, FL = [3.4, 2.35, 1.95], FR = [0.79, 0.73, 0.66];
    // phalange en peau grise : capsule de révolution le long de +X (bout arrondi pour la dernière)
    const phal = (L, r, tip) => g.lathe(tip
      ? [[0, -r * 0.85], [r * 0.72, -r * 0.55], [r, -r * 0.05], [r * 0.95, L - r * 0.95], [r * 0.72, L - r * 0.3], [0, L]]
      : [[0, -r * 0.85], [r * 0.72, -r * 0.55], [r, -r * 0.05], [r * 0.95, L * 0.55], [r * 0.82, L - r * 0.2], [0, L + r * 0.08]], 8, 'x');
    function amHand(side) {
      const root = ctx.group(), Dg = D;
      // poignet mécanique apparent
      add(root, g.ccyl(1.9, 2.6, 0.4, 10, 'x'), DK, [0.9, 0, 0]);
      add(root, g.ccyl(2.25, 0.6, 0.2, 10, 'x'), ST, [2.0, 0, 0]);
      // paume (peau grise) : contour arrondi, bord des métacarpiens légèrement en arc
      const palm = shp('palm', [[2.2, -2.5, 0.9], [8.9, -3.3, 1.3], [9.8, -1.1, 1.0], [9.9, 0.9, 1.0], [9.5, 3.25, 1.1], [2.2, 2.5, 0.9]], 2.8, 0.85, 2);
      add(root, palm, SKIN, [0, 0, 0], [PI / 2, 0, 0], [1, side, 1]);
      add(root, g.ell(2.3, 0.9, 1.35, 8, 5), SKIN, [4.9, -0.85, -side * 1.75]);            // éminence thénar
      add(root, g.ell(2.6, 0.7, 1.0, 8, 5), SKIN, [5.6, -0.95, side * 2.2]);               // éminence hypothénar
      add(root, fuse('amKnuck', [0, 1, 2, 3].map(i => [g.sphere(0.72, 6, 4), [9.35 - (i === 3 ? 0.4 : 0), 0.62, ((i + 0.5) / 4 - 0.5) * 6.3]])), SKIN, [0, 0, 0], [0, 0, 0], [1, 1, side]);
      const fingers = [];
      for (let i = 0; i < 4; i++) {
        const zz = ((i + 0.5) / 4 - 0.5) * 6.3 * side, k = [0.94, 1, 0.96, 0.8][i];
        let parent = root; const segs = [];
        for (let j = 0; j < 3; j++) {
          const piv = ctx.group(); piv.userData.noMerge = true;
          if (j === 0) piv.position.set(9.6 - (i === 3 ? 0.45 : i === 0 ? 0.15 : 0), 0, zz); else piv.position.set(+(FL[j - 1] * k).toFixed(2), 0, 0);
          add(piv, phal(+(FL[j] * k).toFixed(2), FR[j] * (i === 3 ? 0.92 : 1), j === 2), SKIN, [0, 0, 0], [0, 0, 0], [1, 0.9, 1]);
          parent.add(piv); parent = piv; segs.push(piv);
        }
        fingers.push(segs);
      }
      const t0 = ctx.group(); t0.position.set(3.7, -0.75, -side * 2.75); t0.userData.noMerge = true;
      add(t0, phal(3.4, 0.9, false), SKIN);
      const t1 = ctx.group(); t1.position.set(3.4, 0, 0); t0.add(t1);
      add(t1, phal(2.6, 0.82, true), SKIN, [0, 0, 0], [0, 0, 0], [1, 0.9, 1]);
      root.add(t0);
      // pouce : direction interpolée (ouvert -> replié devant les phalanges moyennes de l'index et du majeur)
      const XV = new T.Vector3(1, 0, 0), tA = new T.Vector3(0.74, -0.42, -0.53 * side).normalize(), tB = new T.Vector3(0.86, -0.4, 0.33 * side).normalize(), tD = new T.Vector3();
      root.userData.setCurl = c => {
        for (const sg of fingers) { sg[0].rotation.z = -86 * c * Dg; sg[1].rotation.z = -98 * c * Dg; sg[2].rotation.z = -72 * c * Dg; }
        t0.quaternion.setFromUnitVectors(XV, tD.copy(tA).lerp(tB, c).normalize());
        t1.rotation.z = -(12 + 30 * c) * Dg;
      };
      root.userData.setCurl(1);
      return pack(root, 'hand' + side);
    }

    /* =====================================================
       MEMBRES (côté 'f' = +Z ; 'b' = miroir)
       ===================================================== */
    for (const [sd, z] of [['f', 1], ['b', -1]]) {
      // ---------- épaulière (deltoïde gris) ----------
      P[sd + 'sc'] = sidePart(z, gr => {
        add(gr, patch('amCapCore', { tab: CAP, map: band(0, 2 * PI, -6.2, 7.1), closed: true, nu: 12, nv: 3, off: -0.7, c: 0, t: 0, axis: 'z' }), SAT, [0, 2.0, 0]);
        add(gr, patch('amCap', { tab: CAP, map: band(0, 2 * PI, -1.2, 7.1), closed: true, nu: 28, nv: 7, c: 0.4, t: 1.1, axis: 'z' }), GRY, [0, 2.0, 0]);
        add(gr, g.ccyl(3.4, 0.8, 0.3, 12, 'z'), GM, [0, 1.6, 7.0]);
        add(gr, g.ccyl(1.6, 0.6, 0.2, 12, 'z'), ST, [0, 1.6, 7.5]);
      }, 1, 'sc');
      // ---------- bras ----------
      P[sd + 'ua'] = sidePart(z, gr => {
        add(gr, full('amUAcore', UA, 0, 33, 12, 3, { off: -0.9 }), SAT);
        add(gr, g.ccyl(4.9, 6, 0.8, 16), GM, [0, 2.6, 0]);
        add(gr, patch('amUAfront', { tab: UA, map: band(91.5 * D, 268.5 * D, 6.2, 15.4), nu: 12, nv: 4 }), GRY);
        add(gr, patch('amUAfront2', { tab: UA, map: band(91.5 * D, 268.5 * D, 16.2, 25.4), nu: 12, nv: 4 }), GRY);
        add(gr, patch('amUAback', { tab: UA, map: band(-88.5 * D, 88.5 * D, 6.6, 25.0), nu: 12, nv: 7 }), GRY);
        for (const zz of [1, -1]) add(gr, shp('elbowFork', [[-3.6, 24, 1], [3.4, 24, 1], [3.6, 31.5, 3.4], [-3.6, 31.5, 3.4]], 1.3, 0.4, 4), GM, [0, 0, zz * 3.9]);
        add(gr, g.cbox(3.2, 4.2, 5.4, 0.8), DK, [2.0, 27.4, 0]);
        rod(gr, [-2.6, 20, 0], [-2.2, 29.5, 0], 0.55, CH, 8);
      }, 1, 'ua');
      P[sd + 'el'] = sidePart(z, gr => {
        add(gr, g.ccyl(3.5, 9.2, 0.7, 12, 'z'), DK);
        add(gr, g.ccyl(2.3, 0.7, 0.2, 12, 'z'), ST, [0, 0, 4.75]);
        add(gr, g.ccyl(2.3, 0.7, 0.2, 12, 'z'), ST, [0, 0, -4.75]);
        add(gr, boltRing(g, 5, 1.6, 0.25, 0.4), DK, [0, 0, 5.1]);
        add(gr, g.cbox(3.2, 5.2, 5.6, 1.0), GM, [3.0, 1.0, 0]);
      }, 1, 'el');
      P[sd + 'fa'] = sidePart(z, gr => {
        add(gr, full('amFAcore', FA, 0, 31, 12, 3, { off: -0.9 }), SAT);
        add(gr, patch('amFAtop', { tab: FA, map: band(-88.5 * D, 88.5 * D, 4.4, 26.4), nu: 12, nv: 7 }), GRY);
        add(gr, patch('amFAbot', { tab: FA, map: band(91.5 * D, 268.5 * D, 4.8, 26.0), nu: 12, nv: 7 }), GRY);
        // tendons du poignet + bague
        for (let i = 0; i < 4; i++) { const a = (i + 0.5) / 4 * 2 * PI; rod(gr, [Math.cos(a) * 2.3, 25.0, Math.sin(a) * 2.3], [Math.cos(a) * 1.9, 29.4, Math.sin(a) * 1.9], 0.28, CH, 6); }
        add(gr, g.ccyl(2.9, 1.6, 0.4, 12), GM, [0, 29.8, 0]);
        add(gr, g.cbox(1.8, 2.8, 2.8, 0.5), DK, [2.2, 27.9, 0]);
      }, 1, 'fa');
      P[sd + 'ha'] = amHand(z);
      // ---------- hanche ----------
      P[sd + 'hi'] = sidePart(z, gr => {
        add(gr, g.ccyl(4.8, 5.2, 0.8, 12, 'z'), GM, [0, 0, 5.0]);
        add(gr, g.ccyl(3.0, 0.7, 0.25, 12, 'z'), ST, [0, 0, 7.8]);
        add(gr, g.ccyl(1.4, 0.6, 0.2, 14, 'z'), DK, [0, 0, 8.2]);
      }, 1, 'hi');
      // ---------- cuisse ----------
      P[sd + 'th'] = sidePart(z, gr => {
        add(gr, full('amTHcore', TH, 0, 44, 12, 4, { off: -0.9 }), SAT);
        add(gr, patch('amTHfront', { tab: TH, map: band(91.5 * D, 268.5 * D, 4.5, 21.0), nu: 14, nv: 5, c: 0.5, t: 1.3 }), GRY);
        add(gr, patch('amTHfront2', { tab: TH, map: band(91.5 * D, 268.5 * D, 21.9, 37.6), nu: 14, nv: 5, c: 0.5, t: 1.3 }), GRY);
        add(gr, patch('amTHback', { tab: TH, map: band(-88.5 * D, 88.5 * D, 7.0, 35.6), nu: 14, nv: 8, c: 0.5, t: 1.3 }), GRY);
        for (const zz of [1, -1]) add(gr, shp('kneeFork', [[-4.4, 35, 1], [4.2, 35, 1], [4.4, 45.6, 4.2], [-4.4, 45.6, 4.2]], 1.5, 0.45, 4), GM, [0, 0, zz * 5.4]);
        rod(gr, [-4.2, 30, 0], [-3.6, 41.5, 0], 0.7, CH, 10);
        add(gr, g.cbox(2.6, 3.2, 3.6, 0.6), DK, [-4.3, 29.2, 0]);
      }, 1, 'th');
      // ---------- genou (mécanique apparente) ----------
      P[sd + 'kn'] = sidePart(z, gr => {
        add(gr, g.ccyl(4.3, 10.4, 0.8, 12, 'z'), DK);
        add(gr, g.ccyl(2.9, 0.7, 0.25, 12, 'z'), ST, [0, 0, 6.1]);
        add(gr, g.ccyl(2.9, 0.7, 0.25, 12, 'z'), ST, [0, 0, -6.1]);
        add(gr, boltRing(g, 6, 2.1, 0.28, 0.4), DK, [0, 0, 6.5]);
        add(gr, g.cbox(3.0, 5.6, 6.4, 1.0), GM, [-4.6, 1.4, 0]);
        add(gr, g.cbox(1.0, 3.6, 4.2, 0.3), GRY, [-6.2, 1.4, 0]);
      }, 1, 'kn');
      // ---------- tibia ----------
      P[sd + 'sh'] = sidePart(z, gr => {
        add(gr, full('amSHcore', SH, 0, 44, 12, 4, { off: -0.9 }), SAT);
        add(gr, patch('amSHfront', { tab: SH, map: band(91.5 * D, 268.5 * D, 5.2, 37.8), nu: 12, nv: 8, c: 0.45, t: 1.2 }), GRY);
        add(gr, patch('amSHcalf', { tab: SH, map: band(-88.5 * D, 88.5 * D, 4.6, 19.6), nu: 12, nv: 5, c: 0.45, t: 1.2 }), GRY);
        add(gr, patch('amSHcalf2', { tab: SH, map: band(-80 * D, 80 * D, 20.4, 32.6), nu: 10, nv: 4, c: 0.45, t: 1.2 }), GRY);
        // vérins d'Achille + chape de cheville (mécanique apparente)
        for (const zz of [1.7, -1.7]) {
          rod(gr, [3.4, 30, zz], [2.7, 37.5, zz], 0.85, TR, 10);
          rod(gr, [2.75, 36.5, zz], [2.1, 42.4, zz], 0.42, CH, 8);
        }
        for (const zz of [1, -1]) add(gr, shp('ankleFork', [[-3.2, 37.2, 0.8], [2.6, 37.2, 0.8], [3.0, 46.2, 2.9], [-3.0, 46.2, 2.9]], 1.1, 0.35, 3), GM, [0, 0, zz * 3.6]);
        add(gr, g.ccyl(2.9, 6.2, 0.6, 12, 'z'), DK, [0, 44, 0]);
        add(gr, g.cbox(3.0, 3.6, 5.0, 0.8), GM, [0.6, 39.4, 0]);
      }, 1, 'sh');
      // ---------- pied gris ----------
      P[sd + 'fo'] = sidePart(z, gr => {
        add(gr, patch('amFTcore', { tab: FT, map: band(0, 2 * PI, -7.0, 19.0), closed: true, nu: 10, nv: 5, off: -0.7, c: 0, t: 0, axis: 'x' }), SAT);
        add(gr, patch('amFTrear', { tab: FT, map: band(0, 2 * PI, -4.4, 12.2), closed: true, nu: 16, nv: 6, c: 0.4, t: 1.0, axis: 'x' }), GRY);
        add(gr, patch('amFTheel', { tab: FT, map: band(0, 2 * PI, -7.15, -5.0), closed: true, nu: 16, nv: 2, c: 0.3, t: 0.9, axis: 'x' }), GM);
        add(gr, patch('amFTtoe', { tab: FT, map: band(0, 2 * PI, 12.8, 19.3), closed: true, nu: 16, nv: 3, c: 0.4, t: 1.0, axis: 'x' }), GRY);
        // cou-de-pied : plaque en relief (joints nets)
        add(gr, patch('amFTinstep', { tab: FT, map: band(150 * D, 210 * D, 1.6, 11.4), nu: 6, nv: 6, off: 0.22, c: 0.22, t: 0.8, axis: 'x' }), GRY);
        add(gr, g.shape('amecaSole', s => {
          s.moveTo(-4.8, -4.6); s.lineTo(13.8, -5.0); s.quadraticCurveTo(19.8, -4.9, 19.8, 0); s.quadraticCurveTo(19.8, 4.9, 13.8, 5.0);
          s.lineTo(-4.8, 4.6); s.quadraticCurveTo(-7.6, 4.4, -7.6, 0); s.quadraticCurveTo(-7.6, -4.4, -4.8, -4.6);
        }, 1.8, 0.4, 4), RU, [0, -6.0, 0], [PI / 2, 0, 0]);
        add(gr, g.ccyl(3.0, 6.8, 0.6, 12, 'z'), DK);
        add(gr, g.ccyl(2.1, 0.7, 0.25, 12, 'z'), ST, [0, 0, 4.4]);
        add(gr, g.ccyl(2.1, 0.7, 0.25, 12, 'z'), ST, [0, 0, -4.4]);
      }, 1, 'fo');
    }

    const tick = ctx.override ? undefined : (t, state) => {
      const st = state && state.st;
      const sup = st === 'super' || st === 'special';
      LED.emissiveIntensity = LED.userData.baseI * (0.75 + 0.25 * Math.sin(t * 3.1));
      IRIS.emissiveIntensity = IRIS.userData.baseI * ((sup ? 2.2 : 0.9) + 0.1 * Math.sin(t * 1.7));
      // clignement + regard
      const ph = (t * 0.27) % 1, bl = ph < 0.035 ? Math.sin(ph / 0.035 * PI) : 0;
      const shut = st === 'down' || st === 'ko' ? 0.85 : st === 'hit' ? 0.45 : 0;
      const k = Math.max(bl, shut);
      for (const l of lids) l.rotation.z = -58 * D * k;
      const gx = 0.12 * Math.sin(t * 0.53) * Math.sin(t * 0.21), gy = 0.06 * Math.sin(t * 0.37);
      for (let i = 0; i < irises.length; i++) { irises[i].rotation.z = gy; irises[i].rotation.y = i ? -gx : gx; }
    };
    return { parts: P, shZ: 21.2, hpZ: 10.4, tick };
  };
})();
