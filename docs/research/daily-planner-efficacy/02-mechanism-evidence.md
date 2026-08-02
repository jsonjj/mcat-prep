# Mechanism evidence for the daily planner's eight pedagogical bets

Evidence review. Tiers used inline: **A** = strong direct evidence or field consensus; **B** = reasonable with stated limits; **C** = weak, indirect, or single-source. Arithmetic that is mine is labelled *[own calculation]*. Reading depth is stated per source in `## Sources`.

---

## Recommendation

**What the team can honestly claim.** Two of the eight bets rest on genuine field consensus: retrieval practice as the primary activity (Bet 2) and spacing over massing (Bet 1). Both survive the move from the lab into classrooms, both grow rather than shrink with longer retention intervals and longer treatments, and both are directly relevant to a 2–6 month MCAT horizon. Three more are defensible design *hygiene* with modest or conditional support: error-driven review with corrective feedback (Bet 6), interleaving of *problem types within a domain* (Bet 3, narrow version), and mastery-based progression as a stopping rule (Bet 4). Two are weakly supported and should be described as engineering judgement, not evidence-based design: prerequisite-graph sequencing (Bet 5) and adaptive difficulty targeting at a specific success rate (Bet 7). One is essentially unstudied as a learning intervention: time-budgeted planning (Bet 8), where the only solid literature says learners' self-reports of their own study time are badly wrong.

**What the team cannot honestly claim.**

1. **No additive stacking.** The mechanisms are not independent. The single most damaging fact for a stacked claim is that systems which *already* implement four or five of these bets simultaneously — ALEKS, Cognitive Tutor — deliver g ≈ 0.05 and 0.20 SD respectively against ordinary instruction in large randomized trials. If the mechanisms were additive at their headline effect sizes, the naive sum would be d ≈ 3.0 *[own calculation]*. The realized effect is roughly 2–7% of that *[own calculation]*.
2. **No claim that algorithmic scheduling beats sensible fixed intervals on learning outcomes.** The FSRS evidence is prediction-calibration evidence, not retention-outcome evidence. There is no published randomized comparison of FSRS against SM-2 or against a fixed expanding schedule on delayed test performance. What *is* established is that adaptive scheduling beats fixed schedules in two small lab experiments (d ≈ 0.5–0.7) and in one large classroom study — a real but bounded finding.
3. **No claim that P(L) = 0.95 is an optimal threshold.** It is a convention inherited from Corbett & Anderson (1995). The one study to interrogate it empirically suggests 0.98 supports future learning better, and the model that generates it is known to systematically over-predict external test performance — exactly the failure mode that matters when the external test is the MCAT.
4. **No transfer of laboratory effect sizes to score gains.** Almost every headline number in this review comes from either (a) undergraduates learning word pairs or facts over minutes to weeks, or (b) K-12 mathematics. Neither population is a 22-year-old spending 300–500 hours over four months on integrated science reasoning.

**The defensible framing is time efficiency against unstructured self-study, not score superiority against a diligent Anki-plus-UWorld user.** That framing is consistent with everything below, and it is the only framing that survives contact with the Yang et al. (2021) active-control result (g = 0.095, not significant).

---

## Findings

### Bet 1 — Spaced repetition over massed study; FSRS-6/DSR algorithmic scheduling with a target-retention parameter

**Evidence FOR the spacing part (Tier A).**

Cepeda, Pashler, Vul, Wixted & Rohrer (2006, *Psychological Bulletin*) meta-analysed **839 assessments of distributed practice from 317 experiments in 184 articles**. Spaced presentations beat massed presentations reliably; more importantly, they established the *interaction* the planner depends on: the optimal inter-study interval grows with the retention interval. **Tier A.**

Cepeda, Vul, Rohrer, Wixted & Pashler (2008, *Psychological Science*) is the strongest single study for scheduling. **1,354 adults** from an internet panel learned 32 obscure facts to a criterion of one perfect recall, reviewed after a gap of 0–105 days, and were tested 7, 35, 70, or 350 days later. For fixed total study time, the optimal gap versus a zero-day gap produced a **64% increase in final recall (d = 1.1)** and a **26% increase in recognition (d = 1.5)**. By retention interval, the recall improvements were **10%, 59%, 111%, and 77%** for 7-, 35-, 70-, and 350-day delays. Interpolated optimal gaps were roughly **3, 8, 12, and 27 days — i.e. 43%, 23%, 17%, and 8% of the retention interval**. This is a large-N adult study over month-to-year horizons, which makes it unusually ecologically relevant. **Tier A.**

A recent *The Clinical Teacher* systematic review and meta-analysis of spaced repetition in medical education — 14 studies, 13 meta-analysed, **21,415 learners**, **SMD = 0.78 [0.56, 0.99], p < .0001** versus "standard studying techniques." **Tier B/C** — the comparator is vaguely specified and heterogeneous, I read only the abstract, and I did not fully pin the author list or year (see Sources; verify before quoting).

**Evidence FOR the *algorithmic* part — weaker than the team probably assumes (Tier B at best).**

- **Mettler, Massey & Kellman (2016, *JEP: General*)**: adaptive response-time-based scheduling (ARTS) versus fixed equal and fixed expanding schedules, undergraduates learning country-name associations. Experiment 1: adaptive beat fixed at immediate and 1-week delayed test, with **Cohen's d ≈ 0.47–0.64** on gain/delayed measures. Experiment 2 yoked fixed schedules to adaptive ones, equating average spacing, and adaptive still won — so the benefit came from *adaptation to individual items and learners*, not from producing better average spacing. Crucially, they found **no difference between expanding and equal spacing**. **Tier B** (two lab experiments, n ≈ 36–72 per condition, paired-associate material).
- **Eglington & Pavlik (2020, *npj Science of Learning*)**: scheduling by an "optimal efficiency threshold" on predicted recall probability beat conventional spacing by **d = 0.64**, with thresholds around 86–94% predicted recall performing best. **Tier B** (online undergraduate sample, vocabulary-style material).
- **Lindsey, Shroyer, Pashler & Mozer (2014, *Psychological Science*)**: personalized review scheduling in a real semester-long middle-school Spanish course; the personalized scheduler improved cumulative-exam performance over massed and generic-spaced review. This is the best *classroom, semester-long* evidence that a model-driven scheduler beats a non-model-driven spaced one. **Tier B.**
- **FSRS specifically**: the open-source `srs-benchmark` evaluates on **9,999 Anki collections and 349,923,850 reviews** with a time-series split. FSRS-6 achieves **log loss 0.3460 ± 0.0042, RMSE(bins) 0.0653, AUC 0.7034**, versus a constant-retention baseline (AVG) at **0.3945 / 0.1034 / 0.4997**, HLR at **0.4694 / 0.1275 / 0.6369**, and Ebisu v2 at **0.4989 / 0.1627 / 0.6051**. **This is a calibration benchmark, not a learning outcome.** It is also not peer-reviewed and is maintained by the FSRS authors — treat as a **company/community benchmark, Tier C for learning claims, Tier B for the narrow claim "FSRS predicts recall probability better than simpler models."**
- **Settles & Meeder (2016, ACL)** — Duolingo's half-life regression. Peer-reviewed conference paper. HLR reduced mean absolute error by **45%+** versus baselines on ~12.9M practice sessions, and an A/B test showed a **~12% increase in daily retention/engagement**. Note carefully: the headline user-facing win was **engagement, not measured learning**. On the srs-benchmark, HLR is one of the *worst* performers, well behind FSRS. **Tier B for the modelling claim, Tier C for any learning claim.**

**Evidence AGAINST / limiting conditions.**

- **Expanding intervals are not established as superior.** Karpicke & Roediger (2007) found equal-interval practice superior to expanding at a delayed test, with no difference once initial interval was equated. Mettler et al. (2016) found no expanding-versus-equal difference. Cepeda et al. (2006) wrote, in the paper itself: *"Expanding study intervals rarely seem to produce much harm for recall after long delays, but there is insufficient data to say whether they help. This has not stopped some software developers from assuming that expanding study intervals work better than fixed intervals."* That sentence is aimed directly at products like this one. **Tier A on the absence of evidence.**
- **No published RCT compares FSRS to SM-2 or to a fixed schedule on retention.** I searched for one and could not find it (see "What I could not verify"). Everything the FSRS community publishes about efficiency gains is simulation output from FSRS's own model, which is circular: the model that predicts recall is also the model used to score the schedules.
- **The target-retention parameter is a workload/knowledge trade-off, not a learning optimum.** FSRS's optimal-retention simulator returns values typically in 0.80–0.90 by minimizing predicted workload per unit of retained knowledge under its own memory model. It is an engineering optimum inside a model, not an empirical finding. **Tier C.**
- **Most of the gain is from spacing at all, not from sophistication.** Cepeda 2008 gives d ≈ 1.1 for "spaced at roughly the right gap" versus "not spaced." The best adaptive-versus-fixed comparisons give d ≈ 0.5–0.65. And the fixed comparators in those studies were *reasonable* fixed schedules. A crude scheduler that puts the gap at ~10–20% of the target retention interval captures most of the available effect.

**Ecological validity: mixed, better than most of this review.** Cepeda 2008 is adults, real facts, gaps and retention intervals measured in weeks and months — genuinely relevant. Mettler and Eglington & Pavlik are undergraduates learning paired associates in single sessions with one-week follow-ups — not relevant to four months of organic chemistry. Lindsey et al. is a real semester-long course. The FSRS benchmark is real Anki users over years, but measures prediction, not learning. **Net: the spacing bet is one of the two you can defend to a psychometrician. The "our algorithm is better than their algorithm" bet is not.**

**Additivity note.** Spacing and retrieval practice are widely treated as separable and roughly independent, but see Soderstrom, Kerr & Bjork (2016) under Bet 6 — when spacing is equated, restudy stops looking useless, and when both retrieval and restudy are applied to the same item, restudy adds nothing. Spacing and interleaving are *sub*additive (Birnbaum et al., 2013; see Bet 3).

---

### Bet 2 — Retrieval practice as the primary study activity

**This is the strongest bet in the set, and it is also the one your competitors already make.**

**Evidence FOR (Tier A).**

- **Roediger & Karpicke (2006, *Psychological Science*)**: undergraduates reading prose passages. At a one-week delay, repeated study (SSSS) recalled **40%**, one test (SSST) **56%**, three tests (STTT) **61%**. Classic demonstration; small N, prose recall, one week.
- **Karpicke & Roediger (2008, *Science*)**: 40 Swahili–English pairs. Items that continued to receive retrieval practice after first correct recall were recalled at **~80%** one week later; items dropped from testing but still restudied at **36%**, and items dropped from both at **33%**. Repeated study after learning produced no measurable delayed benefit. **This is the single most important result for a scheduler design** because it says: do not stop testing an item just because it was answered correctly.
- **Rowland (2014, *Psychological Bulletin*)**: 61 lab studies, 159 effect sizes. Testing versus restudy **g = 0.50**; **< 1 day g = 0.41**, **≥ 1 day g = 0.69**; feedback **g = 0.73** versus no feedback **g = 0.39**.
- **Adesope, Trevisan & Sundararajan (2017, *Review of Educational Research*)**: 272 effect sizes, 188 experiments, N = 15,427. Versus restudy **g = 0.51**; versus filler/no activity **g = 0.93**. Multiple-choice **g = 0.70** versus short answer **g = 0.48**. Gap of 1–6 days **g = 0.82** versus < 1 day **g = 0.56**. The authors themselves say **g = 0.51 is the number to quote**.
- **Yang, Luo, Vadillo, Yu & Shanks (2021, *Psychological Bulletin*)**: **222 independent classroom studies, 573 effects, 48,478 students.** Overall **g = 0.499 [0.442, 0.557]**. This is the ecological-validity anchor: the effect survives in real classrooms at essentially its lab magnitude.
- **Yang et al.'s treatment-duration moderator is directly favourable to a 4-month planner**: single class **g = 0.385** → less than a semester **g = 0.521** → whole semester **g = 0.547** → longer than a semester **g = 0.624**, approximately linearly increasing. The testing effect *grows* with treatment duration. Very few of the mechanisms in this review can say that.

**Does it hold for MCAT-style applied reasoning? Partially — and the honest answer is "smaller."**

Pan & Rickard (2018, *Psychological Bulletin*) meta-analysed transfer of test-enhanced learning: overall transfer **d = 0.40 [0.31, 0.50]** versus non-testing re-exposure controls. Broken down:

| Transfer category | k (effect sizes) | d | Verdict |
|---|---|---|---|
| Application and inference questions | 41 (17 papers) | **0.32 [0.085, 0.56]**, p = .0013 | Positive, modest — this is the MCAT-relevant cell |
| Problem-solving skills overall | 17 (9 papers) | 0.29, p = .10 | Not significant |
| — medical diagnosis/treatment subcategory | — | **0.59** | Positive |
| — worked-examples subcategory | — | **0.045** | Null |
| Rearranged stimulus–response items | — | 0.22, p = .066 | Weak at best |
| Untested material seen during study | 17 (12 papers) | 0.16, p = .20 | **No evidence of transfer** |

The mean *same-item* testing effect in Pan & Rickard's own dataset was **d = 0.68**, and transfer effects were smaller than testing effects in **56 of 81** experiments (binomial p = .0007). Under PET-PEESE and selection-method corrections, moderator effects held but **intercepts fell substantially, "often indicating no positive transfer when none of the aforementioned moderators are present."**

**Evidence AGAINST / the limiting condition that matters most.**

Yang et al. (2021), control-condition moderator, Q(3) = 153, p < .001:
- versus no activity/filler: **g = 0.610**
- versus being tested on fewer questions: **g = 0.465**
- versus restudying: **g = 0.330**
- versus **other elaborative strategies** (concept mapping, note-taking, summarising): **g = 0.095**, and *not statistically significant*

The MCAT market's counterfactual learner is not idle. They are doing UWorld and Anki. Against that learner, the testing effect is in the g ≈ 0.095 regime.

**Ecological validity: good by the standards of this review.** Yang et al. is 48,478 students in authentic classrooms across a century of studies. Pan & Rickard's application/inference category includes real science and medical materials. The weakness is that "classroom" still mostly means semester-length undergraduate courses with instructor-set content, not 400 hours of self-directed adult prep for a single high-stakes exam.

**Additivity note.** Two specific overlaps. First, the "additional exposure" theory that Yang et al. endorse means part of the testing effect is simply re-exposure — which your spacing scheduler also provides, so the two mechanisms are partly the same mechanism counted twice. Second, corrective feedback is a large moderator of the testing effect (Rowland: 0.73 vs 0.39; Yang: 0.537 vs 0.374), and feedback is also the entire content of Bet 6. **Bet 2 and Bet 6 are not separable; do not add them.**

---

### Bet 3 — Interleaving and variety enforcement

**Evidence FOR, in the narrow version (Tier A for within-domain problem types).**

- **Rohrer, Dedrick, Hartwig & Cheung (2020, *Journal of Educational Psychology*)**: a randomized classroom trial in middle-school mathematics. Interleaved practice **61%** versus blocked practice **38%** on a delayed test, **d = 0.83**. Real students, real curriculum, real delay. This is the single best interleaving result in existence.
- **Rohrer & Taylor (2007, *Instructional Science*)**: mixing solid-geometry problem types improved delayed test performance dramatically over blocking.
- **Brunmair & Richter (2019, *Psychological Bulletin*)**: overall interleaving effect **g = 0.42** across the full corpus.

**Evidence AGAINST — and this is substantial.**

Brunmair & Richter's moderator analysis is the honest picture, and it is not favourable to a general "variety is good" rule:

- **Paintings / inductive category learning: large positive.**
- **Expository texts: not significant.**
- **Word / vocabulary materials: g = −0.39 — interleaving is actively harmful.**
- Effects concentrate where the learning task is *discrimination between confusable categories*.

Mechanistically, the field's explanation (Carvalho & Goldstone's Sequential Attention Theory; Noh et al., 2016, *Cognition*) is that **interleaving emphasises between-category differences and blocking emphasises within-category commonalities**. Blocking wins when the hard part is extracting what instances of one concept share; interleaving wins when the hard part is telling two confusable things apart. Rule-based category learning benefits from blocking; information-integration learning benefits from interleaving.

**On the distinction the team may be conflating: varying *topic/problem type* versus varying *activity type*.**

These are different claims with very different evidentiary standing.

- **Varying problem type within a domain**: supported, Tier A for maths-like discrimination tasks, Tier B–C elsewhere, and negative for vocabulary.
- **Varying activity type** (e.g. alternating flashcards / passage practice / video / written explanation): **I found no meta-analytic evidence and no direct experimental test.** The nearest evidence is Doroudi, Holstein, Aleven & Brunskill (2015, EDM) analysing activity-type sequences in an online course, which found **fluency-building activities the strongest predictor of higher posttest scores** and concluded that the optimal ordering of activity types **varies by topic**. That is a correlational finding from log data, not an experiment, and it does not support a blanket anti-monotony rule. **Tier C.**

The team should say plainly: *topic interleaving is evidence-based within limits; activity-type variety is a product/engagement decision, not a learning-science decision.* If activity variety is retained because it sustains adherence over four months, that is a legitimate reason — just label it as such.

**Ecological validity: unusually good for the maths result, poor elsewhere.** Rohrer et al. (2020) is a genuine school RCT. Brunmair & Richter's corpus is dominated by short lab studies with pictures, word lists, and category-learning tasks. There is essentially nothing on interleaving in adult high-stakes exam prep across months.

**Additivity note — this is the clearest subadditivity result in the whole review.** Birnbaum, Kornell, Bjork & Bjork (2013, *Memory & Cognition*) crossed spacing with interleaving in inductive category learning and found that **the benefits of spacing and interleaving were subadditive**, and that spacing became **harmful when it interrupted the juxtaposition of interleaved exemplars**. In other words: two of your eight mechanisms actively interfere with each other under identifiable conditions. Separately, part of the interleaving effect in Rohrer & Taylor's early work is confounded with spacing, because interleaving mechanically spaces repetitions of the same problem type.

---

### Bet 4 — Mastery-based progression with P(L) ≥ 0.95

**Evidence FOR (Tier B, with a large caveat).**

- **Kulik, Kulik & Bangert-Drowns (1990, *Review of Educational Research*)**: 108 controlled evaluations (72 Keller PSI, 36 Bloom LFM). Average effect on end-of-instruction examinations across 103 studies: **0.52 SD** (SE 0.033), moving the average student from the 50th to the 70th percentile. Eleven studies with follow-up examinations (mean interval ~8 weeks) showed **0.71**, i.e. no decay.
- **Corbett & Anderson (1995, *User Modeling and User-Adapted Interaction* 4, 253–278)**: the origin of BKT and of the 0.95 criterion. Cognitive mastery learning in the ACT Programming Tutor.
- **VanLehn (2011, *Educational Psychologist*)**: human tutoring **d ≈ 0.79**, intelligent tutoring systems **d ≈ 0.76** versus no tutoring; step-based ITS approaches human tutoring.
- **Ma, Adesope, Nesbit & Liu (2014, *Journal of Educational Psychology*)**: ITS overall **g = 0.41**; **g = 0.42** versus teacher-led instruction; **no significant difference versus human tutoring (g = −0.11)**.
- **Pane, Griffin, McCaffrey & Karam (2014, *EEPA*)**: two-year cluster-randomized trial of Cognitive Tutor Algebra I across seven states, matched school pairs; **18,700 high-school students**. First-year effects null (negative in high school). Second-year high-school effects **0.14–0.21 SD**, significant; middle-school effects positive but not significant. ~8 percentile points for the median student.

**Evidence AGAINST, and it is serious for an MCAT product.**

1. **The mastery effect is concentrated on locally-made tests and vanishes on standardized ones.** Kulik et al. (1990) report that test type was among the strongest moderators, and in the four studies that used both, *"the effect of the mastery treatment was trivially small on the standardized test"* in **every one**. Slavin (1987, *Review of Educational Research*) reached the same conclusion in his best-evidence synthesis of group-based mastery learning: essentially **no effect on standardized achievement**, effects confined to experimenter-made measures. **The MCAT is a standardized test.** This is the most direct threat to Bet 4 in the literature.
2. **Kulik et al. also found mastery programs "may increase student time on instructional tasks."** If mastery buys 0.52 SD by spending more time, it is not a time-efficiency mechanism — it is the opposite. For a product whose core promise is doing more with a fixed daily budget, this is a structural problem, not a footnote.
3. **The 0.95 threshold is a convention, not an optimum.** Corbett & Anderson chose it; downstream systems have used 0.8, 0.9, 0.95, 0.975, and per-skill values. Optimization studies against simulated data yield per-skill optima ranging **0.90–0.97**. A 2025 EDM analysis on the Rori math tutor (63,000+ users across seven African countries) found that learners reaching **P(Lₙ) ≥ 0.98** significantly outperformed all lower bands on next-lesson accuracy, next-lesson prior knowledge, and next-lesson learning gain — concluding that *"much of the over-practice identified by [Beck & Gong] may not be over-practice at all."* It is correlational, single-platform, elementary maths, and the authors say so. **Tier C, but it is the only direct interrogation of the threshold that exists.**
4. **BKT systematically over-predicts external test performance — precisely the calibration failure that matters here.** Corbett & Anderson's own validations: predicted 86% versus actual 81% (r = 0.66 across students), and predicted 71% versus actual 62% (r = 0.74). Over-prediction is **strongest for students who needed the most remedial practice**. Translation for the design doc: a "95% mastered" badge will overstate MCAT-day performance, and will overstate it most for the weakest learners.
5. **Wheel-spinning.** Beck & Gong (2013, AIED) defined wheel-spinning as failing to master a skill within 10 opportunities and found **~38% of students did not master a given maths skill after 10 practice opportunities**. A mastery loop without an escape hatch converts these learners' entire time budget into unproductive repetition. Any mastery threshold needs a paired give-up/reroute rule.

**Ecological validity: poor-to-moderate.** PSI and Bloom's LFM studies are 1960s–1980s college and secondary courses. Cognitive Tutor and Rori are K-12 mathematics. Nothing in this literature is an adult preparing for a professional admissions exam, and mathematics procedural skill is a much cleaner "skill" object than "MCAT biochemistry reasoning." BKT's core assumption — that knowledge maps onto independent binary skills that are never forgotten once learned — is a poor fit for MCAT content, and BKT famously has no forgetting term, which puts it in direct tension with Bet 1.

**Additivity note.** Cognitive Tutor and ALEKS *are* the stacked system. They combine mastery thresholds, knowledge tracing, prerequisite structure, adaptive problem selection, and immediate feedback. Their randomized results — 0.20 SD and g = 0.05 — are the empirical answer to "what happens when you stack these."

---

### Bet 5 — Prerequisite-graph-driven sequencing (leverage weighting)

**This is the weakest-evidenced bet in the set. Say so in the design doc.**

**Evidence FOR (Tier C).**

Knowledge-space theory is a mathematically respectable formalism (Doignon & Falmagne), and ALEKS is its flagship implementation. But formal elegance is not efficacy evidence, and the efficacy evidence is close to null:

- **Sun, Else-Quest, Hodges, French & Dowling (2021, *Investigations in Mathematics Learning*)**: meta-analysis of ALEKS, **56 effect sizes, 9,238 students, 33 studies (2000–2020)**. Learning with ALEKS was **comparable to traditional instruction, g = 0.05 [−0.01, 0.20]**. It helped when used as a *supplement* to traditional instruction, **g = 0.43 [0.02, 0.83]** — which is a dosage/extra-practice finding, not a sequencing finding.
- **Fang, Ren, Hu & Graesser (2019, *Educational Psychology*)**: earlier ALEKS meta-analysis, 15 studies, 24 independent samples. ALEKS was **"as good, but not better than, traditional classroom teaching."** Effect sizes did not differ by schooling level, by principal-versus-supportive implementation, or by standardized-versus-instructor-designed outcome. Notably, **effect sizes were larger for shorter durations of use** — the opposite of what a long-horizon product wants to hear.
- **Phillips, Pane, Reumann-Moore & Shenbanjo (2020, *ETR&D*)**: the first rigorous in-school RCT of ALEKS, **~2,500 high-school students**, ALEKS as a supplement to district algebra. **No significant effect on the end-of-course algebra exam.** Implementation dosage and quality were low, which the authors flag as the likely explanation.
- A WWC-reviewed RCT of an ALEKS after-school program (253 students, 16 classes, West Tennessee, 25 weeks) produced **no statistically significant positive findings**.

**Evidence AGAINST (Tier B).**

Doroudi, Aleven & Brunskill (2019, *IJAIED*) reviewed instructional sequencing driven by reinforcement learning. Over half of the studies reported an RL-induced policy outperforming *some* baseline, but success depended heavily on implementation choices and on constraining the policy space with cognitive-psychology priors. For the specific case relevant here — adaptively sequencing *interdependent* content against a well-designed fixed expert sequence — the wins are not clean. There is no body of work showing that computed prerequisite ordering measurably beats a good expert syllabus.

**Ecological validity: poor.** Almost entirely K-12 and developmental-college mathematics, where prerequisite structure is unusually crisp (you cannot factor before you can multiply). MCAT content is far more weakly ordered: amino-acid structure and enzyme kinetics have a dependency, but most of the graph is soft. A soft prerequisite graph is exactly the case where a hand-built expert syllabus is hardest to beat.

**Additivity note.** ALEKS is a stack of knowledge-space sequencing + mastery + adaptive item selection + immediate feedback. Two independent meta-analyses put it at g ≈ 0.05 against traditional instruction. **If you want one number to keep the additivity claim honest, this is it.**

**Honest framing for the design doc:** prerequisite ordering is a *coherence and user-experience* decision — it prevents the obviously bad outcome of serving enzyme kinetics before a learner knows what a catalyst is. Claim that. Do not claim a measured learning gain, because none has been demonstrated.

---

### Bet 6 — Error-driven review (a "mistakes" queue)

**Evidence FOR (Tier A for the feedback part, Tier B for targeting).**

- **Feedback is the causal ingredient, and it is large.** Rowland (2014): testing with feedback **g = 0.73** versus without **g = 0.39**. Yang et al. (2021): corrective feedback **g = 0.537** versus none **g = 0.374**. Adesope et al. (2017): high implementation fidelity **g = 0.65** versus low **g = 0.46**.
- **Metcalfe (2017, *Annual Review of Psychology*, "Learning from Errors")**: errors followed by corrective feedback produce better learning than errorless study, and the **hypercorrection effect** means high-confidence errors are corrected most reliably. This is a direct argument for an error queue that captures confidence.
- **Kulik & Kulik (1988, *Review of Educational Research*)** on feedback timing: **immediate feedback is superior in applied/classroom studies; delayed feedback advantages appear mainly in acquisition-list laboratory experiments.** For a software product with instant grading, immediate feedback is the right default and the applied literature supports it.

**Evidence AGAINST targeting errors *specifically*, and this is the sharp one.**

**Karpicke & Roediger (2008, *Science*)** is direct evidence against a pure mistakes-queue policy. Once an item had been correctly recalled, dropping it from further *testing* — while continuing to restudy it — collapsed one-week retention from **~80% to 36%**. A queue that surfaces only missed items and retires correct ones is implementing exactly the losing condition.

The countervailing evidence is **Soderstrom, Kerr & Bjork (2016, *Psychological Science*)**, who replicated Karpicke & Roediger between-subjects (Experiment 1) and then re-ran it within-subjects with spacing equated (Experiment 2). With spacing controlled, **repeated restudy was no longer useless** — STN items beat SNTN items, **d = 0.89** — but **restudy added nothing on top of repeated testing** (ST ≈ SNT, p = .205). Their own conclusion: *"repeated studying might not have a significant impact on learning over and beyond what is already achieved by repeated testing."*

I found **no study that directly compares an error-targeted review policy against a uniform review policy under equal total time.** The nearest evidence is the adaptive-scheduling literature (Mettler et al., Eglington & Pavlik), where the adaptive policy uses per-item difficulty — which includes error history — and wins by d ≈ 0.5–0.65 against fixed schedules. That is supportive but indirect, because those schedulers do not drop correct items, they re-space them.

**Ecological validity: moderate for feedback, weak for the queue.** The feedback-timing literature spans genuine classroom studies (Kulik & Kulik explicitly separate applied from experimental). The error-targeting evidence is thin everywhere.

**Additivity note.** Bet 6 is largely a component of Bet 2, not an addition to it. Feedback is a *moderator* of the testing effect in every meta-analysis quoted above, which means its benefit is already inside the g = 0.50 you would cite for retrieval practice. Counting retrieval practice at g = 0.50 and then adding a separate feedback effect double-counts.

**Design implication that follows directly from the evidence:** the mistakes queue should raise an item's review *frequency*, never remove correct items from the rotation. Weighted re-spacing, not filtering.

---

### Bet 7 — Adaptive difficulty targeting (the ~85% rule)

**Evidence FOR (Tier B, and much narrower than the popular framing).**

Wilson, Shenhav, Straccia & Cohen (2019, *Nature Communications*, "The Eighty Five Percent Rule for optimal learning") derive analytically that for a class of **gradient-descent-based learning algorithms performing binary classification with noisy stimuli**, the training error rate that maximizes the rate of parameter improvement is **ε\* ≈ 15.87%, i.e. ~85% accuracy**. They show the optimal difficulty is *constant* with respect to the agent's current precision, meaning a system can simply clamp the error rate at a fixed value. They then relate this to perceptual-learning and animal-training data.

**Evidence AGAINST / limiting conditions — the team must read these carefully.**

1. **The derivation is about gradient-descent parameter updating on a perceptual discrimination task. It is not a result about human declarative memory, conceptual understanding, or exam-item selection.** Extending it to "serve MCAT items the learner gets right 85% of the time" is an analogy, not an application. Wilson et al. are careful; secondary coverage usually is not.
2. **It is explicitly task-dependent within the paper's own framework**: the result holds for the specified learning rule and noise model. Change the learning rule and the optimum moves.
3. **Desirable-difficulties theory (Bjork) points the other way for retrieval scheduling.** Conditions that *depress* performance during learning often *improve* long-term retention. An 85%-success target is a performance-during-learning target, and the desirable-difficulties literature is precisely the argument that optimizing that is the wrong objective.
4. **The empirical scheduling literature converges on a higher number.** Eglington & Pavlik (2020) found the best optimal-efficiency thresholds at **86% and 94% predicted recall**, with 94% among the strongest. FSRS's own optimal-retention search typically lands at **0.80–0.90**, and that is a workload optimum, not a learning optimum. Cognitive-tutor mastery thresholds imply target success rates well above 90%. So "85%" sits at the low end of a range of defensible numbers derived from unrelated arguments that happen to overlap.
5. **Zone of proximal development is not a quantitative theory.** Vygotskian ZPD cannot license a specific success-rate target and should not be cited as if it could.

**Ecological validity: poor.** Perceptual-learning experiments, animal training, and simulated neural networks. There is no study I found that manipulated item-difficulty targeting in an adult exam-prep setting and measured score outcomes.

**Additivity note.** The 85% target interacts directly with Bet 1's target-retention parameter and Bet 4's mastery threshold — all three are, mechanically, knobs on the same quantity (predicted probability of a correct response at time of presentation). Setting all three independently is likely to produce incoherent behaviour. Treat them as **one parameter with one policy**, not three mechanisms.

**Honest framing:** difficulty targeting is a reasonable engineering heuristic that prevents the two obvious failure modes (trivial items waste time; impossible items cause abandonment). Cite Wilson et al. for the *shape* of the argument, not for the number. Do not claim the 85% figure is validated for this application.

---

### Bet 8 — Time-budgeted planning

**Evidence FOR (Tier B, indirect).**

There is no literature on "fitting activities to a stated daily minute budget" as an intervention. The supporting evidence is inferential: Cepeda et al. (2006, 2008) both hold **total study time fixed** and show that *distribution* of that fixed time drives outcomes — Cepeda 2008's 64% recall improvement is explicitly "for a fixed amount of study time." That is the real case for the feature: **given a fixed budget, allocation matters a great deal.** Tier A for that proposition; Tier C for any claim about the budgeting UI itself.

**Evidence AGAINST — learners' self-reported time is unreliable, and the direction of the error is bad for you.**

- Students **overestimate study time by a median of ~45%** when self-reports are compared against logged time-on-task (PLOS ONE analysis of self-reported versus logged study time). **Tier B**; I read the results section, not the whole paper.
- **Buehler, Griffin & Ross (1994, *JPSP*)** — the planning fallacy: people systematically underestimate their own task completion times even when they know their history of doing so, and even when explicitly asked for worst-case estimates. **Tier A** for the phenomenon; abstract and secondary summaries only.

Put together: a learner who says "I have 90 minutes today" is likely to (a) over-report the study time they will actually deliver and (b) under-estimate how long each task takes. A planner that treats the stated budget as ground truth will chronically over-schedule, which is the most common cause of plan abandonment.

**Ecological validity: the *against* evidence is the ecologically valid part.** The planning-fallacy and time-estimation literature is about real students estimating real work. Nothing here is a lab artifact.

**Additivity note.** None available. Time budgeting is a delivery mechanism, not a learning mechanism. It should be excluded from any effect-size stack entirely, and should instead be modelled as a *multiplier on adherence* — which is where its real value sits.

---

### Cross-cutting: are these effects additive? (No.)

This is the section to put in front of a skeptical investor before they ask.

**1. The naive sum.** Taking each bet's headline effect at face value — spacing d ≈ 1.1 (Cepeda 2008, optimal versus zero gap), retrieval g ≈ 0.50 (Rowland/Yang), interleaving g ≈ 0.42 (Brunmair & Richter), mastery d ≈ 0.52 (Kulik et al.), ITS/sequencing g ≈ 0.41 (Ma et al.) — gives **d ≈ 2.95** before even counting error-driven review, difficulty targeting, and time budgeting *[own calculation]*.

**2. What stacked systems actually deliver.** Cognitive Tutor Algebra I, which implements mastery learning, knowledge tracing, adaptive problem selection, prerequisite structure, and immediate feedback, delivered **0.14–0.21 SD** in the second year of a two-year RCT with 18,700 students and **null in the first year**. ALEKS, which implements knowledge-space sequencing, mastery, and adaptive selection, delivers **g = 0.05** against traditional instruction across 33 studies and 9,238 students. **The delivered effect is roughly 2–7% of the naive sum** *[own calculation: 0.05/2.95 = 1.7%; 0.20/2.95 = 6.8%]*.

**3. Direct experimental evidence of subadditivity between specific pairs.**

- **Spacing × interleaving: subadditive, and antagonistic under some conditions.** Birnbaum et al. (2013) found the combined benefit smaller than the sum, and found spacing *harmful* when it broke up the juxtaposition that makes interleaving work.
- **Retrieval × restudy: one mechanism absorbs the other.** Soderstrom, Kerr & Bjork (2016), Experiment 2: with spacing equated, spaced restudy improved learning substantially on its own (d = 0.89 versus dropping both), but added **nothing** when the item was also being repeatedly retrieved.
- **Retrieval × active comparator: the effect nearly disappears.** Yang et al. (2021): g = 0.610 against filler, **g = 0.095 (n.s.) against other elaborative strategies**. Once the learner is already doing something cognitively active, the mechanism you are adding is largely already present.
- **ITS × human tutoring: a plateau, not a sum.** VanLehn (2011) and Ma et al. (2014) both find ITS statistically indistinguishable from human tutoring (Ma: g = −0.11, n.s.), despite tutoring and ITS operating through overlapping mechanisms. Two strong interventions do not compose into a stronger one.

**4. Why the overlap is structural, not incidental.** Several of these bets are the *same construct* measured from different angles. Spacing, target retention, difficulty targeting, and mastery thresholds are all policies over one latent variable: predicted probability of correct response at presentation time. Retrieval practice and error-driven feedback are one mechanism with a moderator, not two mechanisms. Interleaving mechanically produces spacing. A stack of eight labels is, on inspection, roughly **three or four independent levers**: *distribute practice over time*, *make the learner retrieve rather than review*, *give corrective feedback*, and *pick the next item using what you know about this learner*.

**5. What the team should claim instead.** The defensible efficiency claim is **time savings against unstructured self-study**, which is the form in which ITS gains have historically been most robust — the classic LISP-tutor result was completing equivalent learning in one-third to three-quarters of the time. A claim of the form "reaches the same content mastery in ~25–40% less study time than unstructured self-study" is (a) consistent with the ITS literature, (b) not contradicted by the active-comparator nulls, and (c) directly measurable in your own product telemetry, which makes it defensible rather than merely arguable.

---

## DOK 1 — established facts

- Cepeda et al. (2006) meta-analysed 839 assessments of distributed practice from 317 experiments in 184 articles.
- Cepeda et al. (2008): 1,354 adults; optimal gap versus zero-day gap produced +64% final recall (d = 1.1) and +26% recognition (d = 1.5) for fixed total study time.
- Cepeda et al. (2008): interpolated optimal gaps of ~3, 8, 12, and 27 days for retention intervals of 7, 35, 70, and 350 days — 43%, 23%, 17%, and 8% of the retention interval respectively.
- Cepeda et al. (2006) state in the paper that there is "insufficient data to say whether" expanding intervals help, and explicitly criticize software developers for assuming they do.
- Karpicke & Roediger (2007) found equal-interval spacing superior to expanding spacing at a delayed test.
- Mettler, Massey & Kellman (2016): adaptive (ARTS) scheduling beat fixed equal and fixed expanding schedules at immediate and 1-week delayed tests, Cohen's d ≈ 0.47–0.64; yoked-schedule Experiment 2 attributes the gain to per-item/per-learner adaptation, not to average spacing.
- Eglington & Pavlik (2020): optimal-efficiency-threshold scheduling beat conventional spacing by d = 0.64; best thresholds at 86% and 94% predicted recall.
- srs-benchmark (open source, not peer reviewed): 9,999 Anki collections, 349,923,850 reviews. FSRS-6 log loss 0.3460, RMSE(bins) 0.0653, AUC 0.7034; constant-rate baseline (AVG) 0.3945 / 0.1034 / 0.4997; HLR 0.4694 / 0.1275 / 0.6369.
- Settles & Meeder (2016, ACL): half-life regression cut prediction MAE by 45%+ versus baselines and produced a ~12% increase in *daily engagement* in an A/B test at Duolingo.
- Roediger & Karpicke (2006): one-week recall of prose — repeated study 40%, one test 56%, three tests 61%.
- Karpicke & Roediger (2008, *Science*): after first correct recall, continued testing gave ~80% one-week recall; dropping from testing gave 36% (restudied) and 33% (dropped from both). Repeated study after learning produced no measurable delayed benefit.
- Soderstrom, Kerr & Bjork (2016): replicated the above between-subjects; within-subjects with spacing equated, restudy helped when testing was dropped (d = 0.89) but added nothing on top of repeated testing.
- Rowland (2014): testing versus restudy g = 0.50; ≥1 day g = 0.69 versus <1 day g = 0.41; feedback g = 0.73 versus no feedback g = 0.39.
- Adesope, Trevisan & Sundararajan (2017): 272 effect sizes, N = 15,427; versus restudy g = 0.51; versus filler g = 0.93; MC g = 0.70, short answer g = 0.48; 1–6 day gap g = 0.82 versus <1 day g = 0.56.
- Yang et al. (2021): 222 classroom studies, 573 effects, 48,478 students; overall g = 0.499 [0.442, 0.557].
- Yang et al. (2021) control moderator: no activity g = 0.610; fewer questions g = 0.465; restudy g = 0.330; other elaborative strategies g = 0.095, not significant.
- Yang et al. (2021) duration moderator: single class g = 0.385; < semester g = 0.521; whole semester g = 0.547; > semester g = 0.624.
- Pan & Rickard (2018): overall transfer d = 0.40 [0.31, 0.50]; application and inference questions d = 0.32 [0.085, 0.56] (k = 41, 17 papers); problem-solving skills d = 0.29 (n.s.), with medical diagnosis d = 0.59 and worked examples d = 0.045; untested-but-studied material d = 0.16 (n.s.).
- Pan & Rickard (2018): mean same-item testing effect in their dataset d = 0.68; transfer < testing in 56 of 81 experiments.
- Rohrer et al. (2020): classroom RCT, interleaved 61% versus blocked 38% on delayed test, d = 0.83.
- Brunmair & Richter (2019): overall interleaving g = 0.42; word/vocabulary materials g = −0.39; expository texts not significant.
- Birnbaum et al. (2013): spacing and interleaving benefits were subadditive; spacing was harmful when it interrupted juxtaposition of interleaved categories.
- Corbett & Anderson (1995) set the BKT mastery criterion at P(L) = 0.95 in the ACT Programming Tutor.
- Corbett & Anderson's validations: BKT predicted 86% versus 81% actual test accuracy (r = 0.66), and 71% versus 62% (r = 0.74). Over-prediction is strongest for students who needed more remedial practice.
- Kulik, Kulik & Bangert-Drowns (1990): 108 evaluations; mean effect 0.52 SD on end-of-instruction examinations (103 studies, SE 0.033); 0.71 on follow-up examinations at ~8 weeks (11 studies).
- Kulik et al. (1990): in all four studies using both local and standardized criterion tests, the mastery effect on the standardized test was "trivially small." Mastery programs "may increase student time on instructional tasks."
- Slavin (1987): best-evidence synthesis of group-based mastery learning found essentially no effect on standardized achievement measures.
- Beck & Gong (2013): ~38% of students failed to master a given mathematics skill within 10 practice opportunities ("wheel-spinning").
- Pane et al. (2014): two-year cluster-RCT of Cognitive Tutor Algebra I, 18,700 high-school students, 7 states; year-1 effects null/negative, year-2 high-school effects 0.14–0.21 SD (significant), middle-school effects not significant; ~8 percentile points.
- Sun et al. (2021): ALEKS meta-analysis, 56 effect sizes, 9,238 students, 33 studies; g = 0.05 [−0.01, 0.20] versus traditional instruction; g = 0.43 [0.02, 0.83] as a supplement.
- Fang, Ren, Hu & Graesser (2019): ALEKS meta-analysis, 15 studies, 24 samples; ALEKS as good as but not better than traditional teaching; effects larger for *shorter* durations of use.
- Phillips, Pane, Reumann-Moore & Shenbanjo (2020): RCT of ALEKS as a high-school algebra supplement, ~2,500 students; no significant effect on the end-of-course exam.
- Ma, Adesope, Nesbit & Liu (2014): ITS g = 0.41 overall; g = 0.42 versus teacher-led instruction; g = −0.11 (n.s.) versus human tutoring.
- VanLehn (2011): human tutoring d ≈ 0.79; ITS d ≈ 0.76.
- Wilson et al. (2019): for gradient-descent binary classification with noisy stimuli, optimal training error rate ε* ≈ 15.87% (≈85% accuracy), and this optimum is constant with respect to the agent's precision.
- Kulik & Kulik (1988): immediate feedback superior in applied/classroom studies; delayed-feedback advantages concentrated in acquisition-list laboratory experiments.
- Students overestimate their own study time by a median of ~45% relative to logged time-on-task.
- A recent *The Clinical Teacher* meta-analysis of spaced repetition in medical education (14 studies / 21,415 learners) reports SMD = 0.78 [0.56, 0.99] versus "standard studying techniques" (citation not fully verified).

---

## DOK 2 — insights and implications

1. **Your eight bets are approximately four levers.** Distribute practice over time; make the learner retrieve rather than review; give corrective feedback; select the next item using a model of this learner. Spacing, target retention, mastery threshold, and difficulty targeting are four names for policies over one latent variable — predicted probability of a correct response at presentation. Presenting them as eight independent mechanisms invites exactly the additivity criticism a psychometrician will make, and the criticism will be correct.

2. **The mastery-learning literature's biggest effect is a measurement artifact you cannot exploit.** Kulik et al.'s 0.52 becomes "trivially small" on standardized tests in every study that measured both, and Slavin found the same. The MCAT is standardized and externally authored. Any internal "mastery" metric you build will be a local test in exactly the sense that inflates these estimates. Design corollary: your internal mastery signal must be validated against full-length AAMC-format performance, or it will drift into flattering nonsense — and BKT's known over-prediction bias means it will drift *upward*, most for your weakest users.

3. **The Karpicke & Roediger (2008) result is a direct constraint on the mistakes-queue design, and it points the opposite way to intuition.** Retiring an item because the learner got it right is the losing condition in that experiment (36% versus 80% at one week). The mistakes queue should modulate *frequency*, never *membership*. Combined with Soderstrom et al.'s finding that restudy adds nothing on top of repeated retrieval, the implication is unusually clean: **everything stays in the retrieval rotation; errors just come back sooner; do not build a separate "review the explanation" track and count it as a second mechanism.**

4. **Interleaving evidence supports mixing *topics*, not mixing *activity formats*, and the team is at risk of conflating them.** Brunmair & Richter's moderators say interleaving works where discrimination between confusable categories is the bottleneck and fails (g = −0.39) for vocabulary-like material. MCAT content contains both: distinguishing SN1 from SN2, or competitive from non-competitive inhibition, is a discrimination problem where interleaving should help; memorizing amino-acid structures is vocabulary, where it should hurt. **The correct design is content-type-conditional interleaving, not a global anti-monotony rule.** Meanwhile, "vary the activity type" has no supporting evidence at all — keep it if it helps adherence, but label it as an engagement feature.

5. **Bet 1's real value is in the gap-to-retention-interval ratio, not in the algorithm's sophistication.** Cepeda 2008 gives the operational rule directly: optimal gap falls from ~40% of the retention interval at one week to ~8% at one year. For a 4-month MCAT horizon (~120 days), interpolating between the 70-day (17%) and 350-day (8%) points suggests an optimal gap around **15% of the remaining horizon, or roughly 18 days at the start of prep, compressing as test day approaches** *[own calculation, linear interpolation on Cepeda's four points — treat as an order-of-magnitude guide, not a fitted value]*. Notably, **this rule requires knowing the test date and produces a schedule that contracts over time — the opposite of the expanding intervals both SM-2 and FSRS produce by default.** An MCAT-specific scheduler that anchors on the exam date is a genuinely defensible differentiator, and it is one the generic-flashcard incumbents structurally cannot offer.

6. **The Yang et al. active-control result reframes the entire competitive argument.** Against an idle learner your mechanisms are worth g ≈ 0.6. Against a learner already grinding UWorld and Anki, the best-evidenced mechanism in the whole set is worth g ≈ 0.095 with a confidence interval crossing zero. This does not mean the product is worthless — it means the product's value proposition is *allocation, coverage, and adherence*, not *superior learning per retrieval trial*. Build the pitch around the former and it survives scrutiny; build it around the latter and a competent skeptic dismantles it in one question.

7. **Mastery learning historically bought its gains with extra time, which inverts your core promise.** Kulik et al. explicitly note increased time on instructional tasks. If your planner enforces mastery inside a fixed daily budget, you are running a *different* intervention than the one the meta-analysis measured — one where mastery on skill A is purchased by cutting coverage of skill B. That trade-off is unstudied, and it is the central unvalidated assumption in your design. It is also directly testable in your own telemetry.

8. **The 0.95 threshold's real problem is not that it is arbitrary but that it is coupled to a model with no forgetting term.** BKT assumes learned states are absorbing. Your Bet 1 assumes they decay. Running both means the mastery module and the scheduling module disagree about whether knowledge persists. Pick one memory model and derive both the mastery threshold and the review schedule from it, or expect incoherent behaviour at the seams.

9. **Wheel-spinning (~38% within 10 opportunities) is the highest-severity failure mode in a time-budgeted mastery system.** In a system with no time limit, wheel-spinning wastes time. In a system with a hard daily budget and a fixed exam date, wheel-spinning destroys coverage — an unmasterable skill can consume an entire prep window. A give-up-and-reroute rule is not a nice-to-have; it is load-bearing, and it should be in the design doc as a first-class mechanism rather than an edge case.

10. **The honest efficiency estimate is bounded above by roughly 0.2 SD against structured instruction, and time savings are a better currency than score.** Cognitive Tutor's 0.20 SD after two years is the most favourable large RCT result available for a fully-stacked adaptive system, and ALEKS's 0.05 is the least. If MCAT total-score SD is ≈ 10–11 scaled points, 0.20 SD is about **2 points** *[own calculation; verify the SD against current AAMC percentile tables]*. Two points is commercially meaningful and defensible. "Ten points" is not defensible from any evidence in this review.

---

## What I could not verify

- **Any randomized comparison of FSRS (any version) against SM-2 or a fixed interval schedule on delayed retention or exam outcomes.** I searched specifically for this. The srs-benchmark measures probability calibration on historical logs; it cannot answer whether FSRS's *schedules* produce more learning per minute. Every efficiency figure circulating in the FSRS community that I found is simulation output from FSRS's own memory model, which is circular. If the design doc claims FSRS improves learning outcomes over SM-2, that claim currently has no external evidential support.
- **Whether FSRS-6 specifically (as opposed to FSRS in general) has any peer-reviewed evaluation.** I found none.
- **Any experimental test of varying *activity type* (as opposed to topic or problem type) on learning outcomes.** Doroudi et al. (2015) is correlational log analysis. I could not find an RCT.
- **Any study comparing an error-targeted review policy against uniform review under equal total time.** I could not find one. This is a real gap and the team's Bet 6 rests on inference from feedback and adaptive-scheduling literatures rather than direct evidence.
- **Any evidence that computed prerequisite ordering beats a good expert-authored syllabus.** ALEKS evidence shows the *product* is no better than traditional instruction; it does not isolate the sequencing component. I found no study that isolates it.
- **Whether the 85% rule has ever been tested with human learners on declarative or conceptual material.** Wilson et al.'s empirical support is perceptual learning and animal training. I found no test on the kind of material the MCAT covers.
- **Guskey's mastery-learning syntheses.** Named in the brief; I did not locate and read a primary Guskey meta-analysis in this session and have not cited one. Kulik et al. (1990) and Slavin (1987) cover the same ground with numbers I could verify.
- **Ritter et al. on Cognitive Tutor.** I relied on Pane et al. (2014) for the Cognitive Tutor evidence and did not read Ritter et al. directly.
- **Firth, Rivers & Boyle on interleaving.** I found the work referenced but did not obtain and read the full text; nothing in this review depends on it.
- **Koedinger, Booth & Klahr's instructional-complexity argument** (the "205 trillion instructional design options" figure, *Science*, 2013). I recall this paper and it is directly relevant to the additivity discussion, but I did not open it in this session and have deliberately not cited the figure. Worth retrieving before the design doc is finalized.
- **The full citation for the *Clinical Teacher* spaced-repetition-in-medical-education meta-analysis** (14 studies, 21,415 learners, SMD = 0.78). I have the abstract-level findings but not a confirmed author list and year.
- **The current MCAT total-score standard deviation.** I used ≈ 10–11 scaled points for the DOK-2 conversion. Verify against current AAMC percentile tables before quoting.
- **Whether the Rori/EDM-2025 mastery-threshold finding replicates outside elementary mathematics on a single platform.** The authors themselves flag this as the main limitation.
- **The Duolingo A/B test's learning outcome.** Settles & Meeder report a ~12% engagement gain. I could not find a published measure of whether HLR scheduling improved *learning* at Duolingo.

---

## Sources

Ranked by how much weight this review puts on them.

1. **Yang, C., Luo, L., Vadillo, M. A., Yu, R., & Shanks, D. R. (2021). Testing (quizzing) boosts classroom learning: A systematic and meta-analytic review. *Psychological Bulletin*, 147(4), 399–435.** https://doi.org/10.1037/bul0000309 — **Tier A.** *Read: abstract in full plus targeted reading of the results summary, control-condition moderator, and treatment-duration moderator sections from the author-hosted PDF. Not read cover to cover.* The most load-bearing source here, because the g = 0.095 active-control figure constrains every efficiency claim the product can make.

2. **Pan, S. C., & Rickard, T. C. (2018). Transfer of test-enhanced learning: Meta-analytic review and synthesis. *Psychological Bulletin*, 144(7), 710–756.** https://doi.org/10.1037/bul0000151 — **Tier A.** *Read: abstract in full, plus the category-level results sections for stimulus–response rearrangement, untested materials, application and inference questions, and problem-solving skills, plus the publication-bias discussion. Did not read the full method or discussion.* The only source that directly addresses whether retrieval practice transfers to MCAT-style applied reasoning.

3. **Cepeda, N. J., Vul, E., Rohrer, D., Wixted, J. T., & Pashler, H. (2008). Spacing effects in learning: A temporal ridgeline of optimal retention. *Psychological Science*, 19(11), 1095–1102.** https://doi.org/10.1111/j.1467-9280.2008.02209.x — **Tier A.** *Read: abstract and the full results section including the optimal-gap table and the ridgeline model discussion.* The best adult, long-horizon spacing study in existence and the source of the operational gap-to-retention-interval ratios.

4. **Sun, S., Else-Quest, N. M., Hodges, L. C., French, A. M., & Dowling, R. (2021). The effects of ALEKS on mathematics learning in K-12 and higher education: A meta-analysis. *Investigations in Mathematics Learning*, 13(3), 182–196.** https://doi.org/10.1080/19477503.2021.1926194 — **Tier A** for the null. *Read: abstract only (paywalled).* The single most important additivity datum: a stacked knowledge-space + mastery + adaptive-selection system at g = 0.05.

5. **Pane, J. F., Griffin, B. A., McCaffrey, D. F., & Karam, R. (2014). Effectiveness of Cognitive Tutor Algebra I at scale. *Educational Evaluation and Policy Analysis*, 36(2), 127–144.** https://doi.org/10.3102/0162373713507480 — **Tier A.** *Read: abstract, results sections for both the high-school and middle-school studies, and the discussion of first- versus second-year effects, from the author-posted manuscript.* The upper bound on what a fully stacked adaptive system delivers in a large RCT.

6. **Kulik, C.-L. C., Kulik, J. A., & Bangert-Drowns, R. L. (1990). Effectiveness of mastery learning programs: A meta-analysis. *Review of Educational Research*, 60(2), 265–299.** https://doi.org/10.3102/00346543060002265 — **Tier A** for the headline, **Tier A** for the local-versus-standardized caveat. *Read: abstract, results section on examination performance, the study-features moderator analysis, and the follow-up-examination section.*

7. **Brunmair, M., & Richter, T. (2019). Similarity matters: A meta-analysis of interleaved learning and its moderators. *Psychological Bulletin*, 145(11), 1029–1052.** https://doi.org/10.1037/bul0000209 — **Tier A.** *Read: abstract in full plus the moderator/meta-regression results.* The source of the honest interleaving picture, including the g = −0.39 for word materials.

8. **Karpicke, J. D., & Roediger, H. L. (2008). The critical importance of retrieval for learning. *Science*, 319(5865), 966–968.** https://doi.org/10.1126/science.1152408 — **Tier A.** *Read: abstract and the results paragraph reporting the 80% / 36% / 33% figures, via the full-text PDF.* Directly constrains the mistakes-queue design.

9. **Soderstrom, N. C., Kerr, T. K., & Bjork, R. A. (2016). The critical importance of retrieval—and spacing—for learning. *Psychological Science*, 27(2), 223–230.** https://doi.org/10.1177/0956797615617778 — **Tier A.** *Read: full results and discussion sections from the Bjork Lab PDF.* The cleanest demonstration in this review that two effective mechanisms do not add.

10. **Rohrer, D., Dedrick, R. F., Hartwig, M. K., & Cheung, C.-N. (2020). A randomized controlled trial of interleaved mathematics practice. *Journal of Educational Psychology*, 112(1), 40–52.** https://doi.org/10.1037/edu0000367 — **Tier A.** *Read: abstract and the results section reporting 61% vs 38%, d = 0.83.*

11. **Birnbaum, M. S., Kornell, N., Bjork, E. L., & Bjork, R. A. (2013). Why interleaving enhances inductive learning: The roles of discrimination and retrieval. *Memory & Cognition*, 41(3), 392–402.** https://doi.org/10.3758/s13421-012-0272-7 — **Tier B.** *Read: results and discussion sections including the subadditivity finding and the "spacing harmful when it interrupts juxtaposition" result.* Small lab samples, category-learning materials, but it is the only direct experimental crossing of two of your mechanisms.

12. **Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. *Psychological Bulletin*, 132(3), 354–380.** https://doi.org/10.1037/0033-2909.132.3.354 — **Tier A.** *Read: the eScholarship pre-publication manuscript — abstract, terminology, inclusion criteria, the expanding-versus-fixed-interval section, and the general discussion. Numbers quoted are from that manuscript, which the file itself notes "may differ from the final published version."* Source of the explicit warning about software developers assuming expanding intervals help.

13. **Adesope, O. O., Trevisan, D. A., & Sundararajan, N. (2017). Rethinking the use of tests: A meta-analysis of practice testing. *Review of Educational Research*, 87(3), 659–701.** https://doi.org/10.3102/0034654316689306 — **Tier A.** *Read: abstract plus moderator figures via secondary summaries (Best Evidence in Brief and the sibling review in this repo). Did not read the full article.*

14. **Rowland, C. A. (2014). The effect of testing versus restudy on retention: A meta-analytic review of the testing effect. *Psychological Bulletin*, 140(6), 1432–1463.** https://doi.org/10.1037/a0037559 — **Tier A.** *Read: abstract; the moderator figures quoted here come from the sibling review `../effectiveness-eval/04-comparators-and-the-bar.md` in this repo, which reports having read the paper. I did not independently verify them against the original.*

15. **Mettler, E., Massey, C. M., & Kellman, P. J. (2016). A comparison of adaptive and fixed schedules of practice. *Journal of Experimental Psychology: General*, 145(7), 897–917.** https://doi.org/10.1037/xge0000170 — **Tier B.** *Read: abstract, method, results (including the effect-size comparisons), and the initial-spacing-interval discussion, from the full-text PDF.*

16. **Eglington, L. G., & Pavlik, P. I. (2020). Optimizing practice scheduling requires quantitative tracking of individual item performance. *npj Science of Learning*, 5, 15.** https://doi.org/10.1038/s41539-020-00074-4 — **Tier B.** *Read: abstract and results including the OET-86 / OET-94 comparisons and the d = 0.64 figure.*

17. **Corbett, A. T., & Anderson, J. R. (1995). Knowledge tracing: Modeling the acquisition of procedural knowledge. *User Modeling and User-Adapted Interaction*, 4(4), 253–278.** https://doi.org/10.1007/BF01099821 — **Tier A** as the origin of the 0.95 convention. *Read: abstract only. The 0.95 criterion, the 86%/81% and 71%/62% calibration figures, and the r = 0.66 / 0.74 correlations come from Corbett & Anderson's own later AAAI-style paper "Cognitive Mastery Learning in the ACT Programming Tutor," which I read in excerpt form, and from a 2019 conference paper by Scruggs, Baker & McLaren discussing the over-prediction result.*

18. **Slavin, R. E. (1987). Mastery learning reconsidered. *Review of Educational Research*, 57(2), 175–213.** https://doi.org/10.3102/00346543057002175 — **Tier A** for the standardized-test null. *Read: abstract and secondary summaries only.*

19. **Wilson, R. C., Shenhav, A., Straccia, M., & Cohen, J. D. (2019). The Eighty Five Percent Rule for optimal learning. *Nature Communications*, 10, 4646.** https://doi.org/10.1038/s41467-019-12552-4 — **Tier B** for the mathematics, **Tier C** as applied to exam-item selection. *Read: abstract and the derivation sections defining ε* ≈ 0.1587 and the constancy of optimal difficulty with respect to precision.*

20. **Ma, W., Adesope, O. O., Nesbit, J. C., & Liu, Q. (2014). Intelligent tutoring systems and learning outcomes: A meta-analysis. *Journal of Educational Psychology*, 106(4), 901–918.** https://doi.org/10.1037/a0037123 — **Tier A.** *Read: abstract only.*

21. **VanLehn, K. (2011). The relative effectiveness of human tutoring, intelligent tutoring systems, and other tutoring systems. *Educational Psychologist*, 46(4), 197–221.** https://doi.org/10.1080/00461520.2011.611369 — **Tier A.** *Read: abstract and the summary effect-size table via a conference-presentation PDF.*

22. **Doroudi, S., Aleven, V., & Brunskill, E. (2019). Where's the reward? A review of reinforcement learning for instructional sequencing. *International Journal of Artificial Intelligence in Education*, 29, 568–620.** https://doi.org/10.1007/s40593-019-00187-x — **Tier B.** *Read: abstract and the summary of study clusters. Did not read the full review.*

23. **Fang, Y., Ren, Z., Hu, X., & Graesser, A. C. (2019). A meta-analysis of the effectiveness of ALEKS on learning. *Educational Psychology*, 39(10), 1278–1292.** https://doi.org/10.1080/01443410.2018.1495829 — **Tier B.** *Read: abstract only.*

24. **Phillips, A., Pane, J. F., Reumann-Moore, R., & Shenbanjo, O. (2020). Implementing an adaptive intelligent tutoring system as an instructional supplement. *Educational Technology Research and Development*, 68, 1409–1437.** ERIC full text: https://files.eric.ed.gov/fulltext/ED604053.pdf — **Tier B.** *Read: the present-study section and the implementation/limitations discussion from the ERIC preprint; the outcomes are reported in summary form there ("no significant effect on an end-of-course algebra exam") with the full outcomes study published separately.*

25. **Settles, B., & Meeder, B. (2016). A trainable spaced repetition model for language learning. *Proceedings of ACL 2016*, 1848–1858.** https://aclanthology.org/P16-1174/ — **Tier B** (peer-reviewed conference paper; the data and product are Duolingo's, so treat the A/B result as company-reported). *Read: full paper text including Table 2 metrics and the user-experiment section.*

26. **Beck, J. E., & Gong, Y. (2013). Wheel-spinning: Students who fail to master a skill. *AIED 2013*, LNCS 7926, 431–440.** https://doi.org/10.1007/978-3-642-39112-5_44 — **Tier B.** *Read: abstract only. The ~38% figure comes from a Journal of Educational Data Mining paper by Kai, Baker and colleagues ("Decision tree modeling of wheel-spinning and productive persistence") describing Beck & Gong's result, which I read in the relevant passage; I did not confirm that paper's full author list.*

27. **Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. *Psychological Science*, 17(3), 249–255.** https://doi.org/10.1111/j.1467-9280.2006.01693.x — **Tier A.** *Read: abstract and the Experiment 1 results.*

28. **Kulik, J. A., & Kulik, C.-L. C. (1988). Timing of feedback and verbal learning. *Review of Educational Research*, 58(1), 79–97.** https://doi.org/10.3102/00346543058001079 — **Tier B.** *Read: abstract only.*

29. **Metcalfe, J. (2017). Learning from errors. *Annual Review of Psychology*, 68, 465–489.** https://doi.org/10.1146/annurev-psych-010416-044022 — **Tier A** for the phenomenon. *Read: abstract and partial full text on feedback timing and hypercorrection.*

30. **Karpicke, J. D., & Roediger, H. L. (2007). Expanding retrieval practice promotes short-term retention, but equally spaced retrieval enhances long-term retention. *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 33(4), 704–719.** https://doi.org/10.1037/0278-7393.33.4.704 — **Tier A.** *Read: abstract only, plus Mettler et al.'s and Cepeda et al.'s descriptions of the result.*

31. **Lindsey, R. V., Shroyer, J. D., Pashler, H., & Mozer, M. C. (2014). Improving students' long-term knowledge retention through personalized review. *Psychological Science*, 25(3), 639–647.** https://doi.org/10.1177/0956797613504302 — **Tier B.** *Read: abstract and results excerpt.*

32. **Doroudi, S., Holstein, K., Aleven, V., & Brunskill, E. (2015). Towards understanding how to leverage sense-making, induction and refinement, and fluency to improve robust learning. *EDM 2015*.** https://files.eric.ed.gov/fulltext/ED560506.pdf — **Tier C.** *Read: abstract and the results passage on fluency-building activities.* The only source I found bearing on activity-type sequencing, and it is correlational.

33. **"How much mastery is enough mastery?" (2025). *Educational Data Mining* conference paper, analysing the Rori math tutor.** — **Tier C.** *Read: introduction, results tables, and discussion from the full text.* Single platform, elementary mathematics, correlational; the only direct empirical interrogation of the 0.95 threshold I could find. Full author list not captured in my retrieval; **verify the citation before quoting it externally.**

34. **open-spaced-repetition/srs-benchmark (community benchmark, not peer reviewed).** https://github.com/open-spaced-repetition/srs-benchmark — **Tier B** for calibration claims, **Tier C** for learning claims. *Read: the full README including methodology, dataset description, and the "without same-day reviews" results table.* Maintained by the FSRS authors; treat as a self-evaluation.

35. **Systematic review and meta-analysis of spaced repetition in medical education, *The Clinical Teacher* (recent; 14 studies, 21,415 learners, SMD = 0.78 [0.56, 0.99]).** — **Tier B/C.** *Read: abstract only, and I did not capture a confirmed author list or publication year.* Comparator ("standard studying techniques") is heterogeneous and vaguely specified; do not lean on the SMD = 0.78, and **verify the citation before quoting it externally.**

36. **Buehler, R., Griffin, D., & Ross, M. (1994). Exploring the "planning fallacy": Why people underestimate their task completion times. *Journal of Personality and Social Psychology*, 67(3), 366–381.** https://doi.org/10.1037/0022-3514.67.3.366 — **Tier A** for the phenomenon. *Read: abstract only.*

37. **PLOS ONE analysis of self-reported versus logged study time** (students overestimate by a median of ~45%). — **Tier B.** *Read: the results passage reporting the 45% median overestimate; I did not capture the full citation and could not confirm the author list. **Verify before quoting.***

38. **Noh, S. M., Yan, V. X., Bjork, R. A., & Maddox, W. T. (2016). Optimal sequencing during category learning: Testing an implicit dual-learning-system account. *Cognition*, 155, 23–29.** https://doi.org/10.1016/j.cognition.2016.06.007 — **Tier B.** *Read: abstract only, and the summary in the sibling repo review.*

39. **Sibling review in this repo: `../effectiveness-eval/04-comparators-and-the-bar.md`.** Used for the Rowland moderator breakdown, the Adesope moderator breakdown, the Carvalho & Goldstone / Sequential Attention Theory framing, and the LISP-tutor time-savings figure. *Read: in full.* Where I relied on it rather than on the primary source, I have said so above.
