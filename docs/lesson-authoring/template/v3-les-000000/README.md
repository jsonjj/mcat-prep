# Lesson authoring template — `V3-LES-000000`

A **real, minimal, gate-passing lesson** you copy to start a new V3 lesson. It passes the
same structural validator the merge gate runs (`content-cli lesson-validate`, rules R1–R15)
and is pinned green by `packages/content/src/lesson-validator/template-sufficiency.test.ts`.

Read alongside:

- **[Structural authoring spec](../../../design/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md)** — what each artifact and rule requires.
- **[Authoring workflow / runbook](../../../design/06-LESSON-AUTHORING-WORKFLOW.md)** — the step-by-step draft → register path.

## Why it lives here (not under `content/lessons/`)

`content/lessons/` is the **served catalog corpus**: it is swept by the 115-binding corpus
pin and by the `lesson-validate` merge gate. A template there would corrupt those counts and
try to become a servable lesson. This template deliberately sits in the docs tree so it is
**validated on demand but never served and never counted**.

## What it is

The **single smallest complete authoring unit**: one knowledge component (KC) with its full
micro-cycle. It was derived by reducing the smallest real lesson (`V3-LES-844372`) to just its
GRAPH KC (`V3-KC-452593`) — 18 nodes (all 15 required kinds), 10 activities, 1 `kc_script`,
11 evidence items (entry-check → practice → near/changed exits → repair/re-entry), and 1
coverage row across 3 content routes.

Files (L1-style envelope: four primaries + learner-safe, **no manifest**):

| File | Role |
| --- | --- |
| `lesson-script.json` | nodes, activities, kc_scripts, `question_evidence_plan` (reduced to 1 KC) |
| `kc-coverage-matrix.json` | one coverage row (3 routes × 2 exits + repair) |
| `learner-safe-items.json` | the 10 learner-safe prompts the evidence items resolve to |
| `lesson-presentation-plan.json` | carried verbatim from the source (see caveat) |
| `lesson-quality-report.json` | carried verbatim; gate flags pinned `BLOCKED` / `INTERNAL_DRAFT_ONLY` |

### Caveats (honest scope of the reduction)

- `payload.transitions` is `[]` **by design**: a single-KC lesson has no KC→KC boundary
  hops. Intra-KC sequencing lives on `activities[].authorized_next_node_ids` (checked by R10).
- `lesson-presentation-plan.json` and `lesson-quality-report.json` are **carried verbatim**
  from `V3-LES-844372`. Only their hash chain (R3/R5) and the release-honesty gate (R12) are
  gate-relevant, so they validate as-is — but their *content* still describes three KCs.
  **Regenerate both for your lesson**; do not ship them unchanged.

## Using it for a new lesson

1. Copy this directory to `content/lessons/<your-lesson-slug>/`.
2. Replace the identity and authored content:
   - `V3-LES-000000` → your assigned lesson id (all four primaries carry it).
   - `V3-KC-452593` → your real curriculum KC id (must exist in
     `curriculum/v3/v3-lesson-authoring-manifest.json` → `indexes.kc_by_id`, or R14 fails).
   - node / activity / item / semantic-family ids and every learner-facing prompt.
   - Add one KC block per additional KC (repeat the 18-node micro-cycle + coverage row).
3. Regenerate the presentation plan and quality report for your lesson.
4. Fix the hash chain: `pnpm --filter @mcat/content-cli start rehash content/lessons/<slug>`.
5. Prove it: `pnpm --filter @mcat/content-cli start lesson-validate content/lessons/<slug>`
   — expect `PASS … 0 failing`.
6. Register + route it per the runbook.

## Regenerating this template

The template is a derived artifact. To re-derive after a source change, reduce `V3-LES-844372`
to its GRAPH KC, then `rehash` + `lesson-validate` the output. The one-time derivation script is
kept in the out-of-repo scratch area (not committed) to avoid shipping throwaway tooling; the
recipe above is the reproducible source of truth.
