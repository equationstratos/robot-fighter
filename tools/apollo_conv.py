#!/usr/bin/env python3
"""Conversion Apollo (format de tools/mjcf2rk.py) :
   1. enveloppe extérieure de chaque géométrie CAO (champ de distance sur voxels, seul l'extérieur est gardé) ;
   2. décimation quadrique MeshLab sur ce maillage propre ;
   3. NORMALES TRANSFÉRÉES depuis le champ haute résolution (gradient), par coin de triangle, avec
      séparation des sommets aux arêtes vives → le maillage léger s'éclaire comme la CAO détaillée.
   Champs supplémentaires par géométrie : 'n' (normales int8, alignées sur 'v') ; le kit les ignore.
dépendances : mujoco, numpy, scipy, scikit-image, pymeshlab
usage : python3 -I tools/apollo_conv.py <menagerie>/apptronik_apollo/apptronik_apollo.xml js/meshes/apollo.js [--only regex] [--k 1]"""
import sys, json, re, time, argparse, os, base64
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mjcf2rk as C
import mujoco
from scipy import ndimage as ND
from skimage.measure import marching_cubes

ap = argparse.ArgumentParser()
ap.add_argument('xml'); ap.add_argument('out')
ap.add_argument('--k', type=float, default=1.0)
ap.add_argument('--lowk', type=float, default=1.0)
ap.add_argument('--res', type=float, default=1.0)
ap.add_argument('--sigma', type=float, default=0.8)
ap.add_argument('--rk', type=float, default=0.6)
ap.add_argument('--only', default='')
ap.add_argument('--split', default='', help='fichier JSON de découpage en sous-géométries')
ap.add_argument('--cache', default='')
ap.add_argument('--cadn', type=int, default=1)
ap.add_argument('--exact', type=int, default=1)
a = ap.parse_args()

# (motif, budget haut, budget bas, voxel cm)
BUDGET = json.load(open(os.environ['BUDGET'])) if os.environ.get('BUDGET') else [
    [r'^afh_2_1_link$', 3400, 400, 0.25],
    [r'^torso_link$', 7400, 800, 0.3],
    [r'^pelvis_link$', 2400, 300, 0.3],
    [r'^torso_roll_link$', 460, 60, 0.25],
    [r'^torso_pitch_link$', 200, 0, 0.25],
    [r'^neck_mount_fix_link$', 360, 0, 0.25],
    [r'^battery_mount_fix$', 240, 0, 0.25],
    [r'^neck_yaw_link$', 900, 100, 0.25],
    [r'shoulder_aa', 80, 0, 0.25],
    [r'shoulder_ie', 520, 70, 0.25],
    [r'shoulder_fe', 1800, 220, 0.25],
    [r'elbow_fe', 520, 70, 0.25],
    [r'wrist_roll', 1300, 160, 0.25],
    [r'wrist_yaw', 60, 0, 0.2],
    [r'_wrist_pitch_link$', 240, 30, 0.2],
    [r'wrist_adapter', 150, 0, 0.2],
    [r'^wrist', 100, 0, 0.2],
    [r'palm', 460, 80, 0.15],
    [r'F1|F2|mesh_1|mesh_2', 110, 0, 0.1],
    [r'hip_ie', 900, 100, 0.3],
    [r'hip_aa', 150, 0, 0.25],
    [r'hip_fe', 2800, 330, 0.3],
    [r'knee_fe', 2300, 260, 0.3],
    [r'ankle_ie', 120, 0, 0.2],
    [r'foot', 950, 150, 0.25],
]


def budget(name):
    for e in BUDGET:
        pat, hi, lo, h = e[:4]
        if re.search(pat, name):
            opt = {'sigma': a.sigma, 'rk': a.rk, 'rc': 0, 'cadn': a.cadn}
            for kk, vv in zip(['sigma', 'rk', 'rc', 'cadn'], e[4:]):
                if vv is not None: opt[kk] = vv
            OPT[name] = opt
            return int(hi * a.k), int(lo * a.lowk), h * a.res
    print('  ?? pas de budget pour', name)
    return 200, 20, 0.25


def sample(V, F, s):
    a_, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    e = np.maximum(np.maximum(np.linalg.norm(b - a_, axis=1), np.linalg.norm(c - a_, axis=1)), np.linalg.norm(c - b, axis=1))
    n = np.clip(np.ceil(e / s).astype(int), 1, 800)
    P = []
    for nn in np.unique(n):
        sel = np.nonzero(n == nn)[0]
        ij = np.array([(i, j) for i in range(nn + 1) for j in range(nn + 1 - i)], dtype=np.float64) / nn
        A, Bv, Cv = a_[sel], b[sel] - a_[sel], c[sel] - a_[sel]
        pts = A[:, None, :] + Bv[:, None, :] * ij[None, :, 0:1] + Cv[:, None, :] * ij[None, :, 1:2]
        P.append(pts.reshape(-1, 3))
    return np.concatenate(P)


OPT = {}


def field(V, F, h, sigma, rk, rc):
    pad = 6
    lo = V.min(0) - pad * h
    dims = np.ceil((V.max(0) - lo) / h).astype(int) + pad + 1
    pts = sample(V, F, h * 0.4)
    idx = np.clip(np.floor((pts - lo) / h + 0.5).astype(int), 0, dims - 1)
    occ = np.zeros(dims, bool)
    occ[idx[:, 0], idx[:, 1], idx[:, 2]] = True
    d = ND.distance_transform_edt(~occ) * h
    if a.exact:   # distance exacte (au nuage dense de la CAO) dans une bande autour de la surface : plus de marches d'escalier
        from scipy.spatial import cKDTree
        band = d <= (max(rk, 1.0) + 2.5) * h
        bi = np.argwhere(band)
        tree = cKDTree(sample(V, F, h * 0.35))
        de, _ = tree.query(lo + bi * h, workers=4)
        d[band] = de
    r = rk * h
    if rc > rk:   # fermeture morphologique : comble les interstices < 2·rc sans gonfler la pièce
        R = rc * h
        lab, n = ND.label(d > R)
        border = np.unique(np.concatenate([lab[0].ravel(), lab[-1].ravel(), lab[:, 0].ravel(), lab[:, -1].ravel(), lab[:, :, 0].ravel(), lab[:, :, -1].ravel()]))
        E = np.isin(lab, border[border > 0])
        DE = ND.distance_transform_edt(~E) * h
        f = (R - r) - DE
        if sigma > 0: f = ND.gaussian_filter(f, sigma)
        return f.astype(np.float32), lo
    outside = d > r
    lab, n = ND.label(outside)
    border = np.unique(np.concatenate([lab[0].ravel(), lab[-1].ravel(), lab[:, 0].ravel(), lab[:, -1].ravel(), lab[:, :, 0].ravel(), lab[:, :, -1].ravel()]))
    border = border[border > 0]
    ext = np.isin(lab, border)
    f = np.where(ext | ~outside, d - r, -r)
    if sigma > 0:
        f = ND.gaussian_filter(f, sigma)
    return f.astype(np.float32), lo


def surface(f, lo, h):
    vv, ff, _, _ = marching_cubes(f, 0.0)
    vv = lo + vv * h
    ff = ff.astype(np.int64)
    A, B, Cc = vv[ff[:, 0]], vv[ff[:, 1]], vv[ff[:, 2]]
    if np.einsum('ij,ij->i', A, np.cross(B, Cc)).sum() < 0:
        ff = ff[:, [0, 2, 1]]
    return vv, ff


def mld(v, f, target):
    import pymeshlab as ml
    ms = ml.MeshSet()
    ms.add_mesh(ml.Mesh(vertex_matrix=v.astype(np.float64), face_matrix=f.astype(np.int32)))
    for _ in range(4):
        if ms.current_mesh().face_number() <= target * 1.03: break
        ms.meshing_decimation_quadric_edge_collapse(targetfacenum=int(target), qualitythr=0.3, preserveboundary=True, preservenormal=True,
                                                    preservetopology=False, optimalplacement=True, planarquadric=True, planarweight=0.001,
                                                    qualityweight=False, autoclean=True)
    mm = ms.current_mesh()
    return mm.vertex_matrix().astype(np.float64), mm.face_matrix().astype(np.int64)


def compact(v, f):
    used = np.unique(f)
    remap = -np.ones(len(v), dtype=np.int64); remap[used] = np.arange(len(used))
    return v[used], remap[f]


def face_normals(v, f):
    n = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    l = np.linalg.norm(n, axis=1, keepdims=True)
    return n / np.maximum(l, 1e-12), l[:, 0] * 0.5


def corner_normals_field(v, f, fld, lo, h):
    """normale de chaque coin = gradient du champ, échantillonné un peu à l'intérieur du triangle"""
    G = np.gradient(fld)
    nf, _ = face_normals(v, f)
    cen = v[f].mean(1)
    out = np.zeros((len(f), 3, 3))
    for k in range(3):
        P = v[f[:, k]]
        dv = cen - P
        dl = np.linalg.norm(dv, axis=1, keepdims=True)
        t = np.minimum(0.45, 1.3 * h / np.maximum(dl, 1e-9))
        p = P + dv * t
        q = ((p - lo) / h).T
        g = np.stack([ND.map_coordinates(Gi, q, order=1, mode='nearest') for Gi in G], 1)
        gl = np.linalg.norm(g, axis=1, keepdims=True)
        g = g / np.maximum(gl, 1e-12)
        bad = (gl[:, 0] < 1e-6) | (np.einsum('ij,ij->i', g, nf) < 0.3)
        g[bad] = nf[bad]
        out[:, k] = g
    return out


def sample_n(V, F, s, crease=35):
    """points échantillonnés sur la CAO avec une normale LISSÉE (normales de sommets, sauf aux arêtes vives)"""
    a_, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    nf = np.cross(b - a_, c - a_); nl = np.linalg.norm(nf, axis=1); ok = nl > 1e-10
    F = F[ok]; a_, b, c, nf, nl = a_[ok], b[ok], c[ok], nf[ok] / nl[ok, None], nl[ok]
    vn = np.zeros((len(V), 3))
    for k in range(3):
        np.add.at(vn, F[:, k], nf * nl[:, None])
    vn /= np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)
    cs = np.cos(np.radians(crease))
    cn = []
    for k in range(3):
        n = vn[F[:, k]]
        bad = np.einsum('ij,ij->i', n, nf) < cs
        n = np.where(bad[:, None], nf, n)
        cn.append(n)
    e = np.maximum(np.maximum(np.linalg.norm(b - a_, axis=1), np.linalg.norm(c - a_, axis=1)), np.linalg.norm(c - b, axis=1))
    n = np.clip(np.ceil(e / s).astype(int), 1, 400)
    P, N = [], []
    for nn in np.unique(n):
        sel = np.nonzero(n == nn)[0]
        ij = np.array([(i, j) for i in range(nn + 1) for j in range(nn + 1 - i)], dtype=np.float64) / nn
        A, Bv, Cv = a_[sel], b[sel] - a_[sel], c[sel] - a_[sel]
        pts = A[:, None, :] + Bv[:, None, :] * ij[None, :, 0:1] + Cv[:, None, :] * ij[None, :, 1:2]
        w0 = (1 - ij[:, 0] - ij[:, 1])[None, :, None]; w1 = ij[None, :, 0:1]; w2 = ij[None, :, 1:2]
        nrm = cn[0][sel][:, None, :] * w0 + cn[1][sel][:, None, :] * w1 + cn[2][sel][:, None, :] * w2
        nrm /= np.maximum(np.linalg.norm(nrm, axis=2, keepdims=True), 1e-12)
        P.append(pts.reshape(-1, 3)); N.append(nrm.reshape(-1, 3))
    return np.concatenate(P), np.concatenate(N)


def corner_normals_cad(v, f, V0, F0, h, fallback):
    """normale de chaque coin = normales des triangles CAO les plus proches (orientées comme la face)"""
    from scipy.spatial import cKDTree
    P, N = sample_n(V0, F0, h * 0.5)
    tree = cKDTree(P)
    nf, _ = face_normals(v, f)
    cen = v[f].mean(1)
    out = fallback.copy()
    K = 12
    for k in range(3):
        Pk = v[f[:, k]]
        dv = cen - Pk
        dl = np.linalg.norm(dv, axis=1, keepdims=True)
        t = np.minimum(0.45, 1.0 * h / np.maximum(dl, 1e-9))
        p = Pk + dv * t
        dist, ii = tree.query(p, k=K)
        nn = N[ii]                               # (F, K, 3)
        dots = np.einsum('fkj,fj->fk', nn, nf)
        nn = nn * np.sign(dots)[..., None]       # orientation incohérente des STL
        ad = np.abs(dots)
        w = (ad > 0.55) * np.exp(-((dist - dist[:, :1]) / (0.6 * h)) ** 2)
        s = (nn * w[..., None]).sum(1)
        sl = np.linalg.norm(s, axis=1)
        good = (w.sum(1) > 0.5) & (sl > 1e-6)
        s = s / np.maximum(sl, 1e-12)[:, None]
        out[good, k] = s[good]
    return out


def corner_normals_crease(v, f, crease=35):
    """normales lissées par sommet, arêtes vives au-delà de crease (pour les petites pièces sans champ)"""
    nf, ar = face_normals(v, f)
    out = np.zeros((len(f), 3, 3))
    inc = [[] for _ in range(len(v))]
    for fi, tri in enumerate(f):
        for k in range(3):
            inc[tri[k]].append(fi)
    cs = np.cos(np.radians(crease))
    for fi, tri in enumerate(f):
        for k in range(3):
            lst = inc[tri[k]]
            nn = nf[lst]; w = ar[lst]
            ok = nn @ nf[fi] > cs
            s = (nn[ok] * w[ok, None]).sum(0)
            out[fi, k] = s / max(np.linalg.norm(s), 1e-12)
    return out


def split_vertices(v, f, cn, tol_deg=22):
    """sommets dupliqués là où les normales des coins divergent ; renvoie (v2, f2, n2)"""
    ct = np.cos(np.radians(tol_deg))
    corners = [[] for _ in range(len(v))]
    for fi in range(len(f)):
        for k in range(3):
            corners[f[fi, k]].append((fi, k))
    V2, N2 = [], []
    F2 = np.zeros_like(f)
    for vi, lst in enumerate(corners):
        reps = []  # (somme des normales, index de sortie)
        for fi, k in lst:
            n = cn[fi, k]
            best = -1
            for ri, (s, oi) in enumerate(reps):
                if np.dot(s / np.linalg.norm(s), n) > ct:
                    best = ri; break
            if best < 0:
                reps.append([n.copy(), len(V2)]); V2.append(v[vi]); N2.append(None)
                best = len(reps) - 1
            else:
                reps[best][0] += n
            F2[fi, k] = reps[best][1]
        for s, oi in reps:
            N2[oi] = s / max(np.linalg.norm(s), 1e-12)
    return np.array(V2), F2, np.array(N2)


def b64(arr):
    return base64.b64encode(np.ascontiguousarray(arr).tobytes()).decode('ascii')


# ---------- chargement ----------
m = mujoco.MjModel.from_xml_path(a.xml)
d = mujoco.MjData(m)
mujoco.mj_forward(m, d)
geoms = []
for gi in range(m.ngeom):
    if m.geom_type[gi] != mujoco.mjtGeom.mjGEOM_MESH or m.geom_group[gi] >= 3: continue
    if m.geom_rgba[gi][3] == 0 and m.geom_matid[gi] < 0: continue
    mid = m.geom_dataid[gi]
    body = m.body(m.geom_bodyid[gi]).name
    gname = m.geom(gi).name or m.mesh(mid).name
    va, vn = m.mesh_vertadr[mid], m.mesh_vertnum[mid]
    fa, fn = m.mesh_faceadr[mid], m.mesh_facenum[mid]
    v = m.mesh_vert[va:va + vn].astype(np.float64)
    f = m.mesh_face[fa:fa + fn].astype(np.int64)
    R = d.geom_xmat[gi].reshape(3, 3)
    w = C.to_game(v @ R.T + d.geom_xpos[gi])
    rgba = m.mat_rgba[m.geom_matid[gi]] if m.geom_matid[gi] >= 0 else m.geom_rgba[gi]
    w, f = C.clean(w, f)
    base, n = gname, 2
    while any(g['name'] == gname for g in geoms):
        gname = f'{base}#{n}'; n += 1
    geoms.append({'name': gname, 'mesh': m.mesh(mid).name, 'body': body, 'rgba': [round(float(x), 3) for x in rgba], 'v': w, 'f': f})

# découpage optionnel : {geom: [[suffixe, expression python sur (c = centroïde Nx3, n = normale Nx3)], ...]}
SPLIT = json.load(open(a.split)) if a.split else {}

t0 = time.time()
CD = a.cache or os.path.join(os.path.dirname(os.path.abspath(a.out)), f'fld_{a.res}_{a.sigma}_{a.rk}' + ('_x' if a.exact else ''))
os.makedirs(CD, exist_ok=True)
out_geoms = []; tot_hi = tot_lo = 0
only = re.compile(a.only) if a.only else None
for g in geoms:
    th, tl, h = budget(g['name'])
    if only and not only.search(g['name']):
        continue
    use_field = h > 0 and len(g['f']) > 0
    if use_field:
        o_ = OPT[g['name']]; cf = os.path.join(CD, re.sub(r'[^\w.-]', '_', g['name']) + f"_{h}_{o_['sigma']}_{o_['rk']}_{o_['rc']}.npz")
        if os.path.exists(cf):
            z = np.load(cf); fld = z['f'].astype(np.float32); lo = z['lo']
        else:
            v0, f0 = C.drop_small(g['v'], g['f'], 1.0 if len(g['f']) > 3000 else 0)
            o_ = OPT[g['name']]; fld, lo = field(v0, f0, h, o_['sigma'], o_['rk'], o_['rc'])
            np.savez_compressed(cf, f=fld.astype(np.float16), lo=lo)
        ve, fe = surface(fld, lo, h)
    else:
        ve, fe = g['v'], g['f']
    if tl > 0:
        vl, fl = mld(ve, fe, tl); vl, fl = compact(vl, fl)
    else:
        vl, fl = ve[:3], np.array([[0, 1, 2]], dtype=np.int64)
    # régions décimées séparément (budgets propres) : {geom: [[suffixe, expression, budget], ...]}
    regions = []
    if g['name'] in SPLIT:
        cen = ve[fe].mean(1); nrm, _ = face_normals(ve, fe)
        rest = np.ones(len(fe), bool)
        for suf, expr, bud in SPLIT[g['name']]:
            sel = rest & eval(expr, {'np': np}, {'c': cen, 'n': nrm, 'x': cen[:, 0], 'y': cen[:, 1], 'z': cen[:, 2], 'nx': nrm[:, 0], 'ny': nrm[:, 1], 'nz': nrm[:, 2]})
            regions.append((suf, sel, int(bud * a.k))); rest &= ~sel
        regions.append(('', rest, th))
    else:
        regions.append(('', np.ones(len(fe), bool), th))
    for suf, sel, bud in regions:
        if sel.sum() == 0: continue
        vs_, fs_ = compact(ve, fe[sel])
        vh, fh = mld(vs_, fs_, bud) if len(fs_) > bud else (vs_, fs_)
        vh, fh = compact(vh, fh)
        cn = corner_normals_field(vh, fh, fld, lo, h) if use_field else corner_normals_crease(vh, fh)
        if use_field and OPT[g['name']]['cadn']:
            v0, f0 = C.drop_small(g['v'], g['f'], 1.0 if len(g['f']) > 3000 else 0)
            cn = corner_normals_cad(vh, fh, v0, f0, h, cn)
        v2, f2b, n2 = split_vertices(vh, fh, cn)
        used = np.unique(f2b); remap = -np.ones(len(v2), dtype=np.int64); remap[used] = np.arange(len(used))
        v2 = v2[used]; n2 = n2[used]; f2b = remap[f2b]
        hi = C.pack(v2, f2b)
        haslo = tl > 0 and suf == ''
        lw = C.pack(vl, fl) if haslo else C.pack(vh[:3], np.array([[0, 1, 2]]))
        nm = g['name'] + (('@' + suf) if suf else '')
        tot_hi += len(f2b); tot_lo += len(fl) if haslo else 0
        out_geoms.append({'name': nm, 'mesh': g['mesh'], 'body': g['body'], 'rgba': g['rgba'], 'tri': int(len(f2b)),
                          'triLow': int(len(fl)) if haslo else 0,
                          'b': hi['b'], 'v': hi['v'], 'i': hi['i'], 'i32': hi['i32'],
                          'n': b64(np.clip(np.round(n2 * 127), -127, 127).astype(np.int8)),
                          'lb': lw['b'], 'lv': lw['v'], 'li': lw['i'], 'li32': lw['i32']})
        print(f"  {nm:<30} {g['body']:<22} env={len(fe):<7} hi={len(f2b):<6} verts={len(v2):<6} lo={len(fl) if haslo else 0}  t={time.time() - t0:.0f}s", flush=True)

bodies = {m.body(bi).name: [round(float(x), 3) for x in C.to_game(d.xpos[bi])] for bi in range(1, m.nbody)}
joints = {}
for ji in range(m.njnt):
    if m.jnt_type[ji] in (mujoco.mjtJoint.mjJNT_HINGE, mujoco.mjtJoint.mjJNT_SLIDE):
        ax = d.xaxis[ji]
        joints[m.joint(ji).name] = {'body': m.body(m.jnt_bodyid[ji]).name, 'p': [round(float(x), 3) for x in C.to_game(d.xanchor[ji])],
                                    'axis': [round(float(ax[0]), 4), round(float(ax[2]), 4), round(float(-ax[1]), 4)]}
src = 'MuJoCo Menagerie / apptronik_apollo (Apptronik)'; lic = 'Apache-2.0, © Apptronik'
data = {'id': 'apollo', 'src': src, 'license': lic,
        'unit': 'cm ; axes du jeu : X avant, Y haut, Z côté droit du robot ; pose de repos',
        'tri': tot_hi, 'triLow': tot_lo, 'bodies': bodies, 'joints': joints, 'geoms': out_geoms}
js = ("'use strict';\n"
      f"// Maillages officiels « apollo » — source : {src} — licence : {lic}\n"
      "// Générés depuis la CAO officielle : enveloppe extérieure (champ de distance), décimation quadrique, normales\n"
      "// transférées depuis la surface détaillée (champ 'n', int8) — ne pas modifier à la main.\n"
      "(window.RK_MESH = window.RK_MESH || {})[\"apollo\"] = " + json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n')
open(a.out, 'w', encoding='utf-8').write(js)
print(json.dumps({'geoms': len(out_geoms), 'tri': tot_hi, 'triLow': tot_lo, 'bytes': len(js), 'sec': round(time.time() - t0, 1)}))
