# 06 — Lesson Authoring Workflow (author → validate → register)

**Status:** internal draft · **Companion to:**
[`05-LESSON-STRUCTURAL-AUTHORING-SPEC.md`](./05-LESSON-STRUCTURAL-AUTHORING-SPEC.md)
(the *what*). This document is the *how* — the exact, tool‑by‑tool runbook to take a
new V3 lesson from four draft artifacts to a registered, servable catalog member,
using only tooling that already exists.

All commands run from the repo root (`mcat-prep/`). The CLI is
`@mcat/content-cli`, invoked via its `start` script
(`node --import tsx src/main.ts`). Pass sub‑command flags after `--` so pnpm forwards
them.

---

## The seven steps

### 1. Draft the four artifacts

Create `content/lessons/<slug>/` with the four primary artifacts (and, for the
L2/L3 envelope, `artifact-manifest.json`). Follow the structural spec (doc 05):
`ordered_kc_ids` is the spine; every KC gets all 15 node kinds, a full micro‑cycle,
≥1 near and ≥1 changed exit, and complete coverage rows + kc_scripts. The fastest
honest start is to copy the shape of an existing lesson under `content/lessons/` and
replace its content — do not copy its hashes (step 2 recomputes them).

> Keep drafts OUT of `content/lessons/` until they are real. Any `lesson-script.json`
> under that root is swept into the architecture corpus (the 115‑binding pin in
> `tests/architecture/lesson-corpus.ts`) and the validate gate.

### 2. Rehash — compute every hash and chain

```bash
pnpm --filter @mcat/content-cli start -- rehash content/lessons/<slug>
```

`rehash` recomputes and repairs `content_sha256`, `file_sha256`, and the
`dependency_bindings` chain in place. It is **idempotent** — a consistent tree prints
`already consistent` and writes nothing. Never hand‑edit these values. Run rehash as
the **last** step after any content edit; forgetting it is the most common R3/R5
failure.

### 3. Validate — the R1–R15 merge gate

```bash
pnpm --filter @mcat/content-cli start lesson-validate            # human-readable
pnpm --filter @mcat/content-cli start -- lesson-validate --json  # machine-readable
```

This is the **CI merge gate**: it exits non‑zero on any failure. The pipeline runs it
exactly as `.github/workflows/aws-backend-ci.yml` does:

```bash
env -u TEST_DATABASE_URL pnpm --filter @mcat/content-cli start lesson-validate
```

Iterate steps 1–3 until the new lesson reports all of R1–R15 green. See the
failure → fix table below.

### 4. Proposed KCs — advisory, never a gate

```bash
pnpm --filter @mcat/content-cli start -- proposed-kcs           # print
pnpm --filter @mcat/content-cli start -- proposed-kcs --write   # update the managed block
```

Lists lesson KCs that are **absent from the curriculum catalog**
(`curriculum/v3/v3-lesson-authoring-manifest.json`). It mirrors R14's resolution set
but **never blocks** — it is the queue of KCs that need to be added to the graph
before the lesson can pass R14. If it lists any of your KCs, add them to the
curriculum (or fix a typo) rather than forcing them through.

### 5. Computed quality — plausibility, N/A never blocks

```bash
pnpm --filter @mcat/content-cli start -- computed-quality           # summary
pnpm --filter @mcat/content-cli start -- computed-quality --json    # detail
```

Checks `estimatedMinutes` plausibility and difficulty distribution. It reports **N/A**
(never blocks) when the inputs are uncalibrated, and only a genuine implausibility is
a **FAIL** that gates. Treat a FAIL as a real signal to revisit the numbers.

### 6. Register — make it servable (browser‑safe)

Add one `RegisteredLesson` entry to `REGISTERED_LESSONS` in
`apps/learner-web/src/app/lesson-catalog.ts`. This is the single source of
servability; Today's Path, Curriculum, and the router all read it. The **boot guard**
(`assertValidLessonRegistry`, runs at module load) throws unless your entry satisfies
**all** of:

- `lessonId` matches `V3-LES-######`, and is unique in the registry.
- `slug` and `routePath` are unique; `routePath === "/app/lessons/" + slug`.
- `runtime` is `'vector'` (L1's bespoke machine only) or `'normalized'` (everything
  else — the shared engine).
- `title === curriculum.shortTitle` for this id (from `curriculum-v3.generated`).
- `kcIds` equals the curriculum's ordered KC list for this id, in order.
- `cluster === ATLAS_LESSON_CLUSTER[lessonId]`.
- `estimatedMinutes` is an integer in `1..120`.
- every `prerequisiteLessonIds` entry is itself a registered lesson (closed set), and
  never itself.

Because the manifest is browser‑safe (imports only `@mcat/contracts` + the generated
curriculum, never node‑only `@mcat/content`), this guard is the browser‑side half of
validation; `lesson-validate` (steps 2–3) is the server/CI half.

**Route wiring.** A `normalized` lesson must also have its slug added to the server's
closed `NORMALIZED_LESSON_ROUTE_SLUGS` registry so its four routes
(`/v1/lessons/<slug>/status|start|run|commands`) resolve; the shared `CatalogLesson`
player then plays it with no per‑lesson UI code. A `vector` lesson reuses L1's bespoke
routes (do not add new vector lessons without extending that machine deliberately).

### 7. Pin the mastery contract

Add the lesson's honest qualified‑BKT observation count to the pins in
`services/lambdas/learner-api/src/catalog-lessons-mastery-integration.test.ts`
(derived from the real eligibility rules — see doc 05 §4), and update the catalog
aggregate. **Never loosen an existing pin** to make a new lesson fit; if the number
surprises you, the lesson is wrong, not the pin.

---

## Failure → fix (R1–R15)

| Validator says | Fix |
| --- | --- |
| **R1** missing primary artifact | Add the missing file of the four; check the filename exactly. |
| **R2** manifest reconciled only N/4 / missing file_sha256 | List every primary in the manifest; run `rehash` to populate `file_sha256`. |
| **R3** embedded content_sha256 != repo-canonical | You edited content without rehashing — run `rehash`. |
| **R4** file_sha256 != bytes | Same — `rehash` recomputes byte hashes. |
| **R5** chain: binding != upstream | A dependent artifact points at a stale upstream hash — `rehash` repairs the chain. |
| **R6** record not closed: `{extraKey}` | Remove/rename the stray key; allowed keys are `NODE_ALLOWED_KEYS` / `KC_SCRIPT_ALLOWED_KEYS` in `types.ts`. |
| **R7** browser evidence hash mismatch | Regenerate the browser report so `artifact_hashes` match, and embed its `sha256` in `evidence_refs`. |
| **R8** `<kc>`: missing node kind(s) | Author the missing kind(s) for that KC — all 15 required kinds per KC. |
| **R9** `<kc>`: route.exit_ids / repair_ids wrong | Give each of `concise`/`standard`/`misconception` exactly 2 exits + ≥1 repair. |
| **R10** dangling transition target | Point `authorized_next_node_ids` at real `node_id`s (or add the node). |
| **R11** duplicate semantic_family_id / exit coverage | Make every item's `semantic_family_id` unique; give the KC ≥1 near and ≥1 changed exit. |
| **R12** gate / eligibility / claim flag | Set `final_gate_status: BLOCKED`, `release_eligibility: INTERNAL_DRAFT_ONLY`, all five claim flags `false`. |
| **R13** label ≠ structure | Make role and exit function agree: NEAR_EXIT↔NEAR_USE, CHANGED_EXIT↔CHANGED_TASK, else NONE. |
| **R14** KC/relation not in catalog / refs ⊄ ordered_kc_ids / coverage incomplete | Use real curriculum KCs (see `proposed-kcs`); keep every KC ref inside `ordered_kc_ids`; cover every KC in rows + kc_scripts. |
| **R15** not servable / missing role | Ensure the lesson normalizes and every KC has ENTRY_CHECK + a practice role + NEAR_EXIT + CHANGED_EXIT + REPAIR_CONFIRMATION. |

When `lesson-validate` exits 0 for the new lesson, the registry boot guard passes, and
the mastery pin is set, the lesson is ready to serve.
