"""Inject meta3.json into template.html -> ../index.html (geometry stays in ../geo/*.bin, fetched at runtime)"""
import json, os, hashlib
here = os.path.dirname(os.path.abspath(__file__))
t = open(os.path.join(here, 'template.html'), encoding='utf-8').read()
meta = json.load(open(os.path.join(here, 'meta3.json'), encoding='utf-8'))
# cache-bust: ?v=<content hash> so browsers never pair a cached old .bin with new mesh counts
for L in meta['lod'].values(): L['file'] += '?v=' + hashlib.md5(open(os.path.join(here, '..', L['file']), 'rb').read()).hexdigest()[:10]
t = t.replace('__META__', json.dumps(meta, separators=(',', ':'), ensure_ascii=False))
open(os.path.join(here, '..', 'index.html'), 'w', encoding='utf-8', newline='\n').write(t)
print('index.html written', round(len(t) / 1e6, 1), 'MB')
