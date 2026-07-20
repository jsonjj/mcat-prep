# Agent skills lock

Agent skills are user-level development tools, not product artifacts. This file records the skills relied on during implementation for reproducibility and review.

| Skill | Source | Purpose | Status |
|---|---|---|---|
| test-driven-development | ~/.agents/skills | TDD for all code/bugfix work | present |
| verification-before-completion | ~/.agents/skills | Evidence before "done" | present |
| frontend-design | ~/.claude/skills | UI design method (two-pass) | present |
| vercel-react-best-practices | ~/.agents/skills | React/web performance | present |
| wcag-audit-patterns | ~/.agents/skills | Accessibility auditing | present |
| webapp-testing | ~/.agents/skills | Browser testing (Playwright) | present |
| subagent-driven-development | github.com/obra/superpowers | Worktree/handoff/review orchestration | installed |
| postgresql-table-design | github.com/wshobson/agents | Aurora schema/index review | installed |
| e2e-testing-patterns | github.com/wshobson/agents | Maintainable E2E suites | pending install |
| aws-cdk (official) | github.com/aws/agent-toolkit-for-aws | CDK guidance (Phase 4) | pending install |
| llm-evaluation | github.com/wshobson/agents | AI eval (Phase 9) | pending install |
| vercel-react-native-skills | github.com/vercel-labs/agent-skills | Native (Phase 13) | pending install |

## Model policy

- Planning/research (before implementation `GO`): `gpt-5.6-sol-max`.
- Implementation (this build and onward): `claude-opus-4-8-thinking-max` for the coordinator and every delegated agent/subagent. No silent fallback.

## Not used

- No psychometrics/IRT skill was adopted (no credible high-adoption skill exists); a credentialed psychometrician remains the authority. A project-local `mcat-psychometric-guardrails` skill may be authored only after human sign-off.
