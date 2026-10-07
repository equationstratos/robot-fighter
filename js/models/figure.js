'use strict';
/* =========================================================
   Modèle 3D : FIGURE 02 (Figure AI, 2024) — d'après la photo officielle (vue de face)
   Contrat : voir js/kit.js.
   Design : coques gris anthracite satinées (« gunmetal » #3b3e44), mécanique noire.
   Tête : œuf noir laqué plus haut que large ; deux caméras rondes empilées (front / menton),
   logo Figure lumineux (carrés en escalier) + 3 points entre les deux.
   Buste : gilet gris lisse (plastron enveloppant, emmanchures ovales, bretelles d'épaule),
   panneau inférieur « F.02 », logo blanc en escalier ; taille noire étroite à biellettes.
   Bassin « haltère » : barre noire horizontale + gros tambours gris aux hanches.
   Épaules : grosses rotules sphériques gris foncé. Bras gris, bande grillagée noire
   (haut-parleur) au bas du bras, coudes gris, avant-bras effilés, grandes mains noires.
   Jambes : bague noire à ailettes en haut de cuisse, manchon de cuisse, disques de genou,
   long tibia effilé ouvert en arche sur la cheville noire, pieds « baskets » noirs.
   Technique : coques = « patchs » découpés dans des profils à section rectangle arrondi
   (interpolés le long de l'axe), chanfrein + paroi (arêtes vives, joints sombres),
   normales « à pli » (crease) ; petits détails fusionnés (fuse).
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

  /* ---------- outils de surface ---------- */
  const YV = new T.Vector3(0, 1, 0);
  // repère local de surface d'un profil : p (point), n (normale sortante), tu (sens +a), tv (sens +y)
  const frameAt = (tab, a, y, off = 0) => {
    const p0 = SP(tab, a, y, off), p1 = SP(tab, a + 0.5, y, off), p2 = SP(tab, a, y + 0.05, off);
    const tu = new T.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize();
    const tv = new T.Vector3(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]).normalize();
    return { p: new T.Vector3(p0[0], p0[1], p0[2]), n: tv.clone().cross(tu).normalize(), tu, tv };
  };
  // matrice : axe Y de l'objet le long de la normale (vis, lentilles, LED…)
  const nMat = (tab, a, y, lift = 0, off = 0) => {
    const f = frameAt(tab, a, y, off);
    return new T.Matrix4().compose(f.p.addScaledVector(f.n, lift), new T.Quaternion().setFromUnitVectors(YV, f.n), new T.Vector3(1, 1, 1));
  };
  // repère « texte » (x = droite du lecteur, y = haut, z = normale) au point de la face avant où z = zt
  const textMat = (tab, y, zt, off = 0) => {
    let lo = -80, hi = 80;
    for (let it = 0; it < 32; it++) { const m = (lo + hi) / 2; if (SP(tab, m, y, off)[2] < zt) lo = m; else hi = m; }
    const f = frameAt(tab, (lo + hi) / 2, y, off);
    const right = f.tu.clone().negate(), up = f.n.clone().cross(right).normalize();
    return new T.Matrix4().makeBasis(right, up, f.n).setPosition(f.p.addScaledVector(f.n, 0.02));
  };

  /* ---------- lettrage F.02 (barres : [cx, cy, largeur, hauteur]) ---------- */
  const GLYPHS = {
    F: { w: 1.2, s: [[-0.4, 0, 0.24, 1.6], [0.08, 0.68, 0.96, 0.24], [-0.02, 0.04, 0.76, 0.24]] },
    '.': { w: 0.6, s: [[0, -0.68, 0.26, 0.24]] },
    0: { w: 1.3, s: [[-0.4, 0, 0.24, 1.6], [0.4, 0, 0.24, 1.6], [0, 0.68, 1.04, 0.24], [0, -0.68, 1.04, 0.24]] },
    2: { w: 1.3, s: [[0, 0.68, 1.04, 0.24], [0.4, 0.34, 0.24, 0.68], [0, 0, 1.04, 0.24], [-0.4, -0.34, 0.24, 0.68], [0, -0.68, 1.04, 0.24]] }
  };
  // logo Figure : carrés en escalier ([colonne, rangée] ; colonne +1 = droite du lecteur)
  const LOGO4 = [[0.5, 1.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -1.5]];
  const LOGO2 = [[0.5, 0.5], [-0.5, -0.5]];

  /* ---------- profils (unités design, 1 ≈ 1 cm) ---------- */
  const LT = lay(6, 6, 6, 3), LL = lay(4, 4, 4, 3), LH = lay(2, 4, 2, 7);
  // buste « gilet » (origine = bassin) : avant = +X
  const CH = prof(LT, [
    { y: 15.2, xp: 9.0, xn: 8.8, z: 9.8, rp: 4.0, rn: 4.0 },
    { y: 16.4, xp: 10.6, xn: 10.2, z: 11.2, rp: 4.8, rn: 4.6 },
    { y: 18.6, xp: 11.3, xn: 10.9, z: 11.9, rp: 5.2, rn: 5.0 },
    { y: 25, xp: 11.9, xn: 11.4, z: 12.5, rp: 5.4, rn: 5.2 },
    { y: 33, xp: 12.3, xn: 11.7, z: 12.8, rp: 5.6, rn: 5.4 },
    { y: 41, xp: 12.4, xn: 11.9, z: 12.9, rp: 5.6, rn: 5.4 },
    { y: 48, xp: 12.2, xn: 11.7, z: 12.8, rp: 5.5, rn: 5.4 },
    { y: 53, xp: 11.7, xn: 11.3, z: 12.5, rp: 5.3, rn: 5.2 },
    { y: 55.6, xp: 11.0, xn: 10.8, z: 12.0, rp: 5.0, rn: 5.0 },
    { y: 57.8, xp: 9.8, xn: 9.8, z: 10.9, rp: 4.5, rn: 4.5 },
    { y: 59.6, xp: 8.0, xn: 8.2, z: 9.0, rp: 3.8, rn: 3.8 },
    { y: 60.8, xp: 6.6, xn: 6.8, z: 7.2, rp: 3.3, rn: 3.3 },
    { y: 61.6, xp: 5.8, xn: 6.0, z: 6.0, rp: 3.0, rn: 3.0 }
  ], { bxp: 0.7, bxn: 0.6, bzp: 0.4, bzn: 0.4 });
  // tête : œuf (centre = origine, visage vers +X), plus haute que large, menton étroit
  const HEAD = (() => {
    const yT = 11.4, yB = -11.6, yc = 2.0, list = [], NS = 36;
    const se = (t, n) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(t)), n)), 1 / n);
    for (let i = 0; i <= NS; i++) {
      const y = yB + (yT - yB) * (1 - Math.cos(i / NS * PI)) / 2;
      const up = y >= yc, t = up ? (y - yc) / (yT - yc) : (yc - y) / (yc - yB);
      const k = up ? se(t, 2.25) : se(t, 2.35), lw = up ? 0 : t;
      const xp = Math.max(0.06, 8.3 * k), xn = Math.max(0.06, 9.3 * k * (1 - 0.3 * lw)), z = Math.max(0.06, 7.5 * k * (1 - 0.3 * lw));
      // section « stade » (arcs pleins, pas de bombé : surface lisse sans arête)
      list.push({ y, xp, xn, z, x0: 1.0 * lw * lw, rp: 0.985 * Math.min(xp, z), rn: 0.985 * Math.min(xn, z), bxp: 0, bxn: 0, bzp: 0.35 * k, bzn: 0.35 * k });
    }
    return prof(LH, list);
  })();
  // membres : origine = articulation proximale, +Y vers l'extrémité ; AVANT = -X (xn), extérieur = +Z (zp)
  const UA = prof(LL, [
    { y: -1, x: 4.2, z: 4.3, r: 3.2 },
    { y: 6, xp: 4.65, xn: 4.65, zp: 4.8, zn: 4.65, r: 3.6 },
    { y: 14, xp: 4.75, xn: 4.75, zp: 4.85, zn: 4.7, r: 3.65 },
    { y: 21, xp: 4.6, xn: 4.6, zp: 4.7, zn: 4.55, r: 3.55 },
    { y: 28, xp: 4.5, xn: 4.5, zp: 4.6, zn: 4.45, r: 3.5 },
    { y: 34, xp: 4.4, xn: 4.4, zp: 4.5, zn: 4.3, r: 3.4 }
  ], { b: 0.1 });
  const FA = prof(LL, [
    { y: -1, xp: 4.8, xn: 4.8, zp: 5.0, zn: 4.8, r: 3.6 },
    { y: 4, xp: 5.3, xn: 5.2, zp: 5.3, zn: 5.0, r: 3.9 },
    { y: 10, xp: 5.2, xn: 5.1, zp: 5.2, zn: 4.9, r: 3.9 },
    { y: 18, xp: 4.85, xn: 4.75, zp: 4.85, zn: 4.6, r: 3.7 },
    { y: 25, xp: 4.4, xn: 4.3, zp: 4.4, zn: 4.2, r: 3.4 },
    { y: 29, xp: 3.7, xn: 3.6, zp: 3.7, zn: 3.5, r: 2.8 },
    { y: 32, xp: 3.4, xn: 3.3, zp: 3.4, zn: 3.2, r: 2.6 }
  ], { b: 0.1 });
  const TH = prof(LL, [
    { y: -1, xp: 5.8, xn: 6.0, zp: 6.0, zn: 5.8, r: 4.4 },
    { y: 13, xp: 6.6, xn: 6.8, zp: 6.8, zn: 6.5, r: 4.9 },
    { y: 22, xp: 6.8, xn: 7.0, zp: 7.0, zn: 6.6, r: 5.1 },
    { y: 30, xp: 6.4, xn: 6.6, zp: 6.5, zn: 6.1, r: 4.9 },
    { y: 38, xp: 5.8, xn: 5.9, zp: 5.9, zn: 5.5, r: 4.4 },
    { y: 44, xp: 5.2, xn: 5.2, zp: 5.3, zn: 5.0, r: 4.0 }
  ], { b: 0.14 });
  const SHN = prof(LL, [
    { y: -2, xp: 5.8, xn: 5.6, zp: 5.9, zn: 5.6, r: 4.2 },
    { y: 4, xp: 6.4, xn: 6.0, zp: 6.1, zn: 5.8, r: 4.4 },
    { y: 12, xp: 6.4, xn: 5.8, zp: 5.9, zn: 5.6, r: 4.3 },
    { y: 22, xp: 5.6, xn: 5.2, zp: 5.2, zn: 5.0, r: 3.9 },
    { y: 32, xp: 4.6, xn: 4.5, zp: 4.4, zn: 4.2, r: 3.4 },
    { y: 40, xp: 4.0, xn: 4.0, zp: 3.9, zn: 3.7, r: 3.0 },
    { y: 45, xp: 3.7, xn: 3.7, zp: 3.6, zn: 3.4, r: 2.8 }
  ], { b: 0.12 });
  // pied : profil le long de +X (axis 'x') ; x du profil = -Y du pied (xp = vers le bas, xn = vers le haut)
  const footTab = (rows, rp, rn, b) => prof(LL, rows.map(([x, yb, yt, w]) => ({ y: x, x0: -(yb + yt) / 2, x: (yt - yb) / 2, z: w, rp, rn })), { b });
  const FT = footTab([
    [-8.2, -4.4, -0.6, 3.6], [-7.4, -4.6, 1.8, 5.0], [-4.5, -4.6, 3.0, 5.4], [0, -4.6, 3.2, 5.5], [3.5, -4.6, 2.2, 5.6],
    [7.5, -4.6, 0.4, 5.7], [11.5, -4.6, -1.0, 5.6], [15, -4.6, -2.0, 5.2], [17.6, -4.6, -2.9, 4.1], [18.7, -4.5, -3.7, 2.2]
  ], 0.9, 3.2, 0.3);
  const SOLE = footTab([
    [-8.5, -6.5, -4.4, 3.6], [-7.7, -6.6, -4.4, 5.05], [-4.5, -6.6, -4.4, 5.5], [0, -6.6, -4.4, 5.6], [3.5, -6.6, -4.4, 5.7],
    [7.5, -6.6, -4.4, 5.8], [11.5, -6.6, -4.4, 5.7], [15, -6.5, -4.4, 5.25], [17.7, -6.3, -4.4, 4.1], [19.0, -5.9, -4.4, 2.2]
  ], 0.6, 0.5, 0);

  // pied « bloc » pour le LOD bas (semelle + tige en un seul volume)
  const FLO = footTab([
    [-8.4, -6.6, -0.6, 3.6], [-7.4, -6.6, 1.8, 5.0], [-4.5, -6.6, 3.0, 5.4], [0, -6.6, 3.2, 5.5], [3.5, -6.6, 2.2, 5.6],
    [7.5, -6.6, 0.4, 5.7], [11.5, -6.6, -1.0, 5.6], [15, -6.5, -2.0, 5.2], [17.6, -6.3, -2.9, 4.1], [18.9, -5.9, -3.7, 2.2]
  ], 0.8, 3.0, 0);

  let GRILLE = null; // texture de grille fine (bande « haut-parleur » des bras)

  return function (ctx) {
    const { g, M, L, ch } = ctx;
    const low = ctx.lod === 'low';
    const P = {};
    let nMesh = 0;
    const add = (parent, geo, mat, p, r, s) => { nMesh++; return ctx.add(parent, geo, mat, { p, r, s }); };

    /* ---------- matériaux ---------- */
    const GS = ctx.mat({ color: 0x51565e, roughness: 0.4, metalness: 0.25, clearcoat: 0.55, clearcoatRoughness: 0.28, envMapIntensity: 1.0 });   // coque gris anthracite satinée
    const GS2 = ctx.mat({ color: 0x3c3f45, roughness: 0.48, metalness: 0.2, clearcoat: 0.4, clearcoatRoughness: 0.36, envMapIntensity: 0.85 }); // panneau un ton plus sombre
    const GD = ctx.mat({ color: 0x2f3237, roughness: 0.3, metalness: 0.35, clearcoat: 0.85, clearcoatRoughness: 0.12, envMapIntensity: 1.0 });   // rotules gris foncé laquées
    const BK = ctx.mat({ color: 0x121316, roughness: 0.48, metalness: 0.45, clearcoat: 0.2, clearcoatRoughness: 0.5, envMapIntensity: 0.7 });     // mécanique noire satinée
    const NB = ctx.mat({ color: 0x0a0b0d, roughness: 0.14, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 });     // noir laqué (tête, mains, chaussures)
    const GB = ctx.mat({ color: 0x484c53, roughness: 0.2, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.1 });     // rotules d'épaule laquées
    const HB = ctx.mat({ color: 0x141518, roughness: 0.34, metalness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.28, envMapIntensity: 0.8 });     // mains (noir satiné-brillant)
    const HP = ctx.mat({ color: 0x17181c, roughness: 0.5, metalness: 0.25, clearcoat: 0.35, clearcoatRoughness: 0.4, envMapIntensity: 0.7 });      // capot dorsal de main
    const VI = M.visor, SE = M.seam, ST = M.steel;
    const RU = ctx.mat({ color: 0x1b1c1f, roughness: 0.75, metalness: 0.05, envMapIntensity: 0.35 });
    const WT = ctx.mat({ color: 0xe8ebef, roughness: 0.45, metalness: 0.05, clearcoat: 0.4, envMapIntensity: 0.6 });                              // marquages blancs
    const BZ = ctx.mat({ color: 0xc4c9d0, roughness: 0.32, metalness: 0.35, clearcoat: 0.6, envMapIntensity: 1.0 });                // bagues de caméra
    const LENS = ctx.mat({ color: 0x0a0f1a, roughness: 0.03, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5 });
    const LED = ctx.glow(ch.accent, 2.6);           // logo facial lumineux
    const LEDS = ctx.glow(0x7f78ff, 2.2);           // voyants d'état (col, bas du buste)
    if (!GRILLE && !ctx.override) { GRILLE = ctx.tex('grille').clone(); GRILLE.repeat.set(6, 1.6); GRILLE.needsUpdate = true; }
    const MESH = ctx.mat({ color: 0x3c3f45, map: GRILLE, roughness: 0.6, metalness: 0.35, envMapIntensity: 0.6 });

    // pièce latérale : le côté 'b' est un miroir en Z ; ly = facteur de longueur (os réel / os de conception)
    const sidePart = (sd, build, ly = 1) => { const part = ctx.group(), inner = ctx.group(); inner.scale.set(1, ly, sd < 0 ? -1 : 1); part.add(inner); build(inner); return part; };
    const rod = (parent, a, b, r, mat, seg = 10) => {
      const va = new T.Vector3(...a), vb = new T.Vector3(...b), d = vb.clone().sub(va), l = d.length();
      const m = add(parent, g.cyl(r, r, l, seg), mat, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
      m.quaternion.setFromUnitVectors(YV, d.normalize()); return m;
    };
    const rodItem = (a, b, r, seg = 8) => {
      const va = new T.Vector3(...a), vb = new T.Vector3(...b), d = vb.clone().sub(va), l = d.length();
      const m = new T.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), new T.Quaternion().setFromUnitVectors(YV, d.normalize()), new T.Vector3(1, 1, 1));
      return [g.cyl(r, r, l, seg), null, m];
    };
    const screw = (r = 0.34) => g.cyl(r, r * 0.8, 0.12, 6);   // tête de vis (bon marché en triangles)
    const mirrorGroups = [];   // marquages : restent lisibles quand le robot regarde à gauche
    const markGroup = (parent) => { const gr = ctx.group(); gr.userData.noMerge = true; parent.add(gr); mirrorGroups.push(gr); return gr; };

    /* =====================================================
       LOD bas (images rémanentes) : même silhouette, très peu de triangles
       ===================================================== */
    if (low) {
      const torso = ctx.group();
      add(torso, loft('figLoCH', CH, 15.2, 61.6, 5, { capB: true, capT: true }), GS);
      add(torso, g.cyl(5.6, 6.2, 11, 8), BK, [0, 10.4, 0]);
      add(torso, g.cyl(5.0, 5.0, 25, 8, 'z'), BK);
      for (const z of [1, -1]) add(torso, g.cyl(6.2, 6.2, 9.8, 10, 'z'), GS, [0, 0, z * 12.7]);
      P.torso = torso;
      P.neck = ctx.group(ctx.mesh(g.cyl(3.8, 5.2, 10, 8), BK, { p: [0, 5, 0] }));
      P.head = ctx.group(ctx.mesh(loft('figLoHD', HEAD, -11.6, 11.4, 8, { capB: true, capT: true }), NB, { p: [0, -1, 0] }));
      for (const [sd, z] of [['f', 1], ['b', -1]]) {
        P[sd + 'sc'] = ctx.group(ctx.mesh(g.sphere(6.0, 10, 8), GD));
        P[sd + 'ua'] = sidePart(z, gr => add(gr, loft('figLoUA', UA, 4, 33, 2), GS));
        P[sd + 'fa'] = sidePart(z, gr => add(gr, loft('figLoFA', FA, -1, 31.5, 3), GS));
        P[sd + 'th'] = sidePart(z, gr => add(gr, loft('figLoTH', TH, 4, 40, 3), GS), L.th / 44);
        P[sd + 'sh'] = sidePart(z, gr => add(gr, loft('figLoSH', SHN, 0, 44, 3), GS), L.sh / 44);
        P[sd + 'kn'] = ctx.group(ctx.mesh(g.cyl(4.4, 4.4, 13, 8, 'z'), GS));
        P[sd + 'el'] = ctx.group(ctx.mesh(g.cyl(4.8, 4.8, 10.4, 8, 'z'), GS));
        P[sd + 'fo'] = sidePart(z, gr => add(gr, loft('figLoFT', FLO, -8.4, 18.9, 4, { capB: true, capT: true, axis: 'x' }), NB));
        P[sd + 'ha'] = RK.hand(ctx, { side: z, palm: [8.2, 3.2, 7.4], palmMat: BK, fingerMat: BK });
      }
      return { parts: P, shZ: 18, hpZ: 12.5 };
    }

    /* =====================================================
       TORSE : bassin « haltère », taille noire, buste gilet
       ===================================================== */
    const torso = ctx.group();
    {
      // --- bassin : bloc central noir + barre transversale + tambours de hanche gris ---
      add(torso, g.cbox(12.6, 10.2, 11.0, 2.4), BK, [0, 0, 0]);
      add(torso, g.cbox(9.6, 1.0, 8.4, 0.4), GS, [0, 5.2, 0]);                        // capot supérieur (biseau clair)
      add(torso, g.cbox(1.0, 5.4, 8.0, 0.35), GS2, [6.35, 1.4, 0]);                     // plaque avant
      add(torso, g.ccyl(4.6, 36, 0.6, 24, 'z'), BK);                                    // barre transversale
      add(torso, fuse('figPvBolts', [[-2.8, 3.4], [2.8, 3.4], [-2.8, -0.6], [2.8, -0.6]].map(([z, y]) => [g.ccyl(0.4, 0.3, 0.1, 8, 'x'), [6.9, y, z]])), ST);
      for (const z of [1, -1]) {
        add(torso, g.ccyl(5.7, 11.4, 1.0, 28, 'z'), GS, [0, 0, z * 12.5]);             // tambour
        add(torso, g.ccyl(5.2, 1.2, 0.3, 20, 'z'), BK, [0, 0, z * 6.4]);                // bague intérieure
        add(torso, g.cyl(5.74, 5.74, 0.3, 28, 'z', true), SE, [0, 0, z * 9.4]);         // joint
      }

      // --- taille noire mécanique (colonne cannelée + biellettes) ---
      add(torso, g.ccyl(4.4, 11.4, 0.6, 24), BK, [0, 10.4, 0]);
      add(torso, fuse('figWaistRings', [6.4, 8.4, 10.4, 12.4].map(y => [g.ccyl(5.1, 0.9, 0.3, 18), [0, y, 0]])), GD);
      add(torso, g.cbox(15.4, 1.2, 17.4, 0.5), BK, [0, 15.1, 0]);                       // platine sous le buste
      {
        const links = [], balls = [];
        for (const z of [1, -1]) for (const x of [1, -1]) {
          const a = [x * 5.8, 14.6, z * 6.8], b = [x * 2.8, 6.0, z * 4.4];
          links.push(rodItem(a, b, 0.75));
          balls.push([g.sphere(1.05, 6, 4), a], [g.sphere(1.0, 6, 4), b]);
          links.push(rodItem([x * 6.6, 14.4, z * 2.6], [x * 4.6, 6.2, z * 6.0], 0.55));
        }
        add(torso, fuse('figWaistLinks', links), BK);
        add(torso, fuse('figWaistBalls', balls), ST);
      }

      // --- buste ---
      // emmanchure : rectangle arrondi (superellipse) qui déborde sur les coins avant/arrière,
      // visible de face entre le plastron et la rotule d'épaule (look « gilet »)
      const hole = a => { const d = Math.min(1, Math.abs(Math.abs(na(a)) - 90) / 49); return Math.pow(Math.max(0, 1 - Math.pow(d, 4)), 0.25); };
      const ARM_LO = a => 50.0 - 7.6 * hole(a);       // bas de l'emmanchure (haut du panneau latéral)
      const ARM_HI = a => 50.4 + 7.0 * hole(a);       // haut de l'emmanchure (bas de la bretelle)
      const TOMB = a => 43.4 - 9 * Math.pow(clamp((Math.abs(na(a)) - 13) / 24, 0, 1), 2);
      add(torso, loft('figCHcore', CH, 15.2, 61.6, 7, { off: -0.9, capB: true, capT: true }), SE);
      add(torso, patch('figFront', { tab: CH, a0: -40, a1: 40, y0: 15.2, y1: 60.9, nv: 11, c: 0.5, t: 1.4 }), GS);
      add(torso, patch('figTomb', { tab: CH, a0: -37, a1: 37, y0: 16.6, y1: TOMB, nv: 8, off: 0.22, c: 0.3, t: 0.7 }), GS2);
      for (const s of [1, -1]) {
        const A0 = s > 0 ? 42 : -138, A1 = s > 0 ? 138 : -42;
        add(torso, patch('figSide' + s, { tab: CH, a0: A0, a1: A1, y0: 15.2, y1: ARM_LO, nv: 9, c: 0.5, t: 1.4 }), GS);
        add(torso, patch('figStrap' + s, { tab: CH, a0: A0, a1: A1, y0: ARM_HI, y1: 60.9, nv: 3, c: 0.5, t: 1.4 }), GS);
        add(torso, patch('figSock' + s, { tab: CH, a0: A0 + 2, a1: A1 - 2, y0: 42.0, y1: 58.2, nv: 5, off: -0.55, c: 0.3, t: 0.5 }), BK);
        // bourrelet de l'emmanchure (arête claire qui accroche les néons)
        const rim = [];
        for (let i = 0; i <= 20; i++) { const a = A0 + 1.2 + (A1 - A0 - 2.4) * i / 20; rim.push(SP(CH, a, ARM_LO(a) - 0.3, 0.05)); }
        for (let i = 20; i >= 0; i--) { const a = A0 + 1.2 + (A1 - A0 - 2.4) * i / 20; rim.push(SP(CH, a, ARM_HI(a) + 0.3, 0.05)); }
        rim.push(rim[0]);
        add(torso, g.tube(rim, 0.4, 56, 6), GB);
      }
      add(torso, patch('figBackPan', { tab: CH, a0: 146, a1: 214, y0: 35.0, y1: a => 54.0 - 2.4 * Math.pow((180 - Math.abs(na(a))) / 34, 2), nv: 5, off: 0.16, c: 0.22, t: 0.5 }), GS);
      add(torso, patch('figBackUp', { tab: CH, a0: 140, a1: 220, y0: 31.0, y1: 60.9, nv: 8, c: 0.5, t: 1.4 }), GS);
      add(torso, patch('figBackLo', { tab: CH, a0: 140, a1: 220, y0: 15.2, y1: 30.4, nv: 6, c: 0.5, t: 1.4 }), GS);
      add(torso, patch('figBackVent', { tab: CH, a0: 158, a1: 202, y0: 19.5, y1: 27.5, nv: 3, off: -0.2, c: 0.2, t: 0.5 }), SE);
      {
        const slots = [];
        for (let i = 0; i < 6; i++) { const y = 20.4 + i * 1.3, p = SP(CH, 180, y, -0.25); slots.push([g.cbox(0.5, 0.55, 7.2, 0.15), [p[0] - 0.05, y, 0]]); }
        add(torso, fuse('figBackSlots', slots), BK);
      }
      add(torso, patch('figCollar', { tab: CH, closed: true, y0: 61.0, y1: 61.6, nv: 1, off: -0.4, c: 0.15, t: 0.4 }), GD);
      // vis du plastron / du dos
      const screws = [];
      for (const s of [1, -1]) {
        for (const [a, y] of [[36, 33.5], [36, 22.5], [36, 17.8], [150, 52], [150, 34], [150, 19], [90, 24], [90, 36]]) screws.push([screw(0.36), null, nMat(CH, s * a, y, 0.05)]);
      }
      add(torso, fuse('figScrews', screws), SE);
      // voyants d'état (col + bas du buste)
      add(torso, fuse('figStatus', [[g.cbox(0.5, 0.35, 1.6, 0.12), null, nMat(CH, 0, 60.6, 0.1)], [g.cbox(0.6, 0.35, 2.4, 0.12), null, nMat(CH, 0, 15.9, 0.15)]]), LEDS);
      // marquages : logo en escalier + « F.02 » + ligne de texte fine
      {
        const mg = markGroup(torso), items = [];
        for (const [cx, cy] of LOGO4) items.push([g.cbox(1.62, 1.62, 0.3, 0.12), null, textMat(CH, 50.2 + cy * 1.65, -cx * 1.65, 0.02)]);
        const word = 'F.02', yL = 39.8, sc = 1.9 / 1.6;
        let width = 0; for (const c of word) width += GLYPHS[c].w * sc;
        let zc = width / 2;
        for (const c of word) {
          const gl = GLYPHS[c], zt = zc - gl.w * sc / 2; zc -= gl.w * sc;
          const Mb = textMat(CH, yL, zt, 0.24);
          for (const st of gl.s) items.push([g.box(st[2] * sc, st[3] * sc, 0.22), null, Mb.clone().multiply(new T.Matrix4().makeTranslation(st[0] * sc, st[1] * sc, 0))]);
        }
        let zz = 2.6; const wds = [0.5, 0.42, 0.55, 0.3, 0.48, 0.5, 0.36, 0.52, 0.45, 0.4];
        for (const w of wds) { items.push([g.box(w, 0.22, 0.2), null, textMat(CH, 37.9, zz - w / 2, 0.24)]); zz -= w + 0.12; }
        items.push([g.box(1.6, 0.18, 0.2), null, textMat(CH, 18.6, 0, 0.24)]);
        ctx.add(mg, fuse('figMarks', items), WT);
      }
    }
    P.torso = torso;

    /* =====================================================
       COU : colonne gris très foncé, évasée vers le col
       ===================================================== */
    {
      const n = ctx.group();
      add(n, g.lathe([[0, 0], [5.6, 0], [5.5, 1.8], [5.0, 4.4], [4.3, 7.0], [3.4, 10.0], [2.6, 15.6], [0, 15.6]], 24), BK);
      add(n, g.ccyl(5.55, 0.5, 0.15, 24), GD, [0, 2.4, 0]);
      P.neck = n;
    }

    /* =====================================================
       TÊTE : œuf noir laqué, deux caméras empilées, logo lumineux
       ===================================================== */
    {
      const h = ctx.group(); h.position.y = -1.0;   // tête un peu basse : cou court
      // coque d'un seul tenant (œuf lisse) + plaque de nuque
      add(h, patch('figHDshell', { tab: HEAD, closed: true, y0: -11.6, y1: 11.4, nv: 18, c: 0, t: 0, capT: true, capB: true, vmap: v => (1 - Math.cos(v * PI)) / 2 }), NB);
      add(h, patch('figHDnape', { tab: HEAD, a0: 128, a1: 232, y0: -9.6, y1: a => -3.2 + 1.2 * Math.cos((180 - Math.abs(na(a))) / 52 * PI / 2), nv: 4, off: 0.18, c: 0.22, t: 0.6 }), NB);
      const FW = a => Math.abs(na(a)) / 50;
      add(h, patch('figHDface', { tab: HEAD, a0: -50, a1: 50, y0: a => -10.6 + 5.6 * Math.pow(FW(a), 2.2), y1: a => 10.1 - 4.2 * Math.pow(FW(a), 2.4), nv: 13, off: 0.2, c: 0.22, t: 0.8 }), VI);
      // caméras (front / menton) : bague métal + verre
      const cams = [], glass = [];
      const iris = [];
      for (const y of [6.1, -7.2]) {
        cams.push([g.lathe([[1.3, 0.6], [1.75, 0.55], [2.0, 0.25], [2.0, -0.3]], 20), null, nMat(HEAD, 0, y, 0.42)]);
        glass.push([g.lathe([[0, 0.5], [0.55, 0.46], [1.0, 0.3], [1.32, 0.05]], 16), null, nMat(HEAD, 0, y, 0.6)]);
        iris.push([g.torus(0.62, 0.09, 16, 4, PI * 2, 'y'), null, nMat(HEAD, 0, y, 1.0)]);
      }
      add(h, fuse('figCamRings', cams), BZ);
      add(h, fuse('figCamGlass', glass), LENS);
      add(h, fuse('figCamIris', iris), GD);
      // logo lumineux + 3 points (groupe miroir)
      const mg = markGroup(h);
      ctx.add(mg, fuse('figFaceLogo', [
        ...LOGO2.map(([cx, cy]) => [g.cbox(1.22, 1.22, 0.2, 0.08), null, textMat(HEAD, 0.4 + cy * 1.25, -cx * 1.25, 0.3)]),
        [g.ccyl(0.2, 0.2, 0.05, 8, 'z'), null, textMat(HEAD, -2.5, 0, 0.3)]
      ]), LED);
      ctx.add(mg, fuse('figFaceDots', [-1, 1].map(zz => [g.ccyl(0.17, 0.2, 0.05, 8, 'z'), null, textMat(HEAD, -2.5, zz, 0.3)])), ST);
      P.head = ctx.group(h);
    }

    /* =====================================================
       BRAS
       ===================================================== */
    for (const [sd, z] of [['f', 1], ['b', -1]]) {
      // rotule d'épaule sphérique (suit le torse) + actionneur intérieur dans l'emmanchure
      P[sd + 'sc'] = sidePart(z, gr => {
        add(gr, g.ccyl(4.6, 4.6, 0.7, 16, 'z'), BK, [0, -0.6, -6.4]);
        add(gr, fuse('figShRibs', [-7.6, -5.8].map(zz => [g.ccyl(4.9, 0.6, 0.15, 16, 'z'), [0, -0.6, zz]])), GD);
        add(gr, g.lathe([[0, -4.8], [3.2, -4.8], [4.7, -4.1], [5.7, -2.9], [6.15, -1.3], [6.25, 0.3], [6.05, 2.1], [5.45, 3.7], [4.45, 4.95], [3.1, 5.65], [0, 5.8]], 28, 'z'), GB, [0, 0, -0.6]);
        add(gr, g.cyl(6.2, 6.2, 0.28, 28, 'z', true), SE, [0, 0, -1.6]);
        add(gr, g.ccyl(2.9, 0.5, 0.15, 24, 'z'), GS, [0, 0, 5.05]);
        add(gr, g.ccyl(1.3, 0.5, 0.15, 14, 'z'), GD, [0, 0, 5.35]);
      });
      // bras : col sombre, coque grise, bande texte, grille noire, chape du coude
      P[sd + 'ua'] = sidePart(z, gr => {
        add(gr, loft('figUAcore', UA, -1, 33, 4, { off: -0.8 }), BK);
        add(gr, patch('figUAneck', { tab: UA, closed: true, y0: 4.6, y1: 6.6, nv: 1, off: -0.3, c: 0.2, t: 0.5 }), GD);
        add(gr, patch('figUAsh', { tab: UA, closed: true, y0: 7.0, y1: 19.4, nv: 6, c: 0.45, t: 1.2 }), GS);
        add(gr, patch('figUApan', { tab: UA, a0: 62, a1: 118, y0: 9.4, y1: 17.2, nv: 3, off: 0.18, c: 0.25, t: 0.6 }), GS2);
        add(gr, patch('figUAband', { tab: UA, closed: true, y0: 19.8, y1: 20.8, nv: 1, off: -0.1, c: 0.15, t: 0.4 }), BK);
        add(gr, g.cyl(4.62, 4.62, 7.0, 32, 'y', true), MESH, [0, 24.5, 0]);
        add(gr, fuse('figUArings', [[g.ccyl(4.85, 0.5, 0.15, 20), [0, 21.0, 0]], [g.ccyl(4.8, 0.5, 0.15, 20), [0, 28.0, 0]]]), GD);
        add(gr, patch('figUAlow', { tab: UA, a0: -60, a1: 60, y0: 28.4, y1: 33.6, nv: 2, c: 0.4, t: 1.0 }), GS);
        for (const zz of [1, -1]) add(gr, g.prism([[-3.4, 28.2], [3.6, 28.2], [3.9, 31.5], [2.4, 35.2], [-2.4, 35.2], [-3.9, 31.5]], 1.4, 0.4), GS, [0, 0, zz * 4.35]);
      });
      // coude : moyeu gris + flasques claires + couvre-olécrane
      P[sd + 'el'] = sidePart(z, gr => {
        add(gr, g.ccyl(4.5, 8.0, 0.6, 18, 'z'), BK);
        for (const zz of [1, -1]) {
          add(gr, g.ccyl(4.3, 1.6, 0.55, 24, 'z'), GS, [0, 0, zz * 5.2]);
          add(gr, g.ccyl(2.6, 0.5, 0.15, 16, 'z'), GD, [0, 0, zz * 6.1]);
        }
        add(gr, g.prism([[1.4, -3.4], [4.4, -2.0], [5.0, 1.0], [3.8, 3.6], [1.4, 3.0]], 7.6, 0.5), GS);
      });
      // avant-bras gris effilé, manchette, poignet noir
      P[sd + 'fa'] = sidePart(z, gr => {
        add(gr, loft('figFAcore', FA, -1, 31.5, 4, { off: -0.7 }), BK);
        add(gr, patch('figFAtop', { tab: FA, a0: -86, a1: 86, y0: 3.4, y1: 24.6, nv: 7, c: 0.45, t: 1.2 }), GS);
        add(gr, patch('figFAbot', { tab: FA, a0: 94, a1: 266, y0: 3.4, y1: 24.6, nv: 7, c: 0.45, t: 1.2 }), GS);
        add(gr, patch('figFAcuff', { tab: FA, closed: true, y0: 25.3, y1: 28.6, nv: 2, c: 0.35, t: 0.9 }), GS);
        add(gr, patch('figFAwr', { tab: FA, closed: true, y0: 29.0, y1: 31.4, nv: 1, off: -0.35, c: 0.2, t: 0.5 }), BK);
        add(gr, fuse('figFAscrews', [[0, 6], [0, 22], [180, 6], [180, 22]].map(([a, y]) => [screw(0.3), null, nMat(FA, a, y, 0.05)])), SE);
      });
      P[sd + 'ha'] = figHand(z);
    }

    /* =====================================================
       JAMBES
       ===================================================== */
    const fin = (r, h, n, dep) => {
      const pts = [], da = 2 * PI / n, f = v => +v.toFixed(3);
      for (let i = 0; i < n; i++) {
        const a = i * da;
        for (const [k, rr] of [[0.06, r - dep], [0.22, r], [0.5, r], [0.66, r - dep]]) pts.push([f(Math.cos(a + k * da) * rr), f(Math.sin(a + k * da) * rr)]);
      }
      return g.prism(pts, h, 0);
    };
    for (const [sd, z] of [['f', 1], ['b', -1]]) {
      // hanche : moyeu tournant sur la face extérieure du tambour
      P[sd + 'hi'] = sidePart(z, gr => {
        add(gr, g.ccyl(4.3, 0.8, 0.3, 28, 'z'), GD, [0, 0, 6.0]);
        add(gr, boltRing(g, 6, 3.3, 0.34, 0.5), ST, [0, 0, 6.45]);
        add(gr, g.ccyl(1.9, 0.6, 0.2, 18, 'z'), GS, [0, 0, 6.6]);
      });
      // cuisse : bague noire à ailettes, manchon, cuisse basse
      P[sd + 'th'] = sidePart(z, gr => {
        add(gr, loft('figTHcore', TH, -1, 44, 5, { off: -0.9 }), BK);
        add(gr, fin(6.3, 8.0, 30, 0.6), BK, [0, 9.4, 0], [PI / 2, 0, 0]);
        add(gr, patch('figTHcuff', { tab: TH, closed: true, y0: 13.6, y1: 23.2, nv: 5, off: 0.45, c: 0.5, t: 1.4 }), GS);
        add(gr, patch('figTHlow', { tab: TH, closed: true, y0: 23.6, y1: 37.6, nv: 6, c: 0.45, t: 1.2 }), GS);
        add(gr, patch('figTHarch', { tab: TH, a0: 138, a1: 222, y0: a => 30.4 + 4.2 * Math.pow((180 - Math.abs(na(a))) / 42, 1.6), y1: 37.2, nv: 3, off: 0.12, c: 0.18, t: 0.45 }), GS);
        add(gr, fuse('figTHscrews', [[160, 35.6], [200, 35.6], [90, 26], [90, 34]].map(([a, y]) => [screw(0.32), null, nMat(TH, a, y, 0.05)])), SE);
      }, L.th / 44);
      // genou : axe noir, disques gris latéraux, rotule grise
      P[sd + 'kn'] = sidePart(z, gr => {
        add(gr, g.ccyl(4.4, 11.0, 0.6, 18, 'z'), BK);
        for (const zz of [1, -1]) {
          add(gr, g.ccyl(4.3, 1.9, 0.65, 24, 'z'), GS, [0, 0, zz * 6.3]);
          add(gr, g.ccyl(2.6, 0.5, 0.15, 16, 'z'), GD, [0, 0, zz * 7.35]);
          add(gr, g.ccyl(0.9, 0.4, 0.1, 10, 'z'), ST, [0, 0, zz * 7.7]);
        }
        add(gr, g.prism([[-3.8, -3.6], [-5.7, -2.0], [-6.3, 1.2], [-5.6, 4.2], [-3.8, 5.0], [-3.2, -3.2]], 9.0, 0.6), GS);
      });
      // tibia : long, effilé, ouvert en arche sur la cheville noire
      P[sd + 'sh'] = sidePart(z, gr => {
        const ARCH = a => { const u = Math.min(1, (180 - Math.abs(na(a))) / 60); return 39.6 - 6.6 * Math.sqrt(Math.max(0, 1 - u * u)); };
        add(gr, loft('figSHcore', SHN, -2, 45, 5, { off: -0.8 }), BK);
        add(gr, patch('figSHfr', { tab: SHN, a0: 93, a1: 267, y0: 2.6, y1: ARCH, nv: 8, c: 0.5, t: 1.3 }), GS);
        add(gr, patch('figSHbk', { tab: SHN, a0: -87, a1: 87, y0: 2.6, y1: 39.6, nv: 8, c: 0.5, t: 1.3 }), GS);
        add(gr, patch('figSHpan', { tab: SHN, a0: 144, a1: 216, y0: 5.0, y1: a => 17.0 - 1.6 * Math.pow((180 - Math.abs(na(a))) / 36, 4), nv: 3, off: 0.12, c: 0.18, t: 0.45 }), GS);
        add(gr, fuse('figSHscrews', [[156, 21.5], [204, 21.5], [90, 8], [90, 30], [-90, 8], [-90, 30]].map(([a, y]) => [screw(0.3), null, nMat(SHN, a, y, 0.05)])), SE);
        // cheville noire : vérins d'Achille + bloc
        for (const zz of [1, -1]) {
          rod(gr, [4.8, 24, zz * 1.9], [3.6, 41.5, zz * 1.7], 0.55, ST, 8);
          add(gr, g.ccyl(1.0, 2.2, 0.3, 12), BK, [4.8, 24.4, zz * 1.9]);
        }
        add(gr, g.ccyl(3.4, 6.8, 0.8, 16, 'z'), BK, [-0.2, 40.4, 0]);
        add(gr, fuse('figAnkLinks', [1, -1].flatMap(zz => [rodItem([-2.6, 34.5, zz * 2.2], [-2.2, 42.2, zz * 2.6], 0.42, 6), [g.sphere(0.7, 6, 4), [-2.6, 34.5, zz * 2.2]]])), ST);
      }, L.sh / 44);
      // pied : basket noire (tige laquée, semelle épaisse, embout, contrefort, logo)
      P[sd + 'fo'] = sidePart(z, gr => {
        add(gr, loft('figSOLE', SOLE, -8.5, 19.0, 8, { capB: true, capT: true, axis: 'x' }), RU);
        add(gr, loft('figFTup', FT, -8.2, 18.7, 11, { capB: true, capT: true, axis: 'x' }), NB);
        add(gr, patch('figFTtoe', { tab: FT, a0: 96, a1: 264, y0: 11.6, y1: 18.7, nv: 4, off: 0.2, c: 0.25, t: 0.7, axis: 'x' }), NB);
        add(gr, patch('figFTheel', { tab: FT, a0: 64, a1: 296, y0: -8.2, y1: -4.4, nv: 3, off: 0.2, c: 0.25, t: 0.7, axis: 'x' }), NB);
        add(gr, g.cbox(1.2, 2.6, 2.4, 0.4), BK, [-8.5, 1.2, 0]);                             // languette arrière
        add(gr, g.shape('figureMidsole', sh => {
          const R = [[-8.4, 3.6], [-7.6, 5.0], [-4.5, 5.45], [0, 5.55], [3.5, 5.65], [7.5, 5.75], [11.5, 5.65], [15, 5.2], [17.6, 4.05], [18.9, 2.1]];
          R.forEach(([x, w], i) => i ? sh.lineTo(x, w) : sh.moveTo(x, w)); for (let i = R.length - 1; i >= 0; i--) sh.lineTo(R[i][0], -R[i][1]);
        }, 0.4, 0.1, 1), GD, [0, -4.45, 0], [PI / 2, 0, 0]);
        add(gr, patch('figFTtongue', { tab: FT, a0: 148, a1: 212, y0: 0.5, y1: 8.5, nv: 4, off: 0.2, c: 0.25, t: 0.6, axis: 'x' }), BK);
        add(gr, g.ccyl(3.0, 9.0, 0.5, 20, 'z'), BK);
        for (const zz of [1, -1]) add(gr, g.ccyl(2.2, 0.6, 0.2, 18, 'z'), GD, [0, 0, zz * 4.7]);
        // logo latéral (extérieur)
        const zs = SP(FT, 90, 6.5)[2] + 0.1;
        add(gr, fuse('figShoeLogo', LOGO2.map(([cx, cy]) => [g.cbox(0.72, 0.72, 0.2, 0.06), [6.5 + cx * 0.76, -2.6 + cy * 0.76, zs]])), GS);
      });
    }

    /* =====================================================
       MAIN (contrat de RK.hand : origine = poignet, +X = doigts, paume -Y, userData.setCurl)
       grande main noire, phalanges laquées, articulations gunmetal
       ===================================================== */
    function figHand(side) {
      const root = ctx.group(), inner = ctx.group();
      if (side < 0) inner.scale.z = -1;
      root.add(inner);
      const PL = 8.0, PT = 3.2, PW = 7.2, FW = 1.55, FL = [3.8, 2.7, 2.2], FTH = [2.1, 1.9, 1.7], X0 = 2.4;
      const zf = i => ((i + 0.5) / 4 - 0.5) * 6.6;
      // poignet
      add(inner, g.ccyl(2.7, 2.6, 0.5, 16, 'x'), BK, [1.1, 0, 0]);
      add(inner, g.ccyl(3.0, 0.6, 0.2, 16, 'x'), GD, [2.2, 0, 0]);
      // paume arrondie, capot dorsal bombé, coussinet
      add(inner, g.rbox(PL, PT, PW, 1.1, 1), HB, [X0 + PL / 2, -0.1, 0]);
      add(inner, g.rbox(PL - 1.6, 1.0, PW - 1.2, 0.45, 2), HP, [X0 + PL / 2 + 0.1, PT / 2 + 0.1, 0]);
      add(inner, g.cbox(PL - 3.0, 0.3, 0.5, 0.1), SE, [X0 + PL / 2 + 0.1, PT / 2 + 0.6, 0]);
      add(inner, g.rbox(PL - 2.2, 0.7, PW - 1.4, 0.3, 1), RU, [X0 + PL / 2 + 0.3, -PT / 2 - 0.12, 0]);
      add(inner, fuse('figKnuck', [0, 1, 2, 3].map(i => [g.cyl(1.0, 1.0, 1.45, 10, 'z'), [X0 + PL - 0.3, 0.2, zf(i)]])), GD);
      // phalange : prisme octogonal chanfreiné (section t × w), embout arrondi pour la dernière
      const phal = (Lx, t, w, tip) => fuse(`figPhal${Lx},${t},${w},${tip}`, [
        [tip ? g.lathe([[0, -0.5], [0.4, -0.5], [0.5, -0.38], [0.5, 0.18], [0.42, 0.38], [0.24, 0.5], [0, 0.53]], 8, 'x') : g.ccyl(0.5, 1, 0.12, 8, 'x'), [Lx / 2, 0, 0], [PI / 8, 0, 0], [Lx - 0.3, t, w]]
      ]);
      const joint = (t, w) => fuse(`figPJ${t},${w}`, [[g.cyl(t * 0.44, t * 0.44, w * 1.08, 7, 'z'), [0, 0, 0]]]);
      const fingers = [];
      for (let i = 0; i < 4; i++) {
        const zz = zf(i), k = [0.92, 1, 0.97, 0.84][i];
        let parent = inner; const segs = [];
        for (let j = 0; j < 3; j++) {
          const piv = ctx.group(); piv.userData.noMerge = true;
          if (j === 0) piv.position.set(X0 + PL + 0.5, 0.15, zz); else piv.position.set(FL[j - 1] * k, 0, 0);
          add(piv, phal(+(FL[j] * k).toFixed(2), FTH[j], FW, j === 2), j === 1 ? BK : HB);
          add(piv, joint(FTH[j], FW), GD);
          parent.add(piv); parent = piv; segs.push(piv);
        }
        fingers.push(segs);
      }
      // pouce (côté -Z pour la main 'f')
      const t0 = ctx.group(); t0.position.set(3.6, -0.6, -3.3); t0.userData.noMerge = true;
      add(t0, phal(3.8, 2.4, 2.0, false), HB); add(t0, joint(2.4, 2.0), GD);
      const t1 = ctx.group(); t1.position.set(3.8, 0, 0); t0.add(t1);
      add(t1, phal(2.9, 2.1, 1.8, false), BK); add(t1, joint(2.1, 1.8), GD);
      const t2 = ctx.group(); t2.position.set(2.9, 0, 0); t1.add(t2);
      add(t2, phal(2.4, 1.9, 1.7, true), HB);
      inner.add(t0);
      root.userData.setCurl = c => {
        for (const segs of fingers) { segs[0].rotation.z = -(6 + 82 * c) * D; segs[1].rotation.z = -(8 + 88 * c) * D; segs[2].rotation.z = -(6 + 64 * c) * D; }
        t0.rotation.set(-(20 + 30 * c) * D, (25 + 20 * c) * D, -(25 + 45 * c) * D);
        t1.rotation.z = -(10 + 35 * c) * D; t2.rotation.z = -(8 + 40 * c) * D;
      };
      root.userData.setCurl(1);
      return root;
    }

    if (typeof window !== 'undefined' && window.__report) {
      window.__report.figureMeshes = nMesh;
      const tp = {}; for (const k in P) { let n = 0; P[k].traverse(o => { if (o.isMesh) { const gg = o.geometry; n += (gg.index ? gg.index.count : gg.attributes.position.count) / 3; } }); tp[k] = Math.round(n); }
      window.__report.figureTris = tp;
    }
    const tick = ctx.override ? undefined : (t, state) => {
      const sup = state && (state.st === 'super' || state.st === 'special');
      LED.emissiveIntensity = LED.userData.baseI * ((sup ? 1.7 : 0.9) + 0.1 * Math.sin(t * 2.2));
      LEDS.emissiveIntensity = LEDS.userData.baseI * (0.75 + 0.25 * Math.sin(t * 3.1));
      const f = state && state.face < 0 ? -1 : 1;
      for (const gr of mirrorGroups) gr.scale.z = f;
    };
    return { parts: P, shZ: 18, hpZ: 12.5, tick };
  };
})();
