# Accessibility and Clarity Review

**Review date:** 2026-08-03
**Scope:** rubric `lesson-quality-rubric.md` v0.9; anchor catalog
`lesson-quality-rubric-anchors.md` v0.9-candidate; `lesson-quality-author-protocol.md`;
`lesson-quality-judge-protocol.md`; `lesson-quality-evidence-protocol.md` v0.1;
`lesson-quality-calibration-worksheet.md`; `autonomous-lesson-authoring-context.md` v0.2;
and the `lesson-quality-sources/` analyses (`current-l1-analysis.md`,
`current-l2-analysis.md`, `current-l3-analysis.md`, `historical-previews-analysis.md`,
`kaplan-analysis.md`, `spec-exemplars-analysis.md`, `synthetic-defects-analysis.md`).
Cross-checked against the rendered CSS/TSX and `lesson-quality-report.json` artifacts
those source analyses cite as evidence, and against
`lesson-quality-supervisor-log.md` where a document's own currency was in question.
**Skills applied:** wcag-audit-patterns for WCAG 2.2 AA criterion coverage and audit
method; llm-evaluation and frontend-design for plain-language/clarity principle only
(not used to second-guess product or pedagogy decisions); verification-before-completion
— every claim below was checked against the cited file/line, or the cited source code,
before being recorded.
**Review mode:** read-only. This review edited no canonical document; the only write is
this file.

## Verdicts

- **Accessibility-spec verdict: FAIL.** LQR-X05's own enumerated list of "in scope"
  WCAG 2.2 AA criteria is inconsistent with the evidence the same card mandates
  (Critical-2), and the evidence protocol — the document that exists specifically to
  operationalize the rubric's evidence mandates — has no field or instruction for
  capturing the contrast measurements LQR-X05 requires (Critical-3). The 48 CSS px
  product-target boundary, construct-equivalence definition, and the "accessibility
  approval is never inferred" principle are all specified correctly and consistently
  (see *Controls that are already sound*).
- **Technical-communication verdict: FAIL.** Reviewer-role names diverge between the
  rubric's canonical matrix and the downstream artifacts that reference it, creating a
  concrete misattribution risk for any future agent or human who is not carrying that
  mapping in their head (Critical-1). Several load-bearing abbreviations are never
  expanded anywhere in the reviewed corpus (Minor-1, Minor-2), and four source analyses
  cite a rubric version that is stale in a way only visible by cross-referencing a
  different document (Important-2).

## Verification performed

1. Extracted every WCAG success-criterion number cited in `lesson-quality-rubric.md`
   (§4 Locked decisions, LQR-X05's required evidence and FAIL text, its non-blocking
   boundary note) and cross-checked the full WCAG 2.2 Level A/AA criterion set against
   the eighteen criteria the FAIL text enumerates.
2. Traced the 48 CSS px product-touch-target statement through all three places it
   appears (`lesson-quality-rubric.md:178`, `:612`; `lesson-quality-rubric-anchors.md:603`)
   and confirmed word-for-word consistency of the non-blocking boundary condition.
3. Diffed the seven canonical reviewer roles in `lesson-quality-rubric.md` §7.4
   (`PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`, `INDEPENDENT_BLIND_SOLVER`,
   `ACCESSIBILITY_REVIEWER`, `NOVICE_WALKTHROUGH_REVIEWER`, `PLATFORM_RELIABILITY_REVIEWER`,
   `RIGHTS_REVIEWER`) against every `"role"` value in the three populated
   `lesson-quality-report.json` fixtures and every role name used in
   `current-l1/l2/l3-analysis.md`.
4. Read `lesson-quality-evidence-protocol.md` §2 (manifest fields), §5
   (rendered-evidence minimums), and §6 (manual receipts) end to end and matched each
   field against the "Required evidence" sentence in every LQR-X0x rubric card, looking
   for an evidence category the rubric requires that the protocol never gives a field or
   capture instruction for.
5. Grepped the full `key-docs/` tree for every occurrence of `BKT`, `pL`, `DOK`, and `AT`,
   and separately for their spelled-out forms ("Bayesian Knowledge Tracing", "probability
   of learn/mastery", "Depth of Knowledge", "assistive technology"), to determine whether
   any load-bearing abbreviation is ever expanded on first use anywhere in the corpus.
6. Read the `Rubric authority` / `Scope` header of every `lesson-quality-sources/*.md`
   file and compared the declared rubric version against `lesson-quality-rubric.md`'s own
   `**Rubric version:**` line, then checked `lesson-quality-supervisor-log.md` for whether
   the discrepancy was already tracked.
7. Read `apps/learner-web/src/screens/CatalogLesson.tsx:317-353`,
   `apps/learner-web/src/styles/app.css` (radio-hiding and `prefers-reduced-motion`
   rules), and `packages/design-tokens/src/tokens.css` to confirm the anchor catalog's
   and source analyses' code citations for the radio-group construct-equivalence example
   and the reduced-motion styling claim resolve to real, matching code.
8. Read `lesson-quality-evidence-protocol.md` §8 and `lesson-quality-rubric.md` §4 to
   confirm the "accessibility approval is never inferred" principle is stated as an
   explicit fail-closed rule, then checked the anchor catalog for a worked example that
   applies it correctly (`LQA-X05-P02`).

## Critical findings

### Critical-1 — Reviewer-role names diverge between the canonical matrix and the artifacts that cite it (technical-communication: FAIL)

**Evidence.** `lesson-quality-rubric.md` §7.4 (lines 716–720) fixes exactly seven
canonical role names, including `NOVICE_WALKTHROUGH_REVIEWER`, `ACCESSIBILITY_REVIEWER`,
and `RIGHTS_REVIEWER`. Every rubric-family document that names roles
(`lesson-quality-calibration-worksheet.md:348`, `autonomous-lesson-authoring-context.md:221,284`)
uses these exact names. But:

- All three populated fixtures
  (`content/lessons/v3-les-789208/lesson-quality-report.json:182`,
  `content/lessons/v3-les-130923/lesson-quality-report.json:113`,
  `content/lessons/v3-les-844372/lesson-quality-report.json:188`) use
  `"role": "NOVICE_CLARITY_REVIEWER"` — a name that exists nowhere in the canonical
  matrix.
- The same three fixtures use `"role": "SOURCE_RIGHTS_REVIEWER"` — again absent from the
  canonical matrix, which names this role `RIGHTS_REVIEWER`.
- `v3-les-844372`'s fixture additionally invents a fourth variant,
  `"ACCESSIBILITY_CONSTRUCT_EQUIVALENCE_REVIEWER"` (line 194, reused at line 466), where
  the canonical matrix has one role, `ACCESSIBILITY_REVIEWER`, covering both accessibility
  and construct equivalence for LQR-X05 (rubric line 738).
- `key-docs/lesson-quality-sources/current-l3-analysis.md:38` compounds this by filing
  its novice-review gap as `` `NOVICE-CLARITY-REVIEW` blocked `` **under `LQR-C04`**
  ("Novice-clarity review is missing"). The rubric's own role matrix ties
  `NOVICE_WALKTHROUGH_REVIEWER` to `LQR-X02` only (rubric line 732: `LQR-X02 |
  PRODUCT_PEDAGOGY_OWNER, NOVICE_WALKTHROUGH_REVIEWER | 1 + 1 | always`); `LQR-C04`'s own
  required-roles row (line 727) lists `PRODUCT_PEDAGOGY_OWNER`, `DOMAIN_CONSTRUCT_SME`,
  `INDEPENDENT_BLIND_SOLVER` and never mentions a novice reviewer at all.

A future agent that reads only `current-l3-analysis.md` and the fixture files — a
plausible path, since these are the artifacts an author or judge is most likely to open
first — would conclude that novice review is an `LQR-C04` obligation staffed by a
`NOVICE_CLARITY_REVIEWER`/`ACCESSIBILITY_CONSTRUCT_EQUIVALENCE_REVIEWER`. Neither role
exists in the rubric, and the obligation actually belongs to `LQR-X02`. This is exactly
the kind of hidden-context dependency the review was asked to catch: understanding which
document is authoritative here requires already knowing the rubric supersedes the
fixtures, which is nowhere stated inside the fixtures themselves.

**Exact correction.**

1. In the three `lesson-quality-report.json` fixtures, rename every
   `"role": "NOVICE_CLARITY_REVIEWER"` to `"role": "NOVICE_WALKTHROUGH_REVIEWER"` and
   every `"role": "SOURCE_RIGHTS_REVIEWER"` to `"role": "RIGHTS_REVIEWER"`.
2. In `v3-les-844372/lesson-quality-report.json:194,466`, replace
   `"ACCESSIBILITY_CONSTRUCT_EQUIVALENCE_REVIEWER"` with `"ACCESSIBILITY_REVIEWER"`.
3. In `current-l3-analysis.md:38`, move the novice-review gap out of the `LQR-C04`
   section (or clearly mark it a non-counting cross-reference per rubric §5) and record
   it under `LQR-X02` as a `NOVICE_WALKTHROUGH_REVIEWER` gap, consistent with rubric line
   732.
4. Add one sentence to the top of `lesson-quality-report.json`'s schema/template
   (`docs/lesson-authoring/template/v3-les-000000/lesson-quality-report.json`) and to
   `lesson-quality-author-protocol.md` stating that the `role` field must use exactly the
   seven names in rubric §7.4 and no others, so this cannot silently drift again.

### Critical-2 — LQR-X05's enumerated WCAG 2.2 AA criterion list omits two criteria whose evidence it separately mandates (accessibility-spec: FAIL)

**Evidence.** `lesson-quality-rubric.md` lines 597–601 state:

> An applicable WCAG 2.2 Level AA success criterion fails on a required screen, control,
> representation, feedback state, or navigation path. Conformance at AA includes the
> applicable Level A criteria; those normally in scope for a lesson are at least 1.1.1,
> 1.3.1, 1.4.3, 1.4.10, 1.4.11, 1.4.12, 2.1.1, 2.1.2, 2.2.2, 2.4.3, 2.4.7, 2.4.11, 2.5.7,
> 2.5.8, 3.3.1, 3.3.3, 4.1.2, and 4.1.3.

Two criteria are absent from that list even though the same card's "Required evidence"
sentence (lines 587–593) separately mandates the evidence that tests them:

- **1.4.4 Resize Text (AA)** — the required-evidence sentence names "200 % zoom … measurements"
  specifically (distinct from "320 px reflow measurements", which is 1.4.10's test). 200%
  text-resize-without-loss-of-function is the operational definition of 1.4.4, not 1.4.10.
  The rubric mandates the evidence for a criterion it never lists as in scope.
- **1.3.2 Meaningful Sequence (A, required at AA)** — the required Safari + VoiceOver
  receipt (rubric §7.3, lines 707–711, and `lesson-quality-evidence-protocol.md:177`)
  explicitly requires recording `spoken_reading_order_notes`. Spoken/DOM reading order is
  exactly what 1.3.2 governs. Again, the rubric mandates the evidence but never names the
  criterion.

This makes the card self-inconsistent: an evaluator who checks only the enumerated
eighteen criteria could pass a lesson whose text cannot be resized to 200% without loss of
content, or whose reading order is scrambled relative to visual order, while still
correctly citing "200% zoom" and "spoken reading order" evidence in the bundle — because
neither failure maps to a criterion on the FAIL list. Since LQR-X05 is a blocking
dimension (rubric line 177, "Accessibility is blocking"), an incomplete criterion list is
not a cosmetic omission.

**Exact correction.** In `lesson-quality-rubric.md` line 600, change:

```text
those normally in scope for a lesson are at least 1.1.1, 1.3.1, 1.4.3, 1.4.10,
1.4.11, 1.4.12, 2.1.1, 2.1.2, 2.2.2, 2.4.3, 2.4.7, 2.4.11, 2.5.7, 2.5.8, 3.3.1, 3.3.3, 4.1.2, and
4.1.3.
```

to:

```text
those normally in scope for a lesson are at least 1.1.1, 1.3.1, 1.3.2, 1.4.3, 1.4.4,
1.4.10, 1.4.11, 1.4.12, 2.1.1, 2.1.2, 2.2.2, 2.4.3, 2.4.7, 2.4.11, 2.5.7, 2.5.8, 3.3.1,
3.3.3, 4.1.2, and 4.1.3.
```

and re-pin any hash or revision marker that binds to this rubric's exact bytes (rubric
§3.1 evidence-identity binding).

### Critical-3 — The evidence protocol has no field or instruction for the contrast measurements LQR-X05 requires (accessibility-spec: FAIL)

**Evidence.** `lesson-quality-rubric.md` line 588 requires, as part of LQR-X05's
"Required evidence": "text and non-text contrast measurements." Contrast is also two of
the eighteen enumerated FAIL-triggering criteria (1.4.3 Contrast Minimum, 1.4.11
Non-text Contrast). `lesson-quality-evidence-protocol.md` states its own purpose (line 7)
is to be "the implementation blueprint the rubric deliberately excludes," and it is the
document `lesson-quality-author-protocol.md` and `lesson-quality-judge-protocol.md` cite
"instead of restating evidence detail" (lines 16–18) — i.e., it is meant to be the
complete, actionable checklist. Yet a full-text search of
`lesson-quality-evidence-protocol.md` for "contrast" returns zero matches:

- The manifest-field list (§2, lines 34–61) has no contrast field.
- The rendered-evidence minimums "record as applicable" list (§5, lines 141–155) —
  which does include "target-size and spacing measurements," the sibling requirement
  from the same rubric sentence — has no contrast entry.
- The manual Safari + VoiceOver / construct-equivalence receipt shapes (§6, lines
  167–201) have no contrast field either.

An author or agent who follows `lesson-quality-evidence-protocol.md` literally — which is
exactly what it asks to be used for ("read by a human or an agent preparing or reviewing
evidence by hand," line 14) — has no prompt anywhere in that document to capture a
contrast ratio, the tool used, or the pass/fail threshold, and could submit a
rubric-compliant-looking evidence bundle that is silently missing the one measurement
type the rubric names by name.

**Exact correction.** Add a `contrast_measurements` entry to
`lesson-quality-evidence-protocol.md` §5's "record as applicable" list (after
"target-size and spacing measurements," line 149), specifying at minimum: foreground/background
color pair, measured ratio, applicable threshold (4.5:1 normal text / 3:1 large text and
non-text per 1.4.3/1.4.11), and the tool or method used. Cross-reference it explicitly
from LQR-X05's required-evidence sentence so the two documents point at the same field
name.

## Important findings

### Important-1 — No criterion for accessible math notation despite lessons carrying substantial symbolic content (accessibility-spec)

**Evidence.** `current-l3-analysis.md` and `current-l1-analysis.md` both describe lessons
built around symbolic/numeric content (logarithms, scientific notation, unit conversion).
`lesson-quality-rubric.md` line 591's required evidence is a generic "screen-reader review
of prose, math, tables, charts, and diagrams" with no further specificity for math. Plain
inline math (`10^-4`, `log10(n/5) = 2`) read by a screen reader can be rendered
unintelligibly or ambiguously (e.g., "10 to the power hyphen 4" vs. "10 to the negative
4th") depending on markup choice (MathML vs. styled HTML vs. an image with alt text), and
none of the reviewed documents say which is acceptable, what the accessible-name/alt-text
convention for a rendered equation should be, or how a reviewer should judge "correct"
math announcement. This is a real gap given how math-heavy the lesson content is, not a
generic accessibility restatement.

**Exact correction.** Add a dedicated bullet to LQR-X05's required evidence (rubric
§6, LQR-X05) naming the accessible-math requirement explicitly, e.g.: "for symbolic or
numeric notation, a screen-reader transcript of exactly what is announced for each
distinct expression, checked against its intended mathematical reading, plus the markup
technique used (MathML / accessible HTML / image alt text)." Add a matching manifest
field to `lesson-quality-evidence-protocol.md` §5 or §6.

### Important-2 — Four source analyses cite a stale rubric version that is only recognizable as stale via a different document (technical-communication)

**Evidence.** `current-l1-analysis.md:53`, `current-l2-analysis.md:6`,
`historical-previews-analysis.md:5,221`, and `synthetic-defects-analysis.md:4` all declare
their governing rubric as "v0.4" (a "planning draft"). The actual
`lesson-quality-rubric.md` declares `**Rubric version:** \`0.9\`` at its own line 4. This
discrepancy is a real, tracked fact — `lesson-quality-supervisor-log.md:45` notes "Drafts
still point to rubric v0.4 and candidate anchors; the final scribe must update" — but
none of the four source-analysis files themselves say that their v0.4 citation is known
to be stale or superseded. A future agent who opens `current-l2-analysis.md` in
isolation (a normal thing to do, since these are explicitly disjoint per-lesson scopes)
has no way to know the v0.4 reference is outdated without separately finding and reading
`lesson-quality-supervisor-log.md`. That is hidden context by definition: the fact
needed to correctly interpret the document lives outside the document.

**Exact correction.** Either (a) update the four files' "Rubric authority" line to
`v0.9` and re-verify their dimension-ID references still match (they already do — `C06`,
`X05`, etc. are unchanged names in both drafts), or (b) if the analyses must stay
version-locked to v0.4 for provenance reasons, add one explicit sentence to each file's
header: "This analysis was produced against rubric v0.4; the current rubric is v0.9
(`lesson-quality-rubric.md`). See `lesson-quality-supervisor-log.md` for the
reconciliation status." Do not leave the version claim as a bare, unflagged fact.

## Minor findings

### Minor-1 — `BKT`, `pL`, and `DOK` are used as load-bearing terms but never expanded anywhere in the corpus (technical-communication)

**Evidence.** `lesson-quality-rubric.md` uses `BKT` (lines 35, 172, 265) and `pL` (line
174) in its own "Nonclaims" and LQR-C01 locked-decision text, and names an entire
dimension `LQR-C06 — DOK appropriateness and distribution` (line 407). `current-l1-analysis.md`
and `current-l2-analysis.md` both use `DOK` extensively (e.g.
`current-l1-analysis.md:333-354`, `current-l2-analysis.md:266-270`). A full-text search of
every file in `key-docs/` for "Bayesian Knowledge Tracing," "probability of learn," and
"Depth of Knowledge" returns zero matches — none of these abbreviations is ever spelled
out on first use, or anywhere, in the reviewed corpus. A future agent must already know
BKT is Bayesian Knowledge Tracing, `pL` is BKT's probability-of-mastery parameter, and DOK
is Webb's Depth of Knowledge framework to follow LQR-C01's nonclaims or LQR-C06's
dimension purpose at all.

**Exact correction.** Add a one-line definition on first use in `lesson-quality-rubric.md`:
at line 35, expand to "…mastery calibration, BKT (Bayesian Knowledge Tracing) eligibility…";
at line 407 (LQR-C06's heading or opening sentence), add "DOK (Depth of Knowledge)". A
short glossary section (even four lines) added to the rubric's front matter would resolve
this corpus-wide in one place rather than requiring per-file fixes.

### Minor-2 — `current-l2-analysis.md` introduces the abbreviation `AT` for "assistive technology," which is used nowhere else in the corpus and never expanded (technical-communication)

**Evidence.** `current-l2-analysis.md` uses the bare token `AT` seven times (lines 101,
330, 347, 459-460, and its evidence-status table), e.g. "focus/AT BLOCKED" and
"Announcement correctness needs AT capture (BLOCKED)." No other file in `key-docs/`
uses `AT` as an abbreviation; every other document that needs the concept either spells
out "assistive technology" in full or names the specific tool ("Safari + VoiceOver,"
"screen reader" — e.g. `lesson-quality-rubric.md:182`, `591-592`). `current-l2-analysis.md`
never expands `AT` on first use, so a reader of that file alone must infer the meaning
from context, and could plausibly mistake it for a different domain abbreviation.

**Exact correction.** In `current-l2-analysis.md`, replace the first occurrence of `AT`
(line 101) with "assistive technology (AT)" and keep the remaining six occurrences as
`AT`, or simply replace all seven with "assistive-technology" to match the rest of the
corpus's convention of not abbreviating this term at all.

## Controls that are already sound

- **The 48 CSS px product-touch-target boundary is defined once and repeated verbatim.**
  `lesson-quality-rubric.md:178`, `:612-615`, and `lesson-quality-rubric-anchors.md:603-606`
  all state the same non-blocking condition — "a preferred product standard, not a WCAG
  minimum," non-blocking only when WCAG 2.5.8 passes and no usability/pointer-accuracy/
  focus defect is observed at any required width — with no drift in wording or in the
  triggering condition across the three copies.
- **Accessibility approval is correctly never inferred.**
  `lesson-quality-evidence-protocol.md:227-229` states outright that missing, stale, or
  self-approved evidence "produces `BLOCKED` — never a partial pass and never an inferred
  `PASS` from absence of contrary evidence," and `lesson-quality-rubric.md:183-184`
  states the same fail-closed rule at the rubric level. The anchor catalog applies this
  correctly in practice: `LQA-X05-P02` (`lesson-quality-rubric-anchors.md:573-583`) is
  visually a clean, semantically-correct radio group, yet its `adjudication` is explicitly
  `BLOCKED`, not `PASS`, because "a real Safari + VoiceOver receipt, keyboard-only trace,
  contrast and target measurements, and zoom and reflow results do not exist." This is the
  correct behavior and is the pattern every other accessibility judgment in the corpus
  follows.
- **Construct equivalence has one consistent operational definition.** The rubric's FAIL
  condition ("an alternative changes the learner operation, or supplies a relationship
  the original task requires the learner to derive," lines 604–605), the evidence
  protocol's receipt fields (`decisive_feature_preserved`, `operation_preserved`,
  `relationship_the_learner_must_still_derive`, lines 195–197), and the anchor catalog's
  worked boundary case (`LQA-X05-B02`, distinguishing visually-hidden-but-present native
  semantics from `display: none` removal, lines 594–601) all agree with each other and
  with the current `CatalogLesson.tsx:322-343` radio-group implementation that the anchor
  cites.
- **Rendered-vs-authored separation is stated as a locked decision and applied correctly
  in practice.** `lesson-quality-rubric.md:155` states "Rendered dimensions are never
  inferred from a presentation plan." `current-l3-analysis.md:35-37` demonstrates this
  correctly: it records the L3 constructed-response collapse as a "non-counting rendered
  impact" under `LQR-C04` and explicitly assigns the root defect to `LQR-X04` rather than
  double-counting it, consistent with rubric §5's one-root-defect-per-owner rule.
- **Reduced-motion evidence claims check out against real code.** The rubric requires
  "motion and reduced-motion behavior" evidence (LQR-X05, line 590), and
  `apps/learner-web/src/styles/app.css` contains five separate
  `@media (prefers-reduced-motion: reduce)` blocks (lines 317, 1238, 2730, 3007, 3049),
  so the underlying claim that reduced-motion styling exists to evaluate is accurate.

---

## Re-review — 2026-08-03 (post-correction wave, rubric v0.9.1)

**Scope of this pass:** `lesson-quality-rubric.md` v0.9.1; `lesson-quality-rubric-anchors.md`
v0.9.1-candidate; `lesson-quality-evidence-protocol.md` v0.2; `lesson-quality-author-protocol.md`
v0.3; `lesson-quality-judge-protocol.md` v0.3; `lesson-quality-calibration-worksheet.md` v0.3;
`autonomous-lesson-authoring-context.md` v0.3; the seven `lesson-quality-sources/*.md` analyses;
and the three `content/lessons/*/lesson-quality-report.json` fixtures plus the
`docs/lesson-authoring/template/v3-les-000000/lesson-quality-report.json` template
(inspected read-only, per instruction — not edited, and none needed editing given the
correction approach taken). Every item below was re-checked against the current file/line,
not against memory of the prior pass.
**Review mode:** read-only. This pass edited no canonical document and no lesson artifact;
the only write is this appended section.

### Disposition of every prior finding

| Prior finding | Disposition | Evidence |
| --- | --- | --- |
| Critical-1 — role-name divergence / novice-gap misattribution | **RESOLVED**, via documentation rather than artifact edits | Rubric §7.4 (lines 1055–1076) adds a "Legacy role aliases (read-only, do not propagate)" table mapping `NOVICE_CLARITY_REVIEWER`→`NOVICE_WALKTHROUGH_REVIEWER`, `SOURCE_RIGHTS_REVIEWER`→`RIGHTS_REVIEWER`, `ACCESSIBILITY_CONSTRUCT_EQUIVALENCE_REVIEWER`→`ACCESSIBILITY_REVIEWER`, and (bonus) `DOMAIN_FACTUAL_REVIEWER`/`QUESTION_EVIDENCE_REVIEWER`→`DOMAIN_CONSTRUCT_SME`, explicitly states the legacy artifacts are "out of scope for this documentation family; they are not edited here," and separately states novice walkthrough "is an `LQR-X02` obligation, never an `LQR-C04` one, whatever an older artifact filed it under." `lesson-quality-author-protocol.md:246-248` points readers at the same map. `current-l3-analysis.md` was corrected in place: the C04 section now has an "Ownership correction (2026-08-03)" note recording the gap as a non-counting cross-reference, and X02 now carries it as "Primary owner of the novice gap (moved here from C04, 2026-08-03)." The three `lesson-quality-report.json` fixtures and the template still contain the legacy names verbatim — correctly untouched, since they are now explicitly documented, non-authoritative, read-only legacy artifacts per the alias table, matching this review's acceptance condition. |
| Critical-2 — LQR-X05 WCAG list omitted 1.4.4 and 1.3.2 | **RESOLVED**, and broadened | Rubric line 898–900 now lists 24 criteria including `1.3.2` and `1.4.4`, plus `1.3.3`, `1.4.1`, `2.5.1`, `3.3.2` with an added "Criteria other dimensions depend on" note (lines 910–917) explaining each addition's owning dimension and explicitly naming 1.4.4/1.3.2 as "what this card's own 200% zoom measurement and spoken-reading-order receipt actually measure." A closing sentence, "The enumeration is a floor, not the scope: the condition is the whole applicable standard," forecloses the same class of omission recurring. |
| Critical-3 — evidence protocol had no contrast field | **RESOLVED** | `lesson-quality-evidence-protocol.md` adds `contrast_measurements[]` to the §5 per-condition list (line 151) and a full §5.1 (lines 168–197) specifying element kind, foreground/background, measured ratio, required ratio, measurement method, and state, with an explicit fail-closed sentence: "Absent contrast measurements, `LQR-X05` is `BLOCKED` for contrast, not passed by the absence of a reported violation." Rubric line 884 cross-references the same field name (`contrast_measurements`), so the two documents now agree on vocabulary as well as intent. |
| Important-1 — no accessible-math criterion | **RESOLVED** | Rubric line 888–892 adds an `accessible_math_transcript` requirement to LQR-X05's required evidence and a dedicated FAIL condition (line 907–908: "announced in a form that does not match its intended mathematical reading"). `lesson-quality-evidence-protocol.md` §5.2 (lines 199–224) gives a full field set (`markup_kind`, `programmatic_text`, `spoken_rendering`, `navigable_by_subexpression`, `units_and_symbols_spoken_correctly`) and states the transcript must be "transcribed from a real screen reader in a real browser, not predicted from the markup," which correctly forecloses a markup-only or automated-only substitute. |
| Important-2 — stale "rubric v0.4" self-citations | **RESOLVED** | All four previously-flagged files (`current-l1-analysis.md:12-19`, `current-l2-analysis.md:17-25`, `historical-previews-analysis.md:10-17`, `synthetic-defects-analysis.md:16-26`) now carry an explicit, dated "Currency notice (added 2026-08-03, cross-document correction wave)" stating the v0.4 citation is deliberately preserved as historical provenance, naming the current standard (rubric 0.9.1 / anchor-set 0.9.1-candidate) in the same paragraph, and stating "where this file and the rubric differ, the rubric governs." `spec-exemplars-analysis.md` and `current-l3-analysis.md` carry the same notice pattern even though they were not named in the original finding, closing the gap corpus-wide rather than file-by-file. |
| Minor-1 — `BKT`/`pL`/`DOK` never expanded | **RESOLVED** | Rubric adds a "1.1 Glossary of load-bearing abbreviations" section (lines 41–52) defining `BKT`, `pL`, `DOK`, `KC`, `assistive technology`, and `WCAG` in one place, stated explicitly as "so no document in this family depends on a reader already holding them." First uses in prose are also expanded inline (e.g. line 37 "BKT (Bayesian Knowledge Tracing)", line 332 same, line 335 "`pL`, the probability-of-learned state it defines"). LQR-C06 additionally gained a full Webb DOK-level table (lines 683–697) beyond what this review asked for. |
| Minor-2 — undefined `AT` abbreviation isolated to `current-l2-analysis.md` | **RESOLVED**, and pre-empted corpus-wide | Every previously-bare `AT` token in `current-l2-analysis.md` now reads "assistive technology" in full (e.g. line 473: "BLOCKED (focus/assistive technology)"); a corpus-wide search for a bare `AT` token in that file returns nothing. The new glossary entry (rubric line 51) goes further and makes this a standing rule: "**Do not abbreviate it to `AT`**; that token is ambiguous across domains and is not part of this vocabulary." |

### Re-verification of items not previously flagged as defects

- **48 CSS px product-touch-target boundary** — unchanged and still verbatim-consistent across `lesson-quality-rubric.md:339`, `:923`, and `lesson-quality-rubric-anchors.md:734`. No regression.
- **Construct equivalence** — unchanged; the operational definition, the evidence-protocol receipt fields, and the anchor catalog's worked boundary case (`LQA-X05-B02`) remain mutually consistent, and `LQA-X05-P02` (lines 704–710) is now labeled even more explicitly than before — "hypothesized `PASS` · actual `BLOCKED`" — reinforcing rather than weakening the non-inferred-approval pattern.
- **Reduced motion** — unchanged; rubric still requires "motion and reduced-motion behavior" evidence and the cited `app.css` `@media (prefers-reduced-motion: reduce)` blocks are unaffected by the correction wave.
- **Non-inferred accessibility approval** — unchanged and still explicit: `lesson-quality-evidence-protocol.md:353` still states evidence gaps "produce `BLOCKED` — never a partial pass and never an inferred `PASS` from absence of contrary evidence," and no edit in this wave weakened that sentence or any dependent anchor.
- **Version/hash discipline of the correction wave itself** — every document touched was version-bumped and cross-references the others correctly: rubric `0.9`→`0.9.1`, anchor catalog `0.9-candidate`→`0.9.1-candidate`, evidence protocol `0.1`→`0.2`, author protocol `0.2`→`0.3`, judge protocol `0.2`→`0.3`, calibration worksheet `0.2`→`0.3` (with an explicit `Supersedes` chain back to `0.1`/rubric `0.4`), and the agent-context entry point `0.2`→`0.3`. No document was left citing a version another document had already moved past.

### New finding from this pass

#### Re-review-1 — The evidence protocol's WCAG-to-capture mapping table is incomplete relative to LQR-X05's now-larger criterion list (accessibility-spec: minor residual)

**Evidence.** `lesson-quality-evidence-protocol.md` §5.3 (lines 226–251) is introduced as
mapping each rubric-named criterion to "the capture that can actually establish it, so a
bundle can be checked for completeness against the rubric rather than against a
reviewer's memory." It contains 17 rows covering `1.3.1`–`4.1.3`, but
`lesson-quality-rubric.md`'s LQR-X05 FAIL list (line 898–900) now names 24 criteria. Five
have no row and are not mentioned anywhere else in the evidence protocol (confirmed by a
full-text search for each number and its plain-language name): **1.1.1 Non-text
Content**, **1.4.12 Text Spacing**, **2.2.2 Pause, Stop, Hide**, **2.5.7 Dragging
Movements**, and **3.3.3 Error Suggestion**. Unlike the criteria the rubric explicitly
cross-references to another dimension's evidence (1.4.1, 1.3.3, 2.5.1, 3.3.2 — all four
of which do appear in the §5.3 table), these five have no owning-dimension note and no
capture mapping at all. An author who uses §5.3 as their completeness checklist — which
is exactly what it says to do — can build a bundle that never establishes any of these
five criteria and never notices, because the checklist that claims completeness silently
stops five short of it.

**Exact correction.** Add five rows to the §5.3 table, for example:

```text
| 1.1.1 Non-text Content | automated accessibility findings for missing/empty alt attributes, plus a human check that decorative-vs-informative classification is correct |
| 1.4.12 Text Spacing | a capture with the WCAG text-spacing override bookmarklet/stylesheet applied, at the same viewports as the 200% zoom and 320 px reflow conditions |
| 2.2.2 Pause, Stop, Hide | for any auto-updating or auto-advancing content, a capture showing a pause/stop/hide control and its keyboard operability |
| 2.5.7 Dragging Movements | for any drag interaction, a capture of the single-pointer (non-dragging) alternative and its keyboard equivalent |
| 3.3.3 Error Suggestion | error-state capture showing the programmatic correction suggestion text, not just the error identification from 3.3.1 |
```

This is a smaller-severity, single-document completeness gap rather than the
cross-document self-contradiction Critical-2/3 were — the rubric no longer omits these
criteria, and "automated accessibility findings" plus the general screen-reader review
may incidentally catch some of them — but the protocol's own stated purpose is to remove
exactly this kind of reliance on "a reviewer's memory," so it should not leave five
criteria to memory itself.

### Fresh verdicts

- **Accessibility-spec verdict: PASS, with one open minor finding (Re-review-1).** All
  three Critical accessibility-spec gaps from the original review (WCAG criterion-list
  omission, missing contrast evidence, missing accessible-math evidence) are resolved
  with matching, cross-referenced language in both the rubric and the evidence protocol.
  The 48px boundary, construct-equivalence definition, reduced-motion requirement, and
  non-inferred-approval rule all remain correct and internally consistent. The one
  residual gap is a completeness shortfall in a convenience mapping table, not a rubric
  requirement that is missing, contradicted, or blocking-eligible without evidence.
- **Technical-communication verdict: PASS.** The role-naming divergence is resolved the
  right way for artifacts that are out of this review's edit scope: documented, mapped,
  and explicitly marked non-authoritative and read-only, exactly matching this
  re-review's acceptance condition for legacy aliases. The novice-walkthrough ownership
  correction is applied in the one file that had it wrong. Every load-bearing
  abbreviation this review flagged (`BKT`, `pL`, `DOK`, `AT`) is now expanded on first
  use and centrally defined in a new glossary, and the stale-rubric-version citations are
  now self-flagged with a dated notice in every file that has them, so a future agent
  reading any single file in isolation no longer needs hidden context from a different
  document to interpret it correctly.

---

## Final gate — 2026-08-03 (bounded-correction close-out, rubric v0.9.1)

**Scope of this pass:** the same document set as the prior re-review, re-read after the
bounded correction that targeted Re-review-1 specifically. This is a closing gate check,
not a new full audit: it (a) verifies the five WCAG-to-capture rows were added correctly
and completely, and (b) spot-checks every previously-resolved item for regression rather
than re-deriving each from scratch.
**Review mode:** read-only. This pass edited no canonical document; the only write is
this appended section.

### 1. Re-review-1 close-out — WCAG-to-capture table completeness

`lesson-quality-evidence-protocol.md` §5.3 now contains rows for all five previously
missing criteria: **1.1.1 Non-text Content**, **1.4.12 Text Spacing**, **2.2.2 Pause,
Stop, Hide**, **2.5.7 Dragging Movements**, and **3.3.3 Error Suggestion** (lines
245–265). A programmatic diff of the rubric's 24-criterion LQR-X05 FAIL list (rubric
lines 931–933) against the table's 24 listed criteria (counting the combined `2.1.1 /
2.1.2` row as two) confirms an exact 1:1 match — nothing missing, nothing extra.

The five new rows exceed the minimum fix this review asked for: each names a concrete
manifest field (`non_text_content_checks[]`, `text_spacing_captures[]`,
`moving_content_control_captures[]`, `dragging_alternative_captures[]`,
`error_suggestion_captures[]`) rather than a prose description, and each states which
dimension owns the root cause when the same defect is also a rendered/interaction defect
(X06 for spacing-induced clipping and inoperable pause states, X04 for the dragging
interaction, X03 for missing corrective feedback), directing X05 to record only a
`NON_COUNTING_CROSS_REFERENCE` in that case. This is consistent with rubric §5's
one-root-cause-per-owner rule rather than merely bolted on.

The rubric's own "Criteria other dimensions depend on" note (lines 944–955) was updated
in lockstep — it now says "**Ten** of the listed criteria" (up from six) and names the
same five new criteria with the same ownership split (2.5.7→X04, 3.3.3→X03,
1.4.12/2.2.2→X06), so the rubric and the evidence protocol agree with each other, not
just each internally. **Re-review-1 is closed.**

### 2. Regression spot-check of all prior corrections

| Item | Status | Evidence |
| --- | --- | --- |
| WCAG 24-criterion FAIL list | No regression | `lesson-quality-rubric.md:931-933` unchanged since the last pass; still 24 criteria, still includes 1.4.4 and 1.3.2. |
| Contrast measurement spec | No regression | `contrast_measurements[]` (evidence protocol lines 188–198) byte-identical to the prior pass; still ties to 1.4.3/1.4.11 in §5.3. |
| Accessible math transcript spec | No regression | `accessible_math_transcript[]` (evidence protocol lines 219–227) unchanged; §5.2's "transcribed from a real screen reader ... not predicted from the markup" rule intact. |
| Legacy role-alias table | No regression | `lesson-quality-rubric.md:1099-1111` unchanged; the five-row alias map and the "out of scope for this documentation family; they are not edited here" statement are both intact. The three fixtures and the template still carry the legacy names verbatim, which remains correct under this review's acceptance condition (documented + non-authoritative + untouched). |
| Novice-walkthrough ownership (X02, not C04) | No regression | `current-l3-analysis.md:47` (C04 non-counting cross-reference) and `:88` (X02 primary owner) both still present and worded as in the prior pass. |
| Glossary (`BKT`, `pL`, `DOK`, `AT`) | No regression | Rubric §1.1 (lines 44–56) unchanged; the explicit "Do not abbreviate it to `AT`" rule is still present, and `current-l2-analysis.md` still has zero bare `AT` tokens. |
| Stale-version currency notices | No regression | All four originally-flagged source analyses, plus the two that were pre-emptively covered, still carry their dated currency notice pointing at rubric `0.9.1`. |
| 48 CSS px product-target boundary | No regression | Still stated identically in `lesson-quality-rubric.md` (two occurrences) and `lesson-quality-rubric-anchors.md` (two occurrences, including the anchor catalog's explicit "no anchor tests this boundary yet" self-disclosure, which remains an honest gap rather than a defect). |
| Construct equivalence | No regression | `LQA-X05-P02`'s label is unchanged: "hypothesized `PASS` · actual `BLOCKED`," still correctly refusing to infer a pass from clean visual/semantic appearance alone. |
| Reduced motion | No regression, coverage increased | `apps/learner-web/src/styles/app.css` now has six `@media (prefers-reduced-motion: reduce)` blocks (previously five, at line 4045 in addition to the original five); this is unrelated application code drift, not a documentation change, and does not weaken the rubric's reduced-motion evidence requirement. |
| Non-inferred accessibility approval | No regression | `lesson-quality-evidence-protocol.md:471` still states evidence gaps "produce `BLOCKED` — never a partial pass and never an inferred `PASS` from absence of contrary evidence." |
| Version/hash discipline | No regression | Rubric `0.9.1`, anchor catalog `0.9.1-candidate`, calibration worksheet `0.3` all unchanged from the prior pass. Evidence protocol remains `0.2` even though §5.3 gained five rows in this bounded correction — a version-hygiene nit, not a cross-document inconsistency, since no other document pins a specific evidence-protocol version number to compare against (see finding below). |

### 3. New findings from this pass

Both items below are cosmetic wording issues, not accessibility-spec defects and not
misattribution risks on the scale of anything in the original review. Neither blocks the
gate.

#### Gate-1 — "Criteria other dimensions depend on" mis-describes its own two self-owned entries (technical-communication: minor)

**Evidence.** `lesson-quality-rubric.md:944-945` opens with: "Ten of the listed criteria
are the WCAG reading of conditions **another card owns**." The same sentence's list
then includes "**1.4.4 Resize Text** and **1.3.2 Meaningful Sequence** are what **this
card's own** 200% zoom measurement and spoken-reading-order receipt actually measure"
(lines 949–950) — the opposite of "another card owns." Eight of the ten items in the
list are genuinely owned by another card (X04 ×5 counting the sensory/gesture/dragging
group, C04 ×1, X03 ×1, X06 ×2); only those eight fit the topic sentence. The remaining
two are X05's own measurements, included in the same paragraph for a different reason
(so a reviewer doesn't mistake them for separate, unaddressed criteria) but mislabeled by
the topic sentence that introduces them.

**Exact correction.** Split the paragraph's opening into two sentences that match what
follows:

```text
Eight of the listed criteria are the WCAG reading of conditions another card owns, and
are enumerated here so a reviewer checking only this list cannot miss them: 1.4.1 Use of
Color, 1.3.3 Sensory Characteristics, and 2.5.1 Pointer Gestures are the accessibility
readings of X04's sensory-channel and gesture condition; 3.3.2 Labels or Instructions is
the reading of C04's unstated-entry-convention condition; 2.5.7 Dragging Movements is
X04-owned when the same root cause is an interaction with no non-dragging alternative;
3.3.3 Error Suggestion is X03-owned when the same root cause is missing corrective
feedback; and 1.4.12 Text Spacing and 2.2.2 Pause, Stop, Hide are X06-owned when the same
root cause is responsive clipping or an inoperable pause/termination state. Two more,
1.4.4 Resize Text and 1.3.2 Meaningful Sequence, are not owned elsewhere — they are what
this card's own 200% zoom measurement and spoken-reading-order receipt actually measure,
named here so neither is mistaken for an unaddressed gap.
```

This is a same-paragraph internal-consistency slip, not a missing requirement — the
evidence protocol's §5.3 table already treats 1.4.4/1.3.2 correctly (mapped to this
card's own captures, not cross-referenced to another dimension), so no evidence
obligation is actually misassigned. Fixing the sentence is a clarity-only edit.

#### Gate-2 — Evidence protocol version number was not bumped for the five-row addition (technical-communication: trivial, non-blocking)

**Evidence.** `lesson-quality-evidence-protocol.md` gained five new rows and roughly
twenty lines of new `§5.3` content in this bounded correction, but its `**Protocol
version:**` line still reads `0.2` (line 4), the same value it had going into this
correction. This is not a cross-document inconsistency — no other reviewed document pins
a specific evidence-protocol version number for comparison, so nothing else in the
corpus is now stale relative to it — but it is a break from the version-bump discipline
every other document in the correction wave followed (rubric `0.9`→`0.9.1`, author
protocol `0.2`→`0.3`, judge protocol `0.2`→`0.3`, calibration worksheet `0.2`→`0.3`,
agent context `0.2`→`0.3`).

**Exact correction.** Bump `lesson-quality-evidence-protocol.md`'s `**Protocol
version:**` to `0.3` (or `0.2.1` if the project distinguishes patch-level content
additions from the larger `0.1`→`0.2` jump) to keep the correction wave's own version
trail complete and to give future evidence bundles a distinct version to cite once the
new `§5.1`/`§5.2`/`§5.3` fields are in use.

### Final verdicts

- **Accessibility-spec verdict: PASS.** Every accessibility-spec finding raised across
  all three passes of this review — the original WCAG criterion-list omission, the
  missing contrast evidence, the missing accessible-math evidence, and the residual
  WCAG-to-capture mapping gap — is now closed, cross-referenced correctly between the
  rubric and the evidence protocol, and consistent with the rubric's one-root-cause
  ownership rule. The 48px boundary, construct-equivalence definition, reduced-motion
  requirement, and non-inferred-approval rule remain sound with no regression. No
  accessibility-spec finding remains open.
- **Technical-communication verdict: PASS.** Every technical-communication finding —
  role-name divergence, novice-ownership misattribution, undefined abbreviations, and
  stale version self-citations — remains resolved with no regression. Two trivial,
  non-blocking wording items are newly noted (Gate-1, Gate-2); neither creates a hidden-
  context dependency, a misattribution risk, or an inconsistency between documents, and
  both have exact, low-effort corrections above if a future editing pass wants to close
  them.

This closes the bounded-correction review cycle. No further re-review of this scope is
needed unless the rubric, evidence protocol, or source analyses change again.

---

## Closure note — 2026-08-03 (M-1 wording verification)

**Scope of this pass:** verify only the Gate-1 wording correction in live
`lesson-quality-rubric.md` LQR-X05, and spot-check the WCAG-to-capture mapping for
regression. Read-only; no canonical document edited.

**Gate-1 fix confirmed correct.** `lesson-quality-rubric.md:948-960` now reads "**Eight**
of the listed criteria are the WCAG reading of conditions another card owns" (previously
"Ten"), and separately states "Two additional listed criteria are owned directly by
X05: **1.4.4 Resize Text** and **1.3.2 Meaningful Sequence**, measured by the 200% zoom
result and spoken-reading-order receipt respectively." The eight named as cross-owned
(1.4.1, 1.3.3, 2.5.1, 3.3.2, 2.5.7, 3.3.3, 1.4.12, 2.2.2) is an exact count of eight and
matches, criterion-for-criterion, the "Primary owner" dimension recorded for each in
`lesson-quality-evidence-protocol.md` §5.3 (X04 for 1.4.1/1.3.3/2.5.1/2.5.7, C04 for
3.3.2, X03 for 3.3.3, X06 for 1.4.12/2.2.2). The closing root-cause-ownership sentence —
"Record a shared root cause once under the owning dimension and cross-reference X05 as
`NON_COUNTING_CROSS_REFERENCE`" — is unchanged and still consistent with rubric §5's
one-root-cause rule. The self-contradiction flagged as Gate-1 is fully closed.

**No WCAG mapping regression.** The rubric's LQR-X05 FAIL list
(`lesson-quality-rubric.md:936-938`) is unchanged at 24 criteria. The evidence protocol's
§5.3 table (`lesson-quality-evidence-protocol.md:245-267`) is unchanged at 23 rows
covering all 24 criteria (the combined `2.1.1 / 2.1.2` row accounts for two), an exact
1:1 match with no gap and no extra entry.

**Remaining findings: 1 (non-blocking).** Gate-2 — the evidence protocol's `**Protocol
version:**` line is still `0.2`, not bumped despite the content this correction wave
added — remains open. It was out of scope for this pass, carries no cross-document
inconsistency (no other document pins a specific evidence-protocol version number), and
does not affect either verdict below.

**Final verdict: accessibility-spec PASS; technical-communication PASS.** With Gate-1
closed and no regression found, every finding raised across this review's four passes is
resolved except the one trivial, non-blocking version-hygiene item (Gate-2) noted above.
The review is closed.
