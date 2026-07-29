# Lane 03 — Item archetypes

## 1. Read this before using any archetype list

**AAMC publishes six sub-skills. AAMC does not publish a list of named question archetypes.** Every named taxonomy of CARS "question types" in circulation is prep-industry material.

The most widely propagated is Kaplan's, at https://www.kaptest.com/study/mcat/whats-tested-on-the-mcat-cars/, which presents:

- Foundations of Comprehension → **Main Idea, Detail, Inference, Definition-in-Context**
- Reasoning Within the Text → **Function, Strengthen–Weaken (Within the Passage)**
- Reasoning Beyond the Text → **Apply, Strengthen–Weaken (Beyond the Passage)**

**[FOLKLORE].** The misattribution mechanism is visible on the page itself: the sentence *"The AAMC has defined these critical analysis and reasoning skills as:"* is followed by the three official category names, and then the eight Kaplan type-names appear under them. A reader comes away believing all eleven labels are AAMC's. Only three are.

Two things are nonetheless true about the Kaplan list. It maps onto the official sub-skills without contradiction, and the eight categories describe recognisable item shapes. So it is *descriptively* useful and *authoritatively* worthless. Do not put "Kaplan question type" in a schema field named `aamc_question_type`.

Also **[FOLKLORE]**, from the same page and worth flagging because it is a claim about difficulty that is asserted without evidence: *"Reasoning Beyond the Text questions are often considered the most challenging."* AAMC does not say this. AAMC says the three categories differ in *scope* and *operation*, and explicitly says the percentages vary partly to control *"for question difficulty."* The prep-industry equation of skill category with difficulty is exactly the assumption Lane 05 shows is unsafe.

## 2. The authoritative layer

Use Lane 01's schema. `FOC.1, FOC.2, RWT.1, RWT.2, RBT.1, RBT.2` plus the four RBT.2 shapes AAMC describes (`RBT.2.a–d`). That is the layer that goes in a blueprint, gets reported to a learner, and gets audited against 30/30/40.

## 3. The operational layer — 10 archetypes

**[INFERENCE] throughout, but each is licensed by [OFFICIAL] language, quoted per archetype.** These are authoring templates, not a claim about AAMC's internal taxonomy. Schema: `archetype_id` is an internal label; `sub_skill` is the reportable official tag.

Two fields recur and need defining once.

**`evidence_span`** — the set of passage locations required to defend the key. This determines the FOC/RWT tag per Lane 01 §3, so it must be recorded at authoring time.

**`key_standard`** — what makes the key defensible. AAMC sets a comparative standard: *"the one option that presents the most likely and most reasonable outcome"* and *"only one defensible and demonstrably correct response option."* So `key_standard` describes the argument a reviewer would make for the key over the nearest distractor, not a truth condition.

---

### A1 · Central thesis / main idea

- **`sub_skill`** FOC.1 (thesis stated) or RWT.1 (thesis distributed)
- **Licensed by** *"You may be asked to identify the author's thesis, the main point or theme of the passage"* (FOC.1); *"When it is not directly stated in any single sentence, you may be asked to infer what the author's main thesis might be"* (RWT.1)
- **Stem shape** Which of the following best captures the central thesis of the passage? / The author's primary purpose is to…
- **`evidence_span`** Whole passage. Note this makes the *"paragraph numbers may be included"* affordance unavailable — main-idea items are inherently global.
- **`key_standard`** The key must cover the passage's full scope and its stance. The two failure directions are scope (covers part) and stance (right topic, wrong commitment). Both are distractor families in Lane 04.
- **Cognitive operation** Macrostructure construction — building the gist representation.
- **Difficulty lever, empirically grounded [PEER]** Thesis **location**. Freedle & Kostin found main-idea items easiest when the thesis sits in the opening sentences and hardest when it sits mid-text, replicating across SAT and GRE. Grounded in Kieras (1985) and Hare et al. (1989): readers expect main ideas early and correct identification is highest for initial placement. **This is the single most reliable difficulty dial in the entire review and it costs nothing to implement.** See Lane 05 §3.

### A2 · Meaning in context

- **`sub_skill`** FOC.2
- **Licensed by** *"others may ask you to select the definitions of specific words or phrases as they are used in context"*; *"questions may ask you to explain a highlighted word or phrase"*
- **Stem shape** As used in the passage, the phrase "…" most nearly means…
- **`evidence_span`** The target sentence plus immediate neighbours. **By definition local** — if resolution requires distant material the item is A4 or A5, not A2.
- **`key_standard`** The key is the reading the local context selects. The dictionary-primary sense must be **wrong here**, otherwise the item measures vocabulary rather than contextual inference, which is off-construct.
- **Cognitive operation** Lexical disambiguation under contextual constraint.
- **Design note** AAMC pairs this with *"connotative language or figures of speech,"* so figurative targets are licensed, not just polysemous literal ones.

### A3 · Function of a passage element

- **`sub_skill`** FOC.1 (function of a sentence or connective) or RWT.1 (function of a paragraph within the argument)
- **Licensed by** *"you need to be able to recognize the purpose of particular sentences and rhetorical labels such as 'for example,' 'therefore,' or 'consequently'"* (FOC.1); *"whether each section of text contributes to a sustained train of thought, as opposed to presenting an isolated detail or digressing from the central theme"* (RWT.1)
- **Stem shape** The author's discussion of X in paragraph 2 primarily serves to… / The reference to Y functions to…
- **`evidence_span`** The element, plus whatever it relates to. Local ⇒ FOC, distant ⇒ RWT. This archetype straddles the boundary more than any other, which is why `evidence_span` has to be recorded rather than inferred.
- **`key_standard`** The key names the **rhetorical role** — exemplify, concede, qualify, motivate, refute, transition — not the content. The dominant distractor family is content-restatement: an accurate summary of what the element *says* rather than what it *does*.
- **Cognitive operation** Recovering discourse-level intent from local material.
- **Design note** The digression clause is an under-used official license: AAMC sanctions items asking whether an element is *off* the train of thought. That requires the passage to contain a plausibly digressive section — Lane 02 §3, affordance 9.

### A4 · Author position, attitude, or tone

- **`sub_skill`** RWT.1
- **Licensed by** *"You may be asked to determine an author's message, purpose, position, or point of view. This may also extend to inferring their beliefs, noticing their assumptions, and detecting bias"*; *"To infer the author's beliefs, attitudes, or bias, look for clues in the tone of the passage, in the author's use of language or imagery, and in the author's choice of sources"*
- **Stem shape** The author's attitude toward X is best described as… / The author would most likely characterise X as…
- **`evidence_span`** Distributed by construction — AAMC lists three separate evidence types (tone, language/imagery, choice of sources), so a well-built item should require at least two.
- **`key_standard`** The key must match on **both valence and intensity**. This is where the passage's graded commitment (Lane 02 §4) earns its keep: if the passage contains only mild qualified evaluation, a strongly worded key is indefensible and the item degenerates into the hedging heuristic. If the passage contains a genuine strong commitment, a strong key is correct and the heuristic fails. **Vary this deliberately across the bank.**
- **Cognitive operation** Stance attribution from indirect evidence.
- **Design note** Use the [OFFICIAL] `TONE` enum (humorous / authoritative / satirical) as seed vocabulary, and remember AAMC's satire warning: surface tone and actual purpose can diverge, and the divergence is itself testable.

### A5 · Perspective attribution

- **`sub_skill`** RWT.1
- **Licensed by** *"It's very important to attend to perspective: Does the author present their own perspective, or do they use verbatim quotations or restatements from the perspective of other sources? You may be asked to identify points of view, other than the author's, presented indirectly through the author's summaries or paraphrases."*
- **Stem shape** According to the critics whose view the author summarises in paragraph 3, … / Which view does the author report without endorsing?
- **`evidence_span`** The reported position plus the authorial framing that signals non-endorsement.
- **`key_standard`** The key correctly assigns the proposition to its holder. The defining distractor family is **attribution swap** — a proposition accurately drawn from the passage but assigned to the wrong voice. This is a distinctive, high-quality distractor mechanism that requires *no* falsification and cannot be defeated by skimming.
- **Cognitive operation** Source monitoring / voice tracking.
- **Why this archetype matters disproportionately** It is explicitly named in [OFFICIAL] text, it is almost absent from prep-industry taxonomies, and it is the archetype most resistant to the option-elimination test-taking skills that Ozuru et al. flagged as construct-irrelevant (Lane 05 §5). Under-weighted everywhere; weight it up.

### A6 · Implicit assumption

- **`sub_skill`** RWT.2 (with RWT.1 involvement)
- **Licensed by** *"noticing their assumptions"* (RWT.1); RWT.2's *"claims, evidence, support, relations"* and *"the presence or absence of evidence"*
- **Stem shape** The author's argument in paragraph 2 depends on which of the following assumptions? / The passage's reasoning presupposes that…
- **`evidence_span`** The claim and its stated support. The assumption is by definition **not** in the passage — it is the unstated bridge.
- **`key_standard`** The key is a proposition the argument **requires**, in the sense that its negation defeats the inference. That is a mechanical, checkable criterion and it is the strongest key standard available in the whole taxonomy: *negate the key and verify the argument fails; negate each distractor and verify the argument survives.* **[INFERENCE]** Build this negation check into QA — it is the one archetype where key defensibility can be verified almost algorithmically.
- **Cognitive operation** Recovering an enthymematic premise.
- **Tension worth noting** AAMC's self-containment rule says everything needed is in the passage or stem, yet an assumption item's key is by construction *not* in the passage. The resolution: the key is *derivable* from the argument's structure, which is in the passage. The item is legitimate as long as identifying the gap requires no world knowledge — only that the inference from stated support to stated claim be inspected. Keep assumptions structural, never factual.

### A7 · Argument evaluation (strengthen / weaken, within passage)

- **`sub_skill`** RWT.2
- **Licensed by** *"Some questions will direct your attention to an argument, claim, or evidence presented in the passage and then ask you to evaluate it according to specific criteria"* — with the five [OFFICIAL] criteria: logic and plausibility, soundness, reasonableness of conclusions, appropriateness of generalizations, credibility of cited sources
- **Stem shape** The author's claim that X is best supported by which element of the passage? / Which aspect of the passage most undermines the author's conclusion about X?
- **`evidence_span`** Distributed — the target claim plus the supporting or undercutting material elsewhere.
- **`key_standard`** The key names a genuine evidential relation *internal to the passage*. Because the material is all passage-internal, nothing here requires world knowledge, which makes A7 the cleanest argument item type available.
- **Cognitive operation** Evaluating support relations against a named criterion.
- **Design note** Parameterise by the [OFFICIAL] `EVALUATION_CRITERION` enum and target the [OFFICIAL] `ARGUMENT_DEFECT` enum. The `unsupported_transition` defect is the most distinctive: AAMC describes it directly — *"plausible-sounding transitional phrases... If read quickly, the words appear to make a legitimate connection... when subjected to scrutiny, the links they appear to have established may fall apart."* Plant one, then ask about it.

### A8 · Application to a new situation

- **`sub_skill`** RBT.1
- **Licensed by** *"the test question provides specific directions about how the passage information might be applied to a new situation or how it might be used to solve a problem outside the specific context of the passage"*; *"if a question asks you to determine the author's likely response to four hypothetical situations, you would choose the response most consistent with what the author has already said or done"*
- **Stem shape** Which of the following situations would the author most likely regard as an instance of X? / Based on the passage, the author would most likely approve of which policy?
- **`evidence_span`** The principle or framework, wherever established. Passage is **fixed**.
- **`key_standard`** [OFFICIAL] and comparative: *"the most likely and most reasonable outcome, based only on the information provided in the passage and the question."* Elimination criterion is also [OFFICIAL]: *"rule out the options that do not fit or are incongruent with the context (e.g., framework, perspective, scenario) created by the passage material."*
- **Cognitive operation** Instantiating an abstract principle in a novel concrete case.
- **Highest leakage risk in the taxonomy.** Novel scenarios in the options invite world-knowledge answering. **[INFERENCE]** A8 items should always get the passage-withheld leakage test from Lane 02 §2. A generator writing "which policy would the author approve" will produce options where one is obviously the nice one, and the item then measures values rather than reading.

### A9 · Analogy / structural correspondence

- **`sub_skill`** RBT.1
- **Licensed by** *"Application questions sometimes require selecting a response option that is most analogous to some relationship in the passage. Here the parameters are broad. **Likeness is measured not by inherent similarity but by analogy.** Questions dealing with analogies test the ability to identify a fundamental common feature that seemingly different things or processes share. This may sometimes require translating a figurative comparison into equivalent sets of literal terms. However, the task always requires looking beneath surface imagery to discern underlying relationships or paradigms."*
- **Stem shape** The relationship between X and Y described in the passage is most analogous to…
- **`evidence_span`** The source relation.
- **`key_standard`** The key preserves the **relational structure** while changing the domain entirely. AAMC's phrase *"seemingly different things"* is a design instruction: **surface dissimilarity in the key is a feature.**
- **Cognitive operation** Structural alignment / relational mapping.
- **The distractor family is officially handed to you.** *"looking beneath surface imagery"* means the intended trap is **surface similarity with wrong structure** — an option from the same domain as the passage that does not preserve the relation. This is the most explicitly specified distractor mechanism in the entire AAMC framework, and it is domain-general enough to template.

### A10 · Effect of new information (incorporation)

- **`sub_skill`** RBT.2, shape `a`–`d`
- **Licensed by** the RBT.2 prose quoted in full in Lane 01 §6
- **Stem shapes, one per official shape**
  - `a` Suppose it were discovered that Z. This finding would most directly [support / contradict] the passage's claim that…
  - `b` If Z were true, the author's argument would… (coexist / require abandoning a component)
  - `c` If Z were true, which modification to the passage's argument would be required?
  - `d` Which of the following, if added to the passage, would **least** alter the author's central thesis?
- **`evidence_span`** The claim(s) the new information bears on. Passage is **malleable** — this is the [OFFICIAL] distinction from A8.
- **`key_standard`** For `a`–`c`, the key correctly characterises the logical relation between the injected proposition and a specific passage claim. For `d`, the key is the **minimally disruptive** addition.
- **Cognitive operation** Belief revision over a text-derived model.
- **Why `d` is the most valuable shape in the taxonomy** [INFERENCE] It has a built-in, monotone difficulty gradient. The four options can be ordered by disruption magnitude, the key is the minimum, and the nearest distractor is the second-minimum. Narrowing the gap between first and second raises difficulty **continuously and construct-relevantly** — the reader must reason more finely about the thesis, not read faster or know more words. Almost every other archetype's difficulty levers are lumpy. This one is a dial.
- **Also note** `d` places the novel material **in the options**, not the stem. That is unusual, officially described, and largely absent from prep-industry taxonomies.

---

## 4. Archetype → sub-skill coverage matrix

| Archetype | FOC.1 | FOC.2 | RWT.1 | RWT.2 | RBT.1 | RBT.2 |
| --- | --- | --- | --- | --- | --- | --- |
| A1 Central thesis | ● | | ○ | | | |
| A2 Meaning in context | | ● | | | | |
| A3 Function of element | ● | | ○ | | | |
| A4 Author position/tone | | ○ | ● | | | |
| A5 Perspective attribution | | | ● | | | |
| A6 Implicit assumption | | | ○ | ● | | |
| A7 Argument evaluation | | | | ● | | |
| A8 Application | | | | | ● | |
| A9 Analogy | | | | | ● | |
| A10 New information | | | | | | ● |

● primary · ○ possible depending on `evidence_span`

**Blueprint feasibility check.** Target 30/30/40 over a 53-item form. FOC 30% ≈ 16 items must come from A1/A2/A3 (+A4 when local). RWT 30% ≈ 16 from A4/A5/A6/A7 (+A1/A3 when distributed). RBT 40% ≈ 21 from A8/A9/A10 alone. **RBT is the binding constraint**: the largest share of the form is served by the fewest archetypes, all three requiring novel material, and A9 requires an extractable relational structure in the passage. **[INFERENCE]** Expect RBT to be the hardest quota to fill at quality, and expect A10 to carry most of it since A9 is passage-gated. If you find yourself short on RBT, the fix is upstream in passage design — affordances 11 and 12 in Lane 02 §8 — not in item writing.

## 5. Notes on stem construction

From Haladyna/Downing/Rodriguez **[PEER]**, filtered to what applies here (full set in Lane 04):

- **G15 · Central idea in the stem, not the choices.** The only guideline at **100%** textbook endorsement. For CARS this means the stem must fully determine what is being asked before the reader reaches the options. Unfocused stems are the classic violation.
- **G14 · Directions in the stem must be very clear.** Especially load-bearing for A10, where the reader must know whether the injected fact is in the stem or the options and whether *most* or *least* is wanted.
- **G17 · Word the stem positively; if a negative is used, capitalise and bold it.** CARS does use NOT/LEAST/EXCEPT stems. Note Freedle & Kostin excluded capitalised NOT/LEAST items from their difficulty analyses, so **there is no published difficulty model for negated reading stems** [PEER, by omission]. Evidence on negation effects is mixed: three of four studies found no difficulty difference from negatively worded stems; one found them *less* difficult, inconsistently [PEER].
- **G16 · Avoid window dressing.** Contextual verbiage in the stem that does not bear on the answer inflates reading load. In a 90-minute/53-item section, this converts construct-relevant variance into speed variance.
- **G13 · Minimize reading in each item.** NBME's version is sharper: option length *"can shift the construct that is being measured from content knowledge to reading speed"* [PEER]. For a **reading** test this is subtler than it sounds — reading load is not automatically off-construct — but option-set reading load is, because it is not the passage.

## Evidence quality for this lane

**§1 is solid and important**: the Kaplan misattribution is verifiable on the cited page.

**§2 is [OFFICIAL].**

**§3 is [INFERENCE] and should be treated as a proposal, not a finding.** The archetypes are mine. What is not mine is the licensing quote attached to each, and those are the reason to trust the shape of the list rather than the list itself. Every archetype earns its place by pointing at official language; if you disagree with an archetype boundary, redraw it — but keep the quote coverage complete, because collectively the ten archetypes exhaust the official sub-skill prose, and that exhaustiveness is the actual claim.

Three specific weaknesses. (1) **A6's key standard — negate and check — is mine, is unusually crisp, and is untested.** I would prototype the negation check before relying on it. (2) **A10.d's continuous difficulty gradient is [INFERENCE] and rests on an intuition about disruption magnitude being orderable.** Whether human raters can reliably order four additions by thesis disruption is an empirical question I found no evidence on. (3) **The A8 leakage warning is [INFERENCE]** but it follows directly from Lane 02 §2 and I am confident in it.

The single largest gap: **the AAMC CARS Diagnostic Tool reportedly contains per-question skill explanations** and is paywalled. If the team can license it, it would let §3 be replaced with something authoritative, or at minimum let each archetype be validated against real skill tags. See 00-README gap 2.
