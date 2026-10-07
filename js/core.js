'use strict';
/* =========================================================
   ROBOT FIGHTER II — core : canvas, utilitaires, entrées, audio
   ========================================================= */
const W = 960, H = 540, GROUND = 470, STAGE_W = 1300;
const D2R = Math.PI / 180;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (isTouch) document.body.classList.add('touch');

let VIEW_SCALE = 1;
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const s = Math.min(vw / W, vh / H);
  const cw = Math.floor(W * s), ch = Math.floor(H * s);
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  VIEW_SCALE = canvas.width / W;
}
window.addEventListener('resize', resize);
resize();

/* ---------- utilitaires ---------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const easeOut = t => 1 - (1 - t) * (1 - t);
const easeIn = t => t * t;
function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function shade(hex, f) { // f<0 assombrit, f>0 éclaircit
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/* ---------- texte arcade ---------- */
const FONT_PIX = "'Press Start 2P', monospace";
const FONT_BIG = "'Russo One', Impact, sans-serif";
function txt(s, x, y, size, opt = {}) {
  ctx.save();
  ctx.font = `${opt.italic ? 'italic ' : ''}${size}px ${opt.font || FONT_PIX}`;
  ctx.textAlign = opt.align || 'center';
  ctx.textBaseline = opt.base || 'middle';
  if (opt.alpha != null) ctx.globalAlpha = opt.alpha;
  if (opt.stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = opt.sw || Math.max(3, size / 6);
    ctx.strokeStyle = opt.stroke;
    ctx.strokeText(s, x, y);
  }
  if (opt.glow) { ctx.shadowColor = opt.glow; ctx.shadowBlur = opt.blur || 18; }
  if (opt.grad) {
    const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    opt.grad.forEach((c, i) => g.addColorStop(i / (opt.grad.length - 1), c));
    ctx.fillStyle = g;
  } else ctx.fillStyle = opt.color || '#fff';
  ctx.fillText(s, x, y);
  ctx.restore();
}
// gros titres façon Street Fighter (jaune/orange, contour épais)
function bigTxt(s, x, y, size, opt = {}) {
  txt(s, x + 4, y + 5, size, { font: FONT_BIG, italic: true, color: 'rgba(0,0,0,.55)', ...opt, grad: null, stroke: null, glow: null });
  txt(s, x, y, size, {
    font: FONT_BIG, italic: true, align: opt.align, stroke: opt.stroke || '#3a0d00', sw: size / 7,
    grad: opt.grad || ['#fff7b0', '#ffd23a', '#ff8a00', '#d63a00'], glow: opt.glow, blur: opt.blur, alpha: opt.alpha
  });
}

/* =========================================================
   ENTRÉES : clavier (2 joueurs), manette, tactile
   ========================================================= */
const BTNS = ['u', 'd', 'l', 'r', 'lp', 'hp', 'lk', 'hk', 'sp1', 'sp2', 'su', 'start'];
const KEYMAP = [
  { KeyW: 'u', KeyS: 'd', KeyA: 'l', KeyD: 'r', KeyF: 'lp', KeyG: 'hp', KeyV: 'lk', KeyB: 'hk',
    KeyR: 'sp1', KeyT: 'sp2', KeyY: 'su', Enter: 'start', Space: 'lp' },
  { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', KeyK: 'lp', KeyL: 'hp', Comma: 'lk', Period: 'hk',
    KeyI: 'sp1', KeyO: 'sp2', KeyP: 'su', NumpadEnter: 'start',
    Numpad4: 'lp', Numpad5: 'hp', Numpad1: 'lk', Numpad2: 'hk', Numpad6: 'sp1', Numpad3: 'sp2' }
];
const keysDown = new Set(), keysHit = new Set(), touchHit = {};
let anyKeyPressed = false, escPressed = false, musicToggle = false;
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!e.repeat) {
    anyKeyPressed = true;
    if (e.code === 'Escape' || e.code === 'Backspace') escPressed = true;
    if (e.code === 'KeyM') musicToggle = true;
  }
  keysDown.add(e.code); keysHit.add(e.code);
  AU.init();
});
window.addEventListener('keyup', e => keysDown.delete(e.code));
window.addEventListener('blur', () => keysDown.clear());

const touchState = {};
const pads = [makePad(), makePad()];
let mergeKeyboards = true; // en mode 1 joueur, les deux schémas clavier pilotent P1
function makePad() { const p = { held: {}, pressed: {}, prev: {} }; BTNS.forEach(b => { p.held[b] = p.pressed[b] = p.prev[b] = false; }); return p; }

function pollInput() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < 2; i++) {
    const p = pads[i], h = {};
    BTNS.forEach(b => h[b] = false);
    const maps = mergeKeyboards && i === 0 ? KEYMAP : [KEYMAP[i]];
    if (!(mergeKeyboards && i === 1))
      for (const m of maps) for (const code in m) if (keysDown.has(code) || keysHit.has(code)) h[m[code]] = true;
    if (i === 0) for (const b in touchState) if (touchState[b] || touchHit[b]) h[b] = true;
    const gp = gps && gps[i];
    if (gp && gp.connected) {
      const B = n => gp.buttons[n] && gp.buttons[n].pressed;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (B(12) || ay < -0.5) h.u = true; if (B(13) || ay > 0.5) h.d = true;
      if (B(14) || ax < -0.5) h.l = true; if (B(15) || ax > 0.5) h.r = true;
      if (B(2)) h.lp = true; if (B(3)) h.hp = true; if (B(0)) h.lk = true; if (B(1)) h.hk = true;
      if (B(4)) h.sp1 = true; if (B(5)) h.sp2 = true; if (B(6) || B(7)) h.su = true; if (B(9)) h.start = true;
      if (B(8)) escPressed = escPressed || (!p.prev.select);
      h.select = B(8);
    }
    BTNS.forEach(b => { p.pressed[b] = h[b] && !p.held[b]; p.held[b] = h[b]; });
    p.prev.select = h.select;
  }
  keysHit.clear(); for (const b in touchHit) touchHit[b] = false;
}
const menuPressed = (pad, ...b) => b.some(x => pad.pressed[x]);
const confirmPressed = pad => menuPressed(pad, 'lp', 'hp', 'lk', 'start');

/* ---------- contrôles tactiles ---------- */
const touchEl = document.getElementById('touch');
function setTouchControls(on) { touchEl.classList.toggle('on', !!on && isTouch); }
(function setupTouch() {
  const stick = document.getElementById('stick'), knob = document.getElementById('knob');
  let sid = null;
  function stickMove(t) {
    const r = stick.getBoundingClientRect();
    let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy), max = r.width / 2 - 10;
    if (d > max) { dx *= max / d; dy *= max / d; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    const dead = r.width * 0.16;
    touchState.l = dx < -dead; touchState.r = dx > dead;
    touchState.u = dy < -dead * 1.4; touchState.d = dy > dead;
  }
  function stickEnd() { sid = null; knob.style.transform = ''; touchState.l = touchState.r = touchState.u = touchState.d = false; }
  stick.addEventListener('touchstart', e => { e.preventDefault(); AU.init(); const t = e.changedTouches[0]; sid = t.identifier; stickMove(t); }, { passive: false });
  stick.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === sid) stickMove(t); }, { passive: false });
  stick.addEventListener('touchend', e => { for (const t of e.changedTouches) if (t.identifier === sid) stickEnd(); });
  stick.addEventListener('touchcancel', stickEnd);
  document.querySelectorAll('#touch .b').forEach(el => {
    const k = el.dataset.k;
    el.addEventListener('touchstart', e => { e.preventDefault(); AU.init(); touchState[k] = true; touchHit[k] = true; el.classList.add('on'); }, { passive: false });
    const up = e => { e.preventDefault(); touchState[k] = false; el.classList.remove('on'); };
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
  });
})();

// taps / clics sur le canvas (menus)
let tapQueue = [];
canvas.addEventListener('contextmenu', e => { if (window.__clickAttack) e.preventDefault(); });
canvas.addEventListener('pointerdown', e => {
  AU.init();
  // sur PC, pendant les combats : clic gauche = poing, clic droit = pied
  if (window.__clickAttack && e.pointerType === 'mouse') keysHit.add(e.button === 2 ? 'KeyV' : 'KeyF');
  const r = canvas.getBoundingClientRect();
  tapQueue.push({ x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H });
});

/* rotation écran sur mobile */
const rotEl = document.getElementById('rotate');
function checkRotate() { rotEl.classList.toggle('show', window.innerHeight > window.innerWidth); }
window.addEventListener('resize', checkRotate); checkRotate();

/* =========================================================
   AUDIO : effets synthétisés + musique chiptune + annonceur
   ========================================================= */
const AU = {
  ctx: null, master: null, sfxGain: null, musGain: null, noiseBuf: null, musicOn: true,
  track: null, step: 0, nextTime: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      this.ctx = new C();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.8;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.9; this.sfxGain.connect(this.master);
      this.musGain = this.ctx.createGain(); this.musGain.gain.value = 0.32; this.musGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  tone(f, dur, type = 'square', vol = 0.2, slide = null, when = 0, out = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(out || this.sfxGain); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, freq, vol = 0.3, type = 'lowpass', slide = null, when = 0, q = 1, out = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(out || this.sfxGain); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },
  sfx(n) {
    if (!this.ctx) return;
    switch (n) {
      case 'whiff': this.noise(0.12, 1800, 0.12, 'bandpass', 600, 0, 2); break;
      case 'whiffH': this.noise(0.2, 1200, 0.18, 'bandpass', 300, 0, 2); break;
      case 'hitL': this.noise(0.09, 3000, 0.4, 'lowpass', 800); this.tone(180, 0.08, 'square', 0.18, 60); this.tone(1400, 0.05, 'square', 0.06, 700); break;
      case 'hitH': this.noise(0.22, 2500, 0.6, 'lowpass', 200); this.tone(120, 0.2, 'sawtooth', 0.3, 40); this.tone(2200, 0.08, 'square', 0.08, 900); break;
      case 'hitS': this.noise(0.35, 4000, 0.6, 'lowpass', 150); this.tone(90, 0.35, 'sawtooth', 0.35, 30); this.tone(1600, 0.25, 'square', 0.1, 200); break;
      case 'block': this.tone(900, 0.06, 'square', 0.12, 1300); this.noise(0.06, 5000, 0.18, 'highpass'); break;
      case 'jump': this.tone(220, 0.12, 'square', 0.06, 440); break;
      case 'land': this.noise(0.08, 400, 0.2); break;
      case 'proj': this.tone(160, 0.5, 'sawtooth', 0.18, 900); this.noise(0.45, 600, 0.25, 'bandpass', 3000, 0, 3); this.tone(80, 0.4, 'sine', 0.3, 50); break;
      case 'upper': this.noise(0.4, 300, 0.4, 'bandpass', 4000, 0, 2); this.tone(200, 0.35, 'square', 0.12, 1200); break;
      case 'spin': for (let i = 0; i < 4; i++) this.noise(0.1, 1500, 0.15, 'bandpass', 500, i * 0.1, 3); break;
      case 'rush': this.noise(0.3, 600, 0.35, 'bandpass', 2500, 0, 2); this.tone(110, 0.3, 'sawtooth', 0.15, 220); break;
      case 'super':
        this.tone(110, 1.2, 'sawtooth', 0.25, 880); this.tone(55, 1.2, 'square', 0.2, 440);
        this.noise(1.0, 200, 0.4, 'bandpass', 6000, 0, 4); this.tone(1760, 0.6, 'sine', 0.12, 3520, 0.4); break;
      case 'beam': this.noise(1.3, 900, 0.5, 'lowpass', 300); this.tone(70, 1.3, 'sawtooth', 0.35, 40); break;
      case 'ko': this.tone(60, 1.4, 'sawtooth', 0.45, 25); this.noise(1.4, 1500, 0.7, 'lowpass', 60); break;
      case 'select': this.tone(660, 0.06, 'square', 0.1); this.tone(990, 0.08, 'square', 0.08, null, 0.05); break;
      case 'move': this.tone(440, 0.04, 'square', 0.06); break;
      case 'confirm': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, 'square', 0.1, null, i * 0.06)); break;
      case 'coin': this.tone(988, 0.08, 'square', 0.12); this.tone(1319, 0.3, 'square', 0.12, null, 0.08); break;
      case 'clash': this.tone(1200, 0.3, 'square', 0.15, 300); this.noise(0.3, 3000, 0.4); break;
    }
  },
  say(text, pitch = 0.4, rate = 0.85) {
    try {
      if (!window.speechSynthesis) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.pitch = pitch; u.rate = rate; u.volume = 1;
      speechSynthesis.speak(u);
    } catch (e) { }
  },
  /* -------- musique -------- */
  playTrack(tr) { if (this.track === tr) return; this.track = tr; this.step = 0; if (this.ctx) this.nextTime = this.ctx.currentTime + 0.1; },
  stopMusic() { this.track = null; },
  tick() {
    if (!this.ctx || !this.track || !this.musicOn) return;
    const tr = this.track, spb = 60 / tr.bpm / 4;
    if (this.nextTime < this.ctx.currentTime - 0.5) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      const s = this.step, t = this.nextTime - this.ctx.currentTime, mg = this.musGain;
      const bar = Math.floor(s / 16) % tr.prog.length, st = s % 16, root = tr.root + tr.prog[bar];
      const midi = m => 440 * Math.pow(2, (m - 69) / 12);
      const bn = tr.bass[st];
      if (bn != null) this.tone(midi(root + bn - 12), spb * 1.6, 'sawtooth', 0.22, null, t, mg);
      const ln = tr.lead[(s % (tr.lead.length))];
      if (ln != null) this.tone(midi(root + ln + 12), spb * 1.8, 'square', 0.07, null, t, mg);
      const dk = tr.drums;
      if (dk.k[st] === 'x') { this.tone(150, 0.18, 'sine', 0.6, 40, t, mg); }
      if (dk.s[st] === 'x') { this.noise(0.14, 2500, 0.35, 'bandpass', 1200, t, 0.8, mg); this.tone(220, 0.07, 'triangle', 0.2, 120, t, mg); }
      if (dk.h[st] === 'x') this.noise(0.03, 8000, 0.12, 'highpass', null, t, 1, mg);
      this.step++; this.nextTime += spb;
    }
  },
  toggleMusic() { this.musicOn = !this.musicOn; if (this.musGain) this.musGain.gain.value = this.musicOn ? 0.32 : 0; }
};
const DR4 = { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xx' };
const DRB = { k: 'x.....x.x.....x.', s: '....x.......x..x', h: 'xxxxxxxxxxxxxxxx' };
const TRACKS = {
  title: { bpm: 120, root: 45, prog: [0, -4, -2, 0], bass: [0, null, 0, 12, null, 0, 12, null, 0, null, 0, 12, null, 7, 10, 12],
    lead: [0, 3, 7, 12, 7, 3, 0, 3, 7, 12, 15, 12, 7, 3, 7, 10], drums: DR4 },
  select: { bpm: 132, root: 50, prog: [0, 5, 3, 7], bass: [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 10, 12, 7, 5],
    lead: [12, null, 7, null, 10, null, 12, 15, null, 12, null, 10, 7, null, 5, 7], drums: DR4 },
  s0: { bpm: 150, root: 43, prog: [0, 0, -4, -2], bass: [0, 0, 12, 0, 0, 12, 0, 0, 3, 3, 15, 3, 5, 5, 17, 7],
    lead: [12, null, 15, null, 19, null, 15, 12, 10, null, 12, null, 7, null, 10, null, 12, 15, 17, 19, 22, 19, 17, 15, 12, null, 10, null, 7, 10, 12, null], drums: DRB },
  s1: { bpm: 140, root: 41, prog: [0, 3, 5, 3], bass: [0, null, 0, 0, 12, null, 0, 10, 0, null, 0, 0, 7, null, 5, 3],
    lead: [7, 12, 15, 12, 7, 12, 15, 19, 17, 15, 12, 10, 12, null, null, null], drums: DR4 },
  s2: { bpm: 158, root: 46, prog: [0, -2, -4, -5], bass: [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 3, 15, 5, 17],
    lead: [19, 17, 15, 12, 15, 17, 19, 22, 24, null, 22, null, 19, null, 15, null], drums: DRB },
  s3: { bpm: 144, root: 40, prog: [0, 5, 7, 5], bass: [0, null, 12, 0, null, 0, 12, 0, 0, null, 12, 0, 10, null, 7, null],
    lead: [0, 7, 12, 14, 15, 14, 12, 7, 10, 12, 10, 7, 3, 5, 7, null], drums: DR4 },
  win: { bpm: 140, root: 48, prog: [0, 5, 7, 0], bass: [0, null, 12, null, 0, null, 12, null, 0, null, 12, null, 7, null, 12, null],
    lead: [12, 16, 19, 24, 19, 16, 12, 16, 19, 24, 28, 24, 19, 16, 19, 24], drums: DR4 }
};
