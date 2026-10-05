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
else: print('NOTE: meta3.json missing, exercise checks skipped (run meta.py && exercises.py first)')
if err:
    print('\n'.join('LINT: ' + x for x in err)); print(f'{len(err)} problem(s)'); sys.exit(1)
print(f'lint OK: {len(mus)} muscles, {len(als)} aliases, {len(acts)} activities, {len(nrv)} nerves, ' + (f'{nex} exercises checked' if nex is not None else 'exercise checks skipped'))
