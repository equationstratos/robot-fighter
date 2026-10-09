'use strict';
/* Animations personnelles : asimov — voir le contrat en tête de js/motions.js
   intro   : séquence de démarrage du robot open source fraîchement assemblé : affalé, il s'allume, relève la tête,
             teste son cou, ses bras, regarde sa main et ferme le poing, teste un genou, puis se met en garde
   victory : « ça compile ! » : tape sur un clavier invisible, lève le poing, petit saut bras en V, balancement */
(() => {
  const I = POSES.idle;
  const stand = { ...I, lean: 4, hd: 0, fs: 10, fe: 10, bs: 10, be: 10, fh: 10, fk: 8, bh: -10, bk: 6, grip: 0.4 };
  const typing = { ...stand, lean: 10, hd: 20, fs: 60, fe: 40, bs: 60, be: 40, grip: 0 };
  const V = { ...stand, hd: 6, fs: 0, fe: 8, bs: 0, be: 8, axf: 2.5, axb: 2.5, grip: 0 };
  MOTIONS.asimov = {
    intro: [
      [{ ...I, lean: 30, hd: 40, fs: 0, fe: 5, bs: 0, be: 5, grip: 0, fh: 10, fk: 22, bh: -10, bk: 20 }, 0, { yaw: -1.2 }],
      [{ ...I, lean: 30, hd: 40, fs: 0, fe: 5, bs: 0, be: 5, grip: 0, fh: 10, fk: 22, bh: -10, bk: 20 }, 12, { yaw: -1.2, say: 'Asimov online.', fx: 'code' }],
      [stand, 8, { yaw: -1.2, sfx: 'move' }],
      [{ ...stand, headSpin: 0.7 }, 8, { yaw: -1.2 }],
      [{ ...stand, headSpin: -0.7 }, 10, { yaw: -1.2 }],
      [stand, 8, { yaw: -1.2 }],
      [{ ...stand, fs: 90, fe: 0 }, 8, { yaw: -1.2, sfx: 'move' }],
      [{ ...stand, fs: 90, fe: 95 }, 6, { yaw: -1.2 }],
      [{ ...stand, bs: 90, be: 0 }, 8, { yaw: -1.2, sfx: 'move' }],
      [{ ...stand, bs: 90, be: 95 }, 6, { yaw: -1.2 }],
      [{ ...stand, fs: 110, fe: 60, hd: 20, grip: 0 }, 10, { yaw: -1.2 }],
      [{ ...stand, fs: 110, fe: 60, hd: 20, grip: 1 }, 8, { yaw: -1.2, sfx: 'select' }],
      [{ ...stand, fh: 62, fk: 85 }, 8, { yaw: -1.0 }],
      [stand, 8, { yaw: -0.8 }],
      ['idle', 10, { yaw: -0.42, fx: 'charge' }],
      ['idle', 10]
    ],
    victory: [
      [typing, 10, { yaw: -1.4 }],
      [{ ...typing, fe: 52, be: 30 }, 4, { yaw: -1.4, sfx: 'move' }],
      [{ ...typing, fe: 30, be: 52 }, 4, { yaw: -1.4 }],
      [{ ...typing, fe: 52, be: 30 }, 4, { yaw: -1.4, sfx: 'move' }],
      [{ ...typing, fe: 30, be: 52 }, 4, { yaw: -1.4 }],
      [{ ...stand, hd: -6, lean: 2 }, 8, { yaw: -1.4 }],
      [{ ...stand, hd: -8, fs: 175, fe: 0, grip: 1, bs: 30, be: 60 }, 7, { yaw: -1.4, fx: 'burst', say: 'It compiles!' }],
      [V, 10, { yaw: -1.5, dy: 18, fx: 'code' }],
      [V, 6, { yaw: -1.5, dy: 0 }],
      [{ ...V, axf: 2.25, axb: 2.75, hd: 10 }, 12, { yaw: -1.5 }],
      [{ ...V, axf: 2.75, axb: 2.25, hd: 2 }, 12, { yaw: -1.5 }],
      [V, 12, { yaw: -1.5 }]
    ],
    victoryLoop: 9,
    fx: {
      // lignes de code vertes qui montent (terminal)
      code(ch, x, footY, sc, face) {
        for (let i = 0; i < 16; i++) FX.add({ type: 'spark', x: x + rand(-55, 55) * sc, y: footY - rand(20, 200) * sc, vx: 0, vy: rand(-5, -2), size: 2.5, life: 26, max: 26, col: i % 3 ? '#3dff8a' : ch.accent, len: 4 });
      }
    }
  };
})();
