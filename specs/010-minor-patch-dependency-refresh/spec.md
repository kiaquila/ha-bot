# Spec: Refresh Minor and Patch Dependencies

## Goal

Keep the bot's HTTP dependency set current by accepting the scheduled Requests and IDNA updates without changing application behavior.

## Scope

In scope:

- Update `requests` from `2.33.0` to `2.34.2`.
- Update `idna` from `3.15` to `3.18`.
- Verify the repository and dependency security checks.

Out of scope:

- Changes to Telegram bot behavior, deployment configuration, or other dependency pins.
- Adoption of new Requests or IDNA APIs.

## User Story

As a maintainer, I want routine dependency updates verified and merged so the supported runtime remains current without introducing product changes.

## Acceptance Criteria

1. Given the existing production requirements, when this change is applied, then `requests` is pinned to `2.34.2` and `idna` is pinned to `3.18`.
2. Given the updated pins, when repository preflight and required GitHub checks run, then they succeed.
3. Given this is maintenance-only work, when the diff is reviewed, then no application source or unrelated dependency is changed.

## Negative Scenarios

1. Given other dependencies have available releases, when this change is merged, then their pins remain unchanged.
2. Given Requests and IDNA expose new functionality, when this change is merged, then no new runtime behavior depends on it.

## Requirements

- FR-001: Pin `requests` exactly to `2.34.2`.
- FR-002: Pin `idna` exactly to `3.18`.
- FR-003: Preserve all unrelated runtime and deployment behavior.

## Success Criteria

- SC-001: `pnpm run preflight` passes.
- SC-002: The PR's baseline, guard, AI review, and OSV checks pass.

