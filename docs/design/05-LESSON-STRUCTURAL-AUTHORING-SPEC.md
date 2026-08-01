# 05 — Lesson Structural Authoring Specification

**Status:** internal draft · **Audience:** anyone authoring a new V3 lesson ·
**Scope:** the *structure* a lesson artifact set must have to be accepted into the
Real Lesson Catalog. Pedagogy, copy, and visual design live in
[`04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md`](./04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md);
this document is the *contract the machine enforces*.

> The single source of truth is the validator, not this prose. Every requirement
> below is enforced by a rule in
> `packages/content/src/lesson-validator/rules.ts` and gated in CI by
> `content-cli lesson-validate` (non‑zero exit blocks merge). If this document and
> the validator ever disagree, the validator wins and this document is the bug.
> The runbook that walks the tools is
> [`06-LESSON-AUTHORING-WORKFLOW.md`](./06-LESSON-AUTHORING-WORKFLOW.md).

---

## 1. What a lesson is, on disk

A lesson is a directory under `content/lessons/<slug>/` containing **four primary
artifacts**, each a JSON envelope whose content lives under a top‑level `payload`
object and whose identity is pinned by an embedded `content_sha256`:

| File | Carries |
| --- | --- |
| `lesson-script.json` | `ordered_kc_ids`, `nodes[]`, `activities[]`, `kc_scripts[]`, `question_evidence_plan[]` (the item bindings) |
| `kc-coverage-matrix.json` | per‑KC `rows[]` with `route_coverage` (exit/repair ids per route) |
| `lesson-presentation-plan.json` | the delivery/presentation plan |
| `lesson-quality-report.json` | release‑honesty gate + evidence refs |

Two envelope shapes exist and **both are valid**:

- **L1 envelope** (`V3-LES-130923`) — four files, **no manifest**. `content_sha256`
  is self‑describing; there is no `file_sha256` layer.
- **L2/L3 envelope** (`V3-LES-789208`, `V3-LES-844372`) — the four files **plus an
  `artifact-manifest.json`** that records a `content_sha256` and a `file_sha256`
  (SHA‑256 of the stored bytes) for each artifact. L2 and L3 differ in manifest
  spelling (`primary_artifacts`/`protected_material`/`learner_safe_projection` vs
  `companion_artifacts`); the validator reconciles both.

Author whichever envelope fits, but be consistent within a lesson. The validator is
shape‑tolerant (R1/R2), not shape‑prescriptive.

> **Placement warning.** Any directory containing a `lesson-script.json` **under
> `content/lessons/`** is swept into the architecture corpus (the 115‑binding pin in
> `tests/architecture/lesson-corpus.ts`) and the `lesson-validate` gate. Do **not**
> stage scratch copies, templates, or WIP drafts there — keep them elsewhere until
> they are a real catalog member.

---

## 2. The contract: R1–R15

Each rule is stated below as an **authoring requirement** and the **failure it
prevents**. Rule numbers are the validator's own (`rules.ts`).

### Envelope & hashing

- **R1 — All four primary artifacts present.** The manifest is optional (present
  L2/L3, absent L1). *Prevents a half‑authored lesson entering the catalog.*
- **R2 — Manifest reconciles (L2/L3 only).** Every primary artifact must appear in
  the manifest and every record must carry a `file_sha256`. N/A for the L1 envelope.
  *Prevents a manifest that silently omits an artifact.*
- **R3 — `content_sha256` is honest.** The embedded `content_sha256` must equal the
  repo‑canonical recomputation of the object **and** the manifest's copy. *Prevents a
  label that no longer matches the bytes it names.* Do not hand‑edit these — see §6.
- **R4 — `file_sha256` = SHA‑256 of stored bytes (L2/L3).** *Prevents a manifest
  hash that drifts from the file on disk.*
- **R5 — Dependency hash chain is intact.** `dependency_bindings` must chain
  upward from recomputed content hashes: coverage → script; presentation → script +
  coverage; quality → script + coverage + presentation. *Prevents editing one
  artifact and leaving its dependents pointing at a stale upstream.*

### Record shape

- **R6 — Nested records are closed.** Every `payload.nodes[]` record uses only the
  10 `NODE_ALLOWED_KEYS`; every `payload.kc_scripts[]` record uses only the 25
  `KC_SCRIPT_ALLOWED_KEYS` (see `types.ts`). *Prevents an unknown/typo'd field from
  being silently ignored by the runtime.*
- **R7 — Browser‑evidence hash binding (L1 only).** When a lesson ships browser
  evidence (`tests/browser/evidence/<id>/browser-report.json`), the report's
  `artifact_hashes` must equal the recomputed content hashes of
  script/coverage/presentation, and the quality report's `evidence_refs` must embed
  `sha256(reportBytes)`. N/A when a lesson ships no browser evidence.

### Instructional completeness

- **R8 — Every KC exhibits all 15 required node kinds.** For each id in
  `ordered_kc_ids`, its `nodes[]` must include every kind in `REQUIRED_NODE_KINDS`:
  `ENTRY_CHECK_BOUNDARY, ORIENTATION, EXPLANATION, MENTAL_MODEL, EXPERT_THINK_ALOUD,
  WORKED_EXAMPLE, GUIDED_PRACTICE, LIGHT_SUPPORT_PRACTICE, SOLO_PRACTICE,
  CONTRAST_BOUNDARY, NEAR_EXIT, CHANGED_EXIT, TARGETED_REPAIR, EXACT_REENTRY, RECAP`.
  This is a **superset** check — a lesson may add kinds (L3 authors `TRANSITION`).
  *Prevents a KC that skips a phase of the teaching cycle.*
- **R9 — Route coverage is complete.** Each `kc-coverage-matrix` row must, for each
  of the three route lanes `concise`, `standard`, `misconception`, carry **exactly 2
  `exit_ids`** and **≥1 `repair_ids`**. *Prevents a route with no way out or no
  repair path.*
- **R10 — Transitions resolve.** Every `activities[].authorized_next_node_ids`
  target must be a real `node_id`. *Prevents a dangling jump that strands the
  learner.*
- **R15 — Runtime‑servable micro‑cycle.** The lesson must normalize cleanly and
  **every KC** must carry a full micro‑cycle of item roles: an `ENTRY_CHECK`, at
  least one practice role (`GUIDED_PRACTICE` | `LIGHT_SUPPORT_PRACTICE` |
  `SOLO_PRACTICE`), a `NEAR_EXIT`, a `CHANGED_EXIT`, and a `REPAIR_CONFIRMATION`.
  *Prevents a lesson the delivery engine cannot actually run.*

### The exit model (the part that moves mastery)

- **R11 — Semantic isolation + per‑KC exit coverage.** Every item's
  `semantic_family_id` is unique, and each KC has **≥1 `NEAR_EXIT` and ≥1
  `CHANGED_EXIT`**. *Prevents two items testing the same thing, and a KC that can
  never demonstrate transfer.*
- **R13 — The label may not lie.** An item's authored exit **role** and its
  structural **exit function** must agree: `NEAR_EXIT ↔ NEAR_USE`,
  `CHANGED_EXIT ↔ CHANGED_TASK`, everything else `↔ NONE`. *This is the "label lies"
  catcher — it stops a near‑transfer item from being dressed up as a changed‑task
  exit (or vice‑versa) to game BKT eligibility.*

See §4 for how these roles map to mastery movement.

### Identity & honesty

- **R14 — KC and relation ids resolve.** Every KC referenced anywhere
  (`nodes.primary_kc_id`, `activities.primary_kc_id`,
  `question_evidence_plan.primary_kc_id`, `kc_scripts.kc_id`, coverage `rows.kc_id`,
  `attachment_bindings.host_kc_id`) must be in `ordered_kc_ids`; `ordered_kc_ids` and
  every `R14-*` relation token must resolve against the curriculum catalog
  (`curriculum/v3/v3-lesson-authoring-manifest.json`); and `kc-coverage-matrix` +
  `kc_scripts` must cover **every** declared KC. *Prevents inventing a KC or a
  relation that does not exist in the graph.* (Lesson‑local `claim` ids are
  intentionally not gated.)
- **R12 — Release honesty.** `lesson-quality-report.json` must pin
  `final_gate_status: "BLOCKED"`, `release_eligibility: "INTERNAL_DRAFT_ONLY"`, and
  all five `claim_limits` flags **false**: `learner_validated`,
  `efficacy_established`, `mastery_calibrated`, `readiness_validated`,
  `production_published`. *Prevents an uncalibrated draft from advertising itself as
  validated.* Flip these only when the corresponding evidence genuinely exists.

---

## 3. The KC micro‑cycle

`ordered_kc_ids` is the spine. For **each** KC you author, in order, a complete
teaching cycle expressed as `nodes[]` (all 15 kinds, R8) and delivered as a run of
`question_evidence_plan[]` item bindings whose normalized roles cover the micro‑cycle
(R15). The rollup membership for mastery is exactly `ordered_kc_ids` — the catalog's
`orderedKcsForLesson(lessonId)` must return the same set (cross‑checked by
`catalog-lessons-mastery-integration.test.ts`).

---

## 4. Exit model & BKT eligibility

Not every response moves mastery — and that is the design, not a shortfall.

- **Every** committed response **writes evidence** through the server‑authoritative
  path. Evidence is the audit trail; it is always recorded.
- **Only a licensed `CHANGED_EXIT` (transfer) item moves `P(L)`**, and only through
  the raised **lesson‑exit guess channel** (`source: 'lesson_response'`, using
  `LESSON_EXIT_GUESS_G` in `packages/policies/src/bkt.ts` — double the practice
  guess, so a lesson exit is *believed less* than the same answer earned in
  practice). Near/instructional items are delivered and recorded but move no grain.
- **Assistance fails closed.** A binding's `candidateEvidenceModes` defaults to
  `['INSTRUCTIONAL']`; an item is BKT‑eligible only when it is explicitly **licensed**
  to `['TRANSFER']` *and* delivered under an eligible (unassisted) mode. Licensing a
  changed‑task exit is a deliberate authoring act, not a default.

The honest per‑lesson qualified‑observation counts are pinned in
`catalog-lessons-mastery-integration.test.ts` (L1 = 6, L2 = 8, L3 = 6; catalog
aggregate 20). When you add a lesson, derive its count from the real eligibility
rules and pin it explicitly — never loosen an existing pin. Do **not** restate the
BKT math here; it lives in `packages/policies` and the design note.

---

## 5. Hashing & canonicalization

`content_sha256`, `file_sha256`, and the `dependency_bindings` chain (R3/R4/R5) are
**computed, never hand‑written**. Author the content, then run
`content-cli rehash content/lessons/<slug>` to (re)compute and repair every hash and
chain in place. It is idempotent — a clean tree prints "already consistent" and
writes nothing. Editing an artifact and forgetting to rehash is the most common way
to fail R3/R5; make rehash the last step before validate.

---

## 6. Definition of done (author checklist)

Before opening a PR for a new lesson:

1. Four primary artifacts authored under `content/lessons/<slug>/` (+ manifest if
   using the L2/L3 envelope).
2. `ordered_kc_ids` set; every KC has all 15 node kinds, a full micro‑cycle, ≥1 near
   and ≥1 changed exit, and complete coverage rows + kc_scripts.
3. Exit roles and exit functions agree (R13); changed‑task exits that should move
   mastery are explicitly licensed to `TRANSFER`.
4. All KC/relation ids resolve against the curriculum catalog (R14).
5. Quality report pins the honesty gate (R12).
6. `content-cli rehash …` run (hashes consistent).
7. `content-cli lesson-validate` is **green for the new lesson** (R1–R15, exit 0).
8. New lesson registered in the browser‑safe `REGISTERED_LESSONS` manifest and given
   a route (see the runbook, §6 of doc 06), and its qualified‑BKT count pinned.

If all eight hold, the structure is correct and the lesson is safe to serve.
