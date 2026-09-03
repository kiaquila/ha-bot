# Spec: Python Dependency Refresh

## Goal

Refresh the grouped Python runtime dependencies to their requested minor and patch releases without changing HA Bot behavior.

## Scope

In scope:

- Update the pinned releases of `idna`, `python-dotenv`, and `cryptography` in `requirements.txt`.
- Verify the dependency update through local preflight and required GitHub checks.

Out of scope:

- Changes to Telegram handlers, appointment polling, persistence, or deployment configuration.
- Dependency restructuring beyond the three grouped updates.

## User Story

As a maintainer, I want supported Python dependencies refreshed, so that the bot uses current grouped minor and patch releases.

## Acceptance Criteria

1. `requirements.txt` pins `idna` 3.19, `python-dotenv` 1.2.3, and `cryptography` 50.0.1.
2. Application source and deployment configuration are not changed by the dependency refresh.
3. Local preflight and all required GitHub checks pass on the final PR head.
4. A current-head Codex review completes and no review threads remain unresolved.

## Negative Scenarios

1. No unpinned or transitive-only dependency update is introduced.
2. The update must not change bot runtime behavior or persistence semantics.

## Requirements

- FR-001: Retain exact version pins for each updated direct dependency.
- FR-002: Keep the change limited to the Dependabot dependency group and its required process memory.

## Success Criteria

- SC-001: `pnpm run preflight` passes locally.
- SC-002: Required GitHub checks are green on the final PR head.
- SC-003: Codex review evidence is current and every review thread is resolved.
