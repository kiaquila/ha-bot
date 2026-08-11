# Spec: Fix Cryptography OSV Finding

## Goal

Restore a clean OSV dependency scan by upgrading the vulnerable `cryptography` pin to its fixed release.

## Scope

In scope:

- Update the `cryptography` pin in `requirements.txt` from `49.0.0` to `50.0.0`.
- Verify the dependency set locally and through the PR OSV scan.

Out of scope:

- Any other dependency updates.
- Bot behavior, Telegram handlers, deployment configuration, or API changes.

## User Story

As a maintainer, I want the worker's cryptography dependency to use the OSV-provided fixed version so the protected branch remains deployable and free of this known vulnerability.

## Acceptance Criteria

1. Given the current requirements pin `cryptography==49.0.0`, when the dependency is updated, then `requirements.txt` pins `cryptography==50.0.0`.
2. Given the updated requirements, when the OSV Scan GitHub check runs for this PR, then it succeeds without reporting PYSEC-2026-3552 for `cryptography`.
3. Given the security fix, when repository verification runs, then `pnpm run preflight` succeeds and bot source files remain unchanged.

## Negative Scenarios

1. Given unrelated packages have newer releases, when this fix is implemented, then their pins are not changed.
2. Given the dependency is updated, when the bot is verified, then no bot behavior changes are introduced.

## Requirements

- FR-001: Pin `cryptography` exactly to `50.0.0`.
- FR-002: Keep every other dependency pin unchanged.

## Success Criteria

- SC-001: Local preflight passes.
- SC-002: The PR's OSV Scan is green.
