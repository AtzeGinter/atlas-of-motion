# Atlas of Motion: ideas for a future release

Discussion paper, 2026-10-07. Points to talk through; recommendations are marked **→**.

## 0. Decisions (2026-10-08)

| Topic | Decision |
|---|---|
| Goal | Side project that should earn a small income if feasible |
| Target group | All types of athletes (launch/marketing: start with one niche, e.g. hybrid and combat athletes, then widen) |
| Budget and time | Not yet clear |
| Free vs Pro | Freemium as recommended (section 5) |
| Platform | Web/PWA only for now (comparison in section 11) |
| Accounts and sync | Local-first, no server, no personal data processed by us |
| AI | Not needed |
| Name | Keep "Atlas of Motion"; secure the trademark (section 12) |
| Own feedback | End of the week (from training with the app) |

Consequences:
- **Pro without a server:** sell a licence key via a merchant-of-record provider (e.g. Paddle, Lemon Squeezy: they handle EU VAT); the app verifies the key offline with a signature. Not copy-proof in a web app, acceptable for a side project.
- **Legal minimum anyway:** imprint and privacy policy once there is income (hosting logs at GitHub Pages, payment provider); trade registration and the small-business VAT rule are typical for a small income in Germany (check with a tax adviser).
- Section 4 "Optional account + sync" and "AI coach" are dropped for now; backups stay with "Export data / Import data".

## 1. Where the app stands today (v1.10)

- 3D muscular atlas (176 muscles, bones, 53 schematic nerves, 62 movements) with three quality levels, offline PWA.
- 148 exercises with variations, heatmaps, comparison, "best exercises for a muscle".
- Week planner: 7 days, schedule board with drag and drop, goal-based volume targets, gap filler, recovery model with conflict warnings.
- Endurance and combat sports (incl. Muay Thai rounds), heart-rate zones, week balance (WHO minutes, 80/20, VO2max sessions).
- Training log ("Today" view), history, JSON backup.
- No account, no server, no tracking: everything stays on the device.

**Unique combination:** anatomy depth + training planning + endurance/combat in one tool. Competitors usually cover one of these three.

## 2. Target groups (who is it for?)

| Segment | Need | Fit today | Willingness to pay |
|---|---|---|---|
| **A. Hybrid athletes** (lifting + running/cycling, combat sports with strength work) | Plan strength and endurance together without overload | **very high** (recovery model, endurance, Muay Thai) | medium–high |
| **B. Ambitious recreational lifters** (1–5 years of training) | Understand what training does, balanced volume, progression | high (missing: progression, stats) | medium |
| **C. Students** (physio, sports science, medicine, trainer licences) | Learn anatomy: muscles, origins/insertions, nerves, movements | high (missing: quiz, Latin names, German) | low individually, institutional licences possible |
| **D. Coaches / personal trainers** | Plans for clients, explain visually, check in | medium (missing: client management, sharing) | high (B2B) |
| **E. Physio / rehab** | Exercise selection by region | medium, but **regulatory risk** (medical claims, EU MDR) | high, but costly to enter |

**→ Recommendation:** primary **A (hybrid athletes, incl. combat sports)**, secondary **B**. Small, underserved niche, fits the existing features best, and you are part of it yourself (authentic marketing). **C** as a second, separate track ("Atlas mode") later; **E** deliberately not for now.

**Positioning in one sentence:** "See what your training does to your body, and plan strength and endurance without overreaching."

## 3. Competitive landscape (from memory, to verify)

- **Training logs:** Hevy, Strong, JEFIT: good logging, weak anatomy/recovery understanding.
- **AI planning:** Fitbod (has a muscle recovery heatmap, but 2D), Alpha Progression (volume-based, German market).
- **Anatomy for training:** Muscle & Motion (strong anatomy videos), MuscleWiki (free, exercise-by-muscle).
- **Anatomy learning:** Complete Anatomy, Visible Body, Kenhub: expensive, not training-focused.
- **Endurance:** Strava, Garmin Connect, TrainingPeaks: no strength/anatomy integration.

**Gap:** nobody combines 3D anatomy + strength/endurance planning + recovery for hybrid and combat athletes.

## 4. Feature ideas

### Must-have for a "real" release (v2.0)
1. **Progression:** progressive overload suggestions from the log (reps/weight/RIR), estimated 1RM, personal records, plateaus detected.
2. **Statistics:** volume per muscle over weeks (actual vs planned), adherence, strength curves, endurance minutes per zone over time.
3. **Programme templates and plan generator:** "3 days strength + 2 runs + 2 Muay Thai, equipment X, goal Y" → complete week (gap filler + recovery model already deliver the logic). Templates: PPL, Upper/Lower, Full body, hybrid running, fight camp.
4. **Better logging in the gym:** rest timer, RPE/RIR, supersets, notes, quick entry with large buttons, "same as last time".
5. **Optional account + sync** across devices (or local-first with E2E encryption). Health data = special category under GDPR, so plan carefully.
6. **German UI** (+ English), Latin anatomy names as an option.

### Nice to have
- **Wearables:** Apple Health / Google Health Connect, Garmin, Strava import for endurance sessions and heart rate.
- **AI coach** (e.g. Claude API): "Build me a 4-day plan around 2 Muay Thai sessions", "Why does my shoulder conflict show up?", explain muscles in plain language.
- **3D exercise animations:** skeleton/muscles moving through the exercise (rigging). Very strong visually, but expensive.
- **Coach mode:** clients, share plans via link, check-ins, comments.
- **Readiness/recovery check-in:** sleep, soreness, mood → adjust day.
- **Fight camp / race block planning:** periodisation towards a date (taper, deload weeks).
- **Quiz and learning mode** for track C (spaced repetition, nerve and movement questions).
- **Injury-aware mode** ("avoid shoulder loading"): useful, but phrase it carefully, no medical promises.
- **Share images:** heatmap of the week as a picture for Instagram/Stories (marketing at the same time).

## 5. Monetisation

| Model | Content | Assessment |
|---|---|---|
| **Freemium** | Free: atlas, exercises, 1 plan, basic log. Pro: progression, statistics, templates/generator, sync, AI, endurance analysis | **→ recommended** |
| Price Pro | approx. €5–8/month or €35–50/year, lifetime option for early users | typical of the segment |
| B2B coach | €15–30/month per coach with client seats | later, track D |
| Education | Institutional licence for schools/universities | later, track C |
| One-time purchase | simple, but no recurring revenue | only as lifetime option |

Free should stay genuinely useful (atlas + planning) as the marketing engine; payment for things with ongoing cost or high value (sync, AI, analysis).

## 6. Platform and technology

- **Web/PWA first** (exists, no store fees, quick updates). Payment via Stripe/Paddle (Paddle handles VAT as "merchant of record", convenient in the EU).
- **App stores later** via a wrapper (Capacitor): visibility, push notifications, Health integration. Note: store fees (15–30 %), review, CC BY-SA/DRM question (see README).
- **Backend** only when sync/accounts/payment come: e.g. Supabase (EU region) or local-first sync. Keep "works without an account" as a principle.
- **Technical to-dos before release:** real-device performance tests, three.js upgrade, privacy-friendly analytics (e.g. Plausible), error reporting, data migration strategy, load testing not needed (static).

## 7. Legal and quality (Germany/EU)

- **Imprint (Impressum)** and **privacy policy** required for a commercial website.
- **GDPR:** training/heart-rate data are health data (Art. 9) as soon as they leave the device. Without sync: almost no issue.
- **No medical claims** (otherwise EU Medical Device Regulation risk): "training and education tool, not a medical device".
- **Content review:** anatomy texts and exercise ratings have not been checked by experts yet. For a paid product: review by a physiotherapist/anatomist and an S&C coach; cite sources for the exercise ratings (task 3.4).
- **3D models:** CC BY-SA is commercially usable with attribution (see README "Commercial use of the 3D models"); have a lawyer confirm, especially for app stores.
- **Name/trademark:** check "Atlas of Motion" (DPMA/EUIPO, app stores, domain) before investing in branding.

## 8. Go-to-market ideas

- **Visual short videos** (TikTok/Reels/Shorts): rotating 3D body with the week's heatmap, "which muscles does a Muay Thai session load?". The app is made for this kind of content.
- **SEO:** each muscle, exercise and movement as its own indexable page (deep links already exist), e.g. "best exercises for the rear delt", "which muscles does a teep use".
- **Communities:** r/hybridathlete, r/MuayThai, r/weightroom, local gyms and fight gyms (beta testers with real training data).
- **Partnerships:** coaches/gyms with a coach account, physio schools for track C.
- **Beta programme:** 20–50 testers, feedback in the app, lifetime discount as thank-you.

**Metrics to watch:** first plan created (activation), share of weeks with ≥ 2 logged sessions (retention), conversion free → Pro, churn.

## 9. Possible phases

| Phase | Duration (rough) | Content |
|---|---|---|
| **0 · Polish** | 2–4 weeks | Real-device tests, performance, German, imprint/privacy, analytics, feedback channel, name check |
| **1 · Public beta (free)** | 1–2 months | Progression + statistics, templates, gather testers, content marketing starts |
| **2 · v2.0 Pro** | +2–3 months | Account/sync, payment, plan generator, AI coach (beta), expert review of the content |
| **3 · Expansion** | later | App stores, wearables, coach mode, education track, own/licensed models if needed |

## 10. Questions for our discussion

1. **Goal:** side project / portfolio, small income, or a serious product?
2. **Target group:** do you share the focus on hybrid/combat athletes, or rather students/coaches?
3. **Budget and time:** how much per month for content review, legal advice, possibly models and marketing? Hours per week?
4. **Free vs Pro:** where exactly is the line?
5. **Web only or app stores too** (and when)?
6. **Accounts/sync:** necessary, or stay strictly local-first?
7. **AI:** is an AI coach a core feature or a gimmick for you?
8. **Name and brand:** keep "Atlas of Motion" (check trademark) or rename?
9. **Your own use:** what do you miss most when you train with it yourself? (Best source for the next features.)

## 11. Web app vs "real" app

| | PWA (today) | Packaged app (Capacitor / TWA) | Native rebuild |
|---|---|---|---|
| What | Installable web page | Same web code in a native shell, in the stores | Swift/Kotlin or React Native |
| Effort | done | days to weeks | very large (3D part rewritten) |
| Store visibility | no | yes | yes |
| Phone features | limited (no HealthKit, push on iOS only when installed, no background) | Health data, notifications, haptics, files | all |
| Costs | none | Apple $99/year, Google $25 once | plus development |
| Selling | free choice of provider, no store cut | in-app purchase required, store takes 15% (small-business rate) | same |
| Updates | instant | store review | store review |
| Risks | – | Apple guideline 4.2 ("just a website"), CC BY-SA vs DRM | – |

→ Stay PWA; later Android via TWA (cheap); iOS only with revenue and a concrete need (e.g. Apple Health import).

## 12. Securing the trademark "Atlas of Motion"

1. Search first (free): DPMAregister, EUIPO eSearch, TMview; also app stores, domains, social handles.
2. Classes: 9 (software/apps), 41 (education, sports training), 42 (providing online software).
3. Filing (approximate fees, check current ones): **DPMA** online about €290 for up to 3 classes (Germany, 10 years); **EUIPO** about €850 for 1 class, +€50 for the 2nd, +€150 each further (whole EU). Prefer a **word mark**.
4. Risk: "Atlas of Motion" may be judged descriptive for anatomy education; a first opinion from a trademark attorney (a few hundred euros) before filing.
5. Now: register domains (e.g. .app / .com / .de) and social handles; use ™ until registered, ® only afterwards.
