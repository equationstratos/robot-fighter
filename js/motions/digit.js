'use strict';
/* Animations personnelles : digit — voir le contrat en tête de js/motions.js
   intro   : le travailleur d'entrepôt : accroupi, il soulève un bac imaginaire, hoche la tête comme un oiseau,
             le repose, petit saut sur ses genoux d'autruche et garde
   victory : pavane d'autruche (genoux hauts), saut bras levés « livré ! », puis petite danse de la tête bras en V */
(() => {
  const I = POSES.idle, C = POSES.crouch;
  const stand = { ...I, lean: 4, hd: 0, fh: 10, fk: 10, bh: -8, bk: 8 };
  const tote = { ...stand, fs: 85, fe: 10, bs: 85, be: 10, grip: 0.6 };
  const pick = { ...C, lean: 40, hd: -25, fs: 80, fe: 20, bs: 80, be: 20, grip: 0.2 };
  const V = { ...stand, hd: 10, fs: 0, fe: 10, bs: 0, be: 10, axf: 2.5, axb: 2.5, grip: 0 };
  MOTIONS.digit = {
    intro: [
      [pick, 0, { yaw: -1.0 }],
      [tote, 18, { yaw: -1.0, sfx: 'move' }],
      [{ ...tote, hd: 14 }, 7, { yaw: -1.0 }],
      [{ ...tote, hd: -6 }, 7, { yaw: -1.0 }],
      [{ ...tote, hd: 14 }, 7, { yaw: -1.0 }],
      [{ ...tote, hd: 0 }, 7, { yaw: -1.0 }],
      [pick, 14, { yaw: -1.0 }],
      [{ ...C, hd: -10 }, 8, { yaw: -0.7, fx: 'charge' }],
      [POSES.jump, 8, { dy: 16, yaw: -0.5 }],
      ['idle', 10, { dy: 0, fx: 'whiff' }],
      ['idle', 14]
    ],
    victory: [
      [{ ...stand, fs: 30, fe: 20, bs: 30, be: 20, hd: 8 }, 10, { yaw: -1.2 }],
      [{ ...stand, fh: 70, fk: 90, hd: 15, lean: -6, fs: 60, fe: 30, bs: -20, be: 20 }, 9, { yaw: -1.2, dx: 6 }],
      [{ ...stand, fs: 30, fe: 20, bs: 30, be: 20 }, 7, { yaw: -1.2, dx: 10 }],
      [{ ...stand, bh: 55, bk: 95, fh: 0, fk: 5, hd: 15, lean: -6, fs: -20, fe: 20, bs: 60, be: 30 }, 9, { yaw: -1.2, dx: 16 }],
      [{ ...stand, fs: 30, fe: 20, bs: 30, be: 20 }, 7, { yaw: -1.3, dx: 20 }],
      [{ ...C, hd: -10 }, 6, { yaw: -1.4, dx: 20, fx: 'charge' }],
      [{ ...POSES.taunt, fh: 30, fk: 50, bh: 10, bk: 50, axf: 0.4, axb: 0.4 }, 9, { yaw: -1.5, dx: 20, dy: 40, fx: 'rise', say: 'Delivered!' }],
      [{ ...C, hd: -6 }, 7, { yaw: -1.5, dx: 20, dy: 0 }],
      [V, 10, { yaw: -1.5, dx: 20, fx: 'boxes' }],
      [{ ...V, hd: -6, axf: 2.2, axb: 2.75 }, 10, { yaw: -1.5, dx: 20 }],
      [{ ...V, hd: 14, axf: 2.75, axb: 2.2 }, 10, { yaw: -1.5, dx: 20 }],
      [V, 10, { yaw: -1.5, dx: 20 }]
    ],
    victoryLoop: 9,
    fx: {
      // petits cartons orange qui jaillissent
      boxes(ch, x, footY, sc, face) {
        AU.sfx('select');
        for (let i = 0; i < 10; i++) FX.add({ type: 'spark', x: x + rand(-40, 40) * sc, y: footY - rand(120, 190) * sc, vx: rand(-4, 4), vy: rand(-9, -3), size: 4, life: 22, max: 22, col: i % 2 ? '#ff9d1c' : '#ffe2b8', len: 1 });
      }
    }
  };
})();
