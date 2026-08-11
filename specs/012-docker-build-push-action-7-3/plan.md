# Plan: Upgrade Docker Build and Push Action to 7.3.0

## Summary

Retain the Dependabot-generated immutable v7.3.0 pin, document the v7 compatibility boundary, and verify that the existing production build contract remains unchanged.

## Technical Context

- workflow: `.github/workflows/deploy-production.yml`
- action: `docker/build-push-action`
- old version: v6.19.2
- new version: v7.3.0
- upstream breaking boundary: Node 24 runtime and removal of two deprecated summary environment variables
- data changes: none

## Scope Boundaries

- in scope: action pin, release-note compatibility review, workflow tests, and feature memory
- out of scope: Dockerfile changes, registry policy, image metadata changes, and deployment execution

## Constitution Check

- Spec-first: this folder records the production workflow dependency change.
- Testable boundaries: repository preflight and deployment workflow tests validate the unchanged contract.
- Test-first bias: no new behavior is introduced; regression verification is the relevant evidence.
- PR-only: work remains on the existing dependency PR branch and dedicated worktree.
- Simplicity: the update changes one immutable action reference and adds no abstraction.
- Deployability: merge is gated on the protected checks and current-head review.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Workflow diff shows only the exact v7.3.0 action SHA |
| AC-002 | Input block remains byte-for-byte unchanged and deployment tests pass |
| AC-003 | Workflow uses `ubuntu-latest`; upstream v7 notes require runner v2.327.1+, satisfied by current GitHub-hosted runners |
| AC-004 | Required GitHub checks pass and all review threads are resolved |

## Risks

- Self-hosted runners older than v2.327.1 cannot execute Node 24 actions. This workflow uses GitHub-hosted `ubuntu-latest`, so that incompatibility is outside the active path.
- Upstream action behavior may change despite stable inputs. The immutable SHA and existing workflow tests limit supply-chain and configuration drift.
