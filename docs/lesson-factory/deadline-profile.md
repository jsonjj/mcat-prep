# Lesson factory deadline profile

**Profile:** `lesson-factory-deadline-2026-08-03` version `2.2.0`
**Status:** frozen contract, no runner implemented
**Rubric authority:** [`key-docs/lesson-quality-rubric.md`](../../key-docs/lesson-quality-rubric.md) version `0.9.1`, pinned by exact hash
**Structural authority:** [`docs/design/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md`](../design/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md) (R1–R15)
**Mastery authority:** [`docs/lesson-evidence-mastery-contract.md`](../lesson-evidence-mastery-contract.md)

---

## 1. What this is, and what it is not

This is the machine-readable contract the 72-hour lesson factory writes against. It
defines one lifecycle status — `CANDIDATE_RUBRIC_SCREENED` — and the closed JSON
contracts that carry it from a frozen task packet through authoring, handoff,
packaging, and candidate import.

**Nothing here evaluates a lesson.** No judge, capture harness, screen runner, or CI
step is implemented by this work package. The contracts are frozen first precisely so
that the packet, author, judge, handoff, intake, and database packages that follow
cannot each invent their own spelling of an identity, a route proof, or a claim.

### `CANDIDATE_RUBRIC_SCREENED` is a lifecycle status

It says: every **hard machine screen** passed against one exact draft revision.

It never says the lesson passed the rubric, that a human approved it, that a release
was approved, or that anything about it is efficacious, mastery-calibrated, readiness-
validated, learner-validated, publication-safe, or published. Those nine nonclaims are
recorded as `false` in every contract in the set, and no document in the set has a
field that could carry a rubric verdict — the token `verdict` appears in no property
name anywhere, and a test enforces that.

The exhaustive list lives in
[`content/lesson-factory/deadline-profile/lifecycle-nonclaims.json`](../../content/lesson-factory/deadline-profile/lifecycle-nonclaims.json),
whose `never_asserts` block states each nonclaim in prose.

### The candidate lifecycle

```text
CANDIDATE_SCREEN_PENDING
  → CANDIDATE_RUBRIC_SCREENED   every hard machine screen returned PASS
  → CANDIDATE_SCREEN_FAILED     at least one returned FAIL
  → CANDIDATE_SCREEN_BLOCKED    at least one could not be executed or bound
```

A failed or blocked screen returns to `CANDIDATE_SCREEN_PENDING` only through a repair
and a re-screen at a new revision. A prior screen never carries forward.

---

## 2. Hard gates

Six machine screens are hard, fail-closed, and unwaivable. A ledger that records
`CANDIDATE_RUBRIC_SCREENED` while any of them is `FAIL` or `BLOCKED` is rejected by the
contract, not merely discouraged.

| Gate                      | What it screens                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `R1_R15_STRUCTURAL`       | R1–R15 validation is green for the exact draft revision, with no rule or pin weakened           |
| `NORMALIZATION`           | The lesson normalizes and every KC carries a runtime-servable micro-cycle (R15)                 |
| `SOURCE_RIGHTS`           | Every packet source record is `PERMITTED` with a receipt before extraction, storage, or use     |
| `PROTECTED_SEPARATION`    | Keys, scoring material, and private rationale stay server-only                                  |
| `HASH_CHAIN_INTEGRITY`    | Embedded content hashes match their canonical recomputation and chain upward (R3, R4, R5)       |
| `DEADLINE_MACHINE_SCREEN` | The deadline contract's own screens: four-member route proof, closed contracts, pinned identity |

A gate record says **which screen ran and which run produced the result** — a
`screen_code` from that closed set of six, and a `screen_ref` pinning the run's bytes. It
does not carry the command line. A command is a mapping from a screen to whatever
implements it this month, which is the runner's business; on a record it is a free-text
field with a technical name, and `pnpm answer-key-is-c` passes any check that looks at the
`pnpm` prefix. The code and the locator are cross-bound: a record filed under
`SOURCE_RIGHTS` must carry that code and a `screen:…/source-rights#sha256:…` locator, so a
record cannot claim one gate and cite the run of another. The same applies to the
handoff's `structural_validation`, which now cites the R1–R15 run instead of the command
that produced it.

---

## 3. Missing evidence stays BLOCKED

Six evidence classes have no receipts under this profile. Each is declared `BLOCKED`
with a named blocker and `normalization_to_pass_allowed: false`. The state enum is
`PRESENT | BLOCKED` — there is no `PASS`, `WAIVED`, `NORMALIZED`, or `NOT_APPLICABLE`
to escape into, and a `BLOCKED` class may carry no receipts at all.

| Evidence class         | Blocker code                              | Roles that would satisfy it                        |
| ---------------------- | ----------------------------------------- | -------------------------------------------------- |
| `BROWSER_RENDERED`     | `BLOCKER_NO_BROWSER_RENDERED_EVIDENCE`    | `PRODUCT_PEDAGOGY_OWNER`                           |
| `ACCESSIBILITY`        | `BLOCKER_NO_ACCESSIBILITY_REVIEW`         | `ACCESSIBILITY_REVIEWER`, `PRODUCT_PEDAGOGY_OWNER` |
| `DOMAIN_SME`           | `BLOCKER_NO_DOMAIN_SME_RECEIPT`           | `DOMAIN_CONSTRUCT_SME`, `INDEPENDENT_BLIND_SOLVER` |
| `NOVICE_WALKTHROUGH`   | `BLOCKER_NO_NOVICE_WALKTHROUGH_RECEIPT`   | `NOVICE_WALKTHROUGH_REVIEWER`                      |
| `PLATFORM_RELIABILITY` | `BLOCKER_NO_PLATFORM_RELIABILITY_RECEIPT` | `PLATFORM_RELIABILITY_REVIEWER`                    |
| `HUMAN_DECISION`       | `BLOCKER_NO_HUMAN_DECISION_RECEIPT`       | `PRODUCT_PEDAGOGY_OWNER`                           |

A blocker is a code from a closed list, not a `blocker:<slug>` reference. The reference
form was a pattern, and a pattern accepts any slug someone invents at runtime:
`blocker:the-answer-is-c` satisfied it as readily as `blocker:no-domain-sme-receipt`.

Because no browser evidence exists, no application commit or build id can be bound to
anything observed, which is the rubric's `APPLICATION_IDENTITY_NULL` condition: every
`LQR-X` dimension is unevaluated, not passing. Turning a class `PRESENT` requires
revision-bound receipts recorded by someone other than the primary author; the contract
enforces both flags.

---

## 4. Route policy: STANDARD only, with a four-member proof

The rubric route universe is exactly `STANDARD`, `CONCISE`, `MISCONCEPTION`, and
`PREREQUISITE_SUPPORT`. The route proof is an **object with exactly those four
members**, never a list: four entries named `STANDARD` satisfy any list-shaped
contract, and three entries look identical to four with one omitted. As an object, an
unconsidered route is a missing key.

Under
[`release-policy.json`](../../content/lesson-factory/deadline-profile/release-policy.json)
version `2.0.0`:

- `STANDARD` — `APPLICABLE`, with an evidence reference to the structural spec that
  establishes the lane exists. Both proof fields are null.
- `CONCISE`, `MISCONCEPTION`, `PREREQUISITE_SUPPORT` — `NOT_APPLICABLE`, each with an
  explicit `absence_proof_ref` naming one clause of this versioned policy, and
  `absence_proof_basis: VERSIONED_RELEASE_POLICY`.

The admissible bases are `VERSIONED_RELEASE_POLICY`, `STRUCTURAL_RECORD`, and
`CURRICULUM_AUTHORITY`. Reviewer opinion, an empty coverage row, and a runtime fallback
are deliberately absent from that enum, because rubric §3.2 says they are not absence
proofs.

### One scope code, everything else derived

Route scope is stated **once**, as `route_scope_code: STANDARD_ONLY`, in both the policy
and the receipt. Every other route-shaped field is derived from it by schema rule rather
than restated:

- `applicable_routes` must be exactly `["STANDARD"]`;
- all four `route_proofs.*.route_applicability` values are fixed;
- the receipt's `initial_release_routes` and all four `route_decisions.*.decision` values
  are fixed the same way;
- each absence proof must cite this policy, at **this version**, at the clause for **its
  own route** — the literal `policy:lesson-factory-deadline-release@2.0.0#clause:ROUTE_ABSENCE_CONCISE`
  and nothing else will satisfy the `CONCISE` proof;
- each `route_decisions.<ROUTE>.policy_clause_id` is likewise bound to its own route.

Independently of the scope code, a **membership biconditional** holds per route in both
files: a route appears in the list exactly when its proof (or the owner's decision) says
`APPLICABLE`, expressed with `contains` and `not`/`contains`. That rule survives scope
codes nobody has written yet.

The point of encoding this in the schema rather than asserting it against the shipped
values is the difference between "the file we shipped is consistent" and "no inconsistent
file can be written". Strict Ajv rejects every mismatched combination of list, proof map,
clause, and receipt decision; the two documents can then only disagree by carrying
different scope codes, which the reference resolver checks when it walks the chain. Adding
a scope means adding a code and its derivation, in review.

### The packet and the handoff work under the policy, not beside it

The derivation above is not the policy's private business. A task/source packet and a
lesson handoff each carry route proofs of their own, and until they were bound to the
policy a lane could be handed a packet authored for `CONCISE` while the frozen policy said
STANDARD-only, and both documents would validate: nothing connected them.

Both now carry `release_policy_ref`, `ratified_policy_version`, `route_scope_code`, and
`applicable_routes`, and both apply the same `RouteScopeBinding` the policy applies. So a
packet or a handoff that lists a route the policy excludes, proves one applicable, cites a
superseded policy version, cites another route's clause, or omits the policy reference
altogether is rejected by strict Ajv — by the same rule, written once.

**`release_policy_ref` is a literal, not a grammar.** For this deadline release there is
exactly one policy at exactly one digest, so `FrozenReleasePolicyRef` is a `const` carrying
both, and every consumer that names the policy — the profile, the assignment manifest, the
kit manifest, the packet, and the handoff — uses that const. A grammar cannot reject a
well-formed reference to a policy nobody ratified: the digest of a different frozen
artifact, a digest of nothing, the current bytes filed under a superseded locator, and the
right locator and digest under the wrong kind are all correctly shaped, and all four are in
the negative-case table.

**Each excluded route cites its own clause.** `PolicyAbsenceProofRef` used to accept
`policy:<any slug>@<any version>#clause:<ANY_NAME>`, which is the shape of a citation
rather than a citation. There are now three literals — `ConciseAbsenceClauseRef`,
`MisconceptionAbsenceClauseRef`, `PrerequisiteSupportAbsenceClauseRef` — each naming its
own route at the ratified version, and `AbsenceClauseRef` is the closed union of exactly
those three. There is no fourth value and no way to write one.

### Who decided this

The scope is **owner-ratified**. `policy_authority.decision_status` is `RATIFIED`, there
are no ratification blockers left, and `decision_ref` pins the bytes of
[`owner-route-policy-receipt.json`](../../content/lesson-factory/deadline-profile/owner-route-policy-receipt.json),
which records the `PRODUCT_PEDAGOGY_OWNER` decision of 2026-08-03.

**The receipt says what it decided in codes, not in prose.** `route_scope_code`,
`decision_basis_codes[]`, and `scope_limit_codes[]` are closed vocabularies; there is no
`decision_statement`, `decision_basis`, or `scope_limits` field, and no field of the
receipt accepts an unconstrained string. A decision field that accepts sentences accepts
"…and the lesson is approved", and prose sitting beside machine fields is eventually read
as though it governed them.

The owner's own words are kept, but deliberately outside the record that decides:
[`owner-route-policy-statement.md`](../../content/lesson-factory/deadline-profile/owner-route-policy-statement.md)
holds them verbatim, the receipt pins that file's bytes under
`decision_provenance.statement_sha256`, and `decision_provenance.authority` is
`NON_AUTHORITATIVE_VERBATIM_RECORD`. Where the words and the codes differ, **the codes
govern** and the difference is a defect in the receipt.

That receipt is what makes the three absence proofs authoritative under rubric §3.2
rather than merely traceable, and it closes rubric §10 open decision 4 for the initial
release: `PREREQUISITE_SUPPORT` receives an authoritative absence proof now, and whether
it later becomes a real route is left open on purpose.

The `decision_ref` must be a `receipt:` reference, not a `policy:` one. A policy that
cited another policy as its own ratification would be asserting its own authority.

### What the ratification does not do

This is the only human decision in the contract set, and it decides exactly one thing:
release route scope. `decision_authority_scope` is `RELEASE_ROUTE_SCOPE_ONLY`, and the
receipt carries a second nonclaims block pinning that narrowness in the contract itself:

| Receipt nonclaim                  | Pinned |
| --------------------------------- | ------ |
| `waives_any_nonclaim`             | false  |
| `waives_any_hard_gate`            | false  |
| `waives_any_evidence_requirement` | false  |
| `approves_any_lesson`             | false  |
| `establishes_rubric_pass`         | false  |
| `authorizes_release`              | false  |
| `authorizes_publication`          | false  |

The receipt also carries the standard nine nonclaims, all still `false` — including
`human_approved`. That is not a contradiction: a human ratified a **route scope**, and no
human has approved a **lesson**. `HUMAN_DECISION` remains a `BLOCKED` evidence class with
`blocker:no-human-decision-receipt`, exactly as before, and a test asserts it.

The chain runs in one direction — profile → policy → receipt — because two files cannot
each contain the other's hash. The receipt names the policy by id and version; only the
policy pins bytes.

---

## 5. Namespace and protected-data separation

**Author diagnostics never read as a result.** Every diagnostic field is `diag_`-prefixed
and lives under `author_diagnostics`; the official namespace is `official_quality_result`,
which is pinned empty: `evaluation_available: false`, `human_gate_status: PENDING`,
`approval_withheld: true`, and a non-empty `approval_blocker_codes[]`.

**No learner-safe or diagnostic surface admits prose.** Closing the objects is not enough
on its own: a closed object with one free-text field inside it is a free-text channel with
extra steps. So the text fields are gone, replaced by closed vocabularies and pinned
references:

| Was                                           | Is now                                                    |
| --------------------------------------------- | --------------------------------------------------------- |
| `learner_safe_summary.lesson_title`           | `lesson_title_ref` — `title:<lesson>@<rev>#sha256:<hash>` |
| `diag_self_audit_note`                        | `diag_self_audit_codes[]` — `DiagnosticCode`              |
| `diag_open_questions[]`                       | `diag_open_question_codes[]` — `OpenQuestionCode`         |
| `official_quality_result.approval_blockers[]` | `approval_blocker_codes[]` — `ApprovalBlockerCode`        |
| `bundle-readiness.blockers[]`                 | `ApprovalBlockerCode[]`                                   |
| `policy_authority.ratification_blockers[]`    | `RatificationBlockerCode[]`                               |
| free-text `lesson_revision_id`                | `LessonRevisionId` — `rev-NNNNNN`                         |
| free-text `*_command`                         | `screen_code` + `screen_ref` — a code and a pinned run    |
| free-text `rubric_path`                       | the literal `key-docs/lesson-quality-rubric.md`           |
| free-text `authority_ref`                     | `AuthorityCitation` — `rubric#7.3,3.1`, `spec#2,R3-R5`    |
| `blocker:<slug>` references                   | `BlockerCode` — a closed enum                             |

### An identifier is a coordinate, not a phrase

Replacing free text with a slug type was not enough. A single shared slug grammar
(`^[a-z0-9][a-z0-9-]{2,63}$`) and a single shared locator grammar
(`[A-Za-z0-9._/@-]*`) sat under most of the public surfaces, and both are prose channels
with the spaces taken out: `bundle_id: "answer-key-is-c"`,
`kit:official-rubric-pass#sha256:…`, and `handoff:release-approved-by-owner#sha256:…` all
validated, and all of them would have travelled beside a lesson.

So `CanonicalId` and `PinnedRef` are gone, and each naming context has its own grammar,
built from the identifiers that context is actually made of:

| Context                        | Grammar                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `bundle_id`                    | `kit-NN-v3-les-NNNNNN`                                         |
| `handoff_id`                   | `lane-NN-v3-les-NNNNNN-handoff-NN`                             |
| `ledger_id`                    | `lane-NN-v3-les-NNNNNN-<route>-ledger-NN`                      |
| `kit_id`, `assignment_id`      | `lesson-factory-deadline-YYYY-MM-DD-kit-NN` / `-assignment-NN` |
| `profile_id`                   | `lesson-factory-deadline-YYYY-MM-DD`                           |
| `policy_id`                    | the literal `lesson-factory-deadline-release`                  |
| `source_id`                    | `src-NNNN`                                                     |
| `packet:` / `handoff:` locator | `lane-NN/v3-les-NNNNNN`                                        |
| `bundle:` / `readiness:`       | `kit-NN/v3-les-NNNNNN`                                         |
| `screen:`                      | `lane-NN/v3-les-NNNNNN/<one of six gate ids>`                  |
| `title:` / `lesson:`           | `v3-les-NNNNNN@rev-NNNNNN`                                     |
| `policy:`, `profile:`, …       | the literal repository path of that frozen artifact            |

Every one of those is fixed words, digits, and closed alternations, so there is nowhere in
an identifier or a locator to put a sentence. The grammars live in one place —
`tests/architecture/lesson-factory/reference-model.ts` — and a test asserts the contracts
carry byte-identical patterns, so the validator and the resolver cannot drift apart.

The same reasoning finished off the two general types that were left. `RepoPath` accepted
any path ending `.md`, `.json`, or `.ts`, and `ValidatorCommand` accepted any `pnpm`
invocation — both check an affix and leave the middle free, so `key-docs/answer-key-is-c.md`
and `pnpm answer-key-is-c` were valid values of a pinned authority and a validation
record. Both types are deleted, a test asserts no contract can reach either name, and the
injection payload set now includes affix-preserving variants so a field that checks a
prefix or a suffix and nothing else fails the moment it is added.

Three tests hold this down. One walks each learner-safe, public, and diagnostic subtree
with every `$ref` resolved and fails if any reachable string is not constrained by a
`pattern`, `enum`, or `const` — then proves the check is not vacuous by asserting
`NonEmptyString` itself would fail it. The second enumerates every string-valued leaf of
every control document, whole, and attempts to inject an answer, an accepted-response
list, a scoring rule, a rationale, an approval claim, a credential, **and the hyphenated
slug form of each** (`answer-key-is-c`, `official-rubric-pass`,
`release-approved-for-production`), asserting rejection for every pair. The third audits
the short list of pointers the second one skips: a pointer may be exempted only if the
contract really does type it as unconstrained text, proved by the injection being
_accepted_ there.

`NonEmptyString` still exists, and is still used where a human is genuinely writing prose
for another human: a task packet's competency statement, a hard gate's design-time
description, the lifecycle register's rule statements. A test pins the complete list of
contracts that may reach it to those three plus the vocabulary that defines it — nothing a
learner or an importer reads is on it.

**Protected material is referenced, never carried.** Keys, accepted-answer sets, scoring
rules, and private rationales stay in server-only storage, reachable only through
`protected_material_reference.inventory_sha256` with `storage_class: SERVER_ONLY`. The
learner-safe surfaces — `lesson-handoff.learner_safe_summary`, `team-handoff.public_metadata`,
`kit-manifest.bundles`, `import-index.entries`, and every field of a runner log record —
are closed objects, so a protected field cannot be added to one without failing validation.

---

## 5a. Runner logs carry codes, hashes, and counts — never content

Rubric §7.3 names logs alongside handoffs and diagnostics as a place protected material
must never appear, and logs are where it leaks most easily: a log line looks harmless and
gets written in a hurry. `runner-log-record.schema.json` makes the boundary structural.

A record carries an enumerated `event_code`, an enumerated `stage` and `severity`, an
opaque `run_id`, a hash-pinned `lesson_ref`, an enumerated `blocker_code`, a closed set of
integer `counts`, and a closed set of `sha256` `hashes`. That is the whole contract.

**The log uses its own identity types.** `lesson_ref` is a `LessonRef`, whose locator must
be a lesson id and a revision number (`lesson:v3-les-000101@rev-000002#sha256:…`), and
`blocker_code` is a `BlockerCode` enum. Neither the retired general reference type nor
`NonEmptyString` is reachable from the log schema, and a test asserts it.

**There is no free-text field, of any name.** No `message`, `detail`, `note`, `reason`,
`context`, `payload`, or `data`. Nothing in the record references `NonEmptyString`, and a
test walks the record with every `$ref` resolved and fails if any reachable string is not
constrained by a `pattern`, `enum`, or `const` — then proves that check is not vacuous by
asserting `NonEmptyString` itself would fail it. A runner that needs to report something
new adds an `event_code` in review; it does not compose a sentence at runtime.

The consequences are enforced rather than described:

- both key sets are closed, so a runner cannot invent `hashes.leaked_answer`;
- a `hashes.*` value must match the 64-hex `sha256` pattern, so prose cannot be smuggled
  into a field whose name suggests a digest;
- `lesson_ref` must be hash-pinned — a bare lesson id is rejected, because two retired
  preview lessons reused production ids (rubric §9.1);
- each record restates its own transport rules under `redaction`
  (`free_text_permitted: false`, `protected_material_present: false`,
  `payload_transport: CODES_HASHES_COUNTS_ONLY`), so a line that tried to opt out would
  be rejected by the same contract that validates it.

The profile's `log_boundary` pins the record schema by the hash of its own bytes and
names the forbidden payload kinds — `PROTECTED_ANSWER`, `SCORING_AUTHORITY`,
`ACCEPTED_RESPONSE`, `RATIONALE`, `SECRET`, `LEARNER_PII`, `ARBITRARY_PAYLOAD`,
`FREE_TEXT` — so loosening the log schema without deliberately re-pinning the profile
breaks the freeze instead of quietly widening what may be emitted.

---

## 6. Identity is pinned, never reconstructed

Every hash is a lower-case 64-character SHA-256; `null`, `""`, `UNKNOWN`, and a
truncated digest are all rejected. **So are placeholder digests** — a repeated nibble, a
repeated pair, a well-known hex constant, a counted hex sequence — because a placeholder
that validates is a test fixture that reached production wearing the right shape.

**That rule is stated once and applied everywhere a digest appears.** It used to live only
on the bare `Sha256` type, while every reference pattern embedded a plain `[0-9a-f]{64}`
of its own — so `title:v3-les-000101@rev-000002#sha256:0000…0` was well-formed even though
the same digest standing alone was not. The alternation now lives in a single
`NoPlaceholderDigest` definition that `Sha256` and all twenty reference types apply, a test
asserts the alternation appears exactly once in the vocabulary, and the negative-case table
fires every known placeholder convention at every reference family.

Every cross-artifact reference uses the form `<kind>:<locator>#sha256:<hash>`, so a
locator without bytes is not a reference to anything — two retired preview lessons reused
production lesson IDs, and a citation without a hash cannot tell them apart.

**References are resolved, not pattern-matched.** Walking the freeze chain by asking
whether a reference _ends with_ the right hash accepts
`policy:anything-at-all#sha256:<correct hash>`: the bytes are pinned to a name nobody
validated, and the locator becomes decoration. The resolver in
`tests/architecture/lesson-factory/reference-model.ts` instead checks all four parts — the
kind is the one expected, the locator matches that kind's grammar, the target exists, and
its bytes hash to the declared digest. Its own tests prove it rejects a correct hash on a
wrong locator, a correct hash on a wrong kind, a path traversal, a lookalike path, a stale
digest, and a placeholder.

The resolver is a model rather than an allowlist of the eight files that happen to exist
today, because the packet, handoff, ledger, screen, bundle, and readiness artifacts a
runner will produce need to resolve too. Each kind declares a resolution strategy:
`FIXED_PATH` for the frozen artifacts in this repository, `DERIVED_PATH` for artifacts
whose location follows from their locator, and `IDENTITY_ONLY` for digests that pin bytes
living outside the factory tree. Resolving a well-formed `DERIVED_PATH` reference whose
target does not exist yet returns `NOT_YET_PRODUCED` with the path it will occupy — which
is a different answer from "this reference is invalid", and a runner needs to tell them
apart. WP-01 implements no runner; the shapes are enforceable now so the runner has
something to conform to.

### Validating a document is not admitting it

A schema validator answers one question: does this document have the shape the contract
describes. It cannot answer the other one, because JSON Schema cannot read a second file —
do the references inside the document point at bytes that exist and hash to what they
claim. A consumer that runs Ajv and stops has checked a shape and learned nothing about
the freeze the document says it belongs to.

So intake is itself a contract. `intake-validation.schema.json` describes the record a
consumer produces: a schema-validation result, a resolver result naming every reference it
checked and what became of each, and an `admission` that is **derived** from both. The
derivation runs in both directions — `ADMITTED` requires both halves to have passed, and
two passes require `ADMITTED` — so a record cannot be admitted on a shape check, and
cannot quietly withhold admission for a reason it does not state. A caller that has only
run Ajv has no resolver result to put in the record, and a record without one fails its own
contract.

#### An admission is about one document

The first version of that record named a document _kind_ and a schema file, both supplied
by the caller, and said `ADMITTED` about no particular bytes. Such a record is true of a
category rather than of a document: it fits every profile ever written, it stays admitted
after the profile is edited, and anyone can write one by hand. That is not a weaker
admission, it is not an admission.

A record now carries a `document` block naming the exact bytes that were offered — the
canonical pinned reference, the SHA-256 of the content, the contract id, the exact
contract version applied, and the contract file with its own digest. Every one of those
fields is derived. `admitIntake()` takes a canonical locator and the bytes and nothing
else; it reads the contract id out of the offered document, looks that up in a registry
built from the shipped schemas, and gets the kind, the schema, the version, and the
contract digest from there. A caller cannot name what it is offering, so relabelling a
profile as a handoff changes which contract is applied — not which one passes.

The same four identity fields are pinned together in the contract as a closed `oneOf`,
one branch per document kind, each branch consting the kind, the contract id, the contract
version, the schema file, and the schema locator, and narrowing `document.ref` to that
kind's locator grammar. So a record that files the profile under the policy kind, or
claims the profile contract at last week's version, or says the profile was validated
against the handoff schema, matches no branch and is rejected by strict Ajv — with every
digest in it real.

The reference rows are discovered rather than declared. `admitIntake()` takes the union of
what the document _looks_ like it contains (any string of pinned-reference shape) and what
the contract _says_ it must contain (any field whose type resolves to a reference
definition), so a caller cannot report zero references for a document that has them, and a
reference field whose value stopped looking like a reference is still checked. Each row
names the JSON pointer it came from, the kind, the digest as read, and what the resolver
found there.

Finally, `admission_proof` is a digest over the whole derivation: the offered digest, the
derived identity, both results, and every reference row. It is not a secret and is not
meant to be one — it is a binding. `verifyIntake(record, offer)` recomputes the derivation
from the bytes and reports every disagreement, so a record survives only if whoever wrote
it had the bytes it names, applied the contract it names, and got the results it reports.
That is the same as having done the work. The eight forgeries in
`lesson-factory-intake.test.ts` — a one-byte edit after admission, a digest swapped for
another real artifact's, a relabel, a version rollback, zeroed counts, emptied rows, a
duplicated row with a different verdict, and a profile's record attached to the policy —
all validate against the contract and all fail recomputation.

Bytes offered at a locator that is not a canonical location for their kind cannot be
admitted at all, and neither can a document whose contract intake does not admit.
`admitIntake()` throws in those cases rather than returning a refusal, because a record is
a statement about a document and there is not one to make a statement about.

#### What intake admits, and what it does not

Twelve contracts are admissible, and they are every document the factory persists and
hands on: the four frozen profile artifacts, and the eight a runner writes — assignment
manifest, task-source packet, lesson handoff, **team handoff**, candidate quality ledger,
kit manifest, **import index**, bundle readiness. Each has a reference kind, so each has a
canonical location, so an admission has something to bind to. `intake_contract` lists them
as `admissible_contracts`.

Three contracts are not admissible, and the profile says which and why in
`non_admissible_contracts`, because an unlisted contract is an oversight while a listed one
is a decision somebody can argue with:

| Contract            | Reason             | Why                                                                                                                                       |
| ------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `shared-vocabulary` | `SCHEMA_ONLY`      | It defines the types the other contracts use. There are no shared-vocabulary documents, so there is nothing to offer.                     |
| `intake-validation` | `ADMISSION_RECORD` | It is what intake produces. Admitting it would be intake reading its own output, which admits nothing that was not already true or false. |
| `runner-log-record` | `LOG_EVENT`        | One emitted line, bounded by the log boundary in §5 and validated against its own contract at the point of emission. Nobody hands one on. |

Every contract this freeze ships is in exactly one of the two lists, and
`lesson-factory-intake.test.ts` fails if that stops being true.

The profile states the rules rather than leaving them to whoever writes the runner:
`intake_contract` declares `schema_validation_alone_sufficient: false`,
`resolver_validation_required: true`, `caller_supplied_identity_permitted: false`,
`admission_proof_required: true`, `admission_rule: BOTH_MUST_PASS`, the version of the
intake contract in force, and the list of dynamic reference kinds — the ten `DERIVED_PATH`
kinds, which are exactly the references whose targets a runner writes and a validator
therefore cannot check. The intake schema is pinned there by hash like every other
authority.

`tests/architecture/lesson-factory/intake.ts` is the reference implementation. It imports
no test framework and reads only shipped contract files. Its three control fixtures are not
hand-written either: they are regenerated by the API whenever the freeze is re-pinned, so a
hand-authored admission is impossible even in the fixtures.
`fixtures/intake-validation.json` is the frozen profile, admitted.
`fixtures/intake-validation-team-handoff.json` and
`fixtures/intake-validation-import-index.json` are the two lane artifacts, refused —
`REFERENCES_UNRESOLVED`, because no runner has written the artifacts they name. That is the
honest state of those two kinds in a work package that runs nothing, and it is the state
the negative table probes: a refusal has to survive a forged upgrade to `ADMITTED`, a
missing reason, and a rewritten identity, exactly as an admission does. The admitted path
for both kinds is exercised in `lesson-factory-intake.test.ts`, which writes the artifacts
their locators name, admits the document against them, and removes them again.

A lesson identity also declares its `envelope_kind`: an `L1` envelope has no manifest
and must record `artifact_manifest_sha256: null`, while an `L2_L3` envelope must record
the hash. Neither can borrow the other's shape.

The import index refuses reconstruction outright
(`identity_reconstruction_allowed: false`) and targets `CANDIDATE_DRAFT_IMPORT` with
`serves_learners: false` and `catalog_registration: false`.

---

## 7. The contract files

All schemas are JSON Schema 2020-12, closed (`additionalProperties: false` on every
object they define), versioned by `$id` and `x_contract_version`, and addressed under
`https://mcat-mastery.internal/lesson-factory/schemas/v1/`.

**Profile artifacts** — `content/lesson-factory/deadline-profile/`

| File                              | Carries                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `deadline-profile.json`           | authorities, hard gates, evidence classes, namespaces, log boundary              |
| `release-policy.json`             | STANDARD-only route policy and the four-member route proof                       |
| `lifecycle-nonclaims.json`        | the candidate lifecycle, its transitions, and the nonclaims in prose             |
| `owner-route-policy-receipt.json` | the `PRODUCT_PEDAGOGY_OWNER` decision that ratified the route scope              |
| `owner-route-policy-statement.md` | that decision in the owner's own words, non-authoritative, pinned by the receipt |

**Schemas** — `content/lesson-factory/schemas/`

| File                                     | Governs                                                         |
| ---------------------------------------- | --------------------------------------------------------------- |
| `shared-vocabulary.schema.json`          | hashes, refs, routes, roles, gates, evidence classes, nonclaims |
| `deadline-profile.schema.json`           | the deadline profile artifact                                   |
| `release-policy.schema.json`             | the release policy and four-route proof                         |
| `lifecycle-nonclaims.schema.json`        | the lifecycle and nonclaims artifact                            |
| `owner-route-policy-receipt.schema.json` | the owner route-scope decision receipt                          |
| `assignment-manifest.schema.json`        | which lane authors which lesson, from which packet              |
| `task-source-packet.schema.json`         | the frozen, revision-bound authoring input                      |
| `lesson-handoff.schema.json`             | one lesson revision handed back by one lane                     |
| `team-handoff.schema.json`               | one lane's aggregate, plus its learner-safe public metadata     |
| `candidate-quality-ledger.schema.json`   | the machine-screen record for one lesson on one route           |
| `kit-manifest.schema.json`               | the packaged bundles of one deadline run                        |
| `import-index.schema.json`               | what an importer may read, and where it may write               |
| `bundle-readiness.schema.json`           | whether one bundle may enter the candidate draft namespace      |
| `runner-log-record.schema.json`          | one line a runner may emit, and nothing it may not              |
| `intake-validation.schema.json`          | which document was admitted, on what checks, and on whose proof |

Every instance pins the exact contract version it was written for: `contract_version` is
a `const`, not a semantic-version pattern. A version field that accepts any well-formed
version lets a document written against a superseded contract validate cleanly against
the current one and claim to belong to this freeze — which is the failure the field was
added to prevent. When a contract is revised, the const moves and every instance is
re-issued deliberately, which is the cost of a freeze meaning something.

The task/source packet is a superset of the input contract in
[`key-docs/lesson-quality-author-protocol.md`](../../key-docs/lesson-quality-author-protocol.md) §4
and [`key-docs/autonomous-lesson-authoring-context.md`](../../key-docs/autonomous-lesson-authoring-context.md) §5,
with the rubric identity triple grouped under `rubric_identity`.

---

## 8. How this is enforced

Six suites under `tests/architecture/`:

- `lesson-factory-deadline-contract.test.ts` — the contract set exists, is closed and
  versioned, resolves every `$ref`, pins the rubric and structural-spec hashes against
  the files on disk, walks the hash chain through the trusted resolver, proves the policy
  and the receipt derive every route field from one scope code, proves no learner-safe or
  diagnostic surface admits prose, and ships a valid control instance for every contract.
- `lesson-factory-fail-closed.test.ts` — the negative-case table. Each row is one mutation
  of a clean control, so a rejection can only be caused by that mutation.
- `lesson-factory-ajv-conformance.test.ts` — the same contracts compiled by Ajv 2020 in
  full strict mode, with every artifact and fixture validated and **the entire** table
  replayed through Ajv, asserting parity with the subset checker on every row. Both suites
  read one table from `lesson-factory/negative-cases.ts`; a sampled cross-check only proves
  the two validators agree about the sample.
- `lesson-factory-canonical-refs.test.ts` — the reference resolver, proved to reject what
  suffix equality would accept.
- `lesson-factory-reference-model.test.ts` — the naming model: every kind has its own
  locator grammar with no free segment, every naming context has its own identifier
  grammar, the contracts carry byte-identical patterns, the retired general types are
  unreachable from every contract, and the placeholder rule is stated once.
- `lesson-factory-intake.test.ts` — the intake contract: the admission record is closed
  and bound to the exact bytes it admitted, the closed kind/contract/version/schema
  mapping matches the shipped contracts, identity is derived from the offered document and
  the trusted registry rather than accepted from the caller, reference rows are discovered
  from the contract as well as by shape, and eight schema-valid forgeries — including a
  one-byte edit made after admission and a record attached to a different document — fail
  recomputation against the bytes. It also proves the scope is complete: every shipped
  contract is admissible or declared out of scope with a reason, and the team handoff and
  the import index are admitted end to end once the artifacts they name exist.

### Controls are unmistakably test-only

Every fixture is wrapped in an envelope carrying a `$test_fixture` marker
(`synthetic: true`, `not_for_production: true`) with the control document under
`instance`. Because every contract is closed, the raw envelope **fails** validation
against the contract it is a control for, and a test asserts exactly that for each one. A
fixture loader unwraps `instance` so the positive controls still work. The fixtures also
use realistic digests rather than `aaaa…` placeholders, because intake now rejects
placeholder digests outright — a control should be recognisable by a marker that cannot be
overlooked, not by a hash pattern that can.

The first two suites run against a deliberately small JSON Schema subset checker in
`tests/architecture/lesson-factory/json-schema-subset.ts`. It is kept as a second defence
because it enforces contract discipline a conforming validator has no opinion about: a
keyword it cannot evaluate is a failure rather than an ignored annotation, and every
object a contract defines must be closed. It has its own test proving it rejects each
construct the contracts rely on.

Ajv runs with `strict: true` and no relaxation. Every schema is legal Draft 2020-12 under
those settings, which is why refinement branches carry a redundant-looking `type`: Ajv's
`strictTypes` rejects a branch that constrains `minItems` without saying it applies to an
array, and the contracts conform rather than turning the check off.

The rubric, structural-spec, mastery-contract, companion-artifact, and runner-log-schema
hashes are all recomputed from disk on every run. If any of those files changes, these
tests fail — that is the intended behaviour. Re-pin deliberately and re-read what
changed; do not relax the assertion.
