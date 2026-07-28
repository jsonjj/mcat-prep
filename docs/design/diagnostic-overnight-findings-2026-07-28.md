# Diagnostic: overnight findings, 28 July 2026

A record of two investigations run at the end of the 27 July session, written for
whoever picks this up next. Nothing here is a decision. Two of the findings
invalidate claims that appear elsewhere in the design documents, and both need a
product call before anything is acted on.

Everything below is simulation under a generative learner model. No real learner
has been measured, at any point, by anything described in this document.

---

## 1. Confidence bands were calibrated against the wrong population

**Status: fixed in code.**

The results chart turns each per-concept `certainty` value into a worded band —
"Settled read" / "Mostly settled" / "Borderline read" — and into an uncertainty
whisker. The cut points had been set to the 3rd and 7th deciles of a `certainty`
distribution measured at 0.45–0.99 with median 0.80.

That distribution came from a different generating population than the one
production serves. Re-measured on the served form (`MST_140_RECOMMENDED`, seven
20-item blocks with contention allocation, `fc-10`) across the 24-world
assumption grid at 1,000 learners a world — 240,000 concept reads — `certainty`
runs 0.375–0.999 with median **0.882**.

The old cuts of 0.719 / 0.89 therefore sorted the real cohort **13.2 / 38.7 /
48.1**. Nearly half of all reads landed in the top band. This is a milder form of
the saturation defect the recalibration existed to remove: an earlier version of
`certainty` pinned at exactly 1.000 for 68–76% of reads, and the replacement was
correct but its band boundaries were fitted to the wrong sample.

The cuts are now `MOSTLY_SETTLED_CERTAINTY = 0.7914` and `SETTLED_CERTAINTY =
0.9527`, carried at full measured precision so that each constant *is* its
quantile rather than a rounded approximation of one. Occupancy is 30.0 / 40.0 /
30.0.

Three bands were re-justified rather than assumed. Whisker width at the lower cut
is 20.9% of the track against 4.7% at the upper cut — a 4.41× ratio, where the
original three-band argument rested on 2.55×. The middle band is more visually
distinct than when it was first defended.

Two things worth knowing:

- `apps/learner-web/server/certainty-bands.test.ts` now measures a 9,600-read
  slice on every run and asserts occupancy within 1.5 points of 30/40/30. It
  reads the chart's exported `certaintyBand` rather than a copy of the constants,
  so the guard and the shipped values cannot drift apart. Reverting the cut
  points fails three tests, so the guard is not vacuous.
- The provenance — design, axis, read count, world count, seed, and how to
  re-run — is recorded above the constants. Its absence is why the original
  drift went unnoticed, and the cuts will need re-deriving if the form length,
  concept count, or delivery design changes.

The distribution's *deciles* are stable to under 0.005 between 60,000 and 240,000
reads. Its extremes are not: min and max keep sliding outward with depth, which
is why the bands are pinned to quantiles and not to endpoints. Only 72 of 240,000
reads fall below 0.45.

---

## 2. The BKT seed write is very close to a no-op

**Status: investigated, no behaviour changed. Needs a product decision.**

The diagnostic writes BKT lesson priors on completion, verified live at 98 priors
in a real session. Feeding the mastery system has been one of the diagnostic's
main justifications. It does not currently do measurable work.

The measurement couples both halves of the system rather than modelling them
separately: 250 learners sit the served form, their reads pass through the real
`lessonSeedsFromDiagnostic`, and each of the resulting 24,500 lesson seeds then
practises against the *same* response stream under both the flat 0.20 default and
the seeded prior. Sharing the stream means any difference is attributable to the
prior rather than to sampling.

| | flat 0.20 | seeded |
|---|---|---|
| median items to decision | 5 | 5 |
| mean | 6.42 | 6.42 |
| decision fires | 96.7% | 96.7% |
| items saved | — | **0.000** |
| false mastery | 3.1% | **3.1%** |

The seeded prior changed the decision for **7 of 24,500 pairs (0.029%)**, each by
exactly one item, and every one of them *slower*. Nothing anywhere in the cohort
got faster.

### Why: the cap sits inside a dead band

The cause is not the read and not any of the parameters usually blamed. One
correct answer is worth roughly 1.35–1.38 nats of log-odds, which is a very large
step, and two boundaries follow from it:

- any prior above ~0.12–0.13 reaches the 0.95 threshold in **three** items
- any prior above ~0.452–0.465 reaches it in **two**

`SEED_PRIOR_CAP` is **0.40**. It sits below the two-item boundary and above the
three-item boundary, so every prior the formula is permitted to emit lands in the
same three-item bucket. Upward seeding is not weak — it is unreachable. No value
the formula could return, for any learner, saves an item.

The decisive test is an oracle prior given perfect knowledge of the learner's
true mastery state and held inside the shipped floor and cap. It saves zero items
and finishes **0.07 items behind** the flat default, because pushing genuinely
unmastered learners to the 0.05 floor costs a fourth item while pushing mastered
learners to the cap buys nothing. Released from the bounds, the same oracle saves
0.95 items. The loss is entirely in the bounds.

Three factors compound it:

1. The realised seed band is only ~1.00 item of evidence wide against a
   floor-to-cap span of 1.85, because `attenuateCertainty` divides by the square
   root of the units in a bucket and the served form's buckets are large. Seeding
   never approaches its own cap.
2. `P(L)` under consecutive correct answers steps 0.572 → 0.865 → 0.968, so every
   threshold between 0.865 and 0.968 yields the identical three-item answer. The
   0.95 threshold is not finely tuned; it sits mid-dead-band.
3. The learning nudge *compresses* rather than washes out. Setting `learnRate` to
   zero widens the floor/default/cap spread from 4/3/3 to 5/4/3 — the nudge pulls
   every prior toward the same count.

A miss is worth 2.3–3.5× a correct answer, so the first wrong answer retains
under 5% of the seeding band. The seed does not survive contact with one miss.

### The read itself is fine

Worth separating: the diagnostic read is genuinely informative. The seeded prior
separates truly-mastered from truly-unmastered lessons at AUC 0.76–0.92. The
signal exists; the mechanism cannot spend it.

### What would change it

| option | items saved | false mastery | pairs moved |
|---|---|---|---|
| as shipped | 0.000 | 3.1% → 3.1% | 0.03% |
| raise cap to 0.6 | −0.00 | 3.1% → 3.1% | 0.0% |
| remove sqrt dilution (bucket grain) | −0.07 | 3.1% → 2.8% | 5.2% |
| seed the learn rate instead of the prior | −0.10 | 3.1% → 2.8% | 8.2% |
| threshold 0.90, seeded | +0.00 | 3.1% → 3.1% | 0.2% |
| threshold 0.86, flat | +0.58 | 3.1% → 5.8% | 39.8% |
| threshold 0.86, seeded | +0.32 | 3.1% → 4.0% | 25.6% |
| oracle inside shipped bounds | −0.07 | 3.1% → 2.6% | 3.8% |
| oracle unbounded | +0.95 | 3.1% → 2.6% | 36.1% |

Raising the cap alone buys nothing, because the dilution means the formula never
reaches even the current cap. Every option that strengthens seeding under the
present threshold buys accuracy and *pays* items — a defensible trade, but the
opposite of the one the seed is justified by.

The threshold is the only real lever, and it is coarser than it looks: 0.95 → 0.90
buys literally nothing, both being in the same dead band. The first threshold that
saves an item is **0.86**, and there the seed finally earns something — it turns a
flat trade of 0.58 items for 2.7 points of false mastery into 0.32 items for 0.9
points, a materially better exchange rate. That is the one configuration where
the seed write pays for itself, and it requires moving the mastery threshold,
which is a product decision and deliberately out of scope.

### Recommendation as recorded

Keep the write, but re-describe it. It does not accelerate mastery and should not
be claimed to. It is worth retaining because the read is informative, the planner
can order work by it whether or not BKT acts on it, the error direction is
fail-closed, and the cost is one batch write. It is a **planning input, not an
accelerator**, and the diagnostic's case should rest on its other outputs.

---

## 3. Claims elsewhere that these findings invalidate

- **"A perfect prior saves ~0.5 items per KC"** — refuted. Inside the shipped
  floor and cap a perfect prior *costs* 0.07 items. The 0.5 figure is only
  reachable by a prior allowed outside the bounds the product enforces, making it
  a statement about BKT in the abstract rather than about this system.
- **"A diagnostic-informed prior saves ~0.43 items while raising false mastery
  from 2.0% to 3.1%"** — refuted on both axes; both deltas are zero. The aside in
  `error-handling-design.md` argued the `certainty` redefinition did not weaken
  this case because the oracle row does not read the diagnostic's channel. The
  channel reasoning is correct, but the oracle row itself was wrong, so the
  conclusion it protected does not survive. The aside has been corrected.
- **"Lower the mastery threshold somewhat"** — misleading as previously stated.
  Threshold effects are not continuous; 0.95 → 0.90 buys exactly nothing. Anyone
  acting on the vaguer version would see no result and reasonably conclude the
  analysis was wrong.
- **"Asymmetric seeding, moving further down for weakness than up for strength"**
  — already shipped. More of it moves further in the accuracy-for-items
  direction, not toward items saved.

---

## 4. Loose end, not acted on

`irt.ts` maps DOK to difficulty as (−1.0, −0.3, 0.4, 1.0) while
`diagnostic-bayes.ts` uses (−1, 0, 1, 1.8) for the same construct. This affects
none of the conclusions above — correct-answer evidence varies by under 0.03 nats
across the whole range — but the two tables should agree, and if the diagnostic
values are the intended ones then cold-start slip is slightly mis-set.

---

## 5. Where the evidence lives

- `packages/policies/src/mastery-seed-value.ts` and its test hold the seeding
  analysis: always-on guards pinning the nats per answer, the two- and three-item
  boundaries, the realised band width, and the claim that no in-bounds prior can
  save an item, plus a `SEED_VALUE=1`-gated study. If anyone changes the cap,
  threshold, or BKT constants, the guards name which claim stopped being true.
- `apps/learner-web/server/certainty-bands.test.ts` holds the band measurement.
- `CERTAINTY_LEARNERS=1000` reproduces the full decile table in about 40 seconds.

Both agents left the full suite green: typecheck clean, 668 root unit tests
passing, 85 learner-web tests, 37 architecture tests.

---

## 6. Open decisions

1. **Does the seed write keep its justification, or get re-described?** The
   measurement supports "planning input, fail-closed, cheap" and does not support
   "accelerates mastery."
2. **Does the 0.95 mastery threshold move?** It is the only lever that makes
   seeding matter, 0.86 is the first value that does anything, and the cost is
   false mastery rising from 3.1% to 4.0%. This is entangled with the
   evidence-recipe mastery ladder and should not be decided on this analysis
   alone.
3. **Do the two DOK-to-difficulty tables get reconciled?**

Nothing above is blocked on further simulation. The next material fact about any
of it requires a calibrated item bank and real learners.
