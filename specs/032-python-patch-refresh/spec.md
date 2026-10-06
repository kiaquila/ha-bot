# Spec: Python Patch Refresh

## Goal

Update the grouped Python runtime dependencies to the requested patch releases without changing HA Bot behavior.

## Scope

In scope:

- Update `python-dotenv` from 1.2.3 to 1.2.4.
- Update `cryptography` from 50.0.1 to 50.0.2.
- Retain exact version pins and verify the update through local preflight and required GitHub checks.

Out of scope:

- Changes to Telegram handlers, appointment polling, persistence semantics, or deployment configuration.
- Dependency restructuring, lockfile introduction, or updates beyond these two grouped patch releases.

## User Story

As a maintainer, I want supported Python dependencies refreshed so the bot receives current patch fixes while preserving existing behavior.

## Acceptance Criteria

1. `requirements.txt` pins `python-dotenv` 1.2.4 and `cryptography` 50.0.2.
2. Application source, persistence behavior, and deployment configuration remain unchanged.
3. The PR diff is limited to the two intended pins and this feature-memory folder.
4. Local preflight and all required GitHub checks pass on the final PR head.
5. A current-head Codex review completes with no unresolved review threads.

## Negative Scenarios

1. No dependency becomes unpinned and no unrelated dependency is updated.
2. The update must not change credential encryption, state-file handling, or environment loading behavior.
3. The PR must not merge with stale, queued, missing, or failed required checks.

## Requirements

- FR-001: Keep both updated runtime dependencies exactly pinned.
- FR-002: Preserve application and deployment behavior.
- FR-003: Record verification evidence and review outcomes before merge.

## Success Criteria

- SC-001: `pnpm run preflight` passes locally.
- SC-002: `baseline-checks`, `guard`, and `AI Review` are green on the final head.
- SC-003: GitHub reports the PR mergeable with zero unresolved review threads.
