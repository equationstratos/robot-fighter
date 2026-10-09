'use strict';
/* Animations personnelles : t800 — voir le contrat en tête de js/motions.js
   intro   : la démo vidéo du « Rekbot » (REK) : kip-up depuis le dos, high kick, coup de pied sauté en rotation,
             garde qui sautille avec genou de blocage, rafale de poings
   victory : intimidation : avance d'un pas, roundhouse dans le vide, se frappe la poitrine, bras croisés face caméra */
(() => {
  const I = POSES.idle;
  const lie = { ...POSES.down, rot: -90 };
  const S = p => ({ ...p, spin: Math.PI * 2 }); // après le tour complet du coup sauté (2π ≡ 0, sans rotation inverse)
  const salute = { ...I, lean: 0, hd: 6, fs: 72, fe: 72, bs: 72, be: 72, axf: 0.15, axb: 0.15, fh: 10, fk: 8, bh: -10, bk: 6 };
  const chest = { ...I, lean: -4, hd: 10, fs: 95, fe: 140, bs: 95, be: 140, fh: 12, fk: 8, bh: -12, bk: 6 };
  const crossed = { ...I, lean: -6, hd: 12, fs: 80, fe: 150, bs: 80, be: 150, axf: 0.3, axb: 0.3, fh: 10, fk: 8, bh: -10, bk: 6, hxf: 0.15, hxb: 0.15 };
  MOTIONS.t800 = {
    // intro : la démo du « Rekbot » de REK (T800) : couché sur le dos, kip-up (jambes par-dessus la tête puis
    // coup de reins), high kick circulaire, coup de pied sauté en rotation, garde qui sautille + genou de blocage, rafale de poings
    intro: [
      [lie, 0, { yaw: -1.2 }],
      [lie, 10, { yaw: -1.2 }],
      [{ ...lie, fh: 125, fk: 15, bh: 125, bk: 15, fs: 150, fe: 60, bs: 150, be: 60 }, 8, { yaw: -1.2 }],      // jambes par-dessus la tête
      [{ ...lie, rot: -112, fh: 140, fk: 10, bh: 140, bk: 10, fs: 172, fe: 80, bs: 172, be: 80 }, 5, { yaw: -1.2 }],
      [{ ...POSES.crouch, rot: -25, fh: 40, fk: 110, bh: 20, bk: 110, fs: 150, fe: 30, bs: 150, be: 30 }, 6, { yaw: -1.0, dy: 30, fx: 'rise' }], // coup de reins
      [{ ...POSES.crouch, hd: -10 }, 7, { yaw: -0.8, dy: 0, sfx: 'land' }],
      ['idle', 8],
      ['rkChamber', 6], ['rkHigh', 6, { fx: 'whiffH' }], ['rkHigh', 6], ['rkChamber', 5], ['idle', 6],
      ['cyWind', 7, { fx: 'charge' }], ['cyLift', 5, { dy: 20 }], ['cyAir', 6, { dy: 50 }], ['cyKick', 5, { dy: 56, fx: 'whiffH' }],
      ['cyFall', 6, { dy: 24 }], ['cyLand', 6, { dy: 0, sfx: 'land' }], [S(I), 10],
      [S({ ...I, fh: 70, fk: 95 }), 6], [S(I), 6], [S({ ...I, fh: 70, fk: 95 }), 6], [S(I), 6],               // garde qui sautille, genou de blocage
      [S(POSES.lp), 4, { fx: 'whiff' }], [S(I), 3], [S(POSES.lp), 4, { fx: 'whiff' }], [S(POSES.hp), 5, { fx: 'whiffH' }],
      [S(POSES.lp), 4, { fx: 'whiff' }], [S(POSES.hp), 5, { fx: 'whiffH' }], [S(I), 12]
    ],
    victory: [
      [{ ...I, lean: 4, hd: 4, fs: 30, fe: 60, bs: 30, be: 60 }, 12, { dx: 15 }],
      ['rkChamber', 6, { dx: 15 }],
      ['rkHigh', 6, { dx: 15, fx: 'whiffH' }],
      ['rkHigh', 6, { dx: 15 }],
      ['rkChamber', 6, { dx: 15 }],
      [chest, 9, { dx: 15, yaw: -1.5 }],
      [{ ...chest, fs: 112, fe: 118, bs: 112, be: 118 }, 6, { dx: 15, yaw: -1.5 }],
      [chest, 5, { dx: 15, yaw: -1.5, sfx: 'hitL' }],
      [{ ...chest, fs: 112, fe: 118, bs: 112, be: 118 }, 6, { dx: 15, yaw: -1.5 }],
      [chest, 5, { dx: 15, yaw: -1.5, sfx: 'hitL' }],
      [crossed, 12, { dx: 15, yaw: -1.5, say: 'Next.' }],
      [{ ...crossed, lean: -3, hd: 8 }, 30, { dx: 15, yaw: -1.5 }],
      [crossed, 30, { dx: 15, yaw: -1.5 }]
    ],
    victoryLoop: 11
  };
})();
