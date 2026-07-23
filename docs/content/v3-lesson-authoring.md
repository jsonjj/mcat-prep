# V3 lesson authoring contract

This foundation defines how later curriculum batches can add canonical lesson
files without editing learner-web or the lesson reducer. It does not contain the
canonical 114-shell/422-KC registry and is not a publication-readiness claim.

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
Registration must use the canonical registry IDs and versions supplied to that
batch. Do not infer missing IDs, counts, ordering, or instructional content.

Adding a lesson should require only:

1. Add the definition module.
2. Add it to the server-side registry composition for its content release.
3. Add schema/semantic fixture tests for that definition.
4. Run content, authority, architecture, type, lint, and protected-content
   checks.

Do not add a screen, route, JSX branch, or runtime policy per lesson.

## Definition shape

Every definition pins:

- `schemaVersion: "3.0.0"`, stable `V3-LES-*` ID, semantic
  `definitionVersion`, and `contentRelease`;
- ordered `V3-KC-*` IDs matching the KC records exactly;
- provenance, rights, copy/content/accessibility review, lifecycle status,
  timing, registry reference, and `testOnly`;
- keyboard/reduced-motion support and an explicit reading order;
- separately typed support, extension, and capstone references. Support and
  extensions use `evidenceUse: "none"`; capstones use
  `"separate_capstone_only"`.

Each KC declares included/excluded scope, prerequisites, representations,
activities, timing, and one `KcMicrocycle`. Non-text representations require a
text/table/transcript/reduced-motion alternative. Tables remain semantic table
data.

Each `ActivityDefinition` has a stable `V3-ACT-*` ID, item-family ID, construct
ID, phase, representations, assistance rules, response contract, and timing.
Exit activities must be A0-only, reveal-disabled, and response-bearing.

## Required KC microcycle

Each of the four routes—`concise`, `standard`, `prerequisite`, and
`misconception`—must preserve this order:

1. Enter/routing with at least two probe families.
2. Orient/elicit.
3. Build model.
4. Show expert decisions.
5. Completion practice with performance-based A3 → A2 → A1 → A0 fading.
6. Contrast/bound.
7. Fresh unsupported near-use exit.
8. Fresh unsupported construct-preserving changed-task exit.
9. Targeted repair or KC handoff.

`standard` is the sole fallback route. Every other route needs convergent
evidence from at least two distinct item families. A selected distractor can
emit a hypothesis signal, but one family cannot activate a misconception or
targeted repair.

Define three distinct exit pairs: the initial pair plus one pair for each of the
two bounded repair cycles. Every exit family must be unique and unused by
instruction. The changed task uses the same `constructId`, sets
`constructPreserving: true`, and declares at least one change dimension.

Repair mappings start with a targeted-repair activity and include completion
activities that re-establish A0 through performance. Exactly one generic
fallback is required. Targeted mappings require two-family convergence.

## Run and evidence semantics

`LessonRunState` is a version-bound instructional state, not an evidence
authority:

- run ID, lesson/version/release, and policy pins are immutable;
- family exposure survives pause/resume and repair;
- event IDs and idempotency keys make replay deterministic;
- exit feedback remains sealed until both responses exist;
- wrong, not-sure, revealed, or assisted work cannot reduce support;
- same/revealed/prior-exposed families cannot pass a fresh exit;
- after two failed repair cycles, the run pauses and only a planner-created
  reentry handoff can continue in a new run;
- malformed definitions fail to `invalid_content`; inconsistent accepted event
  streams fail to `blocked`.

KC success is named only `instructional_exit`. Lesson completion is derived
when every ordered required KC has that exit. Neither state contains aggregate
mastery or readiness. Any later evidence projection must consume separately
authorized events and preserve the support/extension/capstone boundaries.

## Synthetic fixture

`packages/content/src/synthetic/v3-lesson-foundation.ts` uses fictional Glimmer
dials and Nacre relays. It exists only to cover routing, fading, paired feedback,
repair exhaustion, multi-KC ordering, accessibility alternatives, and artifact
boundaries. It is not approved MCAT content and cannot load in production mode.
