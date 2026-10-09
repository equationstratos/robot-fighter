'use strict';
/* =========================================================
   Modèle 3D : AGILITY ROBOTICS DIGIT (v4, 2024)
   Contrat : voir js/kit.js.
   - Jambes : maillages OFFICIELS de Cassie (MuJoCo Menagerie, MIT — Digit reprend la jambe de Cassie),
     recolorés façon Digit : alu brossé, capot de cuisse noir, articulations graphite, tiges exposées.
     Chaque maillage est découpé par matériau (triangle par triangle) et "étiré" seulement dans
     ses zones droites (les rotules restent rondes) pour suivre les os du squelette du jeu.
   - Posture : tant que skeleton() utilise l'ancienne formule « genou inversé » (pied avant qui flotte, pieds
     au-dessus de la hanche accroupi), tick() re-pose les jambes en genou d'autruche et recale le robot au sol ;
     les tiges d'Achille et plantaires sont dynamiques (étirées entre cuisse / tarse / pied à chaque image).
   - Haut du corps procédural d'après photo : buste sarcelle (coques avant/arrière + joints),
     bassin noir, tableau de bord LED vert, tête-capteur blanche avec yeux LED en matrice de points
     sur bandeau noir à caméras, cou « lidar » bleu nuit, épaules en tambour noir avec étrier gris en « Γ »,
     bras gris clair / noir, pinces noires à capot.
   ========================================================= */
if (typeof RK !== 'undefined' && RK) RK.models.digit = (function () {
  const T = RK.T, BGU = T.BufferGeometryUtils, PI = Math.PI, D = PI / 180;
  const GC = {};
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = x => Math.max(0, Math.min(1, x));

  /* ---------- sections « rectangle arrondi » le long de Y ----------
     sec(y) -> { xf, xb, z, r, x0, z0, yy }  (demi-profondeur avant/arrière, demi-largeur, rayon d'angle)
     u ∈ [0,1) : abscisse curviligne normalisée autour de la section, 0 = avant (+X), 0.25 ≈ flanc +Z */
  // rayons d'angle : r côté avant (+X), rb côté arrière (-X)
  function rr(d, u, off) {
    const xf = Math.max(0.01, d.xf + off), xb = Math.max(0.01, d.xb + off), hz = Math.max(0.01, d.z + off);
    const rf = Math.max(0.005, Math.min(d.r + off, xf, hz)), rb = Math.max(0.005, Math.min((d.rb == null ? d.r : d.rb) + off, xb, hz));
    const a1 = hz - rf, c1 = PI * rf / 2, s1 = xf + xb - rf - rb, c2 = PI * rb / 2, a2 = hz - rb;
    const half = a1 + c1 + s1 + c2 + a2;
    let t = ((u % 1) + 1) % 1, sg = 1;
    if (t > 0.5) { t = 1 - t; sg = -1; }
    let l = t * 2 * half, x, z;
    if (l <= a1) { x = xf; z = l; }
    else if ((l -= a1) <= c1) { const a = l / rf; x = xf - rf + rf * Math.cos(a); z = hz - rf + rf * Math.sin(a); }
    else if ((l -= c1) <= s1) { x = xf - rf - l; z = hz; }
    else if ((l -= s1) <= c2) { const a = l / rb; x = -xb + rb - rb * Math.sin(a); z = hz - rb + rb * Math.cos(a); }
    else { l -= c2; x = -xb; z = Math.max(0, hz - rb - l); }
    return [d.x0 + x, d.z0 + sg * z];
  }
  const perim = (d, off) => {
    const xf = d.xf + off, xb = d.xb + off, hz = d.z + off, rf = Math.min(d.r + off, xf, hz), rb = Math.min((d.rb == null ? d.r : d.rb) + off, xb, hz);
    return 2 * (2 * hz - rf - rb + PI * (rf + rb) / 2 + xf + xb - rf - rb);
  };
  function SP(sec, u, y, off) { const d = sec(y), p = rr(d, u, off); return [p[0], d.yy, p[1]]; }
  // fabrique de profil : boîte à arêtes arrondies, dessus/dessous plats fermés (zone de fermeture CL au-delà de yT / yB)
  const CL = 1;
  function rsec(o) {
    const dz = (y, R, e) => R - Math.sqrt(Math.max(0, R * R - (y - e) * (y - e)));
    return y => {
      let f = 1, yy = y;
      if (y > o.yT) { f = clamp01(1 - (y - o.yT) / CL); yy = o.yT; } else if (y < o.yB) { f = clamp01(1 - (o.yB - y) / CL); yy = o.yB; }
      let xf = o.xf, xb = o.xb, z = o.z, r = o.r;
      if (o.tap) { const t = o.tap(yy); xf += t[0]; xb += t[1]; z += t[2]; }
      let ex = 0, ez = 0;
      if (yy > o.yT - o.rTx) ex = dz(yy, o.rTx, o.yT - o.rTx);
      if (yy > o.yT - o.rTz) ez = dz(yy, o.rTz, o.yT - o.rTz);
      if (yy < o.yB + o.rBx) ex = dz(yy, o.rBx, o.yB + o.rBx);
      if (yy < o.yB + o.rBz) ez = dz(yy, o.rBz, o.yB + o.rBz);
      if (!o.flatF) xf -= ex;
      xb -= ex; z -= ez; r = Math.min(r, z - 0.01);
      const rb = Math.min(o.rb == null ? r : o.rb, z - 0.01, Math.max(0.01, xb));
      return { xf: xf * f, xb: xb * f, z: z * f, r: r * f, rb: rb * f, x0: o.x0 || 0, z0: 0, yy };
    };
  }
  // échantillonnage de y : segments [y0, y1, n, mode] (mode 'l' linéaire, 'top' / 'bot' en arc)
  function ysamp(segs) {
    const out = [];
    segs.forEach(([a, b, n, m], si) => {
      for (let i = si ? 1 : 0; i <= n; i++) {
        const s = i / n;
        const k = m === 'top' ? Math.sin(s * PI / 2) : m === 'bot' ? 1 - Math.cos(s * PI / 2) : s;
        out.push(lerp(a, b, k));
      }
    });
    return out;
  }
  function grid(rows, closeU) {
    const nv = rows.length, nu = rows[0].length, pos = new Float32Array(nv * nu * 3);
    let k = 0;
    for (const r of rows) for (const p of r) { pos[k++] = p[0]; pos[k++] = p[1]; pos[k++] = p[2]; }
    const idx = [], uMax = closeU ? nu : nu - 1;
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < uMax; i++) {
      const i2 = (i + 1) % nu, a = j * nu + i, b = j * nu + i2, c = (j + 1) * nu + i2, d = (j + 1) * nu + i;
      idx.push(a, c, b, a, d, c);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }
  /* coque : panneau découpé dans un profil, bord chanfreiné (c) + paroi (t) => arêtes nettes, joints visibles.
     o = { sec, u0, u1, nu, ys (rangées), yLo, yHi (bords ; null = fermé par le profil), off, c, t } */
  function shell(key, o) {
    if (GC[key]) return GC[key];
    const sec = o.sec, closed = o.u1 - o.u0 >= 0.999, off = o.off || 0, c = o.c == null ? 0.3 : o.c, t = o.t == null ? 0.9 : o.t;
    const ys = o.ys, nv = ys.length - 1, nu = o.nu;
    const du = closed || c <= 0 ? 0 : Math.min(0.2 * (o.u1 - o.u0), c / perim(sec(ys[nv >> 1]), off));
    const us = [], ub = [];
    const nU = closed ? nu : nu + 1;
    for (let i = 0; i < nU; i++) { const s = i / nu; us.push(lerp(o.u0 + du, o.u1 - du, s)); ub.push(lerp(o.u0, o.u1, s)); }
    if (closed) for (let i = 0; i < nU; i++) us[i] = ub[i];
    const rows = ys.map(y => us.map(u => SP(sec, u, y, off)));
    const geos = [grid(rows, closed)];
    const oc = off - c, ow = off - t;
    const loops = [];
    if (closed) {
      if (o.yLo != null) loops.push([rows[0], ub.map(u => SP(sec, u, o.yLo, oc)), ub.map(u => SP(sec, u, o.yLo, ow))]);
      if (o.yHi != null) loops.push([rows[nv].slice().reverse(), ub.map(u => SP(sec, u, o.yHi, oc)).reverse(), ub.map(u => SP(sec, u, o.yHi, ow)).reverse()]);
    } else if (c > 0 || t > 0) {
      const A = [], B = [], W = [];
      const push = (a, u, y) => { A.push(a); B.push(SP(sec, u, y, oc)); W.push(SP(sec, u, y, ow)); };
      const yb = o.yLo != null ? o.yLo : ys[0], yt = o.yHi != null ? o.yHi : ys[nv];
      for (let i = 0; i <= nu; i++) push(rows[0][i], ub[i], yb);
      for (let j = 0; j <= nv; j++) push(rows[j][nu], o.u1, ys[j]);
      for (let i = nu; i >= 0; i--) push(rows[nv][i], ub[i], yt);
      for (let j = nv; j >= 0; j--) push(rows[j][0], o.u0, ys[j]);
      loops.push([A, B, W]);
    }
    for (const [A, B, W] of loops) {
      if (c > 0) geos.push(grid([B, A], true));
      if (t > 0) geos.push(grid([W, c > 0 ? B : A], true));
    }
    const geo = geos.length > 1 ? BGU.mergeGeometries(geos.map(gg => gg.toNonIndexed()), false) : geos[0];
    return (GC[key] = geo);
  }
  // fusion locale de petites géométries : items = [[geo, [x,y,z], [rx,ry,rz], échelle]]
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();
  function fuse(key, items) {
    if (GC[key]) return GC[key];
    const list = items.map(([geo, p, r, s]) => {
      const gg = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const n of Object.keys(gg.attributes)) if (n !== 'position' && n !== 'normal') gg.deleteAttribute(n);
      _m.compose(_v.set(...(p || [0, 0, 0])), _q.setFromEuler(_e.set(...(r || [0, 0, 0]))), Array.isArray(s) ? _s.set(...s) : _s.setScalar(s || 1));
      gg.applyMatrix4(_m); return gg;
    });
    return (GC[key] = BGU.mergeGeometries(list, false));
  }

  /* ---------- maillages réels : découpe par matériau + étirement local le long de l'os ----------
     cls(gm, x, y, z) -> clé de matériau | null   (x, y, z = centre du triangle en cm réels, pose de repos)
     warp = [[y, y'], ...] : déformation linéaire par morceaux de la coordonnée Y du repère de la pièce
     (hors des ancrages : simple translation) ; les normales sont corrigées. */
  function warpV(y, kn) {
    const n = kn.length;
    if (y <= kn[0][0]) return y + kn[0][1] - kn[0][0];
    if (y >= kn[n - 1][0]) return y + kn[n - 1][1] - kn[n - 1][0];
    let j = 0; while (j < n - 2 && kn[j + 1][0] < y) j++;
    return kn[j][1] + (y - kn[j][0]) * (kn[j + 1][1] - kn[j][1]) / (kn[j + 1][0] - kn[j][0]);
  }
  function warpY(geo, kn) {
    const P = geo.attributes.position.array, N = geo.attributes.normal.array;
    const n = kn.length;
    for (let i = 0; i < P.length; i += 3) {
      const y = P[i + 1];
      let y2, s = 1;
      if (y <= kn[0][0]) y2 = y + kn[0][1] - kn[0][0];
      else if (y >= kn[n - 1][0]) y2 = y + kn[n - 1][1] - kn[n - 1][0];
      else {
        let j = 0; while (j < n - 2 && kn[j + 1][0] < y) j++;
        s = (kn[j + 1][1] - kn[j][1]) / (kn[j + 1][0] - kn[j][0]);
        y2 = kn[j][1] + (y - kn[j][0]) * s;
      }
      P[i + 1] = y2;
      if (s !== 1) {
        const nx = N[i], ny = N[i + 1] / s, nz = N[i + 2], l = Math.hypot(nx, ny, nz) || 1;
        N[i] = nx / l; N[i + 1] = ny / l; N[i + 2] = nz / l;
      }
    }
  }
  function realPiece(ctx, MAT, ck, sel, o, cls, warp) {
    const key = 'real|' + ck + '|' + ctx.lod;
    let pieces = GC[key];
    if (!pieces) {
      pieces = [];
      const gms = [];
      const grp = ctx.real('cassie', sel, gm => { gms.push(gm); return MAT._dummy; }, o);
      grp.children.forEach((m, i) => {
        const gm = gms[i];
        const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
        if (!src.attributes.normal) src.computeVertexNormals();
        const Pa = src.attributes.position.array, Na = src.attributes.normal.array;
        const Bk = {};
        for (let t = 0; t < Pa.length; t += 9) {
          const k = cls(gm, (Pa[t] + Pa[t + 3] + Pa[t + 6]) / 3, (Pa[t + 1] + Pa[t + 4] + Pa[t + 7]) / 3, (Pa[t + 2] + Pa[t + 5] + Pa[t + 8]) / 3);
          if (!k) continue;
          const b = Bk[k] || (Bk[k] = { p: [], n: [] });
          for (let j = 0; j < 9; j++) { b.p.push(Pa[t + j]); b.n.push(Na[t + j]); }
        }
        for (const k in Bk) {
          const geo = new T.BufferGeometry();
          geo.setAttribute('position', new T.Float32BufferAttribute(Bk[k].p, 3));
          geo.setAttribute('normal', new T.Float32BufferAttribute(Bk[k].n, 3));
          geo.applyMatrix4(m.matrix);
          if (warp) warpY(geo, warp);
          geo.computeBoundingSphere();
          pieces.push([k, geo]);
        }
      });
      GC[key] = pieces;
    }
    const out = new T.Group();
    for (const [k, geo] of pieces) out.add(ctx.mesh(geo, MAT[k] || MAT._dummy));
    return out;
  }

  /* ---------- profils (unités design ≈ cm) ---------- */
  // buste : origine = centre du bassin (axe de tangage des hanches)
  const TOR = { yB: 4.6, yT: 63.5, xf: 13.4, xb: 13.0, z: 17.2, r: 5.4, x0: 0.6, rTx: 6, rTz: 8.5, rBx: 8.6, rBz: 5.2,
    tap: y => [0, 0, -1.4 * (1 - clamp01((y - 15) / 38))] };
  const TS = rsec(TOR);
  const Y_SPLIT = 17.0;           // jonction bassin noir / buste sarcelle (avant)
  const U_SEAM = 0.279;           // joint vertical coque avant / coque arrière (flancs)
  // tête-capteur
  const HEAD = { yB: -5.4, yT: 5.6, xf: 9.6, xb: 9.4, z: 14, r: 4.6, x0: 0, rTx: 3.1, rTz: 4.4, rBx: 1.8, rBz: 1.8 };
  const HS = rsec(HEAD);
  const Y_HEADSPLIT = -1.6;

  /* =========================================================
     SKINS : palette / finitions par ctx.skin ('classic' = matériaux d'origine, modèle strictement identique)
     Emplacements de matériau :
       body (coques du buste) · black (noir satiné : épaules, bras, pinces…) · graph (graphite : genoux, ressorts)
       alu (alu des jambes, tiges) · light (actionneurs gris clair des bras) · white (anneau du logo)
       navy (cou lidar) · blue (bague du genou) · eyebg · visor · rubber · seam
       led / ledh / eye / screen (lumières : tableau LED, halo, yeux, icônes)
       core (noyau visible dans les joints du buste) · pelvis (bassin) · cowl (capot de cuisse) · head (casque-capteur)
       band (bandeau de la tête) · ring (bagues des bras) · dring (liseré des épaules) · strip (bande de cuisse)
       refl / marker (bandes rétro-réfléchissantes, sphères de capture de mouvement : géométrie propre au skin)
     Valeur : paramètres de ctx.mat (+ pat/ps/rk : motif triplanaire, inner/ii : lueur interne),
              { glow, i } pour un matériau émissif, ou le nom d'un emplacement déjà défini.
     geo : géométrie propre au skin — 'refl' (bandes réfléchissantes), 'proto' (lidar + marqueurs), 'lines' (filets lumineux)
     ========================================================= */
  const SKINS = {
    // CASSIE : hommage à la Cassie d'Agility — bleu nuit métallisé verni, alu poli miroir, LED bleues
    cassie: {
      body: { color: 0x2a5cd6, roughness: 0.28, metalness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.9 },   // bleu cobalt vernis (le bleu nuit se noyait dans les arènes sombres)
      black: { color: 0x0e1016, roughness: 0.32, metalness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 0.7 },
      graph: { color: 0x2c3442, roughness: 0.28, metalness: 0.85, envMapIntensity: 0.9 },
      alu: { color: 0xd3d8df, roughness: 0.2, metalness: 0.95, envMapIntensity: 1.1 },
      light: { color: 0xc4cad3, roughness: 0.24, metalness: 0.9, envMapIntensity: 1.0 },
      white: 'alu',
      led: { glow: 0x4a9dff, i: 3.4 }, ledh: { glow: 0x1d4fa8, i: 0.7 }, eye: { glow: 0xdcecff, i: 2.6 }, screen: { glow: 0x6ab4ff, i: 1.0 },
      core: 'black', pelvis: { color: 0x14161b, roughness: 0.26, metalness: 0.7, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.85 },
      cowl: 'body', head: 'alu', blue: { color: 0x4a9dff, roughness: 0.25, metalness: 0.75, envMapIntensity: 0.9 }
    },
    // PROTOTYPE : Digit des débuts (v1-v2) — apprêt blanc mat, gris d'atelier, tête-boîtier sombre surmontée
    // d'un lidar rotatif, sphères de capture de mouvement, voyants ambre
    proto: {
      geo: 'proto',
      body: { color: 0xdcdee0, roughness: 0.58, metalness: 0.02, clearcoat: 0.15, clearcoatRoughness: 0.5, envMapIntensity: 0.45 },
      black: { color: 0x1b1c1f, roughness: 0.55, metalness: 0.12, envMapIntensity: 0.45 },
      graph: { color: 0x45484e, roughness: 0.4, metalness: 0.7, envMapIntensity: 0.7 },
      light: { color: 0x9da2a8, roughness: 0.45, metalness: 0.5, envMapIntensity: 0.6 },
      white: 'light', navy: 'graph',
      led: { glow: 0xffb020, i: 3.2 }, ledh: { glow: 0x9a5a00, i: 0.7 }, eye: { glow: 0xffc860, i: 2.4 }, screen: { glow: 0xffb020, i: 1.0 },
      pelvis: { color: 0x7e838a, roughness: 0.5, metalness: 0.35, clearcoat: 0.2, clearcoatRoughness: 0.4, envMapIntensity: 0.55 },
      cowl: 'pelvis', head: { color: 0x34373c, roughness: 0.45, metalness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 0.6 },
      blue: { color: 0xffa21a, roughness: 0.35, metalness: 0.6, envMapIntensity: 0.7 },
      marker: { color: 0xf2f4f6, roughness: 0.55, metalness: 0, envMapIntensity: 0.4, inner: 0xffffff, ii: 0.32 }
    },
    // SÉCURITÉ : cariste d'entrepôt — jaune fluo haute visibilité, capot et casque orange sécurité, bassin à
    // chevrons de danger, bandes rétro-réfléchissantes micro-prismatiques
    secu: {
      geo: 'refl',
      body: { color: 0xc8f01a, roughness: 0.42, metalness: 0.02, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.4, inner: 0x7a9a00, ii: 0.1 },
      black: { color: 0x17181b, roughness: 0.45, metalness: 0.15, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.6 },
      led: { glow: 0xff7a00, i: 3.2 }, ledh: { glow: 0xb04400, i: 0.7 }, screen: { glow: 0xff8a20, i: 1.0 },
      pelvis: { color: 0xffffff, pat: 'hazard', ps: 1 / 18, roughness: 0.42, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.45 },
      cowl: { color: 0xff5e00, roughness: 0.38, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.15, envMapIntensity: 0.45, inner: 0x802000, ii: 0.08 },
      head: 'cowl', blue: 'cowl',
      refl: { color: 0xe4e8ee, pat: 'prism', ps: 1 / 7, rk: 0.25, roughness: 0.3, metalness: 0.5, envMapIntensity: 1.0, inner: 0xe8eeff, ii: 0.3 }
    },
    // NOCTURNE : noir mat furtif, filets lumineux cyan dans les joints, lidar et bagues allumés
    nocturne: {
      geo: 'lines',
      body: { color: 0x151619, roughness: 0.5, metalness: 0.25, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.6 },
      black: { color: 0x0c0d0f, roughness: 0.4, metalness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 0.6 },
      graph: { color: 0x1d1f23, roughness: 0.32, metalness: 0.8, envMapIntensity: 0.8 },
      alu: { color: 0x3b3e45, roughness: 0.34, metalness: 0.88, envMapIntensity: 0.95 },
      light: { color: 0x2b2d32, roughness: 0.4, metalness: 0.7, envMapIntensity: 0.75 },
      white: { glow: 0x2fe6ff, i: 2.6 }, navy: { glow: 0x2fe6ff, i: 1.1 }, blue: { glow: 0x2fe6ff, i: 2.6 },
      led: { glow: 0x2fe6ff, i: 3.2 }, ledh: { glow: 0x0a6f80, i: 0.7 }, eye: { glow: 0xa8f6ff, i: 2.8 }, screen: { glow: 0x2fe6ff, i: 1.0 },
      core: { glow: 0x2fe6ff, i: 2.4 }, pelvis: 'black', cowl: 'body',
      head: { color: 0x16171a, roughness: 0.25, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.8 },
      ring: 'blue', dring: 'blue', strip: 'blue', fin: 'blue'
    },
    // AUTRUCHE : plumage brun-fauve (motif de plumes en écailles), pattes rose chair à écailles, crème et bronze
    autruche: {
      body: { color: 0xffffff, pat: 'feather', ps: 1 / 30, roughness: 0.62, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.45, envMapIntensity: 0.4 },
      black: { color: 0x2a1d13, roughness: 0.45, metalness: 0.15, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.55 },
      graph: { color: 0x6a4a30, roughness: 0.35, metalness: 0.7, envMapIntensity: 0.75 },
      alu: { color: 0xf0a49a, pat: 'scales', ps: 1 / 9, rk: 0.35, roughness: 0.5, metalness: 0.05, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.5 },   // tibias rose vif (autruche mâle)
      light: { color: 0xf1eadc, roughness: 0.42, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.5 },
      white: 'light', navy: { color: 0x8a6440, roughness: 0.3, metalness: 0.75, envMapIntensity: 0.85 },
      led: { glow: 0xffa53a, i: 3.2 }, ledh: { glow: 0x9a5200, i: 0.7 }, eye: { glow: 0xfff0d6, i: 2.6 }, screen: { glow: 0xffa53a, i: 1.0 },
      pelvis: { color: 0x3b2a1c, roughness: 0.48, metalness: 0.15, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 0.55 },
      cowl: 'pelvis', head: 'light', blue: { color: 0xc98a45, roughness: 0.3, metalness: 0.85, envMapIntensity: 0.9 }
    },
    // URBAIN : camouflage numérique gris (pixels), gunmetal, voyants rouges
    urbain: {
      body: { color: 0xffffff, pat: 'ucamo', ps: 1 / 26, roughness: 0.58, metalness: 0.1, clearcoat: 0.25, clearcoatRoughness: 0.4, envMapIntensity: 0.5 },
      black: { color: 0x1d1f22, roughness: 0.45, metalness: 0.25, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.6 },
      graph: { color: 0x34363b, roughness: 0.36, metalness: 0.75, envMapIntensity: 0.75 },
      alu: { color: 0x75787e, roughness: 0.4, metalness: 0.78, envMapIntensity: 0.85 },
      light: { color: 0x9a9da2, roughness: 0.45, metalness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 0.6 },
      white: { color: 0xff3b30, roughness: 0.35, metalness: 0.2 }, navy: 'graph',
      led: { glow: 0xff3b30, i: 3.2 }, ledh: { glow: 0x9a1810, i: 0.7 }, screen: { glow: 0xff4a3a, i: 1.0 },
      pelvis: { color: 0x26282c, roughness: 0.45, metalness: 0.35, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 0.6 },
      cowl: 'body', head: { color: 0xb3b6ba, roughness: 0.45, metalness: 0.15, clearcoat: 0.4, clearcoatRoughness: 0.25, envMapIntensity: 0.55 },
      blue: { color: 0xff3b30, roughness: 0.3, metalness: 0.6, envMapIntensity: 0.7 },
      ring: 'blue', strip: 'blue'   // bagues des bras et bandes de cuisse rouges : repères lisibles à taille de jeu
    }
  };

  /* ---------- motifs procéduraux (dessinés une fois, en cache module) ---------- */
  const PATS = {};
  function patTex(kind) {
    if (PATS[kind]) return PATS[kind];
    const n = 256, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const c = cv.getContext('2d');
    let r = 4711; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    let srgb = true;
    // dessin raccordable : répète la forme aux 9 décalages de la tuile
    const wrap = fn => { for (const oy of [-n, 0, n]) for (const ox of [-n, 0, n]) { c.save(); c.translate(ox, oy); fn(); c.restore(); } };
    if (kind === 'hazard') {                     // chevrons de danger jaune / noir à 45°
      const img = c.createImageData(n, n), d = img.data;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4, k = ((x + y) % 128) / 128, on = k < 0.5, e = Math.min(Math.abs(k - 0.5), k, 1 - k) * 128;
        const s = e < 1.5 ? 0.5 + e / 3 : 1, gr = 0.95 + 0.05 * rnd();
        const col = on ? [250, 196, 0] : [22, 22, 24];
        d[i] = col[0] * gr * s + (1 - s) * 120; d[i + 1] = col[1] * gr * s + (1 - s) * 100; d[i + 2] = col[2] * gr * s + (1 - s) * 20; d[i + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    } else if (kind === 'prism') {               // ruban rétro-réfléchissant : alvéoles micro-prismatiques (luminance)
      srgb = false;
      const img = c.createImageData(n, n), d = img.data;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const a = ((x + y) % 32 + 32) % 32, b = ((x - y) % 32 + 32) % 32, e = Math.min(a, 32 - a, b, 32 - b);
        const v = (e < 1.2 ? 0.55 : 0.94 + 0.06 * Math.sin((a + b) * 0.2)) * 255, i = (y * n + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    } else if (kind === 'feather') {             // plumage : plumes effilées en désordre (attache en haut, pointe crème effilochée en bas)
      c.fillStyle = '#4a321d'; c.fillRect(0, 0, n, n);
      const F = [];
      for (let j = 0; j < 12; j++) for (let i = 0; i < 9; i++) F.push({ x: (i + 0.5 + (rnd() - 0.5) * 0.9) * n / 9, y: (j + (rnd() - 0.5) * 0.8) * n / 12, l: 30 + rnd() * 14, w: 12 + rnd() * 5, a: (rnd() - 0.5) * 0.5, t: rnd() });
      F.sort((p, q) => q.y - p.y);                 // du bas vers le haut : la pointe de chaque plume recouvre la base de la suivante
      for (const f of F) {
        const base = f.t < 0.3 ? [112, 78, 46] : f.t < 0.7 ? [146, 106, 64] : [172, 128, 80], mid = f.t < 0.3 ? [190, 146, 96] : [214, 172, 118];
        wrap(() => {
          c.save(); c.translate(f.x, f.y); c.rotate(f.a);
          const L = f.l, W = f.w;
          const gr = c.createLinearGradient(0, -L * 0.15, 0, L);
          gr.addColorStop(0, `rgb(${base})`); gr.addColorStop(0.55, `rgb(${base})`); gr.addColorStop(0.8, `rgb(${mid})`); gr.addColorStop(1, '#efe2c6');
          c.fillStyle = gr; c.beginPath();
          c.moveTo(-W * 0.18, -L * 0.15);
          c.bezierCurveTo(-W * 0.62, L * 0.25, -W * 0.55, L * 0.75, -W * 0.08, L);
          c.lineTo(W * 0.08, L);
          c.bezierCurveTo(W * 0.55, L * 0.75, W * 0.62, L * 0.25, W * 0.18, -L * 0.15);
          c.closePath(); c.fill();
          // barbes (stries obliques fines) + rachis clair
          c.lineWidth = 0.7;
          for (let k = 0; k < 11; k++) {
            const yy = L * (0.05 + k * 0.085), ww = W * 0.5 * Math.sin(Math.min(1, (yy + L * 0.15) / (L * 1.1)) * PI) + 0.5;
            c.strokeStyle = k % 2 ? 'rgba(30,18,8,0.35)' : 'rgba(255,240,215,0.18)';
            c.beginPath(); c.moveTo(0, yy); c.lineTo(-ww, yy + L * 0.12); c.moveTo(0, yy); c.lineTo(ww, yy + L * 0.12); c.stroke();
          }
          c.strokeStyle = 'rgba(245,230,200,0.5)'; c.lineWidth = 0.9;
          c.beginPath(); c.moveTo(0, -L * 0.1); c.quadraticCurveTo(W * 0.06, L * 0.5, 0, L * 0.94); c.stroke();
          // pointe effilochée
          c.strokeStyle = 'rgba(240,226,196,0.75)'; c.lineWidth = 0.8;
          for (let k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(k * W * 0.06, L * 0.9); c.lineTo(k * W * 0.11, L + 3 + Math.abs(k) * -0.6 + rnd() * 2); c.stroke(); }
          c.restore();
        });
      }
    } else if (kind === 'scales') {              // écailles des pattes d'autruche (luminance : sillons sombres, bombé clair)
      srgb = false;
      c.fillStyle = '#d0d0d0'; c.fillRect(0, 0, n, n);
      const rows = 8, H = n / rows;
      for (let j = 0; j < rows; j++) {
        const W = n / (j % 2 ? 4 : 5);
        for (let i = 0; i < n / W; i++) {
          const x0 = i * W + (j % 3) * 9, y0 = j * H;
          wrap(() => {
            const gr = c.createRadialGradient(x0 + W * 0.45, y0 + H * 0.35, 2, x0 + W * 0.5, y0 + H * 0.5, W * 0.62);
            gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.7, '#e2e2e2'); gr.addColorStop(1, '#a8a8a8');
            c.fillStyle = gr; c.beginPath();
            if (c.roundRect) c.roundRect(x0 + 1.5, y0 + 1.5, W - 3, H - 3, 9); else c.rect(x0 + 1.5, y0 + 1.5, W - 3, H - 3);
            c.fill();
          });
        }
      }
    } else if (kind === 'ucamo') {               // camouflage numérique urbain (pixels de 8 px, bruit raccordable)
      const G = 32, cell = n / G;
      const mk = Gs => { const t = Array.from({ length: Gs * Gs }, rnd); return (x, y) => {
        x *= Gs; y *= Gs; const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const v = (a, b) => t[(((b % Gs) + Gs) % Gs) * Gs + (((a % Gs) + Gs) % Gs)];
        return lerp(lerp(v(xi, yi), v(xi + 1, yi), sx), lerp(v(xi, yi + 1), v(xi + 1, yi + 1), sx), sy);
      }; };
      const A = mk(4), B = mk(8), E = mk(16), C = mk(6);
      const COL = ['#a4a7ab', '#686b70', '#3c3f44', '#1b1d20'];   // contraste fort, moyenne sombre (≠ PROTOTYPE blanc)
      for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
        const u = (x + 0.5) / G, v = (y + 0.5) / G, f = A(u, v) * 0.55 + B(u, v) * 0.3 + E(u, v) * 0.15, h = C(u, v);
        const k = f < 0.42 ? 0 : f < 0.52 ? 1 : f < 0.6 ? 2 : 3;
        c.fillStyle = COL[h > 0.62 && k === 1 ? 3 : k]; c.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4;
    if (srgb) t.colorSpace = T.SRGBColorSpace;
    return (PATS[kind] = t);
  }
  /* ---------- matériau d'un emplacement de skin ----------
     Motif triplanaire (repère local de la pièce, unités design) : teinte × motif, rugosité plus forte dans les creux ;
     lueur interne par uniform (n'utilise pas .emissive, réservé au flash d'impact). */
  function fxMat(ctx, spec) {
    if (spec.glow != null) return ctx.glow(spec.glow, spec.i == null ? 3 : spec.i);
    const p = Object.assign({}, spec), pat = p.pat, ps = p.ps || 0.05, rk = p.rk || 0, inner = p.inner, ii = p.ii || 0;
    for (const k of ['pat', 'ps', 'rk', 'inner', 'ii']) delete p[k];
    const m = ctx.mat(p);
    if (ctx.override || (!pat && inner == null)) return m;
    const key = 'dgSkin' + (pat ? 'P' : '') + (inner != null ? 'I' : '');
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
    const R = ctx.realData('cassie');
    if (!R) return RK.models.default(ctx);
    const B = R.bodies;

    /* ---------- matériaux (skin : SKINS[ctx.skin] ; 'classic' = mêmes matériaux qu'avant → modèle identique) ---------- */
    const SKN = SKINS[ctx.skin] || null, SGEO = (SKN && !low && !ctx.override && SKN.geo) || null;
    const slot = {};
    const pick = (k, dflt) => { const sp = SKN && SKN[k]; return (slot[k] = sp == null ? dflt() : typeof sp === 'string' ? slot[sp] : fxMat(ctx, sp)); };
    const TEAL = pick('body', () => ctx.mat({ color: ch.body, roughness: 0.46, metalness: 0.32, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 0.7 }));   // sarcelle satinée à paillettes
    const BK = pick('black', () => ctx.mat({ color: 0x131417, roughness: 0.4, metalness: 0.15, clearcoat: 0.4, clearcoatRoughness: 0.32, envMapIntensity: 0.65 }));   // noir satiné
    const GR = pick('graph', () => ctx.mat({ color: 0x2a2d33, roughness: 0.38, metalness: 0.7, envMapIntensity: 0.7 }));
    const SIL = pick('alu', () => ctx.mat({ color: 0xa6aab0, roughness: 0.5, metalness: 0.66, envMapIntensity: 0.85 }));   // alu microbillé (mat)
    const LG = pick('light', () => ctx.mat({ color: 0xcdd0d3, roughness: 0.36, metalness: 0.3, clearcoat: 0.35, clearcoatRoughness: 0.25, envMapIntensity: 0.6 }));
    const WH = pick('white', () => ctx.mat({ color: 0xf2f3f4, roughness: 0.3, metalness: 0.02, clearcoat: 0.9, clearcoatRoughness: 0.12, envMapIntensity: 0.5 }));
    const NV = pick('navy', () => ctx.mat({ color: 0x0d1a33, roughness: 0.1, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.1 }));
    const BLU = pick('blue', () => ctx.mat({ color: 0x2b7ad6, roughness: 0.3, metalness: 0.7, envMapIntensity: 0.8 }));
    const EYEBG = pick('eyebg', () => ctx.mat({ color: 0x15171b, roughness: 0.12, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.9 }));
    const GL = pick('visor', () => M.visor), RU = pick('rubber', () => M.rubber), SE = pick('seam', () => M.seam);
    const LEDH = pick('ledh', () => ctx.glow(0x1d9e46, 0.7));
    const LEDG = pick('led', () => ctx.glow(0x3dff74, 3.2)), EYE = pick('eye', () => ctx.glow(0xf2f7ff, 2.6)), SCR = pick('screen', () => ctx.glow(0x2a6cff, 0.9));
    // emplacements propres aux skins (classic : le matériau d'origine de la pièce, aucun nouveau matériau)
    const CORE = pick('core', () => SE), PELV = pick('pelvis', () => BK), COWL = pick('cowl', () => BK), HEADM = pick('head', () => WH);
    const BAND = pick('band', () => BK), RING = pick('ring', () => GR), DRING = pick('dring', () => SE), STRIP = pick('strip', () => RU), FIN = pick('fin', () => SE);
    const REFL = SGEO === 'refl' ? pick('refl', () => SIL) : null, MARK = SGEO === 'proto' ? pick('marker', () => WH) : null;
    const MAT = { _dummy: SIL, sil: SIL, blk: COWL, gr: GR, ru: RU, se: SE };

    const sidePart = (sd, build) => { const part = ctx.group(), inner = ctx.group(); inner.scale.set(1, 1, sd < 0 ? -1 : 1); part.add(inner); build(inner); return part; };
    // PROTOTYPE : sphères rétro-réfléchissantes de capture de mouvement (fusionnées par pièce)
    const marks = (parent, key, pts) => { if (MARK) add(parent, fuse('dgSkMk' + key, pts.map(p => [g.sphere(0.8, 8, 5), p])), MARK); };

    /* ---------- jambes réelles (Cassie) ---------- */
    const legCls = (gm, x, y, z) => {
      const b = gm.body.replace(/^(left|right)-/, ''), az = Math.abs(z);
      switch (b) {
        case 'hip-pitch': return az > 19.5 ? 'blk' : 'sil';
        case 'hip-roll': case 'hip-yaw': return 'blk';
        case 'knee': return 'gr';
        case 'knee-spring': return 'gr';
        case 'shin': return 'sil';
        case 'achilles-rod': return 'sil';
        case 'tarsus': return 'sil';
        case 'heel-spring': return 'gr';
        case 'foot-crank': return 'gr';
        case 'plantar-rod': return 'sil';
        default: return 'sil';
      }
    };
    const hipC = [B['right-hip-pitch'][0], B['right-hip-pitch'][1], 0];
    const legLen = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const LEG_S = [1.12, 1, 1.15], SH_S = [1.28, 1, 1.15];   // tarse un peu plus large (treillis de Digit)   // sections un peu plus épaisses que Cassie (capots de Digit)
    const COWL_BACK = 38 * D, COWL_S = [1.2, 1.12, 1.2];   // capot de cuisse : plus grand et un peu ramené vers l'arrière

    const mapReal = (o, warp, p) => { const v = new T.Vector3(p[0], p[1], p[2]).applyMatrix4(ctx.realMatrix(o)); if (warp) v.y = warpV(v.y, warp); return v; };
    // tige de liaison dynamique (plat d'alu + œillets) : étirée chaque image entre deux pièces du squelette
    const rodGeo = (w, t) => GC['dgRod' + w + ',' + t] || (GC['dgRod' + w + ',' + t] = (() => { const c = Math.min(w, t) * 0.28; return g.prism([[-w / 2 + c, -t / 2], [w / 2 - c, -t / 2], [w / 2, -t / 2 + c], [w / 2, t / 2 - c], [w / 2 - c, t / 2], [-w / 2 + c, t / 2], [-w / 2, t / 2 - c], [-w / 2, -t / 2 + c]], 1, 0).clone().rotateX(-PI / 2).translate(0, 0.5, 0); })());
    function makeRod(parent, w, t, er, mat) {
      const grp = ctx.group(); grp.userData.noMerge = true;
      const bar = ctx.mesh(rodGeo(w, t), mat); grp.add(bar);
      const eye = fuse('dgRodEye' + er + ',' + t, [[g.ccyl(er, t * 1.15, 0.2, 14, 'z'), [0, 0, 0]], [g.cyl(er * 0.45, er * 0.45, t * 1.5, 8, 'z'), [0, 0, 0]]]);
      grp.add(ctx.mesh(eye, mat));
      const eB = ctx.mesh(eye, mat); grp.add(eB);
      parent.add(grp);
      return { grp, bar, eB };
    }
    const LEGS = [];

    for (const [sd, s, z] of [['f', 'right', 1], ['b', 'left', -1]]) {
      const hp = B[s + '-hip-pitch'], ta = B[s + '-tarsus'], fo = B[s + '-foot'];
      const lT = legLen(hp, ta), lS = legLen(ta, fo);
      // cuisse du jeu = cuisse + genou + tibia réels (jusqu'à l'articulation « inversée » du tarse)
      const thSel = [s + '-hip-pitch', s + '-knee', s + '-knee-spring', s + '-shin'], thWarp = [[14, 14], [53, 53 + L.th - lT]];
      const thO = { pivot: hp, to: ta, frame: 'limb', s: LEG_S }, shO = { pivot: ta, to: fo, frame: 'limb', s: SH_S }, shWarp = [[7, 7], [34, 34 + L.sh - lS]];
      P[sd + 'th'] = realPiece(ctx, MAT, s + 'th', thSel, thO, (gm, x, y, zz) => { const k = legCls(gm, x, y, zz); return k === 'blk' ? null : k; }, thWarp);
      // capot noir « haricot » de la cuisse : légèrement ramené vers l'arrière (le squelette du jeu avance beaucoup la cuisse)
      P[sd + 'th'].add(realPiece(ctx, MAT, s + 'cowl', [s + '-hip-pitch'], { pivot: hp, to: ta, frame: 'limb', s: COWL_S, r: [0, 0, -COWL_BACK] }, (gm, x, y, zz) => legCls(gm, x, y, zz) === 'blk' ? 'blk' : null, null));
      // tibia du jeu = tarse réel + ressort de talon + manivelle (les tiges sont dynamiques, voir plus bas)
      P[sd + 'sh'] = realPiece(ctx, MAT, s + 'sh', [s + '-tarsus', s + '-heel-spring', s + '-foot-crank'], shO, legCls, shWarp);
      // tiges : achille (hanche → ressort de talon) et plantaire (manivelle → talon du pied)
      const leg = { sd, th: P[sd + 'th'], sh: null, fo: null,
        achA: mapReal(thO, thWarp, [-4.9, 91.57, z * 9.6]), achB: mapReal(shO, shWarp, [-32.2, 49.4, z * 12.4]),
        plaA: mapReal(shO, shWarp, [-28.4, 28.2, z * 11.9]), plaB: new T.Vector3(-5.6, -2.4, -1.8 * z) };
      if (!low) { leg.ach = makeRod(P[sd + 'th'], 1.9, 0.7, 1.15, SIL); leg.pla = makeRod(P[sd + 'sh'], 1.5, 0.75, 1.05, SIL); }
      LEGS.push(leg);
      // détails Digit sur la cuisse du jeu : bande de caoutchouc nervurée le long du tibia réel
      if (!low) {
        const th = sidePart(z, gr => {
          const a = [-16.6 * LEG_S[0], 15.5], b = [-6.4 * LEG_S[0], 36.5], ln = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
          const strip = ctx.group(); strip.position.set((a[0] + b[0]) / 2 - 0.7, (a[1] + b[1]) / 2, 1.4 * LEG_S[2]); strip.rotation.z = -ang; gr.add(strip);
          add(strip, g.rbox(1.6, ln, 4.4, 0.6, 2), STRIP);
          add(strip, fuse('dgRibs' + ln.toFixed(1), Array.from({ length: 12 }, (_, i) => [g.box(0.8, 0.7, 3.8), [-0.8, (i - 5.5) * ln / 13, 0]])), BK);
        });
        P[sd + 'th'].add(th);
        // tarse : courroie noire nervurée autour de la poulie + évidements triangulaires (treillis)
        const sh = sidePart(z, gr => {
          add(gr, g.lathe([[5.6, -3.0], [6.6, -3.0], [6.6, 3.0], [5.6, 3.0]], 18, 'z', -0.15 * PI, 1.1 * PI), RU, [0, 0, 0], [0, 0, 0.5 * PI]);
          const tri = pts => g.prism(pts.map(([x, y]) => [x * SH_S[0], y]), 0.7, 0.15);
          add(gr, tri([[1.0, 7.8], [6.9, 7.8], [1.4, 20.5]]), SE, [0, 0, 3.75 * LEG_S[2]]);
          add(gr, tri([[0.8, 23.4], [4.2, 21.6], [1.0, 31.5]]), SE, [0, 0, 2.95 * LEG_S[2]]);
        });
        P[sd + 'sh'].add(sh);
      }
      // rotule « inversée » : bague bleue anodisée + moyeu sur le carter du tarse
      P[sd + 'kn'] = sidePart(z, gr => {
        if (!low) {
          // carter de poulie : flasque alu, couronne de vis, moyeu graphite, petite bague bleue anodisée
          add(gr, g.ccyl(4.5, 0.9, 0.35, 28, 'z'), SIL, [0, 0, 3.9 * LEG_S[2]]);
          add(gr, fuse('dgKneeBolts', Array.from({ length: 6 }, (_, i) => { const a = (i / 6 + 1 / 12) * 2 * PI; return [g.cyl(0.36, 0.36, 0.4, 6, 'z'), [Math.cos(a) * 3.4, Math.sin(a) * 3.4, 0]]; })), GR, [0, 0, 4.45 * LEG_S[2]]);
          add(gr, g.torus(1.75, 0.3, 20, 4, PI * 2, 'z'), BLU, [0, 0, 4.4 * LEG_S[2]]);
          add(gr, g.ccyl(1.3, 1.0, 0.25, 14, 'z'), GR, [0, 0, 4.5 * LEG_S[2]]);
          marks(gr, 'Kn', [[0, 0, 4.5 * LEG_S[2] + 1.2]]);
        }
      });
      // pied Digit : semelle plate
      P[sd + 'fo'] = sidePart(z, gr => {
        const sole = g.shape('dgSole', sh => {
          sh.moveTo(-6.5, -4.4); sh.lineTo(12, -4.4); sh.quadraticCurveTo(15, -4.4, 15, -2); sh.lineTo(15, 2);
          sh.quadraticCurveTo(15, 4.4, 12, 4.4); sh.lineTo(-6.5, 4.4); sh.quadraticCurveTo(-8.6, 4.4, -8.6, 2.2); sh.lineTo(-8.6, -2.2); sh.quadraticCurveTo(-8.6, -4.4, -6.5, -4.4);
        }, 1.4, 0.35, low ? 2 : 4);
        add(gr, sole, RU, [0, -6.3, 0], [PI / 2, 0, 0], [1, 1, 0.9]);
        add(gr, sole, SIL, [0.2, -5.0, 0], [PI / 2, 0, 0], [0.97, 0.94, 1.15]);
        if (low) add(gr, g.cbox(5, 5.6, 5.4, 0.6), SIL, [0, -2.0, 0]);   // chape de cheville (relie le tarse au pied)
        if (!low) {
          for (const zz of [2.4, -2.4]) add(gr, g.cbox(5.2, 5.2, 1.2, 0.4), SIL, [0, -1.6, zz]);
          add(gr, g.ccyl(1.3, 6.4, 0.3, 14, 'z'), GR, [0, 0, 0]);
          add(gr, g.cbox(7, 1.6, 6, 0.5), GR, [0.5, -3.6, 0]);
          add(gr, g.cbox(3, 0.6, 7.6, 0.2), SE, [10.5, -4.15, 0]);
        }
      });
      // flasque de l'actionneur de tangage (face intérieure) + couronne de vis
      P[sd + 'hi'] = sidePart(z, gr => {
        add(gr, g.ccyl(5.6, 1.6, 0.4, low ? 10 : 22, 'z'), SIL, [0, 0, -4.6]);
        if (!low) {
          add(gr, g.ccyl(2.4, 0.6, 0.2, 14, 'z'), GR, [0, 0, -5.6]);
          add(gr, fuse('dgHipBolts', Array.from({ length: 8 }, (_, i) => { const a = i / 8 * 2 * PI; return [g.cyl(0.38, 0.38, 0.5, 5, 'z'), [Math.cos(a) * 4.3, Math.sin(a) * 4.3, 0]]; })), GR, [0, 0, -5.5]);
        }
      });
      leg.sh = P[sd + 'sh']; leg.fo = P[sd + 'fo']; leg.hi = P[sd + 'hi']; leg.kn = P[sd + 'kn'];
    }

    /* ---------- buste ---------- */
    const torso = ctx.group();
    {
      const ysTeal = ysamp([[Y_SPLIT + 0.3, 55, 5, 'l'], [55, TOR.yT, 7, 'top'], [TOR.yT, TOR.yT + CL, 2, 'l']]);
      const ysPel = ysamp([[TOR.yB - CL, TOR.yB, 2, 'l'], [TOR.yB, TOR.yB + TOR.rBx, 6, 'bot'], [TOR.yB + TOR.rBx, Y_SPLIT - 0.6, 1, 'l']]);
      if (low) {
        add(torso, shell('dgTorLo', { sec: TS, u0: 0, u1: 1, nu: 16, ys: ysamp([[Y_SPLIT, 55, 2, 'l'], [55, TOR.yT, 3, 'top'], [TOR.yT, TOR.yT + CL, 1, 'l']]), yLo: Y_SPLIT, c: 0, t: 0 }), TEAL);
        add(torso, shell('dgPelLo', { sec: TS, u0: 0, u1: 1, nu: 16, ys: ysamp([[TOR.yB - CL, TOR.yB, 1, 'l'], [TOR.yB, TOR.yB + TOR.rBx, 3, 'bot'], [TOR.yB + TOR.rBx, Y_SPLIT, 1, 'l']]), c: 0, t: 0 }), PELV);
      } else {
        // noyau sombre (visible dans les joints)
        add(torso, shell('dgTorCore', { sec: TS, u0: 0, u1: 1, nu: 24, ys: ysamp([[TOR.yB - CL, TOR.yB, 1, 'l'], [TOR.yB, TOR.yB + TOR.rBx, 2, 'bot'], [TOR.yB + TOR.rBx, 55, 2, 'l'], [55, TOR.yT, 3, 'top'], [TOR.yT, TOR.yT + CL, 1, 'l']]), off: -0.6, c: 0, t: 0 }), CORE);
        // coque avant + coque arrière sarcelle
        add(torso, shell('dgTorFront', { sec: TS, u0: -U_SEAM, u1: U_SEAM, nu: 38, ys: ysTeal, yLo: Y_SPLIT }), TEAL);
        add(torso, shell('dgTorBack', { sec: TS, u0: U_SEAM + 0.005, u1: 1 - U_SEAM - 0.005, nu: 30, ys: ysTeal, yLo: Y_SPLIT }), TEAL);
        // bassin noir
        add(torso, shell('dgPelvis', { sec: TS, u0: 0, u1: 1, nu: 40, ys: ysPel, yHi: Y_SPLIT - 0.3 }), PELV);

        // --- façade : tableau LED vert, fentes noires, logo ---
        const xF = TOR.x0 + TOR.xf; // plan avant
        add(torso, g.rbox(1.4, 16.4, 11.2, 0.6, 2), BK, [xF - 0.3, 50.2, 0]);
        add(torso, g.rbox(0.8, 15, 9.8, 0.4, 2), GL, [xF + 0.2, 50.2, 0]);
        // barre d'état : 2 rangées de LED vertes + halo, puis petit écran (icônes bleues, jauge verte)
        add(torso, fuse('dgLedBar', (() => { const it = []; for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) it.push([g.box(0.3, 0.95, 0.82), [0, r * 1.25, (i - 4) * 0.98]]); return it; })()), LEDG, [xF + 0.62, 54.2, 0]);
        add(torso, g.box(0.12, 3.4, 9.4), LEDH, [xF + 0.52, 54.8, 0]);
        add(torso, fuse('dgIcons', [[g.box(0.2, 1.2, 1.2), [0, 0, -3]], [g.box(0.2, 1.2, 1.2), [0, 0, -1.2]], [g.box(0.2, 0.8, 2.2), [0, -1.8, -2.1]]]), SCR, [xF + 0.56, 50.6, 0]);
        add(torso, fuse('dgBatt', [0, 1, 2, 3].map(i => [g.box(0.2, 0.7 + i * 0.35, 0.5), [0, (0.7 + i * 0.35) / 2, i * 0.75]])), LEDG, [xF + 0.56, 49.6, 1.4]);
        add(torso, fuse('dgPanelCam', [[g.ccyl(0.95, 0.5, 0.15, 16, 'x'), [0, 0, -1.6]], [g.ccyl(0.95, 0.5, 0.15, 16, 'x'), [0, 0, 1.6]]]), GR, [xF + 0.62, 45.6, 0]);
        add(torso, fuse('dgPanelLens', [[g.cyl(0.55, 0.55, 0.3, 14, 'x'), [0, 0, -1.6]], [g.cyl(0.55, 0.55, 0.3, 14, 'x'), [0, 0, 1.6]]]), GL, [xF + 0.82, 45.6, 0]);
        for (const zz of [10.6, -10.6]) {
          add(torso, g.rbox(1.6, 13.4, 2.6, 0.9, 2), BK, [xF - 0.2, 50.4, zz]);
          add(torso, g.rbox(0.6, 12.2, 1.4, 0.5, 2), FIN, [xF + 0.45, 50.4, zz]);
        }
        add(torso, g.ccyl(1.8, 0.5, 0.15, 24, 'x'), BK, [xF + 0.05, 35.5, 0]);
        add(torso, g.torus(1.05, 0.2, 20, 5, PI * 1.5, 'x'), WH, [xF + 0.32, 35.5, 0]);
        // vis le long du joint latéral
        for (const zz of [1, -1]) for (const y of [24, 36, 48]) {
          const p = SP(TS, zz * U_SEAM, y, 0.05);
          add(torso, g.cyl(0.42, 0.42, 0.3, 10, 'z'), BK, [p[0] + 1.1, y, p[2]]);
        }
        // dos : bloc batterie noir à grille
        add(torso, g.rbox(3.4, 34, 21, 1.4, 2), BK, [-(TOR.xb - TOR.x0) - 0.6, 39, 0]);
        add(torso, fuse('dgGrille', (() => { const it = []; for (let r = 0; r < 10; r++) it.push([g.box(0.6, 0.9, 15), [0, (r - 4.5) * 2.0, 0]]); return it; })()), GR, [-(TOR.xb - TOR.x0) - 2.2, 46, 0]);
        // embase du cou
        add(torso, g.ccyl(7.4, 1.2, 0.4, 32), BK, [0, TOR.yT + 0.2, 0]);
        // SÉCURITÉ : deux bandes rétro-réfléchissantes autour du buste (façon gilet haute visibilité)
        if (SGEO === 'refl') for (const [y0, y1] of [[25.4, 28.0], [30.4, 33.0]])
          add(torso, shell('dgSkRefl' + y0, { sec: TS, u0: 0, u1: 1, nu: 40, ys: [y0, y1], yLo: y0, yHi: y1, off: 0.32, c: 0, t: 0.6 }), REFL);
        if (MARK) marks(torso, 'Tor', [[0.12, 59], [-0.12, 59], [0.16, 9.5], [-0.16, 9.5]].map(([u, y]) => SP(TS, u, y, 0.55)).concat([[-15.3, 54, 9.2], [-15.3, 54, -9.2]]));
      }
      // carters réels des actionneurs de lacet de hanche (Cassie) sous le bassin
      if (!low) torso.add(realPiece(ctx, MAT, 'hipY', /hip-yaw/, { pivot: hipC }, (gm) => 'gr', null));
    }
    P.torso = torso;

    /* ---------- cou : capteur cylindrique bleu nuit ---------- */
    {
      const n = ctx.group();
      add(n, g.cyl(5.2, 5.2, 4, low ? 10 : 24), BK, [0, 2, 0]);
      add(n, g.cyl(6.6, 6.6, 4.4, low ? 12 : 36), NV, [0, 5.7, 0]);
      if (!low) {
        add(n, g.ccyl(7.0, 0.9, 0.25, 32), BK, [0, 8.3, 0]);
        add(n, g.ccyl(6.8, 0.5, 0.15, 32), GR, [0, 3.6, 0]);
      }
      add(n, g.cyl(4.5, 4.5, 4.4, low ? 8 : 16), BK, [0, 10.6, 0]);   // fixation de la tête (cachée dans le bandeau)
      P.neck = n;
    }

    /* ---------- tête-capteur ---------- */
    {
      const h = ctx.group(), hy = -2.4;
      const yT = HEAD.yT, yB = HEAD.yB;
      if (low) {
        add(h, shell('dgHeadLo', { sec: HS, u0: 0, u1: 1, nu: 16, ys: ysamp([[yB - CL, yB, 1, 'l'], [yB, yT - 3, 2, 'l'], [yT - 3, yT, 2, 'top'], [yT, yT + CL, 1, 'l']]), c: 0, t: 0 }), HEADM, [0, hy, 0]);
      } else {
        add(h, shell('dgHeadCap', { sec: HS, u0: 0, u1: 1, nu: 56, ys: ysamp([[Y_HEADSPLIT, yT - HEAD.rTz, 3, 'l'], [yT - HEAD.rTz, yT, 7, 'top'], [yT, yT + CL, 3, 'l']]), yLo: Y_HEADSPLIT - 0.3, c: 0.3, t: 1.0 }), HEADM, [0, hy, 0]);
        add(h, shell('dgHeadBand', { sec: HS, u0: 0, u1: 1, nu: 44, off: -0.45, ys: ysamp([[yB - CL, yB, 2, 'l'], [yB, yB + HEAD.rBx, 4, 'bot'], [yB + HEAD.rBx, Y_HEADSPLIT + 0.4, 2, 'l']]), c: 0, t: 0 }), BAND, [0, hy, 0]);
        // yeux : matrices de LED blanches (quinconce) sur fenêtre fumée
        const eyeY = 1.0, ex = HEAD.xf;
        for (const zz of [5.6, -5.6]) add(h, g.rbox(0.5, 4.6, 9.2, 0.22, 2), EYEBG, [ex - 0.1, hy + eyeY, zz]);
        const dots = [];
        for (const zc of [5.6, -5.6]) for (let r = 0; r < 5; r++) {
          const n = r % 2 ? 6 : 7;
          for (let i = 0; i < n; i++) dots.push([g.cone(0.52, 0.3, 6, 'x'), [0, (r - 2) * 0.88, zc + (i - (n - 1) / 2) * 1.24]]);
        }
        add(h, fuse('dgEyeDots', dots), EYE, [ex + 0.2, hy + eyeY, 0]);
        // caméras : paire stéréo avant + 3 objectifs de chaque côté
        const rings = [], glass = [];
        const lens = (px, py, pz, axis, r = 0.8) => {
          const sx = axis === 'x' ? 1 : 0, sz = axis === 'z' ? Math.sign(pz) : 0;
          rings.push([g.cyl(r + 0.35, r + 0.35, 0.5, 10, axis), [px, py, pz]]);
          glass.push([g.cyl(r, r, 0.6, 10, axis), [px + sx * 0.2, py, pz + sz * 0.2]]);
        };
        for (const zz of [2.4, -2.4]) lens(HEAD.xf - 0.45, -3.4, zz, 'x', 0.75);
        lens(HEAD.xf - 0.45, -3.5, 8.4, 'x', 0.5); lens(HEAD.xf - 0.45, -3.5, -8.4, 'x', 0.5);
        if (SGEO !== 'proto') for (const s of [1, -1]) for (const [xx, r] of [[-5.5, 0.7], [-0.6, 0.85], [1.6, 0.5], [5.4, 0.7]]) lens(xx, -3.4, s * (HEAD.z - 0.45), 'z', r);   // (PROTOTYPE : tête-boîtier sans caméras latérales)
        add(h, fuse('dgLensRings', rings), GR, [0, hy, 0]);
        add(h, fuse('dgLensGlass', glass), GL, [0, hy, 0]);
        // NOCTURNE : filet lumineux sous le bord du casque
        if (SGEO === 'lines') add(h, shell('dgSkLineHd', { sec: HS, u0: 0, u1: 1, nu: 56, ys: [Y_HEADSPLIT - 0.8, Y_HEADSPLIT - 0.25], off: -0.12, c: 0, t: 0 }), CORE, [0, hy, 0]);
        // PROTOTYPE : lidar rotatif sur le dessus (Digit v1-v2) + marqueurs de capture
        if (SGEO === 'proto') {
          const ly = hy + yT;
          add(h, fuse('dgSkLidarB', [[g.ccyl(4.0, 0.9, 0.25, 18), [-1.2, 0.35, 0]], [g.cyl(3.5, 3.5, 4.6, 18, 'y', true), [-1.2, 3.1, 0]], [g.ccyl(3.7, 0.8, 0.25, 18), [-1.2, 5.6, 0]]]), BK, [0, ly, 0]);
          add(h, g.cyl(3.58, 3.58, 1.7, 18, 'y', true), GL, [-1.2, ly + 3.3, 0]);
          add(h, g.ccyl(2.2, 0.4, 0.15, 12), GR, [-1.2, ly + 6.1, 0]);
          marks(h, 'Hd', [[-6.5, ly - 0.4, 10.5], [-6.5, ly - 0.4, -10.5]]);
        }
      }
      P.head = h;
    }

    /* ---------- bras ---------- */
    // pince Digit (v4) : capot noir en dôme + boîtier de préhension noir à moteur transversal
    // et deux paires de griffes crochues (avant / arrière) qui se referment l'une vers l'autre.
    const HOOD = rsec({ yB: 0, yT: 14, xf: 2.4, xb: 4.8, z: 5.1, r: 0.9, rb: 3.8, x0: 0, rTx: 4.6, rTz: 3.4, rBx: 2.6, rBz: 2.2, flatF: true,
      tap: y => [0, -0.6 * clamp01(y / 14), -0.2 * clamp01(y / 14)] });
    const hoodGeo = (key, nu, ys) => GC[key] || (GC[key] = shell(key + 'raw', { sec: HOOD, u0: 0, u1: 1, nu, ys, c: 0, t: 0 }).clone().rotateZ(-PI / 2));
    const CLAW = [[-0.9, 0.8], [0.9, 0.8], [0.9, -5.2], [-0.3, -6.6], [-2.7, -6.3], [-2.9, -5.2], [-0.9, -4.8]];
    function digitHand(side) {
      const root = ctx.group();
      add(root, g.ccyl(2.9, 3.4, 0.4, low ? 8 : 18, 'x'), LG, [1.7, 0, 0]);
      if (low) {
        add(root, hoodGeo('dgHoodLo', 10, ysamp([[-CL, 0, 1, 'l'], [0, 14, 3, 'l'], [14, 14 + CL, 1, 'l']])), BK, [4, 2.6, 0]);
        add(root, g.box(12, 4.6, 8.4), BK, [11, -2.6, 0]);
        root.userData.setCurl = () => {};
        return root;
      }
      // liaison poignet → capot (gris clair, montant en biais)
      add(root, g.cbox(5.2, 4.4, 5.6, 0.9), LG, [4.2, 0.6, 0], [0, 0, 0.35]);
      add(root, g.ccyl(3.2, 1.2, 0.3, 18, 'x'), BK, [3.6, 0, 0]);
      // capot en dôme noir satiné
      add(root, hoodGeo('dgHood', 28, ysamp([[-CL, 0, 1, 'l'], [0, 3, 3, 'bot'], [3, 9.6, 2, 'l'], [9.6, 14, 4, 'top'], [14, 14 + CL, 2, 'l']])), BK, [4, 2.6, 0]);
      add(root, g.cbox(13, 0.6, 9.4, 0.25), SE, [11, -0.55, 0]);
      add(root, g.cyl(0.35, 0.35, 0.3, 8, 'z'), SIL, [6.4, 1.6, 5.0]);
      // boîtier de préhension
      add(root, g.cbox(12.4, 4.2, 8.6, 0.7), GR, [11, -2.8, 0]);
      add(root, g.ccyl(2.7, 10.6, 0.5, 20, 'z'), BK, [12.6, -3.5, 0]);
      add(root, g.ccyl(1.5, 10.9, 0.3, 14, 'z'), GR, [12.6, -3.5, 0]);
      add(root, fuse('dgGripRibs', Array.from({ length: 3 }, (_, i) => [g.box(0.5, 3.4, 8.9), [6.6 + i * 1.6, -2.8, 0]])), BK);
      for (const zz of [4.45, -4.45]) add(root, g.box(9.6, 0.35, 0.2), SIL, [10.4, -4.6, zz]);
      const claws = [];
      for (const [x0, zz, dir] of [[16.8, 3.0, 1], [16.8, -3.0, 1], [5.4, 1.1, -1], [5.4, -1.1, -1]]) {
        const piv = ctx.group(); piv.position.set(x0, -4.4, zz); piv.userData.noMerge = true;
        const cl = ctx.group(); cl.scale.set(dir * 0.85, 0.85, 1); piv.add(cl);
        add(cl, g.prism(CLAW, 1.5, 0.3), BK);
        add(cl, g.box(0.5, 3.6, 1.3), RU, [-1.1, -3.6, 0]);
        root.add(piv); claws.push([piv, dir]);
      }
      root.userData.setCurl = c => { for (const [piv, dir] of claws) piv.rotation.z = dir * (16 - 42 * c) * D; };
      root.userData.setCurl(1);
      return root;
    }
    // bras : profil carré arrondi (actionneur gris clair, fourreau noir à grille jusqu'au coude)
    const UAG = rsec({ yB: 0, yT: 17.6, xf: 3.2, xb: 3.4, z: 3.7, r: 1.9, x0: 0, rTx: 0.6, rTz: 0.6, rBx: 0.6, rBz: 0.6 });
    const UAB = rsec({ yB: 15.4, yT: 34.2, xf: 4.3, xb: 4.0, z: 4.5, r: 2.8, x0: 0, rTx: 0.8, rTz: 0.8, rBx: 3.6, rBz: 3.6 });

    for (const [sd, z] of [['f', 1], ['b', -1]]) {
      // épaule : sphère d'actionneur noire
      // épaule : carter d'actionneur noir en « tambour » à bout bombé (axe latéral), fentes d'aération
      const DRUM = [[0, -6.0], [6.1, -6.0], [6.7, -4.8], [6.85, -0.5], [6.6, 2.4], [5.8, 4.4], [4.3, 5.9], [2.2, 6.7], [0, 6.9]];
      P[sd + 'sc'] = sidePart(z, gr => {
        add(gr, g.lathe(DRUM, low ? 10 : 26, 'z'), BK, [0, 1.2, 0]);
        if (!low) {
          add(gr, g.torus(6.75, 0.16, 32, 3, PI * 2, 'z'), DRING, [0, 1.2, -2.2]);
          add(gr, fuse('dgShVents', [0, 1, 2].map(i => [g.cbox(2.6, 0.45, 0.6, 0.15), [0, i * 1.5, 0]])), SE, [3.6, 3.4, 3.4], [0, -0.55, 0.5]);
        }
      });
      P[sd + 'ua'] = sidePart(z, gr => {
        add(gr, g.ccyl(4.2, 5, 0.8, low ? 8 : 20), BK, [0, 2.4, 0]);
        // étrier gris clair en « Γ » : part du moyeu sur la face extérieure du tambour et redescend dans le bras
        add(gr, g.ccyl(3.3, 1.6, 0.45, low ? 10 : 22, 'z'), LG, [0, -1.0, 6.9]);
        add(gr, g.cbox(5.8, 9.6, 2.1, 0.8), LG, [0, 3.2, 6.6]);
        add(gr, g.cbox(5.6, 7.4, 2.6, 0.9), LG, [0, 9.0, 3.9], [-0.72, 0, 0]);
        if (!low) add(gr, g.ccyl(1.3, 0.5, 0.15, 14, 'z'), GR, [0, -1.0, 7.75]);
        if (low) {
          add(gr, g.cbox(6.6, 15, 7.4, 1.6), LG, [0, 10, 0]);
          add(gr, g.cbox(7.7, 17, 8.3, 2.4), BK, [0, 24.6, 0]);
          return;
        }
        add(gr, shell('dgUAgrey', { sec: UAG, u0: 0, u1: 1, nu: 28, ys: ysamp([[-CL, 0, 1, 'l'], [0, 17.6, 3, 'l'], [17.6, 17.6 + CL, 1, 'l']]), c: 0, t: 0 }), LG);
        add(gr, shell('dgUAblack', { sec: UAB, u0: 0, u1: 1, nu: 32, ys: ysamp([[15.4 - CL, 15.4, 1, 'l'], [15.4, 30.6, 3, 'l'], [30.6, 34.2, 4, 'top'], [34.2, 34.2 + CL, 1, 'l']]), c: 0, t: 0 }), BK);
        add(gr, g.ccyl(3.75, 0.8, 0.2, 24), RING, [0, 6.6, 0], [0, 0, 0], [1, 1, 1.12]);
        add(gr, g.cbox(0.5, 1.4, 2.4, 0.15), SE, [-3.3, 11.5, 0]);
        const it = []; for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) it.push([g.box(0.4, 0.62, 0.62), [0, 18.6 + r * 1.35, (c - 1.5) * 1.35 + (r % 2) * 0.3]]);
        add(gr, fuse('dgArmGrille', it), SE, [-4.33, 0, 0]);
        if (SGEO === 'refl') add(gr, shell('dgSkReflUA', { sec: UAB, u0: 0, u1: 1, nu: 24, ys: [26.6, 29.2], yLo: 26.6, yHi: 29.2, off: 0.22, c: 0, t: 0.45 }), REFL);
        marks(gr, 'UA', [[0, 4.2, 8.3]]);
      });
      P[sd + 'el'] = sidePart(z, gr => {
        add(gr, g.ccyl(5.2, 10.2, 1.1, low ? 10 : 28, 'z'), BK);
        if (!low) add(gr, g.ccyl(2.6, 0.7, 0.25, 20, 'z'), GR, [0, 0, 5.0]);
      });
      // avant-bras : fourreau noir puis maillons gris clair à bagues
      P[sd + 'fa'] = sidePart(z, gr => {
        add(gr, g.lathe([[0, -1], [4.6, -1], [4.6, 5], [4.0, 8.6], [3.2, 9.6], [0, 9.6]], low ? 8 : 24), BK);
        if (low) { add(gr, g.cyl(3.1, 3.1, 21.4, 8), LG, [0, 20, 0]); return; }
        add(gr, g.ccyl(3.25, 8.4, 0.45, 22), LG, [0, 13.4, 0]);
        add(gr, g.ccyl(3.55, 1.5, 0.3, 22), BK, [0, 18.2, 0]);
        add(gr, g.ccyl(3.05, 6.8, 0.45, 22), LG, [0, 22.2, 0]);
        add(gr, g.ccyl(3.3, 1.2, 0.3, 22), RING, [0, 26.2, 0]);
        add(gr, g.ccyl(2.85, 4.6, 0.4, 20), LG, [0, 29, 0]);
        add(gr, fuse('dgFaScrews', [11, 15.8, 20.4, 24].map(y => [g.cyl(0.35, 0.35, 0.4, 6, 'z'), [0, y, 3.25]])), SIL);
        if (SGEO === 'refl') add(gr, g.cyl(3.45, 3.45, 2.6, 20, 'y', true), REFL, [0, 13.4, 0]);
        marks(gr, 'FA', [[0, 20.4, 3.6]]);
      });
      P[sd + 'ha'] = digitHand(z);
    }

    /* ---------- jambes d'autruche : re-pose des jambes ----------
       La formule « genou inversé » actuelle de skeleton() (robots.js) avance la cuisse de 0.55·fk : en garde le pied
       avant flotte ~38 u au-dessus du sol, et accroupi / saut replient les pieds AU-DESSUS de la hanche.
       Tant que cette formule est détectée, on re-pose ici les jambes : pieds placés comme ceux d'un robot à genoux
       normaux (même gameplay), genou miroir derrière la ligne hanche → pied, un peu plus fléchi debout (posture
       accroupie de Digit), puis tout le robot est recalé pour que le pied le plus bas touche le sol.
       Si skeleton() est corrigé (genou miroir), RIG_BUG passe à false et cette correction s'efface. */
    const D2R = PI / 180;
    const RIG_BUG = (() => {
      try {
        if (!ch.revKnee || typeof skeleton !== 'function' || typeof POSES === 'undefined') return false;
        const p = POSES.idle, S = skeleton(ch, p, 1), fh = p.fh + p.fk * 0.55;
        return Math.hypot(S.fkn.x - (S.fhi.x + Math.sin(fh * D2R) * S._L.th), S.fkn.y - (S.fhi.y + Math.cos(fh * D2R) * S._L.th)) < 0.01;
      } catch (e) { return false; }
    })();
    const chN = Object.assign({}, ch, { revKnee: false });
    const BEND = 0.075;                       // raccourcit la ligne hanche → pied debout (genou plus fléchi)
    const TOE = [15.2, -7.5], TOE_R = Math.hypot(TOE[0], TOE[1]), TOE_PHI = Math.atan2(TOE[1], TOE[0]);
    const PARTS = Object.keys(P);
    const angL = (a, b) => Math.atan2(-(b.x - a.x), -(b.y - a.y));
    function setLimb(o, a, b) { o.position.x = a.x; o.position.y = -a.y; o.rotation.set(0, 0, angL(a, b)); }
    function legSolve(p) {
      const pz = p.sx !== 1 ? Object.assign({}, p, { sx: 1 }) : p;
      const Sb = skeleton(ch, pz, 1), Sn = skeleton(chN, pz, 1);
      const a = Sb._L.th, b = Sb._L.sh, sc = Sb._s;
      const out = {};
      let low = 0;
      for (const k of ['fha', 'bha', 'head', 'neck', 'hip']) low = Math.max(low, Sb[k].y);
      for (const sd of ['f', 'b']) {
        const H = Sb[sd + 'hi'], Fn = Sn[sd + 'fo'], Kn = Sn[sd + 'kn'];
        let dx = Fn.x - H.x, dy = Fn.y - H.y; const d0 = Math.hypot(dx, dy) || 1;
        const ux = dx / d0, uy = dy / d0;
        const d = Math.min(d0 * (1 - BEND * Math.pow(Math.max(0, uy), 8)), (a + b) * 0.9995);   // surtout la jambe d'appui sous la hanche
        const F = { x: H.x + ux * d, y: H.y + uy * d };
        const along = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - along * along));
        const cr = ux * (Kn.y - H.y) - uy * (Kn.x - H.x), sg = cr > 1e-6 ? -1 : 1;
        const K = { x: H.x + ux * along - uy * h * sg, y: H.y + uy * along + ux * h * sg };
        out[sd] = { H, K, F };
        low = Math.max(low, F.y, K.y);
      }
      out.low = low + 7 * sc; out.bLow = Sb._low; out.s = sc;
      return out;
    }
    const _a = new T.Vector3(), _b = new T.Vector3(), _x = new T.Vector3(), _z = new T.Vector3(), _mi = new T.Matrix4(), _mb = new T.Matrix4();
    function setRod(rod, pa, A, pb, Bp) {
      pa.updateMatrix(); pb.updateMatrix();
      _b.copy(Bp).applyMatrix4(pb.matrix).applyMatrix4(_mi.copy(pa.matrix).invert());
      _a.subVectors(_b, A); const len = _a.length() || 1; _a.divideScalar(len);
      _x.set(0, 0, 1).cross(_a); if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0); _x.normalize();
      _z.crossVectors(_x, _a);
      rod.grp.position.copy(A); rod.grp.quaternion.setFromRotationMatrix(_mb.makeBasis(_x, _a, _z));
      rod.bar.scale.y = len; rod.eB.position.y = len;
    }
    function legTick(state) {
      const p = state && state.pose;
      if (!p) return;
      const root = P.torso.parent;
      if (RIG_BUG && root) {
        const R = legSolve(p);
        let shift = Math.max(R.low - root.position.y, Math.min(0, R.low - R.bLow));
        for (const k of PARTS) P[k].position.y += shift;
        for (const lg of LEGS) {
          const { H, K, F } = R[lg.sd];
          setLimb(lg.th, H, K); setLimb(lg.hi, H, K); setLimb(lg.sh, K, F); setLimb(lg.kn, K, F);
          lg.th.position.y += shift; lg.hi.position.y += shift; lg.sh.position.y += shift; lg.kn.position.y += shift;
          lg.fo.position.x = F.x; lg.fo.position.y = -F.y + shift;
          // pied : à plat ; s'il est levé près du sol, la pointe vient toucher le sol (appui sur l'avant du pied)
          let th = 0;
          if (!p.rot) {
            const hgt = (root.position.y - F.y + shift - 7 * R.s) / R.s;
            if (hgt > 0.3) th = Math.max(-40 * D2R, Math.asin(Math.max(-1, -(hgt + 7) / TOE_R)) - TOE_PHI);
          }
          lg.fo.rotation.set(0, 0, -(p.rot || 0) * D2R + th);
        }
      }
      for (const lg of LEGS) {
        if (lg.ach) setRod(lg.ach, lg.th, lg.achA, lg.sh, lg.achB);
        if (lg.pla) setRod(lg.pla, lg.sh, lg.plaA, lg.fo, lg.plaB);
      }
    }
    const tick = (t, state) => {
      legTick(state);
      if (ctx.override) return;
      const sup = state && (state.st === 'super' || state.st === 'special');
      LEDG.emissiveIntensity = LEDG.userData.baseI * ((sup ? 1.5 : 0.85) + 0.15 * Math.sin(t * 3.1));
      const ph = (t % 4.3);
      EYE.emissiveIntensity = EYE.userData.baseI * (ph < 0.12 ? 0.15 : sup ? 1.4 : 1);
    };
    return { parts: P, shZ: 23, hpZ: Math.abs(B['right-hip-pitch'][2]), tick };
  };
})();
