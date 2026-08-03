# Market comparators and the hours → score dose-response

Evidence review for the adaptive daily study planner. Two questions: (Q1) how does our
approach compare to what already exists, and what do incumbents actually achieve; (Q2) how
long until a user reaches a decent score, as a defensible dose-response relationship.

Evidence tiers used inline: **A** = strong direct evidence or field consensus; **B** =
reasonable with stated limits; **C** = weak, indirect, or single-source. Marketing and forum
data is **C** by definition. My own arithmetic is marked *[own calculation]*.

---

## Recommendation

**On time-to-score, the team can honestly claim this and no more:** that the product
schedules retrieval practice and question volume in the pattern that the medical-education
literature associates with higher standardized-exam scores, and that it removes the planning
and re-planning overhead that otherwise consumes study time. It can quote the AAMC's own
published retest distribution as the reference class. It **cannot** quote a point gain of its
own until it has run a controlled comparison, because there is no measured causal effect of
any MCAT product in the literature — including the incumbents'.

The load-bearing number: **the median MCAT retest gain is +2 to +4 total points for examinees
whose first attempt was 472–517, and +0 to +1 for 518–528** (AAMC, three successive cohorts,
N ≈ 45,000–48,000 each) **[A]**. That gain is obtained by ordinary retesters with no defined
intervention. Any product claim must clear it. Independently, the psychometric retest
literature predicts a pure practice effect of **≈2.7 MCAT points** from alternate-form
retesting with no learning at all (Hausknecht et al. 2007, corrected d = 0.24, converted at
the MCAT total SD of 11.2) *[own calculation]* **[A for the meta-analytic d, B for the
conversion]*. The convergence of these two numbers is the central finding of this review: the
*median* observed MCAT retest gain is approximately what pure practice effects alone predict.

**Best available hours → score parameters.** There is no published MCAT dose-response study.
The defensible functional form comes from the SAT coaching literature, which is the
best-measured of any high-stakes exam: gains are **logarithmic in study time**, with
arithmetically increasing score gains requiring geometrically increasing contact time
(Messick & Jungeblut 1981) **[A]**. Recommended parameterization:

> Δscore = β · ln(H / H₀), with H₀ ≈ 40–60 hours and **β ≈ 2.5–4.5 MCAT points per
> natural-log unit of study hours** *[own calculation, calibrated — see Dose-response]*

At H₀ = 50 this yields roughly **+3.5 to +6 points at 200 hours, +5 to +9 at 350 hours, and +6
to +11 at 600 hours**, with the honest caveat that doubling hours from 300 to 600 buys only
**+1.7 to +3.1 points** *[own calculation]*. Uncertainty on β is large and asymmetric; it is calibrated,
not estimated, and the underlying data are not MCAT data. Attach a ±4–5 point individual
prediction interval on top, because that is the empirical spread between a stable AAMC
practice average and a real score **[C]**, and note the AAMC's own ±2 point score confidence
band as an irreducible floor **[A]**.

**Most serious competitor on evidence, not marketing: Anki plus a community deck (AnKing /
MileDown / JackSparrow), at $0.** It is the only comparator with peer-reviewed, dose-response
outcome evidence behind its mechanism — an eleven-study systematic review in medical
education, and a specific quantified dose (≈1,700 unique cards per USMLE Step 1 point) **[B]**.
Everything the commercial courses sell is either unmeasured or has been found unsubstantiated.
The commercial threat is not that they have better evidence; it is that **UWorld already ships
an "Adaptive Study Planner" and an "AI-Powered MCAT Tutor" bundled with the question bank
students already buy** **[A, vendor page]** — so adaptive scheduling is not differentiating on
its own.

**The single claim the team should NOT make: a specific point gain attributed to the product,
in any form** — no "average +N points," no "students improve by N," no diagnostic-to-real
comparison. This is not a matter of taste. In April 2024 the BBB National Programs' National
Advertising Division, on a challenge brought by The Princeton Review, recommended Blueprint
discontinue exactly these claims, finding the evidence insufficient to support +15 or +13
point averages and objecting specifically to comparisons that imply official-MCAT-to-official-MCAT
improvement when the baseline was a diagnostic **[A]**. A small company making the same claim
on thinner data is making a legal and reputational bet, not a marketing decision. Secondary
claim to avoid: **"we help low scorers most."** The apparent baseline-dependence in the AAMC
retest data is largely a regression-to-the-mean artifact, and the actual causal literature
points the other way (see DOK 2 #7).

---

## Findings

### Market comparators

I read vendor pricing and guarantee pages in full, the NAD decision in full, the AAMC prep
store product-comparison and percentile documents, and abstracts plus available full text for
the academic sources as noted per-source in `## Sources`.

| Option | Price (2026) | Time commitment | Mechanism relied on | What they claim | What is actually verifiable |
|---|---|---|---|---|---|
| **AAMC Official Prep** | Online-Only Bundle **$323.70**/1 yr; Section Bank $45 ea; Question Packs $15 ea; Question Pack Bundle $76.50; Practice Exams $35 ea **[A]** | Self-paced; 2,710 unique questions + 6 full-lengths | Item authenticity — written by the people who write the real exam | No score-gain claim of any kind | **AAMC publishes no score-gain evidence for its own prep products.** It publishes retest distributions, percentiles, and predictive validity for the *exam* — not efficacy for the *materials*. This is a notable asymmetry: the most credible vendor makes the fewest claims **[A]** |
| **UWorld** | QBank **$339**/90 d, $389/180 d, $439/360 d; Core Prep Course $599; Comprehensive $1,199 **[A]** | Self-paced; 3,000+ questions, 2 full-lengths | Question bank + visual explanations; **now also an "Adaptive Study Planner" and "AI-Powered MCAT Tutor"** | "#1 MCAT QBank, trusted by the majority of students"; "Score higher the first time" **[C, marketing]** | **No published or aggregate outcome data for MCAT.** Reputation is genuine field consensus but is not outcome data. The nearest quantitative evidence is from *Step 1*, not MCAT: UWorld percent-correct correlates r = 0.62 with Step 1 (N = 81) **[B]** — a correlation with attainment, not a gain from use |
| **Anki + community decks** (AnKing ≈6,300 cards; MileDown ≈2,800; JackSparrow ≈7,100) **[B, third-party card counts]** | **$0** (AnkiHub optional ≈$5/mo) | User-set; typically 100–300+ reviews/day over months | Spaced repetition + active retrieval, algorithmically scheduled | Community/author claims only (the JackSparrow author reportedly scored 527) **[C]** | **The strongest evidence base of any comparator, and it is not MCAT-specific.** 2026 systematic review, 11 studies, N = 1,135: Anki use associated with higher Step 1/CBSE/NBME scores, "modest but consistent," dose-dependent, **no randomized study, causality cannot be inferred [B]**. Deng et al. 2015: ≈1,700 unique cards per Step 1 point (β = 5.9×10⁻⁴, p = 0.024) **[B]**. Results on course-based exams are mixed/null **[B]** |
| **Blueprint** | Self-Paced $1,199–$1,499 (from $899 on sale); Live/515+ **$2,999–$3,599** **[A]** | Advertises "about 300 hours over 3–6 months"; 80+ h live instruction on 515+ | Content review + practice + personalized study schedule | "Students average a 15-point increase" **[C, marketing]**; Score Increase Guarantee; 515+ guarantee (515 if diagnostic ≥500, else +15) | **NAD recommended discontinuation of the +15 and +13 average-increase claims (April 2024) [A].** Blueprint's own footnote concedes the study is 596 self-paced purchasers in 2022 who met engagement thresholds, measures Blueprint-exam-to-Blueprint/self-reported-AAMC-practice, "does not measure improvement against official AAMC MCAT results," and "has not been independently verified" **[A — this is Blueprint's own disclosure]** |
| **Kaplan** | On-Demand from $1,599; Live Online from $2,699; **515+ Course $3,599** (sale $3,059–$3,099); Bootcamp $7,299 **[A]** | 42–84 h live instruction; 18 full-lengths | Instructor-led content review + practice | 515+ or +15 points or money back, "conditions apply"; Higher Score Guarantee | **No published outcome study.** The guarantee is a refund contract with completion conditions, not evidence. Note the incentive: a guarantee is cheapest to honour when the baseline instrument reads low — and Kaplan full-lengths have been found to underpredict **[C]** |
| **The Princeton Review** | Self-Paced $1,599–$1,999; Ultimate $2,899; **515+ $3,499**; 515+ Immersion $7,349; Summer Immersion from $13,499 **[A]** | Up to 123 h live (515+/Ultimate), up to 215 h (Summer Immersion) | Instructor-led content review + practice | 515+ or +15 points, tiered partial/full refund by achieved score band **[A, terms page]** | **No published outcome study.** TPR was the *challenger* in the NAD case against Blueprint — the industry polices competitors' claims while publishing none of its own **[A]** |
| **Altius** | Silver **$3,699** / Gold **$4,999** / Platinum **$7,299** **[A]** | 115–150 h live classroom; 15–40 1-on-1 sessions; 20 practice exams | 1-on-1 mentoring + heavy live hours | "90th-percentile or 12-point increase" guarantee for students completing all assignments **[C, marketing]**; "60% less expensive than competitors" | **No published outcome study.** The completion condition is the operative term — it selects the compliant subgroup |
| **Jack Westin** | 515+ Course **$4,599** (sale $3,699–$3,999); Intensive $3,599 (sale $2,699); CARS Strategy $2,599 (sale $1,699) **[A]** | 515+: 16 weeks, 100 h live, **~20 h/week**; Intensive: 8 weeks, 48 h live, ~30 h/week **[A]** | Live instruction + AAMC passage strategy + tutoring | +15 guarantee (515+ course), +10 (Intensive), +5 CARS; "receive a +12 point average" **[C, marketing]** | **No published outcome study.** Guarantee voids on any unmet condition, incl. ≥3 h tutoring, ≥2 JW full-lengths, one full-length per tutoring week with documented review **[A, guarantee page]** |
| **Adaptive / AI-branded entrants** (Milo, Jenova MCAT Tutor, AccelaStudy AI MCAT, StudentAI, Memm) | AccelaStudy **$149/mo**; others undisclosed or subscription **[C]** | Self-paced, auto-recalibrating daily plans | Adaptive scheduling, LLM tutoring, gap diagnosis, spaced repetition; explicitly positioned to sit *on top of* UWorld/Anki/AAMC | "Recalculates your entire plan," "score prediction before you book the exam," "readiness score" **[C, marketing]** | **Zero outcome data across the entire category.** No study, no aggregate, no third-party verification found for any of them. Memm's spaced-repetition-plus-auto-schedule design is the closest direct analogue to our product and publishes nothing **[A — the absence is verifiable]** |

**Prices are list prices captured July 2026 and are heavily and near-permanently discounted;
treat sale prices as the real prices.** Every commercial course above ran a discount at capture
time.

#### The confounding problem, and the number that resolves it

Advertised score gains from prep companies are confounded in at least five separate ways, and
these compound rather than cancel:

1. **Self-selection.** Purchasers are more motivated and better resourced. The 2004 systematic
   review found this uncontrolled across the entire literature **[A]**.
2. **Baseline instrument choice.** The "before" score is usually the vendor's own unproctored
   diagnostic. This is the specific mechanism NAD objected to **[A]**. It is not a neutral
   choice: third-party practice tests systematically underpredict real MCAT scores, so the
   gain is partly manufactured by the ruler. One aggregation of self-reported pairs found
   Kaplan practice tests explained 30% of variance in real scores with slope 0.58, Princeton
   Review 30% with a tendency to underestimate, versus AAMC tests at 44% and slope 0.78 **[C —
   small, old, self-reported, but directionally consistent with everything else]**.
3. **Regression to the mean.** Anyone selected on a low baseline drifts up on remeasurement.
4. **Retest/practice effect.** Quantified below.
5. **Survivorship and completion conditions.** Blueprint's figure covers purchasers "who met
   minimum engagement thresholds of completing at least 155 modules and answering a minimum of
   2,500 questions" **[A, their footnote]**. Every guarantee above voids on incomplete work.
   The reported population is by construction the compliant, persistent subgroup.

**The retest baseline — the single most important number in this half.** AAMC publishes it
annually in *Using MCAT Data in Medical Student Selection*:

| Cohort (Guide year) | N retesters | Median gain, initial 472–517 | Median gain, initial 518–528 |
|---|---|---|---|
| 2016–2018 first attempts (2020 Guide) | 47,335 | **+2 to +3** | 0 |
| 2018–2020 first attempts (2022 Guide) | 48,308 | **+3 to +4** | 0 |
| 2019–2021 first attempts (2023 Guide) | 45,814 | **+2 to +4** | +1 |

All **[A]** — AAMC primary documents, read as extracted text (the box-and-whisker figures
themselves are images; I read AAMC's narrative statement of the medians, not the pixels).

Supporting detail, all **[A]**: about **38%** of examinees in 2019–2021 were retesters. Roughly
**60% improve, ~15% score the same, ~25% score lower** on a second attempt. There is
"considerable variation in the magnitude and direction of score changes." A separate AAMC
percentage table (2015–2016 examinees testing at least twice) shows the full distribution and
confirms substantial mass at both tails — for initial scores 494–497, about 4% dropped 5+
points while about 7% gained 10+. Most importantly for our product: **AAMC states that average
score gains on the second attempt are greater when the time between attempts is greater.**

**So: a product must clear +2 to +4 points to have done anything at all.** Every commercial
+15 claim is being made against a no-intervention baseline of +3.

How much of that +2 to +4 is pure practice, with no learning? The best answer comes from
outside medicine. Hausknecht et al. (2007), meta-analysis of 50 studies, 107 samples, 134,436
participants **[A]**:

- Overall retest effect, corrected: **δ = 0.26** (sample-weighted d = 0.24)
- Alternate forms: **d = 0.24**; identical forms: **d = 0.46**
- With coaching: **d = 0.70**; without: **d = 0.24**
- Second-to-third administration: d = 0.18 — the effect decays
- Larger with *shorter* intervals (median interval only 20 days); the authors read this, plus
  the fact that gains persist across non-identical forms, as evidence the change is not true
  ability change and not mere item memorisation

Converting at the MCAT total SD of 11.2 *[own calculation]*: alternate-form retest d = 0.24 →
**2.7 MCAT points**; corrected δ = 0.26 → **2.9 points**; identical-form d = 0.46 → **5.2
points**. The MCAT uses alternate forms, so **≈2.7 points is the pure-practice estimate**, and
it accounts for essentially the whole of AAMC's observed median retest gain.

Two honest readings, and the team should hold both:

- **(a)** The median retester's gain is almost entirely practice effect, implying near-zero
  marginal return to a typical second round of study. Consistent with the coaching literature,
  implausible on its face.
- **(b)** Retesters are heterogeneous. Many resit quickly with little extra study, dragging the
  median down. The upper quartile gains 6+ and the top decile 9+, concentrated among initial
  scores 486–513 **[B — these quartile/decile figures come from a Student Doctor Network article
  reading them off the AAMC 2020–2022 figures, not from AAMC's own narrative text; I did not
  verify them against the primary figures]**, and AAMC itself ties larger gains to longer
  intervals **[A]**. There is a real high-gain subgroup.

Reading (b) is where the product lives, and it is the honest version of the pitch: not "we add
N points" but "we are trying to move you from the median of that distribution to its upper
quartile." That is a claim about *which part of a published distribution you land in*, which is
both defensible and checkable.

#### What the causal literature on MCAT coaching actually says

- **Jones 1986**, *Academic Medicine* 61(4):273–84 **[A, abstract only — paywalled]**. Two
  studies, repeat and first-time examinees. Coached examinees scored higher on Science
  Knowledge and Science Problems; mixed on Quantitative; **no difference on Reading**. Effect
  estimated to raise an average student's acceptance probability by **5 percentage points**.
  Author's conclusion: coaching "has a limited effect that supports rather than undermines the
  validity of the test." Note this is the pre-2015 MCAT and the design is observational.
- **McGaghie, Downing & Kubilius 2004**, *Teaching and Learning in Medicine* 16(2):202–11
  **[A, abstract plus extensive citing-literature excerpts; not full text]**. Systematic review
  of peer-reviewed and grey literature on commercial prep for MCAT, NBME Part 1, and Step 1.
  Verbatim conclusions: "current research lacks control and rigor"; "the incremental validity
  of the commercial courses on medical examination performance, if any, is extremely small";
  "evidence in support of the courses is weak or nonexistent"; "almost no details are given
  about the form and conduct of the commercial test preparation courses"; "cost-benefit
  analyses of the test preparation courses have not been done." The authors attribute
  commercial success to "evaluation apprehension in the medical profession and aggressive
  marketing practices."

**Twenty-two years later, that conclusion still stands unrefuted, because nobody has run the
study.** That is a commercially useful fact: the entire category competes on marketing because
none of it has evidence, which means a company that actually measures its own effect would hold
something no incumbent has.

### Dose-response

#### What counts as a "decent" score

AAMC percentile ranks in effect **May 1, 2025 – April 30, 2026**, based on 2022–2024 testing
years combined, **N = 293,882** exams **[A]**:

- **All test takers: mean 500.5, SD 11.2** **[A]**. Section means run ≈**124.6 to 125.9** with
  SDs ≈**2.9 to 3.3** **[A; one of the four section means was truncated in my extraction of the
  AAMC document, so I give the verified range rather than per-section figures]**
- **2025 MD applicants: mean 506.3.** **2025 MD matriculants: mean 512.1** (up from 511.8 in
  2024) **[A]**
- Matriculant SD is tight: **6.7** in 2022–23, versus 9.x for applicants **[A]** — the selection
  is real and it compresses the upper distribution
- DO applicants ≈502.4, DO matriculants ≈503.0 **[B, secondary reproduction of AACOMAS data]**

Percentile anchors. AAMC's own document states **74% of scores were ≤508**. A secondary
reproduction of the full AAMC table gives 500 → 49th, 505 → 65th, 506 → 68th, **508 → 74th**,
510 → 79th, 511 → 82nd, 512 → 84th, 515 → 91st, 518 → 95th, 520 → 97th **[B — the 508 → 74th
point matches the AAMC primary source exactly, which gives reasonable confidence in the rest,
but I did not read the primary table row by row]**.

Proposed tiers:

| Tier | Score | Meaning |
|---|---|---|
| Below average | ≤499 | Below the median test taker |
| **Average test taker** | **500** | ≈49th percentile of all examinees |
| **Median applicant** | **506–508** | ≈68th–74th percentile; applying, not necessarily admitted |
| **Median matriculant** | **511–512** | ≈82nd–84th percentile; the real bar for MD admission |
| **Competitive** | **515+** | ≈91st percentile and above |
| Top-tier target | 519+ | ≈96th percentile |

An important framing point for the product: the gap from the average test taker to the median
matriculant is **≈11.6 points** — roughly one full SD, and roughly **three to four times** the
no-intervention retest gain. That is the size of the problem the product claims to help solve,
and it is large.

#### Is there an MCAT hours → score study?

**No. I could not find one, and I do not believe one exists in the peer-reviewed literature.**
What circulates online as "survey data" on hours-to-score is, on inspection, almost entirely
un-sourceable content-marketing. I examined several such tables (residencyadvisor.com,
testpreppal.com, gradpilot.com and similar). They present specific medians and interquartile
ranges — e.g. "510–514: median 290 hours, IQR 230–380," "n ≈ 400 responses" — with **no
published methodology, no instrument, no dataset, and no author**. Several sites present
mutually inconsistent numbers in the same format. **I recommend the team treat these as
unusable, not merely tier C.** They read as synthetic. Citing them would be the fastest way to
put a fabricated number into our own model.

The one genuine artefact of this kind I found is the **UConn pre-med MCAT Study Plan Database**
**[C]**, an institutional collection of self-reported student study plans with diagnostic
scores, actual scores, durations, and spend. It is real, small, unrepresentative, and
self-reported. Illustrative rows: 509 → 519 (+10) over 1.5 months; 501 → 519 (+18) over 1.5
months; 496 → 514 (+18) over 5 weeks; 505 → 505 (0) after "intensely for 4 months"; one student
reporting ~300 hours over 6 months → 518. Reported spend ranges from **$0 to $2,500** with 518s
and 524s appearing at the $0–$200 end. Its honest use is as an existence proof of variance and
of the viability of cheap prep — not as a parameter source.

**Two structural warnings about survey-derived hours data**, either of which is enough to
invalidate a model built on it:

1. **Base-rate inversion.** These tables report *hours conditional on achieved score* —
   E[hours | score]. A planner needs E[score | hours]. These are not interchangeable, and
   substituting one for the other systematically overstates what hours buy.
2. **Survivorship.** They sample people who report a score band. You never hear from the
   student who put in 500 hours and scored 498, so the conditional distribution is truncated
   exactly where the product's honesty matters most.

#### Functional form: logarithmic, with an early knee

The shape question has a real answer, from the SAT literature, which is the best-measured
dose-response of any high-stakes admissions exam.

**Messick & Jungeblut 1981**, *Psychological Bulletin* 89(2):191–216 **[A, abstract only]** —
the load-bearing citation for shape. Exhaustive review of SAT coaching studies. Rank-order
correlation between contact time and score effect **>0.7 for both Verbal and Math** — so time
does matter. But: "The relationship proved to be nonlinear... with arithmetically increasing
amounts of score effect being associated with **geometrically increasing amounts of student
contact time**." And the punchline: "the student contact time required to achieve average score
increases much greater than **20 to 30 points** (on a 200–800 scale) for both SAT-Verbal and
-Math **rapidly approaches that of full-time schooling**."

**Where is the knee?** Early. Briggs, reviewing the SAT literature **[B, full text of the
ERIC-hosted review read]**: "Longer coaching programs result in slightly larger score gains
than shorter programs. **After approximately three to nine hours, additional time devoted to
formal test preparation appears to have diminishing returns.**" And the total effect is small:
"a student enrolling in a formal test preparation program can expect a total score gain of
between **25 to 32 total points** on the verbal and math sections beyond what they could expect
to gain without attending such a program," against programs costing over $750 and requiring up
to 40 hours of instruction plus 10–20 hours of homework.

**Magnitude, from the best-controlled coaching study ever run.** Powers & Rock 1999,
*Journal of Educational Measurement* 36(2), and the underlying ETS report **[A, full text of
the ETS report read]**. Nationally representative sample, >4,000 examinees, ~500 coached, five
competing statistical models (ANCOVA, propensity matching, instrumental variables, Heckman,
Belson) plus raw change:

- SAT-V: **6 to 12 points**; SAT-M: **13 to 26 points**
- Discounting two outlier estimates: **≈6–8 points Verbal, ≈13–18 Math**
- Medians across all analyses: **8 Verbal, 18 Math**
- Authors: effects "are far less than is claimed by major commercial test preparation
  companies," and "by commonly used standards these effects can be regarded as small"

Converting at an SAT section SD of ≈110 *[own calculation, SD assumed not verified]*: d ≈ 0.07
Verbal and d ≈ 0.16 Math; at the MCAT SD of 11.2 that is **≈0.8 and ≈1.8 MCAT points**. Taking
the combined ≈26-point gain against a combined SD of ≈200: d ≈ 0.13 → **≈1.5 MCAT points**.

**Extrapolation risk, stated explicitly.** These conversions are almost certainly *lower
bounds* for the MCAT, and the team should not use them as point estimates. The SAT is
deliberately engineered as a reasoning test with minimal learnable content; the MCAT is
substantially a content examination over biology, biochemistry, general and organic chemistry,
physics, psychology, and sociology. Content can genuinely be learned in a way that SAT-Verbal
reasoning cannot. The direction of the bias is knowable even though its size is not: **MCAT
prep should outperform SAT coaching, by an unknown factor.** Jones's MCAT-specific finding is
consistent with this — the coaching effect appeared on the science subtests and was absent on
reading. What transfers reliably from the SAT literature is the *shape* (logarithmic, early
knee) and the *discipline* (measured effects are far below advertised effects); what does not
transfer is the *level*.

#### Quantitative dose-response from the closest well-studied exam

USMLE Step 1 is the best analogue: same population a few years later, same content-heavy
character, same reliance on question banks and spaced repetition.

**Deng et al. 2015**, *Perspectives on Medical Education*, doi 10.1007/S40037-015-0220-X
**[B, abstract read in full plus its detailed treatment in the 2026 systematic review; not the
full text]**. N = 72 at one institution, multivariate regression on Step 1 score. All students
used practice MCQs (mean **3,870**, SD 1,472). Significant independent predictors:

- **MCQs completed: β = 2.2×10⁻³ per question** → **≈455 questions per Step 1 point**
  *[own calculation]*
- **Unique Anki cards seen: β = 5.9×10⁻⁴** → **≈1,695 cards per Step 1 point**
  *[own calculation; the review states ≈1,700, which matches]*
- Second-year honours (β = 1.198) and MCAT score (β = 1.078)

Translating to the MCAT scale, with the extrapolation risk fully owned *[own calculation;
assumes historical Step 1 SD ≈ 20]*:

- 455 questions ≈ 1 Step 1 point ≈ 0.05 SD ≈ **0.56 MCAT points**
- Completing **UWorld's full 3,000-question MCAT bank** ≈ 6.6 Step 1 points ≈ 0.33 SD ≈
  **≈3.7 MCAT points**
- Working the **AnKing MCAT deck's ≈6,300 cards** ≈ 3.7 Step 1 points ≈ 0.19 SD ≈
  **≈2.1 MCAT points**

These are small, mutually consistent, and consistent with the coaching literature — and each is
in the same range as the no-intervention retest effect. They are also chained across three
assumptions (observational betas as if causal, Step 1 SD, cross-exam SD equivalence) and should
be presented as order-of-magnitude sanity checks, never as product claims.

**Supporting Step 1 evidence:**

- **Giordano, Hutchinson & Peppler 2016**, *Cureus* 8(9):e769, doi 10.7759/cureus.769
  **[B, full text read]**. N = 81, mean Step 1 240.5, mean study time 39.5 days. Step 1
  correlated with CBSE (**r = 0.711**), **UWorld percent-correct (r = 0.622)**, straight-A first
  year (r = 0.356), and financial need (r = 0.318). Model explained 62.3% of variance; each
  UWorld percentage point was worth 0.45 Step 1 points. **Critically: scores were *not*
  correlated with number of days studied, nor with students' own perception of whether they had
  studied enough.** Performance measures predicted; time did not.
- **2026 systematic review** (Frappa et al., *Medical Science Educator*, doi
  10.1007/s40670-026-02643-5) **[B, full text read]**. 11 studies, N = 1,135, 2015–2025.
  Anki use associated with higher Step 1 (241.1 ± 13.2 vs 235.5 ± 17.7, p = 0.012; up to 248.7
  ± 13.3 among consistent users), CBSE, and NBME scores; "modest but consistent"; dose-dependent.
  Winter et al. within it: students with ≥9,390 *matured* cards scored 71.5% vs 60.0% on CBSE
  (p = 0.002), and **matured cards were the only independent predictor** (β = 0.649, R² = 0.427).
  Results on institution-administered course exams were **mixed, including two clear nulls**
  (Levy et al., Sun et al., both p > 0.05). The review's own limitation section is unusually
  candid and should be quoted internally rather than paraphrased: no randomized studies,
  "causality cannot be inferred," and the dose-response "may partly reflect self-selection,
  whereby students with greater baseline academic ability, motivation, or available study time
  are more likely to engage in sustained Anki use."

Two findings in there matter more than the headline for a *scheduling* product. First, the
benefit appears for **standardized, months-long, cumulative exams** and disappears for
short-timeline course exams — the review attributes this directly to whether the preparation
window is long enough for distributed review to operate. The MCAT is the long-window case, so
this is favourable. Second, **matured cards, not cards seen or hours logged, was the only
independent predictor** in the one study that measured all three. The active ingredient is
successful spaced retrieval, not volume and not time. A planner that optimizes for scheduled
retrieval that actually matures is aiming at the right target; one that optimizes for hours
scheduled or cards shown is not.

#### Baseline-dependence: is the gain larger for low scorers?

This determines who the product can honestly claim to help most, so it deserves care. The
answer is **genuinely unresolved, and the intuitive answer is probably an artifact.**

Evidence that gains are larger for low scorers:

- AAMC retest medians: +2 to +4 for initial 472–517 versus +0 to +1 for 518–528 **[A]**
- Largest upper-tail gains concentrated at initial scores 486–513 **[A]**
- Powers & Rock: "effects on math scores appear to be greater for examinees who scored low
  initially" — though they also report that effects "do not vary substantially" by initial
  score level overall **[A]**

Evidence against, or complicating:

- **Regression to the mean mechanically produces exactly this pattern.** Selecting on a low
  first score guarantees an upward drift on remeasurement with no learning whatsoever. The AAMC
  data cannot distinguish this from real differential learning, and AAMC does not claim it can.
- **Jones 1986 points the opposite way**: coaching differences on the science subtests were
  *less* pronounced for examinees with low Reading and Quantitative scores, and for those with
  very low or very high GPAs **[A]**. Read plainly: the students who most need help may benefit
  *least* from content coaching, plausibly because the binding constraint is reasoning and
  reading rather than content recall.
- Powers & Rock also found coaching effects correlated *positively* with high-school grades in
  English and math — "students who had obtained good grades... seemed to benefit slightly more"
  **[A]**.
- The **518–528 ceiling is real** and not an RTM artifact (RTM would predict a *negative* median
  there; observed is 0 to +1). Above ~517 there is very little headroom, both psychometrically
  and in the score scale.

**Honest synthesis:** there is a real ceiling at the top, and there is no trustworthy evidence
of a floor advantage at the bottom. The defensible statement is narrow: *headroom* is larger for
low scorers, because the scale and the percentile distribution leave more room. Whether the
*causal effect of intervention* is larger for them is unknown, and the one MCAT-specific study
that looked suggests it may be smaller.

#### Putting it together: the model, and where it would become dishonest

Recommended structure:

> **E[score] = anchor + β · ln(H / H₀)**, reported with an interval, never as a point

**Anchor.** Use the mean of the last two AAMC full-lengths taken under strict conditions — not a
proprietary diagnostic, and not a single test. AAMC materials are the only practice instrument
with decent correspondence to the real exam (R² ≈ 0.44, slope 0.78, versus ≈0.30 and slope 0.58
for Kaplan) **[C, small self-reported aggregation]**; third-party tests underpredict by 2–4+
points **[C]**. Using our own diagnostic as the anchor is the exact practice NAD sanctioned, and
it would also make our predictions worse. **Design implication: the product should refuse to
report a projected gain measured from its own diagnostic.**

**β ≈ 2.5–4.5 MCAT points per natural-log unit, H₀ ≈ 40–60 hours** *[own calculation]*. This is
**calibrated, not estimated**, and the team must say so. Calibration logic: at 350 hours
(ln(350/50) = 1.95) the model returns +4.9 to +8.8, which lands in the upper-quartile-to-top-decile
band of the AAMC retest distribution (+6 to +9) **[B, per the provenance caveat above]** for a
well-executed second attempt. It reproduces a real published distribution at a plausible dose —
**but note that β inherits the B-tier status of that calibration target.** Implied values
*[own calculation]*:

| Hours | Δ at β = 2.5 | Δ at β = 4.5 |
|---|---|---|
| 100 | +1.7 | +3.1 |
| 200 | +3.5 | +6.2 |
| 350 | +4.9 | +8.8 |
| 500 | +5.8 | +10.4 |
| 600 | +6.2 | +11.2 |

The commercially awkward implication is the honest one: **going from 300 to 600 hours buys
+1.7 to +3.1 points** *[own calculation]*, which is inside the AAMC's own ±2 point confidence
band. The product's value proposition is therefore **"get there faster and more reliably," not
"get further."** The dose-response shape does not support a "get further" claim, and the team
should stop trying to make one — the honest version is commercially better anyway, because
time is the scarce resource for a pre-med with a GPA and clinical hours to maintain.

**Interval.** Attach **±4 to 5 points** for individual prediction. Justification: a stable AAMC
practice average has a mean absolute error around 2 points with 70–80% within ±3 and >90% within
±5 **[C]**, and the AAMC's own reported total-score confidence band is **±2 points** **[A]**,
which is an irreducible floor that exists even with perfect knowledge of true ability.

**Where the model would be dishonest — flag these in the code and the copy:**

1. **Attributing the whole predicted Δ to the product.** ≈2.7 points of any second-attempt gain
   is pure practice effect **[own calculation from A-tier meta-analysis]**. Subtract it, or
   present gains relative to the AAMC retest distribution rather than relative to zero.
2. **Any diagnostic-to-real comparison.** See NAD.
3. **Presenting β as measured.** It is calibrated from adjacent literature. There is no MCAT
   dose-response study.
4. **Extrapolating past ~600 hours**, or below ~50. Outside the range where any of the source
   data lives, and Messick & Jungeblut imply the upper end asymptotes toward full-time schooling.
5. **Promising a specific score, or implying a threshold like 515 is reachable from any
   baseline.** From a 500 baseline the model needs +15, which sits above the top decile of the
   published retest distribution. It happens; it is not a forecast.
6. **Claiming low scorers gain most.** Unsupported, plausibly backwards (Jones 1986).
7. **Hours as the input at all, if we can avoid it.** Giordano et al. found days studied
   uncorrelated with Step 1 while performance measures correlated strongly; Winter et al. found
   matured cards, not study hours, was the only independent predictor. **Hours are what users
   can tell us, but they are a weak causal variable.** A model keyed to retrieval success and
   question volume will be both more honest and more accurate than one keyed to time. If the
   product must accept hours as input, it should convert them to expected retrieval and question
   volume and predict from that.

---

## DOK 1 — established facts

1. MCAT total scale is 472–528; sections 118–132. **[A]**
2. All test takers, 2022–2024 combined (N = 293,882): **mean 500.5, SD 11.2**. **[A]**
3. 2025 MD applicants: mean **506.3**. 2025 MD matriculants: mean **512.1**. **[A]**
4. Matriculant total-score SD ≈ **6.7**; applicant SD ≈ 9.x. **[A]**
5. **74% of MCAT total scores were ≤508** (2022–2024). **[A]**
6. MCAT total scores are reported with a **±2 point confidence band**; sections ±1. **[A]**
7. About **38%** of 2019–2021 examinees were retesters. **[A]**
8. Median retest gain: **+2 to +4** points for initial 472–517; **+0 to +1** for 518–528, across
   three successive AAMC cohorts of ~45,000–48,000. **[A]**
9. On a second attempt roughly **60% improve, 15% tie, 25% decline**. **[A]**
10. AAMC states average second-attempt gains are **greater when more time elapses** between
    attempts. **[A]**
11. Hausknecht et al. 2007: retest effect **δ = 0.26** overall; **0.24** alternate forms, **0.46**
    identical forms, **0.70** with coaching, **0.18** from second to third sitting; effects larger
    at shorter intervals. **[A]**
12. Powers & Rock: SAT coaching worth **6–12 points Verbal, 13–26 Math**; medians 8 and 18;
    "far less than is claimed" by commercial companies. **[A]**
13. Messick & Jungeblut 1981: contact-time/effect relationship is **logarithmic**; gains beyond
    20–30 SAT points require time "approaching that of full-time schooling." **[A]**
14. Briggs: diminishing returns set in after roughly **3–9 hours** of formal SAT prep; total
    expected gain **25–32 combined points**. **[B]**
15. Jones 1986: MCAT coaching effect present on science subtests, **absent on reading**; worth
    ≈**5 percentage points** of acceptance probability; smaller for low reading/quant scorers. **[A]**
16. McGaghie, Downing & Kubilius 2004: incremental validity of commercial medical test prep "if
    any, is extremely small"; supporting evidence "weak or nonexistent." **[A]**
17. **NAD recommended Blueprint discontinue its +15 and +13 average-score-increase claims**
    (April 22, 2024), on a challenge by The Princeton Review. Blueprint said it would comply. **[A]**
18. Blueprint's own footnote: 596 self-paced 2022 purchasers meeting engagement thresholds,
    measured against Blueprint or self-reported AAMC *practice* scores, "does not measure
    improvement against official AAMC MCAT results," "has not been independently verified." **[A]**
19. Deng et al. 2015: **≈1,700 unique Anki cards per Step 1 point**; MCQs completed also an
    independent predictor at **≈455 questions per point**. **[B]**
20. Giordano et al. 2016: Step 1 correlated with CBSE r = 0.711 and **UWorld % correct r = 0.622**;
    **not** correlated with number of days studied. **[B]**
21. 2026 systematic review, 11 studies, N = 1,135: Anki use associated with higher Step 1/CBSE/NBME
    scores, dose-dependent, **no randomized evidence, causality cannot be inferred**; mixed/null on
    course exams. **[B]**
22. Winter et al.: **matured cards** (interval ≥21 days) was the only independent predictor of CBSE
    (β = 0.649, R² = 0.427); ≥9,390 matured cards → 71.5% vs 60.0%. **[B]**
23. AAMC Online-Only Bundle **$323.70**/year, 2,710 unique questions plus practice exams. **[A]**
24. UWorld MCAT QBank **$339**/90 days, 3,000+ questions, and now bundles an **Adaptive Study
    Planner** and **AI-Powered MCAT Tutor**. **[A]**
25. Commercial course list prices: Blueprint $1,199–$3,599; Kaplan $1,599–$7,299; Princeton
    Review $1,599–$13,499; Altius $3,699–$7,299; Jack Westin $2,599–$4,599. **[A]**
26. Jack Westin's 515+ course advertises **~20 hours/week over 16 weeks**; Blueprint cites "about
    300 hours over 3–6 months." **[A]**
27. Kaplan, Princeton Review, Altius, Jack Westin, UWorld, AAMC, and every AI/adaptive entrant
    found publish **no verifiable score-gain outcome data**. **[A — verified absence]**

## DOK 2 — insights and implications

1. **The median MCAT retest gain is approximately equal to the pure practice effect predicted
   from meta-analytic psychometrics** (+2 to +4 observed versus ≈2.7 predicted from d = 0.24 at
   SD 11.2) *[own calculation]*. This does not prove retesters learn nothing — reading (b) above
   is likely — but it does mean **the burden of proof sits entirely on the claimant**. Any
   product asserting a gain must show it exceeds ~3 points, and no incumbent has.
2. **The industry's own regulator has already adjudicated the exact claim we would be tempted to
   make.** The NAD decision is a free, precise specification of what is and is not sayable:
   diagnostic-to-real comparisons must be explicitly qualified as such, the diagnostic must be
   shown to be consistent with real MCAT results, and the sample must be reliable and
   representative. Treat it as a compliance checklist, and note that it was a *competitor* who
   brought the challenge — meaning the enforcement risk here is commercial, not just regulatory.
3. **The vendors' incentives explain the numbers.** A company offering a "+15 or your money
   back" guarantee benefits from a deflated baseline instrument, and third-party diagnostics do
   in fact underpredict real scores by 2–4+ points **[C]**. The guarantee and the advertised
   average are produced by the same mechanism. This is worth saying plainly in positioning
   material because it is verifiable and unflattering to competitors without being an
   unsupported attack.
4. **Anki is the real competitor, and the comparison is unflattering on price and evidence but
   favourable on execution.** It is free, has better outcome evidence than any paid product, and
   has the same mechanism we do. We cannot beat it on evidence or price. What it demonstrably
   does *not* solve is the problem the systematic review keeps surfacing: **implementation.**
   Deck choice, unsuspending by topic, avoiding backlog, integrating question banks, and
   sustaining daily reviews across months. The review explicitly attributes null results in some
   studies to "suboptimal implementation rather than the ineffectiveness of Anki as a tool." That
   sentence is our product thesis, and it is a citation rather than a slogan.
5. **Adaptive scheduling is already commoditized.** UWorld ships an Adaptive Study Planner and
   an AI tutor inside the $339 product students already buy, and at least five AI-branded MCAT
   entrants offer auto-recalibrating plans. "Adaptive" is table stakes, not a differentiator. The
   available differentiators are honesty about expected outcomes, integration with the resources
   students already own (AAMC, UWorld, Anki), and whether the schedule produces *matured*
   retrieval rather than scheduled hours.
6. **The dose-response shape rules out the "get further" pitch and supports "get there faster."**
   With β ≈ 2.5–4.5, doubling 300 hours to 600 yields +1.7 to +3.1 points *[own calculation]* —
   within the AAMC's ±2 confidence band. Efficiency claims are defensible; ceiling-raising claims
   are not.
7. **The "we help strugglers most" claim is the most tempting and least supportable.** The AAMC
   pattern that appears to support it is what regression to the mean produces automatically, and
   the only MCAT-specific coaching study found *smaller* effects among low reading/quantitative
   scorers. The defensible version is about headroom, not effect size.
8. **Time is the wrong input variable and the team should design around that.** Days studied was
   uncorrelated with Step 1 while UWorld percent-correct correlated at r = 0.62; matured cards,
   not study hours, was the sole independent predictor of CBSE. Hours are what users can report,
   so hours must be the interface — but the model underneath should predict from expected
   retrieval success and question volume. This is also a product advantage: a planner sees
   retrieval data that a static schedule cannot.
9. **The long preparation window is a genuine mechanistic argument in our favour.** The
   systematic review found spaced-repetition benefits reliably on months-long cumulative exams
   and unreliably on short-window course exams, attributing the difference to whether there is
   time for distributed review. MCAT preparation is the favourable case. This is the one place
   the team can make a mechanism claim with literature behind it.
10. **Publishing a real effect estimate would be a durable moat.** Twenty-two years after
    McGaghie et al. found the evidence "weak or nonexistent," it still is. A pre-registered
    comparison — even a modest one, even against a waitlist or an unscheduled-control arm —
    would give us the only measured effect in the category. The evidentiary bar is on the floor.
11. **Honest expected-value framing beats point predictions and is cheap to build.** The AAMC
    retest distribution is published with quartiles and deciles. "Users at your baseline who
    complete this plan land here in the AAMC's published distribution" is checkable, legally
    safer, and more useful than a fabricated point estimate.

## What I could not verify

- **The AAMC retest box-and-whisker figures themselves.** I read AAMC's narrative statements of
  the medians and the accompanying Ns from extracted document text; the underlying figures are
  images and I did not read exact quartile values off them. The `aamc.org/media/36216/download`
  PDF returned a bot-challenge page on direct fetch; I relied on its indexed text.
- **Full text of Jones 1986** (paywalled) and **Messick & Jungeblut 1981** (paywalled). Abstracts
  only. Both are load-bearing — Jones for MCAT-specific coaching effects, Messick & Jungeblut for
  the logarithmic form. **Recommend the team obtain both before publishing anything downstream.**
- **Full text of McGaghie, Downing & Kubilius 2004.** I read the abstract plus substantial
  verbatim excerpts quoted in citing literature. The conclusions I quote are verbatim from the
  abstract.
- **Full text of Deng et al. 2015.** Abstract read in full, plus its detailed treatment in the
  2026 systematic review, which independently reproduces the β and the ≈1,700-cards figure.
- **The full AAMC percentile table row by row.** I verified one anchor (508 → 74th) directly
  against the AAMC document and took the remaining rows from a secondary reproduction.
- **Whether any prep company holds unpublished internal outcome data.** Absence of publication is
  not absence of data. Blueprint's disclosed internal study is the only one I could characterize,
  and only because NAD forced its disclosure.
- **The SAT section SD of ≈110** used in my d-conversions. Standard for the recentered SAT but I
  did not verify it against a primary psychometric source. All SAT→MCAT conversions inherit this.
- **The historical Step 1 SD of ≈20** used in the Step 1 → MCAT conversions. Same caveat, and it
  is now moot for current cohorts since Step 1 became pass/fail in 2022 — which also limits how
  much of the Step 1 literature will be extended by future research.
- **Any MCAT-specific hours→score dataset with disclosed methodology.** I looked hard. I do not
  believe one is publicly available.
- **Pricing for most AI/adaptive entrants** (Milo, Jenova, Memm, StudentAI) — not disclosed
  without signup. Only AccelaStudy's $149/mo was visible.
- **Whether the widely-circulated hours-to-score tables have any real survey behind them.** I
  could not find methodology, instruments, authorship, or data for any of them, and they
  contradict each other. I recommend treating them as unusable rather than tier C.

## Sources

Ranked by load-bearing weight.

1. **AAMC, *Using MCAT Data in 2023 Medical Student Selection*** — Figure 11 retest distribution,
   N = 45,814; median gain +2 to +4 (472–517), +1 (518–528); 38% retester rate; confidence bands;
   larger gains with longer intervals. **[A]** Extracted full document text read; figures are
   images. https://www.readkong.com/page/using-mcat-data-in-2023-medical-student-selection-aamc-3293629
   (indexed copy of the AAMC publication)
2. **AAMC, *Using MCAT Data in 2022 Medical Student Selection*** — prior cohort, N = 48,308;
   median +3 to +4 (472–517), 0 (518–528). **[A]** Extracted text read.
   https://www.readkong.com/page/using-mcat-data-in-2022-medical-student-selection-aamc-1203004
3. **AAMC, *Data on Retaking the MCAT*** (2020 Guide, Figure 9) — N = 47,335; median +2 to +3
   (472–517), 0 (518–528). **[A]** Indexed text read; direct PDF fetch blocked.
   https://www.aamc.org/media/36216/download
4. **Hausknecht, Halpert, Di Paolo & Moriarty Gerrard (2007). "Retesting in selection: A
   meta-analysis of coaching and practice effects for tests of cognitive ability." *J Appl
   Psychol* 92(2):373–385.** doi:10.1037/0021-9010.92.2.373 — δ = 0.26; moderators. **[A]**
   Abstract read plus the Cornell eCommons author manuscript and an *Annual Review of
   Organizational Psychology* review summarizing all four moderator findings.
   https://ecommons.cornell.edu/server/api/core/bitstreams/4fbba765-0d9c-4940-8492-66fecaca5227/content
5. **BBB National Programs / National Advertising Division (April 22, 2024). "NAD Recommends
   Blueprint Test Preparation Discontinue Certain MCAT Score Improvement Claims."** **[A]** Full
   press release read. https://bbbprograms.org/media/newsroom/decisions/blueprint-test-preparation
6. **Powers & Rock (1999). "Effects of Coaching on SAT I: Reasoning Test Scores." *J Educ Meas*
   36(2).** doi:10.1111/j.1745-3984.1999.tb00549.x, with the underlying ETS report
   doi:10.1002/j.2333-8504.1998.tb01784.x — 6–12 V / 13–26 M; five models; baseline-dependence
   appendix. **[A]** ETS report full text read.
7. **Messick & Jungeblut (1981). "Time and method in coaching for the SAT." *Psychol Bull*
   89(2):191–216.** doi:10.1037/0033-2909.89.2.191 — logarithmic dose-response; rank-order
   correlation >0.7; full-time-schooling asymptote. **[A]** **Abstract only.**
8. **McGaghie, Downing & Kubilius (2004). "What is the Impact of Commercial Test Preparation
   Courses on Medical Examination Performance?" *Teach Learn Med* 16(2):202–211.**
   doi:10.1207/s15328015tlm1602_14 — "weak or nonexistent." **[A]** Abstract plus verbatim
   excerpts in citing literature; **not full text.**
9. **AAMC, *Summary of MCAT Total and Section Scores*, percentile ranks effective May 1, 2025 –
   April 30, 2026** — mean 500.5, SD 11.2, N = 293,882; 74% ≤508. **[A]** Extracted text read.
   https://students-residents.aamc.org/media/18846/download
10. **Frappa, Chernov, Dillon & Alben (2026). "Anki Use and Academic Performance in Medical
    Education: A Systematic Review of Evidence and Learning Theory." *Med Sci Educ.***
    doi:10.1007/s40670-026-02643-5 — 11 studies, N = 1,135; dose-dependence; matured-cards
    finding; candid limitations. **[B]** **Full text read.**
11. **Deng, et al. (2015). "Student-directed retrieval practice is a predictor of medical
    licensing examination performance." *Perspect Med Educ.*** doi:10.1007/S40037-015-0220-X —
    ≈1,700 cards/point; ≈455 MCQs/point. **[B]** Abstract read in full plus detailed secondary
    treatment; **not full text.** https://pmejournal.org/articles/10.1007/S40037-015-0220-X
12. **Giordano, Hutchinson & Peppler (2016). "A Predictive Model for USMLE Step 1 Scores."
    *Cureus* 8(9):e769.** doi:10.7759/cureus.769 — UWorld r = 0.622; **days studied not
    correlated.** **[B]** **Full text read.**
13. **Jones (1986). "The effect of commercial coaching courses on performance on the MCAT."
    *Acad Med* 61(4):273–284.** doi:10.1097/00001888-198604000-00001 — 5-percentage-point
    acceptance effect; no reading effect; smaller effects for low reading/quant scorers. **[A]**
    **Abstract only.** https://pubmed.ncbi.nlm.nih.gov/3959045/
14. **AAMC MCAT Official Prep product comparison and store pages** — all list prices, question
    counts, bundle composition. **[A]** Full pages read.
    https://store.aamc.org/mcat-prep/aamc-mcat-official-prep-product-comparison.html
15. **AAMC, "U.S. medical schools enroll record number of students in 2025"** — applicant mean
    506.3, matriculant mean 512.1. **[A]** Read.
    https://www.aamc.org/news/us-medical-schools-enroll-record-number-students-2025
16. **AAMC Table A-16** — applicant/matriculant means and SDs including matriculant SD 6.7. **[A]**
    Extracted text read. https://www.aamc.org/media/74101/download?attachment=
17. **Blueprint MCAT online-course page and Guarantees page** — pricing, "300 hours over 3–6
    months," and the full methodological footnote conceding no official-MCAT measurement and no
    independent verification. **[A as a record of their own claims]** Full pages read.
    https://blueprintprep.com/mcat/online-course · https://blueprintprep.com/guarantee
18. **UWorld MCAT QBank and overview pages** — $339/$389/$439, 3,000+ questions, Adaptive Study
    Planner, AI-Powered MCAT Tutor, no outcome data. **[A as a record of claims and of absence]**
    Full pages read. https://gradschool.uworld.com/mcat/question-bank/ · https://gradschool.uworld.com/mcat/
19. **Kaplan 515+ and course pages; Princeton Review MCAT guarantee page; Jack Westin 515+,
    offers and guarantee pages; Altius mentoring page** — prices, guarantee structures, weekly
    hour commitments, completion conditions. **[A as records of claims]** Read.
    https://www.kaptest.com/mcat/courses/score-515-mcat · https://www.princetonreview.com/medical/mcat-guarantee
    · https://jackwestin.com/guarantee/ · https://altiustestprep.com/mcat-prep/mcat-mentoring/
20. **AAMC MCAT score-report explainer (14-231)** — ±2 point total-score confidence band. **[A]**
    Extracted text read. https://www.aamc.org/media/35641/download
21. **Briggs, "Coaching and the SAT I"** (ERIC ED562660) and **Briggs meta-analysis** — 3–9 hour
    knee; 25–32 combined points; nonlinearity confirming Messick & Jungeblut. **[B]** Full text
    read. https://files.eric.ed.gov/fulltext/ED562660.pdf ·
    https://www.colorado.edu/education/sites/default/files/attached-files/Briggs_Meta-Analysis.pdf
22. **AAMC, "Changes in MCAT Total scores between first and second attempts"** (2015–2016
    examinees, percentage distribution table). **[A]** Table read.
    https://students-residents.aamc.org/media/8496/download
23. **UConn pre-med MCAT Study Plan Database** — self-reported diagnostic/actual pairs, durations,
    spend $0–$2,500. **[C]** Extracted text read.
    https://premed.media.uconn.edu/wp-content/uploads/sites/216/2024/10/MCAT-Study-Plan-Database.pdf
24. **Student Doctor Network, "MCAT Score Averaging for Repeat Test-Takers"** — reads upper-quartile
    (+6) and top-decile (+9) retest gains off the AAMC 2020–2022 figures by initial-score band.
    **[B]** Load-bearing for the β calibration target. Read.
    https://forums.studentdoctor.net/threads/sdn-article-mcat-score-averaging-for-repeat-test-takers-the-case-for-a-better-admissions-standard.1516635/
25. **StudentDoc practice-test predictability aggregation** — AAMC R² = 0.44/slope 0.78; Kaplan
    R² = 0.30/slope 0.58; TPR underestimates. **[C]** Read. https://studentdoc.com/practice-mcat/
26. **Third-party Anki deck audits** (Lacunos, TestPrepPal) — card counts for AnKing ≈6,300,
    MileDown ≈2,800, JackSparrow ≈7,100. **[C]** Read. https://lacunos.com/decks/mcat/anking-vs-miledown/
27. **AI/adaptive entrant marketing pages** — Milo (askmilo.io), Jenova, AccelaStudy
    ($149/mo), Memm, StudentAI. **[C, marketing]** Read, to establish feature claims and the
    absence of outcome data. https://askmilo.io/ · https://mcat.accelastudy.ai/ · https://memm.io/
28. **Hours-to-score "survey" content farms** (residencyadvisor.com, testpreppal.com,
    gradpilot.com, and similar). **Cited here only to recommend against use.** No disclosed
    methodology, instrument, authorship, or dataset; mutually inconsistent figures. **Below C —
    treat as unusable.**
