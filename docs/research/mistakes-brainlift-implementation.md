# Mistakes Feature — Implementation Reference (DOK 1 substrate)

**Purpose.** A verifiable description of what the shipped Mistakes feature does, as of commit `e44dc75` (2026-07-29). Every claim carries a `path:line`. No evaluation, no recommendations.

> **Rechecked 2026-08-01 against `4a1c84e`.** An 88-commit push (313 files) landed after this document was written. Sections 1–8 below still describe `e44dc75` and are left as written so the diff is legible; **§9 records every claim the push changed** and is the current description. Read §9 before quoting anything above it. Line numbers in §§1–8 are `e44dc75` line numbers and several files have since moved.

**Method.** Read from `apps/learner-web/src/screens/Mistakes.tsx` outward through the query layer, the authority, the practice/study write paths, and the Postgres repositories. `tests/architecture/mistakes-ui-contract.test.ts` was treated as a spec and checked against the implementation; it was also executed — **all 43 tests pass** at this commit (the file has since grown to 50, all passing; see §9), so every contradiction recorded in §8 is a contradiction between the implementation and the *prose* of the contract (its docblocks) or between two implementations of one port, never a failing assertion.

**Terminology** follows `docs/research/error-log-and-open-learner-model-evidence.md` and `docs/research/post-error-feedback-evidence.md` (error log, elaborated feedback, re-retrieval, open learner model). Neither is summarized here.

## Surface map

| Layer | File |
| --- | --- |
| Screen | `apps/learner-web/src/screens/Mistakes.tsx` (201 lines) |
| Route / nav | `apps/learner-web/src/app/router.tsx:56`; `apps/learner-web/src/screens/AppShell.tsx:22` (4th of 5 tabs) |
| Queries | `apps/learner-web/src/app/queries.ts:44-48` (`['errors']`, `['error-patterns']`) |
| Cache keys | `apps/learner-web/src/app/invalidation-keys.ts:25,47,53-55,63-72` |
| HTTP | `services/lambdas/learner-api/src/routes.ts:428-441` — `GET /v1/errors`, `GET /v1/errors/patterns` |
| Views | `packages/contracts/src/learner-views.ts:456-479` (`ErrorEntryView`), `:493-507` (`MistakePatternView`) |
| Reads | `packages/authority-core/src/authority.ts:3371-3409` (`getErrorLog`), `:3420-3479` (`getMistakePatterns`), `:845-850` (`openMistakes`) |
| Writes | `authority.ts:2758-2786` (practice), `authority.ts:1477-1498` (study) |
| Storage | `attempt_results` extended by `database/migrations/0010_practice_attempt_log.sql`, `0011_study_attempt_log.sql`, `0012_study_attempt_kc_grain.sql`; repository `services/persistence-postgres/src/practice-attempt-repository.ts` |

---

## 1. What counts as a mistake

**Storage.** One table, `attempt_results`, extended (not created) by migration 0010 with `question_id, kc_id, skill, cluster, chosen_choice_id, first_attempt, activity_type, occurred_at` (`tests/architecture/mistakes-ui-contract.test.ts:515-533` enumerates the columns). There is no "mistakes" table; the error log is a filter over an attempt log.

**Both outcomes are written, not just misses.** `services/persistence-postgres/src/practice-attempt-repository.ts:9-11` — correct first attempts are logged so the pattern section has a denominator. The miss filter happens at read time: `authority.ts:3375` `attempts.filter((a) => !a.correct && a.firstAttempt)`.

**First attempt only.**
- Practice: the log write is inside `if (firstAttempt)` (`authority.ts:2758`, write at `:2765-2776`). `firstAttempt` is server-derived, never client-supplied: `exposure.priorExposures === 0 && authorization.firstUse` (`authority.ts:2739-2740`). Exposure is unwindowed (`packages/authority-core/src/practice.ts:216-223`), so a repeat a year later is still a repeat and writes no row.
- Study: `logStudyAttempt` is called only from the `s.sub === 'answering'` branch of `submitAttempt` (`authority.ts:1362,1376`); the `sub === 'retry'` branch (`:1423`) does not log. It hardcodes `firstAttempt: true` (`authority.ts:1494`).
- Idempotency: partial unique index on `(learner_id, activity_type, question_id) where activity_type in ('practice','study') and first_attempt`, with `on conflict … do nothing` (`practice-attempt-repository.ts:120-122`; index in `0011_study_attempt_log.sql`, asserted at contract test `:545-560`). In-memory fallbacks mirror it (`practice.ts:553-566`, `apps/learner-web/server/practice-bank-file.ts:420-431`).

**Activity types displayed:** exactly `['practice','study']` (`practice-attempt-repository.ts:25`, filtered in SQL at `:156`). FSRS recall lapses and in-lesson comprehension checks are never written at all — the scope is enforced at the write, not the read (`authority.ts:3286-3291`; guided-phase exclusion at `authority.ts:1484`). CARS duels write nothing to `attempt_results` (`packages/authority-core/src/mistakes.test.ts:437-442`); as of the 2026-08-01 push they do write repairs on a separate path, see §9.1.

**An unanswered item counts as a miss.** `outcome = 'omitted'` when `chosenChoiceId === null` → `correct === false` (`authority.ts:2678-2684`), and the row is written with `chosenChoiceId: null` (`:2771`). *Inferred:* the shipped practice UI cannot produce this — `checkAnswer` returns early when `choice === null` (`PracticeSession.tsx:205`) — so an omitted row can only arrive from a non-UI client.

**Resolution.** A miss is `resolved` when a **later correct first attempt on a different item sharing the same `kcId`** exists in the read window (`authority.ts:3314-3327`). Notably:
- It is computed at read time, per request. Nothing is written back; there is no `resolved` column.
- `if (miss.kcId === null) return false` (`authority.ts:3318`) — a row with no KC (CARS, or a projection predating the grain) can **never** resolve and stays open permanently.
- Re-answering the *same* item never resolves (`a.questionId !== miss.questionId`, `:3324`).
- It is cross-surface: a practice answer resolves a study miss and vice versa (`mistakes.test.ts:345-358`).
- Nothing the learner does *on the Mistakes tab* resolves anything. Reading a mistake is not resolution (`authority.ts:960-963`).

**A second, distinct notion of "cleared":** `state.mistakesReviewedThrough`, a timestamp set only when a `review_mistakes` plan activity is completed (`authority.ts:963`). It suppresses misses from **Today's Path scheduling only** (`openMistakes`, `authority.ts:845-850`) and never from the tab (`mistakes.test.ts:238-258`).

**Retirement.** A miss whose item no longer resolves in its corpus is silently dropped from the list rather than rendered empty (`authority.ts:3379-3382`, `mistakes.test.ts:444-460`).

---

## 2. What the learner sees

**Two sections, in this order** (`Mistakes.tsx:89-122`): "What keeps coming up" (patterns), then "Still open" / "All misses" (history). Both are hidden when empty; when `rows.length === 0` a success callout replaces the history section even if patterns exist (`:116-122`).

**Per-mistake fields rendered** (`ErrorRow`, `Mistakes.tsx:163-201`):

| Displayed | Line | Note |
| --- | --- | --- |
| Date | `:174` | `toLocaleDateString` with `{month:'short', day:'numeric'}` (`:26-27`) — no year, no time |
| "Cleared" pill | `:175` | only when `entry.resolved` |
| Question stem | `:177` | |
| Chosen choice id + text | `:179-183` | `entry.chosenChoiceId ?? '—'`; text appended only if non-empty |
| Correct choice id + text | `:184-188` | |
| Per-choice refutation | `:190-194` | Callout titled `Why {chosenChoiceId} misses`; rendered only when `choiceRationale !== null` |
| Action | `:195-197` | Button "Try a fresh one" |

**Not displayed, though present on the row's view type** (`learner-views.ts:456-478`): `questionId`, `kcId`, `skillId`, `cluster`, `familyId`, `focus` (used only as the navigation argument, `Mistakes.tsx:195`).

**Not carried by the view at all, therefore unshowable:** the passage/stimulus (`ErrorEntryView` has no passage field, `learner-views.ts:456-478`, even though `PracticeQuestion` does — `PracticeSession.tsx:243-252` renders one), the other two distractors, the correct-answer *rationale* (`PracticeAnswer.rationale` is read during hydration at `authority.ts:3349`/`3356` but never copied onto the entry), any per-mistake attempt count, and any time-on-task.

**Rationale for wrongness:** yes, but only the authored per-distractor refutation for the option chosen (`authority.ts:3398-3401`). It is `null` when the learner omitted an answer or the corpus has no rationale for that choice, and the callout then disappears entirely (`Mistakes.tsx:190`). There is no explanation of the *correct* answer on this surface — that is shown once, in-session (`PracticeSession.tsx:332`).

**Ordering.** Newest-first, by `occurred_at`, with no secondary grouping: Postgres `order by occurred_at desc` (`practice-attempt-repository.ts:157`); the file-backed and synthetic ports sort the same way (`apps/learner-web/server/practice-bank-file.ts:437-439`, `packages/authority-core/src/practice.ts:572-574`). `getErrorLog` preserves that order (`authority.ts:3376-3408`) and `Mistakes.tsx:111` renders it unchanged. Resolved and open rows interleave by date when the filter is off.

**Hiding.** Default view is `open` only (`Mistakes.tsx:42-44`). A text button "Show N cleared" toggles to all rows (`:104-108`); the heading changes from "Still open" to "All misses" (`:103`).

**Patterns section** (`PatternRow`, `Mistakes.tsx:134-161`): grain eyebrow ("Knowledge component" or "Cluster", `:145`), humanized label (`:146`; `humanize` = hyphens/underscores→spaces, `authority.ts:533-534`), and the sentence `{missedItems} of {attemptedItems} questions missed here` followed by either "— enough to call this a weak spot." or "— too few so far to call it a pattern." keyed on `pattern.assertable` (`:148-153`). Action button "Practice this" (`:155-157`).

**Deliberate absences, enforced by contract test:** no self-reported cause label, no repair pill (`contract test :250-255`), no running mistake total, no streak, no cohort/percentile comparison (`:283-287`), no misconception grain (`:300-306`).

---

## 3. Timing of disclosure

**Adaptive Practice: immediate, on every scored attempt, right and wrong.** The step machine has exactly two substates, `'answering' | 'reveal'` (`apps/learner-web/src/screens/practice/session-flow.ts:45`), and `subAfterAttempt = (): Sub => 'reveal'` is unconditional (`:48`). `checkAnswer` sets it on mutation success (`PracticeSession.tsx:209-213`). The card shows the key, the key's rationale, and the refutation of the chosen distractor together (`PracticeSession.tsx:325-343`; assembled by `feedbackFor`, `session-flow.ts:119-130`).

**Study loop: immediate on a miss; nothing on a correct answer.** A correct first attempt advances silently (`authority.ts:1403-1415`); a miss sets `s.sub = 'reveal'` and `retryPending = true` in the same call (`:1417-1418`), and `Study.tsx:204-205` renders the reveal, with the refutation keyed on the server-carried `reveal.chosenChoiceId` (`Study.tsx:276-288`). One unassisted retry follows the reveal, not before it (`authority.ts:1527-1536`, `Study.tsx:243-257`).

**Exception — protected blocks get no disclosure at all.** `logStudyAttempt` runs at `authority.ts:1376`, *before* the `phase === 'protected'` branch at `:1378-1393`, which appends protected evidence and advances with no feedback ("No feedback during a protected block", `:1379`). So a protected-block miss is written to the log and will appear on the Mistakes tab carrying a refutation the learner was never shown. See §8.

**Nothing is disclosed only in the Mistakes tab.** With the protected-block exception above, everything the tab shows was shown in-session first.

**Dated from git history.** The change to immediate disclosure is commit `369e6cd`, **2026-07-29**, "fix(practice): disclose the answer on every miss, and drop the same-item re-ask". It reversed `ccd2dc9`, **2026-07-28**, "…hold the key back to the second try", which had itself introduced the withhold. The reversal also removed the same-item in-session re-ask as a pair (contract test `:85-104`; rationale in `session-flow.ts:9-38`). Merge `7eb63f7` (2026-07-29) adopted it onto the current line; `e44dc75` (2026-07-29) restored degraded-queue states the merge dropped.

---

## 4. Whether mistakes drive anything

**The error log itself is a passive read.** `getErrorLog` and `getMistakePatterns` mutate no state (`mistakes.test.ts:139-146` asserts mastery is byte-identical after both calls). Both are pure functions of `listPracticeAttempts` plus content hydration (`authority.ts:3372`, `:3421`).

**What has authority over mastery:** `applyPracticeMastery` (`authority.ts:2751-2755`), called on **every** practice response before and independently of the log write, and gated on `firstAttempt` internally for the P(L) move; and `updateMasteryForAttempt` on the study path (`authority.ts:1375`). Neither reads the attempt log. The log write is explicitly annotated "Read-only downstream: this changes no scoring, mastery, exposure or repair behaviour" (`authority.ts:2763-2764`).

**What the miss *does* drive, on a separate write on the same code path:** `queueRepair` (`authority.ts:2777-2785`), gated on `!correct && classification?.domain === 'science' && classification.kcId !== null` — inserts a `practice_repair` row for the KC×skill. This is **not** derived from the error log; it is a sibling write. The contract test asserts the three writes occur in one method in the order `recordExposure` → `recordPracticeAttempt` → `queueRepair` (`contract test :367-380`).

**Study misses queue no repair.** `logStudyAttempt` writes the log row and nothing else — explicitly not `queueRepair`, `applyMasteryAttempt`, `appendEvidence`, or `recordAttempt` (`authority.ts:1477-1498`; asserted at contract test `:382-395`). A study miss therefore reaches the Mistakes tab and the daily plan but never the practice repair queue.

**What the error log *does* drive: the daily plan.** `openMistakes` = `getErrorLog` filtered to unresolved and newer than `mistakesReviewedThrough` (`authority.ts:845-850`). Its **count** feeds:
- Plan build: `mistakesOpen` in the Today's Path snapshot (`authority.ts:1172`), which reserves 2 Review-Mistakes sessions/day (3 at ≥240 min budget) once ≥3 are open (`packages/policies/src/todays-path.ts:136,153,471-497`), each session sized `clamp(ceil(open/wanted), 3, 8)` items at 2 min/item (`:479-487`).
- Mid-day injection: recomputed after every plan-activity status change (`authority.ts:967`); at ≥5 open (`:972,976`) it splices a `review_mistakes` activity in front of the next ready item and snoozes the last ready one (`:1007-1018`), capped at 2 sessions/day (3 at ≥240 min) (`:977-978`).
- The slot's promised `count` is `min(open, 20)` (`authority.ts:987`; `TODAYS_PATH_CONFIG.blocks.mistakesMax = 20`, `todays-path.ts:134`).

**Cache coupling.** Every mutation that can write or clear a miss invalidates `['errors','error-patterns']`: practice submit (`practice-queries.ts:40` via `PRACTICE_INVALIDATE_KEYS`), study mutations (`queries.ts:17-18` via `LEARNER_KEYS`), and plan-activity **completion** only (`today-queries.ts:111`). Recall deliberately does not (`contract test :170-175`).

---

## 5. Re-exposure

**The row's action is a navigation, not a re-serve.** `tryAgain` pushes `/app/practice/session` with `{ x: 5, focus }` (`Mistakes.tsx:53-61`; `RETRY_SET_SIZE = 5` at `:24`). No item id travels with it.

**The focus token is cluster- or skill-grain, never KC-grain.** `focusFor(cluster, skill)` returns the lowercased cluster if present, else the lowercased reasoning operation, else null (`authority.ts:527-531`) — e.g. `'bb1'` (`mistakes.test.ts:107`). `filterByFocus` then narrows candidate units by `cluster` or `skill` across the whole bank (`authority.ts:2889-2903`). So "Try a fresh one" narrows to the missed item's *cluster*, not its KC; nothing guarantees the served set touches the missed KC at all. Same for pattern rows, including KC-grain patterns, which also pass `pattern.focus` (`Mistakes.tsx:155`, built at `authority.ts:3472`).

**Freshness is a 14-day exclusion window, not "never again".** The queue excludes `recentlySeenIds(learnerId, { withinDays: 14, limit: 500 })` (`authority.ts:2564`) both as a `findItems` argument and as a post-filter (`:2570-2585`). An item answered more than 14 days ago is eligible to be served again, including the logged one. Exposure is recorded only on submit, never on serve (`authority.ts:2514-2527`).

**No item is re-asked in-session.** The sequence is seeded once from the queue and never spliced (`PracticeSession.tsx:109-114`; contract test `:94-104`). The queue holds at most one item per KC×skill by construction (`session-flow.ts:26-28`).

**The actual same-KC re-test is the cross-session repair path**, and it is not scheduled on a clock:
- Repairs are read at queue-build time, `recentMisses(learnerId, { limit: 20 })` (`authority.ts:2563`).
- They fill at most `floor(scienceBudget × 0.30)` slots and are selected first (`packages/policies/src/practice-selection.ts:150,279-283,318-333`), targeted at ~85% success (`logitRepair`, `:136,154`).
- A repair spec asks for a **fresh item in the missed KC** (`kcId: target.kcId`, `practice-selection.ts:328`), i.e. a sibling by KC — not by `family_id`, which is logged (`practice-attempt-repository.ts:46`) but used by nothing in this path.
- **Nothing is FSRS-driven.** FSRS lives in `packages/recall-core` and governs flashcards only; an FSRS "Again" is explicitly excluded from this surface (`authority.ts:3288-3290`).
- **Repairs are never resolved.** `practice_repair.resolved_at` exists (`database/migrations/0009_practice.sql:40,44-46`) and is written by no code in the repository — the only statements are `insert` (`services/persistence-postgres/src/practice-exposure-repository.ts:577-581`) and a `resolved_at is null` select (`:551-557`). The in-memory fallbacks likewise only push (`practice.ts:543-551`, `practice-bank-file.ts:406-418`). A missed KC therefore stays a repair target for the learner's lifetime.
- **Repair ordering differs between implementations.** `PracticeSnapshot.repairs` is documented "highest priority first" (`practice-selection.ts:101-102`), and the two in-memory ports honor it by iterating the miss list reversed (`practice.ts:534`, `practice-bank-file.ts:397`). The Postgres implementation cannot: `select distinct on (kc_id) … order by kc_id, created_at desc limit $2` (`practice-exposure-repository.ts:551-557`) is ordered alphabetically by `kc_id`, so the `limit 20` truncates alphabetically. Combined with the absent resolution, *inferred:* after a learner accumulates more than 20 distinct missed KCs, the repair set becomes a fixed alphabetical prefix and stops tracking recent misses.

---

## 6. Confidence, self-report, reflection

**Nothing on any learner question flow captures confidence, and nothing asks the learner to categorize their own error.** Stated plainly because the absence is deliberate and defended in-code: `Mistakes.tsx:18-20`, `learner-views.ts:450-454`, `session-flow.ts:6-7`, all citing expert κ = 0.000–0.063 on error cause.

Enforcement is broad and passing (`contract test :35-44, 178-190, 220-245`): no cause picker or picker state in `PracticeSession.tsx` or `Study.tsx`, no `mc-cause` CSS, no `ProbableCauseSchema` / `CauseSelectedSchema` / `'cause_selected'` event, no `selectCause` port method, no `attempts/cause` HTTP path, no `CauseCommandBody` route, and `'cause'` removed from `QuestionSubState` except a resume path that rewrites it to `'reveal'` (`contract test :196-202`). Historical `accepted_events` rows are readable because the projection rehydrates by unchecked cast rather than schema parse (`contract test :232-244`).

**Two vestiges of confidence exist and neither is wired to Mistakes:**
- `confidence: z.number().min(0).max(1).optional()` on the attempt event and command schemas (`packages/contracts/src/events.ts:47-48`, `packages/contracts/src/commands.ts:52`), passed through by `services/authority-kernel/src/commands.ts:73`. No producer sets it and no consumer reads it — a repo-wide search for `confidence:` in `.ts`/`.tsx` returns only these schema declarations, that pass-through, a kernel test fixture, and the two unrelated surfaces below. Dead field.
- `apps/learner-web/src/screens/CarsPreview.tsx:250-265` has a per-item "How sure are you?" 1–3 picker. It is an internal content-review screen that "sits outside AppShell and mints no evidence" (`:12-17`), the value lives in React state only (`:53`), and CARS never reaches the Mistakes tab anyway (`mistakes.test.ts:437-442`).

**No reflection or self-explanation prompt exists** on either flow or on the tab: the answer-side card is key + rationale + refutation + Continue (`PracticeSession.tsx:325-347`), and the mistake row is content + one button (`Mistakes.tsx:170-198`). There is no free-text field anywhere in these files.

---

## 7. Scale and limits

- **Read window: the newest 500 logged attempts**, correct and incorrect together — `ATTEMPT_LOG_LIMIT = 500` (`authority.ts:3294`), passed by both `getErrorLog` (`:3372-3374`) and `getMistakePatterns` (`:3421-3423`). Misses are filtered *after* the window, so a learner with 500 recent attempts loses visibility of every older miss, and both surfaces silently shrink. The repository additionally clamps any requested limit to `[1, 2000]` (`practice-attempt-repository.ts:159`).
- **No pagination, no cap, no virtualization on the client.** `useErrorLog` takes no arguments (`queries.ts:44-45`); `GET /v1/errors` takes no query parameters (`routes.ts:428-433`); `Mistakes.tsx:110-114` maps the entire array into a `Stack`. *Inferred:* with hundreds of open misses the tab renders hundreds of `Card`s in one column, and the only affordance for reducing them is the resolved-rows toggle, which only ever *adds* rows.
- **Hydration cost is linear in misses, not in the window.** Each miss triggers `getQuestion` + `getAnswer` (`authority.ts:3354-3357`) inside a `Promise.all` over all misses (`:3376`), so N open misses issue 2N port lookups per page load. *Inferred* for the Postgres deployment: 2N queries fired concurrently.
- **Pattern-section thresholds** (`authority.ts:3303-3306`): a group is listed at ≥2 distinct missed items (`PATTERN_MIN_MISSES`) and asserted rather than hedged at ≥5 distinct attempted **and** ≥3 distinct missed (`PATTERN_ASSERT_ITEMS`, `PATTERN_ASSERT_MISSES`). Counts are of distinct `questionId`, via `Set` (`:3428-3429,3450-3452`). Patterns sort by `missedItems` desc, then `lastMissedAt` desc (`:3475-3478`). There is no cap on the number of pattern rows and no pagination there either.
- **Plan-side caps** (independent of the tab): mid-day session `count = min(open, 20)` (`authority.ts:987`), max 2–3 Review-Mistakes activities/day (`:977`, `todays-path.ts:153`), each ≤ `maxActivityMinutes` (`authority.ts:988-991`).

---

## 8. Stubbed, dead, or contradicted

**All 43 assertions in `tests/architecture/mistakes-ui-contract.test.ts` pass at this commit.** The items below are contradictions between the implementation and prose, or between two implementations, not test failures.

1. **The contract test's own header docblock is stale and states the opposite of what the file asserts.** `contract test :12-14` says "adaptive Practice withholds the correct answer until a SECOND miss (§3.3 as amended 2026-07-28), and the withheld key is unreachable from the component that renders the card." The test body at `:56-63` asserts immediate disclosure and cites the 2026-07-29 re-amendment (`:46-55`), and the implementation discloses immediately (`session-flow.ts:48`). The docblock was not updated by `369e6cd`. **The implementation and the test bodies are right; the header is wrong.**

2. **Protected-phase study misses reach the tab carrying a refutation the learner never saw.** `Mistakes.tsx:11-13` and `:68-69` promise "the refutation the learner was shown at the time"; the contract test scopes the study-log exclusion to `phase === 'guided'` only (`contract test :394`, implementation `authority.ts:1484`). A `protected`-phase attempt is logged at `authority.ts:1376` before the no-feedback branch at `:1378-1393`. **The screen's stated invariant is contradicted by the write path;** the contract test does not test the claim.

3. **`MistakePatternView.grain` admits `'skill'`, which nothing produces and the UI would mislabel.** Schema `z.enum(['kc','cluster','skill'])` (`learner-views.ts:495`), pinned by `contract test :305`. `getMistakePatterns` only ever emits `'kc'` or `'cluster'` (`authority.ts:3437`). `PatternRow` renders `grain === 'kc' ? 'Knowledge component' : 'Cluster'` (`Mistakes.tsx:145`), so a skill-grain row would be labelled "Cluster". Dead enum member.

4. **`confidence` on the attempt event and command is a dead optional field** — declared (`events.ts:47-48`, `commands.ts:52`), forwarded (`authority-kernel/src/commands.ts:73`), never written by a client and never read by the authority. See §6.

5. **`practice_repair.resolved_at` is a dead column.** Declared and indexed (`0009_practice.sql:40,44-46`), never updated by any code. Repair targets accumulate for the life of the account. See §5.

6. **`family_id` is logged and surfaced but drives nothing.** Written on both paths (`authority.ts:2770`, `:1491`), carried on `ErrorEntryView` (`learner-views.ts:464`), asserted in tests (`mistakes.test.ts:106`) — and read by no selection, grouping, resolution, or rendering code. Re-exposure is KC-grain only (`practice-selection.ts:328`).

7. **The Mistakes screen's freshness guarantee is stronger than the queue's.** `Mistakes.tsx:14-16` states the exposure/repair seam "picks a FRESH unseen item, so a re-attempt is real evidence rather than a re-serve of the logged question", and the contract test only checks that the screen does not route to an item id (`contract test :269-276`). The queue's actual exclusion is a 14-day recently-seen window (`authority.ts:2564`), and the focus token is cluster/skill-grain (`authority.ts:527-531`), so the served set is neither guaranteed unseen beyond 14 days nor guaranteed to be in the missed KC. **The code is the 14-day window; the docblock is the overstatement.**

8. **Postgres and in-memory `recentMisses` disagree on ordering**, against the documented contract "highest priority first" (`practice-selection.ts:101-102`): alphabetical by `kc_id` in Postgres (`practice-exposure-repository.ts:551-557`) versus reverse-chronological in both fallbacks (`practice.ts:534`, `practice-bank-file.ts:397`). Only the fallbacks match the doc.

9. **Row keys are not unique across activity types.** `Mistakes.tsx:112` keys by `e.questionId`, while the log's uniqueness key is `(learner, activity_type, question_id)` (`practice-attempt-repository.ts:120-122`) — one question id missed in both Study and Practice yields two entries with one React key. *Inferred*, and mitigated in practice by the two corpora being different id spaces (`practice-attempt-repository.ts:102-104`); **could not establish** whether any id is in fact shared.

10. **Could not establish:** whether any production learner has crossed the 500-attempt read window or the 20-KC repair ceiling; the corpus lives under a gitignored path and is absent in CI (`contract test :419-421`), and there is no telemetry in the repository bearing on it.

---

## 9. Recheck against `4a1c84e` — 2026-08-01

Every claim in §§1–8 was re-read against HEAD. What follows is organised by the section it amends. A claim not listed here survived the push unchanged.

**Test counts.** `tests/architecture/mistakes-ui-contract.test.ts` now carries **50** assertions, not the 43 recorded in §8, and all 50 pass. The new `tests/architecture/error-models-server-only.test.ts` carries 9 and all pass. Both were executed on 2026-08-01, along with `packages/policies/src/{calibration,cars-duel-mistakes,practice-test-cadence}.test.ts` — 107 tests, 107 passing.

### 9.1 Amends §1 — CARS duels now write, to a different store

"CARS duels write nothing" was true of the **attempt log** and is now false of **Mistakes**. A duel whose rubric hold-rate falls below **0.75** mints a repair: `isWeakCarsDuel` and `weakestCarsSkill` (`packages/policies/src/cars-duel-mistakes.ts`) name the CARS sub-skill from the weakest scored rubric dimension (position→FOC, argument→RWT, application→RBT, ties breaking toward the more foundational skill), and `Authority.enqueueCarsReasoningRepair` pins one real CARS bank item for it.

Three properties matter for the claims above:

- It writes to `state.carsRepairs` on the projection blob, **not** to `attempt_results` and **not** to `practice_repair`. So §1's "the error log is a filter over an attempt log" and "activity types displayed: exactly `['practice','study']`" both still hold. A CARS duel still contributes no row to the error log.
- At most one repair per sub-skill: a fresh weak duel refreshes the pinned item in place rather than stacking (`authority.ts`, `enqueueCarsReasoningRepair`).
- **It resolves, and `practice_repair` still does not.** `getCarsReasoningPatterns` computes resolution at read time — a later correct CARS answer in the same sub-skill clears it, whether on the pinned passage or a sibling. That is the resolution mechanism §5 records as missing for science repairs, implemented for CARS only.
- It writes no mastery, matching the formative `recordCarsDuel` seam.

### 9.2 Amends §2 — the screen is now four tabs, and it names misconceptions

`Mistakes.tsx` is a two-pane master–detail with a tablist. Four groups: **To fix**, **Patterns**, **Wins worth locking in**, **CARS** (`TAB_ORDER`, `Mistakes.tsx`). "What keeps coming up" then "Still open" is gone. Consequences for §2:

- **"To fix" sorts confidently-wrong first.** A fast, sure miss is the best hypercorrection target, so the calibration band (§9.4) is the primary sort key rather than recency.
- **"Wins worth locking in"** is a new surface with no §2 counterpart: correct answers banded `shaky_win` (slow, or in a still-weak KC).
- **CARS** renders `CarsReasoningPatternView` rows from §9.1, with its own independent "show cleared" toggle so revealing cleared misses no longer reveals cleared CARS repairs.
- **The misconception grain is now required, not forbidden.** §2's "Deliberate absences, enforced by contract test" lists "no misconception grain (`:300-306`)". That assertion was **inverted** by the push. A miss card names the misconception behind the distractor the learner picked and a pattern row names the one they lean toward; the test at `tests/architecture/mistakes-ui-contract.test.ts:300-314` now asserts `chosenMisconception` and `leaningMisconception` are present in the UI and that `error_models` appears in neither `Mistakes.tsx` nor `learner-views.ts`. Its own comment records why: "Phase-0 corrected the premise this used to rest on (`error_models` populated on 0 items)". What remains forbidden is the raw per-choice map reaching any learner-safe payload, a different prohibition, pinned in both directions by the new `tests/architecture/error-models-server-only.test.ts`. Pattern grain is untouched: the test still requires `grain: z.enum(['kc', 'cluster', 'skill'])`, so §8 item 3's dead `'skill'` member also stands.
- Source of the labels: `error_models` was authored on ~100% of the raw corpus all along (2,108 of 2,108, 20 rows using a space spelling of `correct_model`, one mis-tagged). It read as empty because the schema declared it `z.unknown()` and `compile.ts` dropped it before persistence. The push carries it onto the protected payload, adds a nullable `question_protected.error_models` (`database/migrations/0015`), and reads it column-agnostically through `to_jsonb` so a database predating the migration degrades to null rather than throwing. **The 2026-07-24 local pull predates the re-publish and carries no error models**; whether the deployed database has been re-seeded cannot be established from the repo.
- The labels are free prose rather than IDs from a closed catalogue, so a misconception can be shown to one learner and not counted across many. Pattern grain is still KC or cluster (§2 unchanged there); the misconception rides on the group as a description.

### 9.3 Amends §3 — unchanged

Immediate disclosure holds exactly as written, including the protected-block ordering defect. `logStudyAttempt` still runs before the `phase === 'protected'` no-feedback branch, so a protected-block miss still reaches the tab carrying a refutation nobody showed. §8 item 2 stands.

### 9.4 Amends §6 — confidence is now captured, behaviourally

This is the largest change to §6. **Self-reported** confidence is still refused and every enforcement listed in §6 still passes: no cause picker, no `ProbableCauseSchema`, no free-text field anywhere. The `confidence` field on the attempt event and command is still dead (§8 item 4 stands as written); re-verified 2026-08-01, still declared, still forwarded, still written and read by nobody. Line numbers moved with the push: `commands.ts:52` is now `:67` and `authority-kernel/src/commands.ts:73` is now `:80`. Treat every line number in §§1–8 as as-read on 31 Jul and re-locate by symbol.

What is new is a behavioural proxy:

- `database/migrations/0014_attempt_timing.sql` widens `attempt_results` with `elapsed_ms` and `answer_changes`, both **nullable by design** so a surface that did not measure timing reads "not captured" rather than a false `0`. The migration names the diagnostic and Passage-of-the-Day paths as out of scope, so their rows stay null.
- `packages/policies/src/calibration.ts` bands one scored attempt `confidently_wrong` (wrong and fast), `shaky_win` (correct and either slow or in a weak KC), or `normal`. "Fast" is below 0.5× the item's median response time once that item has 20 timing samples, falling back to fixed thresholds otherwise; the slow fallback mirrors the diagnostic's 90 s. `answerChanges` only ever demotes: a fast answer the learner flip-flopped on more than the threshold is not "confident". The weak-KC cut is a dedicated `WEAK_KC_LINE = 0.35`, deliberately decoupled from the 0.9 BKT review line.
- Per-item response-time medians are accumulated from the attempt log (`itemResponseTimes`, `services/persistence-postgres/src/practice-exposure-repository.ts`), read into `Authority.calibrationFor`. This is the only per-item population statistic the system now accrues; it is not an IRT parameter and feeds nothing but the band.
- The band writes no mastery and is deliberately kept outside the one mastery door.

So §6's headline, "nothing on any learner question flow captures confidence," is now false as stated and true if narrowed to self-report. The design refuses to ask and measures instead.

### 9.5 Amends §4 and §7 — Today's Path reserves one slot, sized differently

`packages/policies/src/todays-path.ts` changed materially, and §4's plan-side numbers are stale.

- **One reserved Review-Mistakes slot per day, not two or three.** The engine's own comment gives the reason: the guided repair runner feeds mistakes one at a time from a deterministic queue, so two slots would each re-read that queue and repeat mistakes. Variety is now handled by `orderActivities`, which max-spreads same-kind runs on its own.
- **The slot is sized from `mistakesRepairable`, never the raw `mistakesOpen` count.** `mistakesRepairable` is the servable, prioritized, capped subset the runner can actually hand a fresh question for (`Authority.getRepairQueue`); an open miss in an untaught KC or with `kcId: null` is not repairable. §4's "its **count** feeds" is therefore wrong about which count.
- Per-day item cap `repairItemCap`: `capBase` 3 at a 2-hour budget, +1 per additional 2 hours, clamped to [3, 5]. The slot is `min(mistakesRepairable, repairItemCap)` at 3 minutes per item, and it is reserved only once **3 repairable** mistakes exist (`eligibility.mistakesMinOpen`), not 3 open ones. Reserving against unservable misses is recorded in-code as the bug this fixed: the slot promised "clear what piled up" and opened an empty page.
- The mid-day injector still fires on real pile-ups, on top of the reserved slot.
- **A fifth activity kind exists: `practice_test`.** A scheduled practice test is reserved **first and atomically**, ahead of the mistakes slot and ungated by the remaining budget, because on a small preset the test is the day. Its misses enqueue into the same repair queue as practice misses, deduplicated by KC (`recordPracticeTestResult`), so a practice test now feeds the Mistakes surface. It writes no mastery.

### 9.6 Amends §5 — a repair runner exists, and resolution still does not

- **A guided repair runner shipped** (`apps/learner-web/src/screens/mistakes/MistakesRepair.tsx`). It re-presents the mistake, enforces a mandatory reading dwell before the CTA unlocks — `REVIEW_DWELL_SECONDS = { science: 15, cars: 25 }` — and then hands the learner a fresh item they must answer correctly before the session advances. §5's "the actual same-KC re-test is not scheduled on a clock" is now false: the reserved daily slot (§9.5) is the clock.
- **It asks for nothing in the learner's own words.** The dwell is a reading gate, not a generation prompt; there is still no free-text field on this surface.
- **`practice_repair.resolved_at` is still written by no code.** The only statements remain an `insert` and a `resolved_at is null` select (`practice-exposure-repository.ts`; column at `database/migrations/0009_practice.sql:40,44-46`). Passing the fresh item advances the session without closing the row, so §8 item 5 stands and a missed KC is still a repair target for the life of the account. CARS repairs (§9.1) are the exception and resolve at read time.
- **Re-exposure grain is unchanged.** The focus token is still cluster- or skill-grain, freshness is still a 14-day exclusion window, and the repair spec still asks for a fresh item in the missed KC rather than one matching the misconception. The system can now name the misconception (§9.2) and still does not aim re-exposure at it. §8 item 7 stands.
- The Postgres/in-memory `recentMisses` ordering disagreement (§8 item 8) is unchanged.
