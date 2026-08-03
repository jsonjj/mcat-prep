# Diagnostic Design — BrainLift Knowledge Tree

> **Archive copy, 2026-07-31.** This is the complete pre-pruning tree — all 68 entries. The working
> tree at `docs/research/diagnostic-brainlift-tree.md` was pruned to 15 entries on this date; every
> entry removed from it survives here unchanged.

Every entry below is reorganised from exactly three source documents and from nothing else:

- `docs/research/diagnostic-source-knowledge-tree.md` (the v1 per-paper DOK tree)
- `docs/research/diagnostic-reading-list.md` (the v2 reading list)
- `docs/design/diagnostic-clean-slate-proposal.md` (the design specification)

No source was re-read, no figure was recomputed, and no number appears here that does not appear
in one of those three files. Where a source carries no number in the originals, the entry says so
explicitly rather than supplying one.

**Provenance markers are reproduced exactly as the source documents give them.** The vocabulary
actually in use across the three files is:

| Marker | Meaning as the sources define it |
| --- | --- |
| `[read]` | Full text retrieved; cited numbers checked directly against it |
| `[agent-read]` | A research agent retrieved the full text and tagged each number with its source |
| `VERIFIED — full text read` | v1 tree's equivalent of `[read]` |
| `UNVERIFIED — <reason>` | v1 tree; claims come from secondary summaries, not to be cited as fact |
| `[measured]` | Computed from this repository's own bank or registry; command reproducible |
| `[simulated]` | Result of this project's own modelling / measurement campaign |
| `[unverified]` | Reasoning or recalled literature not checked in this project |

The reading list's provenance note also defines `[abstract]` and `[paywalled]`, and the brief for
this document anticipated `[abstract]` and `[secondary]`. **No entry in any of the three source
documents actually carries `[abstract]`, `[secondary]`, or `[paywalled]` as its marker**, so those
markers appear nowhere below. The v1 tree's `UNVERIFIED` entries are the ones resting on secondary
summaries, and each states its own reason for non-retrieval verbatim.

**A caveat inherited from the design document and applying to every `[simulated]` entry here.**
Every quantitative result from this project's own campaign is simulation under a generative learner
model that has never been fitted to a real response, on an uncalibrated item bank. Simulation can
establish orderings of designs and identify designs that fail outright; it cannot forecast a rate.
Each `[simulated]` figure is quoted with the conditions that produced it — reporting axis, item
budget, delivery arm, number of assumption worlds, learners per cell — because several figures in
this tree differ *only* by those conditions and a number quoted without them is a different claim.

---

## Index

| Category | Entries |
| --- | --- |
| 1. Test logic | 25 |
| 2. What a diagnostic can actually deliver | 30 |
| 3. Effect on the learner | 11 |
| Unsorted | 2 |

---

# 1. Test logic

Adaptive versus fixed administration; item-level CAT versus multistage testing; how far adaptivity
should reach; test length; stopping criteria and the metrics behind them.

---

### 1.1 Martin, McBride & Weiss (1983). Reliability and Validity of Adaptive and Conventional Tests in a Military Recruit Population. Research Report 83-1, University of Minnesota. `[read]`

<https://conservancy.umn.edu/server/api/core/bitstreams/db6de273-2fb9-41d0-9695-a7e2e34b941a/content>

**DOK 1**

- **9 adaptive items matched the alternate-forms reliability of 17 conventional items**; **11
  adaptive items matched the validity of 27 conventional items**. 550 Marine recruits, Owen's
  Bayesian selection.
- Adaptive forms hit r = .80 against the 50-item criterion after **10–11 items**; conventional
  forms needed **28–30**.
- The authors' own caveat: Kingsbury & Weiss (1980), the first large-scale live test of the same
  Bayesian adaptive strategy, found conventional tests "achieved consistently higher validities
  than the Bayesian adaptive strategy" in college students. The authors attribute this to range
  restriction — "the range of the ability distribution in the college student sample was small" —
  and explain their own success by noting that with Marine recruits "restriction of the ability
  range should have been less severe than in the case of the college population."
- The design specification adds that this result was obtained on a strictly **unidimensional**
  test.

**DOK 2**

This is the empirical origin of the "adaptive needs half as many items" claim that the whole
adaptive-testing sales pitch rests on, and its failure condition describes an MCAT prep population
better than its success condition does. Paying MCAT preppers are pre-meds who have self-selected
into a competitive admissions pipeline, which is *more* range-restricted than the general college
students among whom the same strategy lost to conventional testing. The headline efficiency figure
was therefore obtained under close to the opposite of our conditions and should not be led with.
What survives is narrower: adaptivity reallocates items toward dimensions where the posterior is
still wide, which matters most for learners far from the cohort mean.

---

### 1.2 Zheng, Nozawa, Gao & Chang (2012). Multistage Adaptive Testing for a Large-Scale Classification Test. ACT Research Report 2012-6. `[agent-read]`

<https://files.eric.ed.gov/fulltext/ED542026.pdf>

**DOK 1**

- **21-item MST beat a 30-item linear form on correct classification (.745 vs .703) while having
  worse RMSE (.374–.419 vs .364).**
- Against a 21-item CAT, MST lost badly on point estimation (RMSE **.383 vs .254**) but was
  competitive on classification (**.788 vs .781**).
- Item bank usage: CAT drew on **530 of 600 items**; the best MST used **131–224** with more uniform
  exposure.
- Adding a fourth stage produced no consistent gain, and **simple true-score routing performed as
  well as θ routing**.

**DOK 2**

This is the cleanest statement of the trade a diagnostic wants: adaptivity won the *decision* and
lost the *measurement*, which is the right direction when the output is a placement rather than a
score. The true-score-routing result is the load-bearing one for an uncalibrated bank, since it
means the routing machinery does not depend on item parameters we do not have. The exposure figures
also say MST is far gentler on a thin pool than item-level CAT, which matters when one concept's
bank is the binding constraint.

---

### 1.3 Kim & Yoo (2022). Cognitive Diagnostic Multistage Testing by Partitioning Hierarchically Structured Attributes. *Journal of Educational Measurement*. `[read]`

<https://doi.org/10.1111/jedm.12339>

**DOK 1**

- The direct adaptive-versus-fixed comparison **in a diagnostic setting**. 300-item bank, 1,000
  examinees, DINA-H.
- Fixed-length cognitive-diagnostic MST beat a conventional 28-item test by **about 0.2 in
  pattern-level correct classification**.
- Variable-length CD-MST cut mean test length from 28 to **16–19 items** (linear attribute
  hierarchy), **20–23** (convergent), **21–24** (divergent), while still beating the fixed test.
- Good prior information about the population could **replace the routing stage** entirely.
- CD-MST performed *best* under **linear attribute hierarchies**.

**DOK 2**

This is the only source in the three documents that compares adaptive against fixed administration
inside a cognitive-diagnostic model rather than a unidimensional one, so it is the closest published
analogue to the design question. The finding that a good population prior can substitute for the
routing stage is the most actionable line in it: intake data may buy what a routing block buys, at a
fraction of the item cost. The hierarchy result also means that a gated attribute structure — one
attribute conditioning the others — is favourable rather than problematic for MST.

---

### 1.4 Paap, Born & Braeken (2019). Measurement efficiency for fixed-precision multidimensional computerized adaptive tests. *Applied Psychological Measurement* 43(1), 68–83. `[agent-read]`

<https://pmc.ncbi.nlm.nih.gov/articles/PMC6295884/>

**DOK 1**

- Multidimensional CAT was **11% shorter at r = .56 and 35% shorter at r = .80** than separate
  unidimensional CATs. The gain scales with how correlated the dimensions are.
- In the education-like scenario (dichotomous items, moderate discrimination), even well-functioning
  CATs needed **31 to 89 items across three dimensions**.
- Adaptive administration was **infeasible in the majority of cells** of the dichotomous scenario:
  the precision target was simply unreachable.

**DOK 2**

The efficiency of multidimensional adaptive testing is real but is a function of inter-dimension
correlation, which is the same quantity that destroys subscore added value — so the conditions that
make the test cheap are the conditions that make the profile redundant. The 31-to-89-item range for
three dimensions is the sobering number: extrapolating that shape to ten dimensions puts a
fixed-precision multidimensional target far outside any feasible sitting. The "infeasible in the
majority of cells" finding is the one to carry: for dichotomous items at moderate discrimination,
the honest answer is often that the precision target cannot be met at any length.

---

### 1.5 Reese, Schnipke & Luebke (1999). Incorporating Content Constraints into a Multi-Stage Adaptive Testlet Design. LSAC CT 97-02. `[agent-read]`

<https://files.eric.ed.gov/fulltext/ED467816.pdf>

**DOK 1**

- A **25-item content-balanced two-stage design beat 25- and 51-item fixed forms in the middle of
  the ability scale**, but both fixed forms were **more precise at the extremes**.
- Bias was comparable to the equally short fixed form — no bias advantage from adapting.
- The report repeats the "about one half" efficiency claim and then immediately states it is
  "rarely practical" for real programs because content balancing "compromises the efficiency."

**DOK 2**

Content balancing is not a minor operational overhead on top of adaptivity; it is the thing that
consumes most of adaptivity's advertised gain, and the authors say so in their own report. Any
diagnostic that must guarantee coverage of ten concepts is paying this tax by construction, so a
design that assumes balancing from the start does not get to claim the textbook efficiency figure
later. The extremes result is the operationally awkward part: adaptive designs are worst exactly
where the learners are most unusual.

---

### 1.6 Chang, Chiu & Tsai (2019). Nonparametric CAT for Cognitive Diagnosis in Educational Settings With Small Samples. *Applied Psychological Measurement* 43(7), 543–561. `[read]`

<https://pmc.ncbi.nlm.nih.gov/articles/PMC6739744/>

**DOK 1**

- **At 8 attributes with a 100-person calibration sample, every parametric selection rule fell below
  0.20 pattern recovery** — the paper states they "did not behave much differently from a random
  selection method." Nonparametric selection, which uses no item parameters, held at **0.63–0.67**.
- At K = 5 with 100 calibration examinees: nonparametric ≈ **0.85**, GDI below **0.78**, and
  SHE / PWKL / PWCDI "in the 0.6s or worse."
- At **30 examinees**: nonparametric still ≈ 0.85; GDI dropped to **0.45** under a uniform attribute
  distribution; the rest fell below **0.30**.
- Exposure control was also better: **χ² of 12.8 versus 196.7 (PWKL) and 230.7 (PWCDI)**.

**DOK 2**

This is the strongest argument in the corpus against item-level parametric adaptive selection on an
uncalibrated bank: at our dimensionality the sophisticated selectors degrade to random. The reading
list's own qualification matters as much as the result — their parametric methods failed because
parameters *estimated from tiny samples* are noisy, whereas expert-assigned tags correlate about
0.80 with true difficulty (entry 1.16), plausibly better than a 30-person calibration. So the
correct reading is that we are in an untested regime rather than a known-broken one, and that
non-parameter-dependent adaptivity (number-correct routing) is the safe form until calibration
exists.

---

### 1.7 Rudner & Guo (2011). Computer Adaptive Testing for Small Scale Programs and Instructional Systems. GMAC RR-11-01. `[agent-read]`

<https://www.gmac.com/~/media/Files/gmac/Research/research-report-series/rr1101_catforsmallscaleprograms>

**DOK 1**

- **Calibration sample size mattered far less than test length**: at 30 items, accuracy was **.741
  with a 100-person calibration versus .783 with 2,000**.
- **Pool size was nearly irrelevant**: **.777 (600 items), .783 (300), .783 (200)**.
- Measurement decision theory beat 3PL IRT at every length: **.709 vs .657 at 10 items; .804 vs .777
  at 30**.
- Authors caution their calibration used perfect known classifications, which "may have yielded
  artificially accurate item calibrations."

**DOK 2**

This is the encouraging counterweight to Chang, Chiu & Tsai: a 100-person calibration cost only four
points of accuracy at 30 items, and pool size bought essentially nothing. The two papers disagree
about how fatal a small calibration is, and the authors' own caveat — perfect known classifications
— is the most likely explanation for the gap, so the optimistic result is the more fragile one. The
measurement-decision-theory result is a separate and useful point: when the output is a
classification, an estimator built for classification beats an estimator built for a scale.

---

### 1.8 Sun, Liu, Xin & Song (2020). The Impact of Item Calibration Error on Variable-Length CD-CAT. *Frontiers in Psychology* 11:575141. `[agent-read]`

<https://pmc.ncbi.nlm.nih.gov/articles/PMC7738350/>

**DOK 1**

- **The failure mode is premature termination.** Calibration error inflates the posterior
  probability that an examinee belongs to a profile, so a confidence-based stopping rule fires
  early. Relative measurement precision exceeded 1.0 in *every* DINA and RRUM condition.
- Relative test efficiency — how much the test overstates its own information — reached **45.5** for
  DINA with low-quality items at error SD 0.3, and was still **8.4** with high-quality items.
- Compensatory models (CRUM) were nearly immune, never exceeding **1.10**.
- The design document draws the operational conclusion directly: **fixed-length blocks, no
  variable-length stopping on posterior confidence until the bank is calibrated**, because
  fixed-length blocks are structurally immune to this failure.

**DOK 2**

This is the single most direct constraint on stopping criteria in the corpus: a
posterior-confidence stopping rule on an uncalibrated bank does not merely lose precision, it
systematically stops too early while reporting that it has enough evidence. A test efficiency of
45.5 means the instrument believes it has roughly forty-five times the information it actually has,
which is a failure that no downstream consumer can detect. The only robust defence available before
calibration is to remove the degree of freedom entirely and fix the length.

---

### 1.9 Fink, König & Frey (2025). Accounting for item calibration error in computerized adaptive testing. *Behavior Research Methods* 57, 126. `[agent-read]`

<https://link.springer.com/content/pdf/10.3758/s13428-025-02649-8.pdf>

*This is the properly retrieved version of v1 tree entry #5, which was marked `UNVERIFIED —
publisher paywall, not retrieved`; the magnitudes attributed to it in v1 were explicitly not
verified there.*

**DOK 1**

- Ignoring calibration error biased ability estimates by **up to 40% of a standard deviation**.
- **Calibration sample size had the largest main effect on bias (η² = 0.019)**; test length was
  negligible for bias (η² < 0.001) though substantial for MSE.
- A fully Bayesian treatment cut bias by **84%** in the most extreme conditions; a corrected WLE
  alone cut it **33%**.

**DOK 2**

Treating estimated item parameters as if they were known produces overconfident ability estimates
and understated standard errors, and this paper puts a magnitude on it that is far too large to
treat as a correction term for an uncalibrated bank. The decomposition is the actionable part: bias
is driven by calibration sample size and essentially not at all by test length, so no amount of
lengthening the form repairs it — only data on items does. The Bayesian remedy recovering 84% of the
bias is the strongest argument in the corpus for carrying item-parameter uncertainty explicitly
through the estimator rather than plugging in point estimates.

---

### 1.10 Wang, Tu, Song, Zheng & Wang (2021). An Adaptive Design for Item Parameter Online Estimation and Q-Matrix Online Calibration in CD-CAT. *Frontiers in Psychology* 12:710497. `[agent-read]`

<https://pmc.ncbi.nlm.nih.gov/articles/PMC8421652/>

**DOK 1**

- Q-matrix recovery per newly seeded item, by examinees seen: **0.66 at 100, 0.80 at 200, 0.86 at
  400, 0.96 at 800, 1.00 at 1,600**.
- Adaptive examinee allocation beat random at every sample size (**0.61 / 0.73 / 0.84 / 0.91 /
  0.97**) and was more stable.
- **Slipping parameters were consistently harder to estimate than guessing parameters.**
- Assumes an existing calibrated bank into which new items are seeded — it does not solve
  cold-starting from zero.

**DOK 2**

This is the exit route from the calibration problem rather than a solution to it: it tells you how
many responses a *new* item needs before its parameters can be trusted, given that the rest of the
bank is already calibrated. The 200-response point where recovery reaches 0.80 is what the design
document adopts as the gate before an item is allowed to influence routing. The assumption of an
existing calibrated bank is the binding limitation, and it means the first cohort is genuinely cold
and must be treated as such.

---

### 1.11 Guo & Zheng (2019). Termination Rules for Variable-Length CD-CAT From the Information Theory Perspective. *Frontiers in Psychology* 10:1122. `[agent-read]`

<https://pmc.ncbi.nlm.nih.gov/articles/PMC6549543/>

**DOK 1**

- The only source found that reports length and accuracy across **4, 5, 6, 7, 8, 10 and 12
  attributes**.
- Under a 0.90 posterior-threshold rule with DINA: **4 attributes → 7.1 items** for PCCR .941;
  **6 → 12.9 items** for .935; **8 → 33.8 items** for .926. Under Fusion: **12.7, 23.1, 45.3**.
- **The Shannon-entropy rule was dramatically more efficient**: at 8 attributes it reached PCCR
  **.974 in 20.0 items**, beating the posterior rule's .926 in 33.8 items.
- Posterior-threshold rules **drift with attribute count** (**.747 → .706 → .677** across 8, 10, 12
  attributes) while entropy rules stayed stable. The reading list flags this as the paper's central
  claim and **not yet independently replicated**.

**DOK 2**

If a variable-length rule is used at all, the choice of stopping metric is worth more than a large
number of items: entropy reached higher accuracy in 20 items than the posterior rule reached in
33.8. The drift finding is the more consequential one for a ten-dimension design, because it says a
fixed posterior threshold silently means something different at ten attributes than at four — the
rule is not scale-free. Combined with Sun et al. (1.8), the position this supports is: fixed length
until calibration exists, and if variable length is ever introduced, an entropy rule rather than a
posterior threshold.

---

### 1.12 Kaplan, de la Torre & Barrada (2015). New Item Selection Methods for Cognitive Diagnosis Computerized Adaptive Testing. *Applied Psychological Measurement* 39(3), 167–188. `[agent-read]`

<https://pmc.ncbi.nlm.nih.gov/articles/PMC5978538/>

**DOK 1**

- Selection method matters only on short tests. **At 10 items: GDI .887, MPWKL .878, PWKL .752. At
  20 items: .996 / .989. At 40: all 1.000.**
- **Item quality dominated everything**: **0.98 versus 0.60 on the same 10-item test** depending on
  discrimination and variance.
- GDI is **4× faster than PWKL and 4.5× faster than MPWKL** at equivalent accuracy.

**DOK 2**

The spread between selection rules closes to nothing by twenty items, while the spread caused by
item quality on a ten-item test is thirty-eight points — so the bank is roughly two orders of
magnitude more important than the selector. This is the same conclusion the design document reached
independently from its own exact-posterior bound (entry 2.20), from a different direction. The
practical consequence is that effort spent tuning selection criteria is misallocated effort unless
the test is very short and the items are already good.

---

### 1.13 Huebner, Finkelman & Weissman (2018). Factors Affecting the Classification Accuracy and Average Length of a Variable-Length Cognitive Diagnostic Computerized Test. *JCAT* 6(1), 1–14. `[agent-read]`

<https://jcatpub.net/index.php/jcat/article/download/55/30>

**DOK 1**

- **Q-matrix density mattered far more than the selection rule.** Low → high density dropped accuracy
  from **.819 to .774** and raised length from **9.55 to 13.71 items**.
- Mutual information and MPWKL differed by **under one percentage point across all 24 conditions**.
- Even the best case misclassified roughly **one examinee in six** on at least one of six skills.

**DOK 2**

Structural properties of the item–attribute mapping outrank the adaptive machinery: making items
load on fewer attributes buys both accuracy and shorter tests, while the choice between two
respectable selection rules buys under a point. The "one in six misclassified on at least one of six
skills" figure is the honest ceiling to quote whenever a multi-dimension profile is described as
reliable — per-attribute accuracy that sounds high compounds badly across attributes. Read with
Gu & Xu (2.8) and Madison & Bradshaw (2.9), the three agree that Q-matrix design is where
classification accuracy is won or lost.

---

### 1.14 van der Linden (1998). Bayesian Item Selection Criteria for Adaptive Testing. *Psychometrika* 63(2), 201–216. `[agent-read]`

<https://files.eric.ed.gov/fulltext/ED424235.pdf>

**DOK 1**

- The direct descendant of Owen's Bayesian sequential procedure, and the closest thing in the
  literature to an expected-information-gain selection rule.
- Bayesian criteria clearly beat maximum-information at **5 items**, but by **n = 10** the author
  found "no systematic differences between the five criteria" — a crossover he calls "lower than was
  anticipated."
- He scopes his own recommendation to short tests and routing modules.
- The reading list records that this project's own measurement campaign splits his conclusion in
  two `[simulated]`: **adaptive *difficulty* selection is worth under a point** (doubling routing
  decisions from three to six moved worst-world reproducibility by 0.3 points, and the whole family
  from 2 to 20 stages at fixed length sits inside a single point of itself), while **adaptive
  *allocation* — which concepts receive the items — is worth 3.5 to 6.2 points** depending on the
  reporting axis and length.

**DOK 2**

This is the source that answers "how far should adaptivity reach," and the answer is that the
sophisticated part of item-by-item difficulty selection stops paying at about ten items. The
project's own split is the more useful form of the finding: van der Linden was measuring difficulty
choice, and his caution should not be carried over to the decision about *where the item budget is
spent across subjects*, which is a different lever and the one that carries nearly all the value.
Stated as a design rule: adapt the subject allocation aggressively, adapt the difficulty only enough
to keep items near the learner's edge, and do not pay for elaborate item-by-item difficulty
machinery.

---

### 1.15 Cheng & Morgan (2013). Classification accuracy and consistency of computerized adaptive testing. *Behavior Research Methods* 45, 132–142. `[read]`

*No URL given in the source documents.*

**DOK 1**

- Operational **12-item placement CAT, 642-item pool, five performance categories**: classification
  accuracy **.74**, consistency **.66**.
- **12 → 20 items: CA .74 → .79, CC .66 → .71. 20 → 40 items: CA .79 → .80, CC .71 → .72.** The
  diminishing-returns elbow sits at about **20 items**.
- **Collapsing five reported categories to pass/fail improves accuracy more than doubling test
  length does.**
- Raw accuracy understates the value of longer tests, because longer tests reduce *severe*
  misclassifications (off by two or more categories) even when overall accuracy barely moves.
- The design document quotes CA ≈ .80 and CC ≈ .72 at 40 items as the operational benchmark to beat.

**DOK 2**

This is the length curve that disciplines every argument about making the test longer: going from 20
to 40 items bought one point of classification accuracy. Against that, changing what you report —
five categories to two — bought more than doubling the length, which makes reporting grain the
cheapest and largest lever available and the one most vendors never pull. The severe-misclassification
caveat is the counterweight worth keeping: aggregate accuracy hides the fact that longer tests still
reduce the errors that hurt most.

---

### 1.16 Wauters, Desmet & Van den Noortgate (2011). Acquiring Item Difficulty Estimates. EDM 2011. `VERIFIED — full text read`

**DOK 1**

- **318 students** and **13 experts** (16 invited) from ten Flemish higher-education programs,
  estimating the difficulty of **25 items** on French verb conjugation, pre-calibrated by Selor via
  IRT to give a "true β" benchmark.
- Six methods compared: IRT calibration on study data, proportion correct, learner feedback
  (5-point Likert), expert rating, paired comparison (learner and expert variants), Elo.
- Pearson correlation with **true β**: proportion correct **0.90**, learner feedback **0.88**, Elo
  **0.85**, expert rating **0.80**, paired comparison–learner **0.62**, paired comparison–expert
  **0.56** (all p < 0.01).
- Correlation with IRT calibrated on this study's own data: proportion correct **1.00**, Elo
  **0.92**, learner feedback **0.88**, expert **0.80**, paired comparison–learner **0.50**,
  paired comparison–expert **0.44**.
- Inter-rater agreement (ICC[3,1]): experts **0.68** ("good"), learners **0.42–0.43** ("fair"),
  learner and expert means combined **0.88** ("excellent").
- Elo update weight set to **0.4** after preliminary tuning.
- Learner feedback beat expert rating against true β, significantly: **t(22) = 2.71, p < 0.05**.
- Authors' stated limits: only **25 items**, a single domain, items **measuring one skill only**;
  they explicitly decline to generalise to other domains or to multi-skill items.

**DOK 2**

Cheap difficulty estimates are competitive with a full IRT calibration study, which is the entire
cold-start argument: proportion correct at 0.90 and Elo at 0.85 against true β are good enough to
order items for adaptive delivery. Two cautions are load-bearing. Proportion correct's 1.00 against
study-data IRT is an artefact (total score is a sufficient statistic for the Rasch model), and both
cheap methods correlate higher with study-data IRT than with true β, which is the signature of
sample dependence — early estimates encode whoever signs up first. The surprise finding is that
learners judged difficulty *better* than experts (0.88 vs 0.80) while experts agreed with each other
more (ICC 0.68 vs 0.42), so high expert inter-rater agreement is evidence of shared bias rather than
validity, and a one-tap "how hard was that?" is the cheapest unexploited calibration signal
available.

---

### 1.17 Pelánek — Applications of the Elo Rating System in Adaptive Educational Systems. `UNVERIFIED — host returned server errors on repeated attempts`

**DOK 1**

- Claims attributed: Elo provides online, incremental difficulty and ability estimation without a
  separate calibration phase; the update weight must decay with observation count for estimates to
  stabilise; Elo estimates approximate IRT parameters closely enough for adaptive sequencing.
- **No specific figures are attributed to this source in the v1 tree.** Its uncertainty-function
  recommendations are explicitly marked unverified.
- The corroborating number comes from Wauters et al. (1.16), which *is* verified: Elo at
  **r = 0.85** against true difficulty.

**DOK 2**

The general mechanism — continuous, calibration-free difficulty estimation with a decaying update
weight — is safe to build on because Wauters independently verifies the accuracy claim. The specific
parameterisation is not, and the v1 tree is explicit that Pelánek's uncertainty-function
recommendations should not be cited. For design purposes this entry contributes a mechanism and no
numbers of its own.

---

### 1.18 Boztunç Öztürk — cited in the design specification on minimum routing-module length.

*Cited in `docs/design/diagnostic-clean-slate-proposal.md` without a provenance marker, without a
full citation, and without a URL. Treat accordingly.*

**DOK 1**

- **Routing modules should not fall below 15 items.**
- No other figure, sample size, or effect size is attributed to this source anywhere in the three
  documents.

**DOK 2**

This is the only floor on block length in the corpus, and it is what makes twenty items the smallest
defensible block rather than an arbitrary round number. Since the design's own measurement found
stage count is worth almost nothing on its own, there is nothing to trade a shorter block against,
so the floor binds without contest. It is also the weakest-provenance citation in the design
document's structural argument and should be checked before external use.

---

### 1.19 Matteucci & Veldkamp — cited in the design specification on background-variable priors.

*Cited in `docs/design/diagnostic-clean-slate-proposal.md` without a provenance marker and without a
URL.*

**DOK 1**

- A background-variable prior buys **~28% fewer items at θ = ±2, essentially nothing at θ = 0**, and
  **no benefit past about 20 items**.

**DOK 2**

The saving is concentrated exactly where a placement instrument most needs it — on learners far from
the cohort mean, who are the ones a short test routes worst. Combined with Kim & Yoo's finding that
a good population prior can replace the routing stage entirely (1.3), this makes a ninety-second
intake questionnaire a serious competitor to a twenty-item routing block. The "no benefit past about
20 items" boundary also means the prior is a device for shortening short tests, not for improving
long ones.

---

### 1.20 Internal — delivery arm: multistage versus item-level adaptive, and the attribution ladder. `[simulated]`

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part II. No external citation.*

**DOK 1**

- Multistage delivery trails item-level adaptive selection by about six points of worst-world
  reported reproducibility — **88.0% against 82.0% on `fc-10` at 140 items over 24 worlds × 250
  learners**, same learners, same seeds, same scoring; the only difference is which items are served.
- **Doubling the routing decisions from three to six is worth 0.3 points.** The entire family from 2
  stages to 20, at fixed total length, sits inside a single point of itself.
- **About 80% of the MST deficit is allocation adaptivity** — which concepts the items are spent on
  — and routing does not buy that at any stage count. The remainder is where the routing cuts sit
  relative to the engine's prior.
- Adopted design `MST_140_RECOMMENDED`: seven 20-item blocks, three difficulty modules per stage
  after the first, routing cuts at ability quantiles **[0.45, 0.75]**, contention-allocated slots in
  the six stages after the router.
- Measured on `fc-10` over the three worlds every arm fails in, at **1,500 learners per cell**
  (worst-world reported reproducibility, then true worst concept in top three):

  | Design | re-sit 1-of-2, worst | true #1 in top 3, worst |
  | --- | --- | --- |
  | 50 + 3 × 30, three routes, equal-mass cuts | 79.9% | 82.3% |
  | 7 × 20, six routes, equal-mass cuts | 80.2% | 82.3% |
  | 7 × 20 + raised cuts | 81.9% | 84.3% |
  | 7 × 20 + contention slots | 83.3% | 86.4% |
  | **7 × 20 + both (adopted)** | **84.7%** | **87.5%** |
  | item-level adaptive | 86.9% | 87.3% |

- Of the **7.0-point** gap between the superseded form and item-level adaptive, the adopted design
  recovers **4.8**. On true worst concept it measures **87.5% against 87.3%** — read as a tie.
- Two operational properties MST keeps and item-level CAT cannot offer: within-block answer revision,
  and content balance guaranteed on **every route** through the panel rather than on average.
- Contention allocation costs a real property: a contention-allocated form is a function of the
  responses, not just of which modules were taken, so a sitting cannot be rebuilt from its route
  alone; the per-concept **guarantee drops to 8 items rather than 14**.

**DOK 2**

The intuitive explanation for MST's deficit — that it makes fewer decisions — is measurably wrong,
and the attribution ladder is unambiguous: stage count is worth 0.3 points while allocation is worth
most of the six-point gap. What the extra stages are actually for is that they are the only places
the two levers that do matter can act, since a cut can only be re-aimed at a stage boundary and slots
can only be reallocated at one. The two points of simulated reproducibility that MST still concedes
buy answer review and a hard content guarantee, which the document states as a judgement rather than
a measurement.

---

### 1.21 Internal — a retraction: contention-weighted allocation is not worthless. `[simulated]`

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part II.*

**DOK 1**

- The previous draft reported that adaptive allocation bought nothing, on the strength of an oracle
  experiment in which an allocator handed the *true* leverage scores scored **68.1% against an even
  split's 68.2%**.
- Measured against an even split over 24 worlds, contention weighting is worth **3.5 points of true
  worst-concept accuracy (92.6% against 89.1%)** and **3.6 points of reported reproducibility (95.5%
  against 91.9%) on `fc-10` at 140 items**, and **5.2 and 6.2 points of true 2-of-3 on the
  15-cluster axis at 60 items**.
- The contention boundary is drawn at the **third-versus-fourth gap**, not at the reported cut
  between second and third. Aiming the selector at the reported cut measured worse on every accuracy
  figure — **worst-world true worst concept 80.0% against 87.0%** — while stopping fifteen items
  earlier.

**DOK 2**

The retracted experiment could not detect the effect it was used to rule out: an oracle already
extracts everything the responses contain, so moving items between concepts cannot change what it
concludes — information is fungible to an estimator that is already efficient. The shipped engine is
not that estimator, and at four to fourteen items per concept it makes ordering errors concentrated
exactly where the ranking is close, which is what reallocation fixes. "Adaptive allocation is
worthless" is therefore true of the bound and false of the engine, and this is the same conclusion
the MST attribution reached independently: where the items are spent matters far more than how often
the instrument is allowed to change its mind.

---

### 1.22 Internal — routing cuts sit above equal mass, deliberately. `[simulated]`

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part II.*

**DOK 1**

- Equal-mass bands under the engine's N(0,1) prior do not produce equal-sized bands against the
  realised cohort, which measures around **−0.38 with sd 0.75**, so three modules fill roughly
  **42/47/11** rather than a third each.
- Re-aiming the cuts downward onto the realised cohort **makes module occupancy far more even and
  makes accuracy worse in all 24 worlds, by up to 5 pooled points**. Pushing the cuts the other way
  makes occupancy more lopsided and accuracy better.
- Mechanism: the bank's DOK ladder sits above this cohort, so a learner routed upward is served items
  above their ability and the block buys less than an easier one would.
- Adopted cuts: **[0.45, 0.75]**.

**DOK 2**

This is the clearest example in the corpus of an appealing psychometric tidiness objective actively
damaging the instrument: even module occupancy is a property of the design, not an objective of it.
The mechanism is specific to a bank whose difficulty ladder sits above the population it serves, so
the finding does not transfer to a calibrated bank matched to its cohort. It is worth stating
pre-emptively because "your modules are unbalanced, re-aim the cuts" is the first thing a competent
reviewer proposes.

---

### 1.23 Internal — length: 140 rather than 200 items, decided on operational grounds. `[simulated]` / `[measured]`

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Parts I and II.*

**DOK 1**

- Across the assumption grid, **200 items buys between 0.01 and 0.09 additional correctly-prioritised
  concepts out of three**, which is inside sampling noise at 250 learners a cell.
- The extra 60 items cost the learner **1.6 hours**.
- Bank depth breaks the tie: at 200 items **a single sitting has been observed to draw 36 of FC10's
  40 items** `[simulated]`; FC10 holds **40 items** against a **181-item even share** `[measured]`.
- The sweep covered **60, 90, 140 and 200 items** on both candidate axes.
- 140 items is **14 items per concept** across ten concepts and nothing else; the previous draft's
  derivation from the operation axis at 20 items per operation is **retracted**, because the
  operation axis is not measured.
- Lower bounds held alongside: Cheng & Morgan's elbow for a *single* decision at **20 items**;
  Kruyen's floor for individual-level decisions at **40 items**; Guo & Zheng's **20.0 items** for 8
  attributes under a Shannon-entropy rule.

**DOK 2**

The honest summary is that 140 and 200 are equivalent on measurement and the tie is broken on
operational grounds, which is a much weaker claim than "140 is the right length" and the document
says so. Two operational facts do the breaking: an hour and a half of a constrained learner's runway,
and the thinnest concept's pool running close to empty in a single sitting, which also destroys
exposure control across a cohort. The retraction matters for anyone re-deriving the budget — the
per-concept arithmetic is the only surviving justification.

---

### 1.24 Internal — the runway model: a step function with a hard knee, not a smooth trade. `[simulated]`

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part II.*

**DOK 1**

- The curriculum holds about **114 hours** of first-pass lesson content over ten concepts, so a
  concept costs about **11.4 hours**. The diagnostic charges its own duration at **95 seconds per
  item** — **3.7 hours at 140 items, 5.3 at 200**.
- Coverage is `floor((runway − test hours) / 11.4)`, so value is a **step function**.
- **At and above roughly 120 hours of available time, every length ties at precisely zero net gain**
  — the learner reaches every concept regardless of order. `diagnostic-value.test.ts` asserts this as
  an equality: a perfectly ordered queue and a reversed one produce identical hits at 120, 200 and
  300 hours.
- **Just below the knee every design is net negative.** At **115 hours** a learner with no test
  covers all ten concepts; a learner who sits any length of test covers nine.
- Below the knee, longer is better almost everywhere, bounded by periodic dead zones at coverage
  boundaries: **at 25 hours, a 60-item form leaves time for two concepts and a 200-item form leaves
  time for one, so the shorter form is worth about 75% more**. These zones recur every 11.4 hours and
  are narrow.
- Coverage after paying for a 140-item form: **40h → 3/10; 90h → 7/10; 120h → 10/10; 300h → 10/10**.
- The previous draft's summary — "short test when time is tight, long when plentiful" — **has the
  shape backwards at both ends and is retracted**.
- Two caveats push the same way: the model counts first-pass lessons only (adding recall, practice
  and CARS raises the knee), and it scores the *whole* reported ordering rather than the two named
  priorities.

**DOK 2**

This reframes test length from a measurement question into a time-budget question, and the answer is
discontinuous: above the knee the instrument's value is exactly zero because reordering a queue the
learner will finish anyway saves no time. The practically important region is just below the knee,
where sitting any diagnostic costs a whole concept of reach and returns only an ordering of the
remainder — a straightforwardly negative trade and the clearest argument for gating administration
on intake. It also inverts the intuitive rule: the constrained learner wants the *short* form, not
the thorough one.

---

### 1.25 Still-paywalled pointers, listed in the reading list as worth buying if they become load-bearing.

*Listed in `docs/research/diagnostic-reading-list.md` under "What we still could not find." None was
retrieved; none carries a provenance marker of its own.*

**DOK 1**

- **Segall (1996)** on multidimensional adaptive testing — named as the source of the "**one-third
  fewer items**" figure for correlated dimensions.
- **Hsu & Wang (2015)** on variable-length higher-order DINA CAT — no figures attributed.
- **Cheng (2009)**, the paper that introduced **PWKL** — no figures attributed.
- **Patton, Cheng, Yuan & Diao (2013)** on capitalization on calibration error causing premature
  termination — described as the closest published work to the failure mode in Sun et al. (1.8);
  no figures attributed.
- Also unresolved: **no published direct comparison of adaptive versus fixed administration for
  10–20 dimension profile scoring on an uncalibrated bank** was found across three separate sweeps.

**DOK 2**

These four are the known holes in the test-logic evidence base, and the last of them — the absence of
any published study matching our actual configuration — is why the simulation harness had to be built
in the first place. Patton et al. is the highest-value retrieval, because it would independently
corroborate or contradict the premature-termination finding on which the fixed-length decision rests.
Segall matters only if multidimensional adaptive testing is ever revived, since the one-third figure
is currently cited second-hand.

---

# 2. What a diagnostic can actually deliver

A rough "what to work on first" signal, versus a full ordering of topics, versus high-confidence
per-topic strength estimates — plus measurement precision, subscore validity, and how many items a
reportable estimate needs.

---

### 2.1 Maas, Brinkhuis, Kester & Wijngaards-de Meij (2022). Diagnostic Classification Models for Actionable Feedback in Education: Effects of Sample Size and Assessment Length. *Frontiers in Education* 7:802828. `[read]`

<https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2022.802828/full>

**DOK 1**

- Minimum test length to reach **0.90 marginal (per-attribute) classification accuracy**, from
  Table 4: **15 items for 3 attributes, 20 for 4, 25 for 5, 30 for 6** — a clean **5 items per
  attribute**. **Ten items never reached 0.90 at any attribute count.**
- Where 0.90 was achievable, required calibration samples were only **100–300 respondents**. Test
  length mattered far more than sample size.
- Model fit statistics **failed to flag** the degraded conditions: **RMSEA2 stayed below cutoff when
  A = 5 and I ≤ 20, and when A = 6 and I ≤ 25**.
- Boundary conditions: correctly specified Q-matrix; high item quality (unidimensional main effects
  sampled from **U(2.20, 2.90)**); every attribute measured in isolation at least once; items load on
  **at most two attributes**. This is a favourable case.
- Naive extrapolation gives **50 items for 10 dimensions**; a multi-loading, uncalibrated bank should
  expect worse.

**DOK 2**

This is the cheapest of the three item-budget answers and the one that licenses a short diagnostic:
a binary "you're weak enough here to start here" call needs about five items per attribute, not
twenty. The fit-statistic failure is the finding with the longest reach — RMSEA2 stayed clean in
exactly the too-many-attributes-for-the-item-count conditions we are at risk of, so model fit cannot
be used as a warning system that the taxonomy is too fine. The boundary conditions are all favourable
relative to a real bank, so five items per attribute should be read as a floor obtained under
generous assumptions rather than a target.

---

### 2.2 Emons, Sijtsma & Meijer (2007). On the consistency of individual classification using short scales. *Psychological Methods* 12(1), 105–120. `[agent-read]`

<https://research.tilburguniversity.edu/en/publications/on-the-consistency-of-individual-classification-using-short-scale>

**DOK 1**

- With **6 items at the cut score and high discrimination**, only **66%** of the above-cut group is
  classified correctly in at least 90% of hypothetical repeat administrations — falling to **33%**
  when the cut sits at the **5th percentile**.
- Consistency reaches **.82 at 20 items and .87 at 40** at a median cut with good items.
- **Lengths of 8, 10 and 12 items did not improve appreciably over 6.**
- Authors assume items are optimally located at the cut score, which is a best case, and recommend
  short tests be combined with other information rather than used alone.

**DOK 2**

This is the middle rung of the item-budget ladder and it answers a different question from Maas: not
"is the call right" but "would the call replicate," which is what a learner implicitly assumes when
shown a profile. The flat region between 6 and 12 items is the operationally important part — adding
half a dozen items to a short scale buys essentially nothing, so the choice is between very short and
genuinely long. The authors' own recommendation to combine short tests with other information is the
same conclusion the placement literature reaches from administrative data.

---

### 2.3 Kruyen (2012) — cited in the reading list and design specification on the floor for individual-level decisions.

*Cited in the reading list's items-per-dimension table alongside Emons under `[agent-read]`, and in
the design specification. No standalone citation, no URL, and no other figure appears in the three
source documents.*

**DOK 1**

- **Floor for individual-level decisions: 40 items.**
- Grouped with Emons 2007 in the reading list's "consistency" row at **20–40 items per dimension**.
- No sample size, effect size, or confidence interval is attributed to this source anywhere in the
  three documents.

**DOK 2**

This is the most demanding of the item-budget floors and the one a per-dimension score would have to
clear, which at ten dimensions implies 400 items — decisively outside any feasible sitting. Its
practical function in the argument is as a bound that rules out per-dimension reporting rather than
as a target to build toward. Its provenance in these documents is thin: it appears only as a number
in a table, so it should be checked before external use.

---

### 2.4 Sinharay (2010). When Can Subscores Be Expected to Have Added Value? ETS RR-10-16. `[agent-read]`

<https://files.eric.ed.gov/fulltext/ED523969.pdf>

**DOK 1**

- Across **25 operational tests, 16 had no subscore with added value**; the **9 that did averaged at
  least 24 items per subscore**.
- Subscores need **at least 20 items and disattenuated intercorrelations below 0.85**. **Ten-item
  subscores had no added value even at r = 0.70.**
- **Augmented** subscores — borrowing strength from the total — had added value far more often,
  **including at 10 items when r ≤ 0.85**.

**DOK 2**

This is the expensive rung of the item-budget ladder: claiming a subscore tells the learner something
the total does not requires about twenty items *and* genuine distinctness, and two-thirds of real
operational tests fail the test outright. The augmentation result is what makes a ten-dimension
report affordable at all, since it halves the item requirement in exchange for borrowing strength
across dimensions. It is also the direct empirical warrant for hierarchical pooling, and the reason
the dimension count is not simply items ÷ 20.

---

### 2.5 Sinharay & Haberman — Reporting Subscores: A Survey. ETS RM-08-18. `VERIFIED — full text read (earlier in this project)`

**DOK 1**

- The central criterion is whether a subscore has **added value** over the total score: does it
  predict the true subscore better than the total score does?
- The operational test is a comparison of **proportional reduction in mean squared error** for the
  observed subscore versus the total score, and versus an augmented subscore.
- Across the ETS operational programs surveyed, the **great majority of subscores had no added
  value** over the total score. *(No count is given for this survey in the source document; the 25
  tests / 16 failures figure belongs to Sinharay 2010, entry 2.4.)*
- Two properties drive added value: the subscore must be **reliable enough** and **distinct enough**
  (disattenuated correlation with the rest of the test far enough below 1.0).
- Item count is **necessary but not sufficient** — a subscore built on many items can still fail if
  it is too highly correlated with the rest of the test.
- **Augmentation can improve MSE while making the reported subscores *more* alike**, so the reported
  profile becomes less diagnostic even as it becomes more accurate.
- Coarsening the reporting grain — fewer, broader subscores — raises reliability and is frequently
  the recommended fix.

**DOK 2**

Reliability alone does not license reporting a dimension: a perfectly reliable subscore correlating
0.98 with the total is a relabelled total score. The augmentation failure mode is the precise risk
carried by hierarchical pooling — buying precision by shrinking toward the learner's overall level is
exactly the operation that flattens the profile the report is trying to convey, which is why the
`MIN_POOLING_SPREAD` floor is treated as load-bearing rather than a tuning knob. The rule this yields
is that measuring grain and reporting grain are separate decisions: measure at whatever grain the
model supports, report at the coarsest grain that still changes what the learner does next.

---

### 2.6 Wang, Song, Wang, Gao & Xiong (2020). A Note on the Relationship of the Shannon Entropy Procedure and the Jensen–Shannon Divergence in CD-CAT. *SAGE Open* 10(1). `[agent-read]`

<https://journals.sagepub.com/doi/10.1177/2158244019899046>

**DOK 1**

- Proves **JSD = H(posterior) − SHE**, so the two criteria select identical items.
- At **5 items**: attribute-level accuracy **.838–.897** versus pattern-level **.530**. At **10
  items**: **.913–.953** versus **.747**.
- Doubling the test bought **22 points of pattern accuracy but only about 6 of attribute accuracy**.

**DOK 2**

This is the cleanest available statement of the difference between the two things a diagnostic could
claim: per-dimension reads are forgiving and full-pattern claims are brutal, and the gap is roughly
thirty points at five items. It is also why a rank ordering across dimensions is closer to a pattern
claim than to a set of independent reads — ordering requires every adjacent comparison to be right.
The design document uses these numbers as the numeric reason a per-KC mastery map and a full ranking
are forbidden outputs while per-concept bands are permitted.

---

### 2.7 Xi, Tu & Cai (2022). Dual-Objective Item Selection Methods in CAT Using Higher-Order Cognitive Diagnostic Models. *Applied Psychological Measurement* 46(5), 422–438. `[agent-read]`

<https://pmc.ncbi.nlm.nih.gov/articles/PMC9265487/>

**DOK 1**

- Exploiting a higher-order latent trait raised **pattern classification from .876 to .918 at 6
  attributes on a 12-item test**.
- **The advantage grows with dimensionality** (**4.2 points at K = 6, 6.3 at K = 8**) **and collapses
  with length** (**.990 → .993 at 4K items**).
- This project's own campaign narrows the claim `[simulated]`: **pooling does not improve *ordering*
  at all** — uniform shrinkage toward a common mean is a monotone transformation, so rank order is
  left exactly unchanged, and simulation reproduced identical ranking metrics with and without it.
- The remaining advantage is **contingent on uneven allocation**: against an unpooled estimator, the
  pooled one leads **69.9% to 67.7%** under the contention-weighted selector and **trails it 63.4% to
  67.5%** under an even split, while the unpooled estimator barely moves between the two.

**DOK 2**

Pooling pays exactly where a short multi-dimension diagnostic operates — many dimensions, few items —
and its gain evaporates as the test lengthens, which is the opposite shape from most psychometric
improvements. The internal narrowing is the important qualification: the measured gain is in
*classification*, and the report is a set of named priorities drawn off a *ranking*, which pooling
provably cannot change. So pooling improves the estimates and the bands, does not improve the named
priorities, and is a consequence of allocating unevenly rather than an independent argument for
balanced stages.

---

### 2.8 Gu & Xu — Sufficient and Necessary Condition for Identifiability of the DINA Model. `VERIFIED — full text read`

<https://par.nsf.gov/servlets/purl/10057909>

**DOK 1**

- A **Q-matrix** maps `J` items to `K` binary latent attributes; a full assignment of the `K`
  attributes for one learner is an **attribute profile**.
- A Q-matrix is **complete** if different attribute profiles produce different response
  distributions; under DINA this means every attribute has an item requiring that attribute *and only*
  that attribute — equivalently, Q contains a `K × K` identity matrix up to row permutation.
- **Condition 1** (Xu & Zhang 2016, necessary): Q is complete, so `Q = [I_K ; Q*]`; and each of the
  `K` attributes is required by **at least 3 items**.
- **Condition 2** (this paper): any two different columns of the submatrix `Q*` are distinct.
- **Theorem 1:** Conditions 1 and 2 together are **sufficient and necessary** for identifiability of
  all DINA parameters (slipping `s`, guessing `g`, population proportions `p`), and also guarantee
  **consistent estimation**.
- The result transfers directly to DINO, and DINA is a submodel of most richer CDMs, so the
  conditions act as a floor for those too.
- Applied to this bank `[measured]`: all **2,108** questions carry exactly one `kc_id`, so
  completeness is automatic; **400 of 422 KCs** carry three or more questions, so both conditions
  hold for those 400.
- At the delivered length of **140 items**, a sitting touches at most **140 of 422 KCs — just under a
  third** — with no borrowing of evidence across attributes from within an item.

**DOK 2**

Identifiability is a property of test design rather than of sample size: no amount of data rescues a
Q-matrix that violates these conditions, because the parameters are not merely imprecise but
unrecoverable in principle. Because the condition depends only on the Q-matrix it is checkable before
a single item is written, which makes it a design gate rather than a post-hoc diagnostic. The
important caution is that meeting it says the model is *estimable*, not that the estimate is precise
enough to act on — and single-KC loading, which grants identifiability for free, simultaneously caps
information at one attribute per item, so profile coverage is linear in item count and no feasible
length closes the gap.

---

### 2.9 Madison & Bradshaw — The Effects of Q-Matrix Design on Classification Accuracy in the LCDM. `UNVERIFIED — PMC blocked by CAPTCHA, not retrieved`

**DOK 1**

- Attributed findings: classification accuracy **degrades sharply with Q-matrix misspecification**,
  and items **loading on fewer attributes classify more accurately** than items loading on many.
- **No magnitudes, sample sizes, or effect sizes are attributed to this source in the v1 tree**; it
  states the direction is supported and the magnitudes unverified.
- The v1 tree names this as one of the two most worth retrieving properly.

**DOK 2**

The direction is corroborated by two verified sources — Gu & Xu on identifiability and Huebner et al.
on Q-matrix density outranking selection rules — so the design can rely on the direction without the
numbers. It matters here because it bears directly on whether a fine-grained KC model can deliver
per-topic strength estimates at all: if accuracy collapses under misspecification, an expert-authored
Q-matrix is a risk concentrated at the point where nothing downstream can detect it. Worth retrieving
before any fine-grained reporting is attempted.

---

### 2.10 Gervet, Koedinger, Schneider & Mitchell (2020). When is Deep Learning the Best Approach to Knowledge Tracing? *JEDM*. `VERIFIED — full text read`

<https://jedm.educationaldatamining.org/index.php/JEDM/article/download/451/123>

**DOK 1**

- Empirical comparison across **nine real-world datasets**. Logistic regression with the right
  features (**Best-LR**) leads on **4 of 9**; **DKT** leads on the remaining **5**; Markov-process
  methods (BKT and variants) **lag behind both**.
- Logistic regression wins on datasets of moderate size or with very many interactions per student;
  DKT wins on large datasets or where precise temporal information matters most.
- The original DKT paper reported a **25% AUC gain** over BKT; subsequent work showed this was
  substantially inflated, partly by duplicate rows and a weak BKT baseline.
- **Best-LR** = DAS3H without time-window features, plus total count features, plus IRT
  student-ability and question-difficulty parameters.
- The **time-window features** (windows of 1/24, 1, 7, 30, ∞ days) add **no** predictive power to
  logistic regression, though a non-linear model can exploit them.
- **On most datasets the expert-designed domain model adds little predictive power.**
- BKT+ requires MCMC, takes **days** to train on large datasets versus minutes for logistic
  regression, and still does not lead.
- Calibration analysis shows predictions exhibit **systematic biases outside the interval containing
  most of the data**.

**DOK 2**

At early, sparse data scale the logistic-regression family is the right default and is orders of
magnitude cheaper to fit and easier to inspect than the alternatives. The uncomfortable finding is
that an expert-designed domain model adds little predictive power, which means a 422-KC taxonomy must
justify itself as a content-organisation and sequencing device rather than a predictive one — those
are different jobs. The calibration point is the one that bears on what a diagnostic can deliver: a
model that ranks learners well but is systematically overconfident at the extremes produces bad
placements precisely for the learners furthest from average, and AUC will not reveal it.

---

### 2.11 Scott-Clayton & Rodriguez — Improving the Targeting of Treatment: Evidence from College Remediation. NBER w18457. `VERIFIED — full text read`

**DOK 1**

- Administrative data for tens of thousands of students across two community college systems — one
  large urban system with **six campuses** (LUCCS), one statewide system of **50+ colleges** (SWCCS).
- Remedial coursework costs roughly **$7 billion annually** in the US.
- **Severe error rate (SER)** = severe under-placement (predicted to earn a B or better in the
  college-level course but placed into remediation) plus severe over-placement (placed into the
  college-level course but predicted to fail).
- Roughly **one in four math test-takers and one in three English test-takers** are severely
  mis-assigned under current test-based placement.
- **Severe under-placements are far more common than severe over-placements.**
- Using high school transcript information significantly reduces assignment errors while holding the
  remediation rate fixed; accounting for high school performance would let institutions remediate
  substantially fewer students without lowering success rates.
- Choice of screening device has significant effects on the **racial and gender composition** of both
  remedial and college-level courses.

**DOK 2**

The methodological move is the transferable one: reject a single "accuracy rate" in favour of an
explicit loss function that counts only the errors nobody disputes are costly. The asymmetry is the
actionable finding — under-placement is both more frequent and more costly, so a diagnostic tuned to
avoid embarrassing over-placement will systematically over-remediate. A single short test is a weak
screening device when richer history is available, which argues for the diagnostic making only a
coarse decision and letting accumulated in-product evidence do the fine placement; and screening
choice has demographic consequences even when nothing in the instrument was designed to produce them,
so any placement rule needs a subgroup check rather than an aggregate accuracy number.

---

### 2.12 CAPR / MDRC — College Course Placement Based on Multiple Measures: A Synthesis of Two Experiments. `VERIFIED — full text read`

<https://files.eric.ed.gov/fulltext/ED664878.pdf>

**DOK 1**

- Synthesis of two randomised experiments (SUNY and Great Lakes) comparing **test-only** placement
  against **multiple-measures assessment (MMA)**, which adds high school GPA.
- For **81% of the math sample and 68% of the English sample the two systems agreed** on placement.
- The analysis sample is therefore restricted to the **"bump-up" zone**: low test scores, relatively
  high GPA.
- Bump-up impacts (combined): **+8 percentage points** likelihood of passing a college-level course
  in the tested subject; **+2.0 credits** earned on average.
- Credential-or-transfer: **+1.5pp** combined (not statistically significant); **+2.4pp** in the
  English sample after nine semesters; no significant effect in math.
- After nine semesters: **+7pp** college-level English completion, **+8pp** math. After three
  semesters: **+16pp** English, **+11pp** math.
- The **"bump-down" zone** showed **negative** outcomes; it occurred only in the SUNY study, the later
  Great Lakes design **prohibited** it, and CAPR no longer treats it as policy-relevant.
- Faculty set MMA thresholds high enough to avoid dramatically increasing college-level placement.

**DOK 2**

For most learners the placement algorithm does not matter — 81% and 68% agreement bounds the entire
argument about diagnostic sophistication to a minority in the disagreement zone, which should
discipline how much is invested in squeezing accuracy out of the instrument. The benefit is
asymmetric and one-directional: placing borderline learners higher helps and placing them lower hurts
badly enough that the research programme stopped permitting it, so the rule is "when uncertain, place
up." Short-run effects exceeding long-run ones (+16/+11 at three semesters against +7/+8 at nine) also
argues that placement is an input to momentum rather than a decisive intervention — and the instrument
that helped was accumulated performance history, not a better test.

---

### 2.13 Scott-Clayton (2012). Do High-Stakes Placement Exams Predict College Success? CCRC WP-41. `[agent-read]`

<https://files.eric.ed.gov/fulltext/ED529866.pdf>

**DOK 1**

- Adding placement-test scores to a model already containing high school GPA raised explained variance
  by **~6 points in math and under 2 in English**.
- **High school background alone beat the test alone in both subjects.**

**DOK 2**

This is the cleanest available statement of how little a short test adds once you have history, and
in an MCAT prep product the in-product evidence eventually becomes that history. The design's
ninety-second intake — coursework, self-reported grades, prior scores — is the analogue of the GPA
term, and this result says it is the highest-yield measurement per unit of learner effort in the
system. The corollary is uncomfortable but clarifying: the diagnostic's job is to be useful in week
one, before the history exists, not to compete with it thereafter.

---

### 2.14 Mattern & Packman — cited in the design specification on real placement accuracy.

*Cited in `docs/design/diagnostic-clean-slate-proposal.md`, Part VI, without a provenance marker and
without a URL.*

**DOK 1**

- Real placement instruments **correctly place 58–84% of students**.
- No sample size, setting, or interval is attributed to this source in the source documents.

**DOK 2**

This is the external benchmark against which any internal accuracy figure should be read, and it is
sobering: operational placement instruments in the field are correct between roughly three-fifths and
five-sixths of the time. Quoted next to Cheng & Morgan's CA ≈ .80 / CC ≈ .72 for a 40-item adaptive
placement test, it sets a realistic bar rather than an aspirational one. Its provenance in these
documents is a single sentence, so the range should be checked before external use.

---

### 2.15 AERA / APA / NCME — Standards for Educational and Psychological Testing. `UNVERIFIED — only open-access front matter available, full standards not retrieved`

**DOK 1**

- Obligations relied on: validity evidence must be gathered for each intended **use**, not for the
  test in the abstract; reliability evidence must be reported **at the grain at which scores are
  reported and acted on**; classification consistency must be reported where scores drive placement
  decisions.
- **No chapter or standard numbers are given**, and the v1 tree states these should be checked against
  the published volume before being cited externally.

**DOK 2**

The structural obligation that bears hardest on a diagnostic is the second: reliability must be
reported at the grain at which scores are acted on, which forbids justifying a ten-dimension display
with a whole-test reliability figure. The first obligation — validity per intended use — is the formal
version of the argument that a score-prediction instrument is not a placement instrument. Because the
volume was not retrieved, these should be treated as accurate characterisations of the Standards'
structure rather than as citable text.

---

### 2.16 Testlet / local item dependence — Wainer & Kiely; Yen's Q3; Bradlow, Wainer & Wang. `[unverified — well-established in the psychometric literature but not retrieved in this project's sweep]`

*Cited in `docs/design/diagnostic-clean-slate-proposal.md`, Part IV, Claim 2.*

**DOK 1**

- Items on the same passage share variance from passage comprehension, topic familiarity, and reading
  speed, so they are not independent observations.
- Consequence: **effective test length is materially shorter than nominal test length**, and
  reliability estimated under a local-independence assumption is **overstated**. A 230-item
  passage-based test carries meaningfully fewer than 230 independent observations.
- Context figures from the design document: the real exam is roughly **three-quarters passage-based**
  with **4–7 items on a shared passage of several hundred words**; a full-length is **230 items**,
  **6h15m** of testing, roughly **7.5 hours** with breaks; 230 items across 10 foundational concepts
  is **23 per concept**.
- **No effect sizes or Q3 magnitudes are attributed to these sources in the design document.**

**DOK 2**

This is the structural reason a long passage-based test cannot deliver a fine-grained profile no
matter how many items it contains: the items are correlated by design, so the nominal count overstates
the evidence. The second half of the claim has no workaround at all — when the unit of assembly is a
passage that generates six items, the passage decides what those items are about, so per-concept item
guarantees and within-concept difficulty balance are unavailable. Item-level assembly is a structural
advantage of the format rather than of any vendor, since every item is independently placeable into a
concept × difficulty cell.

---

### 2.17 Falmagne / Matayoshi et al. — A practical perspective on knowledge space theory: ALEKS and its data. `UNVERIFIED — ScienceDirect paywall, not retrieved`

**DOK 1**

- Claims attributed: ALEKS knowledge-space operation, item counts per assessment, use of
  learning-space structure to infer mastery of items never administered.
- **The v1 tree states explicitly: "Do not cite specifics until read."** The ALEKS-specific numbers
  are not verified and none is reproduced here.
- The structural idea — that a prerequisite/knowledge-space graph lets you infer mastery of items you
  never administered — is described as well attested elsewhere and safe.

**DOK 2**

The mechanism is the interesting part for a diagnostic: a sufficiently dense prerequisite graph lets a
short test cover more of the domain than it administers, which is the only route to per-topic
coverage that does not scale linearly with items. This project cannot use it — the prerequisite graph
is measured at 634 edges of which only 176 are prerequisites, with 76 of 114 lessons having no
incoming prerequisite (entry 2.25) — so the idea is noted and unavailable. No numbers from this source
may be quoted.

---

### 2.18 Internal — a ranked profile is not achievable at any feasible length. `[simulated]`

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part II. Figures from the earlier
standalone model, retained because the campaign did not disturb them.*

**DOK 1**

- Two independent sittings, 10 concepts, learners with correlated abilities:

  | | 14 items/concept | 20 | 30 | 80 |
  | --- | --- | --- | --- | --- |
  | Identical full 10-way ranking | **0%** | 0% | 0% | 0% |
  | Identical 3-tier grouping | 2.0% | 3.4% | 5.6% | 16.3% |
  | Identical weakest-3 set | 13.2% | 18.0% | 24.4% | 41.6% |
  | Spearman between sittings | 0.59 | 0.66 | 0.73 | 0.86 |

- An **800-item test still cannot reproduce its own tier grouping more than a sixth of the time**.
- The production harness reaches the same place independently: at **140 items on `fc-10` the two
  sittings name the identical top three about a third of the time, and the rate tops out near 52%
  even at 480 items**.

**DOK 2**

Ordering ten dimensions requires every adjacent pair to be correct, and adjacent concepts are usually
close enough in truth that those comparisons are near coin flips — so the failure is structural rather
than a tuning or algorithm problem. The 80-items-per-concept column is the decisive one: an 800-item
instrument does no better in kind, which means no feasible length fixes it. This is the single finding
that converts "what should the report say" from a product-copy question into a measurement fact.

---

### 2.19 Internal — the report names two priorities, not three. `[simulated]`

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part II.*

**DOK 1**

- Scored on the criterion the report is actually made on — does at least one named priority recur when
  the same learner sits the instrument again — a **top-three report measured 76.4% in the worst world
  against a top-two report's 89.6% at 200 items on `fc-10`**.
- At the delivered **140 items**, the top-two figure is **94.6% pooled and 88.0% in the worst world**,
  adaptive arm, **24 worlds × 250 learners**.
- The third concept is not badly measured: it gets a full production block, **14 items**. The third
  slot fails because **roughly two thirds of the disagreements at that boundary are between concepts
  whose true weakness differs by under 0.10 on a 0–1 scale**.
- A concept demoted by the reported count is deliberately kept *out* of the `stillConfirming` list and
  is carried instead by the seeded mastery prior, which reads all ten concepts.
- `REPORTED_PRIORITY_COUNT` lives in the policy layer, and the early stop, the plan-confidence
  separation term and the `stillConfirming` rule all read it.

**DOK 2**

Narrowing the report from three priorities to two costs one line of code and moved worst-world
reproducibility from below the bar to 88.0%, which is the reporting-grain lever from Cheng & Morgan
reproduced on our own instrument. The reason it works is not that the third read is poor but that the
third boundary separates genuine near-ties, so two sittings that disagree there are not disagreeing
about the learner. The read is unchanged — all ten concepts still get a gap and a confidence — so what
narrowed is the claim, not the measurement.

---

### 2.20 Internal — the exact-posterior oracle, and the bound on inference. `[simulated]`

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part II.*

**DOK 1**

- The bound re-reads the engine's own responses — same items, same answers, both sittings — and forms
  the exact posterior over each concept's ability on a grid, knowing every item's **true difficulty
  and discrimination**, the **exact leverage weights**, and the **exact two-level population** the
  learner was drawn from including the deficit mixture. It suffers the learner's response noise and
  none of the engine's calibration error.
- In the worst assumption world, the oracle's re-sit agreement on a top-three set tops out in the
  mid-to-high seventies: **75.4% at 140 items and 80.2% at 200** in a **60-learner replication** of
  the campaign's worst world, against the campaign's own reported figure of **75.8%**.
- **The shipped engine measures 99–102% of it.**
- Consequence recorded in the v1 tree: the bound is an **upper bound rather than a baseline**, which
  is a stronger guard than Gervet's "benchmark against a strong simple model" instruction asks for.
- The old **0.80** exact-top-three-set bar was therefore above the ceiling and was **removed rather
  than lowered**.

**DOK 2**

This is the finding that determines how the remaining effort is spent: there is no accuracy left to
recover by better inference at this item budget, and a better estimator, prior or selection rule is
worth at most a point or two combined. It also shows why the old bar had to go — leaving in place a
threshold no instrument could reach would have made a working system look broken. The levers that
remain are the item bank, the reporting grain, and the correction loop downstream, in that order.

---

### 2.21 Internal — what the reproducibility figure does not mean. `[simulated]`

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part II.*

**DOK 1**

- **The measured re-sit is not a real re-sit.** The two sittings share about **70% of their items on
  the adaptive arm and about 82% on the multistage form a learner is actually served**, measured over
  **24 worlds at 50 learners a cell**, against roughly **76.6%** reported by the campaign at full
  depth.
- **Much of the agreement is not about the learner.** Pooled across the grid, **42.9% cross-learner
  agreement against 27.8% on ground truth**; an independent 24-world replication at 50 learners a cell
  reproduced the ground-truth floor at **26.8%** and put the reported figure at **33.2% (adaptive)**
  and **37.6% (MST)**. The stable quantity is the **excess over truth, about 10 points**.
- That excess is concentrated in the two heaviest concepts: at full leverage strength **FC5 takes 52%
  of reported slots against 40% in truth, and FC1 43% against 34%**.
- **FC10 is under-reported at every weighting strength — roughly 5% of reported slots against about
  12% in truth** — and this is *not* caused by the weighting (FC10 sits at the flat 0.20 floor); it is
  the 40-item bank hole.
- **Ordering is the least reproducible part**, and every headline figure is a set-membership criterion
  rather than an ordering one.

**DOK 2**

A re-sit that reuses four items in five measures response noise on a nearly identical form rather than
parallel-form reproducibility, so the published figure is optimistic by an unknown amount and a
genuine study needs disjoint forms. The cross-learner excess is the more subtle warning: some of the
apparent stability is the instrument saying similar things to different people, which is the price of
a learner-independent leverage term. And the product leans hardest on the part that reproduces worst —
the order within the named set — so the set is what the design is entitled to claim and the order is a
best guess presented as a starting sequence.

---

### 2.22 Internal — positional accuracy. `[simulated]`

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part II.*

**DOK 1**

- From the production harness, `fc-10` at 140 items, **24 worlds × 250 learners**: the true worst
  concept is inside the internal top three for **91.5% of learners pooled and 86.8% in the worst
  world** on the adaptive arm, and **87.5% worst-world on the served MST form**. The concept the
  learner is weakest in ignoring leverage entirely is in the top three for **78.0%**.
- From the earlier standalone model, **not re-measured in the campaign**: the true worst concept is
  ranked first about **52%** of the time, and the three truly weakest concepts have a combined
  position sum of **8.2 with a median of 8**, where **6 is perfect and 16.5 is random** — recovering
  **79%** of the distance from random to perfect. A median of 8 means a typical learner's three real
  weak areas land at roughly positions **1, 2 and 5**.
- Pre-registered bars in force: `top1InTop3` **0.85**, `twoOfThree` **0.75**, `confidentCorrect`
  **0.84**, `testRetestReportedAt140` **0.86** (item-level adaptive, telemetry only),
  `testRetestReportedMstAt140` **0.82** (the form a learner is served; raised from 0.78).

**DOK 2**

The instrument is good at putting the true worst concept somewhere near the top and much weaker at
putting it first, which is exactly the distinction between a "what to work on first" signal and an
ordering. The document is explicit that the intuitive figures — 52% first, median position sum 8 —
have the weakest provenance in the whole analysis and are retained only because the harness
corroborates the direction. The product consequence is that the two named priorities must not be
presented as equally weighted: the first one is the reliable one.

---

### 2.23 Internal — `certainty` was redefined, because the old measure said nothing. `[simulated]`

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part II and Layer 3.*

**DOK 1**

- The old measure, derived from posterior decisiveness, **reported exactly 1.000 for 76% of
  production-shape reads in simulation and 68% of 190 reads measured off live sessions**.
- The new measure is **the share of the prior's variance in the concept's gap that the responses
  removed**, squared because it is a ratio of variances. Over **3,200 simulated reads** at production
  shape it runs **0.45 to 0.99 with a median of 0.80 and no mass at either endpoint**.
- Reading a single concept in isolation at the production block length of 14 items, the value runs
  **0.991 at 0 correct, 0.794 at 7 correct, bottoms out at 0.755 around 9 correct, and climbs back to
  0.983 at 14 correct** — a U-shape.
- Downstream, mastery seeds built from these reads span roughly **0.10 to 0.32** against a flat default
  of **0.20**, inside an asymmetric **floor of 0.05 and cap of 0.40**.
- Selection, stopping and ranking read `gap` and decisiveness and **never read `certainty`**, and a
  test pins that the reported ordering is exactly the leverage ordering.

**DOK 2**

A confidence channel that saturates at 1.000 for three-quarters of reads is carrying a claim it cannot
support, and both of its consumers — the uncertainty range shown to the learner and the mastery-seed
step size — were unable to distinguish a well-estimated concept from a borderline one. The
redefinition answers "how far could this magnitude still move," which is what those consumers actually
need, at the cost of a counter-intuitive U-shape: it is high both when evidence is plentiful and when
the concept sits far from the weakness threshold. The trap to flag for any future consumer is that it
must not be read as "how much did we learn about this concept," because it is lowest exactly for the
borderline concepts a reader most wants it to speak about.

---

### 2.24 Internal — the leverage weighting, and the trade it makes. `[simulated]`

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part II.*

**DOK 1**

- Priorities rank on **`gap × (1 + unlockWeight)`**, at full strength. Measured on `fc-10` at 140
  items over **24 worlds × 250 learners**, pooled then worst world:

  | strength | cross-learner agreement | re-sit 1-of-2 | true #1 in top 3 | weakest #1 in top 3 |
  | --- | --- | --- | --- | --- |
  | **1.00** | 56.0% (truth 45.6) | 94.6% / 88.0% | 91.5% / 86.8% | 78.0% |
  | 0.50 | 52.0% (truth 42.6) | 93.1% / 86.4% | 90.1% / 85.2% | 79.6% |
  | 0.25 | 44.9% (truth 41.3) | 88.4% / 80.0% | 87.5% / 79.2% | 81.3% |
  | 0.00 | 39.8% (truth 38.2) | 81.5% / 66.0% | 82.2% / 68.0% | 82.2% |

- Removing the weighting removes **10 points of genericity** and costs **22 points of worst-world
  reproducibility** to buy **4 points** of skill at naming whichever concept the learner is weakest in
  outright.
- On this axis the weights run **0.20 to 0.44** `[measured]`, so the multiplier spans **1.20 to 1.44**
  and can only reorder concepts whose gaps differ by under 20% — and **six of the ten are tied at
  0.20**, so it cannot reorder those at all. On the 15 clusters the same weights run **0.15 to 1.00**,
  where the same code would reorder concepts differing by up to **74%**.

**DOK 2**

The weighting buys reproducibility precisely *because* it is learner-independent: a constant breaks a
near-tie the same way on both sittings, where a measured gap does not. That is partly cheating and the
document says so, which is why the genericity cost is reported alongside — 10 points of agreement
between different learners' plans above what ground truth itself shows. The trade is only tolerable
because this axis's weights are nearly flat; on an axis with a wider spread the same code would
override measured weakness far more aggressively, which is why the strength is a named constant rather
than an inlined 1.

---

### 2.25 Internal — the bank audit: what the materials can actually support. `[measured]`

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part I, from
`content/question-bank/.local/db-pull/questions.json` (2,108 items, status `production_candidate`) and
`curriculum/v3/v3-lesson-authoring-manifest.json`.*

**DOK 1**

- **2,108 items, 2,108 single-KC assignments, 422 distinct KCs, zero items with no KC.** Median **5**
  questions per KC; **22 KCs have fewer than 3**.
- Skill and cognitive complexity are almost perfectly confounded: **SIRS1 n = 379, 100% DOK1**;
  **SIRS2 n = 1,248, 1% / 95% / 4%**; **SIRS3 n = 235, 4% / 8% / 88%**; **SIRS4 n = 86, 9% / 57% /
  34%**.
- **114 lessons**, median **18** questions each, each in exactly one cluster, carrying **2–5** KCs;
  KC → lesson → cluster is perfectly nested with zero violations.
- Counted the way production counts (first-listed FC only), **1,811 questions over the ten concepts —
  187 fewer** than the previous draft's double-counted figure. FC1 280, FC2 111, FC3 203, FC4 414,
  FC5 279, FC6 120, FC7 155, FC8 103, FC9 106, **FC10 40**; **16 lessons with no FC hold 297
  questions** and are unreachable by this instrument. **89 lessons carry exactly one FC, 8 carry two,
  1 carries three.**
- FC10's **40 items** are **2.2% of the addressable bank** for a concept carrying roughly a tenth of
  the reporting axis; a 140-item sitting sees at most **24** of them.
- **99 of 114 lessons contain three or more distinct skills; only 6 are skill-pure.**
- Crossed content × operation: **12 clusters × 4 skills = 48 cells, of which 3 are empty and 11 more
  are under ten items**. EVIDENCE has **86 items** total. Splitting SIRS2 turns this into **84 cells**.
- Prerequisite graph: **634 edges**, of which only **176 are prerequisites (143 hard, 33 helpful)**;
  `INTEGRATES` **336**. At lesson grain, **37 hard and 19 helpful edges over 114 lessons**, with
  **76 of 114 lessons having no incoming prerequisite at all**.
- **No passage sets:** 2,108 questions, 2,108 distinct family IDs, zero multi-question families,
  median passage length **158 characters**.
- **CARS: 160 items for a section worth 25% of the exam.**
- The diagnostic supplies **14 items per concept**; a single lesson supplies about **18 questions**,
  all landing in one concept, so **one lesson out-measures the diagnostic for that concept**, and 140
  items is about **eight lessons** of volume — mid-week-one for a 15h/week learner.

**DOK 2**

Single-KC loading is the bank's best property and its sharpest limitation at once: it grants
identifiability for free and caps information at one attribute per item. The skill/DOK confound is the
most serious labelling defect, because "weak at SIRS3" and "weak at DOK3 items" are currently the same
statement and no amount of modelling can separate them. FC10's forty items are the concrete reason the
form cannot be lengthened, and the absence of passage sets is the hard constraint on any full-length
ambition — which is also why the instrument's items are independently placeable in a way a
passage-assembled test's are not.

---

### 2.26 Internal — the output contract: what the diagnostic is and is not allowed to emit.

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Layer 3. Derived policy; the supporting
figures carry their own markers.*

**DOK 1**

- **Emits:** two named priorities in order with the first presented as more reliable; ten content bands
  (FC1–FC10) shown as ranges with visible uncertainty, never point scores; a curriculum entry point and
  an initial queue ordering over all ten concepts; an explicit **unsettled list** (missed the cut *and*
  unresolved *and* close enough that more evidence could promote them — all three conditions
  load-bearing); capped, asymmetric mastery priors for every lesson under every sampled concept; and a
  **word-level confidence label, never a number**.
- **Does not emit:** a ranked profile, per-concept scores, a numeric confidence, an overall altitude
  estimate, or any operation read.
- **Must not emit:** a per-KC mastery map across 422 components; point scores on any dimension; a rank
  ordering between dimensions whose posteriors overlap; any claim of completeness.
- **Hard product constraint:** if a dimension does not have **~20 items** behind it, no number is
  displayed for it.
- No altitude estimate is emitted because there is no calibrated scale for one to live on, and the
  classic adaptive-efficiency results that make a unidimensional altitude estimate cheap were obtained
  on strictly unidimensional tests (Martin, McBride & Weiss, entry 1.1).

**DOK 2**

This is where the measurement findings become a shipped contract: the ~20-item display rule is
Sinharay's added-value threshold turned into a UI constraint, and the ban on rank ordering is Wang,
Song et al.'s attribute-versus-pattern gap turned into the same. The subtle part is that narrowing the
*report* from three priorities to two did not narrow the *read* — every concept still gets a gap and a
confidence, and the demoted concepts reach the learner through seeded priors rather than through the
report. Choosing not to display dimension scores is what buys the shorter test, so it is a design
decision rather than a workaround.

---

### 2.27 Internal — a placement decision does not need to be right; it needs to be correctable.

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Layer 4 and Part IV Claim 8. Mechanisms are
registry/code facts; the accompanying rates carry their own markers.*

**DOK 1**

- **The diagnostic has no authority over mastery state.** `MASTERY_CONFIG`'s lowest rung,
  `independent`, requires **two distinct question families** answered independently; `retained` adds
  transfer evidence spanning two change dimensions, a delayed attempt at least **48 hours** later, and
  mixed practice; `strong` adds integrated-passage, timed and protected evidence. **A diagnostic
  response satisfies no recipe**, so no diagnostic result can mark anything as known — it can only
  change queue position.
- Five active correction mechanisms: fail-closed acceleration (registry `R14-ACC-01`,
  `currently_authorized_bypass: false`, `fail_closed: true`); week-one probing of unsettled reads;
  FSRS seeding as prior rather than verdict, overridden by the first self-rating; planner re-sorting on
  prerequisite repair and freshness; **evidence expiry at 45 days general, 21 for demanding kinds**.
- Test-out gates handle lesson-level skip decisions with **3–5 targeted items** at the moment the
  decision arises.

**DOK 2**

The containment argument is the strongest structural claim in the design: because the diagnostic is
forbidden from awarding mastery, the worst a false-strong read can do is push a topic later, where it
must still be taught and still earn its evidence. This generalises beyond this architecture — attach a
correction loop and you can afford a shorter, cheaper diagnostic; omit one and you need the diagnostic
to be right the first time, which no test length delivers. It also resolves the coarse-measurement /
fine-skipping tension cleanly: measure and report at coarse grain, decide skips at fine grain with
fresh local evidence.

---

### 2.28 Internal — what the correction loop does not fix: non-coverage. `[simulated]`

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Layer 4, from the standalone coverage
model.*

**DOK 1**

| Concepts the learner covers | True worst never seen | Of their true worst 3, never seen |
| --- | --- | --- |
| 3 / 10 (≈40h runway) | **10.4%** | 0.77 |
| 5 / 10 (≈60h) | 2.4% | 0.26 |
| 7 / 10 (≈90h) | 0.5% | 0.08 |
| 10 / 10 (≈120h+) | 0.0% | 0.00 |

- For anyone covering **seven or more** concepts the residual is **half a percent**.
- Week-one probing of unsettled concepts is **the only mechanism that deliberately samples outside the
  selected set**, and therefore the only thing that reduces this figure.

**DOK 2**

The residual error that matters is not misranking but non-coverage: a misranked concept is corrected
the moment the learner reaches it, while a concept never reached is never corrected. The distribution
is the double bind — the learner for whom the diagnostic matters most is the one with the least time
for its errors to be corrected — so the system is not fully self-repairing exactly where repair
matters. 10.4% is the number to quote whenever someone argues that the correction loop makes
diagnostic quality unimportant.

---

### 2.29 Internal — BKT mastery seeding: measured value. `[simulated]`

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Layer 4.*

**DOK 1**

- Original model:

  | Prior | decision accuracy | false-mastery | items to decision |
  | --- | --- | --- | --- |
  | Flat 0.20 | 97.0% | 2.0% | 4.03 |
  | Diagnostic-informed | 96.6% | 3.1% | 3.60 |
  | **Oracle — true knowledge** | 96.6% | 3.0% | **3.49** |

- A prior with perfect knowledge saved only **0.53 items per KC** and the diagnostic captured **0.43**
  of that (~80% of the ceiling); across 422 KCs, ~**180 items** saved against a diagnostic costing 140.
- **Re-measured on the served form, both saving figures are gone.** Re-run on `MST_140_RECOMMENDED`
  over **250 learners / 24,500 lesson seeds**, the seed moves items-to-decision for **7 of 24,500
  lesson-learner pairs (0.029%)**, every one by exactly one item and every one **slower**. False
  mastery is **3.1% either way**. Current saving: **0.000 items**.
- Mechanism: a correct answer is worth **ln((1 − slip) / guess) ≈ 1.37 nats**; three of them reach
  0.95 from any prior at or above **0.124**; seeded priors span **0.100 to 0.307** (median 0.187) — a
  band **1.00 items of evidence wide**, with only **0.3%** of it below that boundary.
- **The oracle row is worse than reported**: inside the shipped floor of 0.05 and cap of 0.40 it comes
  out **0.07 items behind** the flat default, because two all-correct answers need a prior of
  **0.454**; only removing the cap reaches **+0.95 items**.
- The read itself is not at fault: it orders truly-mastered lessons above unmastered ones at **AUC
  0.76** on the two-state learner and **0.92** on the graded one.
- The one place the seed changes an outcome: lowering the mastery threshold to **0.86** (the first
  value below the wide dead band around 0.95, since `P(L)` arrives in jumps of **0.57 / 0.86 / 0.97**)
  saves **0.58 items on a flat prior for 2.7 points of false mastery**, while doing it *with* the seed
  saves **0.32 items for 0.9 points** — **1.7× more items per point of false mastery**.

**DOK 2**

Seeding a mastery tracker from a diagnostic read is intuitively the strongest downstream use and
measures at essentially zero, because with a threshold rule and informative per-item evidence the prior
washes out after two or three observations. The seed carries real signal — AUC 0.76 to 0.92 — that the
mechanism is not permitted to spend, so the constraint is the mastery threshold and the cap rather than
the read. The surviving rule is unchanged and better supported: seed asymmetrically and weakly, and do
not justify the diagnostic with it, because the diagnostic's real contribution is upstream of the
tracker entirely.

---

### 2.30 Internal — full-length practice exams as placement instruments: Claims 1, 5 and 9.

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part IV. Argument rather than measurement;
the supporting figures are in entries 2.16, 2.4 and 1.15.*

**DOK 1**

- **Claim 1:** a full-length is a **prediction** instrument being used as a **placement** instrument.
  It is designed and equated to produce one precise number on a known scale; the day-one question is
  "what should I do on Monday," which a scaled score does not answer. **No figures attached.**
- **Claim 5:** a full-length administered before instruction is contaminated by three sources of
  variance unrelated to content knowledge — unfamiliarity with the item format, absence of pacing
  strategy, unpracticed endurance across a **7.5-hour** sitting — all of which shrink substantially by
  **week six**. The same form administered later is a better measurement of the same construct.
  Fatigue is signal for score prediction and noise for diagnosis.
- **Claim 9:** item-level assembly produces a prescription ("your FC3 read is the weakest of the ten
  and here are the eleven lessons beneath it, in order"); four section scores produce a label. The
  stronger crossed content × operation version of this claim **is retracted**, because four of the
  seven operations do not exist as labels.
- Honest concessions: a full-length wins on **score prediction** (a number on the AAMC scale, which
  this design cannot credibly produce without concordance data), **face validity**, **endurance and
  pacing**, and **blueprint coverage by construction** — all checkpoint functions, better served at
  week 4 or 6 than day 1.

**DOK 2**

The industry's error is not using full-lengths but using its best *checkpoint* instrument as its
*placement* instrument, at the point in the timeline where it measures worst. The day-one contamination
argument is the one with no counter: format unfamiliarity, missing pacing and untrained endurance are
all real variance that has nothing to do with what the learner should study on Monday. These claims
carry no numbers of their own and rest on the measured entries elsewhere in this category, which is how
they should be presented.

---

# 3. Effect on the learner

Dropout, test anxiety, discouragement, and how a diagnostic's design changes user outlook rather than
system knowledge.

---

### 3.1 Yang, Luo, Vadillo, Shanks et al. — Do Practice Tests Reduce or Provoke Test Anxiety? A Meta-Analytic Review. `VERIFIED — full text read`

<https://discovery.ucl.ac.uk/id/eprint/10177686/1/Shanks_Frequent%20Tests%20&%20TA-R2.pdf>

**DOK 1**

- Random-effects meta-analysis of **25 effects from 24 studies, 3,374 participants**.
- Overall effect of practice tests on test anxiety: **Hedges' g = −0.52, 95% CI [−0.69, −0.36],
  p < .001; median g = −0.53**. A medium *reduction* in anxiety.
- Bayesian evidence: **BF₁₀ > 25,000**. Minimal evidence of publication bias.
- **22 of 25 effects (88%)** found practice tests reduced test anxiety; 12% found the reverse.
  **χ²(1) = 25.92, p < .001**.
- Setting matters: classroom studies **g = −0.55, 95% CI [−0.72, −0.38], p < .001**; laboratory
  studies **g = −0.31, 95% CI [−0.78, 0.15], p = .18** — inconclusive.
- **Easy practice tests reduce anxiety more effectively than difficult ones** (meta-regression of
  effect size on practice-test performance as a difficulty proxy).
- Excluding the one study that measured anxiety *during* the practice test leaves the result
  essentially unchanged (**g = −0.54**).
- Related benchmark cited: Yang et al. (2021), **222 classroom studies and 48,000+ students**, found
  class quizzes raise attainment at **g = 0.50**.
- Authors' caveat: quizzes may still be **more stressful than other learning activities** in the
  moment, even while reducing anxiety overall.

**DOK 2**

The common product intuition — that putting a test in front of a new learner will scare them off — is
not supported; practice testing reliably reduces test anxiety at a medium effect size with strong
evidence and little publication bias. The difficulty moderator is the tempting misreading and should be
resisted: it does not survive contact with the desirable-difficulties literature (3.2), so it is a
reason to monitor abandonment rather than a constraint on item difficulty. The classroom/lab split is
the real caution — the effect is established where testing is routine and embedded, and a first-session
diagnostic is closer to the lab condition, so the reassurance holds best if assessment is predictable
and recurring.

---

### 3.2 Bjork & Bjork — Desirable Difficulties. `UNVERIFIED — recalled from prior knowledge, not fetched. Numbers below are deliberately qualitative; verify before citing externally.`

*Key works named: Schmidt & Bjork (1992, Psychological Science); Bjork & Bjork (1992, "new theory of
disuse"); Bjork & Bjork (2011, "Making things hard on yourself, but in a good way"); Bjork, Dunlosky &
Kornell (2013, Annual Review of Psychology).*

**DOK 1**

- **Desirable difficulty**: a manipulation of practice conditions that slows acquisition and feels
  harder, yet improves long-term retention and transfer. Established examples: spacing over massing,
  interleaving over blocking, retrieval practice over restudy, generation over presentation, varied
  over constant conditions, reduced/delayed feedback.
- **New theory of disuse** distinguishes **retrieval strength** from **storage strength**; the two are
  dissociable, and gains in storage strength are *greater* when successful retrieval occurs at *lower*
  retrieval strength.
- Schmidt & Bjork (1992) showed across motor and verbal paradigms that conditions producing the fastest
  acquisition frequently produce the **worst** long-term retention and transfer.
- Learners' **judgements of learning** are systematically miscalibrated; perceived fluency is misread
  as learning, producing "illusions of competence."
- **Boundary condition:** difficulties are desirable only if the learner can successfully respond to
  them; beyond that point they become *undesirable*, related to the expertise-reversal effect.
- **No effect sizes, sample sizes, or intervals are given** — the v1 tree states the numbers are
  deliberately qualitative and must be verified before external citation.
- Design consequence recorded alongside: maximum information for four-option items sits near **68%
  correct**, and the learner is told up front that **missing about a third is expected and
  informative**.

**DOK 2**

This dissolves the apparent conflict with the anxiety meta-analysis: desirable difficulties concern the
*learning* phase and adaptive item selection concerns the *measurement* phase, and both favour
hard-but-tractable material, so they point the same way. The retrieval-strength/storage-strength
distinction gives the precise reason a comfortable diagnostic is harmful rather than merely
suboptimal — feeling confident indicates high retrieval strength, which is exactly the condition under
which a retrieval attempt teaches least. Miscalibrated judgements of learning are a second-order
argument for a hard diagnostic: a test that leaves the learner feeling capable reinforces the illusion
the product exists to break. The boundary condition is the one real constraint, so the target is the
edge of ability rather than the far side of it, and anxiety is demoted from a design constraint to a
monitored metric.

---

### 3.3 Dai, Vanacore, Baker & Slater — Understanding MOOC Stopout Patterns. L@S '25. `VERIFIED — full text read`

<https://learninganalytics.upenn.edu/ryanbaker/L_S_25_Dai.pdf>

**DOK 1**

- Analytic dataset: **90 Coursera courses** (Penn, Sept 2015 – Feb 2025) with **5,370,635 enrollments**
  and **469 graded assessments**; mean **6.26** assessments per course, range **3–26**.
- **Stopout** = the assessment after which a learner submits no further graded assessment; final
  assessments excluded by construction.
- Average stopout at the **first** graded assessment: **18.71%**. Average across all others: **7.27%**.
- Stopout decays exponentially: **−0.12 per additional assessment (SE = 0.009, p < 2 × 10⁻¹⁶)**,
  conditional **R² = 0.49**. The first assessment does not fit that curve: model deviance **349.14**
  including it versus **228.76** excluding it.
- Predictors of first-assessment stopout (standardised coefficients): number of questions on
  assessment 1 **+0.073, p < 0.0001**; percent fill-in-numeric **+0.037, p = 0.002**; percent
  reflection questions **−0.025, p = 0.024**; expected time commitment on assessment 1 **−0.0495,
  p = 0.060**; expected time commitment on assessment 2 **+0.078, p = 0.002**; course-level number of
  assessments **+0.062, p = 0.011**; course-level number of practice assignments **−0.056, p = 0.019**.
- Variance explained: course-level features alone **R² = 0.117**; assessment-level alone **R² = 0.450**;
  combined **R² = 0.494**.
- Question type mix: multiple choice **72.9%**, checkbox **14.0%**, numeric **6.2%**, reflective
  **2.5%**.
- Authors' limits: correlational, no control for course topic, single LMS, graded quizzes/tests only.

**DOK 2**

The first assessment is governed by a different mechanism than later ones — it is not the top of a
smooth decay curve — which is what justifies treating "the first thing you ask a learner to do" as its
own design problem. Item count and expected time point in *opposite* directions on that first
assessment: more questions raises stopout while longer expected time lowers it, so the naive "make it as
short as possible" rule is wrong and the better rule is "make it feel purposeful and do not make the
item count the salient number." Expected time flips sign by assessment 2, suggesting goodwill is
front-loaded. The transfer caution is severe and the reading list demotes this source for it: a free,
no-commitment MOOC population bundles "never intended to finish" with "found the assessment aversive,"
so the levels do not carry across to a paying user with a fixed exam date — only the relative ordering
of design features does.

---

### 3.4 Baldiga — Gender Differences in Willingness to Guess. `VERIFIED — full text read`

<https://economics.osu.edu/sites/economics.osu.edu/files/Gender%20Differences%20in%20Willingness%20to%20Guess.pdf>

**DOK 1**

- Experiment using practice questions from SAT II subject tests, varying the penalty for a wrong answer
  and whether the task is framed as an evaluative "SAT."
- **With no penalty for a wrong answer, all test-takers answered every question.** The gap does not
  exist in this condition.
- With a small penalty, women answered significantly fewer questions than men: **p = 0.008 (unframed),
  p = 0.033 (SAT-framed)**.
- SAT framing caused **both** men and women to skip fewer questions, but the gender gap persisted.
- Among the lower-performing half in the SAT-framed penalty condition (**12 or fewer correct under
  forced response**), men skipped **1.08** questions on average versus women **3.09** (**p < 0.01**).
- Conditional on self-reported confidence, women skipped more than men at essentially every confidence
  level **above 30%**.
- Knowledge differences did not explain the gap; measured risk preferences explained some but not all;
  **no differences in confidence were found**. Because they skip more, women receive significantly
  lower scores than their knowledge warrants.

**DOK 2**

The gap is created by the scoring rule, not by the learners — remove the penalty and it vanishes
entirely, which makes differential non-response a design artefact under our control. Skipping is
therefore not a clean signal of "doesn't know": two learners with identical knowledge and identical
self-reported confidence make different skip decisions, so any model treating omission as evidence about
ability absorbs a personality and framing effect into an ability estimate. The direct consequence for an
"I don't know" button is that it is safe only if it is genuinely costless *and perceived as costless*;
otherwise the differential returns correlated with gender, making it a fairness problem as well as a
measurement one. Making the stakes salient reduced skipping overall but did not close the gap, so the
safest treatment is to log the response as a separate observation useful for routing and metacognition
rather than folding it into the ability posterior.

---

### 3.5 Kluger & DeNisi — The Effects of Feedback Interventions on Performance (1996). `UNVERIFIED — APA paywall, not retrieved`

**DOK 1**

- Headline result attributed: feedback interventions raise performance on average, but **a substantial
  minority of effects are negative**, with feedback directed at the *self* rather than the *task* being
  the main culprit.
- **The precise effect size and the share of negative effects are from secondary sources and are not
  reproduced in the v1 tree**; no number is available to quote.
- The design implication relied on does not depend on the exact numbers: diagnostic feedback should
  describe the work and the next action, never rank the person.

**DOK 2**

This is the mechanism by which a diagnostic can make a learner worse rather than merely uninformed:
person-directed feedback shifts attention from the task to the self and a non-trivial share of
interventions backfire. For a day-one instrument that necessarily tells someone what they are bad at,
this is the governing constraint on presentation — describe the work and the next action, never the
person. The direction is one of the most widely replicated findings in the literature and is safe as a
principle; the numbers are not available here and must not be invented.

---

### 3.6 Gollwitzer & Sheeran — Implementation Intentions and Goal Achievement. `UNVERIFIED — repository requires login, not retrieved`

**DOK 1**

- Meta-analytic finding attributed: if-then implementation intentions ("when situation X arises, I will
  do Y") produce a **medium-to-large effect** on goal attainment over goal intentions alone.
- **The specific pooled effect size and study count are not verified from the original** and are not
  reproduced in the v1 tree.

**DOK 2**

This bears on the diagnostic's output format rather than its measurement: the post-diagnostic artefact
should be a concrete when/where plan rather than a topic list, because a list of weaknesses is a goal
intention and a scheduled action is an implementation intention. It is the mechanism that converts a
measurement into behaviour change, which is the only channel through which a diagnostic affects
outcomes at all. The design implication stands on the general result; no number from this source may be
quoted.

---

### 3.7 van der Bles et al. — Communicating Uncertainty About Facts, Numbers and Science. `UNVERIFIED — PNAS fetch timed out repeatedly`

**DOK 1**

- Finding attributed: **numerically-expressed uncertainty (a range) reduces trust only slightly, while
  verbally-expressed uncertainty ("experts disagree") reduces it more**.
- **Specific effect sizes are not verified** and none appears in the v1 tree.

**DOK 2**

This is the evidence behind showing per-concept reads as bounded ranges rather than hedging language,
which matters because a diagnostic that must communicate genuine uncertainty has to do so without
destroying the learner's confidence in the plan. It sits in tension with the design's decision to emit a
**word-level confidence label and never a number** (entry 2.26) — a tension worth noting, since the
document's own reason is that the underlying `certainty` channel does not support a numeric claim. The
direction is consistent with the broader literature; the magnitudes are unverified.

---

### 3.8 Wise — Rapid-Guessing Behavior: Its Identification, Interpretation, and Implications. `UNVERIFIED — EMIP paywall, not retrieved`

**DOK 1**

- Technique described: set a **per-item response-time threshold** below which a response is classified
  as rapid guessing and filtered from scoring.
- Findings attributed: rapid guessing is **concentrated in low-stakes settings** and **inflates apparent
  ability variance** when unfiltered.
- **Threshold-setting methods and reported prevalence figures are unverified**; no number appears in the
  v1 tree.
- The v1 tree notes timing has been deliberately deferred from the model, so this source is currently
  informational rather than actionable.

**DOK 2**

Disengagement during a low-stakes diagnostic is a learner-state problem that presents as a measurement
problem: unmotivated responding does not merely add noise, it inflates the apparent spread of ability.
A day-one diagnostic before any commitment has been made is exactly the low-stakes setting where this
concentrates, which links it to the same framing question as dropout — a learner who does not believe
the test matters will not answer as though it does. It is currently unactionable here because response
timing is not in the model, and no threshold or prevalence figure is available to quote.

---

### 3.9 Internal — staged delivery decouples time-to-value from item budget. `[design argument]`

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Part IV Claim 6 and Layer 1.*

**DOK 1**

- An MST diagnostic is assembled from discrete modules, so a learner completes one **20-item block in
  about half an hour**, receives a starting point, and begins studying the same day. The remaining six
  blocks interleave with early lessons.
- The comparison against a full-length is **25 minutes to first actionable output versus 7.5 hours** —
  not 3.5 hours versus 7.5 hours of total seat time.
- A full-length cannot be split without destroying what it is for, since its validity as a score
  predictor depends on one sitting under exam conditions including the fatigue.
- **This does not produce a parallel-form retest**, and the previous draft's claim that it does was
  wrong: successive blocks are drawn from the same pools and the two simulated sittings share roughly
  **82%** of their items `[simulated]`.

**DOK 2**

This is the clearest lever the design has on the dropout problem and it costs nothing in measurement:
the items are the same items and the budget is the same budget, only the delivery schedule changes.
Read against Dai et al., it also targets the right variable — the salient number a learner faces at the
first assessment becomes twenty items rather than 140. For any product with a funnel this is an
activation argument before it is a measurement argument.

---

### 3.10 Internal — framing and difficulty policy: keep the items hard, fix the framing.

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Layer 1, and the v1 tree's closing note on
entry 21.*

**DOK 1**

- Policy: **items should be hard, and the framing should say so.** Maximum information for four-option
  items sits near **68% correct**; the learner is told up front that **missing about a third is expected
  and informative**.
- Lowering difficulty to manage anxiety trades away **both measurement precision and learning value**.
- **A genuinely costless "not sure" option**: make it free, say it is free, and treat the response as a
  separate observation useful for routing and metacognition rather than folding it into the ability
  estimate (per Baldiga, 3.4).
- Post-item feedback stays **task-focused rather than person-focused** (per Kluger & DeNisi, 3.5).
- **Test anxiety is demoted from a design constraint to a monitored metric.**

**DOK 2**

This is where the three learner-facing literatures resolve into a single policy: the anxiety
meta-analysis removes the case for softening the test, desirable difficulties explains why softening it
would also damage learning, and the feedback literature says the risk is in how the result is described
rather than in how hard the items are. The one lever left is framing, which is free, and it works by
changing what the learner expects rather than what the instrument measures. The costless "not sure"
option is the same principle applied to the scoring rule: remove the perceived penalty and the
differential behaviour it creates disappears.

---

### 3.11 Internal — the correction loop's value scales with engagement, and short-runway learners get least of it. `[simulated]`

*Source: `docs/design/diagnostic-clean-slate-proposal.md`, Layer 4, "What the loop does not fix."*

**DOK 1**

- **Ordering errors are cheap at four months and expensive at four weeks.** The loop needs time to run,
  so short-runway learners get less correction and the diagnostic carries more weight for exactly the
  population it has least time to serve.
- **A learner who churns in week one received the diagnostic and nothing else** — none of the five
  correction mechanisms ever ran for them.
- Related figure from entry 2.28: for a learner covering **3 of 10** concepts, the true worst concept is
  **never encountered 10.4%** of the time.
- Runway context from entry 1.24: **just below the ~120-hour knee, sitting any length of diagnostic
  costs the learner a whole concept of coverage** (at 115 hours, ten concepts becomes nine).

**DOK 2**

This is the argument for the diagnostic being genuinely good rather than merely correctable, and it is
an argument about the learner's trajectory rather than about the measurement. The containment story —
diagnostic errors only change queue position, never coverage — is strong enough to invite the conclusion
that diagnostic quality does not matter much, and it fails for the churned learner and the
time-constrained one, who are the two populations where a first-session instrument has the most
influence. It also connects the dropout literature to the design: whether the loop ever runs is a
retention question, so retention is upstream of measurement quality rather than orthogonal to it.

---

# Unsorted

Sources that appear in the three documents but do not fit test logic, deliverable output, or learner
effect.

---

### U.1 The Effects of ALEKS on Mathematics Learning: A Meta-Analysis. `UNVERIFIED — not retrieved`

**DOK 1**

- Attributed finding: ALEKS performs **comparably to traditional instruction** rather than dramatically
  better — adaptive sequencing at scale produces modest rather than transformative effects.
- **Effect sizes and study counts are unverified** and none appears in the v1 tree.

**DOK 2**

This is about the efficacy of adaptive *instruction* rather than the design of an adaptive *test*, so it
does not bear on any of the three questions this tree is organised around. It is worth keeping as a
prior on expected magnitudes: adaptive systems at scale have generally produced modest effects, which
should temper claims made about any single component of one. It is filed unsorted rather than under test
logic because the intervention it evaluates is sequencing, not measurement.

---

### U.2 NAD decision on Blueprint MCAT score-improvement claims. `UNVERIFIED — summary page only`

**DOK 1**

- Score-improvement advertising claims in the MCAT prep market have been challenged before the
  **National Advertising Division**, and **self-selected user-reported gains do not survive scrutiny as
  substantiation**.
- **No figures, dates, or holdings are reproduced in the v1 tree**, which states the specific holding
  should be read before any score-gain claim is made.

**DOK 2**

The relevant point is regulatory rather than psychometric: it constrains marketing copy, not product
design. It is worth carrying alongside the design document's own instruction that no simulated figure
may be quoted to a learner or presented externally as a performance claim — the two constraints point
the same way from different directions. Filed unsorted because it says nothing about how a diagnostic
should be built.

---

## Sources deliberately not given their own entries

- The v1 tree's **coverage summary** and **"Corrections to the earlier synthesis"** sections are
  bookkeeping about the entries above rather than sources; their corrections are folded into the
  relevant entries (Wauters' 25 items and 13 experts, Dai's 90 courses / 5.37M enrollments, the
  Shanks/Yang difficulty moderator, and CAPR's 81%/68% agreement rate).
- The reading list's **"Retained from v1"** and **"Demoted to context"** sections are routing
  instructions rather than sources; each named paper appears above under its own entry.
- The design document's **Part V (Next steps)** and **Part VI (How we would know it works)** are plans
  rather than evidence, except where they state a measured bar or benchmark, which is captured in
  entries 2.14 and 2.22.
