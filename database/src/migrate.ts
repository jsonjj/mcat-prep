import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MIGRATION_ADVISORY_LOCK_ID = 72_004_001;

export interface MigrationQueryResult<Row extends Record<string, unknown>> {
  readonly rows: Row[];
}

export interface MigrationClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<MigrationQueryResult<Row>>;
  release(): void;
}

export interface MigrationPool {
  connect(): Promise<MigrationClient>;
}

interface AppliedMigrationRow extends Record<string, unknown> {
  version: string;
  checksum: string;
}

const CREATE_MIGRATIONS_TABLE = `
create table if not exists authority_schema_migrations (
  version text primary key,
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz not null default clock_timestamp()
)`;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function migrationFilenames(migrationsDir: string): Promise<string[]> {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^\d+_[a-z0-9][a-z0-9_-]*\.sql$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export async function runMigrations(pool: MigrationPool, migrationsDir: string): Promise<void> {
  const client = await pool.connect();
  let advisoryLockHeld = false;

  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_ID]);
    advisoryLockHeld = true;
    await client.query(CREATE_MIGRATIONS_TABLE);

    const appliedResult = await client.query<AppliedMigrationRow>(
      'select version, checksum from authority_schema_migrations order by version',
    );
    const applied = new Map(
      appliedResult.rows.map(({ version, checksum }) => [version, checksum] as const),
    );

    for (const filename of await migrationFilenames(migrationsDir)) {
      const bytes = await readFile(join(migrationsDir, filename));
      const checksum = sha256(bytes);
      const existingChecksum = applied.get(filename);

      if (existingChecksum !== undefined) {
        if (existingChecksum !== checksum) {
          throw new Error(`Checksum drift detected for migration ${filename}`);
        }
        continue;
      }

      await client.query('begin');
      try {
        await client.query(bytes.toString('utf8'));
        await client.query(
          `insert into authority_schema_migrations (version, checksum)
           values ($1, $2)`,
          [filename, checksum],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    try {
      if (advisoryLockHeld) {
        await client.query('select pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_ID]);
      }
    } finally {
      client.release();
    }
  }
}
