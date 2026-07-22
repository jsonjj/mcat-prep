import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const assetsDirectory = new URL('../dist/assets/', import.meta.url);
const protectedScoringMarkers = [
  'REFERENCE_POINT',
  'MODEL_SELECTION',
  'sourceCandidateId',
  'fast-5each-',
  'fast-cars-',
  'Each question may be answered only once.',
  'Complete all 12 questions before generating the report.',
];

const javascriptFiles = readdirSync(assetsDirectory)
  .filter((file) => file.endsWith('.js'))
  .map((file) => join(assetsDirectory.pathname, file));

const leakedMarkers = [];
for (const file of javascriptFiles) {
  const source = readFileSync(file, 'utf8');
  for (const marker of protectedScoringMarkers) {
    if (source.includes(marker)) leakedMarkers.push(`${marker} in ${file}`);
  }
}

if (leakedMarkers.length > 0) {
  console.error('Snapshot bundle boundary FAILED:');
  for (const marker of leakedMarkers) console.error(`  - ${marker}`);
  process.exit(1);
}

process.stdout.write(
  `Snapshot bundle boundary OK (${javascriptFiles.length} client bundle checked).\n`,
);
