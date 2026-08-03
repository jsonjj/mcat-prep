# Lesson Quality Rubric — T+8 Human Decision Packet

**Status:** OWNER DECISIONS RECORDED — CANDIDATE STANDARD AND POLICY LINES APPROVED
**Subject:** Rubric v0.9.1 documentation foundation
**Decision time:** 2026-08-03 10:01 UTC-5

## Owner decision record

- **Decision A:** `APPROVE_CANDIDATE_STANDARD`, preserving every documented blocker
  and nonclaim.
- **Decision B:** keep `NOVICE_WALKTHROUGH_REVIEWER` for v0.9.1; reconsider naming
  before implementation.
- **Decision C:** keep Kaplan rights status `PENDING`; use only private comparative
  notes, not stored fixtures or model calibration.
- **Decision D:** accept the 36 anchor designs as provisional explanatory examples
  only; they have no gold or calibration authority.
- **Decisions E–G:** deferred as recommended; no implementation authority granted.
- **Follow-up calibration (2026-08-03):** approved the proposed pass/fail/boundary
  policy line for all 12 dimensions without changes. This does not promote an anchor,
  supply a specialist receipt, or authorize a calibration run.

## 1. What is ready

- Canonical rubric v0.9.1 with 12 operational dimensions.
- Candidate anchor catalog with one clear-pass design, clear-fail design, and boundary
  design per dimension.
- Author, judge, evidence, and calibration protocols.
- Safe documentation-only future-agent context index.
- Rights-safe source analyses from current lessons, specs, historical previews,
  research drafts, and Kaplan.
- Independent pedagogy, judge, accessibility, and traceability reviews.

The foundation is documentation, not software. No judge service, controller, browser
harness, CI gate, gold anchor, reviewer receipt, or automated approval exists.

## 2. Recommended immediate decision

### Decision A — Accept the foundation as a candidate standard

**Recommendation:** Approve rubric v0.9.1 and its protocols as the documentation
standard for future supervised lesson drafting, while retaining all explicit blockers.

Approval means:

- Future agents may use the rubric to self-audit and receive structured judge
  recommendations.
- The author/judge/revision workflow is the preferred documented process.
- `PASS` remains a recommendation, never human approval.
- Candidate examples remain hypotheses; they are not gold or calibration authority.

Approval does **not** authorize:

- automatic lesson approval or registration;
- materializing or gold-labeling anchors without reviewers;
- claims of efficacy, mastery, readiness, rights clearance, or score improvement;
- app, runtime, CI, browser, or database implementation; or
- reuse of restricted source material.

**Owner response:** `APPROVE_CANDIDATE_STANDARD`

**Notes:** Approval preserves every documented blocker and nonclaim.

## 3. Decisions safe to defer

These do not block the foundational documentation and should remain open unless the
owner wants to decide now.

### Decision B — Novice reviewer name

Current canonical role: `NOVICE_WALKTHROUGH_REVIEWER`.

Binding behavior already decided: the reviewer must not have authored or previously
walked the route and must not hold the target KC. If unavailable, X02 remains
`BLOCKED`; a domain expert cannot substitute.

Options:

- Keep `NOVICE_WALKTHROUGH_REVIEWER` for v0.9.1. **Recommended:** avoids broad naming
  churn; behavior is explicit.
- Rename later to `PROXY_LEARNER_REVIEWER` before implementation.

### Decision C — Kaplan rights disposition

Current status: `PENDING`; `RIGHTS_REVIEWER` unassigned.

Recommendation: retain Kaplan only as private comparative research notes. Do not use
it in stored model-calibration fixtures or external distribution until a rights
reviewer records permission.

### Decision D — Candidate anchors

Current state:

- 36 candidate designs.
- All `actual_verdict_on_available_evidence: BLOCKED`.
- 23 designs are unmaterialized.
- No gold verdict or receipt exists.

Recommendation: treat them as explanatory examples only. Materialization and human
gold adjudication belong to a later calibration project.

### Decision E — Calibration thresholds

Cases per dimension, false-pass ceiling, repeatability, reviewer agreement, and
adjudication thresholds cannot be set responsibly before materialized gold examples
exist.

Recommendation: defer.

### Decision F — Reviewer staffing

Future gold examples and lesson approvals require named product/pedagogy, domain,
accessibility, novice/proxy, reliability, blind-solve, and rights roles under the
rubric's trigger matrix.

Recommendation: identify people before the first real lesson-generation review, not
for this documentation foundation.

### Decision G — `PREREQUISITE_SUPPORT`

Current status: route applicability remains an explicit blocker where no authoritative
route proof or absence proof exists.

Recommendation: defer to the future lesson/runtime implementation project.

## 4. Explicitly out of scope

- Generating or editing lessons
- Modifying app/mastery/runtime/UI
- Automated judging or revise loops
- Browser/accessibility capture tooling
- CI or registration enforcement
- Database lesson storage
- Learner-outcome validation

## 5. Human review checklist

- [x] The rubric's 12 dimensions reflect the intended definition of a very good lesson.
- [x] `FAIL > BLOCKED > PASS` and no score averaging match product intent.
- [x] Route-relative adequacy and low-stakes discovery match product intent.
- [x] Human final authority is preserved.
- [x] Candidate examples are clearly non-gold.
- [x] Kaplan and external sources remain rights-restricted.
- [x] Open decisions may safely remain deferred.
- [x] Rubric v0.9.1 is accepted as the candidate documentation standard.
