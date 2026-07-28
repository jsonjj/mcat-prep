# What To Do With An Error — Reading List

Scope: once a learner gets something wrong, what should change about (a) the schedule, (b) the
mastery estimate, and (c) what they see next. Companion to `diagnostic-reading-list.md`, which
covers the placement decision rather than the ongoing loop.

## Provenance conventions

`[read]` — full text retrieved and the cited numbers checked against it.
`[abstract]` — abstract, publisher landing page, or press release only. Numbers unconfirmed.
`[secondary]` — the number comes from another paper's or another author's description of the work.

**Evidence tier is marked separately for anything in the FSRS / Anki / SuperMemo orbit**, because
these are routinely cited as if they were one literature and they are not:

| Tier | Meaning | What it can support |
| --- | --- | --- |
| `peer-reviewed` | Published in a refereed venue | Ordinary citation |
| `benchmark` | Public, reproducible evaluation on real review logs; not refereed | Claims about *prediction accuracy*, nothing about *learning outcomes* |
| `dev-doc` | Official documentation of a shipped product | What the software does. Not why it is right |
| `community` | Forum posts, wikis, blogs by maintainers | Design rationale and open questions only |

The single most important framing point in this document: **the FSRS evidence base measures how
well a model predicts whether you will recall a card. It does not measure whether the resulting
schedule teaches you more.** Those are different claims and the second one has never been tested
for FSRS in a controlled study.

---

## Q1. What do FSRS, SM-2 and Anki actually do on a lapse, and why?

### 1. Anki Manual — Deck Options (Lapses) and Leeches. `[read]` `dev-doc`

<https://docs.ankiweb.net/deck-options.html> · <https://docs.ankiweb.net/leeches.html>

**DOK 1**

- **Relearning Steps** default `10m`. "If you leave the steps blank, the card will skip relearning,
  and will be assigned a new interval of 1 day by default."
- **Minimum Interval** default **1 day** — the floor after relearning finishes.
- **New Interval** default **0.00**. The manual: "The default 0.00 means that a review card's delay
  is reset to zero when you forget it (which then becomes 1 day after the minimum interval is
  applied)." Worked example given: a 100-day interval with New Interval 0.20 becomes 20 days.
- **Leech threshold** default **8** lapses; on reaching it the note is tagged and the card
  suspended. Repeat warnings fire "at half the initial leech threshold" — so with a threshold of 8,
  again at 12, 16, and so on.
- Under Anki's SM-2: `Again` decreases ease by **20 percentage points** and multiplies the interval
  by New Interval; `Hard` decreases ease by **15 percentage points** and applies a 1.2× hard
  interval. Ease has a hard floor of **130%**, justified in the manual by the claim that "Anki's
  research showed that eases below 130% tend to result in cards being shown more often than is
  useful and annoying users."

**DOK 2**

- Every one of these numbers is a **product default with no published derivation**. The manual's
  own justification for New Interval = 0 is an appeal to SuperMemo's authority, not to a
  measurement: "While preserving part of the interval may seem to make sense, SuperMemo has
  observed that preserving part of the delay can actually be counter-productive."
- The 130% ease floor is justified by an explicitly *unpublished* internal analysis and by user
  annoyance — a UX constraint wearing a psychometric costume. If we import an ease floor, we should
  know we are importing a complaint-rate heuristic.
- **What this does not license:** citing "Anki resets the interval to zero" as evidence that
  resetting is correct. It is evidence that resetting is popular.

### 2. FSRS post-lapse stability formula (ts-fsrs / fsrs-rs source; Expertium's technical explainer). `[read]` `dev-doc` + `community`

<https://open-spaced-repetition.github.io/ts-fsrs/classes/FSRS.html> ·
<https://expertium.github.io/Algorithm.html> ·
<https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/simulation.rs>

**DOK 1**

- Post-lapse stability:
  `S'_f(D,S,R) = w₁₁ · D^(−w₁₂) · ((S+1)^w₁₃ − 1) · e^(w₁₄·(1−R))`,
  then clamped to `min(max(S'_f, 0.01), S)` with short-term reviews disabled, or to
  `min(max(S'_f, 0.01), S / e^(w₁₇·w₁₈))` with them enabled.
- Expertium on the clamp: "min(…, S) is necessary to ensure that post-lapse stability can never be
  greater than stability before the lapse."
- So FSRS's answer to "reset or multiply?" is **neither**. Post-lapse stability is a *fitted
  function* of difficulty, pre-lapse stability, and retrievability at the moment of failure, with
  four dedicated parameters (w₁₁–w₁₄). Anki's `New Interval` setting is **ignored** when FSRS is on
  (<https://github.com/open-spaced-repetition/fsrs4anki/issues/142>).
- Difficulty update on lapse, in the maintainer's own summary: "Again = add a lot, Hard = add a
  little bit, Good = nothing, Easy = subtract a little bit," followed by linear damping near D=10
  and mean reversion toward w₄.
- Acknowledged model defect: "The current definition of D is flawed: it doesn't take R into
  account… properly defined difficulty must depend on retrievability, not only on grades." The
  maintainers tried adding R to D and "it didn't improve the accuracy."
- Calibration honesty from the same source: on one of the author's own decks, mean absolute
  percentage error for predicted stability as a function of D is **~33%**; as a function of
  previous S, **12%**.

**DOK 2**

- The strongest structural idea here, and the one worth stealing: **the post-lapse state should
  depend on how far the item had already come (S), how hard it has historically been (D), and how
  overdue it was (R)** — not on a constant. An item failed at R = 0.95 is a different event from an
  item failed at R = 0.40, and a fixed multiplier cannot tell them apart.
- The clamp `S_post ≤ S_pre` encodes an assumption worth stating out loud: **failure never
  increases durability.** That is an assumption, not a finding. It is in tension with the
  error-generation literature in Q4, where a failed retrieval followed by feedback beats not
  attempting at all. FSRS is not modelling learning; it is modelling the memory trace of a card,
  and it treats the corrective feedback as invisible.
- **What this does not license:** treating the four post-lapse parameters as measured constants of
  human memory. They are curve-fitting coefficients whose values are fitted per user, and the
  functional form was chosen because it fit, not because it was predicted.

### 3. SRS Benchmark (open-spaced-repetition/srs-benchmark). `[read]` `benchmark`

<https://github.com/open-spaced-repetition/srs-benchmark/blob/main/README.md> ·
narrative version: <https://expertium.github.io/Benchmark.html>

**DOK 1**

- Dataset `anki-revlogs-10k`: **~727 million reviews from 10,000 Anki users**. After excluding
  same-day reviews, manual due-date changes, non-rescheduling filtered decks, and outliers:
  **9,999 collections and 349,923,850 reviews** used for evaluation. With same-day reviews
  included: 10,000 collections, **519,296,315 reviews**.
- Evaluation is `TimeSeriesSplit` with 5 folds — train on older reviews, test on newer. Parameters
  are optimised **per user**. Averages are weighted by review count.
- Log loss, no same-day reviews (lower is better, 99% CIs):

  | Algorithm | Params | Log Loss | RMSE (bins) | AUC |
  | --- | --- | --- | --- | --- |
  | RWKV-P | 2,762,884 | **0.2773±0.0036** | 0.02502 | **0.8329** |
  | LSTM | 8,869 | 0.3332 | 0.05378 | 0.7329 |
  | **MOVING-AVG** | **0** | **0.3369±0.0042** | 0.05915 | 0.7001 |
  | Logistic Regression | 34 | 0.3393 | 0.0604 | 0.7108 |
  | FSRS-7 | 35 | 0.3437±0.0043 | 0.0655 | 0.7069 |
  | FSRS-6 | 21 | 0.3460 | 0.0653 | 0.7034 |
  | FSRS-5 | 19 | 0.3560 | 0.0741 | 0.7011 |
  | FSRS-4.5 | 17 | 0.3624 | 0.0764 | 0.6893 |
  | FSRS-7 default params | 0 | 0.3629 | 0.0910 | 0.6944 |
  | FSRS v4 | 17 | 0.3726 | 0.0838 | 0.6853 |
  | **AVG (baseline)** | **0** | **0.3945** | 0.1034 | 0.4997 |
  | FSRS v3 | 13 | 0.4364 | 0.1097 | 0.6605 |
  | HLR (Duolingo) | 3 | 0.4694 | 0.1275 | 0.6369 |
  | Ebisu v2 | 0 | 0.4989 | 0.1627 | 0.6051 |

- FSRS-6 with recency weighting has **99.6% superiority over Anki SM-2** — lower log loss for
  99.6% of users. The benchmark authors immediately caveat it: "SM-2 wasn't designed to predict
  probabilities, and the only reason it does that in this benchmark is because extra formulas for
  converting intervals given by SM-2 into probabilities were added on top of it. There is no way to
  have a truly fair, no caveats, comparison."
- FSRS-6 optimised vs. FSRS-6 with default parameters: **84.3% superiority**. In ~16% of
  collections the per-user optimisation fails to generalise to held-out data.
- The adversarial baseline `RMSE-BINS-EXPLOIT` achieves the **best RMSE (bins) in the whole table
  (0.01350)** with a log loss of **4.608**. The benchmark's own calibration metric is gameable and
  the maintainers say so.

**DOK 2**

- **The most useful number in this table for us is MOVING-AVG.** A zero-parameter heuristic that
  simply nudges its estimate up after recent successes and down after recent lapses beats FSRS-7,
  FSRS-6, FSRS-5, FSRS-4.5 and every FSRS version before them on log loss. It loses on RMSE (bins)
  and AUC. Whatever the DSR machinery is buying, at the level of "will they get this right," a lot
  of it is recoverable from recency of failure alone. Before we build anything elaborate for error
  handling, the baseline to beat is "how did the last few attempts go."
- Read the whole FSRS version series as a diminishing-returns curve: v3 → v4 bought 0.064 log loss,
  v4 → 4.5 bought 0.010, 4.5 → 5 bought 0.006, 5 → 6 bought 0.010, 6 → 7 bought 0.002. **Model
  sophistication in this family is nearly exhausted.** The maintainers agree: "FSRS-7 is the final
  version, there will be no major releases in the foreseeable future."
- AUC ~0.71 for FSRS means: given one card you recalled and one you forgot, the model ranks them
  correctly 71% of the time. That is modest. Our mastery estimate should not be asked to carry
  decisions that require much better discrimination than that.
- **What this does not license, and this is the big one:** none of these numbers say FSRS *teaches*
  better. Every metric here is predictive calibration on logs generated by whatever schedule the
  user was already running. A perfectly calibrated forgetting model can still be attached to a bad
  scheduling policy. The lapse policy in particular is nowhere isolated or tested.

### 4. Ye, Su & Cao (2022). A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling. KDD '22, pp. 4381–4390. `[abstract]` `peer-reviewed`

<https://doi.org/10.1145/3534678.3539081>

**DOK 1**

- **220 million memory behaviour logs** with time-series features, from the language app MaiMemo.
- Builds a DHP (Difficulty–Halflife–Probability) memory model with the Markov property, then solves
  for the review policy minimising expected cost to reach a target half-life via stochastic
  shortest path (SSP-MMC).
- Reports a **12.6% performance improvement over state-of-the-art methods**; deployed in production.

**DOK 2**

- This is the closest thing to a peer-reviewed ancestor of FSRS, and it is worth being precise:
  **FSRS itself has no peer-reviewed paper.** It is an open-source project by one of this paper's
  authors, informed by this work. Citing "the FSRS paper" is a category error.
- The framing is the transferable part: treat scheduling as **minimising expected cost to reach a
  memory target**, not as maximising predicted retention. That reframing is what makes "should a
  failed item come back sooner" answerable — sooner is only better if the cost of the extra review
  is repaid.
- **Limitations:** MaiMemo is pre-made vocabulary courses ("same material, different learner");
  Anki and our product are closer to "different material, same learner". The 12.6% figure is
  against the authors' chosen baselines on their own data.

### 5. SuperMemo — Post-lapse stability (supermemo.guru wiki / SuperMemo Algorithm help). `[read]` `dev-doc` (vendor)

<https://www.supermemo.guru/wiki/Post-lapse_stability> · <https://www.super-memory.com/help/smalg.htm>

**DOK 1**

- Post-lapse interval is drawn from a dedicated matrix `PLS[Lapses, R]`, indexed by total lapse
  count and retrievability at the moment of failure. `Int[1] := PLS[Lapses, R]`.
- "It has been shown long ago that the length of the first post-lapse optimum interval is best
  correlated with the number of memory lapses recorded for the item. Even then, **post-lapse
  interval usually oscillates in the range of 1–4 days for the default forgetting index of 10%.**"
- Figure caption for Algorithm SM-15, described as covering **"some 150,000 repetitions"**: newly
  memorised items are optimally repeated after **14 days**, whereas "items that have been forgotten
  10 times… will require an interval of two days."
- On halving intervals after a lapse: "Current data shows clearly that this approach is harmful, as
  it slows down the identification of leeches. Such an approach to handling forgotten items is a
  form of irrational procrastination."
- On the shape of post-lapse forgetting: "post-lapse forgetting curves are often classic examples
  of bad forgetting curves. They show a steep drop in retention and yet keep a very long tail of
  reasonable recall… optimum interval would need to be 1, while after 1 year, the retention is
  still 40%." Consequently, in Algorithm SM-19 **the forgetting-index criterion is not used for
  post-lapse intervals at all**; intervals are randomly dispersed instead.

**DOK 2**

- The 1–4 day post-lapse range is the origin of essentially every "reset to ~1 day" default in the
  ecosystem, including Anki's. **It is a vendor claim about proprietary data with no methods
  section, no released dataset, no independent replication, and no peer review.** It should be
  treated as an informed practitioner's report, not a finding.
- The "40% retention at one year on a post-lapse item" observation is genuinely interesting and
  cuts against the vendor's own recommendation: it says the post-lapse population is a *mixture* —
  some items were genuinely lost, some were failed by accident at low R and are still largely
  intact. A single post-lapse interval serves neither group well. This is the strongest available
  argument for making the post-lapse interval a function of R (which both SM-17+ and FSRS do) and
  against a flat reset (which Anki's SM-2 default does).
- The "identification of leeches" argument is a **throughput argument, not a memory argument**: a
  short post-lapse interval is defended because it surfaces hopeless items faster, not because it
  produces better retention. That is a legitimate design goal, but it is a different goal, and the
  Q2 evidence says it trades against long-term retention.

### 6. FSRS4Anki tutorial and `computeOptimalSteps`. `[read]` `dev-doc` + `community`

<https://github.com/open-spaced-repetition/fsrs4anki/blob/main/docs/tutorial.md> ·
<https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/binding/README.md>

**DOK 1**

- Official guidance: all learning and re-learning steps should complete on the same day; "any steps
  longer than 12–14 hours are not recommended"; "a *single* reasonable learning step can be 10m,
  15m, 20m or 30m."
- "The use of *multiple* short (re)learning steps, such as '5m 10m 15m 30m', is also discouraged.
  However, if you notice that your retention for young cards is much lower than desired, adding
  more intraday learning steps (such as 2h or 4h) may be helpful."
- Stated reason for keeping steps sub-day: longer steps prevent FSRS from scheduling, "making the
  scheduling less optimal," and can make the Hard interval exceed the Good interval.
- The `computeOptimalSteps` tool fits forgetting curves to a user's own revlog and recommends
  steps, but: "at most two learning steps and one relearning step can be recommended… It is also
  possible that no steps are recommended when the data is not suitable." And: "Reducing the number
  of steps can significantly lower retention."

**DOK 2**

- Note the shape of the argument for short relearning steps: it is **an argument about not
  interfering with the scheduler**, not an argument that a 10-minute re-test helps memory. The
  10-minute relearning step exists because it is short enough to stay out of FSRS's way.
- The last quoted sentence is the honest one and should govern our rollout: step configuration has
  large effects and adapts slowly. Any change we make to post-error re-test timing will take weeks
  of user data to evaluate and cannot be A/B'd on a one-week horizon.

---

## Q2. Should a failed item come back sooner, and how much sooner?

### 7. Pashler, Zarow & Triplett (2003). Is Temporal Spacing of Tests Helpful Even When It Inflates Error Rates? *JEP:LMC* 29(6), 1051–1057. `[read]`

<https://gwern.net/doc/psychology/spaced-repetition/2003-pashler.pdf>

**This paper asks our exact question and answers it.** From its introduction: "When the subject
makes an error on an item, should that item be retested sooner rather than later, perhaps in order
to prevent errors from being inadvertently 'stamped-in'?"

**DOK 1**

- **Experiment 1:** 41 UCSD students, ~66 Inupiaq–English word pairs, 200 trials on Day 1 (one
  study exposure, then Test 1 at lag 2, then Test 2 at a randomised lag of 1/2/4/8/16/32
  intervening items, all with corrective feedback), final test Day 2 with no feedback.
  - Test 1 accuracy was flat across lag conditions (short vs long, F(1,40)=0.05, p=.83) — the lag
    conditions were not confounded with item difficulty.
  - Same-day Test 2: **85% correct at short lags, 55% at long lags**, F(1,40)=147.32, p<.001.
  - Next-day final test: **22% at short lags, 43% at long lags**, F(1,40)=89.98, p<.001.
  - Conditional on Test 1 outcome, long lags beat short lags **both** when Test 1 was correct
    (F(1,40)=65.25, p<.001) **and when Test 1 was an error** (F(1,40)=9.60, p<.01).
- **Experiment 2:** 34 students, obscure GRE-style English words, lags to 96, retention interval
  **1 week**. Screening test first, so pre-known words were excluded.
  - Test 2: 85% at lag 1 → below 30% at lag 96, F(1,34)=285.27.
  - Final test: **20% at lag 1 → 30% at lag 96**, F(1,34)=36.84, p<.01.
  - Test 1 outcomes split three ways: correct 55%, omission errors 18%, commission errors 26%.
    **Commission errors predicted better final performance than omissions**, F(1,34)=18.51, p<.001.
  - Long lags helped in all three strata: correct F(1,34)=22.39; omissions F(1,34)=2.93, p<.05;
    commissions F(1,34)=18.83, p<.001.
  - After an omission error followed by a long lag, subjects **failed Test 2 89% of the time**;
    after a commission error, 68%. The authors' conclusion: "even after an error on Test 1, it is
    best to impose a lag that is long enough to produce a great many errors on Test 2."
  - "Inspection of Figure 4 suggests that optimum learning may occur at intermediate lags between
    32 and 96," but "we were not able to draw any reliable conclusions about the precise optimum or
    about whether the optimum differed as a function of performance on Test 1."

**DOK 2**

- **The intuition that a failed item must return quickly to stop the error setting is not
  supported.** The efficient thing and the comfortable thing point in opposite directions: a short
  post-error lag buys a satisfying 85% success on the same day and costs roughly half of next-day
  retention.
- The commission-vs-omission split is a signal we are probably not capturing. A learner who
  produced a *wrong answer* did better a week later than one who produced *nothing*, and the gap
  was significant. In our terms: "I don't know" and "B, confidently" are different events and
  should not both be logged as `correct = false`.
- **What this does not license:** an unbounded lag. The optimum was somewhere in the 32–96
  intervening-item range in Experiment 2 and the authors explicitly declined to locate it. The
  finding is "much longer than you think," not "as long as possible."
- **Limitations, in the authors' words:** performance topped out around 50–60%, well below the
  overlearned regime real instruction targets, and "its interactions with interstudy spacing are
  not known"; lags were filled with other items, so time is confounded with interference; and the
  causal effect of the error itself is unidentifiable because you cannot observe the counterfactual
  item that would have been failed but was never tested.

### 8. Karpicke & Roediger (2007). Expanding Retrieval Practice Promotes Short-Term Retention, but Equally Spaced Retrieval Enhances Long-Term Retention. *JEP:LMC* 33(4), 704–719. `[read]`

<https://learninglab.psych.purdue.edu/downloads/2007/2007_Karpicke_Roediger_JEPLMC.pdf>

**DOK 1**

- Expanding retrieval (Landauer & Bjork 1978) — test soon, then at growing intervals — produced
  short-term benefits at 10 minutes, conceptually replicating the original. **Equally spaced
  retrieval produced superior retention 2 days later**, with and without feedback.
- Experiment 3 dissociated the two components: delaying the *first* retrieval improved long-term
  retention regardless of whether subsequent tests were expanding or equally spaced.
- Authors' conclusion: "The important factor for promoting long-term retention is delaying initial
  retrieval to make it more difficult… Expanding the interval between repeated tests had little
  effect on long-term retention in 3 experiments."

**DOK 2**

- **Relearning steps are an expanding-retrieval schedule.** `10m` then `1d` then growth is exactly
  the Landauer–Bjork pattern, and this is the paper that says the expanding part is not where the
  benefit lives. What matters is that the *first* post-error retrieval is delayed enough to be hard.
- Combined with Q7 (Pashler et al.), the two papers converge on a single design rule that is the
  opposite of current convention: **after an error, the next attempt should be later than feels
  right, and the pattern of attempts after that barely matters.**

### 9. Karpicke & Bauernschmidt (2011). Spaced Retrieval: Absolute Spacing Enhances Learning Regardless of Relative Spacing. *JEP:LMC* 37(5), 1250–1257. `[abstract]`

<https://learninglab.psych.purdue.edu/downloads/2011/2011_Karpicke_Bauernschmidt_JEPLMC.pdf>

**DOK 1**

- Repeated retrieval with long intervals between tests produced a **200% improvement in final
  recall** relative to three massed tests.
- Three massed tests were "no better than recalling an item once."
- Whether repeated tests were **expanding, equally spaced, or contracting made no difference** to
  final retention.

**DOK 2**

- This is the cleanest statement of where the leverage is: **absolute spacing is the lever;
  relative spacing is a knob that does nothing.** Any effort we spend tuning the *shape* of the
  post-error ramp is misallocated relative to effort spent on how long the first gap is.
- Directly relevant to the FSRS `computeOptimalSteps` machinery: recommending "at most two learning
  steps and one relearning step" is optimising a dimension this paper found inert.

### 10. Pashler, Cepeda, Wixted & Rohrer (2005). When Does Feedback Facilitate Learning of Words? *JEP:LMC* 31(1), 3–8. `[read]`

<http://uweb.cas.usf.edu/~drohrer/pdfs/Pashler_et_al_2005JEPLMC.pdf>

**DOK 1**

- N = **258**, Luganda–English word pairs, final test 1 week later.
- "Supplying the correct answer after an incorrect response not only improved performance during
  the initial learning session — it also **increased final retention by 494%**" relative to no
  feedback.
- Feedback after **correct** responses "made little difference either immediately or at a delay,
  regardless of whether the subject was confident in the response."
- A 5-second pause condition produced no benefit.
- Their prescription for computer-aided instruction, verbatim: "Whenever the subject makes an
  error, provide feedback and time to process the feedback, but when the subject responds
  correctly, proceed to the next trial without delay."
- Confidence tracked accuracy tightly on the final test: very low → very high confidence
  corresponded to **15%, 37%, 61%, 84%, 90%** correct.

**DOK 2**

- The 494% is a ratio on a small base and should be quoted carefully, but the direction and
  magnitude are not in doubt: **the intervention that matters after an error is showing the correct
  answer, not re-scheduling.** If we are choosing where to spend engineering effort, feedback
  quality dominates interval policy.
- The asymmetry is a free efficiency win: elaborate post-answer treatment is worth it after errors
  and roughly worthless after correct answers. Any uniform "always show the explanation" UI is
  spending the learner's time badly.
- The confidence-to-accuracy mapping is a strong argument for collecting a confidence rating: it is
  cheap, it is informative, and Q5 shows it changes what the right remediation is.

### 11. Rawson & Dunlosky (2011). Optimizing Schedules of Retrieval Practice for Durable and Efficient Learning: How Much Is Enough? *JEP: General* 140(3), 283–302. `[abstract]`

<https://doi.org/10.1037/a0023956>

**DOK 1**

- **533 students**, conceptual (not vocabulary) material, three experiments, **over 100,000
  short-answer recall responses hand-scored**.
- Items practised to an initial criterion of **1–4 correct recalls**, then relearned to 1 correct
  recall in **1–5 subsequent sessions**. Durability measured at **1 and 4 months**.
- "The effects of initial learning criterion and relearning were **subadditive**, such that the
  effects of initial learning criterion were strong prior to relearning but then diminished as
  relearning increased."
- Prescription: **3 correct recalls initially, then relearn 3 times at widely spaced intervals.**

**DOK 2**

- Subadditivity is the actionable structure. **Grinding an item to a high criterion within one
  session is a substitute for spaced relearning, and a worse one.** If a learner gets something
  wrong, the productive response is to guarantee it comes back on several later days, not to drill
  it now until it sticks.
- Sets a defensible default for our mastery model: an item is not "done" at one correct recall, and
  the marginal value of the fourth same-session correct recall is close to zero.
- **Limitations:** key definitions material, undergraduates, and the schedule is prescribed rather
  than adaptive — it says nothing about whether an *adaptive* scheduler should use these constants.

### 12. Rawson & Pyc (2007). Examining the efficiency of schedules of distributed retrieval practice. *Memory & Cognition* 35(8), 1917–1927. `[abstract]`

<https://doi.org/10.3758/BF03192925>

**DOK 1**

- 227 undergraduates, Swahili–English pairs, two experiments. Conventional schedule = 3 practice
  trials per item regardless of performance. Dropout schedule = practice discontinued once criterion
  is reached.
- "A dropout schedule led to levels of performance similar to those for conventional schedules (but
  in fewer trials), and it was **particularly effective for learning initially incorrect items**."
- "The efficiency of the various schedules depended critically on the interval between
  presentations of an item."

**DOK 2**

- Dropout scheduling reallocates trials from already-known items to failed ones and comes out ahead
  on *both* cost and outcome for the failed items. That is the mechanism our error policy should be
  aiming at: **the value of an error is that it earns the item a larger share of a fixed budget**,
  not that it triggers a special ritual.
- The interval caveat means dropout and spacing are not independent knobs — a dropout schedule with
  short intervals just becomes massing.

---

## Q3. Same item, or a different item testing the same knowledge?

### 13. Butler (2010). Repeated Testing Produces Superior Transfer of Learning Relative to Repeated Studying. *JEP:LMC* 36(5), 1118–1133. `[read]`

<https://andymatuschak.org/files/papers/Butler%20-%202010%20-%20Repeated%20Testing%20Produces%20Superior%20Transfer%20of%20Learning%20Relative%20to%20Repeated.pdf>

**This is the closest direct test of the team's question, and the answer is inconvenient.**

**DOK 1**

- Design: subjects studied ~1,000-word prose passages, then per passage either restudied 3×, took
  **the same test 3×** (`same test`), or took **three rephrased versions of the same question**
  (`variable test`) — question stem reworded, correct answer identical. Feedback after every
  question. Final test 1 week later. 48 subjects across Experiments 1a/1b (24 each).
- **Experiment 1a**, final test = verbatim repeat of the original questions:
  - Factual: same test **.76**, variable test **.75**, restudy .27. Both testing conditions beat
    restudy (d = 2.13 and 2.09). Same vs variable: **t < 1**.
  - Conceptual: same **.70**, variable **.68**, restudy .39 (d = 1.29, 1.25). Same vs variable:
    **t < 1**.
- **Experiment 1b**, final test = *new inferential questions in the same domain*:
  - Factual: same **.60**, variable **.57**, restudy .30 (d = 1.03, 0.93). Same vs variable: **t < 1**.
  - Conceptual: same **.60**, variable **.64**, restudy .36 (d = 0.74, 0.87). Same vs variable: **t < 1**.
- "As a result of the null effects found in the first two experiments, the variable-test condition
  was dropped for Experiments 2 and 3."
- **The conditional analysis is the most important table in the paper.** Final-test performance
  split by whether the item was ever retrieved correctly during the three initial tests:

  | Experiment | Condition | Retrieved ≥1× | Never retrieved |
  | --- | --- | --- | --- |
  | 1a (verbatim final) | Same test | **.84** | **.13** |
  | 1a | Variable test | .79 | .15 |
  | 1b (transfer final) | Same test | .65 | .32 |
  | 1b | Variable test | .64 | .28 |
  | 2 (transfer final) | Same test | .57 | .31 |
  | 3 (cross-domain) | Same test | .72 | .49 |

  Items the learner never once retrieved correctly — **despite receiving the correct answer as
  feedback after every one of three attempts** — were recalled 13% of the time a week later.
- Counterevidence within the paper: on **control questions** (untested material from the same
  passage), restudying beat repeated testing. Collapsing Experiments 1a, 1b and 2 (n = 72):
  restudy **.35** vs testing **.23**, t(71) = 3.69, d = **0.50**.
- Experiment 2 (n = 24) added a tougher control — restudying the isolated facts and concepts rather
  than whole passages — and testing still won: factual .53 vs .33 (d = 0.85), conceptual .58 vs .44
  (d = 0.54).
- By the third initial test, subjects could retrieve ~80% of facts and concepts at least once.

**DOK 2**

- **The "memorising the answer rather than the concept" worry did not show up in this design.**
  Repeating the identical question three times produced transfer to genuinely new inferential
  questions that was statistically indistinguishable from repeating rephrased questions — in four
  separate comparisons, all with t < 1. If item reuse were teaching the answer rather than the
  knowledge, Experiment 1b is where it should have been caught, and it was not.
- **Three-correct-in-a-row-style success is what predicts durability, not variety.** The .84 vs .13
  split says the binary "did they ever get this right under their own power" is worth vastly more,
  as a mastery signal, than anything about item selection.
- **The .13 figure is the single most important number in this whole document for error policy.**
  Three failures with full corrective feedback each time left the learner at 13% a week later.
  Repeating the retrieve-fail-see-answer loop is not a remediation strategy; it is a way of
  confirming that remediation has not happened. This is the empirical basis for an escalation rule.
- **The control-question result is real counterevidence to retrieval-maximalism** and we should
  design around it: heavy retrieval practice on tested items came at a measurable cost (d = 0.50)
  to related untested material from the same source. A system that drills only what it has items
  for will hollow out the space between the items.
- **Boundary conditions that limit transfer to us.** Rephrasing changed only the question stem; the
  correct answer was identical, so the manipulation was mild — Butler names this himself as a
  candidate explanation ("the way in which the questions were rephrased… may not have made them
  different enough"). MCAT items vary the *scenario, the data, and the required inference*, not just
  the wording. The null result licenses "do not assume variation buys transfer"; it does **not**
  license "structurally different items testing the same concept are equivalent to the same item."
  That stronger claim is untested here.
- Also noted by Butler: Goode, Geraci & Roediger (2008) `[secondary]` found practice with *varied*
  anagrams beat repeated practice with the same anagram, even on a final test using a
  previously-practised anagram. So variation can help; it did not help here.

### 14. Pan & Rickard (2018). Transfer of Test-Enhanced Learning: Meta-Analytic Review and Synthesis. *Psychological Bulletin* 144(7), 710–756. `[read]`

<https://sc-pan.github.io/pdf/PR_2018W.pdf>

**DOK 1**

- **192 transfer effect sizes from 122 experiments and 67 articles, N = 10,382**, spanning 40 years.
- Grand random-effects effect of testing vs non-testing re-exposure: **d = 0.40, 95% CI [0.31, 0.50]**.
- **Response congruency is the dominant moderator.** "When there was no response congruency between
  the initial and final tests, the weighted effect size was **d = 0.28**, C.I. [0.17, 0.39]; if
  response congruency held, the estimated effect size increased by d = 0.30, C.I. [0.14, 0.47],
  yielding an estimated effect size of **d = 0.58**." Response congruency means the practice and
  the final test call for substantially overlapping *answers*, even in a different context.
- Elaborated retrieval practice adds **d ≈ 0.22–0.23**.
- With both moderators present, estimated **d = 0.78**; with neither, **d = 0.21**.
- Initial test accuracy is a significant moderator: each 1 percentage point of initial accuracy adds
  ~**0.0058** to d.
- Transfer is strongest across test formats and to application/inference questions and medical
  diagnoses; **weakest to rearranged stimulus–response items, to untested materials seen during
  study, and to worked-example problems.**
- Publication-bias analyses (PET-PEESE and selection methods) left the moderator estimates
  essentially unchanged, but drove the intercept to ~0: "often indicating **no positive transfer
  when none of the aforementioned moderators are present**."

**DOK 2**

- Read together with Butler: **what carries transfer is not item variety, it is whether the
  retrieved answer is the same answer the target task needs.** Two items that share a correct
  response transfer to each other; two items that merely share a topic tag largely do not. That is a
  content-model requirement, not a scheduler requirement — our KC graph needs to know which items
  demand the *same* retrieval, not merely which items are *about* the same thing.
- The 0.0058-per-point initial-accuracy moderator is a direct warning about error policy: **transfer
  is weakest exactly for the items the learner is getting wrong.** A struggling item is the item
  least likely to generalise from practice. This is the meta-analytic version of Butler's .13.
- The publication-bias-corrected intercept of ~0 is the sobering part and should be quoted whenever
  someone claims testing transfers by default. **It does not, unconditionally.** It transfers when
  the answers overlap and the practice is elaborated.
- **What this does not license:** using d = 0.40 as the expected effect of our practice questions.
  The honest planning number is 0.21–0.28 unless we deliberately engineer response congruency and
  elaborated feedback, in which case it is 0.58–0.78.

---

## Q4. Error-driven remediation: what actually has measured effects?

### 15. Metcalfe (2017). Learning from Errors. *Annual Review of Psychology* 68, 465–489. `[read]`

<https://www.columbia.edu/cu/psychology/metcalfe/PDFs/Learning%20from%20errorsAnnual%20ReviewMetcalfe2016.pdf>

**DOK 1**

- Generating an error and then receiving corrective feedback beats error-free study. Kornell, Hays &
  Bjork (2009) is the definitive demonstration; commission errors occurred on >90% of
  error-generation trials and study time for the correct answer was equated.
- Huelser & Metcalfe (2012): the error-generation benefit was **~20 percentage points** — Metcalfe
  glosses it as "roughly the difference between a C− and an A." Critically, **participants believed
  the error-free condition had been better**, immediately after experiencing the opposite.
- The benefit requires the error to be **related** to the target. No benefit with unrelated pairs
  (Huelser & Metcalfe 2012; Grimaldi & Karpicke 2012; Knight et al. 2012), and none when subjects
  had "absolutely no idea what the answers… might be but were nevertheless forced to guess" (Kang
  et al. 2011). "To be beneficial, the guess needs to be somewhat informed rather than a shot in the
  dark."
- **Source of the error matters.** Grimaldi & Karpicke (2012): when the experimenter *presented* an
  incorrect word during what would have been the generation period, "memory for the correct answer
  was **harmed**." Constraining the learner to choose among supplied wrong alternatives was also
  harmful.
- Feedback content: "People get virtually no benefit unless the feedback they receive provides the
  correct answer" (citing Pashler et al. 2005). Elaborative and scaffolded feedback increases the
  benefit (Finn & Metcalfe 2010).
- Siegler (1995), three conditions: feedback only; explain-your-own-reasoning; and — most
  effective — **explain-the-correct-reasoning** ("How do you think I knew that?").
- Feedback timing: Metcalfe, Kornell & Finn (2009) found college students performed **equally well**
  with immediate feedback and feedback delayed up to a week (lag-to-test held constant); children in
  grades 3–5 did *better* with delayed feedback. Kulik & Kulik (1988): lab studies favour delayed
  feedback, classroom studies favour immediate, and the real moderator is whether learners attend to
  it.
- Keith & Frese (2008) meta-analysis of **24 error-management-training studies**: results "highly
  favorable to EMT, with the beneficial effects being particularly favorable for **post-training
  transfer**," and moderated by whether learners were given instructions framing errors as
  informative.
- Exception: people with amnesia are harmed by errorful learning (method of vanishing cues).
- Historical note: the errorless-learning doctrine traces to Terrace's (1963) pigeon experiments,
  and even there the errorful birds showed faster reaction times, appropriate avoidance of the
  negative stimulus, and a behavioural contrast effect — none of which the errorless birds showed.

**DOK 2**

- **The single most transferable design instruction in this review is Siegler's:** after an error,
  the highest-yield move is not to re-ask and not to re-teach, but to make the learner explain the
  *correct* reasoning. It is cheap, it fits an MCAT explanation UI naturally, and it beat both
  bare feedback and self-explanation of one's own reasoning.
- **Multiple-choice distractors are experimenter-presented wrong answers.** Grimaldi & Karpicke's
  result — presented errors harm, generated errors help — is a specific, concrete argument that a
  free-response or "commit before you see options" step before revealing choices is not a UX
  flourish. It converts a harmful presented error into a beneficial generated one.
- The metacognitive-illusion finding governs how we message this. Learners who benefited 20 points
  from errorful practice reported preferring the error-free condition. **Our satisfaction metrics
  will point the wrong way on a correctly designed error policy**, and we should decide in advance
  not to optimise against them.
- The delayed-feedback result gives us permission we probably will not use: feedback need not be
  instantaneous for adults, provided attention is secured. The operative constraint is attention,
  not latency.
- **What this does not license:** "errors are good, so make things hard." The benefit is conditional
  on the error being *informed* and on the feedback containing the correct answer. Guessing on
  material the learner has never seen produces no benefit at all.

### 16. VanLehn (2011). The Relative Effectiveness of Human Tutoring, Intelligent Tutoring Systems, and Other Tutoring Systems. *Educational Psychologist* 46(4), 197–221. `[abstract]` + `[secondary]` (numbers from author's own slides)

<https://doi.org/10.1080/00461520.2011.611369> ·
slides: <https://educationgroup.mit.edu/HHMIEducationGroup/wp-content/uploads/2011/02/VanLehnPresentationSlides.pdf>

**DOK 1**

- Widely believed effect sizes vs no tutoring were **0.3 (answer-based), 1.0 (ITS), 2.0 (human)**.
  This review did not confirm them.
- Measured, vs no tutoring: **answer-based d = 0.31 (165 comparisons); step-based d = 0.76 (28);
  substep-based d = 0.40 (26); human tutors d = 0.79 (10).**
- Conclusion: ITSs are "nearly as effective as human tutoring."

**DOK 2**

- The whole finding lives in one contrast: **0.31 vs 0.76 between answer-level and step-level
  feedback**, and then a *plateau* — finer granularity (substep, human) bought nothing more. The
  actionable reading is that the return on remediation granularity is a step function with its step
  between "you got it wrong" and "you got *this part* wrong," and everything beyond that is
  discretionary polish.
- For an MCAT product this maps cleanly: telling a learner they missed a passage question is
  answer-level. Telling them which inference in the chain broke is step-level. The evidence says
  that is where the 0.45 lives.
- **Limitations:** the human-tutoring cell rests on 10 comparisons, and VanLehn attributes part of
  the deflation of the historical d = 2.0 to differing mastery standards across conditions. The
  substep d = 0.40 being *lower* than step-based d = 0.76 is not well explained and is based on 26
  comparisons.

### 17. Kulik & Fletcher (2016). Effectiveness of Intelligent Tutoring Systems: A Meta-Analytic Review. *Review of Educational Research* 86(1), 42–78. `[abstract]`

<https://doi.org/10.3102/0034654315581420> ·
open copy: <https://www.ida.org/-/media/feature/publications/w/we/welch-award-2017---effectiveness-of-intelligent-tutoring-systems-a-meta-analytic-review/1-effectivenessits.ashx>

**DOK 1**

- **50 controlled evaluations.** Median effect **0.66 SD** over conventional instruction (50th →
  75th percentile); mean 0.65, SD 0.56. Winsorized: median 0.66, mean 0.61, SD 0.38.
- ITS students outperformed conventional classes in **46 of 50 (92%)** evaluations; the difference
  was statistically significant in **39 of 50 (78%)**.
- Effect size range across studies: **−0.3 to 3.1**.
- The dominant moderator was **whether the outcome was a locally developed or a standardized test** —
  "alignment of test and instructional objectives is a critical determinant of evaluation results."
- Six evaluations with non-conventional control groups and four with flawed implementations showed
  **small** effects.

**DOK 2**

- The local-vs-standardized moderator is the finding we should internalise, because it is a warning
  about our own future evaluation. **An adaptive system will look excellent on outcomes it selected
  the content for and much less excellent on the actual MCAT.** Any internal claim about our error
  policy must be measured on held-out, externally-written items or it means nothing.
- The −0.3 to 3.1 range and the collapse under flawed implementations say the category average is
  nearly useless as a forecast. Implementation quality dominates.

### 18. Barbieri, Miller-Cotto, Clerjuste & Chawla (2023). A Meta-analysis of the Worked Examples Effect on Mathematics Performance. *Educational Psychology Review* 35, 11. `[read]`

<https://www.danamillercotto.com/uploads/4/7/7/2/47725475/barbieri_et_al__2023__we_meta-analysis.pdf>

**DOK 1**

- **181 effect sizes from 43 articles**, robust variance estimation, random effects.
- Overall effect of worked examples on mathematics performance: **g = 0.48, p = 0.01**. Of the
  effect sizes, 139 were positive.
- **Studies using correct examples alone yielded larger effect sizes than those using incorrect
  examples alone or correct and incorrect examples in combination.**
- Egger's test indicated publication bias (B = −0.45, z = 5.87, 95% CI [−0.78, −0.12], p < 0.0001);
  trim-and-fill left the effect positive and significant.
- Domain caveat from the authors: 60% of manuscripts concern algebra or geometry.

**DOK 2**

- g = 0.48 for worked examples against problem-solving practice, versus Butler's d ≈ 1.0 for
  repeated testing against restudy, is the comparison the team wants — but **the two are measured
  against different controls and cannot be ranked directly.** What can be said is that both are
  well above the threshold of practical relevance and neither dominates.
- The correct-over-incorrect result is a mild surprise and cuts against the appealing idea of
  showing learners a worked *wrong* solution resembling their own error. The authors are careful
  that incorrect examples may still be better specifically for **low prior knowledge** learners
  (5 studies for, 2 against). Treat "show them why their specific wrong answer is wrong" as
  plausible but not established.
- The expertise-reversal literature bounds this: worked examples help novices and stop helping, or
  hurt, as expertise grows. In our terms, worked examples are the right response to an error on a
  KC the learner has *never* had right, and the wrong response to a lapse on a KC they have
  previously mastered.

---

## Q5. Do errors persist? Interference and the return of the wrong answer

### 19. Butler, Fazio & Marsh (2011). The hypercorrection effect persists over a week, but high-confidence errors return. *Psychonomic Bulletin & Review* 18(6), 1238–1244. `[abstract]` + `[secondary]` (percentages from the Duke press release)

<https://doi.org/10.3758/s13423-011-0173-y> ·
press release: <https://www.eurekalert.org/news-releases/921238>

**DOK 1**

- **50 Duke undergraduates**, **120 basic-science general-knowledge questions**, confidence rating
  after each answer, correct-answer feedback. Half retested after **6 minutes**, half after **1 week**.
- Immediate retest: **86% of errors corrected**, with the standard hypercorrection pattern
  (high-confidence errors corrected more readily than low-confidence ones).
- One-week retest: **56% of errors corrected**. Hypercorrection still present.
- When subjects failed to correct an error at one week, they often **reproduced the original error**
  — and **high-confidence errors were more likely than low-confidence errors to be reproduced.**
- Butler's summary: "one presentation of feedback is not enough to produce a long-lasting correction
  of deeply entrenched false knowledge… Without further practice, high-confidence errors seem to be
  more likely to return over time."

**DOK 2**

- **This is the paper that answers Q5 directly, and the answer is: yes, conditionally.** Wrong
  answers do recur, and confidently-held wrong answers recur *preferentially* — but only once the
  correction has been forgotten. The mechanism is not that the error was strengthened; it is that
  the correction decayed and the error was still there underneath.
- That mechanism has a clean scheduling consequence: **the thing that must be scheduled is the
  correction, not the item.** The 86% → 56% decay over one week with no intervening practice is the
  size of the problem we are scheduling against.
- Combined with the hypercorrection effect: **an error made with high confidence is simultaneously
  the easiest to fix now and the most dangerous to leave unreinforced.** That argues for confidence
  being a first-class input to post-error scheduling — high-confidence errors should get *more*
  subsequent exposures, not fewer, even though they are corrected more readily on the first attempt.
- **Limitations:** 50 undergraduates, one week, general-knowledge trivia rather than reasoning
  chains. The percentages are from a press release, not from the paper's own text; they should be
  verified against the published tables before appearing in anything external.

### 20. Roediger & Marsh (2005). The Positive and Negative Consequences of Multiple-Choice Testing. *JEP:LMC* 31(5), 1155–1159. `[read]`

<http://psychnet.wustl.edu/memory/wp-content/uploads/2018/04/Roediger-Marsh-2005_JEPLMC.pdf>

**DOK 1**

- 24 subjects, 36 nonfiction passages, initial multiple-choice test **with no feedback** using 0, 2,
  4 or 6 alternatives, then a cued-recall final test **with an explicit warning against guessing**.
- Large positive testing effect: **28% correct for untested items vs 46% for previously tested
  items**, F(1,23) = 61.52.
- **But the benefit shrank as distractors were added:** 2 alternatives → **51%** correct;
  4 → **45%**; 6 → **43%**.
- Production of prior multiple-choice lures as final-test answers rose linearly with the number of
  alternatives previously read: 0 alternatives M = **.05**, 2 → **.07**, rising through 4 and 6,
  F(3,69) = 5.86. This held for passages the subjects had and had not read.
- Extraneous (non-lure) errors *decreased* with testing: untested M = .09, versus .04/.04/.03 after
  2/4/6 alternatives — the tested conditions converted vague wrong answers into specific,
  lure-shaped wrong answers.

**DOK 2**

- **Multiple-choice testing without feedback manufactures durable specific misconceptions.** The
  error a learner produces later is disproportionately the distractor they saw. For an MCAT product
  built almost entirely on 4-option items, this is a live risk, not a curiosity.
- The dose–response on distractor count is the mechanism, and it points at a mitigation the
  follow-up literature confirms: Marsh, Roediger, Bjork & Bjork (2007) `[abstract]`
  (<https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/07/Marsh_Roediger_BjorkBjork2007PBR.pdf>)
  report that persistence "appears due to faulty reasoning rather than to an increase in the
  familiarity of lures," that feedback reduces lure production, and that "the positive effects of
  testing outweigh this cost."
- Design implication: **after an error, the remediation must address the specific distractor
  chosen, not merely present the correct answer.** If persistence runs through reasoning rather than
  familiarity, then refuting the reasoning is the intervention — which is the same conclusion
  Siegler's explain-the-correct-reasoning condition and Van Loon et al.'s refutation texts
  (via Metcalfe 2017) reach from two other directions.
- Practical corollary for our data model: **which wrong answer was chosen is a first-class signal.**
  Logging `correct = false` discards the diagnostic content of the response.

### 21. Pashler, Zarow & Triplett (2003), General Discussion — on whether errors are "stamped in." `[read]`

Same source as #7.

**DOK 1**

- "Errors earlier in learning invariably predict errors later in learning (as they do in the data
  reported here), but the Guthrian assumption that one learns what one does (even if what one does
  is to make a mistake) receives little support from these data (even from the errors of commission,
  which seem most pertinent to Guthrie's proposal)."
- The authors note the identification problem explicitly: to know the causal impact of an error you
  would need to compare items where an error was made against items where an error *would have been*
  made but no test was given — "obviously, one has no way of picking out such items."
- They cite the correlational precedents fairly: failure at test *n* strongly predicts failure at
  test *n*+1 (Roediger & Payne 1982); subsequent errors tend to repeat the same wrong response
  (Butler & Peterson 1965); people repeat the same errors even with immediate feedback (Marx &
  Witter 1972).

**DOK 2**

- **Error recurrence is overwhelmingly an item-difficulty and learner-knowledge signal, not evidence
  of a self-reinforcing error trace.** This matters for the mastery model: repeated failure should
  update the estimate of *how hard this is for this learner*, and should not trigger machinery
  premised on undoing damage the error supposedly did.
- Read against Butler, Fazio & Marsh (#19), the picture is coherent: errors recur because the
  correct answer was never durably encoded, not because the wrong answer was strengthened. Both
  papers point at the same fix — schedule the correction — and away from the same non-fix —
  quarantine the item.

---

## Q6. How many errors before escalating from re-testing to re-teaching?

### 22. Cen, Koedinger & Junker (2007). Is Over Practice Necessary? Improving Learning Efficiency with the Cognitive Tutor through Educational Data Mining. AIED 2007. `[read]`

<http://pact.cs.cmu.edu/koedinger/pubs/Cen%20%26%20Koedinger%20AIED07.pdf>

**DOK 1**

- Cognitive Tutor declares mastery when knowledge tracing puts the learner at **95% probability of
  knowing the skill** (Corbett & Anderson). The 1997 tutor used **one set of BKT parameters for all
  knowledge components**.
- Refitting parameters per KC against log data revealed **58% of 4,102 practices and 31% of 636
  exercise questions were performed after the student had already reached mastery**, while **119
  additional practices** would have been needed to bring all students to mastery on the
  under-practiced KCs.
- **Randomised classroom study:** 110 students, 6 classes, one teacher, random assignment to the
  optimised tutor (recalibrated `P(L0)` per KC) or the unmodified 2006 tutor. 73 students had valid
  pre+post scores; 62 had valid logs; 64 took the retention test two weeks later.
- Results: no significant difference on post-test (ANCOVA with pretest covariate, **p = 0.772**) or
  on the two-week retention test (**p = 0.602**). Both groups gained ~5 points.
- Time: **21.52 minutes saved, a 12% reduction in total tutoring time**. Largest unit savings:
  Parallelogram **30%** (p = 0.01), Square **14%** (p = 0.19).

**DOK 2**

- **The 0.95 mastery threshold is a convention, and the empirical work on it is about over-practice,
  not under-practice.** The measured pathology in a mature, heavily studied ITS was that more than
  half of all practice happened after mastery — and removing it cost nothing. There is no comparable
  measured result telling us how many *failures* should trigger escalation.
- The honest summary for the team: **the "N errors then re-teach" rule is entirely heuristic in
  practice.** What the literature supplies instead is (a) a probabilistic mastery criterion, (b)
  evidence that the criterion is usually set too conservatively, and (c) evidence from Butler (#13)
  that the *first* two or three failures with feedback already predict near-total loss at one week.
- The defensible synthesis, which is a design proposal and not a finding: escalate on **the model's
  posterior, not on a raw lapse count**, and treat Butler's .13 as the reason the posterior should
  move fast on consecutive failures. A lapse counter treats a card failed at R = 0.95 and one failed
  at R = 0.30 identically; a posterior does not.
- The per-KC-vs-global parameter finding is directly relevant to us: **using one set of parameters
  across all knowledge components was the actual bug.** With 422 KCs and a cold-start bank, this is
  the failure mode we are most likely to reproduce.

### 23. Anki's leech threshold of 8, and the FSRS community's proposed replacement. `dev-doc` + `community`

<https://docs.ankiweb.net/leeches.html> ·
<https://forums.ankiweb.net/t/automated-leech-detection/56887>

**DOK 1**

- Anki: leech at **8 lapses**, suspend, then warn every 4. No justification offered in the manual.
- The FSRS maintainers' proposed alternative, discussed on the Anki forums (April 2025), abandons
  lapse counting: compute, from the card's history of FSRS-predicted recall probabilities, the
  probability under a **Poisson binomial** distribution of observing at most as many successes as
  actually occurred. Flag as a leech when that probability falls below a threshold; **1%, 2% or 5%**
  are the values under discussion.
- Worked example given: "if the probabilities of recall are 90%, 92% and 93%, then the probability
  of getting the card right zero times is 0.056%. The probability of getting the card correct once
  or zero times is 1.948%." At 95% desired retention, "we can identify leeches with merely 2
  reviews."
- Definition adopted: "'leech' here means 'a card for which FSRS is overestimating p(recall)'."
- Status: a forum proposal with no implementation or evaluation. "We really need a proper
  implementation in Anki or in an add-on to collect feedback."

**DOK 2**

- **This is the right shape for our escalation rule and we should adopt the shape, not the
  threshold.** A fixed lapse count asks "how many times has this failed?" The Poisson-binomial test
  asks "has this failed more than the model expected?" — which is the actual question, and which
  automatically accounts for how hard the item was and how overdue it was.
- It also produces escalation **within two or three attempts** rather than eight, which is the range
  Butler's conditional analysis suggests is correct. The convergence of an untested engineering
  proposal and a 2010 lab result on roughly "three strikes" is suggestive, not confirmatory.
- **Label this clearly wherever it is repeated internally: this is a forum thread, not a result.**
  It has never been implemented, measured, or compared against the threshold of 8.

---

## Q7. Should errors on different activity types be weighted the same?

There is no literature that directly compares the diagnostic weight of a flashcard error, a lesson
practice error, and a timed-passage error. What exists are three separate literatures that each
supply part of the answer, and they agree that the answer is no.

### 24. Zenisky, Hambleton & Sireci (2002). Identification and Evaluation of Local Item Dependencies in the Medical College Admissions Test. *Journal of Educational Measurement* 39(4), 291–309. `[abstract]` + `[secondary]`

<https://doi.org/10.1111/j.1745-3984.2002.tb01144.x> · <https://www.jstor.org/stable/1435405>

**DOK 1**

- Applies local-item-dependence detection (Yen's Q3) and testlet-based calibration to operational
  **MCAT** data.
- "Item dependencies were found in the test and these were due to **test speededness or context
  dependence (related to passage structure)**."
- Secondary description in Pommerich & Segall (2008) `[read]`
  (<https://doi.org/10.1111/j.1745-3984.2008.00061.x>): Zenisky et al. "found **inflated reliability
  estimates on a passage-based test of Verbal Reasoning when it was scored dichotomously rather than
  polytomously**. The Q3 analyses of the same test showed evidence in support of passage-based local
  dependence. They concluded that the choice of a dichotomous rather than a polytomous model could
  have a serious effect on scores for a sizable number of examinees."

**DOK 2**

- **This is the psychometric answer to Q7 and it is specifically about the MCAT.** Questions
  attached to one passage are not conditionally independent given ability. Four errors on one
  passage are not four independent pieces of evidence — they are closer to one piece of evidence
  about that passage plus some noise.
- If our mastery model treats every passage question as an independent Bernoulli observation, it
  will **systematically overstate its own confidence** after a bad passage, and it will do so most
  severely for exactly the learners who have one catastrophic passage in an otherwise decent set.
- Practical rule this yields: **discount within-passage errors** — either by modelling the passage
  as a testlet with its own random effect, or, cheaply, by capping the evidence any single passage
  can contribute.
- The speededness finding matters separately: dependencies also arose from time pressure. **A wrong
  answer at the end of a timed section is partly a fact about the clock**, and should not update a
  content mastery estimate at full weight.

### 25. Wainer & Wang (2000). Using a New Statistical Model for Testlets to Score TOEFL. *Journal of Educational Measurement* 37(3), 203–220. `[abstract]`

<https://doi.org/10.1111/j.1745-3984.2000.tb01083.x>

**DOK 1**

- Fitted **86 TOEFL testlets** (50 reading comprehension, 36 listening) with a testlet model adding
  a random effect γ for items nested in the same stimulus.
- Difficulties (*b*) were well estimated either way, but **discrimination (*a*) and guessing (*c*)
  were biased** when conditional independence was wrongly assumed.
- "Of greater import, we found that **test information was substantially over-estimated** when
  conditional independence was incorrectly assumed."
- The authors flag the consequence for adaptive testing directly: overstated precision "may lead to
  inaccurate inferences as well as **prematurely ended examinations in which the stopping rule is
  based on the estimated standard error**."

**DOK 2**

- The premature-termination warning is the same failure mode already flagged in
  `diagnostic-reading-list.md` #11 for calibration error, arriving by a second route. **Our
  confidence-based stopping and escalation rules are exposed to it from both directions.**
- Related: "Another Look at Yen's Q3: Is .2 an Appropriate Cut-Off?" (*JEM*, 2023) `[abstract]`
  (<https://doi.org/10.1111/jedm.12432>) reports that "Q3 values below the typical cut-off yielded
  meaningful bias in estimates" — so the standard screening threshold is not conservative enough,
  and passing it is not evidence of independence.

### 26. Wise & DeMars (2005). Low Examinee Effort in Low-Stakes Assessment: Problems and Potential Solutions. *Educational Assessment* 10(1), 1–17. `[secondary]`

<https://commons.lib.jmu.edu/gradpsych/13/> ·
numbers as reported in Wise & DeMars (2010),
<https://doi.org/10.1080/10627191003673216>

**DOK 1**

- Synthesised **25 effect sizes from a dozen studies** that experimentally manipulated test-taking
  motivation. **24 of 25** favoured the motivated group; the average difference was **0.59 standard
  deviations**.
- Rapid guessing distorts psychometric properties; motivation filtering (removing low-effort
  responses) raises mean scores, reduces variance, and **increases correlations with external
  criteria**. Examinee effort is reported to be unrelated to ability measured on an independent
  high-stakes test.

**DOK 2**

- Stakes move measured performance by more than half a standard deviation, and **effort is not
  ability**. In our product the three activity types sit at three different stakes levels: a
  flashcard in a casual session is the lowest, a timed full passage the highest.
- Therefore an error on a low-stakes flashcard is **the least diagnostic error we collect**, because
  it is the one most contaminated by disengagement — while also being the one we collect most of.
  The naive weighting (all errors equal) systematically over-weights the noisiest channel.
- The available filter is response time, and it is cheap. Note that `diagnostic-reading-list.md`
  records that we deliberately deferred timing from the model; **Q7 is the argument for
  un-deferring it**, at least as a filter rather than as a scored feature.

### 27. Pan & Rickard (2018), format moderators. `[read]`

Same source as #14.

**DOK 1**

- Transfer of test-enhanced learning is **greatest across test formats** (d = 0.58 with response
  congruency) and **to application and inference questions**, and **weakest to rearranged
  stimulus–response items** and to untested material.

**DOK 2**

- Cuts the other way from #24 and #26 and completes the picture. Errors on different formats carry
  different *diagnostic* weight (they are contaminated differently), but practice on one format does
  transfer to another provided the retrieved answer is the same. **So: weight the evidence
  differently, but do not silo the practice.** A flashcard error and a passage error about the same
  KC are weak and strong evidence respectively about that KC — and practice on either still helps
  the other.

---

## The five most valuable sources, ranked

**1. Butler (2010), #13.** The only direct experimental test of same-item versus varied-item
repetition that also reports what happens to items the learner never gets right. It answers the
team's headline question (variation bought nothing, four times over, all t < 1) and supplies the
number that should drive the escalation rule (**.13 final recall after three failures with feedback
each time**). It also contains real counterevidence against retrieval-maximalism (d = 0.50 in favour
of restudy on untested related material) that nothing else in this list would have surfaced.

**2. Pashler, Zarow & Triplett (2003), #7.** Asks our Q2 in its own introduction and answers it with
a clean crossover interaction across two experiments and two materials. Longer post-error lags cost
half of same-day accuracy and bought roughly double the next-day and next-week retention, *including
for items answered incorrectly*. It also separates commission from omission errors, which is a data-model
change we can make immediately.

**3. Pan & Rickard (2018), #14.** 192 effect sizes, and the only source that tells us *which* second
item transfers to which. Response congruency moving d from 0.28 to 0.58, and the publication-bias-corrected
intercept sitting at ~0, together convert "should the repeat be a different item?" from a scheduling
question into a content-model question.

**4. SRS Benchmark, #3.** The only large-scale measurement in the FSRS orbit, and the source that
most changes what we should believe about our own scheduler. 350 million reviews, and a
zero-parameter recency heuristic (MOVING-AVG, log loss 0.3369) beating FSRS-7 (0.3437). Read
alongside its own caveats, it sets a realistic ceiling on what the scheduler can be asked to do and
tells us the baseline to beat before building anything.

**5. Butler, Fazio & Marsh (2011), #19.** The direct answer to Q5, and the one that reframes the
whole problem: 86% of errors corrected immediately, 56% at one week, with high-confidence errors
preferentially returning once the correction decays. It relocates the scheduling target from the
item to the correction, and makes confidence a first-class scheduling input.

**Honourable mentions.** Cen, Koedinger & Junker (#22) for being the only randomised classroom
evidence about mastery thresholds we have, even though it is about over-practice rather than error
escalation. Zenisky, Hambleton & Sireci (#24) for being about the MCAT specifically. Metcalfe (#15)
for Siegler's explain-the-correct-reasoning condition and the Grimaldi & Karpicke presented-versus-generated
error distinction, which is the strongest argument in this document for a commit-before-you-see-options
interaction.

---

## Evidence-backed versus inherited convention

| Design choice | Status | Basis |
| --- | --- | --- |
| Show the correct answer after an error | **Evidence-backed, strongly** | Pashler et al. 2005, N = 258, +494% at one week; Metcalfe 2017 review |
| Don't bother with elaborate treatment after a *correct* answer | **Evidence-backed** | Pashler et al. 2005 — no benefit, confident or not |
| Longer, not shorter, delay before the post-error retest | **Evidence-backed** | Pashler, Zarow & Triplett 2003, both experiments, both materials, including after errors |
| Absolute spacing matters; the *shape* of the ramp does not | **Evidence-backed** | Karpicke & Roediger 2007; Karpicke & Bauernschmidt 2011 (200% from spacing, nothing from relative schedule) |
| Repeating the same item is acceptable; variation is not required for transfer | **Evidence-backed for mild rephrasing; untested for structural variation** | Butler 2010, four null comparisons, all t < 1. His rephrasing changed only the stem |
| Transfer requires shared *answers*, not shared topics | **Evidence-backed** | Pan & Rickard 2018, d = 0.28 → 0.58 on response congruency; corrected intercept ~0 |
| Escalate after ~3 failures rather than 8 | **Weakly evidence-backed** | Butler 2010's .13 after three; converges with the FSRS forum proposal, which is itself unvalidated |
| Step-level rather than answer-level remediation | **Evidence-backed** | VanLehn 2011, d = 0.31 → 0.76; plateaus after that |
| Worked examples as post-error remediation for unmastered material | **Evidence-backed** | Barbieri et al. 2023, g = 0.48, with publication-bias caveat and expertise-reversal boundary |
| Discount within-passage errors | **Evidence-backed, MCAT-specific** | Zenisky, Hambleton & Sireci 2002; Wainer & Wang 2000 |
| Discount low-stakes errors relative to timed ones | **Evidence-backed** | Wise & DeMars 2005, 0.59 SD, effort unrelated to ability |
| Post-lapse state should depend on D, S and R rather than a constant | **Structurally sound, empirically unvalidated as a *scheduling* choice** | FSRS formula fits 350M reviews as a *predictor*; no outcome study |
| **Reset the interval to zero / 1 day on a lapse** | **Inherited convention.** Never validated | Anki default 0.00, justified in the manual by citing SuperMemo's opinion. SuperMemo's own "1–4 days" figure is vendor documentation with no methods, no dataset, no peer review |
| **Relearning steps of `10m`** | **Inherited convention**, and its theoretical basis failed to replicate | An expanding-retrieval schedule; Karpicke & Roediger 2007 found the expanding component contributes nothing long-term. FSRS's own docs justify short steps by "not interfering with the scheduler," not by memory |
| **Leech threshold of 8 lapses** | **Pure convention.** No published basis anywhere | Anki manual states the number and offers no reason. FSRS maintainers are actively trying to replace it |
| **Ease floor of 130%** | **Convention, and explicitly a UX constraint** | Anki manual: unpublished internal research, justified partly by "annoying users" |
| **Mastery at p = 0.95** | **Convention, and probably too conservative** | Corbett & Anderson's threshold; Cen et al. found 58% of practice occurred past it with no learning cost to removing it |
| **A lapse counter as the escalation trigger** | **Convention, and structurally wrong** | Treats a failure at R = 0.95 and R = 0.30 as the same event. Both SuperMemo's PLS[Lapses, R] and the FSRS Poisson-binomial proposal exist because of this |
| Suspending leeches | **Untested either way** | Anki default. No evidence located on whether suspended cards are ever productively relearned |

---

## What I could not find or verify

**No randomised or controlled outcome study of FSRS.** Every FSRS number in this document is
predictive calibration on historical logs. The maintainers know this: there is an open
"call for independent researchers to validate FSRS"
(<https://forums.ankiweb.net/t/question-about-research-on-anki/63775>), and the widely repeated
"20–30% fewer reviews for the same retention" figure comes from **simulation**, not from any trial.
**Nothing in the FSRS literature supports a claim that its lapse handling produces better learning
than any alternative, because no one has measured that.**

**No isolated evaluation of any lapse-handling parameter.** No study — academic, benchmark, or
vendor — compares interval-reset against interval-multiplier, or one relearning step against two, or
leech threshold 5 against 8, on either retention or efficiency. The FSRS benchmark evaluates whole
algorithms as predictors; it does not ablate the post-lapse formula. This is a real, addressable gap
and it is one we could close ourselves with a simulation harness.

**No evidence-based rule for how many errors should trigger re-teaching rather than re-testing.**
This was the most thorough search in this sweep and it came back empty. The ITS literature measures
over-practice past mastery (Cen et al.); the memory literature measures criterion levels for
*successful* recalls (Rawson & Dunlosky's 3+3); nobody appears to have measured a failure-count
escalation threshold. Butler's .13 and the FSRS Poisson-binomial proposal converge on roughly three,
but that convergence is an inference of mine, not a published finding, and should be labelled as
such internally.

**No direct comparison of the diagnostic weight of flashcard versus lesson-practice versus timed-passage
errors.** Q7 is answered here by assembling three literatures that were not designed to answer it.
No study I could find fits a knowledge-tracing or IRT model with activity type as a moderator and
reports how much a wrong answer on each type should move the estimate. If we want that number we
will have to measure it in our own data, and we are well positioned to.

**No test of item variation at MCAT-like structural distance.** Butler's null result used rephrased
stems with identical answers. Nobody has tested "same KC, different scenario, different data,
different required inference" against literal repetition. Given Pan & Rickard's response-congruency
moderator, this is the specific experiment most worth running, because the two sources make opposite
predictions once the answer changes.

**Not retrieved from primary text, and worth buying or chasing if any becomes load-bearing:**
Zenisky, Hambleton & Sireci (2002) — paywalled at Wiley/JSTOR, and it is the MCAT-specific one, so
this is the highest-priority retrieval on the list. Butler, Fazio & Marsh (2011) — the 86%/56%
figures currently rest on a press release. Karpicke & Bauernschmidt (2011) — the 200% figure is from
the paper's own discussion section as quoted in search results, not from a full read. VanLehn (2011) —
the per-category effect sizes and comparison counts come from the author's slides rather than the
article. Wise & DeMars (2005) — the 0.59 comes from their 2010 paper's description of it.

**A note on one number to be careful with.** Pashler et al. 2005's "+494%" is a percentage increase
on a small base and reads as sensational. Prefer "correct-answer feedback after an error was the
single largest manipulation in the study, roughly a sixfold difference at one week" in any external
writing, and check the underlying proportions before publishing the figure itself.
