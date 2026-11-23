"""Exercise-animation rig. Run after meta.py (needs meta2.json); outputs are committed like build.py's:
  tools/rig.json          segments (pivot = proximal joint centre, parent, optional joint axis / grip angle) derived from the bone meshes
  ../geo/skin-<level>.bin per-vertex skin weights of every mesh for every quality level (gzip, mtime=0)
Deterministic: same inputs give byte-identical outputs. Needs numpy + scipy (cKDTree). See docs/animation-design.md."""
import json, os, gzip, math
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
# Order matters: body and limb segments first (22), finger segments last (30), so a device whose vertex-uniform budget is too small
# for 52 segments can drop the fingers (the runtime maps them to their hand) and keep a contiguous uniform array.
SEGS = ['pelvis', 'lumbar', 'thorax', 'chest', 'neck', 'head']
for s in 'LR':
    SEGS += [n + s for n in ('clav', 'arm', 'fore', 'rad', 'hand', 'thigh', 'shank', 'foot')]
FINGERS = {'th': 'thumb', 'f2': 'index finger', 'f3': 'middle finger', 'f4': 'ring finger', 'f5': 'little finger'}
FPH = {'th': ('m', 'p', 'd'), 'f2': ('p', 'm', 'd'), 'f3': ('p', 'm', 'd'), 'f4': ('p', 'm', 'd'), 'f5': ('p', 'm', 'd')}   # thumb: metacarpal, proximal, distal
for s in 'LR':
    for f in FINGERS:
        SEGS += [f + ph + s for ph in FPH[f]]
NBODY = SEGS.index('thmL')
SI = {n: i for i, n in enumerate(SEGS)}
PARENT = {'pelvis': None, 'lumbar': 'pelvis', 'thorax': 'lumbar', 'chest': 'thorax', 'neck': 'chest', 'head': 'neck'}
for s in 'LR':
    PARENT.update({'clav' + s: 'chest', 'arm' + s: 'clav' + s, 'fore' + s: 'arm' + s, 'rad' + s: 'fore' + s, 'hand' + s: 'rad' + s,
                   'thigh' + s: 'pelvis', 'shank' + s: 'thigh' + s, 'foot' + s: 'shank' + s})
    for f in FINGERS:
        a, b, c = (f + ph + s for ph in FPH[f])
        PARENT.update({a: 'hand' + s, b: a, c: b})
TRUNK = ('pelvis', 'lumbar', 'thorax', 'chest')
FINGER_SEGS = {s: [n for n in SEGS[NBODY:] if n.endswith(s)] for s in 'LR'}

SKULL = {'frontal bone', 'parietal bone', 'occipital bone', 'temporal bone', 'sphenoid bone', 'ethmoid', 'maxilla', 'mandible',
         'nasal bone', 'lacrimal bone', 'zygomatic bone', 'palatine bone', 'vomer'}
HANDB = {'scaphoid', 'lunate', 'pisiform', 'trapezium', 'trapezoid', 'capitate', 'hamate'}
FOOTB = {'talus', 'calcaneus', 'cuboid bone', 'navicular bone (foot)', 'medial cuneiform bone', 'intermediate cuneiform bone',
         'lateral cuneiform bone', 'sesamoid bone (foot)'}
ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth']
UPPER_RIBS = 7          # ribs 1-7 and the sternum ride with the upper thoracic segment ("chest", pivot T6/T7); ribs 8-12 with "thorax"


def bone_seg(key, side):
    """Bone key + side -> segment name (every bone is rigid to one segment)."""
    if key in SKULL: return 'head'
    if key in ('atlas', 'axis', 'hyoid bone') or 'cervical vertebra' in key: return 'neck'
    if 'thoracic vertebra' in key: return 'chest' if ORD.index(key.split()[0]) < 6 else 'thorax'
    if key.endswith(' rib'): return 'chest' if ORD.index(key.split()[0]) < UPPER_RIBS else 'thorax'
    if key in ('manubrium', 'body of sternum', 'xiphoid process'): return 'chest'
    if 'lumbar vertebra' in key: return 'lumbar'
    if key == 'hip bone': return 'pelvis'
    m = {'clavicle': 'clav', 'scapula': 'clav', 'humerus': 'arm', 'radius': 'rad', 'ulna': 'fore', 'femur': 'thigh',
         'tibia': 'shank', 'fibula': 'shank', 'patella': 'shank'}
    if key in m: return m[key] + side
    if key == 'first metacarpal bone': return 'thm' + side
    for f, nm in FINGERS.items():
        if 'phalanx of ' + nm in key:
            ph = {'proximal': 'p', 'middle': 'm', 'distal': 'd'}[key.split()[0]]
            return f + ph + side
    if key in HANDB or 'metacarpal' in key: return 'hand' + side
    if key in FOOTB or 'metatarsal' in key or ('phalanx' in key and 'toe' in key): return 'foot' + side
    raise KeyError('no segment for bone ' + key)


def mesh_side(row, pos):
    """Side from where the mesh is (the source labels one muscle pair with the wrong side); '' = midline / unsided."""
    if not row[2]: return ''
    cx = (pos[:, 0].min() + pos[:, 0].max()) / 2
    return 'L' if cx > 0 else 'R'


# allowed segments of a muscle / tissue mesh, from its group (or key for connective tissue); 'S' = the mesh's side, 'fingS' = its 15 finger segments
TR = ['pelvis', 'lumbar', 'thorax', 'chest']
GROUP_SEGS = {
    'Face': ['head'], 'Eye': ['head'], 'Jaw': ['head'],
    'Neck': ['neck', 'head', 'chest', 'clavL', 'clavR'], 'Throat': ['neck', 'head', 'chest'],
    'Back': TR + ['neck', 'head', 'clavS', 'armS'],
    'Shoulder': ['thorax', 'chest', 'clavS', 'armS'], 'Chest': ['lumbar', 'thorax', 'chest', 'clavS', 'armS'],
    'Abdomen': TR, 'Pelvic floor': ['pelvis'],
    'Upper arm': ['clavS', 'armS', 'foreS', 'radS'], 'Forearm': ['armS', 'foreS', 'radS', 'handS', 'fingS'],
    'Hand': ['foreS', 'radS', 'handS', 'fingS'],
    'Hip': ['pelvis', 'lumbar', 'thighS'], 'Thigh': ['pelvis', 'thighS', 'shankS'], 'Lower leg': ['thighS', 'shankS', 'footS'],
    'Foot': ['shankS', 'footS'],
}
TISSUE_SEGS = {
    'calcaneal tendon': ['shankS', 'footS'], 'flexor retinaculum of wrist': ['foreS', 'radS', 'handS'], 'iliotibial tract': ['pelvis', 'thighS', 'shankS'],
    'interosseous membrane of forearm': ['foreS', 'radS'], 'interosseous membrane of leg': ['shankS'], 'long plantar ligament': ['footS'],
    'thoracolumbar fascia': TR, 'tendinous arch of levator ani': ['pelvis'],
    'arytenoid cartilage': ['neck'], 'median cricothyroid ligament': ['neck'], 'intermediate tendon': ['neck', 'head'],
    'tendon of levator palpebrae superioris': ['head'],
}
# muscles whose group does not tell the whole story
KEY_SEGS = {
    'psoas major': ['lumbar', 'pelvis', 'thighS'], 'psoas minor': ['lumbar', 'pelvis'], 'quadratus lumborum': ['pelvis', 'lumbar', 'thorax'],
    'latissimus dorsi': TR + ['armS'], 'serratus anterior': ['thorax', 'chest', 'clavS'],
    'pectoralis minor': ['chest', 'clavS'], 'subclavius': ['chest', 'clavS'], 'diaphragm': ['thorax', 'chest', 'lumbar'],
    'trapezius': ['thorax', 'chest', 'neck', 'head', 'clavS'], 'levator scapulae': ['neck', 'clavS'], 'rhomboid major': ['chest', 'clavS'],
    'rhomboid minor': ['chest', 'neck', 'clavS'], 'sternocleidomastoid': ['chest', 'neck', 'head', 'clavS'],
    'omohyoid': ['neck', 'clavS'],
    # shoulder blade -> humerus only: with the thoracic segments allowed, posterior-deltoid and rotator-cuff vertices that lie over the ribs
    # stayed with the trunk while their neighbours followed the arm overhead (edges stretched up to 40x)
    'deltoid': ['clavS', 'armS'], 'supraspinatus': ['clavS', 'armS'], 'infraspinatus': ['clavS', 'armS'], 'teres minor': ['clavS', 'armS'],
    'teres major': ['clavS', 'armS'], 'subscapularis': ['clavS', 'armS'],
}


def allowed(row, side):
    k = row[1]; g = DB[k]['g']
    lst = KEY_SEGS.get(k) or (TISSUE_SEGS.get(k) if g == TISSUE else None) or GROUP_SEGS.get(g)
    if lst is None: raise KeyError('no segment list for ' + k)
    out = []
    for s in lst:
        sides = [side] if side else ['L', 'R']
        if s == 'fingS':
            for sd in sides: out += FINGER_SEGS[sd]
        elif s.endswith('S'):
            out += [s[:-1] + sd for sd in sides]
        else:
            out.append(s)
    return [SI[s] for s in dict.fromkeys(out)]


# ---------- joint centres ----------
def sphere_fit(p):
    A = np.c_[2 * p, np.ones(len(p))]
    b = (p ** 2).sum(1)
    c = np.linalg.lstsq(A, b, rcond=None)[0]
    return c[:3], np.sqrt(c[3] + (c[:3] ** 2).sum())


unit = lambda v: v / np.linalg.norm(v)


def ends(a, b):
    """Distal end of bone a and proximal end of bone b along the a->b direction (means of the extreme 3 mm)."""
    d = unit(b.mean(0) - a.mean(0))
    pa, pb = a @ d, b @ d
    return a[pa > pa.max() - 0.003].mean(0), b[pb < pb.min() + 0.003].mean(0)


def joints(geo):
    B = {}
    for (kind, key, side, part), (pos, ind) in zip(ROWS, geo):
        if kind != 'b': continue
        s = mesh_side([kind, key, side], pos)
        B.setdefault((key, s), []).append(pos)
    B = {k: np.concatenate(v) for k, v in B.items()}
    J, AX = {}, {}
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
        # forearm rotation: the radius turns about the line from the centre of the radial head to the centre of the ulnar head
        r, u = B[('radius', s)], B[('ulna', s)]
        rh = r[r[:, 1] > r[:, 1].max() - 0.01].mean(0)
        uh = u[u[:, 1] < u[:, 1].min() + 0.012].mean(0)
        J['radhead' + s] = rh; J['ulnhead' + s] = uh
        AX['rad' + s] = unit(uh - rh) * sg          # + = pronation on both sides (the mirror image of an axis flips its sign here)
        J['_hr' + s] = hr; J['_sr' + s] = sr
    def body(k):
        v = B[(k, '')]
        front = v[v[:, 2] > np.percentile(v[:, 2], 55)]        # the vertebral body is the anterior part
        return front
    l5 = body('fifth lumbar vertebra'); l1 = body('first lumbar vertebra'); t1 = body('first thoracic vertebra')
    J['l5s1'] = np.array([0, l5[:, 1].min() + 0.004, l5[:, 2].mean()])
    t12 = body('twelfth thoracic vertebra')
    J['t12l1'] = np.array([0, (t12[:, 1].min() + l1[:, 1].max()) / 2, (t12[:, 2].mean() + l1[:, 2].mean()) / 2])
    t6, t7 = body('sixth thoracic vertebra'), body('seventh thoracic vertebra')
    J['t6t7'] = np.array([0, (t6[:, 1].min() + t7[:, 1].max()) / 2, (t6[:, 2].mean() + t7[:, 2].mean()) / 2])
    c7 = body('seventh cervical vertebra')
    J['c7t1'] = np.array([0, (c7[:, 1].min() + t1[:, 1].max()) / 2, (c7[:, 2].mean() + t1[:, 2].mean()) / 2])
    at = B[('atlas', '')]
    J['occ'] = np.array([0, at[:, 1].max(), at[:, 2].mean()])
    J['pelvis'] = (J['hipL'] + J['hipR']) / 2
    return J, B, AX


def rot(axis, ang):
    """Rotation matrix about a unit axis (radians)."""
    x, y, z = axis; c, s = math.cos(ang), math.sin(ang); C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])


BAR_R = 0.016           # handle radius the grip is fitted to (dumbbell handle / barbell sleeve region: 28-32 mm)
SOFT = 0.0105           # palmar soft tissue between a finger joint centre and the handle surface
THUMB_G = (38, 30, 32)  # thumb angles at grip = 1: CMC (opposition), MCP, IP (degrees)


def hand_rig(B, J, AX):
    """Finger joint centres, flexion axes and grip angles (grip = 1 wraps the fingers around a handle of radius BAR_R), the grip point
    (centre of that handle in the bind pose) and the handle direction. -> pivots {seg: point}, axes {seg: axis}, angles {seg: deg}, points, dirs"""
    PV, AXS, G, PT, DR = {}, {}, {}, {}, {}
    for s in 'LR':
        mc = {k: B[(ORD[k - 1] + ' metacarpal bone', s)] for k in range(1, 6)}
        ph = lambda f, p: B[(p + ' phalanx of ' + FINGERS[f], s)]
        # palm normal (+z in the atlas pose, palms forward) and finger direction from the middle finger's metacarpal
        n = np.array([0.0, 0.0, 1.0])
        centres = []
        hand_d = []
        for f in ('f2', 'f3', 'f4', 'f5'):
            k = int(f[1]); bones = [mc[k], ph(f, 'proximal'), ph(f, 'middle'), ph(f, 'distal')]
            jts = [ends(bones[i], bones[i + 1]) for i in range(3)]
            P = [(a + b) / 2 for a, b in jts]                                 # MCP, PIP, DIP
            dist = bones[3]; dd = unit(dist.mean(0) - P[2]); tip = dist[dist @ dd > (dist @ dd).max() - 0.002].mean(0)
            base = mc[k][(mc[k] @ unit(P[0] - mc[k].mean(0))) < (mc[k] @ unit(P[0] - mc[k].mean(0))).min() + 0.004].mean(0)
            hand_d.append(unit(P[0] - base))
            pts = [base] + P + [tip]
            dirs = [unit(pts[i + 1] - pts[i]) for i in range(4)]                # metacarpal, proximal, middle, distal
            ax = unit(np.cross(dirs[1], n))                                      # flexion axis: + curls the finger toward the palm
            L = [np.linalg.norm(pts[i + 2] - pts[i + 1]) for i in range(3)]
            R = BAR_R + SOFT
            al = [2 * math.asin(min(0.999, l / (2 * R))) for l in L]
            target = [al[0] / 2 + math.radians(18), (al[0] + al[1]) / 2, (al[1] + al[2]) / 2]   # absolute flexion: points on a circle of radius R
            bind = [math.atan2(np.dot(np.cross(dirs[i], dirs[i + 1]), ax), np.dot(dirs[i], dirs[i + 1])) for i in range(3)]
            names = [f + p + s for p in FPH[f]]
            for i, nm in enumerate(names):
                PV[nm] = P[i]; AXS[nm] = ax; G[nm] = math.degrees(target[i] - bind[i])
            # FK of the curled finger -> circle through PIP, DIP and the tip: its centre is where the handle sits
            M = np.eye(3); q = [P[0]]
            cur = P[0].copy()
            for i in range(3):
                M = M @ rot(ax, math.radians(G[names[i]]))
                cur = cur + M @ (pts[i + 2] - pts[i + 1]); q.append(cur.copy())
            a, b, c = q[0], q[1], q[2]
            ab, ac = b - a, c - a; nn = np.cross(ab, ac)
            cc = a + (np.cross(nn, ab) * ac.dot(ac) + np.cross(ac, nn) * ab.dot(ab)) / (2 * nn.dot(nn))
            centres.append(cc)
        # thumb: CMC (trapezium / first metacarpal), MCP, IP
        tb = [B[('trapezium', s)], mc[1], ph('th', 'proximal'), ph('th', 'distal')]
        TP = [(a + b) / 2 for a, b in (ends(tb[i], tb[i + 1]) for i in range(3))]
        td = unit(TP[1] - TP[0]); across = unit(PV['f5p' + s] - PV['f2p' + s])   # index -> little finger
        ax_cmc = unit(np.cross(td, unit(across + n)))     # opposition: toward the palm and across it
        ax_mcp = unit(np.cross(unit(TP[2] - TP[1]), across))
        for i, nm in enumerate(['thm' + s, 'thp' + s, 'thd' + s]):
            PV[nm] = TP[i]; AXS[nm] = ax_cmc if i == 0 else ax_mcp; G[nm] = THUMB_G[i]
        cen = np.mean(centres, 0)
        gax = unit(np.mean([AXS[f + 'p' + s] for f in ('f2', 'f3', 'f4', 'f5')], 0)) * (-1 if s == 'L' else 1)   # handle axis, toward the thumb
        fd = np.mean(hand_d, 0); fd = unit(fd - gax * fd.dot(gax))
        PT['grip' + s] = cen; DR['gax' + s] = gax; DR['gfd' + s] = fd
    return PV, AXS, G, PT, DR


PIVOT = {'pelvis': 'pelvis', 'lumbar': 'l5s1', 'thorax': 't12l1', 'chest': 't6t7', 'neck': 'c7t1', 'head': 'occ'}
for s in 'LR':
    PIVOT.update({'clav' + s: 'sc' + s, 'arm' + s: 'shoulder' + s, 'fore' + s: 'elbow' + s, 'rad' + s: 'radhead' + s, 'hand' + s: 'wrist' + s,
                  'thigh' + s: 'hip' + s, 'shank' + s: 'knee' + s, 'foot' + s: 'ankle' + s})


# Muscles that run from the trunk / shoulder blade to the humerus. Weighted by the nearest bone, their sheets near the axilla get a large
# humerus weight, and with the arm overhead dual-quaternion blending swings those vertices on arcs about the shoulder (up to ~10 cm off the
# chest wall, the pullover's latissimus 5 cm into the bench). Here only the insertion follows the arm: arm weight = 1 near the vertices that
# touch the humerus (within INS_D) and falls off with the distance to them (smoothstep from INS_FALL[0] to INS_FALL[1]); the rest of the
# sheet keeps its trunk / shoulder-blade weights, so the band between origin and insertion is stretched instead of swung out.
# wall: vertices that lie on the chest wall or the shoulder blade (distance to the nearest non-arm bone below wall[0], fading out by wall[1])
# keep their trunk weights even close to the insertion, so the sheet does not peel off the ribs at the armpit.
INSERT_ARM = {'latissimus dorsi': (0.012, (0.006, 0.045), (0.02, 0.045)), 'pectoralis major': (0.012, (0.006, 0.045), (0.02, 0.045)),
              'teres major': (0.010, (0.004, 0.035), None)}
SIGMA = 0.018          # soft-min width (m): the blend band is where the distances to two bones differ by less than ~2 sigma
SIGMA_HAND = 0.007     # narrower for the hand and finger segments (bones only millimetres apart)
BAND = {'l5s1': 0.045, 't12l1': 0.06, 't6t7': 0.055}   # half widths of the trunk bands
T67_TILT = -0.6        # the T6/T7 split plane drops toward the front (the sternum and ribs 1-7 reach lower in front): y = y0 + tilt * (z - z0)


def smooth01(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def insert_weights(E, ia, D, pos, ins_d, fall, wall):
    """E (columns x vertices, sums 1) with the arm column ia replaced by the insertion falloff (see INSERT_ARM); the other columns keep
    their proportions and share the rest. D = distances of every vertex to the bones of each column (row ia = the humerus)."""
    dh = D[ia]
    ins = pos[dh < ins_d]
    if len(ins) == 0: ins = pos[[int(np.argmin(dh))]]
    d = cKDTree(ins).query(pos)[0]
    wa = 1 - smooth01((d - fall[0]) / (fall[1] - fall[0]))
    if wall: wa = wa * smooth01((np.delete(D, ia, 0).min(0) - wall[0]) / (wall[1] - wall[0]))
    rest = np.delete(E, ia, 0); s = rest.sum(0)
    if (s <= 1e-12).any():   # a vertex weighted only to the arm: give its share to the nearest other column (uniform if none)
        rest[:, s <= 1e-12] = 1.0 / max(1, len(rest)); s = rest.sum(0)
    E = E.copy()
    E[np.arange(len(E)) != ia] = rest / s * (1 - wa)
    E[ia] = wa
    return E


def skin_level(geo, trees, J):
    """-> list of (i0, i1, i2, w0, w1) uint8 arrays per mesh (three influences; w2 = 255 - w0 - w1)."""
    out = []
    ytl, ytc = J['l5s1'][1], J['t12l1'][1]
    y67, z67 = J['t6t7'][1], J['t6t7'][2]
    tri = [SI[s] for s in TRUNK]
    small = {SI['hand' + s] for s in 'LR'} | {SI[n] for s in 'LR' for n in FINGER_SEGS[s]}
    for row, (pos, ind) in zip(ROWS, geo):
        nv = len(pos)
        side = mesh_side(row, pos)
        if row[0] == 'b':
            s = SI[bone_seg(row[1], side)]
            f = lambda v: np.full(nv, v, np.uint8)
            out.append((f(s), f(s), f(s), f(255), f(0)))
            continue
        al = allowed(row, side)
        W = np.zeros((nv, len(SEGS)))
        ta = [s for s in al if s in tri]
        fa = {sd: [SI['fore' + sd], SI['rad' + sd]] for sd in 'LR' if SI['fore' + sd] in al and SI['rad' + sd] in al}
        fblock = {x for v in fa.values() for x in v}
        la = [s for s in al if s not in tri and s not in fblock]
        cols, D, sig = [], [], []
        if ta:   # trunk as one block: distance to the nearest trunk bone
            D.append(np.min([trees[s].query(pos)[0] for s in ta], 0)); cols.append('T'); sig.append(SIGMA)
        for sd, (fo, ra) in fa.items():   # forearm as one block per side (ulna + radius), split along the forearm afterwards
            D.append(np.minimum(trees[fo].query(pos)[0], trees[ra].query(pos)[0])); cols.append('F' + sd); sig.append(SIGMA)
        for s in la:
            D.append(trees[s].query(pos)[0]); cols.append(s); sig.append(SIGMA_HAND if s in small else SIGMA)
        D = np.array(D); sig = np.array(sig)[:, None]
        E = np.exp(-(D - D.min(0)) / sig)
        E /= E.sum(0)
        if row[1] in INSERT_ARM and side and SI['arm' + side] in cols:
            E = insert_weights(E, cols.index(SI['arm' + side]), D, pos, *INSERT_ARM[row[1]])
        for c, e in zip(cols, E):
            if c == 'T':
                y, z = pos[:, 1], pos[:, 2]
                up1 = smooth01((y - (ytl - BAND['l5s1'])) / (2 * BAND['l5s1']))     # 0 below the L5/S1 band, 1 above
                up2 = smooth01((y - (ytc - BAND['t12l1'])) / (2 * BAND['t12l1']))
                ys = y67 + T67_TILT * (z - z67)
                up3 = smooth01((y - (ys - BAND['t6t7'])) / (2 * BAND['t6t7']))
                tw = np.stack([1 - up1, up1 * (1 - up2), up2 * (1 - up3), up2 * up3], 1)   # pelvis, lumbar, thorax, chest
                mask = np.array([s in ta for s in tri], float)
                tw = tw * mask
                ssum = tw.sum(1)
                if (ssum <= 1e-9).any():   # height outside the allowed trunk segments: nearest allowed one
                    best = np.argmin([trees[s].query(pos)[0] if s in ta else np.full(nv, 9.0) for s in tri], 0)
                    zz = ssum <= 1e-9
                    tw[zz] = 0; tw[zz, best[zz]] = 1; ssum = tw.sum(1)
                tw /= ssum[:, None]
                for k, s in enumerate(tri): W[:, s] += e * tw[:, k]
            elif isinstance(c, str) and c[0] == 'F':
                sd = c[1]; el, wr = J['elbow' + sd], J['wrist' + sd]
                u = (pos - el) @ (wr - el) / np.dot(wr - el, wr - el)
                wr_ = smooth01((u - 0.04) / 0.92)        # twist distributed along the forearm: 0 at the elbow (ulna), 1 at the wrist (radius)
                W[:, SI['fore' + sd]] += e * (1 - wr_); W[:, SI['rad' + sd]] += e * wr_
            else:
                W[:, c] = e
        o = np.argsort(-W, 1, kind='stable')
        idx = o[:, :3]
        w = W[np.arange(nv)[:, None], idx]
        w = w / w.sum(1, keepdims=True)
        q0 = np.round(255 * w[:, 0]).astype(np.int64)
        q1 = np.round(255 * w[:, 1]).astype(np.int64)
        q1 = np.minimum(q1, 255 - q0)
        q2 = 255 - q0 - q1
        i1 = np.where(q1 > 0, idx[:, 1], idx[:, 0])
        i2 = np.where(q2 > 0, idx[:, 2], idx[:, 0])
        out.append((idx[:, 0].astype(np.uint8), i1.astype(np.uint8), i2.astype(np.uint8), q0.astype(np.uint8), q1.astype(np.uint8)))
    return out


def write_skin(level, sk):
    buf = b''.join(b''.join(a.tobytes() for a in planes) for planes in sk)
    data = gzip.compress(buf, 9, mtime=0)
    open(os.path.join(root, 'geo', 'skin-' + level + '.bin'), 'wb').write(data)
    return len(buf), len(data)


def extra_points(B):
    """toe (metatarsal heads) per side, for contacts."""
    P = {}
    for s in 'LR':
        th = []
        for k in ('first', 'second', 'third', 'fourth', 'fifth'):
            m = B[(k + ' metatarsal bone', s)]
            th.append(m[m[:, 2] > m[:, 2].max() - 0.008].mean(0))
        P['toe' + s] = np.mean(th, 0)
    return P


if __name__ == '__main__':
    geo = decode('medium')
    J, B, AX = joints(geo)
    J.update(extra_points(B))
    PV, FAX, GA, PT, DR = hand_rig(B, J, AX)
    J.update(PT)
    segbones = {}
    for (k, s), v in B.items(): segbones.setdefault(SI[bone_seg(k, s)], []).append(v)
    assert sorted(segbones) == list(range(len(SEGS))), 'every segment needs at least one bone'
    trees = {s: cKDTree(np.concatenate(v)) for s, v in sorted(segbones.items())}
    r4 = lambda a: [round(float(x), 4) for x in a]
    seg = []
    for n in SEGS:
        x = {'n': n, 'p': SI[PARENT[n]] if PARENT[n] else -1, 'j': r4(PV[n] if n in PV else J[PIVOT[n]])}
        if n in AX: x['ax'] = r4(AX[n])
        if n in FAX: x['ax'] = r4(FAX[n]); x['g'] = round(GA[n], 1)
        seg.append(x)
    rig = {'v': 2, 'sigma': SIGMA, 'nbody': NBODY, 'seg': seg,
           'pt': {k: r4(J[k]) for k in sorted(J) if not k.startswith('_')}, 'dir': {k: r4(DR[k]) for k in sorted(DR)}}
    d = lambda o: json.dumps(o, separators=(', ', ': '))
    txt = ('{"v": 2, "sigma": %s, "nbody": %d,\n "seg": [\n' % (SIGMA, NBODY) + ',\n'.join('  ' + d(x) for x in rig['seg']) + '\n ],\n "pt": {\n'
           + ',\n'.join('  %s: %s' % (json.dumps(k), d(v)) for k, v in rig['pt'].items()) + '\n },\n "dir": {\n'
           + ',\n'.join('  %s: %s' % (json.dumps(k), d(v)) for k, v in rig['dir'].items()) + '\n }\n}\n')
    assert json.loads(txt) == rig
    open(os.path.join(here, 'rig.json'), 'w', encoding='utf-8', newline='\n').write(txt)
    print('rig.json:', len(SEGS), 'segments (%d body + %d finger)' % (NBODY, len(SEGS) - NBODY))
    for lv in ('low', 'medium', 'high'):
        g = geo if lv == 'medium' else decode(lv)
        raw, gz = write_skin(lv, skin_level(g, trees, J))
        print('skin-%s.bin: %d vertices, %.0f kB gzip (%.0f kB raw)' % (lv, raw // 5, gz / 1e3, raw / 1e3))
