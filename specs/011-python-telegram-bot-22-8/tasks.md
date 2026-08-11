# Tasks: Upgrade Python Telegram Bot to 22.8

## Setup

- [x] T001 Confirm the Dependabot update and integrate the current `main` dependency pins.
- [x] T002 Review the application PTB API surface and 22.x removal risk.
- [x] T003 Create feature memory for the framework update.

## Implementation

- [x] T004 Pin `python-telegram-bot[job-queue]` to `22.8`.
- [x] T005 Preserve application behavior and unrelated dependency pins.

## Verification

- [x] T006 Run local preflight (`pnpm run preflight`).
- [x] T007 Install the updated requirements in a clean virtual environment and run the test suite with PTB 22.8.
- [ ] T008 Confirm the current-head Codex review has no unresolved findings.
- [ ] T009 Confirm all required GitHub checks pass.

## Process Memory

### Dead Ends

- The original Dependabot PR was based before the Requests and IDNA refresh, producing a requirements conflict when current `main` was integrated.

### Decisions

- Resolve the dependency conflict by retaining PTB 22.8 together with the already-merged Requests 2.34.2 and IDNA 3.18 pins.
- Avoid compatibility code because the bot does not use the APIs removed in PTB 22.x; verify this with an isolated installation instead.

### Known Issues

- GitHub's Codex review must complete for the current PR head before merge.
