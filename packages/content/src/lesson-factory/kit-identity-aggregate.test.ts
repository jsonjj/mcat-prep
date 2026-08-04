import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { deriveKitIdentityAggregate } from './kit-identity-aggregate';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('kit schema and template identity aggregates', () => {
  it('binds nonempty root-relative schema and template identities in sorted order', () => {
    const identities = [
      ['template/v3-les-000000/lesson-script.json', 'c'.repeat(64)],
      ['README.md', 'a'.repeat(64)],
      ['schemas/z.schema.json', 'd'.repeat(64)],
      ['schemas/a.schema.json', 'b'.repeat(64)],
    ] as const;

    expect(deriveKitIdentityAggregate(identities, 'SCHEMA')).toEqual({
      identities: [
        ['schemas/a.schema.json', 'b'.repeat(64)],
        ['schemas/z.schema.json', 'd'.repeat(64)],
      ],
      sha256: sha256(
        JSON.stringify([
          ['schemas/a.schema.json', 'b'.repeat(64)],
          ['schemas/z.schema.json', 'd'.repeat(64)],
        ]),
      ),
    });
    expect(deriveKitIdentityAggregate(identities, 'TEMPLATE').identities).toEqual([
      ['template/v3-les-000000/lesson-script.json', 'c'.repeat(64)],
    ]);
  });

  it.each(['SCHEMA', 'TEMPLATE'] as const)(
    'fails closed when the %s identity set is empty',
    (kind) => {
      expect(() => deriveKitIdentityAggregate([['README.md', 'a'.repeat(64)]], kind)).toThrow(
        `${kind}_IDENTITY_SET_EMPTY`,
      );
    },
  );

  it('uses deterministic code-unit ordering instead of locale-sensitive ordering', () => {
    const identities = [
      ['schemas/a.schema.json', 'a'.repeat(64)],
      ['schemas/Z.schema.json', 'b'.repeat(64)],
    ] as const;

    expect(deriveKitIdentityAggregate(identities, 'SCHEMA').identities).toEqual([
      ['schemas/Z.schema.json', 'b'.repeat(64)],
      ['schemas/a.schema.json', 'a'.repeat(64)],
    ]);
  });

  it.each([
    'schemas//alias.json',
    'schemas/./alias.json',
    './schemas/alias.json',
    '/schemas/alias.json',
    'schemas/alias.json/',
    'schemas\\alias.json',
    'schemas/../alias.json',
  ])('rejects noncanonical identity path %s', (path) => {
    expect(() =>
      deriveKitIdentityAggregate(
        [
          ['schemas/valid.json', 'a'.repeat(64)],
          [path, 'b'.repeat(64)],
        ],
        'SCHEMA',
      ),
    ).toThrow('SCHEMA_IDENTITY_SET_INVALID');
  });

  it('rejects duplicate identity paths before aggregate derivation', () => {
    expect(() =>
      deriveKitIdentityAggregate(
        [
          ['schemas/duplicate.json', 'a'.repeat(64)],
          ['schemas/duplicate.json', 'a'.repeat(64)],
        ],
        'SCHEMA',
      ),
    ).toThrow('SCHEMA_IDENTITY_SET_INVALID');
  });

  it.each([
    'schemas/cafe\u0301.json',
    'schemas/CON.json',
    'schemas/aux.fixture.json',
    'schemas/trailing-dot./value.json',
    'schemas/trailing-space /value.json',
    'schemas/question?.json',
  ])('rejects kit-contract-incompatible identity path %s', (path) => {
    expect(() =>
      deriveKitIdentityAggregate(
        [
          ['schemas/valid.json', 'a'.repeat(64)],
          [path, 'b'.repeat(64)],
        ],
        'SCHEMA',
      ),
    ).toThrow('SCHEMA_IDENTITY_SET_INVALID');
  });

  it('rejects case-fold path collisions', () => {
    expect(() =>
      deriveKitIdentityAggregate(
        [
          ['schemas/Case.json', 'a'.repeat(64)],
          ['schemas/case.json', 'b'.repeat(64)],
        ],
        'SCHEMA',
      ),
    ).toThrow('SCHEMA_IDENTITY_SET_INVALID');
  });

  it('rejects identity paths that do not round-trip through UTF-8', () => {
    expect(() =>
      deriveKitIdentityAggregate(
        [
          ['schemas/valid.json', 'a'.repeat(64)],
          ['schemas/lone-\ud800.json', 'b'.repeat(64)],
        ],
        'SCHEMA',
      ),
    ).toThrow('SCHEMA_IDENTITY_SET_INVALID');
  });
});
