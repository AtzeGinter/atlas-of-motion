# Anatomy text review

Date: 2026-10-04

Scope: all 188 entries in `tools/data/muscles.txt` (key, group, actions, origin, insertion, nerve) and all 40 entries in `tools/data/extra.txt` (exercise text, clinical note). Keys were not touched; no group field was changed.

## Method and sources

Each entry was checked field by field against standard textbook-level references:

- Gray's Anatomy (41st/42nd ed.)
- Moore, Dalley & Agur, *Clinically Oriented Anatomy* (muscle tables)
- Terminologia Anatomica 2 (naming)
- Kenhub / TeachMeAnatomy (cross-check for commonly cited attachments and root levels)

Priority order: (1) innervation and root levels, with extra attention to small hand and foot muscles, laryngeal, suboccipital, pelvic floor and deep back muscles; (2) attachments and main actions; (3) clinical notes; (4) consistency of nerve naming, spelling (British, as in the existing text) and format.

An entry was changed only when it was clearly wrong, materially incomplete, overstated, or inconsistent with how the same structure is written elsewhere in the file. Where textbooks disagree (root levels typically differ by one segment between Moore and Gray's), the existing text was left alone if it matched a mainstream source.

Format checks: no CR characters, no tabs, no trailing whitespace, en dashes in all ranges, British spellings (`stabilises`, `fibres`, `equalises`) consistent throughout. `python extract.py && python lint.py` passes.

## Changes

| Key | File / field | Before | After | Reason / source |
|---|---|---|---|---|
| superior oblique | muscles / action | Intorts the eye; depresses it most when it is turned inward | … ; also abducts it | Abduction is the standard tertiary action (Moore, Gray's); the rectus entries already list secondary actions. |
| inferior oblique | muscles / action | Extorts the eye; elevates it most when it is turned inward | … ; also abducts it | As above. |
| sternocleidomastoid | muscles / nerve | Accessory nerve (CN XI); C2–C3 for sensation | Accessory nerve (CN XI); C2–C3 for proprioception | Consistency with trapezius ("C3–C4 for proprioception"); the cervical fibres are proprioceptive, not cutaneous. |
| adductor magnus | muscles / nerve | Obturator nerve (adductor part); tibial nerve (hamstring part) | Adductor part: obturator nerve (L2–L4). Hamstring part: tibial part of the sciatic nerve (L4) | The hamstring part is supplied by the tibial division of the sciatic nerve in the thigh, not the (separate) tibial nerve; root levels added (Moore). Matches the wording for semitendinosus/semimembranosus. |
| biceps femoris | muscles / nerve | Long head: tibial nerve. Short head: common fibular nerve (L5–S2) | Long head: tibial part of the sciatic nerve (L5–S2). Short head: common fibular part of the sciatic nerve (L5–S2) | Both heads are supplied by divisions of the sciatic nerve in the thigh (Moore, Gray's); consistent with the other hamstrings. |
| tibialis posterior | muscles / action | … main support of the medial arch | … main dynamic support of the medial arch | Passive support comes mainly from the spring ligament and plantar aponeurosis; tibialis posterior is the main *dynamic* stabiliser. |
| flexor retinaculum of wrist | muscles / action (description) | … through which the finger flexor tendons and the median nerve pass | … through which the long flexor tendons of the fingers and thumb and the median nerve pass | Flexor pollicis longus also runs through the carpal tunnel. |
| gluteus medius | extra / note | … the pelvis drops on the opposite side when walking. | … when standing or stepping on the affected leg, the pelvis drops on the opposite side. | "Opposite side" was undefined without naming the stance leg. |
| piriformis | extra / note | The sciatic nerve passes beneath it; tightness may irritate the nerve (piriformis syndrome). | The sciatic nerve usually emerges just below it (in some people through it); tightness may irritate the nerve (piriformis syndrome, a debated diagnosis). | "Beneath" is ambiguous (deep vs inferior); the nerve exits inferior to the muscle in most people, with known variants. Piriformis syndrome is a contested diagnosis. |
| tibialis anterior | extra / note | Weakness or deep fibular nerve damage causes foot drop. | Weakness or common/deep fibular nerve damage causes foot drop. | Foot drop is classically from common fibular nerve injury at the fibular neck. |
| masseter | extra / note | Strongest muscle by force relative to size; … | Often cited as the strongest muscle relative to its size; … | Popular claim, not an established measurement; softened. |

Totals: 11 changes in 11 entries. muscles.txt: action 4 (incl. one connective-tissue description), nerve 3, origin 0, insertion 0, group 0. extra.txt: clinical note 4, exercise text 0.

## Checked, doubtful, left unchanged

| Key | Field | Note |
|---|---|---|
| brachialis | nerve | "Musculocutaneous nerve (C5–C6), small radial branch" is the mainstream view; the radial contribution to the lateral part is variable but common. Kept. |
| pectineus | nerve | Femoral nerve, sometimes obturator (or accessory obturator) nerve: mainstream, already stated. |
| flexor digitorum profundus, lumbricals (hand) | nerve | Median for 2–3, ulnar for 4–5 is the usual pattern; the 3rd lumbrical / ring-finger FDP is dually supplied in a substantial minority. Kept as written. |
| flexor pollicis brevis | nerve | Superficial head median, deep head ulnar is the usual pattern; dual or ulnar-dominant supply is frequent. Kept. |
| pectoralis minor | nerve | Moore gives medial pectoral nerve only; many sources add a lateral pectoral contribution. Kept. |
| supinator | nerve | "Posterior interosseous nerve" vs "deep branch of the radial nerve": both used, since the deep branch becomes the PIN as it leaves supinator. Kept. |
| levator ani | nerve | "Nerve to levator ani (S4) and pudendal nerve": Gray's gives S4 (sometimes S3/S5); the pudendal (inferior rectal) contribution is accepted by Moore but debated. Kept. |
| coccygeus | nerve | S4–S5 (Moore) vs S3–S4 (Gray's). Kept. |
| transverse arytenoid | nerve | Recurrent laryngeal is standard; some sources describe a contribution from the internal laryngeal nerve. Kept. |
| splenius capitis | nerve | "Dorsal rami of C2–C3": sources range from "middle cervical" to C3–C4. Kept. |
| levatores costarum | nerve | Dorsal rami C8–T11 (Moore); some older sources give intercostal (ventral) rami. Kept. |
| intrinsic foot muscles | nerve roots | Medial/lateral plantar muscles are given as S1–S2/S1–S3/S2–S3; Moore uses S2–S3 throughout, Gray's S1–S2 for medial plantar. Nerves themselves are correct; root levels left as written. |
| several (teres major, anconeus, sternothyroid, scalenus posterior, iliacus, FDS, FPL) | nerve roots | Differ by one segment between Moore and Gray's; all match at least one mainstream source. Kept. |
| internal intercostal | origin / insertion; action | Origin vs insertion direction is a convention and varies between texts. The interchondral part assists inspiration; "forced exhalation" describes the interosseous part. Kept for brevity. |
| semispinalis | origin | "Transverse processes C4–T12" follows Moore; other sources stop at T10. Kept. |
| brachioradialis | insertion | "Styloid process of the radius": Moore says lateral distal radius just proximal to the styloid; Kenhub says styloid process. Kept. |
| supraspinatus | action | "Starts abduction" is the textbook phrasing; EMG shows it acts throughout abduction. Kept. |
| adductor magnus | action | "Adductor part flexes" follows Moore; its flexor role is small. Kept. |
| trapezius | clinical note | "Upper fibres often overwork when the lower trapezius and serratus anterior are weak": a coaching and scapular-dyskinesis model with moderate evidence. Kept. |
| diaphragm | clinical note | Hiccups also involve abrupt glottic closure; the note is a simplification but not wrong. Kept. |

No group assignments were found to be clearly wrong.

## Limits

This is an AI-assisted review against textbook-level knowledge. It is not a substitute for review by an anatomist. No primary literature or cadaveric data were consulted, and anatomical variation is only noted where it is common and clinically relevant. Root levels in particular differ between authoritative sources, and only clear errors were corrected. The exercise involvement levels in `exercises.py` were outside the scope of this review.
