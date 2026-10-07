'use strict';
/* =========================================================
   Modèle 3D : UNITREE H1 (2023) — maillages CAO officiels (js/meshes/h1.js, MuJoCo Menagerie, BSD-3)
   Contrat : voir js/kit.js.
   Placement : une seule échelle réel → conception (k = 0,88) pour le bassin, les hanches et les jambes
   (les os sont alignés sur le squelette par to/len) ; le coffre est légèrement tassé pour que les axes
   d'épaule réels tombent sur les épaules du squelette ; bras à 0,97 (le squelette a des bras plus longs
   que le vrai robot : l'avant-bras est découpé en tête de coude + tube, seul le tube est étiré).
   Découpe des maillages réels par triangles (helper splitGeo) :
     torso_link → coffre (noir laqué, arêtes métallisées, bac inférieur satiné), carters d'épaule (pièces
     <s>sc), béquille en A + anneau facial (cou), casque + dôme lidar + fente caméra (tête).
   Détails procéduraux placés dans l'espace réel (realGroup) : moteurs à disque nets (carter, bague usinée
   acier, couronne de vis chromées, moyeu) sur tangage/roulis de hanche, roulis/lacet d'épaule, coude,
   moteur de cheville ; chapeaux d'axe de hanche et de genou ; semelle caoutchouc ; voyant vert dans la
   fente de la caméra de profondeur ; logo « Unitree H1 » réel retourné selon le sens du combattant.
   Mains : le H1 d'origine n'en a pas (pommeau) → manchette de poignet usinée + main compacte foncée
   (paume, 4 doigts à 2 phalanges, pouce) qui se ferme en poing (userData.setCurl).
   ========================================================= */
if (typeof RK !== 'undefined' && RK) RK.models.h1 = (function () {
  const T = RK.T, BGU = T.BufferGeometryUtils, PI = Math.PI, D = PI / 180;
  const SPLIT = {}, GC = {};

  // découpe une géométrie réelle (non indexée, coordonnées réelles en cm) en classes de triangles
  // flat : faces quasi parallèles à un plan principal → normales plates (pas de traînées sur les panneaux plans décimés)
  function splitGeo(geo, cls, flat) {
    const P = geo.attributes.position.array, N = geo.attributes.normal.array, nt = P.length / 9;
    const FN = new Float32Array(nt * 3);
    const buckets = {};
    for (let t = 0; t < nt; t++) {
      const o = t * 9;
      const cx = (P[o] + P[o + 3] + P[o + 6]) / 3, cy = (P[o + 1] + P[o + 4] + P[o + 7]) / 3, cz = (P[o + 2] + P[o + 5] + P[o + 8]) / 3;
      const ax = P[o + 3] - P[o], ay = P[o + 4] - P[o + 1], az = P[o + 5] - P[o + 2];
      const bx = P[o + 6] - P[o], by = P[o + 7] - P[o + 1], bz = P[o + 8] - P[o + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl; FN[t * 3] = nx; FN[t * 3 + 1] = ny; FN[t * 3 + 2] = nz;
      const c = cls(cx, cy, cz, nx, ny, nz);
      if (!c) continue;
      (buckets[c] || (buckets[c] = [])).push(t);
    }
    const out = {};
    for (const c in buckets) {
      const list = buckets[c], pos = new Float32Array(list.length * 9), nor = new Float32Array(list.length * 9);
      list.forEach((t, i) => {
        pos.set(P.subarray(t * 9, t * 9 + 9), i * 9);
        const fx = FN[t * 3], fy = FN[t * 3 + 1], fz = FN[t * 3 + 2];
        if (flat && Math.max(Math.abs(fx), Math.abs(fy), Math.abs(fz)) > flat) for (let v = 0; v < 3; v++) { nor[i * 9 + v * 3] = fx; nor[i * 9 + v * 3 + 1] = fy; nor[i * 9 + v * 3 + 2] = fz; }
        else nor.set(N.subarray(t * 9, t * 9 + 9), i * 9);
      });
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setAttribute('normal', new T.BufferAttribute(nor, 3));
      g.computeBoundingSphere();
      out[c] = g;
    }
    return out;
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

  return function (ctx) {
    const R = ctx.realData('h1');
    if (!R) return RK.models.default(ctx);
    const { g, M, L, ch } = ctx;
    const low = ctx.lod === 'low';
    const B = R.bodies;
    const P = {};
    const add = (parent, geo, mat, p, r, s) => ctx.add(parent, geo, mat, { p, r, s });

    /* ---------- matériaux ---------- */
    const ANO = ctx.mat({ color: 0x353840, roughness: 0.5, metalness: 0.6, clearcoat: 0.35, clearcoatRoughness: 0.32, envMapIntensity: 0.75 }); // alu anodisé graphite (satiné)
    const EDG = ctx.mat({ color: 0x2a2d33, roughness: 0.22, metalness: 0.85, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.1 }); // arêtes du coffre (accrochent les liserés)
    const BLK = ctx.mat({ color: 0x16181c, roughness: 0.3, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.85 }); // coque noire laquée
    const MOT = ctx.mat({ color: 0x1b1d21, roughness: 0.4, metalness: 0.7, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.7 });  // carters moteurs
    const RIM = ctx.mat({ color: 0x5c616b, roughness: 0.26, metalness: 0.9, envMapIntensity: 1.0 });                                     // bague usinée foncée
    const ST = M.steel, CH = M.chrome, RU = M.rubber, VI = M.visor, WH = M.white;
    const LED = ctx.glow(ch.accent, 3.2);

    /* ---------- échelles (réel cm → unités de conception) ---------- */
    const k = 0.88, kA = 0.97, kF = 1.0, kH = 1.0;
    const hipP = [B.right_hip_pitch_link[0], B.right_hip_pitch_link[1], 0];
    const shR = B.right_shoulder_roll_link;
    const box0 = 106;                                        // bas du coffre (origine torso_link)
    const yBox = (box0 - hipP[1]) * k;                       // bas du coffre dans le repère du torse
    const sy = (0.86 * L.to - yBox) / (k * (shR[1] - box0)); // tassement du coffre : épaules réelles → épaules du squelette
    const yTop = yBox + (153.5 - box0) * k * sy;             // dessus du coffre
    const NB = [0, 153.5 + (L.to - yTop) / kH, 0];           // point réel placé à la base du cou
    const HB = [0, NB[1] + L.nk / kH, 0];                    // point réel placé au centre de la tête
    const shZ = shR[2] * k, hpZ = B.right_hip_pitch_link[2] * k;

    const TORSO_O = { pivot: [0, box0, 0], k, s: [1, sy, 1], p: [0, yBox, 0], flat: 0.996 };
    const NECK_O = { pivot: NB, k: kH, crease: 50 }, HEAD_O = { pivot: HB, k: kH, crease: 50 };

    // groupe dont le repère local = espace réel (cm), placé comme ctx.real(…, o)
    const realGroup = (o) => { const gr = new T.Group(); gr.matrixAutoUpdate = false; gr.matrix.copy(ctx.realMatrix(o)); return gr; };
    // pièce réelle découpée en matériaux : cls(cx,cy,cz,nx,ny,nz) -> clé ; mats : clé -> matériau
    const realSplit = (name, key, cls, mats, o) => {
      const src = ctx.real('h1', name, ANO, o);
      const m0 = src.children[0];
      if (!m0) return src;
      const ck = name + '|' + ctx.lod + '|' + key + '|' + (o.crease || 32) + '|' + (o.flat || 0);
      const parts = SPLIT[ck] || (SPLIT[ck] = splitGeo(m0.geometry, cls, o.flat));
      const gr = ctx.group();
      for (const c in parts) {
        const mt = mats[c]; if (!mt) continue;
        const m = new T.Mesh(parts[c], mt); m.matrixAutoUpdate = false; m.matrix.copy(m0.matrix); gr.add(m);
      }
      return gr;
    };

    // pièce réelle d'un seul matériau, normales plates sur les faces planes
    const ONE = () => 'a';
    const realPart = (names, mat, o) => {
      const gr = ctx.group();
      for (const n of [].concat(names)) gr.add(realSplit(n, 'one', ONE, { a: mat }, Object.assign({ flat: 0.997 }, o)));
      return gr;
    };

    /* ---------- moteur à disque (coordonnées réelles) ----------
       c : centre ; ax : axe 'x'|'y'|'z' ; r : rayon ; a0..a1 : étendue le long de l'axe ;
       faces : [-1] / [1] / [-1, 1] = faces usinées visibles ; o.n : nb de vis ; o.body : matériau du carter */
    const AXI = { x: 0, y: 1, z: 2 };
    const ROT_FLIP = { x: [0, 0, PI], y: [PI, 0, 0], z: [PI, 0, 0] };
    const faceGeo = (r, ax) => g.lathe([[r * 0.47, 0.32], [r * 0.5, 0], [r * 0.92, 0], [r * 0.92, 0.18], [r * 0.85, 0.36], [r * 0.5, 0.36]], 28, ax);
    function motor(gr, c, ax, r, a0, a1, faces, o = {}) {
      const i = AXI[ax], len = a1 - a0;
      const at = (a) => { const p = c.slice(); p[i] = a; return p; };
      if (o.body !== null) add(gr, g.ccyl(r, len, Math.min(0.45, r * 0.08), 28, ax), o.body || MOT, at((a0 + a1) / 2));
      for (const sg of faces) {
        const af = sg > 0 ? a1 : a0, rot = sg > 0 ? [0, 0, 0] : ROT_FLIP[ax];
        add(gr, faceGeo(r, ax), o.ring || ST, at(af), rot);
        if (o.n !== 0) add(gr, boltRing(o.n || 6, +(r * 0.69).toFixed(2), 0.27, 0.55, ax), CH, at(af), rot);
        add(gr, g.cyl(r * 0.47, r * 0.47, 0.5, 20, ax), o.hub || RIM, at(af));
        add(gr, g.cyl(r * 0.17, r * 0.17, 1.0, 10, ax), CH, at(af));
      }
    }
    const boltRing = (n, Rr, r, h, ax) => fuse(`h1bolts${n},${Rr},${r},${h},${ax}`, Array.from({ length: n }, (_, i) => {
      const a = (i + 0.5) / n * 2 * PI, p = [0, 0, 0];
      const o = [0, 1, 2].filter(j => j !== AXI[ax]);
      p[o[0]] = Math.cos(a) * Rr; p[o[1]] = Math.sin(a) * Rr; p[AXI[ax]] = h / 2;
      return [g.cyl(r, r, h, 5, ax), p];
    }));

    /* ---------- main : manchette de poignet + paume + 4 doigts articulés + pouce (main compacte foncée) ----------
       repère : origine = poignet, +X = prolongement de l'avant-bras, paume côté -Y, side = +1 ('f') / -1 ('b') */
    const FL = [3.7, 3.0], FW = 1.62, FT = 2.15, PX = 3.6, PL = 6.4, PW = 7.0;
    const phal = (Lp, t, w, tip) => fuse(`h1phal${Lp},${t},${w},${tip}`, [
      [g.cbox(Lp, t, w, 0.38), [Lp / 2, 0, 0]],
      [g.cyl(t * 0.5, t * 0.5, w * 0.96, 10, 'z'), [0, 0, 0]],
      ...(tip ? [[g.cyl(t * 0.5, t * 0.5, w * 0.92, 10, 'z'), [Lp, -0.02, 0]]] : [])
    ]);
    const XV = new T.Vector3(1, 0, 0);
    function h1Hand(side) {
      const root = ctx.group();
      if (low) { add(root, g.cbox(11, 4.8, 7.2, 1.2), ANO, [5.5, -0.5, 0]); root.userData.setCurl = () => {}; return root; }
      // manchette : cône foncé + bague usinée + flasque
      add(root, g.lathe([[0, -3.2], [2.35, -3.2], [2.75, -1.2], [2.95, 0.6], [2.95, 1.6], [0, 1.6]], 24, 'x'), MOT, [0, 0, 0]);
      add(root, g.cyl(3.05, 3.05, 0.9, 28, 'x'), ST, [2.0, 0, 0]);
      add(root, g.ccyl(2.75, 1.2, 0.3, 24, 'x'), RIM, [3.0, 0, 0]);
      // paume + dos de main laqué + coussinet
      add(root, g.cbox(PL, 3.6, PW, 0.8), ANO, [PX + PL / 2, -0.2, 0]);
      add(root, g.cbox(PL - 1.2, 0.7, PW - 1.4, 0.28), BLK, [PX + PL / 2 - 0.2, 1.75, 0]);
      add(root, g.cbox(PL - 1.6, 0.5, PW - 1.6, 0.2), RU, [PX + PL / 2 + 0.2, -2.05, 0]);
      add(root, fuse('h1knuck', [0, 1, 2, 3].map(i => [g.cyl(1.05, 1.05, 1.5, 10, 'z'), [PX + PL + 0.2, 0.15, ((i + 0.5) / 4 - 0.5) * 6.7]])), RIM);
      const fingers = [];
      for (let i = 0; i < 4; i++) {
        const zz = ((i + 0.5) / 4 - 0.5) * 6.7 * side, kk = [0.94, 1, 0.97, 0.86][i];
        let parent = root; const segs = [];
        for (let j = 0; j < 2; j++) {
          const piv = ctx.group(); piv.userData.noMerge = true;
          if (j === 0) piv.position.set(PX + PL + 0.4, 0, zz); else piv.position.set(+(FL[0] * kk).toFixed(2), 0, 0);
          const Lp = +(FL[j] * kk).toFixed(2);
          add(piv, phal(Lp, FT - j * 0.15, FW, j === 1), j ? BLK : ANO);
          if (j === 1) add(piv, g.cbox(1.4, 0.5, FW * 0.82, 0.15), RU, [Lp - 0.6, -0.95, 0]);
          parent.add(piv); parent = piv; segs.push(piv);
        }
        fingers.push(segs);
      }
      // pouce : la direction passe de « ouvert » (vers l'avant, écarté) à « fermé » (en travers devant les doigts)
      const t0 = ctx.group(); t0.position.set(PX + 1.6, -1.7, -side * 3.2); t0.userData.noMerge = true;
      add(t0, phal(3.6, 2.2, 1.9, false), ANO);
      const t1 = ctx.group(); t1.position.set(3.6, 0, 0); t0.add(t1);
      add(t1, phal(2.8, 2.0, 1.8, true), BLK);
      root.add(t0);
      const dOpen = new T.Vector3(0.8, -0.3, -side * 0.52).normalize(), dShut = new T.Vector3(0.86, -0.3, side * 0.42).normalize(), dv = new T.Vector3();
      root.userData.setCurl = c => {
        for (const sg of fingers) { sg[0].rotation.z = -(6 + 86 * c) * D; sg[1].rotation.z = -(8 + 98 * c) * D; }
        dv.copy(dOpen).lerp(dShut, c).normalize();
        t0.quaternion.setFromUnitVectors(XV, dv);
        t1.rotation.z = -(6 + 16 * c) * D; t1.rotation.y = side * 22 * c * D;
      };
      root.userData.setCurl(1);
      return root;
    }

    /* =====================================================
       TORSE : coffre, bassin, liaisons de hanche (lacet / roulis)
       ===================================================== */
    const torso = ctx.group();
    const clsTorso = (x, y, z, nx, ny, nz) => {
      if (y > 171.4 && y < 174.4 && x > 0 && x < 6 && Math.abs(z) < 2.9) return 'dome';
      if (y > 172.4 && y < 175.2 && x > 8.8 && x < 11.9 && Math.abs(z) < 5 && nx > 0.45) return 'slot';
      if (y > 174.5) return 'helmet';
      if (y > 153.6) return 'neck';
      if (Math.abs(z) > 10.6 && y > 141.5 && y < 155.5) return z > 0 ? 'shf' : 'shb';
      if (y < 110.6) return 'base';
      if (Math.abs(nx) > 0.2 && Math.abs(nz) > 0.2 && Math.abs(nx) < 0.98 && Math.abs(nz) < 0.98) return 'edge';
      return 'box';
    };
    torso.add(realSplit('torso_link', 'parts', clsTorso, { box: BLK, edge: EDG, base: MOT }, TORSO_O));
    torso.add(realPart('pelvis', MOT, { pivot: [0, hipP[1], 0], k }));
    for (const [sd, s, z] of [['f', 'right', 1], ['b', 'left', -1]]) {
      const dx = sd === 'f' ? 1.8 : -1.8, HO = { pivot: hipP, k, p: [dx, 0, 0] };
      torso.add(realPart([s + '_hip_yaw_link', s + '_hip_roll_link'], ANO, HO));
      if (!low) {
        const hg = realGroup(HO); torso.add(hg);
        // moteur de tangage de hanche (face usinée côté intérieur)
        const zi = z * 2.8, zo = z * 10.6;
        motor(hg, [hipP[0], hipP[1], 0], 'z', 6.55, Math.min(zi, zo), Math.max(zi, zo), sd === 'b' ? [1] : []);
        // moteur de roulis de hanche (axe avant-arrière, face usinée à l'arrière)
        motor(hg, [0, 88.6, z * 8.75], 'x', 5.45, -10.25, -3.2, [-1], { n: 0 });
      }
    }
    // logo « Unitree H1 » (avant + dos), retourné selon le sens du combattant pour rester lisible
    let LOGO = null;
    if (!low) {
      LOGO = ctx.group(ctx.real('h1', 'logo_link', WH, TORSO_O));
      LOGO.userData.noMerge = true; torso.add(LOGO);
    }
    P.torso = torso;

    /* ---------- cou (béquille en A + anneau facial + casque) et tête (capteurs) ---------- */
    P.neck = realSplit('torso_link', 'parts', clsTorso, { neck: BLK }, NECK_O);
    {
      const h = ctx.group();
      h.add(realSplit('torso_link', 'parts', clsTorso, { helmet: BLK, dome: VI, slot: VI }, HEAD_O));
      if (!low) {
        const hg = realGroup(HEAD_O); h.add(hg);
        // dôme du lidar / caméra sous le casque
        add(hg, g.sphere(2.45, 28, 14, 0, 2 * PI, PI / 2, PI / 2), VI, [3.0, 174.3, 0]);
        add(hg, g.torus(2.45, 0.22, 32, 6, 2 * PI, 'y'), RIM, [3.0, 174.2, 0]);
        // voyant d'état dans la fente de la caméra de profondeur
        add(hg, g.cyl(0.38, 0.38, 0.3, 12, 'x'), LED, [11.0, 173.9, 3.4]);
      }
      P.head = h;
    }

    /* =====================================================
       BRAS / JAMBES
       ===================================================== */
    for (const [sd, s, z] of [['f', 'right', 1], ['b', 'left', -1]]) {
      const sh = B[s + '_shoulder_roll_link'], el = B[s + '_elbow_link'], hp = B[s + '_hip_pitch_link'], kn = B[s + '_knee_link'], an = B[s + '_ankle_link'];
      // épaule : carter du moteur de tangage (fixé au coffre)
      const SC_O = { pivot: [0, sh[1], sh[2]], k, s: [1, sy, 1] };
      P[sd + 'sc'] = realSplit('torso_link', 'parts', clsTorso, { ['sh' + sd]: MOT }, SC_O);
      // bras : moteur de roulis + étrier (moteur de lacet) + bras (moteur de coude)
      const UA_O = { pivot: sh, to: el, len: L.ua, frame: 'limb', k: kA };
      const ua = realPart([s + '_shoulder_pitch_link', s + '_shoulder_roll_link', s + '_shoulder_yaw_link'], ANO, UA_O);
      if (!low) {
        const ag = realGroup(UA_O); ua.add(ag);
        motor(ag, [0, sh[1], sh[2]], 'x', 4.95, -3.55, 3.55, [1], { n: 6 });                     // roulis d'épaule
        motor(ag, [0, 138.6, sh[2]], 'y', 4.95, 136.1, 141.1, []);                              // lacet d'épaule
        motor(ag, [el[0], el[1], sh[2]], 'z', 4.95, z > 0 ? 18.5 : -23.9, z > 0 ? 23.9 : -18.5, [1], { n: 6 }); // coude
      }
      P[sd + 'ua'] = ua;
      // avant-bras : tête de coude (non étirée) + tube étiré jusqu'au poignet ; le pommeau d'extrémité est remplacé par la manchette de la main
      const wr = [30.5, 114.8, el[2]];
      const FA_O = { pivot: el, to: wr, frame: 'limb', k: kA };
      const st = (L.fa - kA * (30.5 - 27.9) - kA * (6 - el[0])) / (kA * (27.9 - 6));
      const FT_O = Object.assign({}, FA_O, { s: [1, st, 1], p: [0, kA * (6 - el[0]) * (1 - st), 0] });
      const clsFA = (x) => x < 6 ? 'prox' : x < 27.9 ? 'tube' : 'knob';
      P[sd + 'fa'] = ctx.group(
        realSplit(s + '_elbow_link', 'fa', clsFA, { prox: ANO }, FA_O),
        realSplit(s + '_elbow_link', 'fa', clsFA, { tube: ANO }, FT_O));
      // main (le pommeau réel de l'extrémité est remplacé par une manchette de poignet)
      const hand = h1Hand(z);
      P[sd + 'ha'] = hand;
      // jambe
      const TH_O = { pivot: hp, to: kn, len: L.th, frame: 'limb', k };
      const th = realPart(s + '_hip_pitch_link', ANO, TH_O);
      if (!low) { const tg = realGroup(TH_O); th.add(tg); motor(tg, [hipP[0], hipP[1], 0], 'z', 4.4, z * 23.25, z * 23.25, [z], { body: null, n: 6 }); }
      P[sd + 'th'] = th;
      const SH_O = { pivot: kn, to: an, len: L.sh, frame: 'limb', k };
      const shin = realPart(s + '_knee_link', ANO, SH_O);
      if (!low) {
        const sg = realGroup(SH_O); shin.add(sg);
        motor(sg, [2.95, 37.1, 0], 'z', 4.85, z > 0 ? 15.4 : -23.9, z > 0 ? 23.9 : -15.4, [1], { n: 6 }); // moteur de cheville
        motor(sg, [kn[0], kn[1], 0], 'z', 2.2, z * 23.3, z * 23.3, [z], { body: null, n: 0 });                     // axe de genou
      }
      P[sd + 'sh'] = shin;
      P[sd + 'fo'] = realSplit(s + '_ankle_link', 'foot', (x, y, z, nx, ny) => y < 2.6 && ny < -0.6 ? 'sole' : 'foot', { foot: ANO, sole: RU }, { pivot: an, k: kF });
    }

    const tick = ctx.override ? undefined : (t, state) => {
      if (LOGO && state && state.face) LOGO.scale.z = state.face;
      const sup = state && (state.st === 'super' || state.st === 'special');
      LED.emissiveIntensity = LED.userData.baseI * ((sup ? 1.6 : 0.85) + 0.15 * Math.sin(t * 3.1));
    };
    return { parts: P, shZ, hpZ, tick };
  };
})();
