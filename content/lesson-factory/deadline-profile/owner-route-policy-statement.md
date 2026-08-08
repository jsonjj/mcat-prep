# Owner route-policy statement (non-authoritative verbatim record)

**This file decides nothing.** It records, word for word, what the
`PRODUCT_PEDAGOGY_OWNER` said when the initial-release route scope was settled, so that a
later reader can check the machine-readable receipt against what was actually said.

The decision itself lives in
[`owner-route-policy-receipt.json`](./owner-route-policy-receipt.json), entirely in coded
fields. Where this text and those fields differ, **the coded fields govern** and the
difference is a defect in the receipt, to be fixed by superseding it. The receipt pins
this file by hash under `decision_provenance`, so this record cannot be edited after the
fact without breaking that pin.

Keeping the prose here rather than inside the receipt is deliberate. A verbatim field
sitting among machine decision fields is eventually read as one of them, and a field that
accepts sentences accepts sentences nobody intended — including ones that sound like a
lesson approval.

## Statement

Recorded 2026-08-03, role `PRODUCT_PEDAGOGY_OWNER`, scope `RELEASE_ROUTE_SCOPE_ONLY`:

> STANDARD only; make CONCISE, MISCONCEPTION, and PREREQUISITE_SUPPORT authoritatively not
> applicable for the initial release.

## What was not said

Nothing in the statement above approves a lesson, waives a hard gate, supplies evidence
for a BLOCKED evidence class, establishes a rubric pass, or authorises release or
publication. Those limits are enforced as `scope_limit_codes` in the receipt, not by this
paragraph.
