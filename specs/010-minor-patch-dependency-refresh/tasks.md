# Tasks: Refresh Minor and Patch Dependencies

## Setup

- [x] T001 Confirm the generated dependency versions and PR scope.
- [x] T002 Create feature memory for the maintenance change.

## Implementation

- [x] T003 Pin Requests to `2.34.2`.
- [x] T004 Pin IDNA to `3.18`.
- [x] T005 Preserve all unrelated dependency pins and application files.

## Verification

- [x] T006 Run local preflight (`pnpm run preflight`).
- [ ] T007 Confirm the current-head Codex review has no unresolved findings.
- [ ] T008 Confirm all required GitHub checks pass.

## Process Memory

### Dead Ends

- The original Dependabot PR omitted feature memory, so PR Guard correctly rejected the product-path change.

### Decisions

- Keep both generated minor-and-patch updates together as Dependabot grouped them.
- Add documentation only; do not change runtime code to consume new APIs.

### Known Issues

- GitHub's Codex review must complete for the current PR head before merge.
