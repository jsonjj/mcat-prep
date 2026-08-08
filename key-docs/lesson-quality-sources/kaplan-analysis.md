# Kaplan MCAT Lesson Book Analysis

**Status:** SOURCE ANALYSIS — DERIVED EXTERNAL OBSERVATIONS · **RIGHTS UNRESOLVED**

> **Rights status (corrected 2026-08-03, cross-document correction wave).**
>
> ```text
> rights_use_status:        PENDING
> RIGHTS_REVIEWER:          UNASSIGNED
> rights_receipt_ref:       none
> permission_basis:         none recorded
> ```
>
> The paragraph below previously read as a self-clearance: an assertion, written by the
> same process that produced the analysis, that the use is rights-safe. **An author
> cannot clear their own rights use.** Rubric §9.2 requires a `RIGHTS_REVIEWER` decision
> before external material is extracted, stored, used for calibration, or distributed,
> and no such reviewer is assigned and no receipt exists.
>
> While `rights_use_status` is `PENDING`, this file must not be used for model
> calibration, must not be stored in an evidence bundle, must not be excerpted further,
> and must not be distributed outside internal review. Its observations may inform
> discussion, but no rubric criterion may cite it as its justification without an
> explicit admission decision (rubric §9.2, §10 open decision on this file's disposition).
>
> Nothing here has been deleted or rewritten to hide the earlier claim; the original
> characterisation is preserved immediately below and is now scoped as the *author's
> description of the intended handling*, not a clearance.

**Author's description of intended handling (not a rights clearance).** This document was
written to contain only derived observations, structural analyses, and page references
based on the Kaplan MCAT Lesson Book (Third Edition, 2016), and not substantial verbatim
text, full questions, passages, figures, or tables from the original copyrighted material.
It was produced for internal rubric calibration and instructional-design comparison. Those
statements describe intent and are the starting point for a rights review; they are not
its outcome. A qualified `RIGHTS_REVIEWER` must confirm the excerpt boundaries, the
permission basis, and each intended use before any of them is exercised.

## Executive Summary

The Kaplan MCAT Lesson Book employs a flipped-classroom, inquiry-based model. Rather
than providing dense instructional text, the lessons consist of scientific vignettes
followed by scaffolded, open-ended questions that require the student to construct
models, draw graphs, or derive formulas. The burden of primary instruction is often
placed on external reading. This creates useful calibration boundaries for LQR-C02
(Instructional Adequacy) and LQR-X04 (Meaningful Interaction).

## Top 3 Insights

1. **Constructive scaffolding over passive reading:** The text frequently requires
   intermediate representations such as graphs or relationship tables rather than
   passive reading. This supports the rubric requirement that interactions expose
   cognitive work rather than act as disguised continue buttons.
2. **Assessment-heavy / instruction-light vulnerability:** The book often assumes
   material was studied elsewhere. A digital route that claims to teach a KC cannot
   merely interrogate a novice; it must supply the governing model.
3. **Structured strategy frameworks:** Complex skills such as CARS use explicit
   cognitive heuristics and passage-outline rules. Making expert strategy visible is a
   strength that digital lessons should preserve.

## Key Concerns for Digital Translation

- **Static repair:** Print cannot provide dynamic repair. A digital lesson should not
  merely reveal an answer after failure; it needs bounded support and a fresh re-entry
  check.
- **Accessibility of visual tasks:** Drawing molecules, plotting graphs, and filling
  charts require construct-equivalent alternatives for keyboard and screen-reader
  users.

## 12-Dimension Rubric Calibration Analysis

### Authored Content Gate

#### LQR-C01 — Transfer Validity

- **Page references:** pp. 16, 78, 405–420.
- **Strength:** Applies familiar scientific relationships in changed contexts.
- **Anti-pattern:** Some practice items change numbers while preserving a rote
  substitution procedure.
- **Boundary:** Valid transfer changes the situation while preserving the construct.
- **Calibration:** Keep strict enforcement that changed-task items require genuine use
  of the taught model.

#### LQR-C02 — Instructional Adequacy

- **Page references:** pp. 26, 34, 44.
- **Strength:** Guided work requires consequential learner action.
- **Anti-pattern:** Heavy reliance on externally assigned prerequisite chapters makes
  some question sequences unusable for a true novice.
- **Boundary:** Scaffolded questions cannot substitute for a reusable mental model.
- **Calibration:** The standard route must teach the governing idea and operation
  before consequential assessment, except for an explicitly low-stakes discovery
  prompt.

#### LQR-C03 — Distractor and Error-Model Quality

- **Page references:** pp. 88, 281–285, 407–409.
- **Strength:** CARS distractors often correspond to plausible tone, detail, or
  main-idea confusions.
- **Anti-pattern:** Some science distractors are arbitrary numeric variations without a
  clear error rationale.
- **Boundary:** A plausible wrong option still needs a defined first-invalid-step
  explanation.
- **Calibration:** Require an observable error or misconception rationale for each
  distractor.

#### LQR-C04 — Prompt Clarity

- **Page references:** pp. 30, 121, 289.
- **Strength:** Many prompts directly state the required learner operation.
- **Anti-pattern:** Negative phrasing can add reading-vigilance load unrelated to the
  construct.
- **Boundary:** Difficulty should come from the construct rather than syntax traps.
- **Calibration:** Negative phrasing must be unmistakable and justified.

#### LQR-C05 — Repair Quality

- **Page reference:** Static print medium.
- **Strength:** Not applicable as dynamic repair.
- **Anti-pattern:** A learner can make an intermediate graph or reasoning error without
  targeted correction.
- **Boundary:** Digital media should improve on print by diagnosing the failed function
  and rechecking it freshly.
- **Calibration:** Block repair designs that only reveal the correct answer; fresh
  re-entry remains required.

#### LQR-C06 — DOK Appropriateness and Distribution

- **Page references:** pp. 28, 36.
- **Strength:** Some sequences rise from definitions and representation construction
  toward comparison and strategic calculation.
- **Boundary:** Lower-DOK scaffolding should intentionally build toward the target
  independent performance.
- **Calibration:** Judge DOK as a purposeful progression, not an arbitrary quota.

### Rendered Experience Gate

#### LQR-X01 — Presentation-to-UI Fidelity

- **Page references:** pp. 96, 273.
- **Strength:** Strategy frameworks and visual structures are consistently presented.
- **Anti-pattern for digital translation:** Placing a full vignette, diagram, and all
  questions on one screen would create avoidable scrolling and focus problems.
- **Boundary:** Digital layout may chunk print content while preserving instructional
  meaning.
- **Calibration:** Require semantic fidelity rather than literal page replication.

#### LQR-X02 — Cognitive Focus, Pacing, and Visual Clarity

- **Page references:** pp. 18, 102.
- **Strength:** Whitespace leaves room for learner work; tips are separated from the
  main flow.
- **Anti-pattern:** Long passages can become dense walls of text.
- **Boundary:** Authentic MCAT reading load is legitimate, while competing chrome is
  extraneous.
- **Calibration:** Preserve one primary cognitive job and action per screen.

#### LQR-X03 — Feedback and Scaffolding Quality

- **Page references:** pp. 85, 275.
- **Strength:** Complex tasks are decomposed into explicit strategy questions.
- **Anti-pattern:** Practice feedback often requires consulting a separate answer key.
- **Boundary:** Brief feedback may be acceptable for low-stakes discovery, not
  consequential assessment.
- **Calibration:** Feedback should reinforce governing reasoning rather than display
  only correct/incorrect.

#### LQR-X04 — Meaningful Interaction and Representation

- **Page references:** pp. 34, 46.
- **Strength:** Drawing, mapping, and writing expose intermediate reasoning.
- **Anti-pattern:** Passive passage reading lacks an inspectable learner action.
- **Boundary:** Interaction is valuable only when it changes diagnosis, feedback, or
  visibility of an important relationship.
- **Calibration:** Do not impose an interaction quota, but reject interactions that add
  no cognitive work.

#### LQR-X05 — Accessibility and Construct Equivalence

- **Page references:** pp. 22, 414.
- **Strength:** Printed visual relationships are generally high contrast.
- **Anti-pattern:** Highly spatial drawing and circuit tasks can become inaccessible
  when moved directly to a digital interface.
- **Boundary:** An accessible alternative must test the same operation without
  supplying a derived relationship.
- **Calibration:** Require construct-equivalent alternatives rather than generic alt
  text.

#### LQR-X06 — Responsive Behavior, Recovery, and Branch Completion

- **Page reference:** Static print medium; direct comparison not applicable.
- **Boundary:** Long digital reasoning sequences need safe pause and exact resume even
  though print does not.
- **Calibration:** Pause, refresh, and reconnect should restore the authoritative
  checkpoint without losing intermediate responses.
