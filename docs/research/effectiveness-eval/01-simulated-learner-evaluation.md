# Simulated-Learner Evaluation of a Scheduling Policy

**Scope.** Can a simulation testbed credibly compare instructional scheduling policies — specifically, our integrated scheduler (Today's Path + BKT + FSRS + adaptive selection) against practice-tests-only, Anki-only, and competitor products — and how much should we believe the results?

**Method.** Literature/methods review, web sources, peer-reviewed preferred. Every load-bearing claim is tiered **A** (strong direct evidence or consensus), **B** (reasonable with limits), **C** (weak, indirect, or single-source). Sources read in full vs. abstract-only are marked in `## Sources`.

---

## Recommendation

**Build the testbed. Do not use it to substantiate the effectiveness claim.**

Build a simulated-learner harness, but scope it to three jobs it can actually do, and explicitly forbid it the fourth.

**What to build** (detail in `## Proposed testbed design`):

1. A **multi-model Robust Evaluation Matrix (REM)** in the sense of Doroudi, Aleven & Brunskill (L@S 2017): policies as columns, *generative learner models* as rows, where the rows deliberately include model families the scheduler does *not* assume. Minimum four rows: BKT+decay (the planner's own model — upper bound only), a DASH-style windowed-logistic model, an ACT-R/MCM-style power-law spacing model, and a sceptical "scheduling barely matters" model (slow-drift IRT). **Tier A** that this is the accepted defence; **Tier A** that single-model evaluation is known to be misleading.
2. A **minutes-denominated budget simulator**. Every activity consumes simulated minutes drawn from a per-activity-type distribution, and the weekly budget binds in minutes, not items. This is not a detail — it is the single confound that plausibly destroyed the one documented case where a predicted d ≈ 4 became d ≈ 0 (see `## The circularity problem`).
3. A **full policy × model × objective cube**, with the objective (expected scaled score at exam date T) pre-registered *before* any policy is run.

**What it can legitimately claim:**

- **Bug and pathology detection.** Starvation of KCs, oscillation between purposes, budget overruns, the `repair` purpose livelocking, FSRS queue blow-up under a bounded daily cap. Reddy et al. (KDD 2016) found a *sharp phase transition* — learning rate collapses to ~0 — when new-item introduction exceeds a threshold, and confirmed it in humans (n=331). Our scheduler introduces new lessons *and* new flashcards *and* new practice items against one budget. Finding out whether we are past that cliff is a real, high-value, cheap result. **Tier A.**
- **Worst-case bounding.** "Under no plausible learner model does the scheduler do worse than X" is a defensible, valuable statement. It is also the *only* comparative statement REM's authors claim their method supports; they are explicit that REM "does not necessarily give us reliable estimates" and is for *policy selection*, not policy estimation. **Tier A.**
- **Trial sizing and design.** The simulation's most valuable output is the *variance structure*, which tells you what field design you need. This is where the biggest practical win is (see "Do this first", below).
- **Objective-misspecification discovery.** A scheduler that maximises KCs-above-0.95 and one that maximises retained mastery at a fixed exam date are different systems. Our current stack is built to do the former. The simulation can demonstrate that cleanly, and that finding does not depend on the simulator being *right* about learning — only on it having a forgetting term at all. This may be the highest-value finding available. **Tier B.**

**What it cannot claim — and this is not fixable with more work:**

- **It cannot rank our scheduler against practice-tests-only or Anki-only credibly enough to publish, market, or bet the roadmap on.** **Tier A**, on the strength of the empirical record below.
- **It cannot address "better than other adaptive prep products" at all.** You do not have their policies, their content, or their item difficulties. There is nothing to simulate. Drop this claim from the roadmap or reframe it as a marketing claim requiring a head-to-head field trial. **Tier A** (definitional).

**Confidence in this recommendation: high (Tier A).** The reason is not that simulation is philosophically suspect. It is that the specific regime our scheduler occupies — sequencing *interdependent* curriculum content — has a documented field record of **0 clean wins in 8 controlled studies**, while the regime our flashcard component occupies — independent paired-associate items — has **11 clean wins in 14**. That asymmetry (Doroudi, Aleven & Brunskill 2019, IJAIED, Table 2) is the most decision-relevant number in this document and it points in a direction the simulation will not be able to overturn.

**Do this first (highest value per hour, and it is not a simulation task).** Import Lindsey, Shroyer, Pashler & Mozer's (2014, *Psych Science*) **within-subject item-level randomisation** design. They randomly assigned one-third of each chapter's *items* to each of three schedulers, counterbalanced across 179 students, time-matched on review trials, and measured on a proctored cumulative exam. That design got d = 0.88–1.42 out of 179 middle-schoolers. Applied here: randomise *KCs* (or flashcards) within each learner across scheduling arms, hold review minutes equal, and measure on held-out items at a fixed delay. This gives a genuine causal answer for the review/flashcard component at a fraction of the sample size a between-subjects trial needs. It does **not** work for the whole-path scheduler — you cannot give one learner two different daily plans — which is precisely why the component claims are cheap to establish and the integrated claim is expensive. Recognising that split is the practical takeaway.

---

## The circularity problem

### It has a name, and it is the central known failure mode

The literature calls it **model mismatch**, and evaluating a policy under the model that produced it is **direct model-based evaluation**. Doroudi, Aleven & Brunskill (L@S 2017) name the problem precisely: "a common approach is to estimate the efficacy of a policy a priori by simulating its performance using a student model that is identical to the one used to compute the policy itself… such an approach can overestimate the performance of the policy." **Tier A.**

Our case is the textbook instance. Today's Path scores activities using BKT-with-decay; adaptive selection targets success probabilities computed from that same model; FSRS schedules by predicted retrievability. If the simulated learner *is* BKT-with-decay plus an FSRS-shaped memory, the scheduler is solving the simulation exactly, and the comparators — which do not have access to the latent state — lose by construction. The output would be a tautology with error bars.

### Two facts that make this worse than it sounds

**1. There is a hard theoretical result: you cannot fix this with more data.** Mandel et al. (AAMAS 2014, via Doroudi et al. 2017) showed that even if the real world *is* a complex MDP, the optimal policy for an *incorrect* statistical model can have a higher estimated performance than the optimal policy of the true MDP — **with an infinite amount of data**, because the alternate model need not satisfy the Markov property. Doroudi et al.'s conclusion: "this is not a problem that learning at scale alone can solve." **Tier A.** Zero users is not why our simulation would be untrustworthy. Ten million users would not fix it.

**2. Predictive accuracy does not identify the model that gives good policies.** This is empirically established, not conjectural:

- **Rollinson & Brunskill (EDM 2015):** "models with similar predictive error rates can lead to very different policies… student models should not be judged by predictive error rates alone." **Tier A.**
- **Beck & Chang (UM 2007), BKT identifiability:** "observed student performance corresponds to an *infinite family* of possible model parameter estimates, all of which make identical predictions about student performance. However, these parameter estimates make different claims, some of which are clearly incorrect, about the student's unobservable internal knowledge." Adding Dirichlet priors improved AUC from 0.614 ± 0.002 to 0.620 ± 0.002 — a 0.006 AUC gain — while substantially changing the *plausibility* of the inferred knowledge states. **Tier A.** The scheduler acts on the latent state, which is the part the data does not identify.
- **Yudelson, Koedinger & Gordon (AIED 2013):** individualising BKT's learn rate p(T) on KDD-Cup Cognitive Tutor data moved RMSE from 0.36273 → 0.36116 and accuracy from 0.82755 → 0.82896 on Algebra I (and 0.34187 → 0.34065 / 0.84914 → 0.85013 on Bridge to Algebra). Real, consistent, and *tiny*. **Tier A.** Model-selection-by-fit will not distinguish the models whose policy implications diverge.
- **Khajah, Lindsey & Mozer (EDM 2016, best paper), "How Deep is Knowledge Tracing?":** BKT extended with forgetting, latent abilities, and skill induction matches DKT. Statics: BKT+FSA AUC 0.75 vs DKT 0.76. Spanish: 0.846 vs 0.836. Synthetic: BKT+S/FSA 0.80 vs DKT 0.75. On Assistments, 31.6% of the originally reported BKT–DKT gap was a biased AUC procedure and another 50.6% vanished on adding forgetting to BKT. **Tier A.** Consequence for us: BKT and DKT are *not* independent rows in a REM if you only care about fit — but they still disagree sharply about policy (below), which is the point.

### The one documented case of a simulated ranking meeting reality head-on

Doroudi, Aleven & Brunskill (L@S 2017), Case Study 1, fractions ITS, models fit on >1,000 students who did 20–100 problems each; policies evaluated on 1,000 simulated students each doing 40 problems; identical 16-item pre/post-tests.

**Direct model-based evaluation (each adaptive policy simulated under the model that produced it):**

| | Baseline 1 (non-adaptive) | Baseline 2 (varied, non-adaptive) | BKT mastery | AP-1 | AP-2 |
|---|---|---|---|---|---|
| Simulated posttest (/16) | 5.87 ± 0.90 | 6.10 ± 0.97 | 7.03 ± 1.00 | 7.85 ± 0.98 | 9.10 ± 0.80 |
| **Actual experiment** | **5.52 ± 2.61** | **5.14 ± 3.22** | **5.46 ± 3.00** | **5.57 ± 3.27** | **4.93 ± 1.80** |

Predicted Cohen's d for AP-2 vs Baseline 2 was **3.66**; vs Baseline 1, **4.14**. In the actual experiment there was **no significant difference between any of the five policies**, and AP-2 — the simulation's runaway winner — came out numerically *last*. **Tier A** (single case, but a direct, fully reported simulated-vs-field comparison, and the authors' own study).

**The REM version of the same analysis, which would have caught it:**

| Simulator model | Baseline 1 | Baseline 2 | BKT mastery | AP-1 | AP-2 |
|---|---|---|---|---|---|
| New (G-SCOPE) model | 5.87 ± 0.90 | 6.10 ± 0.97 | N/A | 7.85 ± 0.98 | 9.10 ± 0.80 |
| BKT model | 6.46 ± 0.78 | 6.65 ± 0.95 | 7.03 ± 1.00 | 6.82 ± 0.94 | 7.04 ± 0.96 |
| **DKT model** | **9.89 ± 1.45** | 8.69 ± 1.82 | 8.55 ± 2.08 | 8.31 ± 2.22 | 8.58 ± 2.13 |

All three models had **cross-validated RMSE between 0.41 and 0.44** — statistically near-indistinguishable. Under G-SCOPE, the new adaptive policy wins by a mile. Under BKT, everything is within noise. **Under DKT, the plain non-adaptive Baseline 1 wins.** The ranking fully reverses across models that fit the data equally well. **Tier A.**

**Calibration rule this yields.** In the one case with both numbers, simulated d ≈ 3.7–4.1 corresponded to field d ≈ 0. A realistic field effect for a scheduling contrast is d ≈ 0.2–0.4. So: **do not act on a simulated advantage unless it is sign-consistent across every model row AND at least an order of magnitude larger than the field effect you would be willing to bet on.** Which means you would need a simulated d of roughly 2–4 before the simulation carried information. If your simulated advantage is d < 0.5 in any row, the honest reading is "probably not worth a trial," not "modest win." **Tier B** (a decision rule extrapolated from one documented case; the direction is well supported, the exact multiplier is not).

### The confound the authors flagged afterwards, which is *our* confound

Doroudi et al.'s own post-mortem: the simulation fixed trajectory length at 40 problems, but in the field, "students who had the Baseline 1 policy did around 48 problems on average, whereas for all the other policies, the average was 28 problems or less," because Baseline 1 served only the fastest activity type. They conclude this "could explain why Baseline 1 did as well as the other policies." **Tier A.**

This is precisely the failure waiting for us. Today's Path mixes lessons, CARS-style passage practice, discrete practice items, and flashcards — activities whose per-item time costs differ by an order of magnitude — under a *learner-declared weekly time budget*. A simulation that counts items instead of minutes will hand a large artificial win to whichever policy happens to favour cheap activities. "Anki-only" is nothing but cheap activities. Get this wrong and the comparison is decided by an accounting convention. **Time cost per activity type must be a first-class swept parameter, not a constant.**

### Does published work do the mismatch analysis, or quietly skip it?

Mostly skip it, and the skipping is quantified.

- Doroudi, Aleven & Brunskill (IJAIED 2019) counted, among papers that did *not* meet their inclusion criteria: **19 papers** that learned policies on offline data but never evaluated them on real learners, and **at least 23 papers** that learned and compared policies using *only* simulated data with no real-learner data at all. Against **36 studies** that did run a controlled comparison. So the simulation-only literature is roughly as large as the entire tested literature. **Tier A.**
- Käser & Alexandron (IJAIED 2024), the first systematic review of simulated learners (2010–19): simulated learner models "tend to represent only narrow aspects of student learning," and "almost half of the studies using simulated learners do not provide *any* evidence that their modeling addresses the most fundamental question in simulation design — is the model valid?" **Tier A for the finding; abstract only — I did not read the full text.**
- The honourable exceptions are worth copying. Khajah, Lindsey & Mozer (CogSci 2013 / *Topics in Cognitive Science* 2014) state the circularity outright in the paper: "Because we use the same model for scheduling as we use for modeling the student, this scheduler offers a **best-case** use of the θ-threshold." They then treat the self-consistent number as an upper bound rather than a prediction, and run the analysis under *two* memory model families. That framing — self-consistent row = upper bound, never an estimate — is exactly the discipline to adopt. **Tier A.**
- Rafferty, Brunskill, Griffiths & Shafto (*Cognitive Science* 2015/2016) ran all their policies under all three of their concept-learning models *and* tested every one on humans, which is why their results can be re-read as a REM validation. **Tier B** (I know this study through the REM paper's and IJAIED review's descriptions, not the original).

### The one place circularity is *not* a serious problem — and why it does not transfer

The team's existing diagnostic harness (simulated learners with latent ability, IRT-generated responses, assumption-grid sweeps) is methodologically sound, and it is important to see *why*, because the reason does not carry over.

Simulating a **measurement** procedure is epistemically much safer than simulating **learning**. In the diagnostic harness, ability is held fixed; the quantities being validated — estimator bias and SE, routing behaviour, item exposure, stopping rules — are properties of the estimator under a data-generating process whose core assumptions (local independence, monotone item characteristic curves) are among the best-validated in psychometrics for multiple-choice testing. You are checking arithmetic against a well-supported measurement model.

A scheduling harness validates a *causal* claim about how instruction changes a latent state over weeks. There is no comparably validated model of that. **The credibility of the diagnostic harness does not transfer to a scheduling harness, and it would be an easy and expensive mistake to assume it does.** **Tier B** (my reasoning from standard psychometric practice; not a claim I found stated in these words in a source).

### The unbiased alternative is arithmetically unavailable to us

Importance sampling gives unbiased off-policy estimates with no student model at all. Doroudi et al. show why it is useless for sequencing: with 20 binary decisions, only 1 in 2²⁰ (≈1 million) logged learners matches a deterministic target policy's trajectory; at 50 decisions you need >10¹⁵. **Tier A.**

Today's Path makes roughly 5–8 activity choices per day over 60–120 days: **order 300–1,000 sequential decisions.** Importance sampling is not merely impractical here, it is off by hundreds of orders of magnitude. The one method that is unbiased by construction is permanently closed to us. That is why REM — "using many models we expect to be wrong, rather than using one model we hope to be right" — is the only remaining option, and why its limits are our limits.

---

## Findings

### 1. Seriousness of circularity, its name, and the accepted defences

Covered above. Summary of the accepted defences, in descending order of what they buy you:

| Defence | What it buys | Available to us now? |
|---|---|---|
| Randomised field trial | Ground truth | Not yet (zero users) |
| Importance sampling / off-policy estimation | Unbiased estimate, no model assumed | **No** — 300–1,000 decisions (Tier A) |
| REM: multiple *disagreeing* generative models | Robust *ranking*, no valid *estimate* | **Yes**, and it is the right choice |
| Self-consistent simulation labelled as upper bound | An honest ceiling | Yes — this is the Khajah discipline |
| Direct model-based evaluation presented as a prediction | Nothing. Predicted d ≈ 4 → actual d ≈ 0 | Forbid it |

One caveat the REM authors state and we should adopt verbatim: REM's value "depends on being convinced that our choice of student models to use in the matrix was good," and a necessary condition for a model to be usable is that it *can* differentiate between policies at all — a model in which nobody ever learns rates all policies equally and contributes nothing. **Tier A.**

### 2. What learner simulators exist, what they need, and whether they have been used for *policy* evaluation

| Family | Needs to fit | Can predict | Cannot predict | Used to evaluate *scheduling policies*? |
|---|---|---|---|---|
| **BKT** (Corbett & Anderson 1994/95) | 4 params/KC: P(L₀), P(T), P(G), P(S); response sequences per KC | Next-item correctness; a mastery probability; when to stop practising a KC | Timing/spacing effects (no time in the model); forgetting without a bolted-on decay term; cross-KC transfer | Yes, extensively — it is the mastery-learning policy. Also the row that showed "everything is within noise" in REM's matrix. **Tier A** |
| **AFM / PFA** (Cen/Koedinger/Junker 2006; Pavlik, Cen & Koedinger 2009) | Logistic regression: student ability, item difficulty, counts of prior correct/incorrect per KC | Learning curves, multi-KC items, diminishing returns; no discrete mastery state | Temporal distribution of practice — the additive-factors form has no time term at all | Yes, as an alternative model class in policy comparisons; Rollinson & Brunskill compared LFM- and BKT-derived stopping policies. **Tier A** |
| **DKT** (Piech et al. NeurIPS 2015) | Large response-sequence corpora; no KC labels needed | Sequence-level regularities; recency; inter-skill similarity | Anything interpretable; anything about *unseen* action types (it can only mimic the logging policy's support) | Used *as a simulator row* in REM, where it reversed the ranking. Almost never used to *derive* deployed policies with field validation. **Tier A** |
| **ACT-R declarative memory** (Anderson et al. 2004; Pavlik & Anderson 2005) | Activation/decay params, typically fit to aggregate lab data | Power-law forgetting; spacing effects; recall *latency* as well as accuracy | Comprehension, transfer, reasoning; needs a proliferation of params for individual differences | **Yes, and validated in the field** — Pavlik & Anderson 2008 (below) is the strongest single positive case. **Tier A** |
| **MCM** (Mozer, Pashler, Cepeda, Lindsey & Vul, NeurIPS 2009) | 5 params; fit to lab spacing data | Multi-timescale forgetting: a separate exponentially-decaying trace per study event, weighted-averaged to approximate a power law | Individual differences without parameter explosion | **Yes** — one of the two models Khajah et al. used to derive the policy that Lindsey et al. then deployed successfully. **Tier A** |
| **DASH** (Lindsey, Shroyer, Pashler & Mozer 2014) | Population-scale trial logs; hierarchical Bayesian inference of per-student ability αₛ and per-item difficulty δᵢ | Recall probability per (student, item, time), combining IRT-style latent factors with windowed study-history counts | Requires population data — it is fundamentally a collaborative-filtering-flavoured model, so it has *no* cold start | **Yes — this is the one clean success story.** **Tier A** |
| **HLR** (Settles & Meeder, ACL 2016) | Millions of practice sessions; features = history counts + item tags | Item half-life as `h = 2^(Θ·x)`; scales to production | Nothing about instructional content; overfits on sparse item-identity features (they hit this in production) | Deployed at Duolingo, A/B tested — **on engagement, not learning** (see item 3). **Tier A** |
| **FSRS** (Ye et al., open source) | Review logs with grades; 17–21 params | Difficulty/stability/retrievability, next interval | Anything non-flashcard | Deployed at scale; **no peer-reviewed learning-outcome RCT found.** **Tier B/C** |
| **Cognitive architectures beyond memory** (full ACT-R models, CI-theory comprehension models) | Task-specific hand modelling; very high effort | Fine-grained behaviour on constrained tasks | Do not scale to 422 KCs across 10 foundational concepts on a small team | Rarely, and not for multi-month curriculum scheduling. **Tier B** |

**Structural details worth borrowing.** DASH's functional form is: `Pr(R=1) = logistic[αₛ − δᵢ + Σ_w φ_w·log(1+c_siw) − ψ_w·log(1+n_siw)]`, where `c` and `n` are correct-count and attempt-count within time window `w`, add-one smoothed. Lindsey et al. used **five time windows: s = {1/24, 1, 7, 30, ∞} days** — deliberately exponentially expanding and "synchronized to the natural periodicities of student life." **Tier A, verified in full text.** That window set is directly reusable for us and is a genuinely different functional form from BKT — which makes it a good REM row.

**The critical structural point for our REM rows:** BKT-with-a-decay-term and the ACT-R/MCM family disagree about something specific and consequential — whether *forgetting rate itself depends on the history and spacing of prior study*. BKT+decay has one half-life per KC. ACT-R and MCM both make the decay rate a function of the study schedule. Khajah et al. (CogSci 2013) closed their paper on exactly this: "whatever model is used must take into account the history and spacing of past study, because the effect of distributed practice… is central to the difference in performance across review schedules." **Tier A.** A scheduler tuned against a fixed-half-life model, evaluated only against a fixed-half-life model, is blind in exactly the dimension the literature says decides scheduling quality. **This is the single most important row to add.**

### 3. Does simulation-based policy evaluation transfer to real learners? Case by case, with numbers

This is the crux. The record is genuinely mixed, and the pattern in the mix is informative.

#### 3a. Pavlik & Anderson (2008), *JEP: Applied* — **transferred, with an instructive miss**

An ACT-R-derived optimised practice schedule vs. Atkinson's (1972) algorithm vs. a simple flashcard control, on second-language vocabulary.

- Session 4 correctness: F(2,57) = 5.4, p = .0073; all pairwise comparisons favoured optimisation. **d = 0.978 vs flashcard control; d = 0.796 vs Atkinson.**
- Session 4 latency: F(2,57) = 10.3, p = .00015. **d = 1.31 vs flashcard; d = 1.17 vs Atkinson.**
- Trials-to-criterion nested comparison: F(2,57) = 12.5, p = .000032; **d = 2.21 vs flashcard, d = 0.807 vs Atkinson.**

**And here is the part everyone omits.** They pre-simulated first-trial recall for the three conditions and got **56% / 31% / 24%** (optimisation / flashcard / Atkinson). Actual: **66% / 35% / 40%.** So the model (a) underestimated absolute performance by 10–16 percentage points in every condition, and (b) **got the ranking of the two baselines backwards** — it predicted flashcard > Atkinson (31 vs 24) and observed Atkinson > flashcard (40 vs 35). It nailed the winner and mis-ranked the losers. The authors' own gloss: "the model was generally biased to underestimate performance, [but] it seems to well capture the advantage of the optimized condition relative to the controls." **Tier A, verified in full text.**

Read this as the *best realistic case*: a well-validated memory model, a narrow task, correct identification of the winner, and still wrong about levels and wrong about the ordering of the comparators. If you need to know only "does our thing beat the field," that is enough. If you need "by how much, and which comparator is second," it is not.

One further number from that paper with direct bearing on our design: the model computed that **99.2% recall during learning** was optimal for that task (minimum-noise case) — i.e., near-errorless learning. Our `train` purpose targets ~80% success. Those are very different prescriptions, from a model that then won in the field. Worth a sweep. **Tier B** on transferability across task types (paired-associate vocabulary ≠ MCAT reasoning items).

#### 3b. Lindsey, Shroyer, Pashler & Mozer (2014), *Psychological Science* — **transferred, and the simulation used a different model family than the deployed one**

This is the strongest positive case in the literature and its structure is the template we should copy.

- **Design:** 179 eighth-graders, third-semester Spanish, semester-long, COLT retrieval-practice software, 10 chapters at ~1-week intervals, three 20–30 min sessions per chapter. Items randomly assigned in thirds to three schedulers (massed / generic-spaced / personalised-spaced), counterbalanced across students, **all schedulers administered an equal number of review trials** (time-matched). 597,990 recorded trials.
- **Exam 1 (end of semester):** personalised vs massed **+12.4%, d = 1.38**; personalised vs generic spaced **+8.3%, d = 1.05**; both p < .001.
- **Exam 2 (28 days later, proctored, no feedback):** personalised vs massed **+16.5%, d = 1.42**; vs generic **+10.0%, d = 0.88**.
- **Forgetting over the 28-day break: 18.1% (massed), 17.1% (generic), 15.7% (personalised).** The advantage *widened* with delay.
- Total intervention dose: **~30 min/week ≈ 10% of course time.**
- Mean days between review trials: 0.12 (massed) / 1.69 (generic) / 4.70 (personalised).

**The transfer chain matters more than the effect size.** The *policy* was chosen by simulation — Khajah, Lindsey & Mozer, who searched exhaustively for optimal review schedules under **ACT-R and MCM** and found a simple θ-threshold heuristic came close to optimal. But the *deployed* system predicted memory strength with **DASH**, a windowed-logistic hierarchical Bayesian model — a *different model family* from either simulator. So: policy validated in simulation under two memory-model families, then implemented on top of a third model, then won in the field with d ≈ 0.9–1.4. **That is the mismatch defence working, prospectively, in a real classroom.** **Tier A.**

**Caveats the authors state, which we should not launder away:** the design "confounded personalization and the coarse temporal distribution of review"; massed was already spaced by lab standards (≥6 days), likely shrinking the generic-vs-massed gap; and there was uncontrolled outside exposure to the material. Also note the effect sizes are *item-level within-subject* — they are not the effect size a between-subjects whole-product trial would see.

#### 3c. Khajah, Lindsey & Mozer (CogSci 2013 / *Topics in Cognitive Science* 2014) — the simulation upstream of 3b

The sweep structure is the one to copy: **2 memory models (ACT-R, MCM) × 105 parameterisations (a family of 105 power-function forgetting curves spanning material difficulty, student ability, study manner, interference) × 3 retention intervals (RI = 1, 4, 26 weeks) × 3 review-onset delays (D = 1, 2, 3 weeks) = 1,890 combinations**, each solved by exhaustive search over all distinct review schedules for a 10-block (10-week) curriculum.

Findings:
- Four weeks after a 10-week semester, a good review schedule gave **+89.7% retention vs no review** and **+16.1% vs a poor review schedule**; across the full space, "well-timed review is as much as **33% better** than poorly-timed review."
- The **θ-threshold heuristic** (review the item whose predicted recall is closest to θ) came close to the exhaustive optimum under *both* models, with **θ ≈ 0.4** best per the CogSci 2013 text. Lindsey et al. (2014) cite the same work as finding **θ = .33** best. I could not reconcile the two figures; treat the answer as **θ ≈ 0.33–0.40** and note the discrepancy between versions. **Tier B** on the exact value, **Tier A** on "a threshold in that neighbourhood is near-optimal under two model families."
- The **2-back heuristic** was recommended as robust — but "performs well for the majority (**60–80%**) of scenarios," i.e., it fails in 20–40%. This is what good worst-case reporting looks like: they published the fraction of worlds where their recommendation loses.
- Explicit circularity disclosure and explicit open problem: "we've assumed that the model we use for determining memory strength… is a veridical model of our (simulated) student. An important question for future research concerns how the accuracy of the model used for scheduling affects the performance of the θ-threshold scheduler." **That question is still open, and it is our question.** **Tier A.**

#### 3d. Settles & Meeder (ACL 2016), Duolingo HLR — **the widely-cited transfer result is not what it is usually claimed to be**

This one is routinely mis-summarised, including in the abstract of the paper itself, and getting it right changes what it supports.

- Offline: on 12.9M instances (90/10 temporal split), HLR cut **MAE by ≥45%** vs Leitner. But **Leitner had the *highest* AUC** of all algorithms tried. So the two headline accuracy metrics disagreed about which model was better at *ranking* items for practice — which is what a scheduler actually needs. **Tier A, verified in full text.**
- **Experiment I (HLR vs Leitner, ~1M students, 6 weeks)** — daily retention change: any activity **+0.3%**, lessons **+0.3%**, practice sessions **−7.3% (p < 0.001, a significant decrease)**. They deployed HLR anyway, on the strength of anecdotal feedback and a narrative about why less practice was fine.
- **Experiment II (HLR-lex vs HLR, 3.3M students, 2 weeks)** — any activity **+12.0%**, lessons **+1.7%**, practice **+9.5%**, all p < 0.001.
- **The famous "12% improvement" is Experiment II: HLR-without-lexeme-features vs HLR-with-them. It is a comparison of two HLR variants, not HLR vs Leitner.** The HLR-vs-Leitner test was, on its primary practice metric, a significant *loss*.
- Motivation for Experiment II: lexeme-tag features overfit despite L2 regularisation, causing real users to complain that specific words "would decay rapidly regardless of how often they practiced." Removing features fixed it — and also solved cold start for new languages.
- **Every outcome is an engagement metric. Daily return rates. There is no learning or retention outcome anywhere in the paper.** **Tier A.**

Two lessons. First, an offline accuracy win (MAE halved) produced a null-to-negative field result on the metric that mattered most — the same phenomenon as REM Case Study 1, in a company with a million-user A/B test. Second, if we cite Duolingo as evidence that better memory models improve *learning*, we are citing something the paper does not contain.

**And a sharp cross-dataset check on HLR.** The community FSRS/Anki benchmark (72 users, 6,240,084 reviews) reports HLR performing **worse than SM-2**: log loss 0.7951 vs 0.7317 and RMSE(bins) 0.2094 vs 0.2079 on one split; 2.5175 vs 0.8847 and 0.4141 vs 0.2185 on another. FSRS v4 leads at log loss 0.3874 / RMSE(bins) 0.0459. **Tier B/C — community benchmark, not peer reviewed, and SM-2 requires an adaptation to emit probabilities at all.** But the direction is a warning we should take: **the memory model that won on Duolingo's data loses to a 1980s heuristic on Anki's data.** Memory-model rankings are dataset-dependent. Borrowed parameters and borrowed model rankings do not travel as well as their papers imply.

#### 3e. Tabibian et al. (2019), PNAS, MEMORIZE — **weaker evidence than the venue suggests; partially circular**

- Derives the optimal reviewing intensity as proportional to the probability of forgetting, via stochastic optimal control of jump SDEs, under exponential-forgetting and (in SI) power-law and MCM memory models.
- Evaluated on the public Duolingo HLR dataset (~12M sessions, ~5.3M unique (user, item) pairs, **2 weeks** of data). Learners closest to MEMORIZE showed significantly lower empirical forgetting rate than those closest to uniform or threshold schedules (Mann–Whitney U, p < 0.05), controlling for training period and number of reviews. A secondary analysis on **322 learners** with ≥70 reviewing sequences found lower forgetting rates when a learner followed MEMORIZE more closely.
- **It is a natural experiment, not an intervention.** The authors say so plainly: "we cannot make actual interventions"; the design assigns (user, item) pairs to "treatment" and "control" by *likelihood under each schedule*, taking the top 25% quantile per method.
- **This is partially circular in a specific way.** Group assignment is by likelihood under the model family being tested, and the outcome metric — empirical forgetting rate `n̂ = −log(m̂(tₙ))/(tₙ − tₙ₋₁)` — is itself defined by the exponential-forgetting assumption that MEMORIZE is derived under, with `α`, `β`, and `nᵢ(0)` fitted by half-life regression on the same data. Learners who happen to behave in a way the model likes are being scored on a metric the model defines. Self-selection is not eliminated by controlling for training period.
- The authors also list further limits: "the dataset spans only 2 wk and that places a limitation on the range of time intervals between reviews and retention intervals we can study," and they call for "large-scale interventional experiments" as future work.
- **The paper reports no effect size in interpretable units in the main text** — significance stars on box plots of forgetting rate. I read the main text via PMC; I did not read the SI Appendix, where any additional quantification would be.

**Verdict: Tier C for "MEMORIZE transfers to real learners."** Strong theory, real data, but observational, model-defined outcome, 2-week horizon, no reported effect magnitude. Not a policy-transfer success story, whatever the venue.

#### 3f. Reddy, Labutov, Banerjee & Joachims (KDD 2016), Leitner Queue Network — **a qualitative prediction transferred; the policy was never field-tested**

- Memory model fit by mining Mnemosyne flashcard logs (overall recall rate 0.56, intervals scaled to days), comparing exponential-forgetting variants against 0PL-IRT, 1PL-IRT, and logistic regression by 10-fold CV AUC. Finding: exponential-forgetting models *with* a delay term perform **comparably to 1PL-IRT**, the best benchmark — not better. Item-specific difficulties helped; they nonetheless adopted a global θ for tractability.
- Adopted model: `P[recall] = exp(−θ · dᵢ / qᵢ)` where `d` is time since last review and `q` is Leitner deck index.
- **Field test:** MTurk, **331 unique users, 446 items, 77,034 logs, fixed 15-minute sessions, mean 171 logs/session, overall recall 0.663**, with new-item arrival rate varied across `[0.0077 … 0.19]` items/second. Simulated parameters `n = 5` decks, `U = 0.1902`, global item difficulty `θ = 0.0077`.
- **Result: the predicted sharp phase transition in learning rate appeared in the human data, near the predicted threshold.** Simulated and empirical curves "in close agreement." **Tier A for the phase transition.**
- **But:** what transferred was a *qualitative structural prediction about system overload*, not a *ranking of scheduling policies*. Their optimised schedule was never compared against Leitner on real learners. Tabibian et al. declined to compare against it because it assumes a discrete forgetting-rate set.

**This is the most directly actionable transfer result for us**, and it is worth being clear why. The claim "if you introduce new material faster than a threshold, throughput collapses" is a claim about *queue dynamics under a bounded budget*. It depends on the memory model only weakly — you get a cliff from almost any forgetting model plus a hard review capacity. Structural claims of that kind are robust to model mismatch in a way that ranking claims are not. Our scheduler introduces new lessons, new practice items, and new flashcards against one budget, with `repair` injections on top. **Whether we are on the wrong side of that cliff is exactly the kind of thing this simulation can answer credibly.**

#### 3g. Negative results where the simulation-optimal policy underperformed

- **Doroudi et al. (L@S 2017), fractions ITS:** predicted d = 3.66–4.14, actual null, simulation's winner numerically last. **Tier A.**
- **Rowe et al. (AIIDE 2014) → Rowe & Lester (AIED 2015):** simulated performance 25.4 for the new policy vs 3.6 for random (normalised learning gain beyond the median student), both simulated under the model used to derive the new policy. In the experiment with real students, **no significant difference**. **Tier B** — reported via Doroudi et al. 2017; I did not read the Rowe papers.
- **Rafferty et al., Experiment 3:** the maximum-information-gain policy was predicted (under the continuous POMDP that generated it) to beat random selection and both other POMDP policies on all three concept-learning tasks. In the actual experiment it was **worse than random action selection and worse than all POMDP policies, on all three tasks.** REM would have flagged it: the memoryless and discrete-with-memory models both predicted it would lose to random on at least one task. **Tier B** — via the REM paper.
- **Mettler, Massey & Kellman (2011), ARTS:** the single study in the IJAIED review's "significantly worse" cell. A response-time-based adaptive scheduler with *hand-set* parameters beat a data-fitted Atkinson-model policy — so the more sophisticated, more fitted model lost to the simpler, unfitted heuristic. **Tier C** — I know this only through the review's classification and footnote; I did not read the original.
- **Settles & Meeder Experiment I:** −7.3% practice sessions, discussed above. **Tier A.**

#### 3h. The regime-dependence result that should reset our expectations

Doroudi, Aleven & Brunskill (IJAIED 2019) reviewed all controlled experiments comparing RL-induced instructional policies to baselines. Of the studies meeting inclusion criteria (the text says 36; Table 2's "All Studies" row sums to 41 — a discrepancy in the paper I could not resolve, so I report Table 2's cluster rows as printed):

| Cluster | Sig | ATI | Mixed | Not sig | Sig **worse** | n |
|---|---|---|---|---|---|---|
| All studies | 21 | 4 | 4 | 11 | 1 | 41 |
| **Paired-associate learning** (independent items — *flashcards*) | **11** | 0 | 0 | 2 | 1 | 14 |
| Concept learning | 4 | 0 | 2 | 1 | 0 | 7 |
| **Sequencing interdependent content** (*curriculum-level sequencing*) | **0** | 0 | 2 | 6 | 0 | **8** |
| Sequencing activity types | 4 | 4 | 0 | 2 | 0 | 10 |
| Not optimising learning | 2 | 0 | 0 | 0 | 0 | 2 |

Studies that did find effects "often found a Cohen's d effect size of at least 0.8." **Tier A, verified in full text.**

**Read the two bold rows against our architecture.**

- Our **FSRS flashcard component** lives in the paired-associate cluster: **11/14 clean wins.** Adaptive scheduling of independent items is a solved, repeatedly replicated win.
- Our **Today's Path engine** — sequencing 114 lessons and 2,108 items across 422 interdependent KCs under 10 foundational concepts — lives in "sequencing interdependent content": **0 clean wins in 8 studies**, 6 outright nulls, 2 partial.
- Our **adaptive practice purposes** (`train`/`probe`/`repair` — choosing an activity *type* for content) are closest to "sequencing activity types": **4 sig + 4 aptitude-treatment-interaction out of 10**, with the ATI studies finding benefits *only for lower-performing learners*. That last detail is a concrete, testable, and commercially useful hypothesis: our adaptivity may help weak learners and do nothing for strong ones.

The review's own explanation: "RL has been most successful in cases where it has been constrained with ideas and theories from cognitive psychology and the learning sciences," and "more successful in more constrained and limited settings."

**Implication.** The component of our system with the best evidentiary prospects is the one we did not build (FSRS is off the shelf). The component we consider our differentiator sits in the only cluster with a zero. No simulation can fix that, because the simulation is not the source of the pessimism — eight field experiments are. What this does do is tell us where to point the trial: prove the *review/flashcard* and *low-prior-learner* claims, which are supported by the literature and cheap to test, rather than the integrated-scheduler claim, which is not supported and expensive to test.

### 4. Fitting a simulator with zero response data

Yes, this is doable — the constraint is much less binding than it feels, because (per §The circularity problem) parameter uncertainty is *second-order* to model-class uncertainty. You are not blocked on data; you are blocked on something data would not fix.

#### What can legitimately be borrowed

**BKT slip/guess bounds — strong, citable, and directly applicable.** Baker, Corbett & Aleven (ITS 2008), verbatim: "Generally, in existing tutors, the guess parameter is bounded to be between 0 and 0.3, and the slip parameter is bounded to be between 0 and 0.1, based on the most common number of candidate actions, and pragmatically, in order to err in the direction of requiring less practice for mastery." **Tier A, verified in full text.**

For us this needs one adjustment and it is important. **Our items are four-option multiple choice, so blind guessing floors P(G) at 0.25** — the conventional upper bound of 0.30 is essentially *at* chance. A defensible box for 4-option MCAT-style items is therefore:

- **P(G) ∈ [0.22, 0.40]** — the lower end below 0.25 only if distractors are genuinely attractive to the unknowing (which good MCAT distractors are, so 0.22 is admissible); the upper end covering partial knowledge and eliminate-two-then-guess.
- **P(S) ∈ [0.05, 0.15]** — 0.10 conventional, widened for a timed high-stakes exam where careless errors are common.
- **P(T) ∈ [0.05, 0.20]** per opportunity, 0.10 being the classic default.
- **P(L₀)**: do *not* borrow a single number. It is what the 140-item diagnostic is for, and it varies enormously across a pre-med population. Sweep it as a *distribution* over learners.

Note explicitly that model-degeneracy constraints (P(G) + P(S) < 1; conventionally P(G) < 0.5, P(S) < 0.5) are automatically satisfied inside this box. **Tier A on the constraint, Tier B on my specific widened intervals** — the MC-chance-level adjustment is my reasoning, not a quoted range.

**Fit statistics to expect, for sanity-checking the simulator.** Yudelson et al. (AIED 2013) on KDD Cup Cognitive Tutor data: RMSE 0.341–0.363, accuracy 0.823–0.850. Khajah et al. (EDM 2016): AUC 0.73 (Assistments classic BKT), 0.83 (BKT+forgetting), 0.75–0.76 (Statics, BKT+FSA and DKT), 0.836–0.846 (Spanish). **If our simulator produces learners whose within-simulation predictability is far outside AUC 0.70–0.85, it is unrealistically clean or unrealistically noisy.** That is a real, cheap validity check available with zero of our own data. **Tier A on the numbers, Tier B on using them as a calibration target.**

**Forgetting half-lives — the most useful borrowing, and the least obvious place to get it from.**

- **Direct measurement, right task type, right timescale:** Lindsey et al. (2014) observed **15.7%–18.1% loss over a 28-day gap** on MC-style course material that had been reviewed. Treating that as proportional exponential loss: half-life = 28·ln2 / −ln(0.83) ≈ **104 days** for the ~17% case. *(This conversion is my own arithmetic from their reported percentages, clearly labelled; they did not report a half-life.)*
- **Right domain — this is MCAT content:** medical students forget roughly **25%–35% of basic science knowledge after 1 year**, more than 50% by the following year, and 80%–85% after 25 years. Converting the 1-year figures to exponential half-lives: ≈**590–710 days**. **Tier B and secondary** — these figures are quoted in Lindsey et al. (2014) from Custers (2010), *Adv Health Sci Educ*, and Custers & ten Cate (2011), *Medical Education*. I did not read either original. The conversion to half-lives is mine.
- **Structural, not numeric, borrowing:** DASH's five windows `s = {1/24, 1, 7, 30, ∞}` days. **Tier A.**
- **A parameter you must NOT borrow, as a cautionary example:** Reddy et al.'s fitted `θ = 0.0077` looks like a tempting off-the-shelf decay constant. In their MTurk simulation it sits alongside arrival rates in *items per second* and a 15-minute session, implying a half-life of order `ln2/0.0077 ≈ 90 seconds`. Meanwhile their Mnemosyne analysis scaled intervals to *days*. The number is not interpretable without its units and its regime, and neither regime is ours. Borrowing it would be a silent unit error with large consequences.

**The implication of that spread is the actual finding.** Credible half-lives for our content range from days (a newly-seen amino-acid structure) to ~2 years (consolidated basic science). **That is two to three orders of magnitude, and half-life is the parameter our scheduler's decay term is most sensitive to.** Which means: (a) a single global BKT half-life is indefensible, and the simulation can demonstrate that; and (b) the honest range is wide enough that a *point-estimate* simulation comparison is meaningless from the start.

#### How wide before the comparison becomes uninformative — with a number

The temptation is to answer this by widening ranges until the comparison breaks. The literature gives a sharper answer: **the comparison is already uninformative from model-class uncertainty alone, before you widen any parameter.**

In REM Case Study 1, three models with cross-validated RMSE within a **0.03 band (0.41–0.44)** — no parameter uncertainty in play, all fit to >1,000 students, matched predictive accuracy — produced a **complete reversal** of the policy ranking, and the self-consistent evaluation overstated the effect by a factor of >10 relative to the field. **Tier A.**

So the operational answer:

- **Parameter-range width is second-order.** Do not spend weeks arguing about whether P(T) is 0.08 or 0.12. Sweep it coarsely and move on.
- **The binding constraint is: how many genuinely different model families can you write down and defend?** Four is enough to be useful; one is worthless regardless of how carefully its parameters are chosen.
- **Decision rule, from §The circularity problem:** believe a ranking only if sign-consistent across every row *and* the margin exceeds the full spread induced by the sweep within any single row. If within-row sweep spread swamps the between-policy gap — which, given a 100× range on half-life, it very likely will — **the correct output is "the simulation cannot rank these," and that is a legitimate, reportable, useful result.** It tells you a trial is unavoidable and roughly how big.

### 5. What outcome should the simulation measure — and how the choice picks the winner

The choice of objective is not a reporting detail; it is a thumb on the scale, and the mechanism is easy to see.

| Objective | Which policy it structurally favours | Why it is riggable |
|---|---|---|
| **Total KCs mastered** (P(L) ≥ 0.95) | Any BKT-threshold policy — this is literally its objective. Favours hammering nearly-mastered KCs (cheapest marginal count) and abandoning hard ones | Ignores forgetting entirely; a KC "mastered" in week 2 and never revisited counts the same at exam time as one mastered yesterday |
| **Time-to-mastery** | Mastery-threshold policies again, by construction — they stop at threshold. **Most dangerous objective in our setting** | Rewards reaching mastery fast and then losing it. Also the objective most vulnerable to the items-vs-minutes confound |
| **Mastery retained at exam date T** | Retention/spacing policies (FSRS, θ-threshold, MEMORIZE) | Now the *scheduler* looks bad and the flashcard engine looks good. Note this is a different winner from row 1 with identical simulated learners |
| **Coverage of high-value content** | Blueprint-driven and variety-constrained policies — i.e., our Today's Path variety constraints | Says nothing about whether anything was learned |
| **Expected scaled score at date T** | Whichever policy best matches the exam blueprint's KC weighting *and* the exam date. **This is the learner's actual objective** | Hardest to rig; requires an explicit item→score model, which is itself a modelling commitment |
| **Retention-weighted mastery** | A reasonable proxy for the above without a scoring model | Weighting choice is a free parameter — pick it after seeing results and you have rigged it |

**The specific finding the prompt anticipates is real and worth stating flatly: a scheduler optimising short-run mastery and one optimising retention-at-exam-date are different systems, and ours is currently the former.** A 0.95 BKT threshold with a decay term, plus FSRS running independently on flashcards, plus success-rate targets on practice, is a system with no representation of the exam date anywhere in its objective. Nothing in it says "the exam is in 9 days, stop introducing new KCs and shift the budget to review." Khajah et al.'s exhaustive-search result gives the shape of what is being left on the table: optimal *timing* of a fixed review budget was worth up to **33%** over poorly-timed review of the same budget, and **+16.1%** over a merely mediocre schedule at a 4-week retention interval. **Tier A** on the magnitudes in simulation; **Tier B** on transfer to our content and horizon.

That is arguably the most valuable thing the testbed could produce, and note that it is a *self-consistency* finding: it holds under our own BKT+decay model. You do not need the simulator to be right about reality to discover that your objective is not the objective you actually want. **This is a legitimate use of the circular row.**

**Anti-rigging protocol.**

1. **Pre-register the primary objective before running any policy.** It should be expected scaled score at exam date T, because that is what the learner is buying.
2. **Report the full cube.** Every objective × every policy × every model row. Never a selected slice.
3. **Treat the primary objective as fixed and the others as diagnostics**, not as alternative headlines.
4. **Red flag, stated in advance: if our scheduler wins only on the objective it was built to maximise, we have measured nothing.** Write that sentence into the harness's README before the first run.
5. **Denominate everything in minutes.** "Per hour of study" is in the claim we are testing; it must be in the metric.

### 6. Simulating the comparators fairly

The standard failure is a strawman baseline, and in this literature it is the *dominant* failure. Doroudi et al. warn that concept-learning studies with "several baseline policies, including decent heuristic policies… set a higher bar," and this correlates with more honest (mixed) results. Conversely, note which policy won under the DKT row in REM Case Study 1: **Baseline 1, the plain non-adaptive spiral through the curriculum.** Non-adaptive baselines are much stronger than intuition suggests. **Tier A.**

#### "Anki-only" — make it concrete, and make it good

A faithful Anki-only comparator is not "flashcards with a naive scheduler." It should be:

- **Scheduler:** FSRS with default (population-trained) parameters — the *same* engine our product uses, so the contrast isolates *integration and content mix*, not scheduler quality. Also run an SM-2 row, since the FSRS/Anki benchmark shows SM-2 is a much stronger predictor than HLR. Running FSRS as the baseline is the honest choice; running SM-2 only would be a strawman.
- **Deck construction:** the *generous* version. Assume a competent pre-med has access to a mature, community-curated, comprehensive shared deck covering the content — because that is the actual competitive reality (this is exactly how MCAT and USMLE students study). Do **not** model deck-building cost or coverage gaps unless you also model our content-authoring cost. If you want a pessimistic variant, run it as a *second row*, not as the only row.
- **Daily cap:** a review cap plus a new-cards-per-day cap, both set at defaults typical of real use, with the *whole weekly time budget* available to flashcards. Sweep the new-cards/day rate specifically — Reddy et al.'s phase transition says outcomes are highly sensitive to it and non-monotone. A single cap value can accidentally place Anki-only on either side of a cliff.
- **Retention target:** sweep FSRS desired-retention across its plausible band. This directly trades review volume against per-item retention and is the main lever an informed user would tune.
- **What it structurally cannot do:** teach a lesson, build a reasoning skill, or practise CARS passage comprehension. That is the real basis of a differentiation claim, and it is a *content* argument, not a *scheduling* argument. Do not let the simulation launder it into one — if the simulated learner's flashcard practice and passage practice affect the same KC states with the same efficacy, the simulation has assumed away the entire distinction. **Make cross-activity-type transfer an explicit, swept parameter, and report the value at which the advantage disappears.** That number — "our scheduler wins only if lessons are more than X× as effective per minute as flashcards for the same KC" — is the single most honest output the testbed can produce, because it converts an unverifiable claim into a stated assumption.

#### "Practice-tests-only" — this is the strongest baseline, and the meta-analytic evidence says so

Adesope, Trevisan & Sundararajan (2017), *Review of Educational Research*: 118 articles, 272 independent effect sizes, 15,427 participants.

- Overall **g = 0.61** (fixed effects), **g = 0.70** (random effects), both p < .001. Heterogeneity Q(271) = 1405.00, p < .001, **I² = 81%**.
- vs restudying: **g = 0.51**. vs filler/no activity: **g = 0.93**.
- **Multiple-choice practice tests: g = 0.70.** Mixed formats: g = 0.80. MC significantly *higher* than short-answer.
- Transfer-appropriate processing: practice format identical to final test format **g = 0.63** vs dissimilar **g = 0.53**; mixed g = 0.75; between-levels Q_B(3) = 15.73, p < .001.
- **Feedback: no significant difference** between feedback and no-feedback conditions, though the feedback mean was slightly higher.

**Tier A, verified in full text.**

Sit with what those moderators mean for us. **The MCAT is a four-option multiple-choice exam.** So a "practice tests only" regime is 4-option MC retrieval practice, format-identical to the criterion test — landing on the *two* moderator levels with the largest measured effects (**g = 0.70** for MC practice, **g = 0.63** for format match). Practice-tests-only is not a naive baseline in this domain. It is close to the theoretical best simple strategy, and there is a large, well-powered meta-analysis saying so.

Concretely, the comparator should be:

- **Full-length or section-length AAMC-style tests at realistic intervals**, consuming realistic minutes, with **corrective feedback and answer review included** — because that is what serious test-takers do, and because the meta-analysis says feedback is not the deciding factor, so omitting it would be an unforced strawman with no evidential cover.
- **A "test-enhanced learning" variant** that also revisits missed items, and a **no-feedback variant** as a lower bound. Report both.
- **Do not** model it as "take a test, learn nothing from it." The g = 0.51-vs-restudy figure means the *testing itself* is the intervention. If our simulated learner does not gain from being tested, the baseline is rigged and the whole comparison is void.
- **Watch the items-vs-minutes trap here especially.** Practice tests are expensive in minutes and cheap in count. Under an item-denominated budget they look terrible; under a minute-denominated budget they are competitive. This single accounting choice can flip the headline.

One honest note on our own side: our `train`/`probe`/`repair` purposes *are* retrieval practice with feedback. Much of our system's expected benefit is the testing effect, which practice-tests-only also gets. **The differentiation claim is therefore about scheduling and selection on top of a mechanism both arms share** — which is precisely the regime with 0/8 in the IJAIED review. The comparison is between two doses of the same active ingredient, and the increment is expected to be small. Designing for a small increment from the start is more useful than being surprised by one.

### 7. Sensitivity, sweeps, and reporting

The team already runs assumption-grid sweeps for the diagnostic, so the machinery exists. What changes for a policy comparison:

**Sweep over model *families*, not just parameters.** This is the whole point. A 10,000-cell grid over BKT parameters is worth less than a 4×3 grid over model families × coarse parameter settings. Khajah et al.'s structure is the reference: **2 models × 105 parameterisations × 3 retention intervals × 3 onset delays = 1,890 cells**, each exhaustively solved. Note the shape: few models, *many* parameterisations, and — critically — **retention interval as a swept dimension**. Ours must sweep **weeks-until-exam**, since that is the horizon our objective depends on and the thing our scheduler currently ignores.

**Parameters that must vary (roughly in order of expected sensitivity):**

1. **Per-activity-type time cost** (minutes per lesson, per CARS passage, per discrete item, per flashcard) — this is the confound that plausibly killed REM Case Study 1.
2. **Forgetting half-life, per KC type** — 100× credible range; sweep on a log scale, and include a heterogeneous-half-life world since a single global value is indefensible.
3. **Whether forgetting rate depends on prior spacing** (BKT-decay: no; ACT-R/MCM: yes). The dimension the literature says decides scheduling quality.
4. **Cross-activity-type transfer efficacy** — the assumption that silently decides the Anki comparison.
5. **Weeks until exam** (e.g. 6, 12, 24) and **weekly budget** (e.g. 5, 15, 30 h/wk).
6. **Learner heterogeneity**: prior-knowledge distribution, learn rate, ability. Report the low-prior subgroup separately — 4 of 10 activity-type-sequencing studies found ATIs favouring low performers.
7. **Adherence**: budget compliance, session-length variance, missed days, and whether adherence *depends on the policy* (a scheduler that assigns disliked activities may lose engagement — the Duolingo −7.3% practice result is exactly this).
8. **P(G), P(S), P(T)** — sweep coarsely; second-order.
9. **Diagnostic estimation error** on the seeded priors (see below).

**Reporting rules:**

- **Report worst-case per row, not just the mean across rows.** Averaging over model families reintroduces exactly the false confidence REM exists to prevent — a policy can average well while losing badly in one plausible world. Khajah et al.'s standard is the one to hit: they reported that their recommended heuristic "performs well for the majority (60–80%) of scenarios," publishing the fraction of worlds where it fails.
- **Publish the full matrix, every cell, including the cells where we lose.** REM's diagnostic value came entirely from the one row (DKT) where the new policy lost.
- **Label the self-consistent row as an upper bound, in the table, every time.** Khajah et al.'s "best-case" framing, verbatim.
- **Pre-commit the win condition before the first run** (below).
- **State the win-rate as a fraction of cells, with the losing cells characterised.** "Wins in 78% of cells; loses when half-life < 14 days and flashcard-to-item transfer > 0.6" is a real result. "Wins on average" is not.
- **Report Monte Carlo error separately from sweep spread.** They are different uncertainties and conflating them makes the sweep look tighter than it is. Note in REM Case Study 1 the simulated SDs (0.78–2.22) were far tighter than the field SDs (1.80–3.27) — simulations systematically understate variance, which is exactly the failure mode that produces overconfident trial designs.

**An underrated, genuinely credible use of the sweep: the 140-item diagnostic against 422 KCs.** That is **0.33 items per KC**. Per-KC priors are therefore almost entirely borrowed from the foundational-concept level, not measured. So the scheduler's first weeks of decisions are driven by a prior with large, structured error. Quantifying how that error propagates — how long until the scheduler's KC ordering beats a fixed blueprint ordering, how much budget is wasted on wrongly-seeded KCs, whether `probe` (~55% target) recovers the information fast enough — is an **information-flow and identifiability question, not a learning question.** It is answerable in simulation with high credibility, because it depends on the *estimator*, not on the learning model being true. It is closely analogous to what the existing diagnostic harness already does well. **This is where I would spend the first week of simulation effort.** **Tier B** (my analysis; the framing follows the measurement-vs-learning distinction argued in §The circularity problem).

### 8. Beyond the brief

**8a. The strongest available claim is narrower, defensible, and probably better business.** The evidence supports: *"personalised, model-based review scheduling beats one-size-fits-all review at equal time cost"* — Lindsey et al., d = 0.88 vs generic spaced at a 28-day delay, plus 11/14 in the paired-associate cluster, plus Pavlik & Anderson d = 0.98–1.31. That is a strong, cited, defensible claim about our review/flashcard layer. It is *not* the claim that an integrated scheduler beats practice tests. Trading the unprovable claim for the provable one costs marketing copy and buys defensibility.

**8b. Adherence is probably a larger effect than scheduling, and it is the one thing simulation systematically hides.** Lindsey et al.'s intervention was ~30 min/week, ~10% of course time, and produced d ≈ 1.4 — because students actually did it, in class, proctored. Settles & Meeder's better model *reduced* practice engagement by 7.3%. Our scheduler's variety constraints and daily plan are plausibly adherence mechanisms more than learning-efficiency mechanisms. A simulated learner does exactly what it is told, forever, which means **the simulation is structurally blind to our most likely real advantage while being maximally exposed to our least likely one.** Model policy-dependent adherence explicitly, or accept that the harness is measuring the wrong axis. **Tier B.**

**8c. Simulate against our own diagnostic's noise, not against truth.** The scheduler consumes BKT priors seeded by a 140-item multistage test. If the simulation hands the scheduler well-calibrated priors, it is evaluating a system we do not ship. Feed the scheduler the *diagnostic's* estimates — the existing harness already generates exactly these — and give the comparators nothing. That is a fair fight and it exercises the real information asymmetry. Cheap, since both harnesses already exist.

**8d. Our `train` target of ~80% may be too low, and there is a specific model-derived reason to check.** Pavlik & Anderson's ACT-R optimisation computed **99.2% recall during learning** as optimal for their task, and that optimisation then won in the field with d ≈ 1.0–1.3. Their reading was that near-errorless learning minimises the time cost of failures. This does not straightforwardly transfer — paired-associate vocabulary is not MCAT reasoning, and the argument turns on failure *latency* costs — but the gap between 80% and 99.2% is large enough that the success-rate target belongs in the sweep as a first-class parameter rather than a fixed design constant. **Tier B/C on transferability; Tier A that the number is what they computed.**

**8e. Beware "originality" of the simulated comparison as a proxy for rigour.** A more elaborate simulator is not a more credible one. Käser & Alexandron's finding — nearly half of simulated-learner studies offer *no* validity evidence at all — is a warning that effort spent on simulator richness is routinely mistaken for effort spent on validity. Four crude, genuinely disagreeing models beat one elaborate one. Budget accordingly.

**8f. What I would spend the money on instead, ranked.** (1) A small paid pilot (n ≈ 30–60) with the within-subject item-level randomisation of Lindsey et al., which yields real causal data on the review layer in weeks. (2) The queue/overload analysis from Reddy et al. — cheap, credible, and it protects against a genuine product failure. (3) The diagnostic-prior-propagation analysis. (4) The REM comparison, scoped explicitly to worst-case bounding and trial sizing. Note that (1) is not a simulation, and it is first.

---

## Proposed testbed design

### Generative models (REM rows) — minimum four, deliberately disagreeing

| Row | Model | Why it is in the matrix | Label |
|---|---|---|---|
| **M1** | **BKT + exponential decay per KC** (our planner's model) | Self-consistent row. **Report as UPPER BOUND ONLY, labelled in every table.** | Circular — ceiling |
| **M2** | **DASH-style windowed logistic**: `logistic[αₛ − δᵢ + Σ_w φ_w log(1+c) − ψ_w log(1+n)]`, windows `{1/24, 1, 7, 30, ∞}` days | No discrete mastery state; log-diminishing returns; different functional form. Field-validated (Lindsey et al.) | Different family |
| **M3** | **ACT-R / MCM-style power-law memory**, where decay rate depends on prior spacing | **The most important row.** Disagrees with M1 precisely where the literature says scheduling quality is decided | Different family; adversarial to our decay term |
| **M4** | **Slow-drift IRT** — ability rises gently with total time on task, near-indifferent to sequencing | The sceptic's world. If our scheduler's advantage vanishes here, we learn how much of it is sequencing vs. dose. Note the REM caveat: a model that cannot differentiate policies at all contributes nothing, so M4 must retain *some* sequencing sensitivity (e.g. via forgetting) | Null-ish |
| **M5** *(optional)* | **M2 or M3 + latent prerequisite structure the planner does not know** | Tests robustness to a wrong KC graph — Clement et al.'s (EDM 2016) variant of this question | Structural mismatch |
| **M6** *(optional)* | **DKT trained on M2/M3 output** | The row that reversed the ranking in REM Case Study 1. Only worth it if cheap | Flexible/opaque |

Cross-cutting each row (per REM's Table 3 pattern): **a policy-dependent time/throughput model** and **learner sub-populations** (low / medium / high prior knowledge).

### Parameter ranges, with sources

| Parameter | Range | Source | Tier |
|---|---|---|---|
| P(G), 4-option MC | 0.22 – 0.40 | Baker/Corbett/Aleven 2008 convention (0–0.3), widened to respect 0.25 chance floor | A (convention) / B (widening) |
| P(S) | 0.05 – 0.15 | Same, 0.1 conventional | A / B |
| P(T) per opportunity | 0.05 – 0.20 | Classic BKT default 0.1; Yudelson et al. individualise it | B |
| P(L₀) | Sweep as a **distribution**, not a point | Diagnostic-seeded; identifiability makes a point value indefensible (Beck & Chang 2007) | A |
| Half-life, volatile KCs (facts, structures) | 3 – 30 days | Bracketed by flashcard-scale literature | B |
| Half-life, consolidated KCs (concepts, reasoning) | 90 – 700 days | 104 d derived from Lindsey et al.'s 15.7–18.1%/28 d; 590–710 d derived from Custers' 25–35%/yr for basic science (secondary citation; conversions mine) | B |
| Spacing-dependence of decay | On (M3) / Off (M1) | Khajah et al. 2013: this is the decisive dimension | A |
| θ-threshold for review priority | 0.30 – 0.45 | Khajah et al.: ≈0.4 (CogSci 2013) / .33 (as cited in Lindsey et al. 2014) — versions disagree | B |
| Time per activity type | Lesson / passage / item / card — sweep each ±50% | Doroudi et al.'s throughput confound | A (that it matters) / C (our values) |
| Cross-activity transfer efficacy | 0.0 – 1.0, reported as a break-even | No source; it is an assumption. **Report the break-even value, do not pick one** | — |
| Weeks to exam | 6 / 12 / 24 | Product reality; Khajah et al. swept RI = 1/4/26 wk | A (as a required dimension) |
| Weekly budget | 5 / 15 / 30 h | Product reality | — |
| New-items-per-day | Sweep wide, log scale | Reddy et al. phase transition is sharp and non-monotone | A |
| Within-sim predictability sanity check | AUC 0.70 – 0.85 | Yudelson et al.; Khajah et al. 2016 | A (numbers) / B (as target) |

### Policies (REM columns)

1. **Today's Path, as built** (BKT + FSRS + train/probe/repair + variety + budget).
2. **Today's Path, retention-objective variant** — same machinery, objective changed to expected retained mastery at date T. *Include this: it is how we discover whether our objective is the problem.*
3. **Anki-only / FSRS**, mature comprehensive deck, realistic caps, full budget. Sweep desired-retention.
4. **Anki-only / SM-2** — since SM-2 beats HLR on Anki data, a strong-baseline check.
5. **Practice-tests-only, with feedback and answer review** (test-enhanced learning). Realistic minutes.
6. **Practice-tests-only, no feedback** — lower bound.
7. **Non-adaptive blueprint spiral** — fixed, sensible order through the 10 foundational concepts, no adaptivity, no mastery model. **This is the baseline that won under the DKT row in REM Case Study 1. Treat it as the one to beat, not as a formality.**
8. **BKT mastery-threshold only** — no variety, no FSRS, no purposes. Isolates the marginal value of everything we added on top of textbook cognitive mastery learning.
9. **Random-within-budget** — sanity floor. If anything loses to this, there is a bug.

Comparators 7 and 8 are the ones that matter. They are cheap, they are strong, and they are what a reviewer would demand.

### Objectives

**Primary, pre-registered: expected scaled score at exam date T**, with an explicit blueprint-weighted item→score model. **Secondary, always reported for every cell:** retained mastery at T; total KCs above threshold at T; time-to-first-mastery; blueprint coverage; retention-weighted mastery. All denominated **per simulated hour**.

### Sweep structure

Cells = **policies (9) × models (4–6) × {half-life regime (3) × spacing-dependence (2) × transfer (5) × weeks-to-exam (3) × budget (3) × time-cost perturbation (3)}** × learner sub-populations (3), with ≥1,000 simulated learners per cell and Monte Carlo error reported separately from sweep spread. Coarse first, refine only where the ranking flips — the flip boundaries *are* the result.

### What counts as a win — pre-commit this before running anything

Our scheduler may be said to win **only if all four hold:**

1. **Sign consistency:** it is at least as good as every comparator on the primary objective in **every** model row — including M3 (spacing-dependent decay) and M4 (sceptical) — and strictly better in a majority.
2. **Margin exceeds noise:** the advantage over the *strongest* comparator (expect #7 or #5) exceeds the within-row spread induced by the parameter sweep, not merely the Monte Carlo error.
3. **Not objective-dependent:** it wins on the pre-registered primary objective, and does not *lose* on retained-mastery-at-T. Winning only on KCs-above-threshold is a **fail**.
4. **Not accounting-dependent:** the advantage survives ±50% perturbation of every per-activity time cost and survives switching the budget denominator between minutes and items.

**And even a clean win means only this:** "under every learner model we could construct and defend, the scheduler is no worse than the alternatives and usually better, by margin M." It does **not** license "produces better outcomes per hour of study." Given a documented case of simulated d ≈ 4 → field d ≈ 0, and 0/8 field wins in our architectural cluster, the difference between those two sentences is the difference between a defensible internal decision and a claim that will not survive its first real trial.

**Anticipate the likely outcome and pre-decide how to respond.** Given a 100× credible range on half-life and a free transfer-efficacy parameter, the most probable result is **failure of condition 2** — the sweep spread swamps the between-policy gap. That is not a failed project. It is a finding: it converts "we believe our scheduler is better" into "our scheduler's advantage depends on assumptions X and Y, whose values we do not know, and here is the trial that would measure them." Write that acceptance into the plan up front so the result does not get quietly re-cut until something wins.

---

## What simulation cannot tell you

Explicit boundary. These are not "hard"; they are out of scope for the method.

1. **Whether the integrated scheduler beats practice-tests-only or Anki-only for real learners.** Model-class uncertainty alone reverses rankings among models with matched predictive accuracy (RMSE 0.41–0.44), and more data cannot fix it (Mandel et al.). **Tier A.**
2. **Whether it beats competitor adaptive products.** Their policies, content, and difficulty parameters are unavailable. There is nothing to simulate. Not a limitation of the method — an absence of input. **Tier A.**
3. **Any effect magnitude.** In the one case with both numbers, simulated d ≈ 4 → field d ≈ 0. In the best positive case (Pavlik & Anderson), absolute recall was off by 10–16 percentage points and **the ordering of the two comparators was reversed** even though the winner was correct. **Tier A.**
4. **Anything about engagement, adherence, or dropout** — the mechanisms most likely to be our real advantage, and the ones a compliant simulated learner cannot exhibit. Duolingo's better model *reduced* practice engagement 7.3%. **Tier A.**
5. **Anything about learning we did not put in the model.** Motivation, anxiety under a high-stakes exam, metacognitive miscalibration, illusions of competence from recognition-based flashcard success, comprehension of CARS passages as distinct from KC mastery, the specific value of *worked* explanations. None of these are in BKT, DASH, ACT-R, MCM, or FSRS. Käser & Alexandron: simulated learner models "tend to represent only narrow aspects of student learning." **Tier A.**
6. **Whether our 0.95 mastery threshold, ~80% `train` target, ~55% `probe` target, or ~85% `repair` target are right.** These are relationships between a target and real learning, and the simulation will simply return whatever the assumed model implies. Note the two independent published prescriptions differ from ours and from each other (θ ≈ 0.33–0.40 for *review* priority; 99.2% success for *within-learning* practice under ACT-R). Sweep them; do not "validate" them.
7. **Absolute score predictions.** Never quote a simulated MCAT score. The simulator has no calibration to the scale, and the diagnostic's own IRT calibration does not extend to predicting post-instruction performance.
8. **A ranking of the comparators among themselves.** Pavlik & Anderson got the winner right and the baseline order backwards. If a decision depends on whether Anki-only or practice-tests-only is second, simulation will not settle it.

**What it *is* for, restated compactly:** finding bugs and pathologies (starvation, oscillation, budget overrun, queue blow-up past Reddy et al.'s cliff); bounding worst cases; discovering objective misspecification — including, and especially, from the circular row; sizing and designing a real trial; and quantifying how diagnostic prior error propagates through the planner, which is a measurement question the existing harness is already good at.

---

## DOK 1 — established facts

1. Evaluating an instructional policy under the same student model that generated it is called **direct model-based evaluation**; the failure it invites is **model mismatch**; the accepted mitigation is the **Robust Evaluation Matrix** (Doroudi, Aleven & Brunskill, L@S 2017). **A**
2. **REM Case Study 1:** predicted Cohen's d = 3.66 (AP-2 vs Baseline 2) and 4.14 (vs Baseline 1); actual experiment found **no significant difference** among five policies, with AP-2 numerically last (4.93 ± 1.80 vs Baseline 1's 5.52 ± 2.61 out of 16). **A**
3. Three student models (G-SCOPE, BKT, DKT) with cross-validated **RMSE 0.41–0.44** produced fully reversed policy rankings; under DKT the **non-adaptive** Baseline 1 ranked best (9.89 ± 1.45). **A**
4. Even with **infinite data**, the optimal policy of an incorrect model can appear better than the true MDP's optimal policy, because the incorrect model need not be Markov (Mandel et al. 2014). Scale does not solve mismatch. **A**
5. **BKT is not identifiable:** an infinite family of parameter estimates make identical predictions while implying different latent knowledge (Beck & Chang, UM 2007). Dirichlet priors improved AUC 0.614 ± 0.002 → 0.620 ± 0.002. **A**
6. Individualising BKT's learn rate improved RMSE 0.36273 → 0.36116 and accuracy 0.82755 → 0.82896 (KDD Cup Algebra I); analogous small gains on Bridge to Algebra (Yudelson et al., AIED 2013). **A**
7. BKT extended with forgetting, latent abilities, and skill induction **matches DKT**: Statics 0.75 vs 0.76 AUC; Spanish 0.846 vs 0.836; Synthetic 0.80 vs 0.75. 31.6% of the originally reported gap was a biased AUC procedure; a further 50.6% vanished on adding forgetting (Khajah, Lindsey & Mozer, EDM 2016 best paper). **A**
8. **Lindsey et al. 2014** (n = 179, semester-long, 597,990 trials, time-matched, within-subject item-level randomisation): personalised spaced review beat massed by **+12.4% (d = 1.38)** at semester end and **+16.5% (d = 1.42)** 28 days later; beat generic spaced by **+8.3% (d = 1.05)** and **+10.0% (d = 0.88)**. 28-day forgetting: 18.1% / 17.1% / 15.7%. Dose ≈ 30 min/week ≈ 10% of course time. **A**
9. The policy Lindsey et al. deployed was selected by **simulation under ACT-R and MCM** (Khajah et al.), while the deployed predictor was **DASH** — a third model family. Cross-family validation then succeeded in the field. **A**
10. **Khajah et al. (CogSci 2013 / TopiCS 2014):** 2 models × 105 parameterisations × 3 RIs (1/4/26 wk) × 3 onset delays = 1,890 exhaustively-solved combinations. Well-timed review beat poorly-timed review of the same budget by **up to 33%**; good vs poor schedule **+16.1%**, vs no review **+89.7%** at RI = 4 wk. θ-threshold near-optimal under both models at **θ ≈ 0.33–0.40** (versions differ). The 2-back heuristic worked in **60–80%** of scenarios. Authors explicitly call the self-consistent evaluation a **"best-case."** **A**
11. **Pavlik & Anderson 2008:** ACT-R-optimised schedule beat a flashcard control **d = 0.978** (correctness) / **1.31** (latency) and Atkinson **d = 0.796** / **1.17**; trials-to-criterion d = 2.21 vs flashcard. Pre-simulated recall 56/31/24% vs actual **66/35/40%** — winner correct, **baseline ordering reversed**, levels underestimated by 10–16 points. Model-optimal within-learning recall was **99.2%**. **A**
12. **Settles & Meeder 2016:** HLR cut MAE ≥45% vs Leitner on 12.9M instances, but **Leitner had the highest AUC**. Field Experiment I (HLR vs Leitner, ~1M users, 6 wk): any activity +0.3%, lessons +0.3%, **practice −7.3% (p<0.001)**. Experiment II (HLR-lex vs HLR, 3.3M users, 2 wk): +12.0% / +1.7% / +9.5%. **The famous "12%" is HLR-lex vs HLR, not HLR vs Leitner. All outcomes are engagement, none are learning.** **A**
13. On the community FSRS/Anki benchmark (72 users, 6,240,084 reviews), **HLR performs worse than SM-2** (log loss 0.7951 vs 0.7317; 2.5175 vs 0.8847 on a second split); FSRS v4 leads (0.3874 / RMSE(bins) 0.0459). **B/C — not peer reviewed.**
14. **Tabibian et al. 2019 (PNAS)** is a **natural experiment**, not an intervention; groups are assigned by likelihood under the tested model family, and the outcome metric is defined by that model's forgetting form; data span 2 weeks; 322 learners in the correlation analysis; no effect size in interpretable units in the main text. **A** on the design facts; **C** for "transfers to real learners."
15. **Reddy et al. 2016:** predicted a **sharp phase transition** — learning rate → 0 above a critical new-item arrival rate — and confirmed it in humans (**n = 331, 446 items, 77,034 logs, 15-min sessions, recall 0.663**). Exponential-forgetting-with-delay models performed only **comparably to 1PL-IRT**, not better. Their optimised *policy* was never field-tested. **A**
16. **Doroudi, Aleven & Brunskill 2019 (IJAIED), Table 2** — Sig / ATI / Mixed / Not-sig / Sig-worse: paired-associate **11/0/0/2/1** (n=14); concept learning 4/0/2/1/0 (n=7); **sequencing interdependent content 0/0/2/6/0 (n=8)**; sequencing activity types 4/4/0/2/0 (n=10); not-optimising-learning 2/0/0/0/0. Significant studies "often found a Cohen's d of at least 0.8." **A** *(the text says 36 studies met inclusion; Table 2 sums to 41 — unresolved discrepancy in the paper.)*
17. The same review counted **19 papers** learning policies offline without any real-learner evaluation and **≥23 papers** using only simulated data — comparable in volume to the entire tested literature. **A**
18. **Importance sampling is infeasible for sequencing:** 20 binary decisions requires ~2²⁰ ≈ 1M matched learners; 50 decisions requires >10¹⁵. **A**
19. **Adesope et al. 2017** (118 articles, 272 effects, N = 15,427): practice testing **g = 0.61** fixed / **0.70** random; vs restudy **g = 0.51**; vs filler **g = 0.93**; **multiple-choice practice g = 0.70** (significantly above short-answer); format-matched **g = 0.63** vs mismatched 0.53; **no significant feedback moderator**; I² = 81%. **A**
20. **Baker, Corbett & Aleven 2008:** the standard convention bounds BKT guess to **[0, 0.3]** and slip to **[0, 0.1]**, "based on the most common number of candidate actions." **A**
21. **DASH** form: `logistic[αₛ − δᵢ + Σ_w φ_w log(1+c_siw) − ψ_w log(1+n_siw)]`, add-one smoothed, five windows **s = {1/24, 1, 7, 30, ∞} days**. **A**
22. **Käser & Alexandron 2024 (IJAIED):** simulated learner models "tend to represent only narrow aspects of student learning," and **almost half** of studies using simulated learners provide **no** validity evidence. **A — abstract only.**
23. Medical students forget **25–35% of basic science knowledge in 1 year**, >50% by year 2, 80–85% at 25 years. **B — secondary citation** (Custers 2010; Custers & ten Cate 2011, as quoted in Lindsey et al. 2014).

## DOK 2 — insights and implications

1. **The circularity problem is not our binding constraint; the field record for our architectural class is.** Sequencing interdependent curriculum content has **0 clean wins in 8 controlled experiments.** Even a perfectly-designed REM cannot make our scheduler more likely to work; it can only make us less likely to be surprised. The prior on the effectiveness claim should be low before any simulation is run.
2. **Our system is two systems with opposite evidentiary prospects, and we should stop evaluating them as one.** The flashcard/review layer sits in the 11/14 cluster and is cheaply provable by within-subject item-level randomisation. The integrated path scheduler sits in the 0/8 cluster and requires a large between-subjects trial. Splitting the claim is the single highest-leverage decision available. It also matches where the value actually is: FSRS is off the shelf, so the provable part is not the differentiated part — an uncomfortable fact worth confronting now rather than after a trial.
3. **The item-vs-minute accounting choice can determine the winner, and it is invisible unless you look for it.** Doroudi et al.'s post-mortem found their winning baseline simply did 48 problems to the others' ≤28. Our activity types differ in cost by an order of magnitude and the budget is declared in *time*. "Per hour of study" is in the claim; it must be in the denominator, and it must be swept.
4. **The most valuable simulation finding available is probably that our objective is wrong.** Nothing in a 0.95 BKT threshold, an independent FSRS queue, or success-rate targets represents the exam date. Khajah et al. put up to 33% on the table for *timing alone* at fixed budget. A scheduler that ramps review toward T and stops introducing new KCs is a materially different system. And this finding is available from the *circular* row — you don't need the simulator to be right to learn your objective isn't the one you want.
5. **Model-family disagreement dominates parameter uncertainty, which inverts the usual instinct.** Three models with RMSE inside a 0.03 band reversed the ranking. Do not spend the budget refining P(T); spend it writing down a genuinely different fourth model. Four crude disagreeing models beat one elaborate one — and Käser & Alexandron's finding suggests the field routinely mistakes simulator richness for validity.
6. **The row that matters most is spacing-dependent decay.** BKT+decay says forgetting rate is a per-KC constant. ACT-R and MCM say it depends on the schedule — and Khajah et al. state that this dependence is "central to the difference in performance across review schedules." Our scheduler is tuned against a model that is silent in the one dimension the literature says decides scheduling quality. **M3 is not optional.**
7. **The diagnostic harness's credibility does not transfer.** Simulating a measurement procedure with fixed ability under well-validated IRT assumptions is a fundamentally safer epistemic act than simulating multi-week causal learning. Reusing the code is fine; reusing the confidence is not.
8. **Structural predictions transfer; ranking predictions do not.** Reddy et al.'s phase transition replicated in humans because a throughput cliff follows from almost any forgetting model plus a bounded budget. Pavlik & Anderson's *winner* transferred but the *ordering of comparators* did not. Design the simulation to produce structural claims ("we are past the overload cliff at X new items/day"), and treat every ranking claim as provisional.
9. **The comparators are stronger than they look, and the meta-analysis says so in our exact format.** MC practice testing gives g = 0.70, format-matched practice g = 0.63, and feedback is not the deciding moderator — so a well-built practice-tests-only arm is near the theoretical best simple strategy for a four-option exam. A mature shared Anki deck is what serious MCAT students actually use. Any simulation in which these lose badly has a bug or a rigged assumption.
10. **Our differentiation is a content claim wearing a scheduling costume.** Lessons and CARS passages do things flashcards cannot. But if simulated flashcard practice and simulated passage practice update the same KC state with the same per-minute efficacy, the simulation has assumed the distinction away; and if we set transfer efficacy by hand, we have assumed the answer. The only honest output is the **break-even**: "our scheduler wins only if lessons are more than X× as effective per minute as flashcards for the same KC." That converts an unverifiable claim into a stated, falsifiable assumption — which is the most a simulation can do here, and is genuinely worth having.
11. **A simulation is systematically overconfident about variance, which corrupts trial design.** In REM Case Study 1 simulated SDs were 0.78–2.22 against field SDs of 1.80–3.27. If we size a trial off simulated variance we will underpower it, run it, get a null, and not know whether the null is real. Inflate variance deliberately when powering.
12. **Adherence is where our real edge probably lives, and it is exactly what the method cannot see.** Lindsey et al. got d ≈ 1.4 from 30 min/week that students actually did. Duolingo's *better* model reduced practice 7.3%. A compliant simulated learner is blind to our most plausible advantage and fully exposed to our least plausible one. Model policy-dependent adherence or accept the blind spot explicitly.
13. **Pre-commit the win condition, and pre-commit the acceptance of the likely null.** Given a 100× half-life range and a free transfer parameter, the probable outcome is that sweep spread swamps the policy gap. The value of writing the win condition down first is that it stops the analysis being re-cut until something wins — which, in a small team under commercial pressure, is the default failure mode and is far more likely to damage us than any technical error in the harness.
14. **Borrowed model rankings travel worse than borrowed parameters.** HLR beat Leitner on Duolingo and loses to SM-2 on Anki. Any parameter or model choice imported from a published fit should carry its dataset and regime as an explicit annotation, and should be swept rather than adopted. Reddy et al.'s θ = 0.0077 — a ~90-second half-life in its native units — is the cautionary example of how a borrowed constant becomes a silent unit error.

---

## What I could not verify

- **Effect magnitudes in Tabibian et al. (2019).** The main text (read via PMC) reports only Mann–Whitney significance on box plots of empirical forgetting rate. **I did not read the SI Appendix**, where the memory-model comparisons, synthetic validation, and selection-bias checks live. No interpretable effect size obtained.
- **Khajah, Lindsey & Mozer, *Topics in Cognitive Science* 2014 full text.** I read the **CogSci 2013 version in full** (eScholarship) and the TopiCS abstract. The θ discrepancy (**≈0.4** in CogSci 2013 vs **.33** as cited by Lindsey et al. 2014) is unresolved; it may be a revision between versions. Report as θ ≈ 0.33–0.40.
- **Käser & Alexandron (2024).** **Abstract only.** The "almost half provide no validity evidence" figure is from the abstract; I did not see the coding scheme, the denominator, or how "validity evidence" was operationalised.
- **Rowe et al. (2014) / Rowe & Lester (2015)** — the 25.4-vs-3.6 simulated figures and the subsequent null are **as reported in Doroudi et al. (2017)**. Originals not read.
- **Rafferty et al. (2015/2016), *Cognitive Science*** — the max-information-gain negative result and the three-model structure are **as reported in the REM paper and IJAIED review**. Original not read. I could not verify the effect sizes or the exact number of participants.
- **Mettler, Massey & Kellman (2011), ARTS** — the only "significantly worse" cell in the IJAIED review. Known **only** through that review's table and footnote. I did not read the paper and cannot report its effect size.
- **Custers (2010) and Custers & ten Cate (2011)** — the 25–35%/year basic-science forgetting figures are **secondary**, quoted from Lindsey et al. (2014). The conversion to ~590–710 day half-lives is **my arithmetic**, assuming single-exponential decay, which is likely wrong in form (the literature favours power-law), so treat as an order-of-magnitude anchor only. The same caveat applies to my 104-day derivation from Lindsey et al.'s 28-day figures.
- **Corbett & Anderson (1994/1995) originals.** Not read in this session. The 0.95 mastery-threshold convention and the four-parameter BKT specification are reported from secondary sources (Baker et al. 2008; van de Sande's *Properties of BKT*; Beck & Chang 2007). Tier B rather than A on the 0.95 provenance specifically.
- **PFA and AFM originals** (Pavlik, Cen & Koedinger 2009; Cen, Koedinger & Junker 2006). Not read. The additive-factors functional form is taken from the appendix of Lindsey et al. (2014), which I did read in full.
- **MCM original** (Mozer et al., NeurIPS 2009). Not read. Its structure — one exponentially-decaying trace per study event, weighted-averaged to approximate a power law — is from Settles & Meeder's related-work section and Khajah et al.
- **DASH+ and later Mozer/Lindsey extensions.** The prompt asked about DASH+. **I found no source for it in this review and can report nothing about it.** Do not assume the DASH findings extend to it.
- **No FSRS learning-outcome RCT found.** I could not locate any peer-reviewed randomised trial showing FSRS produces better *learning or retention outcomes* than SM-2 — only prediction-accuracy benchmarks. The "20–30% fewer reviews for the same retention" figure is from RemNote's help documentation: **vendor claim, Tier C, no methodology available.** The FSRS benchmark itself is a community repository, not peer reviewed.
- **No study found that tested an integrated multi-activity-type scheduler under a learner-declared time budget against single-modality baselines, in simulation or the field.** Based on the IJAIED review's cluster taxonomy I believe this gap is real, but absence of evidence from one review plus targeted searching is not proof of absence. **Tier B.**
- **No MCAT-specific or high-stakes-admissions-test-specific adaptive-scheduling literature searched.** Out of the time I allotted. If such work exists (AAMC research reports, USMLE/Step 1 prep studies, Anki-in-medical-education outcome studies) it would be directly relevant and should be a follow-up. The medical-education retention literature (Custers) suggests this vein exists.
- **Interleaving and desirable-difficulty effect sizes** — relevant to the variety constraints in Today's Path, but **not searched**. I deliberately did not quote numbers I had not verified.
- **The arXiv preprint "Evaluating Adaptive Personalization of Educational Readings with Simulated Learners"** appeared in search and is thematically close (BKT + Kintsch CI-theory simulated readers, and the "competence paradox" of LLM-based simulated learners). **I read only search-result excerpts, not the paper.** Nothing in this document depends on it. **Not peer reviewed.**
- **Beck & Chang's AUC figures** (0.620 vs 0.614) are from the abstract text returned in search; I did not read their results section.

---

## Sources

Ranked by decision-relevance to this question.

1. **Doroudi, S., Aleven, V., & Brunskill, E. (2017). Robust Evaluation Matrix: Towards a More Principled Offline Exploration of Instructional Policies.** *Proc. 4th ACM Conf. Learning@Scale (L@S 2017)*, 3–12. DOI [10.1145/3051457.3051463](https://doi.org/10.1145/3051457.3051463) · [ERIC full text](https://files.eric.ed.gov/fulltext/ED577159.pdf)
   **Tier A. Read in full.** The single most important source. Names the problem, gives the method, and supplies the one fully-reported simulated-vs-field comparison (predicted d = 3.66–4.14 → null) plus the RMSE 0.41–0.44 ranking-reversal matrix and the trajectory-length confound. If the team reads one paper, this is it.

2. **Doroudi, S., Aleven, V., & Brunskill, E. (2019). Where's the Reward? A Review of Reinforcement Learning for Instructional Sequencing.** *Int. J. Artificial Intelligence in Education*, 29(4), 568–620. DOI [10.1007/s40593-019-00187-x](https://doi.org/10.1007/s40593-019-00187-x) · [author version](https://bpb-us-e2.wpmucdn.com/faculty.sites.uci.edu/dist/f/847/files/2019/11/IJAIED-RL-Review-Author-Version.pdf)
   **Tier A. Read substantial portions of full text** (review sections, Table 2, cluster narratives, robust-evaluation section, appendix on policy types). Supplies the decisive asymmetry: 0/8 for interdependent-content sequencing vs 11/14 for paired-associate. Also the importance-sampling infeasibility arithmetic and the count of never-field-tested simulation papers.

3. **Lindsey, R. V., Shroyer, J. D., Pashler, H., & Mozer, M. C. (2014). Improving Students' Long-Term Knowledge Retention Through Personalized Review.** *Psychological Science*, 25(3), 639–647. DOI [10.1177/0956797613504302](https://doi.org/10.1177/0956797613504302) · [PDF](https://laplab.ucsd.edu/articles/LindseyShroyerPashlerMozer2014.pdf)
   **Tier A. Read in full, including appendix.** The best positive simulation→field transfer case, the DASH specification, and — most usefully — the within-subject item-level time-matched randomisation design we should copy immediately.

4. **Khajah, M. M., Lindsey, R. V., & Mozer, M. C. (2014). Maximizing Students' Retention via Spaced Review: Practical Guidance From Computational Models of Memory.** *Topics in Cognitive Science*, 6(1), 157–169. DOI [10.1111/tops.12077](https://doi.org/10.1111/tops.12077) · CogSci 2013 version: [eScholarship](https://escholarship.org/content/qt94s06773/qt94s06773_noSplash_b4f19da9832be1b7f862b7e2d4277d4f.pdf)
   **Tier A. CogSci 2013 version read in full; TopiCS 2014 abstract only.** The sweep-structure template (1,890 cells across two model families), the 33% / 16.1% / 89.7% timing magnitudes, θ ≈ 0.33–0.40, the 60–80% worst-case reporting, and the explicit "best-case" circularity disclosure that we should adopt as house style.

5. **Adesope, O. O., Trevisan, D. A., & Sundararajan, N. (2017). Rethinking the Use of Tests: A Meta-Analysis of Practice Testing.** *Review of Educational Research*, 87(3), 659–701. DOI [10.3102/0034654316689306](https://doi.org/10.3102/0034654316689306) · [PDF](https://gwern.net/doc/psychology/spaced-repetition/2017-adesope.pdf)
   **Tier A. Read substantial portions of full text** (results and moderator sections). Establishes that a practice-tests-only comparator in a four-option MC domain is a strong baseline, not a strawman: g = 0.61/0.70 overall, g = 0.70 for MC practice, g = 0.63 format-matched, no significant feedback moderator.

6. **Settles, B., & Meeder, B. (2016). A Trainable Spaced Repetition Model for Language Learning.** *Proc. ACL 2016*, 1848–1858. DOI [10.18653/v1/P16-1174](https://doi.org/10.18653/v1/P16-1174) · [PDF](https://aclanthology.org/P16-1174.pdf)
   **Tier A. Read in full.** Matters mainly as a corrective: the "+12%" is HLR-lex vs HLR, the HLR-vs-Leitner test lost 7.3% on practice sessions, Leitner had the best AUC, and every outcome is engagement rather than learning. Also documents a real production overfitting failure.

7. **Pavlik, P. I., & Anderson, J. R. (2008). Using a Model to Compute the Optimal Schedule of Practice.** *Journal of Experimental Psychology: Applied*, 14(2), 101–117. DOI [10.1037/1076-898X.14.2.101](https://doi.org/10.1037/1076-898X.14.2.101) · [PDF](http://act-r.psy.cmu.edu/wordpress/wp-content/uploads/2012/12/791xap-14-2-101.pdf)
   **Tier A. Read relevant sections of full text.** The best-case transfer story *and* its instructive failure: winner correct (d ≈ 0.98–1.31), baseline ordering reversed, absolute levels off by 10–16 points. Also the 99.2% model-optimal within-learning recall figure that questions our 80% `train` target.

8. **Reddy, S., Labutov, I., Banerjee, S., & Joachims, T. (2016). Unbounded Human Learning: Optimal Scheduling for Spaced Repetition.** *Proc. KDD 2016*. [arXiv:1602.07032](https://arxiv.org/abs/1602.07032) · [PDF](https://siddharth.io/files/leitnerq.pdf)
   **Tier A for the phase transition. Read most of full text.** Peer-reviewed at KDD; arXiv version consulted. The most directly actionable result for us — a structural overload prediction that replicated in humans (n = 331) — and a warning that exponential-forgetting models only matched 1PL-IRT. Their optimised policy was never field-tested.

9. **Khajah, M., Lindsey, R. V., & Mozer, M. C. (2016). How Deep is Knowledge Tracing?** *Proc. EDM 2016*, 94–101 (**best paper**, 109 submissions). [EDM PDF](https://www.educationaldatamining.org/EDM2016/proceedings/paper_144.pdf) · [arXiv:1604.02416](https://arxiv.org/pdf/1604.02416)
   **Tier A. Read results and discussion in full.** Establishes that BKT+forgetting+abilities+skill-induction matches DKT (AUCs within 0.01–0.05), that much of DKT's reported advantage was an evaluation artefact, and — for REM row design — that fit similarity does not imply policy similarity.

10. **Beck, J. E., & Chang, K.-M. (2007). Identifiability: A Fundamental Problem of Student Modeling.** *User Modeling 2007*, LNAI 4511, 137–146. [PDF](https://www.cs.cmu.edu/~kkchang/paper/BeckChang.2007.UserModeling.IdentifiabilityStudentModel.pdf)
   **Tier A. Read abstract and introduction; not the results section.** The formal reason no amount of our own future data will pin down the latent state the scheduler acts on. AUC 0.614 → 0.620 with Dirichlet priors.

11. **Baker, R. S. J. d., Corbett, A. T., & Aleven, V. (2008). More Accurate Student Modeling Through Contextual Estimation of Slip and Guess Probabilities in Bayesian Knowledge Tracing.** *ITS 2008*. [PDF](https://www.cs.cmu.edu/~rsbaker/BCA2008V.pdf)
   **Tier A. Read the methods section.** Source of the only directly citable BKT parameter bounds we can legitimately borrow: guess ∈ [0, 0.3], slip ∈ [0, 0.1].

12. **Yudelson, M. V., Koedinger, K. R., & Gordon, G. J. (2013). Individualized Bayesian Knowledge Tracing Models.** *AIED 2013*, LNCS 7926, 171–180. DOI [10.1007/978-3-642-39112-5_18](https://doi.org/10.1007/978-3-642-39112-5_18) · [PDF](https://www.cs.cmu.edu/~ggordon/yudelson-koedinger-gordon-individualized-bayesian-knowledge-tracing.pdf)
   **Tier A. Read results tables in full.** Concrete BKT fit statistics on large public datasets (RMSE 0.341–0.363, accuracy 0.823–0.850) usable as a realism check, and a clean demonstration that meaningful model improvements are numerically tiny.

13. **Tabibian, B., Upadhyay, U., De, A., Zarezade, A., Schölkopf, B., & Gomez-Rodriguez, M. (2019). Enhancing Human Learning via Spaced Repetition Optimization.** *PNAS*, 116(10), 3988–3993. DOI [10.1073/pnas.1815156116](https://doi.org/10.1073/pnas.1815156116) · [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6410796/)
   **Tier C for policy transfer; Tier A for the theory. Main text read via PMC; SI Appendix not read.** Included partly as a caution: a high-prestige venue, a natural experiment rather than an intervention, model-defined group assignment and model-defined outcome metric, a 2-week window, and no interpretable effect size in the main text.

14. **Rollinson, J., & Brunskill, E. (2015). From Predictive Models to Instructional Policies.** *Proc. EDM 2015*. [ERIC PDF](https://files.eric.ed.gov/fulltext/ED560516.pdf)
   **Tier A. Read the abstract and conclusions from retrieved text.** The crisp statement that models with similar predictive error imply very different policies, and that student models should not be selected on predictive error alone.

15. **Käser, T., & Alexandron, G. (2024). Simulated Learners in Educational Technology: A Systematic Literature Review and a Turing-like Test.** *Int. J. Artificial Intelligence in Education*, 34(2), 545–585. DOI [10.1007/s40593-023-00346-1](https://doi.org/10.1007/s40593-023-00346-1) · [ERIC record](https://eric.ed.gov/?id=EJ1426304)
   **Tier A for the headline finding. Abstract only.** The base-rate warning: half the simulated-learner literature offers no validity evidence, and models represent only narrow aspects of learning. Directly relevant to how we budget simulator sophistication vs. validity.

16. **van de Sande, B. (2013). Properties of the Bayesian Knowledge Tracing Model.** *Journal of Educational Data Mining*, 5(2). [ERIC PDF](https://files.eric.ed.gov/fulltext/EJ1115329.pdf)
   **Tier A. Read the model-form and identifiability sections.** The analytic explanation of *why* BKT is unidentifiable (P(G) and P(L₀) trade off through a single functional combination), which grounds the "sweep P(L₀) as a distribution" recommendation.

17. **Rai, D., Gong, Y., & Beck, J. E. (2009). Using Dirichlet Priors to Improve Model Parameter Plausibility.** *Proc. EDM 2009*. [PDF](https://educationaldatamining.org/EDM2009/uploads/proceedings/rai.pdf)
   **Tier A. Skimmed.** Reinforces the identifiability point with a concrete three-model example fitting identically while implying different learning, and gives the standard Dirichlet-prior remedy if we ever fit BKT ourselves.

18. **FSRS benchmark — `ankitects/fsrs-benchmark` and `open-spaced-repetition/awesome-fsrs` wiki.** [repo](https://github.com/ankitects/fsrs-benchmark) · [metric wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Metric)
   **Tier B/C — community project, not peer reviewed. Read the benchmark tables and metric documentation.** Two uses: FSRS default parameters and prediction-accuracy numbers for our Anki-only comparator, and the striking cross-dataset reversal (HLR loses to SM-2 on Anki data) that justifies scepticism about borrowed model rankings. Note the maintainers' own warning that RMSE(bins) is gameable and must be read with log loss and AUC.

19. **RemNote help documentation, "The FSRS Spaced Repetition Algorithm."** [link](https://help.remnote.com/en/articles/9124137-the-fsrs-spaced-repetition-algorithm)
   **Tier C — vendor documentation.** Cited *only* as the traceable origin of the widely-repeated "20–30% fewer reviews for the same retention" claim, which has no published methodology. Do not use it as evidence; know where it comes from so we do not repeat it.

20. **Rafferty, A. N., Brunskill, E., Griffiths, T. L., & Shafto, P. (2016). Faster Teaching via POMDP Planning.** *Cognitive Science*, 40(6), 1290–1332. DOI [10.1111/cogs.12290](https://doi.org/10.1111/cogs.12290)
   **Tier B — not read; known through sources 1 and 2.** Listed because it is the closest thing to a prospective REM success (three models, all policies tested on humans, including a case where the model-favoured policy lost to random). Worth reading directly before finalising the testbed design.

21. **Mandel, T., Liu, Y.-E., Levine, S., Brunskill, E., & Popović, Z. (2014). Offline Policy Evaluation Across Representations with Applications to Educational Games.** *Proc. AAMAS 2014*, 1077–1084.
   **Tier B — not read; the infinite-data mismatch result is quoted from source 1.** Load-bearing for the claim that scale does not cure mismatch, so it should be verified directly before that claim is repeated externally.

22. **Mozer, M. C., Pashler, H., Cepeda, N., Lindsey, R. V., & Vul, E. (2009). Predicting the Optimal Spacing of Study: A Multiscale Context Model of Memory.** *Advances in Neural Information Processing Systems 22*, 1321–1329.
   **Tier B — not read.** Needed if we implement the M3 row as MCM rather than ACT-R. Its structure is described in sources 3, 4, and 6.
