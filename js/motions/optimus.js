'use strict';
/* Animations personnelles : optimus — voir le contrat en tête de js/motions.js
   intro   : courte forme de kung-fu (vidéo d'entraînement Tesla 2025) : position prête poings aux hanches,
             deux frappes de paume, le poids passe sur la jambe arrière, la grue sur une jambe (ailes ouvertes),
             retombée en cavalier avec double poussée des paumes, salut poing-paume tête baissée, garde
   victory : petit pas vers le public, grand signe de la main, puis la posture de l'arbre en équilibre
             (vidéo « yoga » d'Optimus, 2023) : bras en croix, mains jointes « namaste » ; en boucle : les bras
             s'ouvrent, montent en V au-dessus de la tête, redescendent, mains jointes — respiration calme */
(() => {
  const ch = ROSTER.find(r => r.id === 'optimus'), s = ch.scale, Lg = 44 * s * ch.leg, HO = 1.8 * s, HZ = 12 * s;
  const PI = Math.PI;
  // jambe : pied à (x, y) de l'articulation de hanche (y vers le bas) → [hanche, genou]
  const leg = (x, y) => { const d = Math.min(Math.hypot(x, y), 2 * Lg * 0.9999), dir = Math.atan2(x, y) / D2R, a = Math.acos(d / (2 * Lg)) / D2R; return [dir + a, 2 * a]; };
  const G = skeleton(ch, POSES.idle, 1), F0 = G.ffo.x, B0 = G.bfo.x, H0 = G.ffo.y, HB = G.bfo.y;
  const Y0 = -0.42;
  const ss = u => u * u * (3 - 2 * u), eOut = u => 1 - (1 - u) * (1 - u), eIn = u => u * u;
  const lin = u => u, late = (a, b) => u => ss(clamp((u - a) / (b - a), 0, 1));
  // position des pieds au sol (x écran, avant / arrière) ↔ x dans le plan du corps, selon l'orientation et le décalage
  const wX = (lx, lz, yaw, dx) => dx + lx * Math.cos(yaw) + lz * Math.sin(yaw);
  const lX = (X, lz, yaw, dx) => (X - dx - lz * Math.sin(yaw)) / Math.cos(yaw);
  const UP = ['lean', 'hd', 'fs', 'fe', 'bs', 'be', 'grip', 'twist', 'headSpin', 'axf', 'axb', 'hxf', 'hxb', 'kyf', 'kyb'];
  const mixO = (a, b, u) => { const o = {}; for (const k of UP) o[k] = lerp(a[k] ?? POSES.idle[k] ?? 0, b[k] ?? POSES.idle[k] ?? 0, u); return o; };
  /* état : o (haut du corps), wF / wB (x au sol des pieds), dF / dB (profondeur des pieds sous la hanche),
     yaw, dx, dy, kF / kB : [hanche, genou] d'une jambe levée et son poids 0..1 (lF / lB) */
  const pose = S => {
    const p = mkPose({ ...POSES.idle, ...S.o });
    [p.fh, p.fk] = leg(lX(S.wF, HZ, S.yaw, S.dx) - HO, S.dF);
    [p.bh, p.bk] = leg(lX(S.wB, -HZ, S.yaw, S.dx) + HO, S.dB);
    if (S.lF) { p.fh = lerp(p.fh, S.kF[0], S.lF); p.fk = lerp(p.fk, S.kF[1], S.lF); }
    if (S.lB) { p.bh = lerp(p.bh, S.kB[0], S.lB); p.bk = lerp(p.bk, S.kB[1], S.lB); }
    return p;
  };
  const NUM = ['wF', 'wB', 'dF', 'dB', 'yaw', 'dx', 'dy', 'lF', 'lB'];
  const mixS = (A, B, e, eo) => {
    const S = { o: mixO(A.o, B.o, eo), kF: B.kF || A.kF, kB: B.kB || A.kB };
    for (const k of NUM) S[k] = lerp(A[k] || 0, B[k] || 0, e);
    if (A.kF && B.kF) S.kF = [lerp(A.kF[0], B.kF[0], e), lerp(A.kF[1], B.kF[1], e)];
    if (A.kB && B.kB) S.kB = [lerp(A.kB[0], B.kB[0], e), lerp(A.kB[1], B.kB[1], e)];
    return S;
  };
  const ev = o => o ? Object.fromEntries(Object.entries(o).filter(([k]) => ['fx', 'say', 'sfx'].includes(k))) : {};
  // segment : n images-clés d'une image de A vers B ; e = courbe du corps, eo = courbe du haut du corps,
  // stepF / stepB = hauteur de l'arc d'un pied qui fait un pas, fn = retouche libre de l'état (u, S)
  const go = (n, A, B, o = {}) => Array.from({ length: n }, (_, i) => {
    const u = (i + 1) / n, e = (o.e || ss)(u), S = mixS(A, B, e, (o.eo || o.e || ss)(u));
    if (o.stepF) S.dF -= o.stepF * Math.sin(PI * u);
    if (o.stepB) S.dB -= o.stepB * Math.sin(PI * u);
    if (o.fn) o.fn(u, S);
    return [pose(S), 1, { yaw: S.yaw, dx: S.dx, dy: S.dy, ...(i === 0 ? ev(o) : {}) }];
  });
  const hold = (n, S, o) => [[pose(S), n, { yaw: S.yaw, dx: S.dx, dy: S.dy, ...ev(o) }]];
  const with_ = (S, o, more) => ({ ...S, ...more, o: { ...S.o, ...o } });

  // garde (idle) exprimée en état
  const oGuard = mixO(POSES.idle, POSES.idle, 0);
  const WF = wX(F0, HZ, Y0, 0), WB = wX(B0, -HZ, Y0, 0);
  const guard = { o: oGuard, wF: WF, wB: WB, dF: H0, dB: HB, yaw: Y0, dx: 0, dy: 0 };
  // décalage dx qui place une articulation de hanche à l'aplomb d'un pied (poids sur ce pied)
  const dxOverB = yaw => WB - wX(-HO, -HZ, yaw, 0);

  // ======================= INTRO : forme de kung-fu =======================
  const ready = { ...guard, dF: 76, dB: 77, dx: -5, o: { ...oGuard, lean: 3, hd: 0, fs: -26, fe: 112, bs: -24, be: 114, axf: 0.15, axb: 0.15, grip: 1, twist: -0.12 } };
  const palm1 = { ...ready, dF: 72, dB: 72, dx: 6, o: { ...ready.o, lean: 13, hd: -5, fs: 90, fe: 2, axf: 0, grip: 0.1, twist: 0.36 } };
  const palm1s = with_(palm1, { lean: 11, fs: 86, fe: 9, twist: 0.3 }, { dx: 4, dF: 73, dB: 73 });
  const palm2 = { ...ready, dF: 72, dB: 72, dx: 6, o: { ...ready.o, lean: 13, hd: -5, bs: 90, be: 2, axb: 0, fs: -28, fe: 114, grip: 0.1, twist: -0.36 } };
  const palm2s = with_(palm2, { lean: 11, bs: 86, be: 9, twist: -0.3 }, { dx: 4, dF: 73, dB: 73 });
  // le poids passe sur la jambe arrière, les bras descendent en cercle, mains ouvertes
  const YC = -0.62;
  const shift = { ...guard, dF: 74, dB: 74, dx: (B0 + 0.3 * (F0 - B0)) * Math.cos(Y0), o: { ...oGuard, lean: 4, hd: -4, fs: 30, fe: 40, bs: 24, be: 44, axf: 0.5, axb: 0.5, grip: 0, twist: 0.05 } };
  // la grue : genou avant haut, bras en ailes, l'appui pivote un peu vers le public
  const crane = { ...shift, yaw: YC, dx: dxOverB(YC), dB: 86, dF: 74, lF: 1, kF: [104, 120], o: { ...oGuard, lean: -2, hd: -6, fs: 14, fe: 16, bs: 14, be: 16, axf: 1.42, axb: 1.42, grip: 0, twist: 0 } };
  const crane2 = with_(crane, { axf: 1.56, axb: 1.56, hd: -9, lean: -3, fe: 10, be: 10 }, { kF: [108, 124] });
  // retombée : cavalier large et bas, double poussée des paumes
  const horse = { ...guard, dF: 68, dB: 68, dx: (F0 + B0) / 2 * Math.cos(Y0), lF: 0, o: { ...oGuard, lean: 9, hd: -3, fs: 90, fe: 2, bs: 88, be: 4, axf: 0, axb: 0, grip: 0, twist: 0 } };
  const horseS = with_(horse, { lean: 7, fs: 86, fe: 9, bs: 84, be: 11 }, { dF: 70, dB: 70 });
  // salut poing-paume : le pied avant revient contre le pied arrière (pieds joints), le corps se tourne vers le public
  const YS = -0.95, dxS = WB - wX(-HO, -HZ, YS, 0);
  const oSal = { ...oGuard, lean: 2, hd: 0, fs: 30, fe: 95, bs: 32, be: 92, axf: -0.42, axb: -0.4, grip: 0.6, twist: 0, headSpin: 0 };
  const sal = { ...guard, wF: wX(HO, HZ, YS, dxS), dF: 86, dB: 86, yaw: YS, dx: dxS, o: oSal };
  const bow = with_(sal, { lean: 16, hd: 30, fs: 36, bs: 38 });

  const intro = [
    ['idle', 4],
    ...go(16, guard, ready, { e: ss }),
    ...go(6, ready, palm1, { e: eOut, fx: 'whiff' }),
    ...go(8, palm1, palm1s),
    ...go(6, palm1s, palm2, { e: eOut, fx: 'whiff' }),
    ...go(8, palm2, palm2s),
    ...go(14, palm2s, shift, { e: ss }),
    ...go(14, shift, crane, { e: ss, eo: late(0.1, 1), fx: 'rise_' }),
    ...go(15, crane, crane2, { e: ss }),
    // le pied retombe vite (accélération), les paumes partent juste après
    ...go(7, crane2, horse, { e: eIn, eo: late(0.3, 1), fx: 'stomp' }),
    ...go(9, horse, horseS, { e: eOut }),
    ...go(16, horseS, sal, { e: ss, eo: late(0.15, 1), stepF: 10 }),
    ...hold(4, sal),
    ...go(10, sal, bow, { e: ss }),
    ...hold(8, bow),
    ...go(9, bow, sal, { e: ss }),
    // retour en garde : le pied avant se repose devant (avant que le poids ne passe dessus), puis le talon arrière se lève
    ...go(20, sal, guard, { e: ss, fn: (u, S) => {
      const k = ss(clamp(u / 0.62, 0, 1)), m = ss(clamp((u - 0.62) / 0.38, 0, 1));
      S.wF = lerp(sal.wF, WF, k); S.yaw = lerp(YS, Y0, k); S.dx = lerp(dxS, 0, k);
      S.dB = u < 0.62 ? lerp(86, 76, k) : lerp(76, HB, m);
      S.dF = u < 0.62 ? lerp(86, 76, k) - 10 * Math.sin(PI * clamp(u / 0.62, 0, 1)) : lerp(76, H0, m);
    } }),
    ['idle', 10]
  ];

  // ======================= VICTOIRE : signe de la main, posture de l'arbre =======================
  const YV = -1.3;
  // pied avant planté, pied arrière ramené à côté : pieds sous les hanches
  const dxV = WF - wX(HO, HZ, YV, 0);
  const stand = { o: { lean: 0, hd: 2, fs: 6, fe: 18, bs: 6, be: 18, axf: 0.12, axb: 0.12, grip: 0.4 }, wF: WF, wB: wX(-HO, -HZ, YV, dxV), dF: 87, dB: 87, yaw: YV, dx: dxV, dy: 0 };
  const wave = (ax, fe, hd) => with_(stand, { lean: -2, hd, fs: 2, fe, axf: ax, bs: 6, be: 22, axb: 0.15, grip: 0, headSpin: 0.12 });
  // l'arbre : pied arrière contre le genou d'appui
  const KT = [34, 152];
  const treeT = with_(stand, { lean: 0, hd: 0, fs: 4, fe: 8, bs: 4, be: 8, axf: 1.5, axb: 1.5, grip: 0, hxb: 0.95, kyb: 0.9 }, { lB: 1, kB: KT, dF: 87 });
  const namaste = with_(treeT, { fs: 30, fe: 88, bs: 30, be: 88, axf: -0.32, axb: -0.32, hd: 6, lean: 2 });
  const namaste2 = with_(namaste, { hd: 9, lean: 3 });
  const veeT = with_(treeT, { fs: 2, fe: 6, bs: 2, be: 6, axf: 2.75, axb: 2.75, hd: -8, lean: -2 });

  const vMain = [
    ['idle', 4],
    ...go(20, guard, stand, { e: ss, stepB: 9 }),
    ...go(10, stand, wave(2.5, 25, 8), { e: ss }),
    ...go(7, wave(2.5, 25, 8), wave(2.05, 50, 10), { e: ss }),
    ...go(7, wave(2.05, 50, 10), wave(2.6, 20, 8), { e: ss }),
    ...go(7, wave(2.6, 20, 8), wave(2.05, 50, 10), { e: ss }),
    ...go(7, wave(2.05, 50, 10), wave(2.55, 24, 8), { e: ss }),
    ...go(16, wave(2.55, 24, 8), treeT, { e: ss, fx: 'zen' }),
    ...go(14, treeT, namaste, { e: ss, say: 'Namaste' }),
    ...hold(18, namaste2)
  ];
  const vLoop = [
    ...go(26, namaste2, treeT, { e: ss }),
    ...go(30, treeT, veeT, { e: ss, fx: 'zen' }),
    ...hold(16, veeT),
    ...go(30, veeT, treeT, { e: ss }),
    ...go(26, treeT, namaste, { e: ss }),
    ...hold(20, namaste2) // = dernière clé de vMain
  ];

  MOTIONS.optimus = {
    intro,
    victory: [...vMain, ...vLoop],
    victoryLoop: vMain.length,
    fx: {
      // le genou monte : souffle d'air
      rise_(ch, x, footY, sc, face) { AU.sfx('whiff'); },
      // pied qui frappe le sol : poussière + onde au sol
      stomp(ch, x, footY, sc, face) {
        AU.sfx('land'); AU.sfx('whiffH');
        dust(x, footY, 8);
        FX.add({ type: 'ring', x: x + face * 10 * sc, y: footY, size: 70 * sc, life: 16, max: 16, col: ch.accent, flat: 0.25, lw: 5 });
      },
      // posture de l'arbre : halo calme qui monte du corps
      zen(ch, x, footY, sc, face) {
        x += face * (sc !== 1 ? dxV * sc : 0); const hy = footY - 205 * sc;
        FX.add({ type: 'ring', x, y: hy, size: 46 * sc, life: 26, max: 26, col: ch.accent, flat: 1, lw: 4 });
        for (let i = 0; i < 12; i++) FX.add({ type: 'glow', x: x + rand(-40, 40) * sc, y: footY - rand(10, 190) * sc, vy: -rand(0.6, 1.6) * sc, size: rand(4, 8) * sc, life: 40, max: 40, col: ch.accent });
      }
    }
  };
})();
