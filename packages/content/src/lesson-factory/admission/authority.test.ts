import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ADMISSION_AUTHORITY_PATHS,
  AdmissionAuthorityUnavailable,
  assertAdmissionAuthorityAvailable,
  resolveAdmissionRepositoryRoot,
} from './authority';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..', '..');
const AUTHORITY_MODULE_URL = new URL('./authority.ts', import.meta.url).href;
const realIo = {
  exists: existsSync,
  readText: (path: string): string => readFileSync(path, 'utf8'),
};

describe('packet-v5 admission authority bootstrap', () => {
  it('anchors the repository to import.meta.url and verifies an explicit override', () => {
    expect(resolveAdmissionRepositoryRoot(AUTHORITY_MODULE_URL, {})).toBe(REPO_ROOT);
    expect(
      resolveAdmissionRepositoryRoot(AUTHORITY_MODULE_URL, {
        MCAT_ADMISSION_REPOSITORY_ROOT: REPO_ROOT,
      }),
    ).toBe(REPO_ROOT);
    expect(resolveAdmissionRepositoryRoot.toString()).not.toContain('process.cwd');
  });

  it('fails closed with one stable error when repository markers are absent', () => {
    expect(() =>
      resolveAdmissionRepositoryRoot(AUTHORITY_MODULE_URL, {
        MCAT_ADMISSION_REPOSITORY_ROOT: '/definitely/not/the/mcat/repository',
      }),
    ).toThrowError(AdmissionAuthorityUnavailable);
  });

  it('fails closed when the required sibling research registry is unavailable', () => {
    const missing = resolve(REPO_ROOT, ADMISSION_AUTHORITY_PATHS.researchRegistry);
    const missingResearchIo = {
      ...realIo,
      exists: (path: string) => path !== missing && realIo.exists(path),
    };

    expect(() => assertAdmissionAuthorityAvailable(REPO_ROOT, missingResearchIo)).toThrow(
      /AdmissionAuthorityUnavailable.*researchRegistry.*research-evidence-registry/is,
    );
    expect(() =>
      resolveAdmissionRepositoryRoot(AUTHORITY_MODULE_URL, {}, missingResearchIo),
    ).toThrow(/AdmissionAuthorityUnavailable.*researchRegistry.*research-evidence-registry/is);
  });

  it('fails closed when any one of the ten packet inputs is unavailable', () => {
    const missing = join(REPO_ROOT, ADMISSION_AUTHORITY_PATHS.rubric);

    expect(() =>
      assertAdmissionAuthorityAvailable(REPO_ROOT, {
        ...realIo,
        exists: (path) => path !== missing && realIo.exists(path),
      }),
    ).toThrow(/AdmissionAuthorityUnavailable.*rubric.*lesson-quality-rubric/is);
  });
});
