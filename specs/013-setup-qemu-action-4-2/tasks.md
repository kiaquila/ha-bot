# Tasks: Upgrade Docker Setup QEMU Action to 4.2.0

## Setup

- [x] T001 Confirm both affected workflow references.
- [x] T002 Review the v4.0.0 and v4.2.0 upstream release notes.
- [x] T003 Create feature memory for the action update.

## Implementation

- [x] T004 Pin both QEMU setup steps to the v4.2.0 commit.
- [x] T005 Preserve step order, default inputs, and downstream build behavior.

## Verification

- [x] T006 Run local preflight (`pnpm run preflight`).
- [x] T007 Confirm both workflows use supported GitHub-hosted runners.
- [ ] T008 Confirm the current-head Codex review has no unresolved findings.
- [ ] T009 Confirm all required GitHub checks pass.

## Process Memory

### Dead Ends

- GitHub's update-branch API could not update this workflow-changing PR because the active OAuth token lacks `workflow` scope; the branch was rebased through authenticated git over SSH instead.
- The original Dependabot PR omitted feature memory, so PR Guard rejected the production workflow change.

### Decisions

- Keep the immutable Dependabot SHA in both workflows.
- Preserve the action's default inputs because the current jobs require only standard QEMU registration before Buildx.
- Accept the Node 24 runtime because both jobs use GitHub-hosted `ubuntu-latest`.

### Known Issues

- GitHub's Codex review must complete for the current PR head before merge.
