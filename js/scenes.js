'use strict';
/* =========================================================
   SCÈNES : titre, menu, sélection, VS, combat (HUD), fin + boucle
   ========================================================= */
let scene = null, nextScene = null, fade = 0, gFrame = 0;
function setScene(s) { nextScene = s; }
const GAME = { mode: 'arcade', p1: 0, p2: 1, ladder: [], idx: 0 };

function circleRect(cx, cy, r, b) {
  const x = clamp(cx, b.x0, b.x1), y = clamp(cy, b.y0, b.y1);
  return (cx - x) ** 2 + (cy - y) ** 2 <= r * r ? { x, y } : null;
}
const inRect = (t, x, y, w, h) => t.x >= x && t.x <= x + w && t.y >= y && t.y <= y + h;

/* =================== COMBAT =================== */
class Fight {
  constructor(ch1, ch2, stageIdx, opt) {
    this.opt = opt;
    this.p = [new Fighter(ch1, 0), new Fighter(ch2, 1)];
    this.ai = [opt.cpu0 ? new AI(opt.level || 3) : null, opt.cpu1 ? new AI(opt.level || 3) : null];
    // arène (ARENAS, arenas.js) ; décor 2D de repli si WebGL indisponible
    this.arenaIdx = clamp(stageIdx | 0, 0, ARENAS.length - 1); this.arena = ARENAS[this.arenaIdx];
    this.stageIdx = this.arena.d2;
    this.stage = STAGES[this.stageIdx];
    this.round = 1; this.frame = 0; this.camX = (STAGE_W - VIEW_W) / 2; this.zoom = 1; this.zx = W / 2; this.zy = H / 2;
    this.paused = false; this.pauseSel = 0; this.showMoves = false;
    // training : mannequin réglable, vie qui se recharge, super infinie, compteur de dégâts
    this.tr = opt.training ? { dummy: 'stand', superInf: true, last: 0, total: 0, hits: 0, maxCombo: 0, maxDmg: 0, pad: makePad(), ai: new AI(3) } : null;
    this.startRound();
  }
  startRound() {
    this.p.forEach(f => f.reset());
    this.projs = []; FX.clear();
    this.timer = 99; this.tf = 0; this.phase = 'intro'; this.phaseT = 0;
    this.hitstop = 0; this.slowmo = 0; this.shake = 0; this.flash = 0; this.flashCol = '#fff';
    this.superFreeze = 0; this.superBy = null; this.combo = [null, null]; this.ann = null;
    this.camX = (STAGE_W - VIEW_W) / 2;
  }
  other(f) { return this.p[0] === f ? this.p[1] : this.p[0]; }
  // ----- training -----
  dummyPad(f, o) {
    const T = this.tr;
    if (T.dummy === 'cpu') return T.ai.think(f, o, this);
    const pad = T.pad; BTNS.forEach(b => { pad.pressed[b] = false; pad.held[b] = false; });
    if (T.dummy === 'crouch') pad.held.d = true;
    if (T.dummy === 'jump' && !f.air && f.neutral && this.frame % 45 === 0) { pad.held.u = true; pad.pressed.u = true; }
    return pad;
  }
  trainingRefill() {
    for (const f of this.p) {
      if (f.hp <= 0) f.hp = 1; // pas de K.O. à l'entraînement
      const busy = ['hit', 'fall', 'down', 'getup', 'held', 'block'].includes(f.st);
      if (!busy && f.hp < 1000 && this.frame - (f.lastHitF || 0) > 50) f.hp = 1000;
    }
    if (this.tr.superInf) this.p[0].meter = 100;
  }
  resetTraining() {
    this.p.forEach(f => { f.reset(); f.ko = false; });
    this.projs = []; FX.clear(); this.combo = [null, null]; this.camX = (STAGE_W - VIEW_W) / 2;
    Object.assign(this.tr, { last: 0, total: 0, hits: 0 });
  }
  clampX(x, f) {
    const o = this.other(f);
    let lo = 40, hi = STAGE_W - 40;
    if (o) { lo = Math.max(lo, o.x - (VIEW_W - 70)); hi = Math.min(hi, o.x + (VIEW_W - 70)); }
    return clamp(x, lo, hi);
  }
  announce(text, dur, style = {}) { this.ann = { text, t: 0, dur, ...style }; }
  // nom du coup affiché à l'écran (sans voix : l'annonceur ne parle que pour les manches, FIGHT, K.O., etc.)
  announceMove(f, name) { this.moveTxt = { side: f.side, name, t: 0, col: f.ch.accent }; }
  startSuper(f) {
    f.meter -= 100; f.setSt('super'); f.sp = f.ch.sup; f.inv = 999; f.hitN = 0; f.hitCD = 0; f.connected = false; f.vx = 0; f.beam = null;
    this.superFreeze = 62; this.superBy = f;
    AU.sfx('super');
    explosion(f.x, f.hipY - 40, f.ch.accent, 0.8);
  }
  applyHit(a, d, pt, mv, canBlock = true, src = null) {
    const awayX = Math.sign(d.x - (src ? src.x - src.vx * 3 : a.x)) || -d.face;
    const pad = d.pad, held = pad ? pad.held : {};
    const autoG = !!(this.tr && d.side === 1 && this.tr.dummy === 'guard');
    const holdBack = autoG || (d.cpuHold ? false : (awayX > 0 ? held.r : held.l));
    const crouch = autoG ? mv.h === 'low' : !!held.d;
    const hOk = autoG || (mv.h === 'low' ? crouch : mv.h === 'high' ? !crouch : true);
    const ch = a.ch;
    if (canBlock && d.canBlock && holdBack && hOk && !d.air) {
      d.crouching = crouch; d.setSt('block'); d.stun = mv.bs || 12;
      d.push = awayX * (mv.kb || 6) * 0.9; d.pushSrc = a;
      const chip = mv.chip ? Math.round(mv.dmg * ch.power * 0.18) : 0;
      d.hp = Math.max(mv.sup ? 0 : 1, d.hp - chip);
      hitSpark(pt.x, pt.y, 1, '#7fd0ff', awayX, true);
      AU.sfx('block'); this.hitstop = Math.max(this.hitstop, 5);
      a.meter = Math.min(100, a.meter + 3); d.meter = Math.min(100, d.meter + 4);
      return 'block';
    }
    const inStun = d.st === 'hit' || d.st === 'fall';
    a.combo = inStun ? a.combo + 1 : 1;
    const scale = mv.sup ? 1 : 1 - Math.min(0.5, (a.combo - 1) * 0.09);
    const dmg = Math.round(mv.dmg * ch.power * scale);
    d.hp = Math.max(0, d.hp - dmg); d.lastHitF = this.frame;
    if (this.tr && a.side === 0) {
      const T = this.tr; T.last = dmg; T.total = a.combo > 1 ? T.total + dmg : dmg; T.hits = a.combo;
      T.maxCombo = Math.max(T.maxCombo, a.combo); T.maxDmg = Math.max(T.maxDmg, T.total);
    }
    d.flash = 5; d.crouching = crouch && !d.air && d.st !== 'fall';
    d.mv = null; d.amv = null; d.hover = false; d.ghostOn = false; d.beam = null; d.grav = 0.75;
    if (d.st === 'special' || d.st === 'super') d.inv = 0;
    if (mv.drag) {
      d.setSt('fall'); d.t = 3; d.x = this.clampX(a.x + a.face * 42, d); d.y = Math.min(d.y, a.y - 8, GROUND - 1); d.vy = a.vy; d.vx = a.vx;
    } else if (d.air || mv.kd || d.hp <= 0) {
      d.setSt('fall'); d.vy = (mv.launch || -7) - (d.hp <= 0 ? 3 : 0); d.vx = awayX * (3 + (mv.kb || 5) * 0.2) * (d.hp <= 0 ? 1.6 : 1);
      d.y = Math.min(d.y, GROUND - 1);
    } else {
      d.setSt('hit'); d.stun = mv.hs || 16; d.push = awayX * (mv.kb || 6); d.pushSrc = a;
    }
    const lvl = mv.lvl || 1;
    hitSpark(pt.x, pt.y, Math.min(lvl, 3), ch.accent, awayX, false);
    AU.sfx(lvl >= 3 ? 'hitS' : lvl === 2 ? 'hitH' : 'hitL');
    this.hitstop = Math.max(this.hitstop, mv.sup ? 3 : 3 + lvl * 3);
    this.shake = Math.max(this.shake, lvl * 3 + (mv.sup ? 2 : 0));
    if (!mv.sup) a.meter = Math.min(100, a.meter + dmg * 0.14 + 2);
    d.meter = Math.min(100, d.meter + dmg * 0.07);
    if (a.combo >= 2) this.combo[a.side] = { n: a.combo, t: 0 };
    return 'hit';
  }
  checkHits() {
    for (let i = 0; i < 2; i++) {
      const a = this.p[i], d = this.p[1 - i];
      const hb = a.activeHit();
      if (hb) {
        const hr = (d.st === 'fall' && hb.mv.sup) ? d.hurtboxAny() : d.hurtbox();
        const pt = hr && circleRect(hb.x, hb.y, hb.r, hr);
        if (pt) {
          let mv = hb.mv;
          const last = a.hitN + 1 >= (mv.hits || 1);
          if (mv === SPECIAL_MV.storm && last) mv = { ...mv, dmg: 90, kd: true, launch: -12, drag: false, kb: 8 };
          const isMoul = a.st === 'super' && a.sp === 'moulinet';
          const res = this.applyHit(a, d, pt, mv, !isMoul);
          a.hitN++; a.hitCD = mv.every || 999; a.connected = true;
          if (isMoul && res === 'hit') { // prise en ciseaux inversée : la cible est verrouillée
            a.sp = 'moulinetLock'; a.t = 0; a.lockX = d.x; a.vx = 0; a.vy = 0;
            d.setSt('held'); d.inv = 999; d.vx = 0; d.vy = 0; d.push = 0; d.heldHipY = null; d.heldPose = POSES.hit; d.z3 = 0; d.y = GROUND; d.face = -a.face;
            this.flash = 4; this.shake = 10; this.announceMove(a, 'MOULINET 720');
          }
          if (a.st === 'super' && a.sp === 'rush' && res === 'hit') {
            a.sp = 'barrage'; a.t = 0; a.vx = 0; d.setSt('hit'); d.stun = 999; d.push = 0;
            this.flash = 4; this.shake = 10;
          }
          if (a.st === 'special' && a.sp === 'rush') a.vx *= 0.3;
        }
      }
      // super laser
      if (a.beam && a.beam.t % 5 === 0) {
        const bx0 = a.face > 0 ? a.beam.x : a.beam.x - 1400, bx1 = a.face > 0 ? a.beam.x + 1400 : a.beam.x;
        const hr = d.hurtboxAny();
        if (hr && hr.x1 > bx0 && hr.x0 < bx1 && hr.y1 > a.beam.y - 48 && hr.y0 < a.beam.y + 48 && d.st !== 'down' && d.st !== 'getup') {
          const lastHit = a.beam.t >= 64;
          const mv = lastHit ? { ...SPECIAL_MV.beam, dmg: 70, kd: true, launch: -10, kb: 8 } : SPECIAL_MV.beam;
          if (d.st === 'fall' && !lastHit) { d.vy = Math.min(d.vy, -2); d.vx = a.face * 1.5; d.hp = Math.max(0, d.hp - 18); d.flash = 3; hitSpark(clamp(a.beam.x + a.face * 400, hr.x0, hr.x1), a.beam.y, 2, a.ch.accent, a.face); AU.sfx('hitL'); }
          else this.applyHit(a, d, { x: a.face > 0 ? hr.x0 + 10 : hr.x1 - 10, y: clamp(a.beam.y, hr.y0, hr.y1) }, mv);
        }
        for (const pr of this.projs) if (pr.f !== a && Math.abs(pr.y - a.beam.y) < 60 && pr.x > bx0 && pr.x < bx1) { pr.dead = true; explosion(pr.x, pr.y, pr.col, 0.6); }
      }
    }
  }
  updateProjs() {
    for (const pr of this.projs) {
      if (pr.dead) continue;
      pr.update();
      if (pr.x < this.camX - 150 || pr.x > this.camX + VIEW_W + 150) pr.dead = true;
      for (const q of this.projs) if (q !== pr && !q.dead && q.f !== pr.f && Math.abs(q.x - pr.x) < 40 && Math.abs(q.y - pr.y) < 50) {
        q.dead = pr.dead = true; explosion((q.x + pr.x) / 2, (q.y + pr.y) / 2, '#ffffff', 0.8); AU.sfx('clash'); this.shake = 8;
      }
      if (pr.dead) continue;
      const d = this.other(pr.f), hr = d.hurtbox();
      const pt = hr && circleRect(pr.x, pr.y, pr.r, hr);
      if (pt) {
        pr.dead = true;
        this.applyHit(pr.f, d, pt, { ...SPECIAL_MV.proj, dmg: SPECIAL_MV.proj.dmg * (pr.vx * pr.vx > 60 ? 1 : 0.9) }, true, pr);
        explosion(pt.x, pt.y, pr.col, 0.6);
      }
    }
    this.projs = this.projs.filter(pr => { if (pr.dead && pr.f.proj === pr) pr.f.proj = null; return !pr.dead; });
  }
  bodyPush() {
    const [a, b] = this.p;
    if (['down', 'getup'].includes(a.st) || ['down', 'getup'].includes(b.st)) return;
    if (a.st === 'super' && a.sp === 'barrage' || b.st === 'super' && b.sp === 'barrage') return;
    if ([a, b].some(f => f.st === 'throw' || f.st === 'held' || (f.st === 'super' && f.sp === 'moulinetLock'))) return;
    const minD = 46 * (a.ch.scale + b.ch.scale) / 2;
    const dx = b.x - a.x, ady = Math.abs(a.y - b.y);
    if (Math.abs(dx) < minD && ady < 110) {
      const ov = (minD - Math.abs(dx)) / 2, s = Math.sign(dx) || (a.side ? -1 : 1);
      const ax = this.clampX(a.x - s * ov, a), bx = this.clampX(b.x + s * ov, b);
      const lost = (a.x - s * ov - ax) + (b.x + s * ov - bx);
      a.x = this.clampX(ax - lost, a); b.x = this.clampX(bx - lost, b);
    }
  }
  update() {
    // pause
    const startP = pads.some(p => p.pressed.start);
    // ÉCHAP ouvre/ferme la pause ; START/ENTRÉE l'ouvre, et dans le menu valide l'option choisie
    if ((escPressed || (startP && !this.paused)) && this.phase !== 'done') { this.paused = !this.paused; this.pauseSel = 0; this.showMoves = false; AU.sfx('select'); return; }
    if (this.paused) return this.updatePause();
    this.frame++;
    for (const k in this.combo) if (this.combo[k] && ++this.combo[k].t > 70) this.combo[k] = null;
    if (this.ann) this.ann.t++;
    if (this.moveTxt && ++this.moveTxt.t > 80) this.moveTxt = null;
    if (this.flash > 0) this.flash--;
    this.shake *= 0.86; if (this.shake < 0.3) this.shake = 0;
    FX.update();
    if (this.superFreeze > 0) {
      this.superFreeze--;
      const f = this.superBy, c = f.wp('fha');
      for (let i = 0; i < 3; i++) FX.add({ type: 'glow', x: c.x + rand(-160, 160), y: c.y + rand(-160, 160), size: rand(6, 12), life: 16, max: 16, col: f.ch.accent, target: c });
      f.computeSkel();
      return;
    }
    if (this.hitstop > 0) { this.hitstop--; return; }
    if (this.slowmo > 0) { this.slowmo--; if (this.slowmo % 3) return; }
    this.phaseT++;
    const ctrl = this.phase === 'fight';
    for (let i = 0; i < 2; i++) {
      const f = this.p[i], o = this.p[1 - i];
      let pad = null;
      if (ctrl) pad = this.tr && i === 1 ? this.dummyPad(f, o) : this.ai[i] ? this.ai[i].think(f, o, this) : pads[this.opt.versus ? i : 0];
      if (this.ai[i] && pad) f.cpuHold = false;
      f.update(pad, o, this, ctrl);
    }
    this.updateProjs();
    this.bodyPush();
    this.checkHits();
    if (this.tr) this.trainingRefill();
    // caméra
    const tgt = clamp((this.p[0].x + this.p[1].x) / 2 - VIEW_W / 2, 0, STAGE_W - VIEW_W);
    this.camX += (tgt - this.camX) * 0.15;
    this.flow();
  }
  flow() {
    const [a, b] = this.p;
    if (this.tr) { // pas de manches ni de chrono en training
      if (this.phase === 'intro') {
        if (this.phaseT === 6) { this.announce('TRAINING', 60); AU.say('Training', 0.5, 1); }
        if (this.phaseT >= 50) { this.phase = 'fight'; this.phaseT = 0; }
      }
      return;
    }
    if (this.phase === 'intro') {
      if (this.phaseT === 10) { this.announce(this.round >= 3 && a.wins === 1 && b.wins === 1 ? 'FINAL ROUND' : 'ROUND ' + this.round, 80); AU.say(this.round >= 3 && a.wins === 1 && b.wins === 1 ? 'Final round' : 'Round ' + this.round); }
      if (this.phaseT === 95) { this.announce('FIGHT!', 50, { big: 1 }); AU.say('Fight!', 0.5, 1.1); AU.sfx('hitS'); this.shake = 8; }
      if (this.phaseT >= 120) { this.phase = 'fight'; this.phaseT = 0; }
      return;
    }
    if (this.phase === 'fight') {
      if (++this.tf >= 60) { this.tf = 0; if (this.timer > 0) this.timer--; }
      const ka = a.hp <= 0, kb = b.hp <= 0;
      if (ka || kb) {
        this.phase = 'ko'; this.phaseT = 0; this.slowmo = 75; this.flash = 10; this.flashCol = '#fff'; this.shake = 20;
        [a, b].forEach(f => { if (f.hp <= 0) { f.ko = true; if (f.st !== 'fall') { f.setSt('fall'); f.vy = -11; f.vx = -f.face * 6; f.y = Math.min(f.y, GROUND - 1); } } });
        this.announce(ka && kb ? 'DOUBLE K.O.' : 'K.O.', 140, { big: 1, red: 1 });
        AU.sfx('ko'); AU.say('Knockout.', 0.3, 0.7);
        this.winner = ka && kb ? -1 : ka ? 1 : 0;
      } else if (this.timer <= 0) {
        this.phase = 'ko'; this.phaseT = 0; this.announce('TIME OVER', 140, { big: 1 }); AU.say('Time over');
        this.winner = a.hp === b.hp ? -1 : a.hp > b.hp ? 0 : 1;
        if (this.winner >= 0) this.p[1 - this.winner].ko = true;
      }
      return;
    }
    if (this.phase === 'ko') {
      const settled = this.p.every(f => !f.air && f.st !== 'fall' && (f.st !== 'super' && f.st !== 'special'));
      if (this.phaseT > 90 && settled) {
        this.phase = 'roundEnd'; this.phaseT = 0;
        if (this.winner >= 0) {
          const w = this.p[this.winner], l = this.p[1 - this.winner];
          w.wins++; w.setSt('win'); w.vx = 0; if (l.st !== 'down') l.setSt('lose');
          const perfect = w.hp >= w.maxHp || w.hp >= 1000;
          let txt = this.opt.versus ? `${w.ch.name} GAGNE` : (this.winner === 0 ? 'YOU WIN' : 'YOU LOSE');
          this.announce(txt, 150, { big: 1 });
          if (perfect) setTimeout(() => AU.say('Perfect!'), 50), this.perfect = 60;
          else AU.say(this.opt.versus ? `${w.ch.name} wins` : (this.winner === 0 ? 'You win' : 'You lose'));
          AU.playTrack(this.winner === 0 || this.opt.versus ? TRACKS.win : null);
        } else { this.announce('MATCH NUL', 120, { big: 1 }); }
      }
      return;
    }
    if (this.phase === 'roundEnd') {
      if (this.perfect) this.perfect--;
      if (this.phaseT > 170) {
        const w = this.p.find(f => f.wins >= 2);
        if (w || this.round >= 5) { this.phase = 'done'; this.opt.onEnd(w ? w.side : (a.wins >= b.wins ? 0 : 1)); }
        else { this.round++; this.startRound(); AU.playTrack(arenaTrack(this.arena)); }
      }
    }
  }
  pauseItems() {
    if (!this.tr) return [['CONTINUER', 'resume'], ['LISTE DES COUPS', 'moves'], ['QUITTER', 'quit']];
    return [['CONTINUER', 'resume'], ['MANNEQUIN :  ◀ ' + DUMMY_NAMES[this.tr.dummy] + ' ▶', 'dummy'], ['JAUGE SUPER : ' + (this.tr.superInf ? 'INFINIE' : 'NORMALE'), 'super'],
      ['REPLACER LES ROBOTS', 'reset'], ['LISTE DES COUPS', 'moves'], ['CHANGER DE ROBOTS', 'select'], ['CHANGER D\'ARÈNE', 'arena'], ['QUITTER', 'quit']];
  }
  pauseLayout(n) { return n > 3 ? { y0: 160, dy: 44 } : { y0: 230, dy: 56 }; }
  updatePause() {
    const pd = pads[0], items = this.pauseItems(), n = items.length, L = this.pauseLayout(n);
    if (this.showMoves) { if (confirmPressed(pd) || tapQueue.length) this.showMoves = false; tapQueue = []; return; }
    if (pd.pressed.u) { this.pauseSel = (this.pauseSel + n - 1) % n; AU.sfx('move'); }
    if (pd.pressed.d) { this.pauseSel = (this.pauseSel + 1) % n; AU.sfx('move'); }
    let choose = confirmPressed(pd) ? this.pauseSel : -1, dir = 1;
    const act0 = items[this.pauseSel][1];
    if ((pd.pressed.l || pd.pressed.r) && (act0 === 'dummy' || act0 === 'super')) { choose = this.pauseSel; dir = pd.pressed.l ? -1 : 1; }
    for (const t of tapQueue) for (let i = 0; i < n; i++) if (inRect(t, W / 2 - 190, L.y0 + i * L.dy - 21, 380, 42)) { choose = i; this.pauseSel = i; }
    tapQueue = [];
    if (choose < 0) return;
    const act = items[choose][1];
    if (act === 'resume') this.paused = false;
    if (act === 'moves') this.showMoves = true;
    if (act === 'dummy') { const k = DUMMY_MODES.indexOf(this.tr.dummy); this.tr.dummy = DUMMY_MODES[(k + dir + DUMMY_MODES.length) % DUMMY_MODES.length]; AU.sfx('move'); }
    if (act === 'super') { this.tr.superInf = !this.tr.superInf; AU.sfx('move'); }
    if (act === 'reset') { this.resetTraining(); this.paused = false; AU.sfx('confirm'); }
    if (act === 'select') { this.paused = false; this.phase = 'done'; setScene(new SelectScene('training')); }
    if (act === 'arena') { this.paused = false; this.phase = 'done'; setScene(new ArenaSelectScene('training', st => startTraining(st), this.arenaIdx)); }
    if (act === 'quit') { this.paused = false; this.phase = 'done'; setScene(new TitleScene(true)); }
  }
  /* ---------- rendu ---------- */
  // caméra : centre (unités de jeu), zoom et angles cinématiques courants
  cinematic() {
    const sb = this.superFreeze > 0 ? this.superBy : null;
    const mid = (this.p[0].x + this.p[1].x) / 2;
    if (sb) { const k = easeOut(clamp((62 - this.superFreeze) / 10, 0, 1)); return { zoom: 1.24, orbit: 0.13 * sb.face * k, roll: 0.03 * sb.face * k, lift: 0.025 * k, fx: sb.x, fy: sb.hipY - 40 }; }
    const th = this.p.find(f => f.st === 'throw' || (f.st === 'super' && f.sp === 'moulinetLock'));
    if (th) { const w = Math.sin(th.t * 0.035); return { zoom: 1.1, orbit: 0.12 * th.face * w, roll: 0.02 * th.face * w, lift: 0.02, fx: th.x, fy: GROUND - 130 }; }
    if (this.phase === 'ko' && this.phaseT < 110) { const l = this.p.find(f => f.ko) || this.p[0]; return { zoom: 1.14, orbit: -0.1 * l.face, roll: -0.02 * l.face, lift: 0.03, fx: l.x, fy: l.hipY - 30 }; }
    if (this.phase === 'intro' && this.phaseT < 110) { const k = 1 - easeOut(clamp(this.phaseT / 110, 0, 1)); return { zoom: 1 + 0.12 * k, orbit: 0.11 * k, roll: 0, lift: 0.02 * k, fx: mid, fy: GROUND - 100 }; }
    return { zoom: 1, orbit: 0, roll: 0, lift: 0, fx: mid, fy: GROUND - 100 };
  }
  view() {
    const cam = this.cam || (this.cam = { zoom: 1, orbit: 0, roll: 0, lift: 0, fx: (this.p[0].x + this.p[1].x) / 2, fy: GROUND - 100 });
    const Z = ZOOM * cam.zoom;
    let cx = this.camX + VIEW_W / 2;
    if (cam.zoom > 1.001) cx = lerp(cx, cam.fx, clamp((cam.zoom - 1) / 0.22, 0, 1));
    return { cx, Z, orbit: cam.orbit, roll: cam.roll, lift: cam.lift, fx: cam.fx, fy: cam.fy };
  }
  draw() {
    const c = ctx;
    const sb = this.superFreeze > 0 ? this.superBy : null;
    if (R3) {
      const tg = this.cinematic(), cam = this.cam || (this.cam = { ...tg });
      for (const k in tg) cam[k] += (tg[k] - cam[k]) * (k === 'fx' || k === 'fy' ? 0.25 : 0.12);
    }
    const v = this.view();
    const sx = this.shake ? rand(-this.shake, this.shake) : 0, sy = this.shake ? rand(-this.shake, this.shake) * 0.6 : 0;
    if (R3) {
      const img = R3.renderFight(this, v);
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      c.drawImage(img, sx - 8, sy - 5, W + 16, H + 10);
    } else {
      c.save(); c.translate(sx, sy);
      this.stage.draw(c, this.camX, this.frame);
      if (sb) { const k = Math.min(1, (62 - this.superFreeze) / 8); c.fillStyle = `rgba(0,0,12,${0.72 * k})`; c.fillRect(-100, -100, W + 200, H + 200); }
      c.restore();
    }
    // lignes de vitesse pendant un super
    if (sb) {
      c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = hexA(sb.ch.accent, 0.22); c.lineWidth = 3;
      const sp = R3 ? R3.project(sb.x, sb.hipY - 40) : { x: W / 2 + (sb.x - v.cx) * v.Z, y: GY + (sb.hipY - 40 - GROUND) * v.Z };
      const cx = sp.x, cy = sp.y;
      for (let i = 0; i < 40; i++) { const a = rand(0, Math.PI * 2), r0 = rand(180, 300); c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * 1000, cy + Math.sin(a) * 1000); c.stroke(); }
      c.restore();
    }
    // monde (effets 2D alignés sur la 3D)
    c.save();
    c.translate(sx, sy);
    if (R3) { const m = R3.overlay(v); c.transform(m[0], m[1], m[2], m[3], m[4], m[5]); }
    else { c.translate(W / 2 - v.cx * v.Z, GY - GROUND * v.Z); c.scale(v.Z, v.Z); }
    if (!R3) {
      if (this.stage.wet) {
        c.save(); c.beginPath(); c.rect(this.camX - 100, FLOOR_Y, W + 200, H); c.clip();
        c.translate(0, GROUND * 2 + 4); c.scale(1, -1); c.globalAlpha = this.stage.wet;
        for (const f of this.p) drawRobot(c, f.ch, f.pose, f.x, f.hipY, f.face, 1, { skel: f.skel, noExtras: true });
        c.restore();
      }
      for (const f of this.p) {
        const k = clamp(1 - (GROUND - f.y) / 300, 0.3, 1);
        c.fillStyle = `rgba(0,0,0,${0.45 * k})`; c.beginPath(); c.ellipse(f.x, GROUND + 4, 44 * k * f.ch.scale, 9 * k, 0, 0, 7); c.fill();
      }
      const order = [...this.p].sort((a, b) => (a.st === 'super' || a.st === 'special' || a.st === 'attack' ? 1 : 0) - (b.st === 'super' || b.st === 'special' || b.st === 'attack' ? 1 : 0));
      for (const f of order) f.draw(c, this);
    }
    for (const f of this.p) if (f.beam) this.drawBeam(c, f);
    for (const pr of this.projs) pr.draw(c);
    FX.draw(c);
    c.restore();
    if (!R3 && this.stage.front) this.stage.front(c, this.camX, this.frame);
    if (this.flash > 0) { c.fillStyle = this.flashCol; c.globalAlpha = this.flash / 12; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
    if (sb) this.drawCutIn(c, sb);
    this.drawHUD(c);
    this.drawAnnounce(c);
    if (this.paused) this.drawPause(c);
  }
  drawBeam(c, f) {
    const b = f.beam, dir = f.face, len = 1400, t = b.t;
    const grow = Math.min(1, t / 6) * (t > 60 ? Math.max(0, 1 - (t - 60) / 10) : 1);
    const hgt = (46 + Math.sin(t * 0.9) * 8) * grow;
    c.save(); c.globalCompositeOperation = 'lighter';
    const x0 = b.x, x1 = b.x + dir * len;
    let g = c.createLinearGradient(0, b.y - hgt * 1.6, 0, b.y + hgt * 1.6);
    g.addColorStop(0, hexA(f.ch.accent, 0)); g.addColorStop(0.3, hexA(f.ch.accent, 0.6)); g.addColorStop(0.5, '#ffffff');
    g.addColorStop(0.7, hexA(f.ch.accent, 0.6)); g.addColorStop(1, hexA(f.ch.accent, 0));
    c.fillStyle = g; c.fillRect(Math.min(x0, x1), b.y - hgt * 1.6, len, hgt * 3.2);
    c.fillStyle = '#fff'; c.fillRect(Math.min(x0, x1), b.y - hgt * 0.25, len, hgt * 0.5);
    // ondulations
    c.strokeStyle = hexA(f.ch.proj.core, 0.8); c.lineWidth = 3;
    for (let k = 0; k < 2; k++) {
      c.beginPath();
      for (let i = 0; i <= 60; i++) { const x = x0 + dir * i * (len / 60), y = b.y + Math.sin(i * 0.6 + t * 0.8 + k * 3) * hgt * 0.8; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
    }
    // boule à la source
    g = c.createRadialGradient(x0, b.y, 0, x0, b.y, hgt * 2.4);
    g.addColorStop(0, '#fff'); g.addColorStop(0.4, hexA(f.ch.accent, 0.8)); g.addColorStop(1, hexA(f.ch.accent, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x0, b.y, hgt * 2.4, 0, 7); c.fill();
    c.restore();
  }
  drawCutIn(c, f) {
    // bandeau façon vidéo : gros plan du visage + traînées néon horizontales
    const t = 62 - this.superFreeze;
    const inK = easeOut(clamp(t / 9, 0, 1)), outK = clamp(this.superFreeze / 8, 0, 1), k = inK * outK;
    const left = f.side === 0, y = 150, h = 190;
    c.save(); c.globalAlpha = k;
    c.translate(0, y); c.transform(1, -0.06, 0, 1, 0, 0);
    c.fillStyle = '#000'; c.fillRect(0, -6, W, h + 12);
    let g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#05070d'); g.addColorStop(0.5, shade(f.ch.accent, -0.72)); g.addColorStop(1, '#05070d');
    c.fillStyle = g; c.fillRect(0, 0, W, h);
    c.save(); c.beginPath(); c.rect(0, 0, W, h); c.clip();
    // gros plan
    const hx = left ? lerp(-160, 230, inK) : lerp(W + 160, W - 230, inK);
    if (R3) R3.drawHead(c, f.ch, hx, h * 0.52, h * 1.75, left ? 1 : -1, -0.95);
    else drawRobotAny(c, f.ch, mkPose({ ...POSES.idle, lean: 6, hd: -8 }), hx, 40 + 190 * 1.9 * f.ch.scale, left ? 1 : -1, 1.9);
    // traînées néon (vert, cyan, rose, blanc) qui traversent le bandeau
    c.globalCompositeOperation = 'lighter';
    const r = seeded(7 + (f.side * 13));
    for (let i = 0; i < 46; i++) {
      const yy = r() * h, len = 80 + r() * 380, sp = 24 + r() * 40, th = 1 + r() * 4;
      const col = ['#3dff8a', '#3fd8ff', '#ff4fd8', '#ffffff', f.ch.accent][(r() * 5) | 0];
      const xx = ((r() * (W + len) + t * sp * (left ? 1 : -1)) % (W + len) + (W + len)) % (W + len) - len;
      const lg = c.createLinearGradient(xx, 0, xx + len, 0);
      lg.addColorStop(0, hexA(col, 0)); lg.addColorStop(0.5, hexA(col, 0.75)); lg.addColorStop(1, hexA(col, 0));
      c.fillStyle = lg; c.fillRect(xx, yy, len, th);
    }
    c.restore();
    c.strokeStyle = hexA(f.ch.accent, 0.9); c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(W, 0); c.moveTo(0, h); c.lineTo(W, h); c.stroke();
    c.restore();
    c.save(); c.globalAlpha = k;
    const tx = left ? lerp(W + 300, W - 50, inK) : lerp(-300, 50, inK);
    txt('SUPER', tx, y + 46, 20, { align: left ? 'right' : 'left', color: '#fff', stroke: '#000', sw: 5, font: FONT_BIG, italic: true });
    bigTxt(f.ch.supName, tx, y + 104, 42, { align: left ? 'right' : 'left' });
    c.restore();
  }
  /* HUD façon vidéo : longues barres biseautées, chrono central, pastilles de manches */
  drawHUD(c) {
    const [a, b] = this.p;
    const top = 16, bh = 24, inner = 48, outer = 92;
    const bar = (f, left) => {
      c.save();
      if (!left) { c.translate(W, 0); c.scale(-1, 1); }
      const x0 = outer, x1 = W / 2 - inner, sl = 12;
      const path = () => { c.beginPath(); c.moveTo(x0, top); c.lineTo(x1 + sl, top); c.lineTo(x1, top + bh); c.lineTo(x0 - sl, top + bh); c.closePath(); };
      path(); c.fillStyle = 'rgba(8,10,16,.72)'; c.fill();
      c.save(); path(); c.clip();
      const len = x1 + sl - (x0 - sl);
      const lag = len * f.dispHp / 1000, cur = len * f.hp / 1000, xe = x1 + sl;
      c.fillStyle = '#d61f12'; c.fillRect(xe - lag, top, lag, bh);
      const low = f.hp < 250 && this.frame % 30 < 15;
      let g = c.createLinearGradient(x0, 0, xe, 0);
      if (low) { g.addColorStop(0, '#ff9a8a'); g.addColorStop(1, '#ff2a12'); }
      else { g.addColorStop(0, '#ffe94a'); g.addColorStop(0.55, '#ffc21a'); g.addColorStop(1, '#ff7a12'); }
      c.fillStyle = g; c.fillRect(xe - cur, top, cur, bh);
      g = c.createLinearGradient(0, top, 0, top + bh);
      g.addColorStop(0, 'rgba(255,255,255,.45)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.25)');
      c.fillStyle = g; c.fillRect(xe - cur, top, cur, bh);
      c.restore();
      path(); c.lineWidth = 2.5; c.strokeStyle = '#d9dee6'; c.stroke();
      c.lineWidth = 1; c.strokeStyle = '#000'; c.stroke();
      // barre fine (énergie super)
      const y2 = top + bh + 4, h2 = 6, l2 = 250, xa = x1 - 6 - l2, xb = x1 - 6;
      c.beginPath(); c.moveTo(xa, y2); c.lineTo(xb + 5, y2); c.lineTo(xb, y2 + h2); c.lineTo(xa - 5, y2 + h2); c.closePath();
      c.fillStyle = 'rgba(8,10,16,.7)'; c.fill();
      const mw = l2 * f.meter / 100;
      g = c.createLinearGradient(xb - mw, 0, xb, 0); g.addColorStop(0, '#1a6cff'); g.addColorStop(1, '#5ad8ff');
      c.fillStyle = f.meter >= 100 && this.frame % 16 < 8 ? '#ffffff' : g; c.fillRect(xb + 2 - mw, y2 + 1, mw, h2 - 2);
      c.strokeStyle = '#9aa4b2'; c.lineWidth = 1; c.stroke();
      c.restore();
    };
    bar(a, true); bar(b, false);
    // portraits détourés aux coins
    c.drawImage(headShot(a.ch, 86, 1), -6, -8);
    c.drawImage(headShot(b.ch, 86, -1), W - 80, -8);
    const name = (s, x, al) => {
      txt(s, x + 2, 62, 20, { font: FONT_BIG, align: al, color: 'rgba(0,0,0,.7)' });
      txt(s, x, 60, 20, { font: FONT_BIG, align: al, color: '#ffffff', stroke: '#0b0d12', sw: 4 });
    };
    name(a.ch.name, 96, 'left'); name(b.ch.name, W - 96, 'right');
    // chrono
    c.beginPath(); c.moveTo(W / 2 - 50, top - 4); c.lineTo(W / 2 + 50, top - 4); c.lineTo(W / 2 + 34, top + 46); c.lineTo(W / 2 - 34, top + 46); c.closePath();
    c.fillStyle = 'rgba(8,10,16,.55)'; c.fill(); c.strokeStyle = '#c9d0da'; c.lineWidth = 2; c.stroke();
    txt(this.tr ? '∞' : String(this.timer).padStart(2, '0'), W / 2, top + 22, 44, { font: FONT_BIG, grad: ['#ffffff', '#fff2c0', '#ffd25a'], stroke: '#14100a', sw: 6 });
    if (this.tr) this.drawTrainingPanel(c);
    // pastilles de manches gagnées
    for (let i = 0; i < (this.tr ? 0 : 2); i++) {
      const dot = (x, on) => {
        c.beginPath(); c.arc(x, 76, 8, 0, 7); c.fillStyle = on ? '#ffc21a' : 'rgba(20,22,28,.8)'; c.fill();
        if (on) { c.save(); c.shadowColor = '#ffb000'; c.shadowBlur = 12; c.fill(); c.restore(); }
        c.lineWidth = 2; c.strokeStyle = '#b9c0cb'; c.stroke();
      };
      dot(W / 2 - 74 + i * 22 * -1 + 22, a.wins > 1 - i);
      dot(W / 2 + 52 + i * 22, b.wins > i);
    }
    // jauges du bas
    const meter = (f, left) => {
      c.save();
      if (!left) { c.translate(W, 0); c.scale(-1, 1); }
      const x0 = 62, y = H - 34, l = 250, h = 16, seg = 3;
      for (let i = 0; i < seg; i++) {
        const sx0 = x0 + i * (l / seg), sx1 = sx0 + l / seg - 6;
        c.beginPath(); c.moveTo(sx0 + 6, y); c.lineTo(sx1 + 6, y); c.lineTo(sx1, y + h); c.lineTo(sx0, y + h); c.closePath();
        c.fillStyle = 'rgba(8,10,16,.72)'; c.fill();
        const fill = clamp(f.meter / 100 * seg - i, 0, 1);
        if (fill > 0) {
          c.save(); c.clip();
          const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#9ff4ff'); g.addColorStop(1, '#13a9e0');
          c.fillStyle = f.meter >= 100 && this.frame % 16 < 8 ? '#fff' : g; c.fillRect(sx0, y, (sx1 + 6 - sx0) * fill, h); c.restore();
        }
        c.lineWidth = 1.5; c.strokeStyle = '#c9d0da'; c.stroke();
      }
      c.restore();
      const nx = left ? 40 : W - 40;
      txt(f.meter >= 100 ? '1' : '0', nx, H - 30, 38, { font: FONT_BIG, italic: true, color: left ? '#5ad1ff' : '#ff4a4a', stroke: '#0b0d12', sw: 5 });
      if (f.meter >= 100) txt('SUPER', left ? 312 : W - 312, H - 46, 15, { font: FONT_BIG, align: left ? 'right' : 'left', color: this.frame % 16 < 8 ? '#ff6a3a' : '#ffd25a', stroke: '#1a0500', sw: 4 });
    };
    meter(a, true); meter(b, false);
    // nom de la prise en cours
    if (this.moveTxt) {
      const m = this.moveTxt, k = easeOut(clamp(m.t / 8, 0, 1)), al = m.t > 65 ? (80 - m.t) / 15 : 1, left = m.side === 0;
      const x = left ? lerp(-200, 40, k) : lerp(W + 200, W - 40, k);
      txt(m.name, x, 300, 34, { font: FONT_BIG, italic: true, align: left ? 'left' : 'right', grad: ['#ffffff', '#ffe9a0', m.col], stroke: '#0b0d12', sw: 7, glow: m.col, blur: 16, alpha: al });
    }
    // combos
    for (let i = 0; i < 2; i++) {
      const cb = this.combo[i]; if (!cb) continue;
      const x = i === 0 ? 34 : W - 34, k = Math.min(1, cb.t / 5), al = cb.t > 55 ? (70 - cb.t) / 15 : 1;
      txt(cb.n + '', x, 200, 64 * (1.4 - 0.4 * k), { font: FONT_BIG, align: i ? 'right' : 'left', color: '#ffffff', stroke: '#0b0d12', sw: 7, alpha: al });
      txt('HITS', x, 244, 22, { font: FONT_BIG, align: i ? 'right' : 'left', color: '#ffffff', stroke: '#0b0d12', sw: 5, alpha: al });
    }
  }
  drawTrainingPanel(c) {
    const T = this.tr, x = W / 2 - 150, y = 92, w = 300, h = 58;
    c.fillStyle = 'rgba(5,10,25,.72)'; c.fillRect(x, y, w, h); c.strokeStyle = 'rgba(155,231,255,.6)'; c.lineWidth = 1.5; c.strokeRect(x, y, w, h);
    const cell = (lab, val, cx, col) => { txt(lab, cx, y + 15, 7, { color: '#9be7ff' }); txt(String(val), cx, y + 38, 18, { font: FONT_BIG, color: col || '#fff', stroke: '#000', sw: 4 }); };
    cell('DEGATS', T.last, x + 40); cell('COMBO', T.total, x + 112, '#ffd23a'); cell('COUPS', T.hits, x + 180); cell('RECORD', T.maxDmg, x + 252, '#ff7a5a');
    txt('MANNEQUIN : ' + DUMMY_NAMES[T.dummy] + '   ·   ' + (isTouch ? 'II' : 'ECHAP') + ' : menu training', W / 2, y + h + 12, 8, { color: '#ccc', stroke: '#000', sw: 3 });
  }
  drawAnnounce(c) {
    const A = this.ann; if (!A || A.t > A.dur) return;
    const k = A.t < 8 ? easeOut(A.t / 8) : 1, out = A.t > A.dur - 10 ? (A.dur - A.t) / 10 : 1;
    const y = H / 2 - 20;
    c.save(); c.globalAlpha = Math.max(0, out);
    if (A.text.startsWith('ROUND') || A.text === 'FINAL ROUND') {
      // éclairs néon + trait lumineux (comme la vidéo)
      c.save(); c.globalCompositeOperation = 'lighter';
      let g = c.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(180,60,255,0)'); g.addColorStop(0.3, 'rgba(200,90,255,.9)'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.7, 'rgba(80,200,255,.9)'); g.addColorStop(1, 'rgba(80,200,255,0)');
      c.fillStyle = g; c.fillRect(0, y - 2, W * k, 4);
      c.shadowBlur = 16; c.lineWidth = 3;
      for (const [col, ph] of [['#d05cff', 0], ['#45d8ff', 1]]) {
        c.strokeStyle = col; c.shadowColor = col; c.beginPath();
        const r = seeded(((this.frame / 3) | 0) + ph * 99);
        for (let x = 140; x <= W - 140; x += 36) c.lineTo(x, y + (r() - 0.5) * 110);
        c.stroke();
      }
      c.restore();
      const size = 92 * (1.5 - 0.5 * k);
      txt(A.text, W / 2 + 4, y + 6, size, { font: FONT_BIG, italic: true, color: 'rgba(0,0,0,.5)' });
      txt(A.text, W / 2, y, size, { font: FONT_BIG, italic: true, grad: ['#ffffff', '#eef2ff', '#b8c4e0'], stroke: '#141c3a', sw: 9, glow: '#7a6cff', blur: 18 });
    } else if (A.red) {
      // K.O. pixélisé orange (comme la vidéo)
      const size = 100 * (1.5 - 0.5 * k);
      c.translate(W / 2, y); c.transform(1, 0, -0.18, 1, 0, 0);
      txt(A.text, 6, 8, size, { font: FONT_PIX, color: 'rgba(0,0,0,.55)' });
      txt(A.text, 0, 0, size, { font: FONT_PIX, grad: ['#fff4b0', '#ffc21a', '#ff6a12', '#c42a00'], stroke: '#3a0a00', sw: 12, glow: '#ff5a00', blur: 26 });
    } else {
      bigTxt(A.text, W / 2, y, 96 * (1.5 - 0.5 * k), { grad: ['#fff6c0', '#ffd23a', '#ff9a12', '#d65a00'], stroke: '#5a1a00', glow: '#ff9d1c', blur: 22 });
    }
    c.restore();
    if (this.perfect) bigTxt('PERFECT', W / 2, H / 2 + 60, 52, { grad: ['#ffffff', '#9be7ff', '#3fa9ff'], stroke: '#001a3a' });
  }
  drawPause(c) {
    c.fillStyle = 'rgba(0,0,10,.75)'; c.fillRect(0, 0, W, H);
    if (this.showMoves) return drawMoveList(c, this.p[0].ch, this.opt.versus ? this.p[1].ch : null);
    const items = this.pauseItems(), L = this.pauseLayout(items.length);
    bigTxt(this.tr ? 'TRAINING' : 'PAUSE', W / 2, this.tr ? 96 : 150, this.tr ? 54 : 64);
    items.forEach(([s], i) => {
      const sel = this.pauseSel === i, y = L.y0 + i * L.dy;
      if (sel) { c.fillStyle = 'rgba(255,210,58,.15)'; c.fillRect(W / 2 - 190, y - 21, 380, 42); }
      txt((sel ? '▶ ' : '') + s, W / 2, y, 15, { color: sel ? '#ffd23a' : '#ccc', stroke: '#000', sw: 4 });
    });
  }
}
const DUMMY_MODES = ['stand', 'crouch', 'jump', 'guard', 'cpu'];
const DUMMY_NAMES = { stand: 'DEBOUT', crouch: 'ACCROUPI', jump: 'SAUTE', guard: 'GARDE', cpu: 'CPU (RIPOSTE)' };
// hurtbox même en chute / invincible (pour les supers)
Fighter.prototype.hurtboxAny = function () { return this.hurtbox(true); };

function moveRows(ch) {
  const mv = ch.move;
  const motion = mv === 'uppercut' ? '→ ↓ ↘ + P' : mv === 'flip' ? '→ ↓ ↘ + K' : mv === 'rush' ? '↓ ↙ ← + P' : '↓ ↙ ← + K';
  return [
    [ch.proj.name, '↓ ↘ → + P', 'SP1'],
    [ch.moveName, motion, 'SP2'],
    [ch.supName + ' (SUPER)', '↓↘→ ↓↘→ + P', 'SUPER']
  ];
}
// liste complète : spéciaux + projection + coups de pied de boxe française / MMA
function moveRowsFull(ch) {
  return moveRows(ch).concat([
    [(ch.throwName || 'PROJECTION') + ' (prise)', '→ ou ← + HP au contact', ''],
    ['CHASSÉ LATÉRAL', '→ + LK', ''],
    ['COUP DE PIED RETOURNÉ', '→ + HK', ''],
    ['GENOU SAUTÉ', '→ + HP (à distance)', ''],
    ['FOUETTÉ / HIGH KICK / LOW KICK / BALAYAGE', 'LK / HK / ↓+LK / ↓+HK', '']
  ]).concat(ch.backElbow ? [['COUDE RETOURNÉ', 'LP, LP, HP (rapide)', '']] : []);
}
function drawMoveList(c, ch1, ch2) {
  const list = ch2 ? [ch1, ch2] : [ch1];
  list.forEach((ch, i) => {
    const x0 = list.length === 1 ? W / 2 - 330 : 20 + i * 470, w = list.length === 1 ? 660 : 450;
    c.fillStyle = 'rgba(10,14,30,.92)'; c.fillRect(x0, 56, w, 410); c.strokeStyle = ch.accent; c.lineWidth = 2; c.strokeRect(x0, 56, w, 410);
    c.drawImage(portrait(ch, 56), x0 + 12, 66);
    txt(ch.name, x0 + 80, 84, 16, { align: 'left', color: ch.accent });
    txt(ch.maker, x0 + 80, 108, 10, { align: 'left', color: '#aaa' });
    const rows = moveRowsFull(ch), dy = Math.min(40, 300 / Math.max(1, rows.length - 1));
    rows.forEach((r, j) => {
      const y = 146 + j * dy;
      txt(r[0], x0 + 16, y, 10, { align: 'left', color: j < 3 ? '#ffd23a' : '#9be7ff' });
      txt(r[1], x0 + 16, y + 17, 13, { align: 'left', color: '#fff', font: FONT_BIG });
      if (r[2]) txt('ou ' + r[2], x0 + w - 16, y + 17, 9, { align: 'right', color: '#9be7ff' });
    });
  });
  txt('La SUPER nécessite la jauge pleine', W / 2, 482, 10, { color: '#ff9de0' });
  txt('Appuyez pour revenir', W / 2, 506, 10, { color: '#aaa', alpha: (gFrame % 60 < 40) ? 1 : 0.3 });
}

/* =================== ÉCRAN TITRE =================== */
const TITLE_ITEMS = [
  ['ARCADE  (1 JOUEUR)', 'arcade', 'Affrontez tous les robots'],
  ['VERSUS  (2 JOUEURS)', 'versus', 'Joueur contre joueur'],
  ['TOURNOI  (8 ROBOTS)', 'tournament', 'Quarts, demies, finale'],
  ['TRAINING', 'training', 'Entraînement libre'],
  ['COMMANDES', 'controls', '']
];
const TITLE_Y0 = 300, TITLE_DY = 40;
class TitleScene {
  constructor(skipPress) {
    this.t = 0; this.stage = skipPress ? 'menu' : 'press'; this.sel = 0; this.vi = 0;
    this.vids = [document.getElementById('vid1'), document.getElementById('vid2')];
    this.vids.forEach((v, i) => { v.onended = () => { this.vi = 1 - i; this.play(); }; });
    this.play();
    setTouchControls(false); mergeKeyboards = true;
    AU.playTrack(TRACKS.title);
  }
  play() { const v = this.vids[this.vi]; try { v.currentTime = 0; const p = v.play(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
  leave() { this.vids.forEach(v => { v.pause(); v.onended = null; }); }
  update() {
    this.t++;
    const pd = pads[0], taps = tapQueue.splice(0);
    const v = this.vids[this.vi]; if (v.paused && this.t % 60 === 0) this.play();
    if (this.stage === 'press') {
      if (confirmPressed(pd) || pads[1].pressed.start || taps.length || anyKeyPressed) { this.stage = 'menu'; AU.sfx('coin'); AU.say('Robot Fighter 2', 0.35, 0.8); }
      return;
    }
    const items = TITLE_ITEMS.length;
    if (pd.pressed.u) { this.sel = (this.sel + items - 1) % items; AU.sfx('move'); }
    if (pd.pressed.d) { this.sel = (this.sel + 1) % items; AU.sfx('move'); }
    let ch = confirmPressed(pd) ? this.sel : -1;
    for (const t of taps) for (let i = 0; i < items; i++) if (inRect(t, W / 2 - 200, TITLE_Y0 + i * TITLE_DY - 18, 400, 36)) { if (this.sel === i || isTouch) ch = i; this.sel = i; }
    if (ch >= 0) {
      AU.sfx('confirm'); this.leave();
      const mode = TITLE_ITEMS[ch][1];
      if (mode === 'controls') setScene(new ControlsScene());
      else { GAME.mode = mode; setScene(new SelectScene(mode)); }
    }
  }
  draw() {
    const c = ctx, v = this.vids[this.vi];
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    if (v.readyState >= 2) { try { c.drawImage(v, 0, 0, W, H); } catch (e) { } }
    else { STAGES[0].draw(c, (Math.sin(this.t * 0.005) * 0.5 + 0.5) * (STAGE_W - W), this.t); }
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(0.5, 'rgba(0,0,0,.15)'); g.addColorStop(1, 'rgba(0,0,0,.8)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // logo
    const bounce = Math.sin(this.t * 0.05) * 3;
    txt('ROBOT', W / 2 - 60, 92 + bounce, 70, { font: FONT_BIG, italic: true, grad: ['#ffffff', '#cfe3ff', '#7aa6d8', '#3a5a88'], stroke: '#061226', sw: 10 });
    bigTxt('FIGHTER', W / 2 + 10, 168 + bounce, 92, { glow: '#ff5a00', blur: 26 });
    txt('II', W / 2 + 262, 150 + bounce, 70, { font: FONT_BIG, italic: true, grad: ['#ffd0d0', '#ff3a3a', '#8a0000'], stroke: '#2a0000', sw: 9, glow: '#ff0000', blur: 20 });
    txt('THE HUMANOID WARRIORS', W / 2, 228, 14, { color: '#9be7ff', stroke: '#000', sw: 5, glow: '#3fa9ff' });
    if (this.stage === 'press') {
      if (this.t % 60 < 40) txt('PRESS START', W / 2, 380, 24, { color: '#fff', stroke: '#000', sw: 6, glow: '#ffd23a', blur: 14 });
      txt(isTouch ? 'Touchez l\'écran pour commencer' : 'Appuyez sur ENTRÉE', W / 2, 420, 10, { color: '#ccc', stroke: '#000', sw: 4 });
    } else {
      TITLE_ITEMS.forEach(([s, , sub], i) => {
        const y = TITLE_Y0 + i * TITLE_DY, sel = this.sel === i;
        if (sel) { c.fillStyle = 'rgba(255,210,58,.18)'; c.fillRect(W / 2 - 200, y - 18, 400, 36); c.strokeStyle = '#ffd23a'; c.strokeRect(W / 2 - 200, y - 18, 400, 36); }
        txt(s, W / 2, y, 16, { color: sel ? '#ffd23a' : '#fff', stroke: '#000', sw: 5 });
        if (sel && sub) txt(sub, W / 2 + 214, y, 8, { align: 'left', color: '#9be7ff', stroke: '#000', sw: 3 });
      });
    }
    txt('© 2026 WORLD ROBOT LEAGUE', W / 2, H - 18, 9, { color: '#888' });
    txt('M : musique', W - 12, H - 18, 8, { align: 'right', color: '#666' });
  }
}

/* =================== COMMANDES =================== */
class ControlsScene {
  constructor() { this.t = 0; }
  update() { this.t++; const taps = tapQueue.splice(0); if (this.t > 10 && (confirmPressed(pads[0]) || escPressed || taps.length)) { AU.sfx('select'); setScene(new TitleScene(true)); } }
  draw() {
    const c = ctx; drawGridBg(c, this.t, '#3fa9ff');
    bigTxt('COMMANDES', W / 2, 52, 46);
    const col = (x, title, rows, color) => {
      c.fillStyle = 'rgba(5,10,25,.85)'; c.fillRect(x, 92, 290, 330); c.strokeStyle = color; c.lineWidth = 2; c.strokeRect(x, 92, 290, 330);
      txt(title, x + 145, 114, 12, { color });
      rows.forEach((r, i) => { txt(r[0], x + 16, 150 + i * 27, 9, { align: 'left', color: '#aaa' }); txt(r[1], x + 274, 150 + i * 27, 9, { align: 'right', color: '#fff' }); });
    };
    col(20, 'JOUEUR 1', [['Déplacement', 'W A S D'], ['Poing léger', 'F / ESPACE'], ['Poing fort', 'G'], ['Pied léger', 'V'], ['Pied fort', 'B'], ['Spécial 1', 'R'], ['Spécial 2', 'T'], ['SUPER', 'Y'], ['Pause', 'ÉCHAP']], '#ff5a5a');
    col(335, 'JOUEUR 2', [['Déplacement', 'FLÈCHES'], ['Poing léger', 'K'], ['Poing fort', 'L'], ['Pied léger', ','], ['Pied fort', '.'], ['Spécial 1', 'I'], ['Spécial 2', 'O'], ['SUPER', 'P'], ['(En 1 joueur', 'les 2 marchent)']], '#4fb4ff');
    col(650, 'MANETTE / TACTILE', [['Déplacement', 'Croix / stick'], ['Poings', 'X / Y'], ['Pieds', 'A / B'], ['Spéciaux', 'LB / RB'], ['SUPER', 'LT / RT'], ['Pause', 'START'], ['', ''], ['Mobile', 'joystick +'], ['', 'boutons à l\'écran']], '#ffd23a');
    txt('Sauter : HAUT  ·  S\'accroupir : BAS  ·  Garde : reculer', W / 2, 446, 10, { color: '#9be7ff' });
    txt('Manipulations : ↓↘→+P  (boule)   →↓↘+P (dragon)   ↓↙←+K/P   ↓↘→↓↘→+P (SUPER)', W / 2, 466, 9, { color: '#ffd23a' });
    txt('Prise : →/← + HP au contact   ·   Chassé : → + LK   ·   Retourné : → + HK   ·   Genou sauté : → + HP', W / 2, 486, 9, { color: '#9be7ff' });
    txt('Appuyez pour revenir', W / 2, 510, 10, { color: '#888', alpha: this.t % 60 < 40 ? 1 : 0.3 });
  }
}
function drawGridBg(c, t, col) {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#05060f'); g.addColorStop(1, '#0d1430');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.strokeStyle = hexA(col, 0.12); c.lineWidth = 1;
  for (let x = -(t % 40); x < W; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = -(t * 0.5 % 40); y < H; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
}

/* =================== MARIONNETTES DE MENU =================== */
// Enchaînements de poses joués par les robots dans les menus (entrée, démonstrations, victoire).
// Clé : [pose (nom de POSES ou objet), durée en frames pour l'atteindre, options {yaw, dx, dy, spin, fx}]
const PUPPET_SEQ = {
  enter: [['crouch', 0, { yaw: -1.3, dx: -40 }], ['idle', 14, { yaw: -0.42 }], ['lp', 5, { fx: 'whiff' }], ['idle', 6], ['lp', 5, { fx: 'whiff' }], ['hp', 6, { fx: 'whiffH' }], ['idle', 14]],
  combo: [['lp', 5, { fx: 'whiff' }], ['idle', 5], ['lp', 5, { fx: 'whiff' }], ['hp', 6, { fx: 'whiffH' }], ['idle', 6], ['hk', 9, { fx: 'whiffH' }], ['hk', 8], ['idle', 12]],
  kick: [['kChamber', 5], ['fouette', 4, { fx: 'whiff' }], ['fouette', 6], ['kChamber', 5], ['idle', 8], ['rkChamber', 6], ['rkHigh', 6, { fx: 'whiffH' }], ['rkHigh', 8], ['rkChamber', 7], ['idle', 10]],
  backkick: [['teepChamber', 5], ['teep', 4, { fx: 'whiff' }], ['teep', 6], ['idle', 8], ['backTurn', 6, { spin: 2.2 }], ['backKick', 5, { spin: 3.14, fx: 'whiffH' }], ['backKick', 8, { spin: 3.14 }], ['backTurn', 8, { spin: 4.6 }], ['idle', 9, { spin: 6.28 }]],
  contort: [[{ ...POSES.idle }, 2], [{ ...POSES.idle, headSpin: Math.PI * 2 }, 22], [{ ...POSES.liftOver }, 10], [{ ...POSES.liftOver, twist: Math.PI * 4, headSpin: -Math.PI * 2 }, 40, { fx: 'charge' }], [{ ...POSES.contort }, 14, { fx: 'burst' }], [{ ...POSES.contort, twist: Math.PI }, 12], ['idle', 18]],
  special: [['projWind', 14, { fx: 'charge' }], ['proj', 6, { fx: 'fire' }], ['proj', 24], ['idle', 14]],
  uppercut: [['crouch', 8, { fx: 'charge' }], ['upper', 9, { dy: 70, fx: 'rise' }], ['upper', 9, { dy: 80 }], ['jump', 10, { dy: 25 }], ['crouch', 6], ['idle', 10]],
  flip: [['crouch', 8, { fx: 'charge' }], [{ ...POSES.flip, rot: -170 }, 9, { dy: 70, fx: 'rise' }], [{ ...POSES.flip, rot: -350 }, 9, { dy: 55 }], ['crouch', 8], ['idle', 10]],
  cyclone: [['cyWind', 10, { fx: 'charge' }], ['cyLift', 5, { dy: 22, fx: 'rise' }], ['cyCres1', 5, { dy: 48 }], ['cyAir', 6, { dy: 72 }], ['cyKick', 5, { dy: 78, fx: 'whiffH' }], ['cyKick', 4, { dy: 74 }],
    ['cyFall', 6, { dy: 36 }], ['cyLand', 6, { dy: 0 }], ['cyLand', 8], [{ ...POSES.idle, spin: Math.PI * 2 }, 14]],
  spin: [['jump', 8, { dy: 30, fx: 'charge' }], ['spin', 6, { dy: 45, spin: 0, fx: 'rise' }], ['spin', 30, { dy: 45, spin: Math.PI * 6 }], ['jump', 6, { dy: 15 }], ['idle', 10]],
  rush: [['rushWind', 10, { fx: 'charge' }], ['rush', 7, { dx: 55, fx: 'rise' }], ['rush', 8, { dx: 65 }], ['idle', 16, { dx: 0 }]],
  taunt: [['taunt', 14], ['win2', 12], ['taunt', 12], ['idle', 14]],
  confirm: [['crouch', 7, { fx: 'charge' }], ['upper', 9, { dy: 55, fx: 'burst' }], ['win', 14], ['win', 30]]
};
class Puppet {
  constructor() { this.seq = null; this.t = 0; this.idleT = 0; this.hold = null; this.onFx = null; this.loopFrom = null; }
  // name : clé de PUPPET_SEQ ou séquence ; hold : enchaînement suivant ; loopFrom : index d'où reboucler à la fin
  play(name, hold, loopFrom) {
    const seq = Array.isArray(name) ? name : PUPPET_SEQ[name]; if (!seq) return;
    this.seq = seq; this.name = name; this.t = 0; this.hold = hold || null; this.loopFrom = loopFrom == null ? null : loopFrom; this.fired = new Set(); this.idleT = 0;
    this.times = motionTimes(seq);
  }
  // animation personnelle du robot (js/motions) : 'intro' (repli : enter) ou 'victory' (repli : confirm), la victoire reboucle
  playMotion(ch, kind) {
    const seq = motionOf(ch, kind), m = MOTIONS[(ch.base || ch).id];
    if (kind === 'intro') return this.play(seq || 'enter');
    if (seq) this.play(seq, null, m.victoryLoop != null ? m.victoryLoop : Math.max(0, seq.length - 2));
    else this.play('confirm', 'taunt');
  }
  get busy() { return !!this.seq; }
  update() {
    this.idleT++;
    if (!this.seq) return;
    this.t++;
    this.times.forEach((tt, i) => { const o = this.seq[i][2]; if (o && (o.fx || o.say || o.sfx) && !this.fired.has(i) && this.t >= tt - this.seq[i][1]) { this.fired.add(i); this.onFx && this.onFx(o, this.state()); } });
    if (this.t > this.times[this.times.length - 1]) {
      if (this.loopFrom != null) { this.t = this.loopFrom ? this.times[this.loopFrom - 1] : 0; for (let i = this.loopFrom; i < this.seq.length; i++) this.fired.delete(i); return; }
      const h = this.hold; this.seq = null; this.idleT = 0; if (h) this.play(h, h);
    }
  }
  state() {
    const breathe = Math.sin(performance.now() / 1000 * 4.2) * 2.5;
    const idle = { ...POSES.idle, fe: POSES.idle.fe + breathe, be: POSES.idle.be - breathe, fk: POSES.idle.fk + breathe, lean: POSES.idle.lean + breathe * 0.3 };
    if (!this.seq) return { pose: idle, yaw: -0.42, dx: 0, dy: 0 };
    return motionSample(this.seq, this.t, idle, this.times);
  }
}
// effets visuels des marionnettes (coordonnées écran) : ch, x/pied, échelle, sens
function puppetFx(kind, ch, x, footY, sc, face) {
  const hx = x + face * 45 * sc, hy = footY - 125 * sc;
  if (kind === 'whiff') AU.sfx('whiff');
  else if (kind === 'whiffH') AU.sfx('whiffH');
  else if (kind === 'charge') { AU.sfx('upper'); for (let i = 0; i < 26; i++) FX.add({ type: 'glow', x: hx + rand(-110, 110), y: hy + rand(-110, 110), size: rand(6, 12), life: 18, max: 18, col: ch.accent, target: { x: hx, y: hy } }); }
  else if (kind === 'fire') {
    AU.sfx('proj');
    for (let i = 0; i < 22; i++) FX.add({ type: 'glow', x: hx + face * i * 9, y: hy + rand(-8, 8), vx: face * rand(6, 11), size: 30 - i, life: 26, max: 26, col: ch.proj.color, core: '#fff' });
    FX.add({ type: 'ring', x: hx, y: hy, size: 90, life: 14, max: 14, col: ch.proj.color, flat: 1.3 });
  }
  else if (kind === 'rise') { AU.sfx('rush'); for (let i = 0; i < 18; i++) FX.add({ type: 'spark', x: x + rand(-30, 30) * sc, y: footY - rand(0, 160) * sc, vx: rand(-2, 2), vy: rand(-12, -5), size: 2.5, life: 16, max: 16, col: ch.accent, len: 3 }); dust(x, footY, 10); }
  else if (kind === 'burst') { AU.sfx('hitS'); explosion(x, footY - 110 * sc, ch.accent, 1.3); }
}
function sayName(ch) { AU.say(ch.name.replace('02', 'zero two').replace(/\b([HGR])1\b/, '$1 one').replace('ASIMOV', 'Asimov'), 0.6, 0.95); }
const DEMOS = ch => (ch.id === 'atlas' ? ['contort'] : []).concat(['combo', 'special', ch.move === 'uppercut' ? 'uppercut' : ch.move, 'kick', 'backkick', 'taunt']);

/* =================== SÉLECTION =================== */
const SEL_COLS = 5;
class SelectScene {
  constructor(mode) {
    this.mode = mode; this.t = 0; this.cur = [0, 1]; this.done = [false, !this.two];
    this.out = 0; mergeKeyboards = mode !== 'versus'; setTouchControls(false); this.lock = 0;
    this.skin = [0, 0]; this.skinSel = [false, false]; this.plock = [0, 0];
    AU.playTrack(TRACKS.select);
    this.anim = 0; this.shake = 0; this.flash = 0; this.demoI = [0, 0];
    FX.clear();
    this.pup = [new Puppet(), new Puppet()];
    this.pup.forEach((pp, p) => { pp.onFx = o => this.fx(p, o); pp.playMotion(this.chOf(p), 'intro'); });
  }
  get two() { return this.mode === 'versus' || this.mode === 'training'; } // deux robots à choisir
  previewX(p) { return p === 0 ? 150 : W - 150; }
  chOf(p) { return withSkin(ROSTER[this.cur[p]], this.skin[p]); }
  fx(p, o) {
    const ch = this.chOf(p), face = p === 0 ? 1 : -1;
    motionFire(o, ch, this.previewX(p), 455, 1.55, face);
    if (o.fx === 'burst' || o.shake) { this.shake = o.shake || 12; this.flash = 8; }
  }
  demo(p) {
    const ch = this.chOf(p);
    if (this.done[p]) return this.pup[p].playMotion(ch, 'victory');
    const list = DEMOS(ch); this.pup[p].play(list[this.demoI[p]++ % list.length]);
  }
  tile(i) { const C = SEL_COLS, n = ROSTER.length, row = (i / C) | 0, inRow = Math.min(C, n - row * C), col = i % C; return { x: W / 2 + (col - (inRow - 1) / 2) * 82, y: 322 + row * 84, s: 76 }; }
  update() {
    this.t++; this.anim++;
    FX.update(); this.pup.forEach(pp => pp.update());
    if (this.shake) this.shake *= 0.85; if (this.shake < 0.4) this.shake = 0; if (this.flash) this.flash--;
    const taps = tapQueue.splice(0);
    // démonstration automatique quand on reste sur un robot
    for (let p = 0; p < 2; p++) if (!this.pup[p].busy && this.pup[p].idleT > (this.done[p] ? 150 : 200)) this.demo(p);
    // toucher / cliquer le grand robot : il fait une démonstration
    for (const t of taps) for (let p = 0; p < (this.two ? 2 : 1); p++) {
      if (this.skinSel[p] && !this.done[p] && inRect(t, this.previewX(p) - 130, 112, 260, 34)) { this.cycleSkin(p, t.x < this.previewX(p) ? -1 : 1); continue; }
      if (inRect(t, this.previewX(p) - 120, 150, 240, 310)) { this.demo(p); AU.sfx('select'); }
    }
    if (escPressed) { AU.sfx('select'); setScene(new TitleScene(true)); return; }
    if (this.out) { if (++this.out > 75) this.go(); return; }
    if (this.lock > 0) this.lock--;
    for (let p = 0; p < 2; p++) {
      if (this.done[p]) continue;
      // training : le joueur 1 choisit aussi le mannequin, après son propre robot
      if (this.mode === 'training' && p === 1 && (!this.done[0] || this.lock)) continue;
      const pd = this.mode === 'training' ? pads[0] : pads[p];
      if (this.plock[p] > 0) { this.plock[p]--; continue; }
      if (this.skinSel[p]) { // choix du skin : ◀ ▶ puis valider ; haut/bas = retour à la grille
        if (pd.pressed.l) this.cycleSkin(p, -1);
        if (pd.pressed.r) this.cycleSkin(p, 1);
        if (pd.pressed.u || pd.pressed.d) { this.skinSel[p] = false; AU.sfx('select'); }
        else if (confirmPressed(pd)) this.pickChar(p);
        continue;
      }
      let c = this.cur[p];
      const N = ROSTER.length, C = SEL_COLS, row = (c / C) | 0, rowStart = row * C, rowLen = Math.min(C, N - rowStart);
      if (pd.pressed.l) c = rowStart + ((c - rowStart - 1 + rowLen) % rowLen);
      if (pd.pressed.r) c = rowStart + ((c - rowStart + 1) % rowLen);
      if (pd.pressed.u || pd.pressed.d) { const col = c - rowStart, nr = (row + 1) % Math.ceil(N / C), nrLen = Math.min(C, N - nr * C); c = nr * C + Math.min(col, nrLen - 1); }
      if (c !== this.cur[p]) { this.cur[p] = c; this.skin[p] = 0; AU.sfx('move'); this.pup[p].playMotion(this.chOf(p), 'intro'); this.demoI[p] = 0; }
      if (confirmPressed(pd)) this.pickChar(p);
    }
    for (const t of taps) for (let i = 0; i < ROSTER.length; i++) {
      const r = this.tile(i);
      if (inRect(t, r.x - r.s / 2, r.y - r.s / 2, r.s, r.s)) {
        const p = this.done[0] ? 1 : 0; if (this.done[p]) break;
        if (this.cur[p] === i) this.pickChar(p); else { this.cur[p] = i; this.skin[p] = 0; this.skinSel[p] = false; AU.sfx('move'); this.pup[p].playMotion(this.chOf(p), 'intro'); this.demoI[p] = 0; sayName(ROSTER[i]); }
      }
    }
    if (taps.some(t => inRect(t, W / 2 - 90, 500, 180, 34))) { const p = this.done[0] ? 1 : 0; if (!this.done[p]) this.pickChar(p); }
  }
  cycleSkin(p, d) {
    const n = skinList(ROSTER[this.cur[p]]).length; if (n < 2) return;
    this.skin[p] = (this.skin[p] + d + n) % n; AU.sfx('move');
    if (!this.pup[p].busy) this.pup[p].play('taunt');
  }
  pickChar(p) {
    // robots avec plusieurs skins : 1re validation = choix du skin, 2e = prêt
    if (skinList(ROSTER[this.cur[p]]).length > 1 && !this.skinSel[p]) { this.skinSel[p] = true; this.plock[p] = 6; AU.sfx('select'); AU.say('Choose your skin', 0.5, 1.05); return; }
    this.skinSel[p] = false;
    this.done[p] = true; AU.sfx('confirm'); sayName(this.chOf(p)); this.lock = 10;
    this.pup[p].playMotion(this.chOf(p), 'victory');
    if (this.done[0] && this.done[1]) this.out = 1;
  }
  go() {
    GAME.p1 = this.cur[0]; GAME.c1 = this.chOf(0);
    if (this.two) { // combat miroir : le second prend un autre skin (ou une teinte)
      GAME.p2 = this.cur[1]; GAME.c2 = this.chOf(1);
      if (chKey(GAME.c2) === chKey(GAME.c1)) GAME.c2 = withSkin(GAME.c2, 'mirror');
    }
    if (this.mode === 'arcade') {
      const others = ROSTER.map((_, i) => i).filter(i => i !== GAME.p1);
      for (let i = others.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[others[i], others[j]] = [others[j], others[i]]; }
      GAME.ladder = others; GAME.idx = 0;
      startArcadeFight();
    } else if (this.mode === 'tournament') startTournament();
    else if (this.mode === 'training') setScene(new ArenaSelectScene('training', st => startTraining(st)));
    else setScene(new ArenaSelectScene('versus', st => setScene(new VsScene(GAME.c1, GAME.c2, st, () => startVersusFight(st)))));
  }
  draw() {
    const c = ctx;
    c.save();
    if (this.shake) c.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake) * 0.6);
    drawGridBg(c, this.t, '#ff5a5a');
    const tr = this.mode === 'training';
    bigTxt(tr && this.done[0] ? 'CHOISISSEZ LE MANNEQUIN' : 'CHOISISSEZ VOTRE ROBOT', W / 2, 40, 36);
    if (this.mode === 'tournament' || tr) txt(tr ? 'TRAINING' : 'TOURNOI MONDIAL · 8 ROBOTS', W / 2, 70, 10, { color: '#9be7ff', stroke: '#000', sw: 4 });
    // grands aperçus
    const showP2 = this.two;
    for (let p = 0; p < (showP2 ? 2 : 1); p++) {
      const ch = this.chOf(p), left = p === 0;
      const x = left ? 150 : W - 150;
      const g = c.createRadialGradient(x, 250, 10, x, 250, 190);
      g.addColorStop(0, hexA(ch.accent, 0.4)); g.addColorStop(1, hexA(ch.accent, 0));
      c.fillStyle = g; c.fillRect(x - 200, 60, 400, 400);
      const st = this.pup[p].state();
      // socle lumineux
      c.save(); c.globalCompositeOperation = 'lighter';
      const fl = c.createRadialGradient(x, 458, 4, x, 458, 120); fl.addColorStop(0, hexA(ch.accent, 0.55)); fl.addColorStop(1, hexA(ch.accent, 0));
      c.fillStyle = fl; c.beginPath(); c.ellipse(x, 458, 120, 22, 0, 0, 7); c.fill(); c.restore();
      drawRobotAny(c, ch, st.pose, x + st.dx * 1.55 * (left ? 1 : -1), 455 - st.dy * 1.55, left ? 1 : -1, 1.55, { yaw: st.yaw, st: this.done[p] ? 'win' : 'idle' });
      if (tr && p === 1) txt('MANNEQUIN', x, 152, 10, { color: '#ffd23a', stroke: '#000', sw: 4 });
      this.drawSkinBar(c, p, x);
      if (this.done[p]) txt('PRÊT !', x, 178, 22, { font: FONT_BIG, italic: true, color: '#fff', stroke: '#000', sw: 6, glow: ch.accent, alpha: 0.6 + 0.4 * Math.sin(this.t * 0.2) });
      txt(ch.name, x, 82, 20, { color: '#fff', stroke: '#000', sw: 5, glow: ch.accent });
      txt(ch.maker + ' · ' + ch.country, x, 106, 9, { color: ch.accent, stroke: '#000', sw: 3 });
      const stat = (lab, v, yy) => {
        txt(lab, x - 110, yy, 8, { align: 'left', color: '#ccc', stroke: '#000', sw: 3 });
        c.fillStyle = '#222'; c.fillRect(x - 20, yy - 5, 130, 10);
        c.fillStyle = ch.accent; c.fillRect(x - 20, yy - 5, 130 * clamp((v - 0.75) / 0.45, 0.1, 1), 10);
      };
      stat('PUISSANCE', ch.power, 470); stat('VITESSE', ch.speed, 488); stat('TAILLE', ch.scale, 506);
    }
    if (!showP2) {
      // bio + coups à droite en mode arcade
      const ch = this.chOf(0);
      c.fillStyle = 'rgba(5,10,25,.8)'; c.fillRect(W - 300, 74, 284, 200); c.strokeStyle = ch.accent; c.strokeRect(W - 300, 74, 284, 200);
      txt(ch.full, W - 284, 94, 10, { align: 'left', color: ch.accent });
      wrapText(c, ch.bio, W - 284, 118, 252, 16, '11px ' + FONT_BIG, '#ddd');
      moveRows(ch).forEach((r, j) => { txt(r[0], W - 284, 186 + j * 30, 8, { align: 'left', color: '#ffd23a' }); txt(r[1], W - 284, 200 + j * 30, 10, { align: 'left', color: '#fff', font: FONT_BIG }); });
    }
    // grille
    for (let i = 0; i < ROSTER.length; i++) {
      const r = this.tile(i), ch = ROSTER[i];
      c.drawImage(portrait(ch, 84), r.x - r.s / 2, r.y - r.s / 2, r.s, r.s);
      c.strokeStyle = '#333'; c.lineWidth = 2; c.strokeRect(r.x - r.s / 2, r.y - r.s / 2, r.s, r.s);
      txt(ch.name, r.x, r.y + r.s / 2 - 8, 7, { color: '#fff', stroke: '#000', sw: 3 });
    }
    for (let p = 0; p < 2; p++) {
      if (p === 1 && !(this.mode === 'versus' || (tr && this.done[0]))) continue;
      const r = this.tile(this.cur[p]), col = p ? '#4fb4ff' : '#ff3a3a';
      const on = this.done[p] || this.t % 20 < 14;
      if (!on) continue;
      c.strokeStyle = col; c.lineWidth = 5; c.strokeRect(r.x - r.s / 2 - 3 + p * 4, r.y - r.s / 2 - 3 + p * 4, r.s + 6 - p * 8, r.s + 6 - p * 8);
      txt(p ? '2P' : '1P', r.x + (p ? 30 : -30), r.y - r.s / 2 - 10, 10, { color: col, stroke: '#000', sw: 4 });
    }
    if (isTouch) {
      c.fillStyle = 'rgba(255,210,58,.2)'; c.fillRect(W / 2 - 90, 500, 180, 34); c.strokeStyle = '#ffd23a'; c.strokeRect(W / 2 - 90, 500, 180, 34);
      txt('VALIDER', W / 2, 517, 12, { color: '#ffd23a' });
    } else txt(this.mode === 'versus' ? 'J1 : ZQSD/WASD + F   ·   J2 : FLÈCHES + K' : tr ? 'Flèches + ENTRÉE : votre robot, puis le mannequin' : 'Flèches + ENTRÉE pour valider', W / 2, 517, 9, { color: '#aaa' });
    FX.draw(c);
    c.restore();
    if (this.flash) { c.fillStyle = `rgba(255,255,255,${this.flash / 14})`; c.fillRect(0, 0, W, H); }
    if (this.out > 40) { c.fillStyle = `rgba(255,255,255,${Math.min(0.8, (this.out - 40) / 30)})`; c.fillRect(0, 0, W, H); }
  }
}
// barre de skin sous le nom du robot (si le robot a plusieurs skins)
SelectScene.prototype.drawSkinBar = function (c, p, x) {
  const list = skinList(ROSTER[this.cur[p]]); if (list.length < 2) return;
  const k = this.skin[p], sk = list[k], on = this.skinSel[p] && !this.done[p], y = 129;
  c.save();
  c.fillStyle = on ? 'rgba(255,210,58,.16)' : 'rgba(5,10,25,.72)'; c.fillRect(x - 130, y - 15, 260, 30);
  c.strokeStyle = on ? '#ffd23a' : 'rgba(255,255,255,.25)'; c.lineWidth = on ? 2 : 1; c.strokeRect(x - 130, y - 15, 260, 30);
  // pastilles de couleur du skin
  (sk.sw || []).forEach((col, i) => { c.fillStyle = col; c.fillRect(x - 122 + i * 9, y - 6, 7, 12); c.strokeStyle = '#000'; c.lineWidth = 1; c.strokeRect(x - 122 + i * 9, y - 6, 7, 12); });
  txt((on ? '◀ ' : '') + sk.name + (on ? ' ▶' : ''), x + 6, y, 9, { color: on ? '#ffd23a' : '#fff', stroke: '#000', sw: 3 });
  txt(`${k + 1}/${list.length}`, x + 124, y, 7, { align: 'right', color: '#9be7ff' });
  if (!on && !this.done[p]) txt('SKINS : valider pour choisir', x, y + 22, 7, { color: '#9be7ff', stroke: '#000', sw: 3, alpha: this.t % 50 < 34 ? 1 : 0.4 });
  if (on) txt('◀ ▶ changer · valider', x, y + 22, 7, { color: '#ffd23a', stroke: '#000', sw: 3 });
  c.restore();
};
function wrapText(c, s, x, y, maxW, lh, font, col) {
  c.save(); c.font = font; c.fillStyle = col; c.textAlign = 'left'; c.textBaseline = 'top';
  let line = '';
  for (const w of s.split(' ')) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { c.fillText(line, x, y); y += lh; line = w; } else line = t; }
  if (line) c.fillText(line, x, y);
  c.restore();
}

/* =================== CHOIX DE L'ARÈNE =================== */
const ARENA_IMG = {};
function arenaImg(id) { // vignettes pré-rendues : assets/arenas/<id>.jpg (640×360)
  if (!ARENA_IMG[id]) { const im = new Image(); im.src = 'assets/arenas/' + id + '.jpg'; ARENA_IMG[id] = im; }
  const im = ARENA_IMG[id]; return im.complete && im.naturalWidth ? im : null;
}
ARENAS.forEach(a => arenaImg(a.id)); // préchargement
class ArenaSelectScene {
  constructor(mode, next, cur) {
    this.mode = mode; this.next = next; this.t = 0; this.out = 0;
    this.n = ARENAS.length + 1; // + ALÉATOIRE
    this.cur = cur != null ? cur : (GAME.lastArena != null ? GAME.lastArena : ROSTER[GAME.p2 != null ? GAME.p2 : 0].stage);
    this.rnd = 0; setTouchControls(false); mergeKeyboards = true;
    AU.say('Select stage', 0.5, 1);
  }
  thumb(i) { const w = 104, gap = 8, x0 = (W - (this.n * w + (this.n - 1) * gap)) / 2; return { x: x0 + i * (w + gap), y: 416, w, h: 58 }; }
  update() {
    this.t++; const taps = tapQueue.splice(0), pd = pads[0];
    if (escPressed) { AU.sfx('select'); setScene(new SelectScene(this.mode)); return; }
    if (this.out) { if (++this.out > 28) { GAME.lastArena = this.cur; this.next(this.pick); } return; }
    if (pd.pressed.l || pads[1].pressed.l) { this.cur = (this.cur + this.n - 1) % this.n; AU.sfx('move'); }
    if (pd.pressed.r || pads[1].pressed.r) { this.cur = (this.cur + 1) % this.n; AU.sfx('move'); }
    let ok = confirmPressed(pd) || confirmPressed(pads[1]);
    for (const t of taps) {
      for (let i = 0; i < this.n; i++) { const r = this.thumb(i); if (inRect(t, r.x, r.y, r.w, r.h)) { if (this.cur === i) ok = true; else { this.cur = i; AU.sfx('move'); } } }
      if (inRect(t, 200, 70, 560, 315) || inRect(t, W / 2 - 90, 496, 180, 34)) ok = true;
    }
    if (this.cur === ARENAS.length && this.t % 6 === 0) this.rnd = (this.rnd + 1) % ARENAS.length;
    if (ok) {
      this.pick = this.cur === ARENAS.length ? (Math.random() * ARENAS.length) | 0 : this.cur;
      this.out = 1; AU.sfx('confirm'); AU.say(ARENAS[this.pick].name.replace('NÉO', 'neo').replace('ARÈNE', 'arena').toLowerCase(), 0.5, 1);
    }
  }
  drawArena(c, i, x, y, w, h, zoom) {
    const a = ARENAS[i], im = arenaImg(a.id);
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    if (im) {
      // léger travelling (Ken Burns) sur l'aperçu
      const k = zoom ? 1.08 + 0.04 * Math.sin(this.t * 0.01) : 1, dx = zoom ? Math.sin(this.t * 0.006) * w * 0.03 : 0;
      c.drawImage(im, x - (w * k - w) / 2 + dx, y - (h * k - h) / 2, w * k, h * k);
    } else {
      const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#16233a'); g.addColorStop(1, '#05070c');
      c.fillStyle = g; c.fillRect(x, y, w, h);
      txt(a.name, x + w / 2, y + h / 2, zoom ? 22 : 8, { color: '#9be7ff' });
    }
    c.restore();
  }
  draw() {
    const c = ctx, sel = this.cur, isRnd = sel === ARENAS.length, show = isRnd ? this.rnd : sel, a = ARENAS[show];
    drawGridBg(c, this.t, '#3fa9ff');
    bigTxt('CHOISISSEZ L\'ARÈNE', W / 2, 38, 34);
    // grand aperçu
    const X = 200, Y = 70, PW = 560, PH = 315;
    c.fillStyle = '#000'; c.fillRect(X - 4, Y - 4, PW + 8, PH + 8);
    this.drawArena(c, show, X, Y, PW, PH, true);
    if (isRnd) { c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(X, Y, PW, PH); bigTxt('?', W / 2, Y + PH / 2 - 10, 120); }
    const g = c.createLinearGradient(0, Y + PH - 90, 0, Y + PH); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.85)');
    c.fillStyle = g; c.fillRect(X, Y + PH - 90, PW, 90);
    c.strokeStyle = '#ffd23a'; c.lineWidth = 3; c.strokeRect(X - 2, Y - 2, PW + 4, PH + 4);
    txt(isRnd ? 'ALÉATOIRE' : a.name, X + 16, Y + PH - 46, 24, { align: 'left', font: FONT_BIG, italic: true, color: '#fff', stroke: '#000', sw: 6 });
    txt(isRnd ? 'Laissez le hasard choisir' : a.place + '  ·  ' + a.desc, X + 18, Y + PH - 18, 9, { align: 'left', color: '#9be7ff', stroke: '#000', sw: 3 });
    // robots « à domicile »
    if (!isRnd) {
      const home = ROSTER.filter(r => r.stage === show);
      home.forEach((r, i) => c.drawImage(portrait(r, 84), X + PW - 52 - i * 50, Y + 8, 44, 44));
      if (home.length) txt('A DOMICILE', X + PW - 8, Y + 62, 7, { align: 'right', color: '#ffd23a', stroke: '#000', sw: 3 });
    }
    // combattants
    if (GAME.c1) c.drawImage(portrait(P1C(), 84), 40, 150, 120, 120);
    if (GAME.c2) c.drawImage(portrait(P2C(), 84, true), W - 160, 150, 120, 120);
    txt('VS', W - 100, 300, 18, { font: FONT_BIG, italic: true, color: '#fff', stroke: '#000', sw: 5, alpha: GAME.c2 ? 1 : 0 });
    // vignettes
    for (let i = 0; i < this.n; i++) {
      const r = this.thumb(i), on = i === sel;
      c.fillStyle = '#000'; c.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
      if (i < ARENAS.length) this.drawArena(c, i, r.x, r.y, r.w, r.h, false);
      else { c.fillStyle = '#10182a'; c.fillRect(r.x, r.y, r.w, r.h); txt('?', r.x + r.w / 2, r.y + r.h / 2, 26, { font: FONT_BIG, color: '#ffd23a' }); }
      if (!on) { c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(r.x, r.y, r.w, r.h); }
      c.strokeStyle = on ? '#ffd23a' : '#3a4250'; c.lineWidth = on ? 3 : 1.5; c.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
      if (on && this.t % 24 < 12) { c.strokeStyle = '#fff'; c.lineWidth = 1; c.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8); }
    }
    txt(isTouch ? 'Touchez une arène puis l\'aperçu' : '◀ ▶ choisir   ·   ENTREE valider   ·   ECHAP retour', W / 2, 512, 9, { color: '#aaa' });
    if (this.out) { c.fillStyle = `rgba(255,255,255,${Math.min(0.7, this.out / 20)})`; c.fillRect(0, 0, W, H); }
  }
}

/* =================== VS =================== */
class VsScene {
  constructor(ch1, ch2, stageIdx, next, label) {
    this.a = ch1; this.b = ch2; this.st = stageIdx; this.next = next; this.t = 0; this.label = label; setTouchControls(false); AU.stopMusic();
    this.pup = [new Puppet(), new Puppet()]; this.pup[0].playMotion(ch1, 'intro'); this.pup[1].playMotion(ch2, 'intro');
  }
  update() {
    this.t++; const taps = tapQueue.splice(0);
    this.pup.forEach(p => p.update());
    if (this.t === 30) AU.sfx('hitS');
    if (this.t >= 130) { if (!this.pup[0].busy) this.pup[0].play('special'); if (!this.pup[1].busy) this.pup[1].play('combo'); }
    if (this.t === 32) AU.say(`${this.a.name.replace('02', 'zero two').replace('H1', 'H one').replace('ASIMOV', 'Asimov')}. versus. ${this.b.name.replace('02', 'zero two').replace('H1', 'H one').replace('ASIMOV', 'Asimov')}`, 0.4, 0.9);
    if (this.t > 220 || (this.t > 40 && (confirmPressed(pads[0]) || taps.length))) this.next();
  }
  draw() {
    const c = ctx, t = this.t;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const k = easeOut(clamp(t / 25, 0, 1));
    // deux moitiés en diagonale
    const half = (ch, left) => {
      c.save();
      c.beginPath();
      if (left) { c.moveTo(0, 0); c.lineTo(W / 2 + 60, 0); c.lineTo(W / 2 - 60, H); c.lineTo(0, H); }
      else { c.moveTo(W / 2 + 60, 0); c.lineTo(W, 0); c.lineTo(W, H); c.lineTo(W / 2 - 60, H); }
      c.closePath(); c.clip();
      const g = c.createLinearGradient(left ? 0 : W, 0, W / 2, 0);
      g.addColorStop(0, shade(ch.accent, -0.3)); g.addColorStop(1, '#05060a');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,255,255,.08)';
      for (let i = 0; i < 25; i++) { const y = (i * 37 + t * 6 * (left ? 1 : -1)) % H; c.beginPath(); c.moveTo(0, (y + H) % H); c.lineTo(W, (y + H) % H); c.stroke(); }
      const x = left ? lerp(-300, 230, k) : lerp(W + 300, W - 230, k);
      const st = this.pup[left ? 0 : 1].state();
      drawRobotAny(c, ch, st.pose, x + st.dx * 2.3 * (left ? 1 : -1), H + 120 - st.dy * 2.3, left ? 1 : -1, 2.3, { yaw: st.yaw });
      c.restore();
      txt(ch.name, left ? lerp(-200, 40, k) : lerp(W + 200, W - 40, k), H - 60, 30, { align: left ? 'left' : 'right', font: FONT_BIG, italic: true, color: '#fff', stroke: '#000', sw: 7 });
      txt(ch.maker, left ? lerp(-200, 42, k) : lerp(W + 200, W - 42, k), H - 28, 11, { align: left ? 'left' : 'right', color: ch.accent, stroke: '#000', sw: 4 });
    };
    half(this.a, true); half(this.b, false);
    c.strokeStyle = '#fff'; c.lineWidth = 6; c.beginPath(); c.moveTo(W / 2 + 60, 0); c.lineTo(W / 2 - 60, H); c.stroke();
    if (t > 26) {
      const s = 1 + Math.max(0, (34 - t) / 8);
      bigTxt('VS', W / 2, H / 2 - 20, 130 * s, { grad: ['#ffffff', '#ffe14a', '#ff5a00', '#a00000'], glow: '#ff3a00', blur: 40 });
    }
    if (this.label) txt(this.label, W / 2, 34, 14, { color: '#ffd23a', stroke: '#000', sw: 5 });
    txt('ARÈNE : ' + (ARENAS[this.st] || ARENAS[0]).name, W / 2, H / 2 + 80, 11, { color: '#fff', stroke: '#000', sw: 4, alpha: t > 40 ? 1 : 0 });
    if (t < 30 && t > 24) { c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(0, 0, W, H); }
  }
}

/* =================== SCÈNE DE COMBAT =================== */
class FightScene {
  constructor(fight) { this.f = fight; setTouchControls(true); AU.playTrack(arenaTrack(fight.arena)); }
  update() { this.f.update(); }
  draw() { this.f.draw(); }
}
function startArcadeFight() {
  const opp = GAME.ladder[GAME.idx], st = ROSTER[opp].stage;
  const label = `COMBAT ${GAME.idx + 1} / ${GAME.ladder.length}`;
  setScene(new VsScene(P1C(), ROSTER[opp], st, () => {
    mergeKeyboards = true;
    const f = new Fight(P1C(), ROSTER[opp], st, {
      cpu1: true, level: Math.min(6, 1 + GAME.idx), versus: false,
      onEnd: w => {
        if (w === 0) { GAME.idx++; if (GAME.idx >= GAME.ladder.length) setScene(new EndingScene(P1C())); else startArcadeFight(); }
        else setScene(new ContinueScene());
      }
    });
    setScene(new FightScene(f));
  }, label));
}
function startVersusFight(st) {
  mergeKeyboards = false;
  const f = new Fight(P1C(), P2C(), st, {
    versus: true,
    onEnd: w => setScene(new ResultScene(w === 0 ? P1C() : P2C(), w))
  });
  setScene(new FightScene(f));
}

// personnages choisis (avec leur skin)
const P1C = () => GAME.c1 && (GAME.c1.base || GAME.c1).id === ROSTER[GAME.p1].id ? GAME.c1 : ROSTER[GAME.p1];
const P2C = () => GAME.c2 && (GAME.c2.base || GAME.c2).id === ROSTER[GAME.p2].id ? GAME.c2 : ROSTER[GAME.p2];
function startTraining(st) {
  mergeKeyboards = true;
  if (st == null) st = GAME.trainArena != null ? GAME.trainArena : ROSTER[GAME.p2].stage;
  GAME.trainArena = st;
  const f = new Fight(P1C(), P2C(), st, { training: true, versus: false, onEnd: () => setScene(new TitleScene(true)) });
  setScene(new FightScene(f));
}

/* =================== TOURNOI (8 robots, élimination directe) =================== */
const TOUR_ROUNDS = ['QUARTS DE FINALE', 'DEMI-FINALES', 'FINALE'];
const BR_W = 112, BR_H = 40; // cases du tableau
const TOUR_ROUND1 = ['QUART DE FINALE', 'DEMI-FINALE', 'FINALE'];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; }
function startTournament() {
  const others = shuffle(ROSTER.map((_, i) => i).filter(i => i !== GAME.p1)).slice(0, 7);
  GAME.tour = { slots: shuffle([GAME.p1, ...others]), res: [[], [], []], score: [[], [], []], round: 0, lost: false, champion: false };
  setScene(new BracketScene(-1));
}
// participants d'un tour (r = 0 : les 8 inscrits ; ensuite les vainqueurs du tour précédent)
function tourEntrants(r) { const T = GAME.tour; return r === 0 ? T.slots : T.res[r - 1]; }
function tourPlayerMatch(r) { const e = tourEntrants(r), k = e.indexOf(GAME.p1); return k < 0 ? -1 : k >> 1; }
function startTourMatch() {
  const T = GAME.tour, r = T.round, m = tourPlayerMatch(r), e = tourEntrants(r);
  const opp = e[m * 2] === GAME.p1 ? e[m * 2 + 1] : e[m * 2];
  const st = r === 2 ? ARENA_STADIUM : ROSTER[opp].stage; // la finale se joue à l'Arène mondiale
  setScene(new VsScene(P1C(), ROSTER[opp], st, () => {
    mergeKeyboards = true;
    const f = new Fight(P1C(), ROSTER[opp], st, {
      cpu1: true, level: [3, 4, 6][r], versus: false,
      onEnd: w => tourResult(w, opp, f.p[0].wins, f.p[1].wins)
    });
    setScene(new FightScene(f));
  }, 'TOURNOI · ' + TOUR_ROUND1[r]));
}
function tourResult(w, opp, w0, w1) {
  const T = GAME.tour, r = T.round, m = tourPlayerMatch(r), e = tourEntrants(r);
  T.res[r][m] = w === 0 ? GAME.p1 : opp;
  T.score[r][m] = w === 0 ? `${w0}-${w1}` : `${w1}-${w0}`;
  // les autres combats du tour sont simulés (puissance, vitesse et un peu de chance)
  for (let k = 0; k < e.length / 2; k++) {
    if (k === m) continue;
    const a = ROSTER[e[k * 2]], b = ROSTER[e[k * 2 + 1]];
    const ra = a.power + a.speed * 0.6 + Math.random() * 0.9, rb = b.power + b.speed * 0.6 + Math.random() * 0.9;
    T.res[r][k] = ra >= rb ? e[k * 2] : e[k * 2 + 1];
    T.score[r][k] = Math.random() < 0.55 ? '2-0' : '2-1';
  }
  if (w !== 0) T.lost = true;
  else if (r === 2) T.champion = true;
  else T.round++;
  setScene(new BracketScene(r));
}
class BracketScene {
  constructor(reveal) {
    this.t = 0; this.reveal = reveal; this.sel = 0; setTouchControls(false); FX.clear();
    AU.playTrack(GAME.tour.champion ? TRACKS.win : TRACKS.select);
    const T = GAME.tour;
    if (T.champion) AU.say('Champion!', 0.5, 0.9);
    else if (T.lost) AU.say('Eliminated', 0.5, 0.8);
    else AU.say(TOUR_ROUNDS[T.round] === 'FINALE' ? 'Final' : T.round === 1 ? 'Semi finals' : 'Quarter finals', 0.5, 0.95);
  }
  // positions des cases : tour r, case k
  box(r, k) {
    const n = 8 >> r, half = n / 2, left = k < half, i = left ? k : k - half;
    if (r === 3) return { x: W / 2, y: 342, left: true };
    const xs = [72, 214, 350], x = left ? xs[r] : W - xs[r];
    const ys = [[150, 206, 300, 356], [178, 328], [253]];
    return { x, y: ys[r][i], left };
  }
  update() {
    this.t++; FX.update(); const taps = tapQueue.splice(0), T = GAME.tour, pd = pads[0];
    if (escPressed) { AU.sfx('select'); setScene(new TitleScene(true)); return; }
    if (T.champion && this.t % 22 === 0) { const sd = Math.random() < 0.5; explosion(sd ? rand(60, 300) : rand(W - 300, W - 60), rand(140, 420), pick(['#ffd23a', '#ff3fd2', '#3fa9ff', '#4dff88']), 0.6); AU.sfx('hitL'); }
    if (this.t < 50) return;
    if (T.lost) { // éliminé : réessayer ou abandonner
      if (pd.pressed.u || pd.pressed.d || pd.pressed.l || pd.pressed.r) { this.sel = 1 - this.sel; AU.sfx('move'); }
      let ch = confirmPressed(pd) ? this.sel : -1;
      for (const t of taps) for (let i = 0; i < 2; i++) if (inRect(t, W / 2 - 230 + i * 240, 470, 220, 40)) ch = i;
      if (ch === 0) { AU.sfx('coin'); const r = T.round; T.res[r] = []; T.score[r] = []; T.lost = false; startTourMatch(); }
      if (ch === 1) { AU.sfx('select'); setScene(new TitleScene(false)); }
      return;
    }
    if (confirmPressed(pd) || taps.length) {
      AU.sfx('confirm');
      if (T.champion) setScene(new EndingScene(P1C(), 'tour'));
      else startTourMatch();
    }
  }
  drawSlot(c, idx, b, st) {
    // st : 'win' (a passé le tour), 'out' (éliminé), 'me' (joueur), 'next' (prochain adversaire)
    const w = BR_W, h = BR_H, x0 = b.x - w / 2, y0 = b.y - h / 2;
    c.save();
    c.fillStyle = 'rgba(6,10,22,.86)'; c.fillRect(x0, y0, w, h);
    if (idx == null) {
      c.strokeStyle = '#3a4250'; c.lineWidth = 1.5; c.strokeRect(x0, y0, w, h);
      txt('?', b.x, b.y, 16, { color: '#55606e' });
      c.restore(); return;
    }
    const ch = ROSTER[idx];
    c.drawImage(portrait(idx === GAME.p1 ? P1C() : ch, 84), x0 + 2, y0 + 2, h - 4, h - 4);
    txt(ch.name.replace('UNITREE ', ''), x0 + h + 2, b.y, ch.name.length > 9 ? 8 : 9, { align: 'left', color: st === 'out' ? '#77808c' : '#fff', stroke: '#000', sw: 3 });
    if (st === 'out') { c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(x0, y0, w, h); c.strokeStyle = '#ff3a3a'; c.lineWidth = 3; c.beginPath(); c.moveTo(x0 + 6, y0 + h - 6); c.lineTo(x0 + h - 6, y0 + 6); c.stroke(); }
    const me = idx === GAME.p1;
    c.strokeStyle = me ? '#ff3a3a' : st === 'next' ? '#ffd23a' : st === 'win' ? '#ffc21a' : '#4a5463';
    c.lineWidth = me || st === 'next' ? 3 : 1.5;
    if ((me || st === 'next') && this.t % 30 < 15 && !GAME.tour.lost) c.lineWidth = 4.5;
    c.strokeRect(x0, y0, w, h);
    if (me) txt('1P', x0 + w - 4, y0 - 7, 9, { align: 'right', color: '#ff3a3a', stroke: '#000', sw: 3 });
    c.restore();
  }
  draw() {
    const c = ctx, T = GAME.tour;
    drawGridBg(c, this.t, T.champion ? '#ffd23a' : '#3fa9ff');
    bigTxt('TOURNOI MONDIAL', W / 2, 40, 40);
    const title = T.champion ? 'CHAMPION DU MONDE !' : T.lost ? 'ELIMINE...' : TOUR_ROUNDS[T.round];
    txt(title, W / 2, 84, 16, { color: T.lost ? '#ff5a5a' : '#ffd23a', stroke: '#000', sw: 5, glow: T.lost ? '#ff0000' : '#ff9d1c' });
    // trophée
    this.drawTrophy(c, W / 2, 196, T.champion ? 1.25 : 1);
    // lignes du tableau
    const nextM = !T.lost && !T.champion ? tourPlayerMatch(T.round) : -1;
    for (let r = 0; r < 3; r++) {
      const e = tourEntrants(r);
      for (let k = 0; k < (8 >> r); k++) {
        const a = this.box(r, k), b = this.box(r + 1, k >> 1), m = k >> 1;
        const won = T.res[r][m] != null && e[k] === T.res[r][m];
        const shown = this.revealK(r, m) >= 1;
        const hw = BR_W / 2, ax = a.left ? a.x + hw : a.x - hw, bx = b.left ? b.x - hw : b.x + hw, mx = (ax + bx) / 2;
        c.strokeStyle = won && shown ? '#ffc21a' : 'rgba(150,170,200,.35)'; c.lineWidth = won && shown ? 3 : 1.5;
        c.beginPath(); c.moveTo(ax, a.y);
        if (r === 2) { c.lineTo(W / 2, a.y); c.lineTo(W / 2, b.y - BR_H / 2); } // finalistes → case du champion
        else { c.lineTo(mx, a.y); c.lineTo(mx, b.y); c.lineTo(bx, b.y); }
        c.stroke();
      }
    }
    // cases
    for (let r = 0; r <= 3; r++) {
      const e = r === 3 ? (T.res[2][0] != null ? [T.res[2][0]] : []) : tourEntrants(r);
      for (let k = 0; k < (8 >> r); k++) {
        const b = this.box(r, k);
        let idx = e[k];
        if (r > 0 && idx != null && this.revealK(r - 1, k) < 1) idx = undefined; // révélation progressive
        if (r === 3) { if (idx != null) { const k2 = this.revealK(2, 0); c.save(); c.globalAlpha = k2; this.drawSlot(c, idx, b, 'win'); c.restore(); } continue; }
        let st = '';
        if (idx != null && r < 3) {
          const m = k >> 1, rw = T.res[r][m];
          if (rw != null && this.revealK(r, m) >= 1) st = rw === idx ? 'win' : 'out';
          else if (m === nextM && r === T.round && idx !== GAME.p1) st = 'next';
        }
        this.drawSlot(c, idx, b, st);
        const m = k >> 1;
        if (k % 2 === 0 && T.score[r][m] && this.revealK(r, m) >= 1) {
          if (r === 2) txt('FINALE ' + T.score[r][m], W / 2, 388, 9, { color: '#9be7ff', stroke: '#000', sw: 3 });
          else {
            const b2 = this.box(r, k + 1), hw = BR_W / 2, nx = this.box(r + 1, m).x;
            const gx = ((b.left ? b.x + hw : b.x - hw) + (b.left ? nx - hw : nx + hw)) / 2, gy = (b.y + b2.y) / 2 + (r === 0 ? 0 : 36);
            c.fillStyle = 'rgba(6,10,22,.95)'; c.fillRect(gx - 14, gy - 8, 28, 16); c.strokeStyle = 'rgba(155,231,255,.5)'; c.lineWidth = 1; c.strokeRect(gx - 14, gy - 8, 28, 16);
            txt(T.score[r][m], gx, gy, 7, { color: '#9be7ff' });
          }
        }
      }
    }
    txt('QUARTS', 72, 116, 9, { color: '#8a96a8' }); txt('QUARTS', W - 72, 116, 9, { color: '#8a96a8' });
    txt('DEMIES', 214, 144, 9, { color: '#8a96a8' }); txt('DEMIES', W - 214, 144, 9, { color: '#8a96a8' });
    txt('FINALISTES', 350, 219, 8, { color: '#8a96a8' }); txt('FINALISTES', W - 350, 219, 8, { color: '#8a96a8' });
    txt('CHAMPION', W / 2, 306, 10, { color: '#ffd23a' });
    FX.draw(c);
    // bas d'écran
    if (this.t < 50) return;
    if (T.lost) {
      ['REESSAYER', 'ABANDONNER'].forEach((s, i) => {
        const x = W / 2 - 230 + i * 240, sel = this.sel === i;
        c.fillStyle = sel ? 'rgba(255,210,58,.2)' : 'rgba(5,10,25,.8)'; c.fillRect(x, 470, 220, 40);
        c.strokeStyle = sel ? '#ffd23a' : '#555'; c.lineWidth = 2; c.strokeRect(x, 470, 220, 40);
        txt(s, x + 110, 490, 14, { color: sel ? '#ffd23a' : '#ccc', stroke: '#000', sw: 4 });
      });
    } else if (T.champion) txt('Appuyez pour la cérémonie', W / 2, 500, 12, { color: '#fff', stroke: '#000', sw: 4, alpha: this.t % 50 < 34 ? 1 : 0.3 });
    else {
      const e = tourEntrants(T.round), m = tourPlayerMatch(T.round), opp = e[m * 2] === GAME.p1 ? e[m * 2 + 1] : e[m * 2];
      txt(`${TOUR_ROUND1[T.round]} : ${ROSTER[GAME.p1].name}  VS  ${ROSTER[opp].name}`, W / 2, 470, 13, { color: '#fff', stroke: '#000', sw: 4 });
      txt(isTouch ? 'Touchez pour combattre' : 'Appuyez pour combattre', W / 2, 500, 11, { color: '#ffd23a', stroke: '#000', sw: 4, alpha: this.t % 50 < 34 ? 1 : 0.3 });
    }
  }
  // 0 → 1 : apparition des résultats du tour qui vient de se jouer
  revealK(r, m) {
    if (r !== this.reveal) return 1;
    return clamp((this.t - 20 - m * 14) / 10, 0, 1);
  }
  drawTrophy(c, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    const g = c.createLinearGradient(-40, 0, 40, 0);
    g.addColorStop(0, '#8a5a00'); g.addColorStop(0.35, '#ffe27a'); g.addColorStop(0.55, '#fff6c8'); g.addColorStop(1, '#a06a00');
    c.shadowColor = '#ffb000'; c.shadowBlur = 24 + Math.sin(this.t * 0.08) * 8;
    c.fillStyle = g; c.strokeStyle = '#4a2a00'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-34, -46); c.lineTo(34, -46); c.quadraticCurveTo(32, 0, 8, 10); c.lineTo(8, 28); c.lineTo(22, 38); c.lineTo(-22, 38); c.lineTo(-8, 28); c.lineTo(-8, 10); c.quadraticCurveTo(-32, 0, -34, -46); c.closePath(); c.fill(); c.stroke();
    c.shadowBlur = 0;
    c.lineWidth = 5; c.strokeStyle = '#d9a520';
    c.beginPath(); c.arc(-36, -26, 14, Math.PI * 0.55, Math.PI * 1.55); c.stroke();
    c.beginPath(); c.arc(36, -26, 14, -Math.PI * 0.55, Math.PI * 0.45); c.stroke();
    c.fillStyle = '#2a1a00'; c.fillRect(-28, 38, 56, 12);
    c.fillStyle = '#ffd23a'; c.font = 'bold 9px ' + FONT_BIG; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('WRL', 0, 44);
    // robot champion dans la coupe
    const champ = GAME.tour.res[2][0];
    if (champ != null && this.revealK(2, 0) >= 1) c.drawImage(portrait(ROSTER[champ], 84), -20, -40, 40, 40);
    c.restore();
  }
}

/* =================== CONTINUE / GAME OVER =================== */
class ContinueScene {
  constructor() { this.t = 0; this.n = 9; setTouchControls(false); AU.stopMusic(); AU.say('Continue?'); }
  update() {
    this.t++; const taps = tapQueue.splice(0);
    if (this.n >= 0 && this.t % 60 === 0) { this.n--; AU.sfx('move'); }
    if (this.n >= 0 && this.t > 20 && (confirmPressed(pads[0]) || taps.length)) { AU.sfx('coin'); startArcadeFight(); return; }
    if (this.n < 0) { if (this.t % 60 === 1) AU.say('Game over'); if (this.go == null) this.go = this.t; if (this.t - this.go > 150 || (this.t - this.go > 30 && (confirmPressed(pads[0]) || taps.length))) setScene(new TitleScene(false)); }
  }
  draw() {
    const c = ctx; c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const ch = P1C();
    const sk = skeleton(ch, POSES.down, 1, 1.6);
    drawRobotAny(c, ch, { ...POSES.down, rot: -90 }, W / 2 - 40, 470, 1, 1.6);
    if (this.n >= 0) {
      bigTxt('CONTINUE ?', W / 2, 140, 64);
      bigTxt(String(Math.max(0, this.n)), W / 2, 260, 110, { grad: ['#fff', '#ff9a9a', '#ff2a2a', '#600'] });
      txt(isTouch ? 'Touchez pour continuer' : 'Appuyez sur un bouton', W / 2, 340, 12, { color: '#fff', alpha: this.t % 40 < 28 ? 1 : 0.2 });
    } else bigTxt('GAME OVER', W / 2, 200, 80, { grad: ['#fff', '#aaa', '#555', '#222'], stroke: '#000' });
  }
}

/* =================== RÉSULTAT VERSUS =================== */
class ResultScene {
  constructor(ch, side) {
    this.ch = ch; this.side = side; this.t = 0; setTouchControls(false); AU.playTrack(TRACKS.win); FX.clear();
    this.pup = new Puppet(); this.pup.onFx = o => motionFire(o, ch, W / 2, 470, 2, 1); this.pup.playMotion(ch, 'victory');
  }
  update() { this.t++; FX.update(); this.pup.update(); const taps = tapQueue.splice(0); if (this.t > 60 && (confirmPressed(pads[0]) || confirmPressed(pads[1]) || taps.length)) setScene(new SelectScene('versus')); }
  draw() {
    const c = ctx; drawGridBg(c, this.t, this.ch.accent);
    const st = this.pup.state();
    drawRobotAny(c, this.ch, st.pose, W / 2 + st.dx * 2, 470 - st.dy * 2, 1, 2, { yaw: st.yaw, st: 'win' });
    FX.draw(c);
    bigTxt((this.side === 0 ? 'JOUEUR 1' : 'JOUEUR 2') + ' GAGNE !', W / 2, 70, 50);
    txt(this.ch.name, W / 2, 120, 20, { color: this.ch.accent, stroke: '#000', sw: 5 });
    txt('Appuyez pour rejouer', W / 2, 510, 11, { color: '#aaa', alpha: this.t % 60 < 40 ? 1 : 0.3 });
  }
}

/* =================== FIN (CHAMPION) =================== */
class EndingScene {
  constructor(ch, kind) {
    this.ch = ch; this.kind = kind; this.t = 0; setTouchControls(false); FX.clear(); AU.playTrack(TRACKS.win);
    this.pup = new Puppet(); this.pup.onFx = o => motionFire(o, ch, W / 2, 500, 2.1, 1); this.pup.playMotion(ch, 'victory');
    AU.say('Congratulations! ' + ch.name + (kind === 'tour' ? ' wins the world tournament!' : ' is the world robot champion!'), 0.5, 0.9);
  }
  update() {
    this.t++; FX.update(); this.pup.update(); const taps = tapQueue.splice(0);
    if (this.t % 25 === 0) {
      const x = rand(100, W - 100), y = rand(60, 260), col = pick(['#ff3fd2', '#3fa9ff', '#ffd23a', '#4dff88', this.ch.accent]);
      explosion(x, y, col, 0.7); AU.sfx('hitL');
    }
    if (this.t > 180 && (confirmPressed(pads[0]) || taps.length)) setScene(new TitleScene(false));
  }
  draw() {
    const c = ctx; drawGridBg(c, this.t, this.ch.accent);
    FX.draw(c);
    const st = this.pup.state();
    const g = c.createRadialGradient(W / 2, 330, 10, W / 2, 330, 260); g.addColorStop(0, hexA(this.ch.accent, 0.45)); g.addColorStop(1, hexA(this.ch.accent, 0));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    drawRobotAny(c, this.ch, st.pose, W / 2 + st.dx * 2.1, 500 - st.dy * 2.1, 1, 2.1, { yaw: st.yaw, st: 'win' });
    bigTxt('FÉLICITATIONS !', W / 2, 64, 56);
    txt(this.ch.name + (this.kind === 'tour' ? ' remporte le' : ' est le champion'), W / 2, 118, 16, { color: '#fff', stroke: '#000', sw: 5 });
    txt(this.kind === 'tour' ? 'TOURNOI MONDIAL DES ROBOTS !' : 'du monde des robots !', W / 2, 142, 16, { color: this.kind === 'tour' ? '#ffd23a' : '#fff', stroke: '#000', sw: 5 });
    if (this.t > 180) txt('Appuyez pour revenir au titre', W / 2, 515, 10, { color: '#aaa', alpha: this.t % 60 < 40 ? 1 : 0.3 });
  }
}

/* =================== BOUCLE PRINCIPALE =================== */
scene = new TitleScene(false);
let last = performance.now(), acc = 0;
const STEP = 1000 / 60;
function loop(now) {
  const dtFrame = now - last;
  acc += Math.min(100, dtFrame); last = now;
  if (R3 && scene instanceof FightScene) R3.perfTick(dtFrame);
  while (acc >= STEP) {
    pollInput();
    if (musicToggle) { AU.toggleMusic(); musicToggle = false; }
    if (nextScene && fade >= 0) {
      fade += 1;
      if (fade >= 10) { if (scene && scene.leave) scene.leave(); scene = nextScene; nextScene = null; fade = -10; window.__clickAttack = scene instanceof FightScene; }
    } else {
      if (fade < 0) fade++;
      scene.update();
    }
    gFrame++;
    tapQueue.length = 0; anyKeyPressed = false; escPressed = false;
    acc -= STEP;
  }
  ctx.setTransform(VIEW_SCALE, 0, 0, VIEW_SCALE, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  scene.draw();
  const fk = nextScene ? fade / 10 : fade < 0 ? -fade / 10 : 0;
  if (fk > 0) { ctx.fillStyle = `rgba(0,0,0,${fk})`; ctx.fillRect(0, 0, W, H); }
  AU.tick();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
