# Diagnostic Design — Source Knowledge Tree

One entry per source from the diagnostic research reading list. Each entry gives the
**DOK 1** items (atomic, checkable facts — numbers, definitions, conditions) and the
**DOK 2** items (relationships, mechanisms, and applied implications that require
connecting facts together).

**Provenance is marked on every entry.** Entries marked `VERIFIED` were read from the
primary document. Entries marked `UNVERIFIED` could not be retrieved — those claims come
from secondary summaries and should not be cited as fact until someone reads the original.

---

## 1. Gu & Xu — Sufficient and Necessary Condition for Identifiability of the DINA Model

`VERIFIED — full text read` · [par.nsf.gov/servlets/purl/10057909](https://par.nsf.gov/servlets/purl/10057909)

### DOK 1

- A **Q-matrix** maps `J` items to `K` binary latent attributes. A full assignment of the `K`
  attributes for one learner is an **attribute profile**.
- A Q-matrix is **complete** if different attribute profiles produce different response
  distributions. Under DINA this means: for every attribute there exists an item requiring
  that attribute *and only* that attribute. Equivalently, Q contains a `K × K` identity
  matrix up to row permutation.
- **Condition 1** (from Xu & Zhang 2016, necessary): (i) Q is complete, so `Q = [I_K ; Q*]`;
  (ii) each of the `K` attributes is required by **at least 3 items**.
- **Condition 2** (this paper's contribution): any two different columns of the submatrix
  `Q*` are distinct.
- **Theorem 1:** Conditions 1 and 2 together are **sufficient and necessary** for
  identifiability of all DINA parameters (slipping `s`, guessing `g`, population
  proportions `p`).
- Identifiability under these conditions also guarantees **consistent estimation** of the
  parameters.
- The result transfers directly to the DINO model, and DINA is a submodel of most richer
  CDMs, so the conditions act as a floor for those too.

### DOK 2

- Identifiability is a property of **test design**, not of sample size. No amount of data
  rescues a Q-matrix that violates these conditions — the parameters are not merely
  imprecise, they are not recoverable even in principle.
- Because the condition depends only on the Q-matrix, it is **checkable before writing a
  single item**. This makes it a design gate rather than a post-hoc diagnostic.
- The "3 items per attribute" floor is a *necessary* condition, not a sufficient target.
  Meeting it says the model is estimable; it says nothing about whether the estimate is
  precise enough to act on. Those are separate questions and conflating them is the common
  error.
- The completeness requirement — needing an item that isolates each attribute — is **satisfied
  by construction in our bank**, contrary to what this entry originally assumed. All 2,108
  questions carry exactly one `kc_id`, so the Q-matrix is a stack of single-attribute rows and
  completeness is automatic. With 400 of 422 KCs also carrying three or more questions,
  Conditions 1 and 2 both hold for those 400. The model is formally identifiable at the KC grain.
- That is a weaker win than it sounds. Identifiability says parameters are recoverable **in the
  limit**; it says nothing about a short test. Single-loading also means each item informs
  exactly one KC, so the arithmetic is one KC per item and no more. Restated at the length the
  instrument now delivers — 140 items, up from the 40 this entry originally reasoned about — a
  sitting touches at most 140 of 422 KCs, **just under a third**, with no borrowing of evidence
  across attributes from within an item. Lengthening the form improved the fraction from under a
  tenth to a third and did not change the conclusion: single-loading maximises interpretability
  per item and minimises profile coverage per item, and no feasible length closes a gap that is
  linear in item count.
- Practical consequence: the number of attributes you can diagnose is capped by your
  ability to write isolating items for each one. Attribute count is a design budget, not a
  free parameter.

---

## 2. Dai, Vanacore, Baker & Slater — Understanding MOOC Stopout Patterns (L@S '25)

`VERIFIED — full text read` · [PDF](https://learninganalytics.upenn.edu/ryanbaker/L_S_25_Dai.pdf)

### DOK 1

- Analytic dataset: **90 Coursera courses** (Penn, Sept 2015 – Feb 2025) with **5,370,635
  enrollments** and **469 graded assessments**; mean 6.26 assessments per course, range 3–26.
  (The wider Penn collection is 200+ courses / 5.7M users; the cleaned analysis set is the
  90-course figure.)
- **Stopout** = the assessment after which a learner submits no further graded assessment.
  Final assessments are excluded by construction.
- Average stopout at the **first** graded assessment: **18.71%**. Average across all other
  graded assessments: **7.27%**.
- Stopout decays exponentially: **−0.12 per additional assessment** (SE = 0.009,
  p < 2 × 10⁻¹⁶), conditional R² = 0.49.
- The first assessment does not fit that decay curve. Model deviance is **349.14** including
  it versus **228.76** excluding it.
- Predictors of first-assessment stopout (standardised coefficients):
  - Number of questions on assessment 1: **+0.073**, p < 0.0001
  - Percent fill-in-numeric on assessment 1: **+0.037**, p = 0.002
  - Percent reflection questions on assessment 1: **−0.025**, p = 0.024
  - Expected time commitment on assessment 1: **−0.0495**, p = 0.060
  - Expected time commitment on assessment 2: **+0.078**, p = 0.002
  - Course-level number of assessments: **+0.062**, p = 0.011
  - Course-level number of (practice) assignments: **−0.056**, p = 0.019
- Variance explained: course-level features alone R² = 0.117; assessment-level features
  alone R² = 0.450; combined R² = 0.494.
- Question type mix across the corpus: multiple choice 72.9%, checkbox 14.0%, numeric 6.2%,
  reflective 2.5%.
- Authors' stated limits: correlational, no control for course topic, single LMS (Coursera),
  graded quizzes/tests only.

### DOK 2

- The first assessment is governed by a **different mechanism** than later ones — it is not
  the top of a smooth decay curve. This is the paper's central claim and it is what justifies
  treating "the first thing you ask a learner to do" as its own design problem.
- **Item count and expected time point in opposite directions on the first assessment.** More
  questions raises stopout; longer *expected time* lowers it. The cleanest reading is that
  learners react badly to a long list of items but not to a substantial, clearly-worthwhile
  task. This cuts against a naive "make it as short as possible" rule and toward "make it feel
  purposeful and don't make the item count the salient number."
- Expected time flips sign between assessment 1 and assessment 2, which suggests goodwill is
  front-loaded: learners will invest in a first substantive task but resent a second long one.
- Assessment-level design explains roughly four times the variance that course-level structure
  does. What you put on the page matters far more than how the surrounding product is
  organised.
- Free-response/numeric formats drive stopout relative to multiple choice, plausibly through
  difficulty and effort. Reflection prompts do the reverse. Both effects are small but
  consistent across assessments 1 and 2.
- **Transfer caution:** this is a free, no-commitment MOOC population. Stopout here bundles
  "never really intended to finish" with "found the assessment aversive." A paying user with
  a fixed exam date has already cleared a commitment filter that most of these 5.37M
  enrollments never faced, so the *levels* should not be carried across. The *relative*
  ordering of design features is the transferable part.

---

## 3. Falmagne / Matayoshi et al. — A practical perspective on knowledge space theory: ALEKS and its data

`UNVERIFIED — ScienceDirect paywall, not retrieved`

Claims attributed to this source in the synthesis (ALEKS knowledge-space operation, item
counts per assessment, use of learning-space structure to infer unasked items) rest on
abstracts and secondary description. **Do not cite specifics until read.** The structural idea
— that a prerequisite/knowledge-space graph lets you infer mastery of items you never
administered — is well attested elsewhere and is safe; the ALEKS-specific numbers are not.

---

## 4. Sinharay & Haberman — Reporting Subscores: A Survey (ETS RM-08-18)

`VERIFIED — full text read (earlier in this project)`

### DOK 1

- The central criterion is whether a subscore has **added value** over the total score:
  does it predict the true subscore better than the total score does?
- The operational test is a comparison of **proportional reduction in mean squared error**
  for the observed subscore versus the total score (and versus an augmented subscore).
- Across the ETS operational programs surveyed, the **great majority of subscores had no
  added value** over the total score.
- Two properties drive added value: the subscore must be **reliable enough**, and it must be
  **distinct enough** (disattenuated correlation with the rest of the test far enough below
  1.0).
- Item count is **necessary but not sufficient** — a subscore built on many items can still
  fail if it is too highly correlated with the rest of the test.
- **Augmentation** (borrowing information from other subscores to stabilise a weak one) can
  improve MSE while making the reported subscores *more* alike, so the reported profile
  becomes less diagnostic even as it becomes more accurate.
- Coarsening the reporting grain — fewer, broader subscores — raises reliability and is
  frequently the recommended fix.

### DOK 2

- Reliability alone does not justify reporting a subscore. A perfectly reliable subscore that
  correlates 0.98 with the total is a re-labelled total score and tells the learner nothing
  new.
- The augmentation failure mode is the direct analogue of **our hierarchical pooling**. Pooling
  buys precision by shrinking cluster estimates toward the learner's overall level, which is
  exactly the operation that can flatten the profile we are trying to report. The `MIN_POOLING_SPREAD`
  floor in `diagnostic-bayes.ts` is our guard against this, and it should be treated as a
  load-bearing parameter, not a tuning knob.
- The practical rule this yields: **measure at whatever grain the model can support, but
  report at the coarsest grain that still changes what the learner does next.** Reporting
  grain and modelling grain are separate decisions.
- Applied to us: a small number of broad, well-populated dimensions will beat a long list of
  fine-grained cluster readouts, both statistically and in what the learner can act on.

---

## 5. Accounting for item calibration error in computerized adaptive testing (BRM 2025)

`UNVERIFIED — publisher paywall, not retrieved`

The general result — that CAT treating estimated item parameters as if they were known
produces overconfident ability estimates and understated standard errors — is standard and
well attested. The specific magnitudes attributed to this paper are **not verified**. This
matters to us because our bank is uncalibrated, so the effect is not a small correction in
our case; it is the dominant source of error. Worth retrieving properly.

---

## 6. Kluger & DeNisi — The Effects of Feedback Interventions on Performance (1996)

`UNVERIFIED — APA paywall, not retrieved`

The headline result (feedback interventions raise performance on average but a substantial
minority of effects are negative, with feedback directed at the *self* rather than the *task*
being the main culprit) is one of the most widely replicated findings in the literature and is
safe as a design principle. The precise effect size and the share of negative effects
attributed here are **from secondary sources**. The design implication we are relying on —
diagnostic feedback should describe the work and the next action, never rank the person —
does not depend on the exact numbers.

---

## 7. Scott-Clayton & Rodriguez — Improving the Targeting of Treatment: Evidence from College Remediation (NBER w18457)

`VERIFIED — full text read`

### DOK 1

- Setting: administrative data (high school transcripts, placement test scores, college
  grades) for tens of thousands of students across two community college systems — one large
  urban system with six campuses (LUCCS), one statewide system of 50+ colleges (SWCCS).
- Remedial coursework costs roughly **$7 billion annually** in the US.
- The paper defines the **severe error rate (SER)** as the sum of:
  - **severe under-placement** — student predicted to earn a B or better in the college-level
    course but placed into remediation;
  - **severe over-placement** — student placed into the college-level course but predicted to
    fail it.
- Roughly **one in four** math test-takers and **one in three** English test-takers are
  severely mis-assigned under current test-based placement.
- Severe **under**-placements are far more common than severe over-placements.
- Using high school transcript information — instead of or in addition to test scores —
  significantly reduces assignment errors while holding the remediation rate fixed.
- Choice of screening device has significant effects on the racial and gender composition of
  both remedial and college-level courses.
- Accounting for high school performance would let institutions remediate substantially fewer
  students without lowering success rates in college-level courses.

### DOK 2

- The paper's methodological move is to reject a single "accuracy rate" in favour of an
  explicit **loss function**. Rather than presume to specify a full welfare function, they
  define a coarse loss that only counts the errors nobody disputes are costly. This is the
  right template for us: pick a small number of clearly-bad outcomes and optimise against
  those, instead of optimising an abstract measurement statistic.
- The **asymmetry** is the actionable finding. Under-placement — making a capable learner
  redo material they already own — is both more frequent and, in this literature, more costly
  than the reverse. A diagnostic tuned to avoid embarrassing over-placement will
  systematically over-remediate.
- A single short test is a **weak screening device** when richer history is available. This is
  a direct argument for letting our diagnostic make only a coarse decision and letting
  accumulated in-product evidence (test-out gates, recall performance, lesson results) do the
  fine placement. This entry previously phrased that coarse decision as "a coarse starting
  altitude", which **overstates what the instrument does**: it emits no altitude estimate, and
  that output was moved out of scope because an absolute level needs a calibrated scale to live
  on and our bank does not supply one. What it actually sets is a coarse *starting point* — two
  named priorities and an initial ordering over ten concepts, all of it relative standing rather
  than level. The argument is unaffected, since Scott-Clayton's point is about how much a short
  test should be trusted against history, not about which quantity it reports.
- Screening-instrument choice has demographic consequences even when it is not designed to.
  Any placement rule we ship needs a subgroup check, not just an aggregate accuracy number.

---

## 8. Gollwitzer & Sheeran — Implementation Intentions and Goal Achievement

`UNVERIFIED — repository requires login, not retrieved`

The meta-analytic finding that if-then implementation intentions ("when situation X arises,
I will do Y") produce a medium-to-large effect on goal attainment over goal intentions alone
is well replicated. The specific pooled effect size and study count attributed here are
**not verified from the original**. The design implication — that our post-diagnostic output
should be a concrete when/where plan rather than a topic list — stands on the general result.

---

## 9. Wauters, Desmet & Van den Noortgate — Acquiring Item Difficulty Estimates (EDM 2011)

`VERIFIED — full text read`

### DOK 1

- Design: **318 students** and **13 experts** (16 invited) from ten Flemish higher-education
  programs, estimating the difficulty of **25 items** on French verb conjugation. Items were
  pre-calibrated by Selor via IRT on examinee data, giving a "true β" benchmark.
- Six estimation methods compared: IRT calibration on study data, proportion correct, learner
  feedback (5-point Likert difficulty rating), expert rating (predicted proportion correct),
  paired comparison (learner and expert variants, analysed with a graded response model), and
  Elo rating.
- Pearson correlation with **true β**: proportion correct **0.90**, learner feedback **0.88**,
  Elo rating **0.85**, expert rating **0.80**, paired comparison–learner **0.62**, paired
  comparison–expert **0.56** (all p < 0.01).
- Correlation with IRT calibrated on this study's own data: proportion correct **1.00**, Elo
  **0.92**, learner feedback **0.88**, expert rating **0.80**, paired comparison–learner
  **0.50**, paired comparison–expert **0.44**.
- Inter-rater agreement (ICC[3,1]): experts **0.68** ("good"), learners **0.42–0.43** ("fair"),
  learner and expert means combined **0.88** ("excellent").
- Elo update weight was set to **0.4** after preliminary tuning.
- Learner feedback beat expert rating against true β, and the difference was significant
  (t(22) = 2.71, p < 0.05).
- Authors' stated limits: only 25 items (constrained by rater fatigue), a single domain, and
  items **measuring one skill only**. They explicitly decline to generalise to other domains
  or to multi-skill items.

### DOK 2

- **Cheap methods are competitive with IRT calibration.** Proportion correct at 0.90 and Elo
  at 0.85 against true β means you do not need a full calibration study to get usable
  difficulty ordering — which is the whole cold-start argument.
- Proportion correct correlating 1.00 with study-data IRT is an artefact, not a triumph: total
  score is a sufficient statistic for the Rasch model, so the two are near-algebraically
  linked. The **0.90 against true β is the honest number**.
- Both proportion correct and Elo correlate *higher* with study-data IRT than with true β,
  which is the signature of **sample dependence**. Difficulty estimates from your own users
  describe your own users. For us, early estimates will encode the composition of whoever
  signs up first.
- **Learners judged difficulty better than experts.** This inverts the usual assumption and is
  a cheap signal we are not collecting. A one-tap "how hard was that?" after an item is
  low-friction and, on this evidence, at least as informative as expert difficulty tags.
- Experts agreed with each other more (ICC 0.68 vs 0.42) while being *less* accurate. High
  inter-rater agreement among experts is not evidence of validity — it can just mean they
  share a bias.
- The authors' own suggested use — feed these cheap estimates in as a **prior for Bayesian
  estimation** rather than as final values — is precisely the architecture we want: expert
  tags and early proportion-correct as priors, updated as real response data arrives.
- **The most important caveat for us:** this was a single-skill domain with 25 items. The
  authors specifically refuse to generalise to multi-skill items. MCAT items are multi-loading,
  so treat 0.85–0.90 as an optimistic ceiling, not an expected value.

---

## 10. CAPR / MDRC — College Course Placement Based on Multiple Measures: A Synthesis of Two Experiments

`VERIFIED — full text read` · [ERIC ED664878](https://files.eric.ed.gov/fulltext/ED664878.pdf)

### DOK 1

- Synthesis of two randomised experiments (SUNY and Great Lakes) comparing **test-only**
  placement against **multiple-measures assessment (MMA)**, which adds high school GPA and
  similar measures. Students were randomised to a placement system; data were kept on how each
  student would have been placed under both.
- For **81% of the math sample** and **68% of the English sample**, the two systems **agreed**
  on placement — those students' outcomes could not be affected by the choice of system.
- The analysis sample is therefore restricted to the **"bump-up" zone**: students the test
  would place in developmental coursework but MMA places in college-level. Typically low test
  scores, relatively high GPA.
- Bump-up impacts (combined): **+8 percentage points** likelihood of passing a college-level
  course in the tested subject, **+2.0 credits** earned on average.
- Credential-or-transfer: **+1.5pp** combined (not statistically significant); **+2.4pp** in
  the English sample after nine semesters; no significant effect in math.
- After nine semesters: **+7pp** college-level English completion, **+8pp** college-level math
  completion.
- After three semesters: **+16pp** English, **+11pp** math — larger short-run effects.
- The **"bump-down" zone** (high test score, low GPA; MMA sends them to developmental) showed
  **negative** outcomes. Bump-down occurred only in the SUNY study; the later Great Lakes study
  design **prohibited** it, and CAPR no longer treats it as policy-relevant.
- Faculty set MMA thresholds high enough to avoid dramatically increasing college-level
  placement.

### DOK 2

- **For most learners, the placement algorithm does not matter.** 81% / 68% agreement means the
  entire argument about diagnostic sophistication is a fight over the minority of learners in
  the disagreement zone. This should discipline how much we invest in squeezing accuracy out
  of the diagnostic relative to everything else in the product.
- The benefit is **asymmetric and one-directional**: placing borderline learners *higher* helps;
  placing them *lower* hurts. Combined with Scott-Clayton's finding that severe under-placement
  is the more common error, the design rule is clear — **when uncertain, place up.** Our
  diagnostic should have an explicit upward bias in the disagreement zone.
- The bump-down result is strong enough that the research program stopped allowing it. That is
  an unusually clear signal: a diagnostic that demotes a learner from where a simpler rule
  would have put them is doing harm, not caution.
- Short-run effects (+16pp / +11pp at three semesters) exceed long-run effects (+7pp / +8pp at
  nine). Placement gains are largest immediately and partly wash out. Early acceleration is
  real but is not a permanent advantage — which argues for placement being one input to
  momentum rather than the decisive intervention.
- The instrument that helped was **accumulated performance history** (GPA), not a better test.
  Same lesson as Scott-Clayton, from a randomised design.

---

## 11. van der Bles et al. — Communicating Uncertainty About Facts, Numbers and Science

`UNVERIFIED — PNAS fetch timed out repeatedly`

The finding that numerically-expressed uncertainty (a range) reduces trust only slightly
while verbally-expressed uncertainty ("experts disagree") reduces it more is consistent with
the broader literature, and supports showing our confidence as a bounded range rather than
hedging language. **Specific effect sizes are not verified.**

---

## 12. Madison & Bradshaw — The Effects of Q-Matrix Design on Classification Accuracy in the LCDM

`UNVERIFIED — PMC blocked by CAPTCHA, not retrieved`

Highly relevant and worth chasing down through another route. The attributed findings — that
classification accuracy degrades sharply with Q-matrix misspecification, and that items
loading on fewer attributes classify more accurately than items loading on many — align with
Gu & Xu's identifiability result above, which *is* verified. Treat the direction as supported
and the magnitudes as unverified.

---

## 13. Baldiga — Gender Differences in Willingness to Guess

`VERIFIED — full text read` · [PDF](https://economics.osu.edu/sites/economics.osu.edu/files/Gender%20Differences%20in%20Willingness%20to%20Guess.pdf)

### DOK 1

- Experiment using practice questions from SAT II subject tests, varying (a) the penalty for a
  wrong answer and (b) whether the task is framed as an evaluative "SAT."
- **With no penalty for a wrong answer, all test-takers answered every question.** The gap
  does not exist in this condition.
- With a small penalty, women answered significantly fewer questions than men: p = 0.008
  (unframed), p = 0.033 (SAT-framed).
- Framing the task as an SAT caused **both** men and women to skip fewer questions, but the
  gender gap persisted.
- Among the lower-performing half of subjects in the SAT-framed penalty condition (12 or fewer
  correct under forced response), men skipped **1.08** questions on average versus women
  **3.09** (p < 0.01).
- Conditional on **self-reported confidence**, women skipped more than men at essentially every
  confidence level above 30%.
- Differences in knowledge of the material did not explain the gap; measured risk preferences
  explained some but not all of it; no differences in confidence were found.
- Because they skip more, women receive significantly lower scores than their knowledge
  warrants.

### DOK 2

- **The gap is created by the scoring rule, not by the learners.** Remove the penalty and it
  vanishes entirely. This is the single most useful fact in the paper: differential
  non-response is a design artefact you control.
- Skipping is **not** a clean signal of "doesn't know." Two learners with identical knowledge
  and identical self-reported confidence make different skip decisions. Any model that treats
  omission as evidence about ability is absorbing a personality and framing effect into an
  ability estimate.
- Direct consequence for our **"I don't know" button**: it is safe only if it is genuinely
  costless *and perceived as costless*. If learners believe IDK counts against them, or that
  it forfeits something a guess might win, we will reintroduce exactly this differential — and
  it will be systematically correlated with gender, which makes it a fairness problem as well
  as a measurement one.
- Making the evaluative stakes salient (the SAT framing) reduced skipping overall but did not
  close the gap. So "make it feel serious" is not a fix.
- The safest treatment of IDK is as a **separate observation** — informative about
  metacognition and useful for item selection — rather than as a low-probability-correct
  response folded into the ability posterior.

---

## 14. AERA/APA/NCME — Standards for Educational and Psychological Testing

`UNVERIFIED — only open-access front matter available, full standards not retrieved`

The obligations we are relying on (validity evidence must be gathered for each intended
*use*, not for the test in the abstract; reliability evidence must be reported at the grain
at which scores are reported and acted on; classification consistency must be reported where
scores drive placement decisions) are accurate characterisations of the Standards' structure.
Chapter and standard numbers should be checked against the published volume before being
cited in any external-facing document.

---

## 15. NAD decision on Blueprint MCAT score-improvement claims

`UNVERIFIED — summary page only`

The relevant point for us is regulatory, not psychometric: score-improvement advertising
claims in the MCAT prep market have been challenged before the National Advertising Division,
and self-selected user-reported gains do not survive scrutiny as substantiation. This is a
constraint on marketing copy, not on product design. **The specific holding should be read
before any score-gain claim is made.**

---

## 16. Wise — Rapid-Guessing Behavior: Its Identification, Interpretation, and Implications

`UNVERIFIED — EMIP paywall, not retrieved`

The technique — set a per-item response-time threshold below which a response is classified
as rapid guessing and filtered from scoring — is well established, as is the finding that
rapid guessing is concentrated in low-stakes settings and inflates apparent ability variance
when unfiltered. Threshold-setting methods and the reported prevalence figures are
**unverified**. Note that we have deliberately deferred timing from the model, so this source
is currently informational rather than actionable.

---

## 17. Gervet, Koedinger, Schneider & Mitchell — When is Deep Learning the Best Approach to Knowledge Tracing? (JEDM 2020)

`VERIFIED — full text read` · [JEDM](https://jedm.educationaldatamining.org/index.php/JEDM/article/download/451/123)

### DOK 1

- Empirical comparison of knowledge-tracing approaches across **nine real-world datasets**.
- Logistic regression with the right feature set (**Best-LR**) leads on **4 of 9** datasets;
  **Deep Knowledge Tracing (DKT)** leads on the remaining **5**; Markov-process methods
  (BKT and variants) **lag behind both**.
- Logistic regression wins on datasets of moderate size or with very many interactions per
  student. DKT wins on large datasets or where precise temporal information matters most.
- The original DKT paper reported a **25% AUC gain** over BKT; subsequent work
  (Xiong et al., Khajah et al., Wilson et al.) showed this was substantially inflated, partly
  by duplicate rows in the benchmark dataset and by comparison against a weak BKT baseline.
- **Best-LR** = DAS3H without time-window features, plus total count features, plus IRT
  student-ability and question-difficulty parameters. Equivalently, PFA with rescaled counts
  augmented the same way.
- The **time-window features** from DAS3H (windows of 1/24, 1, 7, 30, ∞ days) add **no**
  predictive power to logistic regression models, though a non-linear model can exploit them.
- On most datasets, the **expert-designed domain model adds little predictive power**.
- BKT+ (the strongest BKT extension) requires MCMC, takes **days** to train on large datasets
  versus minutes for logistic regression, and still does not lead.
- Calibration analysis shows predictions exhibit **systematic biases outside the interval
  containing most of the data**; which model is better calibrated varies by dataset and tracks
  the AUC/RMSE ordering.

### DOK 2

- There is **no universally best knowledge-tracing model**; the winner is a function of dataset
  size and structure. At our data scale — early, sparse, few interactions per learner — the
  logistic-regression family is the right default, and it is orders of magnitude cheaper to
  fit and easier to inspect than the alternatives.
- The most uncomfortable finding for us: **the expert-designed domain model adds little
  predictive power on most datasets.** We have invested heavily in a 422-KC expert taxonomy.
  This says that taxonomy may earn its keep as a *content organisation and sequencing* device
  while contributing little to *predicting whether the next answer is correct*. Those are
  different jobs and we should stop justifying the taxonomy on predictive grounds.
- Recency/time-window features being useless to a linear model but usable by a non-linear one
  means feature value is not intrinsic — it depends on whether the model class can exploit it.
  Negative results about a feature are really results about a feature-and-model pair.
- The DKT-over-BKT story is a **cautionary tale about baselines**. A headline improvement
  measured against a weak baseline on a flawed dataset propagated through the field for years.
  When we benchmark our diagnostic, the baseline must be a genuinely strong simple model, not
  a strawman. **We can now satisfy that instruction in a stronger form than it asks for**, and
  the diagnostic benchmark should point at it rather than at a hand-built comparator. The
  measurement campaign constructed an **exact-posterior oracle**: it re-reads the engine's own
  responses — the same items, the same answers — and forms the exact posterior over each
  concept, knowing every item's true difficulty and discrimination and the exact population the
  learner was drawn from. It suffers the learner's response noise and none of the engine's
  calibration error, which makes it an **upper bound rather than a baseline**. That is the
  better instrument for this purpose: a strong baseline tells you that you have beaten something
  respectable, whereas a bound tells you how much is left, and the answer here is almost nothing.
  The shipped engine scores **99–102% of it**, so the guarding this entry asks for is done, and
  the risk it warns about — a flattering comparison against a weak reference — cannot arise
  against a reference the engine is not able to beat.
- **Calibration is the property we actually need**, and it is reported far less often than AUC.
  A model that ranks learners well but is systematically overconfident at the extremes will
  produce bad placement decisions precisely for the learners furthest from average — who are
  the ones placement matters most for. AUC will not reveal this.

---

## 18. Pelánek — Applications of the Elo Rating System in Adaptive Educational Systems

`UNVERIFIED — host returned server errors on repeated attempts`

The relevant claims (Elo provides online, incremental difficulty and ability estimation
without a separate calibration phase; the update weight must decay with observation count for
estimates to stabilise; Elo estimates approximate IRT parameters closely enough for adaptive
sequencing) are independently corroborated by Wauters et al. above, which **is** verified and
found Elo at r = 0.85 against true difficulty. Pelánek's specific uncertainty-function
recommendations are unverified.

---

## 19. The Effects of ALEKS on Mathematics Learning: A Meta-Analysis

`UNVERIFIED — not retrieved`

Attributed finding is that ALEKS performs comparably to traditional instruction rather than
dramatically better — i.e. adaptive sequencing at scale produces modest rather than
transformative effects. Directionally consistent with the broader adaptive-learning
literature, but **effect sizes and study counts are unverified.**

---

## 20. Yang, Luo, Vadillo, Shanks et al. — Do Practice Tests Reduce or Provoke Test Anxiety? A Meta-Analytic Review

`VERIFIED — full text read` · [UCL Discovery](https://discovery.ucl.ac.uk/id/eprint/10177686/1/Shanks_Frequent%20Tests%20&%20TA-R2.pdf)

### DOK 1

- Random-effects meta-analysis of **25 effects from 24 studies**, **3,374 participants**.
- Overall effect of practice tests on test anxiety: **Hedges' g = −0.52**, 95% CI
  [−0.69, −0.36], p < .001; median g = −0.53. A medium *reduction* in anxiety.
- Bayesian evidence for the effect: **BF₁₀ > 25,000**. Minimal evidence of publication bias.
- **22 of 25 effects (88%)** found practice tests reduced test anxiety; 12% found the reverse.
  χ²(1) = 25.92, p < .001.
- Setting matters: classroom studies **g = −0.55**, 95% CI [−0.72, −0.38], p < .001;
  laboratory studies **g = −0.31**, 95% CI [−0.78, 0.15], p = .18 — inconclusive.
- **Easy practice tests reduce anxiety more effectively than difficult ones** (via
  meta-regression of effect size on practice-test performance, used as a difficulty proxy).
- Excluding the one study that measured anxiety *during* the practice test leaves the result
  essentially unchanged (g = −0.54).
- Related benchmark cited: Yang et al. (2021), 222 classroom studies and 48,000+ students,
  found class quizzes raise attainment at **g = 0.50**.
- Authors' caveat: quizzes may still be **more stressful than other learning activities** in
  the moment, even while reducing anxiety overall.

### DOK 2

- The common product intuition — that putting a test in front of a new learner will scare them
  off — is **not supported**. Practice testing reliably reduces test anxiety at a medium effect
  size, with strong evidence and little publication bias. This substantially weakens the case
  for hiding or heavily softening our diagnostic.
- **The difficulty moderator is not an argument for easy items.** The tempting inference — that
  we should open with easy questions because easy practice tests reduce anxiety more — does not
  survive contact with the desirable-difficulties literature (see entry 21). Conditions that
  raise in-the-moment fluency and confidence routinely *lower* long-term retention and transfer.
  Anxiety is at most an instrumental outcome; exam performance is the terminal one, and the two
  can trade against each other. Treat this moderator as a reason to monitor abandonment, not as
  a constraint on item difficulty.
- The mechanism behind the classroom-versus-lab split is more plausibly **routine exposure** than
  easiness, and the two are confounded in this meta-analysis. That reading yields a design lever
  we can actually use — make assessment predictable and recurring — without lowering difficulty.
- The classroom/lab split matters: the effect is established where testing is **routine and
  embedded in ongoing learning**, not in one-off lab encounters. A first-session diagnostic is
  closer to the lab condition. The reassuring effect is most likely to hold if testing is a
  recurring, normal part of the product — which is what our recall system already provides.
- The in-the-moment stress caveat and the overall anxiety reduction are compatible: the test is
  unpleasant while it happens and reduces dread afterwards. Design implication is to minimise
  friction during the session and make sure the payoff immediately afterwards is visible.

---

## 21. Bjork & Bjork — Desirable Difficulties (added to the list; not part of the original subagent sweep)

`UNVERIFIED — recalled from prior knowledge, not fetched. Numbers below are deliberately
qualitative; verify before citing externally.`

Key works: Schmidt & Bjork (1992, *Psychological Science*); Bjork & Bjork (1992, "new theory of
disuse"); Bjork & Bjork (2011, "Making things hard on yourself, but in a good way");
Bjork, Dunlosky & Kornell (2013, *Annual Review of Psychology*).

### DOK 1

- **Desirable difficulty**: a manipulation of practice conditions that slows acquisition and
  feels harder, yet improves long-term retention and transfer. Established examples: spacing
  over massing, interleaving over blocking, retrieval practice over restudy, generation over
  presentation, varied over constant conditions, reduced/delayed feedback.
- **New theory of disuse** distinguishes **retrieval strength** (current accessibility — how
  easily something comes to mind now) from **storage strength** (how durably it is learned).
  The two are dissociable, and gains in storage strength are *greater* when successful
  retrieval occurs at *lower* retrieval strength.
- Schmidt & Bjork (1992) showed across motor and verbal paradigms that conditions producing
  the fastest acquisition frequently produce the **worst** long-term retention and transfer.
- Learners' **judgements of learning** are systematically miscalibrated: perceived fluency is
  misread as learning, producing "illusions of competence." Learners routinely prefer and
  rate more highly the study methods that serve them worst.
- **Boundary condition:** difficulties are desirable only if the learner can successfully
  respond to them. Beyond that point they become *undesirable* difficulties — related to the
  expertise-reversal effect, where supports that help novices hinder experts and vice versa.

### DOK 2

- This dissolves most of the apparent tension in entry 20. Desirable difficulties concern the
  **learning** phase; adaptive item selection concerns the **measurement** phase. Both favour
  hard-but-tractable material, so they point the same direction rather than competing.
- The retrieval-strength/storage-strength distinction gives the precise reason a comfortable
  diagnostic is harmful rather than merely suboptimal: **feeling confident is evidence of high
  retrieval strength, which is exactly the condition under which a retrieval attempt teaches
  least.** Easy items are both bad measurement and bad learning at the same time.
- Because our diagnostic is itself a retrieval event, it has learning value, not just
  measurement value — and that value is maximised at difficulty, not minimised by it.
- Miscalibrated judgements of learning are a second-order argument for a hard diagnostic:
  learners cannot self-assess accurately, which is the entire justification for the product.
  A diagnostic that leaves them feeling capable reinforces the illusion we exist to break.
- The boundary condition is the one real constraint. Items far above a learner's ability
  produce guessing rather than retrieval, which teaches nothing and — for a 3PL with
  four-option items — also carries little measurement information. The usable target is the
  edge of ability, not the far side of it.

### Where this leaves the design

Keep adaptive targeting at maximum information. Do not soften item difficulty. Address
abandonment through **framing and feedback** instead: state up front that the test is
calibrated so that missing roughly a third of items is expected and informative, and keep
post-item feedback task-focused rather than person-focused (per Kluger & DeNisi, entry 6).
Demote test anxiety from a design constraint to a monitored metric.

---

## Coverage summary

| Status | Count | Sources |
| --- | --- | --- |
| Verified from primary text | 9 | 1, 2, 4, 7, 9, 10, 13, 17, 20 |
| Unverified — inaccessible | 11 | 3, 5, 6, 8, 11, 12, 14, 15, 16, 18, 19 |

Of the unverified sources, the two most worth retrieving properly are **#12 Madison &
Bradshaw** (Q-matrix design directly governs our KC model) and **#5 calibration error in CAT**
(our bank is uncalibrated, so this is our dominant error term rather than a footnote).

### Corrections to the earlier synthesis found by reading originals

- **Wauters:** 25 items and 13 experts, not 23 and 20. Learner difficulty judgements
  *outperformed* expert judgements (0.88 vs 0.80, significant) — the opposite of what was
  reported, and a cheap signal we are not collecting.
- **Dai et al.:** the analytic sample is 90 courses / 5.37M enrollments, not 200+ courses /
  5.7M users. More importantly, expected *time* on the first assessment is **negatively**
  associated with stopout even though item *count* is positively associated — the simple
  "shorter is always better" reading is wrong.
- **Shanks/Yang:** the easy-versus-difficult moderator was not surfaced previously. It initially
  looked like a challenge to adaptive item selection; entry 21 explains why it is not, and why
  anxiety should be monitored rather than optimised against.
- **CAPR:** the 81%/68% agreement rate was not surfaced previously. It bounds how much any
  placement algorithm can possibly matter.
