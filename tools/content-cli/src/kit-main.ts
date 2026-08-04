import {
  executeProductionKits,
  preflightProductionKits,
  prepareProductionAuthority,
} from '@mcat/content/lesson-factory';

import { renderPreflightResult } from './kit-result';

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const command = args[2];
const remaining = args.slice(3);
const expectedPrefix = args[0] === 'lesson-factory' && args[1] === 'kits';

function safeSummary(result: unknown): Record<string, unknown> {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    return { status: 'ERROR', code: 'INVALID_RESULT' };
  }
  const record = result as Record<string, unknown>;
  const blockers = Array.isArray(record.blockers)
    ? record.blockers.map((blocker) =>
        blocker !== null && typeof blocker === 'object' && !Array.isArray(blocker)
          ? { code: String((blocker as Record<string, unknown>).code) }
          : { code: 'UNKNOWN_BLOCKER' },
      )
    : undefined;
  return {
    status: record.status,
    runId: record.runId,
    userSendable: record.userSendable,
    archivesPublished: record.archivesPublished,
    ...(blockers === undefined ? {} : { blockers }),
  };
}

async function main(): Promise<void> {
  if (!expectedPrefix) {
    throw new Error('UNSUPPORTED_ARGUMENTS');
  }
  if (command === 'preflight' && remaining.length === 0) {
    const rendered = renderPreflightResult(await preflightProductionKits());
    console.log(JSON.stringify(rendered.summary));
    process.exitCode = rendered.exitCode;
    return;
  }
  if (command === 'prepare' && remaining.length === 0) {
    console.error(JSON.stringify({ status: 'ERROR', code: 'EXPLICIT_ARM_REQUIRED' }));
    process.exitCode = 2;
    return;
  }
  if (command === 'prepare' && remaining.length === 1 && remaining[0] === '--arm') {
    const result = await prepareProductionAuthority();
    console.log(JSON.stringify(safeSummary(result)));
    if (result.status === 'BLOCKED') process.exitCode = 1;
    return;
  }
  if (command === 'publish' && remaining.length === 0) {
    const result = await executeProductionKits();
    console.log(JSON.stringify(safeSummary(result)));
    if (result.status === 'BLOCKED') process.exitCode = 1;
    return;
  }
  throw new Error('UNSUPPORTED_ARGUMENTS');
}

try {
  await main();
} catch (error) {
  const code =
    error instanceof Error && error.message === 'INVALID_PREFLIGHT_RESULT'
      ? 'INVALID_PREFLIGHT_RESULT'
      : 'UNSUPPORTED_ARGUMENTS';
  console.error(JSON.stringify({ status: 'ERROR', code }));
  process.exitCode = 2;
}
