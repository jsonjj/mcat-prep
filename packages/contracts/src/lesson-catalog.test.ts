import { describe, expect, it } from 'vitest';

import {
  LessonCatalogEntrySchema,
  LessonCatalogIdentitySchema,
  LessonCatalogResponseSchema,
} from './lesson-catalog';

const entry = {
  lessonId: 'V3-LES-789208',
  slug: 'v3-les-789208',
  title: 'Quantitative Measurement and Scaling',
  section: null,
  cluster: 'R1',
  estimatedMinutes: 15,
  orderedKcIds: ['V3-KC-399019', 'V3-KC-799492', 'V3-KC-919842', 'V3-KC-981438'],
  prerequisiteLessonIds: [],
  runtimeKind: 'normalized',
  lifecycle: 'DRAFT',
  activeDefinitionHash: 'bce8010490b939c606ef8057a8b1dcca40bdc00ed18288751d3cc51c301fb754',
  enabled: true,
  killSwitch: 'OPEN',
  routePath: '/app/lessons/v3-les-789208',
  candidateNonclaimStatus: 'INTERNAL_DRAFT_ONLY',
} as const;

describe('lesson catalog wire contract', () => {
  it('parses the complete closed learner-safe catalog entry', () => {
    expect(LessonCatalogEntrySchema.parse(entry)).toEqual(entry);
    expect(
      LessonCatalogIdentitySchema.parse({
        lessonId: entry.lessonId,
        slug: entry.slug,
        activeDefinitionHash: entry.activeDefinitionHash,
      }),
    ).toEqual({
      lessonId: entry.lessonId,
      slug: entry.slug,
      activeDefinitionHash: entry.activeDefinitionHash,
    });
  });

  it('rejects protected, scoring, and source-only fields instead of stripping them', () => {
    for (const protectedField of [
      { answerKey: { item: 'A' } },
      { acceptedResponses: ['A'] },
      { rationale: 'Because.' },
      { scoringAuthority: { mode: 'exact' } },
      { structuredAuthority: { fields: ['answer'] } },
      { protectedRef: 'server-only' },
      { sourceRef: 'internal-item-1' },
    ]) {
      expect(LessonCatalogEntrySchema.safeParse({ ...entry, ...protectedField }).success).toBe(
        false,
      );
    }
  });

  it('closes runtime, lifecycle, availability, hash, and route values', () => {
    expect(
      LessonCatalogEntrySchema.safeParse({ ...entry, runtimeKind: 'bespoke-fourth-runtime' })
        .success,
    ).toBe(false);
    expect(LessonCatalogEntrySchema.safeParse({ ...entry, lifecycle: 'PUBLISHED' }).success).toBe(
      false,
    );
    expect(LessonCatalogEntrySchema.safeParse({ ...entry, killSwitch: 'MAYBE' }).success).toBe(
      false,
    );
    expect(
      LessonCatalogEntrySchema.safeParse({ ...entry, activeDefinitionHash: 'not-a-hash' }).success,
    ).toBe(false);
    expect(
      LessonCatalogEntrySchema.safeParse({ ...entry, routePath: '/lesson/somewhere-else' }).success,
    ).toBe(false);
  });

  it('rejects duplicate ids, slugs, and routes in one catalog response', () => {
    const duplicate = { ...entry, lessonId: 'V3-LES-844372' };
    expect(LessonCatalogResponseSchema.safeParse({ lessons: [entry, duplicate] }).success).toBe(
      false,
    );
  });

  it('rejects duplicate KCs, duplicate prerequisites, and self-prerequisites directly', () => {
    expect(
      LessonCatalogEntrySchema.safeParse({
        ...entry,
        orderedKcIds: [entry.orderedKcIds[0], entry.orderedKcIds[0]],
      }).success,
    ).toBe(false);
    expect(
      LessonCatalogEntrySchema.safeParse({
        ...entry,
        prerequisiteLessonIds: ['V3-LES-130923', 'V3-LES-130923'],
      }).success,
    ).toBe(false);
    expect(
      LessonCatalogEntrySchema.safeParse({
        ...entry,
        prerequisiteLessonIds: [entry.lessonId],
      }).success,
    ).toBe(false);
  });

  it('serializes with no answer, rationale, scoring, protected, or source surface', () => {
    const response = LessonCatalogResponseSchema.parse({ lessons: [entry] });
    expect(JSON.stringify(response)).not.toMatch(
      /answer|acceptedResponses|rationale|scoring|protected|sourceRef|source_/i,
    );
  });
});
