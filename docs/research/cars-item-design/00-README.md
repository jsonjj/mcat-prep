# CARS passage-and-question design science: synthesis

**Entry point to a six-lane research review completed 2026-07-29.** Read this file alone if you read nothing else. Lane files carry the full quotes, tables, and numbers.

**Purpose.** Abstract design science for authoring *original, clean-room* CARS-style passages and items that measure the same constructs as the MCAT CARS section. No real MCAT item is reproduced, paraphrased, or reverse-engineered anywhere in this review. Every claim below is traceable to a public source.

## Source-quality labels, used identically in every lane

Requested labels, mapped onto the repo's existing tiers:

| Label | Meaning | Repo tier |
| --- | --- | --- |
| **[OFFICIAL]** | Verbatim or close paraphrase of AAMC-published framework language, with URL | [A] |
| **[PEER]** | Peer-reviewed journal article, ETS/NBME technical report, or the AERA/APA/NCME *Standards* | [A] or [B] depending on design |
| **[FOLKLORE]** | Prep-industry material. Not authoritative. Sometimes descriptively useful, often wrong, never citable as AAMC's position | [C] |
| **[INFERENCE]** | My own derivation from the above. Flagged so you can reject it independently | [C] |

Where a lane makes an [OFFICIAL] claim, the AAMC wording is quoted rather than summarised, because the sub-skill wording is the specification you are building to and paraphrase loses it.

---

## The short version

**The construct is officially specified at a level of detail that is directly implementable, and almost nobody uses it.** AAMC publishes three skill categories with **exactly six named sub-skills** between them, plus explicit prose on what each requires. That six-item list — not the prep industry's eight or nine "question types" — is the actual blueprint. Lane 01 reproduces it verbatim. The single most important structural fact for a generator: the split between Foundations of Comprehension and Reasoning Within the Text is **not** a difference in question topic, it is a difference in **retrieval scope**. AAMC says so directly: *"One key difference is in the scope of the information needed to answer the question"* **[OFFICIAL]**. Foundations questions resolve within an immediate sentence context; Within-Text questions require integrating **distant** passage components. Two questions with identical stems ("What does the author most likely believe about X?") belong to different skill categories depending only on how far apart the evidence sits. Any generator that tags skill category from stem wording alone will mis-tag a large fraction of its own output.

**Passages are officially constrained far more tightly than the folklore admits.** 500–600 words **[OFFICIAL]**, 50/50 humanities/social sciences **[OFFICIAL]**, drawn from 11 named humanities disciplines and 12 named social-science disciplines **[OFFICIAL]**, and — the constraint that actually governs topic selection — *"Everything you need to know to answer the test questions is in the passages and the questions themselves"* **[OFFICIAL]**. Lane 02 argues that "no outside knowledge" is not a topic filter but a **self-containment obligation on the text**: AAMC states passages carry *"Explanations, illustrative examples, and definitions of significant specialized terms"* **[OFFICIAL]**. You are not restricted to familiar topics; you are required to make unfamiliar topics locally sufficient. AAMC says this explicitly: *"The topics of some passages ... will be familiar; some will not"* **[OFFICIAL]**.

**Distractor design is the weakest-evidenced part of the whole enterprise, and the popular taxonomy is folklore.** The familiar list — too-extreme, out-of-scope, opposite, half-right, distortion, right-answer-wrong-question — has **no authoritative peer-reviewed source**. It is test-prep pedagogy. It appears in IELTS/GMAT/MCAT coaching material and in one recent EFL-focused typology (the "5Ps"), not in the item-writing literature. Lane 04 keeps the list because it is *operationally* useful, but labels it **[FOLKLORE]** throughout and pins each family to whichever defensible mechanism does have peer-reviewed grounding. The real evidence base is three things: (1) **Haladyna, Downing & Rodriguez's 31 item-writing guidelines**, with per-guideline textbook-consensus percentages — reproduced in full in Lane 04 **[PEER]**; (2) **Embretson & Wetzel's falsification/confirmation model**, which is the only published mechanistic account of what a distractor *does* cognitively **[PEER]**; (3) the **functional-distractor literature**, which is brutal about how many distractors actually work.

**The functional-distractor numbers should change your architecture.** Across four standardized tests, Haladyna & Downing found the **modal number of effective distractors per item is one**, about two-thirds of items had one or two, and only **1–8%** had three **[PEER]**. In a 200-item exam for US physicians, **no item had four functioning distractors and only 8.4% had three [PEER]**. In 480 Cardiff medical SBAs (1,920 distractors), mean functional distractors per item was **1.82**; **55.3%** of all distractors were non-functional and **17.8%** were never chosen at all; only **7.1%** of items had four functional distractors **[PEER]**. Rodriguez's meta-analysis of 27 studies / 56 trials / 12,591 participants gives the decisive effect sizes: moving 5→3 options changes difficulty by **+.07** (easier), discrimination by **−.004 (n.s.)**, and reliability by **−.016 (n.s.)** **[PEER]**. His conclusion: *"Three options are optimal for MC items in most settings."* **CARS is a four-option format — that is [OFFICIAL], AAMC refers to "the four response options"** — so you must ship four. The implication is not "ship three"; it is that **your third distractor will usually be dead weight, and you should expect and measure that** rather than assume four-way plausibility. Lane 04 turns this into a concrete authoring and QA rule.

**On what makes items hard, the literature genuinely disagrees, and the disagreement is the finding.** Freedle & Kostin, regressing item difficulty on text and item features, concluded difficulty is *"more closely associated with text as opposed to item variables"* and explained **20–52%** of GRE variance, **46–59%** of SAT main-idea variance, **33%** of TOEFL variance **[PEER]**. Gorin & Embretson, on GRE paragraph comprehension, found the **opposite**: *"The decision model variables contributed significantly to variance in item difficulties, whereas the text representation variables did not"* **[PEER]**. Ozuru, Rowe, O'Reilly & McNamara split the difference and add the most useful number for you: passage-level features accounted for only **~15%** (grades 7–9) and **~10%** (grades 10–12) of item-difficulty variance, and at the **higher** grade band there were **no significant main effects of either passage or question features** — only interactions **[PEER]**. Lane 05's reading: as reader ability rises, difficulty stops living in the text and starts living in the option set. For a test taken by pre-med seniors, that is the relevant regime. Do not expect to control CARS difficulty by tuning prose complexity.

**One empirical result deserves to be a design rule on its own.** Ozuru et al. coded whether each distractor was **explicitly falsifiable from the passage** and found that items were *more* difficult when one or more distractors were falsifiable (coefficient **−.035**, marginal) — and then said the uncomfortable part out loud: *"this result implies that the GMRT 7th–9th grade level is influenced by a variable that has little to do with reading comprehension, given that eliminating improbable answer options is associated more strongly with general test-taking skills than with reading comprehension skills"* **[PEER]**. Distractor falsifiability is a **construct-relevance lever, not just a difficulty lever**. Lane 04 and Lane 05 both build on this.

**Development process is well documented and cheap to imitate.** AAMC publishes five concrete fairness practices **[OFFICIAL]**, including that *"Questions that show large group differences are examined for possible bias and are dropped if bias is evident."* The generalisable machinery is: ECD's five layers and its Student/Evidence/Task model triad **[PEER]**; the *Standards* 3.1–3.3 obligations on construct-irrelevant barriers and on including relevant subgroups in field-test samples **[PEER]**; the ETS Mantel-Haenszel **A/B/C** DIF thresholds, which are specific and adoptable (**A**: |MH D-DIF| < 1 or n.s.; **C**: |MH D-DIF| ≥ 1.5 and significantly > 1; **B**: everything else) **[PEER]**; and Gierl/Lai/Turner's three-step AIG method, which generated **1,248 items from a single item model** **[PEER]**. Lane 06 maps each onto a clean-room workflow.

---

## What each lane found

### Lane 01 — The CARS construct, officially

[`01-cars-construct-official.md`](./01-cars-construct-official.md)

The complete official framework, quoted: three skill categories at **30% / 30% / 40%**, six named sub-skills, and AAMC's own prose on each. **53 questions, 90 minutes, 9 passage-based sets of 5–7 questions, 500–600 words per passage, 50% humanities / 50% social sciences, 11 + 12 named disciplines** — all [OFFICIAL] with URLs. Also captured: AAMC's explicit statement that the percentages are *"approximated to the nearest 5% and will vary from one test to another"* for three named reasons including **unscored field-test questions on each test form**; the four-option format; the "one defensible and demonstrably correct response option" standard; the instruction to ignore outside knowledge even when it would invalidate the author; and the named tone vocabulary (*humorous, authoritative, satirical*) and purpose vocabulary (*persuade, instruct, inform, entertain*). The lane ends with the ten [OFFICIAL] sentences that function as hard constraints on a generator.

### Lane 02 — Passage design characteristics

[`02-passage-design.md`](./02-passage-design.md)

What AAMC says makes a text suitable, plus what the text-complexity literature can and cannot tell you. Official: passages are *"excerpted from the kinds of books, journals, and magazines that college students are likely to read"*; social-science passages *"tend to be more factual and scientific in tone"*; humanities passages *"often focus on the relationships between ideas and are more likely to be written in a conversational or opinionated style"*; passages are *"often multifaceted and focus on the relationships between ideas or theories"* with *"sophisticated vocabulary and, at times, intricate writing styles."* Three named organisational schemes are given as [OFFICIAL] examples: **cause-and-effect** (behavioural science), **chronological** (historical), **point-and-counterpoint** (political science). On metrics: readability formulas are the wrong instrument and the critique is old and well-replicated — they measure only sentence length and word difficulty and therefore cannot represent *"degree of discourse cohesion, number of inferences required, number of items to remember, complexity of ideas, rhetorical structure, dialect, and background knowledge required"* **[PEER, Bruce/Rubin/Starr 1981]**; they lack construct validity because their features are selected by statistical correlation rather than theory **[PEER]**; and a formula validated on one population/text type was found invalid for *the same* types as conditions drifted over 25 years **[PEER]**. Coh-Metrix (238 indices) is the defensible replacement, and Lane 05 names the specific indices that carry empirical weight. The lane closes with a 12-item passage specification and an argument that **self-containment, not topic familiarity, is the operative "no outside knowledge" constraint**.

### Lane 03 — Item archetypes

[`03-item-archetypes.md`](./03-item-archetypes.md)

**The critical labelling issue in this entire review lives here.** AAMC publishes **six sub-skills**. AAMC does **not** publish a list of question archetypes with names. The familiar eight-name taxonomy — Main Idea, Detail, Inference, Definition-in-Context, Function, Strengthen–Weaken (Within), Apply, Strengthen–Weaken (Beyond) — is **Kaplan's**, not AAMC's, and Kaplan's own page presents it immediately after "The AAMC has defined these critical analysis and reasoning skills as...", which is exactly how the misattribution propagates **[FOLKLORE]**. The lane therefore does two things: reproduces the six [OFFICIAL] sub-skills as the authoritative layer, then builds a **10-archetype operational layer** as explicitly labelled [INFERENCE], each archetype pinned to (a) the sub-skill it serves, (b) stem structure, (c) what makes the key defensible under AAMC's "one defensible and demonstrably correct option" rule, (d) the cognitive operation, and (e) the retrieval scope that determines its skill-category tag. Several archetypes are directly licensed by [OFFICIAL] language, notably the analogy archetype (*"Likeness is measured not by inherent similarity but by analogy"*), the least-disruption archetype (*"select the one option that, if added to the passage content, would result in the least amount of change"*), and the perspective-attribution archetype (*"identify points of view, other than the author's, presented indirectly through the author's summaries or paraphrases"*).

### Lane 04 — Distractor design

[`04-distractor-design.md`](./04-distractor-design.md)

The longest lane, and the one with the widest gap between what is practised and what is evidenced. Contains: the **full 31-guideline Haladyna/Downing/Rodriguez taxonomy verbatim**, with the per-guideline textbook-consensus table (Guideline 15, central idea in stem, is the only one at **100%** endorsement; Guidelines 28 *avoid clues* and 29 *make distractors plausible* both at **96%**; Guideline 25 *NOTA* is genuinely contested at **44% for / 48% against**) **[PEER]**; the **six named cluing mechanisms** under Guideline 28 (specific determiners, clang associations, grammatical inconsistency, conspicuous correct choice, pairs/triplets, absurd options) **[PEER]**; the NBME's independently-derived flaw catalogue, which converges on the same mechanisms and adds **convergence cluing** — the correct option being the one with most in common with the others **[PEER]**; the **falsification → confirmation** decision model **[PEER]**; the full functional-distractor numbers; Rodriguez's three effect-size tables with standard errors and homogeneity tests **[PEER]**; and the distractor-deletion finding that matters most for authoring — reliability loss on option reduction is entirely a function of *which* distractor you drop (random deletion **−.059** vs ineffective deletion **−.006**, Q_BETWEEN = 108) **[PEER]**. The prep-industry distractor families are tabulated separately and labelled, each with the peer-reviewed mechanism it is really a special case of. The lane ends with an authoring protocol and a QA option-analysis protocol lifted from NBME.

### Lane 05 — Difficulty drivers

[`05-difficulty-drivers.md`](./05-difficulty-drivers.md)

The three-way disagreement above, resolved as far as the evidence permits, plus the specific variables that replicated. Freedle & Kostin's replicated predictors across SAT and GRE main-idea items: **argument/rhetorical organiser, coherence, longest-paragraph length, syntactic frontings (clefts), referential density across clauses, text negations, and main-idea location** **[PEER]**. The location effect is directly actionable and well-motivated: readers expect main-idea information early, so main-idea items are **easiest when the thesis is in the opening sentences and hardest when it sits mid-text** **[PEER]**, grounded in Kieras (1985) and Hare et al. (1989). Negation increases comprehension decision time and text negations make main-idea items harder **[PEER]**. Ozuru et al.'s variance shares (**15% / 10%**) and their null result at the higher grade band. Gorin & Embretson's decision-over-text finding. Embretson & Wetzel's four-part difficulty account (encoding, **text mapping** = proportion of text spanned by the relevant propositions, **falsification** = 1 − P(guess correctly among non-falsified set), **propositional comparisons** = log count of comparisons required). A four-level inference-distance scale from Ozuru et al. that is immediately codeable: **verbatim-in-one-sentence → reworded-within-one-sentence → across-sentence bridging → knowledge-based**. Note the last level is **out of construct for CARS** by [OFFICIAL] rule, which is itself a design constraint. Lane concludes with a ranked list of levers by evidence strength and an explicit warning that **prose-complexity tuning is the weakest lever available**.

### Lane 06 — Development and validation

[`06-development-and-validation.md`](./06-development-and-validation.md)

AAMC's five published fairness practices, quoted **[OFFICIAL]**; the 1983 court record describing the MCAT item pipeline in unusual operational detail (writer qualification review → editing for accuracy, clarity, fairness → statistical difficulty evaluation → field testing as non-scored items → approval → ongoing currency checks) **[PEER-adjacent: a federal court's findings of fact, not a research paper]**; *Standards* 3.1, 3.2, 3.3 obligations **[PEER]**; the ETS MH D-DIF **A/B/C** thresholds with the exact statistical criteria and the note that an item is assigned **the lowest grade across all group comparisons run on it** **[PEER]**; ECD's five layers and CAF triad **[PEER]**; assessment-engineering / AIG three-step method with the 1,248-from-one-model result **[PEER]**; and NBME's option-analysis decision rules for post-hoc item triage **[PEER]**. Ends with a proposed clean-room workflow with the DIF and review gates named.

---

## Code-ready artefacts

These are the outputs intended to become code. Each lives in its lane with full provenance.

1. **Skill-category schema** — 3 categories × 6 sub-skills, official IDs and wording. Lane 01.
2. **Discipline enum** — 11 humanities + 12 social sciences, with the dual-classification rule for Studies of Diverse Cultures. Lane 01.
3. **Form blueprint constraints** — 53 items / 9 sets / 5–7 per set / 30-30-40 ±5% / 50-50 content. Lane 01.
4. **Passage specification** — 12 authoring constraints. Lane 02.
5. **Archetype taxonomy** — 10 archetypes × 5 attributes, each mapped to a sub-skill. Lane 03.
6. **Retrieval-scope classifier spec** — the rule that distinguishes Foundations from Within-Text. Lane 01 + Lane 03.
7. **Item-writing rule set** — 31 guidelines, filtered to the ~22 that apply to a passage-based verbal item, plus 6 cluing checks. Lane 04.
8. **Distractor-family taxonomy** — 11 families, each labelled by evidence status and pinned to a mechanism. Lane 04.
9. **Difficulty-feature vector** — the variables that replicated, ranked by evidence. Lane 05.
10. **QA gates** — option analysis thresholds, DIF thresholds, review-panel composition. Lane 04 + Lane 06.

---

## What I could not establish

Listed in rough order of how much it would matter to you.

**1. AAMC's own item-writing rules for CARS. Not public.** No AAMC document describes how a CARS distractor should be constructed, how many plausible distractors are targeted, what flaw checklist reviewers apply, or what stem templates exist. The five fairness bullets and the framework prose are the extent of the public record. The NBME *Item-Writing Guide* is the closest available proxy from a comparable medical-testing organisation and is not AAMC's. **Everything in Lane 04 about distractor construction is inference from the general item-writing literature, not AAMC practice.**

**2. Whether AAMC publishes archetype names at all.** I could not access the AAMC CARS Diagnostic Tool, which the store page says *"Read explanations for all answer choices in addition to explanations for how each question assesses a critical analysis and reasoning skill."* That product may contain per-question skill labels finer than the six sub-skills. It is paywalled. If anyone on the team has a licence, that is the single highest-value document remaining, because it would replace Lane 03's [INFERENCE] archetype layer with something authoritative.

**3. CARS-section-specific reliability.** AAMC publishes that section scores carry **±1-point confidence bands** and total scores ±2 **[OFFICIAL]**, and a forum post claims total-score reliability *"just over r = 0.9"* **[FOLKLORE — unsourced]**. I found no AAMC document giving a reliability coefficient or SEM **for the CARS section specifically**. This matters because 53 items measuring a single verbal construct should be highly reliable, and if it is not, difficulty targeting is less consequential than it looks.

**4. The actual difficulty distribution of operational CARS items.** No published p-value distribution, no discrimination distribution, no target difficulty range. Without this there is no external anchor for "is my generated item appropriately hard."

**5. Empirical validation of the prep-industry distractor families.** I found no study that coded reading-comprehension distractors into these families and related family membership to selection rates or discrimination. The 5Ps typology (plausible / peripheral / polyconceptual / prejudicial / pragmatic) is the closest published attempt and is EFL-specific, recent, and not validated against response data. **This is the largest genuine hole in the evidence base and it sits exactly where the user identified the most important part of the problem.** It is also an opportunity: coding your own generated items by family and correlating with response data would be a novel, publishable contribution and directly serves the product.

**6. Whether the passage-vs-question difficulty disagreement resolves by ability level.** Lane 05 argues it does, from Ozuru et al.'s grade-band contrast. That is **one study, two bands, and a null result at the upper band** — a null result is weak evidence for "difficulty moved to the options," it is also consistent with "our features were bad." I am labelling this [INFERENCE] and I would not build difficulty control on it alone.

**7. How AAMC handles copyright on excerpted passages.** AAMC says passages are *"excerpted"* from published books, journals, and magazines **[OFFICIAL]**, which implies a permissions or fair-use posture I could not find documented. Not directly relevant to a clean-room original-authoring project except as reassurance that originating your own text sidesteps the question entirely.

**8. Effect of the 4-option constraint on CARS specifically.** All the option-count evidence is from achievement/knowledge tests: medical SBAs, undergraduate courses, personnel selection, language proficiency. Rodriguez's 56 trials include 19 in language arts, which is the closest, but none is a high-stakes verbal-reasoning test with 500-word argumentative passages. **Transfer is plausible but untested.**

**9. Sensitivity/bias review panel composition and guidelines for MCAT.** AAMC says reviewers come *"from varied racial/ethnic backgrounds"* **[OFFICIAL]** but publishes no bias-and-sensitivity guidelines document. Smarter Balanced publishes theirs and it is a usable template; it is not AAMC's.

**10. Anything about timing/pacing as a construct-relevant variable.** AAMC notes the 2015 redesign deliberately increased working time per question and that this *"is likely to be especially useful for English language learners"* **[OFFICIAL]**, but there is no published analysis of speededness in CARS. If your generator produces passages at the long end of 500–600 words with 7 items, you are making a speededness decision with no evidence behind it.
