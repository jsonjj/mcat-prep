# V3 Lesson Quality: Derived Calibration Matrix & Analysis

**Status:** INTERNAL DRAFT — SOURCE ANALYSIS, NOT A CURRENT-VERSION DERIVATION
**Scope:** Derived calibration matrix based on V3 lesson architecture, quality rubric, and structural authoring specifications. Sources are internal repository artifacts.

> **Currency notice** (added 2026-08-03, cross-document correction wave). This analysis was
> written against an earlier rubric draft and is preserved as written. **The current
> standard is rubric `0.9.1` with anchor-set `0.9.1-candidate`.** Criterion wording,
> dimension boundaries, required evidence, and reviewer-role names have changed since.
> Nothing below has been re-derived against `0.9.1`; where this file and the rubric differ,
> the rubric governs. The authority ordering stated in §1 remains correct and is reinforced
> by the current rubric §1: the validator governs structure, the mastery contract governs
> evidence meaning, and the rubric governs lesson quality.

## 1. Authority Boundaries and Calibration Limits

To evaluate lesson quality safely and accurately, we must strictly distinguish normative authority from candidate design text, and recognize the limits of author-time claims.

### Normative Authority vs. Stale Candidate Text
*   **Current quality specification:** `key-docs/lesson-quality-rubric.md` is the controlling non-enforcing quality draft for this calibration work. `docs/design/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md` is the machine-enforced structural contract (R1–R15).
*   **Stale/Candidate Text:** `docs/design/04-V3-LESSON-AUTHORING-QUALITY-AND-UI.md` is a source of design requirements, *not* an executable gate. Where it disagrees with the rubric or structural spec, the rubric and validator win.
*   **Fixtures:** Lessons 1–3 serve as the initial calibration set but are *not* grandfathered or presumed to pass. Synthetic failing anchors must isolate and change exactly *one* blocking fact. (Note: The previously suspected Lesson 3 role-mislabelling is an invalid anchor, as it was an intentionally authored re-entry).

### Confident vs. Provisional Criteria
*   **Confident (Enforceable Now):** Structural completeness (R1–R15), WCAG 2.2 AA compliance, presence of required node kinds, exact file hashes, and the absence of out-of-scope content (e.g., beyond-ceiling clinical material).
*   **Provisional (Requires Learner Validation):** Efficacy, mastery calibration, capstone irreducibility, hard-edge necessity, and representation readiness. Passing the rubric does *not* establish these claims (`lesson-quality-rubric.md`, L32-34).

---

## 2. The 12-Dimension Calibration Matrix

### Authored Content Gate

#### LQR-C01 — Transfer validity
*   **Reviewer Role:** MCAT/domain SME
*   **Claim Limit:** Validates structural transfer; does not establish empirical efficacy or BKT eligibility (which requires explicit `TRANSFER` licensing).
*   **Pass Example:** A changed task that preserves the KC and reasoning construct but changes the situation substantively (e.g., new molecule) without introducing untaught prerequisites.
*   **Fail Anti-pattern:** Only names or numbers changed; tests a different skill; hidden knowledge required; answer cued by administration.
*   **Boundary Case:** A task that changes context but borders on testing reading comprehension rather than the target construct. (Must isolate the blocking line).
*   **Exact Ref:** `key-docs/lesson-quality-rubric.md` L167-204; `docs/design/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md` L111-120.

#### LQR-C02 — Instructional adequacy
*   **Reviewer Role:** Product Owner, MCAT/domain SME
*   **Claim Limit:** Verifies the route teaches what it requires; does not prove the teaching is effective for all learners.
*   **Pass Example:** Standard route teaches governing idea, operations, boundaries; guided work fades support toward independent use.
*   **Fail Anti-pattern:** Tests an untaught idea; explanation is just answer narration; guided practice is just "continue" clicks.
*   **Boundary Case:** Pre-instruction entry prompt (Allowed if low-stakes, honest abstention, no mastery impact, and followed by teaching).
*   **Exact Ref:** `key-docs/lesson-quality-rubric.md` L205-246.

#### LQR-C03 — Distractor and error-model quality
*   **Reviewer Role:** MCAT/domain SME
*   **Claim Limit:** Ensures distractors are plausible and definitively wrong; does not prove they perfectly diagnose learner misconceptions.
*   **Pass Example:** Incorrect options represent plausible confusions; feedback identifies first invalid step without overstating cause.
*   **Fail Anti-pattern:** Defensible incorrect option; absurd distractors; correct answer signaled by grammar/length.
*   **Boundary Case:** Distractor that is technically wrong but relies on an obscure convention not explicitly taught.
*   **Exact Ref:** `key-docs/lesson-quality-rubric.md` L247-282.

#### LQR-C04 — Prompt clarity
*   **Reviewer Role:** MCAT/domain SME, Product Owner
*   **Claim Limit:** Ensures difficulty comes from the construct, not prose; does not guarantee 100% learner comprehension.
*   **Pass Example:** Learner operation explicit; all necessary facts supplied; exactly one defensible answer.
*   **Fail Anti-pattern:** Reasonable readers answer different questions; missing units/labels; prose complexity causes difficulty.
*   **Boundary Case:** Localized typo or awkward sentence (Non-blocking if it doesn't change interpretation or accessibility).
*   **Exact Ref:** `key-docs/lesson-quality-rubric.md` L283-323.

#### LQR-C05 — Repair quality
*   **Reviewer Role:** Product Owner, MCAT/domain SME
*   **Claim Limit:** Verifies bounded support and fresh check; does not prove the repair actually fixes the learner's gap.
*   **Pass Example:** Repair targets exact failed function; support teaches without revealing fresh answer; fresh item re-checks function.
*   **Fail Anti-pattern:** Restarts whole unit; reuses exposed content; loops or strands learner.
*   **Boundary Case:** Repair that provides slightly too much scaffolding but still requires a fresh independent check.
*   **Exact Ref:** `key-docs/lesson-quality-rubric.md` L324-360; `research/lesson-defense.md` L76-86.

#### LQR-C06 — DOK appropriateness and distribution
*   **Reviewer Role:** MCAT/domain SME, Product Owner
*   **Claim Limit:** Verifies depth matches KC and phase; does not validate that the DOK label ensures empirical transfer.
*   **Pass Example:** Depth target justified by KC; lower-DOK scaffolding builds to independent performance; changed tasks require genuine application.
*   **Fail Anti-pattern:** Remains at recognition despite application objective; claimed high-DOK is just difficult recall.
*   **Boundary Case:** Task requiring multiple steps of recall, bordering on application but lacking true strategic selection.
*   **Exact Ref:** `key-docs/lesson-quality-rubric.md` L361-396; `research/lesson-defense.md` L376-393.

### Rendered Experience Gate

#### LQR-X01 — Presentation-to-UI fidelity
*   **Reviewer Role:** Product Owner
*   **Claim Limit:** Verifies renderer preserves instructional meaning; does not mandate literal screen parity with presentation plan.
*   **Pass Example:** All required teaching, directions, and response formats reach learner; UI labels consistent with route.
*   **Fail Anti-pattern:** Required teaching omitted; raw internal ID exposed; UI cannot submit authored response type.
*   **Boundary Case:** Layout changes that group two authored screens into one (Passes if meaning/focus preserved).
*   **Exact Ref:** `key-docs/lesson-quality-rubric.md` L403-446.

#### LQR-X02 — Cognitive focus, pacing, and visual clarity
*   **Reviewer Role:** Product Owner, Accessibility Reviewer
*   **Claim Limit:** Ensures manageable cognitive load per screen; does not prove optimal pacing for all learners.
*   **Pass Example:** One primary cognitive job per screen; required teaching visible; pacing permits pause at boundaries.
*   **Fail Anti-pattern:** Multiple competing jobs; required teaching buried; decorative content competes with construct.
*   **Boundary Case:** Visual polish defects (Non-blocking unless they harm clarity, trust, focus, or accessibility).
*   **Exact Ref:** `key-docs/lesson-quality-rubric.md` L447-489.

#### LQR-X03 — Feedback and scaffolding quality
*   **Reviewer Role:** Product Owner, MCAT/domain SME
*   **Claim Limit:** Verifies feedback advances understanding; does not prove it fully resolves the misconception.
*   **Pass Example:** Correctness communicated after commitment; miss feedback identifies observable error; support gives usable cue.
*   **Fail Anti-pattern:** Generic praise on consequential item; explanation performs all future reasoning; hints reveal fresh answer.
*   **Boundary Case:** Low-stakes entry feedback that is brief (Allowed when subsequent instruction supplies full model).
*   **Exact Ref:** `key-docs/lesson-quality-rubric.md` L490-533.

#### LQR-X04 — Meaningful interaction and representation
*   **Reviewer Role:** Product Owner, MCAT/domain SME, Accessibility Reviewer
*   **Claim Limit:** Ensures interactions make cognitive work inspectable; does not mandate an interaction quota per KC.
*   **Pass Example:** Learner must predict/select/construct relevant to KC; static presentation used when interaction adds no value.
*   **Fail Anti-pattern:** Decorative interaction; compulsory busywork; visual treatment cues correct answer.
*   **Boundary Case:** Replacing an interaction with "Continue" (Acceptable only if no meaningful cognitive work/feedback is lost).
*   **Exact Ref:** `key-docs/lesson-quality-rubric.md` L534-578.

#### LQR-X05 — Accessibility and construct equivalence
*   **Reviewer Role:** Accessibility Reviewer, MCAT/domain SME
*   **Claim Limit:** Ensures WCAG 2.2 AA and construct-equivalent alternatives; does not guarantee perfect usability for all assistive tech.
*   **Pass Example:** Keyboard-operable without traps; 200% zoom reflows without horizontal scroll; alternatives preserve target operation.
*   **Fail Anti-pattern:** Focus lost/trapped; alternative supplies information the original task requires learner to derive.
*   **Boundary Case:** Target size slightly under 48px but meets WCAG minimum (Requires documented exception).
*   **Exact Ref:** `key-docs/lesson-quality-rubric.md` L579-631.

#### LQR-X06 — Responsive behavior, recovery, and branch completion
*   **Reviewer Role:** Product Owner
*   **Claim Limit:** Verifies usability across viewports and interruptions; does not prove zero-latency performance.
*   **Pass Example:** Primary screens work at required widths (375px, 320px); pause/refresh restores exact authoritative checkpoint.
*   **Fail Anti-pattern:** Controls clipped; interruption loses responses; error state spins indefinitely.
*   **Boundary Case:** Minor layout shift on 320px that requires vertical scrolling but no horizontal scrolling and doesn't obscure controls.
*   **Exact Ref:** `key-docs/lesson-quality-rubric.md` L632-675.

---

## 3. Recommendations for Simplification

To streamline the rubric without losing distinct quality questions, consider the following structural consolidations:

1.  **Merge LQR-X01 (Presentation-to-UI fidelity) and LQR-X02 (Cognitive focus):** Both dimensions evaluate the translation of the presentation plan to the screen. They can be combined into a single "Rendered Fidelity and Focus" dimension, ensuring that the UI preserves instructional meaning without overloading cognitive capacity.
2.  **Merge LQR-C03 (Distractor quality) and LQR-C04 (Prompt clarity):** Both deal with ensuring the item tests the intended construct without cueing or ambiguity. Combine into a single "Item Construct Validity" dimension.
3.  **Automate LQR-X06 (Responsive behavior/recovery):** Shift this entirely to the automated integration test suite (Chromium profiles). Since it is largely deterministic (viewport clipping, network recovery, branch termination), it does not require qualitative LLM/human judgment and can act as a strict CI gate rather than a rubric dimension.
