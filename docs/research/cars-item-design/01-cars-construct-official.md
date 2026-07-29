# Lane 01 — The CARS construct, officially

Everything in this lane is **[OFFICIAL]** unless marked otherwise. Quotes are verbatim.

## Primary sources

| Source | URL |
| --- | --- |
| *What's on the MCAT Exam?* content outline, PDF (doc ID `20-002D (10/20)`) — the authoritative full text, including all sub-skill prose | https://students-residents.aamc.org/media/9261/download |
| CARS Section: Overview | https://students-residents.aamc.org/whats-mcat-exam/critical-analysis-and-reasoning-skills-section-overview |
| CARS Skill 1: Foundations of Comprehension | https://students-residents.aamc.org/critical-analysis-and-reasoning-skills/critical-analysis-and-reasoning-skills-section-skill-1-foundations-comprehension |
| CARS section one-pager | https://www.aamc.org/media/18921/download |
| *What's on the MCAT Exam?* chapter (section structure table) | https://students-residents.aamc.org/whats-mcat-exam/publication-chapters/whats-mcat-exam |
| *Testing Academic Competencies with the 2015 MCAT Exam* (fairness practices) | https://students-residents.aamc.org/media/11406/download |

**Note on the web pages.** The four `students-residents.aamc.org` CARS skill pages render their sub-skill content inside collapsed accordions that do not serve to a fetcher — the Skill 1 page returns only the headings *"Understanding the Basic Components of the Text"* and *"Inferring Meaning from Rhetorical Devices, Word Choice, and Text Structure"* with no body text. **Use the PDF.** It contains the complete prose for all three skills.

---

## 1. Section structure

| Attribute | Value | Source |
| --- | --- | --- |
| Questions | **53**, *"note that questions are all passage-based"* | Overview + PDF |
| Time | **90 minutes** | Overview + PDF |
| Passage sets | **9**, *"passage-based sets of questions (5-7 questions per set)"* | *What's on the MCAT Exam?* chapter |
| Passage length | *"relatively short, typically between 500 and 600 words"* | PDF |
| Response options | **four** — *"analyze the choices offered in the four response options"* | PDF |
| Content split | **Humanities 50% / Social Sciences 50%** | PDF |
| Skill split | **Foundations of Comprehension 30% / Reasoning Within the Text 30% / Reasoning Beyond the Text 40%** | PDF + Overview |

**The percentages are soft, and AAMC says why.** Verbatim:

> "These percentages have been approximated to the nearest 5% and will vary from one test to another for a variety of reasons, including, but are not limited to, controlling for question difficulty, using groups of questions that depend on a single passage, and using unscored field-test questions on each test form."

Three consequences for a generator. First, **±5% is officially sanctioned tolerance** — do not over-constrain form assembly. Second, *"using groups of questions that depend on a single passage"* is an admission that **set structure constrains skill mix**: you cannot freely mix skill categories within a 5–7 item set without regard to what the passage will support. Third, **unscored field-test items are on every form**, which is the mechanism Lane 06 recommends you imitate.

## 2. The three skills and six sub-skills — verbatim

This is the blueprint. AAMC's own list, reproduced exactly as it appears in the PDF:

> **Critical Analysis and Reasoning Skills**
>
> **Foundations of Comprehension**
> - Understanding the basic components of the text
> - Inferring meaning or intent from immediate sentence context
>
> **Reasoning Within the Text**
> - Integrating distant components of the text to infer an author's message, intent, purpose, belief, position, bias, assumptions
> - Recognizing and evaluating arguments and their structural elements (claims, evidence, support, relations)
>
> **Reasoning Beyond the Text**
> - Applying or extrapolating ideas from the passage to new contexts
> - Assessing the impact of incorporating new factors, information, or conditions on ideas from the passage

### Code-ready schema

```
FOC   Foundations of Comprehension            target 30%
  FOC.1  Understanding the basic components of the text
  FOC.2  Inferring meaning or intent from immediate sentence context
RWT   Reasoning Within the Text                target 30%
  RWT.1  Integrating distant components of the text to infer an author's
         message, intent, purpose, belief, position, bias, assumptions
  RWT.2  Recognizing and evaluating arguments and their structural elements
         (claims, evidence, support, relations)
RBT   Reasoning Beyond the Text                target 40%
  RBT.1  Applying or extrapolating ideas from the passage to new contexts
  RBT.2  Assessing the impact of incorporating new factors, information,
         or conditions on ideas from the passage
```

## 3. The retrieval-scope rule — the most important structural fact

AAMC states the FOC/RWT boundary twice, in near-identical wording, once under each skill:

> "Questions that test Foundations of Comprehension rely on many of the same activities required for Reading Within the Text questions. **One key difference is in the scope of the information needed to answer the question.** The Foundations of Comprehension questions mainly focus on inferring meaning or intent from an immediate sentence context."

> "Questions that test Reasoning Within the Text differ from those assessing Foundations of Comprehension in that they ask you to **integrate distant passage components** into a more generalized and complex interpretation of passage meaning."

**Classifier spec [INFERENCE, but tightly constrained by the above].** Tag an item RWT rather than FOC when the evidence set required to defend the key spans more than one sentence-neighbourhood — i.e. when the reader must combine propositions from non-adjacent locations. Tag FOC when the key is defensible from a single sentence plus its immediate context. Stem wording is **not** diagnostic: "What does the author most likely mean by X?" is FOC.2 if X resolves locally and RWT.1 if resolving X requires the author's position established elsewhere. A generator should compute this tag from the **evidence spans it used to author the key**, not from the stem template. This is directly implementable if your authoring pipeline records evidence spans, and impossible if it does not — so record them.

## 4. Foundations of Comprehension — official prose, decomposed

### FOC.1 Understanding the basic components of the text

> "The most fundamental questions on the Critical Analysis and Reasoning Skills section ask about the basic components of the passages. Comprehension questions at this level may ask you to provide a general overview of the passage or to focus on specific portions of the text. You may be asked to recognize the literal meaning of a particular word or phrase. You may be asked to identify the author's thesis, the main point or theme of the passage, or specific examples. In responding to these questions, you need to be able to recognize the purpose of particular sentences and rhetorical labels such as 'for example,' 'therefore,' or 'consequently.'"

Enumerated targets: general overview · specific portions · literal meaning of a word or phrase · author's thesis · main point or theme · specific examples · **purpose of particular sentences** · **rhetorical labels** (three named: *for example*, *therefore*, *consequently*).

The rhetorical-label clause is a concrete authoring hook: AAMC names discourse connectives as a testable object. That licenses items about the function of a connective.

### FOC.2 Inferring meaning or intent from immediate sentence context

> "Questions may also require you to infer meanings that can't be determined from a literal reading of the text, such as meanings the author has implied but did not state directly. Comprehension questions at this level may ask you to interpret the meaning of words or expressions, or the author's intent, using the immediate sentence context. These questions may ask you to interpret rhetorical devices or word choice. Or, you may have to consider how the author has structured the text — for example, through cause-and-effect relationships for discussions in the behavioral sciences, chronologically for historical discussions, or point-and-counterpoint for political science pieces. Identifying the basic structure should help you understand the passage and determine its general purpose. You may also need to attend to specific subtle and nuanced rhetorical decisions an author has made to shape his or her ideas, arguments, or discussions and perhaps to complicate a passage's meaning. For example, questions may ask you to explain a highlighted word or phrase or an unexpected transition in ideas. To answer these questions, look for clues in the context around the specific sections of the passage. An author's choice about tone (e.g., humorous, authoritative, satirical) also contributes to — or obscures — meaning, and tone can often communicate the purpose for which a passage is written (e.g., to persuade, instruct, inform, entertain). For example, a satirical piece may at first seem merely entertaining, but a closer examination often reveals that its purpose is actually to persuade."

> "Some questions at this level may ask about information not specifically stated in the passage, and you must make assumptions based on what the author merely hints at through his or her use of connotative language or figures of speech."

> "The beginning and ending of passages are two specific sections where the author often provides important information about the general theme, message, or purpose for the work. Does the author state their main point in an introductory or closing sentence? Does the passage end with a definitive solution, a partial resolution, or a call for additional research? Does it end with a dramatic rhetorical statement or a joke that leaves unanswered questions? Again, considering these specific sections can help inform your basic understanding of the passage."

**Three official controlled vocabularies fall out of this passage.** Use them as enums.

```
TEXT_STRUCTURE   (AAMC's examples, tied to discipline)
  cause_and_effect        e.g. behavioral sciences
  chronological           e.g. historical discussions
  point_and_counterpoint  e.g. political science pieces

TONE             (AAMC's examples)
  humorous | authoritative | satirical

PURPOSE          (AAMC's examples)
  persuade | instruct | inform | entertain

ENDING_TYPE      (AAMC's examples)
  definitive_solution | partial_resolution | call_for_further_research
  | dramatic_rhetorical_statement | joke_leaving_questions_open
```

The satire example is a design instruction in disguise: AAMC is telling you that **surface tone may diverge from actual purpose**, and that the divergence is testable. `tone` and `purpose` are independent fields, not one field.

## 5. Reasoning Within the Text — official prose, decomposed

The framing constraint first, because it is the strongest "no outside knowledge" statement AAMC makes anywhere:

> "It's important to remember that Reasoning Within the Text questions do not ask you to provide your own personal opinion. You may, in fact, disagree with the author's overall conclusion yet find that the conclusion is a reasonable inference from the limited information provided in the passage. **If you happen to know some obscure fact or anecdote outside the scope of the passage that could invalidate the author's conclusion, ignore it.** The content of the passage or new information introduced by the questions should be the only sources you base your responses on."

This is stronger than "no outside knowledge is required." It is "outside knowledge is **inadmissible even when it is correct and decisive**." For a generator that means: **a distractor is not rescued by being true in the world**, and a key is not damaged by being false in the world. The universe of discourse is the passage plus the stem.

### RWT.1 Integrating distant components of the text

> "Many questions that test Reasoning Within the Text skills require you to integrate distant components of the text to infer meaning or intent. You may be asked to determine an author's message, purpose, position, or point of view. This may also extend to inferring their beliefs, noticing their assumptions, and detecting bias. When it is not directly stated in any single sentence, you may be asked to infer what the author's main thesis might be. You may be asked to consider whether each section of text contributes to a sustained train of thought, as opposed to presenting an isolated detail or digressing from the central theme. You may be asked about paradoxes, contradictions, or inconsistencies that can be detected across different parts of the passage. You will also need to be able to recognize when an author presents different points of view within the passage."

> "To infer the author's beliefs, attitudes, or bias, look for clues in the tone of the passage, in the author's use of language or imagery, and in the author's choice of sources. To determine the author's position, look for their expressed point of view. Carefully consider the extent to which the author uses summaries or paraphrases to introduce others' points of view. It's very important to attend to perspective: Does the author present their own perspective, or do they use verbatim quotations or restatements from the perspective of other sources? **You may be asked to identify points of view, other than the author's, presented indirectly through the author's summaries or paraphrases.**"

Enumerated targets: message · purpose · position · point of view · beliefs · **assumptions** · **bias** · implicit thesis · **sustained train of thought vs isolated detail vs digression** · **paradoxes, contradictions, inconsistencies across parts** · **multiple points of view within one passage** · **attribution of a view to author vs to a cited source**.

The last item is the single most under-appreciated official requirement. AAMC explicitly wants items where the test-taker must distinguish *the author's* view from *a view the author is reporting*. That requires the passage to contain reported speech, paraphrase, or quotation of positions the author does not hold — which is a **passage design requirement**, not just an item requirement. Lane 02 carries it forward.

### RWT.2 Recognizing and evaluating arguments

> "Questions assessing Reasoning Within the Text will also require you to understand how the different parts of the passage fit together to support the author's central thesis. Some questions will direct your attention to an argument, claim, or evidence presented in the passage and then ask you to evaluate it according to specific criteria. The criteria could be **the logic and plausibility of the passage text, the soundness of its arguments, the reasonableness of its conclusions, the appropriateness of its generalizations, or the credibility of the sources the author cites.** The questions require you to dig beneath the passage's surface as you examine **the presence or absence of evidence, the relevance of information, and faulty notions of causality** and to determine the significance of and relationships among different parts of a passage. Some questions may require that you analyze the author's language, stance, and purpose. For example, **plausible-sounding transitional phrases may in fact be tricky. If read quickly, the words appear to make a legitimate connection between parts of a passage; however, when subjected to scrutiny, the links they appear to have established may fall apart.**"

> "Similar to your reactions when you hear someone trying to convince you about something, persuade you to think a particular way, or sell you something, these questions often invite you to doubt and then judge the author's intentions and credibility. Questioning an author is a legitimate and often necessary analysis strategy... Answering these questions requires looking beyond contradictions or omission of facts or details to find clues such as **vague or evasive terms or language that sounds self-aggrandizing, overblown, or otherwise suspect** within the context of the passage. **Credible sources — essayists, scientists, lecturers, even pundits — should be both authoritative and objective and should clearly demonstrate expertise.** Blatant, one-sided arguments and rigid points of view are easy to identify, but some authors are more nuanced in presenting biased ideas in the guise of objectivity. The key to identifying bias lies in identifying the author's treatment of ideas... For example, **an author who uses demeaning stereotypes or derogatory labels is not likely to be a source of objective, judicious analysis.**"

**Two more official enums.**

```
EVALUATION_CRITERION          (AAMC's list, verbatim scope)
  logic_and_plausibility
  soundness_of_arguments
  reasonableness_of_conclusions
  appropriateness_of_generalizations
  credibility_of_cited_sources

ARGUMENT_DEFECT               (AAMC's named defects)
  absence_of_evidence
  irrelevance_of_information
  faulty_causality
  unsupported_transition        # the "plausible-sounding transitional phrase"
  vague_or_evasive_language
  self_aggrandizing_or_overblown_language
  one_sided_argument
  bias_disguised_as_objectivity
  demeaning_stereotype_or_derogatory_label
```

`unsupported_transition` is worth singling out. AAMC is describing a **specific, authorable passage flaw**: a connective that asserts a logical relation the surrounding content does not support. That is an argument-evaluation item generator in one line, and it is officially licensed.

## 6. Reasoning Beyond the Text — official prose, decomposed

> "The final category, Reasoning Beyond the Text, requires you to use one of two analysis or reasoning skills, which in a way can be thought of as two sides of a single coin."

> "Application and integration questions elicit some of the same kinds of thinking. Both types deal with changes caused by combinations or comparisons, and both test your mental flexibility. They do differ, however... Remember, though, that as with questions assessing different levels of analysis and reasoning, **you must still use only the content of the passages and the new information in the questions to determine your answers. Keep avoiding the temptation to bring your existing knowledge to bear.**"

The distinction between the two sub-skills is stated crisply and is the cleanest official definition in the whole framework:

> "The essential difference between application and incorporation skills is that the two-part purpose of incorporation questions is to introduce a specific piece of information for you to consider and ask you to assess how ideas in the passage might be affected by its introduction. **The premise of these questions is that ideas and information in the passages are potentially malleable, not a fixed framework, as in application questions.**"

**RBT.1 treats the passage as fixed and moves the situation. RBT.2 treats the passage as malleable and moves the passage.** That is the whole distinction, and it is a clean switch in a generator.

### RBT.1 Applying or extrapolating ideas to new contexts

> "Virtually all questions assessing application or extrapolation skills ask you how the information or ideas presented in the passage could be extended to other areas or fields. This is the kind of high-level analysis and reasoning skill scientists or theoreticians use when they consider a set of facts or beliefs and create new knowledge by combining the 'givens' in new ways."

> "For each application question, the passage material is the 'given,' and the test question provides specific directions about how the passage information might be applied to a new situation or how it might be used to solve a problem outside the specific context of the passage. As the test taker, your first task is to analyze the choices offered in the four response options so that you can gauge the likely outcome of applying the existing passage content to the specified new context. **Each response option will yield a different result, but each test question has only one defensible and demonstrably correct response option.**"

> "**The correct answer is the one option that presents the most likely and most reasonable outcome, based only on the information provided in the passage and the question.** The questions do not assess your personal ability to apply information or solve problems, only your ability to apply information from the question to the passage you have read. For example, if a question asks you to determine the author's likely response to four hypothetical situations, you would choose the response most consistent with what the author has already said or done according to the text of the passage. **In determining the correct response, rule out the options that do not fit or are incongruent with the context (e.g., framework, perspective, scenario) created by the passage material.**"

> "Application questions sometimes require selecting a response option that is most analogous to some relationship in the passage. Here the parameters are broad. **Likeness is measured not by inherent similarity but by analogy.** Questions dealing with analogies test the ability to identify a fundamental common feature that seemingly different things or processes share. This may sometimes require translating a figurative comparison into equivalent sets of literal terms. However, **the task always requires looking beneath surface imagery to discern underlying relationships or paradigms.**"

Three things a generator must take from this. (a) The **key standard is comparative and defeasible**: *most likely and most reasonable*, not *true*. This is a one-best-answer format in the NBME sense — distractors need not be false, only less defensible. (b) The **elimination criterion is congruence with the passage-created context**, and AAMC names four kinds: framework, perspective, scenario, and context itself. (c) The analogy archetype is officially licensed and officially warned about: **surface similarity is a distractor mechanism**, structural correspondence is the key.

### RBT.2 Assessing the impact of new factors, information, or conditions

> "The second set of skills involves considering new information presented in a test question, mentally integrating this new information into the passage content, and then assessing the potential impact of introducing the new elements into the actual passage. **Reasoning about new, hypothetical elements should cause you to synthesize passage content anew and alter your interpretation of the passage in some plausible way.**"

> "In some incorporation questions, you must find the best answer to a 'what if' question by reinterpreting and reassessing passage content with the additional fact or idea introduced by the question. **Does the new information support or contradict the inherent logic of the passage? Could the new information coexist with what is already in the passage, or would it negate an aspect of the author's argument?** If the latter is the case, the question could ask **what modifications or alterations might need to be made to the passage content to accommodate the new element** introduced by the question. Remember, the passage should be considered malleable."

> "Other forms of incorporation questions may ask you to think about a possible logical relationship that might exist between the passage content and the facts or assertions included in the answer options. **The task is to select the one option that, if added to the passage content, would result in the least amount of change.** The correct response option will present the situation or argument that is most similar to what is outlined in the passage. In other words, **you must determine which new fact or assertion would least alter the central thesis the passage has developed.**"

Four distinct RBT.2 item shapes are described here, and they are not interchangeable:

```
RBT.2.a  new info in stem → does it support or contradict passage logic?
RBT.2.b  new info in stem → can it coexist, or does it negate part of the argument?
RBT.2.c  new info in stem → what modification would the passage need to accommodate it?
RBT.2.d  new info in the OPTIONS → which addition least alters the central thesis?
```

`RBT.2.d` inverts the usual structure: the novel material lives in the options rather than the stem, and the key is the **minimally disruptive** option. Note that this makes the three distractors *more* disruptive, which gives the item a natural difficulty gradient — the closest distractor is the second-least-disruptive. Lane 04 uses this.

## 7. Content: disciplines and passage sourcing

> "Passages in the Critical Analysis and Reasoning Skills section are excerpted from the kinds of books, journals, and magazines that college students are likely to read. Passages from the social sciences and humanities disciplines might present interpretations, implications, or applications of historical accounts, theories, observations, or trends of human society as a whole, specific population groups, or specific countries."

> "Of these two types of passages (social sciences and humanities), **social sciences passages tend to be more factual and scientific in tone.** For example, a social sciences passage might discuss how basic psychological and sociological assumptions help scholars reconstruct patterns of prehistoric civilizations from ancient artifacts. **Humanities passages often focus on the relationships between ideas and are more likely to be written in a conversational or opinionated style.** Therefore, you should keep in mind the tone and word choice of the author in addition to the passage assertions themselves. Humanities passages might describe the ways art reflects historical or social change or how the philosophy of ethics has adapted to prevailing technological changes."

### Discipline enum — verbatim, both lists prefixed *"including (but not limited to)"*

```
HUMANITIES (11)
  Architecture · Art · Dance · Ethics · Literature · Music · Philosophy
  Popular Culture · Religion · Theater · Studies of Diverse Cultures †

SOCIAL_SCIENCES (12)
  Anthropology · Archaeology · Economics · Education · Geography · History
  Linguistics · Political Science · Population Health · Psychology
  Sociology · Studies of Diverse Cultures
```

> "† Depending on the focus of the text, a Studies of Diverse Cultures passage could be classified as belonging to either the Humanities or Social Sciences."

**Studies of Diverse Cultures is the only dual-membership discipline.** Model it as a discipline with a required `classified_as: humanities | social_sciences` field, resolved by focus, rather than as two separate disciplines.

The lists say *"but not limited to,"* so they are not closed. **[INFERENCE]** For a generator, treat them as closed anyway — you gain nothing from off-list disciplines and you lose blueprint auditability.

### Emphasised areas

The section one-pager singles out four areas for increased attention:

> "The new exam gives increased attention to passages about **population health, studies of diverse cultures, ethics, and philosophy** to encourage applicants to read broadly and familiarize themselves with the issues and arguments these disciplines raise."

The Overview page repeats these four in its list of what the section is designed to do. **[INFERENCE]** Over-weight these four relative to a uniform draw across 21 disciplines. Note two of the four (ethics, philosophy) are humanities and two (population health, studies of diverse cultures) are social sciences, so the emphasis is content-balance-neutral.

## 8. What the section is designed to do — the three official design goals

> "This section is designed to:
> - Test your comprehension, analysis, and reasoning skills by asking you to critically analyze information provided in passages.
> - Include content from ethics, philosophy, studies of diverse cultures, population health, and a wide range of social sciences and humanities disciplines.
> - Provide all the information you need to answer questions in the passages and questions themselves."

And from the one-pager, the operational verbs:

> "The Critical Analysis and Reasoning Skills section tests how well applicants **comprehend, analyze, and evaluate** what they read, **draw inferences** from text, and **apply arguments to new ideas and situations**. It asks applicants to **process information, draw conclusions, and solve problems** from information that is presented in passages."

> "However, the questions on the Critical Analysis and Reasoning Skills test **do not rely on specific background knowledge** in the humanities and social sciences. Applicants get all the information they need to answer the questions in the accompanying passages or in the questions themselves."

## 9. The ten official hard constraints

Distilled from the above. These are the assertions a generator must not violate, each traceable to quoted [OFFICIAL] language earlier in this file.

1. **Self-sufficiency.** All information needed is in the passage or the stem. No item may require a fact not present in one of the two.
2. **Outside knowledge is inadmissible, not merely unnecessary.** A correct real-world fact that defeats the author must not defeat the key.
3. **Exactly one defensible key.** *"each test question has only one defensible and demonstrably correct response option."*
4. **Four options.**
5. **Comparative key standard.** The key is the *most likely and most reasonable* option, not the only true one. Distractors may be partly true.
6. **Passage length 500–600 words.**
7. **Skill mix 30/30/40, ±5%, at form level not set level.**
8. **Content mix 50/50 humanities/social sciences, at form level.**
9. **Discipline drawn from the published 11 + 12, with Studies of Diverse Cultures resolved to one side.**
10. **Scope tag follows evidence span**, not stem wording: local ⇒ FOC, distant ⇒ RWT.

## 10. Two official implementation affordances worth using

**Paragraph numbering.** > "Paragraph numbers may be included in questions to help you locate relevant portions of the text." This is an official, sanctioned way to reduce search load without changing the reasoning demand — a difficulty dial that is orthogonal to inference difficulty. Lane 05 treats it as one.

**In-passage support for specialised terms.** > "Explanations, illustrative examples, and definitions of significant specialized terms in these passages will help you develop the strong basic foundation needed for answering all the questions you encounter in this section." Together with *"The topics of some passages ... will be familiar; some will not"*, this establishes that **unfamiliarity is expected and is handled inside the text**. See Lane 02.

## Evidence quality for this lane

Uniformly **[OFFICIAL]** and unusually strong: the *What's on the MCAT Exam?* PDF is AAMC's own content outline and contains the complete framework prose, not a summary. Two soft spots. (1) The document I read is stamped `20-002D (10/20)`; AAMC revises this outline periodically and the live web pages may carry newer wording, which I could not read because of the accordion issue. Re-verify the six sub-skill strings against a current PDF before hard-coding them. (2) The "9 passages / 5–7 per set" figure comes from the *What's on the MCAT Exam?* chapter page rather than the content-outline PDF, which states only 53 passage-based questions; the arithmetic is consistent (9 × ~5.9 ≈ 53) but the two facts have different sources.
