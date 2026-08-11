# Tasks: Upgrade Docker Login Action to 4.6.0

## Setup

- [x] T001 Confirm the affected production workflow reference.
- [x] T002 Review the v4.0.0 and v4.6.0 upstream release notes and action metadata.
- [x] T003 Create feature memory for the action update.

## Implementation

- [x] T004 Pin the login step to the v4.6.0 commit.
- [x] T005 Preserve GHCR inputs, job permissions, step order, and logout behavior.

## Verification

- [x] T006 Run local preflight (`pnpm run preflight`).
- [x] T007 Confirm the workflow uses a supported GitHub-hosted runner.
- [ ] T008 Confirm the current-head Codex review has no unresolved findings.
- [ ] T009 Confirm all required GitHub checks pass.

## Process Memory

### Dead Ends

- GitHub's update-branch API cannot update workflow-changing PRs with the active OAuth token because it lacks `workflow` scope; authenticated git over SSH is used instead.
- The original Dependabot PR omitted feature memory, so PR Guard rejected the production workflow change.

### Decisions

- Keep the immutable Dependabot SHA in the production workflow.
- Preserve the existing GHCR inputs because v4.6.0 continues to declare them unchanged.
- Accept the Node 24 runtime because the job uses GitHub-hosted `ubuntu-latest`.

### Known Issues

- GitHub's Codex review must complete for the current PR head before merge.
