/**
 * Generate the embedded CARS Duel topic pool for @mcat/content from the vetted
 * canonical source `content/cars-duel/topics.json`.
 *
 * The content package can only bundle files under its own `src/`, so the vetted
 * 150-topic pool is embedded as a generated `.data.ts` (the same pattern as
 * `packages/content/src/data/*.data.ts`). This maps the persisted snake_case
 * shape (`argument_structure`) to the canonical camelCase runtime shape
 * (`argumentStructure`) so there is a single runtime source of truth.
 *
 * Run: node scripts/generate-cars-duel-topics.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'content/cars-duel/topics.json');
const out = join(root, 'packages/content/src/cars-duel/topics.data.ts');

const raw = JSON.parse(readFileSync(source, 'utf8'));
if (!Array.isArray(raw) || raw.length === 0) {
  throw new Error('content/cars-duel/topics.json must be a non-empty array.');
}

const mapped = raw.map((t) => ({
  id: t.id,
  proposition: t.proposition,
  theme: t.theme,
  argumentStructure: t.argument_structure,
  difficulty: t.difficulty,
  charge: t.charge,
}));

const header = `/**
 * AUTO-GENERATED — do not edit by hand.
 *
 * The vetted CARS Duel topic pool (${mapped.length} topics), embedded from the
 * canonical source content/cars-duel/topics.json. Regenerate with
 * \`node scripts/generate-cars-duel-topics.mjs\`. Contains only debate
 * propositions and structural metadata — no answer keys, no proprietary prose.
 */
import type { CarsDuelTopic } from '@mcat/contracts';

export const CARS_DUEL_TOPICS_DATA: readonly CarsDuelTopic[] = ${JSON.stringify(mapped, null, 2)};
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, header);
console.log(`Wrote ${mapped.length} CARS Duel topics to ${out}`);
