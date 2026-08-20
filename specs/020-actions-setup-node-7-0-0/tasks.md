# Tasks: Upgrade Actions Setup Node to 7.0.0

## Setup

- [x] T001 Confirm both affected setup-node references across CI and deployment preflight.
- [x] T002 Review v5 and v7 documentation, v7.0.0 release notes, runtime, ESM, authentication, inputs, and cache behavior.
- [x] T003 Create feature memory for the action update.

## Implementation

- [x] T004 Pin both setup-node steps to the v7.0.0 commit.
- [x] T005 Preserve Node 20 selection, explicit pnpm caching, workflow ordering, and authentication boundaries.

## Verification

- [x] T006 Run local preflight (`pnpm run preflight`).
- [x] T007 Confirm both pins and comments match v7.0.0 and all existing inputs remain unchanged.
- [ ] T008 Confirm the current-head Codex review has no unresolved findings.
- [ ] T009 Confirm all required GitHub checks pass.

## Process Memory

### Dead Ends

- The original Dependabot PR omitted feature memory, so PR Guard rejected the production workflow change.
- The PR branch was based before PR #22 merged and required rebasing onto the new default-branch head.

### Decisions

- Keep the immutable upstream SHA in both locations.
- Keep Node 20 and explicit pnpm caching unchanged.
- Accept the Node 24 action runtime because both affected jobs use GitHub-hosted `ubuntu-latest`.
- Treat the ESM migration as action-internal and avoid unrelated repository module changes.
- Make no authentication change because the affected workflows do not configure package registries.

### Known Issues

- GitHub's Codex review must complete for the current PR head before merge.
