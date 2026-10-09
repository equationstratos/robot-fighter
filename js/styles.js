'use strict';
/* =========================================================
   STYLES DE COMBAT : garde vivante, marche et coups normaux propres à un art martial
   ---------------------------------------------------------
   Un robot reçoit un style par UN champ de son entrée ROSTER (robots.js) :  style: 'muaythai'
   Sans ce champ, le robot se comporte exactement comme avant (garde, marche et coups génériques de fight.js).

   CONTRAT D'UN STYLE  (STYLES.<id>)
     name                 nom affiché (sélection, liste des coups)
     idle(f)  → pose      garde vivante (état 'idle'). Peut poser f.vdx / f.vYaw : décalage / orientation purement
                          visuels (même mécanisme que la célébration ; la vraie position f.x ne bouge jamais).
     walk(f, dir) → pose  marche (dir = +1 avant, -1 arrière)
     normals  { clé: { name, keys, desc?, announce? } }
                          remplace l'ANIMATION (images-clés, comme NORMALS / keyPose) et le NOM d'un coup normal de
                          NORMALS (lp hp lk hk clp chp clk chk flk fhk fhp …). Tout le reste — frame data st / ac / rc,
                          dégâts, étourdissement, recul, membre et rayon de la zone de frappe, saut (hop) — est COPIÉ de
                          NORMALS[clé] : l'équilibre du jeu ne change pas. La portée est recalée automatiquement sur celle
                          du coup d'origine (facteur kx de la projection 2D, voir styleMove) : le style ne change que le look.
                          announce: true → le nom du coup s'affiche à l'écran quand il part (comme un coup spécial).
     moveList [[noms, commandes], ...]   lignes de la liste des coups (pause → LISTE DES COUPS) ; facultatif
   Outils : phase(f, cadence) = horloge du rythme partagée garde / marche ; settle(f, pose) = transition douce.
   ========================================================= */
const STYLES = {};

// ---- outils communs ----
// phase du rythme (en battements) : avance d'une image de jeu à chaque nouvelle valeur de f.clk, à la cadence donnée
// (images par battement ; négative = à rebours, pour la marche arrière). Continue entre garde et marche.
function stylePhase(f, period) {
  const s = f.sty || (f.sty = { ph: (f.side || 0) * 0.37, clk: -1 });
  if (s.clk !== f.clk) { s.ph += 1 / period; s.clk = f.clk; }
  return s.ph;
}
// transition douce vers la pose cible pendant les premières images de l'état (sortie de coup, de marche, de garde…) ;
// les rotations sont ramenées à ±π de la cible pour ne pas « dévisser » après un retourné (spin 2π)
function styleSettle(f, target, n = 9) {
  const prev = f.pose; if (!prev || f.t >= n) return target;
  const a = { ...prev }, TAU = Math.PI * 2;
  for (const k of ['spin', 'twist', 'headSpin']) { const d = (a[k] || 0) - (target[k] || 0); a[k] = (target[k] || 0) + d - TAU * Math.round(d / TAU); }
  a.rot = (a.rot || 0) - 360 * Math.round((a.rot || 0) / 360);
  if (a.sx == null) a.sx = 1;
  return lerpPose(mkPose(a), target, clamp(0.3 + f.t * 0.09, 0, 1));
}
const styleOf = ch => (ch && ch.style && STYLES[ch.style]) || null;

// coup normal d'un robot à style : { ...NORMALS[clé], keys, name } + recalage de portée ; null si le style ne le change pas
const STYLE_CACHE = new WeakMap();
function styleMove(ch, key) {
  const S = styleOf(ch), def = S && S.normals && S.normals[key], base = NORMALS[key];
  if (!def || !base) return null;
  let c = STYLE_CACHE.get(ch); if (!c) STYLE_CACHE.set(ch, c = {});
  if (c[key]) return c[key];
  const mv = Object.assign({}, base, { keys: def.keys, name: def.name || base.name, src: key, style: ch.style, announce: !!def.announce });
  // portée : position horizontale maximale du membre de frappe pendant les images actives, style vs coup d'origine
  // (même squelette 2D que les zones de frappe). k est appliqué à la projection 2D (sx) : 1 hors du coup, k sur les
  // images actives, rampes linéaires pendant l'armé et le retour → mêmes portées, zones de frappe fidèles au rendu 3D.
  let xb = -1e9, xs = -1e9;
  for (let t = base.st; t < base.st + base.ac; t++) {
    xb = Math.max(xb, skeleton(ch, normalPose(base, t), 1)[base.limb].x);
    xs = Math.max(xs, skeleton(ch, normalPose(mv, t), 1)[base.limb].x);
  }
  const k = xb > 1 && xs > 1 ? clamp(xb / xs, 0.5, 2) : 1;
  mv.reachK = k;
  if (Math.abs(k - 1) > 1e-3) {
    const st = base.st, ac = base.ac, rc = base.rc;
    mv.kx = t => 1 + (k - 1) * (t < st ? t / st : t < st + ac ? 1 : Math.max(0, 1 - (t - st - ac) / rc));
  }
  return (c[key] = mv);
}
// lignes de la liste des coups d'un robot à style (null sans style)
const STYLE_CMD = { lp: 'LP', hp: 'HP', lk: 'LK', hk: 'HK', clp: '↓ + LP', chp: '↓ + HP', clk: '↓ + LK', chk: '↓ + HK', flk: '→ + LK', fhk: '→ + HK', fhp: '→ + HP (à distance)', flp: '→ + LP' };
function styleRows(ch) {
  const S = styleOf(ch); if (!S) return null;
  if (S.moveList) return S.moveList.map(r => [r[0], r[1], '']);
  return Object.keys(S.normals || {}).map(k => [S.normals[k].name + (S.normals[k].desc ? ' (' + S.normals[k].desc + ')' : ''), STYLE_CMD[k] || k, '']);
}

/* =========================================================
   MUAY THAÏ (boxe thaïlandaise)
   Garde haute (gants au front / aux tempes, coudes serrés devant, menton rentré), buste droit, hanches presque de face,
   poids sur la jambe arrière, jambe avant légère talon levé ; balancier avant-arrière rythmé (≈ 1,9 par seconde) et,
   de temps en temps (2 temps sur 8), le genou avant qui monte en « check » (blocage tibia).
   Repères : f = côté avant (proche caméra), b = arrière ; spin + = épaule / hanche avant vers l'adversaire.
   ========================================================= */
(function () {
  const G0 = { lean: 2, hd: 9, fs: 74, fe: 108, bs: 64, be: 123, fh: 40, fk: 50, bh: -8, bk: 28,
    spin: 0.15, twist: 0, kyf: -0.1, kyb: 0.4, axf: -0.12, axb: -0.16, hxf: 0.05, hxb: 0.04, grip: 1 };
  const G = o => mkPose({ ...G0, ...(o || {}) });
  const GUARD = G();
  const P_IDLE = 32, P_WALK = 22; // images par battement (60 im/s) : balancier ≈ 1,9 Hz, pas chassés ≈ 2,7 Hz
  const TAU = Math.PI * 2;

  // ---- coups (images-clés aux mêmes instants que NORMALS ; frame data copiée par styleMove) ----
  // JAB : bras avant tendu à hauteur de visage, l'autre gant reste collé à la tempe, épaule avant qui monte
  const JAB = G({ lean: 9, hd: 7, fs: 90, fe: 3, bs: 66, be: 125, fh: 31, fk: 20, bh: -12, bk: 14, spin: 0.28, twist: 0.42, axf: -0.04 });
  // DIRECT (mat trong) : rotation des hanches et pivot du pied arrière, gant avant ramené au menton
  const CROSS = G({ lean: 20, hd: 5, fs: 64, fe: 132, bs: 93, be: 2, fh: 38, fk: 34, bh: -22, bk: 6, spin: -0.12, twist: -0.42, kyb: -0.1, axf: -0.2, axb: 0.05 });
  // TEEP : genou avant monté devant le ventre, puis plante du pied poussée droit, buste qui recule, bras avant en balancier
  const TEEP_CH = G({ lean: -8, hd: 12, fs: 70, fe: 112, bs: 66, be: 122, fh: 102, fk: 128, bh: -4, bk: 14, spin: 0.25, kyb: 0.5 });
  const TEEP = G({ lean: -24, hd: 20, fs: 24, fe: 34, bs: 72, be: 116, fh: 97, fk: 3, bh: -12, bk: 8, spin: 0.25, kyf: -0.15, kyb: 0.55, axf: 0.18, twist: 0.1 });
  // TE KAN KOR (circulaire haut, tibia) : pas de chambre, jambe arrière lancée presque tendue, hanches qui passent par-dessus,
  // talon d'appui tourné vers l'adversaire, bras arrière jeté vers le bas en balancier, bras avant haut devant le visage
  const RH_SWING = G({ lean: -12, hd: 8, fs: 108, fe: 82, bs: 8, be: 30, fh: 10, fk: 16, bh: 72, bk: 40, spin: -0.75, kyb: 1.35, hxb: 0.8, kyf: -0.6, twist: 0.45, axb: 0.15 });
  const RH_HIT = G({ lean: -32, hd: 10, fs: 122, fe: 72, bs: -42, be: 8, fh: 5, fk: 8, bh: 138, bk: 16, spin: -1.2, kyb: 2.1, hxb: 0.45, kyf: -1.15, twist: 0.85, axb: 0.3, axf: 0.1 });
  const RH_BACK = G({ lean: -14, hd: 8, fs: 100, fe: 90, bs: 10, be: 50, fh: 12, fk: 16, bh: 70, bk: 70, spin: -0.7, kyb: 1.2, hxb: 0.9, kyf: -0.6, twist: 0.4 });
  // TE LANG (low kick, jambe avant, depuis la garde basse) : tibia qui fauche le mollet, bras avant jeté en arrière,
  // gant arrière qui protège le visage (jambes : celles du low kick d'origine → même hauteur de frappe)
  const LK_ARM = { ...POSES.clkArm, fs: 20, fe: 40, bs: 74, be: 118, axf: 0.15 };
  const LK_HIT = { ...POSES.clkMMA, fs: -32, fe: 14, axf: 0.28, bs: 74, be: 116, hd: -2 };
  // SOK NGAT (coude remontant, depuis la garde basse) : on se redresse, l'avant-bras vertical devant le visage, coude
  // qui monte sous le menton adverse ; l'autre gant reste en garde
  const SN_LOAD = { ...POSES.crouch, fs: 40, fe: 120, bs: 64, be: 122, lean: 20, hd: -6, twist: -0.15 };
  const SN_HIT = { ...POSES.crouch, lean: 2, hd: -12, fs: 150, fe: 40, bs: 68, be: 120, fh: 52, fk: 74, bh: 8, bk: 80, spin: 0.3, twist: 0.45 };
  // SWITCH KICK : petit saut de changement de garde (pied avant ramené), puis circulaire au corps de la jambe avant
  const SW_STEP = G({ lean: 0, hd: 8, fh: 4, fk: 24, bh: 2, bk: 26, spin: 0.5, kyf: -0.3, kyb: 0.5 });
  const SW_HIT = G({ lean: -22, hd: 12, fs: -28, fe: 12, axf: 0.25, bs: 112, be: 88, fh: 96, fk: 10, bh: -6, bk: 10, spin: 1.55, kyf: -1.45, hxf: 1.3, kyb: 0.9, twist: -0.85 });
  const SW_REC = G({ lean: -6, hd: 8, fs: 20, fe: 60, bs: 90, be: 110, fh: 95, fk: 120, bh: -4, bk: 14, spin: 1.0, kyf: -0.9, hxf: 1.2, kyb: 0.6, twist: -0.4 });
  // KAO LOI (genou volant) : petite flexion, bras qui partent, puis genou avant projeté vers le haut, jambe arrière
  // rejetée en arrière, un bras tendu vers la nuque adverse, l'autre armé haut (coude levé)
  const KL_LOAD = G({ lean: 14, hd: 2, fs: 40, fe: 70, bs: 30, be: 70, fh: 50, fk: 75, bh: -18, bk: 60, spin: 0, axf: 0, axb: 0 });
  const KL_KNEE = G({ lean: -14, hd: 14, fs: 118, fe: 30, bs: 145, be: 95, fh: 128, fk: 150, bh: -40, bk: 55, spin: -0.15, twist: 0.25, axb: 0.35, axf: -0.1, kyf: 0, kyb: 0 });
  const KL_LAND = { ...POSES.jump, fs: 75, fe: 108, bs: 64, be: 122, hd: 4 };

  STYLES.muaythai = {
    name: 'MUAY THAÏ',
    guard: GUARD,
    idle(f) {
      const ph = stylePhase(f, P_IDLE), u = ph - Math.floor(ph), beat = Math.floor(ph);
      // check du genou avant 2 fois tous les 8 temps, espacés irrégulièrement (3 puis 5 temps) ; seulement si la garde
      // dure depuis le début du temps
      const b8 = ((beat % 8) + 8) % 8, chk = (b8 === 2 || b8 === 5) && f.st === 'idle' && f.t >= u * P_IDLE ? Math.pow(Math.sin(Math.PI * u), 1.5) : 0;
      const w = Math.sin(u * TAU) * (1 - chk), up = Math.max(0, w), dn = Math.max(0, -w); // w + : poids sur la jambe arrière
      const p = { ...G0 };
      p.bk += 10 * w; p.bh += 3 * w; p.lean -= 3 * w; p.hd += 2.5 * w; p.spin += 0.05 * w;
      p.fh += 5 * up; p.fk += 11 * up; p.fh -= 2 * dn; p.fk -= 4 * dn; // pied avant qui se soulève quand le poids recule
      p.fs += 3 * w; p.fe -= 2 * w; p.bs += 2 * w; p.be -= 2 * w;    // gants qui respirent avec le balancier
      if (chk) { p.fh += 52 * chk; p.fk += 44 * chk; p.kyf -= 0.35 * chk; p.hxf += 0.3 * chk; p.lean -= 3 * chk; p.fs -= 8 * chk; p.fe += 8 * chk; p.bk += 5 * chk; }
      f.vdx = -5 * w; // balancier visuel du corps entier (f.x inchangé)
      return styleSettle(f, mkPose(p));
    },
    walk(f, dir) {
      // pas chassés : le pied du côté où l'on va part d'abord, l'autre suit ; garde inchangée, talon avant levé
      const ph = stylePhase(f, P_WALK * dir), a = ph * TAU, o = 1.9;
      const L = Math.sin(a), dL = Math.cos(a), R = Math.sin(a - o), dR = Math.cos(a - o);
      const p = { ...G0 };
      p.fh += 12 * L; p.fk += 4 + 16 * Math.max(0, dL);
      p.bh += 12 * R; p.bk += 3 + 14 * Math.max(0, dR);
      p.lean += 2 * dir + 1.5 * Math.sin(a * 2); p.fs += 2 * L; p.bs -= 2 * L;
      return styleSettle(f, mkPose(p));
    },
    normals: {
      lp: { name: 'JAB', keys: [[0, GUARD], [3, JAB], [7, JAB], [15, GUARD]] },
      hp: { name: 'MAT TRONG', desc: 'direct', keys: [[0, GUARD], [5, CROSS], [11, CROSS], [28, GUARD]] },
      lk: { name: 'TEEP', desc: 'coup de pied poussé', keys: [[0, GUARD], [4, TEEP_CH], [6, TEEP], [10, TEEP], [14, TEEP_CH], [18, GUARD]] },
      hk: { name: 'TE KAN KOR', desc: 'circulaire haut', keys: [[0, GUARD], [5, RH_SWING], [10, RH_HIT], [15, RH_HIT], [21, RH_BACK], [29, GUARD]] },
      clk: { name: 'TE LANG', desc: 'low kick', keys: [[0, 'crouch'], [1, LK_ARM], [5, LK_HIT], [9, LK_HIT], [20, 'crouch']] },
      chp: { name: 'SOK NGAT', desc: 'coude remontant', keys: [[0, 'crouch'], [3, SN_LOAD], [6, SN_HIT], [12, SN_HIT], [22, SN_LOAD], [30, 'crouch']] },
      flk: { name: 'SWITCH KICK', keys: [[0, GUARD], [3, SW_STEP], [7, SW_HIT], [11, SW_HIT], [16, SW_REC], [25, GUARD]] },
      fhk: { name: 'JORAKHE FAD HANG', desc: 'retourné', announce: true,
        keys: [[0, GUARD], [6, 'backTurn', { spin: 2.2, bh: 70, bk: 125 }], [11, 'backKick', { spin: 3.64 }], [15, 'backKick', { spin: 3.64 }], [24, 'backTurn', { spin: 4.6 }], [33, G({ spin: G0.spin + TAU })]] },
      fhp: { name: 'KAO LOI', desc: 'genou volant', announce: true, keys: [[0, GUARD], [4, KL_LOAD], [9, KL_KNEE], [15, KL_KNEE], [22, KL_LAND], [29, GUARD]] }
    },
    moveList: [
      ['JAB / MAT TRONG (direct)', 'LP / HP'],
      ['TEEP (coup de pied poussé) / TE KAN KOR (circulaire haut)', 'LK / HK'],
      ['TE LANG (low kick) / SOK NGAT (coude) / BALAYAGE', '↓+LK / ↓+HP / ↓+HK'],
      ['SWITCH KICK / JORAKHE FAD HANG (retourné)', '→ + LK / → + HK'],
      ['KAO LOI (genou volant)', '→ + HP (à distance)']
    ]
  };
})();
