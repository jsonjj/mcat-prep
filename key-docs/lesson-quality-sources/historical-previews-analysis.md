# Historical App-Native Preview Lessons — Structural Analysis

**Status:** SOURCE ANALYSIS — CANDIDATE ANCHOR INPUT ONLY
**Date:** 2026-08-03
**Rubric authority:** [`lesson-quality-rubric.md`](../lesson-quality-rubric.md) v0.4
**Anchor catalog:** [`lesson-quality-rubric-anchors.md`](../lesson-quality-rubric-anchors.md) v0.1-draft
**Analysis commit:** `7490cb9219dfbeee50ddd2e0a592ed99b858478e` (`e70c722^`, last revision before preview retirement)
**Retirement commits:** `e70c722` (catalog/routes), `52872e5` (tree deletion)

> **Currency notice** (added 2026-08-03, cross-document correction wave). The rubric `v0.4`
> and anchor-catalogue `v0.1-draft` pins above are the versions actually read at the
> analysis commit, and are preserved for that reason. **The current standard is rubric
> `0.9.1` with anchor-set `0.9.1-candidate`**, and the `0.1-draft` anchors this file fed
> were superseded wholesale — twenty-four of them are now `RETIRED_CANDIDATE`. Criterion
> wording, dimension boundaries, and reviewer-role names have changed. The git-cited
> structural observations below stand as a record of the retired previews at the commits
> named; the rubric mappings attached to them have not been re-derived against `0.9.1`.

## 1. Scope and method

Read-only `git show` / `git log` inspection of the 14 retired app-native preview lessons registered in `APP_NATIVE_LESSONS` immediately before Phase 7 retirement. No files were restored; no product artifacts were modified.

**Rights boundary:** This report records structural patterns, rubric-relevant defects, and git citations only. It does **not** reproduce learner-facing prose, item stems, keys, or visual assets. Previews are **anti-pattern and boundary evidence**, not production exemplars. Do not reuse preview lesson text, items, or visuals verbatim in shipped lessons.

**What previews were:** A parallel, client-only authoring subsystem (`apps/learner-web/src/app-native/`) with `status: 'internal-preview'`, `LessonRenderer`, typed visual contracts, and a local validation gate (`scripts/validate-app-native.mjs`). They were visual-authoring pilots, not server-authoritative lesson runtime deliveries.

## 2. Catalog (14 lessons)

| Slug | Lesson ID | Content version | Wave | Sections | KC entries (`previewCoverage`) | Script lines |
|------|-----------|-----------------|------|----------|--------------------------------|--------------|
| `redox-v2` | V3-LES-329622 | app-native-redox-v2.2.0-review-flow | 1 bespoke | custom node graph | 1 × complete-review-focus | 591 |
| `optics-v2` | V3-LES-443492 | app-native-optics-v2.2.0-review-flow | 1 bespoke | custom node graph | 1 complete + 4 boundary-map-only | 595 |
| `research-design` | V3-LES-765609 | app-native-research-v2.1.0-review-flow | 1 template | 5 (`buildSectionNodes`) | 5 × complete-review-focus | 1512 |
| `associative-learning` | V3-LES-225658 | app-native-associative-v2.1.0-review-flow | 1 template | 4 | 4 × complete-review-focus | 1227 |
| `argument-structure` | V3-LES-386478 | app-native-argument-v2.1.0-review-flow | 1 template | 3 | 3 × complete-review-focus | 1044 |
| `scientific-notation` | **V3-LES-789208** | app-native-notation-v1.0.0 | 2 factory | 1 | 1 complete + 3 boundary-map-only | 257 |
| `graphs-slopes` | **V3-LES-844372** | app-native-graphs-v1.0.0 | 2 factory | 1 | 1 complete + 2 boundary-map-only | 256 |
| `reason-with-models` | V3-LES-275615 | app-native-models-v1.0.0 | 2 factory | 1 | 1 complete + 2 boundary-map-only | 256 |
| `warranted-conclusions` | V3-LES-128144 | app-native-conclusions-v1.0.0 | 2 factory | 1 | 1 complete + 3 boundary-map-only | 269 |
| `periodic-trends` | V3-LES-263440 | app-native-periodic-trends-v1.0.0 | 2 factory | 1 | 1 complete + 4 boundary-map-only | 287 |
| `molecular-geometry` | V3-LES-623852 | app-native-geometry-v1.0.0 | 2 factory | 1 | 1 complete + 3 boundary-map-only | 262 |
| `stoichiometry` | V3-LES-915978 | app-native-stoichiometry-v1.0.0 | 2 factory | 1 | 1 complete + 3 boundary-map-only | 291 |
| `equilibrium-shifts` | V3-LES-315313 | app-native-equilibrium-v1.0.0 | 2 factory | 1 | 1 complete + 4 boundary-map-only | 255 |
| `energy-conservation` | V3-LES-338400 | app-native-energy-v1.0.0 | 2 factory | 1 | 1 complete + 3 boundary-map-only | 262 |

Wave 1 (5): hand-authored node graphs or multi-section `LessonSectionAuthoring` arrays.
Wave 2 (9): `buildAppNativeLesson()` factory (`authoring-helpers.ts`) — one section each, compact specs.

**ID collision warning:** `scientific-notation` and `graphs-slopes` reuse production baseline lesson IDs (`V3-LES-789208`, `V3-LES-844372`) with different `contentVersion` strings. Any anchor or eval citing these IDs must include content hash / version, never slug alone.

## 3. Shared architecture (structural observations)

### 3.1 Authoring contract

- `contract.ts` (`7490cb9:…/contract.ts:1-7`, `210-237`): Explicitly excludes planner decisions and mastery claims. `LessonScriptPreview` tracks instructional node IDs (model, practice, exit, repair) but has **no evidence, mastery, scoring authority, or `content_sha256` fields**.
- `previewCoverage` enum (`contract.ts:14`): `'complete-review-focus' | 'boundary-map-only'`. Wave 2 lists sibling KCs as boundary-only on intro lesson-map visuals without corresponding teaching sections.

### 3.2 Section screen rhythm (reusable template)

`section-authoring.ts` (`7490cb9:…/section-authoring.ts:104-227`) defines a fixed 11-screen KC sequence:

1. starting-check → 2. model → 3. understanding-check → 4. worked → 5. guided → 6. reduced-support → 7. independent → 8. exit-near → 9. exit-changed → 10. repair (latent) → 11. recap

Progress groups: `learn` (1–4, 11), `practice` (5–7), `check` (8–10). Primary action labels fade support (“Practice with guidance” → “Try independently” → “Try a changed task”).

### 3.3 Renderer behavior

- Linear screen advance via `continueLesson()` (`LessonRenderer.tsx:1118-1122`); `allowBackReview: true` on most presentations.
- Repair gating: `shouldShowRepair()` inserts repair screens when any linked source question (independent / near / changed) is submitted incorrect (`LessonRenderer.tsx:125-145`).
- **No fresh re-entry item** after repair: `RepairScreen` primary action is always `Continue` to the next authored screen (recap), not a new scored check (`LessonRenderer.tsx:906-936`, `section-authoring.ts:214-220`).
- `repairNodeId` optional on question nodes (`contract.ts:165`) is **authored in redox** (`redox-v2.script.ts:440,485,530`) but **never read by `LessonRenderer`** — dead routing metadata.
- Persistence: `localStorage` only (`LessonRenderer.tsx:71-72,1054-1055`); `onIndependentMiss` callback fires option ID only, with comment “count-only signal for Today's Path; no mistake content is stored” (`LessonRenderer.tsx:1105-1111`).
- Post-commitment MCQ feedback: per-option string + shared `explanation`; generic correct heading `'That trace works.'` unless overridden (`LessonRenderer.tsx:886-894`).

### 3.4 Visual system

- Typed data-only visuals: `redox-carrier`, `accounting`, `boundary`, `optics-rays` (step enum), `lesson-map`, `relations`, `passage` (`contract.ts:23-120`).
- Every visual requires `alt` + `textEquivalent`; optional `caption` (`contract.ts:17-21`).
- Optics progressive disclosure: explanation screens swap `OpticsRayVisualPreview.step` (`geometry` → `first-ray` → …) — learner advances with Continue, no manipulative interaction (`optics-v2.script.ts:22-26`, model nodes ~180+).
- Passage / relation visuals in CARS/psych lessons support sentence-level focus and lane diagrams (`argument-structure.script.ts` passage helpers; `associative-learning.script.ts:149-173`).

### 3.5 Validation gate (thin)

`validate-app-native.mjs` checks: script/presentation pair integrity, MCQ correct option exists, every option has feedback. **No** transfer, repair-path, accessibility, or mastery checks (`7490cb9:…/validate-app-native.mjs:1-42`).

### 3.6 Responsive / a11y shell patterns

- Skip link, heading focus on navigation, `fieldset`/`legend` for MCQs, `role="progressbar"`, theme toggle with `aria-label` (`LessonRenderer.tsx`).
- CSS: touch min-heights via `--mc-touch`, `@media (max-width: 520px)` and `(max-width: 360px)` padding/type adjustments, `prefers-reduced-motion: reduce` global dampening (`app-native.css:889,896-920,1004-1040`).
- **Not evidenced:** keyboard-only branch matrix, VoiceOver receipt, 200% zoom traces, construct-equivalence review.

## 4. Thinness and KC coverage gaps

| Pattern | Evidence | Rubric risk |
|---------|----------|-------------|
| Wave 2 single-section lessons | All 9 factory lessons: `sections: [oneSection]` | Teaches one KC deeply; listed KCs mostly unaddressed |
| `boundary-map-only` KCs | e.g. `scientific-notation.script.ts:209-227`, `optics-v2.script.ts:54-80` | Intro lesson-map labels future boundaries only |
| Optics lesson-map screen | `optics-v2.script.ts:127-168` | Four sibling optics KCs visible but not taught in lesson |
| Estimated 13 min / 11 screens × 1 section | `buildAppNativeLesson` defaults | Pacing may compress teaching for multi-KC lesson titles |
| Redox custom graph | Many `stage: 'guided'` nodes (`redox-v2.script.ts:115+`) | Support fade labels exist but several “guided” stages remain high-support |

Wave 1 multi-section lessons (argument 3, associative 4, research 5) align better with multi-KC `complete-review-focus` declarations.

## 5. Rubric dimension map — candidate anchor examples

All proposals remain `CANDIDATE_PENDING_REVIEW`. Evidence status for rendered gate dimensions is **`BLOCKED`** (no revision-bound browser bundle existed for previews).

### Authored Content Gate

#### LQR-C01 — Transfer validity

| Verdict | Candidate | Source | Rationale |
|---------|-----------|--------|-----------|
| **PASS (boundary)** | Changed task switches operation while preserving KC | `scientific-notation.script.ts:159-170` (`changed` question): division near → multiplication estimate changed | Exponent-rule construct preserved; situation changes substantively |
| **FAIL** | Cosmetic-only transfer (hypothetical) | N/A in previews — redox/optics changed tasks alter bond labels / ray setups | Use as contrast: previews attempt substantive changed exits |
| **BOUNDARY** | Changed task introduces estimation where prior section taught exact arithmetic | `scientific-notation.script.ts:159-170` | SME must judge whether estimation is in-scope for notation KC or hidden prerequisite |

#### LQR-C02 — Instructional adequacy

| Verdict | Candidate | Source | Rationale |
|---------|-----------|--------|-----------|
| **PASS (boundary)** | Multi-section psych lesson teaches each declared KC | `associative-learning.script.ts:86+` (4 sections), all KCs `complete-review-focus:1165-1186` | Each KC gets full 11-node sequence |
| **FAIL** | Lesson title/KC list implies breadth; one section teaches one KC | Wave 2 pattern, e.g. `periodic-trends.script.ts:233-257` + single `trendsSection` | Boundary-map KCs never receive model/practice/exit |
| **BOUNDARY** | Lesson-map explains boundaries without teaching sibling KCs | `optics-v2.script.ts:127-168` | Honest scope labeling vs instructional adequacy for full lesson ID |

#### LQR-C03 — Distractor and error-model quality

| Verdict | Candidate | Source | Rationale |
|---------|-----------|--------|-----------|
| **PASS (boundary)** | Four-option sets with per-option misconception feedback | `authoring-helpers.ts:46-72` (`question()`), enforced by `validate-app-native.mjs:30-36` | Plausible confusions named in feedback tuples |
| **FAIL** | (Not isolated) — would require defensible distractor audit per item | — | Previews generally attempt plausible distractors; no gold without SME |
| **BOUNDARY** | Option-length / grammar parity unverified | MCQ structure only | Presentation parity not machine-checked |

#### LQR-C04 — Prompt clarity

| Verdict | Candidate | Source | Rationale |
|---------|-----------|--------|-----------|
| **PASS (boundary)** | Explicit operation + supplied representation on MCQs | `periodic-trends.script.ts:40-66` starting question | Clear axis comparison ask |
| **FAIL** | (Not demonstrated as blocking in sampled scripts) | — | Passage-based items add prose load by design (`argument-structure.script.ts` passage visual) |
| **BOUNDARY** | Passage length vs construct difficulty | `argument-structure.script.ts:25-80` (`ANCHOR_PARAGRAPHS` structure) | CARS construct vs prose complexity line |

#### LQR-C05 — Repair quality

| Verdict | Candidate | Source | Rationale |
|---------|-----------|--------|-----------|
| **PASS** | — | — | **No preview implements fresh re-entry** |
| **FAIL** | Repair → Continue → recap; no uncontaminated re-check | `section-authoring.ts:214-220`, `LessonRenderer.tsx:906-936,1118-1122` | Violates “fresh re-entry item re-checks exact function” |
| **BOUNDARY** | Targeted repair copy exists (strategy + checkYourThinking) | `scientific-notation.script.ts:171-180`, `RepairScreen` | Good support text undermined by missing re-entry |

#### LQR-C06 — DOK appropriateness

| Verdict | Candidate | Source | Rationale |
|---------|-----------|--------|-----------|
| **PASS (boundary)** | Fade sequence ending in independent + near + changed | `section-authoring.ts:59-68` node suffixes | Scaffold → unsupported use intent |
| **FAIL** | Recognition-heavy starting checks without later depth (possible in thin wave 2) | Single-section factory | All stages present but compressed |
| **BOUNDARY** | Redox retains multiple `stage: 'guided'` near exits | `redox-v2.script.ts:364+` | DOK label vs support level mismatch |

### Rendered Experience Gate

#### LQR-X01 — Presentation-to-UI fidelity

| Verdict | Candidate | Source | Rationale |
|---------|-----------|--------|-----------|
| **PASS (boundary)** | Authored visuals render through typed components | `LessonRenderer.tsx:723-740` (`LessonVisual` switch) | No raw HTML strings |
| **FAIL** | Authored `repairNodeId` per question not honored in UI | `redox-v2.script.ts:440` vs `LessonRenderer.tsx` (no `repairNodeId` usage) | Renderer drops authored routing |
| **BLOCKED** | Full fidelity proof | — | No presentation-plan JSON / server run-view for previews |

#### LQR-X02 — Cognitive focus, pacing, visual clarity

| Verdict | Candidate | Source | Rationale |
|---------|-----------|--------|-----------|
| **PASS (boundary)** | One primary action per screen; progress groups | `section-authoring.ts:148-227`, `LessonRenderer.tsx:1148-1163` | learn/practice/check labeling |
| **FAIL** | Redox bespoke presentation: many consecutive visual-model screens | `presentations.ts:23-80+` | Potential low-value Continue chains |
| **BOUNDARY** | Intro screen excluded from step counter | `LessonRenderer.tsx:1149-1152` (`screens.length - 1`) | Progress math may confuse |

#### LQR-X03 — Feedback and scaffolding quality

| Verdict | Candidate | Source | Rationale |
|---------|-----------|--------|-----------|
| **PASS (boundary)** | Post-commitment per-option + explanation | `LessonRenderer.tsx:856-894` | Not pre-revealed |
| **FAIL** | Generic correct praise | `'That trace works.'` default (`LessonRenderer.tsx:889`) | Thin consequential reinforcement |
| **BOUNDARY** | Pre-submit `help` in `<details>` | `LessonRenderer.tsx:865-870` | Low-stakes hint vs consequential item rules |

#### LQR-X04 — Meaningful interaction and representation

| Verdict | Candidate | Source | Rationale |
|---------|-----------|--------|-----------|
| **PASS (boundary)** | MCQ + visual context on questions | `QuestionScreen` visual card (`LessonRenderer.tsx:828-831`) | Representation supports operation |
| **FAIL** | Optics ray steps are display states, not learner manipulation | `optics-v2.script.ts` step visuals + Continue-only explanation screens | Decorative progression / busy Continue |
| **BOUNDARY** | Relation/passage visuals static but cognitively load-bearing | `associative-learning.script.ts:149-173` | Static OK when operation is select/compare |

#### LQR-X05 — Accessibility and construct equivalence

| Verdict | Candidate | Source | Rationale |
|---------|-----------|--------|-----------|
| **PASS (boundary)** | Required `alt` + `textEquivalent` on all visual kinds | `contract.ts:17-21` | Author-time equivalence hook |
| **FAIL** | No Safari/VoiceOver or keyboard branch evidence | — | Blocking gate cannot pass |
| **BOUNDARY** | Semantic MCQ structure + heading focus | `LessonRenderer.tsx:838-855,1100-1102` | Partial pattern only |

#### LQR-X06 — Responsive behavior, recovery, and branch completion

| Verdict | Candidate | Source | Rationale |
|---------|-----------|--------|-----------|
| **PASS (boundary)** | localStorage resume + reset | `LessonRenderer.tsx:114-123,1127-1130` | Client checkpoint only |
| **FAIL** | No server revision integrity; refresh trusts local JSON | `readRuntime()` (`LessonRenderer.tsx:114-123`) | Not authoritative persistence |
| **BLOCKED** | 320/375/200% branch matrix | CSS hints only (`app-native.css:896-1028`) | No captured traces |

## 6. Evidence / mastery metadata absence

Previews lack entirely:

- lesson-evidence-mastery-contract bindings;
- server-side protected scoring;
- branch-matrix / browser-evidence bundle (rubric §8);
- `content_sha256` identity;
- planner handoff on repeated repair failure.

Any rubric evaluation of previews would be **`BLOCKED`** at preconditions (rubric §2.2) or X05/X06 for missing evidence.

## 7. Recommended anchor sourcing policy

1. **Do extract:** screen-rhythm template, visual contract shape (`alt`/`textEquivalent`), MCQ feedback tuple pattern, progress-group UX, lesson-map boundary labeling pattern.
2. **Do not extract:** item text, passage content, diagram labels, or feedback prose — rights and collision risk.
3. **Prefer FAIL/BLOCKED candidates from:** repair-without-re-entry (C05), boundary-map-only KC gap (C02), ID collision cases, renderer ignoring `repairNodeId` (X01).
4. **Prefer PASS/BOUNDARY candidates from:** section-authoring fade labels (C06/X02), per-option feedback structure (C03), substantive changed-task shape (C01) — always as structural excerpts with SME review.
5. **Never treat as production parity:** `internal-preview` status, localStorage runtime, empty post-retirement catalog (`e70c722:apps/learner-web/src/app-native/index.ts`).

## 8. Verification

- Rubric v0.4 and anchor catalog v0.1-draft read from workspace HEAD.
- All 14 scripts confirmed present at `7490cb9:apps/learner-web/src/app-native/*.script.ts` via `APP_NATIVE_LESSONS` in `7490cb9:apps/learner-web/src/app-native/index.ts:47-68`.
- Retirement scope confirmed in commit messages `e70c722`, `52872e5`.
- No product files modified except this report.

---

**Analysis author:** overnight historical review agent
**Next step for anchor catalog:** Human SME adjudication of cited line ranges; synthetic variants for isolated FAIL cases where excerpts bundle defects.
