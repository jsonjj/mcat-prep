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
});
