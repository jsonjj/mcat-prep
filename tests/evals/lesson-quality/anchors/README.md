# Lesson-quality anchor fixtures

This directory contains machine-readable candidate metadata corresponding to the
human-readable catalog at:

`key-docs/lesson-quality-rubric-anchors.md`

## Status

`anchor-set.json` contains 36 source-grounded candidates and
`anchor-set.schema.json` defines their closed machine contract. No anchor is
gold-approved yet. Candidate files must use
`lifecycle_state: "CANDIDATE_PENDING_REVIEW"` and must not be consumed by a
registration gate or represented as calibrated evaluator input.

## Required synchronization

Every fixture must match the human catalog on:

- `anchor_id`;
- `anchor_set_version`;
- `dimension_id`;
- `case_kind`;
- lifecycle state;
- source lesson and revision;
- source/evidence references;
- controlled synthetic transform;
- proposed verdict, current evidence status, and null gold verdict;
- rationale version; and
- required review receipts.

## Current and planned layout

```text
anchors/
  README.md
  anchor-set.json
  anchor-set.schema.json
  LQA-C01-P01/
    anchor.json
    input/
    evidence/
  ...
```

The set contains 36 IDs: clear pass, clear fail, and boundary for each
`LQR-C01`–`LQR-C06` and `LQR-X01`–`LQR-X06`.

The per-anchor directories are created only after candidate review selects the exact
input snapshot or synthetic transform to materialize. Until then, `anchor-set.json`
is candidate metadata, not a complete evaluator input bundle.

Expected verdicts must be stored separately from judge inputs during calibration so
the judge cannot read the gold label.
