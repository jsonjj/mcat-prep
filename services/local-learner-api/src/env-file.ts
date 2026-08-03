import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateMissingSecrets, type GeneratedSecret } from './environment';

/**
 * The repo-root `.env.local` that configures the whole local stack.
 *
 * Both entrypoints in this package read the same file: the API server needs the
 * database and Supabase settings, and `pnpm db:migrate` needs the same
 * `DATABASE_URL` it will then be pointed at. Keeping them together is the reason
 * this package owns the migration runner as well as the server.
 *
 * The parser is deliberately about twenty lines rather than a `dotenv`
 * dependency. It only ever reads a developer's own file, it is never on a
 * deployed path — Lambda gets its configuration from Secrets Manager — and the
 * file's grammar is `KEY=value`.
 */

/** `services/local-learner-api/src` → repo root. */
export function repoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

export function envFilePath(): string {
  return join(repoRoot(), '.env.local');
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.length >= 2 && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^export\s+/, '');
    if (line === '' || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    result[line.slice(0, separator).trim()] = unquote(line.slice(separator + 1));
  }
  return result;
}

/**
 * Merge `.env.local` into `process.env`. A variable already set in the real
 * environment wins, so a one-off `DATABASE_URL=... pnpm db:migrate` still points
 * where the developer asked rather than at the file.
 */
export function loadEnvFile(path: string = envFilePath()): void {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const [name, value] of Object.entries(parseEnvFile(contents))) {
    if (process.env[name] === undefined) process.env[name] = value;
  }
}

/** Append newly generated values so the next run reads the same ones back. */
export function appendEnvFile(
  path: string,
  entries: readonly GeneratedSecret[],
  note: string,
): void {
  const block = [
    '',
    `# ${note}`,
    ...entries.map((entry) => `${entry.name}=${entry.value}`),
    '',
  ].join('\n');
  appendFileSync(path, block, { encoding: 'utf8', mode: 0o600 });
}

/**
 * Put the two shared secrets in the file if they are not there yet, and in
 * `process.env` either way.
 *
 * `pnpm dev` runs this before it starts anything, because the API process and
 * the Vite proxy both need `ORIGIN_VERIFICATION_SECRET` and Vite reads its
 * configuration exactly once. Generating them inside the API instead would mean
 * the very first run always ended in a restart.
 */
export function ensureGeneratedSecrets(): readonly GeneratedSecret[] {
  loadEnvFile();
  const generated = generateMissingSecrets();
  if (generated.length > 0) {
    appendEnvFile(
      envFilePath(),
      generated,
      'Generated on first run. The Vite proxy reads ORIGIN_VERIFICATION_SECRET from here too.',
    );
    for (const secret of generated) process.env[secret.name] = secret.value;
  }
  return generated;
}
