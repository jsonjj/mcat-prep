import { describe, expect, it } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';

import {
  QUESTION_ASSET_READINESS_INVENTORY_SQL,
  QUESTION_ELIGIBILITY_INVENTORY_SQL,
  QUESTION_FAMILY_OVERLAP_INVENTORY_SQL,
  QUESTION_REVIEW_GAP_INVENTORY_SQL,
} from './question-inventory-repository';
import {
  VERSION_BOUND_PROTECTED_ANSWER_SQL,
  getVersionBoundProtectedAnswer,
} from './question-scoring-repository';
import {
  ELIGIBLE_QUESTION_CANDIDATES_SQL,
  authorizeQuestionPresentation,
  invalidateQuestionVersion,
} from './question-serving-repository';

const NOW = '2026-07-23T20:00:00.000Z';

function request() {
  return {
    request_id: '30000000-0000-4000-8000-000000000001',
    learner_id: '30000000-0000-4000-8000-000000000002',
    session_id: '30000000-0000-4000-8000-000000000003',
    requested_at: NOW,
    primary_construct: { construct_type: 'KC', construct_id: 'BIO_KC_001' },
    activity_role: 'DIAGNOSTIC',
    evidence_mode: 'DIAGNOSTIC',
    representations: ['TEXT'],
    context_domains: ['LAB'],
    calibration_requirement: 'REQUIRED_OPERATIONAL',
    family_reuse_mode: 'FRESH_ONLY',
    content_release: 'v7-reviewed-1',
    content_cutoff: NOW,
    policy_cutoff: NOW,
    policy_versions: {
      eligibility_policy_version: 'ELIGIBILITY_V1',
      selection_policy_version: 'SELECTION_V1',
      exposure_policy_version: 'EXPOSURE_V1',
    },
  };
}

describe('eligible question SQL boundary', () => {
  it('contains every fail-closed gate and uses placeholders for request values', () => {
    const sql = ELIGIBLE_QUESTION_CANDIDATES_SQL.toLowerCase();
    for (const gate of [
      'primary_construct_type = $2',
      'primary_construct_id = $3',
      '$4 = any(v.allowed_activity_roles)',
      '$5 = any(v.allowed_evidence_modes)',
      'v.representation = any($6::text[])',
      'v.context_domain = any($7::text[])',
      "v.semantic_family_decision = 'confirmed'",
      "v.rights_status = 'cleared'",
      "v.model_processing_rights = 'allowed'",
      'v.accessibility_status in',
      "v.certification_state = 'certified'",
      "v.publication_state = 'published'",
      "v.retirement_state = 'active'",
      'v.asset_readiness in',
      'question_version_review_approvals',
      'question_protected_versions',
      'protected_version.materialized_at <= $12',
      'late_mapping.materialized_at > $12',
      'question_version_invalidations',
      'newer.item_version > v.item_version',
      'learner_question_family_reservations',
      'learner_question_dependence_reservations',
      "$11 = 'rehearsal_only'",
    ]) {
      expect(sql, `missing gate: ${gate}`).toContain(gate);
    }
    expect(sql).not.toContain('BIO_KC_001');
    expect(sql).not.toContain('v7-reviewed-1');
  });

  it('projects no answer/key/explanation fields into authority candidates', () => {
    const projection = ELIGIBLE_QUESTION_CANDIDATES_SQL.split(/\bfrom\b/i)[0]!.toLowerCase();
    expect(projection).not.toMatch(/correct|answer|explanation|rationale|generation|reviewer/);
    expect(projection).not.toContain('primary_construct');
    expect(projection).not.toContain('allowed_activity_roles');
    expect(projection).not.toContain('certification_state');
  });

  it('binds all selector constraints as parameters and rolls back no-candidate requests', async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const client = {
      query: async (sql: string, params: readonly unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes('insert into question_selection_requests')) {
          return { rows: [{ request_digest: 'a'.repeat(64) }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => undefined,
    } as unknown as PoolClient;
    const pool = { connect: async () => client } as unknown as Pool;

    await expect(
      authorizeQuestionPresentation(pool, request(), {
        selectionAuthoritySecret: 'synthetic-authority-secret-that-is-long-enough',
        now: () => new Date(NOW),
      }),
    ).rejects.toMatchObject({ code: 'not_found' });

    const candidateCall = calls.find(({ sql }) => sql === ELIGIBLE_QUESTION_CANDIDATES_SQL);
    expect(candidateCall?.params).toEqual([
      request().learner_id,
      'KC',
      'BIO_KC_001',
      'DIAGNOSTIC',
      'DIAGNOSTIC',
      ['TEXT'],
      ['LAB'],
      'REQUIRED_OPERATIONAL',
      'v7-reviewed-1',
      NOW,
      'FRESH_ONLY',
      NOW,
      [
        'CONTENT',
        'MAPPING',
        'FAMILY',
        'RIGHTS',
        'ACCESSIBILITY',
        'CERTIFICATION',
        'ASSETS',
        'SOURCE_PROVENANCE',
      ],
    ]);
    expect(calls.at(-1)?.sql).toBe('rollback');
    expect(
      calls.some(({ sql }) => sql.toLowerCase().includes('insert into question_family_exposures')),
    ).toBe(false);
  });
});

describe('protected scoring isolation', () => {
  it('joins presentation to both exact version keys and fails after invalidation', () => {
    const sql = VERSION_BOUND_PROTECTED_ANSWER_SQL.toLowerCase();
    expect(sql).toContain('a.question_id = p.question_id');
    expect(sql).toContain('a.item_version = p.item_version');
    expect(sql).toContain('p.presentation_id = $1::uuid');
    expect(sql).toContain('p.learner_id = $2::uuid');
    expect(sql).toContain('question_version_invalidations');
  });

  it('uses only presentation and learner identity as caller inputs', async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [] } as unknown as QueryResult;
      },
    } as unknown as Pool;

    await expect(
      getVersionBoundProtectedAnswer(
        pool,
        '30000000-0000-4000-8000-000000000004',
        request().learner_id,
      ),
    ).resolves.toBeNull();
    expect(calls[0]?.params).toEqual([
      '30000000-0000-4000-8000-000000000004',
      request().learner_id,
    ]);
  });
});

describe('append-only invalidation', () => {
  it('records quarantine without deleting exposure or writing learner penalties', async () => {
    const input = {
      invalidation_id: '30000000-0000-4000-8000-000000000010',
      question_id: 'synthetic-question-1',
      item_version: 1,
      invalidation_kind: 'QUARANTINE',
      reason_code: 'SYNTHETIC_INVALID_ITEM',
      report_digest: 'd'.repeat(64),
      invalidated_by: 'synthetic-reviewer',
      invalidated_at: NOW,
    };
    const calls: string[] = [];
    const pool = {
      query: async (sql: string) => {
        calls.push(sql);
        if (sql.includes('select') && sql.includes('question_version_invalidations')) {
          return { rows: [input], rowCount: 1 };
        }
        return { rows: [{ invalidation_id: input.invalidation_id }], rowCount: 1 };
      },
    } as unknown as Pool;

    await expect(invalidateQuestionVersion(pool, input)).resolves.toEqual(input);
    expect(calls.join('\n').toLowerCase()).not.toMatch(
      /delete\s+from\s+question_family_exposures|update\s+question_family_exposures/,
    );
    expect(calls.join('\n').toLowerCase()).not.toMatch(/penalty|learner_score/);
  });
});

describe('authoring inventory SQL', () => {
  it('is metadata-only, parameterized, and covers all requested inventory views', () => {
    const inventoryQueries = [
      QUESTION_ELIGIBILITY_INVENTORY_SQL,
      QUESTION_FAMILY_OVERLAP_INVENTORY_SQL,
      QUESTION_REVIEW_GAP_INVENTORY_SQL,
      QUESTION_ASSET_READINESS_INVENTORY_SQL,
    ];
    for (const sql of inventoryQueries) {
      const projection = sql.toLowerCase();
      expect(projection).not.toMatch(/\bcorrect_answer\b|\bexplanations\b/);
      expect(projection).toMatch(/\$1/);
    }
    expect(QUESTION_ELIGIBILITY_INVENTORY_SQL).toContain('canonical_kc_id');
    expect(QUESTION_ELIGIBILITY_INVENTORY_SQL).toContain('activity_role');
    expect(QUESTION_ELIGIBILITY_INVENTORY_SQL).toContain('eligibility_gap');
    expect(QUESTION_FAMILY_OVERLAP_INVENTORY_SQL).toContain('has_local_dependence');
    expect(QUESTION_REVIEW_GAP_INVENTORY_SQL).toContain('missing_review_scopes');
    expect(QUESTION_ASSET_READINESS_INVENTORY_SQL).toContain('asset_readiness');
  });
});
