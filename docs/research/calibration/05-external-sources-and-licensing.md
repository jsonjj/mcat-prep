# External and Third-Party Sources of Calibrated Difficulty

**Question owned by this review:** does calibration data, or a usable difficulty scale, already exist outside this team — and can they legitimately obtain it?

**Observation date for all pricing, terms, and availability claims: 2026-07-28.**

**This document is not legal advice.** It describes publicly posted terms and published court opinions as an engineering-decision input. Anything that would actually be relied on — administering third-party items, shipping a model trained on a licensed dataset, signing a data-use agreement — needs a lawyer before it ships.

**Evidence tiers:** **A** = strong/primary source (the actual terms page, the published parameter tables, the court opinion, the regulation). **B** = reasonable with limits (a primary source read via search extract rather than fetched in full; or my own inference from an A-tier source). **C** = weak, indirect, or single-source.

---

## Executive answer

- **No usable external difficulty scale exists for this bank.** Nothing can be bought, downloaded, or borrowed that assigns difficulty to these 2,108 items, and nothing can be linked to them without administering items the team is not allowed to administer. This is a clear negative finding, and it is the main deliverable of this review.
- **AAMC publishes aggregate score statistics and publishes no item-level parameters — by deliberate design, not oversight.** AAMC registers MCAT forms and questions under the U.S. Copyright Office "secure test" regulations (37 C.F.R. § 202.20), a mechanism whose entire purpose is to obtain copyright protection *without* depositing a public copy of the content (**A**, court opinion). Percentile-rank tables are public; item difficulty and discrimination are not.
- **The one dataset in existence with real empirical difficulty on USMLE-style items is the BEA 2024 / NBME set: 667 retired items. Its "difficulty" is a linearly transformed proportion-correct, not an IRT b-parameter** (**A**, the shared-task findings paper states this explicitly). It is no longer publicly downloadable; access is by formal application to NBME's Office of Research Strategy, evaluated against NBME's research priorities with no guarantee of approval. Even granted, 667 med-student-population p-values do not calibrate 2,108 premed items.
- **Genuine item-level IRT parameters are published, free, and commercially usable — for NAEP.** NCES publishes per-item a/b/c/d estimates for NAEP assessments, with released items and percent-correct available through the NAEP Questions Tool, and NAEP material is public domain (**A**). The content is US grade 4/8/12 school subjects, so it is worthless as difficulty *for these items* — but it is a real, free, legally clean asset for a different purpose: a realistic parameter set to simulate and pressure-test the 140-item multistage design before any response data exists. This is the one concrete "borrow instead of build" win in the whole review.
- **TIMSS also publishes true IRT item parameters, and its licence explicitly forbids commercial use.** The IEA copyright notice states publications and released items are "for non-commercial, educational, and research purposes only" and that commercial exploitation is prohibited absent written permission (**A**, read in full).
- **Every large learner-response dataset that could theoretically be used to fit difficulty is licensed NonCommercial: Eedi/NeurIPS 2020 (CC BY-NC-ND 4.0, plus a bar on sharing or printing question images), EdNet/Riiid (CC BY-NC 4.0, "for research purposes"), Junyi Academy ("Any form of commercial usage is not allowed!")** (**A** for each licence string). A commercial prep product is the paradigm case those licences exclude.
- **MedQA/MedMCQA are permissively licensed and contain no difficulty data whatsoever** — they are question-answering corpora with no response records. MedMCQA is also scraped third-party exam content, so a permissive repo licence does not clean the items' provenance (**A** on contents and repo licence; **B** on the provenance reasoning).
- **"Calibration-as-a-service" is real but is a labour service, not a data source.** Assessment Systems (assess.com) publicly lists FastTest from **$6,750/year** with IRT item banking and Xcalibre for calibration; Alpine Testing and ACS Ventures sell psychometric consulting with no public pricing. None of them supply response data. They help you calibrate data you still have to collect (**A** on the $6,750 figure and product scope; **B/landing-page-only** on the consultancies).
- **The transfer question has a hard structural answer: legally usable anchors are construct-irrelevant, and construct-relevant anchors are legally unusable.** Linking requires common items or common persons. NAEP items are administrable but measure grade-school math and reading. AAMC and NBME items measure the right construct but cannot be administered — AAMC's own bulk-purchase terms, last updated 2026-03-18, apply specifically to anyone "developing test prep products" and prohibit derivative works including "AI/LLM modeling" (**A**, read in full).
- **IRB review is almost certainly not legally required — and the team will still need it.** The Common Rule applies to research conducted, supported, or regulated by a federal agency; privately funded, non-FDA product work falls outside it (**A**, 45 C.F.R. § 46.101(a)). But Student Doctor Network requires an IRB approval letter *in the recruitment post*, and any university partnership pulls in that institution's IRB. IRB becomes a **gate to the cheap recruitment channels**, not a legal obligation. Budget for a commercial IRB if partnerships or forum recruitment are in the plan.
- **The cheapest calibration purchase available is the team's own launch.** Ship with expert-rated and DOK-derived priors, treat early users as the calibration sample, recalibrate continuously. A learner using the diagnostic for their own benefit is intrinsically motivated, which dissolves most of the 0.30–0.55 logit unmotivated-sample bias for free — a property no paid panel and no partnership can match.

---

## Findings

### 1. Published item parameters for MCAT and MCAT-adjacent tests

**AAMC / MCAT.**

What is published (aggregate, freely available):

- Percentile rank tables mapping total and section scores to percentile ranks in a typical testing year (**A** — AAMC-hosted PDF, read via search extract). Section scale 118–132, total 472–528.
- Validity and fairness research, largely republished from *Academic Medicine*: the MCAT Validity Committee program, predictive-validity studies, the design-research collection for the 2015 exam (**A** — AAMC-hosted PDFs; I fetched two of these and confirmed they are narrative research reports containing no item statistics).
- Admissions-guidance material on score use, and the general statement that forms are equated and pretested.

What is not published: **item-level difficulty, item-level discrimination, per-form raw-to-scaled conversion tables, and pretest item statistics.** I found no AAMC document containing any of these.

**How I verified the negative.** Three independent lines, which matters because "I searched and didn't find it" is weak on its own:

1. **Direct search of AAMC's published corpus.** Searched for an MCAT technical manual with item parameters; the results surfaced only the percentile tables, the validity-committee reports, and the 2015 design research. I fetched two of the AAMC PDFs and confirmed they contain no item statistics (**A/B**).
2. **The copyright mechanism AAMC actually uses forecloses publication.** In *AAMC v. Princeton Review, Inc.*, 332 F. Supp. 2d 11 (D.D.C. 2004), the court records that "AAMC registers its MCAT test forms and questions (including the answer choices) with the Register of Copyrights pursuant to the 'secure test' regulations issued by the U.S. Copyright Office. 37 C.F.R. § 202.20." Secure-test registration exists precisely so that a testing agency can register without depositing a publicly inspectable copy. An organisation using that mechanism is not going to publish per-item statistics keyed to items it is fighting to keep confidential (**A** on the quoted facts; **B** on the inference).
3. **Current contract terms confirm the posture is active, not historical.** The AAMC MCAT & PREview Official Prep Bulk Purchase Terms and Conditions (last updated 2026-03-18; I fetched and read the full text on 2026-07-28) bar copying, derivative works "(such as solutions, AI/LLM modeling)," reproduction, and commercial exploitation of "any portion" of the Prep Products, and reserve civil suit and referral for criminal prosecution. Item statistics for those items are, a fortiori, not being handed out (**A**).

A note on scaled-score conversions specifically, because the prompt asks to separate them. AAMC publishes the **score-to-percentile** mapping. I found no AAMC publication of the **raw-to-scaled** conversion for any specific form. A secondary test-prep article asserts that conversions are form-specific and not published (**C** — SEO/commentary content, not an AAMC source). Treat "AAMC does not publish raw-to-scaled conversion tables" as **B**: consistent with everything I found and with standard practice for equated high-stakes tests, but I did not find an AAMC statement saying so in as many words.

**NBME / USMLE.** Same shape, one important exception.

- Aggregate performance data (pass rates and score distributions by Step and examinee group) is published at usmle.org/performance-data (**A** — referenced in the FSMB/USMLE 2024 Annual Report, which I fetched).
- Item-level parameters are not published as a matter of course.
- **The exception, and it is the single most content-relevant asset found in this entire review:** the BEA 2024 shared-task dataset. Details in §2.

**Bottom line on Q1: a hard negative.** No item-level psychometrics for the MCAT or the USMLE are publicly available. The reason is structural (secure-test copyright registration plus active contractual enforcement), which means this will not change and is not worth revisiting.

### 2. Public and research item banks that include calibrated parameters

Each candidate the prompt named, plus what I found beyond them. Full comparison in the [Source inventory](#source-inventory).

**BEA 2024 shared task / NBME retired USMLE items — the best content match, and still not usable.**

What is actually released, precisely (**A** — I fetched the shared-task findings paper, `2024.bea-1.39`, and grepped the data-description section):

- **667** previously used, now retired multiple-choice items from USMLE Steps 1, 2 CK, and 3. Split 466 labeled training / 201 evaluation.
- Per item: stem, key, distractors; metadata for contains-image and which Step; **Difficulty**; **Response_Time**.
- **`Difficulty` is defined in the paper as "The (linearly-transformed) proportion of correct responses across all examinees who attempted a given item during a live exam. After the transformation, higher values indicated more difficult items."** This is a classical p-value on a transformed scale. **It is not an IRT b-parameter, there is no discrimination parameter, and there is no response matrix** — only per-item aggregates.
- `Response_Time` is the arithmetic mean seconds per item, including revisits.
- Sample: approximately 300+ examinees per item; statistics computed on first-time takers who were medical students at accredited US and Canadian medical schools.
- Difficulty prediction from text on this set was near-hopeless: the winning RMSE was 0.299 against a DummyRegressor baseline of 0.311. (Consistent with the sibling review's 8–18% variance figure; noted, not re-derived.)

Availability and terms: the shared-task page states access for shared-task purposes is no longer available and directs new requests to an NBME application process. Requests go through NBME's Office of Research Strategy via a Submittable form, "to evaluate data request proposals to utilize NBME or USMLE-owned data for research purposes," judged against NBME's research priorities, with submission explicitly not guaranteeing approval (**A** — I read the Submittable intake page). **I did not see the data use agreement, any eligibility rule about commercial entities, or any fee.** NBME's own site blocked automated fetching, so my read of NBME terms is limited to the Submittable intake page and the shared-task page. Flagged in [What I could not verify](#what-i-could-not-verify).

Why it does not solve the problem even in the best case: 667 items the team does not own, described by p-values rather than IRT parameters, computed on **medical students who have completed preclinical training** — not premeds. Those p-values cannot be attached to this team's items, cannot serve as anchors (the team may not administer the items), and the population is one instructional epoch removed from the target population. Its realistic value is as a **validation set for a cold-start difficulty predictor**, which is sibling review 02's lane and which that review already concluded has a low ceiling.

**NAEP — the strongest positive finding, for a purpose other than the obvious one.**

- NCES publishes **per-item IRT parameter tables** in the NAEP Technical Documentation: `a` (discrimination), `b` (location/difficulty), `c` (guessing) for 2PL/3PL items and `a`/`b`/`d` category thresholds for generalized partial credit items, organised by subject, year, grade, subscale, block, and item, with documented plausible ranges (a typically 0–2, b typically −3 to +3) (**A** — I read the TDW parameter index page and a specific 2022 grade-8 mathematics subscale table with actual numeric values).
- A CRAN package, **`NAEPirtparams`**, ships these parameters as a tidy data frame for assessments **1990–2015**, with columns for level, subject, year, subtest, a, b, c, and d1–d5 (**A** — package reference manual).
- Separately, the **NAEP Questions Tool** exposes **2,000–3,000+ released items** across nine subject areas with answer keys, scoring guides, and **percent-correct** nationally and by state and student group, searchable and sortable by difficulty and percent correct (**A**).
- **Licence: public domain.** NCES states that information on the Nation's Report Card site "is public domain and may be reproduced, published, linked to, or otherwise used without NCES' permission," and NAEP release material states it "is in the public domain (excluding any third-party copyrighted materials it may contain) and, therefore, our permission is not required to reproduce it" (**A**). **Commercial use is permitted.** The third-party carve-out matters: reading passages, photographs, and images inside items may be separately owned.
- Population: US students at grades 4, 8, and 12 (and age-based long-term-trend samples).

Why this is genuinely useful despite the content mismatch: it is a free, legally unencumbered, real-world set of **item parameter vectors with realistic joint structure** — the actual empirical spread of a, the actual a–b relationship, the actual c values for multiple-choice items. That is exactly what is needed to simulate the 140-item multistage adaptive panel, stress-test routing rules, and check whether the mastery model behaves before a single learner response exists. The alternative — drawing a and b from invented uniform distributions — produces simulations that flatter the design. See [§7](#7-beyond-the-brief).

**TIMSS — true IRT parameters, explicitly non-commercial.**

The TIMSS 2019 International Database offers free downloads of **IRT Item Parameters** and **Item Percent Correct Statistics** files for grade 4 and grade 8, plus item information files, plus the full student response microdata for 64 countries and 8 benchmarking participants (**A** — I fetched the database page in full). The methods chapter documents per-country percent-correct, point-biserial discrimination, and **RDIFF**, a Rasch difficulty estimate "expressed in the logit metric... scaled so that the average Rasch item difficulty across all items within each country was zero" (**A**).

The licence kills it. The IEA copyright notice, which I read in full on the same page: "All publications and released items by TIMSS, PIRLS, and IEA... are for non-commercial, educational, and research purposes only," and "Commercial exploitation, distribution, redistribution, reproduction and/or transmitting in any form... are prohibited unless written permission has been provided by IEA." Prior notice is required even for using IEA data sources in assessments or learning materials. Third-party materials inside items are separately carved out (**A**).

**PISA — parameters exist in the technical report; I did not verify the licence.**

The PISA 2022 Technical Report contains **Annex F, "Common and Unique Item Parameters in Each Domain, by Country and Language Tables,"** and the PISA 2022 Database publishes cognitive item data files, codebooks, and compendia as Public Use Files (**A** on the existence of Annex F and the cognitive item files — confirmed from the report's table of contents and the OECD database page; **I did not open Annex F itself and did not extract any parameter values**). PISA 2022 also ran multistage adaptive testing for mathematics and reading, so its technical report is independently worth reading for MSAT design, which is what the team is building.

**I did not read OECD's terms of use for this material and I am not going to guess at them.** Do not assume commercial reuse is permitted. Population is 15-year-olds; content is grade-school mathematics, reading, and science.

**Eedi / Diagnostic Questions / NeurIPS 2020 Education Challenge — right data shape, wrong licence.**

Two school years (Sept 2018–May 2020) of student answers to **4-option multiple-choice diagnostic mathematics questions** whose distractors encode misconceptions, from students roughly ages 7–18. Training sets exceed **17 million** answer records (the accompanying paper says "over 20 million examples" overall), with metadata on questions, students, and answers (**A** on figures; the 17M/20M discrepancy is between the project page and the paper, so treat the magnitude as ~17–20M).

This is the closest structural analogue to what the team needs — a dense response matrix over 4-option MCQs, from which anyone can fit their own IRT model rather than accepting someone else's parameters. **No published IRT parameters; you fit them yourself.**

Licence: **CC BY-NC-ND 4.0**, plus two extra conditions stated on the project page: you may not distribute modified material, and "The questions images are shared solely for the purpose of model training and must not be used for any other purpose. The question images must not printed or shared with anyone" (**A** on the licence string and conditions, read via search extract of the Eedi project page rather than a full fetch — **B** on read-completeness).

Two independent blockers for this team: **NC** excludes commercial use, and **ND** additionally complicates shipping anything derived from it. Content is also primary/secondary mathematics, not premed science.

**EdNet / Riiid — largest, cleanest, still NonCommercial.**

**131,441,538 interactions from 784,309 students** collected over 2+ years by Santa, a Korean TOEIC preparation tutor, released as four nested datasets KT1–KT4 (KT1 is question-solving logs; KT4 adds purchases, lecture consumption, self-study). Licence: **CC BY-NC 4.0 "for research purposes"** — stated identically on the GitHub README, the arXiv paper, and the leaderboard site (**A**, three independent statements).

Content is English-language test preparation. Even setting the licence aside, the only transferable thing would be modelling technique, not difficulty.

**Junyi Academy — NonCommercial, in blunt terms.**

Problem logs and exercise-relationship annotations from a Taiwanese Khan-Academy-derived mathematics platform, extracted January 2015, distributed through PSLC DataShop; ~2.6 GB of problem logs, 9.1 GB in DataShop tab-delimited format. Authorization statement: **"Any form of commercial usage is not allowed!"** (**A** — appears verbatim in the EduData documentation and in the source notebook). DataShop access is granted per project, so there is a request step on top.

**ASSISTments — flagged, not verified.**

Widely used middle-school mathematics response datasets, several of which are among the most-reused datasets in learning analytics. **I did not locate and read a specific licence document for any specific ASSISTments release in this session**, so I am not going to characterise its terms. Content is middle-school mathematics; even under a permissive licence it does not carry premed difficulty. Marked unverified.

**MedQA and MedMCQA — permissive licences, zero difficulty data.**

MedMCQA: **193,155** items (182,822 train / 4,183 test / 6,150 dev) from AIIMS and NEET-PG Indian medical entrance exams, 2.4k topics, 21 subjects, with correct answer and a written explanation. Licence is **MIT** on the GitHub repository and **apache-2.0** on the Hugging Face dataset card (**A** on both, an inconsistency worth noting).

Two problems. First and decisively: **there is no response data and no difficulty field of any kind.** The schema is question, four options, correct option, choice type, explanation, subject, topic. It is a QA benchmark. It cannot supply difficulty. Second: the items are third-party exam content aggregated from Indian entrance exams; a permissive licence applied to a repository by the people who assembled it does not convey rights in the underlying items that they may not have held (**A** on contents and licences; **B** on the provenance reasoning). MedQA is structurally the same kind of artifact; **I did not verify MedQA's licence** in this session.

**Beyond the brief: the 2025–26 wave of IRT-on-LLM-responses datasets.** A cluster of very recent public datasets *does* publish real fitted IRT parameters at scale:

- **Cross-Difficulty** (Brown/BatsResearch, Nov 2025): 1PL IRT difficulty for eight benchmarks including MMLU-Pro, GPQA-Extended, MATH, ARC, GSM8K, BBH, MuSR, IFEval, binned into deciles, estimated from thousands of model evaluations on the Open LLM Leaderboard.
- **PSN-IRT** (AAAI 2026): 4PL parameters — discrimination, difficulty, guessing, feasibility — for **41,871 items** across 11 benchmarks, plus the underlying 12-model × item binary response matrix.
- **BRIDGE** (McGill-NLP): 2PL a and b for agentic benchmarks, anchored to human task completion time.

(**A** on contents; I read the dataset cards and repository descriptions, not the files.)

**These are not human difficulty.** The respondents are language models; θ is model capability. The Cross-Difficulty paper itself reports that "human-based difficulty metrics diverge substantially from IRT difficulty scores... calculated based on LLM abilities." Listed here so nobody mistakes them for calibration data, and because the *method* is separately interesting — see [§7](#7-beyond-the-brief).

### 3. Can an external scale transfer to a bank with different content?

**What does not transfer, and why, precisely.** In IRT the ability metric is identified only up to a linear transformation. A 2PL fit determines b and a only relative to an arbitrary origin and unit convention imposed on θ in the calibration sample — conventionally θ ~ N(0,1) in that sample. So a published `b = 0.83` from NBME means "0.83 logits above the mean ability of first-time US/Canadian medical students on that exam," and a published NAEP `b = −0.902` means "0.902 logits below the mean of the US grade-8 population on that subscale." **Neither number has any interpretation in this team's system.** Copying an external b into their bank is not an approximation with some error bar; it is a category error, because the numbers live on different, unrelated scales.

Two further layers even after scale is handled: **population dependence** (the same item is genuinely easier for a population that has been taught the content — a shift, not just a rescaling) and **differential item functioning** (the shift is not uniform across items; items leaning on med-school clinical reasoning shift much more between med students and premeds than items leaning on general chemistry).

**What can transfer without any link at all.** Three things, and they are all worth having:

1. **Distributional priors on the parameters themselves.** Empirical a and b distributions from real 4-option MCQ programs — realistic spread, realistic a–b correlation, realistic c near 0.20 for four options — are legitimate, transferable, and much better than invented priors. Bayesian calibration with a sensible hierarchical prior converges faster and degrades more gracefully at small n. NAEP supplies this free and commercially usable.
2. **Rank-order structure of *design* quantities** — how many responses buy how much precision, how anchor length affects link stability. Sibling review 01's lane.
3. **Ordinal expectations from content structure.** That DOK 3 items in a knowledge component tend to be harder than DOK 1 items in the same component is a real, transferable regularity. It is ordinal, weak, and per sibling review 04, ordinal outputs tolerate parameter error well. It is not a substitute for a scale.

**What linking requires.** Either common items or common persons; you cannot link two administrations that share neither.

- **Common-item nonequivalent groups (NEAT / anchor-test design).** Both groups take a shared subset of items. Standard practice puts the anchor at roughly 20–25% of test length and requires it to be a **content and statistical miniature** of the full test — an anchor that is content-unrepresentative produces a biased link even when it is long. Implementable as concurrent calibration on the combined sparse matrix, as fixed-parameter calibration with anchor a/b held at their known values, or as separate calibration followed by a linear (mean/mean, mean/sigma, Haebara, Stocking-Lord) transformation. Assessment Systems' write-up describes these three approaches and notes that fixed-parameter calibration means feeding the common items' known parameters into the calibration of the new form (**B** — vendor educational content, correct but not a primary methods source; Kolen & Brennan is the standard reference).
- **Common persons (single-group or equivalent-groups design).** The same people take both instruments; the person parameters carry the link. Requires either the same examinees on both, or randomly equivalent groups.
- Fixed-parameter calibration against an already-calibrated anchor set is far cheaper in sample than fresh calibration — the premise the sibling reviews already established, and the reason the "buy a ~150-item spine" recommendation exists.

**Is there a legitimate design where externally calibrated items serve as anchors?** In the abstract, yes, and it is exactly the right architecture. In practice it collapses into a double bind:

| Anchor candidate | Construct-relevant to a premed MCAT bank? | Legally administrable by a commercial prep app? |
| --- | --- | --- |
| NAEP released items (parameters published, public domain) | **No** — grade 4/8/12 school subjects | **Yes** (minus third-party passages/images) |
| TIMSS / PISA released items (parameters published) | **No** — grade-school math/science/reading | **No** — IEA is explicitly non-commercial; OECD terms unverified |
| AAMC Official Prep items | **Yes**, perfectly | **No** — see below |
| Live/retired secure MCAT items | **Yes** | **No** — secure test, copyright, examinee agreement |
| BEA 2024 retired USMLE items | Partly (style yes, population and level no) | **No** — not licensed for redistribution or product administration; and only p-values exist, not b |

**Legally usable anchors are construct-irrelevant; construct-relevant anchors are legally unusable.** There is no clever design that escapes this, because linking validity *requires* the anchor to measure the same construct as the operational items. Using grade-8 mathematics items as an anchor to link an MCAT biochemistry bank would produce a mathematically well-formed transformation of a meaningless quantity.

**The copyright and test-security problems with administering someone else's items, concretely.** Not abstract risk — this is the most heavily litigated corner of educational publishing:

- Test items, including the answer choices, are copyrightable literary works given minimal originality. AAMC and ETS register them under the secure-test regulation, 37 C.F.R. § 202.20 (**A**).
- *AAMC v. Princeton Review, Inc.*, 332 F. Supp. 2d 11 (D.D.C. 2004): AAMC sued a test-prep company for copyright infringement, trade secret misappropriation, and fraud over compromising MCAT confidentiality. The opinion records the examinee agreement: all test materials are AAMC property and must be returned, no portion may be retained, and "test takers are not permitted to duplicate or record (by copying, photographing, **memorizing**, or any other means) any part of the MCAT" (**A**). Princeton Review's counterclaims — adhesion contract, First Amendment, copyright misuse — were raised, i.e. the "these restrictions are unenforceable" argument has already been tried by a well-resourced defendant.
- *ETS v. Katzman*, 793 F.2d 533 (3d Cir. 1986): a test-prep company distributed "facsimile" tests containing verbatim or near-verbatim SAT and Achievement Test items, allegedly obtained partly by having employees register and sit the exam. ETS was forced to retire at least 289 items (**A**). The remedy landscape — injunctions plus the victim's item-replacement costs — is what makes this expensive rather than merely embarrassing.
- **AAMC MCAT & PREview Official Prep Bulk Purchase Terms and Conditions** (last updated 2026-03-18; fetched and read in full 2026-07-28) is the operative document for this team specifically, because it self-declares that it governs "an individual who is a pre-health advisor, researcher, works for a test prep company, or **are developing test prep products**." Salient provisions (**A**):
  - Bulk purchase is restricted to individuals offering an MCAT/PREview preparation Course, pre-health advisors, or those "otherwise permitted by the AAMC." A Course "must provide original content... for the avoidance of doubt a Course must be more than explanations or examples of how to solve specific AAMC items."
  - Access Codes may be distributed only to Authorized Employees and enrolled Students; no individual resale; Prep Products "may not be the differentiating feature between the Company's offerings."
  - Copyright clause: you may not "copy, create derivative works (such as solutions, **AI/LLM modeling**), record, display, distribute, publish, reproduce, publicly perform, modify, resell, sell, transmit any portion or otherwise exploit for any commercial purpose the contents of the Prep Products or Hub in whole or in part."
  - Recorded instructional video use of Prep Product material is permitted **only** if the purchaser has bought **$20,000** of Code Bank products in the prior 12 months, and only under five further conditions.
  - Browser extensions, plug-ins, or "similar technologies that interact with, modify, or access" the Hub require a separate negotiated written agreement.
  - AAMC may demand promotional and teaching materials for compliance review; remedies include termination without refund, loss of bulk-purchase rights, civil suit, and referral to prosecutors for criminal investigation.

  The practical reading: **routing purchased AAMC items through their platform to harvest learner responses, in order to calibrate a commercial adaptive engine, sits directly on top of the "derivative works / commercial exploitation" prohibition** — and, separately, on the purchase-eligibility restriction. Do not do it. (Not legal advice; this is a "get counsel before anyone builds it" flag, and I expect counsel to say no.)

### 4. Commercial routes

**Calibration-as-a-service and psychometric consulting.** These are real, reputable, and frequently misunderstood as data vendors.

- **Assessment Systems Corporation (assess.com).** FastTest, an item-banking and delivery platform with native IRT, CAT, LOFT, multistage, and Angoff support; publicly advertised as **"Transparent pricing — Starts at $6,750/year"**, contrasted on their own comparison table against "Big Corporations" at "often $50k minimum." They also sell **Xcalibre** for IRT calibration, IRTEQ for conversion equating, and PhD psychometrician consulting. FastTest explicitly supports storing calibrated IRT parameters in the item bank, uploaded from Xcalibre or R (**A** on the $6,750 figure and feature claims — read from their own product page; consulting rates are not public).
- **Alpine Testing Solutions** (Orem, UT) — test development, psychometrics, credentialing data management, exam security. **Landing page only; no public pricing.**
- **ACS Ventures** — psychometric analyses, item and test development, standard setting, alignment, program audit. **Landing page only; no public pricing.**

**The skeptical point that matters:** none of these vendors sells calibration *data*. They sell software and expert labour that turn *your* response data into parameters. Engaging one does not shorten the path to a calibrated bank by a single response. For a small, cost-sensitive team that has already scoped the statistical work, the honest read is that a $6,750/year platform is competing against `mirt` in R at $0, and the consultancies are competing against the sibling reviews already written. The defensible reason to buy is a defensibility or audit requirement, which an adaptive practice app does not have.

**Item-bank licensing that includes parameters.** **I found no vendor publicly offering an MCAT-domain item bank with IRT parameters attached.** Negative finding, moderately confident (**B** — absence of evidence from public search; such deals are typically private, so a bespoke approach to a small prep publisher is not ruled out).

What the search surfaced instead, and why each fails:

- **Opus Vidya** — white-label question banks and study material with "full usage rights," "no attribution required," LMS upload services. Catalogue is CBSE grades 1–12 and Indian competitive exams (Banking, SSC, UPSC, Railways, CAT). No MCAT. No mention of psychometric parameters. **Landing page only; no pricing observed** (**C** on suitability — a vendor marketing site).
- **PrepareBuddy** — white-label test-prep platform for institutes; their own comparison page states they cover 11+ tests and **"does not cover MCAT/LSAT."** Same page asserts Kaplan offers co-branded/partnership arrangements but that "full white-label... is not the standard model" for Kaplan (**C** — this is a competitor's marketing claim about Kaplan, not a Kaplan source; do not rely on it).
- **Kaplan, Blueprint, UWorld, Jack Westin** and similar MCAT publishers: no public offer to license items with psychometrics. And even if one did, whatever parameters they hold are (a) on their own customer population's scale, (b) derived from unproctored low-stakes practice with unknown attempt-count and repeat-exposure handling, and (c) commercially sensitive trade secrets they have no incentive to sell to a new competitor.

**Panel access to premed populations.** Sibling review 03 owns the cost model; this is the *feasibility of targeting* question, which is different and independently blocking.

- **Prolific** offers 300+ free prescreeners covering age, employment, education level, income, health conditions — but **no premed prescreener exists.** Reaching premeds requires **custom screening**, either as an in-study branching screener or as the **two-study approach**: run a cheap screening study, then invite qualifying participants to the main study. Prolific's own documentation is explicit that you must budget for **both** the screening payments — minimum **£0.10 / $0.14 per screened participant** — **and** the full main-study reward for those who qualify, and that because they do not store the attribute, **they cannot estimate how many people you will need to screen** (**A** — Prolific researcher help pages, read via search extracts).
- Pool size: one Prolific resource page states "over 130,000 active participants." Undated on the page (**B/C** — plausible and roughly consistent with sibling review 03's finding that the full bank would consume ~13% of the active US pool, but treat the number as approximate).
- **Prolific Audience Finder** is marketed for rare/expert samples including healthcare domains; **pricing not public** (**C**).
- The compounding problem: premeds are a small fraction of the general panel, so the screen-out cost is large and unpredictable, and the ones you do find are being paid to answer MCAT questions they have no stake in — which is precisely the unmotivated-sample condition that biases difficulty by 0.30–0.55 logits. **Paying a general panel to screen for premeds buys you the expensive version of the biased sample.**

### 5. Licensing and terms constraints

Not legal advice. Per-dataset flags are in the [Source inventory](#source-inventory); this section covers the cross-cutting issues.

**Copyright in test items.** Individual multiple-choice items, including the option set, are protected as literary works given minimal originality; the *selection and arrangement* of a released-item collection can also be protected independently of the items. Secure-test registration under 37 C.F.R. § 202.20 lets a testing agency register without a public deposit — so "it isn't in the Copyright Office catalogue with a readable copy" tells you nothing about whether it is protected (**A** on the mechanism, via the *Princeton Review* opinion; **B** on the compilation point, which is general copyright doctrine I did not source in this session).

**"NonCommercial" is the single most consequential term in this review, and it is not soft.** CC BY-NC and CC BY-NC-ND 4.0 condition use on the purpose not being "primarily intended for or directed toward commercial advantage or monetary compensation." A paid MCAT prep application is the paradigm case on the wrong side of that line. Two practical consequences that teams routinely get wrong (**B** — my reasoning from the licence text, not a legal opinion):

- **Training on NC data for a shipped product is a commercial use of the data.** "We only used it to fit priors, we don't distribute it" does not obviously help; the use is directed toward commercial advantage.
- **BY-NC-ND (Eedi) adds a separate problem beyond NC**: no distribution of adapted material. Model weights or derived parameter tables are plausibly adapted material. Even a non-commercial research prototype has to be careful what it ships.

**Per-dataset flags, individually:**

| Dataset | Licence | Commercial use |
| --- | --- | --- |
| NAEP items, parameters, percent-correct | US public domain (third-party materials inside items carved out) | **Permitted** |
| TIMSS 2019 parameters + microdata | IEA: non-commercial, educational, research only; prior notice for use in assessments/learning materials | **Prohibited** without written IEA permission |
| PISA 2022 parameters + cognitive files | **Not verified — did not read OECD terms** | **Unknown — do not assume** |
| Eedi / NeurIPS 2020 | CC BY-NC-ND 4.0 + no sharing/printing of question images | **Prohibited** |
| EdNet / Riiid KT1–KT4 | CC BY-NC 4.0, "for research purposes" | **Prohibited** |
| Junyi Academy | "Any form of commercial usage is not allowed!" | **Prohibited** |
| ASSISTments | **Not verified** | **Unknown** |
| MedMCQA | MIT (GitHub) / apache-2.0 (HF card) — inconsistent; underlying items are third-party exam content | Permitted by the repo licence; **item provenance unresolved** |
| MedQA | **Not verified** | **Unknown** |
| BEA 2024 / NBME 667 items | Application to NBME ORS, "for research purposes"; **DUA not seen** | **Unknown; assume research-only** |
| AAMC Official Prep | Proprietary; bulk terms bar derivative works incl. AI/LLM modeling | **Prohibited** |
| LLM-benchmark IRT sets (Cross-Difficulty, PSN-IRT, BRIDGE) | Varies by repo; **not individually verified** | **Unknown — and the parameters are LLM-population anyway** |

**Scraping competitor MCAT-prep products: two independent reasons not to, and the second is the one that should settle it.**

*Terms of service and copyright.* Prep vendors' terms prohibit automated access, reproduction, and reuse; AAMC's terms go further and specifically prohibit browser extensions or "similar technologies that interact with, modify, or access" the Hub absent a separate written agreement (**A** for AAMC). Beyond contract, the items themselves are copyrighted expression, so copying them is an infringement question that does not depend on how you obtained them. Scraping behind an authenticated paywall is a materially worse posture than scraping a public page. I deliberately am not citing specific scraping case law here because I did not verify any of it in this session.

*Reliability — the reason this fails even if it were permitted.* Suppose the team scraped a competitor's displayed "X% of users answered this correctly." That number is unusable as calibration data:

- It is a **raw p-value, not an IRT parameter**, so it has the competitor's user ability distribution baked into it and is confounded with it. Two items with identical p-values on differently-abled user bases have different difficulties.
- The **population is self-selected and non-comparable**: paying customers of that competitor, at unknown and varying points in their study cycle.
- **Attempt semantics are unknown and unknowable from outside**: first attempt only, or all attempts? Are review-mode re-answers counted? Are the many users who saw the explanation and re-answered included?
- **Answer-sharing contamination**: high-traffic prep items circulate on Reddit and Discord, which inflates observed p-values on exactly the most-exposed items — non-randomly.
- It is **non-auditable and adversarially manipulable**. A vendor with any anti-scraping sophistication can add noise to displayed statistics, and you would never know.

A calibration input you cannot audit, cannot define the population for, and cannot define the denominator of is not a calibration input. **This route is not a shortcut with legal risk; it is legal risk with no shortcut attached.**

### 6. Partnership and low-cost motivated-sample routes

**Is IRB review even applicable to a commercial product? Usually not legally — and you will very likely need it anyway.** This is the most commonly misunderstood point in the brief, so stating it carefully:

- The **Common Rule** applies to "all research involving human subjects conducted, supported, or otherwise subject to regulation by any Federal department or agency that takes appropriate administrative action to make the policy applicable" — 45 C.F.R. § 46.101(a) (**A**, read from both the eCFR text and HHS/OHRP's own regulatory-text page). Federal funding or a covered federal agency is the trigger. A privately funded company collecting response data for its own product development is **outside** it.
- **FDA regulations (21 C.F.R. Parts 50 and 56)** trigger on FDA product jurisdiction — a drug, device, or biologic — **independently of funding**. An MCAT prep app has no FDA-regulated article, so this does not apply (**A/B** — the regulatory logic is A-tier; the comparison table I read summarising the two triggers is B-tier secondary).
- So: **no legal IRB requirement.** Vendor commentary agrees that non-federally-funded, non-FDA research typically does not legally require IRB review while noting companies often seek it anyway (**C** — a commercial IRB's own marketing page; consistent with the A-tier regulation, which is why I'm comfortable stating it).

**Four practical triggers that make IRB de facto mandatory, and this is the actionable part:**

1. **Any university partnership.** If a university becomes engaged in the research, that institution's own policy governs. Many institutions extend their Federalwide Assurance to *all* human-subjects research at the institution regardless of funding source. A premed-program or postbac partnership will run through the partner's IRB, on the partner's timeline, and the partner's IRB will ask why a commercial entity is collecting student data.
2. **Recruitment channel gates.** Student Doctor Network permits recruitment posts only if "The research must be IRB-approved" **and** "The approval letter must be included in the post," with transparency about purpose and no cross-posting (**A** — SDN's own help page). This is the single cleanest free channel to motivated premeds and it is IRB-gated at the door. Subreddits impose their own self-promotion and research-recruitment rules per community.
3. **Publication**, if the team ever wants to publish the calibration study as credibility marketing.
4. **Anything touching minors** — a public premed recruitment campaign can catch 17-year-olds.

**Conclusion:** treat IRB as a **~$1–3k access key to the cheap recruitment channels** rather than a compliance obligation. Commercial/independent IRBs review this kind of low-risk educational data collection routinely; **I did not verify any specific vendor's fees or turnaround**, so do not plan around a number until quoted.

**Consent questions that arise regardless of whether an IRB is involved:**

- **Disclosure that responses calibrate the product.** Learners should be told their answers train the difficulty model. This is cheap to say and expensive to have concealed.
- **The genuinely hard one: what do you tell a learner whose diagnostic used uncalibrated items?** During calibration the 140-item diagnostic's output is less trustworthy than it will later be. Per sibling review 04, ordinal outputs survive parameter error but scaled scores and stated confidence intervals do not — so the honest design is to *withhold* the precise scaled score and interval during the calibration window and report ordinal strengths/weaknesses. That is a product decision with an ethics dimension, not just a psychometric one.
- **FERPA** if a university supplies any student-level data or rosters.
- **GDPR/UK GDPR** if any participants are in the EU or UK; state privacy laws otherwise.
- **The "free labour for a commercial product" optics.** Premed communities are sophisticated, tight-knit, and vocal. An arrangement where students supply calibration data and get nothing back will be read that way and said out loud in the exact forums the team needs. Reciprocity is not just ethics here; it is the growth channel.

**Partner archetypes, ranked by how well they solve the motivation problem — which is the thing that actually determines data quality:**

1. **University postbac premed and formal MCAT-preparation programs. Best route by a clear margin.** Cohort-based, ability-appropriate, and crucially the *instructor can assign the diagnostic as coursework*, which supplies real motivation through course context rather than through payment. That directly attacks the 0.30–0.55 logit unmotivated-sample bias — the single largest threat to the whole exercise. Deal shape: free institutional licence plus an aggregate class-level readiness dashboard for the program director (something they currently pay for or lack entirely), in exchange for de-identified item-response data under a data-use agreement. Cost to the team: near zero cash, plus IRB and DUA effort. Expect a semester of lead time.
2. **Pre-health advisors and NAAHP-affiliated advising offices.** Broad reach, low cost, and note the AAMC's own bulk-purchase terms treat pre-health advisors as an authorized channel — relevant background if the team ever wants a legitimate relationship with AAMC content for advisees, though **not** a route to harvesting AAMC items.
3. **Independent and regional MCAT tutoring companies.** Kaplan and Blueprint have no reason to help a competitor; small shops and solo tutors do. Deal shape: free question bank plus white-label student reporting, in exchange for response data. Caveat: their students are a selected high-motivation, higher-resource slice, so the ability distribution is shifted and compressed. That degrades discrimination estimates more than it degrades difficulty rank order — acceptable, given the ordinal-tolerance finding, but it must be recorded as a known property of the calibration sample rather than discovered later.
4. **Premed student organisations.** AMSA's national Premedical Research Project is a working proof of concept for this channel: it ran with national IRB approval through the University of Vermont, spanned 15+ institutions and 1,000+ participants, and was announced on both AMSA's site and SDN (**A** — read both pages). Also Alpha Epsilon Delta chapters and campus premed clubs. Deal shape: chapter-level partnership with recognition for the chapter, which is itself a currency for student organisations.

**Where premed students actually congregate online:** r/premed and r/Mcat on Reddit (largest, and mod-permission-gated with strict self-promotion rules — the biggest audience and the easiest to get banned from); Student Doctor Network forums (IRB letter required in-post, plus an optional "Verified Researcher" badge); MCAT study-group Discord servers; premed creators on TikTok and Instagram; campus pre-health listservs and advising newsletters.

**What incentive works for this population.** Cash is the wrong instrument, and not only because it is expensive. Premeds are money-poor, time-poor, and single-mindedly focused on score improvement and CV lines. Ranked by expected yield per dollar:

1. **Free full access to the paid product.** Strongest and cheapest, and it is the only incentive that *also* fixes motivation — a learner practising for their own MCAT is intrinsically motivated, under something close to real stakes, from the ability distribution you actually care about. This is not a workaround for the biased-sample problem; it is the solution to it.
2. **A genuinely useful personalised report** they cannot get free elsewhere — knowledge-component-level strengths, a study plan. High perceived value, near-zero marginal cost.
3. **A verifiable credential**: named beta tester, student advisory board member, campus ambassador. Costs nothing and is CV-legible to a population that thinks in CV lines.
4. **A small number of paid campus ambassador roles** at chapters, which buys recruitment leverage rather than individual responses.
5. **Raffles for AAMC Official Prep bundles.** Attractive to the population, but **verify before promising**: AAMC's bulk-purchase terms restrict who may buy in bulk and to whom Access Codes may be distributed, so a "win an AAMC bundle" promotion run by a test-prep-product developer needs checking against those terms first.

### 7. Beyond the brief

**Three things worth acting on that fall outside the six numbered questions.**

**a) Use NAEP's published parameters as a free simulation testbed — the one real "borrow" available.** The team has to design a 140-item multistage adaptive panel, routing rules, and a mastery model *before* any calibration data exists. Doing that against parameters drawn from invented uniform distributions produces simulations that systematically flatter the design, because real item pools have a-b covariance structure, a-parameter skew, and gappy difficulty coverage that uniform draws do not reproduce. NAEP gives thousands of real published a/b/c vectors from real 4-option multiple-choice programs, free, public domain, commercially usable, and available as a tidy R data frame via `NAEPirtparams`. Sample from the empirical NAEP parameter distribution, simulate the panel, and find out which routing rules are fragile *before* spending money on responses. This does not tell them anything about their items. It tells them whether their design survives realistic items, which is a question they currently cannot answer at all.

**b) A cheap, licence-clean pseudo-calibration experiment: fit IRT on an LLM ensemble answering their own items.** The 2025–26 literature (Cross-Difficulty, PSN-IRT with 41,871 items, BRIDGE) establishes the machinery for treating models as examinees and fitting 1PL–4PL parameters from a model × item response matrix. Applied to this team's own 2,108 items there is **no licensing problem at all**, because they own the items. Cost is inference over ~2,108 items × N models.

Stated honestly: this is **not** a plan and it is **not** validated. It is a distinct hypothesis from the text-feature and single-LLM-prediction approaches that sibling review 02 found explain only ~8–18% of difficulty variance, because it uses *response patterns across models of differing ability* rather than surface features — but the Cross-Difficulty authors themselves report that LLM-derived difficulty "diverge[s] substantially" from human difficulty metrics, and BEA 2024's LLM-answering entries did not dominate that leaderboard. **Tier C.** The right framing is a cheap experiment with a built-in evaluation: generate LLM-ensemble difficulty now, hold it aside, and correlate it against real difficulty once the first few thousand human responses land. If the correlation is strong it is a free cold-start prior for every future item; if it is weak, that is a one-time cost to learn.

**c) Budget for the fact that external data cannot solve the recurring version of this problem.** Whatever the team calibrates, their items will leak — this is a population that organises around sharing MCAT content on Reddit and Discord, and *ETS v. Katzman* is the industrial-scale version of the same dynamic. Leaked items drift easier, non-randomly, and exactly the high-exposure items drift most. That means item retirement, exposure control, and continuous recalibration are permanent operating costs, not a one-time project. It also reframes the whole review: the value of building an internal calibration pipeline is not that it produces parameters once, but that it is the only mechanism that keeps producing them. No external purchase substitutes for that, which makes the negative finding here considerably less painful than it first looks.

---

## Source inventory

| Candidate | What is actually released | Item count | True IRT parameters? | Population | Licence | Commercial use | Usefulness here |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **AAMC / MCAT** | Percentile-rank tables, validity research, admissions guidance | n/a | **No** — no item-level statistics published at all | US MCAT examinees | Proprietary; secure-test registration 37 C.F.R. § 202.20; Official Prep terms bar derivative works incl. AI/LLM modeling | **No** | **None.** Structural, permanent negative |
| **NBME / USMLE aggregate** | Pass rates and score distributions at usmle.org/performance-data | n/a | **No** | US/Canadian med students | Proprietary | **No** | None |
| **BEA 2024 / NBME retired USMLE** | Stem, key, distractors, has-image, Step, **transformed proportion-correct**, mean response time | **667** (466 train / 201 eval) | **No** — p-value on a transformed scale; no a, no b, no response matrix | First-time takers, accredited US/Canadian med schools, ~300+ per item | Application to NBME Office of Research Strategy, "research purposes"; **DUA not seen** | **Unknown; assume no** | Low. Best *style* match in existence, but wrong population/level, aggregate p-values only, items not usable as anchors. Realistic use: validation set for a cold-start predictor |
| **NAEP (NCES)** | Per-item **a, b, c** (2PL/3PL) and **a, b, d** (GPCM) tables in TDW; `NAEPirtparams` R package 1990–2015; released items + percent-correct via NAEP Questions Tool | 1000s of parameter rows; 2,000–3,000+ released items | **Yes** | US grades 4/8/12 (+ age-based LTT) | **US public domain**, third-party materials inside items carved out | **Yes** | **Highest of any external source — for simulation, not difficulty.** Realistic empirical parameter distributions to stress-test the 140-item MSAT design. Zero content relevance to premed |
| **TIMSS 2019 (IEA)** | IRT item parameter files, item percent-correct files, item information, full student microdata; Rasch RDIFF in logits | Full G4 + G8 pools, 64 countries | **Yes** | Grade 4 and 8, 64 countries | **IEA: non-commercial, educational, research only**; prior notice for use in assessments/learning materials | **No** | None. Licence excludes them, content irrelevant |
| **PISA 2022 (OECD)** | Technical Report **Annex F**: common and unique item parameters by domain, country, language; cognitive item data files as Public Use Files | Full pool | **Yes** (existence confirmed; **not opened**) | 15-year-olds, ~80 systems | **Not verified — did not read OECD terms** | **Unknown** | Low for difficulty. Technical Report is separately worth reading for MSAT design (PISA 2022 ran MSAT for maths and reading) |
| **Eedi / NeurIPS 2020** | Full student × 4-option-MCQ response records + question/student/answer metadata | ~17–20M responses | **No published parameters** — but a dense response matrix you can fit yourself | Ages ~7–18, mathematics, UK platform | **CC BY-NC-ND 4.0** + question images "solely for... model training," must not be printed or shared | **No** | None. NC blocks it, ND compounds it, content is school maths |
| **EdNet / Riiid** | KT1–KT4 interaction logs incl. self-study, lecture consumption, purchases | **131,441,538** interactions, 784,309 students | **No published parameters**; response matrix available | Korean TOEIC learners | **CC BY-NC 4.0, "for research purposes"** | **No** | None |
| **Junyi Academy** | Problem logs + exercise prerequisite-relationship annotations | ~2.6 GB logs (9.1 GB DataShop format) | **No** | Taiwanese maths learners, to Jan 2015 | **"Any form of commercial usage is not allowed!"**; DataShop per-project access | **No** | None |
| **ASSISTments** | Learner response logs, multiple releases | Varies | **No** | US middle-school maths | **Not verified** | **Unknown** | None regardless — content irrelevant |
| **MedMCQA** | Question, 4 options, correct option, explanation, subject, topic | **193,155** (182,822 / 4,183 / 6,150) | **No — no difficulty or response data of any kind** | n/a (AIIMS & NEET-PG exam content, India) | MIT (GitHub) / apache-2.0 (HF card); **underlying items are third-party exam content** | Repo licence permits; **item provenance unresolved** | Content/practice-item source at best. Zero calibration value |
| **MedQA** | USMLE-style QA pairs | — | **No** | n/a | **Not verified** | **Unknown** | Zero calibration value |
| **Cross-Difficulty / PSN-IRT / BRIDGE** | Fitted IRT parameters (1PL / 4PL / 2PL) + model×item response matrices over LLM benchmarks | 41,871 items (PSN-IRT); 8 benchmarks (Cross-Difficulty) | **Yes — but θ is LLM capability, not human ability** | **Language models, not people** | Per-repo; **not individually verified** | **Unknown** | Not usable as human difficulty. The *method* is worth testing on their own items (§7b) |
| **Assessment Systems (assess.com)** | FastTest platform (IRT item banking, CAT, MST, LOFT), Xcalibre calibration, IRTEQ, PhD consulting | n/a — **no data** | n/a | n/a | Commercial | Yes | Software/labour only. **From $6,750/year** (their published figure). Competes with `mirt` at $0 |
| **Alpine Testing Solutions** | Test development, psychometrics, exam security, credentialing data mgmt | n/a — no data | n/a | n/a | Commercial | Yes | **Landing page only, no pricing.** Labour, not data |
| **ACS Ventures** | Psychometric analyses, item/test development, standard setting, audit | n/a — no data | n/a | n/a | Commercial | Yes | **Landing page only, no pricing.** Labour, not data |
| **Prolific** | Panel access; 300+ prescreeners but **no premed prescreener** | n/a | n/a | ~130,000 stated active participants | Commercial | Yes | Premeds reachable only via custom screening / two-study approach, **≥£0.10/$0.14 per screened participant plus main reward**, screen-out rate unpredictable by Prolific's own statement. Also the unmotivated-sample condition |
| **Opus Vidya / PrepareBuddy** | White-label question banks and prep platforms | — | **No** | Indian competitive exams / 11+ international tests | Commercial | Yes | **No MCAT coverage; no psychometric parameters advertised. Landing pages only** |

---

## What is legitimately usable

1. **NAEP published IRT item parameters (`a`, `b`, `c`, `d`) and released-item percent-correct.** Public domain, commercially usable, free. Use for: empirical priors on parameter distributions for 4-option MCQs, and as a realistic parameter set for simulating the 140-item multistage design and mastery model before any response data exists. **Do not** use as difficulty for these items.
2. **`NAEPirtparams` on CRAN** for 1990–2015 parameters as an analysis-ready data frame.
3. **AAMC's published percentile-rank tables and validity research.** Freely available, legitimately citable, useful for score-reporting design and for setting expectations about the ability distribution — not for item difficulty.
4. **USMLE aggregate performance data** at usmle.org/performance-data, same caveat.
5. **The published methodology literature** — PISA 2022 Technical Report on multistage adaptive design, TIMSS 2019 methods chapter on item review statistics, the BEA 2024 findings paper on what does and does not predict difficulty from text, and the standard equating references. Reading and applying published methods is unrestricted; it is the *data and items* that are licensed.
6. **MedMCQA / MedQA as item-content inspiration** under their permissive repo licences, with the provenance caveat noted, and with the understanding that they contain no difficulty information whatsoever.
7. **The team's own 2,108 items, fed to an LLM ensemble to fit pseudo-IRT parameters.** No licensing issue since they own the items. Tier C on whether it works; cheap enough to test with a built-in later evaluation against real responses.
8. **University postbac / premed program partnerships**, structured as a free institutional licence plus aggregate program reporting in exchange for de-identified response data under a DUA, run through the partner's IRB. The highest-quality cheap sample available, because course context supplies genuine motivation.
9. **Independent and regional MCAT tutoring partnerships**, with the selected-population caveat recorded as a known property of the sample.
10. **IRB-approved recruitment via Student Doctor Network and premed student organisations**, with AMSA's national Premedical Research Project as the working precedent for how this is done.
11. **Their own launch traffic.** Real learners, real stakes, intrinsic motivation, the correct ability distribution, zero licensing exposure, and the only mechanism that keeps producing parameters as items leak and drift.

## What is not

1. **AAMC item difficulty or discrimination.** Does not exist publicly and will not. Do not budget time on chasing it.
2. **AAMC per-form raw-to-scaled conversion tables.** Not found (**B**).
3. **Administering AAMC items — including purchased Official Prep items — to harvest calibration responses for a commercial product.** The bulk-purchase terms bar derivative works "(such as solutions, AI/LLM modeling)" and commercial exploitation of any portion, restrict who may bulk-purchase, and reserve civil and criminal referral. Expect counsel to say no.
4. **Administering any secure or live MCAT items as anchors.** Secure-test copyright registration, the examinee agreement's bar on duplicating or recording "by copying, photographing, memorizing, or any other means," and *AAMC v. Princeton Review* / *ETS v. Katzman* as the enforcement record.
5. **TIMSS parameters, released items, or microdata.** IEA licence is explicitly non-commercial; commercial exploitation prohibited absent written permission.
6. **Eedi / NeurIPS 2020 data.** CC BY-NC-ND: NonCommercial blocks the use, NoDerivatives blocks shipping anything adapted from it, and the image conditions are stricter still.
7. **EdNet / Riiid data.** CC BY-NC 4.0, research purposes.
8. **Junyi Academy data.** "Any form of commercial usage is not allowed!"
9. **PISA parameters and cognitive item files** — not because they are prohibited, but because **the terms are unverified.** Do not use until someone reads them.
10. **BEA 2024 / NBME data in a commercial pipeline**, pending the actual data use agreement. Assume research-only until proven otherwise, and note that even if granted it yields 667 p-values from the wrong population, not b-parameters.
11. **The LLM-benchmark IRT datasets as human difficulty.** The θ scale is model capability. The authors' own finding is that it diverges substantially from human difficulty.
12. **Scraping competitor MCAT prep products.** Terms-of-service and copyright exposure, *and* the scraped statistic is an unauditable raw p-value from a self-selected population with unknown attempt semantics, contaminated by answer-sharing, and manipulable by the vendor. Fails on reliability alone.
13. **Grade-school released items as anchors for a premed bank.** Legally administrable but construct-irrelevant; a link built on them would be well-formed arithmetic on a meaningless quantity.
14. **Buying "calibration" from a psychometric consultancy expecting to receive data.** They sell software and labour applied to *your* responses. Engaging one shortens the path by zero responses.
15. **Paying a general-population panel to screen for premeds.** No prescreener exists, screen-out cost is unpredictable by Prolific's own admission, and the participants you find are in exactly the unmotivated condition that biases difficulty by 0.30–0.55 logits.
16. **Any off-the-shelf MCAT item bank with IRT parameters attached.** No such public offering found (**B** — private deals not ruled out, but nothing is advertised).

---

## DOK 1 — established facts

1. AAMC registers MCAT test forms and questions, including answer choices, with the Register of Copyrights under the "secure test" regulations at 37 C.F.R. § 202.20. (**A** — *AAMC v. Princeton Review, Inc.*, 332 F. Supp. 2d 11 (D.D.C. 2004))
2. AAMC publishes total- and section-score percentile rank tables; it publishes no item-level difficulty or discrimination statistics. (**A** for the first clause; **A/B** for the second, verified three independent ways in §1)
3. The MCAT examinee agreement prohibits duplicating or recording any part of the exam "by copying, photographing, memorizing, or any other means." (**A** — quoted in the *Princeton Review* opinion)
4. In *ETS v. Katzman*, 793 F.2d 533 (3d Cir. 1986), ETS alleged a test-prep company distributed facsimile items and stated it was compelled to retire at least 289 questions. (**A**)
5. The AAMC MCAT & PREview Official Prep Bulk Purchase Terms and Conditions, last updated 2026-03-18, self-declare that they govern individuals who "work[] for a test prep company, or are developing test prep products," and prohibit copying, derivative works "(such as solutions, AI/LLM modeling)," reproduction, and commercial exploitation of any portion of the Prep Products or Hub. (**A** — read in full 2026-07-28)
6. The same terms condition recorded instructional-video use of Prep Product material on having purchased $20,000 of Code Bank products in the prior 12 months, and prohibit browser extensions or similar technologies interacting with the Hub absent a separate written agreement. (**A**)
7. The BEA 2024 shared-task dataset comprises 667 retired multiple-choice items from USMLE Steps 1, 2 CK, and 3, split 466 training / 201 evaluation. (**A**)
8. In that dataset, "Difficulty" is defined as the linearly transformed proportion of correct responses across examinees during a live exam, with higher values meaning more difficult. It is not an IRT parameter, and no discrimination parameter or response matrix is included. (**A** — the findings paper's own data description)
9. BEA 2024 item statistics were computed on first-time takers who were medical students at accredited US and Canadian medical schools, with approximately 300+ examinees per item. (**A**)
10. On that dataset the best difficulty-prediction submission achieved RMSE 0.299 against a DummyRegressor baseline of 0.311. (**A**)
11. BEA 2024 data is no longer available through the shared task; access requires application to NBME's Office of Research Strategy via an online submission process, evaluated against NBME research priorities, with submission not guaranteeing approval. (**A**)
12. NCES publishes per-item NAEP IRT parameters — `a` and `b` for 2PL items, `a`/`b`/`c` for 3PL, `a`/`b`/`d` for generalized partial credit — by subject, year, grade, subscale, block, and item, in the NAEP Technical Documentation. (**A**)
13. NAEP documents typical parameter ranges: `a` roughly 0–2 and should not be negative; `b` roughly −3 to +3; `c` between 0 and 1; `d` generally −3 to +3, occasionally −8 to 8. (**A**)
14. The CRAN package `NAEPirtparams` provides NAEP IRT parameters for assessments from 1990 to 2015 as a data frame with a, b, c, and d1–d5 columns. (**A**)
15. The NAEP Questions Tool provides 2,000–3,000+ released items across nine subject areas with answer keys, scoring guides, and percent-correct nationally and by state and student group, searchable and sortable by difficulty and percent correct. (**A**)
16. NAEP material is in the US public domain excluding third-party copyrighted materials it may contain; NCES states its permission is not required to reproduce it. (**A**)
17. The TIMSS 2019 International Database provides free downloads of IRT item parameter files and item percent-correct statistics files for grades 4 and 8, plus student microdata for 64 countries and 8 benchmarking participants. (**A**)
18. The IEA copyright notice states that all TIMSS/PIRLS/IEA publications and released items "are for non-commercial, educational, and research purposes only" and that commercial exploitation, redistribution, and reproduction are prohibited without written IEA permission. (**A** — read in full)
19. TIMSS item review statistics include per-country percent-correct, point-biserial discrimination, and RDIFF, a Rasch difficulty in the logit metric scaled so the mean item difficulty within each country is zero. (**A**)
20. The PISA 2022 Technical Report contains Annex F, "Common and Unique Item Parameters in Each Domain, by Country and Language Tables," and the PISA 2022 Database publishes cognitive item data files as Public Use Files. (**A** on existence; contents not opened)
21. PISA 2022 used multistage adaptive testing for mathematics and a reduced MSAT design for reading. (**A**)
22. The Eedi / NeurIPS 2020 Education Challenge data covers Sept 2018–May 2020, 4-option diagnostic mathematics questions, students roughly ages 7–18, with training-set answer records exceeding 17 million (the paper states over 20 million examples overall). (**A**)
23. That data is licensed CC BY-NC-ND 4.0, with additional conditions that question images are shared solely for model training and must not be printed or shared. (**A**)
24. EdNet contains 131,441,538 interactions from 784,309 students, released as KT1–KT4 under CC BY-NC 4.0 for research purposes. (**A** — stated identically in three places)
25. The Junyi Academy dataset authorization statement reads "Any form of commercial usage is not allowed!" (**A**)
26. MedMCQA contains 193,155 questions (182,822 train / 4,183 test / 6,150 dev) from AIIMS and NEET-PG exams; its schema has no difficulty or response-data field. It is MIT-licensed on GitHub and apache-2.0 on its Hugging Face card. (**A**)
27. Public 2025–26 datasets publish fitted IRT parameters at scale over LLM respondents: PSN-IRT gives 4PL a/b/c/d for 41,871 items across 11 benchmarks from 12 models; Cross-Difficulty gives 1PL difficulty for eight benchmarks. (**A**)
28. The Cross-Difficulty authors report that human-based difficulty metrics diverge substantially from their LLM-ability-based IRT difficulty scores. (**A**)
29. 45 C.F.R. § 46.101(a) applies the Common Rule to research conducted, supported, or otherwise subject to regulation by a federal department or agency that has made the policy applicable. (**A**)
30. FDA IRB requirements under 21 C.F.R. Parts 50 and 56 are triggered by FDA product jurisdiction independently of funding source. (**A/B**)
31. Student Doctor Network permits posting surveys and research studies only if the research is IRB-approved and the approval letter is included in the post, with transparency of purpose and no cross-posting. (**A**)
32. AMSA's Premedical Research Project obtained national IRB approval through the University of Vermont and has involved students from 15+ institutions and 1,000+ participants. (**A**)
33. Prolific offers 300+ free prescreeners but has no premed prescreener; reaching such a population requires custom screening or a two-study approach, and researchers must budget both screening payments (minimum £0.10/$0.14 per participant) and the full main-study reward. (**A**)
34. Prolific states it does not store such attributes and therefore cannot estimate how many participants must be screened to reach a target eligible sample. (**A**)
35. Assessment Systems publicly advertises FastTest from $6,750/year with IRT item banking, CAT, LOFT, and multistage support, and sells Xcalibre for IRT calibration and IRTEQ for conversion equating. (**A**, observed 2026-07-28)
36. IRT equating requires either common items or common persons across administrations; fixed-parameter calibration holds known common-item parameters fixed while calibrating the new form. (**B** — vendor educational content; Kolen & Brennan is the primary reference)

## DOK 2 — insights and implications

1. **The negative finding is structural, not a gap in the market.** Item parameters for high-stakes admissions tests are not unpublished by accident; secure-test copyright registration exists specifically to protect content without public deposit, and AAMC actively litigates and contractually polices reuse. No amount of further searching, and no vendor relationship, changes this. Stop looking.
2. **The central technical fact is a double bind, and it is worth stating in one sentence for the team's design doc: legally usable anchors are construct-irrelevant, and construct-relevant anchors are legally unusable.** Because linking validity requires the anchor to measure the same construct, there is no design that routes around it. This closes off the entire "borrow a scale" family of approaches, and it closes it off for a reason that will not change.
3. **Only one external asset survives contact with both the licence filter and the usefulness filter, and it is useful for a different purpose than anyone would guess.** NAEP's published parameters cannot tell the team anything about their items — but they are the difference between simulating the multistage design against realistic item pools and simulating it against invented uniform draws. The second flatters the design. Given how much of the product depends on routing behaviour, that is a real risk retired for free.
4. **"Calibration-as-a-service" is a category error waiting to be made.** A cost-sensitive team reads the phrase and hears "someone else will supply the calibration." What is actually on offer is software plus labour applied to response data the team must still collect. The $6,750/year platform is competing against free R packages, and the consultancies against work the sibling reviews have already done. The honest recommendation is to skip both unless an external defensibility or audit requirement appears — and an adaptive practice app does not have one.
5. **The most important licence distinction in the whole review is public domain versus NonCommercial, and it maps almost perfectly onto government-versus-everyone-else.** US federal statistical products (NAEP) are public domain and commercially usable. International consortia (IEA) and industry research releases (Eedi, Riiid, Junyi) are uniformly NonCommercial. A commercial prep app is precisely the use those licences exclude, so the entire learner-response-dataset category — the datasets that superficially look most relevant — is closed. Any future dataset should be filtered on licence *first*, before anyone evaluates its contents.
6. **Permissive licences on scraped corpora do not launder item provenance.** MedMCQA is MIT/Apache on the repository, but the items came from third-party Indian entrance exams. A licence granted by aggregators cannot convey rights they never held. Treat "MIT-licensed" on any scraped item corpus as a statement about the code and the compilation, not about the items.
7. **The "difficulty" field in the one relevant dataset is a p-value, and this distinction is load-bearing.** A transformed proportion-correct confounds item difficulty with the calibration population's ability distribution, which is exactly why it cannot be transported. Anyone who reads "the BEA dataset has empirical difficulty" and assumes b-parameters will design something that silently imports NBME's med-student ability distribution into a premed product.
8. **IRB is best modelled as a paid access key to the cheap recruitment channels, not as a compliance cost.** No law requires it here. But SDN gates recruitment on an IRB letter in the post, and any university partnership routes through the partner's IRB. The channels that reach motivated, ability-appropriate premeds cheaply are the IRB-gated ones — so a commercial IRB review is the enabling purchase for the whole low-cost sampling strategy, and it should be scheduled early because it sits on the critical path.
9. **Paying a general panel to screen for premeds buys the expensive version of the biased sample.** No prescreener exists, Prolific cannot forecast the screen-out rate, and the participants who pass are being paid to answer questions they have no stake in — the exact unmotivated condition that biases difficulty by 0.30–0.55 logits. The screening cost and the bias compound rather than trade off.
10. **The incentive design and the sample-quality problem have the same solution, which is unusual and should be exploited.** Free full product access is simultaneously the cheapest incentive and the only one that supplies genuine motivation, real stakes, and the correct ability distribution. Every other incentive — cash, gift cards, raffles — costs more and yields worse data. The team's growth strategy and its calibration strategy are the same strategy.
11. **University postbac and formal premed programs are the single best cheap sample, and the reason is motivation, not access.** A program director can assign the diagnostic as coursework, which manufactures the one thing money cannot buy in a calibration sample. Everything else about that partnership — the aggregate dashboard, the DUA, the IRB — is machinery around that single property.
12. **Selected partner samples degrade discrimination more than difficulty ordering, which is tolerable here.** Tutoring-company students are a high-motivation, higher-resource, range-restricted slice. Range restriction attacks a-parameter precision harder than it attacks b rank order — and per sibling review 04, ordinal outputs tolerate parameter error while scaled scores do not. So this sample is usable *provided* the product's early outputs are ordinal. The sampling decision and the score-reporting decision are coupled.
13. **The honest product answer during the calibration window is to withhold precise scaled scores and confidence intervals and report ordinal strengths instead.** This is not merely psychometric hygiene; it is the consent question with real content. A learner told "your score is 508 ± 3" from uncalibrated items has been misled in a way that "your weakest area is amino acid metabolism" does not.
14. **The LLM-ensemble pseudo-calibration idea is the only genuinely novel cheap option this review surfaced, and its main virtue is that it is free to test and self-evaluating.** It is methodologically distinct from the text-feature prediction that sibling review 02 found capped at 8–18% variance explained, because it uses response patterns across models of differing ability rather than surface features. The published evidence says LLM-derived difficulty diverges from human difficulty, so the prior should be pessimistic — but the experiment costs inference over 2,108 items and validates itself automatically once real responses arrive. Run it, hold the predictions aside, and let the data settle it.
15. **Scraping fails on reliability before it fails on law, and that ordering matters for how to shut down the conversation.** A scraped competitor p-value has an unknown population, unknown attempt semantics, answer-sharing contamination concentrated in the most-exposed items, and is manipulable by the vendor. Arguing the legal question first invites a debate about risk appetite; arguing the reliability question first ends it, because there is no version of this input that is worth having.
16. **Item leakage makes calibration a permanent operating cost, which considerably softens the negative finding.** This population organises around sharing prep content; *ETS v. Katzman* is the industrial version of the same dynamic. High-exposure items drift easier, non-randomly. So the internal calibration pipeline's value is not that it produces parameters once but that it keeps producing them — and no external purchase, however generous, would have removed that need. The team was always going to have to build this.

---

## What I could not verify

1. **The NBME data-sharing data use agreement, eligibility rules, and any fee.** NBME's website rejected automated fetching; my read is limited to the Submittable intake page and the sig-edu shared-task page. **Whether a commercial entity can obtain the BEA 2024 data at all is unknown**, as is whether any resulting model could be used in a commercial product. This is the single highest-value open question in the review, and it is answered by one email to ORS@nbme.org.
2. **OECD's terms of use for PISA 2022 parameters, cognitive item files, and released items.** Not read. Commercial reuse status unknown. Do not assume either way.
3. **Annex F of the PISA 2022 Technical Report itself.** I confirmed it exists from the report's table of contents but did not open it, so I cannot describe its format, coverage, or whether parameters are given per item in a usable form.
4. **ASSISTments licence terms** for any specific release. Not located.
5. **MedQA's licence.** Not verified.
6. **Licences on the individual LLM-benchmark IRT repositories** (Cross-Difficulty, PSN-IRT, BRIDGE). Not verified. Moot for difficulty purposes but relevant if the team reuses their code.
7. **Whether AAMC publishes per-form raw-to-scaled conversion tables.** I found none and found no AAMC statement that it withholds them. My only source for "conversions are form-specific and not published" is a test-prep commentary article (**C**).
8. **Consulting rates for Assessment Systems, Alpine Testing, and ACS Ventures.** Only the $6,750/year FastTest platform figure is public. The consultancies' sites are marketing pages with no pricing.
9. **Whether any prep publisher would privately license an MCAT item bank with parameters.** I found nothing advertised, which is weak evidence about deals that are typically private. Not ruled out; would require direct outreach.
10. **Commercial IRB fees and turnaround.** My source on the legal framing of private-company IRB applicability is a commercial IRB's own marketing page (**C**), which happens to agree with the A-tier regulation text I read. No fee or timeline verified.
11. **Prolific's current active pool size and its premed incidence.** The "over 130,000 active participants" figure came from an undated Prolific resource page. Premed incidence in the pool is unknown, and Prolific states it cannot estimate it.
12. **Whether the Eedi project page I relied on for the licence terms has changed.** I read the CC BY-NC-ND string and the image conditions via a search-result extract of eedischool.com rather than a full page fetch. The licence identification is high-confidence; my read of the surrounding conditions is less complete.
13. **Whether AAMC would permit gifting purchased Official Prep access codes as promotional raffle prizes.** The bulk-purchase terms restrict who may bulk-purchase and to whom codes may be distributed, and I could not determine how a retail-purchase giveaway by a prep-product developer is treated. Verify before promising it.
14. **Any of this as legal conclusions.** I read publicly posted terms and published opinions. Whether a specific planned use infringes, or whether a specific licence permits a specific pipeline, is a question for counsel.

---

## Sources

Ranked by decision value. Read-status is stated for each.

**Tier A — primary, decisive**

1. **AAMC MCAT & PREview Official Prep Bulk Purchase Terms and Conditions** — https://students-residents.aamc.org/prepare-mcat-exam/aamc-mcat-official-prep-bulk-purchase-terms-and-conditions — page states "Last Updated: March 18, 2026"; observed and **fetched/read in full** 2026-07-28. **A.** The operative contract for a test-prep-product developer. Bars derivative works incl. "AI/LLM modeling," restricts bulk purchase eligibility, $20,000 threshold for recorded video use, browser-extension prohibition, civil and criminal remedies.
2. ***AAMC v. Princeton Review, Inc.*, 332 F. Supp. 2d 11 (D.D.C. 2004)** — https://case-law.vlex.com/vid/aamc-v-princeton-review-892903222 — observed 2026-07-28, **read via search-result extract of the opinion text**. **A.** Establishes AAMC's secure-test registration under 37 C.F.R. § 202.20 and quotes the examinee agreement's prohibition on memorizing or recording items.
3. **BEA 2024 shared-task findings paper** — Yaneva et al., "Findings from the First Shared Task on Automated Prediction of Difficulty and Response Time for Multiple-Choice Questions," https://aclanthology.org/2024.bea-1.39.pdf — observed 2026-07-28, **fetched and read the data-description and results sections in detail**. **A.** The definitive statement that "Difficulty" is a linearly transformed proportion correct; 667 items; 466/201 split; ~300+ examinees/item; population definition; RMSE 0.299 vs 0.311 baseline.
4. **TIMSS 2019 International Database, including the IEA Copyright Notice** — https://timss2019.org/international-database/index.html — observed 2026-07-28, **fetched and read in full**. **A.** IRT item parameter and percent-correct downloads; "non-commercial, educational, and research purposes only"; commercial exploitation prohibited absent written permission.
5. **NAEP Assessment IRT Parameters (NCES Technical Documentation)** — https://nces.ed.gov/nationsreportcard/tdw/analysis/scaling_irt.aspx and the 2022 grade-8 mathematics Number Properties subscale table at https://nces.ed.gov/nationsreportcard/tdw/analysis/2022/scaling_irt_g8math_number2022.aspx — observed 2026-07-28, **read via search-result extracts including actual numeric parameter rows**. **A.** Per-item a/b/c/d parameters, model assignment, documented plausible ranges.
6. **NAEP / Nation's Report Card copyright FAQ and NAEP release-material public-domain statement** — https://www.nationsreportcard.gov/faq.aspx (fetched) and https://nces.ed.gov/nationsreportcard/pdf/demo_booklet/SQ-07-grade08_3.pdf (search-result extract) — observed 2026-07-28. **A.** Public domain, permission not required, third-party materials carved out.
7. **45 C.F.R. § 46.101 and HHS/OHRP 2018 Requirements regulatory text** — https://www.law.cornell.edu/cfr/text/45/46.101 and https://www.hhs.gov/ohrp/regulations-and-policy/regulations/45-cfr-46/revised-common-rule-regulatory-text/index.html — observed 2026-07-28, **read via search-result extracts of the regulatory text**. **A.** Federal-nexus trigger for the Common Rule.
8. **Student Doctor Network, "IRB-Approved Surveys and Research"** — https://forums.studentdoctor.net/help/survey/ — observed 2026-07-28, **read via search-result extract of the policy text**. **A.** IRB approval required and approval letter must be in the post.
9. **Eedi NeurIPS Education Challenge project page** — https://www.eedischool.com/projects/neurips-education-challenge — observed 2026-07-28, **read via search-result extract, not fetched in full**. **A** on the CC BY-NC-ND 4.0 licence and image conditions; **B** on completeness of my read.
10. **EdNet repository, paper, and leaderboard site** — https://github.com/riiid/ednet, https://doi.org/10.48550/arxiv.1912.03072, http://ednet-leaderboard.s3-website-ap-northeast-1.amazonaws.com/ — observed 2026-07-28, **read via search-result extracts; three independent statements of CC BY-NC 4.0**. **A.**
11. **Junyi Academy dataset authorization (EduData documentation and source notebook)** — https://edudata.readthedocs.io/en/doc/build/blitz/junyi/junyi.html, https://github.com/bigdata-ustc/EduData/blob/master/docs/analysis/junyi/junyi.ipynb, DataShop project at https://pslcdatashop.web.cmu.edu/Project?id=244 — observed 2026-07-28, **search-result extracts**. **A** on "Any form of commercial usage is not allowed!"
12. ***ETS v. Katzman*, 793 F.2d 533 (3d Cir. 1986)** — https://openjurist.org/793/f2d/533 — observed 2026-07-28, **fetched; read the facts section**. **A.** Facsimile items, 289 questions retired, secure-test registration.
13. **Prolific researcher documentation on custom screening and the two-study approach** — https://researcher-help.prolific.com/en/articles/445155-how-to-use-custom-screening-to-recruit-specific-participants and https://www.prolific.com/resources/how-to-find-niche-participants-online-with-prescreeners-and-custom-samples — observed 2026-07-28, **search-result extracts**. **A** on the £0.10/$0.14 minimum, the no-estimate statement, and the absence of a premed prescreener.
14. **NBME External Researcher Data Request (Submittable intake)** — https://nbme.submittable.com/submit/dc9c7bd1-657e-4b67-96e0-cd10f9807c55/external-researcher-data-request-for-nbme-or-usmle-data-sharing — observed 2026-07-28, **fetched intake page; the DUA and eligibility rules are not on it**. **A** on process existence; **unverified** on terms.
15. **BEA 2024 shared task page (SIG-EDU)** — https://sig-edu.org/sharedtask/2024 — observed 2026-07-28, **search-result extract**. **A.** Confirms shared-task access is closed and redirects to NBME application.
16. **MedMCQA repository and Hugging Face dataset card** — https://github.com/medmcqa/medmcqa and https://huggingface.co/datasets/openlifescienceai/medmcqa — observed 2026-07-28, **search-result extracts**. **A** on 193,155 items, the schema's absence of difficulty, and MIT vs apache-2.0 inconsistency.
17. **AAMC MCAT Official Prep Hub Terms and Conditions** — https://www.aamc.org/services/mcat-prep-hub-terms-conditions — observed 2026-07-28, **search-result extract**. **A.** Individual-use terms; explicitly routes test-prep developers and researchers to the bulk terms.
18. **`NAEPirtparams` CRAN reference manual** — https://cran.r-project.org/web/packages/NAEPirtparams/NAEPirtparams.pdf — observed 2026-07-28, **search-result extract of the package description**. **A.** 1990–2015 parameter coverage and column schema.

**Tier A/B — primary but partially read**

19. **PISA 2022 Technical Report** — https://doi.org/10.1787/01820d6d-en (PDF at https://www.oecd.org/content/dam/oecd/en/publications/reports/2024/03/pisa-2022-technical-report_599753f0/01820d6d-en.pdf) — observed 2026-07-28, **table of contents and MSAT design sections read; Annex F not opened**. **A** on Annex F's existence and the MSAT design; **unverified** on parameter format and licence.
20. **PISA 2022 Database** — https://www.oecd.org/en/data/datasets/pisa-2022-database.html — observed 2026-07-28, **search-result extract**. **A** on cognitive item data files being Public Use Files; **terms not read**.
21. **TIMSS 2019 Methods chapter 10, achievement item statistics** — https://timssandpirls.bc.edu/timss2019/methods/pdf/T19_MP_Ch10-achievement-statistics.pdf — observed 2026-07-28, **search-result extract**. **A** on RDIFF definition and item-review statistics.
22. **AAMC percentile-rank tables** — https://www.aamc.org/media/76321/download — observed 2026-07-28, **search-result extract**. **A** on percentile tables being published.
23. **AAMC validity and design research collections** — https://www.aamc.org/media/43291/download, https://www.aamc.org/media/18951/download, https://www.aamc.org/media/50306/download — observed 2026-07-28, **two fetched in full and scanned; confirmed no item statistics**. **A/B** as corroboration of the negative.
24. **FSMB/USMLE 2024 Annual Report** — https://www.fsmb.org/siteassets/usmle-step3/pdfs/2024-annual-report-on-the-usmle.pdf — observed 2026-07-28, **fetched**. **A** on aggregate performance data being published at usmle.org/performance-data.
25. **Assessment Systems: FastTest product page and IRT equating article** — https://assess.com/fasttest/ and https://assess.com/irt-equating/ — observed 2026-07-28, **search-result extracts**. **A** on the published $6,750/year figure and feature set; **B** on the equating methodology summary (vendor educational content).
26. **Cross-Difficulty dataset card and paper** — https://huggingface.co/datasets/BatsResearch/Cross-Difficulty, https://arxiv.org/html/2511.21692v1 — observed 2026-07-28, **card and abstract/intro read; files not downloaded**. **A** on contents and on the human-vs-LLM divergence finding.
27. **PSN-IRT repository and AAAI 2026 paper** — https://github.com/Joe-Hall-Lee/PSN-IRT, https://doi.org/10.1609/aaai.v40i41.40814 — observed 2026-07-28, **repo description and paper extract**. **A** on 41,871 items with 4PL parameters over 12 LLMs.
28. **BRIDGE repository** — https://github.com/McGill-NLP/BRIDGE — observed 2026-07-28, **repo description**. **A** on 2PL parameters anchored to human completion time.
29. **AMSA Premedical Research Project** — https://www.amsa.org/premedical-research-project/ and the SDN announcement thread — observed 2026-07-28, **search-result extracts**. **A** on national IRB approval via University of Vermont, 15+ institutions, 1,000+ participants.
30. **NAEP Questions Tool guides** — https://nces.ed.gov/nationsreportcard/pdf/naep_nqt_final_web.pdf, https://nces.ed.gov/training/datauser/NAEP_02/assets/NAEP_02_Transcript.pdf — observed 2026-07-28, **search-result extracts; one fetched**. **A** on released-item counts and available percent-correct data.

**Tier B/C — weak, indirect, or vendor marketing**

31. **CASRAI comparison of 45 CFR 46 vs 21 CFR 50** — https://casrai.org/compare/45-cfr-46-vs-21-cfr-50 — observed 2026-07-28, **search-result extract**. **B.** Useful summary of the two independent IRB triggers; consistent with the A-tier regulation text.
32. **Solutions IRB, "Do Private Companies Need IRB Approval?"** — https://www.solutionsirb.com/do-private-companies-need-irb-approval/ — observed 2026-07-28, **search-result extract**. **C** — a commercial IRB's marketing page. Cited only because it agrees with the A-tier regulation.
33. **Alpine Testing Solutions** — https://alpinetesting.com/ — observed 2026-07-28, **landing page only, no pricing**. **B** on existence and service scope.
34. **ACS Ventures** — https://acsventures.com/ — observed 2026-07-28, **landing page only, no pricing**. **B** on existence and service scope.
35. **Opus Vidya** — https://opusvidya.com/ and /solutions/white-label-study-material — observed 2026-07-28, **landing pages only**. **C.** White-label content vendor; catalogue is Indian/CBSE exams, no MCAT, no psychometrics advertised.
36. **PrepareBuddy B2B comparison page** — https://www.preparebuddy.com/blog/preparebuddy-vs-kaplan-institutes-b2b-2026/ — observed 2026-07-28, **search-result extract**. **C** — competitor marketing. Cited only for their own statement that they do not cover MCAT; their characterisation of Kaplan is not independently verified.
37. **"MCAT Curve Conspiracies" (residencyadvisor.com)** — https://residencyadvisor.com/resources/mcat-prep/mcat-curve-conspiracies-how-scaling-really-works-explained — observed 2026-07-28, **search-result extract**. **C** — SEO/commentary content, not an AAMC source. Sole basis for the claim that raw-to-scaled conversions are form-specific and unpublished; treat accordingly.
38. **"Open Datasets in Learning Analytics: Trends, Challenges, and Best Practice"** — https://arxiv.org/html/2602.17314v1 — observed 2026-07-28, **search-result extract**. **B.** Useful context that a large share of "available on request" educational datasets are in practice unobtainable — half of the 35 the authors tried had to be eliminated. Relevant to how much hope to place in any application-gated dataset, including NBME's.
39. **Bulut, Gorgun & Tan, "Item Difficulty and Response Time Prediction with LLMs" (BEA 2024)** — https://aclanthology.org/2024.bea-1.44/ and the Alberta repository copy — observed 2026-07-28, **search-result extracts**. **B.** Independent corroboration of the BEA dataset's structure and staged release.
40. **NCES ECLS access guidelines** — https://nces.ed.gov/ECLS/pdf/ECLS-K2011_Guidelines_508.pdf — observed 2026-07-28, **search-result extract**. **B.** Included as an instructive contrast: not all NCES products are public domain — ECLS assessment items require the requester to obtain copyright licences from third-party publishers first. Do not generalise NAEP's public-domain status to other NCES studies.
