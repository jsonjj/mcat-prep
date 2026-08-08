# Judge Consistency and Adversarial Robustness Review

**Review date:** 2026-08-03
**Scope:** rubric v0.9; anchor catalog v0.9-candidate; author protocol v0.2; judge
protocol v0.2 and its embedded Draft 2020-12 JSON Schema; evidence protocol v0.1;
calibration worksheet v0.2; autonomous-authoring context v0.2; and the legacy
machine anchor fixture/schema.
**Review mode:** read-only. This review edited no canonical document.

## Verdicts

- **Spec-compliance verdict: FAIL.** The active documents contain two irreconcilable
  contracts: a `dimension_result` is defined as *exactly* ten fields while the author
  and judge contracts require three additional fields, and the judge is required to
  return `human_decision: null` while the rubric says an awaited required human role
  yields `BLOCKED`.
- **Adversarial-robustness verdict: FAIL.** The prose has useful protections, but the
  normative output schema and an unspecified future controller can accept
  schema-valid records that omit a route, reverse precondition precedence, double-count
  a defect, use a candidate as calibration input, or echo protected content.

These are document-contract findings, not lesson-quality verdicts.

## Verification performed

1. Parsed the embedded judge schema with Ajv 8.20.0 (Draft 2020-12).
2. Confirmed that it rejects `REVISE`, non-null judge `human_decision`, visible expected
   labels, and an array with fewer than 12 dimensions.
3. Confirmed that it accepts all of the following **schema-valid but
   protocol-invalid** counterexamples:
   - four `STANDARD` route-proof records and no other route;
   - `preconditions.verdict: BLOCKED` with all twelve dimensions and the overall result
     set to `PASS`;
   - `FAIL` with no blocking finding;
   - `PASS` with an unsupported, `origin: NONE` entry in `blocking_findings`;
   - calibration mode with `case_id: "LQA-C01-P02"` and
     `anchor_set_version: "0.9-candidate"`;
   - arbitrary `route` and `runtime_kind` strings;
   - the same blocking defect represented as blocking findings in two dimensions; and
   - a synthetic protected-content marker in `summary`.
4. Verified that local links in the seven active documents resolve and that every
   machine-detected `rubric §N` reference points to an existing rubric section.
5. Validated the legacy anchor fixture against its own schema. It is structurally valid
   but is still `anchor-set 0.1-draft` / `rubric 0.4`, as the active catalog correctly
   documents.

The counterexamples prove schema coverage gaps. They do not mean a judge following all
of the prose would be compliant when emitting them; findings C-01 and C-02 show that
the prose itself also makes full compliance impossible in important cases.

## Critical findings

### C-01 — The fixed `dimension_result` is incompatible with the required judge output

**Evidence.** Rubric §2.3 and author protocol §2.3 both say that every recorded
`dimension_result` uses *exactly* ten fields:

`dimension_id`, `applicability`, `evaluation_verdict`, the two finding arrays,
`evidence_refs`, `blocker_refs`, `required_remediation`, `required_human_roles`, and
`human_decision`.

The judge schema instead requires three more top-level fields for every dimension:
`criteria_assessed`, `rationale`, and `uncertainty` (judge protocol §8). The author
self-audit similarly adds `criteria_checked` and `uncertainty` while calling the
record a `dimension_result`.

Therefore a schema-valid judge result has thirteen dimension fields and violates the
rubric's exact fixed contract. Removing the three fields to satisfy the rubric makes
the schema invalid. This also leaves uncertainty simultaneously required by the judge
and absent from the canonical result contract.

**Exact fix.** Choose and version one of these shapes:

1. Preserve the ten-field result exactly and make the schema use an envelope:
   `dimensions[].result` for the ten fields and
   `dimensions[].analysis` for `criteria_assessed`, `rationale`, and `uncertainty`; or
2. Add the three fields to the rubric's canonical `dimension_result`, define their
   vocabulary and verdict implications there, and update all four companion documents
   together.

Do not leave one document calling the record “exactly ten fields” while another
normatively requires thirteen. Re-pin the rubric and protocol hashes after the
decision.

### C-02 — Human-gate semantics make `PASS`, `BLOCKED`, and recommendation status conflict

**Evidence.**

- Rubric §2.2 says a dimension is `BLOCKED` when it is awaiting a required human role.
  The role matrix requires human roles for every dimension, including two independent
  blind-solver receipts for C01 and C04.
- Rubric §2.4 withholds lesson-level quality approval while a required human role has
  no decision.
- The judge schema requires both root and per-dimension `human_decision: null`, and
  judge protocol §10 says the judge must always emit null.
- Judge protocol §2.1 says `overall_recommendation` follows rubric §2.4 but omits
  absent human decisions from its aggregation formula. Author protocol §7, by contrast,
  says absent required human decisions force the overall result to `BLOCKED`.

Ajv accepted an all-`PASS`, overall-`PASS` result with every
`required_human_roles` array empty and every `human_decision` null. Even if role arrays
were populated, the current text does not say whether a judge may recommend `PASS`
before the required human receipt exists.

**Exact fix.** Split the concepts and make their relationship explicit:

- `judge_recommendation`: the model's evidence-based `PASS | FAIL | BLOCKED`;
- `human_gate_status`: `PENDING | SATISFIED | BLOCKED`, with the required roles,
  receipt counts, and receipt references; and
- `lesson_approval_status`: never `PASS` while a required human gate is pending.

Alternatively, if human evidence is a precondition for a judge recommendation, require
all affected dimensions to be `BLOCKED` until the receipt is supplied. In either design,
make the rubric, author protocol, judge aggregation rule, worksheet, and schema use the
same rule. A role name array is insufficient for C01/C04 because it cannot express two
independent blind-solver receipts.

### C-03 — The schema cannot prove the four-route applicability contract

**Evidence.** Rubric §3.2 makes the four-route structural proof record the sole
applicability authority. Judge schema §8 uses an array constrained only to exactly four
items. It does not require one each of `STANDARD`, `CONCISE`, `MISCONCEPTION`, and
`PREREQUISITE_SUPPORT`; it permits four duplicates. It also permits:

- `NOT_APPLICABLE` with no `absence_proof_ref` and no evidence;
- `BLOCKED` with no `blocker_ref`; and
- an empty proof-evidence array for every state.

The tested four-`STANDARD` counterexample validated. In addition,
`evaluation_identity.route` and `runtime_kind` are arbitrary strings or null, whereas
the evidence protocol defines the route and runtime vocabularies.

**Exact fix.** Represent route proofs as an object with four required, named properties
rather than an unconstrained array. For each route:

- require a non-empty authoritative absence proof and evidence reference for
  `NOT_APPLICABLE`;
- require a non-empty blocker and evidence reference for `BLOCKED`; and
- require evidence references for `APPLICABLE`.

Restrict the identity route to the four canonical values (or a documented all-routes
value) and `runtime_kind` to `vector | normalized`. Add controller checks that every
route proof resolves in the manifested structural record and that the overall result
honors a missing or blocked required route.

### C-04 — Blind calibration is fail-closed only in prose

**Evidence.** The hidden-anchor protocol correctly requires opaque case IDs and
`GOLD_APPROVED` anchors. The schema nonetheless permits
`mode: CALIBRATION`, a label-bearing ID such as `LQA-C01-P02`, and the current
candidate-only anchor-set version. It has no field that binds a run to a
`GOLD_APPROVED` record, completed receipts, an eligible fixture, or a controller-held
mapping. `expected_label_visible: false` and `label_exposure_detected: false` are
model-emitted assertions, not proof of isolation.

This is especially risky because the legacy fixture remains structurally valid at an
evaluator-input path with `0.1-draft`, rubric `0.4`, candidate records, and
label-bearing IDs. The catalog documents that state accurately, but documentation does
not make a future controller reject it.

**Exact fix.** Make calibration eligibility a trusted controller precondition, not a
judge claim:

1. Before invoking a model, reject every candidate-only schema/version and require a
   controller-verified `GOLD_APPROVED` anchor record with
   `RECEIPTS_COMPLETE`.
2. Generate a random opaque case token that matches a restrictive format and never
   send an anchor ID, case kind, lifecycle state, proposed verdict, or gold rationale.
3. Keep the token-to-label mapping outside model context and score only immutable,
   schema-valid output.
4. Detect label exposure from the input construction and from a post-output scan;
   invalidate the run regardless of the model's boolean.

Until that controller exists, reject `CALIBRATION` mode entirely rather than relying on
the model to recognize that `0.9-candidate` is ineligible.

## Important findings

### I-01 — Verdict, finding, and evidence invariants are not encoded completely

**Evidence.** The schema permits `FAIL` with no blocking finding, `BLOCKED` with no
blocker reference or material uncertainty, and a finding with no evidence reference.
It also permits `origin: NONE` in a blocking array, arbitrary `owner_role` text, and
arbitrary criterion strings. The protocol lists some controller checks, but omits
several inverse conditions and provides no complete, testable validator contract.

**Exact fix.** Add direct schema constraints where possible and specify the remaining
controller rules exhaustively:

- `FAIL` requires at least one blocking finding; a non-empty blocking array requires
  `FAIL`.
- `PASS` and `BLOCKED` require an empty blocking array.
- `BLOCKED` requires a non-empty blocker reference, material uncertainty, a reason,
  and the evidence or human input needed to resolve it.
- Every emitted finding requires at least one resolved evidence reference; remove
  `NONE` from emitted findings and reserve it for absence of a finding.
- Restrict `owner_role` to the canonical role vocabulary and define stable criterion
  IDs rather than accepting free text.
- A `preconditions: BLOCKED` record must force all 12 dimensions and the overall
  lesson-level state to the documented blocked disposition.

The controller must additionally resolve every reference against the input manifest,
check identity equality, and test these cases in CI before any enforcement discussion.

### I-02 — The one-root-defect rule has no representable or checkable lineage

**Evidence.** Rubric §5 says each root defect has one owner and dependent dimensions
may only record non-counting cross-references. Neither the fixed result contract nor
the finding schema contains a root-cause ID, primary-owner dimension, or
cross-reference field. The tested duplicate-root example therefore validates as two
independent blocking findings.

**Exact fix.** Add `root_cause_id`, `owner_dimension_id`, and
`finding_disposition: PRIMARY | NON_COUNTING_CROSS_REFERENCE` to the finding contract.
A cross-reference must name the primary finding and cannot be stored in
`blocking_findings`. Validate that a root-cause ID has one primary blocking owner per
evaluation and surface any disputed grouping for human adjudication.

### I-03 — Prompt injection and protected-content controls are not enforceable at the output boundary

**Evidence.** Judge protocol §3 and the system-prompt template correctly label all
lesson and evidence text untrusted, prohibit tool use, and prohibit disclosure. The
schema, however, permits arbitrary text in `summary`, `rationale`, `description`,
`criterion_ref`, `locator`, and `supports`. It has no general contamination record;
only a calibration-specific, model-reported label flag exists. The synthetic
protected-marker `summary` validated.

**Exact fix.** Use opaque evidence IDs and controlled, non-answer-bearing finding
templates in model output. Have the controller perform an output DLP/protected-token
scan against the protected reviewer packet before accepting JSON. Add a structured
`input_integrity_events` record with only opaque evidence references and a safe
classification (`PROMPT_INJECTION`, `LABEL_EXPOSURE`, or
`PROTECTED_BOUNDARY_VIOLATION`), never a quoted payload. Any such event must create a
controller-side blocked/invalid evaluation record.

Also add explicit model-prompt nonclaims: the judge must not infer or report mastery,
evidence/BKT eligibility, learning, efficacy, readiness, score improvement, rights
clearance, release safety, or approval from a rubric recommendation.

### I-04 — Version and revision pins are descriptive echoes, not verified bindings

**Evidence.** The judge prompt asks the model to compare repeated identity fields with
trusted context, but the schema accepts arbitrary rubric paths/versions, SHA-shaped
but unrelated hashes, arbitrary route/runtime strings, and null build/evidence identity
fields. The schema also accepts `preconditions: BLOCKED` together with all dimension
and overall `PASS` values.

**Exact fix.** Let the controller construct and retain a single immutable evaluation
envelope. Stamp its trusted IDs and hashes into the accepted result after validation, or
compare every model-emitted value byte-for-byte with that envelope. Use schema constants
for current static values (`0.9`, `0.2`) and controller equality checks for dynamic
hashes. If identity cannot be established, reject the model output as a global
precondition block rather than accepting a self-described record.

### I-05 — The active handoff documents disagree about available evidence and required input

**Evidence.**

- Rubric §10 says that a dedicated evidence and harness protocol “does not exist yet,”
  while `lesson-quality-evidence-protocol.md` exists and every companion document
  identifies it as the detailed evidence authority.
- Autonomous context §5 says its source packet is the same shape as author protocol
  §4 and feeds it directly, but it omits the author protocol's required
  `route_proofs[]` entries (including absence/blocker references). It also omits
  `source_records[]`, the rubric path/version/hash, `output_directory`, and
  `max_revision_cycles`.

An agent following the context literally can therefore create a packet that the author
protocol says blocks lesson-level review.

**Exact fix.** Update rubric §10 to name the evidence protocol as the current
documentation-only detail contract and leave only the harness implementation as open.
Make the autonomous source-packet definition a strict superset of the author input
contract: add route proofs for all four routes, source/right records, rubric identity,
the draft-output location, revision budget, and the other required immutable fields.
Link the context directly to the role matrix for its separate role and receipt
requirements.

## Minor finding

### M-01 — The future judge controller has no explicit bounded schema-repair policy

The author revision loop is correctly finite (`max_revision_cycles`, default three).
The judge protocol says invalid output creates a blocked record outside judge output,
but it does not define whether a future controller may retry malformed JSON or how
many attempts it may make. A future implementation could turn output repair into an
unbounded prompt loop.

**Exact fix.** Set `max_judge_attempts` and `max_schema_repair_attempts` in the
controller contract (for example, one initial attempt and at most one formatting-only
repair with unchanged manifested input). Persist every attempt, then stop with a
controller-side blocked record. Never re-run with altered evidence, hidden labels, or
changed rubric bytes under the same evaluation ID.

## Controls that are already sound

- The active prose consistently distinguishes `evaluation_verdict`,
  `route_applicability`, and `runtime_terminal_disposition`.
- The written result precedence is clear: `FAIL > BLOCKED > PASS`.
- Candidate anchors are repeatedly described as non-gold and the catalog explicitly
  documents the legacy fixture mismatch.
- The schema prevents `REVISE`, requires exactly 12 dimension array entries, disallows
  non-null judge human decisions, and rejects a declared visible expected label.
- The author revise loop is finite and stops on `BLOCKED`.

Those controls should be retained when the conflicting contracts and controller
validation gaps are resolved.

---

## 2026-08-03 — Targeted re-review of v0.9.1 / protocol v0.3 corrections

**Scope.** Live rubric `0.9.1`, anchor catalog `0.9.1-candidate`, author protocol
`0.3`, judge protocol `0.3` and its embedded Draft 2020-12 schema, evidence protocol
`0.2`, worksheet `0.3`, and autonomous context `0.3`.

### Fresh verdicts

- **Spec-compliance verdict: FAIL.** The correction wave resolves the earlier
  ten-field, human-gate, route-object, source-packet, and bounded-attempt conflicts.
  Two active cross-contract contradictions remain: the schema redefines
  `runtime_kind`, and a one-route judge record still emits a lesson-level verdict.
- **Adversarial-robustness verdict: FAIL.** The live schema rejects the prior
  duplicate-route, malformed-`FAIL`, blocked-precondition/pass, label-bearing-case-ID,
  and widened-result attacks. It still accepts material uncertainty with `PASS`, a
  globally unpinned rendered build marked preconditions-met, protected text in output,
  and a model-asserted calibration attestation.

Candidate-only status, zero gold anchors, and refusal of calibration before a trusted
controller exists are correctly fail-closed states, not findings.

### Fresh verification

Ajv 8.20.0 parsed and compiled the **live embedded v0.3 schema**. It rejected:

- an array-shaped or duplicate-route proof structure;
- global `preconditions: BLOCKED` with all dimensions passing;
- `FAIL` with no blocking finding;
- a label-bearing `LQA-C01-P02` calibration case ID; and
- a widened result object with analysis fields added inside the ten-field `result`.

It accepted these remaining counterexamples:

- `PASS` plus `analysis.uncertainty.material: true`;
- `judge_recommendation.lesson_verdict: PASS` with one dimension `BLOCKED`;
- null application commit/build ID while `preconditions.verdict: MET` and all rendered
  dimensions pass;
- a synthetic protected marker in `summary`;
- a valid-format opaque calibration ID plus all-true `controller_verification`; and
- duplicate dimension IDs and duplicate `PRIMARY` findings for one `root_cause_id`.

The last two are explicitly delegated to the controller by judge protocol §8.1; there
is no controller today, so they remain an honest implementation hold rather than a
claim of protection. All local links in the seven active documents and every
machine-detected `rubric §N` reference resolved.

### Corrections verified

- Rubric §2.3 / §2.5 and judge schema §8 now preserve an exact ten-field
  `dimensions[].result` and move criteria, rationale, and uncertainty into
  `dimensions[].analysis`.
- Rubric §2.4 now separates `lesson_verdict`, `human_gate_status`, and
  `approval_withheld`; decision-role absence no longer makes every dimension
  unreachable as `PASS`.
- Route proofs are a four-member named object with state-specific proof requirements;
  the prior four-`STANDARD` attack is rejected.
- Findings now carry stable criterion IDs, canonical owner roles, and root-cause
  fields; the controller contract explicitly recomputes lineage.
- The source packet is now a documented strict superset of the author input contract,
  and judge repair is bounded to one initial attempt plus one formatting-only repair.
- Current anchors honestly state `actual_verdict_on_available_evidence: BLOCKED`, are
  unrunnable, and are excluded from calibration.

### Remaining findings

#### Critical R-01 — `runtime_kind` has incompatible meanings in the live contract

Judge protocol §2.2 says `runtime_kind` is `vector | normalized`, matching evidence
protocol §2 and its evidence receipts. The live judge schema instead permits only
`PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD | PROTOTYPE`. Those are deployment or
build environments, not runtime kinds. No output can satisfy both the schema and the
documented evidence identity vocabulary.

**Exact fix:** retain `runtime_kind: vector | normalized` in the schema and add a
separate `build_environment` enum for production/staging/local/prototype. Update the
immutable evaluation envelope and every receipt shape to carry both fields, then have
the controller compare both to manifested evidence.

#### Critical R-02 — A one-route judge output cannot truthfully emit `lesson_verdict`

Rubric §3.1 correctly establishes one evaluation per applicable route and a separate
`lesson_rollup` containing all route evaluations. Judge protocol §2.1.1 and its schema
nevertheless call the result of one route's twelve dimensions
`judge_recommendation.lesson_verdict`. If `STANDARD` passes while `CONCISE` later
fails, the standard-route record can still emit `PASS`; it has no concise dimension
results from which to calculate a lesson verdict.

**Exact fix:** rename the judge-output field to `route_verdict` and derive it only from
the evaluation's named route. Define `lesson_verdict`, `human_gate_status`, and
approval blockers exclusively in a trusted controller-generated `lesson_rollup` after
one valid evaluation exists for every `APPLICABLE` route. Do not let a model-issued
single-route result claim the lesson aggregate.

#### Important R-03 — Material uncertainty can still validate as `PASS`

Rubric §2.5 and judge protocol §5 say material uncertainty yields `BLOCKED` unless a
separate blocking defect yields `FAIL`. The schema enforces material uncertainty for a
`BLOCKED` result, but has no reverse conditional. The tested result with
`evaluation_verdict: PASS` and `analysis.uncertainty.material: true` validated.

**Exact fix:** add a schema conditional (and controller recomputation) requiring
`evaluation_verdict: BLOCKED` whenever material uncertainty is true and there is no
blocking finding. Permit material uncertainty with `FAIL` only when a demonstrated
blocking finding is present.

#### Important R-04 — Null build identity is not wired to the global precondition

Rubric §7.1 requires a null application commit or build ID to block every rendered
dimension. The live schema permits both fields to be null with
`preconditions.verdict: MET`, a `PASS` lesson recommendation, and passing `LQR-X*`
dimensions. Controller §8.1 checks equality but does not explicitly require null
rendered identity to create `APPLICATION_IDENTITY_NULL`.

**Exact fix:** either make application commit and build ID non-null for every
twelve-dimension evaluation, or add a root schema/controller rule that any null
rendered identity forces `preconditions: BLOCKED` with
`APPLICATION_IDENTITY_NULL`, which in turn blocks all twelve dimensions.

#### Important R-05 — Protected-output handling is not yet fail-closed

`input_integrity_events` safely excludes a payload, which is an improvement. However,
the schema still accepts protected text in `summary`, `rationale`, and finding
`description`. Judge protocol §8.1's “protected-output scan” lists labels, gold
rationale, candidate IDs, and case kinds, but not protected keys, scoring rules, or
private rationales. Its integrity-event disposition voids label and identity events,
but does not say that `PROTECTED_CONTENT_EXPOSURE` voids the run or forces the global
precondition block.

**Exact fix:** require the controller's output scan to cover protected reviewer-packet
tokens and protected semantic fragments as well as label material. Treat
`PROTECTED_CONTENT_EXPOSURE` as a run-voiding global precondition failure; retain only
its opaque evidence reference in the external blocked record.

#### Important R-06 — `controller_verification` is schema-valid model output, not proof

A future calibration output can contain all-true `gold_anchor_verified` and
`receipts_complete_verified` with an arbitrary attestation reference, and the schema
accepts it. The prose correctly requires a controller to reject calibration before
model invocation today, so this is not permission to calibrate against candidates.
It is nevertheless unsafe to treat a value the model emitted as the controller's
attestation.

**Exact fix:** remove `controller_verification` from model-generated JSON or have the
controller overwrite/stamp it only after independently verifying the gold record and
receipts. The model should receive only the opaque case token; no output field should
be interpreted as proof that controller checks occurred.

#### Minor R-07 — Approval blockers and non-required dimension verdicts remain underconstrained

The schema accepts `approval_withheld: true` with an empty `approval_blockers[]`, even
though rubric §2.4 requires blockers to name the unresolved condition. It also accepts
a `NOT_REQUIRED_WITH_PROOF` dimension with `FAIL`, allowing a non-required result to
drive `ANY_REQUIRED_DIMENSION_FAIL` unless the controller recomputation catches it.

**Exact fix:** require at least one approval blocker whenever approval is withheld in a
judge record, including a `JUDGE_HAS_NO_APPROVAL_AUTHORITY` blocker kind. Define
`NOT_REQUIRED_WITH_PROOF` as a non-scoring outcome with a constrained verdict, and
make rollup recomputation ignore it by construction.

### Re-review conclusion

The correction wave removed the original structural contradictions and materially
improved fail-closed behavior. It is not ready to be described as internally compliant
or adversarially robust until R-01 through R-06 are resolved and the specified
controller validations exist. Calibration remains correctly unavailable, and no
candidate is treated as gold.

---

## 2026-08-03 — Final targeted gate review after bounded corrections

**Scope.** Re-extracted the live embedded judge schema from protocol `0.3` and tested
R-01–R-07 against rubric `0.9.1`, the author/evidence protocols, worksheet, anchors,
and autonomous context. This section supersedes the prior re-review verdicts for those
findings.

### Final verdicts

- **Spec-compliance verdict: PASS (documentation contract).** The bounded corrections
  resolve R-01–R-07 and align the active rubric, judge, author, evidence, worksheet,
  anchor, and context contracts.
- **Adversarial-robustness verdict: PASS (documented controller design).** The schema
  rejects model-owned counterexamples where JSON Schema can decide them. For
  controller-only facts — DLP scanning, protected-content handling, provenance, and
  calibration eligibility — the documents explicitly require a trusted controller,
  prohibit unsupported claims, and fail closed until one exists.

This does **not** claim that a judge service, controller, calibration harness, or
enforcement gate is implemented. Their absence remains the stated, honest scope
boundary; no candidate anchor is treated as gold or calibration-ready.

### Strict schema gate evidence

Ajv 8.20.0 strictly compiled the re-extracted live Draft 2020-12 schema. A conforming
raw one-route record validated. The following adversarial cases were rejected:

- **R-01 runtime/build vocabulary:** `runtime_kind: PRODUCTION_BUILD` is invalid;
  `runtime_kind` is now exactly `vector | normalized` and `build_environment` is a
  distinct required enum across the rubric, evidence protocol, and judge schema.
- **R-02 aggregation boundary:** a model-added `lesson_verdict` is rejected by
  `additionalProperties: false`; the model emits only `route_verdict`. The rubric
  reserves `lesson_rollup`, human gates, and approval blockers for a complete trusted
  controller rollup.
- **R-03 uncertainty:** a `PASS` dimension with material uncertainty is rejected.
- **R-04 identity:** null application commit/build IDs without a stamped
  `APPLICATION_IDENTITY_NULL` controller block are rejected; a controller-blocked
  record with passing dimensions is also rejected.
- **R-06 attestation:** a model-added `controller_verification` field is rejected.
  Gold/receipt verification and attestation now remain controller-side.
- **R-07 approval and applicability:** model-added approval fields are rejected, and
  `NOT_REQUIRED_WITH_PROOF` combined with `FAIL` is rejected; the normalized
  non-scoring result is `PASS`.

**R-05 is necessarily controller-enforced, not schema-enforced.** A synthetic protected
marker in the free-text `summary` still validates as raw JSON; JSON Schema cannot
perform DLP or semantic protected-content detection. Judge protocol §§3 and 8.1 now
require the trusted controller to scan every free-text field, void the run on
`PROTECTED_CONTENT_EXPOSURE`, retain only an opaque integrity reference, and stamp a
global blocked record. That separation is explicit and does not rely on a
model-reported event.

### Regression spot-checks

The live schema also rejected the previously corrected attacks: array/duplicate route
proofs, `FAIL` without a blocking finding, a label-bearing calibration case ID, and a
widened result object that violates the ten-field contract. A valid
controller-precondition stamp validated only as part of an accepted route record;
protocol §8.1 separately requires raw model-emitted controller fields to be stripped
and rejected before that stamp is applied.

All local links in the seven active documents resolved, and every machine-detected
`rubric §N` reference pointed to a live rubric section.

### Remaining findings

None in the documentation contract for R-01–R-07. Future implementation must execute
the controller checks specified in judge protocol §8.1 before accepting any route
record. Until it does, calibration and enforcement remain unavailable by design rather
than silently enabled.

---

## 2026-08-03 — GT-1 closure check

The GT-1 prose correction remains aligned with the live judge schema and rubric:
`applicability: BLOCKED` requires a named blocker, normalizes
`evaluation_verdict` to `BLOCKED`, and blocks `route_verdict`. It is never ignored;
only `NOT_REQUIRED_WITH_PROOF` is ignored after its normalized non-scoring `PASS`.

Fresh strict-Ajv checks rejected blocked applicability paired with either `PASS` or
`FAIL`, and rejected a `PASS` route verdict containing a blocked-applicability result.
They accepted the corresponding blocked dimension / blocked route result and an
absence-proved `NOT_REQUIRED_WITH_PROOF` / `PASS` result. The R-01–R-04, R-06–R-07
schema controls and prior duplicate-route / malformed-`FAIL` protections also remained
intact. R-05 remains explicitly controller-enforced: the live protocol still requires
protected-output scanning and a run-voiding global block, without claiming that such a
controller exists.

**Closure verdict: PASS (documentation contract).** No regression or remaining GT-1
documentation finding was observed.

---

## 2026-08-03 — Applicability-blocked derivation closure

The live embedded schema strictly compiled after adding
`ANY_DIMENSION_APPLICABILITY_BLOCKED`. A blocked-applicability dimension with normalized
`evaluation_verdict: BLOCKED` and that derivation correctly validated. The schema
rejected the same derivation paired with either route `PASS` or route `FAIL`, and also
rejected `ALL_REQUIRED_DIMENSIONS_PASS` where the route contains blocked applicability.

`ANY_REQUIRED_DIMENSION_BLOCKED` paired with route `BLOCKED` remains schema-valid for
the same result shape; the explicit controller recomputation in judge protocol §8.1
decides whether that label accurately describes a required-dimension block versus an
applicability block. This is an intentional cross-record semantic check, not a
schema-regression. R-01–R-07 and the prior duplicate-route / malformed-`FAIL` controls
remained intact.

**Closure verdict: PASS (documentation contract).**
