# Spec: Upgrade Python Telegram Bot to 22.8

## Goal

Upgrade the Telegram framework to its current 22.8 release while preserving the bot's handlers, scheduled polling, and health-check behavior.

## Scope

In scope:

- Update `python-telegram-bot[job-queue]` from `20.7` to `22.8`.
- Verify imports, handler registration, JobQueue scheduling, and the existing test suite against the upgraded dependency.
- Retain the dependency refreshes already merged into `main`.

Out of scope:

- New Telegram commands, Bot API features, or user-facing behavior.
- Changes to Hospital Aleman polling and persistence logic.
- Unrelated dependency updates.

## User Story

As a maintainer, I want the bot to run on Python Telegram Bot 22.8 so it remains current without regressing command handling or scheduled work.

## Acceptance Criteria

1. Given the runtime requirements, when this change is applied, then `python-telegram-bot[job-queue]` is pinned exactly to `22.8`.
2. Given a clean environment installed from the updated requirements, when the repository's Python tests run, then they all pass with Python Telegram Bot 22.8 imported.
3. Given the existing bot startup path, when compatibility is inspected, then the used builder, handler, filter, polling, and JobQueue APIs are available in 22.8 without application-code changes.
4. Given the updated PR head, when required GitHub checks and Codex review complete, then they pass with no unresolved blocking findings.

## Negative Scenarios

1. Given 22.x removes APIs deprecated in 20.x, when the bot is checked, then no removed API is referenced by the application.
2. Given the framework update, when the diff is reviewed, then no new command, polling behavior, or unrelated pin change is introduced.

## Requirements

- FR-001: Pin `python-telegram-bot[job-queue]` exactly to `22.8`.
- FR-002: Preserve existing command, callback, message, polling, and health-check scheduling behavior.
- FR-003: Verify the test suite in an environment that actually imports version 22.8.

## Success Criteria

- SC-001: `pnpm run preflight` passes.
- SC-002: The isolated 22.8 environment reports the expected package version and passes all tests.
- SC-003: Every required PR check is green and review threads are resolved.
