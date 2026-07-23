import type {
  LessonDefinitionVersion,
  V3LessonId,
} from '@mcat/contracts';
import {
  LessonDefinitionSchema,
  type LessonDefinition,
} from './lesson-definition';

export type LessonRegistryMode = 'production' | 'test_fixture';

export interface LessonRegistryMetadata {
  lessonId: V3LessonId;
  definitionVersion: LessonDefinitionVersion;
  contentRelease: string;
  status: LessonDefinition['status'];
  testOnly: boolean;
}

const registryKey = (
  lessonId: V3LessonId,
  version: LessonDefinitionVersion,
): string => `${lessonId}@${version}`;

/**
 * Server-only validated definition registry. Later curriculum batches add
 * definition modules and compose them here; the learner runner never changes.
 */
export class LessonDefinitionRegistry {
  private readonly definitions = new Map<string, LessonDefinition>();

  constructor(inputs: readonly unknown[], mode: LessonRegistryMode) {
    for (const input of inputs) {
      const definition = LessonDefinitionSchema.parse(input);
      if (mode === 'production' && definition.testOnly) {
        throw new Error(`Test-only lesson ${definition.id} cannot enter a production registry.`);
      }
      const key = registryKey(definition.id, definition.definitionVersion);
      if (this.definitions.has(key)) {
        throw new Error(`Duplicate lesson definition pin ${key}.`);
      }
      this.definitions.set(key, definition);
    }
  }

  get(
    lessonId: V3LessonId,
    definitionVersion: LessonDefinitionVersion,
    contentRelease: string,
  ): LessonDefinition | null {
    const definition = this.definitions.get(registryKey(lessonId, definitionVersion));
    if (!definition || definition.contentRelease !== contentRelease) return null;
    return definition;
  }

  list(): LessonRegistryMetadata[] {
    return [...this.definitions.values()]
      .map((definition) => ({
        lessonId: definition.id,
        definitionVersion: definition.definitionVersion,
        contentRelease: definition.contentRelease,
        status: definition.status,
        testOnly: definition.testOnly,
      }))
      .sort((left, right) =>
        registryKey(left.lessonId, left.definitionVersion).localeCompare(
          registryKey(right.lessonId, right.definitionVersion),
        ),
      );
  }
}
