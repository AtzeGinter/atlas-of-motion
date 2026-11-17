# Exercise animation (prototype, approach "A")

Goal: animate the existing atlas body (the real BodyParts3D / Z-Anatomy meshes, nothing replaced) through an exercise,
with the muscles bending at the joints and the exercise heat colours (prime mover / synergist / stabiliser) visible while it moves.
First two exercises: **Bulgarian split squat** and **Dumbbell bench press** (both already in `exercises.py`).

## Overview

```
tools/rig.py  (run after meta.py; geometry stage like build.py, outputs committed, deterministic)
   reads ../geo/<level>.bin + meshes counts (decoded exactly like the app's decodeLod) + meta2.json (mesh rows, muscle groups)
   -> tools/rig.json          joints, segments, hierarchy, bind pose (embedded by assemble.py as META.rig, ~2 kB)
   -> ../geo/skin-<level>.bin per-vertex skin weights per level (gzip, mtime=0; fetched lazily on the first play)
tools/data/animations.json    hand-authored motions (validated by lint.py, embedded by assemble.py as META.anim)
tools/assemble.py             embeds META.rig, META.anim and META.skin {level: {file?v=<md5>, bytes}}; the skin files are part of the
                              service worker's geo cache name (sw.js caches geo/*.bin cache-first anyway)
tools/template.html           "exercise animation" section (after the camera code): skin loading, shader skinning, pose solver
                              (FK + 2-bone IK), props, the movement bar #animBar
```

Run `rig.py` again only when the geometry (`build.py`) or the weighting heuristics change; it needs `scipy` (cKDTree) on top of
the build.py dependencies. CI does not run it (like build.py); lint.py checks that the committed skin files match the mesh counts.

## Skeleton (segments)

19 rigid segments. Every segment's bind orientation is the world frame (axis aligned), so a segment is described by its pivot
(the proximal joint centre) and its parent; the skinning matrix of a segment is `T(pos) R(q) T(-pivot)`.

| segment | pivot (proximal joint) | parent | bones |
|---|---|---|---|
| pelvis (root) | midpoint of the two hip centres | - | hip bones |
| lumbar | L5/S1 (bottom of the L5 body) | pelvis | L1-L5 |
| chest | T12/L1 | lumbar | T1-T12, ribs, sternum (manubrium, body, xiphoid) |
| neck | C7/T1 | chest | C1 (atlas) - C7, hyoid |
| head | top of the atlas (occiput) | neck | skull bones, mandible |
| clavL/R (shoulder girdle) | sternoclavicular joint (medial end of the clavicle) | chest | clavicle, scapula |
| armL/R | glenohumeral centre (sphere fit to the humeral head) | clav | humerus |
| foreL/R | elbow (centre of the distal humerus) | arm | radius, ulna |
| handL/R | wrist (centre of lunate + scaphoid) | fore | carpals, metacarpals, phalanges |
| thighL/R | hip (sphere fit to the femoral head, r = 23 mm) | pelvis | femur |
| shankL/R | knee (between femoral condyles and tibial plateau) | thigh | tibia, fibula, patella |
| footL/R | ankle (between the malleolus tips) | shank | tarsals, metatarsals, phalanges, sesamoids |

Extra points in `rig.json` `pt`: `gripL/R` (between the metacarpal heads, toward the palm: where a dumbbell handle sits) and
`toeL/R` (metatarsal heads). Joint centres come from the Medium bone meshes; left and right are fitted separately and agree within
a few millimetres (lint and the smoke test check 1.5 cm).

Not modelled: forearm pronation/supination (radius and ulna move as one, so the dumbbell bench press is shown with a neutral grip),
toe joints, scapulothoracic gliding beyond a clavicle rotation, individual vertebrae (three spine segments).

## Skin weights

* **Bones are rigid**: each bone mesh belongs to exactly one segment (table above). The side is taken from the mesh centre, because
  the source labels one muscle pair with the wrong side.
* **Muscles, tendons, fasciae**: two influences per vertex (segment a, segment b, weight of a).
  1. Allowed segments per mesh from its muscle group and side (e.g. Thigh -> pelvis/thigh/shank of that side; Forearm ->
     arm/forearm/hand; Face/Eye/Jaw -> head only), with per-key exceptions (latissimus, psoas, serratus anterior, trapezius,
     sternocleidomastoid, ...) and per-key lists for connective tissue. This prevents the classic artefact of the anatomical pose:
     the hanging hand is a few centimetres from the thigh and would otherwise drag thigh muscles along.
  2. Distance from the vertex to the nearest bone vertex of every allowed segment (scipy cKDTree over the Medium bones).
  3. Soft-min: `w_s ~ exp(-(d_s - d_min) / sigma)`, sigma = 18 mm. The blend band sits where the muscle is equidistant from the two
     bones it spans: close to the joint for limb muscles, spread over the belly for muscles that fan across a ball joint
     (pectoralis, deltoid, latissimus).
  4. The trunk (pelvis / lumbar / chest) is one block for step 3 and is then split by height with smoothstep bands around L5/S1
     (+-4.5 cm) and T12/L1 (+-6 cm): the abdominal wall is far from every vertebra, so bone distance means nothing there.
  5. The two largest influences are kept and renormalised; weight of a quantised to 0..255.
* `geo/skin-<level>.bin` (gzip): per mesh in META order three planes of `nv` uint8 (segment a, segment b, weight of a).
  The planar layout compresses about 2x better than interleaving.

| level | vertices | skin file (gzip) | raw | mesh file |
|---|---|---|---|---|
| low | 263,589 | 150 kB | 791 kB | 2.3 MB |
| medium | 623,156 | 319 kB | 1.87 MB | 5.2 MB |
| high | 1,035,695 | 493 kB | 3.1 MB | 9.9 MB |

## Runtime: shader skinning on the existing meshes

Chosen: **custom vertex skinning through `onBeforeCompile`** on the existing materials, not `THREE.SkinnedMesh`.

* The existing `THREE.Mesh` objects stay. They are referenced by `allMeshes`, `byKey`, the heat maps, nerve anchors and the picking
  lists; swapping 668 meshes for SkinnedMesh objects would touch all of that, and r128 SkinnedMesh also needs `material.skinning`
  and per-mesh bind matrices.
* One attribute `aSkin` (uint8 x 3) per geometry, added on the first play (`loadSkin`), and one shared uniform array `uSk`
  (3 vec4 rows of an affine matrix per segment = 57 vec4, within WebGL1's 128-vector minimum together with the standard material).
  Linear blend skinning of position and normal (`mat3` built from columns, so it compiles in WebGL1 too).
* All body materials (per-key muscle materials, heat, comparison, volume, selection, hover, fade, bone materials) get the same
  `onBeforeCompile` function, so they share one program cache key; a handful of programs compile once on the first play. The
  injection stays afterwards: at rest every matrix is the identity, so the static atlas looks exactly as before.
* While animating: `frustumCulled = false` on the body meshes (their bounding spheres are those of the atlas pose); the static
  nerve tubes are hidden; `focusOn` / `pivotOn` do nothing (the boxes are those of the atlas pose).
* Picking (`animRaycast`, installed on the body meshes while an animation is active): no picking while it plays; when paused, the ray
  is tested against CPU-skinned copies of the positions (`cpuSkin`, the same blend as the shader, computed once per pose and mesh:
  ~15-35 ms for all meshes on Medium), so a click selects the muscle where it is drawn. After Stop the meshes use the normal raycast.
* Changing the mesh quality stops the animation; the next play loads that level's skin file.
* Leaving the exercise (another exercise, closing the card, comparison, volume, a movement) stops it. Overlays (week overview,
  Statistics, Today, Settings) freeze it (no frames spent).

## Motion data (`tools/data/animations.json`)

Per exercise name (must exist in `exercises.py`; lint checks everything below):

* `dur` seconds per repetition (looped). `camera` `{theta, phi}` in degrees (orbit angles, theta 90 = from the subject's left),
  `r` (times the default distance; x0.8 on phones), `target` [x,y,z]. On desktop the target is shifted along the camera's right vector so
  the body sits in the part of the viewport the card leaves free.
* `props`: `{"type":"bench","size":[width,thickness,length],"top":y,"pos":[x,z centre]}` (pad plus a simple frame) and
  `{"type":"dumbbell","seg":"handL|handR","len","r"}` (handle across the palm at `rig.pt.grip`, follows the hand segment).
* `keys`: 3-8 keyframes, `t` rising from 0 to 1. Each key inherits whatever it does not set from the previous key, so `{"t":0.1}`
  is a hold. `ease` (`inOut` default, `in`, `out`, `linear`) shapes the segment that ends at this key.
  * `root`: `pos` (world position of the pelvis pivot) and `rot` (world Euler XYZ, degrees; the bench press uses `[-90,0,0]`: supine).
  * `j`: `{segment: {dof: degrees}}`, local to the parent, written for the LEFT side and mirrored for the right (a mirror flips
    the y and z components of a rotation axis). DOFs: spine segments `flex lat rot`; `clav` `elev prot`; `arm`/`thigh` `flex abd rot`
    (rot = internal rotation); `fore`/`shank` `flex`; `foot` `flex` (dorsiflexion +); `hand` `flex dev`.
  * `ik`: `{thighL|thighR|armL|armR: {target, pole, end?}}`: analytic two-bone IK. `target` = world position of the ankle / wrist,
    `pole` = world direction the knee / elbow should point to, `end` = optional world Euler of the foot / hand (else it follows the
    shank / forearm plus its `j` angles). IK chains are declared in key 0; their joints cannot also get `j` angles (lint).
  Feet stay exactly planted because their targets do not move; the dumbbells travel straight lines between keys.

Current motions:

* **Bulgarian split squat** (3.4 s: hold at the top, 2 s down, ~0.2 s at the bottom, 0.9 s up). Left leg in front, foot flat at
  z = 0.38; right instep on a 42 cm bench (foot turned 164 degrees about x, laces down). Pelvis from 0.79 m to 0.50 m, torso lean 5 to 14
  degrees + chest flexion; front knee travels just past the toes, rear knee ends ~12 cm above the floor. Arms hang with the dumbbells,
  shoulders internally rotated 85 degrees so the handles point forward (neutral grip) and the plates clear the thighs.
* **Dumbbell bench press** (3.2 s: hold at lockout, ~1.9 s down, ~1 s up). Supine on a 43 cm bench, feet flat on the floor in front of
  the bench end (knees ~90 degrees). Scapulae retracted and depressed (clavicle `prot -8..-12`, `elev -4..-5`). Wrists from over
  the shoulders (lockout) to chest level 35 cm lateral (bottom), elbows ~60 degrees from the torso and slightly below the bench top,
  forearms vertical; neutral grip (no pronation in the rig).

### Adding an exercise

1. Copy one of the two entries in `animations.json`, rename it to the exercise's exact name.
2. Start from the anatomical pose: `root.pos` = `[0, 0.8842, -0.0268]` (the pelvis pivot) and no angles is standing still. Use IK
   for every limb that touches something (floor, bench, bar) and joint angles for the rest.
3. `python lint.py`, `python assemble.py`, then look at it in the browser: play, pause at the top and the bottom, orbit around the
   knees, hips, shoulders and elbows (switch the heat off in your head: the uninvolved muscles are translucent grey in exercise mode).
4. Add the name to the smoke test only if it needs special assertions; `animRun` already checks every entry's basic structure.

## Known artefacts and limits (prototype)

* Linear blend skinning: some volume loss in deep flexion (rear knee of the split squat, elbow at the bottom of the press);
  thin tendons and aponeuroses (white) can poke out a few millimetres at the shoulder and the hip crease.
* Only two influences per vertex: where three segments meet (shoulder: chest / girdle / arm) the third is dropped, which can show a
  small step on large flat muscles (pectoralis, latissimus) at extreme ranges.
* Hands stay open (the atlas pose); the dumbbell handle passes through the palm in front of straight fingers.
* No forearm rotation (neutral grip only); no toe bending (the rear foot rests on its instep with straight toes).
* Muscles do not bulge or shorten actively; they are only carried and stretched by the bones.
* The left and right sides of the split squat share one heat colour per muscle (the app has one key per left/right pair).

## Performance (desktop GPU, built-in browser, 860x800 canvas, render + 1-pixel readback per frame)

* Medium: ~9-10 ms per animated frame vs ~7.5 ms for the same static frame; Low: ~8.7 ms vs ~6.2 ms. The pose solve itself takes
  ~0.02 ms; the extra cost is the vertex shader. Phones should use Low (their default); the skin file for Low is 150 kB.
* First play: one fetch of the skin file (cached by the service worker afterwards) plus one shader recompile of ~10 programs.
