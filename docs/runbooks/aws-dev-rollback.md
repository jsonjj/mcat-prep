# AWS development rollback and recovery runbook

## Purpose

Recover a failed MCAT Mastery development deployment without destroying retained learner data,
protected content, identity, encryption keys, or audit evidence.

Rollback does not mean “reverse every change.” PostgreSQL schema changes are forward-fix only,
and accepted learner events remain immutable.

## Immediate response

1. Stop the current wave and all web/content publication.
2. Preserve the failed command output, request IDs, reviewed manifest, CDK diff, CloudFormation
   events, alarm state, and artifact/migration hashes.
3. Disable optional activation flags or traffic only through an already-approved operational
   control. Do not improvise IAM, public access, or database changes.
4. Check API errors/latency, Lambda errors/throttles, Aurora/RDS Proxy, queue age/DLQs, outbox age,
   publication failures, CloudFront errors, and the monthly budget.
5. Classify the incident: web artifact, application stack, failed CloudFormation update,
   migration/data integrity, identity/session, protected-content exposure, or regional service.

Escalate immediately for acknowledged-event loss, duplicate logical effects, protected-content
exposure, credential/token exposure, deletion failure, cross-learner access, KMS/key risk, or an
unexpected stateful replacement.

## Web artifact rollback

Prefer republishing the last known-good immutable build whose manifest and SHA-256 hashes were
recorded. Resolve the learner/admin bucket and distribution only from `mcat-dev-web` outputs.

1. Verify the previous artifact manifest belongs to the same account, region, and application.
2. Re-scan the artifact for protected fields, source maps, secrets, and unknown files.
3. Restore previous object versions or republish the exact recorded bytes with their original
   cache classifications. Do not use `s3 sync --delete`.
4. Invalidate only `/`, `/index.html`, and, for the learner app, `/manifest.webmanifest` and
   `/sw.js`.
5. Verify SHA-256/size metadata, SPA routing, service-worker recovery, private-route noindex, and
   API no-store behavior.

If the admin bundle contains answer-bearing synthetic content, leave admin unpublished. Never
waive the scan to recover availability.

## Application/CDK rollback

Use the previous reviewed cloud assembly, not a fresh synth from an old branch.

1. Confirm its commit, complete-assembly hash, diff, account, region, and approval record.
2. Diff it against the deployed environment with `--change-set=false`.
3. Reject rollback if it would replace/delete Aurora, KMS keys, Cognito pools, retained buckets,
   protected content, or audit data, or if it is incompatible with the current schema.
4. Deploy only the affected approved wave with the same exact stack order and `--exclusively`.
5. Run preflight, migration compatibility review, API smoke, alarms, and DLQ checks again.

Do not use `cdk destroy`, CloudFormation stack deletion, `RemovalPolicy.DESTROY`, or force-delete
retained resources.

## Failed CloudFormation update

Inspect events first:

```bash
aws --profile sbsandbox --region us-east-1 cloudformation describe-stack-events --stack-name PHYSICAL_MCAT_DEV_STACK --output table
```

For an automatic `UPDATE_ROLLBACK_COMPLETE`, verify the prior resources and run smoke tests. For
`UPDATE_ROLLBACK_FAILED`, identify the exact failed resource and obtain operations/security review
before using `continue-update-rollback`. Never skip a stateful or security resource simply to make
the stack green.

```bash
aws --profile sbsandbox --region us-east-1 cloudformation continue-update-rollback --stack-name PHYSICAL_MCAT_DEV_STACK
```

Do not run that command on a different account/region or on staging/production.

## Database or data-integrity recovery

Follow [database-migrations.md](./database-migrations.md). There are no down migrations.

- If a migration failed inside its transaction, correct it in a new commit and retry after review.
- If the schema advanced but code failed, deploy the last schema-compatible assembly or a forward
  compatibility fix.
- If accepted learner state is inconsistent, stop writes, preserve immutable events/outbox rows,
  rebuild projections into shadow tables, compare, then atomically promote under an approved
  incident plan.
- Use Aurora PITR only for a declared data-integrity disaster. Before restore, capture all
  post-restore-point accepted events and deletion-ledger entries; reapply/reconcile them before
  traffic resumes.

Never overwrite attempts, hand-edit projections as the source of truth, or lose deletion-ledger
effects during restore.

## Queue and worker recovery

Pause consumers only through an approved mechanism. Inspect DLQ messages without logging protected
payloads or learner identifiers. Fix the deterministic cause, deploy the reviewed worker, redrive
in bounded batches, and verify event idempotency/projection sequence before draining the remainder.
Never purge a queue to clear an alarm.

## Identity/session recovery

Do not delete or recreate Cognito pools. If the learner API or session store is unsafe, stop new
sessions, revoke affected sessions, preserve account/link histories, deploy the reviewed fix, and
verify bootstrap, recovery, linking, merge idempotency, CSRF, and cross-tab sign-out. Account merge
rollback must preserve both immutable histories and recompute authoritative state.

## Protected-content incident

Stop web/content publication and revoke the affected delivery path. Preserve evidence without
copying protected payloads into tickets or ordinary logs. Suspend the affected release/version,
rotate any exposed signed-delivery capability, scan repository history/builds/caches/S3/logs, and
follow the content correction/replay process. Historical attempts are never erased to conceal an
incident.

## Recovery exit criteria

Traffic or deployment may resume only when:

- affected stacks are stable and termination protection/retention remain enabled;
- API smoke passes all session, CORS, idempotency, read, and negative checks;
- no protected field appears in public artifacts, caches, payloads, or sampled logs;
- alarms are healthy, DLQs are understood/empty, and outbox lag is normal;
- migration and projection state are deterministic and checksum-consistent;
- the deployment evidence identifies the recovered artifact/stack/schema versions and approver;
- the incident owner documents cause, impact, rollback/recovery actions, residual risk, and a
  follow-up test or guardrail.

Staging and production are not authorized recovery targets for this development runbook.
