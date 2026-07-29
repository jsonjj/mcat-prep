# Cold-start item difficulty prediction and borrowing difficulty across items

Scope: can difficulty be assigned to items that have never been answered? Evidence review, July 2026.
Context this was written for: 2,108 MCAT-style 4-option standalone items, zero response data, labelled with knowledge component (422), content cluster (15), AAMC Foundational Concept (10), reasoning operation, DOK 1–4, lesson id, item family id. Needed for a 140-item multistage adaptive diagnostic, adaptive practice selection, and an IRT slip term.

---

## Executive answer

1. **No cold-start method in the literature produces difficulty estimates good enough to substitute for calibration.** On the only public benchmark of USMLE-style MCQs (BEA 2024, 667 items), the winning system beat a "predict the mean" baseline by RMSE 0.299 vs 0.311 — about **7.6% of difficulty variance explained** (my computation from the reported RMSEs; implied r ≈ 0.28). The best published result on that dataset since, using an ensemble of nine LLMs' answer uncertainty plus text features, is RMSE 0.2817 ≈ **18% of variance** (r ≈ 0.42). Tier **A** for these numbers, since they are held-out test results on a fixed split with a published baseline.

2. **Text-only NLP prediction is the weakest route and should not be built.** Linguistic-feature baselines on USMLE items performed *worse than the mean* (RMSE 0.3147 vs 0.3110). Directly asking GPT-4 also performed worse than the mean (0.3556). Tier **A**. The technical-knowledge MCQ regime is the hardest case in this literature; the strong published numbers (r = 0.87, RMSE = 0.165) come from language-learning and reading-comprehension items on different scales and are not transferable.

3. **A well-run expert panel is the best available cold-start method, and it is only good for rank order.** Pooled panel judgments correlate with empirical difficulty at roughly **r = 0.55–0.85** for rank order across many studies, but absolute values are badly biased toward the mean, and the one study that converted judgments into Rasch *b* found **r = 0.39–0.62** across four licensure exams. Individual raters are far worse (r ≈ 0.23–0.43). Tier **A** for the pattern, **B** for any specific number.

4. **Comparative (pairwise) judgment beats absolute rating, for both humans and LLMs, consistently and by a large margin.** LLM absolute rating vs pairwise-then-Bradley–Terry: Spearman 0.486 → 0.730 on primary-school maths; 18.3 → 40.4 on reading comprehension. Tier **B**. If any judgment-elicitation is built, it should be pairwise, not "rate this item 1–5."

5. **Asking an LLM to rate difficulty is close to useless for medical-knowledge items specifically.** Across 21 models on USMLE items, the mean Spearman with human difficulty was **ρ = 0.13**; the best single model reached 0.36. The cause is diagnosed directly: 75.6% of USMLE items are solved by 90% of models, and 70.4% of the items humans find hardest are trivial for the models. Tier **A** (large, recent, peer-reviewed, and mechanistically explained).

6. **The specific "ensemble of weak and strong models' accuracy" idea fails on exactly this item type.** Fitting IRT to 21 models' correctness gave ρ = 0.134 with human difficulty on USMLE (vs 0.386 on SAT Math). Adding weaker models diluted the signal immediately on USMLE rather than helping. Tier **B**, single study but direct. The related "soft" version — using token log-probabilities rather than correctness — does carry a little signal (~5% of variance alone on USMLE) and is the only part of this family worth prototyping.

7. **Item family ids are the single most valuable asset in the bank for this problem, and are probably worth more than any text model.** Empirically, in the closest analogue (AIG variants of the same parent in UK undergraduate medical MCQs, 444–659 students per form), the *average* within-family spread across four variants was 0.10 in p-value (≈ 0.2 logits of within-family SD by my conversion), but 21 of 46 families exceeded 0.15 and the worst reached 0.30 p-value (≈ 1.25 logits). So: borrow within family, but do not assume families are homogeneous, and never let one family's estimate be load-bearing. Tier **B**.

8. **Collaborative filtering and matrix factorisation cannot help at all right now.** They factorise a response matrix. With zero responses there is nothing to factorise; the educational "cold start" papers in that line solve cold start for *new learners*, not new items. Tier **A** (this is a structural fact, not an empirical finding).

9. **The realistic plan is not "predict difficulty" but "predict a weak prior, then calibrate fast."** Two threads support this: hierarchical Bayesian IRT recovers usable item parameters at N ≈ 100–200 respondents per item when group structure supplies a prior; and a BERT+LLTM "jump-start" prior on Duolingo reached r = 0.52–0.59 for genuinely new items and then needed only ~6 exposures per item to become useful. The bank's 422 knowledge components / 15 clusters / DOK levels / families are exactly the structure a hierarchical prior needs.

10. **Routing tolerates much worse difficulty estimates than scoring does.** Simulations of adaptive tests with mis-specified clone parameters find θ recovery correlations above 0.97 with 20+ adaptive items and bias under 0.3 (often far less) even when within-family variance is implausibly large. So a 140-item multistage diagnostic that routes on coarse difficulty tiers is a defensible first use of weak estimates; using the same estimates in a reported score or as a fixed IRT slip term is not. (Another reviewer is covering robustness in depth; this is the prediction-side view.)

---

## Findings

### 1. Expert human judgment

**1a. The headline pattern.** Expert judgment of item difficulty is decent at *ranking* and poor at *absolute values*, and pooling across raters is what makes it work at all.

The cleanest single demonstration is Attali, Saldivia, Rupp and Trapani (2014, ETS Research Report). With absolute ratings, correlations between aggregated judgments and empirical difficulty were **r = 0.72–0.83 when pooling ~20 raters**, but only **r = 0.23–0.32 for individual raters**. Their comparative-judgment simulations indicated that **5 raters × 3 comparisons per item** could match the precision of empirical p-values from ~100 test-takers. Tier **A** for the aggregation effect; **B** for the 5×3 equivalence, which is a simulation, not an experiment. (Read full text.)

**1b. Numbers across studies.** The most comprehensive collection I found is Mattar (2000), a UMass Amherst doctoral dissertation on Angoff validity. **I read Mattar's summaries of these studies, not the primary sources**, so each of the following is a secondary citation and should be verified before being quoted anywhere consequential:

| Study (via Mattar 2000) | Design | Correlation with empirical difficulty |
|---|---|---|
| Lorge & Kruglov (1953) | individual judges | r = 0.84–0.87 |
| Smilansky & Guerin (1976) | Nedelsky, pooled | r = 0.22–0.33 |
| Thorndike (1982) | pooled, for equating | r = 0.83 (verbal analogies), 0.72 (figural) |
| Bejar (1983) | 4 raters, 99 TSWE items, estimating *delta*, n = 2,000 examinees | individual r = 0.26, 0.37, 0.38, 0.43 |
| Halpin & Halpin (1987) | 15 judges, college English, pooled, total-group p | Angoff r = 0.57; Ebel r = 0.49; Nedelsky r = 0.24 |
| Melican, Mills & Plake (1987) | Nedelsky, mean ratings, borderline p | r = 0.26–0.28 |
| Smith & Smith (1988) | pooled, HS reading | Angoff r = 0.60; Nedelsky r = 0.37 |
| **Taube (1997)** | **4 social-work licensure exams, 127–140 items, 9–11 judges, mean Angoff → Rasch *b*** | **r = 0.39, 0.40, 0.42, 0.62** |
| Impara & Plake (1998, *JEM* 35:69–81) | 26 teachers, 50-item science test, 724 students | r = 0.78 (individual judge vs borderline p); **only 23%** of item×judge ratings within ±0.10 of borderline p; **41%** within ±0.10 of total-group p |
| Impara et al. (1998) | "concept focusing" variant | r = 0.87 (borderline), 0.79 (typical) |
| Goodwin (1999) | 14 judges, 140 items, mean Angoff vs borderline p | r = 0.55; **39.3%** within ±0.10; the other **60.7% were all overestimates, zero underestimates** |
| Mattar's own results (2000) | professional certification datasets, pooled Angoff vs borderline p | r = 0.615–0.945 |

Two readings of this table matter for the diagnostic.

- **The Taube row is the closest analogue to what this project needs** — converting judgments into an IRT difficulty parameter rather than a p-value — and it is the worst-performing row that used pooled judgments: **r = 0.39–0.62**. Tier **B** (single study, secondary citation, 1990s licensure data).
- **Directional bias is systematic, not random.** Goodwin's 60.7%-overestimates-and-0%-underestimates finding, and the well-documented central-tendency effect (judges overestimate the difficulty of easy items and underestimate the difficulty of hard ones), mean that panel estimates compress the difficulty range. For a *routing* application this is the worst possible error shape: it hollows out the extreme strata the router most needs.

**1c. Medical education specifically.** Two useful data points:

- Sam et al. (2023, *BMC Medical Education* 23, AIG variants in UK undergraduate medicine; four 50-item forms, 444–659 students per form): item-level correlation between **modified Angoff score and empirical facility was r = 0.65, 0.83, 0.68, 0.67** across the four forms. The paper also documents the compression explicitly: "judges underestimated the facility of easy questions and overestimated the facility of difficult questions." Tier **B**. (Read full text.)
- An IRT-based re-analysis of Angoff ratings (Yousuf-type study, *J Educ Eval Health Prof* 2023, PMC10693949): **mean Angoff ratings vs conditional probability of success r = 0.83 (88 items) and 0.84 (88 items)**. Tier **C** — I read only the results snippet, and "conditional probability of success" is a borderline-group quantity, so this is not directly a per-item difficulty correlation.

**1d. What Angoff, bookmark, Ebel and Nedelsky were actually for.** All four are **cut-score methods**, not item-difficulty methods. Their output is a single pass/fail standard for a test; per-item judgments are an intermediate quantity whose individual validity was never the design goal. This is the exact point Impara and Plake (1998) made — if panelists cannot estimate item performance, the *cut score* is in question — and it is why the standard-setting literature reports panel *reliability* (which is high) far more often than panel *item-level accuracy* (which is mediocre). Tier **A** on the design intent.

Method-specific notes: **Angoff** (estimate p for a borderline candidate) transfers most naturally to per-item difficulty, and is the only one of the four with a substantial per-item accuracy literature. **Nedelsky** (which distractors a borderline candidate can eliminate) transfers worst — it is bounded below by 1/k, and its correlations with empirical difficulty are the lowest in the table above (0.22–0.37). **Ebel** (relevance × difficulty categories) lands in between (r = 0.49 in Halpin & Halpin). **Bookmark** operates on an already-calibrated, difficulty-ordered item booklet — it *presupposes* the calibration this project lacks, so it is structurally inapplicable here. Tier **A** for the bookmark point, **B** for the ordering of the others.

**1e. Reliability vs accuracy.** Panel *consistency* is high even where accuracy is not. Plake, Impara & Irwin (1999) found mean absolute difference on repeated ratings of the same items of **0.040–0.083**; Impara & Plake (1997) found round-1-to-round-2 cut-score correlations of **0.90** for Angoff. A 2025 review reports modified Angoff with "reality checks" reaching **ICC 0.917** — I have this from a search result only, have **not** read the source, and it is a cut-score ICC, not per-item. Do not rely on it. The general lesson is that high inter-rater agreement in this literature is not evidence of accuracy, because raters share the same biases (central tendency, curse of knowledge).

**1f. Does training or feedback help?** Feedback with real data helps a lot; training without data helps little.

- The largest effect I found: providing panelists with actual examinee performance data raised the correlation between mean Angoff judgments and empirical conditional p **from 0.34 (post-discussion) to 0.66 (post-data-review)** — Clauser et al., cited in Kolesnikova et al. (2026) as ref [17]. Tier **C**: secondary citation, I did not read the original.
- Providing empirical difficulty for a subset of anchor items raised pooled correlations only slightly, **0.797–0.844 → 0.853–0.874** (Lorge & Kruglov, via Kolesnikova et al.). Tier **C**, secondary.
- Conversely, group estimates of a delta index stayed **below 0.50 even with extensive training** in one study (Bejar, via Kolesnikova et al.). Tier **C**, secondary.

The practical implication is uncomfortable but clear: **the thing that most improves expert judgment is response data**, which is the thing this project does not have. Training a panel in the abstract buys much less.

### 2. Text-feature and NLP-based difficulty prediction

**2a. The benchmark that matters.** The **BEA 2024 Shared Task on Automated Prediction of Item Difficulty and Response Time** (Yaneva et al., BEA workshop at NAACL 2024) is directly on point: **667 USMLE MCQs** from a high-stakes clinical exam, each answered by 300+ medical students, 466 train / 201 test, target = p-value (linearly rescaled), metric = RMSE. 17 teams entered the difficulty track.

- Winner (EduTec — ELECTRA with scalar mixing, rational activations, multi-task setup): **RMSE 0.299**
- `DummyRegressor` baseline (predict the training mean): **RMSE 0.311**
- 15th place: **0.311** — i.e. *half the field failed to beat the mean*, and the top 10 were within 0.009 of each other.

Converting to variance explained (my computation, valid under any linear rescaling of the target): the winner captured **R² ≈ 0.076**, implying **r ≈ 0.28**. The shared-task organisers' own summary: "the challenge of predicting item characteristics remains formidable." Tier **A**. (Read full text.)

**2b. Post-benchmark progress on the same split.** Two peer-reviewed follow-ups, both modest:

| System | USMLE test RMSE | R² vs dummy (my calc) |
|---|---|---|
| DummyRegressor | 0.3110 | 0 |
| Linguistic-features baseline (Ha/Yaneva-style, 17 features + word2vec) | 0.3147 | **negative** |
| BERT embeddings only | 0.3066 | 0.028 |
| GPT-4 asked directly (Li et al. 2025) | 0.3556 | **negative** |
| LLM answer-uncertainty features only, 9 models (Zotos et al. 2025) | 0.3034 | 0.048 |
| Fine-tuned small LM + data augmentation (Li et al. 2025) | 0.2926 | 0.115 |
| BEA winner (EduTec) | 0.2990 | 0.076 |
| **BERT + uncertainty + choice similarity + linguistic features (Zotos et al., EDM 2025)** | **0.2817** | **0.180** |

Tier **A** for the numbers (all held-out, same split, published baselines). Two things stand out. Hand-engineered linguistic features are worse than nothing on this item type. And the current best, at R² ≈ 0.18, still leaves 82% of difficulty variance unexplained.

**2c. Why the field's headline numbers look better than this.** Peters, Zhang, Jiao, Li, Zhou and Lissitz (2025, arXiv preprint — **not peer reviewed**) systematically reviewed 37 studies through May 2025 and advertise "RMSE as low as 0.165, Pearson as high as 0.87." Their own breakdown shows why those are not comparable to each other or to this project:

- RMSE where the target is a raw **p-value**: 0.165–0.268 (N = 6, M = 0.216, SD = 0.035)
- RMSE where the target is a **transformed p-value**: 0.253–0.308 (N = 10, M = 0.291, SD = 0.018) — *"all of the studies that used the transformed p-value difficulty parameter came from the BEA shared task"*
- RMSE where the target is a **Rasch *b***: **0.354–1.295 (N = 8, M = 0.740, SD = 0.297)**
- Other IRT targets: 3PL/GPCM 0.781; delta 2.26
- Pearson r across studies: **0.040–0.870 (N = 17)**, mean reported as 0.5-something (the exact digit was truncated in the copy I could access)

Tier **A** for these being the review's reported figures; Tier **A** for the interpretation that the headline numbers are not comparable, since the review says so itself. **The row that matters for this project is the Rasch *b* row.** A mean RMSE of **0.740 logits** against a typical *b* SD of ~1.0 corresponds to R² ≈ 0.45 at best, and the upper end (1.295) exceeds a typical *b* SD entirely — worse than predicting the mean. Anyone quoting "r = 0.87" for automated difficulty prediction is quoting the best cell of a very heterogeneous table.

**2d. Where text-based prediction genuinely works, and why it will not transfer.** The strong results in this literature cluster in **language testing and reading comprehension**, where item text *is* the construct:

- McCarthy et al. (EMNLP 2021), Duolingo English Test: a BERT+LLTM model "jump-starting" parameters for new items achieved **Pearson 0.52–0.59** for difficulty on genuinely new items, and needed only ~500 test-takers / ~6 exposures per item before the jump-start prior stopped mattering. But the items are C-tests (cloze), where surface linguistic features are close to the measured construct. Tier **A** for the numbers, **A** for the transfer caveat.
- A BERT-IRT approach reportedly reached 0.88–0.89 for unseen items similar to training data and **0.76 for new word stems** (cited in Kolesnikova et al. 2026 as ref [67]). Tier **C**, secondary citation, language-testing domain.
- Zotos et al.'s own non-USMLE datasets are easier than USMLE: Biopsychology (819 short items, 3–4 options) dummy 0.1667 → best 0.1359 (**R² ≈ 0.34**); Cambridge reading (CMCQRD) p-value dummy 0.1833 → best 0.1651 (**R² ≈ 0.19**); CMCQRD scaled-Rasch dummy 9.7568 → best 8.2325 (**R² ≈ 0.29**). Tier **A**.

**MCAT items sit in the hard regime, not the easy one.** They are technical-knowledge and reasoning items with substantial content the text does not expose, closest in kind to USMLE. Expect the USMLE numbers, not the reading numbers.

**2e. Which features actually carry signal.** From the shared-task reports and Zotos et al.'s SHAP analysis, the recurring useful signals are semantic (contextual embeddings of stem + options), **answer-option similarity / distractor plausibility**, and — for response time more than difficulty — analytical-thinking-style lexical measures. Readability and stem length are weak. Tier **B**. Note that distractor similarity alone was actively bad (USMLE RMSE 0.3432–0.3567, well above dummy) and only helped in combination.

### 3. LLM-based difficulty estimation

This is the section where published claims and published numbers diverge most, so I am reporting the numbers first.

**3a. "Ask the model to rate difficulty" — the honest numbers.**

Li, Chen, Xiao, Chen, Jiao and Zhou (*Findings of ACL 2026*), 21+ models across four datasets, direct-prompt Spearman with empirical human difficulty:

| Dataset | Mean ρ across models | Best model |
|---|---|---|
| **USMLE** | **0.13** | GPT-5, 0.36 (GPT-4.1, 0.30) |
| Cambridge reading | 0.30 | GPT-4.1, 0.49 |
| SAT Reading | 0.29 | DeepSeek-R1, 0.50 |
| SAT Math | 0.41 | Qwen2.5-32B, 0.56 |
| Best model average across all four | | GPT-4.1, **0.44** |

Weak models are at or below zero (Llama2-13B on USMLE: ρ = 0.00; Phi3: 0.01; R1-Qwen32B: −0.01). Tier **A** — 21 models, four datasets, peer-reviewed, and the medical column is the relevant one. (Read full text.)

Consistent with this, Raina & Gales (2024, arXiv/BEA) on CMCQRD reading comprehension: **zero-shot absolute rating Spearman 18.3**, comparative 40.4, task-transfer level classification 38.7, combined 43.7. Tier **B** (arXiv preprint, single dataset). Zotos, van Rijn & Nissim (COLING 2025) on 451 Biopsychology items likewise report a "present but weak" correlation between model uncertainty and student response distributions. Tier **A** for the qualitative conclusion.

The optimistic counter-case is Kolesnikova, Fedyanin, Hofman, Brinkhuis & Bolsinova (2026, preprint — **not peer reviewed**), on 6 domains × 60 items of primary-school maths from Prowise Learn / MathGarden (1,700–4,000 responses per item, Rasch difficulty converted to expected proportion correct):

| Configuration (mean of GPT-4o, DeepSeek-Chat, Qwen3-235B) | Spearman [95% bootstrap CI] |
|---|---|
| Absolute · hard decision · zero-shot | 0.486 [0.430, 0.540] |
| Absolute · hard · few-shot | 0.580 |
| Absolute · **soft (token probabilities)** · zero-shot | 0.625 |
| Absolute · soft · few-shot | 0.672 |
| **Pairwise · hard · zero-shot** | **0.730 [0.686, 0.767]** |
| Pairwise · soft · zero-shot | 0.732 |

Per-model averages: GPT-4o 0.673, Qwen3 0.665, DeepSeek 0.633. Domain matters enormously — pairwise reached 0.835 on addition but only 0.617 on word problems.

**Three reasons not to read these as applicable here.** (i) Primary-school arithmetic is the easiest possible domain for an LLM to reason about human difficulty, and the paper's own worst domain is the one requiring reading. (ii) The pairwise design used **exhaustive pairing: 1,770 comparisons per 60 items**, which is O(n²) — 2,108 items exhaustively paired is ~2.2M comparisons. (iii) It is a preprint. Tier **C** for transferability, **B** for the internal findings.

**3b. The one robust, replicated design finding: pairwise beats absolute.** Absolute → pairwise gains: +0.147/+0.122/+0.127 Spearman across three models (Kolesnikova et al.); 18.3 → 40.4 (Raina & Gales); and the same pattern holds for human judges (Attali et al. 2014). Tier **A** for the direction, **B** for the magnitude. Also robust: **using token probabilities instead of the model's discrete answer helps** (+0.14 absolute-judgment Spearman in Kolesnikova et al.; 0.41 → 0.48 in a fine-tuned reading-difficulty judge cited therein).

**3c. Model uncertainty / log-probability as a difficulty proxy.** This is the most credible LLM-based route and the best-documented result on USMLE items. Zotos, van Rijn & Nissim (EDM 2025) ran **nine LLMs (Phi-3.5-mini through Qwen2.5-72B and Llama-3.1-70B)** over each item, extracted **1st-token probability** and **choice-order sensitivity**, and fed them with text features to a random forest:

- Uncertainty features alone, USMLE: **RMSE 0.3034** (dummy 0.3110) → R² ≈ 0.048
- Best full configuration, USMLE: **RMSE 0.2817** → R² ≈ 0.180, r ≈ 0.42 — the best published result on this dataset
- 1st-token probability consistently beat choice-order sensitivity; combining both was best
- Gains held across all four datasets, so this is not a USMLE fluke

Tier **A**. Note the cost profile: nine models × 2,108 items × multiple choice-orderings, on GPUs (they used 2×A100). That is real but bounded compute, and quantised variants worked comparably.

**3d. The specific idea of using an ensemble of weak/strong models' *accuracy* as a difficulty signal — evidence is against it for this item type.** Li et al. (ACL 2026) tested exactly this by fitting IRT to 21 models' correctness patterns ("Machine IRT"):

| Domain | ρ(machine difficulty, human difficulty) | % items solved by 90% of models | % items hard for humans but trivial for models |
|---|---|---|---|
| **USMLE** | **0.134** | **75.6%** | **70.4%** |
| Cambridge | 0.309 | 35.6% | 22.1% |
| SAT Reading | 0.304 | 45.5% | 25.5% |
| SAT Math | 0.386 | 54.6% | 32.2% |

The mechanism is decisive: on medical-knowledge MCQs the model pool is **saturated**, so the correctness matrix has almost no variance left to carry difficulty information, and where it does have variance it points the wrong way (the "savant" column). On ensemble size: on SAT Math, adding models improved correlation from 0.56 to a peak of **0.66 at K = 14** and then degraded; **on USMLE dilution began immediately**. Prompting models to adopt weak/medium/strong student personas barely moved their accuracy (GPT-5 on USMLE: 0.946 baseline, 0.946 under a "strong student" prompt, 0.939 under "weak") — models cannot simulate incompetence on demand. Tier **B** (single study, but 21 models and a clear mechanism). MCAT items are less saturated than USMLE for current models in some sections, but the direction of the finding is unfavourable and this should be treated as evidence against, not for.

**3e. LLMs as simulated respondents.** Two studies, both with important caveats.

Liu, Bhandari & Pardos (2024, *BJET* 55) had six LLMs answer 20 OpenStax College Algebra items, calibrated against N ≥ 99 human respondents:

| Generating source | Pearson r | Spearman ρ | RMSE (logits) |
|---|---|---|---|
| GPT-3.5 | 0.83 | 0.87 | 1.90 |
| GPT-4 | 0.72 | 0.78 | 2.27 |
| Gemini-Pro | 0.68 | 0.61 | 2.67 |
| Cohere Command R+ | 0.65 | 0.72 | 2.02 |
| Llama 3 | 0.18 | 0.32 | 4.03 |
| Llama 2 | −0.01 | −0.07 | 1.37 |
| **Exp. 4: pure LLM ensemble, N = 100** | **0.75** | **0.86** | **1.78** |
| Exp. 3: 1:1 human + LLM ensemble | 0.93 | 0.93 | 0.71 |
| Exp. 1: **humans only**, N = 50 | 0.92 | 0.89 | 0.55 |

**Read that table carefully.** The paper's headline — ensembling raises correlation to 0.93 — is **Experiment 3, which is half real human responses**. Experiment 1, at r = 0.92, contains *no LLM data at all*; it is just half the human sample. The only genuine cold-start row is **Experiment 4: r = 0.75, ρ = 0.86, RMSE 1.78 logits**. An RMSE of 1.78 logits is catastrophic in absolute terms even with decent rank order, and the whole study is **20 items from one algebra lesson**. Tier **C** for anything cold-start. This is the clearest example in this review of a strong-sounding result that does not say what it appears to say.

SMART (Scarlatos et al., *EMNLP 2025 main*) DPO-trains a small LLM to simulate students at instructed ability levels, generates thousands of responses, auto-scores them, and fits IRT. On **49 open-ended 6th-grade reading items** (cross-validated, predictions rescaled to the training mean/SD):

| Method | Pearson | Spearman | RMSE |
|---|---|---|---|
| ICL random ("just ask Llama-3.1-70B") | 0.122 | 0.035 | 1.043 |
| ICL k-NN (retrieve similar calibrated items) | 0.527 | 0.472 | 0.763 |
| Fine-tuned ModernBERT regressor | 0.494 | 0.319 | 0.763 |
| **SBERT k-NN mean (average difficulty of nearest calibrated neighbours)** | **0.596** | **0.522** | **0.681** |
| SMART (Llama-3.2-3B) | 0.674 | 0.566 | 0.620 |

Tier **B** (peer-reviewed, but 49 items, one grade level, open-ended not MCQ, proprietary data). The most transferable line in that table is not SMART — it is **SBERT k-NN mean at Pearson 0.596**: embed the item, average the difficulty of its nearest already-calibrated neighbours. That is a twenty-line method that beat a fine-tuned transformer and every prompting approach.

**3f. Failure modes, stated plainly.** All Tier **A/B**, each with a source above.

- **Range compression / variance collapse.** LLM difficulty predictions cluster narrowly and skew easy. This is the same pathology as human central tendency, and it is the one that most damages adaptive routing.
- **Curse of knowledge.** 70.4% of the USMLE items humans find hardest are trivial for the model pool. Model difficulty and human difficulty are measuring different things.
- **Metacognitive blindness.** AUROC between a model's stated difficulty and its own correctness hovers at **~0.55** (range 0.47–0.73 across 21 models; 0.5 = chance). Models cannot tell which items they will get wrong, so self-reported difficulty is not grounded in anything.
- **Machine consensus.** Inter-model correlations are *higher* than model-human correlations. Agreement between models is therefore not validation; it is shared bias, and it makes ensembles converge on the wrong answer more confidently.
- **Overfitting when tuned on small calibration sets.** Bulut et al. (BEA 2024) reported in-sample r = 0.555 on the USMLE data and out-of-sample performance *worse than the dummy baseline*. With 2,108 items and a small pilot, this is the most likely way to fool oneself.
- **Contamination.** USMLE-style content is heavily represented in pretraining corpora. Zotos et al. deliberately used a non-public Biopsychology set for this reason. Any evaluation on public MCAT-style items is contaminated by default, and MCAT content is extremely well represented online.

### 4. Borrowing difficulty across items

This is the strongest section of the literature for this project's situation, because the bank has explicit structure.

**4a. Item families / clones / item models.** The modelling framework is settled: Glas & van der Linden (2003) and Sinharay, Johnson & Williamson (2003) define the **identical siblings model** (all variants share one item response function), **unrelated siblings model** (each variant independent), and **related siblings model** (RSM — variants' parameters drawn from a family-level distribution, ξ_ip ~ N(μ_p, Σ_p)), summarised for reporting by a **family expected response function**. Tier **A** on the framework. The RSM is exactly the right generative model for an "item family id" column.

Quantitatively:

- **Simulation convention.** Sinharay & Johnson's data generator set **within-family variance = 1/5 of between-family variance** as the realistic case. Tian & Choi (2023, *Applied Psychological Measurement* 47:275–290) used ratios of **10% (small), 20% (medium), 50% (large)**, and explicitly called the 50% condition "unrealistic." With between-family *b* variance of 1.0, those correspond to within-family *b* SDs of **0.32 / 0.45 / 0.71 logits**. Tier **A** for the conventions; Tier **B** that they reflect reality, since they are modelling assumptions.
- **The best empirical figures I found** come from Sam et al. (2023, *BMC Med Educ* 23) — AIG variants (incidental variables only, intended to be isomorphs) of 46 UK undergraduate medical MCQ item models, four variants each, 444–659 students per form:
  - **21 of 46 item models (46%)** had a facility range **≥ 0.15** across their four variants
  - **average within-model facility range across four variants = 0.10** (vs 0.03 for the Angoff scores)
  - worst documented case: **facility range 0.30 (0.30 → 0.60)**, i.e. **≈ 1.25 logits** by my conversion
  - whole-form mean facility varied **0.55 to 0.65** despite the forms being nominally isomorphic
  - Converting the average range to a within-family SD (expected range of 4 normal draws ≈ 2.06σ, my calculation): **within-family SD ≈ 0.20 logits on average**, with a tail reaching ≈ 0.6 logits.
  - Cause, from their qualitative analysis: variants that drifted from the *prototypical* presentation of a condition were much harder, and standard setters did not anticipate it. Tier **B** overall (single study, one country, one discipline, forms not randomised within student).

  Their conclusion is blunt and worth adopting: **"'isomorphic' questions generated by AIG should not be assumed to have the same passing standard, and each variant should be standard set as an individual item."**

- **Consequence for adaptive routing is mild.** Tian & Choi (2023) simulated generating data under the RSM but scoring under the ISM (i.e. treating siblings as identical when they are not): with **≥ 20 adaptive items, correlation between true and estimated θ exceeded 0.97 regardless of within-family variance**; standard errors did not increase dramatically from the 10% to the 50% condition; bias was toward zero and **|bias| < 0.3** in all conditions, and unlike SE, bias was *not* fixed by lengthening the test. Colvin et al. (2016, *JCAT*) simulated a multistage test with clone deviations of **0.4–0.6 logits** and found **bias under 0.04 SD** with parent-clone difficulty correlations of **0.77–0.93**. Tier **A** for the simulations, **B** for their applicability (both assume family means are *known* and deviations are *random and symmetric*; neither holds here).

  The load-bearing caveat in both papers is the same: robustness depends on "fake-easy" and "fake-hard" siblings cancelling out. **A systematic error — e.g. a text model or panel that compresses the difficulty range in one direction — does not cancel and is not covered by these results.**

**4b. Important caution about this bank's family ids.** The AIG literature above concerns clones generated by permuting *incidental* variables from a single parent template. This bank's families are described as "variants of the same underlying question," authored by humans. Human-authored variants are very likely to differ on *radical* as well as incidental features and should be expected to be **more** heterogeneous than the AIG clones in Sam et al. — which already showed 46% of families exceeding a 0.15 facility range. Tier **B** by extrapolation. The practical form of this: treat family id as a strong grouping variable in a hierarchical prior, **not** as a licence to copy one sibling's parameter onto another.

**4c. Hierarchical / multilevel IRT and Bayesian shrinkage.** This is the best-supported route, but note that it addresses *small n*, not *zero n*.

- König, Spoden & Frey (2020, *APM*; PMC7262992) built an optimised hierarchical Bayesian 2PL (non-centred reparameterisation, separated covariances, Cauchy/exponential hyperpriors on variance components) and obtained **accurate item parameter and trait estimates at N = 50–100**, against the usual 2PL recommendation of N ≈ 500+. Hierarchical specifications had **consistently lower RMSE for both item parameters across all sample sizes and test lengths** than the non-hierarchical 2PL, ULSMV and WLSMV; the Bayesian advantage over the least-squares estimators held whenever **N < 500**; average bias did not degrade materially until **N = 100**. Tier **A** (simulation study, but a well-specified one with a clear comparison set).
- Mislevy (1987) established the general "collateral information" approach — use item format, content, and similar non-statistical properties to form empirical Bayes priors. A UMass dissertation on small-sample 3PL estimation with collateral information found **"nontrivial gains in both item parameter and item information recovery"** at N = 100/200/500 with reasonably good collateral information, with the **largest improvements in bias**, and pointed at AIG as the natural source of that information. Tier **B** (dissertation, simulation, read abstract and summary sections only).
- Swaminathan, Hambleton, Sireci, Xing & Rizavi (2003) reportedly found Bayesian estimation with judgmental difficulty information more effective than alternatives at small n. Tier **C** — secondary citation via a Korean-journal article I read; I have not read the original.

Read together: **a weak cold-start prior plus a hierarchical model plus a few hundred responses per item beats either component alone**, and the group structure available here (422 KCs → 15 clusters → 10 Foundational Concepts, plus DOK and family) is unusually well suited to a nested prior. I did not find a study that directly quantifies the gain from *content-taxonomy* priors specifically (as opposed to family or response-time priors) — see "What I could not verify."

**4d. Collaborative filtering / matrix factorisation.** Structurally inapplicable at present. CF and MF decompose an N-students × T-items response matrix into latent factors; with zero responses there is no matrix. Contextual Collaborative Filtering (Zhang et al., AAAI 2018) improves *response prediction* by adding item metadata to the factorisation, but still requires observed responses. Bergner et al. (2012) showed MIRT is itself a special case of collaborative filtering — which cuts the other way: CF is not a new source of information, it is a reparameterisation of the same response data. And the educational papers that advertise solving "the cold-start problem" (Pliakos et al. 2019, *Computers & Education*) solve it for **new learners entering a system with an already-calibrated item pool**, not for new items. Tier **A** on the structural point. CF becomes relevant only after a response matrix exists, at which point ordinary IRT is the better tool anyway.

**4e. Explanatory IRT (LLTM and relatives).** LLTM regresses item difficulty on item features as fixed effects — formally the right model for "predict difficulty from KC, DOK, reasoning operation, and text features."

- Krell et al. (2021) analysed a scientific reasoning test with LLTM and reported item features explaining **up to R² = 0.75** of difficulty variance. Tier **A** for the number as reported, but this is **in-sample fit on a calibrated set**, not out-of-sample prediction for new items. In-sample LLTM R² routinely and dramatically overstates predictive accuracy, because the feature weights are estimated on the same items. Treat any LLTM R² without a held-out set as an upper bound that will not be realised.
- The honest out-of-sample analogue: McCarthy et al.'s BERT+LLTM on Duolingo reached **Pearson 0.52–0.59 (R² ≈ 0.27–0.35) for new items**, on a task where linguistic features are unusually predictive. Tier **A**.
- Note that DOK 1–4 is a plausible LLTM predictor but there is a real risk it is close to circular: if the DOK labels were assigned by the same authors who wrote the items, the "prediction" partly reflects author intent rather than learner behaviour. I found no study quantifying the DOK-to-empirical-difficulty relationship; see "What I could not verify."

**4f. The cheapest borrowing method in the literature, and it is underrated.** From the SMART comparison table (§3e): **SBERT k-NN mean** — embed each item, average the empirical difficulty of its *k* nearest already-calibrated neighbours — reached **Pearson 0.596 / Spearman 0.522 / RMSE 0.681**, beating a fine-tuned ModernBERT regressor (0.494), in-context prompting of a 70B model (0.122 random / 0.527 k-NN), and every method except SMART itself. Tier **C** as a general claim (one dataset, 49 items) but Tier **A** as an implementation cost comparison: it requires one embedding call per item and no training. With family ids, KCs, and lesson ids available as additional similarity signals, this is the obvious first thing to build once *any* items are calibrated.

### 5. How good does a cold-start estimate need to be?

Brief, since another reviewer is covering robustness properly.

- **For routing a multistage or adaptive test: coarse is enough, but unbiased matters.** Tian & Choi (2023) found θ correlations **> 0.97 with ≥ 20 adaptive items** even with within-family *b* SDs of ~0.7 logits, and Colvin et al. (2016) found **bias < 0.04 SD** in a multistage test with clone deviations of 0.4–0.6 logits. A 140-item diagnostic is far longer than either simulation's 20-item condition. What both papers flag is that **random** parameter error washes out while **systematic** error does not — and every cold-start prediction method in this review produces systematic, range-compressing error. So: bin items into 3–5 difficulty strata for routing rather than treating predicted difficulty as continuous, and ensure the routing rule degrades gracefully if the strata are mis-ordered.
- **For a reported score, or for a fixed IRT slip term in a mastery model: not remotely enough.** The Peters et al. review's Rasch *b* RMSE range (0.354–1.295 logits, M = 0.740) is the relevant benchmark, and errors of that magnitude propagate directly into reported ability and into any slip parameter derived from difficulty. A slip term is worse than routing in one specific way: routing errors self-correct over a long test, while a mis-specified slip term biases every mastery inference in the same direction indefinitely. Estimate slip from data, or from a defensible prior on guessing (≈ 0.25 for 4-option items), rather than from predicted difficulty.

---

## Method comparison table

Accuracy figures are the best *held-out* result I found for each method, with the metric and domain stated, because the metrics are not comparable across rows. "USMLE R²" figures are my computation from published RMSEs against the published dummy baseline.

| Approach | What it needs | Best documented accuracy | Effort | Viable here? |
|---|---|---|---|---|
| **Pooled expert panel, absolute (Angoff-style)** | 5–20 SMEs × 2,108 items | Rank r ≈ 0.55–0.85 (pooled); **r = 0.39–0.62 for Rasch *b*** (Taube); only 23–41% of ratings within ±0.10 of p | Very high labour; 2,108 items × several raters | **Partly.** Best available cold-start signal, but cost is the binding constraint and output is rank-only with mean-reverting bias |
| **Pooled expert panel, pairwise comparison** | 5+ SMEs, sampled pairs | Simulated equivalent of ~100 test-takers at 5 raters × 3 comparisons (Attali); consistently beats absolute | Moderate if pairs are sampled, not exhaustive | **Yes — best human option.** Use sampled pairs + Bradley–Terry, not all-pairs |
| **Hand-engineered text features + regression** | Feature pipeline, training labels | **Worse than the mean on USMLE** (RMSE 0.3147 vs 0.3110) | Low | **No.** Actively harmful on this item type |
| **Fine-tuned transformer regressor** | ≥ several hundred *calibrated* items | USMLE RMSE 0.2926–0.299 → **R² 0.08–0.12** | Moderate (GPU, training) | **No, not yet.** Requires calibrated labels this bank does not have |
| **LLM asked to rate difficulty (absolute)** | API calls only | **USMLE ρ = 0.13 mean, 0.36 best**; 0.49 Spearman on absolute+soft+few-shot in easier domains | Very low | **No.** Cheapest and among the least accurate; do not route on it |
| **LLM pairwise comparison → Bradley–Terry** | O(n²) or sampled pairs | Spearman 0.730 (primary maths); 0.404 (reading) | Low–moderate; exhaustive pairing is 2.2M calls at n = 2,108 | **Prototype only.** Best LLM-judgment variant; unvalidated on medical MCQs; sample pairs |
| **LLM token-probability / uncertainty ensemble + text features** | 5–9 models with logprob access, GPU or API | **USMLE RMSE 0.2817 → R² ≈ 0.18, r ≈ 0.42** (best published on USMLE); uncertainty alone R² ≈ 0.05 | Moderate (9 models × 2,108 items × choice permutations); needs calibrated labels to fit the regressor | **Prototype, with labels.** Best *automated* route on the closest item type |
| **Ensemble of model *correctness* as difficulty (the "weak/strong models" idea)** | Many models answering every item | **USMLE ρ = 0.134**; 75.6% of items saturated; adding weak models degraded USMLE immediately | Moderate | **No.** Evidence is specifically against it for medical-knowledge MCQs |
| **LLM-simulated respondents → IRT** | Simulated response matrix, optional fine-tuning | Pure-LLM ensemble r = 0.75 / **RMSE 1.78 logits** (20 algebra items); SMART r = 0.674 (49 open-ended reading items) | High (DPO fine-tuning, scoring model, thousands of generations) | **No.** Highest effort, weakest evidence base, worst absolute error |
| **Copy difficulty within item family** | Family ids (available) | Parent-clone r = 0.77–0.93 in simulation; empirically **46% of families spread ≥ 0.15 in p**, worst 1.25 logits | Trivial | **Yes, as a prior — never as a fact.** Highest value per unit effort in the whole table |
| **Hierarchical / multilevel Bayesian IRT with KC / cluster / DOK / family priors** | Some responses (~50–200 per item) | Accurate item params at **N = 50–100**; consistently lower RMSE than non-hierarchical at all N < 500 | Moderate (Stan/`brms`; real modelling work) | **Yes — this is the destination.** Does not work at N = 0, works unusually well at small N |
| **Explanatory IRT / LLTM on item features** | Calibrated subset + feature matrix | In-sample R² up to 0.75 (not predictive); out-of-sample r = 0.52–0.59 in the favourable case | Moderate | **Later.** Good once a calibrated subset exists; distrust in-sample R² |
| **k-NN over item embeddings + metadata** | Embeddings + *any* calibrated items | Pearson 0.596 / RMSE 0.681 (49 reading items), beat a fine-tuned transformer | Very low | **Yes, as soon as any items are calibrated.** Best accuracy-per-effort ratio available |
| **Collaborative filtering / matrix factorisation** | A response matrix | n/a | n/a | **No.** Structurally impossible with zero responses |

---

## DOK 1 — established facts

1. The BEA 2024 shared task on automated item difficulty prediction used **667 USMLE MCQs** (466 train / 201 test), target = p-value, metric = RMSE. Winner 0.299; `DummyRegressor` 0.311; 15th place 0.311; top ten within 0.009 of each other.
2. The best published result on that USMLE test split is **RMSE 0.2817** (Zotos et al., EDM 2025), using nine LLMs' answer uncertainty plus BERT text features, choice similarity and linguistic features.
3. Directly prompting GPT-4 for a difficulty value on that dataset gave **RMSE 0.3556** — worse than predicting the training mean.
4. A hand-engineered linguistic-feature baseline on that dataset gave **RMSE 0.3147** — also worse than the mean.
5. Across 21+ LLMs, mean Spearman between prompted difficulty and empirical human difficulty is **0.13 on USMLE**, 0.30 on Cambridge reading, 0.29 on SAT Reading, 0.41 on SAT Math.
6. **75.6% of USMLE items are answered correctly by 90% of models**, and **70.4% of the items in the hardest human tertile are trivial for 90% of models**.
7. LLM AUROC for predicting their own errors from their own difficulty ratings is **≈ 0.55** (chance = 0.50) across 21 models.
8. Pairwise/comparative elicitation beats absolute rating for both humans and LLMs: **+0.12 to +0.15 Spearman** (LLM, primary maths); **18.3 → 40.4 Spearman** (LLM, reading); documented for human raters since at least the 1950s.
9. Pooled expert panels correlate with empirical difficulty far better than individual raters: **r = 0.72–0.83 pooled (~20 raters) vs 0.23–0.32 individual** (Attali et al. 2014).
10. Converting pooled Angoff judgments into Rasch *b* yielded **r = 0.39, 0.40, 0.42, 0.62** across four licensure exams (Taube 1997, via Mattar 2000).
11. Only **23%** of individual Angoff item ratings fell within ±0.10 of the borderline-group p-value, and **41%** within ±0.10 of the total-group p-value (Impara & Plake 1998, via Mattar 2000).
12. Panel error is directionally systematic: Goodwin (1999) found 60.7% of items overestimated and **0% underestimated**.
13. Angoff, Ebel, Nedelsky and bookmark are **cut-score methods**. Bookmark structurally requires an already-calibrated, difficulty-ordered item pool.
14. Giving panelists real performance data raised Angoff–empirical correlation from **0.34 to 0.66** in one study (Clauser et al., secondary citation).
15. In AIG variants of 46 medical MCQ item models, the **average within-family facility range across four variants was 0.10**, **21/46 families exceeded 0.15**, and the worst reached **0.30 in p-value**.
16. Standard simulation practice sets within-family variance at **10–50% of between-family variance**, with 20% typical and 50% described by its own author as unrealistic.
17. In simulation, ignoring within-family variance in an adaptive test still gives **θ recovery correlation > 0.97 with ≥ 20 items**, with **|bias| < 0.3** that lengthening the test does not fix.
18. Multistage testing with clone deviations of **0.4–0.6 logits** produced **bias under 0.04 SD** (Colvin et al. 2016).
19. Hierarchical Bayesian 2PL recovers accurate item parameters at **N = 50–100** respondents, and beats non-hierarchical and least-squares estimators at every **N < 500**.
20. Across 37 studies, automated difficulty prediction achieved Pearson **0.040–0.870** (N = 17) and Rasch-*b* RMSE **0.354–1.295 logits** (N = 8, M = 0.740).
21. Collaborative filtering requires an observed response matrix; MIRT is a special case of collaborative filtering (Bergner et al. 2012), so CF adds no information beyond the responses.
22. LLTM in-sample R² has reached **0.75**; the best out-of-sample equivalent found here is **r = 0.52–0.59** on Duolingo C-tests.

## DOK 2 — insights and implications

1. **Reframe the goal.** The literature does not support "predict difficulty." It supports "construct a weak, honestly-uncertain prior, then calibrate quickly and let a hierarchical model do the work." Every method in this review that reports strong numbers turns out, on inspection, to have had access to response data — Liu et al.'s r = 0.93 was half human; the fine-tuned transformers needed calibrated training labels; the 0.75 LLTM R² was in-sample. The genuinely response-free results cluster at r ≈ 0.13–0.45.

2. **The one asset here that most of the literature lacks is structure, and it is being under-exploited relative to text modelling.** 422 knowledge components nested in 15 clusters nested in 10 Foundational Concepts, plus DOK, plus family ids, is precisely the nested prior a hierarchical IRT model wants. The evidence says a hierarchical model with that structure and ~100 responses per item will beat anything text-based with zero responses. So the highest-value engineering is the calibration pipeline and the prior structure, not a difficulty predictor.

3. **Rank order and absolute location fail differently, and only one of them is needed first.** Every method reviewed does better at ordering items than at placing them on a scale (pooled Angoff r up to 0.85 for rank vs 60.7% of absolute values overestimated; LLM Spearman 0.73 vs RMSE 1.78 logits). A router that consumes *strata* rather than *b values* consumes exactly the part of the signal that is real. Committing to continuous predicted *b* anywhere in the system imports the part that is not.

4. **Range compression is the specific failure that breaks a difficulty-routing diagnostic, and every cold-start method exhibits it.** Human panels revert to the mean; LLM predictions "cluster narrowly and skew towards lower values"; regression-to-the-mean predictors literally minimise variance. The consequence is that predicted-hard and predicted-easy strata will both be contaminated with medium items, so a multistage router will under-differentiate at exactly the ability extremes where routing matters. Two mitigations the literature supports: elicit *comparisons* rather than ratings (comparative judgment preserves spread), and stratify by predicted rank quantile rather than by predicted value.

5. **The proposed model-ensemble-accuracy signal should be dropped, but its "soft" cousin kept.** These are two different mechanisms and the evidence separates them cleanly. Correctness on medical-knowledge MCQs is saturated (75.6%) and anti-correlated with human difficulty on the hardest third of items, so a correctness ensemble mostly measures which items are in the models' training data. Token log-probabilities remain graded even where correctness is saturated, and that is where the ~5% of variance in the Zotos result comes from. If any part of this family gets built, it is 1st-token probability across a handful of models, not "did the model get it right."

6. **Family ids should feed a shrinkage prior, not a copy operation.** 46% of nominally isomorphic families spread ≥ 0.15 in p, with a tail to 1.25 logits, and this bank's human-authored "variants of the same underlying question" are probably *more* heterogeneous than those AIG clones. The RSM formulation is the right one: family mean as the borrowed quantity, family variance estimated and *reported*, so sibling estimates carry visibly wide intervals. The failure mode to design against is a single hard-to-place family silently anchoring a routing decision.

7. **Contamination makes internal evaluation of any LLM-based method almost impossible to trust.** MCAT-style content is abundant online, so a model's log-probability on these items partly reflects memorisation. The one design that survives this is holding out items whose empirical difficulty is measured *after* the method was fixed — i.e. evaluate the predictor prospectively against the first real response data, and treat any retrospective evaluation as an upper bound.

8. **k-NN over item embeddings is the highest-leverage thing to build the moment the first responses arrive.** It beat a fine-tuned transformer and every prompting method on the one dataset where it was compared, costs one embedding call per item, and gets strictly better as calibration proceeds. With family id, KC, lesson id and DOK available as similarity signals in addition to text embeddings, there is a good case it will do better here than in the published comparison. It also degrades gracefully and is trivially explainable to a non-psychometrician — both real advantages for a small team.

9. **Pairwise SME comparison on a sampled subset is the best use of scarce expert time, and the cost scales far better than it appears.** Exhaustive pairing is O(n²) and infeasible at 2,108 items, but Attali et al.'s simulation suggests **5 raters × 3 comparisons per item** approximates 100 test-takers — roughly 30,000 judgments for the full bank, or a few thousand if restricted to one representative item per family plus a within-family anchor set. Bradley–Terry then puts them on a common scale. This is the only cold-start method in the review with both a defensible accuracy claim and a tractable cost at this bank size.

10. **The IRT slip term is the riskiest of the three intended uses and should not depend on predicted difficulty at all.** Routing errors self-correct over 140 items; a mis-specified slip parameter biases every mastery inference in the same direction for as long as it is in place. For 4-option items there is a defensible default (≈ 0.25 asymptote) that requires no prediction. Deriving slip from predicted difficulty would propagate an r ≈ 0.3 signal into an unbounded number of downstream mastery decisions.

11. **A distinctive asset here is unexploited by the whole literature: per-choice explanation prose for all four options.** Every text-based method reviewed operates on stem + options. Distractor plausibility and option similarity are among the few features that consistently carried signal in the shared task. Written rationales for *why each distractor is wrong* are a richer encoding of distractor plausibility than embedding similarity of the option strings, and I found no study that uses them. This is genuinely novel territory, which means it is unvalidated: worth a cheap experiment once labels exist, not worth betting the router on.

---

## What I could not verify

- **The exact mean Pearson correlation in Peters et al. (2025).** The sentence reporting it is truncated in every copy I could access ("N = 17, 0.5…"). I have the range (0.040–0.870) and N; the mean is somewhere in the 0.5s.
- **Impara & Plake (1998) primary source.** I read the abstract (ERIC EJ569607) and Mattar's (2000) detailed summary, not the *JEM* article. The r = 0.78 / 23% / 41% figures are Mattar's report of it.
- **All rows in the §1b table except Mattar's own.** These are secondary citations through Mattar (2000), a doctoral dissertation. Taube (1997), Goodwin (1999), Bejar (1983), Thorndike (1982), Lorge & Kruglov (1953), Smith & Smith (1988), Halpin & Halpin (1987), Melican et al. (1987), Smilansky & Guerin (1976) — I read none of these directly. The Taube r = 0.39–0.62 figures in particular are load-bearing in my conclusions and should be checked against the original before being relied on.
- **The Clauser 0.34 → 0.66 feedback effect** and the **Lorge & Kruglov anchor-item effect (0.797–0.844 → 0.853–0.874)**. Both read in the related-work section of Kolesnikova et al. (2026), a preprint. Secondary, unverified.
- **The "modified Angoff with reality checks, ICC 0.917" figure.** Seen in a search-result snippet attributed to a 2025 medical-education review. I did not read the source, do not have the citation, and it is a cut-score ICC rather than an item-level reliability. Do not use.
- **Sinharay & Johnson's empirical within-family variance components from real data.** I confirmed their *simulation* convention (within = 1/5 of between) and the RSM/ISM/USM framework, and read the abstracts of the ETS reports, but did not obtain full text of the 2003/2008 papers or their NAEP application. The only empirical family-spread figures in this review are from Sam et al. (2023).
- **Whether hierarchical priors built on a *content taxonomy* specifically (KC / cluster / DOK) improve calibration, and by how much.** I found the general hierarchical-Bayes small-sample result and the general collateral-information result, but no study that quantifies the gain from content-hierarchy priors as opposed to item-family or response-time priors. This is a real gap for this project, since the content taxonomy is its main asset.
- **Any empirical relationship between DOK level and empirical item difficulty.** I searched and found nothing usable. The circularity risk (DOK assigned by the item author, then used to predict how learners behave) is my inference, not a documented finding.
- **Any MCAT-specific published item-difficulty data or AAMC-published item parameters.** I did not locate any. All medical-adjacent evidence here is USMLE or UK undergraduate medicine.
- **Response-time features.** BEA 2024 had a second track (best RMSE 23.927s vs baseline 31.68s — notably a much larger relative gain than for difficulty) and response time is a documented source of collateral information for IRT calibration (van der Linden et al. 2010). I did not pursue this, but it is relevant once the app is logging: response time will be available from day one and may be a better difficulty proxy than any text feature.
- **Peer-review status of three sources used above.** Peters et al. (2025), Kolesnikova et al. (2026) and Raina & Gales (2024) are preprints. Mattar (2000) is a dissertation. Attali et al. (2014) is an ETS Research Report (internally reviewed, not journal peer-reviewed).
- **Publication venue confirmation for Li et al. (ACL 2026).** The PDF header reads "Findings of the Association for Computational Linguistics: ACL 2026, pages 25414–25441," which I take at face value; given the current date I have not seen an independent index entry.

---

## Sources

Ranked by usefulness for this specific decision.

**1. Zotos, L., van Rijn, H. & Nissim, M. — "Are You Doubtful? Oh, It Might Be Difficult Then! Exploring the Use of Model Uncertainty for Question Difficulty Estimation."** EDM 2025 (peer-reviewed). https://educationaldatamining.org/EDM2025/proceedings/2025.EDM.long-papers.104/2025.EDM.long-papers.104.pdf · arXiv:2412.11831 (author list confirmed against the arXiv record). **Tier A. Read full text (results tables verified line by line).** Best published result on the USMLE benchmark (RMSE 0.2817 vs dummy 0.3110), and the only careful decomposition of which feature families help on this exact item type. This is the paper to replicate first if an automated route is attempted.

**2. Li, M., Chen, H., Xiao, Y., Chen, J., Jiao, H. & Zhou, T. — "Can LLMs Estimate Student Struggles? Human-AI Difficulty Alignment with Proficiency Simulation for Item Difficulty Prediction."** *Findings of ACL 2026*, 25414–25441. https://github.com/MingLiiii/Difficulty_Alignment. **Tier A. Read full text.** The decisive evidence against LLM-rated difficulty and against model-correctness ensembles for medical-knowledge MCQs: USMLE ρ = 0.13, 75.6% saturation, 70.4% savant rate, AUROC 0.55, immediate ensemble dilution on USMLE. Directly answers the question that was asked about ensembles.

**3. Yaneva, V. et al. — "Findings from the First Shared Task on Automated Prediction of Difficulty and Response Time for Multiple-Choice Questions."** BEA workshop, NAACL 2024. https://aclanthology.org/2024.bea-1.39/ **Tier A. Read full text.** The benchmark. 667 USMLE MCQs, winner 0.299 vs dummy 0.311, half the field below baseline. Establishes the realistic ceiling for text-based prediction on MCAT-like items, and its limitations section is unusually honest about p-values vs IRT parameters.

**4. Sam, A. H. et al. — "Automated Item Generation: impact of item variants on performance and standard setting."** *BMC Medical Education* 23 (2023). https://doi.org/10.1186/s12909-023-04457-0 **Tier B. Read full text.** The only real empirical within-family difficulty spread I found: 21/46 families ≥ 0.15 facility range, mean range 0.10, worst 0.30. Also supplies medical-education Angoff-vs-facility correlations (0.65–0.83) and documents range compression in panel judgments. Directly informs how much to trust the family id column.

**5. Attali, Y., Saldivia, L., Jackson, C., Schuppan, F. & Wanamaker, W. — "Estimating Item Difficulty With Comparative Judgments."** ETS Research Report Series 2014(2), RR-14-32. https://doi.org/10.1002/ets2.12042 **Tier A/B (ETS report, internally reviewed). Read full text.** Pooled r = 0.72–0.83 vs individual 0.23–0.32; the 5-raters × 3-comparisons ≈ 100-test-takers simulation. The quantitative basis for preferring pooled pairwise SME judgment over anything else available at N = 0. *Author list reconstructed from the DOI record; verify before citing.*

**6. Mattar, J. D. — "Investigation of the Validity of the Angoff Standard Setting Procedure for Multiple-Choice Items."** Doctoral dissertation, University of Massachusetts Amherst (2000). https://scholarworks.umass.edu/dissertations_1/5395 · https://doi.org/10.7275/16131955 **Tier B for own results (pooled Angoff vs borderline p, r = 0.615–0.945); Tier C for the studies it summarises. Read the literature review and results sections.** The single densest collection of expert-judgment-vs-empirical-difficulty correlations. Every number I drew from its literature review is a secondary citation.

**7. Tian, C. & Choi, J. — "The Impact of Item Model Parameter Variations on Person Parameter Estimation in Computerized Adaptive Testing With Automatically Generated Items."** *Applied Psychological Measurement* 47(4), 275–290 (2023). https://doi.org/10.1177/01466216231165313 · https://pmc.ncbi.nlm.nih.gov/articles/PMC10240571/ **Tier A. Read full text.** Quantifies the cost of treating heterogeneous siblings as identical: θ correlation > 0.97 at ≥ 20 adaptive items, |bias| < 0.3 and not fixable by test length, with the crucial condition that deviations must cancel. Defines the 10/20/50% within-family variance conventions.

**8. Peters, S. C., Zhang, N., Jiao, H., Li, M., Zhou, T. & Lissitz, R. W. — "Text-Based Approaches to Item Difficulty Modeling in Large-Scale Assessments: A Systematic Review."** arXiv:2509.23486 (Sept 2025). **Preprint, NOT peer reviewed. Tier A for its reported aggregates. Read the results section.** 37 studies. The reason to cite it is the *disaggregated* table (Rasch-*b* RMSE 0.354–1.295, M = 0.740; p-value RMSE 0.216; Pearson 0.040–0.870), which contradicts its own abstract's "RMSE as low as 0.165, Pearson as high as 0.87." Useful as a map of the field and as a caution about headline numbers.

**9. Li, M., Jiao, H., Zhou, T., Zhang, N., Peters, S. C. & Lissitz, R. W. — "Item Difficulty Modeling Using Fine-tuned Small and Large Language Models."** *Educational and Psychological Measurement* (2025). **Tier A. Read full text.** Fine-tuned SLM + augmentation reaches RMSE 0.2926 on the BEA split; GPT-4 prompted directly reaches 0.3556, worse than the mean. The cleanest single comparison of "fine-tune a small model" vs "ask a big model."

**10. Liu, Y., Bhandari, S. & Pardos, Z. A. — "Leveraging LLM respondents for item evaluation: A psychometric analysis."** *British Journal of Educational Technology* 55 (2024). https://doi.org/10.1111/bjet.13570 **Tier C for cold-start conclusions. Read full text including experiment definitions.** Included specifically as a cautionary case: the headline r = 0.93 is a 1:1 mixture with real human responses, the human-only condition is r = 0.92 with no LLM involvement, and the only genuine cold-start row is r = 0.75 with RMSE 1.78 logits on 20 items from one algebra lesson.

**11. Kolesnikova, D., Fedyanin, K., Hofman, A. D., Brinkhuis, M. J. S. & Bolsinova, M. — "Estimating Item Difficulty with Large Language Models as Experts."** Preprint, April 2026. Materials at https://osf.io/fpa5v **Preprint, NOT peer reviewed. Tier B internally, Tier C for transfer. Read full text.** The best factorial design on LLM difficulty elicitation: pairwise (ρ 0.730) > absolute+soft+few-shot (0.672) > absolute+hard+zero-shot (0.486), on 360 primary-school maths items. Its related-work section is also the best available survey of human expert-judgment accuracy. Domain is maximally favourable and pairing was exhaustive.

**12. McCarthy, A. D. et al. — "Jump-Starting Item Parameters for Adaptive Language Tests."** EMNLP 2021. https://aclanthology.org/2021.emnlp-main.67/ **Tier A. Read full text.** BERT+LLTM priors for new items reach Pearson 0.52–0.59, then need only ~6 exposures per item. The best available model of the "weak prior + fast calibration" strategy — and a caution, since C-test items are the favourable case.

**13. Scarlatos, A., Fernandez, N., Ormerod, C. et al. — "SMART: Simulated Students Aligned with Item Response Theory for Question Difficulty Prediction."** *EMNLP 2025* (main). https://aclanthology.org/2025.emnlp-main.1274.pdf · arXiv:2507.05129 **Tier B. Read results tables and limitations.** Cited less for SMART (PCC 0.674 on 49 open-ended items) than for its baseline table, which shows "just ask a 70B model" at PCC 0.122 and **SBERT k-NN mean at 0.596** — the cheapest method in this entire review, beating a fine-tuned transformer.

**14. König, C., Spoden, C. & Frey, A. — "An Optimized Bayesian Hierarchical Two-Parameter Logistic Model for Small-Sample Item Calibration."** *Applied Psychological Measurement* 44(4) (2020). https://doi.org/10.1177/0146621619893786 · https://pmc.ncbi.nlm.nih.gov/articles/PMC7262992/ **Tier A. Read results section.** Accurate 2PL item parameters at N = 50–100 with an optimised hierarchical specification; hierarchical beats non-hierarchical at all N < 500. The technical basis for the "calibrate fast with a hierarchical prior" recommendation.

**15. Colvin, K. F. et al. — "Effect of Imprecise Parameter Estimation on Ability Estimation in a Multistage Test in an Automatic Item Generation Context."** *Journal of Computerized Adaptive Testing* (2016). **Tier B. Read full text.** MST with clone deviations of 0.4–0.6 logits yields bias < 0.04 SD, parent-clone r = 0.77–0.93. The most directly relevant robustness result for a 140-item multistage design, though it assumes known family means and random deviations.

**16. Raina, V. & Gales, M. — "Question Difficulty Ranking for Multiple-Choice Reading Comprehension."** arXiv:2404.10704 (2024). **Preprint. Tier B. Read abstract and results table.** Zero-shot absolute 18.3 vs comparative 40.4 vs combined 43.7 Spearman on CMCQRD. Second independent confirmation that comparative elicitation dominates absolute rating for LLMs.

**17. Zotos, L., van Rijn, H. & Nissim, M. — "Can Model Uncertainty Function as a Proxy for Multiple-Choice Question Item Difficulty?"** COLING 2025, 11304–11316. https://aclanthology.org/2025.coling-main.749/ **Tier A. Read abstract and conclusions.** Weak but statistically significant uncertainty-difficulty correlation on 451 Biopsychology items, varying by question type. The honest precursor to source #1; notable for deliberately using non-public items to avoid contamination.

**18. Sinharay, S., Johnson, M. S. & Williamson, D. M. — "Calibrating Item Families and Summarizing the Results Using Family Expected Response Functions."** *JEBS* 28(4), 295–313 (2003). https://doi.org/10.3102/10769986028004295 · related: *Applied Psychological Measurement* 29 (2005) doi:10.1177/0146621605276675; ETS RR 2003. **Tier A for the framework. Abstracts and the polytomous paper's simulation section only — did not read the primary full texts.** The ISM/RSM/USM framework and the family expected response function; source of the "within-family variance = 1/5 of between-family" convention.

**19. Impara, J. C. & Plake, B. S. — "Teachers' Ability to Estimate Item Difficulty: A Test of the Assumptions in the Angoff Standard Setting Method."** *Journal of Educational Measurement* 35(1), 69–81 (1998). https://doi.org/10.1111/j.1745-3984.1998.tb00528.x **Tier A for the conclusion, Tier C for the numbers. ABSTRACT ONLY** (plus Mattar's summary). The canonical "experts cannot estimate item difficulty" citation: 26 teachers, 50 items, 724 students, accuracy "not high" for either total or borderline group.

**20. Wauters, K., Desmet, P. & Van den Noortgate, W. — "Item difficulty estimation: An auspicious collaboration between data and judgment."** *Computers & Education* 58 (2012). **Tier B. Read full text (via cached copy).** Compares proportion correct, learner feedback, Elo, and one-to-many comparison at small n. Proportion correct correlated best with IRT; Elo reached r = 0.702 at n = 5 and 0.905 at n = 50. Relevant to what to do in the first weeks of live data rather than at N = 0.

**21. Bulut, O. et al. — "Item Difficulty and Response Time Prediction with Large Language Models: An Empirical Analysis of USMLE Items."** BEA workshop, NAACL 2024. **Tier B. Read full text.** In-sample r = 0.555 but out-of-sample worse than the dummy baseline. The clearest published example of the overfitting trap this project would be exposed to with a small calibration pilot.

**22. Krell, M. et al. — "Analyzing Cognitive Demands of a Scientific Reasoning Test Using the Linear Logistic Test Model (LLTM)."** (2021). **Tier B. Read full text.** LLTM in-sample R² up to 0.75. Included as the reference point for why in-sample explanatory-IRT R² must not be read as predictive accuracy.

**23. Pliakos, K. et al. — "Integrating machine learning into item response theory for addressing the cold start problem in adaptive learning systems."** *Computers & Education* 137 (2019). https://doi.org/10.1016/j.compedu.2019.04.009 **Tier A for the structural point. Read abstract and method summary.** Cited to establish what the educational "cold start" literature actually solves: new *learners*, not new items. IRT+Random Forest on learner side-information. Confirms collaborative filtering is inapplicable here.

**24. Zhang, S. et al. — "Contextual Collaborative Filtering for Student Response Prediction in Mixed-Format Tests."** AAAI 2018. https://doi.org/10.1609/aaai.v32i1.12187 **Tier B. Abstract and method section only.** Matrix factorisation with item metadata for response prediction. Requires an observed response matrix; included to document why the CF route is closed at present.

**25. Glas, C. A. W. & van der Linden, W. J. — "Computerized Adaptive Testing With Item Cloning."** *Applied Psychological Measurement* 27 (2003). **Tier A by consensus. NOT READ — cited only through Sinharay et al. and Tian & Choi (2023).** The origin of the hierarchical item-cloning model and of the "robust as long as within-family variation is random" result that the later simulations rest on. Should be read before the family-borrowing design is finalised.
