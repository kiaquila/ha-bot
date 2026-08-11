# Plan: Upgrade Docker Setup QEMU Action to 4.2.0

## Summary

Retain the Dependabot-generated immutable v4.2.0 pin in both workflows, document the Node 24 compatibility boundary, and verify the unchanged ARM64 build setup.

## Technical Context

- workflows: `.github/workflows/ci.yml`, `.github/workflows/deploy-production.yml`
- action: `docker/setup-qemu-action`
- old version: v3.7.0
- new version: v4.2.0
- upstream breaking boundary: Node 24 runtime requiring Actions Runner v2.327.1 or later
- data changes: none

## Scope Boundaries

- in scope: two immutable action pins, release-note compatibility review, workflow tests, and feature memory
- out of scope: QEMU inputs, platform selection, Buildx changes, image semantics, and deployment execution

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
| AC-001 | Both workflow diffs show the exact v4.2.0 action SHA |
| AC-002 | QEMU remains immediately before Buildx and neither step gains configuration inputs |
| AC-003 | Both jobs use GitHub-hosted `ubuntu-latest`, compatible with the v4 Node 24 requirement |
| AC-004 | Required GitHub checks pass and all review threads are resolved |

## Risks

- Self-hosted runners older than v2.327.1 cannot execute Node 24 actions. Both active jobs use GitHub-hosted runners.
- Changing one workflow but not the other would create inconsistent build preparation. The update and verification cover both references.
