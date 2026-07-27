# MCAT Mastery Pipeline — Implementation Plan & Producer Input Contract

> **Status:** Implementation in progress on branch `cursor/mastery-tracking-system-b8df`.
> This document is the single source of truth for the mastery *engine* and, critically, the
> **input contract** every other system (lessons, question bank, diagnostic, CARS, recall) must
> satisfy so it can feed the mastery pipeline. Sections marked **[SIGN-OFF]** contain proposals for
> the owner to confirm.
>
> Source spec: `MCAT_MASTERY_PLAN.md` (BKT/IRT/Mastery-Learning hybrid), reconciled with the
> existing app per the recorded Q&A.

---

## 0. TL;DR

- Mastery is a **probability `P(L)` per unit**, updated by **Bayesian Knowledge Tracing (BKT)**;
  **IRT** turns item difficulty into the BKT *slip*; **Mastery Learning** sets the `P(L) ≥ 0.95`
  cut. A **forgetting** layer decays `P(L)`; a **prerequisite** layer reinforces 1-hop
  prerequisites on correct answers. **CARS** is a separate **IRT ability `V`**.
- **`P(L)` replaces the evidence-ladder rungs** as the definition of "mastered" (owner decision).
  Evidence records are still logged, but the *number* shown to the learner comes from `P(L)`.
- **Fail-closed:** only **independent** attempts (A0, no content-bearing hint, not a diagnostic
  retry, not post-reveal) move `P(L)`. Assisted/revealed/guessed work never mints mastery.
- Runs **server-side**; per-user values persist in **new Postgres tables**. The client displays.
- Grain: **KC** (stored, hidden), **7 skills** (Skills page bars), **lesson** (Progress brain),
  **CARS** (3 sub-skills + overall readiness).
- The diagnostic **seeds** initial values only (asymmetric, capped ≤ 0.4). It never awards mastery.
- **FSRS stays with the separate Recall/flashcards feature.** Mastery decay is BKT-based.

---

## 1. Locked decisions (owner Q&A)

| # | Decision |
|---|---|
| Mastery definition | `P(L) ≥ 0.95` **replaces** the evidence-ladder rungs |
| What moves `P(L)` | **Only independent** attempts; up on correct, **down on wrong**; assisted/revealed = "instruction" (may set *Learning*, never moves the number) |
| KC cardinality | **Single primary KC** per item |
| Display | **7 skills** on Skills page (7 percentage bars; the 15 clusters are removed), **per-lesson** on Progress (brain nodes), KC stored but hidden. **Continuous percentages**, not discrete states |
| Skill set | The **7 reasoning operations** (IDENTIFY / PREDICT / EXPLAIN / RELATE / QUANTIFY / DESIGN / EVIDENCE), all displayed, no merge |
| Forgetting | BKT half-life governs concept/KC/skill/lesson decay; **FSRS** stays for the separate Recall feature |
| Daily decay | **Lazy** (`P(L)·2^(−daysElapsed/H)` on read/update); no cron |
| Review line | Due when `P(L)` decays **below 0.90** |
| Diagnostic → mastery | **Seed only** (asymmetric, cap ≤ 0.4), never mints mastery |
| Engine location | **Server-side**; new Postgres tables; both the deployed learner-api and the in-process authority-core run the same pure engine |
| Item difficulty `b` | `question_stats` table; `b = 0` until > 20 attempts, **DOK cold-start** before that |
| Prereq graph | Build now, `w = 0.5`; 1-hop V3 edges; inert until the graph is loaded |
| BKT formulas | Implemented **exactly as written** (learning nudge on every independent answer) |
| CARS Duel → skills | Position→FOC, Argument→RWT, Application→RBT |
| CARS readiness source | **Both** PotD (K=0.3) and Duel (K=0.08) update the same `V`; overall readiness = mean; on-track `V ≥ 1.7` |
| Recall shim | **Replace** the client-side cluster-FSRS demo with a mastery-driven due-review surface |

---

## 2. The engine (implemented in `@mcat/policies`, `mastery-bkt / provisional-v1`)

Pure modules: `irt.ts`, `bkt.ts`, `forgetting.ts`, `prerequisite.ts`, `cars.ts`, `mastery-seed.ts`,
`mastery-attempt.ts`.

- **Difficulty / slip** (`irt.ts`): `b = ln((1-p)/p)` once > 20 attempts, else `coldStartB(dok)`
  (`1:-1.0, 2:-0.3, 3:+0.4, 4:+1.0`). `slip = S_m / (1 + e^(m-b))`.
- **BKT** (`bkt.ts`): the exact RIGHT/WRONG posterior + learning nudge `+ (1-P(L))·T`; mastered at
  `P(L) ≥ 0.95`. Only **independent** attempts reach this (enforced by the authority).
- **Forgetting** (`forgetting.ts`): lazy `currentPL`; `stepMemory` decays → BKT → doubles `H` on a
  successful due review (decayed `P(L) < 0.90`) or resets to 7 on failure.
- **Prerequisite** (`prerequisite.ts`): `H_A *= 1+w`, `P(L)_A += (1-P(L)_A)·(w·T)` on a correct
  answer (1-hop only; inert until the V3 edges are loaded).
- **CARS** (`cars.ts`): `V = V + K·(R − σ(V−b))`; rubric→R; overall = mean of FOC/RWT/RBT.
- **Seeding** (`mastery-seed.ts`): asymmetric/capped prior from a diagnostic read.
- **Composition** (`mastery-attempt.ts`): `applyMasteryAttempt` runs the KC/skill/lesson chains +
  prereqs for one independent attempt; shared by both authorities.

Constants: `P(L)_0=0.2, T=0.15, G=0.25, m=1.7, S_m=0.10, threshold=0.95, review line=0.90, H_0=7,
w=0.5, V_0=0, K=0.3/0.08, CARS readiness=1.7, seed cap=0.4`.

---

## 3. Data model (per-user storage)

`database/migrations/0007_mastery.sql`:

- `question_stats(question_id, attempts, correct, updated_at)` — population difficulty for `b` (no
  FK to `questions`: the current study loop scores against the in-memory synthetic bank).
- `mastery_kc / mastery_skill / mastery_lesson (learner_id, key, p_l, half_life_days,
  last_practiced_at, last_due_review_at, updated_at)` — `p_l` as-of `last_practiced_at`.
- `cars_ability (learner_id, cars_skill, v, updated_at)`.

Persistence repos in `@mcat/persistence-postgres` (`mastery-repository.ts`,
`question-stats-repository.ts`) accept a structural `Queryable` so they run against a `Pool` (reads)
or the authority transaction client (writes). The migration Lambda grants the learner-API role
`select, insert, update` on these tables.

Contracts (`@mcat/contracts/mastery.ts`): `MasterySeed`, `SkillMasteryView`, `LessonMasteryView`,
`CarsReadinessView` (all percentages), plus `GET /v1/progress/{skills,lessons,cars}`.

---

## 4. Where it runs / data flow

- **In-process** (`@mcat/authority-core`, local dev + tests): `LearnerState.mastery` holds the maps;
  the study loop's first independent answer calls `updateMasteryForAttempt`; reads
  (`getMasterySkills/getMasteryLessons/getCarsReadiness`) apply lazy decay. A dev-only adapter maps
  the synthetic bank (op tag → 7-op, `internal_skill_ids[0]` → KC, `difficulty` → DOK).
- **Deployed** (`learner-api`, Postgres): the attempt path already flows through
  `authority.submitAttempt`, so mastery updates run inside the command transaction and persist in the
  `learner_streams.state_json` projection (which round-trips `LearnerState.mastery`). Reads
  (`GET /v1/progress/{skills,lessons,cars}`) rebuild the Authority from the projection and apply lazy
  decay. The dedicated `mastery_*` / `cars_ability` tables are a **queryable projection target** for a
  future independent consumer (they are provisioned + granted but not yet on the read path);
  `question_stats` is populated once a real bank + calibrated difficulty are wired.
- **Client** (`@mcat/client-core` `AuthorityPort` + `HttpAuthorityClient`, in-process client, and the
  dev Vite authority server): 3 read methods + `useMasterySkills/useMasteryLessons/useCarsReadiness`
  hooks in learner-web.

---

## 5. Producer Input Contract (what each system MUST emit)

### 5.1 Question-bank items (v7)
`id`, single `primary_kc_id`, `lesson_id`, **`reasoning_operation`** (1 of 7 — NEW tag), `dok_level`,
`family_id`, `section`, `primary_skill`; CARS items use `primary_skill ∈ {CARS_FOC/RWT/RBT}`;
`correct_answer` + `explanations` stay server-only.

### 5.2 Lessons & study runtime (attempt event contract)
Every answer emits: `questionId, primary_kc_id, lesson_id, reasoning_operation, dok_level,
family_id, section, assistanceLevel, contentBearingHint, isDiagnosticRetry, revealed, correct
(server-decided), elapsedMs, conditions {timed,passage,protected,mixed}, changeDimensions[]`. The
engine derives `independent` and only then moves `P(L)`. Lessons declare their `lesson_id` + ordered
KC set.

### 5.3 Diagnostic
At completion emit a `MasterySeed` (per-KC priors via cluster read, per-operation priors, CARS
`V_0`) — seeds only, capped ≤ 0.4, never mastery. **[SIGN-OFF]** requires adding an operation-grain
aggregation to the diagnostic output.

### 5.4 CARS — PotD + Duel
PotD emits `{ carsSkill, correct, dok_level }` → `K=0.3`. Duel emits `{ rubric: {position?,
argument?, application?} 0–3 }` → mapped to FOC/RWT/RBT, `K=0.08` (formative).

### 5.5 Recall (mastery due-review) — contract for the future Recall system

The Recall screen is **not built in this pass** (the owner will build it). It plugs into the mastery
pipeline as **both a consumer and a producer**. To fit the pipeline it must:

**CONSUME — what "due" means.** A unit is due when its lazily-decayed `P(L)` has fallen below the
review line (`REVIEW_LINE = 0.90`, exported from `@mcat/policies`). Read current values from the
pipeline (the read views already apply lazy decay, so `pL` is current):

- 7 skills: `GET /v1/progress/skills` (`AuthorityPort.getMasterySkills`) → filter `pL < 0.90`.
- lessons: `GET /v1/progress/lessons` (`AuthorityPort.getMasteryLessons`) → filter `pL < 0.90`.
- KC-grain due lists: KC `P(L)` is **stored but not yet exposed**. If Recall needs a per-KC due list,
  add a `getMasteryKc` read (a `GET /v1/progress/kc` endpoint + `Authority` method) — the storage
  (`mastery_kc`) already exists.

Sort most-decayed first (lowest `pL`). A unit that has never been practiced (no entry / `pL` at the
0.2 prior) is **not** "due" — only decayed, previously-built units are.

**PRODUCE — how a review counts.** When the learner practices a due item, the answer MUST flow
through the **same independent-attempt path** as the study loop (`authority.submitAttempt` →
`POST /v1/attempts`), carrying the full §5.2 attempt contract with `assistanceLevel: 'A0'`, no
content-bearing hint, not a diagnostic retry, not revealed. That single path is what (a) runs the BKT
update and (b) **doubles the half-life** on a successful due review — the engine's `stepMemory`
detects the due review automatically because the pre-practice decayed `P(L) < 0.90`. Recall MUST NOT
compute or write mastery itself.

**Session net.** If Recall practices several items for one concept in a session, pass the session's
net correctness so one mid-session miss doesn't reset the half-life (the engine accepts a
`dueReviewNetCorrect` override on `stepMemory` / `applyMasteryAttempt`; wire it through if Recall
batches).

**Boundary.** The separate Anki-style flashcards/FSRS feature owns user *facts* and never writes
mastery; this concept/skill due-review lane is the one that feeds `P(L)`. The old client-side
cluster-FSRS shim (`apps/learner-web/src/app/recall-schedule.ts`) is the thing the future Recall
system replaces; until then it stays as a demo (and is the only remaining `@mcat/content` import in
`learner-web`).

---

## 6. The 7 skills + tag mapping **[SIGN-OFF]**

Add a normalized `reasoning_operation` enum to the v7 schema + `questions` table, seeded from
existing tags (SME may override):

```
SIRS1 → IDENTIFY ; SIRS3 → DESIGN ; SIRS4 → EVIDENCE ; MATH-ENABLING → QUANTIFY
SIRS2 → disambiguate via construct.reasoning_operation_id keywords:
        predict|outcome|forward → PREDICT ; explain|mechanism|why|backward → EXPLAIN
        relate|compare|map|role → RELATE ; select|apply formula|calculat|comput|quantif → QUANTIFY
CARS_FOC / CARS_RWT / CARS_RBT → the separate CARS IRT track (not a science op)
```

---

## 7. Open decisions still needing sign-off

1. **Diagnostic → seed mapping** (§5.3): approve the asymmetric-capped formula + adding an
   operation-grain aggregation to the diagnostic.
2. **7-op tag mapping** (§6): approve the SIRS→op table + SIRS2 keyword disambiguation.
3. **DOK → `b` cold-start** table values.
4. **Due-review "session"** definition (per continue-session vs 4 AM day boundary).
5. **Governed change**: update `docs/governance/authority-boundaries.md` + architecture tests so
   `P(L)` (independent-only) is the mastery definition in place of the evidence rungs.

---

## 8. What we are intentionally NOT doing

FSRS flashcards feature (separate), numeric score prediction (still gated), calibrated IRT (`b` is
uncalibrated/DOK cold-start; manifest stays `provisional`), FC(10)+op(7) diagnostic re-grain (using
the 15-cluster read + a new op aggregation), skill-merge logic (all 7 shown), multi-KC attribution,
and evidence-log removal (evidence still powers independence + audit).
