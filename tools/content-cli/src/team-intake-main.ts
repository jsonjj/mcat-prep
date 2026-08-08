import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  intakeTeamReturn,
  type TeamReturnIntakeRequest,
  type TeamReturnSource,
  type TeamReturnSupersessionRequest,
} from '../../../packages/content/src/lesson-factory/team-return-intake';

const RUN_ID = '2026-08-03T1727-0500';
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const AUTHORITY_ROOT = resolve(dirname(REPOSITORY_ROOT), 'lesson-factory-handoffs', RUN_ID);

export interface ParsedTeamIntakeCliArguments {
  readonly help: boolean;
  readonly mode: 'DRY_RUN' | 'ACCEPT';
  readonly source?: TeamReturnSource;
  readonly supersession?: TeamReturnSupersessionRequest;
}

function argumentValue(args: readonly string[], flag: string): string | undefined {
  const positions = args.flatMap((value, index) => (value === flag ? [index] : []));
  if (positions.length > 1) throw new Error(`DUPLICATE_ARGUMENT:${flag}`);
  const position = positions[0];
  if (position === undefined) return undefined;
  const value = args[position + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`ARGUMENT_VALUE_REQUIRED:${flag}`);
  }
  return value;
}

export function parseTeamIntakeCliArguments(
  rawArguments: readonly string[],
): ParsedTeamIntakeCliArguments {
  const args = rawArguments[0] === '--' ? rawArguments.slice(1) : [...rawArguments];
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    return { help: true, mode: 'DRY_RUN' };
  }
  const valueFlags = new Set([
    '--checkout-root',
    '--archive',
    '--attestation',
    '--expected-prior-source-batch',
    '--expected-prior-staging-identity',
  ]);
  const switchFlags = new Set(['--accept', '--supersede-final-team']);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] as string;
    if (valueFlags.has(argument)) {
      index += 1;
      if (args[index] === undefined || String(args[index]).startsWith('--')) {
        throw new Error(`ARGUMENT_VALUE_REQUIRED:${argument}`);
      }
      continue;
    }
    if (!switchFlags.has(argument)) throw new Error(`UNSUPPORTED_ARGUMENT:${argument}`);
  }
  if (args.filter((argument) => argument === '--accept').length > 1) {
    throw new Error('DUPLICATE_ARGUMENT:--accept');
  }
  if (args.filter((argument) => argument === '--supersede-final-team').length > 1) {
    throw new Error('DUPLICATE_ARGUMENT:--supersede-final-team');
  }
  const checkoutRoot = argumentValue(args, '--checkout-root');
  const archivePath = argumentValue(args, '--archive');
  const attestationPath = argumentValue(args, '--attestation');
  const hasArchiveArgument = archivePath !== undefined || attestationPath !== undefined;
  if ((checkoutRoot === undefined) === !hasArchiveArgument) {
    throw new Error('EXACTLY_ONE_SOURCE_REQUIRED');
  }
  if (hasArchiveArgument && (archivePath === undefined || attestationPath === undefined)) {
    throw new Error('SIGNED_ARCHIVE_ARGUMENTS_INCOMPLETE');
  }
  const supersedeFinalTeam = args.includes('--supersede-final-team');
  const expectedPriorSourceBatchSha256 = argumentValue(args, '--expected-prior-source-batch');
  const expectedPriorStagingIdentitySha256 = argumentValue(
    args,
    '--expected-prior-staging-identity',
  );
  const hasSupersessionArgument =
    supersedeFinalTeam ||
    expectedPriorSourceBatchSha256 !== undefined ||
    expectedPriorStagingIdentitySha256 !== undefined;
  if (
    hasSupersessionArgument &&
    (!supersedeFinalTeam ||
      expectedPriorSourceBatchSha256 === undefined ||
      expectedPriorStagingIdentitySha256 === undefined)
  ) {
    throw new Error('SUPERSESSION_ARGUMENTS_INCOMPLETE');
  }
  if (
    hasSupersessionArgument &&
    (!/^[0-9a-f]{64}$/.test(expectedPriorSourceBatchSha256 as string) ||
      !/^[0-9a-f]{64}$/.test(expectedPriorStagingIdentitySha256 as string))
  ) {
    throw new Error('SUPERSESSION_IDENTITY_INVALID');
  }
  const source: TeamReturnSource =
    checkoutRoot !== undefined
      ? { kind: 'CHECKOUT', root: checkoutRoot }
      : {
          archivePath: archivePath as string,
          attestationPath: attestationPath as string,
          kind: 'SIGNED_ARCHIVE',
        };
  return {
    help: false,
    mode: args.includes('--accept') ? 'ACCEPT' : 'DRY_RUN',
    source,
    ...(hasSupersessionArgument
      ? {
          supersession: {
            action: 'SUPERSEDE_FINAL_TEAM' as const,
            expectedPriorSourceBatchSha256: expectedPriorSourceBatchSha256 as string,
            expectedPriorStagingIdentitySha256: expectedPriorStagingIdentitySha256 as string,
          },
        }
      : {}),
  };
}

function absoluteInput(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

export function teamIntakeUsage(): string {
  return [
    'Team return intake (dry-run by default)',
    '',
    'Checkout:',
    '  pnpm --filter @mcat/content-cli exec tsx src/team-intake-main.ts --checkout-root <wave-checkout> [--accept]',
    '',
    'Signed fallback archive:',
    '  pnpm --filter @mcat/content-cli exec tsx src/team-intake-main.ts --archive <zip> --attestation <json> [--accept]',
    '',
    'Explicit FINAL_TEAM supersession to a content-addressed acceptance artifact (dry-run projection unless --accept is also present):',
    '  --supersede-final-team --expected-prior-source-batch <sha256> --expected-prior-staging-identity <sha256>',
    '',
    'Team, assignment, lesson IDs, generation authority, and staging destination are derived and cannot be overridden.',
    'The predecessor receipt, object hashes, and atomic immutable symlink marker are derived and cannot be overridden.',
  ].join('\n');
}

export async function runTeamIntakeCli(rawArguments = process.argv.slice(2)): Promise<number> {
  let parsed: ParsedTeamIntakeCliArguments;
  try {
    parsed = parseTeamIntakeCliArguments(rawArguments);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        code: error instanceof Error ? error.message.split(':')[0] : 'ARGUMENT_ERROR',
        decision: 'REJECTED',
      })}\n`,
    );
    return 1;
  }
  if (parsed.help) {
    process.stdout.write(`${teamIntakeUsage()}\n`);
    return 0;
  }
  const source = parsed.source as TeamReturnSource;
  const normalizedSource: TeamReturnSource =
    source.kind === 'CHECKOUT'
      ? { kind: 'CHECKOUT', root: absoluteInput(source.root) }
      : {
          archivePath: absoluteInput(source.archivePath),
          attestationPath: absoluteInput(source.attestationPath),
          kind: 'SIGNED_ARCHIVE',
        };
  const request: TeamReturnIntakeRequest = {
    authorityRoot: AUTHORITY_ROOT,
    centralRepositoryRoot: REPOSITORY_ROOT,
    mode: parsed.mode,
    source: normalizedSource,
    ...(parsed.supersession === undefined ? {} : { supersession: parsed.supersession }),
  };
  const result = await intakeTeamReturn(request);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.decision === 'ACCEPTED' ? 0 : 1;
}

const directlyInvoked =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (directlyInvoked) {
  process.exitCode = await runTeamIntakeCli();
}
