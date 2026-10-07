'use strict';
/* =========================================================
   RENDU 3D TEMPS RÉEL (Three.js)
   - robots en 3D (plastique brillant, métal, visières, LED)
   - décors réels extraits des vidéos d'intro
   - ombres, lumières néon, éclairage dynamique des coups, bloom
   Si WebGL n'est pas disponible, le jeu retombe sur le rendu 2D.
   ========================================================= */
const R3 = (function () {
  const T = window.THREE;
  if (!T || typeof RK === 'undefined' || !RK) return null;
  let fightR, studioR;
  try {
    fightR = new T.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, powerPreference: 'high-performance' });
    studioR = new T.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) { console.warn('WebGL indisponible, rendu 2D', e); return null; }

  const UP = new T.Vector3(0, 1, 0), DIR = new T.Vector3();
  const ZOOM = 1.7, GY = 500, PY = 248, FOV = 28;
  const HF = 2 * Math.max(PY, H - PY);
  const TANH = Math.tan(FOV / 2 * D2R);
  const PLATES = RK.PLATES;
  const buildRobot = (ch, override) => RK.build(ch, override);
  const poseRobot = RK.pose, setFlash = RK.setFlash;

  /* ---------------- environnement (reflets) ---------------- */
  function envFor(r) { const pm = new T.PMREMGenerator(r); const t = pm.fromScene(new T.RoomEnvironment(), 0.04).texture; pm.dispose(); return t; }

  /* =========================================================
     SCÈNE DE COMBAT
     ========================================================= */
  fightR.shadowMap.enabled = true;
  fightR.shadowMap.type = T.PCFSoftShadowMap;
  fightR.toneMapping = T.NoToneMapping;
  const scene = new T.Scene();
  scene.environment = envFor(fightR);
  const camera = new T.PerspectiveCamera(FOV, W / HF, 5, 20000);
  camera.setViewOffset(W, HF, 0, HF / 2 - PY, W, H);
  const D0 = (HF / 2) / (ZOOM * TANH), DP = D0 * 2.5;
  const loader = new T.TextureLoader();
  const pmrem = new T.PMREMGenerator(fightR);
  const roomEnv = scene.environment, plateEnv = [];
  // reflets : la photo du décor sert aussi de carte d'environnement (néons reflétés sur les robots)
  const plateTex = PLATES.map((p, i) => { const t = loader.load(p.img, tx => { try { plateEnv[i] = pmrem.fromEquirectangular(tx).texture; if (curStage === i) scene.environment = plateEnv[i]; } catch (e) { } }); t.colorSpace = T.SRGBColorSpace; return t; });
  const plateMat = new T.MeshBasicMaterial({ map: plateTex[0], toneMapped: false });
  const plate = new T.Mesh(new T.PlaneGeometry(1, 1), plateMat);
  {
    const Ld = D0 + DP, k = 2 * Ld * TANH / HF, camY0 = (GY - PY) / ZOOM;
    const ph = 540 * k * 1.22, pw = ph * (1280 / 500);
    plate.scale.set(pw, ph, 1);
    plate.position.set(STAGE_W / 2, camY0 + (PY - 270) * k - 540 * k * 0.06, -DP);
  }
  plate.renderOrder = -2;
  scene.add(plate);
  // reflets des robots sur le sol brillant : robots en miroir rendus à part puis ajoutés au sol
  const reflRT = new T.WebGLRenderTarget(480, 270);
  const reflMat = new T.ShaderMaterial({
    uniforms: { map: { value: reflRT.texture }, opacity: { value: 0.3 }, ground: { value: 0.1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform float opacity; uniform float ground; varying vec2 vUv; void main(){ float d = ground - vUv.y; if (d < 0.0) discard; vec4 c = texture2D(map, vUv); float f = opacity * c.a * (1.0 - clamp(d / 0.42, 0.0, 1.0)); gl_FragColor = vec4(c.rgb * f, 1.0); }',
    depthTest: false, depthWrite: false, blending: T.AdditiveBlending, transparent: false
  });
  const reflQuad = new T.Mesh(new T.PlaneGeometry(2, 2), reflMat);
  reflQuad.frustumCulled = false; reflQuad.renderOrder = -1; scene.add(reflQuad);
  const REFL_OP = [0.6, 0.32];
  const floor = new T.Mesh(new T.PlaneGeometry(6000, 3000), new T.ShadowMaterial({ opacity: 0.55 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const hemi = new T.HemisphereLight(0xffffff, 0x222222, 1); scene.add(hemi);
  const key = new T.DirectionalLight(0xffffff, 2);
  key.castShadow = true; key.shadow.mapSize.set(2048, 1024);
  Object.assign(key.shadow.camera, { left: -700, right: 700, top: 500, bottom: -60, near: 10, far: 3000 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 1.5; key.shadow.radius = 4;
  scene.add(key); scene.add(key.target);
  const rims = [0, 1, 2].map(() => { const l = new T.DirectionalLight(0xffffff, 1); scene.add(l); scene.add(l.target); return l; });
  const fxLights = [0, 1, 2, 3].map(() => { const l = new T.PointLight(0xffffff, 0, 420, 1.6); scene.add(l); return l; });

  const composer = new T.EffectComposer(fightR);
  composer.addPass(new T.RenderPass(scene, camera));
  const bloom = new T.UnrealBloomPass(new T.Vector2(480, 270), 0.5, 0.4, 1.0);
  composer.addPass(bloom);
  composer.addPass(new T.OutputPass());

  let curStage = -1, sizeKey = '';
  // qualité adaptative : 0 = maximale, 1 = intermédiaire, 2 = économique (mobiles lents)
  const QS = [{ res: 1, bloom: true, shadow: [2048, 1024], refl: 0.5 }, { res: 0.8, bloom: true, shadow: [1024, 512], refl: 0.33 }, { res: 0.62, bloom: false, shadow: [512, 256], refl: 0 }];
  const qParam = new URLSearchParams(location.search).get('q');
  let quality = qParam != null ? clamp(+qParam | 0, 0, 2) : 0, qLocked = qParam != null, ema = 16, emaN = 0, slowN = 0;
  function setQuality(q) {
    quality = q; sizeKey = '';
    bloom.enabled = QS[q].bloom;
    key.shadow.mapSize.set(QS[q].shadow[0], QS[q].shadow[1]);
    if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
  }
  // appelé à chaque image pendant les combats avec la durée de l'image (ms)
  function perfTick(dt) {
    if (qLocked || dt > 250) return;
    ema += (dt - ema) * 0.05; emaN++;
    if (emaN > 90 && ema > 27 && quality < 2) { slowN++; if (slowN > 60) { setQuality(quality + 1); slowN = 0; emaN = 0; ema = 16; } }
    else slowN = 0;
  }
  function setStage(i) {
    if (i === curStage) return; curStage = i;
    const c = PLATES[i];
    plateMat.map = plateTex[i]; plateMat.needsUpdate = true;
    scene.environment = plateEnv[i] || roomEnv;
    hemi.color.set(c.hemi[0]); hemi.groundColor.set(c.hemi[1]); hemi.intensity = c.hemi[2];
    key.color.set(c.key[0]); key.intensity = c.key[1];
    rims.forEach((l, j) => { const r = c.rims[j]; l.color.set(r[0]); l.intensity = r[1]; l.userData.dir = r[2]; });
  }
  function resize() {
    const w = Math.round(Math.min(canvas.width, isTouch ? 1100 : 1920) * QS[quality].res), h = Math.round(w * H / W);
    const kk = w + 'x' + h; if (kk === sizeKey) return; sizeKey = kk;
    fightR.setPixelRatio(1); fightR.setSize(w, h, false); composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    const rr = QS[quality].refl;
    if (rr) reflRT.setSize(Math.max(2, Math.round(w * rr)), Math.max(2, Math.round(h * rr)));
  }
  setQuality(quality);
  const pv = new T.Vector3();
  const fighterModels = new Map(); // fighter -> {rb, ghosts[]}
  const ghostMat = {};
  function modelFor(f) {
    let m = fighterModels.get(f);
    if (m && m.ch === f.ch) return m;
    if (m) { scene.remove(m.rb.root); m.ghosts.forEach(g => scene.remove(g.root)); }
    const gmat = () => new T.MeshBasicMaterial({ color: f.ch.accent, transparent: true, opacity: 0.3, blending: T.AdditiveBlending, depthWrite: false });
    m = { ch: f.ch, rb: buildRobot(f.ch), ghosts: [0, 1, 2, 3, 4].map(() => { const gm = gmat(); const r = buildRobot(f.ch, gm); r.gm = gm; return r; }) };
    scene.add(m.rb.root); m.ghosts.forEach(g => { g.root.visible = false; scene.add(g.root); });
    fighterModels.set(f, m);
    return m;
  }
  function clearFight(keep) {
    for (const [f, m] of fighterModels) if (!keep.includes(f)) { scene.remove(m.rb.root); m.ghosts.forEach(g => scene.remove(g.root)); fighterModels.delete(f); }
  }

  function renderFight(F, v) {
    resize(); setStage(F.stageIdx);
    clearFight(F.p);
    const d = (HF / 2) / (v.Z * TANH), camY = (GY - PY) / v.Z;
    camera.position.set(v.cx, camY, d); camera.quaternion.identity();
    if (v.orbit || v.roll || v.lift) { // caméra cinématique : rotation autour du point d'intérêt
      const f3 = new T.Vector3(v.fx, GROUND - v.fy, 0);
      const q = new T.Quaternion().setFromEuler(new T.Euler(-(v.lift || 0), v.orbit || 0, v.roll || 0, 'YXZ'));
      camera.position.sub(f3).applyQuaternion(q).add(f3);
      camera.quaternion.copy(q);
    }
    camera.updateMatrixWorld(true);
    // lumières
    key.position.set(v.cx - 260, 900, 520); key.target.position.set(v.cx, 0, 0);
    rims.forEach(l => { const dd = l.userData.dir || [0, 1, 0]; l.position.set(v.cx + dd[0] * 600, 200 + dd[1] * 600, dd[2] * 600); l.target.position.set(v.cx, 120, 0); });
    const dim = F.superFreeze > 0 ? 1 - 0.7 * Math.min(1, (62 - F.superFreeze) / 8) : 1;
    plateMat.color.setScalar(dim);
    hemi.intensity = PLATES[curStage].hemi[2] * (0.5 + 0.5 * dim);
    // robots
    let li = 0;
    const light = (x, y, col, I) => { if (li >= fxLights.length) return; const l = fxLights[li++]; l.position.set(x, GROUND - y, 60); l.color.set(col); l.intensity = I; };
    for (const f of F.p) {
      const m = modelFor(f);
      poseRobot(m.rb, f.pose, f.x, f.hipY, f.face, -0.42, F.frame / 60, f.st);
      setFlash(m.rb, f.flash > 0 ? 0.9 : (f.meter >= 100 && F.frame % 20 < 10 && f.st !== 'super') ? 0.12 : 0);
      m.ghosts.forEach((g, i) => {
        const gh = f.ghosts[f.ghosts.length - 1 - i];
        g.root.visible = !!gh;
        if (gh) { poseRobot(g, gh.pose, gh.x, gh.hy, gh.face); g.gm.opacity = gh.a * 0.45; }
      });
      if (f.st === 'super' || (F.superFreeze > 0 && F.superBy === f)) { const hp = f.wp('fha'); light(hp.x, hp.y, f.ch.accent, 2.5e4); }
      else if (f.st === 'special' && f.ghostOn) { const hp = f.wp(f.sp === 'flip' || f.sp === 'spin' ? 'ffo' : 'fha'); light(hp.x, hp.y, f.ch.accent, 1.8e4); }
      if (f.beam) light(f.beam.x + f.face * 160, f.beam.y, f.ch.accent, 6e4);
    }
    for (const pr of F.projs) light(pr.x, pr.y, pr.col, 2.2e4);
    for (; li < fxLights.length; li++) fxLights[li].intensity = 0;
    // passe de reflet
    const rq = QS[quality].refl;
    reflQuad.visible = !!rq;
    if (rq) {
      const roots = [];
      for (const m of fighterModels.values()) { roots.push(m.rb.root); m.ghosts.forEach(g => g.root.visible && roots.push(g.root)); }
      plate.visible = false; floor.visible = false; reflQuad.visible = false;
      roots.forEach(r => { r.position.y = -r.position.y; r.scale.y = -r.scale.y; });
      fightR.shadowMap.autoUpdate = false;
      fightR.setRenderTarget(reflRT); fightR.setClearColor(0x000000, 0); fightR.clear(); fightR.render(scene, camera); fightR.setRenderTarget(null);
      fightR.shadowMap.autoUpdate = true;
      roots.forEach(r => { r.position.y = -r.position.y; r.scale.y = -r.scale.y; });
      plate.visible = true; floor.visible = true; reflQuad.visible = true;
      pv.set(v.cx, 0, 0).project(camera);
      reflMat.uniforms.ground.value = (pv.y + 1) / 2;
      reflMat.uniforms.opacity.value = REFL_OP[curStage] * dim;
    }
    composer.render();
    return fightR.domElement;
  }
  // projection jeu → écran (pour aligner les effets 2D sur la 3D, même caméra inclinée)
  function project(x, y) { pv.set(x, GROUND - y, 0).project(camera); return { x: (pv.x + 1) / 2 * W, y: (1 - pv.y) / 2 * H }; }
  function overlay(v) {
    const fx = v.fx != null ? v.fx : v.cx, fy = v.fy != null ? v.fy : GROUND - 100;
    const p0 = project(fx, fy), p1 = project(fx + 100, fy), p2 = project(fx, fy + 100);
    const a = (p1.x - p0.x) / 100, b = (p1.y - p0.y) / 100, c2 = (p2.x - p0.x) / 100, d2 = (p2.y - p0.y) / 100;
    return [a, b, c2, d2, p0.x - a * fx - c2 * fy, p0.y - b * fx - d2 * fy];
  }

  /* =========================================================
     STUDIO : rendus de robots pour les menus (sélection, VS, portraits)
     ========================================================= */
  studioR.toneMapping = T.NoToneMapping;
  studioR.setPixelRatio(1); studioR.setSize(640, 640, false);
  const sScene = new T.Scene();
  sScene.environment = envFor(studioR);
  const sCam = new T.OrthographicCamera(-150, 150, 150, -150, -2000, 2000);
  sCam.position.set(0, 0, 800);
  sScene.add(new T.HemisphereLight(0xc8d4ff, 0x202028, 1.1));
  const sKey = new T.DirectionalLight(0xffffff, 2.4); sKey.position.set(-300, 500, 600); sScene.add(sKey);
  const sRim = new T.DirectionalLight(0xffffff, 3); sRim.position.set(400, 200, -500); sScene.add(sRim);
  const sRim2 = new T.DirectionalLight(0x6fb8ff, 1.4); sRim2.position.set(-500, 100, -300); sScene.add(sRim2);
  const studioModels = {};
  function studio(ch, pose, face, frame, opts = {}) {
    let rb = studioModels[ch.id];
    if (!rb) { rb = studioModels[ch.id] = buildRobot(ch); sScene.add(rb.root); }
    for (const id in studioModels) studioModels[id].root.visible = id === ch.id;
    const S = skeleton(ch, pose.sx !== 1 ? Object.assign({}, pose, { sx: 1 }) : pose, 1);
    poseRobot(rb, pose, 0, GROUND - S._low, face, opts.yaw == null ? -0.42 : opts.yaw, performance.now() / 1000, opts.st || 'idle');
    setFlash(rb, 0);
    sRim.color.set(ch.accent);
    const hs = frame.size / 2;
    Object.assign(sCam, { left: frame.cx - hs, right: frame.cx + hs, top: frame.cy + hs, bottom: frame.cy - hs });
    sCam.updateProjectionMatrix();
    studioR.setClearColor(0x000000, 0); studioR.clear();
    studioR.render(sScene, sCam);
    return studioR.domElement;
  }
  // robot entier : pieds à footY, échelle = pixels par unité de jeu
  function drawFull(c, ch, pose, x, footY, face, scale, opts) {
    const img = studio(ch, pose, face, { cx: 0, cy: 125, size: 300 }, opts);
    c.drawImage(img, x - 150 * scale, footY - 275 * scale, 300 * scale, 300 * scale);
  }
  function headShot(ch, size, face = 1, zoom = 1) {
    const pose = mkPose({ ...POSES.idle, lean: 2, hd: -4 });
    const S = skeleton(ch, pose, 1);
    const hy = S._low - S.head.y, hx = S.head.x * 0.91 * face;
    const img = studio(ch, pose, face, { cx: hx - face * 4, cy: hy - 12 * ch.scale, size: 92 * ch.scale / zoom });
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    cv.getContext('2d').drawImage(img, 0, 0, size, size);
    return cv;
  }

  // gros plan sur le visage (bandeau SUPER)
  function drawHead(c, ch, x, y, size, face, yaw = -1.0) {
    const pose = mkPose({ ...POSES.idle, lean: 2, hd: -6 });
    const S = skeleton(ch, pose, 1);
    const hy = S._low - S.head.y, hx = S.head.x * Math.cos(yaw) * face;
    const img = studio(ch, pose, face, { cx: hx, cy: hy - 2 * ch.scale, size: 64 * ch.scale }, { yaw, st: 'super' });
    c.drawImage(img, x - size / 2, y - size / 2, size, size);
  }
  return { ZOOM, GY, PLATES, renderFight, drawFull, headShot, drawHead, poseRobot, project, overlay, perfTick, setQuality, get quality() { return quality; } };
})();

const ZOOM = R3 ? R3.ZOOM : 1;
const VIEW_W = W / ZOOM;
const GY = R3 ? R3.GY : GROUND;
// dessine un robot entier (3D si possible, sinon 2D)
function drawRobotAny(c, ch, pose, x, footY, face, scale, opts) {
  if (R3) return R3.drawFull(c, ch, pose, x, footY, face, scale, opts);
  const sk = skeleton(ch, pose, face, scale);
  drawRobot(c, ch, pose, x, footY - sk._low, face, scale);
}
