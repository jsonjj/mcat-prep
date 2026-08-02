# Mistakes BrainLift — SpikyPOVs (DOK 4)

**Author-generated.** Every SPOV below was derived by Mohamed Shawgi. The notes under each record what
supports the claim, which premise is load-bearing, and what the shipped implementation actually does
(per `mistakes-brainlift-implementation.md`).

Status values: `draft` (stated, not yet stress-tested), `checked` (evidence located both ways),
`revise` (a premise failed).

---

## SPOV 1 — Error logging belongs in the product, not in the student's spreadsheet

**Status:** checked (2026-08-01) — one premise still needs a citation; the feature that was not yet
built now is

> Logging a user's specific mistakes (both to feed our system and to display in the mistakes page) is
> a vital part of the app as it can help us address the misconceptions the user falls for most.
> Question banks on the market record wrong answers but stop there and leave the processing to the
> student, which is why the standard advice is still to keep your own spreadsheet. A mistakes page
> that helps users know their own most common misconceptions, brings past mistakes back to the user
> and has them explain in their own words why the correct answer was correct and why their own answer
> was wrong, and enables users to directly practice similar questions builds error tracking into our
> app in a useful, productive way that no other product manages to do.

---

## SPOV 2 — The explanation is setup; the delayed retest is the verification

**Status:** revise (2026-08-01) — the contrarian half is the verification claim, not the feedback
claim, and the scheduling half of the verification now ships at the wrong grain

> When an error occurs, the most important part of the system isn't simply giving the user the right
> answer: rather the system needs to give the user immediate feedback on why their answer was wrong,
> and why the correct answer was right. But reading a good explanation feels like learning without
> being it, so the explanation is only setup. Having the system bring that mistake back later, with
> our own explanation hidden so the user has to put it in their own words, and then schedule a similar
> question, is what actually tests their application of the concept rather than having the system
> simply hope the user learned their mistake.

**What supports it**

- Students cannot do the aggregation themselves. Metacomprehension accuracy runs at roughly 0.2, so a
  self-maintained log inherits the learner's own misdiagnosis: they record what they believe went
  wrong.
- Explaining why the original answer was wrong is not a symmetric addition to explaining why the
  correct answer is right. Choosing a distractor installs the false belief, and reading the correct
  answer afterward does not remove it. Refutational processing outperforms expository correction on
  exactly this problem.
- Self-generated elaboration is the strongest form of elaborated feedback, which in turn beats
  correct-answer-only feedback.
- Deferring the explanation to the daily plan spaces the correction, and delayed feedback often beats
  immediate feedback for long-term retention. The timing is a feature rather than a compromise.
  **Struck 2026-08-01:** this bullet does not survive its own sources. Fyfe (2021) and Kandemir
  (2026) price feedback *given later* at Δz = 0.002 and g = 0.03, and neither prices feedback *held
  back*, which is the move this SPOV proposes. The delay does no work on its own.
- The log drives behaviour rather than sitting inert. **Verified 2026-08-01, and this bullet was
  overtaken by `todays-path.ts`.** Today's Path now reserves exactly one Review Mistakes slot a day,
  not several short spacer sessions, and it sizes that slot from `mistakesRepairable` (the servable,
  prioritized, capped subset the repair runner can actually hand a fresh question for) rather than
  the raw open-miss count. Three repairable mistakes are the floor to reserve it at all; the cap runs
  ~3 items at a 2-hour budget to ~5 at 6 hours. The mid-day injector still fires on real pile-ups.
  Re-practice is still cluster or skill grain with a 14-day freshness window, so it re-exposes the
  area rather than the misconception.

**Load-bearing premises**

1. *The market leaves processing to the student.* Needs a citation. Question banks including UWorld do
   record incorrect answers and show analytics, so the claim only holds at the level of what is done
   with the log, not whether one exists. State it that way or it is refutable in one sentence.
2. *Misconception-level aggregation.* Requires distractors labelled with the misconception each one
   represents. **Verified 2026-08-01, and the earlier reading of this premise was wrong.** The note
   here previously recorded `error_models` as populated on **0 of 2,108 items** with
   `tests/architecture/mistakes-ui-contract.test.ts` forbidding the UI from naming that grain. Both
   halves have been overtaken. The labels were authored all along. The field sits on ~100% of the raw
   corpus, 2,108 of 2,108, with 20 rows using a space spelling of `correct_model` and one mis-tagged.
   It read as empty because the schema declared it `z.unknown()` and the compiler dropped it before
   anything persisted it. WS2 carried it through to `question_protected`
   (migration 0015) and the authority joins it on the picked choice, so a miss card now names the
   distractor's misconception and a pattern row names the one the learner leans toward. The contract
   test was inverted to require both fields; what it forbids now is the raw per-choice map reaching
   the UI or the learner view, which is a different prohibition. Two residual limits: the labels are
   free prose rather than IDs from a closed catalogue, so they describe one learner's error and do
   not aggregate across many, and the pattern grain is still KC or cluster with the misconception
   riding on it as a description.

**Where the shipped design disagrees**

Nothing asks the learner to categorise their own error or to write anything, and that absence is
deliberate, enforced across the wire, routes and storage. The explanation step this SPOV calls for
is therefore still a proposed change. **Verified 2026-08-01:** the confidence half of that
disagreement has closed. Hypercorrection says high-confidence errors are the most correctable, which
is the natural way to choose which mistakes get the explanation treatment, and the design now has
that ranking without asking for it. WS0 stores response time and pre-commit answer changes on every
attempt (migration 0014, nullable so "not captured" stays distinct from zero) and
`packages/policies/src/calibration.ts` bands a fast miss `confidently_wrong`, which the Mistakes list
sorts to the top. Self-reported confidence is still refused and the `confidence` field on the attempt
event remains dead. What exists is a latency proxy for a felt state, validated against nothing.

**The verification loop, added 2026-08-01.** SPOV 2's second half is no longer only proposed. A
guided repair runner brings the mistake back, holds the learner on it for 15 seconds (25 on CARS),
then hands them a fresh item in the same KC they must answer correctly before the session advances.
Weak CARS duels mint their own repair targets: `packages/policies/src/cars-duel-mistakes.ts` turns a
duel whose rubric hold-rate falls below **0.75** into a repair against the specific CARS sub-skill,
and those land in a fourth Mistakes tab. Two things the runner does not do. It never hides our
explanation to ask for the learner's own words, so the dwell it enforces is the transcription
condition rather than the generation one. And `practice_repair.resolved_at` is still written by no
code (`database/migrations/0009_practice.sql`; the repository only ever reads
`resolved_at is null`), so passing the fresh item advances the session without closing the row. A
missed KC stays a target for the life of the account.
