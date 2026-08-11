# Plan: Refresh Minor and Patch Dependencies

## Summary

Accept the Dependabot-generated Requests and IDNA pin updates, add the required feature memory, and validate the unchanged bot against the existing repository gates.

## Technical Context

- runtime: Python Telegram worker
- dependency manifest: `requirements.txt`
- affected dependencies: `requests`, `idna`
- data changes: none

## Scope Boundaries

- in scope: the two generated dependency pin updates and their verification evidence
- out of scope: application code, deployment behavior, and unrelated dependency changes

## Constitution Check

- Spec-first: this folder records the maintenance goal and acceptance evidence.
- Testable boundaries: the existing preflight and GitHub checks verify the change.
- PR-only: all work remains on the existing dependency PR branch.
- Simplicity: no abstraction or runtime behavior is added.
- Deployability: the default branch remains deployable after all required checks pass.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | `requirements.txt` contains `requests==2.34.2` and `idna==3.18` |
| AC-002 | `pnpm run preflight` and all required GitHub checks pass for the current head |
| AC-003 | The PR diff contains only the two dependency pins and this feature-memory folder |

## Risks

- Requests introduces inline typing and IDNA raises its Python minimum to 3.9; mitigate with the repository's configured Python runtime checks and CI.

