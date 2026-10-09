'use strict';
/* Animations personnelles : t800 — voir le contrat en tête de js/motions.js
   intro   : échauffement martial : high kick armé sur le côté, poing serré, salut poing-paume (bao quan li) tête baissée, garde
   victory : intimidation : avance d'un pas, roundhouse dans le vide, se frappe la poitrine, bras croisés face caméra */
(() => {
  const I = POSES.idle;
  const salute = { ...I, lean: 0, hd: 6, fs: 72, fe: 72, bs: 72, be: 72, axf: 0.15, axb: 0.15, fh: 10, fk: 8, bh: -10, bk: 6 };
  const chest = { ...I, lean: -4, hd: 10, fs: 95, fe: 140, bs: 95, be: 140, fh: 12, fk: 8, bh: -12, bk: 6 };
  const crossed = { ...I, lean: -6, hd: 12, fs: 80, fe: 150, bs: 80, be: 150, axf: 0.3, axb: 0.3, fh: 10, fk: 8, bh: -10, bk: 6, hxf: 0.15, hxb: 0.15 };
  MOTIONS.t800 = {
    intro: [
      ['idle', 0],
      ['rkChamber', 8],
      ['rkHigh', 7, { fx: 'whiffH' }],
      ['rkHigh', 8],
      ['rkChamber', 6],
      ['idle', 8],
      [{ ...I, lean: 0, hd: 2, fs: 125, fe: 55, grip: 1 }, 10, { fx: 'charge' }],
      [{ ...I, lean: 0, hd: 2, fs: 125, fe: 55, grip: 1 }, 10],
      [salute, 12, { yaw: -1.4 }],
      [{ ...salute, lean: 16, hd: 22 }, 10, { yaw: -1.4, sfx: 'hitL' }],
      [{ ...salute, lean: 16, hd: 22 }, 12, { yaw: -1.4 }],
      ['idle', 14, { yaw: -0.42 }],
      ['idle', 10]
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
