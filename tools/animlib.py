"""Resolve tools/data/animations.json for the app: pose presets and left -> right mirroring. Shared by assemble.py (embeds the result as
META.anim) and lint.py (checks it). Format: docs/animation-design.md, section "Motion data".

  "_presets": {name: fragment}   a fragment is a partial key: any of root, j, ik, bar, and "use" (other presets, applied first)
  key "use": "name" | [names]    the presets are merged in order (dicts merge recursively, numbers and lists replace), then the key's own
                                 fields on top
  exercise "vars": {group: {option: {key index: partial key}}}  variation overrides (merged into that key when the option is chosen;
                                 resolved and mirrored like keys)
  exercise "sym": true (default) after merging, every left entry of j / ik (armL, foreL, thighL ...) without a right counterpart in the
                                 same key gets its mirror image: j copied (the runtime mirrors the axes), ik target / pole x negated,
                                 ik end Euler [a, b, c] -> [a, -b, -c]; "sym": false turns this off
"""
import copy

KEY_FIELDS = ('t', 'ease', 'root', 'j', 'ik', 'bar', 'use')
PRESET_FIELDS = ('root', 'j', 'ik', 'bar', 'use')


def merge(a, b):
    """Deep merge b into a copy of a (dicts recursively; anything else replaces)."""
    out = copy.deepcopy(a)
    for k, v in b.items():
        out[k] = merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else copy.deepcopy(v)
    return out


def mirror_ik(v):
    m = copy.deepcopy(v)
    for f in ('target', 'pole'):
        if isinstance(m.get(f), list) and len(m[f]) == 3: m[f] = [-m[f][0], m[f][1], m[f][2]]
    if isinstance(m.get('end'), list) and len(m['end']) == 3: m['end'] = [m['end'][0], -m['end'][1], -m['end'][2]]
    return m


def uses(x):
    u = x.get('use', [])
    return [u] if isinstance(u, str) else list(u) if isinstance(u, list) else None


def expand(frag, presets, err, where, depth=0):
    """A fragment with its "use" chain applied (presets first, then its own fields)."""
    lst = uses(frag)
    if lst is None: err.append(f'{where}: "use" must be a preset name or a list of names'); lst = []
    out = {}
    for u in lst:
        if u not in presets: err.append(f'{where}: unknown preset {u!r}'); continue
        if depth > 8: err.append(f'{where}: presets nested too deeply (cycle?)'); continue
        out = merge(out, expand(presets[u], presets, err, f'preset {u!r}', depth + 1))
    return merge(out, {k: v for k, v in frag.items() if k != 'use'})


def mirror_key(k):
    for f, fn in (('j', copy.deepcopy), ('ik', mirror_ik)):
        d = k.get(f)
        if not isinstance(d, dict): continue
        for s in [s for s in d if s.endswith('L')]:
            r = s[:-1] + 'R'
            if r not in d: d[r] = fn(d[s])
    return k


def resolve(AN):
    """-> (resolved {exercise: animation}, errors). Keys come out without "use" and with both sides filled in."""
    err = []
    presets = AN.get('_presets', {})
    if not isinstance(presets, dict): err.append('_presets must be an object'); presets = {}
    for n, p in presets.items():
        if not isinstance(p, dict): err.append(f'preset {n!r}: must be an object'); continue
        bad = [k for k in p if k not in PRESET_FIELDS]
        if bad: err.append(f'preset {n!r}: unknown field(s) {bad} (allowed: {", ".join(PRESET_FIELDS)})')
    out = {}
    for name, a in AN.items():
        if name.startswith('_'): continue
        if not isinstance(a, dict) or not isinstance(a.get('keys'), list): err.append(f'animations.json {name!r}: needs keys'); continue
        r = {k: copy.deepcopy(v) for k, v in a.items() if k not in ('keys', 'sym')}
        keys = []
        for i, k in enumerate(a['keys']):
            if not isinstance(k, dict): err.append(f'animations.json {name!r} key {i}: must be an object'); continue
            bad = [f for f in k if f not in KEY_FIELDS]
            if bad: err.append(f'animations.json {name!r} key {i}: unknown field(s) {bad}')
            x = expand(k, presets, err, f'animations.json {name!r} key {i}')
            if a.get('sym', True): mirror_key(x)
            keys.append(x)
        r['keys'] = keys
        vs = a.get('vars')
        if vs is not None:   # variation overrides: {group: {option: {key index: partial key}}}, resolved like keys
            if not isinstance(vs, dict): err.append(f'animations.json {name!r}: vars must be an object'); vs = {}
            rv = {}
            for g, opts in vs.items():
                for o, patch in (opts or {}).items():
                    if not isinstance(patch, dict): err.append(f'animations.json {name!r} vars {g}/{o}: must be an object of key index -> partial key'); continue
                    rp = {}
                    for idx, k in patch.items():
                        w = f'animations.json {name!r} vars {g}/{o} key {idx}'
                        if not (str(idx).isdigit() and int(idx) < len(keys)) or not isinstance(k, dict): err.append(f'{w}: needs a key index below {len(keys)} and a partial key'); continue
                        bad = [f for f in k if f not in KEY_FIELDS or f == 't']
                        if bad: err.append(f'{w}: unknown or fixed field(s) {bad}')
                        x = expand(k, presets, err, w)
                        if a.get('sym', True): mirror_key(x)
                        rp[str(int(idx))] = x
                    rv.setdefault(g, {})[o] = rp
            r['vars'] = rv
        out[name] = r
    return out, err
