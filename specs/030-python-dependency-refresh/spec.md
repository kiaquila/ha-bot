# Spec: Python Dependency Refresh

## Goal

Update the grouped Python runtime dependencies to the requested minor releases without changing HA Bot behavior.

## Scope

In scope:

- Update `anyio` from 4.14.2 to 4.15.1 and `idna` from 3.19 to 3.20 in `requirements.txt`.
- Verify the dependency update through local preflight and required GitHub checks.

Out of scope:

- Changes to Telegram handlers, appointment polling, persistence, or deployment configuration.
- Dependency restructuring beyond the two grouped updates.

## User Story

As a maintainer, I want supported Python dependencies refreshed, so that the bot uses current grouped minor releases.

## Acceptance Criteria

1. `requirements.txt` pins `anyio` 4.15.1 and `idna` 3.20.
2. Application source and deployment configuration are unchanged by the dependency refresh.
3. Local preflight and all required GitHub checks pass on the final PR head.
4. A current-head Codex review completes and no review threads remain unresolved.

## Negative Scenarios

1. No unpinned or transitive-only dependency update is introduced.
2. The update must not change bot runtime behavior or persistence semantics.

## Requirements

- FR-001: Retain exact version pins for both updated direct dependencies.
- FR-002: Keep the change limited to the Dependabot dependency group and its required process memory.

## Success Criteria

- SC-001: `pnpm run preflight` passes locally.
- SC-002: Required GitHub checks are green for the final PR head.
- SC-003: Codex review evidence is current and every review thread is resolved.
