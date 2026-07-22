#!/usr/bin/env node
/**
 * Copyright and protected-content guardrail (CI gate).
 *
 * This scanner rejects tracked reference derivatives, answer-key artifacts,
 * protected-content canaries, and answer-bearing JSONL outside the one
 * deliberately server-only test-fixture location.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CANARY = 'MCAT_PROTECTED_CANARY';
const FORBIDDEN_PATH_PATTERNS = [
  /\.pdf$/i,
  /(^|\/)research-derivatives\//i,
  /(^|\/)\.tmp_pg_inspect\//i,
  /\.answer-key\.json$/i,
];
const TEXT_FILE_PATTERN = /\.(?:ts|tsx|js|mjs|json|jsonl|md|css|html)$/i;
const SERVER_ONLY_FIXTURE_PATTERN =
  /^tests\/fixtures\/server-only\/protected\/(?:[^/]+\/)*[^/]+\.jsonl$/i;

export const PROTECTED_FIELD_PATTERN =
  /"(?:proposed_key|correct_choice_id|option_rationales|rationale_correct|rationale_incorrect|protected_rationale|rationales)"\s*:/i;

export function scanTrackedFiles(files, readText) {
  const problems = [];

  for (const file of files) {
    for (const pattern of FORBIDDEN_PATH_PATTERNS) {
      if (pattern.test(file)) {
        problems.push(`Forbidden tracked file: ${file} (matches ${pattern})`);
      }
    }

    if (!TEXT_FILE_PATTERN.test(file)) {
      continue;
    }

    let content;
    try {
      content = readText(file);
    } catch {
      problems.push(`Unable to inspect tracked text file: ${file}`);
      continue;
    }

    if (file !== 'tools/scanners/protected-field-scan.mjs' && content.includes(CANARY)) {
      problems.push(`Protected canary token found in tracked file: ${file}`);
    }

    if (
      /\.jsonl$/i.test(file) &&
      !SERVER_ONLY_FIXTURE_PATTERN.test(file) &&
      PROTECTED_FIELD_PATTERN.test(content)
    ) {
      problems.push(
        `Protected fields found in tracked JSONL outside the server-only fixture allowlist: ${file}`,
      );
    }
  }

  return problems;
}

function trackedFiles() {
  try {
    return execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    console.warn('protected-field-scan: not a git repo; skipping tracked-file scan.');
    return [];
  }
}

function main() {
  const files = trackedFiles();
  const problems = scanTrackedFiles(files, (file) => readFileSync(file, 'utf8'));

  if (problems.length > 0) {
    console.error('protected-field-scan FAILED:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  console.log(`protected-field-scan OK (${files.length} tracked files checked).`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
