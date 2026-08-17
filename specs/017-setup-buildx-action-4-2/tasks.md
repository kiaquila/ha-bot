# Tasks: Upgrade Docker Setup Buildx Action to 4.2.0

## Setup

- [x] T001 Confirm both affected workflow references.
- [x] T002 Review the v4.0.0 and v4.2.0 upstream release notes and action metadata.
- [x] T003 Create feature memory for the action update.

## Implementation

- [x] T004 Pin both Buildx setup steps to the v4.2.0 commit.
- [x] T005 Preserve default builder configuration, step order, and downstream behavior.

## Verification

- [x] T006 Run local preflight (`pnpm run preflight`).
- [x] T007 Confirm both workflows use supported GitHub-hosted runners and omit removed inputs.
- [ ] T008 Confirm the current-head Codex review has no unresolved findings.
- [ ] T009 Confirm all required GitHub checks pass.

## Process Memory

### Dead Ends

- The original Dependabot PR did not include feature memory, so PR Guard rejected the production workflow change.
- The first Codex review referenced a commit SHA that did not exist in the PR; GitHub commit inspection showed the assisted docs commit already had the required trailer.

### Decisions

- Keep the immutable Dependabot SHA in both workflows.
- Preserve action defaults because neither workflow configures setup-buildx inputs.
- Accept the Node 24 runtime because both jobs use GitHub-hosted `ubuntu-latest`.
- End every PR commit message with the Codex co-author trailer so the current-head review contract is unambiguous.

### Known Issues

- GitHub's Codex review must complete for the current PR head before merge.
