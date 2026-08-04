import { describe, expect, it } from 'vitest';
import {
  auditSchema,
  SchemaRegistry,
  SUPPORTED_KEYWORDS,
  validateAgainst,
  withMutation,
  type JsonObject,
} from './json-schema-subset';

/**
 * The lesson-factory contract tests are only as trustworthy as the checker that
 * runs them, and the classic failure of a hand-rolled validator is that it passes
 * a document by ignoring the keyword that was supposed to reject it. These cases
 * prove the checker rejects every construct the deadline contracts depend on.
 */

const SHARED_ID = 'https://mcat-mastery.internal/test/shared.schema.json';
const DOCUMENT_ID = 'https://mcat-mastery.internal/test/document.schema.json';

const shared: JsonObject = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: SHARED_ID,
  $defs: {
    Sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
  },
};

const document: JsonObject = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: DOCUMENT_ID,
  type: 'object',
  additionalProperties: false,
  required: ['status', 'content_sha256', 'refs', 'diagnostics'],
  properties: {
    status: { enum: ['PRESENT', 'BLOCKED'] },
    content_sha256: { $ref: 'shared.schema.json#/$defs/Sha256' },
    blocker_ref: { type: ['string', 'null'] },
    refs: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3, uniqueItems: true },
    applicable: { type: 'array', items: { enum: ['STANDARD', 'CONCISE'] }, uniqueItems: true },
    diagnostics: {
      type: 'object',
      additionalProperties: false,
      propertyNames: { pattern: '^diag_[a-z_]+$' },
      properties: { diag_note: { type: 'string' } },
    },
    verdict: false,
  },
  allOf: [
    {
      if: { properties: { status: { const: 'BLOCKED' } }, required: ['status'] },
      then: { required: ['blocker_ref'], properties: { blocker_ref: { type: 'string' } } },
      else: { properties: { blocker_ref: { const: null } } },
    },
    {
      // The membership biconditional the route-state invariants are built from.
      if: { properties: { status: { const: 'PRESENT' } }, required: ['status'] },
      then: { properties: { applicable: { type: 'array', contains: { const: 'STANDARD' } } } },
      else: {
        properties: {
          applicable: { type: 'array', not: { contains: { const: 'STANDARD' } } },
        },
      },
    },
  ],
};

const valid: JsonObject = {
  status: 'BLOCKED',
  content_sha256: 'a'.repeat(64),
  blocker_ref: 'blocker:missing-receipt',
  refs: ['one'],
  applicable: ['CONCISE'],
  diagnostics: { diag_note: 'author commentary' },
};

const registry = new SchemaRegistry();
registry.add(shared);
registry.add(document);
const check = (data: JsonObject): string[] => validateAgainst(registry, DOCUMENT_ID, data);

describe('contract checker: accepts the control document', () => {
  it('reports no error for a conforming document', () => {
    expect(check(valid)).toEqual([]);
  });
});

describe('contract checker: rejects each construct the contracts rely on', () => {
  it('rejects an unlisted property (closed contracts)', () => {
    expect(check({ ...valid, route_verdict: 'PASS' }).join('\n')).toMatch(/route_verdict/);
  });

  it('rejects a missing required property', () => {
    expect(check(withMutation(valid, '/content_sha256', undefined)).join('\n')).toMatch(
      /required property "content_sha256" is missing/,
    );
  });

  it('rejects a null where an identity hash is required', () => {
    expect(check(withMutation(valid, '/content_sha256', null)).join('\n')).toMatch(
      /expected type string but found null/,
    );
  });

  it('rejects a malformed hash: wrong length and wrong case', () => {
    expect(check(withMutation(valid, '/content_sha256', 'a'.repeat(63))).join('\n')).toMatch(
      /does not match pattern/,
    );
    expect(check(withMutation(valid, '/content_sha256', 'A'.repeat(64))).join('\n')).toMatch(
      /does not match pattern/,
    );
  });

  it('rejects a value outside an enum and a value that violates a const', () => {
    expect(check(withMutation(valid, '/status', 'PASS')).join('\n')).toMatch(/is not one of/);
    const passing = withMutation(valid, '/status', 'PRESENT');
    expect(check(passing).join('\n')).toMatch(/expected const null/);
  });

  it('applies the `if`/`then` branch and the `else` branch', () => {
    expect(check(withMutation(valid, '/blocker_ref', null)).join('\n')).toMatch(
      /blocker_ref: expected type string but found null/,
    );
    const present = withMutation(
      withMutation(withMutation(valid, '/status', 'PRESENT'), '/blocker_ref', null),
      '/applicable',
      ['STANDARD'],
    );
    expect(check(present)).toEqual([]);
  });

  it('enforces array bounds and uniqueness', () => {
    expect(check(withMutation(valid, '/refs', [])).join('\n')).toMatch(/fewer than minItems 1/);
    expect(check(withMutation(valid, '/refs', ['a', 'b', 'c', 'd'])).join('\n')).toMatch(
      /more than maxItems 3/,
    );
    expect(check(withMutation(valid, '/refs', ['a', 'a'])).join('\n')).toMatch(/duplicate item/);
  });

  it('enforces `contains` in both directions, so a membership biconditional holds', () => {
    // status PRESENT requires STANDARD present; status BLOCKED requires it absent.
    const present = withMutation(withMutation(valid, '/status', 'PRESENT'), '/blocker_ref', null);
    expect(check(present).join('\n')).toMatch(/no array item matches/);
    expect(check(withMutation(present, '/applicable', ['STANDARD']))).toEqual([]);
    expect(check(withMutation(valid, '/applicable', ['STANDARD'])).join('\n')).toMatch(
      /forbidden `not` schema/,
    );
  });

  it('enforces a namespaced property-name pattern', () => {
    expect(
      check(withMutation(valid, '/diagnostics', { evaluation_verdict: 'PASS' })).join('\n'),
    ).toMatch(/evaluation_verdict/);
  });

  it('rejects any value under a `false` subschema', () => {
    expect(check({ ...valid, verdict: 'PASS' }).join('\n')).toMatch(/no value is valid here/);
  });

  it('resolves cross-document `$ref` and raises on an unresolvable one', () => {
    const broken = new SchemaRegistry();
    broken.add({ $id: DOCUMENT_ID, $ref: 'missing.schema.json#/$defs/Sha256' });
    expect(() => validateAgainst(broken, DOCUMENT_ID, 'x')).toThrow(/unresolvable \$ref/);
  });
});

describe('contract checker: static audit', () => {
  it('accepts the control schema and reports its keywords', () => {
    const audit = auditSchema(document);
    expect(audit.problems).toEqual([]);
    expect([...audit.keywords].every((keyword) => SUPPORTED_KEYWORDS.has(keyword))).toBe(true);
  });

  it('flags a keyword the checker does not implement, so it cannot be ignored into a pass', () => {
    const audit = auditSchema({ ...document, patternProperties: { '^x': { type: 'string' } } });
    expect(audit.problems.join('\n')).toMatch(/"patternProperties" is not implemented/);
  });

  it('flags an object definition that is left open', () => {
    const open = JSON.parse(JSON.stringify(document)) as JsonObject;
    const properties = open.properties as JsonObject;
    properties.diagnostics = { type: 'object', properties: { diag_note: { type: 'string' } } };
    expect(auditSchema(open).problems.join('\n')).toMatch(
      /must declare "additionalProperties": false/,
    );
  });

  it('flags a `then` branch that can never fire', () => {
    expect(auditSchema({ then: { required: ['x'] } }).problems.join('\n')).toMatch(/never fires/);
  });
});
