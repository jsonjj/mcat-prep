# Mistakes BrainLift

## Owners

Mohamed Shawgi

## Purpose

What should an MCAT speedrun app do with a learner's wrong answers? We log every miss and show it
back on a mistakes page. This settles what has to happen around that record before it moves a score,
and how much is already in the code. Almost nobody has tested what we are building, so these
decisions need evidence rather than imitation.

## In Scope

- The moment of the error: whether we reveal the correct answer, what the explanation says, and
  whether we ask the learner for anything first
- What the mistakes page is for once an error is a week old: which errors return, at what grain,
  and what the learner produces
- How a correction gets verified: what the follow-up question looks like and how close it sits to
  the misconception

## Out of Scope

- Item and distractor authoring quality. This assumes the explanations are good
- Flashcards and the daily planner. FSRS governs a separate surface; the planner reads the open-miss
  count and is its own document
- Whether a wall of past failures discourages people. Real, and unsettled here

---

# Knowledge Tree (DOK 1s and 2s)

Seven entries with provenance markers. `[read]` means the full text was retrieved and the numbers
checked, `[measured]` is read out of this repository, `[inferred]` is a consequence of that code no
test pins. Measured at `e44dc75`, re-verified against `4a1c84e` on 2026-08-01; 2.2 and 2.3 changed
and carry dated notes.

---

## 1. The literature

### Mertens, Finn & Lindner (2022)

*1.1 · `[read]` · SPOV 2* <https://doi.org/10.1037/edu0000764>

**DOK 1**

- Against a no-feedback control, elaborated feedback g = 0.714 lower-order and 0.462 higher-order.
- Answer-until-correct trails at 0.554 and 0.412.
- For lower-order STEM the ranking flips, AUC 0.64 against EF 0.41.

**DOK 2**

Saying why the chosen answer fails and the correct one holds is the largest single move available.
Explanation plus a later retest, against explanation alone, is untested.

### Metcalfe (2017); Butler & Roediger (2008); Bisra et al. (2018)

*1.2 · `[read]` · SPOV 1* <https://files.eric.ed.gov/fulltext/ED574569.pdf>

**DOK 1**

- Huelser & Metcalfe put the error-generation benefit at 20%, and those who got it believed the
  error-free condition had won.
- An experimenter-supplied wrong answer harmed memory for the correct one against control.
- Without feedback, 75% of final-test intrusions were lures the learner had picked; feedback ran
  η²p = .49 on correct recall.
- Induced self-explanation: g = 0.552, 69 effects, 5,917 participants.

**DOK 2**

Redisplaying an old wrong answer as text sits nearer the condition that hurt memory than the one
that helped. A page that shows the error and asks nothing does the harmful half.

### Karpicke & Roediger (2008)

*1.3 · `[read]` · SPOV 1, 2* <https://web.mit.edu/jbelcher/www/learner/retrieval.pdf>

**DOK 1**

- 40 Swahili–English pairs, four conditions, learning curves identical by the end of the session.
- A week later the re-tested conditions recalled about **80%** against 36% and 33% for those dropped
  from testing, d = 4.03.
- Learners predicted about 50% in every condition, F < 1, against outcomes running 33% to 80%.

**DOK 2**

Restudy and retrieval feel the same inside the session and separate by a factor of two a week later.
Learners cannot see that gap while it opens.

### Butterfield & Metcalfe (2006); Butler, Fazio & Marsh (2011); Metcalfe & Finn (2011)

*1.4 · `[read]` · SPOV 1, 2*

**DOK 1**

- Confidence in an error predicts its correction, gamma +.13 and +.16.
- The effect holds at a week, .28 at six minutes against .19, and corrected high-confidence errors
  still return at gamma .15.
- A second attempt succeeds .46 after a confident error against .32 after an unconfident one.

**DOK 2**

Confidence is the cheapest ranking over which mistakes deserve a generation prompt; it routes
rather than teaches. One clean correction is not a repair.

---

## 2. The shipped feature

### Internal disclosure audit

*2.1 · `[measured]` · SPOV 1, 2*

**DOK 1**

- Adaptive practice reveals on every scored attempt: the key, its rationale, and the refutation of
  the chosen distractor.
- The study loop reveals on a miss and allows one unassisted retry.
- Immediate disclosure landed in `369e6cd` on 2026-07-29, reversing a one-day withhold.
- Unchanged at 2026-08-01, protected-block ordering included.

**DOK 2**

Immediate elaborated feedback on every miss is shipped. Protected blocks are the hole: the miss is
logged before the no-feedback branch runs, so it reaches the tab carrying a refutation nobody
showed.

### Internal mistakes-tab audit

*2.2 · `[measured]` · SPOV 1*

**DOK 1**

- A row shows the stem, the chosen and correct choices, and the refutation of the chosen one. The
  correct answer's rationale is hydrated on the way through and never copied onto it.
- No free-text field exists and no self-report of confidence is collected, enforced at the schema
  and the route.
- Patterns group at knowledge-component or cluster grain, asserted at 5 attempted and 3 missed.

**Verified 2026-08-01.** The last two bullets changed. Four tabs now (To fix, Patterns, Wins worth
locking in, CARS), and a miss card names the misconception behind the distractor the learner picked,
from an `error_models` map authored on ~100% of the corpus and plumbed through in this push. A
pattern row names the one they lean toward. The contract test that pinned that grain absent requires
both, forbidding only the raw map, which stays server-only. Confidence is captured as behaviour:
response time and answer changes land on every attempt, so a fast miss bands `confidently_wrong`.

**DOK 2**

Three of the four things this design needs are built. The missing one is the learner's own
explanation.

### Internal re-exposure audit

*2.3 · `[measured]` · SPOV 1, 2*

**DOK 1**

- "Try a fresh one" carries a cluster or skill token and no item id, with no guarantee of touching
  the missed KC.
- Freshness is a **14-day** exclusion window rather than a ban, so the logged item returns after two
  weeks.
- The repair queue asks for a fresh item in the missed KC, at most 30% of the science budget.
- `practice_repair.resolved_at` is written by no code. *Inferred:* past 20 missed KCs the query
  truncates alphabetically.

**Verified 2026-08-01.** Every bullet holds, so a missed KC stays a repair target for the life of
the account. The schedule changed. Today's Path reserves one guided repair slot a day, sized to
what the runner can serve rather than to the raw open count; the runner holds the learner on each
mistake for 15 seconds (25 on CARS) before handing them a fresh item they must get right. Weak CARS
duels mint their own repairs.

**DOK 2**

A same-KC retest exists and a same-misconception retest does not. Something now decides when a
correction gets verified; it verifies at the wrong grain.

---

# DOK 3: Insights

**1. Low metacomprehension makes aggregation valuable and self-logging self-defeating.**
Learners predicted about 50% recall in every condition of a study whose outcomes ran 33% to 80%,
F < 1 (1.3). A log the student keeps records a diagnosis uncorrelated with the fault. The pattern
section withholds its claim until 5 attempted and 3 missed (2.2), the judgement the learner cannot
make.

**2. Hiding our explanation at the prompt converts reading into retrieval.**
Redisplaying a learner's own error as text sits nearer the experimenter-supplied condition that
harmed memory than the generation that paid 20%, and induced self-explanation runs g = 0.552 (1.2).
With the explanation on screen the learner transcribes it; with only the two answers on screen, the
same prompt becomes retrieval. The repair runner shipped the first half and put a reading dwell
where the second belongs (2.3).

**3. The prioritisation this design needs arrived without anyone being asked a question.**
Confident errors are corrected preferentially at gamma .19 after a week, they return at gamma .15,
and a second attempt succeeds .46 against .32 (1.4), so confidence is the ranking the design wants.
Asking for it was refused on expert κ of 0.000–0.063 for self-reported error cause. It is now taken
behaviourally: a fast miss with few pre-commit changes bands `confidently_wrong` and sorts first
(2.2). Latency is not felt confidence and nothing validates it against a rating. But the objection
that killed self-report, that learners cannot judge their own errors, does not touch a clock.

---

# DOK 4: Spiky POVs

Author-generated by Mohamed Shawgi. `Status` records how each held up against the tree and the code.

---

## SPOV 1: Error logging belongs in the product, not in the student's spreadsheet

*Status: checked 2026-08-01, one premise still needs a citation. The blocker recorded here through
2026-07-31 has cleared: misconception-level aggregation is built.*

> Logging a user's specific mistakes (both to feed our system and to display in the mistakes page) is
> a vital part of the app as it can help us address the misconceptions the user falls for most.
> Question banks on the market record wrong answers but stop there and leave the processing to the
> student, which is why the standard advice is still to keep your own spreadsheet. A mistakes page
> that helps users know their own most common misconceptions, brings past mistakes back to the user
> and has them explain in their own words why the correct answer was correct and why their own answer
> was wrong, and enables users to directly practice similar questions builds error tracking into our
> app in a useful, productive way that no other product manages to do.

**What supports it**

- Students cannot do the aggregation. Their predictions of recall sat near 50% across conditions
  running 33% to 80% (1.3), so a self-kept log records the misdiagnosis. Yang et al. (2022) pooled
  502 effects at metacomprehension accuracy 0.242, roughly 56% discrimination against a coin flip.
- Explaining why the original answer was wrong is a different job from explaining why the correct
  one is right. Choosing a distractor installs it, and 75% of later intrusions were lures the
  learner picked (1.2).
- The log drives behaviour: it reserves and injects Review Mistakes sessions (2.3).

**Two caveats**

1. The market claim bites at what products do with the log rather than whether they keep one. UWorld
   and peers record incorrects and show analytics, so stated otherwise it is refutable in a sentence.
2. **Verified 2026-08-01: the misconception blocker is gone.** The labels were authored all along,
   on ~100% of the corpus; `error_models` was an unknown passthrough dropped at compile, which is
   where "populated on 0 of 2,108 items" came from. It now reaches the protected payload and the
   database, the miss card names the picked distractor's misconception, and the contract test that
   forbade that grain requires it (2.2). The labels are prose rather than IDs from a closed
   catalogue, so they read to one learner and do not yet count across many.

Three of the claim's four promises now ship. The repair runner brings the mistake back and demands a
fresh correct answer, and asks nothing in the learner's own words (2.3).

---

## SPOV 2: Reading a good explanation feels like learning and isn't

*Status: revise, 2026-08-01. The scheduling half shipped, the grain objection remains, and the
hidden-explanation clause is now contradicted by direct evidence.*

> When an error occurs, the most important part of the system isn't simply giving the user the right
> answer: rather the system needs to give the user immediate feedback on why their answer was wrong,
> and why the correct answer was right. But reading a good explanation feels like learning without
> being it, so the explanation is only setup. Having the system bring that mistake back later, with
> our own explanation hidden so the user has to put it in their own words, and then schedule a similar
> question, is what actually tests their application of the concept rather than having the system
> simply hope the user learned their mistake.

**What supports it**

- Restudy and retrieval produce identical in-session performance and separate by a factor of two a
  week later, 80% against 36% and 33%, d = 4.03, with learners blind to it (1.3).
- Corrected high-confidence errors return at gamma .15 after a week (1.4), so one clean pass is not
  a repair.
- Elaborated feedback is the largest single move at g = 0.714 and 0.462, and explanation plus a
  later retest is untested against explanation alone (1.1).

**Where it fails.** Hiding our explanation at generation time has been manipulated head to head and
lost: open book beat closed book on retention at **d = 0.45**, with closed-book explanations
measurably thinner. Larsen's medical-student study, the closest analogue run, put testing at
η² = 0.33 against self-explanation at 0.08. The generative step is worth keeping, and it should sit
beside the explanation rather than replace access to it.

**What is not contrarian here.** Elaborated feedback beating correct-answer-only feedback is settled
(1.1). The contrarian claim is that explanation quality is not the intervention and verification is.

**Where the code falls short, rechecked 2026-08-01.** A clock now sets the retest: Today's Path
reserves a daily repair slot and the runner will not clear a mistake until the learner answers a
fresh item correctly. It does not hide our explanation and ask for theirs; it enforces a reading
dwell, the transcription condition rather than the generation one. Re-exposure still runs on a
cluster or skill token with a 14-day window (2.3), so the fresh item is not aimed at the
misconception the learner fell for even though the system can now name it. The step exists and
points at the wrong target.

---

## Provenance

Literature entries are pruned from `error-log-and-open-learner-model-evidence.md` and
`post-error-feedback-evidence.md`, keeping sources with a measured figure. The feedback-timing entry
(Fyfe 2021; Kandemir 2026) was dropped on 2026-08-01: both price feedback given later, not feedback
held back, and nothing shipped holds it back. Implementation entries compress
`mistakes-brainlift-implementation.md`, which carries the recheck in full.
