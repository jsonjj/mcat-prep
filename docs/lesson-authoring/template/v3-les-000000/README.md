# Canonical lesson template — `V3-LES-000000`

This directory is the smallest complete fixture for the shared lesson compiler. Copy it
when authoring a V3 lesson, then replace every template identity and every instructional
or assessment record.

It contains one real curriculum KC (`V3-KC-452593`) solely so the structural validator can
prove catalog resolution. The fixture is outside `content/lessons/`, so it is never served
or counted as a catalog lesson.

## Artifact set

- `lesson-script.json` — 17 ordered nodes covering the complete 15-function instructional
  contract, 10 measurable activities, 11 QEP records, and two finite repair → exact
  re-entry paths.
- `learner-safe-items.json` — answer-free learner prompts and authored response controls.
- `protected-items.json` — the server-only total answer authority for all 10 scored items.
- `kc-coverage-matrix.json` — one-KC route, exit, repair, and re-entry coverage.
- `lesson-presentation-plan.json` — one-KC screen order plus the focus, keyboard,
  responsive, representation, detail, callout, and reviewer-separation authoring surface.
- `lesson-quality-report.json` — honest candidate checks and blocked human/runtime gates.
- `artifact-manifest.json` — content and stored-byte hashes for all six JSON artifacts.

The normalized learner projection never contains protected answers, accepted responses,
rationales, or scoring authority. `compileCanonicalLesson` returns that learner model and
the protected answer key as separate objects.

Each measurable QEP record carries immutable-first-attempt semantics, authored assistance
affordances, evidence-mode metadata, and opaque answer/rationale authority refs resolving to
`protected-items.json`. The worked example is explicitly non-measurable: its activity,
first-attempt boolean, and authority refs are `null`, while its visible explanation remains
an authored assistance affordance.

Every screen authors the presentation fields used by focus and responsive checks. An empty
`collapsed_detail_ids` means the screen has no secondary disclosure; an
`important_callout_count` of `0` means it has no callout; and empty `reviewer_only_refs`
means reviewer material is wholly separated into protected artifacts. These values are
explicit semantics, not omitted authoring. `representation_ids` exactly mirror the screen's
script node. Content-only screens focus the heading and use heading → content → action
keyboard order; response-bearing screens additionally order the response control and
post-commit feedback region.

## Required authoring workflow

1. Replace the lesson, grouping, node, activity, item, semantic-family, and presentation
   identities without deriving routing from mutable titles or prose.
2. Preserve all 15 instructional functions and author both failed-function repair paths.
3. Author stable choice IDs or structured field IDs/labels and a protected answer for every
   scored item.
4. Regenerate the quality report honestly; do not claim efficacy, mastery, readiness, human
   review, accessibility review, browser QA, or production release without evidence.
5. Rehash the artifact chain:
   `pnpm --filter @mcat/content-cli start rehash docs/lesson-authoring/template/v3-les-000000`
   for this fixture, or replace the path with `content/lessons/<slug>` for a catalog lesson.
6. Run structural validation:
   `pnpm --filter @mcat/content-cli start lesson-validate content/lessons/<slug>`.

Read this fixture with the structural authoring spec and authoring runbook under
`docs/design/`.
