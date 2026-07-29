# Lane 02 — Passage design characteristics

What makes a text suitable as a CARS-style passage, what AAMC says about it, and what the text-complexity literature can actually deliver.

## 1. Official statements on passage character

All **[OFFICIAL]**, from https://students-residents.aamc.org/media/9261/download unless noted.

> "Critical Analysis and Reasoning Skills passages are relatively short, typically between 500 and 600 words, but they are **complex, often thought-provoking pieces of writing with sophisticated vocabulary and, at times, intricate writing styles.**"

> "Passages for the Critical Analysis and Reasoning Skills section — **even those written in a conversational or opinionated style — are often multifaceted and focus on the relationships between ideas or theories.** The questions associated with the passages will require you to assess the content, but you will also need to consider **the authors' intentions and tones and the words they used to express their points of view.**"

> "you, as the test taker, may find yourself **needing to read the passages and questions in ways that are different from the reading required in the textbooks** you used in most prehealth courses or on tests like the SAT Critical Reading exam."

> "Passages ... are **excerpted from the kinds of books, journals, and magazines that college students are likely to read.** Passages from the social sciences and humanities disciplines might present **interpretations, implications, or applications** of historical accounts, theories, observations, or trends of human society as a whole, specific population groups, or specific countries."

### The genre contrast, verbatim

| | Social sciences | Humanities |
| --- | --- | --- |
| Tone | *"tend to be more factual and scientific in tone"* | *"more likely to be written in a conversational or opinionated style"* |
| Focus | reconstruction, patterns, assumptions applied to evidence | *"often focus on the relationships between ideas"* |
| AAMC's own examples | how psychological and sociological assumptions help scholars reconstruct prehistoric civilisations from artifacts | how art reflects historical or social change; how the philosophy of ethics has adapted to technological change |

**[INFERENCE]** This contrast is a generator parameter, not decoration. The two halves of the form should differ measurably in stance density: humanities passages carry more first-person evaluative commitment and more hedged qualification; social-science passages carry more attributed evidence and more reported findings. If your two halves are stylistically indistinguishable you have collapsed a documented distinction.

## 2. "No outside knowledge" is a self-containment obligation, not a topic filter

This is the most consequential reframing in the lane and it is fully supported by [OFFICIAL] text.

> "**The topics of some passages in the Critical Analysis and Reasoning Skills section will be familiar; some will not. Explanations, illustrative examples, and definitions of significant specialized terms in these passages** will help you develop the strong basic foundation needed for answering all the questions you encounter in this section."

Read together with *"Everything you need to know to answer the test questions is in the passages and the questions themselves,"* the constraint decomposes into three obligations on the **text**, not on the topic:

1. **Every specialised term that any key or distractor turns on must be explained, exemplified, or defined in the passage.** AAMC names all three devices.
2. **Every proposition a key depends on must be locatable in the passage or stem.** Not merely consistent with it — locatable.
3. **No key may be reachable by world knowledge alone.** If a well-read test-taker can answer without the passage, the item measures prior knowledge, and AAMC's RWT prose says outside knowledge is inadmissible even when correct.

**[INFERENCE]** Obligation 3 gives you a cheap, automatable QA gate that nothing else in this review provides: **run every generated item stem+options through a model with the passage withheld.** If accuracy materially exceeds chance, the item leaks to prior knowledge and should be rejected or rewritten. This is the closest thing to a mechanical construct-validity check available to you, it costs one extra inference call per item, and it directly operationalises an [OFFICIAL] requirement. It is also the check that catches the failure mode an LLM-based generator is *most* prone to, because a generator writing about, say, utilitarianism will naturally produce keys that are true of utilitarianism rather than true of the passage.

The corollary is liberating: **you are not restricted to safe, familiar topics.** Unfamiliarity is expected and is handled inside the prose. Restricting topic range to what pre-meds plausibly know would *reduce* construct validity by importing prior knowledge, not increase it.

## 3. Structural requirements derived from the item framework

Each of these is a passage-level requirement implied by an [OFFICIAL] item-level requirement in Lane 01. Marked **[INFERENCE]** because AAMC states the item requirement, not the passage requirement — but the implication is tight, since the item cannot exist without the passage feature.

| Passage feature required | Because AAMC requires items about... |
| --- | --- |
| An identifiable author position or thesis, possibly implicit | *"identify the author's thesis"* (FOC.1); *"When it is not directly stated in any single sentence, you may be asked to infer what the author's main thesis might be"* (RWT.1) |
| **Reported or quoted positions the author does not hold** | *"identify points of view, other than the author's, presented indirectly through the author's summaries or paraphrases"* (RWT.1) |
| At least one argument with separable claim / evidence / support / relation | RWT.2's sub-skill name: *"claims, evidence, support, relations"* |
| A generalisation whose scope can be judged | *"the appropriateness of its generalizations"* (RWT.2) |
| At least one cited source with characterisable credibility | *"the credibility of the sources the author cites"* (RWT.2) |
| A causal claim | *"faulty notions of causality"* (RWT.2) |
| At least one connective asserting a relation the content underdetermines | *"plausible-sounding transitional phrases may in fact be tricky"* (RWT.2) |
| A detectable tension across non-adjacent parts | *"paradoxes, contradictions, or inconsistencies that can be detected across different parts of the passage"* (RWT.1) |
| A section that is arguably a digression | *"whether each section of text contributes to a sustained train of thought, as opposed to presenting an isolated detail or digressing"* (RWT.1) |
| Rhetorical labels / discourse connectives | *"rhetorical labels such as 'for example,' 'therefore,' or 'consequently'"* (FOC.1) |
| A figurative comparison with an extractable relational structure | *"translating a figurative comparison into equivalent sets of literal terms"* (RBT.1) |
| A marked opening and closing move | *"The beginning and ending of passages are two specific sections where the author often provides important information"* (FOC.2) |
| A thesis whose disruption by new information is gradable | *"which new fact or assertion would least alter the central thesis"* (RBT.2.d) |

**This table is the real passage specification.** A 550-word text that carries all thirteen affordances will support a 5–7 item set across all three skill categories. A text that carries only a thesis and some evidence will support four Foundations items and nothing else. **[INFERENCE]** Generate the passage against the affordance list, then generate items; do not generate a passage and hope.

## 4. Hedging and qualification

AAMC does not use the words *hedge* or *qualifier*. It does, however, require:

- judging *"the appropriateness of its generalizations"* [OFFICIAL]
- detecting *"vague or evasive terms"* [OFFICIAL]
- distinguishing conclusions that are *"reasonable ... from the limited information provided"* from ones that are not [OFFICIAL]
- endings that are *"a definitive solution, a partial resolution, or a call for additional research"* [OFFICIAL]

**[INFERENCE]** All four require **graded epistemic commitment** in the prose. A passage written entirely in flat assertions cannot support items about generalisation scope or conclusion reasonableness, because there is no variation in commitment to test. Concretely: the passage needs a mix of universally quantified claims, qualified claims (*most*, *tends to*, *in the cases examined*), and explicitly tentative claims (*may suggest*, *if this is right*).

This connects directly to the most reliable **[FOLKLORE]** heuristic in the prep world — "extreme options are usually wrong, hedged options are usually right." Lane 04 argues that heuristic is a symptom of *bad* item writing, not a feature of good items, and that the fix lives here in the passage: **if the passage itself contains strong universal claims the author genuinely endorses, then a strongly worded key is defensible and the hedging heuristic stops working.** Passage-level variation in commitment is what makes option-level commitment non-diagnostic. That is a construct-validity improvement, and it is achieved in the passage, not the options.

## 5. Reading level and complexity metrics

### Readability formulas: do not use them as a target

The critique is old, specific, and replicated. **[PEER]**

Bruce, Rubin & Starr, *Why readability formulas fail*, IEEE Trans. Prof. Comm. (1981), https://doi.org/10.1109/tpc.1981.6447826 — verbatim:

> "Because most of the formulas include only sentence length and word difficulty as factors, they can account only indirectly for other factors that make a particular text difficult, such as **degree of discourse cohesion, number of inferences required, number of items to remember, complexity of ideas, rhetorical structure, dialect, and background knowledge required.** Further, because the formulas are measurements based on a text isolated from the context of its use, they cannot reflect such reader-specific factors as motivation, interest, competitiveness, values, and purpose."

> "a formula validated with one group of students and one type of texts is found to be invalid for the same types of students and texts as conditions change over a 25-year period."

Note the list of seven omitted factors. **Six of the seven are precisely the CARS construct.** A formula that cannot see inference load, rhetorical structure, or idea complexity cannot measure CARS passage difficulty even in principle.

Three further peer-reviewed criticisms **[PEER]**, from the CLEAR corpus paper (https://pmc.ncbi.nlm.nih.gov/articles/PMC10027808/) and Reassessing the Accuracy and Use of Readability Formulae (https://doi.org/10.32890/mjli.11.2014.7668):

1. **No construct validity by construction.** *"Traditional readability formulas often lack strong construct validity since the features that they employ are solely based on statistical correlations to develop predictive power and may not be theoretically oriented."*
2. **Cohesion is absent and it matters.** *"A theoretically important component lacking from traditional readability formulas is text cohesion... an important feature of text comprehension because it helps readers build new knowledge and is an indicator of text readability."*
3. **The validation criterion is itself suspect.** *"the reading criteria used to develop traditional formulas are often based on multiple-choice questions and cloze tests, two methods that may not measure text comprehension accurately."* This is circular in a way that matters to you specifically: you would be using a formula validated against MCQ performance to design texts for MCQs.

And the practical warning that matters most: **optimising toward a formula degrades the text.** Shortening words and sentences to move a score can reduce coherence and therefore comprehensibility, because the formula's inputs are correlates, not causes. **Never use a readability target as a generation constraint.**

### What to use instead

**Coh-Metrix** (Graesser, McNamara, Louwerse & Cai) — 238 cohesion and readability indices, theoretically grounded in the Construction–Integration model. Used as the passage-feature extractor in Ozuru et al. (2008) **[PEER]**. Validated in Graesser, Louwerse, McNamara & Ozuru, *Validating Coh-Metrix*, CogSci 2006, https://escholarship.org/uc/item/6118t8p1.

The specific indices with empirical support in reading-comprehension **item-difficulty** work — not general readability work — are named in Lane 05. The short version: Ozuru et al. selected three as *"theoretically and empirically known to influence comprehension difficulty"* — **number of propositions (propositional density), words per sentence, and log average minimum-frequency content word per sentence** — and explicitly excluded Flesch Reading Ease from the model, using it only descriptively **[PEER]**.

### Cohesion is not monotonic — the reverse cohesion effect

**[PEER]** McNamara and colleagues repeatedly find that high cohesion helps low-knowledge readers while **low** cohesion can help high-knowledge readers, because filling gaps forces inference and produces a better situation model. Demonstrated in fourth-graders across narrative and science genres (https://iejee.com/index.php/iejee/article/view/222) and echoed in the item-difficulty setting: the dissertation-scale study at https://escholarship.org/uc/item/36j1p7hr found *"readers with higher vocabulary knowledge benefitted more from traditional textual affordances (e.g., shorter sentences, familiar words) than their peers with lower vocabulary knowledge"* and a **reverse effect for temporality** — time markers helped low-vocabulary readers, their absence helped high-vocabulary readers.

**[INFERENCE]** CARS is taken by a high-knowledge, high-vocabulary population. The reverse cohesion effect predicts that **deliberately reducing explicit cohesive marking is a valid difficulty lever for this population** — and, more importantly, that it is *construct-relevant*, because the reader compensates by inferring. This is a much better difficulty lever than vocabulary inflation, which is construct-irrelevant. It is also consistent with AAMC's *"intricate writing styles"* and with the *"unexpected transition in ideas"* item type being officially licensed.

Caveat, honestly: every reverse-cohesion study I found is on school-age readers, none on graduate-admissions populations. The extrapolation is directionally supported by the vocabulary-moderation finding but is **[INFERENCE]**.

## 6. Vocabulary demands

AAMC says *"sophisticated vocabulary"* [OFFICIAL] and simultaneously requires that *"definitions of significant specialized terms"* be present [OFFICIAL]. These are reconciled by distinguishing two vocabulary classes:

```
GENERAL_ACADEMIC   sophisticated but not defined; assumed known
                   → this is where "sophisticated vocabulary" lives
DOMAIN_SPECIALIZED must be explained, exemplified, or defined in-passage
                   → this is what "no outside knowledge" governs
```

**[PEER]** Word frequency is the passage variable with the strongest replicated effect on item difficulty in the whole literature. Ozuru et al. found a significant main effect and confirmed it with a median-split ANOVA: items on high-frequency-word passages were easier (M = .70) than items on low-frequency-word passages (M = .64), *F*(1,94) = 4.01, *p* < .05 **[PEER]**. Freedle & Kostin included vocabulary level among their predictors and found less frequent words make texts harder **[PEER]**.

**[INFERENCE]** Because minimum content-word frequency is the operative measure in Ozuru et al. — *the rarest content word in each sentence*, averaged — vocabulary difficulty is driven by **worst case per sentence, not mean**. A single rare word poisons a sentence. That is an actionable lint rule: flag sentences whose rarest content word falls below a frequency floor, and check whether that word is (a) general academic, in which case it is a legitimate difficulty contribution, or (b) domain-specialised and undefined, in which case it violates self-containment.

## 7. Abstraction level

**[PEER]** Ozuru et al. coded item abstractness using Mosenthal's (1996) five-level scheme, which is the only published abstraction scale I found used in reading item-difficulty modelling. Verbatim from their description:

> "The first level, most concrete, asked for the 'identification of persons, animals, or things.' The second level, the highly concrete class of questions, asked for the 'identification of amounts, times, or attributes.' The third level, intermediate questions, asked for the 'identification of manner, goal, purpose, alternative, attempt, or condition.' The fourth level, highly abstract, asked for the 'identification of cause, effect, reason, or result.' The highest level, the most abstract questions, asked for the 'identification of equivalence, difference, or theme.'"

The rationale: *"searching for abstract, as opposed to concrete, information in a passage tends to require a more extensive search and more information integration, rendering the task more difficult."*

```
MOSENTHAL_ABSTRACTNESS
  1  persons, animals, things
  2  amounts, times, attributes
  3  manner, goal, purpose, alternative, attempt, condition
  4  cause, effect, reason, result
  5  equivalence, difference, theme
```

This is a **question-level** scale, not a passage-level one, but it constrains the passage: a passage with no causal structure cannot host a level-4 item, and one with no thematic unity cannot host a level-5 item. **[INFERENCE]** CARS lives almost entirely at levels 3–5 — *purpose* is level 3, *cause/reason* is level 4, and *theme* and *equivalence* (which is what analogy items test) are level 5. Levels 1–2 correspond to the detail-retrieval items that CARS de-emphasises. Use the scale to audit whether your generated set is drifting downward into concrete retrieval.

Empirically, abstractness was the **only** item feature with a systematic effect at the higher grade band in Ozuru et al., and only via interactions with passage features **[PEER]**.

## 8. Passage specification — 12 constraints

Consolidated. [OFFICIAL] where marked; otherwise [INFERENCE] from the affordance table in §3.

1. **500–600 words.** [OFFICIAL]
2. **Discipline** from the 11 + 12 enum; over-weight ethics, philosophy, population health, studies of diverse cultures. [OFFICIAL]
3. **Genre register** matched to side: social science more factual/scientific, humanities more conversational/opinionated. [OFFICIAL]
4. **An author position**, either stated or recoverable from distributed evidence. [OFFICIAL, via FOC.1/RWT.1]
5. **At least one non-authorial position**, introduced by summary, paraphrase, or quotation, and distinguishable from the author's own. [OFFICIAL, via RWT.1]
6. **At least one complete argument** with separable claim, evidence, support, and stated relation. [OFFICIAL, via RWT.2]
7. **Graded epistemic commitment**: a mix of universal, qualified, and tentative claims. [INFERENCE, §4]
8. **At least one auditable defect** drawn from the `ARGUMENT_DEFECT` enum — an unsupported transition, an over-broad generalisation, a causal leap, or a source whose authority is characterisable. [OFFICIAL enum, INFERENCE that one must be present]
9. **A cross-passage tension** — paradox, contradiction, or inconsistency between non-adjacent parts — to license RWT.1 integration items. [OFFICIAL, via RWT.1]
10. **Every domain-specialised term explained, exemplified, or defined in-text.** [OFFICIAL]
11. **Marked opening and closing moves**, with the closing move drawn from the `ENDING_TYPE` enum. [OFFICIAL, via FOC.2]
12. **A thesis with gradable disruptability**, so that candidate additions can be ranked by how much they alter it. [OFFICIAL, via RBT.2.d]

Plus two things to **not** constrain:
- **Do not target a readability score.** §5.
- **Do not restrict to familiar topics.** §2.

And one QA gate:
- **Passage-withheld leakage test on every item.** §2.

## Evidence quality for this lane

Mixed and honestly so. §1, §2, §7 (the enums), §8 (constraints 1–6, 9–12) rest on quoted [OFFICIAL] text and are solid. §5's demolition of readability formulas is [PEER], old, and uncontested — that one you can rely on. §6's word-frequency finding is [PEER] but from a single study on grades 7–9.

Three genuine soft spots. (1) **§3's affordance table is [INFERENCE] throughout.** AAMC states item requirements; I derived passage requirements. The derivation is tight but it is mine. (2) **§5's reverse-cohesion recommendation extrapolates from school-age readers to graduate-admissions candidates** and I would prototype it before trusting it. (3) **The Mosenthal scale in §7 has been used, as far as I can tell, in exactly one item-difficulty study**, and in that study it produced no main effect at the band most similar to CARS. It is a useful audit lens, not a validated difficulty predictor.
