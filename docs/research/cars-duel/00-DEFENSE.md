# CARS Duel: what it defends, what it does not, and the one change that decides it

Inputs: `01-what-cars-duel-does.md` (mechanics, from code) and `02-why-cars-is-hard.md`
(evidence). Evidence tiers inline: **A** strong or field consensus, **B** reasonable with
stated limits, **C** weak or single-source. Own arithmetic marked *[own calculation]*.

---

## Verdict in one paragraph

CARS Duel picks a **well-chosen mechanism** and points it at the **wrong stimulus**. Forcing a
learner to commit to a position in their own words, then defend it against attack, is close to
what the comprehension literature says actually moves performance — generative commitment
before evaluation, with feedback. But the Duel does this about a *topic* rather than about a
*passage*, and that single substitution moves it from the best-supported activity in the space
to the weakest. The one direct test of whether argument production transfers to argument
evaluation found no detectable effect (**A**, Kuhn 2009). Writing *about a text* carries an
effect size of 0.40 (**A**). **Give the duel a passage and it becomes defensible; leave it as a
topic debate and it is a well-built engagement feature with no evidenced path to a CARS score.**

Separately and independently: the Duel already computes the single most defensible signal in
this entire product and throws it away at the UI layer. That is the cheapest high-value fix in
the feature.

---

## What CARS actually is, and what students get wrong about it

Three findings frame everything below.

**1. Students cannot diagnose their own comprehension. This is the load-bearing fact.**
Metacomprehension accuracy — the correlation between a reader's predicted and actual
comprehension — is **MC = .178, 95% CI [.155, .200]** across 502 effects, 115 studies, 15,889
participants (**A**, Yang et al. 2022, *Review of Educational Research*). The authors'
translation is the one to use out loud: a reader correctly discriminates a well-understood
passage from a poorly-understood one **54.5% of the time, against a 50% coin flip**.

Two things make this stronger than it looks. Maki's correlations never exceeded +.32 on *any*
criterion format, including four-alternative multiple choice — so it isn't an artifact of
recall testing, and it holds in skilled readers. And the modern .178 figure deliberately
excludes intervention conditions, which is why it sits below the canonical .27.

This is the one CARS cause a student **structurally cannot self-diagnose**, which makes it the
only place a product can offer something the learner cannot get by trying harder.

**2. "I'm too slow" is the wrong diagnosis, and it's the most common one.** Rayner et al.
(2016) is unambiguous: 200–400 wpm is normal for educated adults, the speed–accuracy trade-off
is real, and there is little evidence for any high-speed high-comprehension mode (**A**).
Worse, rereading is how readers *repair* comprehension, and speed training removes exactly
that.

The real constraint is the **standard of coherence** a reader sets before they start — the
comprehension goal that determines what gets encoded. An eye-tracking study of 60
undergraduates found readers without a comprehension goal spent *less* time on the passage and
*more* time re-reading and dwelling on irrelevant text: a "search for the answer" mode (**B**).
Slowness is an output of shallow encoding, not its cause. Students optimise the symptom.

**3. "CARS can't be prepped" is an empirical vacuum, not a finding.** There is **no
peer-reviewed CARS intervention study at all**. The adjacent evidence is mixed rather than
discouraging: SAT-verbal coaching moves +6–8 points against +13–18 for math, and Briggs found
ACT *Reading* negative — but Montgomery & Lilly's experimental synthesis found verbal +23.5,
and GRE **analytical** items moved **+66 points** with strong dose-response and were removed
from the test for being too coachable (**A**). The moderator is **item type, not
verbal-versus-content**. Nobody has established that CARS is resistant; nobody has established
that it isn't.

That is genuinely good news for a pitch: the folklore everyone repeats is unevidenced in both
directions, and the one comparison that mattered turned on how the items were built.

---

## What CARS Duel actually does

From the code audit, stated plainly because the name misleads:

- **No passage. No answer choices.** A four-round text debate against an AI, on a topic.
- Two modes — defend a thesis under attack, or rebut the AI's opening position. Three
  intensities.
- **Untimed.** Real CARS is ~100 seconds per question under heavy pressure. Today's Path
  budgets 12 minutes per duel.
- **Topic is effectively fixed.** Three strings exist in `SUGGESTED_TOPICS`; the read-only UI
  surfaces the first, so repeat sessions rehearse one debate.
- **Feedback** is a prose reflection: strongest point, counter left unanswered, a CARS transfer
  tip.
- **A hidden rubric** grades Position / Argument / Application 0–3, nudges the FOC / RWT / RBT
  abilities at K = 0.08, and feeds the CARS Readiness gauge on Progress. The learner never sees
  the scores.
- Copy is honest about scope: *"No winner or loser, and it never counts toward mastery."*

---

## The defense, honestly scored

### What genuinely holds up

**The generative mechanism is well chosen (B).** Generative practice with feedback beats
selection practice *even when the criterion is selection*. So production is not inherently the
wrong shape for a selection test — which is the objection you'd expect, and it doesn't land.

**Committing in your own words before seeing options attacks a real failure mode (B).** A CARS
item can be answered by eliminating three options without ever building a model of the author's
argument. Elimination is a legitimate test-taking skill and a comprehension dead end: it lets
a learner score without encoding, and it means practice can produce no improvement in the
underlying skill. Forcing an articulated commitment removes that escape hatch. This is the
strongest conceptual argument for the Duel and it survives.

**It cannot be gamed, and it produces a work sample.** Unlike a multiple-choice attempt, a
debate turn is a record of the learner's actual reasoning — which is what makes external
calibration possible at all.

**Argument production is trainable, and quickly.** Kuhn's intervention moved production
substantially. If the goal were argumentative writing, this feature would be well designed.

### What does not hold up

**Transfer to CARS scoring is unevidenced, and the one direct test was null (A).** Kuhn (2009)
is the only study that tested production-to-evaluation transfer directly: a year of dense
argument-production practice moved production a lot and evaluation from 5.66 to 6.17 out of 9,
*p* = .10. Not detected. That is the single most relevant result to this feature, and it is
negative.

**The stimulus substitution is the whole problem.** Writing *about a text* carries ES 0.40
(**A**); debating a topic with no text has no comparable support. Response congruency is the
top moderator of transfer in Pan & Rickard (2018) — with neither moderator present, the
publication-bias-corrected transfer intercept is **d = 0.015**, i.e. nothing. A topic debate
shares the construct with CARS and shares almost none of the task.

**One topic is not a curriculum.** Repeat sessions rehearse a single debate, so whatever
transfer exists cannot generalise.

**Untimed practice omits the constraint students actually fail under.** Not necessarily
wrong early — but it should be a deliberate progression, not an absence.

**Immediate reflection wastes the free active ingredient.** Immediate summarising is worth
nothing (+0.030, ns); *delayed* summarising is the largest single effect in that literature
(+0.210) (**A**). The Duel reflects immediately.

---

## The three changes that decide it

Ordered by evidence-per-hour.

**1. Show the rubric. Cheapest and highest value.**
`CarsDuel.tsx:127-135` already computes Position / Argument / Application 0–3, already sends it
to the ability model, and never renders it. Meanwhile external calibration is the single most
defensible mechanism gap in the whole market — no competitor collects a confidence judgment or
reports calibration error. Add a one-line prediction before the reflection ("how well do you
think you argued that?"), then show predicted against measured. At MC = .178, the learner's own
estimate is barely better than a coin flip, so the gap you display is real information they
cannot obtain alone. This converts the feature's weakest claim into its strongest.

There is also a correctness reason: a learner's CARS Readiness currently moves on an LLM rubric
they cannot see or contest.

**2. Give the duel a passage.** Attach the debate to a passage and make the opening move a
commitment about *the author's* argument — what the author is claiming, and what the weakest
link is — before any options appear. This is exactly what the evidence recommends: generated
commitment about the author's argument, before answers are visible. It converts the feature
from topic debate (unevidenced, one null direct test) to writing about a text (ES 0.40), and
gives it the response congruency the transfer literature requires. `packages/cars-generation`
already produces passage sets and currently reaches only `/cars-preview`.

**3. Make the reflection delayed, and name the failure modes.** Move the reflection off the end
of the session, and have feedback name the author's actual move plus each distractor's specific
failure mode rather than scoring the learner's prose. Delay is free and it is the largest
single effect available here.

---

## How to talk about it tomorrow

**Do not call it CARS practice.** It shares a name with a section it does not currently
resemble, and an audience expecting passages will notice within ten seconds.

**Do lead with the diagnosis, which is genuinely strong.** Students believe their CARS problem
is reading speed. The evidence says speed training doesn't work and removes the rereading that
repairs comprehension. The real cause is that readers set the wrong comprehension goal and
cannot tell they've misunderstood — 54.5% accuracy against a 50% baseline. That is a problem no
amount of effort or question volume fixes, because the learner has no signal.

**Then position the Duel as what it is:** an attempt to attack the elimination escape hatch by
making the learner commit in their own words, with the passage version as the next step and the
calibration read as the thing nobody else does.

**If pushed on evidence, concede cleanly.** The one direct test of production-to-evaluation
transfer was null. We know. That's why the passage is the next change rather than more debate
topics.

One more piece of ammunition worth having: there is no peer-reviewed CARS intervention study in
existence. Anyone claiming their CARS method is proven is claiming something nobody has
measured.
