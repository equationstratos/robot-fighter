#!/usr/bin/env python3
"""Convertit les maillages visuels officiels d'un robot (fichier MJCF de MuJoCo Menagerie)
en un fichier JS compact chargé par le jeu : js/meshes/<id>.js  →  window.RK_MESH[<id>].

Usage (lancer avec python3 -I) :
  python3 -I tools/mjcf2rk.py <robot.xml> <sortie.js> --id h1 --budget 45000 --low 5000 \
      --license "BSD-3-Clause © Unitree" --src "mujoco_menagerie/unitree_h1" [--key home] [--exclude regex]

Chaque géométrie visuelle est placée dans la pose de repos (qpos0 ou un keyframe), convertie
dans les axes du jeu (X = avant, Y = haut, Z = côté droit du robot ; MuJoCo : x avant, y gauche, z haut)
et en centimètres, puis décimée (pyfqmr) et quantifiée (int16 sur la boîte englobante).
Deux niveaux : 'v'/'i' (détaillé, ~budget triangles au total) et 'lv'/'li' (images rémanentes, ~low).
Dépendances : mujoco, numpy, pyfqmr.
"""
import argparse, base64, json, re, sys
import numpy as np
import mujoco
import pyfqmr


def b64(a):
    return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode('ascii')


def to_game(p):
    """MuJoCo (x avant, y gauche, z haut, m) → jeu (X avant, Y haut, Z droite, cm)."""
    p = np.asarray(p, dtype=np.float64)
    return np.stack([p[..., 0], p[..., 2], -p[..., 1]], axis=-1) * 100.0


def area(v, f):
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    return float(np.linalg.norm(np.cross(b - a, c - a), axis=1).sum() * 0.5)


def components(nv, f):
    """Étiquette de composante connexe de chaque triangle (propagation du minimum + saut de pointeurs)."""
    lab = np.arange(nv)
    while True:
        mn = np.minimum(np.minimum(lab[f[:, 0]], lab[f[:, 1]]), lab[f[:, 2]])
        new = lab.copy()
        for k in range(3):
            np.minimum.at(new, f[:, k], mn)
        new = new[new]
        if np.array_equal(new, lab):
            break
        lab = new
    return lab[f[:, 0]]


def drop_small(v, f, min_diag):
    """Retire les petites pièces détachées (vis, écrous…) invisibles à l'échelle du jeu."""
    if min_diag <= 0 or len(f) == 0:
        return v, f
    comp = components(len(v), f)
    keep = np.zeros(len(f), dtype=bool)
    for c in np.unique(comp):
        sel = comp == c
        pts = v[np.unique(f[sel])]
        if np.linalg.norm(pts.max(axis=0) - pts.min(axis=0)) >= min_diag:
            keep |= sel
    if not keep.any():
        return v, f
    f = f[keep]
    used = np.unique(f)
    remap = -np.ones(len(v), dtype=np.int64); remap[used] = np.arange(len(used))
    return v[used], remap[f]


def cluster(v, f, cell):
    """Simplification par grille (regroupement de sommets) : toujours efficace, même sur la CAO."""
    key = np.floor(v / cell).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    n = inv.max() + 1
    acc = np.zeros((n, 3)); cnt = np.zeros(n)
    np.add.at(acc, inv, v); np.add.at(cnt, inv, 1)
    nv = acc / cnt[:, None]
    nf = inv[f]
    ok = (nf[:, 0] != nf[:, 1]) & (nf[:, 1] != nf[:, 2]) & (nf[:, 0] != nf[:, 2])
    nf = nf[ok]
    if len(nf):
        nf = np.unique(np.sort(nf, axis=1), axis=0, return_index=True)[1]
        nf = inv[f][ok][np.sort(nf)]
    return nv, nf


def fqmr(v, f, target):
    s = pyfqmr.Simplify()
    s.setMesh(v.astype(np.float64), f.astype(np.int32))
    s.simplify_mesh(target_count=int(target), aggressiveness=7, preserve_border=False, verbose=0)
    v2, f2, _ = s.getMesh()
    return v2.astype(np.float64), f2.astype(np.int64)


def decimate(v, f, target):
    if len(f) <= target or len(f) < 40:
        return v, f
    v2, f2 = fqmr(v, f, target)
    if len(f2) < 8:
        v2, f2 = v, f
    if len(f2) <= target * 1.25:
        return v2, f2
    # la CAO bloque souvent l'algorithme quadrique : grille de plus en plus grossière
    diag = float(np.linalg.norm(v.max(axis=0) - v.min(axis=0)))
    cell = diag / 400.0
    best = (v2, f2)
    for _ in range(40):
        cv, cf = cluster(v, f, cell)
        if len(cf) >= 8:
            best = (cv, cf)
        if len(cf) <= target * 1.6:
            break
        cell *= 1.25
    cv, cf = best
    if len(cf) > target:
        v3, f3 = fqmr(cv, cf, target)
        if len(f3) >= 8:
            cv, cf = v3, f3
    return cv, cf


def clean(v, f):
    """Supprime sommets dupliqués / triangles dégénérés (les STL ne partagent pas leurs sommets)."""
    key = np.round(v * 1e5).astype(np.int64)
    _, uniq, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    v = v[uniq]
    f = inv[f]
    ok = (f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 0] != f[:, 2])
    return v, f[ok]


def pack(v, f):
    lo, hi = v.min(axis=0), v.max(axis=0)
    span = np.maximum(hi - lo, 1e-6)
    q = np.round((v - lo) / span * 65535.0) - 32768
    q = np.clip(q, -32768, 32767).astype('<i2')
    idx = f.astype('<u2') if len(v) < 65536 else f.astype('<u4')
    return {'b': [round(float(x), 4) for x in list(lo) + list(hi)], 'v': b64(q), 'i': b64(idx), 'i32': int(len(v) >= 65536)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('xml'); ap.add_argument('out')
    ap.add_argument('--id', required=True)
    ap.add_argument('--budget', type=int, default=45000)
    ap.add_argument('--low', type=int, default=5000)
    ap.add_argument('--license', default='')
    ap.add_argument('--src', default='')
    ap.add_argument('--key', default='')
    ap.add_argument('--exclude', default='')
    ap.add_argument('--minpart', type=float, default=1.5, help='taille mini (cm) des pièces détachées conservées')
    a = ap.parse_args()

    m = mujoco.MjModel.from_xml_path(a.xml)
    d = mujoco.MjData(m)
    if a.key:
        k = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_KEY, a.key)
        if k < 0:
            sys.exit('keyframe inconnu: ' + a.key)
        d.qpos[:] = m.key_qpos[k]
    mujoco.mj_forward(m, d)

    exclude = re.compile(a.exclude) if a.exclude else None
    geoms = []
    for gi in range(m.ngeom):
        if m.geom_type[gi] != mujoco.mjtGeom.mjGEOM_MESH:
            continue
        if m.geom_group[gi] >= 3:  # collision
            continue
        if m.geom_rgba[gi][3] == 0 and m.geom_matid[gi] < 0:
            continue
        mid = m.geom_dataid[gi]
        body = m.body(m.geom_bodyid[gi]).name
        gname = m.geom(gi).name or m.mesh(mid).name
        if exclude and (exclude.search(gname) or exclude.search(body)):
            continue
        va, vn = m.mesh_vertadr[mid], m.mesh_vertnum[mid]
        fa, fn = m.mesh_faceadr[mid], m.mesh_facenum[mid]
        v = m.mesh_vert[va:va + vn].astype(np.float64)
        f = m.mesh_face[fa:fa + fn].astype(np.int64)
        R = d.geom_xmat[gi].reshape(3, 3)
        w = v @ R.T + d.geom_xpos[gi]
        w = to_game(w)
        rgba = m.mat_rgba[m.geom_matid[gi]] if m.geom_matid[gi] >= 0 else m.geom_rgba[gi]
        w, f = clean(w, f)
        base, n = gname, 2
        while any(g['name'] == gname for g in geoms):
            gname = f'{base}#{n}'; n += 1
        geoms.append({'name': gname, 'mesh': m.mesh(mid).name, 'body': body, 'rgba': [round(float(x), 3) for x in rgba], 'v': w, 'f': f})

    if not geoms:
        sys.exit('aucune géométrie visuelle')
    # répartition du budget : surface^0.6 × triangles^0.4
    wts = np.array([max(area(g['v'], g['f']), 1e-3) ** 0.6 * max(len(g['f']), 1) ** 0.4 for g in geoms])
    wts = wts / wts.sum()
    out_geoms = []
    tot_hi = tot_lo = 0
    for g, wt in zip(geoms, wts):
        th = max(60, int(a.budget * wt)); tl = max(16, int(a.low * wt))
        diag = float(np.linalg.norm(g['v'].max(axis=0) - g['v'].min(axis=0)))
        vh, fh = drop_small(g['v'], g['f'], a.minpart)
        vh, fh = decimate(vh, fh, th)
        vl, fl = drop_small(g['v'], g['f'], max(a.minpart * 3, diag * 0.18))
        vl, fl = decimate(vl, fl, tl)
        tot_hi += len(fh); tot_lo += len(fl)
        hi = pack(vh, fh); lo = pack(vl, fl)
        out_geoms.append({'name': g['name'], 'mesh': g['mesh'], 'body': g['body'], 'rgba': g['rgba'], 'tri': int(len(fh)),
                          'b': hi['b'], 'v': hi['v'], 'i': hi['i'], 'i32': hi['i32'],
                          'lb': lo['b'], 'lv': lo['v'], 'li': lo['i'], 'li32': lo['i32']})

    bodies = {}
    for bi in range(1, m.nbody):
        bodies[m.body(bi).name] = [round(float(x), 3) for x in to_game(d.xpos[bi])]
    joints = {}
    for ji in range(m.njnt):
        if m.jnt_type[ji] in (mujoco.mjtJoint.mjJNT_HINGE, mujoco.mjtJoint.mjJNT_SLIDE):
            ax = d.xaxis[ji]
            joints[m.joint(ji).name] = {'body': m.body(m.jnt_bodyid[ji]).name,
                                        'p': [round(float(x), 3) for x in to_game(d.xanchor[ji])],
                                        'axis': [round(float(ax[0]), 4), round(float(ax[2]), 4), round(float(-ax[1]), 4)]}
    data = {'id': a.id, 'src': a.src, 'license': a.license,
            'unit': 'cm ; axes du jeu : X avant, Y haut, Z côté droit du robot ; pose de repos',
            'tri': tot_hi, 'triLow': tot_lo, 'bodies': bodies, 'joints': joints, 'geoms': out_geoms}
    js = ("'use strict';\n"
          f"// Maillages officiels « {a.id} » — source : {a.src} — licence : {a.license}\n"
          "// Généré par tools/mjcf2rk.py (ne pas modifier à la main).\n"
          f"(window.RK_MESH = window.RK_MESH || {{}})[{json.dumps(a.id)}] = " + json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n')
    with open(a.out, 'w', encoding='utf-8') as fo:
        fo.write(js)
    summary = {'geoms': len(out_geoms), 'tri': tot_hi, 'triLow': tot_lo, 'bytes': len(js)}
    print(json.dumps(summary))
    for g in out_geoms:
        print(f"  {g['name']:<34} body={g['body']:<28} tri={g['tri']:<6} rgba={g['rgba']}")


if __name__ == '__main__':
    main()
