# Plan: Python Dependency Refresh

## Summary

Keep the grouped Dependabot Python version pins intact, add feature memory, and validate the update with the repository's normal checks and review gate.

## Technical Context

- changed path: `requirements.txt`
- changed dependencies: `idna`, `python-dotenv`, `cryptography`
- application and data changes: none

## Scope Boundaries

- in scope: exact Python dependency pins, feature memory, local preflight, GitHub checks, and review evidence
- out of scope: bot source changes, package-management migration, lockfile introduction, and deployment changes

## Constitution Check

- Spec-first: complete feature memory accompanies the product dependency update.
- Testable boundaries: preflight and required GitHub checks validate the resulting installation and bot checks.
- PR-only: all changes remain on this Dependabot PR branch.
- Simplicity: no code path or dependency-management abstraction is added.
- Deployability: exact pins retain reproducible production installs.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Diff review of `requirements.txt` |
| AC-002 | Diff confirms bot and deployment files are unchanged |
| AC-003 | `pnpm run preflight` and final required GitHub checks |
| AC-004 | Current-head Codex review and zero unresolved threads |

## Risks

- An updated dependency may have an upstream compatibility regression; mitigate with exact pins, the existing test suite, OSV scan, and current-head review.
