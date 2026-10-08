'use strict';
/* =========================================================
   Arène 3D : ARÈNE MONDIALE — la finale du championnat du monde de combat de robots, de nuit.
   Contrat : voir js/arenas.js.
   - plateau noir laqué surélevé (logo WORLD ROBOT LEAGUE, anneau LED cyan/magenta, liseré lumineux animé)
   - fosse des photographes (silhouettes + flashs), lanceurs pyrotechniques au bord du plateau
   - barrières à bandes LED publicitaires défilantes, tribunes en virage (foule instanciée animée :
     sauts, bras levés, ola ; téléphones allumés, flashs), coursive avec ruban LED
   - écran géant suspendu (écrans inclinés vers le plateau : FINALE, ROBOT FIGHTER II, noms des combattants, K.O.)
   - poursuites motorisées (faisceaux volumétriques) qui balaient le plateau et la foule, lasers, brume
   - K.O. : tempête de flashs, faisceaux sur le vainqueur, gerbes d'étincelles, canons à confettis
   ========================================================= */
(function () {
  const CX = 650, PIT = -160, ZB = -1700, EZ = -540;      // centre, sol de la fosse, ligne des barrières, bord arrière du plateau
  const L0 = 1100, RC = 1100, THM = 1.25;                  // tribunes : demi-longueur de la partie droite, rayon des virages, angle max
  const UMAX = L0 + RC * THM;
  const FOG = { color: 0x07061a, near: 1900, far: 10500 };
  const FONT = '"Russo One", "Arial Black", "Liberation Sans", sans-serif';
  const STAGE = [[-650, 900], [-650, -160], [-270, EZ], [1570, EZ], [1950, -160], [1950, 900]];

  // point du contour des tribunes : u = abscisse sur le contour de base (0 = axe du plateau), r = recul vers l'extérieur
  function cpt(u, r) {
    const a = Math.abs(u), sg = u < 0 ? -1 : 1;
    if (a <= L0) return [CX + u, ZB - r, 0, -1];
    const th = (a - L0) / RC, s = Math.sin(th), c = Math.cos(th);
    return [CX + sg * (L0 + (RC + r) * s), ZB + RC - (RC + r) * c, sg * s, -c];
  }
  const arcAt = (u, r) => { const a = Math.abs(u), sg = u < 0 ? -1 : 1; return sg * (a <= L0 ? a : L0 + (a - L0) * (RC + r) / RC); };
  const uFromArc = (s, r) => { const a = Math.abs(s), sg = s < 0 ? -1 : 1; return sg * (a <= L0 ? a : L0 + (a - L0) * RC / (RC + r)); };
  const smax = r => L0 + RC * THM * (RC + r) / RC;
  function contourUs(step) {
    const us = [], n = Math.max(2, Math.ceil(RC * THM / step));
    for (let i = n; i >= 0; i--) us.push(-(L0 + RC * THM * i / n));
    for (let i = 0; i <= n; i++) us.push(L0 + RC * THM * i / n);
    return us;
  }

  /* ---------- gradins : profil (r, y) ---------- */
  const NR = 25, CB = 14;                                  // rangées, rangée de la coursive (ruban LED)
  const PROF = [[0, -40], [14, -40], [14, -150]], ROWS = [];
  let FASCIA = null;
  {
    let r = 14, y = -150;
    for (let n = 0; n < NR; n++) {
      if (n === CB) { PROF.push([r + 150, y]); PROF.push([r + 150, y + 130]); FASCIA = { r: r + 150, y0: y, y1: y + 130 }; r += 150; y += 130; }
      ROWS.push({ r: r + 44, y });
      PROF.push([r + 85, y]); r += 85; y += 44; PROF.push([r, y]);
    }
    PROF.push([r + 60, y]); PROF.push([r + 60, y + 700]);
  }
  const rowAt = (f) => { const i = Math.max(0, Math.min(NR - 1.001, f)), a = i | 0, k = i - a; return [ROWS[a].r + (ROWS[a + 1].r - ROWS[a].r) * k, ROWS[a].y + (ROWS[a + 1].y - ROWS[a].y) * k]; };

  /* ---------- écran géant suspendu ---------- */
  const JB = { x: CX, z: -2230, w: 860, y0: 650, y1: 1080, ins: 148, yb: 474 };  // cube : largeur, bas/haut des écrans verticaux ; dessous incliné

  ARENA3D.stadium = {
    light: {
      hemi: [0x5a64a8, 0x0b0912, 0.34], key: [0xfff1e2, 1.75], keyPos: [-180, 1150, 430],
      rims: [[0xff2bc8, 2.3, [1, 0.28, -0.75]], [0x1fd2ff, 2.3, [-1, 0.28, -0.75]], [0xffc46a, 0.7, [0, 1, 0.1]]],
      fog: FOG, bg: 0x040309, refl: 0.5, dim: 0.74
    },
    // thème de la finale : « boum-boum-clap » de stade, basse pompante, hymne en quartes (la mineur : Am Dm G C)
    track: {
      bpm: 152, root: 45, prog: [0, 5, -2, 3],
      bass: [0, 0, 12, 0, 7, 0, 12, 0, 0, 0, 12, 0, 7, 12, 10, 7],
      lead: [12, null, 12, 14, 17, null, 14, 12, 19, null, 17, null, 14, 12, 7, null,
        12, null, 12, 14, 17, null, 19, 22, 24, null, 22, 19, 17, 14, 12, null],
      drums: { k: 'x.x.....x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xx' }
    },
    build(S) {
      const T = S.T, root = S.group(), Q = S.quality;
      const rnd = S.rng(20260);
      /* ---------- uniformes partagés ---------- */
      const uT = { value: 0 }, uExc = { value: 0.3 }, uDim = { value: 1 }, uCam = { value: new T.Vector3(CX, 150, 690) };
      const uFogC = { value: new T.Color(FOG.color) }, uFogN = { value: FOG.near }, uFogF = { value: FOG.far };
      const FOGU = { uFogC, uFogN, uFogF };
      const C = (h) => new T.Color(h);
      const COL = { cy: C(0x14d4ff), mg: C(0xff26d0), gd: C(0xffb02e), wh: C(0xfff2e4), vi: C(0x8a4dff) };

      /* =========================================================
         TEXTURES DESSINÉES
         ========================================================= */
      // --- sol du plateau (couleur + émissif), espace monde : x -650..1950, z -540..300 ---
      const FX0 = -650, FX1 = 1950, FZ0 = -540, FZ1 = 300, FW = 2048, FH = 1024;
      const kx = FW / (FX1 - FX0), kz = FH / (FZ1 - FZ0);
      const worldSpace = c => c.setTransform(kx, 0, 0, kz, -FX0 * kx, -FZ0 * kz);
      const EMB = { x: CX, z: -150, r: 360 };
      const stagePath = (c, ins) => {
        // contour du plateau, rentré de ins
        c.beginPath(); c.moveTo(-650 + ins, 400); c.lineTo(-650 + ins, -160 + ins * 0.41); c.lineTo(-270 + ins * 0.41, EZ + ins);
        c.lineTo(1570 - ins * 0.41, EZ + ins); c.lineTo(1950 - ins, -160 + ins * 0.41); c.lineTo(1950 - ins, 400);
      };
      const floorTex = S.canvasTex(FW, FH, (c) => {
        c.fillStyle = '#050608'; c.fillRect(0, 0, FW, FH);
        worldSpace(c);
        let g = c.createRadialGradient(CX, -120, 40, CX, -120, 1300); g.addColorStop(0, '#0d0f15'); g.addColorStop(0.6, '#07080b'); g.addColorStop(1, '#040405');
        c.fillStyle = g; c.fillRect(FX0, FZ0, FX1 - FX0, FZ1 - FZ0);
        // joints des dalles (très discrets)
        c.strokeStyle = 'rgba(40,44,56,0.5)'; c.lineWidth = 2.2;
        for (let x = -650; x <= 1950; x += 260) { c.beginPath(); c.moveTo(x, FZ0); c.lineTo(x, FZ1); c.stroke(); }
        for (let z = -540; z <= 300; z += 210) { c.beginPath(); c.moveTo(FX0, z); c.lineTo(FX1, z); c.stroke(); }
        // liseré du ring
        c.strokeStyle = '#3b3220'; c.lineWidth = 10; stagePath(c, 46); c.stroke();
        c.strokeStyle = '#1c1d22'; c.lineWidth = 26; stagePath(c, 90); c.stroke();
        // emblème central
        const { x: ex, z: ez, r: er } = EMB;
        c.save(); c.translate(ex, ez);
        g = c.createRadialGradient(0, 0, er * 0.2, 0, 0, er); g.addColorStop(0, '#15171f'); g.addColorStop(1, '#0a0b0f');
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, er, 0, 7); c.fill();
        c.strokeStyle = '#5a606e'; c.lineWidth = 9; c.beginPath(); c.arc(0, 0, er, 0, 7); c.stroke();

        c.strokeStyle = '#5e6472'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, er - 26, 0, 7); c.stroke();
        c.beginPath(); c.arc(0, 0, er * 0.56, 0, 7); c.stroke();
        // graduations
        for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, r0 = er - 22, r1 = er - (i % 6 ? 12 : 4); c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); c.stroke(); }
        // étoile à 8 branches dorée
        c.fillStyle = '#6f5a2c'; c.beginPath();
        for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? er * 0.22 : er * 0.5; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
        c.closePath(); c.fill();
        c.fillStyle = '#0b0c10'; c.beginPath(); c.arc(0, 0, er * 0.2, 0, 7); c.fill();
        c.restore();
        // bandeau WORLD ROBOT LEAGUE (lettres étirées en profondeur : lisibles depuis la caméra rasante)
        c.save(); c.translate(CX, -150); c.scale(0.5, 1);
        c.fillStyle = '#0a0b0f'; c.fillRect(-1500, -90, 3000, 180);
        c.strokeStyle = '#6f5a2c'; c.lineWidth = 6; c.strokeRect(-1500, -90, 3000, 180);
        c.font = `900 150px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#5d6372'; c.fillText('WORLD ROBOT LEAGUE', 0, 6);
        c.restore();
        // texte arrière
        c.save(); c.translate(CX, -470); c.scale(0.55, 1);
        c.font = `900 95px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#262a33';
        c.fillText('GRANDE FINALE  ·  ROBOT FIGHTER II  ·  GRANDE FINALE', 0, 0);
        c.restore();
      }, { aniso: 8 });
      const floorEmis = S.canvasTex(FW, FH, (c) => {
        c.fillStyle = '#000'; c.fillRect(0, 0, FW, FH);
        worldSpace(c);
        // anneau LED : moitié cyan (coin P1) / moitié magenta (coin P2)
        c.lineWidth = 7;
        c.strokeStyle = '#19d6ff'; c.beginPath(); c.arc(EMB.x, EMB.z, EMB.r + 40, Math.PI * 0.5, Math.PI * 1.5); c.stroke();
        c.strokeStyle = '#ff2bd2'; c.beginPath(); c.arc(EMB.x, EMB.z, EMB.r + 40, -Math.PI * 0.5, Math.PI * 0.5); c.stroke();
        // liseré doré du ring
        c.strokeStyle = '#a06a1c'; c.lineWidth = 5; stagePath(c, 46); c.stroke();
        // contour du bandeau
        c.save(); c.translate(CX, -150); c.scale(0.5, 1); c.strokeStyle = '#8a5a14'; c.lineWidth = 5; c.strokeRect(-1500, -90, 3000, 180); c.restore();
        // repères de départ
        const mark = (x, col) => { c.strokeStyle = col; c.lineWidth = 6; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(x - 40, 40 + i * 30); c.lineTo(x, 60 + i * 30); c.lineTo(x + 40, 40 + i * 30); c.stroke(); } };
        mark(430, '#0f8fb0'); mark(870, '#a8188c');
      });
      floorEmis.anisotropy = 8;

      // --- atlas de la foule : 8 silhouettes × 2 poses (R = contre-jour, G = maillot, B = pancarte/écharpe) ---
      const crowdTex = S.canvasTex(1024, 512, (c, W, H) => {
        c.clearRect(0, 0, W, H);
        const SH = 'rgb(0,255,0)', SK = 'rgb(0,0,0)', SG = 'rgb(30,0,255)';
        for (let row = 0; row < 2; row++) for (let v = 0; v < 8; v++) {
          const up = row === 1, photo = v >= 6;
          c.save(); c.translate(v * 128 + 64, row * 256); c.beginPath(); c.rect(-62, 2, 124, 252); c.clip();
          const sw = [29, 25, 28, 35, 27, 24, 30, 29][v], hy = [50, 56, 47, 52, 54, 58, 50, 52][v], hr = [15, 13.5, 14.5, 16, 15, 13, 15, 15][v];
          const sy = hy + hr + 9;
          // jambes
          c.fillStyle = SK; c.fillRect(-sw * 0.66, 168, sw * 0.6, 90); c.fillRect(sw * 0.06, 168, sw * 0.6, 90);
          // torse
          c.fillStyle = SH; c.beginPath(); c.moveTo(-sw, sy + 10); c.quadraticCurveTo(-sw, sy, -sw + 10, sy); c.lineTo(sw - 10, sy); c.quadraticCurveTo(sw, sy, sw, sy + 10);
          c.lineTo(sw - 3, 150); c.lineTo(sw * 0.72, 176); c.lineTo(-sw * 0.72, 176); c.lineTo(-sw + 3, 150); c.closePath(); c.fill();
          // bras
          c.strokeStyle = SH; c.lineWidth = 12; c.lineCap = 'round'; c.lineJoin = 'round';
          const arm = (pts, fist) => { c.beginPath(); pts.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](p[0], p[1])); c.stroke(); if (fist) { c.fillStyle = SK; c.beginPath(); c.arc(pts[pts.length - 1][0], pts[pts.length - 1][1], 7.5, 0, 7); c.fill(); } };
          const L = -(sw - 6), R = sw - 6;
          if (photo) {
            if (!up) { arm([[L, sy + 6], [L - 14, sy + 40], [-14, hy + 6]]); arm([[R, sy + 6], [R + 14, sy + 40], [14, hy + 6]]); }
            else { arm([[L, sy + 6], [L - 6, sy - 40], [-14, hy - 62]]); arm([[R, sy + 6], [R + 6, sy - 40], [14, hy - 62]]); }
          } else if (!up) {
            arm([[L, sy + 6], [L - 8, sy + 50], [L - 2, sy + 92]], true); arm([[R, sy + 6], [R + 8, sy + 50], [R + 2, sy + 92]], true);
          } else if (v === 0 || v === 5) {
            arm([[L, sy + 6], [L - 20, sy - 36], [L - 30, sy - 82]], true); arm([[R, sy + 6], [R + 20, sy - 36], [R + 30, sy - 82]], true);
          } else if (v === 1) {
            arm([[L, sy + 6], [L - 8, sy + 50], [L - 2, sy + 92]], true); arm([[R, sy + 6], [R + 16, sy - 30], [R + 8, sy - 84]], true);
          } else if (v === 2) { // écharpe tendue au-dessus de la tête
            arm([[L, sy + 6], [L - 26, sy - 30], [L - 30, sy - 76]], true); arm([[R, sy + 6], [R + 26, sy - 30], [R + 30, sy - 76]], true);
            c.fillStyle = SG; c.fillRect(L - 34, sy - 92, R - L + 68, 18);
          } else if (v === 3) { // applaudit au-dessus de la tête
            arm([[L, sy + 6], [L - 18, sy - 30], [-5, hy - 52]]); arm([[R, sy + 6], [R + 18, sy - 30], [5, hy - 52]]);
            c.fillStyle = SK; c.beginPath(); c.arc(0, hy - 54, 9, 0, 7); c.fill();
          } else { // pancarte
            arm([[L, sy + 6], [L - 10, sy - 30], [-26, hy - 50]]); arm([[R, sy + 6], [R + 10, sy - 30], [26, hy - 50]]);
            c.fillStyle = SG; c.fillRect(-40, hy - 96, 80, 46);
          }
          // tête, cou, coiffures
          c.fillStyle = SK; c.fillRect(-6, hy + hr - 6, 12, 14);
          c.beginPath(); c.arc(0, hy, hr, 0, 7); c.fill();
          if (v === 1) { c.beginPath(); c.ellipse(hr * 0.7, hy + 8, 6, 15, -0.4, 0, 7); c.fill(); }
          if (v === 2) { c.fillRect(-hr - 2, hy - 7, hr * 2 + 12, 6); c.beginPath(); c.arc(0, hy - 4, hr + 1, Math.PI, 0); c.fill(); }
          if (v === 4) { c.beginPath(); c.arc(0, hy - 3, hr + 6, 0, 7); c.fill(); }
          if (v === 5) { c.beginPath(); c.moveTo(-hr - 4, hy + hr + 6); c.quadraticCurveTo(-hr - 6, hy - hr - 6, 0, hy - hr - 5); c.quadraticCurveTo(hr + 6, hy - hr - 6, hr + 4, hy + hr + 6); c.fill(); }
          if (photo) { // appareil photo devant le visage (ou levé)
            const cy = up ? hy - 72 : hy + 2, big = v === 7;
            c.fillStyle = SK; c.fillRect(-22, cy - 14, 44, 28);
            c.beginPath(); c.arc(0, cy + 1, big ? 15 : 11, 0, 7); c.fill();
            c.strokeStyle = 'rgb(255,0,0)'; c.lineWidth = 2.5; c.beginPath(); c.arc(0, cy + 1, big ? 12 : 8, 0, 7); c.stroke();
            c.fillStyle = 'rgb(160,0,0)'; c.fillRect(-18, cy - 20, 14, 7); // flash
          }
          c.restore();
        }
        // contre-jour : bord des silhouettes éclairé (plus fort en haut), calculé par composition de calques (rapide)
        const mk = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; return cv; };
        const sil = mk(); sil.getContext('2d').drawImage(c.canvas, 0, 0);
        const core = mk(), cc = core.getContext('2d');
        cc.drawImage(sil, 0, 0); cc.globalCompositeOperation = 'destination-in';
        cc.drawImage(sil, 0, 4); cc.drawImage(sil, 3, 1); cc.drawImage(sil, -3, 1); cc.drawImage(sil, 0, -2);
        const rim = mk(), rc = rim.getContext('2d');
        rc.drawImage(sil, 0, 0); rc.globalCompositeOperation = 'destination-out'; rc.drawImage(core, 0, 0);
        rc.globalCompositeOperation = 'source-in';
        for (let row = 0; row < 2; row++) { const g = rc.createLinearGradient(0, row * 256, 0, row * 256 + 256); g.addColorStop(0, 'rgb(255,0,0)'); g.addColorStop(0.45, 'rgb(170,0,0)'); g.addColorStop(1, 'rgb(60,0,0)'); rc.fillStyle = g; rc.fillRect(0, row * 256, W, 256); }
        c.globalCompositeOperation = 'lighter'; c.drawImage(rim, 0, 0); c.globalCompositeOperation = 'source-over';
      }, { srgb: false });

      // --- bandes LED : 4 bandeaux 2048×128 (pubs A, pubs B, ruban, K.O.) ---
      const adsTex = S.canvasTex(2048, 512, (c) => {
        const band = (row, items) => {
          const w = 2048 / items.length;
          items.forEach((it, i) => {
            const x = i * w, y = row * 128;
            const g = c.createLinearGradient(0, y, 0, y + 128); g.addColorStop(0, it.bg[0]); g.addColorStop(1, it.bg[1]);
            c.fillStyle = g; c.fillRect(x, y, w, 128);
            c.save(); c.beginPath(); c.rect(x, y, w, 128); c.clip();
            if (it.deco === 'rays') { c.globalAlpha = 0.18; c.fillStyle = it.fg2; for (let k = 0; k < 14; k++) c.fillRect(x + k * w / 14, y, w / 28, 128); c.globalAlpha = 1; }
            if (it.deco === 'chev') { c.fillStyle = it.fg2; for (let k = 0; k < 6; k++) { const xx = x + 18 + k * 22; c.beginPath(); c.moveTo(xx, y + 34); c.lineTo(xx + 14, y + 64); c.lineTo(xx, y + 94); c.lineTo(xx + 8, y + 94); c.lineTo(xx + 22, y + 64); c.lineTo(xx + 8, y + 34); c.fill(); } }
            c.font = it.font || `900 74px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
            const tx = x + w / 2 + (it.deco === 'chev' ? 60 : 0);
            if (it.glow) { c.shadowColor = it.glow; c.shadowBlur = 18; }
            c.fillStyle = it.fg; c.fillText(it.t, tx, y + 68, w - 40);
            c.shadowBlur = 0;
            if (it.sub) { c.font = `700 22px ${FONT}`; c.fillStyle = it.fg2; c.fillText(it.sub, tx, y + 112, w - 40); }
            c.restore();
          });
        };
        band(0, [
          { t: 'WORLD ROBOT LEAGUE', bg: ['#0a0f2a', '#03050f'], fg: '#ffd27a', fg2: '#ffffff', sub: 'CHAMPIONNAT DU MONDE', font: `900 58px ${FONT}` },
          { t: 'MECHA·COLA', bg: ['#b00d1e', '#5a0410'], fg: '#ffffff', fg2: '#ffd0d0', deco: 'rays', sub: 'LE CARBURANT DES CHAMPIONS' },
          { t: 'NEO-VOLT', bg: ['#0b0b0b', '#000000'], fg: '#ffe23a', fg2: '#ffe23a', deco: 'chev', sub: 'BATTERIES HAUTE TENSION' },
          { t: 'SERVO·X', bg: ['#04384a', '#011820'], fg: '#4ff0ff', fg2: '#bff8ff', glow: '#0bd0ff', sub: 'ACTIONNEURS DE PRÉCISION' }
        ]);
        band(1, [
          { t: 'ROBOT FIGHTER II', bg: ['#14051c', '#05010a'], fg: '#ff4fe0', fg2: '#ffffff', glow: '#ff2bd0', font: `900 60px ${FONT}` },
          { t: 'FINALE 2026', bg: ['#1c1203', '#070400'], fg: '#ffbf3a', fg2: '#ffe7b0', deco: 'rays', sub: 'EN DIRECT DU MONDE ENTIER' },
          { t: 'KAIJU ENERGY', bg: ['#2a0638', '#0d0214'], fg: '#c7ff3a', fg2: '#e9ffb0', deco: 'chev', font: `900 60px ${FONT}` },
          { t: 'OMNICORE AI', bg: ['#e8ecf2', '#9aa3b2'], fg: '#0b0e16', fg2: '#20283a', sub: 'L\'INTELLIGENCE EN MOUVEMENT', font: `900 62px ${FONT}` }
        ]);
        // ruban continu
        { const y = 256; const g = c.createLinearGradient(0, y, 0, y + 128); g.addColorStop(0, '#05060f'); g.addColorStop(1, '#010103'); c.fillStyle = g; c.fillRect(0, y, 2048, 128);
          c.font = `900 66px ${FONT}`; c.textBaseline = 'middle'; c.textAlign = 'left';
          const parts = [['WORLD ROBOT LEAGUE', '#ffffff'], ['★', '#ffb02e'], ['GRANDE FINALE', '#ffb02e'], ['★', '#19d6ff'], ['ROBOT FIGHTER II', '#ff3fd6'], ['★', '#ffb02e']];
          let x = 30; for (const [t, col] of parts) { c.fillStyle = col; c.fillText(t, x, y + 66); x += c.measureText(t).width + 46; }
          const sc = 2048 / x; if (sc < 1) { /* le texte doit tenir dans la largeur : on recommence en plus petit */
            c.fillStyle = g; c.fillRect(0, y, 2048, 128); c.font = `900 ${Math.floor(66 * sc)}px ${FONT}`; x = 30 * sc;
            for (const [t, col] of parts) { c.fillStyle = col; c.fillText(t, x, y + 66); x += c.measureText(t).width + 46 * sc; }
          }
        }
        // K.O.
        { const y = 384; const g = c.createLinearGradient(0, y, 0, y + 128); g.addColorStop(0, '#3a0006'); g.addColorStop(1, '#120001'); c.fillStyle = g; c.fillRect(0, y, 2048, 128);
          c.font = `900 96px ${FONT}`; c.textBaseline = 'middle'; c.textAlign = 'center';
          for (let i = 0; i < 4; i++) { c.shadowColor = '#ff3a1a'; c.shadowBlur = 20; c.fillStyle = '#ffd23a'; c.fillText('K.O. !', 256 + i * 512, y + 66); c.shadowBlur = 0; c.fillStyle = '#ff5a2a'; c.fillText('★', 512 * (i + 1), y + 66); }
        }
      }, { repeat: [1, 1], aniso: 4 });
      adsTex.wrapT = T.ClampToEdgeWrapping;

      // --- écran géant : 4 vues 1024×512 (FINALE, ROBOT FIGHTER II, noms, K.O.) ---
      const jbTex = S.canvasTex(2048, 1024, () => { }, { aniso: 4 });
      const jbCv = jbTex.image, jbC = jbCv.getContext('2d');
      function jbFrame(f, draw) {
        const x = (f % 2) * 1024, y = (f >> 1) * 512;
        jbC.save(); jbC.translate(x, y); jbC.beginPath(); jbC.rect(0, 0, 1024, 512); jbC.clip(); draw(jbC); jbC.restore();
      }
      const rays = (c, cx, cy, col, n, a) => { c.save(); c.globalAlpha = a; c.fillStyle = col; for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = a0 + Math.PI / n; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a0) * 1400, cy + Math.sin(a0) * 1400); c.lineTo(cx + Math.cos(a1) * 1400, cy + Math.sin(a1) * 1400); c.fill(); } c.restore(); };
      const bigText = (c, t, x, y, size, fill, stroke, glow) => {
        c.font = `900 ${size}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        if (glow) { c.shadowColor = glow; c.shadowBlur = size * 0.35; }
        if (stroke) { c.lineWidth = size * 0.1; c.strokeStyle = stroke; c.strokeText(t, x, y, 860); }
        c.fillStyle = fill; c.fillText(t, x, y, 860); c.shadowBlur = 0;
      };
      const goldGrad = (c, y0, y1) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#fff6c8'); g.addColorStop(0.45, '#ffc23a'); g.addColorStop(0.55, '#c46a08'); g.addColorStop(1, '#ffd36a'); return g; };
      jbFrame(0, c => {
        const g = c.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#070512'); g.addColorStop(1, '#1a0b02'); c.fillStyle = g; c.fillRect(0, 0, 1024, 512);
        rays(c, 512, 330, '#ffb02e', 24, 0.13);
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 0, 1024, 140);
        bigText(c, 'WORLD ROBOT LEAGUE', 512, 168, 46, '#ffffff', null, '#19d6ff');
        bigText(c, 'FINALE', 512, 300, 190, goldGrad(c, 210, 390), '#3a1600', '#ff9a1a');
        c.fillStyle = '#ff2bd0'; c.fillRect(150, 418, 724, 8); c.fillStyle = '#19d6ff'; c.fillRect(150, 432, 724, 4);
      });
      jbFrame(1, c => {
        c.fillStyle = '#05020c'; c.fillRect(0, 0, 1024, 512);
        // sol synthwave
        c.strokeStyle = 'rgba(255,43,208,0.55)'; c.lineWidth = 3;
        for (let i = -12; i <= 12; i++) { c.beginPath(); c.moveTo(512 + i * 18, 300); c.lineTo(512 + i * 160, 512); c.stroke(); }
        for (let k = 0; k < 8; k++) { const y = 300 + Math.pow(k / 7, 2) * 212; c.beginPath(); c.moveTo(0, y); c.lineTo(1024, y); c.stroke(); }
        const g = c.createLinearGradient(0, 120, 0, 300); g.addColorStop(0, 'rgba(255,90,40,0)'); g.addColorStop(1, 'rgba(255,60,120,0.5)'); c.fillStyle = g; c.fillRect(0, 120, 1024, 180);
        const cg = c.createLinearGradient(0, 200, 0, 330); cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.5, '#9fb6d8'); cg.addColorStop(0.52, '#3a4a66'); cg.addColorStop(1, '#e8f2ff');
        bigText(c, 'ROBOT FIGHTER', 470, 262, 104, cg, '#10162a', '#19d6ff');
        bigText(c, 'II', 880, 262, 150, '#ff2a3a', '#300008', '#ff2a3a');
        bigText(c, 'LA FINALE · EN DIRECT', 512, 400, 40, '#ffd27a', null, null);
      });
      function drawNames(a, b, ca, cb) {
        jbFrame(2, c => {
          c.fillStyle = '#04050c'; c.fillRect(0, 0, 1024, 512);
          let g = c.createLinearGradient(0, 0, 512, 0); g.addColorStop(0, 'rgba(25,214,255,0.55)'); g.addColorStop(1, 'rgba(25,214,255,0)');
          c.fillStyle = g; c.beginPath(); c.moveTo(0, 150); c.lineTo(560, 150); c.lineTo(470, 470); c.lineTo(0, 470); c.fill();
          g = c.createLinearGradient(1024, 0, 512, 0); g.addColorStop(0, 'rgba(255,43,208,0.55)'); g.addColorStop(1, 'rgba(255,43,208,0)');
          c.fillStyle = g; c.beginPath(); c.moveTo(1024, 150); c.lineTo(560, 150); c.lineTo(470, 470); c.lineTo(1024, 470); c.fill();
          bigText(c, 'GRANDE FINALE', 512, 120, 40, '#ffd27a', null, null);
          c.font = `900 70px ${FONT}`;
          bigText(c, a, 270, 300, 70, '#ffffff', '#04303c', ca);
          bigText(c, b, 754, 300, 70, '#ffffff', '#3c0430', cb);
          bigText(c, 'VS', 512, 300, 130, goldGrad(c, 240, 360), '#2a1000', '#ff9a1a');
          c.fillStyle = '#ff2a3a'; c.beginPath(); c.arc(430, 430, 10, 0, 7); c.fill();
          bigText(c, 'EN DIRECT', 530, 432, 32, '#ffffff', null, null);
        });
      }
      drawNames('JOUEUR 1', 'JOUEUR 2', '#19d6ff', '#ff2bd0');
      jbFrame(3, c => {
        const g = c.createRadialGradient(512, 300, 20, 512, 300, 600); g.addColorStop(0, '#5a0a00'); g.addColorStop(1, '#0a0000'); c.fillStyle = g; c.fillRect(0, 0, 1024, 512);
        rays(c, 512, 300, '#ff6a1a', 20, 0.25);
        bigText(c, 'K.O.', 512, 300, 230, goldGrad(c, 190, 410), '#3a0600', '#ff3a10');
      });
      jbTex.needsUpdate = true;

      /* =========================================================
         MATÉRIAUX À SHADERS
         ========================================================= */
      const FOG_V = 'uniform float uFogN, uFogF; varying float vFog;';
      const FOG_F = 'uniform vec3 uFogC; varying float vFog;';
      // bande LED (barrières, ruban de la coursive, anneau de l'écran) : uv.x en hauteurs de bande, défilement, panneaux
      function ledMat(o) {
        const u = Object.assign({ uMap: { value: adsTex }, uT, uDim, uRowA: { value: o.row || 0 }, uRowB: { value: o.row || 0 }, uMix: { value: 1 },
          uSpeed: { value: o.speed || 0.05 }, uBright: { value: o.bright || 1 }, uPanel: { value: o.panel || 0 } }, FOGU);
        return new T.ShaderMaterial({
          uniforms: u,
          vertexShader: `${FOG_V} varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vFog = smoothstep(uFogN, uFogF, -mv.z); }`,
          fragmentShader: `${FOG_F} uniform sampler2D uMap; uniform float uT, uRowA, uRowB, uMix, uSpeed, uBright, uPanel, uDim; varying vec2 vUv;
            vec3 samp(float row){ return texture2D(uMap, vec2(vUv.x / 16.0 + uT * uSpeed, (3.0 - row + clamp(vUv.y, 0.02, 0.98)) * 0.25)).rgb; }
            void main(){
              float w = smoothstep(uMix - 0.04, uMix + 0.04, fract(vUv.x * 0.0625 + 0.37) );
              vec3 c = mix(samp(uRowB), samp(uRowA), w);
              float px = fract(vUv.y * 32.0); c *= 0.82 + 0.18 * smoothstep(0.0, 0.3, px) * smoothstep(1.0, 0.7, px);
              if (uPanel > 0.0) { float p = fract(vUv.x / uPanel); c *= smoothstep(0.0, 0.012, p) * smoothstep(1.0, 0.988, p); }
              c *= uBright;
              gl_FragColor = vec4(mix(c, uFogC * 0.6, vFog * 0.7) * uDim, 1.0);
            }`
        });
      }
      // néon animé du bord du plateau : cyan côté P1, magenta côté P2, impulsions qui partent du centre
      const edgeMat = new T.ShaderMaterial({
        uniforms: { uT, uDim, uKo: { value: 0 }, uA: { value: COL.cy }, uB: { value: COL.mg }, uG: { value: COL.gd } },
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform float uT, uKo, uDim; uniform vec3 uA, uB, uG; varying vec3 vW;
          void main(){
            float dx = vW.x - ${CX}.0;
            vec3 c = mix(uA, uB, smoothstep(-120.0, 120.0, dx));
            c = mix(c, uG, exp(-dx * dx / 9000.0) * 0.9);
            float d = abs(dx) + max(0.0, -vW.z - 540.0) * 0.0 + abs(vW.z + 540.0) * 0.5;
            float p = pow(0.5 + 0.5 * sin(d * 0.011 - uT * 3.2), 10.0);
            c *= 1.7 + 2.6 * p + uKo * 2.5 * (0.5 + 0.5 * sin(uT * 25.0));
            gl_FragColor = vec4(c * uDim, 1.0);
          }`
      });
      // halo additif (lueur du néon sur le sol, brume au-dessus du néon)
      const glowSheet = (opac, fadeAxis) => new T.ShaderMaterial({
        uniforms: { uT, uDim, uA: { value: COL.cy }, uB: { value: COL.mg }, uG: { value: COL.gd }, uO: { value: opac } },
        vertexShader: 'varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform float uT, uO, uDim; uniform vec3 uA, uB, uG; varying vec3 vW; varying vec2 vUv;
          void main(){
            float dx = vW.x - ${CX}.0;
            vec3 c = mix(uA, uB, smoothstep(-120.0, 120.0, dx)); c = mix(c, uG, exp(-dx * dx / 9000.0) * 0.9);
            float f = pow(1.0 - vUv.${fadeAxis}, 2.2) * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
            gl_FragColor = vec4(c * f * uO * uDim, 1.0);
          }`,
        transparent: true, depthWrite: false, blending: T.AdditiveBlending
      });

      /* =========================================================
         GÉOMÉTRIES UTILES
         ========================================================= */
      // balayage d'un profil (r, y) le long du contour des tribunes
      function sweep(us, prof, uvS = 100) {
        const pos = [], nor = [], uv = [], pl = [0];
        for (let i = 1; i < prof.length; i++) pl.push(pl[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
        for (let j = 0; j < us.length - 1; j++) {
          const ca = cpt(us[j], 0), cb = cpt(us[j + 1], 0);
          for (let i = 0; i < prof.length - 1; i++) {
            const [r1, y1] = prof[i], [r2, y2] = prof[i + 1];
            if (r1 === r2 && y1 === y2) continue;
            const P = [], UV = [];
            for (const [uu, rr, yy, vv] of [[us[j], r1, y1, pl[i]], [us[j + 1], r1, y1, pl[i]], [us[j + 1], r2, y2, pl[i + 1]], [us[j], r2, y2, pl[i + 1]]]) {
              const p = cpt(uu, rr); P.push([p[0], yy, p[1]]); UV.push([arcAt(uu, rr) / uvS, vv / uvS]);
            }
            let nr = -(y2 - y1), ny = r2 - r1; const l = Math.hypot(nr, ny); nr /= l; ny /= l;
            const n0 = [nr * ca[2], ny, nr * ca[3]], n1 = [nr * cb[2], ny, nr * cb[3]], NN = [n0, n1, n1, n0];
            const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], e2 = [P[3][0] - P[0][0], P[3][1] - P[0][1], P[3][2] - P[0][2]];
            const gx = e1[1] * e2[2] - e1[2] * e2[1], gy = e1[2] * e2[0] - e1[0] * e2[2], gz = e1[0] * e2[1] - e1[1] * e2[0];
            const ok = gx * n0[0] + gy * n0[1] + gz * n0[2] >= 0;
            for (const k of (ok ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2])) { pos.push(...P[k]); nor.push(...NN[k]); uv.push(...UV[k]); }
          }
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
        return g;
      }
      // bande verticale le long du contour (face vers le plateau), uv.x en hauteurs de bande
      function stripAlong(us, r, y0, y1) {
        const pos = [], uv = [], h = y1 - y0;
        for (let j = 0; j < us.length - 1; j++) {
          const a = cpt(us[j], r), b = cpt(us[j + 1], r), ua = arcAt(us[j], r) / h, ub = arcAt(us[j + 1], r) / h;
          const P = [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], UV = [[ua, 0], [ub, 0], [ub, 1], [ua, 1]];
          for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...P[k]); uv.push(...UV[k]); }
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
        return g;
      }
      // bande le long d'une polyligne [x, z] (bord du plateau)
      function ribbonPoly(pts, y0, y1, out = 0) {
        const pos = [], uv = []; let acc = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
          const nx = (z1 - z0) / L * out, nz = -(x1 - x0) / L * out;
          const P = [[x0, y0, z0], [x1, y0, z1], [x1 + nx, y1, z1 + nz], [x0 + nx, y1, z0 + nz]], UV = [[acc, 0], [acc + L, 0], [acc + L, 1], [acc, 1]];
          for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...P[k]); uv.push(UV[k][0] / 100, UV[k][1]); }
          acc += L;
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
        return g;
      }

      /* =========================================================
         DÉCOR STATIQUE (fusionné par matériau)
         ========================================================= */
      const stat = S.group();
      // --- plateau ---
      {
        const shp = new T.Shape(); STAGE.forEach(([x, z], i) => i ? shp.lineTo(x, -z) : shp.moveTo(x, -z));
        const fg = new T.ShapeGeometry(shp); fg.rotateX(-Math.PI / 2);
        const p = fg.attributes.position, uv = fg.attributes.uv;
        for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - FX0) / (FX1 - FX0), 1 - (p.getZ(i) - FZ0) / (FZ1 - FZ0));
        const floorMat = S.phys({ color: 0xffffff, map: floorTex, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 1.1,
          emissive: 0xffffff, emissiveMap: floorEmis, emissiveIntensity: 1.9 });
        const floor = S.mesh(fg, floorMat); floor.userData.noMerge = true; root.add(floor);
        // jupe du plateau (métal sombre) + liseré lumineux sur le dessus du bord
        const skirt = S.mat({ color: 0x0c0d11, roughness: 0.45, metalness: 0.6 });
        const edgePts = STAGE.slice();
        stat.add(S.mesh(ribbonPoly(edgePts, PIT, -2, 0), skirt));
        const em = S.mesh(ribbonPoly(edgePts.map(([x, z]) => [x, z]), 0.6, 0.6, 9), edgeMat); // ruban horizontal à plat sur le bord
        em.userData.noMerge = true; root.add(em);
        const em2 = S.mesh(ribbonPoly(edgePts, -14, 0.6, 0), edgeMat); em2.userData.noMerge = true; root.add(em2);
        // lueur du néon sur le sol laqué + voile lumineux au-dessus du bord arrière
        const spill = new T.PlaneGeometry(2300, 150); spill.rotateX(-Math.PI / 2);
        const sp = S.mesh(spill, glowSheet(0.55, 'y'), { p: [CX, 0.8, EZ + 75] }); sp.userData.noMerge = true; sp.renderOrder = -2.9; root.add(sp);
        const veil = S.mesh(new T.PlaneGeometry(2300, 110), glowSheet(0.28, 'y'), { p: [CX, 55, EZ - 4] });
        veil.geometry = veil.geometry.clone(); { const uvv = veil.geometry.attributes.uv; for (let i = 0; i < uvv.count; i++) uvv.setY(i, uvv.getY(i)); }
        veil.userData.noMerge = true; veil.renderOrder = -2.9; root.add(veil);
        // lanceurs pyrotechniques sur le bord arrière
        const box = S.mat({ color: 0x15161b, roughness: 0.5, metalness: 0.5 }), hot = S.glow(0xff7a1a, 2.2);
        for (let x = -150; x <= 1450; x += 320) { stat.add(S.mesh(S.g.box(46, 30, 38), box, { p: [x, 15, EZ - 30] })); stat.add(S.mesh(S.g.cyl(7, 7, 4, 10), hot, { p: [x, 31, EZ - 30] })); }
      }
      // --- sol de la fosse et du stade ---
      stat.add(S.mesh(new T.PlaneGeometry(9000, 9000), S.mat({ color: 0x0b0b10, roughness: 0.55, metalness: 0.2 }), { p: [CX, PIT, -2500], r: [-Math.PI / 2, 0, 0] }));
      // --- tribunes (gradins) ---
      const US = contourUs(55);
      const standMat = S.mat({ color: 0x1b1d26, roughness: 0.85, metalness: 0.05 });
      stat.add(S.mesh(sweep(US, PROF), standMat));
      // garde-corps vitré lumineux de la coursive + panneaux SORTIE
      const railMat = S.glow(0x7fd8ff, 1.15);
      stat.add(S.mesh(stripAlong(US, FASCIA.r - 150 + 6, FASCIA.y0 + 92, FASCIA.y0 + 96), railMat));
      const exitMat = S.glow(0x2dff7a, 1.6);
      for (let s = -2200; s <= 2200; s += 900) { const r = FASCIA.r - 2, u = uFromArc(s + 450, r), p = cpt(u, r); stat.add(S.mesh(S.g.box(40, 16, 3), exitMat, { p: [p[0] - p[2] * 2, FASCIA.y1 - 14, p[1] - p[3] * 2], r: [0, Math.atan2(-p[2], -p[3]), 0] })); }
      // --- écrans latéraux (cartes des combattants), sur pylônes dans la fosse : cadrent les bords ---
      const SIDE = { x: [-380, 1680], y: 548, z: -1460, w: 520, h: 292, yaw: 0.42 };
      const sideTex = S.canvasTex(2048, 1152, () => { }, { aniso: 4 });
      const sdC = sideTex.image.getContext('2d');
      function sdFrame(f, draw) { const x = (f % 2) * 1024, y = (f >> 1) * 576; sdC.save(); sdC.translate(x, y); sdC.beginPath(); sdC.rect(0, 0, 1024, 576); sdC.clip(); draw(sdC); sdC.restore(); }
      function drawCard(f, tag, name, col, dark) {
        sdFrame(f, c => {
          let g = c.createLinearGradient(0, 0, 1024, 576); g.addColorStop(0, dark); g.addColorStop(1, '#020205'); c.fillStyle = g; c.fillRect(0, 0, 1024, 576);
          c.save(); c.globalAlpha = 0.16; c.fillStyle = col; for (let i = -6; i < 14; i++) { c.beginPath(); c.moveTo(i * 90, 576); c.lineTo(i * 90 + 40, 576); c.lineTo(i * 90 + 340, 0); c.lineTo(i * 90 + 300, 0); c.fill(); } c.restore();
          c.strokeStyle = col; c.lineWidth = 3; c.globalAlpha = 0.25;
          for (let y = 0; y < 8; y++) for (let x = 0; x < 14; x++) { const cx = 560 + x * 34 + (y % 2) * 17, cy = 60 + y * 30; c.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; c[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * 14, cy + Math.sin(a) * 14); } c.closePath(); c.stroke(); }
          c.globalAlpha = 1;
          bigText(c, tag, 190, 200, 210, 'rgba(0,0,0,0)', col, col);
          c.font = `900 210px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 6; c.strokeStyle = col; c.strokeText(tag, 190, 200);
          bigText(c, name, 512, 410, 104, '#ffffff', null, col);
          c.fillStyle = col; c.fillRect(70, 478, 884, 10);
          c.font = `700 30px ${FONT}`; c.fillStyle = '#d8dce8'; c.textAlign = 'left'; c.fillText('WORLD ROBOT LEAGUE  ·  GRANDE FINALE', 72, 528);
          c.textAlign = 'right'; c.fillStyle = col; c.fillText('● EN DIRECT', 952, 528);
          c.textAlign = 'left'; c.font = `900 44px ${FONT}`; c.fillStyle = '#ffffff'; c.fillText('ENGINE', 470, 120); c.fillStyle = col; c.fillText('CHAMPIONSHIP', 470, 172);
        });
      }
      function drawSideNames(a, b) { drawCard(0, 'P1', a, '#19d6ff', '#04263a'); drawCard(1, 'P2', b, '#ff2bd0', '#3a0430'); sideTex.needsUpdate = true; }
      sdFrame(2, c => {
        const g = c.createRadialGradient(512, 288, 10, 512, 288, 620); g.addColorStop(0, '#2a1a04'); g.addColorStop(1, '#030206'); c.fillStyle = g; c.fillRect(0, 0, 1024, 576);
        rays(c, 512, 288, '#ffb02e', 28, 0.1);
        c.strokeStyle = '#ffb02e'; c.lineWidth = 8; c.beginPath(); c.arc(512, 250, 150, 0, 7); c.stroke();
        c.fillStyle = '#ffcf6a'; c.beginPath();
        for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 46 : 112; c[i ? 'lineTo' : 'moveTo'](512 + Math.cos(a) * rr, 250 + Math.sin(a) * rr); }
        c.closePath(); c.fill();
        bigText(c, 'WORLD ROBOT LEAGUE', 512, 456, 62, '#ffffff', null, '#19d6ff');
        bigText(c, 'FINALE MONDIALE 2026', 512, 522, 36, '#ffcf6a', null, null);
      });
      sdFrame(3, c => {
        const g = c.createRadialGradient(512, 288, 20, 512, 288, 650); g.addColorStop(0, '#6a0c00'); g.addColorStop(1, '#0a0000'); c.fillStyle = g; c.fillRect(0, 0, 1024, 576);
        rays(c, 512, 288, '#ff6a1a', 20, 0.25);
        bigText(c, 'K.O.', 512, 300, 250, goldGrad(c, 180, 420), '#3a0600', '#ff3a10');
      });
      drawSideNames('JOUEUR 1', 'JOUEUR 2');
      const sideMat = new T.ShaderMaterial({
        uniforms: { uMap: { value: sideTex }, uT, uDim, uA0: { value: 0 }, uB0: { value: 0 }, uA1: { value: 1 }, uB1: { value: 1 }, uMix: { value: 1 }, uBright: { value: 1.15 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform sampler2D uMap; uniform float uT, uA0, uB0, uA1, uB1, uMix, uBright, uDim; varying vec2 vUv;
          vec2 fr(float f, vec2 uv){ return vec2((mod(f, 2.0) + uv.x) * 0.5, (1.0 - floor(f / 2.0)) * 0.5 + uv.y * 0.5); }
          void main(){
            float sd = step(1.0, vUv.x);
            vec2 uv = clamp(vec2(vUv.x - sd, vUv.y), 0.003, 0.997);
            float fa = mix(uA0, uA1, sd), fb = mix(uB0, uB1, sd);
            vec3 a = texture2D(uMap, fr(fa, uv)).rgb, b = texture2D(uMap, fr(fb, uv)).rgb;
            float e = 1.0 - uv.y;
            float w = smoothstep(uMix - 0.03, uMix + 0.03, e);
            vec3 c = mix(b, a, w) + vec3(0.7, 0.85, 1.0) * exp(-pow((e - uMix) * 30.0, 2.0)) * step(uMix, 0.999);
            vec2 px = fract(uv * vec2(260.0, 146.0)); c *= 0.78 + 0.22 * smoothstep(0.0, 0.25, px.x) * smoothstep(0.0, 0.25, px.y);
            c *= 0.94 + 0.06 * sin(uv.y * 30.0 + uT * 4.0);
            gl_FragColor = vec4(c * uBright * uDim, 1.0);
          }`
      });
      {
        const pos = [], uv = [], sg = S.group(), metal = S.mat({ color: 0x0e0f14, roughness: 0.45, metalness: 0.7 }), trim = S.glow(0x8fe8ff, 1.3);
        SIDE.x.forEach((sx, k) => {
          const yaw = k ? -SIDE.yaw : SIDE.yaw, ca = Math.cos(yaw), sa = Math.sin(yaw), hw = SIDE.w / 2, hh = SIDE.h / 2;
          const loc = (lx, ly, lz) => [sx + lx * ca + lz * sa, SIDE.y + ly, SIDE.z - lx * sa + lz * ca];
          const P = [loc(-hw, -hh, 1), loc(hw, -hh, 1), loc(hw, hh, 1), loc(-hw, hh, 1)], UV = [[k, 0], [k + 1, 0], [k + 1, 1], [k, 1]];
          for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...P[i]); uv.push(...UV[i]); }
          sg.add(S.mesh(S.g.box(SIDE.w + 26, SIDE.h + 26, 22), metal, { p: [sx - sa * 12, SIDE.y, SIDE.z - ca * 12], r: [0, yaw, 0] }));
          sg.add(S.mesh(S.g.box(SIDE.w + 26, 3, 3), trim, { p: [sx + sa * 0.5, SIDE.y - hh - 13, SIDE.z + ca * 0.5], r: [0, yaw, 0] }));
          for (const lx of [-hw * 0.6, hw * 0.6]) { const q = loc(lx, 0, -14); sg.add(S.mesh(S.g.box(22, SIDE.y - hh - PIT, 22), metal, { p: [q[0], (PIT + SIDE.y - hh) / 2, q[2]], r: [0, yaw, 0] })); }
          for (const lx of [-hw * 0.8, hw * 0.8]) { const q = loc(lx, 0, -6); sg.add(S.mesh(S.g.cyl(2, 2, 1200, 6), metal, { p: [q[0], SIDE.y + hh + 600, q[2]] })); }
        });
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
        const sm = S.mesh(g, sideMat); sm.userData.noMerge = true; root.add(sm);
        stat.add(sg);
      }
      // --- écran géant : structure ---
      const jbScreenMat = new T.ShaderMaterial({
        uniforms: { uMap: { value: jbTex }, uT, uDim, uA: { value: 0 }, uB: { value: 0 }, uMix: { value: 1 }, uBright: { value: 1.25 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform sampler2D uMap; uniform float uT, uA, uB, uMix, uBright, uDim; varying vec2 vUv;
          vec2 fr(float f, vec2 uv){ return vec2((mod(f, 2.0) + uv.x) * 0.5, (1.0 - floor(f / 2.0)) * 0.5 + uv.y * 0.5); }
          void main(){
            vec2 uv = clamp(vUv, 0.003, 0.997);
            float e = uv.x * 0.8 + uv.y * 0.2;
            vec3 a = texture2D(uMap, fr(uA, uv)).rgb, b = texture2D(uMap, fr(uB, uv)).rgb;
            float w = smoothstep(uMix - 0.02, uMix + 0.02, e);
            vec3 c = mix(b, a, w) + vec3(0.6, 0.8, 1.0) * exp(-pow((e - uMix) * 40.0, 2.0)) * step(uMix, 0.999) * 1.5;
            c *= 0.93 + 0.07 * sin(vUv.y * 420.0 - uT * 6.0);
            gl_FragColor = vec4(c * uBright * uDim, 1.0);
          }`
      });
      {
        const jb = S.group(), metal = S.mat({ color: 0x0d0e12, roughness: 0.4, metalness: 0.7 });
        const { x, z, w, y0, y1, ins, yb } = JB, h = w / 2;
        // caisson vertical + écrans verticaux (4 faces)
        jb.add(S.mesh(S.g.box(w + 30, y1 - y0 + 40, w + 30), metal, { p: [x, (y0 + y1) / 2, z] }));
        const vs = new T.PlaneGeometry(w, y1 - y0);
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; jb.add(S.mesh(vs, jbScreenMat, { p: [x + Math.sin(a) * (h + 16), (y0 + y1) / 2 + 6, z + Math.cos(a) * (h + 16)], r: [0, a, 0] })); }
        // dessous incliné (tronc de pyramide) : 4 écrans trapézoïdaux tournés vers le plateau
        const pos = [], uv = [], rIn = ins / w;
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
          const loc = (lx, ly, lz) => [x + lx * ca + lz * sa, ly, z - lx * sa + lz * ca];
          const P = [loc(-h, y0, h), loc(h, y0, h), loc(h - ins, yb, h - ins), loc(-h + ins, yb, h - ins)];
          const UV = [[0, 1], [1, 1], [1 - rIn, 0], [rIn, 0]];
          for (const i of [0, 3, 2, 0, 2, 1]) { pos.push(...P[i]); uv.push(...UV[i]); }
        }
        const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); tg.computeVertexNormals();
        jb.add(S.mesh(tg, jbScreenMat));
        // plaque inférieure avec couronne de projecteurs
        const under = S.canvasTex(512, 512, (c) => {
          c.fillStyle = '#060608'; c.fillRect(0, 0, 512, 512);
          c.strokeStyle = '#1c1e26'; c.lineWidth = 6; c.strokeRect(20, 20, 472, 472);
          for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, px = 256 + Math.cos(a) * 170, py = 256 + Math.sin(a) * 170; const g = c.createRadialGradient(px, py, 0, px, py, 16); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#ffe2b0'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(px - 16, py - 16, 32, 32); }
          c.strokeStyle = '#ff2bd0'; c.lineWidth = 5; c.beginPath(); c.arc(256, 256, 110, 0, 7); c.stroke();
          c.strokeStyle = '#19d6ff'; c.beginPath(); c.arc(256, 256, 96, 0, 7); c.stroke();
        });
        const uw = w - 2 * ins;
        jb.add(S.mesh(new T.PlaneGeometry(uw, uw), S.basic({ map: under, color: new T.Color(2.2, 2.2, 2.2), toneMapped: false, fog: false }), { p: [x, yb - 0.5, z], r: [Math.PI / 2, 0, 0] }));
        // anneaux LED (bas du dessous + jonction)
        const ringMat = ledMat({ row: 2, speed: 0.025, bright: 1.6 });
        const ring = (half, y0r, y1r) => {
          const P = [[-half, half], [half, half], [half, -half], [-half, -half], [-half, half]].map(([a, b]) => [x + a, z + b]);
          const g = ribbonPoly(P, y0r, y1r, 0); const uvr = g.attributes.uv; for (let i = 0; i < uvr.count; i++) uvr.setX(i, uvr.getX(i) * 100 / (y1r - y0r));
          return g;
        };
        const r1 = S.mesh(ring(uw / 2 + 1, yb - 22, yb), ringMat); r1.userData.noMerge = true; root.add(r1);
        const r2 = S.mesh(ring(h + 17, y0 - 34, y0 - 4), ringMat); r2.userData.noMerge = true; root.add(r2);
        // élingues
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) jb.add(S.mesh(S.g.cyl(2.5, 2.5, 1600, 6), metal, { p: [x + a * h * 0.8, y1 + 800, z + b * h * 0.8] }));
        S.merge(jb); root.add(jb);
      }
      root.add(S.merge(stat));

      // --- barrières LED (bord des tribunes) et ruban de la coursive ---
      const boardMat = ledMat({ row: 0, speed: 0.035, bright: 0.8, panel: 4 });
      const boards = S.mesh(stripAlong(US, -1, PIT, -6), boardMat); boards.userData.noMerge = true; root.add(boards);
      const ribbonMat = ledMat({ row: 2, speed: -0.02, bright: 1.15 });
      const ribbon = S.mesh(stripAlong(US, FASCIA.r - 1, FASCIA.y0 + 16, FASCIA.y1 - 18), ribbonMat); ribbon.userData.noMerge = true; root.add(ribbon);

      /* =========================================================
         FOULE (instances animées sur GPU)
         ========================================================= */
      const fans = [];   // [x, y, z, phase, variant, energie, onde]
      {
        const sp = [58, 64, 74][Q] || 58;
        const visible = (x, z) => x > 280 - 0.62 * (690 - z) && x < 1020 + 0.62 * (690 - z);
        const aisles = []; for (let s = -2700; s <= 2700; s += 900) aisles.push(s);
        ROWS.forEach((R, n) => {
          const r = R.r, sm = smax(r), off = (n % 2) * sp * 0.5;
          const ais = aisles.map(s => arcAt(uFromArc(s, 0), r));
          for (let s = -sm + off; s <= sm; s += sp) {
            if (ais.some(a => Math.abs(a - s) < 46)) continue;
            if (rnd() < 0.04) continue;  // sièges vides
            const p = cpt(uFromArc(s, r), r + (rnd() - 0.5) * 14);
            const x = p[0] + (rnd() - 0.5) * 10, z = p[1];
            if (!visible(x, z)) continue;
            fans.push([x, R.y, z, rnd(), Math.floor(rnd() * 6) + 0.5, rnd(), s / 1000]);
          }
        });
        // photographes dans la fosse (sur une estrade : têtes et appareils dépassent du bord du plateau)
        for (let i = 0; i < 22; i++) {
          const x = -420 + i * 100 + (rnd() - 0.5) * 50;
          if (x > 1720) break;
          fans.push([x, PIT + 6 + rnd() * 12, EZ - 90 - rnd() * 90, rnd(), 6.5 + (rnd() < 0.4 ? 1 : 0), 0.0, 9]);
        }
      }
      const NF = fans.length;
      const crowdMat = new T.ShaderMaterial({
        uniforms: Object.assign({
          uMap: { value: crowdTex }, uT, uExc, uCam, uWave: { value: 0 }, uWaveX: { value: -9 },
          uB: { value: Array.from({ length: 8 }, () => new T.Vector4(0, -9999, 0, 1)) }, uBC: { value: Array.from({ length: 8 }, () => new T.Vector3()) },
          uAmb: { value: new T.Vector3(0.0045, 0.005, 0.011) }, uSpL: { value: new T.Vector3(0.0, 0.02, 0.036) }, uSpR: { value: new T.Vector3(0.036, 0.004, 0.027) },
          uRimC: { value: new T.Vector3(0.014, 0.016, 0.042) }, uFlash: { value: 0 },
          uJP: { value: new T.Vector3(JB.x, JB.yb, JB.z) }, uJC: { value: new T.Vector3(0.06, 0.045, 0.03) }
        }, FOGU),
        vertexShader: `${FOG_V}
          uniform float uT, uExc, uWave, uWaveX, uFlash; uniform vec3 uCam, uAmb, uSpL, uSpR, uJP, uJC, uRimC; uniform vec4 uB[8]; uniform vec3 uBC[8];
          attribute vec3 iPos; attribute vec4 iRnd;
          varying vec2 vUv; varying vec3 vL; varying vec3 vR; varying vec3 vShirt;
          vec3 pal(float k){
            if (k < 0.34) return vec3(0.10, 0.11, 0.14);
            if (k < 0.48) return vec3(0.15, 0.75, 1.0);
            if (k < 0.60) return vec3(1.0, 0.2, 0.8);
            if (k < 0.70) return vec3(1.0, 0.7, 0.2);
            if (k < 0.80) return vec3(0.9, 0.9, 0.95);
            if (k < 0.90) return vec3(0.8, 0.1, 0.12);
            return vec3(0.2, 0.25, 0.5);
          }
          void main(){
            float ph = iRnd.x * 6.2832, cell = floor(iRnd.y), en = iRnd.z;
            bool photo = cell > 5.5;
            float hype = clamp(uExc * 1.25 + en * 0.7 - 0.55, 0.0, 1.0);
            float wave = photo ? 0.0 : uWave * exp(-pow((iRnd.w - uWaveX) * 2.2, 2.0));
            float jump = photo ? 0.0 : max(0.0, sin(uT * (6.5 + 3.0 * en) + ph)) * (3.0 + 26.0 * hype * hype) + wave * 34.0;
            float upSel = fract(iRnd.x * 13.1 + floor(uT * (0.45 + en * 0.5) + en * 7.0) * 0.618);
            float up = (upSel < hype * 0.85 || wave > 0.35) ? 1.0 : 0.0;
            if (photo) up = step(0.8, fract(iRnd.x * 7.7 + floor(uT * 0.3 + iRnd.x * 9.0) * 0.618));
            vec3 base = iPos; base.y += jump;
            vec3 tc = uCam - base; tc.y = 0.0; tc = normalize(tc);
            vec3 rgt = vec3(tc.z, 0.0, -tc.x);
            float sc = 0.9 + 0.2 * fract(iRnd.x * 7.31);
            vec3 wp = base + rgt * position.x * 100.0 * sc + vec3(0.0, position.y * 200.0 * sc, 0.0);
            vec4 mv = modelViewMatrix * vec4(wp, 1.0);
            gl_Position = projectionMatrix * mv;
            vFog = smoothstep(uFogN, uFogF, -mv.z);
            vUv = vec2((cell + uv.x) / 8.0, (1.0 - up) * 0.5 + uv.y * 0.5);
            // éclairage de la foule (dans la pénombre) : ambiance, débord du plateau sur les premiers rangs, écran géant,
            // poursuites qui balaient les gradins (seules vraies sources fortes), flashs du K.O.
            float h = iPos.y + 150.0;
            vec3 spill = mix(uSpL, uSpR, smoothstep(150.0, 1150.0, iPos.x)) * exp(-h / 200.0);
            vec3 L = (uAmb + spill) * mix(1.0, 0.35, smoothstep(0.0, 1200.0, h));
            L += uJC * exp(-distance(iPos, uJP) / 650.0);
            vec3 hp = iPos + vec3(0.0, 110.0, 0.0), B = vec3(0.0);
            for (int i = 0; i < 8; i++) { float d = distance(hp, uB[i].xyz); B += uBC[i] * (1.0 - smoothstep(uB[i].w * 0.3, uB[i].w, d)); }
            float fl = uFlash * step(0.55, fract(iRnd.x * 31.7 + floor(uT * 9.0) * 0.37));
            L = L * (1.0 + uExc * 0.4) + B + vec3(fl * 0.25);
            vR = uRimC * mix(1.0, 0.45, smoothstep(0.0, 1300.0, h)) + spill * 0.7 + B * 0.8 + vec3(fl * 0.3);
            if (photo) { L = vec3(0.003, 0.0035, 0.005) + spill * 0.4; vR = mix(vec3(0.0, 0.12, 0.2), vec3(0.2, 0.02, 0.14), smoothstep(300.0, 1000.0, iPos.x)) * 0.35; }
            vL = L;
            vShirt = pal(fract(iRnd.x * 17.3 + en * 3.1));
          }`,
        fragmentShader: `${FOG_F} uniform sampler2D uMap; varying vec2 vUv; varying vec3 vL; varying vec3 vR; varying vec3 vShirt;
          void main(){
            vec4 tx = texture2D(uMap, vUv);
            if (tx.a < 0.42) discard;
            vec3 c = vL * mix(0.16, 0.8, tx.g) * mix(vec3(1.0), vShirt * 1.2, tx.g * 0.85) + vL * tx.b * 2.0 + vR * tx.r * 1.7;
            gl_FragColor = vec4(mix(c, uFogC, vFog), 1.0);
          }`
      });
      {
        const qg = new T.InstancedBufferGeometry();
        qg.setAttribute('position', new T.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
        qg.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
        qg.setIndex([0, 1, 2, 0, 2, 3]);
        const ip = new Float32Array(NF * 3), ir = new Float32Array(NF * 4);
        fans.forEach((f, i) => { ip.set([f[0], f[1], f[2]], i * 3); ir.set([f[3], f[4], f[5], f[6]], i * 4); });
        qg.setAttribute('iPos', new T.InstancedBufferAttribute(ip, 3)); qg.setAttribute('iRnd', new T.InstancedBufferAttribute(ir, 4));
        qg.instanceCount = NF;
        const cm = new T.Mesh(qg, crowdMat); cm.frustumCulled = false; cm.userData.noMerge = true; root.add(cm);
      }

      /* =========================================================
         LUMIÈRES PONCTUELLES : téléphones, flashs, marches éclairées
         ========================================================= */
      {
        const P = [], SD = [], KD = [];
        fans.forEach(f => {
          const photo = f[4] > 6;
          if (photo) { P.push(f[0] - 6, f[1] + 150, f[2] + 6); SD.push(rnd()); KD.push(2); return; }
          const k = rnd();
          if (k < 0.2) { P.push(f[0] + (rnd() - 0.5) * 40, f[1] + 165 + rnd() * 30, f[2] + 4); SD.push(rnd()); KD.push(0); }
          else if (k < 0.29) { P.push(f[0] + (rnd() - 0.5) * 20, f[1] + 160, f[2] + 4); SD.push(rnd()); KD.push(1); }
        });
        // marches éclairées des allées
        for (let s = -2700; s <= 2700; s += 900) ROWS.forEach((R, n) => { if (n % 2) return; const r = R.r - 40, p = cpt(uFromArc(arcAt(uFromArc(s, 0), r), r), r); P.push(p[0], R.y + 3, p[1]); SD.push(rnd()); KD.push(3); });
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('aSeed', new T.Float32BufferAttribute(SD, 1)); g.setAttribute('aKind', new T.Float32BufferAttribute(KD, 1));
        const m = new T.ShaderMaterial({
          uniforms: Object.assign({ uT, uExc, uDim, uH: { value: 540 } }, FOGU),
          vertexShader: `${FOG_V} uniform float uT, uExc, uH; attribute float aSeed, aKind; varying float vI; varying vec3 vC; varying float vStar;
            void main(){
              vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
              vFog = smoothstep(uFogN, uFogF, -mv.z);
              float I = 0.0, sz = 4.0; vStar = 0.0; vC = vec3(0.75, 0.85, 1.0);
              if (aKind < 0.5) { I = (0.55 + 0.45 * sin(uT * (0.8 + aSeed * 2.0) + aSeed * 60.0)) * step(0.45 - uExc * 0.4, fract(aSeed * 13.7)) * 1.6; sz = 5.0; }
              else if (aKind < 2.5) {
                float rate = aKind < 1.5 ? (0.04 + uExc * uExc * 0.7) : (0.18 + uExc * 1.2);
                float p = fract(uT * rate * (0.7 + aSeed * 0.6) + aSeed * 17.0);
                I = pow(max(0.0, 1.0 - p * 22.0), 2.0) * 9.0; sz = aKind < 1.5 ? 22.0 : 34.0; vStar = 1.0; vC = vec3(1.0, 0.97, 0.92);
              } else { I = 0.9; sz = 4.0; vC = vec3(0.35, 0.6, 1.0); }
              vI = I * (1.0 - vFog * 0.6);
              gl_PointSize = max(1.6, sz * projectionMatrix[1][1] * uH * 0.5 / -mv.z);
            }`,
          fragmentShader: `uniform float uDim; varying float vI; varying vec3 vC; varying float vStar;
            void main(){
              vec2 c = gl_PointCoord - 0.5; float r = length(c);
              float a = smoothstep(0.5, 0.0, r);
              if (vStar > 0.5) a = exp(-r * r * 60.0) + 0.5 * exp(-abs(c.x) * 40.0) * exp(-abs(c.y) * 5.0) + 0.5 * exp(-abs(c.y) * 40.0) * exp(-abs(c.x) * 5.0);
              if (vI * a < 0.004) discard;
              gl_FragColor = vec4(vC * vI * a * uDim, 1.0);
            }`,
          transparent: true, depthWrite: false, blending: T.AdditiveBlending
        });
        const pts = new T.Points(g, m); pts.frustumCulled = false; pts.userData.noMerge = true; pts.renderOrder = -2; root.add(pts);
        S.onUpdate((t, info) => { m.uniforms.uH.value = info.h || 540; });
      }

      /* =========================================================
         POURSUITES (faisceaux volumétriques) + taches au sol
         ========================================================= */
      const NB = 8;
      const coneGeo = new T.CylinderGeometry(0.035, 1, 1, 28, 1, true); coneGeo.translate(0, -0.5, 0);
      const beamMat = new T.ShaderMaterial({
        uniforms: Object.assign({ uDim }, FOGU),
        vertexShader: `${FOG_V} varying float vA; varying vec3 vN; varying vec3 vV; varying vec3 vCol;
          void main(){
            mat4 m = modelMatrix * instanceMatrix;
            vec4 w = m * vec4(position, 1.0);
            vN = normalize(mat3(m) * normal); vV = normalize(cameraPosition - w.xyz);
            vA = -position.y; vCol = instanceColor;
            vec4 mv = viewMatrix * w; gl_Position = projectionMatrix * mv;
            vFog = smoothstep(uFogN, uFogF * 1.4, -mv.z);
          }`,
        fragmentShader: `uniform float uDim; varying float vA; varying vec3 vN; varying vec3 vV; varying vec3 vCol; varying float vFog;
          void main(){
            float e = abs(dot(normalize(vN), normalize(vV)));
            float a = pow(e, 2.2) * smoothstep(0.0, 0.06, vA) * (1.0 - smoothstep(0.7, 1.0, vA)) * (0.4 + 0.6 * (1.0 - vA));
            gl_FragColor = vec4(vCol * a * (1.0 - vFog * 0.8) * uDim, 1.0);
          }`,
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
      });
      const beams = new T.InstancedMesh(coneGeo, beamMat, NB);
      beams.frustumCulled = false; beams.userData.noMerge = true; beams.renderOrder = -1.5;
      for (let i = 0; i < NB; i++) beams.setColorAt(i, COL.wh);
      root.add(beams);
      const BEAMS = [
        { a: [-300, 1250, -1150], stage: 1, ph: 0.0 }, { a: [250, 1300, -1350], stage: 1, ph: 1.9 }, { a: [1050, 1300, -1350], stage: 1, ph: 3.7 }, { a: [1600, 1250, -1150], stage: 1, ph: 5.1 },
        { a: [-700, 1350, -1500], stage: 0, ph: 0.7, u0: -1500 }, { a: [400, 1400, -1700], stage: 0, ph: 2.3, u0: -300 }, { a: [900, 1400, -1700], stage: 0, ph: 4.1, u0: 500 }, { a: [2000, 1350, -1500], stage: 0, ph: 5.7, u0: 1600 }
      ];
      // taches de lumière des poursuites sur le plateau
      const poolGeo = new T.PlaneGeometry(2, 2); poolGeo.rotateX(-Math.PI / 2);
      const poolMat = new T.ShaderMaterial({
        uniforms: { uDim },
        vertexShader: 'varying vec2 vUv; varying vec3 vCol; void main(){ vUv = uv; vCol = instanceColor; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uDim; varying vec2 vUv; varying vec3 vCol; void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.55, r) * 0.55 + smoothstep(0.5, 0.0, r) * 0.25; gl_FragColor = vec4(vCol * a * uDim, 1.0); }',
        transparent: true, depthWrite: false, blending: T.AdditiveBlending
      });
      const pools = new T.InstancedMesh(poolGeo, poolMat, 4);
      pools.frustumCulled = false; pools.userData.noMerge = true; pools.renderOrder = -2.8;
      for (let i = 0; i < 4; i++) pools.setColorAt(i, COL.wh);
      root.add(pools);

      /* ---------- lasers : depuis le dessous de l'écran géant et le haut des écrans latéraux, vers les gradins hauts
         (toujours au-dessus de la tête des combattants à l'image) ---------- */
      const NL = 16;
      const laserGeo = new T.CylinderGeometry(1, 1, 1, 4, 1, true); laserGeo.translate(0, 0.5, 0);
      const laserMat = new T.ShaderMaterial({
        uniforms: { uDim },
        vertexShader: 'varying float vA; varying vec3 vCol; void main(){ vA = position.y; vCol = instanceColor; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uDim; varying float vA; varying vec3 vCol; void main(){ float f = smoothstep(0.0, 0.015, vA) * (1.0 - 0.55 * vA); gl_FragColor = vec4(vCol * f * uDim, 1.0); }',
        transparent: true, depthWrite: false, blending: T.AdditiveBlending
      });
      const lasers = new T.InstancedMesh(laserGeo, laserMat, NL);
      lasers.frustumCulled = false; lasers.userData.noMerge = true; lasers.renderOrder = -1.4;
      for (let i = 0; i < NL; i++) lasers.setColorAt(i, COL.cy);
      root.add(lasers);
      const LEMIT = [[CX - 268, JB.yb - 8, JB.z + 268], [CX + 268, JB.yb - 8, JB.z + 268], [SIDE.x[0] + 60, SIDE.y + SIDE.h / 2 + 30, SIDE.z + 30], [SIDE.x[1] - 60, SIDE.y + SIDE.h / 2 + 30, SIDE.z + 30]];
      // têtes de projection laser (petites lueurs)
      {
        const lh = S.glow(0xffffff, 2.2), hg = S.group();
        LEMIT.forEach(e => hg.add(S.mesh(S.g.sphere(7, 10, 8), lh, { p: e })));
        root.add(S.merge(hg));

      }

      /* ---------- brume ---------- */
      const hazeTex = S.canvasTex(256, 256, (c) => {
        c.fillStyle = '#000'; c.fillRect(0, 0, 256, 256);
        const r2 = S.rng(77);
        for (let i = 0; i < 70; i++) {
          const x = r2() * 256, y = r2() * 256, rr = 20 + r2() * 60, a = 0.05 + r2() * 0.12;
          for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x + ox - rr, y + oy - rr, rr * 2, rr * 2); }
        }
      }, { repeat: [1, 1], srgb: false });
      const hazeMat = (col, o, sx, sy, sp) => new T.ShaderMaterial({
        uniforms: { uMap: { value: hazeTex }, uT, uDim, uC: { value: new T.Color(col) }, uO: { value: o }, uS: { value: new T.Vector2(sx, sy) }, uSp: { value: sp } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform sampler2D uMap; uniform float uT, uO, uSp, uDim; uniform vec3 uC; uniform vec2 uS; varying vec2 vUv;
          void main(){
            float n = texture2D(uMap, vUv * uS + vec2(uT * uSp, uT * uSp * 0.3)).r * 1.4 + texture2D(uMap, vUv * uS * 0.53 - vec2(uT * uSp * 0.6, 0.0)).r;
            float f = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.45, vUv.y) * smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
            gl_FragColor = vec4(uC * n * f * uO * uDim, 1.0);
          }`,
        transparent: true, depthWrite: false, blending: T.AdditiveBlending
      });
      const hz = [
        [[CX, 40, -760], [4600, 360], 0x4a2c8a, 0.3, [6, 0.6], 0.012],
        [[CX, 300, -1640], [6800, 1000], 0x2c2a6c, 0.2, [7, 1.0], 0.008],
        [[CX, 800, -2900], [9000, 1700], 0x22225a, 0.26, [6, 1.1], 0.005]
      ];
      hz.slice(0, Q >= 2 ? 2 : 3).forEach(([p, s, col, o, sc, sp]) => { const m = S.mesh(new T.PlaneGeometry(s[0], s[1]), hazeMat(col, o, sc[0], sc[1], sp), { p }); m.userData.noMerge = true; m.renderOrder = -1.2; root.add(m); });

      /* ---------- K.O. / entrée : gerbes d'étincelles + confettis ---------- */
      const uKo = { value: 99 }, uIn = { value: 99 };
      const fxPts = (n, kind) => {
        const P = new Float32Array(n * 3), SD = new Float32Array(n * 4), r2 = S.rng(kind === 0 ? 31 : 57);
        for (let i = 0; i < n; i++) { SD.set([r2(), r2(), r2(), r2()], i * 4); }
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('aS', new T.BufferAttribute(SD, 4));
        const m = new T.ShaderMaterial({
          uniforms: { uT, uKo, uIn, uDim, uH: { value: 540 } },
          vertexShader: kind === 0 ? `uniform float uT, uKo, uIn, uH; attribute vec4 aS; varying float vI; varying vec3 vC;
            void main(){
              // gerbes : 6 lanceurs sur le bord arrière, cycles de 1.1 s pendant 4 s
              float tk = min(uKo, uIn);
              float L = floor(aS.x * 6.0); vec3 o = vec3(-150.0 + L * 320.0, 34.0, ${EZ - 30}.0);
              float age = fract(uT / 1.1 + aS.y);
              float a = aS.z * 6.2832, sp = 60.0 + aS.w * 140.0;
              vec3 v = vec3(cos(a) * sp, 650.0 + aS.w * 520.0, sin(a) * sp * 0.6 - 30.0);
              vec3 p = o + v * age + vec3(0.0, -900.0, 0.0) * age * age;
              float on = step(tk, 4.0) * step(0.0, tk) * step(age * 1.1, tk + 0.001);
              vI = on * (1.0 - age) * 5.0; vC = mix(vec3(1.0, 0.85, 0.5), vec3(1.0, 0.4, 0.1), age);
              vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
              gl_PointSize = on > 0.0 ? max(1.5, 6.0 * projectionMatrix[1][1] * uH * 0.5 / -mv.z) : 0.0;
            }` : `uniform float uT, uKo, uH; attribute vec4 aS; varying float vI; varying vec3 vC;
            void main(){
              // confettis : 2 canons aux coins arrière du plateau, freinage de l'air puis chute lente en voletant
              float tk = uKo;
              float side = aS.x < 0.5 ? -1.0 : 1.0;
              vec3 o = vec3(side < 0.0 ? -270.0 : 1570.0, 40.0, ${EZ - 20}.0);
              float a = (aS.y - 0.5) * 1.3, el = 1.0 + aS.z * 0.45, sp = 900.0 + aS.w * 900.0;
              vec3 v = vec3(-side * cos(el) * cos(a) * sp * 0.55 , sin(el) * sp, -abs(sin(a)) * sp * 0.6 - 120.0);
              float k = 1.6, e = (1.0 - exp(-k * tk)) / k;
              vec3 p = o + v * e + vec3(sin(uT * 3.0 + aS.y * 40.0) * 30.0, -95.0 * (tk - e), cos(uT * 2.3 + aS.z * 30.0) * 20.0);
              float on = step(0.0, tk) * step(tk, 14.0) * step(-80.0, p.y);
              vI = on * (0.7 + 0.5 * sin(uT * 12.0 + aS.w * 50.0));
              float hue = fract(aS.w * 5.0);
              vC = hue < 0.25 ? vec3(1.0, 0.75, 0.2) : hue < 0.5 ? vec3(1.0, 0.2, 0.8) : hue < 0.75 ? vec3(0.2, 0.85, 1.0) : vec3(1.0);
              vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
              gl_PointSize = on > 0.0 ? max(1.5, 9.0 * projectionMatrix[1][1] * uH * 0.5 / -mv.z) : 0.0;
            }`,
          fragmentShader: kind === 0 ? 'uniform float uDim; varying float vI; varying vec3 vC; void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, r); gl_FragColor = vec4(vC * vI * a * uDim, 1.0); }'
            : 'uniform float uDim; varying float vI; varying vec3 vC; void main(){ vec2 c = abs(gl_PointCoord - 0.5); if (c.x > 0.45 || c.y > 0.22 + 0.2 * vI) discard; gl_FragColor = vec4(vC * (0.25 + 0.5 * vI) * uDim, 1.0); }',
          transparent: kind === 0, depthWrite: kind !== 0, blending: kind === 0 ? T.AdditiveBlending : T.NormalBlending
        });
        const pts = new T.Points(g, m); pts.frustumCulled = false; pts.userData.noMerge = true; pts.renderOrder = -1;
        S.onUpdate((t, info) => { m.uniforms.uH.value = info.h || 540; });
        return pts;
      };
      root.add(fxPts(Q >= 2 ? 500 : 1100, 0));
      root.add(fxPts(Q >= 2 ? 500 : 1300, 1));

      /* =========================================================
         ANIMATION
         ========================================================= */
      const V3 = new T.Vector3(), V3b = new T.Vector3(), DOWN = new T.Vector3(0, -1, 0), UP = new T.Vector3(0, 1, 0), QT = new T.Quaternion(), M4 = new T.Matrix4(), SC = new T.Vector3(), TC = new T.Color(), TC2 = new T.Color();
      const BCOL = [COL.mg, COL.cy, COL.gd, COL.wh, COL.vi];
      const JSEQ = [0, 2, 1, 2];
      let koT0 = -1, wasKo = false, inT0 = -1, lastF = null, exc = 0.3, nameKey = '';
      const winnerX = (F) => { if (!F || !F.p) return CX; const w = F.p.find(f => !f.ko); return w ? w.x : CX; };
      function update(t, info) {
        uT.value = t;
        if (info.camera) uCam.value.copy(info.camera.position);
        const dk = 1 - (1 - (info.dim == null ? 1 : info.dim)) * 0.74 / 0.7; uDim.value = Math.max(0.2, dk);
        if (t < koT0) koT0 = -1;
        const ko = !!info.ko;
        if (ko && !wasKo) koT0 = t;
        wasKo = ko;
        const F = info.F;
        if (F && F !== lastF) { lastF = F; inT0 = t; }
        if (F && F.p && F.p.length > 1) {
          const k = F.p[0].ch.name + '|' + F.p[1].ch.name;
          if (k !== nameKey) { nameKey = k; drawNames(F.p[0].ch.name, F.p[1].ch.name, '#19d6ff', '#ff2bd0'); jbTex.needsUpdate = true; drawSideNames(F.p[0].ch.name, F.p[1].ch.name); }
        }
        const tk = koT0 >= 0 ? t - koT0 : 99;
        uKo.value = tk; uIn.value = inT0 >= 0 ? t - inT0 - 0.6 : 99;
        const tgt = ko ? 1 : info.superBy ? 0.8 : 0.32;
        exc += (tgt - exc) * Math.min(1, (info.dt || 1 / 60) * 2.2); uExc.value = exc;
        // ola de temps en temps
        const wc = t % 26; crowdMat.uniforms.uWave.value = ko ? 0 : Math.min(1, wc / 1.5) * Math.min(1, Math.max(0, (11 - wc) / 1.5)) * (wc < 11 ? 1 : 0);
        crowdMat.uniforms.uWaveX.value = -3.2 + wc * 0.6;
        // écran géant
        const slot = Math.floor(t / 5.5);
        if (ko) { jbScreenMat.uniforms.uA.value = JSEQ[Math.floor(koT0 / 5.5) % 4]; jbScreenMat.uniforms.uB.value = 3; jbScreenMat.uniforms.uMix.value = Math.min(1, tk / 0.35); }
        else { jbScreenMat.uniforms.uA.value = JSEQ[(slot + 3) % 4]; jbScreenMat.uniforms.uB.value = JSEQ[slot % 4]; jbScreenMat.uniforms.uMix.value = Math.min(1, (t - slot * 5.5) / 0.6); }
        jbScreenMat.uniforms.uBright.value = 1.2 + (ko ? 0.5 * (0.5 + 0.5 * Math.sin(t * 18)) : 0);
        // écrans latéraux : carte du combattant / logo, carte du combattant en SUPER, K.O.
        {
          const U = sideMat.uniforms, s6 = Math.floor(t / 6.5), sbI = info.superBy && F && F.p ? F.p.indexOf(info.superBy) : -1;
          if (ko) { U.uA0.value = U.uA1.value = 3; U.uMix.value = Math.min(1, tk / 0.4); }
          else if (sbI >= 0) { U.uA0.value = U.uA1.value = sbI; U.uMix.value = 1; }
          else {
            const f0 = s6 % 2 ? 2 : 0, f1 = s6 % 2 ? 1 : 2, p0 = (s6 + 1) % 2 ? 2 : 0, p1 = (s6 + 1) % 2 ? 1 : 2;
            U.uA0.value = f0; U.uA1.value = f1; U.uB0.value = p0; U.uB1.value = p1; U.uMix.value = Math.min(1, (t - s6 * 6.5) / 0.7);
          }
          U.uBright.value = 1.1 + (ko ? 0.4 * (0.5 + 0.5 * Math.sin(t * 18)) : 0);
        }

        // bandes LED : alternance des pubs, K.O. au K.O.
        const bslot = Math.floor(t / 8);
        if (ko) { boardMat.uniforms.uRowA.value = bslot % 2; boardMat.uniforms.uRowB.value = 3; boardMat.uniforms.uMix.value = Math.min(1.1, tk / 0.5); boardMat.uniforms.uBright.value = 1.2 + 0.5 * (Math.sin(t * 16) > 0 ? 1 : 0); }
        else { boardMat.uniforms.uRowA.value = (bslot + 1) % 2; boardMat.uniforms.uRowB.value = bslot % 2; boardMat.uniforms.uMix.value = Math.min(1.1, (t - bslot * 8) / 0.8); boardMat.uniforms.uBright.value = 0.8; }
        edgeMat.uniforms.uKo.value = ko ? Math.max(0, 1 - tk / 3) : 0;
        // poursuites
        const sb = info.superBy, wx = winnerX(F);
        const cslot = t / 12.6, ci = Math.floor(cslot), cf = Math.min(1, (cslot - ci) * 6);
        let pi = 0;
        for (let i = 0; i < NB; i++) {
          const b = BEAMS[i];
          let tx, ty, tz, R, I;
          if (b.stage || ko || sb) {
            if (ko || sb) { const fx = ko ? wx : sb.x; tx = fx + Math.sin(t * 1.3 + b.ph) * 40 + (i - 3.5) * 14; tz = -150 + Math.cos(t + b.ph) * 30; R = 120; }
            else { tx = CX + Math.sin(t * 0.33 + b.ph) * 560; tz = -320 + Math.sin(t * 0.47 + b.ph * 1.3) * 140; R = 135; }
            ty = 0; I = b.stage ? 0.3 : 0.22;
          } else {
            const u = b.u0 + Math.sin(t * 0.21 + b.ph) * 900, row = 6 + 8 * (0.5 + 0.5 * Math.sin(t * 0.37 + b.ph * 1.7));
            const rr = rowAt(row), p = cpt(Math.max(-UMAX, Math.min(UMAX, u)), rr[0]);
            tx = p[0]; tz = p[1]; ty = rr[1] + 100; R = 260; I = 0.2;
          }
          V3.set(tx - b.a[0], ty - b.a[1], tz - b.a[2]); const len = V3.length(); V3.multiplyScalar(1 / len);
          QT.setFromUnitVectors(DOWN, V3); SC.set(R, len, R); V3b.set(b.a[0], b.a[1], b.a[2]);
          M4.compose(V3b, QT, SC); beams.setMatrixAt(i, M4);
          TC.copy(BCOL[(ci + i) % 5]).lerp(BCOL[(ci + i + 1) % 5], 0); TC2.copy(BCOL[(ci + i + 4) % 5]); TC.lerp(TC2, 1 - cf);
          if (sb && sb.ch && !ko) TC.set(sb.ch.accent);
          if (ko) TC.copy(COL.wh);
          const ii = I * (0.85 + 0.15 * Math.sin(t * 2 + i));
          TC2.copy(TC).multiplyScalar(ii); beams.setColorAt(i, TC2);
          const U = crowdMat.uniforms;
          if (!b.stage && !ko && !sb) { U.uB.value[i].set(tx, ty, tz, R * 1.5); U.uBC.value[i].set(TC.r, TC.g, TC.b).multiplyScalar(0.6); }

          else U.uBC.value[i].set(0, 0, 0);
          if (b.stage && pi < 4) {
            M4.compose(V3b.set(tx, 0.9, tz), QT.identity(), SC.set(R * 1.15, 1, R * 1.15)); pools.setMatrixAt(pi, M4);
            TC2.copy(TC).multiplyScalar(0.55); pools.setColorAt(pi, TC2); pi++;
          }
        }
        beams.instanceMatrix.needsUpdate = true; beams.instanceColor.needsUpdate = true;
        pools.instanceMatrix.needsUpdate = true; pools.instanceColor.needsUpdate = true;
        // lasers : salves régulières, pendant les SUPER (couleur du combattant) et en continu pendant le K.O.
        const lc = t % 15, lon = (ko || sb) ? 1 : Math.min(1, lc / 0.3) * Math.min(1, Math.max(0, (3.6 - lc) / 0.4)) * (lc < 3.6 ? 1 : 0);
        const ls = ko ? 2.2 : 1;
        for (let i = 0; i < NL; i++) {
          const ei = i >> 2, e = LEMIT[ei], k = i & 3, sd = ei % 2 ? 1 : -1;
          let u, row;
          if (ei < 2) { u = sd * (250 + k * 480 + 360 * Math.sin(t * (0.8 + 0.25 * k) * ls + k * 1.7 + ei)); row = 13 + 10 * (0.5 + 0.5 * Math.sin(t * (1.1 + 0.2 * k) * ls + k * 2.1 + ei * 3.0)); }
          else { u = -sd * (-500 + k * 520 + 420 * Math.sin(t * (0.7 + 0.2 * k) * ls + k * 1.3 + ei)); row = 12 + 11 * (0.5 + 0.5 * Math.sin(t * (0.9 + 0.15 * k) * ls + k * 1.9 + ei)); }
          const rr = rowAt(row), p = cpt(Math.max(-UMAX, Math.min(UMAX, u)), rr[0]);
          V3.set(p[0] - e[0], rr[1] + 130 - e[1], p[1] - e[2]); const len = V3.length(); V3.multiplyScalar(1 / len);
          const wd = lon > 0.01 ? 3.2 : 0.001;
          QT.setFromUnitVectors(UP, V3); SC.set(wd, len, wd); V3b.set(e[0], e[1], e[2]);
          M4.compose(V3b, QT, SC); lasers.setMatrixAt(i, M4);
          TC.copy(i % 2 ? COL.cy : COL.mg); if (ko && i % 3 === 0) TC.copy(COL.gd); if (sb && sb.ch && !ko) TC.set(sb.ch.accent);
          TC.multiplyScalar(3.0 * lon); lasers.setColorAt(i, TC);
        }
        lasers.instanceMatrix.needsUpdate = true; lasers.instanceColor.needsUpdate = true;
      }
      return { root, update };
    }
  };
})();
