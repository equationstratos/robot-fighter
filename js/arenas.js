'use strict';
/* =========================================================
   ARÈNES
   - 'plate' : décor photographique tiré des vidéos d'intro (assets/*.jpg), ombres sur un sol invisible.
   - '3d'    : décor 3D temps réel (js/arenas/<id>.js), vraie profondeur quand la caméra cinématique tourne.
   ROSTER[i].stage = arène « à domicile » du robot (index dans ARENAS) : utilisée en arcade et en tournoi.
   d2 = décor 2D de repli (STAGES, stages.js) quand WebGL n'est pas disponible.

   ---------------------------------------------------------
   CONTRAT D'UN MODULE D'ARÈNE 3D  (js/arenas/<id>.js)
   ---------------------------------------------------------
   ARENA3D.<id> = {
     light: {
       hemi: [ciel, sol, intensité], key: [couleur, intensité], keyPos?: [dx, y, z] (position de la lumière
       principale qui projette l'ombre des robots, relative au centre de la caméra ; défaut [-260, 900, 520]),
       rims: [[couleur, intensité, [dx, dy, dz]] ×3] (contre-jours colorés), fog?: { color, near, far } | { color, density },
       bg: couleur de fond (ciel au-delà de tout), refl: 0..0.7 (reflet des robots sur un sol mouillé/brillant),
       catcher?: 0..1 (ombre portée sur un sol invisible si le décor n'a pas de sol qui reçoit les ombres),
       dim?: assombrissement du décor pendant la cinématique d'un SUPER (défaut 0.72),
       env?: 'scene' (défaut : reflets = le décor lui-même, rendu en cubemap) | 'room' (studio neutre)
     },
     track?: { bpm, root, prog, bass, lead, drums } — musique propre (format de TRACKS, core.js), sinon ARENAS[i].track,
     build(S) → { root: Object3D, update?(t, info) }
   }
   REPÈRE DU JEU : 1 unité ≈ 1 cm. Sol à y = 0, +Y vers le haut, X = axe du combat (0..STAGE_W = 1300, les robots
   restent entre x ≈ 40 et 1260, sur z ≈ 0 ± 60), +Z vers la caméra. Caméra : z ≈ 690, hauteur ≈ 150, champ vertical
   28°, elle suit le combat de x ≈ 280 à 1020 (largeur visible au niveau des robots ≈ 565) ; en SUPER / projection /
   K.O. elle tourne jusqu'à ±0,13 rad autour des robots et zoome ×1,24 ; plan lointain 20 000.
   → Rien entre la caméra et les robots (z de 60 à 700) qui puisse masquer le combat ; le sol doit couvrir au moins
     x -3000..4300, z -6000..900 ; décor lointain jusqu'à z ≈ -15000 (brouillard pour la profondeur).
   S (outils) : voir makeArenaCtx ci-dessous — matériaux (S.mat / S.phys / S.basic / S.glow), géométries RK.g (S.g),
     textures dessinées (S.canvasTex), fusion des meshes statiques par matériau (S.merge), instances (S.instanced),
     particules animées sur GPU (S.particles : pluie, neige, poussière, braises, étincelles), S.rng, S.onUpdate.
   RÈGLES : ≤ 200 000 triangles, ≤ 60 appels de rendu après fusion (fusionner les éléments statiques), textures
     ≤ 2048², pas de nouvelles lumières sauf ≤ 2 PointLight/SpotLight vraiment utiles ; les meshes du décor reçoivent
     les ombres des robots (receiveShadow) mais n'en projettent pas (sauf userData.castShadow = true, à éviter).
     Aucune allocation par image dans update(). info = { t, dt, F (combat ou null), cx (centre caméra), dim (0..1),
     ko (true pendant un K.O.), superBy (combattant en SUPER ou null), camera }.
   ========================================================= */
const ARENA3D = {};
const ARENAS = [
  { id: 'lab', name: 'LABORATOIRE NÉON', kind: 'plate', plate: 0, d2: 0, track: 's0', place: 'INTÉRIEUR', desc: 'Le labo où tout a commencé.' },
  { id: 'warehouse', name: 'ENTREPÔT ARCADE', kind: 'plate', plate: 1, d2: 1, track: 's1', place: 'INTÉRIEUR', desc: 'Bornes d\'arcade et néons roses.' },
  { id: 'tokyo', name: 'TOIT DE NÉO-TOKYO', kind: '3d', d2: 2, track: 's2', place: 'EXTÉRIEUR · NUIT', desc: 'Pluie, enseignes et gratte-ciel.' },
  { id: 'desert', name: 'TERRAIN D\'ESSAI', kind: '3d', d2: 3, track: 's3', place: 'EXTÉRIEUR · CRÉPUSCULE', desc: 'Piste d\'essai des robots, en plein désert.' },
  { id: 'launchpad', name: 'PAS DE TIR', kind: '3d', d2: 3, track: 's3', place: 'EXTÉRIEUR · AUBE', desc: 'Au pied d\'une fusée prête au décollage.' },
  { id: 'wall', name: 'GRANDE MURAILLE', kind: '3d', d2: 2, track: 's2', place: 'EXTÉRIEUR · NEIGE', desc: 'Sur les remparts, sous la neige.' },
  { id: 'stadium', name: 'ARÈNE MONDIALE', kind: '3d', d2: 1, track: 's1', place: 'STADE · FINALE', desc: 'La finale, devant 80 000 fans.' }
];
const ARENA_STADIUM = 6; // finale du tournoi
function arenaTrack(a) { const d = ARENA3D[a.id]; return (d && d.track) || TRACKS[a.track] || TRACKS.s0; }
function arenaIndex(id) { const i = ARENAS.findIndex(a => a.id === id); return i < 0 ? 0 : i; }

/* ---------------- outils de construction (S) ---------------- */
function makeArenaCtx(T, opts = {}) {
  const updates = [];
  const S = {
    T, g: RK.g, tex: RK.tex, quality: opts.quality || 0, STAGE_W, D: Math.PI / 180,
    cam: { z: 690, y: 150, fov: 28, zoom: 1.7, xMin: 280, xMax: 1020, viewW: 565 },
    // éclairé, PBR standard (le plus courant)
    mat: (p = {}) => new T.MeshStandardMaterial(Object.assign({ color: 0x808080, roughness: 0.7, metalness: 0, envMapIntensity: 0.6 }, p)),
    // éclairé avec vernis (sols mouillés, carrosseries, verre)
    phys: (p = {}) => new T.MeshPhysicalMaterial(Object.assign({ color: 0x808080, roughness: 0.4, metalness: 0, envMapIntensity: 0.8 }, p)),
    // non éclairé (ciel, silhouettes lointaines, écrans) — prend le brouillard
    basic: (p = {}) => new T.MeshBasicMaterial(Object.assign({ color: 0xffffff }, p)),
    // néon / lumière : couleur > 1 → halo (bloom) ; non éclairé, pas de brouillard par défaut
    glow: (color, I = 3, p = {}) => { const m = new T.MeshBasicMaterial(Object.assign({ color, fog: false, toneMapped: false }, p)); m.color.multiplyScalar(I); m.userData.glowI = I; return m; },
    mesh: (geo, mat, o = {}) => {
      const m = new T.Mesh(geo, mat);
      if (o.p) m.position.set(o.p[0], o.p[1], o.p[2] || 0);
      if (o.r) m.rotation.set(o.r[0] || 0, o.r[1] || 0, o.r[2] || 0);
      if (o.s != null) typeof o.s === 'number' ? m.scale.setScalar(o.s) : m.scale.set(o.s[0], o.s[1], o.s[2]);
      return m;
    },
    group: (...ch) => { const g = new T.Group(); ch.forEach(c => c && g.add(c)); return g; },
    add: (parent, geo, mat, o) => { const m = S.mesh(geo, mat, o); parent.add(m); return m; },
    rng: (seed = 1) => { let r = seed >>> 0 || 1; return () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296); },
    // texture dessinée sur un canvas : draw(c, w, h) ; o = { repeat:[x,y], srgb:true, aniso:4, mip:true }
    canvasTex: (w, h, draw, o = {}) => {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      draw(cv.getContext('2d'), w, h);
      const t = new T.CanvasTexture(cv);
      if (o.srgb !== false) t.colorSpace = T.SRGBColorSpace;
      if (o.repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
      t.anisotropy = o.aniso || 4;
      if (o.mip === false) { t.generateMipmaps = false; t.minFilter = T.LinearFilter; }
      return t;
    },
    // fusionne les meshes statiques d'un groupe par matériau (garder à part : userData.noMerge = true)
    merge: (group) => { RK.mergePart(group); return group; },
    // instances : list = [{ p, r, s }] ou Matrix4
    instanced: (geo, mat, list) => {
      const im = new T.InstancedMesh(geo, mat, list.length), m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), sc = new T.Vector3();
      list.forEach((it, i) => {
        if (it.isMatrix4) im.setMatrixAt(i, it);
        else { const s = it.s == null ? 1 : it.s; im.setMatrixAt(i, m4.compose(v.set(...(it.p || [0, 0, 0])), q.setFromEuler(e.set(...(it.r || [0, 0, 0]))), typeof s === 'number' ? sc.setScalar(s) : sc.set(...s))); }
      });
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
      return im;
    },
    onUpdate: (fn) => { updates.push(fn); },
    _updates: updates
  };
  /* particules animées sur GPU (aucun calcul CPU par image)
     o = { kind: 'rain'|'snow'|'dust'|'embers'|'sparks', count, box: [x0, x1, y0, y1, z0, z1], speed, size, color,
           opacity, wind: [vx, vz], follow: true (la boîte suit la caméra en x) } */
  S.particles = (o = {}) => {
    const kind = o.kind || 'snow', n = o.count || 2000, box = o.box || [-600, 600, 0, 900, -400, 300];
    const rnd = S.rng(o.seed || 7), pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = box[0] + rnd() * (box[1] - box[0]); pos[i * 3 + 1] = box[2] + rnd() * (box[3] - box[2]); pos[i * 3 + 2] = box[4] + rnd() * (box[5] - box[4]); seed[i] = rnd(); }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('seed', new T.BufferAttribute(seed, 1));
    const rain = kind === 'rain', up = kind === 'embers' || kind === 'sparks';
    const uni = {
      time: { value: 0 }, offX: { value: 0 }, col: { value: new T.Color(o.color || (rain ? 0x9fc4ff : kind === 'embers' ? 0xff8a2a : 0xffffff)) },
      size: { value: o.size || (rain ? 2.2 : kind === 'snow' ? 7 : 4) }, speed: { value: o.speed || (rain ? 1600 : kind === 'snow' ? 70 : 40) },
      wind: { value: new T.Vector2(...(o.wind || [rain ? -120 : 30, 0])) }, box: { value: new T.Vector3(box[1] - box[0], box[3] - box[2], box[5] - box[4]) },
      lo: { value: new T.Vector3(box[0], box[2], box[4]) }, opacity: { value: o.opacity == null ? 0.7 : o.opacity }, scaleH: { value: 540 }
    };
    const mat = new T.ShaderMaterial({
      uniforms: uni, transparent: true, depthWrite: false, blending: o.blending === 'normal' ? T.NormalBlending : T.AdditiveBlending,
      vertexShader: `uniform float time, offX, size, speed, scaleH; uniform vec2 wind; uniform vec3 box, lo; attribute float seed; varying float vA; varying float vS;
        void main(){
          vec3 p = position - lo;
          float t = time * (0.7 + 0.6 * seed);
          ${up ? 'p.y = mod(p.y + speed * t, box.y);' : 'p.y = mod(p.y - speed * t, box.y);'}
          p.x = mod(p.x + wind.x * t + ${kind === 'snow' ? 'sin(time * 0.9 + seed * 40.0) * 30.0' : '0.0'} - offX, box.x);
          p.z = mod(p.z + wind.y * t, box.z);
          vec3 w = p + lo; w.x += offX;
          vec4 mv = modelViewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = size * projectionMatrix[1][1] * scaleH * 0.5 / -mv.z;
          vS = gl_PointSize;
          vA = ${up ? '1.0 - p.y / box.y' : 'smoothstep(0.0, 0.08, p.y / box.y)'};
        }`,
      fragmentShader: `uniform vec3 col; uniform float opacity; varying float vA; varying float vS;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          ${rain ? 'float a = smoothstep(0.9 / max(vS, 1.0), 0.0, abs(c.x)) * smoothstep(0.5, 0.05, abs(c.y)) * (0.5 + 0.5 * (c.y + 0.5));' : 'float a = smoothstep(0.5, 0.15, length(c));'}
          gl_FragColor = vec4(col, a * opacity * vA);
        }`
    });
    if (rain) { // gouttes étirées : on dessine des points plus hauts que larges en jouant sur le flou vertical
      mat.vertexShader = mat.vertexShader.replace('gl_PointSize = size * projectionMatrix[1][1]', 'gl_PointSize = size * 6.0 * projectionMatrix[1][1]');
    }
    const pts = new T.Points(geo, mat);
    pts.frustumCulled = false; pts.userData.noMerge = true; pts.renderOrder = 1;
    S.onUpdate((t, info) => { uni.time.value = t; uni.scaleH.value = info.h || 540; if (o.follow !== false && info.cx != null) uni.offX.value = info.cx - (box[0] + box[1]) / 2; });
    return pts;
  };
  return S;
}
