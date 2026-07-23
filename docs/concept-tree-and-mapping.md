# V3 Concept Tree + Mapping to the App's 15 Clusters

**Status:** Analysis / proposal only. No code or schema changed. Read-only study of the reference material.
**Date:** 2026-07-23 (updated with the newer *MCAT Learning System Design* package, v0.2.0)
**Sources:** the *MCAT Learning System Design* package (specs `01` Bayesian diagnostic, `02` complex-practice planner, `03` lesson structure) — treated as most up-to-date and authoritative — plus the earlier *MCAT-V3-Team-Package* (the pinned V3 registry + generated views) for the curriculum data itself. Cross-checked against the app's own code (`packages/contracts/src/vocab.ts`, `packages/content/src/schema.ts`, `packages/content/src/v7-cluster-map.ts`).
**Caveat:** V3 and these specs are "learner-unvalidated" by their own authors and pinned to the 2020 AAMC source. This doc reconciles labels; it does not endorse the content.

---

## TL;DR

- **The concept tree did not change.** The newer package pins the **exact same V3 registry** (same hash), so all counts and the tree below still hold: 422 KCs → 114 lessons, etc.
- **The newer package settles the big question:** the learning system is **KC-centric**. Mastery is tracked on **KCs** (plus capstones and a few special "governed operations"). **Sections are only a reporting dimension, and the 15 clusters are not part of the model at all** — they are an app-side rollup for the UI.
- **So the rule is simple:** map every v7 question to its **KC** first. Section and cluster are *derived* from the KC, not the other way round.
- **5 of the 6 open questions are now effectively resolved** (see the table). What remains is two *cosmetic* UI-grouping choices that don't affect the engine.
- **Sections map cleanly** (BB→bb, CP→cp, PS→ps, CARS→cars). `CROSS_SECTION` stays its own reasoning strand (it is *not* forced into cp).
- **PS1 "Research & Statistics" is confirmed empty of its own content** — research/stats is the shared cross-section reasoning strand, and the specs forbid cloning it into a Psych/Soc bucket.

---

## What the newer package changes

The new package is **three design specs** (how the diagnostic, the practice planner, and the lesson runtime behave). It is **not** new curriculum data.

- **Same curriculum, provably.** Spec `01` pins `registry_sha256 = 635c39e9…ba26a` — identical to the earlier package's manifest. The tree in Part A is unchanged.
- **New decision layer = KC-centric.** The canonical unit of "what a learner knows" is the construct:

```text
construct_type = KC | CAPSTONE | GOVERNED_OPERATION
```

  - *"Questions map primarily to KCs. A lesson ID supplies delivery context but is not a statistical mastery target."* (spec 01, §1.2)
  - The learner state matrix is over the **422 KCs**; *"Tags or lesson membership cannot become a Q-matrix."*
  - **Sections** appear only as a *stratification / readiness* dimension ("exam section and V3 source-section crosswalk"), never as a mastery target.
  - The **15 clusters (R1…CA2) are never mentioned.** ("cluster" in the specs only ever means a testlet *dependence cluster*.) They live in the app UI (`vocab.ts`), above the KC model.
- **Consequence for the mapping:** the app's clusters/sections are a **presentation rollup derived from the KC**, not the source of truth. The current `v7-cluster-map.ts` stub returning `null` is actually *consistent* with the specs (don't turn a skill tag into a mastery mapping) — the real mapping should go through the KC.

---

## Resolved vs still-open (the 6 earlier questions)

| # | Question | Verdict | What the new package says |
|---|---|---|---|
| a | Where does `CROSS_SECTION` go? | **RESOLVED** | Section isn't a mastery target. Cross-section reasoning is its **own SIRS/math strand** (7 lessons, 52 points of use), tracked by KC. Don't dissolve it into cp. Engine returning `null` for a content-section is fine. |
| b | R1/R2/R3 split, incl. SIRS4 | **RESOLVED as cosmetic** | The engine models KCs, not R-clusters, so the exact split doesn't affect routing or mastery. It's a UI grouping only. (Tiny preference still open: which bucket shows SIRS4 — see Part D.) |
| c | PS1 "Research & Statistics" (was empty) | **RESOLVED** | Research/stats = the shared cross-section SIRS strand (SIRS3/SIRS4). Specs **forbid cloning a shared SIRS/math KC into a content bucket** and forbid a second denominator. PS1 must be a *view* onto those shared KCs, not new PS-specific KCs. |
| d | Canonical authority: fix or redefine the 15 clusters? | **RESOLVED** | Neither. The package is **KC-centric and never uses the 15 clusters.** V3 KCs (+ capstones + governed operations) win; clusters are an app rollup. |
| e | CARS_RWT split across CA1/CA2 | **RESOLVED as cosmetic** | CARS is a strand keyed to CARS KCs (rolling 30/30/40 FOC/RWT/RBT). CA1/CA2 is a UI grouping only. (Tiny preference still open — see Part D.) |
| f | Enforce V3 skill / KC / lesson IDs as real enums? | **RESOLVED (nuanced)** | **Enforce** `primary_kc_id`/`covered_kc_ids`/`secondary_kc_ids` as valid `V3-KC-*` and `lesson_id` as valid `V3-LES-*`. Keep `primary_skill` (SIRS/CARS/MATH) as a **controlled-vocabulary telemetry facet — not a mastery key** unless a skill is promoted to a governed operation with its own contract. |

---

## Part A — The V3 concept tree (unchanged, verified)

### A.1 One-line shape

```text
AAMC 2020 source  →  KCs  →  Lessons  →  (delivery overlay: phases → modules → pathways)
```

The **KC** is the atom. Everything else either *contains* KCs (lessons), *schedules* them (phases/modules/pathways), or *hangs off* them (extensions, capstones, supports, graph edges).

### A.2 The tree with counts

```text
AAMC 2020 source  (pinned; 272 source occurrences, 1,604 source mappings)
│   tagged by: 4 sections · 10 Foundational Concepts (FC1–FC10) · ~40 content categories
│   plus a "skills" layer: SIRS1–4, CARS_FOC/RWT/RBT, MATH-ENABLING
│
├─ KC — Knowledge Component  ×422        "the smallest thing a learner can know/do"  ← the mastery unit
│     • belongs to exactly ONE lesson
│     • carries: scope in/out, representations, source pages, prerequisites
│
├─ Lesson (shell)  ×114                   "one sit-down unit of study" (delivery context, NOT mastery)
│     • holds 1–5 ordered KCs (never more)
│     • each lesson has one Grouping / "V3 cluster" (×114, 1:1) = the order/rationale of its KCs
│
├─ Attached to lessons/KCs (NOT separate mastery, with one exception):
│     • Extensions ×53      bounded variations (context / application / representation)
│     • Capstones  ×43      "coordinate several KCs at once" — modeled separately (42 required + 1 held)
│     • Supports   ×11      diagnostics / references / refreshers
│
├─ Prerequisite graph
│     • 465 nodes (422 KCs + 43 capstones), 634 edges
│     • only 143 "hard prerequisites" actually block progress; clean DAG (no cycles)
│
└─ Delivery overlay (scheduling only — no mastery lives here)
      • 5 Phases  →  40 Modules (35 teach new material + 5 review/synthesis)  →  ordered lessons
      • 7 Pathways (Comprehensive, Accelerated, 3 remediation, CARS-parallel, SIRS/Math)
```

### A.3 What each level means (parent → child)

- **Section** (biggest bucket): the 4 exam areas — Bio/Biochem, Chem/Phys, Psych/Soc, CARS. *In the new model this is a reporting/stratification tag, not a mastery target.*
- **Foundational Concept (FC1–FC10)** and **content category (1A…10A)**: AAMC's official content outline; lessons are tagged with these.
- **Skills layer** (a *separate* axis from content — the AAMC reasoning skills):
  - `SIRS1` Knowledge of Sci. Concepts · `SIRS2` Reasoning & Problem-Solving · `SIRS3` Research Design · `SIRS4` Data-Based & Statistical Reasoning.
  - `CARS_FOC` Foundations of Comprehension · `CARS_RWT` Reasoning Within the Text · `CARS_RBT` Reasoning Beyond the Text.
  - `MATH-ENABLING` the allowed math toolkit (no calculus, no vector dot/cross products).
  - *In the new model these are telemetry facets, or KCs in their own right — not a second mastery scale.*
- **KC**: the graded, portable "can-do" claim. **Mastery, evidence, and repair all attach here.**
- **Lesson**: the container a learner works through; 1–5 KCs in a fixed order. *Delivery context, not mastery.*
- **Module → Phase → Pathway**: purely *when/where* a lesson is delivered.

### A.4 The important subtlety: two meanings of "cluster"

| Term | In **V3 / the specs** | In the **app** |
|---|---|---|
| "cluster" | Either a single lesson's internal grouping of its KCs (114, IDs like `V3-CL-006619`) **or** a testlet "dependence cluster". Never a top-level skill bucket. | One of **15** big learner-facing skill buckets (R1…CA2). |

There is **no single V3 object that equals the 15 app clusters.** The closest V3 level is the **40 modules**, which group naturally into the 15. The clusters are an app-side rollup — fine to keep for the UI, but the engine should route on the KC.

---

## Part B — Proposed mapping (reconciled)

> **The one rule:** `v7.primary_kc_id` → the V3 KC is the source of truth. **Section** and **cluster** below are *derived rollups* of that KC (plus `v7.section`), not independent truth.

### B.1 v7 `section` → the app's 4 sections — **RESOLVED**

| v7 `section` | App section | V3 lessons | Notes |
|---|---|---|---|
| `BB` | `bb` | 32 | — |
| `CP` | `cp` | 36 | +6 biochem lessons are also tagged CP (so "42" appears in the explainer — see C.5) |
| `PS` | `ps` | 30 | — |
| `CARS` | `cars` | 9 | — |
| `CROSS_SECTION` | *(own reasoning strand; no content section)* | 7 | The SIRS/math strand. Track by KC. Engine `null` is correct; **do not fold into cp**. |

### B.2 v7 `primary_skill` → treatment — **RESOLVED (telemetry facet, not a mastery key)**

Keep as a controlled vocabulary for reporting; it does **not** own learner state (a KC does). It *decides* a UI cluster only for the pure-reasoning strands (CROSS_SECTION → R-clusters, CARS → CA-clusters); for BB/CP/PS content questions the cluster comes from the KC.

| v7 `primary_skill` | AAMC meaning | UI rollup |
|---|---|---|
| `MATH-ENABLING` | General math toolkit | R1 |
| `SIRS4` | Data-Based & Statistical Reasoning | R2 *(or R1 — cosmetic, see Q-b)* |
| `SIRS1` | Knowledge of Sci. Concepts | R2 |
| `SIRS2` | Reasoning & Problem-Solving | R3 |
| `SIRS3` | Reasoning About Research Design | R3 |
| `CARS_FOC` | Foundations of Comprehension | CA1 |
| `CARS_RWT` | Reasoning Within the Text | CA1 *(structure)* / CA2 *(argument)* — cosmetic, see Q-e |
| `CARS_RBT` | Reasoning Beyond the Text | CA2 |

### B.3 v7 KC / lesson → the 15 clusters (UI rollup, zero gaps)

Path: **`primary_kc_id` → owning V3 lesson → that lesson's module → cluster.** Covers **all 422 KCs / 114 lessons with no gaps.**

| App cluster | V3 lessons | V3 KCs | Built from these V3 modules |
|---|---:|---:|---|
| **R1** Quantitative Reasoning | 3 | 10 | Quantitative & Representation Entry (Vectors, Measurement/Scaling, Algebra) |
| **R2** Data & Representations | 2 | 8 | Concepts & Representations (SIRS1), Draw Warranted Conclusions (SIRS4) |
| **R3** Experiments & Evidence | 2 | 8 | Reason With Models (SIRS2), Analyze Research Design (SIRS3) |
| **CP1** Mechanics & Fluids | 7 | 26 | Mechanics & Measurement Entry, Mechanics/Energy/Fluids, Gas & Fluid Transfer |
| **CP2** Electricity/Waves/Optics | 13 | 49 | Electricity/Capacitance/Magnetism, Waves/Sound/EM, Optics/Spectroscopy/Separation, Electrochem/Nuclear/Nerve |
| **CP3** Chemical Systems | 12 | 51 | Molecular Structure & Reaction Entry, Thermal/Equilibrium/Acid–Base, Organic Reaction Models |
| **BB1** Biomolecules & Metabolism | 13 | 43 | Cellular & Biomolecular Entry, Protein & Enzyme Models, Metabolism & Bioenergetics |
| **BB2** Cells & Genetics | 11 | 44 | Genetic Information Flow, Cells/Microbes/Development, Inheritance & Evolution |
| **BB3** Signaling & Organ Systems | 7 | 24 | Neural & Endocrine Signaling, Transport/Exchange/Waste |
| **BB4** Immunity & Development | 5 | 18 | Defense/Support/Motion, Reproduction & Development |
| **PS1** Research & Statistics | **0** | **0** | *(none of its own — it is a view onto the shared cross-section SIRS/stats KCs; see C.3)* |
| **PS2** Mind & Behavior | 15 | 57 | Behavioral Foundations, Learning/Memory/Cognition/Language, Socialization/Self/Personality/Emotion, Psychopathology |
| **PS3** People & Society | 15 | 51 | Social Cognition & Interaction, Social Structures & Culture, Population/Inequality/Change |
| **CA1** Passage Structure & Evidence | 4 | 16 | CARS Local Text Entry, CARS Global Frame & Distant Integration |
| **CA2** Inference & Argument | 5 | 17 | CARS Argument & Within-Text, CARS Whole-Passage & Conditional Transfer |
| **Total** | **114** | **422** | |

### B.4 Recommended enforcement — **RESOLVED (nuanced)**

- **KC IDs** (`primary_kc_id`, `covered_kc_ids`, `secondary_kc_ids`): validate against the pinned V3 registry — they are the state owners; every one must be a real `V3-KC-*`.
- **`lesson_id`**: validate as a real `V3-LES-*`. It's delivery context, not mastery.
- **`primary_skill` / `secondary_skills`**: enforce the closed vocabulary (`SIRS1–4`, `CARS_FOC/RWT/RBT`, `MATH-ENABLING`) as a **telemetry facet only**. Don't build mastery on it.
- **`section`**: normalize to `bb/cp/ps/cars`; keep `CROSS_SECTION` as a distinct strand tag.
- (These are recommendations. The build is done; this doc does not change code or schema.)

---

## Part C — Consistency check

### Clean and trustworthy

- **Both packages pin the same V3 registry** (identical hash), and the lesson plan's counts match the data exactly: 422 KCs · 114 lessons · 114 groupings · 53 extensions · 43 capstones (42 + 1 held) · 11 supports · 634 edges (143 hard) · 5 phases · 40 modules · 7 pathways.
- **No orphans, no duplicates:** every KC has a valid owning lesson; every KC is in exactly one lesson; every lesson has 1–5 KCs; 0 duplicate labels; all capstone/extension/support hosts resolve; graph is acyclic.
- **v7 → V3 IDs are real** (spot-checked `V3-KC-534000` = "Trace sequence and interactions to protein structure").

### Now resolved by the newer package

1. **CROSS_SECTION** has a clear treatment (own SIRS/math strand, tracked by KC) — no longer a dangling case.
2. **PS1 empty (0/0)** is expected, not a bug: research/stats is the shared cross-section strand, and cloning it into a PS bucket is explicitly forbidden.
3. **"Which taxonomy is canonical?"** is settled: **KCs** are canonical; the 15 clusters are a rollup.

### Still worth a human eye (not blocking)

4. **"Cluster" name collision** remains (V3 groupings / dependence clusters vs. the app's 15). Recommend not calling the app buckets "clusters" in V3/spec contexts.
5. **Section labels vary across sources** (full names / `Bio/Biochem` / `B/B` / `BB` / lowercase `bb`); normalize in one place. The explainer's "footprint" (Chem/Phys 42, etc., summing to 134 > 114) is double-counting cross-listed lessons, not a real conflict; the true per-lesson split is BB 32 / CP 36 / PS 30 / CARS 9 / CROSS_SECTION 7 = 114.
6. **A few fuzzy content placements** in the UI rollup (not errors): electrochemistry & spectroscopy/separation (CP2 vs CP3); muscle/skeletal (BB3 vs BB4); membrane transport & organelles (BB1 vs BB2); "Developmental Cell Fate" (BB2 vs BB4). These only affect which bucket a KC displays under, not its mastery.
7. **Repo drift (side note):** `content/question-bank/schema/question.schema.json` is still the old 15-cluster question shape, and `docs/question-storage-plan.md` says "nothing built" though the v7 loader/validator exist. Not a tree problem; relevant when wiring v7 in.
8. **Open V3 holds** remain (page-89 scope ambiguous/non-required; knowledge-type tags unratified; everything learner-unvalidated; adaptive bypass disabled). None block the mapping.

---

## Part D — Still genuinely open (both are cosmetic UI-only choices)

These do **not** affect the engine (it routes on KCs); they only affect which label a reasoning question shows under.

1. **SIRS4 bucket:** show "Data-Based & Statistical Reasoning" under **R2 (Data & Representations)** or **R1 (Quantitative Reasoning)**? *Recommend R2* (the AAMC name leads with "Data-Based").
2. **CARS_RWT bucket:** "Reasoning Within the Text" spans structure and argument. *Recommend* CA1 = comprehension + structure (FOC + within-text structure), CA2 = argument + beyond-text (RWT-argument + RBT).

Everything else the newer package determines. If you're happy with the two recommendations above, there are **no open decisions left** for this mapping.
