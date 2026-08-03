import { Annotations } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

/**
 * Name-based handoff of the Supabase verification configuration to the learner API.
 *
 * The secret holds `{ projectUrl, jwks }` — the project URL and the *public* half
 * of Supabase's JWT signing key set. Nothing in it is confidential; it lives in
 * Secrets Manager because the Lambda has no egress and therefore cannot fetch the
 * JWKS at runtime, so the value has to be delivered with the deployment.
 *
 * It stays name-based, as the Cognito handoff was, because the identity stack
 * already depends on the API stack for its CloudFront origins (see `app.ts`); a
 * reference in the other direction would close a stack cycle.
 */

/** Secret holding `{ projectUrl, jwks }` for Supabase token verification. */
export const LEARNER_SUPABASE_SECRET_NAME = '/mcat/dev/supabase/learner-api';

/**
 * ARN pattern for the secret above. Secrets Manager appends a random six-character
 * suffix to every secret ARN, so a name-based grant has to end in a wildcard.
 */
export function learnerSupabaseSecretArnPattern(account: string, region: string): string {
  return `arn:aws:secretsmanager:${region}:${account}:secret:${LEARNER_SUPABASE_SECRET_NAME}-*`;
}

/**
 * Stands in for a real project ref until one is configured. It is a syntactically
 * valid ref so synth and the stack tests still run, but it resolves to no real
 * project, so a deployment carrying it can only fail closed: the browser's calls
 * to Supabase are refused by CSP and no token can be verified.
 */
const PLACEHOLDER_PROJECT_REF = 'unconfigured-project-ref';

/**
 * The Supabase project ref, from `-c supabaseProjectRef=...` or `cdk.json`.
 *
 * Needed at synth time rather than only at runtime because the browser talks to
 * Supabase directly, so the project origin has to be named in the CloudFront
 * response CSP. Missing config warns rather than throws: a hard failure would
 * make every unrelated synth and stack test depend on a Supabase account.
 */
export function supabaseProjectRef(scope: Construct): string {
  const value: unknown = scope.node.tryGetContext('supabaseProjectRef');
  if (typeof value === 'string' && /^[a-z]{20}$/.test(value)) return value;

  Annotations.of(scope).addWarning(
    'No `supabaseProjectRef` in CDK context, so the learner CSP and the Supabase ' +
      'configuration secret are placeholders. Sign-in will not work in this deployment. ' +
      'Pass `-c supabaseProjectRef=<ref>` to configure it.',
  );
  return PLACEHOLDER_PROJECT_REF;
}

export const supabaseProjectUrl = (ref: string): string => `https://${ref}.supabase.co`;

/** True when the stack was synthesized without a real project ref. */
export const isPlaceholderProjectRef = (ref: string): boolean => ref === PLACEHOLDER_PROJECT_REF;

/** Convenience for callers that need the URL and nothing else. */
export function supabaseProjectUrlFor(scope: Construct): string {
  return supabaseProjectUrl(supabaseProjectRef(scope));
}
