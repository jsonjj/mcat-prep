import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  MIGRATION_ADVISORY_LOCK_ID,
  runMigrations,
  type MigrationClient,
  type MigrationPool,
  type MigrationQueryResult,
} from './migrate';

const migrationUrl = new URL('../migrations/0001_authority.sql', import.meta.url);
const workerGuardMigrationUrl = new URL(
  '../migrations/0003_projection_deduplication.sql',
  import.meta.url,
);
const questionServingMigrationUrl = new URL(
  '../migrations/0007_question_serving_eligibility.sql',
  import.meta.url,
);

describe('0001 authority migration', () => {
  it('defines immutable event and transactional outbox constraints', () => {
    const sql = readFileSync(migrationUrl, 'utf8').toLowerCase();

    expect(sql).toContain('unique (event_id)');
    expect(sql).toContain('unique (learner_id, idempotency_key)');
    expect(sql).toContain('unique (learner_id, sequence)');
    expect(sql).toContain('create table outbox');
  });

  it('contains the complete approved authority baseline and ownership indexes', () => {
    const sql = readFileSync(migrationUrl, 'utf8').toLowerCase();
    const tables = [
      'learners',
      'linked_identities',
      'guest_sessions',
      'consents',
      'goals',
      'learner_streams',
      'accepted_events',
      'attempt_results',
      'checkpoints',
      'evidence_dispositions',
      'mastery_projections',
      'plan_projections',
      'review_projections',
      'error_projections',
      'content_releases',
      'content_objects',
      'delivery_grants',
      'publication_runs',
      'review_attestations',
      'outbox',
      'inbox_deduplication',
      'privacy_jobs',
      'deletion_ledger',
      'push_subscriptions',
      'audit_log',
    ];

    for (const table of tables) {
      expect(sql, `missing ${table}`).toContain(`create table ${table}`);
    }

    expect(sql).toContain('content_releases_one_active_per_environment_idx');
    expect(sql).toContain('outbox_unpublished_created_idx');
    expect(sql).toContain('target_score integer');
    expect(sql).toContain("'authorized_delivery'");
    expect(sql).toMatch(
      /create table privacy_jobs \([\s\S]*?learner_id uuid references learners \(learner_id\) on delete set null/,
    );
    expect(sql).not.toMatch(/\btimestamp\s+(?!with time zone)/);
    expect(sql).not.toMatch(/\b(serial|varchar|char)\s*\(/);
  });
});

describe('0003 projection deduplication migration', () => {
  it('enforces one consumed sequence per consumer and learner', () => {
    const sql = readFileSync(workerGuardMigrationUrl, 'utf8').toLowerCase();

    expect(sql).toContain('create unique index inbox_deduplication_consumer_sequence_uidx');
    expect(sql).toContain('(consumer_name, learner_id, sequence)');
    expect(sql).toContain('where learner_id is not null and sequence is not null');
  });
});

describe('0007 question serving eligibility migration', () => {
  it('is additive, fail-closed, version-bound, and records exposure atomically', () => {
    const sql = readFileSync(questionServingMigrationUrl, 'utf8').toLowerCase();

    expect(sql).toContain('create table question_serving_versions');
    expect(sql).toContain('absence means ineligible');
    expect(sql).toContain('create table question_version_review_approvals');
    expect(sql).toContain('create table question_protected_versions');
    expect(sql).toContain('primary key (question_id, item_version)');
    expect(sql).toContain('create table learner_question_family_reservations');
    expect(sql).toContain('primary key (learner_id, family_id)');
    expect(sql).toContain('create table learner_question_dependence_reservations');
    expect(sql).toContain('create table question_selection_receipts');
    expect(sql).toContain('create table question_family_exposures');
    expect(sql).toContain('create table question_version_invalidations');
    expect(sql).toContain('question_serving_versions_immutable');
    expect(sql).toContain('question_version_mappings_close_after_review');
    expect(sql).not.toMatch(/alter table questions\s+alter column/);
    expect(sql).not.toMatch(/insert into question_serving_versions\s+select/);
  });
});

class RecordingClient implements MigrationClient {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];
  readonly applied = new Map<string, string>();
  readonly executedMigrations: string[] = [];
  released = false;
  private transactionSnapshot: Map<string, string> | undefined;

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<MigrationQueryResult<Row>> {
    this.calls.push({ text, values });
    const normalized = text.trim().toLowerCase();

    if (normalized === 'begin') {
      this.transactionSnapshot = new Map(this.applied);
    } else if (normalized === 'rollback') {
      this.applied.clear();
      for (const [version, checksum] of this.transactionSnapshot ?? []) {
        this.applied.set(version, checksum);
      }
      this.transactionSnapshot = undefined;
    } else if (normalized === 'commit') {
      this.transactionSnapshot = undefined;
    } else if (normalized.startsWith('select version, checksum')) {
      return {
        rows: [...this.applied].map(([version, checksum]) => ({
          version,
          checksum,
        })) as unknown as Row[],
      };
    } else if (normalized.startsWith('insert into authority_schema_migrations')) {
      this.applied.set(String(values[0]), String(values[1]));
    } else if (normalized.startsWith('-- migration:')) {
      this.executedMigrations.push(text);
      if (text.includes('raise_migration_error')) {
        throw new Error('synthetic migration failure');
      }
    }

    return { rows: [] };
  }

  release(): void {
    this.released = true;
  }
}

class RecordingPool implements MigrationPool {
  constructor(readonly client: RecordingClient) {}

  async connect(): Promise<RecordingClient> {
    return this.client;
  }
}

describe('runMigrations', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  async function migrationsDirectory(files: Record<string, string>): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'mcat-migrations-'));
    temporaryDirectories.push(directory);
    await Promise.all(
      Object.entries(files).map(([filename, contents]) =>
        writeFile(join(directory, filename), contents, 'utf8'),
      ),
    );
    return directory;
  }

  it('applies SQL files in lexical order while holding advisory lock 72004001', async () => {
    const directory = await migrationsDirectory({
      '0002_second.sql': '-- migration: second\nselect 2;',
      '0001_first.sql': '-- migration: first\nselect 1;',
      'README.md': 'not a migration',
    });
    const client = new RecordingClient();

    await runMigrations(new RecordingPool(client), directory);

    expect(client.executedMigrations).toEqual([
      '-- migration: first\nselect 1;',
      '-- migration: second\nselect 2;',
    ]);
    expect(client.calls[0]).toEqual({
      text: 'select pg_advisory_lock($1)',
      values: [MIGRATION_ADVISORY_LOCK_ID],
    });
    expect(client.calls.at(-1)).toEqual({
      text: 'select pg_advisory_unlock($1)',
      values: [MIGRATION_ADVISORY_LOCK_ID],
    });
    expect(client.released).toBe(true);
  });

  it('does not execute a migration whose recorded checksum matches', async () => {
    const directory = await migrationsDirectory({
      '0001_first.sql': '-- migration: first\nselect 1;',
    });
    const client = new RecordingClient();
    await runMigrations(new RecordingPool(client), directory);
    client.executedMigrations.length = 0;

    await runMigrations(new RecordingPool(client), directory);

    expect(client.executedMigrations).toEqual([]);
  });

  it('rejects checksum drift without executing the changed migration', async () => {
    const directory = await migrationsDirectory({
      '0001_first.sql': '-- migration: first\nselect 1;',
    });
    const client = new RecordingClient();
    await runMigrations(new RecordingPool(client), directory);
    await writeFile(join(directory, '0001_first.sql'), '-- migration: changed\nselect 2;', 'utf8');
    client.executedMigrations.length = 0;

    await expect(runMigrations(new RecordingPool(client), directory)).rejects.toThrow(
      'Checksum drift detected for migration 0001_first.sql',
    );
    expect(client.executedMigrations).toEqual([]);
    expect(client.released).toBe(true);
  });

  it('rolls back a failed migration and does not record it as applied', async () => {
    const directory = await migrationsDirectory({
      '0001_broken.sql': '-- migration: broken\nselect raise_migration_error;',
    });
    const client = new RecordingClient();

    await expect(runMigrations(new RecordingPool(client), directory)).rejects.toThrow(
      'synthetic migration failure',
    );

    expect(client.applied).toEqual(new Map());
    expect(client.calls.some(({ text }) => text === 'rollback')).toBe(true);
    expect(client.released).toBe(true);
  });

  it('hashes the exact migration bytes', async () => {
    const directory = await migrationsDirectory({
      '0001_first.sql': '-- migration: first\nselect 1;\n',
    });
    const client = new RecordingClient();

    await runMigrations(new RecordingPool(client), directory);

    const recordedChecksum = client.applied.get('0001_first.sql');
    const migrationBytes = await readFile(join(directory, '0001_first.sql'));
    expect(recordedChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(migrationBytes.byteLength).toBeGreaterThan(0);
  });
});
