# Roadmap — deliberately deferred work

This file exists so that work someone chose not to build yet is written down, not silently forgotten. Each entry names what already depends on the missing piece, what happens today in its absence, and what shape the missing piece needs to have. Nothing here is scheduled, prioritized, or estimated; it is a record of gaps, not a plan.

## The delayed-check scheduler

The evidence-warrant policy (`packages/policies/src/mastery-policy.ts`) defines two recipes — `retained` and `strong` — that both require a `delayed` evidence slot with `minFamilies: 1` and `minDelayHours: 48` (the two slot definitions sit at lines 97 and 107 of that file, inside `EVIDENCE_CONFIG.recipes`). `satisfiesSlot` (same file, around line 142) checks this slot by filtering evidence records to `kind === 'delayed'` and requiring at least one such record whose `delayHours` is `>= 48`.

That consumer is real and load-bearing: `highestSatisfied` walks the recipe list from most to least demanding and returns the first fully-satisfied one, so a skill can only ever reach `retained` or `strong` if the delayed slot is filled. Nothing in the codebase fills it. The `delayHours` field on `EvidenceRecord` (`packages/domain/src/evidence.ts`, around line 134) is documented as "hours since the prior related evidence, if this is a delayed callback," and it is populated exactly one place: `LessonResponseAdaptation`'s input in `packages/domain/src/lesson-response-adapter.ts` takes an optional `delayHours` on its input type (around line 940) and passes it straight through into the resulting `EvidenceRecord` (around line 1109) if the caller supplied it. The adapter never computes this value itself — it only forwards whatever the caller hands it. The one production caller, `workflow.ts` in `services/lambdas/learner-api/src/workflow.ts` (the call to `adaptLessonResponse` around lines 415–432), does not pass `delayHours` at all. The only places in the repository that set `delayHours` are test fixtures in `packages/policies/src/policies.test.ts`. So in the running system every real evidence record has `delayHours` undefined, `satisfiesSlot` reads that as `0`, and `0 >= 48` is always false.

There is a second, independent way the slot could in principle be reached: an authored lesson binding can declare the `DELAYED` candidate evidence mode, which `lesson-response-adapter.ts` maps to `kind: 'delayed'` (the `EVIDENCE_KIND_BY_CANDIDATE_MODE` table, around line 797). But that only decides what _kind_ a record is classified as if the learner happens to reattempt that item; it does nothing to schedule _when_ the reattempt should happen, and it still leaves `delayHours` unset unless a caller supplies it. So even the authored path dead-ends at the same missing piece.

What's actually missing is a producer: something that, after a skill or family first earns independent evidence, remembers that fact and later — at or after 48 hours — either surfaces a "this is due for its delayed check" prompt to the learner, or at minimum computes and attaches the correct `delayHours` when the learner naturally revisits that content. Concretely, a producer needs to:

- Key its bookkeeping on the same grain the slot checks: `familyId` within a skill's evidence records, since `satisfiesSlot` counts distinct families per `kind`.
- Record, at the time of the first qualifying (independent) evidence for a family, the timestamp to measure the delay from.
- Know when 48 hours have elapsed since that timestamp, which means it needs its own due-tracking — a "check due" record per (learner, skill, family) — because nothing today asks "is a delayed check due" the way `recall-core`'s per-card `scheduling.due` lets Recall ask "is this card due."
- On the learner's next qualifying attempt against that family after the delay window opens, compute `delayHours` as elapsed time since the recorded timestamp and pass it into the adapter, and ensure the record is classified as `kind: 'delayed'` (via the existing `DELAYED` candidate-mode mapping or an equivalent resolved-kind path).

The consequence today is not a crash or a visible error — it is silent. `evaluateEvidence` (`packages/policies/src/mastery-policy.ts`) will return `independent` at best for any skill that only has independent and transfer evidence, and will never return `retained` or `strong`, because the recipe that would produce those tiers has a slot that can never be satisfied by anything the system currently emits. Any planner logic, UI copy, or gating decision that expects a learner to reach "retained" or "strong" mastery is gated on a slot with no producer, which makes that tier unreachable by construction rather than merely unearned — and nothing in the current code distinguishes those two cases for a learner or a future maintainer reading a `not satisfied` result.

## Nothing authors a change dimension, so the transfer recipe slot is unearnable

Sibling of "The delayed-check scheduler" above, and the same shape: a recipe slot whose consumer is real and whose producer does not exist. The difference is that this one is not missing a mechanism — the mechanism is complete and wired — it is missing authored data, and supplying it is a judgement about the curriculum rather than a piece of engineering. That is why it is here and not a task.

**What the slot asks for.** `EVIDENCE_CONFIG.recipes` in `packages/policies/src/mastery-policy.ts` gives three of its four recipes a transfer slot of `{ kind: 'transfer', minFamilies: 2, changeDimensions: 2 }` (lines 88, 96, 106). `satisfiesSlot` (same file, around line 152) reads `changeDimensions` as a count of **distinct** values: it unions `record.changeDimensions` across every transfer-kind record for the skill and requires the resulting set to hold at least two members. `gapReasons` (around line 187) emits `CHANGE_DIMENSION_GAP` when it does not. The values are a closed five-member enum, `ChangeDimensionSchema` in `packages/domain/src/evidence.ts:48` — `domain_context`, `representation`, `passage_or_data`, `required_operation`, `section_application` — mirrored into `packages/contracts/src/lesson-observation.ts:12` with parity enforced by `tests/architecture/cross-package-enum-parity.test.ts`.

**Every record production writes carries `[]`.** Three separate reasons, none of them a bug in isolation:

- **The lesson channel has no authored input.** `packages/domain/src/lesson-response-adapter.ts:1127` copies `binding.changedDimensions` verbatim into the evidence record, and the normalizer at line 575 fills that from the authored `changed_dimensions` array, defaulting to `[]` when absent. Measured against all 115 real bindings through the production parser: **0 of 115 author `changed_dimensions`**. The mapping is correct and complete; there is nothing on the other end of it. This is now pinned by `tests/architecture/v3-lesson-binding-conformance.test.ts`, "carries no authored change dimensions, and no prose that could stand in for them."
- **The practice channel has no field to read.** `packages/authority-core/src/authority.ts` hardcodes `changeDimensions: []` at six sites, and the practice evidence writer (around line 2832) does the same. A bank question (`packages/content/src/bank.ts`, the `EngineQuestion` shape) carries `family_id` and no change-dimension field at all, so there is no authored value being dropped — the empty array is the honest report of an absent field.
- **The one populated instance in the repository is synthetic.** The hardcoded `ENZYME_PATH` in `authority.ts` (around lines 274 and 283) sets `['representation']` and `['domain_context']`. It is a development fixture, not curriculum.

**The prose field is not a substitute, and this is the part worth being decisive about.** The V3 artifacts do author a singular `changed_dimension`, and it is tempting to read that as the same fact spelled differently. It is not. It maps to `changedDimensionDetail` (`lesson-response-adapter.ts:576-583`), which contract §7 of `docs/lesson-evidence-mastery-contract.md` describes as "raw reviewed prose... **never** a BKT target and never parsed into `changedDimensions`" — a rule adopted at Gate A of the original run, after a closed `RepresentationFamily` enum fitted to a single lesson turned out to reject the real data. The measurement says the rule is right rather than merely cautious. Across the three lessons the field is authored at three incompatible granularities: free phrases in `V3-LES-130923` (`'unknown variable and direction of inference'`, `'bounded force application'`, `'nested sign'`), bare single words in `V3-LES-789208` (`'representation'`, `'direction'`, `'context'`, and `'not_applicable'` on 36 of its bindings), and SCREAMING_SNAKE labels in `V3-LES-844372` (`'SCALE_TYPE_AND_GRAPHICAL_ENCODING'`). Of the 20 distinct values across all 115 bindings, **exactly one** — `'representation'` — is a canonical enum member. So a mapping that took every exact match and inferred nothing would yield **one** distinct canonical dimension corpus-wide, against a slot that needs **two**. Even the most generous defensible mapping cannot satisfy the slot. Anything that could would be inference from prose, which is the thing the contract forbids and the thing that has already gone wrong once here.

**What the absence costs, stated exactly.** Less than it first appears, and the difference matters for prioritization. Three of the four recipes carry the transfer slot, so all three are unsatisfiable — but `retained` and `strong` were **already** unreachable through their `delayed` slot, which has no producer at all (see the first entry in this file). So no published tier is lost that was not already lost. What is actually lost is `independent_corroborated_by_transfer`, the stricter route to the `independent` tier, and the honesty of the gap report: `CHANGE_DIMENSION_GAP` and `TRANSFER_EVIDENCE_GAP` are shown to a planner (and potentially to a learner) as work still to be done, when no amount of work can close them. That is the same "unreachable by construction versus merely unearned" confusion the delayed-slot entry names, arriving on a second slot. Both halves of this are pinned in `tests/architecture/lesson-mastery-reachability.test.ts` under "the transfer slot is blocked a second time, by data that is never written" — including a test that fails if a delayed producer ever lands, so this paragraph cannot go stale silently.

**Owner decision, not a task.** Populating the field requires deciding, per authored item, which of the five canonical dimensions a changed exit actually changes — and, because the slot counts distinct values, deciding it in a way that produces at least two different answers within a single KC's transfer items. That is a curriculum judgement about what makes two tasks differently-shaped, not a mapping anyone can write from the existing data. Three options:

1. **Author `changed_dimensions` on the transfer-eligible bindings.** The plural key is already recognized and already mapped, so this is authoring alone with no code change — `v3-lesson-binding-conformance.test.ts` will turn red the moment it lands, which is deliberate, and `packages/policies/src/policies.test.ts`'s aspirational label then has to be revisited. Concedes: the two out-of-repo lessons cannot be edited at all (see "Two of the three V3 lessons..." above), so today this can only reach `V3-LES-130923`'s six licensed bindings, and the six must between them carry two distinct dimensions per KC or nothing changes.
2. **Drop `changeDimensions: 2` from the transfer slot** and let two transfer families alone satisfy it. Cheapest, and arguably honest — the system cannot presently distinguish a genuinely re-shaped task from a re-worded one, so requiring a distinction it cannot observe is requiring an unenforceable claim. Concedes the whole point of the transfer slot: two families of the same shape become interchangeable with two families of different shapes, which is exactly what "transfer" was supposed to mean and what `minFamilies` alone already counts.
3. **Leave it, and make the gap say so.** No authoring and no policy change; instead stop reporting `CHANGE_DIMENSION_GAP` as a gap a learner can close, the way this file argues the delayed slot should be distinguished from an unearned one. Concedes nothing about the design and fixes nothing about it either — it makes the reporting truthful and leaves the tier unreachable.

The trade-off is between a content judgement (option 1), weakening a deliberate evidence standard (option 2), and accepting a permanently open slot (option 3). Nothing in the code can make that call, which is why it is written down here.

## Recall card generation from lessons and mistakes

Recall's data model treats a card as authored content: `CardSourceSchema` in `packages/recall-core/src/card.ts` (around line 23) is a closed two-member enum, `'imported' | 'user'`. `'imported'` cards come from parsing an Anki `.apkg` package (`packages/recall-core/src/apkg-render.ts`, with the client-side import flow in `apps/learner-web/src/recall/adapters/apkg-importer.ts` and the `ImportApkg.tsx` screen); `'user'` cards come from the manual card editor (`apps/learner-web/src/screens/recall/CardEditor.tsx`). Neither path reads lesson content or a learner's mistake history. There is no third source.

The deferred work is generating `Note`/`Card` records automatically — from the content of a lesson the learner just completed, and from questions the learner got wrong. The second half already has a natural input: `Authority.getErrorLog` (`packages/authority-core/src/authority.ts`, around line 2474) already hydrates each miss into an `ErrorEntryView` carrying the question stem, the learner's chosen answer, the correct answer, and the choice rationale — exactly the front/back material a mistake-sourced card would need. Nothing today reads an `ErrorEntryView` and turns it into a `Note`. The lesson-content half has no equivalent aggregation point identified yet; it would need to read whatever the lesson artifact/binding exposes as explanatory content and shape it into a front/back pair.

The reason to be careful here is that Recall is deliberately walled off from mastery. `packages/recall-core/src/mastery-boundary.ts` declares `RECALL_WRITES_MASTERY = false` (line 24) and the `masteryRecall` object asserts `writesMastery: false` and `readsMastery: false` (lines 35–39) — Recall must never call `applyMasteryAttempt`, write mastery tables, or import `@mcat/authority-core` or the mastery policies. Generating cards _from_ lesson content and mistake records does not touch that boundary, because it is a one-way read into Recall's authoring surface, not a read of mastery state and not a write into it: a generator would read lesson artifacts and `ErrorEntryView`-shaped mistake data (both of which already exist independently of BKT/`P(L)`) and produce ordinary `Note`/`Card` rows that FSRS schedules exactly like any hand-typed or imported card. A future implementer should not read "generate cards from mistakes" as license to have Recall read mastery state to decide _which_ mistakes matter or to write anything back — that would cross the wall this file exists to keep standing. If a generated card needs its own provenance (to distinguish it from `'user'` or `'imported'` for analytics or re-generation logic), `CardSourceSchema`'s enum would need a coordinated, explicit extension rather than overloading `'user'` silently.

The consequence today is pure manual effort: nothing in a lesson or in a recorded mistake ever becomes a Recall card unless the learner retypes or re-authors it by hand (or exports it externally into `.apkg` form and re-imports it). This doesn't fail or error — it simply never happens, so Recall's content is only as complete as what a learner chooses to type in themselves.

## Recall becoming due-driven rather than once-daily

Today, whether and how much Recall appears in a day's plan is decided once, at plan-build time, from an aggregate snapshot rather than from live per-card due timestamps. `buildTodaysPath` (`packages/authority-core/src/authority.ts`, around lines 655–666) keys the plan on `planDate`: once a plan exists for the current calendar date, that same plan — including its Recall sizing — is returned unchanged for the rest of the day unless the caller explicitly forces a rebuild. Recall's size within that plan comes from `sizeRecall` (`packages/policies/src/todays-path.ts`, around line 299), which takes a `TodaysPathRecallLoad` — a single aggregate snapshot of `dueLearning`, `dueReviews`, `due`, and `estimatedMinutesForDue` (the type is defined around line 158 of the same file) — computed once when the plan is built, not the individual due timestamps behind that count.

The one exception is `maybeInjectRecall` (`packages/authority-core/src/authority.ts`, lines 820–860), which can add a Recall block to a plan that was already built without one — its docstring gives the example of a learner adding their first deck after the plan was built with no cards due. But it only fires when the plan has _no_ Recall activity yet (it checks `plan.activities.some((a) => a.kind === 'recall')` and no-ops if one is already present, around line 827); it sizes the injected block from the same kind of one-time aggregate snapshot passed in at the moment it runs, and it is never re-invoked later in the day to grow, shrink, or re-time an already-injected block as more cards cross their due threshold.

Notably, the per-card due ordering this would need already exists one layer down: `recall-core`'s own queue selection (`packages/recall-core/src/selection.ts`) already sorts by each card's real `scheduling.due` timestamp (`isDue`, around line 35, and the due-first sort in `getReviewQueue`) and serves due cards before new ones. So the missing piece is not in Recall's own scheduling — it is entirely on the Today's Path side: the planner has no notion of "recall is due right now" independent of the once-per-day snapshot it took when the plan was built, and no mechanism to re-check or re-surface Recall as cards become due over the course of the day.

Making Recall due-driven would require the planner to re-evaluate recall due-state on demand rather than only at plan-build time — for instance, recomputing (or being pushed) the due aggregate whenever the learner opens the app rather than trusting the frozen `planDate`-scoped snapshot — and to decide how a plan that was already built earlier in the day should react to cards crossing their due threshold mid-day: either by relaxing the "already has a recall activity" short-circuit in `maybeInjectRecall` so it can resize an existing block, or by moving recall timing out of the once-daily plan model entirely and driving it directly off `recall-core`'s per-card due timestamps.

The consequence today is that Recall's presence and size in a day's plan reflect how many cards were due at the moment the plan happened to be built, not how many are due right now. A learner who opens the app early, gets a small or empty Recall allocation, and then has a wave of cards come due later that same day will not see the plan reflect it unless something forces a full rebuild — this doesn't error, the existing allocation just quietly under-represents the learner's actual review load for the rest of that day.

## The evidence ladder and the lesson grain, dormant at the database layer

Tonight's cleanup deleted three dormant copies of the retired evidence-ladder vocabulary (`not_assessed → learning → independent → retained → strong`, plus the dead seventh rung `exam_ready_now`) and closed off the one live affordance for writing a stored lesson-mastery grain — `MasteryStateSchema` in `packages/contracts` (`dbef52f`), `stateColor` in `packages/design-tokens` (`4b17c3c`), and the `'lesson'` member of `MasteryGrain` in `services/persistence-postgres/src/mastery-repository.ts` (`e0aa670`, which narrowed the type to `'kc' | 'skill'` and deleted the `mastery_lesson` row from the `GRAIN` table so the call is now a compile error). All three were caught by `tests/architecture/contracts-ladder-ban.test.ts` and `tests/architecture/mastery-write-path.test.ts`, and both of those guards work the same way: they read TypeScript source text. Neither one, nor anything else in the repo, reads a `.sql` file — `mastery-write-path.test.ts`'s own `SOURCE_EXTENSIONS` pattern (`/\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/`, line 355) walks `apps`, `database`, `infra`, `packages`, `scripts`, `services`, `tools` (`PRODUCT_TREES`, line 345) but skips every migration file by extension before it ever gets to look at content. Two remnants of the same shape survive precisely there, below where any of tonight's guards can see.

**`mastery_lesson`.** `database/migrations/0007_mastery.sql:46` creates the table (`learner_id`, `lesson_id`, `p_l`, `half_life_days`, `last_practiced_at`, `last_due_review_at`, `updated_at`, primary key `(learner_id, lesson_id)`), and `services/lambdas/migration/src/runtime.ts:230` grants `select, insert, update` on it, alongside `mastery_kc`, `mastery_skill`, `cars_ability` and `question_stats`, to the `mcat_learner_api` role — the same role the deployed learner-api Lambda connects as. I confirmed independently, by string search rather than by trusting the commit message, that nothing writes or reads it: `getMasteryUnit`, `upsertMasteryUnit` and `listMasteryUnits` in `services/persistence-postgres/src/mastery-repository.ts` are the only functions that ever queried any `mastery_*` grain table, and a repo-wide search for their names (`getMasteryUnit|upsertMasteryUnit|listMasteryUnits`) turns up only their own declarations — zero callers anywhere under `apps`, `services`, `packages`, or `scripts`. A second, independent search for the literal string `mastery_lesson` turns up exactly four hits, and all four are inert: the `create table` in the migration itself, the grant string (and its mirrored assertion) in `services/lambdas/migration/src/runtime.ts` / `runtime.test.ts`, and one sentence in `docs/mastery-pipeline.md:94-97`, which already documents the table as dead — "`mastery_lesson` is legacy storage for the pre-seam lesson chain and is not the source of a V3 lesson-grain value." No other migration (`0002` through `0012`) alters, drops, or revokes anything touching `mastery_lesson`; it has sat exactly as `0007` left it since. The reason it's believed vestigial isn't just the zero-callers count — the design itself forbids a stored lesson grain: lesson mastery is a derived rollup over member-KC `P(L)` (`docs/mastery-pipeline.md` §0, §5.2), computed on read, with exactly one source of truth. `e0aa670`'s type narrowing is what currently stands between the schema and a write; a caller reaching for `q.query('insert into mastery_lesson ...')` directly, bypassing the repository module entirely, would compile, run, and pass every architecture test that exists today, because none of them reads SQL text.

**`mastery_projections.mastery_state` / `.refresh_needed`.** `database/migrations/0001_authority.sql:177-192` creates `mastery_projections` with `skill_id`, a `mastery_state text` column CHECK-constrained to the same six live tiers the ladder ban now enforces in TypeScript (`not_assessed, foundation_needed, learning, independent, retained, strong`), a `refresh_needed boolean not null default false`, and `mastery_projections_skill_state_idx` on `(skill_id, mastery_state)`. I confirmed no application code reads or writes the column by searching for the literal strings `mastery_state` and `refresh_needed` (not the camelCase field, the SQL identifiers) across the repo: the only hits are the migration itself and `database/src/migrations.test.ts:45`, which asserts `create table mastery_projections` exists — a schema-presence check, not a read or write of any column. No later migration touches the table at all. It's not just unwritten; unlike `mastery_lesson`, it isn't even reachable through a grant — `services/lambdas/migration/src/runtime.ts`'s `dataGrantSql` lists grant every other per-learner table (`learners`, `guest_sessions`, `learner_streams`, `accepted_events`, `outbox`, the four `mastery_*`/`cars_ability`/`question_stats` tables) to either `mcat_learner_api` or `mcat_workers`, but `mastery_projections` — along with its siblings `plan_projections`, `review_projections`, and `error_projections` from the same migration — appears in neither list. The actual per-learner projection in this system is the single JSONB blob at `learner_streams.state_json`, read and written by `services/persistence-postgres/src/postgres-repository.ts`; the individually-typed `*_projections` tables from `0001` look like an earlier, superseded design for that same projection that the JSONB approach replaced, leaving all four as dead weight. So this pair is actually one step further from a live write path than `mastery_lesson`: reintroducing a write would need both a code change and a new grant, not code alone.

On `refresh_needed` specifically, the sibling contested-vocabulary question: I confirmed `refreshNeeded` (camelCase) is real and load-bearing, but it names a different fact and lives in a different place. `evaluateEvidence` in `packages/policies/src/mastery-policy.ts:305-306` computes it live, per read, from evidence-record freshness (`packages/domain/src/mastery.ts:72`: "True when the warrant is stale or contradicted. History is never erased.") and it is carried inside the `EvidenceState`/`MasteryMapEntry` shapes that round-trip through `learner_streams.state_json`, never through the standalone `mastery_projections` row or its boolean column. This is exactly the distinction commit `e499396` ("give BKT decay and evidence staleness different words") fixed in the UI: `refreshNeeded` is the evidence warrant going stale, `reviewDue` on `SkillMasteryView` is BKT capability decaying below the review line, and `packages/contracts/src/mastery.ts`, `packages/authority-core/src/types.ts`, and `packages/policies/src/lesson-rollup.ts` all now carry comments warning a reader not to merge them. The dormant `mastery_projections.refresh_needed` column is unrelated to that live field beyond sharing a name — a future reader who finds the column and assumes it's where the app-level `refreshNeeded` lives would be looking at the wrong layer entirely, and reviving the column under that assumption would be a second, competing store for a value that already has one home in the JSONB blob.

Two things make this worth writing down rather than fixing outright. First, these are invisible to every guard that exists: `contracts-ladder-ban.test.ts` walks `packages/*` source text, `mastery-write-path.test.ts` walks TypeScript/JavaScript across the product trees, and the type narrowing in `e0aa670` closes one call site in one file — none of the three, individually or together, can see a parameterized SQL string or a CHECK constraint, because a `.sql` file is not in `SOURCE_EXTENSIONS` and a raw `q.query(...)` call is not a symbol either guard resolves. Second, a dormant schema is not a harmless one: for `mastery_lesson` the table, its primary key, its `p_l`/`half_life_days` CHECK constraints, and the `insert, update` grant to the API role are all already assembled, so reviving a competing lesson-mastery source of truth is one `q.query('insert into mastery_lesson ...')` call away, not a migration away. `mastery_projections.mastery_state` is one step further out (no grant), but the table, the CHECK constraint mirroring the exact ladder vocabulary just banned in TypeScript, and the index are all sitting there too, needing only a grant and a caller to become the same problem.

The cleanup, when someone picks it up, is a migration (or two): drop `mastery_lesson` and revoke its grant on `mcat_learner_api` in `runtime.ts`, and either drop `mastery_projections` (and its unused siblings `plan_projections`, `review_projections`, `error_projections`, which share its "designed, never wired up" history) or at minimum drop the `mastery_state`/`refresh_needed` columns and their index. Either is a real schema migration with deployment sequencing to think about — which is exactly why `e0aa670`'s commit message says dropping the table was left alone as out of scope for a code-level fix, and why this is roadmap work rather than a same-night follow-up.

I did not find a fifth ladder or lesson-grain instance anywhere else at the database or infrastructure layer: every CHECK constraint across `database/migrations/0001` through `0012` was enumerated (`\w+ in (...)` pattern) and only `mastery_projections.mastery_state` names three or more ladder members; `infra/cdk` has no reference to `mastery_lesson`, `mastery_state`, or `refresh_needed` anywhere in its source; and the CDK grant lists, the migration lambda's grant lists, and the persistence-layer repositories agree on which tables are actually live (`mastery_kc`, `mastery_skill`, `cars_ability`, `question_stats`, `learner_streams`, plus the auth/event/outbox tables) versus which were designed once and never connected to anything (`mastery_lesson`, and the whole `plan_projections`/`review_projections`/`error_projections`/`mastery_projections` family from `0001`).

## Two of the three V3 lessons that BKT eligibility depends on are not in the repository

Commit `e579779` (`feat(lessons): license CHANGED_EXIT terminal checks for BKT evidence`) attached `candidate_evidence_modes: ['TRANSFER']` and a `reasoning_operation` to `V3-LES-130923`'s six `CHANGED_EXIT` terminal checks (one initial plus one re-entry per KC, across its three KCs). It could only reach that one lesson. `V3-LES-130923` is in-repo, at `content/lessons/v3-les-130923/lesson-script.json`, generated deterministically by `packages/content/src/v3-vector-lesson-artifacts.ts` (`TARGET_LESSON_ID`, line 4) — licensed, 6 bindings. `V3-LES-789208` and `V3-LES-844372` live in the workspace-sibling `research/mcat-curriculum-architecture-v3/lesson-authoring-drafts/` tree. I confirmed that tree sits under no `.git` at all: `git -C research/mcat-curriculum-architecture-v3/lesson-authoring-drafts rev-parse --show-toplevel` fails with "not a git repository", and the same check fails from every directory between it and the filesystem root, including the `Graduate Masterclass` workspace root itself and its parent — `mcat-prep` is the only git repository anywhere in that vicinity. An edit to either drafts lesson would be uncommittable, so none was made.

**Consequence.** The conformance suite's per-lesson `EXPECTED_QUALIFIED_BKT_OBSERVATIONS` (`tests/architecture/v3-lesson-binding-conformance.test.ts:61-63`) now reads `{ 'V3-LES-130923': 6 }`, with every other lesson defaulting to `0`; against the pinned 115-binding corpus (`tests/architecture/lesson-corpus.ts:62-70`, `42 + 40 + 33 = 115`), that is BKT-eligible bindings going from **0 of 115 to 6 of 115**. I counted the underlying `activity_role` values myself rather than trust this: each lesson's `question_evidence_plan` array — the same field `lessonCorpus()` in `tests/architecture/lesson-corpus.ts:106` reads as `bindings` — carries `activity_role: 'CHANGED_EXIT'` on exactly 6 items in `V3-LES-130923`, 8 in `V3-LES-789208`, and 3 in `V3-LES-844372`: **6 / 8 / 3 = 17** `CHANGED_EXIT` terminal checks across the three lessons, of which **11 of 17** (the 8 in `V3-LES-789208` and the 3 in `V3-LES-844372`) are unreachable from this checkout. The remaining ~109 non-`CHANGED_EXIT` bindings, and those 11 unreached `CHANGED_EXIT` checks, are not blocked by missing design or unfinished code — both drafts lessons already exist, fully authored, in the same schema `e579779` licensed against. They are blocked solely by living outside version control.

**A count worth pinning down here so nobody re-derives it a third time.** The same `question_evidence_plan` arrays also carry `activity_role: 'NEAR_EXIT'` on exactly 6 / 8 / 3 items, matching `CHANGED_EXIT` one-for-one per lesson, so `NEAR_EXIT` + `CHANGED_EXIT` combined is **12 / 16 / 6** per lesson — the number that shows up elsewhere as the plan's "12/16/6." That is the combined `NEAR_EXIT` + `CHANGED_EXIT` terminal-check total per lesson, a different measurement from the `CHANGED_EXIT`-only `6/8/3 = 17` above. Both numbers are correct; they are not the same count and neither supersedes the other. `NEAR_EXIT` was deliberately left on the legacy instructional-only alias in `e579779` and contributes 0 to BKT eligibility either way.

**Owner decision, not a task.** Both blocked lessons are complete, reviewed-shaped artifacts sitting one filesystem hop outside the repo, not unfinished work — so this is a choice, not a to-do:

1. **Vendor the drafts tree into the repository** — copy `V3-LES-789208` and `V3-LES-844372` into `content/lessons/`, next to `V3-LES-130923`, so they become committable, reviewable, and eligible for the same `CHANGED_EXIT` licensing `e579779` gave the first lesson. This is also the fix the conformance suite's own failure diagnostic already names (`tests/architecture/lesson-corpus.ts:166-167`). Trade-off: someone has to decide the drafts are final enough to freeze as the reviewed, committed version, rather than whatever the drafts tree evolves into next — vendoring is a one-way door on provenance, not a symlink.
2. **Leave those lessons permanently ineligible for mastery signal.** Zero engineering cost today, but it caps V3's BKT-eligible surface at 6 of 17 `CHANGED_EXIT` checks — and every other kind of evidence those two lessons could ever carry — indefinitely, not just until someone gets to it.

This is an owner call because it trades a content-provenance decision (is a drafts-tree artifact "done" enough to commit as-is) against real, measurable mastery coverage, and nothing in the code can make that trade-off on its own.

## A practice item that was served but never answered has no state of its own

Practice records a learner's exposure to an item at exactly one moment: when they answer it. `Authority.submitPracticeAttempt` (`packages/authority-core/src/authority.ts`, around line 2441) calls `this.practiceBank.recordExposure(...)`, and nothing else in the codebase calls it — `Authority.getPracticeQueue`, which is what actually hands items to a learner, writes nothing at all. So an item that appears in a queue and is then abandoned unanswered is, as far as every reader of that record is concerned, an item the learner has never encountered: `recentlySeenIds` does not return it, the next queue can select it again, and `shortfall` correctly reports `0` because the queue was full — it is honest about how many items were delivered and says nothing about whether the learner had already been shown them.

**Why the obvious fix is not available.** `practice_exposure` (`database/migrations/0009_practice.sql`, read and written in `services/persistence-postgres/src/practice-exposure-repository.ts`) holds one row per learner × item, carrying `last_seen_at` and `seen_count`. Two different consumers read that one row for two different purposes. `recentlySeenIds` (repository line 360) reads `last_seen_at` to keep a 14-day rotation window, which is the queue-freshness question. `recordExposure` (line 394) returns `seen_count - 1` as `priorExposures`, and `submitPracticeAttempt` derives `firstAttempt` from `priorExposures === 0` — which is the mastery question, since `firstAttempt` is what gates whether a response moves `P(L)`, appends a `bkt_observation_applied` ledger record, writes an independent evidence record, logs an attempt, and queues a repair on a miss (commit `f976695` made this derivation server-side precisely so no client could claim it). Because both facts live in one write, recording an exposure at serve time is not a rotation change that incidentally touches mastery — every item is served before it is answered, so it would make **every** practice answer a repeat, permanently. `packages/authority-core/src/practice-exposure-timing.test.ts` measures this rather than asserting it: with the serve counted, a correct unassisted first answer leaves `state.mastery.kc[...]` undefined, writes zero BKT ledger records, produces a non-independent evidence record, and queues no repair on a miss. It also measures the second, independent cost: because `usePracticeQueue` (`apps/learner-web/src/app/practice-queries.ts`) sets `staleTime: 0` and refetches on every mount, a page refresh is a fresh serve, and three rounds against the synthetic fixture exhaust its entire five-item pool without the learner answering once — leaving an empty queue and a full `shortfall`, which is the exact degraded state `shortfall` was added to explain.

**What is deferred is the third option**, and it is a genuine one: track served-but-unanswered as a state distinct from both unseen and answered, so the rotation reader sees served ∪ answered while the `firstAttempt` derivation continues to see answered only. Concretely that needs a `last_served_at` column on `practice_exposure` (or a separate `practice_serve` table) kept strictly apart from `seen_count`; a new port method on `PracticeBankPort` (`packages/authority-core/src/practice.ts`, around line 148) implemented in both the Postgres port and `SyntheticPracticeBankPort`, with the Postgres port's schema probe degrading safely the way `hasExposure` already does; `recentlySeenIds` widened to union the two, with its own window, since "shown to you and skipped" should almost certainly expire sooner than "answered"; and a decision about writing on a read, because `GET /v1/practice/queue/:count` (`services/lambdas/learner-api/src/routes.ts`) is currently a pure read and a serve-time write makes it not one.

**Why it is not a same-night code fix.** Three of those four pieces are schema and deployment work — a migration with the same sequencing questions as any other, plus a grant, plus a behaviour change to a deployed GET route — which is the same reason the dormant-table cleanup above is roadmap work rather than a code-level change. The fourth is not an engineering question at all: nobody has evidence about whether a learner meeting an abandoned item again is a problem worth solving. It is not obviously a harm — the learner never answered it, so re-serving is arguably continuity rather than repetition — and the failure it would fix (a learner who abandons at the same position every session, and so meets the same wall each time, because selection is deterministic) is narrow, while the failure it introduces (an item shown once and never engaged with, withheld from the learner for the length of the rotation window) is broad. Someone has to decide which of those they would rather have, and pick the served-state expiry that follows from it.

**The consequence today is bounded and, on the current reading, benign.** A learner who abandons a session can be handed the same items in the next one; nothing is mis-scored, no mastery moves that should not, and `firstAttempt` means exactly what it says. The risk worth naming is not the behaviour but its reversal: this is a decision that looks like an oversight, so `practice-exposure-timing.test.ts` and the `SERVING IS NOT AN EXPOSURE` docblock on `getPracticeQueue` exist to make an unconsidered serve-time write fail loudly rather than quietly break every practice answer in the product.

## `V3-LES-844372`'s six re-entry items are mislabeled `REPAIR_CONFIRMATION`

Gated on the item above: the fix is a JSON edit inside the same out-of-repo lesson, so it cannot be committed, reviewed, or pushed until that lesson is vendored in (or made committable some other way).

In `V3-LES-844372`'s `question_evidence_plan` (`research/mcat-curriculum-architecture-v3/lesson-authoring-drafts/V3-LES-844372/lesson-script.json`), 12 items carry `activity_role: 'REPAIR_CONFIRMATION'`. Six of them — `ALG-GRAPH-REENTRY-NEAR-01`, `ALG-GRAPH-REENTRY-CHANGED-01`, `ALG-SYS-REENTRY-NEAR-01`, `ALG-SYS-REENTRY-CHANGED-01`, `ALG-LOG-REENTRY-NEAR-01`, `ALG-LOG-REENTRY-CHANGED-01` — are structurally `NEAR_EXIT` / `CHANGED_EXIT`, not repair-confirmation items. I verified this directly against the artifact rather than take it on trust; four independent signals agree:

1. **`exact_reentry_for`.** The six items above carry `exact_reentry_for: 'NEAR_EXIT'` or `'CHANGED_EXIT'`; the other six genuine `REPAIR_CONFIRMATION` items (`*-REPAIR-CONFIRM-01`, `*-REPAIR-SLOPE/TRANSLATE/RATIO-CONFIRM-01`) carry `exact_reentry_for: null`.
2. **`exit_function`.** Same split: `NEAR_USE` / `CHANGED_TASK` on the six mislabeled items, `null` on the other six.
3. **`kc_scripts[*].exact_reentry_bindings`.** Each of the lesson's 3 KC scripts cross-references the same six item ids under `failed_function: 'NEAR_EXIT'` / `'CHANGED_EXIT'` — for example `V3-KC-452593`'s entry names `ALG-GRAPH-REENTRY-NEAR-01` under `failed_function: 'NEAR_EXIT'`. `REPAIR_CONFIRMATION` is not a legal `failed_function` value at all (`docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md:640-648`: `failed_function` takes only `NEAR_USE`/`CHANGED_TASK`, derived 1:1 from `activity_role`).
4. **Assistance split.** The six mislabeled items are all `assistance_available: 'A0'`; the other six genuine `REPAIR_CONFIRMATION` items are all `'A1'` — matching the immutable-first-attempt-versus-assisted distinction genuine repair-process items are supposed to carry.

Both sibling lessons corroborate this from the outside. `V3-LES-130923`'s analogous items (`vtr-vec-near-exit-reentry`, `vtr-vec-changed-exit-reentry`, and the `vtr-trig-*` / `vtr-dir-*` equivalents) and `V3-LES-789208`'s (`prompt-qms-*-reentryNear` / `-reentryChanged`) are already labeled `activity_role: 'NEAR_EXIT'` / `'CHANGED_EXIT'` directly. Neither sibling ever routes a re-entry item through `REPAIR_CONFIRMATION`; `V3-LES-844372` is the only one of the three that does.

**Recommended fix**, blocked only by the item above: relabel `ALG-*-REENTRY-NEAR-01` → `activity_role: 'NEAR_EXIT'` and `ALG-*-REENTRY-CHANGED-01` → `activity_role: 'CHANGED_EXIT'`, for all three KC families (`GRAPH`, `SYS`, `LOG`). `V3-LES-844372`'s `question_evidence_plan` already has 3 correctly labeled `NEAR_EXIT` and 3 correctly labeled `CHANGED_EXIT` items outside this mislabeled set, so the fix does not create new terminal checks — it stops six existing ones from hiding under the wrong role, taking the lesson's `NEAR_EXIT`/`CHANGED_EXIT` surface from 3/3 to 6/6 and making all 6 eligible for the same `CHANGED_EXIT` licensing treatment `e579779` gave `V3-LES-130923`, once the lesson itself is committable.

## Lesson-only mastery is unreachable, and the suspected cause is not the real one

Established in `d438d43`, pinned in both directions by a 7-case test at
`tests/architecture/lesson-mastery-reachability.test.ts` that drives the real runtime, the real
adapter, and the real warrant policy end to end.

**The premise everyone reached for first is false.** `isRetry` on a re-entry exit looks like the
obvious blocker — the re-entry is the second of two administrations a KC needs, and
`isIndependentAdministration` refuses whenever `isRetry` is set. It isn't the blocker.
`vector-lesson-response-source.ts:355` emits `isRetry: false` as a literal on every response, and the
runtime's own comment there says why: "repair confirmations and exact re-entries are distinct items
with their own bindings, not retries of this one." The re-entry is committed under its own
`itemBindingId` and its own `semanticFamilyId`, never as a second attempt at the initial. I verified
this against the runtime rather than the comment: walking the lesson and missing every initial exit
(`tests/architecture/lesson-mastery-reachability.test.ts`, "commits the re-entry exit as its own item,
never as a retry of the initial") shows both halves administered, `isRetry`/`isDiagnosticRetry` false
and `attemptIndex: 1` on every one of them, and 6 distinct `semanticFamilyId`s across the 3 KCs — two
per KC, exactly what a `minFamilies: 2` slot counts. Family diversity is present. Retry status is
false. Neither is the blocker.

**The real cause is structural, in `EVIDENCE_CONFIG`.** All three recipes in
`packages/policies/src/mastery-policy.ts` (`EVIDENCE_CONFIG.recipes`, lines 73–114) — `independent`,
`independent_corroborated_by_transfer`, `retained`, `strong` — open with the identical first slot,
`{ kind: 'independent', minFamilies: 2 }` (lines 77, 87, 95, 105). The lesson channel emits no
`independent`-kind record on any path it can reach. `e579779` licensed exactly six bindings for BKT —
the `CHANGED_EXIT` initial/re-entry pair on each of `V3-LES-130923`'s three KCs — and all six declare
`candidate_evidence_modes: ['TRANSFER']` (`packages/content/src/v3-vector-lesson-artifacts.ts:1402`),
never `INDEPENDENT`. `TRANSFER` resolves to `kind: 'transfer'`, which fills the _second_ slot in the
`independent_corroborated_by_transfer`/`retained`/`strong` recipes — a slot that cannot be reached
while the first slot, the one every recipe requires, sits empty. The reachability test confirms this
is the only two kinds the lesson channel ever produces ("emits no independent-kind evidence from the
lesson channel, on any path": `kinds` equals exactly `{'instruction', 'transfer'}`), that every KC
this can reach lands on `evidenceQuality: 'learning'` with `satisfiedSlots: []` ("leaves the
independence slot open on every KC, so no recipe is satisfied"), and that swapping only the `kind`
field from `'transfer'` to `'independent'` on the identical records — same walks, same families, same
correctness — flips every KC straight to `mastered: true` ("clears the gate the moment the same
records are the independent kind"). So the diagnosis is not a guess: the one variable that matters was
isolated and toggled.

**What this withholds, concretely.** `mastered` on a lesson rollup requires both halves —
`pL >= 0.95` _and_ `evidenceSufficient` on every required KC (`packages/policies/src/lesson-rollup.ts`,
`isEvidenceSufficientForMastery`, lines 91–96, added by `669fbcf`). The reachability test hands the
capability half its maximum possible value directly (`initialMemoryState(1)`, i.e. `pL = 1` on every
required KC) and still gets `rollup.view.mastered === false`, with `members.some((m) =>
m.evidenceSufficient)` false across the board ("withholds `mastered` from a lesson-only learner even
at P(L) = 1"). No amount of lesson success moves this. It is not a quantity shortfall — a seventh or a
seventieth correct exit changes nothing, because the missing ingredient is a `kind`, not a count.

**This is a real constraint, not a dead end — say it that way.** The _capability_ half is reachable:
`bktUpdate` under the lesson's own discounted guess rate (`LESSON_EXIT_GUESS_G = 0.5`, twice the
practice guess, from `669fbcf`) carries `P(L)` from the `0.2` prior over the `0.95` cut in exactly 5
correct exits (`packages/policies/src/bkt.ts`; pinned by "carries P(L) over the cut on repeated correct
exits, so only the warrant is missing"). Only the _warrant_ half is closed, and only for the lesson
channel — practice already emits the missing kind and does clear the gate
(`packages/authority-core/src/lesson-discounting.test.ts`, "writes independent evidence"). Writing this
up as "lessons can't reach mastery" would misrepresent it: lessons move the estimate all the way to its
ceiling and hand off cleanly to practice, which is arguably the seam working as designed (§11 of
`docs/lesson-evidence-mastery-contract.md` frames the intended division this way). The finding is
narrower and more specific than that framing suggests — one recipe slot, one evidence kind, nothing
else.

**Two supporting facts worth pinning down before an owner decides.**

- **On a clean walk, only 3 of the 6 licensed bindings are ever administered.** The re-entry half of
  each `CHANGED_EXIT` pair is only reached after the initial exit is missed
  (`walkLesson`'s `wrongOn` parameter in the reachability test); a learner who answers every initial
  exit correctly never sees the re-entry item at all, and so never produces the second family in the
  pair. The 6-family, both-halves-administered picture above is the _union_ of a clean walk and a
  miss-every-initial walk, not what any single learner actually accumulates in one pass.
- **This interacts with the out-of-repo lesson gap above.** Options 2 and 3 below are both authoring
  changes, and two of the three V3 lessons — `V3-LES-789208` and `V3-LES-844372` — are not in version
  control (see "Two of the three V3 lessons that BKT eligibility depends on are not in the repository,"
  above). Any authoring fix applied today can only land on `V3-LES-130923`.

**Owner decision, not a task.** Three options, each conceding something different:

1. **Leave it.** Lessons teach and move the estimate; practice supplies the warrant that lets the claim
   stand. This is exactly what the code does today, and it is arguably the design working as intended
   — §11 of the contract already frames the split this way. Concedes: a KC can sit at `pL = 1` with
   `mastered: false` for as long as the learner never practices it, which reads as a bug to anyone who
   has not read this file.
2. **Declare `INDEPENDENT` alongside `TRANSFER`** on the six licensed bindings
   (`packages/content/src/v3-vector-lesson-artifacts.ts:1402`). Verified against the reachability
   test's own relabeling case to flip the gate; a one-line authoring change on an in-repo file, no
   policy code touched. Concedes real ground: it asserts that a just-taught `CHANGED_EXIT` check
   demonstrates _independent_ capability, which is the exact claim `LESSON_EXIT_GUESS_G = 0.5` was
   introduced to discount (`669fbcf`'s message: a lesson-exit check asks about material the learner was
   shown moments ago, so a correct answer is weaker evidence than a practice answer, not equal
   evidence under a different label). Declaring `INDEPENDENT` here partly undoes that commit's premise
   without changing the guess-rate math it introduced.
3. **Add an `independent`-kind lesson item that is not an exit check.** New authoring surface, not a
   policy change and not a relabeling of an existing claim — a genuinely new administration designed to
   warrant independence rather than to teach. Concedes the most engineering cost of the three, and,
   per the fact above, can only be built into `V3-LES-130923` today.

## Every lesson Today's Path can schedule is preview content, and none of it reaches the evidence pipeline

**This predates tonight and is not a regression from any of tonight's commits.** No evidence write has
ever existed on this path: `git log --all -S` for `attempts`, `adaptLessonResponse`, and `evidence`
against both `apps/learner-web/src/screens/Lesson.tsx` and
`apps/learner-web/src/app-native/LessonRenderer.tsx` returns zero commits for either file, across the
whole history of both. Tonight's work did not break this; it is what made the disconnect legible and
consequential, because tonight is when the evidence gate, the discounting math, and the reachability
boundary became real enough for their absence on this path to matter.

**The finding.** `APP_NATIVE_LESSONS` (`apps/learner-web/src/app-native/index.ts:47-68`) holds 14
lessons, and `buildCandidateLessons()` (`apps/learner-web/src/app/today-queries.ts:55-56`) feeds
exactly that list into `POST /v1/plan/today/build` — so those 14 are every "New Lesson" Today's Path
can ever schedule. `LessonRenderer` makes no HTTP call at all: its entire runtime is a
`localStorage` blob (`LessonRenderer.tsx:1054`), and `submitQuestion` (lines 1092-1112) grades the
answer client-side against `evaluation.correctOptionId` and stores it locally. `Lesson.tsx:41-51`
passes the renderer exactly one behaviour that leaves the browser — `onComplete`, which navigates
back with a `completedActivityId` that `useConsumeCompletedActivity` turns into a single
`POST /v1/plan/today/activity` (`today-queries.ts:206-217`); `useLaunchPlanActivity` fires the
matching `in_progress` on the way in (`today-queries.ts:162-168`). Two plan-status calls, and
nothing else.

**I reproduced this against the real authority rather than trusting the report.** Building a plan
from the real `buildCandidateLessons()` shape, then driving `recordPlanActivity(…, 'in_progress')`
and `recordPlanActivity(…, 'complete')` — the only two server calls the lesson screen makes —
leaves `getMasteryLessons(state)` at `[]` both before and after, all seven skills at the raw
`pL: 0.2` prior both before and after, `state.mastery.kc` an empty object, and
`practicedLessonIds` empty. The scheduled activity was `V3-LES-386478`, titled "Map the structure of
an argument", detail `New lesson — teach before testing.`

**Why `GET /v1/progress/lessons` returns `[]` rather than a stale number.**
`services/lambdas/learner-api/src/workflow.ts:280-284` calls `authority.getMasteryLessons(state)`
with no id list, and `getLessonRollups` defaults `ids` to `m.practicedLessonIds`
(`packages/authority-core/src/authority.ts:2267`). That array is appended only by
`recordPracticedLesson`, reached only from the practice/BKT path (`authority.ts:2871-2873`). An
app-native completion never touches it, so these lessons are absent from the surface entirely. This
matters for how the failure should be described: the Progress page does not display a wrong number
for them, it displays nothing, and the plan's own copy — "teach before testing" — is literally
honest about the seam. The harm is an unmet expectation and a silent surface, not a false claim
rendered on screen.

**Completion is not inert, and the difference is the whole point.** `recordPlanActivity`
(`authority.ts:918-944`) adds the lesson to `state.completedLessons`, and the next plan build folds
its KCs into `state.taughtKcIds` (`authority.ts:1097-1102`) — three KCs, in the run above. That is
what unlocks Practice at `practiceUnlockLessons: 3` and what scopes the practice queue's
teach-before-test filter. `authority.ts:1080-1083` names the distinction directly: "'This material
has been put in front of the learner' — delivery OR the claim … It is NOT the mastery claim." So
app-native lessons do real planner work. They deliver, and they unlock the channel that does supply
evidence. They simply never supply any themselves.

### Intentional, not an unfinished integration

**The verdict is intentional, and it rests on five things, one of which is decisive.**

1. **The contract says so, twice, unprompted.** `apps/learner-web/src/app-native/contract.ts:1-7`:
   these "are visual-authoring inputs. They are not production LessonDefinition records and they
   intentionally contain no React nodes, callbacks, HTML strings, planner decisions, or mastery
   claims." `authoring-helpers.ts:1-9` repeats it: "no planner/mastery claims."
2. **Every script declares itself preview.** All 14 carry `status: 'internal-preview'` and
   `schemaVersion: 'lesson-script-preview/v2'` (`contract.ts:210-213`).
3. **The decisive one: the lessons declare their own coverage gaps in data.**
   `LessonKnowledgeComponentPreview` (`contract.ts:10-15`) carries
   `previewCoverage: 'complete-review-focus' | 'boundary-map-only'`. Across the 14 lessons there are
   54 required-KC slots, of which 31 are flagged `boundary-map-only`. I checked the flag against
   actual node coverage rather than taking it at face value: those 31 are **exactly** the 31 required
   KCs that carry no question node anywhere in their lesson, with **zero** mismatches in either
   direction. An unfinished integration does not ship a per-KC field that names, precisely, which
   required KCs it deliberately does not check.
4. **The split from the real pipeline is commented as a choice.** `index.ts:56-58`: "V3-LES-130923 is
   intentionally absent: it is delivered by the server-authoritative lesson runtime instead."
5. **The one write this path ever had was removed on purpose.** `658a8c3` deleted `Lesson.tsx`'s
   `onIndependentMiss={() => recordMistake.mutate('lesson')}`, replacing a content-free tally with a
   real error log that only practice writes; its message ends "No change to BKT/mastery, the
   independence gate, Recall/FSRS, or scoring." It was never a mastery write.

**Two loose ends that cut the other way, and should be said.** `onIndependentMiss` is still a live
prop on `LessonRenderer` (`LessonRenderer.tsx:60`, fired at line 1110) with no caller anywhere in the
repository — dead code since `658a8c3`, and the reason lessons contribute nothing even to the
Mistakes tally. And `c607696` authored wave 2 "against real V3 registry ids and KCs", while
`apps/learner-web/src/app/lesson-mastery-id-parity.test.ts:16-28` pins those ids against
`getMasteryLessons`. So these lessons are genuinely wired for planning and identity, which is what
makes the non-scoring easy to misread as an oversight. Neither loose end is an interrupted evidence
integration; nothing in the tree is half-connected to the adapter. **Nothing guards this boundary
either way** — no architecture test asserts that app-native lessons write no evidence, and none
would catch a wiring attempt that skipped the metadata.

### The metadata does not exist, so authoring is the cost and transport is the rounding error

`normalizeBinding` in `packages/domain/src/lesson-response-adapter.ts` reads `item_binding_id` (535),
`activity_role` (548), `semantic_family_id` (549), the assistance-level alias group (561),
`candidate_evidence_modes` (566-567) and `reasoning_operation` (569); BKT eligibility then requires
`assistanceLevel === 'A0'` (1102), a defined `reasoningOperation` (1087, 1149) and an eligible
candidate mode. Measured across all **168** question nodes in the 14 lessons:

- **Present:** `kcIds` (168/168, from `LessonNodeBase`, `contract.ts:135-140`) and `stage` (168/168,
  `contract.ts:168-185`).
- **Absent, 0 of 168:** `activity_role`, `candidate_evidence_modes`, `reasoning_operation`,
  assistance level under all three spellings the adapter accepts, `semantic_family_id`,
  `item_binding_id`, `exact_reentry_for`, `exit_function`.

Two of the six things a binding needs are derivable rather than authored: `stage` maps cleanly onto
the role vocabulary (`exit-changed` → `CHANGED_EXIT`, `exit-near` → `NEAR_EXIT`) and the node `id`
could serve as `itemBindingId`. **The three fields BKT eligibility actually turns on — the candidate
mode, the reasoning operation, and the assistance level — are absent entirely, on every item.** So
wiring the transport is a screen-level change; supplying the evidence is an authoring programme.

**The scale, so nobody re-derives it.** The 14 lessons hold 27 sections, 168 question nodes, 23
`exit-near` and 23 `exit-changed` — one of each per section, since `buildSectionNodes`
(`section-authoring.ts:103-127`) emits exactly seven question nodes per section and one section binds
exactly one KC. Against the shape `e579779` licensed — an initial plus a re-entry `CHANGED_EXIT` per
KC — covering all 54 required KCs means on the order of 108 terminal checks, against 23
`exit-changed` nodes that exist today and **zero** authored re-entry items, plus a semantic family,
an assistance level and a reasoning operation on each. Tonight's licensing moved **6 of 115**
bindings, on one lesson, over artifacts that were already authored in the target schema. This is
one to two orders of magnitude more authoring than that, and it is content work, not engineering.

### How this meets the out-of-repo lesson gap — the two are the same problem twice

**The intersection of "lessons Today's Path schedules" and "lessons connected to the evidence
pipeline" is currently empty.** The one pipeline-connected lesson, `V3-LES-130923`, is deliberately
excluded from `APP_NATIVE_LESSONS` and reachable only at `/app/lessons/vectors-and-trigonometry`
from Curriculum (`router.tsx:41`, `Curriculum.tsx:33`), where `VectorLesson.tsx` submits every
response to the server (`useSubmitVectorLessonAction`, `SUBMIT_RESPONSE` at line 173) and so reaches
`adaptLessonResponse`. Every lesson the planner can offer is on the other side of that line.

**And two of the 14 reuse the exact ids of the two out-of-repo drafts.** App-native
`V3-LES-789208` (`scientific-notation`) and `V3-LES-844372` (`graphs-and-slopes`) carry the same
lesson ids as the two artifacts recorded above as living outside version control. They are thin
single-KC previews of the same lessons:

| Lesson          | App-native (in repo)                                     | Drafts artifact (out of repo)                            |
| --------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `V3-LES-789208` | 7 questions, 1 exit-changed, 1 of 4 required KCs covered | 40 bindings, 8 `CHANGED_EXIT`, all 4 required KCs        |
| `V3-LES-844372` | 7 questions, 1 exit-changed, 1 of 3 required KCs covered | 33 bindings, 3 `CHANGED_EXIT` + 12 `REPAIR_CONFIRMATION` |

The KC sets match: the app-native previews cover `V3-KC-981438` and `V3-KC-452593` respectively, each
the first member of the drafts artifact's own `required_kcs`. I re-counted the drafts' `activity_role`
tallies directly and they agree with the counts recorded in the earlier section (`CHANGED_EXIT` 6/8/3
across the three lessons).

**This changes the cost of wiring for those two specifically.** For 12 of the 14 lessons, connecting
them means authoring evidence metadata that has never existed. For `V3-LES-789208` and
`V3-LES-844372` it means vendoring an artifact that is already fully authored in the target schema
and pointing the scheduled lesson at it — which is the same vendoring decision already recorded
above, now with a second, larger payoff attached. Vendoring those two would take the pool of
pipeline-connected lessons from one to three, and — if the scheduled lessons were pointed at the
real artifacts rather than the previews — would be the only path that makes a scheduled lesson score
without a new authoring programme.

### Owner decision, not a task

**The current state is the one option that is clearly wrong.** Not because anything on screen lies —
"teach before testing" is accurate, and the Progress page omits rather than misstates — but because
the product schedules 14 lessons as the learner's primary daily work, and a learner can complete
every one of them, forever, and watch a mastery surface that never acquires a single row. Whatever
is chosen, the current arrangement should not survive by default.

1. **Wire the app-native lessons into the real pipeline.** Honest scale: a screen-level transport
   change plus an authoring programme on the order of 100+ new terminal checks with candidate modes,
   reasoning operations, assistance levels and semantic families, across 54 required KCs of which 31
   have no item at all today. For two of the 14 this collapses into the vendoring decision already
   on the table. Concedes: this is content headcount, not a sprint, and it re-opens the question
   `LESSON_EXIT_GUESS_G = 0.5` and the `TRANSFER`-only licensing were introduced to settle — whether
   a just-taught exit check warrants anything on its own.
2. **Keep them explicitly non-scoring, and stop presenting them as the path to mastery.** Cheap and
   truthful: the lessons already declare themselves preview in three places, so this is mostly making
   the product agree with its own contract — surface that a scheduled lesson teaches and unlocks
   practice but does not itself move mastery, and let the Progress page say why it is empty rather
   than merely being empty. Concedes: it makes the seam visible to the learner, and it admits that
   the daily plan's headline activity is, for now, delivery only.

The choice is not really between wiring and labelling; it is a decision about what a scheduled lesson
is _for_. Option 2 is the current design stated out loud — lessons teach and unlock, practice
warrants — and is coherent with §11 of `docs/lesson-evidence-mastery-contract.md` and with the
lesson-only reachability finding above. Option 1 changes what the lesson channel is. Nothing in the
code can make that call.

## Deploying the practice gate needs migration `0013` **and** a grant that does not exist yet

Operational, not a design gap: this is the sequencing note a deploy of the new server-issued practice
gate needs, and there is nothing to decide — only something to do before shipping.

**What the gate is.** `Authority.submitPracticeAttempt` will not score an adaptive-practice answer
unless the server's own record says it served that item, under that spec, at the current content
release, and the record has not expired (`packages/authority-core/src/authority.ts`, the
`consumeAttemptGrant` call at the top of that method; `PRACTICE_ATTEMPT_GRANT_TTL_MS` is 12 hours at
line 271). The store is `practice_attempt_grant`, created by
`database/migrations/0013_practice_attempt_grant.sql:20` with a primary key of
`(learner_id, question_id)` and an expiry index.

**What happens if the migration has not run.** `PostgresPracticeBankPort` probes for the table
(`services/persistence-postgres/src/practice-exposure-repository.ts:213`, recorded as
`hasAttemptGrant` at line 227) and, when it is absent, keeps grants in a per-process `Map`
(`memGrants`, line 201; the fallback branches at lines 450 and 485). Exposure and repair already
degrade the same way on a content-only dev database, so the shape is not new — but the consequence
is different in kind, and the method's own docblock says so. An in-memory grant store behind more
than one process **refuses legitimate answers**: the queue is served by one instance, the answer
arrives at another, that instance has no grant for it, and `submitPracticeAttempt` throws
`PracticeAttemptNotAuthorizedError` for a learner who did exactly what they were asked to do. It
fails closed, which is the right direction — it does not admit illegitimate answers — but on a
multi-instance deployment without the migration, adaptive practice does not work at all.

**The second condition, which is easy to miss.** The migration alone is not sufficient. The learner
API connects as `mcat_learner_api`, and that role's grants are enumerated by hand in
`services/lambdas/migration/src/runtime.ts:225-231`: `learners`, `guest_sessions`,
`learner_streams`, `api_rate_limits`, `accepted_events`, `outbox`, and the `mastery_*` /
`cars_ability` / `question_stats` group. **`practice_attempt_grant` is not in that list, and neither
are `practice_exposure`, `practice_repair`, `practice_attempt_log` or `study_attempt_log`** — I
searched for a grant on any of them across the migrations, the migration lambda and `infra/cdk`, and
there is none anywhere. Those tables are ungranted for the role that would write them, which
predates tonight; `0013` inherits the pattern rather than introducing it.

That interacts with the schema probe in a way worth stating exactly, because it decides which failure
a deploy actually gets: `information_schema.tables` only lists tables the current role holds some
privilege on, so an ungranted table reads as **absent**, `hasAttemptGrant` comes back `false`, and the
port takes the memory fallback rather than raising `permission denied`. The fail-closed path is
therefore reached by either condition failing, and the two are indistinguishable from inside the
application. So the deploy checklist is two items, not one: run `0013`, and add
`practice_attempt_grant` (with `select, insert, update`) to `dataGrantSql` — most likely alongside the
other four practice/study tables, which have the same gap for the same reason.

## The practice queue's `GET` performs a write

Also operational, and bounded — recorded because it is new I/O on a read and someone should know
before it surprises them, not because anything is known to be wrong.

`GET /v1/practice/queue/{x}` is declared `stateChanging: false`
(`services/lambdas/learner-api/src/routes.ts:318-327`). In this handler that flag carries two
consequences: a state-changing route requires an allowed `Origin`
(`services/lambdas/learner-api/src/handler.ts:443`) and a session-authenticated state-changing route
requires a valid double-submit CSRF token (same file, line 483). A `stateChanging: false` route gets
neither check. It is still session-authenticated, and the edge still rejects query strings, so the
count and focus ride in the path.

Since the practice gate landed, that route writes. `Authority.getPracticeQueue` issues one attempt
grant per item it is about to hand over (`packages/authority-core/src/authority.ts:2599-2612`),
deliberately after the queue is settled so the shortfall path cannot authorize items it discarded.
Each grant is an upsert through the bank port — a real row in Postgres when `0013` has run, a `Map`
entry otherwise.

**Why the harm is bounded, stated so the bound is checkable rather than asserted.** The write
authorizes only items the server itself chose: the payload is the queue's own selection, so a caller
cannot name an item and have it authorized, and the same route already had to build that selection to
answer at all. A repeated `GET` re-issues grants for items the learner was genuinely served, which is
the renewal the client's refetch-on-mount already depends on. And a grant is not an exposure — it
does not touch `practice_exposure.seen_count`, so it cannot make a first answer look like a repeat
(the reason that separation exists is recorded under "A practice item that was served but never
answered has no state of its own", above, and measured in
`packages/authority-core/src/practice-exposure-timing.test.ts`).

**What is left to decide, if anything.** Whether a route that writes should still be declared
non-state-changing. The flag currently means two things at once — "no CSRF" and "no `Origin`
requirement" — and it is being used as a statement about the request's intent rather than about its
effects. Nothing observed today turns on it. The reason to write it down is that the next person to
reason about CSRF coverage from the route table will read `stateChanging: false` as "this route writes
nothing," and that is no longer true.

## The diagnostic's effective seeding range is a fraction of its intended one

Measured twice tonight and never recorded as a decision. **This is a calibration question for the
owner, not a bug** — every function involved does what its own docblock says it does, and the
composition lands somewhere nobody chose.

**The intended bounds.** `packages/policies/src/mastery-seed.ts:17,19` sets `SEED_PRIOR_FLOOR = 0.05`
and `SEED_PRIOR_CAP = 0.4`, and the module docblock states the design: seeding is asymmetric and
capped, so a weak read may lower a prior a long way while a strong read may raise it only a little.
`Authority.applyMasterySeed` re-applies both bounds on ingress, which is what makes "a diagnostic read
moves where you start, never whether you have mastered something" hold whatever arrives over the wire.

**The effective range, through the production axis and the production functions.** Driving
`seedsFromBucketReads` over `kcsByFc(orderedKcsForLesson)` for all 10 real Foundational Concepts, at
`certainty: 1` and the extreme reads (`gap: 1` weakest, `gap: 0` strongest):

| Concept | KCs | attenuated certainty | weakest reachable | strongest reachable |
| ------- | --- | -------------------- | ----------------- | ------------------- |
| FC10    | 7   | 0.37796              | 0.14331           | 0.27559             |
| FC9     | 20  | 0.22361              | 0.16646           | 0.24472             |
| FC8     | 22  | 0.21320              | 0.16802           | 0.24264             |
| FC2     | 23  | 0.20851              | 0.16872           | 0.24170             |
| FC6     | 27  | 0.19245              | 0.17113           | 0.23849             |
| FC7     | 32  | 0.17678              | 0.17348           | 0.23536             |
| FC3     | 38  | 0.16222              | 0.17567           | 0.23244             |
| FC5     | 57  | 0.13245              | 0.18013           | 0.22649             |
| FC1     | 58  | 0.13131              | 0.18030           | 0.22626             |
| FC4     | 79  | 0.11251              | 0.18312           | 0.22250             |

So the **effective reachable range is 0.14331 to 0.27559**, against intended bounds of 0.05 and 0.4.
The caps hold and are never approached from either side — nothing can reach the floor, and nothing can
reach the cap. The reachable span is `0.13229` against an intended `0.35`, which is **38% of the
intended span at maximum certainty**. At the real median per-bucket certainty of `0.80` (from
`diagnostic-bayes.ts`'s own calibration over 3,200 simulated reads at the production 140-item /
10-concept shape) the reachable range narrows to `0.15464`–`0.26047`, or **30%**. An earlier summary
described this as "about a quarter of its intended span"; the direction is right and the figure is
low — a quarter is roughly what a _median_ concept spans (FC7 reaches 0.17348–0.23536, 18%), not what
the corpus reaches end to end. The three numbers are different measurements, and the one to quote
depends on whether the question is "how far can any read move any unit" (38%) or "how far does a
typical read move a typical unit" (18%).

**The binding constraint is the attenuation, and it is nowhere near the caps.**
`attenuateCertainty` (`mastery-seed.ts:115-116`) divides certainty by `sqrt(units)`, and
`seedsFromBucketReads` passes it the number of **KCs** beneath the concept (line 136). Every real
concept has between 7 and 79 KCs, so the divisor is between 2.65 and 8.89 before any read is even
considered — which is why the table above is almost entirely a function of the KC count rather than of
the learner's answers. The 79-KC concept **cannot exceed `0.2225` from a perfect read**: a learner who
answers every item in FC4 correctly starts only `0.0225` above the `0.2` default. The attenuation is a
deliberate and documented modelling choice — its own comment says it is "a modelling choice, not a
measured quantity", chosen in the conservative direction — so the finding is not that it is wrong; it
is that nobody has looked at what it composes to.

**The decision, and the one option that is not on the table.** If the intended operational range
really is `0.05`–`0.4`, then either the attenuation exponent or the gap-to-prior mapping
(`seedPriorFromRead`, `mastery-seed.ts:37-50`) has to change — the choice is between crediting a
bucket read more per unit, or making the same attenuated certainty travel further. What must **not**
change is the ingress caps in `Authority.applyMasterySeed`: they are the last line of defence against
a rigged seed, they are what makes the "a seed can never mint mastery" guarantee independent of the
producer, and widening them to make the range look right would trade a calibration mismatch for a
security property. Equally defensible is leaving all of it alone and correcting the stated intent to
match: a seed that moves a prior by at most `±0.08` is a weak opening guess, which is arguably what an
opening guess should be, and the first few real attempts overwhelm it either way.

Cross-reference: the open Gate 1 item about diagnostic attenuation weakening the asymmetry is the same
mechanism seen from a different angle — that entry asks whether `sqrt(KC count)` was the right change
from `sqrt(lesson count)`, and this one asks what either choice composes to against the declared
bounds. They should be decided together. Also note `packages/policies/src/mastery-seed-value.ts` still
runs the `sqrt(lesson count)` model, so any number it reports about seeding strength describes a
seeder that no longer ships.

## "Needs the most review" ranks on `P(L)` alone, so a perfected-but-unwarranted lesson is invisible to it

A decision about what that list is for. It belongs with the planner-weighting work, because it is the
same question one surface over: what a mastery number is allowed to decide on its own.

`PracticeHome`'s trio (`apps/learner-web/src/screens/practice/PracticeHome.tsx:86-100`) takes the full
atlas catalog, overlays real `P(L)` where the learner has an entry and the `0.2` prior everywhere
else, drops locked and `mastered` lessons (line 97), and then sorts **purely by `pL`**, with curriculum
order as the tie-break (line 98), taking the first three.

The gap is at the top of the ordering rather than in the filter. A learner who has answered every
question in a lesson correctly through the lesson channel alone carries `pL` at or near `1` with
`mastered: false`, because the claim needs both halves and the warrant half is unreachable from that
channel (recorded above under "Lesson-only mastery is unreachable, and the suspected cause is not the
real one"). The `!mastered` filter therefore keeps that lesson eligible — and the `pL` sort buries it
at the very bottom, so it can never be in the first three. The one lesson whose mastery claim is being
withheld for a reason the learner could act on is the one this list is structurally least likely to
show them.

`2315095` fixed the adjacent half of this: the Evidence Atlas now states why a lesson is stuck rather
than reading "In progress" forever, and its docblock
(`apps/learner-web/src/components/EvidenceAtlas.tsx:93-103`) names this ranking as the other place the
same learner disappears from. So the "what next" surfaces are no longer silent — but the ranking still
sorts on the capability estimate alone.

**Why it is a decision and not a fix.** "Needs the most review" could reasonably mean any of three
things, and they disagree exactly on this learner:

1. **Lowest capability estimate**, which is what it does today. Coherent, and honest about its own
   copy ("the lessons your mastery is lowest on"). Concedes that a learner one warrant away from a
   mastered lesson gets no prompt from this surface.
2. **Furthest from the mastery claim**, which would rank on both halves — capability distance and
   warrant sufficiency together — and would put a `pL: 1`, warrant-empty lesson near the top rather
   than the bottom. Concedes that "review" then means two different kinds of work under one heading:
   learn this material, versus demonstrate it independently.
3. **Lowest capability, plus a separate list for withheld claims.** Keeps this list meaning one thing
   and gives the other case its own surface and its own verb. Concedes screen space and a second
   concept for the learner to hold.

Nothing in the code can choose between them, because the choice is about what the learner is being
asked to do next. It is filed here rather than as a task because option 2 in particular is a planner
weighting decision wearing a UI hat: the same `pL`-versus-warrant question the planner's
`masteryWeight` faces, arriving on the surface a learner actually reads.
