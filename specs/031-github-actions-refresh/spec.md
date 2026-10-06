# Spec: GitHub Actions Refresh

## Goal

Update the grouped Docker GitHub Actions to the requested minor releases without changing CI or production deployment behavior.

## Scope

In scope:

- Update `docker/setup-qemu-action` from 4.3.0 to 4.4.0.
- Update `docker/setup-buildx-action` from 4.3.0 to 4.4.1.
- Update `docker/build-push-action` from 7.3.0 to 7.4.0.
- Retain full commit-SHA pins and verify the workflows through local preflight and required GitHub checks.

Out of scope:

- Changes to workflow triggers, permissions, runner selection, build inputs, image tags, deployment commands, or production secrets.
- Updates to any other GitHub Action or application dependency.

## User Story

As a maintainer, I want the Docker workflow actions refreshed so CI and production builds use current minor releases while preserving the existing deployment contract.

## Acceptance Criteria

1. CI and production workflows reference the requested three action releases by full commit SHA.
2. Workflow triggers, permissions, jobs, inputs, and deployment logic remain unchanged.
3. The PR diff is limited to the intended action pins and this feature-memory folder.
4. Local preflight and all required GitHub checks pass on the final PR head.
5. A current-head Codex review completes with no unresolved review threads.

## Negative Scenarios

1. No action reference is changed to a mutable tag or branch.
2. No unrelated workflow action, runtime dependency, or deployment behavior is changed.
3. The PR must not merge with stale, queued, missing, or failed required checks.

## Requirements

- FR-001: Keep every updated action pinned to the Dependabot-provided full commit SHA.
- FR-002: Preserve the existing workflow topology and production deployment contract.
- FR-003: Record verification evidence and review outcomes before merge.

## Success Criteria

- SC-001: `pnpm run preflight` passes locally.
- SC-002: `baseline-checks`, `guard`, and `AI Review` are green on the final head.
- SC-003: GitHub reports the PR mergeable with zero unresolved review threads.
