# Passage of the Day vs CARS Duel

Comparison across the 88-commit push `e44dc75..4a1c84e`. Prior-system claims re-verified against `git show e44dc75:<path>`. Line numbers are HEAD unless marked pre-push.

## Corrections to our own audit

Two errors in `01-what-cars-duel-does.md`.

- Line 237, "No mistakes log entry from the Duel path": true pre-push, false now (`beae3f5`, §7).
- Line 241, CARS ability "grows from Passage of the Day (stronger weight)": never true in code. `recordCarsPassage` (`packages/authority-core/src/authority.ts:3787`) has zero callers. `CARS_K_POTD = 0.3` (`packages/policies/src/cars.ts:16`) is applied only on the practice-attempt path (`authority.ts:3411-3415`).

The rest held. Pre-push PotD served the fixed item `q-enz-passage-1` (`e44dc75:.../PassageOfDay.tsx:7`) through `useCheckPractice`, so it wrote the attempt log; the rewrite removed that. The Duel had three hardcoded topics and always used index 0 (`e44dc75:.../CarsDuel.tsx:27,56`); it now has 150 (`content/cars-duel/topics.json`).

## 1. Coexist, not replaced

Both ship. `apps/learner-web/src/app/router.tsx:73-74` mounts `/app/passage` and `/app/cars` side by side.

The Duel kept the privileged position: a nav tab (`apps/learner-web/src/screens/AppShell.tsx:27,47`) and a daily-plan activity kind budgeted at 12 minutes (`packages/policies/src/todays-path.ts:158-167,123,528`). PotD has neither. `TodaysPathActivityKind` has no passage member, and the only route in is one hero card on Home (`apps/learner-web/src/screens/Home.tsx:111-112`). Successor in construct, sidecar in placement.

## 2. What the learner does

Duel, unchanged: a four-round free-text debate against an AI on a proposition, no passage and no options (`MAX_ROUNDS = 4`, `packages/ai-gateway/src/cars.ts:15`; no `stimulus` or passage body in the 516 lines of `CarsDuel.tsx`).

PotD: read a passage, then answer five four-option MCQs one at a time with Back/Next, checking each before moving on (`apps/learner-web/src/screens/PassageOfDay.tsx:194-201,203-225,110-118`). Untimed, scored server-side with an explanation reveal.

## 3. Yes, there is a real passage

12 passages, 60 questions, original prose, three paragraphs each, content-agnostic by design (`content/passage-of-the-day/pool.ts:5-9,101-1533`).

Length is the problem. Bodies run **210 to 271 words, mean 232** *[own count]*. Our own reference corpus puts real CARS at a **median of 613 words and 9 paragraphs** (`docs/research/cars-item-design/corpus-structural-profile.json`), against AAMC's stated 500 to 600 (`.../02-passage-design.md:9,154`). These are **38% of exam length**, and a three-paragraph text cannot carry the argument structure the section is built on.

Provenance: hand-authored in-repo. Serving reads Postgres, then a gitignored dev store, then the compiled pool (`apps/learner-web/server/passage-pool-source.ts:47-83`). Nothing has been ingested; `content/passage-of-the-day/.local/` does not exist.

## 4. The three recommendations

| Recommendation | Verdict |
| --- | --- |
| (a) Attach a real passage | **Done**, in a new feature rather than in the Duel. The Duel still has none. |
| (b) Commit before options or feedback | **Partly.** Feedback is gated on a submitted answer (`PassageOfDay.tsx:110-118`), the weaker half. All four options sit on screen with the stem, so the elimination escape hatch our defense doc called the strongest argument for the Duel stays open. No free-text commitment step. |
| (c) Expose the rubric | **No.** PotD has no rubric and repeats the pattern: every wrong choice carries a required `misconception` naming the trap it rewards (`packages/contracts/src/passage-of-the-day.ts:46-63`), stored in the `choices` JSONB (`database/migrations/0019_passages.sql`), projected to the learner nowhere. The Duel rubric is still computed and hidden (`CarsDuel.tsx:228-243`). |

## 5. Grading and feedback

`PassageOfDayService.grade()` compares the pick against the key on the option (`packages/passage-of-day/src/index.ts:138-150`) and returns `correct`, `correctChoiceId`, the question-level `explanation`, and the chosen option's `rationale`. The UI always shows the explanation, and the chosen-option rationale only when wrong (`PassageOfDay.tsx:95-107`). No score, no session summary. Elaborated feedback per item, yes. Visible rubric, no.

## 6. "dok-only difficulty"

`1ff72fe` deleted the `accessible/moderate/demanding` ordinal and left `dok` (1 to 3) as the sole difficulty axis (`packages/contracts/src/passage-of-the-day.ts:36-39,129`), pinned by `tests/architecture/passage-of-day-contract.test.ts:41-48`.

Two costs. First, seed-pool DOK is not authored per item. It is `DOK_BY_SKILL[carsSkill]`, FOC = 2 and RWT = RBT = 3 (`pool.ts:1567-1571,1924`), and `carsSkill` is itself assigned by fixed positional rotation (`pool.ts:1561-1565,1896-1903`). All 60 items take one of **two** values, determined by position. Second, nothing reads it: no non-test consumer selects, orders, or weights by `dok`, rotation is `dayIndex % poolSize` (`packages/passage-of-day/src/index.ts:98-102`), and the one place difficulty would matter passes `b: 0` (`authority.ts:3411-3415`). DOK is a content-complexity label in a slot an empirical `b` should hold, and no response data is collected that could estimate one (§7).

## 7. It feeds nothing

PotD writes no mastery, no attempt log, no CARS signal, and never touches the authority kernel (`packages/passage-of-day/src/index.ts:20-25`; `passage-api.ts:1-18`; migration `0019` header). Answers are graded and discarded. Pre-push PotD fed the mistakes log, so this is a regression.

`packages/policies/src/cars-duel-mistakes.ts` belongs to the Duel, not PotD. A duel holding under 0.75 (`:42,50`) names its weakest dimension's sub-skill (`:67-80`), and the authority pins a **bank** CARS item as a spaced repair in Mistakes (`authority.ts:3735-3738,3754-3780`; `Mistakes.tsx:131`). Resolution reads `listPracticeAttempts` (`authority.ts:4431-4434`), so a correct PotD answer cannot clear a repair.

## 8. Supply

12 passages and 60 items in a new `passages` table, separate from the question bank. Bank CARS supply is unchanged: still **160 items across 91 mostly single-item passages** (`docs/research/repo-state/C-content-and-item-bank.md:140,173`), still roughly 320 short against a 23% exam share. Learner-reachable CARS items went from 160 to 220.

Replenishment is the `tools/passage-cli` `ingest` / `seed` CLI, taking JSON, an array, or JSONL, requiring exactly five questions per passage (`tools/passage-cli/src/main.ts:203-220`; `contracts/src/passage-of-the-day.ts:195-208`). Real capacity, zero throughput so far. The rotation repeats every 12 days.

## Verdict

**Solved:** the transfer-incongruence core. A learner now reads original prose and answers keyed CARS MCQs with per-item explanations, the change our defense doc said would decide the feature. The ingest path and the schema are the right shape, and the per-choice misconception requirement is better content discipline than anything in the bank.

**Inherited:** compute-and-hide. We criticized the Duel for grading three dimensions and showing none. PotD requires a misconception on every wrong option, stores it, shows nothing. Same defect, new field. Options are still visible before any commitment, nothing is timed, and supply is still the binding constraint.

**Introduced, and this is the bad news.** Congruent in form, hollow in placement. Absent from Today's Path, absent from the nav, and it writes nothing: no mastery, no attempt, no CARS ability, no mistake. The one signal that could calibrate a CARS difficulty parameter or clear a CARS repair is produced on screen and discarded, while the feature that does feed all of those is the topic debate with the null transfer result. Pre-push PotD fed the mistakes log with one science item; post-push it feeds nothing with 60 CARS items. `recordCarsPassage` sitting in the authority with no caller is the whole problem in one line.

Not a repeat of the transfer mistake. A different one: the right stimulus wired to nothing.
