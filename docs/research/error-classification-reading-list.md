# Error classification: what the literature supports

**Question.** How should a learning system classify a learner's errors, and how reliable is any such classification?

**Provenance convention.** `[read]` = I retrieved and read the full text (or the specific results sections cited). `[abstract]` = I saw the abstract, or a verbatim results passage returned by search, but not the full paper. `[secondary]` = I am relying on another paper's description. Where I read only part of a full text, I say so inline. Numbers are quoted as printed in the source; where a source is internally inconsistent I flag it rather than pick.

---

## Headline answer

The evidence does not support classifying errors by **cause**. It does support classifying errors by **content**.

Three findings drive this:

1. **Cause attribution has near-zero inter-rater reliability when tested directly.** The only study I found that put the same errors in front of raters under manipulated outcome knowledge found κ between 0.000 and 0.063 across six named error causes — chance agreement — and found that knowing the case ended badly inflated the number of causes raters "detected" from 1.75 to 3.44 (Zwaan et al. 2017).

2. **Learner self-attribution is systematically biased toward the trivial, and worst where it matters most.** Physics students who used a non-force as a force in their solution later wrote off the error as "a minor math mistake" (Yerushalmi et al. 2012). College algebra students agreed with expert classification of their own errors only **42%** of the time in the planning phase — the phase where every error was conceptual — while calling **81%** of their execution errors "simple" against an expert rate of 40% (Pilgrim et al. 2025). Self-assessment as a whole correlates with performance at about r = .29 (Zell & Krizan 2014).

3. **The one machine-inferable distinction that works — "the learner knew this and erred anyway" — works only as a continuous, low-confidence per-action estimate, and even the researchers who built it disagree about what it measures.** Two published operationalizations of carelessness correlate at −0.21 to −0.23 with each other, and predict post-test scores in *opposite directions* (Zhang et al. 2025).

Meanwhile, distractor-level content diagnosis (which wrong idea did the learner hold) is the best-validated signal in the whole area, and it is a claim about *what* the learner believes, not *why* they got it wrong.

**Recommended posture:** classify errors along one dimension the system can observe reliably (which distractor / which misconception), keep the cause dimension to at most a two-way soft split used for scheduling rather than for messaging, and never ask the learner "was that careless?" as an input to the model.

---

## Q1. What error taxonomies exist, and which are validated?

### Brown, J. S., & Burton, R. R. (1978). *Diagnostic Models for Procedural Bugs in Basic Mathematical Skills.* Cognitive Science, 2(2), 155–192. Also ERIC ED159036 / BBN Report 3669.
URL: https://onlinelibrary.wiley.com/doi/10.1207/s15516709cog0202_4 · https://eric.ed.gov/?id=ED159036
**[abstract]** — I retrieved the ERIC report but read only the abstract and framing sections.

**DOK 1.** Proposes that systematic subtraction errors arise from "bugs" — small, deterministic perturbations of a correct procedure — rather than from random noise or absent knowledge. The BUGGY/DEBUGGY system encodes a procedural network for multi-column subtraction and searches combinations of bugs to explain a student's answer pattern. The reported empirical base is on the order of 1,300 students and 20,000 test items, with roughly 110 distinct bug types catalogued for subtraction alone.

**DOK 2.** Licenses the idea that a wrong answer can carry diagnostic information about the *procedure* the learner ran, and that this information is recoverable from answer patterns alone without asking the learner anything. Does **not** license transfer to MCAT-style content: subtraction is a closed, fully specified algorithm where the space of possible perturbations is enumerable. Amino acid classification, acid–base equilibria, or a CARS inference question have no such procedural skeleton, so there is no "bug library" to search. It also does not license the claim that bugs are stable — Brown & Burton assumed stability; VanLehn later measured it (below).

**Limitations.** Domain-specific by construction. The bug catalogue was built by hand from observed error patterns, so it is descriptively fitted to its own dataset. No control condition; no evidence in this paper that bug-level diagnosis improved instruction.

---

### VanLehn, K. (1982). *Bugs Are Not Enough: Empirical Studies of Bugs, Impasses and Repairs in Procedural Skills.* Xerox PARC CIS-11 / ERIC ED245880.
URL: https://eric.ed.gov/?id=ED245880 (full-text PDF available from ERIC)
**[read]** — I read the introduction, the Southbay study design, and the results tables. The scan is OCR-degraded; one figure is internally inconsistent and I flag it below.

This is the single most important source in the set, because it is the one paper that took a bug taxonomy seriously enough to test whether it holds up across occasions.

**DOK 1.** Sample: 925 students studying subtraction; the main "Southbay" study ran 849 students during 1979–80, with 154 retested months later and a short-term subsample retested Monday/Wednesday of the same week.

Single-test classification of third graders tested late in the year:
- **50%** appear to know the correct algorithm; their errors are attributable to slips alone
- **30%** have a bug or set of bugs
- **10%** are "tinkering"
- **10%** produce errors that cannot be analyzed at all

Early in third grade the buggy category exceeds 50%; it shrinks as instruction proceeds.

Two-test stability (the crucial result):
- 4% made no errors on either test
- **50%** stably executed the correct procedure, differences attributable to slips alone
- **12%** had stable bugs
- **12%** had stable impasses
- **12%** had bugs and/or impasses that appeared or disappeared between tests
- **10%** produced errors on one or both tests that could not be analyzed

So 78% of students conformed to the theory's expectations and **22% did not**. VanLehn states directly that "a third of the students who committed errors could not be modelled with bugs and slips."

Other figures:
- **182 of 895** (20%) of third/fourth/fifth graders were diagnosed as knowing the correct algorithm but making one or more slips.
- Of students who answered every problem correctly on one day, roughly **half** made slips on the other day.
- **150 of 417** (36%) of students diagnosed with bugs required a multi-bug diagnosis.
- Bug migration: of 67 students tested twice, only **12** were diagnosed with bugs on both occasions, and **2 of those 12 (17%)** showed bug migration (a different bug the second time).
- Tinkering: hand analysis of 120 students revealed 14 tinkerers. *The OCR renders the accompanying percentage as "(1%)", which is inconsistent with 14/120 ≈ 12%. Treat the printed percentage as unreliable; the raw counts are legible.*
- DEBUGGY's automated diagnosis is described as "as good as or better than human diagnosticians" on the same protocols.

**DOK 2.** This is the strongest available evidence that *the modal error is a slip, not a bug*, even in a domain purpose-built for bug analysis. If half of students in the most enumerable procedural domain in education are best modelled as "knows the procedure, erred anyway," then in MCAT content — where procedures are less crisp and content knowledge is broader — a system should default to treating an isolated error as uninformative about cause.

It also sets a hard ceiling on classification coverage: **a third of erring students were unclassifiable** by a taxonomy built specifically for their domain by the people who invented the taxonomy. Any product claim of the form "we tell you why you got it wrong" needs a comparably large "we don't know" bucket, and the honest size of that bucket is somewhere around a third.

What it does **not** license: reading the 50%-slip figure as "half of errors are careless and therefore ignorable." VanLehn's slip category is a residual — it is where students land when no bug explains their pattern. The category is defined by the failure of the alternative, not by positive evidence of carelessness.

**Limitations.** Single domain (subtraction), single era, elementary students. Paper-and-pencil tests, not interactive. The stability estimates depend on DEBUGGY's diagnostic choices, so "stable bug" partly means "stable given this analyzer."

---

### Reason, J. (1990). *Human Error*, Ch. 3: "Performance levels and error types" (the GEMS framework). Cambridge University Press.
URL: Book DOI https://doi.org/10.1017/CBO9781139062367 (chapter 3 is listed on the Cambridge Core book page; I do not have a verified direct chapter URL and have not invented one)
**[abstract]** — chapter summary and book front matter only.

**DOK 1.** GEMS ("Generic Error-Modelling System") maps error types onto Rasmussen's skill/rule/knowledge performance levels: **slips and lapses** (execution failures at the skill-based level — the intention was right, the action or memory failed), **rule-based mistakes** (a good rule misapplied, or a bad rule applied), and **knowledge-based mistakes** (reasoning failure in a novel situation where no rule exists). The slip/mistake distinction is defined by whether the *intention* was correct.

**DOK 2.** The slip/mistake distinction is the conceptual backbone of essentially every education error taxonomy that followed, and it is genuinely useful as a *design* distinction: a slip implies the knowledge is present and the fix is procedural (slow down, check, change the interface), a mistake implies the knowledge is wrong and the fix is instructional. What GEMS does **not** provide is any method for telling them apart from the outside. Reason's own diagnostic route is intention-report — asking the actor what they meant to do — which is exactly the channel Q2 shows to be unreliable in learners.

**Limitations.** Theoretical framework derived from industrial-accident case analysis, not a measurement instrument. It was never validated against ground truth because in Reason's domain there is no ground truth either. Applications in acute care have reported difficulty fitting observed errors into GEMS categories without adding new ones, and a predominance of rule-based mistakes that may reflect coder default rather than reality.

---

### Ellerton, N. F., & Clements, M. A. (1996). *Newman error analysis: A comparative study involving Year 7 students in Malaysia and Australia.* In Clarkson (Ed.), Technology and Mathematics Education, MERGA.
URL: https://files.eric.ed.gov/fulltext/ED419719.pdf (in the MERGA proceedings collection) · Newman's original: Newman, M. A. (1977). *An analysis of sixth-grade pupils' errors on written mathematical tasks.* Victorian Institute for Educational Research Bulletin, 39, 31–43.
**[read]** — read results tables and discussion.

The Newman hierarchy is the most-used error taxonomy in mathematics education: **Reading → Comprehension → Transformation → Process Skills → Encoding**, plus a parallel **Careless** category. It is applied by interviewing the student and asking them to re-read and re-attempt.

**DOK 1.** 206 Year 7 students (145 Malaysia, 61 Australia) on 24 questions.

| Category | Malaysia (n=1,463 errors) | Australia (n=493 errors) |
|---|---|---|
| Reading | 3% | 1% |
| Comprehension | 25% | 12% |
| Transformation | 46% | 44% |
| Process Skills | 3% | 14% |
| Encoding | 5% | 4% |
| **Careless** | **18%** | **24%** |

About 70% of all errors fell into Comprehension + Transformation + Careless.

Two dispersion findings matter more than the headline distribution:
- **Between students:** one Malaysian rural student made 9 careless errors out of 17 total; three other students in the same sample made **0** careless errors out of 23, 24, and 24 errors respectively.
- **Between items:** the careless share of errors on a single question ranged from **1% to 71%** depending on which question it was.

Across the Newman literature, Reading errors run ≤2% in every study except Clarkson (1983) and Newman (1977a), which report ~12%.

**DOK 2.** The item-level range (1% → 71%) is the finding to internalize. "Careless error rate" is not primarily a learner property; it is largely an item property. A system that reports "you make a lot of careless errors" is, to a substantial degree, reporting on the items it happened to serve. Before shipping any per-learner error-type profile, the variance decomposition (learner vs item vs occasion) has to be run on our own bank, and the Ellerton & Clements data predicts item variance will dominate.

Also note that Newman classification **requires an interview** — the classifier asks the student to re-read the question aloud and re-attempt. Our system has no equivalent channel. Every published Newman percentage is therefore an upper bound on what an automated version could achieve.

**Limitations.** Two convenience samples, one country pair, one grade level, arithmetic word problems. The categories are hierarchical by construction (an error is assigned to the first stage that fails), so the distribution is partly an artefact of the coding rule. Inter-rater reliability is not reported in this paper.

---

### Clements, M. A. (1982). *Careless errors made by sixth-grade children on written mathematical tasks.* Journal for Research in Mathematics Education, 13(2), 136–144.
URL: https://doi.org/10.5951/jresematheduc.13.2.0136 · https://www.jstor.org/stable/748360
**[abstract]**

**DOK 1.** 50 sixth-grade children in Lae, Papua New Guinea. Careless errors were operationalized behaviourally: an error is careless if, when asked to re-attempt the same item under interview conditions, the child gets it right without help. Approximately **21%** of all errors met this criterion. The proportion of a child's errors that were careless correlated **positively** with arithmetical competence, mathematical-language competence, and mathematical confidence, and **negatively** with "misplaced confidence."

**DOK 2.** This is the cleanest operational definition of "careless" available: *reversible on immediate re-attempt without instruction*. It is testable in our system — re-serve the item soon after and see whether the learner self-corrects — and that is a far better basis for a "slip" label than a self-report or a response-time heuristic. The positive correlation with competence also matters commercially: careless errors are what *strong* learners make. A system that flags carelessness is disproportionately going to flag the learners who are doing well.

**Limitations.** n=50, one school, one country, 1982, arithmetic. The re-attempt criterion conflates a true slip with "seeing the item a second time was enough of a hint." No test–retest of the careless *rate* across separated occasions, so this does not establish carelessness as a stable trait.

---

### Sadler, P. M. (1998). *Psychometric models of student conceptions in science: Reconciling qualitative studies and distractor-driven assessment instruments.* Journal of Research in Science Teaching, 35(3), 265–296.
URL: https://doi.org/10.1002/(SICI)1098-2736(199803)35:3<265::AID-TEA3>3.0.CO;2-P
**[abstract]**

**DOK 1.** 1,250 students in grades 8–12, tested twice, on astronomy concepts. Distractors were written from interview-derived misconceptions, and each distractor was modelled with its own item-response curve. The key result is that **the probability of choosing a particular misconception-based distractor rises with ability before it falls** — instruction first strengthens support for the alternative conception, and only later does preference for it decline.

**DOK 2.** This is the strongest support in the set for **content-based** (as opposed to cause-based) error classification: which distractor a learner picks is informative, modellable, and behaves lawfully with ability. It licenses building a per-distractor misconception map for high-traffic MCAT items.

It also carries a sharp warning for adaptive remediation: because misconception endorsement is *non-monotonic* in ability, "learner picked distractor C" does not mean "learner is weak." It can mean the learner has advanced far enough to find the sophisticated wrong answer attractive. Any rule of the form "picked the misconception distractor → send remedial content" will mis-serve the learners on the upslope.

**Limitations.** One science domain, one instrument family. Requires per-distractor calibration data at a volume most banks do not have; Sadler's curves are estimated from a purpose-built instrument, not an operational bank.

---

### Wells, J., Henderson, R., Stewart, J., Stewart, G., Yang, J., & Traxler, A. (2019). *Exploring the structure of misconceptions in the Force Concept Inventory with modified module analysis.* Physical Review Physics Education Research, 15, 020122.
URL: https://doi.org/10.1103/PhysRevPhysEducRes.15.020122
**[abstract]**

**DOK 1.** Network analysis of FCI incorrect-answer co-selection. The reported conclusion is that "student misconceptions exist relatively independently as small groups of consistent answers, not as part of a larger coherent framework" — incorrect responses cluster into small local groups rather than into a few broad conceptual factors.

**DOK 2.** Cuts against building a small number of broad "misconception profiles." If wrong ideas are locally clustered and largely independent, then the natural unit of content-based error classification is the **item-and-distractor**, not a global learner-level misconception taxonomy. That argues for a wide, shallow map (many specific wrong ideas, each attached to specific items) rather than a deep hierarchical taxonomy.

**Limitations.** Single instrument (FCI), single domain. Method is exploratory network analysis; cluster structure is somewhat sensitive to thresholding choices.

---

## Q2. How accurately can learners self-classify their own errors?

Short answer: poorly, and with a directional bias toward calling conceptual failures trivial.

### Yerushalmi, E., Mason, A., Cohen, E., & Singh, C. (2012). *Effect of self-diagnosis on subsequent problem solving performance* / Part II: *Self-diagnosis and problem-solving performance.* Physical Review Special Topics – Physics Education Research, 8, 020109 (and companion 020108).
URL: https://doi.org/10.1103/PhysRevSTPER.8.020109 · arXiv: https://arxiv.org/abs/1603.04010
**[read]**

**DOK 1.** ~200 students in a calculus-based introductory physics course for premedical students (directly relevant population). Four recitation groups with different self-diagnosis scaffolding: A′ (control, n=41/40 across two TAs), B (self-diagnosis with rubric, n=31/27), C (n=26/21), D (n=23/22).

Self-diagnosis quality scores on the typical problem: **B 0.57, C 0.59, D 0.63** (standard errors 0.06–0.07). ANOVA found no significant differences between the scaffolding conditions, p > 0.05. On the atypical problem the scores diverged sharply: **B 0.73, C 0.57, D 0.24**.

Correlations, typical problem: pre-test vs self-diagnosis score B 0.34 (p = .06), C 0.30 (p = .13), D 0.21 (p = .34). Self-diagnosis vs post-test: B **−0.26** (p = .18), C 0.29 (p = .20), D 0.54 (p = .01). Control-group pre vs post: 0.54 (p = .0003). Atypical problem, self-diagnosis vs post-test: B 0.35 (p = .16), C 0.14 (p = .55), D 0.11 (p = .71) — none significant. Inter-rater reliability was 80% agreement before discussion on a 20% subsample.

The critical qualitative finding, stated in the paper: on quiz 6, many students who had treated centripetal force as a physical force in their solution **later dismissed it in their self-diagnosis as a minor "math" mistake**. Students were markedly better at diagnosing "invoking" deficiencies (failure to bring up the right principle) than "applying" deficiencies (bringing up the right principle and using it wrong).

**DOK 2.** Direct evidence for the exact failure mode the research question asks about: a genuine conceptual error being self-labelled as a trivial execution error. And it is not a small subset — it is described as the modal response to that item.

Consequences for design: (a) never accept a learner's "careless" tag as a model input; (b) if you show the learner a cause label at all, the danger is not that they disagree, it's that they *agree too readily* with the flattering one; (c) the self-diagnosis-to-post-test correlations are inconsistent in sign and mostly non-significant, so the quality of a learner's self-diagnosis is not even a usable proxy for their learning.

**Limitations.** Single institution, single course, group sizes of 21–41, so the correlation estimates are noisy — one condition's SD-to-post correlation is −0.26 and another's is +0.54 on the same problem, which is what n≈25 buys you. Self-diagnosis was scored by human raters against a rubric with 80% pre-discussion agreement, i.e., the "ground truth" for self-diagnosis quality is itself a judgement.

---

### Zell, E., & Krizan, Z. (2014). *Do people have insight into their abilities? A metasynthesis.* Perspectives on Psychological Science, 9(2), 111–125.
URL: https://doi.org/10.1177/1745691613518075
**[abstract]**

**DOK 1.** Synthesis of **22 meta-analyses** covering self-evaluation vs objective performance. Mean correlation **r = .29 (SD = .11)**; individual meta-analytic effects ranged from **.09 to .63**. Insight was stronger for domain-specific (vs global) judgements, objective (vs subjective) criteria, familiar (vs unfamiliar) tasks, and low-complexity (vs high-complexity) tasks.

**DOK 2.** Sets the ceiling for any self-report channel: self-assessment shares roughly 8% of variance with performance. That is not zero — the moderators say a narrow, concrete, familiar, low-complexity judgement does better — which is an argument for asking learners *specific* questions ("did you know what the question was asking?") rather than global ones ("was that careless?"). But it does not support treating self-report as a measurement.

**Limitations.** Meta-synthesis of meta-analyses, so it inherits every primary-study weakness and averages across wildly heterogeneous domains (athletic, academic, medical, interpersonal). It measures insight into *ability*, not insight into the cause of a specific error, which is a harder judgement.

---

### León, S. P., Panadero, E., & García-Martínez, I. (2023). *How Accurate Are Our Students? A Meta-analytic Systematic Review on Self-assessment Scoring Accuracy.* Educational Psychology Review, 35, 106.
URL: https://doi.org/10.1007/s10648-023-09819-0
**[abstract]** — I read the abstract and a verbatim results passage; not the full text.

**DOK 1.** 160 papers reviewed. Correlational meta-analysis on 167 effect sizes: after outlier removal, **Fisher's z = 0.472, 95% CI [0.411, 0.533], I² = 85.26%**. Mean-difference analysis: **g′ = 0.206, 95% CI [0.061, 0.351], I² = 97.00%**, indicating a slight overestimation by students relative to teacher scores.

**DOK 2.** Self-assessment of *scores* is moderately accurate (z ≈ 0.47 → r ≈ 0.44), better than the general self-insight literature, with a small positive bias. This is worth separating from Q2's actual question: learners are mediocre-to-decent at "how well did I do," and much worse at "why did I get it wrong." Design implication: a confidence or self-score rating is a defensible input; a self-attributed cause is not.

**Limitations.** I² of 85–97% is extreme heterogeneity — the pooled point estimates are close to uninterpretable as a single number. The criterion is teacher score, which is itself fallible. Mostly non-MCQ, non-high-stakes contexts.

---

### Pilgrim, M. E., Burks, L. C., Ryals, M., & Hill-Lindsay, S. (2025). *College algebra students' perceptions of exam errors and the problem-solving process.* Frontiers in Education, 10, 1359713.
URL: https://doi.org/10.3389/feduc.2025.1359713
**[read]**

This is the most direct measurement I found of learner-vs-expert agreement on error classification in an educational setting.

**DOK 1.** 8 students in a College Algebra support course at a large public Hispanic-Serving Institution, interviewed ~30 minutes each after Exam 1 (13 open-response + 8 multiple-choice questions). Students classified each of their own errors as "simple" or "not simple" without being given definitions; researchers independently classified the same errors beforehand, using the criterion that a simple mistake "could be made accidentally, would likely not be repeated, or violated a mathematical convention rather than a rule," while a not-simple mistake "emerges from a lack of conceptual understanding."

Student–researcher agreement by problem-solving phase:
- **Orienting: 73%**
- **Planning: 42%**
- **Executing: 55%**
- **Checking: 100%** (few errors; students only raised checking when they had checked)

Direction of disagreement in the executing phase: students called **81%** of their executing errors simple; researchers called about **40%** simple and **60%** not simple.

Individual cases showing the spread:
- Student R (course grade A): 5 errors total, **complete agreement** with researchers (4 simple, 1 not simple).
- Student C (course grade D): 15 errors; the student called **8** simple, researchers called **1** simple — i.e. researchers judged **14 of 15** not simple. On the 8 planning errors researchers classified all as not simple; the student called 5 of them simple.

The authors note that students with grades of D and F had more of their errors in the orienting and planning phases and "classified several of these mistakes as being simple," whereas higher-performing students' errors clustered in executing and checking.

**DOK 2.** This quantifies the exact bias the research question asks about, and adds a damaging wrinkle: **self-classification accuracy is worst precisely where a conceptual error is most likely.** Agreement was 73% in orienting (where students correctly recognize they were lost) but 42% in planning — the phase where every error was conceptual by the researchers' judgement, and where students called nearly half of them simple. And the students who over-called "simple" most were the ones failing the course.

So an adaptive system that accepts self-reported "careless" would systematically *under*-remediate the weakest learners on the most conceptual errors. That is close to the worst possible failure mode for an MCAT product, and it is a reason to not offer the self-tag at all rather than to offer it with a caveat.

**Limitations.** n=8, one course, one exam, volunteers who were incentivized with a free review session. The "researcher" classification is the criterion but is itself a judgement, and the researchers set the definitions — so this measures agreement with one lab's rubric, not with truth. Agreement percentages are computed over errors, not students, and error counts per student range from 5 to 15, so a couple of prolific error-makers dominate. The interviewer also reviewed problems with students during the interview, which may have shifted classifications mid-stream. Treat the percentages as indicative of direction and rough magnitude, not as population estimates.

---

### Ryals, M., Hill-Lindsay, S., Pilgrim, M. E., & Burks, L. C. (2025). *'Simple Mistakes' in College Algebra: an Analysis of Students' Perceptions of Their Errors Using Attribution Theory.* International Journal of Research in Undergraduate Mathematics Education.
URL: https://doi.org/10.1007/s40753-025-00269-3
**[read]**

Companion paper to the above, same 8 interviews, analysed through attribution theory rather than problem-solving phase.

**DOK 1.** Students' simple/not-simple distinctions were governed by **controllability and stability** (Weiner's causal dimensions); locus did *not* emerge as a factor, since students rarely attributed errors to unstable external causes like bad luck or an unfair exam. Three distinct categories of student distinction were identified across the 8 participants, and students within a category shared self-efficacy and persistence patterns. Across all categories, students believed simple mistakes are fixable by "repetitive practice or memorization" while not-simple mistakes require help-seeking. The authors' stated conclusion: "different students can use the same language to convey very different meanings for their own error categorizations and ... there is need for instructors to probe these meanings before providing guidance."

**DOK 2.** Explains the mechanism behind the agreement failures above. When a learner says "careless," they are making an *attributional* judgement about controllability and stability — a self-concept judgement — not a diagnostic one about cognition. So even a perfectly honest, well-intentioned learner is answering a different question than the one the system is asking, and two learners using the identical word mean different things.

The practical consequence for a product: a self-report field labelled "careless mistake" does not collect a variable. It collects an unknown mixture of several variables that differs per learner, which cannot be pooled across learners into a model input. The remediation asymmetry students believe in (drill for simple, help-seeking for not-simple) also means a mis-tagged conceptual error routes the learner to exactly the wrong treatment.

**Limitations.** n=8, qualitative, explicitly no generalizability claim ("we do not claim the groups of students we have identified are exhaustive or representative"). Single institution, single course, students pre-identified as having weak prerequisites. I include this for the mechanism and the construct-validity point, not for any rate.

---

### Butterfield, B., & Metcalfe, J. (2001, 2006). *Errors committed with high confidence are hypercorrected.* Journal of Experimental Psychology: LMC, 27(6), 1491–1494; and *The correction of errors committed with high confidence.* Metacognition and Learning, 1, 69–84.
URL: https://doi.org/10.1037/0278-7393.27.6.1491 · https://doi.org/10.1007/s11409-006-6894-z
**[abstract]**

**DOK 1.** Errors made with **high** confidence are more likely to be corrected after feedback than errors made with low confidence — the hypercorrection effect. In the 2006 study, the gamma correlation between confidence in the error and subsequent correction was **+.13, t(35) = 2.5, p < .05**.

**DOK 2.** A confidence rating collected at answer time has demonstrated downstream value, and it points the *opposite* way from intuition: the high-confidence error is the more tractable one, not the more entrenched one. If we collect confidence, the scheduling implication is that high-confidence errors deserve immediate elaborated feedback (they are ripe for correction), while low-confidence errors are closer to plain not-knowing and need instruction.

Note this is a claim about confidence as a *predictor of correction*, not about confidence as a cause classifier. It does not license "high confidence + wrong = misconception, low confidence + wrong = guess."

**Limitations.** Small lab samples (t(35) implies n=36 in the cited analysis), general-knowledge trivia materials, immediate retest. gamma = .13 is a weak effect. Replications exist but I did not verify a meta-analysis of them.

---

## Q3. How accurately can a system infer error cause from observables?

### Baker, R. S. J. d., Corbett, A. T., & Aleven, V. (2008). *More Accurate Student Modeling through Contextual Estimation of Slip and Guess Probabilities in Bayesian Knowledge Tracing.* ITS 2008, LNCS 5091, 406–415.
URL: https://doi.org/10.1007/978-3-540-69132-7_44 · PDF: https://www.upenn.edu/learninganalytics/ryanbaker/BKT-BF.pdf
**[read]**

This is the foundational "infer slip from data" paper.

**DOK 1.** **171,989** student first-actions across **253** skills in a middle-school Cognitive Tutor unit. Rather than fitting one guess and one slip parameter per skill, the model estimates P(guess) and P(slip) *per action* from contextual features (response time, prior help requests, recent error patterns), using future correctness as the training label.

Predictive performance on held-out data:

| Model | A′ | r |
|---|---|---|
| Baseline BKT | 0.66 | 0.29 |
| Bounded guess/slip | 0.61 | 0.25 |
| Dirichlet priors | 0.65 | 0.26 |
| **Contextual Guess and Slip** | **0.75** | **0.43** |

The contextual model captured **27%** of the possible improvement over baseline in A′, and its correlation was **48% higher** than baseline. The internal ML models predicting guess and slip achieved r = 0.44 (guess) and r = 0.38 (slip) under 10-fold cross-validation.

Degeneracy (parameters implying that knowing the skill makes you *less* likely to answer correctly): the contextual model failed the first degeneracy test on 1 of 2,558 cases and the second on **13 of 758 (1.7%)**; the Dirichlet and baseline models failed the second test on **23%** of skills. The contextual model uses 2 parameters per skill plus 27 global parameters, averaging 2.11 parameters per skill.

**DOK 2.** A′ = 0.75 for predicting the *next action* is a real improvement but is not diagnostic-grade for a per-error label. Note carefully what is validated here: the model predicts **future correctness better**, which is evidence the slip estimate carries information — it is *not* evidence that any individual action labelled "slip" was in fact a slip. There is no ground truth in this study.

Design read: use contextual slip as a continuous input to *scheduling* (how soon to re-serve this item), never as a categorical claim shown to the learner.

**Limitations.** No ground truth; the label is future correctness, which is circular for our purposes. Single tutor, single domain (middle-school math), single unit. The 23% degeneracy rate in the comparison models is a warning that BKT-family parameter estimates are weakly identified in general.

---

### Baker, R. S. J. d., Corbett, A. T., Gowda, S. M., et al. (2010). *Contextual Slip and Prediction of Student Performance After Use of an Intelligent Tutor.* UMAP 2010, LNCS 6075, 52–63.
URL: https://doi.org/10.1007/978-3-642-13470-8_7
**[abstract]** — the results paragraph was returned verbatim by search; I did not read the full paper.

**DOK 1.** Correlations between model output and post-test score: four-parameter BKT **0.430**; BKT with individual difference weights **0.412**; contextual guess-and-slip **0.289**. All were statistically significant (p = .02 for CGS, p < .01 for the others). **No difference among the correlations was statistically significant**; four-parameter vs CGS was t(68) = 1.63, p = 0.12.

A follow-up (Gowda et al. 2011) reports cross-validated r = 0.426 for BKT-BF alone, F(1,69) = 15.27, p < 0.001; adding certainty-of-slip raised it to 0.437, adding average slip to 0.479, and adding new features to 0.485.

**DOK 2.** Important corrective to the 2008 paper: on the outcome that actually matters — the post-test — the fancy contextual-slip model did **not** beat plain four-parameter BKT (0.289 vs 0.430, difference not significant with n≈70). Slip estimation improves next-step prediction without demonstrably improving the estimate of what the learner actually knows.

For an MCAT product whose outcome is a test score, this is the relevant comparison, and it says: the extra modelling complexity of per-action slip inference has not been shown to buy outcome-prediction accuracy.

**Limitations.** n ≈ 70 students for the post-test correlation — badly underpowered to detect differences between correlations, so "no significant difference" here means "cannot tell," not "equivalent."

---

### San Pedro, M. O. C. Z., Baker, R. S. J. d., & Rodrigo, M. M. T. (2011). *Detecting Carelessness through Contextual Estimation of Slip Probabilities among Students Using an Intelligent Tutor for Mathematics.* AIED 2011.
URL: https://doi.org/10.1007/978-3-642-21869-9_39 · PDF: https://learninganalytics.upenn.edu/ryanbaker/aied2011-carelessness.pdf
**[read]**

**DOK 1.** 126 Philippine high school students (64 in a Scooter-the-Tutor condition, 62 in a no-agent condition), 80 minutes of use.

Detector-to-label correlations: NoScooter **0.460**, Scooter **0.481**. Cross-application (train on one condition, test on the other): Scooter detector on NoScooter data **0.471**; NoScooter detector on Scooter data **0.392**. Applied to a US dataset, correlations were 0.490, 0.591, 0.537, 0.605.

Contextual Guess and Slip A′: 0.821 (NoScooter) / 0.814 (Scooter), vs BKT 0.816 / 0.807 — *these are not cross-validated*.

Rate findings: average predicted P(slip) was **0.12**, maximum **0.38**. P(slip) rose to **0.18** in the 4,009 cases where estimated prior knowledge exceeded the initial L₀, versus 0.10 otherwise. In 850 cases following at least two consecutive correct answers, P(slip) was **0.20**. In 355 cases with few prior errors and high prior knowledge, P(slip) was **0.27**.

**DOK 2.** The transfer results (0.39–0.48 across conditions, 0.49–0.61 on a different country's data) are the encouraging part: the detector is not purely fitted to one context. The rate results are the sobering part: **the maximum estimated slip probability across the entire dataset was 0.38**. Even at the model's most confident, the modal explanation for an error is still "doesn't know it." No individual action can be labelled a slip with anything approaching certainty.

**Limitations.** n=126, 80 minutes. The "labels" the detector is trained against are themselves model-derived (contextual slip estimates), not human judgements of carelessness — so the 0.46/0.48 correlations measure the detector's ability to reproduce another model's output, not truth. The A′ figures are explicitly not cross-validated.

---

### Zhang, J., Baker, R. S., Srivastava, N., Ocumpaugh, J., Mills, C., & McLaren, B. M. (2025). *Carelessness Detection using Performance Factor Analysis: A New Operationalization with Unexpectedly Different Relationship to Learning.* arXiv:2503.04737.
URL: https://arxiv.org/abs/2503.04737
**[read]**

This is the most important recent source, because it is the field auditing its own construct.

**DOK 1.** 181 students, 16,649 questions (10,641 correct, 6,008 incorrect), 4,880 actions estimable by all models.

Distributions: BKT-based contextual slip mean carelessness **0.469 (SD 0.373)**, bimodal. ML contextual slip **0.393 (SD 0.323)**. BKFC **0.473 (SD 0.035)**, approximately normal. The BKFC ML model achieved **RMSE 0.200** under 5-fold student-level cross-validation.

Agreement between operationalizations (Spearman): BKT slip ↔ ML slip **.849 (p < .001)**; BKT slip ↔ BKFC **−.21 (p < .001)**; ML slip ↔ BKFC **−.23 (p < .001)**.

Post-test regression: carelessness measured by BKT contextual slip was **positively** associated with post-test score (b = 15.43, t(157) = 3.20, p = .002); carelessness measured by BKFC was **negatively** associated (b = **−74.88**, t(157) = −2.31, p = .02).

Relations to other detectors: BKT contextual slip correlated **−.86** with gaming the system and **−.87** with confrustion; BKFC correlated **+.22** with gaming (r(158) = .22, p = .005) and **+.27** with confrustion.

The authors' own summary of the epistemic situation: *"It is difficult to know which operationalization is correct, as there is no easy way to obtain ground truth. External observers have been unable thus far to confidently identify carelessness from screen replays, text replays, or field observations."*

**DOK 2.** Two published, peer-reviewed operationalizations of the same named construct correlate **negatively** with each other and predict the outcome in opposite directions on the same dataset. This is not a tuning difference; it means "carelessness" as measured by contextual slip and "carelessness" as measured by behavioural features are different constructs wearing the same name.

The mechanism is visible in the correlations: contextual slip is defined as "erred despite high estimated knowledge," so it is mathematically bound to high performers — hence −.86 with gaming and a positive post-test coefficient. It is close to a proxy for *being good at the subject*. BKFC, built from behavioural features, tracks disengagement — hence positive correlations with gaming and confrustion and a negative post-test coefficient.

Design consequence: if we ship a "careless errors" metric, we must decide which of these two things we mean, and the answer determines whether the metric flags our strongest learners or our most disengaged ones. Shipping it without deciding means shipping an uninterpretable number. And the authors' remark about external observers is decisive on the validation question — **there is no way to check whether we got it right**, because humans watching the full screen replay cannot reliably identify carelessness either.

**Limitations.** 181 students, one platform, one subject (middle-school students playing a learning game on decimal numbers and operations). n=159 for the post-test regressions. arXiv preprint at the time of reading; check for the final peer-reviewed version.

---

### Zhang, J., Baker, R. S., et al. (2025). *A Tale of Two Models: Leveraging Self-Explanation to Contextualize Divergent Models of Student Carelessness.* EdArXiv preprint.
URL: https://doi.org/10.35542/osf.io/9hryt_v1
**[abstract]** — the DOI resolves only to a Crossref record and I could not retrieve the full text, so I have the abstract's qualitative claims but **no numbers**.

**DOK 1.** A direct convergent-validity test of the two divergent carelessness models above, using student **self-explanations of the causes of their own errors** as the human reference. The authors hypothesized one model or the other would align with the self-explanations. Reported result: "neither model's estimates align well with all of the annotations." Where they did correlate, they correlated with *different* things — the BKT contextual-slip model's carelessness inferences were associated with **self-recoverable slips** (errors students felt they could easily correct themselves), while the BKFC model's inferences were associated with students showing **hasty, rushed behaviour** in general.

**DOK 2.** This partially retracts a claim I made earlier in this document: somebody *has* attempted to validate automated carelessness detection against a human reference. The result does not rescue the construct, but it sharpens it usefully. The two models are not both wrong — they appear to measure two genuinely different things that the field has been calling by one name:

- Contextual slip ≈ **recoverability**. Would the learner fix this themselves on a second look?
- BKFC ≈ **haste**. Is the learner rushing?

Both are actionable and they imply opposite treatments. Recoverable errors need a re-serve, not instruction. Haste needs a pacing intervention or an engagement check. A product decision to build "carelessness detection" should pick one of these two and name it accordingly — "likely to self-correct" or "rushing" — rather than shipping the ambiguous word.

Note also that the reference standard here is *learner self-explanation*, which everything in Q2 says is unreliable and biased toward the trivial. So "neither model aligns with the annotations" is genuinely ambiguous: it may mean the models are wrong, or that the annotations are.

**Limitations.** Preprint; I could not read the full text, so I cannot report sample size, annotation scheme, inter-annotator reliability, or effect sizes, and I have not verified that the abstract's claims are supported by the analysis. Same research group and probably the same or a closely related dataset as the BKFC paper, so this is not independent replication. **Retrieve and read this before relying on it.**

---

### San Pedro, M. O. C. Z., Baker, R. S. J. d., Bowers, A. J., & Heffernan, N. T. (2013). *Predicting College Enrollment from Student Interaction with an Intelligent Tutoring System in Middle School.* EDM 2013.
URL: https://files.eric.ed.gov/fulltext/ED562769.pdf
**[read]**

**DOK 1.** **3,747** students who used ASSISTments in middle school between 2004 and 2007, linked to later college enrollment records. The combined behavioural model distinguished a college enrollee from a non-enrollee **68.6%** of the time.

Bivariately, carelessness was a *positive* predictor: CollegeEnrollment = 0.477 × Carelessness + 0.338, odds ratio **1.612**. In the final multivariate model, controlling for student knowledge and correctness, the carelessness coefficient **flips sign to −1.145**. *(The exact multivariate coefficient list I have is from an accompanying slide deck — treat the −1.145 figure as `[secondary]`; the sign flip itself is stated in the paper.)*

**DOK 2.** The longest-horizon outcome evidence available for a machine-detected error-cause construct, and it is genuinely striking that a middle-school carelessness estimate carries any signal about college enrollment years later. But the sign flip is the finding: carelessness looks good until you control for knowledge, then it looks bad. Which is exactly what Zhang et al. 2025 later diagnosed — bivariate carelessness is partly a proxy for knowledge, and once knowledge is partialled out, what remains is closer to inattention.

For us: any carelessness metric must be reported conditional on knowledge, or it will just be a noisy restatement of skill level.

**Limitations.** Observational, one state, one platform, no causal claim. 68.6% discrimination is modest. Attrition and record-linkage bias in the enrollment outcome are not fully characterized.

---

### Wise, S. L., & Kong, X. (2005). *Response Time Effort: A New Measure of Examinee Motivation in Computer-Based Tests.* Applied Measurement in Education, 18(2), 163–183.
URL: https://doi.org/10.1207/s15324818ame1802_2
**[read]** — read the method, hypothesis tests, and results sections.

**DOK 1.** Response Time Effort (RTE) classifies each item response as rapid-guessing or solution behaviour by a per-item response-time threshold, then scores the proportion of solution behaviour.

- RTE internal consistency: **coefficient alpha = .97**
- The Information Literacy Test used as the criterion had alpha = **.83**; the self-reported effort subscale alpha = **.83**
- Accuracy of rapid-guessing responses did not significantly exceed chance, while solution-behaviour accuracy was far higher
- Motivation filtering (dropping low-RTE examinees) raised score means and lowered SDs, with roughly constant standard errors of measurement, and did not preferentially remove low-ability examinees

A companion result, **[secondary]** via Wise & DeMars (2006) describing Wise (in press): **25.5%** of rapid-guessing responses were correct against **25.1%** expected by chance, versus **72.0%** correct under solution behaviour. Kong, Wise & Bhola (2007) report that four different threshold-setting methods produce very similar classifications.

**DOK 2.** This is the **most reliable observable-based error classifier in the entire literature I reviewed** — alpha .97, chance-level accuracy validation, threshold-method robustness. And note precisely what it classifies: not "why was this wrong" but "was the learner trying." That is a binary engagement judgement with a hard behavioural validation (chance-level accuracy), which is why it works where cause inference does not.

Direct application: implement rapid-guess detection on our item bank and **exclude rapid-guess responses from ability and mastery estimation**. This is cheap, well-validated, and independent of any error taxonomy. It also means response time is *spent* — once used for engagement filtering, it should not be double-counted as evidence of "carelessness," since a fast wrong answer is far more likely to be disengagement than a slip by someone who knew it.

**Limitations.** Low-stakes testing context — undergraduates on an unmotivating institutional assessment. On a high-stakes MCAT-prep product where learners are intrinsically motivated, rapid-guessing base rates will be much lower and the measure's variance (and thus its usefulness) will shrink. Thresholds must be set per item and re-set as items change.

---

### Zwaan, L., Monteiro, S., Sherbino, J., Ilgen, J., Howey, B., & Norman, G. (2017). *Is bias in the eye of the beholder? A vignette study to assess recognition of cognitive biases in clinical case workups.* BMJ Quality & Safety, 26(2), 104–110.
URL: https://doi.org/10.1136/bmjqs-2015-005014 · https://qualitysafety.bmj.com/content/26/2/104
**[read]**

This is the strongest counterevidence in the set, and it is the study the field of error classification most needs to reckon with.

**DOK 1.** 37 physicians each reviewed 8 clinical case workups and identified which of **6 named cognitive biases** (anchoring, availability, base rate neglect, confirmation bias, premature closure, representativeness) were present. Case content was held constant while the stated **outcome** was manipulated between correct and incorrect diagnosis.

- Number of biases identified: **1.75 (SD 1.80)** when the outcome was correct vs **3.44 (SD 1.53)** when incorrect. **F(1,280) = 73.3, p < 0.0001**; by subject **F(1,36) = 104.3, p < 0.00001**. *(The abstract prints 3.45 and F = 71.3; the body table prints 3.44 and F = 73.3. The paper is internally inconsistent; I report the table values.)*
- Judged that an error was present: **8%** of correct-outcome cases vs **60%** of incorrect-outcome cases, χ² = 80.8
- Individual biases were identified **73% to 125% more often** in the incorrect-outcome condition
- Premature closure: **39%** (correct) vs **88%** (incorrect). Availability: **25%** vs **55%**
- **Inter-rater reliability (κ) for each bias: anchoring 0.000, availability 0.025, base rate neglect 0.063, confirmation bias 0.024, premature closure 0.046, representativeness 0.044**

Related: a systematic review cited in this literature found that of 213 studies of cognitive bias in health care, only **15 (7%)** examined links between bias and actual error, covering only 7 biases. Zwaan's interview work also found that many errors that appeared to result from cognitive biases turned out, on interview, to be **knowledge gaps**.

**DOK 2.** Two conclusions, both damaging to cause-based classification:

1. **Reliability.** κ ≤ 0.063 across all six categories is chance agreement. Trained physicians, given an explicit taxonomy and a fully documented reasoning trace — vastly more information than our system will ever have about a learner — cannot agree on which cognitive failure occurred. If the human ceiling for cause attribution is chance, an automated classifier cannot be validated against human labels, because there are no reliable human labels to validate against.

2. **Hindsight contamination.** Knowing the outcome roughly doubled the number of biases "detected." This is directly analogous to our situation: our system only classifies errors *after* seeing that the answer was wrong. Any post-hoc cause label is generated under exactly the outcome-knowledge condition that inflates attribution.

This does not, however, condemn all classification. Note what Zwaan's participants were asked to do: name the *cognitive mechanism*. Nobody has shown that identifying *which fact the learner got wrong* is unreliable — that is an objective content judgement. The failure is specific to cause.

**Limitations.** Medical diagnosis, not learning; physicians, not learners; vignettes, not real cases. 37 raters is modest, though the design is within-subject and the effect is enormous. One could argue that clinical reasoning traces are messier than an MCQ response, so error causes are inherently harder to spot there — but the counterargument is that we have *far less* information than these physicians had.

---

## Q4. How many categories are useful?

This is the thinnest evidence base of the five. There is essentially no study that directly compares a 3-category vs a 10-category *error-cause* taxonomy on instructional outcomes. What exists is adjacent: skill-model granularity studies, and feedback-specificity meta-analyses.

### Pardos, Z. A., Heffernan, N. T., Anderson, B., & Heffernan, C. L. (2007). *The Effect of Model Granularity on Student Performance Prediction Using Bayesian Networks.* User Modeling 2007, LNCS 4511, 435–439.
URL: https://doi.org/10.1007/978-3-540-73078-1_58
**[abstract]** — verbatim results passage retrieved; full text not read.

**DOK 1.** Four skill models of increasing granularity fitted to the same ASSISTments data: **WPI-1** (a single skill), **WPI-5**, **WPI-39**, **WPI-106**.

- For predicting performance **within the tutor**, finer-grained models predicted better, monotonically.
- For predicting the **external** MCAS state test score, the ordering broke: **WPI-39 was best** (12.86% error, raw score error 3.73), followed by WPI-106, then WPI-5, then WPI-1.

A related analysis (Feng et al., mixed-effects comparison of WPI-78 vs WPI-39) found a tie on the DATA-2005 set (p = 0.21, 447 students) and an advantage for WPI-78 on DATA-2006 (p < 0.001, 474 students).

**DOK 2.** The only direct granularity evidence I found, and it shows an **interior optimum**: 39 categories beat both 5 and 106 for predicting the outcome that mattered. Finer is better for in-system prediction and worse past a point for external validity — classic overfitting, because fine-grained models split the data thinner and estimate each parameter from fewer observations.

For us this argues against both extremes: a 3–4 category cause taxonomy is likely too coarse to guide anything, and a 10+ category taxonomy applied to a bank where most items are thinly attempted will not have the data to support it. But note this is about **skill/content** granularity, not error-cause granularity, and the transfer is an assumption on my part, not a finding.

**Limitations.** Middle-school math, one platform. The optimum (39) is a property of that dataset's size and structure and does not transfer as a number. Prediction accuracy is not an instructional outcome — nobody randomized students to granularity conditions and measured learning.

---

### Cen, H., Koedinger, K., & Junker, B. (2006). *Learning Factors Analysis — A General Method for Cognitive Model Evaluation and Improvement.* ITS 2006, LNCS 4053, 164–175.
URL: https://doi.org/10.1007/11774303_17
**[abstract]**

**DOK 1.** LFA uses a combinatorial search over knowledge-component splits, scored by BIC, to find a better-fitting cognitive model than the human-authored one. Applied to Cognitive Tutor data it identifies specific over-general KCs that should be split (and over-specific ones that should be merged), yielding improved fit.

**DOK 2.** Provides a *method* for answering the granularity question empirically on our own data rather than by argument: define candidate splits, fit, compare with a penalized fit criterion. This is the right way to decide how many content categories our bank supports. It says nothing about error-cause categories, which have no correctness signal to fit against.

**Limitations.** Model-fit improvement, not learning improvement. Search space grows combinatorially; results depend on the human-supplied candidate factors.

---

### Van der Kleij, F. M., Feskens, R. C. W., & Eggen, T. J. H. M. (2015). *Effects of Feedback in a Computer-Based Learning Environment on Students' Learning Outcomes: A Meta-Analysis.* Review of Educational Research, 85(4), 475–511.
URL: https://doi.org/10.3102/0034654314564881
**[abstract]**

**DOK 1.** 40 studies, **70 effect sizes**, range **−0.78 to 2.29**. By feedback type:
- **Elaborated feedback (EF): d = 0.49**
- **Knowledge of correct response (KCR): d = 0.32**
- **Knowledge of result / correct-incorrect only (KR): d = 0.05**

**DOK 2.** The practical ceiling on what error classification can buy. Going from "wrong" (d = 0.05) to "here's the right answer" (d = 0.32) captures most of the available gain; going further to explanatory feedback adds d ≈ 0.17. Any error-classification machinery must be justified against that 0.17 headroom, because the classification is only worth building if it makes the elaborated feedback better than an ungated, well-written explanation would be.

Also note: the 70 effect sizes include *nothing* about cause-specific feedback. "Elaborated" here means explanatory, not diagnosed. No meta-analysis I found isolates the value of matching feedback to a diagnosed error cause.

**Limitations.** Enormous range (−0.78 to 2.29) implies severe heterogeneity; the type-level means hide it. Mostly short-horizon lab and classroom studies. Publication bias not fully addressed.

---

### Gusukuma, L., Bart, A. C., Kafura, D., & Ernst, J. (2018). *Misconception-Driven Feedback: Results from an Experimental Study.* ICER 2018, 160–168.
URL: https://doi.org/10.1145/3230977.3231002
**[read]** — read design and results sections.

**DOK 1.** Quasi-experiment across three semesters of an introductory computing course, **352** students total (94 control, then 125 and 133 in treatment semesters). Misconception-Driven Feedback (MDF) detects specific known misconceptions in submitted code and delivers targeted messages.

- **Embedded post-test:** control mean **5.9067** vs treatment **7.1878** (out of 9), a statistically significant difference — the ~**10%** improvement on open-ended programming problems quoted in the abstract.
- **Final post-test:** **no statistically significant difference** between conditions.

**DOK 2.** The closest thing to direct evidence that error-type-specific feedback beats generic feedback — and the result is split. The measure taken close to the intervention moved; the delayed, broader measure did not. That pattern is consistent with MDF helping learners fix the specific misconceptions it targets without generalizing.

If we build misconception-targeted feedback, the honest expectation is a near-transfer gain on the targeted content, not a global score gain. That is still worth having, but it should not be sold internally as an outcome lever.

**Limitations.** Quasi-experimental — semesters, not students, were assigned, so cohort effects are fully confounded with condition. Computing, not science content. The null on the final post-test is the more externally valid measure and it is null.

---

### Stewart, J., Griffin, H., & Stewart, G. (2007). *Context sensitivity in the Force Concept Inventory.* Physical Review Special Topics – Physics Education Research, 3, 010102.
URL: https://doi.org/10.1103/PhysRevSTPER.3.010102
**[abstract]**

**DOK 1.** Rewriting FCI questions to change surface context while preserving the physics produced an average shift of **2.72%** across the ten modified questions, but **one question shifted by 10%**.

**DOK 2.** Bounds how much a per-item error classification generalizes. If changing the story around a question moves the response distribution by up to 10 points, then a misconception inferred from one item's distractor is partly a property of that item's framing. Aggregate across several items before asserting a learner holds a misconception.

**Limitations.** One instrument, ten questions, single study. Average effect is small; the concern rests on the tail.

---

## Q5. Careless / slip errors specifically

Pulling the thread across the above:

**Are they real?** Yes, in the sense that VanLehn found 20% of students demonstrably knew the correct algorithm and erred anyway, and Clements found ~21% of errors reversed on immediate re-attempt without instruction. The phenomenon exists.

**Are they distinguishable per-error?** No. San Pedro et al. found maximum estimated P(slip) of **0.38** across an entire dataset — the model is never confident. Zhang et al. found two published detectors correlating **−0.21** with each other. Zhang et al. also report that human observers with full screen replay "have been unable thus far to confidently identify carelessness." There is no method, human or automated, that labels an individual error as a slip with defensible confidence.

**Do they predict anything?** Weakly and inconsistently. Contextual slip predicted post-test at r = 0.289 while plain BKT managed 0.430. Carelessness predicted college enrollment positively bivariately and negatively after controlling for knowledge. BKFC carelessness predicted post-test negatively (b = −74.88) while contextual slip predicted it positively (b = +15.43) *on the same dataset*.

**Is "careless" even one thing?** Apparently not. The convergent-validity study ("A Tale of Two Models," abstract only) found the two detectors track different phenomena: contextual slip aligns with **self-recoverable slips**, BKFC aligns with **hasty, rushed behaviour**. That is the most useful reframing available — drop the word "careless" and pick the construct you actually want, because the two imply opposite treatments (re-serve the item vs. intervene on pacing).

**Should a system treat them differently from knowledge errors?** Only in aggregate, and only for scheduling. The defensible operationalizations are:
- **Rapid-guess filtering** (Wise & Kong): alpha .97, chance-level accuracy validation. Exclude these responses from mastery estimation. This is the one intervention I would recommend without reservation.
- **Immediate re-attempt reversal** (Clements): behaviourally defined, testable in our product, and it produces evidence rather than an inference. If a learner misses an item and gets it right on a short-latency re-serve with no instruction in between, that is as close to a validated slip as this literature offers.
- **Aggregate rate over many items**, never a per-item label, and reported conditional on knowledge level.

And note the counterintuitive direction: Clements found careless-error proportion correlates *positively* with competence and confidence. Carelessness is a high-performer phenomenon under the reversal definition. A "you're being careless" message will land mostly on learners who are doing well — which may be fine, but it is not remediation.

---

## Top 5 sources, ranked

1. **Zwaan et al. (2017), BMJ Quality & Safety** — κ 0.000–0.063 for six named error causes, plus a doubling of detected causes under outcome knowledge. This is the only study that directly tests the reliability of cause attribution with a controlled design, and it finds chance agreement among experts with more information than our system will ever have. It sets the ceiling for the entire enterprise.

2. **VanLehn (1982), "Bugs Are Not Enough"** — n=925 with test–retest. Establishes that in the most classification-friendly domain in education, 50% of students are best described as "knew it, slipped," 22% violate the taxonomy's own predictions, and a third of erring students are unclassifiable. The best empirical account of what an honest classification system's coverage looks like.

3. **Zhang et al. (2025), *Carelessness Detection using Performance Factor Analysis* (the BKFC paper)** — two published operationalizations of "carelessness" correlating at −0.21 and predicting post-test in opposite directions (+15.43 vs −74.88), plus the authors' explicit statement that ground truth is unobtainable. The field auditing itself, and the clearest demonstration that a named error category can be uninterpretable even when it is computable.

4. **Wise & Kong (2005), Response Time Effort** — alpha = .97, rapid-guessing accuracy at chance (25.5% vs 25.1% expected, via Wise & DeMars). The one observable-based classifier with reliability high enough to act on, and a template for what a defensible error signal looks like: behaviourally defined, externally validated, and answering "was the learner trying" rather than "why were they wrong."

5. **Yerushalmi et al. (2012), PRST-PER** — ~200 premedical physics students, self-diagnosis scores 0.57–0.63, self-diagnosis-to-post-test correlations ranging from −0.26 to +0.54 and mostly non-significant, and the documented pattern of students dismissing a centripetal-force conceptual error as "a minor math mistake." Closest population to ours and direct evidence of the specific self-attribution bias the question asks about.

Honourable mentions: **Pilgrim et al. (2025)** gives the most direct learner-vs-expert agreement rates I found (42%–73% by problem-solving phase, with students over-calling "simple" and the weakest students over-calling it most) and would rank higher if not for n=8; **Van der Kleij et al. (2015)** for the d = 0.05 / 0.32 / 0.49 feedback ceiling, which bounds the value of the whole exercise; **Pardos et al. (2007)** as the only direct granularity comparison; **Sadler (1998)** as the best case *for* content-based (distractor) classification.

---

## What I could NOT find or verify

**No head-to-head test of error-cause taxonomy granularity.** I found no study that randomized learners to a 3-category vs a 10-category error-*cause* taxonomy and measured learning. The Pardos granularity result is about content/skill models, and I am extrapolating. Q4 is, on the current evidence, unanswered.

**Only one attempt to validate an automated error-cause classifier against a human reference, and I could not read it.** Nearly every slip/carelessness detector I found is validated against future correctness or against another model's output. The exception is Zhang et al.'s "A Tale of Two Models," which used learner self-explanations as the reference and reports that neither model aligned well — but I have the abstract only, and the reference standard is itself the self-report channel that Q2 shows to be unreliable. There is still no validation against an independent, trustworthy judgement of what actually happened, and Zhang et al. state elsewhere that such ground truth has not been obtainable even from full screen replays.

**No adequately powered study of learner-vs-expert error-classification agreement.** The Pilgrim et al. (2025) agreement rates are the most direct evidence available and rest on 8 students. Nobody has run this at n in the hundreds, in a multiple-choice context, or in a science domain. Given how decision-relevant this number is for us, it is the most conspicuous hole in the literature.

**No test–retest reliability estimate for individual carelessness rate.** Clements (1982) administered the instrument twice but I could not verify from the abstract whether a per-student careless-rate stability coefficient was reported. Without it, "this learner is careless" has no established stability, and Ellerton & Clements' item-level range (1%–71%) suggests it may be mostly item variance.

**No variance decomposition of error type into learner / item / occasion components** in any source I found. This is the single most decision-relevant missing number, and it is computable on our own data.

**No evidence at all in the MCAT or high-stakes-admissions-prep context.** Every empirical source is elementary/middle-school mathematics, undergraduate physics or computing, or clinical medicine. The closest population match is Yerushalmi's premedical physics students. Motivation levels in high-stakes prep are far higher than in the low-stakes settings where rapid-guessing measures were developed, so base rates will differ.

**Provenance gaps I want to flag explicitly.** I did not read the full text of Brown & Burton (1978), Reason (1990), Clements (1982), Sadler (1998), Zell & Krizan (2014), León et al. (2023), Van der Kleij et al. (2015), Pardos et al. (2007), Cen et al. (2006), Butterfield & Metcalfe, Wells et al. (2019), Stewart et al. (2007), or Baker et al. (2010). For Baker et al. (2010), León et al. (2023), and Pardos et al. (2007), the numbers quoted come from results passages returned verbatim by search rather than from the abstract alone, but I did not verify them against the published PDF. The Wise "25.5% vs 25.1%" figure is second-hand through Wise & DeMars (2006) and belongs to a different Wise paper than the 2005 RTE study, not to Wise & Kong (2005) itself. For "A Tale of Two Models" I have the abstract only and report **no numbers from it**; its DOI resolves to a Crossref record rather than a readable preprint, and it should be retrieved before anyone leans on the recoverability-vs-haste framing I drew from it.

**Two internal inconsistencies in sources**, reported rather than resolved: Zwaan et al.'s abstract prints 3.45 and F = 71.3 where the body table prints 3.44 and F = 73.3; VanLehn's OCR renders 14 tinkerers out of 120 hand-analysed students as "(1%)" where the arithmetic gives ~12%.

**Verification note.** The URLs above are constructed from DOIs and repository identifiers recorded during retrieval. The Ryals et al. and Pilgrim et al. DOIs were confirmed against the publisher. The ERIC identifiers (ED245880, ED159036) and the ERIC-hosted PDF for San Pedro et al. (2013) were resolved during the search. The Sadler JRST link, the Cambridge chapter link for Reason, and one or two other publisher URLs were assembled from the DOI pattern and should be spot-checked before this document is cited elsewhere.

**One citation I had to correct mid-research**, recorded here so it does not get reintroduced: the "Simple Mistakes" study is Ryals et al. (2025) in IJRUME, not an arXiv preprint, and it has a companion paper (Pilgrim et al. 2025, Frontiers in Education) drawing on the same 8 interviews. The two report different analyses of one small dataset and should not be counted as independent evidence.
