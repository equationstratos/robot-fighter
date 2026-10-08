'use strict';
/* =========================================================
   Arène 3D : GRANDE MURAILLE — arène « à domicile » d'Unitree H1.  Contrat : voir js/arenas.js.
   Combat sur le chemin de ronde de la Grande Muraille, en hiver, à l'heure bleue, sous la neige.
   Plans (de l'avant vers le fond) :
     sol en grandes briques enneigées (neige dans les joints, plaques de glace, congères, traces de pas)
     → parapet crénelé (merlons coiffés de neige, stalactites) + mâts à bannières et lanternes rouges
     → tour de guet à toit de tuiles enneigé, pavillon éclairé, lanternes
     → la muraille qui serpente sur les crêtes, tours lointaines et chapelets de lanternes
     → chaînes de montagnes en couches dans la brume (pins enneigés, sommets blancs)
     → ciel de l'heure bleue (lune, dernière lueur du couchant, nuages qui dérivent, étoiles).
   Vie : neige en 3 couches poussée par des rafales (même vent pour les bannières, les lanternes et la neige
   soufflée au ras du sol), bancs de brume, lanternes qui vacillent, scintillement de la neige.
   ========================================================= */
(function () {
  /* ---------------- bruit (construction uniquement) ---------------- */
  function hash(x, y, s) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1013904223)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function vnoise(x, y, s) { const xi = Math.floor(x), yi = Math.floor(y); let xf = x - xi, yf = y - yi; xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; }
  function fbm(x, y, o, s) { let v = 0, a = 0.5, n = 0; for (let i = 0; i < o; i++) { v += a * vnoise(x, y, s + i * 17); n += a; x = x * 2.03 + 3.1; y = y * 2.03 + 1.7; a *= 0.5; } return v / n; }
  function ridged(x, y, o, s) { let v = 0, a = 0.5, n = 0, w = 1; for (let i = 0; i < o; i++) { let r = 1 - Math.abs(vnoise(x, y, s + i * 31) * 2 - 1); r *= r; v += a * r * w; w = Math.min(1, r * 1.6); n += a; x = x * 2.1 + 5.3; y = y * 2.1 + 2.9; a *= 0.5; } return v / n; }
  const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
  const lerp = (a, b, t) => a + (b - a) * t;
  // bruit raccordable (période = taille du canvas), valeurs 0..1
  function tileNoise(n, per, oct, seed) {
    const out = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let v = 0, a = 0.5, tot = 0, p = per;
      for (let o = 0; o < oct; o++) {
        const fx = x / n * p, fy = y / n * p, xi = Math.floor(fx), yi = Math.floor(fy);
        let xf = fx - xi, yf = fy - yi; xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
        const x0 = xi % p, x1 = (xi + 1) % p, y0 = yi % p, y1 = (yi + 1) % p, s = seed + o * 7;
        const a00 = hash(x0, y0, s), a10 = hash(x1, y0, s), a01 = hash(x0, y1, s), a11 = hash(x1, y1, s);
        v += a * (a00 + (a10 - a00) * xf + (a01 - a00) * yf + (a00 - a10 - a01 + a11) * xf * yf); tot += a; a *= 0.5; p *= 2;
      }
      out[y * n + x] = v / tot;
    }
    return out;
  }
  function noiseCanvas(n, per, oct, seed, map) { // map(v) → [r,g,b,a]
    const cv = document.createElement('canvas'); cv.width = cv.height = n;
    const c = cv.getContext('2d'), img = c.createImageData(n, n), d = tileNoise(n, per, oct, seed);
    for (let i = 0; i < n * n; i++) { const m = map(d[i]); img.data[i * 4] = m[0]; img.data[i * 4 + 1] = m[1]; img.data[i * 4 + 2] = m[2]; img.data[i * 4 + 3] = m[3]; }
    c.putImageData(img, 0, 0); return cv;
  }
  const CJK = '"WenQuanYi Zen Hei","Noto Sans CJK SC","Noto Sans SC","PingFang SC","Microsoft YaHei","SimHei",sans-serif';

  /* ---------------- GLSL partagé ---------------- */
  // balancement pendulaire (lanternes) autour du point d'accroche pv
  const SWAY = `
    vec3 swayP(vec3 p, vec3 pv, float ph){
      float g = 0.55 + gust;
      float a = (sin(time * 1.6 + ph) * 0.06 + sin(time * 2.7 + ph * 1.7) * 0.025) * g + 0.05 * gust;
      float b = sin(time * 1.25 + ph * 2.3) * 0.05 * g;
      vec3 d = p - pv;
      float ca = cos(a), sa = sin(a); d.xy = vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y);
      float cb = cos(b), sb = sin(b); d.zy = vec2(cb * d.z - sb * d.y, sb * d.z + cb * d.y);
      return pv + d;
    }`;

  ARENA3D.wall = {
    light: {
      hemi: [0x7c98dc, 0x1b2034, 0.85], key: [0xbccdff, 1.6], keyPos: [-320, 900, 620],
      rims: [[0xff8a3c, 2.4, [1, 0.25, -0.75]], [0x7fb0ff, 2.2, [-1, 0.45, -0.6]], [0xb4c6ff, 0.4, [0, 1, 0.25]]],
      fog: { color: 0x506290, near: 400, far: 19000 }, bg: 0x141d3a, refl: 0.26, dim: 0.72
    },
    // thème : pentatonique « chinoise » façon stage 16 bits (ré majeur pentatonique)
    track: {
      bpm: 152, root: 50, prog: [0, 0, -5, -2],
      bass: [0, null, 12, 0, null, 0, 12, null, 0, null, 12, 0, 7, null, 9, 12],
      lead: [12, null, 14, 16, 19, null, 16, null, 14, 12, 9, null, 12, null, null, null,
        16, null, 19, 21, 24, null, 21, 19, 16, null, 14, null, 16, 19, 16, 14,
        12, null, 9, null, 7, 9, 12, null, 14, null, 16, 14, 12, null, 9, null,
        14, 16, 19, null, 16, 14, 12, null, 9, 12, 14, 16, 19, null, null, null],
      drums: { k: 'x.....x...x.....', s: '....x.......x.x.', h: 'x.xxx.xxx.xxx.xx' }
    },
    build(S) {
      const T = S.T, root = S.group(), Q = S.quality, BGU = T.BufferGeometryUtils;
      const U = { time: { value: 0 }, gust: { value: 0.3 }, dimK: { value: 1 }, scaleH: { value: 540 }, drift: { value: 0 }, camX: { value: 650 } };
      const linear = (r, g, b) => new T.Color().setRGB(r, g, b, T.LinearSRGBColorSpace);
      const FOG = new T.Color(ARENA3D.wall.light.fog.color);
      const tex = (cv, o = {}) => { const t = new T.CanvasTexture(cv); if (o.srgb !== false) t.colorSpace = T.SRGBColorSpace; if (o.wrap) { t.wrapS = t.wrapT = T.RepeatWrapping; } t.anisotropy = o.aniso || 4; return t; };
      const canvas = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
      const mark = () => { };
      const transp = []; // matériaux transparents/additifs : atténués pendant un SUPER (le voile du jeu ne les couvre pas)

      /* =====================================================
         1. CIEL (dôme qui suit la caméra) : dégradé heure bleue, lueur du couchant, lune, nuages, étoiles
         ===================================================== */
      const skyU = {
        time: U.time, moonDir: { value: new T.Vector3(-0.31, 0.118, -1).normalize() }, glowDir: { value: new T.Vector3(0.37, 0, -1).normalize() },
        cZen: { value: new T.Color(0x070f28) }, cMid: { value: new T.Color(0x1b2f63) }, cHor: { value: FOG.clone() }, cGlow: { value: linear(0.95, 0.4, 0.22) }
      };
      const sky = new T.Mesh(new T.SphereGeometry(15000, 48, 24), new T.ShaderMaterial({
        uniforms: skyU, side: T.BackSide, depthWrite: false, fog: false,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float time; uniform vec3 moonDir, glowDir, cZen, cMid, cHor, cGlow; varying vec3 vDir;
          float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
          float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
          float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.07 + vec2(3.1, 1.7); a *= 0.5; } return s; }
          void main(){
            vec3 d = normalize(vDir); float y = d.y;
            vec3 col = mix(cHor, cMid, smoothstep(-0.02, 0.2, y));
            col = mix(col, cZen, smoothstep(0.16, 0.75, y));
            vec2 hz = normalize(d.xz + 1e-5), gz = normalize(glowDir.xz);
            float g = max(dot(hz, gz), 0.0), lowb = exp(-max(y + 0.01, 0.0) * 6.5);
            col += cGlow * (pow(g, 28.0) * 1.1 + pow(g, 7.0) * 0.16) * lowb;
            col += vec3(0.30, 0.16, 0.40) * pow(g, 4.0) * exp(-max(y, 0.0) * 4.0) * 0.07;
            if (y > 0.0) {
              vec2 uv = d.xz / (y + 0.07) * 0.5 + vec2(time * 0.0045, time * 0.0015);
              float n = fbm(uv * 1.25);
              float cl = smoothstep(0.5, 0.8, n) * smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.5, 0.9, y));
              float edge = 1.0 - smoothstep(0.5, 0.66, n);
              vec3 ccol = mix(cMid * 0.9, cHor * 0.75, smoothstep(0.3, 0.0, y));
              ccol += cGlow * pow(g, 4.0) * edge * lowb * 1.2;
              col = mix(col, ccol, cl * 0.8);
            }
            vec2 sc = vec2(atan(d.x, -d.z), asin(clamp(y, -1.0, 1.0))) * 150.0;
            vec2 ci = floor(sc); float hs = h21(ci);
            if (hs > 0.97 && y > 0.06) { vec2 o = vec2(h21(ci + 7.1), h21(ci + 3.7)) * 0.6 + 0.2; float r = length(fract(sc) - o);
              float tw = 0.55 + 0.45 * sin(time * (1.5 + hs * 5.0) + hs * 90.0);
              col += vec3(0.75, 0.82, 1.0) * smoothstep(0.13, 0.0, r) * tw * smoothstep(0.06, 0.45, y) * (hs - 0.97) * 22.0; }
            float md = dot(d, moonDir);
            col += vec3(0.72, 0.8, 1.0) * (exp((md - 1.0) * 1600.0) * 0.3 + exp((md - 1.0) * 120.0) * 0.1 + exp((md - 1.0) * 14.0) * 0.045);
            float disc = smoothstep(0.999866, 0.999884, md);
            if (disc > 0.0) { vec3 mx = normalize(cross(moonDir, vec3(0.0, 1.0, 0.0))); vec3 my = cross(mx, moonDir);
              vec2 mp = vec2(dot(d, mx), dot(d, my)) * 220.0; float mar = fbm(mp + 3.0);
              col = mix(col, vec3(1.0, 0.97, 0.9) * (1.45 - 0.55 * smoothstep(0.45, 0.62, mar)), disc); }
            gl_FragColor = vec4(col, 1.0);
          }`
      }));
      sky.renderOrder = -10; sky.userData.noMerge = true; sky.userData.receiveShadow = false; sky.frustumCulled = false;
      sky.position.set(650, 148, 689);
      root.add(sky);

      mark('TRACÉ');
      /* =====================================================
         2. TRACÉ DE LA MURAILLE (crêtes) + RELIEF
         ===================================================== */
      // [x, z, altitude du chemin de ronde]
      const W1pts = [[2900, -700, -20], [2150, -900, 10], [1250, -1300, 60], [800, -2000, -60], [520, -2800, 60], [330, -3500, 260], [640, -4400, 170], [1350, -5300, 420], [2300, -6200, 640], [3400, -7300, 560], [4700, -8300, 820]];
      const W2pts = [[-2700, -700, -20], [-1600, -1050, -30], [-800, -1500, 40], [-330, -2050, 140], [-480, -2800, -40], [-180, -3600, 120], [-620, -4500, 350], [-1500, -5500, 300], [-2800, -6800, 560], [-4300, -8000, 760]];
      function makePath(pts, step) {
        const curve = new T.CatmullRomCurve3(pts.map(p => new T.Vector3(p[0], p[2], p[1])), false, 'centripetal');
        const len = curve.getLength(), n = Math.ceil(len / step), P = curve.getSpacedPoints(n);
        return { P, len, n };
      }
      const W1 = makePath(W1pts, 24), W2 = makePath(W2pts, 24);
      const coarse = [W1, W2].map(w => w.P.filter((p, i) => i % 5 === 0 || i === w.P.length - 1));
      // distance (xz) au tracé le plus proche + altitude du chemin de ronde à cet endroit
      const nq = { d: 0, y: 0 };
      function nearest(x, z) {
        let bd = 1e9, by = 0;
        for (const P of coarse) for (let i = 0; i < P.length - 1; i++) {
          const a = P[i], b = P[i + 1], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez;
          let t = ((x - a.x) * ex + (z - a.z) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = a.x + ex * t - x, dz = a.z + ez * t - z, d = dx * dx + dz * dz;
          if (d < bd) { bd = d; by = a.y + (b.y - a.y) * t; }
        }
        nq.d = Math.sqrt(bd); nq.y = by; return nq;
      }
      function hNear(x, z) {
        let h = -1150 + 1000 * fbm(x / 2100 + 4.2, z / 2100 + 1.3, 5, 3) + Math.max(0, -z - 1800) * 0.17;
        const q = nearest(x, z);
        h = smax(h, q.y - 235 - q.d * 0.5 - q.d * q.d * 0.00011, 240);
        h += (fbm(x / 260, z / 260, 3, 9) - 0.5) * 70;
        return Math.min(h, -420 + Math.max(0, -z - 600) * 1.25); // rien ne dépasse juste derrière notre parapet
      }
      function hMid(x, z) {
        let h = -700 + 1900 * Math.pow(ridged(x / 3100 + 7.3, z / 3100 + 2.1, 5, 21), 1.35) + (-z - 4800) * 0.06;
        return h - Math.max(0, z + 5800) * 0.9;
      }
      function hFar(x, z) {
        const r = ridged(x / 4300 + 1.1, z / 4300 + 8.3, 6, 41);
        let h = -900 + 3900 * Math.pow(r, 1.7) * (0.6 + 0.4 * fbm(x / 9000, z / 9000, 2, 5));
        return h - Math.max(0, z + 10500) * 0.9;
      }
      // brume de vallée (façon peinture de paysage chinoise) : le bas de chaque crête se dissout dans une brume claire,
      // d'autant plus haut que la crête est lointaine — injectée après le brouillard du moteur
      function mistify(sh) {
        sh.vertexShader = 'varying float vWY;\n' + sh.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n#ifdef USE_INSTANCING\n vWY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;\n#else\n vWY = (modelMatrix * vec4(transformed, 1.0)).y;\n#endif');
        sh.fragmentShader = 'varying float vWY;\n' + sh.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>
          #ifdef USE_FOG
            float vm = (1.0 - smoothstep(-520.0, 120.0 + vFogDepth * 0.032, vWY)) * smoothstep(1300.0, 4200.0, vFogDepth);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.15, 0.19, 0.36), vm * 0.88);
          #endif`);
      }
      // matériau standard à couleurs de sommets + émission par sommet (attribut emis : alpenglow, fenêtres éclairées)
      function vcMat(p, fogK = 1) {
        const m = S.mat(Object.assign({ vertexColors: true }, p));
        m.onBeforeCompile = sh => {
          mistify(sh);
          sh.vertexShader = 'attribute vec3 emis;\nvarying vec3 vEmis;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vEmis = emis;');
          sh.fragmentShader = 'varying vec3 vEmis;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vEmis;')
            .replace('#include <fog_fragment>', `#ifdef USE_FOG
              float fogFactor = smoothstep(fogNear, fogFar, vFogDepth) * ${fogK.toFixed(3)};
              gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor) + vEmis * fogFactor * 0.75;
            #endif`);
        };
        m.customProgramCacheKey = () => 'wallVcEmis' + fogK;
        return m;
      }
      const _nv = new T.Vector3();
      function terrain(o) {
        const geo = new T.PlaneGeometry(o.x1 - o.x0, o.z1 - o.z0, o.nx, o.nz);
        geo.rotateX(-Math.PI / 2); geo.translate((o.x0 + o.x1) / 2, 0, (o.z0 + o.z1) / 2);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) p.setY(i, o.h(p.getX(i), p.getZ(i)));
        geo.computeVertexNormals();
        const n = geo.attributes.normal, col = new Float32Array(p.count * 3), em = new Float32Array(p.count * 3), c = [0, 0, 0], e = [0, 0, 0];
        for (let i = 0; i < p.count; i++) {
          _nv.fromBufferAttribute(n, i); e[0] = e[1] = e[2] = 0;
          o.col(p.getX(i), p.getY(i), p.getZ(i), _nv, c, e);
          col.set(c, i * 3); em.set(e, i * 3);
        }
        geo.setAttribute('color', new T.BufferAttribute(col, 3));
        geo.setAttribute('emis', new T.BufferAttribute(em, 3));
        geo.deleteAttribute('uv');
        const m = new T.Mesh(geo, vcMat({ roughness: 1, envMapIntensity: 0.25 }, o.fogK || 1));
        m.userData.noMerge = true; return m;
      }
      // couleurs (linéaires) : neige, roche, forêt — l'atmosphère (k) éclaircit et bleuit les plans lointains ;
      // glow : dernière lueur rose-orangée du couchant sur les neiges des pentes tournées vers lui (alpenglow)
      function paint(x, y, z, n, c, e, snowK, k, glow) {
        const nv = fbm(x / 400, z / 400, 3, 77);
        const snow = sst(0.5, 0.82, n.y + (nv - 0.5) * 0.5) * snowK;
        const forest = sst(0.35, 0.6, fbm(x / 900 + 2, z / 900, 3, 13)) * (1 - snow) * sst(600, -200, y);
        let r = lerp(0.04, 0.016, forest), g = lerp(0.042, 0.028, forest), b = lerp(0.055, 0.03, forest);
        r = lerp(r, 0.5, snow); g = lerp(g, 0.56, snow); b = lerp(b, 0.72, snow);
        c[0] = lerp(r, 0.16, k); c[1] = lerp(g, 0.21, k); c[2] = lerp(b, 0.38, k);
        if (glow) {
          const f = snow * sst(-0.15, 0.55, n.x * 0.9 - n.z * 0.25) * glow;
          e[0] = 0.95 * f; e[1] = 0.42 * f; e[2] = 0.34 * f;
        }
      }
      const near = terrain({ x0: -4200, x1: 5600, z0: -5600, z1: -560, nx: Q > 1 ? 90 : 150, nz: Q > 1 ? 50 : 80, h: hNear, col: (x, y, z, n, c, e) => paint(x, y, z, n, c, e, 1, sst(-1500, -5500, z) * 0.2, 0) });
      const mid = terrain({ x0: -7500, x1: 9000, z0: -11000, z1: -4800, nx: Q > 1 ? 80 : 130, nz: Q > 1 ? 30 : 50, h: hMid, col: (x, y, z, n, c, e) => paint(x, y, z, n, c, e, sst(-300, 400, y) * 0.7 + 0.3, 0.2 + sst(-5000, -11000, z) * 0.15, sst(500, 1500, y) * 0.6) });
      const far = terrain({ x0: -11500, x1: 12500, z0: -16500, z1: -9800, nx: Q > 1 ? 90 : 150, nz: Q > 1 ? 24 : 40, h: hFar, fogK: 0.78, col: (x, y, z, n, c, e) => { paint(x, y, z, n, c, e, sst(300, 1100, y + fbm(x / 600, z / 600, 3, 4) * 600), 0.25, sst(900, 2600, y) * 1.2); } });
      root.add(near, mid, far);

      mark('LOINTAINE');
      /* =====================================================
         3. MURAILLE LOINTAINE (ruban extrudé) + tours + lanternes au loin — un seul maillage à couleurs de sommets
         ===================================================== */
      const acc = { p: [], n: [], c: [], e: [] };
      const _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Vector3(), _n = new T.Vector3();
      function tri(A, B, C, col, want) {
        _a.subVectors(B, A); _b.subVectors(C, A); _n.crossVectors(_a, _b).normalize();
        if (want && _n.dot(want) < 0) { const t = B; B = C; C = t; _n.negate(); }
        for (const V of [A, B, C]) { acc.p.push(V.x, V.y, V.z); acc.n.push(_n.x, _n.y, _n.z); acc.c.push(col[0], col[1], col[2]); acc.e.push(0, 0, 0); }
      }
      function quad(A, B, C, D, col, want) { tri(A, B, C, col, want); tri(A, C, D, col, want); }
      function pushGeo(geo, m4, colFn) {
        const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m4);
        const p = g.attributes.position, n = g.attributes.normal, c = [0, 0, 0], e = [0, 0, 0];
        for (let i = 0; i < p.count; i++) { e[0] = e[1] = e[2] = 0; colFn(p.getX(i), p.getY(i), p.getZ(i), n.getY(i), c, e); acc.p.push(p.getX(i), p.getY(i), p.getZ(i)); acc.n.push(n.getX(i), n.getY(i), n.getZ(i)); acc.c.push(c[0], c[1], c[2]); acc.e.push(e[0], e[1], e[2]); }
      }
      const STONE = (x, y, z, c) => { const v = 0.75 + 0.5 * fbm(x / 120, (y + z) / 90, 2, 5); c[0] = 0.085 * v; c[1] = 0.08 * v; c[2] = 0.085 * v; return c; };
      const SNOWC = [0.5, 0.56, 0.72];
      // coupe transversale : [décalage latéral, hauteur relative au chemin de ronde]
      const CS = [[-190, -650], [-152, 52], [-128, 52], [-128, 1], [128, 1], [128, 30], [150, 30], [185, -650]];
      const EDGE = ['stone', 'snow', 'stone', 'walk', 'stone', 'snow', 'stone'];
      const towerAt = [];
      const fglow = []; // lanternes lointaines (points lumineux)
      const m4 = new T.Matrix4(), q4 = new T.Quaternion(), e4 = new T.Euler(), s4 = new T.Vector3(), v4 = new T.Vector3();
      const boxG = new T.BoxGeometry(1, 1, 1);
      function frame(P, i) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
        const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
        return { tx: tx / l, tz: tz / l, lx: -tz / l, lz: tx / l };
      }
      function buildWall(W, towers, skip) {
        const P = W.P, rows = [];
        for (let i = 0; i < P.length; i++) {
          const f = frame(P, i), row = [];
          for (const [u, dy] of CS) row.push(new T.Vector3(P[i].x + f.lx * u, P[i].y + dy, P[i].z + f.lz * u));
          rows.push(row);
        }
        const want = new T.Vector3(), cc = [0, 0, 0];
        for (let i = 0; i < P.length - 1; i++) {
          const f = frame(P, i), slope = Math.abs(P[i + 1].y - P[i].y) / 24;
          for (let k = 0; k < CS.length - 1; k++) {
            const du = CS[k + 1][0] - CS[k][0], dy = CS[k + 1][1] - CS[k][1], l = Math.hypot(du, dy);
            want.set(f.lx * (-dy / l), du / l, f.lz * (-dy / l));
            let col;
            if (EDGE[k] === 'snow') col = SNOWC;
            else if (EDGE[k] === 'walk') col = (slope > 0.18 && i % 2) ? [0.2, 0.22, 0.3] : [0.42, 0.47, 0.62];
            else { col = STONE(P[i].x, P[i].y, P[i].z, cc).slice(); if (k === 0 || k === 6) { /* neige collée sur les faces */ const s = fbm(P[i].x / 60, P[i].z / 60, 2, 8); if (s > 0.62) col = [0.3, 0.33, 0.43]; } }
            quad(rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k], col, want);
          }
        }
        // merlons (côté extérieur) et petits créneaux côté intérieur
        for (let s = 10; s < W.len - 10; s += 52) {
          const i = Math.round(s / W.len * W.n); if (skip(i)) continue;
          const f = frame(P, i), yaw = Math.atan2(-f.tz, f.tx);
          for (const [u, w, h, d] of [[-140, 30, 36, 24], [139, 22, 18, 20]]) {
            const x = P[i].x + f.lx * u, z = P[i].z + f.lz * u, y0 = P[i].y + (u < 0 ? 52 : 30);
            m4.compose(v4.set(x, y0 + h / 2, z), q4.setFromEuler(e4.set(0, yaw, 0)), s4.set(w, h, d));
            pushGeo(boxG, m4, (X, Y, Z, ny, c) => ny > 0.5 ? (c[0] = SNOWC[0], c[1] = SNOWC[1], c[2] = SNOWC[2]) : STONE(X, Y, Z, c));
          }
        }
        // tours
        for (const ti of towers) {
          const i = ti.i, f = frame(P, i), yaw = Math.atan2(-f.tz, f.tx), base = P[i];
          towerAt.push({ W, i });
          if (ti.detailed) continue;
          const HB = 230, LX = 300, LZ = 360;
          const put = (g, x, y, z, sx, sy, sz, ry, colFn) => {
            v4.set(x, y, z).applyAxisAngle(T.Object3D.DEFAULT_UP, yaw).add(base);
            m4.compose(v4, q4.setFromEuler(e4.set(0, yaw + (ry || 0), 0)), s4.set(sx, sy, sz)); pushGeo(g, m4, colFn);
          };
          const st = (X, Y, Z, ny, c) => ny > 0.6 ? (c[0] = SNOWC[0], c[1] = SNOWC[1], c[2] = SNOWC[2]) : STONE(X, Y, Z, c);
          put(boxG, 0, (HB - 650) / 2, 0, LX, HB + 650, LZ, 0, st);
          put(boxG, 0, HB + 6, 0, LX + 16, 12, LZ + 16, 0, (X, Y, Z, ny, c) => ny > 0.6 ? (c[0] = SNOWC[0], c[1] = SNOWC[1], c[2] = SNOWC[2]) : (c[0] = 0.05, c[1] = 0.05, c[2] = 0.055));
          for (let k = 0; k < 4; k++) for (let j = -1.5; j <= 1.5; j++) {
            const along = j * (k < 2 ? LX : LZ) / 4.2, out = (k < 2 ? LZ : LX) / 2 - 12, sg = k % 2 ? -1 : 1;
            if (k < 2) put(boxG, along, HB + 12 + 19, out * sg, 36, 38, 22, 0, st); else put(boxG, out * sg, HB + 12 + 19, along, 22, 38, 36, 0, st);
          }
          // fenêtres sombres (3 par face) + lanternes de fenêtre
          // deux étages de fenêtres en arc : certaines éclairées (émission chaude, halo)
          for (const sg of [-1, 1]) for (let j = -1; j <= 1; j++) for (const wy of [165, 72]) {
            const lit = hash(i * 7 + j, sg * 3 + wy, 11) < (wy > 100 ? 0.55 : 0.3), fk = 0.7 + 0.6 * hash(i, j + wy, 5);
            put(boxG, j * 85, wy, sg * (LZ / 2 + 0.6), 34, 60, 1, 0, (X, Y, Z, ny, c, e) => { c[0] = 0.008; c[1] = 0.008; c[2] = 0.012; if (lit) { e[0] = 1.5 * fk; e[1] = 0.62 * fk; e[2] = 0.22 * fk; } });
            if (lit) { v4.set(j * 85, wy, sg * (LZ / 2 + 4)).applyAxisAngle(T.Object3D.DEFAULT_UP, yaw).add(base); fglow.push([v4.x, v4.y, v4.z, 90, 0.55]); }
          }
          if (ti.roof) {
            const rg = S.g.lathe([[150, 8], [140, 0], [118, 14], [90, 38], [62, 66], [36, 96], [12, 120], [0, 126]], 4, 'y', Math.PI / 4);
            put(boxG, 0, HB + 12 + 45, 0, 110, 90, 110, 0, (X, Y, Z, ny, c) => { c[0] = 0.09; c[1] = 0.025; c[2] = 0.02; });
            put(rg, 0, HB + 12 + 90, 0, 1, 1, 1, 0, (X, Y, Z, ny, c) => ny > 0.35 ? (c[0] = SNOWC[0] * 0.95, c[1] = SNOWC[1] * 0.95, c[2] = SNOWC[2] * 0.95) : (c[0] = 0.03, c[1] = 0.03, c[2] = 0.035));
            for (const [x, z] of [[-80, -80], [80, -80], [-80, 80], [80, 80]]) { v4.set(x, HB + 12 + 84, z).applyAxisAngle(T.Object3D.DEFAULT_UP, yaw).add(base); fglow.push([v4.x, v4.y, v4.z, 60, 1.0]); }
          }
        }
        // chapelet de lanternes le long du chemin de ronde
        for (let s = 140; s < W.len; s += 260) {
          const i = Math.round(s / W.len * W.n); if (skip(i)) continue;
          const f = frame(P, i), u = (Math.floor(s / 260) % 2) ? -110 : 110;
          fglow.push([P[i].x + f.lx * u, P[i].y + 45, P[i].z + f.lz * u, 46, 0.75]);
        }
      }
      const idxNear = (W, x, z) => { let bi = 0, bd = 1e12; W.P.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi; };
      const T1i = idxNear(W1, 1250, -1300);
      const w1Towers = [{ i: T1i, detailed: true }, { i: idxNear(W1, 640, -4400), roof: true }, { i: idxNear(W1, 2300, -6200), roof: true }, { i: idxNear(W1, 3400, -7300) }];
      const w2Towers = [{ i: idxNear(W2, -330, -2050), roof: true }, { i: idxNear(W2, -620, -4500), roof: true }, { i: idxNear(W2, -2800, -6800) }];
      buildWall(W1, w1Towers, i => Math.abs(i - T1i) < 8);
      buildWall(W2, w2Towers, i => w2Towers.some(t => Math.abs(i - t.i) < 7));
      {
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(acc.p, 3));
        g.setAttribute('normal', new T.Float32BufferAttribute(acc.n, 3));
        g.setAttribute('color', new T.Float32BufferAttribute(acc.c, 3));
        g.setAttribute('emis', new T.Float32BufferAttribute(acc.e, 3));
        const m = new T.Mesh(g, vcMat({ roughness: 0.95, envMapIntensity: 0.3 }));
        m.userData.noMerge = true; root.add(m);
      }

      mark('DESSINÉES');
      /* =====================================================
         TEXTURES DESSINÉES
         ===================================================== */
      // briques verticales (parapet, tour)
      const wallCv = canvas(512, 512), wallBumpCv = canvas(512, 512);
      {
        const c = wallCv.getContext('2d'), b = wallBumpCv.getContext('2d'), r = S.rng(31);
        const PX = 512 / 192; // 192 unités par répétition
        c.fillStyle = '#8b919c'; c.fillRect(0, 0, 512, 512);
        b.fillStyle = '#202020'; b.fillRect(0, 0, 512, 512);
        const bh = 14 * PX, bw = 40 * PX;
        for (let row = 0; row < 192 / 14 + 1; row++) {
          const off = (row % 2) * bw / 2;
          for (let k = -1; k < 6; k++) {
            const kk = ((k % 5) + 5) % 5, rr = S.rng(100 + row * 7 + kk);
            const x = off + k * bw, y = row * bh, v = 96 + rr() * 42, w = (rr() - 0.5) * 10;
            c.fillStyle = `rgb(${v + w | 0},${v | 0},${v - w + 4 | 0})`; c.fillRect(x + 2, y + 2, bw - 4, bh - 4);
            c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x + 2, y + bh - 6, bw - 4, 4);
            if (rr() < 0.3) { c.fillStyle = `rgba(20,24,30,${0.15 + rr() * 0.2})`; c.fillRect(x + 2 + rr() * bw * 0.5, y + 2, bw * 0.4, bh - 4); }
            const bv = 150 + rr() * 60 | 0; b.fillStyle = `rgb(${bv},${bv},${bv})`; b.fillRect(x + 3, y + 3, bw - 6, bh - 6);
          }
          // neige accrochée dans les joints horizontaux
          c.fillStyle = 'rgba(225,235,250,0.55)';
          for (let k = 0; k < 6; k++) c.fillRect(r() * 512, row * bh - 1, 20 + r() * 80, 3);
        }
        const nz = noiseCanvas(256, 8, 4, 5, v => [v * 255, v * 255, v * 255, 60]);
        c.globalCompositeOperation = 'multiply'; c.drawImage(nz, 0, 0, 512, 512); c.globalCompositeOperation = 'source-over';
      }
      const wallTex = tex(wallCv, { wrap: true }), wallBump = tex(wallBumpCv, { wrap: true, srgb: false });
      const stone = S.mat({ map: wallTex, bumpMap: wallBump, bumpScale: 1.2, roughness: 0.88, color: 0xc4c9d6, envMapIntensity: 0.35 });
      const stoneDark = S.mat({ color: 0x3a3a40, roughness: 0.9, map: wallTex });
      const snowMat = S.mat({ color: 0xe6eefb, roughness: 0.78, envMapIntensity: 0.45 });
      const darkMat = S.mat({ color: 0x08090c, roughness: 1, envMapIntensity: 0 });
      const redWood = S.mat({ color: 0x6e1510, roughness: 0.45, envMapIntensity: 0.7 });
      const gold = S.mat({ color: 0xc09040, roughness: 0.35, metalness: 0.85, envMapIntensity: 1 });
      const iceMat = S.phys({ color: 0xb8d4ff, roughness: 0.06, metalness: 0.1, clearcoat: 1, envMapIntensity: 1.6 });
      function boxUV(mesh, s) {
        const geo = mesh.geometry, p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
        for (let i = 0; i < p.count; i++) {
          const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
          if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) / s, p.getZ(i) / s);
          else if (ax >= az) uv.setXY(i, p.getZ(i) / s, p.getY(i) / s);
          else uv.setXY(i, p.getX(i) / s, p.getY(i) / s);
        }
        uv.needsUpdate = true;
      }
      const uvAll = (grp) => grp.children.forEach(m => { if (m.isMesh && (m.material === stone || m.material === stoneDark)) boxUV(m, 192); });

      mark('GUET');
      /* =====================================================
         4. TOUR DE GUET PRINCIPALE (sur la muraille W1)
         ===================================================== */
      const lanterns = []; // { p: point d'accroche, len, r, ph }
      const winGlowCv = canvas(64, 128);
      { const c = winGlowCv.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#ffcf7a'); g.addColorStop(0.55, '#ff9a3a'); g.addColorStop(1, '#ff7020'); c.fillStyle = g; c.fillRect(0, 0, 64, 128);
        c.fillStyle = 'rgba(60,20,0,0.55)'; c.fillRect(30, 0, 4, 128); c.fillRect(0, 60, 64, 4); }
      const winGlow = S.glow(0xffffff, 1.5, { map: tex(winGlowCv) });
      const latticeCv = canvas(256, 128);
      { const c = latticeCv.getContext('2d'), g = c.createRadialGradient(128, 80, 10, 128, 70, 150); g.addColorStop(0, '#ffd890'); g.addColorStop(1, '#e0702a'); c.fillStyle = g; c.fillRect(0, 0, 256, 128);
        c.strokeStyle = 'rgba(70,18,6,0.9)'; c.lineWidth = 4; for (let x = 0; x <= 256; x += 21) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 128); c.stroke(); } for (let y = 0; y <= 128; y += 21) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke(); }
        c.fillStyle = '#4a120a'; c.fillRect(0, 0, 256, 10); c.fillRect(0, 118, 256, 10); c.fillRect(0, 0, 10, 128); c.fillRect(123, 0, 10, 128); c.fillRect(246, 0, 10, 128); }
      const lattice = S.glow(0xffffff, 1.25, { map: tex(latticeCv) });
      const roofCv = canvas(512, 256);
      { const c = roofCv.getContext('2d'); c.fillStyle = '#23262e'; c.fillRect(0, 0, 512, 256);
        for (let x = 0; x < 512; x += 10) { c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x, 0, 3, 256); c.fillStyle = 'rgba(120,130,150,0.25)'; c.fillRect(x + 4, 0, 2, 256); }
        const r = S.rng(9);
        for (let x = 0; x < 512; x += 3) { const top = 34 + r() * 30 + Math.sin(x * 0.07) * 8; c.fillStyle = `rgba(220,232,250,${0.82 + r() * 0.15})`; c.fillRect(x, top, 3, 256 - top); }
        for (let i = 0; i < 70; i++) { c.fillStyle = 'rgba(30,34,44,0.45)'; c.fillRect(r() * 512, 60 + r() * 190, 2 + r() * 3, 10 + r() * 40); }
        c.fillStyle = '#16181e'; c.fillRect(0, 0, 512, 16); c.fillStyle = 'rgba(220,232,250,0.9)'; c.fillRect(0, 14, 512, 5); }
      const roofTex = tex(roofCv, { wrap: true }); roofTex.repeat.set(4, 1);
      const roofMat = S.mat({ map: roofTex, roughness: 0.7, side: T.DoubleSide, envMapIntensity: 0.5 });
      const beamCv = canvas(256, 64);
      { const c = beamCv.getContext('2d'); c.fillStyle = '#16454a'; c.fillRect(0, 0, 256, 64); c.fillStyle = '#1d2f6a'; c.fillRect(0, 18, 256, 28);
        for (let x = 8; x < 256; x += 32) { c.fillStyle = '#c99a3a'; c.beginPath(); c.arc(x + 8, 32, 9, 0, 7); c.fill(); c.fillStyle = '#2a7a70'; c.beginPath(); c.arc(x + 8, 32, 5, 0, 7); c.fill(); }
        c.fillStyle = '#c99a3a'; c.fillRect(0, 14, 256, 3); c.fillRect(0, 47, 256, 3); c.fillStyle = '#6e1510'; c.fillRect(0, 0, 256, 6); c.fillRect(0, 58, 256, 6); }
      const beamMat = S.mat({ map: tex(beamCv), roughness: 0.6 });
      const plaqueCv = canvas(256, 96);
      { const c = plaqueCv.getContext('2d'); c.fillStyle = '#2a0c08'; c.fillRect(0, 0, 256, 96); c.strokeStyle = '#c99a3a'; c.lineWidth = 6; c.strokeRect(6, 6, 244, 84);
        c.fillStyle = '#e8bf5a'; c.font = 'bold 58px ' + CJK; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('鎮遠樓', 128, 50); }
      const plaqueMat = S.mat({ map: tex(plaqueCv), roughness: 0.5, emissive: 0x2a1a08, emissiveIntensity: 0.6 });
      const archG = (w, h) => S.g.shape(`arch${w}x${h}`, s => { s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); s.lineTo(-w / 2, 0); }, 1.5, 0, 10);
      {
        const P = W1.P[T1i], f = frame(W1.P, T1i), yaw = Math.atan2(-f.tz, f.tx);
        const tw = S.group(); tw.position.copy(P); tw.rotation.y = yaw;
        const HB = 230, LX = 330, LZ = 380;
        S.add(tw, S.g.box(LX, HB + 700, LZ), stone, { p: [0, (HB - 700) / 2, 0] });
        S.add(tw, S.g.box(LX + 20, 13, LZ + 20), stoneDark, { p: [0, HB + 6, 0] });
        S.add(tw, S.g.box(LX + 8, 9, LZ + 8), stoneDark, { p: [0, 92, 0] });
        S.add(tw, S.g.box(LX + 22, 4, LZ + 22), snowMat, { p: [0, HB + 14, 0] });
        // merlons + neige
        for (let k = 0; k < 4; k++) for (let j = -2; j <= 2; j++) {
          const alongX = k < 2, along = j * (alongX ? LX : LZ) / 5.4, out = ((alongX ? LZ : LX) / 2 - 2) * (k % 2 ? -1 : 1);
          const p = alongX ? [along, HB + 13 + 22, out] : [out, HB + 13 + 22, along];
          S.add(tw, alongX ? S.g.box(40, 44, 22) : S.g.box(22, 44, 40), stone, { p });
          S.add(tw, alongX ? S.g.rbox(46, 8, 28, 3, 1) : S.g.rbox(28, 8, 46, 3, 1), snowMat, { p: [p[0], HB + 13 + 47, p[2]] });
        }
        // fenêtres en arc (faces latérales) : cadre de pierre claire + fond sombre ou éclairé
        for (const sg of [-1, 1]) for (let j = -1; j <= 1; j++) {
          const lit = sg < 0 && j !== 1;
          S.add(tw, archG(54, 92), stoneDark, { p: [j * 100, 116, sg * (LZ / 2 + 0.4)], r: [0, sg < 0 ? Math.PI : 0, 0] });
          S.add(tw, archG(42, 80), lit ? winGlow : darkMat, { p: [j * 100, 122, sg * (LZ / 2 + 1.4)], r: [0, sg < 0 ? Math.PI : 0, 0] });
          S.add(tw, S.g.box(50, 5, 8), snowMat, { p: [j * 100, 118, sg * (LZ / 2 + 3)] });
        }
        // portes (faces traversées par le chemin de ronde)
        for (const sg of [-1, 1]) {
          const ry = sg < 0 ? -Math.PI / 2 : Math.PI / 2;
          S.add(tw, archG(92, 140), stoneDark, { p: [sg * (LX / 2 + 0.4), 0, 0], r: [0, ry, 0] });
          S.add(tw, archG(76, 128), sg < 0 ? winGlow : darkMat, { p: [sg * (LX / 2 + 1.4), 0, 0], r: [0, ry, 0] });
          if (sg < 0) {
            S.add(tw, S.g.box(6, 34, 88), redWood, { p: [-LX / 2 - 3, 168, 0] });
            const pl = S.add(tw, new T.PlaneGeometry(80, 30), plaqueMat, { p: [-LX / 2 - 6.2, 168, 0], r: [0, -Math.PI / 2, 0] }); pl.userData.noMerge = true;
            for (const z of [-62, 62]) lanterns.push({ p: new T.Vector3(-LX / 2 - 16, HB - 4, z).applyAxisAngle(T.Object3D.DEFAULT_UP, yaw).add(P), len: 34, r: 15, ph: z * 0.1 });
            S.add(tw, S.g.box(30, 4, 150), redWood, { p: [-LX / 2 - 12, HB - 3, 0] });
          }
        }
        // pavillon : salle aux fenêtres en treillis éclairées, piliers rouges, poutre peinte, toit à double pente
        const y0 = HB + 13;
        S.add(tw, S.g.box(196, 10, 196), stoneDark, { p: [0, y0 + 5, 0] });
        S.add(tw, S.g.box(150, 92, 150), lattice, { p: [0, y0 + 10 + 46, 0] });
        for (const [x, z] of [[-82, -82], [82, -82], [-82, 82], [82, 82], [0, -82], [0, 82], [-82, 0], [82, 0]]) S.add(tw, S.g.cyl(6, 7, 100, 10), redWood, { p: [x, y0 + 60, z] });
        S.add(tw, S.g.box(180, 18, 180), beamMat, { p: [0, y0 + 110 + 9, 0] });
        S.add(tw, S.g.lathe([[190, 14], [180, 4], [158, 12], [128, 30], [100, 52], [74, 80], [50, 108], [26, 134], [6, 150], [0, 152]], 4, 'y', Math.PI / 4), roofMat, { p: [0, y0 + 126, 0] });
        S.add(tw, S.g.sphere(7, 10, 8), gold, { p: [0, y0 + 280, 0] });
        S.add(tw, S.g.cone(2.5, 26, 6), gold, { p: [0, y0 + 292, 0] });
        for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lanterns.push({ p: new T.Vector3(x * 112, y0 + 132, z * 112).applyAxisAngle(T.Object3D.DEFAULT_UP, yaw).add(P), len: 14, r: 11, ph: x * 2 + z });
        S.merge(tw); uvAll(tw);
        root.add(tw);
        // halo chaud sur la façade (portes / fenêtres éclairées) : plans additifs
        T1 = { P, yaw, HB, LX, LZ };
      }
      var T1;

      mark('PINS');
      /* =====================================================
         5. PINS ENNEIGÉS (panneaux instanciés, 4 variantes dans un atlas)
         ===================================================== */
      const pineCv = canvas(512, 256);
      {
        const c = pineCv.getContext('2d');
        for (let v = 0; v < 4; v++) {
          const r = S.rng(50 + v), ox = v * 128 + 64, tiers = 7 + v;
          c.fillStyle = '#1a1310'; c.fillRect(ox - 3, 200, 6, 56);
          for (let t = 0; t < tiers; t++) {
            const k = t / (tiers - 1), y = 236 - k * 200, w = (1 - k * 0.85) * (52 + r() * 8), h = 46 - k * 14;
            c.fillStyle = `rgb(${18 + r() * 6 | 0},${32 + r() * 8 | 0},${30 + r() * 6 | 0})`;
            c.beginPath(); c.moveTo(ox, y - h);
            for (let s = 0; s <= 8; s++) { const a = s / 8; c.lineTo(ox + w * a + (r() - 0.5) * 6, y - h * (1 - a) * 0.4 + (s % 2) * 6); }
            for (let s = 8; s >= 0; s--) { const a = s / 8; c.lineTo(ox - w * a + (r() - 0.5) * 6, y - h * (1 - a) * 0.4 + (s % 2) * 6); }
            c.closePath(); c.fill();
            c.fillStyle = 'rgba(214,226,246,0.92)';
            c.beginPath(); c.moveTo(ox, y - h - 1);
            for (let s = 0; s <= 6; s++) { const a = s / 6; c.lineTo(ox + w * a * 0.9, y - h * (1 - a) * 0.45 - 1 + (r() - 0.3) * 3); }
            for (let s = 6; s >= 0; s--) { const a = s / 6; c.lineTo(ox - w * a * 0.9, y - h * (1 - a) * 0.45 - 1 + (r() - 0.3) * 3 + 5 * (1 - a)); }
            c.closePath(); c.fill();
          }
          c.beginPath(); c.fillStyle = 'rgba(214,226,246,0.95)'; c.arc(ox, 236 - 200 - 30, 4, 0, 7); c.fill();
        }
      }
      {
        const r = S.rng(77), list = [], tv = [];
        const N = [1300, 800, 450][Q];
        for (let k = 0; k < N * 6 && list.length < N; k++) {
          const farL = r() < 0.3;
          const x = farL ? -6500 + r() * 15000 : -3800 + r() * 9000, z = farL ? -5000 - r() * 4500 : -900 - r() * 4500;
          const y = farL ? hMid(x, z) : hNear(x, z);
          if (!farL) { const q = nearest(x, z); if (q.d < 230) continue; }
          if (y > (farL ? 700 : 450) || y < -900) continue;
          const sl = Math.abs((farL ? hMid(x + 40, z) : hNear(x + 40, z)) - y) / 40; if (sl > 0.9) continue;
          if (fbm(x / 700, z / 700, 2, 3) < 0.45) continue; // bosquets
          const h = (farL ? 140 : 110) + r() * 90;
          list.push({ p: [x, y - 8, z], s: [h * 0.55 * (r() < 0.5 ? -1 : 1), h, 1] }); tv.push(Math.floor(r() * 4));
        }
        const pg = new T.PlaneGeometry(1, 1); pg.translate(0, 0.5, 0);
        const pm = S.mat({ map: tex(pineCv), alphaTest: 0.5, side: T.DoubleSide, roughness: 1, envMapIntensity: 0.2, color: 0xb8c2d0 });
        pm.onBeforeCompile = sh => {
          sh.vertexShader = 'attribute float tv;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vMapUv.x = (vMapUv.x + tv) * 0.25;');
          mistify(sh);
        };
        pm.customProgramCacheKey = () => 'wallPine';
        const im = S.instanced(pg, pm, list);
        im.geometry.setAttribute('tv', new T.InstancedBufferAttribute(new Float32Array(tv), 1));
        im.userData.noMerge = true; im.userData.receiveShadow = false;
        root.add(im);
      }

      mark('BRUME');
      /* =====================================================
         6. BRUME : bancs qui dérivent devant les crêtes
         ===================================================== */
      const mistCv = canvas(1024, 256);
      {
        const c = mistCv.getContext('2d'), r = S.rng(13);
        for (let i = 0; i < 260; i++) {
          const x = r() * 1024, y = 128 + (r() - 0.5) * 120 * (0.4 + r()), rad = 30 + r() * 90;
          for (const ox of [-1024, 0, 1024]) { const g = c.createRadialGradient(x + ox, y, 0, x + ox, y, rad); g.addColorStop(0, `rgba(255,255,255,${0.08 + r() * 0.1})`); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x + ox - rad, y - rad, rad * 2, rad * 2); }
        }
        c.globalCompositeOperation = 'destination-in';
        const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.35, 'rgba(0,0,0,1)'); g.addColorStop(0.7, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(0, 0, 1024, 256);
      }
      const mistTex = tex(mistCv, { wrap: true });
      const mists = [];
      for (const [z, y, w, h, op, sp] of [[-1900, 40, 7000, 520, 0.55, 6], [-3300, 160, 10000, 760, 0.6, -4], [-5600, 330, 15000, 1100, 0.55, 3], [-9200, 560, 22000, 1500, 0.5, -2]]) {
        const t = mistTex.clone(); t.needsUpdate = true; t.repeat.set(w / 3500, 1);
        const m = S.basic({ map: t, color: new T.Color(0xaab8d8), transparent: true, opacity: op, depthWrite: false });
        const me = S.mesh(new T.PlaneGeometry(w, h), m, { p: [650, y, z] });
        me.userData.noMerge = true; me.userData.receiveShadow = false; me.renderOrder = -2;
        root.add(me); mists.push({ t, sp: sp / w, op, m }); transp.push([m, op]);
      }

      /* =====================================================
         6b. LANTERNES CÉLESTES (kongming) : elles montent lentement de la vallée et dérivent avec le vent
         ===================================================== */
      {
        const n = [44, 30, 16][Q], r = S.rng(606), pos = new Float32Array(n * 3), sd = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const z = -1500 - Math.pow(r(), 0.8) * 5200;
          pos[i * 3] = -3150 + r() * 7600; pos[i * 3 + 1] = r(); pos[i * 3 + 2] = z; sd[i] = r();
        }
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('seed', new T.BufferAttribute(sd, 1));
        const m = new T.ShaderMaterial({
          uniforms: { time: U.time, drift: U.drift, scaleH: U.scaleH, dimK: U.dimK, camX: U.camX }, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
          vertexShader: `uniform float time, drift, scaleH, camX; attribute float seed; varying float vA; varying float vF;
            void main(){
              float H = 3600.0, sp = 16.0 + 18.0 * seed;
              float f = fract(position.y + time * sp / H);
              float x0 = camX - 3800.0;
              vec3 p = vec3(x0 + mod(position.x + drift * 0.25 * (0.6 + seed) + sin(time * 0.31 + seed * 40.0) * 60.0 + f * 900.0 * (seed - 0.3) - x0, 7600.0),
                            -700.0 + f * H, position.z + cos(time * 0.23 + seed * 25.0) * 50.0);
              vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
              gl_PointSize = max(2.5, (60.0 + 30.0 * seed) * projectionMatrix[1][1] * scaleH * 0.5 / -mv.z);
              float d = -mv.z;
              vA = smoothstep(0.0, 0.1, f) * (1.0 - smoothstep(0.7, 1.0, f)) * (1.0 - smoothstep(4000.0, 9000.0, d) * 0.55);
              vF = 0.8 + 0.12 * sin(time * 7.0 + seed * 50.0) + 0.08 * sin(time * 17.0 + seed * 13.0);
            }`,
          fragmentShader: `uniform float dimK; varying float vA; varying float vF;
            void main(){ vec2 c = gl_PointCoord - 0.5; c.y = -c.y;
              float w = mix(0.1, 0.14, smoothstep(-0.18, 0.2, c.y));
              float body = smoothstep(w + 0.02, w - 0.01, abs(c.x)) * smoothstep(-0.2, -0.16, c.y) * smoothstep(0.22, 0.18, c.y);
              vec3 col = mix(vec3(2.4, 1.25, 0.45), vec3(1.1, 0.34, 0.1), smoothstep(-0.2, 0.22, c.y)) * body;
              col += vec3(1.0, 0.42, 0.14) * (exp(-dot(c, c) * 28.0) * 0.55);
              gl_FragColor = vec4(col * vA * vF * dimK, 1.0); }`
        });
        const pts = new T.Points(g, m); pts.frustumCulled = false; pts.userData.noMerge = true; pts.renderOrder = 1; root.add(pts);
      }

      mark('SOL');
      /* =====================================================
         7. SOL : chemin de ronde en grandes briques
         ===================================================== */
      const FN = Q > 1 ? 512 : 1024, FP = FN / 288; // 288 unités par répétition
      const flCv = canvas(FN, FN), flRough = canvas(FN, FN), flBump = canvas(FN, FN);
      {
        const c = flCv.getContext('2d'), ro = flRough.getContext('2d'), bu = flBump.getContext('2d');
        c.fillStyle = '#aeb9cc'; c.fillRect(0, 0, FN, FN);
        ro.fillStyle = '#f0f0f0'; ro.fillRect(0, 0, FN, FN);
        bu.fillStyle = '#1c1c1c'; bu.fillRect(0, 0, FN, FN);
        const bw = 48 * FP, bh = 24 * FP, m = 2.2 * FP / 3.55;
        for (let row = 0; row < 12; row++) for (let k = -1; k <= 6; k++) {
          const kk = ((k % 6) + 6) % 6, rr = S.rng(500 + row * 13 + kk);
          const x = (k * 48 + (row % 2) * 24) * FP, y = row * bh;
          const v = 78 + rr() * 32, w = (rr() - 0.5) * 12;
          c.fillStyle = `rgb(${v + w + 3 | 0},${v | 0},${v - w | 0})`;
          c.beginPath(); c.roundRect(x + m, y + m, bw - 2 * m, bh - 2 * m, 5 * FP / 3.55); c.fill();
          // usure : bord plus clair, centre plus sombre
          const g = c.createLinearGradient(x, y, x, y + bh); g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.18)'); c.fillStyle = g; c.fillRect(x + m, y + m, bw - 2 * m, bh - 2 * m);
          if (rr() < 0.25) { c.strokeStyle = 'rgba(15,15,18,0.7)'; c.lineWidth = 1.5; c.beginPath(); let cx = x + bw * rr(), cy = y + m; c.moveTo(cx, cy); for (let s = 0; s < 4; s++) { cx += (rr() - 0.5) * 30; cy += bh / 4; c.lineTo(cx, cy); } c.stroke(); }
          const rv = 150 + rr() * 60 | 0; ro.fillStyle = `rgb(${rv},${rv},${rv})`; ro.fillRect(x + m, y + m, bw - 2 * m, bh - 2 * m);
          if (rr() < 0.35) { // plaque de glace : brillante, légèrement bleutée
            const gx = x + bw * (0.2 + rr() * 0.6), gy = y + bh * 0.5, gr = bw * (0.3 + rr() * 0.4);
            const gi = ro.createRadialGradient(gx, gy, 0, gx, gy, gr); gi.addColorStop(0, 'rgba(25,25,25,0.95)'); gi.addColorStop(1, 'rgba(25,25,25,0)'); ro.fillStyle = gi; ro.fillRect(x, y, bw, bh);
            const gc = c.createRadialGradient(gx, gy, 0, gx, gy, gr); gc.addColorStop(0, 'rgba(40,50,70,0.35)'); gc.addColorStop(1, 'rgba(40,50,70,0)'); c.fillStyle = gc; c.fillRect(x, y, bw, bh);
          }
          if (rr() < 0.3) { // poudre de neige
            const gx = x + bw * rr(), gy = y + bh * rr(), gr = bw * (0.2 + rr() * 0.3);
            const gs = c.createRadialGradient(gx, gy, 0, gx, gy, gr); gs.addColorStop(0, 'rgba(220,230,246,0.55)'); gs.addColorStop(1, 'rgba(220,230,246,0)'); c.fillStyle = gs; c.fillRect(x, y, bw, bh);
          }
          const bv = 170 + rr() * 50 | 0; bu.fillStyle = `rgb(${bv},${bv},${bv})`; bu.beginPath(); bu.roundRect(x + m * 1.6, y + m * 1.6, bw - 3.2 * m, bh - 3.2 * m, 6); bu.fill();
        }
        const nz = noiseCanvas(256, 6, 5, 21, v => [v * 255, v * 255, v * 255, 255]);
        c.globalAlpha = 0.35; c.globalCompositeOperation = 'overlay'; c.drawImage(nz, 0, 0, FN, FN); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
        bu.globalAlpha = 0.3; bu.globalCompositeOperation = 'multiply'; bu.drawImage(nz, 0, 0, FN, FN); bu.globalCompositeOperation = 'source-over'; bu.globalAlpha = 1;
      }
      const floorMat = S.mat({ map: tex(flCv, { wrap: true, aniso: 8 }), roughnessMap: tex(flRough, { wrap: true, srgb: false }), bumpMap: tex(flBump, { wrap: true, srgb: false }), bumpScale: 2, roughness: 1, color: 0xc4c8d2, envMapIntensity: 1.0 });
      {
        const g = new T.PlaneGeometry(7300, 1340); g.rotateX(-Math.PI / 2); g.translate(650, 0, 230);
        const p = g.attributes.position, uv = g.attributes.uv;
        for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 288, p.getZ(i) / 288);
        const fl = new T.Mesh(g, floorMat); fl.userData.noMerge = true; root.add(fl);
      }
      // couche de neige (non répétitive) : plaques, traînées de vent, traces de pas (bottes + pieds de robot)
      const driftH = x => 16 + 16 * fbm(x / 170, 3.3, 3, 61) + 8 * Math.max(0, Math.sin(x / 125 * Math.PI * 2 + 1));
      const driftW = x => 50 + 85 * fbm(x / 260, 7.7, 3, 62);
      const OX0 = -700, OX1 = 2000, OZ0 = -440, OZ1 = 560;
      const ovCv = canvas(2048, 1024);
      {
        const c = ovCv.getContext('2d'), r = S.rng(4242), sx = 2048 / (OX1 - OX0), sz = 1024 / (OZ1 - OZ0);
        const X = x => (x - OX0) * sx, Z = z => (z - OZ0) * sz;
        for (let i = 0; i < 220; i++) {
          const x = OX0 + r() * (OX1 - OX0), z = OZ0 + Math.pow(r(), 1.6) * 800, rad = 15 + r() * 55;
          c.save(); c.translate(X(x), Z(z)); c.scale(2.6, 1);
          const g = c.createRadialGradient(0, 0, 0, 0, 0, rad * sx); const a = 0.25 + r() * 0.5 * (1 - (z - OZ0) / 900);
          g.addColorStop(0, `rgba(228,236,250,${a})`); g.addColorStop(0.6, `rgba(228,236,250,${a * 0.6})`); g.addColorStop(1, 'rgba(228,236,250,0)');
          c.fillStyle = g; c.beginPath(); c.arc(0, 0, rad * sx, 0, 7); c.fill(); c.restore();
        }
        // plaques devant (bas de l'image) : la neige tassée encadre le combat
        for (let i = 0; i < 90; i++) {
          const x = OX0 + r() * (OX1 - OX0), z = 60 + r() * 500, rad = 12 + r() * 40;
          c.save(); c.translate(X(x), Z(z)); c.scale(2.2 + r() * 1.5, 1);
          const g = c.createRadialGradient(0, 0, 0, 0, 0, rad * sx), a = 0.18 + r() * 0.35;
          g.addColorStop(0, `rgba(226,234,250,${a})`); g.addColorStop(0.55, `rgba(226,234,250,${a * 0.5})`); g.addColorStop(1, 'rgba(226,234,250,0)');
          c.fillStyle = g; c.beginPath(); c.arc(0, 0, rad * sx, 0, 7); c.fill(); c.restore();
        }
        // lisière de la congère : poudre irrégulière qui déborde sur les briques
        for (let x = OX0; x < OX1; x += 5) {
          const ze = -441 + driftW(x), reach = 18 + 70 * fbm(x / 90, 1.7, 3, 64) + 30 * vnoise(x / 23, 2.2, 65);
          const g = c.createLinearGradient(0, Z(ze - 12), 0, Z(ze + reach));
          g.addColorStop(0, 'rgba(228,236,250,0.85)'); g.addColorStop(0.35, 'rgba(228,236,250,0.4)'); g.addColorStop(1, 'rgba(228,236,250,0)');
          c.fillStyle = g; c.fillRect(X(x), Z(ze - 12), 5 * sx + 1, Z(ze + reach) - Z(ze - 12));
        }
        c.strokeStyle = 'rgba(230,238,252,0.22)'; c.lineCap = 'round';
        for (let i = 0; i < 160; i++) { const x = X(OX0 + r() * (OX1 - OX0)), z = Z(OZ0 + Math.pow(r(), 1.3) * 700); c.lineWidth = 1 + r() * 3; c.beginPath(); c.moveTo(x, z); c.lineTo(x + 40 + r() * 160, z + (r() - 0.5) * 6); c.stroke(); }
        const print = (x, z, ang, robot) => {
          c.save(); c.translate(X(x), Z(z)); c.rotate(ang);
          if (robot) { c.fillStyle = 'rgba(70,80,100,0.55)'; c.fillRect(-14 * sx, -6 * sz, 28 * sx, 12 * sz); c.fillStyle = 'rgba(240,246,255,0.35)'; c.fillRect(-14 * sx, -7.5 * sz, 28 * sx, 1.5 * sz); }
          else { c.fillStyle = 'rgba(70,80,100,0.5)'; c.beginPath(); c.ellipse(0, 0, 13 * sx, 5 * sz, 0, 0, 7); c.fill(); c.fillStyle = 'rgba(240,246,255,0.3)'; c.beginPath(); c.ellipse(-1, -2 * sz, 13 * sx, 2 * sz, 0, 0, 7); c.fill(); }
          c.restore();
        };
        const trail = (pts, step, robot, gap) => {
          for (let k = 0; k < pts.length - 1; k++) {
            const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], L = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2((z1 - z0) * sz, (x1 - x0) * sx);
            for (let s = 0; s < L; s += step) { const t = s / L, side = (Math.round(s / step) % 2 ? 1 : -1) * gap, nx = -(z1 - z0) / L, nz = (x1 - x0) / L; print(x0 + (x1 - x0) * t + nx * side, z0 + (z1 - z0) * t + nz * side, ang, robot); }
          }
        };
        trail([[-650, -330], [-100, -290], [380, -320], [900, -260], [1500, -300], [1980, -280]], 34, false, 8);
        trail([[1950, -150], [1300, -60], [700, -120], [150, -40], [-650, -90]], 30, false, 7);
        trail([[-600, 120], [200, 60], [800, 140], [1400, 80], [1980, 130]], 46, true, 13);
        // fondu sur les bords de la couche
        c.globalCompositeOperation = 'destination-in';
        const gx = c.createLinearGradient(0, 0, 2048, 0); gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(0.08, 'rgba(0,0,0,1)'); gx.addColorStop(0.92, 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gx; c.fillRect(0, 0, 2048, 1024);
      }
      const ovMat = S.mat({ map: tex(ovCv, { aniso: 8 }), transparent: true, depthWrite: false, roughness: 0.85, envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      {
        const g = new T.PlaneGeometry(OX1 - OX0, OZ1 - OZ0); g.rotateX(-Math.PI / 2); g.translate((OX0 + OX1) / 2, 0.4, (OZ0 + OZ1) / 2);
        const p = g.attributes.position, uv = g.attributes.uv;
        for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - OX0) / (OX1 - OX0), (p.getZ(i) - OZ0) / (OZ1 - OZ0));
        ovMat.map.flipY = false; ovMat.map.needsUpdate = true;
        const ov = new T.Mesh(g, ovMat); ov.userData.noMerge = true; ov.renderOrder = -1; root.add(ov); transp.push([ovMat, 1]);
      }
      // congère en relief au pied du parapet
      {
        const NX = Math.round(7300 / (Q > 1 ? 40 : 20)), NP = 9, pos = [], idx = [];
        for (let i = 0; i <= NX; i++) {
          const x = -3000 + i * 7300 / NX, H = driftH(x), Wd = driftW(x);
          for (let j = 0; j < NP; j++) { const t = j / (NP - 1), z = -441 + t * Wd, y = j === NP - 1 ? -0.6 : H * Math.pow(1 - t, 1.7) * (0.92 + 0.16 * vnoise(x / 30, j, 5)); pos.push(x, y, z); }
        }
        for (let i = 0; i < NX; i++) for (let j = 0; j < NP - 1; j++) { const a = i * NP + j, b = a + NP; idx.push(a, a + 1, b, b, a + 1, b + 1); }
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
        const dm = new T.Mesh(g, snowMat); dm.userData.noMerge = true; root.add(dm);
      }
      // scintillement de la neige (points additifs qui s'allument par instants)
      {
        const n = [700, 450, 0][Q];
        if (n) {
          const r = S.rng(91), pos = new Float32Array(n * 3), sd = new Float32Array(n);
          for (let i = 0; i < n; i++) { const x = -500 + r() * 2300, onD = r() < 0.5, z = onD ? -440 + r() * 50 : -440 + r() * 700; pos[i * 3] = x; pos[i * 3 + 1] = onD ? driftH(x) * Math.pow(1 - (z + 441) / driftW(x), 1.7) + 0.8 : 0.8; pos[i * 3 + 2] = z; sd[i] = r(); }
          const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('seed', new T.BufferAttribute(sd, 1));
          const m = new T.ShaderMaterial({
            uniforms: { time: U.time, scaleH: U.scaleH, dimK: U.dimK, camX: U.camX }, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
            vertexShader: `uniform float time, scaleH, camX; attribute float seed; varying float vA;
              void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
                float s = sin(time * (1.0 + seed * 2.0) + seed * 80.0 + camX * 0.03); vA = pow(max(s, 0.0), 24.0);
                gl_PointSize = max(2.0, 4.0 * projectionMatrix[1][1] * scaleH * 0.5 / -mv.z) * (0.5 + vA); }`,
            fragmentShader: `uniform float dimK; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = max(0.0, 1.0 - abs(c.x) * 6.0 - abs(c.y) * 1.2) + max(0.0, 1.0 - abs(c.y) * 6.0 - abs(c.x) * 1.2); gl_FragColor = vec4(vec3(1.4, 1.6, 2.0) * a * vA * dimK, 1.0); }`
          });
          const pts = new T.Points(g, m); pts.frustumCulled = false; pts.userData.noMerge = true; pts.renderOrder = 1; root.add(pts);
        }
      }

      mark('PARAPET');
      /* =====================================================
         8. PARAPET CRÉNELÉ (arrière) + mâts + stalactites
         ===================================================== */
      const POSTS = [-620, 230, 1070, 1920];
      {
        const pg = S.group(), X0 = -3000, X1 = 4300, L = X1 - X0, ZI = -440, DZ = 62;
        S.add(pg, S.g.box(L, 66, DZ), stone, { p: [(X0 + X1) / 2, 33, ZI - DZ / 2] });
        S.add(pg, S.g.box(L, 7, DZ + 8), stoneDark, { p: [(X0 + X1) / 2, 69, ZI - DZ / 2] });
        S.add(pg, S.g.box(L, 5, DZ + 6), snowMat, { p: [(X0 + X1) / 2, 75, ZI - DZ / 2] });
        const r = S.rng(17);
        for (let x = X0 + 40; x < X1; x += 125) {
          S.add(pg, S.g.box(80, 60, 52), stone, { p: [x, 72 + 30, ZI - DZ / 2] });
          S.add(pg, S.g.box(8, 24, 2), darkMat, { p: [x, 104, ZI + 0.6 - (DZ - 52) / 2] }); // meurtrière
          S.add(pg, S.g.rbox(86, 11, 60, 4.5, 2), snowMat, { p: [x + (r() - 0.5) * 4, 136, ZI - DZ / 2 + (r() - 0.5) * 3] });
          S.add(pg, S.g.ell(18 + r() * 14, 7, 12, 10, 6), snowMat, { p: [x - 20 + r() * 40, 137 + r() * 3, ZI - DZ / 2] });
        }
        // stalactites sous la corniche
        const ig = S.group();
        for (let x = X0 + 5; x < X1; x += 6 + r() * 10) {
          if (POSTS.some(px => Math.abs(px - x) < 40) || r() < 0.35) continue;
          const l = 5 + Math.pow(r(), 2) * 26;
          S.add(ig, S.g.cone(1.3 + l * 0.04, l, 4), iceMat, { p: [x, 65.5 - l / 2, ZI + 3.5], r: [Math.PI, 0, 0] });
        }
        // mâts : socle de pierre, poteau laqué, barre aux lanternes, pointe dorée
        for (const x of POSTS) {
          S.add(pg, S.g.box(46, 42, 46), stone, { p: [x, 21, ZI + 26] });
          S.add(pg, S.g.rbox(52, 9, 52, 4, 1), snowMat, { p: [x, 45, ZI + 26] });
          S.add(pg, S.g.box(11, 320, 11), redWood, { p: [x, 42 + 160, ZI + 26] });
          S.add(pg, S.g.box(70, 6, 8), redWood, { p: [x, 246, ZI + 26] });
          S.add(pg, S.g.box(16, 4, 16), gold, { p: [x, 362, ZI + 26] });
          S.add(pg, S.g.cone(4, 26, 6), gold, { p: [x, 375, ZI + 26] });
          S.add(pg, S.g.box(9, 3, 9), gold, { p: [x, 246, ZI + 26] });
          for (const dx of [-27, 27]) lanterns.push({ p: new T.Vector3(x + dx, 243, ZI + 26), len: 18, r: 15, ph: x * 0.013 + dx });
        }
        S.merge(pg); uvAll(pg); root.add(pg);
        S.merge(ig); root.add(ig);
      }

      mark('BANNIÈRES');
      /* =====================================================
         9. BANNIÈRES (flottent au vent) + LANTERNES (balancement + vacillement) + halos + flaques de lumière
         ===================================================== */
      const banCv = canvas(256, 168);
      {
        const c = banCv.getContext('2d'), w = 256, h = 168, tb = 20;
        c.fillStyle = '#d6a12a';
        for (let x = 0; x < w - tb; x += 18) { c.beginPath(); c.moveTo(x, tb + 1); c.lineTo(x + 9, 2); c.lineTo(x + 18, tb + 1); c.fill(); c.beginPath(); c.moveTo(x, h - tb - 1); c.lineTo(x + 9, h - 2); c.lineTo(x + 18, h - tb - 1); c.fill(); }
        for (let y = tb - 4; y < h - tb; y += 18) { c.beginPath(); c.moveTo(w - tb - 1, y); c.lineTo(w - 2, y + 9); c.lineTo(w - tb - 1, y + 18); c.fill(); }
        const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#9e0f16'); g.addColorStop(1, '#c41a1f'); c.fillStyle = g; c.fillRect(0, tb, w - tb, h - 2 * tb);
        c.strokeStyle = '#e1b23a'; c.lineWidth = 3; c.strokeRect(8, tb + 7, w - tb - 16, h - 2 * tb - 14);
        c.fillStyle = '#f2e6cc'; c.beginPath(); c.arc((w - tb) / 2, h / 2, 46, 0, 7); c.fill();
        c.fillStyle = '#1a0a08'; c.font = 'bold 66px ' + CJK; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('龍', (w - tb) / 2, h / 2 + 3);
        c.fillStyle = '#fff'; c.fillRect(0, tb, 6, h - 2 * tb); c.fillStyle = '#9e0f16'; c.fillRect(0, tb, 6, h - 2 * tb);
      }
      {
        const geos = [];
        POSTS.forEach((x, k) => {
          const g = new T.PlaneGeometry(118, 77, 14, 5); g.translate(59 + 5.5, 0, 0);
          const p = g.attributes.position, fl = new Float32Array(p.count * 2);
          for (let i = 0; i < p.count; i++) { fl[i * 2] = (p.getX(i) - 5.5) / 118; fl[i * 2 + 1] = k * 1.7; }
          g.setAttribute('flg', new T.BufferAttribute(fl, 2));
          g.translate(x, 312, -440 + 26); geos.push(g);
        });
        const g = BGU.mergeGeometries(geos);
        const m = S.mat({ map: tex(banCv), alphaTest: 0.45, side: T.DoubleSide, roughness: 0.75, envMapIntensity: 0.3 });
        const head = `attribute vec2 flg; uniform float time; uniform float gust;\n`;
        const wave = `float fu = flg.x; float fwv = 6.5 * fu - time * (5.0 + 4.0 * gust) + flg.y;
          float fam = (4.0 + 10.0 * gust) * fu;
          float fdz = (cos(fwv) * 6.5 * fam + sin(fwv) * (4.0 + 10.0 * gust)) / 118.0;`;
        m.onBeforeCompile = sh => {
          sh.uniforms.time = U.time; sh.uniforms.gust = U.gust;
          sh.vertexShader = head + sh.vertexShader
            .replace('#include <beginnormal_vertex>', wave + '\n vec3 objectNormal = normalize(vec3(-fdz, 0.0, 1.0));')
            .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
              transformed.z += sin(fwv) * fam;
              transformed.y += sin(fwv * 0.7 + 1.3) * 2.0 * fu - fu * fu * (16.0 - 10.0 * gust);
              transformed.x -= fu * fu * (10.0 - 6.0 * gust);`);
        };
        m.customProgramCacheKey = () => 'wallFlag';
        const me = new T.Mesh(g, m); me.userData.noMerge = true; me.frustumCulled = false; root.add(me);
      }
      // lanternes : corps lumineux (shader : papier translucide + nervures) et pièces dorées, même balancement
      const lanCv = canvas(128, 128);
      {
        const c = lanCv.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 128);
        g.addColorStop(0, '#7a0a06'); g.addColorStop(0.18, '#e8401c'); g.addColorStop(0.5, '#ffb050'); g.addColorStop(0.82, '#e8401c'); g.addColorStop(1, '#7a0a06');
        c.fillStyle = g; c.fillRect(0, 0, 128, 128);
        c.fillStyle = 'rgba(90,10,4,0.55)'; for (let x = 0; x < 128; x += 10.67) c.fillRect(x, 0, 2, 128);
        c.fillStyle = 'rgba(255,215,120,0.85)'; c.font = 'bold 30px ' + CJK; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('福', 32, 66); c.fillText('福', 96, 66);
      }
      const lanU = { time: U.time, gust: U.gust, map: { value: tex(lanCv) }, I: { value: 2.0 } };
      const lanMat = new T.ShaderMaterial({
        uniforms: lanU,
        vertexShader: `uniform float time, gust; attribute vec4 sway; varying vec2 vUv; varying float vF;
          ${SWAY}
          void main(){ vUv = uv; vec3 p = swayP(position, sway.xyz, sway.w);
            vec4 mv = modelViewMatrix * vec4(p, 1.0); vec3 n = normalize(normalMatrix * normal);
            vF = clamp(dot(n, normalize(-mv.xyz)), 0.0, 1.0); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform sampler2D map; uniform float I; varying vec2 vUv; varying float vF;
          void main(){ vec3 c = texture2D(map, vUv).rgb; c = c * c; gl_FragColor = vec4(c * I * (0.35 + 0.9 * vF * vF), 1.0); }`
      });
      const lanMetal = S.mat({ color: 0x8a6420, roughness: 0.4, metalness: 0.8, envMapIntensity: 0.9 });
      lanMetal.onBeforeCompile = sh => {
        sh.uniforms.time = U.time; sh.uniforms.gust = U.gust;
        sh.vertexShader = 'uniform float time; uniform float gust; attribute vec4 sway;\n' + SWAY + '\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = swayP(transformed, sway.xyz, sway.w);');
      };
      lanMetal.customProgramCacheKey = () => 'wallLanMetal';
      {
        const bodies = [], metal = [], mm = new T.Matrix4();
        const add = (list, geo, x, y, z, L) => {
          const g = (geo.index ? geo.toNonIndexed() : geo.clone()); g.applyMatrix4(mm.makeTranslation(x, y, z));
          for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
          const sw = new Float32Array(g.attributes.position.count * 4);
          for (let i = 0; i < sw.length; i += 4) { sw[i] = L.p.x; sw[i + 1] = L.p.y; sw[i + 2] = L.p.z; sw[i + 3] = L.ph; }
          g.setAttribute('sway', new T.BufferAttribute(sw, 4)); list.push(g);
        };
        for (const L of lanterns) {
          const { x, y, z } = L.p, r = L.r, cy = y - L.len - r * 1.15;
          L.c = new T.Vector3(x, cy, z);
          add(bodies, S.g.ell(r, r * 1.15, r, 16, 12), x, cy, z, L);
          add(metal, S.g.cyl(r * 0.55, r * 0.6, r * 0.25, 10), x, cy + r * 1.12, z, L);
          add(metal, S.g.cyl(r * 0.6, r * 0.5, r * 0.25, 10), x, cy - r * 1.12, z, L);
          add(metal, S.g.cyl(0.5, 0.5, L.len, 4), x, y - L.len / 2, z, L);
          add(metal, S.g.cyl(r * 0.12, r * 0.05, r * 1.4, 5), x, cy - r * 1.95, z, L);
        }
        const mb = new T.Mesh(BGU.mergeGeometries(bodies), lanMat); mb.userData.noMerge = true; mb.frustumCulled = false; mb.userData.receiveShadow = false;
        const mt = new T.Mesh(BGU.mergeGeometries(metal), lanMetal); mt.userData.noMerge = true; mt.frustumCulled = false;
        root.add(mb, mt);
      }
      // halos (points additifs) : lanternes proches (balancées) + lanternes lointaines de la muraille
      const haloU = { time: U.time, gust: U.gust, scaleH: U.scaleH, dimK: U.dimK };
      {
        const all = [];
        for (const L of lanterns) all.push([L.c.x, L.c.y, L.c.z, L.r * 9, 1.0, L.p.x, L.p.y, L.p.z, L.ph, 1]);
        for (const f of fglow) all.push([f[0], f[1], f[2], f[3], f[4], 0, 0, 0, hash(f[0] | 0, f[2] | 0, 3) * 50, 0]);
        // fenêtres et porte éclairées de la tour principale
        const tp = (x, y, z) => new T.Vector3(x, y, z).applyAxisAngle(T.Object3D.DEFAULT_UP, T1.yaw).add(T1.P);
        for (const v of [tp(-100, 150, -T1.LZ / 2 - 8), tp(0, 150, -T1.LZ / 2 - 8), tp(-T1.LX / 2 - 10, 60, 0), tp(0, T1.HB + 70, -80)]) all.push([v.x, v.y, v.z, 200, 0.55, 0, 0, 0, 1, 0]);
        const n = all.length, pos = new Float32Array(n * 3), piv = new Float32Array(n * 4), sz = new Float32Array(n * 3);
        all.forEach((a, i) => { pos.set([a[0], a[1], a[2]], i * 3); piv.set([a[5], a[6], a[7], a[8]], i * 4); sz.set([a[3], a[4], a[9]], i * 3); });
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('sway', new T.BufferAttribute(piv, 4)); g.setAttribute('sz', new T.BufferAttribute(sz, 3));
        const m = new T.ShaderMaterial({
          uniforms: haloU, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
          vertexShader: `uniform float time, gust, scaleH; attribute vec4 sway; attribute vec3 sz; varying float vI;
            ${SWAY}
            void main(){ vec3 p = sz.z > 0.5 ? swayP(position, sway.xyz, sway.w) : position;
              vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
              float fl = 0.86 + 0.08 * sin(time * 11.0 + sway.w * 3.1) + 0.06 * sin(time * 23.0 + sway.w);
              gl_PointSize = max(3.0, sz.x * projectionMatrix[1][1] * scaleH * 0.5 / -mv.z);
              vI = sz.y * fl * min(1.0, gl_PointSize / 6.0); }`,
          fragmentShader: `uniform float dimK; varying float vI; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
            float a = exp(-d * d * 7.0) * 0.9 + exp(-d * 3.5) * 0.25 - 0.03; a = max(a, 0.0);
            gl_FragColor = vec4(vec3(1.0, 0.42, 0.16) * a * vI * dimK * 1.6, 1.0); }`
        });
        const pts = new T.Points(g, m); pts.frustumCulled = false; pts.userData.noMerge = true; pts.renderOrder = 2; root.add(pts);
      }
      // flaques de lumière chaude des lanternes (sol + face du parapet), additives
      const poolCv = canvas(128, 128);
      { const c = poolCv.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }
      const poolMat = S.basic({ map: tex(poolCv), color: new T.Color(0xff7a30), transparent: true, opacity: 0.32, blending: T.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      transp.push([poolMat, 0.32]);
      {
        const geos = [];
        for (const x of POSTS) {
          const f = new T.PlaneGeometry(420, 300); f.rotateX(-Math.PI / 2); f.translate(x, 0.9, -360); geos.push(f);
          // face du parapet : le dégradé est centré sur la lanterne (y ≈ 212), seule la partie basse (0..66) est dessinée
          const w = new T.PlaneGeometry(340, 66); w.translate(x, 33, -439.2);
          const uv = w.attributes.uv, p = w.attributes.position;
          for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + (p.getX(i) - x) / 340, 0.5 + (p.getY(i) - 212) / 340 * 0.8);
          geos.push(w);
        }
        const me = new T.Mesh(BGU.mergeGeometries(geos), poolMat); me.userData.noMerge = true; me.userData.receiveShadow = false; me.renderOrder = 0.5; root.add(me);
      }
      const plights = [];
      if (Q < 2) for (const x of [230, 1070]) { const l = new T.PointLight(0xff8a3a, 0, 520, 1.6); l.position.set(x, 200, -395); l.userData.base = 9000; root.add(l); plights.push(l); }

      mark('NEIGE');
      /* =====================================================
         10. NEIGE : 3 couches + neige soufflée au ras du sol (même vent que les bannières)
         ===================================================== */
      function snow(o) {
        const n = o.count, r = S.rng(o.seed), pos = new Float32Array(n * 3), sd = new Float32Array(n);
        for (let i = 0; i < n; i++) { pos[i * 3] = r() * o.w; pos[i * 3 + 1] = o.y0 + r() * (o.y1 - o.y0); pos[i * 3 + 2] = o.z0 + r() * (o.z1 - o.z0); sd[i] = r(); }
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('seed', new T.BufferAttribute(sd, 1));
        const u = { time: U.time, drift: U.drift, camX: U.camX, scaleH: U.scaleH, dimK: U.dimK, gust: U.gust, W: { value: o.w }, Y0: { value: o.y0 }, H: { value: o.y1 - o.y0 }, size: { value: o.size }, fall: { value: o.fall }, op: { value: o.op }, dk: { value: o.drift || 1 }, col: { value: o.col || linear(0.78, 0.84, 1.0) } };
        const m = new T.ShaderMaterial({
          uniforms: u, transparent: true, depthWrite: false,
          vertexShader: `uniform float time, drift, camX, scaleH, gust, W, Y0, H, size, fall, dk; attribute float seed; varying float vA;
            void main(){
              float sp = 0.7 + 0.6 * seed;
              float y = Y0 + mod(position.y - Y0 - fall * time * sp, H);
              float x0 = camX - W * 0.5;
              float x = x0 + mod(position.x + drift * dk * sp + sin(time * (0.7 + seed) + seed * 60.0) * 22.0 - x0, W);
              float z = position.z + sin(time * 0.6 + seed * 30.0) * 12.0;
              ${o.ground ? 'y = Y0 + H * (0.15 + 0.85 * seed) * abs(sin(time * (1.2 + seed) + seed * 40.0)) * (0.3 + 0.7 * gust);' : ''}
              vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0); gl_Position = projectionMatrix * mv;
              gl_PointSize = size * (0.55 + 0.9 * seed) * projectionMatrix[1][1] * scaleH * 0.5 / -mv.z;
              float fx = (x - x0) / W;
              vA = smoothstep(0.0, 0.06, (y - Y0) / H) * smoothstep(1.0, 0.9, (y - Y0) / H) * smoothstep(0.0, 0.05, fx) * smoothstep(1.0, 0.95, fx)${o.ground ? ' * smoothstep(0.25, 1.0, gust)' : ''};
            }`,
          fragmentShader: `uniform vec3 col; uniform float op, dimK; varying float vA;
            void main(){ vec2 c = gl_PointCoord - 0.5; ${o.ground ? 'c.y *= 4.0;' : ''} float a = smoothstep(0.5, ${o.soft ? '0.0' : '0.12'}, length(c)); gl_FragColor = vec4(col, a * op * vA * dimK); }`
        });
        const p = new T.Points(g, m); p.frustumCulled = false; p.userData.noMerge = true; p.renderOrder = 3; return p;
      }
      const qn = [1, 0.65, 0.4][Q];
      root.add(snow({ count: Math.round(2600 * qn), seed: 3, w: 4200, y0: -300, y1: 1500, z0: -3200, z1: -480, size: 9, fall: 70, op: 0.55 }));
      root.add(snow({ count: Math.round(1500 * qn), seed: 5, w: 1500, y0: 0, y1: 520, z0: -460, z1: 160, size: 4.2, fall: 85, op: 0.75 }));
      root.add(snow({ count: Math.round(90 * qn), seed: 8, w: 900, y0: 0, y1: 420, z0: 300, z1: 520, size: 5, fall: 110, op: 0.35, soft: true, drift: 1.3 }));
      root.add(snow({ count: Math.round(500 * qn), seed: 9, w: 1500, y0: 0, y1: 34, z0: -440, z1: 220, size: 7, fall: 0, op: 0.4, ground: true, drift: 3.2, soft: true }));

      mark('ANIMATION');
      /* =====================================================
         ANIMATION
         ===================================================== */
      let lastT = -1, drift = 0;
      const lanI = 2.0;
      function update(t, info) {
        const dt = lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
        // rafales : vent de base + bourrasques irrégulières
        const g1 = Math.max(0, Math.sin(t * 0.42) * Math.sin(t * 0.165 + 1.3)), gust = 0.18 + 1.5 * g1 * g1 + 0.08 * Math.sin(t * 2.3);
        U.gust.value = gust; drift += (40 + 150 * gust) * dt; U.drift.value = drift;
        U.time.value = t; U.scaleH.value = info.h || 540; U.camX.value = info.cx;
        const dk = 1 - (1 - info.dim) * 0.72 / 0.7; U.dimK.value = dk;
        for (const [m, op] of transp) m.opacity = op * dk;
        if (info.camera) sky.position.copy(info.camera.position);
        for (const ms of mists) ms.t.offset.x = t * ms.sp * 60;
        const fl = 0.9 + 0.06 * Math.sin(t * 9.3) + 0.04 * Math.sin(t * 21.7);
        lanU.I.value = lanI * fl;
        poolMat.opacity = 0.32 * fl * dk;
        for (const l of plights) l.intensity = l.userData.base * fl;
      }
      return { root, update };
    }
  };
})();
