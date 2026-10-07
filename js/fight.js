'use strict';
/* =========================================================
   COMBAT : combattants, coups, coups spéciaux, super, effets, IA, HUD
   ========================================================= */
// keys : [frame, pose (nom ou objet), options {spin, twist, headSpin}] — animation armé → extension → réarmé
const NORMALS = {
  lp: { pose: 'lp', st: 4, ac: 3, rc: 8, dmg: 35, hs: 14, bs: 9, limb: 'fha', r: 15, kb: 5, lvl: 1, cancel: true,
    keys: [[0, 'idle'], [3, 'lp', { twist: 0.25 }], [7, 'lp', { twist: 0.25 }], [15, 'idle']] },
  hp: { pose: 'hp', st: 7, ac: 4, rc: 17, dmg: 85, hs: 20, bs: 14, limb: 'bha', r: 19, kb: 9, lvl: 2, cancel: true,
    keys: [[0, 'idle'], [5, 'hp', { twist: -0.55 }], [11, 'hp', { twist: -0.55 }], [28, 'idle']] },
  // fouetté médian (boxe française) : armé du genou, rotation de hanche, frappe de la pointe
  lk: { pose: 'fouette', st: 6, ac: 4, rc: 8, dmg: 48, hs: 15, bs: 9, limb: 'ffo', r: 18, kb: 6, lvl: 1, cancel: true, name: 'FOUETTÉ',
    keys: [[0, 'idle'], [4, 'kChamber'], [6, 'fouette'], [10, 'fouette'], [14, 'kChamber'], [18, 'idle']] },
  // high kick de la jambe arrière (MMA) : pivot, armé, extension haute, bras de balancier
  hk: { pose: 'rkHigh', st: 10, ac: 5, rc: 14, dmg: 100, hs: 21, bs: 14, limb: 'bfo', r: 22, kb: 11, lvl: 2, name: 'HIGH KICK',
    keys: [[0, 'idle'], [5, 'rkChamber'], [10, 'rkHigh'], [15, 'rkHigh'], [21, 'rkChamber'], [29, 'idle']] },
  clp: { pose: 'clp', base: 'crouch', st: 4, ac: 3, rc: 8, dmg: 30, hs: 13, bs: 8, limb: 'fha', r: 15, kb: 5, lvl: 1, cancel: true },
  chp: { pose: 'chp', base: 'crouch', st: 6, ac: 6, rc: 18, dmg: 80, hs: 20, bs: 13, limb: 'fha', r: 24, kb: 7, lvl: 2, cancel: true },
  // low kick (MMA) dans le mollet
  clk: { pose: 'clkMMA', base: 'crouch', st: 6, ac: 3, rc: 11, dmg: 38, hs: 13, bs: 8, limb: 'ffo', r: 17, kb: 5, lvl: 1, h: 'low', cancel: true, name: 'LOW KICK',
    keys: [[0, 'crouch'], [6, 'clkMMA', { spin: 0.5 }], [9, 'clkMMA', { spin: 0.5 }], [20, 'crouch']] },
  // balayage retourné : rotation complète au ras du sol, jambe arrière tendue
  chk: { pose: 'chkSpin', base: 'crouch', st: 8, ac: 6, rc: 22, dmg: 90, hs: 20, bs: 14, limb: 'bfo', r: 22, kb: 6, lvl: 2, h: 'low', kd: true, launch: -4, name: 'BALAYAGE',
    keys: [[0, 'crouch'], [7, 'chkSpin', { spin: 2.4 }], [11, 'chkSpin', { spin: 3.14 }], [15, 'chkSpin', { spin: 3.9 }], [24, 'crouch', { spin: 6.28 }], [36, 'crouch', { spin: 6.28 }]] },
  jlp: { pose: 'jp', base: 'jump', st: 4, ac: 30, rc: 0, dmg: 45, hs: 16, bs: 10, limb: 'fha', r: 18, kb: 4, lvl: 1, h: 'high' },
  jhp: { pose: 'jp', base: 'jump', st: 6, ac: 20, rc: 0, dmg: 85, hs: 22, bs: 14, limb: 'fha', r: 21, kb: 6, lvl: 2, h: 'high' },
  // chassé sauté (coup de pied latéral en l'air)
  jlk: { pose: 'jk', base: 'jump', st: 4, ac: 30, rc: 0, dmg: 50, hs: 16, bs: 10, limb: 'ffo', r: 19, kb: 4, lvl: 1, h: 'high' },
  // coup de pied tornade (360° en l'air)
  jhk: { pose: 'jhkT', base: 'jump', st: 6, ac: 20, rc: 0, dmg: 90, hs: 22, bs: 14, limb: 'ffo', r: 22, kb: 6, lvl: 2, h: 'high', name: 'TORNADE',
    keys: [[0, 'jump'], [6, 'jhkT', { spin: 6.28 }], [26, 'jhkT', { spin: 6.28 }]] },
  // ---- coups de commande (avant + bouton) ----
  // chassé frontal / teep : repousse l'adversaire
  flk: { pose: 'teep', st: 7, ac: 4, rc: 14, dmg: 55, hs: 16, bs: 10, limb: 'ffo', r: 20, kb: 18, lvl: 2, name: 'CHASSÉ FRONTAL',
    keys: [[0, 'idle'], [4, 'teepChamber'], [7, 'teep'], [11, 'teep'], [16, 'teepChamber'], [25, 'idle']] },
  // coup de pied retourné (spinning back kick)
  fhk: { pose: 'backKick', st: 11, ac: 4, rc: 18, dmg: 115, hs: 24, bs: 16, limb: 'bfo', r: 23, kb: 15, lvl: 3, name: 'RETOURNÉ',
    keys: [[0, 'idle'], [6, 'backTurn', { spin: 2.2 }], [11, 'backKick', { spin: 3.14 }], [15, 'backKick', { spin: 3.14 }], [24, 'backTurn', { spin: 4.6 }], [33, 'idle', { spin: 6.28 }]] },
  // genou sauté (MMA)
  fhp: { pose: 'knee', st: 9, ac: 6, rc: 14, dmg: 100, hs: 24, bs: 15, limb: 'fkn', r: 24, kb: 8, lvl: 3, kd: true, launch: -7, name: 'GENOU SAUTÉ', hop: { at: 4, vx: 6, vy: -7.5 },
    keys: [[0, 'idle'], [4, 'crouch'], [9, 'knee'], [15, 'knee'], [22, 'jump'], [29, 'idle']] }
};
// pose interpolée d'un coup à images-clés (la rotation du corps projette aussi le squelette 2D : sx = cos(spin))
function keyPose(keys, t) {
  let i = 0; while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1] || a;
  const P = k => ({ ...(typeof k[1] === 'string' ? POSES[k[1]] : k[1]), ...(k[2] || {}) });
  const k = b === a ? 1 : clamp((t - a[0]) / Math.max(1, b[0] - a[0]), 0, 1);
  const p = lerpPose(P(a), P(b), k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  p.sx = Math.cos(p.spin || 0);
  return p;
}
const SPECIAL_MV = {
  proj: { dmg: 90, hs: 22, bs: 16, kb: 8, lvl: 3, chip: true },
  uppercut: { limb: 'fha', r: 26, dmg: 70, hs: 25, bs: 16, kb: 4, lvl: 3, kd: true, launch: -10, hits: 2, every: 8, chip: true },
  flip: { limb: 'ffo', r: 28, dmg: 70, hs: 25, bs: 16, kb: 4, lvl: 3, kd: true, launch: -10, hits: 2, every: 8, chip: true },
  spin: { limb: 'ffo', r: 26, dmg: 42, hs: 18, bs: 12, kb: 5, lvl: 2, hits: 3, every: 10, chip: true },
  rush: { limb: 'fha', r: 26, dmg: 110, hs: 25, bs: 16, kb: 12, lvl: 3, kd: true, launch: -7, chip: true },
  beam: { dmg: 30, hs: 30, bs: 12, kb: 2, lvl: 4, chip: true, sup: true },
  storm: { limb: 'fha', r: 34, dmg: 34, hs: 30, bs: 10, kb: 1, lvl: 4, hits: 9, every: 4, chip: true, sup: true, drag: true },
  srush: { limb: 'fha', r: 30, dmg: 30, hs: 60, bs: 16, kb: 0, lvl: 4, chip: true, sup: true },
  moulinet: { limb: 'ffo', r: 36, dmg: 10, hs: 60, bs: 10, kb: 0, lvl: 3, sup: true }
};
const MOT = { QCF: [2, 3, 6], QCB: [2, 1, 4], DP: [6, 2, 3], SUP: [2, 3, 6, 2, 3, 6] };

/* ---------------- particules / effets ---------------- */
const FX = {
  parts: [],
  add(p) { if (this.parts.length < 1200) this.parts.push(Object.assign({ vx: 0, vy: 0, life: 20, max: 20, size: 4, g: 0, drag: 1, type: 'glow', col: '#fff' }, p)); },
  clear() { this.parts.length = 0; },
  update() {
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag;
      if (p.type === 'debris' && p.y > GROUND + 6 && p.vy > 0) { p.y = GROUND + 6; p.vy *= -0.45; p.vx *= 0.7; }
      if (p.target) { p.x += (p.target.x - p.x) * 0.12; p.y += (p.target.y - p.y) * 0.12; }
      if (--p.life <= 0) P.splice(i, 1);
    }
  },
  draw(c) {
    c.save();
    for (const p of this.parts) {
      const k = p.life / p.max;
      if (p.type === 'smoke' || p.type === 'debris' || p.type === 'shard') {
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = Math.min(1, k * 1.5);
        if (p.type === 'smoke') { c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.size * (1.6 - k), 0, 7); c.fill(); }
        else { c.fillStyle = p.col; c.save(); c.translate(p.x, p.y); c.rotate(p.life * 0.4); c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); c.restore(); }
        continue;
      }
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = Math.min(1, k * 1.3);
      if (p.type === 'glow') {
        const r = p.size * (p.grow ? (1 + (1 - k) * p.grow) : 1);
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, p.core || '#fff'); g.addColorStop(0.35, p.col); g.addColorStop(1, hexA(p.col, 0));
        c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill();
      } else if (p.type === 'spark') {
        c.strokeStyle = p.col; c.lineWidth = p.size * k + 0.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * (p.len || 3), p.y - p.vy * (p.len || 3)); c.stroke();
      } else if (p.type === 'ring') {
        c.strokeStyle = p.col; c.lineWidth = (p.lw || 6) * k;
        c.beginPath(); c.ellipse(p.x, p.y, p.size * (1 - k) + 4, (p.size * (1 - k) + 4) * (p.flat || 1), 0, 0, 7); c.stroke();
      } else if (p.type === 'star') {
        c.fillStyle = p.col; c.save(); c.translate(p.x, p.y); c.rotate(p.rot || 0);
        const r = p.size * (0.6 + (1 - k) * 0.8);
        c.beginPath();
        for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = i % 2 ? r * 0.18 : r * (i % 4 ? 0.55 : 1); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        c.fill(); c.restore();
      } else if (p.type === 'bolt') {
        c.strokeStyle = p.col; c.lineWidth = 3 * k + 1; c.shadowColor = p.col; c.shadowBlur = 10;
        c.beginPath(); c.moveTo(p.x, p.y);
        const n = 7; for (let i = 1; i <= n; i++) c.lineTo(lerp(p.x, p.x2, i / n) + (i < n ? rand(-14, 14) : 0), lerp(p.y, p.y2, i / n) + (i < n ? rand(-14, 14) : 0));
        c.stroke(); c.shadowBlur = 0;
      }
    }
    c.restore();
  }
};
function hitSpark(x, y, lvl, col, dir, blocked) {
  if (blocked) {
    FX.add({ type: 'ring', x, y, size: 40, life: 12, max: 12, col: '#7fd0ff', lw: 5 });
    for (let i = 0; i < 10; i++) { const a = rand(0, Math.PI * 2), v = rand(3, 8); FX.add({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 10, max: 10, size: 2.5, col: '#9fe0ff' }); }
    FX.add({ type: 'glow', x, y, size: 34, life: 8, max: 8, col: '#4aa8ff' });
    return;
  }
  const n = 8 + lvl * 6, zk = 1 / Math.sqrt(typeof ZOOM === 'number' ? ZOOM : 1);
  FX.add({ type: 'star', x, y, size: (30 + lvl * 14) * zk, life: 9, max: 9, col: lvl >= 3 ? col : '#fff6c0', rot: rand(0, 3) });
  FX.add({ type: 'glow', x, y, size: (40 + lvl * 20) * zk, life: 12, max: 12, col: lvl >= 3 ? col : '#ffb02e', core: '#fff' });
  FX.add({ type: 'ring', x, y, size: (50 + lvl * 25) * zk, life: 14, max: 14, col: '#fff', lw: 4 + lvl * 2 });
  for (let i = 0; i < n; i++) {
    const a = rand(-1.2, 1.2) + (dir > 0 ? 0 : Math.PI), v = rand(5, 10 + lvl * 4);
    FX.add({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, g: 0.35, drag: 0.94, life: rand(12, 26) | 0, max: 26, size: 3, col: pick(['#fff3a0', '#ffc23a', '#ff8a1c', col]), len: 2.5 });
  }
  // petites étoiles bleues qui jaillissent de l'impact (comme dans la vidéo)
  for (let i = 0; i < 2 + lvl * 2; i++) {
    const a = rand(0, Math.PI * 2), v = rand(3, 7 + lvl);
    FX.add({ type: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, drag: 0.9, g: 0.05, size: rand(7, 12) * zk, life: rand(16, 26) | 0, max: 26, col: pick(['#8fe3ff', '#bdf0ff', '#ffffff']), rot: rand(0, 3) });
  }
  // éclats métalliques : ce sont des robots !
  for (let i = 0; i < 3 + lvl * 2; i++)
    FX.add({ type: 'debris', x, y, vx: dir * rand(1, 7) + rand(-2, 2), vy: rand(-9, -3), g: 0.5, life: rand(30, 60) | 0, max: 60, size: rand(3, 7), col: pick(['#cfd3da', '#8a9099', '#ffd27a']) });
}
function dust(x, y, n = 8) {
  for (let i = 0; i < n; i++) FX.add({ type: 'smoke', x: x + rand(-30, 30), y: y - rand(0, 10), vx: rand(-2, 2), vy: rand(-1.5, -0.2), life: 30, max: 30, size: rand(8, 16), col: 'rgba(180,170,160,.35)' });
}
function explosion(x, y, col, big = 1) {
  FX.add({ type: 'glow', x, y, size: 90 * big, life: 22, max: 22, col, core: '#fff', grow: 0.6 });
  FX.add({ type: 'ring', x, y, size: 140 * big, life: 20, max: 20, col: '#fff', lw: 8 });
  FX.add({ type: 'ring', x, y, size: 100 * big, life: 26, max: 26, col, lw: 10 });
  for (let i = 0; i < 26 * big; i++) {
    const a = rand(0, Math.PI * 2), v = rand(4, 15);
    FX.add({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.25, drag: 0.93, life: rand(16, 34) | 0, max: 34, size: 3.5, col: pick([col, '#fff', '#ffe08a']) });
  }
  for (let i = 0; i < 8; i++) FX.add({ type: 'smoke', x: x + rand(-20, 20), y: y + rand(-20, 20), vx: rand(-2, 2), vy: rand(-2, 0), life: 40, max: 40, size: rand(14, 26), col: 'rgba(90,90,100,.4)' });
}

/* ---------------- projectiles ---------------- */
class Projectile {
  constructor(f, x, y, vx, sup) {
    this.f = f; this.x = x; this.y = y; this.vx = vx; this.t = 0; this.dead = false; this.r = 24; this.style = f.ch.proj.style;
    this.col = f.ch.proj.color; this.core = f.ch.proj.core;
  }
  update() {
    this.x += this.vx; this.t++;
    const back = -Math.sign(this.vx);
    if (this.t % 1 === 0) FX.add({ type: 'glow', x: this.x + back * rand(6, 20), y: this.y + rand(-12, 12), vx: back * rand(1, 3), vy: rand(-0.6, 0.6), size: rand(10, 18), life: 16, max: 16, col: this.col });
    if (this.t % 3 === 0) FX.add({ type: 'spark', x: this.x, y: this.y + rand(-14, 14), vx: back * rand(4, 8), vy: rand(-1, 1), size: 2, life: 10, max: 10, col: this.core });
  }
  draw(c) {
    const { x, y, t, col, core } = this;
    c.save(); c.globalCompositeOperation = 'lighter';
    const dir = Math.sign(this.vx);
    if (this.style === 'box') { // caisse de livraison incandescente (Digit)
      c.globalCompositeOperation = 'source-over';
      c.save(); c.translate(x, y); c.rotate(t * 0.25 * dir);
      c.shadowColor = col; c.shadowBlur = 25;
      c.fillStyle = '#c98a3a'; c.fillRect(-18, -18, 36, 36); c.shadowBlur = 0;
      c.strokeStyle = '#6b4416'; c.lineWidth = 3; c.strokeRect(-18, -18, 36, 36);
      c.fillStyle = '#e8c27a'; c.fillRect(-18, -4, 36, 8);
      c.restore();
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(x, y, 0, x, y, 40); g.addColorStop(0, hexA(col, 0.6)); g.addColorStop(1, hexA(col, 0));
      c.fillStyle = g; c.beginPath(); c.arc(x, y, 40, 0, 7); c.fill();
    } else if (this.style === 'ring') { // anneaux hydrauliques (Atlas)
      for (let i = 0; i < 3; i++) {
        const ox = x - dir * i * 16;
        c.strokeStyle = i ? hexA(col, 0.5 - i * 0.12) : core; c.lineWidth = 8 - i * 2; c.shadowColor = col; c.shadowBlur = 20;
        c.beginPath(); c.ellipse(ox, y, 9 + Math.sin(t * 0.5) * 2, 26, 0, 0, 7); c.stroke();
      }
      const g = c.createRadialGradient(x, y, 0, x, y, 44); g.addColorStop(0, hexA(col, 0.55)); g.addColorStop(1, hexA(col, 0));
      c.fillStyle = g; c.beginPath(); c.arc(x, y, 44, 0, 7); c.fill();
    } else if (this.style === 'wave') { // onde psychique (Ameca)
      for (let i = 0; i < 4; i++) {
        c.strokeStyle = hexA(col, 0.9 - i * 0.2); c.lineWidth = 6 - i; c.shadowColor = col; c.shadowBlur = 18;
        c.beginPath(); c.arc(x - dir * i * 14, y, 28 - i * 3, dir > 0 ? -1.1 : Math.PI - 1.1, dir > 0 ? 1.1 : Math.PI + 1.1); c.stroke();
      }
      const g = c.createRadialGradient(x, y, 0, x, y, 30); g.addColorStop(0, core); g.addColorStop(1, hexA(col, 0));
      c.fillStyle = g; c.beginPath(); c.arc(x, y, 30, 0, 7); c.fill();
    } else { // boule d'énergie façon Hadoken
      const r = 26 + Math.sin(t * 0.6) * 3;
      const g = c.createRadialGradient(x, y, 0, x, y, r * 2);
      g.addColorStop(0, '#fff'); g.addColorStop(0.25, core); g.addColorStop(0.5, hexA(col, 0.8)); g.addColorStop(1, hexA(col, 0));
      c.fillStyle = g; c.beginPath(); c.ellipse(x - dir * 8, y, r * 2.2, r * 1.5, 0, 0, 7); c.fill();
      c.strokeStyle = hexA(core, 0.8); c.lineWidth = 3;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(x, y, r * 0.9, r * 0.55, t * 0.3 + i * 2.1, 0, 7); c.stroke(); }
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x + dir * 4, y, r * 0.45, 0, 7); c.fill();
    }
    c.restore();
  }
}

/* ---------------- combattant ---------------- */
class Fighter {
  constructor(ch, side) {
    this.ch = ch; this.side = side;
    this.wins = 0; this.meter = 0;
    this.reset();
  }
  reset() {
    this.x = this.side === 0 ? STAGE_W / 2 - 150 : STAGE_W / 2 + 150;
    this.y = GROUND; this.vx = 0; this.vy = 0; this.face = this.side === 0 ? 1 : -1;
    this.hp = this.dispHp = 1000; this.st = 'idle'; this.t = 0; this.mv = null; this.amv = null;
    this.hist = []; this.buf = []; this.ghosts = []; this.flash = 0; this.inv = 0; this.combo = 0;
    this.push = 0; this.stun = 0; this.hitN = 0; this.hitCD = 0; this.connected = false; this.grav = 0.75;
    this.pose = POSES.idle; this.dirN = 5; this.pad = null; this.proj = null; this.hover = false;
    this.sp = null; this.str = 'h'; this.landRec = 0; this.crouching = false; this.jdir = 0; this.ko = false;
    this.computeSkel();
  }
  get air() { return this.y < GROUND - 0.5 || this.vy < 0; }
  get neutral() { return ['idle', 'walk', 'crouch', 'guard'].includes(this.st); }
  get canBlock() { return ['idle', 'walk', 'crouch', 'guard', 'block'].includes(this.st); }
  setSt(s) { this.st = s; this.t = 0; }
  faceOpp(o) { if (Math.abs(o.x - this.x) > 4) this.face = o.x > this.x ? 1 : -1; }
  readDir(pad) {
    if (!pad) return 5;
    const h = pad.held, f = this.face;
    const fx = (h.r ? 1 : 0) - (h.l ? 1 : 0), rel = fx * f, up = h.u, dn = h.d;
    const v = up ? 1 : dn ? -1 : 0;
    return [[1, 2, 3], [4, 5, 6], [7, 8, 9]][v + 1][rel + 1];
  }
  motion(seq, win, now) {
    let i = seq.length - 1;
    for (let k = this.hist.length - 1; k >= 0; k--) {
      const h = this.hist[k]; if (now - h.t > win) break;
      if (h.d === seq[i]) { i--; if (i < 0) return true; }
    }
    return false;
  }
  takeBuf(now) { while (this.buf.length && now - this.buf[0].t > 8) this.buf.shift(); return this.buf.length ? this.buf.pop() : null; }

  // ----- décisions d'attaque -----
  tryAttack(F, o, specialOnly = false) {
    const b = this.takeBuf(F.frame); if (!b) return false;
    const btn = b.b, now = F.frame, ch = this.ch;
    const P = btn === 'lp' || btn === 'hp', K = btn === 'lk' || btn === 'hk';
    const str = (btn === 'hp' || btn === 'hk' || btn === 'sp1' || btn === 'sp2') ? 'h' : 'l';
    if ((btn === 'su' || ((P || K) && this.motion(MOT.SUP, 45, now))) && this.meter >= 100) { F.startSuper(this); return true; }
    if (btn === 'su') return false;
    const mv = ch.move;
    const dpOk = (mv === 'uppercut' && P) || (mv === 'flip' && K);
    const qcbOk = (mv === 'rush' && P) || (mv === 'spin' && K);
    if (btn === 'sp2' || (dpOk && this.motion(MOT.DP, 18, now)) || (qcbOk && this.motion(MOT.QCB, 16, now))) { this.startSpecial(mv, str, F); return true; }
    if ((btn === 'sp1' || (P && this.motion(MOT.QCF, 16, now))) && !this.proj) { this.startSpecial('proj', str, F); return true; }
    if (specialOnly || btn === 'sp1') return false;
    const crouch = this.dirN <= 3;
    // projection : avant/arrière + poing fort, au contact
    if (btn === 'hp' && (this.dirN === 6 || this.dirN === 4) && this.canThrow(o)) { this.startThrow(o, F); return true; }
    if (!crouch && this.dirN === 6 && NORMALS['f' + btn]) { this.startNormal('f' + btn); return true; }
    this.startNormal((crouch ? 'c' : '') + btn);
    return true;
  }
  canThrow(o) {
    return Math.abs(o.x - this.x) < 78 && !o.air && !this.air && o.inv <= 0 && ['idle', 'walk', 'crouch', 'guard', 'attack', 'land'].includes(o.st);
  }
  startThrow(o, F) {
    this.setSt('throw'); this.thr = { type: this.ch.throwType || 'suplex', o }; this.vx = 0; this.inv = 999; this.mv = null;
    o.setSt('held'); o.inv = 999; o.vx = 0; o.vy = 0; o.push = 0; o.mv = null; o.amv = null; o.beam = null; o.hover = false; o.ghostOn = false;
    o.heldHipY = null; o.heldPose = POSES.hit; o.z3 = 0; o.face = -this.face;
    AU.sfx('block'); F.announceMove && F.announceMove(this, this.ch.throwName || 'PROJECTION');
  }
  startNormal(key) {
    this.mv = NORMALS[key]; this.setSt('attack'); this.vx = 0; this.hitN = 0; this.hitCD = 0; this.connected = false; this.basePose = this.mv.base || 'idle';
  }
  startSpecial(type, str, F) {
    this.setSt('special'); this.sp = type; this.str = str; this.hitN = 0; this.hitCD = 0; this.connected = false;
    this.mv = SPECIAL_MV[type]; this.vx = 0; this.hover = false;
    if (type === 'uppercut' || type === 'flip') this.inv = 10;
  }
  // ----- mise à jour par frame -----
  update(pad, o, F, controllable) {
    this.pad = pad; this.t++;
    if (this.inv > 0 && this.inv < 900) this.inv--;
    if (this.flash > 0) this.flash--;
    if (this.hitCD > 0) this.hitCD--;
    const dir = controllable ? this.readDir(pad) : 5;
    if (dir !== this.dirN) { this.hist.push({ d: dir, t: F.frame }); if (this.hist.length > 30) this.hist.shift(); }
    this.dirN = dir;
    if (controllable && pad) for (const b of ['lp', 'hp', 'lk', 'hk', 'sp1', 'sp2', 'su']) if (pad.pressed[b]) this.buf.push({ b, t: F.frame });
    this.dispHp += (this.hp - this.dispHp) * (this.dispHp > this.hp ? 0.04 : 1);
    if (Math.abs(this.dispHp - this.hp) < 1) this.dispHp = this.hp;

    const sp = this.ch.speed;
    switch (this.st) {
      case 'idle': case 'walk': case 'crouch': case 'guard': {
        this.faceOpp(o);
        if (controllable && this.tryAttack(F, o)) break;
        if (dir >= 7) { this.setSt('prejump'); this.jdir = dir === 9 ? 1 : dir === 7 ? -1 : 0; this.vx = 0; break; }
        if (dir <= 3) { if (this.st !== 'crouch') this.setSt('crouch'); this.vx = 0; break; }
        if (dir === 6) { if (this.st !== 'walk') this.setSt('walk'); this.vx = 3.4 * sp * this.face; break; }
        if (dir === 4) {
          const threat = (o.st === 'attack' || o.st === 'special' || o.st === 'super' || (o.proj && Math.abs(o.proj.x - this.x) < 320)) && Math.abs(o.x - this.x) < 330;
          if (threat) { if (this.st !== 'guard') this.setSt('guard'); this.vx = 0; }
          else { if (this.st !== 'walk') this.setSt('walk'); this.vx = -2.7 * sp * this.face; }
          break;
        }
        if (this.st !== 'idle') this.setSt('idle'); this.vx = 0;
        break;
      }
      case 'prejump':
        if (this.t >= 3) { this.setSt('jump'); this.vy = -15.5; this.vx = this.jdir * 3.9 * sp * this.face; this.amv = null; AU.sfx('jump'); }
        break;
      case 'jump':
        if (this.amv) { this.at++; }
        else if (controllable) {
          const b = this.takeBuf(F.frame);
          if (b && ['lp', 'hp', 'lk', 'hk'].includes(b.b)) { this.amv = NORMALS['j' + b.b]; this.at = 0; this.hitN = 0; this.hitCD = 0; this.mv = this.amv; this.connected = false; }
          else if (b && b.b === 'su' && this.meter >= 100 && this.ch.sup === 'beam') { /* pas de super aérien */ }
        }
        break;
      case 'throw': if (this.updThrow(F, this.thr.o)) { this.inv = 0; this.thr = null; this.setSt('idle'); } break;
      case 'held': break;
      case 'attack': {
        const m = this.mv, tot = m.st + m.ac + m.rc;
        if (m.hop && this.t === m.hop.at) { this.vx = m.hop.vx * this.face; this.vy = m.hop.vy; AU.sfx('jump'); }
        if (m.hop && !this.air && this.t > m.hop.at + 3) this.vx *= 0.6;
        if (this.t === m.st) AU.sfx(m.lvl > 1 ? 'whiffH' : 'whiff');
        if (m.cancel && this.connected && controllable && this.t < tot - 1) { if (this.tryAttack(F, o, true)) break; }
        if (this.t >= tot) { this.setSt(m.base === 'crouch' && dir <= 3 ? 'crouch' : 'idle'); this.mv = null; }
        break;
      }
      case 'special': this.updSpecial(F, o); break;
      case 'super': this.updSuper(F, o); break;
      case 'hit':
        if (this.t >= this.stun) { this.setSt(this.crouching ? 'crouch' : 'idle'); }
        break;
      case 'block':
        if (this.t >= this.stun) { this.setSt(this.crouching ? 'crouch' : 'idle'); }
        break;
      case 'fall':
        if (!this.air && this.t > 2) {
          this.setSt('down'); this.vx = 0; this.vy = 0; this.y = GROUND; this.inv = 999;
          dust(this.x, GROUND, 12); AU.sfx('land'); F.shake = Math.max(F.shake, 6);
        }
        break;
      case 'down':
        if (!this.ko && this.t >= 38) { this.setSt('getup'); }
        break;
      case 'getup':
        if (this.t >= 20) { this.inv = 6; this.setSt('idle'); }
        break;
      case 'land':
        if (this.t >= this.landRec) { this.setSt('idle'); this.amv = null; }
        break;
      case 'win': case 'lose': break;
    }
    // ---- physique
    if (this.st === 'held') { this.computeSkel(); return; }
    if (this.z3) { this.z3 *= 0.86; if (Math.abs(this.z3) < 0.5) this.z3 = 0; }
    if (this.push) {
      const nx = this.x + this.push;
      const cl = F.clampX(nx, this);
      if (cl !== nx && this.pushSrc) this.pushSrc.x -= (nx - cl) * 0.8;
      this.x = cl; this.push *= 0.8; if (Math.abs(this.push) < 0.2) this.push = 0;
    }
    this.x += this.vx;
    if (this.air || this.hover) {
      if (!this.hover) this.vy += this.grav;
      this.y += this.vy;
      if (this.y >= GROUND && this.vy >= 0) {
        this.y = GROUND; this.vy = 0;
        if (this.st === 'jump') { this.vx = 0; this.amv = null; this.landRec = 4; this.setSt('land'); AU.sfx('land'); dust(this.x, GROUND, 4); }
        else if (this.st === 'hit') { this.setSt('idle'); }
      }
    }
    if (!this.air && (this.st === 'walk' || this.st === 'guard' || this.st === 'idle' || this.st === 'crouch' || this.st === 'land')) { /* au sol */ }
    this.x = F.clampX(this.x, this);
    // ---- images rémanentes
    if (this.ghostOn) {
      if (F.frame % 2 === 0) { this.ghosts.push({ x: this.x, hy: this.hipY, skel: this.skel, pose: this.pose, face: this.face, a: 0.55 }); if (this.ghosts.length > 7) this.ghosts.shift(); }
    }
    this.ghosts.forEach(g => g.a -= 0.05); this.ghosts = this.ghosts.filter(g => g.a > 0);
    this.computeSkel();
  }
  updSpecial(F, o) {
    const t = this.t, ch = this.ch, f = this.face, h = this.str === 'h';
    switch (this.sp) {
      case 'proj':
        this.ghostOn = false;
        if (t < 14) {
          const hp = this.wp('fha');
          if (t % 2 === 0) FX.add({ type: 'glow', x: hp.x + rand(-50, 50), y: hp.y + rand(-50, 50), size: 8, life: 12, max: 12, col: ch.proj.color, target: hp });
        }
        if (t === 14) {
          const a = this.wp('fha'), b = this.wp('bha');
          this.proj = new Projectile(this, (a.x + b.x) / 2 + f * 20, (a.y + b.y) / 2, f * (h ? 9.5 : 6.5));
          F.projs.push(this.proj); AU.sfx('proj');
          FX.add({ type: 'glow', x: this.proj.x, y: this.proj.y, size: 70, life: 12, max: 12, col: ch.proj.color, core: '#fff' });
          FX.add({ type: 'ring', x: this.proj.x, y: this.proj.y, size: 70, life: 12, max: 12, col: ch.proj.color, flat: 1.4 });
        }
        if (t >= 46) this.setSt('idle');
        break;
      case 'uppercut': case 'flip':
        if (t === 4) {
          this.vy = h ? -15 : -12.5; this.vx = f * (h ? 3.2 : 2.2); AU.sfx('upper');
          dust(this.x, GROUND, 6);
        }
        if (t >= 4) {
          this.ghostOn = true;
          const p = this.wp(this.sp === 'uppercut' ? 'fha' : 'ffo');
          FX.add({ type: 'glow', x: p.x + rand(-8, 8), y: p.y + rand(-8, 8), vy: rand(0.5, 2), size: rand(18, 30), life: 18, max: 18, col: ch.accent, core: '#fff' });
          if (t % 2) FX.add({ type: 'spark', x: p.x, y: p.y, vx: rand(-3, 3), vy: rand(2, 6), size: 2.5, life: 12, max: 12, col: '#fff' });
          if (t > 8 && !this.air) { this.ghostOn = false; this.landRec = 18; this.setSt('land'); this.vx = 0; }
        }
        break;
      case 'spin':
        if (t === 5) { this.vy = -7; }
        if (t > 5 && t < 44) {
          this.ghostOn = true;
          if (this.y <= GROUND - 60 && !this.hover) { this.hover = true; this.vy = 0; }
          this.vx = f * (h ? 5.2 : 4.2);
          if (t % 10 === 6) AU.sfx('spin');
          const p = this.wp('ffo');
          FX.add({ type: 'ring', x: this.x, y: this.hipY - 10, size: 80, life: 10, max: 10, col: ch.accent, flat: 0.25, lw: 4 });
          FX.add({ type: 'glow', x: p.x, y: p.y, size: 16, life: 12, max: 12, col: ch.accent });
        }
        if (t === 44) { this.hover = false; this.vx = f * 1.5; }
        if (t > 46 && !this.air) { this.ghostOn = false; this.vx = 0; this.landRec = 12; this.setSt('land'); }
        break;
      case 'rush':
        if (t === 9) { this.vx = f * (h ? 15 : 12.5); AU.sfx('rush'); dust(this.x, GROUND, 6); }
        if (t >= 9 && t < 27) {
          this.ghostOn = true;
          if (this.connected) this.vx *= 0.6;
          const p = this.wp('fha');
          FX.add({ type: 'glow', x: p.x, y: p.y, size: 26, life: 10, max: 10, col: ch.accent, core: '#fff' });
          FX.add({ type: 'spark', x: this.x - f * 30, y: this.hipY + rand(-60, 20), vx: -f * rand(8, 14), size: 2, life: 10, max: 10, col: ch.accent, len: 3 });
        }
        if (t >= 27) { this.ghostOn = false; this.vx *= 0.75; }
        if (t >= 44) { this.vx = 0; this.setSt('idle'); }
        break;
    }
  }
  updSuper(F, o) {
    const t = this.t, ch = this.ch, f = this.face, type = this.sp;
    if (type === 'beam') {
      if (t < 14) { const hp = this.wp('fha'); for (let i = 0; i < 3; i++) FX.add({ type: 'glow', x: hp.x + rand(-90, 90), y: hp.y + rand(-90, 90), size: 10, life: 14, max: 14, col: ch.accent, target: hp }); }
      if (t === 14) { AU.sfx('beam'); F.shake = 10; }
      if (t >= 14 && t < 84) {
        const a = this.wp('fha'), b = this.wp('bha');
        this.beam = { x: (a.x + b.x) / 2 + f * 10, y: (a.y + b.y) / 2, t: t - 14 };
        F.shake = Math.max(F.shake, 4);
        if (t % 2 === 0) FX.add({ type: 'spark', x: this.beam.x + f * rand(0, 600), y: this.beam.y + rand(-40, 40), vx: f * rand(10, 20), vy: rand(-2, 2), size: 3, life: 12, max: 12, col: '#fff', len: 3 });
      } else this.beam = null;
      if (t >= 104) { this.inv = 0; this.setSt('idle'); }
    } else if (type === 'storm') {
      if (t === 6) { this.vy = -17; this.vx = f * 2.6; this.grav = 0.55; AU.sfx('upper'); dust(this.x, GROUND, 12); }
      if (t >= 6) {
        this.ghostOn = true;
        const p = this.wp(ch.move === 'flip' ? 'ffo' : 'fha');
        FX.add({ type: 'glow', x: p.x, y: p.y, size: rand(26, 44), life: 18, max: 18, col: ch.accent, core: '#fff' });
        if (t % 3 === 0) FX.add({ type: 'bolt', x: this.x + rand(-80, 80), y: this.hipY - 140, x2: this.x + rand(-40, 40), y2: this.hipY + 20, life: 6, max: 6, col: '#cfe8ff' });
        if (t > 10 && !this.air) { this.ghostOn = false; this.grav = 0.75; this.vx = 0; this.inv = 0; this.landRec = 22; this.setSt('land'); }
      }
    } else if (type === 'rush') {
      if (t === 10) { this.vx = f * 16; AU.sfx('rush'); dust(this.x, GROUND, 10); }
      if (t >= 10 && t < 36) {
        this.ghostOn = true;
        FX.add({ type: 'spark', x: this.x - f * 20, y: this.hipY + rand(-80, 30), vx: -f * rand(10, 18), size: 3, life: 10, max: 10, col: ch.accent, len: 3 });
      }
      if (t === 36) { this.ghostOn = false; this.vx = 0; }
      if (t >= 56) { this.inv = 0; this.setSt('idle'); }
    } else if (type === 'moulinet') { // Atlas : bond vrillé vers une prise en ciseaux inversée
      if (t < 8) { this.tpose = lerpPose(POSES.idle, POSES.crouch, easeOut(t / 8)); const c = this.wp('hip'); FX.add({ type: 'glow', x: c.x + rand(-90, 90), y: c.y + rand(-90, 60), size: 9, life: 14, max: 14, col: ch.accent, target: c }); }
      if (t === 8) { this.vy = -9; this.vx = f * 12; AU.sfx('rush'); dust(this.x, GROUND, 10); this.ghostOn = true; }
      if (t >= 8) {
        const k = clamp((t - 8) / 16, 0, 1);
        this.tpose = { ...lerpPose(POSES.crouch, POSES.scissor, easeOut(k)), rot: -180 * easeOut(k) };
        if (t > 14 && !this.air) { this.ghostOn = false; this.vx = 0; this.inv = 0; this.landRec = 24; this.setSt('land'); }
      }
    } else if (type === 'moulinetLock') { // moulinet 720 : appui renversé sur les mains, rotation continue des hanches
      const v = o, u = t, X = this.lockX;
      this.vx = 0; this.vy = 0; this.y = GROUND;
      if (u < 72) { this.hover = true; this.ghostOn = false; this.x = F.clampX(X - f * 14, this); }
      if (u < 12) {
        this.tpose = lerpPose(this.tpose || POSES.scissor, POSES.scissor, 0.4);
        v.x = clamp(X, 40, STAGE_W - 40); v.heldHipY = null; v.heldPose = POSES.hit; v.z3 = 0;
      } else if (u < 72) {
        const k = (u - 12) / 60, a = (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2) * Math.PI * 6;
        this.tpose = { ...lerpPose(POSES.scissor, POSES.handstand, Math.min(1, k * 4)), spin: a, sx: Math.cos(a), headSpin: -a * 0.5 };
        const R = 46, lift = Math.min(1, (u - 12) / 14);
        v.x = clamp(this.x + f * Math.cos(a) * R, 40, STAGE_W - 40); v.z3 = Math.sin(a) * R;
        v.heldHipY = GROUND - lerp(90, 168, easeOut(lift));
        v.heldPose = { ...lerpPose(POSES.hit, POSES.fall, lift), rot: -90 * lift, spin: a + Math.PI / 2, sx: Math.cos(a + Math.PI / 2) };
        if (u % 6 === 0) this.chipHit(F, v, 16);
        if (u % 3 === 0) FX.add({ type: 'ring', x: this.x, y: GROUND - 6, size: 120, life: 12, max: 12, col: ch.accent, flat: 0.22, lw: 4 });
        if (u % 2 === 0) FX.add({ type: 'spark', x: this.x + rand(-30, 30), y: GROUND - rand(0, 10), vx: rand(-6, 6), vy: rand(-3, -1), size: 2, life: 12, max: 12, col: '#ffd27a' });
      } else if (u === 72) {
        this.hover = false; v.heldHipY = null;
        F.applyHit(this, v, { x: v.x, y: GROUND - 160 }, { dmg: 110, kd: true, launch: -11, kb: 16, lvl: 4, sup: true, hs: 30 }, false);
        explosion(v.x, GROUND - 150, ch.accent, 1.2); F.shake = 16; F.flash = 6; F.flashCol = '#fff'; AU.sfx('hitS');
      } else {
        const k = clamp((u - 72) / 20, 0, 1);
        this.tpose = { ...lerpPose(POSES.handstand, POSES.idle, easeOut(k)), rot: lerp(-180, -360, easeOut(k)) };
        if (u >= 94) { this.ghostOn = false; this.inv = 0; this.tpose = null; this.setSt('idle'); }
      }
    } else if (type === 'barrage') {
      const v = o;
      this.ghostOn = true;
      if (t % 5 === 0 && t < 60) {
        const side = (t / 5) % 2 ? 1 : -1;
        this.x = F.clampX(v.x + side * rand(55, 80), this); this.face = v.x > this.x ? 1 : -1;
        this.bpose = pick(['lp', 'hp', 'lk', 'hk', 'upper', 'rush']);
        const hp = { x: v.x + rand(-20, 20), y: v.hipY + rand(-70, 10) };
        F.applyHit(this, v, hp, { ...SPECIAL_MV.srush, dmg: 24 }, false);
        FX.add({ type: 'bolt', x: this.x, y: this.hipY - 40, x2: hp.x, y2: hp.y, life: 5, max: 5, col: ch.accent });
      }
      if (t === 66) {
        this.x = F.clampX(v.x - this.face * 70, this); this.bpose = 'upper';
        const hp = { x: v.x, y: v.hipY - 30 };
        F.applyHit(this, v, hp, { ...SPECIAL_MV.srush, dmg: 90, kd: true, launch: -13, kb: 10, lvl: 4 }, false);
        explosion(hp.x, hp.y, ch.accent, 1.5); F.shake = 16; F.flash = 6; F.flashCol = '#fff';
      }
      if (t >= 90) { this.ghostOn = false; this.inv = 0; this.bpose = null; this.setSt('idle'); }
    }
  }
  // coup intermédiaire pendant une prise (ne met jamais K.O.)
  chipHit(F, v, dmg) {
    v.hp = Math.max(1, v.hp - Math.round(dmg * this.ch.power)); v.flash = 3;
    this.combo = (this.combo || 0) + 1; F.combo[this.side] = { n: this.combo, t: 0 };
    hitSpark(v.x, v.hipY - 30, 2, this.ch.accent, this.face, false); AU.sfx('hitL'); F.shake = Math.max(F.shake, 4);
    this.meter = Math.min(100, this.meter);
  }
  // ---- projections (renvoie true quand c'est fini) ----
  updThrow(F, o) {
    const t = this.t, f = this.face, ax = this.x, type = this.thr.type, ch = this.ch;
    const V = (x, hipY, pose, rot = 0, spin = 0, z = 0) => {
      o.x = clamp(x, 40, STAGE_W - 40); o.heldHipY = hipY; o.z3 = z;
      o.heldPose = { ...pose, rot, spin, sx: Math.cos(spin) };
    };
    const slam = (dmg, x) => {
      o.heldHipY = null; o.x = clamp(x, 40, STAGE_W - 40); o.y = GROUND - 1;
      this.combo = 0;
      F.applyHit(this, o, { x: o.x, y: GROUND - 25 }, { dmg, kd: true, launch: -3, kb: 3, lvl: 3, hs: 20 }, false);
      dust(o.x, GROUND, 18); F.shake = Math.max(F.shake, 14); AU.sfx('land'); AU.sfx('hitS');
    };
    const E = x => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    if (t <= 8) { // saisie
      this.tpose = lerpPose(POSES.idle, POSES.grab, easeOut(t / 8));
      V(ax + f * 58, null, POSES.hit);
      if (t === 8) AU.sfx('whiffH');
      return false;
    }
    if (type === 'suplex') { // suplex allemand : soulevé par-dessus la tête, pont, écrasé derrière
      if (t <= 22) { const k = E((t - 8) / 14); this.tpose = lerpPose(POSES.grab, POSES.liftOver, k); V(ax + f * lerp(58, 4, k), GROUND - lerp(90, 210, k), POSES.fall, -180 * k); }
      else if (t <= 32) { const k = (t - 22) / 10; this.tpose = lerpPose(POSES.liftOver, POSES.bridge, E(k)); V(ax - f * lerp(4, 72, k), GROUND - lerp(210, 28, easeIn(k)), POSES.fall, lerp(-180, -270, k)); if (t === 32) slam(140, ax - f * 72); }
      else { this.tpose = lerpPose(POSES.bridge, POSES.idle, easeOut((t - 32) / 16)); if (t >= 48) return true; }
    } else if (type === 'judo') { // o-goshi : chargé sur la hanche, rotation, projeté devant
      if (t <= 20) { const k = E((t - 8) / 12); this.tpose = { ...lerpPose(POSES.grab, POSES.hipLoad, k), spin: 2.6 * k }; V(ax + f * lerp(58, 14, k), GROUND - lerp(90, 152, k), POSES.fall, -110 * k); }
      else if (t <= 30) { const k = (t - 20) / 10; this.tpose = { ...lerpPose(POSES.hipLoad, POSES.hipThrow, E(k)), spin: lerp(2.6, 2.95, k) }; V(ax + f * lerp(14, 76, k), GROUND - lerp(152, 28, easeIn(k)), POSES.fall, lerp(-110, -270, k)); if (t === 30) slam(130, ax + f * 76); }
      else { const k = easeOut((t - 30) / 16); this.tpose = { ...lerpPose(POSES.hipThrow, POSES.idle, k), spin: lerp(2.95, 6.28, k) }; if (t >= 46) return true; }
    } else if (type === 'takedown') { // double-leg : plongée basse, sur l'épaule, écrasé devant
      if (t <= 18) { const k = E((t - 8) / 10); this.tpose = lerpPose(POSES.grab, POSES.shoot, k); this.x = F.clampX(ax + f * 1.5, this); V(this.x + f * 44, null, POSES.hit); }
      else if (t <= 30) { const k = E((t - 18) / 12); this.tpose = lerpPose(POSES.shoot, POSES.carry, k); V(ax + f * lerp(44, 8, k), GROUND - lerp(90, 172, k), POSES.fall, -90 * k); }
      else if (t <= 38) { const k = (t - 30) / 8; this.tpose = lerpPose(POSES.carry, POSES.slamFwd, E(k)); V(ax + f * lerp(8, 70, k), GROUND - lerp(172, 26, easeIn(k)), POSES.fall, lerp(-90, -100, k)); if (t === 38) slam(135, ax + f * 70); }
      else { this.tpose = lerpPose(POSES.slamFwd, POSES.idle, easeOut((t - 38) / 16)); if (t >= 54) return true; }
    } else if (type === 'helix') { // ATLAS — TORSION 360 : buste à rotation continue, puis pont contorsionniste impossible
      if (t <= 20) { const k = E((t - 8) / 12); this.tpose = lerpPose(POSES.grab, POSES.liftOver, k); V(ax + f * lerp(58, 0, k), GROUND - lerp(90, 205, k), POSES.fall, -90 * k); }
      else if (t <= 58) {
        const k = (t - 20) / 38, tw = E(k) * Math.PI * 4;
        this.tpose = { ...POSES.liftOver, twist: tw, headSpin: -tw * 1.5 };
        V(ax + f * Math.cos(tw) * 10, GROUND - 205, POSES.fall, -90, tw, Math.sin(tw) * 10);
        if (t % 8 === 4) this.chipHit(F, o, 12);
        if (t % 2 === 0) FX.add({ type: 'ring', x: ax, y: GROUND - 195, size: 150, life: 10, max: 10, col: ch.accent, flat: 0.25, lw: 3 });
        if (t % 4 === 0) FX.add({ type: 'spark', x: ax + rand(-60, 60), y: GROUND - rand(150, 240), vx: rand(-8, 8), vy: rand(-3, 3), size: 2, life: 12, max: 12, col: '#fff3c0' });
        if (t === 21) AU.sfx('spin');
      }
      else if (t <= 72) { const k = (t - 58) / 14; this.tpose = lerpPose(POSES.liftOver, POSES.contort, E(k)); V(ax - f * lerp(0, 76, k), GROUND - lerp(205, 24, easeIn(k)), POSES.fall, lerp(-90, -180, k)); if (t === 72) { slam(170, ax - f * 76); explosion(ax - f * 76, GROUND - 30, ch.accent, 1.3); F.flash = 5; F.flashCol = '#fff'; } }
      else { const k = easeOut((t - 72) / 24); this.tpose = { ...lerpPose(POSES.contort, POSES.idle, k), twist: Math.PI * (1 - k), headSpin: Math.PI * 2 * (1 - k) }; if (t >= 96) return true; }
    }
    return false;
  }
  // point mondial d'une articulation
  wp(k) { return { x: this.x + this.skel[k].x, y: this.hipY + this.skel[k].y }; }
  computePose() {
    const t = this.t, st = this.st, ch = this.ch;
    const bob = Math.sin((performance.now() / 1000) * 5 + this.side) * 2.5;
    let p;
    switch (st) {
      case 'idle': case 'prejump': {
        p = { ...POSES.idle }; p.fe += bob; p.be -= bob; p.fk += bob; p.bk += bob * 0.6; p.lean += bob * 0.3;
        if (st === 'prejump') p = lerpPose(p, POSES.crouch, 0.4);
        else if (ch.id === 'atlas') { // moteurs 360° : la tête fait un tour complet, le buste regarde derrière
          const ph = (performance.now() / 1000 + this.side * 2.3) % 7;
          if (ph < 1.3) p.headSpin = easeOut(ph / 1.3) * Math.PI * 2;
          else if (ph > 3.6 && ph < 5.2) p.twist = Math.sin((ph - 3.6) / 1.6 * Math.PI) * Math.PI * 0.85;
        }
        break;
      }
      case 'guard': p = POSES.block; break;
      case 'walk': {
        const ph = this.t * 0.22 * (this.vx * this.face > 0 ? 1 : -1);
        p = { ...POSES.idle, fh: 22 + Math.sin(ph) * 22, bh: -12 - Math.sin(ph) * 22, fk: 30 + Math.max(0, Math.cos(ph)) * 30, bk: 22 + Math.max(0, -Math.cos(ph)) * 30 };
        p.lean += 4; break;
      }
      case 'crouch': p = this.t < 4 ? lerpPose(POSES.idle, POSES.crouch, this.t / 4) : POSES.crouch; break;
      case 'jump': {
        const base = this.jdir === 0 ? POSES.jump : { ...POSES.jump, rot: this.jdir > 0 ? clamp((t - 3) * 13, 0, 360) % 360 : -clamp((t - 3) * 13, 0, 360) % 360 };
        if (t < 4) p = lerpPose(POSES.idle, POSES.jump, t / 4); else p = base;
        if (this.amv) {
          const m = this.amv, a = this.at;
          if (m.keys) p = keyPose(m.keys, a);
          else { const k = a < m.st ? easeOut(a / m.st) : 1; p = lerpPose({ ...p, rot: 0 }, POSES[m.pose], k); }
        }
        break;
      }
      case 'land': p = lerpPose(POSES.crouch, POSES.idle, clamp(t / Math.max(1, this.landRec), 0, 1) * 0.8); break;
      case 'throw': p = this.tpose || POSES.grab; break;
      case 'held': p = this.heldPose || POSES.hit; break;
      case 'attack': {
        const m = this.mv, base = POSES[m.base || 'idle'], strike = POSES[m.pose];
        if (m.keys) p = keyPose(m.keys, t);
        else if (t < m.st) p = lerpPose(base, strike, easeOut(t / m.st) * 0.85);
        else if (t < m.st + m.ac) p = strike;
        else p = lerpPose(strike, base, easeIn((t - m.st - m.ac) / m.rc));
        break;
      }
      case 'hit': p = lerpPose(this.crouching ? POSES.chit : POSES.hit, this.crouching ? POSES.crouch : POSES.idle, clamp((t - this.stun * 0.5) / (this.stun * 0.5), 0, 1)); break;
      case 'block': p = this.crouching ? POSES.cblock : POSES.block; break;
      case 'fall': p = { ...POSES.fall, rot: -clamp(t * 7, 0, 100) }; break;
      case 'down': p = { ...POSES.down, rot: -90 }; break;
      case 'getup': {
        const k = easeOut(t / 20);
        p = lerpPose({ ...POSES.down, rot: -90 }, POSES.crouch, k);
        if (ch.id === 'atlas') { p.rot = lerp(-90, -360, k); p.twist = (1 - k) * Math.PI; p.headSpin = (1 - k) * Math.PI * 2; } // roulade arrière contorsionniste
        break;
      }
      case 'win': {
        p = lerpPose(POSES.idle, (this.side + ((t / 60) | 0)) % 2 ? POSES.win : POSES.win2, clamp(t / 12, 0, 1));
        if (ch.id === 'atlas') { p.twist = Math.sin(t * 0.045) * Math.PI; p.headSpin = -t * 0.09; }
        break;
      }
      case 'lose': p = lerpPose(POSES.idle, POSES.hit, 0.7); break;
      case 'special': p = this.specialPose(); break;
      case 'super': p = this.superPose(); break;
      default: p = POSES.idle;
    }
    this.pose = p;
  }
  specialPose() {
    const t = this.t;
    switch (this.sp) {
      case 'proj':
        if (t < 8) return lerpPose(POSES.idle, POSES.projWind, easeOut(t / 8));
        if (t < 14) return lerpPose(POSES.projWind, POSES.proj, easeOut((t - 8) / 6));
        if (t < 34) return POSES.proj;
        return lerpPose(POSES.proj, POSES.idle, (t - 34) / 12);
      case 'uppercut':
        if (t < 4) return lerpPose(POSES.idle, POSES.crouch, t / 4);
        return lerpPose(POSES.crouch, POSES.upper, clamp((t - 4) / 4, 0, 1));
      case 'flip': {
        if (t < 4) return lerpPose(POSES.idle, POSES.crouch, t / 4);
        const r = -clamp((t - 4) * 16, 0, 360);
        return { ...POSES.flip, rot: r };
      }
      case 'spin': {
        if (t < 6) return lerpPose(POSES.idle, POSES.jump, t / 6);
        if (t < 44) return { ...POSES.spin, sx: Math.cos((t - 6) * 0.55), spin: (t - 6) * 0.55 };
        return POSES.jump;
      }
      case 'rush':
        if (t < 9) return lerpPose(POSES.idle, POSES.rushWind, easeOut(t / 9));
        if (t < 27) return POSES.rush;
        return lerpPose(POSES.rush, POSES.idle, (t - 27) / 17);
    }
    return POSES.idle;
  }
  superPose() {
    const t = this.t, ch = this.ch;
    switch (this.sp) {
      case 'beam':
        if (t < 14) return lerpPose(POSES.idle, POSES.projWind, easeOut(t / 12));
        if (t < 84) { const p = { ...POSES.proj }; p.lean += Math.sin(t) * 2; return p; }
        return lerpPose(POSES.proj, POSES.idle, (t - 84) / 20);
      case 'storm':
        if (t < 6) return lerpPose(POSES.idle, POSES.crouch, t / 6);
        if (ch.move === 'flip') return { ...POSES.flip, rot: -((t - 6) * 22) % 360 };
        return { ...POSES.upper, sx: Math.cos((t - 6) * 0.5), spin: (t - 6) * 0.5 };
      case 'rush':
        if (t < 10) return lerpPose(POSES.idle, POSES.rushWind, easeOut(t / 10));
        if (t < 36) return POSES.rush;
        return lerpPose(POSES.rush, POSES.idle, (t - 36) / 20);
      case 'barrage': return POSES[this.bpose || 'rush'];
      case 'moulinet': case 'moulinetLock': return this.tpose || POSES.crouch;
    }
    return POSES.idle;
  }
  computeSkel() {
    this.computePose();
    this.skel = skeleton(this.ch, this.pose, this.face);
    const s = this.ch.scale * this.ch.leg;
    if (this.st === 'held' && this.heldHipY != null) this.hipY = this.heldHipY;
    else if (this.st === 'fall') this.hipY = this.y - 34;
    else if (this.y < GROUND - 0.5 || this.st === 'jump' || this.hover) this.hipY = Math.min(this.y - HIP_H * s, GROUND - this.skel._low);
    else this.hipY = GROUND - this.skel._low;
  }
  hurtbox(any = false) {
    if (this.st === 'down' || this.st === 'getup') return null;
    if (!any && (this.inv > 0 || this.st === 'fall')) return null;
    const S = this.skel; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const k of ['hip', 'neck', 'head', 'fkn', 'bkn', 'ffo', 'bfo', 'fsh', 'fel', 'bel']) {
      const p = S[k]; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const pad = 14 * S._s;
    return { x0: this.x + x0 - pad, x1: this.x + x1 + pad, y0: this.hipY + y0 - pad * 1.6, y1: this.hipY + y1 + pad * 0.5 };
  }
  // hitbox active (cercle) ou null
  activeHit() {
    let m = null, active = false;
    if (this.st === 'attack') { m = this.mv; active = this.t >= m.st && this.t < m.st + m.ac; }
    else if (this.st === 'jump' && this.amv) { m = this.amv; active = this.at >= m.st && this.at < m.st + m.ac; }
    else if (this.st === 'special') {
      m = this.mv; const t = this.t;
      if (this.sp === 'uppercut' || this.sp === 'flip') active = t >= 4 && t < 22;
      else if (this.sp === 'spin') active = t > 6 && t < 44;
      else if (this.sp === 'rush') active = t >= 9 && t < 27;
    } else if (this.st === 'super') {
      const t = this.t;
      if (this.sp === 'storm') { m = SPECIAL_MV.storm; active = t >= 6 && t < 44; }
      else if (this.sp === 'rush') { m = SPECIAL_MV.srush; active = t >= 10 && t < 36; }
      else if (this.sp === 'moulinet') { m = SPECIAL_MV.moulinet; active = t >= 10 && t < 32; }
    }
    if (!m || !active || !m.limb) return null;
    const maxHits = m.hits || 1;
    if (this.hitN >= maxHits || this.hitCD > 0) return null;
    const limbK = this.st === 'super' && this.sp === 'storm' && this.ch.move === 'flip' ? 'ffo' : m.limb;
    const p = this.wp(limbK);
    return { x: p.x, y: p.y, r: m.r * this.ch.scale, mv: m };
  }
  draw(c, F) {
    const ch = this.ch;
    // images rémanentes
    for (const g of this.ghosts) drawRobot(c, ch, g.pose, g.x, g.hy, g.face, 1, { skel: g.skel, pal: { body: ch.accent, trim: hexA(ch.accent, 0.5), joint: ch.accent, accent: ch.accent, visor: ch.accent }, alpha: g.a * 0.6, noExtras: true });
    // aura (super prêt / super en cours)
    if (this.st === 'super' || (F.superFreeze > 0 && F.superBy === this)) {
      c.save(); c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(this.x, this.hipY - 30, 10, this.x, this.hipY - 30, 140);
      g.addColorStop(0, hexA(ch.accent, 0.5)); g.addColorStop(1, hexA(ch.accent, 0));
      c.fillStyle = g; c.beginPath(); c.arc(this.x, this.hipY - 30, 140, 0, 7); c.fill(); c.restore();
    }
    const pal = this.flash > 0 ? { body: '#ffffff', trim: '#ffe9a0', joint: '#ffffff', accent: '#fff', visor: '#fff' } : null;
    drawRobot(c, ch, this.pose, this.x, this.hipY, this.face, 1, { skel: this.skel, pal });
    if (this.meter >= 100 && F.frame % 20 < 10 && this.st !== 'super') {
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.25;
      drawRobot(c, ch, this.pose, this.x, this.hipY, this.face, 1, { skel: this.skel, pal: { body: ch.accent, trim: ch.accent, joint: ch.accent, accent: ch.accent, visor: ch.accent }, noExtras: true });
      c.restore();
    }
  }
}

/* ---------------- IA ---------------- */
class AI {
  constructor(level) { this.lvl = level; this.cool = 0; this.hold = {}; this.pad = makePad(); }
  think(me, op, F) {
    const pad = this.pad;
    BTNS.forEach(b => { pad.pressed[b] = false; pad.held[b] = false; });
    const toward = op.x > me.x ? 'r' : 'l', away = toward === 'r' ? 'l' : 'r';
    const dist = Math.abs(op.x - me.x), L = this.lvl, R = Math.random();
    const press = b => { pad.pressed[b] = true; pad.held[b] = true; };
    // garder les directions en cours
    for (const k in this.hold) pad.held[k] = true;
    if (this.cool > 0) {
      this.cool--;
      if (me.st === 'attack' && me.connected && this.comboNext && me.t > me.mv.st + 1) { press(this.comboNext); this.comboNext = null; }
      return pad;
    }
    this.hold = {};
    const opAtk = (op.st === 'attack' || op.st === 'special' || op.st === 'super' || (op.st === 'jump' && op.amv));
    const projIn = F.projs.find(p => p.f === op && Math.sign(me.x - p.x) === Math.sign(p.vx) && Math.abs(me.x - p.x) < 280);
    if (!me.neutral && me.st !== 'jump') { this.cool = 2; return pad; }
    // super
    if (me.meter >= 100 && R < 0.04 + L * 0.01 && (me.ch.sup === 'beam' || dist < 220)) { press('su'); this.cool = 10; return pad; }
    // anti-aérien
    if (op.st === 'jump' && dist < 190 && Math.random() < 0.15 + L * 0.07) {
      if (me.ch.move === 'uppercut' || me.ch.move === 'flip') press('sp2'); else { pad.held.d = true; press('hp'); }
      this.cool = 18; return pad;
    }
    // projectile entrant
    if (projIn) {
      const r = Math.random();
      if (r < 0.25 + L * 0.04 && !me.proj) press('sp1');
      else if (r < 0.55) { this.hold = { [away]: true }; }
      else { this.hold = { u: true, [toward]: true }; }
      this.cool = 16; for (const k in this.hold) pad.held[k] = true; return pad;
    }
    // garde
    if (opAtk && dist < 230 && Math.random() < 0.25 + L * 0.08) {
      this.hold = { [away]: true }; if (op.mv && op.mv.h === 'low' || Math.random() < 0.3) this.hold.d = true;
      this.cool = 10 + ((Math.random() * 10) | 0); for (const k in this.hold) pad.held[k] = true; return pad;
    }
    if (dist > 320) {
      if (R < 0.05 + L * 0.015 && !me.proj) { press('sp1'); this.cool = 20; }
      else if (R < 0.08) { this.hold = { u: true, [toward]: true }; this.cool = 6; }
      else { this.hold = { [toward]: true }; this.cool = 10 + ((Math.random() * 20) | 0); }
    } else if (dist > 130) {
      if (R < 0.05 && (me.ch.move === 'rush' || me.ch.move === 'spin')) { press('sp2'); this.cool = 25; }
      else if (R < 0.065 && dist < 190) { this.hold = { [toward]: true }; pad.held[toward] = true; press('hp'); this.cool = 22; } // genou sauté
      else if (R < 0.08 && !me.proj) { press('sp1'); this.cool = 18; }
      else if (R < 0.12) { this.hold = { u: true, [toward]: true }; this.cool = 8; }
      else if (R < 0.16) { this.hold = { [away]: true }; this.cool = 12; }
      else { this.hold = { [toward]: true }; this.cool = 6 + ((Math.random() * 12) | 0); }
    } else {
      const r = Math.random();
      if (dist < 76 && r < 0.05 + L * 0.025) { this.hold = { [toward]: true }; pad.held[toward] = true; press('hp'); this.cool = 20; return pad; } // projection
      if (r < 0.1) { this.hold = { [toward]: true }; pad.held[toward] = true; press(Math.random() < 0.5 ? 'lk' : 'hk'); this.cool = 14; return pad; } // chassé frontal / retourné
      if (r < 0.15) { this.hold = { d: true }; press('lk'); this.comboNext = Math.random() < 0.1 * L ? 'sp2' : null; }
      else if (r < 0.3) { press('lp'); this.comboNext = Math.random() < 0.12 * L ? (Math.random() < 0.5 ? 'sp1' : 'sp2') : null; }
      else if (r < 0.45) { press('hp'); this.comboNext = Math.random() < 0.08 * L ? 'sp2' : null; }
      else if (r < 0.57) press('hk');
      else if (r < 0.67) { this.hold = { d: true }; press('hk'); }
      else if (r < 0.75 && (me.ch.move === 'uppercut' || me.ch.move === 'flip')) press('sp2');
      else if (r < 0.85) { this.hold = { [away]: true }; }
      else { this.hold = { u: true, [toward]: true }; }
      this.cool = 8 + ((Math.random() * (16 - L * 1.5)) | 0);
    }
    for (const k in this.hold) pad.held[k] = true;
    return pad;
  }
}
