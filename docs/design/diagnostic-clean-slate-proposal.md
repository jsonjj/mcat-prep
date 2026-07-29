# Diagnostic System — Design Specification

Originally written as a clean-slate proposal constrained only by the verified research in
`docs/research/diagnostic-reading-list.md`. Since then a measurement campaign has run against the
production harness, and this revision reports what it found. Several of the original document's
central claims did not survive it. Those claims are stated here alongside what replaced them and
what measurement forced the change, because a reader who saw an earlier draft is entitled to
follow the revision, and because a design document that quietly deletes its overturned hypotheses
is asking to be trusted rather than checked.

**Provenance convention**, inherited from the reading list. `[read]` means the full text was
retrieved and the numbers checked directly. `[agent-read]` means a research agent retrieved the
full text and tagged each number. `[measured]` means computed from our own bank or registry in
this repository — the command is reproducible. `[unverified]` means reasoning or recalled
literature that has not been checked in this project and must not be cited externally as-is.
Unmarked citations are inherited from the v1 research sweep; their per-paper provenance is in
`docs/research/diagnostic-source-knowledge-tree.md` and should be checked before external use.
`[simulated]` marks results from our own modelling.

**A second convention, added in this revision, and the more important one.** Every `[simulated]`
figure below carries the conditions that produced it: the reporting axis, the item budget, the
delivery arm, the number of assumption worlds and the number of learners per cell. This is not
pedantry. Several figures in this document differ *only* by those conditions — the same
reproducibility criterion measures 94.6% pooled and 88.0% in the worst world; the same criterion
scores 88.0% under item-level adaptive selection and 82.0% under multistage delivery; the same
multistage family measures 82.0% across 24 worlds at 250 learners a cell and 84.7% for the adopted
form run deep on the three worlds every design fails in. A number quoted without its conditions is
not a weaker version of the claim, it is a different claim.

**And the caveat that governs the whole document.** Every quantitative result here is simulation
under a generative learner model that has never been fitted to a real response. The item bank is
uncalibrated. Nothing below has been measured on a learner. What simulation can establish is the
*ordering* of designs and the identification of designs that fail outright; it cannot forecast a
rate. No figure in this document should be quoted to a learner, and none should be presented
externally as a performance claim.

---

## Summary for readers who need the decisions, not the derivation

**What we are building.** A 140-item multistage diagnostic over the 10 AAMC Foundational Concepts,
delivered as seven 20-item blocks. Each block after the first is routed on number-correct from the
blocks before it, and later blocks spend more of their slots on the concepts still contesting the
reported cut. A learner may revise answers within a block. The form does not stop early.

**What it outputs.** Two concepts to start with, a gap and a read-confidence figure for every one
of the ten, an explicit list of what it could not settle, and a set of capped priors handed to the
mastery tracker. **It does not output a ranked profile, per-concept scores, or a numeric
confidence**, and Part II explains why the first of those is a measurement fact rather than a
product choice.

**The decisions that matter, and what drives each:**

| Decision | Choice | Why |
| --- | --- | --- |
| Reporting axis | 10 AAMC Foundational Concepts | AAMC-canonical, already tagged on 98 of 114 lessons, lands at the ~10 dimensions the coarse-grain literature points to |
| Length | 140 items, 14 per concept | 200 buys nothing net of its own duration and runs the thinnest concept's pool close to empty `[simulated]` |
| Administration | Multistage, seven 20-item blocks | Survives an uncalibrated bank (Zheng, Chang/Chiu/Tsai, Sun), permits within-block review, guarantees content balance |
| Priorities reported | **Two**, not three | The third slot does not survive a re-sit `[simulated]` |
| Accuracy to expect | True worst concept inside the top three of the internal ranking for ~91% of learners, ~87% in the worst assumption world `[simulated]` | Measured on `fc-10` at 140 items, 24 worlds × 250 learners |
| When to administer | Gated on learner runway | Worth a great deal below ~120 hours of available study time and exactly nothing above it `[simulated]` |

**The claim that decides how much of this is worth building.** An exact-posterior oracle — one
that re-reads the engine's own responses knowing every item's true difficulty and discrimination
and the exact population the learner was drawn from — beats the shipped engine by essentially
nothing. The engine scores 99–102% of that bound. There is no accuracy left to recover by better
inference at this item budget; the remaining levers are the item bank, the reporting grain, and
the correction loop downstream.

**What blocks us now.** A calibrated item bank. That is the only thing standing between this
document and a real performance claim, and no amount of further simulation substitutes for it.
Part V is the plan.

**What changed since the previous draft.** Eight material claims were overturned by measurement and
each is traced in place below. The document reported three priorities and now reports two. It
assumed a crossed content × operation design at 200-item-class budgets; the operation axis is not
delivered and 140 is priced by the content axis alone. It carried an 80% bar on re-sit agreement
that an oracle cannot reach. It asserted that adaptive allocation was worthless on the strength of
an oracle experiment that by construction could not detect it. It described the runway trade as
"short test when time is tight, long when plentiful", which has the shape backwards at both ends. It
claimed that splitting the form across sittings yields a parallel-form retest, which it does not.
Its `certainty` channel was pinned at exactly 1.000 for most reads. And its bank table
double-counted 187 questions.

---

## Part I — Constraints

### 1. The finding that determines everything else

**A short test cannot produce a trustworthy ranked profile across many dimensions.** This is not
a tuning problem or an algorithm problem. It is an item-budget problem, and three independent
literatures agree on the arithmetic while answering subtly different questions:

| What you claim | Source | Items per dimension |
| --- | --- | --- |
| "You're weak enough here to start here" (binary call) | Maas et al. 2022 `[read]` | ~5 |
| "This read is stable and would replicate" (consistency) | Emons 2007; Kruyen 2012 `[agent-read]` | 20–40 |
| "This subscore tells you something the total doesn't" (added value) | Sinharay 2010 `[agent-read]` | ~20, plus distinctness |

These do not converge on a single number. **Which one binds depends entirely on what we claim
the output means**, and that is the single most consequential design decision in the system. A
coarse "start here" recommendation is cheap. A rank-ordered profile of relative strengths is
expensive by a factor of four.

Two refinements to this that arrived later and matter a great deal:

- **Augmented subscores change the arithmetic.** Sinharay found that subscores borrowing strength
  from the total score had added value far more often than standalone subscores — including at
  **10 items per subscore** when disattenuated *r* ≤ 0.85. This is the direct empirical warrant
  for hierarchical pooling, and it is why our dimension count is not simply `items ÷ 20`.
- **Reporting grain is a bigger lever than item count.** Cheng & Morgan `[read]` found that
  collapsing five reported categories to pass/fail improved classification accuracy **more than
  doubling the test length did**. We can buy more decision quality by changing what we report
  than by making the test longer.

The corollary is the encouraging part: the fine-grained profile is still achievable. Just not on
day one, and not from a test. It accumulates from work the learner is doing anyway.

### 2. What we actually have — a measured audit of our own materials

Every number in this section is `[measured]` from `content/question-bank/.local/db-pull/questions.json`
(2,108 items, status `production_candidate`) and `curriculum/v3/v3-lesson-authoring-manifest.json`.

**Item labelling is clean in one important way.** Every question maps to exactly one knowledge
component — 2,108 items, 2,108 single-KC assignments, 422 distinct KCs, zero items with no KC.
Median 5 questions per KC; 22 KCs have fewer than 3. Single-loading is good news for
identifiability: Gu & Xu's sufficient-and-necessary conditions for DINA require each attribute to
have an isolating item, and single-loading gives that by construction.

**Skill and cognitive complexity are almost perfectly confounded.** This is the most serious
labelling defect in the bank:

| Skill | n | DOK1 | DOK2 | DOK3 |
| --- | --- | --- | --- | --- |
| SIRS1 | 379 | **100%** | 0% | 0% |
| SIRS2 | 1,248 | 1% | **95%** | 4% |
| SIRS3 | 235 | 4% | 8% | **88%** |
| SIRS4 | 86 | 9% | 57% | 34% |

Whatever generated these items assigned the two axes in lockstep. As it stands, "weak at SIRS3"
and "weak at DOK3 items" are the same statement and cannot be told apart. Any claim that the
operation axis is independent of difficulty is currently untestable, because the labels do not
vary independently. Note this is a *labelling* artifact rather than an item-authoring one — the
IDENTIFY population is known to carry near-neighbour distractor lures in roughly 71% of items,
which is a difficulty mechanism sitting inside a population labelled uniformly DOK1.

**The content hierarchy is clean and already carries an AAMC-canonical grouping.** KC → lesson →
cluster is perfectly nested with zero violations. 114 lessons, median 18 questions each, each
lesson in exactly one cluster and carrying 2–5 KCs. And every lesson already has AAMC Foundational
Concept tags.

**Correction to this table as it appeared in the previous draft.** It reported 1,998 questions
across FC1–FC10 and 57 in FC10. Both were wrong, and wrong in the direction that flatters the
design. Nine of the 114 lessons carry more than one Foundational Concept, and the earlier count
credited each of their questions to every concept the lesson was tagged with. Production does not
do that: `fcForLesson` routes a question to its lesson's **first-listed** concept and to no other,
which makes the axis a partition. Counted the way production counts,
`packages/policies/src/data/bank-profiles.generated.ts` gives 1,811 questions over the ten
concepts, 187 fewer than the double-counted figure `[measured]`:

| | lessons tagged | questions, first-listed FC | DOK 1 / 2 / 3 |
| --- | --- | --- | --- |
| FC1 | 15 | 280 | 61 / 184 / 35 |
| FC2 | 8 | 111 | 26 / 69 / 16 |
| FC3 | 11 | 203 | 47 / 130 / 26 |
| FC4 | 25 | 414 | 72 / 295 / 47 |
| FC5 | 18 | 279 | 59 / 180 / 40 |
| FC6 | 7 | 120 | 21 / 75 / 24 |
| FC7 | 9 | 155 | 31 / 99 / 25 |
| FC8 | 6 | 103 | 24 / 62 / 17 |
| FC9 | 6 | 106 | 20 / 66 / 20 |
| FC10 | 3 | **40** | 4 / 32 / 4 |
| *(none)* | 16 | 297 | — |

89 lessons carry exactly one FC, 8 carry two, 1 carries three. **The 16 lessons with no FC are
exactly the skill lessons** — 9 CARS, 4 SIRS (one per skill), 3 MATH-ENABLING. Those 297 questions
are not merely untagged; they are unreachable by this instrument, since a question reaches a
concept only through its lesson. The server states the exclusion at boot rather than absorbing it,
because "the form is short" and "a seventh of the eligible bank cannot be delivered" look identical
from downstream (`apps/learner-web/server/diagnostic-bank.ts`).

**FC10's 40 items are the binding constraint on length, and they are worth stating on their own.**
Forty items is 2.2% of the addressable bank for a concept that carries roughly a tenth of the
reporting axis. At the 140-item budget a learner sees at most 24 of them, which is comfortable; at
200 items a single sitting has been observed to consume 36 of the 40 `[simulated]`, at which point
the form is competing with itself for the only pool it has. This is the concrete reason the length
question in Part II is not purely a question about learner time.

**Skill cuts across lessons, which is why an operation-only diagnosis cannot select lessons.**
99 of 114 lessons contain three or more distinct skills; only 6 are skill-pure. "Weak at EXPLAIN"
implicates essentially the whole curriculum. "Weak at KC-534000" points at exactly one lesson.

**A fully crossed content × operation design does not yet fit the bank.** Science items only,
12 content clusters × 4 skills = 48 cells, of which **3 are empty and 11 more are under ten
items**. EVIDENCE is the acute problem: 86 items total, spread over twelve clusters, three of them
zero. Splitting SIRS2 into four operations turns this into 84 cells and divides the one healthy
column by four.

One genuinely reassuring result: DESIGN and EVIDENCE are **spread across content** rather than
concentrated in the research-methods clusters (DESIGN's largest cells are PS2 at 41 and PS3 at 37,
not R1–R3). Had they been concentrated, the operation axis would have collapsed into a content
proxy the same way skill collapsed into DOK. It did not.

**The prerequisite graph exists but is too sparse to bucket from.** 634 edges total, of which only
176 are prerequisites (143 hard, 33 helpful); the rest are `INTEGRATES` (336), `APPLIED_TO`,
`CONFUSABLE_WITH`. At lesson grain it thins to 37 hard and 19 helpful edges over 114 lessons, with
**76 of 114 lessons having no incoming prerequisite at all**. The generated unlock-weights table
already carries this warning and is marked NOT YET ADOPTED for exactly this reason. The graph can
inform local sequencing where edges exist; it cannot induce a grouping.

**There are no passage sets.** 2,108 questions, 2,108 distinct family IDs, zero multi-question
families, median passage length 158 characters. The real exam is roughly three-quarters
passage-based with 4–7 items on a shared passage of several hundred words. This is the hard
constraint on any full-length ambition and it is discussed at length in Part IV.

### 3. The measurement taxonomy

The previous draft specified two crossed axes and treated them as jointly load-bearing. **Only one
of them is delivered.** The content axis is what the instrument measures, reports and seeds from.
The operation axis is a designed but unbuilt second measurement, and the reason it is unbuilt is
the labelling defect above rather than a change of mind about its value. Everything this document
says about lengths, bars, reproducibility and net value refers to the content axis alone.

**Content axis — the 10 AAMC Foundational Concepts.** Chosen over the 15 legacy clusters (which
the team rejected on merit as content rollups that mapped to no distinct action) and over the 39
`content_categories`, 40 `sequence.modules`, and 5 `phases`, all of which are the wrong grain.
FC1–FC10 is AAMC-canonical, so the validity argument is inherited rather than constructed; it is
already labelled on 98 of 114 lessons at zero cost; and it lands at the ~10 dimensions the
coarse-grain literature points to. It is implemented as `FC_AXIS` in
`packages/policies/src/diagnostic-axis-fc.ts` and is what `apps/learner-web/server/diagnostic-engine.ts`
serves.

**One property of this axis that the previous draft did not record, and that matters for Part II.**
Aggregating the hand-tuned cluster unlock weights up to concept grain flattens them almost
completely. On the 15 clusters the weights run 0.15 to 1.00; on the ten concepts they run 0.20 to
0.44, with six of the ten tied at exactly 0.20 `[measured]`, because the high-leverage clusters are
the reasoning and CARS ones and no FC-tagged lesson belongs to them. The leverage term therefore
does much less work here than the same code would do on the cluster axis, which is what makes the
trade in Part II tolerable and would not make it tolerable elsewhere.

**Operation axis — seven cognitive operations, designed and not delivered.** IDENTIFY, PREDICT,
EXPLAIN, RELATE, QUANTIFY, DESIGN, EVIDENCE. Derived from AAMC's four Scientific Inquiry and
Reasoning Skills, with SIRS2 split into its four real operations because SIRS2 alone is 59% of our
bank `[measured]` and telling a learner "you are weak at SIRS2" is not actionable. Each operation
was selected against two criteria: a distinct training method, and independence from difficulty.
Four of the seven do not exist as labels today, so the axis cannot be measured, cannot be reported,
and — the point the previous draft got wrong — **does not price the test**. That claim is retracted
in Part II.

**Three open risks on the operation axis, stated plainly.**

1. **Pedagogical distinctness is not psychometric distinctness.** Two skills can genuinely require
   different instruction and still be statistically inseparable in response data, because
   performance on both is dominated by whether the learner knows the underlying content. If the
   seven scores correlate above Sinharay's 0.85 disattenuated threshold, the operation profile has
   no added value, and **more items cannot fix it** — that is precisely his necessary-but-not-
   sufficient finding. PREDICT and EXPLAIN are the highest-risk pair, separated only by the
   direction of the causal chain, which the reasoning literature treats largely as a function of
   domain expertise rather than a stable individual difference `[unverified]`.
2. **QUANTIFY is compound by its own definition** — the relation-selection half is IDENTIFY-gated,
   the computation half is not. That is a two-attribute item, and it breaks the clean single-KC
   structure that currently gives us identifiability for free. Either split it, or carry a real
   Q-matrix for that operation and accept the cost.
3. **IDENTIFY is a hierarchical parent, not a peer.** If you cannot reason about a thing you cannot
   name, IDENTIFY gates the other six and a flat seven-dimensional model misspecifies it. The fix
   is favorable: Kim & Yoo `[read]` found cognitive-diagnostic MST performed *best* under linear
   attribute hierarchies. But it means the design is one gate feeding six, and that IDENTIFY is
   informative only in the middle of the range, flooring for weak learners and saturating for
   strong ones.

**CARS is a third arm, not part of the seven.** The operations derive from SIRS, which by
construction governs only the science sections. CARS has its own AAMC framework — foundations of
comprehension, reasoning within the text, reasoning beyond the text — already present in the bank
as `CARS_FOC` / `CARS_RWT` / `CARS_RBT` with 9 dedicated lessons. Forcing CARS into the seven
would conflate reasoning about a physics scenario with reasoning about a humanities passage under
a no-outside-knowledge constraint, which are almost certainly different constructs. The bank is
badly under-resourced here regardless: 160 items for a section worth 25% of the exam `[measured]`.

---

## Part II — What the measurement campaign found

The literature could not answer the questions that determine the design: how reproducible a
multi-concept read is at our length, how many concepts we are entitled to name, whether staged
delivery costs anything against item-level adaptation, and what the whole instrument is worth to a
learner once it is charged for the time it consumes. The previous draft answered these from
standalone models written alongside the document. **This revision answers them from the production
harness**, and where the two disagree the harness wins.

### What the campaign is, so the figures below can be read

Every `[simulated]` result in this Part comes from the same apparatus. A cohort of synthetic
learners is generated, each sits the instrument twice, and both sittings are scored by the same
posterior the production engine uses. The item bank is rebuilt per world to the real corpus's
concept × DOK shape from `bank-profiles.generated.ts`, so a concept with 40 items in reality has 40
items in simulation.

The **assumption grid** is 24 worlds: two levels of between-concept ability correlation (0.3 and
0.7), two deficit depths (1.5 and 0.6 logits), three population offsets (−0.5, 0, +0.5) and two
ways for the calibration to be wrong (`misspecified`, where item difficulty and discrimination are
drawn around the assumed values, and `systematic`, where a share of DOK-1 items carry near-neighbour
distractor lures that make them harder than their label). The standard depth is **250 learners per
cell**, which is 12,000 sittings per design. Where a figure is quoted at some other depth — the
worst-world figures are also run at 1,500 learners over the three worlds every design fails in —
that is said explicitly, because a worst-of-24 at 250 learners carries about a 2.4-point standard
error *and* a downward selection bias on top of it, and several of the differences this campaign
resolves are the same size.

Two **delivery arms** are run through identical learners, seeds and scoring, differing only in
which items get served: `adaptive`, which re-decides after every item, and `mst`, which serves
fixed routed blocks. The arms are not interchangeable and the document says which one produced
each number. A learner is served the MST arm.

**Bars are pre-registered** in `PLAN_BARS` (`packages/policies/src/diagnostic-simulation.ts`) ahead
of each run, so a design cannot be scored against a criterion chosen after seeing which one it
happened to pass. Changing a bar is a commit with a justification attached, and two of them have
been changed; both changes are traced below.

### A ranked profile is not achievable, and this is why we stopped promising one

Two independent sittings, 10 concepts, learners with correlated abilities. These figures are from
the earlier standalone model rather than the production harness, and they are kept because nothing
in the campaign disturbed them and because the harness measures the same phenomenon by a different
route (below):

| | 14 items/concept | 20 | 30 | 80 |
| --- | --- | --- | --- | --- |
| Identical full 10-way ranking | **0%** | 0% | 0% | 0% |
| Identical 3-tier grouping | 2.0% | 3.4% | 5.6% | 16.3% |
| Identical weakest-3 set | 13.2% | 18.0% | 24.4% | 41.6% |
| Spearman between sittings | 0.59 | 0.66 | 0.73 | 0.86 |

An 800-item test still cannot reproduce its own tier grouping more than a sixth of the time.
Ordering ten dimensions requires every adjacent pair to be correct, and adjacent concepts are
usually close enough in truth that those comparisons are near coin flips. **No feasible test length
fixes this.** The harness reaches the same place from the other direction: at 140 items on `fc-10`,
the two sittings name the identical top three about a third of the time and the rate tops out near
52% even at 480 items. The design therefore reports an unranked, and now very short, set.

### The report names two priorities, not three

This is the single largest product-visible change since the previous draft, which reported three.

The third slot does not survive a re-sit. Scored on the criterion the report is actually made on —
does at least one named priority recur when the same learner sits the instrument again — a
top-three report was measured at 76.4% in the worst world against a top-two report's 89.6% at 200
items on `fc-10`. At the 140 items the design now serves, the top-two figure is **94.6% pooled and
88.0% in the worst world**, adaptive arm, 24 worlds × 250 learners. The top-three version does not
clear the bar the report is held to; the top-two version does with about one standard error of
headroom.

The reason the third slot fails is not that the third concept is badly measured. It is measured as
thoroughly as the two above it — a full production block, 14 items — and the engine is careful to
distinguish the two situations: a concept demoted by the reported count is deliberately kept *out*
of the `stillConfirming` list, which means "weak on the evidence so far but not settled", and is
carried instead by the seeded mastery prior, which reads all ten concepts rather than the named two
(`packages/policies/src/diagnostic-certainty.test.ts` pins this). The third slot fails because
**roughly two thirds of the disagreements at that boundary are between concepts whose true weakness
differs by under 0.10** on a 0–1 scale. Those are real near-ties. Two sittings that disagree about
them are not disagreeing about the learner.

`REPORTED_PRIORITY_COUNT` lives in the policy layer rather than in the UI precisely so that this
cut cannot drift: the early stop, the plan-confidence separation term and the `stillConfirming`
rule all read it, and a consumer that re-sliced the ranking with its own number would be describing
a report the instrument did not make.

### The old 80% bar was not merely hard, it was unreachable by construction

The previous draft carried an 80% bar on exact top-three set agreement between sittings and flagged
that Part II showed it was not reachable. That was right, and understated. The campaign built the
bound explicitly.

The bound is an **exact-posterior oracle**. It re-reads the engine's own responses — the same items,
the same answers, both sittings — and forms the exact posterior over each concept's ability on a
grid, knowing every item's true difficulty and discrimination, the exact leverage weights, and the
exact two-level population the learner was drawn from, including the deficit mixture rather than a
fitted normal. It suffers the learner's response noise and none of the engine's calibration error.
It is not implementable and is not meant to be; it is what an optimally accurate instrument would
score on the same data.

In the worst assumption world, that oracle's re-sit agreement on a top-three set tops out in the
mid-to-high seventies: 75.4% at 140 items and 80.2% at 200 in a 60-learner replication of the
campaign's worst world, against the campaign's own reported figure of 75.8%. **The engine measures
99–102% of it.** Two readings follow, and both matter.

First, the 80% bar was asking for something no instrument could deliver at this budget, so leaving
it in place would have made a working system look broken. Second, and more consequentially for how
the remaining effort is spent: **there is no accuracy left to recover by better inference.** A
better estimator, a better prior, a better selection rule — the bound says these are worth at most
a point or two combined. What remains available is a better item bank, a coarser reporting grain,
and the correction loop downstream.

The bound also disciplines a reader who proposes maximising reproducibility directly. Asked without
qualification, "how reproducible can this be" is ill-posed: an instrument that ignores the responses
and names the same two concepts for everybody scores 100% on a re-sit. The campaign therefore fixes
accuracy first and asks how reproducible an instrument can be while remaining that accurate, and it
reports the whole shrinkage frontier rather than a single number.

**The bars now in force**, from `PLAN_BARS`, each named for the arm and length it describes:

| Bar | Value | What it is |
| --- | --- | --- |
| `top1InTop3` | 0.85 | The truly worst concept appears in the internal top three |
| `twoOfThree` | 0.75 | At least two of the internal top three are truly top three |
| `confidentCorrect` | 0.84 | When the badge says "Medium or better", the true worst concept is in the top three |
| `testRetestReportedAt140` | 0.86 | Re-sit keeps at least one named priority — **item-level adaptive**, telemetry only |
| `testRetestReportedMstAt140` | **0.82** | The same criterion on the **multistage form a learner is served** |

Two of these were restated after measurement and the restatements are documented in the code.
`confidentCorrect` replaced a `highConfidenceCorrect: 0.9` bar that was scored on the "High" badge
alone — a badge that fires on 2.5% of sittings at the production design, one to fifteen learners per
250-learner cell, over which the observed rate ran from 60% to 100%. It could neither fail a bad
instrument nor pass a good one, and on cells where it never fired the bar had to skip itself. The
claim it was checking is real; only the denominator was not, so it was restated over the 62% of
sittings the badge speaks positively about. `testRetestReportedMstAt140` was 0.78 and was raised to
0.82 during this revision when the app adopted the recommended MST form; the value was in flux while
this document was being written and 0.82 is what the code now holds.

**The MST bar is the one that describes a learner.** The adaptive bar is retained as telemetry —
read it as the ceiling item-level selection reaches at this budget — but no learner meets that
selector, and a bar aimed at a form nobody sits was the defect the second bar was added to fix.

### Delivery is multistage, and the cost of that is understood rather than assumed

Multistage delivery trails item-level adaptive selection by about six points of worst-world
reported reproducibility — 88.0% against 82.0% on `fc-10` at 140 items over 24 worlds × 250
learners, with the same learners, the same seeds and the same scoring in both arms. The only
difference between the arms is which items get served.

The obvious hypothesis is that MST loses because it makes fewer decisions. **That hypothesis is
wrong, and the attribution ladder says so unambiguously.** Doubling the routing decisions from three
to six is worth 0.3 points. The entire family from 2 stages to 20, at fixed total length, sits inside
a single point of itself. About 80% of the deficit is **allocation** adaptivity — which concepts the
items are spent on — and routing does not buy that at any stage count. The remainder is the routing
cuts themselves, and specifically where they sit relative to the engine's prior.

The adopted design, `MST_140_RECOMMENDED`, is seven 20-item blocks, three difficulty modules per
stage after the first, routing cuts at ability quantiles `[0.45, 0.75]`, and contention-allocated
slots in the six stages after the router. Measured on `fc-10` over the three worlds every arm fails
in, at 1,500 learners per cell — worst-world reported reproducibility, then true worst concept in
the top three:

| Design | re-sit 1-of-2, worst | true #1 in top 3, worst |
| --- | --- | --- |
| 50 + 3 × 30, three routes, equal-mass cuts | 79.9% | 82.3% |
| 7 × 20, six routes, equal-mass cuts | 80.2% | 82.3% |
| 7 × 20 + raised cuts | 81.9% | 84.3% |
| 7 × 20 + contention slots | 83.3% | 86.4% |
| **7 × 20 + both (adopted)** | **84.7%** | **87.5%** |
| item-level adaptive | 86.9% | 87.3% |

Read the first two rows together: doubling the routing decisions bought 0.3 points. What the extra
stages are *for* is that they are the only place the other two levers can act — a cut can only be
re-aimed at a stage boundary and slots can only be re-allocated at one. Six boundaries at 20 items
apiece is the most of both that stays above a block a learner can reasonably review. Of the 7.0-point
gap between the superseded form and item-level adaptive on this measurement, the adopted design
recovers 4.8. On the true worst concept it now measures slightly *above* the adaptive arm, 87.5%
against 87.3%, which should be read as a tie rather than as a win.

**Why keep MST at all, given it is still behind on reproducibility.** Two operational properties
that the adaptive arm cannot offer. A learner may revise an answer within a block before submitting
it, which is the substantive objection to item-level adaptive testing. And content balance is
guaranteed on every route through the panel rather than on average, because modules at a stage differ
in difficulty and never in content. Those are worth two points of a simulated reproducibility figure.
That is a judgement, stated as one.

**A counter-intuitive result worth stating before a reader proposes it.** The routing cuts sit
*above* equal mass. Equal-mass bands under the engine's N(0,1) prior do not produce equal-sized bands
against the realised cohort, which measures around −0.38 with sd 0.75, so three modules fill roughly
42/47/11 rather than a third each. The natural fix is to re-aim the cuts downward onto the cohort the
instrument actually sees. **That makes module occupancy far more even and makes accuracy worse in all
24 worlds, by up to 5 pooled points.** Pushing the cuts the other way makes occupancy more lopsided
and accuracy better. The mechanism is that the bank's DOK ladder sits above this cohort, so a learner
routed upward is served items above their ability and the block buys less than an easier one would.
Even module occupancy is a property of the design, not an objective of it, and optimising for it here
optimises against the thing the instrument is for.

### A retraction: contention-weighted allocation is not worthless

The previous draft reported that adaptive allocation bought nothing, on the strength of an oracle
experiment in which an allocator handed the *true* leverage scores scored 68.1% against an even
split's 68.2%.

That experiment cannot detect the effect it was used to rule out. The oracle already extracts
everything the responses contain, so moving items between concepts cannot change what it concludes;
information is fungible to an estimator that is already efficient. The shipped engine is not that
estimator. At four to fourteen items a concept it makes ordering errors an oracle would not, and
those errors concentrate exactly where the ranking is close. Measured against an even split over 24
worlds, contention weighting is worth **3.5 points of true worst-concept accuracy (92.6% against
89.1%) and 3.6 points of reported reproducibility (95.5% against 91.9%) on `fc-10` at 140 items**, and
5.2 and 6.2 points of true 2-of-3 on the 15-cluster axis at 60 items. The bound is insensitive to
allocation, the instrument is not, and the bound cannot see the difference. "Adaptive allocation is
worthless" is true of the bound and false of the engine, and the previous draft asserted it of the
engine.

The same mechanism is what the MST attribution found independently: allocation is about 80% of MST's
deficit. Two studies, built for different purposes, agree that where the items are spent matters far
more than how often the instrument is allowed to change its mind.

One detail worth recording because it looks like an inconsistency. The contention boundary is drawn
at the third-versus-fourth gap, not at the reported cut between second and third. That is
deliberate: the report names two, but the seeded mastery priors and the initial lesson ordering read
the whole head of the ranking, and aiming the selector at the reported cut instead measured worse on
every accuracy figure — worst-world true worst concept 80.0% against 87.0% — while stopping fifteen
items earlier.

### The leverage weighting stays at full strength, and the trade is stated

Priorities rank on `gap × (1 + unlockWeight)`, at full strength. This is the most attackable choice
in the design, because the weight is a property of the concept and not of the learner, so at full
strength it can name a concept ahead of one the learner is measurably weaker in. The campaign
measured it at four strengths on `fc-10` at 140 items over 24 worlds × 250 learners, reporting
pooled then worst world:

| strength | cross-learner agreement | re-sit 1-of-2 | true #1 in top 3 | weakest #1 in top 3 |
| --- | --- | --- | --- | --- |
| **1.00** | 56.0% (truth 45.6) | 94.6% / 88.0% | 91.5% / 86.8% | 78.0% |
| 0.50 | 52.0% (truth 42.6) | 93.1% / 86.4% | 90.1% / 85.2% | 79.6% |
| 0.25 | 44.9% (truth 41.3) | 88.4% / 80.0% | 87.5% / 79.2% | 81.3% |
| 0.00 | 39.8% (truth 38.2) | 81.5% / 66.0% | 82.2% / 68.0% | 82.2% |

Removing the weighting entirely removes 10 points of genericity — agreement between *different*
learners' plans above what ground truth itself shows — and costs **22 points of worst-world
reproducibility** to buy 4 points of skill at naming whichever concept the learner is weakest in
outright. That is the trade, and it is not close.

The mechanism is worth being precise about, because "reproducibility bought by a constant" sounds
like cheating and partly is. What the weight buys is reproducibility *because* it is
learner-independent: a constant breaks a near-tie the same way on both sittings, where the measured
gap does not. It is not overriding measured weakness. On this axis the weights run 0.20 to 0.44, so
the multiplier spans 1.20 to 1.44 and can only reorder concepts whose gaps differ by under 20% — and
six of the ten are tied at 0.20, so it cannot reorder those at all. On an axis with a wider spread
the same code reorders concepts differing by up to 74% and the trade would land somewhere else
entirely, which is why `UNLOCK_STRENGTH` is a named constant rather than an inlined 1.

### Length: 140 rather than 200, decided on operational grounds

The previous draft priced 140 on the operation axis: 20 items per operation, with 14 per concept as
a byproduct. **That justification is retracted.** The operation axis is not measured, and 140 is
14 items per concept and nothing else.

The honest summary of the length question is that on net value the two lengths are equivalent and
the tie is broken on operational grounds. Across the assumption grid, 200 items buys between 0.01
and 0.09 additional correctly-prioritised concepts out of three, which is inside sampling noise at
250 learners a cell. It is not that 200 is worse at measuring; it plainly measures better. It is
that the extra 60 items cost the learner 1.6 hours, and under a constrained runway those hours buy
study time that is worth about as much as the improved ordering.

Two things break the tie toward 140. The first is bank depth: at 200 items a single sitting has been
observed to draw 36 of FC10's 40 items, so the longest design is the one that runs the thinnest
concept's pool close to empty and leaves no room for exposure control across a cohort. The second is
that the ordering benefit sits inside dead zones that the next section describes, where a longer
test's extra hour costs a whole concept of reach.

### The runway model: a step function with a hard knee, not a smooth trade

This is the part of the analysis most likely to be misremembered, so it is worth stating the shape
before the numbers. The learner has a fixed number of hours. The curriculum holds about 114 hours of
first-pass lesson content over ten concepts, so a concept costs about 11.4 hours. The diagnostic
charges the learner its own duration at 95 seconds per item — 3.7 hours at 140 items, 5.3 at 200 —
and what it returns is a better *ordering* of a queue the learner now has less time to work through.
Coverage is an integer. That makes value a step function, and every interesting feature of it is a
feature of the steps.

**Above the knee the diagnostic is worth exactly zero, and this is not a rounding statement.** At and
above roughly 120 hours of available time, every length ties at precisely zero net gain, because the
learner reaches every concept regardless of the order they are reached in. Reordering is a
permutation and permutations save no time. `diagnostic-value.test.ts` asserts this as an equality
rather than an approximation: a perfectly ordered queue and a reversed one produce identical hits at
120, 200 and 300 hours.

**Just below the knee every design is net negative.** At 115 hours a learner with no test covers all
ten concepts; a learner who sits any length of test covers nine. The instrument spends a concept of
reach and returns an ordering of the nine that remain, which cannot be worth a concept. This is the
clearest single argument for gating administration on intake.

**Below the knee, longer is better almost everywhere — bounded by that ceiling and by periodic dead
zones at the coverage boundaries.** Because coverage is `floor((runway − test hours) / 11.4)`, there
are runways at which a longer form crosses a boundary and a shorter one does not. At 25 hours, a
60-item form leaves time for two concepts and a 200-item form leaves time for one, and the shorter
form is worth about 75% more as a result. These zones recur every 11.4 hours and are narrow. The
previous draft's summary — "short test when time is tight, long when plentiful" — has the shape
backwards at both ends, and this revision retracts it.

The coverage table itself survives unchanged, and the net-value model reproduces it exactly, which is
what makes it the same model rather than a second one that happens to agree in prose:

| Runway | Concepts coverable after paying for a 140-item form |
| --- | --- |
| 4wk × 10h = 40h | 3 / 10 |
| 6wk × 15h = 90h | 7 / 10 |
| 8wk × 15h = 120h | 10 / 10 — nothing left to capture |
| 12wk × 25h = 300h | 10 / 10 — nothing left to capture |

Two caveats, both pushing the same way. This counts first-pass lessons only; adding recall, practice
and CARS raises total content and pushes the knee higher, so more learners fall in the constrained
regime than the table suggests. And the model scores the *whole* reported ordering, not the two named
priorities, since the planner works the named concepts first and the remainder in the order the
ranking gave — so it is measuring the value of the full ranking, which is more than the report shows
the learner.

### What the reproducibility figure does not mean

This section exists because the headline number is the one most likely to be over-read, including by
us. Three qualifications, each of which makes the instrument look worse and each of which is true.

**The measured re-sit is not a real re-sit.** The two sittings share a large fraction of their items:
about 70% on the adaptive arm and **about 82% on the multistage form a learner is actually served**,
measured over 24 worlds at 50 learners a cell, against roughly 76.6% reported by the campaign at full
depth. A re-sit that reuses four items in five is measuring response noise on a nearly identical
form, not parallel-form reproducibility. The published figure is therefore optimistic, and the honest
statement of what it bounds is: *if the same learner answered a very similar form again on a
different day, this is how often the plan would survive.* A genuine parallel-form study needs
disjoint forms and has not been run.

**Much of the agreement is not about the learner.** Two sittings taken by *different* learners agree
substantially more often than ground truth does. Pooled across the grid the campaign reports 42.9%
cross-learner agreement against 27.8% on ground truth; an independent 24-world replication at 50
learners a cell reproduced the ground-truth floor at 26.8% and put the reported figure at 33.2%
(adaptive) and 37.6% (MST). The absolute number depends on how learners are paired; the excess over
truth is the stable quantity and it is about 10 points. That excess is the price of the leverage
weighting, and it is concentrated in the two heaviest concepts: at full strength FC5 takes 52% of
reported slots against 40% in truth, and FC1 43% against 34%.

The mirror image is FC10, which is under-reported at every weighting strength — roughly 5% of
reported slots against about 12% in truth. This is worth separating from the weighting argument
because it is **not** caused by the weighting: FC10 sits at the flat 0.20 floor along with five other
concepts. It is the 40-item bank hole. A concept the form cannot sample deeply is a concept the form
is reluctant to name, and the fix is items, not arithmetic.

**Ordering is the least reproducible part, and ordering is what the product leans on.** Every figure
above is a set-membership criterion — does a named concept recur, is the true worst concept somewhere
in the top three. The instrument is markedly worse at saying which of two named concepts should come
first, and "which lesson first" is exactly the decision the initial queue is built from. The set is
what the document is entitled to claim; the order is a best guess presented as a starting sequence.

### Positional accuracy, and where it comes from

Two families of figure get confused here, so they are separated.

From the production harness, `fc-10` at 140 items, 24 worlds × 250 learners: the true worst concept
is inside the internal top three for **91.5% of learners pooled and 86.8% in the worst world** on the
adaptive arm, and 87.5% worst-world on the served MST form. The concept the learner is weakest in
ignoring leverage entirely is in the top three for 78.0%.

From the earlier standalone model, and **not** re-measured in the campaign: the true worst concept is
ranked first about 52% of the time, and the three truly weakest concepts have a combined position sum
of 8.2 with a median of 8, where 6 is perfect and 16.5 is random — recovering 79% of the distance
from random to perfect. A median of 8 means a typical learner's three real weak areas land at roughly
positions 1, 2 and 5. These are the most intuitive figures in the document and they are the ones with
the weakest provenance; they are retained because the direction is corroborated by the harness and
flagged because the exact values are not.

The product consequence is unchanged and is now supported by two independent measurements: the named
priorities should not be presented as equally weighted. The first one is the reliable one.

### `certainty` was redefined, because the old measure said nothing

The previous draft treated per-concept read confidence as a solved detail. It was not. The old
measure was derived from posterior decisiveness — how far the posterior has committed to one side of
the weakness threshold — and that quantity saturates by design. It reported exactly 1.000 for 76% of
production-shape reads in simulation and 68% of 190 reads measured off live sessions, which left both
of its consumers unable to tell a well-estimated concept from a borderline one. Since those consumers
are the uncertainty range shown to the learner and the step size a mastery seed is allowed to take,
the channel was carrying a claim it could not support.

It is now **the share of the prior's variance in the concept's gap that the responses removed**,
squared because it is a ratio of variances, measured against a prior spread derived from the engine's
own prior rather than tuned. Over 3,200 simulated reads at the production shape it runs **0.45 to
0.99 with a median of 0.80 and no mass at either endpoint**.

One consequence is worth stating because it is not what a reader expects a confidence number to do.
It is high when the evidence is plentiful *and* high when the concept sits far from the weakness
threshold, and lowest for borderline concepts. Reading a single concept in isolation at the
production block length of 14 items, the value runs 0.991 at 0 correct, 0.794 at 7 correct, bottoms
out at 0.755 around 9 correct, and climbs back to 0.983 at 14 correct. That U-shape is correct for
what the number is used for — how far the magnitude of the gap could still move — but it means
`certainty` must not be read as "how much did we learn about this concept". Downstream, mastery seeds
built from these reads span roughly 0.10 to 0.32 against a flat default of 0.20, inside the
asymmetric floor of 0.05 and cap of 0.40.

Nothing about this channel touches the plan. Selection, stopping and ranking read `gap` and
decisiveness and never read `certainty`, and a test pins that the reported ordering is exactly the
leverage ordering, so no change here can move which concepts are named.

### The diagnostic is out-informed within a week, and that is the point

The diagnostic supplies 14 items per concept. A single lesson supplies about 18 questions, and
because lesson → cluster → concept is perfectly nested, all 18 land in one concept. **One lesson
out-measures the diagnostic for that concept**, and globally 140 items is about eight lessons of
volume — mid-week-one for a 15h/week learner.

That does not make it irrelevant, because the main system's evidence is *conditional on what the
diagnostic chose*. After eight lessons you hold 144 questions of evidence about eight lessons and
none about the other 106. The diagnostic is not competing on volume; it decides where the system will
ever look.

Which is why the residual error that matters is not misranking but non-coverage. A misranked concept
is corrected the moment the learner reaches it. A concept the learner never reaches is never
corrected. From the standalone coverage model:

| Concepts the learner covers | True worst never seen | Of their true worst 3, never seen |
| --- | --- | --- |
| 3 / 10 (≈40h runway) | **10.4%** | 0.77 |
| 5 / 10 (≈60h) | 2.4% | 0.26 |
| 7 / 10 (≈90h) | 0.5% | 0.08 |
| 10 / 10 (≈120h+) | 0.0% | 0.00 |

For anyone covering seven or more concepts the residual is half a percent and the correction loop
genuinely does clean up the diagnostic's mistakes. **The exception is the severely time-constrained
learner**, and it is the same double bind as the runway analysis: the learner for whom the diagnostic
matters most is the one with the least time for its errors to be corrected. The system is therefore
not fully self-repairing, and the 10.4% is the number to quote when someone says that it is. Week-one
probing of unsettled concepts is the only mechanism that deliberately samples *outside* the selected
set, and therefore the only thing that reduces it.

### A correction retained from the previous draft

We once justified 14 items per concept partly on hierarchical pooling. **Pooling does not improve
ordering.** Uniform shrinkage toward a common mean is a monotone transformation, so it leaves rank
order exactly unchanged, and simulation confirmed identical ranking metrics with and without it.
Pooling improves the *estimates* — Sinharay's augmented-subscore result stands — and it helps ordering
only where allocation is uneven. It is not a justification for balanced stages. The campaign added a
refinement: pooling's advantage over an unpooled estimator is itself contingent on uneven allocation,
leading 69.9% to 67.7% under the contention-weighted selector and trailing 63.4% to 67.5% under an
even split.

---

## Part III — The system in six layers

### Layer 0 — Intake, before any items

Ninety seconds, no assessment: target exam date, target score, weekly hours; coursework taken and
self-reported grade per science area; any prior MCAT or full-length score.

This is the highest-yield measurement per unit of learner effort in the entire system.
Scott-Clayton (2012) `[agent-read]` found that adding placement-test scores to a model already
containing high school GPA raised explained variance by **~6 points in math and under 2 in
English**, and that background alone outperformed the test alone in both subjects.

Its second job is to supply an empirical prior. Matteucci & Veldkamp measured what a
background-variable prior buys: **~28% fewer items at θ = ±2, essentially nothing at θ = 0**, and
no benefit past about 20 items. That distribution suits us exactly — the learners we most need to
route correctly are the ones far from average. Kim & Yoo `[read]` go further and found that good
prior information about the population **could replace the routing stage entirely**.

### Layer 1 — The diagnostic: fixed-form, sectioned, multistage

**Multistage, not item-level adaptive.** Five reasons from the literature, below, and one
measurement that qualifies them: Part II found that multistage delivery costs about six points of
worst-world reproducibility against item-level adaptive selection at equal length, of which the
adopted design recovers most. The literature reasons are why the format was chosen; the measurement
is what it costs, and both belong in the argument.

1. **Routing survives bad calibration.** Zheng et al. `[agent-read]` found simple number-correct
   routing performed as well as θ-based routing. Our bank is uncalibrated; adaptivity that does
   not depend on item parameters is worth a great deal.
2. **Item-level adaptive selection is unsafe in our regime.** Chang, Chiu & Tsai `[read]` found
   that at 8 attributes with a 100-person calibration, every parametric selection rule fell below
   0.20 pattern recovery and "did not behave much differently from a random selection method."
   Nonparametric selection held at 0.63–0.67.
3. **It still beats fixed forms on the decision.** Zheng's 21-item MST beat a 30-item linear form
   on correct classification (.745 vs .703) while having *worse* RMSE — it won the decision and
   lost the measurement, which is precisely the trade we want. Kim & Yoo found cognitive-diagnostic
   MST beat a conventional 28-item test by about 0.2 in pattern classification.
4. **Answer review stays possible.** The substantive user objection to item-level CAT is the
   inability to revisit an answer. MST adapts between blocks, so review within a block survives.
5. **Content balancing is tractable.** Reese et al. `[agent-read]` found content constraints erode
   the adaptive advantage enough that they call the standard efficiency claim "rarely practical."
   A design that assumes balancing from the start does not pay that tax later.

**Length: 140 items, 14 per concept.**

The previous draft derived this budget from the operation axis at 20 items per operation. That
derivation is withdrawn — the operation axis is not measured — and the length now rests on the
sweep in Part II: across 60, 90, 140 and 200 items on both candidate axes, 200 buys an amount of
net value indistinguishable from zero at 250 learners a cell, costs 1.6 additional hours of the
learner's runway, and draws FC10's 40-item pool close to empty in a single sitting. 140 and 200 are
equivalent on the measurement and 140 wins on operations. That is the whole argument, and it should
not be dressed up as more than that.

Two lower bounds worth holding onto. Cheng & Morgan `[read]` give the diminishing-returns curve
directly: classification accuracy .74 at 12 items, .79 at 20, .80 at 40 — the elbow for a *single*
decision is at 20. Kruyen's floor for individual-level decisions is 40 items. Guo & Zheng
`[agent-read]` report the only length-by-dimension-count table in the literature: under a
Shannon-entropy stopping rule, 8 attributes reached PCCR .974 in **20.0 items**, versus 33.8 items
for a posterior-threshold rule reaching only .926.

**Structure: seven 20-item blocks, three difficulty modules per stage after the first.** This is
`MST_140_RECOMMENDED` in `packages/policies/src/diagnostic-mst.ts`, and it is what the app serves.
Every learner takes the same 20-item routing block. Their number-correct routes them to one of
three difficulty levels for the next block, and so on through six routing decisions. Modules at a
stage differ in difficulty and never in content, so the coverage guarantee holds on every route
through the panel rather than on average.

Three parameters are not defaults and each was measured rather than picked:

*Twenty items a block.* Boztunç Öztürk found routing modules should not fall below 15 items. Part II
found stage count is worth almost nothing on its own, so there is nothing to trade a shorter block
against; 20 is the smallest block that stays comfortably above the review floor while leaving six
boundaries for the two levers that do matter.

*Routing cuts at `[0.45, 0.75]` rather than equal mass.* Above equal mass, deliberately, for the
reason Part II gives: re-aiming them downward onto the realised cohort evens out module occupancy
and makes accuracy worse in all 24 worlds.

*Contention-allocated slots.* The six stages after the router spend more of their slots on the
concepts still contesting the reporting cut, within a floor and a cap around an even share. This is
the only thing in the design that adapts *allocation* rather than difficulty, and Part II found
allocation is where about 80% of MST's deficit against item-level selection sits. It costs one real
property: a contention-allocated form is a function of the responses, not just of which modules were
taken, so a sitting can no longer be rebuilt from its route alone. What it guarantees per concept is
correspondingly lower than the balanced deal — 8 items rather than 14 — and the design quotes the
guarantee rather than the typical case, because a design that advertised the even share would be
promising coverage it does not deliver.

**Split across sittings, by block.** The first block returns a start point immediately; later blocks
arrive after the learner has done a lesson or two. This decouples time-to-value from item budget at
zero measurement cost. It does **not** produce a parallel-form retest, and the previous draft's claim
that it does was wrong in a way worth correcting: successive blocks are drawn from the same pools and
the two sittings the harness measures share roughly 82% of their items. A genuine parallel-form study
requires forms built to be disjoint, and that is a separate piece of work listed in Part V.

**Fixed-length blocks. No variable-length stopping on posterior confidence until the bank is
calibrated.** Sun et al. `[agent-read]` found calibration error causes exactly this rule to
terminate early: relative test efficiency — how much the test overstates its own information —
reached **45.5** for DINA with low-quality items, and was still 8.4 with high-quality items.
Fixed-length blocks are structurally immune.

**Items should be hard, and the framing should say so.** Bjork & Bjork `[unverified]` on desirable
difficulties, plus the fact that maximum information for four-option items sits near 68% correct.
Tell the learner up front that missing about a third is expected and informative. Lowering
difficulty to manage anxiety trades away both measurement precision and learning value; the honest
alternative is to keep the difficulty and fix the framing.

**A genuinely costless "not sure" option.** Baldiga `[read]` found that with no penalty for a
wrong answer, *every* test-taker answered *every* question and the differential-skipping gap
vanished entirely; introduce any perceived cost and it returns, correlated with gender rather than
knowledge. So: make it free, say it is free, and treat the response as a separate observation
useful for routing and metacognition rather than folding it into the ability estimate.

### Layer 2 — Inputs the diagnostic requires to succeed

This is the specification a content or data team can work against. It is stated for the full crossed
design rather than for the delivered one, because it is the standing requirement and because
narrowing it to what the content axis alone needs would hide how much of it is unmet. **What the
shipped instrument requires is only the first row of table A, item C, and item E.** Everything to do
with the operation label, the crossed cells and the Q-matrix conditions on a decision to build the
second axis, and is listed here as a specification rather than as a blocker.

The one Layer 2 requirement the shipped instrument does not meet is C. It runs today on expert
difficulty tags alone, which is why Part II's figures are conditional on an assumption grid.

**A. Item labels — three axes that vary independently.**

| Requirement | Status | Gap |
| --- | --- | --- |
| One content FC per item | derivable via lesson → FC | 16 lessons carry no FC (correctly — they are skill lessons) |
| One operation per item | **missing for 59% of bank** | 1,248 SIRS2 items undifferentiated |
| Difficulty independent of operation | **violated** | SIRS1 100% DOK1, SIRS2 95% DOK2, SIRS3 88% DOK3 |
| Single-attribute loading | satisfied | except QUANTIFY, which is compound by definition |

**B. Q-matrix completeness.** Gu & Xu `[read]`: each attribute needs an item that isolates it and
at least three items total. Single-KC loading satisfies isolation by construction. The binding
constraint is the crossed cell coverage — 14 of 48 content × skill cells currently empty or under
ten `[measured]`, worsening to 84 cells after the SIRS2 split.

**C. Difficulty estimates, from the cheapest available sources first.** Wauters et al. `[read]`
measured the correlation of each cheap proxy against IRT-calibrated true difficulty:

- **Learner self-ratings: r = 0.88** — significantly better than experts, and the cheapest
  unexploited signal we have. One tap after an item.
- **Elo: r = 0.85** — available immediately, updates continuously.
- **Proportion correct: r = 0.90.**
- **Expert tags: r = 0.80** — the prior, not the answer.

Read this against Chang, Chiu & Tsai: their parametric methods failed because parameters
*estimated from tiny samples* are noisy. Expert-assigned priors at r = 0.80 are plausibly better
than a 30-person calibration. We are in an untested regime, not a known-broken one.

**D. Response volume for online calibration.** Wang et al. 2021 `[agent-read]` measured Q-matrix
recovery per newly seeded item: **0.66 at 100 responses, 0.80 at 200, 0.96 at 800**. Adaptive
examinee allocation beat random at every sample size. Their design assumes an existing calibrated
bank to seed into, which we do not have — so the first cohort is genuinely cold and must be
treated as such.

**E. A population prior.** From intake (Layer 0) plus accumulated cohort data. Kim & Yoo found a
good prior can substitute for the routing stage; Matteucci & Veldkamp quantify the benefit as ~28%
fewer items in the tails.

**F. Item volume per cell.** For a 10 × 7 crossed design with difficulty variation inside each
cell, plus exposure control across cohorts. EVIDENCE at 86 items is roughly 3–4× short.

### Layer 3 — Outputs the diagnostic is allowed to produce

**What it emits:**

1. **Two named priorities**, in order, with the first presented as the more reliable. Not three;
   Part II is the derivation.
2. **Ten content bands (FC1–FC10)**, shown as ranges with visible uncertainty, never as point
   scores. Every concept gets a gap and a `certainty`, including the ones that missed the reported
   cut, so narrowing the list from three to two narrowed the *report* and not the *read*. Estimated
   with hierarchical pooling, which is what makes ten dimensions affordable at this budget —
   Sinharay's augmented subscores had added value at 10 items where standalone subscores had none,
   and Xi, Tu & Cai `[agent-read]` measured the higher-order gain directly: pattern classification
   .876 → .918 at 6 attributes on a 12-item test, with the advantage *growing* with dimensionality
   and collapsing with length.
3. **A curriculum entry point and an initial queue ordering** over all ten concepts, of which the
   learner sees the first two named.
4. **An explicit unsettled list** — concepts that missed the cut *and* remain unresolved *and* sit
   close enough to the cut that more evidence could promote them. All three conditions are
   load-bearing. A concept demoted purely by the reported count is well measured and must not appear
   here, because this list means the opposite of that.
5. **Capped, asymmetric mastery priors** for every lesson under every sampled concept, which is how
   the concepts the report stopped naming still reach the learning system.
6. **A word-level confidence label**, never a number.

**No overall altitude estimate is emitted today.** The previous draft listed one first and called it
the reliable part. That remains true of the underlying literature — Martin, McBride & Weiss `[read]`
obtained their 9-versus-17-item efficiency result on a strictly *unidimensional* test — but the
instrument as built reports per-concept gaps and a ranking, and there is no calibrated scale for an
altitude figure to live on. It is listed in Part V rather than claimed here.

**No operation reads.** Four of the seven operations do not exist as labels. Whether they are
statistically distinct is unanswered, and until it is answered the design must not imply that the
instrument measures how a learner reasons as opposed to what they know.

**What it must not emit:** a per-KC mastery map across 422 components; point scores on any
dimension; a rank ordering between dimensions whose posteriors overlap; or any claim of
completeness. Wang, Song et al. `[agent-read]` give the reason for the ranking restriction
numerically — at 5 items, attribute-level accuracy is .838–.897 while pattern-level accuracy is
**.530**; at 10 items, .913–.953 versus .747. Per-dimension reads are forgiving; full-pattern
claims are not, and a rank ordering is closer to a pattern claim than to a set of independent
reads.

**A hard product constraint follows from the item budget.** If a dimension does not have ~20 items
behind it, we do not display a number for it. We can display a recommended order and a starting
point without ever showing ten scores. This is not a workaround — displaying dimension scores that
cannot survive Sinharay's added-value test is the exact failure his literature documents, and
choosing not to display them is what buys us the shorter test.

**And a note on what `certainty` is and is not**, since it is the one number attached to every
concept and it is easy to misread. It is the share of the prior's variance in that concept's gap
that the responses removed, running 0.45 to 0.99 with a median of 0.80 across production-shape reads
`[simulated]`. It answers "how far could this magnitude still move", which is what the uncertainty
range and the mastery-seed step size both need. It does **not** answer "how much did we learn about
this concept": it is high both when the evidence is plentiful and when the concept sits far from the
weakness threshold in either direction, and it is lowest for concepts sitting near the boundary. Any
consumer that reads it as an evidence count will be wrong about exactly the borderline concepts it
most wants to be right about.

### Layer 4 — The contract with the learning system

This is where diagnostic error becomes survivable, and it is mostly already built.

**The governing principle: the diagnostic has no authority over mastery state.** Look at what
`MASTERY_CONFIG` actually accepts. The lowest rung, `independent`, requires two distinct question
families answered independently. `retained` adds transfer evidence spanning two change dimensions,
a delayed attempt at least 48 hours later, and mixed practice. `strong` adds integrated-passage,
timed, and protected evidence. **A diagnostic response satisfies no recipe** — it is not tagged as
any of those evidence kinds, and one item cannot clear a two-family minimum. No diagnostic result,
however wrong, can mark anything as known.

So a diagnostic error can only ever change *queue position*, never coverage. The worst a
false-strong read does is push a topic later, where it must still be taught and must still earn
its evidence.

**Five active correction mechanisms sit on top of that containment:**

| Mechanism | Where | What it corrects |
| --- | --- | --- |
| Fail-closed acceleration | registry `R14-ACC-01`: `currently_authorized_bypass: false`, `fail_closed: true` | Skips it cannot verify — failure action is "use required delivery/revisit or exact remediation" |
| Week-one probing of unsettled reads | `recall-schedule.ts` | Dimensions the diagnostic explicitly declined to settle |
| FSRS seeding as prior, not verdict | `recall-schedule.ts` | Misjudged review cadence; first self-rating overrides, and FSRS never awards mastery |
| Planner re-sorting | `planner.ts` — prerequisite repair and freshness outrank new learning | Wrong ordering; topics get pulled forward when prerequisites fail |
| Evidence expiry | 45 days general, 21 for demanding kinds | False-strong reads that would otherwise persist silently |

**On seeding the BKT mastery tracker — do it, but weakly, and do not justify the diagnostic with
it.** The mastery workstream runs BKT with a flat P(L)₀ = 0.20 for everyone, and the obvious move
is to replace that with the diagnostic's read. We modelled it `[simulated]`:

| Prior | decision accuracy | false-mastery | items to decision |
| --- | --- | --- | --- |
| Flat 0.20 | 97.0% | 2.0% | 4.03 |
| Diagnostic-informed | 96.6% | 3.1% | 3.60 |
| **Oracle — true knowledge** | 96.6% | 3.0% | **3.49** |

The oracle row is the point. **A prior with perfect knowledge saves only 0.53 items per KC**, and
the diagnostic captures 0.43 of that — roughly 80% of the theoretical ceiling. This is a property
of BKT, not of the diagnostic: with a threshold rule and informative per-item evidence the prior
washes out after two or three observations. The result held under a conservative retuning
(T = 0.05, S = 0.10) and with the learning term removed entirely.

Two consequences. Across 422 KCs the saving is ~180 items against a diagnostic costing 140 — near
break-even, so **BKT seeding cannot justify the diagnostic on its own**. And the informed prior
moves errors in the wrong direction, raising false-mastery from 2.0% to 3.1%, which is exactly what
fail-closed acceleration and upward tie-breaking exist to prevent. **Seed asymmetrically**: let a
weak read lower the prior freely, cap how far a strong read can raise it (~0.4). The diagnostic's
real contribution to the learning system is upstream of BKT entirely — which lessons run, in what
order, with which scaffold — and none of that is visible in the table above.

**Re-measured on the served form, and both saving figures in that table are gone** `[simulated]`.
The table predates the `certainty` redefinition and multistage delivery. Re-run on
`MST_140_RECOMMENDED` over 250 learners — 24,500 lesson seeds, the same learners and seeds the
reproducibility bars use, against a two-state learner BKT is *correctly specified* for — the seed
moves items-to-mastery-decision for **7 of 24,500 lesson-learner pairs (0.029%)**, every one by
exactly one item and every one **slower**. False mastery is **3.1% either way**. So the 0.43-item
saving does not reproduce; the current figure is 0.000 items for 0.0 points of false mastery, and the
~180-items-across-422-KCs saving is ~0. The mechanism is arithmetic, not a property of the read: a
correct answer is worth `ln((1 − slip) / guess)` ≈ **1.37 nats** of log-odds, three of them reach 0.95
from any prior at or above **0.124**, and seeded priors span **0.100 to 0.307** (median 0.187) — a band
**1.00 items of evidence wide**, with only 0.3% of it below that boundary.

**The oracle row is worse than reported, not better, and the cap is why.** A prior that *knows*
whether the learner is mastered, held inside the shipped floor of 0.05 and cap of 0.40, comes out
**0.07 items behind** the flat default: two all-correct answers need a prior of **0.454**, so raising
a mastered learner to the cap changes nothing, while dropping everyone else to the floor costs them an
item. There is therefore no ~0.5-item ceiling for the diagnostic to capture 80% of — inside the
current bounds the ceiling is negative, and only removing the cap reaches **+0.95 items**. Nor is the
read at fault: it orders truly-mastered lessons above unmastered ones at **AUC 0.76** on that learner
and **0.92** on the graded one. The seed carries signal the mechanism is not permitted to spend.

**What survives, and where the seed could earn something.** "Seed asymmetrically, weakly, and do not
justify the diagnostic with it" holds unchanged and is now better supported — the write is
fail-closed, costs nothing, and buys nothing measurable on this dimension. What changes is that no
improvement to the *diagnostic* can alter that, so the only measured route runs through the mastery
threshold, which is the mastery workstream's decision and not one taken here. Lowering it to **0.86**
— the first value below the wide dead band around 0.95, since `P(L)` arrives in jumps of 0.57 / 0.86
/ 0.97 — saves 0.58 items on a flat prior for 2.7 points of false mastery, while doing it *with* the
seed saves 0.32 items for 0.9 points: **1.7× more items per point of false mastery**. That is the one
place the seed measurably changes an outcome. `packages/policies/src/mastery-seed-value.ts` holds the
measurement and `mastery-seed-value.test.ts` pins the arithmetic behind it, options table included.

**Test-out gates handle lesson-level skip decisions** — 3–5 targeted items at the moment the
decision arises, rather than inferring it from a diagnostic administered weeks earlier. This is the
correct resolution of the coarse-measurement / fine-skipping tension: measure and report at coarse
grain, decide skips at fine grain with fresh local evidence.

**Continuous refinement is where the real profile gets built.** Every lesson check, recall review,
and practice question is an item response, double-labelled with both an FC and an operation. Over
a few weeks this dwarfs the diagnostic in volume. Model it with logistic regression over count,
recency, and difficulty features — Gervet et al. `[read]` found this leads on datasets of moderate
size and is orders of magnitude cheaper to fit and easier to inspect than deep alternatives. Their
more uncomfortable finding, that the expert-designed domain model adds little predictive power,
argues the 422-KC taxonomy should justify itself as a *sequencing* device rather than a predictive
one.

**What the loop does not fix, stated honestly.** This is the most important paragraph in Layer 4,
because the containment argument above is strong enough that it invites the conclusion that
diagnostic quality does not matter much. It does not survive these three.

- **A concept the learner never reaches is never corrected.** Every mechanism above corrects an
  error *at the point the learner arrives at the affected content*. For a learner covering three of
  ten concepts, the true worst concept is never encountered at all 10.4% of the time `[simulated]`.
  The loop cannot repair what it never touches, so the system is not self-repairing in the case
  where repair matters most.
- **Ordering errors are cheap at four months and expensive at four weeks.** The loop needs time to
  run. Short-runway learners get less correction, so the diagnostic carries more weight for exactly
  the population it has the least time to serve.
- **The loop's value scales with engagement.** A learner who churns in week one received the
  diagnostic and nothing else. None of these mechanisms ever ran for them. That is the real argument
  for the diagnostic being genuinely good rather than merely correctable.
- **Should the operation axis ever be built, it will have no clean correction signal.** Content
  evidence arrives unconfounded because a lesson gate is scoped to its content. Operation evidence
  would arrive entangled with whatever the learner was assigned — their EXPLAIN performance only ever
  observed on the topics currently in their queue. A diagnostic is the only place an unconfounded
  cross-operation read can be taken, which is an argument for building that axis and not an argument
  that the current instrument delivers it.

### Layer 5 — Calibration bootstrap

Built alongside Layer 1, not after. Without it the system stays in the regime where Chang, Chiu &
Tsai found adaptive selection performing at chance.

- **Seed uncalibrated items into low-stakes slots only** — practice and recall, never routing.
- **Run proportion-correct and Elo continuously** (r = 0.90 and 0.85 against true difficulty).
- **Collect learner difficulty self-ratings.** One tap, r = 0.88, better than experts. The cheapest
  unexploited signal available to us.
- **Treat expert tags as priors, not answers** — Wauters' own recommendation.
- **Gate promotion.** An item does not influence routing until it clears a response threshold; the
  Wang et al. curve suggests ~200 responses as the point where recovery reaches 0.80.
- **Account for calibration error in the estimator.** Fink, König & Frey `[agent-read]` found
  ignoring it biased ability estimates by up to **40% of a standard deviation**, that calibration
  sample size had the largest main effect on bias, and that a fully Bayesian treatment cut bias by
  **84%** in the most extreme conditions.

### Layer 6 — Guardrails

- **Asymmetric loss: when uncertain, place up.** CAPR found bump-ups improved college-course
  passage by 8 points while bump-downs harmed students badly enough that the research program
  stopped permitting them. Scott-Clayton found severe under-placement both more common and more
  costly than over-placement.
- **Never place someone below where a simple rule would.** A sophisticated model that demotes a
  learner relative to a naive baseline is doing harm, not exercising caution.
- **Measure decision accuracy and consistency, not posterior width.** Three separate papers found
  adaptive designs winning on classification while losing on RMSE. Optimising the wrong metric
  leads to the wrong design.
- **Subgroup checks on placement outcomes.** Scott-Clayton found the choice of screening instrument
  significantly changed the racial and gender composition of course placement even though nothing
  in the instrument was designed to do that.
- **Fit statistics will not warn us.** Maas et al. found RMSEA2 stayed below cutoff in exactly the
  degraded conditions we are at risk of — too many attributes for the item count. We cannot rely on
  model fit to tell us the taxonomy is too fine.

---

## Part IV — Why this beats a full-length practice test

The market-standard MCAT diagnostic is a full-length practice exam: 230 items, 6h15m of testing,
roughly 7.5 hours with breaks, administered before instruction begins. This section is the argument
against that practice, constructed so that it holds for a vendor **who already owns a library of
calibrated full-length forms** and would pay nothing to administer one. Build cost is deliberately
excluded from every claim below.

### Claim 1 — A full-length is a prediction instrument being used as a placement instrument

These are different jobs with different optimisation targets. A full-length is designed and equated
to produce one precise number on a known scale. It is extremely good at that. But the day-one
question is not "what would I score," it is "what should I do on Monday," and a scaled score does
not answer it. Section scores do not either: knowing you scored 125 on Chem/Phys tells you the
section, not the concept, not the operation, and not the lesson.

The instrument is being asked for a decision it was never built to support, and the fact that it is
the *best available* score predictor does not make it a placement instrument. Those are separate
claims and the industry conflates them because the same asset happens to be lying around.

### Claim 2 — Passage structure caps diagnostic resolution regardless of test length

This is the strongest technical claim and it is the one a vendor cannot engineer around by adding
items.

A full-length looks like it should support a fine-grained profile: 230 items across 10 foundational
concepts is 23 per concept, comfortably above Sinharay's threshold. It does not, for two reasons.

**Items within a passage are not independent observations.** Three-quarters of MCAT items hang off
a shared passage, and items on the same passage share variance from passage comprehension, topic
familiarity, and reading speed. This is the classic testlet / local-item-dependence problem
(Wainer & Kiely; Yen's Q3; Bradlow, Wainer & Wang) `[unverified — well-established in the
psychometric literature but not retrieved in this project's sweep]`. The consequence is that
effective test length is materially shorter than nominal test length, and reliability estimated
under a local-independence assumption is overstated. A 230-item passage-based test carries
meaningfully fewer than 230 independent observations.

**Content is dictated by the passage, not by the measurement design.** This is the part that has no
workaround. When your unit of assembly is a 500-word passage that generates six items, you cannot
hold ten concepts to a per-concept item guarantee, still less balance them by difficulty within
concept — the passage decides what those six items are about. You can balance at the section level,
which is why full-lengths report section scores, and that is approximately the finest grain the
format supports. Reese et al. `[agent-read]`, working on an LSAC multi-stage *testlet* design, found
content constraints erode the adaptive advantage enough to call the standard efficiency claim
"rarely practical" — the same tension, one level down.

An item-level assembled diagnostic has no such constraint. Every item is independently placeable
into a concept × difficulty cell, and would be placeable into a concept × operation × difficulty
cell if the operation labels existed. That is a structural advantage of the format, not of the
vendor, and it is worth being precise that we currently exercise two of those three dimensions.

### Claim 3 — Section subscores are close to redundant with the total score

Sinharay `[agent-read]` examined 25 operational tests and found **16 had no subscore with added
value at all**. The 9 that did averaged at least 24 items per subscore *and* required disattenuated
intercorrelations below 0.85. MCAT section scores are highly intercorrelated by construction — they
measure overlapping science reasoning on overlapping content.

So the four section scores a full-length reports are, in the most likely case, four numbers that
substantially restate one number. The vendor is not delivering four-dimensional information; they
are delivering one dimension displayed four times, and the learner reasonably but incorrectly
treats the differences between them as signal.

The fix is not more items. It is either coarsening (report the total honestly) or restructuring the
measurement onto dimensions that are actually distinct and that correspond to units of instruction —
which is what a concept-grain item-assembled design does, and which the passage format cannot
support. Whether our own ten concepts clear Sinharay's 0.85 intercorrelation threshold is an open
question that only real response data can answer, and Part VI lists it as a measure to track. We are
making a structural argument about the format here, not claiming our own dimensions have passed the
test we are applying to theirs.

### Claim 4 — Reporting grain is a larger lever than test length, and it is free

Cheng & Morgan `[read]`: collapsing five reported performance categories to pass/fail improved
classification accuracy **more than doubling the test length did**. And their length curve is
brutal on the assumption that more items buy proportionate accuracy — .74 at 12 items, .79 at 20,
.80 at 40. Going from 20 to 40 items bought one point.

For a vendor this is the most immediately actionable finding in the whole literature. It says the
lever they are pulling — administer more items — is the weak lever, and the lever they are not
pulling — decide carefully what grain you are entitled to report — is the strong one and costs
nothing. A 230-item test reporting five inflated categories per section is making the same mistake
twice.

**Our own campaign reproduced this, and it is the one place where we can put our own number next to
the literature's.** Going from 140 to 200 items — a 43% increase in length and 1.6 hours of the
learner's time — moved net value by an amount indistinguishable from zero. Going from three reported
priorities to two, which costs nothing and takes one line of code, moved worst-world reproducibility
from below the bar to 88.0% `[simulated, fc-10, 140 items, 24 worlds × 250 learners]`. We spent
considerable effort on the weak lever before measuring the strong one, and a vendor reading this
should take that as the transferable finding rather than the specific figures.

### Claim 5 — Day one is when a full-length measures the intended construct worst

A full-length administered before instruction is contaminated by three sources of variance that
have nothing to do with content knowledge: unfamiliarity with the item format, absence of any
pacing strategy, and unpracticed endurance across a 7.5-hour sitting. All three shrink substantially
by week six.

This produces an unattractive conclusion for the standard practice. **The same form, administered
later, is a better measurement of the same construct.** Using it on day one spends the most
precisely equated asset in the vendor's library at the single point in the learner's timeline where
its signal-to-noise ratio is worst — and where the resulting number is most likely to be read as a
verdict about the learner rather than about their preparation.

The fatigue point deserves separating out, because it is the same property reading in opposite
directions depending on purpose. A learner who knows FC4 but degrades in hour six gets a poor FC4
read if those items land late. For score prediction, that degradation is signal — the real exam is
7.5 hours. For diagnosis, it is noise contaminating exactly the estimate you need. One instrument
cannot optimise both, and a vendor who uses one form for both purposes is accepting the diagnostic
cost silently.

### Claim 6 — Staged delivery decouples time-to-value from item budget at zero measurement cost

An MST diagnostic is assembled from discrete modules, so a learner completes one 20-item block in
about half an hour, receives a starting point, and begins studying the same day. The remaining six
blocks interleave with early lessons.

A full-length cannot be split without destroying the thing it is for. Its validity as a score
predictor depends on being taken under exam conditions in one sitting, including the fatigue.

So the comparison is not 3.5 hours versus 7.5 hours of total seat time — that difference is real
but modest. It is **25 minutes to first actionable output versus 7.5 hours**. For any vendor with a
funnel, that is an activation argument before it is a measurement argument, and it requires giving
up nothing: the items are the same items, the total budget is the same budget.

### Claim 7 — Adaptive routing reallocates the budget toward the learners who need it, with a caveat we should state ourselves

Martin, McBride & Weiss `[read]` is the empirical origin of the "adaptive needs half as many items"
claim: 9 adaptive items matched the alternate-forms reliability of 17 conventional; 11 adaptive
matched the validity of 27 conventional.

We should present the caveat alongside it, because a competent vendor will find it. The same
authors note that Kingsbury & Weiss (1980), testing the same Bayesian adaptive strategy on college
students, found conventional tests "achieved consistently higher validities," and attribute the
difference to range restriction — the college sample's ability distribution was narrow. Paying MCAT
preppers are pre-meds who have self-selected into a competitive pipeline, which is *more*
range-restricted than general college students. **The headline efficiency claim was obtained under
close to the opposite of our conditions**, and we should not lead with it.

What survives the caveat is narrower and still worth having: adaptivity reallocates items toward
dimensions where the posterior is still wide, which matters most for learners far from the cohort
mean. van der Linden `[agent-read]` bounds the benefit honestly — Bayesian selection clearly beats
maximum-information at 5 items, but by n = 10 there were "no systematic differences between the
five criteria." The machinery earns its keep in roughly the first ten items per dimension and
little thereafter.

Our own measurement narrows the claim further and in a specific direction. Part II found that
adaptive *difficulty* selection is worth well under a point across designs spanning 2 to 20 routing
decisions, while adaptive *allocation* — which concepts receive the items — carries roughly 80% of
the gap between multistage and item-level selection and is worth 3.5 to 6.2 points on its own. The
defensible form of Claim 7 is therefore about allocation and not about routing. A full-length
reallocates neither, which is the actual contrast; a fixed-form item-level test that reallocated
across concepts would capture most of what our adaptivity buys.

### Claim 8 — A placement decision does not need to be right; it needs to be correctable, and a full-length ships with no correction loop

This is the argument that most changes what a vendor would build. Our design tolerates diagnostic
error because the diagnostic is structurally forbidden from awarding mastery, acceleration
fails closed, unsettled reads are explicitly deferred to week-one probing, FSRS seeding is
overwritten by the first real self-rating, evidence expires on a 45-day window, and the planner
re-sorts continuously on prerequisite failure and freshness.

A full-length administered as a diagnostic is a one-shot verdict handed to a human to interpret.
There is no mechanism by which a wrong read is detected and reversed, because there is no
instrumented loop underneath it. The vendor's protection against misplacement is the learner
noticing and adjusting.

The design implication is general and does not depend on our architecture: **if you attach a
correction loop, you can afford a shorter and cheaper diagnostic; if you do not, you need the
diagnostic to be right the first time and no test length makes that true.** A vendor who takes only
one recommendation from this document should take this one.

### Claim 9 — Item-level assembly produces a prescription; four section scores produce a label

"You scored 126 in Bio/Biochem" is a label. "Your FC3 read is the weakest of the ten and here are
the eleven lessons beneath it, in order" is a prescription: it names what to do on Monday. A section
score cannot be turned into one, because a section is not a unit of instruction and nothing in the
curriculum is scoped to it.

**This claim is weaker than the version in the previous draft and the difference should be stated.**
That version argued for a *crossed* content × operation measurement — "your FC3 read is low and your
EXPLAIN read is low across every content area" — which additionally names the instructional scaffold
to apply inside the lesson. That is the stronger and more interesting claim, and we cannot currently
make it, because four of the seven operations do not exist as labels in the bank. What survives is
the weaker claim, which is still true and still not available to a passage-assembled full-length: at
concept grain the measurement lines up one-to-one with units of instruction, and at section grain it
does not.

A vendor evaluating this argument should note that the crossed version, if it were built, would be
the part that a full-length structurally cannot reach — and that we have not built it.

### What a full-length genuinely wins, and where it belongs

The honest concessions, which the argument above should be presented alongside:

- **Score prediction.** A properly equated full-length produces a number on the AAMC scale. Nothing
  in our design can credibly do this without concordance data, and the scaled score is what learners
  most want. This also feeds real planning decisions — how many months, which schools, when to sit.
- **Face validity.** Learners believe a full-length, and belief drives adherence.
- **Endurance and pacing.** Genuinely part of MCAT performance and genuinely unmeasurable in a
  90-minute block.
- **Blueprint coverage by construction.**

None of these are placement functions. All of them are checkpoint functions, and all of them are
better served at week 4 or 6 than on day 1 — when the learner is committed, format-familiar, and
the number is a progress measurement rather than a verdict. **The recommendation is not that
full-lengths are bad. It is that the industry uses its best checkpoint instrument as its placement
instrument, at the point in the timeline where it measures worst, in place of an instrument
designed for the job.**

---

## Part V — Next steps

**The previous draft opened this part by saying the blocker was the question data and not the
algorithm. That was right, and the measurement campaign has made it sharper rather than
overturning it.** The campaign closed the algorithmic questions: at 140 items on ten concepts the
engine is at the exact-posterior bound, which means further inference work is worth nothing and the
remaining levers are all in the bank, the reporting grain, or the downstream loop. What has changed
is which piece of bank work is critical path. The previous draft put the SIRS2 relabelling pass
first because it gated the operation axis and the operation axis priced the test length. Length is
now priced without it, so the relabelling pass gates a deferred feature rather than the shipped
instrument, and it moves down the list. The critical path is calibration.

**Step 0, which is not really a step: nothing below is blocked on more simulation.** The sweep in
Part II has been run, across four lengths, two candidate axes, both delivery arms, a 2-to-20-stage
family, five leverage strengths, three allocation policies and 24 assumption worlds. Another sweep
would produce another number about the same generative model. The next material fact about this
instrument has to come from a learner.

### Step 1 — Calibration bootstrap. The critical path.

Every quantitative claim in this document is conditional on a generative model of item behaviour
that has never met a response. Until items carry empirical difficulty and discrimination, the
worst-world figures in Part II are statements about our assumption grid and not about the
instrument, the routing cuts are aimed using expert difficulty tags that we have separately
established are confounded with the operation label, and no result here can be quoted externally.

Learner difficulty self-ratings are the highest-value unbuilt piece: one tap, r = 0.88 against true
difficulty, better than experts at 0.80. Elo (0.85) and proportion-correct (0.90) run continuously
alongside. Expert tags become priors rather than truth. Gate item promotion into routing at roughly
200 responses.

The acceptance criterion is not a calibration statistic. It is the first re-run of the Part II sweep
against empirical item parameters instead of the assumption grid, and the honest expectation is that
some of the ordering results in Part II will move. Designs that were separated by under a point
across 24 worlds are separated by nothing in particular, and the campaign's confident findings — the
length tie, the reporting-grain result, the allocation-versus-adaptation-points attribution — are
the ones with margins large enough to expect to survive.

### Step 2 — Instrument decision consistency on the first cohort, with genuinely parallel forms.

This is the number that tells us whether any of this works, and Part II is explicit that the harness
cannot produce it: the two simulated sittings share about 82% of their items, so what has been
measured is closer to response-noise reliability than to reproducibility, and it is optimistic by an
unknown amount.

The study needs forms built to be disjoint rather than two draws from the same pools, which is a
form-assembly task and not a measurement one, and it needs a sample large enough to estimate a
worst-case rather than a mean. Administer to a sample from cohort one and measure agreement on the
reported pair, on the top-three internal ranking, and on the first-named priority separately, since
Part II found those three degrade at very different rates. Collect it from cohort one rather than
retrofitting it; a reproducibility figure measured after the instrument has been tuned against
learner data is not the same measurement.

### Step 3 — Close the FC10 bank hole.

FC10 holds 40 items against a 181-item even share `[measured]`, it is under-reported at every
leverage strength in Part II, and a 200-item form runs it close to empty in a single sitting. It is
the one place in the current instrument where a concept's reporting rate is set by the bank rather
than by the learner. Authoring it to roughly 140 items — enough that the design's per-concept share
is drawable twice over — removes the constraint and is the only bank work the shipped instrument
needs.

### Step 4 — The relabelling pass. 1,248 items, one job. No longer critical path.

This was the critical path in the previous draft and it is not one now, because the thing it gates —
the operation axis — no longer prices the test or appears in the output. It remains the largest
single content task in the plan and the only route to the strong form of the vendor argument in
Part IV. Three things must happen in the same pass because they touch the same items:

| Task | Scope | Why it blocks |
| --- | --- | --- |
| Split SIRS2 into PREDICT / EXPLAIN / RELATE / QUANTIFY | 1,248 items (59% of bank) | Four of the seven operations do not exist as labels today |
| Decouple DOK from operation | same 1,248, plus audit of SIRS1/3/4 | SIRS1 is 100% DOK1, SIRS2 95% DOK2, SIRS3 88% DOK3 — difficulty and operation are currently the same axis, so neither can be measured |
| Resolve QUANTIFY's compound loading | QUANTIFY subset | It loads on IDENTIFY for relation-selection; either split it or commit to a two-attribute Q-matrix entry |

The DOK work is a *relabelling*, not re-authoring. Roughly 71% of IDENTIFY items already carry
near-neighbour distractor lures — a genuine difficulty mechanism sitting inside a population
labelled uniformly DOK1. The items are fine; the tags are wrong.

**Acceptance criteria:** a human-scored sample validating the operation split before the full pass
is accepted, and a post-pass cross-tab showing operation and DOK varying independently. If DOK
still tracks operation after the pass, the pass failed and step 2 cannot run.

### Step 5 — The distinctness pilot, if the operation axis is revived.

Whether the seven operations are statistically distinct determines whether an operation read exists
at all and whether the strong form of Claim 9 is available. It no longer determines the item budget;
that question was answered on the content axis alone. Fit the model on a few hundred learners,
compute disattenuated correlations among the seven, merge any pair above 0.85. PREDICT/EXPLAIN is
the most likely merge. Cannot start before step 4 — until DOK and operation vary independently, the
pilot cannot tell the operation axis from the difficulty axis.

### Step 6 — Author into the remaining coverage holes.

| Hole | Current | Needed | Blocks |
| --- | --- | --- | --- |
| FC10 | 40 items | ~140 | The shipped instrument; this is step 3 |
| EVIDENCE operation | 86 items, 3 empty content cells | ~300, spread across all 10 concepts | The operation axis only |
| Under-ten crossed cells | 11 of 48 | ≥ 10 each, with difficulty spread inside the cell | The operation axis only |
| CARS | 160 items for a section worth 25% of the exam | substantially more, on its own 3-skill axis | A CARS read; not currently attempted |
| Thin KCs | 22 KCs with fewer than 3 questions | ≥ 3 (Gu & Xu identifiability floor) | Lesson-grain reporting; not currently attempted |

Splitting SIRS2 turns 48 crossed cells into 84 and divides the one healthy column by four, so run
the operation-axis coverage audit again *after* step 4 rather than authoring against today's counts.

### Step 7 — An altitude estimate, if one is wanted.

The instrument reports relative standing across ten concepts and no absolute level. An altitude
figure needs a calibrated scale to live on and therefore cannot precede step 1. It is worth flagging
that it is a genuinely separate measurement problem and not a byproduct: the classic
adaptive-efficiency results that make a unidimensional altitude estimate cheap were obtained on
strictly unidimensional tests, and our form is assembled to balance content rather than to maximise
information about a single latent.

### Step 8 — Runway gating in the product.

The model exists and the policy follows from it, but the intake question that supplies available
study time drives nothing today. Above roughly 120 hours the diagnostic contributes nothing to
sequencing and the honest recommendation is the router block alone; below it, the full instrument.
This is the cheapest unbuilt item on the list and it is the one that most changes what a long-runway
learner is asked to sit through.

**Deliberately not on this list:** passage-set authoring for a full-length. It is a real and
valuable initiative — score prediction is the one thing this design cannot deliver — but it is a
separate content project on a separate timeline, and it should arrive as a week-4-to-6 checkpoint
product rather than competing with the diagnostic.

---

## Part VI — How we would know it works

Report **decision consistency**, not posterior width. Administer a genuinely parallel form and
measure how often the placement agrees. Cheng & Morgan's operational benchmark for a 40-item
adaptive placement test is CA ≈ .80 and CC ≈ .72; Mattern & Packman found real placement instruments
correctly place 58–84% of students. Those are the numbers to beat, and they are sobering.

**The bars currently in force, and what each one is measuring.** These are the thresholds encoded in
`packages/policies/src/diagnostic-simulation.ts` and asserted by the simulation suite. They are
simulation acceptance bars, not product claims, and nothing on this list has been measured on a
learner.

| Bar | Value | What it gates |
| --- | --- | --- |
| `testRetestReportedMstAt140` | 0.82 | Re-sit agreement on the reported set, on the MST form a learner actually takes. The instrument-level bar. |
| `testRetestReportedAt140` | 0.86 | The same criterion under item-level adaptive selection. Telemetry on how much delivery format costs, not a product bar. |
| `confidentCorrect` | 0.84 | Share of reads labelled confident that are in fact correct. Governs whether the confidence label may be shown. |

The MST bar was raised during this campaign and was in flux while this revision was written; treat
0.82 as the value at time of writing and read the file for the current one.

**Three bars from the previous draft were removed rather than lowered, and the distinction matters.**
The old 0.80 exact-top-three-set bar was not merely missed, it was shown in Part II to be above the
exact-posterior ceiling — no estimator can reach it at this budget, so a system meeting it would
indicate a broken measurement rather than a good instrument. The old draft's proposed replacements,
mean true weak areas inside the reported set (2.22 of 3) and share of learners getting at least two
right (88%), were measured on a standalone three-priority model and are superseded by the two-
priority result: 88.0% worst-world and 94.6% pooled on the 1-of-2 criterion at 140 items on `fc-10`,
24 worlds × 250 learners `[simulated]`.

Secondary measures worth tracking from the first cohort:

- **Positional accuracy, not just set membership.** Part II found the reported *set* far more stable
  than the *order* within it, and the product's first action depends on the order. Track first-named
  agreement separately from set agreement; if the gap on real learners resembles the simulated one,
  the case for naming a first priority at all is weaker than the case for naming a pair.
- **Reporting-rate composition against measured weakness.** Part II found FC5 taking 52% of reported
  slots against 40% in truth and FC10 taking 5% against 12% `[simulated]`. The same comparison on
  real learners distinguishes a genuine cohort weakness from an artefact of the bank or the leverage
  weighting, which simulation cannot separate.
- **Rate of downstream contradiction**: how often a test-out gate or week-one recall reverses a
  diagnostic read. Some rate is healthy and expected; a high rate on a specific concept indicates
  that concept is not being measured.
- **Never-encountered rate for short-runway learners.** The 10.4% figure in Layer 4 is the sharpest
  limit on the correction-loop argument and it is directly observable in production.
- **Subgroup placement composition**, per the Scott-Clayton finding.
- **Severe misclassification rate** specifically. Cheng & Morgan note that raw accuracy understates
  the value of longer tests because length reduces off-by-two errors even when overall accuracy
  barely moves.
- **Disattenuated correlations among reported concepts**, recomputed as data accumulates. Any pair
  drifting above 0.85 is an argument for reporting nine concepts rather than ten.

**Three honest caveats on the whole proposal.**

Three separate research sweeps failed to find any published comparison of adaptive versus fixed
administration for multi-dimension profile scoring on an uncalibrated bank. That is precisely our
configuration. The simulation harness is therefore not a validation convenience — it is the only
instrument that could settle the design questions here, and it should be treated as a first-class
component of the system rather than as test infrastructure.

The operation axis is unbuilt and unvalidated. The design's argument no longer depends on it: length
is priced on the content axis, the output does not include an operation read, and Part IV's Claim 9
has been restated in its weaker content-only form. What is lost if the distinctness pilot fails is
the strongest version of the argument for why this instrument does something a full-length
structurally cannot. What was lost by deferring it is already reflected throughout this document.

And the largest caveat is the simplest. Every quantitative result in this document is simulation
under a generative learner model, on an uncalibrated bank, and none of it has been measured on a
learner. The campaign's contribution is that it eliminated designs, established orderings, and found
the ceiling — it established that a three-priority report does not survive a re-sit, that 200 items
buys nothing, that the estimator is at its bound, and that the remaining leverage is in the bank and
the downstream loop. Those are structural facts about the design space and we expect them to hold.
The rates attached to them are not forecasts, and a reader who takes 88.0% or 94.6% away from this
document as a performance expectation has read it as we did not intend and as the evidence does not
support.
