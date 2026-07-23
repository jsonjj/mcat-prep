import { z } from 'zod';

/** Version pin for a canonical lesson definition, not a publication claim. */
export const LessonDefinitionVersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/, 'semantic lesson definition version');
export type LessonDefinitionVersion = z.infer<typeof LessonDefinitionVersionSchema>;

export const Sha256DigestSchema = z.string().regex(/^[a-f0-9]{64}$/, 'lowercase SHA-256 digest');
export type Sha256Digest = z.infer<typeof Sha256DigestSchema>;

export const V3RegistryPinSchema = z
  .object({
    manifestSchemaVersion: z.literal('mcat-v3-lesson-authoring-manifest-2'),
    artifactId: z.string().min(1),
    sha256: Sha256DigestSchema,
    phase0FreezeId: z.string().min(1),
    canonicalFreezeId: z.string().min(1),
    graphFreezeId: z.string().min(1),
    sequenceFreezeId: z.string().min(1),
  })
  .strict();
export type V3RegistryPin = z.infer<typeof V3RegistryPinSchema>;
