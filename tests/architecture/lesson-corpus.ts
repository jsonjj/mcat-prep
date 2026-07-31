import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The ONE way the architecture suite finds V3 lesson artifacts.
 *
 * ALL THREE LESSONS ARE VENDORED IN-REPO under `content/lessons/` (Phase 2 —
 * `V3-LES-130923`, `V3-LES-789208`, `V3-LES-844372`), which is the FIRST search
 * root and wins by id. The workspace-sibling `research/.../lesson-authoring-drafts/`
 * tree and the `MCAT_LESSON_DRAFTS_DIR` override are retained only as a defensive
 * fallback for a checkout that somehow lacks a vendored copy; on a normal checkout
 * they are never the source of any lesson. (Before Phase 2, only V3-LES-130923 was
 * in-repo and the other two were reached in that sibling tree — hence this history.)
 *
 * Two suites read the same artifacts — `v3-lesson-binding-conformance.test.ts`
 * and `lesson-mastery-integration.test.ts` — and each used to walk the tree
 * itself. That duplication is how they drifted: one grew a guarded search with a
 * named diagnostic while the other kept an unguarded `readdirSync` on a
 * hardcoded out-of-repo path, so a clean checkout got a raw `ENOENT` from one and
 * an explanation from the other. Discovery lives here now, once.
 *
 * ABSENCE IS LOUD, NEVER A SKIP. A conformance suite that quietly passes because
 * it could not find the lessons is indistinguishable from one that passed on
 * them, and that vacuous pass is the exact failure mode these tests exist to
 * catch. Callers assert {@link missingLessonIds} is empty and print
 * {@link lessonCorpusDiagnostic}; set `MCAT_LESSON_DRAFTS_DIR` to a checkout of
 * the drafts tree to satisfy it somewhere the sibling tree does not exist.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Escape hatch for a checkout that keeps the drafts tree somewhere else. */
export const LESSON_DRAFTS_ENV_VAR = 'MCAT_LESSON_DRAFTS_DIR';

export interface LessonSearchRoot {
  readonly label: string;
  /** Empty when an optional root is unset; skipped rather than treated as `/`. */
  readonly path: string;
}

export const LESSON_SCRIPT_SEARCH_ROOTS: readonly LessonSearchRoot[] = [
  { label: 'in-repo lesson content', path: join(repoRoot, 'content', 'lessons') },
  { label: `${LESSON_DRAFTS_ENV_VAR} override`, path: process.env[LESSON_DRAFTS_ENV_VAR] ?? '' },
  {
    // The repo-relative escape, stated once and named here rather than spread
    // through the suites as a bare `join(repoRoot, '..')`.
    label: 'workspace sibling research/ drafts tree (OUTSIDE this repository)',
    path: join(
      repoRoot,
      '..',
      'research',
      'mcat-curriculum-architecture-v3',
      'lesson-authoring-drafts',
    ),
  },
];

/**
 * The corpus the seam is measured against: `id → binding count`.
 * 42 + 40 + 33 = 115, pinned exactly. A count that drifts means either an
 * artifact changed or discovery stopped seeing part of one, and both are
 * findings — the total is what makes every per-lesson assertion non-vacuous.
 */
export const EXPECTED_LESSON_BINDINGS: Readonly<Record<string, number>> = {
  'V3-LES-130923': 42,
  'V3-LES-789208': 40,
  'V3-LES-844372': 33,
};

export const EXPECTED_LESSON_IDS: readonly string[] = Object.keys(EXPECTED_LESSON_BINDINGS).sort();

export const EXPECTED_TOTAL_BINDINGS = 115;

const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', '.git', 'dist', 'build']);

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;

export interface LessonArtifact {
  readonly id: string;
  readonly artifactVersion: string;
  /** Every authored binding, in artifact order. */
  readonly bindings: readonly JsonRecord[];
  readonly path: string;
  /** Which search root supplied it, for the diagnostic. */
  readonly source: string;
}

function findLessonScripts(directory: string): string[] {
  // Guarded, unlike the unguarded walk this replaces: a missing root is a normal
  // state to report, not an ENOENT to crash on.
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory())
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : findLessonScripts(path);
    return entry.name === 'lesson-script.json' ? [path] : [];
  });
}

function loadLesson(path: string, source: string): LessonArtifact {
  const envelope = asRecord(JSON.parse(readFileSync(path, 'utf8'))) ?? {};
  const payload = asRecord(envelope.payload) ?? {};
  const bindings = Array.isArray(payload.question_evidence_plan)
    ? payload.question_evidence_plan.flatMap((binding) => {
        const record = asRecord(binding);
        return record ? [record] : [];
      })
    : [];
  const id = typeof payload.lesson_id === 'string' ? payload.lesson_id : path;
  const artifactVersion =
    typeof envelope.artifact_version === 'string' ? envelope.artifact_version : 'unknown-artifact';

  return { artifactVersion, bindings, id, path, source };
}

let cached: readonly LessonArtifact[] | undefined;

/**
 * Every lesson artifact reachable from any search root, by id, first root wins.
 * Sorted by id so both suites report in the same order.
 */
export function lessonCorpus(): readonly LessonArtifact[] {
  if (cached !== undefined) return cached;
  const byId = new Map<string, LessonArtifact>();
  for (const searchRoot of LESSON_SCRIPT_SEARCH_ROOTS) {
    if (searchRoot.path.length === 0) continue;
    for (const script of findLessonScripts(searchRoot.path)) {
      const lesson = loadLesson(script, searchRoot.label);
      if (!byId.has(lesson.id)) byId.set(lesson.id, lesson);
    }
  }
  cached = [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
  return cached;
}

export const lessonById = (id: string): LessonArtifact | undefined =>
  lessonCorpus().find((lesson) => lesson.id === id);

/** Expected lessons no search root could supply. Empty is the only healthy state. */
export const missingLessonIds = (): readonly string[] =>
  EXPECTED_LESSON_IDS.filter((id) => lessonById(id) === undefined);

/**
 * The named failure both suites print. It says which lessons are missing, every
 * root that was searched, how to fix it, and — the part an `ENOENT` cannot say —
 * why a smaller corpus is dangerous rather than merely smaller.
 */
export function lessonCorpusDiagnostic(context: string): string {
  const missing = missingLessonIds();
  return [
    `${context}: lesson artifact(s) ${missing.join(', ') || '(none)'} could not be found.`,
    '',
    'Two of the three V3 lessons live OUTSIDE this repository, in the workspace sibling',
    '`research/mcat-curriculum-architecture-v3/lesson-authoring-drafts/`. A clean checkout',
    'of mcat-prep alone contains only V3-LES-130923. Roots searched, in order:',
    ...LESSON_SCRIPT_SEARCH_ROOTS.map(
      (searchRoot) =>
        `  ${searchRoot.path.length === 0 ? '(unset)' : searchRoot.path}` +
        `${searchRoot.path.length > 0 && existsSync(searchRoot.path) ? '  [exists]' : '  [absent]'}` +
        `  — ${searchRoot.label}`,
    ),
    '',
    `FIX: set ${LESSON_DRAFTS_ENV_VAR} to a checkout of the drafts tree, or vendor the two`,
    'artifacts into `content/lessons/` next to the one that is already there.',
    '',
    'This is a FAILURE and not a skip on purpose. The conformance suite measures',
    `${EXPECTED_TOTAL_BINDINGS} bindings across ${EXPECTED_LESSON_IDS.length} lessons`,
    `(${EXPECTED_LESSON_IDS.map((id) => `${id}: ${EXPECTED_LESSON_BINDINGS[id]}`).join(', ')}).`,
    'Discovering fewer and carrying on would leave a green suite that stopped looking, which',
    'reads exactly like a green suite that checked everything.',
  ].join('\n');
}
