# Myology

An interactive 3D atlas of the human muscular system that runs entirely in the browser. Click any muscle or bone to see what it does, pick a strength exercise to see which muscles it trains, and plan a training week with a per-muscle volume check.

**Live:** `https://<your-username>.github.io/myology/` (after enabling GitHub Pages, see below)

## Features

- **Anatomy**: 176 muscles (467 meshes) plus tendons and fasciae, and 201 bone meshes from MRI-derived datasets. Each muscle has function, origin, insertion and innervation.
- **Layers and peeling**: toggle skeleton, muscles, tendons/fascia; per-structure visibility; isolate a selection; opacity sliders; 17 region filters.
- **Exercises**: 113 strength exercises with prime movers, synergists and stabilisers shown as a heatmap on the body. 18 exercises have variations (grip, stance, depth, hip position) that shift the emphasis.
- **Muscle view**: every exercise that trains the selected muscle, with involvement and specificity.
- **Best exercises for a muscle**, sortable by effectiveness or specificity.
- **Comparison mode**: two exercises side by side, coloured by which one works each muscle more.
- **Equipment filter** and a **workout builder** with weekly sets per muscle and a volume heatmap. The plan is stored in the browser's localStorage.

## Run it

It is a single self-contained `index.html` (about 7 MB, geometry embedded). Open it in a current browser, or serve the folder with any static server. It needs WebGL and `DecompressionStream` (Chrome, Edge, Firefox, Safari from 2023 on). Three.js r128 and Google Fonts load from CDNs.

### GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → Branch `main`, folder `/ (root)`.

## Rebuilding from source (optional)

The `tools/` folder contains the pipeline that produced `index.html`:

```bash
cd tools
git clone --depth 1 https://github.com/JohanBellander/BodyExplorer.git
pip install trimesh pyfqmr numpy
python build.py 0.45 0.35   # decimate + quantise meshes -> geo.b64, meta.json
python meta.py              # map meshes to anatomy entries -> meta2.json
python exercises.py         # exercise database + variations -> meta3.json
python assemble.py          # -> ../index.html
cd test && npm install && npm test   # optional smoke test
```

To rebuild after editing only `template.html`, `exercises.py`, `bones.py` or `data/*.txt`, skip the clone and recover the mesh data from the committed `index.html`:

```bash
cd tools
python extract.py && python exercises.py && python assemble.py
```

The full pipeline above is still needed after changing decimation in `build.py` or the mesh-to-key mapping in `meta.py` (`PARTPRE`/`HEADPRE`/`MERGE`).

Anatomy text lives in `tools/data/muscles.txt` (`key|group|action|origin|insertion|nerve`) and `tools/data/extra.txt`; bone text in `tools/bones.py`; exercises in `tools/exercises.py`.

## Accuracy and limitations

- Exercise involvement uses three coarse levels estimated from EMG research and coaching practice, not a single measured dataset. Specificity and weekly volume are derived from those levels. Treat them as orientation, not precise values.
- Volume counts prime-mover sets as 1, synergist sets as 0.5, stabiliser sets as 0.
- Missing from the source data: tongue, pharyngeal constrictors, buccinator, auricular muscles, perineal muscles, extensor digitorum brevis, dorsal interossei of the foot; sacrum, coccyx and costal cartilages.
- One adult male body; meshes are decimated for size.
- For learning only. Not medical advice.

## Credits and licensing

**3D mesh data** (embedded in `index.html`) is derived from:

- [BodyParts3D](https://lifesciencedb.jp/bp3d/), © The Database Center for Life Science, licensed CC BY-SA 2.1 Japan
- [Z-Anatomy](https://www.z-anatomy.com/), licensed CC BY-SA 4.0
- as combined and aligned in [BodyExplorer](https://github.com/JohanBellander/BodyExplorer) by Johan Bellander (code MIT; mesh data under the licenses of its sources, per its README), then further decimated and quantised for this project

The mesh data is redistributed under **CC BY-SA 4.0** (see `LICENSE-DATA`). If you reuse it, you must credit these sources and share adaptations under the same license.

**Code, anatomy text and exercise data** are released under the **MIT License** (see `LICENSE`).
