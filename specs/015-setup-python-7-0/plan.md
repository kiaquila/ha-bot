# Plan: Upgrade Setup Python Action to 7.0.0

## Summary

Retain the Dependabot-generated immutable v7.0.0 pin in both workflows, document the Node 24 and ESM migration boundaries, and verify the unchanged Python 3.12 pip-cache contract.

## Technical Context

- workflows: `.github/workflows/ci.yml`, `.github/workflows/deploy-production.yml`
- action: `actions/setup-python`
- old version: v5.6.0
- new version: v7.0.0
- upstream v6 breaking boundary: Node 24 runtime requiring Actions Runner v2.327.1 or later
- upstream v7 boundary: migration to ESM and removal of the temporary `pip-install` input
- retained inputs: `python-version: "3.12"`, `cache: "pip"`
- data changes: none

## Scope Boundaries

- in scope: two immutable action pins, release-note and metadata compatibility review, workflow tests, and feature memory
- out of scope: Python or pip upgrades, cache changes, dependency changes, application behavior, and deployment execution

## Constitution Check

- Spec-first: this folder records the production workflow dependency change.
- Testable boundaries: repository preflight and deployment workflow tests validate the unchanged contract.
- Test-first bias: no new behavior is introduced; regression verification is the relevant evidence.
- PR-only: work remains on the existing dependency PR branch and dedicated worktree.
- Simplicity: only two identical action references change.
- Deployability: merge is gated on protected checks and current-head review.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Both workflow diffs show the exact v7.0.0 action SHA |
| AC-002 | Python 3.12 and pip-cache inputs are unchanged and remain declared by v7.0.0 |
| AC-003 | Both jobs use GitHub-hosted `ubuntu-latest`, compatible with the Node 24 requirement |
| AC-004 | Neither workflow supplies the removed `pip-install` input |
| AC-005 | Required GitHub checks pass and all review threads are resolved |

## Risks

- Self-hosted runners older than v2.327.1 cannot execute Node 24 actions. Both active jobs use GitHub-hosted runners.
- Cache regressions could slow CI or deployment validation. The `cache: "pip"` contract and dependency files remain unchanged.
- The v7 ESM migration changes action internals but not existing inputs, outputs, or general behavior according to upstream documentation.
