# Lesson Quality Evidence Protocol

**Status:** DOCUMENTATION ONLY — NO EVIDENCE HARNESS, CAPTURE TOOL, OR STORAGE SERVICE EXISTS
**Protocol version:** `0.2`
**Date:** 2026-08-03 · **Supersedes:** `0.1` (cross-document correction wave)
**Rubric authority:** [`lesson-quality-rubric.md`](./lesson-quality-rubric.md), version `0.9.1`, §7 "Evidence minimums and reviewer roles"
**Scope note:** this file receives the implementation blueprint the rubric deliberately excludes (rubric §10, open decision 7)

## 1. Status and boundary

This document states what an evidence bundle must contain to support a rubric
`evaluation_verdict`. **No evaluator service, capture harness, browser-automation
runner, storage layout implementation, CI integration, or receipt-collection tool is
implemented by this file.** It is read by a human or an agent preparing or reviewing
evidence by hand, and by the
[`lesson-quality-author-protocol.md`](./lesson-quality-author-protocol.md) and
[`lesson-quality-judge-protocol.md`](./lesson-quality-judge-protocol.md), which cite it
instead of restating evidence detail.

This protocol does not decide a lesson's quality. It only decides whether a cited
artifact counts as evidence. The rubric's result algorithm (rubric §2.2), dimension
cards (rubric §6), and reviewer role matrix (rubric §7.4) remain authoritative for
what a piece of evidence must demonstrate.

Storage paths, manifest schema versioning, browser-profile identifiers, and receipt
wire formats named below are the current documented shape, not a claim that a system
reads or writes them today.

## 2. Evidence identity and manifest fields

Every evidence item is bound to one exact lesson revision and one exact application
build (rubric §3.1, §7.1). An evidence-bundle manifest record carries:

```text
evidence_ref
content_sha256                 (of the artifact bytes this record names)
lesson_id
lesson_revision_id
lesson_script_content_sha256
dependent_artifact_hashes:
  kc_coverage_matrix_sha256
  lesson_presentation_plan_sha256
  lesson_quality_report_sha256
  artifact_manifest_sha256      (L2/L3 envelope only)
app_git_commit
build_id
route: STANDARD | CONCISE | MISCONCEPTION | PREREQUISITE_SUPPORT
runtime_kind: vector | normalized
build_environment: PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD | PROTOTYPE
capture_environment:
  browser_profile_id
  os_and_browser_version
  viewport_or_zoom_condition
  assistive_technology            (full name and version, or null when none was used)
  reduced_motion: true | false
  network_condition
rubric_version
rubric_sha256
captured_at
what_the_evidence_demonstrates
branch_id                        (the consequential branch this item covers, §4)
```

Evidence is addressed by `content_sha256`. A listed item that is missing or
hash-mismatched blocks evaluation of everything that cites it; an unlisted artifact is
not evidence regardless of where it sits on disk. A path with no bytes, a narrative
assurance, a screenshot from another revision, and model recall are all non-evidence
(rubric §7.1).

`runtime_kind` and `build_environment` must match the immutable evaluation identity
byte for byte. A null `app_git_commit` or `build_id` creates
`APPLICATION_IDENTITY_NULL`, voids the route evaluation, and forces all twelve
dimensions `BLOCKED`; no receipt can repair an unidentified build.

## 3. Source, hash, and citation rules

1. Cite exact artifact bytes by `content_sha256`, never by filename, slug, or title
   alone. Two retired preview lessons reused production lesson IDs with different
   content; a citation without a hash cannot distinguish them.
2. A rendered-evidence citation additionally carries the application commit and build
   identifier. Source-only citations (lesson-script excerpts, protected-items excerpts)
   carry only the content hash; they are not substitutes for rendered evidence.
3. Every dependent-artifact hash in a manifest record must chain to the same lesson
   revision as R5 requires structurally — a manifest that mixes hashes from two
   revisions is `BLOCKED`, not a partial pass.
4. External source citations follow rubric §9.2: record the copyright holder,
   provenance, permission basis and receipt, per-use permission status, excerpt
   boundaries, and a `RIGHTS_REVIEWER` decision before extraction, storage, calibration
   use, or distribution. `PENDING` or `RESTRICTED` keeps the material out of any stored
   evidence bundle.
5. A citation that cannot be dereferenced to real bytes at the claimed hash is treated
   as missing evidence, not as an inspectable source.
6. Protected answers, scoring rules, private rationales, credentials, and learner data
   must never enter a raw learner-evidence artifact (§8 states the full protected-
   content boundary).

## 4. Consequential branch coverage matrix

"Every consequential branch" means every distinct transition and outcome the lesson
can produce, not every cross-product of viewport, theme, KC, and response (rubric
§7.2). The matrix below is the evidence bundle's completeness checklist; an unchecked
applicable row is a gap, not a rounding error.

| Branch category                                 | Minimum instances required                 |
| ----------------------------------------------- | ------------------------------------------ |
| New start and resume                            | once per applicable route                  |
| Correct response                                | once per required KC and response encoding |
| Incorrect near-use response                     | once per required KC                       |
| Incorrect changed-task response                 | once per required KC                       |
| Omission or skip                                | once per applicable exit                   |
| Support or help request                         | once per authored support level            |
| Reveal (where supported)                        | once                                       |
| Targeted repair                                 | once per authored repair function          |
| Exact fresh re-entry after each failed function | once per repair function                   |
| Repeated repair failure                         | planner handoff or honest block, once      |
| Invalid or unavailable item behavior            | once                                       |
| Pause and resume before commitment              | once                                       |
| Pause and resume after commitment               | once                                       |
| Refresh and reconnect                           | once                                       |
| Uncertain save or command failure               | once                                       |
| Revision mismatch or unavailable lesson         | once                                       |
| KC transition                                   | once per KC boundary                       |
| Lesson completion                               | once per applicable route                  |
| Every response encoding the lesson uses         | once each                                  |

The matrix must also exercise each required KC, each exit function, each repair and
re-entry implementation, and each unique representation or control type. A branch with
no applicable instance in this lesson is not evidence-required; record it as
`NOT_APPLICABLE` with the reason, not as a silent omission.

## 5. Rendered-evidence minimums

Automated capture must cover every consequential branch in at least one profile, and
every primary screen and consequential repair branch at all of:

```text
desktop viewport
375 px viewport
320 px viewport
200% browser zoom
reduced-motion enabled
keyboard-only interaction (no pointer)
```

At each required condition, record as applicable:

```text
DOM and accessibility-tree state
primary heading and action counts
programmatic heading level sequence and landmark structure
reading and focus order compared against visual order
focus order and post-action focus destinations
keyboard completion trace
form and status semantics (name, role, value)
programmatic label, instruction, and error-message association per field
automated accessibility findings
non_text_content_checks[]
contrast_measurements[]
accessible_math_transcript[]
non-colour indicator for every meaning currently carried by colour
text_spacing_captures[]
page-level and contained-overflow measurements
target-size and spacing measurements
pointer gesture inventory and single-pointer alternative per gesture
dragging_alternative_captures[]
moving_content_control_captures[]
error_suggestion_captures[]
console errors
failed network requests
route and checkpoint transitions
persisted revision and run identity
expected versus actual runtime_terminal_disposition
```

Console and failed-request logs are captured for the full session, not sampled after
the fact; a session with no log capture is `BLOCKED` for any dimension whose finding
depends on runtime error absence (rubric LQR-X06).

### 5.1 Contrast measurements

Rubric `LQR-X05` blocks on contrast failures, and a screenshot cannot establish a
contrast ratio: a reviewer eyeballing a capture is guessing, and an automated scan that
reports "no violations" may simply have failed to resolve the computed colours behind a
gradient, an image, or a semi-transparent overlay. Record a measurement, not an
impression:

```text
contrast_measurements[]:
  element_ref                  (selector or accessibility-tree path)
  element_kind: BODY_TEXT | LARGE_TEXT | UI_COMPONENT_BOUNDARY | GRAPHICAL_OBJECT | FOCUS_INDICATOR
  foreground_color
  background_color             (the computed effective backdrop, not the declared value)
  measured_ratio
  required_ratio               (4.5:1 body text, 3:1 large text and non-text)
  measurement_method: COMPUTED | SAMPLED_PIXEL
  state: DEFAULT | HOVER | FOCUS | ACTIVE | DISABLED | ERROR | SELECTED
  viewport_or_zoom_condition
  passes: true | false
```

Cover, at minimum: body text, large text, every interactive control boundary, the focus
indicator in its focused state, error and status text, and any graphical object that
carries meaning. Measure each interactive element in every state whose colour differs —
a control that passes at rest and fails on hover fails. Where the backdrop is an image
or gradient, sample the worst-case region and say so via `measurement_method`.

Absent contrast measurements, `LQR-X05` is `BLOCKED` for contrast, not passed by the
absence of a reported violation.

### 5.2 Accessible math evidence

MCAT lessons carry equations, units, ratios, and chemical notation, and this is the
most likely place for a screen-reader learner to receive a different construct than a
sighted learner. An image of an equation with alt text reading "equation" is not
accessible math; neither is an unlabelled MathML block that a screen reader reads as an
undifferentiated character run.

```text
accessible_math_transcript[]:
  expression_ref
  visual_form                   (as rendered to a sighted learner)
  markup_kind: MATHML | LATEX_WITH_TEXT_ALTERNATIVE | IMAGE_WITH_ALT | PLAIN_TEXT | UNKNOWN
  programmatic_text             (exactly what is exposed to the accessibility tree)
  spoken_rendering              (verbatim, as heard, with the screen reader and version named)
  navigable_by_subexpression: true | false | NOT_APPLICABLE
  units_and_symbols_spoken_correctly: true | false
  construct_equivalence_finding
```

`spoken_rendering` is transcribed from a real screen reader in a real browser, not
predicted from the markup. An expression whose spoken rendering is ambiguous between
two different mathematical statements — where superscript, grouping, or fraction
boundaries are lost — is a construct-equivalence failure under `LQR-X05`, not a
cosmetic one, because the learner is being asked a different question than the sighted
learner sees.

### 5.3 Which capture supports which WCAG criterion

Rubric `LQR-X05` names the blocking WCAG 2.2 AA criteria. This table maps each to the
capture that can actually establish it, so a bundle can be checked for completeness
against the rubric rather than against a reviewer's memory.

| WCAG 2.2 AA criterion               | Established by                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.1 Non-text Content              | `non_text_content_checks[]`: element reference, accessible alternative, decorative/informative classification, automated missing/empty-alt result, human classification check, and evidence refs. Primary owner `LQR-X05`.                                                                        |
| 1.3.1 Info and Relationships        | accessibility-tree state; programmatic label/instruction/error association                                                                                                                                                                                                                        |
| 1.3.2 Meaningful Sequence           | programmatic reading order compared against visual order                                                                                                                                                                                                                                          |
| 1.3.3 Sensory Characteristics       | instruction text reviewed for shape/size/position/sound-only references                                                                                                                                                                                                                           |
| 1.4.1 Use of Color                  | non-colour indicator recorded for every meaning colour carries                                                                                                                                                                                                                                    |
| 1.4.3 Contrast (Minimum)            | `contrast_measurements[]` (§5.1)                                                                                                                                                                                                                                                                  |
| 1.4.4 Resize Text                   | 200% zoom capture with no loss of content or function                                                                                                                                                                                                                                             |
| 1.4.10 Reflow                       | 320 px viewport capture; contained-overflow measurements                                                                                                                                                                                                                                          |
| 1.4.11 Non-text Contrast            | `contrast_measurements[]` for control boundaries and focus indicator                                                                                                                                                                                                                              |
| 1.4.12 Text Spacing                 | `text_spacing_captures[]`: viewport, WCAG spacing override values, before/after capture refs, overflow/overlap result, and evidence refs. A spacing-induced clipping root cause is primary under `LQR-X06`; X05 records only a `NON_COUNTING_CROSS_REFERENCE`.                                    |
| 2.1.1 / 2.1.2 Keyboard, No Trap     | keyboard completion trace across every consequential branch                                                                                                                                                                                                                                       |
| 2.2.2 Pause, Stop, Hide             | `moving_content_control_captures[]`: moving/auto-updating region ref, pause/stop/hide control ref, keyboard trace, paused-state capture, timing, and evidence refs. An inoperable pause or non-terminating state is primary under `LQR-X06`; X05 records only a `NON_COUNTING_CROSS_REFERENCE`.   |
| 2.4.3 Focus Order                   | focus order and post-action focus destinations                                                                                                                                                                                                                                                    |
| 2.4.7 Focus Visible                 | focus-state capture plus focus-indicator contrast                                                                                                                                                                                                                                                 |
| 2.4.11 Focus Not Obscured (Minimum) | focus-state capture at each viewport with sticky/overlay elements present                                                                                                                                                                                                                         |
| 2.5.1 Pointer Gestures              | pointer gesture inventory with a single-pointer alternative per gesture                                                                                                                                                                                                                           |
| 2.5.7 Dragging Movements            | `dragging_alternative_captures[]`: drag interaction ref, non-dragging single-pointer alternative, keyboard equivalent, completion traces, and evidence refs. The interaction root cause is primary under `LQR-X04`; X05 records only a `NON_COUNTING_CROSS_REFERENCE`.                            |
| 2.5.8 Target Size (Minimum)         | target-size and spacing measurements                                                                                                                                                                                                                                                              |
| 3.3.1 Error Identification          | error-state capture with programmatic error text                                                                                                                                                                                                                                                  |
| 3.3.2 Labels or Instructions        | programmatic label and instruction association per field                                                                                                                                                                                                                                          |
| 3.3.3 Error Suggestion              | `error_suggestion_captures[]`: field/error ref, exact programmatic correction suggestion, association method, error-state capture, announcement trace, and evidence refs. A missing corrective-feedback root cause is primary under `LQR-X03`; X05 records only a `NON_COUNTING_CROSS_REFERENCE`. |
| 4.1.2 Name, Role, Value             | form and status semantics per control                                                                                                                                                                                                                                                             |
| 4.1.3 Status Messages               | status-region announcement trace                                                                                                                                                                                                                                                                  |

Two of these cannot be closed by automation at all. `1.3.3` requires a human to read
the instructions and notice that "click the green button on the right" is the only
cue given. `2.5.1` requires a human to try the alternative. Both belong in the §6
receipt, not in an automated findings list.

The ownership notes above apply rubric §2.3 and §5: one root cause has one `PRIMARY`
owner. A WCAG row does not authorize a second X05 blocking finding when another
dimension owns the same deciding fact.

## 6. Judge-visible evidence receipt shapes

Every evidence receipt binds both runtime implementation and deployment identity:
`runtime_kind` is exactly `vector | normalized`, while `build_environment` is exactly
`PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD | PROTOTYPE`. They are never aliases.
Every `evidence_refs[]` below is nonempty and resolves in the exact evidence manifest.

Automation cannot establish that a real browser and screen reader communicate the
lesson coherently (rubric §7.3). A human reviewer — never the primary author — records
one independent, revision-bound receipt per exact route/runtime/build combination:

```text
safari_voiceover_receipt:
  reviewer_identity
  reviewer_role: ACCESSIBILITY_REVIEWER
  reviewer_is_primary_author: false
  lesson_id
  lesson_revision_id
  lesson_script_content_sha256
  app_git_commit
  build_id
  route: STANDARD | CONCISE | MISCONCEPTION | PREREQUISITE_SUPPORT
  runtime_kind: vector | normalized
  build_environment: PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD | PROTOTYPE
  evidence_manifest_sha256
  evidence_refs[]
  os_and_safari_and_voiceover_versions
  control_or_representation_types_covered[]   (every unique type on this route)
  spoken_reading_order_notes
  control_names_reported
  focus_and_announcement_behavior_notes
  sensory_only_instruction_observations       (WCAG 1.3.3 — human judgement required)
  pointer_gesture_alternative_observations    (WCAG 2.5.1 — alternative actually attempted)
  math_expressions_heard[]                    (expression_ref values from §5.2)
  construct_equivalence_observations
  recorded_at
  receipt_ref
```

A construct-equivalence comparison — required whenever an accessible alternative could
change the learner operation or the evidence meaning (rubric LQR-X04, LQR-X05) —
records observations, not a verdict:

```text
construct_equivalence_receipt:
  reviewer_identity
  reviewer_role: ACCESSIBILITY_REVIEWER | DOMAIN_CONSTRUCT_SME
  reviewer_is_primary_author: false
  lesson_id
  lesson_revision_id
  lesson_script_content_sha256
  app_git_commit
  build_id
  route: STANDARD | CONCISE | MISCONCEPTION | PREREQUISITE_SUPPORT
  runtime_kind: vector | normalized
  build_environment: PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD | PROTOTYPE
  evidence_manifest_sha256
  evidence_refs[]
  original_representation_ref
  alternative_representation_ref
  decisive_feature_preserved: true | false
  operation_preserved: true | false
  relationship_the_learner_must_still_derive
  comparison_observations
  recorded_at
  receipt_ref
```

### 6.1 Novice walkthrough receipt

The X02 walkthrough records all four fixed questions for each consequential screen.
The purpose answer may be recorded once per target KC by setting
`purpose_answer_scope: PER_TARGET_KC`; the other three answers remain per-screen.
The four field names below mean exactly: "What is this screen asking me to do?",
"What changed after my last action?", "What happens next?", and "What will I be able
to do that I couldn't before?" They are not reviewer-selected prompts.

```text
novice_walkthrough_receipt:
  reviewer_identity
  reviewer_role: NOVICE_WALKTHROUGH_REVIEWER
  reviewer_is_primary_author: false
  previously_authored_route: false
  previously_walked_route: false
  holds_target_kc: false
  saw_reviewer_only_key_or_rationale: false
  recorded_without_author_coaching: true
  lesson_id
  lesson_revision_id
  lesson_script_content_sha256
  app_git_commit
  build_id
  route: STANDARD | CONCISE | MISCONCEPTION | PREREQUISITE_SUPPORT
  runtime_kind: vector | normalized
  build_environment: PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD | PROTOTYPE
  target_kc_id
  evidence_manifest_sha256
  evidence_refs[]
  screen_answers[]:
    screen_ref
    target_kc_id
    question_what_is_this_screen_asking
    question_what_changed_after_last_action
    question_what_happens_next
    question_what_will_i_be_able_to_do
    purpose_answer_scope: PER_SCREEN | PER_TARGET_KC
    evidence_refs[]
  recorded_at
  receipt_ref
```

`holds_target_kc`, `previously_authored_route`, and `previously_walked_route` are
literal false attestations, not nullable answers. If any is true or unknown, the receipt
cannot satisfy X02. This constraint defines the existing
`NOVICE_WALKTHROUGH_REVIEWER` role; whether to rename that role remains an open naming
decision in rubric §10 and is not resolved here.

### 6.2 Independent blind-solve receipt

Each C01 or C04 blind solve is one independent observation. Two receipts mean two
different solvers who record before consulting each other.

```text
blind_solve_receipt:
  reviewer_identity
  reviewer_role: INDEPENDENT_BLIND_SOLVER
  reviewer_is_primary_author: false
  authored_item: false
  saw_key_or_rationale_or_feedback: false
  worked_independently: true
  consulted_other_solvers_before_recording: false
  lesson_id
  lesson_revision_id
  lesson_script_content_sha256
  app_git_commit
  build_id
  route: STANDARD | CONCISE | MISCONCEPTION | PREREQUISITE_SUPPORT
  runtime_kind: vector | normalized
  build_environment: PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD | PROTOTYPE
  item_ref
  evidence_manifest_sha256
  evidence_refs[]
  answer_produced
  answer_judged_defensible_by_solver: true | false
  administration_or_wording_cues_observed[]
  keyless_solution_trace_ref
  recorded_at
  receipt_ref
```

### 6.3 Evidence receipts are judge-visible; adjudications are not

These two kinds of human record are easy to confuse and must be handled oppositely.

**Evidence receipts** — the four shapes above, plus an SME construct comparison — are
_observations_. They report what a qualified human saw: what VoiceOver said, the four
walkthrough answers, which answer a blind solver selected, or whether an alternative
preserved the operation. Their judge-visible shapes contain **no `verdict`,
`human_verdict`, `judge_verdict`, `recommendation`, or approval field**. A record with
one of those fields is rejected from judge context rather than trusted because it can
be stripped. Withholding an observation the rubric requires does not protect the
judge's independence; it makes `PASS` structurally unreachable on the dimension.

**Adjudications** — the human override receipt (judge protocol §10) and the calibration
worksheet's `review_receipts[]` — are _decisions_. They record what a human concluded
the verdict should be. These are never supplied to a judge under any circumstance. A
judge that can see the adjudicated verdict is not evaluating the lesson; it is
predicting the reviewer.

The distinguishing test is mechanical: if the record contains a field whose value is a
verdict for the artifact under evaluation, it is an adjudication and the whole record
stays outside judge context.

## 7. Screenshots are appearance-only

A screenshot, by itself, proves only visual appearance at the instant of capture. It
never proves, alone:

- keyboard operability or focus movement;
- screen-reader semantics, names, or announcement timing;
- dynamic feedback, state transitions, or repair/re-entry behavior;
- checkpoint persistence or interruption recovery;
- network or save-failure recovery;
- branch termination or `runtime_terminal_disposition`;
- construct equivalence between two representations.

Each of those requires its own trace, log, or receipt type from §5 or §6. A citation
that offers only a screenshot where one of these is the material fact yields `BLOCKED`
for that finding.

## 8. Fail-closed completeness and protected-content boundary

Missing, stale, contradictory, self-approved, label-contaminated, or unhashable
evidence produces `BLOCKED` — never a partial pass and never an inferred `PASS` from
absence of contrary evidence (rubric §4 Locked decisions, §7.1). Specifically:

- A required branch (§4) with no manifest entry is `BLOCKED` for every dimension whose
  card requires that branch.
- A required condition (§5) with no capture is `BLOCKED` for every dimension whose
  card requires that condition.
- A required receipt (§6) that is absent, older than the evaluated revision, or
  recorded by the primary author is `BLOCKED`. A novice reviewer who holds the target
  KC or previously authored/walked the route, and a blind solver who saw the key,
  rationale, or feedback, provide no qualifying receipt.
- A required contrast measurement (§5.1) or accessible-math transcript (§5.2) that is
  absent is `BLOCKED` for `LQR-X05`. An automated scan reporting no violation is not a
  measurement.
- An evidence bundle that mixes hashes from two different revisions is `BLOCKED` in
  full, not partially credited.
- An unavailable required **evidence** role is `BLOCKED`, never downgraded, delegated to
  model judgment, or waived (rubric §7.4). An outstanding **decision** role withholds
  lesson approval without blocking a dimension; the two are not interchangeable.

Protected-content boundary: protected keys, scoring rules, pre-release rationales,
credentials, and learner-identifying data must stay in authorized reviewer context
only. They must never appear in a raw learner-facing evidence artifact, a browser
capture served to or capturable by a learner session, or a stored fixture intended for
model calibration. A judge or worksheet reviewer who encounters protected content
outside authorized context reports it as `PROTECTED_CONTENT_EXPOSURE`, not as evidence.
That event is run-voiding: the trusted controller records the opaque integrity-event
reference outside protected payload bytes and emits a global blocked precondition
record. The protected value itself is never copied into judge output.

## 9. No harness exists

Restated for clarity: there is no automated capture tool, no evidence-manifest
generator, no receipt-collection UI, and no CI step that produces or validates any of
the artifacts described above. Every field in this document is a requirement on the
evidence a human or agent assembles by hand today. Building that tooling is future,
separately reviewed implementation work (rubric §10) and is out of scope for this
document.
