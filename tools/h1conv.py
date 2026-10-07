"""Conversion H1 (même format que tools/mjcf2rk.py) avec budgets par géométrie et décimation
robuste (soudure par grille fine puis quadrique) pour les maillages CAO où pyfqmr se bloque.
Usage : python3 -I tools/h1conv.py <menagerie>/unitree_h1/h1.xml js/meshes/h1.js [scale_budget]"""
import os, sys, json, numpy as np, importlib.util, mujoco
spec = importlib.util.spec_from_file_location('m2r', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mjcf2rk.py'))
m2r = importlib.util.module_from_spec(spec); spec.loader.exec_module(m2r)

HI = {'torso_link': 6200, 'logo_link': 1100, 'pelvis': 1400,
      'hip_yaw_link': 1150, 'hip_roll_link': 1000, 'hip_pitch_link': 2000, 'knee_link': 2000, 'ankle_link': 800,
      'shoulder_pitch_link': 1000, 'shoulder_roll_link': 1000, 'shoulder_yaw_link': 1500, 'elbow_link': 1200}
LO = {'torso_link': 700, 'logo_link': 0, 'pelvis': 160,
      'hip_yaw_link': 110, 'hip_roll_link': 110, 'hip_pitch_link': 240, 'knee_link': 240, 'ankle_link': 90,
      'shoulder_pitch_link': 110, 'shoulder_roll_link': 90, 'shoulder_yaw_link': 180, 'elbow_link': 150}

def key(name):
    for k in HI:
        if name.endswith(k): return k
    raise KeyError(name)

def decimate(v, f, target):
    if len(f) <= target or len(f) < 40:
        return v, f
    v2, f2 = m2r.fqmr(v, f, target)
    if len(f2) <= target * 1.08 and len(f2) >= 8:
        return v2, f2
    diag = float(np.linalg.norm(v.max(axis=0) - v.min(axis=0)))
    best = (v2, f2)
    for div in (4000, 2500, 1600, 1000, 700, 500, 350, 250, 170, 120, 80, 55, 40):
        cv, cf = m2r.cluster(v, f, diag / div)
        if len(cf) < 8: continue
        v3, f3 = m2r.fqmr(cv, cf, target)
        if len(f3) >= 8 and len(f3) < len(best[1]):
            best = (v3, f3)
        if len(f3) <= target * 1.08:
            break
    return best

def fqmr_b(v, f, target):
    import pyfqmr
    sm = pyfqmr.Simplify()
    sm.setMesh(v.astype(np.float64), f.astype(np.int32))
    sm.simplify_mesh(target_count=int(target), aggressiveness=7, preserve_border=True, verbose=0)
    v2, f2, _ = sm.getMesh()
    return v2.astype(np.float64), f2.astype(np.int64)

def sub(v, f, mask):
    ff = f[mask]; used = np.unique(ff)
    remap = -np.ones(len(v), dtype=np.int64); remap[used] = np.arange(len(used))
    return v[used], remap[ff]

# coffre : décimation par régions (tête / carters d'épaule / coffre), bords préservés → pas de fissures
REGIONS = {'torso_link': [('head', 5000), ('sh', 1200), ('box', 1700)]}
def region_of(c):
    y, z = c[:, 1], c[:, 2]
    r = np.full(len(c), 'box', dtype=object)
    r[(np.abs(z) > 10.6) & (y > 141.5) & (y < 155.5)] = 'sh'
    r[y > 153.6] = 'head'
    return r

def decimate_regions(v, f, spec):
    c = (v[f[:, 0]] + v[f[:, 1]] + v[f[:, 2]]) / 3
    reg = region_of(c)
    vs, fs, off = [], [], 0
    for name, tgt in spec:
        sv, sf = sub(v, f, reg == name)
        if len(sf) > tgt:
            dv, df = fqmr_b(sv, sf, tgt)
            if len(df) > tgt * 1.15:  # bloqué : soudure fine puis quadrique
                diag = float(np.linalg.norm(sv.max(0) - sv.min(0)))
                cv, cf = m2r.cluster(sv, sf, diag / 2000)
                dv, df = fqmr_b(cv, cf, tgt)
        else:
            dv, df = sv, sf
        print('     region', name, len(sf), '->', len(df))
        vs.append(dv); fs.append(df + off); off += len(dv)
    return np.concatenate(vs), np.concatenate(fs)

def main():
    xml, out = sys.argv[1], sys.argv[2]
    mul = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
    m = mujoco.MjModel.from_xml_path(xml); d = mujoco.MjData(m); mujoco.mj_forward(m, d)
    out_geoms = []; tot_hi = tot_lo = 0
    for gi in range(m.ngeom):
        if m.geom_type[gi] != mujoco.mjtGeom.mjGEOM_MESH or m.geom_group[gi] >= 3: continue
        if m.geom_rgba[gi][3] == 0 and m.geom_matid[gi] < 0: continue
        mid = m.geom_dataid[gi]
        body = m.body(m.geom_bodyid[gi]).name
        gname = m.geom(gi).name or m.mesh(mid).name
        va, vn = m.mesh_vertadr[mid], m.mesh_vertnum[mid]; fa, fn = m.mesh_faceadr[mid], m.mesh_facenum[mid]
        v = m.mesh_vert[va:va + vn].astype(np.float64); f = m.mesh_face[fa:fa + fn].astype(np.int64)
        R = d.geom_xmat[gi].reshape(3, 3)
        w = m2r.to_game(v @ R.T + d.geom_xpos[gi])
        rgba = m.mat_rgba[m.geom_matid[gi]] if m.geom_matid[gi] >= 0 else m.geom_rgba[gi]
        w, f = m2r.clean(w, f)
        kk = key(gname)
        th = int(HI[kk] * mul); tl = LO[kk]
        diag = float(np.linalg.norm(w.max(axis=0) - w.min(axis=0)))
        vh, fh = m2r.drop_small(w, f, 0.6)
        vh, fh = decimate_regions(vh, fh, REGIONS[kk]) if (kk in REGIONS and mul == 1.0) else decimate(vh, fh, th)
        if tl > 0:
            vl, fl = m2r.drop_small(w, f, max(4.5, diag * 0.18))
            vl, fl = decimate(vl, fl, tl)
        else:
            vl, fl = vh[:3], np.array([[0, 1, 2]])
        tot_hi += len(fh); tot_lo += len(fl) if tl > 0 else 0
        hi = m2r.pack(vh, fh); lo = m2r.pack(vl, fl)
        out_geoms.append({'name': gname, 'mesh': m.mesh(mid).name, 'body': body, 'rgba': [round(float(x), 3) for x in rgba], 'tri': int(len(fh)),
                          'b': hi['b'], 'v': hi['v'], 'i': hi['i'], 'i32': hi['i32'],
                          'lb': lo['b'], 'lv': lo['v'], 'li': lo['i'], 'li32': lo['i32']})
        print(f'  {gname:<30} {len(f):6d} -> {len(fh):5d}  low {len(fl):4d}')
    bodies = {}
    for bi in range(1, m.nbody):
        bodies[m.body(bi).name] = [round(float(x), 3) for x in m2r.to_game(d.xpos[bi])]
    joints = {}
    for ji in range(m.njnt):
        if m.jnt_type[ji] in (mujoco.mjtJoint.mjJNT_HINGE, mujoco.mjtJoint.mjJNT_SLIDE):
            ax = d.xaxis[ji]
            joints[m.joint(ji).name] = {'body': m.body(m.jnt_bodyid[ji]).name,
                                        'p': [round(float(x), 3) for x in m2r.to_game(d.xanchor[ji])],
                                        'axis': [round(float(ax[0]), 4), round(float(ax[2]), 4), round(float(-ax[1]), 4)]}
    lic = 'BSD-3-Clause, © 2016-2023 Unitree Robotics'; src = 'MuJoCo Menagerie / unitree_h1 (Unitree Robotics)'
    data = {'id': 'h1', 'src': src, 'license': lic,
            'unit': 'cm ; axes du jeu : X avant, Y haut, Z côté droit du robot ; pose de repos',
            'tri': tot_hi, 'triLow': tot_lo, 'bodies': bodies, 'joints': joints, 'geoms': out_geoms}
    js = ("'use strict';\n"
          f"// Maillages officiels « h1 » — source : {src} — licence : {lic}\n"
          "// Généré par tools/h1conv.py (format de tools/mjcf2rk.py ; budgets par pièce + décimation robuste) — ne pas modifier à la main.\n"
          "(window.RK_MESH = window.RK_MESH || {})[\"h1\"] = " + json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n')
    open(out, 'w', encoding='utf-8').write(js)
    print(json.dumps({'tri': tot_hi, 'triLow': tot_lo, 'bytes': len(js), 'joints': len(joints)}))

main()
