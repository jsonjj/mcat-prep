# V3 cloud lesson-authoring runbook

## Status and authority

This runbook orchestrates internal draft production for the 114 canonical V3 lesson shells. It does
not authorize lesson publication and does not define application/runtime behavior.

- Curriculum identity and relations come only from
  `v3-lesson-authoring-manifest.json`.
- The normative lesson and publication contract is
  `docs/design/mcat-complete-learning-flow.md`, especially sections 12, 13, 31, 32.1, and 33.
- `v3-cloud-authoring-jobs.json` is the generated job and wave projection. Do not hand-edit it.
- The five approved prototypes are a port pilot only:
  `V3-LES-329622`, `V3-LES-765609`, `V3-LES-443492`, `V3-LES-225658`, and
  `V3-LES-386478`. They are not production `LessonDefinition` records.
- Generated content is an internal draft until rights, scientific review, reviewed hashes, and
  efficacy gates pass.

Regenerate or verify from the repository root:

```sh
node scripts/generate-v3-cloud-authoring-plan.mjs
node scripts/generate-v3-cloud-authoring-plan.mjs --check
node --test scripts/generate-v3-cloud-authoring-plan.test.mjs
```

The generator has no timestamp or random input. It verifies the checked curriculum and contract
pins, uses normalized relation IDs, and fails if its checked output is stale.

## One lesson per cloud author

Each author agent receives exactly:

1. The shared manifest, V3 README, canonical design contract, and its one job record.
2. Independently authored factual references whose use and model-processing rights are recorded.
3. For a pilot-port job only, the matching approved prototype after its artifact location, immutable
   hash, processing rights, and review provenance have been supplied.

An author agent must not receive another lesson draft, another prototype, protected questions or
answer keys, copied textbook prose, licensed content without model-processing permission, or
historical expressive source payloads excluded from the bootstrap. New-authoring jobs are clean-room
jobs; the prototypes may not seed the other 109 jobs.

Original figures, tables, passages, examples, and items are required unless explicit reuse rights
exist. Record source provenance, input rights, and source-output similarity evidence. The
similarity auditor—not the author—may compare drafts after authoring.

Before launch, replace every null `assignee_agent_run_id` in the selected wave with an actual cloud
run ID. One author run may own only one lesson in that wave. Enforce all
`must_be_distinct_from_slot_ids` constraints; at minimum:

```text
author ≠ content/pedagogy auditor
author ≠ blind solver
author ≠ accessibility/technical auditor
author ≠ similarity auditor
author ≠ final approver
```

The blind solver and final approver must also be different people or agents. A controller must
reject missing, reused, or self-attested assignments before work starts.

## Exact lesson contract

An author must preserve the job's exact registry artifact and SHA, freeze IDs, source-manifest hash,
lesson ID, grouping ID, normalized internal-order relation, ordered KC IDs, and exact KC statements.
No author may add, remove, split, merge, rename, or rehome a KC, create one lesson per KC/source
topic, or infer order from JSON adjacency.

The draft bundle must contain:

- One immutable lesson-shell manifest with content version, duration estimates, checkpoint map,
  grouping order, and eventual reviewed-content-hash field.
- One primary resumable microcycle per ordered KC, with observable objective, scope and non-goals,
  selected archetype, prerequisites at point of use, facts, procedures, assumptions, boundaries,
  confusables, expert task model, representations/equations, misconception hypotheses, cases,
  route policy, assistance ladder, duration, and checkpoints.
- A deterministic activity graph per KC with meaningful learner work, A3→A0 assistance fading,
  explicit fallbacks, bounded repair, exact reentry, termination, pause, and resume.
- Two untouched A0 instructional-exit checks per KC—a near-use and construct-preserving changed
  task—kept separate from downstream independent, transfer, delayed, passage, timed, and protected
  families.
- Feedback metadata, exposure/family metadata, server-bound keys and rationales, and declared
  shell-delivery, KC-evidence, repair, and analytics events.
- Accessible behavior for keyboard, focus, semantics, contrast, reflow, reduced motion,
  accommodations, and nonvisual construct-equivalent representations.

The 18-minute p90 core-path guardrail applies provisionally per KC microcycle, not per shell.
Outliers need a documented waiver and resumable segmentation.

Attachment handling is exact:

- `host_only` extensions/supports remain bounded, host-attached, nonstandalone, and nonmastery.
- `required` capstones remain separately authored coordination activities at their placement
  relations; they are references, not lesson-owned KC microcycles.
- `governance_only` records—including `V3-EXT-703019` and `V3-CAP-537139`—produce no active content,
  task, evidence, placement, or denominator entry.
- Only a `HARD_PREREQUISITE` may block its recorded unscaffolded point of use. Helpful and other
  relation types remain nonblocking.
- Adaptive bypass is disabled. Entry evidence changes support and dose, never required KC scope.

The bundle must not contain lesson/grouping/attachment/module/phase/pathway mastery, a lesson-wide
diagnostic label, inferred capstone success, a new curriculum identity, a score/readiness claim, or
an efficacy claim.

## Required pipeline

Every lesson follows this order:

1. **Author.** Pin and lint the job, elicit/reconcile expert task models, create the shell and KC
   microcycles, bind relations and attachments, isolate item families, and self-check all paths.
2. **Independent content/pedagogy audit.** A nonauthor verifies source ceiling, factual and
   scientific accuracy, KC boundaries, objective/activity alignment, representation use, fading,
   feedback, repair, family isolation, and domain-specific fact-check sign-off. Findings return to
   the author; changed content is re-audited.
3. **Blind solve.** A solver without keys/rationales completes every instructional and assessment
   path. Exercise correct, incorrect, omission, help, retry, reveal, interruption, resume,
   invalid-item, mixed-route, and repair-limit behavior with fresh families.
4. **Accessibility/technical audit.** Verify construct-equivalent alternatives and deterministic
   activity-graph/checkpoint behavior as well as accessibility requirements.
5. **Cross-lesson similarity audit.** Compare every draft with its current wave and the immediately
   prior integrated wave across and within domains. Check copied language, repeated scenarios,
   representational monoculture, answer-pattern leakage, family leakage, and template overfitting.
6. **Reviewed hash.** Resolve findings, rerun affected stages, freeze one candidate, and bind every
   approval to its exact content hash. Any mutation invalidates the affected approvals.
7. **Publication gate.** A distinct final approver verifies all 12 machine-listed gates, rights,
   scientific/domain review, exact reviewed hash, and the preregistered efficacy/subgroup evidence.
   Before that decision the artifact remains internal draft, even if merged at a wave checkpoint.

An author assertion is not audit evidence. Missing or ambiguous evidence fails closed.

## Deterministic waves

The fixed pilot plus ten production waves cover 114 lessons and 422 KC microcycles:

| Wave                     | Authors | KCs | Domain mix                                                         |
| ------------------------ | ------: | --: | ------------------------------------------------------------------ |
| `V3-AUTH-W00-PILOT-PORT` |       5 |  18 | CARS 1, Chem/Phys 2, SIRS 1, Psych/Soc 1                           |
| `V3-AUTH-W01`            |      11 |  42 | Bio/Biochem 3, CARS 1, Chem/Phys 4, Psych/Soc 3                    |
| `V3-AUTH-W02`            |      11 |  46 | Bio/Biochem 3, CARS 1, Chem/Phys 4, Psych/Soc 3                    |
| `V3-AUTH-W03`            |      11 |  44 | Bio/Biochem 3, CARS 1, Chem/Phys 4, Psych/Soc 3                    |
| `V3-AUTH-W04`            |      11 |  37 | Bio/Biochem 3, shared Bio/Chem 1, Chem/Phys 3, SIRS 1, Psych/Soc 3 |
| `V3-AUTH-W05`            |      11 |  41 | Bio/Biochem 2, shared 1, CARS 1, Chem/Phys 3, SIRS 1, Psych/Soc 3  |
| `V3-AUTH-W06`            |      11 |  39 | Bio/Biochem 3, CARS 1, Chem/Phys 4, Psych/Soc 3                    |
| `V3-AUTH-W07`            |      11 |  34 | Bio/Biochem 2, shared Bio/Chem 1, Chem/Phys 4, SIRS 1, Psych/Soc 3 |
| `V3-AUTH-W08`            |      11 |  40 | Bio/Biochem 2, shared 1, CARS 1, Chem/Phys 3, SIRS 1, Psych/Soc 3  |
| `V3-AUTH-W09`            |      11 |  40 | Bio/Biochem 3, shared 1, CARS 1, Chem/Phys 3, SIRS 1, Psych/Soc 2  |
| `V3-AUTH-W10`            |      10 |  41 | Bio/Biochem 2, shared 1, CARS 1, Chem/Phys 2, SIRS 1, Psych/Soc 3  |

Exact ordered lesson/job membership, specialties, complexity/risk estimates, and prior-wave
requirements are in each generated `waves[]` record. The five-item pilot is intentionally smaller.
Production uses 10–11 simultaneous authors, inside the 8–12 quality-preserving range. This keeps
audits, blind solves, accessibility checks, and integration review tractable while every production
wave retains at least three domain buckets. One hundred simultaneous authors would overwhelm those
independent-review bottlenecks and delay detection of a bad shared template until most drafts
already existed.

Wave eligibility uses only explicit stable relations:

- A cross-lesson hard edge into a nested KC point of use requires its source lesson's authoring
  checkpoint in an earlier wave.
- Hard edges into separately placed capstones remain in the job but do not invent lesson-shell
  first-delivery order.
- The normalized first-delivery relation and its explicit ordinal fields break ties among otherwise
  ready jobs.
- Helpful relations never block. Array proximity never creates a dependency.

### Checkpoint between every wave

Do not start the next wave until the integration controller:

1. Confirms every expected job and distinct assignment, with no extra lesson output.
2. Resolves all severity-one/two findings and records G01–G10 evidence for internal integration.
3. Completes current-plus-prior-wave similarity review and a cross-domain template review.
4. Regenerates/checks the job manifest and runs formatting, lint, tests, protected-field scanning,
   rights scanning, and reference/attachment checks.
5. Integrates reviewed drafts in one auditable wave checkpoint and records artifact hashes, issues,
   approvals, and rollback coordinates.

The checkpoint is an internal-draft integration boundary, not publication. G11 and G12 remain
release gates. A failure pauses the next wave; it does not justify deleting scope, moving a job,
changing curriculum order, or relaxing separation of duties.

## Known launch blockers

- Locations, hashes, processing-rights records, and review provenance for all five prototype
  artifacts still need to be supplied.
- Actual author/auditor/solver/integrator/approver identities are unassigned.
- The AAMC authority ceiling has not been refreshed beyond the supplied 2020 source.
- Lesson content, scientific sign-off, rights evidence, calibrated evidence recipes, learner
  validation, and efficacy/subgroup results do not yet exist.
- Complexity and risk points are deterministic structural triage estimates, not person-hours,
  difficulty calibration, safety clearance, or efficacy evidence.
