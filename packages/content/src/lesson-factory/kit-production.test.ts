import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type Scenario =
  | 'FULL_PIPELINE'
  | 'MULTI_GENERATION'
  | 'STAGED_WITH_RENAMED_VERSION'
  | 'READY_PENDING_CLEANUP'
  | 'INTERMEDIATE_SWAP_WRITE'
  | 'INTERMEDIATE_SWAP_RENAME'
  | 'INTERMEDIATE_SWAP_REMOVE'
  | 'SMOKE_RECEIPTS'
  | 'ORDINARY_FAILURE_MATRIX'
  | 'PERSISTENT_POSTCOMMIT_LEDGER'
  | 'PERSISTENT_POSTCOMMIT_JOURNAL'
  | 'PERSISTENT_POSTCOMMIT_CLEANUP'
  | 'PERSISTENT_POSTCOMMIT_LOCK'
  | 'REAL_PARENT_SWAP_MATRIX'
  | 'PRODUCTION_ROOT_REJECTIONS'
  | 'INTENTIONAL_RESIDUE'
  | 'SCRATCH_HYGIENE'
  | 'RECONCILE_OWNED_SCRATCH'
  | 'REAL_INPUT_ADMISSION'
  | 'AUTHORITY_STORE_GATES'
  | 'AUTHORITY_EXECUTION_REPLAY'
  | 'PREFLIGHT_STATE_MACHINE'
  | 'STALE_AUTHORITY_REFRESH'
  | 'CONSUMED_GENERATION_ROLLOVER'
  | 'GENERATION_TWO_PACKAGE'
  | 'REAL_VALIDATE_ONE_GATES'
  | 'REAL_SMOKE_EXECUTABLE'
  | 'KIT_CLI_SEPARATION'
  | 'STRICT_NESTED_RECORDS'
  | 'FORBIDDEN_TEST_ROOTS'
  | 'CHECKOUT_COMMIT_MISMATCH'
  | 'PROOF_ASSIGNMENT_MISMATCH'
  | 'ARBITRARY_ROOT_DELETE'
  | 'LIVE_AGED_LOCK'
  | 'PARENT_SYMLINK_SWAP'
  | 'CRASH_AFTER_LOCK'
  | 'CRASH_AFTER_VERSION_RENAME'
  | 'READY_OBSERVABLE'
  | 'GENERATION_ROLLBACK'
  | 'RECEIPT_REPLAY'
  | 'TEAM_B_FILE_FAILURE'
  | 'TEAM_B_FSYNC_FAILURE'
  | 'TEAM_B_RENAME_FAILURE'
  | 'MALFORMED_STATUS'
  | 'STALE_RECEIPT'
  | 'CANONICAL_ADMISSION_BYPASS'
  | 'WRONG_MANIFEST_PATHS'
  | 'EXECUTABLE_HASH_MISMATCH';

interface ScenarioResult {
  readonly status: 'READY' | 'BLOCKED';
  readonly code?: string;
  readonly evidence: Record<string, unknown>;
}

interface InternalReviewHarness {
  readonly run: (scenario: Scenario) => Promise<ScenarioResult>;
}

interface ProductionModule {
  readonly prepareProductionAuthority: () => Promise<{
    readonly status: 'BLOCKED' | 'PREPARED';
    readonly blockers?: readonly { readonly code: string }[];
  }>;
  readonly preflightProductionKits: () => Promise<{
    readonly status: 'BLOCKED' | 'PREFLIGHT_OK';
    readonly blockers?: readonly { readonly code: string }[];
    readonly authority?: {
      readonly state: 'VALID_UNCONSUMED';
      readonly repositoryCommit: string;
      readonly action: 'PACKAGE_KITS';
    };
  }>;
  readonly executeProductionKits: () => Promise<{
    readonly status: 'BLOCKED' | 'READY';
    readonly attemptedPhase: string;
    readonly blockers?: readonly { readonly code: string }[];
  }>;
}

const hookSymbol = Symbol.for('wp-03.production.review-harness.install');
let production: ProductionModule;
let harness: InternalReviewHarness;

beforeAll(async () => {
  let registered: InternalReviewHarness | undefined;
  (
    globalThis as typeof globalThis & {
      [hookSymbol]?: { readonly register: (api: InternalReviewHarness) => void };
    }
  )[hookSymbol] = {
    register: (api) => {
      registered = api;
    },
  };
  production = (await import('./kit-production')) as ProductionModule;
  delete (
    globalThis as typeof globalThis & {
      [hookSymbol]?: unknown;
    }
  )[hookSymbol];
  harness = registered ?? {
    run: async () => ({
      status: 'BLOCKED',
      code: 'PRIVATE_PIPELINE_MISSING',
      evidence: {},
    }),
  };
});

afterAll(async () => {
  await harness.run('RECONCILE_OWNED_SCRATCH');
  const result = await harness.run('SCRATCH_HYGIENE');
  expect(result).toMatchObject({
    status: 'READY',
    evidence: {
      markedOwnedRoots: [],
      preservedUnownedRoots: ['owned-1QPJ22', 'owned-1ZU2Lb', 'owned-W2lElV', 'owned-akhkLw'],
      escapedPaths: [],
    },
  });
});

describe('WP-03 scratch hygiene', () => {
  it('cleans inspected journal lock stage and version residue after the scenario', async () => {
    expect(await harness.run('INTENTIONAL_RESIDUE')).toMatchObject({
      status: 'BLOCKED',
      code: 'INTENTIONAL_TEST_RESIDUE_INSPECTED',
      evidence: {
        journal: true,
        lock: true,
        stage: true,
        version: true,
      },
    });
    expect(await harness.run('SCRATCH_HYGIENE')).toMatchObject({
      status: 'READY',
      evidence: { markedOwnedRoots: [] },
    });
  });
});

describe('WP-03 production authority boundary', () => {
  it('runs real two-stage candidate validation without fabricating review authority', async () => {
    expect(await harness.run('REAL_VALIDATE_ONE_GATES')).toMatchObject({
      status: 'READY',
      evidence: {
        structuralFailureRejected: true,
        normalizationFailureRejected: true,
        protectedLeakRejected: true,
        missingJudgeRejectedAfterMechanicalReceipts: true,
        invalidStaleSelfJudgeRejected: true,
        blockedSelfAuditRejected: true,
        independentJudgeFinalizedComplete: true,
        tamperAfterJudgeRejected: true,
        noReviewReceiptFabricated: true,
        realCommandReceiptsBound: true,
        sameCandidateTwoStage: true,
      },
    });
  }, 120_000);

  it('builds the exact plan-mandated generation-two teammate package', async () => {
    expect(await harness.run('GENERATION_TWO_PACKAGE')).toMatchObject({
      status: 'READY',
      evidence: {
        generation: 2,
        oldInventoryCount: 46,
        newInventoryCount: 76,
        staticInventory: [
          'AUTHOR-INSTRUCTIONS.md',
          'JUDGE-INSTRUCTIONS.md',
          'README.md',
          'commands/bootstrap.txt',
          'commands/kit-command.mjs',
          'commands/package-handoff.txt',
          'commands/validate-assignment.txt',
          'commands/validate-one.txt',
          'deadline-profile/lifecycle-and-nonclaims.json',
          'deadline-profile/rubric-profile.json',
          'deadline-profile/source-use-receipt.json',
          'deadline-profile/standard-only-release-policy.json',
          'docs/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md',
          'docs/06-LESSON-AUTHORING-WORKFLOW.md',
          'docs/autonomous-lesson-authoring-context.md',
          'docs/lesson-evidence-mastery-contract.md',
          'docs/lesson-quality-author-protocol.md',
          'docs/lesson-quality-rubric.md',
          'handoff/LESSON-HANDOFF-TEMPLATE.json',
          'handoff/TEAM-HANDOFF-TEMPLATE.json',
          'handoff/WAVE-HANDOFF-TEMPLATE.json',
          'judge-docs/lesson-quality-evidence-protocol.md',
          'judge-docs/lesson-quality-judge-protocol.md',
          'schemas/assignment-manifest.schema.json',
          'schemas/assignment-partition-proof.schema.json',
          'schemas/candidate-quality-ledger.schema.json',
          'schemas/deadline-profile.schema.json',
          'schemas/kit-manifest.schema.json',
          'schemas/lesson-bundle.schema.json',
          'schemas/lesson-handoff.schema.json',
          'schemas/lifecycle-nonclaims.schema.json',
          'schemas/owner-source-use-receipt.schema.json',
          'schemas/release-policy.schema.json',
          'schemas/shared-vocabulary.schema.json',
          'schemas/task-source-packet.schema.json',
          'schemas/team-handoff.schema.json',
          'template/v3-les-000000/README.md',
          'template/v3-les-000000/artifact-manifest.json',
          'template/v3-les-000000/kc-coverage-matrix.json',
          'template/v3-les-000000/learner-safe-items.json',
          'template/v3-les-000000/lesson-presentation-plan.json',
          'template/v3-les-000000/lesson-quality-report.json',
          'template/v3-les-000000/lesson-script.json',
          'template/v3-les-000000/protected-items.json',
        ],
        assignmentCount: 1,
        packetCount: 30,
        sourceMappingsComplete: true,
        authorInstructionsComplete: true,
        judgeInstructionsComplete: true,
        commandModes: ['0755', '0755', '0755', '0755', '0755'],
        commandsReproducible: true,
        commandsExecuted: [
          'KIT_COMMAND_OK bootstrap FROZEN_INSTALL_OK',
          'KIT_COMMAND_OK validate-one',
          'KIT_COMMAND_OK package-handoff',
          'KIT_COMMAND_OK validate-assignment',
        ],
        commandEffects: {
          bootstrapReceipt: true,
          frozenInstallPerformed: true,
          lessonReceiptsRecorded: true,
          assignmentValidated30: true,
          waveArchiveProduced: true,
          noOpRejected: true,
          exitZeroNoOpRejected: true,
          forbiddenWriteRejected: true,
          honestBlockedRowAccepted: true,
        },
        manifestAuthorityComplete: true,
        validatorAuthorityClosure: true,
        forbiddenValidatorWrites: true,
        packageableStructuralBlocked: true,
        packageableNormalizationFailed: true,
        packageableProtectedBlocked: true,
        packageableSelfAuditBlocked: true,
        packageableJudgeFailed: true,
        launderingRejected: true,
        candidateWorkflowSource: true,
        returnLayoutComplete: true,
        handoffTemplatesClosed: true,
        fullSmokePassed: true,
        everyRequiredFileRemovalRejected: true,
        protectedLeakFree: true,
        deterministic: true,
        coreParity: true,
        generationOneImmutable: true,
        generationTwoSupersedesOne: true,
      },
    });
  }, 120_000);

  it('returns a closed preflight union and never BLOCKED with no blockers', async () => {
    expect(await harness.run('PREFLIGHT_STATE_MACHINE')).toMatchObject({
      status: 'READY',
      evidence: {
        preparedStatus: 'PREPARED',
        readyStatus: 'PREFLIGHT_OK',
        readyUserSendable: false,
        readyBlockersAbsent: true,
        authorityState: 'VALID_UNCONSUMED',
        blockedStatus: 'BLOCKED',
        blockedCodes: ['ARMING_RECEIPT_MISSING'],
        emptyBlockedRejected: true,
      },
    });
  }, 30_000);

  it('supersedes stale unconsumed authority without changing the key or consumed ledger', async () => {
    expect(await harness.run('STALE_AUTHORITY_REFRESH')).toMatchObject({
      status: 'READY',
      evidence: {
        firstPrepare: 'PREPARED',
        stalePreflight: 'SOURCE_COMMIT_MISMATCH',
        refreshedPrepare: 'PREPARED',
        refreshedPreflight: 'PREFLIGHT_OK',
        keyUnchanged: true,
        staleReceiptSuperseded: true,
        consumedLedgerPreserved: true,
        refreshedCommit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
    });
  }, 30_000);

  it('rolls a consumed immutable generation forward without refreshing it in place', async () => {
    expect(await harness.run('CONSUMED_GENERATION_ROLLOVER')).toMatchObject({
      status: 'READY',
      evidence: {
        diagnosticBefore: 'CONSUMED_GENERATION_ROLLOVER_REQUIRED',
        preparedGeneration: 2,
        preflightAfter: 'PREFLIGHT_OK',
        legacyMigrationAttested: true,
        legacySignatureExplicitlyUnverified: true,
        migrationKeyUnchanged: true,
        consumedArchivePreserved: true,
        consumedArchiveNotSuperseded: true,
        currentGenerationUnchanged: 1,
        replayRejected: 'AUTHORIZATION_REPLAYED',
        generationSkipRejected: 'CONSUMED_GENERATION_MISMATCH',
        mismatchedCurrentRejected: 'CONSUMED_GENERATION_MISMATCH',
        absentLedgerRejected: 'CONSUMPTION_EVIDENCE_MISSING',
        ledgerReceiptIdRejected: true,
        ledgerCommitRejected: true,
        ledgerTimeRejected: true,
        ledgerRawBytesRejected: true,
        statusMismatchRejected: true,
        versionMismatchRejected: true,
        finalizationMismatchRejected: true,
        publicationMismatchRejected: true,
        migrationReplayRejected: true,
        secondPrepareRejected: 'UNCONSUMED_AUTHORITY_EXISTS',
        secondPrepareKeyUnchanged: true,
        normalGenerationPrepared: 3,
        normalAuthenticatedArmingEvidence: true,
        normalLegacyFallbackAbsent: true,
        corruptedNormalSignatureRejected: true,
        corruptedNormalLedgerHashRejected: true,
      },
    });
  }, 120_000);

  it('exports only zero-argument reviewed production entrypoints', async () => {
    const exports = Object.keys(await import('./kit-production')).sort();
    expect(exports).toEqual([
      'executeProductionKits',
      'preflightProductionKits',
      'prepareProductionAuthority',
    ]);
    expect(production.prepareProductionAuthority).toHaveLength(0);
  });

  it('derives and verifies the closed authority store without caller authority', async () => {
    expect(await harness.run('AUTHORITY_STORE_GATES')).toMatchObject({
      status: 'READY',
      evidence: {
        rootDerivation: 'WORKSPACE_PARENT_FIXED',
        keyMode: '0600',
        canonicalHmacRecords: true,
        prepareWithoutArm: 'BLOCKED',
        prepareWithArm: 'PREPARED',
        noArchivesPublished: true,
        missingKey: 'AUTHORITY_ISSUER_KEY_MISSING',
        wrongKeyMode: 'AUTHORITY_ISSUER_KEY_MODE_INVALID',
        symlinkKey: 'AUTHORITY_ISSUER_KEY_SYMLINK',
        malformedReceipt: 'AUTHORITY_RECEIPT_INVALID',
        forgedReceipt: 'AUTHORITY_RECEIPT_SIGNATURE_INVALID',
        staleReceipt: 'AUTHORITY_RECEIPT_STALE',
        wrongCommit: 'AUTHORITY_COMMIT_MISMATCH',
        wrongRoot: 'AUTHORITY_ROOT_MISMATCH',
        wrongExecutable: 'AUTHORITY_EXECUTABLE_MISMATCH',
        wrongPacket: 'AUTHORITY_PACKET_AGGREGATE_MISMATCH',
        dirtySource: 'AUTHORITY_SOURCE_DIRTY',
        replay: 'AUTHORIZATION_REPLAYED',
        approvalNonclaims: true,
      },
    });
  }, 30_000);

  it('consumes one arming receipt under the publication lock and rejects replay', async () => {
    expect(await harness.run('AUTHORITY_EXECUTION_REPLAY')).toMatchObject({
      status: 'READY',
      evidence: {
        firstExecution: 'READY',
        armingConsumed: true,
        replayLedgerPersisted: true,
        replayExecution: 'BLOCKED',
        replayCode: 'AUTHORIZATION_REPLAYED',
      },
    });
  }, 30_000);

  it('executes every committed smoke mode and rejects malformed extracted kits', async () => {
    expect(await harness.run('REAL_SMOKE_EXECUTABLE')).toMatchObject({
      status: 'READY',
      evidence: {
        modes: ['bootstrap', 'install', 'one-template'],
        fixedOutputs: [
          'KIT_SMOKE_OK bootstrap',
          'KIT_SMOKE_OK install',
          'KIT_SMOKE_OK one-template',
        ],
        noWrites: true,
        malformedManifestRejected: true,
        malformedPacketRejected: true,
        executableMode: '0755',
        executableHashBound: true,
        semanticTemplateValidation: true,
        controlledHandoffFailures: true,
        validatorMutationRejected: true,
        temporaryStateCleaned: true,
      },
    });
  }, 30_000);

  it('keeps kit CLI commands narrow and separate from packet runtime authority', async () => {
    expect(await harness.run('KIT_CLI_SEPARATION')).toMatchObject({
      status: 'READY',
      evidence: {
        preflightExitMatchesState: true,
        prepareRequiresArm: true,
        publishRequiresArming: true,
        arbitraryPathRejected: true,
        packetDispatcherUnchanged: true,
        protectedSafeJson: true,
      },
    });
  }, 30_000);

  it('admits both finalized manifests from the current proof cohort before configuration gates', async () => {
    expect(await harness.run('REAL_INPUT_ADMISSION')).toMatchObject({
      status: 'READY',
      evidence: {
        proofRunId: 'lesson-factory-deadline-2026-08-03',
        assignmentLocators: [
          'lesson-factory-deadline-2026-08-03/assignment-02',
          'lesson-factory-deadline-2026-08-03/assignment-03',
        ],
        admittedTeams: ['team-A', 'team-B'],
        lessonCounts: [30, 30],
        proofClosure: 'PASS',
        fullCandidateBuild: 'PASS',
        smokeModes: ['bootstrap', 'install', 'one-template'],
        policyHashMutationRejected: true,
      },
    });
  }, 15_000);

  it('reports a nonempty stable blocker or a valid prepared state for real inputs', async () => {
    const preflight = await production.preflightProductionKits();
    if (preflight.status === 'BLOCKED') {
      expect(preflight.blockers).toBeDefined();
      expect(preflight.blockers!.length).toBeGreaterThan(0);
    } else {
      expect(preflight.status).toBe('PREFLIGHT_OK');
      expect(preflight.authority?.state).toBe('VALID_UNCONSUMED');
    }
  });

  it('exports only the reviewed zero-argument production entrypoints', async () => {
    const exports = Object.keys(await import('./kit-production')).sort();
    expect(exports).toEqual([
      'executeProductionKits',
      'preflightProductionKits',
      'prepareProductionAuthority',
    ]);
    expect(production.preflightProductionKits).toHaveLength(0);
    expect(production.executeProductionKits).toHaveLength(0);
  });

  it('uses canonical assignment paths and returns a closed preflight result', async () => {
    const preflight = await production.preflightProductionKits();
    const codes = preflight.blockers?.map((blocker) => blocker.code) ?? [];
    expect(['BLOCKED', 'PREFLIGHT_OK']).toContain(preflight.status);
    if (preflight.status === 'BLOCKED') expect(codes.length).toBeGreaterThan(0);
    expect(codes).not.toContain('FINAL_TEAM_A_MANIFEST_MISSING');
    expect(codes).not.toContain('FINAL_TEAM_B_MANIFEST_MISSING');
    expect(codes).not.toContain('FINAL_TEAM_MANIFEST_INVALID');
    expect(codes).not.toContain('CANONICAL_INPUT_ADMISSION_FAILED');
    expect(codes).not.toContain('PRODUCTION_PIPELINE_NOT_IMPLEMENTED');
  });

  it('keeps execution distinct without invoking the real publication root', async () => {
    const preflight = await production.preflightProductionKits();
    expect(preflight).not.toHaveProperty('attemptedPhase');
    expect(production.executeProductionKits).not.toBe(production.preflightProductionKits);
  });

  it('is named-exported from the package index without wildcard collisions', async () => {
    const index = await import('./index');
    expect(index.preflightProductionKits).toBe(production.preflightProductionKits);
    expect(index.executeProductionKits).toBe(production.executeProductionKits);
  });

  it('removes the stale writer-not-implemented blocker from core status', async () => {
    const core = await import('./kit-factory');
    expect(core.getProductionExecutionStatus().blockerCodes).not.toContain(
      'PRODUCTION_WRITER_NOT_IMPLEMENTED',
    );
    expect(core.getProductionWriterStatus().blockerCode).not.toBe(
      'PRODUCTION_WRITER_NOT_IMPLEMENTED',
    );
  });
});

describe('WP-03 private full pipeline', () => {
  it('builds and verifies complete 30/30 production-shaped kits', async () => {
    const result = await harness.run('FULL_PIPELINE');
    expect(result.status, JSON.stringify(result)).toBe('READY');
    expect(result.evidence).toMatchObject({
      teamACount: 30,
      teamBCount: 30,
      manifestPath: 'KIT-MANIFEST.json',
      boundaryScan: 'PASS',
      sendMe: 'PASS',
      checksums: 'PASS',
      transactionStates: ['BUILDING', 'READY'],
      currentTeams: ['team-A', 'team-B'],
      productionSmokeCommands: ['bootstrap', 'install', 'one-template'],
      candidateFactory: 'createFederatedKitCandidates',
      candidateVerifier: 'verifyKitCandidate',
      canonicalAdmissions: 60,
      partitionProofClosure: 'PASS',
      checkoutCommit: 'VERIFIED',
    });
  });

  it('is deterministic through the actual private candidate pipeline', async () => {
    const left = await harness.run('FULL_PIPELINE');
    const right = await harness.run('FULL_PIPELINE');
    expect(left.status).toBe('READY');
    expect(right.status).toBe('READY');
    expect(left.evidence.archiveHashes).toEqual(right.evidence.archiveHashes);
    expect(left.evidence.statusPayload).toEqual(right.evidence.statusPayload);
  });

  it('derives monotonic generations and makes immutable supersession reachable', async () => {
    expect(await harness.run('MULTI_GENERATION')).toMatchObject({
      status: 'READY',
      evidence: {
        generations: [1, 2],
        priorVersionImmutable: true,
        supersededTeams: ['team-A', 'team-B'],
        ledgerGenerations: [1, 2],
      },
    });
  });
});

describe('WP-03 root and lock safety', () => {
  it('cannot delete arbitrary, configured, real, or pre-existing roots', async () => {
    const result = await harness.run('ARBITRARY_ROOT_DELETE');
    expect(result).toMatchObject({
      status: 'BLOCKED',
      code: 'HARNESS_ROOT_NOT_OWNED',
      evidence: {
        callerSentinel: 'PRESERVED',
        configuredRoot: 'REFUSED',
        realRoot: 'UNTOUCHED',
      },
    });
  });

  it('does not steal a live lock merely because its lease timestamp is aged', async () => {
    expect(await harness.run('LIVE_AGED_LOCK')).toMatchObject({
      status: 'BLOCKED',
      code: 'LOCK_OWNER_LIVE',
      evidence: { takeover: false },
    });
  });

  it('blocks a parent symlink swap without an external write', async () => {
    expect(await harness.run('PARENT_SYMLINK_SWAP')).toMatchObject({
      status: 'BLOCKED',
      code: 'FILESYSTEM_IDENTITY_CHANGED',
      evidence: { outsideWrites: 0 },
    });
  });

  it.each([
    'INTERMEDIATE_SWAP_WRITE',
    'INTERMEDIATE_SWAP_RENAME',
    'INTERMEDIATE_SWAP_REMOVE',
  ] as const)('blocks intermediate parent replacement during %s', async (scenario) => {
    expect(await harness.run(scenario)).toMatchObject({
      status: 'BLOCKED',
      code: 'FILESYSTEM_IDENTITY_CHANGED',
      evidence: { outsideWrites: 0 },
    });
  });

  it('pins mutable parent handles, ownership, mode, links, and inode identity', async () => {
    expect(await harness.run('INTERMEDIATE_SWAP_WRITE')).toMatchObject({
      status: 'BLOCKED',
      code: 'FILESYSTEM_IDENTITY_CHANGED',
      evidence: {
        openedParentHandles: true,
        ownerChecked: true,
        mode0700Checked: true,
        linkCountChecked: true,
        inodeDeviceChecked: true,
        outsideWrites: 0,
      },
    });
  });

  it('categorically refuses repository, temp, test-scratch, configured, and real roots', async () => {
    expect(await harness.run('FORBIDDEN_TEST_ROOTS')).toMatchObject({
      status: 'BLOCKED',
      code: 'FORBIDDEN_TEST_ROOT',
      evidence: {
        repository: 'REFUSED',
        temp: 'REFUSED',
        testScratch: 'REFUSED',
        configured: 'REFUSED',
        external: 'UNTOUCHED',
      },
    });
  });
});

describe('WP-03 durable recovery and commit semantics', () => {
  it.each([
    ['CRASH_AFTER_LOCK', 'RECOVERED_CLEAN'],
    ['CRASH_AFTER_VERSION_RENAME', 'RECOVERED_READY'],
  ] as const)('reconciles SIGKILL semantics for %s', async (scenario, recovery) => {
    expect(await harness.run(scenario)).toMatchObject({
      status: scenario === 'CRASH_AFTER_LOCK' ? 'BLOCKED' : 'READY',
      evidence: { recovery, journalReconciled: true, processSignal: 'SIGKILL' },
    });
  });

  it('never reports BLOCKED after READY is observable', async () => {
    expect(await harness.run('READY_OBSERVABLE')).toMatchObject({
      status: 'READY',
      evidence: {
        readyObserved: true,
        returnedBlocked: false,
        postCommitFaultInjected: true,
      },
    });
  });

  it('reconciles STAGED when the exact version rename already happened', async () => {
    expect(await harness.run('STAGED_WITH_RENAMED_VERSION')).toMatchObject({
      status: 'READY',
      evidence: {
        recovery: 'RECOVERED_READY',
        stagedWindowClosed: true,
        exactHashesVerified: true,
      },
    });
  });

  it('finishes ledger journal and lock after READY committed pending cleanup', async () => {
    expect(await harness.run('READY_PENDING_CLEANUP')).toMatchObject({
      status: 'READY',
      evidence: {
        initialDisposition: 'READY_COMMITTED_PENDING_CLEANUP',
        ledgerComplete: true,
        journalRemoved: true,
        lockReleased: true,
      },
    });
  });

  it.each([
    ['GENERATION_ROLLBACK', 'GENERATION_ROLLBACK'],
    ['RECEIPT_REPLAY', 'AUTHORIZATION_REPLAYED'],
  ] as const)('blocks permanent-ledger violation %s', async (scenario, code) => {
    expect(await harness.run(scenario)).toMatchObject({
      status: 'BLOCKED',
      code,
      evidence: { permanentLedgerPreserved: true },
    });
  });
});

describe('WP-03 two-team atomicity', () => {
  it.each([
    ['TEAM_B_FILE_FAILURE', 'TEAM_B_FILE_WRITE_FAILED'],
    ['TEAM_B_FSYNC_FAILURE', 'TEAM_B_FILE_FSYNC_FAILED'],
    ['TEAM_B_RENAME_FAILURE', 'TEAM_B_RENAME_FAILED'],
  ] as const)('rolls back a real Team B fault at %s', async (scenario, code) => {
    expect(await harness.run(scenario)).toMatchObject({
      status: 'BLOCKED',
      code,
      evidence: {
        faultedTeam: 'team-B',
        teamAFilesWrittenBeforeFault: true,
        currentPointerExists: false,
      },
    });
  });

  it('covers every ordinary production failure boundary', async () => {
    const result = await harness.run('ORDINARY_FAILURE_MATRIX');
    expect(result.status, JSON.stringify(result)).toBe('BLOCKED');
    expect(result.evidence.operationIds).toEqual([
      'open',
      'mkdir',
      'write',
      'file-fsync',
      'dir-fsync',
      'rename',
      'remove',
      'chmod',
      'stat',
      'realpath',
      'lock',
      'journal',
      'current',
      'status',
      'ledger',
      'cleanup',
      'smoke',
    ]);
    expect(result.evidence.matrixRows).toBe(68);
    expect(result.evidence.injectedRows).toBe(68);
    expect(result.evidence.precommitBlockedRows, JSON.stringify(result.evidence)).toBe(34);
    expect(result.evidence.postcommitReadyRows).toBe(34);
    expect(result.evidence.recoveredRows).toBe(68);
    expect(result.evidence.falseReadyCount).toBe(0);
    expect(result.evidence.actualWorkflowRows).toBe(68);
    expect(result.evidence.preseededReadyRows).toBe(0);
    expect(result.evidence.destinationAssertions).toBe(68);
    expect(result.evidence.currentAssertions).toBe(68);
    expect(result.evidence.statusAssertions).toBe(68);
    expect(result.evidence.ledgerAssertions).toBe(68);
    expect(result.evidence.journalAssertions).toBe(68);
    expect(result.evidence.lockAssertions).toBe(68);
    expect(result.evidence.stageAssertions).toBe(68);
    expect(result.evidence.versionAssertions).toBe(68);
  }, 120_000);
});

describe('WP-03 persistent postcommit truth', () => {
  it.each([
    ['PERSISTENT_POSTCOMMIT_LEDGER', 'ledger'],
    ['PERSISTENT_POSTCOMMIT_JOURNAL', 'journal'],
    ['PERSISTENT_POSTCOMMIT_CLEANUP', 'cleanup'],
    ['PERSISTENT_POSTCOMMIT_LOCK', 'lock'],
  ] as const)('never returns BLOCKED for persistent %s failure', async (scenario, operation) => {
    expect(await harness.run(scenario)).toMatchObject({
      status: 'READY',
      code: 'READY_COMMITTED_PENDING_CLEANUP',
      evidence: {
        operation,
        readyObserved: true,
        returnedBlocked: false,
        durableJournal: true,
        nextInvocation: 'RECOVERED_READY',
        ledgerComplete: true,
        journalRemoved: true,
        lockReleased: true,
      },
    });
  });
});

describe('WP-03 real mutation confinement', () => {
  it('guards every actual rename and remove against intermediate replacement', async () => {
    const result = await harness.run('REAL_PARENT_SWAP_MATRIX');
    expect(result, JSON.stringify(result)).toMatchObject({
      status: 'READY',
      code: 'PARENT_SWAP_MATRIX_VERIFIED',
      evidence: {
        actualRenamesGuarded: true,
        actualRemovesGuarded: true,
        outsideWrites: 0,
        outsideDeletes: 0,
        precommitRecovery: 'RECOVERED_CLEAN',
        postcommitRecovery: 'RECOVERED_READY',
      },
    });
  });

  it('directly rejects forbidden configured production roots', async () => {
    expect(await harness.run('PRODUCTION_ROOT_REJECTIONS')).toMatchObject({
      status: 'BLOCKED',
      code: 'PRODUCTION_ROOT_FORBIDDEN',
      evidence: {
        repository: 'REFUSED',
        repositoryDescendant: 'REFUSED',
        temp: 'REFUSED',
        tempDescendant: 'REFUSED',
        fixtureScratch: 'REFUSED',
        pathMismatch: 'REFUSED',
        markerMismatch: 'REFUSED',
        ownerModeMismatch: 'REFUSED',
      },
    });
  });
});

describe('WP-03 smoke receipts', () => {
  it('binds every production command and reaps bounded failures', async () => {
    expect(await harness.run('SMOKE_RECEIPTS')).toMatchObject({
      status: 'READY',
      evidence: {
        commandIds: ['bootstrap', 'install', 'one-template'],
        receiptsClosed: true,
        executableHashBound: true,
        toolHashBound: true,
        argvEnvironmentCwdBound: true,
        stdoutStderrHashesBound: true,
        durationAndTimestampsBound: true,
        timeoutReaped: true,
        outputLimitReaped: true,
        extractionCleaned: true,
      },
    });
  });
});

describe('WP-03 closed validation gates', () => {
  it.each([
    ['MALFORMED_STATUS', 'PRIOR_STATUS_INVALID'],
    ['STALE_RECEIPT', 'AUTHORIZATION_STALE'],
    ['CANONICAL_ADMISSION_BYPASS', 'CANONICAL_ADMISSION_REQUIRED'],
    ['WRONG_MANIFEST_PATHS', 'FINAL_TEAM_MANIFEST_PATH_MISMATCH'],
    ['EXECUTABLE_HASH_MISMATCH', 'SMOKE_EXECUTABLE_HASH_MISMATCH'],
  ] as const)('fails closed for %s', async (scenario, code) => {
    expect(await harness.run(scenario)).toMatchObject({
      status: 'BLOCKED',
      code,
    });
  });

  it('strictly rejects malformed nested status history current and ledger records', async () => {
    expect(await harness.run('STRICT_NESTED_RECORDS')).toMatchObject({
      status: 'BLOCKED',
      code: 'PERSISTED_RECORD_INVALID',
      evidence: {
        status: 'REJECTED',
        current: 'REJECTED',
        history: 'REJECTED',
        ledger: 'REJECTED',
        substringReplayAccepted: false,
      },
    });
  });

  it.each([
    ['CHECKOUT_COMMIT_MISMATCH', 'CHECKOUT_COMMIT_MISMATCH'],
    ['PROOF_ASSIGNMENT_MISMATCH', 'PARTITION_PROOF_ASSIGNMENT_MISMATCH'],
  ] as const)('rejects authority mismatch %s', async (scenario, code) => {
    expect(await harness.run(scenario)).toMatchObject({
      status: 'BLOCKED',
      code,
    });
  });
});
