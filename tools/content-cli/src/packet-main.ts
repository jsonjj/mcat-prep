import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  preflightProductionPacketPublication,
  publishProductionPacketPublication,
} from '@mcat/content/lesson-factory/packets';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const expectedPrefix = args[0] === 'lesson-factory' && args[1] === 'packets' && args[2] === 'emit';
const remaining = args.slice(3);
const publish = remaining.length === 1 && remaining[0] === '--publish';

if (!expectedPrefix || (remaining.length > 0 && !publish)) {
  console.error(
    JSON.stringify({
      status: 'ERROR',
      code: 'UNSUPPORTED_ARGUMENTS',
      usage: 'lesson-factory packets emit [--publish]',
    }),
  );
  process.exitCode = 2;
} else {
  try {
    const result = publish
      ? publishProductionPacketPublication({ repositoryRoot: REPO_ROOT })
      : preflightProductionPacketPublication({ repositoryRoot: REPO_ROOT });
    console.log(JSON.stringify(result));
  } catch (error) {
    const code =
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'SOURCE_TREE_NOT_COMMITTED'
        ? 'SOURCE_TREE_NOT_COMMITTED'
        : 'PACKET_PUBLICATION_REFUSED';
    console.error(JSON.stringify({ status: 'ERROR', code }));
    process.exitCode = 1;
  }
}
