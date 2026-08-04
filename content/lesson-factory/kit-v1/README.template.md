# Lesson Generation Kit v1

Repository commit: `{{REPOSITORY_COMMIT}}`
Repository URL: `https://github.com/jsonjj/mcat-prep.git`
Kit content SHA-256: `{{KIT_CONTENT_SHA256}}`
Team: `{{TEAM_ID}}`
Assignment SHA-256: `{{ASSIGNMENT_SHA256}}`
Allowed output root: `content/lesson-candidates/{{TEAM_ID}}`
Lifecycle: `CANDIDATE_RUBRIC_SCREENED`
Branch convention: `lesson-factory/{{TEAM_ID}}/wave-<nn>`
Handoff endpoint: `branches:lesson-factory/{{TEAM_ID}}/wave-<nn>`
Manifest SHA-256: recorded by the sibling publication readiness record after assembly.

This immutable generation-2 package is for producing exactly the 30 lesson candidates in
`assignments/{{TEAM_ID}}-30.json`. It grants no permission to change shared code, canonical
identity, registries, runtime, UI, mastery, APIs, databases, deployment, or another team's
files.

Read in this order:

1. `AUTHOR-INSTRUCTIONS.md`
2. `docs/autonomous-lesson-authoring-context.md`
3. `docs/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md`
4. `docs/06-LESSON-AUTHORING-WORKFLOW.md`
5. `docs/lesson-evidence-mastery-contract.md`
6. `docs/lesson-quality-author-protocol.md`
7. `deadline-profile/rubric-profile.json`
8. `docs/lesson-quality-rubric.md`
9. `template/v3-les-000000/`
10. only the one packet for the lesson currently being authored

Write only under `content/lesson-candidates/{{TEAM_ID}}/`. Return work on branches named
`lesson-factory/{{TEAM_ID}}/wave-<nn>`. The final return contains all 30 rows in
`TEAM-HANDOFF.json`, including honest `BLOCKED` and `FAILED` rows.

Run the executable command specifications under `commands/` from the pinned clean checkout:

```sh
commands/bootstrap.txt
commands/validate-one.txt content/lesson-candidates/{{TEAM_ID}}/<lesson-id>
commands/validate-assignment.txt
commands/package-handoff.txt
```

They derive the immutable kit root, accept `REPOSITORY_ROOT` only as the pinned checkout
location, perform no network access, and use the dependency-free pinned helper. Bootstrap
runs exactly `corepack pnpm install --frozen-lockfile --offline --ignore-scripts` after
verifying the repository, kit, assignment, packet, and runtime pins.

Never paste protected artifacts, scoring material, hidden answers, secrets, or private
source material into logs, README files, SEND-ME text, screenshots, chat, or learner-safe
files. `CANDIDATE_RUBRIC_SCREENED` is a provisional machine-screened lifecycle, not official
rubric PASS, publication approval, or human approval.
