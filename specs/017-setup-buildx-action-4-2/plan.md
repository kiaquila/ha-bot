# Plan: Upgrade Docker Setup Buildx Action to 4.2.0

## Summary

Keep the Dependabot-generated immutable v4.2.0 pin in both workflows, document the Node 24 and removed-input boundaries, and verify the unchanged default builder contract.

## Technical Context

- workflows: `.github/workflows/ci.yml`, `.github/workflows/deploy-production.yml`
- action: `docker/setup-buildx-action`
- old version: v3.12.0
- new version: v4.2.0
- upstream v4 boundary: Node 24 runtime requiring Actions Runner v2.327.1 or later
- removed deprecated inputs: `config`, `config-inline`, `install`
- configured action inputs: none
- data changes: none

## Scope Boundaries

- in scope: two immutable action pins, release-note and metadata compatibility review, workflow checks, and feature memory
- out of scope: builder configuration, Docker or BuildKit upgrades, image changes, registry policy, and deployment execution

## Constitution Check

- Spec-first: this folder records the production workflow dependency change.
- Testable boundaries: repository preflight and production-workflow checks validate the unchanged contract.
- Test-first bias: no new behavior is introduced; regression verification is the relevant evidence.
- PR-only: work remains on the existing dependency PR branch and dedicated worktree.
- Simplicity: only two identical action references change.
- Deployability: merge is gated on protected checks and current-head review.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Both workflow diffs show the exact v4.2.0 action SHA |
| AC-002 | Neither setup step has a `with` block; downstream steps remain unchanged |
| AC-003 | Both jobs use GitHub-hosted `ubuntu-latest`, compatible with the Node 24 runner requirement |
| AC-004 | Neither workflow uses the removed `config`, `config-inline`, or `install` inputs |
| AC-005 | Required GitHub checks pass and all review threads are resolved |

## Risks

- Self-hosted runners older than v2.327.1 cannot execute Node 24 actions. Both active jobs use GitHub-hosted runners.
- Upstream default behavior could change despite an unchanged workflow configuration. The immutable SHA and existing workflow checks limit configuration and supply-chain drift.
