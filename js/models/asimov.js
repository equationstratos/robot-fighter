'use strict';
/* =========================================================
   Modèle 3D : MENLO RESEARCH ASIMOV v1 (2025-2026, humanoïde open source, CERN-OHL-S-2.0)
   Contrat : voir js/kit.js.
   Base : maillages OFFICIELS du dépôt menloresearch/asimov-1 (sim-model, js/meshes/asimov.js, normales transférées).
   Taille : le vrai robot mesure 1,2 m avec des proportions d'enfant (jambes ≈ 47 %, gros casque) ;
   la « version combat » mesure 1,85 m :
   - haut du corps à KU ≈ 1,36 (réel → conception ; × ch.scale 1,02 = × 1,39 en jeu, même taille que le T800) : axes d'épaule réels
     calés sur les épaules du squelette ; tête, cou, buste et bassin gardent leurs proportions réelles ;
   - membres ALLONGÉS par étirement « en bande » le long de l'os (warp) : seules les zones droites (tube de
     cuisse, fût du tibia, haut du bras, avant-bras) s'allongent, les carters d'articulation restent ronds ;
     jambes un peu plus épaisses (G) pour une silhouette d'adulte ; pieds rehaussés à la hauteur de cheville du jeu.
   Matières : PA12 MJF anthracite mat (reflet « sheen » doux + grain fritté), aluminium 7075 anodisé or
   (plaques d'épaule à 6 vis, étriers et disques de coude, poignets, carters de hanche, disques de genou,
   chapes de cheville), visière rectangulaire en relief + écran noir et filet LED discret, module caméra
   de poitrine (cadre, vitre, objectif, 4 vis, micros), collier de cou doré, semelles caoutchouc.
   Mains : le kit n'en a pas → mains robotiques dessinées dans le même style (paume PA12, plaque or,
   4 doigts à 3 phalanges + pouce, setCurl).
   ========================================================= */
if (typeof RK !== 'undefined' && RK) RK.models.asimov = (function () {
  const T = RK.T, BGU = T.BufferGeometryUtils, PI = Math.PI, D = PI / 180;
  const GEO = {}, PREP = {}, SPL = {}, GC = {}, TX = {};
  const SMOOTH = /hip_yaw|knee|neck_pitch|elbow_link|shoulder_roll/;   // coques de cuisse / tibia : normales recalculées (les normales transférées y marquent les défauts de décimation)
  const b64 = s => { const bin = atob(s), n = bin.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u.buffer; };

  /* ---------- décodage d'une géométrie réelle (non indexée, cm réels) ---------- */
  function decode(R, gi, low) {
    const key = gi + (low ? 'L' : 'H');
    if (GEO[key]) return GEO[key];
    const gm = R.geoms[gi], b = low ? gm.lb : gm.b, q = new Int16Array(b64(low ? gm.lv : gm.v));
    const pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i += 3) for (let k = 0; k < 3; k++) pos[i + k] = b[k] + (q[i + k] + 32768) / 65535 * (b[k + 3] - b[k]);
    const idx = (low ? gm.li32 : gm.i32) ? new Uint32Array(b64(low ? gm.li : gm.i)) : new Uint16Array(b64(low ? gm.li : gm.i));
    let geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setIndex(new T.BufferAttribute(idx, 1));
    if (!low && gm.n && !SMOOTH.test(gm.name)) {
      const n8 = new Int8Array(b64(gm.n)), nf = new Float32Array(n8.length);
      for (let i = 0; i < n8.length; i += 3) { const x = n8[i], y = n8[i + 1], z = n8[i + 2], l = Math.hypot(x, y, z) || 1; nf[i] = x / l; nf[i + 1] = y / l; nf[i + 2] = z / l; }
      geo.setAttribute('normal', new T.BufferAttribute(nf, 3));
      geo = geo.toNonIndexed();
    } else geo = BGU.toCreasedNormals(geo, (low ? 34 : 38) * D);
    return (GEO[key] = geo);
  }

  /* ---------- étirement « en bande » le long d'un os (plan XY) ----------
     w = { A:[x,y], u:[ux,uy], t1, t2, f } : les points d'abscisse t (depuis A, le long de u) dans [t1, t2]
     sont étirés d'un facteur f, ceux au-delà de t2 décalés d'autant ; les normales suivent (transposée inverse). */
  function boneWarp(A, B, extra, t1, t2) {
    const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy), u = [dx / len, dy / len];
    const f = 1 + extra / (t2 - t1);
    const w = { A, u, t1, t2, f, len, extra };
    w.key = [A[0], A[1], u[0], u[1], t1, t2, f].map(v => v.toFixed(4)).join(',');
    w.end = [A[0] + u[0] * (len + extra), A[1] + u[1] * (len + extra), B[2] || 0];
    return w;
  }
  const wpt = (w, p) => {
    if (!w) return p;
    const t = (p[0] - w.A[0]) * w.u[0] + (p[1] - w.A[1]) * w.u[1];
    const d = Math.min(Math.max(t - w.t1, 0), w.t2 - w.t1) * (w.f - 1);
    return [p[0] + w.u[0] * d, p[1] + w.u[1] * d, p[2]];
  };
  // géométrie réelle préparée : étirée (w) + UV « boîte » (grain du nylon / brossage de l'alu), en cache
  const UVS = 1 / 9;
  function prep(R, gi, low, w) {
    const key = gi + (low ? 'L' : 'H') + '|' + (w ? w.key : '');
    if (PREP[key]) return PREP[key];
    const src = decode(R, gi, low), geo = new T.BufferGeometry();
    const P = src.attributes.position.array.slice(), N = src.attributes.normal.array.slice(), n = P.length / 3;
    if (w) {
      const [ax, ay] = w.A, [ux, uy] = w.u, kf = 1 - 1 / w.f;
      for (let i = 0; i < n; i++) {
        const o = i * 3, t = (P[o] - ax) * ux + (P[o + 1] - ay) * uy;
        const d = Math.min(Math.max(t - w.t1, 0), w.t2 - w.t1) * (w.f - 1);
        P[o] += ux * d; P[o + 1] += uy * d;
        if (t > w.t1 && t < w.t2) {
          const nd = (N[o] * ux + N[o + 1] * uy) * kf;
          let nx = N[o] - nd * ux, ny = N[o + 1] - nd * uy, nz = N[o + 2];
          const l = Math.hypot(nx, ny, nz) || 1; N[o] = nx / l; N[o + 1] = ny / l; N[o + 2] = nz / l;
        }
      }
    }
    const UV = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const o = i * 3, ax = Math.abs(N[o]), ay = Math.abs(N[o + 1]), az = Math.abs(N[o + 2]);
      let a, b;
      if (ax >= ay && ax >= az) { a = P[o + 2]; b = P[o + 1]; } else if (ay >= az) { a = P[o]; b = P[o + 2]; } else { a = P[o]; b = P[o + 1]; }
      UV[i * 2] = a * UVS; UV[i * 2 + 1] = b * UVS;
    }
    geo.setAttribute('position', new T.BufferAttribute(P, 3));
    geo.setAttribute('normal', new T.BufferAttribute(N, 3));
    geo.setAttribute('uv', new T.BufferAttribute(UV, 2));
    geo.computeBoundingSphere();
    return (PREP[key] = geo);
  }
  // découpe par triangles : cls(cx, cy, cz, nx, ny, nz) -> clé (coordonnées réelles AVANT étirement)
  function split(R, gi, low, w, ck, cls) {
    const key = gi + (low ? 'L' : 'H') + '|' + (w ? w.key : '') + '|' + ck;
    if (SPL[key]) return SPL[key];
    const g0 = prep(R, gi, low, w), src = decode(R, gi, low).attributes.position.array, N = g0.attributes.normal.array;
    const P = g0.attributes.position.array, UV = g0.attributes.uv.array, nt = P.length / 9, bk = {};
    for (let t = 0; t < nt; t++) {
      const o = t * 9;
      const cx = (src[o] + src[o + 3] + src[o + 6]) / 3, cy = (src[o + 1] + src[o + 4] + src[o + 7]) / 3, cz = (src[o + 2] + src[o + 5] + src[o + 8]) / 3;
      const ax = src[o + 3] - src[o], ay = src[o + 4] - src[o + 1], az = src[o + 5] - src[o + 2];
      const bx = src[o + 6] - src[o], by = src[o + 7] - src[o + 1], bz = src[o + 8] - src[o + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1;
      const c = cls(cx, cy, cz, nx / l, ny / l, nz / l);
      if (c) (bk[c] || (bk[c] = [])).push(t);
    }
    const out = {};
    for (const c in bk) {
      const L = bk[c], p = new Float32Array(L.length * 9), nn = new Float32Array(L.length * 9), uv = new Float32Array(L.length * 6);
      L.forEach((t, i) => { p.set(P.subarray(t * 9, t * 9 + 9), i * 9); nn.set(N.subarray(t * 9, t * 9 + 9), i * 9); uv.set(UV.subarray(t * 6, t * 6 + 6), i * 6); });
      const gg = new T.BufferGeometry();
      gg.setAttribute('position', new T.BufferAttribute(p, 3)); gg.setAttribute('normal', new T.BufferAttribute(nn, 3)); gg.setAttribute('uv', new T.BufferAttribute(uv, 2));
      gg.computeBoundingSphere(); out[c] = gg;
    }
    return (SPL[key] = out);
  }
  // fusion locale de petites géométries procédurales : items = [[geo, [x,y,z], [rx,ry,rz], échelle]]
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3();
  function fuse(key, items) {
    if (GC[key]) return GC[key];
    const list = items.map(([geo, p, r, s]) => {
      const gg = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const nm of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(nm)) gg.deleteAttribute(nm);
      if (!gg.attributes.uv) gg.setAttribute('uv', new T.BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
      _m.compose(_v.set(...(p || [0, 0, 0])), _q.setFromEuler(_e.set(...(r || [0, 0, 0]))), Array.isArray(s) ? _s.set(...s) : _s.setScalar(s || 1));
      gg.applyMatrix4(_m); return gg;
    });
    return (GC[key] = BGU.mergeGeometries(list, false));
  }

  /* ---------- textures (canvas, en cache) ---------- */
  function nylonTex() { // grain fritté du PA12 MJF (rugosité : ~0.9-1.0, micro-grain + marbrures douces)
    if (TX.nylon) return TX.nylon;
    const n = 256, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const c = cv.getContext('2d'), img = c.createImageData(n, n);
    let r = 977; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    const blot = []; for (let i = 0; i < 26; i++) blot.push([rnd() * n, rnd() * n, 18 + rnd() * 40, (rnd() - 0.5) * 22]);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let v = 232 + (rnd() - 0.5) * 34;
      for (const [bx, by, br, bv] of blot) { let dx = Math.abs(x - bx), dy = Math.abs(y - by); dx = Math.min(dx, n - dx); dy = Math.min(dy, n - dy); const d = (dx * dx + dy * dy) / (br * br); if (d < 1) v += bv * (1 - d) * (1 - d); }
      const i = (y * n + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v)); img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping;
    return (TX.nylon = t);
  }
  function brushTex() { // brossage fin de l'alu anodisé (rugosité ~0.8-1.0)
    if (TX.brush) return TX.brush;
    const n = 256, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const c = cv.getContext('2d'); c.fillStyle = '#e0e0e0'; c.fillRect(0, 0, n, n);
    let r = 4242; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 900; i++) { const y = rnd() * n, gg = 190 + rnd() * 65 | 0; c.fillStyle = `rgba(${gg},${gg},${gg},${0.3 + rnd() * 0.4})`; c.fillRect(0, y, n, 0.5 + rnd() * 1.2); }
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping;
    return (TX.brush = t);
  }

  /* ---------- skins : finitions par ctx.skin (les couleurs viennent de ch.body / trim / joint / accent du skin) ----------
     pa / pa2 : coques PA12 (claire / sombre) ; gold : alu anodisé ; screw : couleur de la visserie */
  const SKINS = {
    classic: {},
    // PROTOTYPE DIY : nylon PA12 blanc brut non teinté (grain plus marqué), alu 7075 brut microbillé, visserie noire, LED cyan
    proto: { pa: { roughness: 0.68, sheen: 0.35, sheenColor: 0xffffff, envMapIntensity: 0.5 }, pa2: { roughness: 0.55 },
      gold: { roughness: 0.42, envMapIntensity: 0.9 }, screw: 0x1c1d20 },
    // HACKER : PA12 teint noir profond, alu anodisé vert « terminal », LED verte
    hacker: { pa: { roughness: 0.5, sheenColor: 0x6f8a78 }, pa2: { sheenColor: 0x4a5a50 }, gold: { roughness: 0.26, metalness: 0.92 }, screw: 0x08090a },
    // ANODISÉ COBALT : coques gris perle, accents alu anodisé bleu électrique
    cobalt: { pa: { roughness: 0.5, sheenColor: 0xe0e8f0, envMapIntensity: 0.6 }, gold: { roughness: 0.28, metalness: 0.95 }, screw: 0x15171a }
  };

  return function (ctx) {
    const R = ctx.realData('asimov');
    if (!R) return RK.models.default(ctx);
    const { g, M, L, ch } = ctx;
    const low = ctx.lod === 'low';
    const B = R.bodies, P = {};
    const GI = {}; R.geoms.forEach((gm, i) => { GI[gm.name] = i; });
    const SK = SKINS[ctx.skin] || SKINS.classic;
    const add = (parent, geo, mat, p, r, s) => ctx.add(parent, geo, mat, { p, r, s });

    /* ---------- matériaux ---------- */
    const PA = ctx.mat(Object.assign({ color: ch.body, roughness: 0.58, metalness: 0.02, sheen: 0.55, sheenRoughness: 0.4, sheenColor: 0x8a97a3,
      envMapIntensity: 0.62, roughnessMap: nylonTex() }, SK.pa || {}));                                                  // PA12 MJF anthracite
    const PA2 = ctx.mat(Object.assign({ color: ch.joint, roughness: 0.5, metalness: 0.05, sheen: 0.4, sheenRoughness: 0.45, sheenColor: 0x6d7680,
      envMapIntensity: 0.55, roughnessMap: nylonTex() }, SK.pa2 || {}));                                                 // PA12 plus sombre (cou, cadre de visière)
    const GOLD = ctx.mat(Object.assign({ color: ch.trim, roughness: 0.3, metalness: 1, envMapIntensity: 1.05, roughnessMap: brushTex() }, SK.gold || {})); // alu anodisé or
    const SCR = ctx.mat({ color: SK.screw || 0x17181b, roughness: 0.35, metalness: 0.9, envMapIntensity: 0.8 });       // vis à tête creuse
    const GLS = M.visor, RUB = M.rubber, CHR = M.chrome;
    const LED = ctx.glow(ch.accent, 3.4);
    const EYE = ctx.glow(ch.accent, 0.85);   // sous le seuil du bloom au repos (pas de halo doré sur l’écran), × 2,2 en spécial
    const VIS = ctx.mat({ color: 0x05070a, roughness: 0.5, metalness: 0, specularIntensity: 0.22, envMapIntensity: 0.12 }); // écran fumé de la visière

    /* ---------- échelles ---------- */
    const HIP = [-5.2, 58.596, 0];
    const shR = B.right_shoulder_roll_link;
    const KU = 0.86 * L.to / (shR[1] - HIP[1]);           // ≈ 1,358 : épaules réelles → épaules du squelette
    const G = 1.08, GA = 1.1;                              // épaisseur des jambes / des bras (adulte)
    const HS = 1.18;                                       // mains à l'échelle des avant-bras réels (× KU × GA)
    const NB = [HIP[0], HIP[1] + L.to / KU, 0], HB = [HIP[0], NB[1] + L.nk / KU, 0];
    const shZ = shR[2] * KU, HPZ = 11.4, hpZ = HPZ * KU;
    const realGroup = (o) => { const gr = new T.Group(); gr.matrixAutoUpdate = false; gr.matrix.copy(ctx.realMatrix(o)); return gr; };
    const DBG = !low && /dbg=1/.test(location.search);
    const DBGC = DBG ? [0xd05050, 0x50a0e0, 0x60c070, 0xe0c040, 0xb070e0, 0xe08040].map(c => ctx.mat({ color: c, roughness: 0.6 })) : null;
    // pièce réelle : names → matériau (ou découpe { cls, mats }), placée par o (+ étirement o.w)
    function real(names, mat, o) {
      const gr = ctx.group(), M4 = ctx.realMatrix(o);
      for (const nm of [].concat(names)) {
        const gi = GI[nm]; if (gi == null) continue;
        const gm = R.geoms[gi];
        if (low) {
          if (!(gm.triLow > 0)) continue;
          const mm = mat && mat.mats ? mat.mats[mat.lowKey || Object.keys(mat.mats)[0]] : mat;
          const m = new T.Mesh(prep(R, gi, true, o.w), mm); m.matrixAutoUpdate = false; m.matrix.copy(M4); gr.add(m); continue;
        }
        if (DBG) { const m = new T.Mesh(prep(R, gi, false, o.w), DBGC[gi % DBGC.length]); m.matrixAutoUpdate = false; m.matrix.copy(M4); gr.add(m); continue; }
        if (mat && mat.cls) {
          const parts = split(R, gi, false, o.w, mat.key, mat.cls);
          for (const c in parts) { const mm = mat.mats[c]; if (!mm) continue; const m = new T.Mesh(parts[c], mm); m.matrixAutoUpdate = false; m.matrix.copy(M4); gr.add(m); }
        } else { const m = new T.Mesh(prep(R, gi, false, o.w), mat); m.matrixAutoUpdate = false; m.matrix.copy(M4); gr.add(m); }
      }
      return gr;
    }

    /* ---------- petites pièces procédurales ---------- */
    const rr = (s, w, h, r) => { // rectangle arrondi centré (Shape / Path)
      const x0 = -w / 2, y0 = -h / 2; r = Math.min(r, w / 2 - 0.01, h / 2 - 0.01);
      s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.absarc(x0 + w - r, y0 + r, r, -PI / 2, 0, false);
      s.lineTo(x0 + w, y0 + h - r); s.absarc(x0 + w - r, y0 + h - r, r, 0, PI / 2, false);
      s.lineTo(x0 + r, y0 + h); s.absarc(x0 + r, y0 + h - r, r, PI / 2, PI, false);
      s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, PI, 1.5 * PI, false);
    };
    // plaque arrondie (w × h, épaisseur d) extrudée selon Z (tourner de [0, PI/2, 0] pour la poser face à +X)
    const plate = (w, h, r, d, c = 0.25) => g.shape(`asvP${w},${h},${r}`, s => rr(s, w, h, r), d, c, 6);
    const frame = (w, h, r, t, d, c = 0.2) => g.shape(`asvF${w},${h},${r},${t}`, s => { rr(s, w, h, r); const ho = new T.Path(); rr(ho, w - 2 * t, h - 2 * t, Math.max(0.2, r - t)); s.holes.push(ho); }, d, c, 6);
    const screws = (key, pts, r = 0.32, h = 0.35, ax = 'x') => fuse('asvS' + key, pts.map(p => [g.cyl(r, r, h, 6, ax), p]));
    const FY = [0, PI / 2, 0];

    /* =====================================================
       TORSE : buste (coque PA12), bassin, collier de cou doré, module caméra
       ===================================================== */
    const TO = { pivot: HIP, k: KU };
    const torso = ctx.group(real('waist_yaw_link_visual', PA, TO), real('pelvis_visual', PA, TO));
    if (!low && !DBG) {
      const tg = realGroup(TO); torso.add(tg);
      // collier doré à la base du cou
      add(tg, g.torus(3.55, 0.42, 24, 5, 2 * PI, 'y'), GOLD, [-6.86, 108.25, 0]);
      add(tg, g.cyl(3.5, 3.5, 0.5, 30), GOLD, [-6.86, 108.0, 0]);
      // module caméra / haut-parleur (cadre arrondi incliné comme la poitrine)
      const cam = ctx.group(); cam.position.set(3.45, 94.6, 0); cam.rotation.z = 0.44; tg.add(cam);
      add(cam, plate(8.4, 4.8, 1.2, 1.2, 0.3), PA2, [0.15, 0, 0], FY);
      add(cam, frame(8.4, 4.8, 1.2, 0.6, 0.5, 0.15), PA2, [0.78, 0, 0], FY);
      add(cam, plate(7.2, 3.6, 0.7, 0.3, 0.1), GLS, [0.62, 0, 0], FY);
      add(cam, g.cyl(1.15, 1.25, 0.5, 24, 'x'), SCR, [0.85, 0, -1.1]);
      add(cam, g.cyl(0.66, 0.66, 0.3, 20, 'x'), GLS, [1.05, 0, -1.1]);
      add(cam, g.torus(0.88, 0.12, 24, 5, 2 * PI, 'x'), CHR, [1.07, 0, -1.1]);
      add(cam, g.cyl(0.16, 0.16, 0.2, 8, 'x'), LED, [0.98, -1.0, 2.6]);
      add(cam, screws('cam', [[0.95, 1.85, 3.65], [0.95, 1.85, -3.65], [0.95, -1.85, 3.65], [0.95, -1.85, -3.65]], 0.2, 0.3), SCR);
      // micros (2 trous sous le module)
      add(tg, screws('mic', [[4.62, 89.6, 0], [4.85, 87.4, 0]], 0.24, 0.6), GLS);
    }
    P.torso = torso;

    /* ---------- cou + tête (casque, visière en relief, écran, filet LED) ---------- */
    P.neck = real('neck_yaw_link_visual', PA2, { pivot: NB, k: KU });
    {
      const HO = { pivot: HB, k: KU };
      const h = ctx.group(real('neck_pitch_link_visual', PA, HO));
      if (!low && !DBG) {
        const hg = realGroup(HO); h.add(hg);
        // visière : bloc arrondi en relief + écran noir en retrait + filet lumineux
        add(hg, plate(10.6, 6.2, 1.8, 2.0, 0.55), PA2, [3.35, 117.0, 0], FY);
        add(hg, plate(9.0, 4.6, 1.1, 0.3, 0.1), VIS, [4.28, 117.0, 0], FY);
        add(hg, g.box(0.1, 0.22, 5.6), EYE, [4.45, 117.25, 0]);
      }
      P.head = h;
    }

    /* =====================================================
       BRAS
       ===================================================== */
    for (const [sd, s, z] of [['f', 'right', 1], ['b', 'left', -1]]) {
      const sh = B[s + '_shoulder_roll_link'], el = B[s + '_elbow_link'], wr = B[s + '_wrist_yaw_link'];
      // épaule : palier sombre fixé au buste ; la plaque or (lien de TANGAGE réel) tourne avec le bras (voir ua)
      const sc = ctx.group();
      if (!low && !DBG) {
        const sg = realGroup({ pivot: sh, k: KU }); sc.add(sg);
        add(sg, g.ccyl(3.3, 1.6, 0.4, 24, 'z'), PA2, [sh[0], sh[1], z * 8.9]);
      }
      P[sd + 'sc'] = sc;
      // bras : plaque d'épaule or (tangage, 6 vis) + carter d'épaule rond + fût (étiré) + étrier de coude
      const UA_W = boneWarp(sh, el, L.ua / KU - (sh[1] - el[1]), 5.2, 12.2);
      const UA_O = { pivot: sh, to: UA_W.end, frame: 'limb', k: KU, s: [GA, 1, GA], w: UA_W };
      const PT_O = { pivot: sh, to: UA_W.end, frame: 'limb', k: KU };
      const zc = sh[2];
      const clevis = { key: 'clv', cls: (x, y, zz) => (y < 80.6 && Math.abs(zz - zc) > 2.25) ? 'g' : 'p', mats: { p: PA, g: GOLD }, lowKey: 'p' };
      const ua = ctx.group(real(s + '_shoulder_pitch_link_visual', GOLD, PT_O), real(s + '_shoulder_roll_link_visual', PA, UA_O), real(s + '_shoulder_yaw_link_visual', clevis, UA_O));
      if (!low && !DBG) {
        const pg = realGroup(PT_O); ua.add(pg);
        const zz = [14.4, 16.4, 18.4].map(v => v * z);
        add(pg, screws('shf' + z, [95.3, 97.9].flatMap(y => zz.map(q => [-3.42, y, q]))), SCR);
        const ag = realGroup(UA_O); ua.add(ag);
        const yr = wpt(UA_W, [0, 81.0, 0])[1];
        add(ag, g.torus(3.42, 0.24, 24, 4, 2 * PI, 'y'), GOLD, [sh[0], yr, zc]);
      }
      P[sd + 'ua'] = ua;
      // coude : disques or sur l'axe
      const FA_W = boneWarp(el, wr, L.fa / KU - Math.hypot(wr[0] - el[0], wr[1] - el[1]), 4.6, 8.2);
      const FA_O = { pivot: el, to: FA_W.end, frame: 'limb', k: KU, s: [GA, 1, GA], w: FA_W };
      const elb = ctx.group();
      if (!low && !DBG) {
        const eg = realGroup({ pivot: el, to: wr, frame: 'limb', k: KU, s: [GA, 1, GA] }); elb.add(eg);
        for (const sg of [1, -1]) add(eg, g.ccyl(2.75, 0.7, 0.2, 24, 'z'), GOLD, [el[0], el[1], el[2] + sg * 3.55]);
      }
      P[sd + 'el'] = elb;
      P[sd + 'fa'] = ctx.group(real(s + '_elbow_link_visual', PA, FA_O), real(s + '_wrist_yaw_link_visual', GOLD, FA_O));
      P[sd + 'ha'] = /nohand=1/.test(location.search) ? ctx.group() : hand(z);
    }

    /* =====================================================
       JAMBES
       ===================================================== */
    for (const [sd, s, z] of [['f', 'right', 1], ['b', 'left', -1]]) {
      const hp = [HIP[0], HIP[1], z * HPZ], k0 = B[s + '_knee_link'], a0 = B[s + '_ankle_pitch_link'];
      const kn = [k0[0], k0[1], z * HPZ], an = [a0[0], a0[1], z * HPZ];
      const HI_O = { pivot: hp, to: kn, frame: 'limb', k: KU, s: [G, 1, G] };
      const hipC = { key: 'hipc', cls: (x, y, zz, nx, ny, nz) => (Math.abs(nz) > 0.8 && Math.abs(zz) > 13.5) ? 'g' : 'p', mats: { p: PA2, g: GOLD }, lowKey: 'p' };
      P[sd + 'hi'] = ctx.group(real(s + '_hip_pitch_link_visual', hipC, HI_O), real(s + '_hip_roll_link_visual', PA2, HI_O));
      const TH_W = boneWarp(hp, kn, L.th / KU - Math.hypot(kn[0] - hp[0], kn[1] - hp[1]), 7.0, 19.0);
      P[sd + 'th'] = real(s + '_hip_yaw_link_visual', PA, { pivot: hp, to: TH_W.end, frame: 'limb', k: KU, s: [G, 1, G], w: TH_W });
      const kng = ctx.group();
      if (!low && !DBG) {
        const kg = realGroup({ pivot: kn, to: an, frame: 'limb', k: KU, s: [G, 1, G] }); kng.add(kg);
        for (const sg of [1, -1]) {
          const zf = z * HPZ + sg * 5.35;
          add(kg, g.torus(3.0, 0.32, 24, 4, 2 * PI, 'z'), GOLD, [k0[0], k0[1], zf]);
          add(kg, g.ccyl(1.5, 0.5, 0.15, 16, 'z'), GOLD, [k0[0], k0[1], zf]);
        }
      }
      P[sd + 'kn'] = kng;
      const SH_W = boneWarp(kn, an, L.sh / KU - Math.hypot(an[0] - kn[0], an[1] - kn[1]), 6.0, 21.0);
      P[sd + 'sh'] = real(s + '_knee_link_visual', PA, { pivot: kn, to: SH_W.end, frame: 'limb', k: KU, s: [G, 1, G], w: SH_W });
      const FO_O = { pivot: an, k: KU, s: [G, 7 / (KU * (a0[1] + 0.2)), G] };
      const sole = { key: 'sole', cls: (x, y, zz, nx, ny) => (y < 0.9 && ny < -0.5) ? 's' : 'f', mats: { f: PA, s: RUB } };
      P[sd + 'fo'] = ctx.group(real(s + '_ankle_pitch_link_visual', GOLD, FO_O), real(s + '_ankle_roll_link_visual', sole, FO_O));
    }

    /* =====================================================
       MAIN (le kit Asimov n'en a pas) : poignet or, paume PA12 + plaque or, 4 doigts × 3 phalanges + pouce
       repère : origine = poignet, +X = prolongement de l'avant-bras, paume côté -Y, side = +1 ('f') / -1 ('b')
       ===================================================== */
    function hand(side) {
      const root0 = ctx.group(), root = ctx.group(); root.scale.setScalar(HS); root0.add(root);
      if (low) { add(root, g.cbox(11.5, 4.6, 7.6, 1.2), PA, [6.0, -0.4, 0]); root0.userData.setCurl = () => {}; return root0; }
      const PX = 2.9, PL = 6.8, PW = 7.6, PT = 3.6;
      // poignet : flasque or + manchon sombre
      add(root, g.ccyl(2.9, 1.1, 0.3, 24, 'x'), GOLD, [0.6, 0, 0]);
      add(root, g.ccyl(2.35, 1.7, 0.3, 20, 'x'), PA2, [1.9, 0, 0]);
      // paume : coque PA12 arrondie, dos en creux sombre + liseré or, coussinet caoutchouc
      add(root, g.rbox(PL, PT, PW, 1.1, 2), PA, [PX + PL / 2, 0, 0]);
      add(root, g.cbox(PL - 2.6, 0.4, PW - 2.8, 0.15), PA2, [PX + PL / 2 - 0.2, PT / 2 + 0.02, 0]);
      add(root, g.cbox(0.5, 0.42, PW - 2.0, 0.12), GOLD, [PX + PL - 1.0, PT / 2 + 0.04, 0]);
      add(root, g.cbox(PL - 1.6, 0.4, PW - 1.6, 0.15), RUB, [PX + PL / 2 + 0.3, -PT / 2 - 0.05, 0]);
      add(root, g.cyl(1.0, 1.0, PW - 0.7, 14, 'z'), PA2, [PX + PL - 0.15, 0.15, 0]);
      const FL = [3.1, 2.3, 1.95], FW = 1.66, FT = 2.05;
      const phal = (Lp, t, w, tip) => fuse(`asvPh${Lp},${t},${w},${tip}`, [
        [g.cbox(Lp, t, w, 0.42), [Lp / 2, 0, 0]],
        [g.cyl(t * 0.5, t * 0.5, w * 0.92, 7, 'z'), [0, 0, 0]],
        ...(tip ? [[g.cyl(t * 0.5, t * 0.5, w * 0.9, 7, 'z'), [Lp, -0.02, 0]]] : [])
      ]);
      const fingers = [];
      for (let i = 0; i < 4; i++) {
        const zz = ((i + 0.5) / 4 - 0.5) * (PW - 1.3) * side, kk = [0.93, 1, 0.97, 0.85][i];
        let parent = root; const segs = [];
        for (let j = 0; j < 3; j++) {
          const piv = ctx.group(); piv.userData.noMerge = true;
          if (j === 0) piv.position.set(PX + PL + 0.15, 0, zz); else piv.position.set(+(FL[j - 1] * kk).toFixed(2), 0, 0);
          const Lp = +(FL[j] * kk).toFixed(2);
          add(piv, phal(Lp, FT - j * 0.12, FW, j === 2), j === 1 ? PA2 : PA);
          if (j === 2) add(piv, g.cbox(1.2, 0.42, FW * 0.8, 0.12), RUB, [Lp - 0.5, -(FT - 0.24) / 2, 0]);
          parent.add(piv); parent = piv; segs.push(piv);
        }
        fingers.push(segs);
      }
      // pouce (2 phalanges) sur rotule or
      const t0 = ctx.group(); t0.position.set(PX + 1.3, -1.5, -side * 3.0); t0.userData.noMerge = true;
      add(t0, g.sphere(1.25, 10, 7), GOLD, [0, 0, 0]);
      add(t0, phal(3.3, 2.15, 1.9, false), PA);
      const t1 = ctx.group(); t1.position.set(3.3, 0, 0); t0.add(t1);
      add(t1, phal(2.6, 2.0, 1.8, true), PA2);
      add(t1, g.cbox(1.2, 0.42, 1.5, 0.12), RUB, [2.0, -0.85, 0]);
      root.add(t0);
      const XV = new T.Vector3(1, 0, 0), dOpen = new T.Vector3(0.8, -0.3, -side * 0.52).normalize(), dShut = new T.Vector3(0.84, -0.36, side * 0.42).normalize(), dv = new T.Vector3();
      root0.userData.setCurl = c => {
        for (const sg of fingers) { sg[0].rotation.z = -(6 + 84 * c) * D; sg[1].rotation.z = -(8 + 94 * c) * D; sg[2].rotation.z = -(6 + 60 * c) * D; }
        dv.copy(dOpen).lerp(dShut, c).normalize();
        t0.quaternion.setFromUnitVectors(XV, dv);
        t1.rotation.z = -(6 + 20 * c) * D; t1.rotation.y = side * 18 * c * D;
      };
      root0.userData.setCurl(1);
      return root0;
    }

    const tick = ctx.override ? undefined : (t, state) => {
      const sup = state && (state.st === 'super' || state.st === 'special');
      LED.emissiveIntensity = LED.userData.baseI * ((sup ? 1.6 : 0.8) + 0.2 * Math.sin(t * 2.3));
      EYE.emissiveIntensity = EYE.userData.baseI * ((sup ? 2.2 : 1) + 0.12 * Math.sin(t * 1.7));
    };
    return { parts: P, shZ, hpZ, tick };
  };
})();
