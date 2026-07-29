# Acquiring Calibration Data for a 2,108-Item MCAT Bank with Zero Response Data

**Scope of this document.** How to actually *acquire* the response data needed to estimate item difficulty: designs, populations, costs, timelines, and what to instrument before launch. It does **not** cover how to predict difficulty from item features (LLM-based or explanatory IRT / LLTM approaches), how to specify the IRT model itself, or how to build the mastery model — those are separate lanes.

**Research date.** All web sources observed **2026-07-28** unless otherwise noted. Platform prices change; every price below carries its observation date and the publication date of the page it came from.

**Evidence tiers used throughout.**

- **A** — strong direct empirical evidence, authoritative program documentation, or settled psychometric consensus.
- **B** — reasonable evidence with real limits (single simulation study, indirect population, older source still widely cited).
- **C** — weak, indirect, single-source, secondary commentary, or my own transfer of a number from a different context.

Where I read only an abstract, the source list says so explicitly. Every arithmetic model below states its assumptions and shows its working so you can change an input and redo it.

---

## Executive answer

1. **Do not attempt to buy a full-bank calibration. It is not a budget problem, it is a feasibility problem.** At a defensible target of 250 responses per item, 2,108 items needs 527,000 item-responses ≈ 12,400 participant-hours ≈ 17,600 participants at 30 items each. On Prolific at the recommended $12/hr that is **≈ $213,000** and would consume **~13% of Prolific's entire 90-day-active US pool**. At 500 responses/item it is ~$427,000 and ~26% of the US pool. Full-bank paid calibration is off the table for a few-person team.

2. **Buy the *scale*, not the *bank*.** Spend a small, bounded amount on a rigorously calibrated **spine** — a 150-item linking set spanning the full difficulty range and all 15 content clusters — at high responses-per-item. Everything else is later calibrated *against the fixed spine* using **fixed-parameter calibration (FIPC)**, which recent MST-specific simulation work found performs about as well as separate calibration with **double** the sample size, letting a program relax an N = 1,000 requirement to N > 500 (Guo et al., 2025; Tier B). All-in budget (including 15% attrition and 15% anchor overhead): **≈ $11k for a 60-item routing spine at 400 responses each**, **≈ $31k for the full 150-item spine at 400**, or **≈ $21k for 150 items at 250**.

3. **The single highest-leverage decision is free: launch the diagnostic in non-adaptive, spiralled-form mode first, then switch adaptivity on.** Random (or BIB-spiralled) item assignment makes the resulting response matrix missing-at-random-by-design, which is exactly what concurrent IRT calibration needs — and makes even plain proportion-correct an unbiased difficulty estimate. Under *adaptive* selection, proportion-correct **fails** (Pelánek, *Computers & Education*; year not verified — see Sources; Tier B). This converts your first cohort into a calibration sample at zero marginal cost. It cannot be retrofitted.

4. **Use a BIB / block-overlap design, not a dedicated anchor block.** 2,108 factors cleanly as **124 blocks × 17 items**. A cyclic booklet design (booklet *j* = block *j* + block *j*+1, 34 items) links every item onto one scale with **zero anchor overhead**; adding a 6-item spine anchor to every booklet (15% anchor proportion) costs only a **1.18× inflation** in responses and buys robustness. A dedicated 20-item anchor block on a 37-item booklet wastes 54% of your spend — **2.2× worse** for the same responses-per-item.

5. **Anchor sets can be much smaller than the classic "20 items or 20%" rule when you use FIPC + block overlap.** A 2026 simulation varying anchor-item proportion found item-difficulty recovery jumps sharply from 5% → 10% anchoring and then plateaus by 20% (Tier B). Budget 10–20% of booklet length as anchors; 5% is demonstrably inadequate; >25% is waste.

6. **Paid crowdworkers are a poor proxy for motivated MCAT candidates, and the bias is the same magnitude as your routing resolution.** Motivated examinees outperform unmotivated ones by **0.59 SD** on average (Wise & DeMars, 2005; Tier A). Rapid guessing occurs in ~28% of examinees and ~7% of responses in low-stakes testing (Rios et al., 2022; Tier A), and ignoring it biases item difficulty **upward by 0.30–0.55 logits** (Rios, 2023; Tier B). Meanwhile ~9% of Prolific participants show AI-assisted responding (Tier B) and ChatGPT scores **522 / 99th percentile (90.9% accuracy)** on an official AAMC full-length (Tier B, abstract only) — biasing hard items *downward*. Your 3-way routing strata are only **~0.97 logits apart**. A 0.3–0.6 logit systematic distortion is **30–60% of the gap between adjacent difficulty strata.** This is the strongest argument in this document for recruiting real premeds instead of generic crowdworkers.

7. **MTurk is closed to new customers as of 2026-07-30 — two days from now.** Observed directly on mturk.com/pricing 2026-07-28 (Tier A). If MTurk was in your plan, it is gone unless you already have an account. Prolific and CloudResearch Connect are the live options; Connect is ~20–25% cheaper per response.

8. **The public landing page is a validation instrument, not a calibration instrument.** With a plausible 350 snapshot-completions/month it would take **~10 years** to reach 250 responses/item across the bank, and it would require publishing the whole bank publicly. What it *can* do: classical p-values and distractor diagnostics on a small rotating **sacrificial** set, plus an early reality-check on whether your expert difficulty ordering survives contact with real people. It requires a server-issued per-sitting `response_set_id` — no login or persistent cookie needed — or you get no person-level scale at all. With one, 12 items yields θ with SE ≈ 0.58 logits: noisy, but not zero.

9. **Organic-only is a 1–4 year path unless you reach low-thousands of weekly-active learners.** With 500 weekly-active learners answering 40 items/week and a 25% seeding slot, the ~1,968-item tail takes **~98 weeks** to reach 250 responses/item. Adaptive delivery makes this worse than the average implies: greedy selection starves the tail entirely. Fix with a mandatory random under-exposed seeding slot in every session plus Sympson-Hetter or randomesque exposure control.

10. **Recommended staged plan (details in §7):** *Stage 0 (now, ~$0)* instrument the event log, item versioning, millisecond latencies, selection-rule provenance, consent language, and a pinned reference form. *Stage 1 (~2–4 wks, $11k Prolific / $15k direct-premed)* paid calibration of a 60-item routing spine with real premeds recruited directly, not generic crowdworkers. *Stage 2 (~4–8 wks, +$20k / +$27k)* extend to a 150-item full spine spanning all clusters. *Stage 3 (launch + ongoing, ~$0)* non-adaptive spiralled delivery for the first cohort, then FIPC the tail against the fixed spine with a permanent seeding slot. *Stage 4 (ongoing, ~$0)* Elo/streaming provisional difficulties for uncalibrated items, drift monitoring against the pinned reference form, periodic batch recalibration. Total cash: **≈ $31k (Prolific) to $43k (direct premed)** at R = 400, or **≈ $21k–$28k** if you accept R = 250 — spread over ~2–3 months, versus ~$245k+ and an infeasible recruitment requirement for the naive full-bank study.

---

## Findings

### 1. How real testing programs bootstrap a new item bank

The universal answer is: **they never calibrate a bank from scratch on volunteers if they can avoid it. They parasitise an operational test.** New items ride along on live administrations, unscored, disguised among scored items.

#### Seeding ratios in practice

| Program | Form composition | Pretest ratio | Source tier |
|---|---|---|---|
| **NAVLE** (veterinary licensure) | 360 four-option MC items: **300 scored + 60 pretest** | **16.7%** | A (California VMB program review) |
| **USMLE / NBME** | Unscored "experimental" items embedded in Step exams; commentary reports **"up to 25% of some test forms"** | up to ~25% (Tier C for the 25%) | A that they exist (FSMB annual report: "Some unscored items and cases may also be included… for research purposes"); C for the ratio |
| **AAMC MCAT** | Each of the four sections "includes some 'field-test' questions… that do not count toward your score." AAMC **explicitly refuses to disclose the count** and forbids examinees from speculating about which items are field-test | disclosed as nonzero; **count not public** | A (MCAT Essentials for Testing Year 2026) |
| **Prometric** (general credentialing guidance) | Recommends pretest items **not exceed 10%** of total items, to avoid fatigue and avoid extending testing time | **≤10%** | A (vendor best-practice guidance) |

Note the tension: Prometric's ≤10% is a *comfort* constraint, NAVLE's 16.7% and USMLE's reported ~25% are *throughput* constraints. A program that needs to replenish faster tolerates more pretest load. **You need to replenish 100% of a 2,108-item bank, which is why no operational seeding ratio can save you on its own** — you have no operational test to seed into.

#### Responses per pretest item that programs target

| Threshold | Purpose | Source | Tier |
|---|---|---|---|
| **100 exposures minimum** | classical test theory statistics, "to evaluate statistical viability"; more exposures increase stability and generalisability | Prometric best practices | A |
| **100 "hits" minimum** to calibrate an experimental item; **30 sufficient** for continued monitoring once active | Rasch calibration in an operational credentialing program | NBCRNA 2025 item-writing guidelines | A |
| **"a few hundred to a couple of thousand"** examinees per pretest item | USMLE pretesting | secondary commentary by a physician author | C |
| **500 examinees + 20 items** adequate for 2PL/3PL-with-fixed-c *if* θ is near-normal and items discriminate well; **1,000 + 40 items** the cautious guideline if θ is non-normal, items discriminate poorly, or c is freely estimated | IRT textbook data-requirements chapter | DeMars (2010), Oxford | A (widely-cited consensus; abstract read only) |
| **500 (2PL) / 1,000 (3PL)** commonly recommended | restated as the standard heuristic | De Ayala, via Rothe et al. equating study | A as a heuristic |
| Heuristics are **context-dependent and should be replaced by a Monte Carlo simulation for your own design** — as few as 100 can work with informative priors; models with slip/guess parameters can need >2,000 | methodological tutorial | Schroeders & Gnambs (2025), *AMPPS* | A |

**Practical reading for this team:** 100 responses/item is the floor for *classical* p-values and flag-the-broken-item screening. 250 is a defensible working target for difficulty-only (Rasch/1PL-ish) estimation. 500 is the target if you want trustworthy 2PL discriminations, and 1,000+ if you want a freely-estimated 3PL guessing parameter. Since the stated need includes an **IRT slip term in a mastery model**, you are implicitly in 3PL-ish territory for at least part of the bank — which is exactly where sample-size demands explode. Strong recommendation: **fix or tightly prior the guessing parameter at ~0.25 (four options) rather than estimating it**, and reserve free estimation for the spine only. The 3PL literature is explicit that identifying c "relies on responses from the fewest examinees" and that Bayesian informative priors on c are strongly recommended below 1,000 (Tier B, calculator-documentation source).

#### Cycle time

For seeded pretesting, cycle time is set by administration volume, not by statistics. NAVLE-type programs pretest during regular administrations, review with SMEs and a committee, revise or discard, then promote to scored — a cycle measured in **administrations (months to a year)**, not weeks (Tier A for the process, C for any specific duration). Prometric explicitly notes that in-form pretesting tests **fewer** items per cycle than separate pretest forms, so "a protocol must be established to rotate pretest items in a reasonable timeframe."

#### Standalone field tests with volunteers or paid examinees

Prometric describes this as the alternative methodology: pretest items "administered to volunteer candidates" on separate forms. Its stated drawbacks are the ones that matter to you: **contamination of the candidate pool** (volunteers have now seen live items) and **lengthy recruitment time** (Tier A). Both apply directly:

- Any item you show to a paid crowd sample is, for security purposes, **published**. Assume it can be captured.
- Recruitment is the binding constraint, not money, once you need thousands of a specific population.

**Conclusion for §1:** operational seeding is the industry answer and you cannot use it yet, because you have no operational test. The industry practice you *can* borrow immediately is the **hybrid**: run a small standalone field test to create a calibrated spine, then convert your own product launch into the "operational test" you seed into.

---

### 2. Sparse-matrix and planned-missingness designs

This is the section that changes what is affordable, so it is worked through concretely.

#### The three linking mechanisms

**(a) Common-item non-equivalent groups (CINEG / NEAT).** Two groups of unlike ability take different forms that share a set of common (anchor) items. The anchor set is what separates *form difficulty differences* from *group ability differences*. Anchors can be **internal** (embedded and scored) or **external** (a separate section, usually not counted in reported scores). Standard practice is that the anchor be a **"minitest"** — its mean and spread of item difficulty roughly matching the total test — and that anchors keep their position across forms and be free of DIF (Tier A; Angoff, Kolen & Brennan, Dorans, via the ERIC anchor-choice paper and the Buros licensure chapter).

**(b) Balanced incomplete block (BIB) with spiralling.** NAEP's approach since 1984 and the canonical planned-missingness design (Tier A, NCES technical documentation). Items are grouped into **blocks** sized to a fraction of session time; blocks are assembled into **booklets** such that each block appears equally often **in each booklet position** and each block is **paired with every other block** equally often. Booklets are then **spiralled** — interleaved in distribution order so any group of examinees receives approximately equal proportions of each booklet. NCES's five-block example: 10 booklets, blocks A–E, each block appears twice in each of the two positions, each pair (A,B), (A,C), … appears exactly once. The stated payoff: NAEP obtains "precise results for each test question while generally consuming an average of about an hour and a half of each student's time," for a pool of "several hundred questions." When not all pairs can be crossed, NAEP uses **pBIB** (partially balanced).

Two things BIB buys you that plain random assignment does not: **position balance** (controls fatigue/position effects, which are real — Wise et al. found item length and item position moderate differential effort on low-stakes tests, Tier B) and **guaranteed connectivity** of the item-by-person incidence graph.

**(c) Concurrent calibration and fixed-parameter calibration (FIPC).** Rather than calibrating each form separately and then transforming scales (mean-sigma, mean-mean, Stocking-Lord), you calibrate **all forms in one run** on the sparse matrix. FIPC goes further: **fix** the parameters of already-calibrated items and estimate only the new ones, eliminating the scaling step entirely (Tier A for the method; Wainer & Mislevy, Ban et al., Kim).

The MST-specific evidence is directly on point for this team's 7-stage design. Guo et al. (2025, *Journal of Educational Measurement* / ETS, read in substantial part) simulated small-sample item calibration in an operational MST program and found (Tier B, single program, simulated):

- **FIPC beat both separate-calibration-with-Stocking-Lord-scaling and a new MDIA-matching approach** for new items, across N = 250 / 500 / 1,000 and across skewed and normal ability distributions.
- **"The performance of FIPC was generally as accurate as that from separate calibrations with a doubled sample size."**
- **"The sample size requirement (for example, N = 1,000) could be relaxed (say, N > 500)"** if the program switches to FIPC.
- The recommendation is to **fix only the routing-block items** as anchors, because target-block items are "very unstable when sample sizes were small because of missing data by design." Fixing the routing block alone also satisfies the requirement that anchors be **≥20% of the items in the transformation** (their citation: Kolen & Brennan, 2004).
- Concurrent FIPC **combining data from multiple administrations** further improved new-item accuracy.

This maps onto your architecture with almost no translation: **your 7×20 MST has a stage-1 routing module. Calibrate that module properly and expensively; fix it; FIPC everything else against it.**

#### Worked allocation for 2,108 items

**Arithmetic identities.** Let

- `I` = number of items to calibrate = 2,108
- `R` = target responses per item
- `k` = items per booklet (session)
- `a` = fraction of booklet length occupied by anchor items
- `N` = participants required
- `T` = total item-responses collected

Then:

```
operational slots per booklet   = k(1 - a)
booklets needed to cover bank   = I / [k(1 - a)]        (per "wave")
N  = R · I / [k(1 - a)]
T  = N · k = R · I / (1 - a)
efficiency = (1 - a) = fraction of purchased responses that land on target items
cost inflation vs. theoretical minimum = 1 / (1 - a)
```

**2,108 factors as 124 × 17**, which is convenient: 2,108 = 2² × 17 × 31, so 124 blocks of 17, or 68 blocks of 31, or 62 blocks of 34 are all exact.

**Design B1 — pure BIB cycle, zero anchor overhead.**

- 124 blocks of 17 items: B₁ … B₁₂₄.
- Booklet *j* = (B_j, B_{j+1 mod 124}), for *j* = 1…124. Booklet length **k = 34** items.
- Each block appears in exactly **two** booklets, once in position 1 and once in position 2 → **position-balanced**.
- The block-adjacency graph is a **124-cycle**: connected, so a single concurrent calibration places all 2,108 difficulties on **one** scale. `a = 0`, efficiency 100%.
- For R = 250: each item is seen in 2 booklets, so 125 participants per booklet → **N = 124 × 125 = 15,500**, T = 15,500 × 34 = **527,000 = 2,108 × 250** exactly. No waste.
- **Weakness:** a cycle has no redundancy. Any single weak link (a block whose two neighbours share little information, or a booklet that under-recruits) propagates scale drift around the ring. Chain equating error accumulates along the chain. Do not ship this bare.

**Design B2 — dedicated anchor block (the wasteful extreme, shown for contrast).**

- Booklet = a 20-item anchor block + one 17-item operational block → k = 37, `a = 20/37 = 54%`.
- Efficiency 46%, inflation **2.17×**. For R = 250 on operational items: N = 250 × 2,108 / (37 × 0.46) = **31,000 participants**, T = **1,147,000 responses** — more than double B1 for the same result.
- **This is the mistake to avoid.** The classical "20 items or 20% of test length, whichever is longer" rule (Angoff 1971/1984; Tier A as a rule of thumb) was written for *pairwise chain equating of full-length tests*, where the anchor is a small fraction of a 60–80-item form. Applied naively to a 34–40-item booklet it demands 20 anchors and destroys your efficiency.

**Design B3 — hub-and-spoke, recommended.**

- Booklet *j* = 6 spine anchor items (drawn from the paid-calibrated spine, **parameters fixed**) + B_j (17) + B_{j+1} (17) → **k = 40**, `a = 6/40 = 15%`.
- Efficiency 85%, inflation **1.18×**. For R = 250: T = 527,000 / 0.85 = **620,000 responses**, N = 620,000 / 40 = **15,500 participants** (same N as B1 — you buy the robustness with 6 extra items per session, not with more people).
- The spine anchors are on **every** booklet, so the design is a hub (spine) plus a ring (block cycle): doubly connected, and the origin and unit of the scale are pinned by fixed spine parameters rather than propagated around a chain.
- Because spine parameters are **fixed** in FIPC, you are not doing pairwise equating at all, which is why the 20-item Angoff rule over-specifies here.

**Efficiency comparison at R = 250:**

| Design | k | anchor frac. | efficiency | responses T | participants N | inflation |
|---|---|---|---|---|---|---|
| B1 pure BIB cycle | 34 | 0% | 100% | 527,000 | 15,500 | 1.00× |
| **B3 hub-and-spoke (recommended)** | **40** | **15%** | **85%** | **620,000** | **15,500** | **1.18×** |
| B2 dedicated 20-item anchor block | 37 | 54% | 46% | 1,147,000 | 31,000 | **2.17×** |

#### Minimum anchor-set size — what the evidence actually says

Two bodies of evidence, and they disagree in a way that matters.

**Classical rule of thumb (Tier A as a convention, not as an optimum):** "the common-items link should be roughly 20% the length of the total test or 20 items, whichever is longer" (Angoff 1971/1984, restated in the Buros licensure chapter). Coffman (1971) similarly: 20 items, or ≥20% if that exceeds 20.

**Empirical/simulation evidence that shorter works (Tier B):**

- The Buros chapter's own review: for conventional equating, "lengths over 20 items seem not to have an advantage if the examinee groups are similar in ability"; for IRT, "some researchers have reported that much shorter anchor tests (as few as two or five well-chosen items) work well (Raju et al., 1986; Vale, 1986)," while others suggest 15–20 (Hills et al., 1988; Wingersky et al., 1986). Its verdict: "in light of the equivocal results regarding length, the 20% guideline still seems sensible."
- Hills et al. (1988), via Rothe et al.: equating worked with 10, 15, 20, 25, 30 anchors but **failed with 5**.
- Yang & Houang (1996), via Rothe et al.: 12, 20, and 30 anchors on a 60-item set gave **similar** results.
- A Rasch CINEG bootstrap study concluded "reasonably accurate IRT equating for the CINEG design can be achieved with an anchor size of 20 or 20% of the total items… increasing anchor test sizes does not contribute further to lowering the SEE and RMSE significantly, indicating the length of the anchor tests is **not the most critical factor**… more investigation can be focused on the **quality** of the anchor items."

**The most directly useful numbers I found** come from a 2026 simulation (Rothe et al., *Frontiers in Psychology*; I read the abstract, results tables, and discussion) that crossed anchor-item proportion (5/10/15/20/25%), test-set size (20/40/60/80), IRT model, guessing probability, and sample size (25/50/100/500/1,000). For **item difficulty** recovery, marginal means:

| Anchor item proportion | r(true, est) | RMSE | MAE |
|---|---|---|---|
| 5% | 0.83 | **15.74** | 9.77 |
| 10% | 0.83 | **6.66** | 3.97 |
| 15% | 0.81 | 6.86 | 3.79 |
| 20% | 0.80 | **5.44** | 2.75 |
| 25% | 0.78 | 5.86 | 3.13 |

| Sample size n | r(true, est) for difficulty | RMSE |
|---|---|---|
| 25 | **0.42** | 31.46 |
| 50 | 0.63 | 18.53 |
| 100 | **0.82** | 3.53 |
| 500 | **0.97** | 0.53 |
| 1,000 | 0.98 | 0.36 |

Caveats I must state: these are *equating-recovery* indices, not raw calibration accuracy; the RMSE column's units are not obviously logits and I did not verify the scaling, so **treat the RMSE values as relative, not absolute**. The correlations are interpretable and are the numbers I would lean on. The authors also report that increases in anchor proportion and test-set size are **logarithmic, not linear** ("diminishing marginal utility… small item sets benefit more from additional items than larger item tests") and that the two **partially compensate for each other**. They also found ≥100 individuals justifiable under some conditions, <100 inadequate, and a "slight risk of non-convergence" at n = 100.

**Operating rule I would adopt:** anchor proportion **10–20% of booklet length**, i.e. **4–8 anchors on a 40-item booklet**. 5% is demonstrably worse. Above 20% you are paying for nothing. Prioritise **anchor quality** over quantity: high discrimination, difficulty spread matching the bank, position held constant, DIF-screened. One caution from the same study: higher anchor discrimination improved correlation-based recovery but *worsened* error-based recovery — do not select anchors purely on maximum *a*.

#### How required N scales

From `N = R · I / [k(1 - a)]`, with I = 2,108 and k = 34:

| R (responses/item) | a = 0% | a = 15% | a = 20% | a = 50% |
|---|---|---|---|---|
| 100 | 6,200 | 7,294 | 7,750 | 12,400 |
| 250 | 15,500 | 18,235 | 19,375 | 31,000 |
| 500 | 31,000 | 36,471 | 38,750 | 62,000 |
| 1,000 | 62,000 | 72,941 | 77,500 | 124,000 |

**Read this table as the central feasibility finding of this document.** N scales **linearly in R**, **linearly in bank size**, **inversely in booklet length**, and **inversely in (1 − a)**. With a realistic 34-item booklet and 15% anchoring, `N ≈ 73 × R`. Even the bare-minimum R = 100 needs **~7,300 people**. There is no design cleverness that gets you out of this; sparse designs reduce *per-person burden*, not *total responses*. The only levers that reduce **total responses** are: lower R, fewer items calibrated to full precision, and FIPC (which effectively halves the R you need for a given accuracy — the single biggest statistical lever available, Tier B).

**Longer booklets are the cheapest lever nobody uses.** Doubling k from 34 to 68 halves N. But session length scales with k, and fatigue, dropout, and rapid guessing all rise with it — at 75 s/item, k = 68 is an 85-minute session. Sensible ceiling for a paid session is roughly one MCAT section (~53–59 items, 90–95 min); for unpaid crowdwork, ~30 items / ~40 min. This is a genuine tradeoff, not a free win: longer forms buy fewer participants but degrade the data through disengagement (see §3).

---

### 3. Paid calibration studies — real cost modelling

#### Current platform pricing (all observed 2026-07-28)

**Amazon Mechanical Turk — CLOSING TO NEW CUSTOMERS.**

> "⚠️ Amazon Mechanical Turk will be closed to new customers, effective **July 30, 2026**. Existing users will not be impacted by this change."
> — mturk.com/pricing, read directly 2026-07-28 (Tier A)

That is **two days from today**. Unless the team already has an MTurk requester account, MTurk is not an option. For completeness, its fee structure as published: 20% of worker reward and bonuses; **an additional 20% (total 40%) for HITs with 10 or more assignments**; minimum $0.01/assignment; +5% for Masters qualification; Premium Qualifications from $0.05/assignment. The 10-assignment cliff is the classic gotcha — a calibration study inherently wants many assignments per HIT, which puts you in the 40% band unless you fragment batches.

**Prolific** (researcher-help pricing article, page dated 2026-03-13, read in full 2026-07-28; Tier A):

- Participant reward: set by you. **Absolute minimum £6 / $8 per hour. Recommended minimum £9 / $12 per hour.**
- Platform fee **on top of** rewards: **42.8% corporate**, **33.3% academia/non-profit** (institutional email + account type required; Gmail/Outlook not accepted).
- Bonuses are treated as rewards and are fee-bearing. Pre-screeners and representative samples cost **nothing extra**. You are **not charged** for returns or time-outs. Screened-out participants receive a small payment for screener time.
- VAT may apply **to platform fees only**, depending on your location.
- Pool: **>350,000 90-day-active participants, >134,000 in the US** (Prolific product-update post, July 2026; Tier B — vendor self-report). Rule of thumb from their own help docs: expect **~40–50% response rate from your eligible pool**.

**CloudResearch Connect** (Connect researcher help + FAQ + pricing-change blog; Tier A for the figures, vendor-published):

- Site **minimum $7.50/hour**; "baseline for fast data collection is $10/hour"; studies "pay, on average, $10/hour."
- Platform fee: **40% standard**, **25% academic/non-profit** (raised to 40% standard on 2025-01-01). New academic/non-profit accounts get **10 days with zero service fees** (must contact support before launching).

#### Assumptions for the cost model (change any of these and redo)

| # | Assumption | Value | Basis | Tier |
|---|---|---|---|---|
| A1 | Time per item, standalone item with short passage | **75 s** (sensitivity 60 / 90) | MCAT operational pace is 97.8 s/item — three sections of 59 items in 95 min plus CARS 53 items in 90 min = 230 items / 375 min, from AAMC "What's on the MCAT Exam?" (Tier A). Standalone short-passage items are faster than passage sets, so I discount to 75 s. | A for MCAT pace; **C** for the 75 s transfer |
| A2 | Session overhead (consent, instructions, demographics, debrief) | **5 min = 300 s** | judgement | C |
| A3 | Items per session | **k = 30** for crowd panels (37.5 min items + 5 min = 42.5 min); **k = 40–54** for dedicated premed sessions | judgement, bounded by fatigue evidence in §3 below | C |
| A4 | Overhead per item-response | 300 s / 30 = **10 s** | A2 / A3 | — |
| A5 | Billable time per item-response | 75 + 10 = **85 s = 0.023611 h** | A1 + A4 | — |
| A6 | Attrition / exclusion inflation | **+15%** on responses purchased (rapid-guess filtering, AI-flag exclusions, incompletes) | judgement anchored on the ~7% rapid-guess response rate and ~9% AI-assist participant rate below | C |

#### Effective hourly cost and cost per response

`H = reward_per_hour × (1 + platform_fee)`; `cost_per_response = 0.023611 h × H`

| Channel | Reward/hr | Fee | **H ($/hr)** | **$ / response** | $ / 1,000 responses |
|---|---|---|---|---|---|
| Prolific corporate, recommended rate | $12.00 | 42.8% | **$17.14** | **$0.405** | $405 |
| Prolific corporate, platform minimum | $8.00 | 42.8% | $11.42 | $0.270 | $270 |
| Prolific academic, recommended rate | $12.00 | 33.3% | $16.00 | $0.378 | $378 |
| Connect non-academic, typical | $10.00 | 40% | $14.00 | $0.331 | $331 |
| Connect non-academic, site minimum | $7.50 | 40% | $10.50 | $0.248 | $248 |
| Connect academic, typical | $10.00 | 25% | $12.50 | $0.295 | $295 |
| **Direct premed recruitment (no platform)** | **$25.00** | 0% | **$25.00** | **$0.590** | $590 |

**Headline unit cost: ≈ $0.40 per item-response** on Prolific corporate at the recommended $12/hr. Everything downstream is this number times the number of responses you need.

#### Full-bank cost at three target values of R

`responses = R × 2,108`; `participant-hours = responses × 0.023611`; `participants = responses / 30`

| R | Rationale for this R | Responses | Participant-hours | Participants (k=30) | **Prolific corp $12/hr** | Connect $10/hr | Prolific corp $8/hr min |
|---|---|---|---|---|---|---|---|
| **100** | Prometric/NBCRNA floor for CTT statistics and item screening | 210,800 | 4,977 | 7,027 | **$85,290** | $69,714 | $56,860 |
| **250** | working target for difficulty-only (1PL/Rasch) estimation | 527,000 | 12,443 | 17,567 | **$213,224** | $174,285 | $142,149 |
| **500** | DeMars/De Ayala guideline for trustworthy 2PL | 1,054,000 | 24,886 | 35,133 | **$426,448** | $348,570 | $284,299 |

Add A6's ×1.15 exclusion inflation and R = 250 becomes **≈ $245,000**. Add design B3's 15% anchor overhead (÷0.85) and it is **≈ $288,000**.

**Feasibility check that kills this outright.** At R = 250 you need **17,567 participants**. Prolific's entire 90-day-active US pool is ~134,000. That is **13.1% of the whole US pool**, and that is *before* applying any screener for premed status. At R = 500 it is **26.2%**. Recruiting a double-digit percentage of a platform's national pool for one study is not a thing a small team does in a reasonable timeframe — and if you filter to actual premeds, the eligible pool collapses (see below). **Full-bank paid calibration fails on recruitment before it fails on budget.**

#### What a given budget actually buys

Inverting: `responses = budget / 0.405`; `R = responses / items_calibrated`

| Budget (Prolific corp, $12/hr) | Responses | R if you spend it on 60 items | on 140 items | on 500 items | on all 2,108 |
|---|---|---|---|---|---|
| $2,000 | 4,943 | 82 | 35 | 10 | 2 |
| $5,000 | 12,358 | 206 | 88 | 25 | 6 |
| **$10,000** | 24,716 | **412** | 177 | 49 | 12 |
| **$20,000** | 49,432 | 824 | **353** | 99 | 23 |
| $50,000 | 123,579 | 2,060 | 883 | 247 | 59 |
| $100,000 | 247,158 | 4,119 | 1,765 | 494 | 117 |

**This table is the argument for the spine strategy.** $10k buys a **rigorously calibrated 60-item routing spine** (R ≈ 412 — comfortably in 2PL territory) or a **statistically worthless** 12 responses/item across the whole bank. $20k buys a 140-item spine at R ≈ 353. Nothing under six figures buys a usable full-bank calibration. So: buy the scale, harvest the bank.

#### Recommended paid-study configurations

| Config | Items | R | Responses | ×1.15 attrition | **Prolific corp** | **Direct premed @ $25/hr** | Sittings needed |
|---|---|---|---|---|---|---|---|
| **S1 — routing spine only** | 60 | 400 | 24,000 | 27,600 | **$11,167** | **$15,440** | 920 sittings × 30 items, or **511 sittings × 54 items** |
| **S2 — full spine, all 15 clusters** | 150 | 400 | 60,000 | 69,000 | **$27,917** | **$38,600** | 2,300 × 30, or **1,278 × 54** |
| **S3 — spine + diagnostic form** | 200 | 350 | 70,000 | 80,500 | **$32,570** | **$45,033** | 2,683 × 30, or 1,491 × 54 |
| **S4 — thin whole-bank screen** | 2,108 | 40 | 84,320 | 96,968 | **$39,233** | $54,245 | 3,232 × 30 |

S4 is worth pricing because it is tempting and it is a trap: 40 responses/item gives you p-value point estimates with a standard error of `√(0.5·0.5/40) = 0.079` — a ±0.16 95% interval on proportion-correct. That cannot reliably distinguish your three routing strata. It *can* flag catastrophically broken items (p < 0.30 with a four-option key, or p > 0.95). If that is what you want, it is a **QA screen**, not a calibration — and doing it as an internal review by two content experts is far cheaper.

#### Critical validity evaluation: are paid crowdworkers an acceptable proxy?

**Short answer: not for difficulty estimates that feed a 3-way router. The literature lets us bound the damage, and the bound is larger than your routing resolution.**

**Threat 1 — motivation / low-stakes response behaviour.**

Wise & DeMars (2005), *Educational Assessment* 10(1), 1–17 — the canonical synthesis, 25 effect sizes across 12 empirical studies (I read the key passage verbatim from a PDF copy):

> "all but 1 of the 25 effect sizes were found to be significant and positive, ranging from −0.04 to 1.49, **with an average of 0.59**. These findings indicate that motivated students perform, on average, more than one-half standard deviation higher than unmotivated students."

Sub-findings from the same source: Sundre (1999) found motivation scores **0.79 SD** higher when a multiple-choice test would be scored versus a parallel unscored test (**1.59 SD** for an essay); Wolf & Smith (1995) found **1.45 SD** motivation differences. **Tier A.**

Translation to your problem: in a Rasch metric where θ SD ≈ 1 logit, a 0.59 SD ability shift between motivated and unmotivated samples means the **origin of your difficulty scale is displaced by ~0.6 logits** if you calibrate on unmotivated people and deploy to motivated ones. IRT's invariance property does not save you: invariance says the *b* parameters are on the calibration sample's scale, and if you never link that scale to the operational population, your routing cut-points are in the wrong metric.

**Threat 2 — rapid guessing and disengagement.**

Rios et al. (2022), *Educational Assessment*, meta-analysis of 25 studies / 39 samples / **443,264 examinees** (abstract only):

- **28.3% of examinees engaged in rapid guessing**; 21% did so on a non-negligible number of items.
- **6.89% of item responses were classified as rapid guesses.**
- Aggregated test scores were negatively distorted by an average of **0.13 SD**, moderated by content area and filtering procedure.

**Tier A** (large meta-analysis, though abstract-only for me).

Impact on **item parameters** specifically:

- Rios (2023), *EPM*, comparing response-time-threshold scoring procedures: ignoring rapid guessing produced **positive systematic bias in item difficulty ranging from 0.30 to 0.55 units** across conditions; effort-moderated and hybrid-guess scoring cut pooled MAE from 0.46 to ~0.26–0.30. **Tier B** (simulation; results excerpt read).
- Rios et al. (2017), via the JEDM cascading-effect paper: even **6% of responses being rapid guesses** underestimates test performance. **Tier C** (secondary citation).
- JEDM (2025), "From Item Estimates to Test Operations: The Cascading Effect of Rapid Guessing": when rapid guessing is *difficulty-driven*, "most of the difficulty parameters were overestimated," and the positive bias **worsens for less-discriminating items** (η² = .20). **Tier B** (results excerpt).
- A 2024 dissertation-scale simulation reports the **opposite sign** under its data-generating model ("positive mean bias indicates that on average the item difficulty or item discrimination parameters of an item are underestimated") — i.e., the literature genuinely **conflicts on the direction of bias**, which the JEDM 2025 paper explicitly notes ("Previous research reported conflicting findings on the direction of bias"). **This is important honesty: you cannot apply a fixed correction. You must filter, not adjust.**

**Threat 3 — AI assistance. This is the newest and, for MCAT items specifically, the most dangerous.**

- ChatGPT-4.0 scored **522 (99th percentile), 90.87% accuracy** on an official AAMC full-length MCAT practice exam; Gemini scored 518 / 84.78% (Chu et al., 2025, IEEE ICIIBMS / Zenodo; **abstract only**, small author group, low citation count — **Tier B/C**). An earlier base-GPT-4 evaluation found per-section accuracy 50–81% depending on input format, "at or above the median performance of 276,779 student test takers" (medRxiv preprint, 2023; results excerpt read; **Tier B**, preprint).
- Prevalence on crowd platforms: a keystroke-based study of three Prolific studies (N = 928, May–July 2025) confirmed **~9% of participants submitted responses consistent with AI assistance**; these participants **outperformed non-cheaters by up to 1.5 SD**, were >2× as likely to share geolocations with other participants, and showed lower internal consistency. Simulated power analyses: this level of undetected cheating **diminishes observed effect sizes by 10% and inflates required sample sizes by up to 30%** (*AMPPS*, 2026; abstract only; **Tier B**).
- A second study (N = 250, Prolific + MTurk) found **participants on MTurk significantly more likely to use LLMs** than on Prolific, that **copy-paste browser events are the most reliable detection signal**, and that survey length and explicit instructions against LLM use had **less** effect than expected (**Tier B**, abstract/summary read).
- Platform countermeasures (Prolific self-reported, **Tier C** — vendor claims, no independent audit): LLM authenticity checks on free-text with **98.7% precision / 0.6% false-positive**, examining 15+ behavioural patterns including copy-paste and tab-switching; bot authenticity checks with "100% accuracy in testing," with **0.04% of >1M submissions flagged as AI agents**; ID verification with live video selfie, <0.1% fraud rate; **0.5% of responses rejected in 2025** and a September internal audit flagging **0.99% of participants for AI-generated responses**. Note the gap between Prolific's ~1% figure and the independent keystroke study's ~9% — the platform's checks are **built for free-text**, and **your items are multiple choice**, where the LLM-detection signal (linguistic style) does not exist. Assume the 9% figure, not the 1% figure.

**Why AI assistance is worse than rapid guessing for your specific use case.** Rapid guessing pushes item difficulty estimates in one direction (mostly harder); LLM assistance pushes them in the *opposite* direction, and **selectively on the hard items** — precisely where an LLM's advantage over a disengaged human is largest. Two consequences:

1. The two biases can **partially cancel in the aggregate p-value distribution** while destroying the **rank ordering** of items. You would see a plausible-looking difficulty histogram and a scrambled difficulty ranking. Your MST routing depends entirely on the ranking.
2. The result is **range compression**: hard items look easier, easy items look harder (guessers get them wrong), so your estimated difficulty spread shrinks, and a 3-way stratification built on it splits on noise.

**Quantifying the total risk against your routing resolution.** A 3-way equal-size difficulty split of a standard-normal distribution puts cut-points at z = ±0.431 and the **medians of adjacent strata ~0.97 logits apart** (medians at approximately −0.97, 0, +0.97). The documented biases are:

| Source | Magnitude | Direction | As % of 0.97-logit stratum spacing |
|---|---|---|---|
| Ignoring rapid guessing | 0.30–0.55 logits | mostly upward (harder) | **31–57%** |
| Motivated vs. unmotivated ability gap (scale-origin displacement if unlinked) | ~0.59 SD ≈ 0.6 logits | scale shift | **~61%** |
| ~9% AI-assisted responders at ~91% accuracy | not directly quantified in the literature; my estimate is that it compresses the upper difficulty range | downward on hard items | **unquantified — see §8** |

**Conclusion: a generic paid crowd sample can plausibly distort your difficulty estimates by 0.3–0.6 logits, i.e. 30–60% of the distance between adjacent routing strata.** That is not a rounding error; it is a substantial probability of routing learners to the wrong module. This is the quantified case for §7's recommendation to pay *actual premeds*, at a higher hourly rate, in fewer numbers, on a smaller item set.

#### Mitigations if you do run a paid study

Ordered by value per unit of engineering effort:

1. **Recruit the right population.** Prolific has `Student status and field of study` filters and Domain Experts screeners including Medicine (Tier A that the filters exist; **the size of a premed-eligible US subpool is unverified — see §8**). Use the eligible-count API (`POST` with filters; returns 0 when fewer than 25 qualify) to size the pool *before* committing. If the premed-eligible count is in the hundreds, remember the 40–50% response-rate rule of thumb and treat the achievable N as a hard ceiling.
2. **Log millisecond latencies and apply response-time-threshold filtering.** This is the single most effective intervention in the rapid-guessing literature. Effort-moderated (EM) and hybrid-guess (HG) scoring cut pooled MAE from 0.46 to ~0.26–0.28 (Rios 2023, Tier B). Note that one method — proportion-of-normative-time-style "PN" scoring — performed **worse than ignoring rapid guessing entirely** (pooled MAE 0.62 vs 0.46), so pick the method deliberately, do not improvise a threshold.
3. **Instrument copy-paste, tab-blur, and focus-loss events.** The strongest published LLM-detection signal, and it works for multiple-choice items where linguistic detection does not.
4. **Add per-item time floors and ceilings.** An MCAT-style item answered in <5 s was not solved; one answered in >8 min with a tab-blur event was probably outsourced.
5. **Explicit anti-AI reminders in the item stem area.** Prolific reports internal tests where clear reminders reduced AI usage by **61%** (Tier C, vendor self-report). Cheap; do it. But the independent study found instructions had "less impact" than hoped — do not rely on it alone.
6. **Plant trap items with known parameters**, including items where LLMs are known to fail (image-dependent, novel-notation) and items that are trivially easy. A participant who gets the hard trap right and the trivial trap wrong is flagged.
7. **Pay well and keep sessions short.** Paying above the recommended minimum is a data-quality intervention, not charity — Prolific's own guidance is that low rewards "attract less engaged participants."
8. **Motivation filtering, and report both filtered and unfiltered results.** Wise & DeMars (2010) found "motivation filtering was found to be successful in mitigating the effects caused by rapid guessing" and recommend routinely applying it whenever low-stakes data support decisions (Tier A).

---

### 4. Population and sample-representativeness issues

**The core statement.** An IRT difficulty parameter is not a property of an item alone. It is a property of an item *relative to a latent scale whose origin and unit are fixed by the calibration sample*. Change the sample's ability distribution and — unless you link — you change the metric in which every *b* is expressed, and therefore every routing threshold defined in that metric.

#### What the evidence says goes wrong

**Ability-level mismatch.** Simulation work exploring the boundary conditions of parameter invariance found "item parameter estimates derived from a sample contain **more errors when ability differences exist between the sample and its population**. Fewer errors result when the size of the sample is increased. This finding highlights some limitations of the item invariance property" (Tier B, abstract read). A more optimistic companion result: invariance for Rasch and 2PL "**could hold** for the sample item parameter estimates, regardless of biased samples, **when the model holds in the data, the number of items in a test is not small, and the sample size is large**" (Tier B, abstract read). Note the three conditions — model fit, test length, sample size — all of which are exactly what you *don't* have in the cheap version of this project.

**Range restriction (ability spread).** A dedicated study of range restriction and invariance concluded that "the accuracy of estimation of **extremely easy or extremely difficult items** is influenced by restrictions in the range of ability" while overall stability held; it also found the 3PL fit better under positively skewed ability (Tier B, abstract read). Practical implication: a range-restricted calibration sample damages precisely the **tails** of your difficulty distribution — which are precisely the items your stage-7 easy and hard modules need.

**Composition / oversampling.** A patient-reported-outcomes simulation is instructive by analogy: when a general-population sample is enriched with a clinical subsample and the sampling scheme is **ignored** in estimation, item and person parameters are over- or under-estimated depending on the enrichment direction, and **the standard error of the latent trait estimate is generally underestimated** (Tier B, abstract + results read). Underestimated SEs are the dangerous failure mode: you get confident wrong answers.

**Skewed distributions and prior misspecification.** Guo et al. cite Seong (1990): when underlying and prior θ distributions are **matched**, 2PL parameters improve with N as expected; when **mismatched**, appropriate prior specification helps at N = 1,000 but "did not help much with item parameter estimation for the small sample size (N = 100)" (Tier B). Priors do not rescue you at small N.

#### What this does to your adaptive test's routing

Your design is 7 stages × 20 items with 3-way difficulty routing. Two effects compound.

**Baseline misrouting is already substantial even with correct parameters.** A Monte Carlo evaluation of a 42-item three-stage MST varying test structure, item allocation, assembly priority, and routing strategy found "**routing errors occurred 15% of the time across conditions**" and that they adversely affected θ bias, RMSE, and SEM; θ-based routing outperformed defined-population-interval number-correct routing (Chapman, Weiss & Suen, 2024; **abstract only**; Tier B). A separate simulation across 1-3, 1-2-3, and 1-3-3 designs found three-stage designs misroute less than two-stage, that **longer tests and a wide-ability routing module reduce misrouting**, that misrouted examinees have low measurement accuracy but overall MST accuracy is fairly robust, and that **misrouted examinees concentrate at the intersections of adjacent module information functions and in the middle of the ability scale** (Tier B, abstract + method read).

**Parameter error adds on top of that baseline.** An item-parameter-drift study in a testlet-based MST found "routing accuracy is impacted by module difference, routing error stage, or testlet effects," that IPD amplification to the testlet level "may have an **indirect impact on final ability estimate accuracy due to increased routing error rates**," and that "**moderate ability test takers are found to be more likely misclassified than low or high ability test takers**" (Tier B, abstract read).

**Synthesis for your design.** With 7 stages you have 6 routing decisions, and errors early in the sequence are the costliest — a stage-1 misroute puts the learner in the wrong branch for six subsequent stages. Combine (a) ~15% baseline misrouting, (b) a 0.3–0.6 logit systematic difficulty distortion from an unmotivated/unrepresentative calibration sample, and (c) ~0.97-logit spacing between adjacent difficulty strata, and you should expect **materially degraded routing for mid-ability learners** — the modal user of an MCAT prep product. Two design consequences follow directly:

1. **Make stage 1 wide and long.** The evidence is consistent that a wide-ability, longer routing module reduces misrouting. Your stage-1 module is the one place worth spending real calibration money.
2. **Use θ-based routing, not number-correct routing** (Chapman et al.'s clearest finding).

#### Standard remedies

| Remedy | What it fixes | Cost to you | Tier |
|---|---|---|---|
| **Linking / anchoring to a target-population-calibrated spine** | scale origin and unit; the fundamental fix | the paid spine study in §7 | A |
| **Concurrent / fixed-parameter calibration (FIPC)** | avoids the separate-scaling step and its error; ≈ doubles effective N | engineering only | B (Guo et al. 2025) |
| **Informative priors on θ matched to the operational population, and on c fixed near 0.25** | small-sample instability, 3PL non-identification | engineering only | A/B |
| **Post-stratification / sample weighting** | composition mismatch — but only if you *collected* the stratifying variables | must be instrumented pre-launch (§5) | B |
| **MDIA-style distribution matching** | mismatch between assumed and empirical θ distribution; Guo et al. found it improves **operational** item recalibration but **not** new pretest items (possible overfitting) | research-grade complexity | B |
| **Drift monitoring against a pinned reference form** | detects when your borrowed scale stops describing your users | trivial if instrumented pre-launch; impossible to reconstruct later | A |
| **Recalibration once real users arrive** | everything, eventually | the whole point of Stage 3–4 | A |
| **Simultaneous linking across administrations** (Haberman, 2009, via Guo et al.) | places large numbers of item parameters from many administrations on one scale | later-stage engineering | B |

**The one non-negotiable:** whatever population you calibrate on, **link it to your operational population** through a common item set as soon as you have real users. That is what the pinned reference form in §5 is for. Without it, you can never tell whether a difficulty estimate is wrong or your users have changed.

---

### 5. Harvesting from a public landing page

#### Why anonymity breaks IRT — mechanically

IRT is fit to an **N × I response matrix**: rows are persons, columns are items, cells are scored responses. The likelihood being maximised is (for MML) an integral over the person distribution of the product of item response functions **for each person's response vector**. The row structure is not cosmetic — it is where all the information about item *relative* difficulty comes from. Two responses that you cannot attribute to the same person cannot be compared through a shared θ.

**Concretely, with truly anonymous per-response logging** (each response an independent row with no person key), you can compute:

- ✅ **p-values** (proportion correct per item)
- ✅ per-option selection rates → distractor diagnostics
- ✅ mean response time per item
- ❌ point-biserial / item-total correlation (needs a person total score)
- ❌ any θ estimate
- ❌ any IRT parameter
- ❌ any scale on which items from different visitors are comparable

And the p-values you *do* get are contaminated by the fact that different items were served to differently-able self-selected visitors — i.e., they are not on a common scale and are **not comparable across items** unless assignment was random.

**The minimum identity requirement is much weaker than "user accounts."** You need exactly one thing: a **server-issued, per-response-set identifier** that groups one sitting's responses into one row. No email, no name, no login, no persistent cookie strictly required — a `response_set_id` minted server-side when the snapshot starts and returned with each answer submission is sufficient. That is the whole requirement. Once you have it:

- 12 items, four options, all near p = 0.5 → Fisher information ≈ Σ p(1−p) = 12 × 0.25 = 3 → **SE(θ) ≈ 1/√3 = 0.577 logits** under a Rasch model with perfect targeting. With realistic off-target items and a nonzero guessing asymptote, expect **0.7–0.9 logits**. (My arithmetic; Tier C for the transfer, A for the information identity.)
- That is a poor person estimate — but it is *not zero*, and in a concurrent sparse calibration with many sessions it contributes real information about item difficulty. This is exactly the BIB logic: nobody needs a precise θ if the design is connected.

If you additionally want **cross-session** linkage (visitor returns, or moves from landing page to signup), you need a persistent identifier, which is where the privacy analysis below bites.

#### Viability arithmetic

**Assumptions (all Tier C, adjust freely):** 2,000 unique landing-page visitors/month; 25% start the snapshot; 70% of starters finish → **350 completions/month** → **4,200 item-responses/month**.

| Goal | Responses needed | Months at 4,200/mo | Verdict |
|---|---|---|---|
| R = 250 across all 2,108 items | 527,000 | **125 months ≈ 10.5 years** | dead |
| R = 100 across all 2,108 items | 210,800 | 50 months ≈ 4.2 years | dead |
| R = 250 across a 100-item sacrificial set | 25,000 | **6.0 months** | viable |
| R = 250 across a 12-item fixed snapshot | 3,000 | **0.7 months** | trivially viable |
| Rotating 2 seeded items per 12-item snapshot, R = 250 | 700 seeded responses/month | **2.8 items/month → 34 items/year** | marginal but free |

Even at 10× the traffic (20,000 visitors/month → 3,500 completions → 42,000 responses/month), full-bank R = 250 takes **12.5 months** and requires **publishing the entire bank publicly**. Which brings us to the fatal objection.

#### Pitfalls, ranked by severity

1. **Item exposure and security — the deciding factor.** Every item you serve to anonymous unauthenticated traffic is effectively published: scrapable, screenshot-able, indexable. For a paid prep product, the item bank *is* the asset. Burning 2,108 items to save $200k of calibration cost destroys more value than it creates. **Only ever expose a designated sacrificial pool, and never use those items in the diagnostic or in any scored context.** This is also the reason the item-exposure literature exists at all: Sympson-Hetter and its relatives were built because "item pools are large and expensive to produce and testing can be on a continual basis" (ETS RR, Tier A).
2. **Self-selection.** People who click a "test your MCAT readiness" teaser are not a random sample of your future users, and are certainly not a random sample of MCAT candidates. They over-represent the curious and the anxious, at both ability extremes. Range restriction *and* range inflation are both possible and you cannot tell which without an anchor.
3. **Extreme low stakes.** This is the *most* low-stakes context imaginable: no score, no consequence, no identity, one click to leave. Expect rapid-guessing rates at or above the 28% of examinees / 7% of responses documented in institutional low-stakes testing (Tier A), and plausibly far above — those meta-analytic figures come from *proctored group-administered* assessments where a person at least sat down in a room.
4. **Bots and scrapers.** An unauthenticated endpoint that returns items will be crawled. Concrete mitigations: **never ship the answer key to the client** (score server-side); mint item selections server-side per session; rate-limit per IP and per session; add a challenge (Turnstile/CAPTCHA) before the first item; log user-agent, headless-browser signals, and impossibly-fast completions; and filter on the response-time distribution before any analysis.
5. **No stakes → no effort → wrong parameters, in an unknown direction.** Given the conflicting evidence on the sign of rapid-guessing bias (§3), you cannot correct this analytically. You must filter, and filtering on 12-item sessions leaves you very little.
6. **Traffic-volume dependence on marketing.** Your calibration rate becomes a function of your ad spend and SEO, which is a bad coupling.

#### Consent and data-use — practical engineering guidance

**I am not a lawyer and this is not legal advice.** Get counsel before launch. What follows is the engineering shape of the problem as reported by current secondary sources (all Tier C — privacy-vendor blog posts, not primary law or regulator guidance; I did not read the ePrivacy Directive, GDPR, or CPRA text directly).

**GDPR + ePrivacy (applies to EEA/UK visitors regardless of where you are, if you target or monitor them):**

- The consistent message across several 2026 secondary sources is that **ePrivacy Art. 5(3) governs the *storage/access* step independently of your GDPR lawful basis**, and that **"legitimate interest" does not cure the ePrivacy consent requirement** for non-essential cookies or local storage. You need to satisfy both: consent (or a strict-necessity exemption) under ePrivacy for touching the device, *and* a lawful basis under GDPR for the processing.
- **"Strictly necessary" is narrow** but explicitly covers "authentication tokens, shopping-cart state, load balancing, UI preferences the user actively set." A server-issued session identifier whose sole purpose is to deliver the 12-item teaser the visitor explicitly requested and to show them their result is a plausible strict-necessity candidate. **Using that same identifier for psychometric research is a separate processing purpose** and needs its own basis.
- Some member-state regulators have carved out narrow exemptions for **first-party, aggregate-only analytics** — CNIL (France), AEPD (Spain), Garante (Italy), and the Dutch AP ("Analytical cookies… do not require consent if they are used solely for counting visitors," Art. 11.7a Telecommunicatiewet). These are **jurisdiction-specific, not pan-EU**, and Italy's Garante is explicit that legitimate interest is not a valid basis for cookies. If you operate across member states, **consent is the safe default**.
- Cookieless, non-personal-data analytics that never access terminal equipment avoid the banner question entirely — relevant if you want traffic measurement separate from psychometric data collection.

**CCPA/CPRA (California):** opt-out model, not opt-in — no prior consent needed to set cookies, but you must offer a "Do Not Sell or Share My Personal Information" link, honour Global Privacy Control, and stop within 15 days of an opt-out. **Applicability thresholds:** >$25M annual gross revenue; **or** buying/selling/sharing personal information of ≥100,000 California consumers/devices annually; **or** ≥50% of revenue from selling/sharing personal information. **A pre-launch startup with no users almost certainly meets none of these**, so CCPA likely does not apply *yet* — but it will if you succeed, and retrofitting an opt-out into a data pipeline is painful. Build it now.

**Practical engineering checklist (do all of these; they are cheap now and expensive later):**

1. **Region-aware consent**: GDPR-style prior opt-in for EEA/UK; CCPA-style opt-out + GPC honouring for California; baseline notice elsewhere. Store consent records with timestamp and scope so you can prove what was agreed.
2. **A specific data-use clause in your privacy policy and ToS from day one**, naming the purpose: something to the effect of *"we analyse aggregated, de-identified response data — including which answers were selected and how long each question took — to measure question quality and difficulty and to improve the product."* Vague "to improve our services" language may not cover psychometric modelling and certainly does not cover publication.
3. **Separate consent scope for research/publication.** If you ever want to publish results or share a dataset, you need consent that permits it. **You cannot obtain this retroactively from churned anonymous visitors.** If publication is remotely plausible, ask for it at signup on day one.
4. **Data minimisation.** IRT needs a pseudonymous row key and nothing else. Do not collect PII you do not need; do not retain raw IP addresses if a coarse country code suffices; separate the psychometric event store from any identity store.
5. **Retention policy that does not delete your calibration data.** A naive "delete all analytics after 90 days" policy will silently destroy the asset you are trying to build. Define response events as product data with a long retention basis, distinct from marketing analytics.
6. **On paid platforms:** Prolific participants consent at the platform level, but you still need study-level consent and debrief, and Prolific enforces fair-pay minimums as an ethics matter. Because you are a company rather than a federally-funded researcher, IRB review is likely not *required* for internal product improvement — but if you intend to publish, journals will ask, and you should get an ethics review or use an independent IRB. **Tier C; confirm with counsel.**

#### Verdict: what the landing page CAN and CANNOT deliver

**CAN:**

- Classical **p-values and distractor selection rates** on a small rotating **sacrificial** set (~100 items), reaching R = 250 in ~6 months at the assumed traffic.
- An early **reality check on your expert/DOK difficulty ordering** — does the item you labelled DOK 4 actually get answered correctly less often than the DOK 1 item? This is genuinely valuable and available in weeks.
- **Item-QA screening**: catch miskeys, ambiguous stems, and non-functioning distractors before real users see them. A distractor chosen by <5% of respondents is dead weight; a p-value above 0.95 or below 0.30 (with four options) is a red flag.
- **Response-time norms** per item, useful later for setting rapid-guessing thresholds.
- Marketing-funnel data, which is presumably its actual job.
- With a `response_set_id` and a rotating design: a **weak but nonzero** contribution to a concurrent calibration — treated as a low-stakes population that must be **linked, not pooled**.

**CANNOT:**

- A scaled IRT calibration of 2,108 items. Off by roughly two orders of magnitude in throughput and would require publishing the bank.
- Any trustworthy estimate of item **discrimination** (needs person totals and much larger per-item N).
- A difficulty scale you can put your MST routing cut-points on. The population is wrong, self-selected, and maximally unmotivated.
- Anything at all, if responses are logged without a per-session grouping key.

**The correct role for the landing page is a permanently-running item-QA and difficulty-ordering sanity check on a sacrificial pool — plus, once you have a spine, a cheap DIF/drift probe.** Treat any difficulty numbers it produces as priors, never as parameters.

---

### 6. Organic-user path

#### The arithmetic

**Assumptions:** `q` = items answered per active learner per week; `A` = weekly-active learners; `s` = fraction of delivered items drawn from the *uncalibrated* set (the "seeding slot"); `I_U` = uncalibrated items remaining; `R` = target responses per item.

```
responses to uncalibrated items per week = q · A · s
weeks to reach R on all of I_U          = R · I_U / (q · A · s)
```

Because you seed *only* uncalibrated items, every seeded response is useful, and as `I_U` shrinks the per-item rate rises — so total time is exactly `R · I_U(0) / (q·A·s)`, linear in each input.

**Baseline: q = 40 items/learner/week** (≈6/day; plausible for an engaged MCAT prepper, Tier C), `I_U` = 1,968 (2,108 minus a 140-item paid spine), R = 250.

Total responses needed for the tail: 1,968 × 250 = **492,000**.

| Weekly-active learners `A` | s = 0.15 | s = 0.25 | s = 0.50 | **s = 1.00** (non-adaptive launch) |
|---|---|---|---|---|
| 50 | 1,640 wk (31 yr) | 984 wk (19 yr) | 492 wk (9.5 yr) | 246 wk (4.7 yr) |
| 100 | 820 wk (16 yr) | 492 wk (9.5 yr) | 246 wk (4.7 yr) | 123 wk (2.4 yr) |
| 250 | 328 wk (6.3 yr) | 197 wk (3.8 yr) | 98 wk (1.9 yr) | 49 wk |
| **500** | 164 wk (3.2 yr) | **98 wk (1.9 yr)** | 49 wk | **25 wk** |
| **1,000** | 82 wk (1.6 yr) | **49 wk** | 25 wk | **12 wk** |
| 2,500 | 33 wk | 20 wk | 10 wk | 5 wk |
| 5,000 | 16 wk | 10 wk | 5 wk | 2.5 wk |

Same table at the cheaper **R = 100** target (tail needs 196,800 responses):

| `A` | s = 0.25 | s = 1.00 |
|---|---|---|
| 100 | 197 wk | 49 wk |
| 250 | 79 wk | 20 wk |
| **500** | **39 wk** | **10 wk** |
| 1,000 | 20 wk | 5 wk |

**Reading:** organic-only calibration is a **1–4 year** proposition at plausible early-stage adoption (100–500 weekly-active learners), and a **3-to-6-month** proposition only above roughly **1,000 weekly-active learners**. Note that "weekly-active" is a much harder number to hit than "signups" — assume heavy churn, and that `A` is a small fraction of registrations.

**The `s = 1.00` column is the free lunch.** Launching non-adaptive (every delivered item drawn from the uncalibrated pool under a spiralled design) gives a **4–6× speedup** over a 15–25% seeding slot, at the cost of a less efficient test for early users. For the first cohort — who are, by definition, using an uncalibrated product whose adaptivity is running on guessed parameters anyway — **the adaptivity is not buying them much.** You are trading illusory precision for real calibration data.

#### Why adaptive delivery makes exposure brutally uneven

CAT item selection is a **greedy algorithm**: "it always selects your best items from the pool if it can" (Tier A, ASC). Three consequences for calibration:

1. **Popular items saturate, rare items starve.** Mid-difficulty, high-discrimination items get selected for nearly everyone. Without controls, "the first item for the test will be the same for everyone." Items in the difficulty tails or in rare content clusters may receive **zero** exposures indefinitely — so the *average* responses/item in the table above massively overstates coverage of the tail.
2. **Proportion-correct becomes invalid.** Pelánek's simulation comparison is direct: "the proportion correct method provides good estimates when the selection of items presented to students is **random**. In the case of **adaptive** selection, however, the proportion correct method **fails**. The Elo rating system is able to achieve in both cases very similar performance as the IRT approach, which is computationally much more demanding" (Tier B, full paper read in part). This is a formal missing-not-at-random problem: an item's observed p-value reflects *who was routed to it*, not its difficulty.
3. **Adaptive-selection missingness violates the MAR assumption** that concurrent calibration relies on. Guo et al. explicitly note their recommendation to fix only routing-block items partly because it "meets the required proportion of MST design for meeting the **missing at random requirement** (Mislevy & Wu, 1988, 1996; Wang et al., 2020)" (Tier B). Your stage-1 routing module is administered to everyone and is therefore MAR-clean; stages 2–7 are not.

#### Remedies

| Remedy | Mechanism | Notes | Tier |
|---|---|---|---|
| **Non-adaptive first cohort** | eliminates the problem entirely for the calibration window | the highest-value, lowest-cost intervention; must be built pre-launch | B |
| **Mandatory random seeding slot** | reserve *m* of every *n* delivered items for uniform-random draws from the uncalibrated / under-exposed set | Interestingly, a comparison of five pretest-item-selection methods for online calibration found that **"the simplest random selection method appears to be a potential best choice"** across 1PL/2PL/3PL, estimation methods, seeding locations, and five sample sizes (Tier B, abstract only). Do not over-engineer this. | B |
| **Sympson-Hetter exposure control** | each item gets a control parameter P(A\|S); on selection, draw a uniform random number and administer only if below the parameter, else fall through to the next-most-informative item. Targets max administration rate `r` | Requires **iterative simulation** to set the parameters, which is "time consuming" and "does not guarantee admissibility." Later variants (two-stage, on-line SHT) remove the pre-test simulation requirement | A for the method, B for the variants |
| **Randomesque** | select randomly among the top-*n* most informative items | Much simpler than Sympson-Hetter, no simulation needed. **Start here.** | A |
| **Stocking-Lord conditional exposure control** | controls exposure conditional on ability | more precise, more complex | A (referenced) |
| **Shadow-test / constrained selection** | van der Linden & Veldkamp: impose exposure as an explicit constraint in the selection optimisation | heaviest machinery; overkill for now | A (referenced) |
| **Item-centred adaptive calibration (D-VR, D-c, ED designs)** | instead of choosing the best item for the examinee, choose the best *examinee* for the under-calibrated item; assign a new item to the current active examinee by comparing expected information contribution | van der Linden & Ren (2015) and successors. This is the theoretically right way to spend a seeding slot and it "retired smaller number of new items… at almost all levels of examinee sample size" than D-VR. Consider at Stage 4, not Stage 1 | B (abstracts + one full paper read in part) |
| **Elo / Glicko streaming updates** | update item difficulty and person ability after every response, in real time | See below | B |

#### Elo as the provisional-difficulty engine (strongly recommended for the tail)

The adaptive-learning literature converged on rating systems for exactly this cold-start situation.

- Klinkenberg, Straatemeier & van der Maas (2011), Math Garden: an Elo-based item response model with an explicit scoring rule accounting for both accuracy and response time, updating person ability and item difficulty **with every answered item**, enabling "on the fly item calibration." Items sampled at a mean success probability of **0.75**. In ten months, **3,648 children completed over 3.5 million arithmetic problems**; reported better measurement precision, high validity and reliability (Tier B, abstract read; large real deployment).
- Pelánek's comparison (Tier B, full paper read in part): Elo "achieves in both cases [random and adaptive selection] very similar performance as the IRT approach, which is computationally much more demanding."
- Advantages repeatedly cited: real-time updates, negligible computational cost, trivial to implement and explain, robust to streaming data. Cost: less precise than full IRT, and it does not give you discrimination or guessing parameters.
- **Cold start within Elo:** "Typically, items receive an initial rating based on expert judgment or data-driven estimates… which in practice works very well," or you adapt the *K* value over time to balance the stability of small *K* against the flexibility of large *K* (Tier B, 2025 study).

**How I would use it:** run Elo (seeded from expert/DOK-based priors) as the **provisional difficulty for every uncalibrated item**, driving practice selection immediately. Do **not** use Elo ratings for MST routing thresholds until they have been anchored to the paid spine — Elo has no absolute scale, so link it by including spine items in the Elo stream and applying a linear transformation to the spine's logit metric. Then run periodic batch FIPC to promote items from "provisional Elo" to "calibrated IRT" once each crosses a response threshold (100 for provisional, 250–500 for promotion). This gives you a single mechanism that works from day one and degrades gracefully.

---

### 7. Recommended plan

**Framing.** You have three resources: a little money, a little time, and a product launch that has not happened yet. The launch is the most valuable of the three and the only one that is about to be irreversibly spent. Optimise for not wasting it.

**The core strategy in one sentence: buy a small, high-quality, correctly-populated *scale*; make your own launch the *field test*; and instrument today the things that cannot be recovered tomorrow.**

---

#### Stage 0 — Instrument before launch. Now. ~$0 cash, ~1–2 engineering weeks.

Highest leverage item in this document. See §"Instrument before launch" for the concrete list. **Do not proceed to Stage 1 before this ships**, because Stage 1's data should flow through the same pipeline you will use forever.

**Also in Stage 0, three design decisions that are free now and expensive later:**

1. **Build the delivery engine so item selection is a swappable policy with a logged identifier and parameters.** You need to be able to run "random", "spiralled BIB", "randomesque", "greedy MFI", and "seed-slot hybrid" as configuration, not as a rewrite — and to know afterwards which one produced each response.
2. **Define and pin a reference form**: a fixed 40–60-item linear set, spanning difficulty and clusters, delivered to a random ~5% subsample of sessions **forever**. This is your permanent drift monitor and your link between every future calibration and every past one. It costs almost nothing and cannot be reconstructed retroactively.
3. **Designate a sacrificial pool** (~100–150 items, ideally item-family duplicates you can afford to burn) for the public landing page. Never use these in the diagnostic.

---

#### Stage 1 — Paid calibration of the routing spine. ~2–4 weeks. **$11.2k (Prolific) – $15.4k (direct premed).**

**What:** 60 items forming the stage-1 routing module, spanning the full intended difficulty range and covering the AAMC Foundational Concepts, at **R ≈ 400**.

**Population — this is where I depart from the obvious answer.** Recruit **actual premedical students**, not generic crowdworkers. Two routes:

- **Direct recruitment** (preferred): premed subreddits, university premed societies and pre-health advising offices, MCAT study Discords, an "early access" offer. Compensation: **$25/hour** plus free product access, paid by gift card. One 54-item sitting (~70 min) per participant, or two shorter sittings. **511 sittings** delivers 27,600 responses ≈ **$15.4k** at $25/hr with no platform fee ($0.5594/response at k = 54). Slower to recruit; dramatically better validity; doubles as your beta-user pipeline and your qualitative feedback channel.
- **Prolific with `field of study` / student screeners** (fallback or supplement): **$11.2k** at $12/hr corporate for the same 27,600 responses (24,000 × 1.15 attrition). Faster. **But first call the eligible-count endpoint** with your premed screener combination — if the eligible pool is in the hundreds, the 40–50% response-rate rule of thumb caps your achievable N below what you need, and you will end up loosening screeners until the sample is no longer premed. That failure mode is silent and fatal.

**Why 60 items at R = 400 rather than 2,108 at R = 12:** R = 400 is comfortably inside the DeMars/De Ayala 2PL guideline (500 with normal θ and good discrimination; 400 with a fixed guessing parameter and informative priors is defensible) and near the Rothe et al. `r = 0.97` sample-size regime. It gives you a **real** scale for the one module every learner sees.

**Deliverables:** 2PL parameters (with `c` fixed at 0.25) for 60 routing items on a defined premed-population scale; empirical θ distribution for a premed sample, to use as the calibration prior everywhere else; response-time distributions for rapid-guessing thresholds; validated routing cut-points; and a first empirical answer to "does our DOK/KC-based difficulty ordering correlate with reality?"

**Quality gates:** apply effort-moderated or hybrid-guess response-time filtering (**not** PN-style scoring, which the evidence says is worse than doing nothing); log paste/tab-blur; plant trap items; report filtered and unfiltered results side by side.

---

#### Stage 2 — Extend to a full linking spine. ~4–8 weeks. **+$19.7k (Prolific) – $27.2k (direct premed)** incremental.

**What:** extend from 60 to **150–160** items at R ≈ 400, ensuring coverage of all **15 content clusters** and both ends of the difficulty range, and including the **pinned reference form** items.

**Design:** hub-and-spoke (design B3, §2). Booklets of ~40 items: 6 fixed Stage-1 spine anchors (15% anchor proportion, in the evidence-supported 10–20% band) + operational blocks. Calibrate by **FIPC with Stage-1 parameters fixed**.

**Cost:** 90 additional items × 400 = 36,000 responses, ÷ 0.85 efficiency = 42,353, ×1.15 attrition = 48,706 → **$19,706** on Prolific corporate, **$27,247** direct-premed.

**Why this is the last dollar worth spending on paid calibration:** at 150 spine items you have (a) a scale, (b) anchors in every cluster so no future FIPC run is extrapolating, (c) a calibrated diagnostic stage-1 and a validated cut-point structure, and (d) a permanent reference form. Every additional paid item after this is something your own users will calibrate for free.

**Cumulative cash through Stage 2: $30.9k (Prolific) – $42.7k (direct premed).** Compare $245k for the naive full-bank study at R = 250, or $490k at R = 500 — and note that the naive study is not merely 8–16× more expensive, it is **infeasible on recruitment grounds** regardless of budget.

---

#### Stage 3 — Launch as the field test. Weeks 0–26 post-launch. **~$0.**

1. **First cohort runs non-adaptive.** Deliver the 140-item diagnostic as **spiralled BIB forms** (§2 design B3), not adaptively, until the tail crosses a response threshold. Every learner sees the calibrated 60-item routing module (so you can score them honestly) plus operational blocks of uncalibrated items. This is the `s = 1.00` column of §6's table: a **4–6× speedup** on tail calibration for the price of a temporarily less efficient test.
2. **Switch on adaptivity gradually**, with **randomesque** exposure control from day one (simplest effective method; no pre-simulation needed) and a **mandatory random seeding slot** of 15–25% of delivered items drawn from the under-exposed/uncalibrated set. The online-calibration literature says simple random pretest-item selection is competitive with sophisticated alternatives — do not over-build.
3. **Elo from day one** for provisional difficulties on uncalibrated items, seeded from expert/DOK priors, linked to the spine metric by including spine items in the Elo stream.
4. **Batch FIPC weekly or fortnightly**: fix the 150-item spine, calibrate everything above the response threshold. Promotion ladder: **≥100 responses → provisional (Elo + p-value, practice selection only); ≥250 → calibrated (eligible for MST target modules); ≥500 → 2PL discrimination trusted.**
5. **Landing page in parallel**: rotate the sacrificial pool; harvest p-values, distractor diagnostics, and response-time norms; use them for QA and as priors, never as parameters.

**Timeline from §6, R = 250 on a 1,968-item tail:** at 500 weekly-active learners, non-adaptive (`s = 1`) is **~25 weeks**; with a 25% seeding slot after adaptivity is on, ~98 weeks. At 1,000 weekly-active, **12 weeks** and 49 weeks respectively. Plan for the pessimistic case and set the R threshold for *promotion* (not for *use*) accordingly.

---

#### Stage 4 — Steady state. Ongoing. **~$0.**

- **Drift monitoring** against the pinned reference form; alert on item-parameter drift, which the MST literature shows propagates into routing-error rates and disproportionately misclassifies **moderate-ability** examinees — your modal user.
- **Concurrent recalibration across administrations.** Guo et al. found concurrent FIPC combining multiple administrations improves new-item accuracy; and once items are well calibrated across administrations, **simultaneous linking** (Haberman, 2009) places the whole bank on one scale.
- **Retire and replenish.** Track cumulative exposure per item; retire over-exposed items; the seeding slot becomes your permanent pretesting channel — at which point you are running the same process as NAVLE or the USMLE, just smaller.
- **Recalibrate the spine itself** once you have enough real-user data to do so, and check whether the premed sample you paid for actually matched your user population. This is the moment you find out whether Stage 1's money was well spent.

---

#### Honest tradeoffs and what I would push back on

| Decision | What you give up | Why I still recommend it |
|---|---|---|
| Non-adaptive first cohort | early users get a less efficient, longer-feeling test; a worse first impression for your most valuable early adopters | The adaptivity would be running on guessed parameters anyway, so its precision benefit is largely illusory, while the calibration benefit is 4–6×. Mitigate by keeping the total short and by being transparent ("you're helping us calibrate; here's free access"). |
| Paying premeds $25/hr instead of crowdworkers $12/hr | ~46% higher cost per response ($0.59 vs $0.405); slower recruitment | The documented bias from an unmotivated, wrong-population sample is 0.3–0.6 logits = 30–60% of your routing stratum spacing. Paying 46% more per response to avoid corrupting the parameter that your entire adaptive architecture depends on is obviously correct. |
| Spine of 150 rather than full-bank | most of the bank runs on provisional Elo/p-value estimates for months | Full-bank paid calibration is infeasible on recruitment grounds, not just budget. Provisional estimates with honest uncertainty beat no product. |
| Fixing `c` = 0.25 instead of estimating it | slight model misfit on items with implausible distractors | Free 3PL guessing estimation needs 1,000+ per item and is the single largest driver of sample-size requirements. Fix it, and revisit only for spine items. |
| Landing page as QA only | forgoes a "free data" narrative that sounds appealing | 10.5 years to calibrate the bank, and it would require publishing your core asset. The narrative is wrong. |
| Reporting bands, not scaled scores, until calibrated | weaker marketing claim | Reporting a precise-looking scaled score off guessed parameters is the kind of thing that, if noticed, destroys credibility permanently. Ship honest uncertainty. |

**What would change my recommendation:** if the eligible premed pool on Prolific turns out to be large (thousands), Stage 1–2 get faster and cheaper and I would run them there with heavy quality filtering. If you can get a partnership with a university pre-health office or a premed organisation for a proctored, incentivised field test, that dominates everything above on both cost and validity — pursue it in parallel with Stage 1. And if the product's realistic ceiling is <200 weekly-active learners, the organic path never closes and you should spend proportionally more on paid calibration up front, because there is no free harvest coming.

---

## Cost and timeline models

All models below restate their inputs so any assumption can be changed and the result recomputed.

### Model A — Unit economics of a paid response

```
INPUTS
  t_item          = 75 s        [A1: MCAT pace 97.8 s/item, discounted for standalone items]
  t_overhead      = 300 s       [A2: consent + instructions + demographics + debrief]
  k               = 30 items    [A3: items per crowd session]
  reward_per_hour = $12.00      [Prolific recommended minimum, observed 2026-07-28]
  platform_fee    = 42.8%       [Prolific corporate, observed 2026-07-28]

DERIVATION
  overhead per item      = 300 / 30                = 10 s
  billable s per response = 75 + 10                = 85 s
  billable h per response = 85 / 3600              = 0.023611 h
  H (effective $/hour)    = 12.00 × 1.428          = $17.136
  COST PER RESPONSE       = 0.023611 × 17.136      = $0.4046
```

All dollar figures below use the unrounded $0.404600/response. The direct-premed column everywhere uses **k = 54** items per sitting → overhead/item = 300/54 = 5.56 s → 80.56 s = 0.0223765 h/response → **$0.559414/response** at $25/hr with no platform fee.

**Sensitivity of cost-per-response:**

| | t_item = 60 s | **t_item = 75 s** | t_item = 90 s |
|---|---|---|---|
| Prolific corp, $12/hr | $0.333 | **$0.405** | $0.476 |
| Prolific corp, $8/hr | $0.222 | $0.270 | $0.317 |
| Prolific academic, $12/hr | $0.311 | $0.378 | $0.444 |
| Connect, $10/hr, 40% | $0.272 | $0.331 | $0.389 |
| Connect, $7.50/hr, 40% | $0.204 | $0.248 | $0.292 |
| Direct premed, $25/hr, k=54 | $0.455 | **$0.559** | $0.663 |

(Direct-premed column uses k = 54 → overhead/item = 5.6 s.)

### Model B — Full-bank paid calibration (the option to reject)

```
I = 2,108 items
responses         = R × 2,108
participant-hours = responses × 0.023611
participants      = responses / 30
cost              = responses × cost_per_response
```

| R | Responses | Participant-hours | Participants | Cost @ $0.4046 | ×1.15 attrition | ×1.15 attrition ÷0.85 anchor efficiency |
|---|---|---|---|---|---|---|
| 40 | 84,320 | 1,991 | 2,811 | $34,116 | $39,233 | $46,157 |
| 100 | 210,800 | 4,977 | 7,027 | $85,290 | $98,083 | $115,392 |
| 250 | 527,000 | 12,443 | 17,567 | $213,224 | $245,208 | $288,480 |
| 500 | 1,054,000 | 24,886 | 35,133 | $426,448 | $490,416 | $576,960 |
| 1,000 | 2,108,000 | 49,772 | 70,267 | $852,897 | $980,831 | $1,153,919 |

**Recruitment feasibility overlay** (Prolific US 90-day-active pool ≈ 134,000, vendor-reported July 2026):

| R | Participants | % of entire US pool | Verdict |
|---|---|---|---|
| 40 | 2,811 | 2.1% | feasible but statistically useless |
| 100 | 7,027 | 5.2% | feasible, borderline useful, ~$98k |
| 250 | 17,567 | **13.1%** | not realistically achievable with any premed screener |
| 500 | 35,133 | **26.2%** | not achievable |

### Model C — Spine strategy (the recommended option)

```
Stage 1: 60 items × R 400 = 24,000 responses
Stage 2: 90 items × R 400 = 36,000 responses, ÷ 0.85 efficiency = 42,353
Attrition inflation: ×1.15 throughout
```

| Stage | Items | R | Raw responses | ÷0.85 efficiency | ×1.15 attrition | **Prolific corp** | **Direct premed** | Sittings |
|---|---|---|---|---|---|---|---|---|
| 1 — routing spine | 60 | 400 | 24,000 | 24,000 (self-linking) | 27,600 | **$11,167** | **$15,440** | 920 @ k=30, or **511 @ k=54** |
| 2 — full spine | +90 | 400 | 36,000 | 42,353 | 48,706 | **$19,706** | **$27,247** | 1,624 @ k=30, or 902 @ k=54 |
| **Total** | **150** | **400** | 60,000 | 66,353 | 76,306 | **$30,873** | **$42,687** | **~2,544 @ k=30, or ~1,413 @ k=54** |

Direct-premed column uses $0.559/response (k = 54, $25/hr, no platform fee).

**Same spine at reduced R, if budget is tighter:**

| Spine size | R | Responses (÷0.85, ×1.15) | Prolific corp | Notes |
|---|---|---|---|---|
| 60 | 250 | 20,294 | **$8,211** | at the working-target floor |
| 60 | 400 | 32,471 | $13,138 | recommended Stage 1 |
| 100 | 300 | 40,588 | $16,422 | reasonable compromise |
| **150** | **400** | **81,176** | **$32,844** | recommended Stage 1+2 |
| 200 | 400 | 108,235 | $43,792 | includes a full diagnostic form |

(This table applies the 0.85 efficiency and 1.15 attrition factors to the whole spine including Stage 1, so it runs slightly above Model C's staged total.)

### Model D — Landing-page harvest

```
visitors/month        = 2,000        [C: assumption, replace with real analytics]
snapshot start rate   = 25%
snapshot completion   = 70%
items per snapshot    = 12
completions/month     = 2,000 × 0.25 × 0.70 = 350
responses/month       = 350 × 12            = 4,200
```

| Target | Responses needed | Months | Years |
|---|---|---|---|
| R=250 × 2,108 items | 527,000 | 125.5 | **10.5** |
| R=100 × 2,108 items | 210,800 | 50.2 | 4.2 |
| R=250 × 150-item sacrificial pool | 37,500 | 8.9 | 0.7 |
| R=250 × 100-item sacrificial pool | 25,000 | **6.0** | 0.5 |
| R=100 × 100-item sacrificial pool | 10,000 | **2.4** | 0.2 |
| R=250 × the fixed 12-item snapshot | 3,000 | 0.7 | — |

**Traffic sensitivity for full-bank R=250:** 2,000 visitors/mo → 10.5 yr; 10,000 → 2.1 yr; 20,000 → 1.05 yr; 50,000 → 0.42 yr. Even at 50,000 monthly visitors it requires publishing all 2,108 items, which is disqualifying on its own.

**Person-level precision available:** 12 items × 0.25 information ≈ 3 → SE(θ) ≈ **0.577 logits** best case, realistically 0.7–0.9. Enough to contribute to a connected sparse calibration; not enough to score anyone.

### Model E — Organic harvest of the tail

```
I_U = 1,968 uncalibrated items (2,108 − 150 spine)
R   = 250
q   = 40 items per active learner per week
weeks = R × I_U / (q × A × s) = 492,000 / (40 × A × s)
```

| A (weekly-active) | s=0.15 | s=0.25 | s=0.50 | s=1.00 |
|---|---|---|---|---|
| 50 | 1,640 wk | 984 wk | 492 wk | 246 wk |
| 100 | 820 wk | 492 wk | 246 wk | 123 wk |
| 250 | 328 wk | 197 wk | 98 wk | 49 wk |
| 500 | 164 wk | **98 wk** | 49 wk | **25 wk** |
| 1,000 | 82 wk | **49 wk** | 25 wk | **12 wk** |
| 2,500 | 33 wk | 20 wk | 10 wk | 5 wk |
| 5,000 | 16 wk | 10 wk | 5 wk | 2.5 wk |

**Sensitivity to `q` (items/learner/week), at A = 500, s = 0.25:** q=20 → 197 wk; q=40 → 98 wk; q=60 → 66 wk; q=100 → 39 wk. Note that raising `q` is a *product* lever (engagement) that happens to also be a calibration lever.

**Caveat that the table cannot show:** these are averages over the tail. Under greedy adaptive selection *without* a seeding slot, the distribution of exposures is extremely skewed and the tail is effectively never covered — no value of `A` fixes it. The seeding slot is what makes this arithmetic meaningful at all.

### Model F — Blended plan, total cost and calendar

| Stage | Weeks | Cash (Prolific route) | Cash (premed route) | Output |
|---|---|---|---|---|
| 0 — instrumentation | 1–2 | $0 | $0 | event log, versioning, latencies, provenance, consent, reference form, sacrificial pool |
| 1 — routing spine, 60 items @ R 400 | 2–4 | $11.2k | $15.4k | real scale for stage-1 module; premed θ distribution; RT norms |
| 2 — full spine, +90 items @ R 400 | 4–8 | $19.7k | $27.2k | all 15 clusters anchored; pinned reference form calibrated |
| 3 — launch as field test | 0–26 post-launch | $0 | $0 | tail calibrated by FIPC; Elo provisional throughout |
| 4 — steady state | ongoing | $0 | $0 | drift monitoring, retire/replenish, spine recalibration |
| **Total** | **~7–14 wks pre-launch** | **~$31k** | **~$43k** | 150 items rigorously calibrated; 1,958 provisional→calibrated over 6–24 months |

Versus **$245k–$490k and an impossible recruitment requirement** for the naive full-bank study. And versus **$0 and 2–10 years** for organic-only, with a product shipping uncalibrated routing in the meantime.

---

## Option comparison

Scored 1 (poor) to 5 (excellent). "Data quality" means fitness for setting MST routing thresholds specifically.

| Option | Cash cost | Time to usable | Data quality | Risk | Overall |
|---|---|---|---|---|---|
| **(a) Wait for organic users** | 5 — $0 | **1** — 2–10 yr at plausible adoption; never, without a seeding slot | 4 — right population, right stakes, but MNAR under adaptive selection and no scale until anchored | **2** — ships an uncalibrated adaptive product; routing errors visible to users from day one; skewed exposure may permanently starve the tail | **2.5** — necessary but insufficient alone |
| **(b) Paid crowd study, full bank** | **1** — $245k–$490k | 2 — months, if recruitment were possible, which it is not (13–26% of Prolific's US pool) | **2** — wrong population; 0.3–0.6 logit bias ≈ 30–60% of stratum spacing; rapid guessing ~7% of responses; ~9% AI-assisted; MTurk unavailable from 2026-07-30 | 2 — burns 2,108 items' security; high probability of a confidently-wrong scale | **1.5** — reject |
| **(b′) Paid study, 150-item spine, real premeds** | 4 — $31k–$43k | **4** — 6–12 weeks | **5** — right population, motivated, bounded item exposure, R=400 inside 2PL guidelines | 4 — main risk is premed recruitment throughput; mitigated by dual-sourcing | **4.25** — the core of the recommendation |
| **(c) Landing-page harvest** | 5 — ~$0 marginal | 3 — weeks for QA signal; **1** for calibration (10.5 yr) | **1** — anonymous (no scale without a session key), self-selected, maximally low-stakes, bot-exposed | **1** — publishes items; scrapeable; burns the asset if not confined to a sacrificial pool | **2.5** — valuable for QA, worthless for calibration |
| **(d) Hybrid: spine + launch-as-field-test + Elo + landing-page QA** | 4 — $31k–$43k | **4** — routing correct at launch; bank converges over 6–24 months | **5** — paid spine fixes the scale; real users fix the tail on the right population; FIPC halves required N; drift monitored | **4** — main residual risk is adoption; mitigated because the spine alone makes the diagnostic honest | **4.25 — recommended** |

**Why the hybrid beats every pure option.** Each pure option fails on a *different* axis, and the failures are complementary rather than additive: organic has the right population but no scale and no speed; paid has speed and a scale but the wrong population at any affordable size; the landing page has volume but neither population nor identity. The hybrid uses paid money for the one thing money buys well — **a small, correct, anchored scale** — and uses the product itself for the one thing it does uniquely well — **large volumes of motivated, on-population responses**. FIPC is the mechanism that joins them, and it is also the mechanism that halves the required N on the expensive side.

---

## Instrument before launch

**Read this section as the answer to: "what is irreversibly lost if we don't capture it from day one?"** Everything below is cheap now. Every item marked **IRRECOVERABLE** cannot be reconstructed later at any price, and several of them silently invalidate all data collected before they are added.

### Tier 1 — IRRECOVERABLE. Ship before a single real response is recorded.

1. **Immutable, append-only response event log.** One row per response, never updated, never deleted by product logic. If you only take one thing from this document, take this. Minimum fields:
   - `response_id`, `session_id`, `person_key` (see #2), `item_id`, **`item_version_hash`** (see #3)
   - `presented_at_server_ms`, `first_interaction_at_ms`, `responded_at_ms`, **`latency_ms`** (see #4)
   - `selected_option_id` (**not just `is_correct`** — see #5), `is_correct`, `key_at_time_of_response`
   - `position_in_session`, `stage_id` / `module_id`, `elapsed_session_ms`
   - **`selection_policy_id` + `selection_policy_params` + `theta_estimate_at_selection` + `candidate_set_hash`** (see #6)
   - `delivery_context` (see #7), `stakes_flag`, `feedback_shown`, `explanation_viewed`, `is_repeat_for_this_person`, `attempt_number`
   - `client_tz`, `server_received_at` (never trust client clocks for latency)

2. **A person key on every response — even for anonymous traffic. IRRECOVERABLE.** A server-minted `response_set_id` grouping one sitting's responses is the **minimum viable identity for IRT**. Without it you have no rows in the response matrix, and therefore no θ, no discrimination, no scale, no point-biserial — only marginal p-values that are not comparable across items. This is the single mechanical requirement that anonymity breaks (§5). It needs no PII.

3. **Item content versioning by hash. IRRECOVERABLE, and retroactively poisonous.** Hash the stem, options, key, and any passage; store the hash on every response. If someone fixes a typo, clarifies a stem, or swaps a distractor, **the item's parameters are no longer valid and the pre-edit and post-edit responses must not be pooled.** Without version hashes you will unknowingly pool them, and you will never be able to find out which items were affected. Also store a `content_changed_at` audit trail and treat any change beyond pure cosmetics as **minting a new item id**.

4. **Millisecond response latency, both first-interaction and submit. IRRECOVERABLE.** Every rapid-guessing filter in the literature is a response-time-threshold method. Without latencies you cannot apply effort-moderated or hybrid-guess scoring, cannot set thresholds, cannot detect disengagement, cannot detect suspiciously *long* responses either (the LLM signature). Given that ignoring rapid guessing biases difficulty by 0.30–0.55 logits and that your routing strata are ~0.97 logits apart, this field is load-bearing for the entire product. Capture first-interaction time separately from submit time — the gap distinguishes "read then answered" from "clicked immediately."

5. **The selected option, not just correctness. IRRECOVERABLE.** Needed for distractor analysis (a distractor chosen by <5% is dead weight and makes the effective option count 3, changing the guessing floor), for nominal-response modelling, for misconception diagnosis, and for detecting miskeys (a distractor chosen more often than the key by high-ability respondents is a miskey, and you can only see that with option-level data).

6. **Selection-rule provenance: which policy chose this item, with what parameters, and what the ability estimate was at that moment. IRRECOVERABLE, and the deepest loss on this list.** Adaptive delivery creates **missing-not-at-random** data. You can only correct for it if you know the selection mechanism that generated the missingness. Without it: proportion-correct is invalid (Pelánek: under adaptive selection "the proportion correct method fails"), the MAR assumption underlying concurrent calibration is unverifiable, and a year of response data becomes uninterpretable for calibration purposes even though it looks fine. Log the policy id, its parameters, the θ estimate used, and ideally a hash of the candidate set the item was chosen from.

7. **Delivery context and stakes flag. IRRECOVERABLE.** `snapshot_teaser` / `diagnostic` / `adaptive_practice` / `review` / `paid_calibration_study` / `internal_qa`. Stakes drive effort, effort drives difficulty estimates by up to 0.59 SD, and you must be able to calibrate these populations **separately and then link them** rather than pooling them. Pooling a landing-page response with a diagnostic response as if they were exchangeable is a silent, unfixable error.

8. **Consent records and a data-use clause that permits psychometric modelling — and, if remotely plausible, research publication. IRRECOVERABLE.** You cannot retroactively obtain consent from churned anonymous visitors. Store consent timestamp, version of the policy consented to, and scope. Include region-aware handling (EEA/UK opt-in; California opt-out + GPC) even though you likely fall under CCPA's thresholds today. *Not legal advice — get counsel.*

9. **A retention policy that explicitly exempts response events. IRRECOVERABLE.** A blanket "purge analytics after 90 days" will quietly destroy the asset. Classify response events as product data with a documented long-retention basis, separate from marketing analytics.

10. **Population/stratification variables collected at onboarding. IRRECOVERABLE.** Self-reported target test date, prior official MCAT score, prior practice-test score, undergraduate year, major, weekly study hours, whether this is a retake. These are what let you (a) post-stratify to weight your calibration sample toward the operational population, (b) check whether your paid premed sample matched your real users, and (c) detect population drift. You cannot backfill them from churned users. Keep the question set short — five questions, skippable — but ask them on day one.

11. **The pinned reference form. IRRECOVERABLE as a historical link.** A fixed 40–60-item linear set spanning difficulty and clusters, delivered to a random ~5% of sessions from launch, forever, with position held constant. This is simultaneously your drift monitor, your link between every future recalibration and every past one, and your check on whether your user population is changing. It costs ~5% of delivery capacity. Starting it in month 12 gives you a link from month 12 onward and nothing before.

12. **The random seeding slot, and a non-adaptive launch mode.** Build both as configuration from day one. The `s = 1.00` non-adaptive launch is worth a 4–6× speedup on tail calibration (§6) and cannot be run retroactively — once your first cohort has been served adaptively, that data is MNAR forever.

### Tier 2 — Recoverable with effort, but far cheaper now.

13. **Bot and automation telemetry:** user-agent, headless-browser signals, paste events, tab-blur/focus-loss events, copy events, viewport, impossibly-fast completion flags, per-session and per-IP rate counters. Copy-paste is the most reliable published LLM-detection signal, and it is the *only* one available for multiple-choice items (linguistic detection needs free text). Retain a country code rather than raw IP if you can.
14. **Server-side scoring only.** Never ship the answer key to the client. Removes the easiest scraping and cheating vector and is nearly free to build now.
15. **Item exposure counters** per item and per (item, population) pair, plus a `last_exposed_at`. You need these to drive exposure control, to prioritise the seeding slot toward under-exposed items, and to decide retirement.
16. **Position and fatigue covariates:** position in session, elapsed session time, items answered today, session ordinal. Position effects on effort are documented, and BIB position-balance is only checkable if you log position.
17. **Priors and their provenance:** the expert/DOK-derived initial difficulty for each item, who or what produced it, and when. You will want to evaluate how good your expert judgements were once real data lands — that evaluation is a genuinely valuable finding and it requires having stored the original guess rather than overwriting it.
18. **Parameter estimate history**, not just current values: every difficulty estimate with its timestamp, SE, method (Elo / FIPC / concurrent), calibration-run id, and the N it was based on. Needed for drift detection, for auditing, and for answering "why did routing change last Tuesday?"
19. **Item family id on every response.** Already in your metadata; make sure it reaches the response log. Items from one family are not locally independent, which matters for calibration and for exposure control (showing two siblings to one learner leaks information).

### Tier 3 — Nice to have.

20. Confidence rating per response (cheap, and a useful disengagement and metacognition signal).
21. Device class and input modality (mobile vs desktop changes response times materially, which affects rapid-guessing thresholds).
22. A "flag this question" affordance — free crowd-sourced item QA from motivated users, which is exactly the population whose judgement you want.
23. Explanation dwell time (feeds the learning model, and distinguishes engaged review from clicking through).

---

## DOK 1 — established facts

1. **MTurk closes to new customers on 2026-07-30.** Banner read directly on mturk.com/pricing on 2026-07-28. Existing users unaffected. **[A]**
2. **MTurk fee structure (while it lasts):** 20% of reward and bonuses; **additional 20% (40% total) for HITs with ≥10 assignments**; $0.01 minimum per assignment; +5% Masters; Premium Qualifications from $0.05/assignment. **[A]**
3. **Prolific pricing (page dated 2026-03-13, read 2026-07-28):** participant reward set by researcher, **absolute minimum £6/$8 per hour, recommended minimum £9/$12 per hour**; platform fee on top of rewards of **42.8% corporate / 33.3% academic-nonprofit**; VAT on platform fees only; no charge for returns or time-outs; pre-screeners and representative samples free. **[A]**
4. **CloudResearch Connect pricing:** site minimum **$7.50/hour**, typical **$10/hour**; platform fee **40% standard / 25% academic-nonprofit** (standard raised to 40% on 2025-01-01); 10 fee-free days for new academic accounts on request. **[A]**
5. **Prolific pool size:** >350,000 90-day-active participants, >134,000 in the US, as of a July 2026 product update. Expect ~40–50% response rate from an eligible pool. **[B — vendor self-report]**
6. **MCAT operational pace:** three sections of 59 questions in 95 minutes plus CARS 53 questions in 90 minutes = **230 items in 375 minutes = 97.8 s/item**. **[A — AAMC]**
7. **The MCAT contains unscored field-test questions in every section, and AAMC does not disclose how many**, and explicitly forbids examinees from speculating about which items are field-test. **[A — MCAT Essentials for Testing Year 2026]**
8. **NAVLE composition:** 360 four-option items = **300 scored + 60 pretest (16.7%)**; pretest statistics reviewed by SMEs before an item is promoted to scored. **[A]**
9. **Prometric guidance:** pretest items should **not exceed 10%** of total items; **minimum 100 candidate exposures per pretest item** for classical test theory viability. **[A]**
10. **NBCRNA guidance:** **minimum ~100 "hits" to reliably calibrate an experimental item**; 30 sufficient for continued monitoring of an active item. **[A]**
11. **IRT sample-size heuristics:** ~**500 examinees and 20 items** adequate for 2PL / 3PL-with-fixed-c under near-normal θ and good discrimination; **1,000 and 40 items** the cautious guideline for non-normal θ, weak discrimination, or freely-estimated c (DeMars, 2010). Commonly restated as 500 for 2PL / 1,000 for 3PL. **[A as consensus heuristics]**
12. **Those heuristics are context-dependent** and current methodological guidance is to run a design-specific Monte Carlo instead; as few as 100 can suffice with informative priors, while slip/guess or mixture models can need >2,000. **[A — Schroeders & Gnambs, 2025]**
13. **NAEP uses focused BIB / pBIB spiralling**: items grouped into blocks; blocks assembled so each block appears equally often in each booklet position and is paired equally often with every other block; booklets spiralled so any group of students receives approximately equal proportions of each. Enables precise per-item results from ~90 minutes per student across a several-hundred-item pool. **[A]**
14. **Classical anchor rule of thumb:** common-item link ≈ **20% of total test length or 20 items, whichever is longer** (Angoff 1971/1984). **[A as a convention]**
15. **Empirical anchor-length results are more permissive:** equating worked with 10–30 anchors but **failed with 5** (Hills et al., 1988); 12/20/30 anchors on a 60-item set gave similar results (Yang & Houang, 1996); some IRT studies report 2–5 well-chosen anchors working. Anchor **quality** matters more than quantity. **[B]**
16. **A 2026 simulation** varying anchor proportion (5–25%), test size (20–80), model, guessing, and sample size (25–1,000) found item-difficulty recovery correlations of **r = 0.42 (n=25), 0.63 (n=50), 0.82 (n=100), 0.97 (n=500), 0.98 (n=1,000)**, and error dropping sharply from 5% to 10% anchor proportion then plateauing by 20%; effects of anchor proportion and test size are **logarithmic and mutually compensating**. **[B]**
17. **Motivated examinees outperform unmotivated ones by an average of 0.59 SD** (25 effect sizes, 12 studies, range −0.04 to 1.49); Sundre (1999) found a 0.79 SD motivation difference for scored vs unscored multiple-choice (1.59 SD for essay). **[A — Wise & DeMars, 2005]**
18. **Rapid guessing in low-stakes testing:** **28.3% of examinees** engage in it, **6.89% of item responses** are rapid guesses, and it distorts aggregated scores by an average of **0.13 SD**; meta-analysis of 25 studies, 39 samples, 443,264 examinees. **[A — Rios et al., 2022; abstract only]**
19. **Ignoring rapid guessing biases item difficulty by +0.30 to +0.55 units**; effort-moderated and hybrid-guess scoring reduce pooled MAE from 0.46 to ~0.26–0.30, while proportion-of-normative-time scoring is **worse than ignoring it** (0.62). **[B — Rios, 2023]**
20. **The literature conflicts on the direction of rapid-guessing bias on item parameters** — explicitly acknowledged in the 2025 JEDM cascading-effect paper. When rapid guessing is difficulty-driven, difficulty is overestimated and the bias worsens for less-discriminating items (η² = .20). **[B]**
21. **ChatGPT-4.0 scored 522 (99th percentile), 90.87% accuracy, on an official AAMC full-length MCAT practice exam**; Gemini 518 / 84.78%. Earlier base GPT-4 performed at or above the median of 276,779 test takers. **[B — abstract only for the 2025 study; preprint for the 2023 one]**
22. **~9% of Prolific participants submit responses consistent with AI assistance** (keystroke study, N = 928, May–July 2025); they outperformed non-cheaters by up to 1.5 SD, and this level of undetected cheating diminishes observed effect sizes by 10% and inflates required sample sizes by up to 30%. MTurk participants were significantly more likely than Prolific participants to use LLMs. **[B — abstracts]**
23. **Prolific's own quality figures:** LLM free-text detection at 98.7% precision / 0.6% false positives; bot detection "100% accuracy in testing" with 0.04% of >1M submissions flagged; 0.5% of responses rejected in 2025; ~0.99% of participants flagged for AI-generated responses in a September internal audit; anti-AI reminders reduced AI usage by 61% in internal tests. **[C — vendor self-report, no independent audit; and note these are free-text-oriented, not applicable to multiple choice]**
24. **FIPC beats separate-calibration-with-scaling for new items in an MST design across N = 250/500/1,000 and across skewed and normal θ**, performs "generally as accurate as… separate calibrations with a **doubled sample size**," allows relaxing an N=1,000 requirement to N>500, and is best implemented by fixing **routing-block items only** (which also satisfies the ≥20%-of-transformation-items requirement). Concurrent FIPC across multiple administrations improves accuracy further. **[B — Guo et al., 2025; single program, simulated]**
25. **Non-representative calibration samples produce more error in item parameters as the sample/population ability gap widens**, and larger samples reduce but do not eliminate it; invariance can hold "when the model holds in the data, the number of items is not small, and the sample size is large." **[B]**
26. **Range restriction damages estimation of extremely easy and extremely difficult items** specifically, while overall stability holds. **[B]**
27. **Ignoring an oversampling scheme causes over- or under-estimation of item and person parameters depending on direction, and generally underestimates the SE of the latent trait estimate.** **[B]**
28. **Routing errors occurred 15% of the time across conditions** in a Monte Carlo study of a 42-item three-stage MST, and adversely affected θ bias, RMSE, and SEM; θ-based routing outperformed number-correct routing. **[B — abstract only]**
29. **Three-stage MST designs misroute less than two-stage; longer tests and a wide-ability routing module reduce misrouting; misrouted examinees cluster at adjacent-module information-function intersections and in the middle of the ability scale.** **[B]**
30. **Item parameter drift in MST increases routing error rates indirectly, and moderate-ability test takers are more likely to be misclassified than low- or high-ability ones.** **[B — abstract only]**
31. **Under adaptive item selection, proportion-correct fails as a difficulty estimator; under random selection it works well. Elo achieves performance very similar to IRT under both, at far lower computational cost.** **[B — Pelánek]**
32. **Math Garden** used an Elo-based model with a response-time-inclusive scoring rule, updating item difficulty and person ability after every response, sampling items at ~0.75 success probability; 3,648 children completed >3.5 million problems in ten months. **[B]**
33. **In online CAT calibration, "the simplest random selection method appears to be a potential best choice"** among five pretest-item-selection methods across 1PL/2PL/3PL, two estimation methods, three seeding locations, and five sample sizes. **[B — abstract only]**
34. **Stocking's Method A** fixes ability estimates from operational items to calibrate pretest items; **Method B** adds pre-calibrated anchor items and a characteristic-curve transformation to correct scale drift from using estimated rather than true abilities. In an ACT comparison, MEM produced the smallest errors at N = 300/1,000/3,000, with Method B also working very well but requiring anchors (lengthening the test). **[A/B]**
35. **Sympson-Hetter** controls P(A) = P(A|S)·P(S) to keep maximum item usage below a target *r*, with control parameters set by iterative simulation; setting them is "time consuming" and does not guarantee admissibility, motivating later two-stage and on-line variants. **Randomesque** (select randomly among the top-*n* most informative) is the simple alternative. **[A]**
36. **Under GDPR + ePrivacy, legitimate interest does not override the Art. 5(3) consent requirement for storing or accessing information on a user's device**; strictly-necessary is narrow but covers authentication and user-set preferences; narrow first-party aggregate-analytics exemptions exist in France, Spain, Italy, and the Netherlands but are **not pan-EU**. **[C — secondary privacy-vendor sources, not primary law]**
37. **CCPA/CPRA is an opt-out regime** requiring a "Do Not Sell or Share" link, GPC honouring, and 15-day compliance, and applies at thresholds of **>$25M revenue, or ≥100,000 California consumers/devices, or ≥50% of revenue from selling/sharing PI**. **[C — secondary]**

---

## DOK 2 — insights and implications

1. **The binding constraint on paid calibration is recruitment, not money — and almost nobody notices this.** At R = 250 you need 17,567 participants, which is 13.1% of Prolific's entire 90-day-active US pool, before any screener. Teams reason about calibration studies in dollars, decide the number is large but conceivable, and then discover that the population physically does not exist on the platform. Always divide required N by the platform's pool size *before* costing anything.

2. **The economics of calibration are governed by one quantity — responses purchased — and there are only four levers on it: R, number of items, anchor efficiency, and effective sample multipliers like FIPC.** Booklet length and session design change *who bears the burden*, not the total. This is why "use a clever sparse design" is not a cost-reduction strategy on its own: BIB reduces per-person burden from 2,108 items to 34, which is what makes the study *possible*, but it does not reduce the 527,000 responses you must buy. The only real cost reductions are calibrating fewer items to full precision, accepting lower R, and using FIPC to make a given R go twice as far.

3. **A dedicated anchor block is a 2.2× tax that looks like good practice.** Applying the Angoff "20 items or 20%" rule to a short booklet means over half your purchased responses land on items you already know the answers for. The rule was written for pairwise chain equating of full-length forms. Under FIPC with block overlap, the same linking job is done by 4–8 anchors on a 40-item booklet. **Rules of thumb inherited from a different design regime are one of the most expensive kinds of mistake available here.**

4. **The two dominant threats to a paid calibration study push item difficulty in opposite directions, which makes them mutually camouflaging.** Rapid guessing makes items look harder (+0.30 to +0.55 logits); LLM assistance makes hard items look easier. In aggregate the p-value distribution can look entirely plausible while the **difficulty rank order** — the only thing your 3-way router actually consumes — has been scrambled. **Never validate a calibration by inspecting the marginal difficulty distribution. Validate it by checking rank-order agreement against an independent, high-effort subsample.**

5. **The right yardstick for "is this bias acceptable?" is your routing resolution, not statistical significance.** A 3-way equal-size split of a standard normal puts adjacent strata medians ~0.97 logits apart. The documented biases (0.30–0.55 logits from rapid guessing; ~0.6 logits of scale displacement from a motivation gap) are **30–60% of that spacing**. Framing the question this way converts an abstract methodological worry into a concrete product-quality argument that a non-psychometrician can act on — and it is what justifies paying premeds $25/hr rather than crowdworkers $12/hr.

6. **MCAT items are uniquely exposed to LLM contamination, because a frontier model answers them at ~91% accuracy.** This is qualitatively different from typical crowdsourcing quality problems: a cheating participant on an MCAT item does not add noise, they add a **near-ceiling response on your hardest items**. And because your items are multiple-choice, the entire platform-side LLM-detection apparatus — built for free-text linguistic analysis — does not apply to you. Prolific's ~1% AI-flag rate and the independent ~9% keystroke-based estimate differ by ~9×, and you should plan against the larger number. **Copy-paste and tab-blur telemetry is the only detection signal available for multiple choice, and it must be built into the item renderer.**

7. **FIPC is the highest-return statistical decision available, and it is essentially free.** "As accurate as separate calibration with a doubled sample size" is a 2× reduction in required N — larger than any plausible saving from platform shopping (Connect is ~20% cheaper than Prolific), and larger than any reasonable adjustment to R. It is a software choice, not a purchase. **It also dictates the whole architecture:** because FIPC needs a fixed, well-calibrated anchor set, and because Guo et al. specifically recommend fixing the routing block, "spend your money on the stage-1 routing module" falls out of the method rather than being an independent judgement call.

8. **Your MST's routing module is doing double duty and should be resourced accordingly.** It is (a) administered to everyone, so it is the only MAR-clean, self-linking part of your design; (b) the natural FIPC anchor; (c) the stage where a misroute costs the most, because six subsequent stages inherit it; and (d) the module whose width and length most strongly determine misrouting rates. Four independent arguments converge on the same 20–60 items. **That convergence is the strongest structural finding in this document.**

9. **The single largest free win is the one that expires: launching non-adaptive.** It gives a 4–6× speedup on tail calibration, makes proportion-correct valid, satisfies the MAR assumption, and costs nothing but a temporarily less efficient test for a cohort whose "efficiency" was fictitious anyway (the adaptivity would be running on guessed parameters). It cannot be run retroactively. **An adaptive product that launches adaptively before it is calibrated has permanently spent its cheapest calibration opportunity to deliver a benefit it could not actually provide.** This is the clearest example of the general principle that in cold-start psychometrics, the expensive mistakes are all made in the first week.

10. **"No identity" is usually stated as the reason a landing page cannot support IRT, but that is imprecise and the imprecision matters.** The requirement is not identity — it is a **row key**: any server-minted grouping of one sitting's responses. No email, no login, no persistent cookie. Twelve items yields SE(θ) ≈ 0.58–0.9 logits, which is poor for scoring a person but non-zero for calibrating an item within a connected sparse design. Teams that hear "IRT needs identity" build accounts they do not need; teams that hear "anonymous is fine" log responses without a session key and destroy the data. **The correct engineering statement is: mint a `response_set_id`, and you have preserved every option.**

11. **The landing page's real value is diagnostic, not quantitative, and it is available in weeks rather than years.** The interesting question it answers is not "what is item 1,847's difficulty" but "**does our expert/DOK-based difficulty ordering survive contact with real humans at all?**" If the DOK-4 items are not empirically harder than the DOK-1 items, that finding — obtainable in a month on 100 sacrificial items — should change the product roadmap far more than any single calibration number. Cheap experiments that can invalidate an assumption beat expensive experiments that refine a parameter.

12. **Item security and calibration data are in direct, unavoidable conflict, and the resolution is to designate sacrificial items rather than to compromise.** Every response you collect is an exposure. The industry answer (Prometric's contamination warning, the entire item-exposure-control literature) is that exposure is a budgeted resource. **Decide in advance which items you are willing to burn, burn those, and never let a diagnostic item touch an unauthenticated endpoint.** Item-family ids make this cheap: burn one sibling per family, keep the rest.

13. **Adaptive delivery and item calibration are structurally opposed, and the average-based arithmetic hides it.** Greedy selection maximises information for the *current examinee*, which means it deliberately avoids items whose parameters are uncertain — exactly the items you need data on. "R = 250 average responses per item" can be satisfied while a third of the bank has zero exposures. The literature's answer is inverted objectives: **item-centred adaptive calibration (van der Linden & Ren's D-VR and successors) picks the best examinee for the item rather than the best item for the examinee.** Practically, a mandatory random seeding slot captures most of that benefit, and the online-calibration comparison finding that **simple random pretest selection is competitive with sophisticated methods** is licence not to over-engineer.

14. **Elo is the right bridge from zero data to a calibrated bank, but only if you remember it has no absolute scale.** It gives you day-one provisional difficulties, real-time updates at negligible cost, graceful behaviour on streaming sparse data, and performance close to IRT under both random and adaptive selection. What it does not give you is an origin and unit, or discrimination and guessing parameters. **Run Elo for practice selection immediately; run FIPC against the fixed spine for anything that sets a routing threshold; link the two by putting spine items in the Elo stream.** Using Elo ratings directly as MST cut-points is the obvious mistake here.

15. **A promotion ladder with honest thresholds is better product design than a single difficulty number.** 100 responses → provisional (Elo + p-value; practice selection only). 250 → calibrated (eligible for MST target modules). 500 → discrimination trusted. This makes uncertainty an explicit, actionable property of each item rather than a caveat in a document, and it lets the delivery engine reason about it — e.g. never place two provisional items in the same stage, never route on a provisional item.

16. **The most expensive thing on the instrumentation list is not a field, it is a missing *reason*: selection-rule provenance.** Latencies and version hashes are individually load-bearing, but selection provenance is the one whose absence makes a year of otherwise-complete data uninterpretable. Missing-not-at-random data can only be corrected if the missingness mechanism is known. **A response log that records what happened but not why that item was chosen is a log of an experiment with no design.**

17. **Item version hashing is the quiet catastrophe.** It is the only item on the instrumentation list that is *retroactively poisonous* rather than merely absent: without it, an innocuous typo fix silently pools two different items' response data, and you cannot afterwards determine which items were affected or when. Every other missing field costs you information. This one costs you **confidence in the information you have.**

18. **The staged plan works because its stages fail independently.** If premed recruitment stalls, you still have Stage 0's instrumentation and can fall back to Prolific. If adoption disappoints, the spine alone makes the diagnostic honest, so the product is shippable. If the spine calibration turns out to be biased, the pinned reference form detects it and the FIPC architecture lets you re-anchor without redoing anything downstream. **Compare the monolithic $245k full-bank study, where a population-mismatch problem discovered afterwards invalidates the entire spend.** For a small, cost-sensitive team, sequencing for independent failure is worth more than optimising any single stage.

19. **The strategic reframe worth internalising: the item bank is not the asset — the *calibrated* item bank is.** 2,108 uncalibrated items is a content library. What converts it into an adaptive-testing asset is a scale, and a scale costs either ~$30k of the right people's time or ~1–2 years of your own users' responses. Budget for it as a capital expenditure on the core asset, not as a research line item. And note the corollary: **the calibration is also the moat.** Anyone can write or generate 2,108 MCAT items, especially now. Very few will have 500,000 real premed responses attached to them.

---

## What I could not verify

1. **The size of the premed-eligible subpool on Prolific or CloudResearch Connect.** I confirmed that Prolific has `Student status and field of study` filters and Domain Experts screeners including Medicine, and that the total US 90-day-active pool is ~134,000 (vendor-reported). **I did not verify how many are premedical students.** This is the single most important unverified number in the document, because it determines whether Stage 1's Prolific route is viable at all. **How to check in an hour:** create a workspace and call the eligible-count endpoint (`POST` with your filter set; it returns 0 when fewer than 25 qualify), or read the live count in the audience section of study setup. Then apply the 40–50% response-rate rule of thumb to get an achievable N.
2. **Actual median response time for *your* items.** I derived 75 s/item by discounting the AAMC's 97.8 s/item operational pace for standalone-with-short-passage format. This is a judgement, not a measurement, and it scales every cost figure linearly. **How to check:** time 20 items with 5 colleagues before committing to a study. A 20% error here is a 20% error in every dollar figure above.
3. **The exact number of field-test items on an MCAT form.** AAMC deliberately does not publish it and forbids speculation. The "up to 25% of some test forms" figure for USMLE comes from a physician's blog, not from NBME — **Tier C**. I could not find an authoritative pretest ratio for either program.
4. **The units of the RMSE column in the Rothe et al. anchor-proportion and sample-size tables.** The values (e.g. 15.74 at 5% anchoring, 31.46 at n=25) are too large to be logits on a conventional scale, and I did not locate the scaling definition. **Treat those RMSE values as relative comparisons only.** The correlation column is interpretable and is what I relied on.
5. **A direct quantification of how LLM-assisted responding biases item difficulty parameters.** I have the prevalence (~9% of participants), the performance level (~91% on MCAT), and the general effect on studies (10% effect-size attenuation, up to 30% sample-size inflation). I found **no study that estimates the resulting bias in item difficulty in logits.** My claim that it compresses the upper difficulty range is a **reasoned inference, not a measured result**, and is flagged as such wherever it appears.
6. **Whether Prolific's authenticity checks work on multiple-choice items.** All documentation describes free-text detection and whole-study bot detection. Since the LLM check examines free-text responses, I infer it provides **little protection for a pure multiple-choice item battery** — but I did not find this stated or contradicted. **Ask Prolific support directly before running a study.**
7. **Whether Prolific/Connect terms permit collecting responses to copyrighted or proprietary test items**, and whether either platform imposes constraints on tasks that resemble academic testing. Not investigated. Check before launching.
8. **All privacy/consent content is from secondary sources** (privacy-vendor blog posts dated 2026) rather than primary law, regulator guidance, or counsel. I did not read the GDPR, the ePrivacy Directive, or the CPRA. **The member-state analytics exemptions in particular are reported second-hand and should be verified with counsel before being relied on.** Not legal advice.
9. **MCAT annual test-taker volume.** A preprint mentions ~85,000/year and 276,779 test takers between 2019 and 2021; I did not verify against AAMC's published data. **Tier C.** It matters only for market sizing, not for any model above.
10. **Whether the 15% baseline misrouting rate transfers to a 7-stage, 20-item-per-stage design.** The 15% figure is from a 42-item three-stage MST. Your design has more stages (more routing decisions, so plausibly more cumulative error) and more items per stage (better per-stage precision, so plausibly less error per decision). **The net effect is genuinely unknown and I did not find a study on a 7-stage design.** This is worth simulating yourself before launch — it is cheap, and it is the kind of question your own MST simulation harness should be able to answer in a day.
11. **The correlation between expert/judgemental difficulty ratings and empirical difficulty.** I know from the Elo literature that expert-seeded initial ratings "in practice work very well" as *starting points* (Tier C, one sentence in one paper), and Pelánek's paper compares IRT, Elo, proportion-correct, learner feedback, and user judgement — but **I did not extract a specific correlation for expert judgement vs empirical difficulty.** This is directly relevant to how much to trust your DOK/KC-derived priors, and it is the most valuable single number I failed to obtain. Worth a targeted follow-up search.
12. **Real traffic numbers for the landing page.** Every figure in Model D rests on my invented 2,000 visitors/month. **Replace with actual analytics before drawing any conclusion from that model.** The qualitative conclusion (orders of magnitude short) survives a 10× or even 25× correction; the specific month counts do not.
13. **Retention and engagement figures for MCAT prep products** (`q` = items/learner/week, and what fraction of signups become weekly-active). Model E's `q = 40` is a guess. This is knowable from comparable products or from your own first month, and it drives the entire organic timeline.
14. **Whether FIPC's "as good as double the sample size" result transfers outside Guo et al.'s specific program.** It is one paper, one item pool, simulated data, and the authors themselves flag program-specificity while arguing the FIPC-with-routing-block recommendation "is likely to be applicable" to other MST programs. **I am leaning heavily on this single result and want to be explicit about that.** It is the load-bearing claim behind the entire spine strategy, and it deserves independent replication on your own simulated pool before you commit $30k on the strength of it.

---

## Sources

Ranked by how much they changed the recommendation. "Read" indicates how much of each source I actually consumed.

### Tier 1 — decisive for the recommendation

1. **Guo, H., et al. (2025). "Practical Considerations in Item Calibration With Small Samples Under Multistage Test Design: A Case Study."** ETS / *Journal of Educational Measurement*. https://files.eric.ed.gov/fulltext/EJ1459579.pdf — **Tier B. Read: substantial portions (abstract, literature review, methods, results narrative, full discussion and conclusion).** *Why it matters:* the only source I found that addresses exactly this problem — calibrating new items with small samples under an MST design. Supplies the FIPC-beats-separate-calibration finding, the "as accurate as double the sample size" result, the N>500 relaxation, the fix-the-routing-block-only recommendation, and the ≥20%-of-transformation-items constraint. **The single most load-bearing source in this document, and a single study.**

2. **Amazon Mechanical Turk pricing page.** https://www.mturk.com/pricing — **Tier A. Read: full page, 2026-07-28.** *Why it matters:* the closure-to-new-customers banner (effective 2026-07-30) removes a platform the team might otherwise have planned around, with two days' notice. Also the authoritative source for the 20%/40%/5% fee structure.

3. **Prolific, "What is your pricing?"** https://researcher-help.prolific.com/en/articles/445239-what-is-your-pricing — **Tier A. Read: full page, 2026-07-28; page dated 2026-03-13.** *Why it matters:* every cost figure in this document derives from the $8 minimum / $12 recommended hourly rate and the 42.8% / 33.3% platform fee.

4. **Wise, S. L., & DeMars, C. E. (2005). "Low Examinee Effort in Low-Stakes Assessment: Problems and Potential Solutions." *Educational Assessment*, 10(1), 1–17.** doi:10.1207/s15326977ea1001_1 — **Tier A. Read: the meta-analytic results passage verbatim from a PDF copy, plus abstract via the JMU repository.** *Why it matters:* the 0.59 SD motivated-vs-unmotivated gap is the foundational number for rejecting generic crowdworkers as a proxy. Also supplies Sundre's 0.79 SD scored-vs-unscored multiple-choice effect.

5. **Rios, J. A., et al. (2022). "To What Degree Does Rapid Guessing Distort Aggregated Test Scores? A Meta-analytic Investigation." *Educational Assessment*.** doi:10.1080/10627197.2022.2110465 — **Tier A. Read: abstract only.** *Why it matters:* 28.3% of examinees, 6.89% of responses, 0.13 SD distortion, across 25 studies and 443,264 examinees. The authoritative prevalence figures for low-stakes disengagement.

6. **Rios, J. A. (2023). "A Comparison of Response Time Threshold Scoring Procedures in Mitigating Bias From Rapid Guessing Behavior." *Educational and Psychological Measurement*.** doi:10.1177/00131644231168398 — **Tier B. Read: abstract plus the item-difficulty-recovery results section.** *Why it matters:* quantifies the bias in logits (+0.30 to +0.55), and shows which mitigation methods work (EM, EM-I, HG) and which are worse than nothing (PN). Directly actionable.

7. **NCES / NAEP Technical Documentation: "Student Test Form and Booklet Block Design," "Student Booklet Spiral Design," "Example of a BIB Design," and the NCES Handbook of Survey Methods NAEP chapter.** https://nces.ed.gov/nationsreportcard/tdw/instruments/cog_blockdesign.aspx, .../cog_spiral.aspx, .../booklet_design_bib.aspx, https://nces.ed.gov/statprog/handbook/naep_surveydesign.asp — **Tier A. Read: full page content for all four.** *Why it matters:* the canonical, operationally-proven planned-missingness design, with a concrete 5-block/10-booklet worked example including position and pairing balance tables. The template for §2's designs.

8. **Prometric, "Best Practices For Pretesting Exam Items."** https://www.prometric.com/test-owners/resources/best-practices-for-pretesting-exam-items — **Tier A. Read: substantial excerpt.** *Why it matters:* the ≤10% pretest ratio, the 100-exposures-per-pretest-item minimum for CTT, and the clearest statement of the volunteer-field-test tradeoffs (pool contamination, recruitment time) — which is exactly the decision the team faces.

### Tier 2 — quantified key parameters

9. **Rothe, et al. (2026). "The stability of IRT parameters under several test equating conditions." *Frontiers in Psychology* / PMC12832260.** https://pmc.ncbi.nlm.nih.gov/articles/PMC12832260/ (also https://pdfs.semanticscholar.org/1669/2600095f9763ecb15575e833890e28a92538.pdf) — **Tier B. Read: abstract, introduction, full results tables for item difficulty, and discussion.** *Why it matters:* the only source giving a systematic anchor-proportion × sample-size grid (5–25% × 25–1,000), with recovery correlations of 0.42/0.63/0.82/0.97/0.98 by N and the sharp 5%→10% anchoring improvement. Supplies the "logarithmic, mutually compensating" finding. **Caveat: RMSE units unverified.**

10. **Pelánek, R. "Applications of the Elo Rating System in Adaptive Educational Systems." *Computers & Education*.** https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf — **Tier B. Read: abstract, experimental setting, and results discussion. Publication year not verified** (the PDF is an author preprint; related Pelánek work is dated 2014 and 2017), so I cite it without a year throughout. *Why it matters:* the finding that proportion-correct works under random selection and **fails** under adaptive selection, while Elo matches IRT under both. This is the formal justification for both the seeding slot and the Elo-provisional-difficulty design.

11. **Wise, S. L., & DeMars, C. E. (2010). "Examinee Noneffort and the Validity of Program Assessment Results." *Educational Assessment*, 15, 27–41.** doi:10.1080/10627191003673216 — **Tier A. Read: abstract plus results excerpt from a PDF copy.** *Why it matters:* shows "a modest amount of rapid guessing had a pronounced effect" across three assessment designs (a 0.40 SD difference became 0.75 SD after filtering), and that motivation filtering works. The recommendation to routinely apply motivation filtering comes from here.

12. **"From Item Estimates to Test Operations: The Cascading Effect of Rapid Guessing." (2025). *Journal of Educational Measurement*.** doi:10.1111/jedm.70010 — **Tier B. Read: abstract and results excerpts.** *Why it matters:* explicitly documents that the literature **conflicts on the direction** of rapid-guessing bias, and that difficulty-driven rapid guessing overestimates difficulty with the bias worsening for less-discriminating items (η² = .20). The reason I recommend filtering rather than adjusting.

13. **Chapman, R. L., Weiss, D. J., & Suen, K. Y. (2024). "Effect of routing errors on the psychometric properties of multistage tests."** doi:10.4324/9780429263491-11 — **Tier B. Read: abstract only.** *Why it matters:* the 15%-baseline-misrouting figure for a 42-item three-stage MST, and the θ-based-over-number-correct routing recommendation. My key caveat: it is a 3-stage/42-item design, not a 7-stage/140-item one.

14. **"The Effect of Test Design on Misrouting in Computerized Multistage Testing." (2023). *International Journal of Turkish Education Sciences*.** doi:10.46778/goputeb.1267319 — **Tier B. Read: abstract and method section.** *Why it matters:* three-stage beats two-stage; longer tests and wide routing modules reduce misrouting; misrouted examinees cluster mid-scale at module-information intersections. Supports "make stage 1 wide and long."

15. **AAMC, "What's on the MCAT Exam?"** https://students-residents.aamc.org/media/9261/download — **Tier A. Read: section timing tables via targeted grep.** *Why it matters:* the 59-items/95-min and 53-items/90-min figures give the 97.8 s/item operational pace that anchors every participant-hour and cost calculation. Also confirms "unscored field-test questions on each test form" as a reason published content percentages vary.

16. **AAMC, "The MCAT® Essentials for Testing Year 2026."** https://students-residents.aamc.org/media/11711/download — **Tier A. Read: relevant excerpts.** *Why it matters:* the authoritative statement that every section "includes some 'field-test' questions… that do not count toward your score," and that examinees are forbidden from speculating which ones. Establishes that the industry leader in this exact domain uses operational seeding and treats the ratio as confidential.

17. **CloudResearch, Connect "Project Cost" help article + Connect FAQs + "Changes to Connect Pricing" blog.** https://connect-researcher-help.cloudresearch.com/hc/en-us/articles/5046181555732-Project-Cost, https://www.cloudresearch.com/cloudresearch-connect-faqs/, https://www.cloudresearch.com/resources/blog/changes-to-connect-pricing/ — **Tier A. Read: substantial excerpts of all three.** *Why it matters:* the live alternative to Prolific now that MTurk is closing, at $7.50 minimum / $10 typical hourly and 40%/25% fees — roughly 20–25% cheaper per response.

18. **DeMars, C. E. (2010). "Requirements," in *Item Response Theory*. Oxford University Press.** doi:10.1093/acprof:oso/9780195377033.003.0002 — **Tier A (as consensus). Read: abstract only.** *Why it matters:* the 500-examinees-and-20-items / 1,000-and-40-items guideline, with its conditions stated precisely (normal θ, high discrimination, fixed c). The basis for every choice of R in this document.

19. **Schroeders, U., & Gnambs, T. (2025). "Sample-Size Planning in Item-Response Theory: A Tutorial." *AMPPS*.** doi:10.1177/25152459251314798, with the companion `irtsim` R package (https://sward1.github.io/irtsim/) — **Tier A. Read: abstract and the sample-size-heuristics discussion section.** *Why it matters:* the authoritative statement that rules of thumb are context-dependent and should be replaced by a design-specific Monte Carlo — as few as 100 with informative priors, >2,000 for slip/guess models. `irtsim` supports booklet and linking designs, so it can simulate the exact BIB designs in §2. **The concrete next action after this document: simulate your own design.**

### Tier 3 — supporting and contextual

20. **"Chatbots Are Undermining Crowdsourced Research in the Behavioral Sciences: Detecting Artificial Intelligence–Assisted Cheating With a Keystroke-Based Tool." (2026). *AMPPS*.** doi:10.1177/25152459261424723 — **Tier B. Read: abstract only.** *Why it matters:* the independent ~9% AI-assistance prevalence on Prolific (N = 928, May–July 2025), the up-to-1.5-SD performance advantage of cheaters, and the 10% effect-size attenuation / 30% sample-size inflation. The counterweight to Prolific's ~1% self-reported figure.

21. **Chu, H., et al. (2025). "Evaluating the Performance of Large Language Models on the MCAT."** IEEE ICIIBMS, doi:10.1109/iciibms66230.2025.11316728; Zenodo https://zenodo.org/records/18081469 — **Tier B/C. Read: abstract only.** *Why it matters:* ChatGPT-4.0 at 522 / 99th percentile / 90.87% on an official AAMC full-length quantifies exactly how catastrophic LLM assistance is for MCAT item calibration. Caveats: small unknown author group, zero citations, venue not a measurement journal.

22. **"Performance of ChatGPT on the MCAT: The Road to Personalized and Equitable Premedical Learning." (2023). medRxiv preprint.** doi:10.1101/2023.03.05.23286533 — **Tier B (preprint). Read: results section.** *Why it matters:* corroborates the above with an earlier model at 50–81% per-section accuracy, "at or above the median performance of 276,779 student test takers." Also the source of the ~85,000/year MCAT volume figure I could not independently verify.

23. **"A Penny for Your Prompts: Experiments Detecting and Mitigating LLM Usage by Survey Respondents."** https://borowiecki.dev/pdf/2607.00403 — **Tier B. Read: abstract and summary of findings.** *Why it matters:* copy-paste browser events are the most reliable LLM-detection signal; MTurk participants use LLMs significantly more than Prolific participants; explicit instructions and survey length matter less than expected. Directly informs the telemetry list in "Instrument before launch."

24. **Prolific, "How Prolific detects bots and AI in online research" + "New authenticity checks detect AI misuse" + "Prolific sets standards for authentic human data collection."** https://www.prolific.com/resources/how-prolific-detects-bots-and-ai-in-online-research and companions — **Tier C (vendor self-report, unaudited). Read: full pages.** *Why it matters:* the platform's countermeasures and its ~1% AI-flag rate — and, critically, the fact that the LLM check is explicitly described as operating on **free-text** responses, which is why I judge it largely inapplicable to a multiple-choice battery.

25. **Buros Center licensure chapter on equating (anchor test length).** https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=1015&context=buroslicensure — **Tier A/B. Read: the anchor-test-length section in full.** *Why it matters:* the clearest statement and provenance of the Angoff 20-items-or-20% rule, plus the countervailing IRT evidence (2–5 well-chosen anchors in some studies, 15–20 in others) and the honest verdict that results are equivocal. The basis for §2's treatment of anchor size.

26. **"Choice of Anchor Test in Equating." ETS / ERIC EJ1111388.** https://files.eric.ed.gov/fulltext/EJ1111388.pdf — **Tier A. Read: introduction and simulation-design section.** *Why it matters:* establishes the NEAT design formally and the operational "minitest" practice — anchors whose mean and spread of difficulty match the total test. This is the design constraint on how to *choose* the 150 spine items, not just how many.

27. **"Bootstrap Equating Errors for the Common-item Nonequivalent Groups Design."** doi:10.37745/bje.2013/vol10n135667 — **Tier B. Read: abstract and results discussion.** *Why it matters:* accurate Rasch CINEG equating achievable at N = 500 and anchor size 20 or 20%, with negligible further gain from larger anchors — and the explicit redirection toward **anchor quality** over quantity.

28. **Kolen & Brennan-lineage online-calibration comparison: "A Comparative Study of Online Pretest Item Calibration/Scaling Methods in CAT." ACT Research Report 2000-11.** https://www.act.org/content/dam/act/unsecured/documents/ACT_RR2000-11.pdf — **Tier A/B. Read: abstract and the Stocking Method A/B descriptions.** *Why it matters:* precise descriptions of Stocking's Method A and B, and the finding that MEM produced the smallest errors at N = 300/1,000/3,000 while Method B works well but requires anchors that lengthen the test.

29. **Stocking, M. L. (1988). "Some Considerations in Maintaining Adaptive Test Item Pools." ETS Research Report.** doi:10.1002/j.2330-8516.1988.tb00289.x — **Tier A. Read: the on-line calibration methodology excerpt.** *Why it matters:* the original description of seeding uncalibrated items plus anchor items into an adaptive test and using a characteristic-curve transformation to place seeded-item parameters onto the pool metric. The intellectual ancestor of the whole Stage 3 design.

30. **"New Efficient and Practicable Adaptive Designs for Calibrating Items Online." *Applied Psychological Measurement* / PMC6906388**, and **"Optimal Online Calibration Designs for Item Replenishment in Adaptive Testing," *Psychometrika*** doi:10.1007/s11336-019-09687-0 — **Tier B. Read: abstracts and the design-criterion sections of the first.** *Why they matter:* van der Linden & Ren's D-VR design and its D-c/ED successors invert the selection objective — choose the best *examinee* for the item. The theoretically right way to spend a seeding slot, worth revisiting at Stage 4.

31. **"A comparison of five methods for pretest item selection in online calibration." (2017). *IJQRE* 4(1/2), 133–158.** https://www.inderscience.com/info/inarticle.php?artid=86500 — **Tier B. Read: abstract only.** *Why it matters:* across 1PL/2PL/3PL, two estimation methods, three seeding locations, and five sample sizes, "the simplest **random** selection method appears to be a potential best choice." Explicit licence not to over-engineer the seeding slot.

32. **Stocking, M. L. (1993). "Controlling Item Exposure Rates in a Realistic Adaptive Testing Paradigm." ETS Research Report.** doi:10.1002/j.2333-8504.1993.tb01513.x; **"A Review of Item Exposure Control Strategies for CAT 1983–2005," ERIC EJ838610**; **van der Linden (2003), "Some Alternatives to Sympson-Hetter Item-Exposure Control," *JEBS* 28(3)** doi:10.3102/10769986028003249; **Assessment Systems, "What is the Sympson-Hetter Item Exposure Control?"** https://assess.com/sympson-hetter-item-exposure-control/ — **Tier A. Read: substantial excerpts of all four.** *Why they matter:* the P(A) = P(A|S)·P(S) mechanism, the iterative-simulation burden and its non-guarantee of admissibility, the randomesque alternative, and the plain statement that CAT "is a greedy algorithm that always selects your best items" — the reason exposure is uneven and the tail starves.

33. **Klinkenberg, S., Straatemeier, M., & van der Maas, H. (2011). "Computer adaptive practice of Maths ability using a new item response model for on the fly ability and difficulty estimation." *Computers & Education*.** https://www.sciencedirect.com/science/article/abs/pii/S0360131511000418 — **Tier B. Read: abstract only.** *Why it matters:* the flagship real-world deployment of Elo-based on-the-fly calibration — 3,648 children, >3.5M problems in ten months, items sampled at ~0.75 success probability, response time in the scoring rule.

34. **Brinkhuis et al. (2018). "Learning As It Happens: A Decade of Analyzing and Shaping a Large-Scale Online Learning System." *Journal of Learning Analytics*.** doi:10.18608/jla.2018.52.3, and **"Balancing stability and flexibility: investigating a dynamic K value approach for the Elo rating system in adaptive learning environments" (2025), PMC12682724** — **Tier B. Read: substantial excerpts.** *Why they matter:* the operational case for Elo (real-time updates at negligible computational cost, versus the difficulty of real-time IRT updates), and the cold-start treatment: expert-judgement or data-driven initial ratings, or a dynamic *K*.

35. **NBCRNA (2025). Item Development Guidelines.** https://www.nbcrna.com/docs/default-source/exams-documents/item-writing/2025-item-writing-guidelines.pdf — **Tier A. Read: the calibration and Rasch sections.** *Why it matters:* an operational credentialing program stating "a minimum of 100 hits is required to reliably calibrate an experimental item… once an item is made active, a sample size of 30 is generally considered sufficient." A real-world floor, independently corroborating Prometric's 100.

36. **California Veterinary Medical Board, "Review of National Veterinary Examination" (NAVLE).** https://www.vmb.ca.gov/forms_pubs/navle_review.pdf — **Tier A. Read: examination-development and pilot-testing sections.** *Why it matters:* the concrete 300-scored + 60-pretest form composition (16.7% seeding) and the full pretest→SME review→promotion workflow, from an independent program review rather than the program's own marketing.

37. **FSMB, "2024 Annual Report on the USMLE."** https://www.fsmb.org/siteassets/usmle-step3/pdfs/2024-annual-report-on-the-usmle.pdf — **Tier A. Read: relevant excerpts.** *Why it matters:* authoritative confirmation that "some unscored items and cases may also be included in the Step examinations for research purposes." (The "up to 25% of some forms" figure comes from a blog, not from here — Tier C.)

38. **Range restriction and invariance:** **"The effect of range restriction on invariance in item response models"** doi:10.7275/13472521; **"Exploring Boundary Conditions on the Invariance Property of Item Parameter Estimates of Item Response Models"** (Academia.edu); **"Regarding Item Parameter Invariance for the Rasch and the 2-Parameter Logistic Models… Under Finite Non-Representative Sample Calibrations"** doi:10.1080/15366367.2020.1754703 — **Tier B. Read: abstracts (plus partial text for the first).** *Why they matter:* the empirical basis for §4 — error grows with the sample-population ability gap, range restriction specifically damages extreme items, and invariance holds only under model fit + adequate test length + large N.

39. **"On the effect of adding clinical samples to validation studies of patient-reported outcome item banks: a simulation study." PMC4893367** — **Tier B. Read: abstract and results discussion.** *Why it matters:* the clearest demonstration that ignoring a sampling scheme biases item and person parameters in a direction that depends on enrichment, and **underestimates the SE of the latent trait** — the dangerous failure mode of confident wrong answers.

40. **"INVESTIGATING ITEM PARAMETER DRIFT (IPD) AMPLIFICATION AND CANCELLATION AT THE TESTLET-LEVEL… IN A MULTISTAGE TEST."** doi:10.13016/m2j38km56 — **Tier B. Read: abstract only.** *Why it matters:* drift increases routing error rates indirectly, and **moderate-ability test takers are more likely misclassified** — your modal user. The argument for the pinned reference form and drift monitoring.

41. **"Improvement of Measurement Efficiency in Multistage Tests by Targeted Assignment." (2019). *Frontiers in Education*.** https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2019.00001/full — **Tier B. Read: introduction and rationale.** *Why it matters:* articulates the routing-module length tradeoff precisely — shorter starting modules waste fewer mismatched items but risk routing errors from low precision. Directly relevant to sizing your stage 1.

42. **Privacy/consent secondary sources (all Tier C, all read as excerpts, all dated 2026):** Concentio, "GDPR Cookie Consent Requirements (2026)" https://concentio.io/Blog/gdpr-cookie-consent-requirements; Consenteo, "GDPR Cookie Consent in 2026: ePrivacy, Legitimate Interest…" https://www.consenteo.com/knowledge-hub/GDPR/gdpr_cookie_consent_2026; Statnive, "Country-by-Country: A Working Map of EU Cookieless Analytics Rules in 2026" https://statnive.com/blog/eu-analytics-rules-country-by-country-2026; Vucense, "GDPR Consent Banner Guide 2026"; saasanalytics.io, "Cookie Consent for Analytics: GDPR & CCPA Guide." *Why they matter:* the consistent multi-source message that ePrivacy Art. 5(3) consent is required independently of GDPR lawful basis, that legitimate interest does not cure it, that member-state aggregate-analytics exemptions are narrow and not pan-EU, and the CCPA/CPRA applicability thresholds. **These are privacy-vendor marketing blogs, not law. Verify with counsel. Not legal advice.**

43. **Prolific supporting documentation:** "How do I use Prolific's filters?" https://researcher-help.prolific.com/en/articles/445159-how-do-i-use-prolific-s-filters (student status and field-of-study filters; 40–50% response-rate rule of thumb; count hidden below 5); eligible-count API reference https://docs.prolific.com/api-reference/filters/get-eligible-count.mdx (returns 0 below 25 participants); "Participant pool" and the July 2026 product update (350,000+ 90-day-active, 134,000+ US) — **Tier A for filter mechanics, Tier B for vendor-reported pool sizes. Read: full pages.** *Why they matter:* they define the method for resolving the most important unverified number in this document (§"What I could not verify" #1).

44. **`irtsim` R package.** https://sward1.github.io/irtsim/ — **Tier A (software documentation). Read: full README.** *Why it matters:* supports 1PL/2PL/3PL/GRM/PCM/GPCM, **booklet and linking designs**, MCAR/MAR missingness, model misspecification, and RMSE/bias/coverage criteria. It can simulate the exact BIB and FIPC designs in §2 against your own item pool. **This is the concrete tool for the "verify Guo et al. transfers to our design before spending $30k" action item.**
