# Tasks: GitHub Actions Dependency Refresh

## Setup

- [x] T001 Confirm the PR head and grouped action changes.
- [x] T002 Identify the missing feature memory as the guard failure.
- [x] T003 Add complete feature memory for the protected workflow update.

## Implementation

- [x] T004 Retain the Dependabot-generated immutable action pins and existing workflow behavior.
- [x] T005 Keep application source, runtime dependencies, permissions, and schedules unchanged.

## Verification

- [x] T006 Run `pnpm run preflight`.
- [ ] T007 Confirm all required GitHub checks are green on the final head.
- [ ] T008 Confirm the current-head Codex review has no unresolved findings.

## Process Memory

### Decisions

- Keep the change limited to the three Dependabot action pins and the feature memory required by the protected production workflow path.
- Preserve existing action inputs, step ordering, scan arguments, workflow triggers, and permissions.

### Known Issues

- The original Dependabot PR omitted feature memory, so `guard` rejected the production workflow change.
- Final GitHub check and review evidence remains pending until the updated head is pushed and reviewed.
