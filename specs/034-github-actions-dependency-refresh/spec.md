# Spec: GitHub Actions Dependency Refresh

## Goal

Update the grouped GitHub Actions dependencies to their requested minor releases while preserving the repository's CI, deployment, and vulnerability-scanning behavior.

## Scope

In scope:

- Update both pinned `actions/setup-node` references from v7.0.0 to v7.1.0.
- Update the pinned `google/osv-scanner-action/osv-scanner-action` reference from v2.6.0 to v2.7.0.
- Verify the changed workflow definitions through the repository preflight and required GitHub checks.

Out of scope:

- Changes to bot behavior, Node or pnpm versions, production configuration, deployment credentials, or workflow permissions.
- Unrelated dependency updates or workflow refactoring.

## User Story

As a maintainer, I want supported GitHub Actions dependencies refreshed, so that CI, deployment, and vulnerability scanning use their current grouped minor releases.

## Acceptance Criteria

1. The CI and production deployment workflows use the immutable v7.1.0 `actions/setup-node` revision while retaining their existing inputs and ordering.
2. The OSV workflow uses the immutable v2.7.0 scanner revision while retaining its existing scan arguments.
3. `pnpm run preflight` and all required GitHub checks pass for the final PR head.
4. A current-head Codex review completes with no unresolved findings.

## Negative Scenarios

1. The update must not change application source, runtime dependencies, workflow triggers, permissions, or deployment behavior.
2. The update must not weaken CI, deployment, or vulnerability-scanning controls.

## Requirements

- FR-001: Keep all action references pinned to immutable commit SHAs with matching version comments.
- FR-002: Limit workflow changes to the grouped Dependabot updates.
- FR-003: Add only the feature memory required for the protected production workflow path.

## Success Criteria

- SC-001: `pnpm run preflight` passes locally.
- SC-002: `baseline-checks`, `guard`, `osv-scan`, and `AI Review` are green for the final PR head.
- SC-003: No unresolved review findings remain.
