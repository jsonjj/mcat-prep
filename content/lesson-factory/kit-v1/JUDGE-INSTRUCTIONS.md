# Judge Instructions

Judge independently from manifested candidate evidence only.

Read, in order:

1. this file;
2. `docs/lesson-quality-rubric.md`;
3. `judge-docs/lesson-quality-judge-protocol.md`;
4. `judge-docs/lesson-quality-evidence-protocol.md`;
5. the candidate's manifested learner-safe, protected, source, validation, and author
   self-audit evidence.

Do not receive or infer an author's verdict, another judge's conclusion, gold/expected
labels, hidden answers outside the authorized scoring artifact, or unmanifested evidence.
Never copy protected answers or scoring material into findings, logs, chat, README, SEND-ME,
screenshots, or learner-safe artifacts.

Apply the frozen deadline rubric profile and all hard gates. Use stable finding codes from
the judge protocol. Every finding must identify the manifested evidence path and distinguish
observed failure from unavailable evidence. Rendered or human-only dimensions without valid
evidence remain `BLOCKED`; they are never fabricated as PASS.

Return one evidence-backed pre-screen. A judge may request at most one targeted revision at
a time. The authoring workflow permits at most two total targeted revision cycles. After a
revision, reassess only against fresh manifested evidence while checking that previously
passing hard gates did not regress.

The independent judge writes `reviews/judge-pre-screen.json`; `validate-one` never creates
or edits it. The closed record must contain reviewer role `INDEPENDENT_JUDGE`, a reviewer run
ID distinct from the author's run ID, `authorVerdictReceived:false`, the exact current
four-primary-artifact path/hash/size set, the frozen rubric-profile hash, current evidence
path/hash references, stable finding codes, status `SCREENED`, `BLOCKED`, or `FAILED`, and
false official/human/publication approval nonclaims. Do not copy an author-authored record.

After writing the bound record, require the author to rerun
`commands/validate-one.txt <candidate-lesson-directory>`. Any authored byte change makes the
record stale and requires a new independent pre-screen. `SCREENED` with no blocking findings
means only that this candidate gate completed; it is never official PASS or human approval.

Use `CANDIDATE_RUBRIC_SCREENED` only when all deadline machine gates pass. This is not
official rubric PASS, specialist approval, human approval, publication approval, or learner
mastery. Return honest `BLOCKED` or `FAILED` with stable codes whenever evidence is missing,
contradictory, unsafe, or outside authority.
