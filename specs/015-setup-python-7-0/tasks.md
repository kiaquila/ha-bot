# Tasks: Upgrade Setup Python Action to 7.0.0

## Setup

- [x] T001 Confirm both affected workflow references.
- [x] T002 Review the v6.0.0 and v7.0.0 upstream release notes, documentation, and action metadata.
- [x] T003 Create feature memory for the action update.

## Implementation

- [x] T004 Pin both Python setup steps to the v7.0.0 commit.
- [x] T005 Preserve Python version, pip cache, step order, and downstream behavior.

## Verification

- [x] T006 Run local preflight (`pnpm run preflight`).
- [x] T007 Confirm both workflows use supported GitHub-hosted runners and omit the removed `pip-install` input.
- [ ] T008 Confirm the current-head Codex review has no unresolved findings.
- [ ] T009 Confirm all required GitHub checks pass.

## Process Memory

### Dead Ends

- GitHub's update-branch API cannot update workflow-changing PRs with the active OAuth token because it lacks `workflow` scope; authenticated git over SSH is used instead.
- The original Dependabot PR omitted feature memory, so PR Guard rejected the production workflow change.

### Decisions

- Keep the immutable Dependabot SHA in both workflows.
- Preserve Python 3.12 and pip caching because v7 retains both inputs without behavioral migration requirements.
- Accept the Node 24 runtime because both jobs use GitHub-hosted `ubuntu-latest`.

### Known Issues

- GitHub's Codex review must complete for the current PR head before merge.
