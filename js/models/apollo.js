'use strict';
/* =========================================================
   Modèle 3D : APPTRONIK APOLLO (2023, 1,73 m, héritage NASA)
   Contrat : voir js/kit.js.
   Base : maillages OFFICIELS (CAO Apptronik, MuJoCo Menagerie, Apache-2.0) — js/meshes/apollo.js
   (enveloppe extérieure décimée + normales transférées de la CAO détaillée, attribut 'n' lu par `realN`).
   Méthode « CAO + carrosserie » :
   - toutes les COQUES BLANCHES (casque, buste, bassin, bras, avant-bras, cuisses, tibias) sont refaites en
     patchs procéduraux nets (sections superelliptiques relevées en coupes sur la CAO pleine résolution) :
     surfaces laquées lisses, chanfreins, joints sombres, hublot ovale des cuisses, écran-visage en creux ;
   - la MÉCANIQUE suit la répartition de couleurs officielle (CAO : genoux, chapes de hanche / d'épaule / de cheville
     BLANCS ; cou, taille, épaules, coudes, poignets, carters de hanche, pieds, mains NOIRS) ; les pièces CAO décimées
     (froissées) sont remplacées par des volumes nets (cou, taille, coudes, poignets, chapes, genou, cheville) ; la CAO
     ne reste que pour la main Ability et quelques biellettes de cuisse (`realCut` retire ce qui est sous les coques) ;
   - ajouts : yeux « boutons » cyan + sourire sur l'écran noir laqué, grilles de haut-parleur en « D », panneau OLED de
     poitrine + LED d'état orange, caméra ventrale, batterie dorsale amovible, bassin en « jupe » à anses,
     chaussures à semelle crantée, doigts articulés de la main Ability (fermeture du poing).
   ========================================================= */
if (typeof RK !== 'undefined' && RK) RK.models.apollo = (function () {
  const T = RK.T, PI = Math.PI, D = PI / 180;
  const GEO = {};                 // géométries décodées (normales transférées), par index de géométrie
  const CUT = {};                 // géométries CAO coupées (sous les coques), par index + clé
  const b64 = s => { const bin = atob(s), n = bin.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  function geoN(data, gi) {
    if (GEO[gi]) return GEO[gi];
    const gm = data.geoms[gi], b = gm.b, q = new Int16Array(b64(gm.v));
    const pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i += 3) for (let k = 0; k < 3; k++) pos[i + k] = b[k] + (q[i + k] + 32768) / 65535 * (b[k + 3] - b[k]);
    const idx = gm.i32 ? new Uint32Array(b64(gm.i)) : new Uint16Array(b64(gm.i));
    let geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setIndex(new T.BufferAttribute(idx, 1));
    if (gm.n) {
      const n8 = new Int8Array(b64(gm.n)), nf = new Float32Array(n8.length);
      for (let i = 0; i < n8.length; i += 3) { const x = n8[i], y = n8[i + 1], z = n8[i + 2], l = Math.hypot(x, y, z) || 1; nf[i] = x / l; nf[i + 1] = y / l; nf[i + 2] = z / l; }
      geo.setAttribute('normal', new T.BufferAttribute(nf, 3));
    } else geo = T.BufferGeometryUtils.toCreasedNormals(geo, 34 * D);
    geo.computeBoundingSphere();
    return (GEO[gi] = geo);
  }

  /* ---------- coques procédurales nettes (même technique que optimus.js) ----------
     profil = sections superelliptiques le long de Y : xf / xb demi-épaisseurs avant / arrière, zo / zi demi-largeurs,
     x0 / z0 décalage du centre, nf / nb exposants (2 = ellipse, 3+ = carré arrondi) */
  const BGU = T.BufferGeometryUtils, GC = {};
  const lerp = (a, b, t) => a + (b - a) * t;
  const crs = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
  const curve = pts => x => {
    const n = pts.length; if (x <= pts[0][0]) return pts[0][1]; if (x >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0; while (i < n - 2 && pts[i + 1][0] < x) i++;
    const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
    return crs(pts[Math.max(0, i - 1)][1], pts[i][1], pts[i + 1][1], pts[Math.min(n - 1, i + 2)][1], t);
  };
  const KEYS = ['xf', 'xb', 'zo', 'zi', 'x0', 'z0', 'nf', 'nb'];
  const prof = list => list.map(s => { const o = Object.assign({ x0: 0, z0: 0, nf: 2.5, nb: 2.5 }, s); if (o.z != null) { o.zo = o.zo == null ? o.z : o.zo; o.zi = o.zi == null ? o.z : o.zi; } if (o.n != null) { o.nf = o.n; o.nb = o.n; } return o; });
  function dims(tab, y) {
    const n = tab.length; if (y <= tab[0].y) return tab[0]; if (y >= tab[n - 1].y) return tab[n - 1];
    let i = 0; while (i < n - 2 && tab[i + 1].y < y) i++;
    const a = tab[i], b = tab[i + 1], t = (y - a.y) / (b.y - a.y), p0 = tab[Math.max(0, i - 1)], p3 = tab[Math.min(n - 1, i + 2)], o = {};
    for (const k of KEYS) o[k] = crs(p0[k], a[k], b[k], p3[k], t);
    return o;
  }
  const spow = (c, e) => (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), e);
  function SP(tab, th, y, off) {
    const d = dims(tab, y), c = Math.cos(th), s = Math.sin(th);
    const ex = Math.max(0.02, (c >= 0 ? d.xf : d.xb) + off), ez = Math.max(0.02, (s >= 0 ? d.zo : d.zi) + off), e = 2 / (c >= 0 ? d.nf : d.nb);
    return [d.x0 + ex * spow(c, e), y, d.z0 + ez * spow(s, e)];
  }
  function grid(rows, closeU) {
    const nv = rows.length, nu = rows[0].length, pos = new Float32Array(nv * nu * 3); let k = 0;
    for (const r of rows) for (const p of r) { pos[k++] = p[0]; pos[k++] = p[1]; pos[k++] = p[2]; }
    const idx = [], uMax = closeU ? nu : nu - 1;
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < uMax; i++) { const i2 = (i + 1) % nu, a = j * nu + i, b = j * nu + i2, c = (j + 1) * nu + i2, d = (j + 1) * nu + i; idx.push(a, c, b, a, d, c); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
  }
  function fan(ring, down) {
    const n = ring.length, pos = new Float32Array((n + 1) * 3); let cx = 0, cy = 0, cz = 0;
    ring.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; cx += p[0]; cy += p[1]; cz += p[2]; });
    pos[n * 3] = cx / n; pos[n * 3 + 1] = cy / n; pos[n * 3 + 2] = cz / n;
    const idx = []; for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (down) idx.push(n, i, j); else idx.push(n, j, i); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
  }
  // panneau découpé dans un profil : map(u, v) -> [theta, y] ; c = chanfrein du bord, t = profondeur de la paroi
  function patch(key, o) {
    const nu = o.nu, nv = o.nv, ck = key + '|' + nu + 'x' + nv;
    if (GC[ck]) return GC[ck];
    const tab = o.tab, map = o.map, closed = !!o.closed, off = o.off || 0, c = o.c == null ? 0.45 : o.c, t = o.t == null ? 1.2 : o.t;
    const at = (u, v, of) => { const m = map(u, v); return SP(tab, m[0], m[1], of); };
    const len = f => { let s = 0, p = f(0); for (let i = 1; i <= 24; i++) { const q = f(i / 24); s += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); p = q; } return s; };
    let du = 0, dv = 0;
    if (c > 0) { dv = Math.min(0.25, c / Math.max(0.01, len(v => at(0.5, v, off)))); if (!closed) du = Math.min(0.25, c / Math.max(0.01, len(u => at(u, 0.5, off)))); }
    const us = [], vs = [], ub = [], vb = [], nU = closed ? nu : nu + 1;
    for (let i = 0; i < nU; i++) { const s = i / nu; us.push(closed ? s : du + (1 - 2 * du) * s); ub.push(s); }
    for (let j = 0; j <= nv; j++) { const s = j / nv; vs.push(dv + (1 - 2 * dv) * s); vb.push(s); }
    const rows = vs.map(v => us.map(u => at(u, v, off)));
    const geos = [grid(rows, closed)], oc = c > 0 ? off - c : off, ow = off - t, loops = [];
    if (closed) {
      loops.push([rows[0], us.map(u => at(u, 0, oc)), us.map(u => at(u, 0, ow))]);
      loops.push([rows[nv].slice().reverse(), us.map(u => at(u, 1, oc)).reverse(), us.map(u => at(u, 1, ow)).reverse()]);
    } else {
      const A = [], Bq = [], W = [], push = (a, u, v) => { A.push(a); Bq.push(at(u, v, oc)); W.push(at(u, v, ow)); };
      for (let i = 0; i <= nu; i++) push(rows[0][i], ub[i], 0);
      for (let j = 0; j <= nv; j++) push(rows[j][nu], 1, vb[j]);
      for (let i = nu; i >= 0; i--) push(rows[nv][i], ub[i], 1);
      for (let j = nv; j >= 0; j--) push(rows[j][0], 0, vb[j]);
      loops.push([A, Bq, W]);
    }
    for (const [A, Bq, W] of loops) { if (c > 0) geos.push(grid([Bq, A], true)); if (t > 0) geos.push(grid([W, c > 0 ? Bq : A], true)); }
    if (closed && o.capB) geos.push(fan(us.map(u => at(u, 0, t > 0 ? ow : oc)), true));
    if (closed && o.capT) geos.push(fan(us.map(u => at(u, 1, t > 0 ? ow : oc)), false));
    const geo = geos.length > 1 ? BGU.mergeGeometries(geos, false) : geos[0];
    if (o.axis === 'x') geo.rotateZ(-PI / 2); else if (o.axis === 'z') geo.rotateX(PI / 2);
    return (GC[ck] = geo);
  }
  const fv = (f, th) => typeof f === 'function' ? f(th) : f;
  const band = (th0, th1, yb, yt) => (u, v) => { const th = lerp(th0, th1, u); return [th, lerp(fv(yb, th), fv(yt, th), v)]; };
  const shield = (y0, y1, wf, c0 = 0) => (u, v) => { const y = lerp(y0, y1, v), w = wf(y); return [c0 + lerp(-w, w, u), y]; };
  // rayon normalisé d'un point dans un profil (1 = sur la surface) et son angle de section
  function rad(tab, x, y, z) {
    const d = dims(tab, y), dx = x - d.x0, dz = z - d.z0;
    const ex = dx >= 0 ? d.xf : d.xb, ez = dz >= 0 ? d.zo : d.zi, n = dx >= 0 ? d.nf : d.nb;
    return [Math.pow(Math.pow(Math.abs(dx / ex), n) + Math.pow(Math.abs(dz / ez), n), 1 / n), Math.atan2(dz / ez, dx / ex)];
  }
  // panneau « stade » (ovale allongé) découpé dans un profil : centre (thc, yc), demi-hauteur hh, demi-largeur angulaire wa, rayon des bouts rr (en y)
  const stadium = (thc, yc, hh, wa, rr) => (u, v) => {
    const y = lerp(yc - hh, yc + hh, v), e = Math.max(0, Math.abs(y - yc) - (hh - rr)) / rr;
    const w = wa * Math.sqrt(Math.max(0.02, 1 - e * e));
    return [thc + lerp(-w, w, u), y];
  };

  /* ---------- cuisse (coordonnées réelles, jambe DROITE ; CAO : r_hip_fe_link) ----------
     coque « baquet » : capot avant/latéral + plaque dorsale, ouverte en haut (moteur de hanche visible),
     ouverte en bas à l'arrière (biellettes du genou), grand hublot ovale sur l'avant-extérieur */
  const TH = prof([
    { y: 50.2, x0: -1.6, xf: 3.4, xb: 7.4, z0: 11.0, zo: 6.2, zi: 6.0 },
    { y: 52.0, x0: -1.3, xf: 6.5, xb: 8.2, z0: 11.0, zo: 7.3, zi: 7.0 },
    { y: 55.0, x0: -1.0, xf: 8.6, xb: 8.7, z0: 11.0, zo: 8.0, zi: 7.7 },
    { y: 60.0, x0: -0.8, xf: 10.0, xb: 9.7, z0: 11.0, zo: 8.6, zi: 8.4 },
    { y: 66.0, x0: -0.9, xf: 10.9, xb: 11.2, z0: 11.0, zo: 9.1, zi: 8.9 },
    { y: 72.0, x0: -1.2, xf: 10.5, xb: 11.2, z0: 11.2, zo: 9.6, zi: 9.2 },
    { y: 78.0, x0: -1.4, xf: 9.4, xb: 10.7, z0: 11.4, zo: 10.0, zi: 9.4 },
    { y: 85.0, x0: -2.0, xf: 7.0, xb: 9.8, z0: 11.4, zo: 8.8, zi: 7.6 }
  ].map(s => Object.assign({ nf: 2.5, nb: 2.3 }, s)));
  const thTop = th => 77.9 - 6.2 * Math.cos(th) + 1.5 * Math.sin(th);
  const thBot = th => 52 - 1.5 * Math.cos(th) + 4.0 * Math.pow(Math.max(0, -Math.cos(th)), 1.5);

  /* ---------- tibia (CAO : r_knee_fe_link) : fuseau effilé, mollet bombé à l'arrière, arête avant ---------- */
  const SH = prof([
    { y: 12.6, x0: -0.7, xf: 0.9, xb: 0.9, z0: 11.3, z: 1.3 },
    { y: 14.0, x0: -1.3, xf: 2.5, xb: 2.3, z0: 11.3, z: 3.2 },
    { y: 17.0, x0: -2.8, xf: 4.4, xb: 4.8, z0: 11.3, z: 4.9 },
    { y: 22.0, x0: -3.3, xf: 5.6, xb: 5.8, z0: 11.45, z: 5.95 },
    { y: 28.0, x0: -3.6, xf: 6.4, xb: 6.4, z0: 11.5, z: 6.65 },
    { y: 34.0, x0: -3.6, xf: 7.25, xb: 7.2, z0: 11.55, z: 7.0 },
    { y: 38.5, x0: -3.4, xf: 7.9, xb: 7.0, z0: 11.55, z: 7.0 }
  ].map(s => Object.assign({ nf: 2.15, nb: 2.4 }, s)));
  const shTop = th => 37.4 + 0.9 * Math.cos(th);

  /* ---------- bras (CAO : r_shoulder_fe_link) : colonne avant + carter d'actionneur du coude à l'arrière ---------- */
  const UA = prof([
    { y: 112.6, x0: 1.3, xf: 2.9, xb: 2.9, z0: 24.0, z: 3.3 },
    { y: 114.5, x0: 1.5, xf: 3.3, xb: 3.4, z0: 24.1, z: 3.9 },
    { y: 119.0, x0: 1.9, xf: 3.9, xb: 4.0, z0: 24.2, z: 4.15 },
    { y: 126.0, x0: 2.6, xf: 4.8, xb: 4.6, z0: 24.4, z: 4.35 },
    { y: 133.0, x0: 2.9, xf: 4.7, xb: 4.7, z0: 24.6, zo: 4.6, zi: 4.0 },
    { y: 137.5, x0: 2.6, xf: 4.2, xb: 4.4, z0: 24.6, zo: 4.2, zi: 3.7 }
  ].map(s => Object.assign({ nf: 3.3, nb: 3.6 }, s)));
  const UB = prof([   // carter arrière (moteur du coude)
    { y: 123.4, x0: -6.4, xf: 3.4, xb: 3.6, z0: 23.6, z: 3.0 },
    { y: 125.0, x0: -6.5, xf: 4.2, xb: 4.4, z0: 23.6, z: 3.7 },
    { y: 131.0, x0: -6.6, xf: 4.4, xb: 4.4, z0: 23.6, z: 3.9 },
    { y: 135.4, x0: -6.4, xf: 4.0, xb: 4.0, z0: 23.6, z: 3.6 }
  ].map(s => Object.assign({ n: 3.2 }, s)));
  /* ---------- avant-bras (CAO : r_wrist_roll_link) : carter « bouteille » qui s'effile vers le poignet ---------- */
  const FA = prof([
    { y: 88.4, x0: -2.1, xf: 2.0, xb: 2.1, z0: 26.4, z: 2.6 },
    { y: 90.5, x0: -2.4, xf: 3.5, xb: 3.7, z0: 26.1, zo: 4.2, zi: 3.9 },
    { y: 94.0, x0: -2.4, xf: 4.4, xb: 4.4, z0: 25.9, zo: 5.4, zi: 5.0 },
    { y: 99.0, x0: -2.2, xf: 4.7, xb: 4.7, z0: 25.8, zo: 5.8, zi: 5.6 },
    { y: 103.0, x0: -2.2, xf: 4.4, xb: 4.6, z0: 25.6, zo: 5.4, zi: 5.4 },
    { y: 105.6, x0: -2.3, xf: 3.9, xb: 4.2, z0: 25.4, z: 4.8 }
  ].map(s => Object.assign({ nf: 3.2, nb: 3.4 }, s)));
  /* ---------- bassin (CAO : pelvis_link), coordonnées réelles ---------- */
  const PV = prof([   // « jupe » évasée vers le bas (étroite sous la taille, large au-dessus des hanches), relevée en coupes
    { y: 95.0, x0: -5.4, xf: 9.6, xb: 9.4, z: 15.0 },
    { y: 97.5, x0: -4.8, xf: 9.6, xb: 9.8, z: 15.5 },
    { y: 101.0, x0: -3.9, xf: 9.6, xb: 9.9, z: 15.2 },
    { y: 104.5, x0: -3.1, xf: 9.6, xb: 9.6, z: 13.6 },
    { y: 107.2, x0: -2.2, xf: 8.7, xb: 7.9, z: 11.2 },
    { y: 109.0, x0: -1.7, xf: 7.6, xb: 6.6, z: 9.6 }
  ].map(s => Object.assign({ nf: 3.4, nb: 2.8 }, s)));
  const pvBot = th => 97.7 - 2.3 * Math.pow(Math.max(0, -Math.cos(th)), 1.3);   // bord inférieur : remonte devant, descend derrière

  /* ---------- tête (CAO : afh_2_1_link), coordonnées réelles : casque arrondi, arcade, grand écran-visage en creux ---------- */
  const HD = prof([
    { y: 155.4, x0: 5.0, xf: 11.0, xb: 11.5, z: 5.6 },
    { y: 157.0, x0: 4.8, xf: 11.3, xb: 11.6, z: 6.3 },
    { y: 160.0, x0: 4.7, xf: 11.4, xb: 11.6, z: 7.2 },
    { y: 164.0, x0: 4.6, xf: 11.5, xb: 11.6, z: 7.5 },
    { y: 169.0, x0: 4.6, xf: 11.6, xb: 11.5, z: 7.5 },
    { y: 171.6, x0: 4.9, xf: 12.2, xb: 11.5, z: 7.5 },
    { y: 173.0, x0: 5.3, xf: 12.4, xb: 11.4, z: 7.45 },
    { y: 175.0, x0: 5.2, xf: 10.6, xb: 10.6, z: 7.2 },
    { y: 177.0, x0: 4.6, xf: 8.2, xb: 8.4, z: 6.1 },
    { y: 178.4, x0: 4.3, xf: 5.4, xb: 5.6, z: 4.2 },
    { y: 179.3, x0: 4.2, xf: 1.6, xb: 1.8, z: 1.3 }
  ].map(s => Object.assign({ nf: 3.6, nb: 2.4 }, s)));
  const hdSplit = th => 171.95 + 5.2 * Math.pow((1 - Math.cos(th)) / 2, 0.8);   // joint arcade / calotte : bas devant, remonte vers l'arrière
  const hdBot = th => { const c = Math.cos(th), x = 4.6 + (c >= 0 ? 11.5 : 11.6) * c; return 164.6 - 0.405 * (x + 6.9); };
  const SCR_W = curve([[156.2, 1.6], [156.8, 3.3], [158, 4.75], [160, 5.6], [162.5, 6.05], [170.4, 6.1], [171.2, 5.6], [171.6, 4.6]]);
  // angle de section où la demi-largeur vaut w (bissection) — sert à découper l'écran dans le casque
  function thAt(tab, y, w, off) {
    const z0 = dims(tab, y).z0; let a = 0, b = PI / 2;
    for (let i = 0; i < 22; i++) { const m = (a + b) / 2; if (SP(tab, m, y, off)[2] - z0 < w) a = m; else b = m; }
    return (a + b) / 2;
  }

  /* ---------- buste (repère du torse : origine = hanche, x local = x réel + 2, y local ≈ y réel − 91,3) ----------
     relevé sur la CAO : caisson profond (33 cm) et étroit (27 cm), bouclier avant bombé (max à y ≈ 41),
     coins supérieurs chanfreinés, grille latérale, dos = structure réelle (CAO) */
  const CH = prof([
    { y: 21.0, xf: 9.4, xb: 10.6, z: 10.4 },
    { y: 23.0, xf: 12.3, xb: 12.0, z: 11.5 },
    { y: 26.0, xf: 13.7, xb: 12.6, z: 12.1 },
    { y: 31.0, xf: 14.5, xb: 12.8, z: 12.7 },
    { y: 37.0, xf: 16.0, xb: 12.8, z: 13.2 },
    { y: 41.5, xf: 16.9, xb: 12.8, z: 13.4 },
    { y: 46.0, xf: 15.6, xb: 12.8, z: 13.4 },
    { y: 50.0, xf: 14.4, xb: 12.5, z: 13.0 },
    { y: 52.3, xf: 12.8, xb: 11.8, z: 12.0 },
    { y: 54.0, xf: 10.2, xb: 10.6, z: 10.2 }
  ].map(s => Object.assign({ nf: 3.6, nb: 3.0 }, s)));
  const PL_W = curve([[21.6, 52 * D], [24, 60 * D], [30, 63 * D], [44, 63 * D], [48, 58 * D], [52.4, 40 * D]]);   // demi-largeur angulaire du bouclier
  const RIDGE = 44.0;                                                                                               // arête horizontale du bouclier

  return function (ctx) {
    const { g, M, L } = ctx;
    const low = ctx.lod === 'low';
    const data = ctx.realData('apollo');
    if (!data) return RK.models.default(ctx);
    const B = data.bodies, P = {};
    const add = (parent, geo, mat, p, r, s) => ctx.add(parent, geo, mat, { p, r, s });
    const V3 = (a) => new T.Vector3(a[0], a[1], a[2]);

    /* ---------- matériaux ---------- */
    const WH = ctx.mat({ color: 0xeeede8, roughness: 0.3, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 0.5 });   // coque blanche laquée
    const WS = ctx.mat({ color: 0xd9dade, roughness: 0.42, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.5 });  // blanc satiné (pièces mécaniques)
    const DK = ctx.mat({ color: 0x1b1d22, roughness: 0.36, metalness: 0.55, clearcoat: 0.7, clearcoatRoughness: 0.25, envMapIntensity: 0.75 }); // graphite (articulations)
    const DKS = ctx.mat({ color: 0x1e2025, roughness: 0.58, metalness: 0.35, clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 0.55 }); // graphite satiné (carters plats)
    const HB = ctx.mat({ color: 0x15161a, roughness: 0.5, metalness: 0.15, clearcoat: 0.45, clearcoatRoughness: 0.35, envMapIntensity: 0.6 });  // main Ability (polymère noir)
    const VI = M.visor;
    const GRL = ctx.mat({ color: 0x3a3e46, roughness: 0.5, metalness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.35, envMapIntensity: 0.6 }); // grilles latérales
    const gtex = low ? null : ctx.tex('grille').clone(); if (gtex) { gtex.needsUpdate = true; gtex.repeat.set(0.12, 0.12); }
    const SPK = ctx.mat({ color: 0x7a808a, roughness: 0.45, metalness: 0.5, envMapIntensity: 0.6, map: gtex });       // haut-parleurs perforés (oreilles)
    const EYE = ctx.glow(0x3fd2ff, 3.2), EYEC = ctx.glow(0xbff4ff, 2.2);
    const OLED = ctx.glow(0x46e0ff, 1.6), SMILE = ctx.glow(0x3fd2ff, 1.6);
    const STAT = ctx.glow(ctx.ch.accent, 3.0);

    /* ---------- maillages réels avec normales transférées ---------- */
    function realN(sel, mat, o) {
      if (low) return ctx.real('apollo', gm => gm.triLow > 0 && (typeof sel === 'function' ? sel(gm) : sel.test(gm.name)), mat, o);
      const gr = new T.Group(), M4 = ctx.realMatrix(o);
      data.geoms.forEach((gm, gi) => {
        if (!(typeof sel === 'function' ? sel(gm) : sel.test(gm.name) || sel.test(gm.body))) return;
        const mm = typeof mat === 'function' ? mat(gm) : mat; if (!mm) return;
        const m = new T.Mesh(geoN(data, gi), mm); m.matrixAutoUpdate = false; m.matrix.copy(M4); gr.add(m);
      });
      return gr;
    }
    // même chose mais exprimé autour d'un pivot (doigts articulés) : renvoie [groupePivot]
    function realPiv(gi, mat, o, pivPart) {
      const M4 = ctx.realMatrix(o).premultiply(new T.Matrix4().makeTranslation(-pivPart.x, -pivPart.y, -pivPart.z));
      const m = new T.Mesh(low ? null : geoN(data, gi), mat); m.matrixAutoUpdate = false; m.matrix.copy(M4);
      return m;
    }

    // CAO coupée : on retire les triangles dont le centroïde (coordonnées réelles) vérifie drop(x, y, z)
    function cutGeo(gi, key, drop) {
      const ck = gi + '|' + key; if (CUT[ck]) return CUT[ck];
      const src = geoN(data, gi); if (!src.index) return src;
      const pos = src.attributes.position.array, idx = src.index.array, keep = [];
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
        if (!drop((pos[a] + pos[b] + pos[c]) / 3, (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3, (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3)) keep.push(idx[t], idx[t + 1], idx[t + 2]);
      }
      const geo = new T.BufferGeometry();
      for (const n in src.attributes) geo.setAttribute(n, src.attributes[n]);
      geo.setIndex(keep); geo.computeBoundingSphere();
      return (CUT[ck] = geo);
    }
    function realCut(sel, key, drop, mat, o) {
      if (low) return realN(sel, mat, o);
      const gr = new T.Group(), M4 = ctx.realMatrix(o);
      data.geoms.forEach((gm, gi) => {
        if (!(typeof sel === 'function' ? sel(gm) : sel.test(gm.name) || sel.test(gm.body))) return;
        const mm = typeof mat === 'function' ? mat(gm) : mat; if (!mm) return;
        const m = new T.Mesh(cutGeo(gi, key, drop), mm); m.matrixAutoUpdate = false; m.matrix.copy(M4); gr.add(m);
      });
      return gr;
    }
    // groupe placé comme une pièce réelle (côté droit), miroir en z pour le côté gauche : on y modélise en cm réels
    const RG = (o, zs) => { const gr = new T.Group(); gr.matrixAutoUpdate = false; gr.matrix.copy(new T.Matrix4().makeScale(1, 1, zs).multiply(ctx.realMatrix(o))); return gr; };

    /* ---------- repères ---------- */
    const k = 1;                                    // 1 cm réel = 1 unité de conception (ch.scale appliqué par le kit)
    const HIP = [-2, 91.255, 0];
    const SH_Y = B.r_shoulder_fe_link[1];           // 143.255
    const tsy = 0.86 * L.to / (SH_Y - HIP[1]);      // épaules réelles → épaules du squelette
    const NECK = [HIP[0], HIP[1] + L.to / tsy, 0];  // base du cou (réel)
    const HEAD = [HIP[0], NECK[1] + L.nk, 0];       // centre de la tête (réel)

    /* =====================================================
       TORSE (bassin + taille + buste + actionneurs de lacet de hanche)
       ===================================================== */
    // CAO gardée (sombre) : taille (roulis / tangage), support du cou, actionneurs de hanche (lacet / abduction)
    const torso = low ? realN(/^(torso_roll_link|torso_pitch_link)$/, DK, { pivot: HIP, k, s: [1, tsy, 1] }) : ctx.group();
    const pr = ctx.group(); pr.position.set(-HIP[0], -HIP[1], 0); torso.add(pr);     // bassin modélisé en cm réels
    if (low) {
      torso.add(ctx.mesh(patch('apLoChest', { tab: CH, map: band(0, 2 * PI, 21, 54), closed: true, nu: 10, nv: 4, c: 0, t: 0, capB: true, capT: true }), WH, { s: [1, tsy, 1] }));
      add(pr, patch('apLoPelv', { tab: PV, map: band(0, 2 * PI, pvBot, 109), closed: true, nu: 10, nv: 3, c: 0, t: 0, capB: true, capT: true }), WH);
      add(pr, g.cbox(12, 8, 26, 2), WH, [-4, 95, 0]);
      for (const zs of [1, -1]) add(pr, g.cyl(6, 6, 10, 10, 'z'), DK, [-2.0, 91.255, zs * 11.6]);
    } else {
      // buste procédural : bouclier avant laqué (2 panneaux, arête horizontale), flancs blancs à ouïes, dos + batterie
      const ch = ctx.group(); ch.scale.y = tsy; torso.add(ch);
      add(ch, patch('apCore', { tab: CH, map: band(0, 2 * PI, 21.2, 53.8), closed: true, nu: 24, nv: 5, off: -0.7, c: 0, t: 0, capB: true, capT: true }), M.seam);
      add(ch, patch('apShieldLo', { tab: CH, map: shield(21.9, RIDGE - 0.32, PL_W), nu: 22, nv: 12, c: 0.5, t: 1.3 }), WH);
      add(ch, patch('apShieldHi', { tab: CH, map: shield(RIDGE + 0.32, 52.7, PL_W), nu: 24, nv: 8, c: 0.5, t: 1.3 }), WH);
      // facettes du bouclier inférieur (CAO) : deux joints en chevron qui descendent vers la caméra ventrale
      for (const zs of [1, -1]) add(ch, patch('apChev' + zs, { tab: CH, map: (u, v) => { const y = lerp(25.6, RIDGE - 0.6, v), a = lerp(0.27, 0.68, Math.pow(v, 0.8)); return [zs * a + lerp(-0.011, 0.011, u), y]; }, nu: 1, nv: 10, off: 0.04, c: 0, t: 0 }), M.seam);
      // caméra de profondeur ventrale (CAO : torso_oak_d_pro front) : boîtier laqué, fenêtre noire, 3 optiques
      { const yc = 23.6, xc = SP(CH, 0, yc, 0)[0];
        add(ch, g.rbox(4.0, 3.3, 11.6, 0.9, 1), WH, [xc + 0.6, yc, 0]);
        add(ch, g.rbox(0.6, 1.5, 9.4, 0.25, 1), VI, [xc + 2.5, yc, 0]);
        for (const zz of [-3.2, 0.9, 3.2]) add(ch, g.cyl(zz === 0.9 ? 0.32 : 0.48, zz === 0.9 ? 0.32 : 0.48, 0.3, 12, 'x'), GRL, [xc + 2.75, yc, zz]); }
      const sideW = curve([[22.6, 152 * D], [26, 150 * D], [48, 150 * D], [52, 142 * D]]);
      for (const zs of [1, -1]) {
        const fr = y => PL_W(y) + 3 * D;   // bord avant du flanc = bord du bouclier + joint
        const map = (u, v) => { const y = lerp(23.0, 51.6, v), a = zs > 0 ? lerp(fr(y), sideW(y), u) : lerp(sideW(y), fr(y), u); return [zs * a, y]; };
        add(ch, patch('apFlank' + zs, { tab: CH, map, nu: 12, nv: 10, c: 0.45, t: 1.1 }), WH);
        const a0 = zs > 0 ? 76 * D : -110 * D, a1 = zs > 0 ? 110 * D : -76 * D;
        add(ch, patch('apVent' + zs, { tab: CH, map: band(a0, a1, 27.2, 46.0), nu: 8, nv: 6, off: 0.12, c: 0.3, t: 0.6 }), GRL);
        for (let i = 0; i < 6; i++) { const y = 29.0 + i * 2.75; add(ch, patch('apSlot' + zs + i, { tab: CH, map: band(a0 + 4 * D, a1 - 4 * D, y, y + 0.8), nu: 6, nv: 1, off: 0.2, c: 0, t: 0 }), M.seam); }
      }
      add(ch, patch('apBack', { tab: CH, map: (u, v) => { const y = lerp(23.0, 51.6, v), a = sideW(y) + 3 * D; return [lerp(a, 2 * PI - a, u), y]; }, nu: 10, nv: 10, c: 0.45, t: 1.1 }), WH);
      // batterie amovible au dos (bloc graphite, poignée, LED d'état)
      add(ch, g.rbox(7.2, 20.5, 10.4, 1.6, 2), DK, [-14.8, 33.0, 0]);
      add(ch, g.rbox(6.0, 18.2, 10.9, 1.2, 1), GRL, [-15.4, 33.0, 0]);
      add(ch, g.cbox(1.6, 1.4, 6.0, 0.45), WH, [-19.0, 41.2, 0]);
      add(ch, g.cbox(2.4, 0.9, 1.4, 0.3), WH, [-18.0, 41.2, 2.8]); add(ch, g.cbox(2.4, 0.9, 1.4, 0.3), WH, [-18.0, 41.2, -2.8]);
      add(ch, g.box(0.3, 0.6, 2.6), STAT, [-18.95, 27.0, 0]);
      // dessus : plateau + ponts d'épaules (blancs) ; arceaux-poignées dorsaux (tubes)
      add(ch, patch('apTop', { tab: CH, map: band(0, 2 * PI, 53.5, 54.6), closed: true, nu: 24, nv: 1, off: -1.0, c: 0, t: 0, capT: true }), WS);
      add(ch, g.ccyl(7.2, 1.4, 0.4, 24), DK, [-0.8, 54.7, 0]);          // embase noire du cou (CAO neck_mount)
      for (const zs of [1, -1]) {
        add(ch, g.cbox(12.5, 5.2, 7.6, 1.3), WH, [-1.2, 51.4, zs * 15.4], [zs * 0.2, 0, 0]);   // capots d'épaule inclinés vers l'extérieur
        add(ch, g.rbox(10.0, 2.6, 8.4, 0.8, 1), DKS, [-1.4, 48.4, zs * 15.6]);
        add(ch, g.tube([[-8.5, 54.3, zs * 7.6], [-14.5, 52.6, zs * 8.0], [-19.6, 45.0, zs * 8.0], [-18.6, 43.2, zs * 7.8], [-12.5, 44.0, zs * 7.4]], 0.85, 20, 8), WS);
      }
      // taille (CAO torso_roll / torso_pitch, noirs) refaite nette : couronne de roulis, bloc moteur de tangage, 2 flasques avant
      add(pr, g.ccyl(9.4, 1.6, 0.4, 28), DK, [0.2, 109.7, 0], [0, 0, 0], [1, 1, 1.05]);
      add(pr, g.ccyl(9.7, 0.5, 0.15, 28), GRL, [0.2, 110.6, 0], [0, 0, 0], [1, 1, 1.05]);
      add(pr, g.rbox(11.0, 3.4, 13.0, 1.0, 1), DK, [0.6, 112.0, 0]);
      for (const zz of [-3.6, 3.6]) { add(pr, g.ccyl(1.9, 0.6, 0.2, 16, 'x'), DKS, [6.3, 111.9, zz]); add(pr, g.ccyl(0.8, 0.3, 0.1, 10, 'x'), GRL, [6.65, 111.9, zz]); }
      // bassin (CAO pelvis_link, laqué blanc) : « jupe » évasée en 2 coques (avant / arrière) sur noyau sombre, joints latéraux,
      // panneau central avant, anses tubulaires latérales ; dessous : carters sombres des moteurs de hanche
      add(pr, patch('apPelvCore', { tab: PV, map: band(0, 2 * PI, th => pvBot(th) + 0.4, 108.8), closed: true, nu: 20, nv: 3, off: -0.6, c: 0, t: 0, capB: true, capT: true }), M.seam);
      add(pr, patch('apPelvF', { tab: PV, map: band(-58 * D, 58 * D, pvBot, 109), nu: 14, nv: 8, c: 0.45, t: 1.0 }), WH);
      add(pr, patch('apPelvB', { tab: PV, map: band(62 * D, 298 * D, pvBot, 109), nu: 22, nv: 8, c: 0.45, t: 1.0 }), WH);
      for (const zs of [1, -1]) {
        add(pr, patch('apPelvSeam' + zs, { tab: PV, map: band(zs * 17 * D, zs * 19 * D, th => pvBot(th) + 0.9, 107.6), nu: 1, nv: 6, off: 0.05, c: 0, t: 0 }), M.seam);
        add(pr, g.tube([[2.2, 100.8, zs * 12.6], [1.0, 104.6, zs * 15.9], [-3.6, 106.6, zs * 16.9], [-8.6, 105.4, zs * 16.5], [-10.8, 101.6, zs * 13.2]], 0.95, 22, 8), WS);
      }
      for (const zs of [1, -1]) {
        add(pr, g.ccyl(5.6, 8.6, 1.4, 22), DK, [-4.0, 98.6, zs * 9.6]);
        add(pr, g.ccyl(5.9, 1.2, 0.4, 22), GRL, [-4.0, 101.6, zs * 9.6]);
        // actionneurs de hanche (lacet → roulis → tangage, CAO : sombres) : carter graphite autour de l'axe de tangage,
        // pris entre les deux flasques blanches de la cuisse
        add(pr, g.rbox(10.5, 6.5, 6.0, 1.6, 1), DKS, [-4.6, 94.6, zs * 11.3]);
        add(pr, g.ccyl(5.8, 5.6, 1.0, 22, 'z'), DK, [-2.0, 91.255, zs * 11.3]);
        for (const dz of [-2.9, 2.9]) add(pr, g.ccyl(6.2, 0.7, 0.25, 22, 'z'), GRL, [-2.0, 91.255, zs * (11.3 + dz)]);
        for (let i = 0; i < 8; i++) { const a = i * PI / 4 + 0.2; add(pr, g.box(1.2, 0.5, 4.4), DKS, [-2.0 + 6.0 * Math.cos(a), 91.255 + 6.0 * Math.sin(a), zs * 11.3], [0, 0, a]); }   // ailettes de refroidissement
        add(pr, g.ccyl(4.6, 1.4, 0.4, 18), DK, [-4.0, 94.0, zs * 9.6]);
      }
    }
    // panneau OLED de poitrine (état de la batterie) + LED d'état orange
    if (!low) {
            const yl = 47.6, sx = SP(CH, 0, yl, 0)[0], sx2 = SP(CH, 0, yl + 1, 0)[0];
      const pan = ctx.group(); pan.position.set(sx + 0.05, yl * tsy, 0); pan.rotation.z = -Math.atan2(sx2 - sx, 1);
      const scr = g.shape('apolloOled', sh => { const w = 4.4, h = 2.3, r = 0.9; sh.moveTo(-w + r, -h); sh.lineTo(w - r, -h); sh.quadraticCurveTo(w, -h, w, -h + r); sh.lineTo(w, h - r); sh.quadraticCurveTo(w, h, w - r, h); sh.lineTo(-w + r, h); sh.quadraticCurveTo(-w, h, -w, h - r); sh.lineTo(-w, -h + r); sh.quadraticCurveTo(-w, -h, -w + r, -h); }, 0.7, 0.2, 6);
      add(pan, scr, VI, [0, 0, 0], [0, PI / 2, 0]);
      for (let i = 0; i < 4; i++) add(pan, g.box(0.2, 1.5, 1.25), i < 3 ? OLED : M.seam, [0.38, 0, 2.6 - i * 1.55]);
      add(pan, g.box(0.2, 0.7, 0.3), OLED, [0.38, 0, -3.55]);
      add(pan, g.cyl(0.42, 0.42, 0.6, 14, 'x'), STAT, [0.25, 0, 5.4]);
      torso.add(pan);
    }
    P.torso = torso;

    /* =====================================================
       COU + TÊTE
       ===================================================== */
    if (low) P.neck = ctx.group(ctx.mesh(g.cbox(6.4, 17, 8.8, 1.2), DK, { p: [-0.6, 3.2, 0] }));
    else {   // cou (CAO neck_yaw_link, noir) refait net : embase du moteur de lacet, fût, collier boulonné, col de tangage
      const nk = ctx.group();
      add(nk, g.rbox(11.0, 4.6, 11.4, 1.1, 1), DK, [-0.6, -3.2, 0]);
      add(nk, g.ccyl(5.3, 0.8, 0.25, 22), GRL, [-0.6, -0.75, 0]);
      add(nk, g.rbox(5.8, 11.5, 8.8, 1.4, 1), DK, [-0.9, 4.6, 0], [0, 0, -0.06]);
      add(nk, g.rbox(7.6, 2.2, 10.0, 0.7, 1), DKS, [-0.2, 1.8, 0]);
      for (const zz of [-3.2, 3.2]) add(nk, g.cyl(0.38, 0.38, 0.4, 8, 'x'), GRL, [3.65, 1.8, zz]);
      add(nk, g.rbox(4.8, 7.0, 5.2, 1.2, 1), DK, [0.4, 11.4, 0], [0, 0, -0.18]);
      add(nk, g.ccyl(2.0, 7.6, 0.4, 16, 'z'), DK, [1.4, 14.4, 0]);
      P.neck = nk;
    }
    const head = ctx.group(), hg = ctx.group(); hg.position.set(-HEAD[0], -HEAD[1], 0); head.add(hg);   // tête modélisée en cm réels
    if (low) add(hg, patch('apHdLo', { tab: HD, map: band(0, 2 * PI, hdBot, 179.3), closed: true, nu: 16, nv: 6, c: 0, t: 0, capB: true, capT: true }), WH);
    else {
      const scrA = y => thAt(HD, y, SCR_W(y), -1.0);
      add(hg, patch('apHdIn', { tab: HD, map: band(0, 2 * PI, th => hdBot(th) + 0.3, 178.9), closed: true, nu: 24, nv: 6, off: -1.25, c: 0, t: 0, capT: true }), M.seam);
      add(hg, patch('apHdTop', { tab: HD, map: band(0, 2 * PI, hdSplit, 179.3), closed: true, nu: 36, nv: 7, c: 0.18, t: 1.1, capT: true }), WH);
      add(hg, patch('apHdLow', { tab: HD, map: (u, v) => {
        let y = lerp(160, 171.45, v), a = (y > 156.2 ? scrA(Math.min(171.5, y)) : 0) + 0.05, th = lerp(a, 2 * PI - a, u);
        for (let i = 0; i < 2; i++) { y = lerp(hdBot(th), hdSplit(th) - 0.12, v); a = (y > 156.2 && y < 171.5 ? scrA(y) : 0) + 0.05; th = lerp(a, 2 * PI - a, u); }
        return [th, y];
      }, nu: 36, nv: 10, c: 0.18, t: 1.1 }), WH);
      add(hg, patch('apHdScr', { tab: HD, map: (u, v) => { const y = lerp(156.2, 171.5, v), a = scrA(y); return [lerp(-a, a, u), y]; }, nu: 14, nv: 12, off: -1.0, c: 0.25, t: 0.5 }), VI);
      // yeux « boutons » lumineux + reflet, petit sourire, posés sur l'écran
      const onScr = (y, zz) => { const th = thAt(HD, y, Math.abs(zz), -1.0) * Math.sign(zz); return SP(HD, th, y, -1.0); };
      for (const zz of [3.15, -3.15]) {
        const pE = onScr(166.6, zz), ang = Math.atan2(zz, 30);
        add(hg, g.ell(0.4, 1.35, 0.98, 12, 8), EYE, [pE[0] + 0.05, pE[1], pE[2]], [0, -ang, 0]);
        add(hg, g.sphere(0.3, 8, 6), EYEC, [pE[0] + 0.32, pE[1] + 0.55, pE[2] + 0.25 * Math.sign(zz)]);
      }
      const pS = onScr(163.0, 0.01), arc = 76 * D;
      add(hg, g.torus(2.5, 0.17, 14, 4, arc, 'x'), SMILE, [pS[0] + 0.12, pS[1] + 0.6, 0], [-PI / 2 - arc / 2, 0, 0]);
      // « oreilles » : grilles de haut-parleur perforées dans un creux ovale des flancs
      const rr = (sh, x0, x1, y0, y1, rf, rb) => {   // rectangle à coins arrondis : rf coins avant (x1), rb coins arrière (x0)
        sh.moveTo(x0 + rb, y0); sh.lineTo(x1 - rf, y0); sh.quadraticCurveTo(x1, y0, x1, y0 + rf); sh.lineTo(x1, y1 - rf); sh.quadraticCurveTo(x1, y1, x1 - rf, y1);
        sh.lineTo(x0 + rb, y1); sh.quadraticCurveTo(x0, y1, x0, y1 - rb); sh.lineTo(x0, y0 + rb); sh.quadraticCurveTo(x0, y0, x0 + rb, y0);
      };
      const ear = g.shape('apolloEarD', sh => rr(sh, -6.1, 5.7, -4.7, 4.7, 2.2, 4.2), 0.5, 0.15, 6);
      const earR = g.shape('apolloEarRD', sh => rr(sh, -6.8, 6.4, -5.4, 5.4, 2.7, 4.8), 0.3, 0, 6);
      for (const zs of [1, -1]) {
        add(hg, earR, M.seam, [3.9, 168.7, zs * 7.4], [0, 0, -6 * D]);
        add(hg, ear, SPK, [3.9, 168.7, zs * 7.5], [0, 0, -6 * D]);
      }
    }
    P.head = head;

    /* =====================================================
       BRAS, MAINS, JAMBES, PIEDS
       ===================================================== */
    for (const [sd, s, z] of [['f', 'r', 1], ['b', 'l', -1]]) {
      const sh = B[s + '_shoulder_fe_link'], el = B[s + '_elbow_fe_link'];
      const hp = B[s + '_hip_fe_link'], kn = B[s + '_knee_fe_link'], an = B[s + '_foot_link'];
      const wr = [-2.2, 81.6, z * 24.3];                       // poignet du jeu (haut de la paume)
      // épaule : réducteur graphite (axe latéral) + flasque, raccord à la CAO (support d'abduction)
      P[sd + 'sc'] = realN(new RegExp(`^${s}_shoulder_aa_link$`), DK, { pivot: sh, k });
      add(P[sd + 'sc'], g.ccyl(5.0, 5.6, 0.9, 20, 'z'), DK, [-1.0, 0, -z * 4.3]);
      if (!low) {
        add(P[sd + 'sc'], g.ccyl(5.5, 1.0, 0.35, 20, 'z'), GRL, [-1.0, 0, -z * 7.3]);
        add(P[sd + 'sc'], g.rbox(7.0, 4.0, 4.6, 1.0, 1), DKS, [-2.0, 3.6, -z * 5.0]);
      }
      const sgn = s === 'r' ? 1 : -1;
      /* ---- bras : colonne laquée + carter arrière, épaule / mécanique réelles (sombres) ---- */
      {
        const part = ctx.group(), oR = { pivot: B.r_shoulder_fe_link, to: B.r_elbow_fe_link, len: L.ua, frame: 'limb', k };
        const gr = RG(oR, z); part.add(gr);
        if (low) add(gr, patch('apUaLo', { tab: UA, map: band(0, 2 * PI, 112.6, 137.5), closed: true, nu: 8, nv: 3, c: 0, t: 0, capB: true, capT: true }), WH);
        else {
          add(gr, patch('apUaCore', { tab: UA, map: band(0, 2 * PI, 112.8, 137.3), closed: true, nu: 16, nv: 3, off: -0.6, c: 0, t: 0, capB: true, capT: true }), M.seam);
          add(gr, patch('apUaF', { tab: UA, map: band(0, 2 * PI, 112.6, 128.6), closed: true, nu: 28, nv: 8, c: 0.4, t: 1.0 }), WH);
          add(gr, patch('apUaT', { tab: UA, map: band(0, 2 * PI, 129.2, 137.5), closed: true, nu: 28, nv: 5, c: 0.4, t: 1.0 }), WH);
          add(gr, patch('apUaCuff', { tab: UA, map: band(0, 2 * PI, 112.4, 114.6), closed: true, nu: 20, nv: 1, off: 0.25, c: 0.25, t: 0.6 }), DK);
          add(gr, patch('apUaOvS', { tab: UA, map: stadium(62 * D, 121.4, 5.6, 0.36, 1.9), nu: 8, nv: 10, off: 0.05, c: 0, t: 0 }), M.seam);
          add(gr, patch('apUaOv', { tab: UA, map: stadium(62 * D, 121.4, 5.1, 0.29, 1.6), nu: 8, nv: 10, off: 0.38, c: 0.25, t: 0.5 }), WH);
          add(gr, patch('apUbCore', { tab: UB, map: band(0, 2 * PI, 123.6, 135.2), closed: true, nu: 12, nv: 2, off: -0.5, c: 0, t: 0, capB: true, capT: true }), M.seam);
          add(gr, patch('apUb', { tab: UB, map: band(-170 * D, 170 * D, 123.4, 135.4), nu: 18, nv: 8, c: 0.4, t: 0.9 }), WH);
          add(gr, g.cyl(1.0, 1.0, 10.5, 10), M.steel, [-5.6, 118.4, 23.6], [0, 0, 0.14]);
          add(gr, g.ccyl(1.7, 2.4, 0.5, 14), DK, [-6.3, 122.6, 23.6]);
          // chape d'épaule (CAO : partie haute de r_shoulder_fe_link, BLANCHE) : moyeu sur l'axe de tangage + flasque extérieure
          add(gr, g.ccyl(4.2, 4.4, 0.6, 20, 'z'), WS, [-0.95, 143.255, 24.8]);
          const bk = [];
          for (let a = 200; a >= -20; a -= 20) bk.push([+(-0.95 + 4.6 * Math.cos(a * D)).toFixed(2), +(143.255 + 4.6 * Math.sin(a * D)).toFixed(2)]);
          bk.push([4.0, 139.5], [4.4, 135.5], [-3.6, 135.5], [-5.3, 139.5]);
          add(gr, g.prism(bk, 1.6, 0.35, 1), WH, [0, 0, 27.6]);
          add(gr, g.ccyl(2.3, 0.8, 0.25, 16, 'z'), DK, [-0.95, 143.255, 28.6]);
          add(gr, g.ccyl(1.2, 0.5, 0.15, 12, 'z'), GRL, [-0.95, 143.255, 29.0]);
          part.add(realCut(new RegExp(`^${s}_shoulder_fe_link$`), 'ua', (x, y, zz) => {
            if (y > 136.8) return true;                         // chape CAO (décimée) → remplacée ci-dessus
            if (y > 112 && rad(UA, x, y, zz * sgn)[0] < 1.35) return true;
            return y > 123 && y < 136 && x < -1.5;
          }, DK, { pivot: sh, to: el, len: L.ua, frame: 'limb', k }));
        }
        P[sd + 'ua'] = part;
      }
      /* ---- avant-bras : coude / poignet réels (sombres) + carter laqué ---- */
      {
        const part = realN(gm => low && (gm.body === s + '_elbow_fe_link' || gm.body === s + '_wrist_yaw_link' || (gm.body === s + '_wrist_pitch_link' && /wrist/i.test(gm.name))),
          DK, { pivot: el, to: wr, len: L.fa, frame: 'limb', k });
        const oR = { pivot: B.r_elbow_fe_link, to: [wr[0], wr[1], 24.3], len: L.fa, frame: 'limb', k };
        const gr = RG(oR, z); part.add(gr);
        if (low) add(gr, patch('apFaLo', { tab: FA, map: band(0, 2 * PI, 88.4, 105.6), closed: true, nu: 8, nv: 3, c: 0, t: 0, capB: true, capT: true }), WH);
        else {
          add(gr, patch('apFaCore', { tab: FA, map: band(0, 2 * PI, 88.6, 105.4), closed: true, nu: 16, nv: 4, off: -0.6, c: 0, t: 0, capB: true, capT: true }), M.seam);
          // coude (CAO r_elbow_fe_link, noir) refait net : carter graphite, axe de flexion, flasque extérieure
          add(gr, g.rbox(10.4, 7.6, 9.8, 1.5, 1), DK, [-2.2, 109.0, 23.8]);
          add(gr, g.ccyl(3.2, 11.6, 0.5, 18, 'z'), DK, [1.463, 111.755, 23.6]);
          add(gr, g.ccyl(2.0, 0.5, 0.15, 14, 'z'), GRL, [1.463, 111.755, 29.5]);
          add(gr, g.rbox(6.8, 4.4, 0.6, 0.25, 1), DKS, [-3.0, 108.4, 28.85]);
          // poignet (CAO wrist_yaw / wrist_pitch, noirs) refait net : carter de roulis incliné vers la paume, bague, adaptateur
          add(gr, g.ccyl(2.15, 0.6, 0.15, 16), GRL, [-2.1, 88.25, 26.3]);
          add(gr, g.ccyl(2.5, 5.6, 0.5, 16), DK, [-2.4, 85.4, 24.7], [0.52, 0, 0]);
          add(gr, g.ccyl(1.3, 6.4, 0.3, 12, 'x'), DK, [-2.6, 84.2, 24.0]);
          add(gr, g.ccyl(2.9, 1.2, 0.3, 16), DKS, [-2.9, 82.9, 23.0], [0.3, 0, 0]);
          add(gr, patch('apFa', { tab: FA, map: band(0, 2 * PI, 88.4, 105.6), closed: true, nu: 28, nv: 12, c: 0.4, t: 1.0 }), WH);
          // panneau « bouteille » en relief sur la face avant-extérieure (CAO), cerné d'un joint
          add(gr, patch('apFaPanS', { tab: FA, map: stadium(-35 * D, 97.6, 6.4, 0.5, 2.6), nu: 10, nv: 10, off: 0.06, c: 0, t: 0 }), M.seam);
          add(gr, patch('apFaPan', { tab: FA, map: stadium(-35 * D, 97.6, 5.9, 0.43, 2.3), nu: 10, nv: 10, off: 0.42, c: 0.3, t: 0.6 }), WH);
          add(gr, patch('apFaRing', { tab: FA, map: band(0, 2 * PI, 104.2, 105.0), closed: true, nu: 24, nv: 1, off: 0.12, c: 0, t: 0 }), M.seam);
        }
        P[sd + 'fa'] = part;
      }
      /* ---- cuisse : coque procédurale nette + mécanique réelle (sombre) ---- */
      {
        const part = ctx.group(), Rr = B.r_hip_fe_link, oR = { pivot: Rr, to: B.r_knee_fe_link, len: L.th, frame: 'limb', k };
        const gr = RG(oR, z); part.add(gr);
        if (low) {
          add(gr, patch('apThLo', { tab: TH, map: band(0, 2 * PI, thBot, thTop), closed: true, nu: 10, nv: 4, c: 0, t: 0, capB: true, capT: true }), WH);
          add(gr, g.cbox(8, 17, 11.5, 1.5), WS, [-1.6, 84.5, 11.3]);   // chape de hanche (silhouette continue bassin → cuisse)
        }
        else {
          add(gr, patch('apThCore', { tab: TH, map: band(0, 2 * PI, th => thBot(th) + 0.3, th => thTop(th) - 0.4), closed: true, nu: 22, nv: 5, off: -0.9, c: 0, t: 0 }), M.seam);
          add(gr, patch('apThFront', { tab: TH, map: band(-104 * D, 104 * D, thBot, thTop), nu: 24, nv: 12, c: 0.5, t: 1.2 }), WH);
          add(gr, patch('apThBack', { tab: TH, map: band(111 * D, 249 * D, thBot, thTop), nu: 14, nv: 10, c: 0.5, t: 1.2 }), WH);
          add(gr, patch('apThOvS', { tab: TH, map: stadium(40 * D, 62.4, 7.6, 0.47, 3.6), nu: 12, nv: 12, off: 0.08, c: 0, t: 0 }), M.seam);
          add(gr, patch('apThOv', { tab: TH, map: stadium(40 * D, 62.4, 7.1, 0.42, 3.3), nu: 12, nv: 12, off: 0.55, c: 0.4, t: 0.8 }), WH);
          // vérin de hanche (pot blanc satiné, CAO : blanc) logé dans le haut de la cuisse, visible par l'ouverture
          add(gr, g.ccyl(5.0, 10.5, 0.7, 22), WS, [0.4, 74.8, 12.2]);
          add(gr, g.ccyl(5.3, 0.9, 0.3, 22), GRL, [0.4, 79.0, 12.2]);
          add(gr, g.ccyl(3.0, 1.0, 0.35, 16), DK, [0.4, 80.4, 12.2]);
          for (const dz of [-2.2, 2.2]) add(gr, g.cyl(0.75, 0.75, 2.2, 8), WS, [-1.6, 80.6, 12.2 + dz]);
          // chape de hanche : deux flasques laquées (CAO : r_hip_fe_link) qui montent de la coque jusqu'à l'axe de tangage
          // (elles encadrent le carter sombre de l'actionneur, porté par le bassin) + cache d'axe sombre
          const yk = [];
          for (let a = 200; a >= -20; a -= 20) yk.push([-2 + 4.0 * Math.cos(a * D), 91.255 + 4.0 * Math.sin(a * D)]);
          yk.push([2.5, 84.0], [2.9, 76.5], [-5.3, 76.5], [-5.9, 84.0]);
          const yoke = g.prism(yk.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), 1.4, 0.3, 1);
          add(gr, yoke, WS, [0, 0, 11.3 - 4.6]); add(gr, yoke, WS, [0, 0, 11.3 + 4.6]);
          add(gr, g.ccyl(2.1, 0.8, 0.25, 16, 'z'), DK, [-2.0, 91.255, 11.3 + 5.6]);
          add(gr, g.ccyl(1.1, 0.5, 0.15, 12, 'z'), GRL, [-2.0, 91.255, 11.3 + 6.0]);
          // fourche du genou (CAO : bas de r_hip_fe_link) : deux flasques laquées qui enveloppent l'axe du genou, cache d'axe sombre
          { const kf = [];
            for (let a = 160; a <= 380; a += 20) kf.push([+(-7 + 3.6 * Math.cos(a * D)).toFixed(2), +(48.755 + 3.6 * Math.sin(a * D)).toFixed(2)]);
            kf.push([-3.9, 57.0], [-10.4, 57.0]);
            const fk = g.prism(kf, 1.2, 0.3, 1);
            add(gr, fk, WH, [0, 0, 11.3 - 5.9]); add(gr, fk, WH, [0, 0, 11.3 + 5.9]);
            add(gr, g.ccyl(1.9, 0.7, 0.2, 14, 'z'), DK, [-7.0, 48.755, 11.3 + 6.7]);
            add(gr, g.ccyl(0.9, 0.4, 0.1, 10, 'z'), GRL, [-7.0, 48.755, 11.3 + 7.1]); }
          part.add(realCut(new RegExp(`^${s}_hip_fe_link$`), 'th', (x, y, zz) => {
            const [r, th] = rad(TH, x, y, zz * sgn);
            if (r < 1.6 && y > thTop(th) - 2.5) return true;      // chape CAO (décimée, froissée) → remplacée par les flasques
            if (y < 57.5) return true;                              // biellettes CAO derrière le genou → le genou procédural du tibia les remplace
            return r < 1.3 && y > thBot(th) - 1.2 && (y < thTop(th) - 2.5 || (r > 0.78 && y < thTop(th) + 0.8));
          }, DK, { pivot: hp, to: kn, len: L.th, frame: 'limb', k }));
        }
        P[sd + 'th'] = part;
      }
      /* ---- tibia ---- */
      {
        const part = ctx.group(), oR = { pivot: B.r_knee_fe_link, to: B.r_foot_link, len: L.sh, frame: 'limb', k };
        const gr = RG(oR, z); part.add(gr);
        if (low) {
          add(gr, patch('apShLo', { tab: SH, map: band(0, 2 * PI, 12.6, shTop), closed: true, nu: 10, nv: 4, c: 0, t: 0, capB: true, capT: true }), WH);
          add(gr, g.cbox(9, 14, 8, 1.5), DK, [-2.5, 44.5, 11.3]);
          add(gr, g.cbox(3.4, 10, 5, 0.8), WS, [-1.8, 10.0, 11.3]);    // chape de cheville
        }
        else {
          add(gr, patch('apShCore', { tab: SH, map: band(0, 2 * PI, 12.8, th => shTop(th) - 0.3), closed: true, nu: 18, nv: 5, off: -0.8, c: 0, t: 0, capB: true }), M.seam);
          add(gr, patch('apSh', { tab: SH, map: band(3 * D, 357 * D, 12.6, shTop), nu: 32, nv: 16, c: 0.45, t: 1.1 }), WH);
          // genou (CAO r_knee_fe_link : BLANC) : carter avant laqué en « bouclier » posé sur le tibia, plaque boulonnée,
          // axe sombre fin à l'arrière + biellettes, vérin à rotule (pot blanc satiné) au dos du haut du tibia
          const kz = 11.3;
          add(gr, g.prism([[-3.0, 37.4], [4.5, 37.4], [5.4, 40.4], [5.5, 45.0], [4.8, 47.4], [3.3, 48.6], [0.4, 48.8], [-2.0, 47.8], [-3.2, 45.4], [-3.4, 40.0]], 8.6, 0.8), WH, [0, 0, kz]);
          add(gr, g.rbox(1.0, 5.4, 6.2, 0.35, 1), DKS, [6.45, 43.9, kz], [0, 0, 0.02]);
          for (const yy of [41.8, 46.0]) for (const dz of [-2.3, 2.3]) add(gr, g.cyl(0.36, 0.36, 0.5, 8, 'x'), M.steel, [7.0, yy, kz + dz]);
          add(gr, g.box(0.3, 0.25, 7.6), M.seam, [6.15, 39.2, kz]);
          add(gr, g.ccyl(1.9, 12.2, 0.4, 16, 'z'), DK, [-7.0, 48.755, kz]);
          for (const dz of [-4.4, 4.4]) {
            add(gr, g.prism([[-9.4, 48.8], [-8.6, 50.6], [-7.0, 51.2], [-5.4, 50.6], [-4.6, 48.6], [-5.6, 44.6], [-7.8, 44.6]], 1.2, 0.3, 1), WS, [0, 0, kz + dz]);
          }
          add(gr, g.ccyl(2.8, 6.0, 0.5, 18), WS, [-6.7, 40.4, kz]);
          add(gr, g.ccyl(3.1, 0.7, 0.2, 18), GRL, [-6.7, 43.2, kz]);
          add(gr, g.cyl(0.55, 0.55, 3.6, 8), M.steel, [-6.7, 45.2, kz]);
          add(gr, g.ccyl(0.95, 2.6, 0.2, 10, 'z'), DK, [-6.7, 46.6, kz]);
          // cheville : chape en fourche (CAO : bas de r_knee_fe_link, blanc satiné) autour de l'axe de tangage
          { const af = [];
            for (let a = 180; a <= 360; a += 30) af.push([+(-2 + 1.9 * Math.cos(a * D)).toFixed(2), +(6.255 + 1.9 * Math.sin(a * D)).toFixed(2)]);
            af.push([0.3, 14.6], [-3.5, 14.6]);
            const fk = g.prism(af, 1.0, 0.25, 1);
            add(gr, fk, WS, [0, 0, kz - 2.6]); add(gr, fk, WS, [0, 0, kz + 2.6]); }
        }
        P[sd + 'sh'] = part;
      }
      /* ---- pied : chaussure procédurale (semelle caoutchouc crantée, tige graphite laquée) + chape de cheville réelle ---- */
      {
        const part = ctx.group(), oR = { pivot: B.r_foot_link, k };
        const gr = RG(oR, z); part.add(gr);
        const zc = 11.1, shoe = ctx.group(); shoe.position.y = 1.0; gr.add(shoe);   // semelle à ≈ 7 sous la cheville (sol du squelette)
        add(shoe, g.prism([[-7.5, -0.85], [13.4, -0.85], [14.5, 0.1], [14.2, 1.0], [13.0, 1.35], [-7.3, 1.35], [-8.0, 0.6], [-8.0, -0.2]], 9.8, 0.55), M.rubber, [0, 0.6, zc]);
        add(shoe, g.prism([[-7.1, 1.2], [12.6, 1.2], [12.9, 1.75], [11.4, 2.5], [5.0, 3.5], [2.2, 4.9], [-3.4, 5.4], [-6.6, 4.6], [-7.4, 3.2]], 8.8, 0.8), M.black, [0, 0, zc]);
        if (!low) {
          add(shoe, g.prism([[3.0, 3.75], [5.2, 3.5], [11.2, 2.55], [12.3, 1.95], [11.0, 1.95], [5.0, 2.9], [3.0, 3.15]], 9.0, 0.2), M.rubber, [0, 0, zc]);
          for (let i = 0; i < 7; i++) add(shoe, g.box(0.6, 0.5, 9.0), M.seam, [-5.6 + i * 2.9, -0.15, zc]);
          add(shoe, g.box(0.25, 0.7, 2.2), STAT, [-7.35, 3.4, zc + 2.6]);
          // cheville (CAO ankle_ie + chape du pied, noirs) refaite nette : étrier graphite + axe de tangage
          add(gr, g.rbox(5.6, 3.8, 3.4, 0.8, 1), DK, [-1.8, 5.1, 11.0]);
          add(gr, g.ccyl(1.5, 7.2, 0.3, 14, 'z'), DK, [-2.0, 6.255, 11.0]);
          for (const dz of [-3.7, 3.7]) add(gr, g.ccyl(0.8, 0.4, 0.1, 10, 'z'), GRL, [-2.0, 6.255, 11.0 + dz]);
        } else part.add(realN(new RegExp(`^${s}_ankle_ie_link$`), DK, { pivot: an, k }));
        P[sd + 'fo'] = part;
      }

      /* ---- main Ability : paume fixe, 4 doigts à 2 phalanges + pouce, articulés ---- */
      const dir = [wr[0] - el[0], wr[1] - el[1]];
      const HO = { pivot: wr, to: [wr[0] + dir[0], wr[1] + dir[1], wr[2]], frame: 'hand', k, r: [-z * PI / 2, 0, 0] };
      const hand = ctx.group();
      const isHand = gm => gm.body === s + '_wrist_pitch_link' && !/wrist/i.test(gm.name);
      const fingerGeo = data.geoms.map((gm, gi) => [gm, gi]).filter(([gm]) => isHand(gm) && !/palm/i.test(gm.name));
      hand.add(realN(gm => isHand(gm) && /palm/i.test(gm.name), HB, HO));
      const M4 = ctx.realMatrix(HO);
      const toPart = (p) => V3(p).applyMatrix4(M4);
      // doigts : [segment proximal, segment distal] triés par x (index → auriculaire), pouce à part
      const segs = fingerGeo.filter(([gm]) => !/thumb/i.test(gm.name));
      const prox = segs.filter((_, i) => i % 2 === 0), dist = segs.filter((_, i) => i % 2 === 1);
      const curlers = [];
      prox.forEach(([g1, i1], f) => {
        const [g2, i2] = dist[f], b1 = g1.b, b2 = g2.b;
        const mcp = toPart([(b1[0] + b1[3]) / 2, b1[4] - 0.9, (b1[2] + b1[5]) / 2]);
        const pip = toPart([(b1[0] + b1[3]) / 2, b2[4] - 0.7, (b2[2] + b2[5]) / 2 + z * 0.4]);
        const p1 = ctx.group(); p1.userData.noMerge = true; p1.position.copy(mcp);
        const p2 = ctx.group(); p2.position.copy(pip.clone().sub(mcp)); p1.add(p2);
        if (!low) { p1.add(realPiv(i1, HB, HO, mcp)); p2.add(realPiv(i2, HB, HO, pip)); }
        hand.add(p1); curlers.push([p1, p2]);
      });
      const th = fingerGeo.filter(([gm]) => /thumb/i.test(gm.name));
      const tb1 = th[0][0].b;
      const tp = toPart([(tb1[0] + tb1[3]) / 2 - 0.6, tb1[4] - 0.6, (tb1[2] + tb1[5]) / 2]);
      const t0 = ctx.group(); t0.userData.noMerge = true; t0.position.copy(tp);
      if (!low) th.forEach(([gm, gi]) => t0.add(realPiv(gi, HB, HO, tp)));
      hand.add(t0);
      // pouce : repos → devant la paume → replié en travers des doigts (deux arcs, sans traverser le dos de la main)
      const tb2 = th[th.length - 1][0].b;
      const d0 = toPart([tb2[3], tb2[1] + 0.6, (tb2[2] + tb2[5]) / 2]).sub(tp).normalize();
      const dm = new T.Vector3(0.45, -0.89, 0).normalize(), d1 = new T.Vector3(0.5, -0.2, 0.84 * z).normalize();
      const q1 = new T.Quaternion().setFromUnitVectors(d0, dm), q2 = new T.Quaternion().setFromUnitVectors(dm, d1).multiply(q1), qI = new T.Quaternion();
      hand.userData.setCurl = (c) => {
        curlers.forEach(([a, b2]) => { a.rotation.z = -(10 + 80 * c) * D; b2.rotation.z = -(8 + 95 * c) * D; });
        if (c <= 0.5) t0.quaternion.slerpQuaternions(qI, q1, c * 2); else t0.quaternion.slerpQuaternions(q1, q2, c * 2 - 1);
      };
      hand.userData.setCurl(1);
      P[sd + 'ha'] = hand;
    }

    const tick = ctx.override ? undefined : (t, state) => {
      const sup = state && (state.st === 'super' || state.st === 'special');
      EYE.emissiveIntensity = EYE.userData.baseI * ((sup ? 1.5 : 0.9) + 0.1 * Math.sin(t * 2.2));
      STAT.emissiveIntensity = STAT.userData.baseI * (0.55 + 0.45 * (Math.sin(t * 3.1) > 0 ? 1 : 0.25));
    };
    return { parts: P, shZ: B.r_shoulder_fe_link[2], hpZ: B.r_hip_fe_link[2], tick };
  };
})();
