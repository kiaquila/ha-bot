# Spec: GitHub Actions Dependency Refresh

## Goal

Update the grouped GitHub Actions dependencies to their requested minor and patch releases while preserving the repository's CI, deployment, and security-scan behavior.

## Scope

In scope:

- Update the pinned revisions of `docker/setup-buildx-action` and `google/osv-scanner-action/osv-scanner-action`.
- Verify the changed workflow definitions through the repository preflight and GitHub checks.

Out of scope:

- Changes to bot behavior, production configuration, or deployment credentials.
- Unrelated workflow refactoring.

## User Story

As a maintainer, I want the supported GitHub Actions dependencies refreshed, so that CI and deployment use their current grouped minor and patch releases.

## Acceptance Criteria

1. The dependency pins in CI, production deployment, and OSV scan workflows resolve to the requested upstream action revisions.
2. The repository preflight and all required GitHub checks pass on the PR head.
3. A current-head Codex review has completed with no unresolved findings.

## Negative Scenarios

1. The update must not change application source or runtime dependency pins.
2. The update must not weaken any CI, deployment, or vulnerability-scanning workflow controls.

## Requirements

- FR-001: Keep action references pinned to immutable commit SHAs with their corresponding version comments.
- FR-002: Limit workflow changes to the grouped Dependabot updates.

## Success Criteria

- SC-001: `pnpm run preflight` passes locally.
- SC-002: Required GitHub checks are green for the final PR head.
- SC-003: No unresolved review threads remain.
