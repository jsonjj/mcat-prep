# Autonomous Lesson Authoring — Agent Context Entry Point

**Status:** DOCUMENTATION-ONLY CONTEXT INDEX FOR DOCUMENT-GOVERNED DRAFTING ONLY — NO QUALITY GATE, EVALUATOR SERVICE, CALIBRATION HARNESS, OR AUTOMATIC APPROVAL/REGISTRATION/PUBLICATION IS IMPLEMENTED
**Version:** `0.3`
**Date:** 2026-08-03 · **Supersedes:** `0.2` (cross-document correction wave) · `0.1` (2026-08-02)

## 1. Purpose

This is the single entry point to give a new agent when asking it to create one or
more MCAT lessons. It is an index into governing documents, not itself an authority:
where this file and a linked document disagree, the linked document governs. The agent
must use the canonical curriculum records behind the requested lesson names; **a name
alone is never enough authority** to invent IDs, KCs, scope, prerequisites, placement,
or evidence semantics — every requested name requires canonical resolution against
`curriculum/v3/v3-lesson-authoring-manifest.json` and a frozen source packet (§5)
before any drafting begins.

Today an agent can autonomously draft, rehash, structurally validate, and prepare a
lesson for review. **It cannot autonomously grant human quality approval, domain
approval, accessibility equivalence, rights clearance, efficacy, mastery calibration,
registration, or publication, and it must never claim any of these occurred.** No
software evaluator, calibration harness, or automatic revise-until-pass service exists
anywhere in this chain; every quality step below is a documented manual/agent
procedure, not a running system.

## 2. Minimum user input

The user supplies:

- an exact list of desired learner-facing lesson names;
- optional batch priority or maximum count; and
- any explicit product constraint that differs from the canonical defaults.

Everything else must be resolved from the repository. A lesson name alone never
resolves canonical identity, KC membership, prerequisites, placement, or evidence
semantics — those require the source packet in §5. If a name is missing or ambiguous,
the agent stops and asks rather than selecting the nearest match.

## 3. Required context bundle

### 3.1 Canonical curriculum identity

Read:

- `curriculum/v3/v3-lesson-authoring-manifest.json`

This is the authority for lesson IDs, grouping IDs, ordered KC membership, sequence
relations, source anchors, and curriculum indexes used by R14.

For every requested name, resolve and pin:

- exact lesson ID and grouping ID;
- learner-facing title;
- **phase, module, and pathway placement as arrays of `{ id, source_relation_ids[] }`,
  never a single inferred value** — the manifest's own `placement_projection` records
  are generated views (`not_independent_truth: true`) derived from named relations
  (for example `R14-PM-01`), and a lesson may legitimately carry more than one;
- ordered required KCs;
- KC competency statements, scope, and non-goals;
- hard and helpful prerequisite relations, each with its stable relation ID;
- attachments, capstones, supports, and revisits;
- source anchors and unresolved holds; and
- relevant reasoning operations.

Do not derive any of these from the lesson title, from proximity to another lesson, or
from a single inferred field.

### 3.2 Structural authoring contract

Read:

- `docs/design/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md`
- `docs/design/06-LESSON-AUTHORING-WORKFLOW.md`
- `docs/lesson-authoring/template/v3-les-000000/README.md`
- every JSON file under `docs/lesson-authoring/template/v3-les-000000/`

The validator (`packages/content/src/lesson-validator/rules.ts`, run through
`content-cli lesson-validate`), not prose, is the final structural authority. The
template is a starting shape, not content to copy.

**Spec 05 §4 is superseded for evidence meaning.** Spec 05 governs artifact structure
and the R1–R15 rules, and remains authoritative there. Its §4 prose also describes what
evidence _means_ — which responses count, what independence implies, what moves mastery
— and that description predates the contract in §3.3 below. Where the two differ on
meaning, sufficiency, independence, or mastery consequence, the evidence and mastery
contract governs and Spec 05 §4 is historical context. Reading order does not settle
authority: this list is ordered for construction, not precedence.

### 3.3 Evidence and mastery contract

Read:

- `docs/lesson-evidence-mastery-contract.md`
- `key-docs/MCAT-skills`

These define the author/runtime/server boundary, reasoning-operation vocabulary,
evidence eligibility, assistance semantics, knowledge-component-grain mastery, and the
prohibition on lesson-specific mastery logic. A `LQR-C01` transfer-validity judgment
about construct preservation is never itself a mastery-eligibility decision; only this
contract decides whether a response can move `pL` — the probability that the learner
has reached the learned or mastered state for a knowledge component under Bayesian
Knowledge Tracing (BKT), as the mastery contract defines it (see §3.4).

### 3.4 Quality contract — four companion documents

Read, in this order, before self-auditing any draft:

1. [`lesson-quality-rubric.md`](./lesson-quality-rubric.md), version `0.9.1` — the
   dimension cards and the one result algorithm (`FAIL > BLOCKED > PASS`).
2. [`lesson-quality-author-protocol.md`](./lesson-quality-author-protocol.md), version
   `0.3` — the drafting, evidence-discipline, and self-audit procedure this context
   feeds.
3. [`lesson-quality-evidence-protocol.md`](./lesson-quality-evidence-protocol.md),
   version `0.2` — exact evidence-manifest fields, branch-matrix minimums, rendered-
   capture minimums, contrast measurements, accessible-math transcripts, and
   judge-visible novice-walkthrough and blind-solve receipt shapes.
4. [`lesson-quality-judge-protocol.md`](./lesson-quality-judge-protocol.md), version
   `0.3` — the recommendation format a human or future judge produces from a self-audit;
   not a running service.

[`lesson-quality-rubric-anchors.md`](./lesson-quality-rubric-anchors.md) (anchor-set
`0.9.1-candidate`) and
[`lesson-quality-calibration-worksheet.md`](./lesson-quality-calibration-worksheet.md)
are calibration-track documents, not authoring inputs. Every anchor record is
`CANDIDATE_PENDING_REVIEW` with an empty `review_receipts[]`; **no anchor is
calibration authority, and none may be loaded as if it were a gold example.** Until an
evaluation harness and a `GOLD_APPROVED` anchor set exist, an agent may self-audit
against the rubric but must report quality status as `PENDING_HUMAN_REVIEW`, never
`PASS`, and must never claim that a self-audit is a judge recommendation, human
approval, registration, or publication decision.

### 3.5 Runtime, registration, and storage seams

Read before integration:

- the current real-lesson-catalog design note, if one exists in the repository at
  integration time, especially its provider and normalization sections — no such file
  is present in this working tree today, so treat this as an open documentation gap
  rather than a load-bearing reference;
- `services/lambdas/learner-api/src/lesson-content-provider.ts`;
- `packages/content/src/lesson-normalization/types.ts`;
- `apps/learner-web/src/app/lesson-catalog.ts`;
- `services/lambdas/learner-api/src/routes.ts`; and
- `services/lambdas/learner-api/src/catalog-lessons-mastery-integration.test.ts`.

`LessonContentProvider` is the storage boundary. The current implementation reads
repository artifacts; a future database-backed provider can replace that storage
without changing lesson semantics. New lessons must integrate through this provider
and must not add direct filesystem or database reads to the engine or browser, and
this file makes no claim that a database-backed provider exists today.

## 4. Documents that are context, not direct authority

- [`04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md`](../docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md)
  is a candidate design source, not an authority (rubric §1). Its own version line and
  changelog disagree internally, so cite it only with an exact commit or subject hash,
  never as a standalone unversioned reference.
- Lessons 1–3 are schema/runtime references and frozen candidate-source baselines
  (rubric §9.1), not presumed quality exemplars. Nothing in them is presumed to pass.
- Historical status files, retired plans, and stale roadmap descriptions do not
  override the current validator, curriculum manifest, or contracts.

## 5. Required per-lesson source packet

Before authoring, create a revision-bound source packet containing:

```text
request_id
requested_name
lesson_id
grouping_id
curriculum_manifest_sha256
phase_placements[]:
  phase_id
  source_relation_ids[]
module_placements[]:
  module_id
  source_relation_ids[]
pathway_placements[]:
  pathway_id
  source_relation_ids[]
sequence_positions[]:
  scope_id
  position
  source_relation_ids[]
ordered_kc_ids[]
kc_competency_and_scope[]
kc_non_goals[]
hard_prerequisites[]
helpful_context[]
attachments[]
source_anchors[]
open_holds[]
reasoning_operations[]
route_universe: [STANDARD, CONCISE, MISCONCEPTION, PREREQUISITE_SUPPORT]
route_proofs:                     (object, exactly four named members)
  STANDARD:             { route_applicability, absence_proof_ref, blocker_ref, evidence_refs[] }
  CONCISE:              { same shape }
  MISCONCEPTION:        { same shape }
  PREREQUISITE_SUPPORT: { same shape }
required_human_review_roles[]
source_records[]:
  source_id
  source_locator
  permitted_use
  rights_status
  permission_receipt_refs[]
rubric_path
rubric_version
rubric_sha256
anchor_set_version
output_directory
max_revision_cycles
```

The source packet is read-only input to the lesson author. A lesson name is never a
substitute for this packet. If any required field cannot be resolved, authoring is
`BLOCKED` rather than guessed.

**This packet is a strict superset of the author protocol's input contract**
([`lesson-quality-author-protocol.md`](./lesson-quality-author-protocol.md) §4): every
field that protocol requires appears above, and the packet constructed here feeds it
directly with nothing left to invent. Version `0.2` of this file claimed the same thing
while omitting `route_proofs`, `source_records[]`, the rubric identity triple,
`anchor_set_version`, `output_directory`, and `max_revision_cycles` — an agent that
built a packet from that list and then read the author protocol would find six required
inputs missing and, being told the packet was complete, would most likely supply them
itself. That is precisely how a route gets self-certified and a draft gets written into
the served catalog.

Four of these deserve a note:

- `route_proofs` is an object with exactly the four canonical members, not a list, for
  the reasons in the author protocol §4.2. It is supplied _to_ the author, not produced
  by the author: route applicability is a structural fact about the lesson, and an
  author who decides it is self-certifying.
- `source_records[]` carries `rights_status` per source. `PENDING` or `RESTRICTED` stops
  extraction, storage, and any calibration use before drafting begins, not after.
- The rubric identity triple pins which standard this lesson was authored against, so a
  later rubric version cannot silently relabel it.
- `output_directory` must be an isolated draft location outside `content/lessons/`, and
  `max_revision_cycles` a positive finite integer (default `3`).

## 6. Autonomous drafting workflow

For each lesson:

1. Resolve the exact canonical record from the requested name.
2. Generate and freeze the per-lesson source packet (§5).
3. Create an isolated branch/worktree and a draft directory outside
   `content/lessons/`.
4. Copy the structural template; replace all placeholder content and identity.
5. Author the four primary artifacts and any required learner-safe/protected files.
6. Preserve KC identity and order; author one complete microcycle per required KC.
7. Keep protected answers and scoring material server-only.
8. Run:

   ```bash
   pnpm --filter @mcat/content-cli start -- rehash <draft-directory>
   pnpm --filter @mcat/content-cli start -- lesson-validate <draft-directory>
   ```

9. Iterate until R1–R15 pass without weakening a rule or pin.
10. Produce draft-scoped proposed-KC and computed-quality reports through a reviewed
    authoring runner.
11. Self-audit all 12 quality dimensions, **once per applicable route**, using
    [`lesson-quality-rubric.md`](./lesson-quality-rubric.md) v0.9.1 and the procedure in
    [`lesson-quality-author-protocol.md`](./lesson-quality-author-protocol.md), and
    assemble the evidence bundle per
    [`lesson-quality-evidence-protocol.md`](./lesson-quality-evidence-protocol.md).
    Each route record pins `runtime_kind: vector | normalized` separately from
    `build_environment: PRODUCTION_BUILD | STAGING_BUILD | LOCAL_BUILD | PROTOTYPE`.
12. Stop for required human quality, SME, accessibility, and rights decisions —
    `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`, `ACCESSIBILITY_REVIEWER`, and
    `RIGHTS_REVIEWER` at minimum (rubric §7.4).
13. After approval, move the exact revision into `content/lessons/<slug>/`.
14. Register it in `REGISTERED_LESSONS`, add the normalized route slug, and pin the
    honest qualified-BKT observation count.
15. Run lesson, architecture, mastery-integration, typecheck, lint, and browser gates.
16. Return the exact artifacts, hashes, reports, blockers, and review receipts.

`rehash` and `lesson-validate` already accept an explicit draft directory.
`proposed-kcs` and `computed-quality` currently sweep only `content/lessons/`; running
their existing CLI commands while a draft lives elsewhere would report on the served
catalog, not the draft. Before unattended generation, extend both commands with an
explicit-directory input or build a reviewed authoring runner over their pure
functions. Until then, report those two draft checks as `BLOCKED_TOOLING_GAP`. Do not
place WIP under the served catalog merely to make a tool discover it.

## 7. Batch generation from a list of names

The controller may prepare several lessons in parallel only when:

- each lesson uses its own worktree and output directory;
- lesson agents treat curriculum and ontology inputs as read-only;
- agents never share writable artifact files;
- no lesson agent edits the central registration manifest, route registry, BKT pins,
  or shared generated data; and
- one integration owner serially applies those shared-file changes after every lesson
  independently passes its gates.

This allows autonomous content drafting without concurrent corruption of catalog
state.

## 8. Required agent output

For every requested lesson, return:

- resolution from requested name to canonical identity and placement (§3.1);
- source-packet path and input hashes;
- artifact paths and hashes;
- structural validation report;
- computed-quality report;
- proposed-KC report;
- route-proof status for each of `STANDARD`, `CONCISE`, `MISCONCEPTION`,
  `PREREQUISITE_SUPPORT` — all four members present, each with its state-specific proof;
- one rubric self-audit per applicable route, each with
  `route_recommendation.route_verdict` and `workflow_status: PENDING_HUMAN_REVIEW`;
- a trusted controller-generated `lesson_rollup` only if exactly one accepted,
  identity-matched route record exists for every `APPLICABLE` route; no agent/model
  output may synthesize a partial lesson aggregate. No such controller exists today,
  so current work reports the rollup blocker and emits no lesson aggregate;
- browser/evidence-bundle status per the evidence protocol, including contrast
  measurements, accessible-math transcripts, the exact runtime/build-environment
  pairing, and required novice/blind receipts where applicable;
- required human reviewers with receipt counts, and unresolved decisions;
- integration/test status; and
- one of `READY_FOR_HUMAN_REVIEW`, `BLOCKED`, or `INTEGRATED`.

The agent must not report `INTEGRATED` unless the exact approved revision is
registered, all required gates pass, and the working tree state is verified. The agent
must never report or imply `APPROVED`, `PUBLISHED`, `REGISTERED`, or a database write
occurred unless that exact action was performed and is independently verifiable in the
working tree.

## 9. Human gates that cannot be delegated away

Humans remain responsible for:

- product and pedagogical approval (`PRODUCT_PEDAGOGY_OWNER`);
- domain accuracy, construct identity, keys, and alternate valid answers
  (`DOMAIN_CONSTRUCT_SME`);
- accessibility and construct-equivalence approval, including the independent Safari +
  VoiceOver receipt (`ACCESSIBILITY_REVIEWER`);
- source and rights approval (`RIGHTS_REVIEWER`);
- adjudicating rubric boundary cases;
- approving any new KC, changed curriculum relation, placement, or hold disposition;
- deciding whether evidence supports efficacy, mastery, readiness, or rollout claims;
  and
- final publication/registration authorization once a quality gate is enforced — which
  it is not today.

## 10. Minimal future prompt

Once a task-packet generator and a quality harness exist, the intended user prompt is:

```text
Create these lessons: <exact lesson names>.

Read key-docs/autonomous-lesson-authoring-context.md and follow it as the controlling
workflow. Resolve each name against the canonical curriculum, generate isolated
source packets, author and structurally validate each lesson in its own worktree, and
stop only for the human gates the workflow names. Do not register or publish a lesson
whose quality report is missing, blocked, or unapproved.
```

Until the rubric harness and gold anchors exist, replace the last sentence with:

```text
Prepare each structurally valid lesson for human quality review; do not claim rubric
approval, register it, publish it, or write it to any database automatically.
```
