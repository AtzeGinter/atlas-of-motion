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
nex = None
if os.path.exists(P('meta3.json')):
    M = json.loads(rd(P('meta3.json'))); db = M['db']; names = set(); nex = len(M['ex'])
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
else: print('NOTE: meta3.json missing, exercise checks skipped (run meta.py && exercises.py first)')
if err:
    print('\n'.join('LINT: ' + x for x in err)); print(f'{len(err)} problem(s)'); sys.exit(1)
print(f'lint OK: {len(mus)} muscles, ' + (f'{nex} exercises checked' if nex is not None else 'exercise checks skipped'))
