import { z } from 'zod';

import { CatalogLessonIdSchema } from './lesson-delivery';
import { SectionSchema, SkillClusterSchema } from './vocab';

export const LessonSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase alphanumeric with single hyphens');
export type LessonSlug = z.infer<typeof LessonSlugSchema>;

export const LessonRuntimeKindSchema = z.enum(['vector', 'normalized']);
export type LessonRuntimeKind = z.infer<typeof LessonRuntimeKindSchema>;

export const LessonLifecycleSchema = z.enum(['DRAFT', 'CANDIDATE', 'ACTIVE', 'RETIRED']);
export type LessonLifecycle = z.infer<typeof LessonLifecycleSchema>;

export const LessonKillSwitchSchema = z.enum(['OPEN', 'ENGAGED']);
export type LessonKillSwitch = z.infer<typeof LessonKillSwitchSchema>;

/**
 * Catalog visibility is not a quality, approval, efficacy, or publication claim.
 * The only currently representable candidate state remains internal-draft-only.
 */
export const CandidateNonclaimStatusSchema = z.literal('INTERNAL_DRAFT_ONLY');
export type CandidateNonclaimStatus = z.infer<typeof CandidateNonclaimStatusSchema>;

export const LessonDefinitionHashSchema = z.string().regex(/^[a-f0-9]{64}$/, 'lowercase SHA-256');
export type LessonDefinitionHash = z.infer<typeof LessonDefinitionHashSchema>;

export const LessonCatalogEntrySchema = z
  .object({
    lessonId: CatalogLessonIdSchema,
    slug: LessonSlugSchema,
    title: z.string().min(1),
    section: SectionSchema.nullable(),
    cluster: SkillClusterSchema,
    estimatedMinutes: z.number().int().positive().max(120),
    orderedKcIds: z.array(z.string().regex(/^V3-KC-\d{6}$/)).min(1),
    prerequisiteLessonIds: z.array(CatalogLessonIdSchema),
    runtimeKind: LessonRuntimeKindSchema,
    lifecycle: LessonLifecycleSchema,
    activeDefinitionHash: LessonDefinitionHashSchema,
    enabled: z.boolean(),
    killSwitch: LessonKillSwitchSchema,
    routePath: z.string().min(1),
    candidateNonclaimStatus: CandidateNonclaimStatusSchema,
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.routePath !== `/app/lessons/${entry.slug}`) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['routePath'],
        message: `routePath must be /app/lessons/${entry.slug}`,
      });
    }
    if (new Set(entry.orderedKcIds).size !== entry.orderedKcIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['orderedKcIds'],
        message: 'orderedKcIds must be unique',
      });
    }
    if (new Set(entry.prerequisiteLessonIds).size !== entry.prerequisiteLessonIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prerequisiteLessonIds'],
        message: 'prerequisiteLessonIds must be unique',
      });
    }
    if (entry.prerequisiteLessonIds.includes(entry.lessonId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prerequisiteLessonIds'],
        message: 'a lesson cannot require itself',
      });
    }
  });
export type LessonCatalogEntry = z.infer<typeof LessonCatalogEntrySchema>;

export const LessonCatalogIdentitySchema = z
  .object({
    lessonId: CatalogLessonIdSchema,
    slug: LessonSlugSchema,
    activeDefinitionHash: LessonDefinitionHashSchema,
  })
  .strict();
export type LessonCatalogIdentity = z.infer<typeof LessonCatalogIdentitySchema>;

export const LessonCatalogResponseSchema = z
  .object({ lessons: z.array(LessonCatalogEntrySchema) })
  .strict()
  .superRefine(({ lessons }, context) => {
    for (const field of ['lessonId', 'slug', 'routePath'] as const) {
      const seen = new Set<string>();
      lessons.forEach((lesson, index) => {
        const value = lesson[field];
        if (seen.has(value)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lessons', index, field],
            message: `duplicate ${field} "${value}"`,
          });
        }
        seen.add(value);
      });
    }
  });
export type LessonCatalogResponse = z.infer<typeof LessonCatalogResponseSchema>;
