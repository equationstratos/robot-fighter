'use strict';
/* =========================================================
   Modèle 3D : ATLAS électrique (Boston Dynamics, 2024)
   Contrat : voir js/kit.js.  Repères : torse/tête/épaules avant = +X ;
   membres (th/sh/ua/fa/kn/el/hi) : origine à l'articulation proximale, +Y vers l'os,
   avant du membre = -X quand il pend. Côté 'f' = +Z (vers la caméra).
   Matières : alu brossé satiné (structure), alu poli (bassin/taille), panneaux gris foncé,
   coussins noirs caoutchouc, tête en plastique blanc + objectif noir + anneau LED ambré.
   ========================================================= */
if (typeof RK !== 'undefined' && RK) RK.models.atlas = function (ctx) {
  const { T, ch, g, M, L } = ctx;
  const lo = ctx.lod === 'low';
  const PI = Math.PI, H = PI / 2;
  const self = RK.models.atlas;
  const LC = self._lc || (self._lc = {}); // cache local des géométries composées
  const P = {};

  /* ---------------- skins : motifs procéduraux ----------------
     Textures « masque » (créées une fois, cache module) projetées en TRIPLANAIRE dans le repère local de chaque pièce
     (unités design) : pas de dépendance aux UV des géométries (lathe / extrusions / boîtes ont des UV incompatibles).
     Canaux : R → couleur c2 (+ rugosité/métal r2/m2), G → couleur c3 (r3/m3), B → émission (e × eI, non affectée par le flash). */
  const PTX = self._ptx || (self._ptx = {});
  const ptex = (kind) => {
    if (PTX[kind]) return PTX[kind];
    const n = kind === 'solid' ? 4 : kind === 'cracks' ? 512 : 256;
    const cv = document.createElement('canvas'); cv.width = cv.height = n;
    const c = cv.getContext('2d');
    let seed = 1234567; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const img = c.createImageData(n, n), px = img.data;
    const put = (fn) => {
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const v = fn(x, y), i = (y * n + x) * 4;
        px[i] = Math.max(0, Math.min(255, v[0] * 255)); px[i + 1] = Math.max(0, Math.min(255, v[1] * 255)); px[i + 2] = Math.max(0, Math.min(255, v[2] * 255)); px[i + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    };
    const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    // bruit de valeur raccordable (cells × cells)
    const vnoise = (cx, cy, sd) => {
      seed = sd; const gr = []; for (let i = 0; i < cx * cy; i++) gr.push(rnd());
      const G = (a, b) => gr[((b % cy) + cy) % cy * cx + ((a % cx) + cx) % cx];
      return (x, y) => {
        x = x / n * cx; y = y / n * cy; const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        return G(xi, yi) * (1 - sx) * (1 - sy) + G(xi + 1, yi) * sx * (1 - sy) + G(xi, yi + 1) * (1 - sx) * sy + G(xi + 1, yi + 1) * sx * sy;
      };
    };
    // Voronoï raccordable : renvoie (x, y) => distance approchée au bord de cellule (px)
    const voro = (cells, sd, jit = 0.85) => {
      seed = sd; const pts = []; for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.5 + (rnd() - 0.5) * jit) * n / cells, (j + 0.5 + (rnd() - 0.5) * jit) * n / cells]);
      const cs = n / cells;
      return (x, y) => {
        const ci = Math.floor(x / cs), cj = Math.floor(y / cs); let f1 = 1e9, f2 = 1e9;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
          const ii = ci + di, jj = cj + dj, wi = ((ii % cells) + cells) % cells, wj = ((jj % cells) + cells) % cells;
          const p = pts[wj * cells + wi], qx = p[0] + (ii - wi) * cs, qy = p[1] + (jj - wj) * cs;
          const d = Math.hypot(qx - x, qy - y);
          if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
        }
        return (f2 - f1) * 0.5;
      };
    };
    if (kind === 'solid') put(() => [0, 0, 1]);
    else if (kind === 'hazard') { // chevrons de sécurité (bandes à 45°) : R = bande noire
      put((x, y) => { const u = (x + y + 0.5) % 64, e = u < 32 ? Math.min(u, 32 - u) : -Math.min(u - 32, 64 - u); return [Math.min(1, Math.max(0, 0.5 + e / 1.6)), 0, 0]; });
    } else if (kind === 'carbon') { // sergé 2×2 de fibre de carbone : R = reflet des mèches
      put((x, y) => {
        const i = x >> 4, j = y >> 4, fx = (x & 15) / 16, fy = (y & 15) / 16, hor = ((i + j) & 3) < 2;
        const a = hor ? fy : fx, b = hor ? fx : fy;
        const s = Math.sin(Math.PI * a) * (0.85 + 0.15 * Math.sin(Math.PI * 2 * b));
        return [s * (hor ? 0.9 : 0.35), 0, 0];
      });
    } else if (kind === 'cracks') { // basalte fissuré : R = roche brûlée autour des fissures, G = mouchetures, B = lave
      // Voronoï déformé (fissures sinueuses), largeur et chaleur variables le long des fissures (zones refroidies / incandescentes)
      const v1 = voro(5, 99), v2 = voro(11, 4242, 0.95), nz = vnoise(5, 5, 777), nz2 = vnoise(16, 16, 31), nz3 = vnoise(9, 9, 5150);
      const wa = vnoise(6, 6, 61), wb = vnoise(6, 6, 62), wc = vnoise(22, 22, 63), wd = vnoise(22, 22, 64), nw = vnoise(13, 13, 909);
      put((x, y) => {
        const X = x + (wa(x, y) - 0.5) * 40 + (wc(x, y) - 0.5) * 9, Y = y + (wb(x, y) - 0.5) * 40 + (wd(x, y) - 0.5) * 9;
        const e1 = v1(X, Y), e2 = v2(X, Y);
        const heat = sstep(0.3, 0.68, nz(x, y) * 0.6 + nz3(x, y) * 0.4), w = 0.6 + 1.5 * nw(x, y);
        const core = 1 - sstep(0.7 * w, 3 * w, e1), hot = 1 - sstep(0, 1.3 * w, e1), halo = Math.exp(-e1 / (5 + 9 * heat));
        const sec = (1 - sstep(0.4, 1.9, e2)) * sstep(0.48, 0.7, nz3(x, y));
        const spk = sstep(0.6, 0.85, nz2(x, y) * 0.7 + nz(x * 3 % n, y * 3 % n) * 0.3);
        return [Math.min(1, halo * 0.6 * (0.35 + 0.65 * heat) + core * 0.85), spk * 0.7 * (1 - halo),
          Math.min(1, core * (0.1 + 0.9 * heat) * 0.8 + hot * heat * 0.32 + sec * 0.5 * (0.15 + 0.85 * heat) + halo * 0.12 * heat)];
      });
    } else if (kind === 'patina') { // vert-de-gris : plaques poudreuses à bord déchiqueté + coulures (R), liseré de cuivre oxydé sombre (G)
      const n1 = vnoise(5, 5, 11), n2 = vnoise(12, 12, 23), n3 = vnoise(48, 4, 57), n4 = vnoise(9, 9, 91), gr = vnoise(64, 64, 7), gr2 = vnoise(128, 128, 3);
      put((x, y) => {
        const f = n1(x, y) * 0.5 + n2(x, y) * 0.3 + n4(x, y) * 0.2, grain = gr(x, y) * 0.6 + gr2(x, y) * 0.4;
        const t = f + (n3(x, y) - 0.5) * 0.3 + (grain - 0.5) * 0.15;
        const v = sstep(0.57, 0.66, t), o = sstep(0.47, 0.6, t) * (1 - v);
        return [v * 0.95, o * 0.75, 0];
      });
    } else if (kind === 'holes') { // perforations (même maillage que la grille du kit) : R = trou sombre, B = lueur du trou
      put((x, y) => {
        const j = Math.round((y - 8) / 16), cy = 8 + j * 16, off = (((j % 2) + 2) % 2) * 8, cx = off + 8 + Math.round((x - 8 - off) / 16) * 16;
        const d = Math.hypot(x - cx, y - cy), h = 1 - sstep(3.4, 4.6, d);
        return [h, 0, h * (1 - 0.5 * d / 4.6)];
      });
    } else if (kind === 'checker') { // damier haute visibilité (2 rangées, centré verticalement) : R = carré bleu, G = liseré
      const q = n / 20, y0 = n / 2 - q;
      put((x, y) => {
        if (y < y0 - 3 || y >= y0 + 2 * q + 3) return [0, 0, 0];
        if (y < y0 || y >= y0 + 2 * q) return [0, 1, 0];
        return [((Math.floor(x / q) + Math.floor((y - y0) / q)) & 1) ? 1 : 0, 0, 0];
      });
    }
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4;
    return (PTX[kind] = t);
  };
  // injection du motif triplanaire dans le shader physique (programme partagé par tous les matériaux à motif)
  const patKey = () => 'atlasPat1';
  const patInject = (sh, U) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vPatP;\nvarying vec3 vPatN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvPatP = position; vPatN = normal;');
    sh.fragmentShader = 'uniform sampler2D patTex;\nuniform float patSc;\nuniform vec3 patOff;\nuniform vec3 patC2;\nuniform vec3 patC3;\nuniform vec3 patE;\nuniform vec4 patRM;\nvarying vec3 vPatP;\nvarying vec3 vPatN;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tvec3 patW = pow(abs(normalize(vPatN)), vec3(8.0)); patW /= (patW.x + patW.y + patW.z + 1e-5);\n\tvec3 patQ = (vPatP + patOff) * patSc;\n\tvec4 patV = texture2D(patTex, patQ.zy) * patW.x + texture2D(patTex, patQ.xz) * patW.y + texture2D(patTex, patQ.xy) * patW.z;\n\tdiffuseColor.rgb = mix(mix(diffuseColor.rgb, patC2, patV.r), patC3, patV.g);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix(mix(roughnessFactor, patRM.x, patV.r), patRM.z, patV.g);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = mix(mix(metalnessFactor, patRM.y, patV.r), patRM.w, patV.g);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += patE * patV.b;');
  };
  // matériau physique à motif : pt = { tex, sc, off, c2, r2, m2, c3, r3, m3, e, eI }
  const patMat = (p, pt) => {
    const U = {
      patTex: { value: ptex(pt.tex) }, patSc: { value: pt.sc || 1 / 24 }, patOff: { value: new T.Vector3().fromArray(pt.off || [0, 0, 0]) },
      patC2: { value: new T.Color(pt.c2 != null ? pt.c2 : 0) }, patC3: { value: new T.Color(pt.c3 != null ? pt.c3 : 0) },
      patRM: { value: new T.Vector4(pt.r2 != null ? pt.r2 : p.roughness, pt.m2 != null ? pt.m2 : p.metalness || 0, pt.r3 != null ? pt.r3 : p.roughness, pt.m3 != null ? pt.m3 : p.metalness || 0) },
      patE: { value: new T.Color(pt.e != null ? pt.e : 0).multiplyScalar(pt.eI != null ? pt.eI : 1) }
    };
    U.patE.base = U.patE.value.clone();
    return ctx.mat(Object.assign({}, p, { userData: { pat: U }, customProgramCacheKey: patKey, onBeforeCompile: (sh) => patInject(sh, U) }));
  };
  // décalcomanies (canvas transparent, cache module) posées sur une fine plaque (g.box : UV 0..1 sur la face +Z).
  // Motifs symétriques gauche/droite uniquement : le modèle est mis en miroir quand le robot regarde à gauche.
  const DTX = self._dtx || (self._dtx = {});
  const dtex = (kind) => {
    if (DTX[kind]) return DTX[kind];
    const n = 256, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, n, n); c.lineJoin = 'round';
    if (kind === 'warn') { // panneau « danger » : triangle + point d'exclamation
      c.fillStyle = '#fff';
      c.beginPath(); c.moveTo(128, 14); c.lineTo(246, 226); c.lineTo(10, 226); c.closePath(); c.fill();
      c.globalCompositeOperation = 'destination-out';
      c.beginPath(); c.moveTo(128, 64); c.lineTo(206, 202); c.lineTo(50, 202); c.closePath(); c.fill();
      c.globalCompositeOperation = 'source-over';
      c.beginPath(); c.moveTo(118, 96); c.lineTo(138, 96); c.lineTo(133, 160); c.lineTo(123, 160); c.closePath(); c.fill();
      c.beginPath(); c.arc(128, 180, 10, 0, 7); c.fill();
    } else if (kind === 'deco') { // filet art déco (cadre à double trait + losange central), pour les finitions précieuses
      c.strokeStyle = '#fff'; c.fillStyle = '#fff';
      c.lineWidth = 9; c.strokeRect(10, 10, n - 20, n - 20);
      c.lineWidth = 4; c.strokeRect(30, 30, n - 60, n - 60);
      c.beginPath(); c.moveTo(128, 58); c.lineTo(170, 128); c.lineTo(128, 198); c.lineTo(86, 128); c.closePath(); c.lineWidth = 6; c.stroke();
      c.beginPath(); c.moveTo(128, 92); c.lineTo(148, 128); c.lineTo(128, 164); c.lineTo(108, 128); c.closePath(); c.fill();
      for (const [x, y] of [[30, 30], [226, 30], [30, 226], [226, 226]]) { c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill(); }
      for (const s of [1, -1]) { c.beginPath(); c.moveTo(128 + s * 52, 128); c.lineTo(128 + s * 98, 128); c.lineWidth = 4; c.stroke(); }
    }
    const t = new T.CanvasTexture(cv); t.anisotropy = 4;
    return (DTX[kind] = t);
  };
  // matériau de décalcomanie : couleur = color (le canvas, blanc sur transparent, sert de masque alpha)
  const decalMat = (kind, p) => ctx.mat(Object.assign({ color: 0x0c0c0e, alphaMap: dtex(kind), alphaTest: 0.5, roughness: 0.35, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12,
    envMapIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, p));

  /* ---------------- matériaux ---------------- */
  // skin choisi (null = skin d'origine 'classic' : matériaux strictement identiques à la version de référence)
  const SK = (self.SKINS && self.SKINS[ctx.skin]) || null;
  const brushed = ctx.tex('brushed');
  const fineG = self._fineG || (self._fineG = (() => { const t = ctx.tex('grille').clone(); t.repeat.set(1 / 11, 1 / 11); t.needsUpdate = true; return t; })());
  // paramètres d'origine (skin classic) ; les skins les surchargent (SK.m[clé], from = clé de base)
  const P0 = {
    alu: { color: 0xd2d6dc, roughness: 0.4, metalness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 1.25, roughnessMap: brushed },
    aluPol: { color: 0xe4e8ec, roughness: 0.27, metalness: 0.6, clearcoat: 0.6, clearcoatRoughness: 0.12, envMapIntensity: 1.4 },
    cast: { color: 0xd3d7dc, roughness: 0.3, metalness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 1.3 },
    aluDk: { color: 0x9aa0a8, roughness: 0.34, metalness: 0.75, envMapIntensity: 1.1, roughnessMap: brushed },
    panel: { color: 0x4f535a, roughness: 0.4, metalness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.22, envMapIntensity: 0.75 },
    pad: { color: 0x141518, roughness: 0.55, metalness: 0.08, clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 0.55 },
    satin: { color: 0x18191c, roughness: 0.32, metalness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 0.7 },
    wrap: { color: 0x1d1e21, roughness: 0.8, metalness: 0.05, sheen: 0.4, sheenColor: 0x50545c, sheenRoughness: 0.6, envMapIntensity: 0.45 },
    white: { color: 0xe8eaed, roughness: 0.3, metalness: 0.02, clearcoat: 0.85, clearcoatRoughness: 0.12, envMapIntensity: 0.55 },
    grille: { color: 0xa3a9b1, map: ctx.tex('grille'), roughness: 0.38, metalness: 0.7, envMapIntensity: 0.8 },
    grilleDk: { color: 0x4a4e55, map: ctx.tex('grille'), roughness: 0.5, metalness: 0.3, envMapIntensity: 0.6 },
    grilleHd: { color: 0x5a5f66, map: fineG, roughness: 0.45, metalness: 0.4, envMapIntensity: 0.6 },
    lens: { color: 0x170d06, roughness: 0.04, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.3 },
    // (copies des matériaux de la palette du kit, servent de base aux surcharges des skins)
    steel: { color: 0xb8bec7, roughness: 0.28, metalness: 0.95, envMapIntensity: 0.9, roughnessMap: brushed },
    dark: { color: 0x1c1d21, roughness: 0.36, metalness: 0.85, envMapIntensity: 0.45 },
    chrome: { color: 0xe6e9ee, roughness: 0.08, metalness: 1, envMapIntensity: 1.1 },
    rubber: { color: 0x17181b, roughness: 0.7, metalness: 0.05, envMapIntensity: 0.35 },
    mWhite: { color: 0xf0f2f5, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.45 },
    mYellow: { color: 0xffc21a, roughness: 0.4 }
  };
  // matériau du skin pour la clé k (null si le skin ne la redéfinit pas)
  const mk = (k, from) => {
    const q = SK && SK.m[k]; if (!q) return null;
    if (q.glow) return ctx.glow(q.glow[0], q.glow[1]);
    const p = Object.assign({}, P0[q.from || from || k], q); delete p.from; delete p.pat;
    for (const kk in p) if (p[kk] === '@brushed') p[kk] = brushed; else if (p[kk] === '@grille') p[kk] = ctx.tex('grille'); else if (p[kk] === '@fineG') p[kk] = fineG;
    return q.pat ? patMat(p, q.pat) : ctx.mat(p);
  };
  const alu = mk('alu') || ctx.mat(P0.alu);
  const aluPol = mk('aluPol') || ctx.mat(P0.aluPol);
  const cast = mk('cast') || ctx.mat(P0.cast);
  const aluDk = mk('aluDk') || ctx.mat(P0.aluDk);
  const panel = mk('panel') || ctx.mat(P0.panel);
  const pad = mk('pad') || ctx.mat(P0.pad);
  const satin = mk('satin') || ctx.mat(P0.satin);
  const wrap = mk('wrap') || ctx.mat(P0.wrap);
  const white = mk('white') || ctx.mat(P0.white);
  const grille = mk('grille') || ctx.mat(P0.grille);
  const grilleDk = mk('grilleDk') || ctx.mat(P0.grilleDk);
  const grilleHd = mk('grilleHd') || ctx.mat(P0.grilleHd);
  const lens = mk('lens') || ctx.mat(P0.lens);
  const sg0 = SK ? SK.g || {} : {};
  const steel = mk('steel') || M.steel, dark = mk('dark') || M.dark, seam = M.seam, chrome = mk('chrome') || M.chrome, rubber = mk('rubber') || M.rubber;
  const ring = ctx.glow(ch.accent, 3.2);
  const ringHot = ctx.glow(sg0.hot != null ? sg0.hot : 0xffe6a8, 2.6);
  const amber = ctx.glow(sg0.inner != null ? sg0.inner : 0xff7a1a, 1.4);
  const led = ctx.glow(sg0.led != null ? sg0.led : 0xff3020, 2.5);
  // emplacements propres aux skins (en classic : le matériau d'origine de la pièce)
  const sl = (k, from, dflt) => (SK && SK.m[k] ? mk(k, from) : dflt);
  const chestM = sl('chest', 'alu', alu), plastM = sl('plast', 'panel', panel), backM = sl('back', 'alu', alu);
  const thPlateM = sl('thPlate', 'aluPol', aluPol), thPlateInM = sl('thPlateIn', 'alu', alu);
  const headM = sl('head', 'white', white), shPadM = sl('shPad', 'pad', pad), shFaceM = sl('shFace', 'satin', satin);
  const strapM = sl('strap', 'satin', satin), logoM = sl('logo', 'mWhite', M.white), antM = sl('ant', 'mYellow', M.yellow);
  const shinM = sl('shin', 'alu', alu), footM = sl('foot', 'alu', alu), uaM = sl('ua', 'alu', alu);

  /* ---------------- outils ---------------- */
  const grp = () => ctx.group();
  const add = (par, geo, mat, p, r, s) => ctx.add(par, geo, mat, { p, r, s });
  const sg = n => lo ? Math.max(6, Math.round(n / 2)) : n;
  // révolution à arêtes vives : [rayon, y, vif?]
  // (découpée en tronçons lisses fusionnés : arêtes vives sans triangles dégénérés)
  const lathe = (pts, seg, axis = 'y') => {
    if (lo) return g.lathe(pts.map(q => [q[0], q[1]]), sg(seg), axis);
    const runs = []; let cur = [];
    pts.forEach((q, i) => { cur.push([q[0], q[1]]); if (q[2] && i > 0 && i < pts.length - 1) { runs.push(cur); cur = [[q[0], q[1]]]; } });
    runs.push(cur);
    if (runs.length === 1) return g.lathe(runs[0], seg, axis);
    return combo('lathe' + JSON.stringify(pts) + seg + axis, () => runs.filter(r => r.length > 1).map(r => [g.lathe(r, seg, axis)]));
  };
  // cylindre chanfreiné à arêtes vives
  const cc = (r, h, c = 0.6, seg = 24, axis = 'y') => lathe([[0, -h / 2], [r - c, -h / 2, 1], [r, -h / 2 + c, 1], [r, h / 2 - c, 1], [r - c, h / 2, 1], [0, h / 2]], seg, axis);
  // anneau cannelé (ailettes / moletage) : extrudé selon Z
  const gear = (r, h, n, dep) => {
    const pts = [], da = 2 * PI / n, f = v => +v.toFixed(3);
    for (let i = 0; i < n; i++) {
      const a = i * da;
      for (const [k, rr] of [[0.04, r - dep], [0.2, r], [0.56, r], [0.72, r - dep]]) pts.push([f(Math.cos(a + k * da) * rr), f(Math.sin(a + k * da) * rr)]);
    }
    return g.prism(pts, h, 0);
  };
  // polygone à coins arrondis (pour g.shape) : pts [[x,y,rayon]]
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
  // le biseau d'ExtrudeGeometry élargit le contour de c : on le rétrécit d'autant (décalage en onglet)
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
  const shp = (key, pts, d, c = 0.6, curve = 4) => g.shape('atlas' + key + (lo ? 'L' : ''), s => rpoly(s, inset(pts, c)), d, c, lo ? 2 : curve);
  // géométrie composée (plusieurs petites pièces fusionnées en un seul mesh) : items [geo, p, r, s]
  const V = new T.Vector3(), Q = new T.Quaternion(), E = new T.Euler(), S3 = new T.Vector3(), MX = new T.Matrix4();
  const combo = (key, make) => {
    key = key + (lo ? 'L' : 'H');
    if (LC[key]) return LC[key];
    const list = make().map(([geo, p = [0, 0, 0], r = [0, 0, 0], s = 1]) => {
      const gg = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const n of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(n)) gg.deleteAttribute(n);
      if (!gg.attributes.uv) gg.setAttribute('uv', new T.BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
      gg.clearGroups();
      if (typeof s === 'number') s = [s, s, s];
      MX.compose(V.set(p[0], p[1], p[2]), Q.setFromEuler(E.set(r[0], r[1], r[2])), S3.set(s[0], s[1], s[2]));
      gg.applyMatrix4(MX);
      if (MX.determinant() < 0) for (const name of ['position', 'normal', 'uv']) {
        const at = gg.attributes[name], is = at.itemSize, arr = at.array;
        for (let i = 0; i < at.count; i += 3) for (let k = 0; k < is; k++) { const t = arr[(i + 1) * is + k]; arr[(i + 1) * is + k] = arr[(i + 2) * is + k]; arr[(i + 2) * is + k] = t; }
      }
      return gg;
    });
    return (LC[key] = T.BufferGeometryUtils.mergeGeometries(list, false));
  };
  // pavé à coins arrondis dans le plan XY, extrudé en Z (arêtes chanfreinées 2 segments)
  const rr = (w, h, d, r, c = 0.8, curve = 4) => shp(`rr${w},${h},${r}`, [[-w / 2, -h / 2, r], [w / 2, -h / 2, r], [w / 2, h / 2, r], [-w / 2, h / 2, r]], d, c, curve);
  // déformation de sommets (effilement…) d'une géométrie composée ; normales plates recalculées
  const deform = (key, make, fn) => {
    const k2 = 'def' + key + (lo ? 'L' : 'H');
    if (LC[k2]) return LC[k2];
    const geo = combo('src' + key, make).clone(), pa = geo.attributes.position, v = [0, 0, 0];
    for (let i = 0; i < pa.count; i++) { v[0] = pa.getX(i); v[1] = pa.getY(i); v[2] = pa.getZ(i); fn(v); pa.setXYZ(i, v[0], v[1], v[2]); }
    geo.computeVertexNormals();
    return (LC[k2] = geo);
  };
  const clamp01 = x => Math.min(1, Math.max(0, x));
  // vis à tête hexagonale, axe donné
  const boltG = (r = 0.7, h = 0.6, axis = 'y') => g.cyl(r, r, h, 6, axis);

  /* =========================================================
     TORSE : bassin poli + taille mécanique + buste (boîtier alu + plastron gris foncé)
     ========================================================= */
  const shZ = 22.5, hpZ = 13;
  const SHY = 0.86 * L.to;
  function torso() {
    const t = grp();
    if (lo) {
      add(t, g.cbox(17, 15, 40, 5), aluPol, [1, 0.5, 0]);
      add(t, g.cbox(27, 35, 32, 4), alu, [-1.5, 43.5, 0]);
      add(t, g.cyl(9, 9, 14, 8), dark, [0, 18, 0], null, [1, 1, 1.2]);
      return t;
    }
    /* --- bassin : corps central coulé + lobes de hanche + disques noirs --- */
    const pelv = shp('pelvis', [[8.6, 10, 2], [9.6, 2, 4], [7, -5.5, 4], [0, -7.5, 3], [-7, -5.5, 4], [-9.6, 2, 4], [-8.6, 10, 2]], 19, 1.6, 6);
    add(t, pelv, cast);
    // pli central (fonderie) + joint
    add(t, g.box(0.5, 13, 0.5), seam, [9.3, 2, 0], [0, 0, -0.08]);
    for (const sd of [1, -1]) {
      // lobe de hanche : bulbe coulé, axe vers l'extérieur et l'avant (disques visibles de face comme de profil)
      const lob = grp(); lob.position.set(1.6, 0.6, 14 * sd); lob.rotation.set(0, 0.82 * sd, 0); lob.scale.set(1.08, 1.08, 1.08 * sd); t.add(lob);
      add(lob, lathe([[0, 6.8], [5.4, 6.8, 1], [6.2, 6.2, 1], [8.1, 4.6], [9.1, 2.2], [9.4, -0.5], [8.8, -3.8], [7, -6.4], [3.6, -7.9], [0, -8.3]], 28, 'z'), cast);
      add(lob, cc(5.4, 1.4, 0.35, 28, 'z'), pad, [0, 0, 7.1]); // disque noir
      add(lob, combo('hipscrews', () => [0, 1, 2].map(i => [boltG(0.38, 0.5, 'z'), [Math.cos(i * 2.09 + 0.5) * 4.1, Math.sin(i * 2.09 + 0.5) * 4.1, 7.9]])), steel);
    }
    // jonction bassin -> taille : galette noire épaisse
    const rrect = (w, d, r) => [[-w / 2, -d / 2, r], [w / 2, -d / 2, r], [w / 2, d / 2, r], [-w / 2, d / 2, r]];
    add(t, shp('waistPlate', rrect(20, 24, 7.5), 2.6, 0.5, 4), pad, [0, 11.2, 0], [H, 0, 0]);
    /* --- taille : carter poli (plan arrondi) boulonné + bielles visibles --- */
    add(t, shp('waistLow', rrect(18.6, 22.6, 7), 3.6, 0.8, 4), aluPol, [0, 14.2, 0], [H, 0, 0]);
    add(t, shp('waistSeam', rrect(18.9, 22.9, 7.1), 0.4, 0, 4), seam, [0, 16.1, 0], [H, 0, 0]);
    add(t, shp('waistTop', rrect(17.6, 21.6, 6.6), 3.6, 1.2, 4), aluPol, [0, 18, 0], [H, 0, 0]);
    add(t, combo('waistbolts', () => [-0.9, -0.45, 0, 0.45, 0.9, PI - 0.6, PI, PI + 0.6].map(a => [boltG(0.6, 0.7, 'y'), [Math.cos(a) * 7.2, 0, Math.sin(a) * 9]])), steel, [0, 19.9, 0]);
    // noyau sombre + cardan central + 4 vérins à rotules
    add(t, g.cbox(15, 9, 20, 1.5), dark, [-2, 24, 0]);
    add(t, g.cbox(6, 6.5, 7, 1), aluPol, [2.5, 22.6, 0]);
    add(t, g.cyl(1.3, 1.3, 9, 10, 'z'), steel, [2.5, 22.6, 0]);
    for (const sd of [1, -1]) for (const [x, k] of [[5.5, 1], [-7.5, -1]]) {
      add(t, g.cyl(1.1, 1.1, 8, 10), steel, [x, 24, 6.4 * sd], [0, 0, -0.12 * k]);
      add(t, g.sphere(1.6, 10, 8), chrome, [x - 0.5 * k, 20.4, 6.4 * sd]);
      add(t, g.cbox(3.4, 3, 3.4, 0.6), aluDk, [x + 0.5 * k, 28, 6.4 * sd]);
    }
    /* --- buste : coque alu (profil latéral extrudé) --- */
    // le buste s'affine vers le bas (vue de face trapézoïdale, comme sur le vrai robot)
    const chestTaper = v => { const u = Math.min(1, Math.max(0, (v[1] - 27) / 25)); v[2] *= 0.86 + 0.14 * u * (2 - u); };
    const chestPts = [[10.2, 60.4, 3], [12, 56, 2], [12, 30.6, 3], [9.5, 26.6, 2], [-6, 26, 3], [-13.2, 28.6, 4], [-16, 34, 3], [-16, 55.5, 4], [-12, 60.4, 3], [-2, 61.2, 2]];
    const sideP = shp('chestside', [[9, 57, 2], [9, 32.5, 3], [-10, 30, 4], [-13.6, 35.5, 2], [-13.6, 54, 3], [-9, 58, 2]], 1.2, 0.4, 3);
    const lowP = shp('chestLow', [[6, 36, 1], [6, 32.6, 2], [-9.5, 31.2, 3], [-12, 36, 1]], 0.8, 0.25, 3);
    add(t, deform('chestShell', () => [[shp('chest', chestPts, 32, 1.6, 4)], [sideP, [0, 0, 16.2]], [sideP, [0, 0, -16.2]]], chestTaper), chestM);
    // flancs : grilles perforées, jonctions, bas de flanc plus sombre
    add(t, deform('chestGrille', () => [[g.cbox(10, 9, 0.8, 0.3), [-1.5, 44, 16.75]], [g.cbox(10, 9, 0.8, 0.3), [-1.5, 44, -16.75]]], chestTaper), grille);
    add(t, deform('chestLow', () => [[lowP, [0, 0, 16.75]], [lowP, [0, 0, -16.75]]], chestTaper), aluDk);
    // plastron gris foncé trapézoïdal (vue de face : z horizontal), extrudé selon X
    const plast = shp('plastron', [[-13.4, 57.6, 2.5], [13.4, 57.6, 2.5], [11.8, 29.5, 5], [-11.8, 29.5, 5]], 2.6, 0.7, 6);
    add(t, deform('chestPanel', () => [[plast, [11.6, 0, 0], [0, H, 0]]], chestTaper), plastM);
    add(t, deform('chestSeams', () => [
      [shp('plastronSeam', [[-14, 58.2, 2.8], [14, 58.2, 2.8], [12.4, 28.9, 5.4], [-12.4, 28.9, 5.4]], 1.6, 0, 6), [11.4, 0, 0], [0, H, 0]],
      [g.box(0.3, 0.35, 25.4), [12.95, 46.5, 0]],
      ...[1, -1].flatMap(sd => [[g.box(22, 0.3, 0.4), [-1, 37, 16.7 * sd]], [g.box(0.35, 24, 0.4), [7.2, 44, 16.7 * sd]], [g.box(16, 0.3, 0.4), [-3, 52.5, 16.7 * sd]]])
    ], chestTaper), seam);
    for (const sd of [1, -1]) add(t, cc(7, 3, 0.8, 28, 'z'), aluDk, [1, SHY, 16.5 * sd]); // logement de l'actionneur d'épaule
    // "logo" (traits blancs)
    add(t, combo('logo', () => [[-4.6, 1.5], [-3.2, 0.9], [-2.1, 0.8], [-1.0, 0.9], [0.3, 1.3], [1.9, 1.2], [3.2, 0.9], [4.4, 1.1]].map(q => [g.box(0.2, 0.55, q[1]), [0, 0, q[0]]])), logoM, [12.95, 54.2, 0]);
    // dos : sac (batterie) avec grille et vis
    add(t, g.cbox(3.4, 24, 24, 1.1), backM, [-17, 42.5, 0]);
    add(t, g.cbox(0.8, 9, 15, 0.3), grilleDk, [-18.75, 40, 0]);
    add(t, g.box(0.4, 0.4, 24.2), seam, [-18.7, 50.5, 0]);
    add(t, combo('backbolts', () => [[-10, 53], [10, 53], [-10, 32], [10, 32]].map(q => [boltG(0.55, 0.6, 'x'), [0, q[1], q[0]]])), steel, [-18.8, 0, 0]);
    // haut du buste : coupelle polie autour du cou
    add(t, lathe([[9, 0], [8.4, 0.9, 1], [6.4, 1.4], [5.4, 2.1, 1], [0, 2.1]], 28), aluPol, [-0.5, 59.9, 0]);
    return t;
  }

  /* =========================================================
     ÉPAULE (sc) : actionneur + gros coussin noir
     ========================================================= */
  function shoulderCap(sd) {
    const s = grp();
    if (lo) { add(s, g.cbox(12, 9, 9, 2.5), pad, [0, 3, 0]); return s; }
    add(s, cc(6.4, 6, 0.8, 28, 'z'), alu, [0, 0, -3.5 * sd]);
    add(s, gear(6.6, 1, 24, 0.35), steel, [0, 0, -6.3 * sd]);
    // coussin : gros pavé noir arrondi, sur le dessus/l'extérieur de l'épaule
    add(s, rr(13, 11.6, 10.6, 3.8, 1.8, 4), shPadM, [0.6, 2.6, 1.4 * sd], [0.1 * sd, 0, 0]);
    add(s, rr(11, 9.6, 1, 3, 0.3, 4), shFaceM, [0.6, 2.6, 6.45 * sd], [0.1 * sd, 0, 0]);
    return s;
  }

  /* =========================================================
     BRAS (ua) : origine épaule, coude à y = L.ua ; avant = -X
     ========================================================= */
  function upperArm(sd) {
    const a = grp(), la = L.ua;
    if (lo) { add(a, g.cbox(11, la, 11, 2), alu, [0, la / 2, 0]); return a; }
    // carter d'épaule
    add(a, cc(6.3, 10, 1, 24), uaM, [0, 4, 0]);
    add(a, g.box(13, 0.5, 13), seam, [0, 6.5, 0], [0, 0, 0.35]);
    // bague sombre + bague usinée
    add(a, cc(5.9, 1.6, 0.3, 24), dark, [0, 9.8, 0]);
    add(a, gear(6.1, 1.2, 24, 0.3), steel, [0, 11.2, 0], [H, 0, 0]);
    // tube principal
    add(a, lathe([[5.8, 11.8, 1], [5.6, 18], [5.3, 24.6, 1]], 24), uaM);
    add(a, g.cbox(6.5, 7, 1.2, 0.4), grille, [0.5, 19, 5.2 * sd]);
    add(a, g.box(0.4, 11.5, 0.6), seam, [-5.5, 18.2, 0]);
    add(a, combo('uaBolts' + sd, () => [[-2.6, 1.6], [2.6, 1.6], [-2.6, 6.4], [2.6, 6.4]].map(q => [boltG(0.42, 0.6, 'z'), [q[0], q[1], 6.15 * sd]])), steel);
    // empilement d'actionneurs avant le coude
    add(a, cc(5.6, 1.8, 0.3, 24), dark, [0, 25.4, 0]);
    add(a, gear(5.8, 1.4, 24, 0.3), steel, [0, 26.9, 0], [H, 0, 0]);
    add(a, cc(5.5, 1.6, 0.3, 24), pad, [0, 28.3, 0]);
    // chape du coude (deux flasques)
    for (const z of [1, -1]) add(a, shp('elbowFork', [[-4.5, 27, 1], [4.5, 27, 1], [4.6, 33, 4], [-4.6, 33, 4]], 1.6, 0.4, 4), alu, [0, 0, 4.4 * z]);
    return a;
  }
  // coude (el) : moyeu + carter noir
  function elbow(sd) {
    const e = grp();
    if (lo) return e;
    add(e, cc(4.6, 7.2, 0.6, 24, 'z'), dark);
    add(e, cc(5.3, 3.4, 0.8, 24, 'z'), pad, [0, 0, 3.6 * sd]);
    add(e, cc(2.4, 0.6, 0.15, 16, 'z'), steel, [0, 0, 5.4 * sd]);
    add(e, g.sphere(0.45, 8, 6), led, [-2.4, -2.6, 5.2 * sd]);
    add(e, g.cbox(6.5, 9, 9, 2.2), pad, [3.2, 1.5, 0]);
    return e;
  }

  /* =========================================================
     AVANT-BRAS (fa) : origine coude, poignet à y = L.fa
     ========================================================= */
  function foreArm(sd) {
    const f = grp(), lf = L.fa;
    if (lo) { add(f, g.cbox(9.5, lf, 9.5, 2), alu, [0, lf / 2, 0]); return f; }
    // sortie de coude polie
    add(f, lathe([[4.6, 3, 1], [5.2, 4.2, 1], [5.2, 8, 1], [4.6, 9, 1]], 24), aluPol);
    add(f, combo('faBolts', () => [0, 1, 2, 3, 4, 5].map(i => [boltG(0.4, 0.6, 'x'), [Math.cos(i * PI / 3) * 5.15, 6, Math.sin(i * PI / 3) * 5.15], [0, -i * PI / 3, 0]])), steel);
    // section à ailettes (dissipateur)
    add(f, gear(5.2, 7, 18, 0.75), aluPol, [0, 12.8, 0], [H, 0, 0]);
    add(f, cc(4.6, 1, 0.2, 24), dark, [0, 16.8, 0]);
    // actionneur de poignet noir (coussins)
    add(f, cc(4.4, 7, 0.9, 24), satin, [0, 20.6, 0]);
    add(f, g.cbox(5.5, 7.5, 9.6, 2), pad, [1.6, 21, 0]);
    add(f, cc(3.9, 1, 0.2, 24), steel, [0, 24.6, 0]);
    // bride de poignet polie
    add(f, lathe([[3.9, 25, 1], [3.6, 26.5], [3.4, 29.5, 1], [3.8, 30.2, 1], [3.8, 31.4, 1]], 20), aluPol);
    return f;
  }
  // main : pince 3 doigts + pouce (kit), noire, avec caméras de paume
  function hand(sd) {
    const h = RK.hand(ctx, { side: sd, palm: [8.5, 4.8, 8.4], fingers: 3, style: 'gripper', palmMat: satin, fingerMat: pad, jointMat: aluDk });
    if (lo) return h;
    add(h, cc(3.9, 1.4, 0.3, 20, 'x'), aluPol, [0.3, 0, 0]);
    add(h, g.cbox(6, 1.2, 7.2, 0.4), aluPol, [7, 2.9, 0]);
    add(h, combo('handHoles', () => [[-1.6, -1.8], [-1.6, 1.8], [1.6, -1.8], [1.6, 1.8]].map(q => [g.cyl(0.55, 0.55, 0.4, 10), [q[0], 0, q[1]]])), seam, [7, 3.4, 0]);
    // barre caméras (dos de la main) : 2 objectifs
    add(h, g.cbox(8.4, 2.6, 2.6, 0.6), satin, [7.2, 0.4, 4.9 * sd]);
    for (const x of [4.2, 10.2]) {
      add(h, g.cyl(1.05, 1.05, 0.6, 14, 'z'), steel, [x, 0.4, 6.3 * sd]);
      add(h, g.cyl(0.7, 0.7, 0.7, 14, 'z'), lens, [x, 0.4, 6.4 * sd]);
    }
    return h;
  }

  /* =========================================================
     HANCHE (hi) : moyeu sombre (suit la cuisse)
     ========================================================= */
  function hipJoint(sd) {
    const h = grp();
    if (lo) return h;
    add(h, cc(5.6, 9, 0.8, 24, 'z'), cast, [0, 0, -0.5 * sd]);
    return h;
  }

  /* =========================================================
     CUISSE (th) : origine hanche, genou à y = L.th ; avant = -X
     ========================================================= */
  function thigh(sd) {
    const t = grp(), lt = L.th;
    if (lo) { add(t, g.cbox(16, lt - 4, 15, 3), alu, [0, lt / 2 + 1, 0]); return t; }
    add(t, cc(6.4, 6, 0.8, 24), cast, [0, 2.2, 0]);
    // couronne moletée + bague noire + bande caoutchouc
    add(t, gear(8, 1.8, 28, 0.55), aluPol, [0, 5.6, 0], [H, 0, 0]);
    add(t, cc(7.9, 0.8, 0.2, 28), dark, [0, 6.9, 0]);
    add(t, lathe([[8.1, 7.2, 1], [8.3, 8], [8.3, 12], [8, 12.9, 1]], 28), rubber);
    // corps usiné : profil latéral extrudé
    const prof = [[-9, 12.6, 1.5], [8.8, 12.6, 1.5], [9.4, 19, 5], [8.4, 31, 5], [6, 41.5, 3], [-6.6, 41.5, 2], [-8.6, 33, 4], [-9.4, 20, 4]];
    // (effilement vers le genou : vue de face trapézoïdale)
    const thT = v => { v[2] *= 1 - 0.17 * clamp01((v[1] - 15) / 27); };
    add(t, deform('thigh', () => [[shp('thigh', prof, 16.4, 1.8, 4)]], thT), alu);
    // plaque ovale extérieure (bord usiné brillant) + vis
    const ts = 'thigh' + sd;
    add(t, deform(ts + 'plate', () => [[shp('thighPlate', [[-4.8, 15.5, 4.5], [4.8, 15.5, 4.5], [4.4, 38, 4.5], [-4.4, 38, 4.5]], 1.8, 0.5, 5), [0.8, 0, 8.7 * sd]], [cc(2.6, 1.6, 0.5, 20, 'z'), [-4.6, 18.5, 8.0 * sd]]], thT), thPlateM);
    add(t, deform(ts + 'plateIn', () => [[shp('thighPlateIn', [[-3.8, 17, 3.5], [3.8, 17, 3.5], [3.4, 36.5, 3.5], [-3.4, 36.5, 3.5]], 1, 0.3, 5), [0.8, 0, 9.5 * sd]]], thT), thPlateInM);
    add(t, deform(ts + 'bolts', () => [[-3.5, 17.4], [3.5, 17.4], [-3, 36], [3, 36], [-2.6, 26.5], [2.6, 26.5]].map(q => [boltG(0.4, 0.4, 'z'), [0.8 + q[0], q[1], 10.1 * sd]]), thT), steel);
    add(t, deform(ts + 'bore', () => [[g.cyl(1.6, 1.6, 1.8, 16, 'z'), [-4.6, 18.5, 8.2 * sd]]], thT), seam);
    add(t, g.cyl(0.8, 0.8, 1.8, 12, 'x'), seam, [-8.1, 26, 3 * sd]);
    // joints de panneaux
    add(t, g.box(18.4, 0.35, 16.8), seam, [0, 14.8, 0]);
    // coussin noir avant (au-dessus du genou)
    add(t, g.cbox(2, 5.2, 9, 0.6), pad, [-6.6, 37.6, 0], [0, 0, 0.18]);
    // chape du genou
    for (const z of [1, -1]) add(t, shp('kneeFork', [[-5.4, 38, 1], [5, 38, 1], [4.6, lt + 1, 4], [-4.6, lt + 1, 4]], 2, 0.5, 4), alu, [0, 0, 7.2 * z]);
    // câble arrière (cuisse -> tibia)
    add(t, g.tube([[6.5, 30, 3 * sd], [8.5, 38, 4 * sd], [8.2, 46, 4.5 * sd], [6.5, 52, 4 * sd]], 0.55, 16, 6), rubber);
    return t;
  }
  // genou (kn) : moyeu + rotule noire
  function knee(sd) {
    const k = grp();
    if (lo) return k;
    add(k, cc(5.2, 13, 0.7, 24, 'z'), dark);
    add(k, combo('kneeCap', () => [[cc(3.2, 0.8, 0.2, 18, 'z'), [0, 0, 8.5]], [cc(3.2, 0.8, 0.2, 18, 'z'), [0, 0, -8.5]]]), aluPol);
    add(k, g.cbox(2.6, 6.5, 10, 0.8), pad, [-5.8, 3.6, 0]);
    return k;
  }

  /* =========================================================
     TIBIA (sh) : origine genou, cheville à y = L.sh ; avant = -X
     ========================================================= */
  function shin(sd) {
    const s = grp(), ls = L.sh;
    if (lo) { add(s, g.cbox(12, ls - 4, 11, 2.5), wrap, [0.5, ls / 2, 0]); return s; }
    // carter supérieur alu
    add(s, shp('shinTop', [[-6.2, 2.5, 2], [6, 2.5, 2], [7.4, 9, 3], [6.9, 17.5, 2], [-5.4, 17.5, 2], [-6.6, 8, 2]], 12.4, 1.2, 4), shinM);
    add(s, g.cyl(1.5, 1.5, 0.8, 14, 'z'), seam, [0.5, 9, 6.1 * sd]);
    add(s, combo('shinBolts' + sd, () => [[-3.6, 5], [3.8, 5], [-3.2, 14.5], [3.6, 14.5]].map(q => [boltG(0.4, 0.5, 'z'), [q[0], q[1], 6.2 * sd]])), steel);
    add(s, g.cbox(2.2, 5.5, 8.5, 0.6), pad, [-6.4, 10, 0]);
    // mollet enveloppé noir + sangles
    const calfT = v => { v[2] *= 1 - 0.24 * clamp01((v[1] - 19) / 17); };
    add(s, deform('calf', () => [[shp('calf', [[-5.3, 16, 1], [6.9, 16, 2], [7.3, 21, 5], [5.6, 29, 5], [3.6, 36.5, 2], [-4.2, 36.5, 2], [-4.9, 26, 3]], 11.4, 1.6, 5)]], calfT), wrap);
    add(s, deform('calfStraps', () => [[20.6, 14], [31.2, 11.2]].map(([y, w]) => [g.cbox(w, 1.6, 12.2, 0.4), [0.9, y, 0]]), calfT), strapM);
    // structure de cheville alu (deux bielles + bloc)
    add(s, g.cbox(8.6, 3.2, 9.6, 1), alu, [-0.2, 36.8, 0]);
    for (const z of [1, -1]) add(s, shp('ankleStrut', [[-2.4, 36, 1], [2.6, 36, 1], [2.2, ls + 1, 2], [-2.2, ls + 1, 2]], 1.6, 0.4, 3), alu, [0, 0, 4 * z]);
    add(s, g.cyl(1, 1, 8, 10), steel, [2.4, 38.5, 0]);
    add(s, g.cbox(3, 3.4, 4.6, 0.6), satin, [-0.5, 40.8, 0]);
    return s;
  }

  /* =========================================================
     PIED (fo) : origine cheville, pointe +X, semelle à y ≈ -7.6
     ========================================================= */
  function foot(sd) {
    const f = grp();
    if (lo) { add(f, g.cbox(24, 4, 10.5, 1.2), alu, [4.5, -4.5, 0]); return f; }
    // palette (vue de dessus extrudée en Y)
    const plan = [[-6.8, -5.1, 2.5], [14, -5.1, 4], [17.2, -2, 3], [17.2, 2, 3], [14, 5.1, 4], [-6.8, 5.1, 2.5]];
    add(f, shp('footPlate', plan, 3.4, 1, 4), footM, [0, -3.85, 0], [H, 0, 0]);
    add(f, shp('footSole', plan, 1.2, 0.3, 4), rubber, [0, -5.95, 0], [H, 0, 0], [1.01, 1.01, 1]);
    add(f, shp('footTop', [[-4.5, -3.6, 2], [11.5, -3.6, 3], [13.4, 0, 2], [11.5, 3.6, 3], [-4.5, 3.6, 2]], 0.8, 0.25, 4), aluPol, [0, -2.0, 0], [H, 0, 0]);
    // fourche de cheville
    for (const z of [1, -1]) add(f, shp('ankleFork', [[-4, -2.4, 1], [3.6, -2.4, 1], [2.4, 1.8, 2.2], [-2.4, 1.8, 2.2]], 1.5, 0.4, 3), alu, [-0.4, 0, 3.9 * z]);
    add(f, cc(2.8, 9.4, 0.5, 18, 'z'), dark);
    add(f, combo('ankleCaps', () => [[cc(1.8, 0.6, 0.15, 14, 'z'), [0, 0, 4.85]], [cc(1.8, 0.6, 0.15, 14, 'z'), [0, 0, -4.85]]]), aluPol);
    add(f, g.cbox(3.4, 2.2, 5, 0.5), satin, [-3.8, -1.2, 0]);
    return f;
  }

  /* =========================================================
     COU + TÊTE
     ========================================================= */
  function neck() {
    const n = grp();
    if (lo) { add(n, g.cyl(4, 4, L.nk, 8), steel, [0, L.nk / 2, 0]); return n; }
    add(n, lathe([[4.4, 0, 1], [4.4, 1.2, 1], [3.7, 1.8, 1], [3.7, 6.5, 1], [3.2, 7, 1], [0, 7]], 24), chrome);
    add(n, g.cyl(3, 3, L.nk - 6, 16), dark, [0, 6 + (L.nk - 6) / 2 - 1, 0]);
    return n;
  }
  function head() {
    const h0 = grp(), h = grp(); h.position.y = 1.9; h.scale.setScalar(1.06); h0.add(h); // tambour un peu au-dessus du pivot : cou visible
    const R = 11.8;
    if (lo) {
      add(h, g.cyl(R, R, 11, 14, 'x'), white, [1, 0, 0]);
      add(h, g.cbox(12, 19, 19, 3), white, [-8, -0.5, 0]);
      add(h, g.torus(9.7, 1.1, 18, 4, PI * 2, 'x'), ring, [7, 0, 0]);
      return h0;
    }
    // tambour blanc (axe X), lèvre avant arrondie mais nette
    add(h, lathe([[0, -6.5], [10.4, -6.5, 1], [R, -5, 1], [R, 4.4, 1], [11.7, 5.4], [11.2, 6.3], [10.5, 6.75, 1], [10.1, 6.75, 1], [10.1, 6.1, 1]], 40, 'x'), headM, [0.5, 0, 0]);
    add(h, g.torus(R + 0.02, 0.18, 40, 4, PI * 2, 'x'), seam, [-4.2, 0, 0]);
    // anneau LED : bord extérieur ambré + cœur chaud
    add(h, lathe([[10.15, 6.45], [9.2, 6.2]], 48, 'x'), ring, [0.5, 0, 0]);
    add(h, lathe([[9.2, 6.2], [8.55, 5.9]], 48, 'x'), ringHot, [0.5, 0, 0]);
    add(h, lathe([[8.55, 5.9], [8.25, 5.4]], 48, 'x'), amber, [0.5, 0, 0]);
    // objectif (verre noir légèrement bombé)
    add(h, lathe([[8.25, 5.3], [7.2, 5.75], [4.5, 6.2], [0, 6.4]], 40, 'x'), lens, [0.5, 0, 0]);
    // capteurs derrière le verre
    add(h, combo('headSensors', () => [[-4.6, 2.6], [-1.6, 3.3], [1.6, 3.3], [4.6, 2.6]].map(q => [g.cyl(0.55, 0.55, 0.3, 10, 'x'), [0, q[1], q[0]]])), panel, [6.85, 0, 0]);
    add(h, combo('headLeds', () => [[0, -1.6], [1.2, -1.6]].map(q => [g.box(0.2, 0.35, 0.5), [0, q[1], q[0]]])), ringHot, [6.9, 0, 0]);
    // module arrière (boîte blanche) + grilles d'aération sombres sur les flancs
    add(h, shp('headBox', [[-15.2, -8.8, 4.5], [-3, -8.8, 1], [-3, 10, 1], [-15.2, 10, 4.5]], 19, 1.6, 5), headM);
    add(h, g.cbox(9.5, 0.9, 12, 0.3), panel, [-9.4, 10.1, 0]);
    for (const sd of [1, -1]) {
      add(h, rr(8, 12.6, 1, 2.4, 0.3, 4), seam, [-9.3, 0.6, 9.35 * sd]);
      add(h, rr(7.2, 11.8, 1, 2, 0.25, 4), grilleHd, [-9.3, 0.6, 9.6 * sd]);
    }
    // embase (bride noire + vis)
    add(h, cc(5.4, 1.9, 0.4, 24), dark, [-0.5, -13, 0]);
    add(h, combo('headBolts', () => [0, 1, 2, 3, 4, 5].map(i => [boltG(0.45, 0.5, 'x'), [Math.cos(i * PI / 3) * 5.4, 0, Math.sin(i * PI / 3) * 5.4], [0, i * PI / 3, 0]])), steel, [-0.5, -13, 0]);
    // antenne (arrière gauche) avec bagues jaunes
    add(h, g.cyl(0.55, 0.75, 15, 10), aluDk, [-11.5, 17, -5]);
    add(h, combo('antBands', () => [[g.cyl(0.8, 0.8, 0.7, 10), [0, 0, 0]], [g.cyl(0.8, 0.8, 0.7, 10), [0, 1.5, 0]]]), antM, [-11.5, 20.8, -5]);
    add(h, g.cbox(3.4, 1.4, 3.4, 0.4), headM, [-11.5, 10.4, -5]);
    return h0;
  }

  /* =========================================================
     DÉTAILS PROPRES AUX SKINS (lignes lumineuses, gyrophares, balise…) + animations
     (aucun en skin classic ; jamais en LOD bas)
     ========================================================= */
  const DX = {};
  let skTick = null;
  const patMats = [alu, aluPol, cast, aluDk, panel, pad, satin, wrap, white, grille, grilleDk, grilleHd, chestM, plastM, backM, thPlateM, thPlateInM, headM, shPadM, shFaceM, strapM, shinM, footM, uaM]
    .filter((m, i, a) => a.indexOf(m) === i && m.userData && m.userData.pat && m.userData.pat.patE.base.getHex() !== 0);
  const pulsePat = (k) => { for (const m of patMats) m.userData.pat.patE.value.copy(m.userData.pat.patE.base).multiplyScalar(k); };
  if (SK && !lo && !ctx.override) {
    const sid = ctx.skin;
    // filets qui soulignent la silhouette (lumineux en FURTIF, or poli en NACRE)
    const pinstripes = (lm) => {
      DX.torso = (t) => {
        const chestTaper = v => { const u = Math.min(1, Math.max(0, (v[1] - 27) / 25)); v[2] *= 0.86 + 0.14 * u * (2 - u); };
        add(t, deform('fxFurChest', () => [
          [g.box(0.55, 20, 0.3), [8.1, 44.5, 16.95]], [g.box(0.55, 20, 0.3), [8.1, 44.5, -16.95]],
          [g.box(0.3, 25.5, 0.55), [12.98, 43.6, 11.75], [0.054, 0, 0]], [g.box(0.3, 25.5, 0.55), [12.98, 43.6, -11.75], [-0.054, 0, 0]],
          [g.box(14, 0.5, 0.3), [-4.5, 33.6, 16.95]], [g.box(14, 0.5, 0.3), [-4.5, 33.6, -16.95]]
        ], chestTaper), lm);
        add(t, g.box(0.3, 0.6, 20), lm, [-18.75, 35.5, 0]);
      };
      DX.head = (h) => add(h, g.torus(11.86, 0.24, 48, 4, PI * 2, 'x'), lm, [-4.2, 0, 0]);
      DX.ua = (a, sd) => add(a, g.box(0.55, 10, 0.55), lm, [-4.98, 18.4, 2.9 * sd]);
      DX.fa = (f) => add(f, cc(4.75, 0.6, 0.12, 24), lm, [0, 16.8, 0]);
      DX.th = (t, sd) => add(t, deform('fxFurTh' + sd, () => [[g.box(0.55, 17, 0.4), [-5.7, 27.5, 8.45 * sd]]], v => { v[2] *= 1 - 0.17 * clamp01((v[1] - 15) / 27); }), lm);
      DX.sh = (s, sd) => add(s, g.box(0.5, 9, 0.35), lm, [-5.0, 9.8, 6.3 * sd], [0, 0, -0.12]);
    };
    if (sid === 'furtif') { // filets lumineux rouges
      const lg = ctx.glow(0xff1830, 2.6);
      pinstripes(lg);
      skTick = (t) => { lg.emissiveIntensity = lg.userData.baseI * (0.72 + 0.28 * Math.sin(t * 2.6)); };
    } else if (sid === 'nacre') { // filets d'or poli (carrosserie de luxe) + médaillon art déco doré sur le plastron laqué noir
      pinstripes(aluPol);
      const lines = DX.torso, dm = decalMat('deco', { color: 0xe8c47e, roughness: 0.16, metalness: 1, clearcoat: 0.4, envMapIntensity: 1.5 });
      DX.torso = (t) => {
        lines(t);
        const chestTaper = v => { const u = Math.min(1, Math.max(0, (v[1] - 27) / 25)); v[2] *= 0.86 + 0.14 * u * (2 - u); };
        add(t, deform('fxDeco', () => [[g.box(16.5, 19, 0.06), [12.94, 42.4, 0], [0, H, 0]]], chestTaper), dm);
      };
    } else if (sid === 'chantier') { // balise orange tournante sur la tête + panneaux « danger » sur les flancs
      const bg = ctx.glow(0xff5000, 2.4), wm = decalMat('warn', { color: 0x111214 });
      DX.torso = (t) => {
        const chestTaper = v => { const u = Math.min(1, Math.max(0, (v[1] - 27) / 25)); v[2] *= 0.86 + 0.14 * u * (2 - u); };
        add(t, deform('fxWarn', () => [[g.box(6.4, 5.8, 0.06), [-9.8, 44.6, 16.85]], [g.box(6.4, 5.8, 0.06), [-9.8, 44.6, -16.85], [0, PI, 0]]], chestTaper), wm);
      };
      DX.head = (h) => {
        add(h, g.cyl(2.3, 2.5, 1.3, 18), dark, [-6.6, 10.8, 4.1]);
        add(h, g.sphere(1.95, 18, 10, 0, PI * 2, 0, PI / 2), bg, [-6.6, 11.4, 4.1]);
        add(h, g.cyl(2.05, 2.05, 0.35, 18), steel, [-6.6, 11.5, 4.1]);
      };
      skTick = (t) => { const a = Math.max(0, Math.sin(t * 7.5)); bg.emissiveIntensity = 0.7 + 2.3 * a * a * a * a; };
    } else if (sid === 'emeute') { // rampes de gyrophares rouge / bleu (épaules + tête)
      const red = ctx.glow(0xff1a2e, 1.2), blue = ctx.glow(0x1f5cff, 1.2);
      DX.sc = (s, sd) => {
        add(s, g.cbox(12, 1.1, 5, 0.3), satin, [0.6, 8.7, 2.1 * sd]);
        add(s, g.cbox(5.3, 1.7, 4.2, 0.5), red, [-2.3, 9.5, 2.1 * sd]);
        add(s, g.cbox(5.3, 1.7, 4.2, 0.5), blue, [3.5, 9.5, 2.1 * sd]);
      };
      DX.head = (h) => {
        add(h, g.cbox(11.2, 1.1, 5.2, 0.3), satin, [-9.2, 10.9, 0]);
        add(h, g.cbox(4.9, 1.4, 4.4, 0.5), red, [-6.4, 11.7, 0]);
        add(h, g.cbox(4.9, 1.4, 4.4, 0.5), blue, [-12, 11.7, 0]);
      };
      skTick = (t) => {
        const ph = (t * 1.9) % 1, a = ph < 0.5 && (ph % 0.25) < 0.17, b = ph >= 0.5 && ((ph - 0.5) % 0.25) < 0.17;
        red.emissiveIntensity = a ? 5 : 0.9; blue.emissiveIntensity = b ? 6 : 1.0;
      };
    } else if (sid === 'magma') {
      skTick = (t) => pulsePat(0.82 + 0.18 * Math.sin(t * 1.6) + 0.06 * Math.sin(t * 5.3));
    } else if (sid === 'hydraulique') { // durites hydrauliques apparentes + raccords anodisés bleus (hommage à l'Atlas hydraulique)
      const hose = patMat({ color: 0x1b3c9a, roughness: 0.42, metalness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 1.1 }, { tex: 'carbon', sc: 1 / 3.2, c2: 0x4f86ff, r2: 0.25, m2: 0.4 });
      const hoseRun = (par, key, pts, sd, r = 0.75) => {
        const q = pts.map(v => [v[0], v[1], v[2] * sd]); r *= 1.4;
        add(par, g.tube(q, r, 20, 6), hose);
        for (const e of [q[0], q[q.length - 1]]) add(par, g.cyl(r + 0.4, r + 0.4, 2.2, 10), chrome, e);
      };
      DX.torso = (t) => { for (const sd of [1, -1]) { hoseRun(t, 'w1', [[-3.6, 19.8, 9.6], [-8.6, 23.2, 11.4], [-12.2, 28.8, 12]], sd, 0.95); hoseRun(t, 'w2', [[3.6, 19.8, 9.4], [6.8, 24, 11.2], [8, 29.6, 11.8]], sd, 0.85); } };
      DX.ua = (a, sd) => hoseRun(a, 'ua', [[4.7, 10.5, 4.7], [4.8, 15, 4.8], [4.6, 22, 4.6], [3.7, 28.6, 3.9]], sd, 0.9);
      DX.fa = (f, sd) => hoseRun(f, 'fa', [[-2.6, 4.6, 4.8], [-3.1, 11, 5.3], [-2.6, 18, 4.9], [-2.1, 27, 3.8]], sd, 0.8);
      DX.th = (t, sd) => { hoseRun(t, 'th', [[6.4, 14.2, 8.6], [7.4, 24, 8.8], [6.6, 33.5, 8.1], [4.4, 40.8, 7.2]], sd, 1.05); hoseRun(t, 'th2', [[-7.4, 14.4, 8.9], [-8.3, 24, 9.0], [-7.3, 33, 8.4], [-5.4, 40, 7.7]], sd, 0.95); };
      DX.sh = (s, sd) => hoseRun(s, 'sh', [[5.2, 3.2, 7.2], [6.4, 12, 7.4], [5.2, 23.5, 6.3], [3.0, 34.8, 4.9]], sd, 0.95);
    } else if (sid === 'cuivre') {
      skTick = null;
    }
  }

  /* ---------------- assemblage ---------------- */
  P.torso = torso(); if (DX.torso) DX.torso(P.torso);
  P.neck = neck();
  P.head = head(); if (DX.head) DX.head(P.head.children[0]);
  for (const [sd, z] of [['f', 1], ['b', -1]]) {
    P[sd + 'sc'] = shoulderCap(z);
    P[sd + 'ua'] = upperArm(z);
    P[sd + 'el'] = elbow(z);
    P[sd + 'fa'] = foreArm(z);
    P[sd + 'ha'] = hand(z);
    P[sd + 'hi'] = hipJoint(z);
    P[sd + 'th'] = thigh(z);
    P[sd + 'kn'] = knee(z);
    P[sd + 'sh'] = shin(z);
    P[sd + 'fo'] = foot(z);
    for (const k of ['sc', 'ua', 'fa', 'th', 'sh', 'fo']) if (DX[k]) DX[k](P[sd + k], z);
  }
  const tick = (lo || ctx.override) ? undefined : (t) => {
    const k = 0.9 + 0.1 * Math.sin(t * 2.1);
    ring.emissiveIntensity = ring.userData.baseI * k;
    ringHot.emissiveIntensity = ringHot.userData.baseI * k;
    if (skTick) skTick(t, k);
  };
  return { parts: P, shZ, hpZ, tick };
};

/* =========================================================
   SKINS D'ATLAS (déclarés dans ROSTER : robots.js) — palette / finitions par matériau.
   m[clé] : surcharge des paramètres d'origine (P0[from || clé]) ; pat = motif triplanaire (voir ptex) ;
   glow: [couleur, intensité] = matériau émissif. Clés : matériaux d'origine (alu, aluPol, cast, aluDk, panel, pad,
   satin, wrap, white, grille, grilleDk, grilleHd, lens, steel, dark, chrome, rubber) + emplacements (chest, plast,
   back, thPlate, thPlateIn, head, shPad, shFace, strap, logo, ant, shin, foot, ua).
   g : couleurs de l'anneau de la tête (hot = cœur, inner = bord intérieur) et de la LED du coude (led).
   (l'anneau extérieur, les spéciaux, projectiles et images rémanentes suivent ch.accent du skin)
   ========================================================= */
if (typeof RK !== 'undefined' && RK && RK.models.atlas) RK.models.atlas.SKINS = {
  // NOIR FURTIF : gris canon mat, fibre de carbone, chrome noir, filets rouges
  furtif: {
    g: { hot: 0xffb3bb, inner: 0xc8001e, led: 0xff1830 },
    m: {
      alu: { color: 0x474c55, roughness: 0.5, metalness: 0.6, clearcoat: 0.2, clearcoatRoughness: 0.5, envMapIntensity: 1.1, roughnessMap: null },
      aluPol: { color: 0x2e3137, roughness: 0.2, metalness: 1, clearcoat: 0.5, clearcoatRoughness: 0.12, envMapIntensity: 1.5 },
      cast: { color: 0x111216, roughness: 0.3, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.0, pat: { tex: 'carbon', sc: 1 / 14, c2: 0x464b55, r2: 0.22, m2: 0.4 } },
      aluDk: { color: 0x202227, roughness: 0.45, metalness: 0.6 },
      panel: { color: 0x1a1c20 },
      pad: { color: 0x0b0b0d, roughness: 0.7, clearcoat: 0.1 },
      satin: { color: 0x101114 },
      white: { color: 0x2a2d33, roughness: 0.5, metalness: 0.35, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 0.9 },
      plast: { from: 'cast', color: 0x111216, roughness: 0.3, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.0, pat: { tex: 'carbon', sc: 1 / 14, c2: 0x464b55, r2: 0.22, m2: 0.4 } },
      back: { from: 'cast', color: 0x111216, roughness: 0.3, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.0, pat: { tex: 'carbon', sc: 1 / 14, c2: 0x464b55, r2: 0.22, m2: 0.4 } },
      thPlateIn: { from: 'cast', color: 0x111216, roughness: 0.3, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.0, pat: { tex: 'carbon', sc: 1 / 14, c2: 0x464b55, r2: 0.22, m2: 0.4 } },
      thPlate: { from: 'aluPol', color: 0x2e3137, roughness: 0.4, metalness: 0.9, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 1.1 },
      grille: { color: 0x3c4048 }, grilleDk: { color: 0x26282d }, grilleHd: { color: 0x2c2f35 },
      logo: { glow: [0xff1830, 2.2] },
      ant: { color: 0xff1830, roughness: 0.4 }
    }
  },
  // CHANTIER : jaune sécurité laqué, chevrons noir/jaune, acier usiné, balise orange
  chantier: {
    g: { hot: 0xffd890, inner: 0xff4a00, led: 0xff8a00 },
    m: {
      alu: { color: 0xffc000, roughness: 0.3, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.85, roughnessMap: null },
      cast: { color: 0x1b1c1f, roughness: 0.35, metalness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.25, envMapIntensity: 0.9 },
      aluPol: { color: 0xbfc5cc, roughness: 0.2, metalness: 0.9, clearcoat: 0.3, envMapIntensity: 1.3 },
      aluDk: { color: 0x26272a, roughness: 0.4, metalness: 0.5, roughnessMap: null },
      panel: { color: 0x1a1b1e },
      white: { color: 0xffc400, roughness: 0.2, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.7 },
      plast: { from: 'alu', color: 0xffc000, roughness: 0.3, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.85, roughnessMap: null, pat: { tex: 'hazard', sc: 1 / 28, c2: 0x111214, r2: 0.4, m2: 0.1 } },
      back: { from: 'alu', color: 0xffc000, roughness: 0.3, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.85, roughnessMap: null, pat: { tex: 'hazard', sc: 1 / 28, c2: 0x111214, r2: 0.4, m2: 0.1 } },
      thPlateIn: { from: 'alu', color: 0xffc000, roughness: 0.3, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.85, roughnessMap: null, pat: { tex: 'hazard', sc: 1 / 28, c2: 0x111214, r2: 0.4, m2: 0.1 } },
      shFace: { from: 'alu', color: 0xffc000, roughness: 0.3, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.85, roughnessMap: null, pat: { tex: 'hazard', sc: 1 / 28, c2: 0x111214, r2: 0.4, m2: 0.1 } },
      logo: { color: 0x111214, roughness: 0.5 },
      ant: { color: 0x111214, roughness: 0.5 }
    }
  },
  // HYDRAULIQUE : hommage à l'ancien Atlas hydraulique — alu graphite, raccords anodisés bleus, durites apparentes
  hydraulique: {
    g: { hot: 0xd8f6ff, inner: 0x0088ff, led: 0x36d6ff },
    m: {
      alu: { color: 0x6c727b, roughness: 0.34, metalness: 0.72, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 1.3 },
      aluPol: { color: 0x2a63dc, roughness: 0.2, metalness: 0.9, clearcoat: 0.7, clearcoatRoughness: 0.08, envMapIntensity: 1.4 },
      cast: { color: 0x1a1b1f, roughness: 0.42, metalness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 1.0 },
      aluDk: { color: 0x1e45a0, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.2 },
      panel: { color: 0x2b2e34 },
      white: { color: 0x9da3ab, roughness: 0.3, metalness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.1, envMapIntensity: 0.9 },
      plast: { from: 'panel', color: 0x24272c, roughness: 0.38, metalness: 0.35 },
      thPlate: { from: 'aluPol', color: 0x4b5059, roughness: 0.25, metalness: 0.85, clearcoat: 0.5, envMapIntensity: 1.3 },
      grille: { color: 0x6b717a },
      logo: { glow: [0x36d6ff, 2.2] },
      ant: { color: 0x2a63dc, roughness: 0.2, metalness: 0.9, envMapIntensity: 1.4 }
    }
  },
  // MAGMA : coques de basalte fissurées de lave incandescente, obsidienne polie
  magma: {
    g: { hot: 0xffd27a, inner: 0xff2400, led: 0xff5a14 },
    m: {
      alu: { color: 0x2a2624, roughness: 0.82, metalness: 0.1, clearcoat: 0.05, envMapIntensity: 0.7, roughnessMap: null,
        pat: { tex: 'cracks', sc: 1 / 52, c2: 0x3a1206, r2: 0.6, m2: 0.05, c3: 0x5a5450, r3: 0.9, m3: 0.05, e: 0xff4a0a, eI: 3.2 } },
      cast: { color: 0x2a2624, roughness: 0.82, metalness: 0.1, clearcoat: 0.05, envMapIntensity: 0.7,
        pat: { tex: 'cracks', sc: 1 / 40, off: [7, 3, 11], c2: 0x3a1206, r2: 0.6, m2: 0.05, c3: 0x5a5450, r3: 0.9, m3: 0.05, e: 0xff4a0a, eI: 3.2 } },
      aluPol: { color: 0x0f0c0b, roughness: 0.08, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.4 },
      aluDk: { color: 0x1d1917, roughness: 0.6, metalness: 0.4, roughnessMap: null },
      panel: { color: 0x161312 },
      pad: { color: 0x0c0a0a },
      satin: { color: 0x130f0e },
      white: { color: 0x2a2624, roughness: 0.8, metalness: 0.1, clearcoat: 0.05, envMapIntensity: 0.7,
        pat: { tex: 'cracks', sc: 1 / 38, off: [3, 9, 5], c2: 0x3a1206, r2: 0.6, m2: 0.05, c3: 0x5a5450, r3: 0.9, m3: 0.05, e: 0xff4a0a, eI: 3.2 } },
      plast: { from: 'alu', color: 0x1a1716, roughness: 0.7, metalness: 0.1, clearcoat: 0.1, envMapIntensity: 0.7, roughnessMap: null,
        pat: { tex: 'cracks', sc: 1 / 36, off: [0, 5, 2], c2: 0x4a1608, r2: 0.6, m2: 0.05, c3: 0x5a5450, r3: 0.9, m3: 0.05, e: 0xff5a10, eI: 3.8 } },
      grille: { color: 0x2c2724, map: null, roughness: 0.5, metalness: 0.5, pat: { tex: 'holes', sc: 1 / 24, c2: 0x080404, r2: 0.9, m2: 0, e: 0xff3a00, eI: 2.2 } },
      grilleDk: { color: 0x221e1c, map: null, roughness: 0.5, metalness: 0.4, pat: { tex: 'holes', sc: 1 / 24, c2: 0x080404, r2: 0.9, m2: 0, e: 0xff3a00, eI: 1.8 } },
      grilleHd: { color: 0x2c2724, map: null, roughness: 0.5, metalness: 0.5, pat: { tex: 'holes', sc: 1 / 11, c2: 0x080404, r2: 0.9, m2: 0, e: 0xff3a00, eI: 1.8 } },
      lens: { color: 0x0a0402 },
      logo: { glow: [0xff5a10, 2.4] },
      ant: { glow: [0xff4a0a, 2.4] }
    }
  },
  // ANTI-ÉMEUTE : bleu nuit laqué, plastron blanc à damier, rampes de gyrophares rouge/bleu
  emeute: {
    g: { hot: 0xd8e6ff, inner: 0x1a4dff, led: 0x2f7bff },
    m: {
      alu: { color: 0x1c3166, roughness: 0.3, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.95, roughnessMap: null },
      cast: { color: 0x1c3166, roughness: 0.3, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.95 },
      chest: { from: 'alu', color: 0x1c3166, roughness: 0.3, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.95, roughnessMap: null,
        pat: { tex: 'checker', sc: 1 / 64, off: [0, -12, 0], c2: 0xf3f5f8, r2: 0.22, m2: 0.02, c3: 0xf3f5f8, r3: 0.22, m3: 0.02 } },
      back: { from: 'alu', color: 0x1c3166, roughness: 0.3, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.95, roughnessMap: null,
        pat: { tex: 'checker', sc: 1 / 64, off: [0, -12, 0], c2: 0xf3f5f8, r2: 0.22, m2: 0.02, c3: 0xf3f5f8, r3: 0.22, m3: 0.02 } },
      grille: { pat: { tex: 'checker', sc: 1 / 64, off: [0, -12, 0], c2: 0xf3f5f8, r2: 0.25, m2: 0.05, c3: 0xf3f5f8, r3: 0.25, m3: 0.05 } },
      aluDk: { color: 0x2c3548, roughness: 0.35, metalness: 0.6 },
      panel: { color: 0x1a2236 },
      white: { color: 0xf3f5f8, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.6 },
      plast: { from: 'white', color: 0xf3f5f8, roughness: 0.22, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.6,
        pat: { tex: 'checker', sc: 1 / 64, off: [0, -12, 0], c2: 0x1846c8, r2: 0.25, m2: 0.1, c3: 0x0f1d3d, r3: 0.3, m3: 0.2 } },
      thPlateIn: { from: 'white', color: 0xf3f5f8, roughness: 0.22, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.6 },
      shFace: { from: 'white', color: 0xf3f5f8, roughness: 0.22, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.6 },
      logo: { color: 0x1846c8, roughness: 0.3 },
      ant: { glow: [0x1f5cff, 2.4] }
    }
  },
  // CUIVRE PATINÉ : cuivre brossé gagné par le vert-de-gris, laiton poli, cuir, lueur menthe
  cuivre: {
    g: { hot: 0xd6fff0, inner: 0x00b884, led: 0x3dffc0 },
    m: {
      alu: { color: 0xe8875a, roughness: 0.28, metalness: 0.66, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 1.5,
        pat: { tex: 'patina', sc: 1 / 34, c2: 0x3fae8f, r2: 0.85, m2: 0, c3: 0x7a3420, r3: 0.42, m3: 0.7 } },
      aluPol: { color: 0xe2b863, roughness: 0.12, metalness: 1, clearcoat: 0.5, clearcoatRoughness: 0.08, envMapIntensity: 1.6 },
      cast: { color: 0xd97a4c, roughness: 0.26, metalness: 0.7, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 1.4,
        pat: { tex: 'patina', sc: 1 / 28, off: [5, 11, 3], c2: 0x3fae8f, r2: 0.85, m2: 0, c3: 0x6a2c1a, r3: 0.42, m3: 0.7 } },
      aluDk: { color: 0x4a3020, roughness: 0.35, metalness: 0.85 },
      panel: { color: 0x1d1511 },
      pad: { color: 0x2b1a12, roughness: 0.62, metalness: 0.02, clearcoat: 0.35, clearcoatRoughness: 0.45, envMapIntensity: 0.6 },
      satin: { color: 0x3a2618, roughness: 0.45, metalness: 0.4 },
      wrap: { color: 0x2e1d14, sheenColor: 0x8a5a3a },
      white: { color: 0xe8875a, roughness: 0.2, metalness: 0.75, clearcoat: 0.8, clearcoatRoughness: 0.08, envMapIntensity: 1.5,
        pat: { tex: 'patina', sc: 1 / 36, off: [9, 2, 7], c2: 0x3fae8f, r2: 0.85, m2: 0, c3: 0x7a3420, r3: 0.42, m3: 0.7 } },
      plast: { from: 'aluPol', color: 0xe2b863, roughness: 0.14, metalness: 1, clearcoat: 0.5, clearcoatRoughness: 0.08, envMapIntensity: 1.6 },
      grille: { color: 0xb08040 }, grilleDk: { color: 0x3a2618 }, grilleHd: { color: 0x6a4424 },
      steel: { color: 0xd8b070, roughness: 0.2, metalness: 1 },
      logo: { glow: [0x3dffc0, 2.2] },
      ant: { color: 0xe2b863, roughness: 0.12, metalness: 1, envMapIntensity: 1.6 }
    }
  },
  // NACRE ROYALE : coques blanc nacré irisé, mécanique dorée, laque noire, lueur lilas
  nacre: {
    g: { hot: 0xf6eaff, inner: 0x9b4dff, led: 0xc77dff },
    m: {
      alu: { color: 0xf2e9ea, roughness: 0.16, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.9, roughnessMap: null,
        iridescence: 1, iridescenceIOR: 1.9, iridescenceThicknessRange: [360, 820], sheen: 1, sheenColor: 0x9fd4ff, sheenRoughness: 0.35 },
      cast: { color: 0xf2e9ea, roughness: 0.16, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.9,
        iridescence: 1, iridescenceIOR: 1.9, iridescenceThicknessRange: [360, 820], sheen: 1, sheenColor: 0x9fd4ff, sheenRoughness: 0.35 },
      white: { color: 0xf2e9ea, roughness: 0.14, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.9,
        iridescence: 1, iridescenceIOR: 1.9, iridescenceThicknessRange: [360, 820], sheen: 1, sheenColor: 0x9fd4ff, sheenRoughness: 0.35 },
      aluPol: { color: 0xe8c47e, roughness: 0.14, metalness: 1, clearcoat: 0.4, clearcoatRoughness: 0.1, envMapIntensity: 1.5 },
      aluDk: { color: 0xb8925a, roughness: 0.28, metalness: 1, envMapIntensity: 1.3, roughnessMap: null },
      panel: { color: 0x121015, roughness: 0.2, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.0 },
      pad: { color: 0x17121c, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25 },
      satin: { color: 0x1a1520 },
      grille: { color: 0xd8b26a, roughness: 0.3, metalness: 1 }, grilleDk: { color: 0x8a6a3a, metalness: 0.9 }, grilleHd: { color: 0x5a4a32 },
      steel: { color: 0xe6c27a, roughness: 0.2, metalness: 1, roughnessMap: null },
      chrome: { color: 0xf2d9a0, roughness: 0.08, metalness: 1 },
      lens: { color: 0x0b0610 },
      logo: { color: 0xe8c47e, roughness: 0.15, metalness: 1, envMapIntensity: 1.5 },
      ant: { glow: [0xc77dff, 2.4] }
    }
  }
};
