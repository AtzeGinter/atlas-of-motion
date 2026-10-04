"""Inject meta3.json and geo.b64 into template.html -> ../index.html"""
import json, os
here = os.path.dirname(os.path.abspath(__file__))
t = open(os.path.join(here, 'template.html'), encoding='utf-8').read()
meta = json.load(open(os.path.join(here, 'meta3.json'), encoding='utf-8'))
t = t.replace('__META__', json.dumps(meta, separators=(',', ':'), ensure_ascii=False)).replace('__GEO__', open(os.path.join(here, 'geo.b64'), encoding='utf-8').read())
open(os.path.join(here, '..', 'index.html'), 'w', encoding='utf-8', newline='\n').write(t)
print('index.html written', round(len(t) / 1e6, 1), 'MB')
