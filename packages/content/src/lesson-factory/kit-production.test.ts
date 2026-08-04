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
  readonly preflightProductionKits: () => Promise<{
    readonly status: 'BLOCKED';
    readonly blockers: readonly { readonly code: string }[];
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
  it('exports only the two zero-argument production entrypoints', async () => {
    const exports = Object.keys(await import('./kit-production')).sort();
    expect(exports).toEqual(['executeProductionKits', 'preflightProductionKits']);
    expect(production.preflightProductionKits).toHaveLength(0);
    expect(production.executeProductionKits).toHaveLength(0);
  });

  it('uses canonical assignment paths and remains unarmed', async () => {
    const preflight = await production.preflightProductionKits();
    const codes = preflight.blockers.map((blocker) => blocker.code);
    expect(preflight.status).toBe('BLOCKED');
    expect(codes).toEqual(
      expect.arrayContaining([
        'PRODUCTION_EXECUTION_NOT_ARMED',
        'FINAL_TEAM_A_MANIFEST_MISSING',
        'FINAL_TEAM_B_MANIFEST_MISSING',
        'FINALIZATION_ISSUER_KEY_NOT_CONFIGURED',
        'EXTERNAL_HANDOFF_ROOT_NOT_CONFIGURED',
      ]),
    );
    expect(codes).not.toContain('PRODUCTION_PIPELINE_NOT_IMPLEMENTED');
  });

  it('execute enters the private pipeline rather than returning preflight verbatim', async () => {
    const preflight = await production.preflightProductionKits();
    const execution = await production.executeProductionKits();
    expect(execution.status).toBe('BLOCKED');
    expect(execution.attemptedPhase).toBe('AUTHORITY_LOAD');
    expect(execution).not.toEqual(preflight);
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
