/**
 * The reference and identifier model.
 *
 * Two general types used to sit under most of the factory's public surfaces: a slug
 * identifier `^[a-z0-9][a-z0-9-]{2,63}$` and a pinned reference whose locator was
 * `[A-Za-z0-9._/@-]*`. Both are prose channels with the spaces taken out. `bundle-answer-
 * key-is-c`, `kit:official-rubric-pass#sha256:…`, and `handoff:release-approved-by-owner#
 * sha256:…` all validated, and all of them would have travelled beside a lesson.
 *
 * These tests hold the replacement in place: one grammar per naming context, one locator
 * grammar per reference kind, both mirrored between the contracts and the resolver, and a
 * single placeholder-digest rule applied to every family that embeds a hash.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  IDENTIFIER_GRAMMARS,
  PLACEHOLDER_DIGESTS,
  PLACEHOLDER_DIGEST_PATTERN,
  REFERENCE_KINDS,
  ReferenceModelError,
  canonicalRefFor,
  parseReference,
  resolveReference,
  schemaDefNameFor,
  schemaPatternFor,
  sha256OfPath,
} from './lesson-factory/reference-model.js';

const SCHEMA_DIR = join(import.meta.dirname, '..', '..', 'content', 'lesson-factory', 'schemas');

const readSchema = (name: string): Record<string, any> =>
  JSON.parse(readFileSync(join(SCHEMA_DIR, name), 'utf8')) as Record<string, any>;

const SCHEMA_FILES = readdirSync(SCHEMA_DIR).filter((name) => name.endsWith('.schema.json'));
const VOCAB = readSchema('shared-vocabulary.schema.json');
const DEFS = VOCAB['$defs'] as Record<string, any>;

/** Every `$ref` target named anywhere in the shipped contracts. */
const referencedDefNames = (): Set<string> => {
  const names = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === '$ref' && typeof value === 'string') {
        const defName = value.split('/$defs/')[1];
        if (defName !== undefined) names.add(defName);
      } else {
        walk(value);
      }
    }
  };
  for (const file of SCHEMA_FILES) walk(readSchema(file));
  return names;
};

describe('lesson factory reference model', () => {
  it('gives every reference kind its own locator grammar, and no kind a free segment', () => {
    for (const spec of REFERENCE_KINDS) {
      // A locator built only from fixed words, digits, and closed alternations has no
      // place to put a sentence. These are the constructs that would reintroduce one.
      expect(spec.locator, `${spec.kind} locator`).not.toMatch(/\[A-Za-z/);
      expect(spec.locator, `${spec.kind} locator`).not.toMatch(/[+*]/);
      expect(spec.locator, `${spec.kind} locator`).not.toMatch(/a-z\]\{[0-9]+,/);
    }
  });

  it('carries the same grammar in the contracts as in the resolver, so they cannot drift', () => {
    for (const spec of REFERENCE_KINDS) {
      const defName = schemaDefNameFor(spec.kind);
      const def = DEFS[defName];
      expect(def, `shared vocabulary is missing ${defName}`).toBeDefined();
      const pattern = def.allOf?.[0]?.pattern ?? def.pattern;
      expect(pattern, `${defName} pattern`).toBe(schemaPatternFor(spec.kind));
    }
  });

  it('publishes exactly the kinds it defines as a closed code vocabulary', () => {
    // `ReferenceKindCode` is what an intake record and a log line name a thing by. A kind
    // that exists in the resolver but not in the vocabulary is a thing no record can name;
    // one in the vocabulary but not in the resolver is a name nothing can resolve.
    expect([...(DEFS['ReferenceKindCode'].enum as string[])].sort()).toEqual(
      REFERENCE_KINDS.map((spec) => spec.kind).sort(),
    );
  });

  it('gives every naming context its own identifier grammar', () => {
    for (const [defName, pattern] of Object.entries(IDENTIFIER_GRAMMARS)) {
      const def = DEFS[defName];
      expect(def, `shared vocabulary is missing ${defName}`).toBeDefined();
      expect(def.pattern, `${defName} pattern`).toBe(pattern);
    }
  });

  it('retires the general slug identifier and the general pinned reference', () => {
    // Retired in the vocabulary, and unreferenced from every contract: leaving the
    // definition in place but unused is how the next field quietly gets one.
    expect(DEFS['CanonicalId']).toBeUndefined();
    expect(DEFS['PinnedRef']).toBeUndefined();
    const used = referencedDefNames();
    expect(used.has('CanonicalId')).toBe(false);
    expect(used.has('PinnedRef')).toBe(false);
  });

  it('states the placeholder-digest rule once and applies it to every hash-bearing type', () => {
    const rule = DEFS['NoPlaceholderDigest'];
    expect(rule?.not?.pattern).toBe(PLACEHOLDER_DIGEST_PATTERN);

    // The rule is stated in exactly one place. A second copy is a second thing to update.
    const literals = JSON.stringify(VOCAB).split('deadbeef').length - 1;
    expect(literals, 'the placeholder alternation appears more than once').toBe(1);

    const hashBearing = ['Sha256', ...REFERENCE_KINDS.map((spec) => schemaDefNameFor(spec.kind))];
    for (const defName of hashBearing) {
      const def = DEFS[defName];
      const refs = JSON.stringify(def ?? {});
      expect(refs, `${defName} does not apply the shared placeholder rule`).toContain(
        '#/$defs/NoPlaceholderDigest',
      );
    }
  });

  it('rejects a placeholder digest inside a reference, not only on its own', () => {
    for (const digest of PLACEHOLDER_DIGESTS) {
      expect(new RegExp(PLACEHOLDER_DIGEST_PATTERN).test(digest), digest).toBe(true);
      expect(() =>
        parseReference(`lesson:v3-les-000002@rev-000002#sha256:${digest}`, 'lesson'),
      ).toThrow(/placeholder digest/);
    }
  });

  it('resolves a frozen artifact to its bytes', () => {
    const outcome = resolveReference(canonicalRefFor('policy'), 'policy');
    expect(outcome.status).toBe('RESOLVED');
    if (outcome.status !== 'RESOLVED') throw new Error('unreachable');
    expect(outcome.path).toBe('content/lesson-factory/deadline-profile/release-policy.json');
    expect(outcome.digest).toBe(sha256OfPath(outcome.path));
  });

  it('separates "not produced yet" from "not valid", so a runner can tell them apart', () => {
    const digest = sha256OfPath('key-docs/lesson-quality-rubric.md');
    const outcome = resolveReference(`packet:lane-01/v3-les-000002#sha256:${digest}`, 'packet');
    expect(outcome.status).toBe('NOT_YET_PRODUCED');
    if (outcome.status !== 'NOT_YET_PRODUCED') throw new Error('unreachable');
    expect(outcome.expectedPath).toBe(
      '.tmp/lesson-factory/lane-01/v3-les-000002/task-source-packet.json',
    );

    // Same shape of reference, locator that is not a lane and a lesson: invalid, not pending.
    expect(() => resolveReference(`packet:answer-key-is-c#sha256:${digest}`, 'packet')).toThrow(
      ReferenceModelError,
    );
  });

  it('refuses a correct digest attached to the wrong locator or the wrong kind', () => {
    const policyDigest = sha256OfPath(
      'content/lesson-factory/deadline-profile/release-policy.json',
    );
    expect(() =>
      resolveReference(
        `profile:content/lesson-factory/deadline-profile/deadline-profile.json#sha256:${policyDigest}`,
        'profile',
      ),
    ).toThrow(/hashes to/);
    expect(() => resolveReference(canonicalRefFor('policy'), 'profile')).toThrow(
      /is a "policy" reference where a "profile" was required/,
    );
  });

  it('refuses prose smuggled into a locator, on every kind', () => {
    const digest = sha256OfPath('key-docs/lesson-quality-rubric.md');
    for (const spec of REFERENCE_KINDS) {
      for (const payload of ['answer-key-is-c', 'official-rubric-pass', 'release-approved']) {
        expect(() => parseReference(`${spec.kind}:${payload}#sha256:${digest}`, spec.kind)).toThrow(
          ReferenceModelError,
        );
      }
    }
  });
});
