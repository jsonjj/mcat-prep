/**
 * Pin Supabase's public JWT signing keys into the learner API's configuration
 * secret.
 *
 * The API verifies learner tokens offline because its subnets have no egress, so
 * the key set has to be delivered to it rather than fetched. This script is that
 * delivery: it reads the project's public JWKS and writes it, with the project
 * URL, into Secrets Manager.
 *
 * Run it after the first deploy, and again whenever Supabase rotates its signing
 * keys. Supabase rotation is staged — a standby key is published before it starts
 * signing, and the previous key keeps verifying existing tokens — so running this
 * while the standby key is visible pins both and makes the rotation seamless.
 *
 *   pnpm supabase:sync-jwks <project-ref> [--secret-name <name>] [--dry-run]
 *
 * It lives inside this package rather than in `scripts/` so the AWS SDK, `jose`,
 * and the shared JWKS reader all resolve from the package that owns them.
 */
import { PutSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

import { parseSupabaseConfig } from './auth/supabase';
import { fetchSupabaseJwks, supabaseJwksUrl, supabaseProjectUrl } from './auth/supabase-jwks';

const DEFAULT_SECRET_NAME = '/mcat/dev/supabase/learner-api';
const REGION = process.env.AWS_REGION ?? 'us-east-1';

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(message: string): never {
  console.error(`${message}\n`);
  console.error('Usage: pnpm supabase:sync-jwks <project-ref> [--secret-name <name>] [--dry-run]');
  process.exit(1);
}

const args = process.argv.slice(2);
const projectRef = args.find((arg) => !arg.startsWith('--'));
const dryRun = args.includes('--dry-run');
const secretNameIndex = args.indexOf('--secret-name');
const secretName = secretNameIndex === -1 ? DEFAULT_SECRET_NAME : args[secretNameIndex + 1];

if (projectRef === undefined) fail('Missing <project-ref>.');
if (secretName === undefined) fail('--secret-name needs a value.');

let projectUrl: string;
try {
  projectUrl = supabaseProjectUrl(projectRef);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

say(`Fetching ${supabaseJwksUrl(projectUrl)}`);
const jwks = await fetchSupabaseJwks(projectUrl).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

const payload = JSON.stringify({ projectUrl, jwks });
// The runtime refuses a malformed secret at cold start, which would take sign-in
// down until someone noticed. Applying the same parse here turns that into a
// failed sync instead.
parseSupabaseConfig(payload);

const summary = jwks.keys.map((key) => `${key.kid ?? '(no kid)'} [${key.alg ?? key.kty}]`);
say(`Found ${jwks.keys.length} public key(s): ${summary.join(', ')}`);

if (dryRun) {
  say(`Dry run, not writing. Payload would be:\n${payload}`);
  process.exit(0);
}

const client = new SecretsManagerClient({ region: REGION });
await client.send(new PutSecretValueCommand({ SecretId: secretName, SecretString: payload }));
say(`Wrote ${secretName} in ${REGION}.`);
say('The change takes effect on the next Lambda cold start.');
