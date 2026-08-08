# Author Instructions

## Scope and read order

Author exactly one assigned lesson at a time. Read, in order:

1. this file;
2. `docs/autonomous-lesson-authoring-context.md`;
3. `docs/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md`;
4. `docs/06-LESSON-AUTHORING-WORKFLOW.md`;
5. `docs/lesson-evidence-mastery-contract.md`;
6. `docs/lesson-quality-author-protocol.md`;
7. `deadline-profile/rubric-profile.json`;
8. `docs/lesson-quality-rubric.md`;
9. all eight files under `template/v3-les-000000/`;
10. only `packets/<assigned-lesson-id>/task-source-packet.json` for the lesson in progress.

Do not preload, summarize, compare, or use another assigned lesson packet while authoring
the current lesson.

## Content authority

- Produce `STANDARD` only. Do not author CONCISE, MISCONCEPTION, or
  PREREQUISITE_SUPPORT variants.
- Derive only from the frozen rights-safe packet, repository material explicitly referenced
  by it, and permitted public/primary sources. Never use Kaplan or other private comparative
  material as lesson content.
- Preserve canonical lesson, KC, prerequisite, assignment, packet, and source identities.
- Do not claim official rubric PASS, human approval, publication approval, or mastery.
  `CANDIDATE_RUBRIC_SCREENED` is permitted only after every deadline hard gate passes.

## Required ten-artifact lesson return

Write only under
`content/lesson-candidates/<team-id>/<lesson-id>/`. Return exactly these ten lesson-root
artifacts, plus the required input, validation, and review evidence directories:

1. `lesson-script.json`
2. `kc-coverage-matrix.json`
3. `lesson-presentation-plan.json`
4. `lesson-quality-report.json`
5. `learner-safe-items.json`
6. `protected-items.json`
7. `source-claim-ledger.json`
8. `artifact-manifest.json`
9. `candidate-quality-ledger.json`
10. `LESSON-HANDOFF.json`

Also retain:

```text
inputs/task-source-packet.json
validation/lesson-validate.json
validation/computed-quality.json
validation/normalization-smoke.json
validation/protected-scan.json
reviews/author-self-audit.json
reviews/judge-pre-screen.json
```

`artifact-manifest.json` hashes every primary, learner-safe, protected, source, input,
validation, and review artifact. Learner-safe material must never contain protected scoring
keys, expected verdicts, hidden answers, or judge-only evidence. Protected artifacts remain
inside the authorized private repository/handoff channel and never enter command logs,
README, SEND-ME, screenshots, chat, or public outputs.

## Required sequence

1. Copy the one exact packet into `inputs/task-source-packet.json` and verify its manifest
   hash.
2. Materialize the complete STANDARD template without deleting required fields.
3. Rehash all artifacts and rebuild `artifact-manifest.json`.
4. Run structural rules R1–R15.
5. Run computed-quality checks without converting unavailable rendered/human evidence into
   PASS.
6. Run normalization smoke.
7. Run the protected-boundary scan.
8. Complete the author self-audit by writing the author-supplied closed
   `reviews/author-self-audit.json`. The command never
   creates or repairs this record. It must bind current evidence path/hash pairs, use revision
   cycle 0–2 and stable finding codes, state honest `PASS`, `BLOCKED`, or `FAILED`, and keep all
   official/human/publication approval nonclaims false.
9. Run `commands/validate-one.txt <candidate-lesson-directory>`. This writes only mechanical
   receipts and must fail with `JUDGE_PRE_SCREEN_REQUIRED` while no independent record exists.
10. Submit the current primary artifact hash set, frozen rubric-profile hash, and manifested
    evidence to an independent judge. The judge—not the author and not `validate-one`—writes
    `reviews/judge-pre-screen.json`.
11. Rerun `commands/validate-one.txt <candidate-lesson-directory>`. It rejects missing,
    self-authored, stale, malformed, `BLOCKED`, or `FAILED` judge records and finalizes
    `COMPLETE` only from current verified facts.
12. Perform at most two targeted revision cycles. After each revision, repeat rehash,
    R1–R15, computed quality, normalization, protected scan, self-audit, and judge sequence.
13. If any hard gate remains unresolved, return an exact `BLOCKED` or `FAILED` code rather
    than claiming completion.

## Forbidden shared paths

Do not edit `content/lessons/`, curriculum, registries, shared schemas/tooling, package
manager files, runtime, UI, mastery, catalog, API, database, deployment, infrastructure,
assignment manifests, packets, another team root, or central orchestration.

## Return contract

Use branches `lesson-factory/<team-id>/wave-<nn>`. A wave contains only newly completed
assigned lesson directories and its handoff manifest. Return one closed
`LESSON-HANDOFF.json` per lesson and one `TEAM-HANDOFF.json` with all 30 assignment rows,
each honestly `COMPLETE`, `BLOCKED`, or `FAILED`. Missing, substituted, duplicate, or extra
lesson rows invalidate the return.

The team output root contains exactly:

```text
TEAM-HANDOFF.json
waves/WAVE-<nn>-HANDOFF.json
<30 assigned lesson-id directories using the complete layout above>
```

At least one wave handoff is mandatory. Generate wave/team closure and deterministic archive
instructions only with `commands/package-handoff.txt`. Validate one lesson with
`commands/validate-one.txt <candidate-lesson-directory>` and validate the complete 30-row
return with `commands/validate-assignment.txt`. Do not hand-edit generated hashes or omit
honest `BLOCKED`/`FAILED` rows.

`LESSON-HANDOFF.json` must retain the author's `requestedStatus`. Requesting `COMPLETE` is
not completion: the helper changes status/lifecycle only after real R1–R15, computed-quality,
normalization, protected-boundary, self-audit, and independent-judge facts all bind the
current bytes. Any unresolved fact produces exact blocker codes.

A failed mechanical or review gate is still returnable evidence. Do not delete or replace
its receipt, change a failed receipt to PASS, remove its blocker code, or label its handoff
COMPLETE. Rerun `validate-one` to close the handoff as `BLOCKED` or `FAILED`, preserving the
current receipt hashes, then include that exact row in wave and team packaging. Packaging
accepts such a row only when every blocker is proved by the current closed evidence.

All validator and compiler sources listed by `KIT-MANIFEST.json.validatorAuthority` are
read-only execution authority. `tools/` and `packages/` are forbidden teammate write roots.
Modified, staged, untracked, stale, or hash-mismatched validator authority invalidates every
validation command.
