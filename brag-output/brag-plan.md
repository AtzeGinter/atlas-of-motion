# Atlas of Motion: launch video plan

**What it is:** a free 3D atlas of the human muscular system in the browser. Click any muscle to see what it does, pick an exercise to see which muscles it trains, and plan your training week against a per-muscle volume goal.
**For:** people who lift and want to know what their training actually hits, plus students who are learning anatomy.
**What sets it apart:** one real 3D body (BodyParts3D / Z-Anatomy meshes) that every feature paints onto. Exercises, comparisons and the weekly plan all appear as colour on the same anatomy. No account, works offline.
**Most impressive claim:** 176 muscles and 148 exercises, all shown on one body.
**Visual hook:** a full anatomical body. The question appears, then the body drops to the skeleton and only the muscles a squat trains stay lit, in three heat levels.
**Tone:** `polished` (inferred from the "anatomical atlas / night library" identity: serif type, oxblood and ochre, long holds, soft fades).
**Share caption:** see `share-copy.txt`.

## Angle
Start with the question every lifter has ("What does a squat actually train?") and let the real app answer it on the real 3D body. Then show the three things you can do with it: inspect a muscle, compare two lifts, and plan a week that shows what you're missing.

## Visual identity (taken from tools/template.html)
- Dark theme "night library": bg `#17120E`, ink `#EDE4D6`, muted `#A89886`, accent `#D86F59`, ochre `#D9A84E`, line `#3A2E24`.
- Heat colours from `PAL`: prime `#A62E1C`, synergist `#D8743F`, stabiliser `#EBCB7F`. Volume bands `v0..v3`. Comparison A blue / B red.
- Type: Fraunces (headlines), Source Serif 4 italic (sub lines), Archivo small caps (kickers), using the self-hosted woff2 files.
- Kickers copy the app's own section numbering: "I · Anatomy", "II · Exercises", "III · Workout".
- Everything on screen is the live app (index.html served locally, driven frame by frame, mesh quality High). Overlays are captions, a cursor and click ripples only.

## Storyboard (22.0 s, 1920×1080, 30 fps; music at 100 BPM, downbeat on the heat reveal at 1.8 s)

| # | Time | Scene | On screen | Sound |
|---|---|---|---|---|
| 1 | 0.0–3.6 | **Hook** | Full-bleed 3D body in anatomical colours, slow orbit. Headline: "What does a squat actually train?" At 1.8 s the real Back squat heatmap snaps on: the body drops to the skeleton and the quads and glutes glow. A legend appears: Prime mover · Synergist · Stabiliser. | Pad swell into a low hit + chord at 1.8 s |
| 2 | 3.6–6.6 | **Reveal** | The camera keeps orbiting toward a three-quarter view. Title "Atlas of Motion", sub line "176 muscles. 148 exercises. One 3D body." Dip to background. | Piano arpeggio comes in |
| 3 | 6.6–10.8 | **Highlight 1: Anatomy** | The real app UI in a window. "I · Anatomy / Click any muscle. See what trains it." The cursor clicks the gluteus maximus on the back view, the muscle turns ochre, the camera focuses and the real card slides in (function, origin, insertion, nerve, 55 exercises that train it). | Soft pitched click, full groove starts |
| 4 | 10.8–15.0 | **Highlight 2: Exercises** | "II · Exercises / Compare two lifts, muscle by muscle." With Back squat selected the cursor types "romanian" into the exercise search and clicks Romanian deadlift. The comparison heatmap appears (squat blue, RDL red) and the camera swings to the side to show quads against hamstrings. | Quiet key ticks, click |
| 5 | 15.0–18.6 | **Highlight 3: Workout** | "III · Workout / Plan your week. Spot the muscles you skip." The volume heatmap of a push/pull/squat week (back view, hamstrings untrained). The gap filler's top pick is Glute-ham raise: the cursor bumps it to 5 sets and clicks "+ Add to Mon 19 Oct", and the hamstrings light up. The legend shows the volume bands. | Two soft ticks, click, lift |
| 6 | 18.6–22.0 | **Outro** | Full-bleed body in anatomical colours. "Atlas of Motion" / "Free in your browser. Works offline." / atzeginter.github.io/atlas-of-motion. Soft fade at the end. | Resolving chord, tail |

**Poster / frame 0:** the settled reveal title over the heat-lit body.

## Data notes
- The week in scene 5 is a fictional demo plan (bench, overhead press, pull-ups, rows, squats ...) added through the app's own `addToPlan`. It contains no personal data.
- No secrets, accounts or user data appear. The licence panel is never shown.
