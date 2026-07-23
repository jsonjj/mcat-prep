# Public candidate-content exposure containment

## Summary

Two raw candidate-bank JSONL files were committed while the repository had been
observed as publicly visible. These files were not an approved publication
source and were not suitable for repository storage. This record deliberately
does not reproduce source wording, answer material, rationales, or derivatives.

## Visibility timeline

- On 2026-07-21 at 13:04:48 CDT, commit
  `f8e74d7255e58071bae452a1ecf3213f0e47320b` added both affected paths.
- During the 2026-07-21 pre-implementation review, the GitHub repository was
  observed as public. The exact visibility-change timestamps must be confirmed
  from the GitHub organization audit log before incident closure.
- During containment on 2026-07-21, `gh repo view` reported
  `jsonjj/mcat-prep` as private.

## Affected paths

- `question-bank/cars-passed-candidates.jsonl`
- `question-bank/other-passed-candidates.jsonl`

No protected content from either path is included in this incident record.

## Containment actions

1. Removed both candidate files from the active repository tree.
2. Added an anchored ignore rule for raw JSONL files in the candidate-drop
   directory.
3. Reworked the protected-content scanner around a testable pure function.
4. Added a fail-closed rule that rejects answer-bearing tracked JSONL outside
   an explicit server-only fixture allowlist.
5. Added regression tests for rejected candidate data, learner-safe data, and
   the narrowly scoped server-only fixture exception.

## Scanner gap

Before containment, the scanner rejected known file classes and a canary token,
but did not inspect tracked JSONL for answer-bearing fields. It therefore could
report success while the affected candidate files remained tracked. The new
rule closes that active-tree gap; repository-history scanning remains separate.

## Required follow-up

- Treat the material as exposed and invalidate it for production, protected
  forms, calibration, or mastery evidence.
- Have the repository owner and security owner approve a history rewrite that
  removes both paths from every reachable Git object, then coordinate the
  required force-push and collaborator re-clone procedure.
- Confirm visibility transitions and access events using GitHub audit data.
- Scan forks, release artifacts, CI artifacts, caches, and mirrors for the
  affected paths and document disposition.
- Confirm through AWS inventory and access logs that neither raw file was
  uploaded before this incident is closed.
- Rotate or retire any downstream derived artifacts if later investigation
  finds that these files were consumed.

## Closure criteria

This incident remains open until history cleanup and external-copy review are
complete, audit evidence is retained, and the content is formally marked
ineligible for product use. Active-tree removal alone does not revoke copies
that may already exist.
