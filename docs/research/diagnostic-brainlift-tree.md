# Diagnostic Design — BrainLift Knowledge Tree

> **Pruned 2026-07-31: 68 entries to 15.** Entries were selected for how much they support the
> five SPOVs in `diagnostic-brainlift-spovs.md`; every entry supporting none of them was cut, and
> the survivors were chosen for being cited by several SPOVs, for carrying a specific measured
> figure, and for supporting a SPOV's central mechanism rather than a concession. **IDs are
> unchanged**, so every citation in the SPOVs file still resolves. The complete 68-entry tree is
> archived at `docs/research/archive/diagnostic-brainlift-tree-full.md`; citations in the SPOVs file
> written as `archived tree N.NN` point there, and cross-references *inside* the surviving entries
> below (`entry 1.1`, `entries 2.16, 2.4 and 1.15`) resolve against the archive rather than against
> this file. The trailing bookkeeping section on sources without their own entries was dropped with
> them.

Every entry below is reorganised from exactly three source documents and from nothing else:

- `docs/research/diagnostic-source-knowledge-tree.md` (the v1 per-paper DOK tree)
- `docs/research/diagnostic-reading-list.md` (the v2 reading list)
- `docs/design/diagnostic-clean-slate-proposal.md` (the design specification)

No source was re-read, no figure was recomputed, and no number appears here that does not appear
in one of those three files. Where a source carries no number in the originals, the entry says so
explicitly rather than supplying one.

**Provenance markers are reproduced exactly as the source documents give them.** The vocabulary
actually in use across the three files is:

| Marker | Meaning as the sources define it |
| --- | --- |
| `[read]` | Full text retrieved; cited numbers checked directly against it |
| `[agent-read]` | A research agent retrieved the full text and tagged each number with its source |
| `VERIFIED — full text read` | v1 tree's equivalent of `[read]` |
| `UNVERIFIED — <reason>` | v1 tree; claims come from secondary summaries, not to be cited as fact |
| `[measured]` | Computed from this repository's own bank or registry; command reproducible |
| `[simulated]` | Result of this project's own modelling / measurement campaign |
| `[unverified]` | Reasoning or recalled literature not checked in this project |

The reading list's provenance note also defines `[abstract]` and `[paywalled]`, and the brief for
this document anticipated `[abstract]` and `[secondary]`. **No entry in any of the three source
documents actually carries `[abstract]`, `[secondary]`, or `[paywalled]` as its marker**, so those
markers appear nowhere below. The v1 tree's `UNVERIFIED` entries are the ones resting on secondary
summaries, and each states its own reason for non-retrieval verbatim.

**A caveat inherited from the design document and applying to every `[simulated]` entry here.**
Every quantitative result from this project's own campaign is simulation under a generative learner
model that has never been fitted to a real response, on an uncalibrated item bank. Simulation can
establish orderings of designs and identify designs that fail outright; it cannot forecast a rate.
Each `[simulated]` figure is quoted with the conditions that produced it — reporting axis, item
budget, delivery arm, number of assumption worlds, learners per cell — because several figures in
this tree differ *only* by those conditions and a number quoted without them is a different claim.

---

## Index

| Category | Entries |
| --- | --- |
| 1. Test logic | 2 |
| 2. What a diagnostic can actually deliver | 11 |
| 3. Effect on the learner | 2 |

---

# 1. Test logic

Adaptive versus fixed administration; item-level CAT versus multistage testing; how far adaptivity
should reach; test length; stopping criteria and the metrics behind them.

---

### 1.2 Zheng, Nozawa, Gao & Chang (2012). Multistage Adaptive Testing for a Large-Scale Classification Test. ACT Research Report 2012-6. `[agent-read]`

*Supports SPOV 2.*

<https://files.eric.ed.gov/fulltext/ED542026.pdf>

**DOK 1**

- **21-item MST beat a 30-item linear form on correct classification (.745 vs .703) while having
  worse RMSE (.374–.419 vs .364).**
- Against a 21-item CAT, MST lost badly on point estimation (RMSE **.383 vs .254**) but was
  competitive on classification (**.788 vs .781**).
- Item bank usage: CAT drew on **530 of 600 items**; the best MST used **131–224** with more uniform
  exposure.
- Adding a fourth stage produced no consistent gain, and **simple true-score routing performed as
  well as θ routing**.

**DOK 2**

This is the cleanest statement of the trade a diagnostic wants: adaptivity won the *decision* and
lost the *measurement*, which is the right direction when the output is a placement rather than a
score. The true-score-routing result is the load-bearing one for an uncalibrated bank, since it
means the routing machinery does not depend on item parameters we do not have. The exposure figures
also say MST is far gentler on a thin pool than item-level CAT, which matters when one concept's
bank is the binding constraint.

---

### 1.20 Internal — delivery arm: multistage versus item-level adaptive, and the attribution ladder. `[simulated]`

*Supports SPOV 2.*

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part II. No external citation.*

**DOK 1**

- Multistage delivery trails item-level adaptive selection by about six points of worst-world
  reported reproducibility — **88.0% against 82.0% on `fc-10` at 140 items over 24 worlds × 250
  learners**, same learners, same seeds, same scoring; the only difference is which items are served.
- **Doubling the routing decisions from three to six is worth 0.3 points.** The entire family from 2
  stages to 20, at fixed total length, sits inside a single point of itself.
- **About 80% of the MST deficit is allocation adaptivity** — which concepts the items are spent on
  — and routing does not buy that at any stage count. The remainder is where the routing cuts sit
  relative to the engine's prior.
- Adopted design `MST_140_RECOMMENDED`: seven 20-item blocks, three difficulty modules per stage
  after the first, routing cuts at ability quantiles **[0.45, 0.75]**, contention-allocated slots in
  the six stages after the router.
- Measured on `fc-10` over the three worlds every arm fails in, at **1,500 learners per cell**
  (worst-world reported reproducibility, then true worst concept in top three):

  | Design | re-sit 1-of-2, worst | true #1 in top 3, worst |
  | --- | --- | --- |
  | 50 + 3 × 30, three routes, equal-mass cuts | 79.9% | 82.3% |
  | 7 × 20, six routes, equal-mass cuts | 80.2% | 82.3% |
  | 7 × 20 + raised cuts | 81.9% | 84.3% |
  | 7 × 20 + contention slots | 83.3% | 86.4% |
  | **7 × 20 + both (adopted)** | **84.7%** | **87.5%** |
  | item-level adaptive | 86.9% | 87.3% |

- Of the **7.0-point** gap between the superseded form and item-level adaptive, the adopted design
  recovers **4.8**. On true worst concept it measures **87.5% against 87.3%** — read as a tie.
- Two operational properties MST gets **structurally** that item-level CAT can obtain only by buying
  them back: within-block answer revision, and content balance guaranteed on **every route** through
  the panel rather than on average. Item-level adaptive tests can permit review under a restricted
  scheme — GMAT Focus caps edits at three per section, Smarter Balanced allows it within a segment —
  but the restriction is the price, whereas in MST the block boundary already is the restriction.
- Contention allocation costs a real property: a contention-allocated form is a function of the
  responses, not just of which modules were taken, so a sitting cannot be rebuilt from its route
  alone; the per-concept **guarantee drops to 8 items rather than 14**.

**DOK 2**

The intuitive explanation for MST's deficit — that it makes fewer decisions — is measurably wrong,
and the attribution ladder is unambiguous: stage count is worth 0.3 points while allocation is worth
most of the six-point gap. What the extra stages are actually for is that they are the only places
the two levers that do matter can act, since a cut can only be re-aimed at a stage boundary and slots
can only be reallocated at one. The two points of simulated reproducibility that MST still concedes
buy answer review and a hard content guarantee, which the document states as a judgement rather than
a measurement.

---

# 2. What a diagnostic can actually deliver

A rough "what to work on first" signal, versus a full ordering of topics, versus high-confidence
per-topic strength estimates — plus measurement precision, subscore validity, and how many items a
reportable estimate needs.

---

### 2.3 Kruyen (2012) — cited in the reading list and design specification on the floor for individual-level decisions.

*Supports SPOV 1, 4.*

*Cited in the reading list's items-per-dimension table alongside Emons under `[agent-read]`, and in
the design specification. No standalone citation, no URL, and no other figure appears in the three
source documents.*

**DOK 1**

- **Floor for individual-level decisions: 40 items.**
- Grouped with Emons 2007 in the reading list's "consistency" row at **20–40 items per dimension**.
- No sample size, effect size, or confidence interval is attributed to this source anywhere in the
  three documents.

**DOK 2**

This is the most demanding of the item-budget floors and the one a per-dimension score would have to
clear, which at ten dimensions implies 400 items — decisively outside any feasible sitting. Its
practical function in the argument is as a bound that rules out per-dimension reporting rather than
as a target to build toward. Its provenance in these documents is thin: it appears only as a number
in a table, so it should be checked before external use.

---

### 2.6 Wang, Song, Wang, Gao & Xiong (2020). A Note on the Relationship of the Shannon Entropy Procedure and the Jensen–Shannon Divergence in CD-CAT. *SAGE Open* 10(1). `[agent-read]`

*Supports SPOV 1.*

<https://journals.sagepub.com/doi/10.1177/2158244019899046>

**DOK 1**

- Proves **JSD = H(posterior) − SHE**, so the two criteria select identical items.
- At **5 items**: attribute-level accuracy **.838–.897** versus pattern-level **.530**. At **10
  items**: **.913–.953** versus **.747**.
- Doubling the test bought **22 points of pattern accuracy but only about 6 of attribute accuracy**.

**DOK 2**

This is the cleanest available statement of the difference between the two things a diagnostic could
claim: per-dimension reads are forgiving and full-pattern claims are brutal, and the gap is roughly
thirty points at five items. It is also why a rank ordering across dimensions is closer to a pattern
claim than to a set of independent reads — ordering requires every adjacent comparison to be right.
The design document uses these numbers as the numeric reason a per-KC mastery map and a full ranking
are forbidden outputs while per-concept bands are permitted.

---

### 2.12 CAPR / MDRC — College Course Placement Based on Multiple Measures: A Synthesis of Two Experiments. `VERIFIED — full text read`

*Supports SPOV 1, 5.*

<https://files.eric.ed.gov/fulltext/ED664878.pdf>

**DOK 1**

- Synthesis of two randomised experiments (SUNY and Great Lakes) comparing **test-only** placement
  against **multiple-measures assessment (MMA)**, which adds high school GPA.
- For **81% of the math sample and 68% of the English sample the two systems agreed** on placement.
- The analysis sample is therefore restricted to the **"bump-up" zone**: low test scores, relatively
  high GPA.
- Bump-up impacts (combined): **+8 percentage points** likelihood of passing a college-level course
  in the tested subject; **+2.0 credits** earned on average.
- Credential-or-transfer: **+1.5pp** combined (not statistically significant); **+2.4pp** in the
  English sample after nine semesters; no significant effect in math.
- After nine semesters: **+7pp** college-level English completion, **+8pp** math. After three
  semesters: **+16pp** English, **+11pp** math.
- The **"bump-down" zone** showed **negative** outcomes; it occurred only in the SUNY study, the later
  Great Lakes design **prohibited** it, and CAPR no longer treats it as policy-relevant.
- Faculty set MMA thresholds high enough to avoid dramatically increasing college-level placement.

**DOK 2**

For most learners the placement algorithm does not matter — 81% and 68% agreement bounds the entire
argument about diagnostic sophistication to a minority in the disagreement zone, which should
discipline how much is invested in squeezing accuracy out of the instrument. The benefit is
asymmetric and one-directional: placing borderline learners higher helps and placing them lower hurts
badly enough that the research programme stopped permitting it, so the rule is "when uncertain, place
up." Short-run effects exceeding long-run ones (+16/+11 at three semesters against +7/+8 at nine) also
argues that placement is an input to momentum rather than a decisive intervention — and the instrument
that helped was accumulated performance history, not a better test.

---

### 2.13 Scott-Clayton (2012). Do High-Stakes Placement Exams Predict College Success? CCRC WP-41. `[agent-read]`

*Supports SPOV 1, 5.*

<https://files.eric.ed.gov/fulltext/ED529866.pdf>

**DOK 1**

- Adding placement-test scores to a model already containing high school GPA raised explained variance
  by **~6 points in math and under 2 in English**.
- **High school background alone beat the test alone in both subjects.**

**DOK 2**

This is the cleanest available statement of how little a short test adds once you have history, and
in an MCAT prep product the in-product evidence eventually becomes that history. The design's
ninety-second intake — coursework, self-reported grades, prior scores — is the analogue of the GPA
term, and this result says it is the highest-yield measurement per unit of learner effort in the
system. The corollary is uncomfortable but clarifying: the diagnostic's job is to be useful in week
one, before the history exists, not to compete with it thereafter.

---

### 2.16 Testlet / local item dependence — Wainer & Kiely; Yen's Q3; Bradlow, Wainer & Wang. `[unverified — well-established in the psychometric literature but not retrieved in this project's sweep]`

*Supports SPOV 3.*

*Cited in `docs/design/diagnostic-clean-slate-proposal.md`, Part IV, Claim 2.*

**DOK 1**

- Items on the same passage share variance from passage comprehension, topic familiarity, and reading
  speed, so they are not independent observations.
- Consequence: **effective test length is materially shorter than nominal test length**, and
  reliability estimated under a local-independence assumption is **overstated**. A 230-item
  passage-based test carries meaningfully fewer than 230 independent observations.
- Context figures from the design document: the real exam is roughly **three-quarters passage-based**
  with **4–7 items on a shared passage of several hundred words**; a full-length is **230 items**,
  **6h15m** of testing, roughly **7.5 hours** with breaks; 230 items across 10 foundational concepts
  is **23 per concept**.
- **No effect sizes or Q3 magnitudes are attributed to these sources in the design document.**

**DOK 2**

This is the structural reason a long passage-based test cannot deliver a fine-grained profile no
matter how many items it contains: the items are correlated by design, so the nominal count overstates
the evidence. The second half of the claim has no workaround at all — when the unit of assembly is a
passage that generates six items, the passage decides what those items are about, so per-concept item
guarantees and within-concept difficulty balance are unavailable. Item-level assembly is a structural
advantage of the format rather than of any vendor, since every item is independently placeable into a
concept × difficulty cell.

---

### 2.18 Internal — a ranked profile is not achievable at any feasible length. `[simulated]`

*Supports SPOV 1, 4.*

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part II. Figures from the earlier
standalone model, retained because the campaign did not disturb them.*

**DOK 1**

- Two independent sittings, 10 concepts, learners with correlated abilities:

  | | 14 items/concept | 20 | 30 | 80 |
  | --- | --- | --- | --- | --- |
  | Identical full 10-way ranking | **0%** | 0% | 0% | 0% |
  | Identical 3-tier grouping | 2.0% | 3.4% | 5.6% | 16.3% |
  | Identical weakest-3 set | 13.2% | 18.0% | 24.4% | 41.6% |
  | Spearman between sittings | 0.59 | 0.66 | 0.73 | 0.86 |

- An **800-item test still cannot reproduce its own tier grouping more than a sixth of the time**.
- The production harness reaches the same place independently: at **140 items on `fc-10` the two
  sittings name the identical top three about a third of the time, and the rate tops out near 52%
  even at 480 items**.

**DOK 2**

Ordering ten dimensions requires every adjacent pair to be correct, and adjacent concepts are usually
close enough in truth that those comparisons are near coin flips — so the failure is structural rather
than a tuning or algorithm problem. The 80-items-per-concept column is the decisive one: an 800-item
instrument does no better in kind, which means no feasible length fixes it. This is the single finding
that converts "what should the report say" from a product-copy question into a measurement fact.

---

### 2.19 Internal — the report names two priorities, not three. `[simulated]`

*Supports SPOV 1, 4, 5.*

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part II.*

**DOK 1**

- Scored on the criterion the report is actually made on — does at least one named priority recur when
  the same learner sits the instrument again — a **top-three report measured 76.4% in the worst world
  against a top-two report's 89.6% at 200 items on `fc-10`**.
- At the delivered **140 items**, the top-two figure is **94.6% pooled and 88.0% in the worst world**,
  adaptive arm, **24 worlds × 250 learners**.
- The third concept is not badly measured: it gets a full production block, **14 items**. The third
  slot fails because **roughly two thirds of the disagreements at that boundary are between concepts
  whose true weakness differs by under 0.10 on a 0–1 scale**.
- A concept demoted by the reported count is deliberately kept *out* of the `stillConfirming` list and
  is carried instead by the seeded mastery prior, which reads all ten concepts.
- `REPORTED_PRIORITY_COUNT` lives in the policy layer, and the early stop, the plan-confidence
  separation term and the `stillConfirming` rule all read it.

**DOK 2**

Narrowing the report from three priorities to two costs one line of code and moved worst-world
reproducibility from below the bar to 88.0%, which is the reporting-grain lever from Cheng & Morgan
reproduced on our own instrument. The reason it works is not that the third read is poor but that the
third boundary separates genuine near-ties, so two sittings that disagree there are not disagreeing
about the learner. The read is unchanged — all ten concepts still get a gap and a confidence — so what
narrowed is the claim, not the measurement.

---

### 2.25 Internal — the bank audit: what the materials can actually support. `[measured]`

*Supports SPOV 1, 2, 3.*

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part I, from
`content/question-bank/.local/db-pull/questions.json` (2,108 items, status `production_candidate`) and
`curriculum/v3/v3-lesson-authoring-manifest.json`.*

**DOK 1**

- **2,108 items, 2,108 single-KC assignments, 422 distinct KCs, zero items with no KC.** Median **5**
  questions per KC; **22 KCs have fewer than 3**.
- Skill and cognitive complexity are almost perfectly confounded: **SIRS1 n = 379, 100% DOK1**;
  **SIRS2 n = 1,248, 1% / 95% / 4%**; **SIRS3 n = 235, 4% / 8% / 88%**; **SIRS4 n = 86, 9% / 57% /
  34%**.
- **114 lessons**, median **18** questions each, each in exactly one cluster, carrying **2–5** KCs;
  KC → lesson → cluster is perfectly nested with zero violations.
- Counted the way production counts (first-listed FC only), **1,811 questions over the ten concepts —
  187 fewer** than the previous draft's double-counted figure. FC1 280, FC2 111, FC3 203, FC4 414,
  FC5 279, FC6 120, FC7 155, FC8 103, FC9 106, **FC10 40**; **16 lessons with no FC hold 297
  questions** and are unreachable by this instrument. **89 lessons carry exactly one FC, 8 carry two,
  1 carries three.**
- FC10's **40 items** are **2.2% of the addressable bank** for a concept carrying roughly a tenth of
  the reporting axis; a 140-item sitting sees at most **24** of them.
- **99 of 114 lessons contain three or more distinct skills; only 6 are skill-pure.**
- Crossed content × operation: **12 clusters × 4 skills = 48 cells, of which 3 are empty and 11 more
  are under ten items**. EVIDENCE has **86 items** total. Splitting SIRS2 turns this into **84 cells**.
- Prerequisite graph: **634 edges**, of which only **176 are prerequisites (143 hard, 33 helpful)**;
  `INTEGRATES` **336**. At lesson grain, **37 hard and 19 helpful edges over 114 lessons**, with
  **76 of 114 lessons having no incoming prerequisite at all**.
- **No passage sets:** 2,108 questions, 2,108 distinct family IDs, zero multi-question families,
  median passage length **158 characters**.
- **CARS: 160 items for a section worth 25% of the exam.**
- The diagnostic supplies **14 items per concept**; a single lesson supplies about **18 questions**,
  all landing in one concept, so **one lesson out-measures the diagnostic for that concept**, and 140
  items is about **eight lessons** of volume — mid-week-one for a 15h/week learner.

**DOK 2**

Single-KC loading is the bank's best property and its sharpest limitation at once: it grants
identifiability for free and caps information at one attribute per item. The skill/DOK confound is the
most serious labelling defect, because "weak at SIRS3" and "weak at DOK3 items" are currently the same
statement and no amount of modelling can separate them. FC10's forty items are the concrete reason the
form cannot be lengthened, and the absence of passage sets is the hard constraint on any full-length
ambition — which is also why the instrument's items are independently placeable in a way a
passage-assembled test's are not.

---

### 2.26 Internal — the output contract: what the diagnostic is and is not allowed to emit.

*Supports SPOV 2, 4.*

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Layer 3. Derived policy; the supporting
figures carry their own markers.*

**DOK 1**

- **Emits:** two named priorities in order with the first presented as more reliable; ten content bands
  (FC1–FC10) shown as ranges with visible uncertainty, never point scores; a curriculum entry point and
  an initial queue ordering over all ten concepts; an explicit **unsettled list** (missed the cut *and*
  unresolved *and* close enough that more evidence could promote them — all three conditions
  load-bearing); capped, asymmetric mastery priors for every lesson under every sampled concept; and a
  **word-level confidence label, never a number**.
- **Does not emit:** a ranked profile, per-concept scores, a numeric confidence, an overall altitude
  estimate, or any operation read.
- **Must not emit:** a per-KC mastery map across 422 components; point scores on any dimension; a rank
  ordering between dimensions whose posteriors overlap; any claim of completeness.
- **Hard product constraint:** if a dimension does not have **~20 items** behind it, no number is
  displayed for it.
- No altitude estimate is emitted because there is no calibrated scale for one to live on, and the
  classic adaptive-efficiency results that make a unidimensional altitude estimate cheap were obtained
  on strictly unidimensional tests (Martin, McBride & Weiss, entry 1.1).

**DOK 2**

This is where the measurement findings become a shipped contract: the ~20-item display rule is
Sinharay's added-value threshold turned into a UI constraint, and the ban on rank ordering is Wang,
Song et al.'s attribute-versus-pattern gap turned into the same. The subtle part is that narrowing the
*report* from three priorities to two did not narrow the *read* — every concept still gets a gap and a
confidence, and the demoted concepts reach the learner through seeded priors rather than through the
report. Choosing not to display dimension scores is what buys the shorter test, so it is a design
decision rather than a workaround.

---

### 2.28 Internal — what the correction loop does not fix: non-coverage. `[simulated]`

*Supports SPOV 1.*

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Layer 4, from the standalone coverage
model.*

**DOK 1**

| Concepts the learner covers | True worst never seen | Of their true worst 3, never seen |
| --- | --- | --- |
| 3 / 10 (≈40h runway) | **10.4%** | 0.77 |
| 5 / 10 (≈60h) | 2.4% | 0.26 |
| 7 / 10 (≈90h) | 0.5% | 0.08 |
| 10 / 10 (≈120h+) | 0.0% | 0.00 |

- For anyone covering **seven or more** concepts the residual is **half a percent**.
- Week-one probing of unsettled concepts is **the only mechanism that deliberately samples outside the
  selected set**, and therefore the only thing that reduces this figure.

**DOK 2**

The residual error that matters is not misranking but non-coverage: a misranked concept is corrected
the moment the learner reaches it, while a concept never reached is never corrected. The distribution
is the double bind — the learner for whom the diagnostic matters most is the one with the least time
for its errors to be corrected — so the system is not fully self-repairing exactly where repair
matters. 10.4% is the number to quote whenever someone argues that the correction loop makes
diagnostic quality unimportant.

---

### 2.30 Internal — full-length practice exams as placement instruments: Claims 1, 5 and 9.

*Supports SPOV 3, 5.*

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part IV. Argument rather than measurement;
the supporting figures are in entries 2.16, 2.4 and 1.15.*

**DOK 1**

- **Claim 1:** a full-length is a **prediction** instrument being used as a **placement** instrument.
  It is designed and equated to produce one precise number on a known scale; the day-one question is
  "what should I do on Monday," which a scaled score does not answer. **No figures attached.**
- **Claim 5:** a full-length administered before instruction is contaminated by three sources of
  variance unrelated to content knowledge — unfamiliarity with the item format, absence of pacing
  strategy, unpracticed endurance across a **7.5-hour** sitting — all of which shrink substantially by
  **week six**. The same form administered later is a better measurement of the same construct.
  Fatigue is signal for score prediction and noise for diagnosis.
- **Claim 9:** item-level assembly produces a prescription ("your FC3 read is the weakest of the ten
  and here are the eleven lessons beneath it, in order"); four section scores produce a label. The
  stronger crossed content × operation version of this claim **is retracted**, because four of the
  seven operations do not exist as labels.
- Honest concessions: a full-length wins on **score prediction** (a number on the AAMC scale, which
  this design cannot credibly produce without concordance data), **face validity**, **endurance and
  pacing**, and **blueprint coverage by construction** — all checkpoint functions, better served at
  week 4 or 6 than day 1.

**DOK 2**

The industry's error is not using full-lengths but using its best *checkpoint* instrument as its
*placement* instrument, at the point in the timeline where it measures worst. The day-one contamination
argument is the one with no counter: format unfamiliarity, missing pacing and untrained endurance are
all real variance that has nothing to do with what the learner should study on Monday. These claims
carry no numbers of their own and rest on the measured entries elsewhere in this category, which is how
they should be presented.

---

# 3. Effect on the learner

Dropout, test anxiety, discouragement, and how a diagnostic's design changes user outlook rather than
system knowledge.

---

### 3.3 Dai, Vanacore, Baker & Slater — Understanding MOOC Stopout Patterns. L@S '25. `VERIFIED — full text read`

*Supports SPOV 3, 4, 5.*

<https://learninganalytics.upenn.edu/ryanbaker/L_S_25_Dai.pdf>

**DOK 1**

- Analytic dataset: **90 Coursera courses** (Penn, Sept 2015 – Feb 2025) with **5,370,635 enrollments**
  and **469 graded assessments**; mean **6.26** assessments per course, range **3–26**.
- **Stopout** = the assessment after which a learner submits no further graded assessment; final
  assessments excluded by construction.
- Average stopout at the **first** graded assessment: **18.71%**. Average across all others: **7.27%**.
- Stopout decays exponentially: **−0.12 per additional assessment (SE = 0.009, p < 2 × 10⁻¹⁶)**,
  conditional **R² = 0.49**. The first assessment does not fit that curve: model deviance **349.14**
  including it versus **228.76** excluding it.
- Predictors of first-assessment stopout (standardised coefficients): number of questions on
  assessment 1 **+0.073, p < 0.0001**; percent fill-in-numeric **+0.037, p = 0.002**; percent
  reflection questions **−0.025, p = 0.024**; expected time commitment on assessment 1 **−0.0495,
  p = 0.060**; expected time commitment on assessment 2 **+0.078, p = 0.002**; course-level number of
  assessments **+0.062, p = 0.011**; course-level number of practice assignments **−0.056, p = 0.019**.
- Variance explained: course-level features alone **R² = 0.117**; assessment-level alone **R² = 0.450**;
  combined **R² = 0.494**.
- Question type mix: multiple choice **72.9%**, checkbox **14.0%**, numeric **6.2%**, reflective
  **2.5%**.
- Authors' limits: correlational, no control for course topic, single LMS, graded quizzes/tests only.

**DOK 2**

The first assessment is governed by a different mechanism than later ones — it is not the top of a
smooth decay curve — which is what justifies treating "the first thing you ask a learner to do" as its
own design problem. Item count and expected time point in *opposite* directions on that first
assessment: more questions raises stopout while longer expected time lowers it, so the naive "make it as
short as possible" rule is wrong and the better rule is "make it feel purposeful and do not make the
item count the salient number." Expected time flips sign by assessment 2, suggesting goodwill is
front-loaded. The transfer caution is severe and the reading list demotes this source for it: a free,
no-commitment MOOC population bundles "never intended to finish" with "found the assessment aversive,"
so the levels do not carry across to a paying user with a fixed exam date — only the relative ordering
of design features does.

---

### 3.9 Internal — staged delivery decouples time-to-value from item budget. `[design argument]`

*Supports SPOV 2, 3, 5.*

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part IV Claim 6 and Layer 1.*

**DOK 1**

- An MST diagnostic is assembled from discrete modules, so a learner completes one **20-item block in
  about half an hour**, receives a starting point, and begins studying the same day. The remaining six
  blocks interleave with early lessons.
- The comparison against a full-length is **25 minutes to first actionable output versus 7.5 hours** —
  not 3.5 hours versus 7.5 hours of total seat time.
- A full-length cannot be split without destroying what it is for, since its validity as a score
  predictor depends on one sitting under exam conditions including the fatigue.
- **This does not produce a parallel-form retest**, and the previous draft's claim that it does was
  wrong: successive blocks are drawn from the same pools and the two simulated sittings share roughly
  **82%** of their items `[simulated]`.

**DOK 2**

This is the clearest lever the design has on the dropout problem and it costs nothing in measurement:
the items are the same items and the budget is the same budget, only the delivery schedule changes.
Read against Dai et al., it also targets the right variable — the salient number a learner faces at the
first assessment becomes twenty items rather than 140. For any product with a funnel this is an
activation argument before it is a measurement argument.

---
