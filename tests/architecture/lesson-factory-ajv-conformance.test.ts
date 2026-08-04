import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateAgainst, type JsonValue } from './lesson-factory/json-schema-subset';
import type { SchemaRegistry } from './lesson-factory/json-schema-subset';
import {
  FIXTURE_CONTROLS,
  loadFixtureEnvelope,
  loadRegistry,
  loadSchema,
  PROFILE_ARTIFACTS,
  SCHEMA_FILES,
  schemaId,
} from './lesson-factory/contract-registry';
import {
  allNegativeCases,
  loadControl,
  mutatedDocument,
  type NegativeCase,
} from './lesson-factory/negative-cases';

/**
 * WP-01 conforming-validator conformance.
 *
 * The contracts are proved elsewhere against a hand-rolled subset checker, which is
 * auditable but is not a JSON Schema implementation. This suite compiles the same
 * contracts with Ajv 2020 in full strict mode and re-runs the *entire* negative-case
 * table through it, so three claims are evidenced rather than assumed:
 *
 *  1. every contract is legal Draft 2020-12 that a conforming validator accepts, with
 *     no strict-mode escape hatch enabled;
 *  2. every shipped artifact and control fixture validates under that validator, and
 *     every test-only envelope is rejected by it;
 *  3. the subset checker and Ajv agree on accept and reject for every row in the table,
 *     not for a sample of it — a sampled cross-check only proves they agree about the
 *     sample.
 *
 * The subset checker stays: it enforces contract discipline Ajv does not care about (a
 * keyword it cannot evaluate is a failure, not an ignored annotation).
 */

let ajv: Ajv2020;
let registry: SchemaRegistry;

beforeAll(() => {
  // strict: true is deliberate. It rejects an unknown keyword, a mistyped branch, and a
  // rule that can never apply, which is the class of mistake that makes a schema look
  // stricter than it is.
  ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: false });
  // The two `x_`-prefixed annotations carry contract identity and assert nothing;
  // declaring them keeps strict mode on for everything else.
  ajv.addVocabulary(['x_contract_id', 'x_contract_version']);
  for (const fileName of SCHEMA_FILES) {
    ajv.addSchema(loadSchema(fileName) as object);
  }
  registry = loadRegistry();
});

const validatorFor = (schemaFile: string): ValidateFunction => {
  const validate = ajv.getSchema(schemaId(schemaFile));
  if (validate === undefined) throw new Error(`Ajv did not compile ${schemaFile}`);
  return validate;
};

const ajvErrors = (schemaFile: string, document: JsonValue): string => {
  const validate = validatorFor(schemaFile);
  return validate(document) ? '' : ajv.errorsText(validate.errors, { separator: '\n' });
};

const CONTROLS: Array<[string, string, () => JsonValue]> = [
  ...Object.entries(PROFILE_ARTIFACTS).map(
    ([artifact, schema]) =>
      [artifact, schema, () => loadControl('artifact', artifact)] as [
        string,
        string,
        () => JsonValue,
      ],
  ),
  ...Object.entries(FIXTURE_CONTROLS).map(
    ([fixture, schema]) =>
      [fixture, schema, () => loadControl('fixture', fixture)] as [string, string, () => JsonValue],
  ),
];

describe('lesson-factory contracts under a conforming Draft 2020-12 validator', () => {
  it('compiles every contract with Ajv 2020 in strict mode, with no relaxation', () => {
    for (const fileName of SCHEMA_FILES) {
      expect(
        () => validatorFor(fileName),
        `${fileName} must compile under Ajv strict`,
      ).not.toThrow();
    }
    expect(SCHEMA_FILES.length).toBeGreaterThan(0);
  });

  it.each(CONTROLS)('accepts %s', (_name, schemaFile, load) => {
    expect(ajvErrors(schemaFile, load())).toBe('');
  });

  it.each(Object.entries(FIXTURE_CONTROLS))(
    'rejects the test-only envelope around %s',
    (fixture, schemaFile) => {
      expect(ajvErrors(schemaFile, loadFixtureEnvelope(fixture) as JsonValue)).not.toBe('');
    },
  );
});

describe('the subset checker and Ajv agree on every negative case', () => {
  const cases = allNegativeCases();

  it('runs the whole table, not a sample of it', () => {
    expect(cases.length).toBeGreaterThan(200);
  });

  it.each(cases)('$name', (testCase: NegativeCase) => {
    const mutated = mutatedDocument(testCase);
    const subset = validateAgainst(registry, schemaId(testCase.schemaFile), mutated);
    const ajvText = ajvErrors(testCase.schemaFile, mutated);

    expect(subset, `the subset checker accepted ${testCase.name}`).not.toEqual([]);
    expect(ajvText, `Ajv accepted ${testCase.name}`).not.toBe('');
  });

  it('agrees with the subset checker on every control, too', () => {
    for (const [name, schemaFile, load] of CONTROLS) {
      expect(validateAgainst(registry, schemaId(schemaFile), load()), `${name}: subset`).toEqual(
        [],
      );
      expect(ajvErrors(schemaFile, load()), `${name}: Ajv`).toBe('');
    }
  });
});
