# Exercise animation (rig v2)

Goal: animate the existing atlas body (the real BodyParts3D / Z-Anatomy meshes, nothing replaced) through an exercise, with the
muscles bending at the joints and the exercise heat colours (prime mover / synergist / stabiliser) visible while it moves.
v2.5 shipped a beta with two exercises; rig v2 adds forearm rotation, gripping hands, a three-part thoracolumbar spine, held bars
and other props, pose presets and 13 animated exercises; the next round added straight-arm hanging bars (`bar.hang`), neutral
grips on parallel handles and a V-handle, per-variation props, body-held dumbbells, two dev helpers and 20 more exercises; batch 3
added generic machine props (static frames and pads, groups that follow a segment, sleds on rails, lever links), cable bars, a rope,
cables to any anchor, machine handles held by IK (`ik.hax` / `ik.hfd`) and 20 machine and cable exercises; batch 4 added an arm /
thigh `twist` DOF (rotation about the bone's own axis), machine groups that pivot toward an anchor (`aim`: landmine and T-bar bars),
the presets `kneel` and `arms-crossed` and 25 more cable and machine exercises (78 in all, list at the end).

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
tools/test/animcheck.js       dev helper: per-frame numbers of a motion (grip error, reach, elbow, forearm, knee, clearances)
tools/test/animshot.js        dev helper: screenshots of a motion in headless Edge / Chrome (see "Checking a motion")
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
* **Held bar** (barbell, pull-up bar, lat bar, V-handle; at most one): centre and axis come from the key field `bar` (`pos`, `rot`,
  `w` = grip width, interpolated) or, with `seg` + `at` on the prop, from a segment (the back and front squat, good morning and
  Zercher bars ride on `chest`, the hip-thrust bar on `pelvis`). An arm with `"bar": "over" | "under"` puts its grip point at
  centre +- w/2 along the bar; the thumb points to the bar centre (overhand) or away (underhand); `"neutral"` keeps the grip
  points but turns the handle across the bar (thumbs toward -z of the bar frame, palms facing each other: parallel pull-up
  handles, V-handle); the finger direction is the forearm direction projected off the handle, tipped by `wext` (wrist
  extension, degrees; up to 90 for a front rack).
* **Hanging bar** (`bar.hang: [f, tilt]`, deadlifts): instead of a position the bar hangs from straight arms. Once the chest and
  both clavicles are posed (`hangBar`, before the arm IK), both grip points are placed at `f` x the straight reach (shoulder ->
  elbow -> wrist -> grip point of the atlas pose, `HREACH`) from their shoulders, the bar centre below the shoulder midpoint,
  tilted by `tilt` degrees in the sagittal plane (+ = in front of the shoulders, - = behind). The body motion then drives the bar
  and the elbows can never bend: `f` 0.995 gives ~4 degrees of elbow flexion (locked), and the bar path follows the shoulders
  even between keys (a bar authored by position moves on a straight line while the shoulders move on an arc, so the arms bend
  or overreach between keys). Keys interpolate `f` and `tilt`; key 0 must set `hang` when any key does. The hand frame (`frameQ` from `dir.gfd`/`dir.gax`) then fixes the wrist target
  `grip point - hand offset`, so both hands sit exactly on the bar whenever it is within reach (the smoke test samples every bar
  exercise: worst error 2.8 mm).
* **Props**: `bench` (`size [w, thickness, length]`, `top`, `pos [x, z]`, optional `incline` 0-85 with `seat`, `yaw`; a decline
  bench is an inclined one turned by `yaw: 180`, so the pad falls toward the head), `roller` (pad on a post), `dumbbell` (follows a
  hand at `pt.grip`, handle along `dir.gax`; or, with `seg` = a body segment and `at` (bind pose) + optional `rot`, held against
  the body: the goblet squat's dumbbell rides on `chest`, handle vertical), `barbell` (`len`, `plates` `[[radius, thickness], ...]`,
  `w`, optional `seg` + `at`), `pullbar` (`len`, `posts`, optional `handles: [distance, length]` = two parallel neutral-grip
  handles across the bar), `latbar`, `vhandle` (close neutral grip: two parallel grips `w` apart joined to a cable ring),
  `straightbar` (straight cable bar `len` with end caps and a swivel sleeve: pushdown, cable curl, straight-arm pulldown),
  `rope` (held bar of grip width `w` down to 0.08, gripped `"neutral"`: from a ring two strands of length `len` run to the fists,
  through them along the bar frame's z and end in knobs; the ring points toward `toward`, normally the pulley, and is rebuilt
  every frame from `barW`, so the rope opens into a V as the hands spread), `cable` (`pulley`, `stack [x, z]`, optional `top` =
  tower height: a tower and a cable from the pulley to `to`, any anchor, default the held bar's centre; updated every frame).
* **Anchors** (points props attach to): `[x, y, z]` fixed in the world; `{seg, at}` a bind-pose point carried by a segment;
  `{seg: "handL", grip: d}` the hand's grip point moved `d` along the handle axis (toward the thumb); `{bar: [x, y, z]}` a point in
  the held bar's frame, `{bar: "L" | "R"}` that hand's grip point on it, `{bar: "ring"}` the rope's ring.
* **Machines** (`machine`): a group of `parts`, each `{box: [sx, sy, sz]}` | `{cyl: [r, length]}` (along local y) |
  `{rod: [[x,y,z], [x,y,z]], r}` with `pos`, `rot` (Euler degrees), `mat` (`pad` | `frame` | `iron` | `grip` | `cable`) and
  `pad: true` (+ `name`) for a contact pad (box: its local +y face; roller: its surface; `animcheck.js` reports how deep the body
  sinks into it). Without `seg` the group is static (`pos`, `yaw`). With `seg` it follows a body segment: `"follow": "rigid"`
  (default) carries the parts with the segment (rollers on the shin and their lever to the knee axis, `at: [0,0,0]` = parts in
  bind-pose world coordinates), `at: "grip"` on a hand puts the origin at the grip point with local y along the handle (machine
  handles, D-handles), `"follow": "move"` only translates the group with the anchor `at` (orientation `rot` stays: the leg
  press sled under the feet, the hack squat carriage on the chest, the calf machine's shoulder pads), optionally constrained to
  a rail: `axis` (+ `base`, a point on the rail line) keeps only the motion along the axis, and with `normal` it slides as far as
  keeps the anchor on that contact plane. `"seg": "bar"` rides on the held bar. A static group with `aim` (an anchor) pivots at `pos`
  so that its local +y points at the anchor every frame: the landmine press bar aims at the hand's grip point (`{seg: "handL",
  grip: 0}`), the T-bar row bar at the held crossbar (`{bar: [0, 0, 0]}`); parts are laid out along local y (sleeve, plates), and the
  hand / handle path is authored on the sphere around the pivot so the bar keeps its length (the test allows 2 cm).
* **Links** (`link`): a rod (`r`, `mat`) between two anchors, re-stretched every frame: lever arms from a fixed pivot to a handle
  (chest press, shoulder press, pec deck: the hand moves on an arc around the pivot, so the rod keeps its length within a few
  millimetres), the preacher machine's lever to the bar ends, D-handle straps.
* **Variation props**: a variation option may replace the exercise's props (`vars[group][option].props`, next to its key
  patches); `animProps(i, def)` picks them and a variation change while playing rebuilds the props (Lat pulldown Close neutral
  swaps the lat bar for a V-handle).
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
    `arm`/`thigh` `flex abd rot twist` (rot = internal rotation about the vertical of the bind pose; twist = internal rotation about
    the bone's own long axis, shoulder -> elbow / hip -> knee, applied first: the atlas humerus hangs ~10 degrees off vertical, so
    only twist keeps the elbow in place while the forearm swings: cable external / internal rotation, overhead triceps extension);
    `fore` `flex pron`; `shank` `flex`; `foot` `flex`; `hand` `flex dev grip`.
  * `ik`: `{thighL|thighR|armL|armR: {target, pole, end?, bar?, wext?}}`: `target` = world position of the ankle / wrist, `pole` =
    direction the knee / elbow points to (world space: rotate it with the torso when the torso leans a lot), `end` = world Euler
    of the foot / hand, `bar` = "over" | "under" | "neutral" (arms only, instead of target and end), `wext` -60..90; a handle:
    `hax` (world direction of the handle toward the thumb) + `hfd` (finger direction, from the wrist along the hand): the hand
    orientation comes from these two (`frameQ`, like a bar grip), the forearm rotation follows and `target` becomes the grip point
    (the handle's centre) instead of the wrist, so machine handle paths are authored where the handles are (mirrored like `pole`).
    Chains are declared in key 0. Joints a chain drives cannot also get `j` angles (lint); exceptions:
    `fore.pron` when the hand orientation is free, `hand.grip` always.
  * `bar`: `{pos | hang, rot, w}` for a held bar that is not attached to a segment (attached ones take only `w`); `hang: [f, tilt]`
    = hanging from straight arms (above; tilt -45..150 degrees, past 90 the bar is in front of and above the shoulders: the
    straight-arm pulldown sweeps it from 105 to -2).
* `_presets`: `{name: fragment}`; a fragment is a partial key (`root`, `j`, `ik`, `bar`, and `use` for other presets). A key's
  `use` (name or list) merges the presets in order (dicts recursively, numbers and lists replace), then the key's own fields.
* Mirroring (`sym`, default true): after merging, every left entry of `j` / `ik` without a right entry in the same key gets one
  (`j` copied, the runtime mirrors the axes; `ik` target / pole x negated, `end` Euler `[a, -b, -c]`). Write the right side
  explicitly when a key changes both sides differently (the split squat's legs).
* `vars`: `{group: {option: {key index: partial key, props?: [...]}}}` (group and option names from `VARS` in exercises.py, not the
  default option); resolved and mirrored like keys; `t` cannot change; `props` replaces the exercise's props for that option.

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
| `kneel` | both knees on the floor (thighs vertical, shins back, insteps down: cable crunch) |
| `seated` | pelvis on a 47 cm seat, feet flat in front |
| `arms-crossed` | forearms crossed on the chest, left over right (back extensions, glute-ham raise) |
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
   grip point), and the bar must not sink into the body. `node animcheck.js "Barbell row"` (tools/test, below) prints both per
   frame. A path that rotates the trunk needs a key in the middle, because a straight line between two keys of the bar does not
   follow the arc of the shoulders; when the arms must stay straight (deadlifts) use `bar.hang` instead of positions.
6. Nothing else: `animRun` plays every entry, checks that held bars stay in both hands, planted feet stay planted and nothing goes
   below the floor. Add an assertion only for something special.

## Checking a motion (dev helpers in tools/test, not part of the app or CI)

* `node animcheck.js ["Exercise" ...] [--var Group=Option] [--frames 24] [--lod low|medium|high] [--summary] [--fast]` boots
  index.html in jsdom (Low meshes by default) with the motions read FRESH from `data/animations.json` through animlib.py (no
  assemble.py needed while tuning keys; template changes still need it), plays the exercise and prints per sampled frame: grip
  error per hand (mm; > 5 fails the smoke test), reach (shoulder -> grip point / straight reach, %; ~99.5 = elbow locked),
  elbow flexion L/R (3D angle shoulder-elbow-wrist; the atlas pose has ~12), forearm rotation L/R (90 = neutral), knee flexion,
  bar centre height / depth and its clearance to the nearest body vertex outside the hands (mm, negative = inside a muscle or
  bone, with that structure), the same for dumbbells, the lowest body vertex (floor) and, per bench, how deep the body sinks
  into the seat / backrest (< 0) or floats above it (> 0), and the same for every machine pad (`pad: true`; only vertices within
  the pad's thickness count, so a torso behind a thin pad is not reported). `--summary` = one line per exercise with the worst values; no names
  = every animated exercise. As a module (`bootAnim()`) it also serves quick tuning scripts: solve a key's root position for a
  wanted bar position, grid-search a pole, fit FK arm angles to a point.
* `node animshot.js "Exercise" --t 0,0.5 [--var Group=Option] [--turn px] [--zoom n] [--out dir] [--url http://127.0.0.1:8799/]`
  takes screenshots in headless Edge / Chrome (Node >= 22; `$BROWSER` overrides the browser path) through the page's UI only
  (deep link, Play, variation buttons, the position slider; `--turn` orbits by dragging, `--zoom` wheels in). Serve the repo
  first (`python -m http.server 8799`). Use it when no visible browser is at hand: the app waits for an animation frame before
  loading, so a hidden browser pane never finishes loading.

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
| Front squat | bar on the front delts (`seg: chest`), front rack (grip 0.52, wrists extended 80, elbows forward and up, the elbow pole rotated with the torso), upright torso (17 degrees at the bottom), bar over the mid-foot, below parallel |
| Zercher squat | bar in the elbow crooks (`seg: chest`, FK arms fixed to the chest), deep, upright |
| Goblet squat | dumbbell held vertically against the chest (`seg: chest`), hands cupping the top head, deep with the elbows inside the knees |
| Chin-up | underhand, shoulder-width grip, elbows forward |
| Incline barbell bench press | 38-degree bench (seat + backrest), from above the shoulders to the upper chest |
| Decline bench press | 20-degree decline (inclined bench turned by yaw 180), knees over the end, ankles under a roller, bar to the lower chest |
| Close-grip bench press | grip 0.44, elbows tucked, bar to the lower sternum |
| Incline dumbbell press | same bench and body as the incline press, dumbbells from the sides of the upper chest to above the shoulders |
| Seated dumbbell press | upright backrest (80 degrees), dumbbells from ear height to overhead, palms forward |
| Pendlay row | torso about parallel to the floor, the bar starts on the floor (straight arms) every rep, pulled to the upper abdomen; variation Grip Underhand |
| Good morning | bar on the upper back, hinge to ~70 degrees with soft knees |
| Sumo deadlift | wide stance (ankles at x 0.31, toes out 38, knees out), narrow grip inside the knees, straight arms (`bar.hang`), more upright torso |
| Shrug | dumbbells at the sides, straight arms; the clavicles elevate 26 degrees while the arms are counter-rotated so they keep hanging vertically |
| Hammer curl | neutral grip, elbows at the sides drifting slightly forward |
| Upright row | overhand 0.40 grip, bar close along the body to chest height, elbows lead high and wide, wrists flex |
| Front raise | palms down, nearly straight arms to shoulder height |
| Skull crusher | supine, upper arms fixed 15 degrees past vertical (elbow kept in place: bar positions fitted on an arc around it), bar to just above the forehead |
| Reverse lunge | right leg steps back (foot lifted on the way), rear knee close to the floor on the toes, return (`sym: false`) |
| Walking lunge | done in place as a forward lunge: left leg steps forward, rear heel rises, push back (`sym: false`) |
| Glute bridge | supine on the floor, feet flat, hips up until knees-hips-shoulders line up, upper back and head stay on the floor (upper spine flexes to stay flat) |
| Leg press | 45-degree sled; back on a 31-degree pad, pelvis fixed (no tuck), knees 18 -> 90 degrees; the ankles move on the sled line through the hips, the foot plate (a `move` sled under the left foot) is tilted so the ankles go from ~24 degrees plantarflexion at lockout to ~20 dorsiflexion at the bottom; variation Feet High / Low (feet shifted up / down the plate) / Wide (toes out 18) |
| Hack squat | back and shoulder pads on a carriage that follows the chest along 50-degree rails, torso angle constant, feet on a 20-degree plate, knees 18 -> 105 (below parallel) |
| Leg extension | seated, thighs level, shin roller with its lever to the knee axis (rigid on the shank), knees 90 -> 4, hands on side handles |
| Lying leg curl | prone on a flat bench, hips fixed on the pad, heel roller (rigid on the shank), knees 4 -> 121, hands on front handles |
| Seated leg curl | seated, thigh pad above the knees, roller behind the ankles, knees 15 -> 110 |
| Standing calf raise | balls of the feet on the edge of a narrow block (the toes overhang its front), the foot turns about the ball from -16 (stretch) to +32 degrees, knees ~15 degrees throughout, shoulder pads on a carriage sliding up two posts; variation Feet Toes out / Toes in (foot yaw, the ball stays on the edge) |
| Seated calf raise | knees ~90 degrees, balls on a block, the knee pad rides on the thighs, ankle -14 -> +30 |
| Leg press calf raise | legs nearly straight on the leg press (knees ~18 degrees), the balls of the feet on the plate's lower edge, the foot turns about the ball from a real stretch to the peak (ankle ~-13 to ~+39 degrees against the shank), the plate slides along the rails |
| Chest press machine | seated, horizontal pronated handles (`hax`/`hfd`), levers from an overhead pivot, hands on the lever arc from beside the chest to near lockout |
| Shoulder press machine | seated, pronated handles from beside the head (elbows ~90) to overhead, levers from pivots behind the seat |
| Pec deck | seated, upper arms level (flex 80 + 5 lean = horizontal), internal rotation 90 so the elbows point back, elbow bend 16 constant, thumbs up on vertical handles, arms swing about a vertical axis through the shoulder; lever links to pivots above the shoulders |
| Reverse pec deck | chest on a pad, arms from in front (abd 18) back to slightly behind the frontal plane (abd 94), elbows ~12 degrees constant, shoulder blades retract |
| Dips | parallel bars, neutral grip on the bars (`hax` forward, fingers down and out), knees bent behind, 16 -> 28 degrees forward lean, from straight arms down to the shoulders at elbow height; variation Torso Upright (5 -> 9 degrees) |
| Triceps pushdown | straight cable bar from a high pulley, slight forward lean, bar positions and poles fitted on an arc around a fixed elbow (elbow drift < 2 cm), elbow 94 -> 14 degrees |
| Cable fly | standing between two towers, FK arms (flex 52 -> 70, abd 84 -> 14, internal rotation 90, elbow 20 constant), D-handles in the hands, a cable from each high pulley |
| Seated cable row | low bench, feet on a plate, V-handle (turned so its grips are vertical, thumbs up) from arms extended with a 18-degree lean to the upper abdomen with the torso slightly behind vertical, shoulder blades from protracted to retracted; variation Elbows Flared (straight bar overhand to the lower chest, elbows out) |
| Face pull | rope from a face-height pulley, from arms extended (thumbs up) to the hands beside the head with the elbows at shoulder height and the forearms vertical (external rotation, thumbs back) |
| Straight-arm pulldown | slight hip hinge, straight bar on `bar.hang` (elbows ~15 degrees) from eye level to the thighs |
| Cable curl | the barbell curl motion with a straight cable bar and a low pulley |
| Preacher curl | machine: upper arms on two angled arm pads, bar fitted on an arc around the fixed elbows (drift < 2 cm), elbow 22 -> 118, lever links from hubs on the elbow axis to the bar ends |
| Cable lateral raise | left arm only (`sym: false`), low pulley on the right, the cable crosses in front of the body to a D-handle; from the hand in front of the hip (adducted) to shoulder height in the scapular plane, neutral grip; the right hand holds the tower post |
| Low-to-high cable fly | low pulleys on both sides, D-handles, palms forward; from the hands low and out (abd 32) up and together to eye level, constant slight elbow bend |
| Overhead triceps extension | cable version: rope from a high pulley behind, 22-degree forward lean, upper arms by the head (flex 162); rope positions fitted from FK on an arc around the fixed elbows (drift < 1 cm), the humeral `twist` goes 32 -> -18 so the hands are close behind the head and spread at lockout; elbow ~145 -> ~25 |
| Cable crunch | kneeling (`kneel`), the rope attached to the head segment (hands at the temples, neutral grip), pelvis fixed, lumbar / thoracic / chest flexion 24 / 26 / 16 (the chest turns ~66 degrees against the pelvis) |
| Pallof press | side-on to a chest-high pulley on the right, both hands stacked on one vertical handle (arm IK with `hax` / `hfd`), pressed 38 cm straight out from the sternum and back; pelvis and chest do not turn |
| Cable woodchop | high pulley on the right, rope, keys fitted from an FK design (pelvis yaw -28 -> 34, spine rotation and side bend, symmetric straight arms meeting at the midline) to the rope; hands from above the right shoulder to outside the left hip; the right foot pivots on the toes (heel up 24, turned in 26) |
| Cable external rotation / Cable internal rotation | left arm, elbow at the side flexed ~80, forearm neutral; humeral `twist` 50 -> -55 (external, pulley on the right) or -55 -> 50 (internal, pulley on the left); the elbow stays put (0 mm), the forearm sweeps 105 degrees |
| Cable glute kickback | facing the low pulley, hands on the tower posts, 16-degree lean, ankle cuff on the left; hip from 20 flexion to 28 extension with the knee nearly straight and a neutral lumbar spine (`sym: false`) |
| Standing cable hip abduction | side-on, pulley on the right, the cable crosses in front of the standing leg to a cuff on the left ankle; from slightly across the right leg (abd -7) out to abd 38, torso upright; variation Hip position Slightly flexed, toes in (flex 18, twist 16) |
| Standing cable hip flexion | facing away from the low pulley, cuff at the back of the left ankle; Straight leg (default) -10 -> 58 hip flexion; variation Knee Bent knee: hip and knee to ~90 |
| Cable pull-through | facing away from a low pulley, rope (grip 8 cm) on `bar.hang` so the arms stay straight; hinge to 60 degrees with soft knees, the rope pulled back between the legs (tilt -30), then the hips drive through to standing |
| Machine row | chest-supported: seated, chest on a vertical pad, neutral handles on lever arms from an overhead pivot (hand path on the lever's arc), from arms extended with protracted shoulder blades to elbows behind the torso, retracted |
| T-bar row | landmine T-bar: the bar pivots on the floor behind the lifter (`aim` at the held crossbar), straddled, wide stance, ~45-degree hinge, overhand crossbar (w 0.42) pulled from straight arms to the lower chest on the bar's arc |
| Smith machine squat | bar on the upper back (`seg: chest`), feet ~12 cm forward, root positions fitted so the bar path is vertical (drift 0 mm over 40 cm), carriage blocks follow it on two rails (`follow: move`, `axis` y); knees to ~107 |
| Assisted pull-up | the pull-up with the knees bent 90 on an assist pad that rides up with the knees (`follow: move` on the shank, telescoping column into a floor sleeve) |
| Machine crunch | seated against an upright backrest, chest pad on the chest segment, D-handles at the shoulders on lever links to hubs at waist height (length varies < 2 mm: the hub was searched for), pelvis fixed, spine curls ~62 degrees |
| Rotary torso machine | seated, knees against a pad, pelvis fixed; the chest pad, handles and a column to a hub on the rotation axis above the head ride on the chest; spine rotation 5 / 18 / 17 = 40 degrees to the left and back |
| Hip abduction machine / Hip adduction machine | seated, thighs level (back reclined 10), pads at the outer / inner knees on levers to hubs below the hips on the vertical abduction axis, footrests move with the shanks; abduction 3 -> 38, adduction 40 -> 8; variation Hip abduction Torso Leaning forward (pelvis 20 forward, hip flexion 110) |
| Back extension | 45-degree bench: legs straight on the 45-degree line, ankles under the roller, the hip pad below the hip crease; root rotation 45 -> 132 about the hip centre with a neutral spine (`arms-crossed`) |
| Back extension machine | seated, thighs fixed, pad on the upper back (rigid on the chest) with lever links to hubs at hip height; from 32-degree forward lean with a rounded lower back to 8 degrees behind vertical, slightly extended |
| Reverse hyperextension | torso prone on a high pad with the hips at its edge, hands on front handles, pelvis fixed; legs swing from hanging (hip flexion 84) to in line with the torso; ankle strap on pendulum links from hubs on the hip axis (constant length) |
| Glute-ham raise | GHD: knees fixed in front of the knee pad, shins on the shin pad, feet against the plate under the ankle roller; the body lowers as one straight line from the knees to 72 degrees and back (root on the circle around the knee, 12 keys: knee drift < 1 cm) |
| Landmine press | left arm (`sym: false`), 15-degree lean; the bar pivots on the floor 2.1 m in front (`aim` at the grip point), neutral grip on the sleeve end (`hax` along the bar), from the front of the shoulder (elbow ~125) up and forward to near lockout on the bar's arc |

Conventional deadlift, Romanian deadlift and Sumo deadlift use `bar.hang` (elbows ~4 degrees all the way; before, the bar
positions left the deadlift elbows bent up to 46 degrees and the RDL up to 32). New variation motions: Romanian deadlift
Knees Straight (stiff-leg), Pendlay row Grip Underhand, Pull-up Grip Neutral (parallel handles on the frame, `"bar": "neutral"`,
elbows forward, forearms ~90), Lat pulldown Grip Close neutral (V-handle via variation props).

## Known artefacts and limits

* Pectoralis major and latissimus dorsi fan out as broad sheets under the arm at full overhead flexion (overhead press lockout,
  pull-up dead hang, lateral raise at the top) - partly real, but the sheets leave the chest wall more than they should.
* Muscles do not bulge or shorten actively; they are only carried and stretched by the bones. Dual quaternions can bulge slightly
  at the inside of a deeply flexed joint (rear knee of the split squat, elbow at the top of the curl).
* The thumb uses fixed angles and does not always wrap around the bar exactly; fingers curl to one handle size (32 mm).
* No toe bending, no scapulothoracic gliding beyond the clavicle rotation, three thoracolumbar spine segments (no individual
  vertebrae), the wrist is a single segment.
* Bar positions are authored in world space, so a key change of the body can leave the bar out of reach; the test catches it.
* Variations without a different motion play the base motion. Left and right share one heat colour per muscle.
* No toe joints: a heel-up rear foot (lunges) pivots as one rigid piece, so it is lifted only ~30 degrees and the toes rest on the
  floor instead of bending. The goblet dumbbell sits a little high (top head near the chin) so the forearms clear its heads.
* Bench contact is measured on muscles and bones (there is no skin): bodies rest a few millimetres into the pad, thighs on a
  seat up to ~1.5 cm (the hamstrings of the standing atlas pose hang lower than the buttocks when the hip flexes 90 degrees, so a
  seat that touches the buttocks would swallow the thighs; the seats are set between). Machine pads: -13..+6 mm (`animcheck.js`).
* Calf raises without toe joints: the foot turns as one rigid piece. On the standing and seated calf raise the block is narrow
  and the toes overhang its front edge, so they tip down beside it instead of bending; on the leg press calf raise the foot turns
  about the ball on the plate, so the toes lift off the plate in the stretch and the toe tips touch it (up to ~9 mm in) at the peak.
* Machine levers are links from a fixed pivot to the moving handle: the handle paths follow the arc in a few keys, so a lever
  changes its length by a few millimetres between keys. Machine handles and D-handles follow the hand (always in the grip).
* The face-pull rope is drawn as straight strands (no sag); at the end position the ring sits a few centimetres in front of the face. The front-rack elbow (~138 degrees) and the Zercher bar resting on the biceps are at the limit of the skinning.

* Batch 4: ropes are drawn as straight strands; the woodchop cable crosses the front of the chest at the end of the chop and the
  cable crunch rope's virtual bar axis passes through the head (only the strands are drawn). Two hands on one handle (Pallof press)
  are stacked with the palms facing each other. Single-arm and single-leg exercises (cable lateral raise, external / internal
  rotation, kickback, standing hip abduction and flexion, landmine press) animate the left side; the other side rests. The
  glute-ham raise knee pad is a fixed roller: the thighs float up to ~2 cm above it or sink ~1.5 cm into it during the descent
  (a real pad deforms and the knees slide). The landmine and T-bar bars keep their length within a few millimetres because the
  hand / handle path is authored on the sphere around the pivot. Machine pads in batch 4: -16..+22 mm (glute-ham raise), otherwise
  -11..+4 mm; seats -18..-8 mm.

## Performance (desktop GPU, built-in browser, 860x800 canvas; beta measurements, rig v2 adds the dual-quaternion blend)

* Medium: ~9-10 ms per animated frame vs ~7.5 ms static; Low: ~8.7 ms vs ~6.2 ms. The pose solve takes ~0.05 ms (four IK
  iterations per bar arm). Phones should use Low (their default).
* First play: one fetch of the skin file (cached by the service worker afterwards) plus one shader recompile of ~10 programs.
