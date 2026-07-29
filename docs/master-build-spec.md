# Master Build Spec — Metacognition cluster + CARS Duel + Exam-date/Account

**Status:** plan only — **no code until this is approved.** Repo: `/Users/jonat/Desktop/mcat-prep`. Raw corpus (out-of-repo, copyright): `…_LOCAL_ONLY_…/question-corpus/`.

This merges three things into ONE build: (A) the 5-feature metacognition/review/testing spec (`MCAT_NEW_FEATURES_BUILD_SPEC.md`), (B) the researched CARS-Duel-in-Today's-Path feature + the vetted 150-topic pool (`content/cars-duel/topics.json`), and (C) the exam-date + Account additions. Nine workstreams (WS0–WS8).

Every workstream states **(a) grounding proof** (file:line from Phase 0) and **(b) why it works** (learning science), per the source spec's requirement.

---

## Phase 0 — verification report (all four verifiers, corrected)

| Fact | Verdict | Evidence |
|---|---|---|
| `elapsedMs` hardcoded `0` on in-process write path | ✅ (narrower than stated) | `authority.ts:3568` — in-process `attemptEvent` (Study/session + daily check). Adaptive `submitPracticeAttempt` emits **no** attempt event; deployed kernel passes real `elapsedMs` (`authority-kernel/src/commands.ts:69`). Client stubs `http.ts:334,337`. |
| `PracticeAttemptLogEntry` has no cause/confidence/time; has `chosenChoiceId` | ✅ | `practice.ts:99–113` (chosenChoiceId L108) |
| `attempt_results` has no timing/confidence cols; has `chosen_choice_id` | ✅ | migrations `0010` L38–39,52–54; `0011`,`0012` |
| Event/command DTOs already carry `elapsedMs`,`answerChanges`,optional `confidence` (dormant) | ✅ | `events.ts:41,46,47–48`; `commands.ts:48,51,52` — `confidence` never populated by any client |
| Diagnostic captures timing (`SLOW_MS=90000`) | ✅ | `diagnostic.ts:352` |
| `error_models` authored per-choice; correct opt tagged `correct_model` (answer-revealing) | ✅ | `generated-v7-dok-dynamic.jsonl` rows |
| `error_models` = `z.unknown()` passthrough → dropped at compile → absent from protected/db-pull → 0 live items | ✅ | `schema.ts:159`; `compile.ts:114–137`; `db-pull.ts:37–42`; `learner-views.ts:485–487`; `authority.ts:3416–3418` |
| **Corpus fill-rate** | ⚠️ **~100% filled** (not sparse) | 2,108/2,108 authored; 2,088 strict `correct_model`, 20 = `"correct model"` (space), **1 mis-tagged** (`v7-wave18-repair-dok1-004-v3-kc-927560` tags B, answer D). ⇒ **no regeneration**, only plumbing + cleanup |
| Mistakes surfaces A (kc/cluster + denominator/hedge) & B (chosen/correct/refutation + "try a fresh one") | ✅ | `Mistakes.tsx:91,145,148–152,156,180–195,53–61` |
| `getErrorLog`/`getMistakePatterns`; `ErrorEntryView`/`MistakePatternView`; patterns kc/cluster only | ✅ | `authority.ts:3371,3420,3425`; `learner-views.ts:456–479,493–507`; `http.ts:108`. `grain` enum allows `'skill'` but producer emits only `kc|cluster` |
| Diagnostic excludes CARS; same 2,108 corpus; **MST is LIVE** (not sim-only); no fixed-form assembler | ✅ (correction) | `diagnostic-engine.ts:42–43,46`; `practice-bank-file.ts:34–36`; `diagnostic-mst.ts` used live at `diagnostic-engine.ts:317,345`; sim harness `diagnostic-simulation.ts:33` |
| Session store + result envelope reusable | ✅ | `diagnostic-session-store.ts` (opaque token, SHA-256, append-only, one-use block tokens); `DiagnosticResultView`/`buildResultView`/`resolveBlock` |
| Explanations via `choiceRationales` | ✅ | `practice.ts:158–166`; `learner-views.ts:72–93` (Study `PostRevealResponse`) |
| AI gateway gated off (dev-only proxy; prod route not built) | ✅ | `vite.config.ts:13,26`; `.env.example:22`; `ai-gateway/src/http.ts:32–34` |
| `reasoning_operation`(QUANTIFY)+DOK learner-safe on `PracticeQueueItem` | ✅ | `vocab.ts:95`; `practice.ts:62,64`; source `questions.json` (`db-pull.ts:29,30`). Caveat: Study `LearnerSafeQuestion` has only coarse `template_tags`, no DOK |
| Exam date already stored + read for pacing; no CARS taper/ramp consumer | ✅ | `types.ts:28–34` `goal.testDate`; `PlanSetup.tsx:41–52`; `confirmPlan` `authority.ts:680–685`; read `authority.ts:704,709–714,732–738`; **no** CARS consumer |
| Profile page exists (header icon only, not in nav); edits theme/daily-budget/ghost/reminders; not goal; bootstrap lacks `goal` | ✅ | `Profile.tsx`; `router.tsx:68`; `AppShell.tsx:65–67`; bootstrap `api.ts:28–34` |
| CARS Duel scheduling + outcome hooks; contextual-only (no mastery) | ✅ | `todays-path.ts:156–161,418–440,796–819`; `today-queries.ts:170–172`; `recordCarsDuel` `authority.ts:3210–3242`; `cars.ts:13–23` (`CARS_K_DUEL=0.08`) |

---

## §11 answers (confirmations)

1. **Timing capture** — CONFIRMED. Add `elapsed_ms`,`answer_changes` columns to `attempt_results` (new migration); un-stub the in-process `elapsedMs`; make **adaptive practice emit an attempt event**; add a diagnose-before-reveal step to **Study** (Practice already has `feedback`). DTOs already carry the fields; drop/ignore the dormant `confidence`.
2. **Calibration thresholds (default, A/B-tunable):** "fast" = elapsedMs **< 50%** of the item's median response time (fallback fixed threshold when median unknown / n<20 samples); "slow" = **> 150%** of median (or > diagnostic `SLOW_MS` analog). **shaky_win** = correct AND (slow OR KC mastery below the review line / a still-open miss in that KC). **confidently_wrong** = wrong AND fast.
3. **Per-choice misconception** — CONFIRMED plumb `error_models` into the **server-only** protected payload; **fill-rate ~100% → no mass regen**, just normalize 20 `"correct model"`→`"correct_model"` + fix 1 mis-tag. v1 aggregates misses at **KC/skill/family**; normalized trap-type axis deferred.
4. **"Step by step" gating** — CONFIRMED key off `skill === 'QUANTIFY'` (+ section C/P or DOK ≥ 2), all learner-safe on `PracticeQueueItem`. Study path needs DOK/skill surfaced (currently only coarse `template_tags`) or gate off section.
5. **AI gateway** — ON for the one grounded rewrite; wire a **prod route** (only a dev proxy exists), per-`(question, form)` cache, deterministic fallback on 503.
6. **Periodic tests** — half-length locked; cadence per §6 (baseline → monthly → biweekly → weekly, cap 1/wk, none within ~4–5 days of test day, block next until prior reviewed); enforce per-section content/skill/format floors + validate-before-serve.
7. **Storage/DTO** — CONFIRMED follow existing migration/Zod/authority conventions; no `trap_type` column (join at read time); server-only `error_models`.

---

## Workstreams

### WS0 — Timing + answer-change capture (the unblocker, §7)
- **Grounding:** `authority.ts:3568` stub; DTOs already have fields (`events.ts:41,46`); no DB cols (`0010–0012`); Study reveals immediately.
- **Why:** behavioral proxy for confidence — enables hypercorrection ranking without self-report.
- **Build:** migration `00NN_attempt_timing.sql` (+`elapsed_ms`,`answer_changes` on `attempt_results`); extend `PracticeAttemptLogEntry`/`Row`; un-stub in-process `elapsedMs`; **adaptive practice emits `attempt_submitted`**; add diagnose-before-reveal timing in Study UI + practice hook; carry through client `http.ts`.
- **Tests:** attempt persists real `elapsed_ms`/`answer_changes`; adaptive path now logs; no user prompt.
- **Acceptance:** real timing + answer-changes stored on every practice/study attempt.

### WS1 — Calibration classifier (§2) — *depends on WS0*
- **Build:** pure `packages/policies/src/calibration.ts` → `{correct,elapsedMs,answerChanges,kcMastery,itemMedianTime} → confidently_wrong | shaky_win | normal` (thresholds §11.2). Expose read-only on error/attempt views via authority. **Writes no mastery.**
- **Why:** hypercorrection (confident errors best retained once corrected).
- **Tests:** fast-wrong→confidently_wrong; slow/lucky-right→shaky_win; mastery unchanged.

### WS2 — `error_models` plumbing + trap fingerprint (§4)
- **Grounding:** dropped at `compile.ts:114–137`; absent `db-pull.ts:37–42`; fill-rate ~100%.
- **Build:** (1) carry `error_models` into `ProtectedV7Payload` (`compile.ts`) + `PulledProtected`/`protected.json` + Postgres protected equiv (`db-pull.ts`) — **server-only**, never in learner-safe. (2) corpus cleanup: normalize 20 tags + fix `v7-wave18-repair-dok1-004`. (3) read join `chosen_choice_id → error_models[choice]` in authority; aggregate KC/skill/family.
- **Why:** authored per-distractor misconception > learner-reported cause (sidesteps κ problem).
- **Tests:** `error_models` present in protected, **absent from every learner-safe payload**; miss names the picked option's misconception.

### WS3 — Mistakes upgrade (§3) — *depends on WS0, WS1, WS2*
- **Build:** extend `getErrorLog` (calibration labels + picked misconception) + `ErrorEntryView`; Surface B: **confidently-wrong first**, new **shaky-wins** group, misconception on each card; Surface A keeps kc/cluster + names the leaned-toward misconception; `Mistakes.tsx` UI (reuse `@mcat/ui-web`/`--mc-*` + existing focus→queue).
- **Why:** worst-first (hypercorrection) + naming the specific trap repairs the pattern.
- **Tests:** ordering, shaky-wins group, misconception shown, denominators/hedging preserved, routes to fresh practice.

### WS4 — "Explain it another way" (§5) — *parallel/independent*
- **Build:** enable AI gateway for one grounded call + **prod route**; "Example" (all), "Step by step" (QUANTIFY/C-P/DOK≥2); render below original; cache per `(question, form)`; deterministic fallback. Wire into Practice + Study reveal + Mistakes card.
- **Why:** multiple representations (~2–3× reasoning gains) + worked-example/segmenting; no learning-styles buttons.
- **Tests:** grounded (no new facts), cached, fallback, gating correct.

### WS5 — Periodic half-length tests (§6) — *parallel/independent, large*
- **Build:** new fixed-form **assembler** (`packages/policies/src/practice-test-assembler.ts`) hitting per-section content/skill/format floors, **includes CARS**; **validate-before-serve**; fresh/no-reuse. New flow reusing `diagnostic-session-store.ts` + result envelope (swap scorer). New Today's-Path kind `practice_test` + cadence guardrails. Re-measure mastery by **decay-weighted averaging**; populate review queue.
- **Why:** testing effect + spacing; blueprint = validity.
- **Tests:** assembled form provably meets floors; never reuses scored item; CARS included; decay-weighted re-measure.

### WS6 — CARS Duel engine (parallel; taper needs WS8's exam date)
- **Build:** the researched design on the vetted `content/cars-duel/topics.json` (150) → DB table + seed; **selector** (stratified randomization, novelty cooldown, theme/structure spread, difficulty near learner band); **mode rule** (Rebut daily anchor; Defend unlock ≥12 Standard Rebut @≥75% rolling, substitute ~10–15% mid / ~20–25% high, taper to 0 in final ~3 wks — reads `goal.testDate`); **intensity** system-set (hold-rate 75–85% → Warm-up/Standard/Challenge, Elo-ish, hysteresis) from a per-duel rubric hold-rate; wire selection `{mode,topicId,intensity,randomSide}` into the existing autostart. Stays **formative** (no mastery).
- **Why:** interleaving/desirable-difficulty/variability-of-practice (see the 5 CARS research briefs).
- **Tests:** selection quotas/cooldown; unlock/taper thresholds; intensity ramp; still writes no mastery.

### WS7 — CARS Duel → Mistakes mapping — *depends on WS6, WS3*
- **Build:** weak duel → weakest rubric dimension → CARS skill (FOC/RWT/RBT ≈ comprehension/within/beyond) → select a **specific real CARS passage question** from the 160-item CARS bank targeting that skill as the repair; surface in Mistakes as a **CARS reasoning pattern** (not a per-distractor misconception). Resolves on a later correct CARS item in that skill.
- **Why:** turns a formative duel into a concrete, spaced retrieval repair.
- **Tests:** weak duel enqueues a specific CARS item; pattern shown; resolves correctly.

### WS8 — Exam-date + Account (parallel; feeds WS6)
- **Build:** expose `goal` in bootstrap (or a goal view) so it can prefill; add a **goal editor** (exam date/target/weekly minutes via existing `useConfirmPlan`) to **Profile.tsx**; add an **Account** tab to the desktop `SIDEBAR` (not mobile `NAV`) → `/app/profile`; **wire `goal.testDate`** into the CARS Defend-taper + difficulty ramp (WS6) and confirm pacing readers unaffected. (Exam-date capture in PlanSetup already exists.)
- **Tests:** exam date editable + persists + prefilled; Account tab; CARS taper reads testDate.

---

## Dependency graph & parallel work-split (subagents)

```
WS0 (timing) ──┬─▶ WS1 (calibration) ──┐
               └─▶ WS3 (mistakes) ◀─────┼── WS2 (error_models plumbing)
WS2 ───────────────────────────────────┘
WS4 (explanations)        ── independent ──▶
WS5 (periodic tests)      ── independent ──▶
WS8 (exam-date/account) ──▶ WS6 (CARS Duel) ──▶ WS7 (CARS→mistakes, also needs WS3)
```

**Proposed parallel execution (each = one background implementation subagent, own feature, own tests, commit locally):**
- **Wave 1 (foundation, must land first):** **WS0** (timing capture — unblocks WS1/WS3). Small, touches shared DTOs/migrations → do alone to avoid churn.
- **Wave 2 (parallel after WS0):** **A**=WS1+WS3 (calibration→mistakes, shared files), **B**=WS2 (error_models plumbing+cleanup), **C**=WS4 (explanations), **D**=WS5 (periodic tests), **E**=WS8→WS6 (exam-date/account then CARS Duel engine). These touch mostly disjoint areas.
- **Wave 3 (integration):** **WS7** (CARS→mistakes) after WS6 + WS3.
- Coordinator (me) verifies + does the cross-cutting commits between waves (like the merge loop we just ran) to avoid working-tree/commit races.

---

## Guardrails (enforced in every workstream)
- `error_models` **server-only** — never in a learner-safe payload; reveal only the *picked* option's misconception, post-answer.
- **No mastery writes** from read-only surfaces (calibration, mistakes, explanations, CARS duel stays formative).
- **AI:** grounded rewrite only (re-express vetted rationale, no new facts); cached; spot-checkable; deterministic fallback.
- **AAMC-legal:** original "AAMC-style" items from the public outline only; never reproduce/train on AAMC content.
- **Honesty:** denominators + hedging below the assertion floor; no streaks; "direction, not a score."
- Periodic test **validates against blueprint floors before serving**; never reuses a scored item.
