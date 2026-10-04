# CLAUDE.md: Myology

Browser-based 3D atlas of the human muscular system plus a strength-exercise database, exercise comparison and a weekly workout planner. Static site, no backend, no build framework. Target deployment: GitHub Pages.

## Golden rules

- **`index.html` is generated.** Never hand-edit it. Edit `tools/template.html` (UI/JS/CSS) or the data sources in `tools/`, then run the pipeline (see below) to regenerate it.
- `index.html` is ~7 MB because the mesh data is embedded as base64. Do not open or print it whole; grep or read `tools/template.html` instead.
- Anatomy keys are lower-case English names from the source data (e.g. `"gluteus medius"`, `"pectoralis major"`). Every exercise target must reference an existing key (and, if given, an existing part). `tools/exercises.py` asserts this; keep the asserts.
- After any change: rebuild, then run the smoke test (`tools/test`).

## Repository layout

```
index.html            GENERATED app (template + embedded data). Served by GitHub Pages.
README.md             Public description, features, credits, licensing.
CLAUDE.md             This file.
LICENSE               MIT: code, anatomy text, exercise data.
LICENSE-DATA          CC BY-SA 4.0: embedded 3D mesh data.
.gitignore            Ignores intermediates (meta*.json, geo.b64, BodyExplorer clone, node_modules).
tools/
  template.html       The whole app source: HTML + CSS + one inline <script>. Placeholders __GEO__ and __META__.
  build.py            Mesh pipeline: load GLBs, decimate, transform, quantise, pack -> geo.b64 + meta.json
  extract.py          Recover geo.b64 + meta2.json from the committed ../index.html (db/bdb rebuilt from data/*.txt + bones.py); replaces build.py + meta.py for non-mesh changes
  meta.py             Map each mesh to an anatomy key/side/part, attach muscle + bone info -> meta2.json
  bones.py            Bone descriptions and regions (imported by meta.py)
  exercises.py        Exercise database, variations, equipment categories -> meta3.json
  assemble.py         Inject meta3.json + geo.b64 into template.html -> ../index.html
  data/muscles.txt    Muscle/connective-tissue info, one line per key: key|group|action;action|origin|insertion|nerve
  data/extra.txt      Optional extras per key: key|exercises text|clinical note
  test/smoke.js       jsdom smoke test (real three.js, WebGL stubbed); package.json alongside
```

## Build pipeline

Run from `tools/` (scripts use relative paths):

```bash
cd tools
git clone --depth 1 https://github.com/JohanBellander/BodyExplorer.git   # source GLBs, ~60 MB
pip install trimesh pyfqmr numpy
python build.py 0.45 0.35   # args: muscle and bone decimation ratios -> geo.b64, meta.json
python meta.py              # -> meta2.json
python exercises.py         # -> meta3.json
python assemble.py          # -> ../index.html
cd test && npm install && npm test
```

If you only changed `template.html`, `data/*.txt`, `bones.py` or `exercises.py`, skip `build.py` and `meta.py` and run `python extract.py && python exercises.py && python assemble.py` (no BodyExplorer clone needed; `extract.py` reads the mesh data and mesh list from the committed `../index.html` and rebuilds `db`/`bdb` from the text sources). Regenerating without edits reproduces `index.html` byte for byte. The full pipeline is still needed after changing `build.py` decimation or the mesh mapping in `meta.py` (`PARTPRE`, `HEADPRE`, `MERGE`). Scripts read/write UTF-8 with LF explicitly, so Windows builds are safe. Changing decimation in `build.py` changes mesh order/counts; always rerun everything after it.

### Source data

- `BodyExplorer/public/anatomy.glb`: 467 muscle/tendon meshes (401 BodyParts3D + 66 Z-Anatomy), already aligned. Names like `"acromial part of left deltoid"`.
- `BodyExplorer/public/skeleton.glb`: 201 bone meshes. No sacrum, coccyx or costal cartilages.
- Source coordinates: millimetres, X = subject's left (+), Y = posterior (+, so the front is -Y), Z = up.

### build.py

- Decimates each mesh with pyfqmr to `max(min(faces,300), faces*ratio)`; total ~770k triangles.
- Transforms to scene space in metres: `x = X`, `y = Z` (up), `z = -Y` (front faces +z). Shifts so x/z are centred and the feet sit at y = 0. Height ≈ 1.71.
- Reorders vertices by first use, quantises positions to uint16 over the global bbox (`lo`, `span` in meta).
- Binary layout (all little-endian uint16, gzip-compressed, then base64), per mesh in meta order: x-plane[nv], y-plane[nv], z-plane[nv], then indices[nf*3]. Each stream is delta-coded (wrap-around mod 65536) and zigzag-encoded. Decoder: `prev = (prev + ((z>>>1) ^ -(z&1))) & 0xFFFF`. Max 65535 vertices per mesh (asserted).

### meta.py

- Canonicalises names: strips left/right (stored as side `"L"`/`"R"`), `(2)` suffixes, `" of hand"`/`" of foot"` → `" (hand)"`/`" (foot)"`.
- Derives the info **key** by stripping part/head prefixes (`PARTPRE`, `HEADPRE`, e.g. `"acromial part of deltoid"` → key `"deltoid"`, part `"acromial part"`) and merging series via `MERGE` (lumbricals, multifidus, iliocostalis, levator ani parts, thoracolumbar fascia layers, ...).
- Fails loudly if a key has no entry in `data/muscles.txt`, or a bone has no entry in `bones.py`.

### exercises.py

- `G`: macros for muscle sets (`QUADV`, `HAMS`, `ERECT`, `GRIP`, `TRI`, `OBL`, ...). Entries are `"key"` or `"key|part"`.
- `E`: list of `(name, category, equipment, cue, spec)`; `spec` = comma list of `TARGET:level`, level 3 = prime mover, 2 = synergist, 1 = stabiliser.
- `VARS`: per-exercise variation groups `{name: [(group, [(option, overrideSpec), ...])]}`. First option is the default and usually `""`. Overrides replace levels; `:0` removes a target. Part-specific overrides split a whole-muscle target into parts.
- `EQ`: maps the free-text equipment string to filter categories (Barbell, Dumbbells, Kettlebell, Cable, Machine, Bodyweight, Band, Other). A new equipment string needs an entry here or the script raises KeyError.
- Categories (must match `EXCATS` in template.html): Chest & shoulders, Back, Arms, Legs, Hinge, Full body, Core, Grip & carry, Neck.
- Current size: 113 exercises, 18 with variations, 80 muscles covered.

## META object (embedded as `const META=...`)

```js
{
  lo:[x,y,z], span:[x,y,z],                 // dequantisation
  meshes:[[kind,key,side,part,nv,nf], ...], // kind "m" (muscle/tissue) or "b" (bone); same order as the binary
  db:{ key:{g:group, a:[actions], o:origin, i:insertion, n:nerve, t?:exercisesText, x?:note} },
  bdb:{ boneKey:[region, description] },
  ex:[{ n:name, c:category, e:equipment, q:cue, t:[[key,part,level],...], v?:[[group,[[option,[[key,part,level],...]],...]]], eq:[categories] }]
}
```

Muscle groups (`MGROUPS` in template): Face, Eye, Jaw, Neck, Throat, Back, Shoulder, Chest, Abdomen, Pelvic floor, Upper arm, Forearm, Hand, Hip, Thigh, Lower leg, Foot, plus `"Connective tissue"` (tendons, fasciae, ligaments; separate layer toggle). Bone regions: Skull, Spine, Thorax, Arm, Hand, Pelvis & leg, Foot.

## Frontend architecture (tools/template.html)

Single `async` IIFE, no modules, no framework. Three.js **r128** UMD from cdnjs (r128 APIs: `outputEncoding`, `sRGBEncoding`, `convertSRGBToLinear`). Fonts: Archivo + Source Serif 4 (Google Fonts). Light/dark via CSS custom properties on `:root`.

### Startup
1. Create renderer/scene/lights, materials.
2. Decode `#geo` (atob → `DecompressionStream('gzip')` → Uint16Array) and build one `THREE.Mesh` per META row (`computeVertexNormals`, `DoubleSide`, `matrixAutoUpdate=false`).
3. Index: `muscleMeshes`, `boneMeshes`, `byKey[key]`, `byBone[key]`. `mesh.userData = {kind:"muscle"|"bone", key, side, part, group, tissue}`.
4. Build UI lists, restore localStorage, `applyVisuals()`, remove loading overlay.

### Camera and rendering
- Custom orbit (`orbit` current, `goal` target; theta/phi/r/ty) with pointer events, pinch, wheel; damped in `tick()`.
- Render on demand: `tick()` renders only if the camera is moving or `dirty` is set. Anything that changes visuals must go through `applyVisuals()` (sets `dirty`).
- `focusOn(kind,key)`, `faceTowards(meshes)` and `bodyZ(y)` decide front/back view and zoom.

### State (module-level variables)
| Variable | Meaning |
|---|---|
| `state` | layers (bones/muscles/tendons), isolate, opacities, active muscle groups |
| `hidden` | Set of `"muscle:key"` / `"bone:key"` hidden by the user (both sides) |
| `sel` | selected structure `{kind,key}` or null |
| `selEx`, `exVars` | selected exercise index; chosen variation per exercise `{i:[optIdx per group]}` |
| `cmp`, `cmpPick` | comparison `[{i,v},{i,v}]`; waiting for the second pick |
| `plan`, `volOn` | workout plan `[{n:name, sets, v}]`; volume heatmap toggle |
| `eqOn` | enabled equipment categories |
| `mode` | heat mode: `null`, `"ex"`, `"cmp"`, `"vol"`. Set only via `setMode()` |
| `heat`, `heatTip` | Map mesh → material / tooltip text for the current mode |
| `view` | which card is shown: `"sel"`, `"ex"`, `"cmp"` |

### Material precedence in applyVisuals()
selected structure (`M_SEL`) → heat mode material (`HM` levels, `CM` comparison, `VM` volume; uninvolved = `M_GREY`) → hover (`M_HOV`) → isolate fade (`M_FADE`) → per-key base material (`keyMat`, colour jittered by hash of key). Bones: `B_SEL` / `B_HOV` / `B_FADE` / `B_MAT`. Picking (`pick()`, Raycaster) ignores meshes whose material is in `FADED` or has opacity ≤ 0.15. All material colours are converted with `convertSRGBToLinear`.

### Exercise logic
- `effTargets(i, vars)`: base targets with variation overrides applied.
- `perOf(targets)` → `{per:{key:{l,parts}}, tot}`; weights `W = {3:1, 2:0.45, 1:0.15}`. Specificity of a muscle = `W[level] / tot`.
- `EXK[key]`: precomputed list of exercises per muscle **from base targets only** (variations are ignored there; known gap).
- `meshLevels(targets)`: Map mesh → level, respecting part-specific targets.
- Volume: `VOLF = {3:1, 2:0.5, 1:0}` sets per weekly set; `volumeByMesh()`, `volOfKey(key, part)`; bands <4, 4–9, 10–20, >20 (`volBand`, `volStatus`). `SUMMARY` lists the 27 rows of the weekly table.

### Cards and lists
`renderCard()` dispatches to `renderCmpCard()`, `renderExCard()` or the muscle/bone card. Click handling is delegated on `#card` via `data-act`, `data-ex`, `data-key`, `data-var`. Sidebar tabs: Anatomy (`buildList`, region chips, per-structure checkboxes), Exercises (`buildEq`, `buildBest`, `buildExList`, comparison banner), Workout (`renderPlan`, `buildAdd`, `renderVolSum`, `#tVol`).

### Persistence
localStorage keys `myology.plan.v1` and `myology.eq.v1`, wrapped in try/catch. Bump the version suffix if the format changes.

## Testing

`tools/test/smoke.js` loads `index.html` in jsdom with real three@0.128.0, stubs `WebGLRenderer`, then clicks through: best-for list, exercise selection, variations, add to plan, comparison and swap, equipment filter, workout plan, volume mode. It prints card text; check for `THROW`/`ERR` lines. It does not test rendering or raycasting accuracy; check those manually in a browser.

## Known limitations and open issues

- Exercise involvement uses three coarse levels estimated from EMG literature and coaching practice; specificity and volume inherit that coarseness.
- `EXK` / "Best exercises for" ignore variations (e.g. the TFL-biased side-lying abduction variant does not rank).
- Left and right share one key: hiding, exercise heat and volume always apply to both sides; single-sided exercises light both legs.
- Missing structures in source data: tongue, pharyngeal constrictors, buccinator, auricular/occipitalis, perineal muscles, extensor digitorum brevis, dorsal interossei of the foot; sacrum, coccyx, costal cartilages.
- Anatomy and exercise texts were written for this project and are not reviewed by an anatomist; innervation of small hand/foot/laryngeal muscles is the most error-prone.
- Plan lives in localStorage only (no export).

## Roadmap ideas

1. Rank variations as separate entries in "Best exercises for".
2. Plan export/import (JSON) and training days with per-session volume.
3. Left/right and per-part toggles in the Index.
4. Replace three levels with cited per-muscle percentages.
5. Rebuild meshes directly from BodyParts3D + Z-Anatomy (needs own alignment of the 66 Z-Anatomy meshes).
6. Now that hosting is GitHub Pages rather than a single-file artifact: move geometry to a separate binary file (`fetch`) to cut HTML parse time, and add a service worker for offline use.

## Licensing

Code, anatomy text and exercise data: MIT (`LICENSE`). Embedded mesh data: CC BY-SA 4.0 (`LICENSE-DATA`), derived from BodyParts3D (© DBCLS, CC BY-SA 2.1 JP), Z-Anatomy (CC BY-SA 4.0), via BodyExplorer (code MIT; meshes under source licenses). Keep attribution in README and in the app footer.
