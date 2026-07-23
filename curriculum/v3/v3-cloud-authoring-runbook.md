# V3 cloud lesson-authoring runbook

## Status and authority

This runbook orchestrates internal draft production for the 114 canonical V3 lesson shells. It does
not authorize lesson publication and does not define application/runtime behavior.

- Curriculum identity and relations come only from
  `v3-lesson-authoring-manifest.json`.
- The normative lesson and publication contract is
  `docs/design/mcat-complete-learning-flow.md`, especially sections 12, 13, 31, 32.1, and 33.
- `v3-cloud-authoring-jobs.json` is the generated job and wave projection. Do not hand-edit it.
- The five approved prototypes are a port pilot only:
  `V3-LES-329622`, `V3-LES-765609`, `V3-LES-443492`, `V3-LES-225658`, and
  `V3-LES-386478`. They are not production `LessonDefinition` records.
- Generated content is an internal draft until rights, scientific review, signed/verifiable review
  receipts, exact reviewed-artifact hashes, and efficacy gates pass. A hash is an integrity
  identifier, not proof of who produced evidence or whether the asserted event occurred.

Regenerate or verify from the repository root:

```sh
node scripts/generate-v3-cloud-authoring-plan.mjs
node scripts/generate-v3-cloud-authoring-plan.mjs --check
node scripts/validate-v3-cloud-authoring-wave-overlay.mjs check-template \
  V3-AUTH-W00-PILOT-PORT \
  curriculum/v3/v3-cloud-authoring-wave-assignment-overlay.template.json
node --test \
  scripts/generate-v3-cloud-authoring-plan.test.mjs \
  scripts/validate-v3-cloud-authoring-wave-overlay.test.mjs
```

The generator has no timestamp or random input. It verifies the checked curriculum and contract
pins, uses normalized relation IDs, and fails if its checked output is stale.

## One lesson per cloud author

Each author agent receives exactly:

1. The shared manifest, V3 README, canonical design contract, and its one job record.
2. Current authoritative/open factual sources only through the approved source ledger described
   below.
3. For a pilot-port job only, the matching approved prototype after its artifact location, immutable
   hash, processing rights, and review provenance have been supplied.

An author agent must not receive another lesson draft, another prototype, protected questions or
answer keys, copied textbook prose, licensed content without model-processing permission, or
historical expressive source payloads excluded from the bootstrap. New-authoring jobs are clean-room
jobs; the prototypes may not seed the other 109 jobs.

Original figures, tables, passages, examples, and items are required unless explicit reuse rights
exist. Record source provenance, input rights, and source-output similarity evidence. The
similarity auditor—not the author—may compare drafts after authoring.

### Immutable plan and wave-assignment overlay

Never add identities or evidence to `v3-cloud-authoring-jobs.json`. Its assignment objects are role
slots, not mutable operational records. Create a separate overlay for exactly one wave:

```sh
node scripts/validate-v3-cloud-authoring-wave-overlay.mjs template \
  V3-AUTH-W01 \
  .tmp/v3-wave-overlays/V3-AUTH-W01.json

# Materialize only that separate file, then:
node scripts/validate-v3-cloud-authoring-wave-overlay.mjs validate \
  .tmp/v3-wave-overlays/V3-AUTH-W01.json \
  --integration-trust-root /secure/out-of-overlay/integration-authority-public-key.pem
```

The checked template is an unmaterialized W00 example. `template` computes the SHA-256 of the exact
checked plan bytes and copies its registry, freeze, source-manifest, wave, job, lesson, slot, role,
and specialty pins. `validate` is read-only. It rejects a stale plan hash, any changed pin or wave
membership, missing/extra/duplicate slot, role mismatch, null identity, or attempt to use the plan
itself as an overlay. Regenerate a new overlay after any plan change; never carry assignments across
plan hashes.

Production validation never trusts a public key supplied only by the overlay. The CLI requires an
external integration-authority public key. That key verifies a signed pinset and signed reviewer
credentials; the pinset in turn binds the exact foundation commit, candidate/runtime and learner
DTO schemas, candidate validator, learner-safe compiler, review harness, scoring-service builds,
their exact IDs/versions/artifact hashes, and compiler/harness signing keys.
`FIXTURE_ONLY_NON_PRODUCTION` pinsets are accepted only by the
test API's explicit fixture option and cannot satisfy the CLI.

Every materialized overlay records an actual person ID and actual execution/run ID for each slot,
plus explicit controller and wave-integrator identities. The validator enforces:

```text
one author run/person = exactly one wave lesson
all wave author run/person IDs are unique
no wave author = any auditor, solver, rights reviewer, fact checker, integrator, or approver
author ≠ every nonauthor slot declared by its job
blind solver ≠ final approver
CARS passage-subject fact checker ≠ author and CARS reasoning editor
controller ≠ wave integrator ≠ every job assignment
```

One qualified nonauthor may cover the same role across multiple jobs only when there is no
same-job or cross-role reuse, every assignment carries qualification evidence, and one
`reviewer_reuse_declarations[]` record lists the exact person, role, jobs, slots, qualifications,
and rationale. Undeclared reuse fails.

### Source ledger

Each job must have a rights-reviewer-approved
`mcat-v3-authoring-source-ledger-1`. Every factual source entry records a stable source ID and kind,
title, HTTPS URL, access date, license/terms, model-processing-rights status and basis, whether the
author model received it, source ceiling, retrieval SHA-256, and rights-review slot. Sources marked
human-review-only may not be given to an author model. Every entry is factual-use-only and must set
`copied_expressive_prose_allowed: false`. Access dates must parse as real calendar dates and may not
be later than the overlay's materialization instant.

This permits separately recorded, current authoritative/open factual inputs. It does not permit
copying a source's wording, examples, passages, item structures, figures, or other expressive
content. Closed source-output and rights reports bind the recomputed ledger and candidate to the
assigned rights reviewer's person/run/slot and externally credentialed signing key. The validator
rereads each path, verifies bytes and detached signatures, and rejects missing, stale, misbound, or
unknown fields.

### Pinned candidate, derived clients, and signed blind runtime

The controller freezes one candidate directory. `candidate-manifest.json` must match the exact
runtime version, `LessonDefinition` schema ID/hash, candidate-validator build, and key-bearing
definition path from the signed integration pinset. The validator inventories bounded regular
files, rejects duplicate manifest paths and symlinks, recomputes the directory hash, parses the
definition under bounded JSON limits, and validates it against the pinned schema. Any candidate
mutation invalidates candidate-bound G01–G10 evidence.

A solver or accessibility reviewer never receives that directory, its branch/history, server
definitions, scoring authority, diagnostic mappings, or pre-response rationales. The exact
pinset-bound candidate→learner-safe compiler emits a detached-signature-verified derivation report
that binds the candidate file manifest, compiler build/key, runtime/DTO schema pins, review-harness
build, and every output file/hash. The validator requires byte-for-byte agreement between each
closed client and that signed output; a hand-authored client naming an unrelated candidate hash
fails.

`mcat-v3-closed-sanitized-review-bundle-2` permits exactly:

```text
BLIND_SOLVE
  blind-client-runtime.json
  bundle-manifest.json
  learner-safe-envelope.json

ACCESSIBILITY_ONLY
  accessibility-harness-config.json
  bundle-manifest.json
  learner-safe-envelope.json
```

The envelope wraps the exact shared learner DTO validated against the signed-pinset schema, plus
immutable media digests (and transcript/caption digests for audio/video). Its manifest declares
support for every representation and action kind in that DTO contract, including charts,
simulations, animation, audio/video, deterministic activity graphs, and nonvisual alternatives.
Unknown fields and extra files fail. Recursive protected-field scanning remains defense in depth;
it is not semantic proof that no key leaked. Arbitrary Markdown, TXT, SVG, HTML, scripts, and
reviewer-controlled outcomes are forbidden.

For G08, a pinset-bound standard review harness must execute the accessibility client in a browser.
The harness signs a report that binds a closed browser-evidence artifact and exact checks for
keyboard-only operation, focus order, semantics, contrast, 320px reflow, 200% zoom, reduced motion,
nonvisual alternatives, and media transcripts/captions. Static JSON claims and path strings cannot
satisfy G08.

For G07, the integrator deploys the exact candidate to an ephemeral opaque service built from the
signed scoring-service pin. The deployment artifact has a closed file set and recomputed manifest.
An integration-authority-signed deployment/ACL attestation binds that artifact, candidate, safe
client, solver/integrator identities, and a unique per-deployment Ed25519 receipt-key fingerprint,
while attesting that source, protected material, pre-response rationales, and override controls are
not exposed.

The service signs one detached receipt for every request/response. Every receipt binds session,
contiguous sequence, canonical monotonically increasing timestamp, attempt/request/activity IDs,
protocol request kind, submitted-response hash or required null, learner outcome/feedback hash,
prior and next state hashes, candidate, safe client, deployment artifact, and receipt-key
fingerprint. The service also signs the closed session manifest. The validator verifies every
signature, request/outcome pairing, state transition, activity reference, and request ID. It derives
rather than trusts coverage for correct, incorrect, omission, help, retry, reveal,
interruption→resume, invalid item, mixed route, and multi-cycle repair-limit paths.

The validator enforces profile-specific regular-file count, per-file, total-byte, JSON depth,
collection, and string limits before or immediately after bounded reads. This is an authoring-side
evidence/interface contract only: this branch does not implement or modify the separate runtime,
compiler, harness, or scoring service.

## Exact lesson contract

An author must preserve the job's exact registry artifact and SHA, freeze IDs, source-manifest hash,
lesson ID, grouping ID, normalized internal-order relation, ordered KC IDs, and exact KC statements.
No author may add, remove, split, merge, rename, or rehome a KC, create one lesson per KC/source
topic, or infer order from JSON adjacency.

The draft bundle must contain:

- One immutable lesson-shell manifest with content version, duration estimates, checkpoint map,
  grouping order, and eventual reviewed-content-hash field.
- One primary resumable microcycle per ordered KC, with observable objective, scope and non-goals,
  selected archetype, prerequisites at point of use, facts, procedures, assumptions, boundaries,
  confusables, expert task model, representations/equations, misconception hypotheses, cases,
  route policy, assistance ladder, duration, and checkpoints.
- A deterministic activity graph per KC with meaningful learner work, A3→A0 assistance fading,
  explicit fallbacks, bounded repair, exact reentry, termination, pause, and resume.
- Two untouched A0 instructional-exit checks per KC—a near-use and construct-preserving changed
  task—kept separate from downstream independent, transfer, delayed, passage, timed, and protected
  families.
- Feedback metadata, exposure/family metadata, server-bound keys and rationales, and declared
  shell-delivery, KC-evidence, repair, and analytics events.
- Accessible behavior for keyboard, focus, semantics, contrast, reflow, reduced motion,
  accommodations, and nonvisual construct-equivalent representations.

The 18-minute p90 core-path guardrail applies provisionally per KC microcycle, not per shell.
Outliers need a documented waiver and resumable segmentation.

Attachment handling is exact:

- `host_only` extensions/supports remain bounded, host-attached, nonstandalone, and nonmastery.
- `required` capstones remain separately authored coordination activities at their placement
  relations; they are references, not lesson-owned KC microcycles.
- `governance_only` records—including `V3-EXT-703019` and `V3-CAP-537139`—produce no active content,
  task, evidence, placement, or denominator entry.
- Only a `HARD_PREREQUISITE` may block its recorded unscaffolded point of use. Helpful and other
  relation types remain nonblocking.
- Adaptive bypass is disabled. Entry evidence changes support and dose, never required KC scope.

The bundle must not contain lesson/grouping/attachment/module/phase/pathway mastery, a lesson-wide
diagnostic label, inferred capstone success, a new curriculum identity, a score/readiness claim, or
an efficacy claim.

### Complete internal-integration evidence

`MATERIALIZED` with target `INTERNAL_DRAFT_INTEGRATION` means G01–G10 evidence is complete, not
merely assigned. The validator requires:

- the externally verified signed integration pinset and exact pinned schema/build artifacts;
- the recomputed candidate file manifest plus pinned-schema-valid key-bearing definition;
- signed assigned-reviewer G01–G04 reports for canonical/reference, identity/KC, runtime/content,
  attachment/repair, and no-bypass checks;
- closed, reread, signed G05 source-output and rights/originality reports bound to the recomputed
  source ledger;
- a signed assigned-auditor G06 content/pedagogy report;
- the compiler-signed derived G07 client, recomputed service deployment, authority-signed ACL
  attestation, signed request/response session, protocol-derived path coverage, and signed solver
  approval;
- harness-signed browser/a11y execution plus signed assigned-auditor G08 approval;
- one multi-reviewer-signed G09 report binding every current candidate and an
  integration-authority-signed cumulative corpus manifest containing every prior wave/job; and
- closed, reread, signed G10 specialty reports and any conditional CARS subject report.

Each consequential report binds the source-plan, wave, job/lesson, candidate, assigned reviewer
slot and person/run identity, signing-key fingerprint, and applicable artifact hashes. The external
authority signs each reviewer identity/key/role credential. Missing paths, unknown fields, invalid
signatures, stale bytes, false status, different bindings, or post-review mutation fail. Hashes
detect byte identity only; signatures and pinned trust roots establish report origin, while
execution/rights review establishes the underlying fact. G11 reviewed-publication hash and G12
efficacy/publication approval remain explicitly `PENDING` at this internal-draft boundary.

## Required pipeline

Every lesson follows this order:

1. **Source-ledger/input-rights review.** The independent rights reviewer approves every source,
   use ceiling, retrieval hash, and model-processing decision before an author receives it.
2. **Author.** Pin and lint the job, elicit/reconcile expert task models, create the shell and KC
   microcycles, bind relations and attachments, isolate item families, and self-check all paths.
3. **Independent content/pedagogy audit.** A nonauthor verifies KC boundaries,
   objective/activity alignment, representation use, fading, feedback, repair, and family
   isolation. Findings return to the author; changed content is re-audited.
4. **Domain/scientific review.** Every machine-listed specialty slot independently verifies the
   candidate against the approved source ceiling, facts, assumptions, equations, representations,
   and boundary conditions. One record per required specialty is mandatory.
5. **CARS passage-subject review, when applicable.** After the author selects an original passage
   subject, an additional subject-matter checker—distinct from the author and CARS reasoning
   editor—reviews that subject's facts and ceiling.
6. **Output-rights/originality review.** The input-rights reviewer independently checks provenance,
   output rights, originality, and source-output similarity against the same candidate hash.
7. **Candidate freeze and G01–G06 evidence.** The release integrator validates the key-bearing
   definition against the exact signed-pinset schema, freezes the bounded file manifest, and
   verifies signed assigned-reviewer reports. Any later byte change restarts affected gates.
8. **Derived clients and opaque service.** Verify compiler-signed derivation of the exact closed
   clients, deploy the candidate with the pinned scoring build, recompute the closed deployment
   artifact, and verify the integration-authority-signed deployment/ACL attestation.
9. **Blind solve.** The assigned solver submits real answers through only the closed client and
   opaque service. Verify the service-signed closed session, every ordered request/response and state
   transition, derived path coverage, solver identity, and signed approval. Self-asserted path
   labels and reviewer-controlled outcomes are forbidden.
10. **Accessibility/technical audit.** Execute the accessibility client through the pinned standard
    browser harness; verify construct-equivalent alternatives, graph behavior, keyboard, focus,
    semantics, contrast, 320px reflow, 200% zoom, reduced motion, nonvisual alternatives,
    transcripts/captions, signed execution evidence, and assigned-auditor approval.
11. **Cross-lesson similarity audit.** Compare every current candidate with all current peers and
    the signed cumulative corpus for every previously integrated wave. All assigned similarity
    reviewers sign one report. Check copied language, repeated scenarios, representational
    monoculture, answer-pattern leakage, family leakage, and template overfitting.
12. **Reviewed hash.** Resolve findings, rerun affected stages, freeze one publication candidate,
    and bind every approval to its exact content hash. Any mutation invalidates affected approvals.
13. **Publication gate.** A distinct final approver verifies all 12 machine-listed gates, rights,
    scientific/domain review, exact reviewed hash, and preregistered efficacy/subgroup evidence.
    Before that decision the artifact remains internal draft, even if merged at a wave checkpoint.

An author assertion is not audit evidence. Missing or ambiguous evidence fails closed.

## Finding severity and blocking rules

| Severity | Meaning                                                                                                                                                                                                             | Internal-draft integration                                                                                 | Publication             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------- |
| **P0**   | Critical integrity/safety failure: plan-pin or canonical-scope corruption, protected/key exposure, unauthorized rights use, held-scope activation, bypass activation, or a failure requiring immediate containment. | Blocked; stop the wave, contain exposure, invalidate affected artifacts/evidence, resolve, and revalidate. | Blocked.                |
| **P1**   | Major correctness/process failure: material factual/key error, missing independent role, invalid KC/activity alignment, broken deterministic path, inaccessible essential path, or failed G01–G10 evidence.         | Blocked until resolved and affected stages rerun.                                                          | Blocked.                |
| **P2**   | Bounded moderate defect that does not invalidate G01–G10 and does not expose learners, but requires correction.                                                                                                     | Allowed only as internal draft with recorded containment, owner, due date, and publication block.          | Blocked until resolved. |
| **P3**   | Minor editorial/maintainability issue with no material correctness, rights, accessibility, evidence, or execution effect.                                                                                           | Not blocked; track an owner.                                                                               | Not blocked.            |

An unresolved G01–G10 requirement is P1 or P0, never downgraded to P2. The overlay validator rejects
open P0/P1 at an internal-integration checkpoint and requires complete containment metadata for each
open P2. G11/G12 and final publication still fail while any P0, P1, or P2 is open.

## Deterministic waves

The fixed pilot plus ten production waves cover 114 lessons and 422 KC microcycles:

| Wave                     | Authors | KCs | Domain mix                                                         |
| ------------------------ | ------: | --: | ------------------------------------------------------------------ |
| `V3-AUTH-W00-PILOT-PORT` |       5 |  18 | CARS 1, Chem/Phys 2, SIRS 1, Psych/Soc 1                           |
| `V3-AUTH-W01`            |      11 |  42 | Bio/Biochem 3, CARS 1, Chem/Phys 4, Psych/Soc 3                    |
| `V3-AUTH-W02`            |      11 |  46 | Bio/Biochem 3, CARS 1, Chem/Phys 4, Psych/Soc 3                    |
| `V3-AUTH-W03`            |      11 |  44 | Bio/Biochem 3, CARS 1, Chem/Phys 4, Psych/Soc 3                    |
| `V3-AUTH-W04`            |      11 |  37 | Bio/Biochem 3, shared Bio/Chem 1, Chem/Phys 3, SIRS 1, Psych/Soc 3 |
| `V3-AUTH-W05`            |      11 |  41 | Bio/Biochem 2, shared 1, CARS 1, Chem/Phys 3, SIRS 1, Psych/Soc 3  |
| `V3-AUTH-W06`            |      11 |  39 | Bio/Biochem 3, CARS 1, Chem/Phys 4, Psych/Soc 3                    |
| `V3-AUTH-W07`            |      11 |  34 | Bio/Biochem 2, shared Bio/Chem 1, Chem/Phys 4, SIRS 1, Psych/Soc 3 |
| `V3-AUTH-W08`            |      11 |  40 | Bio/Biochem 2, shared 1, CARS 1, Chem/Phys 3, SIRS 1, Psych/Soc 3  |
| `V3-AUTH-W09`            |      11 |  40 | Bio/Biochem 3, shared 1, CARS 1, Chem/Phys 3, SIRS 1, Psych/Soc 2  |
| `V3-AUTH-W10`            |      10 |  41 | Bio/Biochem 2, shared 1, CARS 1, Chem/Phys 2, SIRS 1, Psych/Soc 3  |

Exact ordered lesson/job membership, specialties, complexity/risk estimates, and prior-wave
requirements are in each generated `waves[]` record. The five-item pilot is intentionally smaller.
Production uses 10–11 simultaneous authors, inside the 8–12 quality-preserving range. This keeps
audits, blind solves, accessibility checks, and integration review tractable while every production
wave retains at least three domain buckets. One hundred simultaneous authors would overwhelm those
independent-review bottlenecks and delay detection of a bad shared template until most drafts
already existed.

Wave eligibility uses only explicit stable relations:

- A cross-lesson hard edge into a nested KC point of use requires its source lesson's authoring
  checkpoint in an earlier wave.
- Hard edges into separately placed capstones remain in the job but do not invent lesson-shell
  first-delivery order.
- The normalized first-delivery relation and its explicit ordinal fields break ties among otherwise
  ready jobs.
- Helpful relations never block. Array proximity never creates a dependency.

### Checkpoint between every wave

Do not start the next wave until the integration controller:

1. Rehashes the immutable plan and validates the materialized wave overlay, exact job/slot set,
   controller/integrator identities, separation edges, real source dates, the external trust root,
   signed pinset/credentials, schema-valid candidate, compiler-derived clients, service
   deployment/attestation/receipts, harness execution, and every signed candidate-bound G01–G10
   record.
2. Confirms no extra lesson output, no open P0/P1, and complete containment/owner/due-date/publication
   blocks for every open P2; G01–G10 must pass for internal integration.
3. Verifies the cumulative corpus manifest contains every prior wave/job, then completes the
   multi-reviewer-signed current-plus-complete-history cross-domain similarity report.
4. Regenerates/checks the job manifest and overlay template and runs formatting, lint, tests,
   repository protected-field scanning, rights scanning, and reference/attachment checks.
5. Integrates reviewed drafts in one auditable wave checkpoint and records artifact integrity
   identifiers, verified receipts/signatures, findings, approvals, rollback coordinates, and the
   exact validated overlay bytes.

The checkpoint is an internal-draft integration boundary, not publication. G11 and G12 remain
release gates. A failure pauses the next wave; it does not justify deleting scope, moving a job,
changing curriculum order, or relaxing separation of duties.

## Known launch blockers

- **W00 cannot launch.** The corrected lesson-platform foundation commit and exact
  `LessonDefinition`/runtime schema, shared learner DTO schema, candidate validator, learner-safe
  compiler, browser/a11y review harness, scoring-service builds, build signing keys, production
  integration-authority trust root, and signed pinset have not been supplied. No temporary
  production hashes are guessed. The positive cryptographic fixtures are explicitly
  `FIXTURE_ONLY_NON_PRODUCTION` and cannot satisfy the CLI.
- Locations, hashes, processing-rights records, and review provenance for all five prototype
  artifacts still need to be supplied.
- Actual controller/integrator, author, rights-reviewer, specialty fact-checker, CARS subject
  reviewer, auditor, solver, and approver identities are intentionally unassigned.
- Job source ledgers and present-day authority refreshes have not been materialized; the architecture
  remains bounded by the supplied 2020 AAMC ceiling.
- Candidate artifacts, compiler derivation reports, closed review clients, opaque scoring
  deployments, signed service/ACL receipts, browser execution artifacts, reviewer credentials, and
  complete signed G01–G10 reports do not yet exist.
- Lesson content, specialty sign-off, rights/originality evidence, calibrated evidence recipes,
  learner validation, and efficacy/subgroup results do not yet exist.
- Complexity and risk points are deterministic structural triage estimates, not person-hours,
  difficulty calibration, safety clearance, or efficacy evidence.
