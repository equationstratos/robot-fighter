'use strict';
/* Animations personnelles : atlas — voir le contrat en tête de js/motions.js
   intro   : la révélation de l'Atlas électrique (2024) : il s'affaisse et se replie, le buste pivote à 180° pendant que
             les genoux se plient « à l'envers », il se relève de dos, la tête seule se retourne vers le public…
             puis le buste refait le tour pour rattraper la tête, et la tête se verrouille sur l'adversaire : garde
   victory : salto arrière de parkour (l'Atlas hydraulique), réception amortie, bras en V face au public ;
             en boucle : le buste fait un tour complet sur les hanches, bras écartés, pendant que la tête reste
             fixée sur le public (moteurs à rotation continue), puis de nouveau le V */
(() => {
  const ch = ROSTER.find(r => r.id === 'atlas'), s = ch.scale, Lg = 44 * s * ch.leg, HO = 1.8 * s;
  const PI = Math.PI, TAU = 2 * PI;
  // jambe : pied à (x, y) de l'articulation de hanche (y vers le bas) → [hanche, genou] ; rev = genou plié à l'envers
  const leg = (x, y, rev) => {
    const d = Math.min(Math.hypot(x, y), 2 * Lg * 0.9999), dir = Math.atan2(x, y) / D2R, a = Math.acos(d / (2 * Lg)) / D2R;
    return rev ? [dir - a, -2 * a] : [dir + a, 2 * a];
  };
  // pose aux pieds placés en F / B (x depuis le centre des hanches) à la profondeur hF / hB sous la hanche
  const st = (o, F, B, hF, hB = hF, rev) => { const p = mkPose({ ...POSES.idle, ...o }); [p.fh, p.fk] = leg(F - HO, hF, rev); [p.bh, p.bk] = leg(B + HO, hB, rev); return p; };
  const G = skeleton(ch, POSES.idle, 1), F0 = G.ffo.x, B0 = G.bfo.x, H0 = G.ffo.y, HB = G.bfo.y, LMAX = 2 * Lg * 0.998;
  // courbes : suite d'images-clés d'une image (contrôle exact du mouvement), fn(u) → [pose, options], u ∈ ]0, 1]
  const track = (n, fn, o0) => Array.from({ length: n }, (_, i) => { const [p, o] = fn((i + 1) / n); return [p, 1, i === 0 && o0 ? { ...o, ...o0 } : o]; });
  const mixO = (a, b, u) => { const o = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k] = lerp(a[k] ?? POSES.idle[k] ?? 0, b[k] ?? POSES.idle[k] ?? 0, u); return o; };
  const ss = u => u * u * (3 - 2 * u), eIn = u => u * u, eOut = u => 1 - (1 - u) * (1 - u);
  const back = (u, k = 1.6) => 1 + (k + 1) * Math.pow(u - 1, 3) + k * Math.pow(u - 1, 2); // dépasse puis revient
  // regard : direction de la tête = yaw + twist + headSpin ; face au public = -PI/2
  const CAM = -PI / 2, Y0 = -0.42, look = (tw, yaw = Y0) => CAM - yaw - tw;

  // ---- sons et effets ----
  const servo = (f0, f1, d, v = 0.05) => { AU.tone(f0, d, 'sawtooth', v, f1); AU.tone(f0 * 2.01, d, 'square', v / 2, f1 * 2); };
  const headFx = (x, footY, sc, face, hx, hy, big) => {
    const X = x + face * hx * sc, Y = footY - hy * sc;
    FX.add({ type: 'glow', x: X, y: Y, size: (big ? 30 : 18) * sc, life: big ? 34 : 16, max: big ? 34 : 16, col: ch.accent, core: '#fff' });
    FX.add({ type: 'ring', x: X, y: Y, size: (big ? 40 : 24) * sc, life: 20, max: 20, col: ch.accent, lw: 3 });
  };

  // ======================= INTRO : la révélation =======================
  const FI = F0 - 2, BI = B0 + 4; // pieds pendant l'intro (le pied arrière se pose à plat)
  const uSink = { lean: 24, hd: 30, fs: 4, fe: 16, bs: 0, be: 18, grip: 0.25, twist: 0.3 };
  const sink = st(uSink, FI, BI, H0 - 10, H0 - 10);
  // replié : accroupi profond, buste retourné à 180° et plié vers le sol, mains qui pendent jusqu'au sol, tête pendante
  const uFold = { lean: 58, hd: 36, fs: 2, fe: 14, bs: -4, be: 18, grip: 0.15, twist: PI };
  const DF = 46;
  const uFold2 = { ...uFold, lean: 62, hd: 42, fe: 20, be: 24 };
  // debout de dos : les genoux restent pliés vers l'avant… donc « à l'envers » pour un buste tourné vers l'arrière
  const uTall = { lean: 16, hd: 14, fs: 0, fe: 10, bs: 0, be: 10, axf: 0.08, axb: 0.08, grip: 0.4, twist: PI };
  const uBack = { lean: 4, hd: 2, fs: 2, fe: 14, bs: 2, be: 14, axf: 0.1, axb: 0.1, grip: 0.45, twist: PI };
  const DT = H0 - 6, up = o => st(o, FI, BI, DT);
  const hsS = look(PI) + TAU; // tête tournée vers le public (≈ +115°), buste de dos
  // le buste refait le tour (PI → 2PI) en gardant la tête sur le public, puis garde
  const uGuard = { lean: 8, hd: -4, fs: 50, fe: 100, bs: 28, be: 118, grip: 1 };

  const intro = [
    ['idle', 4],
    [sink, 12, { fx: 'down' }],
    // le buste fouette à 180° pendant la descente
    ...track(18, u => { const e = ss(u); return [st(mixO(uSink, uFold, e), FI, BI, lerp(H0 - 10, DF, e)), {}]; }, { fx: 'whirr' }),
    [st(uFold2, FI, BI, DF - 2), 12],
    // il se déplie, de dos : les hanches montent, le buste se redresse en dernier
    ...track(22, u => { const e = ss(u); return [st(mixO(uFold2, uTall, ss(clamp(u * 1.3 - 0.3, 0, 1))), FI, BI, lerp(DF - 2, DT, e)), {}]; }, { fx: 'rise' }),
    [up(uBack), 10],
    // la tête seule se retourne (dépasse un peu, puis se cale)
    ...track(12, u => [up({ ...uBack, hd: lerp(2, 4, u), headSpin: hsS * back(u, 1.2) }), {}], { fx: 'stare' }),
    [up({ ...uBack, hd: 5, headSpin: hsS }), 20],
    // le buste rattrape la tête : demi-tour du buste, les bras remontent en garde, les pieds reprennent la garde
    ...track(28, u => {
      const e = ss(u), tw = lerp(PI, TAU, e), o = mixO({ ...uBack, hd: 5 }, uGuard, ss(clamp(u * 1.25 - 0.1, 0, 1)));
      o.twist = tw; o.headSpin = look(tw) + TAU;
      const g = ss(clamp(u * 1.4 - 0.4, 0, 1));
      return [st(o, lerp(FI, F0, g), lerp(BI, B0, g), lerp(DT, H0, g), lerp(DT, HB, g)), {}];
    }, { fx: 'whirr2' }),
    // la tête quitte le public et se verrouille sur l'adversaire
    ...track(7, u => [mkPose({ ...POSES.idle, twist: TAU, headSpin: (look(TAU) + TAU) * (1 - back(u, 1.4)), hd: -4 + 2 * u }), {}], { fx: 'lock' }),
    [{ ...POSES.idle, twist: TAU }, 22] // = garde (le buste a fait un tour complet)
  ];

  // ======================= VICTOIRE : salto arrière =======================
  // pieds à l'appel / à la réception (le pied arrière se rapproche d'un pas), orientation face public, recul du salto
  const FL = F0, BL = B0 + 16, YV = -0.95, DXF = -16, HZ = 13 * s;
  const fX = (lx, lz, yaw, dx) => dx + lx * Math.cos(yaw) + lz * Math.sin(yaw);
  const XFL = fX(FL, HZ, Y0, DXF), dxFor = yaw => XFL - FL * Math.cos(yaw) - HZ * Math.sin(yaw); // pivot sur le pied avant
  const DXV = dxFor(YV);
  const uLoad = { lean: 32, hd: -16, fs: -48, fe: 28, bs: -52, be: 26, grip: 0.8 };
  const uPush = { lean: 2, hd: -24, fs: 165, fe: 12, bs: 160, be: 14, grip: 0.5 };
  const tuck = mkPose({ lean: 10, hd: -12, fs: 98, fe: 72, bs: 92, be: 78, fh: 122, fk: 142, bh: 114, bk: 140, grip: 1 });
  
  const R = -360; // après le salto, le corps a fait un tour complet (rot -360 ≡ 0)
  const uLand = { lean: 30, hd: -10, fs: 78, fe: 30, bs: 70, be: 34, grip: 0.7, rot: R };
  const uOpen = { lean: 14, hd: -10, fs: 110, fe: 30, bs: 100, be: 34, grip: 0.7, rot: R }, open = st(uOpen, FL, BL, 80);
  const uAbs = { lean: 20, hd: -4, fs: 58, fe: 55, bs: 48, be: 60, grip: 0.85, rot: R };
  const hsV = look(0, YV);
  const uVee = { lean: -3, hd: -8, fs: 6, fe: 8, bs: 6, be: 8, axf: 2.6, axb: 2.6, grip: 1, headSpin: hsV, rot: R };
  const uVee2 = { ...uVee, axf: 2.66, axb: 2.66, hd: -5, lean: -1 };
  const uOut = { lean: 2, hd: -2, fs: 4, fe: 6, bs: 4, be: 6, axf: 1.5, axb: 1.5, grip: 0.2, twist: -0.35, headSpin: look(-0.35, YV), rot: R };
  const DV = 83; // debout (limité par le pied arrière)
  const vee = o => st(o, FL, BL, DV, DV);

  const H = 40; // hauteur du salto : flèche de la parabole du centre du buste
  // hauteur du centre du buste (pivot de rot) au-dessus du point le plus bas d'une pose
  const cH = p => { const S = skeleton(ch, p, 1); return S._low + Math.cos(p.lean * D2R) * 60 * s * 0.45; };
  const pushEnd = (() => { const p = st(uPush, FL, BL, LMAX); p.rot = -22; return p; })();
  const HC0 = cH(pushEnd) + 16, HC1 = cH(open);
  const main = [
    ['idle', 4],
    // le pied arrière se rapproche d'un petit pas pendant que le corps se charge, bras lancés en arrière
    ...track(12, u => { const e = ss(u), lift = 7 * Math.sin(PI * clamp(u * 1.25, 0, 1)); return [st(mixO({}, uLoad, e), FL, lerp(B0, BL, ss(clamp(u * 1.25, 0, 1))), lerp(H0, 54, e), lerp(HB, 54, e) - lift), {}]; }),
    [st({ ...uLoad, fs: -52, bs: -56, lean: 34 }, FL, BL, 52), 4],
    // impulsion : jambes qui se tendent, bras lancés vers le haut, le corps commence à basculer
    ...track(6, u => { const e = eIn(u); const p = st(mixO(uLoad, uPush, e), FL, BL, lerp(52, LMAX, e)); p.rot = -22 * e; return [p, { dy: 16 * e, dx: DXF * 0.1 * e }]; }, { fx: 'leap' }),
    // vol : rotation régulière (le tour est bouclé avant de toucher le sol), trajectoire balistique, groupé puis jambes tendues vers le sol
    // le centre du buste (pivot de rot) suit une parabole : dy (hauteur du point le plus bas) en est déduit
    ...track(34, u => {
      const p = u < 0.24 ? lerpPose(st(uPush, FL, BL, LMAX), tuck, ss(u / 0.24)) : u < 0.66 ? mkPose(tuck) : lerpPose(tuck, open, ss(clamp((u - 0.66) / 0.3, 0, 1)));
      const v = clamp(u / 0.9, 0, 1);
      p.rot = lerp(-22, R, 0.75 * v + 0.25 * ss(v));
      const hc = lerp(HC0, HC1, u) + 4 * H * u * (1 - u);
      return [p, { dy: Math.max(0, hc - cH(p)), dx: DXF * (0.1 + 0.9 * u) }];
    }),
    // réception : les pieds se posent, les genoux amortissent
    ...track(6, u => [st(mixO(uOpen, uLand, eOut(u)), FL, BL, lerp(80, 54, eOut(u))), { dy: 0, dx: DXF }], { fx: 'land' }),
    [st(uAbs, FL, BL, 60), 7, { dx: DXF }],
    // il se redresse en pivotant face au public (pied avant planté), bras en V
    ...track(18, u => {
      const e = ss(u), y = lerp(Y0, YV, e), lift = 6 * Math.sin(PI * u);
      return [st(mixO(uAbs, uVee, ss(clamp(u * 1.15, 0, 1))), FL, BL, lerp(60, DV, e), lerp(60, DV, e) - lift), { yaw: y, dx: dxFor(y) }];
    }),
    [vee({ ...uVee, axf: 2.72, axb: 2.72, lean: -5 }), 6, { yaw: YV, dx: DXV, fx: 'vee' }],
    [vee(uVee2), 26, { yaw: YV, dx: DXV }]
  ];
  const loop = [
    // bras écartés, petite prise d'élan du buste…
    [vee(uOut), 14, { yaw: YV, dx: DXV }],
    // …tour complet du buste : départ vif, freinage ; la tête reste fixée sur le public
    ...track(40, u => { const e = eOut(u), tw = lerp(-0.35, TAU, e); return [vee({ ...uOut, twist: tw, headSpin: look(tw, YV) }), { yaw: YV, dx: DXV }]; }, { fx: 'whirl' }),
    [vee({ ...uVee, axf: 2.72, axb: 2.72, lean: -5, twist: TAU, headSpin: hsV - TAU }), 12, { yaw: YV, dx: DXV, fx: 'vee' }],
    [vee({ ...uVee2, twist: TAU, headSpin: hsV - TAU }), 34, { yaw: YV, dx: DXV }] // = dernière clé de main, à un tour près
  ];

  MOTIONS.atlas = {
    intro,
    victory: [...main, ...loop],
    victoryLoop: main.length,
    fx: {
      down(ch, x, footY, sc, face) { servo(320, 120, 0.4, 0.04); },
      // moteurs à rotation continue : sifflement électrique
      whirr(ch, x, footY, sc, face) { servo(180, 620, 0.32); AU.sfx('whiff'); },
      whirr2(ch, x, footY, sc, face) { servo(240, 520, 0.45, 0.04); },
      whirl(ch, x, footY, sc, face) { servo(200, 900, 0.55); AU.sfx('spin'); },
      rise(ch, x, footY, sc, face) { servo(120, 340, 0.36, 0.04); },
      // la tête se retourne : servo aigu + l'anneau lumineux s'allume
      stare(ch, x, footY, sc, face) { servo(900, 1500, 0.2); headFx(x, footY, sc, face, -14, 178, true); },
      lock(ch, x, footY, sc, face) { AU.sfx('block'); servo(1400, 800, 0.1); headFx(x, footY, sc, face, 12, 176, false); },
      leap(ch, x, footY, sc, face) { AU.sfx('jump'); AU.sfx('rush'); dust(x, footY, 8); },
      land(ch, x, footY, sc, face) {
        const X = x + face * (sc !== 1 ? DXF * sc : 0);
        AU.sfx('land'); AU.sfx('hitL'); dust(X, footY, 12);
        FX.add({ type: 'ring', x: X, y: footY, size: 80 * sc, life: 18, max: 18, col: ch.accent, flat: 0.22, lw: 5 });
      },
      vee(ch, x, footY, sc, face) {
        AU.sfx('confirm');
        const X = x + face * (sc !== 1 ? DXV * sc : 0), Y = footY - 205 * sc;
        FX.add({ type: 'ring', x: X, y: Y, size: 90 * sc, life: 22, max: 22, col: ch.accent, lw: 5 });
        for (let i = 0; i < 14; i++) { const a = rand(0, TAU), v = rand(3, 7) * sc; FX.add({ type: 'spark', x: X, y: Y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: 2.5, len: 3, life: 18, max: 18, col: pick([ch.accent, '#fff3d6']) }); }
      }
    }
  };
})();
