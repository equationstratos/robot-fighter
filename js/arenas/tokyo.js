'use strict';
/* =========================================================
   Arène 3D : TOIT DE NÉO-TOKYO — nuit, pluie battante, sur le toit d'un gratte-ciel du Tokyo cyberpunk
   (arène « à domicile » d'ASIMO). Contrat : voir js/arenas.js. Tout est procédural : géométrie, textures
   dessinées sur canvas (enseignes en japonais, sol mouillé, ciel) et petits shaders (fenêtres, flaques, pluie,
   hologramme, vapeur, projecteurs).
   Plans : sol mouillé + héliport peint (flaques, ondes de pluie) / fond du toit : parapet, garde-corps,
   château d'eau, tour de refroidissement, local technique, distributeur, mât d'antenne / immeubles voisins avec
   enseignes verticales et écran géant / ville en 3 couches dans la brume, tour de Tokyo, hologramme /
   ciel bas éclairé par la ville, éclairs, projecteurs, drone de police, dirigeable.
   ========================================================= */
(function () {
  const JP = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","Meiryo","Noto Sans JP","Noto Sans CJK JP","IPAGothic","WenQuanYi Zen Hei",sans-serif';
  const FOGC = 0x221c36, FOGD = 0.000088;
  const hsh = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function makeNoise(rng) {
    const N = 256, g = new Float32Array(N * N); for (let i = 0; i < N * N; i++) g[i] = rng();
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) * N, y1 = ((yi + 1) & 255) * N;
      const a = g[y0 + x0], b = g[y0 + x1], c = g[y1 + x0], d = g[y1 + x1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  // scintillement d'un néon : allumé la plupart du temps, rafales de clignotements de temps en temps
  function flick(t, seed, rate) {
    const w = Math.floor(t / 3.2 + seed);
    if (hsh(w * 7.31 + seed) > rate) return 1;
    const ph = (t / 3.2 + seed) % 1;
    if (ph > 0.3) return 1;
    return hsh(Math.floor(t * 22) + seed * 13.7) > 0.4 ? 1 : 0.08;
  }

  /* ---------------- shaders ---------------- */
  const SPR_VS = `attribute vec3 iPos; attribute vec4 iCol; attribute vec4 iPar;
    uniform float uT, uDim, uFogD; varying vec2 vUv; varying vec3 vC;
    void main(){
      vUv = uv;
      vec4 c = modelViewMatrix * vec4(iPos, 1.0);
      float m = iPar.z, ph = iPar.y, a = 1.0;
      if (m > 0.5 && m < 1.5) a = step(0.62, fract(uT * 0.75 + ph));
      else if (m > 1.5 && m < 2.5) a = 0.7 + 0.3 * sin(uT * 2.4 + ph * 6.2832);
      else if (m > 2.5 && m < 3.5) a = 0.18 + 0.82 * pow(0.5 + 0.5 * sin(uT * 2.6 - ph * 6.2832), 8.0);
      else if (m > 3.5 && m < 4.5) a = step(0.5, fract(uT * 2.6 + ph));
      else if (m > 4.5) a = 0.8 + 0.2 * step(0.3, fract(sin(floor(uT * 18.0) + ph * 91.0) * 437.5));
      c.xy += position.xy * iPar.x;
      gl_Position = projectionMatrix * c;
      float d = -c.z * uFogD;
      vC = iCol.rgb * iCol.a * a * uDim * exp(-d * d);
    }`;
  const SPR_FS = `uniform float uCore; varying vec2 vUv; varying vec3 vC;
    void main(){ vec2 q = vUv * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard;
      float g = exp(-r * 4.5) * (1.0 - r) + uCore * exp(-r * 40.0); gl_FragColor = vec4(vC * g, 1.0); }`;
  const NOISE_GLSL = `float h2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
    float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }`;
  const BASIC_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

  ARENA3D.tokyo = {
    light: {
      hemi: [0x5a68a8, 0x180c1e, 0.6], key: [0xc4ccff, 1.15], keyPos: [-420, 950, 560],
      // contre-jours : magenta à gauche (enseigne ロボット), cyan à droite (enseigne ネオ東京), ambre doux en douche
      rims: [[0xff3cae, 2.3, [-1, 0.35, -0.75]], [0x39d8ff, 2.1, [1, 0.32, -0.7]], [0xffb060, 0.55, [0.15, 1, -0.45]]],
      fog: { color: FOGC, density: FOGD }, bg: 0x0a0914, refl: 0.55, dim: 0.72, env: 'scene'
    },
    // thème : Sol dièse mineur, i–VI–III–VII, basse martelée et mélodie « pluie de néons »
    track: {
      bpm: 152, root: 44, prog: [0, -4, 3, -2],
      bass: [0, 0, 12, 0, null, 0, 12, 0, 0, 0, 12, 0, 7, 7, 12, 7],
      lead: [7, null, 12, null, 15, null, 14, 15, 17, null, 15, null, 14, 12, 10, 12,
        19, null, 16, null, 12, null, 16, 19, 24, null, 23, null, 21, 19, 16, null,
        12, null, 11, null, 12, null, 16, null, 19, null, 16, null, 14, 12, 11, 12,
        19, null, 16, null, 12, null, 16, 19, null, 21, null, 24, null, 21, 19, 16],
      drums: { k: 'x.....x...x.x...', s: '....x.......x..x', h: 'x.xxx.xxx.xxx.xx' }
    },
    build
  };

  function build(S) {
    const T = S.T, Q = S.quality, root = S.group(), BGU = T.BufferGeometryUtils;
    const P0 = performance.now(), prof = n => { if (window.__prof) window.__prof.push([n, Math.round(performance.now() - P0)]); };
    const rnd = S.rng(20251), noise = makeNoise(S.rng(99));
    const tU = { value: 0 }, dimU = { value: 1 };
    const statics = S.group(); root.add(statics);
    const envOnly = S.group(); envOnly.userData.noMerge = true; root.add(envOnly);
    const put = (geo, mat, p, r, s, parent) => S.add(parent || statics, geo, mat, { p, r, s });
    const noMerge = o => { o.userData.noMerge = true; return o; };
    const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

    /* =========================================================
       OUTILS
       ========================================================= */
    // boîte dont les UV suivent la taille réelle (texture répétée tous les `tile` cm)
    function boxUV(w, h, d, tile) {
      const geo = new T.BoxGeometry(w, h, d), uv = geo.attributes.uv;
      const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
      return geo;
    }
    // cylindre entre deux points
    const vA = new T.Vector3(), vB = new T.Vector3(), qU = new T.Quaternion(), YUP = new T.Vector3(0, 1, 0);
    function beam(a, b, r, mat, seg = 6, parent) {
      vA.set(a[0], a[1], a[2]); vB.set(b[0], b[1], b[2]);
      const len = vA.distanceTo(vB);
      const m = new T.Mesh(S.g.cyl(r, r, Math.round(len * 10) / 10, seg), mat);
      m.position.copy(vA).add(vB).multiplyScalar(0.5);
      m.quaternion.copy(qU.setFromUnitVectors(YUP, vB.sub(vA).normalize()));
      (parent || statics).add(m); return m;
    }
    // quadrilatère texturé par une zone d'un atlas (px)
    function atlasQuad(w, h, rect, AW, AH) {
      const geo = new T.PlaneGeometry(w, h), uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (rect[0] + uv.getX(i) * rect[2]) / AW, 1 - (rect[1] + (1 - uv.getY(i)) * rect[3]) / AH);
      return geo;
    }
    // lumières ponctuelles (halos face caméra) : 1 appel de rendu par système
    // list : { p:[x,y,z], s: taille, c:[r,g,b], i: intensité, ph: phase, m: 0 fixe | 1 balise | 2 pulsation | 3 chenillard | 4 alterné | 5 grésille }
    const sprMats = [];
    function sprites(list, core = 1, parent) {
      const n = list.length, pg = new T.PlaneGeometry(1, 1), ig = new T.InstancedBufferGeometry();
      ig.index = pg.index; ig.setAttribute('position', pg.attributes.position); ig.setAttribute('uv', pg.attributes.uv);
      const P = new Float32Array(n * 3), C = new Float32Array(n * 4), A = new Float32Array(n * 4);
      list.forEach((L, i) => { P.set(L.p, i * 3); C.set([L.c[0], L.c[1], L.c[2], L.i == null ? 1 : L.i], i * 4); A.set([L.s, L.ph || 0, L.m || 0, 0], i * 4); });
      ig.setAttribute('iPos', new T.InstancedBufferAttribute(P, 3)); ig.setAttribute('iCol', new T.InstancedBufferAttribute(C, 4)); ig.setAttribute('iPar', new T.InstancedBufferAttribute(A, 4));
      ig.instanceCount = n;
      const mat = new T.ShaderMaterial({ uniforms: { uT: tU, uDim: dimU, uFogD: { value: FOGD }, uCore: { value: core } }, vertexShader: SPR_VS, fragmentShader: SPR_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
      const m = new T.Mesh(ig, mat); m.frustumCulled = false; m.renderOrder = 2; noMerge(m);
      (parent || root).add(m); sprMats.push(mat); return m;
    }
    const col = h => { const c = new T.Color(h); return [c.r, c.g, c.b]; };
    // géométrie à couleurs par sommet (néons lointains : une seule passe pour toutes les couleurs)
    const vcList = [];
    function vcBox(w, h, d, p, c, k = 1, ry = 0) {
      const g = new T.BoxGeometry(w, h, d).toNonIndexed(); g.deleteAttribute('uv');
      if (ry) g.rotateY(ry);
      g.translate(p[0], p[1], p[2]);
      const n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c[0] * k; a[i * 3 + 1] = c[1] * k; a[i * 3 + 2] = c[2] * k; }
      g.setAttribute('color', new T.BufferAttribute(a, 3)); vcList.push(g);
    }
    // texte néon (canvas)
    function neon(c, txt, x, y, size, color, core, blur) {
      c.save(); c.font = `bold ${size}px ${JP}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.shadowColor = color; c.shadowBlur = blur == null ? size * 0.32 : blur;
      c.strokeStyle = color; c.lineWidth = Math.max(2, size * 0.11); c.lineJoin = 'round'; c.strokeText(txt, x, y);
      c.shadowBlur = size * 0.1; c.fillStyle = core || '#fff'; c.fillText(txt, x, y); c.restore();
    }
    function vneon(c, txt, x, y0, step, size, color, core, blur) {
      [...txt].forEach((ch, i) => { const sm = 'ッャュョァィゥェォっゃゅょ'.includes(ch); neon(c, ch === 'ー' ? '｜' : ch, x + (sm ? size * 0.12 : 0), y0 + i * step - (sm ? size * 0.1 : 0), sm ? size * 0.8 : size, color, core, blur); });
    }
    function plain(c, txt, x, y, size, color, weight = 'bold') { c.font = `${weight} ${size}px ${JP}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(txt, x, y); }
    function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    function tube(c, x, y, w, h, r, color, lw) { c.save(); c.shadowColor = color; c.shadowBlur = lw * 3; c.strokeStyle = color; c.lineWidth = lw; rrect(c, x, y, w, h, r); c.stroke(); c.shadowBlur = 0; c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = lw * 0.35; rrect(c, x, y, w, h, r); c.stroke(); c.restore(); }
    // grain : motif de bruit superposé (mode « overlay ») — pas de getImageData (relecture GPU très lente sur mobile)
    let grainTile = null;
    function grain(c, w, h, amt) {
      if (!grainTile) {
        grainTile = cv(256, 256); const gc = grainTile.getContext('2d'), id = gc.createImageData(256, 256), r = S.rng(4242);
        for (let i = 0; i < id.data.length; i += 4) { const v = 128 + (r() - 0.5) * 254; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
        gc.putImageData(id, 0, 0);
      }
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'overlay'; c.globalAlpha = Math.min(1, amt / 170);
      c.fillStyle = c.createPattern(grainTile, 'repeat'); c.fillRect(0, 0, w, h); c.restore();
    }

    /* =========================================================
       SOL : béton / étanchéité mouillés, héliport peint (usé), flaques (rugosité), ondes de pluie, et
       REFLETS DES NÉONS : dans le shader du sol, le rayon de vue réfléchi est intersecté avec les plans des
       enseignes (rectangles lumineux) → traînées colorées nettes dans les flaques, floues sur le béton,
       qui suivent la caméra et clignotent avec les enseignes.
       ========================================================= */
    const FX0 = -700, FXW = 2700, FZ0 = -1400, FZW = 2300;
    const PW = 256, PH = 128, pudC = cv(PW, PH);
    {
      const pc = pudC.getContext('2d'), id = pc.createImageData(PW, PH);
      for (let j = 0; j < PH; j++) for (let i = 0; i < PW; i++) {
        const x = FX0 + (i + 0.5) / PW * FXW, z = FZ0 + (j + 0.5) / PH * FZW;
        let n = noise(x / 260, z / 150) * 0.6 + noise(x / 105 + 17, z / 62 + 5) * 0.28 + noise(x / 38, z / 24) * 0.12;
        n += 0.2 * Math.exp(-(((z + 40) / 190) ** 2)); // flaques autour des combattants (reflets)
        n += 0.12 * Math.exp(-(((z + 1340) / 70) ** 2)); // rigole le long du parapet
        n -= 0.08 * Math.exp(-(((x - 650) / 330) ** 2 + ((z + 520) / 260) ** 2)); // l'héliport est bombé
        const a = sstep(0.55, 0.62, n), k = (j * PW + i) * 4;
        id.data[k] = id.data[k + 1] = id.data[k + 2] = 255; id.data[k + 3] = a * 255;
      }
      pc.putImageData(id, 0, 0);
    }
    const toWorld = (c, w, h) => c.setTransform(w / FXW, 0, 0, h / FZW, -FX0 * w / FXW, -FZ0 * h / FZW);
    function floorMarks(c, map) {
      const Y = map ? 'rgba(222,165,30,0.92)' : 'rgb(124,124,124)', Wh = map ? 'rgba(206,208,204,0.86)' : 'rgb(118,118,118)';
      // héliport (緊急離着陸場) : cercle jaune, H blanc
      c.lineWidth = 30; c.strokeStyle = Y; c.beginPath(); c.arc(650, -520, 520, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 7; c.strokeStyle = Wh; c.beginPath(); c.arc(650, -520, 468, 0, Math.PI * 2); c.stroke();
      c.fillStyle = Wh; c.fillRect(475, -730, 72, 420); c.fillRect(753, -730, 72, 420); c.fillRect(547, -556, 206, 72);
      // inscriptions peintes
      c.save(); c.translate(650, -1010); c.scale(1, 1.6); c.fillStyle = Wh; c.font = `bold 56px ${JP}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('緊急離着陸場', 0, 0); c.restore();
      c.save(); c.translate(1010, -170); c.scale(1, 1.4); c.fillStyle = Y; c.font = `bold 60px ${JP}`; c.textAlign = 'center'; c.fillText('8t', 0, 0); c.restore();
      // ligne de sécurité + bande hachurée au pied du parapet
      c.fillStyle = Wh; for (let x = -700; x < 2000; x += 130) c.fillRect(x, -1322, 84, 12);
      for (let x = -700; x < 2000; x += 64) { c.fillStyle = Y; c.beginPath(); c.moveTo(x, -1400); c.lineTo(x + 32, -1400); c.lineTo(x + 8, -1368); c.lineTo(x - 24, -1368); c.fill(); }
      // flèches de cheminement
      c.fillStyle = Wh; [[-300, -250], [1600, -250]].forEach(([x, z]) => { c.beginPath(); c.moveTo(x - 60, z + 40); c.lineTo(x + 30, z + 40); c.lineTo(x + 30, z + 70); c.lineTo(x + 90, z); c.lineTo(x + 30, z - 70); c.lineTo(x + 30, z - 40); c.lineTo(x - 60, z - 40); c.fill(); });
    }
    // calque des marquages, usé par un masque de bruit (écaillures organiques, pas de pixels carrés)
    const marks = cv(2048, 1024);
    {
      const mc = marks.getContext('2d'); toWorld(mc, 2048, 1024); floorMarks(mc, true); mc.setTransform(1, 0, 0, 1, 0, 0);
      const ww = 512, wh = 256, wr = cv(ww, wh), wc = wr.getContext('2d'), id = wc.createImageData(ww, wh);
      for (let j = 0; j < wh; j++) for (let i = 0; i < ww; i++) {
        const x = FX0 + i / ww * FXW, z = FZ0 + j / wh * FZW;
        const n = noise(x / 46 + 7, z / 30 + 3) * 0.62 + noise(x / 11 + 2, z / 7) * 0.38;
        const k = (j * ww + i) * 4; id.data[k + 3] = sstep(0.5, 0.72, n) * 235;
      }
      wc.putImageData(id, 0, 0);
      mc.globalCompositeOperation = 'destination-out'; mc.drawImage(wr, 0, 0, 2048, 1024);
      const r = S.rng(8); mc.fillStyle = 'rgba(0,0,0,0.6)';
      for (let i = 0; i < 1400; i++) { mc.beginPath(); mc.arc(r() * 2048, r() * 1024, 0.6 + r() * 2.2, 0, 7); mc.fill(); }
      mc.globalCompositeOperation = 'source-over';
    }
    prof('marks');
    const floorTex = S.canvasTex(2048, 1024, (c, w, h) => {
      const lo = cv(512, 256), lc = lo.getContext('2d'), id = lc.createImageData(512, 256);
      for (let j = 0; j < 256; j++) for (let i = 0; i < 512; i++) {
        const x = FX0 + i / 512 * FXW, z = FZ0 + j / 256 * FZW;
        const n = noise(x / 300 + 40, z / 180) * 0.5 + noise(x / 70, z / 45 + 9) * 0.3 + noise(x / 18, z / 12) * 0.2;
        const v = 19 + n * 30, k = (j * 512 + i) * 4;
        id.data[k] = v; id.data[k + 1] = v * 1.0; id.data[k + 2] = v * 1.14; id.data[k + 3] = 255;
      }
      lc.putImageData(id, 0, 0); c.drawImage(lo, 0, 0, w, h);
      toWorld(c, w, h);
      const r = S.rng(5);
      // dalles d'étanchéité (léger décalage de teinte d'une dalle à l'autre)
      for (let x = -700; x < 2000; x += 300) for (let z = -1400; z < 900; z += 300) { c.fillStyle = `rgba(${r() < 0.5 ? 0 : 60},${r() < 0.5 ? 0 : 60},${r() < 0.5 ? 10 : 70},${0.03 + r() * 0.05})`; c.fillRect(x, z, 300, 300); }
      for (let i = 0; i < 90; i++) { // taches d'humidité / rouille
        const x = FX0 + r() * FXW, z = FZ0 + r() * FZW, rad = 30 + r() * 160, g = c.createRadialGradient(x, z, 0, x, z, rad);
        const rust = r() < 0.2; g.addColorStop(0, rust ? 'rgba(70,40,20,0.35)' : 'rgba(6,6,10,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(x - rad, z - rad, rad * 2, rad * 2);
      }
      // joints des dalles (bitume)
      c.fillStyle = 'rgba(6,6,8,0.8)';
      for (let x = -700; x <= 2000; x += 300) c.fillRect(x - 2.5, FZ0, 5, FZW);
      for (let z = -1400; z <= 900; z += 300) c.fillRect(FX0, z - 2.5, FXW, 5);
      c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(marks, 0, 0, w, h); toWorld(c, w, h);
      // salissures au pied du parapet
      for (let i = 0; i < 900; i++) { const x = FX0 + r() * FXW, z = -1400 + r() * 110, s = 2 + r() * 8; c.fillStyle = 'rgba(14,14,18,0.5)'; c.beginPath(); c.arc(x, z, s, 0, 7); c.fill(); }
      // fissures
      c.strokeStyle = 'rgba(5,5,8,0.7)'; c.lineWidth = 2.2;
      for (let i = 0; i < 40; i++) { let x = FX0 + r() * FXW, z = FZ0 + r() * FZW; c.beginPath(); c.moveTo(x, z); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 70; z += (r() - 0.5) * 50; c.lineTo(x, z); } c.stroke(); }
      // avaloirs (grilles d'évacuation) + regards
      [[300, -1350], [1000, -1350], [1700, -1350], [-400, -1350]].forEach(([x, z]) => { c.fillStyle = '#0b0b0d'; c.fillRect(x - 30, z - 22, 60, 44); c.fillStyle = 'rgba(90,90,96,0.8)'; for (let k = -24; k <= 24; k += 8) c.fillRect(x + k - 1.5, z - 20, 3, 40); });
      [[-260, 120], [1560, 60]].forEach(([x, z]) => { c.fillStyle = 'rgba(40,40,46,0.9)'; c.beginPath(); c.arc(x, z, 34, 0, 7); c.fill(); c.strokeStyle = 'rgba(90,90,100,0.9)'; c.lineWidth = 3; c.stroke(); c.lineWidth = 1.5; for (let k = -24; k <= 24; k += 8) { c.beginPath(); c.moveTo(x - 26, z + k); c.lineTo(x + 26, z + k); c.stroke(); } });
      // assombrissement des flaques (l'eau fonce le sol)
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 0.75;
      const dk = cv(PW, PH), dc = dk.getContext('2d'); dc.drawImage(pudC, 0, 0); dc.globalCompositeOperation = 'source-in'; dc.fillStyle = '#05050a'; dc.fillRect(0, 0, PW, PH);
      c.drawImage(dk, 0, 0, w, h); c.globalAlpha = 1;
    }, { aniso: 8 });
    prof('floorTex');
    const roughTex = S.canvasTex(1024, 512, (c, w, h) => {
      const id = c.createImageData(w, h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const x = FX0 + i / w * FXW, z = FZ0 + j / h * FZW, n = noise(x / 160 + 3, z / 110 + 50) * 0.7 + noise(x / 30, z / 22) * 0.3;
        const v = 62 + n * 100, k = (j * w + i) * 4; id.data[k] = id.data[k + 1] = id.data[k + 2] = v; id.data[k + 3] = 255;
      }
      c.putImageData(id, 0, 0);
      c.globalAlpha = 0.85; c.drawImage(marks, 0, 0, w, h); c.globalAlpha = 1; // la peinture est un peu plus lisse… mais teintée : on la recouvre en gris
      c.globalCompositeOperation = 'saturation'; c.fillStyle = '#808080'; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'source-over';
      const dk = cv(PW, PH), dc = dk.getContext('2d'); dc.drawImage(pudC, 0, 0); dc.globalCompositeOperation = 'source-in'; dc.fillStyle = 'rgb(6,6,6)'; dc.fillRect(0, 0, PW, PH);
      c.drawImage(dk, 0, 0, w, h); c.drawImage(dk, 0, 0, w, h);
    }, { srgb: false, aniso: 8 });
    prof('roughTex');
    [floorTex, roughTex].forEach(t => { t.wrapS = T.RepeatWrapping; });
    const floorMat = S.mat({ map: floorTex, roughnessMap: roughTex, roughness: 1, metalness: 0, envMapIntensity: 1.2, color: 0xffffff });
    const rippleOn = Q < 2;
    // sources reflétées par le sol : rectangle vertical (centre x, y, z ; demi-largeur, demi-hauteur), couleur, intensité
    const RA = [], RB = [], RC = [];
    const rsrc = (x, y, z, hx, hy, color, I) => { RA.push(new T.Vector4(x, y, z, hx)); RB.push(new T.Vector4(hy, I, 0, 0)); const c = new T.Color(color); RC.push(new T.Vector4(c.r, c.g, c.b, 0)); return RA.length - 1; };
    const RF = {
      robot: rsrc(-470, 560, -2860, 66, 380, 0xff2fb0, 1.7), neo: rsrc(1870, 600, -3100, 66, 380, 0x2fe0ff, 1.6),
      ad: rsrc(2520, 780, -3138, 400, 200, 0xff4050, 1.3), kaku: rsrc(-1020, 420, -2893, 64, 160, 0xffe6d8, 1.4),
      denki: rsrc(2380, 330, -3143, 64, 160, 0xffb21e, 1.6), fight: rsrc(-1500, 700, -2893, 300, 72, 0xffa030, 1.6),
      hotel: rsrc(3100, 420, -3143, 150, 72, 0xff4a8a, 1.5), roof: rsrc(1530, 445, -1150, 200, 42, 0xa070ff, 2.0),
      vend: rsrc(1235, 96, -961, 46, 88, 0xe0f0ff, 1.5), lamp: rsrc(1405, 262, -1020, 30, 10, 0xffc080, 3.5),
      holo: rsrc(-260, 740, -5480, 230, 290, 0x60d8ff, 0.5), exit: rsrc(1405, 236, -1032, 27, 14, 0x20ff80, 1.2),
      city: rsrc(650, 380, -7000, 9000, 420, 0x6a2a60, 0.35), sky: rsrc(650, 3500, -12000, 14000, 2400, 0xb8c6ff, 0)
    };
    const NRS = RA.length, rU = { uRA: { value: RA }, uRB: { value: RB }, uRC: { value: RC } };
    floorMat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = tU; Object.assign(sh.uniforms, rU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        #define NR ${NRS}
        varying vec3 vRW; uniform float uT; uniform vec4 uRA[NR]; uniform vec4 uRB[NR]; uniform vec4 uRC[NR];
        float hr(vec2 p){ p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
        float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hr(i), hr(i + vec2(1.0, 0.0)), f.x), mix(hr(i + vec2(0.0, 1.0)), hr(i + vec2(1.0, 1.0)), f.x), f.y); }
        vec3 rip(vec2 w, float t){ // gradient des ondes (xy) + éclaboussure (z)
          vec3 g = vec3(0.0);
          for (int k = 0; k < 3; k++) {
            float fk = float(k);
            vec2 p = w / 22.0 + vec2(fk * 0.37, fk * 0.61);
            vec2 c = floor(p), f = fract(p);
            float h = hr(c + fk * 13.7);
            vec2 o = vec2(hr(c + 4.1 + fk), hr(c + 9.3 + fk)) * 0.5 + 0.25;
            vec2 d = f - o; float r = length(d);
            float ph = fract(t * 0.85 + h);
            float x = (r - ph * 0.42) * 16.0;
            float e = (1.0 - ph) * (1.0 - ph) * smoothstep(0.5, 0.25, r);
            g.xy += (d / max(r, 1e-3)) * sin(x * 3.0) * exp(-x * x) * e;
            g.z += smoothstep(0.06, 0.0, r) * smoothstep(0.1, 0.0, ph);
          }
          return g;
        }
        float sbox(float d, float h, float w){ float f = clamp((h + w - abs(d)) / (2.0 * w), 0.0, 1.0); return f * f * (3.0 - 2.0 * f); }
        // reflet des enseignes : rayon de vue réfléchi par le sol → plan vertical z = A.z de chaque source
        vec3 neonRefl(vec3 P, vec2 dist, float rough){
          vec3 D = normalize(P - cameraPosition);
          vec3 R = vec3(D.x, -D.y, D.z);
          float bw = 0.004 + 0.06 * rough, an = 2.5 + 9.0 * rough;
          vec3 acc = vec3(0.0);
          for (int i = 0; i < NR; i++) {
            vec4 A = uRA[i], B = uRB[i];
            float t = (A.z - P.z) / min(R.z, -1e-3);
            if (t < 1.0) continue; // source devant ce point du sol : pas de reflet
            vec2 H = P.xy + R.xy * t + dist * t;
            float wx = bw * t + 2.0, wy = wx * an;
            float k = sbox(H.x - A.x, A.w, wx) * sbox(H.y - A.y, B.x, wy) * (A.w / (A.w + 0.5 * wx)) * (B.x / (B.x + 0.4 * wy));
            // enseignes verticales : les caractères découpent la traînée (visible dans les flaques nettes)
            k *= mix(1.0, 0.55 + 0.45 * cos((H.y - A.y) * B.z), clamp(1.0 - wy / (B.x * 0.4), 0.0, 1.0));
            acc += uRC[i].rgb * (B.y * k);
          }
          return acc;
        }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          float fwz = fwidth(vRW.z);
          diffuseColor.rgb *= mix(0.78 + 0.44 * gn(vRW.xz / 3.5), 1.0, clamp(fwz / 5.0, 0.0, 1.0));`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          float pm = 1.0 - smoothstep(0.08, 0.32, roughnessFactor);
          vec3 rp = ${rippleOn ? 'rip(vRW.xz, uT)' : 'vec3(0.0)'};
          float rf = clamp(1.6 - fwz / 7.0, 0.0, 1.0);
          normal = normalize(normal + (viewMatrix * vec4(rp.x, 0.0, rp.y, 0.0)).xyz * (0.12 + 0.55 * pm) * rf);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(0.55, 0.6, 0.75) * rp.z * rf * (0.3 + pm);
          {
            float cv = clamp(normalize(cameraPosition - vRW).y, 0.0, 1.0);
            float fr = 0.02 + 0.98 * pow(1.0 - cv, 5.0);
            float wet = 0.22 + 0.78 * pm;
            float br = 0.45 + 0.8 * gn(vec2(vRW.x / 9.0, vRW.z / 55.0)) * gn(vec2(vRW.x / 31.0 + 7.0, vRW.z / 140.0));
            totalEmissiveRadiance += neonRefl(vRW, rp.xy * (0.004 + 0.012 * pm) * rf, roughnessFactor) * fr * wet * mix(br, 1.0, pm);
            // lumière des sources proches répandue sur le toit (flaques de lumière colorées)
            vec2 q = vRW.xz;
            vec3 sp = vec3(0.0);
            sp += vec3(0.75, 0.85, 1.0) * 1.1 * exp(-dot(q - vec2(1235.0, -930.0), q - vec2(1235.0, -930.0)) / 30000.0);
            sp += vec3(1.0, 0.7, 0.4) * 1.6 * exp(-dot((q - vec2(1405.0, -930.0)) * vec2(1.0, 0.6), (q - vec2(1405.0, -930.0)) * vec2(1.0, 0.6)) / 26000.0);
            sp += vec3(0.6, 0.35, 1.0) * 0.9 * exp(-dot(q - vec2(1530.0, -1000.0), q - vec2(1530.0, -1000.0)) / 160000.0);
            sp += vec3(1.0, 0.2, 0.65) * 0.55 * exp(-dot((q - vec2(-450.0, -1350.0)) * vec2(0.7, 1.0), (q - vec2(-450.0, -1350.0)) * vec2(0.7, 1.0)) / 500000.0);
            sp += vec3(0.2, 0.8, 1.0) * 0.5 * exp(-dot((q - vec2(1950.0, -1400.0)) * vec2(0.7, 1.0), (q - vec2(1950.0, -1400.0)) * vec2(0.7, 1.0)) / 500000.0);
            totalEmissiveRadiance += sp * (diffuseColor.rgb * 3.0 + 0.012) * uRB[0].z;
          }`)
        .replace('#include <lights_fragment_end>', `radiance *= mix(0.4, 1.0, pm);
          #include <lights_fragment_end>`);
    };
    RB[0].z = 1; // (z de la 1re source = facteur global des flaques de lumière)
    RB[RF.robot].z = RB[RF.neo].z = Math.PI * 2 / 190; // période des caractères (4 kanas sur 760)
    {
      const geo = new T.PlaneGeometry(7300, 2300, 8, 1); geo.rotateX(-Math.PI / 2); geo.translate(650, 0, -250);
      const p = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - FX0) / FXW, 1 - (p.getZ(i) - FZ0) / FZW);
      const fl = new T.Mesh(geo, floorMat); noMerge(fl); root.add(fl);
    }
    prof('floor');

    /* =========================================================
       MATÉRIAUX DU TOIT
       ========================================================= */
    const concTex = S.canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#6a6b72'; c.fillRect(0, 0, w, h);
      const r = S.rng(31);
      for (let i = 0; i < 400; i++) { const x = r() * w, y = r() * h, s = 10 + r() * 60; c.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},0.03)`; c.fillRect(x, y, s, s * 0.6); }
      for (let i = 0; i < 70; i++) { const x = r() * w, len = 60 + r() * 300, g = c.createLinearGradient(0, 0, 0, len); g.addColorStop(0, 'rgba(10,10,14,0.5)'); g.addColorStop(1, 'rgba(10,10,14,0)'); c.fillStyle = g; c.fillRect(x, 0, 2 + r() * 7, len); }
      c.fillStyle = 'rgba(20,20,24,0.5)'; for (let y = 128; y < h; y += 128) c.fillRect(0, y, w, 2);
      for (let i = 0; i < 18; i++) { c.fillStyle = 'rgba(30,30,34,0.6)'; c.beginPath(); c.arc(r() * w, r() * h, 3, 0, 7); c.fill(); }
      grain(c, w, h, 26, 4);
    }, { repeat: [1, 1] });
    const M = {
      conc: S.mat({ map: concTex, color: 0x8a8a92, roughness: 0.55, envMapIntensity: 0.7 }),
      cap: S.mat({ color: 0x55565c, roughness: 0.35, envMapIntensity: 0.9 }),
      metal: S.mat({ color: 0x40434c, roughness: 0.38, metalness: 0.8, envMapIntensity: 1.1 }),
      steel: S.mat({ color: 0x8d9099, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.2 }),
      paint: S.mat({ color: 0x9c9a90, roughness: 0.45, metalness: 0.2, envMapIntensity: 0.9 }),
      dark: S.mat({ color: 0x16171c, roughness: 0.55, metalness: 0.5 }),
      red: S.mat({ color: 0xb0141f, roughness: 0.3, metalness: 0.1, envMapIntensity: 1 })
    };

    /* =========================================================
       FOND DU TOIT : parapet, garde-corps, conduites
       ========================================================= */
    put(boxUV(7300, 106, 50, 220), M.conc, [650, 53, -1425]);
    put(new T.BoxGeometry(7300, 9, 64), M.cap, [650, 110, -1425]);
    for (let x = -2400; x <= 3700; x += 160) put(S.g.box(7, 112, 7), M.metal, [x, 170, -1418]);
    [172, 226].forEach(y => put(S.g.cyl(3.6, 3.6, 6100, 8, 'x'), M.steel, [650, y, -1418]));
    // conduites le long du parapet
    [[24, 11], [52, 8]].forEach(([y, r]) => put(S.g.cyl(r, r, 2300, 10, 'x'), M.paint, [200, y, -1370]));
    for (let x = -900; x <= 1250; x += 240) put(S.g.box(10, 60, 30), M.metal, [x, 30, -1370]);
    put(S.g.cyl(8, 8, 300, 10), M.paint, [1250, 200, -1370]);
    // petits champignons de ventilation
    [[420, -1250], [900, -1290], [-150, -900]].forEach(([x, z]) => { put(S.g.cyl(9, 9, 46, 10), M.steel, [x, 23, z]); put(S.g.cyl(22, 18, 14, 14), M.steel, [x, 50, z]); });

    /* ----- groupe gauche : château d'eau, tour de refroidissement, climatiseurs ----- */
    const tankTex = S.canvasTex(512, 256, (c, w, h) => {
      c.fillStyle = '#9fa8ae'; c.fillRect(0, 0, w, h);
      const r = S.rng(11);
      for (let i = 0; i < 60; i++) { const x = r() * w, y = r() * h * 0.6, len = 40 + r() * 160, g = c.createLinearGradient(0, y, 0, y + len); g.addColorStop(0, 'rgba(110,60,30,0.55)'); g.addColorStop(1, 'rgba(110,60,30,0)'); c.fillStyle = g; c.fillRect(x, y, 2 + r() * 5, len); }
      c.fillStyle = 'rgba(40,44,50,0.5)'; [60, 130, 200].forEach(y => c.fillRect(0, y, w, 3));
      c.fillStyle = '#b01822'; c.font = `bold 46px ${JP}`; c.textAlign = 'center'; c.fillText('高架水槽', 150, 112); c.font = `bold 24px ${JP}`; c.fillText('No.2  飲料水', 150, 150);
      grain(c, w, h, 20, 12);
    });
    M.tank = S.mat({ map: tankTex, roughness: 0.42, metalness: 0.35, envMapIntensity: 1 });
    {
      const X = -330, Z = -1130;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(S.g.box(14, 280, 14), M.metal, [X + sx * 110, 140, Z + sz * 110]);
      for (const s of [-1, 1]) for (const y of [0, 140]) { // croisillons
        beam([X - 110, y + 6, Z + s * 110], [X + 110, y + 134, Z + s * 110], 3, M.metal); beam([X + 110, y + 6, Z + s * 110], [X - 110, y + 134, Z + s * 110], 3, M.metal);
        beam([X + s * 110, y + 6, Z - 110], [X + s * 110, y + 134, Z + 110], 3, M.metal); beam([X + s * 110, y + 6, Z + 110], [X + s * 110, y + 134, Z - 110], 3, M.metal);
      }
      put(S.g.box(290, 9, 290), M.metal, [X, 284, Z]);
      put(S.g.cyl(140, 140, 236, 28), M.tank, [X, 406, Z], [0, -0.6, 0]);
      put(S.g.cone(146, 56, 28), M.paint, [X, 552, Z]);
      [330, 400, 470].forEach(y => put(S.g.torus(141, 2.5, 32, 6, Math.PI * 2, 'y'), M.metal, [X, y, Z]));
      // garde-corps de la plateforme + échelle
      for (let a = 0; a < 16; a++) { const an = a / 16 * Math.PI * 2; put(S.g.box(4, 60, 4), M.metal, [X + Math.cos(an) * 160, 318, Z + Math.sin(an) * 160]); }
      put(S.g.torus(160, 2.5, 32, 6, Math.PI * 2, 'y'), M.metal, [X, 346, Z]);
      for (const dx of [-18, 18]) put(S.g.box(4, 520, 4), M.steel, [X + 60 + dx, 260, Z + 150]);
      for (let y = 20; y < 520; y += 30) put(S.g.box(36, 3, 3), M.steel, [X + 60, y, Z + 150]);
    }
    // tour de refroidissement ronde (vapeur)
    const louverTex = S.canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#8c8f94'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { c.fillStyle = '#2a2c31'; c.fillRect(0, y + 8, w, 6); c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(0, y + 7, w, 1); } grain(c, w, h, 18, 3); }, { repeat: [6, 2] });
    M.louver = S.mat({ map: louverTex, roughness: 0.5, metalness: 0.3 });
    {
      const X = 40, Z = -1200;
      put(S.g.cyl(105, 112, 120, 28), M.louver, [X, 60, Z]);
      put(S.g.cyl(108, 108, 18, 28), M.paint, [X, 129, Z]);
      put(S.g.cyl(70, 76, 40, 24, 'y', true), M.paint, [X, 158, Z]);
      put(S.g.cyl(66, 66, 4, 20), M.dark, [X, 150, Z]);
      put(S.g.box(240, 14, 240), M.conc, [X, 4, Z]);
    }
    // climatiseurs (boîtiers) + grilles de ventilateurs
    const fanTex = S.canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#a4a298'; c.fillRect(0, 0, w, h); c.fillStyle = '#16171a'; c.beginPath(); c.arc(128, 128, 104, 0, 7); c.fill();
      c.strokeStyle = '#6b6c70'; c.lineWidth = 3; for (let r = 20; r < 104; r += 12) { c.beginPath(); c.arc(128, 128, r, 0, 7); c.stroke(); }
      for (let a = 0; a < 8; a++) { c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + Math.cos(a * 0.785) * 104, 128 + Math.sin(a * 0.785) * 104); c.stroke(); }
      c.fillStyle = '#2c2d31'; c.beginPath(); c.arc(128, 128, 18, 0, 7); c.fill(); grain(c, w, h, 16, 8);
    });
    M.fan = S.mat({ map: fanTex, roughness: 0.5, metalness: 0.25 });
    [[-640, -1230, 230, 140, 170], [-470, -960, 150, 110, 120]].forEach(([x, z, w, h, d]) => {
      put(boxUV(w, h, d, 200), M.paint, [x, h / 2 + 10, z]); put(S.g.box(w + 10, 10, d + 10), M.conc, [x, 5, z]);
      put(new T.PlaneGeometry(Math.min(w, d) * 0.8, Math.min(w, d) * 0.8), M.fan, [x, h + 10.5, z], [-Math.PI / 2, 0, 0]);
    });
    // climatiseurs côté droit (instances : corps + façade ventilateur)
    {
      const L = [], LF = [];
      for (let i = 0; i < 6; i++) { const x = 1840 + i * 95, z = -1350 + (i % 2) * 6; L.push({ p: [x, 40, z] }); LF.push({ p: [x - 8, 42, z + 17.2] }); L.push({ p: [x, 118, z] }); LF.push({ p: [x - 8, 120, z + 17.2] }); }
      const b = S.instanced(S.g.box(82, 74, 34), M.paint, L); noMerge(b); root.add(b);
      const f = S.instanced(new T.PlaneGeometry(56, 56), M.fan, LF); noMerge(f); root.add(f);
      put(S.g.box(600, 4, 50), M.metal, [2077, 79, -1350]);
    }

    /* ----- groupe droit : local technique (escalier), porte, lampe, distributeur, mât d'antenne ----- */
    {
      const X0 = 1300, X1 = 1760, Z0 = -1385, Z1 = -1040, H = 340;
      put(boxUV(X1 - X0, H, Z1 - Z0, 220), M.conc, [(X0 + X1) / 2, H / 2, (Z0 + Z1) / 2]);
      put(S.g.box(X1 - X0 + 16, 10, Z1 - Z0 + 16), M.cap, [(X0 + X1) / 2, H + 5, (Z0 + Z1) / 2]);
      put(S.g.box(100, 222, 6), M.dark, [1405, 111, Z1 + 2]);
      put(S.g.box(88, 210, 4), M.steel, [1405, 106, Z1 + 5]);
      put(S.g.box(6, 26, 6), M.dark, [1440, 105, Z1 + 9]);
      put(S.g.box(40, 12, 22), M.metal, [1405, 268, Z1 + 11]);
      // gaines et échelle sur la façade
      put(S.g.box(26, 330, 18), M.paint, [1700, 165, Z1 + 9]);
      for (const dx of [-16, 16]) put(S.g.box(4, 360, 4), M.steel, [1560 + dx, 180, Z1 + 12]);
      for (let y = 20; y < 350; y += 30) put(S.g.box(32, 3, 3), M.steel, [1560, y, Z1 + 12]);
      // enseigne sur le toit du local (structure)
      for (const x of [1340, 1720]) put(S.g.box(8, 150, 8), M.metal, [x, H + 75, -1150]);
      put(S.g.box(420, 128, 14), M.dark, [1530, H + 105, -1158]);
      // mât d'antenne en treillis
      const AX = 1650, AZ = -1250, A0 = H + 10, A1 = 1500, rr = 30;
      const leg = k => [AX + Math.cos(k * 2.094) * rr, AZ + Math.sin(k * 2.094) * rr];
      for (let k = 0; k < 3; k++) { const p = leg(k); put(S.g.cyl(3.2, 3.2, A1 - A0, 6), M.steel, [p[0], (A0 + A1) / 2, p[1]]); }
      for (let y = A0; y < A1 - 60; y += 60) for (let k = 0; k < 3; k++) { const a = leg(k), b = leg(k + 1); beam([a[0], y, a[1]], [b[0], y + 60, b[1]], 1.4, M.steel, 4); }
      put(S.g.cyl(1.6, 1.6, 300, 4), M.steel, [AX, A1 + 150, AZ]);
      [[800, 0.6], [1050, -0.9]].forEach(([y, a]) => { const d = put(S.g.lathe([[0, 0], [40, 8], [56, 22]], 16), M.paint, [AX + Math.cos(a) * 60, y, AZ + Math.sin(a) * 60], [Math.PI / 2, 0, a]); d.rotation.order = 'YXZ'; });
      // distributeur de boissons
      put(S.g.box(104, 186, 78), M.red, [1235, 93, -1000]);
      put(S.g.box(110, 10, 84), M.metal, [1235, 191, -1000]);
    }
    const vendTex = S.canvasTex(256, 512, (c, w, h) => {
      c.fillStyle = '#e8eef4'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#1060c0'; c.fillRect(0, 0, w, 54); plain(c, 'ネオドリンク', 128, 28, 30, '#fff');
      const cols = ['#e02030', '#1890e0', '#f0a020', '#20a050', '#f4f4f4', '#8020c0', '#202020'];
      for (let row = 0; row < 3; row++) {
        c.fillStyle = row === 2 ? '#c81828' : '#1a5ad0'; c.fillRect(8, 64 + row * 112 + 84, 240, 16); plain(c, row === 2 ? 'あったか〜い' : 'つめたい', 128, 64 + row * 112 + 92, 12, '#fff');
        for (let k = 0; k < 6; k++) {
          const x = 14 + k * 39, y = 70 + row * 112, cc = cols[(row * 3 + k) % 7];
          c.fillStyle = cc; rrect(c, x, y, 30, 72, 6); c.fill(); c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(x + 4, y + 8, 5, 56);
          c.fillStyle = '#222'; c.fillRect(x + 3, y + 30, 24, 14); c.fillStyle = '#2f8'; c.fillRect(x + 10, y + 77, 10, 4);
        }
      }
      c.fillStyle = '#202228'; c.fillRect(0, 400, w, 112); c.fillStyle = '#0a0a0c'; c.fillRect(40, 450, 176, 50);
      c.fillStyle = '#e0b030'; c.fillRect(196, 410, 30, 26); c.fillStyle = '#40e070'; c.fillRect(30, 414, 70, 18); plain(c, '¥130', 65, 424, 14, '#062');
    });
    const vendMat = S.glow(0xffffff, 1.35, { map: vendTex });
    put(new T.PlaneGeometry(92, 176), vendMat, [1235, 96, -960.5]);

    prof('roof');
    /* =========================================================
       ENSEIGNES : atlas 2048×1024 (néons, caissons lumineux)
       ========================================================= */
    const AW = 2048, AH = 1024;
    const SMALL = ['カラオケ', 'ラーメン', '居酒屋', '薬', '寿司', 'バー', 'ゲーム', '電脳', '未来', '酒', '占い', '24H', 'パチンコ', 'ホテル', '焼肉', '餃子', '珈琲', '書店', '歯科', '質屋', 'ネオン', '整体', '麻雀', '銭湯'];
    const SCOL = ['#ff3cb4', '#3ce0ff', '#ffb43c', '#ff4a3c', '#b45cff', '#5cff9a', '#fff27a'];
    const atlasTex = S.canvasTex(AW, AH, (c) => {
      c.fillStyle = '#05040a'; c.fillRect(0, 0, AW, AH);
      // A : ロボット (néon magenta)
      c.fillStyle = '#12060f'; c.fillRect(6, 6, 188, 1012); tube(c, 18, 18, 164, 988, 20, '#ff2fb0', 8);
      vneon(c, 'ロボット', 100, 150, 225, 170, '#ff2fb0', '#ffd8f0');
      // B : ネオ東京 (néon cyan, cadre ambre)
      c.fillStyle = '#04101a'; c.fillRect(206, 6, 188, 1012); tube(c, 218, 18, 164, 988, 20, '#ffae2a', 8);
      vneon(c, 'ネオ東京', 300, 150, 230, 165, '#2fe0ff', '#e0fbff');
      // C : 格闘 (caisson blanc, lettres rouges)
      c.fillStyle = '#d8d2c8'; c.fillRect(406, 6, 188, 500); c.strokeStyle = '#c8101c'; c.lineWidth = 12; c.strokeRect(418, 18, 164, 476);
      plain(c, '格', 500, 150, 150, '#c8101c'); plain(c, '闘', 500, 350, 150, '#c8101c');
      // D : 電気 (caisson ambre, lettres noires)
      c.fillStyle = '#ffb21e'; c.fillRect(406, 518, 188, 500); c.fillStyle = '#1a0e00'; c.fillRect(418, 530, 164, 6); c.fillRect(418, 1000, 164, 6);
      plain(c, '電', 500, 670, 150, '#1a0e00'); plain(c, '気', 500, 870, 150, '#1a0e00');
      // E : ロボット格闘 (horizontal)
      c.fillStyle = '#08040e'; c.fillRect(606, 6, 1188, 244); tube(c, 620, 20, 1160, 216, 26, '#8a5cff', 7);
      neon(c, 'ロボット', 980, 128, 150, '#2fe0ff', '#e6fdff'); neon(c, '格闘', 1520, 128, 170, '#ff2fb0', '#ffe0f4');
      // F : ファイト ! (ambre)
      c.fillStyle = '#100802'; c.fillRect(606, 262, 788, 180); tube(c, 618, 274, 764, 156, 22, '#ff8a20', 6);
      neon(c, 'ファイト！', 1000, 354, 120, '#ffb030', '#fff2d0');
      // G : ホテル ♥
      c.fillStyle = '#10020a'; c.fillRect(1406, 262, 388, 180); neon(c, 'ホテル♥', 1600, 354, 92, '#ff4a8a', '#ffe0ec');
      // H : sortie de secours (非常口) + plaque 機械室
      c.fillStyle = '#0fa058'; c.fillRect(1806, 6, 236, 118); c.fillStyle = '#fff';
      c.beginPath(); c.arc(1846, 36, 11, 0, 7); c.fill(); c.lineWidth = 9; c.strokeStyle = '#fff'; c.lineCap = 'round'; c.beginPath(); c.moveTo(1840, 52); c.lineTo(1832, 84); c.lineTo(1818, 104); c.moveTo(1832, 84); c.lineTo(1852, 104); c.moveTo(1840, 56); c.lineTo(1860, 72); c.moveTo(1838, 58); c.lineTo(1820, 70); c.stroke();
      plain(c, '非常口', 1950, 66, 46, '#fff');
      c.fillStyle = '#e8e8e4'; c.fillRect(1806, 136, 236, 80); plain(c, '機械室', 1924, 176, 44, '#202020');
      // petites enseignes (12 × 2)
      SMALL.forEach((w, i) => {
        const x = 606 + (i % 12) * 120, y = 452 + Math.floor(i / 12) * 286, cc = SCOL[i % SCOL.length], n = [...w].length, sz = Math.min(92, 236 / n);
        const box = i % 3 === 1;
        if (box) { c.fillStyle = cc; c.fillRect(x + 8, y + 4, 104, 276); vneon(c, w, x + 60, y + 142 - (n - 1) * sz * 0.53, sz * 1.06, 'rgba(0,0,0,0)', '#140a10', 0); }
        else { c.fillStyle = '#07050c'; c.fillRect(x + 8, y + 4, 104, 276); tube(c, x + 14, y + 10, 92, 264, 10, cc, 4); vneon(c, w, x + 60, y + 142 - (n - 1) * sz * 0.53, sz * 1.06, cc, '#fff'); }
      });
    }, { aniso: 8 });
    const SIGN_I = 2.3;
    const signMat = S.glow(0xffffff, SIGN_I, { map: atlasTex, fog: true });
    const signFlick = S.glow(0xffffff, SIGN_I, { map: atlasTex, fog: true });
    const signFar = S.glow(0xffffff, 1.7, { map: atlasTex, fog: true });
    const R_A = [0, 0, 200, 1024], R_B = [200, 0, 200, 1024], R_C = [400, 0, 200, 512], R_D = [400, 512, 200, 512], R_E = [600, 0, 1200, 256], R_F = [600, 256, 800, 192], R_G = [1400, 256, 400, 192], R_EXIT = [1800, 0, 248, 128], R_PLATE = [1800, 128, 248, 96];
    const R_S = i => [600 + (i % 12) * 120 + 6, 448 + Math.floor(i / 12) * 286 + 2, 108, 282];

    // enseigne du local technique + sortie de secours + plaque
    put(atlasQuad(404, 86, R_E, AW, AH), signFlick, [1530, 445, -1150]);
    put(atlasQuad(54, 28, R_EXIT, AW, AH), signMat, [1405, 236, -1032]);
    put(atlasQuad(40, 16, R_PLATE, AW, AH), S.basic({ map: atlasTex }), [1405, 190, -1032]);
    const lampMat = S.glow(0xffd29a, 4);
    put(S.g.box(34, 8, 16), lampMat, [1405, 262, -1022]);

    prof('atlas');
    /* =========================================================
       IMMEUBLES : fenêtres procédurales (shader), 3 couches dans la brume
       ========================================================= */
    const BL = [];
    const addB = (x0, x1, z0, z1, y1, o = {}) => { const b = { x0, x1, z0, z1, y0: o.y0 != null ? o.y0 : -500, y1, ww: o.ww || 30 + rnd() * 26, fh: o.fh || 28 + rnd() * 12, seed: rnd() * 100, lit: o.lit != null ? o.lit : 0.22 + rnd() * 0.38, style: o.style != null ? o.style : (rnd() < 0.4 ? 1 : 0), br: o.br || 1 }; BL.push(b); return b; };
    // voisins immédiats (cadre gauche / droite)
    const NL = addB(-2700, -560, -3500, -2900, 2600, { ww: 44, fh: 36, lit: 0.42, style: 0, br: 1.1 });
    const NR = addB(1950, 4300, -3750, -3150, 3000, { ww: 40, fh: 34, lit: 0.36, style: 1 });
    addB(-560, -150, -3800, -3300, 380, { lit: 0.3 });
    addB(1500, 1950, -4100, -3600, 520, { lit: 0.3 });
    const HB = addB(-470, -50, -5700, -5300, 420, { lit: 0.25 }); // socle de l'hologramme
    // couche moyenne
    const mid = [];
    for (let i = 0; i < (Q > 1 ? 34 : 52); i++) {
      const x = -5200 + rnd() * 11800, z = -4200 - rnd() * 3600, w = 280 + rnd() * 600, d = 260 + rnd() * 520;
      // composition : au centre (derrière les combattants) la ville reste basse → une trouée de ciel brumeux
      const center = x > -700 && x < 2000;
      const h = center ? 150 + rnd() * rnd() * 700 : 300 + rnd() * rnd() * 2600;
      mid.push(addB(x - w / 2, x + w / 2, z - d, z, h));
    }
    // couche lointaine + mégatours
    const far = [];
    for (let i = 0; i < (Q > 1 ? 80 : 130); i++) {
      const x = -9500 + rnd() * 20500, z = -8000 - rnd() * 6200, w = 380 + rnd() * 900, d = 380 + rnd() * 800;
      const h = x > -1800 && x < 3100 ? 450 + rnd() * rnd() * 900 : 450 + rnd() * rnd() * 3400;
      far.push(addB(x - w / 2, x + w / 2, z - d, z, h, { lit: 0.18 + rnd() * 0.32 }));
      if (h > 1800 && rnd() < 0.6) far.push(addB(x - w * 0.32, x + w * 0.32, z - d * 0.8, z - d * 0.2, h + 300 + rnd() * 700, { lit: 0.3 })); // retrait
    }
    const megas = [[-2900, -9800, 900, 4600], [3900, -10500, 1100, 5200], [-6200, -12000, 1000, 4200], [7400, -11500, 900, 3900]];
    megas.forEach(([x, z, w, h]) => { far.push(addB(x - w / 2, x + w / 2, z - w, z, h, { lit: 0.4, style: 1 })); far.push(addB(x - w * 0.3, x + w * 0.3, z - w * 0.8, z - w * 0.2, h + 500, { lit: 0.5, style: 1 })); });
    // très loin : silhouettes
    for (let i = 0; i < (Q > 1 ? 40 : 70); i++) { const x = -10000 + rnd() * 21000, z = -14200 - rnd() * 800, w = 500 + rnd() * 1100; addB(x - w / 2, x + w / 2, z - 500, z, x > -3000 && x < 4300 ? 500 + rnd() * 1100 : 600 + rnd() * 2600, { lit: 0.12 + rnd() * 0.15, ww: 60, fh: 50 }); }

    function buildingGeo(list) {
      const P = [], Wv = [], Bv = [];
      const quad = (a, b, c, d, wa, wb, wc, wd, bb) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); Wv.push(...wa, ...wb, ...wc, ...wa, ...wc, ...wd); for (let i = 0; i < 6; i++) Bv.push(...bb); };
      for (const b of list) {
        const bb = [b.seed, b.lit, b.style, b.br], Y0 = b.y0, Y1 = b.y1, v0 = (Y0 + 1000) / b.fh, v1 = (Y1 + 1000) / b.fh;
        const uF = (b.x1 - b.x0) / b.ww, uS = (b.z1 - b.z0) / b.ww;
        quad([b.x0, Y0, b.z1], [b.x1, Y0, b.z1], [b.x1, Y1, b.z1], [b.x0, Y1, b.z1], [0, v0, 0], [uF, v0, 0], [uF, v1, 0], [0, v1, 0], bb);
        quad([b.x1, Y0, b.z1], [b.x1, Y0, b.z0], [b.x1, Y1, b.z0], [b.x1, Y1, b.z1], [0, v0, 2], [uS, v0, 2], [uS, v1, 2], [0, v1, 2], bb);
        quad([b.x0, Y0, b.z0], [b.x0, Y0, b.z1], [b.x0, Y1, b.z1], [b.x0, Y1, b.z0], [0, v0, 2], [uS, v0, 2], [uS, v1, 2], [0, v1, 2], bb);
        quad([b.x0, Y1, b.z1], [b.x1, Y1, b.z1], [b.x1, Y1, b.z0], [b.x0, Y1, b.z0], [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1], bb);
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('aW', new T.Float32BufferAttribute(Wv, 3)); g.setAttribute('aB', new T.Float32BufferAttribute(Bv, 4));
      g.computeBoundingSphere(); return g;
    }
    const bldMat = S.basic({ color: 0xffffff, fog: true });
    bldMat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = tU;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aW; attribute vec4 aB; varying vec3 vW; varying vec4 vB; varying float vY; varying vec3 vWP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = aW; vB = aB; vWP = (modelMatrix * vec4(position, 1.0)).xyz; vY = vWP.y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform float uT; varying vec3 vW; varying vec4 vB; varying float vY; varying vec3 vWP;
        float hb(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }`)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
          float sd = vB.x;
          vec3 base = vec3(0.03, 0.032, 0.048) * (0.8 + 0.5 * hb(vec2(sd, 3.0)));
          vec3 bcol;
          if (vW.z > 0.5 && vW.z < 1.5) bcol = base * 0.55;
          else {
            vec2 cell = floor(vW.xy), f = fract(vW.xy);
            float h = hb(cell + sd * 17.0);
            float band = hb(vec2(floor(cell.y / 3.0) + sd * 5.0, sd));
            float colb = hb(vec2(floor(cell.x / 4.0) + sd * 9.0, sd * 2.0));
            float p = vB.y * (0.3 + 1.4 * band) * (0.55 + 0.9 * colb);
            float tg = step(0.992, hb(cell * 0.37 + floor(uT * 0.3 + h * 40.0)));
            float on = abs(step(h, p) - tg);
            float mx = vB.z > 0.5 ? 0.05 : 0.16;
            vec2 fw = fwidth(vW.xy);
            float m = smoothstep(mx, mx + fw.x + 0.03, f.x) * smoothstep(1.0 - mx, 1.0 - mx - fw.x - 0.03, f.x) * smoothstep(0.22, 0.22 + fw.y + 0.04, f.y) * smoothstep(0.86, 0.86 - fw.y - 0.04, f.y);
            float hc = hb(cell * 1.7 + sd);
            vec3 wc = hc < 0.55 ? vec3(1.0, 0.66, 0.34) : (hc < 0.9 ? vec3(0.6, 0.8, 1.0) : (hc < 0.96 ? vec3(1.0, 0.32, 0.72) : vec3(0.35, 1.0, 0.9)));
            wc *= 0.3 + 0.75 * hb(cell * 2.3 + sd);
            float k = clamp(max(fw.x, fw.y) * 1.4 - 0.35, 0.0, 1.0);
            vec3 lit = mix(wc * on * m, vec3(0.8, 0.66, 0.55) * min(p, 1.0) * 0.32, k);
            bcol = base + lit * vB.w * (0.9 + 0.1 * (1.0 - m));
            if (vW.z > 1.5) bcol *= 0.62;
          }
          bcol += vec3(0.42, 0.16, 0.3) * smoothstep(250.0, -500.0, vY) * 0.28;
          // brume de pluie : plus dense au ras des rues (éclairée par les néons d'en bas), s'éclaircit en altitude
          float dC = length(vWP - cameraPosition);
          float hl = exp(-max(vY + 300.0, 0.0) / 1300.0);
          float hz = (1.0 - exp(-dC * 0.000125)) * (0.42 + 0.58 * hl);
          vec3 hzC = mix(vec3(0.035, 0.03, 0.06), vec3(0.15, 0.055, 0.11), hl);
          bcol = mix(bcol, hzC, clamp(hz, 0.0, 0.94));
          vec4 diffuseColor = vec4(bcol, opacity);`);
    };
    const bldGeo = buildingGeo(BL);
    const bld = new T.Mesh(bldGeo, bldMat); noMerge(bld); root.add(bld);
    { const back = new T.Mesh(bldGeo, bldMat); back.rotation.y = Math.PI; back.position.set(1300, 0, 0); envOnly.add(back); }

    // couronnes néon des tours + feux d'obstacle
    const NEONC = [col(0xff2fb0), col(0x2fe0ff), col(0xffa030), col(0xb070ff), col(0xffffff)];
    const avi = [];
    [...mid, ...far].forEach((b, i) => {
      const w = b.x1 - b.x0, d = b.z1 - b.z0;
      if (rnd() < 0.32 && b.y1 > 500) { const c = NEONC[Math.floor(rnd() * NEONC.length)], k = 2.6; vcBox(w + 4, 7, 4, [(b.x0 + b.x1) / 2, b.y1 - 6, b.z1 + 2], c, k); if (rnd() < 0.5) { vcBox(4, Math.min(600, b.y1 - 100), 4, [b.x0 - 1, b.y1 - Math.min(600, b.y1 - 100) / 2 - 6, b.z1 + 1], c, k); vcBox(4, Math.min(600, b.y1 - 100), 4, [b.x1 + 1, b.y1 - Math.min(600, b.y1 - 100) / 2 - 6, b.z1 + 1], c, k); } }
      else if (rnd() < 0.15 && b.y1 > 400) { const c = NEONC[Math.floor(rnd() * NEONC.length)]; for (let y = b.y1 - 60; y > Math.max(0, b.y1 - 500); y -= 120) vcBox(w + 2, 4, 3, [(b.x0 + b.x1) / 2, y, b.z1 + 1.5], c, 1.8); }
      if (b.y1 > 900) { avi.push({ p: [b.x0 + 10, b.y1 + 12, b.z1 - 10], s: 70, c: [1, 0.12, 0.08], i: 2.2, m: 1, ph: (i % 2) * 0.5 }); if (w > 600) avi.push({ p: [b.x1 - 10, b.y1 + 12, b.z1 - 10], s: 70, c: [1, 0.12, 0.08], i: 2.2, m: 1, ph: (i % 2) * 0.5 }); }
    });
    megas.forEach(([x, z, w, h]) => { avi.push({ p: [x, h + 560, z - w / 2], s: 140, c: [1, 0.15, 0.1], i: 3, m: 1, ph: 0.2 }); vcBox(w * 0.6 + 6, 10, w * 0.6 + 6, [x, h + 505, z - w / 2], col(0x2fe0ff), 2.4); });

    prof('buildings');
    /* ----- enseignes des voisins ----- */
    const signs = S.group();
    const sgn = (rect, w, h, p, ry, mat, frame = true) => {
      const m = S.add(signs, atlasQuad(w, h, rect, AW, AH), mat || signMat, { p, r: [0, ry || 0, 0] });
      if (frame) S.add(signs, S.g.box(w + 12, h + 12, 10), M.dark, { p: [p[0] - Math.sin(ry || 0) * 6, p[1], p[2] - Math.cos(ry || 0) * 6], r: [0, ry || 0, 0] });
      return m;
    };
    sgn(R_A, 150, 768, [-470, 560, -2860], 0.42, signFlick);
    sgn(R_B, 150, 768, [1870, 600, -3100], -0.42);
    sgn(R_C, 130, 325, [-1020, 420, -2893], 0);
    sgn(R_D, 130, 325, [2380, 330, -3143], 0);
    sgn(R_F, 600, 144, [-1500, 700, -2893], 0);
    sgn(R_G, 300, 144, [3100, 420, -3143], 0);
    // supports des enseignes en drapeau
    [[-470, -2860, 0.42], [1870, -3100, -0.42]].forEach(([x, z, ry]) => { for (const y of [200, 920]) S.add(signs, S.g.box(110, 8, 8), M.metal, { p: [x - Math.cos(ry) * 70 * Math.sign(ry), y, z - 30], r: [0, ry, 0] }); });
    // petites enseignes sur la couche moyenne
    let si = 0;
    mid.forEach(b => {
      if (b.y1 < 260 || si >= 24 || rnd() < 0.35) return;
      const n = 1 + (rnd() < 0.4 ? 1 : 0);
      for (let k = 0; k < n && si < 24; k++) {
        const h = 150 + rnd() * 90, w = h * 108 / 282, x = b.x0 + 40 + rnd() * (b.x1 - b.x0 - 80), y = Math.max(60, Math.min(b.y1 - h / 2 - 30, 160 + rnd() * 500));
        S.add(signs, atlasQuad(w, h, R_S(si % 24), AW, AH), signFar, { p: [x, y, b.z1 + 4] });
        si++;
      }
    });
    root.add(S.merge(signs));

    /* ----- écran géant animé (immeuble de droite) ----- */
    const adTex = S.canvasTex(1024, 512, (c) => {
      // 0 : ROBOT FIGHTER II
      let g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#3a0010'); g.addColorStop(1, '#0a0004'); c.fillStyle = g; c.fillRect(0, 0, 512, 256);
      c.fillStyle = '#ff2a3a'; for (let i = 0; i < 14; i++) { c.globalAlpha = 0.25; c.beginPath(); c.moveTo(256, 128); c.lineTo(Math.cos(i * 0.45) * 600 + 256, Math.sin(i * 0.45) * 600 + 128); c.lineTo(Math.cos(i * 0.45 + 0.12) * 600 + 256, Math.sin(i * 0.45 + 0.12) * 600 + 128); c.fill(); }
      c.globalAlpha = 1; neon(c, 'ロボット格闘 II', 256, 92, 56, '#ff3040', '#fff0e0'); plain(c, 'ROBOT FIGHTER II', 256, 160, 40, '#ffd23a', '900'); plain(c, '今夜、ネオ東京の屋上で', 256, 210, 24, '#fff');
      // 1 : ネオコーラ
      g = c.createLinearGradient(512, 0, 1024, 256); g.addColorStop(0, '#0060d0'); g.addColorStop(1, '#00d0ff'); c.fillStyle = g; c.fillRect(512, 0, 512, 256);
      c.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 40; i++) { c.beginPath(); c.arc(520 + (i * 97) % 500, (i * 53) % 256, 3 + (i % 5) * 2, 0, 7); c.fill(); }
      c.fillStyle = '#e8102a'; rrect(c, 580, 40, 70, 190, 22); c.fill(); c.fillStyle = '#fff'; c.fillRect(580, 110, 70, 30);
      neon(c, 'ネオコーラ', 830, 100, 64, '#ffffff', '#ffffff', 10); plain(c, '爽快！ 雨の夜に', 830, 180, 34, '#fff');
      // 2 : 万博
      g = c.createLinearGradient(0, 256, 0, 512); g.addColorStop(0, '#ff3cb4'); g.addColorStop(1, '#3a0a5a'); c.fillStyle = g; c.fillRect(0, 256, 512, 256);
      c.fillStyle = 'rgba(10,0,30,0.7)'; for (let i = 0; i < 22; i++) { const w = 14 + (i * 37) % 30, h = 40 + (i * 71) % 150; c.fillRect(i * 24, 512 - h, w, h); }
      neon(c, 'ネオ東京万博', 256, 330, 58, '#fff27a', '#ffffff'); plain(c, 'NEO TOKYO EXPO 2099', 256, 395, 30, '#fff', '900');
      // 3 : météo
      c.fillStyle = '#081830'; c.fillRect(512, 256, 512, 256); c.fillStyle = '#2fe0ff'; c.fillRect(512, 256, 512, 40); plain(c, 'ニュース  天気予報', 768, 277, 26, '#03121c');
      plain(c, '雨', 640, 400, 120, '#9fd8ff'); plain(c, '18°C', 860, 380, 90, '#ffffff', '900'); plain(c, '降水確率 100%', 860, 450, 30, '#9fd8ff');
    }, { aniso: 4 });
    adTex.repeat.set(0.5, 0.5);
    const adMat = S.glow(0xffffff, 1.5, { map: adTex, fog: true });
    const ad = put(new T.PlaneGeometry(800, 400), adMat, [2520, 780, -3138]);
    noMerge(ad); statics.remove(ad); root.add(ad);
    put(S.g.box(830, 430, 14), M.dark, [2520, 780, -3147]);

    /* ----- hologramme publicitaire (tête de robot) au-dessus de l'immeuble HB ----- */
    const holoTex = S.canvasTex(512, 640, (c) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, 512, 640);
      c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineWidth = 7; c.shadowColor = '#fff'; c.shadowBlur = 10;
      const g = c.createRadialGradient(256, 200, 40, 256, 200, 140); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0.5)');
      c.fillStyle = g; c.beginPath(); c.arc(256, 205, 138, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = 'rgba(0,0,0,1)'; rrect(c, 150, 150, 212, 112, 50); c.fill(); c.lineWidth = 6; c.stroke();
      c.lineWidth = 3; c.beginPath(); c.arc(256, 340, 175, Math.PI * 1.36, Math.PI * 1.64); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.65)'; [96, 416].forEach(x => { c.beginPath(); c.arc(x, 215, 34, 0, 7); c.fill(); c.stroke(); });
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(226, 342, 60, 34); c.strokeRect(226, 342, 60, 34);
      c.beginPath(); c.moveTo(40, 520); c.quadraticCurveTo(70, 392, 256, 380); c.quadraticCurveTo(442, 392, 472, 520); c.closePath(); c.fillStyle = 'rgba(255,255,255,0.3)'; c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillRect(220, 430, 72, 26);
      c.lineWidth = 2; c.setLineDash([12, 10]); c.beginPath(); c.arc(256, 260, 236, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      c.shadowBlur = 14; plain(c, 'ロボット格闘', 256, 588, 62, '#fff');
    }, { aniso: 4 });
    const holoMat = new T.ShaderMaterial({
      uniforms: { map: { value: holoTex }, uT: tU, uDim: dimU, uI: { value: 1.25 } },
      vertexShader: BASIC_VS,
      fragmentShader: `uniform sampler2D map; uniform float uT, uDim, uI; varying vec2 vUv;
        float h1(float n){ return fract(sin(n) * 43758.5453); }
        void main(){
          vec2 uv = vUv;
          float band = floor(uv.y * 36.0);
          float gl = step(0.9, h1(band + floor(uT * 7.0) * 7.1)) * step(0.72, h1(floor(uT * 1.3) + 0.5));
          uv.x += (h1(band * 3.1 + floor(uT * 9.0)) - 0.5) * 0.12 * gl;
          float r = texture2D(map, uv + vec2(0.006 + 0.02 * gl, 0.0)).r, gC = texture2D(map, uv).r, b = texture2D(map, uv - vec2(0.006 + 0.02 * gl, 0.0)).r;
          float scan = 0.62 + 0.38 * sin(vUv.y * 380.0 - uT * 7.0);
          float sweep = smoothstep(0.06, 0.0, abs(fract(vUv.y * 0.7 - uT * 0.22) - 0.5));
          float fl = 0.86 + 0.14 * sin(uT * 31.0) * sin(uT * 11.7);
          vec3 tint = mix(vec3(0.15, 0.85, 1.0), vec3(1.0, 0.3, 0.85), smoothstep(0.15, 0.95, vUv.y + 0.12 * sin(uT * 0.7)));
          vec3 c = vec3(r, gC, b) * tint * (scan * fl + sweep * 0.9);
          float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x) * smoothstep(0.0, 0.05, vUv.y);
          gl_FragColor = vec4(c * uI * uDim * edge, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
    });
    const holo = new T.Mesh(new T.PlaneGeometry(500, 625), holoMat);
    holo.position.set(-260, 740, -5480); holo.renderOrder = 2; noMerge(holo); root.add(holo);
    // faisceau du projecteur
    const coneMat = (color, I, up) => new T.ShaderMaterial({
      uniforms: { uC: { value: new T.Color(color) }, uI: { value: I }, uDim: dimU },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uC; uniform float uI, uDim; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float l = ${up ? 'pow(1.0 - vUv.y, 1.6)' : 'pow(vUv.y, 1.3)'};
          gl_FragColor = vec4(uC * uI * uDim * f * f * l, 1.0); }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
    });
    const holoBeam = new T.Mesh(new T.CylinderGeometry(240, 20, 300, 24, 1, true), coneMat(0x6fe8ff, 0.22, true));
    holoBeam.position.set(-260, 420 + 150, -5480); holoBeam.renderOrder = 2; noMerge(holoBeam); root.add(holoBeam);

    /* ----- tour de Tokyo (au loin, dans la brume) ----- */
    {
      const tw = S.group(), X = 1500, Z = -11800, Hh = 2200, tmat = S.glow(0xff7a2a, 1.25, { fog: false });
      const half = y => 190 * Math.pow(1 - y / 1750, 1.5) + 14;
      const corner = (y, sx, sz) => [X + sx * half(y), y, Z + sz * half(y)];
      const lv = [0, 250, 480, 700, 950, 1200, 1450, 1700];
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) for (let i = 0; i < lv.length - 1; i++) beam(corner(lv[i], sx, sz), corner(lv[i + 1], sx, sz), 7, tmat, 4, tw);
      for (let i = 1; i < lv.length; i++) { const y = lv[i], h = half(y); beam([X - h, y, Z + h], [X + h, y, Z + h], 4, tmat, 4, tw); beam([X - h, lv[i - 1], Z + half(lv[i - 1])], [X + h, y, Z + h], 3, tmat, 4, tw); beam([X + half(lv[i - 1]), lv[i - 1], Z + half(lv[i - 1])], [X - h, y, Z + h], 3, tmat, 4, tw); }
      S.add(tw, S.g.box(170, 60, 170), S.glow(0xffd0a0, 1.6), { p: [X, 1200, Z] });
      S.add(tw, S.g.box(110, 40, 110), tmat, { p: [X, 700 + 10, Z] });
      beam([X, 1700, Z], [X, Hh, Z], 9, tmat, 4, tw);
      root.add(S.merge(tw));
      avi.push({ p: [X, Hh + 20, Z], s: 120, c: [1, 0.2, 0.1], i: 2.5, m: 1, ph: 0.4 });
    }

    /* ----- néons lointains (couleurs par sommet) ----- */
    if (vcList.length) {
      const g = BGU.mergeGeometries(vcList, false);
      const nm = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, fog: true, toneMapped: false }));
      noMerge(nm); root.add(nm);
    }

    prof('signs+ad+holo');
    /* =========================================================
       CIEL : fond peint (nuages bas éclairés par la ville), couche de nuages qui défile, éclairs, projecteurs
       ========================================================= */
    const skyTex = S.canvasTex(2048, 1024, (c, w, h) => {
      const hz = 0.78 * h; // horizon (seule la bande 0,42..0,78 est visible depuis la caméra du combat)
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#020206'); g.addColorStop(0.3, '#06061a'); g.addColorStop(0.48, '#0e0c24'); g.addColorStop(0.62, '#1f1536'); g.addColorStop(0.72, '#3a1c3e'); g.addColorStop(0.78, '#542848'); g.addColorStop(1, '#2a1a30');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      const r = S.rng(77);
      // teinte de la lumière de la ville selon x (quartiers : magenta, ambre, violet, cyan)
      const HUE = [[255, 70, 170], [255, 150, 70], [170, 90, 255], [90, 200, 255], [255, 70, 170]];
      const hue = x => { const u = (x / w) * 4, i = Math.floor(u) % 4, f = u - Math.floor(u), a = HUE[i], b = HUE[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; };
      // plafond nuageux bas : ellipses étirées, dessous éclairé par la ville (plus clair vers l'horizon)
      c.save(); c.setTransform(1, 0, 0, 0.36, 0, 0);
      for (let i = 0; i < 620; i++) {
        const x = r() * w, yN = 0.4 + Math.pow(r(), 0.7) * 0.4, y = yN * h / 0.36, k = Math.min(1, Math.max(0, (yN - 0.4) / 0.38));
        const rad = (40 + r() * 150) * (0.6 + k), hc = hue(x), lit = 0.25 + 0.75 * k * k;
        const gg = c.createRadialGradient(x, y + rad * 0.35, 0, x, y, rad);
        const cr = 30 + (hc[0] * 0.55 - 30) * lit, cg = 18 + (hc[1] * 0.4 - 18) * lit, cb = 46 + (hc[2] * 0.5 - 46) * lit;
        gg.addColorStop(0, `rgba(${cr | 0},${cg | 0},${cb | 0},${0.12 + 0.16 * k})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gg; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      for (let i = 0; i < 300; i++) { // trouées sombres entre les masses
        const x = r() * w, y = (0.36 + r() * 0.36) * h / 0.36, rad = 50 + r() * 150, gg = c.createRadialGradient(x, y, 0, x, y, rad);
        gg.addColorStop(0, 'rgba(4,3,12,0.4)'); gg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gg; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      c.restore();
      // halo de la ville sur l'horizon
      for (let i = 0; i < 9; i++) { const fx = (i + 0.5) / 9 + (r() - 0.5) * 0.06, hc = hue(fx * w), R = 260 + r() * 260, gg = c.createRadialGradient(fx * w, hz, 0, fx * w, hz, R); gg.addColorStop(0, `rgba(${hc[0] | 0},${hc[1] | 0},${hc[2] | 0},0.2)`); gg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gg; c.fillRect(fx * w - R, hz - R, R * 2, R * 2); }
      grain(c, w, h, 6);
    }, { mip: true });
    const skyMat = S.basic({ map: skyTex, fog: false, toneMapped: false });
    const sky = new T.Mesh(new T.PlaneGeometry(46000, 9000), skyMat);
    sky.position.set(650, 2600 - 148 + 0.22 * 9000 / 2 - 900, -15600); noMerge(sky); root.add(sky);
    // calibrage : horizon de la texture (78 %) à hauteur de caméra
    sky.position.y = 148 + 9000 * (0.78 - 0.5);
    const cloudTex = S.canvasTex(1024, 512, (c, w, h) => {
      const r = S.rng(55);
      for (let i = 0; i < 260; i++) {
        const x = r() * w, y = h * (0.25 + r() * 0.6), rad = 30 + r() * 90;
        for (const ox of [-w, 0, w]) { const gg = c.createRadialGradient(x + ox, y, 0, x + ox, y, rad); gg.addColorStop(0, `rgba(${120 + r() * 60 | 0},${60 + r() * 30 | 0},${110 + r() * 40 | 0},0.16)`); gg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gg; c.fillRect(x + ox - rad, y - rad, rad * 2, rad * 2); }
      }
    }, { repeat: [1, 1] });
    cloudTex.wrapT = T.ClampToEdgeWrapping;
    const cloudMat = S.basic({ map: cloudTex, transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: T.AdditiveBlending });
    const clouds = new T.Mesh(new T.PlaneGeometry(40000, 5200), cloudMat);
    clouds.position.set(650, 148 + 2700, -15200); clouds.renderOrder = -2; noMerge(clouds); root.add(clouds);
    // éclair
    const boltTex = S.canvasTex(256, 1024, (c, w, h) => {
      const r = S.rng(3);
      const seg = (x, y, a, len, wdt, depth) => { c.lineWidth = wdt; c.beginPath(); c.moveTo(x, y); let px = x, py = y; for (let i = 0; i < len; i++) { px += (r() - 0.5) * 40 + a; py += 18 + r() * 22; c.lineTo(px, py); if (depth < 2 && r() < 0.08) { c.stroke(); seg(px, py, (r() - 0.5) * 30, 8 + r() * 10, wdt * 0.5, depth + 1); c.lineWidth = wdt; c.beginPath(); c.moveTo(px, py); } } c.stroke(); };
      c.strokeStyle = '#fff'; c.shadowColor = '#b8c8ff'; c.shadowBlur = 18; c.lineCap = 'round'; c.lineJoin = 'round';
      seg(128, 0, 0, 30, 6, 0);
    }, { mip: true });
    const boltMat = S.basic({ map: boltTex, transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: T.AdditiveBlending, color: 0xc8d4ff });
    const bolt = new T.Mesh(new T.PlaneGeometry(900, 3600), boltMat);
    bolt.position.set(-2000, 2900, -15000); bolt.visible = false; bolt.renderOrder = -1; noMerge(bolt); root.add(bolt);
    const flashLight = new T.PointLight(0xb8c6ff, 0, 0, 0); flashLight.position.set(900, 5000, -6000); root.add(flashLight);
    // projecteurs qui balaient les nuages
    const searchL = [];
    [[-2300, 1100, -9000, -0.42, 0], [3500, 1300, -9800, 0.4, 2.1], [-4800, 900, -12000, -0.2, 4.2]].forEach(([x, y, z, base, ph], k) => {
      if (Q > 1 && k > 1) return;
      const geo = new T.CylinderGeometry(300, 16, 7000, 20, 1, true); geo.translate(0, 3500, 0);
      const m = new T.Mesh(geo, coneMat(0xc8dcff, 0.11, true)); m.position.set(x, y, z); m.renderOrder = 1; noMerge(m); root.add(m);
      searchL.push({ m, base, ph });
    });

    prof('sky');
    /* =========================================================
       LUMIÈRES PONCTUELLES : balises rouges, héliport, parapet, lampe, halos des enseignes
       ========================================================= */
    // mât d'antenne
    [760, 1110, 1500, 1800].forEach((y, i) => avi.push({ p: [1650, y, -1250 + 30], s: i === 3 ? 60 : 46, c: [1, 0.1, 0.06], i: 3, m: 1, ph: 0.1 }));
    // château d'eau
    avi.push({ p: [-330, 565, -1130], s: 40, c: [1, 0.1, 0.06], i: 2.5, m: 1, ph: 0.6 });
    // feux de l'héliport (chenillard)
    for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2, x = 650 + Math.cos(a) * 548, z = -520 + Math.sin(a) * 548; if (z > 20) continue; avi.push({ p: [x, 2.5, z], s: 26, c: [0.75, 1, 0.35], i: 1.6, m: 3, ph: i / 22 }); }
    // veilleuses du parapet
    for (let x = -650; x <= 2050; x += 270) avi.push({ p: [x, 80, -1398], s: 22, c: [0.6, 0.85, 1], i: 1.1, m: 0 });
    // lampe de la porte, distributeur
    avi.push({ p: [1405, 258, -1012], s: 70, c: [1, 0.75, 0.45], i: 1.5, m: 5, ph: 0.3 });
    sprites(avi, 1);
    // halos diffus (lumière des enseignes sur les façades, flaques de lumière)
    const halos = [
      { p: [-470, 560, -2840], s: 900, c: col(0xff2fb0), i: 0.32, m: 0 }, { p: [1870, 600, -3080], s: 900, c: col(0x2fe0ff), i: 0.3, m: 0 },
      { p: [-1020, 420, -2880], s: 520, c: col(0xffe0d0), i: 0.18, m: 0 }, { p: [2380, 330, -3130], s: 500, c: col(0xffb21e), i: 0.22, m: 0 },
      { p: [2520, 780, -3120], s: 1300, c: col(0x80a0ff), i: 0.2, m: 0 }, { p: [-1500, 700, -2880], s: 800, c: col(0xff8a20), i: 0.2, m: 0 },
      { p: [-260, 700, -5470], s: 1100, c: col(0x50d0ff), i: 0.18, m: 2 }, { p: [1530, 445, -1135], s: 650, c: col(0x9060ff), i: 0.22, m: 0 },
      { p: [1235, 100, -955], s: 300, c: col(0xd8ecff), i: 0.3, m: 0 }, { p: [1405, 20, -980], s: 260, c: col(0xffc080), i: 0.25, m: 5, ph: 0.3 }
    ];
    sprites(halos, 0);
    // cône de lumière de la lampe de porte
    const lampCone = new T.Mesh(new T.CylinderGeometry(8, 110, 255, 20, 1, true), coneMat(0xffc890, 0.28, false));
    lampCone.position.set(1405, 258 - 127, -990); lampCone.renderOrder = 2; noMerge(lampCone); root.add(lampCone);

    /* =========================================================
       VIE : vapeur, rideaux de pluie, pluie, drone de police, dirigeable
       ========================================================= */
    const steamMat = (c, a) => new T.ShaderMaterial({
      uniforms: { uT: tU, uDim: dimU, uA: { value: a }, uC: { value: new T.Color(c) } }, vertexShader: BASIC_VS,
      fragmentShader: `uniform float uT, uDim, uA; uniform vec3 uC; varying vec2 vUv; ${NOISE_GLSL}
        void main(){
          vec2 p = vec2(vUv.x * 2.5, vUv.y * 3.2 - uT * 0.55);
          float n = fbm(p + fbm(p * 0.8 + vec2(0.0, -uT * 0.2)));
          float w = 0.12 + 0.3 * vUv.y;
          float mx = smoothstep(w, 0.0, abs(vUv.x - 0.5 - 0.08 * sin(vUv.y * 3.0 + uT * 0.7) * vUv.y));
          float my = smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.4, vUv.y);
          gl_FragColor = vec4(uC, smoothstep(0.38, 0.8, n) * mx * my * uA * uDim);
        }`,
      transparent: true, depthWrite: false
    });
    [[40, 170, -1200, 260, 700, 0xa8a0c0, 0.5], [-640, 190, -1230, 180, 420, 0x9a94b0, 0.32], [1250, 330, -1370, 120, 420, 0xb0a0c0, 0.35]].forEach(([x, y, z, w, h, c, a]) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), steamMat(c, a)); m.position.set(x, y + h / 2 - 20, z); m.renderOrder = 3; noMerge(m); root.add(m);
    });
    // rideaux de pluie lointains (traînées éclairées par la ville)
    const sheetMat = (a, rep) => new T.ShaderMaterial({
      uniforms: { uT: tU, uA: { value: a }, uDim: dimU, uRep: { value: new T.Vector2(rep[0], rep[1]) }, uC: { value: new T.Color(0x9fb4e0) } }, vertexShader: BASIC_VS,
      fragmentShader: `uniform float uT, uA, uDim; uniform vec2 uRep; uniform vec3 uC; varying vec2 vUv;
        float h1(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
        void main(){
          vec2 p = vUv * uRep; p.x += vUv.y * uRep.x * 0.03;
          float cl = floor(p.x), h = h1(cl);
          float y = fract(p.y + uT * (2.2 + h * 1.2) + h * 7.0);
          float s = smoothstep(0.0, 0.04, y) * smoothstep(0.5, 0.05, y) * smoothstep(0.5, 0.1, abs(fract(p.x) - 0.5)) * step(0.35, h1(cl * 1.7 + 3.0));
          float fade = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
          // rafales : des rideaux de pluie plus denses balayent la ville
          float gust = 0.25 + 1.5 * pow(0.5 + 0.5 * sin(vUv.x * 9.0 + uT * 0.9 + 1.7 * sin(vUv.x * 3.1 - uT * 0.4)), 3.0);
          gl_FragColor = vec4(uC * s * uA * fade * gust * uDim, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending
    });
    [[-2200, 7000, 2600, 0.075, [900, 9]], [-4200, 11000, 4200, 0.06, [1100, 10]]].forEach(([z, w, h, a, rep], k) => {
      if (Q > 1 && k) return;
      const m = new T.Mesh(new T.PlaneGeometry(w, h), sheetMat(a, rep)); m.position.set(650, h / 2 - 300, z); m.renderOrder = 1; noMerge(m); root.add(m);
    });
    // pluie (3 couches)
    const rq = Q > 1 ? 0.5 : Q > 0 ? 0.75 : 1;
    // gouttes éclairées par les sources voisines (enseignes, lampe, distributeur, projecteur du drone, éclairs) :
    // on complète le shader des particules du kit (couleur additionnelle calculée par goutte, sur GPU)
    const RLP = [], RLC = [], RL0 = [];
    const rlight = (x, y, z, rad, color, I) => { RLP.push(new T.Vector4(x, y, z, rad)); const c = new T.Color(color).multiplyScalar(I); RL0.push(c); RLC.push(new T.Vector4(c.r, c.g, c.b, 0)); return RLP.length - 1; };
    const RLI = {
      robot: rlight(-470, 560, -2800, 620, 0xff2fb0, 1.5), neo: rlight(1870, 600, -3040, 620, 0x2fe0ff, 1.4),
      lamp: rlight(1405, 170, -990, 210, 0xffb070, 2.2), vend: rlight(1235, 110, -890, 170, 0xd8e8ff, 1.3),
      roof: rlight(1530, 440, -1090, 330, 0x9a6aff, 1.3), ad: rlight(2520, 780, -2950, 760, 0xff4050, 1.0),
      drone: rlight(0, -9999, 0, 330, 0xf0f4ff, 2.2), flash: rlight(650, 1500, -1500, 4200, 0xb8c6ff, 0)
    };
    const litRain = (pts) => {
      const m = pts.material;
      m.uniforms.uLP = { value: RLP }; m.uniforms.uLC = { value: RLC };
      m.vertexShader = `#define NL ${RLP.length}\n` + m.vertexShader.replace('varying float vA;', 'varying float vA; varying vec3 vL; uniform vec4 uLP[NL]; uniform vec4 uLC[NL];')
        .replace('vS = gl_PointSize;', 'vS = gl_PointSize; vL = vec3(0.0); for (int i = 0; i < NL; i++) { vec3 dd = (w - uLP[i].xyz) / uLP[i].w; vL += uLC[i].rgb * exp(-dot(dd, dd)); }');
      m.fragmentShader = m.fragmentShader.replace('varying float vA;', 'varying float vA; varying vec3 vL;').replace('gl_FragColor = vec4(col,', 'gl_FragColor = vec4(col + vL,');
      return pts;
    };
    root.add(litRain(S.particles({ kind: 'rain', count: Math.round(1600 * rq), box: [-520, 520, 0, 650, -260, 420], size: 1.5, speed: 1500, opacity: 0.3, wind: [-110, 0], color: 0xa8bce8, seed: 3 })));
    root.add(litRain(S.particles({ kind: 'rain', count: Math.round(2800 * rq), box: [-950, 950, 0, 1000, -1400, -260], size: 2.4, speed: 1450, opacity: 0.36, wind: [-110, 0], color: 0x8a9cc8, seed: 5 })));
    root.add(litRain(S.particles({ kind: 'rain', count: Math.round(3600 * rq), box: [-2600, 2600, -100, 2400, -4800, -1450], size: 5.5, speed: 1400, opacity: 0.3, wind: [-120, 0], color: 0x7a88b8, seed: 9 })));

    // drone de police (passe régulièrement, gyrophares, projecteur)
    const drone = S.group(); drone.userData.noMerge = true;
    {
      const dg = S.group();
      S.add(dg, S.g.rbox(150, 34, 70, 10), M.dark, {});
      S.add(dg, S.g.rbox(70, 18, 50, 8), S.glow(0x9fd8ff, 1.2), { p: [30, 22, 0] });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { S.add(dg, S.g.cyl(26, 26, 10, 14), M.metal, { p: [sx * 85, 6, sz * 46] }); S.add(dg, S.g.box(40, 6, 6), M.metal, { p: [sx * 62, 4, sz * 40] }); }
      S.add(dg, S.g.box(60, 5, 40), S.glow(0xff2020, 2), { p: [-20, 19, 0] });
      S.merge(dg); drone.add(dg);
      sprites([{ p: [-35, 26, 0], s: 90, c: [1, 0.1, 0.1], i: 3, m: 4, ph: 0 }, { p: [-5, 26, 0], s: 90, c: [0.15, 0.3, 1], i: 3.5, m: 4, ph: 0.5 }, { p: [80, -6, 0], s: 70, c: [1, 1, 0.95], i: 2.5, m: 0 }], 1, drone);
      const dc = new T.Mesh(new T.CylinderGeometry(8, 170, 700, 20, 1, true), coneMat(0xe8f0ff, 0.16, false));
      dc.position.set(140, -330, 0); dc.rotation.z = 0.4; dc.renderOrder = 2; drone.add(dc);
      drone.visible = false; root.add(drone);
    }
    // dirigeable avec écran défilant
    const blimp = S.group(); blimp.userData.noMerge = true;
    const marqTex = S.canvasTex(1024, 128, (c, w, h) => {
      c.fillStyle = '#020306'; c.fillRect(0, 0, w, h);
      neon(c, 'ネオ東京へようこそ ★ ROBOT FIGHTER II ★ 雨の夜 ★', 512, 66, 58, '#ffb030', '#fff2d8', 8);
    }, { repeat: [1, 1] });
    {
      const bg = S.group();
      S.add(bg, S.g.ell(700, 165, 165, 28, 14), S.mat({ color: 0x2a2c34, roughness: 0.45, metalness: 0.4 }), {});
      for (const r of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) S.add(bg, S.g.box(160, 6, 130), M.dark, { p: [-620, Math.cos(r) * 90, Math.sin(r) * 90], r: [r, 0, 0] });
      S.add(bg, S.g.rbox(220, 50, 70, 10), M.dark, { p: [60, -170, 0] });
      S.merge(bg); blimp.add(bg);
      const scr = new T.Mesh(new T.PlaneGeometry(760, 110), S.glow(0xffffff, 1.6, { map: marqTex, fog: true }));
      scr.position.set(0, 10, 166); blimp.add(scr);
      sprites([{ p: [700, 0, 0], s: 90, c: [1, 1, 1], i: 2, m: 1, ph: 0 }, { p: [-640, 120, 0], s: 80, c: [1, 0.1, 0.1], i: 2, m: 1, ph: 0.5 }, { p: [60, -200, 0], s: 70, c: [0.2, 1, 0.4], i: 1.6, m: 2 }], 1, blimp);
      blimp.position.set(0, 1150, -8600); root.add(blimp);
    }

    /* ----- décor réservé aux reflets (cubemap) : enseignes derrière la caméra ----- */
    S.add(envOnly, new T.PlaneGeometry(900, 1600), S.glow(0xff2fb0, 1.6), { p: [-900, 700, 2600], r: [0, Math.PI * 0.85, 0] });
    S.add(envOnly, new T.PlaneGeometry(900, 1600), S.glow(0x2fe0ff, 1.6), { p: [2200, 700, 2600], r: [0, -Math.PI * 0.85, 0] });
    S.add(envOnly, new T.PlaneGeometry(1400, 500), S.glow(0xffa040, 1.2), { p: [650, 900, 3400], r: [0, Math.PI, 0] });

    prof('life');
    S.merge(statics);

    /* =========================================================
       ANIMATION (aucune allocation)
       ========================================================= */
    const sky0 = skyMat.color.clone(), cloud0 = cloudMat.color.clone(), adOff = [[0, 0.5], [0.5, 0.5], [0, 0], [0.5, 0]];
    const adCol = [[1, 0.16, 0.2], [0.1, 0.55, 1], [1, 0.3, 0.75], [0.15, 0.45, 0.85]];
    function rl(i, k) { const c = RL0[i]; RLC[i].set(c.r * k, c.g * k, c.b * k, 0); }
    function update(t, info) {
      if (envOnly.visible) envOnly.visible = false;
      const dk = 1 - (1 - (info.dim == null ? 1 : info.dim)) * (0.72 / 0.7);
      tU.value = t; dimU.value = dk;
      // néons qui grésillent
      const fk = flick(t, 1.7, 0.4), fl3 = flick(t, 3.3, 0.5);
      signFlick.color.setScalar(SIGN_I * fk);
      RB[RF.robot].y = 1.7 * fk; RB[RF.roof].y = 2.0 * fk; RB[RF.lamp].y = 3.5 * fl3;
      rl(RLI.robot, fk * dk); rl(RLI.roof, fk * dk); rl(RLI.lamp, fl3 * dk); rl(RLI.vend, dk); rl(RLI.neo, dk);
      signFar.color.setScalar(1.7 * flick(t, 5.3, 0.15));
      vendMat.color.setScalar(1.35 * (0.9 + 0.1 * flick(t, 9.1, 0.3)));
      lampMat.color.setRGB(1, 0.82, 0.6).multiplyScalar(4 * fl3);
      // écran géant : 4 pubs, transition « glitch »
      const fi = Math.floor(t / 5.5) % 4, ft = t % 5.5, gl = ft < 0.35;
      adTex.offset.set(adOff[fi][0] + (gl ? (hsh(Math.floor(t * 30)) - 0.5) * 0.03 : 0), adOff[fi][1]);
      const adk = gl ? 0.5 + hsh(Math.floor(t * 40) + 3) : 1;
      adMat.color.setScalar(1.5 * adk);
      RC[RF.ad].set(adCol[fi][0], adCol[fi][1], adCol[fi][2], 0); RB[RF.ad].y = 1.3 * adk;
      RLC[RLI.ad].set(adCol[fi][0] * adk * dk, adCol[fi][1] * adk * dk, adCol[fi][2] * adk * dk, 0);
      marqTex.offset.x = (t * 0.045) % 1;
      cloudTex.offset.x = (t * 0.0012) % 1;
      // éclairs
      const P = 9.5, kk = Math.floor(t / P), on = hsh(kk * 3.7) > 0.3, t0 = 1.5 + hsh(kk * 1.9) * 5, dt = t - kk * P - t0;
      let fl = 0;
      if (on && dt > 0 && dt < 0.9) fl = dt < 0.07 ? 1 : dt < 0.14 ? 0.15 : dt < 0.24 ? 0.85 : Math.max(0, 0.6 * (1 - (dt - 0.24) / 0.6));
      skyMat.color.copy(sky0).multiplyScalar(1 + fl * 2.2);
      cloudMat.color.copy(cloud0).multiplyScalar((1 + fl * 4) * dk);
      boltMat.color.setRGB(0.78, 0.83, 1).multiplyScalar(dk);
      bolt.visible = fl > 0.5; if (bolt.visible) { bolt.position.x = -5000 + hsh(kk * 5.1) * 11000; bolt.scale.x = hsh(kk * 2.3) < 0.5 ? 1 : -1; }
      flashLight.intensity = fl * 2.6 * dk;
      RB[RF.sky].y = fl * 0.9;
      RLC[RLI.flash].set(0.72 * fl, 0.78 * fl, fl, 0);
      // projecteurs
      for (let i = 0; i < searchL.length; i++) { const s = searchL[i]; s.m.rotation.z = s.base + Math.sin(t * 0.23 + s.ph) * 0.3; s.m.rotation.x = -0.25 + Math.sin(t * 0.17 + s.ph * 1.3) * 0.18; }
      // hologramme : respiration
      holo.position.y = 740 + Math.sin(t * 0.8) * 12;
      // drone : passage toutes les 26 s, à des profondeurs alternées
      const dp = t % 26, dir = Math.floor(t / 26) % 2 ? -1 : 1;
      drone.visible = dp < 11;
      if (drone.visible) { const u = dp / 11; drone.position.set(dir > 0 ? -2600 + u * 6200 : 3600 - u * 6200, 470 + Math.sin(t * 1.3) * 18 + (dir > 0 ? 0 : 60), dir > 0 ? -2050 : -2500); drone.rotation.set(Math.sin(t * 1.1) * 0.05, dir > 0 ? 0 : Math.PI, -0.08); }
      // le faisceau du drone éclaire la pluie sous lui
      RLP[RLI.drone].set(drone.position.x + (dir > 0 ? 260 : -260), drone.visible ? drone.position.y - 330 : -9999, drone.position.z, 330);
      // dirigeable
      blimp.position.x = -5200 + (t * 32 + 3500) % 11000; blimp.position.y = 1150 + Math.sin(t * 0.2) * 30;
    }

    prof('merge');
    return { root, update };
  }
})();
