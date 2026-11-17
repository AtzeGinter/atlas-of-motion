"""Exercise-animation rig (prototype). Run after meta.py (needs meta2.json); outputs are committed like build.py's:
  tools/rig.json          segments (pivot = proximal joint centre, parent, side) derived from the bone meshes
  ../geo/skin-<level>.bin per-vertex skin weights of every mesh for every quality level (gzip, mtime=0)
Deterministic: same inputs give byte-identical outputs. Needs numpy + scipy (cKDTree). See docs/animation-design.md."""
import json, os, gzip, sys
import numpy as np
from scipy.spatial import cKDTree

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.join(here, '..')
meta = json.load(open(os.path.join(here, 'meta2.json'), encoding='utf-8'))
ROWS, DB = meta['meshes'], meta['db']
LO, SPAN = np.array(meta['lo']), np.array(meta['span'])
TISSUE = 'Connective tissue'


def decode(level):
    """Decode ../geo/<level>.bin exactly like decodeLod() in template.html -> list of (positions (nv,3) float64, faces (nf,3))."""
    L = meta['lod'][level]
    u = np.frombuffer(gzip.decompress(open(os.path.join(root, L['file'].split('?')[0]), 'rb').read()), dtype='<u2').astype(np.int64)
    out, p = [], 0
    def stream(n):
        nonlocal p
        z = u[p:p + n]; p += n
        return np.cumsum((z >> 1) ^ -(z & 1)) & 0xFFFF
    for nv, nf in L['counts']:
        pos = np.stack([LO[c] + stream(nv) * (SPAN[c] / 65535) for c in range(3)], 1)
        ind = stream(nf * 3).reshape(-1, 3)
        out.append((pos, ind))
    assert p == len(u), level
    return out


# ---------- segments ----------
SEGS = ['pelvis', 'lumbar', 'chest', 'neck', 'head']
for s in 'LR':
    SEGS += ['clav' + s, 'arm' + s, 'fore' + s, 'hand' + s, 'thigh' + s, 'shank' + s, 'foot' + s]
SI = {n: i for i, n in enumerate(SEGS)}
PARENT = {'pelvis': None, 'lumbar': 'pelvis', 'chest': 'lumbar', 'neck': 'chest', 'head': 'neck'}
for s in 'LR':
    PARENT.update({'clav' + s: 'chest', 'arm' + s: 'clav' + s, 'fore' + s: 'arm' + s, 'hand' + s: 'fore' + s,
                   'thigh' + s: 'pelvis', 'shank' + s: 'thigh' + s, 'foot' + s: 'shank' + s})
TRUNK = ('pelvis', 'lumbar', 'chest')

SKULL = {'frontal bone', 'parietal bone', 'occipital bone', 'temporal bone', 'sphenoid bone', 'ethmoid', 'maxilla', 'mandible',
         'nasal bone', 'lacrimal bone', 'zygomatic bone', 'palatine bone', 'vomer'}
HANDB = {'scaphoid', 'lunate', 'pisiform', 'trapezium', 'trapezoid', 'capitate', 'hamate'}
FOOTB = {'talus', 'calcaneus', 'cuboid bone', 'navicular bone (foot)', 'medial cuneiform bone', 'intermediate cuneiform bone',
         'lateral cuneiform bone', 'sesamoid bone (foot)'}


def bone_seg(key, side):
    """Bone key + side -> segment name (every bone is rigid to one segment)."""
    if key in SKULL: return 'head'
    if key in ('atlas', 'axis', 'hyoid bone') or 'cervical vertebra' in key: return 'neck'
    if 'thoracic vertebra' in key or key.endswith(' rib') or key in ('manubrium', 'body of sternum', 'xiphoid process'): return 'chest'
    if 'lumbar vertebra' in key: return 'lumbar'
    if key == 'hip bone': return 'pelvis'
    m = {'clavicle': 'clav', 'scapula': 'clav', 'humerus': 'arm', 'radius': 'fore', 'ulna': 'fore', 'femur': 'thigh',
         'tibia': 'shank', 'fibula': 'shank', 'patella': 'shank'}
    if key in m: return m[key] + side
    if key in HANDB or 'metacarpal' in key or ('phalanx' in key and ('finger' in key or 'thumb' in key)): return 'hand' + side
    if key in FOOTB or 'metatarsal' in key or ('phalanx' in key and 'toe' in key): return 'foot' + side
    raise KeyError('no segment for bone ' + key)


def mesh_side(row, pos):
    """Side from where the mesh is (the source labels one muscle pair with the wrong side); '' = midline / unsided."""
    if not row[2]: return ''
    cx = (pos[:, 0].min() + pos[:, 0].max()) / 2
    return 'L' if cx > 0 else 'R'


# allowed segments of a muscle / tissue mesh, from its group (or key for connective tissue); 'S' = the mesh's side
GROUP_SEGS = {
    'Face': ['head'], 'Eye': ['head'], 'Jaw': ['head'],
    'Neck': ['neck', 'head', 'chest', 'clavL', 'clavR'], 'Throat': ['neck', 'head', 'chest'],
    'Back': ['pelvis', 'lumbar', 'chest', 'neck', 'head', 'clavS', 'armS'],
    'Shoulder': ['chest', 'clavS', 'armS'], 'Chest': ['chest', 'lumbar', 'clavS', 'armS'],
    'Abdomen': ['pelvis', 'lumbar', 'chest'], 'Pelvic floor': ['pelvis'],
    'Upper arm': ['clavS', 'armS', 'foreS'], 'Forearm': ['armS', 'foreS', 'handS'], 'Hand': ['foreS', 'handS'],
    'Hip': ['pelvis', 'lumbar', 'thighS'], 'Thigh': ['pelvis', 'thighS', 'shankS'], 'Lower leg': ['thighS', 'shankS', 'footS'],
    'Foot': ['shankS', 'footS'],
}
TISSUE_SEGS = {
    'calcaneal tendon': ['shankS', 'footS'], 'flexor retinaculum of wrist': ['foreS', 'handS'], 'iliotibial tract': ['pelvis', 'thighS', 'shankS'],
    'interosseous membrane of forearm': ['foreS'], 'interosseous membrane of leg': ['shankS'], 'long plantar ligament': ['footS'],
    'thoracolumbar fascia': ['pelvis', 'lumbar', 'chest'], 'tendinous arch of levator ani': ['pelvis'],
    'arytenoid cartilage': ['neck'], 'median cricothyroid ligament': ['neck'], 'intermediate tendon': ['neck', 'head'],
    'tendon of levator palpebrae superioris': ['head'],
}
# muscles whose group does not tell the whole story
KEY_SEGS = {
    'psoas major': ['lumbar', 'pelvis', 'thighS'], 'psoas minor': ['lumbar', 'pelvis'], 'quadratus lumborum': ['pelvis', 'lumbar', 'chest'],
    'latissimus dorsi': ['pelvis', 'lumbar', 'chest', 'armS'], 'serratus anterior': ['chest', 'clavS'],
    'pectoralis minor': ['chest', 'clavS'], 'subclavius': ['chest', 'clavS'], 'diaphragm': ['chest', 'lumbar'],
    'trapezius': ['chest', 'neck', 'head', 'clavS'], 'levator scapulae': ['neck', 'clavS'], 'rhomboid major': ['chest', 'clavS'],
    'rhomboid minor': ['chest', 'neck', 'clavS'], 'sternocleidomastoid': ['chest', 'neck', 'head', 'clavS'],
    'omohyoid': ['neck', 'clavS'],
}


def allowed(row, side):
    k = row[1]; g = DB[k]['g']
    lst = KEY_SEGS.get(k) or (TISSUE_SEGS.get(k) if g == TISSUE else None) or GROUP_SEGS.get(g)
    if lst is None: raise KeyError('no segment list for ' + k)
    out = []
    for s in lst:
        if s.endswith('S'):
            out += [s[:-1] + side] if side else [s[:-1] + 'L', s[:-1] + 'R']
        else:
            out.append(s)
    return [SI[s] for s in dict.fromkeys(out)]


# ---------- joint centres ----------
def sphere_fit(p):
    A = np.c_[2 * p, np.ones(len(p))]
    b = (p ** 2).sum(1)
    c = np.linalg.lstsq(A, b, rcond=None)[0]
    return c[:3], np.sqrt(c[3] + (c[:3] ** 2).sum())


def joints(geo):
    B = {}
    for (kind, key, side, part), (pos, ind) in zip(ROWS, geo):
        if kind != 'b': continue
        s = mesh_side([kind, key, side], pos)
        B.setdefault((key, s), []).append(pos)
    B = {k: np.concatenate(v) for k, v in B.items()}
    J = {}
    for s, sg in (('L', 1), ('R', -1)):
        f = B[('femur', s)]
        top = f[f[:, 1] > f[:, 1].max() - 0.06]
        head = top[sg * top[:, 0] < np.median(sg * top[:, 0])]          # medial half of the top = femoral head
        hc, hr = sphere_fit(head[head[:, 1] > head[:, 1].max() - 0.035])
        J['hip' + s] = hc
        ymin = f[:, 1].min(); cond = f[f[:, 1] < ymin + 0.03]
        t = B[('tibia', s)]; plat = t[t[:, 1] > t[:, 1].max() - 0.015]
        J['knee' + s] = np.array([cond[:, 0].mean(), (ymin + 0.022 + plat[:, 1].mean()) / 2 + 0.005, cond[:, 2].mean()])
        fi = B[('fibula', s)]
        med = t[t[:, 1] < t[:, 1].min() + 0.01].mean(0); lat = fi[fi[:, 1] < fi[:, 1].min() + 0.01].mean(0)
        a = (med + lat) / 2; a[1] += 0.012
        J['ankle' + s] = a
        h = B[('humerus', s)]
        top = h[h[:, 1] > h[:, 1].max() - 0.05]
        head = top[sg * top[:, 0] < np.median(sg * top[:, 0]) + 0.005]
        sc, sr = sphere_fit(head[head[:, 1] > head[:, 1].max() - 0.03])
        J['shoulder' + s] = sc
        ymin = h[:, 1].min(); d = h[h[:, 1] < ymin + 0.025]
        J['elbow' + s] = np.array([d[:, 0].mean(), ymin + 0.014, d[:, 2].mean()])
        J['wrist' + s] = np.concatenate([B[(k, s)] for k in ('lunate', 'scaphoid')]).mean(0)
        c = B[('clavicle', s)]; mi = c[np.argsort(sg * c[:, 0])[:max(8, len(c) // 20)]]
        J['sc' + s] = mi.mean(0)
        J['_hr' + s] = hr; J['_sr' + s] = sr
    def body(k):
        v = B[(k, '')]
        front = v[v[:, 2] > np.percentile(v[:, 2], 55)]        # the vertebral body is the anterior part
        return front
    l5 = body('fifth lumbar vertebra'); l1 = body('first lumbar vertebra'); t1 = body('first thoracic vertebra')
    J['l5s1'] = np.array([0, l5[:, 1].min() + 0.004, l5[:, 2].mean()])
    t12 = body('twelfth thoracic vertebra')
    J['t12l1'] = np.array([0, (t12[:, 1].min() + l1[:, 1].max()) / 2, (t12[:, 2].mean() + l1[:, 2].mean()) / 2])
    c7 = body('seventh cervical vertebra')
    J['c7t1'] = np.array([0, (c7[:, 1].min() + t1[:, 1].max()) / 2, (c7[:, 2].mean() + t1[:, 2].mean()) / 2])
    at = B[('atlas', '')]
    J['occ'] = np.array([0, at[:, 1].max(), at[:, 2].mean()])
    J['pelvis'] = (J['hipL'] + J['hipR']) / 2
    return J, B


PIVOT = {'pelvis': 'pelvis', 'lumbar': 'l5s1', 'chest': 't12l1', 'neck': 'c7t1', 'head': 'occ'}
for s in 'LR':
    PIVOT.update({'clav' + s: 'sc' + s, 'arm' + s: 'shoulder' + s, 'fore' + s: 'elbow' + s, 'hand' + s: 'wrist' + s,
                  'thigh' + s: 'hip' + s, 'shank' + s: 'knee' + s, 'foot' + s: 'ankle' + s})


SIGMA = 0.018          # soft-min width (m): the blend band is where the distances to two bones differ by less than ~2 sigma
BAND = {'l5s1': 0.045, 't12l1': 0.06}   # half widths of the trunk height bands


def smooth01(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def skin_level(geo, trees, J):
    """-> list of (idx0, idx1, w0) uint8 arrays per mesh."""
    out = []
    ytl, ytc = J['l5s1'][1], J['t12l1'][1]
    tri = [SI[s] for s in TRUNK]
    for row, (pos, ind) in zip(ROWS, geo):
        nv = len(pos)
        side = mesh_side(row, pos)
        if row[0] == 'b':
            s = SI[bone_seg(row[1], side)]
            out.append((np.full(nv, s, np.uint8), np.full(nv, s, np.uint8), np.full(nv, 255, np.uint8)))
            continue
        al = allowed(row, side)
        W = np.zeros((nv, len(SEGS)))
        ta = [s for s in al if s in tri]; la = [s for s in al if s not in tri]
        cols, D = [], []
        if ta:   # trunk as one block: distance to the nearest trunk bone
            D.append(np.min([trees[s].query(pos)[0] for s in ta], 0)); cols.append('T')
        for s in la:
            D.append(trees[s].query(pos)[0]); cols.append(s)
        D = np.array(D)
        E = np.exp(-(D - D.min(0)) / SIGMA)
        E /= E.sum(0)
        for c, e in zip(cols, E):
            if c != 'T':
                W[:, c] = e; continue
            y = pos[:, 1]
            up1 = smooth01((y - (ytl - BAND['l5s1'])) / (2 * BAND['l5s1']))     # 0 below L5/S1 band, 1 above
            up2 = smooth01((y - (ytc - BAND['t12l1'])) / (2 * BAND['t12l1']))
            tw = np.stack([1 - up1, up1 * (1 - up2), up2], 1)                  # pelvis, lumbar, chest
            mask = np.array([s in ta for s in tri], float)
            tw = tw * mask
            ssum = tw.sum(1)
            if (ssum <= 1e-9).any():   # height outside the allowed trunk segments: nearest allowed one
                best = np.argmin([trees[s].query(pos)[0] if s in ta else np.full(nv, 9.0) for s in tri], 0)
                z = ssum <= 1e-9
                tw[z] = 0; tw[z, best[z]] = 1; ssum = tw.sum(1)
            tw /= ssum[:, None]
            for k, s in enumerate(tri): W[:, s] += e * tw[:, k]
        o = np.argsort(-W, 1, kind='stable')
        i0, i1 = o[:, 0], o[:, 1]
        w0 = W[np.arange(nv), i0]; w1 = W[np.arange(nv), i1]
        q = np.round(255 * w0 / (w0 + w1)).astype(np.int64)
        i1 = np.where(q >= 255, i0, i1)
        out.append((i0.astype(np.uint8), i1.astype(np.uint8), np.clip(q, 0, 255).astype(np.uint8)))
    return out


def write_skin(level, sk):
    buf = b''.join(a.tobytes() + b.tobytes() + c.tobytes() for a, b, c in sk)
    data = gzip.compress(buf, 9, mtime=0)
    open(os.path.join(root, 'geo', 'skin-' + level + '.bin'), 'wb').write(data)
    return len(buf), len(data)


def extra_points(B):
    """grip (between the metacarpal heads, toward the palm) and toe (metatarsal heads) per side, for props and contacts."""
    P = {}
    for s in 'LR':
        mh = []
        for k in ('second', 'third', 'fourth', 'fifth'):
            m = B[(k + ' metacarpal bone', s)]
            mh.append(m[m[:, 1] < m[:, 1].min() + 0.008].mean(0))
        g = np.mean(mh, 0); g[2] += 0.012
        P['grip' + s] = g
        th = []
        for k in ('first', 'second', 'third', 'fourth', 'fifth'):
            m = B[(k + ' metatarsal bone', s)]
            th.append(m[m[:, 2] > m[:, 2].max() - 0.008].mean(0))
        P['toe' + s] = np.mean(th, 0)
    return P


if __name__ == '__main__':
    geo = decode('medium')
    J, B = joints(geo)
    J.update(extra_points(B))
    segbones = {}
    for (k, s), v in B.items(): segbones.setdefault(SI[bone_seg(k, s)], []).append(v)
    trees = {s: cKDTree(np.concatenate(v)) for s, v in sorted(segbones.items())}
    r4 = lambda a: [round(float(x), 4) for x in a]
    rig = {'v': 1, 'seg': [{'n': n, 'p': SI[PARENT[n]] if PARENT[n] else -1, 'j': r4(J[PIVOT[n]])} for n in SEGS],
           'pt': {k: r4(J[k]) for k in sorted(J) if not k.startswith('_')}, 'sigma': SIGMA}
    d = lambda o: json.dumps(o, separators=(', ', ': '))
    txt = ('{"v": 1, "sigma": %s,\n "seg": [\n' % SIGMA + ',\n'.join('  ' + d(x) for x in rig['seg']) + '\n ],\n "pt": {\n'
           + ',\n'.join('  %s: %s' % (json.dumps(k), d(v)) for k, v in rig['pt'].items()) + '\n }\n}\n')
    assert json.loads(txt) == rig
    open(os.path.join(here, 'rig.json'), 'w', encoding='utf-8', newline='\n').write(txt)
    print('rig.json:', len(SEGS), 'segments')
    for lv in ('low', 'medium', 'high'):
        g = geo if lv == 'medium' else decode(lv)
        raw, gz = write_skin(lv, skin_level(g, trees, J))
        print('skin-%s.bin: %d vertices, %.0f kB gzip (%.0f kB raw)' % (lv, raw // 3, gz / 1e3, raw / 1e3))
