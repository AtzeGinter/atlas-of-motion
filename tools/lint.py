"""Data linter: python lint.py [dir]  (run from tools/; exits 1 on any problem). Checks data/*.txt and, if present, meta3.json."""
import json, os, re, sys
D = sys.argv[1] if len(sys.argv) > 1 else '.'
P = lambda *a: os.path.join(D, *a)
err = []
def rd(p): return open(p, encoding='utf-8', newline='').read()
def lst(name):
    m = re.search(r'const %s=(\[[^\]]*\])' % name, rd(P('template.html')))
    if not m: err.append('template.html: const %s=[...] not found' % name); return []
    return json.loads(m.group(1))
MG, EXC, EQC = lst('MGROUPS') + ['Connective tissue'], lst('EXCATS'), lst('EQCATS')
def rows(f, n):
    out, seen = [], {}
    s = rd(P('data', f))
    if '\r' in s: err.append(f + ': contains CR characters')
    for ln, l in enumerate(s.split('\n'), 1):
        l = l.rstrip('\r')
        if not l.strip(): continue
        w = f'{f}:{ln}'
        if '\t' in l: err.append(w + ': tab character')
        r = l.split('|')
        if len(r) != n: err.append(f'{w}: {len(r)} fields, expected {n}'); continue
        for x in r:
            if x != x.strip(): err.append(f'{w}: leading/trailing whitespace in {x.strip()[:30]!r}'); break
        if not r[0].strip(): err.append(w + ': empty key'); continue
        if r[0] in seen: err.append(f'{w}: duplicate key {r[0]!r} (first on line {seen[r[0]]})')
        seen[r[0]] = ln; out.append((w, r))
    return out
mus = rows('muscles.txt', 6)
keys = {r[0] for _, r in mus}
for w, r in mus:
    if not r[1].strip(): err.append(w + ': empty group')
    elif r[1] not in MG: err.append(f'{w}: unknown group {r[1]!r}')
for w, r in rows('extra.txt', 3):
    if r[0] not in keys: err.append(f'{w}: key {r[0]!r} not in muscles.txt')
als = rows('aliases.txt', 2)
for w, r in als:
    if r[0] != r[0].lower(): err.append(f'{w}: alias {r[0]!r} must be lower-case')
    if not r[1]: err.append(w + ': no keys')
    for e in r[1].split(','):
        if e.partition(':')[0] not in keys: err.append(f'{w}: key {e.partition(":")[0]!r} not in muscles.txt')
acts = rows('activities.txt', 7)
AG, KINDS = ('Endurance', 'Combat', 'Team', 'Other'), ('easy', 'long', 'tempo', 'vo2', 'hiit', 'rounds')
for w, r in acts:
    if r[2] not in AG: err.append(f'{w}: unknown activity group {r[2]!r}')
    try: float(r[3])
    except ValueError: err.append(f'{w}: MET {r[3]!r} is not a number')
    kd, _, mn = r[6].partition(':')
    if kd not in KINDS or not mn.isdigit() or not 5 <= int(mn) <= 300: err.append(f'{w}: default {r[6]!r} must be kind:minutes ({"/".join(KINDS)})')
    if kd == 'rounds' and r[2] != 'Combat': err.append(w + ': rounds are for the Combat group')
    if r[4] != '-':
        for e in r[4].split(','):
            try: wt = float(e.rsplit(':', 1)[1]); k = e.rsplit(':', 1)[0].partition(':')[0]
            except (IndexError, ValueError): err.append(f'{w}: bad profile entry {e!r} (key[:part]:weight)'); continue
            if not 0.2 <= wt <= 1: err.append(f'{w}: weight {wt} for {k!r} outside 0.2-1')
            if k not in keys: err.append(f'{w}: key {k!r} not in muscles.txt')
# movements.txt: id|label|joint|primary|secondary, entries "key" or "key:part" (comma-separated, "-" = none)
mov, mgrp = rows('movements.txt', 5), {r[0]: r[1] for _, r in mus}
def mvents(w, f, lab):
    if f == '-': return []
    out = []
    for e in f.split(','):
        k, _, p = e.partition(':')
        if not k or e != e.strip(): err.append(f'{w}: bad {lab} entry {e!r}'); continue
        if k not in keys: err.append(f'{w}: {lab} key {k!r} not in muscles.txt')
        elif mgrp[k] == 'Connective tissue': err.append(f'{w}: {k!r} is connective tissue, not a muscle')
        out.append((k, p))
    return out
over = lambda a, b: a[0] == b[0] and (not a[1] or not b[1] or a[1] == b[1])   # same key, and same part or one of them the whole muscle
mvparts = []   # (where, key, part), checked against meta3.json below
for w, r in mov:
    if not re.fullmatch(r'[a-z][a-z0-9_]*', r[0]): err.append(f'{w}: bad movement id {r[0]!r}')
    if not r[1] or not r[2]: err.append(f'{w}: empty label or joint')
    if r[3] == '-' or not r[3]: err.append(f'{w}: needs at least one primary muscle'); continue
    pri, sec = mvents(w, r[3], 'primary'), mvents(w, r[4], 'secondary')
    for lab, es in (('primary', pri), ('secondary', sec)):
        for i, a in enumerate(es):
            if any(over(a, b) for b in es[:i]): err.append(f'{w}: duplicate {lab} entry {":".join(x for x in a if x)!r}')
    for a in sec:
        if any(over(a, b) for b in pri): err.append(f'{w}: {":".join(x for x in a if x)!r} is both primary and secondary')
    mvparts += [(w, k, p) for k, p in pri + sec if p]
nrv = rows('nerves.txt', 8)
NKINDS, SPINE = ('motor', 'mixed', 'cranial'), {f'{c}{i}' for c, n in (('C', 7), ('T', 12), ('L', 5), ('S', 4)) for i in range(1, n + 1)}
nrow = {r[0]: r[7] for _, r in nrv}
nids, nanch = [], []   # nanch: (where, type, key) of bone/muscle anchors, checked against meta3.json below
def f3(s):
    try: v = [float(x) for x in s.split(',')]
    except ValueError: return False
    return len(v) == 3
for w, r in nrv:
    i, nm, rt, kd, par, wps, note, mt = r
    if not re.fullmatch(r'[a-z][a-z0-9_]*', i): err.append(f'{w}: bad nerve id {i!r}')
    for lab, v in (('name', nm), ('roots', rt), ('note', note), ('match', mt)):
        if not v: err.append(f'{w}: empty {lab}')
    if kd not in NKINDS: err.append(f'{w}: kind {kd!r} must be one of {"/".join(NKINDS)}')
    if par != '-' and par not in nids: err.append(f'{w}: parent {par!r} must be a nerve defined on an earlier line')
    if mt != '-' and not all(s.strip() for s in mt.split(';')): err.append(f'{w}: empty match substring')
    nids.append(i)
    wl = wps.split(';')
    if len(wl) < (1 if par != '-' else 2): err.append(f'{w}: needs at least {1 if par != "-" else 2} waypoint(s)')
    for a in wl:
        t = a.split(':')
        if t[0] == 'xyz' and len(t) == 2 and f3(t[1]): continue
        if t[0] == 'spine' and 2 <= len(t) <= 3 and t[1] in SPINE and (len(t) == 2 or f3(t[2])): continue
        if t[0] in ('bone', 'muscle') and 3 <= len(t) <= 4 and (len(t) == 3 or f3(t[3])):
            sp = t[2]
            if f3(sp) or (sp[:1] == 's' and re.fullmatch(r'[01](\.\d+)?', sp[1:])):
                nanch.append((w, t[0], t[1])); continue
        err.append(f'{w}: bad waypoint {a!r} (xyz:x,y,z | spine:C5[:dx,dy,dz] | bone|muscle:key:fx,fy,fz|sT[:dx,dy,dz])')
# licence groundwork: data/revoked.txt = licence ids (10 x A-Z2-7), '#' comments; license-public.jwk = ECDSA P-256 public key
rev, rvseen = [], set()
if os.path.exists(P('data', 'revoked.txt')):
    for ln, l in enumerate(rd(P('data', 'revoked.txt')).split(chr(10)), 1):
        l = l.split('#')[0].strip()
        if not l: continue
        if not re.fullmatch(r'[A-Z2-7]{10}', l): err.append(f'revoked.txt:{ln}: bad licence id {l!r} (10 characters A-Z, 2-7)')
        elif l in rvseen: err.append(f'revoked.txt:{ln}: duplicate licence id {l!r}')
        rvseen.add(l); rev.append(l)
if os.path.exists(P('license-public.jwk')):
    try: jw = json.loads(rd(P('license-public.jwk')))
    except ValueError: jw = None; err.append('license-public.jwk: not valid JSON')
    if jw is not None and (not isinstance(jw, dict) or jw.get('kty') != 'EC' or jw.get('crv') != 'P-256' or not all(isinstance(jw.get(c), str) and re.fullmatch(r'[A-Za-z0-9_-]{43}', jw[c]) for c in 'xy') or 'd' in jw):
        err.append('license-public.jwk: must be a public EC P-256 JWK {kty,crv,x,y} without a private part "d"')
nex = None
if os.path.exists(P('meta3.json')):
    M = json.loads(rd(P('meta3.json'))); db = M['db']; names = set(); nex = len(M['ex'])
    pts = {}
    for o in M['meshes']:
        if o[0] == 'm' and o[3]: pts.setdefault(o[1], set()).add(o[3])
    for w, r in als:
        for e in r[1].split(','):
            k, _, p = e.partition(':')
            if p and p not in pts.get(k, ()): err.append(f'{w}: {k!r} has no part {p!r}')
    for w, r in acts:
        if r[4] != '-':
            for e in r[4].split(','):
                k, _, p = e.rsplit(':', 1)[0].partition(':')
                if p and p not in pts.get(k, ()): err.append(f'{w}: {k!r} has no part {p!r}')
    def tg(w, t, zero=False):
        for k, part, lv in t:
            if k not in db: err.append(f'{w}: unknown muscle {k!r}')
            if lv not in ((0, 1, 2, 3) if zero else (1, 2, 3)): err.append(f'{w}: bad level {lv!r} on {k!r}')
    for e in M['ex']:
        w = 'exercise ' + repr(e['n'])
        if e['n'] in names: err.append(w + ': duplicate name')
        names.add(e['n'])
        if e['c'] not in EXC: err.append(f"{w}: category {e['c']!r} not in EXCATS")
        if not e['eq']: err.append(w + ': empty eq list')
        for q in e['eq']:
            if q not in EQC: err.append(f'{w}: equipment category {q!r} not in EQCATS')
        if not e['t']: err.append(w + ': no targets')
        tg(w, e['t'])
        for g, opts in e.get('v', []):
            if len(opts) < 2: err.append(f'{w}: variation group {g!r} has {len(opts)} option(s), need >=2')
            for o, t in opts: tg(f'{w} / {g} / {o}', t, True)
        # loading potential 1-3; stretch entries [key, part] must be targets (of the exercise, or of the variation option for sv)
        if e.get('ld') not in (1, 2, 3): err.append(f"{w}: ld {e.get('ld')!r} must be 1, 2 or 3")
        tks = {(k, p) for k, p, _ in e['t']}
        for k, p in e.get('st', []):
            if (k, p) not in tks: err.append(f'{w}: stretch entry {k!r}/{p!r} is not a target')
        for gi, oi, st in e.get('sv', []):
            vs = e.get('v', [])
            if not (0 <= gi < len(vs) and 0 < oi < len(vs[gi][1])): err.append(f'{w}: stretch override for unknown variation {gi}/{oi}'); continue
            ov = {(k, p): l for k, p, l in vs[gi][1][oi][1]}
            vt = {(k, p) for k, p in tks if ov.get((k, p), ov.get((k, ''), 1)) > 0} | {kp for kp, l in ov.items() if l > 0}
            for k, p in st:
                if (k, p) not in vt: err.append(f'{w} / {vs[gi][1][oi][0]}: stretch entry {k!r}/{p!r} is not a target')
    # nerves: anchors reference existing structures; META.nd/nv agree with nerves.txt; every nerve supplies a muscle (directly, or through its branches if its match is "-")
    nd, nv = M.get('nd', []), M.get('nv', {})
    if [d['id'] for d in nd] != nids: err.append('meta3.json: nerve ids differ from nerves.txt (run meta.py && exercises.py)')
    for w, t, k in nanch:
        if t == 'muscle' and (k not in db or db[k]['g'] == 'Connective tissue'): err.append(f'{w}: waypoint muscle {k!r} not found')
        if t == 'bone' and k not in M['bdb']: err.append(f'{w}: waypoint bone {k!r} not found')
    kids = {}
    for d in nd: kids.setdefault(d['p'], []).append(d['id'])
    def below(i): return [j for c in kids.get(i, []) for j in [c] + below(c)]
    for d in nd:
        for k in nv.get(d['id'], []):
            if k not in db: err.append(f"nerve {d['id']}: supplies unknown muscle {k!r}")
        via = [k for j in below(d['id']) for k in nv.get(j, [])]
        trunk = nrow[d['id']] == '-'   # match "-" marks a trunk / plexus whose muscles come through its branches
        if trunk and not via: err.append(f"nerve {d['id']}: trunk (match '-') has no branch that supplies a muscle")
        if not trunk and not nv.get(d['id']): err.append(f"nerve {d['id']}: match text {nrow[d['id']]!r} matched no muscle's nerve text in muscles.txt")
    nsup = {k for v in nv.values() for k in v}
    nomatch = sorted(k for k in db if db[k]['g'] != 'Connective tissue' and db[k]['n'] and k not in nsup)
    print(f'INFO: {len(nsup)} muscles are supplied by a drawn nerve; {len(nomatch)} have nerve text that matched no nerve' + (': ' + ', '.join(nomatch) if nomatch else ''))
    # movements: parts exist; META.mv agrees with movements.txt
    for w, k, p in mvparts:
        if p not in pts.get(k, ()): err.append(f'{w}: {k!r} has no part {p!r}')
    mv = M.get('mv', [])
    if [m['id'] for m in mv] != [r[0] for _, r in mov]: err.append('meta3.json: movement ids differ from movements.txt (run meta.py && exercises.py)')
    for m in mv:
        if not m['k']: err.append(f"movement {m['id']!r}: no primary muscle")
        for mk in m['k'] + m['s']:
            if mk not in db: err.append(f"movement {m['id']!r}: unknown muscle {mk!r}")
    if mv: print(f'INFO: {len(mv)} movements, {len(set(k for m in mv for k in m["k"] + m["s"]))} muscles named as prime mover or assistant')
else: print('NOTE: meta3.json missing, exercise checks skipped (run meta.py && exercises.py first)')
# exercise animation (prototype, docs/animation-design.md): rig.json (rig.py), data/animations.json, ../geo/skin-<level>.bin
nanim = 0
DOFS = {'spine': ('flex', 'lat', 'rot'), 'clav': ('elev', 'prot'), 'ball': ('flex', 'abd', 'rot'), 'knee': ('flex',), 'elbow': ('flex',), 'ankle': ('flex',), 'wrist': ('flex', 'dev')}
SEGK = {'lumbar': 'spine', 'chest': 'spine', 'neck': 'spine', 'head': 'spine', 'clav': 'clav', 'arm': 'ball', 'fore': 'elbow', 'hand': 'wrist', 'thigh': 'ball', 'shank': 'knee', 'foot': 'ankle'}
def segk(n): return SEGK.get(n) if n in SEGK else (SEGK.get(n[:-1]) if n[-1:] in ('L', 'R') else None)
CHAINS = {'thigh': ('shank', 'foot'), 'arm': ('fore', 'hand')}
num3 = lambda v: isinstance(v, list) and len(v) == 3 and all(isinstance(x, (int, float)) for x in v)
rig = None
if os.path.exists(P('rig.json')):
    rig = json.loads(rd(P('rig.json')))
    sg = rig.get('seg', []); sn = [x['n'] for x in sg]
    if len(set(sn)) != len(sn) or not sn or sn[0] != 'pelvis' or sg[0]['p'] != -1: err.append('rig.json: segment names must be unique, pelvis first (root)')
    for i, x in enumerate(sg):
        if i and not 0 <= x['p'] < i: err.append(f"rig.json: segment {x['n']!r} must come after its parent")
        if i and not segk(x['n']): err.append(f"rig.json: unknown segment {x['n']!r}")
        j = x['j']
        if not (num3(j) and -0.35 < j[0] < 0.35 and 0 < j[1] < 1.75 and -0.15 < j[2] < 0.15): err.append(f"rig.json: pivot of {x['n']!r} outside the body box: {j}")
        if x['n'].endswith('L') and x['n'][:-1] + 'R' in sn:
            r = sg[sn.index(x['n'][:-1] + 'R')]['j']
            if abs(j[0] + r[0]) > 0.015 or abs(j[1] - r[1]) > 0.015 or abs(j[2] - r[2]) > 0.015: err.append(f"rig.json: {x['n']!r} and its right twin are not symmetric ({j} vs {r})")
else: print('NOTE: rig.json missing, animation checks skipped (run rig.py; assemble.py needs it)')
if rig and os.path.exists(P('data', 'animations.json')):
    try: AN = json.loads(rd(P('data', 'animations.json')))
    except ValueError as e: AN = {}; err.append(f'animations.json: not valid JSON ({e})')
    sn = [x['n'] for x in rig['seg']] if rig else []
    exn = {e['n'] for e in M['ex']} if nex is not None else None
    for name, a in AN.items():
        if name.startswith('_'): continue
        nanim += 1; w = f'animations.json {name!r}'
        if exn is not None and name not in exn: err.append(f'{w}: no exercise of that name')
        if not isinstance(a.get('dur'), (int, float)) or not 0.5 <= a['dur'] <= 10: err.append(f'{w}: dur must be 0.5-10 seconds')
        c = a.get('camera', {})
        if not (isinstance(c.get('theta'), (int, float)) and isinstance(c.get('phi'), (int, float)) and 5 <= c['phi'] <= 175 and isinstance(c.get('r'), (int, float)) and 0.3 <= c['r'] <= 2 and num3(c.get('target'))):
            err.append(f'{w}: camera needs theta, phi (5-175), r (0.3-2, times the default distance), target [x,y,z]')
        for p in a.get('props', []):
            if p.get('type') == 'bench':
                if not (num3(p.get('size')) and isinstance(p.get('top'), (int, float)) and isinstance(p.get('pos'), list) and len(p['pos']) == 2): err.append(f'{w}: bench needs size [w,thickness,length], top, pos [x,z]')
            elif p.get('type') == 'dumbbell':
                if p.get('seg') not in ('handL', 'handR') or not isinstance(p.get('len'), (int, float)) or not isinstance(p.get('r'), (int, float)): err.append(f'{w}: dumbbell needs seg handL|handR, len, r')
            else: err.append(f"{w}: unknown prop type {p.get('type')!r}")
        ks = a.get('keys', [])
        if not 3 <= len(ks) <= 8: err.append(f'{w}: needs 3-8 keys')
        ts = [k.get('t') for k in ks]
        if not ts or ts[0] != 0 or ts[-1] != 1 or any(not isinstance(t, (int, float)) or not b > t for t, b in zip(ts, ts[1:])): err.append(f'{w}: key times must rise strictly from 0 to 1')
        chains, ends = set(), set()
        for ki, k in enumerate(ks):
            kw = f'{w} key {ki}'
            if k.get('ease', 'inOut') not in ('linear', 'inOut', 'in', 'out'): err.append(f"{kw}: unknown ease {k.get('ease')!r}")
            for f in ('pos', 'rot'):
                if f in k.get('root', {}) and not num3(k['root'][f]): err.append(f'{kw}: root.{f} must be [x,y,z]')
            for s, ik in k.get('ik', {}).items():
                if s[:-1] not in CHAINS or s not in sn: err.append(f'{kw}: IK chain {s!r} must be thighL/R or armL/R'); continue
                if ki == 0:
                    chains.add(s)
                    if 'end' in ik: ends.add(s)
                    if not num3(ik.get('target')) or not num3(ik.get('pole')): err.append(f'{kw}: IK {s} needs target and pole in key 0')
                elif s not in chains: err.append(f'{kw}: IK chain {s} must be defined in key 0')
                for f in ('target', 'pole', 'end'):
                    if f in ik and not num3(ik[f]): err.append(f'{kw}: IK {s}.{f} must be [x,y,z]')
            for s, dv in k.get('j', {}).items():
                kd = segk(s) if s in sn else None
                if not kd: err.append(f'{kw}: unknown joint segment {s!r}'); continue
                for d, v in dv.items():
                    if d not in DOFS[kd]: err.append(f'{kw}: {s} has no degree of freedom {d!r} ({"/".join(DOFS[kd])})')
                    if not isinstance(v, (int, float)) or abs(v) > 180: err.append(f'{kw}: {s}.{d} must be a number of degrees')
                for c in chains:
                    sd = c[-1]; mid, end = CHAINS[c[:-1]]
                    if s in (c, mid + sd) or (s == end + sd and c in ends): err.append(f'{kw}: joint {s!r} is driven by the IK chain {c} (its angles would be ignored)')
if rig and nex is not None and 'lod' in M and os.path.isdir(os.path.join(D, '..', 'geo')):
    import gzip
    for lv, L in M['lod'].items():
        f = os.path.join(D, '..', 'geo', 'skin-' + lv + '.bin')
        if not os.path.exists(f): err.append(f'geo/skin-{lv}.bin missing (run rig.py)'); continue
        b = gzip.decompress(open(f, 'rb').read()); n = sum(c[0] for c in L['counts'])
        if len(b) != 3 * n: err.append(f'geo/skin-{lv}.bin: {len(b)} bytes, expected {3 * n} (3 x vertices; rerun rig.py after build.py)'); continue
        p, top = 0, 0
        for nv, _ in L['counts']:
            if nv: top = max(top, max(b[p:p + 2 * nv]))
            p += 3 * nv
        if rig and top >= len(rig['seg']): err.append(f'geo/skin-{lv}.bin: segment index {top} out of range')
if err:
    print('\n'.join('LINT: ' + x for x in err)); print(f'{len(err)} problem(s)'); sys.exit(1)
print(f'lint OK: {len(mus)} muscles, {len(als)} aliases, {len(acts)} activities, {len(mov)} movements, {len(nrv)} nerves, {len(rev)} revoked licences, {nanim} animations, ' + (f'{nex} exercises checked' if nex is not None else 'exercise checks skipped'))
