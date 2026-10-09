'use strict';
/* =========================================================
   Modèle 3D : FIGURE 02 (Figure AI, 2024) — d'après les photos officielles (face + 3/4)
   Contrat : voir js/kit.js.
   Finition : coques graphite satinées (#4a4d53) + pièces NOIR LAQUÉ miroir (tête, capots d'actionneurs,
   bassin, chaussures) ; mains noires ; grilles perforées noires (aérations) ; tricot noir au cou.
   Tête : œuf noir laqué plus haut que large, sans visage : logo Figure (carrés en escalier) lumineux,
   caméra ronde au front et au menton, bandeaux LED blancs sur les joues, « F.02 » sur les côtés.
   Buste : gilet sculpté (large aux épaules, étroit en bas), emmanchures ovales liserées de clair et
   tapissées de grille noire, gros logo blanc, panneau inférieur « F.02 / ELECTRIC HUMANOID », vis, LED bleues.
   Épaules : gros tambours d'actionneur (axe latéral incliné vers l'avant), capot noir laqué, LED blanche.
   Bras : bande grillagée « FIGURE », coude à tambour et capots noirs, avant-bras effilé, poignet noir.
   Bassin : « haltère » noir laqué (tambours de hanche + bloc central à fente lumineuse), taille noire à câbles.
   Jambes : cuisses carrées arrondies (grille noire en haut), genoux à capots ronds + LED, tibias effilés
   ouverts sur la cheville (biellettes noires), chaussures noires laquées à bout rond + logo.
   Marquages : atlas canvas (blanc sur transparent) ; une version miroir est échangée dans tick() quand le
   robot regarde à gauche (le modèle entier est alors en miroir) → textes toujours lisibles.
   Technique : coques = « patchs » découpés dans des profils à section rectangle arrondi, chanfrein + paroi,
   normales « à pli » ; petits détails fusionnés (fuse).
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
  // angle nominal où la surface passe par z = zt (face avant) ou x = xt (côté +Z)
  const angAt = (tab, y, off, test, lo, hi) => { for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (test(SP(tab, m, y, off))) lo = m; else hi = m; } return (lo + hi) / 2; };
  const angZ = (tab, y, zt, off = 0) => angAt(tab, y, off, p => p[2] < zt, -80, 80);
  const angX = (tab, y, xt, off = 0) => angAt(tab, y, off, p => p[0] > xt, 0, 180);

  /* ---------- textures canvas (cache module) ---------- */
  const TX = {};
  const AW = 512;   // atlas des marquages (blanc sur transparent), régions [x, y, w, h] en px
  const AT = { logo4: [0, 0, 80, 144], face: [88, 0, 72, 100], f02: [168, 0, 256, 128], fig: [424, 0, 88, 22], cap: [424, 30, 88, 44], made: [168, 136, 256, 24], f02s: [0, 152, 128, 64] };
  const FONT = '"Inter", "Helvetica Neue", "Segoe UI", Roboto, Arial, sans-serif';
  function txt(c, s, x, y, wt, px, maxW, ls, al = 'center') {
    c.font = `${wt} ${px}px ${FONT}`; c.textAlign = al; c.textBaseline = 'alphabetic';
    const hasLS = 'letterSpacing' in c; if (hasLS) c.letterSpacing = ls + 'px';
    const mw = c.measureText(s).width;
    if (mw > maxW) c.font = `${wt} ${(px * maxW / mw).toFixed(2)}px ${FONT}`;
    c.fillText(s, x, y);
    if (hasLS) c.letterSpacing = '0px';
  }
  const DRAW = {
    // logo Figure : 4 carrés en escalier (2 colonnes × 4 rangées)
    logo4: c => { for (const [cl, rw] of [[1, 0], [0, 1], [1, 2], [0, 3]]) c.fillRect(8 + cl * 32, 8 + rw * 32, 32.4, 32.4); },
    // visage : logo 2 carrés + 3 petits voyants
    face: c => { c.fillRect(36, 11, 27, 27); c.fillRect(9, 38, 27.4, 27); c.fillStyle = '#8c8c8c'; for (const x of [24, 36, 48]) { c.beginPath(); c.arc(x, 84, 2.6, 0, 7); c.fill(); } },
    f02: (c, w) => { txt(c, 'F.02', w / 2, 80, 400, 86, w * 0.62, 3); txt(c, 'ELECTRIC HUMANOID', w / 2, 106, 600, 14, w * 0.6, 3); },
    fig: (c, w) => txt(c, 'FIGURE', w / 2, 16, 600, 14, w * 0.9, 3),
    cap: c => { txt(c, 'A2', 6, 21, 500, 19, 50, 1, 'left'); txt(c, 'SHOULDER ACTUATOR', 6, 31, 500, 7, 78, 0.6, 'left'); txt(c, 'FIGURE AI · F.02', 6, 40, 500, 7, 78, 0.6, 'left'); },
    made: (c, w) => txt(c, 'MADE IN CALIFORNIA', w / 2, 17, 500, 13, w * 0.9, 3),
    f02s: (c, w) => txt(c, 'F.02', w / 2, 47, 300, 46, w * 0.84, 1)
  };
  function atlas(mirror) {
    const key = mirror ? 'atlasM' : 'atlas';
    if (TX[key]) return TX[key];
    const cv = document.createElement('canvas'); cv.width = cv.height = AW;
    const c = cv.getContext('2d');
    for (const k in AT) {
      const [x, y, w, h] = AT[k];
      c.save();
      if (mirror) { c.translate(x + w, y); c.scale(-1, 1); } else c.translate(x, y);
      c.beginPath(); c.rect(0, 0, w, h); c.clip();
      c.fillStyle = '#fff'; DRAW[k](c, w, h);
      c.restore();
    }
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return (TX[key] = t);
  }
  // grille perforée (trous noirs en quinconce) et tricot côtelé (cou)
  function perfTex() {
    if (TX.perf) return TX.perf;
    const n = 64, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const c = cv.getContext('2d');
    c.fillStyle = '#3a3c41'; c.fillRect(0, 0, n, n);
    c.fillStyle = '#040405';
    for (let r = 0; r < 4; r++) for (let i = -1; i <= 4; i++) { c.beginPath(); c.arc(i * 16 + (r % 2) * 8 + 4, r * 16 + 8, 5.2, 0, 7); c.fill(); }
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return (TX.perf = t);
  }
  function knitTex() {
    if (TX.knit) return TX.knit;
    const n = 64, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const c = cv.getContext('2d'), img = c.createImageData(n, n);
    let r = 777; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 34 + 26 * Math.pow(Math.sin(PI * (x + ((y >> 2) & 1) * 0.8) / 8), 2) + rnd() * 10;
      const i = (y * n + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.repeat.set(22, 3);
    return (TX.knit = t);
  }

  /* ---------- panneaux à UV ----------
     skin : grille épousant un profil, u de aL → aR (gauche → droite du lecteur), v de yB → yT (bas → haut du motif).
       o.rect : région de l'atlas ; o.flipU : motif en miroir (côté 'b' des membres) ; o.tile : UV en tuiles de o.tile cm. */
  function skin(key, tab, aL, aR, yB, yT, off, nu, nv, o = {}) {
    if (GC[key]) return GC[key];
    const rows = [];
    for (let j = 0; j <= nv; j++) { const r = [], y = lerp(yB, yT, j / nv); for (let i = 0; i <= nu; i++) r.push(SP(tab, lerp(aL, aR, i / nu), y, off)); rows.push(r); }
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    let W = 1, H = 1;
    if (o.tile) {
      const m = rows[nv >> 1]; W = 0; for (let i = 1; i <= nu; i++) W += dist(m[i], m[i - 1]);
      H = 0; for (let j = 1; j <= nv; j++) H += dist(rows[j][nu >> 1], rows[j - 1][nu >> 1]);
      W = Math.max(1, Math.round(W / o.tile)); H = Math.max(1, Math.round(H / o.tile));
    }
    const R = o.rect, pos = [], uv = [], idx = [];
    rows.forEach((r, j) => r.forEach((p, i) => {
      pos.push(p[0], p[1], p[2]);
      let u = i / nu; const v = j / nv; if (o.flipU) u = 1 - u;
      if (R) uv.push((R[0] + u * R[2]) / AW, 1 - (R[1] + (1 - v) * R[3]) / AW); else uv.push(u * W, v * H);
    }));
    const flip = (aR - aL) * (yT - yB) < 0;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
      if (flip) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return (GC[key] = geo);
  }
  // plaque plane (face +Z) portant une région de l'atlas
  function plate(key, w, h, R, flipU) {
    if (GC[key]) return GC[key];
    const geo = new T.PlaneGeometry(w, h), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) { let u = uv.getX(i); const v = uv.getY(i); if (flipU) u = 1 - u; uv.setXY(i, (R[0] + u * R[2]) / AW, 1 - (R[1] + (1 - v) * R[3]) / AW); }
    return (GC[key] = geo);
  }

  /* ---------- profils (unités design, 1 ≈ 1 cm) ---------- */
  const LT = lay(6, 6, 6, 3), LL = lay(4, 4, 4, 3), LH = lay(2, 4, 2, 7);
  // buste « gilet » (origine = bassin) : avant = +X ; large aux épaules, étroit en bas
  const CH = prof(LT, [
    { y: 15.0, xp: 8.6, xn: 8.4, z: 8.8, rp: 3.8, rn: 3.8 },
    { y: 16.2, xp: 10.0, xn: 9.8, z: 10.0, rp: 4.4, rn: 4.4 },
    { y: 18.4, xp: 10.8, xn: 10.6, z: 10.6, rp: 4.9, rn: 4.8 },
    { y: 24, xp: 11.4, xn: 11.1, z: 11.2, rp: 5.2, rn: 5.0 },
    { y: 32, xp: 11.9, xn: 11.5, z: 12.0, rp: 5.5, rn: 5.3 },
    { y: 40, xp: 12.2, xn: 11.8, z: 12.8, rp: 5.6, rn: 5.4 },
    { y: 47, xp: 12.2, xn: 11.8, z: 13.4, rp: 5.6, rn: 5.4 },
    { y: 52.5, xp: 11.8, xn: 11.4, z: 13.5, rp: 5.4, rn: 5.3 },
    { y: 55.4, xp: 11.0, xn: 10.8, z: 13.0, rp: 5.0, rn: 5.0 },
    { y: 57.8, xp: 9.8, xn: 9.8, z: 11.6, rp: 4.5, rn: 4.5 },
    { y: 59.6, xp: 8.0, xn: 8.2, z: 9.4, rp: 3.8, rn: 3.8 },
    { y: 60.8, xp: 6.6, xn: 6.8, z: 7.4, rp: 3.3, rn: 3.3 },
    { y: 61.6, xp: 5.8, xn: 6.0, z: 6.2, rp: 3.0, rn: 3.0 }
  ], { bxp: 0.7, bxn: 0.6, bzp: 0.4, bzn: 0.4 });
  // tête : œuf (centre = origine, visage vers +X), plus haute que large, bas arrondi assez large ; HK = échelle
  const HK = 1.05, HT = 12.4 * HK;   // demi-hauteur de la tête
  const HEAD = (() => {
    const yT = 12.4 * HK, yB = -12.4 * HK, yc = 2.6 * HK, list = [], NS = 36;
    const se = (t, n) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(t)), n)), 1 / n);
    for (let i = 0; i <= NS; i++) {
      const y = yB + (yT - yB) * (1 - Math.cos(i / NS * PI)) / 2;
      const up = y >= yc, t = up ? (y - yc) / (yT - yc) : (yc - y) / (yc - yB);
      const k = up ? se(t, 2.2) : se(t, 2.7), lw = up ? 0 : t;
      const xp = Math.max(0.06, 8.2 * HK * k), xn = Math.max(0.06, 9.4 * HK * k * (1 - 0.3 * lw)), z = Math.max(0.06, 7.3 * HK * k * (1 - 0.22 * lw));
      list.push({ y, xp, xn, z, x0: HK * lw * lw, rp: 0.985 * Math.min(xp, z), rn: 0.985 * Math.min(xn, z), bxp: 0, bxn: 0, bzp: 0.35 * k, bzn: 0.35 * k });
    }
    return prof(LH, list);
  })();
  const HY = 0.6;   // décalage vertical de la tête (cou court)
  // membres : origine = articulation proximale, +Y vers l'extrémité ; AVANT = -X (xn), extérieur = +Z (zp)
  const UA = prof(LL, [
    { y: -2, x: 4.3, z: 4.4, r: 3.4 },
    { y: 5, x: 4.8, z: 4.9, r: 3.8 },
    { y: 14, xp: 4.9, xn: 4.9, zp: 5.0, zn: 4.85, r: 3.9 },
    { y: 22, xp: 4.75, xn: 4.75, zp: 4.85, zn: 4.7, r: 3.8 },
    { y: 29, xp: 4.6, xn: 4.6, zp: 4.7, zn: 4.5, r: 3.7 },
    { y: 34, xp: 4.4, xn: 4.4, zp: 4.5, zn: 4.3, r: 3.5 }
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
  // cuisse « carrée arrondie »
  const TH = prof(LL, [
    { y: -1, xp: 5.8, xn: 6.0, zp: 6.0, zn: 5.8, r: 3.6 },
    { y: 8, xp: 6.8, xn: 7.2, zp: 7.0, zn: 6.8, r: 3.9 },
    { y: 18, xp: 7.0, xn: 7.4, zp: 7.1, zn: 6.9, r: 4.0 },
    { y: 28, xp: 6.7, xn: 7.0, zp: 6.8, zn: 6.5, r: 3.9 },
    { y: 36, xp: 6.1, xn: 6.4, zp: 6.2, zn: 5.9, r: 3.6 },
    { y: 44, xp: 5.4, xn: 5.6, zp: 5.5, zn: 5.2, r: 3.3 }
  ], { b: 0.14 });
  const SHN = prof(LL, [
    { y: -2, xp: 5.9, xn: 5.8, zp: 6.0, zn: 5.8, r: 3.8 },
    { y: 4, xp: 6.3, xn: 6.2, zp: 6.2, zn: 6.0, r: 4.0 },
    { y: 12, xp: 6.2, xn: 6.0, zp: 6.0, zn: 5.8, r: 3.9 },
    { y: 22, xp: 5.5, xn: 5.4, zp: 5.3, zn: 5.1, r: 3.6 },
    { y: 32, xp: 4.7, xn: 4.6, zp: 4.5, zn: 4.3, r: 3.2 },
    { y: 40, xp: 4.1, xn: 4.1, zp: 3.9, zn: 3.8, r: 2.9 },
    { y: 45, xp: 3.8, xn: 3.8, zp: 3.6, zn: 3.5, r: 2.7 }
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

  // tambour d'épaule : axe latéral incliné de BETA vers l'avant ; CAP = centre de la face du capot (repère de l'épaule)
  const BETA = 52 * D, CAP = [3.9, 1.5, 3.7];

  return function (ctx) {
    const { g, M, L, ch } = ctx;
    const low = ctx.lod === 'low';
    const P = {};
    let nMesh = 0;
    const add = (parent, geo, mat, p, r, s) => { nMesh++; return ctx.add(parent, geo, mat, { p, r, s }); };
    const addNS = (parent, geo, mat, p, r, s) => { nMesh++; return ctx.add(parent, geo, mat, { p, r, s, shadow: false }); };

    /* ---------- matériaux ---------- */
    const SH = ctx.mat({ color: 0x4f5359, roughness: 0.42, metalness: 0.26, clearcoat: 0.3, clearcoatRoughness: 0.42, envMapIntensity: 0.9 });   // coque graphite satinée
    const SH2 = ctx.mat({ color: 0x3e4146, roughness: 0.5, metalness: 0.3, clearcoat: 0.22, clearcoatRoughness: 0.5, envMapIntensity: 0.75 });  // panneau un ton plus sombre
    const PIP = ctx.mat({ color: 0x70747b, roughness: 0.32, metalness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 1.0 }); // liseré clair des emmanchures
    const GK = ctx.mat({ color: 0x0a0b0d, roughness: 0.14, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.08, envMapIntensity: 0.75 });      // noir laqué miroir
    const BK = ctx.mat({ color: 0x121316, roughness: 0.45, metalness: 0.4, clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 0.65 });   // mécanique noire satinée
    const HB = ctx.mat({ color: 0x111215, roughness: 0.44, metalness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.5 });    // mains : noir satiné-brillant
    const GKC = ctx.mat({ color: 0x08090b, roughness: 0.2, metalness: 0.5, clearcoat: 0.45, clearcoatRoughness: 0.12, envMapIntensity: 0.6 });   // chaussures (laqué, reflets doux)
    const SE = M.seam, ST = M.steel;
    const RU = ctx.mat({ color: 0x18191c, roughness: 0.78, metalness: 0.05, envMapIntensity: 0.35 });
    const BZ = ctx.mat({ color: 0x8a8f97, roughness: 0.26, metalness: 0.9, clearcoat: 0.6, envMapIntensity: 1.0 });                            // bagues de caméra
    const LENS = ctx.mat({ color: 0x060a14, roughness: 0.03, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 });
    const LEDW = ctx.glow(0xeef6ff, 2.4);    // LED blanches (joues, épaules, genoux, bassin)
    const LEDB = ctx.glow(0x4f6dff, 2.6);    // LED bleues (col, bas du buste)

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
    // capot rond laqué (face plate à bord très arrondi), axe +Z
    const capGeo = (r, h) => g.lathe([[0, h], [r * 0.45, h * 0.96], [r * 0.7, h * 0.86], [r * 0.86, h * 0.66], [r * 0.96, h * 0.34], [r, 0]], 32, 'z');

    /* =====================================================
       LOD bas (images rémanentes) : même silhouette, très peu de triangles
       ===================================================== */
    if (low) {
      const torso = ctx.group();
      add(torso, loft('figLoCH', CH, 15.0, 61.6, 5, { capB: true, capT: true }), SH);
      add(torso, g.cyl(4.4, 5.6, 11, 8), BK, [0, 10, 0]);
      add(torso, g.box(12.0, 10.0, 15.0), GK);
      for (const z of [1, -1]) add(torso, g.cyl(5.6, 5.6, 10.4, 10, 'z'), GK, [0, 0, z * 12.6]);
      P.torso = torso;
      P.neck = ctx.group(ctx.mesh(g.cyl(3.4, 5.4, 10, 8), BK, { p: [0, 5, 0] }));
      P.head = ctx.group(ctx.mesh(loft('figLoHD', HEAD, -HT, HT, 8, { capB: true, capT: true }), GK, { p: [0, HY, 0] }));
      for (const [sd, z] of [['f', 1], ['b', -1]]) {
        P[sd + 'sc'] = sidePart(z, gr => add(gr, g.cyl(5.8, 5.8, 9, 10, 'z'), SH, [CAP[0] - 4.5 * Math.sin(BETA), CAP[1], CAP[2] - 4.5 * Math.cos(BETA)], [0, BETA, 0]));
        P[sd + 'ua'] = sidePart(z, gr => add(gr, loft('figLoUA', UA, 4, 33, 2), SH));
        P[sd + 'fa'] = sidePart(z, gr => add(gr, loft('figLoFA', FA, -1, 31.5, 3), SH));
        P[sd + 'th'] = sidePart(z, gr => add(gr, loft('figLoTH', TH, 4, 40, 3), SH), L.th / 44);
        P[sd + 'sh'] = sidePart(z, gr => add(gr, loft('figLoSH', SHN, 0, 44, 3), SH), L.sh / 44);
        P[sd + 'kn'] = ctx.group(ctx.mesh(g.cyl(4.5, 4.5, 14, 8, 'z'), GK));
        P[sd + 'el'] = ctx.group(ctx.mesh(g.cyl(4.3, 4.3, 10, 8, 'z'), SH));
        P[sd + 'fo'] = sidePart(z, gr => add(gr, loft('figLoFT', FLO, -8.4, 18.9, 4, { capB: true, capT: true, axis: 'x' }), GK));
        P[sd + 'ha'] = RK.hand(ctx, { side: z, palm: [8.2, 3.2, 7.4], palmMat: BK, fingerMat: BK });
      }
      return { parts: P, shZ: 18, hpZ: 12.5 };
    }

    // textures (haut LOD seulement) + matériaux texturés
    const ATL = atlas(false), ATLM = atlas(true);
    const MSH = ctx.mat({ color: 0xffffff, map: perfTex(), roughness: 0.62, metalness: 0.2, envMapIntensity: 0.45 });                             // grille perforée noire
    const FAB = ctx.mat({ color: 0xffffff, map: knitTex(), roughness: 0.95, metalness: 0, envMapIntensity: 0.2 });                                // tricot du cou
    const DECP = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };
    const DEC = ctx.mat(Object.assign({ color: 0xf3f5f8, map: ATL, roughness: 0.5, metalness: 0, clearcoat: 0.2, envMapIntensity: 0.3 }, DECP)); // marquages blancs
    const LOGO = ctx.glow(0xffffff, 1.5);   // logo facial lumineux
    if (!ctx.override) Object.assign(LOGO, { map: ATL, emissiveMap: ATL }, DECP);

    /* =====================================================
       TORSE : bassin « haltère », taille noire à câbles, buste gilet
       ===================================================== */
    const torso = ctx.group();
    {
      // --- bassin : bloc central + tambours de hanche, noir laqué ---
      add(torso, g.rbox(12.0, 10.0, 15.0, 2.6, 2), GK, [0, -0.3, 0]);
      add(torso, g.rbox(5.0, 1.8, 7.6, 0.7, 1), SE, [4.2, 4.5, 0]);                    // encoche supérieure avant
      addNS(torso, g.cbox(0.3, 0.34, 3.4, 0.1), LEDW, [5.95, 3.5, 0]);               // fente lumineuse
      for (const z of [1, -1]) {
        add(torso, g.ccyl(5.6, 10.4, 1.1, 32, 'z'), GK, [0, 0, z * 12.6]);            // tambour de hanche
        add(torso, g.cyl(5.63, 5.63, 0.2, 32, 'z', true), SE, [0, 0, z * 9.9]);        // joint
      }

      // --- taille noire : colonne, baie sous le buste, câbles ---
      add(torso, g.ccyl(4.4, 10.6, 0.6, 20), BK, [0, 9.6, 0]);
      add(torso, g.rbox(12.6, 3.0, 14.6, 1.2, 1), BK, [0, 14.0, 0]);
      add(torso, g.ccyl(5.6, 1.6, 0.6, 20), BK, [0, 12.0, 0]);
      {
        const cab = [];
        for (const zs of [1, -1]) for (const xs of [1, -1]) cab.push([g.tube([[xs * 3.2, 13.6, zs * 6.4], [xs * 3.6, 10.6, zs * 7.8], [xs * 3.0, 7.2, zs * 7.0], [xs * 2.0, 4.8, zs * 5.4]].map(p => p.map(v => +v.toFixed(2))), 0.45, 14, 5), null]);
        add(torso, fuse('figCables', cab), BK);
      }

      // --- buste ---
      // emmanchure : superellipse qui déborde sur les coins avant/arrière (vue de face : liseré du « gilet »)
      const hole = a => { const d = Math.min(1, Math.abs(Math.abs(na(a)) - 90) / 50); return Math.pow(Math.max(0, 1 - Math.pow(d, 3.2)), 0.3); };
      const ARM_LO = a => 48.6 - 11.0 * hole(a);     // bas de l'emmanchure (haut du panneau latéral)
      const ARM_HI = a => 49.2 + 10.0 * hole(a);     // haut de l'emmanchure (bas de la bretelle)
      const TOMB = a => 45.4 - 7.5 * Math.pow(clamp((Math.abs(na(a)) - 16) / 20, 0, 1), 2);
      add(torso, loft('figCHcore', CH, 15.0, 61.6, 7, { off: -0.9, capB: true, capT: true }), SE);
      add(torso, patch('figFront', { tab: CH, a0: -40, a1: 40, y0: 15.0, y1: 60.9, nv: 11, c: 0.5, t: 1.4 }), SH);
      add(torso, patch('figTomb', { tab: CH, a0: -36, a1: 36, y0: 16.6, y1: TOMB, nv: 8, off: 0.2, c: 0.3, t: 0.7 }), SH);
      for (const s of [1, -1]) {
        const A0 = s > 0 ? 42 : -138, A1 = s > 0 ? 138 : -42;
        add(torso, patch('figSide' + s, { tab: CH, a0: A0, a1: A1, y0: 15.0, y1: ARM_LO, nv: 9, c: 0.5, t: 1.4 }), SH);
        add(torso, patch('figStrap' + s, { tab: CH, a0: A0, a1: A1, y0: ARM_HI, y1: 60.9, nv: 3, c: 0.5, t: 1.4 }), SH);
        add(torso, skin('figSock' + s, CH, A0 + 1, A1 - 1, 36.4, 59.8, -0.6, 18, 8, { tile: 1.5 }), MSH);   // grille noire
        const rim = [];
        for (let i = 0; i <= 20; i++) { const a = A0 + 1.2 + (A1 - A0 - 2.4) * i / 20; rim.push(SP(CH, a, ARM_LO(a) - 0.3, 0.05)); }
        for (let i = 20; i >= 0; i--) { const a = A0 + 1.2 + (A1 - A0 - 2.4) * i / 20; rim.push(SP(CH, a, ARM_HI(a) + 0.3, 0.05)); }
        rim.push(rim[0]);
        add(torso, g.tube(rim, 0.36, 56, 6), PIP);
      }
      add(torso, patch('figBackPan', { tab: CH, a0: 146, a1: 214, y0: 35.0, y1: a => 54.0 - 2.4 * Math.pow((180 - Math.abs(na(a))) / 34, 2), nv: 5, off: 0.16, c: 0.22, t: 0.5 }), SH2);
      add(torso, patch('figBackUp', { tab: CH, a0: 140, a1: 220, y0: 31.0, y1: 60.9, nv: 8, c: 0.5, t: 1.4 }), SH);
      add(torso, patch('figBackLo', { tab: CH, a0: 140, a1: 220, y0: 15.0, y1: 30.4, nv: 6, c: 0.5, t: 1.4 }), SH);
      add(torso, skin('figBackVent', CH, 160, 200, 19.6, 27.4, -0.25, 6, 3, { tile: 1.5 }), MSH);
      add(torso, patch('figCollar', { tab: CH, closed: true, y0: 61.0, y1: 61.6, nv: 1, off: -0.4, c: 0.15, t: 0.4 }), BK);
      // vis du plastron / des flancs / du dos
      const screws = [];
      for (const s of [1, -1]) {
        for (const [a, y] of [[21, 37.0], [21, 29.5], [31, 20.0], [38, 33.0], [150, 52], [150, 34], [150, 19], [90, 24], [90, 33]]) screws.push([screw(0.32), null, nMat(CH, s * a, y, a < 30 ? 0.25 : 0.05)]);
      }
      add(torso, fuse('figScrews', screws), SE);
      // voyants d'état bleus (col + bas du buste)
      addNS(torso, fuse('figStatus', [[g.cbox(0.5, 0.35, 1.6, 0.12), null, nMat(CH, 0, 60.5, 0.1)], [g.cbox(0.6, 0.35, 2.6, 0.12), null, nMat(CH, 0, 15.8, 0.25)]]), LEDB);
      // marquages : logo en escalier (haut du plastron), « F.02 / ELECTRIC HUMANOID », « MADE IN CALIFORNIA »
      const deco = (key, y, w, h, R, off) => addNS(torso, skin(key, CH, angZ(CH, y, w / 2, off), angZ(CH, y, -w / 2, off), y - h / 2, y + h / 2, off, 8, 6, { rect: R }), DEC);
      deco('figDecLogo', 51.0, 80 * 0.054, 144 * 0.054, AT.logo4, 0.04);
      deco('figDecF02', 41.6, 8.6, 4.3, AT.f02, 0.24);
      deco('figDecMade', 18.4, 4.2, 0.39, AT.made, 0.24);
    }
    P.torso = torso;

    /* =====================================================
       COU : manchon en tricot noir mat
       ===================================================== */
    {
      const n = ctx.group();
      add(n, g.lathe([[0, 0], [5.9, 0], [5.7, 1.4], [5.1, 3.4], [4.3, 5.8], [3.7, 8.6], [3.4, 11.6], [3.3, 16.2], [0, 16.2]], 24), FAB);
      P.neck = n;
    }

    /* =====================================================
       TÊTE : œuf noir laqué, logo lumineux, deux caméras, bandeaux LED, « F.02 »
       ===================================================== */
    {
      const h = ctx.group(); h.position.y = HY;
      add(h, patch('figHDshell', { tab: HEAD, closed: true, y0: -HT, y1: HT, nv: 20, c: 0, t: 0, capT: true, capB: true, vmap: v => (1 - Math.cos(v * PI)) / 2 }), GK);
      // caméras (front / menton) : bague sombre + verre + iris
      const cams = [], glass = [], iris = [];
      for (const y of [5.4 * HK, -9.0 * HK]) {
        cams.push([g.lathe([[1.2, 0.5], [1.7, 0.48], [2.0, 0.22], [2.0, -0.3]], 20), null, nMat(HEAD, 0, y, 0.25)]);
        glass.push([g.lathe([[0, 0.42], [0.5, 0.4], [0.95, 0.28], [1.22, 0.05]], 16), null, nMat(HEAD, 0, y, 0.38)]);
        iris.push([g.torus(0.55, 0.08, 16, 4, PI * 2, 'y'), null, nMat(HEAD, 0, y, 0.78)]);
      }
      add(h, fuse('figCamRings', cams), BZ);
      add(h, fuse('figCamGlass', glass), LENS);
      add(h, fuse('figCamIris', iris), BZ);
      // logo facial lumineux + 3 voyants (atlas)
      const fw = 72 * 0.058 * HK, fh = 100 * 0.058 * HK, fy = -1.9 * HK;
      addNS(h, skin('figFaceDec', HEAD, angZ(HEAD, fy, fw / 2, 0.05), angZ(HEAD, fy, -fw / 2, 0.05), fy - fh / 2, fy + fh / 2, 0.05, 8, 8, { rect: AT.face }), LOGO);
      // bandeaux LED blancs sur les joues (suivent la courbe de la mâchoire)
      const strips = [];
      for (const s of [1, -1]) {
        const pts = [];
        for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(SP(HEAD, s * (62 - 10 * t), (-5.4 - 3.8 * t) * HK, 0.06).map(v => +v.toFixed(3))); }
        strips.push([g.tube(pts, 0.2, 12, 5), null]);
      }
      addNS(h, fuse('figCheekLED', strips), LEDW);
      // « F.02 » sur les côtés (lisible de chaque côté)
      for (const s of [1, -1]) {
        const aF = angX(HEAD, 5.8 * HK, 0.6), aB = angX(HEAD, 5.8 * HK, -2.6);
        addNS(h, skin('figHDtxt' + s, HEAD, s > 0 ? aB : -aF, s > 0 ? aF : -aB, 5.0 * HK, 6.6 * HK, 0.04, 6, 2, { rect: AT.f02s }), DEC);
      }
      P.head = ctx.group(h);
    }

    /* =====================================================
       BRAS
       ===================================================== */
    for (const [sd, z] of [['f', 1], ['b', -1]]) {
      // épaule : gros tambour (suit le torse), capot noir laqué + LED + texte, moyeu vers le buste
      P[sd + 'sc'] = sidePart(z, gr => {
        const dr = ctx.group(); dr.position.set(CAP[0], CAP[1], CAP[2]); dr.rotation.set(0, BETA, 0); gr.add(dr);
        add(dr, g.ccyl(6.0, 8.4, 0.9, 32, 'z'), SH, [0, 0, -4.6]);
        add(dr, g.cyl(5.7, 5.7, 0.25, 32, 'z', true), SE, [0, 0, -0.42]);
        add(dr, capGeo(5.8, 1.8), GK, [0, 0, -0.4]);
        add(dr, g.ccyl(4.6, 3.2, 0.4, 20, 'z'), BK, [0, 0, -10.2]);
        addNS(dr, g.sphere(0.4, 8, 6), LEDW, [4.3, -0.9, 0.88]);
        addNS(dr, plate('figCapTxt' + sd, 3.0, 1.5, AT.cap, z < 0), DEC, [1.0, 1.4, 1.38]);
      });
      // bras : coque haute, bague « FIGURE », fenêtre grillagée (extérieur-avant), coque basse, chape du coude
      P[sd + 'ua'] = sidePart(z, gr => {
        add(gr, loft('figUAcore', UA, -2, 34, 4, { off: -0.8 }), BK);
        add(gr, patch('figUAtop', { tab: UA, closed: true, y0: 5.0, y1: 18.0, nv: 6, c: 0.45, t: 1.2 }), SH);
        add(gr, patch('figUAmid', { tab: UA, a0: 212, a1: 420, y0: 18.4, y1: 27.0, nv: 3, c: 0.4, t: 1.0 }), SH);
        add(gr, skin('figUAmesh', UA, 58, 214, 18.2, 27.2, -0.45, 14, 4, { tile: 1.4 }), MSH);
        add(gr, patch('figUAlow', { tab: UA, closed: true, y0: 27.4, y1: 33.6, nv: 3, c: 0.4, t: 1.0 }), SH);
        addNS(gr, skin('figUAtxt' + sd, UA, 104, 170, 17.4, 16.3, 0.03, 6, 1, { rect: AT.fig, flipU: z < 0 }), DEC);
      });
      // coude : tambour graphite, capots noirs laqués des deux côtés, couvre-olécrane
      P[sd + 'el'] = sidePart(z, gr => {
        add(gr, g.ccyl(4.3, 9.4, 0.7, 28, 'z'), SH);
        for (const zz of [1, -1]) add(gr, capGeo(3.9, 0.8), GK, [0, 0, zz * 4.65], zz < 0 ? [PI, 0, 0] : undefined);
        add(gr, g.prism([[1.4, -3.0], [4.0, -1.8], [4.6, 0.8], [3.6, 3.2], [1.4, 2.8]], 6.6, 0.6), SH2);
      });
      // avant-bras graphite effilé (deux coques), manchette, poignet noir
      P[sd + 'fa'] = sidePart(z, gr => {
        add(gr, loft('figFAcore', FA, -1, 31.5, 4, { off: -0.7 }), BK);
        add(gr, patch('figFAup', { tab: FA, closed: true, y0: 3.6, y1: 13.4, nv: 5, c: 0.45, t: 1.2 }), SH);
        add(gr, patch('figFAlo', { tab: FA, closed: true, y0: 13.8, y1: 25.6, nv: 6, c: 0.45, t: 1.2 }), SH);
        add(gr, patch('figFAcuff', { tab: FA, closed: true, y0: 26.0, y1: 28.6, nv: 2, c: 0.3, t: 0.8 }), SH2);
        add(gr, patch('figFAwr', { tab: FA, closed: true, y0: 29.0, y1: 31.4, nv: 1, off: -0.35, c: 0.2, t: 0.5 }), BK);
        add(gr, fuse('figFAscrews', [[0, 6], [0, 22], [180, 6], [180, 22]].map(([a, y]) => [screw(0.3), null, nMat(FA, a, y, 0.05)])), SE);
      });
      P[sd + 'ha'] = figHand(z);
    }

    /* =====================================================
       JAMBES
       ===================================================== */
    for (const [sd, z] of [['f', 1], ['b', -1]]) {
      // hanche : disque extérieur du tambour (tourne avec la cuisse)
      P[sd + 'hi'] = sidePart(z, gr => {
        add(gr, g.ccyl(3.9, 0.5, 0.2, 28, 'z'), GK, [0, 0, 5.35]);
        add(gr, g.torus(4.15, 0.1, 32, 4, PI * 2, 'z'), SE, [0, 0, 5.32]);
      });
      // cuisse : grille noire sous le tambour, manchon haut, cuisse basse, panneau avant
      P[sd + 'th'] = sidePart(z, gr => {
        add(gr, loft('figTHcore', TH, -1, 44, 5, { off: -0.9 }), BK);
        add(gr, skin('figTHmesh', TH, 0, 360, 1.5, 9.8, -0.35, 24, 3, { tile: 1.4 }), MSH);
        add(gr, patch('figTHcuff', { tab: TH, closed: true, y0: 9.8, y1: 20.4, nv: 5, off: 0.35, c: 0.5, t: 1.4 }), SH);
        add(gr, patch('figTHlow', { tab: TH, closed: true, y0: 20.8, y1: 38.0, nv: 6, c: 0.45, t: 1.2 }), SH);
        add(gr, patch('figTHarch', { tab: TH, a0: 138, a1: 222, y0: a => 30.6 + 4.2 * Math.pow((180 - Math.abs(na(a))) / 42, 1.6), y1: 37.6, nv: 3, off: 0.12, c: 0.18, t: 0.45 }), SH);
        add(gr, fuse('figTHscrews', [[160, 35.8], [200, 35.8], [90, 26], [90, 34], [270, 30]].map(([a, y]) => [screw(0.32), null, nMat(TH, a, y, 0.05)])), SE);
      }, L.th / 44);
      // genou : axe noir, bagues graphite, capots ronds laqués des deux côtés, LED blanche (extérieur)
      P[sd + 'kn'] = sidePart(z, gr => {
        add(gr, g.ccyl(4.4, 12.0, 0.6, 20, 'z'), BK);
        for (const zz of [1, -1]) {
          add(gr, g.ccyl(4.8, 1.6, 0.5, 28, 'z'), SH, [0, 0, zz * 6.5]);
          add(gr, capGeo(4.35, 0.9), GK, [0, 0, zz * 7.3], zz < 0 ? [PI, 0, 0] : undefined);
        }
        addNS(gr, g.cbox(1.2, 0.32, 0.2, 0.08), LEDW, [-3.1, -0.5, 8.05]);
        add(gr, g.prism([[-3.8, -3.6], [-5.7, -2.0], [-6.3, 1.2], [-5.6, 4.2], [-3.8, 5.0], [-3.2, -3.2]], 8.8, 0.6), SH);
        addNS(gr, g.cbox(0.3, 0.3, 3.0, 0.1), LEDW, [-6.25, 2.6, 0]);   // fente lumineuse sous la ligne de genou
      });
      // tibia : long, effilé, ouvert en arche sur la cheville (biellettes noires)
      P[sd + 'sh'] = sidePart(z, gr => {
        const ARCH = a => { const u = Math.min(1, (180 - Math.abs(na(a))) / 58); return 40.6 - 7.6 * Math.sqrt(Math.max(0, 1 - u * u)); };
        add(gr, loft('figSHcore', SHN, -2, 45, 5, { off: -0.8 }), BK);
        add(gr, patch('figSHfr', { tab: SHN, a0: 93, a1: 267, y0: 2.4, y1: ARCH, nv: 8, c: 0.5, t: 1.3 }), SH);
        add(gr, patch('figSHbk', { tab: SHN, a0: -87, a1: 87, y0: 2.4, y1: 41.6, nv: 8, c: 0.5, t: 1.3 }), SH);
        add(gr, patch('figSHpan', { tab: SHN, a0: 144, a1: 216, y0: 5.0, y1: a => 16.4 - 1.6 * Math.pow((180 - Math.abs(na(a))) / 36, 4), nv: 3, off: 0.12, c: 0.18, t: 0.45 }), SH);
        add(gr, fuse('figSHscrews', [[156, 21.5], [204, 21.5], [90, 8], [90, 30], [-90, 8], [-90, 30]].map(([a, y]) => [screw(0.3), null, nMat(SHN, a, y, 0.05)])), SE);
        add(gr, fuse('figAnkLinks', [1, -1].flatMap(zz => [rodItem([-2.5, 32.0, zz * 1.9], [-1.8, 43.4, zz * 2.4], 0.55, 8), rodItem([-1.0, 33.5, zz * 0.6], [-0.6, 42.6, zz * 0.8], 0.4, 6)])), BK);
        add(gr, fuse('figAnkBalls', [1, -1].map(zz => [g.sphere(0.75, 8, 6), [-2.5, 32.0, zz * 1.9]])), ST);
      }, L.sh / 44);
      // pied : chaussure noire laquée (tige, semelle, bout rond, contrefort), logo et LED
      P[sd + 'fo'] = sidePart(z, gr => {
        add(gr, loft('figSOLE', SOLE, -8.5, 19.0, 8, { capB: true, capT: true, axis: 'x' }), RU);
        add(gr, loft('figFTup', FT, -8.2, 18.7, 11, { capB: true, capT: true, axis: 'x' }), GKC);
        add(gr, patch('figFTtoe', { tab: FT, a0: 96, a1: 264, y0: 11.6, y1: 18.7, nv: 4, off: 0.2, c: 0.25, t: 0.7, axis: 'x' }), GKC);
        add(gr, patch('figFTheel', { tab: FT, a0: 64, a1: 296, y0: -8.2, y1: -4.4, nv: 3, off: 0.2, c: 0.25, t: 0.7, axis: 'x' }), GKC);
        add(gr, g.shape('figureMidsole', sh => {
          const R = [[-8.4, 3.6], [-7.6, 5.0], [-4.5, 5.45], [0, 5.55], [3.5, 5.65], [7.5, 5.75], [11.5, 5.65], [15, 5.2], [17.6, 4.05], [18.9, 2.1]];
          R.forEach(([x, w], i) => i ? sh.lineTo(x, w) : sh.moveTo(x, w)); for (let i = R.length - 1; i >= 0; i--) sh.lineTo(R[i][0], -R[i][1]);
        }, 0.4, 0.1, 1), BK, [0, -4.45, 0], [PI / 2, 0, 0]);
        add(gr, patch('figFTtongue', { tab: FT, a0: 148, a1: 212, y0: 0.5, y1: 8.5, nv: 4, off: 0.2, c: 0.25, t: 0.6, axis: 'x' }), BK);
        add(gr, g.ccyl(3.0, 9.0, 0.5, 20, 'z'), BK);
        for (const zz of [1, -1]) add(gr, g.ccyl(2.2, 0.6, 0.2, 18, 'z'), GK, [0, 0, zz * 4.7]);
        // logo sur le bout du pied (incliné comme le dessus de la chaussure)
        const lg = ctx.group(); lg.position.set(13.2, -1.3, 0); lg.rotation.z = -0.3; gr.add(lg);
        addNS(lg, plate('figShoeLogo' + sd, 80 * 0.022, 144 * 0.022, AT.logo4, z < 0), DEC, [0, 0.12, 0], [-PI / 2, 0, -PI / 2]);
        addNS(gr, g.cbox(1.6, 0.3, 0.2, 0.08), LEDW, [-3.6, -3.4, SP(FT, 90, -3.6)[2] + 0.12]);   // LED latérale (talon, extérieur)
      });
    }

    /* =====================================================
       MAIN (contrat de RK.hand : origine = poignet, +X = doigts, paume -Y, userData.setCurl)
       main humaine noire : paume brillante, capot dorsal laqué, phalanges segmentées
       ===================================================== */
    function figHand(side) {
      const root = ctx.group(), inner = ctx.group();
      if (side < 0) inner.scale.z = -1;
      root.add(inner);
      const PL = 8.2, PT = 3.2, PW = 7.4, FW = 1.6, FL = [3.9, 2.8, 2.3], FTH = [2.1, 1.9, 1.7], X0 = 2.4;
      const zf = i => ((i + 0.5) / 4 - 0.5) * 6.8;
      add(inner, g.ccyl(2.7, 2.6, 0.5, 16, 'x'), BK, [1.1, 0, 0]);
      add(inner, g.rbox(PL, PT, PW, 1.1, 1), HB, [X0 + PL / 2, -0.1, 0]);
      add(inner, g.rbox(PL - 1.4, 1.0, PW - 1.0, 0.45, 2), HB, [X0 + PL / 2 + 0.1, PT / 2 + 0.1, 0]);
      add(inner, g.rbox(PL - 2.2, 0.7, PW - 1.4, 0.3, 1), RU, [X0 + PL / 2 + 0.3, -PT / 2 - 0.12, 0]);
      add(inner, fuse('figKnuck', [0, 1, 2, 3].map(i => [g.cyl(1.0, 1.0, 1.45, 10, 'z'), [X0 + PL - 0.3, 0.2, zf(i)]])), BK);
      // phalange (prisme octogonal chanfreiné, embout arrondi pour la dernière) + rouleau d'articulation, fusionnés
      const seg = (Lx, t, w, tip) => fuse(`figSeg${Lx},${t},${w},${tip}`, [
        [tip ? g.lathe([[0, -0.5], [0.4, -0.5], [0.5, -0.38], [0.5, 0.18], [0.42, 0.38], [0.24, 0.5], [0, 0.53]], 8, 'x') : g.ccyl(0.5, 1, 0.12, 8, 'x'), [Lx / 2, 0, 0], [PI / 8, 0, 0], [Lx - 0.3, t, w]],
        [g.cyl(t * 0.44, t * 0.44, w * 1.08, 7, 'z'), [0, 0, 0]]
      ]);
      const fingers = [];
      for (let i = 0; i < 4; i++) {
        const zz = zf(i), k = [0.92, 1, 0.97, 0.84][i];
        let parent = inner; const segs = [];
        for (let j = 0; j < 3; j++) {
          const piv = ctx.group(); piv.userData.noMerge = true;
          if (j === 0) piv.position.set(X0 + PL + 0.5, 0.15, zz); else piv.position.set(FL[j - 1] * k, 0, 0);
          add(piv, seg(+(FL[j] * k).toFixed(2), FTH[j], FW, j === 2), j === 1 ? BK : HB);
          parent.add(piv); parent = piv; segs.push(piv);
        }
        fingers.push(segs);
      }
      // pouce (côté -Z pour la main 'f')
      const t0 = ctx.group(); t0.position.set(3.6, -0.6, -3.4); t0.userData.noMerge = true;
      add(t0, seg(3.8, 2.4, 2.0, false), HB);
      const t1 = ctx.group(); t1.position.set(3.8, 0, 0); t0.add(t1);
      add(t1, seg(2.9, 2.1, 1.8, false), BK);
      const t2 = ctx.group(); t2.position.set(2.9, 0, 0); t1.add(t2);
      add(t2, seg(2.4, 1.9, 1.7, true), HB);
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
      LOGO.emissiveIntensity = LOGO.userData.baseI * ((sup ? 1.7 : 0.95) + 0.08 * Math.sin(t * 2.2));
      LEDW.emissiveIntensity = LEDW.userData.baseI * ((sup ? 1.5 : 0.9) + 0.1 * Math.sin(t * 2.2));
      LEDB.emissiveIntensity = LEDB.userData.baseI * (0.75 + 0.25 * Math.sin(t * 3.1));
      // modèle en miroir (robot tourné vers la gauche) : atlas miroir → marquages lisibles
      const A = state && state.face < 0 ? ATLM : ATL;
      if (DEC.map !== A) { DEC.map = A; LOGO.map = A; LOGO.emissiveMap = A; }
    };
    return { parts: P, shZ: 18, hpZ: 12.5, tick };
  };
})();
