import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ADMISSION_AUTHORITY_PATHS = Object.freeze({
  assignmentProof: 'content/lesson-factory/assignments/partition-proof.json',
  ownerSourceUseReceipt: 'content/lesson-factory/deadline-profile/owner-source-use-receipt.json',
  curriculumManifest: 'curriculum/v3/v3-lesson-authoring-manifest.json',
  sourceCrosswalk: '../research/mcat-curriculum-architecture-v3/v3-source-crosswalk.json',
  researchRegistry:
    '../research/mcat-curriculum-architecture-v3/skill-integrated-knowledge-graph/work/research-evidence-registry.json',
  taskPacketSchema: 'content/lesson-factory/schemas/task-source-packet.schema.json',
  sharedVocabularySchema: 'content/lesson-factory/schemas/shared-vocabulary.schema.json',
  deadlineProfile: 'content/lesson-factory/deadline-profile/deadline-profile.json',
  releasePolicy: 'content/lesson-factory/deadline-profile/release-policy.json',
  rubric: 'key-docs/lesson-quality-rubric.md',
} as const);

export type AdmissionAuthorityName = keyof typeof ADMISSION_AUTHORITY_PATHS;

const ROOT_MARKERS = Object.freeze({
  repositoryPackage: 'package.json',
  workspace: 'pnpm-workspace.yaml',
  contentPackage: 'packages/content/package.json',
} as const);

const REQUIRED_SCHEMA_VERSIONS = Object.freeze({
  'shared-vocabulary.schema.json': '5.0.0',
  'deadline-profile.schema.json': '7.0.0',
  'release-policy.schema.json': '3.0.0',
  'lifecycle-nonclaims.schema.json': '2.0.0',
  'owner-route-policy-receipt.schema.json': '4.0.0',
  'owner-source-use-receipt.schema.json': '2.0.0',
  'assignment-manifest.schema.json': '3.0.0',
  'task-source-packet.schema.json': '5.0.0',
  'lesson-handoff.schema.json': '4.0.0',
  'team-handoff.schema.json': '3.0.0',
  'candidate-quality-ledger.schema.json': '4.0.0',
  'kit-manifest.schema.json': '3.0.0',
  'import-index.schema.json': '3.0.0',
  'bundle-readiness.schema.json': '4.0.0',
  'runner-log-record.schema.json': '4.0.0',
  'intake-validation.schema.json': '3.0.0',
} as const);

export interface AdmissionAuthorityIo {
  readonly exists: (path: string) => boolean;
  readonly readText: (path: string) => string;
}

const NODE_IO: AdmissionAuthorityIo = {
  exists: existsSync,
  readText: (path) => readFileSync(path, 'utf8'),
};

export class AdmissionAuthorityUnavailable extends Error {
  readonly code = 'ADMISSION_AUTHORITY_UNAVAILABLE';

  constructor(
    readonly authority: string,
    readonly authorityPath: string,
    detail: string,
  ) {
    super(`AdmissionAuthorityUnavailable: ${authority} at ${authorityPath}: ${detail}`);
    this.name = 'AdmissionAuthorityUnavailable';
  }
}

const readRequired = (
  authority: string,
  absolutePath: string,
  io: AdmissionAuthorityIo,
): string => {
  if (!io.exists(absolutePath)) {
    throw new AdmissionAuthorityUnavailable(authority, absolutePath, 'required file is missing');
  }
  try {
    const text = io.readText(absolutePath);
    if (text.trim().length === 0) {
      throw new AdmissionAuthorityUnavailable(authority, absolutePath, 'required file is empty');
    }
    return text;
  } catch (error) {
    if (error instanceof AdmissionAuthorityUnavailable) throw error;
    throw new AdmissionAuthorityUnavailable(
      authority,
      absolutePath,
      `required file is unreadable: ${String(error)}`,
    );
  }
};

const parseRequiredJson = (
  authority: string,
  absolutePath: string,
  text: string,
): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('root must be a JSON object');
    }
    return value as Record<string, unknown>;
  } catch (error) {
    throw new AdmissionAuthorityUnavailable(
      authority,
      absolutePath,
      `required JSON is invalid: ${String(error)}`,
    );
  }
};

const assertIdentity = (
  authority: string,
  absolutePath: string,
  document: Record<string, unknown>,
  field: string,
  expected: string,
): void => {
  if (document[field] !== expected) {
    throw new AdmissionAuthorityUnavailable(
      authority,
      absolutePath,
      `${field} must be ${JSON.stringify(expected)}`,
    );
  }
};

const assertRootMarkers = (root: string, io: AdmissionAuthorityIo): void => {
  const packagePath = join(root, ROOT_MARKERS.repositoryPackage);
  const repositoryPackage = parseRequiredJson(
    'repositoryPackageMarker',
    packagePath,
    readRequired('repositoryPackageMarker', packagePath, io),
  );
  assertIdentity('repositoryPackageMarker', packagePath, repositoryPackage, 'name', 'mcat-mastery');

  const workspacePath = join(root, ROOT_MARKERS.workspace);
  const workspace = readRequired('workspaceMarker', workspacePath, io);
  if (!workspace.includes('packages/*')) {
    throw new AdmissionAuthorityUnavailable(
      'workspaceMarker',
      workspacePath,
      'workspace marker does not declare packages/*',
    );
  }

  const contentPackagePath = join(root, ROOT_MARKERS.contentPackage);
  const contentPackage = parseRequiredJson(
    'contentPackageMarker',
    contentPackagePath,
    readRequired('contentPackageMarker', contentPackagePath, io),
  );
  assertIdentity(
    'contentPackageMarker',
    contentPackagePath,
    contentPackage,
    'name',
    '@mcat/content',
  );
};

const assertAuthorityIdentity = (
  name: AdmissionAuthorityName,
  absolutePath: string,
  text: string,
): void => {
  if (name === 'rubric') return;
  const document = parseRequiredJson(name, absolutePath, text);
  const identity: Partial<
    Record<AdmissionAuthorityName, readonly [field: string, expected: string]>
  > = {
    assignmentProof: ['contract_id', 'lesson-factory.assignment-partition-proof'],
    ownerSourceUseReceipt: ['contract_id', 'lesson-factory.owner-source-use-receipt'],
    researchRegistry: ['record_kind', 'RESEARCH_EVIDENCE_REGISTRY'],
    taskPacketSchema: ['x_contract_id', 'lesson-factory.task-source-packet'],
    sharedVocabularySchema: ['x_contract_id', 'lesson-factory.shared-vocabulary'],
    deadlineProfile: ['contract_id', 'lesson-factory.deadline-profile'],
    releasePolicy: ['contract_id', 'lesson-factory.release-policy'],
  };
  const expected = identity[name];
  if (expected !== undefined) {
    assertIdentity(name, absolutePath, document, expected[0], expected[1]);
  }
  if (name === 'curriculumManifest') {
    if (document.curriculum === null || typeof document.curriculum !== 'object') {
      throw new AdmissionAuthorityUnavailable(
        name,
        absolutePath,
        'curriculum manifest has no curriculum object',
      );
    }
  }
  if (name === 'sourceCrosswalk') {
    if (!Array.isArray(document.mappings) || !Array.isArray(document.source_occurrences)) {
      throw new AdmissionAuthorityUnavailable(
        name,
        absolutePath,
        'source crosswalk has no mappings/source_occurrences arrays',
      );
    }
  }
};

export function assertAdmissionAuthorityAvailable(
  root: string,
  io: AdmissionAuthorityIo = NODE_IO,
): void {
  const absoluteRoot = resolve(root);
  assertRootMarkers(absoluteRoot, io);

  for (const [name, relativePath] of Object.entries(ADMISSION_AUTHORITY_PATHS) as Array<
    [AdmissionAuthorityName, string]
  >) {
    const absolutePath = resolve(absoluteRoot, relativePath);
    assertAuthorityIdentity(name, absolutePath, readRequired(name, absolutePath, io));
  }

  for (const [fileName, version] of Object.entries(REQUIRED_SCHEMA_VERSIONS)) {
    const absolutePath = join(absoluteRoot, 'content/lesson-factory/schemas', fileName);
    const schema = parseRequiredJson(
      `schema:${fileName}`,
      absolutePath,
      readRequired(`schema:${fileName}`, absolutePath, io),
    );
    assertIdentity(`schema:${fileName}`, absolutePath, schema, 'x_contract_version', version);
  }
}

function verifyCandidate(root: string, io: AdmissionAuthorityIo): string {
  const candidate = resolve(root);
  assertAdmissionAuthorityAvailable(candidate, io);
  return candidate;
}

export function resolveAdmissionRepositoryRoot(
  moduleUrl: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  io: AdmissionAuthorityIo = NODE_IO,
): string {
  const override = environment.MCAT_ADMISSION_REPOSITORY_ROOT;
  if (override !== undefined && override.trim() !== '') {
    return verifyCandidate(override, io);
  }

  let candidate = dirname(fileURLToPath(moduleUrl));
  while (true) {
    try {
      assertRootMarkers(candidate, io);
    } catch (error) {
      if (!(error instanceof AdmissionAuthorityUnavailable)) throw error;
      const parent = dirname(candidate);
      if (parent === candidate) {
        throw new AdmissionAuthorityUnavailable(
          'repositoryRoot',
          fileURLToPath(moduleUrl),
          'no ancestor contains every verified repository marker',
        );
      }
      candidate = parent;
      continue;
    }
    return verifyCandidate(candidate, io);
  }
}

export const ADMISSION_REPOSITORY_ROOT = resolveAdmissionRepositoryRoot(import.meta.url);
