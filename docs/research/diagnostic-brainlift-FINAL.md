# Diagnostic Test Design BrainLift

## Owners

Mohamed Shawgi

## Purpose

The purpose of this BrainLift is to establish and document a diagnostic test for an MCAT speedrun
application. This document attempts to explain every design decision taken while constructing this
test and back up the efficacy of the diagnostic test with real evidence and data. The purpose of
this test is to guide an early learning plan and provide valuable information to the application’s
system, while also not acting as a hard gate that will scare people away from the service or cause
users to dropout.

## In Scope

- The underlying logic and nature of the diagnostic test: whether it’s adaptive or fixed; if it is
  adaptive, to what extent is it adaptive (simply in difficulty of the next question, or in subject
  + difficulty of next question); how long the test will take; what metrics should determine
  stopping criteria
- What the main goal of the diagnostic test is: is the test supposed to just get a general idea of
  what to tackle first with the application continuing to probe for strength through future
  questions, or a complete ordering, or high-confidence measures of strength within every topic
- How different diagnostic testing systems impact system knowledge and user outlook: some testing
  methods lead to higher levels of user dropout, some testing methods lead to higher system
  confidence, etc

## Out of Scope

- Question Calibration: Whether questions are properly calibrated is one of the most important parts
  about whether an adaptive diagnostic system is actually effective. However, this BrainLift focuses
  more on the system and logic behind the diagnostic test and less on the data being inputted into
  the system, as calibration is something that can be always be done after the system is determined
- Absurdly short or long diagnostic tests: The general range of diagnostic tests we’re considering
  in this BrainLift is tests that range from about 30 questions in length to about 230 questions in
  length, with the upper limit being the total number of questions on the actual MCAT
- Untested diagnostic methods: We’re not trying to develop an entirely novel algorithm to test
  people’s competence, we’re simply seeing which algorithm/combination of algorithms maps the best
  to our current problem

**Verified 2026-08-01: the calibration bullet stands, despite a new file name.**
`packages/policies/src/calibration.ts` is not item calibration. It bands one scored attempt
`confidently_wrong` or `shaky_win` from response time and answer changes, touching no item
parameter. Difficulty is still the author DOK proxy, `b` at −1 / 0 / 1 / 1.8, discrimination 1.5,
guessing 0.25. No item carries a calibrated parameter.

---

# Knowledge Tree (DOK 1s and 2s)

Twelve entries, each carrying the provenance marker its source gave it. `[read]`, `[agent-read]` and
`VERIFIED` mean the full text was retrieved and the cited numbers checked. `[measured]` is computed
from this project's own bank, `[simulated]` from its modelling campaign, `[design argument]`
reasoning never measured.

Every `[simulated]` figure comes from a generative learner model never fitted to a real response, on
an uncalibrated bank. It orders designs and catches ones that fail outright; it cannot forecast a
rate.

---

## 1. Test logic

### Multistage Adaptive Testing for a Large-Scale Classification Test

*1.2 · `[agent-read]` · SPOV 2* <https://files.eric.ed.gov/fulltext/ED542026.pdf>

**DOK 1**

- A 21-item MST beat a 30-item linear form on classification, .745 to .703.
- Against a 21-item CAT: classification .788 to .781, point estimation .383 to .254.
- Bank usage: CAT drew on 530 of 600 items, the best MST on 131–224.
- True-score routing performed as well as θ routing.

**DOK 2**

Adaptivity won the decision and lost the measurement, the right direction for a placement.
True-score routing matters more here: it never needs item parameters we lack.

### Internal delivery-arm simulation

*1.20 · `[simulated]` · SPOV 2*

**DOK 1**

- At 140 items on `fc-10`, multistage reports 82.0% worst-world reproducibility against item-level
  adaptive's 88.0%.
- About 80% of that gap is allocation, which concepts the items are spent on. Three routing
  decisions to six buys 0.3 points.
- The adopted seven-block form recovers 4.8 points and ties on true worst concept, 87.5% to 87.3%.
- Contention slots drop the hard per-concept guarantee from 14 items to 8.

**DOK 2**

The gain sits in allocation; stage count barely registers. MST gets answer revision within a block
and per-route content balance structurally, which item-level tests buy back only under restricted
schemes like GMAT Focus.

---

## 2. What a diagnostic can actually deliver

### A Note on the Relationship of the Shannon Entropy Procedure and the Jensen–Shannon Divergence in CD-CAT

*2.6 · `[agent-read]` · SPOV 1* <https://journals.sagepub.com/doi/10.1177/2158244019899046>

**DOK 1**

- At 5 items: attribute-level accuracy .838–.897, pattern-level .530.
- At 10 items: .913–.953 against .747. Doubling bought 22 points of pattern accuracy and about 6 of
  attribute.

**DOK 2**

Per-dimension reads are forgiving and full-pattern claims are brutal, thirty points apart at five
items. A rank ordering behaves like a pattern claim, needing every adjacent pair right.

### Internal ranking-reproducibility simulation

*2.18 · `[simulated]` · SPOV 1, 4*

**DOK 1**

- Two sittings never reproduce an identical 10-way ranking: **0% at 14, 20, 30 and 80 items per
  concept**.
- Identical 3-tier grouping reaches 2.0% at 14 items per concept and only 16.3% at 80.
- The production harness agrees: at 140 items, two sittings name the identical top three about a
  third of the time, topping out near 52% at 480.

**DOK 2**

Adjacent concepts sit close enough that those comparisons are coin flips. An 800-item instrument
does no better in kind.

### Internal report-grain simulation

*2.19 · `[simulated]` · SPOV 1, 4, 5*

**DOK 1**

- A top-three report measured 76.4% worst-world reproducibility against a top-two report's 89.6% at
  200 items on `fc-10`.
- At the delivered 140 items, top-two measures 94.6% pooled and 88.0% worst-world.
- The third concept still gets a full 14-item block. Two thirds of the disagreements at that
  boundary are between concepts under 0.10 apart on a 0–1 scale.

**DOK 2**

Narrowing the report cost one line of code and moved worst-world reproducibility above the bar. That
boundary separates genuine near-ties, so the claim narrowed and the read did not.

### Internal bank audit

*2.25 · `[measured]` · SPOV 1, 2, 3*

**DOK 1**

- 2,108 items, one KC each, 422 distinct KCs, median 5 questions per KC.
- Skill and cognitive complexity are confounded: SIRS1 is 100% DOK1, SIRS3 is 88% DOK3, and 6 of 114
  lessons are skill-pure.
- 1,811 questions across the ten concepts, FC4 at 414 down to FC10 at 40. A 140-item sitting sees at
  most 24 FC10 items and supplies 14 per concept, fewer than one lesson's 18.
- No passage sets: 2,108 distinct family IDs, median passage length 158 characters. CARS holds 160
  items for a quarter of the exam.
- Recounted 2026-08-01: 28 passage texts are shared, covering **101 items**, largest group 8.
  Family IDs mark none. At 158 characters they are stem contexts.

**Provenance, restated 2026-08-01.** Every figure holds. The bank lives in Postgres; the five JSON
files under `content/question-bank` are schema and tooling. These counts come from a gitignored pull
dated **2026-07-24**, untouched by this push. One exception is checkable from a clone:
`data/bank-profiles.generated.ts` commits a DOK census, FC10 at 4 / 32 / 4. Two ingest CLIs upsert
by `question_id`, so a delivery grows the bank and every figure here is a floor.

**DOK 2**

Single-KC loading buys identifiability and caps each item at one attribute. The skill confound is
the worst labelling defect, since "weak at SIRS3" and "weak at hard items" are one sentence.

### Internal output contract

*2.26 · `[design argument]` · SPOV 2, 4*

**DOK 1**

- Emits two named priorities in order, ten content bands shown as ranges, a curriculum entry point,
  an unsettled list, and a word-level confidence label.
- Does not emit a ranked profile, per-concept scores, a numeric confidence, an altitude estimate, or
  any operation read.
- No number is displayed for a dimension with fewer than about 20 items behind it.

**DOK 2**

The 20-item display rule is Sinharay's added-value threshold turned into a UI constraint; the ban on
rank ordering is the attribute-versus-pattern gap turned into the same. Declining to show dimension
scores buys the shorter test.

### Internal coverage simulation

*2.28 · `[simulated]` · SPOV 1*

**DOK 1**

- A learner covering 3 of 10 concepts, roughly 40 hours of runway, never sees their true worst
  **10.4%** of the time.
- At 5 of 10 that falls to 2.4%, at 7 of 10 to 0.5%, and at full coverage to zero.
- Week-one probing of unsettled concepts is the only mechanism that samples outside the selected set.

**DOK 2**

A misranked concept gets corrected the moment the learner reaches it; a concept never reached is
never corrected. The learner with the least runway has the most exposure and least time to repair it.

### Internal full-length assessment

*2.30 · `[design argument]` · SPOV 3, 5*

**DOK 1**

- Claim 1: a full-length is a prediction instrument doing placement work. A scaled score does not
  answer what to do on Monday.
- Claim 5: sat before instruction it carries format unfamiliarity, absent pacing and untrained
  endurance across 7.5 hours, all of which shrink by week six.
- Claim 9: item-level assembly produces a prescription where four section scores produce a label.
  The crossed content × operation version is retracted; four of the seven operations do not exist as
  labels.
- Full-lengths win on score prediction, face validity and endurance, all checkpoint functions.

**DOK 2**

The industry's error is using its best checkpoint instrument where it measures worst.

### Internal audit of the shipped practice test

*2.31 · `[measured]` · SPOV 3, 4 · added 2026-08-01*

**DOK 1**

- A periodic practice test now ships: fixed form, no routing, scored at the end by key match. Three
  tiers of **30 items / 40 min**, 59 / 90 min and 115 / 3 hours, the last a half-MCAT.
- Gated on the same three-lesson unlock Practice uses, so never offered on day one. First due when
  that gate opens, then every ~6 days, ~3 inside 63 days to exam, ~2 inside 21, one a day maximum,
  blacked out for the final 5, refused while the prior review is open.
- Tier blends mastery, lesson completion and exam proximity at 0.35 / 0.25 / 0.4, so a learner just
  past the gate gets the 30-item form unless the exam is inside 21 days.
- Not passage-based. Every pulled row carries its own 158-character stimulus and so counts
  `passage_mcq`, which is how a 40-item passage floor is met with zero shared passages.
- It reports a scaled-score **range** of 472–528 off a line through 50% → 500, widened on shorter
  forms. No concordance backs it; the UI never shows a point.

**DOK 2**

The checkpoint instrument sits where 2.30 says it measures best, behind teaching rather than in
front of it. What it borrows from the full-length is the scaled-score feel, unequated.

---

## 3. Effect on the learner

### Understanding MOOC Stopout Patterns

*3.3 · `VERIFIED` · SPOV 3, 4, 5* <https://learninganalytics.upenn.edu/ryanbaker/L_S_25_Dai.pdf>

**DOK 1**

- 90 Coursera courses, 5,370,635 enrollments, 469 graded assessments.
- Stopout at the first graded assessment averages **18.71%**, against 7.27% for every other.
- Stopout decays exponentially afterwards, −0.12 per assessment, and the first assessment does not
  fit that curve.
- On assessment 1, item count predicts stopout upward (+0.073) while expected time predicts it
  downward (−0.0495). Expected time flips positive by assessment 2.

**DOK 2**

The first assessment runs on a different mechanism, so the first thing you ask a learner to do is
its own design problem. A free MOOC population mixes non-finishers with the genuinely deterred, so
only the ordering transfers.

### Internal staged-delivery argument

*3.9 · `[design argument]` · SPOV 2, 3, 5*

**DOK 1**

- A learner finishes one 20-item block in about half an hour and studies the same day. The other six
  interleave with early lessons.
- That is 25 minutes to first actionable output against a full-length's 7.5 hours, and a full-length
  cannot be split: its validity depends on one sitting under exam conditions.
- This does not produce a parallel-form retest: two simulated sittings share about 82% of their
  items.

**DOK 2**

The clearest lever the design has on dropout, and it costs nothing in measurement, since only the
schedule changes. The salient number at the first assessment becomes 20 instead of 140.

---

# DOK 3: Insights

**1. Length pays off mainly for the claim the contract forbids.**
Doubling a cognitive-diagnostic CAT from five to ten items buys 22 points of pattern-level accuracy
and 6 of attribute-level (2.6). Going from 200 items to 140 costs 1.6 points of worst-world
reproducibility, while narrowing the report from three priorities to two bought 13.2 (2.19). No
length supports whole-profile claims anyway: an identical 10-way ranking reproduces 0% of the time
even at 80 items per concept (2.18).

**2. No dimension in the delivered form clears the design's own display threshold.**
The contract shows no number for a dimension under about 20 items (2.26), the sitting supplies 14
per concept (2.25), and contention allocation, which recovers most of the gap against item-level
adaptive, lowers the hard guarantee to 8 (1.20). At 140 items over ten concepts there is no
compliant way to display a per-concept score.

**3. The bank's worst deficit as an exam simulator qualifies it as a placement instrument.**
2,108 items across 2,108 distinct family IDs at a median passage length of 158 characters means no
passage sets, so a credible full-length cannot be assembled here (2.25). That absence removes the
constraint that makes long passage-based tests undiagnostic: the real exam is three-quarters
passage-based at 4–7 items each, those items correlate through comprehension and reading speed, and
the passage decides what they cover, forfeiting per-concept guarantees at any length (archived tree
2.16). One property, read as a content gap in one frame and free item-level assembly in the other.
**Verified 2026-08-01 against three near-misses.** Migration 0019's passage store feeds Passage of
the Day from 12 CARS passages and assembles nothing. The practice-test assembler classes every bank
item `passage_mcq` only because each row carries its own 158-character stimulus (2.31). And 28 texts
are genuinely shared, over 101 items, 4.8% of the bank. None builds a form.

**4. The adaptivity dial worth paying for is the one a thin pool can least afford to turn.**
About 80% of multistage's deficit against item-level selection is allocation, while doubling routing
decisions from three to six is worth 0.3 points (1.20). Allocation concentrates items on contended
concepts, and the bank is lopsided enough that the contended one may be FC10, 40 items against
FC4's 414 (2.25). MST's gentler exposure, 131–224 items against CAT's 530 of 600 (1.2), is the
precondition for turning that dial.

**5. Three decisions in three different layers come from one labelling defect.**
Skill and cognitive complexity are almost perfectly confounded: SIRS1 is 100% DOK1, SIRS3 is 88%
DOK3, and only 6 of 114 lessons are skill-pure (2.25). That one measurement is why the output
contract emits no operation read (2.26), why the crossed content × operation prescription claim was
retracted (2.30), and why "weak at SIRS3" and "weak at hard items" cannot be separated by modelling.
Relabelling the bank would release all three.

**6. Whether the attrition evidence indicts this instrument turns on what counts as the first
assessment.**
Stopout at the first graded assessment averages 18.71% against 7.27% thereafter, and item count
there predicts it upward (+0.073) while expected time predicts it downward (−0.0495), flipping
positive by the second (3.3). Staged delivery changes no item and no budget, only which object
occupies that position: a 20-item block in about half an hour (3.9). Salient item count raises
stopout, not the time asked for.

**7. The diagnostic matters most to the learner its safety nets protect least.**
A learner covering 3 of 10 concepts never encounters their true worst 10.4% of the time, against
half a percent at seven or more (2.28). The same clock governs the other repair mechanism: a
placement test added to a model already holding high school GPA moved explained variance about 6
points in math and under 2 in English, so in-product history outruns the test and accrues only to
those who keep studying. One lesson already out-measures the diagnostic for its concept (2.25).
Placement's benefit is front-loaded too, +16pp and +11pp in completion at three semesters against
+7pp and +8pp at nine (archived tree, 2.13 and 2.12).

---

# DOK 4: Spiky POVs

Author-generated by Mohamed Shawgi. `Status` records how each has held up against the tree and the
shipped instrument. A citation written `archived tree N.NN` resolves in the pre-pruning tree.

---

## SPOV 1: A diagnostic starts the process; it does not complete a profile

*Status: checked, evidence located both ways.*

> A diagnostic is not meant to produce a complete profile. The exam is too expansive to build one at
> any feasible length. It should name a couple of high-priority areas first, while the app keeps
> probing at apparent strengths and at poorly measured concepts.

**What supports it**

- Two sittings reproduce an identical 10-way ranking 0% of the time at every length tested; 3-tier
  grouping reaches only 16.3% at 80 items per concept (2.18).
- Kruyen's floor of 40 items per dimension implies 400 across ten concepts, and Sinharay found no
  subscore with added value in 16 of 25 operational tests (archived tree, 2.3 and 2.4).
- Attribute-level accuracy runs .838–.897 against pattern-level .530 at five items (2.6).
- Narrowing to two priorities moved worst-world reproducibility from 76.4% to 89.6% at 200 items,
  88.0% at the delivered 140 (2.19).
- Week-one probing of unsettled reads is the only mechanism sampling outside the selected set (2.28).

---

## SPOV 2: Multistage is the right delivery model for this application

*Status: revise, the conclusion holds and two of its three premises do not.*

> The best form of diagnostic here is a multistage adaptive test. Users complain about the defining
> features of an item-adaptive test, above all not being able to review past answers. Adaptive tests
> measure more sharply with less questioning, and MST keeps that at a negligible efficiency cost.

**What supports the conclusion**

- On the metric the report is made from the arms tie: 87.5% MST against 87.3% item-level, with the
  adopted design recovering 4.8 of the 7.0-point gap (1.20).
- A 21-item MST beat a 30-item linear form on classification and tied a 21-item CAT there while
  losing on point estimation (1.2).

**Two corrections**

1. The complaint premise is overstated. Preference for review is stated preference from low-stakes
   lab tests and shows up as strongly on non-adaptive computerized tests. Item-level CAT can permit
   review anyway: GMAT Focus allows three answer changes per section.
2. "Negligible efficiency loss" is right on classification and wrong on precision, RMSE .383 against
   .254 (1.2). Review is close to free at seven blocks: under worst-case strategic answer-changing,
   Stocking put reliability at .921 against .927 with no review.

---

## SPOV 3: Every provider that starts with a test starts with a prediction instrument

*Status: checked, with two words corrected for what providers administer. Rechecked 2026-08-01
against a practice-test feature that did not exist when this was written: the claim survives, one
clause now describes our own product.*

> Essentially every other provider out there that starts their program with a test has users take a
> full or half length MCAT style practice-test, which is simply put not the highest leverage decision.
> An adaptive diagnostic test will be able to get much more useful actable-upon information out of the
> same testing time, giving a concrete starting point. This is not to say full length practice tests
> are not useful, they definitely are for exposing students to the nature of the MCAT (timing,
> fatigue, etc), but are more valuable at later points as concrete practice opportunities (especially
> considering that a calibrated, tested practice test is a much scarcer artifact than a simple series
> of 230 questions).

**Checked against provider pages.** Every provider that begins with a test begins with an MCAT-style
prediction instrument: a full-length at Kaplan and Jack Westin, a four-hour half-length at Blueprint
and Altius, subject quizzes at Princeton Review and Magoosh. None starts with an instrument built to
answer "what should I do on Monday."

**What supports it**

- A full-length is a prediction instrument doing placement work, and before instruction it is
  contaminated by format unfamiliarity, absent pacing and untrained endurance (2.30). The passage
  decides what its items cover, so per-concept guarantees are unavailable at any length (archived
  tree 2.16).
- 2,108 items with 2,108 distinct family IDs, and CARS at 160 items, means no passage-based
  full-length can be built here (2.25). The first graded assessment carries 18.71% stopout against
  7.27% (3.3).

**Where to press.** Instrument type, since a half-length is still equated for a scaled score and
assembled passage by passage. Not raw length: our form runs 3.7 hours against Blueprint's four-hour
half-length.

**Verified 2026-08-01: we ship practice tests now, and the claim survives.** It is about what a
provider *starts* with. Ours starts with the diagnostic and gates the practice test behind three
completed lessons, so it cannot appear on day one (2.31). That is this SPOV's second half executed
rather than contradicted. One clause turns on us: the blockquote calls a calibrated, tested practice
test a scarce artifact, and we deal a fixed form off an uncalibrated bank whose 472–528 range comes
off a straight line. Read aloud it invites the question of what ours is equated against. Nothing.
Drop the scarcity clause.

---

## SPOV 4: 140 items is not a derived number, and SPOV 3's own argument cuts at it

*Status: draft, the one the current design fails. Rechecked 2026-08-01: the anchor figure is
unchanged and the indictment now has a second exhibit.*

> The argument against a day-one full-length is about learner time and first-experience attrition,
> and it does not stop being true at 140 items. 3.7 hours is a shorter full-length. That length was
> never derived from a target on the reported metric; it fell out of choosing seven blocks of twenty.

**Why it indicts this design**

- The funnel evidence is continuous rather than a threshold at 230 items, so a 140-item, 3.7-hour
  first experience sits on the same curve (3.3). The day-one instrument it competes against is
  usually a half-length: Blueprint's runs about four hours at roughly 115 items, so 3.7 hours
  reduces nothing.
- Shortening is cheap on the metric the report is made from: 89.6% at 200 items against 88.0% at 140
  (2.19), roughly 1.6 points for a 30% cut. Nobody has priced 100, 80 or 60.
- The extra length is not buying profile-grade precision either, since that target is unreachable at
  any length (2.18) and the contract forbids reporting it (2.26).

**Verified 2026-08-01.** The anchor holds exactly. `MST_140_RECOMMENDED` is still seven 20-item
blocks with three-way contention routing, an item is still priced at **95 seconds**, and 3.7 hours
is current. Nineteen files moved in `packages/policies/src`; none moved this. Second exhibit: a
long-tier learner sits a 115-item, 3-hour practice test too (2.31), so the program asks for two
multi-hour sittings and neither length came off a curve.

**What would settle it.** Run the existing sweep at 60, 80, 100 and 120 items against two-priority
worst-world reproducibility, then pick the length from that curve.

---

## SPOV 5: The highest-information item in a diagnostic is not an item

*Status: revise, the prior-score half survives sourcing and the grades half failed it; neither is
implemented.*

> A diagnostic should ask for past MCAT scores and prerequisite course grades before it asks a
> single question. An informative prior is interchangeable with items, so what a learner hands over
> in seconds substitutes for items costing 95 seconds each.

**Why it matters here.** It is the only lever that dissolves SPOV 4, since prior precision and test
length trade off directly (2.19). A past MCAT score is four section-level anchors from an equated
instrument (2.30), which no in-app measurement reproduces.

**Why the grades half was withdrawn.** Science departments grade about 0.4 lower than humanities and
institutions differ by 0.1–0.2 on a 4.0 scale (Rojstaczer & Healy). Self-reported GPA correlates .90
with transcripts but is over-reported at d = 1.38, worst among the learners who most need an
accurate read (Kuncel, Credé & Thomas). No study maps a prerequisite grade onto an MCAT section.

**Corrected opening sentence.** Ask what the learner already knows about themselves before asking a
question. A prior MCAT score should inform priors directly. Collect coursework for when and whether
it was taken, not the grade: recency carries no incentive to misreport, so "biochemistry
three years ago" is a defensible prior on decay and "B+ in biochemistry" is not one on ability.

---

## Provenance

The knowledge tree was pruned from 68 entries to 15, keeping those that carry a measured figure and
support a SPOV's central mechanism, IDs unchanged so every citation resolves. On 2026-08-01 four
more were dropped to make room for the practice-test audit (2.31): 2.3, 2.12, 2.13 and 2.16, whose
figures now sit inline where they were used. The pre-pruning tree is archived at
`docs/research/archive/diagnostic-brainlift-tree-full.md`, the uncompressed SPOV working at
`docs/research/diagnostic-brainlift-spovs.md`.
