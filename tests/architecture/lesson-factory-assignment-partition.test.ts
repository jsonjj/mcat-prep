import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import {
  validateAssignmentManifest,
  validateAssignmentPartitionProof,
} from '@mcat/content/lesson-factory';
import { SchemaRegistry, validateAgainst } from './lesson-factory/json-schema-subset';
import {
  ASSIGNMENT_ARTIFACTS,
  ASSIGNMENT_SCHEMA_VERSIONS,
  loadAssignmentArtifact,
  loadFixture,
  loadSchema,
  schemaId,
} from './lesson-factory/contract-registry';

const SHARED_SCHEMA = 'shared-vocabulary.schema.json';
const ASSIGNMENT_SCHEMA = 'assignment-manifest.schema.json';
const PROOF_SCHEMA = ASSIGNMENT_ARTIFACTS['partition-proof.json'];
const shared = loadSchema(SHARED_SCHEMA);
const assignmentSchema = loadSchema(ASSIGNMENT_SCHEMA);
const proofSchema = loadSchema(PROOF_SCHEMA);
const sharedText = `${JSON.stringify(shared, null, 2)}\n`;
const assignmentSchemaText = `${JSON.stringify(assignmentSchema, null, 2)}\n`;
const proofSchemaText = `${JSON.stringify(proofSchema, null, 2)}\n`;

function strictAjv(): Ajv2020 {
  const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: false });
  ajv.addVocabulary(['x_contract_id', 'x_contract_version']);
  ajv.addSchema(shared as object);
  ajv.addSchema(assignmentSchema as object);
  ajv.addSchema(proofSchema as object);
  return ajv;
}

function subsetRegistry(): SchemaRegistry {
  const registry = new SchemaRegistry();
  registry.add(shared);
  registry.add(assignmentSchema);
  registry.add(proofSchema);
  return registry;
}

describe('WP-02 final contract parity', () => {
  it('pins and strictly compiles the allocation-proof schema at 2.0.0', () => {
    expect(proofSchema.x_contract_version).toBe(ASSIGNMENT_SCHEMA_VERSIONS[PROOF_SCHEMA]);
    expect(proofSchema.properties).toMatchObject({
      contract_version: { const: '2.0.0' },
    });
    expect(() => strictAjv().getSchema(schemaId(PROOF_SCHEMA))).not.toThrow();
  });

  it('validates the shipped allocation proof with production, subset, and strict Ajv', () => {
    const proof = loadAssignmentArtifact('partition-proof.json');
    const ajvValidate = strictAjv().getSchema(schemaId(PROOF_SCHEMA));
    if (ajvValidate === undefined) throw new Error('strict Ajv did not compile the proof schema');

    expect(validateAssignmentPartitionProof(proof, proofSchemaText, sharedText)).toEqual([]);
    expect(validateAgainst(subsetRegistry(), schemaId(PROOF_SCHEMA), proof as never)).toEqual([]);
    expect(ajvValidate(proof), JSON.stringify(ajvValidate.errors)).toBe(true);
  });

  it('keeps production allOf/not decisions in parity with the WP-01 checker and Ajv', () => {
    const control = loadFixture('assignment-manifest.json');
    const placeholder = structuredClone(control);
    const rows = placeholder.assignments as Array<Record<string, unknown>>;
    rows[0]!.task_packet_ref = 'packet:lane-01/v3-les-000101#sha256:' + '0'.repeat(64);
    const registry = subsetRegistry();
    const ajvValidate = strictAjv().getSchema(schemaId(ASSIGNMENT_SCHEMA));
    if (ajvValidate === undefined) {
      throw new Error('strict Ajv did not compile the assignment schema');
    }

    expect(validateAssignmentManifest(control, assignmentSchemaText, sharedText)).toEqual([]);
    expect(validateAgainst(registry, schemaId(ASSIGNMENT_SCHEMA), control as never)).toEqual([]);
    expect(ajvValidate(control), JSON.stringify(ajvValidate.errors)).toBe(true);

    expect(validateAssignmentManifest(placeholder, assignmentSchemaText, sharedText)).not.toEqual(
      [],
    );
    expect(
      validateAgainst(registry, schemaId(ASSIGNMENT_SCHEMA), placeholder as never),
    ).not.toEqual([]);
    expect(ajvValidate(placeholder)).toBe(false);
  });
});
