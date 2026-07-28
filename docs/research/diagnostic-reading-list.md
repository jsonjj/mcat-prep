# Diagnostic Design — Reading List (v2)

Supersedes the original twenty-source list, which is retained in
`diagnostic-source-knowledge-tree.md` for the per-paper DOK entries.

**Why this list replaces the first one.** The original sweep returned good papers about
things *adjacent* to our problem — MOOC attrition, community-college remediation policy,
gender differences in guessing under penalty scoring, feedback interventions in general.
Applying any of them to a short adaptive diagnostic required a bridge across domain,
population, or construct. This list is scoped to literatures that address the design
question directly: adaptive versus fixed administration, cognitive-diagnostic adaptive
testing, and how few items suffice for a trustworthy decision.

**Provenance marking.** `[read]` means the full text was retrieved and the cited numbers
checked against it directly. `[agent-read]` means a research agent retrieved the full text
and tagged each number with its source. `[abstract]` and `[paywalled]` mean what they say —
treat those numbers as unconfirmed.

---

## Q1. How long should the diagnostic be?

This is the question the old list could not answer at all. It now has a defensible answer,
but only once you separate three things that are routinely conflated.

**The three questions are different and their answers differ by roughly fourfold.**

| What you claim | Literature | Items per dimension |
| --- | --- | --- |
| "You're weak enough here to start here" (binary call) | Maas et al. 2022 | ~5 |
| "This read is stable and would replicate" (consistency) | Emons 2007; Kruyen 2012 | 20–40 |
| "This subscore tells you something the total doesn't" (added value) | Sinharay 2010 | ~20, plus distinctness |

A research agent reported these as converging on "20 items per dimension." They do not
converge; they answer different questions. **Which one binds us depends entirely on what we
claim the diagnostic output means.** A coarse "start here" recommendation is cheap. A
rank-ordered profile of relative strengths is expensive.

This entry originally closed by saying that our product language leaned toward the expensive
claim while our item budget funded the cheap one, and called that gap the single clearest
finding of the whole research effort. **The gap has since been closed, and it was closed by
moving the claim rather than the budget.** The report now names two priorities, which is what
140 items over ten concepts funds; it does not name a ranked profile, and the design document
treats that as a measurement fact rather than a presentational choice. The finding therefore
stands as the reason for the change and no longer describes the current state — what to check
in future is not whether the two are aligned but whether any new surface quietly re-introduces
the expensive claim.

**1. Maas, Brinkhuis, Kester & Wijngaards-de Meij (2022). Diagnostic Classification Models
for Actionable Feedback in Education: Effects of Sample Size and Assessment Length.**
*Frontiers in Education* 7:802828. `[read]`
<https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2022.802828/full>

- Minimum test length to reach 0.90 marginal (per-attribute) classification accuracy, from
  Table 4: **15 items for 3 attributes, 20 for 4, 25 for 5, 30 for 6** — a clean 5 items per
  attribute. Ten items never reached 0.90 at any attribute count.
- Where 0.90 was achievable, required calibration samples were only **100–300 respondents**.
  Test length mattered far more than sample size.
- Model fit statistics **failed to flag** the degraded conditions: RMSEA2 stayed below cutoff
  when A=5 and I≤20, and when A=6 and I≤25. Fit indices will not warn us if the attribute
  structure is too fine-grained.
- **Boundary conditions that matter to us:** correctly specified Q-matrix; high item quality
  (unidimensional main effects sampled from U(2.20, 2.90)); every attribute measured in
  isolation at least once; items load on at most two attributes. This is a favorable case.
  Naive extrapolation gives 50 items for 10 dimensions, but our multi-loading, uncalibrated
  bank should expect worse.

**2. Emons, Sijtsma & Meijer (2007). On the consistency of individual classification using
short scales.** *Psychological Methods* 12(1), 105–120. `[agent-read]`
<https://research.tilburguniversity.edu/en/publications/on-the-consistency-of-individual-classification-using-short-scale>

- With 6 items at the cut score and high discrimination, only **66%** of the above-cut group
  is classified correctly in at least 90% of hypothetical repeat administrations — falling to
  **33%** when the cut sits at the 5th percentile.
- Consistency reaches **.82 at 20 items and .87 at 40** at a median cut with good items.
- Lengths of 8, 10 and 12 items did not improve appreciably over 6.
- Authors assume items are optimally located at the cut score, which is a best case, and
  recommend short tests be combined with other information rather than used alone.

**3. Sinharay (2010). When Can Subscores Be Expected to Have Added Value?** ETS RR-10-16.
`[agent-read]` <https://files.eric.ed.gov/fulltext/ED523969.pdf>

- Across **25 operational tests, 16 had no subscore with added value**; the 9 that did
  averaged at least 24 items per subscore.
- Subscores need **at least 20 items and disattenuated intercorrelations below 0.85**.
  Ten-item subscores had no added value even at r = 0.70.
- **Augmented** subscores — borrowing strength from the total — had added value far more
  often, including at 10 items when r ≤ 0.85. This is the direct empirical warrant for our
  hierarchical pooling, and it is a stronger result than the 2008 survey we cited before.

**4. Cheng & Morgan (2013). Classification accuracy and consistency of computerized adaptive
testing.** *Behavior Research Methods* 45, 132–142. `[read]`

- Operational 12-item placement CAT, 642-item pool, five performance categories: classification
  accuracy **.74**, consistency **.66**.
- **12 → 20 items: CA .74 → .79, CC .66 → .71. 20 → 40 items: CA .79 → .80, CC .71 → .72.**
  The diminishing-returns elbow sits at about 20 items.
- Collapsing five reported categories to pass/fail improves accuracy **more than doubling
  test length does**. Reporting grain is a bigger lever than item budget.
- The authors note that raw accuracy understates the value of longer tests, because longer
  tests reduce *severe* misclassifications (off by two or more categories) even when overall
  accuracy barely moves.

---

## Q2. Does adaptivity actually help us?

**5. Martin, McBride & Weiss (1983). Reliability and Validity of Adaptive and Conventional
Tests in a Military Recruit Population.** Research Report 83-1, University of Minnesota.
`[read]` <https://conservancy.umn.edu/server/api/core/bitstreams/db6de273-2fb9-41d0-9695-a7e2e34b941a/content>

**Read this one first.** It is the empirical origin of the "adaptive needs half as many items"
claim, and its failure conditions describe us better than its success conditions do.

- **9 adaptive items matched the alternate-forms reliability of 17 conventional items**;
  11 adaptive items matched the validity of 27 conventional. 550 Marine recruits, Owen's
  Bayesian selection.
- Adaptive forms hit r = .80 with the 50-item criterion after **10–11 items**; conventional
  forms needed **28–30**.
- **The critical caveat, in the authors' own words.** Kingsbury & Weiss (1980), the first
  large-scale live test of the same Bayesian adaptive strategy, found conventional tests
  "achieved consistently higher validities than the Bayesian adaptive strategy" in college
  students. The authors list among the causes that "the range of the ability distribution in
  the college student sample was small," and explain their own success by noting that with
  Marine recruits "restriction of the ability range should have been less severe than in the
  case of the college population."
- **Why this matters to us:** paying MCAT preppers are pre-meds who have already self-selected
  into a competitive admissions pipeline. That is more range-restricted than general college
  students — the condition under which adaptive testing *lost* in this literature. The
  headline efficiency claim was obtained under close to the opposite of our conditions.

**6. Zheng, Nozawa, Gao & Chang (2012). Multistage Adaptive Testing for a Large-Scale
Classification Test.** ACT Research Report 2012-6. `[agent-read]`
<https://files.eric.ed.gov/fulltext/ED542026.pdf>

- **21-item MST beat a 30-item linear form on correct classification (.745 vs .703) while
  having worse RMSE (.374–.419 vs .364).** Adaptivity won the decision and lost the
  measurement.
- Against a 21-item CAT, MST lost badly on point estimation (RMSE .383 vs .254) but was
  competitive on classification (.788 vs .781).
- Item bank usage: CAT drew on 530 of 600 items; the best MST used 131–224 with more uniform
  exposure.
- Adding a fourth stage produced no consistent gain, and simple true-score routing performed
  as well as θ routing.

**7. Kim & Yoo (2022). Cognitive Diagnostic Multistage Testing by Partitioning Hierarchically
Structured Attributes.** *Journal of Educational Measurement*. `[read]`
<https://doi.org/10.1111/jedm.12339>

- The direct adaptive-versus-fixed comparison **in a diagnostic setting**, which nothing on the
  old list provided. 300-item bank, 1,000 examinees, DINA-H.
- Fixed-length cognitive-diagnostic MST beat a conventional 28-item test by **about 0.2 in
  pattern-level correct classification**.
- Variable-length CD-MST cut mean test length from 28 to **16–19 items** (linear attribute
  hierarchy), 20–23 (convergent), 21–24 (divergent), while still beating the fixed test.
- Good prior information about the population could **replace the routing stage** entirely.

**8. Paap, Born & Braeken (2019). Measurement efficiency for fixed-precision multidimensional
computerized adaptive tests.** *Applied Psychological Measurement* 43(1), 68–83. `[agent-read]`
<https://pmc.ncbi.nlm.nih.gov/articles/PMC6295884/>

- Multidimensional CAT was **11% shorter at r = .56 and 35% shorter at r = .80** than separate
  unidimensional CATs. The gain scales with how correlated the dimensions are.
- In the education-like scenario (dichotomous, moderate discrimination — our case), even
  well-functioning CATs needed **31 to 89 items** across three dimensions.
- Adaptive administration was **infeasible in the majority of cells** of the dichotomous
  scenario: the precision target was simply unreachable.

**9. Reese, Schnipke & Luebke (1999). Incorporating Content Constraints into a Multi-Stage
Adaptive Testlet Design.** LSAC CT 97-02. `[agent-read]`
<https://files.eric.ed.gov/fulltext/ED467816.pdf>

- A 25-item content-balanced two-stage design beat 25- and 51-item fixed forms **in the middle
  of the ability scale**, but both fixed forms were **more precise at the extremes**.
- Bias was comparable to the equally short fixed form — no bias advantage from adapting.
- The report repeats the "about one half" efficiency claim and then immediately states it is
  "rarely practical" for real programs because content balancing "compromises the efficiency."

---

## Q3. Can we run adaptive selection on an uncalibrated bank?

This is our most urgent open question and the old list did not touch it.

**10. Chang, Chiu & Tsai (2019). Nonparametric CAT for Cognitive Diagnosis in Educational
Settings With Small Samples.** *Applied Psychological Measurement* 43(7), 543–561. `[read]`
<https://pmc.ncbi.nlm.nih.gov/articles/PMC6739744/>

- **At 8 attributes with a 100-person calibration sample, every parametric selection rule fell
  below 0.20 pattern recovery** — the paper states they "did not behave much differently from
  a random selection method." Nonparametric selection, which uses no item parameters, held at
  0.63–0.67.
- At K=5 with 100 calibration examinees: nonparametric ≈ 0.85, GDI below 0.78, and SHE / PWKL /
  PWCDI "in the 0.6s or worse."
- At 30 examinees: nonparametric still ≈ 0.85; GDI dropped to 0.45 under a uniform attribute
  distribution; the rest fell below 0.30.
- Exposure control was also better: χ² of 12.8 versus 196.7 (PWKL) and 230.7 (PWCDI).
- **Read against Wauters (retained below):** their parametric methods fail because parameters
  *estimated from tiny samples* are noisy. Ours are expert-assigned, and expert ratings
  correlate ~0.80 with true difficulty — plausibly better than a 30-person calibration. We are
  in an untested regime, not a known-broken one, and expert priors are the specific thing that
  might save us. Worth an explicit simulation.

**11. Sun, Liu, Xin & Song (2020). The Impact of Item Calibration Error on Variable-Length
CD-CAT.** *Frontiers in Psychology* 11:575141. `[agent-read]`
<https://pmc.ncbi.nlm.nih.gov/articles/PMC7738350/>

- **The failure mode is premature termination.** Calibration error inflates the posterior
  probability that an examinee belongs to a profile, so a confidence-based stopping rule fires
  early. Relative measurement precision exceeded 1.0 in *every* DINA and RRUM condition.
- Relative test efficiency — how much the test overstates its own information — reached
  **45.5** for DINA with low-quality items at error SD 0.3, and was still 8.4 with high-quality
  items.
- Compensatory models (CRUM) were nearly immune, never exceeding 1.10.
- **Directly actionable:** we have a variable-length rule driven by posterior confidence and an
  uncalibrated bank. Our Track-1 harness can test this by injecting difficulty noise and
  checking whether the stop fires earlier while accuracy drops.

**12. Rudner & Guo (2011). Computer Adaptive Testing for Small Scale Programs and
Instructional Systems.** GMAC RR-11-01. `[agent-read]`
<https://www.gmac.com/~/media/Files/gmac/Research/research-report-series/rr1101_catforsmallscaleprograms>

- The encouraging counterweight to #10. **Calibration sample size mattered far less than test
  length**: at 30 items, accuracy was .741 with a 100-person calibration versus .783 with 2,000.
- **Pool size was nearly irrelevant**: .777 (600 items), .783 (300), .783 (200).
- Measurement decision theory beat 3PL IRT at every length (.709 vs .657 at 10 items;
  .804 vs .777 at 30).
- Authors caution their calibration used perfect known classifications, which "may have yielded
  artificially accurate item calibrations."

**13. Fink, König & Frey (2025). Accounting for item calibration error in computerized adaptive
testing.** *Behavior Research Methods* 57, 126. `[agent-read]`
<https://link.springer.com/content/pdf/10.3758/s13428-025-02649-8.pdf>

- Ignoring calibration error biased ability estimates by **up to 40% of a standard deviation**.
- **Calibration sample size had the largest main effect on bias** (η² = 0.019); test length was
  negligible for bias (η² < 0.001) though substantial for MSE.
- A fully Bayesian treatment cut bias by **84%** in the most extreme conditions; a corrected
  WLE alone cut it 33%.
- This is the properly retrieved version of the paywalled calibration-error entry in v1.

**14. Wang, Tu, Song, Zheng & Wang (2021). An Adaptive Design for Item Parameter Online
Estimation and Q-Matrix Online Calibration in CD-CAT.** *Frontiers in Psychology* 12:710497.
`[agent-read]` <https://pmc.ncbi.nlm.nih.gov/articles/PMC8421652/>

- The path out of the cold start. Q-matrix recovery per new item, by examinees seen:
  **0.66 at 100, 0.80 at 200, 0.86 at 400, 0.96 at 800, 1.00 at 1,600**.
- Adaptive examinee allocation beat random at every sample size (0.61 / 0.73 / 0.84 / 0.91 /
  0.97) and was more stable.
- Slipping parameters were consistently harder to estimate than guessing parameters.
- Assumes an existing calibrated bank into which new items are seeded — it does not solve
  cold-starting from zero, which is our actual situation.

---

## Q4. How many dimensions can we report, and with what stopping rule?

**15. Guo & Zheng (2019). Termination Rules for Variable-Length CD-CAT From the Information
Theory Perspective.** *Frontiers in Psychology* 10:1122. `[agent-read]`
<https://pmc.ncbi.nlm.nih.gov/articles/PMC6549543/>

- The only source found that reports length and accuracy across **4, 5, 6, 7, 8, 10 and 12
  attributes** — our dimensionality range.
- Under a 0.90 posterior-threshold rule with DINA: **4 attributes → 7.1 items** for PCCR .941;
  **6 → 12.9 items** for .935; **8 → 33.8 items** for .926. Under Fusion: 12.7, 23.1, 45.3.
- **The Shannon-entropy rule was dramatically more efficient**: at 8 attributes it reached
  PCCR .974 in **20.0 items**, beating the posterior rule's .926 in 33.8 items.
- Posterior-threshold rules **drift with attribute count** (.747 → .706 → .677 across 8, 10, 12
  attributes) while entropy rules stayed stable. This is the paper's central claim and it is
  not yet independently replicated.

**16. Wang, Song, Wang, Gao & Xiong (2020). A Note on the Relationship of the Shannon Entropy
Procedure and the Jensen–Shannon Divergence in CD-CAT.** *SAGE Open* 10(1). `[agent-read]`
<https://journals.sagepub.com/doi/10.1177/2158244019899046>

- Proves **JSD = H(posterior) − SHE**, so the two criteria select identical items. Prunes the
  comparison space.
- Contains the cleanest statement of the metric that matters to us: at 5 items, **attribute-level
  accuracy .838–.897 versus pattern-level .530**; at 10 items, **.913–.953 versus .747**.
  Doubling the test bought 22 points of pattern accuracy but only ~6 of attribute accuracy.
- **We report per-cluster reads, not a full mastery pattern.** The forgiving metric is ours.

**17. Kaplan, de la Torre & Barrada (2015). New Item Selection Methods for Cognitive Diagnosis
Computerized Adaptive Testing.** *Applied Psychological Measurement* 39(3), 167–188.
`[agent-read]` <https://pmc.ncbi.nlm.nih.gov/articles/PMC5978538/>

- Selection method matters only on short tests. At 10 items: GDI .887, MPWKL .878, PWKL .752.
  At 20 items: .996 / .989. At 40: all 1.000.
- **Item quality dominated everything**: 0.98 versus 0.60 on the same 10-item test depending on
  discrimination and variance.
- GDI is **4× faster than PWKL and 4.5× faster than MPWKL** at equivalent accuracy.

**18. Huebner, Finkelman & Weissman (2018). Factors Affecting the Classification Accuracy and
Average Length of a Variable-Length Cognitive Diagnostic Computerized Test.** *JCAT* 6(1), 1–14.
`[agent-read]` <https://jcatpub.net/index.php/jcat/article/download/55/30>

- **Q-matrix density mattered far more than the selection rule.** Low → high density dropped
  accuracy from .819 to .774 and raised length from 9.55 to 13.71 items.
- Mutual information and MPWKL differed by under one percentage point across all 24 conditions.
- Even the best case misclassified roughly **one examinee in six** on at least one of six skills.

**19. van der Linden (1998). Bayesian Item Selection Criteria for Adaptive Testing.**
*Psychometrika* 63(2), 201–216. `[agent-read]`
<https://files.eric.ed.gov/fulltext/ED424235.pdf>

- The direct descendant of Owen's Bayesian sequential procedure, and the closest thing in the
  literature to our expected-information-gain selection.
- Bayesian criteria clearly beat maximum-information at **5 items**, but by **n = 10** the author
  found "no systematic differences between the five criteria" — a crossover he calls "lower than
  was anticipated."
- This entry used to conclude that **our sophisticated selection machinery earns its keep in
  roughly the first ten items and little thereafter**, which our own measurement campaign has
  since shown to be true of only half the machinery. The undifferentiated version is misleading,
  so it is replaced by the split:
  - **Adaptive *difficulty* selection is worth under a point.** Doubling the routing decisions
    from three to six moved worst-world reproducibility by 0.3 points, and the whole family of
    designs from 2 to 20 stages at fixed length sits inside a single point of itself. This is
    van der Linden's crossover reproduced on our own instrument.
  - **Adaptive *allocation* — which concepts receive the items — is worth 3.5 to 6.2 points**,
    depending on the reporting axis and the length. It is not what he was measuring, and it is
    where nearly all of our adaptivity's value turns out to sit.
- The practical reading is that his caution applies to the item-by-item difficulty choice and
  should not be carried over to the decision about where the budget is spent. He scopes his own
  recommendation to short tests and routing modules.

**20. Xi, Tu & Cai (2022). Dual-Objective Item Selection Methods in CAT Using Higher-Order
Cognitive Diagnostic Models.** *Applied Psychological Measurement* 46(5), 422–438. `[agent-read]`
<https://pmc.ncbi.nlm.nih.gov/articles/PMC9265487/>

- Quantifies what our hierarchical pooling buys **for classification, which is not what we
  report**. This entry was previously headed as quantifying what pooling buys us outright, and
  that was too generous. Exploiting a higher-order latent trait raised pattern classification
  from **.876 to .918** at 6 attributes on a 12-item test.
- **The advantage grows with dimensionality** (4.2 points at K=6, 6.3 at K=8) **and collapses
  with length** (.990 → .993 at 4K items).
- Pooling is worth most exactly where we operate: many dimensions, few items.
- **What our own campaign found, and why it narrows this entry.** Pooling does not improve
  *ordering* at all: uniform shrinkage toward a common mean is a monotone transformation, so
  rank order is left exactly unchanged, and our simulation reproduced identical ranking metrics
  with and without it. Since the report is a set of named priorities drawn off a ranking, the
  gain Xi, Tu & Cai measure does not reach the thing the learner sees.
- **And the remaining advantage is contingent on uneven allocation rather than unconditional.**
  Against an unpooled estimator, the pooled one leads 69.9% to 67.7% under the contention-weighted
  selector and *trails* it 63.4% to 67.5% under an even split, while the unpooled estimator
  barely moves between the two. Pooling pays in proportion to how starved the worst-measured
  dimension is, so it is a consequence of allocating unevenly and not an independent argument
  for balanced stages.

---

## Retained from v1

These earned their place and survive unchanged. Full DOK entries are in
`diagnostic-source-knowledge-tree.md`.

- **Gu & Xu — identifiability of the DINA model.** Still the design gate. Conditions 1 and 2 are
  sufficient and necessary; each attribute needs an isolating item and at least three items.
- **Wauters et al. — acquiring item difficulty estimates.** Now load-bearing rather than
  peripheral, because it is our answer to Chang, Chiu & Tsai: expert ratings correlate 0.80 with
  true difficulty, learner self-ratings 0.88, Elo 0.85.
- **Gervet et al. — when is deep learning the best approach to knowledge tracing.** The finding
  that expert domain models add little predictive power still stands, and still bears on the
  422-KC taxonomy.
- **Bjork & Bjork — desirable difficulties.** Governs item difficulty policy.

## Demoted to context

Still true, still interesting, no longer load-bearing. They describe the environment around the
diagnostic rather than the diagnostic itself, and every application of them requires a bridge.

- Dai et al. (MOOC stopout) — free-MOOC population, wrong commitment filter.
- Baldiga (gender differences in willingness to guess) — useful for the one narrow decision about
  the "I don't know" button; not a general design input.
- Kluger & DeNisi (feedback interventions) — sound principle, unverified numbers, no diagnostic
  content.
- Scott-Clayton & Rodriguez (NBER) and CAPR/MDRC — superseded for our purposes by Scott-Clayton's
  CCRC working paper (below), which reports the same setting with placement-instrument detail.
- Shanks/Yang (test anxiety), van der Bles (communicating uncertainty), NAD decision, ALEKS
  meta-analysis, Standards, Wise (rapid guessing) — retained as context only.

**One addition to the demoted tier worth reading anyway:** Scott-Clayton (2012), *Do High-Stakes
Placement Exams Predict College Success?*, CCRC WP-41,
<https://files.eric.ed.gov/fulltext/ED529866.pdf> `[agent-read]`. Adding placement-test scores to
a model already containing high school GPA raised explained variance by ~6 points in math and
under 2 in English; high school background alone beat the test alone in both subjects. The
cleanest available statement of how little a short test adds once you have history — which is
what our in-product evidence eventually becomes.

---

## What we still could not find

**No published direct comparison of adaptive versus fixed administration for 10–20 dimension
profile scoring on an uncalibrated bank.** That is precisely our configuration. Three separate
sweeps failed to turn one up. The absence is unchanged; what has changed is what follows from it.

This section used to conclude that the simulation harness was therefore the only instrument that
could answer the question for us. That was true when written and the harness was built and run on
the strength of it. **It has now been spent.** The campaign covered four lengths, two candidate
axes, both delivery arms, a 2-to-20-stage family, several leverage strengths and allocation
policies, and 24 assumption worlds, and it settled the design questions the literature could not:
how many priorities the report is entitled to name, what staged delivery costs, where adaptivity's
value actually sits, and that the shipped estimator is already at its exact-posterior bound.

**What blocks us now is a calibrated item bank, and nothing further is blocked on simulation.**
Every figure the campaign produced is conditional on a generative learner model that has never met
a real response, so another sweep would only produce another number about that model. The next
material fact about this instrument has to come from a learner. The harness remains a first-class
component — it is what the calibration work will be re-run through — but it is no longer the thing
standing between us and an answer.

Still paywalled and worth buying if this becomes load-bearing: Segall (1996) on multidimensional
adaptive testing (the source of the "one-third fewer items" figure for correlated dimensions);
Hsu & Wang (2015) on variable-length higher-order DINA CAT; Cheng (2009), the paper that
introduced PWKL; and Patton, Cheng, Yuan & Diao (2013) on capitalization on calibration error
causing premature termination — the closest published work to the failure mode in #11.
