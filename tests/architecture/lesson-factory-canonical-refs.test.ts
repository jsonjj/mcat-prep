import { describe, expect, it } from 'vitest';

import {
  canonicalRefFor,
  REFERENCE_KINDS,
  ReferenceModelError,
  resolveReference,
  sha256OfPath,
} from './lesson-factory/reference-model.js';

/**
 * The freeze chain is only as strong as the check that walks it.
 *
 * The weak version of this check asks whether a reference *ends with* the right hash.
 * That accepts `policy:anything-at-all#sha256:<correct hash>` — the bytes are pinned to
 * a name nobody validated, so the locator becomes decoration and a reference can point
 * at one file while claiming to be another. These cases prove the resolver checks all
 * four parts: kind, canonical locator, target bytes, and digest.
 */

const POLICY_LOCATOR = 'content/lesson-factory/deadline-profile/release-policy.json';
const RECEIPT_LOCATOR = 'content/lesson-factory/deadline-profile/owner-route-policy-receipt.json';
const LIFECYCLE_LOCATOR = 'content/lesson-factory/deadline-profile/lifecycle-nonclaims.json';

const FIXED_KINDS = REFERENCE_KINDS.filter((spec) => spec.resolution.strategy === 'FIXED_PATH').map(
  (spec) => spec.kind,
);

describe('canonical reference resolver: resolves a correct reference', () => {
  it.each(FIXED_KINDS)('resolves a %s reference at its current bytes', (kind) => {
    const resolved = resolveReference(canonicalRefFor(kind), kind);
    expect(resolved.status).toBe('RESOLVED');
    if (resolved.status !== 'RESOLVED') throw new Error('unreachable');
    expect(resolved.kind).toBe(kind);
    expect(resolved.digest).toBe(sha256OfPath(resolved.path));
  });
});

describe('canonical reference resolver: rejects what suffix equality would accept', () => {
  const policyHash = sha256OfPath(POLICY_LOCATOR);

  it('rejects a correct hash attached to a locator nobody recognises', () => {
    expect(() => resolveReference(`policy:anything-at-all#sha256:${policyHash}`, 'policy')).toThrow(
      /not a canonical policy locator/,
    );
  });

  it('rejects a correct hash attached to a different canonical file', () => {
    // The locator is real and allowlisted; the bytes it names are not these bytes.
    expect(() =>
      resolveReference(`lifecycle:${LIFECYCLE_LOCATOR}#sha256:${policyHash}`, 'lifecycle'),
    ).toThrow(/hashes to/);
  });

  it('rejects a correct hash and locator carrying the wrong kind', () => {
    expect(() =>
      resolveReference(`receipt:${POLICY_LOCATOR}#sha256:${policyHash}`, 'receipt'),
    ).toThrow(/not a canonical receipt locator/);
    expect(() => resolveReference(canonicalRefFor('policy'), 'receipt')).toThrow(
      /is a "policy" reference where a "receipt" was required/,
    );
  });

  it('rejects a reference whose locator is a path traversal or a lookalike', () => {
    for (const locator of [
      `../${POLICY_LOCATOR}`,
      `${POLICY_LOCATOR}/../release-policy.json`,
      POLICY_LOCATOR.replace('release-policy', 'release-policy-copy'),
      `./${POLICY_LOCATOR}`,
    ]) {
      expect(() => resolveReference(`policy:${locator}#sha256:${policyHash}`, 'policy')).toThrow(
        ReferenceModelError,
      );
    }
  });

  it('rejects a stale hash on the right locator', () => {
    // Not a placeholder: a real-looking digest of some other bytes, which is what a
    // stale reference actually looks like after the target is edited.
    const stale = sha256OfPath('key-docs/lesson-quality-rubric.md');
    expect(() => resolveReference(`policy:${POLICY_LOCATOR}#sha256:${stale}`, 'policy')).toThrow(
      /hashes to/,
    );
  });

  it('rejects a placeholder digest even on a locator that is otherwise correct', () => {
    expect(() =>
      resolveReference(`policy:${POLICY_LOCATOR}#sha256:${'0'.repeat(64)}`, 'policy'),
    ).toThrow(/placeholder digest/);
  });

  it('rejects a locator with no hash, a malformed hash, and a non-string', () => {
    expect(() => resolveReference(`policy:${POLICY_LOCATOR}`, 'policy')).toThrow(/malformed/);
    expect(() =>
      resolveReference(`policy:${POLICY_LOCATOR}#sha256:${'a'.repeat(63)}`, 'policy'),
    ).toThrow(/malformed/);
    expect(() =>
      resolveReference(`policy:${POLICY_LOCATOR}#sha256:${policyHash.toUpperCase()}`, 'policy'),
    ).toThrow(/malformed/);
    for (const value of [null, undefined, 42, {}]) {
      expect(() => resolveReference(value, 'policy')).toThrow(/expected a pinned/);
    }
  });

  it('rejects a reference that smuggles text into the locator', () => {
    expect(() =>
      resolveReference(
        `receipt:${RECEIPT_LOCATOR} the answer is C#sha256:${policyHash}`,
        'receipt',
      ),
    ).toThrow(ReferenceModelError);
  });
});
