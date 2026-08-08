import { beforeAll, describe, expect, it } from 'vitest';
import { validateAgainst } from './lesson-factory/json-schema-subset';
import type { SchemaRegistry } from './lesson-factory/json-schema-subset';
import {
  FIXTURE_CONTROLS,
  loadFixtureEnvelope,
  loadRegistry,
  PROFILE_ARTIFACTS,
  schemaId,
} from './lesson-factory/contract-registry';
import {
  allNegativeCases,
  loadControl,
  mutatedDocument,
  type NegativeCase,
} from './lesson-factory/negative-cases';

/**
 * WP-01 negative contract cases, run through the subset checker.
 *
 * The table lives in `lesson-factory/negative-cases.ts` so that
 * `lesson-factory-ajv-conformance.test.ts` can run the identical rows through Ajv and
 * assert parity on every one. Each row is exactly one mutation of a control document
 * that validates clean, so a rejection can only be caused by that mutation.
 *
 * Together the rows prove the deadline contract fails closed: a screened candidate
 * cannot be dressed up as a pass, a missing evidence class cannot be normalised, a route
 * scope cannot disagree with itself, an identity cannot be reconstructed from nothing,
 * no learner-safe or log field admits prose, and a synthetic control cannot pass as a
 * production instance.
 */

let registry: SchemaRegistry;

beforeAll(() => {
  registry = loadRegistry();
});

const errorsFor = (schemaFile: string, document: unknown): string[] =>
  validateAgainst(registry, schemaId(schemaFile), document as never);

describe('fail-closed: every control document validates clean', () => {
  const controls: Array<[string, string, 'artifact' | 'fixture']> = [
    ...Object.entries(PROFILE_ARTIFACTS).map(
      ([document, schema]) => [document, schema, 'artifact'] as [string, string, 'artifact'],
    ),
    ...Object.entries(FIXTURE_CONTROLS).map(
      ([document, schema]) => [document, schema, 'fixture'] as [string, string, 'fixture'],
    ),
  ];

  it.each(controls)('%s validates against %s', (document, schema, source) => {
    expect(errorsFor(schema, loadControl(source, document))).toEqual([]);
  });
});

const byGroup = (): Map<string, NegativeCase[]> => {
  const groups = new Map<string, NegativeCase[]>();
  for (const testCase of allNegativeCases()) {
    const existing = groups.get(testCase.group);
    if (existing === undefined) groups.set(testCase.group, [testCase]);
    else existing.push(testCase);
  }
  return groups;
};

for (const [group, cases] of byGroup()) {
  describe(`fail-closed: ${group}`, () => {
    it.each(cases)('rejects $name', (testCase: NegativeCase) => {
      const errors = errorsFor(testCase.schemaFile, mutatedDocument(testCase));
      expect(
        errors,
        `${testCase.schemaFile} accepted a document whose only change is ${testCase.name}`,
      ).not.toEqual([]);
      expect(
        errors.join('\n'),
        `${testCase.name} was rejected, but not for the reason the case is about`,
      ).toMatch(testCase.expect);
    });
  });
}

describe('fail-closed: the table itself is honest', () => {
  it('names every case uniquely, so a silently duplicated row cannot inflate coverage', () => {
    const names = allNegativeCases().map((testCase) => testCase.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('covers every shipped contract that has a control', () => {
    const covered = new Set(allNegativeCases().map((testCase) => testCase.schemaFile));
    for (const schema of [
      ...Object.values(PROFILE_ARTIFACTS),
      ...Object.values(FIXTURE_CONTROLS),
    ]) {
      expect(covered, `${schema} has no negative case`).toContain(schema);
    }
  });
});

describe('fail-closed: a synthetic control cannot pass as a production instance', () => {
  it.each(Object.entries(FIXTURE_CONTROLS))(
    '%s is rejected while still wearing its test-only envelope',
    (fixture, schema) => {
      const envelope = loadFixtureEnvelope(fixture);
      expect(
        errorsFor(schema, envelope).join('\n'),
        `${fixture} validated as a production ${schema}; a control that is indistinguishable from a real record is a liability`,
      ).toMatch(/\$test_fixture/);
    },
  );

  it('marks every fixture as synthetic and not for production', () => {
    for (const fixture of Object.keys(FIXTURE_CONTROLS)) {
      const marker = loadFixtureEnvelope(fixture).$test_fixture as Record<string, unknown>;
      expect(marker.synthetic, `${fixture}`).toBe(true);
      expect(marker.not_for_production, `${fixture}`).toBe(true);
    }
  });
});
