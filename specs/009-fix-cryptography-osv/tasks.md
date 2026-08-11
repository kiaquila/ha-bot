# Tasks: Fix Cryptography OSV Finding

## Setup

- [x] T001 Confirm the OSV finding and fixed version from the failed PR check.
- [x] T002 Create feature memory for the dependency change.

## Implementation

- [x] T003 Update only `cryptography` to `50.0.0`.
- [x] T004 Preserve all other dependency pins and bot source files.

## Verification

- [x] T005 Run local preflight (`pnpm run preflight`).
- [ ] T006 Confirm the PR OSV Scan and required checks pass.
- [ ] T007 Record final verification evidence and process memory.

## Process Memory

### Dead Ends

- The Dependabot configuration-only change exposed an existing OSV finding in the unchanged cryptography pin.

### Decisions

- Use the exact fixed version reported by OSV: `50.0.0`.
- Keep this PR limited to the Dependabot configuration and its necessary security unblocker.

### Known Issues

- GitHub's native Codex review must complete for the current PR head before merge.
