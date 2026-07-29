# CARS passage-and-item generation

**Status:** provisional-v1. Generates candidates for human review. Nothing here publishes content, sets an answer key, or awards mastery.

**Package:** `packages/cars-generation` · **CLI:** `tools/cars-generator` · **Corpus profiler:** `tools/cars-corpus-profile`

**Evidence base:** [`docs/research/cars-item-design/`](../research/cars-item-design/00-README.md) (what a CARS item is) and [`docs/research/item-generation/`](../research/item-generation/00-README.md) (how items get generated and screened).

---

## What problem this solves, and why the obvious approach fails

The obvious approach is to show a model some real CARS items and ask for more like them. That fails three ways at once, and each failure shaped the design.

**It is a copyright violation.** Real MCAT items are copyrighted. The repository's standing rule — `docs/content/question-format-guide.md` — forbids copying, transcribing, paraphrasing, or embedding source questions, and reordering choices or swapping nouns is explicitly not original authorship.

**It produces broken items at a stable, measurable rate.** Free-form LLM item generation defects run **25–40%**, and the defects concentrate in two places: 36% of GPT-4 USMLE-style items were judged invalid by at least one physician, with *multiple correct answers* the single largest fault. More sharply, when stems, keys, and distractors were scored separately, **70% of stems and keys were valid against only 37% of distractor sets** — the distractor stage fails about twice as often as everything else combined.

**Its most likely failure is invisible without a specific test.** The characteristic LLM error is writing a key that is true *of the topic* rather than true *of the passage*. That produces an item answerable from world knowledge, which violates the section's defining rule. It looks completely fine to a human skimming it.

So the design does three things differently: generation runs from **abstract blueprints** rather than examples, **distractors are specified** rather than left to the model, and the **passage-blind ablation** is a first-class gate.

## The one architectural decision that matters most

The strongest published result in this literature is not about prompting. It is that moving human review **upstream to a reusable template** produces items blinded expert panels cannot distinguish from committee-written ones (42% detection — worse than chance), and that a hybrid pipeline where a human approves the template before generation reached **96.2% expert-key agreement**, the best number anywhere in the review.

So the unit of human approval is the **blueprint**, not the item. `generatePassageSet` refuses to run without `approvedBy` set.

This pays a second dividend. A reviewed blueprint is an item *model*, so every item generated from it is a sibling in a **family** — and family inheritance is rated the highest-value cold-start calibration route (parent–clone r = 0.77–0.93 in simulation). That is only available if the family is recorded at generation time, which is why `familyId` is required rather than optional on `GeneratedItem`. Free-form generation throws this away.

## Pipeline

Ordered so everything deterministic and cheap runs before anything that costs a model call.

| Stage | What happens | Gate |
| --- | --- | --- |
| 0 | Refuse an unapproved blueprint | throws |
| 1 | Generate passage → **measure** → resample | auto-reject, bounded retries |
| 2 | Originality battery | auto-reject |
| 3 | Generate items from item models, distractors specified | schema |
| 4 | Deterministic flaw audit | auto-reject |
| 5 | Solver ablations under option permutation | route to review |
| 6 | Exactly-one-defensible-key adjudication | route to review |

Stage 1 measures rather than asks. Prompting a model to hit a stated complexity level succeeded in **5% (9/180)** of attempts in the one study that tested it; generate-measure-resample is the method with published success. Complexity is never trusted from the prompt.

Stage 4 is code rather than an LLM judge because on exactly this task rule-based detection caught **91%** of human-identified flaws against GPT-4's **79%**, with less than half the Hamming loss — and GPT-4 over-flagged.

### Auto-reject versus route-to-review

These are separate actions because the costs are asymmetric. The one published harness with a measured confusion matrix ran at **precision 0.60** — roughly two healthy items sent to review for every three genuinely broken ones caught. Fine for routing, unacceptable for rejection. Mechanical faults, where the fault is deterministic and regeneration is free, are auto-rejected; judgement calls route to a human with the failing check named.

An unrun check is reported as **failed**, not passed. Configure no solver ensemble and the verdict is `review`, not `accept`. Conflating "we didn't test this" with "this passed" is how a harness becomes decorative.

## Thresholds are calibrated, not invented

No published threshold for any of these checks transfers to CARS. Published numbers describe how exploitable existing corpora are; none is a validated pass/fail line. So `tools/cars-corpus-profile` OCRs a screenshot corpus of two official practice forms and emits **only aggregate structural measurements** — counts, lengths, ratios, category tallies. No source text enters the repository. Output: [`corpus-structural-profile.json`](../research/cars-item-design/corpus-structural-profile.json).

The most important thing it found:

> **Real CARS options are markedly uneven in length.** Longest-to-shortest word ratio has a median of **1.85**, a 90th percentile of **3.31**, and an observed maximum of **6.33**.

An engineer who reads that the longest-option cue is exploitable will reach for "options must be similar length." That gate would reject the majority of authentic items. The defensible gate is not on raw spread but on whether the **key** is the longest option, because that is the direction of the exploitable cue. Spread is allowed to the observed corpus maximum.

The same logic governs absolute terms. Item-writing guidance treats them as a flaw signal and a generator over-produces them — but authentic options use them at a mean of **0.13 per option**, and some authentic items are built entirely from an absolute-term matrix over two attributes. So the check flags absolutes **concentrated in the key**, not absolutes as such.

Other corpus-derived bands: passage 480–660 words (official target 500–600; measured median 613 is OCR-inflated), 4–12 paragraphs, mean sentence 16–44 words, 5/6/7 items per set (independently confirming the official blueprint), stem 5–60 words.

## Construct fidelity: the two rules an unguided generator breaks

**Skill tags are derived, never self-reported.** The official discriminator between Foundations of Comprehension and Reasoning Within the Text is *retrieval scope*, not question topic — AAMC states plainly that "one key difference is in the scope of the information needed to answer the question." Two items with identical stems belong to different categories depending only on how far apart the supporting evidence sits. A generator asked to label its own output will label from stem wording and be wrong at scale. `deriveSkill` computes the tag from evidence spans; the generator's opinion is discarded.

**"No outside knowledge" is a self-containment obligation on the text, not a topic filter.** AAMC says some passage topics will be unfamiliar, and that passages carry their own "definitions of significant specialized terms." So a blueprint declares `termsToDefineInPlace`, and the operational test is the passage-blind ablation rather than a topic allowlist.

Two blueprint fields exist for structural reasons that are easy to mistake for decoration. `hedgedClaims` is required because intensity-error distractors need something to overstate — a passage that asserts everything flatly cannot support the `too-extreme` family. `reportedPerspectives` is required because perspective-attribution items have no key without one, and the `author-confusion` family has nothing to draw on.

## Distractors

The familiar family names — too-extreme, out-of-scope, opposite, half-right, distortion — are **prep-industry folklore**. They have no authoritative source and have never been validated against response data. `distractors.ts` labels them as such and pins each to the peer-reviewed mechanism it actually instantiates, so the defensible part is separable from the folklore.

Two rules do have grounding. The three distractors must instantiate three **different mechanisms**. And at most two may be **explicitly falsifiable from the passage** — an all-falsifiable set is solvable by elimination alone, which shifts the item toward general test-wiseness and off the reading construct. That is a construct-validity constraint, not a difficulty one.

Expect the fourth option to be dead weight. Across four standardized tests the modal number of *effective* distractors per item is **one**; in 480 medical items the mean was 1.82 and only **7.1%** had four functional distractors. Reducing four options to three slightly *raises* discrimination. CARS is four-option by official rule, so this cannot be acted on by shipping three — it sets the correct expectation that the third distractor needs deliberate work and its inertness should be measured once response data exists.

## Difficulty is targeted ordinally, never predicted

`DIFFICULTY_TARGETS` is `accessible | moderate | demanding`. No numeric difficulty is emitted anywhere, because the cold-start ceiling is roughly **18% of variance** and LLM difficulty ratings average **Spearman 0.13**. A numeric estimate would be unearned precision, which `docs/policies/public-claims.md` forbids.

For CARS the situation is worse and produces a useful asymmetry. A strong model scores around the **99th percentile** on this section, so solver correctness carries almost no difficulty signal. The same near-ceiling property makes the ensemble an excellent **key verifier**: when it disagrees with the authored key, the prior should be that the key is wrong, not that the item is hard. **The ensemble is used for validity, never for calibration.**

The best-evidenced difficulty lever available is free and structural: **thesis position**. Main-idea items are easiest with an opening thesis and hardest mid-text, replicated across two testing programmes. Prose-complexity tuning is the *weakest* lever — passage features cap out at 10–15% of item-difficulty variance, with no significant effect at the ability band closest to CARS.

## Usage

```bash
# Audit the authored example set. No network, no key. Prints every measured score.
pnpm --filter @mcat/cars-generator-cli start audit

# Audit a set on disk.
pnpm --filter @mcat/cars-generator-cli start audit --set out/set.json

# Live generation. Requires AI_API_KEY; read from apps/learner-web/.env.local if present.
# Start narrow: the full ablation grid is ~100 sequential solver calls for a five-item
# set, so the CLI prints the count and refuses a large first run without --yes.
AI_MODEL=gpt-4o \
CARS_SOLVER_MODELS=gpt-4o-mini,claude-3-5-sonnet \
CARS_ADJUDICATOR_MODEL=claude-3-5-sonnet \
pnpm cars:generate -- --conditions full,passage-blind --permutations 2 --out out/set.json

# Full grid, once the narrow run looks right.
pnpm cars:generate -- --yes --out out/set.json

# Re-derive the structural calibration bands from a screenshot corpus (metrics only).
node tools/cars-corpus-profile/profile-corpus.mjs \
  --dir /path/to/screenshots --match "3.54.19" --out profile.json

# Measure the solver-ablation baseline against the reference corpus (rates only).
# --stub exercises the whole path offline with a deterministic fake ensemble.
pnpm cars:calibrate -- --stub --dir /path/to/screenshots --match "3.54.19"

# With real solvers. Optionally supply answer keys as "<setKey> <LETTERS>" lines,
# which removes the consensus-proxy caveat.
CARS_SOLVER_MODELS=gpt-4o-mini,claude-3-5-sonnet \
pnpm cars:calibrate -- --dir /path/to/screenshots --match "3.54.19" --keys keys.txt
```

`--match` must select CARS recordings specifically. In a full-test capture the section lengths give them away: CARS is the 53-question section, the other three are 59.

The generating model is refused as a solver or adjudicator. A self-preferring judge approves its own defects, and the one ensemble with a published AUROC was deliberately heterogeneous across vendors.

`packages/cars-generation/src/fixtures/example-set.ts` holds an original hand-authored passage set. It is the harness's **positive control**: a battery that only ever rejects is untestable, and this set is what stops the thresholds drifting stricter than the corpus they were calibrated against.

## Known limitations

These bound what the system can currently claim.

- **No published study generates CARS-style passages plus items and validates them psychometrically.** Not one. Every psychometric result behind this design comes from knowledge-based items — medical licensure, maths, employee selection. Everything transfers by argument, not demonstration.
- **The solver-ablation gates are provisional and uncalibrated, and the corpus cannot fix that.** `SOLVER_GATES.provisional` is `true`; the values are invented. `pnpm cars:calibrate` was built to measure them against the reference items and retain only accuracy rates — the same posture that produced the structural bands. Running it settles the question in the negative: 106 CARS pages yield **10 distinct items** with all four options readable, against **64 renders discarded** for showing fewer than four, because the screenshots are a scrolling viewport with the fourth option below the fold. Ten items cannot pin a rate closer than roughly ±15 points, which is wider than the gap between chance and the gates. **The blocker is the capture, not the answer key and not the provider budget** — re-capturing items with all four options in frame unblocks it; supplying keys for the ten already recovered does not.
- **The artifact checks are validated as dataset diagnostics, not item screens.** Passage-blind, options-only, and lexical-overlap ablations are proven to *detect* exploitable structure in existing corpora. Nobody has screened generated items on them, administered retained and rejected sets to examinees, and compared psychometrics. Their screening payoff is an inference.
- **Non-literal copying has no detector.** Event and argument-structure copying runs 2.3–5.9%, resists the mitigations that reduce literal copying, and is invisible to n-gram methods. The residual risk is handled architecturally — blueprints carry no source prose — not by the originality battery.
- **Option-geometry bands rest on about 10 distinct items, not 19.** The profiler counts 19 of 106 screenshots as yielding all four options cleanly, but it counts *renders*: the same item reappears across scroll states, and deduplicating by stem leaves **10 distinct items**. So the effective sample behind every option-geometry band — spread, max-over-mean, key-length cue, absolute-term rate — is ten items. Bands are set at the observed extreme with margin rather than at a percentile, which is the right response to a sample this small but does not make it larger.
- **The distractor families are unvalidated.** No study relates family membership to selection rates or discrimination. Coding generated items by family and correlating with response data would be novel and directly product-serving — and is the obvious first experiment once the bank sees traffic.
- **No LLM-judge agreement rate exists for this item type.** Whether a model can adjudicate "is this inference defensible from this passage" at usable reliability is unknown. Log adjudicator decisions against human ones from day one; that agreement rate is the number that determines how much the harness can be trusted.

## What to instrument first

Two things, both cheap and both irreversible if skipped.

Record the **item-model / family ID** on every generated item — already required by the schema, but it only has value if blueprints are genuinely reused rather than written per item.

Record **every check score, not the verdict**. Every threshold here will be re-tuned once response data exists, and a boolean cannot be re-tuned. The audit CLI prints all scores for this reason.
