# Plan: Upgrade Python Telegram Bot to 22.8

## Summary

Keep the Dependabot-generated framework pin, integrate the already-merged dependency updates from `main`, and validate the unchanged application against a clean 22.8 installation.

## Technical Context

- runtime: Python Telegram worker
- dependency manifest: `requirements.txt`
- framework: `python-telegram-bot[job-queue]`
- application integration: `ApplicationBuilder`, handlers, filters, `JobQueue`, and `run_polling`
- data changes: none

## Scope Boundaries

- in scope: the 22.8 pin, compatibility inspection, isolated dependency installation, tests, and feature memory
- out of scope: application feature work, Bot API adoption, and unrelated package upgrades

## Constitution Check

- Spec-first: this folder records the major framework update and its evidence.
- Testable boundaries: existing tests plus an isolated 22.8 environment verify compatibility.
- Test-first bias: no behavior change is planned; regression verification is the relevant evidence.
- PR-only: work remains on the existing dependency PR branch and dedicated worktree.
- Simplicity: no compatibility shim is added unless verification demonstrates a need.
- Deployability: merge is allowed only after the protected checks and review pass.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | `requirements.txt` contains `python-telegram-bot[job-queue]==22.8` |
| AC-002 | A clean virtual environment installs `requirements.txt`, reports PTB 22.8, and passes `unittest` discovery |
| AC-003 | Source search confirms no 22.x-removed PTB API is used; existing handler and JobQueue tests pass |
| AC-004 | GitHub required checks pass and thread-aware review inspection shows no unresolved finding |

## Risks

- Version 22 removes functionality deprecated in 20.x. Mitigation: inspect the used API surface and execute the tests with the actual upgraded package.
- A transitive dependency may resolve differently in a clean install. Mitigation: install the full pinned requirements set and run OSV plus CI.
