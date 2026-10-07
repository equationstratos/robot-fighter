'use strict';
/* =========================================================
   RK — KIT DE MODÉLISATION DES ROBOTS 3D
   Partagé par le jeu (render3d.js) et l'outil de prévisualisation (tools/viewer.html).

   ---------------------------------------------------------
   CONTRAT D'UN MODÈLE  (js/models/<id>.js)
   ---------------------------------------------------------
   RK.models.<id> = function (ctx) { ... return { parts, shZ, hpZ, tick? } }

   Unités "design" : le robot est modélisé comme si ch.scale = 1 (≈ 185 unités de haut,
   1 unité ≈ 1 cm). Le kit applique ch.scale tout seul. ctx.L donne les longueurs d'os :
     ctx.L.th  cuisse (hanche → genou)      ctx.L.sh  tibia (genou → cheville)
     ctx.L.ua  bras (épaule → coude)        ctx.L.fa  avant-bras (coude → poignet)
     ctx.L.to  torse (bassin → base du cou) ctx.L.nk  cou (base du cou → centre de la tête)
   Repère de chaque pièce (vue de profil, robot tourné vers +X) :
     +X = avant (vers l'adversaire), +Y = haut, +Z = côté (vers la caméra pour le côté 'f').
   Pièces OBLIGATOIRES dans parts (Object3D), pour side ∈ {'f' (proche caméra), 'b' (loin)} :
     torso        origine = centre du bassin (hanche). +Y = colonne ; la base du cou est à y = L.to,
                  les épaules à y ≈ 0.86·L.to, z = ±shZ ; les hanches à y = 0, z = ±hpZ.
                  Contient bassin, taille, buste, structure d'épaules (tout ce qui suit le torse).
     neck         origine = base du cou, s'étend sur +Y jusqu'à L.nk.
     head         origine = centre de la tête (au bout du cou). Visage vers +X.
     <s>th        cuisse : origine = hanche, s'étend sur +Y de 0 à L.th (genou à y = L.th).
     <s>sh        tibia  : origine = genou, +Y jusqu'à L.sh (cheville).
     <s>ua        bras   : origine = épaule, +Y jusqu'à L.ua (coude).
     <s>fa        avant-bras : origine = coude, +Y jusqu'à L.fa (poignet).
        → Pour ces 4 membres, quand le membre pend vers le bas, le côté AVANT du membre est -X
          (genou/rotule, tibia, intérieur du coude… se dessinent du côté -X).
     <s>hi        articulation de hanche (origine = hanche, même rotation que la cuisse)
     <s>kn        genou   (origine = genou, même rotation que le tibia : avant = -X)
     <s>el        coude   (origine = coude, même rotation que l'avant-bras : avant = -X)
     <s>sc        épaule  (origine = épaule, suit la rotation du TORSE : avant = +X)
     <s>ha        main    (origine = poignet, +X = prolongement de l'avant-bras ; paume côté -Y)
                  → utiliser RK.hand(ctx, {...}) pour des doigts articulés (fermés/ouverts).
     <s>fo        pied    (origine = cheville, +X = pointe du pied, semelle sous la cheville
                  à y ≈ -ankleH ; ankleH ≈ 7..9).
   shZ / hpZ : écart latéral des épaules / hanches (unités design).
   tick(t, state) facultatif : animations (LED qui pulsent, yeux…). state = { pose, st, face }.
     (face = -1 quand le robot regarde à gauche : tout le modèle est alors en miroir ; pour garder
      un texte lisible, le placer dans un groupe userData.noMerge et faire group.scale.z = state.face)
     Ne doit modifier que des matériaux, ou des objets marqués userData.noMerge = true.

   RÈGLES
   - Créer les matériaux UNIQUEMENT via ctx.M (palette) / ctx.mat(params) / ctx.glow(color, I).
   - Créer les meshes via ctx.mesh(geometry, material, opts) ; géométries via RK.g.* (mises en cache).
   - ctx.lod === 'low' (images rémanentes) : version très simplifiée (< 30 meshes, pas de doigts).
   - Budget (lod 'high') : ≤ 260 meshes avant fusion, ≤ 50 000 triangles.
   - Les meshes statiques de chaque pièce sont fusionnés automatiquement par matériau.
   ========================================================= */
const RK = (function () {
  const T = window.THREE;
  if (!T) return null;
  const BGU = T.BufferGeometryUtils;
  const models = {};
  const D = Math.PI / 180;

  /* ---------------- textures procédurales ---------------- */
  const texCache = {};
  function tex(kind) {
    if (texCache[kind]) return texCache[kind];
    const n = 256, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const c = cv.getContext('2d');
    let r = 12345; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    if (kind === 'brushed') { // rugosité de l'alu brossé (stries horizontales)
      c.fillStyle = '#808080'; c.fillRect(0, 0, n, n);
      for (let i = 0; i < 1400; i++) { const y = rnd() * n, g = 100 + rnd() * 70 | 0; c.fillStyle = `rgba(${g},${g},${g},${0.25 + rnd() * 0.3})`; c.fillRect(0, y, n, 0.6 + rnd()); }
    } else if (kind === 'grille') { // grille d'aération (pour alphaMap / map)
      c.fillStyle = '#fff'; c.fillRect(0, 0, n, n); c.fillStyle = '#000';
      for (let y = 8; y < n; y += 16) for (let x = 8 + ((y / 16) % 2) * 8; x < n; x += 16) { c.beginPath(); c.arc(x, y, 4.2, 0, 7); c.fill(); }
    } else if (kind === 'carbon') {
      for (let y = 0; y < n; y += 8) for (let x = 0; x < n; x += 8) { const v = ((x + y) / 8) % 2 ? 40 : 58; c.fillStyle = `rgb(${v},${v},${v + 4})`; c.fillRect(x, y, 8, 8); }
    } else if (kind === 'noise') {
      const img = c.createImageData(n, n);
      for (let i = 0; i < n * n; i++) { const v = 110 + rnd() * 40; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
      c.putImageData(img, 0, 0);
    }
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / 24, 1 / 24);
    return (texCache[kind] = t);
  }

  /* ---------------- géométries (en cache) ---------------- */
  const gc = {};
  const cache = (key, make) => gc[key] || (gc[key] = make());
  const axisRot = (g, axis) => { if (axis === 'x') g.rotateZ(-Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2); return g; };
  const g = {
    // boîte simple
    box: (w, h, d) => cache(`box${w},${h},${d}`, () => new T.BoxGeometry(w, h, d)),
    // boîte chanfreinée (arêtes à 45°, rendu anguleux)
    cbox: (w, h, d, c = 1) => cache(`cbox${w},${h},${d},${c}`, () => {
      c = Math.min(c, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01);
      const s = new T.Shape(); const x = w / 2 - c, y = h / 2 - c;
      s.moveTo(-x, -y); s.lineTo(x, -y); s.lineTo(x, y); s.lineTo(-x, y); s.closePath();
      const geo = new T.ExtrudeGeometry(s, { depth: d - 2 * c, bevelEnabled: c > 0, bevelThickness: c, bevelSize: c, bevelSegments: 1, curveSegments: 1 });
      geo.translate(0, 0, -(d - 2 * c) / 2); return geo;
    }),
    // boîte arrondie (petit rayon : arêtes nettes mais douces)
    rbox: (w, h, d, r = 1, seg = 2) => cache(`rbox${w},${h},${d},${r},${seg}`, () => new T.RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2))),
    // plaque : polygone [[x,y],...] dans le plan XY extrudé sur Z (épaisseur d), centré en Z, chanfrein c
    prism: (pts, d, c = 0.6, curve = 1) => cache(`prism${JSON.stringify(pts)},${d},${c},${curve}`, () => {
      const s = new T.Shape(); pts.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])); s.closePath();
      const dd = Math.max(0.01, d - 2 * c);
      const geo = new T.ExtrudeGeometry(s, { depth: dd, bevelEnabled: c > 0, bevelThickness: c, bevelSize: c, bevelSegments: 1, curveSegments: curve });
      geo.translate(0, 0, -dd / 2); return geo;
    }),
    // plaque à contour courbe : path = fonction (shape) => void (utilise moveTo/lineTo/quadraticCurveTo/bezierCurveTo)
    shape: (key, draw, d, c = 0.6, curve = 8) => cache(`shape${key},${d},${c},${curve}`, () => {
      const s = new T.Shape(); draw(s);
      const dd = Math.max(0.01, d - 2 * c);
      const geo = new T.ExtrudeGeometry(s, { depth: dd, bevelEnabled: c > 0, bevelThickness: c, bevelSize: c, bevelSegments: c > 0 ? 2 : 0, curveSegments: curve });
      geo.translate(0, 0, -dd / 2); return geo;
    }),
    cyl: (rt, rb, h, seg = 24, axis = 'y', open = false) => cache(`cyl${rt},${rb},${h},${seg},${axis},${open}`, () => axisRot(new T.CylinderGeometry(rt, rb, h, seg, 1, open), axis)),
    // cylindre chanfreiné (bords biseautés)
    ccyl: (r, h, c = 1, seg = 24, axis = 'y') => cache(`ccyl${r},${h},${c},${seg},${axis}`, () => {
      const p = [[0, -h / 2], [r - c, -h / 2], [r, -h / 2 + c], [r, h / 2 - c], [r - c, h / 2], [0, h / 2]].map(([a, b]) => new T.Vector2(a, b));
      return axisRot(new T.LatheGeometry(p, seg), axis);
    }),
    // révolution : pts [[rayon, y], ...]
    lathe: (pts, seg = 24, axis = 'y', phiStart = 0, phiLen = Math.PI * 2) => cache(`lathe${JSON.stringify(pts)},${seg},${axis},${phiStart},${phiLen}`, () =>
      axisRot(new T.LatheGeometry(pts.map(([a, b]) => new T.Vector2(a, b)), seg, phiStart, phiLen), axis)),
    sphere: (r, ws = 24, hs = 16, phiS = 0, phiL = Math.PI * 2, thS = 0, thL = Math.PI) => cache(`sph${r},${ws},${hs},${phiS},${phiL},${thS},${thL}`, () => new T.SphereGeometry(r, ws, hs, phiS, phiL, thS, thL)),
    // ellipsoïde (rayons x, y, z)
    ell: (rx, ry, rz, ws = 24, hs = 16) => cache(`ell${rx},${ry},${rz},${ws},${hs}`, () => new T.SphereGeometry(1, ws, hs).scale(rx, ry, rz)),
    torus: (R, r, seg = 32, tseg = 10, arc = Math.PI * 2, axis = 'z') => cache(`tor${R},${r},${seg},${tseg},${arc},${axis}`, () => {
      const geo = new T.TorusGeometry(R, r, tseg, seg, arc); // dans le plan XY (normale Z)
      if (axis === 'x') geo.rotateY(Math.PI / 2); else if (axis === 'y') geo.rotateX(Math.PI / 2);
      return geo;
    }),
    cone: (r, h, seg = 16, axis = 'y') => cache(`cone${r},${h},${seg},${axis}`, () => axisRot(new T.ConeGeometry(r, h, seg), axis)),
    // câble/tuyau : points [[x,y,z],...]
    tube: (pts, r = 0.8, seg = 24, rseg = 6) => cache(`tube${JSON.stringify(pts)},${r},${seg},${rseg}`, () =>
      new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p => new T.Vector3(p[0], p[1], p[2]))), seg, r, rseg, false))
  };

  /* ---------------- éclairages partagés (combat + prévisualisation) ---------------- */
  const PLATES = [
    { img: 'assets/lab.jpg', name: 'LABORATOIRE NÉON', hemi: [0x7a96ff, 0x0c0d18, 0.45], key: [0xe4ecff, 1.3],
      rims: [[0x2a7bff, 1.8, [0, -0.4, -1]], [0xff2a3a, 1.2, [-1, 0.2, -0.6]], [0xff2a3a, 1.2, [1, 0.2, -0.6]]] },
    { img: 'assets/warehouse.jpg', name: 'ENTREPÔT ARCADE', hemi: [0xa8b2d8, 0x2a2024, 0.45], key: [0xfff0e2, 1.35],
      rims: [[0xff3fd2, 1.5, [1, 0.3, -0.7]], [0x29e6ff, 1.5, [-1, 0.3, -0.7]], [0xffc070, 0.4, [0, 1, 0.3]]] }
  ];

  /* ---------------- contexte de construction ---------------- */
  function makeCtx(ch, override, lod) {
    const s = ch.scale;
    const Ls = skeleton(ch, POSES.idle, 1)._L;
    const L = {}; for (const k in Ls) L[k] = Ls[k] / s;
    const reg = [], glowReg = [];
    const ctx = { T, RK: api, ch, s, b: ch.bulk, L, lod: lod || 'high', override, g, tex, D };
    ctx.mat = (p = {}) => {
      if (override) return override;
      const m = new T.MeshPhysicalMaterial(Object.assign({ color: 0xffffff, roughness: 0.4, metalness: 0, envMapIntensity: 0.5 }, p));
      reg.push(m); return m;
    };
    ctx.glow = (color, intensity = 4) => {
      if (override) return override;
      const m = new T.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity });
      m.userData.baseI = intensity; glowReg.push(m); return m;
    };
    const metal = !!ch.metal;
    ctx.M = override ? new Proxy({}, { get: () => override }) : {
      shell: metal ? ctx.mat({ color: ch.body, roughness: 0.32, metalness: 0.9, clearcoat: 0.2, clearcoatRoughness: 0.35, envMapIntensity: 0.85, roughnessMap: tex('brushed') })
        : ctx.mat({ color: ch.body, roughness: 0.26, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 0.45 }),
      satin: ctx.mat({ color: ch.body, roughness: 0.5, metalness: metal ? 0.7 : 0.05, clearcoat: 0.3, envMapIntensity: 0.4 }),
      trim: ctx.mat({ color: ch.trim, roughness: 0.34, metalness: 0.5, clearcoat: 0.6, envMapIntensity: 0.45 }),
      dark: ctx.mat({ color: ch.joint, roughness: 0.36, metalness: 0.85, envMapIntensity: 0.45 }),
      black: ctx.mat({ color: 0x0c0d10, roughness: 0.22, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 0.5 }),
      rubber: ctx.mat({ color: 0x17181b, roughness: 0.7, metalness: 0.05, envMapIntensity: 0.35 }),
      seam: ctx.mat({ color: 0x050506, roughness: 0.9, metalness: 0, envMapIntensity: 0.1 }),
      steel: ctx.mat({ color: 0xb8bec7, roughness: 0.28, metalness: 0.95, envMapIntensity: 0.9, roughnessMap: tex('brushed') }),
      chrome: ctx.mat({ color: 0xe6e9ee, roughness: 0.08, metalness: 1, envMapIntensity: 1.1 }),
      panel: ctx.mat({ color: 0x6d7178, roughness: 0.45, metalness: 0.35, clearcoat: 0.4, envMapIntensity: 0.6 }),
      white: ctx.mat({ color: 0xf0f2f5, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.45 }),
      visor: ctx.mat({ color: 0x030405, roughness: 0.03, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.2 }),
      yellow: ctx.mat({ color: 0xffc21a, roughness: 0.4 }),
      glow: ctx.glow(ch.accent, 4)
    };
    // mesh positionné : opts = { p:[x,y,z], r:[x,y,z] (radians), s:[x,y,z] | nombre, shadow:true }
    ctx.mesh = (geo, mat, o = {}) => {
      const m = new T.Mesh(geo, mat || ctx.M.shell);
      if (o.p) m.position.set(o.p[0], o.p[1], o.p[2] || 0);
      if (o.r) m.rotation.set(o.r[0] || 0, o.r[1] || 0, o.r[2] || 0);
      if (o.s != null) typeof o.s === 'number' ? m.scale.setScalar(o.s) : m.scale.set(o.s[0], o.s[1], o.s[2]);
      if (o.shadow === false) m.userData.noShadow = true;
      return m;
    };
    ctx.group = (...children) => { const gr = new T.Group(); children.forEach(c => c && gr.add(c)); return gr; };
    ctx.add = (parent, geo, mat, o) => { const m = ctx.mesh(geo, mat, o); parent.add(m); return m; };
    // maillages réels (CAO officielle, voir realData / real plus bas)
    ctx.realData = (id) => realData(id);
    ctx.realMatrix = (o) => realMatrix(o);
    ctx.real = (id, sel, mat, o = {}) => {
      const gr = new T.Group(), data = realData(id);
      if (!data) return gr;
      const M4 = realMatrix(o), test = realSel(sel);
      data.geoms.forEach((gm, gi) => {
        if (!test(gm)) return;
        const geo = realGeo(id, gi, ctx.lod === 'low', o.crease == null ? 32 : o.crease);
        const mm = typeof mat === 'function' ? mat(gm) : mat;
        if (!mm) return;
        const m = new T.Mesh(geo, mm);
        m.matrixAutoUpdate = false; m.matrix.copy(M4);
        if (o.shadow === false) m.userData.noShadow = true;
        gr.add(m);
      });
      return gr;
    };
    ctx._reg = reg; ctx._glow = glowReg;
    return ctx;
  }

  /* ---------------- maillages réels (CAO officielle) ----------------
     Fichiers js/meshes/<id>.js générés par tools/mjcf2rk.py depuis MuJoCo Menagerie :
     window.RK_MESH[id] = { bodies: {nom: [x,y,z]}, joints: {nom: {body, p, axis}}, geoms: [{name, mesh, body, rgba, tri, ...}] }
     Coordonnées : cm réels, pose de repos debout, axes du jeu (X avant, Y haut, Z côté DROIT du robot).
     ctx.real(id, sel, mat, o) → Group de meshes placés dans le repère d'une pièce :
       sel : nom de géométrie | tableau de noms | RegExp (testée sur name puis body) | fonction(geom) => bool
       mat : matériau | fonction(geom) => matériau (null = ignorer la géométrie)
       o.pivot [x,y,z] : point réel (cm) qui devient l'origine de la pièce (articulation)
       o.frame : 'body' (torse/tête/pied : axes inchangés) | 'limb' (membre qui pend : +Y le long de l'os vers
                 le bas, avant = -X ; rotation 180° autour de Z) | 'hand' (+X = vers le bas, prolongement de
                 l'avant-bras ; paume côté -Y = arrière du robot)
       o.k : échelle réel → design ; o.s [sx,sy,sz] : étirement en plus (repère de la pièce, ex. sy pour
             ajuster la longueur d'un os) ; o.r [rx,ry,rz] : rotation en plus (radians) ; o.p [x,y,z] : décalage
       o.to [x,y,z] (avec frame 'limb' ou 'hand') : l'os réel pivot → to (dans le plan XY) est aligné sur l'axe
             de la pièce (+Y pour 'limb', +X pour 'hand') ; o.len : longueur de l'os voulue (unités design),
             l'étirement le long de l'os est alors calculé automatiquement (ex. o.len = ctx.L.th)
       o.crease : angle (°) au-delà duquel une arête est vive (normales facettées), défaut 32
     ctx.realMatrix(o) → la Matrix4 correspondante (pour placer des détails procéduraux au même endroit).
     ctx.lod === 'low' utilise automatiquement le niveau simplifié. */
  const realCache = {};
  function realData(id) { return (window.RK_MESH && window.RK_MESH[id]) || null; }
  function b64buf(s) { const bin = atob(s), n = bin.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  function realGeo(id, gi, low, crease) {
    const key = `${id}|${gi}|${low ? 1 : 0}|${crease}`;
    if (realCache[key]) return realCache[key];
    const gm = realData(id).geoms[gi];
    const b = low ? gm.lb : gm.b, q = new Int16Array(b64buf(low ? gm.lv : gm.v));
    const idx = (low ? gm.li32 : gm.i32) ? new Uint32Array(b64buf(low ? gm.li : gm.i)) : new Uint16Array(b64buf(low ? gm.li : gm.i));
    const pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i += 3) for (let k = 0; k < 3; k++) pos[i + k] = b[k] + (q[i + k] + 32768) / 65535 * (b[k + 3] - b[k]);
    let geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setIndex(new T.BufferAttribute(idx, 1));
    geo = BGU.toCreasedNormals ? BGU.toCreasedNormals(geo, crease * D) : (geo.computeVertexNormals(), geo);
    geo.computeBoundingSphere();
    return (realCache[key] = geo);
  }
  function realSel(sel) {
    if (typeof sel === 'function') return sel;
    if (sel instanceof RegExp) return (gm) => sel.test(gm.name) || sel.test(gm.body);
    const list = Array.isArray(sel) ? sel : [sel];
    return (gm) => list.includes(gm.name);
  }
  const FRAMES = { body: new T.Matrix4(), limb: new T.Matrix4().makeRotationZ(Math.PI), hand: new T.Matrix4().makeRotationZ(Math.PI / 2) };
  function realMatrix(o = {}) {
    const k = o.k || 1, s = o.s || [1, 1, 1], pv = o.pivot || [0, 0, 0], p = o.p || [0, 0, 0], r = o.r || [0, 0, 0];
    const M4 = new T.Matrix4().makeTranslation(p[0], p[1], p[2]);
    M4.multiply(new T.Matrix4().makeRotationFromEuler(new T.Euler(r[0], r[1], r[2])));
    let sx = s[0], sy = s[1];
    let F = FRAMES[o.frame || 'body'] || FRAMES.body;
    if (o.to && (o.frame === 'limb' || o.frame === 'hand')) { // os réel pivot → to aligné sur l'axe de la pièce
      const dx = o.to[0] - pv[0], dy = o.to[1] - pv[1], a = Math.atan2(dy, dx), len = Math.hypot(dx, dy);
      F = new T.Matrix4().makeRotationZ(o.frame === 'limb' ? Math.PI / 2 - a : -a);
      if (o.len) { if (o.frame === 'limb') sy *= o.len / (k * len); else sx *= o.len / (k * len); }
    }
    M4.multiply(new T.Matrix4().makeScale(k * sx, k * sy, k * s[2]));
    M4.multiply(F);
    M4.multiply(new T.Matrix4().makeTranslation(-pv[0], -pv[1], -pv[2]));
    return M4;
  }

  /* ---------------- main articulée ---------------- */
  // opts : palm [long, épaisseur, largeur], fingers (nb), fLen [3 phalanges], fW, thumb, style ('human'|'gripper'|'stub'),
  //        palmMat, fingerMat, jointMat, side (+1 'f' / -1 'b')
  function hand(ctx, o = {}) {
    const T3 = T, M = ctx.M;
    const side = o.side || 1;
    const [pl, pt, pw] = o.palm || [9, 4.2, 8.5];
    const palmMat = o.palmMat || M.black, fMat = o.fingerMat || palmMat, jMat = o.jointMat || M.dark;
    const root = new T3.Group();
    // poignet + paume
    ctx.add(root, g.ccyl(pt * 0.62, 3.2, 0.6, 14, 'x'), jMat, { p: [1.2, 0, 0] });
    ctx.add(root, g.cbox(pl, pt, pw, 0.9), palmMat, { p: [2.6 + pl / 2, 0, 0] });
    const curlers = [];
    if (ctx.lod === 'low' || o.style === 'stub') {
      ctx.add(root, g.cbox(pl * 0.75, pt * 1.25, pw, 1.1), fMat, { p: [2.6 + pl + pl * 0.3, -pt * 0.25, 0] });
      root.userData.setCurl = () => {};
      return root;
    }
    if (o.style === 'gripper') { // pince à 2/3 doigts (ex. Atlas)
      const n = o.fingers || 3;
      for (let i = 0; i < n; i++) {
        const z = n === 1 ? 0 : (i / (n - 1) - 0.5) * pw * 0.75;
        const piv = new T3.Group(); piv.position.set(2.6 + pl, -pt * 0.1, z); piv.userData.noMerge = true;
        ctx.add(piv, g.cbox(6, 2.6, 2.6, 0.5), fMat, { p: [3, 0, 0] });
        const tip = new T3.Group(); tip.position.set(6, 0, 0); piv.add(tip);
        ctx.add(tip, g.cbox(4.5, 2.4, 2.4, 0.5), fMat, { p: [2.2, 0, 0] });
        root.add(piv); curlers.push({ piv, tip, k: 1 });
      }
      const th = new T3.Group(); th.position.set(2.6 + pl * 0.45, -pt * 0.5, 0); th.userData.noMerge = true;
      ctx.add(th, g.cbox(6.5, 2.6, 3, 0.5), fMat, { p: [3.2, 0, 0] }); root.add(th);
      root.userData.setCurl = (c) => { curlers.forEach(f => { f.piv.rotation.z = -(25 + 45 * c) * D; f.tip.rotation.z = -(20 + 50 * c) * D; }); th.rotation.z = (35 - 20 * c) * D; };
      root.userData.setCurl(1);
      return root;
    }
    // main humaine : 4 doigts × 3 phalanges + pouce
    const nf = o.fingers || 4, fl = o.fLen || [3.6, 2.6, 2.1], fw = o.fW || pw / nf * 0.86;
    for (let i = 0; i < nf; i++) {
      const z = ((i + 0.5) / nf - 0.5) * pw * 0.95 * side;
      const lenK = [0.94, 1, 0.97, 0.85][i % 4];
      let parent = root, x0 = 2.6 + pl;
      const segs = [];
      for (let j = 0; j < 3; j++) {
        const piv = new T3.Group(); piv.position.set(j === 0 ? x0 : fl[j - 1] * lenK, j === 0 ? 0 : 0, j === 0 ? z : 0);
        piv.userData.noMerge = true;
        const L = fl[j] * lenK;
        ctx.add(piv, g.cbox(L, pt * (0.86 - j * 0.1), fw, 0.4), fMat, { p: [L / 2, 0, 0] });
        if (j < 2) ctx.add(piv, g.cyl(pt * 0.36, pt * 0.36, fw * 1.02, 8, 'z'), jMat, { p: [L, 0, 0] });
        parent.add(piv); parent = piv; segs.push(piv);
      }
      curlers.push(segs);
    }
    // pouce
    const t0 = new T3.Group(); t0.position.set(3.4, -pt * 0.3, -side * pw * 0.42); t0.userData.noMerge = true;
    ctx.add(t0, g.cbox(4, pt * 0.8, fw * 1.1, 0.4), fMat, { p: [2, 0, 0] });
    const t1 = new T3.Group(); t1.position.set(4, 0, 0); t0.add(t1);
    ctx.add(t1, g.cbox(3.2, pt * 0.72, fw * 1.05, 0.4), fMat, { p: [1.6, 0, 0] });
    root.add(t0);
    root.userData.setCurl = (c) => {
      curlers.forEach(segs => { segs[0].rotation.z = -88 * c * D; segs[1].rotation.z = -96 * c * D; segs[2].rotation.z = -70 * c * D; });
      t0.rotation.set(-side * (20 + 30 * c) * D, side * (25 + 20 * c) * D, -(25 + 45 * c) * D);
      t1.rotation.z = -45 * c * D;
    };
    root.userData.setCurl(1);
    return root;
  }

  /* ---------------- fusion des meshes statiques (moins d'appels de rendu) ---------------- */
  const tmpM = new T.Matrix4();
  function mergePart(part) {
    part.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(part.matrixWorld).invert();
    const groups = new Map(), victims = [];
    part.traverse(o => {
      if (!o.isMesh) return;
      for (let a = o; a && a !== part; a = a.parent) if (a.userData.noMerge) return;
      let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
      if (!geo.attributes.normal) geo.computeVertexNormals();
      if (!geo.attributes.uv) geo.setAttribute('uv', new T.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      geo.clearGroups();
      tmpM.multiplyMatrices(inv, o.matrixWorld);
      geo.applyMatrix4(tmpM);
      if (tmpM.determinant() < 0) { // miroir : on inverse l'ordre des sommets
        for (const name of ['position', 'normal', 'uv']) {
          const at = geo.attributes[name], is = at.itemSize, arr = at.array;
          for (let i = 0; i < at.count; i += 3) for (let k = 0; k < is; k++) { const t = arr[(i + 1) * is + k]; arr[(i + 1) * is + k] = arr[(i + 2) * is + k]; arr[(i + 2) * is + k] = t; }
        }
      }
      const key = o.material;
      if (!groups.has(key)) groups.set(key, { list: [], shadow: !o.userData.noShadow });
      groups.get(key).list.push(geo); victims.push(o);
    });
    for (const o of victims) o.parent.remove(o);
    for (const [mat, gr] of groups) {
      const merged = gr.list.length === 1 ? gr.list[0] : BGU.mergeGeometries(gr.list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const m = new T.Mesh(merged, mat); m.userData.noShadow = !gr.shadow; part.add(m);
    }
  }

  /* ---------------- construction ---------------- */
  const REQUIRED = ['torso', 'neck', 'head'];
  for (const sd of ['f', 'b']) for (const p of ['th', 'sh', 'ua', 'fa', 'hi', 'kn', 'el', 'sc', 'ha', 'fo']) REQUIRED.push(sd + p);
  function build(ch, override, lod) {
    const ctx = makeCtx(ch, override, lod || (override ? 'low' : 'high'));
    const fn = models[ch.id] || models.default;
    let res;
    try { res = fn(ctx); }
    catch (e) { console.error('Modèle', ch.id, 'en erreur, repli sur le modèle par défaut', e); res = models.default(makeCtx(ch, override, ctx.lod)); }
    const parts = res.parts;
    for (const k of REQUIRED) if (!parts[k]) parts[k] = new T.Group();
    const root = new T.Group();
    for (const k in parts) {
      const p = parts[k];
      p.scale.multiplyScalar(ch.scale);
      mergePart(p);
      root.add(p);
    }
    root.traverse(o => { if (o.isMesh) { o.castShadow = !override && !o.userData.noShadow; o.frustumCulled = false; } });
    return { root, P: parts, ch, M: ctx.M, mats: ctx._reg, glows: ctx._glow, shZ: (res.shZ || 21) * ch.scale, hpZ: (res.hpZ || 11) * ch.scale, tick: res.tick, flashK: 0 };
  }

  /* ---------------- pose : on place chaque pièce sur le squelette ---------------- */
  const ang = (a, b) => Math.atan2(-(b.x - a.x), -(b.y - a.y)); // rotation Z qui amène +Y sur le segment a→b (repère 3D, y vers le haut)
  function setLimb(o, a, b, z) { o.position.set(a.x, -a.y, z); o.rotation.set(0, 0, ang(a, b)); }
  const UPPER = ['torso', 'neck', 'head', 'fua', 'ffa', 'fha', 'fel', 'fsc', 'bua', 'bfa', 'bha', 'bel', 'bsc'];
  const qTw = new T.Quaternion(), vTw = new T.Vector3(), yAx = new T.Vector3(0, 1, 0);
  // p.twist : rotation du haut du corps autour de l'axe vertical passant par la hanche (moteurs 360°)
  // p.headSpin : rotation de la tête sur elle-même ; z : décalage en profondeur (prises, projections)
  function pose(rb, p, x, hipY, face, yaw = -0.42, t = 0, st = '', z = 0) {
    const ch = rb.ch, P = rb.P;
    const pz = p.sx !== 1 ? Object.assign({}, p, { sx: 1 }) : p;
    const S = skeleton(ch, pz, 1);
    rb.root.position.set(x, GROUND - hipY, 0);
    rb.root.scale.set(face, 1, 1);
    rb.root.rotation.set(0, (yaw + (p.spin || 0)) * face, 0);
    const torsoA = ang(S.hip, S.neck);
    for (const [sd, z] of [['f', 1], ['b', -1]]) {
      const hz = z * rb.hpZ, sz = z * rb.shZ;
      setLimb(P[sd + 'th'], S[sd + 'hi'], S[sd + 'kn'], hz);
      setLimb(P[sd + 'sh'], S[sd + 'kn'], S[sd + 'fo'], hz);
      setLimb(P[sd + 'ua'], S[sd + 'sh'], S[sd + 'el'], sz);
      setLimb(P[sd + 'fa'], S[sd + 'el'], S[sd + 'ha'], sz);
      setLimb(P[sd + 'hi'], S[sd + 'hi'], S[sd + 'kn'], hz);
      setLimb(P[sd + 'kn'], S[sd + 'kn'], S[sd + 'fo'], hz);
      setLimb(P[sd + 'el'], S[sd + 'el'], S[sd + 'ha'], sz);
      P[sd + 'sc'].position.set(S[sd + 'sh'].x, -S[sd + 'sh'].y, sz); P[sd + 'sc'].rotation.set(0, 0, torsoA);
      // main : +X dans le prolongement de l'avant-bras
      const e = S[sd + 'el'], h = S[sd + 'ha'];
      P[sd + 'ha'].position.set(h.x, -h.y, sz);
      P[sd + 'ha'].rotation.set(0, 0, Math.atan2(-(h.y - e.y), h.x - e.x));
      if (P[sd + 'ha'].userData.setCurl) P[sd + 'ha'].userData.setCurl(p.grip == null ? 1 : p.grip);
      // pied : +X = pointe, perpendiculaire au tibia (à plat pour les genoux inversés)
      const kn = S[sd + 'kn'], fo = S[sd + 'fo'];
      let fa = Math.atan2(-(fo.y - kn.y), fo.x - kn.x) + Math.PI / 2;
      if (ch.revKnee) fa = (p.rot || 0) * -D;
      P[sd + 'fo'].position.set(fo.x, -fo.y, hz);
      P[sd + 'fo'].rotation.set(0, 0, fa);
    }
    P.torso.position.set(S.hip.x, -S.hip.y, 0); P.torso.rotation.set(0, 0, torsoA);
    setLimb(P.neck, S.neck, S.head, 0);
    P.head.position.set(S.head.x, -S.head.y, 0); P.head.rotation.set(0, 0, ang(S.neck, S.head));
    if (p.headSpin) P.head.rotateY(p.headSpin);
    if (p.twist) {
      qTw.setFromAxisAngle(yAx, p.twist);
      const hx = S.hip.x, hy = -S.hip.y;
      for (const k of UPPER) {
        const o = P[k]; vTw.set(o.position.x - hx, o.position.y - hy, o.position.z).applyQuaternion(qTw);
        o.position.set(hx + vTw.x, hy + vTw.y, vTw.z); o.quaternion.premultiply(qTw);
      }
    }
    if (z) rb.root.position.z = z;
    if (rb.tick) rb.tick(t, { pose: p, st, face });
    return S;
  }
  function setFlash(rb, k) {
    if (rb.flashK === k) return; rb.flashK = k;
    for (const m of rb.mats) if (m.emissive) m.emissive.setScalar(k);
  }
  const api = { T, g, tex, hand, models, build, pose, setFlash, PLATES, REQUIRED, realData, realMatrix };
  return api;
})();
