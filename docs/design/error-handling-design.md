# Error Handling — System Spec

**Status:** design spec, not yet implemented. Supersedes the behaviour currently shipped in
`apps/learner-web/src/screens/Study.tsx` (`CausePicker`) and `apps/learner-web/src/screens/Mistakes.tsx`.

Every normative statement below carries the evidence it rests on, with numbers and a confidence
tier. Where there is no evidence, that is stated and the decision is made on cost/risk asymmetry
instead.

---

## 0. Scope and conventions

**In scope:** what we record when a learner answers a question, what happens in the seconds after,
and what we display back to them on the Mistakes tab.

**Out of scope, deferred to the scheduling workstream** (§8): how long to wait before re-testing a
missed item, and when to escalate from re-testing to re-teaching. Both have clear evidence; neither
is an error-*handling* decision.

**Out of scope, owned by other surfaces** (§6.1): the forward review queue belongs on **Home**, and
the decay/calibration read belongs on **Progress and Skills**. Both were considered for the Mistakes
tab and deliberately relocated. §6.1 records the evidence that travels with them, because the
strongest justification for showing a learner any record of their own state goes with the decay read
rather than staying here.

**Source reviews**, with full citations, provenance tags and stated limitations:

| File | Sources | Lane |
| --- | --- | --- |
| `docs/research/error-classification-reading-list.md` | 24 | Error taxonomy and cause attribution |
| `docs/research/post-error-feedback-evidence.md` | 18 | Feedback timing and withholding |
| `docs/research/error-log-and-open-learner-model-evidence.md` | ~40 | Error logs, dashboards, display |
| `docs/research/error-response-reading-list.md` | 27 | Scheduling and remediation after an error |

**Provenance.** `[read]`, `[abstract]` and `[secondary]` tags in the lane files mean what they say.
Roughly 70 of ~110 sources were read in full. See §12 for known citation problems, including two
figures in the previous version of this document that did not survive checking.

**Confidence tiers** used throughout:

- **A** — meta-analysis or multiple controlled studies, read in full, directly on our use case.
- **B** — single controlled study read in full, or strong evidence requiring modest generalisation.
- **C** — abstract-only, secondary citation, or substantial generalisation to reach our case.
- **D** — no usable evidence in either direction; decided on cost and risk asymmetry.

---

## 1. Thesis, and the ceiling we are playing for

**Thesis.** The diagnostic content of a wrong answer is *which* wrong answer it was — a claim about
what the learner believes. It is not *why* they erred — a claim about their cognition, which neither
they nor an expert can recover reliably.

**The ceiling.** Elaborated feedback beats simply showing the correct answer by **d ≈ 0.17**
(tier A). That is the entire headroom this system competes for. It is a real effect and worth
building for, but it rules out expensive machinery whose payoff is speculative, and it means the
cheap high-certainty components should ship first and alone.

**The prior to beat.** In the FSRS benchmark over **350 million reviews**, a zero-parameter heuristic
tracking recent successes and failures (MOVING-AVG, log loss **0.3369**) beat FSRS-7 (**0.3437**),
though it lost on RMSE-bins and AUC (tier B). Much of what error handling can buy at the level of
"will they get this right next time" is recoverable from recency of failure alone. Any model we add
must beat that baseline explicitly.

---

## 2. What changed from POV 5, and why

POV 5 ("The most important lesson isn't what the right answer was. It's WHY you got it wrong")
specifies: capture confidence and reasoning → signal wrong without exposing the correct option →
second attempt or escalating hint → reveal the full correction → classify the error's cause →
assign a targeted repair → schedule a delayed reattempt.

Two of seven stages survive unchanged, three are substantially revised, two are dropped.

| POV 5 stage | Decision | Tier | Driving evidence |
| --- | --- | --- | --- |
| Capture confidence | **Keep, and use bidirectionally** | A | Feedback ≈ doubled retention of low-confidence *correct* answers (Butler, Karpicke & Roediger 2008) |
| Capture reasoning | **Keep; move after reveal, retarget, make selective** | A/C | Induced self-explanation g = 0.55 (Bisra 2018); prompt direction from Siegler 1995 `[secondary]` |
| **Withhold the correct option** | **Dropped here; reinstated for one attempt by the 2026-07-28 amendment in §3.3** | A | Answer-until-correct vs reveal, on multiple-choice: **.71 vs .71** (Butler, Karpicke & Roediger 2007). Timing overall g = 0.03, ns (Kandemir 2026) |
| Second attempt / escalating hint | **Keep as optional; require production; gate off for hard items** | B | Elimination-driven retries retain **.42 vs .72** (Finn & Metcalfe); instruction-first d ≈ .56 on high-element-interactivity tasks (Ashman, Kalyuga & Sweller) |
| Reveal the full correction | **Keep, and promote from fifth step to second** | A | Elaborated ≈ 0.49 / KCR ≈ 0.32 / bare right-wrong ≈ 0.05; 75% of final-test intrusions were previously chosen lures (Butler & Roediger) |
| **Classify the error's cause** | **Drop** | A | Experts naming which bias caused an error agreed at **κ = 0.000–0.063** (Zwaan 2017) |
| Assign a targeted repair | **Keep; key it on content, lower expectations** | B | No study isolates the value of *matching* a repair to a diagnosed cause; ceiling is d ≈ 0.17 |
| Schedule a delayed reattempt | **Keep in principle — deferred to §8** | A | Pashler, Zarow & Triplett |

### 2.1 The headline claim: "why" gets redefined

POV 5 is right that a red mark plus the answer key is insufficient. It locates the missing piece in
the *cause* of the error — knowledge gap vs wrong inference vs pressure slip. We relocate it to the
learner's *belief*, read off the specific distractor chosen. Cause is not recoverable; belief is,
and it predicts later responses.

### 2.2 Why withholding was dropped

> **Superseded in part, 2026-07-28.** The key is now withheld until a second miss, by product
> decision; see the amendment in §3.3 for what ships and what the evidence does and does not say
> about it. This subsection is kept as the record of the original reasoning, which is unchanged.

Butler, Karpicke & Roediger (2007) tested exactly this contrast — answer-until-correct versus
revealing the answer — **on multiple-choice items**, and got **.71 versus .71** (tier A). Identical
learning, more time spent. Feedback *timing* across the pooled literature is **g = 0.03**, not
significantly different from zero (Kandemir et al. 2026; the two lane files report slightly
different confidence intervals, [−0.08, 0.13] and [−0.09, 0.15] — both straddle zero). Feedback
*content* spans **≈ 0.05** for bare right/wrong to **≈ 0.49** for elaborated. Content is the entire
lever; timing is not a lever at all.

Multiple choice makes withholding worse than neutral rather than merely useless: the correct answer
is already on screen, so "withholding" purchases an extra guess rather than a confrontation.

**POV 5's own three citations never addressed its central claim.** Metcalfe (errorful attempts
*followed by corrective feedback* beat error avoidance), Wisniewski/Zierer/Hattie (information-rich
feedback beats praise and right/wrong, d = 0.48 outlier-adjusted over 435 studies and 61,000+
learners), and Butler/Karpicke/Roediger 2008 (feedback rescues low-confidence correct answers) all
argue for *richer* feedback. None argues for *withholding* it. The POV's evidence supports its
second half and is silent on its first.

### 2.3 Why cause classification was dropped

- **Experts cannot do it.** Zwaan et al. had 37 physicians identify which of six cognitive biases
  produced a diagnostic error. Inter-rater agreement: **κ = 0.000–0.063** — chance (tier A).
- **Hindsight inflates it, and we are permanently in the hindsight condition.** The same study held
  case content constant and manipulated outcome knowledge: telling raters the case ended badly took
  detected biases from **1.75 to 3.44** and the rate of judging an error present from **8% to 60%**.
  Our system only ever classifies *after* observing that the answer was wrong.
- **Learner self-report is worse, and biased in the damaging direction.** Pilgrim et al. found
  student–expert agreement of **73% on orienting errors but 42% on planning errors** — the phase
  where experts judged every error conceptual. Students called **81% of their execution errors
  "simple"** against an expert rate of **40%**, and the weakest students did it most: one D-grade
  student called 8 of 15 errors simple where researchers called 1. Accepting a self-reported
  "careless" tag would systematically under-remediate the learners who most need help.
- **"Careless" is not one construct.** Two published carelessness detectors correlate at **−0.21**
  and predict post-test scores in *opposite directions* on the same dataset — one appears to track
  recoverability, the other haste.
- **The brainlift already ruled this out.** "Claiming that one answer reveals one mental cause" is
  listed as out of scope, and the Brown & Burton entry states that different faulty processes
  produce identical answers. POV 5 crossed the document's own boundary; the research says the
  boundary was right.

### 2.4 What POV 5 got right and we kept

The framing instinct (a red mark is not enough), the primacy of confidence, the heterogeneity of
errors, and — notably — its own Boundary & Counter: *"A learner with missing prerequisites,
repeated unproductive attempts, or limited review time may need a direct explanation sooner."*
That is precisely the Große & Renkl aptitude–treatment interaction (§4.3). POV 5 anticipated its own
most important gate and then did not apply it.

### 2.5 Net structural change

> **POV 5:** attempt → confidence → error diagnosis → second attempt → corrective feedback → reattempt
>
> **Spec:** attempt + confidence → rapid-guess gate → **immediate elaborated feedback refuting the
> chosen distractor** (key deferred to the second miss per the 2026-07-28 amendment in §3.3) →
> optional production-gated retry → selective "why is the correct answer correct" → content-keyed
> repair → handoff to scheduler

**Corrective feedback moves from fifth to second, and diagnosis moves from the learner's
introspection to the item's distractor.**

---

## 3. Runtime spec: the post-answer loop

### 3.1 Answer submission — capture confidence inline

**Spec.** Confidence is captured on the same interaction as the answer, binary ("sure" / "not
sure"), before any reveal. It is never a separate screen.

**Why binary and inline.** The evidence is for *having* a confidence signal, not for its resolution.
Any per-item cost is multiplied by hundreds of items, and the closest studied ritualised-reflection
practice fails largely on compliance (§4.4).

**Why it must be pre-reveal.** Post-reveal confidence is contaminated by the answer.

**Both branches are used, and the less obvious one is better evidenced:**

| Branch | Action | Evidence |
| --- | --- | --- |
| High confidence + **wrong** | Route to self-explanation prompt (§4) | Hypercorrection: high-confidence errors are corrected more readily, replicated across ~two dozen studies at immediate and delayed retest, with a confidence-graded P3a and impaired concurrent tone detection as mechanism (tier A) |
| Low confidence + **correct** | Route into review | Feedback ≈ **doubled** retention of low-confidence correct answers (Butler, Karpicke & Roediger 2008, tier A) |

POV 5 uses only the first branch. The second is the higher-value event — a correct answer the
learner did not trust is fragile knowledge invisible to any misses-only pipeline — and it is
Insight 8 in the brainlift.

**Caveat to carry forward.** Butler, Fazio & Marsh (2011): hypercorrection persists over a week,
**but high-confidence errors return** — 86% of errors corrected immediately, 56% at one week. The
scheduling target is the *correction*, not the item. Handoff detail in §8.

### 3.2 Rapid-guess gate — a precondition, not a feature

**Spec.** Response time is recorded on every attempt. Responses below an item-specific threshold are
flagged as disengaged, excluded from the error pipeline, excluded from pattern detection, and
down-weighted in the mastery model. They are never shown to the learner as mistakes.

**Why this is first.** Response-time thresholding for disengagement runs at **α = .97**, with rapid
guesses scoring **at chance** (tier A). It is the single most reliable signal in this entire area and
we do not currently collect it. Without it, disengaged clicks pollute distractor mapping and
manufacture false patterns in the display.

**It also replaces the one cause category worth having.** POV 5's `rushing_or_time` becomes a
measurement instead of a self-report. Wise & DeMars measured a **0.59 SD** performance gap tied to
test-taking effort, with effort *unrelated to ability* — so this is a large, real, and otherwise
invisible confound.

### 3.3 Immediate elaborated feedback — always, and it must refute the distractor

**Spec.** Every attempt terminates in feedback that states the correct answer and explains why the
*specific option the learner chose* is wrong. This is not optional and not deferred.

> **Amended 2026-07-28 — the correct answer is withheld until a SECOND miss.** This is a product
> decision by the product owner, recorded here because it partially reverses the paragraph above and
> the §7 line "withholding the correct option — not building." The shipped adaptive-practice flow is
> now: a correct first attempt is confirmed immediately, unchanged; a **first** miss terminates in the
> refutation of the option the learner chose **without** the key and **without** the general rationale
> that explains the key; the item resurfaces `RETRY_GAP` questions later; a **second** miss discloses
> everything — key, general rationale, and the refutation of the second pick. A correct second attempt
> is a plain correct confirmation.
>
> **The evidence, as it stands.** Butler, Karpicke & Roediger (2007) tested this contrast on
> multiple-choice items and found **.71 versus .71** (tier A) — withholding is not expected to harm
> learning, and its measured cost is time. Pashler et al. (2005) found feedback must **eventually**
> contain the correct answer, since being told only right-or-wrong yields "virtually no benefit"
> (tier A); the amendment defers the key by one attempt rather than omitting it, and the second
> attempt discloses whichever way it goes. Two properties of what we actually ship bear on the
> transfer from that literature and are stated without extrapolation: a **targeted refutation of the
> chosen distractor is materially more informative than bare right/wrong**, which is the condition
> Pashler measured (bare right/wrong ≈ 0.05 versus elaborated ≈ 0.49, tier A); and **withholding the
> key on a four-option item narrows the retry to three options**, so the second attempt is a
> constrained choice rather than free generation.
>
> Nothing else in this section changes. The refutation of the chosen distractor remains mandatory on
> every miss, no attempt ends in bare right/wrong, and the two dropped stages stay dropped — the
> withhold does **not** reintroduce a cause self-report (§2.3) or any other step between the answer
> and its feedback.

**Evidence:**

- Content dominates timing: elaborated **≈ 0.49**, knowledge-of-correct-response **≈ 0.32**, bare
  right/wrong **≈ 0.05** (tier A).
- Feedback must contain the correct answer: people get "virtually no benefit" from being told only
  whether they were right or wrong (Pashler et al. 2005, N = 258, **+494% at one week**; tier A).
- **Multiple-choice testing without feedback is actively harmful, not merely neutral.** Without
  feedback, **75% of final-test intrusions were lures the learner had selected on the initial
  test** (Butler & Roediger; tier A).
- **Why refuting the distractor specifically.** Marsh, Roediger, Bjork & Bjork (2007) `[abstract]`
  report that lure persistence "appears due to faulty reasoning rather than to an increase in the
  familiarity of lures," and that feedback reduces lure production. If persistence runs through
  reasoning, refuting the reasoning is the intervention — merely displaying the key is not.
- **Do not elaborate after correct answers.** Pashler et al. 2005 found no benefit, whether the
  learner was confident or not (tier A). Confidence-gated review (§3.1) is the exception, and it
  routes to *scheduling*, not to more feedback in the moment.

### 3.4 Optional retry — require production, gate off for hard items

**Spec.** A retry is optional. Where offered, the learner must produce free text ("why is the option
you first chose wrong?") *before* the options reappear. A retry is never offered by re-showing the
four options.

**Why production is mandatory.** Finn & Metcalfe's within-condition split found retries that reached
the right answer **by elimination retained at .42**, versus **.72** when reached by reasoning
(tier B). On a four-option item with one or two eliminated, a second attempt is close to a coin
flip, and **nothing in the telemetry distinguishes a hollow success from a real one**.

**Why generation, not withholding, is the active ingredient.** Grimaldi & Karpicke (2012): when the
experimenter *presented* an incorrect answer during what would have been the generation period,
memory for the correct answer was **harmed**; constraining the learner to choose among supplied
wrong alternatives was also harmful (tier B, `[secondary]` via Metcalfe 2017). **Multiple-choice
distractors are experimenter-presented wrong answers.** This is the strongest argument in the
corpus for a commit-before-you-see-options interaction, and it is an argument about *generation*,
not about withholding the key.

**Why gate off for the hardest items.** Ashman, Kalyuga & Sweller found instruction-first better by
**d ≈ .56** across two experiments on high-element-interactivity tasks (tier B) — which is what
passage-based physiology and multi-step equilibrium problems are. This inverts the usual intuition:
struggle-first should be gated **off** where the material is hardest.

**Do not cite productive failure here.** Productive failure (g = 0.36 conceptual, −0.03 procedural)
is about sequencing instruction within a curriculum, not post-error retry on practice items. Citing
it for this decision is a category error.

### 3.5 Selective self-explanation

Full treatment in §4. Summary: after the reveal, prompt **"why is the correct answer correct?"** —
never "why did you pick what you picked?" — and fire it only on high-confidence errors and repeat
failures on the same KC, suppressed on rapid guesses and on items where the learner's estimated
prior knowledge is low.

### 3.6 Repair and handoff

**Spec.** The repair is selected from the content signal — which KC, which misconception tag — not
from a diagnosed cause. The item and the correction are handed to the scheduler (§8).

**Expectations.** No study isolates the value of *matching* a repair to a diagnosed cause. The whole
apparatus is competing for d ≈ 0.17 over simply showing the answer. Build the cheap parts first.

---

## 4. The self-explanation prompt

This is the one component where the prompt's *wording* is a design decision with evidence behind it,
so it gets its own section.

### 4.1 That self-explanation works: strong

Bisra, Liu, Nesbit, Salimi & Winne (2018), *Educational Psychology Review*, meta-analysis of
**64 comparisons**: **g = 0.55**, 95% CI **[0.454, 0.650]**, p < .001, SE = 0.050 (tier A). The
authors benchmark it against Hattie's estimates for mastery learning (0.50) and peer tutoring
(0.55), below reciprocal teaching (0.74), feedback (0.73) and spaced learning (0.71).

Three constraints from the same paper:

1. The effect is for **induced** self-explanation with a specific prompt. It **does not license a
   free-text reflection box**.
2. Of 20 coded moderators, only three mattered — and one of them was **the type of self-explanation
   elicited**. Prompt design is a real moderator, not a detail.
3. The authors' own stated limitation is reliance on **instructor-scripted prompts**, and they
   **explicitly call for research on computer-generated self-explanation prompts**. That is exactly
   what we would be shipping. We are in the gap they named — which is an argument for instrumenting
   it (§9), not for skipping it.

Heterogeneity is large and largely unexplained (Q = 196.63, df = 68, p < .001), and the studies are
mostly short-duration lab or single-session classroom work. Nothing here speaks to whether compliance
survives months of daily use.

### 4.2 Which prompt: explain the correct answer, not your own error

**The direct head-to-head.** Siegler (1995) compared three conditions:

1. feedback only
2. **"why do you think that?"** — explain your own reasoning
3. **"how do you think I knew that?"** — explain the *correct* reasoning

Condition 3 was the most effective, beating both bare feedback and self-explanation of one's own
reasoning. Both research lanes surfaced this independently, and the scheduling lane calls it "the
single most transferable design instruction in this review."

**Provenance and its limits (tier C).** Neither lane read Siegler 1995 directly; both reached it via
Metcalfe's 2017 *Learning from Errors* review. The study is developmental work with children on
number conservation. The generalisation to adults doing MCAT items is substantial, and this single
study should not carry the decision alone.

**It does not have to, because four independent lines converge on the same answer:**

- **Bisra.** "Type of self-explanation elicited" is one of only three moderators of twenty that
  showed a practically meaningful difference. Prompt direction demonstrably matters, even though
  Bisra does not by itself tell us which direction wins.
- **Große & Renkl.** Exposure to incorrect solutions produced new types of effective
  self-explanation but **substantially reduced the amount of principle-based self-explanation**,
  which the authors call "very important" (tier B). This is a *mechanism* for the Siegler result:
  attention spent on the error displaces attention on the principle. Asking "why did you pick B?"
  spends the learner's limited elaboration budget on the wrong object.
- **Grimaldi & Karpicke.** Presented errors harm memory; generated errors help. Asking a learner to
  re-articulate their wrong answer re-presents the error as text, which is closer to the harmful
  condition than to the beneficial one. The corollary in the display lane is blunt: **an error view
  should be a re-attempt surface, not a reading surface.**
- **Zwaan and Pilgrim (§2.3).** "Why did you pick what you picked?" asks the learner for a causal
  self-report that experts cannot produce reliably and that learners produce with a bias that is
  worst in the weakest students. The prompt is not merely less effective — it collects a field we
  have separately decided not to store.

**Conclusion.** Prompt the correct principle. Confidence in the *direction* is high because four
independent lines agree; confidence in the specific Siegler *numbers* is low because the study is
secondary-cited, developmental, and on a different task.

### 4.3 When to fire it: not universally

**Suppress on rapid guesses.** There is no reasoning to report (§3.2).

**Suppress where prior knowledge is weak.** Große & Renkl found an aptitude–treatment interaction,
**replicated in Experiment 2**: mixing correct and incorrect solutions improved far transfer *only*
for learners with favourable prior knowledge. For learners with poor prior knowledge, **correct
solutions only was better** (tier B). An MCAT population is heterogeneous on exactly this dimension,
so a single error-review treatment applied to everyone is the wrong default. The gate is prior
mastery of the relevant KC, which the mastery model already estimates. **Errors should be a layer on
top of the concept, not the entry point to it.**

**Fire on high-confidence errors** (hypercorrection, §3.1) **and repeat failures on the same KC.**

### 4.4 Why universal application is the failure mode

Exam wrappers — structured post-assessment reflection on what you got wrong and why — are the
closest studied cousin of a universal reflection prompt, and are the one version of this practice
that has been tested at scale.

- A 2025 literature review covers **30 studies, of which only five were randomised controlled
  trials** (ERIC EJ1479768, `[read]`). Its study identification used chain-referral sampling from 20
  seed articles rather than a systematic protocol; the authors acknowledge sampling bias.
- The review is positive in tone while its own tables record: Soicher & Gurung (N = 86) no
  achievement or metacognition difference; Stephenson et al. no final-exam effect and no effect on
  course drop rates; Hodges et al. (2020) "limited metacognitive gains"; Knight et al. (2022,
  N = 496) frequency of metacognitive responses **not predictive** of grade increase; Chen et al.
  (2017) prediction accuracy associated with **incoming standardized test scores, not wrappers**.
- A 2019 pharmacy study found exam-score differences **not significant, p = 0.142**, with
  self-selected groups.
- Stephenson et al.'s sample sizes (N = 289 quasi-experimental, N = 752 RCT) are attributed by the
  review to a 2017 paper the lane **could not confirm** is the same work as the 2018 ITiCSE paper.
  **Treat N = 752 as provisional.**

Stephenson's own recommendation is worth quoting: instructors considering wrappers "should review
the evidence for other possible interventions that may more effectively serve the same goals."

**Reading.** The mechanism (induced self-explanation, g = 0.55) is well evidenced. The ritual
(reflect on every assessment, on a schedule, as a practice) is repeatedly null. The difference
between them is targeting and compliance, which is why this spec fires the prompt selectively.

---

## 5. Data model

One record per attempt, **across every activity type** — recall, lesson, practice, timed passage.
Recording scope and display scope are different decisions (§6.4).

| Field | Purpose | Evidence |
| --- | --- | --- |
| Item, chosen option, correct | Base | — |
| **Distractor misconception tag** | The actionable diagnostic signal | Best-validated signal in the area; Marsh et al. on reasoning-driven persistence |
| **Confidence** (binary, pre-reveal) | Routes both branches in §3.1 | Butler/Karpicke/Roediger 2008; hypercorrection literature |
| **Response time** | Rapid-guess detection; effort confound | α = .97; Wise & DeMars 0.59 SD |
| **Activity type** | Errors carry unequal diagnostic weight | Wise & DeMars; local dependence within passages |
| Attempt index, time to re-attempt | Slip evidence without inferring a cause | Immediate unprompted reversal is *evidence* of a slip |
| Self-explanation text, when prompted | Selective; only where it changes the next action | Bisra g = 0.55, with §4.3 gates |
| ~~Cause label~~ | **Do not store as fact** | κ = 0.000–0.063; §2.3 |

**Treat the misconception tag as a hypothesis, not a fact.** Per Treagust and Haladyna, a distractor
tag must be validated against whether it predicts later responses.

**Weight errors unequally.** Low-stakes errors are discounted relative to timed ones (Wise & DeMars,
0.59 SD, effort unrelated to ability). Within-passage errors are discounted for local dependence.
**Nobody has measured the relative diagnostic weight of a flashcard vs a lesson question vs a timed
passage error** — the weights are a defensible guess, and §10 makes them measurable.

**Track correct-but-uncertain as a first-class event**, not a footnote to errors.

**If a cause dimension is kept at all**, keep it to a soft binary used for scheduling only, and
never surface it to the learner as a message.

---

## 6. The Mistakes surface

### 6.1 Scope, after narrowing — and what that costs

The Mistakes tab carries **two** surfaces, not four:

| Surface | Lives | Why |
| --- | --- | --- |
| **A. Misconception patterns** (§6.5) | Mistakes tab | Content-grain diagnostic claims; nowhere else to put them |
| **B. Question history** (§6.6) | Mistakes tab | Lookup tool; the one thing a flat list is good at |
| ~~Forward queue: what is scheduled and why~~ | **Home** | The learner already goes there daily; a queue on a tab named "Mistakes" is a queue nobody opens |
| ~~Decay / calibration read~~ | **Progress and Skills** | Already populated with per-lesson and per-skill P(L); a second competing account of learner state is worse than one good one |

**The cost of this split, stated plainly.** The single best-evidenced reason for showing a learner
any record — correcting the retention blind spot Karpicke measured, where learners predicted ~50%
for conditions that landed at 33% and 80% — **travels with the decay read to Progress.** It does not
justify this tab any more.

What is left is justified on weaker grounds, and the spec should not pretend otherwise:

- **Surface A** rests on a signal that is well validated (distractor-level misconception mapping)
  displayed in a way that is **not** validated. Tier D on the display question.
- **Surface B** is genuinely evidence-neutral. No controlled study says a question log helps; none
  says it hurts. Decided on cost and utility, not on evidence.

**Two consequences follow.** First, build both cheap and instrument them (§9); do not invest heavily
here until §10 Q1 is answered. Second — and this is the important one — **with the queue gone, this
tab is at risk of becoming a pure reading surface**, which is the specific failure mode the evidence
warns about. Re-displaying a learner's past wrong answer as text without a re-attempt is closer to
Grimaldi & Karpicke's *harmful* presented-error condition than to anything beneficial. Therefore:

> **Cross-cutting rule for this tab: every pattern and every history row must carry a re-attempt
> action as its primary affordance. Nothing on this tab is read-only.**

### 6.2 The honest evidential position

The artifact is **unevidenced**, which is different from disproven:

- No controlled study of LSAT blind review exists.
- No English-language controlled study of Chinese error notebooks (`错题本` / *cuoti ben*) exists,
  despite enormous adoption. The lane could not access CNKI and **cannot claim the practice is
  unevidenced globally — only that it could not find evidence.** The clearest case in the corpus of
  practice mass vastly exceeding evidence mass.
- Drake et al. (2021), *PRiMER* 5:26 — the only study found that measures reviewing missed questions
  against an outcome — surveyed **51 respondents of 205 invited (25% response rate) at a single US
  medical school** and found reviewing incorrect answers had no association with Step 2 CK score
  (tier C). **With n = 51 from one school, this null is close to uninformative.** What the same study
  *did* find: percent of question bank completed correlated r = .290, and in hierarchical regression
  controlling for entry pathway, MCAT percentile and Step 1, **only completing more questions
  remained predictive, and "the impact was small."**
- Exam wrappers, the closest tested cousin, are repeatedly null (§4.4) — but they test the
  *reflection ritual*, not the record.

**The mechanisms a record can deliver are well evidenced; the container is not.** Build the
mechanisms; do not assume the container adds anything.

| Mechanism | Evidence | Direction |
| --- | --- | --- |
| Error generation followed by correct-answer feedback | Decades of controlled work | Clearly positive |
| Prompted self-explanation | g = 0.55 | Clearly positive |
| Re-retrieval of previously missed items | Very large effects | Positive — **but see the trap in §6.4** |
| A dashboard summarising accumulated performance | Systematic review, 38 studies | No detectable effect on achievement |

### 6.3 Measured downside risk

- **Learning analytics dashboards.** Kaliisa et al. (2024), *LAK '24*: 527 records screened → **38
  studies**; on achievement, **26 of 34 effects (76.5%) negligible or small**. Every medium and
  large effect is confounded — two of three medium effects compared dashboard users against
  non-users; the third measured a *teacher* intervention triggered by the dashboard. Authors'
  verbatim conclusion: **"As we currently stand, there is no evidence to support the conclusion that
  LADs can improve academic achievement."** They could not meta-analyse; too few congruent designs.
- **Relative performance feedback actively harms.** Azmat et al.'s field experiment found it
  **reduced GPA** while active and produced a **lasting decline after removal**. **This is a direct
  warning about Ghost Rival**, which is relative performance feedback in exactly the tested form.
  The existing brainlift guardrail addresses panic-rushing; the measured risk is different and
  worse. Ship it instrumented as an experiment, not as an assumed engagement win.
- **The same display can help and harm simultaneously.** Beheshitha et al.: one visualisation helped
  mastery-oriented students and harmed performance-avoidance students — same display, opposite signs.
- **Growth-mindset framing will not rescue it.** Usually invoked to make failure displays safe; the
  effect is near-zero after correcting for publication bias.
- **Borrow from the right literature.** Open learner models use assessment data **100%** of the time
  versus **37%** for dashboards — most dashboards show learners how much they *clicked*, which has no
  reason to change achievement. When building "show the learner our model," borrow from OLM, not LAD.

### 6.4 Two constraints that survive the narrowing

**The trap, which now applies to the relocated queue rather than to this tab.** Karpicke & Roediger
(2008): dropping already-correct items from repeated retrieval cut one-week recall from **~80% to
36% and 33%**, **d = 4.03**, non-overlapping distributions. The refinement is precise — the condition
that stopped *studying* correct items but kept *testing* them matched full repetition at ~80% while
doing strictly less work. **Stop re-teaching a mastered item; never stop re-testing it.** Our FSRS
recall already schedules everything rather than only failures, so the existing system is on the right
side of this. **The queue moving to Home must not change that**: the Home queue is seeded by the
scheduler across all items, not by the error log.

**The calibration justification, recorded here because it moves out of scope.** In the same study,
learners **could not distinguish the 33% condition from the 80% one in advance, predicting roughly
50% for all of them** (tier A). That measured blind spot is the strongest reason to show a learner
any record of their own state, and it now belongs to the **Progress/Skills decay read**. Whoever
builds that surface should build it to correct this specific blind spot — not for motivation, and not
for reflection.

**Record everywhere, display narrowly.** The mastery model consumes attempts from every activity
type (§5). This tab displays **question attempts only — adaptive practice and study alike**,
excluding recall lapses and in-lesson comprehension checks. An FSRS "Again" is the scheduler hitting
its target retention, not a mistake; in-lesson checks occur during acquisition, where errorful
generation is the mechanism doing the work. Labelling either as a mistake is both wrong and
discouraging. Rapid-guess-filtered responses (§3.2) never appear at all.

> **Amended 2026-07-28** from "practice questions only." That wording predated the study loop
> sharing this display and read as a surface restriction, but the line it was drawing is a *kind*
> restriction: keep scheduler lapses and acquisition-time checks off the tab. A study question is a
> genuine, scored, independent question attempt that the learner experiences as a question they got
> wrong, so excluding it made a real miss unreachable — the same class of gap that made adaptive
> practice misses invisible before §6.4 landed. The two exclusions above are unchanged and are
> enforced at the write, not at the read: recall never writes to the attempt log, and guided-phase
> items are dropped before it.

---

### 6.5 Surface A — misconception patterns

**What a pattern is.** A misconception tag (§5) recurring across **distinct items**, stated as a
claim about the learner's answers rather than about the learner.

> ✅ "Across 11 items, your answers are consistent with reversing the sign convention on ΔG."
>
> ❌ "You reverse sign conventions." · ❌ "You rush." · ❌ "You are a careless test-taker."

**Admissible grains, in descending confidence:**

| Grain | Admissible | Note |
| --- | --- | --- |
| Misconception tag | **Yes — primary** | Best-validated signal; a claim about belief |
| KC / content area | **Yes** | Same basis as the mastery model. **One KC vocabulary across both surfaces** — see the note below |
| Reasoning operation (7-op tag) | **Yes, with care** | The operation is a property of the *item*, so it is a content claim, not a cognitive attribution. But it *reads* to users as a trait claim, so wording matters more here than anywhere else on the tab |
| Cause | **Never** | §2.3 |

> **Note, 2026-07-28 — the KC id space is shared; there is no crosswalk.** A pattern groups on the
> logged KC, so the two write paths have to agree on what a KC id *is*. They now do, and no mapping
> layer is involved: the lesson graph (`curriculum/v3/v3-lesson-authoring-manifest.json`) and the
> question corpus (`questions.kc_id`) carry **the same 422 knowledge components — 422 distinct ids in
> each source, all 422 present in both, none unique to either side.** Study previously logged
> `internal_skill_ids[0]` instead, a node in the *internal skill graph* (`bb1-enzyme-inhibition`), which
> could never compare equal to a corpus KC (`V3-KC-525816`) — so one concept produced two
> half-evidenced patterns on the surface whose only job is to say "this keeps happening". The fix was
> to log the field the item already carries. **Do not build a KC crosswalk, mapping table or
> id-translation layer**; the id spaces are not disjoint. What *is* per-surface is `question_id`:
> practice items come from the corpus and study items from the authored lesson bank, which is why the
> attempt log's uniqueness key includes `activity_type`.

**Evidence threshold.** No study sets this number; it is ours to choose and then validate. The rule:

1. Count **distinct items**, not attempts. Repeated attempts on the same item are not independent
   evidence.
2. Discount items from the same passage for local dependence.
3. Exclude rapid guesses before counting (§3.2).
4. Require the tag to appear at a rate distinguishable from its base rate across the cohort, not
   merely to appear more than once. A distractor chosen by 60% of all learners is an item property,
   not a learner pattern.
5. **Do not assert a pattern from four items.** Ellerton & Clements found the careless share of
   errors on a single question ranged from **1% to 71%**, which suggests item variance may dominate
   learner variance — so a small-n "pattern" is most likely an artifact of which items came up.

**Always display the evidence count and a hedge.** "11 of 14 items with this tag" — never a bare
assertion, never a percentage without its denominator.

**Patterns expire.** A misconception last observed two months ago and not seen since is not a current
pattern. Expiry is required; the exact window is a scheduling parameter (§8).

**Every pattern row ends in a re-attempt action** (§6.1), targeting other items carrying the same
tag. A pattern the learner can only read about is the failure mode.

**Tags are hypotheses under test, not facts.** Per Treagust and Haladyna, a distractor tag must be
validated against whether it predicts later responses. Concretely: track whether an asserted pattern
predicts the learner's next response on unseen items sharing that tag. **A tag that does not predict
gets retired**, and the tag vocabulary should shrink over time rather than grow.

**This surface is contingent on an open empirical question.** §10 Q1 — the variance decomposition of
error type into learner, item and occasion components — determines whether learner-level patterns
exist at all in our data. **If item variance dominates, Surface A should not be built.** Answer that
before investing beyond a thin version.

---

### 6.6 Surface B — question history

**What each row shows:** the actual question stem, the option the learner chose, the correct option,
the elaborated feedback that was given at the time, the date, and the misconception tag.

The current build renders `e.skillId` and a cause label, which means it fails at the one job a flat
list is good at. **Show the question.**

**Default view is recent and unresolved.** The full archive sits behind a filter. This is deliberate:
an infinitely growing wall of past failures is where the motivation risk in §6.3 lives, and nothing
requires the default view to be that wall. Lookup is still fully served by search and filters.

**Primary action on every row is "try again," not "read"** (§6.1).

**Sort and filter:**

| Control | Default | Basis |
| --- | --- | --- |
| Recency | Default order | — |
| **Confidence in the error, descending** | Offered | Hypercorrection is replicated across ~two dozen studies at immediate and delayed retest; high-confidence errors are the most correctable, and the display lane calls ranking by confidence-in-error "a prioritisation rule we can implement cheaply" |
| Misconception tag | Offered | Links Surface B to Surface A |
| KC / content area | Offered | — |
| Free-text search over stems | Offered | The actual lookup use case |

**Include low-confidence correct answers**, marked distinctly. A correct answer the learner did not
trust is the higher-value event (§3.1), and a misses-only list is the Karpicke losing shape (§6.4).
This is the one respect in which "Mistakes" is a misnomer for the tab.

**No running total of mistakes. No streak. No cohort comparison.** See §6.3 — relative performance
feedback reduced GPA in Azmat's field experiment, with a lasting decline after removal.

---

### 6.7 Not on this tab

| Removed | Replaced by | Why |
| --- | --- | --- |
| Cause label as card headline | Misconception tag | §2.3 — the highest-priority single change |
| "Repair pending / repaired" pill | Scheduling state, or nothing | The pill is an artifact of the cause-and-repair flow |
| Forward queue | Home | §6.1 |
| Decay / calibration read | Progress and Skills | §6.1 |
| Recall lapses, lesson errors | — | Recorded, never displayed here (§6.4) |
| Rapid guesses | — | Filtered before the pipeline (§3.2) |
| Running mistake count | — | §6.6 |

---

## 7. Explicitly not building

| Not building | Why | Tier |
| --- | --- | --- |
| Cause self-report picker | κ = 0.000–0.063; learner bias worst in weakest students | A |
| ~~Withholding the correct option~~ — **superseded 2026-07-28, see §3.3** | .71 vs .71 on MC; timing g = 0.03 ns. The evidence is unchanged; the decision was made by the product owner against it, on the reading that .71 vs .71 makes the withhold cost-neutral for learning | A |
| Retry by re-showing options | .42 vs .72; telemetry cannot distinguish | B |
| Free-text reflection box | Bisra's effect is for *induced, scripted* prompts only | A |
| "Why did you pick that?" prompt | Siegler's losing condition; asks for an unreportable causal attribution | C + A |
| Misses-only review queue | Karpicke & Roediger, d = 4.03 | A |
| Elaborated treatment after correct answers | Pashler et al. 2005 — no benefit, confident or not | A |
| A "you are a careless test-taker" learner-level label | Two detectors correlate −0.21, predict in opposite directions; item variance may dominate | A |

---

## 8. Deferred to the scheduling workstream

Both have clear evidence. Neither is an error-handling decision, and both are recorded here so they
are not lost.

**Delay the post-error re-test much longer than feels right.** Pashler, Zarow & Triplett: long
post-error delays cut same-day accuracy from **85% to 55%** but roughly **doubled next-day
retention, 22% to 43%** (tier A, both experiments, both materials, including after errors). Anki's
10-minute relearning step — which the newly merged `packages/recall-core` inherits as
`RECALL_RELEARNING_STEPS = ['10m']` — is an expanding-retrieval schedule whose expanding component
Karpicke & Roediger found contributes nothing long-term, and FSRS's own documentation justifies short
steps on the grounds that longer ones interfere with the scheduler, **not on memory grounds**.

**Escalate from re-testing to re-teaching at roughly three failures.** Butler found items never once
retrieved correctly across three attempts, with the answer shown each time, sat at **13% recall a
week later** (tier B). Past that point, re-testing merely confirms that remediation has not happened.
`packages/recall-core/src/leech.ts` currently uses Anki's threshold of **8 lapses**, which has **no
published basis**. The FSRS maintainers' proposed replacement — a Poisson-binomial test asking
whether the item failed *more than the model expected* — is the right shape; adopt the shape rather
than any specific threshold.

**Schedule the correction, not the item.** Butler, Fazio & Marsh (2011): 86% of errors corrected
immediately, **56% at one week**, with **high-confidence errors preferentially returning** once the
correction decays. This makes confidence a first-class scheduling input.

**Also relevant, belongs to the mastery workstream.** p = 0.95 is Corbett & Anderson's *convention*,
not a derived threshold, and Cen et al. found **58% of practice in a deployed tutor occurred past
mastery with no learning cost to removing it**. Given that the diagnostic-as-BKT-prior analysis
showed a perfect prior saves only ~0.5 items per KC, the threshold is a far larger source of
recoverable learner time than the prior is. **Now re-measured, and the conclusion strengthens while
the figure it rested on does not survive.** Re-run on the form a learner is actually served
(`packages/policies/src/mastery-seed-value.ts`, 24,500 lesson seeds over 250 learners), a prior with
perfect knowledge held inside the shipped seeding bounds is worth **−0.07 items**: it costs items
rather than saving them, because two all-correct answers need a prior of 0.454 while the cap is 0.40,
so the oracle cannot gain on the learners it raises and loses an item on every learner it drops to the
floor. The diagnostic's own seed moves the decision for **0.029% of lesson-learner pairs, always by
one item, always later**, at unchanged false mastery. The prior is therefore not a small source of
recoverable learner time; it is none, and the threshold is the only one of the two that is a lever at
all. **But it is a coarser lever than it looks.** `P(L)` arrives in jumps — 0.57, 0.86, 0.97 from the
flat default — so every threshold in (0.865, 0.968] costs the same three items and moving 0.95 to 0.90
changes nothing whatsoever. The first value that buys an item is **0.86**, and it buys 0.58 items for
2.7 points of false mastery. Cen et al.'s over-practice finding is about the evidence ladder rather
than this count, so the two claims are additive and neither substitutes for the other.

---

## 9. Measurement plan

**Instrument delayed retention from day one.** Finn & Metcalfe's scaffolding advantage did not appear
until a one-day delay — at immediate test the conditions were **.76 vs .77**. A same-session A/B test
would miss the effect entirely or favour the wrong arm.

**Evaluate on new, unseen items — never on the logged ones.** Error management training's moderator
structure puts the payoff **in transfer, not in practice performance**: d ≈ 0.80 on adaptive
transfer, versus **d = 0.15, not significant**, within training. Re-testing a missed item and
watching accuracy rise is the measure that shows nothing.

**Do not trust engagement metrics.** Versteeg et al.'s medical-education RCT changed learner
behaviour significantly (**p = 0.007**) and moved exam scores not at all (**6.6 vs 6.6**).

**Expect satisfaction metrics to point the wrong way.** Learners who benefited ~20 points from
errorful practice reported preferring the error-free condition immediately after experiencing the
opposite. **Decide in advance not to optimise against satisfaction on this feature.**

**Beat MOVING-AVG before shipping any model** (§1).

**Ship the self-explanation prompt behind an experiment**, since Bisra's authors explicitly flag
computer-generated prompts as unstudied (§4.1).

---

## 10. Open questions we are positioned to answer

None of these exist in the literature; all are computable from our own data.

1. **Variance decomposition of error type** into learner, item and occasion components. Ellerton &
   Clements found the careless share of errors on a single question ranged from **1% to 71%**. If
   item variance dominates learner variance, "this learner is careless" is the wrong abstraction
   entirely — and that finding would retire a whole category of feature.
2. **Diagnostic weight by activity type** — flashcard vs lesson question vs timed passage. Currently
   guessed (§5).
3. **A failure-count escalation rule.** The tutoring literature measures over-practice past mastery;
   the memory literature measures criteria for successful recall. Nobody has measured the threshold
   at which re-testing should become re-teaching.
4. **Coarse vs fine error taxonomies.** No study has randomised learners to different taxonomy
   granularities, so "how many categories" is genuinely unanswered.
5. **Whether a computer-generated self-explanation prompt reproduces g = 0.55.** Named as an open
   question by Bisra et al. themselves.

---

## 11. Evidence index — the load-bearing sources

| # | Source | Carries | Tier |
| --- | --- | --- | --- |
| 1 | Butler, Karpicke & Roediger (2007) | .71 vs .71 on MC — no learning difference either way (see §3.3, amended 2026-07-28) | A |
| 2 | Kandemir et al. (2026) | Feedback timing g = 0.03, ns | A `[abstract]` |
| 3 | Butler, Karpicke & Roediger (2008) | Feedback ≈ doubles retention of low-confidence correct | A |
| 4 | Zwaan et al. (2017) | κ = 0.000–0.063; hindsight 1.75→3.44 | A |
| 5 | Pilgrim et al. | 81% vs 40% "simple"; worst in weakest students | A |
| 6 | Bisra et al. (2018) | Self-explanation g = 0.55, 64 comparisons | A |
| 7 | Siegler (1995) via Metcalfe (2017) | Explain-correct > explain-own > feedback-only | C `[secondary]` |
| 8 | Große & Renkl | ATI on prior knowledge; principle-explanation displacement | B |
| 9 | Grimaldi & Karpicke (2012) | Presented errors harm, generated errors help | B `[secondary]` |
| 10 | Karpicke & Roediger (2008) | 80% vs 33–36%, d = 4.03; JOLs ~50% for all | A |
| 11 | Butler & Roediger | 75% of intrusions were previously chosen lures | A |
| 12 | Marsh, Roediger, Bjork & Bjork (2007) | Persistence via reasoning, not familiarity | B `[abstract]` |
| 13 | Finn & Metcalfe | .42 vs .72; .76 vs .77 at immediate test | B |
| 14 | Ashman, Kalyuga & Sweller | Instruction-first d ≈ .56 on high element interactivity | B |
| 15 | Pashler et al. (2005) | +494% at one week; nothing after correct answers | A |
| 16 | Wise & DeMars | 0.59 SD effort gap, unrelated to ability | A |
| 17 | Rapid-guess detection literature | α = .97, chance-level scores | A |
| 18 | Kaliisa et al. (2024) | Dashboards: 76.5% negligible/small, all large effects confounded | A |
| 19 | Azmat et al. | Relative performance feedback reduced GPA, lasting | A |
| 20 | Exam wrapper review (2025, EJ1479768) | 30 studies, 5 RCTs, mostly null | B |
| 21 | Drake et al. (2021) | n = 51; near-uninformative null | C |
| 22 | Butler, Fazio & Marsh (2011) | 86% → 56%; high-confidence errors return | B |
| 23 | SRS Benchmark | MOVING-AVG 0.3369 beats FSRS-7 0.3437 on log loss | B |
| 24 | Ellerton & Clements | Careless share per question, 1%–71% | B |

---

## 12. Citation risk register

Checked during this revision:

- **Drake et al. was previously cited in this document as "1,092 examinees." It is 51 respondents of
  205 invited at a single medical school.** The corrected figure materially weakens the claim that
  reviewing incorrect answers has no association with score — that null is now close to
  uninformative, and the honest position on error logs is *unevidenced*, not *disproven*.
- **"Exam wrappers: 38-study review, 4 randomised" was wrong.** 38 studies is Kaliisa's *dashboard*
  review. The exam wrapper review covers **30 studies with 5 RCTs**. The two were conflated.
- **N = 752 for Stephenson et al. is provisional** — the lane could not confirm the attribution.
- **Fox, Ericsson & Best** was cited in the previous version's summary table for verbalisation
  reactivity and has **no backing entry in any lane file**. Removed from this revision; verify before
  reintroducing.
- **Kandemir's confidence interval** is reported as [−0.08, 0.13] in one lane and [−0.09, 0.15] in
  another. Both straddle zero; the point estimate g = 0.03 is consistent.
- A previous revision cited Keith & Frese via a PDF mirrored on an unrelated commercial domain;
  replaced with the DOI. One lane self-reported removing a URL it had fabricated.

**Standing rule: verify any figure in this document against the lane file, and the lane file's
provenance tag, before it goes outside the team.**
