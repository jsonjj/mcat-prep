import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
} from './reference-model.js';

/**
 * Intake: the second half of validation, and the thing the verdict is about.
 *
 * A JSON Schema validator answers one question — does this document have the shape the
 * contract describes. It cannot answer the other one, because a schema cannot read a
 * second file: do the references inside the document point at bytes that exist and hash
 * to what they claim. A consumer that runs Ajv and stops has verified a shape and
 * learned nothing about the freeze the document claims to belong to.
 *
 * The defect this module was rewritten to close is subtler and worse. The first version
 * took the document kind and the schema file from its caller and returned a verdict that
 * named neither the bytes it read nor the version it applied. Such a record is true of a
 * *category*: it fits every profile ever written, it stays "ADMITTED" after the profile
 * is edited, and anyone could write one by hand. So identity is now derived here and
 * nowhere else — the caller offers bytes and a canonical locator, and the contract, the
 * contract version, the schema, and the kind all come from the document itself and from
 * the registry built out of the shipped contracts. The record names the exact bytes, and
 * `verifyIntake` recomputes the whole derivation from those bytes: a record that does not
 * survive that recomputation is not an admission of anything.
 *
 * This module imports no test framework and reads only shipped contract files, so a
 * runner can consume it as it stands.
 */

const SCHEMA_DIR = join(REPO_ROOT, 'content/lesson-factory/schemas');
const SCHEMA_DIR_REL = 'content/lesson-factory/schemas';
const CONTRACT_BASE = 'https://mcat-mastery.internal/lesson-factory/schemas/v1/';

/**
 * The reference kinds whose targets are written while the factory runs. These are
 * exactly the references a schema validator cannot check, because at the moment the
 * document is written the target may not exist yet, and at the moment it is read the
 * bytes may have changed.
 */
export const DYNAMIC_REFERENCE_KINDS: readonly string[] = REFERENCE_KINDS.filter(
  (kind) => kind.resolution.strategy === 'DERIVED_PATH',
).map((kind) => kind.kind);

const KNOWN_KINDS = new Set(REFERENCE_KINDS.map((kind) => kind.kind));
const PINNED_REFERENCE = /^([a-z][a-z0-9-]*):(.+)#sha256:([0-9a-f]{64})$/;

/** The `$defs` names whose values are pinned references, for contract-driven discovery. */
const PINNED_REFERENCE_DEFS = new Set([
  ...REFERENCE_KINDS.map((kind) => schemaDefNameFor(kind.kind)),
  'FrozenReleasePolicyRef',
]);

/**
 * Which reference kind names documents of which contract.
 *
 * This is the closed mapping the intake contract carries as a `oneOf`, and
 * `lesson-factory-intake.test.ts` asserts the two are the same registry. It covers every
 * document the factory persists and hands on. The three contracts absent from it are
 * absent for three different reasons, each recorded in the profile's `intake_contract`:
 * the shared vocabulary defines types and has no instances, the intake record is what
 * this module produces rather than something offered to it, and a runner log record is
 * one emitted line bounded by the profile's log boundary rather than an artifact anybody
 * persists and hands on.
 */
const KIND_BY_SCHEMA_FILE: ReadonlyArray<readonly [string, string]> = [
  ['profile', 'deadline-profile.schema.json'],
  ['policy', 'release-policy.schema.json'],
  ['lifecycle', 'lifecycle-nonclaims.schema.json'],
  ['receipt', 'owner-route-policy-receipt.schema.json'],
  ['assignment', 'assignment-manifest.schema.json'],
  ['packet', 'task-source-packet.schema.json'],
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

/**
 * The trusted registry: contract id, version, and contract bytes read from the shipped
 * schemas rather than restated here, so the mapping cannot drift from what it maps.
 */
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

const BY_CONTRACT_ID = new Map(INTAKE_REGISTRY.map((entry) => [entry.contractId, entry]));

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
  admission: 'ADMITTED' | 'REJECTED';
  refusal_code?: 'SCHEMA_INVALID' | 'REFERENCES_UNRESOLVED';
  admission_proof: { derivation: string; derivation_sha256: string };
  validated_at: string;
}

/**
 * What a caller may offer: bytes, and the canonical locator they are claimed to occupy.
 * There is deliberately nothing else. Everything a record asserts about what the bytes
 * *are* is derived from them.
 */
export interface Offer {
  locator: string;
  bytes: Buffer;
}

export type IdentityRefusalCode =
  /** The bytes are not a JSON object, or carry no contract id. */
  | 'UNIDENTIFIABLE'
  /** The contract id is not one this freeze ships, or has no canonical reference kind. */
  | 'UNKNOWN_CONTRACT'
  /** The locator is not a canonical location for documents of that contract. */
  | 'LOCATOR_NOT_CANONICAL';

/**
 * Thrown when the offered bytes cannot be bound to a document at all. No record is
 * produced, because a record is a statement about a document and there is not one here.
 */
export class IntakeRefusal extends Error {
  constructor(
    readonly code: IdentityRefusalCode,
    message: string,
  ) {
    super(message);
    this.name = 'IntakeRefusal';
  }
}

export const DERIVATION = 'INTAKE_DERIVATION_V2';

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

/** The version of the intake contract this implementation writes. */
export function intakeContractVersion(): string {
  return String(readSchemaFile('intake-validation.schema.json').schema.x_contract_version);
}

/** Read a document from its canonical repository path, bytes exactly as they are on disk. */
export function offerFromPath(repoRelativePath: string): Offer {
  return {
    locator: repoRelativePath,
    bytes: readFileSync(join(REPO_ROOT, repoRelativePath)),
  };
}

/**
 * Every pinned reference in a document, with the field it was found at. Discovery is by
 * shape as well as by contract: a field list is a list of the references somebody
 * remembered, and the one that matters is the one added last.
 */
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

/**
 * The reference-bearing fields the *contract* declares, materialised against one
 * document.
 *
 * Shape discovery finds what looks like a reference; this finds what the contract says
 * must be one. The two together are why a caller cannot report zero references for a
 * document that has them: a field the contract types as a reference is checked whether
 * or not its value still looks like one.
 */
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

/**
 * The bytes the admission proof is taken over: everything derived, in a fixed order.
 * `validated_at` is not in it — a clock reading is not part of what was checked, and
 * including it would make a record uncheckable by anyone who was not holding the clock.
 */
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
    record.admission,
    record.refusal_code ?? null,
  ]);
}

/**
 * Identify what was offered, from the offered bytes and the trusted registry alone.
 * Throws rather than returning a record: a document that cannot be identified is not a
 * document that was refused, it is bytes nobody can write a record about.
 */
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
  const contract = BY_CONTRACT_ID.get(contractId);
  if (contract === undefined) {
    throw new IntakeRefusal(
      'UNKNOWN_CONTRACT',
      `no contract "${contractId}" with a canonical reference kind is shipped by this freeze; a document with no canonical location cannot be bound to an admission`,
    );
  }

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

/**
 * Decide whether a document may be admitted, and bind the answer to the bytes it is
 * about.
 *
 * The admission is derived from both halves and cannot be asserted: a caller that has run
 * a schema validator and nothing else has no resolver result to offer, and a record
 * without one fails its own contract. Nor can the caller say what it is offering — the
 * kind, the contract, the version, and the schema all come from the document and the
 * registry, so relabelling a profile as a handoff changes which contract is applied, not
 * which one passes.
 */
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

  const schemaPassed = schemaErrors.length === 0;
  const resolverPassed = unresolved.length === 0;
  const admission = schemaPassed && resolverPassed ? 'ADMITTED' : 'REJECTED';

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
    admission: admission as 'ADMITTED' | 'REJECTED',
    ...(admission === 'REJECTED'
      ? {
          refusal_code: (schemaPassed ? 'REFERENCES_UNRESOLVED' : 'SCHEMA_INVALID') as
            | 'REFERENCES_UNRESOLVED'
            | 'SCHEMA_INVALID',
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

/**
 * Recompute an admission from the bytes it claims to be about, and report every way the
 * record disagrees with what the bytes actually produce.
 *
 * This is the authority half of intake, and it is the half a schema cannot do. A record
 * can be perfectly shaped, carry only real digests, and still describe a different
 * document, an older revision of this one, or a check nobody ran. An empty result means
 * the record is what it says it is.
 */
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
  compare('admission', recomputed.admission, record.admission);
  compare('refusal_code', recomputed.refusal_code ?? null, record.refusal_code ?? null);
  compare(
    'admission_proof',
    recomputed.admission_proof as unknown as JsonValue,
    record.admission_proof as unknown as JsonValue,
  );
  return problems;
}
