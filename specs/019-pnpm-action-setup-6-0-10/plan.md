# Plan: Upgrade pnpm Action Setup to 6.0.10

## Summary

Retain the Dependabot-generated immutable v6.0.10 pins, document version-selection and cache boundaries, and verify that CI and production preflight continue to use the repository-pinned pnpm release.

## Technical Context

- workflows: `.github/workflows/ci.yml` and `.github/workflows/deploy-production.yml`
- action references: two
- old version: v4.3.0
- new version: v6.0.10
- pnpm source: `package.json` field `packageManager: pnpm@10.33.0`
- runtime boundary: Node 24 action runtime on GitHub-hosted `ubuntu-latest`
- cache boundary: `actions/setup-node` retains `cache: pnpm`; action-level cache remains disabled
- data changes: none

## Scope Boundaries

- in scope: immutable pins, release-note/input compatibility review, workflow checks, and feature memory
- out of scope: Node or pnpm upgrades, lockfile changes, alternate action migration, triggers, permissions, dependency installation, and deployment behavior

## Constitution Check

- Spec-first: this folder records the production and control-plane workflow dependency change.
- Testable boundaries: repository preflight and protected GitHub checks validate the unchanged workflow contracts.
- Test-first bias: no new product behavior is introduced; regression verification is the relevant evidence.
- PR-only: work remains on the existing dependency PR branch and dedicated worktree.
- Simplicity: the update changes only two immutable references plus process evidence.
- Deployability: merge is gated on protected checks and current-head review.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Search reports two exact v6.0.10 SHA pins and two `v6.0.10` comments |
| AC-002 | `package.json` retains `packageManager: pnpm@10.33.0`; both action steps remain after checkout and have no inputs |
| AC-003 | Both affected jobs retain GitHub-hosted `ubuntu-latest` |
| AC-004 | Workflow diff leaves `actions/setup-node` cache inputs and all install commands unchanged |
| AC-005 | Required GitHub checks pass and all review threads are resolved |

## Risks

- Node 24 actions require a sufficiently current Actions runner. Both affected jobs use GitHub-hosted runners rather than pinned self-hosted infrastructure.
- Supplying pnpm in both workflow inputs and `package.json` would create a version conflict. The workflows intentionally continue to omit the `version` input.
- v6.0.10 release notes point to a successor action, but this dependency PR remains scoped to the supported immutable release proposed by Dependabot.
