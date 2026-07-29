# Lane 05 — Difficulty drivers in reading-comprehension items

## 1. The literature disagrees, and the disagreement is the finding

Three serious research programmes, three different answers to "does difficulty live in the passage or the question?"

| Study | Verdict | Variance explained |
| --- | --- | --- |
| **Freedle & Kostin** (ETS, 1991–1993) | **Text dominates** | SAT main idea **46–59%**; GRE **20–52%** by item type; TOEFL **33%** |
| **Gorin & Embretson** (2006) | **Decision process dominates; text representation contributes nothing** | *"significant amount"*, split not reported in accessible text |
| **Ozuru, Rowe, O'Reilly & McNamara** (2008) | **Passage dominates at grades 7–9; neither dominates at grades 10–12** | passage-level: **~15%** (7–9), **~10%** (10–12) |

Verbatim, so the conflict is unmistakable.

Freedle & Kostin **[PEER]**, https://doi.org/10.1002/j.2333-8504.1993.tb01524.x — *"Freedle and Kostin were able to conclude that evidence exists favoring construct validity of multiple-choice reading comprehension items. They concluded this because the difficulty of such multiple-choice reading items is **more closely associated with text as opposed to item variables.**"*

Gorin & Embretson **[PEER]**, https://doi.org/10.1177/0146621606288554 — *"Text comprehension and decision processes accounted for a significant amount of the variance in item difficulties. **The decision model variables contributed significantly to variance in item difficulties, whereas the text representation variables did not.**"*

Ozuru et al. **[PEER]**, https://doi.org/10.3758/brm.40.4.1001 — grades 7–9: *"the difficulty level of the items... is determined primarily by passage features, as opposed to features of individual questions."* Grades 10–12: *"**There were no significant main effects of the passage features. In addition, there were no significant main effects of the individual items.** Only the abstractness of the question showed small interactive effects."*

### Reconciliation

**[INFERENCE], and I hold it loosely.** Three partial reconciliations, in descending confidence.

**(a) They measured different things.** Freedle & Kostin's "text variables" include rhetorical organisation, referential density, negation, and **main-idea location** — several of which are really *text–item overlap* variables, not pure text properties. Their TOEFL abstract concedes this: the eight predictors reflected *"text and text/item overlap variables."* Gorin & Embretson's "text representation" is narrower — propositional and lexical properties of the passage alone. **So Freedle & Kostin's "text wins" and Gorin & Embretson's "text loses" are not contradictory if the winning variables are relational rather than textual.** This is the most likely resolution and it has a clean design implication: **the productive levers are relational — how the item relates to the text — not textual.**

**(b) Ability level moderates it.** Ozuru et al.'s grade-band contrast suggests text features stop predicting as readers get more capable. If so, CARS's population (pre-medical seniors) sits firmly in the regime where text features do not predict. But a **null result is weak evidence** for "difficulty moved elsewhere" — it is equally consistent with "the three Coh-Metrix indices we chose were inadequate at this band." Flagged in 00-README gap 6.

**(c) Ceiling on text variance regardless.** Even where passage features *do* predict, Ozuru et al. put the share at **10–15%**. Freedle & Kostin's higher figures come from models mixing text with text–item overlap. **Nobody has shown that pure passage properties explain more than ~15% of reading item difficulty.**

**Practical conclusion, and it is the main takeaway of this lane: prose-complexity tuning is the weakest difficulty lever available to you.** It caps out around 10–15% of variance, may not work at all for this population, and one of its main sub-levers (vocabulary rarity) is construct-irrelevant. Spend the effort on the option set.

## 2. Embretson & Wetzel's decision-process variables

**[PEER]** 75 ASVAB/CAT paragraph-comprehension items, LLTM calibration. Full detail in Lane 04 §4; repeated here as difficulty features.

| Feature | Operationalisation | Direction |
| --- | --- | --- |
| **Text mapping** | proportion of text over which the relevant propositions are located | harder when spread; hardest when the option concerns the **gist** |
| **Falsification** | 1 − P(guess key correctly among non-falsified set) | harder when fewer options are falsifiable |
| **Confirmation** | dichotomous: does the text confirm the key? | — |
| **Encoding conversion** | dichotomous: must option wording be converted to text wording? | harder when conversion needed |
| **Propositional comparisons** | ln(number of comparisons to falsify or confirm) | harder with more |

Their conclusion: *"successful prediction of item difficulty is obtained from models with wide representation of both text and decision processing. This suggests that **items can be screened for processing difficulty prior to being administered to examinees.**"* That is the goal for a generator, stated in 1987.

Notable caveats. Their best model needed **six text-representation and seven decision-process variables** — this is not a parsimonious predictor. Rater reliability was high for propositional variables but poor for **encoding conversion** (one rater applied a much stricter criterion, so only one rater's data was usable) and for the Anderson question-level scheme (levels were not mutually exclusive; they had to split it into two variables). **Two of the most interesting variables were the hardest to code reliably.** If humans could not code encoding conversion consistently, expect a model to be inconsistent too — measure agreement before trusting it.

## 3. Main-idea location — the best-evidenced single lever

**[PEER]** Freedle & Kostin, GRE report https://doi.org/10.1002/j.2333-8504.1991.tb01426.x

The mechanism is a documented reader expectation. Kieras (1985) found readers perceive main-idea information as located early, with mid-paragraph information *least* often perceived as the main idea. Hare, Rabinowitz & Schieble (1989) varied a known main-idea sentence across opening / medial / final positions and found *"Correct identifications were greatest for initial occurrence of main idea sentences."*

Freedle & Kostin's prediction and finding, verbatim:

> "if students tend to perceive early text information, especially information in the opening sentences of the first paragraph, as main idea information, then when certain passages actually confirm this search strategy, such items should be easier than those that disconfirm it (where disconfirming main idea information would be information that occurs in the middle of a multiparagraph text)."

Both `main idea middle text` (v65) and `all early main idea locations` (v69) replicated as significant across the SAT and GRE main-idea samples. They also generalised it to explicit-statement items: relevant information early ⇒ easier; mid-passage ⇒ harder, *"because examinees may start their search for explicit information at the beginning."*

**This is the cheapest and best-evidenced difficulty dial in the review.** It is a single passage-structure parameter, replicated across two testing programmes, grounded in two independent cognitive studies, and free to implement.

```
THESIS_POSITION
  opening_sentences   → easiest for A1
  first_paragraph     → easy
  mid_passage         → hardest
  closing             → intermediate
  distributed         → forces RWT.1; hardest for A1
```

**[INFERENCE]** Note the interaction with skill tagging: an early explicit thesis makes A1 both *easier* and *more likely FOC*; a distributed thesis makes it *harder* and *necessarily RWT*. So this dial moves difficulty and skill category together, which means you cannot use it freely to balance difficulty within a fixed blueprint. Worth modelling explicitly rather than discovering later.

## 4. Other replicated text variables

**[PEER]** From Freedle & Kostin. Their SAT main-idea analysis found 22 significant variables; **10 replicated** in the total GRE main-idea sample:

> "v29, v36, v41, v53, v55, v57, v59, v60, v65, v69 (argument, coherence, longest paragraph words, frequency of text clefts, text questions, reference across text clauses, reference sums, text negatives, main idea middle text, all early main idea locations)"

Grouped, with mechanism:

| Variable group | Effect | Mechanism / source |
| --- | --- | --- |
| **Rhetorical organisation** — argument structure; compare-adversative | affects difficulty; `compare-alternative` made explicit-statement items **easier** | Grimes (1975), Meyer (1975) top-level rhetorical structures |
| **Coherence** | replicated for main idea | — |
| **Longest paragraph length** | longer ⇒ harder (significant at p<.01 for passages >400 words) | Hites (1950) |
| **Syntactic frontings / clefts** | more ⇒ harder | Freedle, Fine & Fellbaum (1981); frontings guide semantic-relation interpretation across clauses |
| **Referential density** — reference across clauses, reference sums | more referentials ⇒ **harder** for main idea; referentials *within the item* make explicit-statement items harder | Clark & Haviland (1977); Abrahamsen & Shelton (1989) showed replacing referential expressions with full noun phrases *improved* comprehension |
| **Text negations** | more ⇒ **harder** for main idea | Carpenter & Just (1975): negation increases comprehension decision time |
| **Sentence length** | longer ⇒ harder (1-tailed) | Klare (1974, 1975) |
| **Number of paragraphs** | **no significant effect** on any of the three item types | — |

Two useful negatives. **Paragraph count does not matter** — do not tune it. And the **negation-in-item** result went the *wrong* way: for inference items, negations in the stem and in the correct option correlated with items being *easier*, which they speculated reflects *"a matching operation across the item's stem and its correct option."* That is a cluing mechanism, not a difficulty mechanism — a stem negation matching a key negation gives the reader a surface match. Worth a lint check.

**Referential density deserves emphasis** because it is the cleanest construct-relevant lever besides thesis location. Replacing full noun phrases with pronouns and other referring expressions increases difficulty by requiring the reader to maintain and resolve referents — genuine comprehension work, not vocabulary or speed. It also connects to the reverse-cohesion argument in Lane 02 §5: reducing explicit referential marking is exactly the kind of cohesion reduction that high-knowledge readers compensate for by inferring.

## 5. Word frequency

**[PEER]** The passage variable with the most consistent effect across studies.

Ozuru et al. used **log average minimum-frequency content word per sentence** — the rarest content word in each sentence, averaged — found a significant main effect at grades 7–9, and confirmed it with a median split: items on high-frequency-word passages M = **.70** vs low-frequency M = **.64**, *F*(1,94) = 4.01, *p* < .05. Their conclusion: *"the HLM and ANOVA converge to support the conclusion that word frequency in the passage has a strong effect on item difficulty."*

Note the *minimum*-per-sentence operationalisation: **worst case, not average.** One rare word degrades a sentence. Lint accordingly (Lane 02 §6).

**But treat this as a warning, not a lever.** Vocabulary rarity is the most construct-irrelevant way to make a reading item harder — it shifts the item toward measuring vocabulary breadth. Ozuru et al. list *"passages composed of extremely long sentences with low-frequency words"* alongside falsifiable-distractor stuffing as *"the test makers' strategy to increase the range of test discrimination,"* i.e. as an artefact rather than a virtue. And AAMC's *"sophisticated vocabulary"* [OFFICIAL] is bounded by the self-containment rule requiring specialised terms to be defined in-text.

**[INFERENCE] Use frequency as a floor to enforce, not a dial to turn.** Set a minimum-frequency threshold, flag violations, and check whether each violation is general-academic (acceptable) or domain-specialised-and-undefined (a self-containment breach).

## 6. Inference distance — a codeable four-level scale

**[PEER]** Ozuru et al.'s `passage/question relations` coding, grounded in Kintsch's Construction–Integration model. Verbatim:

> "the answer to the question was explicitly stated within a single sentence in almost verbatim fashion, so that minimal text processing was required. The second level involved **restructuring/rewording within a sentence**... the information required to answer this question was within a single sentence. The third level comprised **integration or bridging questions**. Answering this type of question required some degree of integration of information located across multiple sentences from the source passage. Finally, the fourth level was **knowledge-based inference questions**. In this type of question, the information required to answer a question was not explicitly stated in the source passage. The test takers had to make inferences about the situation described in the passage on the basis of their prior knowledge."

```
INFERENCE_DISTANCE
  1  verbatim within one sentence
  2  reworded / restructured within one sentence
  3  bridging across multiple sentences
  4  knowledge-based — requires prior knowledge     ← OUT OF CONSTRUCT for CARS
```

**Level 4 is prohibited by [OFFICIAL] rule.** *"Everything you need to know... is in the passages and the questions themselves"* and *"If you happen to know some obscure fact... ignore it."* So CARS operates on a **three-level** scale, and this is a real constraint rather than a formality: it removes the top of the standard inference-distance ladder. Whatever difficulty CARS achieves beyond level 3 must come from somewhere else — which is precisely the option set, per §1's reconciliation (a). The [OFFICIAL] prohibition and the empirical finding point the same direction.

Note the mapping to Lane 01's retrieval-scope rule: **levels 1–2 are FOC; level 3 is RWT.** `INFERENCE_DISTANCE` and `sub_skill` are two views of one underlying variable. Do not model them as independent.

Ozuru et al. found `passage/question relation` made a **marginal** contribution at grades 7–9, consistent with Embretson & Wetzel's encoding-conversion effect, and **none** at 10–12.

## 7. Abstractness

**[PEER]** Mosenthal's (1996) five-level scheme, enumerated in Lane 02 §7. In Ozuru et al. this was the **only** item feature with any systematic effect at grades 10–12, and only through interactions with propositional density, sentence length, and word frequency. It also had the **smallest random fluctuation across passages** of any variable — meaning its effect is the most stable, even though small.

**[INFERENCE]** For a CARS-like population, abstractness is therefore the most promising *item-level* difficulty variable in the published literature: it is the one thing that survived at the higher band and it is the most passage-independent. It is also directly aligned with the construct — CARS lives at Mosenthal levels 3–5 (purpose, cause/reason, theme/equivalence). Prefer raising abstractness over raising prose complexity.

## 8. One counter-intuitive result to be careful with

Ozuru et al. found **higher propositional density made items *easier*** at grades 7–9, which contradicts the theory. They explained it away via intercorrelations: *"the number of propositions in the passage is negatively correlated with the number of words per sentence and is positively correlated with reading ease. These correlations indicate that passages with more propositions contain shorter sentences and are easier to read."*

**This is a confounding warning that generalises.** Text-complexity indices are heavily intercorrelated, sometimes with counter-theoretical signs in a given corpus. **Do not build a difficulty model on single Coh-Metrix indices without checking the correlation structure of your own corpus.** A coefficient's sign in someone else's corpus may not survive in yours.

## 9. Ranked levers

**[INFERENCE]**, ranked by evidence strength × construct relevance × implementability.

| Rank | Lever | Evidence | Construct-relevant? | Notes |
| --- | --- | --- | --- | --- |
| 1 | **Thesis position** (early ⇄ mid ⇄ distributed) | **Strong** — replicated SAT+GRE, two cognitive studies | Yes | Free. But moves skill tag too (§3) |
| 2 | **Falsification difficulty** — count of non-falsified options | Moderate (2 studies) | Yes, if falsification requires reading | Computable formula. See Lane 04 §5 caveat |
| 3 | **Distractor–key proximity on the ranking dimension** | Weak-direct, strong-by-consensus (G29) | Yes | Continuous dial for A10.d |
| 4 | **Inference distance 1→2→3** | Moderate, marginal effects | Yes | Capped at 3 by [OFFICIAL] rule |
| 5 | **Text mapping span** — how much text the key's evidence covers | Moderate | Yes | Also = `evidence_span`, already recorded |
| 6 | **Question abstractness** (Mosenthal 3→5) | Weak but the only survivor at high band | Yes | Most stable across passages |
| 7 | **Referential density** | Moderate, replicated | Yes | Reduces cohesion; see Lane 02 §5 |
| 8 | **Text negations** | Moderate | Partly | Watch the stem/key negation-matching cue |
| 9 | **Syntactic frontings / clefts** | Moderate, replicated | Partly | Also serves *"intricate writing styles"* [OFFICIAL] |
| 10 | **Longest paragraph length** | Moderate | Marginal | Trivial to control |
| 11 | **Sentence length** | Weak (1-tailed) | No — speed | Avoid as a lever |
| 12 | **Word rarity** | Strong effect, wrong kind | **No** | Enforce as a floor, not a dial (§5) |
| — | **Paragraph count** | Null | — | Do not tune |
| — | **Readability score** | Invalid instrument (Lane 02 §5) | — | Never a target |

**Also available: paragraph-number hints.** [OFFICIAL] *"Paragraph numbers may be included in questions to help you locate relevant portions of the text."* This reduces **search** load without reducing **reasoning** load — a rare orthogonal dial. Withholding them raises difficulty in a way that is arguably construct-irrelevant (search ≠ comprehension), so **[INFERENCE]** prefer including them for high-inference items and withholding for low-inference items, which keeps total difficulty flatter while concentrating variance in reasoning.

## 10. Difficulty feature vector

Recordable at authoring time; feeds any later calibration model. Cross-references the calibration work in `docs/research/calibration/`, where the relevant finding is that **cold-start difficulty prediction from item text is very weak** — best published result on USMLE-style MCQs ≈ 18% of variance. Nothing here changes that; these features are a better-than-nothing prior and a lever inventory, not a calibration substitute.

```
# passage-level
thesis_position          enum   opening|first_para|mid|closing|distributed
longest_paragraph_words  int
mean_sentence_length     float
min_content_word_freq    float  # min per sentence, averaged
referential_density      float  # referring expressions / clause
text_negation_count       int
fronting_count            int
propositional_density     float
rhetorical_organisation   enum   # cause_effect|chronological|point_counterpoint|...
discipline                enum
content_side              enum   humanities|social_sciences

# item-level
sub_skill                enum   FOC.1|FOC.2|RWT.1|RWT.2|RBT.1|RBT.2{a,b,c,d}
archetype                enum   A1..A10
inference_distance       int    1|2|3
abstractness             int    1..5   # Mosenthal
evidence_span_proportion float  # text mapping
paragraph_hint_given     bool
stem_is_negated          bool
stem_word_count          int

# option-set-level
n_options                        int   # 4, fixed
n_falsifiable                    int
falsification_difficulty         float # 1 - 1/(4 - n_falsifiable)
n_mute                           int
option_families                  list  # D1..D11
ranking_dimension                str
key_position                     int
mean_option_words                float
max_option_word_delta            int
key_lexical_overlap_with_passage float
key_lexical_overlap_with_distractors float  # convergence-cluing check
```

## Evidence quality for this lane

**Strong:** §3 (thesis location) is the one result here I would build on without hesitation — replicated across two testing programmes and independently grounded in two cognitive studies. §4's replicated-variable list is from a large, careful ETS programme (110 passages / 244 GRE items; 285 SAT items).

**Moderate:** §5 (word frequency) replicates in direction across studies but the effect-size evidence is one median-split ANOVA on grades 7–9. §6's inference-distance scale is a well-motivated coding scheme whose empirical effect was **marginal in the one study that used it on standardized items, and null at the band closest to CARS.**

**Weak, and it is the lane's central weakness:** §1's reconciliation is mine. The three programmes genuinely disagree and I have proposed three explanations without being able to test any. Reconciliation (a) — that Freedle & Kostin's winning variables are relational rather than textual — is the one I would defend, because it is supported by their own TOEFL abstract describing the predictors as *"text and text/item overlap variables."* Reconciliation (b), the ability-moderation story, rests on **a single null result at one grade band** and I would not build difficulty control on it.

**Two honest problems with the whole literature as applied here.** First, **population mismatch**: Freedle & Kostin used SAT/GRE/TOEFL (closest), Embretson & Wetzel used ASVAB military applicants, Ozuru et al. used school-age readers. **None studied a graduate-professional admissions verbal-reasoning test.** Second, **§8's confounding warning applies to everything above**: these indices are heavily intercorrelated and at least one produced a counter-theoretical sign in a real corpus. Every coefficient here should be treated as a hypothesis about your corpus, not a parameter for it.
