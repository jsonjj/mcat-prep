# What To Do After a Wrong Answer: Evidence Review

**Question.** When an MCAT learner answers a multiple-choice question incorrectly, should the system withhold the correct answer and force re-engagement with their own reasoning, or reveal it immediately with an explanation?

**Short answer up front.** The evidence does not support withholding *as a general default*. It supports a narrower and more specific claim: that the learner must **process** the correct answer, and that a *brief, bounded* re-engagement step can increase that processing — but the largest and most reliable effects in the literature come from **elaborated feedback** (explaining why the right answer is right and why the chosen distractor is wrong), not from withholding. The single best-evidenced design is "one bounded retry, then always reveal with elaboration." Pure answer-until-correct on multiple-choice is the weakest of the credible options and has a specific documented failure mode on MC items.

Provenance tags: **[read]** = full text retrieved and read; **[abstract]** = abstract/metadata only; **[secondary]** = relying on another paper's description of it.

---

## 1. Immediate versus delayed feedback

This is the most-cited "conflict" in the literature, and the honest characterisation is: **the conflict has largely been resolved by dissolving it.** The modern meta-analytic answer is that timing barely matters on average, and that the older disagreement was driven by systematic differences between lab and classroom studies.

### 1.1 Kandemir, Esposito, Gurgand & Ramus (2026) — *Educational Psychology Review*

Meta-analysis of immediate vs. delayed feedback.
URL: https://hal.science/hal-04836783 (preprint of the EPR article)
**[read]** — full preprint text.

**DOK 1.**
- Overall effect of feedback timing (immediate vs. delayed): **g = 0.03, 95% CI [-0.09, 0.15]** — not significantly different from zero. The pooled literature says timing, on its own, does essentially nothing.
- Substantial heterogeneity remained, and three moderators were significant:
  - **Educational level.** Immediate feedback favoured in **primary/secondary** samples; delayed feedback favoured in **higher education / adult** samples.
  - **Learning domain.** Delayed feedback advantage concentrated in **verbal/memory-type** material; immediate advantage in **procedural/skill** material.
  - **Response-time constraint.** When learners were under time pressure at test, immediate feedback did better.
- The authors explicitly attribute the historical disagreement to confounded study characteristics rather than a real main effect.

**DOK 2.**
- Design implication: **do not spend engineering effort optimising the delay parameter.** The expected return is near zero. Whatever you build, the timing dimension is not where the value is.
- What it does NOT license: it does not say feedback is unimportant — the comparison is immediate-vs-delayed *feedback*, both of which beat no feedback. It also does not license "delay is better for adults, therefore withhold" — "delayed feedback" in this literature means *feedback given later in the session or next day*, **not** *feedback withheld pending a second attempt*. These are different manipulations and conflating them is the most common misreading in ed-tech design docs.

**Limitations.** As with all timing meta-analyses, "immediate" and "delayed" are operationalised inconsistently across primary studies (immediate = after each item vs. after the whole test; delayed = minutes vs. a week). The CI is tight around zero, which is informative, but the moderator analyses are observational and post hoc.

### 1.2 Kulik & Kulik (1988) — *Review of Educational Research*, 58(1), 79–97

"Timing of feedback and verbal learning."
URL: https://doi.org/10.3102/00346543058001079
**[secondary]** — I could not retrieve the full text; figures below are as reported in Hattie & Timperley (2007) and in the Kandemir et al. review.

**DOK 1.**
- The classic split: **delayed feedback superior in list-learning laboratory studies; immediate feedback superior in "applied" / classroom studies with meaningful content.**
- The overall feedback effect size commonly attributed to this meta-analysis via Hattie & Timperley (2007) is **d = 0.28**. Note: I encountered a competing figure of **g = 0.49** circulating via secondary summaries (Visible Learning). **I could not verify which is correct against the original.** Treat both as unreliable.

**DOK 2.**
- The one durable takeaway is the lab/classroom dissociation, which Kandemir et al. (2026) later reframed as an educational-level and domain moderator. For a real product with meaningful science content and adult learners, the classroom arm of this split is the relevant one, and it does not favour long delays.
- What it does NOT license: any specific numeric claim. The effect sizes are contested and I could not verify them.

**Limitations.** 1988 vintage, pre-dates modern bias-correction and pre-registration norms. Cited far more often than it is read.

### 1.3 Van der Kleij, Feskens & Eggen (2015) — *Review of Educational Research*, 85(4), 475–511

"Effects of feedback in a computer-based learning environment on students' learning outcomes: A meta-analysis."
URL: https://doi.org/10.3102/0034654314564881
**[abstract]** — abstract and widely-reproduced summary figures only; full text paywalled.

**DOK 1.**
- Compares feedback types in computer-based environments. Reported effect sizes: **knowledge of results (KR) d ≈ 0.05**, **knowledge of correct response (KCR) d ≈ 0.32**, **elaborated feedback (EF) d ≈ 0.49**.
- Elaborated feedback advantage was **larger for higher-order learning outcomes** than for lower-order ones.

**DOK 2.**
- This is the cleanest statement of the actual hierarchy: **EF > KCR > KR**, and the gap between "just tell them right/wrong" (KR) and "tell them why" (EF) is roughly an order of magnitude in effect size. The content of the feedback dominates its timing.
- What it does NOT license: none of the compared conditions is "withhold and force a retry." This meta-analysis is silent on withholding. It tells you what to put in the reveal, not whether to delay the reveal.

**Limitations.** Abstract-only provenance — I did not verify the exact effect sizes against the full text and they are reproduced widely with slight variation. Computer-based-learning samples skew toward simpler declarative content.

---

## 2. Designs that withhold the correct answer

This is the core of the question, and here there is a genuinely good, recent, well-powered source.

### 2.1 Mertens, Finn & Lindner (2022) — *Journal of Educational Psychology*, 114(8), 1743–1772 ★ **most important source**

"Effects of computer-based feedback on lower- and higher-order learning outcomes: A network meta-analysis."
URL: https://doi.org/10.1037/edu0000764
**[read]** — full text retrieved via PsycNet.

This is the right study for this decision because a **network meta-analysis** compares all feedback types against each other simultaneously, including the withholding variants, rather than pairwise.

**DOK 1.** Effect sizes vs. no-feedback control:
- **Lower-order learning outcomes:**
  - Elaborated feedback: **g = 0.714**
  - Answer-until-correct: **g = 0.554**
  - (KCR and KR lower; try-again variants intermediate)
- **Higher-order learning outcomes:**
  - Elaborated feedback: **g = 0.462**
  - Answer-until-correct: **g = 0.412**
- **Moderation by item format:** answer-until-correct performed **relatively better on multiple-choice items** for higher-order outcomes.
- **Domain moderation:** for **lower-order outcomes in scientific/STEM tasks**, AUC actually *outperformed* EF: **g = 0.64 (AUC) vs. g = 0.41 (EF)**.

**DOK 2.**
- Both EF and AUC substantially beat doing nothing. **EF beats AUC in the general case**, and the ranking is stable across lower- and higher-order outcomes.
- The STEM/lower-order reversal (AUC 0.64 > EF 0.41) is the strongest single piece of evidence in this review *for* a withholding-flavoured design in a science-exam context — but note it applies to **lower-order** outcomes (recall, recognition, basic application), which is a meaningful fraction of MCAT content-recall items but not the reasoning-heavy passages.
- What it does NOT license: it does **not** show AUC + EF is better than EF alone (that comparison is largely untested in the network). It does not license removing the explanation. And "AUC beats EF for lower-order STEM" is a subgroup finding within a network meta-analysis — treat it as a hypothesis worth A/B testing, not a settled fact.

**Limitations.** Subgroup estimates rest on fewer studies than the main effects. Network meta-analysis assumes transitivity across the comparison set, which is strained when "elaborated feedback" ranges from a one-line rationale to a full worked solution. Most primary studies use short retention intervals.

### 2.2 Butler, Karpicke & Roediger (2007) — *Journal of Experimental Psychology: Applied*, 13(4), 273–281

"The effect of type and timing of feedback on learning from multiple-choice tests."
URL: https://doi.org/10.1037/1076-898X.13.4.273
**[read]** — full text.

This is the most directly on-point experiment: it tests answer-until-correct **specifically on multiple-choice items**.

**DOK 1.**
- **Answer-until-correct and standard (reveal-the-answer) feedback produced identical final performance: .71 vs .71.**
- Delayed feedback produced a higher proportion of correct final responses than immediate: **.73 vs .68, d = .28** — but this difference was **not statistically significant** in this experiment (reported with p<sub>rep</sub> = .61).
- Both feedback conditions substantially beat no feedback.

**DOK 2.**
- This is the key negative result for the withholding hypothesis in the exact modality the product uses. On multiple-choice items, **making the learner keep guessing until correct bought nothing over simply telling them.** Same outcome, more learner time.
- What it does NOT license: it does not show AUC is *harmful*, and it does not test AUC combined with a rationale or with a diagnosis step. It tests bare AUC.

**Limitations.** Modest sample, single lab, prose-passage materials rather than science reasoning. A null result at this sample size cannot rule out a small AUC benefit — but it does rule out the large one that a withholding-first product design implicitly assumes.

### 2.3 Finn & Metcalfe (2010) — *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 36(4), 951–961 ★

"Scaffolded feedback: Theoretical contributions to the incremental hint technique."
URL: https://doi.org/10.1037/a0019252 (author copy: http://www.columbia.edu/cu/psychology/metcalfe/PDFs/FinnMetcalfe2010.pdf)
**[read]** — full text.

Three experiments comparing **scaffolded feedback** (progressive hint escalation — reveal letters/cues incrementally until the learner produces the answer) against standard feedback (just show it) and answer-until-correct.

**DOK 1.**
- **Experiment 1 (immediate test, N = 24):** scaffolded **M = .77**, standard **M = .73**, answer-until-correct **M = .61**, minimal feedback **M = .08**. Scaffolded significantly better than AUC, **t(23) = 3.37, p < .05**. Scaffolded vs. standard: not significant.
- **Experiment 2 (30-min delay):** scaffolded **M = .72**, AUC **M = .65**, standard **M = .63**.
- **Experiment 3 (1-day delay, N = 18):** immediate test showed no difference (standard .76, scaffolded .77). At the **1-day delay**: scaffolded **M = .67** vs. standard **M = .51**, **t(17) = 2.61, p < .05** — a **16-point advantage** that only appeared at delay.
- **Critical within-condition analyses:**
  - In the scaffolded condition, when the full answer had to be revealed (learner never generated it): final performance **.52**. When only partial cues were needed: **.83**.
  - In the AUC condition, when the correct answer was arrived at **last** (i.e., by pure elimination — it was the only option left): final performance **.42**. When selected before it was the only remaining option: **.72**.

**DOK 2.**
- This is the strongest positive evidence for a withholding-flavoured design, and it is specific: **the benefit comes from the learner successfully generating the answer with support, not from the withholding itself.** When withholding fails to produce generation, performance collapses (.52, .42).
- The advantage **only emerged at delay**. An immediate post-test would have shown nothing. Any A/B test of this feature that measures same-session performance will miss the effect entirely — and a same-session metric may even favour the wrong arm.
- The **.42 vs .72 elimination finding is the direct answer to question 6** and is discussed in §6.
- What it does NOT license: these are cue-based recall of general-knowledge facts (Spanish vocabulary / trivia-type), not MC reasoning. "Progressive hints" for a fact has an obvious implementation (reveal letters); for an MCAT discrete on acid-base chemistry it does not. The mechanism may transfer; the implementation does not.

**Limitations.** N = 24 and N = 18. These are small samples by modern standards and the key delayed result (t(17) = 2.61) sits close to the significance threshold. **This is exactly the kind of widely-cited effect that rests on a small sample.** It has theoretical coherence and converges with the Mertens et al. network meta-analysis, but it should not be treated as a robust point estimate.

### 2.4 Attali (2015) — *Computers & Education*, 86, 1–12

"Effects of multiple-try feedback and question type during mathematics problem solving on performance in similar problems."
URL: https://doi.org/10.1016/j.compedu.2015.02.016
**[secondary]** — described in detail in Attali, Laitusis & Stone (2015), *Educational and Psychological Measurement*, which I did read; I did not retrieve the *Computers & Education* full text.

**DOK 1.** Large-scale online math homework study. Effects on performance in similar subsequent problems:
- Multiple-try-with-correctness (MTC) vs. knowledge-of-correct-response (KCR): **d = .30** in favour of multiple-try.
- Multiple-try-with-hints (MTH) vs. MTC: **d = .21** in favour of adding hints.
- Open-ended vs. multiple-choice format: **d = .24** in favour of open-ended.

**DOK 2.**
- The most encouraging result for the proposed design, and in a quantitative-reasoning domain: allowing retries beat immediately revealing the answer, and **adding hints on top of retries added a further increment**. Effects are additive and in the expected direction.
- The **d = .24 open-ended > multiple-choice** result is important and uncomfortable: it suggests part of what makes retry work is *having to produce* the answer. A pure MC interface forfeits some of this. It is an argument for inserting a free-text or "state your reasoning" step before the second attempt.
- What it does NOT license: this measures performance on *similar subsequent problems* within the homework system — near transfer at short interval, not durable retention or exam-day transfer.

**Limitations.** Secondary provenance — I did not verify these figures against the original. Mathematics procedural problems, school-age population, homework context with no stakes. Effect sizes of d ≈ .2–.3 in a large observational-ish online study are modest.

### 2.5 Mertens & Lindner (2025) — *Journal of Computer Assisted Learning*, 41(1)

URL: https://doi.org/10.1111/jcal.13112
**[abstract]** — repeated attempts to retrieve the full text (Wiley HTML, Wiley ePDF, ResearchGate) all timed out.

**DOK 1.** Extends the 2022 network meta-analysis line into feedback in digital learning with a focus on how feedback is processed. I can state only that it is consistent with the EF-superiority conclusion; **I have no verified numbers from it.**

**DOK 2.** Listed for completeness and because a team building this should retrieve it properly. Do not cite numbers from it on my authority.

---

## 3. Direct evidence on the full proposed sequence

**Attempt → confidence rating → error diagnosis → second attempt → corrective feedback → delayed reattempt.**

**Verdict on this sub-question: no, the full sequence has not been tested.** I searched specifically for it and found nothing that assembles all six stages. What exists is good evidence on individual links, and the links do not all point the same direction. This matters because a six-stage pipeline multiplies per-stage friction while the evidence for each stage is separately modest.

### 3.1 Butler, Karpicke & Roediger (2008) — *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 34(4), 918–928

"Correcting a metacognitive error: Feedback increases retention of low-confidence correct responses."
URL: https://doi.org/10.1037/0278-7393.34.4.918
**[read]** — full text.

**DOK 1.**
- Feedback **roughly doubled** retention of correct responses that had been given with **low confidence** (i.e., lucky guesses and unrecognised knowledge), relative to no feedback.
- Without feedback, low-confidence correct responses were substantially likely to be lost by the final test.

**DOK 2.**
- **This is the strongest argument in the whole review for collecting a confidence rating** — but note what it argues for. It says confidence is diagnostic of items that need intervention *even when the learner got them right*. A system that only intervenes on wrong answers is leaving a documented, large effect on the table: the low-confidence *correct* answer is a high-value target.
- What it does NOT license: it does not show that *showing the learner* their confidence, or asking them to reflect on it, helps. The confidence rating here is a measurement instrument for the researcher, not an intervention. Any claim that "rating your confidence makes you learn better" is unsupported by this study.

**Limitations.** Lab, verbal materials. The doubling is relative to a low base rate.

### 3.2 Versteeg, Wijnen-Meijer & Steendijk (2019) — *BMC Medical Education*, 19, 377 ★

"Informing the uninformed: A multicentre randomized controlled trial comparing a traditional and a self-directed learning approach to formative assessment."
URL: https://doi.org/10.1186/s12909-019-1811-8
**[read]** — full text.

Directly relevant: a **randomised controlled trial in medical education**, comparing giving students detailed feedback on incorrect answers vs. minimal feedback, in a high-stakes-adjacent context.

**DOK 1.**
- Students given **detailed feedback** on incorrect answers reviewed the material significantly more (**P = 0.007**).
- **Exam scores were identical: 6.6 vs. 6.6, P = 0.18.** No difference in the outcome that mattered.

**DOK 2.**
- A well-designed feedback intervention that **successfully changed learner behaviour** (more reviewing) and **still produced zero difference in exam performance**. This is the most important cautionary result in the review for anyone building a feedback feature and planning to measure engagement.
- Design implication: **engagement metrics will mislead you here.** If you ship a withholding/diagnosis flow and observe more time-on-feedback, that tells you nothing about learning. Instrument for delayed retention from day one.
- What it does NOT license: it does not show detailed feedback is useless — it shows this particular contrast, in this population, at this dose, produced no measurable gain. Formative assessment in medical school is a noisy setting with many other inputs.

**Limitations.** Real-world RCT with correspondingly poor control over what students did outside the intervention; exam score is a coarse outcome; possible ceiling/floor issues with a single summative measure.

### 3.3 On "error diagnosis" specifically

I looked for direct tests of asking learners to *diagnose why their answer was wrong* before revealing the answer — the "error reflection" or "self-explanation of errors" step. **I did not find a well-powered study isolating this step in a multiple-choice context.** The adjacent literatures (self-explanation prompts, worked-example self-explanation) are supportive of self-explanation in general but test it during *studying*, not after an error on a test item, and generally against a no-prompt control rather than against being shown a good explanation. **Treat the error-diagnosis step as unvalidated.** It is the stage of the proposed sequence with the weakest evidentiary support and the highest per-item time cost.

### 3.4 Razzaq & Heffernan (2006, 2007) — ASSISTments studies on scaffolding vs. hints

"Scaffolding vs. hints in the ASSISTment system" (ITS 2006), and "What level of tutor interaction is best?" (AIED 2007).
URLs: https://doi.org/10.1007/11774303_63 ; https://www.researchgate.net/publication/220049035
**[read]** — full texts.

**DOK 1.**
- Comparisons of scaffolding questions (breaking a problem into sub-steps) against hints-on-demand within a live intelligent tutoring system found **no consistent large advantage for the more interactive condition**; results varied by problem and by student prior knowledge.
- Higher-interaction tutoring tended to help **lower-knowledge** students more; for higher-knowledge students the extra interaction was not beneficial and cost time.

**DOK 2.**
- Real-deployment evidence that more scaffolding is not monotonically better, and that **the right amount of withholding depends on the learner's current ability.** This is an argument for adaptivity in the feedback policy itself, not just in item selection.
- What it does NOT license: these are middle-school mathematics deployments; the aptitude-treatment interaction direction is plausible but the studies are underpowered for it.

**Limitations.** Small effects, noisy classroom data, K-12 mathematics.

---

## 4. The hypercorrection effect

**Summary: real, replicated, but small, and it is an argument for *giving* feedback, not for withholding it.**

### 4.1 Butterfield & Metcalfe (2006) — *Metacognition and Learning*, 1(1), 69–84

"The correction of errors committed with high confidence."
URL: https://doi.org/10.1007/s11409-006-6894-z
**[read]** — full text.

**DOK 1.**
- N = 39 Columbia undergraduates (Experiment 1).
- **Gamma correlations between error confidence and retest accuracy: +.13 and +.16.** These are the canonical hypercorrection numbers. They are **small**.
- High-confidence errors were more likely to be corrected after feedback than low-confidence errors, and this was not attributable to participants merely associating the correct answer with their original error.

**DOK 2.**
- The mechanism appears to be **attentional**: surprising feedback captures more attention and is processed more deeply. That is a reason to make the feedback *salient*, not a reason to hide it.
- What it does NOT license: gamma of .13–.16 is a weak association. Hypercorrection is frequently invoked in product decks as though it were a large effect. It is not.

**Limitations.** Small N, general-knowledge factual recall, single lab.

### 4.2 Butler, Fazio & Marsh (2011) — *Psychonomic Bulletin & Review*, 18(6), 1238–1244 ★

"The hypercorrection effect persists over a week, but high-confidence errors return."
URL: https://doi.org/10.3758/s13423-011-0173-y
**[read]** — full text.

**DOK 1.**
- Mean gamma correlations for hypercorrection: **M = .28 at a 6-minute delay** and **M = .19 at a 1-week delay** — the difference was **not significant**, so the effect persists.
- **But:** high-confidence errors were **more likely to be reproduced** after a week when they were not corrected — gamma **M = .15** for return of the original error.

**DOK 2.**
- Hypercorrection is durable but so is the error underneath it. **A high-confidence error that is corrected once will tend to come back.** This is a direct argument for scheduling a spaced re-test of corrected items — the "delayed reattempt" stage of the proposed sequence is the best-supported stage in it.
- What it does NOT license: it does not support a one-shot correction being sufficient.

**Limitations.** Factual recall again; gammas remain small.

### 4.3 Metcalfe (2017) — *Annual Review of Psychology*, 68, 465–489

"Learning from errors."
URL: https://doi.org/10.1146/annurev-psych-010416-044022
**[read]** — full text.

**DOK 1.**
- Reviews the hypercorrection literature and reports the effect replicating across ages (children through older adults), across materials, and in classroom as well as lab settings.
- Central claim: errors followed by corrective feedback produce **better** learning than errorless study, but **only when the corrective feedback is actually processed.** Errors without processed correction are worse than no error.

**DOK 2.**
- The single most important framing sentence for this product decision: the value of an error is entirely contingent on the correction landing. **A design that withholds the correction increases the risk that it never lands.**
- What it does NOT license: "errors are good, so let them struggle." The review says the opposite — the error is only good *because of* the correction that follows.

**Limitations.** A review, not new data; inherits the small-sample character of the primary literature it summarises.

### 4.4 Metcalfe & Finn (2011) — *Journal of Experimental Psychology: LMC*, 37(2), 437–448

"People's hypercorrection of high-confidence errors: Did they know it all along?"
URL: https://doi.org/10.1037/a0021962
**[read]** — full text.

**DOK 1.**
- When allowed a second guess, the probability that the correct answer was produced was **M = .46 following high-confidence errors** vs. **M = .32 following low-confidence errors**, **t(31) = 1.91, p = .03 (one-tailed)**.

**DOK 2.**
- Directly relevant to the second-attempt design: **a second attempt is substantially more likely to succeed after a confident error.** Confidence is therefore a usable routing signal — confident errors are the population where a retry is most likely to pay off.
- What it does NOT license: a one-tailed p = .03 with N = 32 is fragile. Use this to *generate* a routing hypothesis, not to justify a hard product rule.

**Limitations.** N = 32, one-tailed test, general-knowledge items.

### 4.5 Generalisation to complex reasoning

**I could not verify that hypercorrection generalises to complex multi-step reasoning.** Every well-documented demonstration I read uses general-knowledge factual recall or vocabulary. Metcalfe (2017) asserts breadth of replication but the cited studies remain in the factual-recall family. The MCAT's hardest items are not factual recall. **Assume hypercorrection does not transfer to passage-based reasoning until demonstrated.**

---

## 5. Costs and failure modes

### 5.1 Sinha & Kapur (2021) — *Review of Educational Research*, 91(5), 761–798 ★

"When problem solving followed by instruction works: Evidence for productive failure."
URL: https://doi.org/10.3102/00346543211019105
**[read]** — full text.

The definitive meta-analysis of productive failure — the literature most often cited to justify withholding.

**DOK 1.**
- Overall effect of problem-solving-before-instruction vs. instruction-first: **Hedges' g = 0.36** for **conceptual knowledge and transfer**.
- **Procedural knowledge: g = -0.03** — i.e., **zero**.
- The authors also report a p-curve-derived bias-corrected estimate of **g = 0.87**. This is a different quantity from the observed pooled effect and is not a stable point estimate; **do not use it.**
- Moderators: effects were larger when the failure phase was followed by **well-designed consolidating instruction**, and when learners had sufficient prior knowledge to engage productively.

**DOK 2.**
- Productive failure works for **building conceptual understanding of new material**, and does nothing for **procedural fluency**. Mapping to MCAT: this literature is about *learning a concept for the first time*, not about *what to do after missing a practice question on material already covered*. The analogy to a post-error retry is loose at best.
- The consistent moderator — that the failure phase must be followed by strong instruction — again says the reveal is the load-bearing part.
- What it does NOT license: productive failure is **not** evidence for withholding answers on practice questions. It is evidence about the ordering of *instruction* and *problem-solving* in a curriculum. Citing it for a post-error retry feature is a category error, and it is the most common one in this space.

**Limitations.** Heterogeneous interventions bundled under one label; strong researcher-allegiance pattern (a large share of the primary studies come from the meta-analysts' own group); publication bias concerns the authors themselves address.

### 5.2 Ashman, Kalyuga & Sweller (2020) — *Instructional Science*, 48, 685–705 ★

"Problem-solving or explicit instruction: Which should go first when element interactivity is high?"
URL: https://doi.org/10.1007/s11251-020-09526-1
**[read]** — full text.

**The failed-replication / boundary-condition source.** Two experiments finding the *opposite* of productive failure.

**DOK 1.**
- **Experiment 1 (N = 64):** instruction-first outperformed problem-solving-first on similar problems, **t(62) = 2.25, p = .03, Cohen's d = .56**.
- **Experiment 2 (N = 71):** instruction-first outperformed problem-solving-first on similar problems, **t(69) = 2.41, p = .02, d = .57**, and on **transfer**, **t(69) = 2.35, p = .02, d = .56**.
- The distinguishing variable: **high element interactivity** — tasks where many interacting components must be held in working memory simultaneously.

**DOK 2.**
- **This is the most direct counterevidence in the review, and it is aimed squarely at the MCAT use case.** MCAT items — passage-based physiology, multi-step equilibrium problems, experimental-design reasoning — are the definition of high element interactivity. In exactly this regime, making learners struggle first was *worse*, at d ≈ .56, which is larger in magnitude than the productive failure effect it contradicts.
- Design implication: **the harder and more integrative the item, the stronger the case for revealing the answer with a full explanation immediately.** Any withholding logic should be gated to *lower* element-interactivity items, which is the reverse of the intuition most teams start with.
- What it does NOT license: n ≈ 64–71 per experiment, single research group with a strong theoretical commitment (cognitive load theory) opposed to productive failure. This is a real result but it is not a large-scale replication effort.

**Limitations.** Allegiance concerns cut both ways here — Sweller's group is as invested against productive failure as Kapur's group is for it. The honest reading is that **the productive failure literature is contested along theoretical lines and the boundary conditions are not settled.**

### 5.3 Beck & Gong (2013) — "Wheel-spinning: Students who fail to master a skill"

*Artificial Intelligence in Education (AIED 2013)*, LNCS 7926, 431–440.
URL: https://doi.org/10.1007/978-3-642-39112-5_44
**[read]** — full text.

**DOK 1.**
- Operationalised wheel-spinning as a student attempting **10+ problems on a skill without achieving 3 consecutive correct**.
- **9.1% of student-problem pairs** met the wheel-spinning criterion in the analysed intelligent-tutoring data.
- Wheel-spinning students showed persistent non-mastery and were at elevated risk of disengagement.

**DOK 2.**
- Quantifies the abandonment failure mode: roughly **one in eleven** practice episodes in a system that lets students keep trying ends in unproductive persistence. **A withholding design must have a hard escape hatch.** Cap retries at one, or at most two, and always terminate in a full reveal.
- What it does NOT license: the 9.1% figure is specific to K-12 math tutoring with unlimited attempts; it is not a forecast for a capped-retry MCAT product. It establishes that the failure mode is real and measurable, not its rate in your context.

**Limitations.** Observational, single system, K-12 mathematics; the 10-problem/3-consecutive threshold is a defensible but arbitrary operationalisation.

### 5.4 On frustration and time cost specifically

I found no well-powered study quantifying learner frustration or dropout attributable to withheld answers in a test-prep context. The wheel-spinning literature is the closest proxy. **This is a genuine gap** — and it is the risk a commercial adaptive product should be most worried about, because it operates on retention/subscription rather than on test scores. Time cost is more tractable: Butler et al. (2007) found AUC took longer than standard feedback for **identical** learning outcomes, which is a straightforward efficiency loss.

---

## 6. Does multiple-choice change the picture? Yes — and unfavourably.

This is where the evidence is most decision-relevant and most often ignored.

### 6.1 The elimination problem — Finn & Metcalfe (2010), within-condition analysis

**[read]** (source detailed in §2.3).

**DOK 1.** In the answer-until-correct condition, final-test performance was:
- **.42** when the learner reached the correct answer **last** — i.e., when it was the only remaining option and selection was forced by elimination.
- **.72** when the learner selected the correct answer **before** it was the only one left.

**DOK 2.**
- **This is a 30-percentage-point gap and it is the direct answer to the question.** On multiple-choice, "got it right on the second attempt" is not one event — it is two very different events with very different learning value, and the system cannot distinguish them from the click alone.
- On a 4-option MCAT item where the learner has eliminated two, a second attempt is a coin flip. **Success by elimination produces markedly worse retention than the same success by reasoning.** A retry protocol on MC therefore generates a large volume of hollow successes that look like mastery in the telemetry.
- Concrete design implication: if you build a retry, **do not let the learner simply re-click.** Require something that distinguishes reasoning from elimination — a written justification, an explicit "why is the option you first chose wrong," or a free-text answer before the options are re-shown. Attali's **d = .24 for open-ended over multiple-choice** points the same way.

**Limitations.** This is a within-condition post hoc split in a study with N = 24. The magnitude is not trustworthy; the direction is theoretically well-motivated and consistent with the broader generation-effect literature.

### 6.2 The lure entrenchment problem — Butler & Roediger (2008)

*Memory & Cognition*, 36(3), 604–616. "Feedback enhances the positive effects and reduces the negative effects of multiple-choice testing."
URL: https://doi.org/10.3758/MC.36.3.604
**[read]** — full text.

**DOK 1.**
- Main effect of feedback condition on final cued recall: **F(2,138) = 66.79, η²p = .49** — a very large effect. Both immediate and delayed feedback increased correct responses and **sharply reduced intrusions** relative to no feedback.
- Delayed feedback produced more correct responses than immediate; **both were equally effective at reducing intrusions.**
- Without feedback, **75% of intrusions on the final test were lures that had been incorrectly selected on the initial multiple-choice test.**
- Under **free report** (where students could omit answers they doubted), students in the no-study/no-feedback condition still chose to report intrusions at **M = .19** — they believed the misinformation.
- Report option main effect: **F(1,69) = 229.90, η²p = .77.**

**DOK 2.**
- **Selecting a distractor actively installs false knowledge**, and learners cannot tell they have acquired it — they report it confidently. Feedback is the antidote, and it works.
- This is the strongest argument against any design that leaves an MCAT learner having selected a plausible distractor without a clear, explicit correction. MCAT distractors are engineered to be attractive and half-true. **The negative-suggestion risk here is higher than in the prose-passage materials this study used.**
- Design implication: whatever else happens, the flow must **end** with the correct answer explicitly stated and the chosen distractor explicitly refuted. Withholding may delay that; it must never replace it.

**Limitations.** Historical prose passages, undergraduate sample, one-week interval. The 75% and .19 figures are condition-specific.

### 6.3 Roediger & Marsh (2005) — the negative suggestion effect

*Journal of Experimental Psychology: LMC*, 31(5), 1155–1159. "The positive and negative consequences of multiple-choice testing."
URL: https://doi.org/10.1037/0278-7393.31.5.1155
**[secondary]** — described extensively in Butler & Roediger (2008), which I read; I did not retrieve the original.

**DOK 1.** Established that taking a multiple-choice test produces both a testing benefit and a cost: exposure to lures increases subsequent production of those lures as answers, with the cost scaling with the number of alternatives.

**DOK 2.** Foundational for §6.2. Same implication: MC testing without feedback is actively harmful in a measurable way.

**Limitations.** Secondary provenance; no verified numbers reported here.

---

## Ranked list: the five most valuable sources

1. **Mertens, Finn & Lindner (2022), network meta-analysis** — the only source that compares all the candidate designs against each other simultaneously with modern methods. It gives the ranking (EF ≈ 0.71 > AUC ≈ 0.55 for lower-order; 0.46 vs 0.41 for higher-order) and the one STEM-specific reversal worth testing. If you read one thing, read this.
2. **Finn & Metcalfe (2010), scaffolded feedback** — the best mechanistic evidence for *why* a withholding design could work (generation with support), the clearest demonstration that the benefit appears only at delay, and the .42-vs-.72 elimination finding that governs the MC case. Caveat its small N.
3. **Ashman, Kalyuga & Sweller (2020)** — the highest-value counterevidence, and it targets precisely the high-element-interactivity reasoning that MCAT items consist of, with d ≈ .56 *against* struggle-first. A team building this needs to have an answer to it.
4. **Butler & Roediger (2008)** — establishes the specific harm of un-corrected multiple-choice errors (75% of intrusions traceable to selected lures; learners believe them), with a very large effect for feedback (η²p = .49). This sets the non-negotiable floor: always end with an explicit correction.
5. **Kandemir et al. (2026)** — settles the timing question at g = 0.03 and stops the team from spending months on the wrong parameter. Also the source that most clearly separates "delayed feedback" from "withheld feedback," a distinction the rest of the discussion depends on.

Honourable mention: **Versteeg et al. (2019)** for the sobering RCT null (behaviour changed, scores identical, 6.6 vs 6.6) and the measurement lesson it implies.

---

## Verdict on the core question

**The evidence does not support withholding the correct answer as a default, and a product built on the premise that withholding is the active ingredient would be building on a misreading of the literature.**

More precisely:

**What the evidence does support.**
- **Feedback content matters far more than feedback timing.** EF (≈0.49–0.71) dominates KCR (≈0.32) dominates KR (≈0.05). Timing is g = 0.03. If there is one investment to make, it is the quality of the explanation of *why the chosen distractor is wrong*, not the choreography around it.
- **A single bounded retry is defensible.** AUC beats no feedback (g = 0.55 / 0.41) and multiple-try beat KCR in Attali (d = .30), with hints adding a further d = .21. In the lower-order STEM subgroup AUC even beat EF (0.64 vs 0.41). The retry is a reasonable bet — but it is a bet on a modest effect, not a sure thing.
- **The generation, not the withholding, is the mechanism.** Scaffolded feedback works when the learner produces the answer (.83) and fails when they do not (.52). Open-ended beat multiple-choice by d = .24. Design for production, not for delay.
- **Spaced re-testing of missed items is the best-supported element of the proposed sequence.** High-confidence errors return after a week even when corrected (gamma M = .15). This is the stage to build first.
- **Confidence ratings are worth collecting** — but as a routing signal, not an intervention. Confident errors are more likely to be resolved on a second attempt (.46 vs .32). Low-confidence *correct* answers are a high-value, commonly ignored target where feedback roughly doubled retention.

**What the evidence argues against.**
- **Bare answer-until-correct on multiple-choice.** Butler et al. (2007) found it exactly equal to just telling the learner (.71 vs .71) while costing more time. On MC, retry success by elimination retained at .42 vs .72 for genuine success — the interface manufactures hollow wins.
- **Withholding on hard, integrative items.** Ashman et al. found instruction-first *better* by d ≈ .56 when element interactivity is high. This is the MCAT's hardest content. The withholding logic should be gated *off* for these, which is counterintuitive but is what the evidence says.
- **Citing productive failure as justification.** It is about curriculum sequencing of instruction, gives g = 0.36 for conceptual learning and g = -0.03 for procedural, and is contested along theoretical lines with a live counter-literature. It does not speak to post-error retry on practice questions.
- **Elaborate multi-stage pipelines.** The full six-stage sequence has never been tested. The error-diagnosis stage in particular has no supporting evidence I could find in a multiple-choice context, and it is the most expensive stage in learner time. Versteeg et al. is a direct warning: a well-designed feedback intervention changed behaviour and moved exam scores not at all (6.6 vs 6.6).

**The design the evidence actually points to,** if the team wants one: on an incorrect answer, capture a confidence rating; offer **one** bounded retry that requires the learner to *produce* something (state why their first choice was wrong, or answer in free text) rather than re-click an option; cap it hard and always terminate in **elaborated feedback** that names the correct answer and refutes the chosen distractor explicitly; then **re-test the item after a delay of a day or more**. Gate the retry off for the hardest, most integrative items and for low-prior-knowledge learners. Measure delayed retention, not engagement.

That design is roughly 20% "withholding" and 80% "high-quality explanation plus spacing." If the team's plan inverts that ratio, the plan is wrong.

---

## What I could not find or verify

Stated plainly, because these gaps bear on the decision:

1. **The full proposed six-stage sequence has never been tested empirically**, as far as I can determine. Any claim about its combined effect is extrapolation from separately-tested links.
2. **The error-diagnosis step is unvalidated in this context.** I found no well-powered study isolating "ask the learner to explain why their answer was wrong before revealing the correct one" on multiple-choice items. The adjacent self-explanation literature tests a different manipulation during studying.
3. **Hypercorrection has not been demonstrated for complex multi-step reasoning.** Every well-documented demonstration I read uses factual recall or vocabulary. Metcalfe (2017) claims broad replication but the cited work stays in that family.
4. **No quantification of frustration or abandonment attributable to withheld answers** in a test-prep or adult high-stakes context. Wheel-spinning (9.1%) is a K-12 math proxy, not a forecast.
5. **Kulik & Kulik (1988) effect sizes are unverified and contested.** I saw both d = 0.28 (via Hattie & Timperley) and g = 0.49 (via secondary summaries) attributed to it and could not resolve the discrepancy against the original.
6. **Mertens & Lindner (2025)** — full text could not be retrieved after repeated attempts (Wiley and ResearchGate both timed out). No verified numbers from it appear above.
7. **Attali (2015, *Computers & Education*)** figures are **secondary** — taken from Attali, Laitusis & Stone (2015), which I read. Not verified against the original.
8. **Van der Kleij et al. (2015)** effect sizes are **abstract-provenance**. The EF > KCR > KR ordering is not in doubt; the specific values (0.49 / 0.32 / 0.05) are not verified against the full text.
9. **No MCAT-specific or high-stakes-adult-standardised-test-specific study** on post-error feedback design was found. Every source here requires extrapolation across population, stakes, or content domain.
10. **The productive failure literature's true effect size is unresolved.** The observed g = 0.36 and the p-curve-corrected g = 0.87 are different quantities, allegiance effects are visible on both sides of the debate, and Ashman et al. found a reversal. I would not build on any point estimate from this literature.
