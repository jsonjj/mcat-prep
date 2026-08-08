# Lesson Quality Rubric — Anchor Catalog

**Status:** CANDIDATE CATALOG — NO GOLD VERDICTS, NO HUMAN RECEIPTS, NO CALIBRATION RUN
**Anchor-set version:** `0.9.1-candidate`
**Owner calibration:** on 2026-08-03, the `PRODUCT_PEDAGOGY_OWNER` approved the
proposed pass/fail/boundary line for all 12 dimensions at design-policy level. This is
not an anchor receipt, `human_verdict`, gold label, or calibration-run result; missing
fixtures, evidence, and specialist reviews remain blocking.
**Rubric authority:** [`lesson-quality-rubric.md`](./lesson-quality-rubric.md), version `0.9.1`
**Rationale version:** `0.9.1` (all records)
**Date:** 2026-08-03
**Supersedes:** anchor-set `0.9-candidate` (cross-document correction wave) · `0.1-draft`

---

## 1. Purpose and status

This catalog is the human review surface for the 36 candidate lesson-quality anchors: one
`CLEAR_PASS`, one `CLEAR_FAIL`, and one `BOUNDARY` for each of the twelve rubric dimensions.

Nothing here is approved. Every record is `CANDIDATE_PENDING_REVIEW` with `human_verdict: null`
and `gold_verdict: null`, and no review receipt exists for any record. A record becomes a gold
label only when every required reviewer in rubric §7.4 approves the exact input, evidence,
verdict, rationale, and blocking boundary.

**Twenty-three of the thirty-six records are designs, not fixtures.** Their exact inputs do not
exist yet. This catalog therefore makes no claim that any test was run, any browser or
assistive-technology evidence was captured, any lesson was evaluated, or any human reviewed
anything.

**What this set is for.** Completed, it would be a _discrimination smoke set_: enough to tell
whether a judge separates a clear pass from a clear fail and behaves sanely at a known boundary,
one dimension at a time. It is not a false-pass rate estimator and cannot become one. Its cases
are hand-built to be decidable and to isolate a single dimension, so they are not a sample of the
lesson population; any rate computed over them describes this catalogue, not the lessons. An
enforcement threshold requires an owner-set minimum number of cases per dimension per case kind
and recorded independent pre-adjudication human agreement, neither of which exists (rubric §8.4).

---

## 2. Record contract

Each record below carries these fields. They match rubric §8.

```text
anchor_id                     (catalogue identity; NEVER judge-visible)
opaque_case_id                (ocid-<32 hex>, single use, minted per run; not stored here)
dimension_id                  (the ONE dimension this anchor scores)
candidate_status:             CANDIDATE                  (restated at every record)
case_kind:                    CLEAR_PASS | CLEAR_FAIL | BOUNDARY
source_kind:                  REAL_ARTIFACT | REAL_DELIVERED_BEHAVIOR
                              | SYNTHETIC_SINGLE_TRANSFORM | DERIVED_EXTERNAL_OBSERVATION
materialization_status:       SOURCE_OBSERVABLE | DESIGN_ONLY
pair_runnable:                true | false               (false for every record today)
lifecycle_state:              CANDIDATE_PENDING_REVIEW   (all records)
hypothesized_verdict_under_complete_evidence:
                              PASS | FAIL | BLOCKED      (agent hypothesis, never a label)
evidence_still_required[]     (what would have to exist for the hypothesis to be tested)
actual_verdict_on_available_evidence:
                              BLOCKED                    (all records; see below)
human_verdict:                null                       (no receipts exist)
gold_verdict:                 null                       (no promotion exists)
source_inspection_status:     PRESENT | MISSING | STALE | CONTRADICTORY
adjudication_evidence_status: NOT_REVIEWED | RECEIPTS_COMPLETE | BLOCKED
route:                        STANDARD | CONCISE | MISCONCEPTION | PREREQUISITE_SUPPORT
runtime_kind:                 vector | normalized
build_environment:            PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD | PROTOTYPE
source_refs[]
deciding_fact
one_transform                 (synthetic records only)
exclusion_check               (byte-identical adjacent deciding fact — §4)
required_reviewer_roles[]     (from rubric §7.4)
review_receipts[]             (empty for every record)
rationale_version:            0.9.1
supersedes / superseded_by
```

### 2.1 Why every record now carries two verdict fields

Anchor-set `0.9-candidate` recorded a single `proposed_verdict`, and for thirteen records built on
real artifacts that value was `PASS`. Read literally, those records asserted that a real lesson
passed a rubric dimension — in a document whose records are intended to become gold labels, for
artifacts whose rendered evidence does not exist and which no qualified human has reviewed. That
is a fabricated approval sitting in a field named "verdict," and nothing but the surrounding prose
prevented it from being read as one.

Two fields replace it:

- **`hypothesized_verdict_under_complete_evidence`** — what the proposer expects the rubric would
  return _if_ the named missing evidence existed and showed what the proposer expects. It is a
  research note. It is never promoted, never compared against a judge run, and never counted as
  agreement.
- **`actual_verdict_on_available_evidence`** — what the rubric's own algorithm returns on what
  exists today. **This is `BLOCKED` for all thirty-six records**, and the derivation is mechanical
  rather than editorial: no record has `adjudication_evidence_status: RECEIPTS_COMPLETE`, twenty-
  three have no materialized input at all, and every record requiring rendered evidence lacks a
  pinned application commit. Under rubric §2.2 step 2, that is `BLOCKED`.

Only `actual_verdict_on_available_evidence` may ever be promoted to a gold label. A record whose
honest current verdict is `BLOCKED` is still a usable anchor once adjudicated — a case that should
be `BLOCKED` and is correctly reported `BLOCKED` tests real judge behaviour. What it cannot be is
an anchor whose expected label is `PASS`.

The per-record headers below therefore read `CANDIDATE · hypothesized \`X\` · actual \`BLOCKED\``.
The three verdict families remain visible in `case_kind`, which is what the pairing rule and the
future scoring split actually use.

### 2.2 Every record names its route and runtime identity

An evaluation is one exact revision on one route and runtime/build pairing (rubric §3.1), so an
anchor is too. The `route`, `runtime_kind`, and `build_environment` fields are required on every
materialized record, and **no record in this version carries them yet** — the catalogue predates
the one-route-per-evaluation rule and its records were written as if a lesson had a single
delivered form. Populating all three is part of materialization (§8), and until they are populated
no record can be run, because the controller cannot construct a judge input without knowing which
route and runtime/build pairing to render.

This matters most for the records whose deciding fact is route-conditional. A repair
branch observed on `STANDARD` says nothing about `CONCISE`, which may not author that
repair at all; a misconception-route entry point does not exist on the standard route.
An anchor that does not say where its deciding fact lives is not reproducible.

### 2.3 Pair runnability

`pair_runnable` is `false` for every record in this catalogue, because at least one side of every
pair is `DESIGN_ONLY` or lacks the evidence its dimension requires. A pair that cannot be run
cannot demonstrate that a judge discriminates, so no record here is calibration-eligible
regardless of how well specified it is. The field is recorded per record so that materialization
work can be tracked and so that a future controller can refuse a run mechanically rather than by
reading prose.

**Status definitions used here** (rubric §8.2):

- `source_inspection_status: PRESENT` — the cited source can be inspected today. It says nothing
  about whether the proposed verdict is right.
- `materialization_status: SOURCE_OBSERVABLE` — the deciding fact can be inspected in the
  repository or in delivered behavior without building a fixture. Its **paired control** may
  still be `DESIGN_ONLY`, so the pair is not yet usable for calibration.
- `materialization_status: DESIGN_ONLY` — the exact input does not exist and must be
  materialized, hashed, and captured first.
- `adjudication_evidence_status: NOT_REVIEWED` — adjudication has not begun and nothing has been
  declared unavailable.
- `adjudication_evidence_status: BLOCKED` — a required evidence item or specialist receipt is
  identified as missing, stale, contradictory, or unobtainable.

Both verdict fields are stored separately from `human_verdict` and `gold_verdict`. They are never
merged or back-filled from each other.

---

## 3. Source identity

Frozen candidate-source baselines, before remediation:

| Lesson               | Lesson-script `content_sha256`                                     |
| -------------------- | ------------------------------------------------------------------ |
| `V3-LES-130923` (L1) | `fe39da36ee66404bcfd168d608dcdce670ba3238bbbe76f87c0537f15b202eff` |
| `V3-LES-789208` (L2) | `bce8010490b939c606ef8057a8b1dcca40bdc00ed18288751d3cc51c301fb754` |
| `V3-LES-844372` (L3) | `9adea72c9298f38b0389329fb9e8a937ade357bbac8e83b3a84d4112765de12c` |

These hashes identify lesson source material only. **No baseline lesson or excerpt is presumed
to pass.** Later edits require a new source hash and may supply before/after pairs.

**Code-sourced records are not covered by these hashes.** Any record whose deciding fact lives in
application, runtime, or normalization code additionally requires an application commit and build
identifier. None is pinned yet, which is one reason those records are `BLOCKED` rather than
evidence-complete. Two retired preview lessons also reused the L2 and L3 lesson IDs with
different content versions, so a citation must always carry a hash or version, never a slug alone.

**A line range is a locator, not an identity.** Records here cite code as `path:start-end` — for
example `packages/content/src/lesson-normalization/normalize.ts:74-78` in `LQA-C05-F01`. Line
numbers drift with any unrelated edit above them, so a line range alone cannot re-identify the
deciding fact later. Every code citation must therefore carry the application commit that the range
was read at, and the quoted symbol or function name that the range was meant to select. When a
record is materialized, the controller re-reads the cited range at the pinned commit and confirms
the named symbol is still the one found there; if the range no longer selects that symbol, the
citation is stale and the record returns to `BLOCKED` rather than being silently re-pointed.

---

## 4. Adjudication and construction rules

- One `CLEAR_PASS`, one `CLEAR_FAIL`, and one `BOUNDARY` per dimension; unique anchor IDs.
- **Pairing rule (introduced in `0.9-candidate`).** A dimension's `CLEAR_PASS` and `CLEAR_FAIL`
  share one source shape and differ by exactly one material fact. Where the real content already
  carries the defect, the fail is the real shape and the pass is its corrected control; where the
  real content is candidate-correct, the pass is the unmodified real shape and the fail is the
  one-transform variant. All twelve pairs in this version are matched.
- A synthetic case changes one material fact from a hashed control that both variants share byte
  for byte. Deterministic derivatives — regenerated hashes, projections, a mechanically derived key
  — are recorded but are not extra transforms. Any second manual change invalidates the case.
- **An anchor scores one dimension.** `dimension_id` names it. A calibration run compares the
  judge's verdict on that dimension only against the adjudicated label. The judge still returns all
  twelve dimensions, and the other eleven are recorded `RECORDED_UNSCORED`: they carry no gold
  label here, so counting them as agreements or errors would score the judge against a label nobody
  adjudicated.
- **The exclusion check concerns inputs only and compares deciding facts, never outputs or
  verdicts.** It must establish that the
  adjacent dimension's deciding fact is _byte-identical between the two variants_ — same locator,
  same hash — so the isolated change cannot move it:

  ```text
  exclusion_check:
    adjacent_dimension_id:
    adjacent_deciding_fact_locator:   (JSON pointer, line range, or branch id)
    variant_a_fact_sha256:
    variant_b_fact_sha256:
    identical: true | false           (must be true)
  ```

  "C03 and C04 cannot move" and "the adjacent dimension would also pass" are not exclusion checks.
  Two variants can agree on an adjacent dimension's verdict while differing in the facts that
  produced it, and in that case the change was not isolated. Every prose exclusion note in §6 is a
  **statement of intent pending this comparison**; none has been computed, because the controls are
  not materialized and have no hashes. A case whose `identical` is false must be split or retired.

- A `CLEAR_FAIL` must carry at least one blocking fact. A `BOUNDARY` may hypothesize `PASS`,
  `FAIL`, or `BLOCKED`; `BLOCKED` is used only when the deciding construct or evidence is genuinely
  unavailable, never as a hedge for an uncertain guess.
- **Nothing in this file reaches a judge.** Anchor IDs, `case_kind`, `dimension_id`, both verdict
  fields, the deciding fact, the exclusion check, and the rationale all stay controller-side. A
  judge receives a single-use opaque case ID of the form `ocid-<32 hex>` and the evaluation input.
  An identifier that encodes the dimension or the case kind — `LQA-C03-B02` encodes both — is not
  opaque and must never be passed through.
- Reviewer roles are fixed by rubric §7.4 and are triggers, not discretion. Promotion additionally
  requires independent pre-adjudication agreement between at least two qualified non-author
  reviewers on the scored dimension, recorded before they see each other's verdicts.

---

## 5. Supersession register

Twenty-four `0.1-draft` candidates are superseded. Each superseded record is
`RETIRED_CANDIDATE`; none was ever approved, so nothing approved is being withdrawn. The
observations behind them are retained as corroborating source observations where they remain
useful.

| Superseded    | Replaced by   | Reason                                                                                                                                                                                                                                                                                                  |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LQA-C01-P01` | `LQA-C01-P02` | Pass control must share the fail's source shape; the L2 units reversal is retained as a corroborating observation.                                                                                                                                                                                      |
| `LQA-C02-P01` | `LQA-C02-P02` | Adding a model for selected 30°/45° facts does not establish adequacy for a route that also demands 60° use and multiple 45° relations.                                                                                                                                                                 |
| `LQA-C02-F01` | `LQA-C02-F02` | The real L1 trigonometry gap bundles several special-angle omissions and is not a single defect.                                                                                                                                                                                                        |
| `LQA-C03-P01` | `LQA-C03-P02` | Unmatched to the fail, and the source item's full option set is unaudited in a lesson that also contains a duplicated-option defect.                                                                                                                                                                    |
| `LQA-C03-F01` | `LQA-C03-F03` | Its deciding fact needs an SME answer-defensibility judgment that does not exist, so a `CLEAR_FAIL` could not be adjudicated. Replaced by the real L1 duplicated-distractor defect, which is decidable by string comparison. Retained as a corroborating observation and a future `BOUNDARY` candidate. |
| `LQA-C03-P02` | `LQA-C03-P03` | Followed its fail. Its corrected control required rewriting protected error-model routing; the replacement control is produced by deleting one duplicated option string.                                                                                                                                |
| `LQA-C03-B01` | `LQA-C03-B02` | Its deciding fact is a word in the prompt, which C04 owns; keeping it under both risked double-counting one root cause.                                                                                                                                                                                 |
| `LQA-C04-P01` | `LQA-C04-P02` | Unmatched to the fail; a different lesson, item, and scorer.                                                                                                                                                                                                                                            |
| `LQA-C05-P01` | `LQA-C05-P02` | Unmatched to the strongest evidenced fail; the L1 repair path is retained as a corroborating observation.                                                                                                                                                                                               |
| `LQA-C05-B01` | `LQA-C05-B02` | It restated the pass control's own criterion instead of locating a distinct line.                                                                                                                                                                                                                       |
| `LQA-C06-P01` | `LQA-C06-P02` | Pass and fail used different items and progressions.                                                                                                                                                                                                                                                    |
| `LQA-C06-F01` | `LQA-C06-F02` | Same: realigned onto the shared progression.                                                                                                                                                                                                                                                            |
| `LQA-X01-P01` | `LQA-X01-P02` | Pass and fail used different worked-example nodes.                                                                                                                                                                                                                                                      |
| `LQA-X01-F01` | `LQA-X01-F02` | Same: realigned onto the shared node.                                                                                                                                                                                                                                                                   |
| `LQA-X02-P01` | `LQA-X02-P02` | Comparing an L3 screen with an L1 route does not isolate focus; all lessons sit under the same shell.                                                                                                                                                                                                   |
| `LQA-X02-F01` | `LQA-X02-F02` | Same shared-shell confound.                                                                                                                                                                                                                                                                             |
| `LQA-X02-B01` | `LQA-X02-B02` | Its comparator was a different lesson and its deciding evidence is unavailable; retained as an evidence request.                                                                                                                                                                                        |
| `LQA-X03-F01` | `LQA-X03-F02` | Unmatched runtime; the same delivered-feedback mechanism is retained as a corroborating observation.                                                                                                                                                                                                    |
| `LQA-X04-P01` | `LQA-X04-P02` | Unmatched to the fail.                                                                                                                                                                                                                                                                                  |
| `LQA-X04-F01` | `LQA-X04-F02` | The three-field collapse also fails X01, so it cannot isolate X04.                                                                                                                                                                                                                                      |
| `LQA-X04-B01` | `LQA-X04-B02` | The boundary must be the pass control minus its optional interaction.                                                                                                                                                                                                                                   |
| `LQA-X05-P01` | `LQA-X05-P02` | Adding labels, errors, focus management, keyboard behavior, and an alternative at once cannot be a single-defect control.                                                                                                                                                                               |
| `LQA-X05-F01` | `LQA-X05-F02` | Paired to that multi-change control.                                                                                                                                                                                                                                                                    |
| `LQA-X05-B01` | `LQA-X05-B02` | It restated the pass control's missing assistive-technology evidence instead of locating a line.                                                                                                                                                                                                        |
| `LQA-X06-P01` | `LQA-X06-P02` | Unmatched recovery kind: pause/resume against a start-failure fail.                                                                                                                                                                                                                                     |
| `LQA-X06-B01` | `LQA-X06-B02` | A pedagogically incomplete repair branch invokes C05 regardless of how honestly it terminates.                                                                                                                                                                                                          |

---

## 6. Candidate inventory

### LQR-C01 — Transfer validity

**Required reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`,
`INDEPENDENT_BLIND_SOLVER` ×2. **Receipts held:** none.

**`LQA-C01-P02` — CLEAR_PASS · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `REAL_ARTIFACT`; `SOURCE_OBSERVABLE`; inspection `PRESENT`; adjudication `BLOCKED`;
supersedes `LQA-C01-P01`.
Refs: `content/lessons/v3-les-844372/lesson-script.json:3376-3445`;
`content/lessons/v3-les-844372/learner-safe-items.json:321-342`.
Deciding fact: the changed task begins in logarithmic form and requires an inverse-form
conversion plus restoration of the outer scale — a decision point the near task does not contain.
Exclusion check (pending computation): the prompt wording, option-set bytes, and scoring-authority
bytes are the adjacent deciding facts for C03 and C04; each locator and hash must be byte-identical
across the pair before use. Blocked because no keyless blind solve and no SME construct comparison
exists.

**`LQA-C01-F01` — CLEAR_FAIL · CANDIDATE · hypothesized `FAIL` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM`; `DESIGN_ONLY`; inspection `PRESENT`; adjudication
`NOT_REVIEWED`.
One transform: on the same source shape, replace only the changed task's governing relation with
a numeric or variable clone of the near task's exponential-isolation relation, and regenerate the
key mechanically. Symbols and numbers may differ; the solution-path shape becomes the near task's.
Deciding fact: the changed task's solution trace becomes reproducible from the near task by
substitution alone.
Invariants: KC and success condition, route and assistance level, response type, family separation
and freshness, first-attempt policy, difficulty range, and uniquely defensible key.
Exclusion check (pending computation): prompt, option-set, response-control, and delivered-payload
bytes are the adjacent deciding facts for C03, C04, and X01; the corresponding locator and hash for
each must be byte-identical across the pair.

**`LQA-C01-B01` — BOUNDARY · CANDIDATE · hypothesized `BLOCKED` · actual `BLOCKED`**
Source kind `REAL_ARTIFACT`; `SOURCE_OBSERVABLE`; inspection `PRESENT`; adjudication `BLOCKED`.
Refs: `content/lessons/v3-les-844372/lesson-script.json:2711-2780`.
Deciding fact: the graph near→changed pair moves a signed linear slope reading to a semilog
extrapolation. Whether that preserves the governed construct depends on whether the KC is broad
graph decoding or the narrower signed-slope operation — a written SME scope decision that does not
exist. `BLOCKED` records the missing construct boundary rather than inventing a conclusion.

**Corroborating source observation (not an anchor).** The L2 units near→changed pair reverses
L→mL into mL→L while preserving factor orientation and cancellation
(`content/lessons/v3-les-789208/lesson-script.json:4501-4567`;
`content/lessons/v3-les-789208/protected-items.json:119-184`). It is a strong future second pass
row once its blind solves exist.

### LQR-C02 — Instructional adequacy

**Required reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`.
**Receipts held:** none.

**`LQA-C02-P02` — CLEAR_PASS · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM` (neutralized control); `DESIGN_ONLY`; inspection
`PRESENT`; adjudication `NOT_REVIEWED`; supersedes `LQA-C02-P01`.
Refs: `content/lessons/v3-les-130923/lesson-script.json:495-633`, `:3383-3637`, `:3711-3776`.
Control: a source-shaped trigonometry route whose pre-exit model explicitly teaches **every**
special-angle relation later demanded — the relevant 30° and 60° sine and cosine values, equal
legs at 45°, and the 45° leg-to-hypotenuse relation — with all tasks and keys unchanged.
Deciding fact: every consequential demand in the inventory traces to prior teaching on the route.
Note: the control must be materialized once, hashed, and shared byte for byte with `LQA-C02-F02`.
Neutralizing the bundled source omissions is control construction, not an anchor.

**`LQA-C02-F02` — CLEAR_FAIL · CANDIDATE · hypothesized `FAIL` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM`; `DESIGN_ONLY`; inspection `PRESENT`; adjudication
`NOT_REVIEWED`; supersedes `LQA-C02-F01`.
One transform: delete only the 45° leg-to-hypotenuse relation from the control's model, keeping
the equal-legs fact and every 30° and 60° fact.
Deciding fact: the unchanged re-entry task then requires exactly one untaught relation.
Exclusion check (pending computation): prompt, key, response-control, repair-graph, and rendered
payload bytes are the adjacent deciding facts for C03, C04, C05, and X01; each locator and hash
must be byte-identical across the pair.

**`LQA-C02-B01` — BOUNDARY · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `REAL_ARTIFACT`; `SOURCE_OBSERVABLE`; inspection `PRESENT`; adjudication `BLOCKED`.
Refs: `content/lessons/v3-les-130923/lesson-script.json:97-114`, `:2361-2409`;
`services/lambdas/learner-api/src/vector-lesson-runtime.ts:843-860`.
Deciding fact: the L1 entry prompt is declared and delivered low stakes, offers "Not sure yet,"
cannot select a route or satisfy an exit or move mastery, and is followed by instruction — all
four parts of the low-stakes discovery exception hold.
Near-line comparator: change only the entry's consequence to selecting the learner's route, which
removes part three and produces `FAIL`.

**Corroborating source observation (not an anchor).** Current L1 trigonometry names special-angle
relationships without teaching their values, then demands `sin 30°`, 60° use, and a 45°
hypotenuse-to-leg re-entry. That is a real teaching-to-demand gap for remediation, but it bundles
several omissions and cannot isolate the criterion.

### LQR-C03 — Distractor and error-model quality

**Required reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`.
**Receipts held:** none.

**`LQA-C03-F03` — CLEAR_FAIL · CANDIDATE · hypothesized `FAIL` · actual `BLOCKED`**
Source kind `REAL_ARTIFACT`; `SOURCE_OBSERVABLE`; inspection `PRESENT`; adjudication
`NOT_REVIEWED`; `pair_runnable: false` (control not yet materialized); supersedes `LQA-C03-F01`.
Refs: `content/lessons/v3-les-130923/lesson-script.json:2821-2869`.
Deciding fact: in `vtr-vec-repair-confirmation-near-2`, the B and D option strings are byte-
identical. A duplicated distractor is a named blocking condition under `LQR-C03`, and the defect
is fully decidable from the authored artifact — no scoring-authority interpretation, no SME
equivalence judgment, and no rendered evidence is needed to see that two option strings match.
Exclusion check (pending computation): prompt text, required fields, expected solution, response
format, key, and learner-facing wording are the adjacent deciding facts for C04 and X01; the one
transform touches none of them, so each locator and hash must be byte-identical once the control
exists.

**`LQA-C03-P03` — CLEAR_PASS · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM` (corrected control); `DESIGN_ONLY`; inspection `PRESENT`;
adjudication `NOT_REVIEWED`; `pair_runnable: false`; supersedes `LQA-C03-P02`.
Refs: `content/lessons/v3-les-130923/lesson-script.json:2821-2869`.
One transform: on the same item, replace the duplicated option string with a distinct distractor
that maps to its own observable feature. Nothing else changes.
Deciding fact: every option is distinct and every consequential wrong choice maps to an observable
feature, so no learner faces two identical answers.
Note: the control must be materialized once, hashed, and shared byte for byte with `LQA-C03-F03`.

**Why this pair replaces the L3 accepted-equation pair.** The superseded `LQA-C03-F01` /
`LQA-C03-P02` pair rested on the L3 item where the protected accepted equation `2L + 2W = 22` is
simultaneously accepted by the scoring authority and routed as
`PERIMETER_COEFFICIENT_NOT_SIMPLIFIED` to targeted repair. That is a real and interesting defect,
but as a _calibration anchor_ it is weaker on three counts. Its deciding fact requires a
`DOMAIN_CONSTRUCT_SME` equivalence judgment — whether the unsimplified form is genuinely a
defensible answer — so the anchor cannot be adjudicated without a review that does not exist, and
its `adjudication_evidence_status` was `BLOCKED` for exactly that reason. Its corrected control
was `DESIGN_ONLY` with no cheap path to materialization, since "treat the accepted form as
correct" means rewriting the protected error-model routing. And a boundary that depends on expert
judgment about answer defensibility is a poor `CLEAR_FAIL`: a clear case should be one where two
qualified reviewers cannot reasonably disagree.

The duplicated-distractor pair inverts all three. The defect is visible by string comparison, the
corrected control is produced by deleting one duplicate, and no reviewer will argue that two
identical options are acceptable. It is retained below as a corroborating source observation and
remains a strong candidate for a future `BOUNDARY` case about the line between a defensible
alternate answer and an authored misconception — which is what it actually illustrates.

**`LQA-C03-B02` — BOUNDARY · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM`; `DESIGN_ONLY`; inspection `PRESENT`; adjudication
`NOT_REVIEWED`; supersedes `LQA-C03-B01`.
Refs: `packages/content/src/v3-vector-lesson-artifacts.ts:266-281`.
One transform: change only the reviewer-side rationale wording for the unsigned-magnitude choice
from categorical cause language to "is consistent with adding unsigned magnitudes."
Deciding fact: epistemic strength inside the authored error model. Hedged observation wording
passes; asserting a persistent learner trait from one response is the blocking form.
Exclusion check (pending computation): choice-text, key, observable-feature, repair-destination,
and learner-facing-feedback bytes are the adjacent deciding facts for C04 and X03; each locator and
hash must be byte-identical across the pair.

**Corroborating source observations (not anchors).** (a) Across the L2 multiple-choice set the
correct option is the first substantive option in the large majority of items, and the renderer
preserves source order without shuffling
(`packages/content/src/lesson-normalization/normalize.ts:101-104`;
`apps/learner-web/src/screens/CatalogLesson.tsx:326-343`) — a position-heuristic exposure that
needs SME confirmation of exploitability. (b) The L3 protected accepted equation `2L + 2W = 22` is
accepted by the scoring authority while being routed as `PERIMETER_COEFFICIENT_NOT_SIMPLIFIED` to
targeted repair (`content/lessons/v3-les-844372/lesson-script.json:3107-3133`;
`content/lessons/v3-les-844372/protected-items.json:98-120`). Retained from the superseded
`LQA-C03-F01`; it needs an SME equivalence decision before it can carry any label. (c) L1 wrong
choices are only partly mapped to observable features, so unmapped choices take the generic
protected fallback (`packages/content/src/v3-vector-lesson-artifacts.ts:266-333`) — a separate
C03 concern from the duplicate, and deliberately not bundled into `LQA-C03-F03`.

### LQR-C04 — Prompt clarity

**Required reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`,
`INDEPENDENT_BLIND_SOLVER` ×2. **Receipts held:** none.

**`LQA-C04-P02` — CLEAR_PASS · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM` (corrected control); `DESIGN_ONLY`; inspection `PRESENT`;
adjudication `NOT_REVIEWED`; supersedes `LQA-C04-P01`.
Refs: `content/lessons/v3-les-789208/learner-safe-items.json:427-433`;
`content/lessons/v3-les-789208/protected-items.json:912-937`;
`services/lambdas/learner-api/src/normalized-lesson-runtime.ts:162-197`.
Control: the same short-response notation item, with the required entry convention stated in the
prompt and accepted by the scorer — for example "Enter your answer in e-notation, such as
`7.2e-4`."
Deciding fact: the learner is told the convention scoring depends on.

**`LQA-C04-F01` — CLEAR_FAIL · CANDIDATE · hypothesized `FAIL` · actual `BLOCKED`**
Source kind `REAL_ARTIFACT`; `SOURCE_OBSERVABLE`; inspection `PRESENT`; adjudication `BLOCKED`.
Refs: as above.
Deciding fact: the prompt states no entry syntax while the exact-text scorer accepts only a narrow
Unicode-times and caret form; the engine's normalization only trims and collapses whitespace, so
mathematically equivalent learner inputs are scored incorrect for notation rather than for the
construct.
Exclusion check (pending computation): the complete empty-distractor inventory and scoring-authority
bytes are C03's adjacent deciding facts; their locators and hashes must be byte-identical across the
pair. Blocked for gold because no keyless blind solve enumerates the rejected equivalent forms.

**`LQA-C04-B01` — BOUNDARY · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `REAL_ARTIFACT`; `SOURCE_OBSERVABLE`; inspection `PRESENT`; adjudication `BLOCKED`.
Refs: `content/lessons/v3-les-789208/learner-safe-items.json:444-457`.
Deciding fact: a single word — "normalized" — is what makes an otherwise numerically equivalent
option incorrect. The prompt passes while that word is present and salient.
Near-line comparator: delete only that word, and the item has two defensible answers (`FAIL`).
Note: the rubric's C04 card states the other side of this line — a non-semantic typo that cannot
change the operation, the defensible answer set, or the accessible equivalent remains
non-blocking.

### LQR-C05 — Repair quality

**Required reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`.
**Receipts held:** none.

**`LQA-C05-P02` — CLEAR_PASS · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM` (corrected control); `DESIGN_ONLY`; inspection `PRESENT`;
adjudication `NOT_REVIEWED`; supersedes `LQA-C05-P01`.
Refs: authored re-entry `content/lessons/v3-les-789208/lesson-script.json:2341-2443`;
`content/lessons/v3-les-789208/protected-items.json:213-238`;
`content/lessons/v3-les-789208/kc-coverage-matrix.json:220-223`;
`packages/content/src/lesson-normalization/normalize.ts:74-78`.
Control: the authored fresh re-entry is bound so delivery recognizes it as a re-entry.
Deciding fact: after a miss and repair, the exact failed function is re-checked on a fresh,
uncontaminated item.
Exclusion check (pending computation): repair-content, assistance-bound, family-freshness,
feedback, UI, and X06 recovery/termination-policy bytes are the adjacent inputs; each locator and
hash must be byte-identical across the pair. The changed runtime terminal disposition is a derived
output and is not an exclusion-check input. This must be computed when the control is materialized.

**`LQA-C05-F01` — CLEAR_FAIL · CANDIDATE · hypothesized `FAIL` · actual `BLOCKED`**
Source kind `REAL_DELIVERED_BEHAVIOR`; `SOURCE_OBSERVABLE`; inspection `PRESENT`; adjudication
`BLOCKED`.
Refs: `packages/content/src/lesson-normalization/normalize.ts:74-78`;
`services/lambdas/learner-api/src/normalized-lesson-runtime.ts:281-300`;
`services/lambdas/learner-api/src/normalized-lesson-runtime.test.ts:167-189`.
Deciding fact: the L2 re-entry items carry neither an activity ID containing "reentry" nor
`exact_reentry_for`, which are the only two signals the normalizer reads, so no L2 item is
recognized as a re-entry. A missed exit serves one repair and then ends; the authored fresh
re-entry is never administered and the failed function is never re-checked.
Exclusion check (pending computation): the terminal-disposition and truthful-handoff bytes are
X06's adjacent deciding facts; their locators and hashes must be byte-identical across the pair.
Note: the L2 source analysis recorded this row as adjudication `NOT_REVIEWED (code SUFFICIENT)`.
Under rubric §8.2 the absent required role receipts make it `BLOCKED`; the code-demonstrable
blocking fact is what supports the hypothesized `FAIL` under `FAIL > BLOCKED > PASS`.

**`LQA-C05-B02` — BOUNDARY · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM`; `DESIGN_ONLY`; inspection `PRESENT`; adjudication
`NOT_REVIEWED`; supersedes `LQA-C05-B01`.
Refs: `services/lambdas/learner-api/src/vector-lesson-runtime.ts:938-1073`.
One transform: from the L1 two-confirmation maximum, change only the bound to one confirmation
attempt. A miss then returns safely to the planner; a success still requires fresh re-entry.
Deciding fact: bounded assistance has no fixed quota. The bound passes while the exact function is
re-checked on success and exhaustion terminates honestly.

**Corroborating source observation (not an anchor).** L1's changed-task miss → targeted repair →
confirmation → fresh changed re-entry path, with repair confirmation classified as process
evidence only (`services/lambdas/learner-api/src/vector-lesson-runtime.ts:699-752`, `:938-1073`;
`services/lambdas/learner-api/src/vector-lesson-runtime.test.ts:408-464`). No authored C05 defect
was found in it, but its real-browser branch evidence is absent.

### LQR-C06 — Depth of Knowledge (DOK) appropriateness and distribution

**Required reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`.
**Receipts held:** none.

**`LQA-C06-P02` — CLEAR_PASS · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM` (declaration-only control); `DESIGN_ONLY`; inspection
`PRESENT`; adjudication `NOT_REVIEWED`; supersedes `LQA-C06-P01`.
Refs: `content/lessons/v3-les-844372/lesson-script.json:971-1257`;
`content/lessons/v3-les-844372/learner-safe-items.json:273-342`.
Control: item-level depth targets and rationales attached to a fixed, source-shaped logarithm
progression, with the unchanged "ten raised to the third power" entry task classified as DOK 1 on
the stated ground that it is direct recall or computation, and later routine inverse-form
applications classified separately.
Deciding fact: each declared depth is supported by that item's own solution trace.

**`LQA-C06-F02` — CLEAR_FAIL · CANDIDATE · hypothesized `FAIL` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM`; `DESIGN_ONLY`; inspection `PRESENT`; adjudication
`NOT_REVIEWED`; supersedes `LQA-C06-F01`.
One transform: change only the entry task's declaration from DOK 1 to DOK 3, leaving the task,
rationale, phase, and full distribution unchanged.
Deciding fact: a declared depth contradicted by the item's own one-step solution trace.
Exclusion check (pending computation): task-text, sequence, key, and assistance bytes are the
adjacent deciding facts; each locator and hash must be byte-identical across the pair.

**`LQA-C06-B01` — BOUNDARY · CANDIDATE · hypothesized `BLOCKED` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM` (declaration on real item); `DESIGN_ONLY`; inspection
`PRESENT`; adjudication `NOT_REVIEWED`.
Refs: `content/lessons/v3-les-844372/learner-safe-items.json:194-213`;
`content/lessons/v3-les-844372/lesson-script.json:3081-3103`.
Deciding fact: the formula-to-system translation task sits on a genuine adjacent-level boundary —
routine application or non-routine strategic reasoning. Changing only the proposed declaration
from DOK 2 to DOK 3 does not settle it. `BLOCKED` avoids fabricating a human depth classification.

### LQR-X01 — Presentation-to-UI fidelity

**Required reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`; add `DOMAIN_CONSTRUCT_SME` when the omitted
or added element carries domain content. **Receipts held:** none.

**`LQA-X01-P02` — CLEAR_PASS · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM` (corrected control); `DESIGN_ONLY`; inspection `PRESENT`;
adjudication `NOT_REVIEWED`; supersedes `LQA-X01-P01`.
Refs: `content/lessons/v3-les-844372/lesson-script.json:1089-1109`;
`packages/content/src/lesson-normalization/normalize.ts:186-194`;
`services/lambdas/learner-api/src/normalized-lesson-runtime.ts:519-527`.
Control: the authored worked-example node reference resolves to its authored inverse-form
reasoning in both the run payload and the rendered body.
Deciding fact: authored instructional meaning reaches the learner.

**`LQA-X01-F02` — CLEAR_FAIL · CANDIDATE · hypothesized `FAIL` · actual `BLOCKED`**
Source kind `REAL_DELIVERED_BEHAVIOR`; `SOURCE_OBSERVABLE`; inspection `PRESENT`; adjudication
`BLOCKED`; supersedes `LQA-X01-F01`.
Refs: as above, plus `apps/learner-web/src/screens/CatalogLesson.tsx:214-226`.
Deciding fact: normalization sets the screen prompt for a node reference to a raw internal token
of the form `[worked example: NODE_ID]`, and the UI renders that prompt, so an implementation
token reaches the learner in place of the authored reasoning.
Exclusion check (pending computation): stage-order, heading, layout, action, focus-target, and
response-behavior bytes are the adjacent deciding facts for X02, X04, and X05; each locator and
hash must be byte-identical across the pair. Blocked for gold because no revision-bound browser
capture exists.

**`LQA-X01-B01` — BOUNDARY · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `REAL_DELIVERED_BEHAVIOR`; `SOURCE_OBSERVABLE`; inspection `PRESENT`; adjudication
`BLOCKED`.
Refs: `content/lessons/v3-les-789208/lesson-presentation-plan.json:440-463`;
`content/lessons/v3-les-789208/learner-safe-items.json:69-80`;
`services/lambdas/learner-api/src/normalized-lesson-runtime.ts:537`.
Deciding fact: the presentation plan heads the L2 units changed exit "Changed-task check" while
delivery renders the learner-safe phase label "Final check." The operation, prompt, response
control, sequence, and feedback survive; the KC-orienting wording does not. Proposed `PASS` with a
non-blocking fidelity finding.

**Corroborating source observation (not an anchor).** L2's entire authored teaching layer —
orientation, explanation, mental model, expert think-aloud, worked example, and recap — never
renders, because normalization consumes only the question-evidence plan
(`packages/content/src/lesson-normalization/normalize.ts:251-252`). It is the largest
authored-versus-delivered gap found, but it is a whole-layer defect and cannot isolate one
criterion.

### LQR-X02 — Cognitive focus, pacing, and visual clarity

**Required reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `NOVICE_WALKTHROUGH_REVIEWER`; add
`ACCESSIBILITY_REVIEWER` when the finding concerns focus or reflow. **Receipts held:** none.

**`LQA-X02-P02` — CLEAR_PASS · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM`; `DESIGN_ONLY`; inspection `PRESENT`; adjudication
`NOT_REVIEWED`; supersedes `LQA-X02-P01`.
Refs: `apps/learner-web/src/app/router.tsx:39-50`;
`apps/learner-web/src/screens/AppShell.tsx:64-110`.
Control: one exact L3 question state rendered in a focused lesson shell mode that keeps the skip
link and the lesson-local pause-and-return action but suppresses the global header, desktop
sidebar, and mobile bottom navigation.
Deciding fact: no global chrome competes with the primary action on a scored screen.

**`LQA-X02-F02` — CLEAR_FAIL · CANDIDATE · hypothesized `FAIL` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM`; `DESIGN_ONLY`; inspection `PRESENT`; adjudication
`NOT_REVIEWED`; supersedes `LQA-X02-F01`.
One transform: change only the shell mode from focused to standard, so the same screen displays
the shared global chrome.
Invariants: lesson revision, item, prompt, choices, selected and feedback state, lesson-local
actions, typography tokens, viewport, theme, scroll position, focus target, and renderer bytes.
Exclusion check (pending computation): lesson, item, renderer, and viewport bytes are the adjacent
inputs; each locator and hash must be byte-identical across the pair, with shell mode as the sole
declared transform.

**`LQA-X02-B02` — BOUNDARY · CANDIDATE · hypothesized `FAIL` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM`; `DESIGN_ONLY`; inspection `PRESENT`; adjudication
`NOT_REVIEWED`; supersedes `LQA-X02-B01`.
One transform: in the focused control, change only the lesson-local pause-and-return action's
visual priority from a secondary text action to the same primary styling as the submit action.
Deciding fact: two controls now carry primary-action treatment for different jobs. Labels,
handlers, control count, DOM order, content, viewport, and focus are unchanged, so this isolates
visual action priority alone.

**Corroborating source observation (not an anchor).** L1 presents orientation, explanation, model,
think-aloud, and worked example as five consecutive continue stages
(`services/lambdas/learner-api/src/vector-lesson-runtime.ts:64-89`, `:1087-1101`). Whether that is
coherent chunking or fragmented clicking needs the novice walkthrough and timing evidence that do
not exist; it is retained as an evidence request, not a candidate.

### LQR-X03 — Feedback and scaffolding quality

**Required reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `ACCESSIBILITY_REVIEWER`; add
`DOMAIN_CONSTRUCT_SME` when feedback explains domain reasoning. **Receipts held:** none.

**`LQA-X03-P01` — CLEAR_PASS · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `REAL_DELIVERED_BEHAVIOR`; `SOURCE_OBSERVABLE`; inspection `PRESENT`; adjudication
`BLOCKED`.
Refs: `packages/content/src/v3-vector-lesson-artifacts.ts:266-281`;
`services/lambdas/learner-api/src/vector-lesson-protected.ts:75-86`;
`services/lambdas/learner-api/src/vector-lesson-runtime.ts:938-977`.
Deciding fact: the unsigned-magnitude wrong choice produces post-commitment feedback that names
the observable sign-handling divergence and routes to the exact repair, without asserting a
learner trait. Blocked for gold because focus, live-region, and announcement captures do not
exist.

**`LQA-X03-F02` — CLEAR_FAIL · CANDIDATE · hypothesized `FAIL` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM`; `DESIGN_ONLY`; inspection `PRESENT`; adjudication
`NOT_REVIEWED`; supersedes `LQA-X03-F01`.
One transform: replace only the learner-facing feedback payload with "Not quite," keeping outcome,
focus, announcement, repair destination, and all branch behavior unchanged.
Deciding fact: actionable specificity after commitment.
Exclusion check (pending computation): the authored-to-rendered payload binding is X01's adjacent
deciding fact and the repair-graph bytes are C05's; each locator and hash must be byte-identical
across the pair.

**`LQA-X03-B01` — BOUNDARY · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `REAL_DELIVERED_BEHAVIOR`; `SOURCE_OBSERVABLE`; inspection `PRESENT`; adjudication
`BLOCKED`.
Refs: `services/lambdas/learner-api/src/vector-lesson-runtime.ts:843-860`.
Deciding fact: brief feedback on the L1 entry check is acceptable because the item is explicitly
low stakes, moves nothing, and is followed by the full model on the same route. The same brevity
on a consequential exit would fail. Browser evidence must confirm that the later teaching is
delivered and the feedback is announced.

**Corroborating source observation (not an anchor).** In the shared normalized runtime, the
feedback screen carries only an outcome and the UI renders "Correct" or "Not quite," while the
authored rationale and observable-error repair action are resolved server-side and then dropped
(`services/lambdas/learner-api/src/normalized-lesson-runtime.ts:507-517`;
`apps/learner-web/src/screens/CatalogLesson.tsx:241-251`). It is code-demonstrable on L2 and L3
but is not matched to the L1 pass control.

### LQR-X04 — Meaningful interaction and representation

**Required reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`; add
`ACCESSIBILITY_REVIEWER` when a representation or alternative is material. **Receipts held:** none.

**`LQA-X04-P02` — CLEAR_PASS · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM`; `DESIGN_ONLY`; inspection `PRESENT`; adjudication
`NOT_REVIEWED`; supersedes `LQA-X04-P01`.
Refs: `services/lambdas/learner-api/src/vector-lesson-runtime.ts:1287-1325`;
`apps/learner-web/src/screens/VectorLesson.tsx:279-293`.
Control: one accessible, unscored "compare side roles" action added to the source-shaped static
representation; activating it highlights the opposite, adjacent, and hypotenuse labels for the
selected reference angle, while every required relation also remains available in static text.
Deciding fact: the action changes the visibility of a KC relationship.

**`LQA-X04-F02` — CLEAR_FAIL · CANDIDATE · hypothesized `FAIL` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM`; `DESIGN_ONLY`; inspection `PRESENT`; adjudication
`NOT_REVIEWED`; supersedes `LQA-X04-F01`.
One transform: change only the action's state effect from relationship-specific highlighting to a
decorative border-color pulse. Control, label, action count, timing, and static teaching are
unchanged.
Exclusion check (pending computation): the authored/rendered behavior binding, static-teaching
bytes, and action/layout bytes are the adjacent deciding facts for X01, C02, and X02 respectively;
each locator and hash must be byte-identical across the pair.

**`LQA-X04-B02` — BOUNDARY · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM`; `DESIGN_ONLY`; inspection `PRESENT`; adjudication
`NOT_REVIEWED`; supersedes `LQA-X04-B01`.
One transform: remove only the optional compare action from the pass control, leaving the semantic
figure, text equivalent, and labeled values.
Deciding fact: this locates the no-interaction-quota line. Nothing the action revealed becomes
unavailable, so removing it is not a defect.

**Corroborating source observation (not an anchor).** L3's authored three-field system
construction is rendered as one generic text input and submitted as a short response
(`content/lessons/v3-les-844372/learner-safe-items.json:194-213`;
`apps/learner-web/src/screens/CatalogLesson.tsx:293-315`, `:345-353`). It is a real X04-owned
lesson defect — the control cannot express the authored operation — but it simultaneously fails
X01, so it cannot serve as an isolating anchor.

### LQR-X05 — Accessibility and construct equivalence

**Required reviewer roles:** `ACCESSIBILITY_REVIEWER` (independent of the author),
`PRODUCT_PEDAGOGY_OWNER`; add `DOMAIN_CONSTRUCT_SME` when an alternative could change the
construct. **Receipts held:** none.

**`LQA-X05-P02` — CLEAR_PASS · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `REAL_DELIVERED_BEHAVIOR`; `SOURCE_OBSERVABLE`; inspection `PRESENT`; adjudication
`BLOCKED`; supersedes `LQA-X05-P01`.
Refs: `apps/learner-web/src/screens/CatalogLesson.tsx:322-343`;
`apps/learner-web/src/styles/app.css:2876-2922`.
Control: the current source-shaped native radio group with fieldset, legend, wrapping labels,
visible option text, minimum touch area, and a focus-within indicator, held unmodified.
Deciding fact: every option has a programmatic accessible name matching its visible label.
Blocked for gold, explicitly and non-negotiably: a real Safari + VoiceOver receipt, keyboard-only
trace, contrast and target measurements, and zoom and reflow results do not exist. Source
semantics and automated scanning cannot substitute for that receipt.

**`LQA-X05-F02` — CLEAR_FAIL · CANDIDATE · hypothesized `FAIL` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM`; `DESIGN_ONLY`; inspection `PRESENT`; adjudication
`NOT_REVIEWED`; supersedes `LQA-X05-F01`.
One transform: for one required option only, replace the label association with a visually
identical non-label wrapper, leaving that radio with no other accessible name.
Invariants: prompt and legend, option text and order, key, response behavior, visual layout, CSS,
target size, keyboard handling, focus style, contrast, and route.
Deciding fact: one control's accessible name is absent while its visible label is unchanged.

**`LQA-X05-B02` — BOUNDARY · CANDIDATE · hypothesized `FAIL` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM`; `DESIGN_ONLY`; inspection `PRESENT`; adjudication
`NOT_REVIEWED`; supersedes `LQA-X05-B01`.
One transform: from the pass control, change only the native radio hiding technique from
positioned zero-opacity to display-none, retaining the visually identical custom marker and label
text.
Deciding fact: sighted appearance is fixed, so this locates the line between visually hidden
native semantics and removal from keyboard and assistive-technology access.

**Product-target note.** The 48 CSS px product touch target is a preferred product standard, not a
WCAG minimum. Under rubric LQR-X05 a miss is non-blocking when WCAG 2.5.8 target size and spacing
pass and no usability, pointer-accuracy, or focus defect is observed at any required width. No
anchor in this version tests that boundary; it needs real geometry measurements first.

### LQR-X06 — Responsive behavior, recovery, and branch completion

**Required reviewer roles:** `PRODUCT_PEDAGOGY_OWNER`, `PLATFORM_RELIABILITY_REVIEWER`; add
`ACCESSIBILITY_REVIEWER` when the finding concerns focus or an access method.
**Receipts held:** none.

**`LQA-X06-P02` — CLEAR_PASS · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM` (corrected control); `DESIGN_ONLY`; inspection `PRESENT`;
adjudication `NOT_REVIEWED`; supersedes `LQA-X06-P01`.
Refs: `apps/learner-web/src/screens/CatalogLesson.tsx:38`, `:48-55`, `:120-140`.
Control: in a deterministic initial-start failure state, the recovery action reissues the
idempotent start command and then loads the resulting authoritative run.
Deciding fact: the displayed recovery action retries the transition that actually failed.

**`LQA-X06-F01` — CLEAR_FAIL · CANDIDATE · hypothesized `FAIL` · actual `BLOCKED`**
Source kind `REAL_DELIVERED_BEHAVIOR`; `SOURCE_OBSERVABLE`; inspection `PRESENT`; adjudication
`BLOCKED`.
Refs: as above.
Deciding fact: the start-attempted flag is set immediately before the start mutation and guards
the auto-start effect, so a failed start is never retried; the error state's recovery action only
refetches status and run, never reissues start or resets the flag, and the screen returns to the
same error state. The learner reaches a dead end before any instruction.
Exclusion check (pending computation): item, scoring, feedback, and repair-graph bytes are C05's
adjacent deciding facts; each locator and hash must be byte-identical across the pair. Blocked for
gold because the desktop, 375 px, and 320 px branch captures, request logs, and focus captures do
not exist.

**`LQA-X06-B02` — BOUNDARY · CANDIDATE · hypothesized `PASS` · actual `BLOCKED`**
Source kind `SYNTHETIC_SINGLE_TRANSFORM`; `DESIGN_ONLY`; inspection `PRESENT`; adjudication
`NOT_REVIEWED`; supersedes `LQA-X06-B01`.
One transform: from the failed source-shaped control, change only the recovery contract from the
inert retry to an explicit, truthfully labelled return-to-curriculum transition.
Deciding fact: in-place retry is absent, but the branch returns control safely and claims no
unearned progress. This locates the line between a dead end and an honest exit.

**Corroborating source observations (not anchors).** (a) L1 pause and resume with a
definition-hash-checked restore preserves the authoritative checkpoint
(`services/lambdas/learner-api/src/vector-lesson-runtime.ts:1564-1660`;
`services/lambdas/learner-api/src/vector-lesson-runtime.test.ts:487-510`); its real-browser
interruption evidence is absent. (b) L2's post-repair branch terminates honestly as blocked,
states that progress is saved, and returns to the curriculum
(`services/lambdas/learner-api/src/normalized-lesson-runtime.ts:259`, `:280-300`;
`apps/learner-web/src/screens/CatalogLesson.tsx:254-267`); it is retired as an anchor because that
branch is pedagogically incomplete under C05 and therefore not isolated.

---

## 7. Rollup

Every cell below is a **candidate**. The verdict shown is
`hypothesized_verdict_under_complete_evidence`; `actual_verdict_on_available_evidence` is
`BLOCKED` for all thirty-six (§2.1), and `pair_runnable` is `false` for all twelve pairs (§2.3).

| Dimension | `CLEAR_PASS`              | `CLEAR_FAIL`              | `BOUNDARY`                   | Pair matched |
| --------- | ------------------------- | ------------------------- | ---------------------------- | ------------ |
| LQR-C01   | `LQA-C01-P02` · hyp. PASS | `LQA-C01-F01` · hyp. FAIL | `LQA-C01-B01` · hyp. BLOCKED | yes          |
| LQR-C02   | `LQA-C02-P02` · hyp. PASS | `LQA-C02-F02` · hyp. FAIL | `LQA-C02-B01` · hyp. PASS    | yes          |
| LQR-C03   | `LQA-C03-P03` · hyp. PASS | `LQA-C03-F03` · hyp. FAIL | `LQA-C03-B02` · hyp. PASS    | yes          |
| LQR-C04   | `LQA-C04-P02` · hyp. PASS | `LQA-C04-F01` · hyp. FAIL | `LQA-C04-B01` · hyp. PASS    | yes          |
| LQR-C05   | `LQA-C05-P02` · hyp. PASS | `LQA-C05-F01` · hyp. FAIL | `LQA-C05-B02` · hyp. PASS    | yes          |
| LQR-C06   | `LQA-C06-P02` · hyp. PASS | `LQA-C06-F02` · hyp. FAIL | `LQA-C06-B01` · hyp. BLOCKED | yes          |
| LQR-X01   | `LQA-X01-P02` · hyp. PASS | `LQA-X01-F02` · hyp. FAIL | `LQA-X01-B01` · hyp. PASS    | yes          |
| LQR-X02   | `LQA-X02-P02` · hyp. PASS | `LQA-X02-F02` · hyp. FAIL | `LQA-X02-B02` · hyp. FAIL    | yes          |
| LQR-X03   | `LQA-X03-P01` · hyp. PASS | `LQA-X03-F02` · hyp. FAIL | `LQA-X03-B01` · hyp. PASS    | yes          |
| LQR-X04   | `LQA-X04-P02` · hyp. PASS | `LQA-X04-F02` · hyp. FAIL | `LQA-X04-B02` · hyp. PASS    | yes          |
| LQR-X05   | `LQA-X05-P02` · hyp. PASS | `LQA-X05-F02` · hyp. FAIL | `LQA-X05-B02` · hyp. FAIL    | yes          |
| LQR-X06   | `LQA-X06-P02` · hyp. PASS | `LQA-X06-F01` · hyp. FAIL | `LQA-X06-B02` · hyp. PASS    | yes          |

Counts across the 36 candidates:

- `hypothesized_verdict_under_complete_evidence`: 20 `PASS`, 14 `FAIL`, 2 `BLOCKED`. **None of
  these is a label, an expected verdict, or a claim about a real lesson.**
- `actual_verdict_on_available_evidence`: **36 `BLOCKED`**, derived mechanically from the absence
  of `RECEIPTS_COMPLETE` on every record.
- `pair_runnable`: **0 true, 12 false.** No pair can be run today.
- `lifecycle_state`: 36 `CANDIDATE_PENDING_REVIEW`. `human_verdict` and `gold_verdict` are null on
  all 36. `review_receipts` is empty on all 36.
- `source_inspection_status`: 36 `PRESENT`.
- `adjudication_evidence_status`: 12 `BLOCKED`, 24 `NOT_REVIEWED`, **0 `RECEIPTS_COMPLETE`**.
- `materialization_status`: 13 `SOURCE_OBSERVABLE`, 23 `DESIGN_ONLY`.
- Independent pre-adjudication reviewer agreement recorded: **0 of 12 dimensions.**
- Calibration runs executed: **0.** Agreement, false-pass, and repeatability figures: **none
  measured.**

Because no record is `RECEIPTS_COMPLETE` and no pair is runnable, **no record is eligible for a
gold verdict and none may be used to calibrate or gate anything.**

---

## 8. Materialization checklist

Before any record here becomes a usable calibration case:

1. Freeze the exact source excerpt and the neutralized control; record lesson and source hashes,
   plus the application commit, build identifier, canonical `route`, `runtime_kind: vector |
normalized`, and `build_environment: PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD |
PROTOTYPE` for code-sourced records.
2. Generate fail and boundary variants from declarative transforms, not manual copy editing.
3. Assert a one-row semantic diff and reject any undeclared second fact.
4. Run structural and security prerequisites. A transform that fails a prerequisite is not an
   anchor.
5. Capture the dimension's required evidence, then **compute** each record's exclusion check:
   hash the adjacent dimension's deciding fact in both variants and confirm the two hashes are
   identical. The prose exclusion notes in §6 are intent, not results.
6. Set `pair_runnable: true` only once both variants exist, are hashed, and carry the evidence the
   dimension requires. Until then the pair cannot enter a run.
7. Keep the anchor ID, `case_kind`, `dimension_id`, both verdict fields, and any eventual human
   verdict outside judge input. Mint a single-use `ocid-<32 hex>` per run and hold the mapping
   controller-side.
8. Randomize pair and case order; never pass a catalogue ID through as a case ID.
9. Collect independent required-role receipts against the exact hashes, and record each reviewer's
   verdict **before** they see any other reviewer's, so pre-adjudication agreement is measurable.
10. Record disagreements without averaging; unresolved cases stay `CANDIDATE_PENDING_REVIEW`.
11. Score only the anchor's own dimension. Record the other eleven judge verdicts as
    `RECORDED_UNSCORED`.
12. Report false passes, false failures, boundary errors, repeatability, and agreement by
    dimension. Enforcement waits on owner-set acceptance criteria — the minimum cases per dimension
    per case kind and the required pre-adjudication agreement — set before the run, not after
    (rubric §8.4).

Per-example adjudication uses
[`lesson-quality-calibration-worksheet.md`](./lesson-quality-calibration-worksheet.md); blind
running uses [`lesson-quality-judge-protocol.md`](./lesson-quality-judge-protocol.md).

---

## 9. Rights and source-use status

Every record in this version derives from internal repository artifacts, internal application
code, or synthetic transforms of them. **No record contains third-party material, and no
substantial verbatim text from any commercial prep source appears here.**

The Kaplan lesson-book review
([`kaplan-analysis.md`](./lesson-quality-sources/kaplan-analysis.md)) contributed calibration
observations only — structural patterns, strengths, anti-patterns, and page references. It
produced no anchor, and none of its content is reproduced. Retired app-native preview lessons
contributed structural patterns only; their item text, passages, diagram labels, and feedback prose
are not reusable.

Any future external example must satisfy rubric §9.2 before admission: a recorded copyright
holder and provenance, a permission basis with receipt, per-use permission status, excerpt
boundaries, a `RIGHTS_REVIEWER` decision of `PERMITTED`, `source_kind:
DERIVED_EXTERNAL_OBSERVATION`, and pairing with an internal or synthetic control so calibration
never depends on material that cannot be stored.

---

## 10. Machine-fixture synchronization

The machine fixture at `tests/evals/lesson-quality/anchors/` remains at `0.1-draft` and **does not
match this catalog.** Twenty-four candidate slots changed; the fixture still holds the superseded
records, and its schema uses the single `current_evidence_status` field that rubric §8.2 replaced
with two statuses.

Regenerating the fixture is an implementation task outside this documentation rewrite. Until it
happens, treat this catalog as authoritative for candidate content and the fixture as a stale
snapshot. Neither is calibration authority: the fixture caps review receipts at zero, so no record
in that schema version can ever be promoted within it.

---

## 11. Known gaps and required human decisions

- **Product/pedagogy policy calibration is complete, but anchor adjudication is not.** The owner
  approved all 12 proposed pass/fail/boundary lines. No exact-input anchor receipt is complete,
  and all missing specialist, fixture, hash, and rendered-evidence requirements remain blocking.
- **X05 cannot pass without a real Safari + VoiceOver receipt** from someone other than the primary
  author. Automated scanning detects only part of the applicable criteria and never substitutes.
- **Two construct decisions are genuinely open** and are recorded as `BLOCKED` rather than guessed:
  the C01 graph-scale construct scope, and the C06 formula-to-system depth boundary.
- **The X02 pass control needs a focused lesson shell mode that does not exist**, so both X02 clear
  cases stay designs until that capability is built.
- **Route applicability is unproven.** `PREREQUISITE_SUPPORT` has neither an implemented route nor
  an authoritative absence proof for any current lesson, which blocks lesson-level approval
  independently of every record here.
- **No application commit or build identifier is pinned** for the thirteen code-sourced records.
- **The 48 CSS px product-target boundary has no anchor** and needs real geometry measurements
  before one can be written.
