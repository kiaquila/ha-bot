# Plan: Secure Python Dependencies

## Summary

Update only the vulnerable dependency pins reported by OSV and keep bot source code unchanged.

## Technical Context

- runtime: Python Telegram worker
- dependencies: `requests`, `idna`
- product paths: `requirements.txt`
- data changes: none

## Scope Boundaries

- in scope: dependency pin updates and feature-memory evidence
- out of scope: bot behavior, deployment command, user state model, API payloads

## Constitution Check

- Spec-first: complete feature memory is included with the product-path change.
- Testable boundaries: dependency update is validated by preflight and OSV.
- PR-only: changes remain on the PR branch.
- Simplicity: no new abstraction is introduced.
- Deployability: patched dependency pins should keep the worker installable.

## Complexity Tracking

No new abstraction or workflow complexity is introduced by the dependency pin change.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | GitHub `osv-scan` after updated pins |
| AC-002 | `pnpm run preflight` with complete `spec.md`, `plan.md`, and `tasks.md` |

Negative scenario evidence:

- `git diff` confirms `bot.py` is not changed by the dependency update.

## Risks

- New package versions may be unavailable in an older package index; mitigate by using the fixed versions reported directly by OSV.
