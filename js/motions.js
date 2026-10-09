'use strict';
/* =========================================================
   ANIMATIONS PERSONNELLES DES ROBOTS
   MOTIONS.<id> = {
     intro:   SEQ  — jouée sur l'écran de sélection quand le curseur arrive sur le robot (2 à 4 s)
     victory: SEQ  — célébration : après une manche gagnée, sur l'écran de résultat, à la fin de l'arcade,
                     et quand le joueur valide le robot sur l'écran de sélection
     win:     SEQ  — (facultatif) célébration propre à une manche gagnée en combat ; sinon victory est utilisée
     winLoop: comme victoryLoop pour win
     victoryLoop: index de l'image-clé d'où la célébration reboucle une fois finie (défaut : avant-dernière) ;
                  la boucle repart de la pose de l'image-clé victoryLoop-1 : la dernière image-clé doit lui ressembler
     fx: { nom(ch, x, footY, sc, face) { ... } }  — effets propres au robot (en plus de ceux de puppetFx)
   }
   SEQ = [[pose, durée (images à 60 i/s), options], ...]
     pose : nom dans POSES, 'idle' (garde qui respire) ou objet pose (mkPose / { ...POSES.x, clé: valeur })
     options : { fx: 'whiff'|'whiffH'|'charge'|'fire'|'rise'|'burst'|<fx du robot>, dx, dy (décalage en unités
               de jeu ; dy > 0 = en l'air), yaw (orientation : -0.42 = de combat, -1.57 = face caméra, 0 = profil),
               spin (rotation du corps), say: 'texte' (voix de synthèse), sfx: nom de son }
     Les clés de pose utilisables sont celles de PKEYS (robots.js) : lean, hd, fs, fe, bs, be, fh, fk, bh, bk, rot,
     grip (0 main ouverte .. 1 poing), spin, twist (buste), headSpin (tête), kyf / kyb (jambe sur le côté).
   ========================================================= */
const MOTIONS = {};
function motionTimes(seq) { if (seq._t) return seq._t; let acc = 0; return (seq._t = seq.map(k => (acc += k[1]))); }
function motionPose(n, idle) { return typeof n === 'string' ? (n === 'idle' ? idle : POSES[n] || idle) : mkPose(n); }
// échantillonne une séquence à l'image t (même interpolation que les marionnettes du menu)
function motionSample(seq, t, idle, times) {
  times = times || motionTimes(seq);
  const opt = (k, key, def) => (k && k[2] && k[2][key] != null) ? k[2][key] : def;
  let i = times.findIndex(tt => tt >= t); if (i < 0) i = seq.length - 1;
  const prev = seq[Math.max(0, i - 1)], cur = seq[i];
  const t0 = i ? times[i - 1] : 0, d = Math.max(1, cur[1]);
  const k = i === 0 ? 1 : easeOut(clamp((t - t0) / d, 0, 1));
  const pose = lerpPose(motionPose(prev[0], idle), motionPose(cur[0], idle), k);
  const L = key => lerp(opt(prev, key, key === 'yaw' ? -0.42 : 0), opt(cur, key, key === 'yaw' ? -0.42 : 0), k);
  pose.spin = (pose.spin || 0) + L('spin');
  return { pose, yaw: L('yaw'), dx: L('dx'), dy: L('dy') };
}
// événements (fx, voix, sons) dont le début tombe dans ]t0, t1]
function motionEvents(seq, t0, t1, times, cb) {
  times = times || motionTimes(seq);
  for (let i = 0; i < seq.length; i++) {
    const start = times[i] - seq[i][1], o = seq[i][2];
    if (o && start > t0 && start <= t1) cb(o);
  }
}
// une image-clé démarre : effet visuel (fx propre au robot, sinon puppetFx), voix, son
function motionFire(o, ch, x, footY, sc, face) {
  if (o.fx) { const m = MOTIONS[(ch.base || ch).id], f = m && m.fx && m.fx[o.fx]; if (f) f(ch, x, footY, sc, face); else puppetFx(o.fx, ch, x, footY, sc, face); }
  if (o.say) AU.say(o.say, 0.6, 1);
  if (o.sfx) AU.sfx(o.sfx);
}
function motionOf(ch, kind) { const m = MOTIONS[(ch.base || ch).id]; return m && m[kind] && m[kind].length ? m[kind] : null; }
// célébration en boucle : après la fin, on rejoue à partir de victoryLoop (ou winLoop pour la victoire de manche).
// kind 'win' = célébration de manche gagnée en combat : MOTIONS.<id>.win si le robot en a une, sinon victory
function celebKind(ch, kind) { const m = MOTIONS[(ch.base || ch).id]; return kind === 'win' && m && m.win && m.win.length ? 'win' : 'victory'; }
function victoryT(ch, t, kind) {
  const m = MOTIONS[(ch.base || ch).id], k = celebKind(ch, kind), seq = m && m[k]; if (!seq || !seq.length) return t;
  const times = motionTimes(seq), end = times[times.length - 1];
  if (t <= end) return t;
  const lp = m[k + 'Loop'], li = lp != null ? lp : Math.max(0, seq.length - 2), ls = li ? times[li - 1] : 0;
  return ls + (t - end) % Math.max(1, end - ls);
}
// événements de la célébration entre les images t-1 et t (gère le rebouclage)
function victoryEvents(ch, t, cb, kind) {
  const m = MOTIONS[(ch.base || ch).id], seq = m && m[celebKind(ch, kind)]; if (!seq || !seq.length || t < 1) return;
  const a = t <= 1 ? -1 : victoryT(ch, t - 1, kind), b = victoryT(ch, t, kind);
  if (b >= a) motionEvents(seq, a, b, null, cb);
  else { const times = motionTimes(seq); motionEvents(seq, a, times[times.length - 1] + 1, null, cb); motionEvents(seq, b - 1.5, b, null, cb); }
}
