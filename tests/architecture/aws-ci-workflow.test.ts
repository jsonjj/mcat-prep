import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('AWS backend CI database lifecycle', () => {
  it('lets the migration runtime initialize a clean database before repository integrations', () => {
    const workflow = readFileSync(join(root, '.github/workflows/aws-backend-ci.yml'), 'utf8');
    const sourceVerification = workflow.indexOf('- name: Verify source and contracts');
    const migrationVerification = workflow.indexOf('- name: Verify migration runtime privileges');
    const repositoryIntegrations = workflow.indexOf(
      '- name: Verify PostgreSQL authority integrations',
    );

    expect(workflow).not.toContain('- name: Apply PostgreSQL migrations');
    expect(workflow).toContain('env -u TEST_DATABASE_URL pnpm run verify');
    expect(migrationVerification).toBeGreaterThan(sourceVerification);
    expect(repositoryIntegrations).toBeGreaterThan(migrationVerification);
    expect(workflow).toContain('services/lambdas/migration/src/runtime.integration.test.ts');
  });

  it('runs the structural lesson-catalog gate fail-fast and DB-independently, before the database integrations', () => {
    const workflow = readFileSync(join(root, '.github/workflows/aws-backend-ci.yml'), 'utf8');
    const sourceVerification = workflow.indexOf('- name: Verify source and contracts');
    const lessonValidation = workflow.indexOf('- name: Validate lesson catalog structure');
    const migrationVerification = workflow.indexOf('- name: Verify migration runtime privileges');

    // The merge gate invokes the exact CLI that local `lesson-validate` uses, with
    // TEST_DATABASE_URL stripped — structural validation never touches the database.
    expect(workflow).toContain(
      'env -u TEST_DATABASE_URL pnpm --filter @mcat/content-cli start lesson-validate',
    );
    // Fail fast on malformed content after the validator has compiled (source/contract
    // verification) but before a Postgres service is spent on migration/repository work.
    expect(lessonValidation).toBeGreaterThan(sourceVerification);
    expect(migrationVerification).toBeGreaterThan(lessonValidation);
  });
});
