# Diagnostic BrainLift — SpikyPOVs (DOK 4)

**Author-generated.** Every SPOV below was derived by Mohamed Shawgi. The evaluation notes
under each are checks against `diagnostic-brainlift-tree.md` (the DOK 1/2 knowledge tree) and
`diagnostic-brainlift-implementation.md` (what the shipped instrument actually does). Nothing
here was drafted by an assistant; the notes exist to record what supports each claim, what
contradicts it, and which premise is load-bearing.

The tree was pruned to 15 entries on 2026-07-31. A citation written `tree N.NN` resolves in the
pruned tree; one written `archived tree N.NN` resolves in the complete pre-pruning tree at
`docs/research/archive/diagnostic-brainlift-tree-full.md`. Every figure quoted from an archived
entry is stated inline below, so no claim depends on retrieving it.

**Note added 2026-08-01.** The pruned tree in `diagnostic-brainlift-FINAL.md` now runs to twelve
entries: 2.3, 2.12, 2.13 and 2.16 were dropped to make room for **2.31**, a `[measured]` audit of
the practice-test feature that shipped in the 88-commit push. Citations to those four below resolve
in the archive rather than the pruned tree, and their figures are quoted inline here anyway.

Status values: `draft` (stated, not yet stress-tested), `checked` (evidence located both ways),
`revise` (a premise failed and the claim needs re-deriving).

---

## SPOV 1 — A diagnostic's job is to start the process, not to complete a profile

**Status:** checked

> The purpose of a diagnostic test is not to get a complete profile of the user. With such an
> expansive exam and so many topics to cover, it is impossible to generate that profile at any
> feasible length. A diagnostic should therefore identify a couple of high-priority areas to
> target first, giving the user a good starting point, while the main app continues the process
> the diagnostic started — probing especially at apparent strengths and at concepts the
> diagnostic measured poorly, to confirm they can safely be delayed.

**What supports it**

- Two sittings reproduce an identical 10-way ranking **0% of the time at 14, 20, 30 and 80 items
  per concept**; identical 3-tier grouping reaches only 16.3% at 80 items per concept. An
  800-item instrument cannot reproduce its own tier grouping more than a sixth of the time
  (tree 2.18).
- Kruyen's floor for individual-level decisions is **40 items per dimension**, implying 400 items
  for ten concepts (tree 2.3).
- Sinharay: across 25 operational tests, **16 had no subscore with added value**; subscores need
  ≥ 20 items and disattenuated intercorrelations below 0.85 (archived tree 2.4).
- Attribute-level accuracy .838–.897 against pattern-level **.530** at five items — per-dimension
  reads are forgiving, whole-profile claims are brutal (tree 2.6).
- Narrowing the report from three priorities to two moved worst-world reproducibility from 76.4%
  to **89.6%** at 200 items, and measures 88.0% at the delivered 140 (tree 2.19).
- Week-one probing of unsettled reads is **the only mechanism that deliberately samples outside
  the selected set**, which is exactly the "keep probing" half of the claim (tree 2.28).
- The diagnostic has no authority over mastery state, so a false-strong read can only change
  queue position (archived tree 2.27).

---

## SPOV 2 — Multistage is the right delivery model for this application

**Status:** revise — the conclusion holds, two of the three premises do not

> The best form of diagnostic for this application is a multistage adaptive test. Users complain
> heavily about the defining features of an item-adaptive test, such as not being able to go back
> and review past answers. But it is also clear that adaptive tests allow sharper, more precise
> measurement with less questioning. A multistage adaptive test brings the benefits of an
> item-adaptive test, with a possibly negligible decrease in efficiency, while eliminating the
> complaints most users have about adaptive tests.

**What supports the conclusion**

- Within-block answer revision and content balance guaranteed on **every route** through the panel are
  two properties MST holds structurally, where item-level CAT must buy them back with a restricted
  revision scheme (tree 1.20).
- That first property is **verified in the shipped client**, not just in the design. The block is a
  draft until commit, so an answer may be changed any number of times before submit
  (`use-block-navigation.ts:1-8`, `:87-90`); the learner moves by Previous / Next and a jump palette
  and can flag items to return to (`Diagnostic.tsx:217-257`); the screen says it outright — "You can
  change any answer in this block until you submit it" (`Diagnostic.tsx:316-319`). The smoke harness
  sits three whole sittings to show the scorer honours it: a block drafted one way and revised
  before commit fingerprints as **the revision, not the draft** (`scripts/diagnostic-smoke.mjs:241-257`).
  The policy layer names the constraint as a product constraint rather than a measured one —
  `REVIEW_BLOCK_FLOOR = 15` against a delivered stage of 20 (`diagnostic-mst-sweep.ts:159-173`).
- On the metric the instrument actually reports, the gap is a tie: true worst concept in the top
  three measures **87.5% for the served MST form against 87.3% item-level**. The adopted design
  recovers **4.8 of the 7.0-point** worst-world reproducibility gap (tree 1.20).
- Zheng et al.: a 21-item MST beat a 30-item linear form on classification (**.745 vs .703**) and
  tied a 21-item CAT on classification (**.788 vs .781**) while losing on point estimation
  (RMSE .383 vs .254). **Simple true-score routing performed as well as θ routing** (tree 1.2).
- Bank pressure decides it independently: CAT drew on **530 of 600 items** against MST's
  **131–224** with more uniform exposure (tree 1.2). FC10 holds 40 items (tree 2.25).
- Chang, Chiu & Tsai: at 8 attributes with a 100-person calibration, **every parametric selection
  rule fell below 0.20 pattern recovery** — "did not behave much differently from random" — while
  nonparametric selection held at 0.63–0.67 (archived tree 1.6).
- Staged delivery yields **25 minutes to first actionable output versus 7.5 hours** for a
  full-length, at no measurement cost (tree 3.9).

**Three qualifications on the shipped affordance (checked 2026-07-31)**

Skipping is real but **implicit**. There is no skip control on an item; the learner advances with
Previous / Next or the palette and leaves it blank, and the confirm callout counts what is left —
"Submit with N left blank?" — and tells them a blank "counts as 'I don't know', which is a cleaner
signal than a guess" (`Diagnostic.tsx:137`, `:259-272`). It is not free: a blank commits as
not-correct and is counted in number-correct, so it **moves routing downward**
(`diagnostic-engine.ts:398-403`, pinned at `apps/learner-web/server/diagnostic.test.ts:241-258`).

Every question must be **opened** once before the block will submit — the primary button is
disabled until then, under the line "Open every question in this block before submitting it"
(`Diagnostic.tsx:140-142`, `:303-312`). The form tolerates a blank; it does not tolerate an unread
item.

Review is **within the current block only**, in copy ("You cannot come back to this block
afterwards", `Diagnostic.tsx:271-272`) and in mechanism: the block token is one-use, a re-serve
retires the previous one, and a second commit for the same stage returns 409
(`diagnostic-session-store.ts:140-178`), with position derived entirely from the response log so a
committed stage cannot reopen (`diagnostic-engine.ts:310-379`). And revision is permitted without
being **recorded** — `answers` is last-write-wins per question id and the server appends exactly one
response per served item (`use-block-navigation.ts:87-90`, `diagnostic-engine.ts:391-404`), pinned
by a test that revises one item twice and scores only the final draft
(`apps/learner-web/server/diagnostic.test.ts:222-239`). Blueprint's score report advertises exactly
the analytic this discards — "what happened after you changed your mind and chose a different
answer." Whether that discard costs anything is unmeasured.

**Corrections that the claim as written requires**

Two of its three premises did not survive checking, and the corrections are load-bearing for how the
SPOV may be stated.

1. *"Users complain heavily about not being able to go back"* is overstated and rests on a false
   architectural assumption. Examinee preference for review is real but is stated preference from
   low-stakes laboratory tests, 1993–2003, with no complaint data from any operational high-stakes
   programme, and it appears just as strongly on *non-adaptive* computerized tests, so it is not a
   reaction to adaptivity. And item-level CAT **can** permit review: GMAT Focus allows three answer
   changes per section, Smarter Balanced allows review within a segment
   (`diagnostic-item-review-evidence.md`).
2. *"Negligible decrease in efficiency"* is right on classification and wrong on precision: RMSE
   **.383 against .254** in Zheng (tree 1.2). MST concedes point estimation and concedes nothing on
   the decision the report is made from — **87.5% against 87.3%** on true worst concept in the top
   three (tree 1.20).

**The stronger support the research turned up**

Review is not a usability concession traded against measurement; at seven blocks it is nearly free,
and the exploitable configuration is the one this design does not offer.

- Stocking (1996/1997, ETS RR 96-12), estimated reliability under worst-case universal strategic
  answer-changing: **.927 no review, .921 at 7 blocks, .915 at 4 blocks, .880 at 2 blocks, .798 at
  full end-of-test review.** The delivered form is **7 blocks of 20**. `[read per subagent]`
- Cui, Liu, He & Chen (2018, ACT R1709), 10,000 simulees on a 30-item CAT: unrestricted review under
  an optimal attack drops the correlation with true ability **0.98 → 0.83** and inflates CSEM
  **0.21 → 2.75**; **six-block review is statistically indistinguishable from no review** (0.97,
  CSEM 0.23, bias 0.00).
- Vispoel, Hendrickson & Bleiler (2000, JEM 37(1)) tested exactly this design live across four
  conditions (no review, 5-item blocks, 10-item blocks, end-of-test) and found **no trustworthy
  differences** in proficiency estimates, measurement error, or testing time, with **98.4%** of
  examinees reporting adequate review opportunity.
- Unrestricted review costs **35%, 41% and 52%** additional testing time across three studies —
  decisive on its own for a multi-hour form.
- Examinees *taught* to game the test scored **lower** than untaught controls, because they
  misjudged item difficulty (Vispoel et al. 2002).

**Scope note added 2026-07-31**

From this point the BrainLift assumes a **semi-perfect item bank** — expansive, covering every
foundational concept with more than enough content, and calibrated. This is a deliberate decision
to argue about the *system* rather than its inputs, and it withdraws three of the strongest
arguments previously available to this SPOV: that parametric selection degrades toward random at
this dimensionality on a small calibration sample (archived tree 1.6), that number-correct routing
needs no item parameters (tree 1.2), and that item-level CAT would exhaust FC10's 40-item pool
(tree 2.25). Under the assumption, item-level CAT becomes materially more attractive and the
argument for MST must stand on delivery properties alone.

**Still an assumption, verified 2026-08-01.** The push added `packages/policies/src/calibration.ts`,
which is not item calibration and does not make this note real. It bands a single scored attempt
`confidently_wrong` or `shaky_win` from response time and pre-commit answer changes, feeding the
Mistakes ranking and nothing else. The real bank is still uncalibrated at HEAD: `diagnostic-bayes.ts`
derives `b` from the author DOK label at −1 / 0 / 1 / 1.8 with `a` fixed at 1.5 and `c` at 0.25, and
`irt.ts` cold-starts BKT's slip the same way, switching to an empirical `ln((1 − p) / p)` only past
`MIN_ATTEMPTS_FOR_B = 20` attempts on an item. No item carries a calibrated parameter. So the three
withdrawn arguments remain true of the shipped system and are available again the moment the
semi-perfect-bank frame is dropped.

**Suggested re-derivation**

Two candidate forms, both stronger than the version above.

*Form A — the currency argument.* What item-level adaptivity buys is **point-estimation** precision
(RMSE .383 against .254), and the output contract forbids emitting point scores, numeric confidence
or a ranked profile (tree 2.26). So item-level CAT's advantage is denominated in a currency this
product is not permitted to spend, while its costs — no free review, content balance only on
average, no staged time-to-value — are charged in currencies it does spend.

*Form B — the architecture argument.* Review at seven blocks costs six thousandths of a reliability
point under worst-case strategic answer-changing, and the configuration that is genuinely
exploitable (unrestricted end-of-test review, .798) is one this design never offers. Item-level CAT
can permit review, but only by buying it back with a restricted-revision scheme. MST gets it as a
property of its structure.

---

## SPOV 3 — Every provider that starts with a test starts with a prediction instrument

**Status:** revise — the argument survives; its opening sentence does not, and is corrected below.
Rechecked 2026-08-01 against a practice-test feature that did not exist when this was written: the
claim still holds and one clause of it now points at our own product. See the note at the end.

> Essentially every other provider out there that starts their program with a test has users take a
> full or half length MCAT style practice-test, which is simply put not the highest leverage decision.
> An adaptive diagnostic test will be able to get much more useful actable-upon information out of the
> same testing time, giving a concrete starting point. This is not to say full length practice tests
> are not useful, they definitely are for exposing students to the nature of the MCAT (timing,
> fatigue, etc), but are more valuable at later points as concrete practice opportunities (especially
> considering that a calibrated, tested practice test is a much scarcer artifact than a simple series
> of 230 questions).

**What supports it**

- *Wrong instrument.* A full-length is a **prediction** instrument being used as a **placement**
  instrument: it is designed and equated to produce one precise number on a known scale, and the
  day-one question is "what should I do on Monday," which a scaled score does not answer
  (tree 2.30, Claim 1).
- *Wrong time.* Administered before instruction it is contaminated by three sources of variance
  unrelated to content knowledge — format unfamiliarity, absent pacing strategy, and unpracticed
  endurance across a **7.5-hour** sitting — all of which **shrink substantially by week six**. The
  same form later is a better measurement of the same construct. Fatigue is signal for score
  prediction and noise for diagnosis (tree 2.30, Claim 5).
- *Not "more information" but more actionable information.* Items sharing a passage are correlated,
  so **effective test length is materially shorter than nominal** and reliability estimated under
  local independence is overstated. Because the unit of assembly is a passage generating 4–7 items,
  **the passage decides what those items are about**, so per-concept item guarantees and
  within-concept difficulty balance are unavailable at any length (tree 2.16). Item-level assembly
  produces a prescription; four section scores produce a label (tree 2.30, Claim 9).
- *Time to value.* **25 minutes to first actionable output versus 7.5 hours**, because an MST is
  assembled from discrete modules and a full-length cannot be split without destroying its validity
  as a score predictor (tree 3.9). Tree 3.9's comparator is the 7.5-hour full-length; against the
  four-hour half-length the market actually uses, the ratio is roughly **10×, not 18×**.
- *Scarcity, measured.* The bank holds **2,108 items with 2,108 distinct family IDs — zero
  multi-question families, median passage length 158 characters** — and **CARS has 160 items for a
  section worth 25% of the exam** (tree 2.25). A genuine passage-based full-length is not merely
  expensive here; it is an artifact that cannot currently be built. Spending the scarcest inventory
  at the point in the timeline where it measures worst is a misallocation.

  **Provenance and one qualification, 2026-08-01.** Those figures hold and none of them can be
  recomputed from a clone. The bank is in Postgres (`questions`, `question_protected`); the five
  JSON files under `content/question-bank` are schema and tooling, and the counts come from a
  gitignored pull at `content/question-bank/.local/db-pull/` dated **2026-07-24** that this push did
  not touch. `tools/questions-cli` and `tools/passage-cli` upsert by `question_id`, so every figure
  is a floor on a bank that may already be larger. Two qualifications. A 115-item form **is** now
  assembled here (2.31); it is one item per stimulus, not passages, which is exactly why the
  scarcity argument has to be stated as passage-based rather than as length. And "zero
  multi-question families" is a statement about `family_id`, not about passage text: **28 texts are
  shared by more than one item, covering 101 items**, largest group 8. At a median 158 characters
  they are stem contexts, and 4.8% of the bank builds no full-length, so the claim holds. State it
  as "no usable passage sets" rather than "none," because the recount is one query away.
- *Funnel cost.* The **first** graded assessment carries **18.71% stopout against 7.27%** for all
  others, and number of questions on that first assessment is a positive predictor (+0.073,
  p < .0001) (tree 3.3).

**Correction to the opening sentence — checked 2026-07-31**

The competitor mechanism map under `docs/research/daily-planner-efficacy/` turned out not to cover
this: it establishes prices, full-length counts and the NAD baseline-instrument problem, but never
what a provider puts in front of a learner on day one. Checked against provider pages instead. The
claim is **overstated and should be withdrawn as written** — among providers that ship a day-one
instrument at all, the modal choice is a **half-length**, not a full-length.

- **Blueprint — half-length, ~4 hours.** The free account bundles "a half-length diagnostic MCAT to
  give you a performance baseline" *and*, separately, a full-length practice exam
  (blueprintprep.com/mcat/thank-you-mcat-email-opt-in), and the blog instructs students to sit it
  "at the very beginning of your MCAT prep, before you even begin studying"
  (blog.blueprintprep.com/mcat/when-should-i-take-my-mcat-diagnostic-exam/). The 515+ course's own
  help page is the sharpest source: before the first class meeting, take "the half-length Diagnostic
  Exam (**~4 hours**)" plus **3–4 hours** of review
  (help.blueprintprep.com/en/articles/7932190-3-things-to-know-when-choosing-your-mcat-515-class-schedule).
- **Altius — half-length.** Every First Aid Kit tier ships exactly **one** half-length diagnostic
  ($25 list), advertised as "standardized on over 100,000+ premeds," alongside separately-counted
  full-lengths (altiustestprep.com/mcat-prep/mcat-first-aid-kit/, get.altiustestprep.com/marchmadness2026/).
- **MedSchoolCoach — a free diagnostic exam is the advertised entry point**, but its length **could
  not be established first-party**: the page says only "a full simulation that perfectly replicates
  your test day experience" (info.medschoolcoach.com/mcat-practice-exam-free), while third-party
  listings describe a half-length. Treat as unresolved.
- **The Princeton Review — subject-level quizzes.** The self-paced trial's first step is "take a
  diagnostic exam **for each subject**" across six subject areas, with a free full-length offered
  alongside rather than as the starting move (princetonreview.com/medical/free-mcat-prep); the
  course carries **89 diagnostic quizzes**, recorded first-party in
  `daily-planner-efficacy/05-competitor-mechanism-map.md`.
- **Magoosh — a short quiz.** The day-one artifact is a blog-embedded diagnostic of a handful of
  items ("We recommend taking this quiz before you start your prep"), with the full-length offered
  as a separate next step (magoosh.com/mcat/mcat-diagnostic-test/, mcat.magoosh.com/practice_tests/free).
- **Kaplan — full-length.** Its own practice-test guide opens "Phase 1: Establishing a Baseline
  (First Week of MCAT Prep) — Begin your MCAT prep by taking your first full-length practice test"
  (kaptest.com/study/mcat/mcat-practice-tests-guide/). A shorter Kaplan diagnostic (30 items / 48 min
  per section, 27 / 46 for CARS) is widely described by third parties, but I **could not confirm it
  on a Kaplan page**; kaptest.com/mcat/free is bot-gated.
- **Jack Westin — full-length.** "Take a diagnostic first. Get a baseline score before touching any
  content. Use one of Jack Westin's free full-length exams"
  (jackwestin.com/blog/best-mcat-prep-option-2026/).
- **UWorld — no distinct instrument.** Its own guidance prefers a full-length and concedes that "a
  half-length diagnostic test can serve as a quick diagnostic tool early in your prep … Use the
  half-length option only if you are constrained by time or are just starting out"
  (gradschool.uworld.com/mcat/practice-test/).
- **Examkrackers — could not establish** any day-one instrument. "Diagnostics" in its copy means the
  score report attached to a full-length (examkrackers.com/product/mcat-test/).
- **AAMC — outside the claim's scope.** It sells materials and runs no program, so it never has a
  day one to occupy.

So the qualifier "providers that start their program with a test" **does real work** — AAMC,
Examkrackers and UWorld are excluded by it — but it does not save the "full-length" half.

**Corrected opening sentence.** *Every provider that begins with a test begins with an MCAT-style
prediction instrument — a full-length at Kaplan and Jack Westin, a half-length of roughly four hours
at Blueprint and Altius, subject-level quizzes at Princeton Review and Magoosh. Not one of them
starts with an instrument built to answer "what should I do on Monday."*

**What the correction leaves standing.** The instrument argument is untouched — a half-length is
still equated to produce a scaled score, still sat before instruction, still assembled
passage-by-passage, so tree 2.30 Claims 1, 5 and 9 and archived tree 2.16 apply to it unchanged. The
**length** argument is not: the delivered form is **140 items at 95 seconds each = 3.7 hours**,
against Blueprint's ~4-hour half-length of **~115 items**. Argue this SPOV on instrument type and
time-to-value, not on total minutes.

**We ship practice tests now — checked 2026-08-01**

The push added a periodic practice test (`practice-test-assembler`, `-cadence`, `-scorer`,
`-estimate`, plus the Today's-Path reservation), so this SPOV has to be re-read against our own
product rather than only against competitors'. The facts, from tree 2.31:

- **Fixed form, no routing**, dealt from the same bank and scored at the end by key match. Three
  length tiers: **30 items / ~40 min**, 59 / ~90 min, and 115 / ~3 h, the last being half of a
  230-item MCAT and the assembler's canonical blueprint.
- **Never on day one.** Both the plan builder and the serve boundary gate it on `practiceUnlocked`,
  the same **three completed lessons** that gate ordinary Practice. A learner with no lessons done
  is not offered one, and the "baseline" phase fires the moment that gate opens rather than at
  signup.
- Cadence after the baseline: **~6 days** early, **~3** inside 63 days to exam, **~2** inside 21,
  hard cap of one per day, five-day blackout before the exam, and the next test is refused while the
  prior one's review is still open.
- Tier comes from a readiness blend of mastery, lesson completion and exam proximity weighted
  **0.35 / 0.25 / 0.4**, cut at 0.34 and 0.66, with a floor that forbids the shortest tier inside 21
  days of the exam. A learner who has just cleared the three-lesson gate scores near zero on all
  three inputs, so their first test is the **30-item** form unless their exam is close.
- **Not passage-based.** `formatOf` in `practice-test-bank.ts` calls a row `passage_mcq` whenever its
  passage string is non-empty, and every pulled row has one of median **158 characters**. That is how
  the blueprint's 40-item `passage_mcq` floor is satisfied with zero shared passages. Anyone reading
  the blueprint alone will conclude the opposite.
- It reports a **scaled-score range of 472–528**, from a straight line through 50% → 500, ±5 points
  widening to ±8 under 59 items and ±10 under 35. The module's own header says there is no validated
  concordance and the UI is required to label it an estimate. Misses enqueue as repair targets and
  the test writes no mastery.

**What this does to the claim.** It survives, and the reason is the qualifier the author already
wrote into it. The SPOV is about what a provider *starts* with; ours starts with the diagnostic, and
the practice test is structurally barred from day one. The blockquote's own second half, that full
lengths "are more valuable at later points as concrete practice opportunities," is now a description
of shipped behaviour rather than a concession.

**The clause that turns on us.** The parenthetical calls a calibrated, tested practice test a much
scarcer artifact than a simple series of 230 questions. What we deal is a fixed form off an
uncalibrated bank whose scaled range comes from a straight line, not an equating. If this SPOV is
read aloud next to a demo of the practice-test dashboard, the obvious question is what our own
472–528 range is equated against, and the answer is nothing. Two options, and the first is better:
drop the scarcity parenthetical and argue placement, timing and honesty about the number, all of
which we can defend. Or keep it and say plainly that our estimate is a labelled estimate rather than
a score, which is the one thing that distinguishes it from the artifact being criticised.

---

## SPOV 4 — 140 items is not a derived number, and SPOV 3's own argument cuts at it

**Status:** draft — this is the one the current design fails. Rechecked 2026-08-01: the 140-item,
3.7-hour anchor is unchanged at HEAD and the push added a second exhibit.

> The argument against a day-one full-length is an argument about learner time and first-experience
> attrition, and it does not stop being true at 140 items. 3.7 hours is not a diagnostic, it is a
> shorter full-length. The delivered length was not derived from a target on the reported metric; it
> fell out of choosing seven blocks of twenty. Until the marginal value of the last blocks is priced,
> the design is exposed to the same mechanism it criticizes competitors for.

**Why it indicts this design specifically**

- SPOV 3's decisive funnel evidence is that the **first** graded assessment carries **18.71% stopout
  against 7.27%**, and that number of questions on that first assessment is a **positive predictor
  (+0.073, p < .0001)** (tree 3.3). That is a continuous relationship, not a threshold at 230. A
  140-item, **3.7-hour** first experience sits on the same curve. The design bought roughly a 46%
  reduction off a full-length and then stopped.
- The competitor check added to SPOV 3 on 2026-07-31 makes that stopping point worse, not better. The
  day-one instrument this design is competing against is usually **not** a full-length: Blueprint's is
  a half-length at **~4 hours**, Altius ships a half-length, and a half of the real form is **~115
  items**. So the 46% reduction is measured against the wrong baseline — against what learners are
  actually offered on day one, **3.7 hours and 140 items is a reduction of nothing**. The instrument
  argument (placement versus prediction) still separates this design from theirs; the length argument
  does not.
- The Purpose forbids a hard gate, and a 3.7-hour instrument is a *de facto* gate whatever the copy
  says. Either the instrument is resumable and partial results are actionable — in which case the
  later blocks are optional and should be named as such — or it is not, in which case the Purpose is
  violated.
- The measured cost of shortening is small on the metric the report is actually made from: worst-world
  reproducibility of a two-priority report is **89.6% at 200 items and 88.0% at the delivered 140**
  (tree 2.19). Roughly 1.6 points for a 30% reduction. A flat curve in that region is an argument for
  shortening further, and **nobody has priced 100, 80 or 60.** The sweep harness can do this and has
  not been pointed at it.
- Nor is the extra length buying profile-grade precision, because that target is out of reach anyway:
  Kruyen's floor is **40 items per dimension, implying 400 items for ten concepts** (archived tree
  2.3), and two sittings reproduce an identical 10-way ranking **0% of the time even at 80 items per
  concept** (tree 2.18). Blocks 5 through 7 are therefore spending the most expensive resource in the
  system on a precision the output contract forbids reporting (tree 2.26).

**Verified against HEAD, 2026-08-01**

Nineteen files moved in `packages/policies/src` and none of them moved the number this SPOV is built
on. `MST_140_RECOMMENDED` is still labelled "MST 140 (7 x 20, 3-way, contention)" in
`diagnostic-mst.ts`, and `diagnostic-value.ts` still prices an item at `secondsPerItem: 95`, which is
where 3.7 hours comes from. `Diagnostic.tsx` changed in ways that touch neither structure nor
placement. The instrument the SPOV indicts is the instrument that shipped.

The practice test adds a second exhibit rather than a defence. A learner who reaches the long tier
sits **115 items over about three hours** on top of the diagnostic's 140 (tree 2.31), so the program
now asks for two multi-hour sittings. Neither length was derived from a target: 140 fell out of
seven blocks of twenty, and 115 fell out of halving a 230-item exam. The practice test does clear the
funnel objection the diagnostic does not — it is gated behind three lessons, so it never occupies the
first-assessment position where stopout runs 18.71%, and it starts at 30 items for a learner who has
just unlocked it. That gate is the move this SPOV is asking the diagnostic to make and it was made
for the other instrument.

**What would settle it**

Run the existing sweep at 60, 80, 100 and 120 items against two-priority worst-world reproducibility,
and pick the length from the resulting curve rather than from the block structure. This is the one
open question in the set that is answerable with tooling already in the repo.

---

## SPOV 5 — The highest-information item in a diagnostic is not an item

**Status:** revise — the prior-score half is strong and survives sourcing; the grades half failed it.
Sourcing on 2026-07-31 resolved all three objections against the claim and could not find any evidence
for its load-bearing version, so "grades substitute for items" must be withdrawn and replaced by the
narrower uses below. Not implemented either way: there is no intake section collecting either input.
Rechecked 2026-08-01 and still true: nothing in the push collects a prior MCAT score or a course
grade, and the goal slice carries a test date and nothing else.

> A diagnostic should ask for past MCAT scores and prerequisite course grades before it asks a single
> question. In a Bayesian design an informative prior is interchangeable with items, so information
> the learner can hand over in seconds substitutes directly for items that cost 95 seconds each.
> Providers collect this data at intake and then do nothing statistically serious with it, treating it
> as marketing segmentation rather than as measurement.

**Why it matters here**

- It is the only lever that dissolves SPOV 4. Prior precision and test length trade off directly, so
  every unit of prior information is administered items removed — the one route to a shorter
  instrument that does not pay for it in reproducibility (tree 2.19).
- A past MCAT score is **four section-level anchors from a professionally equated instrument** with
  published reliability and a known score scale. No amount of in-app measurement produces an
  equivalent, and the design cannot otherwise emit a number on the AAMC scale at all (tree 2.30).
- It produces a genuinely counterintuitive consequence: **test length personalizes by information
  already available rather than by ability**, so retakers get the short form and first-timers the long
  one.
- Precedent from outside the field is strong. Scott-Clayton found high-school background alone beat
  placement tests outright, and test-only versus multiple-measures placement agreed for only **81% of
  math and 68% of English** samples (archived tree 2.13, 2.12). Background data is not a supplement
  to a placement test; it sometimes outperforms one.

**What the grades half has to survive** — items 1, 2 and 3 sourced 2026-07-31

Recorded here rather than in the claim. Items 1 and 2 carried `[needs sourcing]` markers and are now
sourced; item 3 has been extended with the two figures that decide it, neither of which was in the
document before. None of the three resolved in this SPOV's favour.

1. *Non-comparability.* An A in general chemistry is not a fixed quantity across institutions or
   years, and the institution-level confound is unobservable. **Sourced, and the effect is larger than
   the claim assumed.** Rojstaczer & Healy (2010, "Grading in American Colleges and Universities,"
   *Teachers College Record* ID 15928, gradeinflation.com/tcr2010grading.pdf), on contemporary grades
   from over 160 institutions enrolling more than two million students, fit average institutional GPA
   as `2.8 + 0.001 × (SAT_MV − 850)` plus **0.1 if the school is private** — that is, privates grade
   **0.1 to 0.2 higher on a 4.0 scale for a given talent level of student**, and their database
   averages **3.3 at privates against 3.0 at publics**. Science and engineering schools grade about
   **0.15 lower** than non-S&E peers of equal selectivity. The largest effect is the discipline one,
   and it lands squarely on this SPOV's input: nationally, **science departments grade about 0.4 lower
   than humanities departments and 0.2 lower than social science departments**. Over time the same
   authors measure a nationwide rise of roughly **0.1 GPA points per decade**, which their site
   (gradeinflation.com, last major update 2016) puts at **0.14 per decade averaged across the full 50
   years** and **0.10 per decade since 2000** at publics and privates alike. Their follow-up
   (Rojstaczer & Healy 2012, "Where A Is Ordinary: The Evolution of American College and University
   Grading, 1940–2009," *Teachers College Record* 114(7), gradeinflation.com/tcr2012grading.pdf, 200+
   schools) puts A's at **43% of all letter grades — up 28 points since 1960 and 12 since 1988** —
   rising **7–8 percentage points per decade**, with privates awarding about **4 percentage points
   more A and B grades combined** than publics of equal selectivity and Southern schools grading about
   **6 percentage points lower**; at schools of modest selectivity, grading is now as generous as it
   was at highly selective schools in the mid-1980s. The structural point is theirs, not an
   interpretation: inter-institutional variability has *increased* over forty years while
   within-institution grades have compressed "at the upper end," so the letter is becoming less
   comparable and less discriminating at once. Nor is this contrarian — it is the AAMC's own position.
   Its 2020 validity report justifies the MCAT as a common measure precisely "because the meaning of
   UGPAs differs for applicants from different undergraduate institutions and with different majors and
   coursework" (aamc.org/media/43291/download), and Julian (2005, *Academic Medicine* 80(10), 910–917,
   doi:10.1097/00001888-200510000-00010) calls that variation the "school-specific handicaps of uGPAs."
2. *Non-random self-report error.* Self-reported GPA correlates well with transcripts in aggregate, but
   over-reporting concentrates among low-achieving students — so the prior is most biased for the
   learners who most need accurate placement. **Sourced; the claim holds, and for the population this
   product serves it was understated.** Kuncel, Credé & Thomas (2005, *Review of Educational Research*
   75(1), 63–82, doi:10.3102/00346543075001063), 37 independent samples and **60,926 subjects**: the
   aggregate correlation between self-reported and transcript GPA is **.84** (N = 56,265, k = 29), and
   *college* GPA is the best-reported figure in the paper at **.90** (N = 12,089, k = 12) against
   **.82** for high school (N = 44,176, k = 17), with high-school rank at **.76** as a percentile and
   **.77** as a raw score, and self-reported SAT total at **.82**. So the "correlates well in
   aggregate" half is right on the numbers.

   The correlation is the wrong statistic, though, and the paper says so. On mean difference,
   self-reported **college** GPA is over-reported at **d = 1.38** (N = 6,507, k = 10) against
   **d = 0.32** for high school. On base rates, only **54.3% of college GPAs are reported accurately,
   with 34.5% over-reported and 8.8% under-reported**, against **82.4 / 12.3 / 3.5** for high school
   (the college cells rest on few studies — k = 8 and k = 3 — and should be read as indicative).
   College GPA is simultaneously the most *correlated* and the most *biased* self-report in the
   meta-analysis: the errors largely preserve rank order and point upward, which is the one failure
   mode a prior cannot absorb, because it shifts every learner's starting belief in the same direction.

   The "concentrated among low achievers" half survives, with one qualification about how it is
   measured. The authors' abstract says validity "was **strongly** moderated by actual levels of school
   performance and cognitive ability," and the discussion concludes that self-reported grades "are
   unlikely to represent accurately the actual scores of students with low GPAs and, to a lesser
   extent, low ability," with systematic bias "most common for students who have low GPAs." Two notes
   on how to state it. First, the two moderators are not equal — **the actual-GPA moderator is the
   strong one and the ability moderator is explicitly weaker** — so the wording above ("low-achieving")
   is the defensible one and should not drift into "low-ability." Second, both moderators are reported
   as Figures 2 and 3 — reliability plotted against bands of school-reported performance and against
   ability level, from a handful of primary samples — with **no tabulated coefficient anywhere in the
   paper**, so the direction is firmly established and the magnitude is not quotable as a number.

   Two features make it transfer to this product rather than staying an artifact of research settings:
   every study in the meta-analysis was one where the respondent "could obtain no objective gain" by
   misreporting, which is equally true at app intake, and the over-reporting happened anyway; and the
   authors name this design's failure mode themselves, warning that inaccurate self-reports "increase
   the number of incorrect decisions (e.g., more students will be placed in courses that are not
   optimal for their current skill level)."
3. *Grain mismatch.* A semester grade aggregates content, effort, attendance, curve and assessment
   format. Mapping it onto ten concept-level priors requires a mapping there is no data to fit — the
   same objection this BrainLift makes against section scores at tree 2.30, Claim 9. Two sourcing
   results bear on this and both are unfavourable.

   *How much prior information a grade carries about MCAT performance is not established at any grain.*
   No AAMC-published correlation between MCAT total score and uGPA in the applicant pool could be
   located, and the **"roughly 0.4–0.5" figure carried in conversation could not be substantiated from
   any primary source** — it should not be quoted until it is. What is published is restricted-range
   and far lower. Evans & Wen (2007, *J Am Osteopath Assoc* 107(4), 157–162,
   doi:10.7556/jaoa.2007.107.4.157), N = 434 matriculants, report total uGPA against the four MCAT
   subtests at **−.05, .05, .10 and .09 — none of them significant**; science uGPA against the biology
   subtest reaches **.18** (p < .01). Ganjoo et al. (2020, *Heliyon* 6(4):e03778), a post-baccalaureate
   cohort of **66**, report uGPA against MCAT total at **−.048**. Both samples are severely
   range-restricted, so these are floors and not population values, and neither refutes 0.4–0.5 — but
   nobody appears to have published the unrestricted number, so the honest position is that the size of
   the grade→MCAT relationship is unknown. The one indirect anchor points to moderate rather than high:
   at AAMC's 16 validity schools, MCAT and uGPA correlate **.57** and **.52** with first-year
   performance separately and **.65** together, lifting variance explained from **27% to 42%**, which
   is the signature of two substantially non-redundant predictors. That is an inference about their
   intercorrelation, not a measurement of it.

   *The load-bearing version — prerequisite-course grades predicting the corresponding MCAT section —
   could not be established.* No study was located that maps a named prerequisite grade (biochemistry,
   organic chemistry, physics) onto the matching section score, and the nearest evidence runs against
   it. Carmichael et al. (1987, *J Natl Med Assoc* 79(6), 637–47), on Xavier University premeds, found
   ACT composite predicted MCAT total at **0.64** with sophomore-year GPA "only slightly weaker," and
   that **"grades in science courses … did not improve prediction to any real extent, either when used
   alone or in multiple linear regression"** — a direct negative on incremental subject-grade signal,
   though single-institution and on the pre-1991 exam. Evans & Wen's science-uGPA column is
   directionally right and trivially small (**.18 against .10** on biology, **.13 against .05** on
   physical). And Kuncel et al. add a compounding problem: subject-level grades are self-reported
   *less* accurately than overall college GPA — **physical sciences .79** (N = 756, k = 2), natural
   science **.80**, science **.82**, against college GPA's **.90**. The finer the grain this SPOV
   needs, the thinner the evidence and the noisier the input.
4. *Differential prediction.* Importing GPA imports institutional and socioeconomic advantage into
   placement, which is a fairness claim requiring its own defence.
5. *Decay.* A three-year-old grade has decayed by an unknown amount, and there is no basis for
   parameterizing forgetting over a semester-long aggregate.

**Verdict after sourcing.** The grades half of SPOV 5 comes out **weaker**: the two objections that
were merely asserted are now measured and both are larger than assumed, and the claim's own
load-bearing version — section-level signal from prerequisite-course grades — turns out to have no
supporting literature at all, which makes the sequencing prescribed below (collect, log, do not use
until paired data exists) the only defensible option rather than the conservative one.

**The asymmetry that governs all five**

**A miscalibrated prior is worse than no prior.** A confident wrong prior requires evidence to
overcome, lengthening the test and degrading the read. Priors pay off only where they can be
calibrated, and there is currently response data for neither input. The defensible sequencing is
therefore to collect both from the start, let prior MCAT scores inform priors immediately, and hold
grades as logged-but-unused until enough paired data exists to fit the mapping.

**What survives of the grades half**

Two narrower uses escape every objection above, because neither treats the grade as a measurement of
ability.

- *Course recency as a decay input, not an ability input.* **When** a prerequisite was taken is
  objectively reportable, carries no incentive to misreport, and is immune to both grade
  non-comparability and the upward-bias problem — Kuncel's failure mode is inflation of a *level*, and
  a date has no level to inflate. The app already owns forgetting machinery, and "biochemistry three
  years ago" versus "last term" is a defensible prior on decay while "B+ in biochemistry" is not a
  defensible prior on ability.
- *Coverage rather than proficiency.* Whether a prerequisite was taken **at all** partitions concepts
  into never-encountered and previously-studied. That is a binary with no grading-standard variance in
  it, and it bears on the one thing the diagnostic most needs to know early — where its prior should be
  uninformative rather than merely uncertain.

Both are collectible in the same intake seconds the original claim asked for, which is why the
collection half of the SPOV stands even though the priors half does not.

---

## Notes on the set as a whole

- The five form a closed argument: **SPOV 3 clears the field** (not a full-length), **SPOV 2 picks the
  winner among what is left** (multistage over item-level), **SPOV 1 bounds what the winner may claim**
  (a starting point, not a profile), **SPOV 4 turns the set on its author** (the chosen length is
  undefended), and **SPOV 5 answers SPOV 4** (priors, not items, are the way to buy the length back) — though after
  sourcing it answers it only for retakers, since the grades half of that answer did not survive.
- Audience differs by SPOV, and this is worth stating in the document. SPOV 2 argues against a
  psychometrics-literate reader, where multistage is a mainstream choice; SPOVs 1 and 3 argue against
  market practice, where both are contrarian. Spikiness is audience-relative and the document should
  name its room.
- SPOVs 1–3 are consistent with the shipped instrument; SPOV 4 exists because a BrainLift whose spiky
  POVs all vindicate their author is under-stress-tested. SPOV 4 is the one claim the current design
  fails, and it is deliberately built out of SPOV 3's own evidence rather than new evidence, which is
  the strongest form of self-indictment available.
- Every `[simulated]` figure quoted above comes from a generative learner model never fitted to a
  real response. It can order designs and detect outright failures; it cannot forecast a rate.
- Both premises that were resting on nothing were checked on 2026-07-31, and they came back
  differently. SPOV 2's held: the shipped `Diagnostic.tsx` does expose blank-tolerant navigation and
  within-block revision, verified at file and line and end-to-end in the smoke harness — with three
  qualifications recorded under that SPOV (skipping is implicit rather than an affordance, every item
  must be opened once, and a revision is honoured but never recorded). SPOV 3's did not: the day-one
  instrument in this market is more often a **half-length of about four hours** than a full-length, so
  that SPOV's opening sentence is withdrawn and replaced in place. The correction costs the length
  argument and leaves the instrument argument standing, and it is what turns SPOV 4 from a scruple
  into the sharpest claim in the set.
- **Rechecked against the 88-commit push on 2026-08-01.** One thing changed the shape of the set. We
  now ship a periodic practice test, so SPOV 3 is no longer only a claim about competitors. It
  survives, because the practice test is gated behind three completed lessons and cannot occupy day
  one, and because the blockquote already grants that full lengths earn their place later. What does
  not survive contact is the scarcity parenthetical: our own form is uncalibrated and its 472–528
  range is a straight line rather than an equating. Everything else held. The diagnostic is still 140
  items in seven 20-item blocks at 95 seconds each, so SPOV 4's anchor is intact and now carries a
  second exhibit. `calibration.ts` is behavioural banding, not item calibration, so the semi-perfect
  bank remains an assumption. SPOV 5 is still unimplemented.
