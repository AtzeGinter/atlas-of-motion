# Exercise animation (rig v2)

Goal: animate the existing atlas body (the real BodyParts3D / Z-Anatomy meshes, nothing replaced) through an exercise, with the
muscles bending at the joints and the exercise heat colours (prime mover / synergist / stabiliser) visible while it moves.
v2.5 shipped a beta with two exercises; rig v2 adds forearm rotation, gripping hands, a three-part thoracolumbar spine, held bars
and other props, pose presets and 13 animated exercises (list at the end).

## Overview

```
tools/rig.py   (run after meta.py; geometry stage like build.py, outputs committed, deterministic, needs scipy)
   reads ../geo/<level>.bin (decoded exactly like the app's decodeLod) + meta2.json (mesh rows, muscle groups)
   -> tools/rig.json          segments, pivots, joint axes, finger grip angles, grip point / handle axis (embedded as META.rig)
   -> ../geo/skin-<level>.bin per-vertex skin weights per level (gzip, mtime=0; fetched lazily on the first play)
tools/data/animations.json    hand-authored motions with presets (lint.py checks them)
tools/animlib.py              resolves presets, left -> right mirroring and variation overrides (used by assemble.py and lint.py)
tools/assemble.py             embeds META.rig, META.anim (resolved) and META.skin {level: {file?v=<md5>, bytes}}
tools/template.html           "exercise animation" section (after the camera code): skin loading, dual-quaternion shader
                              skinning, pose solver (FK, two-bone IK, auto forearm rotation, held bar), props, the bar #animBar
```

Pipeline: `python meta.py && python rig.py && python exercises.py && python lint.py && python assemble.py` (rig.py only after
build.py or a rig change; CI does not run it, lint.py checks that the committed skin files match the mesh counts).

## Skeleton (52 segments)

Every segment's bind orientation is the world frame, so a segment is its pivot (the proximal joint centre), its parent and,
for single-axis joints, an axis. The segment transform is a rotation `q` about the pivot plus a translation.

| segment | pivot | parent | bones |
|---|---|---|---|
| pelvis (root) | midpoint of the hip centres | - | hip bones |
| lumbar | L5/S1 | pelvis | L1-L5 |
| thorax | T12/L1 | lumbar | T7-T12, ribs 8-12 |
| chest | T6/T7 | thorax | T1-T6, ribs 1-7, sternum |
| neck / head | C7/T1 / occiput | chest / neck | C1-C7, hyoid / skull, mandible |
| clavL/R | sternoclavicular joint | chest | clavicle, scapula |
| armL/R | glenohumeral centre (sphere fit) | clav | humerus |
| foreL/R | elbow (distal humerus) | arm | **ulna** |
| radL/R | centre of the radial head; axis radial head -> ulnar head | fore | **radius** |
| handL/R | wrist (lunate + scaphoid) | rad | carpals, metacarpals 2-5 |
| thighL/R, shankL/R, footL/R | hip, knee, ankle | pelvis, thigh, shank | femur; tibia, fibula, patella; foot bones |
| thm/thp/thd L/R | thumb CMC, MCP, IP | hand, thm, thp | 1st metacarpal, proximal, distal phalanx |
| f2-f5 p/m/d L/R | finger MCP, PIP, DIP | hand, p, m | proximal, middle, distal phalanx |

* Body and limb segments come first (`nbody` = 22), the 30 finger segments last, so a device with a small vertex-uniform
  budget can drop the fingers and keep a contiguous array (see Runtime).
* **Forearm rotation** (`fore.pron`): the radius segment turns about the line from the radial-head centre to the ulnar-head centre
  (per-side axis in `rig.json`, + = pronation on both sides). 0 = the atlas' supinated forearm (palms forward), 90 = neutral
  (thumb forward when the arm hangs), ~160 = fully pronated. The ulna stays with the elbow; the hand rides on the radius.
* **Fingers** (`hand.grip`, 0..1): each finger joint turns about its own flexion axis (finger direction x palm normal) by
  `grip x g`. `g` is fitted in rig.py so that at grip 1 the MCP, PIP and DIP joint centres and the fingertip lie on a circle of
  radius 16 mm (handle) + 10.5 mm (palmar soft tissue), relative to the slightly curled atlas fingers; the thumb uses fixed
  angles (CMC opposition 38, MCP 30, IP 32). The circle centre averaged over fingers 2-5 is `pt.grip` (where handles sit);
  `dir.gax` is the handle direction toward the thumb, `dir.gfd` the finger direction of the hand frame.
* Extra points in `rig.json` `pt`: joint centres, `gripL/R`, `toeL/R`, `radhead`, `ulnhead`.

## Skin weights

* **Bones are rigid**: each bone mesh belongs to exactly one segment (table above).
* **Muscles, tendons, fasciae**: three influences per vertex.
  1. Allowed segments per mesh from its muscle group and side (Forearm -> arm, ulna, radius, hand, fingers; Hand -> ulna, radius,
     hand, fingers; Upper arm -> girdle, arm, ulna, radius; ...) with per-key exceptions (latissimus, psoas, serratus anterior,
     trapezius, ...). This keeps the hanging hand from dragging thigh muscles along.
  2. Distance from the vertex to the nearest bone vertex of every allowed segment (cKDTree over the Medium bones).
  3. Soft-min `w ~ exp(-(d - d_min) / sigma)`, sigma 18 mm, 7 mm for the hand and finger segments (bones millimetres apart).
  4. Blocks split by position instead of distance: the **trunk** (pelvis / lumbar / thorax / chest) by height with smoothstep
     bands at L5/S1 (+-4.5 cm), T12/L1 (+-6 cm) and T6/T7 (+-5.5 cm, plane tilted so it drops 0.6 cm per cm toward the front
     where the sternum and ribs 1-7 reach lower); the **forearm** (ulna + radius) by the position along elbow -> wrist
     (smoothstep from 4 % to 96 %), so pronation is spread along the forearm.
  5. The three largest influences are kept and renormalised; the first two weights are quantised to 0..255, the third gets the rest.
* `geo/skin-<level>.bin` (gzip): per mesh in META order five planes of `nv` bytes: segment a, b, c, weight a, weight b.

| level | vertices | skin v1 (beta, 2 influences) | skin v2 (gzip) | raw | mesh file |
|---|---|---|---|---|---|
| low | 263,589 | 150 kB | 356 kB | 1.32 MB | 2.3 MB |
| medium | 623,156 | 319 kB | 741 kB | 3.12 MB | 5.2 MB |
| high | 1,035,695 | 493 kB | 1,126 kB | 5.18 MB | 9.9 MB |

## Runtime: dual-quaternion skinning on the existing meshes

* The existing `THREE.Mesh` objects stay (they are referenced by `allMeshes`, `byKey`, the heat maps, nerve anchors and picking).
* Two attributes per geometry, added on the first play (`loadSkin`): `aSkI` (uint8 x 3, segment indices) and `aSkW` (uint8 x 2).
* One shared uniform array `uSk`: a **unit dual quaternion per segment = 2 vec4** (real = rotation, dual = 0.5 (t, 0) x real).
  The shader aligns the signs of the three quaternions with the first, blends, normalises and transforms position and normal
  (`SKIN_OBC`, shared by every body material through `onBeforeCompile`). Dual quaternions keep the volume where linear blending
  collapses (a 150-degree forearm twist keeps the mid-forearm radius of flexor digitorum superficialis at ~100 %).
* **Uniform budget**: 52 x 2 = 104 vec4; WebGL1 guarantees 128 vertex uniform vectors and three.js' standard material needs
  ~20-25 (`SK_RESERVE = 24`). `skBudget()` reads `renderer.capabilities.maxVertexUniforms` on the first play: below
  104 + 24 only the 22 body segments are uploaded (`uSk[44]`) and `loadSkin` maps every finger index to its hand (`SEGHAND`),
  so the fingers stay as in the atlas but nothing breaks. WebGL2 (the default in three r128) guarantees 256.
* At rest every transform is the identity dual quaternion, so the static atlas looks exactly as before. `cpuSkin` is the same
  blend in JS (picking while paused, tests).
* While animating: `frustumCulled = false`; static nerve tubes hidden; `focusOn` / `pivotOn` do nothing; picking only while paused
  (CPU-skinned copies). Changing the mesh quality stops the animation; leaving the exercise stops it; overlays freeze it.
* **Pose solver** (`solvePose`): root transform, then segments in order: FK from `j` angles (`localQ`, DOF axes written for the
  left side and mirrored), per-segment axes for the radius (`fore.pron`) and the fingers (`hand.grip` x `g`), two-bone IK for
  `thigh*` (`solveLeg`) and `arm*` (`solveArm`). The arm IK targets the wrist *after* the forearm rotation (the wrist is off the
  rotation axis). When the hand orientation is given (`ik.end`, or a bar grip) the pronation is computed from the twist between
  hand and ulna about the rotation axis (`wrapPron`, -20..190 degrees) and the solve is iterated four times.
* **Held bar** (barbell, pull-up bar, lat bar; at most one): centre and axis come from the key field `bar` (`pos`, `rot`, `w` =
  grip width, interpolated) or, with `seg` + `at` on the prop, from a segment (the back squat bar rides on `chest`, the hip-thrust
  bar on `pelvis`). An arm with `"bar": "over" | "under"` puts its grip point at centre +- w/2 along the bar; the thumb points
  to the bar centre (overhand) or away (underhand); the finger direction is the forearm direction projected off the bar, tipped
  by `wext` (wrist extension, degrees). The hand frame (`frameQ` from `dir.gfd`/`dir.gax`) then fixes the wrist target
  `grip point - hand offset`, so both hands sit exactly on the bar whenever it is within reach (the smoke test samples every bar
  exercise: worst error 2.8 mm).
* **Props**: `bench` (`size [w, thickness, length]`, `top`, `pos [x, z]`, optional `incline` 0-85 with `seat`, `yaw`),
  `roller` (pad on a post), `dumbbell` (follows a hand at `pt.grip`, handle along `dir.gax`), `barbell` (`len`, `plates
  [[radius, thickness], ...]`, `w`, optional `seg` + `at`), `pullbar` (`len`, `posts`), `latbar`, `cable` (`pulley`, `stack`:
  a tower and a cable from the pulley to the held bar, updated every frame).
* `#animT` (range 0..1000 in the bar) scrubs: it pauses and shows that moment of the repetition.
* **Variations**: `animKeys(i, def)` merges `def.vars[group][option]` into the base keys for the options chosen on the card; changing
  a variation while the movement plays re-keys it at once (`anim.K = prepKeys(...)`).

## Motion data (`tools/data/animations.json`)

Per exercise name (must exist in `exercises.py`):

* `dur` seconds per repetition (looped); `camera` `{theta, phi, r, target}` (orbit angles in degrees, theta 90 = from the subject's
  left; r = times the default distance, x0.8 on phones); `props` (above); `sym` (default true, see presets); `vars` (variations).
* `keys`: 3-12 keyframes, `t` rising from 0 to 1. Each key inherits whatever it does not set from the previous key; `ease`
  (`inOut` default, `in`, `out`, `linear`) shapes the segment that ends at this key.
  * `root`: `pos` (world position of the pelvis pivot; standing = `[0, 0.8842, -0.0268]`) and `rot` (world Euler XYZ, degrees;
    `[-90, 0, 0]` = supine, `[90, 0, 0]` = prone, positive x = lean forward).
  * `j`: `{segment: {dof: degrees}}`, local to the parent. DOFs: `lumbar thorax chest neck head` `flex lat rot`; `clav` `elev prot`;
    `arm`/`thigh` `flex abd rot` (rot = internal rotation); `fore` `flex pron`; `shank` `flex`; `foot` `flex`; `hand` `flex dev grip`.
  * `ik`: `{thighL|thighR|armL|armR: {target, pole, end?, bar?, wext?}}`: `target` = world position of the ankle / wrist, `pole` =
    direction the knee / elbow points to, `end` = world Euler of the foot / hand, `bar` = "over" | "under" (arms only, instead of
    target and end). Chains are declared in key 0. Joints a chain drives cannot also get `j` angles (lint); exceptions:
    `fore.pron` when the hand orientation is free, `hand.grip` always.
  * `bar`: `{pos, rot, w}` for a held bar that is not attached to a segment (attached ones take only `w`).
* `_presets`: `{name: fragment}`; a fragment is a partial key (`root`, `j`, `ik`, `bar`, and `use` for other presets). A key's
  `use` (name or list) merges the presets in order (dicts recursively, numbers and lists replace), then the key's own fields.
* Mirroring (`sym`, default true): after merging, every left entry of `j` / `ik` without a right entry in the same key gets one
  (`j` copied, the runtime mirrors the axes; `ik` target / pole x negated, `end` Euler `[a, -b, -c]`). Write the right side
  explicitly when a key changes both sides differently (the split squat's legs).
* `vars`: `{group: {option: {key index: partial key}}}` (group and option names from `VARS` in exercises.py, not the default
  option); resolved and mirrored like keys; `t` cannot change.

### Presets

| preset | what it sets |
|---|---|
| `stand` | root at the standing pelvis, feet IK at the atlas ankles (flat) |
| `stance-hip`, `stance-wide` | ankles at x 0.11 (toes out 8) / 0.17 (toes out 22, knees out) |
| `hip-hinge` | root lean 55, neutral spine, neck extended to look ahead |
| `supine-bench` | lying on a 43 cm bench (root `[0, 0.533, 0.3]`, rot -90), scapulae retracted, feet flat in front |
| `prone` | lying face down on the floor |
| `hang` | shoulders elevated, legs slightly bent (pull-ups, hangs) |
| `half-kneel` | left foot forward, right knee down (asymmetric, written for both sides) |
| `seated` | pelvis on a 47 cm seat, feet flat in front |
| `grip-db-neutral`, `grip-db-over`, `grip-db-under` | `hand.grip` 1 and `fore.pron` 90 / 160 / 0 (dumbbells, free hand orientation) |
| `bar-over`, `bar-under` | arm IK on the held bar with that grip, `hand.grip` 1 |
| `grip-close`, `grip-shoulder`, `grip-wide` | bar grip width 0.36 / 0.5 / 0.84 m |

### Adding an exercise in ~10 minutes (worked example: Barbell row)

1. Find the exact name in `tools/exercises.py` (`"Barbell row"`), decide the props (one barbell) and the phases
   (hold at the bottom, pull ~1 s, hold, lower ~1.4 s: `dur` 3, keys at 0, .08, .42, .52, 1).
2. Start from presets: standing feet (`stand`, `stance-hip`) and an overhand bar grip (`bar-over`). Write only the left side.
3. Key 0 = the bottom: lean the pelvis (`root.rot` 48 = torso ~45 degrees), push it back and down (`root.pos`), keep the spine
   neutral (`lumbar flex -6`), look ahead (`neck flex -18`), slightly protracted shoulders (`clavL prot 6`), elbows back
   (`ik.armL.pole [0.4, 0, -1]`) and put the bar where the arms hang (`bar.pos`).
4. Key 2 = the top: bar to the lower ribs, shoulder blades together (`clavL prot -12`), elbows up and back. Keys 1 and 3 are holds
   (`{"t": 0.08}`); key 4 repeats key 0.

```json
"Barbell row": {
 "dur": 3.0,
 "camera": {"theta": 42, "phi": 78, "r": 1.2, "target": [0, 0.8, 0]},
 "props": [{"type": "barbell", "w": 0.56, "plates": [[0.225, 0.055]]}],
 "keys": [
  {"t": 0, "use": ["stand", "stance-hip", "bar-over"], "root": {"pos": [0, 0.8, -0.24], "rot": [48, 0, 0]},
   "j": {"lumbar": {"flex": -6}, "neck": {"flex": -18}, "head": {"flex": -6}, "clavL": {"prot": 6, "elev": -2}},
   "ik": {"armL": {"pole": [0.4, 0, -1]}}, "bar": {"pos": [0, 0.588, 0.15]}},
  {"t": 0.08},
  {"t": 0.42, "ease": "out", "j": {"clavL": {"prot": -12, "elev": -4}}, "ik": {"armL": {"pole": [0.5, 0.4, -1]}}, "bar": {"pos": [0, 0.885, 0.062]}},
  {"t": 0.52},
  {"t": 1, "j": {"clavL": {"prot": 6, "elev": -2}}, "ik": {"armL": {"pole": [0.4, 0, -1]}}, "bar": {"pos": [0, 0.588, 0.15]}}
 ],
 "vars": {"Grip": {"Underhand": {"0": {"ik": {"armL": {"bar": "under", "pole": [0.15, 0, -1]}}}}}}
}
```

5. `python lint.py && python assemble.py`, serve the repo (`python -m http.server`), play it, scrub with the slider to the top
   and the bottom and orbit around hands, elbows, shoulders, knees and spine. The two numbers that need tuning are the bar
   positions: the hands only reach a bar within arm's length (upper arm + forearm ~0.53 m shoulder to wrist; ~0.59 m to the
   grip point), and the bar must not sink into the body. The smoke test reports both (`both grip points stay on the bar ...
   (worst N mm)`); in a dev build a small helper that prints, per sampled frame, the distance between each grip point and its
   bar end and the clearance between the bar and the nearest body vertex makes this a two-iteration job. A path that rotates the
   trunk (deadlifts) needs a key in the middle, because a straight line between two keys of the bar does not follow the arc of
   the shoulders.
6. Nothing else: `animRun` plays every entry, checks that held bars stay in both hands, planted feet stay planted and nothing goes
   below the floor. Add an assertion only for something special.

## Animated exercises

| exercise | notes |
|---|---|
| Back squat | high bar on the upper back (`seg: chest`), wide overhand grip, toes out, to parallel with a 38-degree torso lean; variations Stance (Wide / Narrow) and Depth (Deep / Half) |
| Conventional deadlift | from the floor (plates on the floor, bar over the mid-foot against the shins), knees move back before the bar passes them (12 keys), lockout, controlled lowering |
| Romanian deadlift | soft knees, hips far back, bar along the legs to below the knee |
| Barbell bench press | supine, bar from over the shoulders to the lower chest (touching), forearms vertical, wrists slightly extended; variations Grip Wide / Close |
| Barbell row | ~45-degree hinge, bar to the lower ribs, shoulder blades retract; variation Grip Underhand |
| Pull-up | dead hang with elevated shoulders to chin over the bar, slight lean back; variation Grip Wide overhand |
| Lat pulldown | seated under a thigh roller, wide overhand lat bar on a cable to the upper chest; variation Grip Underhand |
| Overhead press | front rack to lockout, head moves back so the bar clears the chin, shrug at the top |
| Barbell curl | elbows at the sides, bar on an arc around the elbow (several keys), underhand; variations Grip Wide / Close / Reverse (overhand) |
| Hip thrust | upper back on a crosswise bench, bar on the hips (`seg: pelvis`), from hips low to torso level with vertical shins |
| Lateral raise | dumbbells with a neutral grip to shoulder height, slight elbow bend; variation Arm path In the scapular plane |
| Bulgarian split squat | rear instep on a bench, dumbbells in a neutral grip (fore.pron 90); variation Torso Forward lean |
| Dumbbell bench press | dumbbells in line like a barbell (hand orientation given, forearm rotation automatic) |

## Known artefacts and limits

* Pectoralis major and latissimus dorsi fan out as broad sheets under the arm at full overhead flexion (overhead press lockout,
  pull-up dead hang, lateral raise at the top) - partly real, but the sheets leave the chest wall more than they should.
* Muscles do not bulge or shorten actively; they are only carried and stretched by the bones. Dual quaternions can bulge slightly
  at the inside of a deeply flexed joint (rear knee of the split squat, elbow at the top of the curl).
* The thumb uses fixed angles and does not always wrap around the bar exactly; fingers curl to one handle size (32 mm).
* No toe bending, no scapulothoracic gliding beyond the clavicle rotation, three thoracolumbar spine segments (no individual
  vertebrae), the wrist is a single segment.
* Bar positions are authored in world space, so a key change of the body can leave the bar out of reach; the test catches it.
* Variations without a different motion (e.g. Lat pulldown Close neutral, which needs a V-handle; Pull-up Neutral) play the base
  motion. Left and right share one heat colour per muscle.

## Performance (desktop GPU, built-in browser, 860x800 canvas; beta measurements, rig v2 adds the dual-quaternion blend)

* Medium: ~9-10 ms per animated frame vs ~7.5 ms static; Low: ~8.7 ms vs ~6.2 ms. The pose solve takes ~0.05 ms (four IK
  iterations per bar arm). Phones should use Low (their default).
* First play: one fetch of the skin file (cached by the service worker afterwards) plus one shader recompile of ~10 programs.
