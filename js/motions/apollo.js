'use strict';
/* Animations personnelles : apollo — voir le contrat en tête de js/motions.js
   intro   : héritage NASA : accroupi, il charge comme un lanceur, se dresse en pointant le ciel (« lift-off »),
             puis soulève une caisse imaginaire (robot de manutention), hoche la tête, garde
   victory : salut d'astronaute face caméra, saut « fusée » bras au ciel, pouce levé vers le public */
(() => {
  const I = POSES.idle, C = POSES.crouch;
  const stand = { ...I, lean: 0, hd: -2, fh: 12, fk: 8, bh: -12, bk: 6 };
  const point = { ...stand, lean: -8, hd: -22, fs: 178, fe: 0, bs: 30, be: 40, grip: 0 };
  const box = { ...stand, lean: 2, fs: 80, fe: 70, bs: 80, be: 70, grip: 0.6 };
  const salute = { ...stand, fs: 150, fe: 125, bs: 15, be: 15, grip: 0 };
  const thumb = { ...stand, hd: 6, fs: 72, fe: 32, grip: 1, bs: 0, be: 60, axb: 0.6 };
  MOTIONS.apollo = {
    intro: [
      [C, 0, { yaw: -0.9 }],
      [{ ...C, hd: -25, fs: 20, fe: 20, bs: 20, be: 20 }, 14, { yaw: -0.9, fx: 'charge' }],
      [point, 10, { yaw: -1.1, dy: 22, fx: 'rise' }],
      [point, 14, { yaw: -1.1, dy: 0 }],
      [{ ...C, lean: 35, hd: -10, fs: 60, fe: 10, bs: 60, be: 10, grip: 0.3 }, 12, { yaw: -0.9 }],
      [box, 12, { yaw: -0.9, sfx: 'move' }],
      [{ ...box, hd: 16 }, 6, { yaw: -0.9 }],
      [{ ...box, hd: -2 }, 6, { yaw: -0.9 }],
      ['idle', 12, { yaw: -0.42 }],
      ['idle', 10]
    ],
    victory: [
      [salute, 12, { yaw: -1.5 }],
      [salute, 16, { yaw: -1.5, say: 'Mission accomplished.' }],
      [{ ...C, hd: -10 }, 8, { yaw: -1.5, fx: 'charge' }],
      [{ ...POSES.taunt, fh: 20, fk: 30, bh: 0, bk: 30 }, 9, { yaw: -1.5, dy: 55, fx: 'rise' }],
      [{ ...C, hd: -6 }, 8, { yaw: -1.5, dy: 0 }],
      [thumb, 10, { yaw: -1.5 }],
      [{ ...thumb, fs: 82, fe: 42 }, 9, { yaw: -1.5 }],
      [{ ...thumb, fs: 64, fe: 24 }, 9, { yaw: -1.5 }],
      [thumb, 9, { yaw: -1.5 }]
    ],
    victoryLoop: 6
  };
})();
