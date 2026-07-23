import type { PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPgPool, type PostgresPool } from './config';
import {
  listQuestionAssetReadinessInventory,
  listQuestionEligibilityInventory,
  listQuestionFamilyOverlapInventory,
  listQuestionReviewGapInventory,
} from './question-inventory-repository';
import { getVersionBoundProtectedAnswer } from './question-scoring-repository';
import {
  authorizeQuestionPresentation,
  invalidateQuestionVersion,
} from './question-serving-repository';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithPostgres = DATABASE_URL === undefined ? describe.skip : describe;
const LEARNER_ID = '40000000-0000-4000-8000-000000000001';
const SESSION_ID = '40000000-0000-4000-8000-000000000002';
const MATERIALIZED_AT = '2026-07-23T18:00:00.000Z';
const REQUESTED_AT = '2026-07-23T20:00:00.000Z';
const SECRET = 'synthetic-integration-authority-secret-long-enough';
const DIGEST = 'd'.repeat(64);

interface SyntheticVersionOptions {
  readonly questionId: string;
  readonly familyId: string;
  readonly itemVersion?: number;
  readonly contentPublishedAt?: string;
  readonly materializedAt?: string;
  readonly rightsStatus?: string;
  readonly accessibilityStatus?: string;
  readonly calibrationStatus?: string;
  readonly calibrationVersion?: number | null;
  readonly certificationState?: string;
  readonly publicationState?: string;
  readonly retirementState?: string;
  readonly semanticFamilyDecision?: string;
  readonly assetReadiness?: string;
  readonly testletId?: string | null;
  readonly omitReviewScope?: string;
  readonly answer?: 'A' | 'B' | 'C' | 'D';
}

function selectionRequest(
  requestId: string,
  overrides: Partial<{
    activity_role: string;
    evidence_mode: string;
    family_reuse_mode: string;
    calibration_requirement: string;
  }> = {},
) {
  return {
    request_id: requestId,
    learner_id: LEARNER_ID,
    session_id: SESSION_ID,
    requested_at: REQUESTED_AT,
    primary_construct: { construct_type: 'KC', construct_id: 'BIO_KC_001' },
    activity_role: overrides.activity_role ?? 'DIAGNOSTIC',
    evidence_mode: overrides.evidence_mode ?? 'DIAGNOSTIC',
    representations: ['TEXT'],
    context_domains: ['LAB'],
    calibration_requirement: overrides.calibration_requirement ?? 'REQUIRED_OPERATIONAL',
    family_reuse_mode: overrides.family_reuse_mode ?? 'FRESH_ONLY',
    content_release: 'v7-reviewed-1',
    content_cutoff: REQUESTED_AT,
    policy_cutoff: REQUESTED_AT,
    policy_versions: {
      eligibility_policy_version: 'ELIGIBILITY_V1',
      selection_policy_version: 'SELECTION_V1',
      exposure_policy_version: 'EXPOSURE_V1',
    },
  };
}

describeWithPostgres('question serving authorization', () => {
  let pool: PostgresPool;
  let suiteLock: PoolClient;

  beforeAll(async () => {
    pool = createPgPool({
      connectionString: DATABASE_URL!,
      tls: false,
      applicationName: 'mcat-question-serving-integration-test',
      maxConnections: 10,
      statementTimeoutMs: 8_000,
      lockTimeoutMs: 3_000,
      idleInTransactionTimeoutMs: 8_000,
    });
    suiteLock = await pool.connect();
    await suiteLock.query('set lock_timeout = 0');
    await suiteLock.query('select pg_advisory_lock(72004002)');
  });

  afterAll(async () => {
    await suiteLock.query('select pg_advisory_unlock(72004002)');
    suiteLock.release();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('truncate table learners, questions cascade');
    await pool.query(
      `insert into learners (learner_id, account_state, created_at, updated_at)
       values ($1::uuid, 'guest', $2::timestamptz, $2::timestamptz)`,
      [LEARNER_ID, MATERIALIZED_AT],
    );
  });

  async function addSyntheticVersion(options: SyntheticVersionOptions): Promise<void> {
    const itemVersion = options.itemVersion ?? 1;
    const testletId = options.testletId ?? null;
    await pool.query(
      `insert into questions (
         question_id, section, cluster, kc_id, family_id, stem, passage, choices, assets, status
       ) values ($1, 'bb', 'BB1', 'BIO_KC_001', $2, $3, '', $4::jsonb, '[]'::jsonb, 'synthetic')
       on conflict (question_id) do nothing`,
      [
        options.questionId,
        options.familyId,
        `Synthetic stem for ${options.questionId}?`,
        JSON.stringify({ A: 'One', B: 'Two', C: 'Three', D: 'Four' }),
      ],
    );

    const columns = [
      'question_id',
      'item_version',
      'content_version',
      'content_hash',
      'content_release',
      'content_published_at',
      'mapping_version',
      'mapping_hash',
      'calibration_version',
      'calibration_status',
      'primary_construct_type',
      'primary_construct_id',
      'joint_scoring_semantics',
      'family_id',
      'family_version',
      'semantic_family_decision',
      'semantic_family_decision_version',
      'stimulus_id',
      'stimulus_version',
      'testlet_id',
      'testlet_version',
      'local_dependence',
      'representation',
      'context_domain',
      'allowed_activity_roles',
      'allowed_evidence_modes',
      'rights_status',
      'model_processing_rights',
      'rights_review_version',
      'accessibility_status',
      'accessibility_equivalence_version',
      'accessibility_equivalence_hash',
      'certification_state',
      'publication_state',
      'retirement_state',
      'asset_manifest_digest',
      'asset_readiness',
      'source_ledger_digest',
      'review_report_digest',
      'learner_stem',
      'learner_passage',
      'learner_choices',
      'learner_assets',
      'materialized_at',
    ] as const;
    const values: readonly unknown[] = [
      options.questionId,
      itemVersion,
      itemVersion,
      DIGEST,
      'v7-reviewed-1',
      options.contentPublishedAt ?? MATERIALIZED_AT,
      itemVersion,
      DIGEST,
      options.calibrationVersion === undefined ? 1 : options.calibrationVersion,
      options.calibrationStatus ?? 'OPERATIONAL',
      'KC',
      'BIO_KC_001',
      'PRIMARY_ONLY',
      options.familyId,
      1,
      options.semanticFamilyDecision ?? 'CONFIRMED',
      1,
      null,
      null,
      testletId,
      testletId === null ? null : 1,
      testletId === null ? 'INDEPENDENT' : 'TESTLET',
      'TEXT',
      'LAB',
      ['DIAGNOSTIC', 'REHEARSAL'],
      ['DIAGNOSTIC', 'REHEARSAL_ONLY'],
      options.rightsStatus ?? 'CLEARED',
      'ALLOWED',
      1,
      options.accessibilityStatus ?? 'EQUIVALENT',
      1,
      DIGEST,
      options.certificationState ?? 'CERTIFIED',
      options.publicationState ?? 'PUBLISHED',
      options.retirementState ?? 'ACTIVE',
      DIGEST,
      options.assetReadiness ?? 'NOT_REQUIRED',
      DIGEST,
      DIGEST,
      `Synthetic stem for ${options.questionId}?`,
      '',
      JSON.stringify({ A: 'One', B: 'Two', C: 'Three', D: 'Four' }),
      JSON.stringify([]),
      options.materializedAt ?? MATERIALIZED_AT,
    ];
    await pool.query(
      `insert into question_serving_versions (${columns.join(', ')})
       values (${values.map((_, index) => `$${index + 1}`).join(', ')})`,
      [...values],
    );

    for (const scope of [
      'CONTENT',
      'MAPPING',
      'FAMILY',
      'RIGHTS',
      'ACCESSIBILITY',
      'CERTIFICATION',
      'ASSETS',
      'SOURCE_PROVENANCE',
      'CALIBRATION',
    ]) {
      if (scope === options.omitReviewScope) continue;
      await pool.query(
        `insert into question_version_review_approvals (
           question_id, item_version, review_scope, reviewer_id,
           approval_version, approved_at, approval_digest, materialized_at
         ) values (
           $1, $2, $3, 'synthetic-reviewer', 1, $4::timestamptz, $5, $4::timestamptz
         )`,
        [options.questionId, itemVersion, scope, MATERIALIZED_AT, DIGEST],
      );
    }
    await pool.query(
      `insert into question_protected_versions (
         question_id, item_version, answer_version, answer_hash, correct_answer,
         explanations, materialized_at
       ) values ($1, $2, $2, $3, $4, $5::jsonb, $6::timestamptz)`,
      [
        options.questionId,
        itemVersion,
        DIGEST,
        options.answer ?? 'B',
        JSON.stringify({
          A: 'Synthetic A explanation.',
          B: 'Synthetic B explanation.',
          C: 'Synthetic C explanation.',
          D: 'Synthetic D explanation.',
        }),
        MATERIALIZED_AT,
      ],
    );
  }

  const authorityOptions = {
    selectionAuthoritySecret: SECRET,
    now: () => new Date(REQUESTED_AT),
  };

  it('authorizes atomically and replays the same receipt after a lost response', async () => {
    await addSyntheticVersion({
      questionId: 'synthetic-idempotent',
      familyId: 'synthetic-family-idempotent',
    });
    const request = selectionRequest('40000000-0000-4000-8000-000000000010');

    const first = await authorizeQuestionPresentation(pool, request, authorityOptions);
    // Simulate a crash/lost response by discarding `first`, then retry exactly.
    const replay = await authorizeQuestionPresentation(pool, request, authorityOptions);
    const counts = await pool.query<{
      reservations: string;
      exposures: string;
      presentations: string;
    }>(`
      select
        (select count(*) from learner_question_family_reservations)::text as reservations,
        (select count(*) from question_family_exposures)::text as exposures,
        (select count(*) from question_presentations)::text as presentations
    `);

    expect(replay).toEqual(first);
    expect(counts.rows[0]).toEqual({
      reservations: '1',
      exposures: '1',
      presentations: '1',
    });
    await expect(
      authorizeQuestionPresentation(
        pool,
        {
          ...request,
          context_domains: ['CLINICAL'],
        },
        authorityOptions,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(Object.keys(first.learner_view).sort()).toEqual(
      ['assets', 'choices', 'passage', 'presentation_id', 'stem'].sort(),
    );
    expect(JSON.stringify(first.learner_view)).not.toMatch(
      /answer|explanation|family|kc_|lesson|skill|dok|routing|certification|source/i,
    );
  });

  it('allows only one concurrent fresh presentation from a semantic family', async () => {
    await addSyntheticVersion({
      questionId: 'synthetic-concurrent-a',
      familyId: 'synthetic-family-concurrent',
    });
    await addSyntheticVersion({
      questionId: 'synthetic-concurrent-b',
      familyId: 'synthetic-family-concurrent',
    });

    const settled = await Promise.allSettled([
      authorizeQuestionPresentation(
        pool,
        selectionRequest('40000000-0000-4000-8000-000000000020'),
        authorityOptions,
      ),
      authorizeQuestionPresentation(
        pool,
        selectionRequest('40000000-0000-4000-8000-000000000021'),
        authorityOptions,
      ),
    ]);
    expect(settled.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter(({ status }) => status === 'rejected')).toHaveLength(1);

    const counts = await pool.query<{ reservations: string; exposures: string }>(`
      select
        (select count(*) from learner_question_family_reservations)::text as reservations,
        (select count(*) from question_family_exposures)::text as exposures
    `);
    expect(counts.rows[0]).toEqual({ reservations: '1', exposures: '1' });
  });

  it('treats cross-family testlet siblings as locally dependent', async () => {
    await addSyntheticVersion({
      questionId: 'synthetic-testlet-a',
      familyId: 'synthetic-family-testlet-a',
      testletId: 'synthetic-testlet',
    });
    await addSyntheticVersion({
      questionId: 'synthetic-testlet-b',
      familyId: 'synthetic-family-testlet-b',
      testletId: 'synthetic-testlet',
    });

    await authorizeQuestionPresentation(
      pool,
      selectionRequest('40000000-0000-4000-8000-000000000030'),
      authorityOptions,
    );
    await expect(
      authorizeQuestionPresentation(
        pool,
        selectionRequest('40000000-0000-4000-8000-000000000031'),
        authorityOptions,
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('models rehearsal reuse without making the family fresh again', async () => {
    await addSyntheticVersion({
      questionId: 'synthetic-rehearsal',
      familyId: 'synthetic-family-rehearsal',
    });
    const fresh = await authorizeQuestionPresentation(
      pool,
      selectionRequest('40000000-0000-4000-8000-000000000040'),
      authorityOptions,
    );
    const rehearsal = await authorizeQuestionPresentation(
      pool,
      selectionRequest('40000000-0000-4000-8000-000000000041', {
        activity_role: 'REHEARSAL',
        evidence_mode: 'REHEARSAL_ONLY',
        family_reuse_mode: 'REHEARSAL_ONLY',
      }),
      authorityOptions,
    );

    expect(fresh.receipt.exposure_mode).toBe('FRESH_EVIDENCE');
    expect(rehearsal.receipt.exposure_mode).toBe('REHEARSAL_REUSE');
    await expect(
      authorizeQuestionPresentation(
        pool,
        selectionRequest('40000000-0000-4000-8000-000000000042'),
        authorityOptions,
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
    const counts = await pool.query<{ reservations: string; exposures: string }>(`
      select
        (select count(*) from learner_question_family_reservations)::text as reservations,
        (select count(*) from question_family_exposures)::text as exposures
    `);
    expect(counts.rows[0]).toEqual({ reservations: '1', exposures: '2' });
  });

  it('invalidates scoring but retains exposure and selects an untouched replacement family', async () => {
    await addSyntheticVersion({
      questionId: 'synthetic-replacement-a',
      familyId: 'synthetic-family-replacement-a',
      answer: 'B',
    });
    await addSyntheticVersion({
      questionId: 'synthetic-replacement-b',
      familyId: 'synthetic-family-replacement-b',
      answer: 'C',
    });
    const first = await authorizeQuestionPresentation(
      pool,
      selectionRequest('40000000-0000-4000-8000-000000000050'),
      authorityOptions,
    );
    await expect(
      getVersionBoundProtectedAnswer(pool, first.presentation_id, LEARNER_ID),
    ).resolves.not.toBeNull();

    await invalidateQuestionVersion(pool, {
      invalidation_id: '40000000-0000-4000-8000-000000000051',
      question_id: first.receipt.selected.question_id,
      item_version: first.receipt.selected.item_version,
      invalidation_kind: 'QUARANTINE',
      reason_code: 'SYNTHETIC_INVALID_ITEM',
      report_digest: DIGEST,
      invalidated_by: 'synthetic-reviewer',
      invalidated_at: REQUESTED_AT,
    });
    await expect(
      getVersionBoundProtectedAnswer(pool, first.presentation_id, LEARNER_ID),
    ).resolves.toBeNull();
    await expect(
      authorizeQuestionPresentation(
        pool,
        selectionRequest('40000000-0000-4000-8000-000000000050'),
        authorityOptions,
      ),
    ).rejects.toMatchObject({ code: 'not_found' });

    const replacement = await authorizeQuestionPresentation(
      pool,
      selectionRequest('40000000-0000-4000-8000-000000000052'),
      authorityOptions,
    );
    expect(replacement.receipt.selected.family_id).not.toBe(first.receipt.selected.family_id);
    const exposureCount = await pool.query<{ count: string }>(
      'select count(*) from question_family_exposures',
    );
    expect(exposureCount.rows[0]?.count).toBe('2');
  });

  it('excludes missing review, rights, accessibility, calibration, stale, and retired rows', async () => {
    await pool.query(
      `insert into questions (
         question_id, section, cluster, kc_id, family_id, stem, passage, choices, assets, status
       ) values (
         'synthetic-no-version', 'bb', 'BB1', 'BIO_KC_001', 'synthetic-family-no-version',
         'Synthetic no version?', '', '{"A":"1","B":"2","C":"3","D":"4"}'::jsonb,
         '[]'::jsonb, 'synthetic'
       )`,
    );
    await addSyntheticVersion({
      questionId: 'synthetic-missing-review',
      familyId: 'synthetic-family-missing-review',
      omitReviewScope: 'RIGHTS',
    });
    await addSyntheticVersion({
      questionId: 'synthetic-rights',
      familyId: 'synthetic-family-rights',
      rightsStatus: 'PENDING',
    });
    await addSyntheticVersion({
      questionId: 'synthetic-accessibility',
      familyId: 'synthetic-family-accessibility',
      accessibilityStatus: 'PENDING',
    });
    await addSyntheticVersion({
      questionId: 'synthetic-calibration',
      familyId: 'synthetic-family-calibration',
      calibrationStatus: 'NOT_REVIEWED',
      calibrationVersion: null,
    });
    await addSyntheticVersion({
      questionId: 'synthetic-retired',
      familyId: 'synthetic-family-retired',
      retirementState: 'RETIRED',
    });
    await addSyntheticVersion({
      questionId: 'synthetic-quarantined',
      familyId: 'synthetic-family-quarantined',
      retirementState: 'QUARANTINED',
    });
    await addSyntheticVersion({
      questionId: 'synthetic-draft',
      familyId: 'synthetic-family-draft',
      certificationState: 'DRAFT',
      publicationState: 'UNPUBLISHED',
    });
    await addSyntheticVersion({
      questionId: 'synthetic-stale',
      familyId: 'synthetic-family-stale-v1',
      itemVersion: 1,
    });
    await addSyntheticVersion({
      questionId: 'synthetic-stale',
      familyId: 'synthetic-family-stale-v2',
      itemVersion: 2,
      rightsStatus: 'PENDING',
      contentPublishedAt: '2026-07-23T19:00:00.000Z',
      materializedAt: '2026-07-23T19:00:00.000Z',
    });
    await addSyntheticVersion({
      questionId: 'synthetic-only-eligible',
      familyId: 'synthetic-family-only-eligible',
    });

    const selected = await authorizeQuestionPresentation(
      pool,
      selectionRequest('40000000-0000-4000-8000-000000000060'),
      authorityOptions,
    );
    expect(selected.receipt.selected.question_id).toBe('synthetic-only-eligible');
  });

  it('keeps reviewed version metadata immutable and closes reviewed mappings', async () => {
    await addSyntheticVersion({
      questionId: 'synthetic-immutable',
      familyId: 'synthetic-family-immutable',
    });

    await expect(
      pool.query(
        `update question_serving_versions
         set family_id = 'synthetic-mutated-family'
         where question_id = 'synthetic-immutable' and item_version = 1`,
      ),
    ).rejects.toMatchObject({ code: '55000' });
    await expect(
      pool.query(
        `insert into question_version_mappings (
           question_id, item_version, mapping_role, construct_type,
           construct_id, joint_scored, materialized_at
         ) values (
           'synthetic-immutable', 1, 'INCIDENTAL', 'SKILL',
           'SIRS1', false, $1::timestamptz
         )`,
        [MATERIALIZED_AT],
      ),
    ).rejects.toMatchObject({ code: '55000' });
  });

  it('returns metadata-only authoring inventory for gaps, families, reviews, and assets', async () => {
    await addSyntheticVersion({
      questionId: 'synthetic-inventory-a',
      familyId: 'synthetic-family-inventory',
    });
    await addSyntheticVersion({
      questionId: 'synthetic-inventory-b',
      familyId: 'synthetic-family-inventory',
    });
    await pool.query(
      `insert into questions (
         question_id, section, cluster, kc_id, family_id, stem, passage, choices, assets, status
       ) values (
         'synthetic-inventory-no-version', 'bb', 'BB1', 'BIO_KC_001',
         'synthetic-family-no-version', 'Synthetic inventory gap?', '',
         '{"A":"1","B":"2","C":"3","D":"4"}'::jsonb, '[]'::jsonb, 'synthetic'
       )`,
    );

    const eligibility = await listQuestionEligibilityInventory(pool, {
      canonical_kc_id: 'BIO_KC_001',
      activity_role: null,
      eligibility_gap: null,
    });
    const families = await listQuestionFamilyOverlapInventory(pool, 'synthetic-family-inventory');
    const reviews = await listQuestionReviewGapInventory(pool, 'BIO_KC_001');
    const assets = await listQuestionAssetReadinessInventory(pool, 'NOT_REQUIRED');

    expect(
      eligibility.some(
        ({ eligibility_gap, question_ids }) =>
          eligibility_gap === 'MISSING_VERSION_METADATA' &&
          question_ids.includes('synthetic-inventory-no-version'),
      ),
    ).toBe(true);
    expect(families[0]).toMatchObject({
      family_id: 'synthetic-family-inventory',
      question_count: 2,
    });
    expect(reviews).toContainEqual(
      expect.objectContaining({
        question_id: 'synthetic-inventory-no-version',
        missing_version_metadata: true,
      }),
    );
    expect(assets[0]).toMatchObject({ asset_readiness: 'NOT_REQUIRED', question_count: 2 });
    expect(JSON.stringify({ eligibility, families, reviews, assets })).not.toMatch(
      /correct_answer|explanations/,
    );
  });
});
