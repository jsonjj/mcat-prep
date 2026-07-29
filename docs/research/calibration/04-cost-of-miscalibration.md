# The Cost of Miscalibration: How Much Measurement Quality Is Actually Lost When Item Parameters Are Wrong

**Lane purpose:** establish how much is lost when item parameters are wrong, misspecified, or estimated from too little data — and therefore how good is good enough for a 140-item MST onboarding diagnostic that reports a top-2 weakest-concept shortlist, adaptive practice selection, and a slip term in a BKT mastery model.

**Evidence tiering used throughout:** **[A]** strong direct empirical evidence or authoritative consensus · **[B]** reasonable evidence with limits · **[C]** weak, indirect, single-source, or my own derivation.

**Reading disclosure:** full text was read for van der Linden & Glas (2000), Olea et al. (2012), Cheng, Patton & Shao (2015) results tables, Fink et al. (2025) intro, McGrath (2019), Yiğiter & Doğan (2023) results tables, Wauters et al. (2011), Beck & Chang (2007), Pardos & Heffernan (2011), Sinharay (2010) / ETS RM-08-18, Linacre (1994). Abstract-only sources are flagged inline and listed in *What I could not verify*.

---

## Executive answer

- **Item *difficulty* is the easy parameter, and it is the only one this team actually needs.** Difficulty (`b`) recovers almost perfectly from modest samples: `r(b̂, b) = .99` at N = 500 in a 3PL Bayesian calibration, with RMSE(b) ≈ 0.15 logits [A: Olea et al., 2012]. Discrimination (`a`) recovers at `r = .73` and guessing (`c`) at `r = .48` at the same N. **Almost all of the published damage from "bad calibration" is damage from bad `a` and `c`, not bad `b`.** A design that never estimates `a` or `c` sidesteps the majority of the literature's horror stories.

- **Going from *perfect* item parameters to parameters calibrated on only N = 500 costs about 5–10% in θ RMSE, and essentially nothing in θ *rank order*.** In a 520-item 2PL CAT: RMSE(θ) = .173 with true parameters → .189 at N = 500 (40 items); `r(θ̂, θ)` falls from .985 to .984 [A: Cheng, Patton & Shao, 2015].

- **The realistic worst case — item parameters with roughly *zero* correlation to truth — inflates θ RMSE by ~20–50%, not 300%.** Scoring with a completely wrong, independently drawn parameter set moved RMSE(θ) from .237 → .358 (pattern EAP) and .258 → .318 (summed EAP) [A: McGrath, 2019]. This is the honest upper bound on what a bad DOK-derived prior can cost, and it is bounded, not catastrophic. But note the *variance* explosion: bias SD went from 0.008 to 0.20, with individual replications reaching ±0.5–0.7 logits.

- **Miscalibration damages the *claimed* precision far more than the *actual* accuracy.** This is the single most important finding for this team. Capitalization on chance inflates reported test information by 25–40% at N = 400–500 [A: Hambleton, Jones & Rogers, 1993 via van der Linden & Glas, 2000; Olea et al., 2012], meaning standard errors are too small by up to 40% — while RMSE(θ) over the central θ range is *statistically indistinguishable* across calibration sample sizes [A: Olea et al., 2012]. **A product that reports no score and no SE is largely immune to the worst documented effect of miscalibration.** A product that reports a confidence number, a percentile, or uses SE-based stopping is fully exposed.

- **Ordinal and classification decisions are markedly more robust than point scores, and the evidence supports this quantitatively.** θ estimates correlate `r ≥ .978` across 1PL/2PL/3PL fits to the same real data even when the 3PL fits significantly better [A: De Ayala, 2022]. Generating from a 3PL and fitting Rasch doubles RMSE(θ) (0.3–0.5 vs < 0.2) but leaves `r(θ̂, θ) > .95` [A: Shim, Bonifay & Wiedermann, 2023]. Constraining all discriminations equal in a diagnostic classification model produced "virtually no loss in classification accuracy," with 0.87–0.99 agreement to the unconstrained model across 108 conditions [A: 1-PLCDM, 2024]. Ordering is the most parameter-robust functional of θ that exists.

- **MST routing is robust, and it is already noisy for reasons that have nothing to do with calibration.** With *perfectly known* parameters, 15–21% of examinees are misrouted anyway, purely from routing-module sampling error, and misrouting costs only about +0.03 in RMSE(θ) (0.269 → 0.295) [A: Yiğiter & Doğan, 2023]. Two-stage MST misrouting impact was "generally minimal" [B: Kim & Moses, 2014, abstract only]. **Difficulty error large enough to shift one learner by one module costs roughly what the design's existing noise floor already costs.**

- **BKT is close to insensitive to the item-level difficulty/slip parameters it consumes.** There is an infinite family of BKT parameter sets that make *identical* predictions [A: Beck & Chang, 2007], and "a model's ability to predict student performance is at best weakly related to the accuracy of any one of its parameters" [A: Rai, Gong & Beck, 2009]; forcing more plausible parameters via Dirichlet priors moved AUC by +0.006 (.614 → .620). Adding per-item difficulty (KT-IDEM) bought +0.030 AUC on ASSISTments and *nothing statistically reliable* on Cognitive Tutor unless there were many data points per item [A: Pardos & Heffernan, 2011], and a later replication failed to reproduce the ASSISTments advantage [B: CEUR Vol-1009, 2013]. **An IRT-derived slip term is a nice-to-have with a documented ceiling of ~0.03 AUC, available only with dense per-item response data this team does not have.**

- **The binding constraint on their diagnostic is not calibration — it is 14 items per bucket.** 140 items over 10 buckets. Subscores need roughly **≥ 20 items** and disattenuated inter-subscore correlation **< .85** to carry any added value over the total score; 10-item subscores had *no* added value even at unrealistically low disattenuated correlations [A: Sinharay, 2010; ETS RM-08-18]. Attribute classification accuracy runs ≈0.80 at 5 items, ≈0.90 at 10, ≈0.95 at 15 items per attribute [A: 1-PLCDM, 2024]. Calibration spend does not move this number. Test-design spend does.

- **Where it genuinely breaks: systematic, not random, error.** Random per-item difficulty error averages out at the module and bucket level. A DOK→difficulty mapping that is wrong *for a whole content cluster* does not average out, and adaptive algorithms convert even *unbiased* item-parameter error into *systematic* θ bias [A: Doebler, 2012, abstract only; up to ~40% of the calibration-sample SD per Fink et al., 2025]. **The DOK prior's danger is bias, not noise.** That is checkable cheaply with a few hundred responses; it does not require a full calibration study.

- **Recommendation implied by the evidence, stated plainly:** a large, expensive, up-front calibration study is not justified by the measurement gains for these three stated uses. What *is* justified is (i) ~100–250 responses per item accumulated opportunistically to get RMSE(b) into the ±0.5-logit band [A: Linacre, 1994; B: Wauters et al., 2012], (ii) using plain proportion-correct or Elo rather than IRT machinery in the interim, since proportion-correct correlates `r = .90` with criterion IRT difficulty [B: Wauters et al., 2011], (iii) *never* estimating `c`, and (iv) an early empirical check that the DOK prior is not systematically biased by cluster.

---

## Findings

### 1. Effect of item parameter estimation error on ability estimation

**How error in item parameters scales with calibration sample size.** The cleanest published table, from a 520-item retired achievement bank calibrated in BILOG-MG with 50 replications per condition [A: Cheng, Patton & Shao, 2015]:

| Model | N | RMSE(a) | RMSE(b) | RMSE(c) |
|---|---|---|---|---|
| 2PL | 2,500 | .11 | .07 | — |
| 2PL | 1,000 | .17 | .12 | — |
| 2PL | 500 | .24 | .17 | — |
| 3PL | 2,500 | .24 | .23 | .06 |
| 3PL | 1,000 | .37 | .28 | .07 |
| 3PL | 500 | .54 | .34 | .07 |

Independently, a 3PL Bayesian (BILOG marginal Bayes) calibration of a 197/788-item 4-option bank [A: Olea et al., 2012]:

| N | Bank | RMSE(a) | r(a) | RMSE(b) | r(b) | RMSE(c) | r(c) |
|---|---|---|---|---|---|---|---|
| 500 | 197 | .25 | .73 | .15 | .99 | .04 | .48 |
| 1,000 | 197 | .19 | .83 | .14 | .99 | .04 | .54 |
| 500 | 788 | .25 | .74 | .16 | .99 | .04 | .48 |
| 1,000 | 788 | .19 | .83 | .13 | .99 | .04 | .53 |

**Load-bearing observation [A]:** difficulty recovery is near-perfect (`r = .99`) at every sample size tested, in both studies, under both 2PL and 3PL. Discrimination and guessing are the parameters that are hard to estimate. `r(c) = .48–.54` means that at realistic sample sizes **you cannot estimate the guessing parameter better than simply fixing it at 1/k**; Olea et al.'s RMSE(c) = .04 against a true SD of .03 confirms the estimator carries more error than the parameter carries variance.

**How that propagates to θ.** Same 520-item bank, marginal results over 1,000 examinees drawn N(0,1), maximum-Fisher-information selection with Sympson–Hetter exposure control [A: Cheng, Patton & Shao, 2015]:

| Model | N | 15 items RMSE(θ) | 15 items r(θ̂,θ) | 40 items RMSE(θ) | 40 items r(θ̂,θ) |
|---|---|---|---|---|---|
| 2PL | ∞ (true params) | .272 | .965 | .173 | .985 |
| 2PL | 2,500 | .275 | .964 | .176 | .985 |
| 2PL | 1,000 | .280 | .963 | .182 | .984 |
| 2PL | 500 | .286 | .961 | .189 | .984 |
| 3PL | ∞ (true params) | .360 | .939 | .222 | .976 |
| 3PL | 2,500 | .381 | .932 | .234 | .974 |
| 3PL | 1,000 | .391 | .928 | .245 | .972 |
| 3PL | 500 | .406 | .921 | .254 | .970 |

**Magnitudes:** dropping from perfect knowledge to N = 500 costs **+5% RMSE(θ)** at 15 items and **+9%** at 40 items under 2PL; **+13%** and **+14%** under 3PL. The correlation between estimated and true ability falls by **.001–.004** (2PL) or **.006–.018** (3PL). The authors' own summary: "the difference is small… practically negligible when the test is short, and even smaller when the test is longer" [A].

Note also what this table says about *model choice versus calibration quality*: at N = 500 and 40 items, the 3PL costs RMSE .254 against the 2PL's .189 — **+34%, roughly four times the cost of the calibration error itself.** Choosing to estimate `c` hurts more than having a small calibration sample.

**The upper bound: what if parameters are simply wrong?** McGrath (2019) simulated the extreme condition — two independently drawn parameter sets from the same distributions, so the "incorrect" set has near-zero correlation with the true set — scoring 1,000 simulated examinees over 250 replications [A]:

| Estimator | RMSE, true params | RMSE, wrong params | Inflation | Bias SD, true | Bias SD, wrong |
|---|---|---|---|---|---|
| pEAP (pattern, Bayes) | .2368 | .3581 | +51% | .0076 | .2037 |
| sEAP (summed, Bayes) | .2575 | .3175 | **+23%** | .0081 | .1803 |
| MLE (pattern, non-Bayes) | .2952 | .3874 | +31% | .0141 | .2194 |
| TCF (summed, non-Bayes) | .3126 | .3756 | **+20%** | .0114 | .1970 |

This is the most directly relevant published result to this team's actual situation, because "difficulty labels drawn from a plausible distribution but assigned to the wrong items" is precisely what a DOK-based prior risks being. **Complete difficulty randomization costs 20–50% RMSE inflation, and mean bias stays near zero (−0.003 to −0.007)** — but bias SD explodes 25-fold, meaning any *particular* item set can be badly off. **[A]**

Two design implications fall out of this table directly. First, **summed-score estimators degrade far less than pattern-score estimators** under wrong parameters (+20–23% vs +31–51%) precisely because summed scoring does not weight items by their parameters at all [A]. Second, Bayesian shrinkage helps: sEAP was the best-behaved estimator in the extreme condition.

**Random error versus systematic misspecification — the distinction that matters.** Random calibration error mostly inflates variance and, in linear tests, mostly inflates the *reported* SE rather than the true error [A: Patton, Cheng, Yuan & Diao, 2014 — "the effect of calibration sample size on the empirical SE was rather small for most θ values, suggesting that an SE that ignores calibration error may have been sufficient"]. Systematic error is different in kind. Doebler (2012) showed analytically and by simulation that **deviations of estimated from true item difficulties produce *systematic bias* in person-parameter point estimates in adaptive testing even when the item-difficulty errors are themselves unbiased** [A, abstract only]. Fink, König & Frey (2025) characterise this as bias "particularly pronounced at the extremes of the ability scale," reaching "0.3 standard deviation units or more," and report that ignoring calibration error in their own 2PL CAT simulation produced bias "in the most extreme cases up to 40% of the standard deviation of the simulated calibration sample," reducible by 33% / 69% / 84% with corrected-WLE, corrected-WLE-plus-Bayesian-item-selection, and fully Bayesian CAT respectively [A].

**Rasch-specific empirical check.** A resampling study on a real dataset (full sample N = 9,678) recalibrated items on subsamples of 20–200, then re-scored all 9,678 examinees with each of the 90 resulting item-parameter sets: "less precision and item calibration instability occur with smaller sample sizes; **however, the decreasing sample size has minimal effect on the person ability estimates**" [A: Fan & Kopriva-style resampling design, Applied Measurement in Education, 2019 — abstract read; internal numbers not extracted]. Sample sizes as small as **20** were tested and the person estimates held up.

### 2. Effect on adaptive test performance specifically

**The capitalization-on-chance mechanism.** Fisher information for item *i* is `Iᵢ(θ) = aᵢ² Pᵢ(θ)Qᵢ(θ)`. The discrimination parameter is *squared*; the difficulty parameter enters only through `Pᵢ(θ)Qᵢ(θ)`, which is nearly flat near the examinee's θ. Van der Linden & Glas make the robustness argument explicitly: "if the value of `Pᵢ(θ)` is in the range [.40, .60], the maximal difference between the product `Pᵢ(θ)Qᵢ(θ)` and its maximum value is .01. If the range is enlarged to [.30, .70], the difference is still not larger than .04. **Thus, a CAT algorithm based on the maximum-information criterion can be expected to capitalize on large errors in `aᵢ` but to be relatively robust with respect to errors in `bᵢ`**" [A: van der Linden & Glas, 2000]. This is a formal result, not an empirical happenstance, and it is decisive for this team: **information-based item selection is structurally insensitive to difficulty error and structurally hypersensitive to discrimination error.**

**Demonstration that the mechanism operates.** Van der Linden & Glas built a 1,200-item pool in four sections calibrated on N = 250 / 500 / 1,500 / 2,500 (identical true parameters, different error magnitudes) and counted selections [A]:

- The CAT algorithm preferred items calibrated on N = 250 **roughly twice as often** as items calibrated on N = 2,500 — and this held even at test length n = 40.
- Effects were "extremely robust" across three selection criteria (maximum information, minimum expected posterior variance, maximum expected posterior-weighted information) and two θ estimators (EAP, WLE). No systematic differences detected.
- Items with below-average discrimination were **never chosen** at nearly all θ values. "The effective size of the item pool is generally much smaller than the number of items present in the pool."
- **The pool-size anomaly:** with an easy-skewed pool, mean absolute error at the *low* end of θ got *worse* as the pool grew from 40 → 400 → 1,200 items when the calibration sample was small. At k = 1,200 with small calibration samples, low-θ MAE was as bad as high-θ MAE had been with a 40-item pool. The mechanism is the *conditional* item selection ratio: where the pool is dense relative to items needed, optimization has more error to exploit. **A large bank is a liability, not an asset, if calibration is poor.**
- Sympson–Hetter exposure control "only partially alleviated the problem."

**Magnitude of the precision-overclaim.** Test forms assembled for maximum information from parameters estimated on N = 400 had their information functions **overestimated by 25% to 40%** [A: Hambleton, Jones & Rogers, 1993; Hambleton & Jones, 1994 — read via van der Linden & Glas, 2000, secondary]. In CAT specifically, relative efficiency (information from estimates ÷ information from true parameters) [A: Olea et al., 2012]:

- N = 1,000: information overestimated by **12–24%** across θ ∈ [−1, 2].
- N = 500: information overestimated by **~30%**, reaching **close to 40%** at θ = 1.
- Proportion of administered items with `â > a` exceeded **.90** at central θ with N = 500 and the 788-item bank (expected .5 under no capitalization). In a random test the proportion sat at .5.
- Cheng, Patton & Shao (2015) replicated this with a relative-test-efficiency measure, found RTE > 1 under MFI, worse at smaller N, worse under 3PL than 2PL, and near 1.0 under a-stratified selection [A].

**And here is the part the team must not miss.** In the same Olea et al. study that found 30–40% information overestimation:

> "The problem of capitalization on chance, which was evident when we studied the positive bias in the discrimination parameters of the CAT, **does not show itself in the bias and RMSE of the θ estimates**… **no differences in RMSE(θ) are seen in the θ range [−0.5, +1.5] between the different calibration conditions**… the CAT gives essentially unbiased estimates of ability (bias values range from −0.2 and +0.1)." **[A]**

Capitalization on chance is overwhelmingly a **precision-claim pathology**: the test *says* it is 30–40% more precise than it is. The actual ranking and point estimates barely move. Cheng, Patton & Shao draw exactly this conclusion: "the standard errors of ability estimates tend to be spuriously low under the MFI-based methods, **resulting in overconfidence in the precision of test scores**" [A].

**Where this becomes a real accuracy problem, not just a reporting problem:** variable-length CAT with SE-based termination. Because the stopping rule reads the (spuriously small) SE, capitalization on chance directly corrupts test length, θ estimation, *and* classification accuracy in "complex" ways [B: Patton, Cheng, Yuan & Diao, 2013 — abstract only; magnitudes not obtained]. A fixed-length 140-item MST does not have this exposure.

**Mitigations with documented costs.** b-matching (select the item whose `b` is closest to θ̂, ignoring `a`) essentially eliminates capitalization but "greatly increases the estimation error of θ" — it produced the highest RMSE(θ) of any method tested [A: Olea et al., 2012]. The progressive method reduced the proportion of positively-biased-`a` selections by 5–10% "with no loss in ability precision" [A: same]. a-stratified with b-blocking nearly eliminates capitalization and, at 40 items, loses almost nothing: RMSE .216 vs .189 for MFI, `r(θ̂,θ)` identical to two decimals; at 15 items it is clearly worse (.388 vs .286) [A: Cheng, Patton & Shao, 2015]. Fully Bayesian CAT that propagates item-parameter uncertainty reduced bias by 84% [A: Fink et al., 2025].

### 3. Model misspecification

**Is Rasch's small-N robustness advantage real?** Yes, and it is endorsed by the very authors who documented capitalization on chance. Van der Linden & Glas's fourth recommended mitigation, verbatim: "because the seriousness of the capitalization on chance phenomenon depends strongly on the estimation errors in the values of the discrimination parameter, **a statistically effective strategy may be to use the Rasch or 1-PL model if adaptive testing has to be based on small calibration samples.** Using a response model with fewer item parameters than actually needed for a satisfactory fit to the response data leads to bias in the ability estimates. However, **this bias may be set off easily by the effects of more accurately estimated values for the remaining item parameter.**" They cite Lord (1983), *Small N justifies Rasch model* [A].

**How large is the loss from fitting the wrong model?** The picture is consistent and it is a bias/variance trade in which the *ordering* survives:

- Real data, three models fitted, where AIC/BIC/ΔG² all agree the 3PL fits best: `r(θ̂₁ₚₗ, θ̂₂ₚₗ) = .9908`; `r(θ̂₂ₚₗ, θ̂₃ₚₗ) = .9869`; `r(θ̂₁ₚₗ, θ̂₃ₚₗ) = .9778`. The author's conclusion: "although the 3PL model is the best fitting of the three models, **we have a high degree of linear agreement in the ordering of individuals** across the three models" [A: De Ayala, 2022, textbook, Ch. 6].
- Simulation, generate from 3PL: RMSE(θ) for the correctly-specified 2PL was **< 0.2**; for Rasch it was **0.3–0.5** — roughly a doubling. But "the latent trait estimates were extremely highly correlated (`r > .95`) for **all** models" [A: Shim, Bonifay & Wiedermann, 2023].
- Diagnostic classification: constraining all item main effects to be equal (the 1-PLCDM, a Rasch-like restriction) versus the unconstrained LCDM across 108 fully-crossed conditions × 500 replications produced results "**almost indistinguishable in all conditions**… there was virtually no loss in classification accuracy by imposing the equality constraints on the main effects, **even when the true variance in the main effects was high**." Classification agreement between the two models ranged 0.87–0.99 [A: *Frontiers in Education*, 2024].
- Item-difficulty invariance across examinee subgroups: 1PL difficulty estimates correlated .989–.993 (Pearson) and .982–.990 (Spearman) across ability subsamples, versus .953–.963 and .958–.967 for the 3PL — **the 1PL was more invariant even though the 3PL fit better** [B: ED501105, AERA/NCME conference paper].
- The bias is structural, not sampling: "items with extreme discriminations acquire persistent bias that no amount of additional data can eliminate, so they never reach the RMSE threshold" [C: `irtsim` package vignette accompanying Schroeders & Gnambs, 2025 — software documentation, not the peer-reviewed article].

**Ignoring guessing on 4-option multiple choice specifically.** The evidence says: don't estimate `c`, and don't panic about it. `r(ĉ, c) = .48` at N = 500 and .54 at N = 1,000 [A: Olea et al., 2012] — the estimator is near-useless at these sample sizes. Minimum-N recommendations for the 3PL in the literature span **1,000** [Hulin, Lissak & Drasgow, 1982], **5,000** [Feuerstahler, 2019], and **100,000** [Thissen & Wainer, 1982]; a predictive-fit benchmark defining "minimum N" as the point where the 3PL out-predicts the 2PL out-of-sample landed at **at least 1,000 persons** (ELPL-MR) or **500–1,000** (ELPL-MP) [A: *Applied Psychological Measurement*, 2022]. And in Cheng, Patton & Shao's table, adopting the 3PL at N = 500 cost more RMSE(θ) than the calibration error did. The defensible move on 4-option MCQ with thin data is **fix `c` at or near 0.20–0.25 rather than estimate it**, which is exactly what BILOG's default beta(5,17) / beta(76,226) priors do.

An older ETS study fitting 1PL/2PL/3PL to generated ASVAB-derived ICCs found "the 3-PL model is the least biased, but that for lower abilities it has both the highest MSE and **is the most fragile with respect to sampling fluctuations of the parameter estimates**," recommending continued use of Bayesian priors, robust estimation, or fixing parameters constant [B: Wainer & Thissen, 1984, abstract only].

### 4. Classification accuracy versus score precision — the crucial distinction for this team

**Is ordinal/classification robustness actually supported? Yes.** The quantitative case:

1. **Rank order barely responds to calibration sample size.** `r(θ̂, θ)` falls from .985 → .984 going from perfect parameters to N = 500 (2PL, 40 items), and from .965 → .961 at 15 items [A: Cheng, Patton & Shao, 2015]. RMSE moved 5–9% over the same range. **The ordering is roughly an order of magnitude less sensitive than the metric.**

2. **Rank order barely responds to model misspecification.** `r ≥ .978` across 1PL/2PL/3PL on real data [A: De Ayala, 2022]; `r > .95` even when the fitted model is structurally wrong [A: CLL paper, 2023]; classification agreement .87–.99 when discriminations are wrongly constrained equal [A: 1-PLCDM, 2024].

3. **The formal link runs through SE, and it is monotone and smooth.** Classification accuracy and consistency for a binary decision increase monotonically as SE(θ̂) decreases; smaller SE over the whole latent continuum guarantees higher overall expected CA and CC [A: Cheng, Liu & Behrens, *Psychometrika*, 2015 — abstract only, analytic result]. Because CA is a *thresholded* function of θ̂, error only flips a decision if it pushes θ̂ across the boundary. Consequently misclassification is concentrated near the cut [A: Ercikan & Julian, 2002, via Frontiers 2017] and is near-zero far from it. A ranking decision inherits the same geometry: it only flips when two buckets are close.

4. **Decision *consistency* is more robust than decision *accuracy*.** Across four simulation studies manipulating test length, local item dependence, IRT model–data misfit, and scoring metric: "the factors of LID and model misfit had a negative impact on 'true' DA index, and made all selected methods over-estimate DA index. On the contrary, **the DC estimates had minimal impacts from the above factors**" [B: Deng, 2011, UMass dissertation]. So a diagnostic that reproduces the *same* shortlist under retest is easier to achieve than one whose shortlist is *correct*.

5. **Summed scoring beats pattern scoring under bad parameters** — because it does not use the parameters. +20–23% RMSE inflation vs +31–51% under near-zero-correlation parameters [A: McGrath, 2019]. Directly actionable: if difficulties are untrusted, score each concept bucket by number-correct, not by IRT pattern scoring.

**But here is the counterweight, and it is the most important finding in this document.** For an ordinal *sub*score decision, the dominant error source is not calibration — it is the number of items in the bucket.

- Subscores need roughly **≥ 20 items** *and* disattenuated inter-subscore correlation **< .85** to have any added value over the total score. Subscores of **10 items had no added value even for a "realistically extreme (low) disattenuated correlation."** "The most important finding is that it is not easy to have subscores that have added value" [A: Sinharay, 2010, ETS RR-10-08 / ED523969; ETS RM-08-18 surveyed operational tests and found added value "for only a handful"]. Disattenuated correlations were ".95 or larger for many of the tests" surveyed.
- Attribute-level classification accuracy in a diagnostic classification model: ≈**0.80 at 5 items**, ≈**0.90 at 10 items**, ≈**0.95 at 15 items** per attribute — and "sample size and base rate levels… did not substantially impact the results" [A: 1-PLCDM, 2024].

**140 items ÷ 10 buckets = 14 items per bucket.** That sits below Sinharay's 20-item threshold and at the ≈0.90-classification-accuracy point on the CDM curve. And MCAT content clusters are unlikely to be distinct enough to clear the `.85` disattenuated-correlation bar. **[C — my inference from A-tier thresholds applied to their stated design; their actual inter-bucket correlations are unmeasured.]**

**A back-of-envelope that makes the comparison concrete [C — my own derivation, not from the literature].** For a 14-item bucket with typical discrimination `a ≈ 1`, the sampling SE of the bucket-level ability estimate is roughly `1/√(14 × 0.25 × 1²) ≈ 0.53` logits. Meanwhile, if per-item difficulty error has RMSE 0.5 logits and errors are independent across items, the induced error in the bucket's *aggregate* difficulty is `0.5/√14 ≈ 0.13` logits. **Sampling error is ~4× larger than a fairly severe independent calibration error.** This arithmetic is why the empirical results in §1–§2 come out the way they do, and it is why calibration money buys less than test-length money here. It also flags the exact failure mode: the `√14` averaging only happens if the errors are *independent*. Systematic error — the entire bucket's difficulty misjudged in one direction — does not average out at all.

### 5. Routing robustness in MST

**Baseline misrouting occurs even with perfect parameters.** A 200-item 3PL bank, 1,000 examinees, maximum-module-information routing, EAP scoring, across 1-3 / 1-2-3 / 1-3-3 designs, routing-module width {wide, narrow}, test length {12, 24, 36}, module length {L-S, M-M, S-L} [A: Yiğiter & Doğan, 2023]:

| Factor | Level | Misrouting rate | RMSE all | RMSE misrouted | RMSE correctly routed |
|---|---|---|---|---|---|
| Design | 1-3 | 21.3% | 0.275 | 0.295 | 0.269 |
| Design | 1-2-3 | 16.1% | 0.266 | 0.305 | 0.257 |
| Design | 1-3-3 | 16.8% | 0.268 | 0.298 | 0.261 |
| Test length | 12 | 22.3% | 0.342 | 0.396 | 0.324 |
| Test length | 24 | 17.0% | 0.254 | 0.277 | 0.248 |
| Test length | 36 | 15.0% | 0.215 | 0.225 | 0.214 |
| Routing module | Wide | 17.7% | — | — | — |
| Routing module | Narrow | 18.4% | — | — | — |

Overall misrouting ranged **12.4%–29.1%** across all conditions; RMSE ranged 0.204–0.356 overall, 0.217–0.413 for misrouted, 0.173–0.338 for correctly routed. The authors' conclusion: "**misrouting is not a significant problem in the MST in general**, although the measurement accuracy of the misrouted test takers is low," and misrouted examinees' abilities "were generally concentrated at the intersection points of the module information functions of the adjacent modules" — i.e., where the routing decision barely matters because the two modules are nearly equally informative. **[A]**

**Read this the right way.** These rates are with *correct* item parameters. **One in five to one in six learners is already routed suboptimally by sampling noise alone, at a cost of about +0.03 in RMSE(θ).** Difficulty calibration error that shifts a learner across a module boundary costs the same +0.03. A three-stage design with a 20-item routing module and 3-way branching (this team's design, with 7 stages) sits toward the favourable end of every factor in that table.

**Corroborating evidence on misrouting cost.** A two-stage MST (1 routing + 3 second-stage modules) forced examinees down all three paths and compared scores: "when the second-stage modules overlapped in difficulty, the score differences (i.e., bias) associated with different MST paths were **negligible for practical purposes**. Similar trends appeared even when the second-stage modules were significantly distinct in difficulty. **The impact of misrouting was generally minimal** under the MST design used in this study" [B: Kim & Moses, ETS RR / ets2.12000 — abstract only]. A systematic Monte Carlo over a 42-item three-stage MST found routing errors "occurred 15% of the time across conditions" and did adversely affect θ bias, RMSE and SEM, with θ-based routing outperforming defined-population-interval number-correct routing [B: Chapman, Weiss & Suen, 2024 book chapter — abstract only, magnitudes not obtained].

**Routing rules that degrade gracefully — the actionable design finding.** Two routing families:

- **AMI / maximum-information routing** intersects cumulative test information functions, or picks the module maximising information at θ̂. This *uses* item parameters and is the family exposed to calibration error and to capitalization.
- **DPI (defined population interval) routing** rank-orders examinees on their current estimate and assigns fixed proportions to modules — e.g., in a 1-3-3 panel, "all of the examinees are rank-ordered according to their estimated ability. The examinees are then assigned in thirds… to the easy, medium, or hard module" [A: Kim, Chung, Park & Dodd, 2013].

**DPI routing is invariant to any monotone error in the difficulty scale, by construction**, because it thresholds on rank rather than on an absolute information criterion. **[C — my inference from the DPI definition; I found no study that manipulates calibration error and compares DPI to AMI.]** What the literature *does* establish is that routing method choice barely matters for the decision quality: "**regardless of the routing method used, the same panel structure performed similarly in terms of the precision of the classification decision** with the same test length condition" [A: Kim, Chung, Park & Dodd, 2013]. And across large-scale-assessment MST simulations, "IRT scoring… outperformed classical NC methods, although **differences in bias and root mean squared error were generally small**" [A: Svetina et al., *JEM*, 2019]. Additionally, 71–90% of examinees follow "primary pathways" (never changing difficulty level after stage 1) across DPI, proximity, and NC routing in operational certification/licensure MSTs [B: Zenisky, 2004, via Educ. & Psych. Measurement 2016] — so most of the adaptation happens at the first branch, and the later branches carry less consequence.

**Is MST more robust than item-level CAT under uncertain parameters?** I found **no study that directly manipulates calibration error and compares MST to item-level CAT.** The mechanistic argument is strong and I state it as an inference, not a finding: capitalization on chance arises from *run-time optimization over a pool of noisy parameter estimates*, and its severity scales with the *conditional item selection ratio* — the number of pool items available at the examinee's θ divided by the number selected there [A: van der Linden & Glas, 2000]. **MST pre-assembles modules, so at run time the selection ratio is 1 and there is no optimization over parameter estimates to exploit.** Calibration error still affects module *assembly* (a one-time, reviewable, human-auditable decision) and *routing*, but not per-item chasing of spuriously high information. **[C — reasoned inference from an A-tier mechanism.]** Consistent with this, and with the general CAT-vs-MST literature: CAT beats MST on precision by a small margin [B: Patsula, 1999; Schnipke & Reese, 1999, via secondary], but "for classification purposes… **MST provided classification accuracy as good as that from CAT**, with more efficient item bank usage" [B: ED542026]. Given that this team's output is a classification/ranking, not a score, the MST choice already forfeits little and buys the robustness.

### 6. Item parameter drift and stale calibration

- **The operational threshold.** The measurement literature conventionally treats **0.50 logits** as the magnitude at which item parameter drift becomes practically significant [B: Wollack et al., 2005, and Risk, 2015, via ijate 1070848].
- **One administration cycle is cheap.** Between two consecutive years, "bias in ability estimates did not exceed **0.14**, even when a considerable amount of IPD was present" [B: Wells et al., 2002 — read via Wollack, Sung & Kang, 2006; secondary].
- **Uncorrected drift compounds and gets expensive.** Simulating IPD accumulating across multiple years with eight different linking strategies, "**biases were as large as −0.52**" in some model × condition cells; the range across the eight linking models within a condition was .15, .24, .23 and .39 logits for conditions 1–4. Models that *tested* items for IPD and *excluded* drifting items from the linking process recovered parameters better, particularly as drift magnitude increased; TCC linking outperformed fixed-anchor-parameter linking [A: Wollack, Sung & Kang, 2006, NCME paper, UW-Madison].
- **In CAT specifically.** Manipulating IPD size (0.00/0.50/0.75/1.00 logit), percentage of drifting items (0/5/10/20%), three time points, bank size (200/500/1,000), and N (1,000/5,000): all IPD conditions reduced measurement precision and test information; **the effect accumulates with the number of successive administrations**; and crucially "**sample size and item bank size generally do not have an increasing or decreasing effect on these factors**" — you cannot buy your way out of drift with a bigger bank or a bigger sample [B: *Int. J. Assessment Tools in Education*, 2022].
- **A subtle mechanism worth knowing.** IPD confined to item *difficulty* in one latent subgroup can induce apparent drift in *both* difficulty and discrimination estimates in a fitted unidimensional model; and a shift in the examinee *ability distribution* alone can manifest as IPD. Discrimination drift affected recovered ability more than difficulty drift did [B: *Frontiers in Psychology*, 2016].

**For this team's horizon:** MCAT content is stable across a few years, the item bank is new, and the user population will shift as the product's marketing does — which is itself a source of apparent drift [B: Frontiers 2016]. The practical implication is not "calibrate before launch" but "**re-check annually and flag items whose `b` moves > 0.5 logits**," which is cheap and only becomes possible *after* response data exists.

### 7. The "good enough" threshold

**What the literature will and will not give you.** There is no published threshold of the form "RMSE(b) must be below X for a top-2 concept ranking to be reliable." I did not find one and I am not going to invent one. What is available is (i) a well-established mapping from calibration sample size to RMSE(b) in logits, (ii) empirical RMSE(θ) / correlation deltas across that range, and (iii) an arithmetic argument about how per-item error aggregates.

**Sample size ↔ logit precision (the most interpretable anchor available).** Derived analytically from the Rasch standard error and confirmed empirically [B: Linacre, 1994, *Rasch Measurement Transactions* — analytically sound derivation, but a newsletter, not a peer-reviewed journal]:

| Calibration stable within | Confidence | N range (best → poor targeting) | N for most purposes |
|---|---|---|---|
| ± 1.0 logit | 95% | 16 – 36 | **30** (minimum for dichotomies) |
| ± 1.0 logit | 99% | 27 – 61 | 50 |
| ± 0.5 logit | 95% | 64 – 144 | **100** |
| ± 0.5 logit | 99% | 108 – 243 | 150 |
| Definitive / high stakes | 99%+ | 250 – 20 × test length | **250** |
| Adverse circumstances | robust | 450 upwards | 500 |

Inflate by 10–40% for unmodelled disturbances (different testing conditions, alternative curricula). Cross-checked against the 2PL MML results: RMSE(b) = .17 at N = 500, .12 at N = 1,000, .07 at N = 2,500 [A: Cheng, Patton & Shao, 2015] — consistent with, and rather better than, Linacre's conservative table.

**What proportion-correct and Elo buy you, cheaply.** With 318 real learners on 25 items, correlations against criterion IRT difficulty [B: Wauters, Desmet & Van den Noortgate, 2011 / 2012 — 25 items only, single domain]:

| Method | r with true (criterion) b | r with study-data IRT b |
|---|---|---|
| Proportion correct | **.90** | 1.00 |
| Learner-reported feedback | .88 | .88 |
| Elo rating | .85 | .92 |
| Expert rating | .80 | .80 |
| One-to-many comparison (learner) | .62 | .50 |
| One-to-many comparison (expert) | .56 | .44 |

The authors' summary: "IRT, proportion correct and the Elo rating system provide reliable estimates, **especially with a sample size of 200–250 learners**." Proportion correct is *equivalent* to Rasch difficulty in the relevant sense — total score is a sufficient statistic for the Rasch model — so **for a Rasch/1PL world there is no reason to run an IRT calibration study to get `b`; accumulate p-values.**

**What a judgment-based prior (their DOK mapping) is likely worth.** This is the number that governs their starting position:

| Study | Items | Judges | r(expert judgment, empirical difficulty) |
|---|---|---|---|
| Ethiopian undergraduate medicine licensure exam | 200 MCQs | 6 raters | individual raters **.455–.545**; regression R = .57, R² = 33% [A, full text] |
| Preclinical medical modules, Pakistan | 1,150 items | 20 content experts | **r = .11**, Cohen's κ = .042 [B, abstract + results] |
| Belgian French-conjugation items | 25 items | experts | **r = .80** [B: Wauters et al., 2011] |
| District science test | — | 26 teachers | accuracy "not high" for total group, worse for borderline group [B: Impara & Plake, 1998, *JEM* — abstract only, no r extracted] |

**Expect a DOK-derived difficulty prior to land somewhere in r ≈ 0.1–0.6 with true difficulty, with medical-MCQ studies clustering around 0.45–0.55.** [B] The lower end of that range is close to McGrath's near-zero-correlation condition, whose cost was **+20–50% RMSE(θ)** and near-zero mean bias. That is the honest bracket: **a mediocre DOK prior costs on the order of a 20–50% inflation in ability-estimate RMSE, and much less than that in ranking accuracy.**

**Now, thresholds by use case — with the derivations shown.** [C for the derivations; the inputs are A-tier.]

For **routing**, what matters is not per-item `b` but the *aggregate* difficulty of a 20-item module relative to the adjacent module. If per-item difficulty errors are independent with RMSE σ_b, the module-mean error is σ_b/√20 ≈ 0.22 σ_b. At σ_b = 0.5 logits (a poor prior), module-mean error ≈ **0.11 logits** — far inside the ~0.5-logit spacing typical between adjacent MST module difficulty targets. At σ_b = 1.0 logits (a bad prior), module-mean error ≈ 0.22 logits — still inside. **Independent per-item difficulty error is nearly free for routing.** Systematic error is not: a whole module assembled from a mis-mapped DOK level shifts by the full bias.

For **bucket ranking**, sampling SE for a 14-item bucket is ≈0.53 logits versus a calibration contribution of ≈0.13 logits at σ_b = 0.5. **Calibration error contributes about 6% of the total error variance** (0.13²/(0.53²+0.13²)). Doubling calibration quality changes the total by ~3%. Adding items changes it as 1/√n.

For the **BKT slip term**, see §8: no threshold is needed because the model is insensitive.

### 8. Does difficulty matter at all for the third use? (BKT sensitivity)

**The strongest single result.** Beck & Chang (2007) demonstrated that "observed student performance corresponds to an **infinite family of possible model parameter estimates, all of which make identical predictions** about student performance. However, these parameter estimates make different claims, some of which are clearly incorrect, about the student's unobservable internal knowledge." Their remedy — Dirichlet priors biasing the search toward plausible parameters — produced a "statistically reliable improvement in predictive accuracy" of **AUC .614 ± .002 → .620 ± .002**. That is **+0.006 AUC**. Their conclusion: "prior beliefs are necessary to bias the student modeling search, and **even large quantities of performance data alone are insufficient to properly estimate the model**." **[A, full text]**

The direct follow-up stated the general principle plainly: "a model's ability to predict student performance is **at best weakly related to the accuracy of any one of its parameters**," and after successfully improving parameter plausibility, "we are not able to predict student behavior any better" [A: Rai, Gong & Beck, EDM 2009, full text]. This is the cleanest statement in the literature that BKT's *predictive* behaviour — which is what drives mastery decisions and content sequencing — is decoupled from the accuracy of its slip/guess parameters.

A further follow-up sharpened the diagnosis: BKT *is* formally identifiable under mild conditions on the parameters; the real phenomenon is **semantic model degeneracy** — the best-fitting parameters are inconsistent with the conceptual assumptions of the model, which happens naturally when BKT is fitted to data generated by a different (more realistic) learning process [A: Doroudi & Brunskill, EDM 2017]. The practical upshot is the same either way: **the likelihood surface is flat enough that guess/slip values over a wide region give near-identical predictions, and the data will not tell you which is right.**

**How much does per-item difficulty add to BKT?** KT-IDEM replaces skill-level guess/slip with per-item guess/slip [A: Pardos & Heffernan, UMAP 2011, full text]:

| Dataset | Standard KT AUC | KT-IDEM AUC | Verdict |
|---|---|---|---|
| ASSISTments Skill Builder (10 datasets) | 0.669 | **0.699** | KT-IDEM better in 9/10, p < .05 |
| Cognitive Tutor (overall) | — | — | **not statistically reliably different** |
| Cognitive Tutor, high data-points-per-problem | — | +0.10 AUC | reliable, p < .05 |

The authors' own framing: "**we believe these results demonstrate the importance of modeling item difficulty in Knowledge Tracing when sufficient data is available to train the model**" (emphasis on the conditional). KT-IDEM has `2N + 2` parameters for `N` items. With 2,108 items and zero responses, it is not estimable, and the Cognitive Tutor result says it buys nothing when data per item is thin.

**And the replication is contested.** A follow-up proposing IDEL / IDEA / MCKT variants reported: "**Our findings are not in agreement with [Pardos & Heffernan], which states that IDEM works better than KT in ASSISTments skill builder data**, and our observations also seem to indicate that other item difficulty models could work better than KT-IDEM" [B: CEUR-WS Vol-1009, EDM 2013 workshop paper].

**Data requirements for the parameters BKT does need.** Simulation with pyBKT established "**50 as a reasonable number of students to achieve convergence to canonical parameter values** with any average student sequence length, and **15 as a reasonable sequence length** to mitigate worst-case mastery estimation accuracy," using the conventional P(L) ≥ 0.95 mastery threshold [B: Badrinath, Wang & Pardos, EDM 2021].

**Answer to the question as posed: no, item difficulty does not matter much for the third use.** [A] An IRT-derived slip term is theoretically motivated (Baker, Corbett & Aleven, 2008, showed contextual guess/slip estimation improves BKT) but the documented ceiling is **≤ 0.03 AUC**, it requires dense per-item data, it has failed replication once, and the parameters it would refine are the ones the model is provably insensitive to over a wide region. Per-KC guess/slip with sensible literature-range values (both roughly in 0.1–0.3, per Corbett & Anderson) will behave nearly identically. **The BKT use case is not a reason to fund calibration.**

### 9. Beyond the brief

**(a) The downstream *learning* value of accurate difficulty for adaptive practice is unproven in a randomised field trial.** A randomised field experiment comparing an adaptive practice environment (mastery learning + zone of proximal development, i.e. difficulty-matched sequencing) against a static environment offering equal numbers of questions across all topics, knowledge types and difficulty levels found: "**the achieved test scores by students do not depend on whether they were assigned to the static or to the adaptive practice environment.** However, students of higher ability achieve **lower** test scores when practicing adaptively (−0.15 points, or **−0.08 σ**). More generally, students working with the adaptive version receive more difficult exercises, practice longer, but answer fewer questions correctly… **both algorithms considered in this study are equally effective in fostering student learning**" [A: van Klaveren, Vonk & Cornelisz, *Economics of Education Review*, 2017]. A separate RCT (N = 184) found no post-test difference between a cognitive tutor with knowledge-tracing-driven adaptive problem selection and the same tutor without it [B: *Goal-Oriented Learning Is as Effective as Mastery Learning Provided by Cognitive Tutor*, AERA 2019]. Related literature on adaptive *spacing* schedules is more favourable [B: Mettler, escholarship], but that is a scheduling mechanism, not a difficulty-matching mechanism. **Use case 2 has weaker empirical warrant for needing accurate difficulty than use case 1 does.**

**(b) Their own users are the wrong calibration sample, and paying for a better one may not help.** "The heterogeneity of a sample is needed for proper parameter estimation, and **discrimination indices are lower when homogeneous examinee samples are present**" [B: Hambleton & Jones, 1993, via McGrath, 2019]. MCAT preppers are heavily self-selected on ability. Also: "if an item bank lacks sufficient information for a specific ability range, **increasing the calibration sample size typically does not improve ability estimation accuracy for that range**" [B: from search synthesis over the bootstrap-SE literature; not verified in a primary source]. Calibration data quality is not a pure function of dollars.

**(c) Item families are a deliberate misspecification with a known, modest cost.** Treating sibling items in a family as parameter-identical, when they actually vary: "as within-family variance increases, the **standard error of scores remains at similar levels**. For correlations between true and estimated score and RMSE, **the effect of the larger within-model variance was compensated by test length**. For bias, scores are biased **towards the center**, and bias was **not** compensated by test length… the item model pool should provide balanced opportunities such that 'fake-easy' and 'fake-difficult' item instances **cancel their effects**" [A: *Frontiers in Psychology* / PMC10240571]. So: share parameters within families, but balance families across the difficulty range so the errors cancel. Same lesson as everywhere else in this document — **randomly distributed error cancels; systematic error does not.**

**(d) Continuous / online calibration exists and is the right architecture here.** Continuous calibration methods calibrate a pool over multiple administrations using small samples, updating parameters while maintaining the scale; "using such procedures leads to calibration errors that are **rather high at the beginning of the procedure and decrease after several calibration cycles**" [B: Fink, Born, Spoden & Frey, 2018; Makransky & Glas, 2010; via Fink et al., 2025]. Combined with the Wauters result that proportion-correct correlates .90 with criterion IRT difficulty, the cheap path is clear: ship on the DOK prior, log responses, replace the prior with empirical p-values / Elo per item as counts cross ~100 and again at ~250.

**(e) If they ever report precision, they will report it wrong.** This deserves flagging as a validity risk independent of accuracy. Even with a *good* calibration, MFI-style selection makes the SE too small by 12–40% [A: Olea et al., 2012]. Ability-estimate SEs that assume item parameters are known are systematically too small, and the shortfall grows as the calibration sample shrinks [A: Patton, Cheng, Yuan & Diao, 2014; Zhang et al., 2011, via Fink et al., 2025]. **Do not publish a confidence number for the weakness profile.**

---

## How good is good enough

| Use case | Decision being made | Accuracy needed on item difficulty | Evidence | Confidence |
|---|---|---|---|---|
| **1a. MST routing** (7 stages × 20 items, 3-way branching) | Which of 3 modules next | **Independent** per-item RMSE(b) up to ~**0.5–1.0 logits** is tolerable; module-*mean* error should stay under ~**0.3 logits**. Averaging over 20 items reduces independent error by ~4.5×. Systematic per-cluster bias is the real constraint. | Difficulty enters Fisher information only through the flat `P·Q` term; max-info selection is "relatively robust with respect to errors in `bᵢ`" [A: vdL & Glas, 2000]. 15–21% misrouting already occurs with *perfect* parameters, costing ~+0.03 RMSE(θ) [A: Yiğiter & Doğan, 2023]. Misrouting impact "generally minimal" in 2-stage MST [B: Kim & Moses, abstract]. √20 averaging is my arithmetic [C]. | **Moderate–high** on the direction; **moderate** on the numeric thresholds (derived, not published) |
| **1b. Top-2 weakest-concept shortlist** (10 buckets, ~14 items each) | Ordinal rank of 10 buckets, report top 2 | Difficulty accuracy is **not the binding constraint**. `r(assumed b, true b) ≈ 0.5` is sufficient; even `r ≈ 0` costs only +20–50% RMSE. The binding constraint is **items per bucket**: need ~15 for ≈0.95 attribute classification accuracy, ~20 for subscore added value. | Rank order changes by `Δr ≤ .004` across calibration N [A: Cheng et al., 2015] and `Δr ≤ .022` across wrong models [A: De Ayala, 2022]. Wholly wrong parameters: +20–51% RMSE, mean bias ≈ 0 [A: McGrath, 2019]. Subscores need ≥20 items and disattenuated r < .85 [A: Sinharay, 2010]. CDM attribute accuracy .80/.90/.95 at 5/10/15 items [A: 1-PLCDM, 2024]. | **High** that ordering is robust to parameter error; **high** that 14 items/bucket is the real limiter; **low** on any published logit-scale threshold (**none exists — I did not invent one**) |
| **2. Adaptive practice item selection** | Which item to serve next | Loose. Enough to avoid serving grossly mismatched items; `r ≈ 0.5` with true difficulty is workable. **Avoid maximum-information selection over the full 2,108-item bank** — that is the one configuration where poor calibration actively bites. | Capitalization on chance is driven by `a`-error under MFI; b-matching or a-stratified/progressive selection largely removes it [A: Olea et al., 2012; Cheng et al., 2015]. Bigger pool + poor calibration made low-θ MAE *worse* than a 40-item pool [A: vdL & Glas, 2000]. RCT: adaptive vs static practice produced **no** difference in learning, −0.08σ for high-ability learners [A: van Klaveren et al., 2017]. | **Moderate–high**. The learning-outcome evidence for needing precise difficulty here is weak in both directions, which itself argues against investment |
| **3. IRT-derived slip term in BKT** | P(incorrect \| mastered) per item | **Essentially none required.** Literature-range per-KC values (0.1–0.3) are adequate. Do not build an IRT dependency for this. | Infinite family of BKT parameter sets makes *identical* predictions; enforcing plausibility moved AUC +0.006 [A: Beck & Chang, 2007]. Per-item difficulty (KT-IDEM) bought +0.030 AUC where data was dense, **nothing** where it was not [A: Pardos & Heffernan, 2011], and failed one replication [B: EDM 2013]. | **High** |
| **Cross-cutting: reported precision / confidence** | Any SE, percentile, or confidence claim | **Very high accuracy required — do not attempt.** Even good calibration under MFI overstates information by 12–40%. | Information overestimated 25–40% at N = 400–500 [A: Hambleton et al., 1993; Olea et al., 2012]; corrected-SE literature [A: Yang et al., 2012] | **High** |

**Operational answer on sample size, stated once and plainly.** To get item difficulty stable within **± 0.5 logits at 95% confidence**, budget **~100 well-targeted responses per item** (range 64–144 depending on targeting) [B: Linacre, 1994]; ~250 for anything "definitive." Empirical 2PL MML gives RMSE(b) = .17 at N = 500 [A: Cheng et al., 2015]. Proportion-correct and Elo are "reliable" at 200–250 learners per item and correlate .85–.90 with criterion IRT difficulty [B: Wauters et al., 2012]. **For 2,108 items at 100 responses each, that is ~211,000 responses — which is a normal amount of product usage, not a research budget.** The evidence supports earning this data through use rather than buying it up front.

---

## When this conclusion breaks down

Ordered by how likely each is to bite this team.

1. **If the difficulty error is systematic rather than random.** This is the most serious risk and it is the one their DOK-prior design specifically creates. Random per-item error averages out at module and bucket level (√n) and is largely absorbed by the flat `P·Q` term in Fisher information. A DOK→difficulty mapping that is wrong for a whole content cluster, or that compresses the true difficulty range, does not average out anywhere. Worse: adaptive algorithms convert even *unbiased* item-parameter error into **systematic** θ bias, "particularly pronounced at the extremes of the ability scale," reaching ~0.3 SD units and up to 40% of the calibration-sample SD [A: Doebler, 2012, abstract only; Fink et al., 2025]. **Mitigation: a few hundred responses spread across DOK levels and clusters is enough to check for cluster-level bias. That is cheap and it is the single highest-value data collection.**

2. **If they report a score, a percentile, an SE, or a confidence number.** Then the 12–40% information overestimation becomes a live validity problem [A: Olea et al., 2012; Hambleton et al., 1993] and no amount of "it's only a shortlist" reasoning applies. The current design's silence on scores is doing real protective work.

3. **If they adopt variable-length testing with SE-based stopping.** Capitalization on chance corrupts the stopping rule itself, with "complex effects on test length, ability estimation, and classification accuracy" [B: Patton, Cheng, Yuan & Diao, 2013, abstract only]. A fixed 140-item MST is safe; a "stop when we're confident" version is not.

4. **If they switch use case 2 from module-based or b-matched selection to per-item maximum-information selection over the full 2,108-item bank.** This is the exact configuration the capitalization literature was written about. Van der Linden & Glas's pool-size anomaly is the warning: with poor calibration, a 400- or 1,200-item pool produced *worse* ability estimation at some θ ranges than a 40-item pool, because the conditional selection ratio gave optimization more error to exploit [A]. A 2,108-item bank with `a` and `c` unknown, driving max-information selection, is a bad combination.

5. **If they estimate `a` and `c` from thin data.** All of the reassuring numbers in this document depend on estimating *fewer* parameters. Adopting the 3PL at N = 500 cost +34% RMSE(θ) versus the 2PL — four times what the calibration error cost [A: Cheng et al., 2015]. `r(ĉ, c) = .48` at N = 500 [A: Olea et al., 2012]. **Fix `c` near 1/k. Use 1PL or a constrained 2PL. Do not fit a 3PL.**

6. **If bucket granularity gets finer.** The 10-bucket profile is already thin at 14 items/bucket. The item bank carries **422 distinct knowledge components**; a 140-item test cannot support per-KC inference at any calibration quality — 0.33 items per KC. Any product decision that pushes the diagnostic to report at KC level, or that splits 10 buckets into 15 content clusters (≈9 items each), moves the diagnostic below the "no added value" line in Sinharay's results and below 0.90 attribute classification accuracy in the CDM results [A].

7. **If parameters are set once and never revisited.** Single-cycle drift is cheap (θ bias ≤ 0.14) but compounds: uncorrected multi-year drift produced θ bias up to −0.52, and neither a bigger bank nor a bigger sample mitigates it [A: Wollack, Sung & Kang, 2006; B: ijate 2022]. Because their user population will shift as marketing changes, apparent drift will appear even if the items don't change [B: Frontiers 2016]. **An annual "flag any item whose `b` moved > 0.5 logits" job is the whole mitigation.**

8. **If the calibration sample is homogeneous.** Discrimination is systematically underestimated in homogeneous samples [B: Hambleton & Jones, 1993]. Self-selected MCAT preppers are homogeneous. Money spent on a calibration study using their own users buys less than the sample-size tables imply, particularly for `a`.

9. **If stakes rise.** Every result here is conditioned on "modest ordinal output, no high-stakes decisions." Score reporting, pass-probability prediction, marketing claims about diagnostic accuracy, or institutional sales all move this from a low-stakes classification problem into the regime where the *Standards for Educational and Psychological Testing* documentation requirements for subscore validity, comparability and reliability apply [A: cited in Sinharay's NCME module].

10. **If the diagnostic's output actively displaces content the learner needs.** The shortlist's error rate is dominated by 14-item sampling noise, not calibration. If a wrong top-2 causes a learner to skip material, the harm is real — but the fix is more items per bucket or augmented/shrunken subscores [A: Sinharay: augmented subscores "almost always" had higher PRMSE], not better item difficulties.

---

## DOK 1 — established facts

**Parameter recovery**

- Item difficulty recovers at `r(b̂, b) = .99` at calibration N = 500 under both 2PL and 3PL, with RMSE(b) ≈ 0.15–0.17 logits. [A: Olea et al., 2012; Cheng, Patton & Shao, 2015]
- Discrimination recovers at `r = .73` (N = 500) and `.83` (N = 1,000). Guessing recovers at `r = .48–.54` and is effectively unestimable at these sample sizes. [A: Olea et al., 2012]
- RMSE(b) by N under 2PL MML: .17 (N = 500), .12 (N = 1,000), .07 (N = 2,500). Under 3PL: .34, .28, .23. [A: Cheng et al., 2015]
- Rasch item difficulty is stable within ± 1.0 logit at 95% confidence with N ≈ 30, and within ± 0.5 logit with N ≈ 100. [B: Linacre, 1994]
- Proportion correct correlates `r = .90` with criterion IRT difficulty; Elo `.85`; expert rating `.80` (25 items, 318 learners). Proportion correct is a sufficient statistic for Rasch difficulty. [B: Wauters et al., 2011]
- Expert prediction of MCQ difficulty in medical licensure examination: individual rater `r = .455–.545`; regression R² = 33%. [A: Ethiopian UGMLE, 200 MCQs]

**Propagation to θ**

- Perfect parameters → N = 500 costs +5% (15 items) to +9% (40 items) RMSE(θ) under 2PL; +13–14% under 3PL. `r(θ̂, θ)` falls by .001–.004 (2PL). [A: Cheng et al., 2015]
- Parameters with ~zero correlation to truth inflate RMSE(θ) by +20% (summed non-Bayes) to +51% (pattern Bayes); mean bias stays ≈0 but bias SD rises from .008 to .20. [A: McGrath, 2019]
- Summed-score estimators degrade less than pattern-score estimators under wrong parameters. [A: McGrath, 2019]
- Unbiased item-difficulty errors nonetheless produce systematic θ bias in adaptive testing. [A: Doebler, 2012, abstract only]
- Ignoring calibration error in CAT produced bias up to 40% of the calibration-sample SD; a fully Bayesian CAT reduced it by 84%. [A: Fink, König & Frey, 2025]

**Capitalization on chance**

- Fisher information is quadratic in `a` and nearly flat in `b` near θ: `P·Q` varies ≤ .01 for `P ∈ [.40, .60]` and ≤ .04 for `P ∈ [.30, .70]`. Max-info CAT capitalizes on `a`-error and is relatively robust to `b`-error. [A: van der Linden & Glas, 2000 — analytic]
- CAT selects items calibrated on N = 250 roughly twice as often as items calibrated on N = 2,500, even at 40 items; robust across three selection criteria and two θ estimators. [A: van der Linden & Glas, 2000]
- Test information is overestimated by 25–40% when forms are assembled for maximum information from N = 400 parameters. [A: Hambleton, Jones & Rogers, 1993 — secondary]
- In CAT: information overestimated ~30% at N = 500 (up to ~40% at θ = 1), 12–24% at N = 1,000. Proportion of administered items with `â > a` exceeded .90 at central θ. [A: Olea et al., 2012]
- **Capitalization does not show up in RMSE(θ) or bias(θ).** No differences in RMSE(θ) across calibration sample sizes in θ ∈ [−0.5, +1.5]. [A: Olea et al., 2012]
- With a large pool and small calibration samples, ability estimation at some θ ranges was worse than with a 40-item pool. Sympson–Hetter only partially mitigates. [A: van der Linden & Glas, 2000]
- a-stratified selection nearly eliminates capitalization at negligible cost on a 40-item test; b-matching eliminates it at substantial RMSE cost. [A: Cheng et al., 2015; Olea et al., 2012]

**Model misspecification**

- `r(θ̂₁ₚₗ, θ̂₂ₚₗ) = .9908`; `r(θ̂₂ₚₗ, θ̂₃ₚₗ) = .9869`; `r(θ̂₁ₚₗ, θ̂₃ₚₗ) = .9778` on real data where the 3PL fit significantly better. [A: De Ayala, 2022]
- Generating 3PL and fitting Rasch: RMSE(θ) 0.3–0.5 vs < 0.2 for the correct 2PL, but `r(θ̂, θ) > .95` for all models. [A: Shim, Bonifay & Wiedermann, 2023]
- Constraining all discriminations equal in a diagnostic classification model: "virtually no loss in classification accuracy"; 0.87–0.99 agreement across 108 conditions. [A: 1-PLCDM, 2024]
- Adopting the 3PL at N = 500 cost +34% RMSE(θ) versus the 2PL — more than the calibration error itself cost. [A: Cheng et al., 2015]
- Minimum-N recommendations for the 3PL: ≥1,000 (predictive-fit benchmark and Hulin et al.), 5,000 (Feuerstahler), 100,000 (Thissen & Wainer). [A: APM 2022]
- Van der Linden & Glas recommend the Rasch/1PL model explicitly when adaptive testing must be based on small calibration samples, citing Lord (1983). [A]

**Classification and subscores**

- Classification accuracy and consistency increase monotonically as SE(θ̂) decreases; misclassification concentrates near the cut. [A: Cheng, Liu & Behrens, 2015, abstract only; Ercikan & Julian, 2002]
- Decision *consistency* is more robust to model misfit and local dependence than decision *accuracy*. [B: Deng, 2011]
- Subscores require ≈≥20 items and disattenuated inter-subscore correlation < .85 to have added value over the total score; 10-item subscores had no added value even at extreme low correlations. Operational surveys find added value "for only a handful" of tests. [A: Sinharay, 2010; ETS RM-08-18]
- Attribute classification accuracy: ≈0.80 at 5 items, ≈0.90 at 10, ≈0.95 at 15 items per attribute; sample size and base rate did not substantially matter. [A: 1-PLCDM, 2024]

**MST**

- With correct item parameters, misrouting occurs for 12.4%–29.1% of examinees (21.3% for 1-3, 16.1% for 1-2-3, 16.8% for 1-3-3); misrouting costs ~+0.03 RMSE(θ). Three-stage beats two-stage; longer tests and wider routing modules reduce misrouting. [A: Yiğiter & Doğan, 2023]
- Routing errors occurred 15% of the time across conditions in a 42-item three-stage MST; θ-based routing outperformed defined-population-interval NC routing. [B: Chapman, Weiss & Suen, 2024, abstract only]
- Two-stage MST misrouting impact "generally minimal"; score differences across paths negligible even when Stage-2 modules were distinct in difficulty. [B: Kim & Moses, abstract only]
- Routing method choice barely affects classification-decision precision for a given panel structure and test length. [A: Kim, Chung, Park & Dodd, 2013]
- IRT routing outperformed number-correct routing in large-scale-assessment MST, but "differences in bias and RMSE were generally small." [A: Svetina et al., 2019]
- 71–90% of examinees follow "primary pathways" in operational MSTs across DPI, proximity and NC routing. [B: Zenisky, 2004, secondary]
- MST provided classification accuracy as good as CAT with more efficient bank usage; CAT beats MST slightly on score precision. [B: ED542026; Patsula, 1999, secondary]

**Drift**

- 0.50 logits is the conventional threshold for practically significant item parameter drift. [B]
- Between two consecutive years with considerable drift present, θ bias did not exceed 0.14. [B: Wells et al., 2002, secondary]
- Uncorrected drift compounding over multiple years produced θ bias up to −0.52; testing for and excluding drifting items from linking recovered parameters better. [A: Wollack, Sung & Kang, 2006]
- In CAT, all IPD conditions (0.5–1.0 logit, 5–20% of items) reduced precision and test information, with effects accumulating over administrations; bank size and sample size did not moderate. [B: ijate, 2022]

**Knowledge tracing**

- An infinite family of BKT parameter sets makes identical predictions about student performance. Biasing toward plausible parameters via Dirichlet priors improved AUC from .614 to .620. [A: Beck & Chang, 2007]
- In BKT, "a model's ability to predict student performance is at best weakly related to the accuracy of any one of its parameters"; improving parameter plausibility did not improve prediction at all. [A: Rai, Gong & Beck, 2009]
- BKT is formally identifiable under mild conditions; the real issue is semantic model degeneracy. [A: Doroudi & Brunskill, 2017]
- KT-IDEM (per-item guess/slip) improved AUC .669 → .699 on ASSISTments (9/10 datasets, p < .05) but was not reliably different from standard KT on Cognitive Tutor except where data-points-per-problem was high (+0.10 AUC). [A: Pardos & Heffernan, 2011]
- One later study failed to replicate KT-IDEM's ASSISTments advantage. [B: EDM 2013 workshop]
- ~50 students suffice for BKT parameter convergence; sequence length ≥ 15 mitigates worst-case mastery misestimation. [B: pyBKT, EDM 2021]

**Learning outcomes**

- A randomised field experiment found no difference in summative test scores between adaptive (difficulty-matched, mastery-gated) and static practice; higher-ability students scored 0.08 σ *lower* under adaptive practice. [A: van Klaveren, Vonk & Cornelisz, 2017]
- An RCT (N = 184) found no post-test difference between a cognitive tutor with knowledge-tracing-driven adaptive problem selection and one without. [B: AERA 2019]

---

## DOK 2 — insights and implications

**1. The literature's headline warnings are about `a`, not `b` — and this team only needs `b`.** Every dramatic number in the miscalibration literature (25–40% information overestimation, "dramatic impact," items from small calibration samples selected 2× too often) traces to the discrimination parameter appearing *squared* in Fisher information. Difficulty appears only inside `P(θ)Q(θ)`, which is flat to within .04 over `P ∈ [.30, .70]`. This is an analytic fact, not an empirical accident. A design that uses a Rasch/1PL model, or that never uses maximum-information selection, has structurally excluded itself from the majority of the published damage. **The team should read the capitalization literature as a warning against fitting 2PL/3PL on thin data, not as a warning against launching with imperfect difficulties.**

**2. Miscalibration is primarily an *epistemic* failure, not a *decision* failure.** The consistent pattern across five independent studies is that parameter error corrupts the *scale and the claimed precision* while leaving the *ordering* nearly intact: SE too small by 12–40% while RMSE(θ) is statistically flat across calibration N; RMSE(θ) doubling under a wrong model while `r(θ̂, θ)` stays above .95; classification agreement .87–.99 when discriminations are wrongly constrained. **The product decides "which two concepts are weakest," which is a pure ordering. It never reports a scale value or a precision. It has, more or less by accident, chosen the single most parameter-robust output in psychometrics.** The corollary is a hard constraint: the moment a score, percentile, or confidence indicator appears in the UI, the protection evaporates.

**3. The real limiting factor is 14 items per bucket, and no amount of calibration money touches it.** Sinharay's ≥20-item threshold and the CDM 5/10/15-item accuracy curve both put a 14-item bucket in a marginal zone. My arithmetic makes the comparison stark: sampling SE for a 14-item bucket is ≈0.53 logits; a fairly poor per-item difficulty error of RMSE 0.5 logits contributes ≈0.13 logits after averaging — about **6% of total error variance**. **Doubling calibration quality improves the shortlist by ~3%. Doubling items per bucket improves it by ~30%.** If the team has budget for one thing, it is items per bucket (or fewer buckets), not calibration. Reducing 10 buckets to 7 would put ~20 items per bucket without lengthening the test.

**4. Their `√n` protection depends entirely on the DOK prior's errors being independent, and a DOK prior is exactly the kind that produces correlated errors.** All the reassurance in §5 and §7 rests on averaging. A DOK→difficulty mapping produces errors that are *correlated within DOK level and possibly within content cluster* — precisely the structure that survives averaging. This is the one thing worth spending on early, and it is cheap: a few hundred responses spread across DOK × cluster cells is enough to estimate whether the mapping is biased for any cell, without calibrating a single item individually. **Test the mapping, not the items.**

**5. Choose DPI-style proportional routing over information-based routing, and get robustness for free.** Routing that rank-orders learners on the routing module and assigns fixed proportions to modules is invariant to monotone error in the difficulty scale, because it never reads absolute difficulty. Routing that intersects test information functions does read it. The literature says routing method choice barely affects classification-decision precision, and IRT routing's advantage over number-correct routing is "generally small." **So this is a robustness improvement available at essentially zero measurement cost.** (I could not find a study that manipulates calibration error and compares the two directly; the invariance argument is mine.)

**6. Score the buckets by number-correct, not by IRT pattern scoring.** McGrath's result is unusually actionable: under near-zero-correlation parameters, summed-score estimators inflated RMSE by 20–23% while pattern-score estimators inflated by 31–51%. The mechanism is transparent — summed scoring does not weight items by their parameters, so it cannot be misled by them. **Until the difficulties are earned from data, number-correct within bucket (or a Bayesian summed-score EAP, which was the single best-behaved estimator in the extreme condition) dominates pattern scoring.**

**7. MST was already the robust choice, and that is worth naming explicitly.** MST's usual selling points are item review, exposure control, and reviewable forms. Its *calibration-robustness* advantage is under-discussed but follows directly from van der Linden & Glas's mechanism: capitalization severity scales with the conditional item-selection ratio, and MST pre-assembles modules so there is no run-time optimization over noisy estimates. Calibration error still affects module assembly, but that is a one-time, human-auditable decision rather than a per-item, per-learner gamble. **The team should not switch use case 1 to item-level CAT to "get more precision" — they would be trading a small precision gain for the exact pathology this document catalogues.**

**8. BKT does not need IRT, and coupling them creates a dependency with no payoff.** The Beck & Chang result is close to dispositive: an infinite family of guess/slip values makes identical predictions, and forcing plausibility bought 0.006 AUC. KT-IDEM's 0.03 AUC gain required dense per-item data and failed one replication. **An "IRT-derived slip" is architecturally a coupling between two subsystems that buys ≤0.03 AUC in the best case and is unestimable in this team's actual data situation. It is a good candidate for deletion from the design, or for replacement with per-KC values in the 0.1–0.3 literature range.** The genuine BKT constraint is data volume per KC — 422 KCs is far too many to fit per-KC parameters, and that has nothing to do with item calibration.

**9. Earning the data beats buying it, and the crossover is favourable.** 100 responses per item × 2,108 items ≈ 211,000 responses gets every item to ±0.5 logits at 95% confidence. That is ordinary product usage for a modest cohort, not a research budget. Meanwhile proportion-correct — which requires no IRT machinery at all — correlates .90 with criterion IRT difficulty and is a sufficient statistic for Rasch difficulty. **The engineering task is a response log and a nightly p-value job, not a calibration study.** Continuous-calibration methods exist for exactly this pattern and their known property (high error early, decreasing over cycles) is acceptable when the output is an ordinal shortlist.

**10. Honest counterweight: three things here should make the team uncomfortable.** (i) The variance explosion in McGrath's wrong-parameter condition — mean bias near zero but bias SD of 0.20 with replications reaching ±0.7 — means the *aggregate* reassurance does not guarantee any *particular* learner's shortlist is right. (ii) Doebler's result that unbiased item-parameter error produces systematic θ bias in adaptive testing is a genuinely unsettling mechanism, and I read only its abstract. (iii) The whole "it's only ordinal" defence is a product commitment, not a psychometric property; if the roadmap contains a score, a percentile, or a "we're 87% confident" indicator, most of this document stops applying. **The right summary is not "calibration barely matters." It is "calibration matters much less than the literature's headline numbers suggest, for this specific ordinal, fixed-length, module-based design, provided you never fit a 3PL, never report precision, and check the DOK mapping for cluster-level bias early."**

---

## What I could not verify

- **Read abstract only (no magnitudes extracted):** Patton, Cheng, Yuan & Diao (2013) — paywalled; the *direction* of their finding on VL-CAT test length and classification accuracy is reported, no numbers. Doebler (2012) — abstract only; the "0.3 SD units or more" figure is **Fink et al.'s (2025) characterisation of Doebler**, not read in Doebler. Chapman, Weiss & Suen (2024) — abstract only; "15% routing errors" and "adversely impacted bias, RMSE, SEM" are the authors' own summary, with no effect sizes obtained. Kim & Moses (ETS ets2.12000) — abstract only; "generally minimal" is their word, unquantified. Cheng, Liu & Behrens (2015, *Psychometrika*) — abstract only; the SE↔classification-accuracy monotonicity is stated analytically in the abstract, derivation not read. Wainer & Thissen (1984, ETS) — abstract only. Impara & Plake (1998, *JEM*) — abstract only; **no correlation coefficient extracted**, only the authors' statement that accuracy was "not high." Applied Measurement in Education (2019) Rasch resampling study — abstract only; the "minimal effect on person ability estimates" conclusion is theirs, internal numbers not obtained.
- **Secondary citation (I did not read the primary source):** Hambleton, Jones & Rogers (1993) and Hambleton & Jones (1994) — the widely-cited "25–40% information overestimation at N = 400" figure is read via van der Linden & Glas (2000). Wells et al. (2002) — the "θ bias ≤ 0.14 between two years" figure is read via Wollack, Sung & Kang (2006). Zenisky (2004) primary-pathway percentages (71–90%) — read via a 2016 *Educ. & Psych. Measurement* article. Patsula (1999) and Schnipke & Reese (1999) CAT-vs-MST precision comparisons — read via secondary summaries. Ercikan & Julian (2002) — via a 2017 *Frontiers* article. Baker, Corbett & Aleven (2008) contextual guess/slip — cited but not read. Hambleton & Jones (1993) on sample homogeneity attenuating discrimination — via McGrath (2019).
- **Figures read as text descriptions, not as plots:** all conditional-bias, conditional-SE and relative-efficiency results in Olea et al. (2012) and Cheng, Patton & Shao (2015) come from the authors' prose descriptions of Figures 1–12 and 1–6 respectively. The tabulated marginal results were read directly and are reliable; the conditional (per-θ) claims are the authors' verbal characterisations of their own figures.
- **Missing study design detail:** McGrath (2019) — **the number of items per test is not reported in the text I read.** Given RMSE(θ) ≈ 0.24–0.31 with true parameters, the test was probably in the 20–40 item range, but the +20–51% inflation figures cannot be pinned to a specific test length. This is the most important gap, because that study is my upper bound.
- **No study found:** (a) directly simulating the accuracy of a **top-k weakest-concept ranking** under manipulated item-parameter error. Every ordinal-robustness claim in this document is inferred from θ-rank correlations, binary classification accuracy, and CDM attribute accuracy — none of which is the same decision. (b) Directly comparing **MST against item-level CAT under manipulated calibration error**. The MST-robustness argument in §5 is my inference from the conditional-selection-ratio mechanism. (c) Manipulating calibration error and comparing **DPI against AMI routing**. The DPI-invariance argument is mine. (d) Anything on whether **DOK level** specifically predicts empirical difficulty. The expert-judgment literature is the closest proxy and it is not the same construct.
- **Sources below peer-review standard, used cautiously and flagged inline:** Linacre (1994) *Rasch Measurement Transactions* — a newsletter; the derivation from `SE ≈ 1/√(Σpq)` is analytically correct and the table is widely used in practice, but it is not a refereed result. The `irtsim` CRAN vignette — software documentation accompanying Schroeders & Gnambs (2025); I did not read the peer-reviewed article. `rasch.org` RMT items on 3PL-vs-Rasch — a real analysis of NALS data (N = 24,944, disattenuated correlations ≥ .92, Rasch-vs-3PL item difficulty r = .94) but published in a partisan newsletter with an evident prior; treated as C. Two conference/proceedings papers (McGrath 2019 AERA; ED501105) are not journal-refereed. One search result (`bkt.tyche.institute`) appeared to be an unrefereed tutorial site and was **excluded entirely**; nothing in this document rests on it.
- **Numbers I deliberately did not produce:** an acceptable RMSE(b) threshold in logits for the top-2 ranking decision. **The literature does not support one and I did not invent one.** What I did instead was give the arithmetic that shows why calibration error is a small share of total error at 14 items per bucket, and labelled it as my own derivation.
- **Unverified single-source claim:** "if an item bank lacks sufficient information for a specific ability range, increasing the calibration sample size typically does not improve ability estimation accuracy for that range" — this appeared in a search synthesis attributed to the bootstrap-SE literature; **I did not locate it in a primary source and it should be treated as unverified.**
- **Not investigated:** AAMC's own MCAT technical documentation on item calibration practice (would establish the professional benchmark for this exact content domain); the equating/linking literature beyond drift; DIF; response-time-based difficulty estimation; LLM-based difficulty prediction, which is a live area that may be directly relevant to improving their prior at low cost.

---

## Sources

Ranked by load-bearing importance to this document's conclusions.

**1. Cheng, Y., Patton, J. M., & Shao, C. (2015).** *a-Stratified Computerized Adaptive Testing in the Presence of Calibration Error.* Educational and Psychological Measurement, 75(2), 260–283. https://doi.org/10.1177/0013164414530719 (open via PMC5965589) — **Tier A. Full text incl. Tables 2–4.** The single most useful source. Gives the complete mapping from calibration N to RMSE(a/b/c) and then to RMSE(θ) and `r(θ̂,θ)` at two test lengths under both 2PL and 3PL, across three item-selection methods, with 520 real items and 50 replications per cell. Establishes that N = ∞ → N = 500 costs 5–14% RMSE(θ) and ≤ .018 in correlation, and that adopting the 3PL costs more than the calibration error does.

**2. Olea, J., Barrada, J. R., Abad, F. J., Ponsoda, V., & Cuevas, L. (2012).** *Computerized Adaptive Testing: The Capitalization on Chance Problem.* The Spanish Journal of Psychology, 15(1). https://doi.org/10.5209/rev_sjop.2012.v15.n1.37348 — **Tier A. Full text.** The definitive quantification of capitalization on chance in a 3PL 4-option bank (directly analogous item format). Information overestimated ~30% at N = 500 and up to 40% at θ = 1; P(â > a) > .90; parameter recovery table showing `r(b) = .99` and `r(c) = .48`. Crucially, documents that **RMSE(θ) and bias(θ) are essentially unaffected** — the finding that separates "claimed precision" from "actual accuracy."

**3. van der Linden, W. J., & Glas, C. A. W. (2000).** *Capitalization on Item Calibration Error in Adaptive Testing.* Applied Measurement in Education, 13(1), 35–53. https://doi.org/10.1207/s15324818ame1301_2 — **Tier A. Full text.** The foundational paper. Contains the analytic result that max-information selection is hypersensitive to `a`-error and *relatively robust to `b`-error* (the `P·Q` flatness argument), the 2× selection preference for N = 250 items, the pool-size anomaly (bigger pool can be worse), and the explicit recommendation to use Rasch/1PL when calibration samples are small.

**4. McGrath, K. (2019).** *Investigating the Impact of Parameter Instability on Item Response Theory Proficiency Estimation.* Proceedings of the 2019 AERA Annual Meeting. https://doi.org/10.3102/1508865 — **Tier A (conference paper, not journal-refereed). Full text incl. Tables 1–2.** The upper-bound study: scores 1,000 examinees with an independently-drawn, near-zero-correlation parameter set over 250 replications. Gives the +20% to +51% RMSE inflation figures by estimator and the bias-SD explosion. Also establishes that summed-score estimators degrade less than pattern-score estimators — directly actionable. **Test length not reported in the text I read.**

**5. Sinharay, S. (2010).** *When Can Subscores Be Expected to Have Added Value? Results From Operational and Simulated Data.* ETS Research Report RR-10-08 / ED523969. https://doi.org/10.1002/j.2333-8504.2010.tb02223.x and https://files.eric.ed.gov/fulltext/ED523969.pdf — **Tier A. Full text (search + grep of results sections).** Establishes the ≥20-item and disattenuated-r < .85 thresholds for subscore added value, and that 10-item subscores have no added value at any realistic correlation. This is why the team's 14-items-per-bucket design, not their calibration, is the binding constraint. Companion: **Sinharay, Haberman & Puhan, ETS RM-08-18**, *Reporting Subscores: A Survey* (https://www.ets.org/Media/Research/pdf/RM-08-18.pdf) — operational surveys finding added value "for only a handful" of tests; and the **NCME Instructional Module on Subscores** (https://ncme.org/wp-content/uploads/2025/10/Module-32-Subscores-I-A-Statistical-Overview-Sinh-1.pdf).

**6. Yiğiter, M. S., & Doğan, N. (2023).** *The Effect of Test Design on Misrouting in Computerized Multistage Testing.* Uluslararası Türk Eğitim Bilimleri Dergisi. https://doi.org/10.46778/goputeb.1267319 — **Tier A for the numbers, B for venue (regional journal). Full text incl. Tables 5–8.** The only source found with complete misrouting-rate × measurement-accuracy tables across MST designs. Establishes that 12–29% misrouting occurs **with perfect item parameters**, at a cost of only ~+0.03 RMSE(θ) — the baseline noise floor against which calibration error must be judged.

**7. Beck, J. E., & Chang, K.-m. (2007).** *Identifiability: A Fundamental Problem of Student Modeling.* User Modeling 2007, LNAI 4511. https://www.cs.cmu.edu/~kkchang/paper/BeckChang.2007.UserModeling.IdentifiabilityStudentModel.pdf — **Tier A. Full text.** The infinite family of BKT parameter sets making identical predictions, and the +0.006 AUC gain (.614 → .620) from forcing plausibility. The strongest evidence that BKT is insensitive to the guess/slip values it consumes. Companion: **Doroudi, S., & Brunskill, E. (2017).** *The Misidentified Identifiability Problem of Bayesian Knowledge Tracing.* EDM 2017. https://files.eric.ed.gov/fulltext/ED577166.pdf — **Tier A** — corrects the framing (BKT *is* identifiable; the problem is semantic degeneracy) without changing the practical conclusion.

**8. Pardos, Z. A., & Heffernan, N. T. (2011).** *KT-IDEM: Introducing Item Difficulty to the Knowledge Tracing Model.* UMAP 2011. https://people.csail.mit.edu/zp/papers/UMAP2011_IDEM.pdf — **Tier A. Full text.** Quantifies the ceiling on what per-item difficulty buys BKT: +0.030 AUC on ASSISTments (9/10 datasets), nothing reliable on Cognitive Tutor except where data-points-per-problem is high (+0.10). Counterweight: **Revisiting and Extending the Item Difficulty Effect Model**, CEUR-WS Vol-1009 (2013), https://ceur-ws.org/Vol-1009/0106.pdf — **Tier B** — failed to replicate the ASSISTments advantage.

**9. Fink, A., König, C., & Frey, A. (2025).** *Accounting for item calibration error in computerized adaptive testing.* Behavior Research Methods, 57, 126. https://doi.org/10.3758/s13428-025-02649-8 (also https://d-nb.info/1372063846/34) — **Tier A. Full text of introduction and discussion.** The current state of the art on mitigation. Documents bias up to 40% of the calibration-sample SD when calibration error is ignored, and bias reductions of 33% / 69% / 84% for cWLE, cWLE+BMI, and fully Bayesian CAT. Also the best available literature review on this exact question.

**10. Linacre, J. M. (1994).** *Sample Size and Item Calibration (or Person Measure) Stability.* Rasch Measurement Transactions, 7(4), 328. https://rasch.org/rmt/rmt74m.htm and https://www.rasch.org/rmt/rmt94h.htm — **Tier B (analytically sound derivation, newsletter venue).** The most interpretable N ↔ logit-precision table available: ±1 logit at 95% needs N ≈ 30; ±0.5 logit at 95% needs N ≈ 100; 250 for high stakes. Cross-validated against Cheng et al.'s empirical RMSE(b) figures, which are somewhat better than Linacre's conservative table.

**11. Wauters, K., Desmet, P., & Van den Noortgate, W. (2011 / 2012).** *Acquiring Item Difficulty Estimates: a Collaborative Effort of Data and Judgment* (EDM 2011, http://educationaldatamining.org/EDM2011/wp-content/uploads/proc/edm2011_paper37_full_Wauters.pdf) and *Item difficulty estimation: An auspicious collaboration between data and judgment* (Computers & Education, 58(4), 1183–1193, https://doi.org/10.1016/j.compedu.2011.11.020) — **Tier B (25 items, single domain). Full text of EDM version incl. Table I.** The correlation ranking: proportion correct .90, learner feedback .88, Elo .85, expert rating .80. Establishes that plain p-values are essentially as good as IRT for Rasch difficulty, and that 200–250 learners per item suffices. This is the cheapest credible calibration path.

**12. Wollack, J. A., Sung, H. J., & Kang, T. (2006).** *The Impact of Compounding Item Parameter Drift on Ability Estimation.* NCME annual meeting paper, University of Wisconsin–Madison. https://testing.wisc.edu/research%20papers/NCME%202006%20paper%20(Wollack,%20Sung,%20&%20Kang).pdf — **Tier A (conference paper). Full text of summary.** The drift cost figures: single-cycle bias ≤ 0.14 (via Wells et al., 2002) versus compounding multi-year bias up to −0.52, and the finding that detecting-and-excluding drifted anchors recovers parameters better. Companion: **Int. J. Assessment Tools in Education (2022)**, *The study of the effect of item parameter drift on ability estimation obtained from adaptive testing under different conditions*, https://doi.org/10.21449/ijate.1070848 — **Tier B** — establishes that drift effects accumulate across administrations and that bank size and sample size do not moderate them.

**13. De Ayala, R. J. (2022).** *The Theory and Practice of Item Response Theory* (2nd ed.), Ch. 6. Guilford Press. https://www.guilford.com/excerpts/deayala_ch6.pdf — **Tier A (textbook). Full text of sample chapter.** The `r(θ̂)` cross-model correlations on real data where the 3PL fits best: .9908 (1PL–2PL), .9869 (2PL–3PL), .9778 (1PL–3PL). The cleanest single demonstration that model choice barely affects the ordering of persons.

**14. van Klaveren, C., Vonk, S., & Cornelisz, I. (2017).** *The effect of adaptive versus static practicing on student learning — evidence from a randomized field experiment.* Economics of Education Review, 58, 175–187. https://doi.org/10.1016/j.econedurev.2017.04.003 — **Tier A. Full text of results/conclusion.** A randomised field experiment finding no difference in test scores between difficulty-matched adaptive practice and static practice, with higher-ability students 0.08 σ *worse* under adaptive practice. Directly relevant to whether use case 2 justifies investment in difficulty accuracy.

**15. Properties and performance of the one-parameter log-linear cognitive diagnosis model (2024).** Frontiers in Education. https://doi.org/10.3389/feduc.2024.1287279 — **Tier A. Full text of results.** Two load-bearing findings: (i) constraining all item main effects equal (the Rasch-like restriction) produced "virtually no loss in classification accuracy" with 0.87–0.99 agreement across 108 conditions × 500 replications; (ii) attribute classification accuracy of ≈0.80 / 0.90 / 0.95 at 5 / 10 / 15 items per attribute, with sample size and base rate not mattering substantially. The best available anchor for "how many items per concept bucket."

**16. Kim, J., Chung, H., Park, R., & Dodd, B. G. (2013).** *A comparison of panel designs with routing methods in the multistage test with the partial credit model.* Behavior Research Methods, 45(4), 1087–1098. https://doi.org/10.3758/s13428-013-0316-3 — **Tier A. Full text of methods/abstract.** Defines DPI routing (rank-order and assign fixed proportions) versus AMI/M-AMI (information-based), and finds that "regardless of the routing method used, the same panel structure performed similarly in terms of the precision of the classification decision." Supports the argument that proportional routing is available at no measurement cost.

**17. Svetina, D., Liaw, Y.-L., Rutkowski, L., & Rutkowski, D. (2019).** *Routing Strategies and Optimizing Design for Multistage Testing in International Large-Scale Assessments.* Journal of Educational Measurement, 56(1). https://doi.org/10.1111/jedm.12206 — **Tier A, abstract + secondary.** IRT routing beat number-correct routing but "differences in bias and root mean squared error were generally small"; suboptimal routing gave more even exposure; item recovery best for moderate-difficulty items.

**18. Shim, H., Bonifay, W., & Wiedermann, W. (2023).** *Parsimonious asymmetric item response theory modeling with the complementary log-log link.* Behavior Research Methods, 55, 200–219. https://doi.org/10.3758/s13428-022-01824-5 — **Tier A. Full text of simulation 2 results.** Quantifies model misspecification cost: generating 3PL and fitting Rasch gives RMSE(θ) 0.3–0.5 versus < 0.2 for the correct model, but `r(θ̂, θ) > .95` for **all** models. The clean statement of "misspecification costs the metric, not the ordering."

**19. Doebler, A. (2012).** *The Problem of Bias in Person Parameter Estimation in Adaptive Testing.* Applied Psychological Measurement, 36(4), 255–270. https://doi.org/10.1177/0146621612443304 — **Tier A for the result, abstract only.** Shows analytically and by simulation that item-difficulty error produces *systematic* θ bias in adaptive testing even when the item errors are unbiased. The mechanism that makes systematic difficulty error dangerous. The "0.3 SD units" magnitude is Fink et al.'s characterisation, not read here.

**20. Patton, J. M., Cheng, Y., Yuan, K.-H., & Diao, Q. (2013).** *The Influence of Item Calibration Error on Variable-Length Computerized Adaptive Testing.* Applied Psychological Measurement, 37(1), 24–40. https://doi.org/10.1177/0146621612461727 — **Tier B, abstract only (paywalled).** The one source establishing that SE-based stopping rules are corrupted by capitalization on chance, with "complex effects on test length, ability estimation, and classification accuracy." Directly relevant if the team ever adopts variable-length testing. No magnitudes obtained.

**21. Experts' prediction of item difficulty of multiple-choice questions in the Ethiopian Undergraduate Medicine Licensure Examination (2024).** PMC11407004. https://pmc.ncbi.nlm.nih.gov/articles/PMC11407004/ — **Tier A. Full text.** 200 medical MCQs, 6 raters: individual-rater correlations with actual difficulty of .455–.545; regression R = .57, R² = 33%; inter-rater r = .725–.838. The best available calibration of what a judgment-based difficulty prior is worth in a medical-MCQ setting. Counterpoints: **Expert Prediction Versus Difficulty Index…** (https://doi.org/10.51846/jucmd.v3i2.3047) — **Tier B** — 1,150 preclinical medical items, 20 experts, r = .11, κ = .042; and **Impara & Plake (1998)**, *Teachers' Ability to Estimate Item Difficulty*, Journal of Educational Measurement, 35(1), 69–81, https://doi.org/10.1111/j.1745-3984.1998.tb00528.x — **Tier A venue, abstract only, no r extracted.**

**22. Cheng, Y., Liu, C., & Behrens, J. (2015).** *Standard Error of Ability Estimates and the Classification Accuracy and Consistency of Binary Decisions.* Psychometrika, 80(3), 645–664. https://doi.org/10.1007/s11336-014-9407-z — **Tier A, abstract only.** The analytic link: "when standard error decreases, the conditional classification accuracy and consistency increase," and "smaller standard error over the entire latent trait continuum guarantees" higher overall expected accuracy and consistency. Derives upper bounds for fixed-length CAT and lower bounds for VL-CAT stopping rules. Note the direction of this result: it is the one source here that *does* tie precision to classification quality, so it is a genuine counterweight — precision is not irrelevant to ordinal decisions, it is merely attenuated by thresholding.

**23. Deng, N. (2011).** *Evaluating IRT- and CTT-based Methods of Estimating Classification Consistency and Accuracy Indices from Single Administrations.* Doctoral dissertation, University of Massachusetts. https://doi.org/10.7275/2388959 — **Tier B, abstract + partial.** Four simulation studies on test length, local item dependence, model misfit and scoring metric. Key result: misfit and LID degraded true decision *accuracy* and caused all methods to overestimate it, while decision *consistency* estimates had "minimal impacts." Supports the accuracy-vs-consistency distinction.

**24. Chapman, R. L., Weiss, D. J., & Suen, K. Y. (2024).** *Effect of routing errors on the psychometric properties of multistage tests.* Book chapter. https://doi.org/10.4324/9780429263491-11 — **Tier B, abstract only.** 42-item three-stage MST Monte Carlo: routing errors occurred 15% of the time, adversely affected θ bias/RMSE/SEM, and θ-based routing outperformed defined-population-interval number-correct routing. Would be a primary source with full text; magnitudes not obtained.

**25. Kim, S., & Moses, T. (2014).** *An Investigation of the Impact of Misrouting Under Two-Stage Multistage Testing: A Simulation Study.* ETS Research Report. https://doi.org/10.1002/ets2.12000 — **Tier B, abstract only.** Forced examinees down all three MST paths; found score differences "negligible for practical purposes" when Stage-2 modules overlapped in difficulty, and similar trends even when modules were distinct. "The impact of misrouting was generally minimal."

**26. Predictive Fit Metrics for Item Response Models (2022).** Applied Psychological Measurement. PMC8908407. https://pmc.ncbi.nlm.nih.gov/articles/PMC8908407/ — **Tier A. Full text of discussion.** Benchmarks minimum sample size for the 3PL by asking when it out-predicts the 2PL out-of-sample: ≥1,000 (ELPL-MR) or 500–1,000 (ELPL-MP). Also catalogues the range of published 3PL minimum-N recommendations (1,000 / 5,000 / 100,000).

**27. Badrinath, A., Wang, F., & Pardos, Z. (2021).** *pyBKT: An Accessible Python Library of Bayesian Knowledge Tracing Models.* EDM 2021. https://arxiv.org/pdf/2105.00385 — **Tier B. Full text of §4.2.** Establishes ~50 students for BKT parameter convergence and sequence length ≥ 15 to mitigate worst-case mastery misestimation at the conventional P(L) ≥ 0.95 threshold.

**28. The Impact of Item Model Parameter Variations on Person Parameter Estimation in CAT With Automatically Generated Items (2023).** Frontiers in Psychology / PMC10240571. https://pmc.ncbi.nlm.nih.gov/articles/PMC10240571/ — **Tier A, abstract + partial.** Relevant to the team's item-family structure: ignoring within-family parameter variation leaves SE similar, has RMSE effects compensated by test length, but produces centre-directed bias that test length does *not* fix — unless "fake-easy" and "fake-difficult" siblings are balanced so their effects cancel.

**29. Patton, J. M., Cheng, Y., Yuan, K.-H., & Diao, Q. (2014).** *Bootstrap Standard Errors for Maximum Likelihood Ability Estimates When Item Parameters Are Unknown.* Educational and Psychological Measurement, 74(4), 697–712. https://doi.org/10.1177/0013164413511083 — **Tier A. Full text.** Establishes that SEs ignoring calibration error are too small, with the shortfall growing as calibration N shrinks — but also, importantly, that "the effect of calibration sample size on the empirical SE was rather small for most θ values, suggesting that an SE that ignores calibration error may have been sufficient." Both corrected SEs approximated the empirical SE well at 40 items; neither was uniformly superior. Notes as an explicit limitation that in all their simulations the IRT model and latent density were correctly specified.

**30. Investigating the Impact of Item Parameter Drift for IRT Models with Mixture Distributions (2016).** Frontiers in Psychology. https://doi.org/10.3389/fpsyg.2016.00255 — **Tier B, abstract + partial.** Drift confined to difficulty in one latent subgroup induces apparent drift in *both* difficulty and discrimination in a fitted unidimensional model; shifts in the examinee ability distribution alone can manifest as IPD. Relevant because this team's user population will shift over time.

**31. Multistage Adaptive Testing for a Large-Scale Classification Test (ED542026).** https://files.eric.ed.gov/fulltext/ED542026.pdf — **Tier B, abstract + partial.** "For classification purposes, however, MST provided classification accuracy as good as that from CAT, with more efficient item bank usage." With-overlap MSTs matched CAT classification accuracy at lower exposure.

**32. A Paradox Between IRT Invariance and Model-Data Fit When Utilizing the One Parameter and Three-Parameter Models (ED501105).** https://files.eric.ed.gov/fulltext/ED501105.pdf — **Tier B (conference paper).** 1PL item difficulties were *more* invariant across ability subgroups (Pearson .989–.993, Spearman .982–.990) than 3PL difficulties (.953–.963, .958–.967), despite the 3PL fitting better. Supports the parsimony argument.

**33. Effect of Sample Size on Common Item Equating Using the Dichotomous Rasch Model (2019).** Applied Measurement in Education. https://doi.org/10.1080/08957347.2019.1674309 — **Tier A venue, abstract only.** Resampling design, N = 20 to 200 against a full sample of 9,678: "less precision and item calibration instability occur with smaller sample sizes; however, **the decreasing sample size has minimal effect on the person ability estimates.**"

**34. Rai, D., Gong, Y., & Beck, J. E. (2009).** *Using Dirichlet priors to improve model parameter plausibility.* EDM 2009. https://educationaldatamining.org/EDM2009/uploads/proceedings/rai.pdf — **Tier A for the decoupling claim. Full text.** Follow-up to Beck & Chang, and the source of the single most directly useful sentence for question 8: "a model's ability to predict student performance is at best weakly related to the accuracy of any one of its parameters." Dirichlet priors yielded demonstrably more plausible BKT parameters but "we are not able to predict student behavior any better."

**35. `irtsim` package vignette: Model misspecification (generate 2PL, fit 1PL).** CRAN, accompanying Schroeders & Gnambs (2025). https://cran.r-project.org/web/packages/irtsim/vignettes/paper-example-1b-misspecification.html — **Tier C (software documentation; peer-reviewed article not read).** Articulates the bias–variance trade cleanly: the 1PL reaches a given RMSE(b) threshold at smaller N for typical items, but items with extreme discriminations acquire persistent bias that no amount of additional data eliminates.

**36. Linacre, J. M. / Wright, B. D., 3PL IRT or Rasch?** Rasch Measurement Transactions 9:1. https://www.rasch.org/rmt/rmt91b.htm — **Tier C (partisan newsletter, but a real analysis of NALS, N = 24,944).** Disattenuated correlations between Rasch measures and 3PL plausible values all ≥ .92, with 40 of 120 exceeding .99; Rasch vs 3PL item difficulties r = .94; first principal component absorbing 88% of variance. Directionally consistent with the A-tier cross-model correlation evidence, and cited only for that reason.

**Excluded:** one search result (`bkt.tyche.institute`) appeared to be an unrefereed tutorial/hackathon site with plausible-looking but uncitable BKT parameter-sensitivity claims. Nothing in this document rests on it.
