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
# exercise animation (docs/animation-design.md): rig.json (rig.py), data/animations.json (presets resolved by animlib.py), ../geo/skin-<level>.bin
nanim = 0
DOFS = {'spine': ('flex', 'lat', 'rot'), 'clav': ('elev', 'prot'), 'ball': ('flex', 'abd', 'rot', 'twist'), 'knee': ('flex',), 'elbow': ('flex', 'pron'), 'ankle': ('flex',),
        'wrist': ('flex', 'dev', 'grip'), 'rad': (), 'finger': ()}
SEGK = {'lumbar': 'spine', 'thorax': 'spine', 'chest': 'spine', 'neck': 'spine', 'head': 'spine', 'clav': 'clav', 'arm': 'ball', 'fore': 'elbow', 'rad': 'rad',
        'hand': 'wrist', 'thigh': 'ball', 'shank': 'knee', 'foot': 'ankle'}
def segk(n):
    if n in SEGK: return SEGK[n]
    if n[-1:] in ('L', 'R'):
        b = n[:-1]
        if b in SEGK: return SEGK[b]
        if re.fullmatch(r'(th[mpd]|f[2-5][pmd])', b): return 'finger'
    return None
CHAINS = {'thigh': ('shank', 'foot'), 'arm': ('fore', 'hand')}
BARS = ('barbell', 'pullbar', 'latbar', 'vhandle', 'straightbar', 'rope', 'grip')
PMATS = ('pad', 'frame', 'iron', 'grip', 'cable')
num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)
num3 = lambda v: isinstance(v, list) and len(v) == 3 and all(num(x) for x in v)
rig = None
if os.path.exists(P('rig.json')):
    rig = json.loads(rd(P('rig.json')))
    sg = rig.get('seg', []); sn = [x['n'] for x in sg]; nb = rig.get('nbody', len(sg))
    if len(set(sn)) != len(sn) or not sn or sn[0] != 'pelvis' or sg[0]['p'] != -1: err.append('rig.json: segment names must be unique, pelvis first (root)')
    if len(sg) * 2 + 24 > 128 and any(segk(x['n']) != 'finger' for x in sg[nb:]): err.append('rig.json: only finger segments may follow nbody (they are dropped on devices with a small uniform budget)')
    if nb * 2 + 24 > 128: err.append(f'rig.json: {nb} body segments need {nb * 2} vertex-uniform vectors; keep them within the WebGL1 minimum of 128 (with ~24 for three.js)')
    for i, x in enumerate(sg):
        if i and not 0 <= x['p'] < i: err.append(f"rig.json: segment {x['n']!r} must come after its parent")
        if i and not segk(x['n']): err.append(f"rig.json: unknown segment {x['n']!r}")
        if i >= nb and x['p'] >= nb and segk(sn[x['p']]) != 'finger': err.append(f"rig.json: finger segment {x['n']!r} must hang from a hand or finger")
        j = x['j']
        if not (num3(j) and -0.35 < j[0] < 0.35 and 0 < j[1] < 1.75 and -0.15 < j[2] < 0.15): err.append(f"rig.json: pivot of {x['n']!r} outside the body box: {j}")
        if segk(x['n']) in ('rad', 'finger'):
            a = x.get('ax')
            if not (num3(a) and abs(sum(v * v for v in a) - 1) < 1e-3): err.append(f"rig.json: {x['n']!r} needs a unit axis 'ax'")
            if segk(x['n']) == 'finger' and not (num(x.get('g')) and 0 <= x['g'] <= 120): err.append(f"rig.json: finger segment {x['n']!r} needs a grip angle g (0-120 degrees)")
        if x['n'].endswith('L') and x['n'][:-1] + 'R' in sn:
            r = sg[sn.index(x['n'][:-1] + 'R')]['j']
            if abs(j[0] + r[0]) > 0.015 or abs(j[1] - r[1]) > 0.015 or abs(j[2] - r[2]) > 0.015: err.append(f"rig.json: {x['n']!r} and its right twin are not symmetric ({j} vs {r})")
    for k in ('gaxL', 'gaxR', 'gfdL', 'gfdR'):
        if not num3(rig.get('dir', {}).get(k)): err.append(f'rig.json: dir.{k} missing')
else: print('NOTE: rig.json missing, animation checks skipped (run rig.py; assemble.py needs it)')
if rig and os.path.exists(P('data', 'animations.json')):
    try: AN0 = json.loads(rd(P('data', 'animations.json')))
    except ValueError as e: AN0 = {}; err.append(f'animations.json: not valid JSON ({e})')
    import animlib
    AN, aerr = animlib.resolve(AN0)
    err += aerr
    sn = [x['n'] for x in rig['seg']] if rig else []
    exn = {e['n'] for e in M['ex']} if nex is not None else None
    npre = len(AN0.get('_presets', {})); used = set()
    for a in list(AN0.values()) + list(AN0.get('_presets', {}).values()):
        if isinstance(a, dict):
            for k in a.get('keys', [a]):
                if isinstance(k, dict): used |= set(animlib.uses(k) or [])
    for n in AN0.get('_presets', {}):
        if n not in used: print(f'INFO: animation preset {n!r} is not used yet')
    def anchor_ok(v, held):   # [x,y,z] | {seg, at} | {seg: handL|handR, grip: d} | {bar: [x,y,z] | "L" | "R"}
        if num3(v): return True
        if not isinstance(v, dict): return False
        if 'bar' in v: return bool(held) and set(v) == {'bar'} and (num3(v['bar']) or v['bar'] in ('L', 'R', 'ring'))
        if v.get('seg') not in sn or (segk(v['seg']) == 'finger' and 'grip' in v) or set(v) - {'seg', 'at', 'grip'}: return False
        if 'grip' in v: return v['seg'] in ('handL', 'handR') and num(v['grip']) and 'at' not in v
        return 'at' not in v or num3(v['at'])
    def part_ok(q):
        if not isinstance(q, dict): return False
        sh = [k for k in ('box', 'cyl', 'rod', 'sph') if k in q]
        if len(sh) != 1 or set(q) - {'box', 'cyl', 'rod', 'sph', 'r', 'pos', 'rot', 'mat', 'pad', 'name'}: return False
        if 'sph' in q and not (num(q['sph']) and 0 < q['sph'] <= 1 and not q.get('pad')): return False
        if 'box' in q and not (num3(q['box']) and all(0 < v <= 3 for v in q['box'])): return False
        if 'cyl' in q and not (isinstance(q['cyl'], list) and len(q['cyl']) == 2 and all(num(v) and 0 < v <= 3 for v in q['cyl'])): return False
        if 'rod' in q and not (isinstance(q['rod'], list) and len(q['rod']) == 2 and all(num3(v) for v in q['rod']) and ('r' not in q or (num(q['r']) and 0 < q['r'] <= 0.2)) and 'pos' not in q and 'rot' not in q): return False
        if q.get('pad') and 'rod' in q: return False
        return all(num3(q[f]) for f in ('pos', 'rot') if f in q) and q.get('mat', 'frame') in PMATS
    def check_anim(w, a):
            if not num(a.get('dur')) or not 0.5 <= a['dur'] <= 30: err.append(f'{w}: dur must be 0.5-30 seconds')
            c = a.get('camera', {})
            if not (num(c.get('theta')) and num(c.get('phi')) and 5 <= c['phi'] <= 175 and num(c.get('r')) and 0.3 <= c['r'] <= 2 and num3(c.get('target'))):
                err.append(f'{w}: camera needs theta, phi (5-175), r (0.3-2, times the default distance), target [x,y,z]')
            held = None
            for p in a.get('props', []):
                ty = p.get('type')
                if ty == 'bench':
                    if not (num3(p.get('size')) and num(p.get('top')) and isinstance(p.get('pos'), list) and len(p['pos']) == 2): err.append(f'{w}: bench needs size [w,thickness,length], top, pos [x,z]')
                    if 'incline' in p and not (num(p['incline']) and 0 <= p['incline'] <= 85): err.append(f'{w}: bench incline must be 0-85 degrees')
                    if 'seat' in p and not (num(p['seat']) and 0.2 <= p['seat'] <= p['size'][2] - 0.2): err.append(f'{w}: bench seat must be 0.2 m .. length - 0.2 m')
                    if 'yaw' in p and not num(p['yaw']): err.append(f'{w}: bench yaw must be degrees')
                elif ty == 'roller':
                    if not num3(p.get('pos')): err.append(f'{w}: roller needs pos [x,y,z]')
                elif ty == 'dumbbell':
                    if p.get('seg') not in sn or segk(p['seg']) == 'finger' or not num(p.get('len')) or not num(p.get('r')): err.append(f'{w}: dumbbell needs seg (handL|handR, or a body segment with at), len, r')
                    elif p['seg'] not in ('handL', 'handR') and (not num3(p.get('at')) or ('rot' in p and not num3(p['rot']))): err.append(f'{w}: a dumbbell on {p["seg"]} needs at [x,y,z] (bind pose) and optionally rot [x,y,z] degrees')
                elif ty in BARS:
                    if held: err.append(f'{w}: only one held bar per animation')
                    held = p
                    if 'w' in p and not (num(p['w']) and (0.08 if ty in ('rope', 'grip') else 0.15) <= p['w'] <= 1.6): err.append(f'{w}: bar grip width w must be 0.15-1.6 m (rope, grip: from 0.08)')
                    if 'seg' in p and (p['seg'] not in sn or segk(p['seg']) == 'finger' or not num3(p.get('at'))): err.append(f'{w}: a bar attached to a segment needs seg (a body segment) and at [x,y,z] (bind pose)')
                    if ('toward' in p or 'len' in p and ty == 'rope') and not (ty == 'rope' and num3(p.get('toward', [0, 0, 0])) and num(p.get('len', 0.27)) and 0.1 <= p.get('len', 0.27) <= 0.5): err.append(f'{w}: a rope takes toward [x,y,z] (where its ring points, the pulley) and len (strand length 0.1-0.5 m)')
                    if 'handles' in p and not (ty == 'pullbar' and isinstance(p['handles'], list) and len(p['handles']) == 2 and all(num(v) for v in p['handles']) and 0.2 <= p['handles'][0] <= 1 and 0.05 <= p['handles'][1] <= 0.3): err.append(f'{w}: handles (pullbar only) are [distance 0.2-1 m, length 0.05-0.3 m]')
                    for pl in p.get('plates', []):
                        if not (isinstance(pl, list) and len(pl) == 2 and all(num(v) for v in pl) and 0.05 <= pl[0] <= 0.25 and 0.01 <= pl[1] <= 0.1): err.append(f'{w}: plates are [radius 0.05-0.25, thickness 0.01-0.1]')
                elif ty == 'cable':
                    hb = any(q.get('type') in BARS for q in a.get('props', []))
                    if not num3(p.get('pulley')): err.append(f'{w}: cable needs pulley [x,y,z]')
                    if 'to' in p and not anchor_ok(p['to'], hb): err.append(f'{w}: cable "to" must be an anchor ([x,y,z], {{seg, at}}, {{seg: handL|handR, grip}}, {{bar}})')
                    if 'to' not in p and not hb: err.append(f'{w}: a cable needs a held bar to pull (or an anchor "to")')
                    if 'top' in p and not (num(p['top']) and 0 < p['top'] <= 3): err.append(f'{w}: cable top (tower height) must be 0-3 m')
                    if 'stack' in p and not (isinstance(p['stack'], list) and len(p['stack']) == 2 and all(num(v) for v in p['stack'])): err.append(f'{w}: cable stack is [x, z]')
                elif ty == 'machine':
                    hb = any(q.get('type') in BARS for q in a.get('props', []))
                    if not isinstance(p.get('parts'), list) or not p['parts'] or not all(part_ok(q) for q in p['parts']): err.append(f'{w}: machine needs parts, each one of box [sx,sy,sz] | cyl [r, length] | sph r | rod [[x,y,z],[x,y,z]] (+ r) with optional pos, rot, mat ({"|".join(PMATS)}), pad, name')
                    if 'seg' in p:
                        if p['seg'] == 'bar':
                            if not hb: err.append(f'{w}: a machine part on the bar needs a held bar')
                        elif p['seg'] not in sn or (segk(p['seg']) == 'finger' and (p.get('follow', 'rigid') != 'rigid' or 'at' in p and not num3(p['at']))): err.append(f'{w}: machine seg must be a body segment or "bar" (a finger segment: rigid, at [x,y,z])')
                        if 'at' in p and not (num3(p['at']) or (p['at'] == 'grip' and p.get('seg') in ('handL', 'handR'))): err.append(f'{w}: machine at is [x,y,z] (bind pose) or "grip" (hands)')
                        if p.get('follow', 'rigid') not in ('rigid', 'move') or (p.get('follow') == 'move' and p['seg'] == 'bar'): err.append(f'{w}: machine follow is "rigid" or "move" (segments only)')
                        if ('axis' in p or 'base' in p or 'normal' in p) and not (p.get('follow') == 'move' and num3(p.get('axis')) and num3(p.get('base', [0, 0, 0])) and num3(p.get('normal', [0, 0, 1]))): err.append(f'{w}: machine axis [x,y,z] (+ base [x,y,z], a point on the rail line, + normal [x,y,z] of a contact plane) needs follow "move"')
                        if 'rot' in p and not num3(p['rot']): err.append(f'{w}: machine rot must be [x,y,z] degrees')
                    else:
                        if [k for k in ('at', 'follow', 'rot') if k in p]: err.append(f'{w}: at / follow / rot need a seg (a static machine takes pos and yaw)')
                        if 'pos' in p and not num3(p['pos']): err.append(f'{w}: machine pos must be [x,y,z]')
                        if 'yaw' in p and not num(p['yaw']): err.append(f'{w}: machine yaw must be degrees')
                        if 'aim' in p and (not anchor_ok(p['aim'], hb) or 'yaw' in p or not num3(p.get('pos'))): err.append(f'{w}: machine aim (an anchor its local +y points at: a lever or landmine bar) needs pos (the pivot) and no yaw')
                elif ty == 'link':
                    hb = any(q.get('type') in BARS for q in a.get('props', []))
                    if not (anchor_ok(p.get('from'), hb) and anchor_ok(p.get('to'), hb)): err.append(f'{w}: link needs anchors from and to ([x,y,z], {{seg, at}}, {{seg: handL|handR, grip}}, {{bar}})')
                    if 'r' in p and not (num(p['r']) and 0 < p['r'] <= 0.1): err.append(f'{w}: link r must be 0-0.1 m')
                    if p.get('mat', 'frame') not in PMATS: err.append(f'{w}: link mat must be one of {", ".join(PMATS)}')
                else: err.append(f"{w}: unknown prop type {ty!r}")
            ks = a.get('keys', [])
            if not 3 <= len(ks) <= 32: err.append(f'{w}: needs 3-32 keys')
            ts = [k.get('t') for k in ks]
            if not ts or ts[0] != 0 or ts[-1] != 1 or any(not num(t) or not b > t for t, b in zip(ts, ts[1:])): err.append(f'{w}: key times must rise strictly from 0 to 1')
            b0 = (ks[0].get('bar') or {}) if ks else {}
            if held and 'seg' not in held and not num3(b0.get('pos')) and 'hang' not in b0 and not num3(held.get('pos')): err.append(f'{w}: the held bar needs bar.pos or bar.hang in key 0 (or seg + at on the prop)')
            if any('hang' in (k.get('bar') or {}) for k in ks) and 'hang' not in b0: err.append(f'{w}: bar.hang must start in key 0')
            hanging = isinstance(b0.get('hang'), list)
            chains, ends, bars = set(), set(), set()
            fx0 = (ks[0].get('root') or {}).get('fix') if ks else None   # root.fix: the root follows a contact point (seg, at) placed at "to"
            if fx0 is not None:
                if not (isinstance(fx0, dict) and fx0.get('seg') in sn and segk(fx0['seg']) != 'finger' and num3(fx0.get('at')) and num3(fx0.get('to')) and not set(fx0) - {'seg', 'at', 'to'}):
                    err.append(f'{w} key 0: root.fix needs seg (a body segment), at [x,y,z] (bind pose) and to [x,y,z] (world)')
                else:
                    anc, k = set(), sn.index(fx0['seg'])
                    while k > 0: anc.add(sn[k]); k = rig['seg'][k]['p']
                    for c in (ks[0].get('ik') or {}):
                        if c in sn and c[:-1] in CHAINS and anc & {c, CHAINS[c[:-1]][0] + c[-1], CHAINS[c[:-1]][1] + c[-1]}: err.append(f'{w}: root.fix on {fx0["seg"]} cannot hang below the IK chain {c} (the contact point needs forward kinematics)')
            for ki, k in enumerate(ks):
                kw = f'{w} key {ki}'
                if k.get('ease', 'inOut') not in ('linear', 'inOut', 'in', 'out'): err.append(f"{kw}: unknown ease {k.get('ease')!r}")
                for f in ('pos', 'rot'):
                    if f in k.get('root', {}) and not num3(k['root'][f]): err.append(f'{kw}: root.{f} must be [x,y,z]')
                fx = (k.get('root') or {}).get('fix')
                if ki and fx is not None:
                    if fx0 is None: err.append(f'{kw}: root.fix must start in key 0')
                    elif not (isinstance(fx, dict) and num3(fx.get('to', [0, 0, 0])) and all(fx.get(f, fx0.get(f)) == fx0.get(f) for f in ('seg', 'at')) and not set(fx) - {'seg', 'at', 'to'}): err.append(f'{kw}: a later root.fix may only move "to" [x,y,z] (seg and at stay those of key 0)')
                if fx0 is not None and 'pos' in (k.get('root') or {}): err.append(f'{kw}: root.pos is computed from root.fix (leave it out)')
                if [f for f in (k.get('root') or {}) if f not in ('pos', 'rot', 'fix')]: err.append(f'{kw}: root takes pos, rot, fix')
                b = k.get('bar')
                if b is not None:
                    if not held or ('seg' in held and set(b) - {'w'}): err.append(f'{kw}: bar keys need a held bar prop (one attached to a segment takes only w)')
                    for f in ('pos', 'rot'):
                        if f in b and not num3(b[f]): err.append(f'{kw}: bar.{f} must be [x,y,z]')
                    if 'w' in b and not (num(b['w']) and (0.08 if held and held.get('type') in ('rope', 'grip') else 0.15) <= b['w'] <= 1.6): err.append(f'{kw}: bar.w must be 0.15-1.6 m (rope, grip: from 0.08)')
                    # a hanging bar may switch to a positioned one ("hang": null + pos = where the hanging bar is at that key) and back
                    # ("hang": [f, tilt] + pos = where the positioned bar is when it starts to hang): the segment before the switch key keeps
                    # the old mode, so the bar is continuous when pos matches (power clean: straight-arm pull, then the pull under and the catch)
                    if 'hang' in b:
                        hg = b['hang']
                        if hg is None:
                            if not ki or not hanging or not num3(b.get('pos')): err.append(f'{kw}: bar.hang null switches a hanging bar to bar.pos (needs pos, after key 0, while the bar hangs)')
                            hanging = False
                        else:
                            if not (isinstance(hg, list) and len(hg) == 2 and all(num(v) for v in hg) and 0.8 <= hg[0] <= 1 and -180 <= hg[1] <= 180): err.append(f'{kw}: bar.hang is [reach fraction 0.8-1, tilt -180..180 degrees]')
                            if 'pos' in b and (not ki or hanging): err.append(f'{kw}: bar takes pos or hang, not both (pos with hang only where a positioned bar starts to hang)')
                            hanging = True
                    elif 'pos' in b and hanging: err.append(f'{kw}: bar.pos is ignored while the bar hangs (switch with "hang": null)')
                    if [f for f in b if f not in ('pos', 'rot', 'w', 'hang')]: err.append(f'{kw}: bar takes pos, rot, w, hang')
                for s, ik in k.get('ik', {}).items():
                    if s[:-1] not in CHAINS or s not in sn: err.append(f'{kw}: IK chain {s!r} must be thighL/R or armL/R'); continue
                    if ki == 0:
                        chains.add(s)
                        if 'end' in ik or 'hax' in ik: ends.add(s)
                        if 'bar' in ik: bars.add(s)
                        if not num3(ik.get('pole')) or ('bar' not in ik and not num3(ik.get('target'))): err.append(f'{kw}: IK {s} needs target (or bar) and pole in key 0')
                    elif s not in chains: err.append(f'{kw}: IK chain {s} must be defined in key 0')
                    elif ('bar' in ik) != (s in bars) and 'bar' in ik: err.append(f'{kw}: IK {s} cannot switch to a bar grip after key 0')
                    if 'bar' in ik:
                        if s[:-1] != 'arm' or ik['bar'] not in ('over', 'under', 'neutral'): err.append(f'{kw}: IK {s}.bar must be "over", "under" or "neutral" (arms only)')
                        if not held: err.append(f'{kw}: IK {s} grips a bar but there is no barbell / pullbar / latbar prop')
                        if 'target' in ik or 'end' in ik: err.append(f'{kw}: IK {s} on a bar takes no target / end (the bar sets both)')
                    if ('hax' in ik) != ('hfd' in ik) or (('hax' in ik) and (s[:-1] != 'arm' or 'end' in ik or 'bar' in ik)): err.append(f'{kw}: IK {s}: a handle needs both hax and hfd (arms only, not with end or bar)')
                    if ki and ('hax' in ik) != (s in ends and 'end' not in ks[0]['ik'][s]) and 'hax' in ik: err.append(f'{kw}: IK {s} cannot switch to a handle after key 0')
                    if 'wext' in ik and not (num(ik['wext']) and -60 <= ik['wext'] <= 90): err.append(f'{kw}: IK {s}.wext must be -60..90 degrees')
                    for f in ('target', 'pole', 'end', 'hax', 'hfd'):
                        if f in ik and not num3(ik[f]): err.append(f'{kw}: IK {s}.{f} must be [x,y,z]')
                    if [f for f in ik if f not in ('target', 'pole', 'end', 'bar', 'wext', 'hax', 'hfd')]: err.append(f'{kw}: IK {s} takes target, pole, end, bar, wext, hax, hfd')
                for s, dv in k.get('j', {}).items():
                    kd = segk(s) if s in sn else None
                    if not kd or kd in ('rad', 'finger'): err.append(f'{kw}: unknown joint segment {s!r} (fingers: hand grip; forearm rotation: fore pron)'); continue
                    for d, v in dv.items():
                        if d not in DOFS[kd]: err.append(f'{kw}: {s} has no degree of freedom {d!r} ({"/".join(DOFS[kd])})')
                        if not num(v) or abs(v) > 180: err.append(f'{kw}: {s}.{d} must be a number of degrees')
                        if d == 'grip' and not (num(v) and -1 <= v <= 1): err.append(f'{kw}: {s}.grip must be -1..1 (negative = fingers straightened: a flat hand on the floor)')
                        if d == 'pron' and not (num(v) and -20 <= v <= 180): err.append(f'{kw}: {s}.pron must be -20..180 degrees')
                    for c in chains:
                        sd = c[-1]; mid, end = CHAINS[c[:-1]]
                        auto = c in ends or c in bars
                        if s == c or (s == mid + sd and (auto or set(dv) - {'pron'})) or (s == end + sd and auto and set(dv) - {'grip'}):
                            err.append(f'{kw}: joint {s!r} {sorted(dv)} is driven by the IK chain {c} (its angles would be ignored)')
    exv = {e["n"]: e.get("v", []) for e in M["ex"]} if nex is not None else {}
    for name, a in AN.items():
        nanim += 1; w = f'animations.json {name!r}'
        if exn is not None and name not in exn: err.append(f'{w}: no exercise of that name')
        check_anim(w, a)
        groups = {g[0]: [o[0] for o in g[1]] for g in exv.get(name, [])}
        for g, opts in a.get("vars", {}).items():
            if exn is not None and g not in groups: err.append(f'{w}: vars group {g!r} is not a variation group of the exercise ({", ".join(groups) or "none"})'); continue
            for o, patch in opts.items():
                if exn is not None and o not in groups[g]: err.append(f'{w}: vars {g}/{o}: no such option ({", ".join(groups[g])})'); continue
                if o == (groups.get(g) or [None])[0]: err.append(f'{w}: vars {g}/{o} is the default option (put it in keys instead)')
                check_anim(f'{w} [{g}: {o}]', dict(a, props=patch.get('props', a.get('props', [])), keys=[animlib.merge(k, patch.get(str(i), {})) for i, k in enumerate(a['keys'])]))
if rig and nex is not None and 'lod' in M and os.path.isdir(os.path.join(D, '..', 'geo')):
    import gzip
    for lv, L in M['lod'].items():
        f = os.path.join(D, '..', 'geo', 'skin-' + lv + '.bin')
        if not os.path.exists(f): err.append(f'geo/skin-{lv}.bin missing (run rig.py)'); continue
        b = gzip.decompress(open(f, 'rb').read()); n = sum(c[0] for c in L['counts'])
        if len(b) != 5 * n: err.append(f'geo/skin-{lv}.bin: {len(b)} bytes, expected {5 * n} (5 x vertices; rerun rig.py after build.py)'); continue
        p, top, wbad = 0, 0, 0
        for nv, _ in L['counts']:
            if nv:
                top = max(top, max(b[p:p + 3 * nv]))
                wbad += sum(1 for x, y in zip(b[p + 3 * nv:p + 4 * nv], b[p + 4 * nv:p + 5 * nv]) if x + y > 255)
            p += 5 * nv
        if rig and top >= len(rig['seg']): err.append(f'geo/skin-{lv}.bin: segment index {top} out of range')
        if wbad: err.append(f'geo/skin-{lv}.bin: {wbad} vertices whose first two weights exceed 255')
if err:
    print('\n'.join('LINT: ' + x for x in err)); print(f'{len(err)} problem(s)'); sys.exit(1)
print(f'lint OK: {len(mus)} muscles, {len(als)} aliases, {len(acts)} activities, {len(mov)} movements, {len(nrv)} nerves, {len(rev)} revoked licences, {nanim} animations, ' + (f'{nex} exercises checked' if nex is not None else 'exercise checks skipped'))
