# Atlas of Motion: upcoming tasks

Status as of 2026-10-04. Project renamed from "Myology" to **Atlas of Motion** (repo `atlas-of-motion`). Local git repo on `main`, not yet pushed.

Legend: **S/M/L** = rough size. **Agent** = suggested executor (`sonnet` for well-scoped coding, `opus` for design/judgement-heavy work, `you` = needs a human). ★ = my own idea (not in CLAUDE.md roadmap).

---

## P0: Get a working, reproducible checkout

| # | Task | Size | Agent |
|---|------|------|-------|
| 0.1 | ✅ Unpacked + local git repo (`main`) done. **Open:** create the GitHub repo, push, enable Pages, replace `<your-username>` placeholder in README. | S | you + sonnet |
| 0.2 | ✅ **Done 2026-10-04.** ★ **Fix Windows encoding in the pipeline.** All `open()` calls in `build.py`, `meta.py`, `exercises.py`, `assemble.py` use the platform default (cp1252 here). `muscles.txt` has 177 non-ASCII chars (–, °, ä…) → mojibake like `â€“` in the built app. Add `encoding="utf-8"` everywhere (or run with `python -X utf8`). | S | sonnet |
| 0.3 | ✅ **Done 2026-10-04** (Node 24.19; smoke test 53/53 passing). ★ **Node is v16 here; the smoke test needs ≥18** (jsdom 24, global `DecompressionStream`/`Response`/`Blob`). Upgrade Node to LTS (22) and add `"engines": {"node": ">=18"}` to `tools/test/package.json`. | S | you |
| 0.4 | ✅ **Done 2026-10-04.** ★ **Make the smoke test actually fail.** `smoke.js` only prints and always `process.exit(0)`; THROW/ERR lines don't fail the run. Add asserts (expected card text, counts, localStorage content), non-zero exit on error, and replace the fixed 8 s `setTimeout` with polling for `#loading` removal. | M | sonnet |
| 0.5 | ✅ **Done 2026-10-04.** ★ **Template-only rebuild without the 60 MB BodyExplorer clone.** `geo.b64`/`meta*.json` are git-ignored, so a fresh clone can't rebuild after a template edit. Either commit the geometry as a binary asset (see 2.1) or add `tools/extract.py` that recovers `geo.b64` + `meta3.json` from the current `index.html`. | S | sonnet |
| 0.6 | ✅ **Done 2026-10-04.** ★ **CI (GitHub Actions):** on push/PR run `exercises.py` asserts, `assemble.py`, the smoke test; fail if committed `index.html` is out of sync with sources. Deploy Pages from the workflow. | M | sonnet |

## P1: Correctness and robustness

| # | Task | Size | Agent |
|---|------|------|-------|
| 1.1 | ✅ **Done 2026-10-04.** ★ **Plan storage fragility.** Plan entries store variation *indices* (`v:[1,0]`) and exercise *names*. Reordering options in `VARS` or renaming an exercise silently changes or drops plan entries. Store option names, migrate `myology.plan.v1` → `aom.plan.v2` (and `myology.eq.v1` → `aom.eq.v1`, dropping the old project name from storage keys). Also guard `p.v` being undefined (`p.v.slice()` throws in the `data-open` handler). | S | sonnet |
| 1.2 | ✅ **Done 2026-10-04.** ★ Volume toggle stays checked when an exercise is selected (`volOn` remains true while `mode==="ex"`). Decide on behaviour and make the UI consistent. | S | sonnet |
| 1.3 | ✅ **Done 2026-10-04.** ★ Weekly summary rows use a single representative muscle (Quadriceps = vastus lateralis only, Hamstrings = semitendinosus only, Lower back = iliocostalis). Use the max/avg over the whole group so rectus femoris-only or biceps-femoris-biased work shows up. | S | sonnet |
| 1.4 | ✅ **Done 2026-10-04.** ★ Data lint script: field count per line in `muscles.txt`/`extra.txt`, duplicate keys, duplicate exercise names, every `EQ`/category value valid, `EXCATS` in template == categories in `exercises.py`. Run in CI. | S | sonnet |
| 1.5 | ✅ **Done 2026-10-04.** ★ Refactor duplicated body-depth logic (`focusOn` re-implements `bodyZ`). | S | sonnet |
| 1.6 | ✅ **Done 2026-10-04.** Anatomy review pass, focusing on innervation of small hand/foot/laryngeal muscles (flagged as most error-prone). Ideally an anatomist; otherwise cross-check against Gray's/TA2 and record sources. | L | opus + you |

## P1b: UI cleanup and mobile experience (requested 2026-10-04)

Goal: less clutter on desktop, and a phone layout that actually works. The current UI fails on phones in these ways:
- The sidebar always shows Layers (4 toggles + 2 sliders) and View above the tabs, so in the 42 % bottom panel the tabs and lists sit below the fold.
- The info card overlays up to 72 % of the screen and covers the model.
- Hover tooltips don't exist on touch.
- Touch targets are small (15 px checkboxes, 26 px set steppers).

| # | Task | Size | Agent |
|---|------|------|-------|
| 5.1 | ✅ **Done 2026-10-04** (findings and decisions below). **Audit first**: screenshots at 375×812, 768×1024 and desktop (browser pane mobile emulation + a real phone). List concrete problems; agree on a target layout before coding. | S | opus + you |
| 5.2 | ✅ **Done 2026-10-04.** **Desktop declutter / progressive disclosure**: move Layers, opacity sliders and View into a compact floating toolbar or "Display" popover on the viewport. Collapse rarely used sections by default. Sidebar keeps only the tabs and their content. Remember open/closed state per viewer. | M | sonnet |
| 5.3 | ✅ **Done 2026-10-04.** **Mobile layout**: full-screen 3D view + a draggable **bottom sheet** (peek / half / full snap points). Tabs become a bottom nav. The selected muscle/exercise card lives *in* the sheet instead of floating over the model. Use `100dvh` and safe-area insets. | L | sonnet (opus to review) |
| 5.4 | ✅ **Done 2026-10-04.** **Touch interaction**: tap shows a name label (replaces hover tooltip), double-tap to focus/zoom, larger tap-vs-drag threshold on touch, two-finger pan hint, touch-specific hint text. | M | sonnet |
| 5.5 | ✅ **Done 2026-10-04.** **Touch targets and inputs**: ≥ 44 px hit areas (checkboxes, steppers, chips, × buttons). Inputs at 16 px font so iOS doesn't zoom on focus. Bigger variation buttons. | S | sonnet |
| 5.6 | **Phone performance**: cap pixel ratio at ~1.5 on small screens, measure load and FPS on a mid-range phone, consider lower-detail geometry for mobile (ties in with 2.1/2.4/2.6). | M | sonnet |
| 5.7 | Extend the smoke test with a mobile-width run (layout classes and the sheet open/close flow), plus manual check on iOS Safari and Android Chrome. | S | sonnet |

**5.1 decisions (user, 2026-10-04):** phone = **bottom sheet** (peek / half / full, tabs in the sheet header, cards inside the sheet, model re-centres above it); desktop = **floating toolbar** on the 3D view (layers, opacity, views as icon buttons with popovers), sidebar = one-line title + tabs.

**5.1 audit findings (2026-10-04, browser emulation at 375×812 and 1366×768):**
- Phone: the 3D view gets the top 471 px and the panel the bottom 341 px. The panel scrolls 1,842 px of content, and the **tabs start 504 px down**: you scroll through the intro (109 px), Layers (250 px) and View before reaching Anatomy/Exercises/Workout.
- Phone, exercise view: the card opens at y=122 with 339 px height (929 px of content). It **covers the whole body except the head**, so the heatmap, the main point of the exercise view, is invisible.
- Phone, tapping: tapping the chest selected the manubrium (a tiny bone). Small structures win fat-finger taps, and nothing shows what will be picked before the tap.
- Phone: no horizontal overflow (good). The canvas renders at DPR 2 (750×942), so cap it. The Index checkboxes are 15×15 px.
- Desktop: works, but Layers + opacity + View take about 40 % of the sidebar height above the tabs. The card overlaps the right part of the model (acceptable on wide screens).

(This replaces the earlier ideas 4.11 partly and 4.12 fully. Do 5.1 first; 5.2 and 5.3 share the same refactor of the sidebar markup, so one agent should do them sequentially.)

## P1c: Planner improvements (requested 2026-10-04)

| # | Task | Size | Agent |
|---|------|------|-------|
| 6.1 | ✅ **Done 2026-10-04.** **Goal-based volume targets** replace the fixed 10–20 band: Maintain 4–6 · Strength 6–10 · Hypertrophy, close to failure 8–12 (default) · Hypertrophy, moderate intensity 10–20 · Custom range. The weekly table, bands, heatmap colours and status texts follow the target; "over target" reads as "more than needed", not as "good". Short evidence note in the UI (≥10 sets beat fewer; diminishing returns above; strength plateaus earlier; sets close to failure cost more recovery). Persisted. | M | sonnet |
| 6.2 | ✅ **Done 2026-10-04** (scoring tuned by Opus over 12 scenarios). **Gap filler**: "Suggested to complete your week": greedy scoring over the exercises allowed by your equipment. Gain = raised under-target groups; penalty = overshoot of groups already at or above target. Top 3 with "+ add" and which groups each fills. Updates live. (Supersedes 4.7.) | M | sonnet (opus to review the scoring) |
| 6.3 | Training days (Day 1…n or weekdays, per-day exercises, weekly volume = sum, per-day view). **Needs the user's decisions first** (asked 2026-10-04, not yet answered). | L | – |
| 6.4 | Endurance training (running etc., VO2max intervals, zone minutes vs targets, muscles on the body). **Needs the user's decisions first.** | L | – |
| 6.5 | Weekly volume controls beyond 6.1 (per-muscle targets, scale the whole week for deload/build weeks, typing sets directly). **Needs the user's decisions first.** | M | – |

## P2: Performance and hosting (now that it's GitHub Pages)

| # | Task | Size | Agent |
|---|------|------|-------|
| 2.1 | ✅ **Done 2026-10-04** (with 2.7). Roadmap #6: move geometry out of the HTML into `geo.bin` (raw gzip, no base64; ~25 % smaller), `fetch()` it with a progress bar. HTML drops from 7 MB to ~70 kB. Smoke test must load the file too. | M | sonnet |
| 2.7 | **Mesh quality levels Low / Medium / High** (user request 2026-10-04): switch in the Layers popover, persisted. Low ≈ 300–380k faces is the phone default, Medium (today, 769k faces, 5.2 MB) the desktop default, High = full detail (1.59M faces, 9.9 MB) loaded on demand. Combined with 2.1: geometry moves to `geo/<level>.bin`, `tools/meshes.json` is committed, `extract.py` is dropped. ✅ **Done 2026-10-04**: Low 362k faces / 2.3 MB, Medium 769k / 5.2 MB, High 1.59M / 9.9 MB; index.html 7.1 MB → 0.25 MB; file URLs carry a content hash for cache busting. | L | sonnet |
| 2.2 | ★ **Self-host Google Fonts and three.js.** Embedding Google Fonts sends visitor IPs to Google (ruled a GDPR violation, LG München 2022). Self-hosting also enables offline use and lets us drop CDN risk (or at least add SRI hashes). | S | sonnet |
| 2.3 | Service worker + web manifest → installable offline PWA (depends on 2.1, 2.2). | M | sonnet |
| 2.4 | ★ **Hover raycasting cost:** every mouse move raycasts ~670 meshes / 770k triangles. Add `three-mesh-bvh` or a coarse bounding-sphere prefilter; measure on a low-end laptop/phone first. | M | sonnet |
| 2.5 | ★ Upgrade three.js r128 (2021) → current release via import map (ES modules; `outputColorSpace`, colour management changes, light intensity units). Do after 2.1 so the diff is reviewable. | M | opus |
| 2.6 | ★ Startup: decode geometry in a Web Worker and transfer buffers; precompute normals in the pipeline instead of `computeVertexNormals()` on the main thread (trade-off: bigger file, test both). | M | sonnet |

## P3: Features (roadmap)

| # | Task | Size | Agent |
|---|------|------|-------|
| 3.1 | Roadmap #1: rank variations as separate entries in "Best exercises for" and in the muscle card (fixes the `EXK` gap). | M | sonnet |
| 3.2 | Roadmap #2: plan export/import (JSON file) + training days with per-session volume. | M | sonnet |
| 3.3 | Roadmap #3: left/right and per-part toggles in the Index; unilateral exercises light one side (needs a `unilateral` flag in `exercises.py`). | M | sonnet |
| 3.4 | Roadmap #4: replace 3 levels with cited per-muscle percentages (research task first: build a sources table, then data format change). | L | opus |
| 3.5 | Roadmap #5: rebuild meshes directly from BodyParts3D + Z-Anatomy (own alignment of the 66 Z-Anatomy meshes). | L | opus |

## P3: My own feature ideas ★

| # | Idea | Size | Agent |
|---|------|------|-------|
| 4.1 | **Deep links / shareable state** in the URL hash: `#m=deltoid`, `#ex=back-squat&v=wide`, `#cmp=…`, `#plan=<compressed>`. Makes it linkable from forums and lets users share a plan without a backend. | M | sonnet |
| 4.2 | **Colloquial names and synonyms** in search: "lats", "pecs", "quads", "abs", "traps", "glutes", "hammies", "rear delts" → keys. Plus fuzzy matching (typos). | S | sonnet |
| 4.3 | **Search by action/movement**: "elbow flexion", "hip abduction" → highlight all muscles with that action (data is already in `db[key].a`). Good learning feature. | M | sonnet |
| 4.4 | **Antagonist / agonist info** on the muscle card and a "balance" warning in the planner (e.g. pressing vs pulling sets, quad vs hamstring ratio). | M | opus |
| 4.5 | **Quiz mode**: highlight a random muscle, pick its name / function / nerve; spaced-repetition score in localStorage. | M | sonnet |
| 4.6 | ✅ **Done 2026-10-04.** **Exercise database expansion**: fill coverage gaps (80 muscles covered). Candidates: Nordic curl, Copenhagen plank, tibialis raise, Pallof press, reverse hyper, landmine press, sissy squat, Jefferson curl, wrist roller, hip airplane. Add a `unilateral` flag and `difficulty`. | M | sonnet (data) + opus (review levels) |
| 4.7 | ~~"Fill my gaps"~~ → moved to 6.2. **"Fill my gaps" planner helper**: given the current plan and equipment, suggest the exercise that best raises under-trained muscles without overshooting others. | M | opus |
| 4.8 | **Screenshot / export view** as PNG (`preserveDrawingBuffer` or render-to-canvas on demand), e.g. to save an exercise heatmap. | S | sonnet |
| 4.9 | **3D labels / leader lines** for the selected structure and its origin/insertion bones. | L | opus |
| 4.10 | **i18n** (German first?): externalise UI strings; anatomy keys stay English, add translated display names. Latin (TA2) names as an option for students. | L | opus |
| 4.11 | **Accessibility pass**: tabs with `aria-controls` + arrow-key navigation, keyboard orbit/zoom, focus management for the card, colour-blind-safe heat palette option, contrast check of the volume colours. | M | sonnet |
| 4.12 | ~~Mobile UX~~ → moved to P1b (5.3–5.5). | – | – |

---

## Suggested order

1. **P0 in one batch**: 0.2, 0.4, 0.5 can run as parallel `sonnet` agents (separate files); 0.1/0.3 need you; 0.6 after 0.4/0.5.
2. **P1 quick fixes** (1.1–1.5) as one `sonnet` agent, then a review pass.
3. **P1c planner**: 6.1 + 6.2 (one agent, after the quality levels 2.7 land).
3b. **P1b UI/mobile**: 5.1 audit → 5.2 + 5.3 (one agent, sequential) → 5.4/5.5 → 5.7.
4. **2.1 → 2.2 → 2.3** (hosting/perf chain), then 2.5.
5. Features by value/effort: 4.2, 4.1, 3.1, 3.2, 4.3, 4.6.
