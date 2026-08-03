# Content and item bank — repo state (measured 2026-07-29)

Scope: curriculum architecture, question bank, labelling, calibration readiness, CARS generation, content integrity. Excludes React screen UX and backend request-path analysis.

**Sources measured:** `curriculum/v3/v3-lesson-authoring-manifest.json`, `content/question-bank/.local/db-pull/questions.json` (present, 2,108 rows), `packages/content/`, `apps/learner-web/src/app-native/`, `packages/cars-generation/`, `docs/research/calibration/00-README.md`.

---

## Lesson inventory

| Format | Count | Location | Learner-reachable? |
|--------|------:|----------|-------------------|
| V3 lesson shells (metadata + KC ordering) | **114** | `curriculum/v3/v3-lesson-authoring-manifest.json` | Browse-only via curriculum map |
| V3 curriculum UI projection | **114** | `apps/learner-web/src/data/curriculum-v3.generated.ts` | All 114 visible in `/app/curriculum`; **112 disabled** |
| App-native immersive lesson scripts | **14** | `apps/learner-web/src/app-native/*.script.ts` | **Yes** — `/app/lesson/:slug` via `APP_NATIVE_LESSONS` |
| Server-authoritative vector lesson | **1** | `packages/content/src/v3-vector-lesson-artifacts.ts` (`V3-LES-130923`) | **Yes** — Start/Continue from curriculum |
| Legacy enzyme synthetic lessons | **1** | `packages/content/src/synthetic/enzyme-bank.ts` | **No** — `test_only`, blocked from production |
| Diagnostic synthetic mirror | **2,108** drafts | `packages/content/src/diagnostic/fixture-bank.data.ts` | Test/simulation only (`diagnostic-synthetic-v1`) |
| Git-tracked per-question JSON | **0** | `content/question-bank/items/{bb,cp,ps,cars}/` | Scaffold only (`.gitkeep`) |
| Local DB pull (real bank) | **2,108** | `content/question-bank/.local/db-pull/questions.json` (gitignored) | Yes when published/loaded into runtime |
| Lesson-viewer dev copies | **5** scripts | `tools/lesson-viewer/src/app-native/` | Dev tool only (subset duplicate of app-native) |
| CARS generation fixtures | **3 passages / 16 items** | `packages/cars-generation/src/fixtures/` | Reviewer route `/cars-preview` only |

### Reachability summary

- **Playable lessons today: 15** (14 app-native + 1 vector lesson `V3-LES-130923`).
- **Browsable but not playable: 99** of 114 V3 shells (curriculum map shows them; no launch path).
- **Question delivery:** 2,108 production-candidate items exist in the local pull; `content/question-bank/README.md` states the canonical git tree starts empty until a validated bank is published.
- The user-facing note "~114 in-app lesson scripts" is **stale**; the registered app-native registry holds **14** entries (`apps/learner-web/src/app-native/index.ts`). One additional lesson (`V3-LES-130923`) is intentionally excluded from app-native and delivered by the vector-lesson runtime.

### V3 attachments (not standalone lessons)

From manifest metadata: **43 capstones** (42 required + 1 held), **53 extensions**, **11 support artifacts**, **422 KCs**, **114 groupings**, **40 modules**, **5 phases**, **7 pathways**.

---

## Taxonomy and mapping

### Knowledge components (422)

**Definition (authoritative):** `curriculum/v3/v3-lesson-authoring-manifest.json` → `curriculum.kcs[]`. Each KC carries: `kc_id`, `display_label`, `statement_of_competence`, `scope_in` / `scope_out`, `owning_lesson_id`, `representations`, `hard_prerequisite_ids`, `helpful_prerequisite_ids`, AAMC source anchors/pages, `learner_validation_status: "unvalidated"` (all).

**Grain:** 422 KCs → **114 lessons** (1–5 KCs per lesson; median **4**, min **1**, max **5**). Each KC belongs to exactly one lesson; zero orphans (verified in `packages/content/src/v7-cluster-map.test.ts`).

### Mapping layers

| Layer | Count | Authoritative? | Source |
|-------|------:|:--------------:|--------|
| KC | 422 | **Yes** (mastery unit) | V3 manifest / registry pin `635c39e9…ba26a` |
| Lesson shell | 114 | **Yes** (delivery context) | V3 manifest |
| App cluster (R1…CA2) | 15 | **Derived** UI rollup | `packages/content/src/data/v3-cluster-map.data.ts` |
| AAMC Foundational Concept (FC1–FC10) | 10 | **Derived** (diagnostic stratification) | `packages/policies/src/data/fc-lessons.generated.ts` |
| Reasoning operation (7 ops) | 7 | **Derived** at runtime | `packages/content/src/reasoning-operation.ts` |
| v7 section (BB/CP/PS/CARS/CROSS_SECTION) | 5 | Authored on item | Question `section` field |
| v7 skill (SIRS*, CARS_*) | 8 codes in bank | Authored telemetry facet | Question `primary_skill` |

**KC → lesson:** `KC_TO_LESSON` in `v3-cluster-map.data.ts` (auto-generated from registry; 422/422 covered).

**Lesson → ordered KCs:** `LESSON_TO_ORDERED_KCS` in `lesson-to-ordered-kcs.data.ts` (auto-generated from manifest `ordered_required_kc_ids`; teaching order ≠ KC id order for **100/114** lessons).

**KC → cluster:** `primary_kc_id` → owning lesson → `LESSON_TO_CLUSTER` (114/114 lessons mapped; **PS1 has 0 lessons / 0 KCs** by design — research/stats is the cross-section SIRS strand).

**Question → KC:** `kc_id` on each question (2,108/2,108 populated). **0** KC–lesson mismatches vs registry.

**Question → cluster:** `cluster` field on each question (2,108/2,108); matches adapter path (`bank-profiles.test.ts` pins exact counts).

**Question → FC:** No `foundational_concept` field on questions. FC is **derived** via `lesson_id` → `FC_LESSON` (**98/114** lessons tagged; **16 untagged** = all CARS + cross-section reasoning lessons). **297/2,108** questions (14.1%) sit on FC-untagged lessons and are **out of FC-10 diagnostic scope**.

**Question → reasoning operation:** **0/2,108** authored. Resolved deterministically from `primary_skill` (+ keyword parse of optional construct text, which is also absent). SIRS2 items (~59% of bank) split across EXPLAIN/PREDICT/RELATE/QUANTIFY via heuristics.

---

## Prerequisite graph, measured

Manifest: **634 edges** among **465 nodes** (422 KCs + 43 capstones). Breakdown by `edge_type`:

| Edge type | Count |
|-----------|------:|
| INTEGRATES | 336 |
| HARD_PREREQUISITE | 143 |
| APPLIED_TO | 57 |
| HELPFUL_PREREQUISITE | 33 |
| CO_DEVELOPS_WITH | 28 |
| CONFUSABLE_WITH | 23 |
| CAPSTONE_COMPONENT_READY | 14 |

### KC-only subgraph (422 nodes)

| Metric | All KC→KC edges (189) | HARD only (72) | HARD+HELPFUL (98) |
|--------|----------------------:|-----------------:|------------------:|
| Edges | 189 | 72 | 98 |
| Edges / KC | **0.448** | 0.171 | 0.232 |
| Undirected components | **256** | 350 | **326** |
| Isolated KCs (no incident edge) | 212 | 304 | — |
| Longest directed chain | 6 | 3 | — |
| Cycles (directed) | Yes (non-hard types) | **No** | **No** |

Full 465-node graph (634 edges): **105** undirected components, **85** isolated nodes, longest hard-capstone chain **5**, directed cycles present (non-blocking edge types).

### Prior claim verification (~0.42 edges/KC, ~286 components)

- **0.42 edges/KC:** **Confirmed** on KC→KC edges: 189/422 = **0.448**.
- **286 disconnected components:** **Not exact** on current manifest. Closest match: **326** undirected components on KC nodes using HARD+HELPFUL prerequisites (98 edges). HARD-only KC graph yields **350** components. Prior figure may reflect an older graph slice or different edge filter.

### Sequencing usability

**Poor for automated KC sequencing today.**

- Only **72** hard KC→KC edges; **304/422 KCs (72%)** are isolated under hard prerequisites.
- `scripts/generate-unlock-weights.mjs` documents: only **149/422 KCs** have any outgoing edge; **81** directed edges cross cluster boundaries — unlock weights **generated but not adopted** (`NOT YET ADOPTED` in file header).
- Graph semantics are **point-of-use** and **learner-unvalidated**; hard edges block specific unscaffolded uses, not entire lessons.
- Capstone/integration edges (336 INTEGRATES) add structure but not a simple linear syllabus.

---

## Question bank, measured

**Local pull present:** yes — **2,108** items, **2.08 MB** JSON.

### Totals and completeness

| Metric | Value |
|--------|------:|
| Total items | 2,108 |
| Distinct `question_id` | 2,108 (0 duplicate IDs) |
| Distinct `kc_id` | 422 (**0 KCs with zero items**) |
| Items per KC: min / median / max / mean | **1 / 5 / 16 / 5.0** |
| Status | 2,108 × `production_candidate` |
| DOK levels present | 1: 442, 2: 1,333, 3: 333, **4: 0** |
| Assets populated | **0 / 2,108** |
| Empirical IRT `b` / `difficulty` fields | **0 / 2,108** |

### Section distribution (question `section`)

| Section | Items | % of bank | AAMC scored-exam share* |
|---------|------:|----------:|------------------------:|
| cp | 705 | 33.4% | ~25.7% (59/230) |
| bb | 580 | 27.5% | ~25.7% |
| ps | 530 | 25.1% | ~25.7% |
| cars | 160 | 7.6% | ~23.0% (53/230) |
| cross_section | 133 | 6.3% | (SIRS strand; not a scored section) |

\*AAMC proportions from `docs/research/calibration/03-acquiring-calibration-data.md` (59+59+59+53 = 230 scored items). Comparing **bb+cp+ps+cars only (1,975 items):** CP **+7.7 pp**, CARS **−15.4 pp** vs exam.

### Cluster distribution (15 clusters)

| Cluster | Items | Notes |
|---------|------:|-------|
| CP2 | 265 | |
| PS3 | 267 | |
| PS2 | 257 | |
| BB1 | 237 | |
| CP3 | 219 | |
| BB2 | 205 | |
| CP1 | 137 | |
| BB3 | 128 | |
| BB4 | 96 | |
| CA2 | 87 | |
| R1 | 63 | cross-section |
| CA1 | 73 | |
| R2 | 40 | |
| R3 | 34 | |
| **PS1** | **0** | cluster exists in vocab; no authored items |

### FC distribution (derived via `lesson_id`, FC-10 axis)

In-scope FC-tagged items: **1,811** (matches `packages/policies/src/bank-profiles.test.ts`). Smallest bucket: **FC10 = 40** items (DOK 1/2/3: 4/32/4). Untagged-lesson items: **297** (all reasoning + CARS).

### Passage vs standalone

- **All 2,108 items** carry a non-empty inline `passage` string (1–3 sentence scenario/stem context).
- **No** shared `passage_id` / `stimulus_id`; **0** git-tracked stimuli files.
- **CARS subsection:** 160 items, **91 unique passage texts**, items/passage min/median/max = **1 / 1 / 8** — mostly single-item “passages,” not MCAT-style 5–7 question sets.

### Duplicates

- **0** duplicate question IDs.
- **46** duplicate stem groups (**100** items involved) — same normalized stem, different IDs (likely template families / parallel forms).

---

## Labelling and calibration readiness

### Metadata on each question (local pull)

| Field | Populated | Role |
|-------|----------:|------|
| `question_id` | 2,108 | Identity |
| `kc_id` | 2,108 | **Primary mastery tag** |
| `lesson_id` | 2,108 | Delivery / FC derivation |
| `cluster` | 2,108 | Derived 15-cluster rollup |
| `section` | 2,108 | v7 section |
| `primary_skill` | 2,108 | SIRS/CARS skill facet |
| `dok_level` | 2,108 | Depth of knowledge (1–3 only) |
| `family_id` | 2,108 | Intended item family |
| `subject` | 2,108 | Fine subject label |
| `stem`, `choices`, `passage` | 2,108 | Content |
| `foundational_concept` | 0 | Not stored on item |
| `reasoning_operation` | 0 | Derived at runtime |
| `secondary_skills` | 0 | — |

### Difficulty

- **No empirical difficulty.** `packages/policies/src/irt.ts` cold-starts from DOK (`coldStartB`: DOK1→−1.0 … DOK4→+1.0 logits).
- **`MIN_ATTEMPTS_FOR_B = 20`** — empirical switch threshold (calibration research recommends ≥100).
- DOK explains ~**1–5%** of item difficulty variance per `docs/research/calibration/00-README.md`.

### Item families

- **2,108 unique `family_id` values**; **0 families with >1 item** — every family is a **singleton**.
- IDs are **not** equal to `question_id` (they use `fam-*` hashes), but functionally there are **no multi-item families** for calibration inheritance.

### Response data

- **Zero production response data** (`docs/research/calibration/00-README.md`; `apps/learner-web/server/practice-bank-file.test.ts` expects `attempts === 0`, `b === null`).
- **Blocks calibration today:** no response log, no non-adaptive/spiralled first cohort (research Stage 0), families unusable, DOK-only priors, `MIN_ATTEMPTS_FOR_B` too low, items not `published`/review-approved per `validate.ts` eligibility rules.

---

## CARS

### Production bank

- **160 CARS items** (7.6% of bank vs ~23% exam share).
- **91 passage texts**; median **1 item/passage** (max 8).
- Skills: CARS_FOC 52, CARS_RWT 64, CARS_RBT 44 (~33/40/27% — exam target ≈30/30/40).

### `packages/cars-generation`

Generates **passage sets** from human-**approved blueprints**: passage (500–600 words, measured/resampled), then items with **specified distractor families**, deterministic audit, solver ablation battery, key adjudication. Pipeline version: `cars-gen-provisional-v1`.

**Fixtures (authored, not LLM-generated):** 3 passage sets, **16 items** total (EXAMPLE 5 + SKILL 6 + PERFORMANCE 5).

**CLI:** `tools/cars-generator/` — `audit`, `generate`, `calibrate` modes.

### Learner visibility

- **`/cars-preview`** (`CarsPreview.tsx`): internal reviewer sitting on fixtures; **explicitly not a learner surface** (no evidence minting).
- **Generated CARS content is not in the question bank** and is **not wired to practice/diagnostic**.
- **`/app/cars` (CARS Duel)** uses authority hooks, not generated passage sets.

---

## Coverage gaps

Compared to AAMC blueprint references in-repo:

1. **CARS under-represented:** 160 items (7.6%) vs ~23% exam — **~320 items short** by proportion.
2. **CP over-represented:** 705 (33.4%) vs ~25.7% — **~162 excess** by proportion.
3. **PS1 cluster empty:** 0 items (expected as UI view onto cross-section, but no PS1-tagged content).
4. **FC10 thin:** 40 items total (health/disparities strand).
5. **Cross-section SIRS:** 133 items (6.3%) — separate from 4 exam sections; important for skills but easy to double-count in section comparisons.
6. **No DOK 4** items in bank (DOK 3→4 step unevidenced for difficulty mapping).
7. **No figures/assets:** 0/2,108 — limits item types requiring diagrams, tables, 3D.
8. **CARS form factor:** bank lacks true multi-item passage sets (5–7 Q/passage); generation pipeline produces that shape but output not integrated.
9. **114 lesson shells vs 15 playable** — content delivery gap dominates “coverage” from a learner perspective.

---

## Content integrity risks

### Validation / QA in repo

| Mechanism | What it checks |
|-----------|----------------|
| `packages/content/src/validate.ts` | Choice uniqueness, rationales, eligibility vs review/rights |
| `tools/content-cli` | `validate`, `load-v7`, `schemas`, vector-lesson artifact validation |
| `scripts/generate-v3-lesson-authoring-manifest.mjs` + `.test.mjs` | Manifest pin integrity (counts, hashes, no machine paths) |
| `packages/content/src/v7-cluster-map.test.ts` | 114 lessons, 422 KCs, adapter coverage |
| `tests/architecture/curriculum-v3-parity.test.ts` | Generated curriculum matches V3 stats; no forbidden keys |
| `packages/policies/src/bank-profiles.test.ts` | Pins bank distribution to local pull snapshot |
| `packages/content/src/v3-vector-lesson-artifacts.ts` | `validateVectorLessonArtifacts` |
| `packages/cars-generation/src/checks/*` | Deterministic + solver + originality gates |
| `tests/architecture/v3-lesson-binding-conformance.test.ts` | Lesson/KC binding |

**Not present:** SME review workflow in repo, automated stem deduplication gate, learner validation (all KCs `learner_validation_status: unvalidated`), git-tracked canonical question files (0 JSON in `items/`).

### Generated / stale / duplicated artifacts

| File | Generator | Drift risk |
|------|-----------|------------|
| `apps/learner-web/src/data/curriculum-v3.generated.ts` | `generate-curriculum-v3.mjs` | Manifest change without regen breaks parity tests |
| `packages/content/src/data/v3-cluster-map.data.ts` | External V3 registry package | Requires registry regen; pinned SHA in header |
| `packages/content/src/data/lesson-to-ordered-kcs.data.ts` | From manifest | Same |
| `packages/policies/src/data/fc-lessons.generated.ts` | `generate-fc-lessons.mjs` | 16-lesson FC exclusion is intentional |
| `packages/policies/src/data/bank-profiles.generated.ts` | `generate-bank-profiles.mjs` | **Stale if local pull changes** — tests pin counts |
| `packages/policies/src/data/unlock-weights.generated.ts` | `generate-unlock-weights.mjs` | Generated but **not used** (graph too sparse) |
| `packages/policies/src/data/fc-axis.generated.ts` | `generate-fc-axis.mjs` | Diagnostic axis metadata |

**Duplication:** 5 app-native scripts copied under `tools/lesson-viewer/`. Diagnostic fixture bank (**2,108** synthetic items) mirrors real bank profiles for simulation — can drift from pull if `generate-bank-profiles.mjs` not re-run.

**Schema drift:** `content/question-bank/schema/question.schema.json` still describes old 15-cluster shape per `docs/concept-tree-and-mapping.md` §C.7; runtime uses v7 Zod schema in `packages/content/src/schema.ts`.

---

## Highest-leverage fixes in my area

Ranked by benefit / effort. Effort = engineering + content authoring where noted.

| Rank | Fix | Effort | Benefit |
|------|-----|-------:|---------|
| 1 | **Populate real item families** (≥2–8 variants per family, record `family_id` at authoring) | 40–80 h authoring + 8 h eng | Unlocks highest-ROI cold-start calibration path; hierarchical IRT pooling |
| 2 | **Close CARS coverage gap** (~150–200 net new CARS items or rebalance CP→CARS; prefer generated passage sets → bank ingest) | 60–120 h | Moves section mix toward 23% exam share; enables proper passage-set practice |
| 3 | **Publish bank to canonical git layout** (`items/`, review flags, `published` status) + run `content-cli validate` in CI | 16–24 h | Makes 2,108 items reproducible; unblocks production publication guardrails |
| 4 | **Regenerate / wire prerequisite graph for sequencing** OR explicitly disable graph-based unlock until edge density improves (currently 72% KC-isolated under HARD) | 24–40 h curriculum + 8 h eng | Prevents false confidence in auto-sequencing; unlock weights unusable today |
| 5 | **Integrate CARS generation output into bank** (approved blueprints → validated JSONL → publish) | 24–40 h | Closes form-factor gap (multi-Q passages); uses existing pipeline |
| 6 | **Raise `MIN_ATTEMPTS_FOR_B` to 100** and keep DOK cold-start until then | 1 h | Stops noisy early empirical overrides (calibration research: critical) |
| 7 | **Author PS1-view items or explicit cross-section tagging** for research/statistics cluster | 20–40 h | Removes 0-item cluster anomaly for diagnostics |
| 8 | **Expand playable lessons** (14 → 114 is multi-month; prioritize next 10 high-traffic shells) | 200+ h | Largest learner-facing content gap; not a quick fix |
| 9 | **Re-run `generate-bank-profiles.mjs` after any bank edit**; add CI check when pull updates | 4 h | Prevents silent diagnostic simulation drift |
| 10 | **Deduplicate / resolve 46 duplicate stem groups** | 8–16 h | Reduces learner confusion and exposure double-counting |

---

*Measurement script: ad-hoc Node analysis over manifest + local pull, 2026-07-29. Graph counts verified against manifest `metadata.counts` (634 edges, 422 KCs, 143 hard edges).*
