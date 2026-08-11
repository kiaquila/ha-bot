# Plan: Fix Cryptography OSV Finding

## Summary

Update only the vulnerable cryptography pin identified by OSV and retain the Dependabot configuration change already present in this PR.

## Technical Context

- runtime: Python Telegram worker
- dependency manifest: `requirements.txt`
- affected dependency: `cryptography`
- data changes: none

## Scope Boundaries

- in scope: the exact cryptography pin and feature-memory evidence
- out of scope: bot code, other package upgrades, workflow behavior, and deployment changes

## Constitution Check

- Spec-first: this folder records the dependency change and verification plan.
- Testable boundaries: verification uses the existing preflight and OSV Scan checks.
- PR-only: the fix remains on the existing PR branch.
- Simplicity: no new abstraction or runtime behavior is introduced.
- Deployability: the fixed pin resolves the OSV finding blocking the protected branch.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | `git diff` shows only the cryptography pin change in `requirements.txt` |
| AC-002 | GitHub OSV Scan passes for the PR head |
| AC-003 | `pnpm run preflight` passes and no bot source diff is present |

## Risks

- A major cryptography release may have environment compatibility implications; mitigate by running the repository's preflight and CI checks before merge.
