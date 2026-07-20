#!/usr/bin/env node
/**
 * Copyright & protected-content guardrail (CI gate).
 *
 * Fails if the repository tracks anything it must never contain:
 *  - reference PDFs or their derivatives (screenshots, OCR, extracted pages)
 *  - committed answer-key artifacts
 *  - a protected-content canary token
 *
 * NOTE: a full learner-bundle answer-key scan activates in Phase 4, once the
 * authority engine moves server-side. In the local build the in-process authority
 * intentionally bundles content (see ADR 0004), so bundle key-scanning is deferred.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CANARY = 'MCAT_PROTECTED_CANARY';
const FORBIDDEN_PATH_PATTERNS = [
  /\.pdf$/i,
  /(^|\/)research-derivatives\//i,
  /(^|\/)\.tmp_pg_inspect\//i,
  /\.answer-key\.json$/i,
];

function trackedFiles() {
  try {
    return execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    console.warn('protected-field-scan: not a git repo; skipping tracked-file scan.');
    return [];
  }
}

const problems = [];
const files = trackedFiles();

for (const file of files) {
  for (const pattern of FORBIDDEN_PATH_PATTERNS) {
    if (pattern.test(file)) {
      problems.push(`Forbidden tracked file: ${file} (matches ${pattern})`);
    }
  }
}

// Scan text sources for the canary token (excluding this scanner, which defines it).
const TEXT_EXT = /\.(ts|tsx|js|mjs|json|md|css|html)$/i;
for (const file of files) {
  if (!TEXT_EXT.test(file)) continue;
  if (file.includes('tools/scanners/')) continue;
  try {
    const content = readFileSync(file, 'utf8');
    if (content.includes(CANARY)) {
      problems.push(`Protected canary token found in tracked file: ${file}`);
    }
  } catch {
    /* unreadable/binary — ignore */
  }
}

if (problems.length > 0) {
  console.error('protected-field-scan FAILED:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`protected-field-scan OK (${files.length} tracked files checked).`);
