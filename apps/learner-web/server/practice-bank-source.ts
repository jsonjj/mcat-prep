import type { PracticeBankPort } from '@mcat/authority-core';
import {
  createDatabasePoolFromEnv,
  createPostgresPracticeBankPort,
} from '@mcat/persistence-postgres';
import { createFilePracticeBankPort, type FilePracticeBankPort } from '@mcat/corpus-pull';

/**
 * Which corpus backs adaptive Practice in the dev server, in priority order:
 *
 *  1. `postgres`   — `DATABASE_URL` is set. The deployed path, unchanged.
 *  2. `file-pull`  — the gitignored local corpus pull is on disk (~2,108 items).
 *  3. `synthetic`  — nothing else is available: the authority builds its own
 *                    `SyntheticPracticeBankPort` over the 7-question enzyme
 *                    fixture. Fresh clone and CI land here, so it must keep
 *                    working; that is why the selection returns `undefined`
 *                    rather than constructing anything.
 *
 * Kept separate from `authority-api.ts` because that module instantiates the
 * authority at import time; this one is a pure choice with injectable
 * dependencies, so the branch is testable without a database or a pull.
 */

export type PracticeBankSource = 'postgres' | 'file-pull' | 'synthetic';

export interface PracticeBankSelection {
  readonly source: PracticeBankSource;
  /** `undefined` → let the authority fall back to the synthetic bank. */
  readonly port: PracticeBankPort | undefined;
  /** Deliverable items the chosen port loaded, when it can be known up front. */
  readonly items: number | null;
  /** Units that survive the snapshot's skill/cluster filter, when known. */
  readonly practisableUnits: number | null;
}

export interface PracticeBankSourceDeps {
  readonly databaseUrl?: string | undefined;
  readonly createPostgresPort?: () => PracticeBankPort;
  readonly createFilePort?: () => FilePracticeBankPort | null;
  readonly warn?: (message: string, error?: unknown) => void;
}

const SYNTHETIC: PracticeBankSelection = {
  source: 'synthetic',
  port: undefined,
  items: null,
  practisableUnits: null,
};

export function selectPracticeBankSource(deps: PracticeBankSourceDeps = {}): PracticeBankSelection {
  const {
    databaseUrl = process.env.DATABASE_URL,
    createPostgresPort = () => createPostgresPracticeBankPort(createDatabasePoolFromEnv()),
    createFilePort = createFilePracticeBankPort,
    warn = console.warn,
  } = deps;

  if (databaseUrl !== undefined && databaseUrl.trim() !== '') {
    try {
      return {
        source: 'postgres',
        port: createPostgresPort(),
        items: null,
        practisableUnits: null,
      };
    } catch (error) {
      warn(
        '[dev-authority] DATABASE_URL is set but the practice bank pool failed to initialize; ' +
          'trying the local corpus pull.',
        error,
      );
    }
  }

  let file: FilePracticeBankPort | null = null;
  try {
    file = createFilePort();
  } catch (error) {
    warn('[dev-authority] the local corpus pull could not be read.', error);
  }
  if (file !== null) {
    return {
      source: 'file-pull',
      port: file,
      items: file.stats.items,
      practisableUnits: file.stats.practisableUnits,
    };
  }

  return SYNTHETIC;
}

/**
 * The one boot line stating which corpus practice is serving from. A starved
 * bank and a broken selector produce the same empty queue, so the source and the
 * item count are announced rather than left to be inferred from behaviour.
 */
export function practiceBankSourceLine(selection: PracticeBankSelection): string {
  switch (selection.source) {
    case 'postgres':
      return '[dev-authority] practice bank: postgres (DATABASE_URL set) — fresh items and exposure/repair persist in the database.';
    case 'file-pull':
      return (
        `[dev-authority] practice bank: local corpus pull — ${selection.items ?? 0} items, ` +
        `${selection.practisableUnits ?? 0} practisable units; exposure/repair are in-memory (no DATABASE_URL).`
      );
    case 'synthetic':
      return '[dev-authority] practice bank: synthetic fixture — no DATABASE_URL and no local corpus pull at content/question-bank/.local/db-pull, so Practice runs on the 7-question enzyme bank and will dead-end after one session.';
  }
}
