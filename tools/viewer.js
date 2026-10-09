'use strict';
/* Prévisualisation d'un modèle de robot : planche de vues + rapport technique.
   Paramètres d'URL :
     id=optimus|atlas|...            robot
     view=sheet (défaut) | custom     planche complète ou vue unique
     plate=lab|warehouse|studio       décor de la vue principale / vue custom
     pose=idle|hp|hk|lk|lp|crouch|proj|upper|win|taunt|block|hit|jump|chk|rush|down …  (+clé:valeur pour modifier, ex. pose=win+axf:1.2+kyf:0.8)
     yaw=<radians>                    (custom) orientation : -0.42 = vue de combat, -1.57 = face, 0 = profil
     frame=full|head|hand|torso|legs|feet  (custom) cadrage
     w=, h=                            (custom) taille de l'image
     skin=<id>                         skin du robot (ROSTER[].skins), ex. skin=carbon */
(function () {
  const T = THREE;
  const Q = new URLSearchParams(location.search);
  const id = Q.get('id') || 'optimus';
  const view = Q.get('view') || 'sheet';
  const ch0 = ROSTER.find(r => r.id === id);
  const ch = Q.get('skin') ? withSkin(ch0, Q.get('skin')) : ch0;
  const out = document.getElementById('out');
  const errors = window.__errors || [];
  const report = { id, view, errors };
  window.__report = report;
  if (!ch) { errors.push('robot inconnu: ' + id); window.__ready = true; return; }

  const OW = view === 'custom' ? +(Q.get('w') || 900) : 1600, OH = view === 'custom' ? +(Q.get('h') || 900) : 900;
  out.width = OW; out.height = OH;
  const o2 = out.getContext('2d');
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(OW, OH, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.NoToneMapping; renderer.autoClear = false;
  const pmrem = new T.PMREMGenerator(renderer);
  const roomEnv = pmrem.fromScene(new T.RoomEnvironment(), 0.04).texture;

  // pose=nom[+clé:valeur...] : pose de POSES avec des clés remplacées (ex. win+axf:1.2+axb:1.2+twist:0.5)
  const poseOf = n => {
    const [nm, ...kv] = String(n).split('+');
    const p = { ...(POSES[nm] || POSES.idle) };
    for (const e of kv) { const [k, v] = e.split(':'); if (k in p) p[k] = +v; }
    p.sx = Math.cos(p.spin || 0);
    return p;
  };
  const place = (rb, p, yaw, t = 1) => { const S = skeleton(ch, p, 1); RK.pose(rb, p, 0, GROUND - S._low, 1, yaw, t, 'idle'); return S; };

  /* ---------- scènes ---------- */
  function lightsStudio(sc) {
    sc.add(new T.HemisphereLight(0xc8d4ff, 0x202028, 1.0));
    const k = new T.DirectionalLight(0xffffff, 2.2); k.position.set(-300, 500, 600); k.castShadow = true;
    k.shadow.mapSize.set(1024, 1024); Object.assign(k.shadow.camera, { left: -200, right: 200, top: 300, bottom: -50, near: 10, far: 2500 }); k.shadow.bias = -0.0005;
    sc.add(k);
    const r1 = new T.DirectionalLight(ch.accent, 2.6); r1.position.set(400, 200, -500); sc.add(r1);
    const r2 = new T.DirectionalLight(0x6fb8ff, 1.3); r2.position.set(-500, 100, -300); sc.add(r2);
  }
  function lightsPlate(sc, cfg) {
    const hemi = new T.HemisphereLight(cfg.hemi[0], cfg.hemi[1], cfg.hemi[2]); sc.add(hemi);
    const key = new T.DirectionalLight(cfg.key[0], cfg.key[1]); key.position.set(-260, 900, 520); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -300, right: 300, top: 400, bottom: -60, near: 10, far: 3000 }); key.shadow.bias = -0.0005; key.shadow.normalBias = 1.5;
    sc.add(key);
    for (const r of cfg.rims) { const l = new T.DirectionalLight(r[0], r[1]); l.position.set(r[2][0] * 600, 200 + r[2][1] * 600, r[2][2] * 600); l.target.position.set(0, 120, 0); sc.add(l); sc.add(l.target); }
  }
  function floor(sc, op = 0.5) { const f = new T.Mesh(new T.PlaneGeometry(4000, 4000), new T.ShadowMaterial({ opacity: op })); f.rotation.x = -Math.PI / 2; f.receiveShadow = true; sc.add(f); }

  const plateName = Q.get('plate') || (ch.stage === 1 ? 'warehouse' : 'lab');
  const plateIdx = plateName === 'lab' ? 0 : plateName === 'warehouse' ? 1 : -1;

  function makePlateScene(rb, done) {
    const sc = new T.Scene();
    if (plateIdx < 0) { lightsStudio(sc); sc.environment = roomEnv; floor(sc); sc.add(rb.root); sc.background = new T.Color(0x1a1d24); done(sc); return; }
    const cfg = RK.PLATES[plateIdx];
    lightsPlate(sc, cfg); floor(sc, 0.55); sc.add(rb.root);
    new T.TextureLoader().load('../' + cfg.img, tx => {
      tx.colorSpace = T.SRGBColorSpace;
      try { sc.environment = pmrem.fromEquirectangular(tx).texture; } catch (e) { sc.environment = roomEnv; }
      const pl = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: tx, toneMapped: false }));
      pl.scale.set(3800, 3800 / 2.56, 1); pl.position.set(0, 260, -1500); sc.add(pl);
      done(sc);
    }, undefined, () => { errors.push('décor introuvable'); sc.environment = roomEnv; done(sc); });
  }
  const studio = new T.Scene(); lightsStudio(studio); studio.environment = roomEnv; floor(studio, 0.4);

  /* ---------- construction + rapport ---------- */
  const t0 = performance.now();
  let rbA, rbB, rbLow;
  try {
    rbA = RK.build(ch); rbB = RK.build(ch);
    rbLow = RK.build(ch, new T.MeshBasicMaterial({ color: ch.accent, transparent: true, opacity: 0.5 }));
  } catch (e) { errors.push('build: ' + e.message + '\n' + e.stack); window.__ready = true; return; }
  report.buildMs = Math.round((performance.now() - t0) / 3);
  report.customModel = !!RK.models[id];
  const stats = rb => {
    let meshes = 0, tris = 0, dyn = 0, unreg = 0;
    const known = new Set([...(rb.mats || []), ...(rb.glows || [])]);
    rb.root.traverse(o => {
      if (!o.isMesh) return; meshes++;
      const gg = o.geometry; tris += (gg.index ? gg.index.count : gg.attributes.position.count) / 3;
      for (let a = o; a; a = a.parent) if (a.userData && a.userData.noMerge) { dyn++; break; }
      if (!known.has(o.material) && !(o.material && o.material.isMeshBasicMaterial)) unreg++;
    });
    return { meshesAfterMerge: meshes, triangles: Math.round(tris), dynamicMeshes: dyn, unregisteredMaterials: unreg };
  };
  report.high = stats(rbA); report.low = stats(rbLow);
  report.emptyParts = RK.REQUIRED.filter(k => { let n = 0; rbA.P[k].traverse(o => { if (o.isMesh) n++; }); return n === 0; });
  // géométrie en pose de garde
  place(rbA, POSES.idle, -0.42);
  rbA.root.updateMatrixWorld(true);
  const bb = new T.Box3().setFromObject(rbA.root);
  const fb = new T.Box3(); fb.union(new T.Box3().setFromObject(rbA.P.ffo)); fb.union(new T.Box3().setFromObject(rbA.P.bfo));
  const hb = new T.Box3().setFromObject(rbA.P.head);
  report.idle = { height: +bb.max.y.toFixed(1), lowestY: +bb.min.y.toFixed(1), feetLowestY: +fb.min.y.toFixed(1), headTop: +hb.max.y.toFixed(1),
    widthX: +(bb.max.x - bb.min.x).toFixed(1), depthZ: +(bb.max.z - bb.min.z).toFixed(1) };
  // debout, jambes tendues, buste droit : hauteur réelle (sommet de la tête) et part des jambes (hanche / hauteur)
  {
    const ps = mkPose({}); place(rbA, ps, -Math.PI / 2); rbA.root.updateMatrixWorld(true);
    const hs = new T.Box3().setFromObject(rbA.P.head), hipY = new T.Vector3().setFromMatrixPosition(rbA.P.torso.matrixWorld).y;
    report.stand = { height: +new T.Box3().setFromObject(rbA.root).max.y.toFixed(1), headTop: +hs.max.y.toFixed(1), hipY: +hipY.toFixed(1), legPct: +(100 * hipY / hs.max.y).toFixed(1) };
  }
  // continuité des membres (en repère local de la pièce, unités design)
  const Ld = {}; { const Ls = skeleton(ch, POSES.idle, 1)._L; for (const k in Ls) Ld[k] = Ls[k] / ch.scale; }
  report.limbs = {};
  for (const [k, len] of [['fth', Ld.th], ['fsh', Ld.sh], ['fua', Ld.ua], ['ffa', Ld.fa], ['neck', Ld.nk]]) {
    const p = rbA.P[k]; const sv = p.matrix.clone(); const pos = p.position.clone(), rot = p.rotation.clone(), scl = p.scale.clone();
    p.position.set(0, 0, 0); p.rotation.set(0, 0, 0); p.scale.set(1, 1, 1); p.updateMatrixWorld(true);
    const lb = new T.Box3();
    p.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); lb.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld.clone().premultiply(new T.Matrix4().copy(p.parent.matrixWorld).invert()))); } });
    p.position.copy(pos); p.rotation.copy(rot); p.scale.copy(scl); p.updateMatrixWorld(true);
    report.limbs[k] = { boneLen: +len.toFixed(1), yMin: +lb.min.y.toFixed(1), yMax: +lb.max.y.toFixed(1), thickX: +(lb.max.x - lb.min.x).toFixed(1), thickZ: +(lb.max.z - lb.min.z).toFixed(1),
      ok: lb.max.y > len * 0.75 && lb.max.y < len * 1.35 && lb.min.y > -len * 0.4 };
  }
  report.warnings = [];
  if (report.emptyParts.length) report.warnings.push('pièces vides: ' + report.emptyParts.join(','));
  if (Math.abs(report.idle.feetLowestY) > 4) report.warnings.push(`les pieds ne touchent pas le sol (y min = ${report.idle.feetLowestY}, attendu ≈ 0)`);
  if (report.high.triangles > 50000) report.warnings.push('trop de triangles');
  if (report.high.unregisteredMaterials) report.warnings.push('matériaux créés hors ctx.mat/ctx.M/ctx.glow');
  if (report.low.meshesAfterMerge > 40) report.warnings.push('LOD low trop lourd');
  for (const k in report.limbs) if (!report.limbs[k].ok) report.warnings.push(`membre ${k} : longueur/origine incohérente avec l'os`);

  /* ---------- rendu ---------- */
  const labels = [];
  function shot(sc, cam, x, y, w, h, label) {
    renderer.setViewport(x, OH - y - h, w, h); renderer.setScissor(x, OH - y - h, w, h); renderer.setScissorTest(true);
    renderer.render(sc, cam);
    if (label) labels.push([label, x, y]);
  }
  function camFor(target, size, w, h, yawCam = 0, fov = 26, tilt = 0.05) {
    const cam = new T.PerspectiveCamera(fov, w / h, 1, 8000);
    const d = (size / 2) / Math.tan(fov / 2 * Math.PI / 180) * 1.05;
    cam.position.set(target.x + Math.sin(yawCam) * d, target.y + d * tilt, target.z + Math.cos(yawCam) * d);
    cam.lookAt(target); return cam;
  }
  const wpos = (rb, k) => { rb.root.updateMatrixWorld(true); return new T.Vector3().setFromMatrixPosition(rb.P[k].matrixWorld); };
  function frameTarget(rb, frame) {
    const sz = { full: 230, head: 62, hand: 34, torso: 120, legs: 130, feet: 60 }[frame] || 230;
    let tg;
    if (frame === 'head') tg = wpos(rb, 'head');
    else if (frame === 'hand') { const a = wpos(rb, 'fha'); const m = new T.Vector3(); rb.P.fha.localToWorld(m.set(8, 0, 0)); tg = m; }
    else if (frame === 'torso') { const m = new T.Vector3(); rb.P.torso.localToWorld(m.set(0, 40, 0)); tg = m; }
    else if (frame === 'legs') tg = new T.Vector3(0, 50, 0);
    else if (frame === 'feet') tg = wpos(rb, 'ffo').add(new T.Vector3(6, 0, 0));
    else tg = new T.Vector3(0, 100, 0);
    return { tg, sz: sz * ch.scale };
  }

  function finish() {
    renderer.setScissorTest(false);
    o2.fillStyle = '#111318'; o2.fillRect(0, 0, OW, OH);
    o2.drawImage(renderer.domElement, 0, 0);
    o2.font = 'bold 15px sans-serif'; o2.textBaseline = 'top';
    for (const [t, x, y] of labels) { o2.fillStyle = 'rgba(0,0,0,.6)'; o2.fillRect(x + 4, y + 4, o2.measureText(t).width + 10, 20); o2.fillStyle = '#ffd23a'; o2.fillText(t, x + 9, y + 6); }
    if (view === 'sheet') {
      o2.fillStyle = 'rgba(0,0,0,.65)'; o2.fillRect(0, OH - 26, 700, 26); o2.fillStyle = '#9be7ff'; o2.font = '13px monospace';
      o2.fillText(`${ch.name}  meshes ${report.high.meshesAfterMerge}  tris ${report.high.triangles}  low ${report.low.meshesAfterMerge}/${report.low.triangles}  warn ${report.warnings.length}`, 8, OH - 21);
    }
    report.drawCalls = renderer.info.render.calls;
    window.__ready = true;
  }

  if (view === 'custom') {
    const pose = poseOf(Q.get('pose') || 'idle'), yaw = +(Q.get('yaw') ?? -0.42), frame = Q.get('frame') || 'full';
    makePlateScene(rbA, sc => {
      renderer.setClearColor(0x1a1d24, 1); renderer.clear();
      place(rbA, pose, yaw);
      const { tg, sz } = frameTarget(rbA, frame);
      shot(sc, camFor(tg, sz, OW, OH, 0, frame === 'full' ? 28 : 22, frame === 'full' ? 0.1 : 0.04), 0, 0, OW, OH, `${ch.name} · ${Q.get('pose') || 'idle'} · ${frame}`);
      finish();
    });
    return;
  }
  // planche : vue principale (décor) + grille 3×3 (studio)
  makePlateScene(rbA, sc => {
    renderer.setClearColor(0x1a1d24, 1); renderer.clear();
    place(rbA, POSES.idle, -0.42);
    const cA = new T.PerspectiveCamera(28, 700 / 900, 5, 9000);
    cA.position.set(0, 130, 640); cA.lookAt(0, 105, 0);
    shot(sc, cA, 0, 0, 700, 900, `EN JEU · ${plateIdx < 0 ? 'studio' : RK.PLATES[plateIdx].name} · garde`);
    studio.add(rbB.root);
    const cells = [
      ['FACE', 'idle', -Math.PI / 2, 'full'], ['PROFIL', 'idle', 0, 'full'], ['DOS 3/4', 'idle', 2.3, 'full'],
      ['POING FORT', 'hp', -0.42, 'full'], ['PIED FORT', 'hk', -0.42, 'full'], ['ACCROUPI', 'crouch', -0.42, 'full'],
      ['TÊTE 3/4', 'idle', -0.42, 'head'], ['TÊTE FACE', 'idle', -Math.PI / 2 + 0.2, 'head'], ['MAIN (poing)', 'lp', -0.25, 'hand']
    ];
    cells.forEach(([lab, pn, yaw, frame], i) => {
      const x = 700 + (i % 3) * 300, y = ((i / 3) | 0) * 300;
      place(rbB, poseOf(pn), yaw);
      const { tg, sz } = frameTarget(rbB, frame);
      renderer.setScissorTest(true); renderer.setViewport(x, OH - y - 300, 300, 300); renderer.setScissor(x, OH - y - 300, 300, 300);
      renderer.setClearColor(i % 2 ? 0x22262f : 0x1d2028, 1); renderer.clear();
      shot(studio, camFor(tg, sz, 300, 300, 0, frame === 'full' ? 28 : 22, frame === 'full' ? 0.12 : 0.05), x, y, 300, 300, lab);
    });
    finish();
  });
})();
