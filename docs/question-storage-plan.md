# Question Storage Plan — v7 as the schema of record

**Status:** IMPLEMENTED (2026-07-23). v7 is the canonical schema; the loader validates all 2,108 questions; the KC→cluster mapping is wired in; a Postgres migration + seed path exist. Loading into a **live** Postgres is the only remaining step and needs a running Postgres (local docker / Neon / Supabase) — see "Build status" below.
**Date:** 2026-07-23

## Build status (implemented)

- `packages/content/src/schema.ts` — v7 canonical schema (+ `assets` list).
- `packages/content/src/v7-cluster-map.ts` (+ `data/v3-cluster-map.data.ts`) — KC→lesson→cluster + section rollup; resolves all 2,108 with **zero gaps** (verified). Locked labels applied (SIRS4→R2, CARS_RWT→CA1). CROSS_SECTION is its own reasoning strand.
- `packages/content/src/compile.ts` — splits `correct_answer` + `explanations` into a **server-only** payload (learner-safe payload cannot represent them).
- `database/migrations/0006_question_bank.sql` — `questions` (learner-safe) + `question_protected` (server-only answer key + explanations).
- `tools/content-cli` — `load-v7` (validate/compile) and `db-seed` (emit a gitignored `seed.sql` with derived cluster/section; protected answers split out).

**DB recommendation:** it's Postgres either way. Use **local docker Postgres** for dev (`database/docker-compose.test.yml`), or **Supabase** (managed Postgres) for a hosted/shared DB. Same SQL.

**Load into a live Postgres (the remaining step):**

```bash
export DATABASE_URL=...            # local docker, Neon, or Supabase connection string
pnpm --filter @mcat/content-cli start -- db-seed   # regenerates content/question-bank/.local/v7-load/seed.sql (gitignored; has answers)
psql "$DATABASE_URL" -f database/migrations/0006_question_bank.sql
psql "$DATABASE_URL" -f content/question-bank/.local/v7-load/seed.sql
psql "$DATABASE_URL" -c 'select section, count(*) from questions group by section order by section;'  # bb 580 / cars 160 / cp 705 / cross_section 133 / ps 530
```

The seed file carries answer keys and is **gitignored** — it is never committed. Question DATA lives in the DB, not in git.

## Using the loaded DB from the apps / data layer (wired)

The Postgres connection is **env-configurable** — nothing is hardcoded. Point any Postgres (local, Supabase, Aurora) at the data layer:

```bash
export DATABASE_URL=postgresql://…      # e.g. Supabase Session pooler (IPv4, port 5432)
export DATABASE_SSL=no-verify           # Supabase managed CA; omit/`require` for RDS; `disable` for local
```

Read seam (`@mcat/persistence-postgres`), with answers server-only by construction:

- `createDatabasePoolFromEnv()` — builds a pool from `DATABASE_URL` / `DATABASE_SSL`.
- **Learner-safe** (cannot return the key/explanations — explicit column allowlist on `questions`): `getLearnerSafeQuestion`, `listLearnerSafeQuestions`, `countQuestions`, `countQuestionsBySection`.
- **Server-only**: `getQuestionAnswer` — reads `question_protected`; only the scoring authority may call it.

Verified live against Supabase: total **2,108**; sections cp 705 / bb 580 / ps 530 / cars 160 / cross_section 133; a learner-safe read returned a real item with **no** answer fields, and the server-only path returned its answer.

## Boundary — NOT done (separate reviewed step)

The learner apps + diagnostic/engine still run on the in-process **synthetic** bank via `AuthorityPort`; they are unchanged and still build/boot. Switching the engine to _serve_ from the live v7 bank is a larger, gated change that was intentionally not forced here. It requires, as its own PR: (1) an authority content-delivery adapter that reads through this seam and applies the KC→cluster rollup (`@mcat/content` `resolveV7Placement`); (2) reconciling the engine's `EngineQuestion` / 15-cluster projection with the KC-centric v7 model; (3) protected scoring wired to `question_protected`; (4) diagnostic item-eligibility / calibration gates.
**Decision:** Keep questions in the **v7 shape** (the generated JSONL format). We are **not** converting v7 into the repo's current `QuestionSchema`. Instead, **v7 becomes the official schema**, and the repo's content system will be updated to match it.

---

## TL;DR

- **Don't pick a new database.** Reuse what the repo already has: **PostgreSQL** (AWS **Aurora**-compatible).
- **Three layers:** v7 question records → **Postgres/Aurora** (serving) → **S3** (images / 3D / big files; the record stores a _link_, never the binary).
- **v7 is now canonical.** Update the repo's schema, importer, and templates to speak v7 — instead of remapping v7 into the old schema.
- **One new `assets` list per question** (for the image/table/3D/etc. that will be generated later). Empty for now.
- **Must-keep protection:** even though v7 stores the answer key and explanations inline, the server must still split those out so they **never** reach the browser.

---

## 1) Storage recommendation (recap)

Reuse the repo's existing choice — **PostgreSQL, Aurora-compatible**. No new database.

Three layers:

1. **Question records** — stored in **v7 shape** (source of truth for a question).
2. **Postgres / Aurora** — the serving database (fast lookup, learner data, keeps answer keys server-only).
3. **S3 (object storage)** — where the actual **images, 3D molecules, tables-as-images, big files** live. The question record only holds a **`storage_key`** (a link). Binaries never go in the DB.

Loop: **edit the record → load into Postgres → media sits in S3.**

---

## 2) Adopt v7 as the canonical schema

From inspecting the file (`generated-v7-dok-dynamic-final.jsonl`, **2,108 records**), here are the v7 fields grouped by role.

### Learner-facing core (required)

| Field     | Notes                                                                          |
| --------- | ------------------------------------------------------------------------------ |
| `id`      | Unique id, e.g. `v7-relabel-a538789a9daa94d4`                                  |
| `section` | Values seen: **BB, CARS, CP, PS, CROSS_SECTION**                               |
| `stem`    | Question text                                                                  |
| `passage` | Present on **all 2,108 rows** (may be a full CARS passage or a short vignette) |
| `choices` | Object keyed `"A"/"B"/"C"/"D"` → choice text                                   |

### Protected — SERVER-ONLY (never sent to the browser)

| Field            | Notes                                          |
| ---------------- | ---------------------------------------------- |
| `correct_answer` | Single letter, e.g. `"B"`                      |
| `explanations`   | Object keyed `"A".."D"` → per-choice rationale |

### Classification / routing metadata (used for diagnostics, coverage, mastery)

| Field                                                      | Notes                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `subject`                                                  | e.g. biochemistry, physics, organic_chemistry, sociology, critical_analysis, cross_section |
| `primary_skill`                                            | Values seen: **SIRS1–SIRS4** (science inquiry skills), **CARS_FOC / CARS_RBT / CARS_RWT**  |
| `primary_kc_id`, `primary_kc_label`                        | Knowledge-concept id + label                                                               |
| `secondary_skills`, `secondary_kc_ids`, `covered_kc_ids`   | Extra skill/KC tags                                                                        |
| `family_id`                                                | Item family (e.g. `fam-…`) — needed so a family fills a mastery slot once                  |
| `dok_level`, `dok_rationale`                               | Depth-of-knowledge (int) + reason                                                          |
| `construct`                                                | `{ reasoning_operation_id, topic_id }`                                                     |
| `surface`                                                  | `{ context_domain, distractor_structure, representation, value_set }`                      |
| `transfer_dimensions_changed`, `lesson_id`, `lesson_label` | Transfer + lesson linkage                                                                  |

#### Normalized `reasoning_operation` (the mastery axis)

`construct.reasoning_operation_id` is a **free-form v7 authoring string** and is not the mastery tag.
The mastery axis is the normalized `reasoning_operation`, whose only legal values are the seven
members of `ReasoningOperationSchema` in `packages/contracts/src/vocab.ts`: `IDENTIFY`, `PREDICT`,
`EXPLAIN`, `RELATE`, `QUANTIFY`, `DESIGN`, `EVIDENCE`. Rules for routing:

- Do **not** confuse it with `primary_skill` (`SIRS1`–`SIRS4`, `CARS_FOC/RWT/RBT`) or with the eight
  generic authoring-analysis tags `K/Q/E/D/P/A/I/T` (`OperationTagSchema`, same file). Three
  different vocabularies; only `reasoning_operation` moves a skill-grain `P(L)`. See
  `docs/content/question-format-guide.md`.
- Seeding from `primary_skill` + `construct.reasoning_operation_id` keywords is the mapping in
  `docs/mastery-pipeline.md` §6, and an SME may override it. A seeded value is a _candidate_ until
  reviewed.
- `dok_level` is a cold-start difficulty proxy only. An absent value is neutral, not an error
  (`coldStartB(undefined) === 0`); V3 lesson bindings restrict it to `1`–`4`, while v7 stays
  unbounded.

#### Lesson-binding metadata (V3 seam)

A v7 record's `lesson_id` is _linkage_, not authority. When a question is delivered inside a V3
lesson, the authoritative classification for evidence and mastery comes from that lesson's immutable
`LessonItemBinding`, not from the bank row: `question_id`, `binding_version` (opaque string),
`primary_kc_id`, `reasoning_operation`, `dok_level`, `semantic_family_id`, `activity_role`,
`representation_id`, `changed_dimensions`, and `candidate_evidence_modes`. Routing consequences:

- `primary_kc_id → EvidenceRecord.skillId` and `semantic_family_id → EvidenceRecord.familyId`; the
  family is what makes a recipe slot fill at most once.
- `itemVersion` on an evidence record is the server-resolved positive integer
  (`SERVER_ITEM_VERSION_RESOLUTION`), never a parse of `binding_version`.
- `candidate_evidence_modes` decides whether a response can ever reach BKT. No bank field, and no
  `lesson_id`, grants that.
- Storage must keep `correct_answer` and `explanations` server-only; the lesson seam reaches them
  only through `server_scoring_authority_ref` / `server_rationale_authority_ref`.

Full field semantics live in `docs/lesson-evidence-mastery-contract.md`.

### Internal / pipeline bookkeeping (never shipped; authoring + QA only)

`error_models`, `empirical_calibration`, `exposure_status`, `human_sme_review`, `certification_stage`, `status` (e.g. `production_candidate`), `pool`, `source_item_id`, `source_pool`, `quality`, `label_rationale`, `capstone_ids`, `extension_ids`, `prerequisite_kc_ids_used`, `prerequisite_lesson_ids_used`, `solution_path_id`.

> Rule of thumb for later: **3 buckets** — learner-safe (ships to browser), protected (server-only: `correct_answer` + `explanations`), internal (pipeline only, never ships).

---

## 3) NEW: one `assets` section per question (the key addition)

Add a single, flexible **list** to every v7 question — **not** a separate field per media type.

```json
"assets": [
  { "type": "plot", "status": "needed", "spec": "data/description used to generate it", "alt": "", "storage_key": null }
]
```

- **`type`** enum: `none | table | plot | diagram | molecule_2d | molecule_3d | equation | annotated_diagram`
- **`status`**: `needed | generating | ready` — everything starts empty / `needed` for now
- **`spec`**: the data/description used to _generate_ the asset (doubles as the source for accessibility text)
- **`alt`**: accessibility alt text
- **`storage_key`**: link to the file in S3 (`null` for now)

Why one list:

- Handles **0, 1, or several** assets on the same question (e.g. a plot _and_ a table).
- Adding a **new asset type later** doesn't change the shape — just a new `type` value.
- Mirrors how the repo already references media by id.

---

## 4) What changes in the repo to adopt v7 (checklist — NOT built now)

- **Rewrite `packages/content/src/schema.ts`** — replace `QuestionSchema` (and `Stimulus` / `Media`) with the **v7 shape + the new `assets` section**.
- **Regenerate `content/question-bank/schema/*.json`** from the new Zod (they're generated artifacts).
- **Replace `packages/content/src/import-candidates.ts`** — swap the "remap candidate → canonical" logic for a straight **"validate v7 JSONL → load"** path (v7 is now canonical, so no remap needed).
- **Update templates** — `content/question-bank/templates/question.template.json` and the CSV to the v7 shape.
- **CRITICAL — keep server-only protection.** v7 stores `correct_answer` + `explanations` **inline**. The compile step must still **split those into a protected payload** so they never reach the browser or any learner-safe surface. This is a must-keep, non-negotiable.
- **Section / skill mapping — a real decision (flag, don't solve now):**
  - v7 sections **BB / CARS / CP / PS / CROSS_SECTION** vs repo **cp / cars / bb / ps** (case + the extra `CROSS_SECTION`).
  - v7 skills **SIRS1–4 + CARS_FOC/RBT/RWT** (7 skills) vs the repo's **15 clusters (R1…CA2)**.
  - **`CROSS_SECTION` needs a home** (its own bucket, or split by subject).
  - Decide later: adopt v7's skill taxonomy, keep the 15 clusters, or map between them. This choice affects the diagnostic + planner.

---

## 5) Add / remove / edit workflow

- **Add:** add a v7 question record (a file, or a DB row once loaded).
- **Remove:** delete the record (or mark `status` retired — keeps an audit trail).
- **Edit:** change the record's fields.
- **Add an image (or any asset):** fill in that asset's `spec` → generate/upload the file to **S3** → set its `storage_key` (and `alt`). Flip `status` to `ready`.
- **Later:** the `admin-web` console gives a clickable GUI for all of this (no code editing to manage content).

---

## 6) Cheap hosting path (same SQL the whole way)

- **Now:** local Postgres (the repo already runs Postgres for dev/test).
- **Shared dev:** a free managed Postgres (**Neon** or **Supabase**).
- **Deploy:** **AWS Aurora PostgreSQL**.
- Same Postgres/SQL throughout — moving up the ladder doesn't require rewriting.

---

## 7) Archive constraint (do not violate)

- The v7 JSONL currently lives in the LOCAL archive:
  `/Users/jonat/Desktop/mcat-prep_LOCAL_ONLY_DO_NOT_PUSH_20260721_131303`
- **Read it read-only** for import. **Never copy that archive into the repo, and never push it.**
- The canonical store (repo files and/or the database) is **separate** from that archive.

---

## 8) Still open (decide next)

- **Skill/section taxonomy:** adopt v7's SIRS/CARS skills, keep the 15 clusters, or map between them? (Impacts the diagnostic + planner.) And where does **CROSS_SECTION** go?
- **Files vs DB for the source of truth:** 2,108 records — keep as JSON/JSONL files in git, or load straight into DB rows as canonical? (Files = easy diffing/review; DB = easier querying/editing at scale.)
- **Shared passages:** several CARS items share one passage (e.g. `value_set: passage-library-quiet`). Store each passage **once** and reference it, or keep it **inline** per question as v7 does now?
- **Difficulty:** v7 uses `dok_level` (small integer). The old schema used `difficulty` 1–5. Pick one and standardize.
- **Field buckets:** finalize exactly which fields are learner-safe vs protected vs internal.
- **Asset generation pipeline:** how assets get generated and reviewed (later).
