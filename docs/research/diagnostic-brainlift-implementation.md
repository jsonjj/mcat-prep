# Diagnostic: what the code actually does (DOK 1 fact sheet)

Scope: the diagnostic as delivered by `apps/learner-web`, plus the policy modules it
calls. Read on 31 Jul 2026 from source only — nothing here was run. Line numbers are
as-read; every claim is traceable to a file:line below.

> **Rechecked 2026-08-01 against `4a1c84e`.** An 88-commit push (313 files) landed after
> this was written. **Nothing in §§1–8 changed.** The verification is recorded in §9,
> along with the four things the push added that a reader will mistake for changes to the
> diagnostic and are not.

**One-line summary:** production serves a **fixed 140-item, 7-block multistage test**
over the **10 AAMC Foundational Concepts**, routes between blocks on number-correct,
scores with a hierarchical Bayesian 3PL posterior per concept, names **2** priorities,
and seeds KC-grain BKT priors. The adaptive/early-stopping engine that most of the
code and all of the manifest text describes **is not on the delivery path**.

---

## 1. Structure

| Property | Value | Source |
|---|---|---|
| Delivered design | `MST_140_RECOMMENDED`, label `MST 140 (7 x 20, 3-way, contention)` | `packages/policies/src/diagnostic-mst.ts:214-224` |
| Total items | **140** (7 × 20) | `diagnostic-mst.ts:216-218` |
| Stages (blocks) | **7**, stage 1 is the common routing module | `diagnostic-mst.ts:217`, `diagnostic-mst.ts:699-701` |
| Items per stage | **20**, uniform | `diagnostic-mst.ts:218` |
| Modules per stage | **3** (easy / medium / hard) after stage 1; stage 1 has one | `diagnostic-mst.ts:219`, `diagnostic-session.ts:34` |
| Reporting axis | `FC_AXIS` = `fc-10`, **10 buckets** (FC1–FC10) | `apps/learner-web/server/diagnostic-engine.ts:46`, `diagnostic-axis-fc.ts:56-68` |
| Guaranteed items/bucket | **8** = 2 (balanced stage 1) + 6 × 1 (contention floor) | `diagnostic-mst.ts:221`, `diagnostic-mst.ts:423-431` |
| Max items/bucket (pool sizing) | **26** = 2 + 6 × 4 | `diagnostic-mst.ts:434-439` |
| Design selection | `MCAT_MST_DESIGN` env var, else `MST_140_RECOMMENDED` | `diagnostic-engine.ts:241-251` |

**Module difficulty ladder** — `DIFFICULTY_LADDER` is the DOK 1–3 proxies `[-1, 0, 1]`;
`moduleDifficulties(3)` spreads evenly across it, so module 0/1/2 target b = −1 / 0 / 1
(`diagnostic-mst.ts:49-66`).

**Routing rule** (`diagnostic-mst.ts:104-129`, `:636-640`):

1. Count number-correct within the block just committed.
2. Cut scores are **derived, not tabled**: `cut_q = ceil(n_stage × P(correct | θ=probit(q), b=served))`
   with the engine's assumed 3PL (a = 1.5, c = 0.25) and `b` = the **mean labelled
   difficulty actually served** in that block.
3. `routeFromScore` = how many cuts the score clears → module index for the next stage.
4. `routingQuantiles = [0.45, 0.75]` — **not** equal-mass (`[1/3, 2/3]`); deliberately
   raised above equal mass (`diagnostic-mst.ts:222`, rationale `:206-212`).

Derived cut scores at 20 items/stage (computed by hand from the formula above, not read
off a test):

| Block just taken | served b | cut → module 1 | cut → module 2 |
|---|---|---|---|
| Stage 1 (ladder cycle) | 0.0 | 12 / 20 | ~16.0003 → 17 / 20 |
| Easy module | −1 | 17 / 20 | 19 / 20 |
| Medium module | 0 | 12 / 20 | ~17 / 20 |
| Hard module | +1 | 8 / 20 | 11 / 20 |

Routing is **ability-referenced**: the cut is computed against the module actually sat,
so a correctly-routed learner is not dragged back to the middle (`diagnostic-mst.ts:110-116`).

Server position is derived entirely from the response log — no route or content is
persisted (`diagnostic-engine.ts:310-379`).

---

## 2. The model

**What is estimated:** one latent ability θ per **axis bucket** (Foundational Concept),
grouped by `DiagnosticResponse.cluster`, which production sets to the item's FC bucket id
(`diagnostic-engine.ts:166-170`). No global composite θ, no per-KC mastery estimate, no
section score. Per-topic mastery is *derived* downstream by uniform distribution of the
bucket read (see §5), not estimated.

| Component | Value | Source |
|---|---|---|
| Ability grid | 41 points, uniform on [−4, 4], step 0.2 | `diagnostic-bayes.ts:77-84` |
| Pass-1 prior | N(0, 1), normalised on grid | `diagnostic-bayes.ts:107` |
| Likelihood | 3PL, `c + (1−c)·logistic(a(θ−b))` | `diagnostic-bayes.ts:122-126` |
| Discrimination `a` | **1.5**, fixed, uncalibrated | `diagnostic-bayes.ts:112` |
| Guessing `c` | **0.25** (4-option MCQ) | `diagnostic-bayes.ts:114` |
| Difficulty `b` | DOK map `{1: −1, 2: 0, 3: 1, 4: 1.8}`; missing DOK → 0 | `diagnostic-bayes.ts:117-119` |
| Update rule | Exact grid multiply-and-normalise per response (no gradient, **no learning rate**) | `diagnostic-bayes.ts:271-285` |
| Pooling | Empirical Bayes, 2 passes | `diagnostic-bayes.ts:318-354` |
| Pooled centre | Precision-weighted mean of pass-1 bucket means | `diagnostic-bayes.ts:330-338` |
| Pooled spread | `max(0.55, sqrt(max(0, meanVar − noiseVar)))` (method of moments) | `diagnostic-bayes.ts:340-346` |
| `MIN_POOLING_SPREAD` | **0.55** | `diagnostic-bayes.ts:300` |

**Derived summaries per bucket** (`diagnostic-bayes.ts:230-268`):

- `pWeak` = P(θ < `WEAK_TAU`), `WEAK_TAU` = **0** (`:174`).
- `severity` (reported as `gap`) = E[`weaknessAt(θ)`], `weaknessAt(θ) = 1/(1+exp(1.702(θ−τ)))`.
- `decisiveness` = `clamp((max(pWeak, 1−pWeak) − 0.5) / (0.9 − 0.5))`, `DECISIVENESS_SATURATION = 0.9` (`:181`).
- `certainty` = `clamp(1 − (severitySd / PRIOR_SEVERITY_SD)²)`, with `PRIOR_SEVERITY_SD`
  computed under the **N(0,1)** prior (`:199-222`).
- Ranking key `leverage = gap × (1 + UNLOCK_STRENGTH × unlockWeight)`, `UNLOCK_STRENGTH = 1`
  (`diagnostic.ts:303-310`). FC unlock weights run **0.20–0.44**, five tied at 0.20
  (`data/fc-axis.generated.ts:24-35`).

---

## 3. Item selection

**In production there is no item-level selection.** Content is a form plan fixed before
the sitting, plus a per-stage slot re-deal.

| Layer | Rule | Source |
|---|---|---|
| Base allocation | Round-robin over populated buckets across all 140 slots, then cut into stages | `diagnostic-mst.ts:345-351` |
| Adaptive allocation | `allocation: 'contention'` — stages 2–7 re-dealt by contention weight | `diagnostic-mst.ts:451-507` |
| Contention weight | `CONTENTION_FLOOR + (1−CONTENTION_FLOOR)·contention`, `CONTENTION_FLOOR = 0.4` | `diagnostic-bayes.ts:457`, `diagnostic-mst.ts:457-459` |
| Contention score | `exp(−z²)`, `z = (leverage − boundary)/max(severitySd·unlock, 0.02)`, boundary = midpoint of **3rd and 4th** ranked leverage | `diagnostic-bayes.ts:458-485` |
| Rounding | Largest remainder, ties by canonical bucket index | `diagnostic-mst.ts:468-477` |
| Balancing bounds | `[floor(even×0.5), ceil(even×2)]` = **[1, 4]** per bucket per 20-item stage | `diagnostic-mst.ts:403-412` |
| Difficulty target | Stage 1: ladder cycled `(i + floor(i/buckets)) % 3`; later stages: `ladder[module]` for every slot | `diagnostic-mst.ts:385-389`, `:630-633` |
| Item pick | Unused item in the bucket with **labelled** difficulty nearest the target | `diagnostic-mst.ts:518-540` |
| Tie-break | **Seeded random** among exact ties in production; **lowest questionId** when no seed | `diagnostic-mst.ts:547-554` |
| Seed source | FNV-1a of the session token → uint32 → `makeRng`, recreated per call so replay is exact | `diagnostic-engine.ts:301-308`, `diagnostic-mst.ts:606` |

**Selection criterion in the unused engine:** expected information gain = reduction in
posterior entropy, multiplied by the contention weight, plus a `1e-6` FNV-1a jitter
(`diagnostic-bayes.ts:356-363`, `:607-622`). Never called by `diagnostic-engine.ts`.

**Exposure control: none.** There is no per-item exposure cap, no rotation ledger, no
overlap constraint. The only spreading mechanism is the seeded tie-break, added because
the lowest-id rule "saturates near ~500 of 1,811 items" (`diagnostic-mst.ts:551-552`).

---

## 4. Stopping

**Production is fixed-length. There is no stopping rule at all.**

- The form ends when all 7 stages are committed; `mstPosition` returns `stage: null`,
  `resolveBlock` sets `completed` and computes the result (`diagnostic-engine.ts:355-379`, `:434-439`).
- Length is known before the first item and shown to the learner
  (`diagnostic-engine.ts:105-108`).

Every stopping constant in the repo belongs to paths production does not use:

| Constant | Value | Where it lives | Reaches production? |
|---|---|---|---|
| `minItems` | 30 | `BAYES_DIAGNOSTIC_CONFIG` `diagnostic-bayes.ts:402` | No — only `selectNextBayes` |
| `maxItems` | 60 | `:403` | No |
| `minItemsPerCluster` | 2 | `:404` | No |
| `minResolution` | 0.5 | `:405` | **Yes** — classification + `stillConfirming` |
| `stabilityWindow` | 8 items | `:406` | No |
| `stopConfidence` | 70 / 100 | `:407` | No |
| `readyMaxPWeak` / `weakMinPWeak` | 0.3 / 0.7 | `:408-409` | **Yes** — classification |
| `DIAGNOSTIC_CONFIG` (30 / 36 / 60, section floors 8/6/8/8) | — | `diagnostic.ts:29-35` | No — dead legacy path |
| `shadowSmartStop` (window 3, minCertainty 0.6) | — | `diagnostic.ts:560-585` | No — shadow only |

The unused adaptive rule, for reference, is a **hybrid**: hard floor 30, hard ceiling 60,
plus early stop requiring *all* of — 2 priorities named, `internalConfidence ≥ 70`, each
reported priority `decisiveness ≥ 0.5`, and the reported set unchanged over the last 8
items (`diagnostic-bayes.ts:516-542`, `:564`, `:589-591`).

---

## 5. Outputs

On completion `record.result = computeBayesResult(responses, BAYES_DIAGNOSTIC_CONFIG, FC_AXIS)`
(`diagnostic-engine.ts:436`), rendered by `buildResultView` (`:183-224`).

| Output | Grain | Content |
|---|---|---|
| `confidenceLabel` | sitting | `High` ≥ 82, `Medium` ≥ 65, else `Still building`, off the hidden 0–100 `internalConfidence` (`diagnostic-bayes.ts:780-782`) |
| `topPriorities` | FC bucket | **`REPORTED_PRIORITY_COUNT` = 2** (`diagnostic.ts:333`); each carries id, title, `tested` line, recommendation |
| `stillConfirming` | FC bucket | Ranked below the cut, `decisiveness < 0.5` **and** `leverage ≥ 0.85 × cut leverage` (`CONTENTION_MARGIN`, `diagnostic-bayes.ts:179`, `:768-778`) |
| `perCluster` | FC bucket, all 10 | classification, recommendation, `gap`, `certainty`, `itemsSeen`. `correct` deliberately withheld (`diagnostic-engine.ts:66-76`) |
| `itemsScored` | sitting | Response count |
| `masterySeed` | **KC** | `{ kcPriors, skillPriors: {}, carsAbility: {} }` |

**Mastery seeding chain** — `kcSeedsFromDiagnostic(result, kcsByFc(orderedKcsForLesson))`
→ `masterySeedFromUnitSeeds` (`diagnostic-engine.ts:220-222`):

1. Buckets with `itemsSeen === 0` produce **no seed** (`mastery-seed.ts:133`).
2. `certainty' = certainty / sqrt(#KCs under the FC)` (`mastery-seed.ts:115-116`).
3. `prior = seedPriorFromRead({gap, certainty'})`: `strength = 1 − gap`; below 0.5 pull
   down toward `SEED_PRIOR_FLOOR = 0.05`, above 0.5 pull up toward `SEED_PRIOR_CAP = 0.40`,
   both scaled by certainty, from `PRIOR_PL0 = 0.2` (`mastery-seed.ts:17-19`, `:37-50`).
4. **Every KC under the concept inherits the same prior** (`mastery-seed.ts:138-140`).
5. A KC reachable from two concepts takes the **minimum** prior (`mastery-seed.ts:248-251`).
6. Client applies once per mount; failures are swallowed (`Diagnostic.tsx:369-387`).

Nothing else is written: no plan, no schedule, no lesson route, no mastery state, no
CARS ability (off-axis), no `skillPriors` for the 7 reasoning operations.

---

## 6. Learner-facing behaviour (`apps/learner-web/src/screens/Diagnostic.tsx`)

| Question | Answer | Source |
|---|---|---|
| Timed? | **No.** No timer, no countdown, no per-item limit. Time is recorded silently as accumulated dwell per question across every visit | `:45-62`, `:94-99` |
| Is that time used? | Sent, clamped to ≤ 30 min server-side, then **never read** by the scorer; `ClusterSignal.slow` is hardcoded `false` | `diagnostic-engine.ts:173`, `diagnostic-bayes.ts:665` |
| Skip an item? | Yes — blanks allowed, but **every question must be opened** before the block can be submitted | `:140-142`, `:303-312` |
| Cost of a blank | Scored as incorrect and counted in number-correct, so it **moves routing downward** | `diagnostic-engine.ts:398-403` |
| Within-block freedom | Previous / Next, jump palette, flag for review, change any answer until submit; drafts in `sessionStorage` per `stageId` | `:217-257`, `:74-90` |
| Block submit | Irreversible, behind a confirm callout ("You cannot come back to this block afterwards") | `:259-296` |
| Skip whole diagnostic | Yes — "Skip for now" (relabelled from "Skip the diagnostic for now" in the 2026-08-01 push) on every question, navigates to `/onboarding/plan`, no server call | `:156-158`, `:321-323` |
| Abandon + resume | Yes. State is event-sourced; refetching re-serves the same open block with the same items in the same order | `diagnostic-engine.ts:284-294` |
| Progress shown | "block N of 7 · question X of 140", bar capped at 98% until done, floored at 6% width | `:164-179`, `diagnostic-engine.ts:450` |
| On completion | "Your starting plan": confidence badge + sentence, ≤2 priorities with `tested` lines, "Still being confirmed" callout, `BucketGapChart` of measured concepts (gap + certainty whisker), prose naming unmeasured concepts, "Continue to your plan" | `:389-444` |
| Score shown? | **Never** — no score, no percentage, no numeric confidence | `diagnostic-engine.ts:79-80`, `diagnostic.ts:214-218` |

---

## 7. Simulation findings

### From `docs/design/diagnostic-overnight-findings-2026-07-28.md`

**Certainty band calibration (§1, fixed in code).** Re-measured on the served form
(`MST_140_RECOMMENDED`, fc-10) over a 24-world grid × 1,000 learners = **240,000 concept
reads**: `certainty` runs **0.375–0.999, median 0.882**. Old cuts (0.719 / 0.89) sorted
the cohort **13.2 / 38.7 / 48.1**. New cuts `MOSTLY_SETTLED_CERTAINTY = 0.7914`,
`SETTLED_CERTAINTY = 0.9527` give **30.0 / 40.0 / 30.0**. Whisker width 20.9% of track at
the lower cut vs 4.7% at the upper = **4.41×** (original three-band argument rested on
2.55×). Deciles stable to **< 0.005** between 60,000 and 240,000 reads; only **72 of
240,000** reads fall below 0.45.

**BKT seed value (§2, no behaviour changed).** 250 learners × the real seeding path =
**24,500 lesson seeds**, each practised against the same response stream under flat 0.20
and under the seeded prior:

| | flat 0.20 | seeded |
|---|---|---|
| median items to decision | 5 | 5 |
| mean | 6.42 | 6.42 |
| decision fires | 96.7% | 96.7% |
| items saved | — | **0.000** |
| false mastery | 3.1% | **3.1%** |

Seven of 24,500 pairs (**0.029%**) changed, each by one item, **all slower**. Mechanism:
one correct answer is worth **1.35–1.38 nats**; any prior above ~0.12–0.13 reaches 0.95 in
three items and above ~0.452–0.465 in two, so `SEED_PRIOR_CAP = 0.40` sits inside a dead
band. `P(L)` steps **0.572 → 0.865 → 0.968**. An oracle prior inside the shipped bounds
finishes **0.07 items behind** flat; released from the bounds it saves **0.95**. The read
itself separates truly-mastered from truly-unmastered at **AUC 0.76–0.92**. A miss is
worth **2.3–3.5×** a correct answer. First threshold that saves anything is **0.86**
(+0.32 items, false mastery 3.1% → 4.0%).

**Not reported anywhere in the doc:** accuracy against true ability, correlation with true
θ, or items-needed-to-reach-a-precision-target — despite `itemsNeededFor` existing for
exactly that question (`diagnostic-retest.ts:1243-1264`).

### Measured performance quoted only in code comments

| Figure | Value | Source |
|---|---|---|
| Contention weighting vs even split, fc-10 @ 140 items, 24 worlds | true #1 **92.6% vs 89.1%**; reported reproducibility **95.5% vs 91.9%** | `diagnostic-bayes.ts:445-448` |
| Oracle allocator handed TRUE leverage vs even split | **68.1% vs 68.2%** — allocation is worthless to a perfect estimator | `diagnostic-bayes.ts:440-443` |
| Item-level adaptive vs MST, fc-10 @ 140, 24 worlds × 250 learners | worst-world reported reproducibility **88.0% vs 82.0%**; worst-world true #1 **86.8% vs 80.0%** | `diagnostic-bayes.ts:551-555` |
| MST design ladder (worst-world reproducibility / true #1) | 50+3×30: 79.9 / 82.3 · 7×20: 80.2 / 82.3 · +raised cuts: 81.9 / 84.3 · +contention: 83.3 / 86.4 · both: **84.7 / 87.5** · adaptive: 86.9 / 87.3 | `diagnostic-mst.ts:193-198` |
| Unlock strength k = 1 vs 0 | true #1 **91.5% / 86.8%** vs **82.2% / 68.0%**; cross-learner genericity 56.0% vs 39.8% | `diagnostic.ts:275-280` |
| Top-2 vs top-3 report | top-2 1-of-2: **88.0% worst-world, 94.6% pooled**; identical-set only **47.8%**; ~68% of top-3 disagreements are between concepts differing by < 0.10 in true weakness | `diagnostic.ts:320-329` |
| Plan-confidence boundary move | labels 31.9/64.3/3.8 → **36.7/60.3/3.0**; early stop fired 64.0% → **57.9%** | `diagnostic-bayes.ts:684-688` |
| Routing quantile sensitivity | [0.2,0.4] → [0.6,0.8] swings top-module occupancy **65% → 2%** | `diagnostic-mst.ts:99-102` |

---

## 8. Unintentional, contradictory, or arbitrary

**Two engines; the documented one is not the one that runs.**

1. `DIAGNOSTIC_MANIFEST.summary` (`diagnostic.ts:13-19`) states the active path is the
   "Stage-1 Bayesian item-response engine … expected-information-gain selection, adaptive
   early-stop", with "the balanced-coverage router … as a fallback". Production runs
   **neither**: it runs fixed-length MST and uses the Bayes module only as a scorer. The
   manifest is the policy layer's own self-description and it is wrong.
2. `selectNextBayes` — EIG, contention weighting, breadth floor, the three-part early stop,
   the `1e-6` FNV-1a jitter — is **never called** by `diagnostic-engine.ts`. Roughly the
   entire selection half of `diagnostic-bayes.ts` is unreachable in delivery.
3. `BAYES_DIAGNOSTIC_CONFIG` is documented as "floor 30 … ceiling 60. Length varies between
   the two" (`diagnostic-bayes.ts:399-410`) and is the config used to score a **140-item**
   test. Five of its eight fields are dead on the shipped path.
4. `deriveState` (`diagnostic-engine.ts:135-149`) builds `familiesByCluster`, `itemsBySection`
   and `seed` for the balanced-coverage selector that nothing calls. `itemsBySection` is
   keyed on the four MCAT sections while the reporting axis is FC-10.
5. The whole legacy path — `selectNextDiagnostic`, `shouldStop`, `computeDiagnosticResult`,
   `internalPlanConfidence`, `shadowSmartStop`, `DIAGNOSTIC_CONFIG`, `SLOW_MS`,
   `dokMissWeight` — is dead and the file says so (`diagnostic.ts:511-519`). It carries a
   **different** certainty formula (`itemsSeen/(itemsSeen+2)`, `:424`) and **different**
   classification thresholds (`gap ≥ 0.5` weak, `≤ 0.35` ready, `:361-362`) from the live
   path (`pWeak ≥ 0.7` / `≤ 0.3`). Two definitions of "weak" in one package.

**Constants that disagree between files.**

6. DOK → difficulty is defined **three times**: `{1:−1, 2:0, 3:1, 4:1.8}` in
   `diagnostic-bayes.ts:117` and again, byte-identical, in `diagnostic-mst.ts:49`; and
   `(−1.0, −0.3, 0.4, 1.0)` in `irt.ts`. The findings doc flags the third as an open
   decision (§4, §6.3); the first two are an uncoordinated copy that will silently drift.
7. `a = 1.5` and `c = 0.25` are likewise duplicated (`diagnostic-bayes.ts:112-114`,
   `diagnostic-mst.ts:71-72`, and again as a default argument in `diagnostic-retest.ts:586`).
8. `DEFAULT_RUNWAY_MODEL.reported = 3` (`diagnostic-value.ts:49`) while
   `REPORTED_PRIORITY_COUNT = 2` (`diagnostic.ts:333`). The net-value model — the thing
   that decides whether the diagnostic is worth its own duration — scores a three-priority
   report the product does not emit.
9. `trueLeverageOf` (`diagnostic-retest.ts:193`) and `rankProbabilities`
   (`:794`) hardcode `(1 + unlockWeight)` instead of calling `leverageOf` with
   `UNLOCK_STRENGTH`. Correct only because the strength happens to be 1 today.
10. The θ grid is **±4 with 41 points** in production (`diagnostic-bayes.ts:77-79`) and
    **±6 with step 0.1** in the oracle, whose comment states that ±4 "piles the deepest
    buckets onto the boundary … and costs the oracle several points of accuracy on the
    true #1" (`diagnostic-retest.ts:538-547`). The known-bad grid is the shipped one.
11. `normalCdf` is implemented twice — `diagnostic-bayes.ts:90-99` and the copy imported
    from `diagnostic-simulation` by mst/retest/ranking.
12. The confidence-label cuts **82 / 65** appear in `diagnostic-bayes.ts:782` and again in
    `diagnostic.ts:485`.

**Stale measurements still asserted in code.**

13. `diagnostic-bayes.ts:218-219` still states certainty "runs 0.45 to 0.99 with a median
    of 0.80 … `diagnostic-certainty.test.ts` pins that shape". The findings doc says that
    distribution came from the wrong population and the real one is **0.375–0.999, median
    0.882** (§1). The comment and the doc contradict each other.
14. The findings doc's §2 measurement runs on `lessonSeedsFromDiagnostic` and reports
    "98 [lesson] priors in a real session". Production now seeds at **KC** grain
    (`diagnostic-engine.ts:220`), and `MasterySeed` **rejects** `lessonPriors` by name
    (`mastery-seed.ts:232-238`). The headline "the seed write is a no-op" result was
    measured on a code path that no longer exists — and KC grain divides certainty by
    `sqrt(#KCs)` rather than `sqrt(#lessons)`, i.e. **more** dilution, so the finding was
    not re-measured in the direction that would make it worse.

**Magic numbers with no derivation.**

15. `MIN_POOLING_SPREAD = 0.55` (`diagnostic-bayes.ts:300`). No source given. Because the
    method-of-moments estimate is `sqrt(max(0, meanVar − noiseVar))` and per-bucket
    posterior sd at ~14 items is comparable to the between-bucket scatter, this floor will
    bind in a large share of sittings — meaning the "hierarchical" prior is frequently just
    `N(centre, 0.55)` regardless of the data. (Inference from the formula; not measured.)
16. `CONTENTION_FLOOR = 0.4`, `CONTENTION_SLOT_FLOOR = 0.5`, `CONTENTION_SLOT_CAP = 2`,
    `CONTENTION_MARGIN = 0.85`, `DECISIVENESS_SATURATION = 0.9`, `WEAK_TAU = 0`, the `0.02`
    sd floor in `contentionByCluster`, the `1e-6` jitter scale, the 41-point grid size —
    all bare constants with prose justification at best.
17. `routingQuantiles = [0.45, 0.75]` are round numbers chosen to sit "above equal mass".
    The comment justifies the *direction* with measurement but never the *values*, and
    also records that routing is extremely sensitive to them (65% → 2% occupancy swing).
18. `RunwayModel.secondsPerItem = 95` is admitted to be reverse-engineered from a published
    table rather than fitted, on a bank with no response-time data
    (`diagnostic-value.ts:32-41`). `contentHours = 114` is one hour per lesson by assertion.
19. Analysis seeds `24601`, `5150`, `90210` (`diagnostic-ranking.ts:179`,
    `diagnostic-retest.ts:1370`, `:953`). Harmless, but three different arbitrary constants
    where one shared default would do.

**Internal inconsistencies in the live path.**

20. `certainty` measures variance reduction against `PRIOR_SEVERITY_SD`, computed under
    **N(0,1)** (`diagnostic-bayes.ts:199-222`), while the posteriors it is computed from
    were fitted against the **pooled** prior `N(centre, spread)`. The pooled prior is
    normally tighter than N(0,1), so certainty is measured against a baseline the engine
    did not use, and is biased upward. This is the same number the mastery seed and the
    results-chart whisker both key off.
21. The empirical-Bayes pass uses each bucket's own responses **twice** — once to set the
    pooled centre, once to fit the bucket against it (`diagnostic-bayes.ts:318-354`). The
    oracle in the same repo explicitly divides its own `Z_b(μ)` back out and documents that
    not doing so "undoes most of the pooling" (`diagnostic-retest.ts:697-703`). Production
    does not do the correction.
22. Item selection aims at the **3rd-vs-4th** leverage boundary
    (`diagnostic-bayes.ts:477-479`) while plan confidence aims at the **reported cut**, i.e.
    2nd-vs-3rd (`:706-716`), and the report names 2. Both choices are separately justified
    by measurement; together they mean the instrument spends its items resolving a boundary
    it does not report and grades itself on one it does not target.
23. Three different summaries of one posterior drive three different outputs: `severity`
    ranks, `pWeak` classifies, `decisiveness` gates. A bucket can be `unresolved` by
    decisiveness while still being named a top priority by severity.

**Assembly and delivery.**

24. `simulateMstSitting` calls `assembleMstStages` **without a seed**
    (`diagnostic-mst.ts:714`), so simulation draws deterministic lowest-id forms while
    production passes a per-session seed (`diagnostic-engine.ts:345-352`). The file's own
    stated goal is "what lets a simulated form and a delivered form be the same form"
    (`:581-583`). They are not the same form.
25. `MST_DESIGNS[0]` is labelled `'MST 60 (3 x 20, easy/hard)'` but its `itemsPerStage` is
    `[24, 18, 18]` (`diagnostic-mst.ts:179`). The label is wrong; only the total is right.
26. `minItemsPerBucket` across `MST_DESIGNS` is derived from `total / 15`
    (`diagnostic-mst.ts:171-174`) — a 15-bucket axis — while the shipped axis has 10 buckets
    and `MST_140_RECOMMENDED` derives its 8 from the 10-bucket contention guarantee. Two
    derivations of the same field in one file.
27. Stage-1 cut score for the second module computes to **≈16.0003 of 20** under the
    engine's own constants, so `ceil` yields 17 rather than 16 on a margin of 3 parts in
    10⁵ — decided by floating-point noise in a bisection-based `probit` over an
    Abramowitz–Stegun `normalCdf`. A one-item routing difference resting on the fourth
    decimal place. (Hand-computed from `cutScoresFor`; worth pinning with a test.)
28. `probit` runs **48 bisection iterations** (`diagnostic-mst.ts:79-88`), a resolution of
    ~4×10⁻¹⁴ on an input approximation accurate to ~10⁻⁷. ~24 iterations are wasted.
29. `pickModuleItems`'s `Math.min(tied.length - 1, floor(rng() * tied.length))`
    (`diagnostic-mst.ts:554`) — the guard is unreachable for any `rng()` in [0,1).
30. `productionDesign()` resolves `MCAT_MST_DESIGN` by `label.startsWith('MST ' + wanted)`
    (`diagnostic-engine.ts:248`), so `MCAT_MST_DESIGN=1` matches `MST 140`, `=2` matches
    `MST 200`, and any unmatched value silently falls back to the recommended design with
    no warning. An env-var typo produces a form nobody asked for, quietly.
31. `bankSupportsProductionForm` catches **every** error and returns false
    (`diagnostic-engine.ts:265-272`), so a genuine planner bug is indistinguishable from a
    missing bank.
32. `resolveBlock` caps in-progress progress at **0.98** (`diagnostic-engine.ts:450`) with
    no explanation; the bar also floors at 6% width (`Diagnostic.tsx:178`).
33. `Diagnostic.tsx:136` writes `next.data.totalItems ?? 0` against a non-optional field.

**Collected but unused.**

34. Per-question elapsed time is accumulated across visits, clamped to 30 minutes, and sent
    to the server — and no live code reads it. `ClusterSignal.slow` is hardcoded `false`
    (`diagnostic-bayes.ts:665`), and `SLOW_MS = 90_000` (`diagnostic.ts:352`) is used only
    by the dead legacy scorer.
35. `severitySdByBucket` is exported with the comment "Nothing at runtime reads it"
    (`diagnostic-bayes.ts:794-810`).
36. Every module in `diagnostic-value.ts`, `diagnostic-ranking.ts` and `diagnostic-retest.ts`
    is offline analysis — none of it runs at runtime, by their own headers.
37. `MISCONCEPTION_INSTRUCTION` is a declared recommendation the live `recommend` can never
    emit (`diagnostic-bayes.ts:636-651`); only the dead legacy path produces it
    (`diagnostic.ts:380`).

---

## 9. Recheck against `4a1c84e` — 2026-08-01

### What changed in the diagnostic: nothing

`git diff e44dc75..HEAD -- packages/policies/src/` touches twenty files and **not one of
them is a diagnostic module.** `diagnostic-mst.ts`, `diagnostic-bayes.ts`, `diagnostic.ts`,
`diagnostic-value.ts`, `diagnostic-axis-fc.ts`, `diagnostic-retest.ts`,
`diagnostic-ranking.ts`, `diagnostic-simulation.ts`, `mastery-seed.ts` and `irt.ts` are all
byte-identical. `apps/learner-web/server/diagnostic-engine.ts` is untouched.
`Diagnostic.tsx` changed by one line: the skip button's label went from "Skip the
diagnostic for now" to "Skip for now", which amends the copy quoted in §6 and nothing else.

So every row of §1, §2, §3, §4, §5 and §7, and all 37 items of §8, stand as written.
Specifically re-confirmed because they anchor arguments elsewhere: **140 items in seven
20-item blocks with three-way contention routing** (`MST_140_RECOMMENDED`), **`a = 1.5`,
`c = 0.25`, `b` from the DOK map `{1: −1, 2: 0, 3: 1, 4: 1.8}`**, and
**`secondsPerItem = 95`**, which is where the 3.7-hour figure comes from.

### Four things that look like changes and are not

1. **`packages/policies/src/calibration.ts` is not item calibration.** The name collides
   with §8's open calibration questions and with the BrainLift's Out of Scope section. It
   bands one scored practice attempt `confidently_wrong`, `shaky_win` or `normal` from
   response time and pre-commit answer changes, feeds the Mistakes ranking, and writes no
   mastery. It reads no item parameter and produces none. The bank is uncalibrated at HEAD
   exactly as §2 describes.
2. **The practice test is a second assembler, not a change to this one.**
   `practice-test-assembler.ts` explicitly reuses the diagnostic assembler's scaffolding
   idea (bucket the bank, deal to a blueprint, no repeats within a sitting) and drops
   everything adaptive: no routing, no ladder, no cut scores, scored by key match. Two
   deliberate differences from the diagnostic. It **includes CARS**, which is off the
   diagnostic's FC-10 axis entirely, floored at 26 of 115 items with all three AAMC
   sub-skills. And it **validates the assembled form against every floor before serving**
   and rebuilds on a fresh tie-break seed, where the multistage planner only throws at plan
   time. Three length tiers at 30 / 59 / 115 items; the 115 is `HALF_LENGTH_BLUEPRINT`,
   half of a 230-item MCAT. It is gated behind three completed lessons, so it never
   competes with the diagnostic for the day-one slot.
3. **Per-attempt timing is now stored, and still not for the diagnostic.** Migration 0014
   widens `attempt_results` with nullable `elapsed_ms` and `answer_changes`, and names
   "the diagnostic/PotD paths that are out of WS0 scope" as surfaces that will write NULL.
   §8 item 34 therefore stands unchanged: the diagnostic still accumulates per-question
   dwell, still clamps it to 30 minutes, still sends it, and no live code reads it.
   `ClusterSignal.slow` is still hardcoded `false`.
4. **Migration 0019 added a passage store, and it is not exam passages.** It backs Passage
   of the Day from a pool of 12 CARS passages and 63 questions
   (`content/passage-of-the-day/pool.ts`, `apps/learner-web/server/passage-pool-source.ts`).
   The question bank still has 2,108 distinct family IDs and a median passage length of 158
   characters, so the "no passage sets" finding is intact, with one recount worth stating
   precisely. **28 passage texts are shared by more than one item, covering 101 items**, the
   largest group holding 8; `family_id` marks none of them, which is why a family-ID count
   reads as zero sets. At a median 158 characters these are stem contexts rather than
   stimuli, and 101 items build no form. Related trap: the practice-test
   bank classes **every** pulled row as `passage_mcq`, because `formatOf` treats any
   non-empty passage string as the signal (`apps/learner-web/server/practice-test-bank.ts`).
   That is one 158-character stimulus per item, not a shared passage, and reading the
   blueprint's 40-item `passage_mcq` floor without reading `formatOf` gives the opposite
   impression.

### One provenance change that affects every `[measured]` bank figure

The bank is in Postgres (`questions`, `question_protected`) and no item content is
committed; the five JSON files under `content/question-bank` are schema and tooling. Every
count quoted in this document and in the BrainLift comes from a gitignored pull at
`content/question-bank/.local/db-pull/` dated **2026-07-24**, which this push did not
touch. One exception is checkable from a clone: `packages/policies/src/data/bank-profiles.generated.ts`
is committed and carries the per-bucket DOK census the diagnostic actually plans against,
**FC10 at [4, 32, 4]** against FC4's [72, 295, 47], summing to 1,811 FC-scope items. It was
generated at `74b74c2` and this push did not touch it, so it agrees with the pull because both
predate the same content freeze rather than because either is live.
Re-derived 2026-08-01 from the pull and matching the old figures exactly: 2,108 rows, 2,108
distinct `family_id`, 160 CARS items, median passage 158 characters, 45 duplicate-stem groups
by the pull's own `analysis.json`, and the correct answer longest on **1,068 of 2,108 (50.7%)**.
The one figure the pull cannot supply is `error_models` fill: the 2026-07-24 protected rows have
no such column, which is where "0 of 2,108" came from. `tools/questions-cli` and
`tools/passage-cli` upsert by `question_id`, so a content delivery grows the bank rather
than replacing it: treat every figure as a floor and re-pull to refresh one.
