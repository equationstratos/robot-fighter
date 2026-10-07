'use strict';
/* Modèle 3D par défaut (repli) : silhouette générique, tête selon ch.head. */
if (typeof RK !== 'undefined' && RK) RK.models.default = function (ctx) {
  const { ch, g, M, L } = ctx;
  const b = ch.bulk, P = {}, low = ctx.lod === 'low';
  const limb = (len, r, shell, dark) => {
    const gr = ctx.group();
    ctx.add(gr, g.cyl(r * 0.55, r * 0.55, len, low ? 8 : 14), dark, { p: [0, len / 2, 0] });
    const prof = [[0.0, 0.03], [0.6, 0.08], [0.96, 0.22], [1.0, 0.48], [0.9, 0.76], [0.66, 0.9], [0.0, 0.95]];
    ctx.add(gr, g.lathe(prof.map(([a, y]) => [a * r, y * len]), low ? 8 : 20), shell, { s: [1, 1, 0.86] });
    return gr;
  };
  for (const [sd, z] of [['f', 1], ['b', -1]]) {
    P[sd + 'th'] = limb(L.th, 8.6 * b, M.shell, M.dark);
    P[sd + 'sh'] = limb(L.sh, 7.4 * b, ch.id === 'atlas' ? M.rubber : M.shell, M.dark);
    P[sd + 'ua'] = limb(L.ua, 6.6 * b, M.shell, M.dark);
    P[sd + 'fa'] = limb(L.fa, 5.9 * b, ch.id === 'figure' || ch.id === 'h1' ? M.dark : M.shell, M.dark);
    P[sd + 'kn'] = ctx.group(ctx.mesh(g.sphere(6.3 * b), M.dark), low ? null : ctx.mesh(g.torus(4.4 * b, 0.9, 24, 8, Math.PI * 2, 'x'), M.glow, { p: [-4, 0, 0] }));
    P[sd + 'el'] = ctx.group(ctx.mesh(g.sphere(5.2 * b), M.dark));
    P[sd + 'hi'] = ctx.group(ctx.mesh(g.sphere(7 * b), M.dark));
    P[sd + 'sc'] = ctx.group(ctx.mesh(g.sphere(9.6 * b), M.shell));
    P[sd + 'ha'] = RK.hand(ctx, { side: z, palmMat: M.dark, fingerMat: M.dark });
    P[sd + 'fo'] = ctx.group(ctx.mesh(g.rbox(26, 8, 12, 3.5), M.trim, { p: [8, -3, 0] }));
  }
  const torso = ctx.group();
  ctx.add(torso, g.rbox(24, 20, 34 * b, 6), M.trim, { p: [0, 2, 0] });
  ctx.add(torso, g.cyl(10 * b, 11 * b, 26, 20), M.dark, { p: [0, 21, 0], s: [1, 1, 1.35] });
  ctx.add(torso, g.ell(19 * ch.chest, 23, 27 * ch.chest), M.shell, { p: [1, 45, 0] });
  ctx.add(torso, g.ell(10 * ch.chest, 12, 20 * ch.chest), M.trim, { p: [9 * ch.chest, 33, 0] });
  if (ch.head === 'asimo' || ch.head === 'digit') ctx.add(torso, g.rbox(16, 36, 34, 7), ch.head === 'asimo' ? M.shell : M.trim, { p: [-20, 44, 0] });
  P.torso = torso;
  P.neck = ctx.group(ctx.mesh(g.cyl(6, 7, L.nk, 12), M.dark, { p: [0, L.nk / 2, 0] }));
  const h = ctx.group();
  switch (ch.head) {
    case 'atlas':
      ctx.add(h, g.cyl(16, 16, 17, 32, 'x'), M.white, { p: [2, 0, 0] });
      ctx.add(h, g.cyl(11.5, 11.5, 3.4, 32, 'x'), M.visor, { p: [10, 0, 0] });
      ctx.add(h, g.torus(12, 1.6, 40, 10, Math.PI * 2, 'x'), M.glow, { p: [10.8, 0, 0] });
      ctx.add(h, g.rbox(15, 22, 20, 5), M.white, { p: [-10, -1, 0] });
      break;
    case 'asimo':
      ctx.add(h, g.sphere(22), M.shell, { p: [0, -2, 0] });
      ctx.add(h, g.ell(14, 13, 18), M.visor, { p: [10, -1, 0] });
      break;
    case 'figure': case 'apollo': case 'digit':
      ctx.add(h, g.rbox(26, 32, 25, 9), M.shell, { p: [0, -2, 0] });
      ctx.add(h, g.rbox(6, 20, 19, 3), M.visor, { p: [11, 0, 0] });
      ctx.add(h, g.box(1.5, 2.2, 11), M.glow, { p: [14.2, 2, 0] });
      break;
    default:
      ctx.add(h, g.ell(15, 20, 14.5), M.shell, { p: [0, -1, 0] });
      ctx.add(h, g.ell(11.5, 16, 12), M.visor, { p: [5.5, 0, 0] });
  }
  P.head = h;
  return { parts: P, shZ: 21 * ch.chest, hpZ: 11 * b };
};
