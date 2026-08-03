# Rubric Authority Resolutions for the v0.9 Rewrite

**Status:** CONTROLLING RUN DECISIONS
**Date:** 2026-08-03
**Basis:** Approved plan decisions, current structural/mastery authority, and the
independent consistency audit

These decisions resolve the four Critical ambiguities identified in
`rubric-consistency-audit.md` without requiring an early human interruption. They
preserve prior owner decisions: pass/fail per dimension, no composite average,
route-relative adequacy, and missing evidence fails closed.

## 1. Canonical evaluation result and precedence

The only dimension verdicts are:

- `FAIL` — revision-bound evidence demonstrates at least one blocking defect.
- `BLOCKED` — no blocking defect is demonstrated, but required evidence is missing,
  stale, contradictory, unbound to the revision, or awaiting a required human role.
- `PASS` — no blocking defect is demonstrated and all required evidence is complete.

Precedence is:

```text
FAIL > BLOCKED > PASS
```

A proven blocking defect is never hidden by missing evidence. `REVISE` is a workflow
instruction after `FAIL`, not an evaluation verdict. “Critical” means blocking;
“minor” means non-blocking. Other severity labels cannot alter the verdict.

Every dimension result uses:

```text
dimension_id
applicability
evaluation_verdict
blocking_findings[]
non_blocking_findings[]
evidence_refs[]
blocker_refs[]
required_remediation[]
required_human_roles[]
human_decision
```

The rubric remains documentation-only and does not define or replace the structural
`lesson-quality-report.json` wire schema.

## 2. Anchor source readiness versus adjudication readiness

Candidate anchors use two separate statuses:

```text
source_inspection_status:
  PRESENT | MISSING | STALE | CONTRADICTORY

adjudication_evidence_status:
  NOT_REVIEWED | RECEIPTS_COMPLETE | BLOCKED
```

`PRESENT` means the cited source can be inspected; it does not mean the proposed
verdict is confirmed. Only `RECEIPTS_COMPLETE` can support a gold verdict.

The existing candidate fixture remains candidate-only and receipt-free. A separate
future adjudicated-anchor record may contain gold verdicts and receipts. The v0.9
documentation can identify provisional examples but cannot infer any human approval.

## 3. Instructional transfer versus mastery eligibility

LQR-C01 judges whether a changed task preserves the instructional construct while
changing the situation substantively.

That judgment is independent of BKT/evidence eligibility:

- The rubric never infers mastery eligibility from `CHANGED_EXIT`, a transfer claim,
  a reasoning operation, or an authored assistance affordance.
- The Lesson → Evidence → Mastery Contract alone determines whether a particular
  accepted runtime response can move `pL` or create an evidence record.
- Volatile binding counts and current runtime capabilities are implementation status,
  not durable rubric criteria.

The rubric may say a task is a valid instructional-transfer example while making no
claim that the response qualifies for BKT.

## 4. Route universe and applicability authority

The rubric route universe is:

```text
STANDARD
CONCISE
MISCONCEPTION
PREREQUISITE_SUPPORT
```

The structural route-proof record is the sole applicability authority:

- `APPLICABLE` — evaluate the route under every relevant dimension.
- `NOT_APPLICABLE` — requires an explicit, authoritative absence proof.
- `BLOCKED` route applicability — requires a named blocker and blocks lesson-level
  quality approval while the route is required.
- Missing route proof blocks lesson-level quality approval.

The current three-lane structural validator is a baseline structural check, not proof
that `PREREQUISITE_SUPPORT` is absent or complete.

## 5. Dimension ownership and non-counting cross-references

Retain all 12 dimensions for v0.9. Assign each root cause once:

- C03 owns keys, distractors, and authored observable-error mappings.
- C04 owns prompts, directions, ambiguity, and ability to express a valid response.
- C05 owns the authored repair graph and fresh re-entry design.
- X03 owns delivered post-commitment feedback, support presentation, and focus.
- X01 owns semantic authored-to-rendered fidelity.
- X02 owns cognitive focus, pacing, hierarchy, and competing chrome.
- X05 owns accessibility semantics and construct equivalence.
- X06 owns state persistence, recovery, termination, and responsive completion.

Other dimensions may record non-counting impacts but must not create duplicate
blocking findings for the same root defect.

## 6. Accessibility thresholds

- Applicable WCAG 2.2 AA success criteria are blocking.
- Construct equivalence is blocking when an alternative route changes the operation or
  evidence meaning.
- The product 48 CSS px touch target is a preferred product standard. Missing it is
  non-blocking when WCAG target-size/spacing rules pass and no observed usability or
  focus defect exists; it becomes blocking when those conditions fail.
- Use the namespaces `evaluation_verdict`, `route_applicability`, and
  `runtime_terminal_disposition` to avoid overloading `BLOCKED`.

## 7. Rewrite authorization

With these resolutions, a single scribe may begin the v0.9 rubric rewrite after the
remaining source analyses arrive. The scribe must:

- use one result algorithm;
- use the split anchor readiness statuses;
- preserve mastery authority boundaries;
- define the four-route universe;
- give every card identical operational subheadings;
- add observable decision rules and one non-blocking boundary per card; and
- move implementation/harness blueprints into protocols rather than the rubric.
