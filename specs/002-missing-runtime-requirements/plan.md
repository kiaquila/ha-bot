# Plan: Missing Runtime Requirements

## Summary

Complete the existing runtime dependency metadata fix by documenting the product-path change and verifying that clean installs include both dotenv and Telegram job queue support.

## Technical Context

- runtime: Python Telegram worker
- dependencies: `python-telegram-bot[job-queue]`, `python-dotenv`
- product paths: `requirements.txt`
- data changes: none

## Scope Boundaries

- in scope: dependency declaration and feature-memory evidence for the PR
- out of scope: bot command behavior, handler logic, appointment polling semantics, deployment secrets

## Constitution Check

- Spec-first: this PR includes complete feature memory for the `requirements.txt` product-path change.
- Testable boundaries: dependency availability is verified in an isolated clean Python environment.
- PR-only: changes remain on the `fix/missing-runtime-requirements` PR branch.
- Simplicity: no new abstraction, runtime wrapper, or dependency management tool is introduced.
- Deployability: clean installs should include the packages required by current startup and polling code.

## Complexity Tracking

No new abstraction or workflow complexity is introduced. The change updates package metadata and records evidence for the existing PR guardrails.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Isolated temporary venv installed `requirements.txt` and imported `python-dotenv 1.2.2`, `telegram 20.7`, `telegram.ext.JobQueue`, and `apscheduler 3.10.4`. |
| AC-002 | `pnpm run preflight` passed locally with complete `specs/002-missing-runtime-requirements/{spec,plan,tasks}.md`; GitHub `guard` is the linked final-head evidence after push. |
| AC-003 | `pnpm run preflight` passed, including `python3 -m py_compile bot.py`; `git diff --exit-code origin/main...HEAD -- bot.py` passed. |

Negative scenario evidence:

- `git diff --exit-code origin/main...HEAD -- bot.py` confirms bot logic is not changed by the dependency metadata fix.
- A secret-like value scan over `specs/002-missing-runtime-requirements` completed with no matches for credential-shaped values, personal paths, or URLs.

## Risks

- Package index availability may differ from local caches; mitigate by using a fresh virtual environment and installing from `requirements.txt`.
- AI Review is event-driven; after the final commit, a trusted current-head review request and accepted review evidence must be present for the `AI Review` required check to pass.
