import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { canonicalJson, packetSemanticErrors } from './packet-semantics';
import {
  SchemaRegistry,
  validateAgainst,
  type JsonObject,
  type JsonValue,
} from './json-schema-subset';
import {
  parseReference,
  REFERENCE_KINDS,
  REPO_ROOT,
  resolveReference,
  schemaDefNameFor,
} from './reference-model';

const SCHEMA_DIR = join(REPO_ROOT, 'content/lesson-factory/schemas');
const SCHEMA_DIR_REL = 'content/lesson-factory/schemas';
const CONTRACT_BASE = 'https://mcat-mastery.internal/lesson-factory/schemas/v1/';

export const DYNAMIC_REFERENCE_KINDS: readonly string[] = REFERENCE_KINDS.filter(
  (kind) => kind.resolution.strategy === 'DERIVED_PATH',
).map((kind) => kind.kind);

const KNOWN_KINDS = new Set(REFERENCE_KINDS.map((kind) => kind.kind));
const PINNED_REFERENCE = /^([a-z][a-z0-9-]*):(.+)#sha256:([0-9a-f]{64})$/;
const PINNED_REFERENCE_DEFS = new Set([
  ...REFERENCE_KINDS.map((kind) => schemaDefNameFor(kind.kind)),
  'FrozenReleasePolicyRef',
]);

const KIND_BY_SCHEMA_FILE: ReadonlyArray<readonly [string, string]> = [
  ['profile', 'deadline-profile.schema.json'],
  ['policy', 'release-policy.schema.json'],
  ['lifecycle', 'lifecycle-nonclaims.schema.json'],
  ['receipt', 'owner-route-policy-receipt.schema.json'],
  ['source-use-receipt', 'owner-source-use-receipt.schema.json'],
  ['assignment', 'assignment-manifest.schema.json'],
  ['packet', 'task-source-packet.schema.json'],
  ['quarantine-packet', 'task-source-packet.schema.json'],
  ['handoff', 'lesson-handoff.schema.json'],
  ['team-handoff', 'team-handoff.schema.json'],
  ['ledger', 'candidate-quality-ledger.schema.json'],
  ['kit', 'kit-manifest.schema.json'],
  ['import-index', 'import-index.schema.json'],
  ['readiness', 'bundle-readiness.schema.json'],
];

export interface RegisteredContract {
  documentKind: string;
  contractId: string;
  contractVersion: string;
  schemaFile: string;
  schemaLocator: string;
  schemaSha256: string;
}

function readSchemaFile(fileName: string): { text: string; schema: JsonObject } {
  const text = readFileSync(join(SCHEMA_DIR, fileName), 'utf8');
  return { text, schema: JSON.parse(text) as JsonObject };
}

export const INTAKE_REGISTRY: readonly RegisteredContract[] = KIND_BY_SCHEMA_FILE.map(
  ([documentKind, schemaFile]) => {
    const { text, schema } = readSchemaFile(schemaFile);
    return {
      documentKind,
      contractId: String(schema.x_contract_id),
      contractVersion: String(schema.x_contract_version),
      schemaFile,
      schemaLocator: `${SCHEMA_DIR_REL}/${schemaFile}`,
      schemaSha256: createHash('sha256').update(text, 'utf8').digest('hex'),
    };
  },
);

const BY_CONTRACT_ID = new Map<string, RegisteredContract>();
for (const entry of INTAKE_REGISTRY) {
  if (!BY_CONTRACT_ID.has(entry.contractId)) BY_CONTRACT_ID.set(entry.contractId, entry);
}
const BY_DOCUMENT_KIND = new Map(INTAKE_REGISTRY.map((entry) => [entry.documentKind, entry]));

export type ResolutionStatus =
  | 'RESOLVED'
  | 'NOT_YET_PRODUCED'
  | 'IDENTITY_ONLY'
  | 'MISMATCHED'
  | 'MALFORMED';

export interface ReferenceCheck {
  field: string;
  kind: string;
  digest: string;
  status: ResolutionStatus;
}

export interface InputCheck {
  field: string;
  input: string;
  path: string;
  fileStatus: 'RESOLVED' | 'MISMATCHED' | 'MISSING';
  contentStatus: 'RESOLVED' | 'MISMATCHED' | 'MISSING';
}

export interface IntakeDocumentIdentity {
  kind: string;
  ref: string;
  sha256: string;
  contract_id: string;
  contract_version: string;
  schema_file: string;
  schema_locator: string;
  schema_sha256: string;
}

export interface IntakeRecord {
  contract_id: 'lesson-factory.intake-validation';
  contract_version: string;
  document: IntakeDocumentIdentity;
  schema_validation: { status: 'PASS' | 'FAIL'; error_count: number };
  resolver_validation: {
    status: 'PASS' | 'FAIL';
    checked_count: number;
    unresolved_count: number;
    references: ReferenceCheck[];
  };
  input_validation: {
    status: 'PASS' | 'FAIL';
    checked_count: number;
    unresolved_count: number;
    inputs: InputCheck[];
  };
  semantic_validation: {
    validator: 'PACKET_SEMANTICS_V1';
    status: 'PASS' | 'FAIL' | 'NOT_RUN' | 'NOT_APPLICABLE';
    error_count: number;
  };
  admission: 'ADMITTED' | 'REJECTED';
  refusal_code?:
    | 'SCHEMA_INVALID'
    | 'REFERENCES_UNRESOLVED'
    | 'INPUTS_UNRESOLVED'
    | 'PACKET_SEMANTICS_INVALID';
  admission_proof: { derivation: string; derivation_sha256: string };
  validated_at: string;
}

export interface Offer {
  locator: string;
  bytes: Buffer;
}

export type IdentityRefusalCode = 'UNIDENTIFIABLE' | 'UNKNOWN_CONTRACT' | 'LOCATOR_NOT_CANONICAL';

export class IntakeRefusal extends Error {
  constructor(
    readonly code: IdentityRefusalCode,
    message: string,
  ) {
    super(message);
    this.name = 'IntakeRefusal';
  }
}

export const DERIVATION = 'INTAKE_DERIVATION_V3';

let registry: SchemaRegistry | undefined;

function contractRegistry(): SchemaRegistry {
  if (registry === undefined) {
    registry = new SchemaRegistry();
    for (const file of readdirSync(SCHEMA_DIR).sort()) {
      if (!file.endsWith('.schema.json')) continue;
      registry.add(JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8')) as JsonObject);
    }
  }
  return registry;
}

export function intakeContractVersion(): string {
  return String(readSchemaFile('intake-validation.schema.json').schema.x_contract_version);
}

export function offerFromPath(repoRelativePath: string): Offer {
  return {
    locator: repoRelativePath,
    bytes: readFileSync(join(REPO_ROOT, repoRelativePath)),
  };
}

export function findReferences(document: JsonObject): Array<{ field: string; value: string }> {
  const found: Array<{ field: string; value: string }> = [];
  const walk = (node: JsonValue, pointer: string): void => {
    if (typeof node === 'string') {
      if (PINNED_REFERENCE.test(node)) found.push({ field: pointer, value: node });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${pointer}/${index}`));
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) walk(value, `${pointer}/${key}`);
    }
  };
  walk(document, '');
  return found;
}

const schemaCache = new Map<string, JsonObject>();

function schemaByFile(fileName: string): JsonObject {
  const cached = schemaCache.get(fileName);
  if (cached !== undefined) return cached;
  const { schema } = readSchemaFile(fileName);
  schemaCache.set(fileName, schema);
  return schema;
}

function pointerInto(node: JsonValue, pointer: string): JsonValue | undefined {
  let current: JsonValue | undefined = node;
  for (const segment of pointer.split('/').filter((part) => part.length > 0)) {
    if (current === null || typeof current !== 'object') return undefined;
    current = Array.isArray(current) ? current[Number(segment)] : current[segment];
  }
  return current;
}

export function declaredReferencePointers(schemaFile: string, document: JsonObject): string[] {
  const found = new Set<string>();
  const seen = new Set<string>();

  const walk = (node: JsonValue, file: string, pointer: string): void => {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return;
    const value = pointerInto(document, pointer);
    if (value === undefined) return;

    const ref = node.$ref;
    if (typeof ref === 'string') {
      const [uri = '', fragment = ''] = ref.split('#');
      const defName =
        fragment
          .split('/')
          .filter((part) => part.length > 0)
          .pop() ?? '';
      if (PINNED_REFERENCE_DEFS.has(defName)) {
        if (typeof value === 'string') found.add(pointer);
        return;
      }
      const targetFile = uri === '' ? file : uri;
      const key = `${targetFile}#${fragment}@${pointer}`;
      if (seen.has(key)) return;
      seen.add(key);
      const target = pointerInto(schemaByFile(targetFile), fragment);
      if (target !== undefined) walk(target, targetFile, pointer);
    }

    for (const branch of ['allOf', 'anyOf', 'oneOf'] as const) {
      const list = node[branch];
      if (Array.isArray(list)) for (const member of list) walk(member, file, pointer);
    }
    for (const applicator of ['then', 'else'] as const) {
      const member = node[applicator];
      if (member !== undefined) walk(member as JsonValue, file, pointer);
    }

    const properties = node.properties;
    if (properties !== null && typeof properties === 'object' && !Array.isArray(properties)) {
      for (const [key, child] of Object.entries(properties)) {
        walk(child, file, `${pointer}/${key}`);
      }
    }
    const patternProperties = node.patternProperties;
    if (
      patternProperties !== null &&
      typeof patternProperties === 'object' &&
      !Array.isArray(patternProperties) &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      for (const [pattern, child] of Object.entries(patternProperties)) {
        const matcher = new RegExp(pattern);
        for (const key of Object.keys(value)) {
          if (matcher.test(key)) walk(child, file, `${pointer}/${key}`);
        }
      }
    }
    const additional = node.additionalProperties;
    if (
      additional !== null &&
      typeof additional === 'object' &&
      !Array.isArray(additional) &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      const declared = new Set(
        properties !== null && typeof properties === 'object' && !Array.isArray(properties)
          ? Object.keys(properties)
          : [],
      );
      for (const key of Object.keys(value)) {
        if (!declared.has(key)) walk(additional, file, `${pointer}/${key}`);
      }
    }
    const items = node.items;
    if (items !== undefined && Array.isArray(value)) {
      value.forEach((_child, index) => walk(items as JsonValue, file, `${pointer}/${index}`));
    }
  };

  walk(schemaByFile(schemaFile), schemaFile, '');
  return [...found].sort();
}

function checkReference(field: string, value: JsonValue | undefined): ReferenceCheck {
  if (typeof value !== 'string') {
    return { field, kind: 'lesson', digest: '0'.repeat(64), status: 'MALFORMED' };
  }
  const shape = PINNED_REFERENCE.exec(value);
  const kind = shape?.[1] ?? '';
  const digest = shape?.[3] ?? '0'.repeat(64);
  if (shape === null || !KNOWN_KINDS.has(kind)) {
    return { field, kind: KNOWN_KINDS.has(kind) ? kind : 'lesson', digest, status: 'MALFORMED' };
  }
  try {
    return { field, kind, digest, status: resolveReference(value, kind).status };
  } catch {
    return { field, kind, digest, status: 'MISMATCHED' };
  }
}

export function checkInputs(document: JsonObject): InputCheck[] {
  const rows = document.input_hashes;
  if (!Array.isArray(rows)) return [];
  return rows.map((value, index) => {
    const row = (
      value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
    ) as JsonObject;
    const input = typeof row.input === 'string' ? row.input : '';
    const path = typeof row.path === 'string' ? row.path : '';
    const check: InputCheck = {
      field: `/input_hashes/${index}`,
      input,
      path,
      fileStatus: 'MISSING',
      contentStatus: 'MISSING',
    };
    if (path === '' || !existsSync(join(REPO_ROOT, path))) return check;
    const text = readFileSync(join(REPO_ROOT, path), 'utf8');
    const file = createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
    let content = file;
    if (path.endsWith('.json')) {
      try {
        content = createHash('sha256')
          .update(Buffer.from(canonicalJson(JSON.parse(text)), 'utf8'))
          .digest('hex');
      } catch {
        content = file;
      }
    }
    return {
      ...check,
      fileStatus: row.file_sha256 === file ? 'RESOLVED' : 'MISMATCHED',
      contentStatus: row.content_sha256 === content ? 'RESOLVED' : 'MISMATCHED',
    };
  });
}

function derivationInput(record: Omit<IntakeRecord, 'admission_proof' | 'validated_at'>): string {
  return JSON.stringify([
    DERIVATION,
    record.contract_id,
    record.contract_version,
    record.document.kind,
    record.document.ref,
    record.document.sha256,
    record.document.contract_id,
    record.document.contract_version,
    record.document.schema_file,
    record.document.schema_locator,
    record.document.schema_sha256,
    record.schema_validation.status,
    record.schema_validation.error_count,
    record.resolver_validation.status,
    record.resolver_validation.checked_count,
    record.resolver_validation.unresolved_count,
    record.resolver_validation.references.map((row) => [
      row.field,
      row.kind,
      row.digest,
      row.status,
    ]),
    record.input_validation.status,
    record.input_validation.checked_count,
    record.input_validation.unresolved_count,
    record.input_validation.inputs.map((row) => [
      row.field,
      row.input,
      row.path,
      row.fileStatus,
      row.contentStatus,
    ]),
    record.semantic_validation.validator,
    record.semantic_validation.status,
    record.semantic_validation.error_count,
    record.admission,
    record.refusal_code ?? null,
  ]);
}

function identify(offer: Offer): {
  document: JsonObject;
  contract: RegisteredContract;
  ref: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(offer.bytes.toString('utf8'));
  } catch (error) {
    throw new IntakeRefusal('UNIDENTIFIABLE', `offered bytes are not JSON: ${String(error)}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new IntakeRefusal('UNIDENTIFIABLE', 'a lesson-factory document is a JSON object');
  }
  const document = parsed as JsonObject;
  const contractId = document.contract_id;
  if (typeof contractId !== 'string') {
    throw new IntakeRefusal(
      'UNIDENTIFIABLE',
      'the offered document declares no contract_id, so there is no contract to apply to it',
    );
  }
  const registered = BY_CONTRACT_ID.get(contractId);
  if (registered === undefined) {
    throw new IntakeRefusal(
      'UNKNOWN_CONTRACT',
      `no contract "${contractId}" with a canonical reference kind is shipped by this freeze; a document with no canonical location cannot be bound to an admission`,
    );
  }

  const contract: RegisteredContract =
    registered.documentKind === 'packet' && document.packet_surface === 'QUARANTINE'
      ? (BY_DOCUMENT_KIND.get('quarantine-packet') ?? registered)
      : registered;

  const sha256 = createHash('sha256').update(offer.bytes).digest('hex');
  const ref = `${contract.documentKind}:${offer.locator}#sha256:${sha256}`;
  try {
    parseReference(ref, contract.documentKind);
  } catch (error) {
    throw new IntakeRefusal(
      'LOCATOR_NOT_CANONICAL',
      `${offer.locator} is not a canonical locator for a ${contract.documentKind} document: ${String(error)}`,
    );
  }
  return { document, contract, ref };
}

export function admitIntake(request: Offer & { now?: string }): IntakeRecord {
  const { document, contract, ref } = identify(request);
  const sha256 = createHash('sha256').update(request.bytes).digest('hex');

  const schemaErrors = validateAgainst(
    contractRegistry(),
    `${CONTRACT_BASE}${contract.schemaFile}`,
    document,
  );

  const pointers = new Set<string>([
    ...findReferences(document).map(({ field }) => field),
    ...declaredReferencePointers(contract.schemaFile, document),
  ]);
  const references = [...pointers]
    .sort()
    .map((pointer) => checkReference(pointer, pointerInto(document, pointer)));
  const unresolved = references.filter(
    (reference) => reference.status !== 'RESOLVED' && reference.status !== 'IDENTITY_ONLY',
  );

  const inputs = checkInputs(document);
  const unresolvedInputs = inputs.filter(
    (input) => input.fileStatus !== 'RESOLVED' || input.contentStatus !== 'RESOLVED',
  );

  const schemaPassed = schemaErrors.length === 0;
  const resolverPassed = unresolved.length === 0;
  const inputsPassed = unresolvedInputs.length === 0;
  const packetDocument =
    contract.documentKind === 'packet' || contract.documentKind === 'quarantine-packet';
  const semanticProblems =
    packetDocument && schemaPassed && resolverPassed && inputsPassed
      ? packetSemanticErrors(document)
      : [];
  const semanticValidation = {
    validator: 'PACKET_SEMANTICS_V1' as const,
    status: (!packetDocument
      ? 'NOT_APPLICABLE'
      : !schemaPassed || !resolverPassed || !inputsPassed
        ? 'NOT_RUN'
        : semanticProblems.length === 0
          ? 'PASS'
          : 'FAIL') as 'PASS' | 'FAIL' | 'NOT_RUN' | 'NOT_APPLICABLE',
    error_count: semanticProblems.length,
  };
  const semanticsPassed =
    semanticValidation.status === 'PASS' || semanticValidation.status === 'NOT_APPLICABLE';
  const admission =
    schemaPassed && resolverPassed && inputsPassed && semanticsPassed ? 'ADMITTED' : 'REJECTED';

  const derived = {
    contract_id: 'lesson-factory.intake-validation' as const,
    contract_version: intakeContractVersion(),
    document: {
      kind: contract.documentKind,
      ref,
      sha256,
      contract_id: contract.contractId,
      contract_version: contract.contractVersion,
      schema_file: contract.schemaFile,
      schema_locator: contract.schemaLocator,
      schema_sha256: contract.schemaSha256,
    },
    schema_validation: {
      status: (schemaPassed ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL',
      error_count: schemaErrors.length,
    },
    resolver_validation: {
      status: (resolverPassed ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL',
      checked_count: references.length,
      unresolved_count: unresolved.length,
      references,
    },
    input_validation: {
      status: (inputsPassed ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL',
      checked_count: inputs.length,
      unresolved_count: unresolvedInputs.length,
      inputs,
    },
    semantic_validation: semanticValidation,
    admission: admission as 'ADMITTED' | 'REJECTED',
    ...(admission === 'REJECTED'
      ? {
          refusal_code: (!schemaPassed
            ? 'SCHEMA_INVALID'
            : !resolverPassed
              ? 'REFERENCES_UNRESOLVED'
              : !inputsPassed
                ? 'INPUTS_UNRESOLVED'
                : 'PACKET_SEMANTICS_INVALID') as
            | 'REFERENCES_UNRESOLVED'
            | 'SCHEMA_INVALID'
            | 'INPUTS_UNRESOLVED'
            | 'PACKET_SEMANTICS_INVALID',
        }
      : {}),
  };

  return {
    ...derived,
    admission_proof: {
      derivation: DERIVATION,
      derivation_sha256: createHash('sha256')
        .update(derivationInput(derived), 'utf8')
        .digest('hex'),
    },
    validated_at: request.now ?? new Date().toISOString(),
  };
}

export function verifyIntake(record: IntakeRecord, offer: Offer): string[] {
  let recomputed: IntakeRecord;
  try {
    recomputed = admitIntake({ ...offer, now: record.validated_at });
  } catch (error) {
    return [`the offered bytes cannot be admitted at all: ${String(error)}`];
  }

  const problems: string[] = [];
  const compare = (label: string, expected: JsonValue, actual: JsonValue): void => {
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      problems.push(
        `${label}: record says ${JSON.stringify(actual)}, bytes give ${JSON.stringify(expected)}`,
      );
    }
  };

  compare('contract_version', recomputed.contract_version, record.contract_version);
  for (const field of Object.keys(recomputed.document) as Array<keyof IntakeDocumentIdentity>) {
    compare(`document.${field}`, recomputed.document[field], record.document[field]);
  }
  compare(
    'schema_validation',
    recomputed.schema_validation as unknown as JsonValue,
    record.schema_validation as unknown as JsonValue,
  );
  compare(
    'resolver_validation',
    recomputed.resolver_validation as unknown as JsonValue,
    record.resolver_validation as unknown as JsonValue,
  );
  compare(
    'input_validation',
    recomputed.input_validation as unknown as JsonValue,
    record.input_validation as unknown as JsonValue,
  );
  compare(
    'semantic_validation',
    recomputed.semantic_validation as unknown as JsonValue,
    record.semantic_validation as unknown as JsonValue,
  );
  compare('admission', recomputed.admission, record.admission);
  compare('refusal_code', recomputed.refusal_code ?? null, record.refusal_code ?? null);
  compare(
    'admission_proof',
    recomputed.admission_proof as unknown as JsonValue,
    record.admission_proof as unknown as JsonValue,
  );
  return problems;
}
