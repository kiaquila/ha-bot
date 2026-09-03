# Tasks: GitHub Actions Dependency Refresh

## Setup

- [x] T001 Confirm the PR head and grouped action changes.
- [x] T002 Add complete feature memory for the workflow update.

## Implementation

- [x] T003 Retain the grouped Dependabot action updates and immutable pins.
- [x] T004 Keep application source and runtime dependencies unchanged.

## Verification

- [x] T005 Run `pnpm run preflight`.
- [ ] T006 Confirm all required GitHub checks are green on the final head.
- [ ] T007 Confirm Codex review completed and all review threads are resolved.

## Process Memory

### Decisions

- The grouped action updates remain limited to their three workflow references.
- Complete feature memory is added because workflow paths are protected product paths.

### Known Issues

- None at implementation time; final GitHub evidence is recorded by the checks and review state.
