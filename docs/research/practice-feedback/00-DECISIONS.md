# Practice feedback: decisions

Fronts two completed literature reviews in this folder:
`01-post-error-feedback-and-retry.md` (post-error flow) and
`02-confidence-checks.md` (per-item confidence ratings). This page is the
decision record; the reviews are the evidence. Numbers and tiers here are carried
over from those files unchanged.

---

## Decisions

**1. Post-error flow — switched to immediate disclosure, implemented 2026-07-29.**
The review below concluded that *keeping* the withhold was defensible, and that
conclusion still stands on its own terms: the deferral is worth approximately zero
in either direction. What settled it was the second fix rather than the first. Once
the re-test becomes a fresh sibling on the same KC × skill (Tier B/C, validity
grounds), nothing can disclose the original item's key, so withhold-plus-sibling is
permanent silence — the one arrangement Pashler et al. rules out. The two decisions
are a package, and the package resolves toward disclosing at once. The
end-of-session lag-0 clamp went with it, which was the one evidence-mandated fix
(Tier B). The third candidate — ensuring the concept returns in a later session, the
only Tier A item on the list — was **already satisfied** by the repair-target path in
`practice-selection.ts`.

**Shipped:** immediate full disclosure on every scored attempt; no in-session
re-ask; the re-test is the cross-session repair path. **Deferred:** an in-session
sibling, which needs a KC × skill fetch endpoint the repo does not have — a session
queue holds at most one item per KC × skill by construction.

**2. Per-item confidence ratings — do not build. Confidence: medium-high.** Both
hypothesised payoffs are real phenomena, but the causal ingredient in each is the
feedback, not the measurement — and the app already delivers the feedback. Viable
only as a bounded opt-in diagnostic, never the everyday loop, never a scheduler
input.

---

## Decision 1: post-error flow

### What ships

Verified in `apps/learner-web/src/screens/practice/session-flow.ts`:
`RETRY_GAP = 3`; a first miss shows the refutation of the chosen option with the
key and correct-answer rationale redacted to `null` at the render boundary; the
item returns via `resurfaceAt(index, len) = min(index + 1 + gap, len)`;
`subAfterSecondAttempt = () => 'reveal'` discloses key, correct-answer rationale
and chosen-option refutation unconditionally on the second attempt, right or
wrong; a correct first attempt is confirmed immediately with key and rationale.

### Verdict and reasoning

**Keep it.** The real comparison is not reveal versus silence. It is:

- **Shipped:** retrieve → refutation of chosen option → ~3 items → retrieve
  again, unaided → full elaborated reveal.
- **The alternative:** retrieve → full elaborated reveal → later → retrieve a
  sibling → feedback.

Both make the learner err, both correct the error, both re-test. What differs is
the ordering of the explanation relative to the second attempt, the number of
elaborated exposures, and which item the second attempt uses.

The single strongest piece of evidence is Butler, Karpicke & Roediger (2007) —
the only study that cleanly separates feedback timing from multiple-try structure
in a multiple-choice content-learning paradigm. Deferring full feedback to the
end of a block cost nothing and numerically helped: **d = 0.28**, ns, at a
10-minute delay; **d = 0.47**, significant, at a one-day delay. The multiple-try
manipulation was a flat null (.71 vs. .71; .64 vs. .65). A ~3-item gap sits below
the shorter of their two delays, so the honest reading is that the deferral is
worth **approximately zero in either direction** — a reason not to spend
engineering effort reversing it, not a reason to celebrate it.

The load-bearing background fact, which is about content rather than timing: for
a **transfer** test — which the MCAT is, since every real exam item is novel —
bare correct-answer feedback is worth approximately nothing. Butler, Godbole &
Marsh (2013) found correct-answer feedback produced **.30** on new inference
questions versus **.28 for no feedback at all** (t < 1, null), while explanation
feedback produced **.45** (d = 0.90). The shipped design delivers the
explanation. That it arrives on attempt two is a timing question; that it arrives
at all is the thing that matters. The per-choice rationale bank is where the
entire benefit lives.

### Process note: two retracted objections

Review 01's first draft argued the opposite — that the shipped design was
contradicted by the literature. Two objections it called strongest did not
survive being checked against the shipped code, and both are retracted in the
final review:

1. **Finn & Metcalfe (2010)'s .08–.11 final retention** (with a 4–9%
   self-correction rate) describes a minimal-feedback condition in which the
   correct answer was **never supplied at all**. That is evidence about permanent
   silence, not about a three-item deferral. What the 4–9% figure still
   legitimately supplies is a bound on how much an unaided retry corrects by
   itself.
2. **The "lucky retry escapes the explanation" argument is void.** It applied to a
   *conditional* reveal, where a learner who guesses the retry right never sees
   the correct-answer explanation. `subAfterSecondAttempt = () => 'reveal'` fires
   unconditionally, which closes this completely.

The correction moved the verdict from "contradicted by the literature" to "inside
the range the literature cannot adjudicate." **This retraction is the reason to
trust the current verdict** — it is what a review looks like when it has been
checked against the code rather than against a brief.

### Ranked changes

| # | Change | Basis | Evidence strength | Mandated or preference |
|---|---|---|---|---|
| 1 | **Stop the end-of-session clamp from producing a massed retry.** When `min(index + 1 + gap, len)` cannot honour the gap, reveal fully on the first miss instead of retrying immediately. | Lag-0 retry is the single condition in this literature with direct evidence of harm: **.19** at two days vs. **.60** at lag 5, and worse than one delayed test (**.36**) — Karpicke & Roediger (2007). The clamp produces gaps of 0, 1 and 2 for misses in the final three positions. | Tier B | **Evidence mandates it.** |
| 2 | **Serve a fresh sibling item rather than the same item on retry.** | Not retention — Butler (2010) is a null on same versus rephrased questions (all t < 1). Measurement validity: Butler et al. (2013) got **.62** on repeated questions and **.30** on new questions from the identical intervention, so a same-item retry inflates any mastery signal. Plus a defect specific to this flow — refuting one option makes the retry a **3-option** item solvable by elimination. Roediger & Marsh (2005): lure production scales with lure exposure, and re-presenting the item re-exposes the endorsed distractor. | Tier B/C (Tier C on retention) | **Evidence mandates it, on validity grounds rather than learning grounds.** Already recorded internally as a known stand-in in `docs/mistakes-repair-plan.md`. |
| 3 | **Ensure the concept returns in a later session,** whatever happens within one. | Cepeda et al. (2008): optimal gap is **20–40%** of a one-week retention interval, **5–10%** at a year. Every within-session gap is far below optimum for an exam months out. | Tier A | **Evidence mandates it,** if not already handled outside the session flow. |

### Explicitly not changing

- **`RETRY_GAP = 3` versus 5.** Karpicke & Roediger tested lags of 0, 1, 5 and 9
  — never 2, 3 or 4 — on vocabulary pairs taking seconds each. Their data locate
  one boundary, between zero and non-zero, and 3 is comfortably on the right side
  of it. Preferring 5 over 3 would be manufactured precision. **Product
  preference; the evidence cannot distinguish these.** Tier B on the shape.
- **The deferral itself.** Genuinely open, sign unknown, confidence low. This is
  an A/B question, not an argument. See `## Open questions worth measuring`.

---

## Decision 2: confidence ratings

**Do not ship a per-item confidence rating. Confidence: medium-high.**

The decisive argument is not that the effects are small. It is that **the causal
ingredient in both payoffs is the feedback, not the measurement.** No study in
this literature manipulates confidence; all correlate a measured rating with
later correction.

### Payoff 1 — high-confidence errors as priority correction events

The phenomenon survives scrutiny (Tier A): within-subject gamma correlations
between confidence-in-error and later correction run **+.13 to +.28**
(Butterfield & Metcalfe 2006: γ = .13 and .16; Butler, Fazio & Marsh 2011:
γ = .28 at 6 min, d = 0.86, and γ = .19 at 1 week, d = 0.79; Metcalfe & Finn
2011 in children: γ = .22, d = 0.46). But the case for *eliciting* it fails:

- **Confidence is a proxy for something already computed.** Sitzman, Rhodes &
  Tauber (2013) found prior domain knowledge more predictive of error correction,
  with confidence contributing little unique variance once prior knowledge was
  controlled (Tier B). Per-concept mastery is exactly that signal, at zero
  learner cost.
- **The multiple-choice evidence is materially weaker than the short-answer
  evidence.** Butler et al. (2008, Exp 2), using 4-option MCQs at a 2-day delay,
  found **no hypercorrection at all** and a non-significant trend toward
  *hypo*correction (.62 of high-confidence errors corrected vs. .73 for other
  levels, p = .10). Stock et al. (1992) found no relation when feedback was
  right/wrong only (Tier B).
- **It decays.** Over a week, overall error correction fell from **.86 to .56**,
  and the higher the original confidence the more likely the original error
  returned (γ = .15, d = 0.51; Tier B).
- **The one experiment testing the exact proposed mechanism** — vary feedback
  richness by confidence × correctness — found no learning benefit and worse
  time-efficiency than uniform feedback (Mory 1994, plus a web replication;
  **Tier B null**).

### Payoff 2 — low-confidence correct answers as fragile knowledge

The better-evidenced payoff, with the cleanest numbers in the review — and
already banked. Butler, Karpicke & Roediger (2008), **Tier A**, two experiments,
N = 30 each, 4-option MCQ:

| Initial MC outcome | No feedback | With feedback |
|---|---|---|
| Incorrect (all confidence) | .03 corrected | .82 corrected (d = 6.08) |
| Correct, "guess" (lowest confidence) | **.40 retained** | **.85 retained** |
| Correct, high confidence | .79 → near ceiling | .93 (ceiling) |
| Correct, overall | .79 | .93 (d = 0.76) |

Experiment 2 (2-day delay) replicated: .78 → .93, d = 0.99; learning-condition ×
confidence interaction η²p = .18. Low-confidence correct answers were 38–40% of
all correct responses.

But the manipulation was **feedback versus no feedback, applied to all items
alike**. Confidence identified which items benefited; it did not produce the
benefit. The paper's own conclusion is to give comprehensive feedback on correct
answers as well as incorrect ones — and **the app already does this**: a correct
first attempt lands on `'reveal'` with key and rationale. Payoff already banked.

Nor are these answers near-empty: pooled across 9,106 paired MC-plus-confidence
responses, the least-confident responses were correct **34–52%** of the time
against a 20% chance baseline (Abu-Ghazalah, Dubins & Poon 2023; Tier B) —
partial knowledge, not blindness. And feedback *reduces* confidence's predictive
value for scheduling anyway: γ fell **.70 → .40** in Exp 1 (d = 0.75) and
**.57 → .38** in Exp 2.

### Cost ledger

- **Base rates.** ~**1.7** high-confidence errors and ~**1.3** low-confidence
  corrects per 20-item session. Twenty prompts to relabel ~3 items that already
  receive full explanation feedback.
- **Learner time.** ~2–3 s/item → 40–60 s per 20-item session → **3–8%** of
  session time. Equivalent to ~1 practice item per session, forgone.
- **Engagement.** The only behavioural friction estimate in the population of
  interest: a **3–5× drop** in voluntary uptake when medical students were
  offered the same practice questions with certainty-based marking (Schoendorfer
  & Emmett 2012, N = 400; Tier C but the only such estimate). 67% reported it
  took longer; ~30% called it a waste of time.
- **Reactivity.** Expected mean ≈ 0 for educationally realistic material, with a
  **negative tail specifically for low-self-confidence learners** (interaction
  β ≈ .30–.36) — a meaningful subgroup in a high-anxiety admissions-test
  population.
- **Data quality.** 8.6% of all responses are confident-and-wrong; 11–21% of
  confident responses are wrong; resolution metrics are downward-biased for
  weaker learners as a 4-option format artifact; and forcing certainty
  consideration changes the answers themselves, contaminating the correctness
  signal the mastery model relies on.
- **Break-even.** Confidence-based targeting would need to produce **≥5%** more
  learning per unit time than uniform elaborated feedback. Mory tested exactly
  this and found no difference. Break-even is not met, and the net sign is more
  likely negative than positive once friction is included. The same 40–60 s buys
  one more item or an in-session re-test of missed items; **both dominate.**

### Do not feed confidence into the scheduler

FSRS's own naturalistic data are inconclusive-to-negative on two- versus
four-button use, and the knowledge-tracing AUC gains are circular — one preprint
states the model is "predominantly predicting student correctness by utilizing
the student's own self-reported confidence."

### The narrow exception

Confidence buys **measurement precision**, which is a different product than
retention. Certainty-based marking raised exam reliability by an amount
"equivalent to using over 50% more questions" (Gardner-Medwin 2019; Tier B,
single institution, T/F items), and explicit feedback on self-assessment accuracy
improves that accuracy (g = 0.34, 47 studies, N = 5,487; Tier B). Both genuinely
require measurement — they cannot be had for free.

So: ship it only as a **bounded, opt-in diagnostic** (one session), where the
cost is paid once rather than on every item forever and the learner gets a
visible return. Never the everyday practice loop. Never a scheduler input.

---

## Where the two reviews converge

Van Loon et al. (2015) found hypercorrection occurred **only** when feedback took
a **refutation** form — explicitly naming and rebutting the misconception —
and not with texts that merely stated the correct information (N = 114; Tier B,
abstract). The shipped first-miss card is exactly that: the refutation of the
option the learner chose, delivered at the moment of surprise, which is where
Butterfield & Metcalfe (2006) located the high-attention window via tone-detection
interference.

The implication cuts across both decisions: **the confident-error benefit is
plausibly already being captured by the refutation itself, with no confidence
prompt needed.** Review 02's actionable residue was "use refutation-style prose
and re-test missed items shortly after feedback" — both confidence-agnostic.
Review 01's verdict was "keep the refutation-first two-attempt sequence, and make
sure missed concepts come back." The two reviews arrived independently at the
same pair of highest-value mechanisms: **refutation-style distractor prose plus
spaced re-testing of missed items.** With the three fixes above, that is what the
product already does.

---

## Code deltas

> **Status 2026-07-29.** Rows 1, 2, 3 and 5 are **done**, though not as written: the
> decision to swap in a sibling forced immediate disclosure, so instead of fixing the
> clamp it was deleted along with the whole in-session re-ask. `RETRY_GAP`,
> `resurfaceAt`, `subAfterFirstAttempt` and `subAfterSecondAttempt` no longer exist;
> `session-flow.ts` is down to a two-step `Sub` and an always-disclosing
> `feedbackFor`. Row 4's cross-session return was already satisfied. **Outstanding:**
> the in-session sibling itself, which needs a new endpoint — see the note under
> Decision 1. `mistakes-ui-contract.test.ts` was re-pinned to the new contract rather
> than relaxed, including a guard that the withhold and the re-ask cannot return
> singly.

| File | Current state | Change | Why | Priority |
|---|---|---|---|---|
| `apps/learner-web/src/screens/practice/session-flow.ts` (`resurfaceAt`) | `Math.min(index + 1 + gap, sequenceLength)` — clamping to the end means misses in the final three positions retry at a gap of 0, 1 or 2. The doc comment treats the clamp as preferable to dropping the second pass. | When the full gap cannot be honoured, do not retry. Reveal fully on the first miss instead. | Lag-0 retry is the one condition here with direct evidence of harm: **.19** at two days vs. **.60** at lag 5, and worse than a single delayed test (**.36**). Tier B. | **P1 — evidence-mandated** |
| `apps/learner-web/src/screens/practice/session-flow.ts` + `PracticeSession.tsx` (`resurfaceAt` call site, line ~161) | The retry re-presents the **same** item, with one option already refuted. | Select a fresh sibling by `family_id` (+ KC × skill × misconception), per the twin-selection design in `docs/mistakes-repair-plan.md`. Fall back: same family → sibling KC → skip. | Measurement validity (**.62** repeated vs. **.30** new) plus the elimination artifact — a refuted option turns the retry into a 3-option item. Tier B/C; retention case is a null (Tier C). **Scope: the within-session second pass only.** The cross-session path already serves a fresh item on the same KC×skill (see the repair-target row below), so this is the one remaining place the same item is re-presented. | **P2 — evidence-mandated on validity grounds** |
| Same change, disclosure obligation | `subAfterSecondAttempt = () => 'reveal'` currently guarantees the *original* item's key lands. | If the second attempt becomes a sibling, disclose the original item's key and rationale somewhere — alongside the sibling's feedback, or at end of session. | Otherwise the sibling swap reintroduces exactly the permanent-silence failure mode that Pashler et al. (2005) rules out. Not free; price it with the change. | **P2 — ships with the row above** |
| `packages/policies/src/practice-selection.ts` (open repair targets / recent misses) and the cross-session queue | **Already satisfied — verified 2026-07-28.** `PracticeRepairTarget` is "a KC×skill flagged for a fresh repair rep after a recent unassisted miss." Repairs are drawn from the recent-miss list, ordered highest-priority-first ahead of `train` and `probe`, allocated up to `maxRepairFraction = 0.3` of the science budget, and aimed at `logitRepair = 1.7346` (~85% success). | None. | Cepeda et al. (2008): optimal gap is **20–40%** of a one-week retention interval, **5–10%** at a year. Every within-session gap is far below optimum for an exam months out. Tier A — the strongest evidence on this page, and the mechanism it calls for is already in place. | **Closed** |
| `session-flow.ts` doc comment citing Butler, Karpicke & Roediger (2007) | Cited in support of the withhold. | Rewrite to claim only the weaker thing: deferring by a few items should not hurt. | BKR supports a null-ish claim, not "deferring is better," and its multiple-try result is a **flat null** — citing it for a design that bundles deferral with a retry re-bundles what BKR was written to separate. | **P3 — accuracy of the record** |

### Not changing, and why

- **`RETRY_GAP = 3`.** Lags 2–4 were never tested. Product preference; evidence
  cannot distinguish 3 from 5. There is also a unit problem in the shipped
  design's favour: their items were vocabulary pairs taking seconds each, so five
  intervening items is likely *less* wall-clock time than three MCAT items.
- **The first-miss withhold itself.** Expected value ≈ zero, sign unknown,
  confidence low. Measure it; do not code against it.
- **`subAfterSecondAttempt = () => 'reveal'`.** The unconditional reveal is the
  line that makes both retracted objections inapplicable. Do not weaken it.
- **Immediate confirmation of a correct first attempt, with key and rationale.**
  This *is* the low-confidence-correct intervention (.40 → .85). Keep it exactly
  as it is.
- **Any per-item confidence rating, and any confidence input to the scheduler.**
  See Decision 2.

---

## Open questions worth measuring

Ranked by how much argument they would end.

1. **The deferral itself — the big one.** Immediate full elaborated reveal versus
   the shipped ~3-item deferral. Expected difference small, sign not established;
   this is an A/B question and arguing it further has negative return. Primary
   outcome should be delayed retention on *novel sibling* items, not on repeats.
2. **Engagement and abandonment, not just retention.** No study in either review
   measures whether a learner told they are wrong and denied the answer skips the
   session. This is the unmeasured risk of the deferral and the reason
   Kulik & Kulik (1988) found applied settings favour immediate feedback.
3. **Whether the retry is reasoned recovery or a coin flip.** Unaided
   self-correction runs 4–9% in cued recall; chance on a 4-option item with one
   option refuted is roughly a third. The gap between those is guessing and
   elimination. Instrument second-attempt latency and choice patterns before
   trusting second-attempt success as a mastery signal.
4. **Whether one elaborated exposure is enough.** The shipped flow delivers the
   transfer-carrying explanation once. Surfacing the same rationale again in a
   later review is cheap and independent of the deferral question. Tier C
   currently.
5. **Feedback reading time.** Ryan et al. (2020) measured a 3-second median for
   right/wrong feedback versus 25–52 s for elaborated forms. Whether learners
   actually read the shipped rationale prose is measurable in-product and
   determines whether any of this literature applies at all.

---

## Evidence quality

**Strong (Tier A), and the load-bearing parts of both decisions rest here:**

- Elaborated feedback outranks correct-answer feedback outranks right/wrong-only
  — replicated across Van der Kleij et al. (2015: 0.49 / 0.32 / 0.05),
  Mertens et al. (2022: g = 0.71 / 0.49 / 0.24 lower-order; 0.46 / 0.22 ns /
  0.14 ns higher-order) and Wisniewski et al. (2020: 0.99 / 0.46 / 0.24).
- The spacing function (Cepeda et al. 2008), which is why the cross-session
  return is the highest-tier item on the code-delta list.
- Butler, Karpicke & Roediger (2008) on feedback for correct answers — two
  experiments, replicated pattern, large effects (d = 0.76, d = 0.99).
- Hypercorrection as a phenomenon, across labs, ages, materials and a one-week
  delay.

**Single studies or thin reads — flag before citing further:**

- **Butler, Karpicke & Roediger (2007)** carries most of Decision 1 and is one
  study, N = 48 and N = 40, and its significant deferral effect (d = 0.47) came
  from a *one-day* delay; at the 10-minute delay closer to a 3-item gap the
  effect was **d = 0.28, ns**.
- **Karpicke & Roediger (2007)** is the sole direct evidence for the clamp fix,
  and it was vocabulary pairs.
- **Butler (2010)**, the same-versus-rephrased null, is N = 24 per experiment —
  a null that cannot exclude a modest effect. Tier C.
- **Van Loon et al. (2015)**, the refutation finding that carries the cross-lane
  convergence, was read **abstract only**.
- **Sitzman et al. (2013)** — abstract plus discussion excerpt.
  **Stock et al. (1992)** — abstract. **Van der Kleij et al. (2015)** on delayed
  timing as a negative predictor — abstract only.
- **Schoendorfer & Emmett (2012)**, the only friction estimate, is Tier C and
  confounded. **Fazio (2011)** is a Tier C secondary report.
- Base rates (~1.7 / ~1.3 per session), the 3–8% session-time cost, and the
  ~1-item-forgone equivalence are **arithmetic derivations** from published
  distributions, not published figures. Labelled as such in review 02.
- No experiment manipulates *exactly* distractor-refutation-without-the-key. The
  shipped design's specific manipulation is untested; the argument for it is that
  nothing indicts it, not that something endorses it.

**The generalisation risk, which applies to nearly everything above.** This
literature runs on **word pairs, short factual passages and single-fact MCQs, at
retention intervals of minutes to days**, in lab or single-course settings. The
target here is **multi-step reasoning on novel items at a months-long horizon**.
Three consequences worth holding onto:

1. Effect sizes should not be read as magnitudes that transfer. They locate
   directions and orderings.
2. "Items" are not a stable unit. A lag of 5 vocabulary pairs is seconds; a lag
   of 3 MCAT items is minutes. This cuts in the shipped design's favour on
   `RETRY_GAP` and against any precise reading of the lag literature.
3. The transfer finding (**.30 vs .28 for no feedback, versus .45 for
   explanation**) is the one result whose paradigm actually matches the target
   task, which is why it outranks the timing literature in importance despite
   being about content rather than timing. Where the two conflict, weight the
   transfer result.
