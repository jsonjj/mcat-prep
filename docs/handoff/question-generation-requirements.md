# What the diagnostic and mistakes page need from question generation

**Where the bank lives, verified 2026-08-01.** Postgres, not the repo. The learner-safe row is `questions`
and the answer material is `question_protected` (`database/migrations/0006`, widened by `0008` and `0015`).
No item content is committed. The dev server falls back in three steps — Postgres, then the gitignored local
pull at `content/question-bank/.local/db-pull/`, then a 7-question synthetic fixture
(`apps/learner-web/server/practice-bank-source.ts`). Two ingest CLIs now write to whichever of the first two
is present, upserting by `question_id` so a delivery adds items and never replaces the bank
(`tools/questions-cli`, `tools/passage-cli`; JSON, JSON array or JSONL accepted).

Every count below is from the local pull dated **2026-07-24**, which the 88-commit push did not touch, with
one exception. To refresh a figure, re-pull the bank or query Postgres directly; the pull's own
`profile.json` and `analysis.json` carry the derived counts.

The exception is the FC breakdown in section 3. `packages/policies/src/data/bank-profiles.generated.ts` is
committed and carries a per-bucket DOK census, so FC10 at **4 / 32 / 4**, FC4 at 414 and 1,811 FC-scope items
are checkable from a clone. It was generated at `74b74c2` and the push did not touch it either, so it agrees
with the pull because both predate the same content freeze, not because either is live.

## Start here

1. **Label every wrong answer choice with the misconception it represents.** Already done, and the plumbing
   that dropped it is now fixed. This is no longer the top ask; see section 1 for what remains.
2. **Author real item families.** 2,108 family IDs for 2,108 items, so every family is a singleton. Three
   separate systems assume siblings exist.
3. **Add depth to the thin concepts, FC10 first.** FC10 holds **40** items against a 181-item even share, and
   one 140-item sitting can draw 24 of the 40.
4. **CARS supply, and real passage sets in the practice bank.** 160 CARS items for one of four equally
   weighted scored sections, and a median passage of 158 characters bank-wide.

Item 2 is a new field, 3 and 4 are volume. Apply 2 to new content even if the back catalogue is never
retrofitted.

---

## 1. Distractor-level misconception labels

**Verified 2026-08-01: this section's premise was wrong and the push fixed the real problem.** The labels
were always authored. `error_models` sits on ~100% of the raw corpus — 2,108 of 2,108, of which 2,088 tag the
key strictly `correct_model`, 20 use the space spelling, and one is mis-tagged
(`docs/master-build-spec.md`, Phase 0). The field was declared `z.unknown()` and dropped at compile, so it
reached neither the protected payload nor the pull, which is where "populated on 0 items" came from. WS2
carried it through: `compile.ts` splits it onto the protected payload, migration 0015 adds a nullable
`question_protected.error_models`, and `getQuestionAnswer` reads it column-agnostically through `to_jsonb` so
a database predating the migration degrades to null rather than throwing.

**Current state:** the field is plumbed end to end and the UI consumes it. A miss card names the picked
distractor's misconception and a pattern row names the one the learner leans toward
(`chosenMisconception`, `leaningMisconception`). The whole per-choice map stays server-only, and
`tests/architecture/error-models-server-only.test.ts` pins both directions: carried onto every protected
shape, absent from every learner-safe payload, and named in the runtime leak guard. The contract test that
used to forbid the UI from naming a misconception now requires it
(`tests/architecture/mistakes-ui-contract.test.ts:300-314`). Pattern grain stays KC or cluster; the
misconception is a description on a group, not a new grouping axis.

**What is left.** Two things, both smaller than the original ask. The labels are free prose rather than IDs
from a closed catalogue, so they can be shown to one learner but not counted across many. And the 2026-07-24
local pull carries no error models, because it predates the re-publish; whether the deployed database has
been re-seeded cannot be established from the repo.

**Acceptance:** a closed catalogue where each ID appears on at least 5 items. The pattern panel asserts
nothing below 5 attempted and 3 missed (`mistakes-brainlift-FINAL.md`, 2.2), so an ID used once is worth no
more than the item ID.

## 2. Real item families

**Needed:** families of 2 or more items sharing a solution path and differing on a surface feature. Distinct
stems, distinct keys, same underlying reasoning.

**Current state:** 2,108 distinct `family_id` values, 0 families with more than one item. Separately, items
share a normalised stem in 45 groups by the pull's own `analysis.json` and 47 under a stricter
normalisation, involving about 100 items either way. Re-verified 2026-08-01 against the same pull.

**Why:** three consumers assume siblings. Parameter inheritance within a family is calibration's cheapest
cold-start route, parent-clone r = 0.77–0.93 in simulation, rated the review's highest value per unit effort
and marked unavailable here (`docs/research/calibration/00-README.md`). The mastery ladder's lowest rung
requires two distinct families (`packages/policies/src/mastery-policy.ts:77`), and with singletons that gate
passes on any two items, including two halves of a duplicate-stem pair. The mistakes repair queue falls back
to KC × skill (`docs/mistakes-repair-plan.md:90-92`).

**Acceptance:** median 3 or more items per family on new content, no singletons, and no family whose members
share a normalised stem.

## 3. Depth per concept

**Current state:** 1,811 items are in FC scope, FC4 at 414 down to FC10 at 40, against an even share of 181.
FC10 is 2.2% of the addressable bank for a concept carrying a tenth of the reporting axis. A 140-item sitting
draws up to 24 of its 40 items, and at 200 items a simulated sitting drew 36 of 40
(`docs/research/diagnostic-brainlift-tree.md:383-386`, `archive/diagnostic-brainlift-tree-full.md:680`).

**Why:** Kruyen (2012) puts the floor for individual-level decisions at 40 items per dimension, implying 400
delivered across ten concepts, and Sinharay puts the threshold for a reportable subscore at 20
(`docs/research/diagnostic-brainlift-FINAL.md`, 2.3 and 2.26). The 20 already ships as a rule: no number is
displayed for a concept with fewer than about 20 items behind it. The form supplies 14 per concept, and bank
depth caps it. FC10 is the stated reason the diagnostic cannot be lengthened, and near-exhaustion rules out a
non-overlapping retest form.

**Acceptance:** every FC bucket at 181 or more, FC10 first. That totals 1,810 against today's 1,811, so the
first pass is redistribution, not net volume.

## 4. CARS supply and passage sets

**Current state:** 160 CARS items, 7.6% of the bank, against 53 of 230 scored exam items (23%) and one of four
equally weighted section scores. 92 distinct CARS passage texts, median 1 item each. Skill mix runs CARS_RWT
64, CARS_FOC 52, CARS_RBT 44 against an exam target near 30/30/40. Bank-wide, median passage length is 158
characters and only 28 passage texts are shared by more than one item.

**Why:** the exam is roughly three-quarters passage-based with 4–7 items on a shared passage of several hundred
words (`archive/diagnostic-brainlift-tree-full.md:1196`). At 158 characters ours are stem contexts, not
stimuli. `packages/cars-generation` already produces the right shape from approved blueprints and reaches only
the internal `/cars-preview` route.

**Verified 2026-08-01: real passage sets now exist, in the wrong store.** Passage of the Day ships a vetted
pool of **12** CARS passages carrying **63** questions, about 5 per passage, on bodies of roughly 1,380
characters (~230 words) — a genuine set with a stable passage ID and per-choice misconceptions, which is
most of what this section asks for. It lives in its own tables (`passages`, `passage_questions`, migration
0019) with its own ingest CLI, is formative, writes no mastery, and is not readable by the practice bank, the
diagnostic or the practice-test assembler. The bodies are also about half the target length.

This matters more since the practice-test assembler shipped. Its blueprint floors 40 `passage_mcq` items at
the long tier, and every pulled row satisfies that floor because the pull has no format column and the
presence of any passage string is the only signal (`practice-test-assembler.ts:136-140`). A 158-character
stem context counts as a passage there. The floor is met on paper and unmet in substance.

**Acceptance:** CARS near 23% of the bank, delivered as sets of 4 or more items on a shared 500–600 word
passage carrying a stable passage ID, skill mix moved toward 30/30/40, and reachable from the practice bank
rather than only from the daily-passage store.

## 5. Foundational concept on the item

KC grain is fine, fully populated across 422 concepts at a median of 5 items each. The FC layer is the gap. No
item carries an FC; it is derived at runtime from `lesson_id`, 16 of 114 lessons carry no FC tag, and the 297
items on those lessons are invisible to the diagnostic
(`docs/research/repo-state/C-content-and-item-bank.md`). A lesson retag therefore moves items between
reporting buckets silently, and 14% of the bank sits outside the instrument for a labelling reason.

**Acceptance:** every item carries at least one FC, first-listed treated as primary.

## 6. Difficulty spread inside each concept

**Needed:** items at each DOK level within every concept, not only bank-wide. DOK 1/2/3 counts are
442/1,333/333 and DOK 4 is 0. Per concept it is worse: FC10 is 4 easy, 32 medium, 4 hard
(`packages/policies/src/data/bank-profiles.generated.ts`).

The shipped panel is 7 stages × 20 items × 3 modules, where modules at a stage differ in difficulty and never
in content (`packages/policies/src/diagnostic-mst.ts:214-224`). Each module fills its concept slots at a
target difficulty, so FC10's hardest and easiest modules both draw from pools of 4, and assembly throws rather
than degrades when a bucket runs dry. Skill and DOK are also almost perfectly confounded, SIRS1 at 100% DOK 1
and SIRS3 at 88% DOK 3, which makes "weak at SIRS3" and "weak at hard items" the same statement
(`archive/diagnostic-brainlift-tree-full.md:1469-1471`).

**Acceptance:** at least 8 items per (concept, DOK) cell, matching the design's `minItemsPerBucket: 8`, and no
skill code above 70% on a single DOK level.

## 7. Re-exposure grain

**Needed:** at least 2 items for every (KC, misconception) pair, ideally in different families, so a missed
item always has a fresh counterpart aimed at the same error.

The design schedules a similar question later as the step that verifies a correction
(`mistakes-brainlift-FINAL.md`, SPOV 2), and as of 2026-08-01 that step is built: Today's Path reserves a
guided repair slot and the runner requires a fresh correct answer before a mistake clears. The grain did not
move with it. Re-exposure still runs at cluster or skill grain with no item ID, and freshness is a 14-day
exclusion window rather than a ban, so the missed item itself returns after two weeks
(`docs/research/mistakes-brainlift-implementation.md`, §5). A verification step aimed at the wrong grain is
the strongest argument in this document for the pairs below.

## 8. Calibration

**Needed:** nothing yet, and no calibration claim. Send DOK, KC, FC and family as authored labels and let the
response log do the rest. No item carries an empirical difficulty; the engine cold-starts from DOK
(`packages/policies/src/irt.ts`, unchanged by the push) and switches to an empirical estimate at
`MIN_ATTEMPTS_FOR_B = 20`.

**Verified 2026-08-01: `packages/policies/src/calibration.ts` is not this.** It is a behavioural classifier
that bands one scored attempt as `confidently_wrong`, `shaky_win` or `normal` from response time, pre-commit
answer changes and the KC's current P(L). It touches no item parameter. The one genuinely empirical item
statistic the push added is the population median response time per item, computed from the new `elapsed_ms`
column and trusted only at 20 or more samples — a timing statistic, not a difficulty one.

Verified classifications are not calibration, a conflation that already cost one planning detour. DOK explains
1–5% of difficulty variance, and the floor is roughly 100 responses per item to rank-order at all, 250 for
Rasch `b` within ±0.5 logits (`docs/research/calibration/00-README.md`).

**Acceptance:** no item ships with a difficulty value it did not earn from responses.

## 9. One mechanical check

The correct answer is the longest choice on 50.7% of items against a 25% chance baseline
(`db-pull/analysis.json`); counting only items where it is the unique longest, 44.5%. Either figure is a cue
a test-wise learner can exploit and it distorts any difficulty estimate built on these responses. Get it near
25%. Re-derived 2026-08-01 from the same pull.

---

## Unverified, needs confirmation from the author

- **Who owns the misconception catalogue.** The labels exist as prose on every item; a closed ID set does
  not, and no doc assigns its authorship, so what is left of section 1 may be curriculum work rather than
  generator work.
- **Whether the deployed bank has been re-seeded** since `error_models` was plumbed. The local pull predates
  the re-publish and the repo holds no bank content, so this is answerable only against the database.
- **Whether the back catalogue gets retrofitted.** Everything here applies to new content, and no decision on
  relabelling the 2,108 existing items is recorded.
- **DOK 4.** No doc requests DOK 4 items. The audit only notes their absence leaves the DOK 3 to 4 step
  unevidenced.
- **Whether generated CARS output is cleared for the bank.** The pipeline is deliberately kept off learner
  surfaces, and whether that is a quality gate or an integration gap is not recorded.
