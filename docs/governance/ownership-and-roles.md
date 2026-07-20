# Ownership & separation of duties

## Content roles (enforced by the pipeline)

| Role | May do | May not do |
|---|---|---|
| Author | Draft original items/stimuli/lessons | Approve own work; set eligibility |
| Independent blind solver | Solve without seeing the proposed key; flag ambiguity | Author the item they solve |
| Science/SME reviewer | Approve scientific accuracy + one-best-answer | Publish |
| Copy reviewer | Approve wording/clarity | Change the key |
| Accessibility reviewer | Approve alt text, structure, color/motion independence | Publish |
| Rights/provenance reviewer | Confirm origin, licensing, similarity clearance | Waive science review |
| Publisher | Activate an independently approved release (two-person) | Author/edit items; rewrite history |

- AI actors may draft or check candidates only. `actor_type = ai` is rejected for approval, waiver, publication, rollback, or retirement.
- Author ≠ approver on the same version; approvals bind to the exact content hash.

## Engineering / operations roles (target for Phase 4+)

Content reviewer, publisher, support, privacy operator, research analyst, SRE/deployer, security auditor, and time-limited break-glass — each least-privilege, with production database consoles and learner impersonation kept out of ordinary workflows.

## Agent build model (this repository)

Implementation used the model policy in [`docs/tooling/skills.lock.md`](../tooling/skills.lock.md): planning/research on GPT-5.6 Sol Max; implementation on Claude Opus 4.8 Thinking Max. The coordinator integrates; delegated work stays within bounded file ownership with contract-first handoffs and independent review, per the plan's operating model.

## Human decisions never delegated

Repository visibility, credentials/AWS org, production deploys, destructive migrations, legal/naming/affiliation, scientific/psychometric/fairness sign-off, answer keys, protected publication, and go/no-go.
