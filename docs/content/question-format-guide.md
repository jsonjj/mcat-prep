# Question & content format guide (abstract, clean-room)

This guide describes **generic, independently-derived** format conventions for authoring original MCAT-style content. It contains **no** source content, page citations, source-item mappings, or source-derived distractor logic.

> Copyright guardrail: the reference PDFs in `../research/` are for abstract design analysis only. Do not copy, transcribe, paraphrase, embed, OCR, screenshot, or commit any of their questions, passages, datasets, figures, choices, keys, or explanations. Every authored item must be an original scenario with new values, wording, reasoning, distractors, key derivation, and explanation. Reordering choices or swapping nouns/numbers is **not** original authorship.

## Reference-analysis status

Automated read-only inspection of the current reference PDF found only page-level raster panels and recurring layout rhythms; its compressed streams yielded no reliable semantic text. Therefore no source stems, choices, answers, explanations, sections, or difficulty were machine-classified, and none inform authoring. Cognitive operations, four-choice rules, distractor taxonomies, timing, and calibration come from the PRD, the official AAMC content outline, established item-writing evidence, and human review — not the PDF.

## Item structural conventions (generic)

- **Format types:** `discrete_mcq`, `passage_mcq`, `graph_mcq`, `experiment_mcq`.
- **Choices:** exactly four (`A`–`D`), one defensible best answer, plausible non-misleading distractors, no grammatical or length cues to the key.
- **Stimulus:** discrete items have no stimulus; passage/graph/experiment items reference a shared `stimulus_id`. Stimuli support prose, tables, figures, and datasets rendered as **semantic text/markup**, never as rasterized text.
- **Grouping:** a passage set links several items to one stimulus; items record their order and dependency.
- **Rationales:** one full correct-solution rationale plus a rationale for every choice; each wrong choice carries a distractor-family hypothesis (an investigation prompt, not a certain diagnosis of the learner).

## Two operation vocabularies — do not mix them

The word "operation" names two different, non-interchangeable vocabularies in this repo. Both live in
`packages/contracts/src/vocab.ts`. Pick by purpose, not by whichever name you saw first.

|                    | Authoring-analysis tags                                                             | Mastery axis                                                              |
| ------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Schema             | `OperationTagSchema`                                                                | `ReasoningOperationSchema`                                                |
| Members            | 8: `K` `Q` `E` `D` `P` `A` `I` `T`                                                  | 7: `IDENTIFY` `PREDICT` `EXPLAIN` `RELATE` `QUANTIFY` `DESIGN` `EVIDENCE` |
| Purpose            | Generic blueprint coverage/analysis of what an item exercises                       | The learner-facing skill axis the BKT engine estimates `P(L)` for         |
| Where it is stored | `EvidenceRecord.operation` (optional; omitted entirely for lesson-sourced evidence) | `reasoning_operation` on an item / lesson item binding                    |
| Who may set it     | Author, during blueprint analysis                                                   | Author, deliberately and by name; never inferred                          |

Neither is derived from the other. `EvidenceRecord.operation` must stay an `OperationTag` and must
never be populated from `reasoning_operation`; equally, no `OperationTag` may be widened into a
`ReasoningOperation`. Because there is nothing correct to put there, lesson-sourced evidence leaves
`operation` **absent** rather than inventing a tag. Free-text fields such as `learner_operation`,
`semantic_structure.operation`, and the open `scope_operation_tags` list are prose or
authoring-analysis labels and are never either governed vocabulary.

`reasoning_operation` is mandatory wherever a lesson item binding declares any evidence mode other
than `INSTRUCTIONAL` (see `docs/lesson-evidence-mastery-contract.md`), because a wrong guess there
corrupts a learner-facing skill estimate. Elsewhere it is optional.

### Authoring-analysis tags (from the blueprint, not the PDF)

`K` knowledge use · `Q` quantitative · `E` experiment/evidence · `D` data/representation translation · `P` passage control · `A` CARS argument · `I` integrated coordination · `T` timed endurance.

### The seven reasoning operations (mastery axis)

`IDENTIFY` recognize/recall the concept · `PREDICT` work forward from a perturbation · `EXPLAIN` work backward to the mechanism · `RELATE` map entity ↔ role or compare cases · `QUANTIFY` select and run the right relationship · `DESIGN` judge or choose a method or study · `EVIDENCE` decide what the data licenses.

## Distractor-family vocabulary (independently defined)

`missing_knowledge`, `wrong_relationship`, `unit_or_sign`, `calculation`, `graph_or_data`, `experimental_design`, `misread_condition`, `scope_or_relevance`, `outside_knowledge`, `pacing_or_guess`, `answer_change`, `other`.

## Accessibility conventions

- Native semantic text; tables as real tables; math as MathML/accessible notation.
- Every figure has meaningful alt text and, where it carries data, a long description or data-table equivalent.
- No information conveyed by color alone; logical reading order; keyboard operable.
- Every simulation/graph item has an equivalent direct (non-graphical) route producing the same evidence.

## Authoring pipeline (clean-room)

Blueprint cell → original draft + independent solution → distractor design around plausible reasoning failures → science/units/arithmetic/wording/accessibility checks → source/rights/similarity review → independent human approval → pilot → calibrate/version/retire. AI may draft or check candidates; it can never set the key, approve, publish, or award mastery.
