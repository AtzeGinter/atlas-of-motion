"""Recover geo.b64 and meta2.json from the committed ../index.html, with db/bdb rebuilt from data/*.txt and bones.py.
Lets you rebuild after text/template/exercise edits without the BodyExplorer clone:
    python extract.py && python exercises.py && python assemble.py"""
import json, re
from meta import load_db
import bones as B
s = open('../index.html', encoding='utf-8', newline='').read()
i = s.index('<script id="geo"'); j = s.index('>', i) + 1
open('geo.b64', 'w', encoding='utf-8', newline='\n').write(s[j:s.index('</script>', j)])
i = s.index('const META=') + len('const META=')
M, _ = json.JSONDecoder().raw_decode(s, i)
db = load_db()
for kind, k, *_ in M['meshes']:
    if kind == 'm': assert k in db, k
bs = {k for kind, k, *_ in M['meshes'] if kind == 'b'}
bn = [b for b in M['bdb'] if b in bs] + sorted(bs - set(M['bdb']))  # keep committed key order
M['db'] = db; M['bdb'] = {b: B.info(b) for b in bn}; del M['ex']  # bones.info raises on unknown bones
json.dump(M, open('meta2.json', 'w', encoding='utf-8', newline='\n'), separators=(',', ':'))
print('geo.b64', len(s[j:s.index('</script>', j)]), 'chars;', len(M['meshes']), 'meshes,', len(db), 'db keys,', len(bn), 'bones')
