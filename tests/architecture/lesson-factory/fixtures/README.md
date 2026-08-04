# Lesson-factory contract controls

Each file here is a **valid control instance** of one WP-01 deadline contract — the
smallest document that satisfies its schema honestly — wrapped in a test-only envelope.
The negative cases in `tests/architecture/lesson-factory/negative-cases.ts` are generated
from these controls by exactly one mutation each, so a rejection can only be caused by
that mutation.

## The envelope

Every file has the shape:

```json
{
  "$test_fixture": { "synthetic": true, "not_for_production": true, "fixture_of": "…" },
  "instance": {
    /* the control document */
  }
}
```

The marker is not decoration. Every contract is closed, so the envelope **fails**
validation against the contract it is a control for, and
`lesson-factory-fail-closed.test.ts` asserts exactly that for each fixture. A control that
is byte-indistinguishable from a production record is a liability: it can be copied into
production, referenced by a real artifact, or loaded by a validator that has no way to
object. Load these through `loadFixture()`, which unwraps `instance` and throws if the
marker is missing.

## These are synthetic

Read them for shape, not for facts:

- Lesson `V3-LES-000101` does not exist, and its knowledge components do not resolve
  against the curriculum manifest.
- Every `sha256` here is invented. They are deterministic and realistic-looking rather
  than patterned (`a1a1…`, `deadbeef…`) because production intake now **rejects**
  placeholder digests: a control has to be recognisable by a marker that cannot be
  overlooked, not by a hash convention that only works until someone copies the hash. The
  two hashes that _are_ real — the rubric and the structural spec — appear in the shipped
  artifacts under `content/lesson-factory/deadline-profile/`, where the contract test
  recomputes them from disk.
- The references to frozen artifacts — the profile, the release policy, the rubric, the
  structural spec — are **not** invented. They are re-pinned to the current bytes on disk,
  because a control that carries a stale digest of a real file is a control that agrees
  with a version of the freeze that no longer exists. The contract test resolves them
  through the reference resolver, so drift fails rather than passing quietly.
- The `screen_code` values name hard-gate screens WP-01 does not implement, and their
  `screen_ref` locators point at runs nobody has performed. WP-01
  freezes the contract; the runners are later work packages. References to artifacts a
  runner will write (`packet:`, `handoff:`, `bundle:`, `screen:`) resolve to
  `NOT_YET_PRODUCED` rather than to bytes, which is the honest answer while no runner
  exists and is distinct from the resolver's answer for a malformed reference.
- The three `intake-validation*.json` controls are the ones here that are not written at
  all. They are records `admitIntake()` produces, regenerated whenever the freeze is
  re-pinned, so every digest in them — the offered bytes, the contract bytes, the
  references, and the admission proof — is real and current. That is deliberate: an
  admission is bound to the bytes it admitted, so a hand-authored one would be a forgery
  even as a fixture. The negative rows built from them are the ones that matter — every way
  a record could claim admission without having done the work, and every way it could claim
  to be about a document it is not about.
  - `intake-validation.json` is the frozen deadline profile, admitted.
  - `intake-validation-team-handoff.json` and `intake-validation-import-index.json` are the
    two lane artifacts, refused with `REFERENCES_UNRESOLVED`. The schema half passes; what
    is missing is the artifacts they name, which no runner has written. A refusal has to
    survive the same probes an admission does — a forged upgrade to `ADMITTED`, a missing
    reason, a rewritten identity — so these are controls in their own right rather than
    placeholders for a later round.
- `runner-log-record.json` is the control for a log line no runner emits yet. It is here
  to prove the positive half of the log contract — that codes, opaque hashes, and counts
  are permitted — against which the negative cases show that free text, protected
  material, secrets, arbitrary payloads, and prose smuggled into identifiers are not.

Copying a control into a real record therefore requires removing the envelope and
replacing every identity, hash, timestamp, and command in it.
