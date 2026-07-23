#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const STUDENT_PHASE_LABELS = [
  'Foundations',
  'Core Models',
  'Integrated Reasoning',
  'Transfer and Application',
  'Review and Readiness',
];

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultOutputPath = resolve(scriptDirectory, '../src/data/curriculum-v3.generated.ts');
const [sourceDirectoryArgument, outputPathArgument] = process.argv.slice(2);

if (!sourceDirectoryArgument) {
  throw new Error(
    'Usage: node apps/learner-web/scripts/generate-curriculum-v3.mjs <v3-source-directory> [output-path]',
  );
}

const sourceDirectory = resolve(sourceDirectoryArgument);
const registryPath = join(sourceDirectory, 'work/v3-authoritative-registry.json');
const outputPath = outputPathArgument ? resolve(outputPathArgument) : defaultOutputPath;
const registry = JSON.parse(await readFile(registryPath, 'utf8'));

function indexBy(records, idField) {
  return new Map(records.map((record) => [record[idField], record]));
}

function requireRecord(record, description) {
  if (!record) throw new Error(`Missing ${description}`);
  return record;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sortByOrder(records, field) {
  return [...records].sort((left, right) => left[field] - right[field]);
}

const sequence = registry.sequence;
const relations = sequence.normalized_sequence_relations;
const phaseById = indexBy(sequence.phases, 'phase_id');
const moduleById = indexBy(sequence.modules, 'module_id');
const lessonById = indexBy(registry.lessons, 'lesson_id');
const kcById = indexBy(registry.kcs, 'kc_id');
const internalOrderByLessonId = indexBy(relations.lesson_internal_order_relations, 'lesson_id');

const phaseOrders = new Map();
for (const relation of relations.pathway_phase_relations.filter(
  (record) => record.conditional_overlay === false,
)) {
  const priorOrder = phaseOrders.get(relation.phase_id);
  if (priorOrder !== undefined) {
    assert(
      priorOrder === relation.pathway_phase_order,
      `Conflicting phase order for ${relation.phase_id}`,
    );
  } else {
    phaseOrders.set(relation.phase_id, relation.pathway_phase_order);
  }
}

const firstDeliveryByModuleId = new Map();
for (const relation of relations.module_delivery_event_relations) {
  if (relation.placement_kind !== 'LESSON_FIRST_DELIVERY') continue;
  const existing = firstDeliveryByModuleId.get(relation.module_id) ?? [];
  existing.push(relation);
  firstDeliveryByModuleId.set(relation.module_id, existing);
}

const revisitCountByModuleId = new Map();
for (const relation of relations.module_revisit_relations) {
  revisitCountByModuleId.set(
    relation.module_id,
    (revisitCountByModuleId.get(relation.module_id) ?? 0) + 1,
  );
}

const phaseModuleRelations = [...relations.phase_module_relations].sort(
  (left, right) =>
    phaseOrders.get(left.phase_id) - phaseOrders.get(right.phase_id) ||
    left.phase_module_order - right.phase_module_order,
);

const phases = [...phaseOrders.entries()]
  .sort((left, right) => left[1] - right[1])
  .map(([phaseId, order]) => {
    const phase = requireRecord(phaseById.get(phaseId), `phase ${phaseId}`);
    const modules = phaseModuleRelations
      .filter((relation) => relation.phase_id === phaseId)
      .map((relation) => {
        const module = requireRecord(
          moduleById.get(relation.module_id),
          `module ${relation.module_id}`,
        );
        const lessons = sortByOrder(
          firstDeliveryByModuleId.get(module.module_id) ?? [],
          'lesson_first_delivery_ordinal',
        ).map((delivery) => {
          const lesson = requireRecord(
            lessonById.get(delivery.target_lesson_id),
            `lesson ${delivery.target_lesson_id}`,
          );
          const internalOrder = requireRecord(
            internalOrderByLessonId.get(lesson.lesson_id),
            `lesson-internal order for ${lesson.lesson_id}`,
          );
          const orderedKcs = internalOrder.ordered_nested_kc_ids.map((kcId, index) => {
            const kc = requireRecord(kcById.get(kcId), `KC ${kcId}`);
            return { id: kc.kc_id, label: kc.display_label, order: index + 1 };
          });

          return {
            id: lesson.lesson_id,
            shortTitle: lesson.short_display_alias,
            canonicalTitle: lesson.canonical_display_label,
            position: delivery.lesson_first_delivery_ordinal,
            kcs: orderedKcs,
          };
        });

        return {
          id: module.module_id,
          title: module.title,
          order: relation.phase_module_order,
          lane: relation.lane,
          deliveryMode: module.delivery_mode,
          revisitCount: revisitCountByModuleId.get(module.module_id) ?? 0,
          lessons,
        };
      });

    return {
      id: phase.phase_id,
      label: STUDENT_PHASE_LABELS[order - 1],
      title: phase.title,
      order,
      firstDeliveryLessonCount: modules.reduce((count, module) => count + module.lessons.length, 0),
      modules,
    };
  });

const modules = phases.flatMap((phase) => phase.modules);
const lessons = modules.flatMap((module) => module.lessons);
const kcs = lessons.flatMap((lesson) => lesson.kcs);
const stats = {
  phases: phases.length,
  modules: modules.length,
  firstDeliveryLessons: lessons.length,
  kcOccurrences: kcs.length,
  uniqueKcs: new Set(kcs.map((kc) => kc.id)).size,
  revisits: modules.reduce((count, module) => count + module.revisitCount, 0),
};

assert(phases.length === 5, `Expected 5 phases, found ${phases.length}`);
assert(modules.length === 40, `Expected 40 modules, found ${modules.length}`);
assert(lessons.length === 114, `Expected 114 lessons, found ${lessons.length}`);
assert(kcs.length === 422, `Expected 422 KC occurrences, found ${kcs.length}`);
assert(stats.uniqueKcs === 422, `Expected 422 unique KCs, found ${stats.uniqueKcs}`);
assert(
  lessons.every((lesson) => lesson.kcs.length >= 1 && lesson.kcs.length <= 5),
  'Every lesson must own between one and five KCs',
);
assert(
  lessons
    .map((lesson) => lesson.position)
    .sort((a, b) => a - b)
    .every((position, index) => position === index + 1),
  'Lesson positions must be contiguous from 1 through 114',
);
assert(
  phases.map((phase) => phase.firstDeliveryLessonCount).join(',') === '27,30,32,25,0',
  'Unexpected first-delivery lessons by phase',
);
assert(
  modules.filter((module) => module.lane === 'CARS_PARALLEL').flatMap((module) => module.lessons)
    .length === 9,
  'Expected 9 CARS lessons',
);
assert(
  modules
    .filter((module) => module.lane === 'CARS_PARALLEL')
    .flatMap((module) => module.lessons)
    .flatMap((lesson) => lesson.kcs).length === 33,
  'Expected 33 CARS KCs',
);
assert(
  phases.at(-1).modules.length === 5 &&
    phases.at(-1).modules.every((module) => module.lessons.length === 0) &&
    stats.revisits === 114,
  'Phase 5 must contain five revisit-only modules and 114 revisits',
);

const output = `/* This file is generated by apps/learner-web/scripts/generate-curriculum-v3.mjs. */\n\nexport type CurriculumKc = Readonly<{\n  id: string;\n  label: string;\n  order: number;\n}>;\n\nexport type CurriculumLesson = Readonly<{\n  id: string;\n  shortTitle: string;\n  canonicalTitle: string;\n  position: number;\n  kcs: readonly CurriculumKc[];\n}>;\n\nexport type CurriculumModule = Readonly<{\n  id: string;\n  title: string;\n  order: number;\n  lane: string;\n  deliveryMode: string;\n  revisitCount: number;\n  lessons: readonly CurriculumLesson[];\n}>;\n\nexport type CurriculumPhase = Readonly<{\n  id: string;\n  label: string;\n  title: string;\n  order: number;\n  firstDeliveryLessonCount: number;\n  modules: readonly CurriculumModule[];\n}>;\n\nexport type CurriculumStats = Readonly<{\n  phases: number;\n  modules: number;\n  firstDeliveryLessons: number;\n  kcOccurrences: number;\n  uniqueKcs: number;\n  revisits: number;\n}>;\n\nexport const CURRICULUM_PHASES = ${JSON.stringify(phases, null, 2)} as const satisfies readonly CurriculumPhase[];\n\nexport const CURRICULUM_STATS = ${JSON.stringify(stats, null, 2)} as const satisfies CurriculumStats;\n`;

const prettierConfig = await prettier.resolveConfig(outputPath);
await writeFile(
  outputPath,
  await prettier.format(output, { ...prettierConfig, filepath: outputPath }),
);
