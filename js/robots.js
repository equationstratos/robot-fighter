'use strict';
/* =========================================================
   ROBOTS : roster (robots humanoïdes réels), poses, squelette, rendu
   ========================================================= */
const ROSTER = [
  { id: 'optimus', name: 'OPTIMUS', full: 'Optimus Gen 2', maker: 'TESLA', country: 'USA', year: 2023,
    body: '#eef0f3', trim: '#17191e', joint: '#2b2e35', accent: '#3fa9ff', visor: '#07080b', head: 'optimus',
    scale: 1.0, leg: 1.0, bulk: 1.0, chest: 1.0, speed: 1.0, power: 1.0, stage: 0,
    proj: { name: 'PLASMA SHOT', style: 'orb', color: '#3fa9ff', core: '#e8f6ff' },
    move: 'uppercut', moveName: 'RISING DYNAMO', sup: 'beam', supName: 'GIGA PLASMA CANNON', throwType: 'suplex', throwName: 'SUPLEX ALLEMAND',
    bio: 'Le robot humanoïde de Tesla. Mains à 22 degrés de liberté, précision chirurgicale.',
    skins: [ // finitions / motifs / lumières : voir SKINS dans js/models/optimus.js
      { id: 'classic', name: 'ORIGINAL', sw: ['#eef0f3', '#0c0d10', '#46f0ff'] },
      { id: 'carbon', name: 'NOIR CARBONE', sw: ['#2a2c31', '#0c0d10', '#e9bc62', '#ffbe3c'],
        ch: { body: '#2a2c31', trim: '#e9bc62', joint: '#141519', accent: '#ffcf5a', proj: { name: 'PLASMA SHOT', style: 'orb', color: '#ffb52e', core: '#fff4d2' } } },
      { id: 'chrome', name: 'CHROME LIQUIDE', sw: ['#eef1f5', '#9aa3b2', '#2a2240', '#a070ff'],
        ch: { body: '#e8ebf0', trim: '#0c0d10', joint: '#2b2e35', accent: '#a070ff', proj: { name: 'PLASMA SHOT', style: 'orb', color: '#9a66ff', core: '#f1e8ff' } } },
      { id: 'rouge', name: 'ROUGE TESLA', sw: ['#b40f20', '#0c0d10', '#eef1f5', '#f2f4ff'],
        ch: { body: '#b40f20', trim: '#0c0d10', joint: '#2b2e35', accent: '#ff2a3a', proj: { name: 'PLASMA SHOT', style: 'orb', color: '#ff2438', core: '#ffe9eb' } } },
      { id: 'or', name: 'OR 24 CARATS', sw: ['#ffcf5c', '#b8862e', '#0c0d10', '#ff9326'],
        ch: { body: '#ffcf5c', trim: '#0c0d10', joint: '#1d1d20', accent: '#ff9a2e', proj: { name: 'PLASMA SHOT', style: 'orb', color: '#ff8f1f', core: '#fff0d6' } } },
      { id: 'cyber', name: 'CYBERPUNK', sw: ['#1c1c23', '#ff2bd6', '#2fe6ff', '#0c0d10'],
        ch: { body: '#1c1c23', trim: '#0c0d10', joint: '#141519', accent: '#ff2bd6', visor: '#12051a', proj: { name: 'PLASMA SHOT', style: 'orb', color: '#ff2bd6', core: '#a8fbff' } } },
      { id: 'arctic', name: 'ARCTIQUE', sw: ['#f6f8ff', '#9fd2f4', '#3b4e66', '#c6f3ff'],
        ch: { body: '#f6f8ff', trim: '#9fd2f4', joint: '#3b4e66', accent: '#8fe4ff', visor: '#03101f', proj: { name: 'PLASMA SHOT', style: 'orb', color: '#7fdcff', core: '#ffffff' } } },
      { id: 'army', name: 'MILITAIRE', sw: ['#6c7448', '#866844', '#30342a', '#9cff3a'],
        ch: { body: '#6c7448', trim: '#2b2e23', joint: '#1d1f19', accent: '#9cff3a', visor: '#0b0d08', proj: { name: 'PLASMA SHOT', style: 'orb', color: '#8cff2e', core: '#f0ffe0' } } }
    ] },
  { id: 'atlas', name: 'ATLAS', full: 'Atlas électrique', maker: 'BOSTON DYNAMICS', country: 'USA', year: 2024,
    body: '#bfc4cb', trim: '#5e636b', joint: '#1c1d21', accent: '#ffb43a', visor: '#08090b', head: 'atlas', metal: true,
    scale: 1.03, leg: 1.0, bulk: 1.15, chest: 1.12, speed: 0.95, power: 1.12, stage: 3,
    proj: { name: 'HYDRAULIC RING', style: 'ring', color: '#ffb43a', core: '#fff3d6' },
    move: 'flip', moveName: 'PARKOUR FLIP', sup: 'moulinet', supName: 'MOULINET 720', throwType: 'helix', throwName: 'TORSION 360', backElbow: true,
    bio: 'Le nouvel Atlas 100 % électrique. Ses moteurs tournent à 360° : contorsions et prises impossibles pour un humain.',
    skins: [ // finitions / motifs / lumières : voir SKINS dans js/models/atlas.js
      { id: 'classic', name: 'ORIGINAL', sw: ['#d2d6dc', '#4f535a', '#141518', '#ffb43a'] },
      { id: 'magma', name: 'MAGMA', sw: ['#2a2624', '#ff4a0a', '#0f0c0b', '#ffd27a'],
        ch: { body: '#2a2624', trim: '#0f0c0b', accent: '#ff4a12', proj: { name: 'HYDRAULIC RING', style: 'ring', color: '#ff4a12', core: '#ffe0a0' } } },
      { id: 'chantier', name: 'CHANTIER', sw: ['#f2b100', '#111214', '#bfc5cc', '#ff7a00'],
        ch: { body: '#f2b100', trim: '#111214', accent: '#ff7a00', proj: { name: 'HYDRAULIC RING', style: 'ring', color: '#ff8a00', core: '#fff0c0' } } },
      { id: 'furtif', name: 'FURTIF', sw: ['#3a3e45', '#111216', '#2e3137', '#ff1e3c'],
        ch: { body: '#3a3e45', trim: '#111216', accent: '#ff1e3c', proj: { name: 'HYDRAULIC RING', style: 'ring', color: '#ff2440', core: '#ffe0e4' } } },
      { id: 'cuivre', name: 'CUIVRE PATINÉ', sw: ['#c7744b', '#5fb59c', '#e2b863', '#3dffc0'],
        ch: { body: '#c7744b', trim: '#e2b863', accent: '#3dffc0', proj: { name: 'HYDRAULIC RING', style: 'ring', color: '#3dffc0', core: '#e6fff6' } } },
      { id: 'emeute', name: 'ANTI-ÉMEUTE', sw: ['#15254b', '#f3f5f8', '#ff1a2e', '#2f7bff'],
        ch: { body: '#15254b', trim: '#f3f5f8', accent: '#2f7bff', proj: { name: 'HYDRAULIC RING', style: 'ring', color: '#2f7bff', core: '#e6f0ff' } } },
      { id: 'hydraulique', name: 'HYDRAULIQUE', sw: ['#6c727b', '#2a63dc', '#1a1b1f', '#36d6ff'],
        ch: { body: '#6c727b', trim: '#2a63dc', accent: '#36d6ff', proj: { name: 'HYDRAULIC RING', style: 'ring', color: '#36d6ff', core: '#e8fbff' } } },
      { id: 'nacre', name: 'NACRE ROYALE', sw: ['#f3efe9', '#e8c47e', '#121015', '#c77dff'],
        ch: { body: '#f3efe9', trim: '#e8c47e', accent: '#c77dff', proj: { name: 'HYDRAULIC RING', style: 'ring', color: '#b56bff', core: '#f6ecff' } } }
    ] },
  { id: 'figure', name: 'FIGURE 02', full: 'Figure 02', maker: 'FIGURE AI', country: 'USA', year: 2024,
    body: '#3b3e44', trim: '#141518', joint: '#2a2c31', accent: '#e8f4ff', visor: '#030304', head: 'figure',
    scale: 1.0, leg: 1.02, bulk: 0.98, chest: 1.0, speed: 1.08, power: 0.96, stage: 0,
    proj: { name: 'NEURAL PULSE', style: 'orb', color: '#9be7ff', core: '#ffffff' },
    move: 'rush', moveName: 'HELIX RUSH', sup: 'rush', supName: 'OMEGA PROTOCOL', throwType: 'takedown', throwName: 'DOUBLE-LEG SLAM',
    bio: 'Noir mat, cerveau IA embarqué. Rapide et calculateur.' },
  { id: 'asimo', name: 'ASIMO', full: 'ASIMO', maker: 'HONDA', country: 'JAPON', year: 2000,
    body: '#f6f6f2', trim: '#c9c9c4', joint: '#3c3f46', accent: '#ff4b4b', visor: '#0b0c10', head: 'asimo',
    scale: 0.86, leg: 0.95, bulk: 1.12, chest: 1.08, speed: 1.05, power: 0.92, stage: 2,
    proj: { name: 'DREAM BEAM', style: 'orb', color: '#ff4b4b', core: '#ffe6e6' },
    move: 'spin', moveName: 'TORNADO STEP', sup: 'beam', supName: 'FUTURE LEGEND', throwType: 'judo', throwName: 'O-GOSHI',
    bio: 'La légende japonaise, pionnier des robots marcheurs depuis 2000.' },
  { id: 'h1', name: 'UNITREE H1', full: 'H1', maker: 'UNITREE', country: 'CHINE', year: 2023,
    body: '#3a3d44', trim: '#1a1b1f', joint: '#5a5e66', accent: '#4dff88', visor: '#050506', head: 'h1',
    scale: 1.15, leg: 0.85, bulk: 0.9, chest: 0.92, speed: 1.15, power: 0.95, stage: 5,
    proj: { name: 'VOLT SPHERE', style: 'orb', color: '#4dff88', core: '#eafff1' },
    move: 'rush', moveName: 'SPEED RECORD', sup: 'rush', supName: 'HYPERSPEED BARRAGE', throwType: 'takedown', throwName: 'DOUBLE-LEG SLAM',
    bio: 'Détenteur du record de vitesse des humanoïdes : 3,3 m/s.' },
  { id: 'ameca', name: 'AMECA', full: 'Ameca', maker: 'ENGINEERED ARTS', country: 'UK', year: 2021,
    body: '#9aa0a8', trim: '#54585f', joint: '#2a2c30', accent: '#b26bff', visor: '#8c929a', head: 'ameca',
    scale: 0.98, leg: 1.0, bulk: 0.95, chest: 0.98, speed: 0.98, power: 1.02, stage: 1,
    proj: { name: 'MIND WAVE', style: 'wave', color: '#b26bff', core: '#f3e8ff' },
    move: 'uppercut', moveName: 'UNCANNY UPPER', sup: 'beam', supName: 'EXPRESSION OVERLOAD', throwType: 'judo', throwName: 'O-GOSHI',
    bio: 'Le visage le plus expressif du monde. Son regard vous déstabilise.' },
  { id: 'digit', name: 'DIGIT', full: 'Digit', maker: 'AGILITY ROBOTICS', country: 'USA', year: 2023,
    body: '#1fa39c', trim: '#17181c', joint: '#b9bec6', accent: '#3cc8ff', visor: '#0b0c0e', head: 'digit',
    scale: 1.0, leg: 1.1, bulk: 0.95, chest: 1.05, speed: 1.02, power: 1.05, stage: 1, revKnee: true,
    proj: { name: 'CARGO LAUNCH', style: 'box', color: '#ff9d1c', core: '#ffe2b8' },
    move: 'spin', moveName: 'OSTRICH KICK', sup: 'storm', supName: 'WAREHOUSE STAMPEDE', throwType: 'takedown', throwName: 'CARGO SLAM',
    bio: 'Jambes d\'autruche, genoux inversés. Le roi de l\'entrepôt.',
    skins: [ // finitions / motifs / lumières : voir SKINS dans js/models/digit.js
      { id: 'classic', name: 'ORIGINAL', sw: ['#1fa39c', '#131417', '#a6aab0', '#3dff74'] },
      { id: 'cassie', name: 'CASSIE', sw: ['#2a5cd6', '#c9ced6', '#101114', '#5aa8ff'],
        ch: { body: '#2a5cd6', trim: '#101114', joint: '#c9ced6', accent: '#5aa8ff', proj: { name: 'CARGO LAUNCH', style: 'box', color: '#4a9dff', core: '#e0eeff' } } },
      { id: 'proto', name: 'PROTOTYPE', sw: ['#d9dbdc', '#8b9096', '#1a1b1e', '#ffb020'],
        ch: { body: '#d9dbdc', trim: '#1a1b1e', joint: '#8b9096', accent: '#ffb020', proj: { name: 'CARGO LAUNCH', style: 'box', color: '#ffb020', core: '#fff3d0' } } },
      { id: 'secu', name: 'SÉCURITÉ', sw: ['#d7ff1f', '#ff6a00', '#c8ccd2', '#111214'],
        ch: { body: '#d7ff1f', trim: '#111214', joint: '#c8ccd2', accent: '#ff7a00', proj: { name: 'CARGO LAUNCH', style: 'box', color: '#ff7a00', core: '#fff0c8' } } },
      { id: 'nocturne', name: 'NOCTURNE', sw: ['#141518', '#0a0a0c', '#2fe6ff', '#3a3d44'],
        ch: { body: '#141518', trim: '#0a0a0c', joint: '#3a3d44', accent: '#2fe6ff', visor: '#020608', proj: { name: 'CARGO LAUNCH', style: 'box', color: '#2fe6ff', core: '#e0fdff' } } },
      { id: 'autruche', name: 'AUTRUCHE', sw: ['#a8805a', '#3b2a1c', '#f0a49a', '#f4efe4'],
        ch: { body: '#a8805a', trim: '#3b2a1c', joint: '#f0a49a', accent: '#ffb347', proj: { name: 'CARGO LAUNCH', style: 'box', color: '#ffa53a', core: '#fff1d8' } } },
      { id: 'urbain', name: 'URBAIN', sw: ['#686b70', '#1b1d20', '#a4a7ab', '#ff3b30'],
        ch: { body: '#686b70', trim: '#25272b', joint: '#3b3d42', accent: '#ff3b30', proj: { name: 'CARGO LAUNCH', style: 'box', color: '#ff3b30', core: '#ffe2df' } } }
    ] },
  { id: 't800', name: 'T800', full: 'EngineAI T800 (REK)', maker: 'ENGINEAI · REK', country: 'CHINE', year: 2025,
    body: '#e9ebee', trim: '#5d6168', joint: '#3c3f45', accent: '#4aa8ff', visor: '#101216', head: 'figure', kicker: true,
    scale: 1.06, leg: 1.04, bulk: 1.06, chest: 1.06, speed: 1.0, power: 1.18, stage: 6,
    proj: { name: 'CORE BLAST', style: 'orb', color: '#4aa8ff', core: '#e6f3ff' },
    move: 'cyclone', moveName: 'CYCLONE KICK', sup: 'storm', supName: 'DÉCAPITATEUR', throwType: 'takedown', throwName: 'OCTAGON SLAM',
    bio: 'Le poids lourd d\'EngineAI : 1,85 m, 85 kg, 41 articulations, 450 N·m. Star des combats REK, ses coups de pied ont décapité un androïde.',
    skins: [ // finitions / motifs / lumières (+ crâne d'endosquelette) : voir SKINS dans js/models/t800.js
      { id: 'classic', name: 'ORIGINAL', sw: ['#e9ebee', '#222a38', '#8e939b', '#4aa8ff'] },
      { id: 'endo', name: 'ENDOSQUELETTE', sw: ['#cfd3da', '#3a3c42', '#16171a', '#ff2414'],
        ch: { body: '#cfd3da', trim: '#2a2c31', joint: '#1e1f23', accent: '#ff2a1a', visor: '#1a0000', proj: { name: 'CORE BLAST', style: 'orb', color: '#ff2414', core: '#ffd6cc' } } },
      { id: 'rek', name: 'REK ARÈNE', sw: ['#2a2c32', '#ff5f12', '#34363c', '#ff8a2a'],
        ch: { body: '#2a2c32', trim: '#ff5f12', joint: '#34363c', accent: '#ff7a1a', proj: { name: 'CORE BLAST', style: 'orb', color: '#ff7a1a', core: '#fff0dc' } } }
    ] },
  { id: 'apollo', name: 'APOLLO', full: 'Apollo', maker: 'APPTRONIK', country: 'USA', year: 2023,
    body: '#e9e6df', trim: '#2c2f36', joint: '#3e424a', accent: '#ff6a2b', visor: '#121419', head: 'apollo',
    scale: 1.02, leg: 1.0, bulk: 1.08, chest: 1.1, speed: 0.92, power: 1.15, stage: 4,
    proj: { name: 'IGNITION ORB', style: 'orb', color: '#ff6a2b', core: '#fff0e0' },
    move: 'uppercut', moveName: 'LIFT-OFF', sup: 'storm', supName: 'SATURN V STRIKE', throwType: 'suplex', throwName: 'SUPLEX ALLEMAND',
    bio: 'Né des recherches de la NASA. Force brute et fiabilité.' },
  { id: 'asimov', name: 'ASIMOV', full: 'Asimov v1', maker: 'MENLO RESEARCH', country: 'OPEN SOURCE', year: 2026,
    body: '#e8641a', trim: '#e8641a', joint: '#2a2b2e', accent: '#ff7a1a', visor: '#050607', head: 'asimov',
    scale: 1.02, leg: 1.08, bulk: 0.96, chest: 1.0, speed: 1.06, power: 0.98, stage: 0,
    proj: { name: 'GIT PUSH', style: 'wave', color: '#ff7a1a', core: '#fff0e0' },
    move: 'flip', moveName: 'PULL REQUEST', sup: 'rush', supName: 'MERGE CONFLICT', throwType: 'suplex', throwName: 'SUDO SUPLEX',
    bio: 'L\'humanoïde open source de Menlo Research, à monter soi-même (kit DIY). 1,2 m en vrai… 1,85 m en version combat.',
    skins: [ // ch.body = coques, ch.trim = détails (bagues, plaques), ch.joint = graphite — finitions : voir SKINS dans js/models/asimov.js
      { id: 'classic', name: 'ORIGINAL', sw: ['#e8641a', '#2a2b2e', '#0b0c0e', '#ff7a1a'] },
      { id: 'noir', name: 'NOIR', sw: ['#1f2023', '#2a2b2e', '#e8641a', '#ff6a14'],
        ch: { body: '#1f2023', trim: '#e8641a', joint: '#2a2b2e', accent: '#ff6a14', proj: { name: 'GIT PUSH', style: 'wave', color: '#ff6a14', core: '#ffeedd' } } },
      { id: 'proto', name: 'PROTOTYPE DIY', sw: ['#e4e2dc', '#b9bfc6', '#4a4e54', '#36d2ff'],
        ch: { body: '#e4e2dc', trim: '#b9bfc6', joint: '#4a4e54', accent: '#36d2ff', proj: { name: 'GIT PUSH', style: 'wave', color: '#36d2ff', core: '#e6fbff' } } },
      { id: 'hacker', name: 'HACKER', sw: ['#1b1c1f', '#2fd46a', '#232427', '#3dff7a'],
        ch: { body: '#1b1c1f', trim: '#2fd46a', joint: '#232427', accent: '#3dff7a', proj: { name: 'GIT PUSH', style: 'wave', color: '#3dff7a', core: '#e8ffee' } } },
      { id: 'cobalt', name: 'ANODISÉ COBALT', sw: ['#a3aab1', '#2f6cff', '#3a4046', '#5fb0ff'],
        ch: { body: '#a3aab1', trim: '#2f6cff', joint: '#3a4046', accent: '#5fb0ff', proj: { name: 'GIT PUSH', style: 'wave', color: '#4f9dff', core: '#e6f1ff' } } }
    ] }
];

/* ---------- poses (angles en degrés) ----------
   lean : inclinaison du torse vers l'avant ; hd : tête
   fs/fe : épaule/coude bras avant ; bs/be : bras arrière (0 = vers le bas, 90 = vers l'avant)
   fh/fk : hanche/genou jambe avant ; bh/bk : jambe arrière
   rot : rotation du corps entier ; sx : échelle horizontale (rotation sur soi-même) */
// kyf / kyb : rotation de la jambe avant / arrière autour de l'axe vertical de la hanche (radians, rendu 3D) :
// genou armé sur le côté (fouetté, circulaire), jambe qui balaie un arc ; 0 = jambe dans le plan du combat
// axf / axb : écartement latéral du bras avant / arrière (abduction, radians, + = vers l'extérieur ; bras en V, saluts)
// hxf / hxb : écartement latéral de la jambe avant / arrière (abduction, radians, + = vers l'extérieur ; grand écart, garde large)
// (rendu 3D seulement, comme kyf / kyb : le squelette 2D des zones de frappe ne change pas)
const PKEYS = ['lean', 'hd', 'fs', 'fe', 'bs', 'be', 'fh', 'fk', 'bh', 'bk', 'rot', 'sx', 'grip', 'spin', 'twist', 'headSpin', 'kyf', 'kyb', 'axf', 'axb', 'hxf', 'hxb'];
function mkPose(o) { const p = { lean: 0, hd: 0, fs: 0, fe: 0, bs: 0, be: 0, fh: 0, fk: 0, bh: 0, bk: 0, rot: 0, sx: 1, grip: 1, spin: 0, twist: 0, headSpin: 0, kyf: 0, kyb: 0, axf: 0, axb: 0, hxf: 0, hxb: 0 }; return Object.assign(p, o); }
const POSES = {
  idle: mkPose({ lean: 8, hd: -4, fs: 50, fe: 100, bs: 28, be: 118, fh: 24, fk: 30, bh: -20, bk: 22 }),
  crouch: mkPose({ lean: 26, hd: -18, fs: 55, fe: 110, bs: 35, be: 115, fh: 78, fk: 125, bh: 22, bk: 128 }),
  jump: mkPose({ lean: 12, hd: -6, fs: 75, fe: 95, bs: 55, be: 105, fh: 85, fk: 125, bh: 45, bk: 115 }),
  lp: mkPose({ lean: 14, hd: -6, fs: 92, fe: 0, bs: 30, be: 125, fh: 28, fk: 30, bh: -26, bk: 18 }),
  hp: mkPose({ lean: 30, hd: -8, fs: 35, fe: 120, bs: 96, be: 0, fh: 34, fk: 38, bh: -34, bk: 12 }),
  lk: mkPose({ lean: -6, hd: 0, fs: 60, fe: 100, bs: 32, be: 115, fh: 82, fk: 6, bh: -6, bk: 14 }),
  hk: mkPose({ lean: -28, hd: 6, fs: 75, fe: 85, bs: 15, be: 110, fh: 118, fk: 8, bh: -12, bk: 8 }),
  clp: mkPose({ lean: 26, hd: -14, fs: 92, fe: 0, bs: 35, be: 115, fh: 78, fk: 125, bh: 22, bk: 128 }),
  chp: mkPose({ lean: 8, hd: -20, fs: 168, fe: 10, bs: 30, be: 110, fh: 70, fk: 110, bh: 15, bk: 120 }),
  clk: mkPose({ lean: 22, hd: -12, fs: 55, fe: 110, bs: 35, be: 115, fh: 92, fk: 10, bh: 35, bk: 135 }),
  chk: mkPose({ lean: 38, hd: -10, fs: 30, fe: 60, bs: 10, be: 60, fh: 96, fk: 0, bh: 65, bk: 140 }),
  jp: mkPose({ lean: 18, hd: -6, fs: 55, fe: 0, bs: 50, be: 100, fh: 80, fk: 110, bh: 40, bk: 110 }),
  jk: mkPose({ lean: -16, hd: 0, fs: 20, fe: 20, bs: 60, be: 120, fh: 63.1, fk: 1.6, bh: 60, bk: 130, spin: 1.72, kyf: -1.57, hxf: 0.5, twist: -0.4, axf: 0.9, kyb: -1.5, hxb: 0.3 }), // chassé sauté, de côté
  jhk: mkPose({ lean: -12, hd: 4, fs: 90, fe: 70, bs: 30, be: 100, fh: 95, fk: 4, bh: 30, bk: 120 }),
  hit: mkPose({ lean: -24, hd: -18, fs: 20, fe: 70, bs: 8, be: 60, fh: 12, fk: 24, bh: -32, bk: 10, grip: 0.4 }),
  chit: mkPose({ lean: 0, hd: -25, fs: 30, fe: 80, bs: 20, be: 80, fh: 70, fk: 125, bh: 20, bk: 125 }),
  block: mkPose({ lean: -4, hd: -12, fs: 112, fe: 140, bs: 98, be: 140, fh: 20, fk: 28, bh: -24, bk: 22 }),
  cblock: mkPose({ lean: 14, hd: -18, fs: 110, fe: 140, bs: 95, be: 140, fh: 78, fk: 125, bh: 22, bk: 128 }),
  fall: mkPose({ lean: -30, hd: -30, fs: 150, fe: 30, bs: 130, be: 30, fh: 40, fk: 50, bh: -20, bk: 40, grip: 0.1 }),
  down: mkPose({ lean: 0, hd: 10, fs: 160, fe: 10, bs: 170, be: 10, fh: 10, fk: 20, bh: -5, bk: 30, grip: 0.3 }),
  projWind: mkPose({ lean: -8, hd: 0, fs: -25, fe: 85, bs: -40, be: 90, fh: 34, fk: 45, bh: -30, bk: 15, grip: 0.5 }),
  proj: mkPose({ lean: 22, hd: -6, fs: 90, fe: 0, bs: 84, be: 8, fh: 40, fk: 30, bh: -38, bk: 8, grip: 0 }),
  upper: mkPose({ lean: -8, hd: -20, fs: 172, fe: 4, bs: 30, be: 100, fh: 70, fk: 95, bh: -12, bk: 15 }),
  flip: mkPose({ lean: -10, hd: 0, fs: 150, fe: 30, bs: 140, be: 30, fh: 140, fk: 4, bh: 20, bk: 60 }),
  spin: mkPose({ lean: -8, hd: 0, fs: 100, fe: 20, bs: 80, be: 20, fh: 95, fk: 2, bh: -10, bk: 20 }),
  rushWind: mkPose({ lean: -10, hd: 0, fs: 20, fe: 100, bs: -30, be: 100, fh: 30, fk: 50, bh: -40, bk: 20 }),
  rush: mkPose({ lean: 40, hd: -15, fs: 96, fe: 0, bs: -20, be: 60, fh: 50, fk: 20, bh: -55, bk: 10 }),
  win: mkPose({ lean: -4, hd: 10, fs: 168, fe: 15, bs: 30, be: 140, fh: 12, fk: 10, bh: -12, bk: 6 }),
  win2: mkPose({ lean: 0, hd: 6, fs: 95, fe: 130, bs: 95, be: 130, fh: 15, fk: 10, bh: -15, bk: 8, grip: 0.3 }),
  taunt: mkPose({ lean: -6, hd: 15, fs: 175, fe: 5, bs: 165, be: 10, fh: 10, fk: 10, bh: -10, bk: 8, grip: 0 }),
  // ---- coups de pied façon boxe française / MMA (armé → extension → réarmé), donnés DE CÔTÉ ----
  // spin : rotation des hanches (+ = dos vers la caméra, coups de la jambe avant ; - = poitrine vers la caméra, jambe arrière)
  // kyf / kyb (jambe de frappe) : pivot de la jambe autour de sa hanche ; spin + ky = direction réelle de la jambe
  //   (0 = dans l'axe du combat). Le squelette 2D des zones de frappe est projeté par sx = cos(spin + ky) (keyPose, fight.js) :
  //   hanches tournées mais jambe dans l'axe → portée intacte.
  // hxf / hxb ≈ 1.5 (jambe de frappe) : plan du genou couché à l'horizontale → armé « sur le côté », tibia qui fouette à plat
  // ky de la jambe d'appui : pivot du pied d'appui (talon tourné vers l'adversaire) ; twist : buste moins tourné que les hanches
  // fouetté (jambe avant) — armé : genou levé sur le côté, tibia replié à plat vers l'extérieur, hanches qui pivotent
  kChamber: mkPose({ lean: -4, hd: -6, fs: 70, fe: 115, bs: 30, be: 115, fh: 95, fk: 120, bh: -8, bk: 12, spin: 1.0, kyf: -1.28, hxf: 1.5, kyb: 0.4, twist: -0.3 }),
  // fouetté — impact : hanches retournées (dos à la caméra), tibia qui claque à plat dans l'axe, buste qui s'efface en arrière
  fouette: mkPose({ lean: -28, hd: -4, fs: 95, fe: 130, bs: -12, be: 50, fh: 111.1, fk: 33.8, bh: -6, bk: 8, spin: 1.9, kyf: -1.5, hxf: 1.5, kyb: 0.5, twist: -1.4 }),
  // high kick jambe arrière (MMA) — armé : la poitrine s'ouvre vers la caméra, genou qui arrive par le côté, pivot du pied avant
  rkChamber: mkPose({ lean: -6, hd: -4, fs: 85, fe: 125, bs: 15, be: 90, fh: 8, fk: 16, bh: 95, bk: 120, spin: -0.9, kyb: 1.3, hxb: 1.5, kyf: -0.3, twist: 0.3 }),
  // high kick — impact : hanches complètement retournées, talon d'appui vers l'adversaire, bras arrière lancé en balancier
  rkHigh: mkPose({ lean: -38, hd: 6, fs: 95, fe: 130, bs: -50, be: 10, fh: 6, fk: 10, bh: 138.9, bk: 24.1, spin: -0.95, kyb: 1.9, hxb: 0.5, kyf: -1.0, twist: 1.0, axb: 0.3 }),
  // chassé latéral (savate / yoko-geri) — armé : genou monté en travers devant le buste, pied replié près du genou d'appui
  teepChamber: mkPose({ lean: -12, hd: -4, fs: 70, fe: 115, bs: 40, be: 120, fh: 120, fk: 145, bh: -10, bk: 15, spin: 1.5, kyf: -0.5, hxf: 0.8, kyb: 0.4, twist: -0.3 }),
  // chassé latéral — extension : hanches à 90°, talon / tranchant du pied poussé dans l'axe, buste incliné à l'opposé
  teep: mkPose({ lean: -30, hd: 4, fs: 10, fe: 20, bs: 60, be: 125, fh: 87.9, fk: 1.6, bh: -14, bk: 10, spin: 1.77, kyf: -1.57, hxf: 1.4, kyb: 0.6, twist: -0.4, axf: 1.1 }),
  // retourné : la tête et les épaules tournent d'abord (regard par-dessus l'épaule), genou arrière replié
  // (le spin est donné par les images-clés ; à l'armé, fhk remonte le genou vers la poitrine : option bh / bk)
  backTurn: mkPose({ lean: 10, hd: 0, fs: 40, fe: 100, bs: 40, be: 100, fh: 10, fk: 20, bh: 30, bk: 110, headSpin: 1.0 }),
  // retourné — impact : hanches au-delà du demi-tour (spin + 0.5), jambe ramenée dans l'axe (kyb -0.5), talon en avant,
  // regard par-dessus l'épaule
  backKick: mkPose({ lean: 35, hd: -10, fs: 30, fe: 110, bs: 30, be: 110, fh: 15, fk: 15, bh: -95, bk: 0, spin: 0.5, kyb: -0.5, headSpin: 1.3 }),
  knee: mkPose({ lean: 10, hd: -10, fs: 70, fe: 110, bs: 60, be: 100, fh: 125, fk: 150, bh: -20, bk: 30 }),
  // low kick (MMA) dans le mollet : hanches tournées, tibia qui part de côté, légèrement plongeant
  clkMMA: mkPose({ lean: 12, hd: -10, fs: 75, fe: 120, bs: 30, be: 100, fh: 81.6, fk: 33.4, bh: 25, bk: 120, spin: 1.6, kyf: -1.2, hxf: 0.2, kyb: -0.9, twist: -0.8 }),
  // low kick — armé : hanches qui pivotent, genou avant ouvert sur le côté, tibia replié à plat (il va fouetter le mollet)
  clkArm: mkPose({ lean: 16, hd: -12, fs: 75, fe: 120, bs: 35, be: 115, fh: 80, fk: 120, bh: 25, bk: 120, spin: 1.3, kyf: -0.8, hxf: 1.4, kyb: -0.8, twist: -0.7 }),
  chkSpin: mkPose({ lean: 40, hd: -10, fs: 30, fe: 60, bs: 10, be: 60, fh: 75, fk: 130, bh: -92, bk: 0 }),
  // coup de pied tornade : fin de la vrille en fouetté (hanches retournées, jambe avant tendue dans l'axe)
  jhkT: mkPose({ lean: -26, hd: 0, fs: 95, fe: 130, bs: -15, be: 45, fh: 98.6, fk: 1.6, bh: 40, bk: 120, spin: 1.75, kyf: -1.55, hxf: 1.5, twist: -1.35, kyb: -1.4 }),
  // chassé sauté : genou d'abord replié en travers, puis jambe avant poussée en diagonale, jambe arrière groupée
  jkChamber: mkPose({ lean: 0, hd: -4, fs: 70, fe: 110, bs: 50, be: 110, fh: 110, fk: 140, bh: 60, bk: 130, spin: 1.2, kyf: -0.7, hxf: 0.3, twist: -0.3, kyb: -1.2 }),
  // ---- CYCLONE KICK (T800) : xuanfeng jiao (旋风脚, « coup de pied tourbillon » du wushu) ----
  // jambe avant (f, côté caméra) = jambe d'appel ET de frappe ; jambe arrière (b) = balancier qui lance la rotation ;
  // main arrière (b) = claque la plante du pied au sommet. spin + = rotation vers la gauche (dos puis poitrine vers la caméra).
  // armé : pas en avant pied rentré, bras balancés vers l'arrière, buste vrillé (ressort), regard sur la cible
  cyWind: mkPose({ lean: 18, hd: -8, fs: -25, fe: 75, bs: 35, be: 100, fh: 36, fk: 56, bh: -26, bk: 40, spin: -0.35, twist: -0.85, kyf: 0.45, headSpin: 1.0, grip: 0.6 }),
  // appel : la jambe arrière monte en croissant extérieur (1er coup), les bras partent vers le haut, la jambe avant pousse
  cyLift: mkPose({ lean: -6, hd: -8, fs: 150, fe: 40, bs: 125, be: 35, fh: -16, fk: 12, bh: 98, bk: 22, spin: 0.75, kyb: -0.75, hxb: 0.15, kyf: 0.3, twist: 0.35, axf: 0.3, axb: 0.5, headSpin: -0.9, grip: 0.4 }),
  cyCres1: mkPose({ lean: 0, hd: -6, fs: 115, fe: 80, bs: 100, be: 90, fh: 30, fk: 70, bh: 102, bk: 14, spin: 1.45, kyb: -0.95, hxb: 0.2, twist: 0.45, headSpin: -1.3, grip: 0.5 }),
  // en l'air, dos à la cible : jambe arrière repliée, jambe de frappe qui monte par l'extérieur, bras serrés (vitesse de rotation)
  cyAir: mkPose({ lean: 6, hd: -6, fs: 70, fe: 120, bs: 115, be: 75, fh: 82, fk: 34, bh: 70, bk: 115, spin: 3.4, kyf: -1.25, hxf: 0.5, twist: 0.25, headSpin: 1.25, grip: 0.7 }),
  // impact : face à la caméra, jambe tendue à hauteur de tête balayée en croissant intérieur vers la cible,
  // la main arrière vient claquer la plante du pied, bras avant ouvert en balancier, jambe d'appel repliée
  cyKick: mkPose({ lean: 6, hd: -10, fs: 55, fe: 35, bs: 100, be: 10, fh: 98, fk: 2, bh: 28, bk: 100, spin: 4.9, kyf: 1.38, kyb: 0.5, twist: 0.5, axf: 1.0, axb: 0.3, headSpin: 0.5, grip: 0 }),
  // fin du croissant : la jambe de frappe redescend, la jambe d'appel s'allonge pour la réception
  cyFall: mkPose({ lean: 10, hd: -8, fs: 70, fe: 60, bs: 70, be: 70, fh: 55, fk: 40, bh: 20, bk: 35, spin: 5.05, kyf: 0.9, kyb: 0.6, twist: 0.2, axf: 0.6, axb: 0.4, headSpin: 0.3, grip: 0.4 }),
  // réception en position du cavalier (mǎbù) face caméra : cuisses à l'horizontale ouvertes, tibias verticaux, garde
  cyLand: mkPose({ lean: 8, hd: -6, fs: 10, fe: 15, bs: 95, be: 110, fh: 78, fk: 84, bh: 78, bk: 84, spin: 5.13, kyf: -1.15, kyb: 1.15, twist: 0.1, axf: 1.45, headSpin: 1.0, grip: 0 }),
  // ---- prises / projections ----
  grab: mkPose({ lean: 15, hd: -5, fs: 85, fe: 35, bs: 80, be: 40, fh: 30, fk: 30, bh: -25, bk: 15, grip: 0.6 }),
  liftOver: mkPose({ lean: -12, hd: -20, fs: 170, fe: 20, bs: 165, be: 25, fh: 15, fk: 25, bh: -15, bk: 20 }),
  bridge: mkPose({ lean: -120, hd: -40, fs: 200, fe: 10, bs: 200, be: 10, fh: 20, fk: 60, bh: -10, bk: 70 }),
  hipLoad: mkPose({ lean: 45, hd: -10, fs: 60, fe: 60, bs: 100, be: 40, fh: 30, fk: 45, bh: -20, bk: 30 }),
  hipThrow: mkPose({ lean: 70, hd: -10, fs: 40, fe: 30, bs: 120, be: 30, fh: 35, fk: 50, bh: -25, bk: 20 }),
  shoot: mkPose({ lean: 65, hd: -20, fs: 100, fe: 40, bs: 95, be: 45, fh: 85, fk: 110, bh: -40, bk: 30 }),
  carry: mkPose({ lean: 15, hd: -10, fs: 150, fe: 60, bs: 140, be: 70, fh: 25, fk: 30, bh: -20, bk: 20 }),
  slamFwd: mkPose({ lean: 60, hd: -10, fs: 110, fe: 10, bs: 110, be: 10, fh: 70, fk: 90, bh: -10, bk: 40 }),
  // ---- Atlas : contorsions permises par ses moteurs à rotation continue ----
  contort: mkPose({ lean: -175, hd: -60, fs: 200, fe: 0, bs: 200, be: 0, fh: 10, fk: -45, bh: -10, bk: -45 }),
  handstand: mkPose({ lean: 0, hd: 0, fs: 180, fe: 0, bs: 180, be: 0, fh: 55, fk: 10, bh: -55, bk: 10, rot: -180, grip: 0 }),
  scissor: mkPose({ lean: 0, hd: 0, fs: 180, fe: 0, bs: 180, be: 0, fh: 25, fk: 60, bh: -25, bk: 60, rot: -180, grip: 0 })
};
function lerpPose(a, b, t) { const o = {}; for (const k of PKEYS) o[k] = a[k] + (b[k] - a[k]) * t; return o; }

/* ---------- squelette (cinématique directe) ---------- */
function skeleton(ch, p, face, sc = 1) {
  const s = ch.scale * sc, lg = ch.leg;
  const L = { th: 44 * s * lg, sh: 44 * s * lg, to: 60 * s, ua: 33 * s, fa: 31 * s, nk: 16 * s };
  const P = {};
  const ang = (o, a, len) => ({ x: o.x + Math.sin(a * D2R) * len * face, y: o.y + Math.cos(a * D2R) * len });
  const hip = { x: 0, y: 0 };
  const lean = p.lean;
  P.hip = hip;
  P.neck = { x: Math.sin(lean * D2R) * L.to * face, y: -Math.cos(lean * D2R) * L.to };
  P.head = { x: P.neck.x + Math.sin((lean + p.hd) * D2R) * L.nk * face, y: P.neck.y - Math.cos((lean + p.hd) * D2R) * L.nk };
  const shp = { x: P.neck.x * 0.86, y: P.neck.y * 0.86 };
  const off = 3 * s * face;
  P.fsh = { x: shp.x + off, y: shp.y }; P.bsh = { x: shp.x - off, y: shp.y };
  // bras : angle 0 = vers le bas ; le torse incliné décale l'angle
  P.fel = ang(P.fsh, p.fs, L.ua); P.fha = ang(P.fel, p.fs + p.fe, L.fa);
  P.bel = ang(P.bsh, p.bs, L.ua); P.bha = ang(P.bel, p.bs + p.be, L.fa);
  // jambes
  const ks = ch.revKnee ? -1 : 1;
  P.fhi = { x: off * 0.6, y: 0 }; P.bhi = { x: -off * 0.6, y: 0 };
  const fk = p.fk, bk = p.bk, fh = p.fh, bh = p.bh;
  if (ch.revKnee) {
    // genoux inversés (autruche) : pieds placés comme ceux d'un robot à genoux normaux (même gameplay),
    // genou en miroir derrière la ligne hanche → pied, un peu plus fléchi sur la jambe d'appui (posture de Digit)
    for (const [sd, h, k] of [['f', p.fh, p.fk], ['b', p.bh, p.bk]]) {
      const H = P[sd + 'hi'], Kn = ang(H, h, L.th), Fn = ang(Kn, h - k, L.sh);
      const dx = Fn.x - H.x, dy = Fn.y - H.y, d0 = Math.hypot(dx, dy) || 1, ux = dx / d0, uy = dy / d0;
      const d = Math.min(d0 * (1 - 0.075 * Math.pow(Math.max(0, uy), 8)), (L.th + L.sh) * 0.9995);
      const along = (L.th * L.th - L.sh * L.sh + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, L.th * L.th - along * along));
      const cr = ux * (Kn.y - H.y) - uy * (Kn.x - H.x), sg = Math.abs(cr) > 1e-6 ? (cr > 0 ? -1 : 1) : face * (uy < 0 ? -1 : 1);
      P[sd + 'kn'] = { x: H.x + ux * along - uy * hh * sg, y: H.y + uy * along + ux * hh * sg };
      P[sd + 'fo'] = { x: H.x + ux * d, y: H.y + uy * d };
    }
  } else {
    P.fkn = ang(P.fhi, fh, L.th); P.ffo = ang(P.fkn, fh - fk, L.sh);
    P.bkn = ang(P.bhi, bh, L.th); P.bfo = ang(P.bkn, bh - bk, L.sh);
  }
  P._fshin = fh - fk; P._bshin = bh - bk; P._ks = ks;
  // rotation globale autour du centre du torse
  if (p.rot) {
    const c = { x: P.neck.x * 0.45, y: P.neck.y * 0.45 };
    const r = p.rot * D2R * face, cs = Math.cos(r), sn = Math.sin(r);
    for (const k in P) if (typeof P[k] === 'object') {
      const dx = P[k].x - c.x, dy = P[k].y - c.y;
      P[k] = { x: c.x + dx * cs - dy * sn, y: c.y + dx * sn + dy * cs };
    }
  }
  if (p.sx !== 1) for (const k in P) if (typeof P[k] === 'object') P[k] = { x: P[k].x * p.sx, y: P[k].y };
  let low = 0;
  for (const k of ['ffo', 'bfo', 'fkn', 'bkn', 'fha', 'bha', 'head', 'neck', 'hip']) low = Math.max(low, P[k].y);
  P._low = low + 7 * s;
  P._s = s; P._L = L;
  return P;
}
const HIP_H = 88; // hauteur de hanche debout (pour le placement en l'air)

/* ---------- rendu ---------- */
function limb(c, a, b, w, col, out, hl = true) {
  c.lineCap = 'round';
  c.strokeStyle = out; c.lineWidth = w + 4;
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  c.strokeStyle = col; c.lineWidth = w;
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  if (hl) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d * w * 0.22, ny = dx / d * w * 0.22;
    c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = w * 0.28;
    c.beginPath(); c.moveTo(a.x + nx - dx * 0.0, a.y + ny); c.lineTo(b.x + nx, b.y + ny); c.stroke();
  }
}
function dot(c, p, r, col, out) {
  c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2);
  if (out) { c.fillStyle = out; c.fill(); c.beginPath(); c.arc(p.x, p.y, r - 2, 0, Math.PI * 2); }
  c.fillStyle = col; c.fill();
}

// pal : palette éventuellement remplacée (flash blanc, image rémanente)
function drawRobot(c, ch, pose, x, y, face, sc = 1, opt = {}) {
  const P = opt.skel || skeleton(ch, pose, face, sc);
  const s = P._s;
  const pal = opt.pal || ch;
  const out = opt.pal ? pal.trim : '#08090c';
  const dark = opt.pal ? pal.body : shade(pal.body, -0.32);
  const bulk = ch.bulk * s;
  c.save();
  c.translate(x, y);
  if (opt.alpha != null) c.globalAlpha = opt.alpha;
  // ---- membres arrière (plus sombres)
  const backBody = opt.pal ? pal.body : shade(pal.body, -0.38);
  const backJoint = opt.pal ? pal.joint : shade(pal.joint, -0.3);
  limb(c, P.bhi, P.bkn, 17 * bulk, backBody, out, false);
  limb(c, P.bkn, P.bfo, 14 * bulk, backJoint, out, false);
  foot(c, P, 'b', ch, s, opt.pal ? pal.trim : shade(pal.trim, -0.3), out, face);
  dot(c, P.bkn, 8 * bulk, backJoint, out);
  limb(c, P.bsh, P.bel, 13 * bulk, backBody, out, false);
  limb(c, P.bel, P.bha, 11 * bulk, backJoint, out, false);
  dot(c, P.bha, 7.5 * bulk, opt.pal ? pal.joint : shade(pal.trim, -0.2), out);
  // ---- sac à dos (ASIMO / Atlas)
  if ((ch.head === 'asimo' || ch.head === 'digit') && !opt.noExtras) {
    const ux = P.neck.x - P.hip.x, uy = P.neck.y - P.hip.y, d = Math.hypot(ux, uy);
    const nx = -uy / d * face, ny = ux / d * face;
    c.save();
    c.fillStyle = ch.head === 'asimo' ? pal.body : pal.trim; c.strokeStyle = out; c.lineWidth = 3;
    const bx = P.hip.x + ux * 0.62 - nx * 22 * s, by = P.hip.y + uy * 0.62 - ny * 22 * s;
    c.translate(bx, by); c.rotate(Math.atan2(uy, ux) + Math.PI / 2);
    roundRect(c, -12 * s, -22 * s, 24 * s, 40 * s, 7 * s); c.fill(); c.stroke();
    c.restore();
  }
  // ---- torse
  drawTorso(c, ch, P, s, pal, out, face, opt);
  // ---- tête
  const ha = Math.atan2(P.head.x - P.neck.x, -(P.head.y - P.neck.y));
  limb(c, P.neck, { x: lerp(P.neck.x, P.head.x, 0.5), y: lerp(P.neck.y, P.head.y, 0.5) }, 10 * s, pal.joint, out, false);
  const hsx = Math.abs(pose.sx) < 0.25 ? 0.25 * (pose.sx < 0 ? -1 : 1) : pose.sx;
  c.save(); c.translate(P.head.x, P.head.y); c.rotate(ha); c.scale(face * hsx, 1);
  drawHead(c, ch, s * 1.0, pal, out, opt);
  c.restore();
  // ---- membres avant
  limb(c, P.fhi, P.fkn, 17 * bulk, pal.body, out);
  limb(c, P.fkn, P.ffo, 14 * bulk, pal.joint, out);
  kneePad(c, P.fkn, 9 * bulk, pal, out, ch);
  foot(c, P, 'f', ch, s, pal.trim, out, face);
  limb(c, P.fsh, P.fel, 13 * bulk, pal.body, out);
  dot(c, P.fsh, 11 * bulk, pal.body, out);
  limb(c, P.fel, P.fha, 11 * bulk, pal.joint, out);
  dot(c, P.fel, 6.5 * bulk, pal.joint, out);
  hand(c, P, ch, s, pal, out);
  c.restore();
  return P;
}
function kneePad(c, p, r, pal, out, ch) {
  dot(c, p, r, pal.joint, out);
  if (!ch.revKnee) { c.fillStyle = pal.accent; c.globalAlpha *= 0.9; c.beginPath(); c.arc(p.x, p.y, r * 0.35, 0, 7); c.fill(); c.globalAlpha /= 0.9; }
}
function hand(c, P, ch, s, pal, out) {
  const a = P.fel, b = P.fha;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  c.save(); c.translate(b.x, b.y); c.rotate(ang);
  c.fillStyle = out; roundRect(c, -4 * s, -8 * s, 18 * s, 16 * s, 5 * s); c.fill();
  c.fillStyle = ch.head === 'digit' ? pal.trim : pal.joint; roundRect(c, -2.5 * s, -6.5 * s, 15 * s, 13 * s, 4 * s); c.fill();
  c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(0, -5 * s, 11 * s, 2.5 * s);
  c.restore();
}
function foot(c, P, side, ch, s, col, out, face) {
  const k = P[side + 'kn'], f = P[side + 'fo'];
  const dx = f.x - k.x, dy = f.y - k.y, d = Math.hypot(dx, dy) || 1;
  // direction "avant" du pied : perpendiculaire au tibia, côté du visage
  let fx = dy / d * face, fy = -dx / d * face;
  if (P._ks < 0) { fx = face * 0.95; fy = 0.1; }
  const len = (ch.revKnee ? 20 : 24) * s;
  c.lineCap = 'round';
  c.strokeStyle = out; c.lineWidth = 13 * s;
  c.beginPath(); c.moveTo(f.x - fx * 6 * s, f.y - fy * 6 * s); c.lineTo(f.x + fx * len, f.y + fy * len); c.stroke();
  c.strokeStyle = col; c.lineWidth = 9 * s;
  c.beginPath(); c.moveTo(f.x - fx * 6 * s, f.y - fy * 6 * s); c.lineTo(f.x + fx * len, f.y + fy * len); c.stroke();
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function drawTorso(c, ch, P, s, pal, out, face, opt) {
  const ux0 = P.neck.x - P.hip.x, uy0 = P.neck.y - P.hip.y, len = Math.hypot(ux0, uy0);
  const ux = ux0 / len, uy = uy0 / len;
  let nx = -uy * face, ny = ux * face; // normale vers l'avant
  const at = (t, w) => ({ x: P.hip.x + ux0 * t + nx * w, y: P.hip.y + uy0 * t + ny * w });
  const cw = 24 * s * ch.chest, ww = 15 * s * ch.bulk;
  // bassin
  c.fillStyle = pal.trim; c.strokeStyle = out; c.lineWidth = 3;
  c.beginPath();
  [at(-0.12, -ww - 3), at(-0.12, ww + 3), at(0.18, ww + 4), at(0.18, -ww - 4)].forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
  c.closePath(); c.fill(); c.stroke();
  // abdomen
  c.fillStyle = pal.joint;
  c.beginPath();
  [at(0.1, -ww), at(0.1, ww), at(0.5, ww + 2), at(0.5, -ww - 2)].forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
  c.closePath(); c.fill(); c.stroke();
  if (!opt.pal) {
    c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 2;
    for (let t = 0.2; t < 0.5; t += 0.09) { const a = at(t, -ww * 0.8), b = at(t, ww * 0.8); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
  }
  // plastron
  const pts = [at(0.42, -ww * 0.9), at(0.42, ww * 1.05), at(0.7, cw * 0.95), at(0.98, cw * 0.62), at(1.04, -cw * 0.3), at(0.92, -cw * 0.75), at(0.62, -cw * 0.62)];
  let g = pal.body;
  if (!opt.pal) {
    const a = at(0.7, -cw), b = at(0.7, cw);
    g = c.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, shade(pal.body, -0.35)); g.addColorStop(0.55, pal.body); g.addColorStop(1, shade(pal.body, 0.35));
  }
  c.fillStyle = g; c.strokeStyle = out; c.lineWidth = 3;
  c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); c.fill(); c.stroke();
  if (!opt.pal) {
    // détails : ligne d'accent / logo lumineux
    c.strokeStyle = pal.accent; c.lineWidth = 2.5 * s; c.shadowColor = pal.accent; c.shadowBlur = 8;
    const p1 = at(0.62, cw * 0.55), p2 = at(0.86, cw * 0.45);
    c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke();
    if (ch.id === 'figure' || ch.id === 'h1') { const q = at(0.78, cw * 0.1); c.fillStyle = pal.accent; c.beginPath(); c.arc(q.x, q.y, 3 * s, 0, 7); c.fill(); }
    c.shadowBlur = 0;
    // panneau sombre latéral (Optimus)
    if (ch.id === 'optimus' || ch.id === 'apollo') {
      c.fillStyle = pal.trim; c.beginPath();
      [at(0.45, -ww * 0.85), at(0.45, -ww * 0.2), at(0.85, -cw * 0.2), at(0.9, -cw * 0.62), at(0.62, -cw * 0.6)].forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
      c.closePath(); c.fill();
    }
  }
}

/* ---------- têtes (un design par robot) ---------- */
function drawHead(c, ch, s, pal, out, opt = {}) {
  const flat = !!opt.pal;
  c.lineWidth = 3; c.strokeStyle = out;
  const glow = (col, b = 12) => { if (!flat) { c.shadowColor = col; c.shadowBlur = b; } };
  const noGlow = () => { c.shadowBlur = 0; };
  switch (ch.head) {
    case 'optimus': { // casque ovale blanc, visière noire brillante
      c.fillStyle = pal.body; c.beginPath(); c.ellipse(0, -2 * s, 16 * s, 20 * s, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = flat ? pal.body : pal.visor;
      c.beginPath(); c.ellipse(6 * s, 0, 11 * s, 16 * s, 0.05, 0, 7); c.fill();
      if (!flat) {
        c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(9 * s, -7 * s, 3 * s, 6 * s, 0.3, 0, 7); c.fill();
        glow(pal.accent); c.fillStyle = pal.accent; c.fillRect(-12 * s, 6 * s, 6 * s, 2 * s); noGlow();
      }
      break;
    }
    case 'atlas': { // Atlas électrique : tête ronde avec anneau lumineux
      c.fillStyle = pal.body; c.beginPath(); c.arc(0, -2 * s, 19 * s, 0, 7); c.fill(); c.stroke();
      c.fillStyle = flat ? pal.body : '#1d1f24'; c.beginPath(); c.ellipse(7 * s, -2 * s, 11 * s, 14 * s, 0, 0, 7); c.fill();
      if (!flat) {
        glow(pal.accent, 20); c.strokeStyle = pal.accent; c.lineWidth = 4.5 * s;
        c.beginPath(); c.ellipse(7 * s, -2 * s, 10 * s, 13 * s, 0, 0, 7); c.stroke(); noGlow();
        c.strokeStyle = '#fff8'; c.lineWidth = 1.5 * s; c.beginPath(); c.ellipse(7 * s, -2 * s, 10 * s, 13 * s, 0, 0, 7); c.stroke();
      }
      break;
    }
    case 'figure': { // tête noire arrondie, écran facial
      c.fillStyle = pal.body; roundRect(c, -14 * s, -22 * s, 28 * s, 38 * s, 13 * s); c.fill(); c.stroke();
      c.fillStyle = flat ? pal.body : pal.visor; roundRect(c, -2 * s, -14 * s, 15 * s, 22 * s, 7 * s); c.fill();
      if (!flat) {
        glow(pal.accent, 14); c.fillStyle = pal.accent;
        c.fillRect(4 * s, -6 * s, 7 * s, 2.2 * s); noGlow();
        c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.ellipse(-4 * s, -12 * s, 4 * s, 6 * s, -0.4, 0, 7); c.fill();
      }
      break;
    }
    case 'asimo': { // grand casque blanc, large visière noire
      c.fillStyle = pal.body; c.beginPath(); c.arc(0, -4 * s, 23 * s, 0, 7); c.fill(); c.stroke();
      c.fillStyle = flat ? pal.body : pal.visor;
      c.beginPath(); c.ellipse(9 * s, -3 * s, 13 * s, 12 * s, 0, 0, 7); c.fill();
      if (!flat) {
        c.fillStyle = 'rgba(120,170,255,.35)'; c.beginPath(); c.ellipse(12 * s, -8 * s, 5 * s, 3 * s, 0.2, 0, 7); c.fill();
        c.fillStyle = '#9fa3aa'; c.beginPath(); c.arc(-8 * s, -3 * s, 7 * s, 0, 7); c.fill(); c.stroke();
        glow(pal.accent, 8); c.fillStyle = pal.accent; c.beginPath(); c.arc(-8 * s, -3 * s, 2.5 * s, 0, 7); c.fill(); noGlow();
      }
      break;
    }
    case 'h1': { // tête noire allongée sans visage
      c.fillStyle = pal.body; c.beginPath(); c.ellipse(1 * s, -4 * s, 13 * s, 21 * s, 0.12, 0, 7); c.fill(); c.stroke();
      if (!flat) {
        c.fillStyle = '#0d0e10'; c.beginPath(); c.ellipse(5 * s, -2 * s, 8 * s, 14 * s, 0.12, 0, 7); c.fill();
        glow(pal.accent, 14); c.fillStyle = pal.accent; c.beginPath(); c.arc(9 * s, -5 * s, 2.4 * s, 0, 7); c.fill(); noGlow();
        c.fillStyle = 'rgba(255,255,255,.15)'; c.beginPath(); c.ellipse(-3 * s, -14 * s, 3 * s, 6 * s, 0, 0, 7); c.fill();
      }
      break;
    }
    case 'ameca': { // visage humain gris très expressif
      c.fillStyle = pal.body; c.beginPath(); c.ellipse(1 * s, -3 * s, 15 * s, 20 * s, 0, 0, 7); c.fill(); c.stroke();
      if (!flat) {
        c.fillStyle = shade(pal.body, -0.25); c.beginPath(); c.ellipse(-9 * s, -3 * s, 5 * s, 7 * s, 0, 0, 7); c.fill(); // oreille
        c.fillStyle = '#f0f2f5'; c.beginPath(); c.ellipse(8 * s, -7 * s, 4.2 * s, 3.4 * s, 0, 0, 7); c.fill();
        glow(pal.accent, 8); c.fillStyle = '#4a7dff'; c.beginPath(); c.arc(9.3 * s, -7 * s, 2 * s, 0, 7); c.fill(); noGlow();
        c.fillStyle = '#111'; c.beginPath(); c.arc(9.6 * s, -7 * s, 0.9 * s, 0, 7); c.fill();
        c.strokeStyle = '#555a61'; c.lineWidth = 1.6 * s;
        c.beginPath(); c.moveTo(4 * s, -12 * s); c.lineTo(12 * s, -11.5 * s); c.stroke(); // sourcil
        c.beginPath(); c.moveTo(14 * s, -5 * s); c.lineTo(16 * s, 1 * s); c.lineTo(13 * s, 2 * s); c.stroke(); // nez
        c.strokeStyle = '#3d4046'; c.lineWidth = 2 * s;
        c.beginPath(); c.moveTo(8 * s, 8 * s); c.quadraticCurveTo(12 * s, 9 * s, 14 * s, 7 * s); c.stroke(); // bouche
        c.strokeStyle = '#6b7078'; c.lineWidth = 1; c.beginPath(); c.arc(-1 * s, -6 * s, 14 * s, -2.6, -1.0); c.stroke();
      }
      break;
    }
    case 'digit': { // tête rectangulaire avec yeux LED
      c.fillStyle = pal.body; roundRect(c, -12 * s, -15 * s, 26 * s, 24 * s, 6 * s); c.fill(); c.stroke();
      c.fillStyle = flat ? pal.body : pal.visor; roundRect(c, 0, -10 * s, 15 * s, 14 * s, 4 * s); c.fill();
      if (!flat) {
        glow(pal.accent, 12); c.fillStyle = pal.accent;
        roundRect(c, 3 * s, -6 * s, 4 * s, 6 * s, 2 * s); c.fill(); roundRect(c, 9 * s, -6 * s, 4 * s, 6 * s, 2 * s); c.fill(); noGlow();
      }
      break;
    }
    case 'apollo': { // tête arrondie avec écran-visage souriant
      c.fillStyle = pal.body; roundRect(c, -15 * s, -22 * s, 31 * s, 36 * s, 14 * s); c.fill(); c.stroke();
      c.fillStyle = flat ? pal.body : pal.visor; roundRect(c, -1 * s, -15 * s, 16 * s, 22 * s, 8 * s); c.fill();
      if (!flat) {
        glow('#5fd0ff', 10); c.fillStyle = '#5fd0ff';
        c.beginPath(); c.ellipse(5 * s, -6 * s, 2 * s, 3 * s, 0, 0, 7); c.fill();
        c.beginPath(); c.ellipse(11 * s, -6 * s, 2 * s, 3 * s, 0, 0, 7); c.fill(); noGlow();
        c.fillStyle = pal.accent; c.fillRect(-13 * s, -2 * s, 5 * s, 3 * s);
      }
      break;
    }
  }
  noGlow();
}

/* ---------- skins (variantes de couleurs / thèmes) ----------
   ch.skins = [{ id, name, ch?: {accent, proj, body, ...} }, ...] — le premier est le skin d'origine.
   withSkin(ch, idOuIndex) → personnage dérivé (même id, key = id#skin), mis en cache ; le modèle 3D lit ch.skin.
   'mirror' : pour un combat miroir, skin suivant si le robot en a, sinon teinte automatique. */
const SKIN_CACHE = {};
function skinList(ch) { return (ch.base || ch).skins || [{ id: 'classic', name: 'ORIGINAL' }]; }
function withSkin(ch, s) {
  const base = ch.base || ch, list = skinList(base);
  if (s === 'mirror') {
    if (list.length > 1) return withSkin(base, (list.findIndex(x => x.id === (ch.skin || list[0].id)) + 1) % list.length);
    const key = base.id + '#mirror';
    return SKIN_CACHE[key] || (SKIN_CACHE[key] = Object.assign({}, base, { base, key, skin: 'mirror', skinName: 'MIROIR', tint: '#ffb070', accent: shade(base.accent, 0.25) }));
  }
  const sk = typeof s === 'number' ? list[((s % list.length) + list.length) % list.length] : (list.find(x => x.id === s) || list[0]);
  if (sk === list[0]) return base;
  const key = base.id + '#' + sk.id;
  return SKIN_CACHE[key] || (SKIN_CACHE[key] = Object.assign({}, base, sk.ch || {}, { base, key, skin: sk.id, skinName: sk.name }));
}
const chKey = ch => ch.key || ch.id;

/* ---------- portraits (cache) ---------- */
const PORTRAIT_CACHE = {};
function portrait(ch, size = 120, flip = false) {
  const key = chKey(ch) + size + flip;
  if (PORTRAIT_CACHE[key]) return PORTRAIT_CACHE[key];
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, shade(ch.accent, -0.55)); g.addColorStop(1, '#07080c');
  c.fillStyle = g; c.fillRect(0, 0, size, size);
  c.strokeStyle = hexA(ch.accent, 0.25); c.lineWidth = 1;
  for (let i = -size; i < size * 2; i += 8) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i - size, size); c.stroke(); }
  // même cadrage que l'icône du combat (HUD) : gros plan tête et épaules qui remplit la case
  if (typeof R3 !== 'undefined' && R3) { c.drawImage(R3.headShot(ch, size, flip ? -1 : 1), 0, size * 0.03); PORTRAIT_CACHE[key] = cv; return cv; }
  const sc = size / 70;
  const pose = mkPose({ ...POSES.idle, lean: 4, hd: -6, fs: 20, fe: 30, bs: 15, be: 30 });
  const face = flip ? -1 : 1;
  const P = skeleton(ch, pose, face, sc);
  drawRobot(c, ch, pose, size / 2 - P.head.x * 0.9, size * 0.42 - P.head.y, face, sc);
  PORTRAIT_CACHE[key] = cv;
  return cv;
}

// tête détourée (HUD)
const HEAD_CACHE = {};
function headShot(ch, size, face = 1) {
  const key = chKey(ch) + size + face;
  if (HEAD_CACHE[key]) return HEAD_CACHE[key];
  let cv;
  if (typeof R3 !== 'undefined' && R3) cv = R3.headShot(ch, size, face);
  else cv = portrait(ch, size, face < 0);
  return (HEAD_CACHE[key] = cv);
}
