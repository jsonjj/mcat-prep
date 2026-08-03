# Is the daily planner defensible, and how fast can it get someone to a decent score?

Audience: measurement-literate readers who will attack the weakest claim first. Every substantive
statement carries an evidence tier — **A** strong direct evidence or field consensus, **B**
reasonable with stated limits, **C** weak, indirect, or single-source — and arithmetic that is ours
rather than a source's is marked *[own calculation]*.

Companion lanes, which hold the citations this document leans on:

| File | Scope |
|---|---|
| `01-planner-design-audit.md` | What the planner actually does: 74 design choices with `file:line` |
| `02-mechanism-evidence.md` | Learning-science evidence for each pedagogical bet |
| `03-market-and-dose-response.md` | Competitors, and the hours→score relationship |
| `04-score-gain-validity.md` | MCAT reliability, retest baselines, construct validity of coached gains |

---

## The claim we can defend, and the one we are dropping

We set out to defend two claims. Only one survives.

**Claim A — "fewer hours to the same score." Defensible, as an input-efficiency claim.** It is a
statement about study time, which we can observe directly and at fine grain, and it does not require
us to move a number whose measurement error we do not control.

**Claim B — "learners reach scores they otherwise would not have reached." Not defensible. We are
dropping it.** Two independent reasons, either of which is sufficient:

1. *Magnitude.* The largest credibly controlled mean gain in the coaching literature converts to
   roughly **+3 MCAT points**. Claim B needs 10 or more (**A**, `04`).
2. *Construct validity*, which is the fatal one. Hao et al. (2025) find the prep effect is g = 0.35
   when test-taking skills are explicitly taught and **g = 0.05, non-significant, when they are
   not** — with broad knowledge development falling on the non-significant side (**A**, `04`). And
   AAMC's own psychometricians (Zhao et al. 2010) show that a repeater's highest MCAT score
   *over-predicts* Step 1 performance, with the deficit growing per attempt (**A**, `04`). A gained
   510 predicts worse than a natural 510. So even if we moved the number, we could not claim we had
   moved the construct — and for an audience that cares about validity, moving the number alone is
   not a product, it is a coaching artefact.

Conceding Claim B is not a retreat to a weaker product. It is what makes Claim A worth stating,
because the same arithmetic that kills B is what makes A nearly free. See "Why the flat curve is the
argument" below.

---

## The four numbers that constrain everything

**1. Reliable change at the individual level is 6 total points.** AAMC publishes the standard error
of measurement as a 68% band: **±2 points total, ±1 point per section** (**A**, `04`). The correct
statistic for "did this person improve?" is the standard error of difference, SED = √2·SEM = **2.83
total, 1.41 per section**, giving 95% reliable-change thresholds of **6 total points and 3 section
points** *[own calculation, `04`]*. The section threshold is the harsher of the two: 3 points is a
full population SD of the section distribution, against 0.55 SD for the 6-point total.

**2. The no-intervention baseline is +2 to +4 points.** AAMC's median first-to-second-attempt gain is
+2 to +4 for initial scores of 472–517, and +0 to +1 for 518–528, across three cohorts of
44,000–48,000 retesters (**A**, `03`). Hausknecht et al.'s meta-analysis (134,436 participants) puts
the pure alternate-form practice effect at d = 0.24, which converts to **≈2.7 MCAT points** at the
total SD of 11.2 *[own calculation, `03`]*.

Put 1 and 2 together and the result is the most important sentence in this document: **the median
retest gain sits below the individual reliable-change threshold.** The typical retester's improvement
is, at the individual level, statistically indistinguishable from measurement error — before any
product is involved. Every "+15 points" in this market is quoted against a no-intervention baseline
of about +3, and against a ruler too coarse to resolve one learner's +3 at all.

**3. Score is logarithmic in hours, with a small coefficient.** There is no published MCAT
dose-response study (`03`). The defensible functional form comes from Messick & Jungeblut's coaching
work: Δ = β·ln(H/H₀), with gains beyond a modest threshold requiring contact time "approaching
full-time schooling" (**A**, `03`).

Two values of β are in play and **they must never be conflated**:

| β | Units | Derived from | Correct use |
|---|---|---|---|
| **0.7–1.1** | MCAT points per ln-unit of hours | Controlled coaching studies (Messick & Jungeblut) | What the product *causes* |
| **2.5–4.5** | MCAT points per ln-unit of hours | Calibrated against the confounded AAMC retest distribution | *Forecasting* a user's likely score |

The larger number includes selection, motivation, and practice effects that we do not cause. It is
legitimate for telling a user what to expect and illegitimate as an effect size. Anyone who quotes
the forecasting β as a causal effect has misread this document (**A** for the distinction, `04`).

**4. Stacked mechanisms deliver 2–7% of their naive sum.** Summing the headline effect sizes of our
eight bets gives d ≈ 2.95. Real systems that already stack four or five of them deliver 0.05 SD
(ALEKS) to 0.20 SD (Cognitive Tutor, year two of an 18,700-student RCT) — **2 to 7% of the naive
sum** (**A**, `02`). Worse, specific pairs interfere rather than merely overlap: Birnbaum found
spacing and interleaving subadditive and occasionally antagonistic, and Soderstrom, Kerr & Bjork
showed restudy adds literally nothing on top of repeated retrieval (**A**, `02`).

---

## Why the flat curve is the argument, not an objection

The natural reading of a causal β near 1.0 is that the whole category barely works. That reading is
correct, and it is precisely why an efficiency claim is strong.

With β ≈ 1.0, doubling study hours from 300 to 600 buys about **0.7 points** *[own calculation]* —
comfortably inside AAMC's own ±2 point band, and nowhere near the 6-point reliable-change threshold.
Run it backwards, which is what our product actually proposes:

> **Halving a learner's study time costs them under one scaled point, which is unmeasurable on the
> instrument that decides their application.**

That is the thesis. Because the score is nearly flat in hours across the range real learners occupy,
the marginal study hour is worth almost nothing in points — so removing hours is close to free, and
the hours themselves become the deliverable. A learner who reaches 508 in 250 hours instead of 500
has gained 250 hours of their life, not a better score, and the 250 hours are *directly observable*
while the score difference would not be.

This reframing also survives the additivity problem that would destroy a score claim. We do not need
the eight mechanisms to sum to d = 2.95, or to 0.20, or to anything in particular. We need them to
reach a given competence with less input than unstructured self-study — a comparison against a
genuinely weak baseline, and the one comparison the literature actually supports (**A**, `02`).

---

## What the planner actually does, and how that scopes the claim

`01` inventories 74 design choices. Three facts from it bound what we may assert.

**The instruction channel is delivery-only.** Every lesson the planner can schedule comes from
`APP_NATIVE_LESSONS`, which grade in the browser, write to `localStorage`, and make no HTTP call.
Completing one records delivery — `completedLessons`, and `taughtKcIds`, which is what unlocks
practice — and writes no attempt, no evidence record, and no BKT observation. The one lesson wired to
the evidence pipeline is deliberately excluded from that catalog (`docs/todays-path-engine.md:22–38`).

The mastery loop is therefore not broken but *routed*: lessons mark knowledge components as taught,
which unlocks practice on them, and practice is what moves P(L). "Lessons teach, questions measure"
is a coherent architecture and defensible as such. What we may **not** claim is that sequencing
adapts to demonstrated lesson mastery, because in the scheduled channel there is no lesson mastery
signal to adapt to. The `masteryFactor` term in `scoreLesson` reads a P(L) only practice can move.

**Practice volume is budget-fill, not need-driven.** `practiceReviewNeed` — the count of taught KCs
below the mastery cut — is computed in the authority, passed into the snapshot, asserted in tests, and
never read by `buildTodaysPath`, which instead serves `floor(remaining_minutes / 2)` questions
(`todays-path.ts:612–615`; documented at `docs/todays-path-engine.md:82`). So how much practice a
learner receives is a function of leftover time, not of assessed need. This is a real gap between the
design intent and the implementation, and it should be closed before anyone claims the planner
allocates effort adaptively.

**Most scoring constants are self-described as provisional.** Section exam weights, unlock divisors,
coverage-urgency multipliers, `masteryWeight: 0.7`, the review-debt bands, and the practice-selection
coefficients are all marked in-code as unfitted defaults (`01`, choices 1–3). That is honest, and it
means the planner's *structure* is what we defend, not its parameter values.

---

## Bet-by-bet: what holds up

| Bet | Verdict | Best evidence | The problem |
|---|---|---|---|
| Retrieval practice as the primary activity | **Strong (A)** | Yang et al. 2021: 222 classroom studies, 48,478 students, g = 0.499 — and the effect *grows* with duration (0.385 single class → 0.624 beyond a semester) | None material. This is our best-supported bet and unusually well-suited to a four-month horizon. |
| Spaced repetition | **Strong (A)** | Cepeda et al. 2008: 1,354 adults, 7–350 day retention intervals; optimal gaps beat zero gaps by 64% in recall (d = 1.1) | Most gain comes from spacing *at all*; the marginal value of algorithmic sophistication over fixed expanding intervals is not established. |
| Interleaving of topics | **Conditional (B)** | Rohrer 2020 school RCT: 61% vs 38%, d = 0.83, for confusable problem types | Brunmair & Richter find g = **−0.39** for vocabulary-like material. Benefit is domain-specific, not general. |
| Variety of *activity type* | **Unsupported (C)** | — | No literature exists. We were conflating this with topic interleaving. Our `maxSpread` guarantee (worst-case same-kind run ≤4) is probably harmless but cannot borrow interleaving's credibility. |
| Mastery-based progression at P(L) ≥ 0.95 | **Weak for our exam (B)** | Kulik's mastery-learning meta-analysis: 0.52 | In every study measuring both, the effect was "trivially small" on standardized tests. The MCAT is a standardized test. This is the most damaging single finding against our design. |
| Prerequisite-graph leverage weighting | **Weak (A, negative)** | — | Two meta-analyses put ALEKS — the flagship prerequisite-sequencing system — at g = 0.05 against traditional instruction. Ours additionally runs on a graph measured at 0.42 edges/KC with 286 disconnected components. |
| Error-driven review | **Subsumed (B)** | — | This is feedback, already counted inside the testing effect. Not an independent mechanism, and must not be added separately. |
| Adaptive difficulty targeting (~80/55/85%) | **Misattributed (C)** | — | The "85% rule" is a proof about gradient descent on perceptual discrimination, never tested on declarative material. Our targets need a different justification or none. |
| Time-budgeted planning | **No learning literature (C)** | — | The only relevant finding: learners overestimate their available study time by ≈45%. Our setup takes typed weekly hours at face value, so plans are systematically overbuilt. |

---

## The market, on evidence rather than marketing

The competitive picture is less favourable than a pitch deck would suggest (`03`).

**Adaptive scheduling is already commoditised.** UWorld bundles an adaptive study planner and an AI
tutor into its $339 question bank. "We schedule adaptively" is not a differentiator.

**The most serious competitor is free.** Anki plus a community deck costs $0 and is the only
comparator whose mechanism has peer-reviewed dose-response behind it (an 11-study systematic review;
≈1,700 cards per Step 1 point). Any efficiency claim must be made against Anki, not against Kaplan.

**No commercial provider publishes verifiable outcome data.** That is itself a finding, and a
commercially useful one — but it cuts both ways, because it means the market has no measured bar for
us to clear, and no vendor will accept our unmeasured claim either.

**The regulatory line is drawn and recent.** In one week of April 2024, the National Advertising
Division ordered Blueprint to drop "+15/+13 points on average" (22 April) and Princeton Review to
drop "Score a 515+ or add 15 points, guaranteed" (18 April), in reciprocal challenges. Three
transferable holdings:

- A money-back guarantee **is** a performance claim requiring substantiation; NAD quoted the FTC's
  "offering a money-back guarantee is not a substitute for substantiation."
- Score-increase claims **are** permitted when "qualified to state the comparison with diagnostic or
  practice test scores." What was barred was implying a comparison of *official* MCAT scores. Our own
  140-item diagnostic is a legitimate anchor for a properly qualified claim.
- "Students are statistically more likely to do well" was struck for lacking evidence comparing
  their students to the full test-taker population — a comparison we also cannot make.

---

## How long to a decent score

First, the target. AAMC's published distribution (**A**, `03`): mean 500.6, SD 11.2 for all test
takers; SD 9.9 for applicants; SD 6.7 for matriculants.

| Tier | Score | Meaning |
|---|---|---|
| Average test taker | ~500 | 50th percentile of everyone who sits it |
| Median applicant | ~506–508 | Competitive for some programmes |
| Median matriculant | ~511–512 | The realistic target for most users |
| Competitive | 515+ | Top programmes |

Now the forecast, using the **forecasting** β of 2.5–4.5 (never the causal one) and Δ = β·ln(H/H₀)
with H₀ ≈ 50 h *[own calculation, `03`]*:

| Hours | Δ from 50h baseline, β = 2.5 | β = 4.5 |
|---|---|---|
| 150 | +2.7 | +4.9 |
| 300 | +4.5 | +8.1 |
| 600 | +6.2 | +11.2 |

Read this table with three warnings attached. It is a **forecast, not an effect** — it includes
everything a motivated retester brings on their own. Its curvature is the point: the 300→600 hour
doubling buys +1.7 to +3.1 points, most of which is inside AAMC's ±2 band. And it is anchored on a
distribution AAMC reports for retesters, so it should never be quoted for a first-time tester without
saying so.

The defensible product statement, therefore, is about the *input*, not the output:

> A learner with a target score and limited time reaches that target on fewer hours than
> unstructured self-study would require, because the schedule removes the two largest sources of
> wasted time — reviewing what is already known, and studying what will be forgotten before test day.

That claim is measurable internally with **time-to-criterion per knowledge component**, needs no exam
score to validate, and requires far smaller samples than a score-gain study.

---

## The reporting standard we should adopt now

From `04`, and worth binding ourselves to before we have any results to be tempted by. Any gain
statement must:

1. Name **both** instruments, and both must be official/AAMC-scaled. Never diagnostic-to-official.
2. Name the comparison arm.
3. Express the gain **relative to AAMC's median retest gain for the same initial-score band**, not
   relative to zero.
4. Report the **proportion of learners exceeding 6 points** alongside any mean.
5. Show the full distribution, including the negative tail, stratified by band.

And one absolute prohibition at the individual level: **never tell a learner they "gained" fewer than
6 total points or 3 section points.** Below that threshold the only defensible wording is *"your
score changed by N points, which is within the range measurement error alone produces."*

One premise correction worth recording, because it is counterintuitive: regression to the mean on
official-to-official retesting is **under 1 point**, because the exam is so reliable. RTM only becomes
large (≈4.5 points) when the baseline is a low-reliability diagnostic. RTM is a property of the ruler,
not of the learner (**A**, `04`) — which is a further argument for never anchoring a public claim on
our own diagnostic as the pre-test.

---

## What this means for the product, in priority order

1. **Drop Claim B from all copy and internal planning.** It cannot be substantiated and, per the NAD
   rulings, quantified versions of it are actively litigated in this market.
2. **Recentre on time saved.** Instrument time-to-criterion per KC as the primary internal outcome.
   It is measurable at our scale; score gain is not.
3. **Discount stated availability.** Learners overestimate study time by ≈45%. Taking typed weekly
   hours at face value overbuilds every plan.
4. **Close the practice-sizing gap** so `practiceReviewNeed` actually drives practice volume, or stop
   describing the planner as allocating effort adaptively.
5. **Stop defending variety-of-activity-type as interleaving.** Either find separate evidence or
   present it as a UX comfort feature, which is an honest thing for it to be.
6. **Re-examine the 0.95 mastery threshold for a standardized-test outcome**, where mastery learning's
   measured benefit is close to nil.
7. **Do not claim the prerequisite graph as a differentiator** while it sits at 0.42 edges/KC with 286
   disconnected components and the flagship comparator scores g = 0.05.

---

## What would change our mind

The honest summary is that we have a well-supported *assessment* engine (retrieval practice and
spacing, our two A-tier bets), a weakly-supported *sequencing* engine, and no measurable score claim.
Three things would change that:

- **A cohort with both within-app proxies and real MCAT scores.** Without one, no proxy is ever
  validatable and the surrogate-index approach is permanently unavailable
  (`../effectiveness-eval/02-off-policy-evaluation-and-instrumentation.md`).
- **A time-to-criterion comparison against Anki on matched content.** This is the efficiency claim's
  actual test, it is runnable at our scale, and it is the one experiment whose result we cannot
  currently predict.
- **Evidence that varying activity type does anything.** If it does not, the planner's ordering logic
  simplifies considerably.
