# Spec: Missing Runtime Requirements

## Goal

Make clean bot deployments install the runtime packages that the current worker imports and uses.

## Scope

In scope:

- `requirements.txt` runtime dependency metadata for the Telegram worker.
- The `python-telegram-bot` job queue extra required by scheduled polling.
- The `python-dotenv` package imported during startup.
- Verification through local preflight and an isolated dependency install/import check.

Out of scope:

- Bot command behavior, polling logic, and Hospital Aleman request handling.
- Dependency upgrades unrelated to the missing runtime packages.
- Secrets, environment values, patient data, private URLs, or deployment-specific paths.

## User Stories

### User Story 1

As a maintainer, I want a clean install from `requirements.txt` to include the packages the bot imports and schedules with, so that redeploying to a fresh host does not depend on manual package installs.

## Acceptance Criteria

1. Given a clean Python environment, when dependencies are installed from `requirements.txt`, then `dotenv` can be imported and `python-telegram-bot` includes job queue support.
2. Given `requirements.txt` changes as a product path, when PR guardrails run, then the PR includes one complete `specs/<feature-id>/` folder with `spec.md`, `plan.md`, and `tasks.md`.
3. Given the bot source imports `dotenv` and calls `app.job_queue.run_repeating`, when local checks run, then the bot source remains syntactically valid without changing bot logic.

## Negative Scenarios

1. Given a runtime dependency fix could accidentally change bot behavior, when the PR diff is reviewed, then `bot.py` remains unchanged.
2. Given dotenv relates to environment loading, when documentation or specs are added, then no secrets, bearer tokens, patient identifiers, private URLs, or personal paths are introduced.

## Requirements

- FR-001: Pin `python-dotenv` in `requirements.txt` because `bot.py` imports `load_dotenv` at startup.
- FR-002: Keep `python-telegram-bot` at version `20.7` while installing its `job-queue` extra so `Application.job_queue` is available.
- FR-003: Preserve existing unrelated runtime pins unless a verification command proves they block installation.
- FR-004: Keep bot source code unchanged for this dependency metadata fix.

## Success Criteria

- SC-001: `pnpm run preflight` passes locally on the PR branch.
- SC-002: An isolated clean-environment dependency install/import check passes for `dotenv` and Telegram job queue support.
- SC-003: GitHub required checks for `baseline-checks`, `guard`, and `AI Review` pass on the PR head.

## Assumptions

- The current bot logic is correct and only the declared runtime requirements are incomplete.
- The `python-telegram-bot[job-queue]==20.7` extra is the intended way to include the scheduler dependency for the pinned Telegram package.
