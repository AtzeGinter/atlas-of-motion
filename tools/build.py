"""Mesh pipeline: BodyExplorer GLBs -> ../geo/{low,medium,high}.bin + meshes.json  (run from tools/; needs the BodyExplorer clone)
All quality levels share one mesh list/order and one dequantisation box (lo/span), so the viewer can swap geometry per mesh.
Per-mesh binary layout (little-endian uint16, delta + zigzag coded, whole file gzip-compressed, no base64):
    x-plane[nv], y-plane[nv], z-plane[nv], indices[nf*3]"""
import trimesh, numpy as np, pyfqmr, json, gzip, os, sys
# level -> (muscle ratio, bone ratio, face floor, preserve_border); ratio >= 1 keeps the source mesh untouched.
# Medium is the original 0.45/0.35 setting. Low needs preserve_border=False: with it pyfqmr cannot reach the target on these open
# (border-rich) meshes (0.2/0.15 would still leave ~600k faces). Without it, thin open meshes can erode, so simplify() redoes
# a mesh with borders kept when its bbox diagonal shrinks >7% or its surface area >20%. Low = 0.16/0.12 -> ~360k faces.
LODS = {'low': (0.16, 0.12, 300, False), 'medium': (0.45, 0.35, 300, True), 'high': (1.0, 1.0, 0, True)}
A = trimesh.load('BodyExplorer/public/anatomy.glb'); S = trimesh.load('BodyExplorer/public/skeleton.glb')
src = []
for kind, scn in (('m', A), ('b', S)):
    for name, g in scn.geometry.items():
        src.append((kind, name, np.asarray(g.vertices, dtype=np.float64), np.asarray(g.faces, dtype=np.int64)))
def area(v, f):
    return np.linalg.norm(np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]]), axis=1).sum() / 2
def diag(v): return np.linalg.norm(v.max(0) - v.min(0))
def simplify(v, f, ratio, floor, pb):
    n = len(f)
    if ratio >= 1: return v, f
    tgt = max(min(n, floor), int(n * ratio))
    if tgt >= n: return v, f
    def run(border):
        s = pyfqmr.Simplify(); s.setMesh(v, f); s.simplify_mesh(target_count=tgt, aggressiveness=7, preserve_border=border, verbose=0)
        v2, f2, _ = s.getMesh(); return v2, np.asarray(f2, dtype=np.int64)
    v2, f2 = run(pb)
    # without border protection thin open meshes (small muscles, fasciae) can erode: if that happened, redo this mesh with borders kept
    if not pb and (diag(v2) < 0.93 * diag(v) or area(v2, f2) < 0.8 * area(v, f)): v2, f2 = run(True)
    return v2, f2
# scene coords (metres): x, up = z, front = -y
scene = lambda v: np.stack([v[:, 0], v[:, 2], -v[:, 1]], 1) * 0.001
levels = {}
for lv, (mr, br, floor, pb) in LODS.items():
    levels[lv] = [(kind, name, scene(v), f) for kind, name, v0, f0 in src for v, f in [simplify(v0, f0, mr if kind == 'm' else br, floor, pb)]]
    print(lv, 'simplified:', sum(len(i[3]) for i in levels[lv]), 'faces')
# shift (x/z centred, feet at y=0) comes from the undecimated set; lo/span from the union over all levels after the shift
b = np.concatenate([i[2] for i in levels['high']]); l0, h0 = b.min(0), b.max(0)
off = np.array([-(l0[0] + h0[0]) / 2, -l0[1], -(l0[2] + h0[2]) / 2])
allP = np.concatenate([i[2] + off for lv in levels.values() for i in lv])
lo, hi = allP.min(0), allP.max(0); span = hi - lo
names = [[k, n] for k, n, *_ in src]
for lv in levels: assert [[k, n] for k, n, *_ in levels[lv]] == names, lv
def pack(items):
    buf, counts = [], []
    for kind, name, P, F in items:
        P = P + off
        flat = F.ravel(); used, first = np.unique(flat, return_index=True)
        seq = used[np.argsort(first)]                      # vertices in order of first use
        order = np.full(len(P), -1); order[seq] = np.arange(len(seq))
        P = P[seq]; F = order[F]
        assert len(P) < 65536, (kind, name, len(P))
        q = np.round((P - lo) / span * 65535).astype(np.int64); assert q.min() >= 0 and q.max() <= 65535
        d = np.diff(np.concatenate([np.zeros((1, 3), np.int64), q]), axis=0); d = ((d + 32768) % 65536) - 32768
        zz = ((d << 1) ^ (d >> 63)).astype(np.uint16)
        fi = F.ravel(); dd = np.diff(np.concatenate([[0], fi])); dd = ((dd + 32768) % 65536) - 32768; zi = (dd << 1) ^ (dd >> 63)
        buf.append(zz.T.copy().astype('<u2').tobytes()); buf.append(zi.astype('<u2').tobytes())
        counts.append([len(P), len(F)])
    return gzip.compress(b''.join(buf), 9, mtime=0), counts   # mtime=0: reproducible bytes
os.makedirs('../geo', exist_ok=True)
lod = {}
for lv in LODS:
    gz, counts = pack(levels[lv])
    open('../geo/%s.bin' % lv, 'wb').write(gz)
    lod[lv] = {'file': 'geo/%s.bin' % lv, 'bytes': len(gz), 'faces': sum(c[1] for c in counts), 'counts': counts}
    print('%-6s faces %8d  verts %8d  %.2f MB gzip' % (lv, lod[lv]['faces'], sum(c[0] for c in counts), len(gz) / 1e6))
json.dump({'lo': lo.tolist(), 'span': span.tolist(), 'meshes': names, 'lod': lod}, open('meshes.json', 'w', encoding='utf-8', newline='\n'), separators=(',', ':'))
print('meshes.json written:', len(names), 'meshes')
