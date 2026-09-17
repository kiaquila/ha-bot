# Spec: GitHub Actions Dependency Refresh

## Goal

Update the grouped GitHub Actions dependencies to their requested minor releases while preserving CI and production-deployment behavior.

## Scope

In scope:

- Update the pinned revisions of `pnpm/action-setup` and `docker/setup-qemu-action`.
- Verify the changed workflow definitions through repository preflight and GitHub checks.

Out of scope:

- Changes to bot behavior, runtime dependencies, production configuration, or deployment credentials.
- Unrelated workflow refactoring.

## User Story

As a maintainer, I want supported GitHub Actions dependencies refreshed, so that CI and deployment use their current grouped minor releases.

## Acceptance Criteria

1. The dependency pins in CI and production deployment resolve to the requested upstream action revisions.
2. The repository preflight and all required GitHub checks pass on the final PR head.
3. A current-head Codex review completes with no unresolved findings or review threads.

## Negative Scenarios

1. The update must not change application source, runtime dependency pins, or deployment behavior.
2. The update must not weaken any CI or deployment workflow controls.

## Requirements

- FR-001: Keep action references pinned to immutable commit SHAs with their corresponding version comments.
- FR-002: Limit workflow changes to the grouped Dependabot updates.

## Success Criteria

- SC-001: `pnpm run preflight` passes locally.
- SC-002: Required GitHub checks are green for the final PR head.
- SC-003: No unresolved review threads remain.
