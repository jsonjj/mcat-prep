# Lane 06 — How testing programmes actually develop and validate these items

## 1. What AAMC publishes about its own process

**[OFFICIAL]** *Testing Academic Competencies with the 2015 MCAT Exam*, https://students-residents.aamc.org/media/11406/download

Five practices, verbatim:

> "Test developers work hard to ensure that questions are fair to racial/ethnic minorities and test takers with disabilities. They focus on fairness in a number of ways.
> - **Question writers, editors, and reviewers all receive rigorous training and feedback** to ensure test takers have equal opportunities to show what they can do.
> - **Questions are reviewed for possible bias by reviewers from varied racial/ethnic backgrounds.**
> - **When new questions are tried out, results are examined separately for Hispanic, African-American, and white test takers, and for males and females** to ensure none contribute unfairly to group differences.
> - **Questions that show large group differences are examined for possible bias and are dropped if bias is evident.**
> - Appropriate accommodations are provided to individuals with disabilities or health-related needs; these accommodations include extra testing time, distraction-free administrations, and paper test forms."

Note the fourth bullet's two-stage logic: statistical flagging does **not** by itself remove an item. It triggers human review, and removal requires that *"bias is evident."* This is standard practice and it matters — DIF is evidence of differential functioning, not of bias, and the distinction is what the review panel exists to adjudicate.

Also **[OFFICIAL]**, on validation of the redesign:

> "MCAT exam researchers reviewed several lines of evidence to verify that the new exam measures the competencies needed by entering medical students. In 2013 and 2014, test takers tried out questions for the 2015 exam. Researchers compared test takers' scores on the new questions to their undergraduate majors and course-taking histories... They reviewed scores for test takers from minority-serving and underresourced institutions, and for Hispanic, African-American, and white test takers, and for males and females. They also reviewed scores for test takers who received fee assistance and those who did not."

And two design-level fairness decisions that are unusual to see documented:

> "Before introducing new concepts, blueprint designers **checked course offerings at minority serving and underresourced colleges and universities** to ensure students have access to the needed [preparation]."

> "Another prominent fairness issue in designing the new exam was that of **testing time**... the design of the new test gives examinees **more working time per question** than on the current exam... **This additional processing time is likely to be especially useful for English language learners.**"

**[INFERENCE]** The second is directly relevant to a CARS generator: AAMC treats time-per-question as a **fairness** variable, not merely a difficulty variable. Producing 600-word passages with 7 items each pushes toward speededness, and by AAMC's own reasoning that has differential impact. Lane 00 lists this as gap 10 because no speededness analysis is published.

## 2. The MCAT item pipeline, from an unexpected source

**[PEER-adjacent — a US federal court's findings of fact, not a research paper]** *Ass'n of American Medical Colleges v. Mikaelian*, 571 F. Supp. 144 (E.D. Pa. 1983), https://case-law.vlex.com/vid/ass-n-of-american-889484575

The court described the pipeline in operational detail, which AAMC does not publish elsewhere:

> "the Research Institute selects question writers by reviewing their qualifications and then asks the writers to submit potential test questions. After the proposed questions are received, the Research Institute **edits the items, tests each question for accuracy, clarity, and fairness**, produces any art work or other graphics necessary to illustrate the question, and **employs statistical analysis to evaluate the relative difficulty of the questions. Questions are field tested through use as non-scored questions in the MCAT**, thereby allowing the Research Institute to ascertain the performance of typical MCAT test takers on the potential question. **If a proposed test question is fair, accurate, and neither too difficult nor too easy, it is approved** for use in an MCAT test form. After approval, the Research Institute continues to check to make sure the question is current and accurate."

Caveat: this is **1983**, describing the pre-1991 MCAT, and the Research Institute arrangement no longer applies. Use it as evidence of the *shape* of the pipeline, not its current details. The shape is confirmed by the current [OFFICIAL] statement that unscored field-test questions appear on every form (Lane 01 §1).

Eight stages, which is a usable template:

```
1  writer qualification review
2  item submission
3  editorial pass — accuracy, clarity, fairness
4  bias / sensitivity review          [from §1, current]
5  field test as unscored items on live forms
6  statistical review — difficulty, discrimination, DIF by subgroup
7  approval / rejection gate
8  ongoing currency and accuracy monitoring
```

## 3. What the *Standards* require

**[PEER]** AERA/APA/NCME, *Standards for Educational and Psychological Testing* (2014), https://www.testingstandards.net/uploads/7/6/6/4/76643089/standards_2014edition.pdf

The 2014 edition **merged the previous fairness and bias chapters into one and moved it into Part I, Foundations**, alongside validity and reliability — a deliberate statement that fairness is a validity concern, not a compliance add-on.

**Standard 3.1** — *"Those responsible for test development, revision, and administration should design all steps of the testing process to promote valid score interpretations for intended score uses for the widest possible range of individuals and relevant subgroups."* Comment recommends **universal design**: *"Test tasks and items should be designed to maximize access and be free of construct-irrelevant barriers as far as possible."*

**Standard 3.2** — *"Test developers are responsible for developing tests that measure the intended construct and for **minimizing the potential for tests' being affected by construct-irrelevant characteristics, such as linguistic, communicative, cognitive, cultural, physical, or other characteristics.**"* Comment: *"Avoiding the use of language that has different meanings or different connotations for relevant subgroups of test takers will help ensure that test takers who have the skills being assessed are able to understand what is being asked of them."*

**[INFERENCE]** 3.2 is unusually sharp for a CARS generator, because the construct **is** language comprehension. The line between construct-relevant linguistic demand (on-construct) and construct-irrelevant linguistic demand (a barrier) is the central design judgement of the whole product, and the *Standards* do not draw it for you. Lane 02 §6's general-academic vs domain-specialised split and Lane 05 §5's treatment of word rarity as a floor rather than a dial are both attempts to draw it. Cultural connotation is the harder case: a passage about, say, a culturally specific practice may be construct-relevant (the passage defines what is needed) yet differentially familiar. That is exactly what DIF and sensitivity review exist to catch.

**Standard 3.3** — *"Those responsible for test development should include relevant subgroups in validity, reliability/precision, and other preliminary studies used when constructing the test."* Comment permits small-sample alternatives: *"Such analyses could employ a range of methodologies, including those appropriate for small sample sizes, such as **expert judgment, focus groups, and cognitive labs.**"*

**[INFERENCE]** That last clause is the practically important one. A pre-launch product will not have DIF-grade sample sizes, and the *Standards* explicitly sanction **cognitive labs** — think-aloud protocols with a small, deliberately diverse sample — as a legitimate substitute. For a CARS generator a cognitive lab is unusually informative because it surfaces the two failure modes nothing else catches: a distractor a reader can defend as well as the key, and an item answerable without the passage.

## 4. Differential item functioning — adoptable thresholds

**[PEER]** Dorans & Holland, *DIF Detection and Description: Mantel-Haenszel and Standardization*, ETS Research Report, https://doi.org/10.1002/j.2333-8504.1992.tb01440.x; ETS DIF primer, https://praxis.ets.org/on/demandware.static/-/Library-Sites-ets-praxisLibrary/default/dwa6eb7332/pdfs/dif-primer.pdf; review of ETS procedures, https://files.eric.ed.gov/fulltext/EJ1109842.pdf

**Metric.** ETS works in the **delta** metric (mean 13, SD 4; **large delta = difficult**). Proportion correct → z via inverse normal → linear transform. The MH odds ratio becomes a delta difference via Holland & Thayer:

```
MH D-DIF = −2.35 × ln(α_MH)
```

**Sign convention, easy to get backwards:** *"positive values of MH D-DIF favor the focal group, while negative values favor the reference group."*

**The A/B/C classification, verbatim:**

> "Items are classified as **A** for a particular combination of reference and focal groups if either MH D-DIF is not statistically different from zero or if the magnitude of the MH D-DIF values is less than one delta unit in absolute value. Items are classified as **C** if MH D-DIF both exceeds 1.5 in absolute value and is statistically significantly larger than 1.0 in absolute value. All other items are classified as category **B**. In both categories A and C statistical significance is at the 5% level."

| Category | Criterion |
| --- | --- |
| **A** — negligible | \|MH D-DIF\| < 1.0 **or** not significant |
| **B** — intermediate | MH CHISQ > 3.84 **and** \|MH D-DIF\| ≥ 1.0, not meeting C |
| **C** — large | \|MH D-DIF\| ≥ 1.5 **and** significantly > 1.0 at 5% |

B and C carry signs: **B+/C+** favour the focal group, **B−/C−** the reference group.

Two implementation details from the review paper. The C test involves a **composite null hypothesis** — the null is the region (−1, +1), not a point — so Holland showed the correct critical value is **1.645**, the 95th percentile of the standard normal, not 1.96. And if SE(MH D-DIF) ≤ **.304**, the significance criterion is superfluous because the magnitude criterion implies it.

**The multiplicity rule, which is easy to miss and important:**

> "Presently an item can have up to five different MH D-DIF values associated with it, one for each of five possible combinations of focal and reference groups. **An item is currently assigned the lowest letter grade from all the DIF analyses performed on it.**"

So an item flagged C against any one comparison is a C item. With five comparisons this is a meaningfully stricter bar than any single test, and it is the right default.

**[INFERENCE]** Adopt A/B/C directly. It is public, specific, decades-validated, and interpretable to non-psychometricians. Pair it with the [OFFICIAL] AAMC two-stage rule: **statistics flag, humans decide, removal requires evident bias.** Smarter Balanced's operationalisation is a usable template — *"qualified subject matter and bias sensitivity experts reviewed items classified into category C of DIF. Only items approved by a multi-disciplinary panel of content and sensitivity experts are eligible to be used"* **[PEER, technical report]**.

**Sample size is the constraint.** DIF requires substantial N per subgroup, and per the calibration lane in this repo you will not have it early. Standard 3.3's expert-judgment / focus-group / cognitive-lab alternatives are the pre-DIF substitute, and the sequencing is: **sensitivity review before field test → DIF after.** Both AAMC and Smarter Balanced order them that way.

## 5. Evidence-centred design

**[PEER]** Mislevy, Steinberg & Almond, *A Brief Introduction to Evidence-Centered Design*, ETS RR, https://doi.org/10.1002/j.2333-8504.2003.tb01908.x; Mislevy & Riconscente, https://www.sri.com/wp-content/uploads/2021/12/tr9_ecd.pdf; Mislevy & Haertel, https://padi.sri.com/downloads/TR17_EMIP.pdf

**Five layers:** domain analysis → domain modelling → **conceptual assessment framework (CAF)** → assessment implementation → assessment delivery. *"Although the layering suggests a sequential design process, cycles of iteration and refinement both within and across layers are typical."*

**The CAF triad**, verbatim:

> "A **Student Model** defines one or more variables related to the knowledge, skills, and abilities we wish to measure... the student model variables will be a subset of the variables in a graphical model that accumulates evidence across tasks."

> "**Evidence Models** provide detailed instructions on how we should update our information about the student model variables given a performance in the form of examinees' work products from tasks. An evidence model contains two parts... evidence rules concern the identification and summary of evidence **within** tasks, in terms of observable variables."

> "**Task Models** describe how to structure the kinds of situations we need to obtain the kinds of evidence needed for the evidence models. They describe the presentation material... and the work products generated in response. They also contain **task model variables that describe features of tasks** as well as how those features are related to the presentation material and work products. Those features can be used by task authors to help structure their work, **by psychometricians to help reduce the number of pretest subjects needed**, and by test assemblers to help ensure that a particular form of the assessment is balanced across key kinds of tasks."

### Mapping onto this project

| ECD element | This project |
| --- | --- |
| Domain analysis | Lane 01 — the [OFFICIAL] AAMC framework |
| Domain modelling | Lane 02 affordance table; Lane 03 archetypes |
| **Student model** | 6 sub-skills as reportable proficiency variables; a general CARS θ |
| **Task model variables** | Lane 05 §10 feature vector |
| **Evidence model** | the `key_standard` per archetype (evidence rules) + IRT (measurement model) |
| Assembly model | 53 items / 9 sets / 30-30-40 ±5% / 50-50 content |
| Presentation model | passage + numbered paragraphs + 4 options |

**[INFERENCE]** Two payoffs worth naming. First, the italicised clause above — task model variables *"help reduce the number of pretest subjects needed"* — is the direct link to this repo's calibration problem: a well-specified task-model variable set lets you borrow strength across items and calibrate with smaller samples, which is exactly the hierarchical-Bayesian route the calibration lane recommends. **The Lane 05 feature vector is not documentation; it is the input to that model.** Second, ECD forces you to answer "what claim does this item license?" before authoring, which is the discipline that keeps a generator from producing plausible-looking items that support no inference.

## 6. Assessment engineering and automatic item generation

**[PEER]** Gierl, Lai & Turner, *Using automatic item generation to create multiple-choice test items*, Medical Education 46(8), 2012, https://doi.org/10.1111/j.1365-2923.2012.04289.x; full text https://mcc.ca/wp-content/uploads/AIG-Gierl-Lai-Turner-Medical-Education-Journal.pdf

Motivation that matches yours exactly: *"multiple-choice items are time-consuming and expensive to create. Changes in student assessment brought about by new forms of computer-based testing have created the demand for large numbers of multiple-choice items. **Our current approaches to item development cannot meet this demand.**"*

**Three stages:**

1. **Cognitive model** — *"intended to highlight the knowledge, skills and abilities required to solve a problem in a specific domain,"* organising cognitive and content information into *"a succinct yet structured representation of how examinees think about and solve problems."*
2. **Item model** — a template. *"The item model contains the stem, which specifies the context, content, item and/or question... The stem also highlights the sources of information that will be manipulated for item generation, as well as the location of those sources."* Components: **stem, options, auxiliary information**. Two types: **1-layer** (manipulate elements in the stem) and **n-layer** (manipulate at two or more levels, including within elements).
3. **Generation** — algorithmic substitution under constraints.

Result: **1,248 unique items from a single item model** (postoperative fever, medical licensure).

### Why classic AIG does not transfer, and what does

**[INFERENCE]** Template-based AIG works because a clinical vignette has slots — age, timing, allergy, infection type — that vary independently while the reasoning stays fixed. **A CARS passage has no such slots.** You cannot substitute "author's position" the way you substitute "patient age," because every item in the set depends on the whole passage semantically. AIG in the Gierl sense is not available here.

What *does* transfer is the **layering**, and it maps onto your problem cleanly:

```
cognitive model  →  Lane 01 sub-skills + Lane 05 difficulty features
                    ("what makes this item hard, and what does it measure")
item model       →  Lane 03 archetypes: stem shape + key_standard
                    + Lane 04 option-set composition
                    ("what shape does this item take")
generation       →  LLM authoring, constrained by both, then gated by
                    Lane 04 §9 checks
```

The important structural insight: **the passage is the `auxiliary information` component of the item model, shared across the 5–7 items in a set.** That is precisely Gierl's third component, and it is the component AIG usually treats as fixed. So the correct framing is: **generate auxiliary information first (the passage, against Lane 02's 12 constraints), then instantiate archetype templates against it.** Passage-first, not item-first. Lane 03 §4's blueprint-feasibility analysis says the same thing from the other direction — RBT quota failures are upstream passage failures.

Also relevant: Gierl's multilingual AIG work (https://releve.erudit.org/en/journals/mee/2015-v37-n3-mee02497/1036327ar.pdf) notes that item models make **"how to score them"** knowable in advance. Your analogue: because each archetype carries a `key_standard`, key defensibility is checkable at generation time rather than discovered at review.

## 7. A proposed clean-room workflow

**[INFERENCE]**, assembled from §1–§6.

```
0  DOMAIN SPEC          Lane 01 sub-skills, enums, blueprint constraints.
                        Version-controlled; re-verified against a current
                        AAMC content-outline PDF each cycle.

1  PASSAGE GENERATION   Original text against Lane 02's 12 constraints.
                        Record: discipline, content side, thesis position,
                        affordances present, and the source-free provenance
                        attestation (no source text consulted).

2  PASSAGE GATE         a) 500–600 words
                        b) affordance coverage sufficient for the intended
                           skill mix of the set
                        c) every domain-specialised term defined in-text
                        d) min-content-word-frequency lint
                        e) NO readability target
                        f) originality check against a corpus of published
                           CARS-like material — a clean-room requirement,
                           not a psychometric one

3  ITEM GENERATION      Instantiate archetypes (Lane 03) to hit the set's
                        skill mix. Record evidence_span per item.

4  ITEM GATE            a) sub_skill derived from evidence_span, not stem
                        b) ranking dimension named (NBME)
                        c) six G28 cluing checks
                        d) two NBME checks: exhaustive subset, convergence
                        e) passage-withheld leakage test — mandatory for A8
                        f) A6 negation check
                        g) no distractor eliminable without the passage
                        h) falsification difficulty computed and recorded

5  SME REVIEW           Content expert confirms exactly one defensible key
                        and that the nearest distractor is defensibly worse.
                        This is the one gate no automation replaces, because
                        AAMC's standard is comparative and defeasible.

6  SENSITIVITY REVIEW   Reviewers of varied backgrounds, per AAMC's second
                        bullet and Standard 3.2. BEFORE field test.

7  COGNITIVE LAB        Small diverse think-aloud sample. Explicitly
                        sanctioned by Standard 3.3 for small N. Looking for
                        defensible-alternative-key and answerable-without-
                        passage failures.

8  FIELD TEST           Unscored, embedded, as AAMC does. Never a first
                        appearance in a scored context.

9  STATISTICAL REVIEW   p, item-total r, full option analysis (Lane 04 §10).
                        Target ≥2 functional distractors (≥5%); do not
                        expect 4.

10 DIF                  MH D-DIF A/B/C once N permits. C items → panel
                        review. Drop only if bias is evident (AAMC's rule).

11 APPROVE / REVISE     Revised item = new item. Return to step 8.

12 MONITOR              Ongoing accuracy and drift checks.
```

Two gates deserve emphasis because they are the ones a fast-moving team will skip.

**Step 5 cannot be automated.** AAMC's key standard is *"the most likely and most reasonable"* option, and NBME's one-best-answer principle says distractors *"do not have to be totally wrong."* Verifying that exactly one option is best among four partly-defensible options is a judgement about degree, and it is the specific judgement generative models are worst at — a model that wrote the item already believes its key is best.

**Step 4e is the cheapest high-value check in the whole workflow.** One extra inference call, and it directly tests the [OFFICIAL] constraint that most distinguishes CARS from a general knowledge test.

## Evidence quality for this lane

**Strong and directly usable:** §4's DIF thresholds are public, specific, and unchanged for decades across multiple ETS sources that agree in detail. §3's *Standards* citations are the governing professional consensus. §5 and §6 are well-established frameworks with primary sources.

**Solid but limited:** §1 is [OFFICIAL] and quotable but **thin** — five bullets and two paragraphs is the entire public record of AAMC's item-development process. It tells you *that* bias review, field testing, and subgroup analysis happen; it tells you nothing about panel composition, flagging thresholds, item-writer training content, or review checklists.

**Use with care:** §2's court record is unusually detailed and correspondingly dated — 1983, pre-1991 exam, an organisational arrangement that no longer exists. I have used it only for pipeline *shape*, and the shape is independently corroborated by the current [OFFICIAL] field-testing statement.

**[INFERENCE] and load-bearing:** §6's argument that template-based AIG does not transfer to passage-based items is mine. I am confident in it — the slot-substitution logic genuinely does not apply to semantically integrated prose — but it is an argument, not a citation, and someone may have solved passage-level AIG in work I did not find. §7's workflow is a synthesis; every individual gate traces to a cited source, the ordering and the gate thresholds are mine.

**Biggest gap:** AAMC's actual review checklists, panel composition, and DIF thresholds are not public. Everything in §4 and §7 substitutes ETS and Smarter Balanced practice for AAMC practice on the assumption that large testing programmes converge. That assumption is reasonable and unverified. See 00-README gaps 1 and 9.
