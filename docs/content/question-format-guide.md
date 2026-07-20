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

## Cognitive operation tags (from the blueprint, not the PDF)

`K` knowledge use · `Q` quantitative · `E` experiment/evidence · `D` data/representation translation · `P` passage control · `A` CARS argument · `I` integrated coordination · `T` timed endurance.

## Distractor-family vocabulary (independently defined)

`missing_knowledge`, `wrong_relationship`, `unit_or_sign`, `calculation`, `graph_or_data`, `experimental_design`, `misread_condition`, `scope_or_relevance`, `outside_knowledge`, `pacing_or_guess`, `answer_change`, `other`.

## Accessibility conventions

- Native semantic text; tables as real tables; math as MathML/accessible notation.
- Every figure has meaningful alt text and, where it carries data, a long description or data-table equivalent.
- No information conveyed by color alone; logical reading order; keyboard operable.
- Every simulation/graph item has an equivalent direct (non-graphical) route producing the same evidence.

## Authoring pipeline (clean-room)

Blueprint cell → original draft + independent solution → distractor design around plausible reasoning failures → science/units/arithmetic/wording/accessibility checks → source/rights/similarity review → independent human approval → pilot → calibrate/version/retire. AI may draft or check candidates; it can never set the key, approve, publish, or award mastery.
