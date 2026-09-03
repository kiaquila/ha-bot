# Tasks: Python Dependency Refresh

## Setup

- [x] T001 Confirm the PR head and grouped dependency changes.
- [x] T002 Add complete feature memory for the dependency update.

## Implementation

- [x] T003 Retain the requested exact pins in `requirements.txt`.
- [x] T004 Keep application and deployment source unchanged.

## Verification

- [x] T005 Run `pnpm run preflight`.
- [ ] T006 Confirm all required GitHub checks are green on the final head.
- [ ] T007 Confirm Codex review completed and all review threads are resolved.

## Process Memory

### Decisions

- The update retains Dependabot's three direct dependency pins exactly.
- Complete feature memory is included because `requirements.txt` is a product path.

### Known Issues

- None at implementation time; final evidence is provided by GitHub checks and review state.
