import { createDatabasePoolFromEnv, listPassages } from '@mcat/persistence-postgres';
import type { PassageOfTheDayEntry } from '@mcat/contracts';
import { hardcodedPassagePool } from '../../../content/passage-of-the-day/pool';
import { loadPassageStore } from './passage-store-file';

/**
 * Which corpus backs Passage of the Day, in priority order — the same
 * priority-fallback shape as `practice-bank-source.ts`:
 *
 *  1. `postgres`   — `DATABASE_URL` is set and the `passages` table has rows. The
 *                    deployed path: seed + any user-authored passages live here.
 *  2. `file-store` — the gitignored local store is on disk (dev ingest target).
 *                    Serves seed + locally-ingested passages with no database.
 *  3. `hardcoded`  — neither is available (fresh clone, CI): the vetted 12-passage
 *                    pool compiled into `content/passage-of-the-day/pool.ts`.
 *
 * The read is one-shot at server boot; the resolved entries are held in memory by
 * `PassageOfDayService`, so the Postgres pool opened here is closed straight after.
 * Dependencies are injectable so the branch is testable without a database or a
 * store on disk.
 *
 * DEV DATABASE_URL PARITY: the Vite dev server does NOT auto-load the repo-root
 * `.env`, so `process.env.DATABASE_URL` is set here only if it was exported in the
 * shell that started the dev server (or placed in `apps/learner-web/.env.local`).
 * Without it this resolves to the local store / hardcoded pool even when a database
 * exists — export DATABASE_URL in the SAME shell to read passages from Postgres.
 */

export type PassagePoolSource = 'postgres' | 'file-store' | 'hardcoded';

export interface PassagePoolResult {
  readonly source: PassagePoolSource;
  readonly entries: readonly PassageOfTheDayEntry[];
}

export interface PassagePoolSourceDeps {
  readonly databaseUrl?: string | undefined;
  readonly loadFromPostgres?: () => Promise<readonly PassageOfTheDayEntry[]>;
  readonly loadFromFileStore?: () => readonly PassageOfTheDayEntry[] | null;
  readonly loadHardcoded?: () => readonly PassageOfTheDayEntry[];
  readonly warn?: (message: string, error?: unknown) => void;
}

async function readFromPostgres(): Promise<readonly PassageOfTheDayEntry[]> {
  const pool = createDatabasePoolFromEnv();
  try {
    return await listPassages(pool);
  } finally {
    await pool.end();
  }
}

export async function resolvePassagePool(
  deps: PassagePoolSourceDeps = {},
): Promise<PassagePoolResult> {
  const {
    databaseUrl = process.env.DATABASE_URL,
    loadFromPostgres = readFromPostgres,
    loadFromFileStore = loadPassageStore,
    loadHardcoded = hardcodedPassagePool,
    warn = console.warn,
  } = deps;

  if (databaseUrl !== undefined && databaseUrl.trim() !== '') {
    try {
      const entries = await loadFromPostgres();
      if (entries.length > 0) return { source: 'postgres', entries };
      warn(
        '[passage-of-day] DATABASE_URL is set but the passages table is empty; ' +
          'seed it (see tools/passage-cli) — falling back to the local store / hardcoded pool.',
      );
    } catch (error) {
      warn(
        '[passage-of-day] DATABASE_URL is set but reading the passages table failed; ' +
          'falling back to the local store / hardcoded pool.',
        error,
      );
    }
  }

  try {
    const stored = loadFromFileStore();
    if (stored !== null && stored.length > 0) return { source: 'file-store', entries: stored };
  } catch (error) {
    warn('[passage-of-day] the local passage store could not be read.', error);
  }

  return { source: 'hardcoded', entries: loadHardcoded() };
}

/**
 * The passage pool for this process, resolved through the priority fallback. This
 * is the async successor to the old synchronous `loadPassagePool()` seam — every
 * server reader obtains passages here.
 */
export async function loadPassagePool(
  deps: PassagePoolSourceDeps = {},
): Promise<readonly PassageOfTheDayEntry[]> {
  return (await resolvePassagePool(deps)).entries;
}

/** One boot line stating which corpus Passage of the Day is serving from. */
export function passagePoolSourceLine(result: PassagePoolResult): string {
  switch (result.source) {
    case 'postgres':
      return `[passage-of-day] source: postgres (DATABASE_URL set) — ${result.entries.length} passages.`;
    case 'file-store':
      return `[passage-of-day] source: local store — ${result.entries.length} passages (no DATABASE_URL; ingested passages included).`;
    case 'hardcoded':
      return `[passage-of-day] source: hardcoded pool — ${result.entries.length} passages (no DATABASE_URL and no local store).`;
  }
}
