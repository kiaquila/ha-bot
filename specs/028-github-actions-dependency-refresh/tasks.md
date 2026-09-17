# Tasks: GitHub Actions Dependency Refresh

## Setup

- [x] T001 Confirm the PR head and grouped action changes.
- [x] T002 Add complete feature memory for the protected workflow update.

## Implementation

- [x] T003 Retain the grouped Dependabot action updates and immutable pins.
- [x] T004 Keep application source, runtime dependencies, and workflow controls unchanged.

## Verification

- [x] T005 Run `pnpm run preflight` (58 tests passed locally).
- [ ] T006 Confirm all required GitHub checks are green on the final head.
- [ ] T007 Confirm Codex review completed and all review threads are resolved.

## Process Memory

### Decisions

- Keep both compatible minor action updates in the existing grouped Dependabot PR.
- Trigger Codex review from the maintainer account after pushing the final implementation head.

### Known Issues

- CI and deployment duplicate the same action pins without an automated parity check; both are aligned in this PR.
- QEMU retains its pre-existing floating default `tonistiigi/binfmt:latest`; changing that nested runtime is out of scope.
- Final GitHub check and review evidence is pending.
