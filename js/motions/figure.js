'use strict';
/* Animations personnelles : figure — voir le contrat en tête de js/motions.js
   intro   : « vérification des systèmes » façon démos Helix : un petit pas précis, il lève la main ouverte devant
             son visage, l'inspecte, la referme doigt après doigt (trois crans), regarde le public, hoche la tête, garde
   victory : le professionnel discret : il se tourne vers le public, main sur le cœur, légère révérence
             (« Task complete. »), se redresse, mains dans le dos ; en boucle : un coup d'œil précis à son poignet
             (l'heure, le prochain travail…), petit hochement de tête satisfait, mains dans le dos */
(() => {
  const ch = ROSTER.find(r => r.id === 'figure'), s = ch.scale, Lg = 44 * s * ch.leg, HO = 1.8 * s, HZ = 12.5 * s;
  const PI = Math.PI;
  // jambe : pied à (x, y) de l'articulation de hanche (y vers le bas) → [hanche, genou]
  const leg = (x, y) => { const d = Math.min(Math.hypot(x, y), 2 * Lg * 0.9999), dir = Math.atan2(x, y) / D2R, a = Math.acos(d / (2 * Lg)) / D2R; return [dir + a, 2 * a]; };
  // pose aux pieds placés en F / B (x depuis le centre des hanches) à la profondeur hF / hB sous la hanche
  const st = (o, F, B, hF, hB = hF) => { const p = mkPose({ ...POSES.idle, ...o }); [p.fh, p.fk] = leg(F - HO, hF); [p.bh, p.bk] = leg(B + HO, hB); return p; };
  const G = skeleton(ch, POSES.idle, 1), F0 = G.ffo.x, B0 = G.bfo.x, H0 = G.ffo.y, HB = G.bfo.y;
  // courbes : suite d'images-clés d'une image, fn(u) → [pose, options], u ∈ ]0, 1]
  const track = (n, fn, o0) => Array.from({ length: n }, (_, i) => { const [p, o] = fn((i + 1) / n); return [p, 1, i === 0 && o0 ? { ...o, ...o0 } : o]; });
  const mixO = (a, b, u) => { const o = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k] = lerp(a[k] ?? POSES.idle[k] ?? 0, b[k] ?? POSES.idle[k] ?? 0, u); return o; };
  const ss = u => u * u * (3 - 2 * u), eOut = u => 1 - (1 - u) * (1 - u);
  // le pied avant reste planté pendant que le corps pivote : décalage dx qui garde son x écran
  const Y0 = -0.42, CAM = -PI / 2;
  const fX = (lx, lz, yaw, dx) => dx + lx * Math.cos(yaw) + lz * Math.sin(yaw);
  const XF0 = fX(F0, HZ, Y0, 0), anchor = (lx, yaw) => XF0 - lx * Math.cos(yaw) - HZ * Math.sin(yaw);

  // ---- sons et effets ----
  const tick = (f, v = 0.06) => { AU.tone(f, 0.05, 'square', v); AU.tone(f * 1.5, 0.04, 'sine', v * 0.6, null, 0.03); };
  const handAt = (x, footY, sc, face, hx, hy, dx = 0) => ({ x: x + face * ((sc !== 1 ? dx : 0) + hx) * sc, y: footY - hy * sc });

  // ======================= INTRO : vérification des systèmes =======================
  // (démos Helix : le robot regarde ses deux mains, les referme cran par cran, relève la tête, garde)
  const YI = -0.88, BS = B0 + 22, DS = 85; // orientation 3/4 public, pied arrière rapproché, hanches hautes
  const DXI = anchor(F0, YI);
  const uRelax = { lean: 2, hd: 0, fs: 8, fe: 20, bs: 8, be: 22, axf: 0.12, axb: 0.12, grip: 0.35 };
  const uGuard = { lean: POSES.idle.lean, hd: POSES.idle.hd, fs: 50, fe: 100, bs: 28, be: 118, grip: 1 };
  // les deux avant-bras levés devant le ventre, mains ouvertes, regard baissé sur elles
  const uHands = { lean: 4, hd: 24, fs: 34, fe: 76, bs: 36, be: 74, axf: 0.2, axb: 0.2, grip: 0, headSpin: 0.06 };
  const hands = o => st({ ...uHands, ...o }, F0, BS, DS);
  const hsCam = CAM - YI; // tête vers le public
  const oI = { yaw: YI, dx: DXI };
  const uDone = { ...uHands, grip: 1, fs: 38, fe: 86, bs: 36, be: 88, hd: -1, headSpin: hsCam };
  const intro = [
    ['idle', 4],
    // petit pas précis : le pied arrière se rapproche, le corps se redresse et se tourne de 3/4
    ...track(18, u => {
      const e = ss(u), y = lerp(Y0, YI, e), lift = 9 * Math.sin(PI * clamp(u * 1.15, 0, 1));
      return [st(mixO(uGuard, uRelax, e), F0, lerp(B0, BS, ss(clamp(u * 1.15, 0, 1))), lerp(H0, DS, e), lerp(HB, DS, e) - lift), { yaw: y, dx: anchor(F0, y) }];
    }),
    // les mains montent devant lui, paumes ouvertes, la tête se penche pour les regarder
    ...track(18, u => [hands(mixO(uRelax, uHands, ss(u))), oI], { fx: 'scan' }),
    // il les inspecte : la tête balaie de l'une à l'autre
    ...track(16, u => [hands({ headSpin: 0.06 + 0.22 * Math.sin(PI * ss(u)), hd: 24 + 2 * Math.sin(PI * u) }), oI]),
    // test des doigts : à moitié fermés, rouverts
    [hands({ grip: 0.5 }), 6, oI],
    [hands({ grip: 0 }), 7, oI],
    // puis fermeture en trois crans précis
    [hands({ grip: 0.38 }), 4, { ...oI, fx: 'tick1' }],
    [hands({ grip: 0.38 }), 6, oI],
    [hands({ grip: 0.7 }), 4, { ...oI, fx: 'tick2' }],
    [hands({ grip: 0.7 }), 6, oI],
    [hands({ grip: 1, fe: 82, be: 80 }), 4, { ...oI, fx: 'fist' }],
    [hands({ grip: 1, fe: 82, be: 80, hd: 26 }), 9, oI],
    // regard vers le public, hochement de tête
    [hands({ ...uDone, hd: 0 }), 12, oI],
    [hands({ ...uDone, hd: 14 }), 7, oI],
    [hands(uDone), 9, oI],
    // retour en garde : le pied arrière recule, les poings montent, le corps se remet de profil
    ...track(20, u => {
      const e = ss(u), y = lerp(YI, Y0, e), lift = 9 * Math.sin(PI * clamp(u * 1.15, 0, 1));
      const o = mixO(uDone, uGuard, e);
      return [st(o, F0, lerp(BS, B0, ss(clamp(u * 1.15, 0, 1))), lerp(DS, H0, e), lerp(DS, HB, e) - lift), { yaw: y, dx: anchor(F0, y) }];
    }),
    ['idle', 14]
  ];

  // ======================= VICTOIRE : main sur le cœur, révérence, salut, mains jointes =======================
  const YV = -0.85, FT = 1.5, DT = 87; // de trois quarts vers le public (la révérence reste lisible), pieds joints, debout
  const DXV = anchor(FT, YV);
  const uStand = { lean: 0, hd: 0, fs: 4, fe: 14, bs: 4, be: 14, axf: 0.12, axb: 0.12, grip: 0.3 };
  const uHeart = { ...uStand, fs: 38, fe: 122, axf: 1.1, grip: 0.08, hd: 6 };
  const bowO = (k, o) => ({ ...uHeart, lean: 34 * k, hd: 6 + 14 * k, fs: 38 + 14 * k, fe: 122 - 4 * k, bs: 4 + 6 * k, be: 14 + 4 * k, ...o });
  // salut : la main ouverte à la tempe, puis relâchée d'un geste net vers le public
  const uSalute = { ...uStand, fs: 95, fe: 135, axf: 0.9, grip: 0, hd: -2, headSpin: 0.06 };
  const uFlick = { ...uStand, fs: 82, fe: 18, axf: 1.45, grip: 0, hd: -5, headSpin: -0.04 };
  // mains jointes bas devant lui, posture de maître d'hôtel
  const uClasp = { ...uStand, fs: 6, fe: 50, axf: -0.42, bs: 4, be: 52, axb: -0.4, grip: 0.45, hd: -2 };
  const hsV = CAM - YV;
  const up = o => st(o, FT, FT, DT);
  const opt = { yaw: YV, dx: DXV };
  const main = [
    ['idle', 4],
    // il ramène le pied arrière à côté du pied avant en se tournant vers le public
    ...track(20, u => {
      const e = ss(u), y = lerp(Y0, YV, e), lift = 10 * Math.sin(PI * clamp(u * 1.1, 0, 1)), F = lerp(F0, FT, e);
      return [st(mixO(uGuard, uStand, e), F, lerp(B0, FT, ss(clamp(u * 1.1, 0, 1))), lerp(H0, DT, e), lerp(HB, DT, e) - lift), { yaw: y, dx: anchor(F, y) }];
    }),
    // main sur le cœur…
    [up(uHeart), 14, opt],
    // …révérence
    ...track(18, u => [up(bowO(ss(u))), opt], { say: 'Task complete.' }),
    [up(bowO(1, { lean: 35, hd: 21 })), 12, opt],
    ...track(16, u => [up(bowO(1 - ss(u), { hd: lerp(20, -2, ss(u)) })), opt]),
    // salut à la tempe…
    ...track(12, u => [up(mixO({ ...uHeart, hd: -2 }, uSalute, eOut(u))), opt]),
    [up({ ...uSalute, fe: 138, hd: -3 }), 6, opt],
    // …relâché d'un coup sec
    ...track(8, u => [up(mixO({ ...uSalute, fe: 138, hd: -3 }, uFlick, eOut(u))), opt], { fx: 'flick' }),
    [up({ ...uFlick, fe: 14, axf: 1.5 }), 10, opt],
    // les mains se rejoignent devant la ceinture
    ...track(20, u => [up(mixO({ ...uFlick, fe: 14, axf: 1.5 }, uClasp, ss(u))), opt]),
    [up(uClasp), 12, opt]
  ];
  const loop = [
    // respiration calme, mains jointes
    ...track(36, u => [up({ ...uClasp, lean: 1.2 * Math.sin(PI * u), hd: -2 + 1.5 * Math.sin(PI * u) }), opt]),
    // regard vers le public, petit hochement satisfait
    [up({ ...uClasp, hd: 0, headSpin: hsV }), 14, opt],
    [up({ ...uClasp, hd: 12, headSpin: hsV }), 7, { ...opt, fx: 'tick1' }],
    [up({ ...uClasp, hd: -2, headSpin: hsV }), 9, opt],
    [up({ ...uClasp, hd: -2, headSpin: hsV * 0.9 }), 18, opt],
    ...track(14, u => [up(mixO({ ...uClasp, hd: -2, headSpin: hsV * 0.9 }, uClasp, ss(u))), opt]),
    // et de nouveau le salut, relâché d'un coup sec
    ...track(12, u => [up(mixO(uClasp, uSalute, eOut(u))), opt]),
    [up({ ...uSalute, fe: 138, hd: -3 }), 6, opt],
    ...track(8, u => [up(mixO({ ...uSalute, fe: 138, hd: -3 }, uFlick, eOut(u))), opt], { fx: 'flick' }),
    [up({ ...uFlick, fe: 14, axf: 1.5 }), 10, opt],
    ...track(20, u => [up(mixO({ ...uFlick, fe: 14, axf: 1.5 }, uClasp, ss(u))), opt]),
    [up(uClasp), 12, opt] // = dernière clé de main
  ];

  MOTIONS.figure = {
    intro,
    victory: [...main, ...loop],
    victoryLoop: main.length,
    fx: {
      // le regard s'allume : fin balayage lumineux devant la visière
      scan(ch, x, footY, sc, face) { AU.tone(1300, 0.25, 'sine', 0.05, 2100); },
      // la main se referme cran par cran
      tick1(ch, x, footY, sc, face) { tick(1500); },
      tick2(ch, x, footY, sc, face) { tick(1800); },
      fist(ch, x, footY, sc, face) {
        tick(2200, 0.07); AU.sfx('block');
        const h = handAt(x, footY, sc, face, 30, 128, DXI);
        FX.add({ type: 'glow', x: h.x, y: h.y, size: 16 * sc, life: 18, max: 18, col: ch.accent, core: '#fff' });
        FX.add({ type: 'ring', x: h.x, y: h.y, size: 22 * sc, life: 14, max: 14, col: ch.proj.color, lw: 2 });
      },
      // le salut relâché : petit éclat au bout des doigts
      flick(ch, x, footY, sc, face) {
        AU.tone(1800, 0.08, 'sine', 0.05, 2600); AU.sfx('whiff');
        const h = handAt(x, footY, sc, face, 46, 150, DXV);
        FX.add({ type: 'star', x: h.x, y: h.y, size: 10 * sc, life: 16, max: 16, col: '#e8f4ff', rot: 0.4 });
      }
    }
  };
})();
