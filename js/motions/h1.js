'use strict';
/* Animations personnelles : h1 — voir le contrat en tête de js/motions.js
   intro   : échauffement du détenteur du record de vitesse (3,3 m/s) : petit saut d'appel, montées de genoux
             express de sprinteur (traînées de vitesse), puis saut tourné à 360° et réception nette en garde
   victory : le salto arrière debout (premier humanoïde électrique grandeur nature à le réussir, 2024), réception
             « plantée » bras en V, demi-tour sauté face au public, puis le yangge du gala du Nouvel An de CCTV (2025) :
             pas rebondis, buste qui tourne, mouchoirs rouges qui tournoient au bout des doigts, lancer-rattraper */
(() => {
  const ch = ROSTER.find(r => r.id === 'h1'), s = ch.scale, Lg = 44 * s * ch.leg, HO = 1.8 * s, TAU = Math.PI * 2;
  const HZ = 20.5, SZ = 21.6; // demi-écart des hanches / des épaules du modèle 3D (unités de jeu)
  // jambe : pied à (x, y) de l'articulation de hanche (y vers le bas) → [hanche, genou]
  const leg = (x, y) => { const d = Math.min(Math.hypot(x, y), 2 * Lg * 0.9999), dir = Math.atan2(x, y) / D2R, a = Math.acos(d / (2 * Lg)) / D2R; return [dir + a, 2 * a]; };
  // pose aux pieds placés en F / B (x local depuis le centre des hanches) à la profondeur hF / hB sous la hanche
  const st = (o, F, B, hF, hB = hF) => { const p = mkPose({ ...o }); [p.fh, p.fk] = leg(F - HO, hF); [p.bh, p.bk] = leg(B + HO, hB); return p; };
  const G = skeleton(ch, POSES.idle, 1), F0 = G.ffo.x, B0 = G.bfo.x, H0 = G.ffo.y, HB0 = G.bfo.y;
  const sm = u => u * u * (3 - 2 * u);
  // hauteur du centre de rotation (salto) au-dessus du sol quand dy = 0 (le jeu pose le point le plus bas au sol)
  const cH = p => skeleton(ch, p, 1)._low + 0.45 * Math.cos(p.lean * D2R) * 60 * s;
  // segment calculé image par image (images-clés d'une image : pas d'ease-out, trajectoire exacte)
  const bake = (n, f) => { const out = []; for (let i = 1; i <= n; i++) out.push(f(i / n, i)); return out; };
  const lerpP = (a, b, k) => lerpPose(mkPose(a), mkPose(b), k);

  // ---- position de la main (pour les effets) : unités de jeu, x vers l'avant de l'écran du robot, y = hauteur ----
  function hand(p, yaw, sd) {
    const S = skeleton(ch, p, 1), sh = S[sd + 'sh'], h = S[sd + 'ha'], zz = sd === 'f' ? 1 : -1;
    let x = h.x, y = -h.y, z = zz * SZ;
    const ax = p['ax' + sd];
    if (ax) { // abduction : rotation autour de l'axe avant du buste passant par l'épaule (comme RK.pose)
      const tl = Math.hypot(S.neck.x - S.hip.x, S.neck.y - S.hip.y) || 1, k = [(S.hip.y - S.neck.y) / tl, (S.hip.x - S.neck.x) / tl, 0];
      const a = -zz * ax, c = Math.cos(a), sn = Math.sin(a), v = [x - sh.x, y + sh.y, z - zz * SZ];
      const dt = k[0] * v[0] + k[1] * v[1], cr = [k[1] * v[2], -k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
      const r = [0, 1, 2].map(i => v[i] * c + cr[i] * sn + k[i] * dt * (1 - c));
      x = sh.x + r[0]; y = -sh.y + r[1]; z = zz * SZ + r[2];
    }
    if (p.twist) { const c = Math.cos(p.twist), sn = Math.sin(p.twist), nx = x * c + z * sn; z = -x * sn + z * c; x = nx; }
    const th = yaw + (p.spin || 0);
    return { x: x * Math.cos(th) + z * Math.sin(th), y: S._low + y };
  }
  // effet accroché à la main d'une pose clé ; menus : x/pied ne tiennent pas compte de dx/dy, le combat si
  const at = (p, yaw, dx, dy, sd, fn) => (c, x, footY, sc, face) => {
    const h = hand(p, yaw, sd), menu = sc !== 1;
    fn(c, x + face * ((menu ? dx : 0) + h.x) * sc, footY - ((menu ? dy : 0) + h.y) * sc, sc, face);
  };
  const RED = ['#ff2a2a', '#ff4b36', '#e0101c', '#ff7a5a'];
  // mouchoir rouge qui tournoie au bout des doigts (rectangles qui tournent + anneau incliné + éclats)
  const kerchief = (c, x, y, sc) => {
    for (let i = 0; i < 2; i++) FX.add({ type: 'debris', x, y: y - 4 * sc, size: 17 * sc, life: 18 + i * 3, max: 21, col: RED[i], g: 0 });
    FX.add({ type: 'ring', x, y: y - 4 * sc, size: 24 * sc, life: 14, max: 14, col: '#ff3a2a', lw: 4, flat: 0.45 });
    for (let i = 0; i < 6; i++) { const a = rand(0, TAU); FX.add({ type: 'spark', x: x + Math.cos(a) * 9 * sc, y: y - 4 * sc + Math.sin(a) * 4 * sc, vx: -Math.sin(a) * 3 * sc, vy: Math.cos(a) * 1.4 * sc, drag: 0.9, size: 2.2, len: 3, life: 12, max: 12, col: pick(RED) }); }
  };
  // le mouchoir lancé en l'air (redescend dans la main 32 images plus tard)
  const toss = (c, x, y, sc) => {
    AU.sfx('whiff');
    FX.add({ type: 'debris', x, y: y - 6 * sc, vy: -4.6 * sc, g: 0.2875 * sc, size: 18 * sc, life: 32, max: 32, col: '#ff2a2a' });
    FX.add({ type: 'debris', x, y: y - 6 * sc, vy: -4.6 * sc, g: 0.2875 * sc, size: 12 * sc, life: 30, max: 32, col: '#ff7a5a' });
    for (let i = 0; i < 5; i++) FX.add({ type: 'spark', x, y, vx: rand(-1, 1) * sc, vy: -rand(3, 6) * sc, size: 2, len: 3, life: 10, max: 10, col: pick(RED) });
  };
  const sparkle = (c, x, y, sc) => {
    FX.add({ type: 'star', x, y, size: 10 * sc, life: 14, max: 14, col: '#eafff1', rot: rand(0, 3) });
    for (let i = 0; i < 7; i++) { const a = rand(0, TAU), v = rand(2, 5); FX.add({ type: 'spark', x, y, vx: Math.cos(a) * v * sc, vy: Math.sin(a) * v * sc - 1, drag: 0.9, size: 2.4, len: 3, life: rand(12, 20) | 0, max: 20, col: pick([c.accent, '#ffffff']) }); }
  };

  // ======================= INTRO : échauffement de sprinteur + saut tourné =======================
  const YI = -0.55; // un peu plus vers le public pour lire les genoux
  const dip = st({ ...POSES.idle, lean: 16, hd: -8, fs: 38, fe: 100, bs: 12, be: 105 }, F0, B0, H0 - 9, HB0 - 9);
  // premier pas : le pied avant reste planté, la hanche passe au-dessus (dx), le genou arrière monte
  const XF = F0 * Math.cos(-0.42) + HZ * Math.sin(-0.42), dxK = XF - 4 * Math.cos(YI) - HZ * Math.sin(YI);
  const knee = (sd, h = 83) => {
    const p = st({ lean: 9, hd: -10, grip: 1, ...(sd === 'b' ? { fs: 70, fe: 88, bs: -55, be: 85 } : { bs: 70, be: 88, fs: -55, fe: 85 }) }, 4, -4, h);
    if (sd === 'b') { p.bh = 98; p.bk = 104; } else { p.fh = 98; p.fk = 104; }
    return p;
  };
  const plant = st({ lean: 11, hd: -9, fs: 20, fe: 80, bs: 20, be: 80, grip: 1 }, 4, -4, 80);
  const load = st({ lean: 26, hd: -12, fs: -38, fe: 30, bs: -38, be: 30, grip: 0.8 }, 4, -4, 63);
  const push = st({ lean: 2, hd: -14, fs: 128, fe: 26, bs: 122, be: 28, grip: 0.7 }, 4, -4, 85.6); // bras lancés vers l'avant-haut (pas au-dessus du titre)
  const tuckT = mkPose({ lean: 12, hd: -6, fs: 45, fe: 118, bs: 40, be: 120, axf: -0.15, axb: -0.15, fh: 92, fk: 112, bh: 72, bk: 120, grip: 1 });
  const gLand = st({ ...POSES.idle, lean: 12, fs: 55, fe: 95, bs: 35, be: 105 }, F0, B0, H0, HB0); // jambes tendues vers le sol
  const crouchG = st({ ...POSES.idle, lean: 22, hd: -12, fs: 62, fe: 100, bs: 38, be: 110 }, F0, B0, H0 - 15, HB0 - 15);
  const proud = st({ ...POSES.idle, lean: 4, hd: -14, fs: 50, fe: 104, bs: 30, be: 116 }, F0, B0, H0 + 1.5, HB0 + 1.5);
  // saut tourné : centre de gravité sur une parabole exacte, rotation vers le public
  const pc0 = cH(push) + 5, pc1 = cH(gLand);
  const turnJump = bake(26, u => {
    const p = u < 0.42 ? lerpP(push, tuckT, sm(u / 0.42)) : lerpP(tuckT, gLand, sm((u - 0.42) / 0.58));
    const dy = lerp(pc0, pc1, u) + 42 * 4 * u * (1 - u) - cH(p);
    return [p, 1, { yaw: lerp(YI, -0.42, u), dx: dxK * (1 - u), dy: Math.max(0, dy), spin: u < 1 ? -0.5 - (TAU - 0.5) * sm(u) : 0 }];
  });

  // ======================= VICTOIRE : salto arrière + yangge =======================
  const YV = -0.42, dxIn = F0 * Math.cos(YV); // pieds joints : le pied avant reste planté, la hanche avance au-dessus
  const stepMid = st({ lean: 6, hd: -8, fs: 85, fe: 70, bs: 70, be: 75, grip: 0.8 }, F0 - dxIn / 2 / Math.cos(YV), (B0 - dxIn / 2) / 2, H0, H0 - 16);
  const ready = st({ lean: -3, hd: -12, fs: 168, fe: 8, bs: 164, be: 8, grip: 0.4 }, 0, 0, 85.6);
  const wind = st({ lean: 30, hd: 8, fs: -58, fe: 22, bs: -58, be: 22, grip: 0.6 }, 0, 0, 64);
  const take = st({ lean: -8, hd: -18, fs: 162, fe: 8, bs: 160, be: 8, grip: 0.4 }, 0, 0, 85.8);
  const ball = mkPose({ lean: 22, hd: 14, fs: 68, fe: 62, bs: 66, be: 64, fh: 118, fk: 138, bh: 114, bk: 138, grip: 1 }); // groupé, mains aux genoux
  const open = st({ lean: 16, hd: -8, fs: 85, fe: 18, bs: 80, be: 18, grip: 0.3 }, 0, 0, 84);
  const landF = st({ lean: 26, hd: -10, fs: 88, fe: 14, bs: 82, be: 14, grip: 0.3 }, 0, 0, 66);
  // réception plantée, bras en V (abduction depuis le bras pendant : les bras passent par les côtés)
  // le buste s'ouvre vers le public (twist) pour que le V se lise de face
  const stick = st({ lean: -4, hd: -12, twist: -0.6, headSpin: -0.25, fs: 14, fe: 8, axf: 2.42, bs: 14, be: 8, axb: 2.42, grip: 0 }, 0, 0, 85.6);
  const stick2 = { ...stick, lean: -5, hd: -14, twist: -0.66, axf: 2.52, axb: 2.52 };
  const dxL = dxIn - 12; // le salto recule un peu
  const fc0 = cH(take) + 6, fc1 = cH(open);
  const flip = bake(30, u => {
    const p = u < 0.3 ? lerpP(take, ball, sm(u / 0.3)) : u < 0.7 ? mkPose(ball) : lerpP(ball, open, sm((u - 0.7) / 0.3));
    p.rot = u < 1 ? -360 * (0.1 * u + 0.9 * sm(u)) : 0;
    const dy = lerp(fc0, fc1, u) + 50 * 4 * u * (1 - u) - cH(p);
    return [p, 1, { yaw: YV, dx: lerp(dxIn, dxL, u), dy: Math.max(0, dy) }];
  });
  // demi-tour sauté face au public, puis yangge (pieds côte à côte, légère ouverture)
  const YY = -1.3;
  const hopDip = st({ lean: 14, hd: -6, fs: 40, fe: 60, bs: 40, be: 60, grip: 0.6 }, 0, 0, 77);
  const hopUp = st({ lean: 4, hd: -6, fs: 60, fe: 70, axf: 0.6, bs: 60, be: 70, axb: 0.6, grip: 0.6 }, 0, 0, 82, 80);
  const W = { hxf: 0.1, hxb: 0.1 };
  const yUp = st({ ...W, lean: -1, hd: -8, fs: 55, fe: 75, axf: 0.75, bs: 55, be: 75, axb: 0.75, grip: 0.6 }, 0, 0, 85.4);
  // temps fort : on plie la jambe d'appui, l'autre genou monte, bras opposé levé (mouchoir), buste qui tourne
  const yA = st({ ...W, lean: 6, hd: -2, headSpin: 0.34, twist: 0.4, fs: 28, fe: 38, axf: 2.25, bs: 30, be: 55, axb: 0.95, grip: 0.6 }, 0, 9, 75, 56);
  const yB = st({ ...W, lean: 6, hd: -2, headSpin: -0.34, twist: -0.4, fs: 30, fe: 55, axf: 0.95, bs: 28, be: 38, axb: 2.25, grip: 0.6 }, 9, 0, 56, 75);
  const tWind = st({ ...W, lean: 6, hd: 0, fs: 40, fe: 95, axf: 0.5, bs: 40, be: 80, axb: 0.7, grip: 0.6 }, 0, 0, 80);
  const tUp = st({ ...W, lean: -3, hd: -20, fs: 128, fe: 8, axf: 0.55, bs: 40, be: 70, axb: 0.8, grip: 0 }, 0, 0, 85.6); // lancer
  const tLook = st({ ...W, lean: -4, hd: -24, fs: 100, fe: 40, axf: 0.6, bs: 45, be: 70, axb: 0.9, grip: 0 }, 0, 0, 84);
  const tCatch = st({ ...W, lean: -2, hd: -16, fs: 124, fe: 12, axf: 0.55, bs: 50, be: 70, axb: 0.9, grip: 0.7 }, 0, 0, 82);
  const OY = { yaw: YY, dx: dxL };
  const beats = [[yA, 9, { ...OY, fx: 'kf' }], [yUp, 8, OY], [yB, 9, { ...OY, fx: 'kb' }], [yUp, 8, OY]];

  const fx = {
    // traînées de vitesse vertes qui filent vers l'arrière
    speed(c, x, footY, sc, face) {
      AU.sfx('whiff');
      const x0 = x + face * (sc !== 1 ? dxK : 0) * sc;
      for (let i = 0; i < 7; i++) FX.add({ type: 'spark', x: x0 - face * rand(15, 45) * sc, y: footY - rand(30, 175) * sc, vx: -face * rand(8, 14) * sc, vy: 0, size: 2.2, len: 2.5, life: rand(8, 14) | 0, max: 14, col: pick([c.accent, '#eafff1']) });
    },
    tap(c, x, footY, sc) { AU.sfx('land'); dust(x, footY, 3); },
    stomp(c, x, footY, sc, face) {
      AU.sfx('land'); AU.sfx('whiffH');
      dust(x, footY, 9);
      FX.add({ type: 'ring', x, y: footY, size: 80 * sc, life: 16, max: 16, col: c.accent, flat: 0.22, lw: 5 });
    },
    // arc vert qui suit le salto (sens arrière)
    arc(c, x, footY, sc, face) {
      AU.sfx('spin');
      const cx = x + face * ((sc !== 1 ? dxIn : 0) - 8) * sc, cy = footY - 150 * sc, r = 62 * sc;
      for (let i = 0; i < 32; i++) {
        const a = -Math.PI * 0.35 - i / 32 * Math.PI * 1.5; // part de l'avant-haut, tourne vers l'arrière
        FX.add({ type: 'spark', x: cx + face * Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: face * Math.sin(a) * 1.6 * sc, vy: -Math.cos(a) * 1.6 * sc, size: 3.4, len: 6, life: 6 + (i * 0.7 | 0), max: 28, col: pick([c.accent, '#eafff1', c.accent]) });
      }
    },
    tada(c, x, footY, sc, face) {
      AU.sfx('confirm');
      for (const sd of ['f', 'b']) at(stick, YV, dxL, 0, sd, sparkle)(c, x, footY, sc, face);
    },
    kf: at(yA, YY, dxL, 0, 'f', kerchief),
    kb: at(yB, YY, dxL, 0, 'b', kerchief),
    toss: at(tUp, YY, dxL, 0, 'f', toss),
    catch: at(tCatch, YY, dxL, 0, 'f', (c, x, y, sc) => { AU.tone(990, 0.07, 'triangle', 0.1); kerchief(c, x, y, sc); })
  };

  const victory = [
    ['idle', 1],
    [stepMid, 8, { dx: dxIn / 2 }],                      // pieds joints
    [ready, 9, { dx: dxIn }],                            // bras levés : « prêt »
    [{ ...ready, hd: -14 }, 5, { dx: dxIn }],
    [wind, 10, { dx: dxIn }],                            // armé : bras en arrière, genoux fléchis
    [take, 4, { dx: dxIn, dy: 6, sfx: 'jump', fx: 'arc' }], // impulsion
    ...flip,                                             // salto arrière groupé
    [landF, 6, { dx: dxL, fx: 'stomp' }],                // réception
    [stick, 11, { dx: dxL, fx: 'tada' }],                // « plantée », bras en V
    [stick2, 10, { dx: dxL }],
    [hopDip, 7, { dx: dxL }],
    [hopUp, 8, { dx: dxL, dy: 12, yaw: -0.95 }],         // demi-tour sauté vers le public
    [yUp, 7, { ...OY, fx: 'tap' }]
  ];
  const victoryLoop = victory.length;
  victory.push(...beats, ...beats,
    [tWind, 7, OY], [tUp, 6, { ...OY, fx: 'toss' }], [tLook, 10, OY], [{ ...tLook, hd: -20 }, 10, OY], [tCatch, 6, OY],
    [yUp, 9, { ...OY, fx: 'catch' }]); // rattrapé : 32 images après le lancer

  MOTIONS.h1 = {
    intro: [
      ['idle', 1],
      [dip, 7],                                          // appel
      [knee('b'), 9, { yaw: YI, dx: dxK, fx: 'speed' }], // montées de genoux de sprinteur
      [plant, 4, { yaw: YI, dx: dxK }],
      [knee('f'), 6, { yaw: YI, dx: dxK, fx: 'speed' }],
      [plant, 4, { yaw: YI, dx: dxK }],
      [knee('b'), 6, { yaw: YI, dx: dxK, fx: 'speed' }],
      [plant, 4, { yaw: YI, dx: dxK }],
      [knee('f'), 6, { yaw: YI, dx: dxK, fx: 'speed' }],
      [plant, 5, { yaw: YI, dx: dxK }],
      [load, 9, { yaw: YI, dx: dxK }],                   // armé
      [push, 4, { yaw: YI, dx: dxK, dy: 5, spin: -0.5, sfx: 'jump' }],
      ...turnJump,                                       // saut tourné à 360°
      [crouchG, 6, { fx: 'stomp' }],                     // réception en garde
      [proud, 11],
      ['idle', 14]
    ],
    victory,
    victoryLoop,
    fx
  };
})();
