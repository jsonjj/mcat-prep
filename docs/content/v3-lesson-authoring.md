# V3 lesson authoring contract

This foundation defines how later curriculum batches can add canonical lesson
files without editing learner-web or the lesson reducer. The frozen
114-lesson/422-KC authoring manifest is present; approved lesson definitions are
not. The manifest alone is not a publication-readiness claim.

## Authority boundary

- Canonical `LessonDefinition` records live in `@mcat/content`, are parsed by
  `LessonDefinitionSchema`, and remain server-side.
- Correct choices, deterministic constructed-response matchers, response
  feedback, and diagnostic signal mappings never enter learner-web.
- `@mcat/authority-core` evaluates responses, reduces append-only
  `LessonRunEvent` records, and compiles only `LessonStepView`.
- learner-web imports the strict view/action contracts from `@mcat/contracts`.
  It must not import `@mcat/content` or `@mcat/authority-core`.
- Production adapters must store protected content and keys server-side. The
  synthetic registry requires the literal `test_fixture` mode; production mode
  rejects every `testOnly` definition.

## One file per lesson shell

Later batches should add definition modules under:

```text
packages/content/src/v3/lessons/V3-LES-….ts
```

Each module should export one schema-parsed `LessonDefinition`. A server-side
composition module can pass those exports to `LessonDefinitionRegistry`.
Generate `registryBinding` with `compileCanonicalLessonBinding` from
`curriculum/v3/v3-lesson-authoring-manifest.json`; do not hand-copy or
reinterpret its projection. Production registry construction must receive that
same manifest and rejects any binding drift. Do not infer missing IDs, counts,
ordering, scope, graph/sequence relations, holds, attachments, or instructional
content.

Adding a lesson should require only:

1. Add the definition module.
2. Add it to the server-side registry composition for its content release.
3. Add schema/semantic fixture tests for that definition.
4. Run content, authority, architecture, type, lint, and protected-content
   checks.

Do not add a screen, route, JSX branch, or runtime policy per lesson.

## Definition shape

Every definition pins:

- `schemaVersion: "4.0.0"`, stable `V3-LES-*` ID, semantic
  `definitionVersion`, and `contentRelease`;
- ordered `V3-KC-*` IDs matching the KC records exactly, plus registry-derived
  `orderedRequiredKcIds`. In the current release, `adaptiveBypassEnabled` is
  always `false` and both ordered lists are identical;
- the exact canonical registry artifact SHA and phase/canonical/graph/sequence
  freeze IDs through a compiler-produced `registryBinding`;
- a SHA-256 `contentDigest` and versioned `reviewEnvelope`, plus provenance,
  lifecycle status, timing, and `testOnly`;
- shell and per-KC checkpoint maps, segment/KC/shell duration models,
  keyboard/reduced-motion support, and an explicit reading order;
- separately typed support, extension, and capstone references. Support and
  extensions use `evidenceUse: "none"`; capstones use
  `"separate_capstone_only"`.

Each KC declares included/excluded scope, separate exact hard/helpful
prerequisites, representations, activities, timing, and one `KcMicrocycle`.
Every frozen representation label needs an explicit mapping to one or more
authored `V3-REP-*` IDs; do not infer coverage from display strings. Artifacts
exist only at lesson level, so a KC cannot invent or activate a second
attachment projection.

Non-text representations require a semantic description, data table,
transcript, or controlled reduced-motion alternative. Author only closed
structured equation, table, diagram, chart, simulation, animation, audio, or
video records. Media references must use reviewed local `/lesson-assets/`
paths. Add every media/caption path and reviewed SHA-256 to `reviewedAssets`;
the production registry also requires a byte-verified asset manifest with the
same hashes. Missing or drifted bytes fail closed. Arbitrary HTML, scripts, and
remote assets are invalid.

Each `ActivityDefinition` has a stable `V3-ACT-*` ID, item-family ID, construct
ID, phase, representations, assistance rules, response contract, timing range,
and uninterrupted-segment duration model.
Activity family IDs are lesson-global identities; they cannot be reused across
KCs because exposure and convergent evidence are lesson-global. Required-token
matchers use normalized Unicode letter/number boundaries, not substring
matching. Exit activities must be A0-only, reveal-disabled, and response-bearing.

## Required KC microcycle

Each of the four planner-selectable routes—`concise`, `standard`,
`prerequisite`, and `misconception`—must preserve this order:

1. Optional sealed instructional elicitation.
2. Orient/elicit.
3. Build model.
4. Show expert decisions.
5. Completion practice with performance-based A3 → A2 → A1 → A0 fading.
6. Contrast/bound.
7. Fresh unsupported near-use exit.
8. Fresh unsupported construct-preserving changed-task exit.
9. Targeted repair or KC handoff.

`workedDecisionActivityIds` must exactly name the `show_expert_decisions`
activities reachable from route instruction sequences; it is not a separate
unscheduled pool.

`PlannerInstructionResolution` is the sole initial-route authority. It binds
learner, lesson, KC, task kind, evidence cutoff, content/registry/policy pins,
diagnostic decision provenance, prerequisite qualification, exact
origin/reentry coordinates, expiry, and supersession lineage. The authority
rejects missing, misidentified, expired, unpinned, diagnostic-probe, or
unreplayable resolutions before rendering activity content. Stale or
conflicting concise/misconception provenance can only downgrade to `standard`.
Invalid prerequisite qualification also downgrades to `standard` and returns
support responsibility to the planner. A qualified hard blocking predecessor
pauses the KC at its exact checkpoint.

Entry probes are optional instructional elicitation only. When present, they
are sealed, unassisted A0, non-reveal responses with deterministic not-sure
signals. Their responses can inform later instruction and repair but cannot
change the already accepted planner route. The runner contains no posterior
threshold or probe-based route selector. A selected distractor remains one
hypothesis observation, not proof of a misconception.

Completion uses finite, support-level-specific `completionPools`. Each attempted
activity is fresh. Incorrect, not-sure, revealed, or assisted work schedules
another supported task and never advances to contrast/exit; exhausting a
bounded level pool pauses for planner reentry. Contrast and exit become
reachable only after the required unsupported A0 success.

Define enough distinct exit pairs for the initial attempt and both repairs in
every allowed run generation. Every exit family must be unique and unused by
instruction. The changed task uses the same `constructId`, sets
`constructPreserving: true`, and declares at least one change dimension.

Each repair cycle owns fresh targeted/generic repair candidates, distinct
representations, and separate finite recovery pools that re-establish A0.
Exactly one generic fallback is required per cycle. Targeted mappings select
from failed response signals/objective features with two-family convergence.

## Run and evidence semantics

`LessonRunState` is a version-bound instructional state, not an evidence
authority:

- run, learner, aggregate-stream, task-instance, task-kind, target-KC, planner
  resolution, evidence-cutoff, lesson/version/release, reviewed-content,
  canonical-registry, and policy pins are immutable;
- family exposure survives pause/resume and repair;
- event IDs and idempotency keys make replay deterministic;
- aggregate learner-stream concurrency and lesson-run concurrency are separate:
  HTTP envelopes carry the aggregate version, while `LessonStepView.runVersion`
  is the public token checked only against the lesson run;
- planner reentry uses a new run ID, explicit lineage, reviewed content pins,
  and an inherited family/key/feedback/reveal exposure envelope;
- lineage retains immutable reentry history plus exact per-KC counts; the global
  generation remains an audit ordinal, while each target KC enforces its own
  `maxReentryGenerations`;
- entry-probe feedback remains authority-private until all probes commit and
  route selection finalizes;
- exit feedback remains sealed until both responses exist;
- wrong, not-sure, revealed, or assisted work cannot reduce support;
- same/revealed/prior-exposed families cannot pass a fresh exit;
- after two failed repair cycles, the run pauses and only a planner-created
  reentry handoff can continue in a new run;
- malformed definitions fail to `invalid_content`; inconsistent accepted event
  streams fail to `blocked`.

Every accepted internal event commits a shell checkpoint and, when applicable,
a KC checkpoint in the same reducer transaction. Checkpoints bind the reviewed
definition hash, KC ordinal/state/node, actual assistance, accepted planner
instruction, immutable attempts, all family exposure, open feedback, repair
cycle, failed exit function, preserved successes, origin/reentry state and
coordinates, and the local event-stream sequence. State validation rejects a
missing, reordered, or forged checkpoint commit. Pause/resume uses the exact
committed checkpoint and cannot reset attempts or exposure.

When an exit pair fails, the run records whether `near_use` or `changed_task`
failed. A valid prior success remains preserved. Recovery emits
`kc_resumed_at_reentry` and schedules only the failed function; restarting from
near-use requires an explicit authority invalidation reason. Two bounded repair
cycles remain the maximum before planner handoff.

First attempts are immutable. A retry is a separate, non-evidentiary
`retry_observed` record with `retry_of`; it cannot overwrite the first attempt
or close repair. Intentional skip, valid timeout, and abandonment are explicit
not-sure administrations that cannot lower support. Technical, inaccessible,
and missing-telemetry omissions invalidate that administration, retain family
exposure, apply no learner penalty, and require an untouched substitute family.
Hint requests, answer reveals, assistance changes, and retries are separate
transitions. Hint or reveal requests after a committed response are rejected.

The authority projects private transitions to the versioned canonical
`LearnerEvent` wire boundary. External fields are snake_case, enum values are
UPPER_SNAKE_CASE, and canonical code-unit-sorted wire bytes are the only
hash/signature/replay material. Private event names, correctness keys,
matchers, sealed rationales, and diagnostic provenance are not serialized.
`lesson_delivery_completed` is authority-derived after every
`orderedRequiredKcId` has an instructional exit; it is not a learner action.

Duration is descriptive and observable, never a completion rule. Activities
model uninterrupted segments, KCs model microcycles, and the shell has its own
model. The current 18-minute value is only the provisional p90 policy input for
one uninterrupted segment. Every runtime observation records
`completionThresholdApplied: false`.

## Publication gates

`status: "published"` and `publicationIntent: "production"` must be set
together. Production registration fails closed unless:

- the definition digest and reviewed hash exactly match recomputed SHA-256;
- the binding exactly matches the frozen canonical manifest;
- source/model-processing rights and source-output similarity are cleared;
- independent content and domain reviews, blind solve, copy review,
  accessibility review, and final approval have reviewers and reports;
- author identities do not overlap any reviewer/solver/approver identity; and
- a publication content-freeze ID is present.

Drafts remain `publicationIntent: "internal_draft"`. Synthetic definitions
remain `testOnly: true` and can run only in explicit `test_fixture` mode.

KC success is named only `instructional_exit`. Lesson completion is derived
when every ordered required KC has that exit. Neither state contains aggregate
mastery or readiness. Any later evidence projection must consume separately
authorized events and preserve the support/extension/capstone boundaries.

## Synthetic fixture

`packages/content/src/synthetic/v3-lesson-foundation.ts` uses fictional Glimmer
dials and Nacre relays. It exists only to cover routing, fading, paired feedback,
repair exhaustion, multi-KC ordering, accessibility alternatives, and artifact
boundaries. It is not approved MCAT content and cannot load in production mode.

## Implementation status and known limitations

This is a pre-W00 foundation, not a production-readiness declaration. The
repository currently implements and tests the immutable definition, planner
resolution, private reducer/event, canonical lesson wire, checkpoint, learner
view, and browser-renderer contracts against synthetic content. It also
compile-validates all 114 frozen lesson bindings. It does not contain approved
lesson prose or assessment banks.

The following remain separate blockers:

- signed external registry/content/policy pinsets and signature verification;
- cloud diagnostic/evidence ingestion and a production planner that issues the
  resolution contract;
- the v7 question-bank eligibility adapter for lesson activity pools;
- durable database/event-stream transaction adapters and the opaque lesson
  authority service boundary;
- production asset storage plus byte-level reviewed-digest verification in the
  deployment environment;
- a browser interaction/accessibility harness with keyboard, focus,
  reduced-motion, responsive, and assistive-technology coverage beyond current
  schema and server-rendered component tests;
- canonical composition with the repository's pre-existing non-lesson learner
  events; and
- pilot-derived timing distributions, calibrated evidence policies, and
  learner validation.

Until those gates close, only explicit synthetic `test_fixture` execution is
supported. Do not mark W00 complete and do not register this fixture as
published curriculum.
