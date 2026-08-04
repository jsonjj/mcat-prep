# Candidate-Only Lesson Authoring Workflow

This workflow applies only to the immutable teammate generation kit. It does not authorize
served lesson publication or shared repository changes.

## Output boundary

Write only under `content/lesson-candidates/<team-id>/`:

```text
TEAM-HANDOFF.json
waves/WAVE-<nn>-HANDOFF.json
<lesson-id>/
  lesson-script.json
  kc-coverage-matrix.json
  lesson-presentation-plan.json
  lesson-quality-report.json
  learner-safe-items.json
  protected-items.json
  source-claim-ledger.json
  artifact-manifest.json
  candidate-quality-ledger.json
  inputs/task-source-packet.json
  validation/lesson-validate.json
  validation/computed-quality.json
  validation/normalization-smoke.json
  validation/protected-scan.json
  reviews/author-self-audit.json
  reviews/judge-pre-screen.json
  LESSON-HANDOFF.json
```

Never write to `content/lessons/`, registration, curriculum, schemas, shared tooling,
runtime, UI, mastery, catalog, API, database, deployment, package-manager, assignment,
packet, or another team path.

## One-lesson sequence

1. Select one exact assigned lesson and its one frozen packet.
2. Materialize the complete STANDARD candidate template.
3. Keep learner-safe and protected artifacts separated.
4. Run `commands/validate-one.txt <candidate-lesson-directory>`. It records rehash,
   R1–R15, computed-quality, canonical normalization, protected scan, author self-audit,
   and independent judge pre-screen evidence.
5. Perform no more than two targeted revision cycles, rerunning validation after each.
6. Preserve honest `BLOCKED` or `FAILED` status if a hard gate cannot pass.

## Team closure

Run `commands/validate-assignment.txt` only after all 30 assigned lesson directories and
handoffs exist. At least one closed `waves/WAVE-<nn>-HANDOFF.json` is required, and
`TEAM-HANDOFF.json` must contain exactly 30 unique assignment rows marked `COMPLETE`,
`BLOCKED`, or `FAILED`.

Run `commands/package-handoff.txt` to regenerate and verify the closed team/wave manifests
and deterministic wave archive/checksum instructions. This packaging step does not publish,
register, serve, deploy, approve, or claim official rubric PASS.
