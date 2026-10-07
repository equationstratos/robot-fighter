'use strict';
/* =========================================================
   DÉCORS : 4 arènes avec parallaxe et animations
   ========================================================= */
const FLOOR_Y = 400;
function mkLayer(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }
const layerW = par => Math.ceil(W + (STAGE_W - W) * par) + 4;

function floorPerspective(c, camX, col, step = 120, alpha = 0.25) {
  c.save(); c.strokeStyle = col; c.globalAlpha = alpha; c.lineWidth = 1.5;
  const start = Math.floor(camX / step) * step - step * 4;
  for (let wx = start; wx < camX + W + step * 4; wx += step) {
    const sx = wx - camX;
    c.beginPath(); c.moveTo(sx, FLOOR_Y); c.lineTo((sx - W / 2) * 1.9 + W / 2, H); c.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const y = FLOOR_Y + Math.pow(i / 6, 1.6) * (H - FLOOR_Y);
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
  }
  c.restore();
}

const STAGES = [
  /* ---------------- 0 : LABORATOIRE NÉON ---------------- */
  {
    name: 'LABORATOIRE NÉON', track: 's0', wet: 0.22,
    build() {
      const f = this.far = mkLayer(layerW(0.35), FLOOR_Y + 2), c = f.getContext('2d'), r = seeded(7);
      let g = c.createLinearGradient(0, 0, 0, FLOOR_Y);
      g.addColorStop(0, '#03060d'); g.addColorStop(0.5, '#0b1830'); g.addColorStop(1, '#0a1426');
      c.fillStyle = g; c.fillRect(0, 0, f.width, f.height);
      // panneaux vitrés
      for (let x = 0; x < f.width; x += 140) {
        c.fillStyle = 'rgba(80,140,220,0.06)'; c.fillRect(x + 6, 90, 128, 300);
        c.strokeStyle = '#1d2c48'; c.lineWidth = 6; c.strokeRect(x + 6, 90, 128, 300);
        c.strokeStyle = 'rgba(160,210,255,.08)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x + 20, 380); c.lineTo(x + 90, 100); c.stroke();
      }
      // établis + écrans
      for (let x = 30; x < f.width; x += 210 + r() * 80) {
        c.fillStyle = '#0d1424'; c.fillRect(x, 330, 160, 70);
        c.fillStyle = '#16213a'; c.fillRect(x - 6, 322, 172, 10);
        for (let k = 0; k < 2; k++) {
          const mx = x + 18 + k * 70;
          c.fillStyle = '#0a0f1a'; c.fillRect(mx, 272, 56, 42); c.fillRect(mx + 24, 314, 8, 10);
          const sg = c.createLinearGradient(mx, 276, mx, 310);
          sg.addColorStop(0, '#36d6ff'); sg.addColorStop(1, '#0a4a7a');
          c.fillStyle = sg; c.globalAlpha = 0.8; c.fillRect(mx + 4, 276, 48, 34); c.globalAlpha = 1;
          c.fillStyle = 'rgba(255,255,255,.5)';
          for (let l = 0; l < 4; l++) c.fillRect(mx + 8, 281 + l * 7, 10 + r() * 30, 2);
        }
      }
      const fl = this.flo = mkLayer(STAGE_W, H - FLOOR_Y), d = fl.getContext('2d');
      g = d.createLinearGradient(0, 0, 0, fl.height);
      g.addColorStop(0, '#0e1626'); g.addColorStop(1, '#05080f');
      d.fillStyle = g; d.fillRect(0, 0, STAGE_W, fl.height);
    },
    draw(c, camX, t) {
      c.drawImage(this.far, -camX * 0.35, 0);
      // plafonds lumineux (perspective)
      for (let row = 0; row < 3; row++) {
        const y = 18 + row * 26, sc = 1 - row * 0.22, gap = 210 * sc;
        const off = -(camX * (0.5 - row * 0.1)) % gap;
        for (let x = off - gap; x < W + gap; x += gap) {
          c.save(); c.shadowColor = '#bfe6ff'; c.shadowBlur = 18;
          c.fillStyle = `rgba(220,240,255,${0.9 - row * 0.2})`;
          c.fillRect(x, y, 120 * sc, 7 * sc); c.restore();
        }
      }
      // bras robotiques (couche intermédiaire)
      const mid = camX * 0.6;
      [260, 980, 1500].forEach((bx, i) => {
        const x = bx - mid, base = { x, y: 398 };
        if (x < -200 || x > W + 200) return;
        const a1 = -0.7 + Math.sin(t * 0.02 + i) * 0.35, a2 = a1 + 1.4 + Math.sin(t * 0.031 + i * 2) * 0.5;
        const p1 = { x: base.x + Math.sin(a1) * 90, y: base.y - Math.cos(a1) * 90 };
        const p2 = { x: p1.x + Math.sin(a2) * 70, y: p1.y - Math.cos(a2) * 70 };
        c.fillStyle = '#2b3446'; c.fillRect(x - 26, 384, 52, 16);
        limb(c, base, p1, 18, '#ff8a1c', '#14181f'); limb(c, p1, p2, 13, '#ff8a1c', '#14181f');
        dot(c, p1, 10, '#3a4252', '#14181f'); dot(c, p2, 7, '#cfd6e2', '#14181f');
      });
      // sol
      c.drawImage(this.flo, -camX, FLOOR_Y);
      floorPerspective(c, camX, '#3d6fb8', 140, 0.18);
      // bandes néon au sol : rouge / bleu / rouge (comme la vidéo)
      const segs = [[0, 520, '#ff2a3a'], [540, 1060, '#2a8bff'], [1080, STAGE_W, '#ff2a3a']];
      for (const [a, b, col] of segs) {
        c.save(); c.shadowColor = col; c.shadowBlur = 22; c.fillStyle = col;
        c.fillRect(a - camX, FLOOR_Y - 3, b - a, 5); c.restore();
        const g = c.createLinearGradient(0, FLOOR_Y, 0, FLOOR_Y + 70);
        g.addColorStop(0, hexA(col, 0.35)); g.addColorStop(1, hexA(col, 0));
        c.fillStyle = g; c.fillRect(a - camX, FLOOR_Y + 2, b - a, 70);
      }
    }
  },
  /* ---------------- 1 : ENTREPÔT ARCADE ---------------- */
  {
    name: 'ENTREPÔT ARCADE', track: 's1', wet: 0.12,
    build() {
      const f = this.far = mkLayer(layerW(0.4), FLOOR_Y + 2), c = f.getContext('2d'), r = seeded(21);
      c.fillStyle = '#120d16'; c.fillRect(0, 0, f.width, f.height);
      // briques
      for (let y = 0; y < FLOOR_Y; y += 18) for (let x = (y / 18) % 2 ? -20 : 0; x < f.width; x += 40) {
        c.fillStyle = `rgb(${30 + r() * 14},${20 + r() * 8},${30 + r() * 12})`; c.fillRect(x + 1, y + 1, 38, 16);
      }
      // poutres + fenêtres hautes
      c.fillStyle = '#08060a'; for (let x = 0; x < f.width; x += 260) c.fillRect(x, 0, 22, FLOOR_Y);
      for (let x = 60; x < f.width; x += 260) {
        c.fillStyle = '#1b2738'; c.fillRect(x, 40, 150, 70);
        c.fillStyle = 'rgba(120,170,255,.15)'; c.fillRect(x + 6, 46, 66, 58); c.fillRect(x + 78, 46, 66, 58);
      }
      // pile de caisses et pneus
      for (let x = 20; x < f.width; x += 300 + r() * 120) {
        for (let k = 0; k < 3; k++) {
          const cx = x + k * 52, h = 1 + ((r() * 3) | 0);
          for (let j = 0; j < h; j++) { c.fillStyle = j % 2 ? '#4a3420' : '#5a3f26'; c.fillRect(cx, 400 - (j + 1) * 46, 48, 44); c.strokeStyle = '#2a1c10'; c.lineWidth = 3; c.strokeRect(cx, 400 - (j + 1) * 46, 48, 44); c.beginPath(); c.moveTo(cx, 400 - (j + 1) * 46); c.lineTo(cx + 48, 400 - j * 46 - 2); c.stroke(); }
        }
        c.fillStyle = '#0c0c0e';
        for (let j = 0; j < 3; j++) { c.beginPath(); c.ellipse(x + 200, 392 - j * 16, 34, 9, 0, 0, 7); c.fill(); c.strokeStyle = '#26262a'; c.stroke(); }
      }
      const fl = this.flo = mkLayer(STAGE_W, H - FLOOR_Y), d = fl.getContext('2d');
      const g = d.createLinearGradient(0, 0, 0, fl.height); g.addColorStop(0, '#2b2a31'); g.addColorStop(1, '#141318');
      d.fillStyle = g; d.fillRect(0, 0, STAGE_W, fl.height);
      for (let i = 0; i < 400; i++) { d.fillStyle = `rgba(255,255,255,${r() * 0.04})`; d.fillRect(r() * STAGE_W, r() * fl.height, 2 + r() * 8, 1 + r() * 3); }
      d.fillStyle = '#c9a312'; d.fillRect(0, 20, STAGE_W, 4); d.fillRect(0, 110, STAGE_W, 5);
      this.cabs = []; for (let x = 120; x < STAGE_W; x += 230 + r() * 60) this.cabs.push({ x, hue: (r() * 360) | 0, ph: r() * 10 });
    },
    draw(c, camX, t) {
      c.drawImage(this.far, -camX * 0.4, 0);
      // néons
      const tubes = [[150, 140, '#ff3fd2'], [700, 120, '#29e6ff'], [1250, 150, '#ff3fd2'], [1750, 130, '#29e6ff']];
      for (const [x0, y, col] of tubes) {
        const x = x0 - camX * 0.4; const flick = (Math.sin(t * 0.7 + x0) > 0.97) ? 0.3 : 1;
        c.save(); c.globalAlpha = flick; c.shadowColor = col; c.shadowBlur = 25; c.strokeStyle = col; c.lineWidth = 6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + 180, y); c.stroke();
        c.beginPath(); c.moveTo(x + 20, y + 30); c.lineTo(x + 20, y + 170); c.stroke();
        c.restore();
      }
      txt('ARCADE', 960 - camX * 0.4, 95, 30, { font: FONT_BIG, color: '#ffe95c', glow: '#ff9d1c', blur: 22 });
      // bornes d'arcade
      const mid = camX * 0.72;
      for (const cb of this.cabs) {
        const x = cb.x - mid; if (x < -100 || x > W + 100) continue;
        c.fillStyle = '#16121c'; c.beginPath(); c.moveTo(x, 400); c.lineTo(x, 250); c.lineTo(x + 12, 236); c.lineTo(x + 80, 236); c.lineTo(x + 80, 400); c.fill();
        c.fillStyle = `hsl(${cb.hue},90%,55%)`; c.fillRect(x + 6, 240, 68, 16);
        const sc = `hsl(${(cb.hue + t * 2) % 360},80%,${45 + Math.sin(t * 0.2 + cb.ph) * 15}%)`;
        c.save(); c.shadowColor = sc; c.shadowBlur = 16; c.fillStyle = sc; c.fillRect(x + 10, 266, 60, 46); c.restore();
        c.fillStyle = 'rgba(0,0,0,.35)'; for (let l = 0; l < 46; l += 4) c.fillRect(x + 10, 266 + l, 60, 1);
        c.fillStyle = '#2a2433'; c.fillRect(x + 4, 320, 72, 18);
        c.fillStyle = '#ff3a3a'; c.beginPath(); c.arc(x + 24, 328, 4, 0, 7); c.fill();
        c.fillStyle = '#3aa8ff'; c.beginPath(); c.arc(x + 44, 328, 4, 0, 7); c.arc(x + 56, 328, 4, 0, 7); c.fill();
      }
      c.drawImage(this.flo, -camX, FLOOR_Y);
      floorPerspective(c, camX, '#000', 160, 0.35);
    }
  },
  /* ---------------- 2 : TOIT DE TOKYO ---------------- */
  {
    name: 'TOIT DE TOKYO', track: 's2', wet: 0.3, rain: true,
    build() {
      const r = seeded(99);
      const mk = (par, hMin, hMax, col, win, seed) => {
        const f = mkLayer(layerW(par), FLOOR_Y + 2), c = f.getContext('2d');
        for (let x = -10; x < f.width; x += 40 + r() * 70) {
          const w = 40 + r() * 80, h = hMin + r() * (hMax - hMin);
          c.fillStyle = col; c.fillRect(x, FLOOR_Y - h, w, h);
          if (r() < 0.3) { c.fillRect(x + w / 2 - 2, FLOOR_Y - h - 30, 4, 30); c.fillStyle = '#ff3030'; c.fillRect(x + w / 2 - 2, FLOOR_Y - h - 32, 4, 4); c.fillStyle = col; }
          for (let wy = FLOOR_Y - h + 8; wy < FLOOR_Y - 10; wy += 10) for (let wx = x + 5; wx < x + w - 6; wx += 9)
            if (r() < win) { c.fillStyle = r() < 0.7 ? 'rgba(255,214,140,.75)' : 'rgba(140,220,255,.7)'; c.fillRect(wx, wy, 4, 5); c.fillStyle = col; }
        }
        return f;
      };
      this.l1 = mk(0.12, 80, 200, '#170d2c', 0.25);
      this.l2 = mk(0.3, 120, 300, '#0e0820', 0.35);
      this.signs = []; for (let x = 100; x < layerW(0.5); x += 180 + r() * 160) this.signs.push({ x, y: 120 + r() * 140, txt: pick(['ロボ', '闘', '電脳', 'ファイト', '未来', '鉄']), col: pick(['#ff2e88', '#29e6ff', '#ffe14a', '#7dff4d', '#ff7a1c']), v: r() < 0.5 });
      const fl = this.flo = mkLayer(STAGE_W, H - FLOOR_Y), d = fl.getContext('2d');
      const g = d.createLinearGradient(0, 0, 0, fl.height); g.addColorStop(0, '#24212e'); g.addColorStop(1, '#0d0c12');
      d.fillStyle = g; d.fillRect(0, 0, STAGE_W, fl.height);
      d.strokeStyle = 'rgba(255,255,255,.06)'; for (let x = 0; x < STAGE_W; x += 60) { d.beginPath(); d.moveTo(x, 0); d.lineTo(x, fl.height); d.stroke(); }
      // héliport
      d.strokeStyle = 'rgba(255,220,80,.35)'; d.lineWidth = 6; d.beginPath(); d.ellipse(STAGE_W / 2, 70, 220, 50, 0, 0, 7); d.stroke();
      d.fillStyle = 'rgba(255,220,80,.35)'; d.font = 'bold 60px sans-serif'; d.textAlign = 'center'; d.fillText('H', STAGE_W / 2, 92);
      this.drops = []; for (let i = 0; i < 140; i++) this.drops.push({ x: Math.random() * W, y: Math.random() * H, v: 12 + Math.random() * 8 });
    },
    draw(c, camX, t) {
      const g = c.createLinearGradient(0, 0, 0, FLOOR_Y);
      g.addColorStop(0, '#05021a'); g.addColorStop(0.55, '#2a0c46'); g.addColorStop(1, '#ff3d7f');
      c.fillStyle = g; c.fillRect(0, 0, W, FLOOR_Y);
      c.save(); c.shadowColor = '#fff6d8'; c.shadowBlur = 40; c.fillStyle = '#fff3cf';
      c.beginPath(); c.arc(760 - camX * 0.05, 90, 38, 0, 7); c.fill(); c.restore();
      c.drawImage(this.l1, -camX * 0.12, 0);
      c.drawImage(this.l2, -camX * 0.3, 0);
      for (const s of this.signs) {
        const x = s.x - camX * 0.5; if (x < -120 || x > W + 120) continue;
        const on = Math.sin(t * 0.05 + s.x) > -0.9;
        c.fillStyle = '#0a0614'; c.fillRect(x - 10, s.y - 8, s.v ? 46 : s.txt.length * 30 + 20, s.v ? s.txt.length * 32 + 16 : 46);
        if (on) {
          if (s.v) [...s.txt].forEach((ch, i) => txt(ch, x + 13, s.y + 16 + i * 32, 26, { font: 'sans-serif', color: s.col, glow: s.col, blur: 16 }));
          else txt(s.txt, x, s.y + 15, 26, { font: 'sans-serif', align: 'left', color: s.col, glow: s.col, blur: 16 });
        }
      }
      // rambarde
      const rx = camX * 0.92;
      c.fillStyle = '#1a1722'; c.fillRect(0, FLOOR_Y - 46, W, 6);
      for (let x = -(rx % 50); x < W; x += 50) c.fillRect(x, FLOOR_Y - 46, 4, 46);
      c.drawImage(this.flo, -camX, FLOOR_Y);
    },
    front(c, camX, t) {
      c.save(); c.strokeStyle = 'rgba(170,200,255,.35)'; c.lineWidth = 1.5;
      for (const d of this.drops) {
        d.y += d.v; d.x -= 2; if (d.y > H) { d.y = -20; d.x = Math.random() * (W + 100); }
        c.beginPath(); c.moveTo(d.x, d.y); c.lineTo(d.x - 3, d.y - 16); c.stroke();
      }
      c.restore();
    }
  },
  /* ---------------- 3 : PARCOURS D'ESSAI (coucher de soleil) ---------------- */
  {
    name: "PARCOURS D'ESSAI", track: 's3', wet: 0,
    build() {
      const r = seeded(5);
      const mtn = (par, base, amp, col) => {
        const f = mkLayer(layerW(par), FLOOR_Y + 2), c = f.getContext('2d');
        c.fillStyle = col; c.beginPath(); c.moveTo(0, FLOOR_Y);
        let y = base; for (let x = 0; x <= f.width; x += 30) { y = clamp(y + (r() - 0.5) * amp, base - amp * 2, base + amp); c.lineTo(x, y); }
        c.lineTo(f.width, FLOOR_Y); c.fill(); return f;
      };
      this.m1 = mtn(0.1, 250, 40, '#5a2a52'); this.m2 = mtn(0.22, 300, 30, '#33183a');
      const f = this.mid = mkLayer(layerW(0.6), FLOOR_Y + 2), c = f.getContext('2d');
      // hangar
      c.fillStyle = '#211527'; c.fillRect(80, 230, 380, 172); c.fillStyle = '#2d1d33'; c.beginPath(); c.moveTo(60, 232); c.lineTo(270, 180); c.lineTo(480, 232); c.fill();
      c.fillStyle = '#ffb25c'; c.globalAlpha = 0.6; c.fillRect(200, 300, 140, 100); c.globalAlpha = 1;
      // modules de parkour (boîtes / rampes)
      for (let x = 560; x < f.width; x += 160 + r() * 140) {
        const h = 40 + r() * 70, w = 70 + r() * 70;
        c.fillStyle = '#6b4a35'; c.fillRect(x, 400 - h, w, h);
        c.fillStyle = '#7d5a42'; c.fillRect(x, 400 - h, w, 8);
        c.strokeStyle = '#3a271b'; c.lineWidth = 2; c.strokeRect(x, 400 - h, w, h);
        if (r() < 0.5) { c.fillStyle = '#5a3d2c'; c.beginPath(); c.moveTo(x + w, 400 - h); c.lineTo(x + w + 80, 400); c.lineTo(x + w, 400); c.fill(); }
        if (r() < 0.4) { c.fillStyle = '#ff6a1c'; c.beginPath(); c.moveTo(x - 20, 400); c.lineTo(x - 12, 376); c.lineTo(x - 4, 400); c.fill(); }
      }
      const fl = this.flo = mkLayer(STAGE_W, H - FLOOR_Y), d = fl.getContext('2d');
      const g = d.createLinearGradient(0, 0, 0, fl.height); g.addColorStop(0, '#5b3f35'); g.addColorStop(1, '#2a1c19');
      d.fillStyle = g; d.fillRect(0, 0, STAGE_W, fl.height);
      for (let i = 0; i < 700; i++) { d.fillStyle = `rgba(0,0,0,${r() * 0.15})`; d.fillRect(r() * STAGE_W, r() * fl.height, 2 + r() * 4, 1 + r() * 2); }
      d.fillStyle = 'rgba(255,255,255,.4)'; for (let x = 20; x < STAGE_W; x += 120) d.fillRect(x, 64, 60, 4);
    },
    draw(c, camX, t) {
      const g = c.createLinearGradient(0, 0, 0, FLOOR_Y);
      g.addColorStop(0, '#1b1442'); g.addColorStop(0.45, '#8a2f6a'); g.addColorStop(0.75, '#ff6a3d'); g.addColorStop(1, '#ffc46b');
      c.fillStyle = g; c.fillRect(0, 0, W, FLOOR_Y);
      c.save(); c.shadowColor = '#ffd27a'; c.shadowBlur = 60; c.fillStyle = '#ffe6a6';
      c.beginPath(); c.arc(480 - camX * 0.04, 280, 70, 0, 7); c.fill(); c.restore();
      c.fillStyle = 'rgba(255,240,220,.5)';
      for (let i = 0; i < 5; i++) { const x = ((i * 260 + t * 0.15) % (W + 300)) - 150 - camX * 0.06; c.beginPath(); c.ellipse(x, 70 + i * 22, 70, 9, 0, 0, 7); c.fill(); }
      c.drawImage(this.m1, -camX * 0.1, 0);
      c.drawImage(this.m2, -camX * 0.22, 0);
      c.drawImage(this.mid, -camX * 0.6, 0);
      c.drawImage(this.flo, -camX, FLOOR_Y);
    }
  }
];
STAGES.forEach(s => s.build());
