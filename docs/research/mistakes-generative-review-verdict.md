# Generative Mistake Review: Is It A Good Idea?

**Verdict: good only under two conditions, one of which the current plan violates.** The evidence
backs three of the four things it does: co-presenting the learner's wrong answer with the
correction, accounting for both the key and the distractor, and spacing the re-encounter. The two
defining choices are the problem. Withholding the correct answer at generation time is the one
variable with a direct head-to-head test, and closed-book generation lost it. Leaving the writing
unevaluated is the exact condition under which "justify your own prior choice" prompts stop beating
a no-prompt control. Build it with the answer visible and an AI grader, or not at all: unscaffolded
free text on a hidden-answer prompt is beaten per minute by the spaced MC re-testing the repair
runner already ships (`mistakes-brainlift-implementation.md` §9.6).

## 1. Self-explanation: moderate, and smaller in the matching cell

Bisra et al. (2018) `[read]` pool 69 effects at **g = 0.55**, in the tree at 1.2. The applicable
cells are lower: against an *active* use of the same minutes **g = 0.30–0.35**; the "justify your
own choice" prompt type, which is this feature, **g = 0.42**; MC outcome tests 0.41. Domain and task
were non-significant, so it does hold for principle-governed material. Durability is the weak flank:
immediate effects of .28/.33/.46 fell at delay to procedural **.13** and conceptual **−.05**
(Rittle-Johnson, Loehr & Durkin 2017 `[read]`).

## 2. Generating without the answer: the crux, and the design loses it

The head-to-head exists. Hiller et al. (2020) `[read]` manipulated closed- versus open-book
self-explanation with 1-week delays: closed-book was harmful unless learners had first actively
processed the material, and at parity when they had. Sibley, Fiorella & Lachner (2022) `[read]`
found open-book better on retention at **d = 0.45**, mediated by closed-book explanations containing
fewer concepts. The pretesting literature reads as support and is not, since those designs have
near-zero prior knowledge and reveal the key immediately after. Where prior knowledge rose,
pretesting fell to **d = 0.35** against post-testing **0.74** (Latimier et al. 2019 `[abstract]`). A
learner who already had elaborated feedback on this item sits at that high end.

## 3. Refuting your own distractor is defensible; backfire is not the risk

Refutation structure carries **g = 0.41**, 0.28 after trim-and-fill (Schroeder & Kucera 2022
`[read]`). But the only study testing this contrast on MCQs found distractor-refuting feedback
beating right/wrong at **d = 0.2** while explaining the key beat it at **d = 0.4**, with no
significant difference between them (Ryan et al. 2020 `[read]`).

Backfire does not survive the evidence. Its origin is unpublished and failed direct replication, and
Swire-Thompson, DeGutis & Lazer (2020) `[read]` call it not "a robust empirical phenomenon." The
direct test inverts it: retractions explicitly repeating the misinformation cut reliance to **0.27**
against **0.39** for those avoiding it, leaving recall of the misinformation unchanged (Ecker, Hogan
& Lewandowsky 2017 `[read]`). Wahlheim & Jacoby (2013) `[read]` name the real risk: recollecting the
prior response yields **.88** recall of the new one, failing to recollect it **.42**. The danger is
showing the old answer while the learner cannot register it as superseded, which is what withholding
the key does.

## 4. Unchecked explanations: whether a grader is optional

It is not optional. The binding constraint is Rittle-Johnson & Loehr (2017) `[read]`: explaining
one's own choices "may have a neutral or negative effect on learning if those methods and choices
are likely to be incorrect," and in Siegler (1995) `[secondary]` learners who explained their own
solutions *before* accuracy feedback did not differ from those given no prompt. The enabling
conditions are that the learner is likely right or gets accuracy feedback first; this feature is a
queue of items they got wrong with the key withheld. Aleven & Koedinger (2002) `[read]` got
explanations right first try on **55%** of steps with every one graded, and judged that without that
scaffolding the rate "would have been considerably lower." Zhang & Fiorella (2024) `[abstract]`
found standard "explain your error" prompts failing to beat control, with only scaffolded prompts
working. Nothing tracks whether a self-generated wrong explanation entrenches, and that gap is real.

## 5. Response congruency: the CARS objection does not apply

That objection was stimulus substitution, a topic debate with no text (`cars-duel/00-DEFENSE.md`),
and it does not transfer: the object of explanation is the actual MCQ and its actual distractor.
Rowland (2014) `[read]` found matched formats giving *no* larger testing effect (0.46 matched vs
0.58 mismatched), and with feedback, short-answer practice beat MC practice on a final
**multiple-choice** test at **d = 0.41** (Kang, McDermott & Roediger 2007 `[read]`). The caveat: Pan
& Rickard (2018) attribute **d = 0.30 of the d = 0.58** across-format transfer to response
congruency, so writing transfers only insofar as it contains what the item will ask for.

## 6. Second-encounter value: the retrieval baseline wins

Larsen, Butler & Roediger (2013) `[read]` is the closest analogue: medical students, clinical
content, 6-month retention, testing crossed with written self-explanation. Testing **η² = 0.33**,
self-explanation **η² = 0.08**, and adding explanation to testing gave 40% against 36%, significant
at three weeks and **gone at six months**. The cheap side owns the efficiency numbers: three
relearning sessions beat one by **60% relative** at one month while deepening initial learning
bought 13% (Rawson & Dunlosky 2012 `[abstract]`). Spacing the second encounter is supported.
Weighting it is not.

## 7. Compliance: a premise needs correcting, and 2026 changed the threat

The 18.71% / 7.27% stopout figures are verbatim the published Coursera averages in Dai et al. (2025)
`[read]`, over 90 courses and 5.37M enrollments, not an app measurement. Its result runs against the
worry: reflection-question share in the first assessment predicted **lower** stopout (β = −0.025, p
= .024) while numeric fill-in predicted higher. Gurung et al. (2024) `[read]` found no differential
attrition between fill-in and MC across 6,774 students. Failure risk drives churn, not effort,
though gaming concentrates on the hardest steps and weakest learners (Baker et al. 2004 `[read]`).
The new risk is substitution: up to **90.1%** of 4,045 MOOC free-text responses resembled LLM output
(Nurmi et al. 2026 `[abstract]`).

## 8. Time economics: unfavourable, with a direct time-equated null

McEldoon, Durkin & Rittle-Johnson (2013) `[read]` measured 63 s/item for practice alone, **143
s/item** with explanation, 60 s/item for double practice. Self-explanation beat the same-practice
control (p = .041) and **failed to beat the time-matched additional-practice control** (p = .115 and
.285). Thomas et al. (2024) `[read]`, 790 lessons with LLM grading, found MCQ practice reaching
equivalent learning in **29% less time**. One written explanation costs one to two fresh items.

## 9. Selection: a real loss, and not the deciding one

Budget **d ≈ 0.9**, 10 percentage points at one month, for targeted over generic selection with
review time and activity held constant (Lindsey et al. 2014 `[read]`). But the evidence is
memory-strength targeting, not misconception targeting: the one preregistered test of
personalised-to-your-misconception against generic refutation led at 10 days and **converged by two
months** (Wang et al. 2025 `[abstract]`). Random for v1 is acceptable.

## The strongest argument against building it

Every load-bearing claim has a cheaper implementation, and the expensive parts are the ones the
evidence does not support. The mechanism is generation, which already ships through spaced MC
re-testing of the missed KC. That baseline is not weak: format did not moderate the testing effect
across 222 classroom studies, and competitive distractors already exercise "why is this right and
that one wrong." The one study crossing written explanation with testing at six months found testing
dominating; the one time-matching it against additional practice found no difference at 2.3× the
cost; the one hiding the answer found hiding worse. The design's two premises are exactly the
conditions under which "justify your own choice" prompts stop working: the choice is known wrong,
and no feedback precedes the explanation. Add an ungraded text box in 2026 and the likeliest outcome
is a slower path to the same retrieval event, with some learners entrenching a wrong explanation
nothing contradicts. The comparison is against three more spaced re-tests bought with the same
minutes.

## What would have to be true

1. **An AI grader scores the explanation and returns targeted feedback before the learner leaves the
   item.** Checkable: no free-text field ships whose contents are never read. This is the condition the plan
   violates.
2. **The key is visible while the learner writes, or revealed after one bounded attempt.** Checkable: no
   state exists where an explanation is submitted and the key is still hidden.
3. **The prompt is scaffolded, and completion requires the correct option and the discriminating fact.**
   Checkable: structured slots, option letter required.
4. **The item is scheduled for a plain MC re-test a day or more later.** Checkable: an explanation event
   writes a spaced re-test, because corrected high-confidence errors return at gamma .15.
5. **Success is measured on delayed retention, not completion or dwell.** Checkable: the A/B metric is a
   fresh same-KC item at ≥7 days (`post-error-feedback-evidence.md` §3.2).
6. **The written step is capped per day, gated off the hardest items, and never blocking.** Checkable: a
   cap and a skip path exist (`post-error-feedback-evidence.md` §5.2).

If 1 and 2 hold, this is a good feature with a plausible increment around g = 0.3–0.4 over rereading
the explanation, and the only version the literature supports. If 1 fails, the cheaper variant
dominates: keep the misconception label the push already ships
(`mistakes-brainlift-implementation.md` §9.2), replace the reading dwell with a structured
recognition prompt over authored options, and spend the saved minutes on re-tests aimed at the
missed KC.
