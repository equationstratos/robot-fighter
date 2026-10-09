'use strict';
/* Animations personnelles : ameca — voir le contrat en tête de js/motions.js
   intro   : « Ameca se réveille » (la vidéo virale d'Engineered Arts) : en veille, tête basse ; sursaut, regard
             circulaire, elle découvre ses propres mains avec émerveillement, puis se tourne vers la caméra
             et penche la tête, sourcil levé… avant de reprendre la garde
   win     : (manche gagnée en combat) numéro de MIME : face au public, il heurte une vitre invisible, la tâte des deux mains,
             trouve les parois sur les côtés puis le plafond qui s'abaisse (genoux pliés), tape la vitre, trouve une poignée,
             la tourne, s'échappe d'un pas et salue ; en boucle : de nouveau prisonnier de la cage de verre
   victory : numéro de théâtre sarcastique : petit pas vers le public, haussement d'épaules « Too easy. »,
             éclat de rire tête en arrière, grande révérence avec moulinet du bras ; en boucle : applaudissements
             lents et ironiques, levée des yeux au ciel, soupir, haussement d'épaules */
(() => {
  const ch = ROSTER.find(r => r.id === 'ameca'), s = ch.scale, Lg = 44 * s * ch.leg, HO = 1.8 * s, TAU = Math.PI * 2;
  const HZ = 10.4 * s, SZ = 21.2 * s; // demi-écart des hanches / des épaules du modèle 3D
  const leg = (x, y) => { const d = Math.min(Math.hypot(x, y), 2 * Lg * 0.9999), dir = Math.atan2(x, y) / D2R, a = Math.acos(d / (2 * Lg)) / D2R; return [dir + a, 2 * a]; };
  const st = (o, F, B, hF, hB = hF) => { const p = mkPose({ ...o }); [p.fh, p.fk] = leg(F - HO, hF); [p.bh, p.bk] = leg(B + HO, hB); return p; };
  const G = skeleton(ch, POSES.idle, 1), F0 = G.ffo.x, B0 = G.bfo.x, H0 = G.ffo.y, HB0 = G.bfo.y;
  const gd = (o, d = 0) => st(o, F0, B0, H0 + d, HB0 + d); // pieds de la garde, genoux plus ou moins fléchis

  // ---- points du corps vus à l'écran (unités de jeu : x vers l'avant de l'écran du robot, y = hauteur) ----
  const proj = (p, yaw, S, x, y, z) => {
    if (p.twist) { const c = Math.cos(p.twist), sn = Math.sin(p.twist), nx = x * c + z * sn; z = -x * sn + z * c; x = nx; }
    const th = yaw + (p.spin || 0);
    return { x: x * Math.cos(th) + z * Math.sin(th), y: S._low + y };
  };
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
    return proj(p, yaw, S, x, y, z);
  }
  const head = (p, yaw) => { const S = skeleton(ch, p, 1); return proj(p, yaw, S, S.head.x, -S.head.y, 0); };
  // effet accroché à un point d'une pose clé ; menus : x/pied ne tiennent pas compte de dx/dy, le combat si
  const atP = (pt, dx, fn) => (c, x, footY, sc, face) => { const menu = sc !== 1; fn(c, x + face * ((menu ? dx : 0) + pt.x) * sc, footY - pt.y * sc, sc, face); };
  const VIO = ['#b26bff', '#d6a8ff', '#f3e8ff'];

  // ======================= INTRO : le réveil =======================
  const slump = gd({ lean: 20, hd: 46, fs: 12, fe: 10, bs: 10, be: 8, axf: 0.04, axb: 0.04, grip: 0.3 }, -6); // hors tension
  const slump2 = gd({ lean: 23, hd: 50, fs: 14, fe: 8, bs: 12, be: 6, axf: 0.02, axb: 0.02, grip: 0.35 }, -7);
  const jolt = gd({ lean: -7, hd: -20, fs: 26, fe: 44, axf: 0.62, bs: 24, be: 44, axb: 0.62, grip: 0 }, 1.5); // sursaut : bras qui s'écartent
  const alert = gd({ lean: -2, hd: -9, fs: 14, fe: 28, axf: 0.3, bs: 14, be: 28, axb: 0.3, grip: 0.1 }, 0.5);
  const lookA = gd({ lean: -1, hd: -4, headSpin: 0.9, twist: 0.36, fs: 12, fe: 26, axf: 0.2, bs: 12, be: 26, axb: 0.2, grip: 0.1 }, 0.5);
  const lookB = gd({ lean: 1, hd: -8, headSpin: -0.95, twist: -0.4, fs: 12, fe: 26, axf: 0.2, bs: 12, be: 26, axb: 0.2, grip: 0.1 }, 0.5);
  // elle découvre ses mains : levées devant le visage, tête penchée dessus, doigts qui se ferment / s'ouvrent
  const hands = gd({ lean: 4, hd: 22, headSpin: 0, twist: -0.2, fs: 66, fe: 82, axf: 0.1, bs: 60, be: 86, axb: 0.12, grip: 0.05 }, 0);
  const curl = gd({ lean: 5, hd: 26, headSpin: 0.25, twist: -0.2, fs: 70, fe: 86, axf: 0.3, bs: 58, be: 84, axb: 0.12, grip: 0.85 }, 0);
  const open = gd({ lean: 5, hd: 24, headSpin: -0.28, twist: -0.2, fs: 62, fe: 80, axf: -0.1, bs: 66, be: 82, axb: 0.32, grip: 0 }, 0);
  // … puis regarde la caméra, surprise (petit recul), et se met à la réflexion, main au menton, tête penchée
  const cam = gd({ lean: -5, hd: -10, headSpin: -0.7, twist: -0.48, fs: 40, fe: 74, axf: 0.3, bs: 36, be: 74, axb: 0.3, grip: 0 }, 1);
  // main au menton : coude en avant à hauteur de poitrine, avant-bras replié vers le menton ; l'autre avant-bras replié devant la taille
  const brow = gd({ lean: -3, hd: -12, headSpin: -0.62, twist: -0.5, fs: 75, fe: 150, axf: 0.7, bs: 20, be: 84, axb: -0.4, grip: 0.55 }, 0.5);
  const brow2 = { ...brow, hd: -17, headSpin: -0.7, fe: 148, grip: 0.6 };

  // ======================= VICTOIRE : numéro sarcastique =======================
  const XF = F0 * Math.cos(-0.42) + HZ * Math.sin(-0.42); // pied avant de la garde (x écran), reste planté
  const dxAt = (lx, yaw) => XF - lx * Math.cos(yaw) - HZ * Math.sin(yaw);
  const YM = -0.64, YV = -0.88, lxM = F0 / 2, dxM = dxAt(lxM, YM), dxV = dxAt(0, YV); // 3/4 face : les gestes restent lisibles
  const OV = { yaw: YV, dx: dxV };
  const up = (o, h = 85.6) => st(o, 0, 0, h);
  const stepMid = st({ lean: 4, hd: -4, fs: 30, fe: 60, bs: 22, be: 60, grip: 0.5 }, lxM, B0 * 0.35, H0 + 1, H0 - 13);
  const stand = up({ lean: 0, hd: -6, fs: 8, fe: 18, axf: 0.12, bs: 8, be: 18, axb: 0.12, grip: 0.4 });
  const land = st({ lean: 2, hd: -5, fs: 14, fe: 30, axf: 0.12, bs: 12, be: 30, axb: 0.12, grip: 0.45 }, 0, 0, 85, 79); // pied du fond juste au-dessus de sa place
  // haussement d'épaules : coudes écartés, mains ouvertes paumes en l'air, tête penchée
  const shrug = up({ lean: -6, hd: 9, headSpin: 0.12, twist: -0.4, fs: 14, fe: 84, axf: 0.95, bs: 14, be: 84, axb: 0.95, grip: 0 });
  const shrug2 = up({ lean: -7, hd: 13, headSpin: 0.2, twist: -0.42, fs: 18, fe: 88, axf: 1.08, bs: 18, be: 88, axb: 1.08, grip: 0 });
  // rire : tête rejetée en arrière, main sur le ventre… puis penchée en avant, tape sur la cuisse
  const laugh = (k, o) => up({ lean: -6 - 8 * k, hd: -14 - 24 * k, headSpin: 0.1, twist: -0.2, fs: 10, fe: 84, axf: -0.4, bs: 22 + 14 * k, be: 36, axb: 0.55 + 0.25 * k, grip: 0.2, ...o }, Math.min(85.6, 83 + 2.6 * k)); // secoué : les genoux rebondissent
  const slap = up({ lean: 26, hd: 2, headSpin: 0.15, fs: 18, fe: 92, axf: -0.4, bs: -2, be: 12, axb: 0.16, grip: 0 }, 81);
  const flourish = up({ lean: -4, hd: -8, headSpin: 0.1, fs: 12, fe: 24, axf: 2.15, bs: 10, be: 14, axb: 0.9, grip: 0 });
  const bow = up({ lean: 46, hd: 20, fs: 55, fe: 115, axf: -0.35, bs: -28, be: 10, axb: 0.7, grip: 0.3 });
  const bow2 = { ...bow, lean: 48, hd: 23 };
  // applaudissements lents et ironiques : grandes ouvertures
  const clapO = up({ lean: 0, hd: 2, headSpin: 0.1, twist: -0.38, fs: 66, fe: 50, axf: 1.0, bs: 66, be: 50, axb: 1.0, grip: 0 });
  const clapS = up({ lean: 2, hd: 4, headSpin: 0.1, twist: -0.38, fs: 70, fe: 56, axf: -0.3, bs: 70, be: 56, axb: -0.3, grip: 0 });
  // yeux au ciel : la tête fait le tour par le haut ; soupir : tout s'affaisse
  const roll1 = up({ lean: -5, hd: -30, headSpin: 0.5, twist: -0.2, fs: 12, fe: 22, axf: 0.2, bs: 12, be: 22, axb: 0.2, grip: 0.2 });
  const roll2 = up({ lean: -5, hd: -32, headSpin: -0.5, twist: -0.2, fs: 12, fe: 22, axf: 0.2, bs: 12, be: 22, axb: 0.2, grip: 0.2 });
  const sigh = up({ lean: 12, hd: 20, headSpin: 0, twist: -0.1, fs: 8, fe: 10, axf: 0.06, bs: 8, be: 10, axb: 0.06, grip: 0.3 }, 83);

  const fx = {
    // mise en veille : lueur qui s'éteint, son qui descend
    off(c, x, footY, sc, face) {
      AU.tone(520, 0.5, 'sine', 0.1, 90);
      const h = head(POSES.idle, -0.42), hx = x + face * (h.x + 3) * sc, hy = footY - (h.y + 1) * sc;
      FX.add({ type: 'glow', x: hx, y: hy, vy: 0.5 * sc, size: 11 * sc, life: 20, max: 20, col: c.accent, core: '#fff' });
      for (let i = 0; i < 4; i++) FX.add({ type: 'spark', x: hx, y: hy, vx: rand(-0.6, 0.6) * sc, vy: rand(0.4, 1.2) * sc, size: 1.6, len: 2, life: 16, max: 16, col: c.accent });
    },
    // réveil : éclair dans les yeux + onde
    wake(c, x, footY, sc, face) {
      AU.tone(160, 0.28, 'sine', 0.13, 1100); AU.tone(1300, 0.08, 'triangle', 0.06, null, 0.22);
      const h = head(jolt, -0.42), hx = x + face * (h.x + 4) * sc, hy = footY - (h.y + 2) * sc;
      FX.add({ type: 'star', x: hx, y: hy, size: 16 * sc, life: 14, max: 14, col: '#ffffff', rot: 0.3 });
      FX.add({ type: 'ring', x: hx, y: hy, size: 60 * sc, life: 16, max: 16, col: c.accent, lw: 4 });
      FX.add({ type: 'glow', x: hx, y: hy, size: 20 * sc, life: 10, max: 10, col: c.accent, core: '#fff' });
    },
    // petit éclat dans le regard face caméra
    glint(c, x, footY, sc, face) {
      AU.tone(1500, 0.07, 'triangle', 0.06); AU.tone(2000, 0.09, 'triangle', 0.05, null, 0.07);
      const h = head(cam, -0.42);
      FX.add({ type: 'star', x: x + face * (h.x - 4) * sc, y: footY - (h.y + 3) * sc, size: 11 * sc, life: 16, max: 16, col: '#f3e8ff', rot: 0.4 });
    },
    // rire : bulles violettes qui montent de la tête
    ha: atP(head(laugh(1), YV), dxV, (c, x, y, sc, face) => {
      AU.tone(700, 0.05, 'square', 0.04); AU.tone(560, 0.06, 'square', 0.04, null, 0.06);
      for (let i = 0; i < 3; i++) FX.add({ type: 'glow', x: x + rand(-14, 14) * sc, y: y - rand(8, 18) * sc, vx: rand(-0.6, 0.6) * sc, vy: -rand(0.9, 1.6) * sc, size: rand(5, 8) * sc, life: 22, max: 22, col: pick(VIO), core: '#fff' });
    }),
    // moulinet : étoiles qui suivent la main
    swirl: atP(hand(flourish, YV, 'f'), dxV, (c, x, y, sc) => {
      AU.sfx('whiff');
      FX.add({ type: 'star', x, y, size: 12 * sc, life: 16, max: 16, col: '#f3e8ff', rot: 0.2 });
      for (let i = 0; i < 8; i++) FX.add({ type: 'glow', x: x + rand(-10, 10) * sc, y: y + rand(-10, 10) * sc, vy: rand(0.5, 2) * sc, size: rand(4, 7) * sc, life: 20, max: 20, col: pick(VIO) });
    }),
    // tape sur la cuisse
    slap: atP(hand(slap, YV, 'b'), dxV, (c, x, y, sc) => {
      AU.noise(0.06, 1500, 0.45, 'bandpass', null, 0, 1.1);
      for (let i = 0; i < 6; i++) { const a = rand(0, TAU), v = rand(1.5, 3); FX.add({ type: 'spark', x, y, vx: Math.cos(a) * v * sc, vy: Math.sin(a) * v * sc, drag: 0.88, size: 2, len: 2, life: 10, max: 10, col: pick(VIO) }); }
    }),
    bowing(c, x, footY, sc, face) { AU.sfx('confirm'); },
    // applaudissement lent
    clap: atP((() => { const a = hand(clapS, YV, 'f'), b = hand(clapS, YV, 'b'); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; })(), dxV, (c, x, y, sc) => {
      AU.noise(0.07, 2200, 0.4, 'bandpass', null, 0, 1.2); AU.noise(0.03, 5000, 0.2, 'highpass');
      for (let i = 0; i < 6; i++) { const a = rand(0, TAU), v = rand(1.5, 3.5); FX.add({ type: 'spark', x, y, vx: Math.cos(a) * v * sc, vy: Math.sin(a) * v * sc, drag: 0.88, size: 2, len: 2, life: 10, max: 10, col: pick(VIO) }); }
    })
  };

  MOTIONS.ameca = {
    intro: [
      ['idle', 1],
      [slump, 16, { fx: 'off' }],                        // mise en veille : tête basse, bras ballants
      [slump2, 20],
      [jolt, 5, { fx: 'wake' }],                         // sursaut : réveil !
      [alert, 9],
      [lookA, 12],                                       // regard circulaire
      [lookB, 14],
      [hands, 15],                                       // elle découvre ses mains…
      [curl, 11],                                        // … referme les doigts
      [open, 11],                                        // … les rouvre
      [cam, 12, { fx: 'glint' }],                        // la caméra ! petit recul
      [brow, 13],                                        // main au menton, tête penchée : « intéressant… »
      [brow2, 16],
      ['idle', 18],
      ['idle', 7]
    ],
    victory: [
      ['idle', 1],
      [stepMid, 9, { yaw: YM, dx: dxM }],                // pivote sur le pied avant vers le public
      [land, 6, OV],
      [stand, 4, OV],
      [shrug, 11, { ...OV, say: 'Too easy.' }],          // haussement d'épaules
      [shrug2, 13, OV],
      [laugh(1), 6, { ...OV, fx: 'ha' }],                // éclat de rire, tête en arrière
      [laugh(0.35), 5, OV],
      [laugh(1.1), 5, { ...OV, fx: 'ha' }],
      [slap, 7, { ...OV, fx: 'slap' }],                  // … plié en deux, tape sur la cuisse
      [laugh(0.9), 7, { ...OV, fx: 'ha' }],
      [flourish, 10, { ...OV, fx: 'swirl' }],            // moulinet du bras…
      [bow, 15, { ...OV, fx: 'bowing' }],                // … grande révérence
      [bow2, 16, OV],
      [clapO, 14, OV],                                   // ---- boucle : applaudissements lents et ironiques
      [clapS, 7, { ...OV, fx: 'clap' }],
      [clapO, 13, OV],
      [clapS, 7, { ...OV, fx: 'clap' }],
      [clapO, 13, OV],
      [clapS, 7, { ...OV, fx: 'clap' }],
      [clapO, 12, OV],
      [roll1, 14, OV],                                   // yeux au ciel
      [roll2, 14, OV],
      [sigh, 12, OV],                                    // soupir
      [shrug, 12, OV],
      [shrug2, 14, OV],
      [clapO, 14, OV]
    ],
    victoryLoop: 15,
    fx
  };
})();

// ---- victoire de manche : le mime dans la cage de verre ----
(() => {
  const I = POSES.idle;
  const st = { ...I, lean: 0, hd: 0, fh: 10, fk: 8, bh: -10, bk: 6, grip: 0 };
  // paumes à plat sur la vitre de devant : avant-bras verticaux (épaule + coude = 180°), mains à hauteur du visage
  const wall = (f, b, x) => ({ ...st, fs: f, fe: 180 - f, bs: b, be: 180 - b, ...x });
  const A = { yaw: -1.57, dx: 6 }, B = { yaw: -1.57, dx: 18 };
  const roof = { ...st, fs: 178, fe: 6, bs: 178, be: 6, axf: 0.15, axb: 0.15, hd: -18, lean: -2, fh: 26, fk: 34, bh: 6, bk: 34 };
  const knob = { ...st, fs: 62, fe: 50, bs: 25, be: 40, grip: 1, hd: 6 };
  MOTIONS.ameca.win = [
    [st, 10, { yaw: -1.57 }],
    [{ ...st, lean: 6, hd: 4, fs: 20, fe: 30, bs: 20, be: 30 }, 6, A],
    [wall(50, 50, { lean: -8, hd: -6 }), 4, { ...A, fx: 'glass' }],             // bam ! la vitre
    [wall(48, 48, { lean: -2 }), 8, A],
    [wall(62, 40, { headSpin: 0.25 }), 10, A],                                    // les mains glissent sur le verre
    [wall(40, 62, { headSpin: -0.25 }), 10, A],
    [wall(55, 55, {}), 8, A],
    [{ ...st, fs: 0, fe: 6, axf: 1.45, bs: 50, be: 130, headSpin: 0.7 }, 10, { ...A, fx: 'glass' }],        // paroi de côté
    [{ ...st, fs: 0, fe: 6, axf: 1.45, bs: 0, be: 6, axb: 1.45, headSpin: -0.6 }, 10, { ...A, fx: 'glass' }], // les deux parois
    [roof, 10, { ...A, fx: 'glass' }],                                            // le plafond…
    [{ ...roof, fe: 25, be: 25, fh: 40, fk: 60, bh: 18, bk: 60 }, 8, A],          // …qui descend
    [wall(50, 50, { lean: 4, hd: 2, fh: 20, fk: 22, bh: 0, bk: 20 }), 7, A],
    [wall(56, 44, { lean: 2 }), 5, { ...A, fx: 'glass' }],                        // panique : il tape
    [wall(44, 56, { lean: 4 }), 5, { ...A, fx: 'glass' }],
    [knob, 10, A],                                                                // une poignée !
    [{ ...knob, twist: 0.25 }, 6, A],
    [{ ...st, lean: 4, hd: 6, fs: 0, fe: 10, bs: 0, be: 10, axf: 2.0, axb: 2.0 }, 10, { ...B, sfx: 'select' }], // libre
    [{ ...st, lean: 30, hd: 25, fs: 10, fe: 20, bs: 60, be: 110, axf: 0.6 }, 12, B],                         // révérence
    [{ ...st, lean: 2, fs: 15, fe: 20, bs: 15, be: 20 }, 10, B],
    [wall(50, 50, {}), 8, { ...B, fx: 'glass' }],                                 // …et de nouveau dans la cage
    [wall(62, 40, { headSpin: 0.25 }), 10, B],
    [wall(40, 62, { headSpin: -0.25 }), 10, B],
    [wall(50, 50, {}), 10, B]
  ];
  MOTIONS.ameca.winLoop = 20;
  // reflets de la vitre invisible au contact des paumes
  MOTIONS.ameca.fx.glass = (ch, x, footY, sc, face) => {
    AU.sfx('block');
    for (const dx of [-26, 26]) FX.add({ type: 'ring', x: x + dx * sc, y: footY - 128 * sc, size: 22 * sc, life: 12, max: 12, col: '#d8f4ff', lw: 2 });
    for (let i = 0; i < 6; i++) FX.add({ type: 'spark', x: x + rand(-40, 40) * sc, y: footY - rand(100, 160) * sc, vx: 0, vy: rand(-1, 1), size: 2, life: 14, max: 14, col: '#ffffff', len: 2 });
  };
})();
