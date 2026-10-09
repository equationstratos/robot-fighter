'use strict';
/* Animations personnelles : asimo — voir le contrat en tête de js/motions.js
   intro   : le célèbre « bonjour » d'ASIMO : il sort de la garde d'un petit pas, se tourne vers le public,
             salue de l'avant-bras, s'incline poliment (ojigi), puis reprend la garde
   victory : ASIMO dirige l'orchestre symphonique de Detroit (2008) : levée, mesure à 4 temps à la baguette,
             crescendo de la main gauche, point d'orgue bras levés, coupure… puis salut de chef d'orchestre */
(() => {
  const ch = ROSTER.find(r => r.id === 'asimo'), s = ch.scale, Lg = 44 * s * ch.leg, HO = 1.8 * s;
  const HZ = 10.5 * s, SZ = 23.5 * s; // demi-écart des hanches / des épaules du modèle 3D
  // jambe : pied à (x, y) de l'articulation de hanche (y vers le bas) → [hanche, genou]
  const leg = (x, y) => { const d = Math.min(Math.hypot(x, y), 2 * Lg * 0.9999), dir = Math.atan2(x, y) / D2R, a = Math.acos(d / (2 * Lg)) / D2R; return [dir + a, 2 * a]; };
  // pose aux pieds placés en F / B (x local depuis le centre des hanches) à la profondeur hF / hB sous la hanche
  const st = (o, F, B, hF, hB = hF) => { const p = mkPose({ ...o }); [p.fh, p.fk] = leg(F - HO, hF); [p.bh, p.bk] = leg(B + HO, hB); return p; };
  const G = skeleton(ch, POSES.idle, 1), F0 = G.ffo.x, B0 = G.bfo.x, H0 = G.ffo.y;
  // x écran d'un pied (local lx, côté lz) pour une orientation yaw et un décalage dx ; dx qui garde un pied en X
  const fX = (lx, lz, yaw, dx) => dx + lx * Math.cos(yaw) + lz * Math.sin(yaw);
  const dxAt = (X, lx, lz, yaw) => X - lx * Math.cos(yaw) - lz * Math.sin(yaw);
  const XF = fX(F0, HZ, -0.42, 0); // pied avant de la garde : il reste planté pendant le pas

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
    fn(x + face * ((menu ? dx : 0) + h.x) * sc, footY - ((menu ? dy : 0) + h.y) * sc, sc, face);
  };
  // petite note de musique dorée qui s'envole (tête + hampe + crochet)
  const note = (x, y, sc, vx, vy, life) => {
    const col = pick(['#ffd23a', '#ffe68a', '#ffc04a']), r = 3.2 * sc, stem = 11 * sc, len = stem / Math.max(0.5, -vy);
    FX.add({ type: 'glow', x, y, vx, vy, size: r * 1.6, life, max: life, col, core: '#fff8d8' });
    FX.add({ type: 'spark', x: x + r * 0.8, y: y - stem, vx, vy, size: 1.6 * sc, len, life, max: life, col });
    FX.add({ type: 'spark', x: x + r * 0.8 + 5 * sc, y: y - stem + 5 * sc, vx, vy, size: 1.4 * sc, len: 5 * sc / Math.max(0.5, -vy), life, max: life, col });
  };
  const notes = (n, spread) => (x, y, sc, face) => {
    for (let i = 0; i < n; i++) note(x + rand(-spread, spread) * sc, y + rand(-6, 6) * sc, sc, face * rand(-0.3, 1.1) * sc, -rand(0.9, 1.6) * sc, rand(34, 52) | 0);
    for (let i = 0; i < 5; i++) FX.add({ type: 'spark', x, y, vx: rand(-3, 3) * sc, vy: rand(-3, 1) * sc, size: 2, len: 2, life: 12, max: 12, col: '#fff1a8' });
  };
  const twinkle = (x, y, sc) => {
    FX.add({ type: 'star', x, y, size: 9 * sc, life: 14, max: 14, col: '#fff6d0', rot: rand(0, 3) });
    for (let i = 0; i < 4; i++) FX.add({ type: 'glow', x: x + rand(-8, 8) * sc, y: y + rand(-8, 8) * sc, vy: -0.4 * sc, size: 4 * sc, life: 18, max: 18, col: ch.accent });
  };

  // ======================= INTRO : bonjour + ojigi =======================
  const Y1 = -0.9, lxS = 2, hS = H0 + 0.6 * s; // orientation « public », pieds côte à côte, genoux un peu fléchis (ASIMO)
  const dx1 = dxAt(XF, lxS, HZ, Y1), Ym = -0.66, lxM = (F0 + lxS) / 2, dxM = dxAt(XF, lxM, HZ, Ym);
  const BX1 = fX(lxS, -HZ, Y1, dx1);
  const relax = { lean: 3, hd: 0, fs: 6, fe: 22, bs: 6, be: 22, axf: 0.14, axb: 0.14, grip: 0.35 };
  const shift = st({ ...POSES.idle, lean: 6, fs: 40, fe: 90, bs: 22, be: 100 }, F0 + 2, B0 + 2, H0 + 1, H0 - 9);
  const midB = (X0, X1, yaw, dx) => ((X0 + X1) / 2 - dx + HZ * Math.sin(yaw)) / Math.cos(yaw); // pied arrière à mi-pas (x local)
  const BXg = fX(B0, -HZ, -0.42, 0);
  const passA = st({ lean: 4, hd: -2, fs: 22, fe: 60, bs: 14, be: 70, grip: 0.6, axf: 0.1, axb: 0.1 }, lxM, midB(BXg, BX1, Ym, dxM), hS, hS - 14);
  const stand = st({ ...relax }, lxS, lxS, hS);
  const land = st({ ...relax, lean: 4, fs: 10, fe: 30, bs: 10, be: 34, grip: 0.45 }, lxS, lxS, hS, hS - 5); // pied au-dessus de sa place
  const gLand = st({ ...POSES.idle, lean: 6 }, F0, B0, H0, H0 - 14); // pied arrière au-dessus de sa place de garde
  const standD = st({ ...relax, lean: 4, fe: 26, be: 26 }, lxS, lxS, hS - 1.5);
  // le salut se fait avec le bras du fond (côté droit de l'écran) : la main reste à côté de la visière, jamais devant ;
  // bras levé vers l'avant, avant-bras vertical, qui balance vers l'extérieur (abduction négative = vers l'extérieur
  // quand l'avant-bras est levé)
  const waveUp = st({ ...relax, lean: -1, hd: -8, headSpin: -0.42, fs: 8, fe: 22, axf: 0.14, bs: 100, be: 70, axb: -0.4, grip: 0 }, lxS, lxS, hS);
  const wave = (be, ax, d = 0) => st({ ...relax, lean: 0, hd: -9, headSpin: -0.42, fs: 6, fe: 22, axf: 0.14, bs: 98, be, axb: ax, grip: 0 }, lxS, lxS, hS + d);
  const bowPre = st({ ...relax, lean: -2, hd: -4, fs: -2, fe: 12, bs: -2, be: 12, axf: 0.12, axb: 0.12, grip: 0.2 }, lxS, lxS, hS);
  const bow = st({ lean: 36, hd: 14, fs: -30, fe: 10, bs: -30, be: 10, axf: 0.12, axb: 0.12, grip: 0.2 }, lxS + 1, lxS + 1, hS + 0.4);
  const bowH = { ...bow, lean: 38, hd: 16 };
  const rise = st({ ...relax, lean: -3, hd: -3, fs: 2, fe: 18, bs: 2, be: 18 }, lxS, lxS, hS);
  const passB = st({ ...POSES.idle, lean: 5, fs: 45, fe: 95, bs: 25, be: 105, grip: 0.8 }, lxM, midB(BXg, BX1, Ym, dxM), H0 + 0.5, H0 - 13);

  // ======================= VICTOIRE : chef d'orchestre =======================
  // 3/4 face : la baguette (bras avant) et la main gauche se lisent de profil, à droite de la visière
  const Y2 = -0.64, dx2 = dxAt(XF, lxS, HZ, Y2), Ym2 = -0.53, dxM2 = dxAt(XF, lxM, HZ, Ym2);
  const pod = (o, d = 0) => st({ lean: 2, hd: -6, headSpin: -0.25, grip: 0.55, axb: 0.25, ...o }, lxS, lxS, hS + d);
  const vReady = pod({ fs: 74, fe: 78, axf: 0.15, bs: 66, be: 76, grip: 0.5 }); // les deux mains levées : « attention… »
  const vLift = pod({ lean: -3, hd: -12, fs: 128, fe: 34, axf: 0.12, bs: 100, be: 50 }, 0.6); // levée (inspiration)
  const b1 = pod({ lean: 7, hd: -2, fs: 30, fe: 28, axf: 0.06, bs: 52, be: 74 }, -2.2); // 1 : en bas (ictus, genoux qui plient)
  const b2 = pod({ lean: 4, fs: 64, fe: 60, axf: -0.72, bs: 56, be: 76 }); // 2 : vers l'intérieur
  const b3 = pod({ lean: 3, fs: 56, fe: 44, axf: 1.15, bs: 56, be: 78 }); // 3 : vers l'extérieur
  const b4 = pod({ lean: -1, hd: -10, fs: 132, fe: 30, axf: 0.2, bs: 60, be: 80 }, 0.4); // 4 : en haut
  const c1 = pod({ lean: 8, hd: -2, fs: 30, fe: 28, axf: 0.05, bs: 80, be: 60, axb: 0.4, grip: 0.3 }, -2.2); // crescendo : main gauche monte
  const c2 = pod({ lean: 4, hd: -8, fs: 64, fe: 60, axf: -0.7, bs: 112, be: 42, axb: 0.5, grip: 0.3 });
  const c3 = pod({ lean: 0, hd: -12, fs: 58, fe: 44, axf: 1.15, bs: 140, be: 28, axb: 0.55, grip: 0.2 }, 0.4);
  const fermata = pod({ lean: -6, hd: -16, fs: 18, fe: 18, axf: 2.45, bs: 18, be: 18, axb: 2.45, grip: 0 }, 0.6); // point d'orgue : bras en V
  const fermata2 = { ...fermata, lean: -7, hd: -18, axf: 2.55, axb: 2.55 };
  const cut = pod({ lean: 10, hd: 4, fs: 70, fe: 80, axf: -0.3, bs: 70, be: 80, axb: -0.3, grip: 1 }, -2); // coupure : poings fermés devant
  // salut du chef : main avant sur le cœur, bras du fond ouvert vers le côté
  const cBow = st({ lean: 40, hd: 16, headSpin: -0.2, fs: 46, fe: 118, axf: -0.5, bs: -34, be: 12, axb: 0.16, grip: 0.4 }, lxS + 1, lxS + 1, hS + 0.4);
  const cBowH = { ...cBow, lean: 43, hd: 18 };
  const cRise = pod({ lean: -2, hd: -8, fs: 20, fe: 30, axf: 0.6, bs: 20, be: 30, axb: 0.6, grip: 0.3 }); // bras ouverts au public
  // boucle : valse à 3 temps, douce
  const w1 = pod({ lean: 5, hd: -3, fs: 36, fe: 36, axf: 0.1, bs: 44, be: 70, axb: 0.3 }, -1.5);
  const w2 = pod({ lean: 2, hd: -5, fs: 54, fe: 50, axf: 1.0, bs: 50, be: 72, axb: 0.4 });
  const w3 = pod({ lean: -1, hd: -10, fs: 118, fe: 40, axf: 0.3, bs: 56, be: 76, axb: 0.35 }, 0.4);

  const fx = {
    hello: at(wave(80, -0.8, -1), Y1, dx1, 0, 'b', twinkle),
    n1: at(b1, Y2, dx2, 0, 'f', notes(2, 6)), n2: at(b2, Y2, dx2, 0, 'f', notes(1, 4)), n3: at(b3, Y2, dx2, 0, 'f', notes(2, 6)), n4: at(b4, Y2, dx2, 0, 'f', notes(1, 4)),
    m1: at(c1, Y2, dx2, 0, 'f', notes(2, 6)), m2: at(c2, Y2, dx2, 0, 'f', notes(2, 6)), m3: at(c3, Y2, dx2, 0, 'f', notes(3, 8)),
    w1: at(w1, Y2, dx2, 0, 'f', notes(1, 5)), w2: at(w2, Y2, dx2, 0, 'f', notes(1, 5)), w3: at(w3, Y2, dx2, 0, 'f', notes(1, 5)),
    finale: (c, x, footY, sc, face) => {
      const xs = x + face * (sc !== 1 ? dx2 : 0) * sc;
      for (const sd of ['f', 'b']) { const h = hand(fermata2, Y2, sd); notes(5, 14)(xs + face * h.x * sc, footY - h.y * sc, sc, face); }
      FX.add({ type: 'ring', x: xs, y: footY - 95 * sc, size: 110 * sc, life: 22, max: 22, col: '#ffd23a', lw: 5, flat: 0.5 });
      AU.sfx('confirm');
    },
    cutoff: (c, x, footY, sc, face) => { // éclat doré entre les deux poings fermés
      const hf = hand(cut, Y2, 'f'), hb = hand(cut, Y2, 'b'), menu = sc !== 1;
      const cx = x + face * ((menu ? dx2 : 0) + (hf.x + hb.x) / 2) * sc, y = footY - (hf.y + hb.y) / 2 * sc;
      FX.add({ type: 'glow', x: cx, y, size: 24 * sc, life: 12, max: 12, col: '#ffd23a', core: '#fff' });
      for (let i = 0; i < 16; i++) { const a = rand(0, Math.PI * 2), v = rand(3, 8); FX.add({ type: 'star', x: cx, y, vx: Math.cos(a) * v * sc, vy: Math.sin(a) * v * sc - 1, drag: 0.9, g: 0.05, size: rand(5, 9) * sc, life: rand(18, 30) | 0, max: 30, col: pick(['#ffd23a', '#fff3b0', '#ffffff']), rot: rand(0, 3) }); }
      AU.sfx('hitL');
    }
  };

  MOTIONS.asimo = {
    intro: [
      ['idle', 1],
      [shift, 9],                                        // le poids passe sur le pied avant, talon arrière décollé
      [passA, 10, { yaw: Ym, dx: dxM }],                 // petit pas : pied arrière en l'air, il pivote vers le public
      [land, 7, { yaw: Y1, dx: dx1 }],
      [stand, 5, { yaw: Y1, dx: dx1 }],                  // pieds joints, genoux fléchis (posture ASIMO)
      [standD, 5, { yaw: Y1, dx: dx1 }],
      [waveUp, 12, { yaw: Y1, dx: dx1, say: 'Hello!' }], // la main se lève
      [wave(80, -0.8, -1), 9, { yaw: Y1, dx: dx1, fx: 'hello' }], // l'avant-bras balance de part et d'autre de la verticale
      [wave(74, -0.1, 0.3), 9, { yaw: Y1, dx: dx1 }],
      [wave(80, -0.8, -1), 9, { yaw: Y1, dx: dx1 }],
      [wave(74, -0.1, 0.3), 9, { yaw: Y1, dx: dx1 }],
      [wave(78, -0.5, -0.4), 7, { yaw: Y1, dx: dx1 }],
      [bowPre, 12, { yaw: Y1, dx: dx1 }],                // bras le long du corps, se redresse
      [bow, 15, { yaw: Y1, dx: dx1 - 1 }],               // ojigi
      [bowH, 12, { yaw: Y1, dx: dx1 - 1 }],
      [rise, 14, { yaw: Y1, dx: dx1 }],
      [passB, 10, { yaw: Ym, dx: dxM, sfx: 'move' }],    // reprend la garde : pied arrière repart en arrière
      [gLand, 7],
      ['idle', 6],
      ['idle', 8]
    ],
    victory: [
      ['idle', 1],
      [shift, 7],
      [passA, 8, { yaw: Ym2, dx: dxM2 }],
      [land, 6, { yaw: Y2, dx: dx2 }],
      [stand, 4, { yaw: Y2, dx: dx2 }],
      [vReady, 10, { yaw: Y2, dx: dx2 }],                // « attention, orchestre »
      [vLift, 10, { yaw: Y2, dx: dx2 }],                 // levée
      [b1, 7, { yaw: Y2, dx: dx2, fx: 'n1' }],
      [b2, 8, { yaw: Y2, dx: dx2, fx: 'n2' }],
      [b3, 8, { yaw: Y2, dx: dx2, fx: 'n3' }],
      [b4, 8, { yaw: Y2, dx: dx2, fx: 'n4' }],
      [c1, 7, { yaw: Y2, dx: dx2, fx: 'm1' }],
      [c2, 8, { yaw: Y2, dx: dx2, fx: 'm2' }],
      [c3, 8, { yaw: Y2, dx: dx2, fx: 'm3' }],
      [fermata, 10, { yaw: Y2, dx: dx2, fx: 'finale' }], // point d'orgue
      [fermata2, 18, { yaw: Y2, dx: dx2 }],
      [cut, 6, { yaw: Y2, dx: dx2, fx: 'cutoff' }],      // coupure !
      [cBow, 14, { yaw: Y2, dx: dx2 - 1 }],              // salut, main sur le cœur
      [cBowH, 16, { yaw: Y2, dx: dx2 - 1 }],
      [cRise, 14, { yaw: Y2, dx: dx2 }],                 // ---- boucle : valse douce puis salut
      [w1, 14, { yaw: Y2, dx: dx2, fx: 'w1' }],
      [w2, 14, { yaw: Y2, dx: dx2, fx: 'w2' }],
      [w3, 14, { yaw: Y2, dx: dx2, fx: 'w3' }],
      [w1, 14, { yaw: Y2, dx: dx2, fx: 'w1' }],
      [w2, 14, { yaw: Y2, dx: dx2, fx: 'w2' }],
      [w3, 14, { yaw: Y2, dx: dx2, fx: 'w3' }],
      [fermata, 12, { yaw: Y2, dx: dx2, fx: 'finale' }],
      [fermata2, 14, { yaw: Y2, dx: dx2 }],
      [cut, 6, { yaw: Y2, dx: dx2, fx: 'cutoff' }],
      [cBow, 14, { yaw: Y2, dx: dx2 - 1 }],
      [cBowH, 16, { yaw: Y2, dx: dx2 - 1 }],
      [cRise, 14, { yaw: Y2, dx: dx2 }]
    ],
    victoryLoop: 20,
    fx
  };
})();
