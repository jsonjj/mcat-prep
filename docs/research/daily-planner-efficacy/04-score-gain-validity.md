# Score-gain validity: what part of a gain is real?

Evidence review for the adaptive daily study planner, written for a psychometrically
sophisticated reader. The question underneath both product claims — Claim A, "faster," that
learners reach a given score in fewer study hours; and Claim B, "higher ceiling," that learners
reach scores they otherwise would not have reached — is a measurement question: **when a
test-prep product claims a score gain, what fraction is change in the construct, what fraction is
test-taking skill, and what fraction is noise?**

Evidence tiers used inline: **A** = strong direct evidence or field consensus; **B** =
reasonable with stated limits; **C** = weak, indirect, or single-source. My own arithmetic is
marked *[own calculation]*. Every AAMC value below comes from an AAMC document; where I could
not find an official value I say so rather than estimating, and any figure I derive is labelled
with its assumptions.

**Reading disclosure.** I read the following as extracted full text: Briggs (2001) in full;
Becker (1990) in the sections synthesising Messick & Jungeblut; Hao et al. (2025) including the
moderator tables; the AAMC *Using MCAT Data in Medical Student Selection* guides for 2019, 2022
and 2023 (narrative sections in full — the box-and-whisker figures are images and I did not read
values off them); AAMC *Summary of MCAT Total and Section Scores* mean/SD lines and sample
percentile rows; Jacobson & Truax (1991) in the reliable-change section; the Hausknecht et al.
(2007) author preprint abstract and overall-practice-effects results; and the WWC/ESSA
tier-alignment materials. I read **abstract only** for Messick & Jungeblut (1981), Powers & Rock
(1999), DerSimonian & Laird (1983), Montgomery & Lilly (2012), Jones (1986a), Zhao et al.
(2010), Lievens et al. (2005), and Lievens et al. (2007). I read **neither abstract nor text**
for Kulik et al. (1984), Griffin et al. (2013) and Domingue & Briggs (2009) — these appear only
as reported inside Hao et al. (2025) and are marked **[C]** accordingly. Per-source detail is in
`## Sources`.

Companion documents: `03-market-and-dose-response.md` (dose-response parameterisation and
competitor claims) and `01-planner-design-audit.md`. This review contradicts one number in `03`;
see DOK 2 #9.

---

## Recommendation

**Claim A survives measurement scrutiny in a restricted form. Claim B does not survive at all,
and the team should abandon it.**

### The four numbers everything else hangs on

| Statistic | Total score | Section score | Source |
|---|---|---|---|
| Scale | 472–528 (midpoint 500) | 118–132 (midpoint 125) | AAMC **[A]** |
| Population SD | 10.6–11.0 depending on cohort window | 2.9–3.2 depending on section | AAMC **[A]** |
| **SEM** (published as a 68% confidence band) | **± 2 points** | **± 1 point** | AAMC **[A]** |
| **SED** = √2 · SEM | **2.83 points** | **1.41 points** | *[own calculation]* |
| **95% reliable-change threshold** = 1.96 · SED | **± 5.5 → 6 points** on an integer scale | **± 2.8 → 3 points** | *[own calculation]* |
| **90% reliable-change threshold** | **± 4.7 → 5 points** | **± 2.3 → 3 points** | *[own calculation]* |

The AAMC publishes the SEM as a confidence band rather than as a coefficient, and it does not
publish a reliability coefficient for the current exam at all (see `## What I could not
verify`). Back-derived from the published band and SD, total-score reliability is **≈ .97** and
section reliability is **≈ .88–.90** *[own calculation]*.

### The single most important comparison in this review

**The AAMC's own median retest gain (+2 to +4 total points) is smaller than the 95%
reliable-change threshold for a single learner (6 points), and smaller than the 90% threshold (5
points).** *[own calculation against A-tier AAMC values]* The population-median improvement on
retesting the MCAT is not, for any individual, distinguishable from measurement error. This is
the sentence an academic reader will use to dismantle any product claim built on small gains,
and the team must get in front of it rather than be caught by it.

### What the controlled literature actually supports, converted to MCAT points

Every credible controlled estimate of a coaching effect, converted at the MCAT total SD of 11.0
*[own calculation]*, lands in a narrow band:

| Source | Design | Effect | → MCAT total points |
|---|---|---|---|
| DerSimonian & Laird 1983 | matched/randomised subset only | ~10 SAT points/section | **+1.0** |
| Powers & Rock 1999 | national survey, 5 bias-correction models | V 6–8, M 13–18 | **+1.0 to +1.4** combined |
| Briggs 2001 | NELS:88, controls + Heckman + IV | V 6–8, M 14–15 | **+1.1** combined |
| Montgomery & Lilly 2012 | randomised/matched only, 10 studies | V 23.5, M 32.7 | **+3.0** combined |
| Hao et al. 2025 | 28 (quasi-)experimental studies, 92 ES | g = .26 (95% CI .10–.42) | **+2.9** (CI +1.1 to +4.6) |
| Hausknecht et al. 2007 | retest only, no instruction | δ = .26 | **+2.9** (this is the *floor*, not an effect) |
| Messick & Jungeblut 1981 | log model, practical ceiling | 20–30 SAT points | **+1.9 to +3.1** |

**Four independent lines of evidence converge on roughly +3 MCAT total points as the outer edge
of what preparation, measured against a control, has ever been shown to produce as a mean
effect.** Nothing in the literature supports a mean gain of 1 SD (≈10–11 points). Claim B is
asking for three to four times the largest credibly documented effect.

### Why Claim B fails on construct validity, not just on magnitude

This is the argument that will be made against the team first, and it has direct empirical
support.

1. **The prep effect that exists is concentrated in test-taking skill, not construct
   knowledge.** In Hao et al. (2025), the moderator analysis is unambiguous: interventions that
   taught test-taking skills produced **g = .35 (p < .001)**; interventions that did not produced
   **g = .05 (p = .662, not significant)**. Interventions that emphasised broad knowledge/skill
   development produced **g = .17 (p = .069, not significant)**, while those that did *not*
   emphasise it produced **g = .31 (p < .001)**. Affect regulation was the largest single
   moderator: socio-affective strategies present, **g = .41**; absent, **g = .20**. **[A]** Read
   plainly: the measured test-preparation effect is driven by test-wiseness and anxiety
   reduction, and disappears without them. That is construct-irrelevant variance by Messick's own
   definition.
2. **Gained MCAT scores predict the criterion worse than equal un-gained scores — in AAMC's own
   data.** Zhao, Oppler, Dunleavy & Kroopnick (2010, *Academic Medicine*, AAMC authors) used
   differential prediction against USMLE Step 1. For the most-recent, highest-within-
   administration, and highest-across-administration approaches, **repeaters are expected to
   achieve lower Step 1 scores than non-repeaters at the same MCAT score, and the deficit grows
   with the number of attempts.** Only the *average* across attempts is unbiased. **[A for the
   finding, abstract only for magnitudes]** This is exactly the "a coached 510 predicts worse than
   a natural 510" test, run on the MCAT, and the gained score fails it.
3. **The general retesting literature agrees.** Lievens, Reeve & Heggestad (2007, *JAP*, N = 941)
   found no measurement bias at first testing but that **retesting induced both measurement and
   predictive bias**: the retest factor was less saturated with *g* and more associated with
   memory, and the change "eliminated the test's criterion-related validity." **[A, abstract
   only]** Lievens, Buyse & Sackett (2005) in Belgian medical admissions found that **the same
   test score predicted higher subsequent performance for first-attempt passers than for
   second-attempt passers** — the between-person retest effect. **[A, abstract only]**
4. **Dose-response forecloses the ceiling.** Messick & Jungeblut's fitted logarithmic models
   imply, converted, **β ≈ 0.7–1.1 MCAT total points per natural-log unit of study hours** *[own
   calculation]*, and their own conclusion is that gains "much greater than 20 to 30 points"
   (≈ +2 to +3 MCAT points) require contact time "approaching that of full-time schooling."
   **[A, abstract plus Becker 1990's secondary account of the fitted values]** A ceiling is a
   property of the response function, and this response function has a low one.

There is one MCAT-specific finding pointing the other way, and the team should know it: Jones
(1986a) concluded that MCAT coaching "has a limited effect that **supports rather than
undermines** the validity of the test." **[A, abstract only]** That is a null on differential
validity, not evidence for a ceiling — and it is 40 years old, on a superseded exam.

### The exact phrasing constraint

Every score-gain statement the team makes, in marketing or in product, must satisfy all five
conditions. A statement failing any one of them is not interpretable and should not ship.

> 1. **Name both instruments.** Both must be the official MCAT or an AAMC-scaled full-length.
>    Never a third-party or in-house diagnostic as the baseline.
> 2. **Name the comparison condition.** A gain relative to nothing is not a gain.
> 3. **Express the gain relative to the AAMC's published median retest gain for the same
>    initial-score band**, not relative to zero. The reference class is +2 to +4 points for
>    initial 472–517 and +0 to +1 for 518–528.
> 4. **Report the proportion of the sample whose change exceeded the reliable-change threshold
>    of 6 total points (3 points per section)** alongside any mean.
> 5. **Report the full distribution, including the negative tail**, stratified by initial-score
>    band. Never a bare mean, never pooled across bands.

And one absolute prohibition at the individual level:

> **The product may never tell an individual learner that they "gained" fewer than 6 total
> points or fewer than 3 points on a section.** Below those thresholds the correct and only
> defensible language is: *"your score changed by N points, which is within the range that
> measurement error alone produces between two sittings."*

### How each claim must be phrased if it is made at all

**Claim A ("faster") — defensible, restricted.** Phrase it as a claim about *input efficiency
against a matched comparison*, never as a claim about the score: *"in a controlled comparison,
users reached the same AAMC-scaled full-length performance level with N fewer study hours than
the comparison arm."* This survives because it does not require the gain to be construct-valid —
it only requires that the two arms be measured on the same instrument. It still requires the
controlled comparison to have been run, and none exists today for any MCAT product (see `03`).

**Claim B ("higher ceiling") — not defensible; drop it.** No admissible reformulation exists at
the magnitude the claim implies. The nearest honest statement is about *headroom*, not about
raising a ceiling: *"learners whose current score sits below the level their coursework and
practice performance predict have more room to move than learners already at that level"* — and
even this is an observation about starting position, not a causal claim about the product. If
the team wants any ceiling language at all, it must first fund the study in `## Findings §7`.

---

## Findings

### 1. MCAT reliability, SEM, and the standard error of difference

**What AAMC publishes.** *Using MCAT Data in 2019 Medical Student Selection* states it most
explicitly, and with an unambiguous new-scale example:

> "MCAT total scores are reported with a **68% confidence band of plus or minus two points**, and
> MCAT section scores are reported with **68% confidence bands of plus or minus one point**.
> Adding and subtracting two points to an MCAT total score of 500, for example, defines a
> confidence band that begins at 498 and goes to 502." **[A]**

The 2022 and 2023 editions carry the identical ± 2 / ± 1 values but drop the "68%" label.
Because a 68% band is by construction ± 1 SEM, **the AAMC has published the SEM; it has simply
published it in band form**:

- **SEM (total) = 2.0 score points [A]**
- **SEM (section) = 1.0 score point [A]**

**Internal consistency check, and why it matters.** If the four section SEMs are each 1.0 and
section measurement errors are independent, the implied total SEM is √(4 × 1.0²) = **2.0** —
exactly the published total band *[own calculation]*. The two published values are therefore
mutually consistent under independent section errors, which is reassuring evidence that ± 1 and
± 2 are the intended precision values rather than heavy roundings of something else. This matters
because both are integers on coarse scales (15 points for a section, 57 for the total), so
rounding was a live worry.

**Population SDs (AAMC, *Summary of MCAT Total and Section Scores*) [A]:**

| Percentile window | Total mean | Total SD |
|---|---|---|
| 2016–2018 | 500.9 | 10.6 |
| 2017–2019 | 501.1 | 10.6 |
| 2018–2020 | 501.5 | 10.7 |
| 2019–2021 | 501.6 | 10.8 |
| 2020–2022 | 501.3 | 11.0 |

Section means run 124.7–126.1 with **SDs of 2.9 to 3.2**; the Chemical and Physical Foundations
section is consistently the tightest at SD 2.9. **[A]** I did not resolve with certainty which of
the remaining SDs belongs to which section from the extracted text (see `## What I could not
verify`). I use SD 11.0 for the total and 3.0 for a representative section throughout, and flag
sensitivity where it changes a conclusion.

**Back-derived reliability** *[own calculation]*, using ρ = 1 − SEM²/SD²:

| | SEM | SD | Implied reliability |
|---|---|---|---|
| Total | 2.0 | 11.0 | **.967** |
| Total | 2.0 | 10.6 | **.964** |
| Section | 1.0 | 2.9 | **.881** |
| Section | 1.0 | 3.2 | **.902** |

So **total ≈ .97, sections ≈ .88–.90.** These are internally coherent: a composite of four
highly intercorrelated .89-reliable subtests will have reliability in the mid-.90s. Sensitivity:
because the bands are integers, if the true section SEM were 1.4 rather than 1.0, section
reliability would fall to **.77** and every section-level conclusion below would weaken
materially. The team should treat section-level precision as the softest number in this review.

**The standard error of difference — the correct statistic for "did this learner improve?"**
Following Jacobson & Truax (1991), for two administrations of equal precision:

> S_diff = √(SEM₁² + SEM₂²) = √2 · SEM

*[own calculation]*, giving **SED (total) = 2.83** and **SED (section) = 1.41**. Reliable-change
thresholds, |Δ| ≥ z · S_diff:

| Confidence | z | Total threshold | Section threshold |
|---|---|---|---|
| 68% | 1.00 | 2.83 → **3 points** | 1.41 → **2 points** |
| 90% | 1.645 | 4.65 → **5 points** | 2.32 → **3 points** |
| 95% | 1.96 | 5.54 → **6 points** | 2.77 → **3 points** |

**These are floors, not estimates.** S_diff as computed treats the true score as fixed between
sittings. A real MCAT retest interval is months of life — coursework, illness, motivation,
maturation — so true-score instability adds variance and the operative SED is **≥ 2.83**. Any
honest reporting standard should treat 6 total points as the minimum bar, not a conservative one.

**The three consequences the team must internalise:**

1. **Section-level claims are far weaker than total-score claims, but not for the reason the
   brief anticipated.** The section SEM is ~1.0, not 1.5–2.0, so the *absolute* precision is
   better than feared. The problem is the **ratio**: a 3-point reliable-change threshold on a
   15-point scale with SD 3.0 is **1.0 SD of the section distribution**, whereas a 6-point total
   threshold on SD 11.0 is **0.55 SD** *[own calculation; using the unrounded thresholds of 2.77
   and 5.54 the figures are 0.92 SD and 0.50 SD, so the ratio is ~1.8× either way]*. **Per-section, a learner must move a
   full population standard deviation before the change is individually reliable.** Any "we
   raised your CARS" claim is therefore roughly twice as hard to defend as the equivalent
   total-score claim.
2. **Reporting a mean gain and a confidence interval on the mean is not the same as reporting
   whether individuals changed**, and conflating them is the most common failure in this
   literature. A study with N = 500 can pin a mean gain of +2.0 points to ± 0.3 while almost none
   of those 500 individuals experienced a reliable change. Both statistics are needed and they
   answer different questions.
3. **AAMC already tells admissions committees not to over-read small differences.** The guides
   say confidence bands exist to prevent "overinterpretation of small differences in test
   scores" and instruct readers to judge overlap. **[A]** A product that over-reads small
   differences is contradicting the test sponsor in public.

### 2. The retest / practice effect on the MCAT specifically

**AAMC's published retest data [A].** From *Using MCAT Data*, first-to-second attempt, examinees
first testing in the stated window and retesting within it:

| Guide edition | Window | N retested | Median gain, initial 472–517 | Median gain, initial 518–528 |
|---|---|---|---|---|
| 2019 | 2015–2017 | ~48,000 | **+2 to +3** | **+1** |
| 2022 | 2018–2020 | 44,308 | **+3 to +4** | **0** |
| 2023 | 2019–2021 | 45,814 | **+2 to +4** | **+1** |

About **38%** of 2019–2021 examinees were retesters. **[A]** AAMC notes "considerable variation
in the magnitude and direction of score changes, with some examinees posting greater increases or
decreases," and — critically — that **"average score gains on the second attempt are greater when
the time between the first and second attempts is greater."** **[A]** Secondary aggregation puts
the split at roughly 60% improve / 15% tie / 25% decline **[C]**.

**Does the gain depend on initial score?** Yes in the published medians (+2 to +4 below 518,
+0 to +1 at 518+), but the top band is tiny — **N = 71** in the 2019–2021 cohort — and is
mechanically compressed by the scale ceiling at 528. The apparent baseline-dependence is
therefore partly a ceiling artefact and partly genuine, and cannot be cleanly attributed.

**Decomposing the +2 to +4: this is where the brief's premise needs correcting.**

Regression to the mean, computed properly, turns out to be a *small* contributor at the
official-MCAT-to-official-MCAT level, precisely because the MCAT is highly reliable. Kelley's
formula gives the expected true score as μ + ρ(X₁ − μ), so the expected RTM gain for a learner
scoring X₁ is (1 − ρ)(μ − X₁). At ρ = .967 and μ = 501.5 *[own calculation]*:

| First-attempt score | Expected RTM gain at ρ = .967 | at ρ = .90 (sensitivity) |
|---|---|---|
| 478 | +0.78 | +2.35 |
| 486 | +0.51 | +1.55 |
| 494 | +0.25 | +0.75 |
| 520 | −0.61 | −1.85 |

**Pure regression to the mean from measurement error is under 1 point across essentially the
whole scale, and cannot explain a +2 to +4 median gain.** *[own calculation]* This is a genuinely
useful and slightly counterintuitive result: the brief assumed RTM was "guaranteed to produce
apparent gains for low scorers," and at the total-score level on the real exam it is guaranteed
but nearly negligible. Even under a pessimistic ρ = .90 it reaches only ~2 points at the bottom
of the scale.

**Where RTM does become large — and this is the mechanism behind every diagnostic-to-official
gain claim in the industry.** RTM scales with (1 − ρ), so it is governed by the reliability of
the *baseline instrument*. If a single unproctored diagnostic has ρ = .70 on the same scale, the
expected RTM gain for a learner 15 points below the mean is (0.30)(15) = **+4.5 points** *[own
calculation, assuming the diagnostic is scaled comparably and has ρ = .70 — both assumptions are
unverified]*. That is nine times the RTM on an official-to-official comparison. Stack it with the
practice effect and third-party scaling bias and the arithmetic of a "+13 point" claim becomes
visible; see DOK 2 #4.

**What AAMC's data can and cannot separate.** It **cannot** separate the three components, and
the team should say so plainly rather than implying otherwise:

- **True practice effect** (familiarity, pacing, reduced anxiety, item-format exposure)
- **Regression to the mean** (bounded above at ~0.8 points, per the calculation above)
- **Real preparation between sittings** (AAMC's own note that longer gaps produce larger gains,
  and its instruction to admissions officers to look for post-bacc or graduate coursework in the
  file, both point to this being substantial)

The AAMC retest sample is **entirely self-selected on dissatisfaction with the first score**, and
essentially every retester prepares between sittings. There is no untreated control arm anywhere
in this data. It is a reference class, not an effect estimate.

**The external benchmark for the practice component.** Hausknecht, Halpert, Di Paolo & Moriarty
Gerrard (2007), 50 studies, 107 samples, N = 134,436: overall corrected **δ = .26** from first to
second administration, **δ = .20** from second to third, and **δ = .56** for non-consecutive
(Test 1 → Test 3); effects **larger when practice was accompanied by coaching and when identical
forms were used**. **[A]** Converted at MCAT total SD 11.0, δ = .26 → **+2.9 points** *[own
calculation]*.

**The convergence, and what it does and does not license.** The AAMC observed median (+2 to +4)
is approximately equal to the meta-analytic pure-practice prediction (+2.9). This does **not**
prove retesters learn nothing — the AAMC's own time-gap finding argues they do — but it does mean
**the entire burden of proof sits on the claimant**. A product asserting a gain must demonstrate
it exceeds roughly 3 points *on top of* the retest baseline, against a comparison arm. Hausknecht
et al. close their abstract with the sentence that frames all of section 3: "Additional research
is needed to understand the impact of retesting on the validity inferences drawn from test
scores."

### 3. Construct validity of coached score gains — the central debate

This is where an academic reader attacks first, and the recent evidence is worse for the industry
than the classic literature was.

**The classic SAT coaching estimates, converted.** SAT-V SD ≈ 107, SAT-M SD ≈ 114, combined SD
≈ 204 (from Briggs' own Table 2, and computing the combined SD assuming r ≈ .7) *[own
calculation]*.

- **DerSimonian & Laird (1983)**, random-effects meta-analysis modelling study design explicitly.
  Common-effect estimates were **22.8 V (SE 5.3)** and **21.1 M (SE 4.4)**; adjusted for
  investigator intercorrelation, **19.3 V / 17.7 M**. But the headline finding is the design
  gradient: studies comparing coached gains to **national norms yielded effects four to five
  times larger** than matched or randomised evaluations, and the matched/randomised estimate was
  **~10 points**, which they judged "too small to be practically important." Converted: **+1.0
  MCAT total points** *[own calculation]*. **[A, abstract plus Becker 1990's Table 1]**
- **Powers & Rock (1999)**, College Board–sponsored, N > 4,000 with ~500 coached, five
  bias-correction models (ANCOVA, propensity matching, IV, Heckman, Belson). Estimates ranged
  **6–12 points verbal and 13–26 math**; discounting two outlier models, **6–8 verbal and 13–18
  math**, which they characterise using Cohen's conventions as **small**, and "far less than is
  claimed by major commercial test preparation companies." Baseline prediction equations were
  strong (multiple R .87–.94 where prior scores existed). Converted: **+1.0 to +1.4 MCAT total
  points** *[own calculation]*. **[A, abstract plus verbatim ETS report excerpts]**
- **Briggs (2001)**, NELS:88, n = 3,494 SAT / 2,364 ACT. Raw uncontrolled differences: commercial
  course +17 M / +13 V; private tutor +19 M / +7 V. **After controls for demographics, academic
  ability, motivation and other prep activities: +14 to +15 M, +6 to +8 V, combined ≈ +20 points.**
  Heckman selection-bias estimates were not significant and produced virtually identical
  coefficients to OLS. ACT: math 0 to +0.4, English +0.3 to +0.6, **reading −0.6 to −0.7**;
  "regardless of control variable specification, when rounded to ones, the estimated effect of
  coaching in absolute value is never more than a single point for any of the three ACT
  sections." Converted: **+1.1 MCAT total points** *[own calculation]*. **[A, read in full]**
  Briggs' own conclusion: "the average effect of coaching is nowhere near the levels previously
  suggested by commercial test preparation companies."
- **Montgomery & Lilly (2012)**, systematic review restricted to the 10 studies with
  randomisation into treatment and control, 1970–2000: **+23.5 V and +32.7 M**, "nearly triple
  that which was previously assumed," with programs longer than 8 hours producing significantly
  larger SAT-Math effects than shorter ones. Converted: **+3.0 MCAT total points** *[own
  calculation]*. **[B — abstract only; it is the most generous credible estimate, and a critic
  has noted it never computed a corresponding average course length, which makes the effect
  uninterpretable as a dose]**
- **Hao, Baird, El Masri & Double (2025)**, *Review of Educational Research*, the current
  state of the art: 28 (quasi-)experimental studies, 92 effect sizes, **g = .26, SE .08, 95% CI
  .10–.42, p < .001**. Converted: **+2.9 MCAT total points, CI +1.1 to +4.6** *[own
  calculation]*. **[A]**

**The moderator table from Hao et al. (2025) is the most damaging single piece of evidence
against Claim B, and it is recent.** Reading directly from their results **[A]**:

| Moderator | Level | k | ES | g | p |
|---|---|---|---|---|---|
| Test-taking skills taught | **Yes** | 21 | 62 | **.35** | **< .001** |
| Test-taking skills taught | **No** | 10 | 25 | **.05** | **.662** |
| Broad knowledge/skill development | Yes | 14 | 34 | .17 | .069 |
| Broad knowledge/skill development | No | 20 | 53 | .31 | < .001 |
| Socio-affective strategies | Yes | 10 | 24 | **.41** | < .001 |
| Socio-affective strategies | No | 22 | 63 | .20 | .012 |
| Commercial workbook used | Yes | 12 | 43 | **.40** | < .001 |
| Commercial workbook used | No | 18 | 44 | .15 | .077 |
| Practice tests used | Yes | 9 | 27 | .19 | .233 |
| Practice tests used | No | 20 | 60 | .29 | .002 |
| Memorisation | Yes | 21 | 59 | .28 | < .001 |
| Memorisation | No | 10 | 25 | .21 | .019 |

Three readings the team must absorb:

1. **Without test-taking-skill instruction the effect is g = .05 and not significant.** The
   measured test-preparation effect in the modern literature is essentially *entirely* attributable
   to interventions that teach guessing, elimination, context clues, margin notes and timing —
   Messick's construct-irrelevant variance, by name.
2. **Broad knowledge and skill development — the thing a construct-valid product would do — is
   the *non-significant* level.** Interventions that emphasised it scored g = .17 (p = .069);
   those that did not scored g = .31 (p < .001). This is not proof that knowledge development
   does nothing (these are between-study moderators, confounded with design, domain and
   duration), but it forecloses the claim that the literature shows construct-relevant learning
   driving score gains.
3. **Practice tests were not a significant moderator, and Hao et al. state that they found
   "little evidence of practice effect (i.e., using sample items and practice tests) on test
   preparation."** For a product whose mechanism is scheduled practice, this is directly
   relevant and unhelpful.

Hao et al.'s own discussion is careful — they say the effect "could be attributed to an increase
in domain-specific knowledge or test-specific cognitive skills" and that the framework was built
on retest-effect evidence — and they invoke Arendasy et al.'s (2016) four competing models:
familiarisation (construct-irrelevant), test-wiseness (construct-irrelevant), teaching
construct-relevant material (construct-relevant), and improvement of generalisable cognitive
ability (construct-relevant). **The moderator pattern is most consistent with models one and
two.**

**Messick & Jungeblut (1981): the functional form, and hours for a given gain.** Rank-order
correlations between coaching contact time and score effect were "upwards of .7" for both SAT-V
and SAT-M, and the relationship was **log-linear** — "arithmetically increasing amounts of score
effect being associated with geometrically increasing amounts of student contact time." Becker
(1990) reports the fitted values from their logarithmic models **[A for Becker's account; I read
M&J's abstract only]**:

- A **threshold of ~3 hours** before any gain above control appears
- **~8 hours → 10 SAT-M points; ~12 hours → 10 SAT-V points**
- **~107 hours → 40 SAT-M points; ~1,185 hours → 40 SAT-V points**
- Steeper slope for SAT-M than SAT-V

Fitting Δ = β · ln(h / 3) to those two anchor points *[own calculation]*:

| Domain | β, SAT points per ln unit | β in SD units | **β in MCAT total points per ln unit** |
|---|---|---|---|
| SAT-Math | 11.19 | .098 | **1.08** |
| SAT-Verbal | 6.69 | .063 | **0.69** |

**So Messick & Jungeblut's own fitted models, converted, imply β ≈ 0.7 to 1.1 MCAT total points
per natural-log unit of study hours** *[own calculation]*. Their stated practical ceiling — gains
"much greater than 20 to 30 points" require time approaching full-time schooling — converts to
**+1.9 to +3.1 MCAT total points** *[own calculation]*. And the same-gain time ratio between the
quantitative and verbal domains is **1,185 / 107 ≈ 11×** *[own calculation]*: eleven times the
hours to move verbal reasoning as far as quantitative reasoning.

I will not report an extrapolated hours figure for a +10 MCAT point gain. The fitted model
returns a number in the tens of thousands of hours, but that requires extrapolating ~300× beyond
the data range and is not a credible point estimate. The defensible statement is the qualitative
one M&J themselves made: **the fitted form does not permit 1-SD gains within any realistic study
budget.**

**Do coached gains predict the criterion? The evidence, ranked.**

- **Against the gain (strongest, and MCAT-specific): Zhao et al. (2010).** See `## Recommendation`.
  AAMC's own differential-prediction study finds repeaters' Step 1 performance over-predicted by
  their highest or most recent MCAT score, with the deficit increasing in the number of attempts.
  **[A, abstract only — no point estimates obtained]**
- **Against the gain (strongest general): Lievens, Reeve & Heggestad (2007).** Retesting induced
  measurement *and* predictive bias; retest factor less *g*-loaded, more memory-loaded; criterion
  validity eliminated. **[A, abstract only]**
- **Against the gain: Lievens, Buyse & Sackett (2005).** Belgian medical admissions; same score
  predicted better performance for first-attempt than second-attempt passers. Note an important
  complication in the same abstract: **validity coefficients for the knowledge test were higher
  when the second administration's scores were used** — so the within-person direction is not
  uniformly unfavourable. **[A, abstract only]**
- **For the gain (MCAT-specific, old): Jones (1986a).** Concluded the coaching effect "supports
  rather than undermines the validity of the test." **[A, abstract only]**
- **Directly on point but unverified: Jones (1986b)**, "A comparison of the predictive validity of
  the MCAT for coached and uncoached students," *J Med Educ* 61:335–338, criterion = whether the
  student experienced academic problems in medical school. **I could not obtain the result.** The
  ERIC record describes the design only. Given the companion paper's conclusion it most likely
  reported a null, but I am not asserting that. **This is the single highest-value retrieval on
  the team's list.**

**Verdict.** The evidence is **mixed but leans against the gain [B]**, and the one study run on
MCAT data by AAMC's own psychometricians against a hard criterion leans against it. That is
enough to make Claim B measurement-invalid as stated: if a gained 510 predicts Step 1 worse than
a natural 510, then "reached scores they otherwise would not have reached" is a claim about the
number, not about the learner, and an academic reader will say so.

### 4. Predictive validity of the MCAT itself

**AAMC's own validity programme [A].** The MCAT Validity Committee ran from 2014 to 2023.

| Outcome | Metric | Value | Sample |
|---|---|---|---|
| Preclerkship performance | median r with MCAT total | **0.59** | 17 validity schools, 2016/2017 entrants, N = 2,756 |
| Summative M1 performance | median r with MCAT total | **0.57** (25th–75th pctile 0.47–0.6x) | validity sample, *Acad Med* 2020 |
| Summative M1 performance | median R, MCAT **+ UGPA** | **0.65** | as above |
| Preclerkship courses (old exam) | median r | **0.54** | 17 schools |
| Comparator: GMAT total → mid-program grades | median r | 0.47 | 272 studies |

Each metric alone correlated **> 0.50** with summative M1 performance; using both together was
better than either alone. Validity-sample MCAT mean 507.87 (SD 7.34) against a national student
population mean of 508.57 (SD 6.92). **[A]**

**Independent studies are more pessimistic [B].** A University of Minnesota study (*Acad Med*
2019) found backward multiple regression of new-MCAT section scores on Step 1 gave **multiple
R = .440** (R² ≈ .19), and R = .502 for a Human Behavior course; exploratory factor analysis
produced four factors (biomedical knowledge, basic science concepts, cognitive reasoning, general
achievement). **[B, abstract only]** A Marshall University analysis found the best
pre-matriculation model for Step 1 was lowest MCAT total plus math-science GPA at **adjusted
R² = .117** — 11.7% of variance. **[B]** Single-site, restricted-range samples will
systematically understate validity relative to AAMC's multi-school medians.

**The finding that matters most for the product, and it cuts against paying for points.** AAMC
reports repeatedly that **students entering with a wide range of MCAT scores passed Step 1 and
Step 2 CK on the first attempt, progressed to year three on time, and graduated within four or
five years at high rates** — one cited group progressed on time at **97%**. **[A]** AAMC's own
framing to admissions committees is blunt: the exam "enables every medical school to identify
applicants whose current level of achievement may be too low to succeed," and "beyond that
cutoff, selecting students based on small differences in scores is not supported by the data on
the reliability of the exam." **[A]**

**What raising a score therefore buys** *[own calculation from A-tier inputs]*: r = 0.59 with
preclerkship performance is **R² = 0.35**, so roughly a third of variance in early
medical-school performance — real, and among the better predictors in professional education.
But the milestone outcomes (pass Step 1, progress on time, graduate) are near-ceiling across a
wide score band, so the marginal value of +3 points to a learner's *medical school performance*
is close to nil. **The marginal value is almost entirely in admissions selection.** Jones (1986a)
put a number on it: the MCAT coaching effect he measured was worth **≈ 5 percentage points of
acceptance probability**. **[A, abstract only]** That is the honest, defensible statement of what
a small gain is worth, and it is not nothing — it is just not a claim about becoming a better
future physician.

### 5. Measurement invariance and differential effects

**Is CARS resistant to preparation? Yes — this is evidence, not folklore, though with real
caveats. [B]** Five independent lines converge:

1. **MCAT-specific, and the strongest form: Jones (1986a).** In two studies (one on repeaters,
   one on first-time examinees), differences favouring coached examinees appeared on **Science
   Knowledge** and **Science Problems**; results on **Skills Analysis: Quantitative** were
   **mixed**; and **neither study found any difference on Skills Analysis: Reading**. **[A,
   abstract only]** Skills Analysis: Reading is the direct ancestor of CARS. This is a null on the
   verbal-reasoning section from an AAMC-affiliated author with a large sample.
2. **Messick & Jungeblut:** steeper slope for math than verbal, and the **11× time ratio** for an
   equal scaled gain *[own calculation]*.
3. **Powers & Rock:** math effect "about twice as much as for verbal" (13–18 vs 6–8). **[A]**
4. **Briggs (2001):** SAT-V 6–8 vs SAT-M 14–15, and an outright **negative** coaching effect on
   ACT Reading (−0.6 to −0.7 points). **[A, read in full]**
5. **Hao et al. (2025)** summarising Hausknecht et al. (2007) and Kulik et al. (1984): tests of
   "analytical or quantitative tasks were more coachable and benefited more from repeated test
   taking than did verbal tasks." **[B]**

**Caveats the team must state if it uses this.** Montgomery & Lilly (2012) is the one contrary
data point — their randomised-only synthesis found verbal gains at 72% of math gains (23.5 vs
32.7), which is a much smaller gap than the others **[B]**. The pre-2015 Verbal Reasoning /
Skills Analysis: Reading sections are not identical to CARS. And "less coachable on average" is
not "uncoachable" — CARS has the *same* SEM (± 1) as every other section, so the reliable-change
threshold is identical; the difference is in the expected effect, not the measurement.

**The widely-repeated claim that prep companies show median CARS retake gains of 0–1 point versus
+2 to +3 for the science sections is [C] and I could not source it to AAMC.** The AAMC guides I
read publish first-to-second-attempt change for the **total score only**, not by section. If the
team wants the section-level retest distribution it will have to request it from AAMC or derive
it from its own users.

**Differential effects by baseline ability — genuinely contested, and the direction the team
would prefer is the less supported one.**

- **Briggs (2001), read in full, primary [A]:** "For students that do not take the PSAT first,
  the estimated effect of coaching is **not statistically significant for any of the sections** of
  the SAT or ACT." Coaching did nothing measurable for test-naive students. Separately, the ACT
  English section showed **three significant negative interactions** — students who were Asian,
  who scored well on PSAT-Verbal, or whose parents encouraged test prep **benefited less**.
- **Jones (1986a), MCAT-specific [A, abstract]:** coaching differences were **less pronounced**
  for examinees with low Skills Analysis: Reading and Quantitative scores, for those with very
  low or very high UGPAs, and for those from very selective undergraduate colleges. So on the
  MCAT, coaching did *less* for the academically weakest.
- **Kulik et al. (1984), as reported in Hao et al. [C, not read]:** effect **highest for
  high-ability students, ES = .82**.
- **Griffin et al. (2013) on UMAT, as reported in Hao et al. [C, not read]:** coaching
  significant on the reasoning section for high-ability students, **negative for lower-ability**
  students.
- **Domingue & Briggs (2009), as reported in Hao et al. [C, not read]:** only students with prior
  test-taking experience benefited from ACT private tutoring.

**Verdict:** the two primary-source findings I could verify (Briggs 2001, Jones 1986a) both point
the same way — **preparation does less for the least prepared and least test-experienced** — and
the C-tier secondary reports agree. Briggs' own ACT English interactions point the other way,
which is why I rate the overall direction **[C]** rather than **[B]**. Either way, **"we help
strugglers most" is unsupported and plausibly backwards**, which reinforces DOK 2 #7 in `03`.

**By demographic subgroup.** A 1994 AAMC-era analysis is reported secondarily as finding that
African American retesters improved less than white retesters **[C, secondary source only, I did
not locate the primary]**. AAMC's own 2020 compendium addresses group differences at length but
frames them as consequences of unequal educational opportunity and warns explicitly against
interpreting scores without context; it does not report differential *prep* effects. **Formal
measurement-invariance testing of MCAT prep effects across subgroups appears not to exist in the
published literature** — see `## What I could not verify`. This is a real gap and, if the product
serves a disadvantaged population, an equity risk the team cannot currently quantify.

### 6. The ceiling question directly

**Is there evidence that preparation can move someone >1 SD (≈10–11 MCAT points)? No, as a mean
effect. [A]**

The largest credibly documented mean gains, ranked *[own calculation for conversions]*:

| Rank | Source | Design quality | MCAT-equivalent mean gain |
|---|---|---|---|
| 1 | Montgomery & Lilly 2012 | randomised/matched only, but no dose reported | **+3.0** |
| 2 | Hao et al. 2025 | 28 (quasi-)experimental, current SOTA | **+2.9** (CI +1.1 to +4.6) |
| 3 | Messick & Jungeblut 1981 practical ceiling | log model on flawed studies | **+1.9 to +3.1** |
| 4 | DerSimonian & Laird 1983 common effect | meta-analytic, all designs | **+2.0 to +2.3** |
| 5 | Powers & Rock 1999 | national survey, 5 bias models | **+1.0 to +1.4** |
| 6 | Briggs 2001 | NELS:88 with selection correction | **+1.1** |
| 7 | DerSimonian & Laird 1983 matched/randomised | best-controlled subset | **+1.0** |

**The largest credibly documented mean gain from any intervention, converted, is approximately
+3 MCAT total points — about 0.27 SD, and about half the 6-point individual reliable-change
threshold.** Note the design gradient running down that table: **the better the control, the
smaller the effect.** DerSimonian & Laird quantified it — uncontrolled designs produce effects
**four to five times larger** than matched or randomised ones **[A]**. Any team tempted to run a
single-arm pre-post study should read that row as a prediction of what its own numbers will look
like and by how much they will be wrong.

**Are gains concentrated in the underprepared?** The evidence says **no, or mildly the opposite**
(section 5). The apparent concentration in AAMC's retest data at low initial scores is a
combination of a small (~0.5–0.8 point) RTM component, a ceiling artefact at the top of the
scale, and the fact that low scorers have more content headroom — not a demonstrated larger
causal effect.

**Do individual 10+ point gains happen? Yes, and this is where the honest framing lives.** The
AAMC retest distribution has real upper tails: secondary analysis of AAMC 2020–2022 data reports
that improvements of **6 or more points** were in the upper quartile for initial scores 490–513
(N ≈ 37,833), and improvements of **at least 9 points** were within the top decile for initial
scores 486–505 (N ≈ 34,434) **[B, secondary reading of AAMC figures I could not read directly]**.
So a 10-point gain is a real event in the tail of a self-selected retest population that also
undertook months of additional preparation. **It is an outcome that occurs; it is not an effect
that has been caused by any measured intervention.** The distinction is the whole of Claim B.

### 7. How score-gain claims should be reported to be defensible

What a psychometrician or a WWC reviewer would require. This is a concrete standard the team can
adopt verbatim.

**Design.**

1. **A comparison arm.** RCT preferred; QED with demonstrated baseline equivalence acceptable.
   WWC v5.0 thresholds: baseline difference of **|ES| ≤ 0.05** counts as equivalent;
   **0.05–0.25** requires an acceptable statistical adjustment (ANCOVA or regression on the
   pretest); **> 0.25 fails** and cannot be rescued. **[A]**
2. **Sample and sites.** ESSA Tier 1/2 requires a statistically significant positive finding,
   **≥ 350 participants** and **≥ 2 sites**. Tier 1 additionally requires a **low-attrition
   RCT**. Tier 3 ("promising") requires only a correlational study with statistical controls for
   selection bias — which is the realistic near-term target. **[A]**
3. **Intention-to-treat as the primary analysis.** No engagement thresholds. Every competitor
   claim in `03` is conditioned on completion, which by construction reports the compliant
   subgroup. Report per-protocol as a clearly labelled secondary analysis if at all.
4. **Pre-register** the primary outcome, the baseline instrument, the analysis model, the
   subgroups, and the engagement definition, before data collection. Pre-registration is not a
   WWC requirement but it is the cheapest available defence against the design gradient in
   section 6.

**Measurement.**

5. **Both timepoints on the official MCAT or an AAMC-scaled full-length.** No diagnostic-to-
   official comparison, ever. This is both a measurement requirement and, per `03`, a regulatory
   one.
6. **Report the reliable-change rate, not just the mean.** State the proportion of participants
   whose change exceeded **6 total points** (95%) and **5 points** (90%), and per section, **3
   points**. Cite the SED and show the arithmetic.
7. **Correct for regression to the mean explicitly.** The counterfactual for a learner with
   baseline X₁ is **not X₁**; it is the Kelley-adjusted expectation **μ + ρ(X₁ − μ)**. Publish ρ
   and μ used. At the official-MCAT level this correction is small (< 1 point); at any
   practice-test baseline it is large and must be reported.
8. **Subtract the retest baseline, or benchmark against it.** Present effects relative to AAMC's
   published median retest gain **for the same initial-score band**, or relative to a
   meta-analytic practice-effect floor of ≈ +2.9 points *[own calculation]* — never relative to
   zero.

**Reporting.**

9. **Publish the full distribution of change, including the negative tail**, stratified by
   initial-score band. AAMC's own convention — box-and-whisker with 10th, 25th, 50th, 75th and
   90th percentiles — is the format to copy, because it is the format the audience already reads.
10. **Publish the denominator chain.** N invited → N responding → N with verified official score
    reports → N analysed. The cautionary example in `03` runs 1,000+ → 164 → 81 → 54, a 5%
    analysed fraction of those invited.
11. **Report per-section and total separately, with the section SED stated**, so that section
    claims are not over-read. Note that the 3-point section threshold is **1.0 SD of the section
    distribution** versus 0.55 SD for the 6-point total threshold *[own calculation]* — section
    claims need roughly twice the standardised movement.
12. **Report at least one criterion or convergent outcome, not only the score.** Given Zhao et
    al. (2010) and Lievens et al. (2007), a score gain with no accompanying evidence of
    construct-relevant change is exactly the claim the literature says to distrust. Something as
    modest as pre/post performance on held-out AAMC content the learner never studied against
    would begin to address it.

---

## DOK 1 — established facts

1. MCAT total scale 472–528 (midpoint 500); four section scales 118–132 (midpoint 125); total is
   the simple sum of section scores. **[A]**
2. AAMC publishes total-score confidence bands of **± 2 points** and section-score confidence
   bands of **± 1 point**, labelled in the 2019 guide as **68%** bands. **[A]**
3. Because a 68% band equals ± 1 SEM, **SEM (total) = 2.0** and **SEM (section) = 1.0**. **[A]**
4. Total-score population SD by percentile window: 10.6 (2016–18), 10.6 (2017–19), 10.7
   (2018–20), 10.8 (2019–21), 11.0 (2020–22). Total means 500.9–501.6. **[A]**
5. Section-score SDs run **2.9 to 3.2**; Chemical and Physical Foundations is consistently 2.9.
   Section means run 124.7–126.1. **[A]**
6. Back-derived reliability: **total ≈ .97**, **sections ≈ .88–.90**. *[own calculation]*
7. Four independent section SEMs of 1.0 imply a total SEM of exactly 2.0, matching AAMC's
   published total band. *[own calculation]*
8. **SED (total) = 2.83; SED (section) = 1.41.** *[own calculation]*
9. **95% reliable-change thresholds: 6 total points, 3 section points. 90%: 5 total points, 3
   section points.** *[own calculation]*
10. A 3-point section threshold is **1.0 SD** of the section distribution; a 6-point total
    threshold is **0.55 SD** of the total distribution. *[own calculation]*
11. AAMC median first-to-second-attempt gain: **+2 to +4 points** for initial 472–517 and **+0 to
    +1** for 518–528, across three successive cohorts of N = 44,308–48,000. **[A]**
12. About **38%** of 2019–2021 MCAT examinees were retesters. **[A]**
13. AAMC states average second-attempt gains are **greater when more time elapses** between
    attempts. **[A]**
14. Expected regression-to-the-mean gain on official-to-official MCAT retesting is **under 1
    point** across essentially the whole scale (ρ = .967); at most ~2.4 points under a
    pessimistic ρ = .90. *[own calculation]*
15. Hausknecht et al. 2007 (50 studies, 107 samples, N = 134,436): retest **δ = .26** for
    administration 1→2, **.20** for 2→3, **.56** for non-consecutive; larger with coaching and
    with identical forms. **[A]**
16. δ = .26 converts to **+2.9 MCAT total points** at SD 11.0. *[own calculation]*
17. Hao et al. 2025 (28 studies, 92 effect sizes): test-preparation **g = .26, 95% CI .10–.42**
    → **+2.9 MCAT points, CI +1.1 to +4.6**. **[A]** for g, *[own calculation]* for conversion.
18. Hao et al. moderators: test-taking skills taught **g = .35 (p < .001)** vs not taught **g =
    .05 (p = .662)**; broad knowledge development **g = .17 (p = .069)** vs not **g = .31 (p <
    .001)**; socio-affective **.41** vs **.20**; commercial workbook **.40** vs **.15**; practice
    tests **not** a significant moderator. **[A]**
19. Hao et al. found "little evidence of practice effect (i.e., using sample items and practice
    tests) on test preparation." **[A]**
20. DerSimonian & Laird 1983: uncontrolled designs yield coaching effects **four to five times
    larger** than matched/randomised designs; matched/randomised estimate **~10 SAT points**,
    "too small to be practically important"; common-effect estimates 22.8 V / 21.1 M. **[A]**
21. Powers & Rock 1999: SAT coaching **6–12 V, 13–26 M** across models; **6–8 V, 13–18 M**
    discounting outliers; "small" by Cohen's conventions; "far less than is claimed" by
    commercial companies. **[A]**
22. Briggs 2001: after controls, **+14 to +15 SAT-M, +6 to +8 SAT-V, ≈ +20 combined**; ACT
    effects never more than 1 point in absolute value on any section, and **negative on reading
    (−0.6 to −0.7)**; Heckman selection estimates not significant. **[A]**
23. Briggs 2001: coaching effects were **not statistically significant on any SAT or ACT section**
    for students who had not previously taken the PSAT. **[A]**
24. Montgomery & Lilly 2012 (randomised/matched only, 10 studies): **+23.5 V, +32.7 M**; programs
    > 8 hours produced significantly larger SAT-Math effects. **[B]**
25. Every controlled coaching estimate converts to a band of **+1.0 to +3.0 MCAT total points**.
    *[own calculation]*
26. Messick & Jungeblut 1981: contact-time/effect relationship is **log-linear**, rank-order
    correlations "upwards of .7"; ~3-hour threshold; gains "much greater than 20 to 30 points"
    require time approaching full-time schooling. **[A]**
27. Fitted M&J values (via Becker 1990): 12 h → 10 SAT-V; 8 h → 10 SAT-M; **107 h → 40 SAT-M**;
    **1,185 h → 40 SAT-V**. **[A for Becker's account]**
28. M&J's fitted models imply **β ≈ 0.7–1.1 MCAT total points per natural-log unit of hours**, and
    a practical ceiling of **+1.9 to +3.1 MCAT points**. *[own calculation]*
29. The M&J same-gain time ratio between verbal and quantitative domains is **≈ 11×**. *[own
    calculation]*
30. Jones 1986a (MCAT): coaching differences favoured coached examinees on **Science Knowledge**
    and **Science Problems**, were **mixed** on Skills Analysis: Quantitative, and were **absent
    on Skills Analysis: Reading**; effects were **smaller** for examinees with low reading/quant
    scores, very low or very high UGPAs, and from very selective colleges; worth **≈ 5 percentage
    points** of acceptance probability; conclusion was that coaching "supports rather than
    undermines the validity of the test." **[A]**
31. Zhao et al. 2010 (AAMC authors): using repeaters' **highest or most recent** MCAT score
    **over-predicts** Step 1, with the deficit increasing in number of attempts; only the
    **average** across attempts is unbiased. **[A]**
32. Lievens, Reeve & Heggestad 2007 (N = 941): retesting induced measurement **and** predictive
    bias; retest factor less **g**-saturated, more memory-associated; changes **eliminated the
    test's criterion-related validity**. **[A]**
33. Lievens, Buyse & Sackett 2005 (Belgian medical admission): within-person retest gains of
    ⅓ SD (knowledge, SJT) and ½ SD (cognitive ability); **the same test score predicted higher
    performance for first-attempt than second-attempt passers**; knowledge-test validity was
    *higher* using second-administration scores. **[A]**
34. AAMC MCAT total → preclerkship performance: **median r = 0.59** (17 schools, N = 2,756);
    old exam 0.54; summative M1 median r = 0.57 (IQR 0.47–0.6x); **MCAT + UGPA together = 0.65**.
    **[A]**
35. r = 0.59 implies **R² = 0.35**. *[own calculation]*
36. Independent single-site estimates are lower: multiple R = **.440** for new-MCAT sections →
    Step 1 (Minnesota); adjusted R² = **.117** for MCAT + math-science GPA → Step 1 (Marshall).
    **[B]**
37. AAMC reports that students across a **wide range** of MCAT scores passed Step 1 and Step 2 CK
    on the first attempt, progressed on time (one cited group at **97%**), and graduated within
    four or five years at high rates. **[A]**
38. AAMC tells admissions committees that "beyond that cutoff, selecting students based on small
    differences in scores is **not supported** by the data on the reliability of the exam."
    **[A]**
39. WWC v5.0 baseline equivalence: **|ES| ≤ 0.05** equivalent; **0.05–0.25** requires statistical
    adjustment; **> 0.25** fails. ESSA Tier 1/2 require **≥ 350** participants and **≥ 2** sites
    plus a significant positive finding; Tier 1 requires a low-attrition RCT. **[A]**
40. Jacobson & Truax 1991: **S_diff = √2 · SE**; reliable change declared at **|RCI| ≥ 1.96**.
    **[A]**

## DOK 2 — insights and implications

1. **The AAMC's own median retest gain is below the individual reliable-change threshold, and
   this single fact reframes the entire product conversation.** +2 to +4 observed against a
   6-point 95% threshold and a 5-point 90% threshold *[own calculation]*. The team is operating in
   a regime where the *typical* real-world improvement on the target instrument is, for any given
   learner, statistically indistinguishable from noise. That is not an argument against building
   the product — it is an argument that the product's promise must be about *distribution
   position and time*, not about a number moving.

2. **Regression to the mean is a much smaller problem than the brief assumed at the official-exam
   level, and a much larger one at the diagnostic level — and the difference is the whole game.**
   Because the MCAT is ≈.97 reliable, RTM on official-to-official retesting is under 1 point *[own
   calculation]*. Because a single unproctored diagnostic might be ≈.70 reliable, RTM from a
   diagnostic baseline is several times larger. **RTM is not a property of the learner; it is a
   property of the ruler you chose for the "before" measurement.** Any team that uses an official
   baseline has largely solved its RTM problem; any team that uses a diagnostic has manufactured
   one.

3. **The measured test-preparation effect is, on the best current evidence, mostly not in the
   construct — and this is the argument that kills Claim B.** g = .35 with test-taking-skill
   instruction versus g = .05 without it, and broad knowledge development landing on the
   non-significant side, is as direct a statement of construct-irrelevant variance as this
   literature produces (Hao et al. 2025). A "higher ceiling" claim asserts that the learner's
   standing on the construct has genuinely risen. The literature's best answer is that what rises
   is test-wiseness and composure. The team cannot win this argument on the existing evidence; it
   can only decline to make the claim.

4. **The industry's "+13 point" arithmetic is fully decomposable, and the decomposition is the
   most useful competitive weapon in this document.** An illustrative build of a 13-point
   diagnostic-to-official claim *[own calculation, illustrative decomposition using the
   assumptions stated in §2]*: ≈ 4.5 points of regression to the mean off a low-reliability
   baseline, ≈ 2–4 points of third-party scaling bias (per `03`), ≈ 2.9 points of pure practice
   effect, leaving ≈ 2–3 points that could plausibly be intervention. That residual is exactly the
   magnitude the controlled literature predicts (§6). **The claims are not fabricated; they are
   correctly computed from the wrong baseline.** Saying this precisely, with the arithmetic
   shown, is more damaging to competitors and more credible than calling their numbers false.

5. **Section-level claims are harder than total-score claims for a different reason than
   expected.** The section SEM is 1.0, not 1.5–2.0, so absolute precision is better than the brief
   assumed. But the reliable-change threshold of 3 points is a full **1.0 SD** of the section
   distribution versus 0.55 SD for the total *[own calculation]*. **Per-section improvement claims
   require roughly twice the standardised movement of total-score claims.** A product that
   markets section-specific improvement is picking the harder fight.

6. **"CARS resists preparation" is true enough to design around and true enough to say — with the
   caveats attached.** Five independent lines converge, including a genuine null on the MCAT's
   verbal-reasoning ancestor from Jones (1986a) and an eleven-fold time ratio from Messick &
   Jungeblut *[own calculation]*. The product implication is not to deprioritise CARS; it is the
   opposite — CARS needs the longest runway and the earliest start, because it is the section
   where the marginal hour buys least and therefore where total hours matter most. And the honest
   marketing implication is that **CARS is the worst section on which to make a gain claim**,
   which is unfortunate because it is the section students most want help with.

7. **"We help strugglers most" is the most tempting claim and the least supportable, and the two
   primary sources both contradict it.** Briggs (2001) found no significant coaching effect on any
   section for test-naive students; Jones (1986a) found smaller MCAT coaching effects for
   examinees with low reading and quantitative scores. This corroborates DOK 2 #7 in `03` from a
   second, independent direction. The defensible reframing is **headroom, not effect size**: a
   learner far below their predicted level has more distance available, which is a statement about
   starting position rather than about differential treatment response.

8. **The Zhao et al. (2010) finding is the one the team should treat as decisive, because it is
   AAMC's own psychometricians, on MCAT data, against a hard criterion.** A repeater's highest
   score over-predicts Step 1, and the over-prediction grows with attempts. Read as a validity
   statement: **the increment in a repeater's score carries less criterion-relevant information
   than the same increment in a first-timer's score.** That is precisely the measurement
   invalidity that Claim B would be asserting away. It also has a constructive corollary for
   product design — if a product's users are repeaters, the honest internal metric is the
   *average* of their attempts, not the best.

9. **This review revises a load-bearing number in `03`, downward and substantially.** `03`
   calibrates β at **2.5–4.5 MCAT points per natural-log unit** of study hours. Direct conversion
   of Messick & Jungeblut's fitted models gives **β ≈ 0.7–1.1** *[own calculation]* — roughly a
   quarter to a third as large. The discrepancy is diagnostic rather than arithmetic: `03`
   calibrated β against the **AAMC retest distribution**, which is a self-selected, uncontrolled
   reference class that bundles practice effect, RTM and real preparation, whereas M&J's β comes
   from **coaching studies with control groups**. **The two βs are measuring different things, and
   the smaller one is the one that describes the product's causal contribution.** Recommended
   resolution: `03` should retain its calibrated β for *forecasting a user's likely observed
   second-attempt score* (which is what a planner needs), and adopt β ≈ 0.7–1.1 for any statement
   about *what the product causes*. These must be visibly different numbers with different labels
   in the code and the copy, or the team will eventually quote the forecasting β as an effect.

10. **What a score gain actually buys is admissions probability, not medical-school performance,
    and the team should say so because it is both true and more persuasive.** MCAT total correlates
    r = 0.59 with preclerkship performance (R² = 0.35) *[own calculation]*, but AAMC repeatedly
    documents that students across a wide score range pass Step 1 and Step 2 CK, progress on time
    and graduate. The milestone outcomes are near-ceiling. Jones (1986a) priced the coaching
    effect at **≈ 5 percentage points of acceptance probability**. A learner is buying a slightly
    better shot at a seat, not a better career — and framed that way, +3 points is a rational
    purchase rather than an overclaim.

11. **The design gradient is a forecast of the team's own future results.** DerSimonian & Laird's
    finding that uncontrolled designs inflate effects four- to five-fold, plus the monotone
    descent of the table in §6 from randomised-only to best-controlled, means a single-arm pre-post
    study of this product **will** produce a number four to five times its true effect. The team
    should decide now whether it wants a number it can defend or a number it can advertise,
    because it cannot have both from the same design.

12. **Publishing a study that meets the §7 standard would be the only one in the category, and
    the bar for "first" is low.** ESSA **Tier 3** — a correlational study with statistical
    controls for selection bias — is achievable from existing product telemetry plus verified
    official score reports, with no randomisation. That is a realistic first milestone, and it is
    already more than any incumbent has (per `03`). Tier 2 needs a QED with demonstrated baseline
    equivalence, ≥ 350 users and ≥ 2 sites; Tier 1 needs a low-attrition RCT. **The sequencing is
    Tier 3 now, Tier 2 next, and no gain claim of any kind before Tier 3 lands.**

13. **The honest claim is commercially stronger than the dishonest one, for a reason that comes
    straight out of the dose-response shape.** Because gains are logarithmic in hours, the scarce
    resource is time, not points. "Reach your realistic score with 150 fewer hours" is defensible
    under Claim A, is what a pre-med with a GPA and clinical hours to maintain actually wants, and
    requires no construct-validity argument at all — it is a claim about the input. "Reach a score
    you couldn't otherwise reach" requires winning an argument the team cannot win. **Claim A is
    both the true claim and the better one.**

14. **The section-level retest distribution is the highest-value missing dataset, and the team may
    be able to generate it.** AAMC publishes first-to-second-attempt change for the total score
    only. Nobody has published section-level retest distributions with Ns. A product with verified
    official score reports from repeaters could produce that distribution and it would be a
    genuine contribution to the literature — publishable, citable, and a far more durable asset
    than a marketing number.

## What I could not verify

- **An officially published AAMC reliability coefficient for the current (2015–) MCAT.** I
  searched AAMC's validity-research pages, the *Using MCAT Data* guides for 2019/2022/2023, the
  *Summary of MCAT Total and Section Scores* documents, the 2020 *Academic Medicine* validity
  compendium, and the AAMC score-report materials. **AAMC publishes the SEM as a confidence band
  and does not publish a reliability coefficient.** The frequently repeated figure "r just over
  0.90" traces, in everything I could find, to a **forum post**, not an AAMC document, and I have
  not used it. The .96–.97 (total) and .88–.90 (section) figures in this review are **my
  back-derivations** from the published band and SD, and are labelled as such. **Note the tension:
  a reliability of .90 would imply a total SEM of 3.4 points, not 2.0, which would raise the
  95% reliable-change threshold from 6 points to 9.6 points** *[own calculation]*. If the team
  intends to publish reliable-change thresholds, it should obtain AAMC's actual coefficients
  first, because this discrepancy moves the threshold by more than 50%.
- **Which section SD belongs to which section.** The AAMC *Summary* PDFs interleave percentile
  tables and mean/SD annotations across page breaks, and the extracted text does not reliably
  preserve the pairing. I am confident that **Chemical and Physical Foundations is SD 2.9** (it
  directly follows its own header in every year) and that the range across all four is **2.9–3.2**,
  but I did not confirm the CARS-specific SD. Nothing in this review turns on the assignment.
- **AAMC section-level retest distributions.** The guides publish first-to-second-attempt change
  for the **total score only**. The widely repeated claim that median CARS retake gain is 0–1 point
  versus +2 to +3 for the science sections is sourced, in everything I found, to a **prep-company
  blog** and is **[C]**. It may well be true; it is not verified.
- **The AAMC box-and-whisker retest figures themselves.** These are images. I read AAMC's narrative
  statements of the medians and the Ns from extracted document text. The quartile and decile values
  I quote in §6 (upper-quartile ≥ 6 points for initial 490–513; top-decile ≥ 9 points for initial
  486–505) come from a **secondary source reading those figures**, not from my own reading of them,
  and are **[B]**.
- **Full text of Zhao et al. (2010).** Abstract only, and it is the single most load-bearing
  citation for the Claim B verdict. **I obtained no point estimates** — I know the direction and
  the ordering of the four scoring approaches, but not the magnitude of the Step 1 over-prediction.
  **The team should obtain this full text before writing anything downstream.**
- **The result of Jones (1986b)**, "A comparison of the predictive validity of the MCAT for coached
  and uncoached students," *J Med Educ* 61:335–338. The ERIC record describes the design (criterion
  = whether a student experienced academic problems in medical school) but **states no finding**,
  and the DOI landing page returned only journal boilerplate. This is the closest thing in
  existence to a direct MCAT test of whether coached scores predict as well as uncoached scores.
  **Highest-priority retrieval.**
- **Full text of Messick & Jungeblut (1981)** (paywalled). Abstract read in full; the fitted values
  (3-hour threshold, 12 h → 10 SAT-V, 107 h → 40 SAT-M, 1,185 h → 40 SAT-V) come from **Becker
  (1990)**, a peer-reviewed secondary synthesis that I read directly, not from M&J themselves. All
  β conversions in this review inherit that dependency. `03` flags the same gap; it is still open.
- **Full text of Powers & Rock (1999), DerSimonian & Laird (1983), Montgomery & Lilly (2012),
  Jones (1986a), Lievens et al. (2005), Lievens et al. (2007), and the Minnesota validity study.**
  Abstracts only, though for Powers & Rock and DerSimonian & Laird I read substantial verbatim
  excerpts and tables reproduced in the ETS report and in Becker (1990) respectively.
- **Kulik et al. (1984) ES = .82 for high-ability students, Griffin et al. (2013) on UMAT, and
  Domingue & Briggs (2009).** I read **neither abstract nor full text** for these three. They
  appear only as reported inside Hao et al. (2025) and are marked **[C]** throughout. The Kulik
  figure in particular (ES = .82) is large enough that if it were verified and generalisable it
  would materially change §5, so it should not be quoted from this document.
- **Any formal measurement-invariance or DIF study of MCAT preparation effects across
  demographic subgroups.** I could not find one. The claim that African American retesters improve
  less than white retesters traces to a 1994-era analysis cited in a **conference poster**; I did
  not locate the primary source and rate it **[C]**. AAMC's 2020 compendium discusses group
  differences in *scores* extensively but not differential *prep effects*. **This is a genuine gap
  in the literature, not merely a gap in my search**, and it means the team currently cannot
  quantify whether its intervention would widen or narrow subgroup gaps.
- **Any MCAT-specific randomised or controlled trial of any preparation product.** None exists, as
  `03` also concludes. Every conversion to MCAT points in this document is transported from the
  SAT/ACT/general-cognitive-testing literature at the MCAT SD, and inherits whatever
  transportability error that implies. This is stated as a limit, not hedged away: **there is no
  direct MCAT dose-response or efficacy evidence, and every number in the "→ MCAT points" columns
  is a conversion, not a measurement.**
- **The full WWC Procedures and Standards Handbook v5.0.** I read the baseline-equivalence and
  attrition sections and the ESSA tier-alignment materials, not the full 5,000-line handbook. The
  0.05 / 0.25 thresholds and the 350-participant / 2-site requirements are verified; anything
  more procedural should be checked against the handbook directly before a study is designed.

## Sources

Ranked by load-bearing weight in this review.

1. **AAMC, *Using MCAT Data in Medical Student Selection*, 2019, 2022 and 2023 editions.** The
   source of every official SEM, retest and precision value here. 2019 edition is the one that
   labels the bands as 68%. **Tier A.** Read: narrative sections in full via extracted text;
   figures are images and were not read.
   - 2023: https://www.readkong.com/page/using-mcat-data-in-2023-medical-student-selection-aamc-3293629
   - 2022: https://www.readkong.com/page/using-mcat-data-in-2022-medical-student-selection-aamc-1203004
   - 2019: https://www.readkong.com/page/using-mcat-data-in-2019-medical-student-selection-3404055
   - Current edition landing page: https://www.aamc.org/services/mcat-admissions-officers/resources
2. **AAMC, *Summary of MCAT Total and Section Scores*** (annual percentile-rank documents).
   Source of all means and SDs. **Tier A.** Read: mean/SD annotations and sample percentile rows;
   not the full tables.
   - 2022–23: https://students-residents.aamc.org/media/13381/download
   - 2023–24: https://www.aamc.org/media/75901/download
   - Earlier years: /media/8376/, /media/11926/, /media/11881/download
3. **Hao, Z., Baird, J., El Masri, Y., & Double, K. (2025). The Impact of Test Preparation on
   Performance of Large-Scale Educational Tests: A Meta-analysis of Experimental Studies.
   *Review of Educational Research*.** DOI: 10.3102/00346543251360775. The current state of the
   art and the source of the construct-validity moderator table that decides Claim B. **Tier A.**
   Read: extracted full text including abstract, theoretical framing, method, and moderator
   results tables. https://ora.ox.ac.uk/objects/uuid:de68c5d5-26a9-4450-be0d-949e563788a4/files/rhh63sx997
4. **Zhao, X., Oppler, S., Dunleavy, D., & Kroopnick, M. (2010). Validity of Four Approaches of
   Using Repeaters' MCAT Scores in Medical School Admissions to Predict USMLE Step 1 Total
   Scores. *Academic Medicine*.** DOI: 10.1097/ACM.0b013e3181ed38fc. PMID 20881707. The decisive
   MCAT-specific evidence against Claim B. **Tier A.** Read: **abstract only** — no point
   estimates obtained.
5. **Hausknecht, J. P., Halpert, J. A., Di Paolo, N. T., & Moriarty Gerrard, M. O. (2007).
   Retesting in selection: A meta-analysis of coaching and practice effects for tests of
   cognitive ability. *Journal of Applied Psychology*, 92(2), 373–385.** DOI:
   10.1037/0021-9010.92.2.373. The practice-effect floor. **Tier A.** Read: author preprint
   abstract and overall-practice-effects results section.
   https://ecommons.cornell.edu/server/api/core/bitstreams/4fbba765-0d9c-4940-8492-66fecaca5227/content
6. **Briggs, D. C. (2001). The Effect of Admissions Test Preparation: Evidence from NELS:88.
   *Chance*, 14(1), 10–18.** The best-controlled single study and the only coaching source I read
   in full. **Tier A.** Read: **full text.**
   https://www.nepc.colorado.edu/sites/default/files/Briggs_Theeffectofadmissionstestpreparation.pdf
7. **Messick, S., & Jungeblut, A. (1981). Time and method in coaching for the SAT. *Psychological
   Bulletin*, 89(2), 191–216.** DOI: 10.1037/0033-2909.89.2.191. The log-linear dose-response
   form. **Tier A.** Read: **abstract only**; fitted values via Becker (1990).
8. **Becker, B. J. (1990). Coaching for the Scholastic Aptitude Test: Further Synthesis and
   Appraisal. *Review of Educational Research*.** The secondary source for both Messick &
   Jungeblut's fitted values and DerSimonian & Laird's Table 1. **Tier A** as a peer-reviewed
   synthesis; **Tier B** for values it reports at one remove. Read: the sections synthesising both.
   https://gwern.net/doc/statistics/causality/1990-becker.pdf
9. **Powers, D. E., & Rock, D. A. (1999). Effects of Coaching on SAT I: Reasoning Test Scores.
   *Journal of Educational Measurement*, 36(2).** DOI: 10.1111/j.1745-3984.1999.tb00549.x. ETS
   report version DOI: 10.1002/j.2333-8504.1998.tb01784.x. **Tier A.** Read: **abstract plus
   substantial verbatim excerpts** from the ETS report including the effect-estimate ranges and
   multiple-R values.
10. **Jones, R. F. (1986). The effect of commercial coaching courses on performance on the MCAT.
    *Journal of Medical Education*, 61, 273–284.** DOI: 10.1097/00001888-198604000-00001. PMID
    3959045. The only substantial MCAT-specific coaching study, and the empirical basis for the
    CARS-resistance and ability-moderation findings. **Tier A.** Read: **abstract only** (it is
    unusually detailed).
11. **Lievens, F., Reeve, C. L., & Heggestad, E. D. (2007). An examination of psychometric bias due
    to retesting on cognitive ability tests in selection settings. *Journal of Applied
    Psychology*, 92(6), 1672–1682.** DOI: 10.1037/0021-9010.92.6.1672. **Tier A.** Read:
    **abstract only.**
12. **DerSimonian, R., & Laird, N. M. (1983). Evaluating the Effect of Coaching on SAT Scores: A
    Meta-Analysis. *Harvard Educational Review*, 53(1), 1–15.** DOI:
    10.17763/haer.53.1.n06j5h5356217648. Source of the four-to-fivefold design gradient. **Tier
    A.** Read: **abstract**, plus Becker's Table 1 reproducing the model estimates, plus an ERIC
    contemporaneous summary. https://www.harvardeducationalreview.org/content/53/1/1
13. **Jacobson, N. S., & Truax, P. (1991). Clinical significance: A statistical approach to
    defining meaningful change in psychotherapy research. *Journal of Consulting and Clinical
    Psychology*, 59(1), 12–19.** DOI: 10.1037/0022-006X.59.1.12. The RCI and S_diff = √2·SE
    formalism used throughout. **Tier A.** Read: the reliable-change section.
    https://sciences.ucf.edu/psychology/childrenslearningclinic/wp-content/uploads/sites/24/2013/08/Truax-Jacobson-pdf.pdf
14. **AAMC (2020). *Research to Evaluate the Fairness, Use, and Predictive Validity of the MCAT
    Exam Introduced in 2015*** (*Academic Medicine*, March 2020 compendium). Source of the 0.57 /
    0.65 validity coefficients and of AAMC's own cautions on over-reading small differences.
    **Tier A.** Read: selected sections via targeted search of extracted full text.
    https://www.aamc.org/media/43291/download
15. **Institute of Education Sciences, *What Works Clearinghouse Procedures and Standards Handbook
    v5.0*, and the WWC/ESSA tier-alignment materials.** Source of the reporting standard in §7.
    **Tier A.** Read: baseline-equivalence and attrition sections plus the ESSA tier pages; not
    the full handbook.
    - https://ies.ed.gov/ncee/wwc/Docs/referenceresources/Final_WWC-HandbookVer5_0-0-508.pdf
    - https://ies.ed.gov/ncee/wwc/essa
16. **Montgomery, P., & Lilly, J. (2012). Systematic reviews of the effects of preparatory courses
    on university entrance examinations in high school-age students. *International Journal of
    Social Welfare*, 21(1).** DOI: 10.1111/j.1468-2397.2011.00812.x. The most generous credible
    estimate. **Tier B.** Read: **abstract only**; values independently corroborated in Hao et
    al.'s literature review.
17. **Lievens, F., Buyse, T., & Sackett, P. R. (2005). Retest effects in operational selection
    settings: Development and test of a framework. *Personnel Psychology*, 58(4).** DOI:
    10.1111/j.1744-6570.2005.00713.x. Medical-admissions retest validity, including the
    complication noted in §3. **Tier A.** Read: **abstract only.**
18. **AAMC, *Predictive Validity of the New MCAT*** (presentation deck). Source of the .59 / .54 /
    .47 comparison table. **Tier A.** Read: extracted full text.
    https://www.aamc.org/media/18891/download
19. **Jones, R. F., & Vanyur, S. (1986). A comparison of the predictive validity of the MCAT for
    coached and uncoached students. *Journal of Medical Education*, 61(4), 335–338.** DOI:
    10.1097/00001888-198604000-00013. ERIC EJ334544. **Tier: unassignable — result not obtained.**
    Read: ERIC design description only. **Retrieve this.**
20. **A Study of the Validity of the New MCAT Exam (2019). *Academic Medicine*.** PMID 31702690.
    Independent single-site validity estimates. **Tier B.** Read: **abstract only.**
    https://pubmed.ncbi.nlm.nih.gov/31702690/
21. **AAMC, MCAT score-report materials** (`aamc.org/media/35641/download`, score-report and
    confidence-band fact sheets, *A Closer Look* video series descriptions). Corroborating source
    for the confidence-band language. **Tier A** for the AAMC PDF; the students-residents pages
    returned a bot challenge on direct fetch.
22. **Chuck, E. T. (2026). MCAT Score Averaging for Repeat Test-Takers. *Student Doctor Network
    Review*.** DOI: 10.64934/bqv9dq82. Secondary reading of the AAMC retest quartiles/deciles and
    of the Zhao et al. literature. **Tier B** as a secondary source for AAMC figures I could not
    read directly; **Tier C** for its own commentary.
23. **Marshall University, *Predicting Medical Student Success on Licensure Exams*.** Single-site
    adjusted R² = .117. **Tier B.** Read: extracted full text of the results section.
    https://mds.marshall.edu/cgi/viewcontent.cgi?article=1164&context=sm_bm
24. **Briggs, D. C. (2002). *SAT Coaching, Bias and Causal Inference* (PhD dissertation, UC
    Berkeley).** Used for its detailed account of the Powers & Rock model estimates and its review
    of the 32 SAT coaching studies. **Tier B.** Read: targeted sections.
    https://www.colorado.edu/education/sites/default/files/attached-files/Briggs_SAT%20Coaching,%20Bias%20and%20Casual%20Inference.pdf
25. **Prep-vendor and community sources** (prep-company blog on section difficulty; a
    conference poster on MCAT prep-course enrollment rates; a vendor score-increase PDF).
    **Tier C by definition.** Used only where explicitly flagged, and never as the sole basis for
    a conclusion. The vendor score-increase document is cited in `03` as a methodological
    cautionary case, not as evidence.
