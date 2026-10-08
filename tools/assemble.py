"""Inject meta3.json into template.html -> ../index.html (geometry stays in ../geo/*.bin, fetched at runtime)
and render sw.template.js -> ../sw.js (service worker with a build hash over index.html + the precached shell files)"""
import json, os, hashlib
here = os.path.dirname(os.path.abspath(__file__))
t = open(os.path.join(here, 'template.html'), encoding='utf-8').read()
meta = json.load(open(os.path.join(here, 'meta3.json'), encoding='utf-8'))
root = os.path.join(here, '..')
md5 = lambda path: hashlib.md5(open(path, 'rb').read()).hexdigest()
# cache-bust: ?v=<content hash> so browsers never pair a cached old .bin with new mesh counts
for L in meta['lod'].values(): L['file'] += '?v=' + md5(os.path.join(root, L['file']))[:10]
metaj = json.dumps(meta, separators=(',', ':'), ensure_ascii=False)
# version shown in the corner: tools/version.txt (bump it for every release) + a build id hashed from the sources (reproducible, no git data)
version = open(os.path.join(here, 'version.txt'), encoding='utf-8').read().strip()
# licence verification (Pro groundwork): public key (JWK, tools/license-public.jwk) and the revocation list (tools/data/revoked.txt), both embedded as JSON
licpub = json.dumps(json.load(open(os.path.join(here, 'license-public.jwk'), encoding='utf-8')), separators=(',', ':'))
licrev = json.dumps([l.split('#')[0].strip() for l in open(os.path.join(here, 'data', 'revoked.txt'), encoding='utf-8').read().split(chr(10)) if l.split('#')[0].strip()], separators=(',', ':'))
buildid = hashlib.md5((t + metaj + version + licpub + licrev).encode()).hexdigest()[:7]
t = t.replace('__META__', metaj).replace('__VERSION__', version).replace('__BUILDID__', buildid).replace('__LICPUB__', licpub).replace('__LICREV__', licrev)
open(os.path.join(here, '..', 'index.html'), 'w', encoding='utf-8', newline='\n').write(t)
print('index.html written', round(len(t) / 1e6, 1), 'MB, version', version, 'build', buildid)

# service worker: precache list = app shell; build hash covers every precached file so any change gives a new cache name
SHELL_FILES = ['index.html', 'manifest.webmanifest', 'vendor/three.min.js', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
               'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
               'fonts/archivo-latin.woff2', 'fonts/fraunces-latin.woff2', 'fonts/source-serif-4-latin-400.woff2', 'fonts/source-serif-4-latin-italic-400.woff2']
build = hashlib.md5(''.join(f + md5(os.path.join(root, f)) for f in SHELL_FILES).encode()).hexdigest()[:10]
geohash = hashlib.md5(''.join(sorted(L['file'] for L in meta['lod'].values())).encode()).hexdigest()[:10]
sw = open(os.path.join(here, 'sw.template.js'), encoding='utf-8').read()
sw = sw.replace('__BUILD__', build).replace('__GEOHASH__', geohash).replace('__PRECACHE__', json.dumps(SHELL_FILES, indent=2))
open(os.path.join(root, 'sw.js'), 'w', encoding='utf-8', newline='\n').write(sw)
print('sw.js written, build', build, 'geo', geohash)
