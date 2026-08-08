import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LessonNormalizationError,
  compileCanonicalLesson,
  type RawLessonArtifacts,
} from '@mcat/content/lesson-normalization';
import { afterAll, describe, expect, it } from 'vitest';

import {
  AnswerKeyResolutionError,
  createLessonContentProviderCompatibilityAdapter,
  createRepoLessonContentProvider,
  createRepoLessonRevisionProvider,
  type LessonProviderError,
  type RepoLessonCatalogDefinition,
} from './lesson-content-provider';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const contentRoot = join(repoRoot, 'content', 'lessons');
const templateRoot = join(repoRoot, 'docs', 'lesson-authoring', 'template');

const L1 = 'V3-LES-130923';
const L2 = 'V3-LES-789208';
const L3 = 'V3-LES-844372';
const TEMPLATE = 'V3-LES-000000';
const ALL = [L1, L2, L3];
const tempRoots: string[] = [];

const lessonDir = (root: string, lessonId: string): string => join(root, lessonId.toLowerCase());
const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
const definitionHashAt = (root: string, lessonId: string): string =>
  readJson(join(lessonDir(root, lessonId), 'lesson-script.json')).content_sha256 as string;

function rawArtifacts(root: string, lessonId: string): RawLessonArtifacts {
  const directory = lessonDir(root, lessonId);
  const optional = (name: string): unknown => {
    const path = join(directory, name);
    return existsSync(path) ? readJson(path) : undefined;
  };
  return {
    script: readJson(join(directory, 'lesson-script.json')),
    learnerSafeItems: optional('learner-safe-items.json'),
    protectedItems: optional('protected-items.json'),
    presentationPlan: optional('lesson-presentation-plan.json'),
  };
}

const l2CatalogDefinition = (
  activeDefinitionHash: string,
  overrides: Readonly<Record<string, unknown>> = {},
): RepoLessonCatalogDefinition =>
  ({
    lessonId: L2,
    slug: L2.toLowerCase(),
    title: 'Quantitative Measurement and Scaling',
    section: null,
    cluster: 'R1',
    estimatedMinutes: 15,
    orderedKcIds: ['V3-KC-399019', 'V3-KC-799492', 'V3-KC-919842', 'V3-KC-981438'],
    prerequisiteLessonIds: [],
    runtimeKind: 'normalized',
    lifecycle: 'DRAFT',
    activeDefinitionHash,
    enabled: true,
    killSwitch: 'OPEN',
    routePath: `/app/lessons/${L2.toLowerCase()}`,
    candidateNonclaimStatus: 'INTERNAL_DRAFT_ONLY',
    ...overrides,
  }) as RepoLessonCatalogDefinition;

function capturedProviderError(action: () => unknown): LessonProviderError {
  try {
    action();
  } catch (error) {
    return error as LessonProviderError;
  }
  throw new Error('expected LessonProviderError');
}

function archivedL2Catalog(): {
  root: string;
  firstHash: string;
  secondHash: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'mcat-revision-provider-'));
  tempRoots.push(root);
  const firstHash = definitionHashAt(contentRoot, L2);
  const secondHash = '2'.repeat(64);
  const revisions = join(lessonDir(root, L2), 'revisions');
  mkdirSync(revisions, { recursive: true });
  const first = join(revisions, firstHash);
  const second = join(revisions, secondHash);
  cpSync(lessonDir(contentRoot, L2), first, { recursive: true });
  cpSync(lessonDir(contentRoot, L2), second, { recursive: true });
  const secondScriptPath = join(second, 'lesson-script.json');
  writeFileSync(
    secondScriptPath,
    JSON.stringify({ ...readJson(secondScriptPath), content_sha256: secondHash }, null, 2),
  );
  return { root, firstHash, secondHash };
}

describe('revision-addressable repository lesson provider', () => {
  it('lists the three active visible lessons asynchronously with exact hashes and approved slugs', async () => {
    const provider = createRepoLessonRevisionProvider();

    const entries = await provider.listActiveCatalogEntries();

    expect(entries.map((entry) => entry.lessonId)).toEqual(ALL);
    expect(entries.map((entry) => entry.slug)).toEqual([
      'vectors-and-trigonometry',
      'v3-les-789208',
      'v3-les-844372',
    ]);
    for (const entry of entries) {
      expect(entry.activeDefinitionHash).toBe(definitionHashAt(contentRoot, entry.lessonId));
    }
    expect(JSON.stringify(entries)).not.toMatch(
      /answer|acceptedResponses|rationale|scoring|protected|sourceRef|source_/i,
    );
  });

  it('resolves a slug and loads the same active identity by lesson id or slug', async () => {
    const provider = createRepoLessonRevisionProvider();
    const identity = await provider.resolveSlug('v3-les-789208');

    expect(identity).toEqual({
      lessonId: L2,
      slug: 'v3-les-789208',
      activeDefinitionHash: definitionHashAt(contentRoot, L2),
    });
    const byId = await provider.loadActiveRevision({ lessonId: L2 });
    const bySlug = await provider.loadActiveRevision({ slug: 'v3-les-789208' });
    expect(bySlug).toBe(byId);
  });

  it('uses the WP-05A canonical compiler and keeps protected authority separate', async () => {
    const provider = createRepoLessonRevisionProvider();
    const loaded = await provider.loadActiveRevision({ lessonId: L2 });
    const canonical = compileCanonicalLesson(rawArtifacts(contentRoot, L2));

    expect(loaded.lesson).toEqual(canonical.lesson);
    expect(loaded.protectedAuthority.answerKey).toEqual(canonical.answerKey);
    expect(loaded.authoredBindings.lessonId).toBe(L2);
    expect(loaded.authoredBindings.entries).toHaveLength(canonical.lesson.items.length);
    expect(loaded.lesson.kcs.flatMap((kc) => kc.deliverySteps).some((step) => step.heading)).toBe(
      true,
    );
    expect(loaded.lifecycle).toBe('DRAFT');
    expect(loaded.inputHashes.length).toBeGreaterThan(0);

    const scriptBytes = readFileSync(join(lessonDir(contentRoot, L2), 'lesson-script.json'));
    expect(loaded.artifactHashes.lessonScript).toBe(
      createHash('sha256').update(scriptBytes).digest('hex'),
    );
  });

  it('reloads an old exact revision after a newer active pointer is selected', async () => {
    const { root, firstHash, secondHash } = archivedL2Catalog();
    const firstProvider = createRepoLessonRevisionProvider({
      contentRoot: root,
      catalog: [l2CatalogDefinition(firstHash)],
    });
    const first = await firstProvider.loadActiveRevision({ lessonId: L2 });

    const secondProvider = createRepoLessonRevisionProvider({
      contentRoot: root,
      catalog: [l2CatalogDefinition(secondHash)],
    });
    const newer = await secondProvider.loadActiveRevision({ lessonId: L2 });
    const reloaded = await secondProvider.loadExactRevision(L2, firstHash);

    expect(newer.definitionHash).toBe(secondHash);
    expect(reloaded.definitionHash).toBe(firstHash);
    expect(reloaded.artifactHashes).toEqual(first.artifactHashes);
    expect(reloaded.inputHashes).toEqual(first.inputHashes);
    expect(reloaded.lesson).toEqual(first.lesson);
  });

  it('treats exact load as learner resume and lets emergency controls block it explicitly', async () => {
    const activeDefinitionHash = definitionHashAt(contentRoot, L2);
    for (const [overrides, code] of [
      [{ enabled: false }, 'LESSON_DISABLED'],
      [{ killSwitch: 'ENGAGED' }, 'KILL_SWITCH_ENGAGED'],
      [{ lifecycle: 'RETIRED' }, 'LESSON_RETIRED'],
    ] as const) {
      const provider = createRepoLessonRevisionProvider({
        catalog: [l2CatalogDefinition(activeDefinitionHash, overrides)],
      });
      await expect(provider.loadExactRevision(L2, activeDefinitionHash)).rejects.toMatchObject({
        code,
      });
    }
  });

  it('loads L1 asynchronously while keeping its vector authority protected', async () => {
    const provider = createRepoLessonRevisionProvider();

    const loaded = await provider.loadActiveRevision({ lessonId: L1 });

    expect(loaded.lesson.grammar).toBe('L1_INLINE');
    expect(loaded.catalogEntry.runtimeKind).toBe('vector');
    expect(loaded.protectedAuthority.answerKey.lessonId).toBe(L1);
    expect(Object.keys(loaded.protectedAuthority.answerKey.byItemId).length).toBeGreaterThan(0);
  });

  it('fails closed for unknown, disabled, and missing revisions', async () => {
    const provider = createRepoLessonRevisionProvider();
    await expect(provider.resolveSlug('v3-les-000001')).rejects.toMatchObject({
      code: 'UNKNOWN_SLUG',
    });
    await expect(provider.loadExactRevision(L2, 'f'.repeat(64))).rejects.toMatchObject({
      code: 'REVISION_NOT_FOUND',
    });

    const disabled = createRepoLessonRevisionProvider({
      catalog: [
        l2CatalogDefinition(definitionHashAt(contentRoot, L2), {
          enabled: false,
        }),
      ],
    });
    await expect(disabled.listActiveCatalogEntries()).resolves.toEqual([]);
    await expect(disabled.resolveSlug(L2.toLowerCase())).rejects.toMatchObject({
      code: 'LESSON_DISABLED',
    });
    await expect(disabled.loadActiveRevision({ lessonId: L2 })).rejects.toMatchObject({
      code: 'LESSON_DISABLED',
    });
  });

  it('fails closed for duplicate slugs and an active pointer to an absent revision', () => {
    const l3Hash = definitionHashAt(contentRoot, L3);
    expect(() =>
      createRepoLessonRevisionProvider({
        catalog: [
          l2CatalogDefinition(definitionHashAt(contentRoot, L2)),
          {
            ...l2CatalogDefinition(l3Hash),
            lessonId: L3,
            orderedKcIds: ['V3-KC-452593', 'V3-KC-008681', 'V3-KC-238607'],
          },
        ],
      }),
    ).toThrow(/duplicate slug/i);

    expect(() =>
      createRepoLessonRevisionProvider({
        catalog: [l2CatalogDefinition('e'.repeat(64))],
      }),
    ).toThrow(/active revision/i);
  });

  it('fails closed for revision hash and lifecycle mismatches', async () => {
    const { root, firstHash } = archivedL2Catalog();
    const wrongAddress = '3'.repeat(64);
    const revisions = join(lessonDir(root, L2), 'revisions');
    cpSync(join(revisions, firstHash), join(revisions, wrongAddress), { recursive: true });

    const hashMismatch = createRepoLessonRevisionProvider({
      contentRoot: root,
      catalog: [l2CatalogDefinition(wrongAddress)],
    });
    await expect(hashMismatch.loadActiveRevision({ lessonId: L2 })).rejects.toMatchObject({
      code: 'HASH_MISMATCH',
    });

    const lifecycleMismatch = createRepoLessonRevisionProvider({
      contentRoot: root,
      catalog: [l2CatalogDefinition(firstHash, { lifecycle: 'ACTIVE' })],
    });
    await expect(lifecycleMismatch.loadActiveRevision({ lessonId: L2 })).rejects.toMatchObject({
      code: 'LIFECYCLE_MISMATCH',
    });
  });

  it('fails closed when catalog input contains protected material', () => {
    for (const protectedField of [
      { answerKey: { item: 'A' } },
      { structuredAuthority: { requiredFields: ['answer'] } },
    ]) {
      const error = capturedProviderError(() =>
        createRepoLessonRevisionProvider({
          catalog: [l2CatalogDefinition(definitionHashAt(contentRoot, L2), protectedField)],
        }),
      );
      expect(error).toMatchObject({ code: 'PROTECTED_CATALOG_LEAK' });
    }
  });

  it('rejects duplicate catalog lesson IDs before duplicate slugs', () => {
    const definition = l2CatalogDefinition(definitionHashAt(contentRoot, L2));

    const error = capturedProviderError(() =>
      createRepoLessonRevisionProvider({ catalog: [definition, definition] }),
    );

    expect(error).toMatchObject({ code: 'DUPLICATE_LESSON_ID' });
  });

  it('rejects prerequisites outside the supplied catalog', () => {
    const error = capturedProviderError(() =>
      createRepoLessonRevisionProvider({
        catalog: [
          l2CatalogDefinition(definitionHashAt(contentRoot, L2), {
            prerequisiteLessonIds: ['V3-LES-000001'],
          }),
        ],
      }),
    );

    expect(error).toMatchObject({ code: 'INVALID_CATALOG' });
    expect(error.message).toMatch(/outside this catalog/i);
  });

  it('requires explicit catalog metadata for an unknown lesson in a custom root', () => {
    const root = mkdtempSync(join(tmpdir(), 'mcat-custom-catalog-'));
    tempRoots.push(root);
    cpSync(lessonDir(templateRoot, TEMPLATE), lessonDir(root, TEMPLATE), { recursive: true });

    const error = capturedProviderError(() =>
      createRepoLessonRevisionProvider({ contentRoot: root }),
    );

    expect(error).toMatchObject({
      code: 'CATALOG_REQUIRED_FOR_CUSTOM_ROOT',
      detail: { lessonIds: [TEMPLATE] },
    });
  });

  it('rejects duplicate direct lesson IDs deterministically with both paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'mcat-duplicate-id-'));
    tempRoots.push(root);
    const first = join(root, 'a-first');
    const second = join(root, 'z-second');
    cpSync(lessonDir(contentRoot, L2), second, { recursive: true });
    cpSync(lessonDir(contentRoot, L2), first, { recursive: true });
    const secondScript = join(second, 'lesson-script.json');
    writeFileSync(
      secondScript,
      JSON.stringify({ ...readJson(secondScript), content_sha256: '4'.repeat(64) }, null, 2),
    );

    const error = capturedProviderError(() =>
      createRepoLessonRevisionProvider({ contentRoot: root }),
    );

    expect(error).toMatchObject({
      code: 'DUPLICATE_LESSON_ID_LOCATION',
      detail: { paths: [first, second] },
    });
  });

  it('rejects duplicate revision locations across direct and archive directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'mcat-duplicate-revision-'));
    tempRoots.push(root);
    const direct = lessonDir(root, L2);
    cpSync(lessonDir(contentRoot, L2), direct, { recursive: true });
    const hash = definitionHashAt(root, L2);
    const archived = join(direct, 'revisions', hash);
    mkdirSync(join(direct, 'revisions'), { recursive: true });
    cpSync(lessonDir(contentRoot, L2), archived, { recursive: true });

    const error = capturedProviderError(() =>
      createRepoLessonRevisionProvider({ contentRoot: root }),
    );

    expect(error).toMatchObject({
      code: 'DUPLICATE_REVISION_LOCATION',
      detail: { paths: [direct, archived].sort() },
    });
  });

  it('preserves canonical normalization failures outside the one legacy range translation', () => {
    const root = mkdtempSync(join(tmpdir(), 'mcat-normalization-error-'));
    tempRoots.push(root);
    const directory = lessonDir(root, L3);
    cpSync(lessonDir(contentRoot, L3), directory, { recursive: true });
    const protectedPath = join(directory, 'protected-items.json');
    const protectedDoc = readJson(protectedPath);
    const records = (protectedDoc.records as Record<string, unknown>[]).filter(
      (record) => record.answer_record_id !== 'ALG-GRAPH-ENTRY-01',
    );
    writeFileSync(protectedPath, JSON.stringify({ ...protectedDoc, records }, null, 2));
    const compatibility = createRepoLessonContentProvider(root);

    let error: unknown;
    try {
      compatibility.getAnswerKey(L3);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(LessonNormalizationError);
    expect(error).not.toBeInstanceOf(AnswerKeyResolutionError);
  });

  it('loads a synthetic fourth canonical lesson without route, runtime, mastery, or UI registration', async () => {
    const script = readJson(join(lessonDir(templateRoot, TEMPLATE), 'lesson-script.json'));
    const payload = script.payload as Record<string, unknown>;
    const activeDefinitionHash = script.content_sha256 as string;
    const provider = createRepoLessonRevisionProvider({
      contentRoot: templateRoot,
      catalog: [
        {
          lessonId: TEMPLATE,
          slug: TEMPLATE.toLowerCase(),
          title: 'Canonical Lesson Template',
          section: null,
          cluster: 'R1',
          estimatedMinutes: 15,
          orderedKcIds: payload.ordered_kc_ids as string[],
          prerequisiteLessonIds: [],
          runtimeKind: 'normalized',
          lifecycle: 'DRAFT',
          activeDefinitionHash,
          enabled: true,
          killSwitch: 'OPEN',
          routePath: `/app/lessons/${TEMPLATE.toLowerCase()}`,
          candidateNonclaimStatus: 'INTERNAL_DRAFT_ONLY',
        },
      ],
    });

    const loaded = await provider.loadActiveRevision({ slug: TEMPLATE.toLowerCase() });

    expect(loaded.lesson.lessonId).toBe(TEMPLATE);
    expect(loaded.lesson.grammar).not.toBe('L1_INLINE');
    expect(Object.keys(loaded.protectedAuthority.answerKey.byItemId).length).toBeGreaterThan(0);
  });

  it('keeps the synchronous provider surface behind a narrow repository adapter', () => {
    const revisionProvider = createRepoLessonRevisionProvider();
    const compatibility = createLessonContentProviderCompatibilityAdapter(revisionProvider);

    expect(compatibility.listLessonIds()).toEqual(ALL);
    expect(compatibility.getNormalizedLesson(L2).lessonId).toBe(L2);
    expect(compatibility.getDefinitionHash(L2)).toBe(definitionHashAt(contentRoot, L2));
    expect(compatibility.getAnswerKey(L2).lessonId).toBe(L2);
    expect(compatibility.getAuthoredBindings(L2).entries.length).toBeGreaterThan(0);
  });

  it('keeps disabled, kill-switched, and retired lessons out of every synchronous runtime method', () => {
    const activeDefinitionHash = definitionHashAt(contentRoot, L2);
    for (const [overrides, code] of [
      [{ enabled: false }, 'LESSON_DISABLED'],
      [{ killSwitch: 'ENGAGED' }, 'KILL_SWITCH_ENGAGED'],
      [{ lifecycle: 'RETIRED' }, 'LESSON_RETIRED'],
    ] as const) {
      const compatibility = createLessonContentProviderCompatibilityAdapter(
        createRepoLessonRevisionProvider({
          catalog: [l2CatalogDefinition(activeDefinitionHash, overrides)],
        }),
      );

      expect(compatibility.listLessonIds()).toEqual([]);
      expect(compatibility.hasLesson(L2)).toBe(false);
      for (const load of [
        () => compatibility.getNormalizedLesson(L2),
        () => compatibility.getDefinitionHash(L2),
        () => compatibility.getAnswerKey(L2),
        () => compatibility.getAuthoredBindings(L2),
      ]) {
        expect(load).toThrow(expect.objectContaining({ code }));
      }
    }
  });
});

afterAll(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});
