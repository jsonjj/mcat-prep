#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';

const assetDirectory = new URL('../../apps/learner-web/dist/assets/', import.meta.url);
const javascript = readdirSync(assetDirectory)
  .filter((filename) => filename.endsWith('.js'))
  .map((filename) => readFileSync(new URL(filename, assetDirectory), 'utf8'))
  .join('\n');

const forbidden = [
  'VECTOR_LESSON_PROTECTED_ANSWERS',
  'CORRECT_CHOICE_BY_ITEM',
  'server-only:vtr-',
  'vtr-vec-near-exit-initial',
  'vtr-trig-changed-exit-initial',
  'vtr-dir-changed-exit-initial',
  'v3-les-130923-uncalibrated-instructional-exit-v1',
];

const leaked = forbidden.filter((token) => javascript.includes(token));
if (leaked.length > 0) {
  throw new Error(
    `Target lesson server-only tokens reached the learner bundle: ${leaked.join(', ')}`,
  );
}
if (!javascript.includes('Vectors and Trigonometry')) {
  throw new Error('Target lesson learner route is missing from the built learner bundle');
}

console.log(
  `vector-lesson-bundle-scan OK (${javascript.length} JavaScript characters; no target protected tokens)`,
);
