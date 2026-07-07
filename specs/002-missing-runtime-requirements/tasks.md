# Tasks: Missing Runtime Requirements

## Setup

- [x] T001 Confirm active PR branch and isolated worktree for PR #2.
- [x] T002 Inspect GitHub check failures before changing feature memory.

## Implementation

- [x] T003 Keep the runtime dependency change limited to `requirements.txt`.
- [x] T004 Add complete feature memory under `specs/002-missing-runtime-requirements/`.

## Verification

- [x] T005 Run local preflight.
- [x] T006 Run an isolated dependency install/import check.
- [x] T007 Record GitHub required checks as final-head external merge evidence after push.
- [x] T008 Update tasks status and evidence before push.

## Process Memory

### Dead Ends

- The original PR head changed only `requirements.txt`; `guard` rejected it because product-code changes require a complete feature-memory folder in the same PR.
- The original `AI Review` run failed before review analysis because there was no trusted current-head AI review request marker for that head SHA.

### Decisions

- Use `python-telegram-bot[job-queue]==20.7` instead of pinning scheduler internals directly because the bot already depends on `python-telegram-bot==20.7` and the extra declares its supported job queue dependency set.
- Pin `python-dotenv` because `bot.py` imports `load_dotenv` during startup.
- Keep `bot.py` unchanged because the missing behavior is install metadata, not application logic.

### Known Issues

- GitHub required checks, including event-driven AI Review, must pass on the final pushed head before merge.
