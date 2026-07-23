import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('verifies bundles when the project path contains spaces', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'bundle verifier '));
  const serverDirectory = join(fixtureRoot, 'server');
  const assetsDirectory = join(fixtureRoot, 'dist', 'assets');
  const verifier = join(serverDirectory, 'verify-client-bundle.mjs');

  try {
    mkdirSync(serverDirectory);
    mkdirSync(assetsDirectory, { recursive: true });
    copyFileSync(
      fileURLToPath(new URL('./verify-client-bundle.mjs', import.meta.url)),
      verifier,
    );
    writeFileSync(join(assetsDirectory, 'index.js'), 'console.log("safe");\n');

    const result = spawnSync(process.execPath, [verifier], { encoding: 'utf8' });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Snapshot bundle boundary OK');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
