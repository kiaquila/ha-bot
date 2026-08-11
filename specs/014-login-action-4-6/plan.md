# Plan: Upgrade Docker Login Action to 4.6.0

## Summary

Retain the Dependabot-generated immutable v4.6.0 pin, document the Node 24 compatibility boundary, and verify that production GHCR authentication remains unchanged.

## Technical Context

- workflow: `.github/workflows/deploy-production.yml`
- action: `docker/login-action`
- old version: v3.7.0
- new version: v4.6.0
- upstream breaking boundary: Node 24 runtime requiring Actions Runner v2.327.1 or later
- relevant metadata change: the action entry point moves from `dist/index.js` to `dist/index.cjs`; declared inputs are unchanged
- data changes: none

## Scope Boundaries

- in scope: one immutable action pin, release-note and action-metadata compatibility review, workflow tests, and feature memory
- out of scope: credentials, permissions, registry selection, logout behavior, build semantics, and deployment execution

## Constitution Check

- Spec-first: this folder records the production workflow dependency change.
- Testable boundaries: repository preflight and deployment workflow tests validate the unchanged contract.
- Test-first bias: no new behavior is introduced; regression verification is the relevant evidence.
- PR-only: work remains on the existing dependency PR branch and dedicated worktree.
- Simplicity: only the action reference changes.
- Deployability: merge is gated on protected checks and current-head review.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Workflow diff shows the exact v4.6.0 action SHA |
| AC-002 | Existing `registry`, `username`, and `password` inputs are unchanged and present in v4.6.0 metadata |
| AC-003 | The job uses GitHub-hosted `ubuntu-latest`, compatible with the v4 Node 24 requirement |
| AC-004 | Required GitHub checks pass and all review threads are resolved |

## Risks

- Self-hosted runners older than v2.327.1 cannot execute Node 24 actions. The active job uses a GitHub-hosted runner.
- Authentication regressions could block image publication. The immutable pin is the only workflow change and the existing inputs remain declared by v4.6.0.
