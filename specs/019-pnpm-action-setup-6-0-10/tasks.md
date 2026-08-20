# Tasks: Upgrade pnpm Action Setup to 6.0.10

## Setup

- [x] T001 Confirm both affected action references across CI and deployment preflight.
- [x] T002 Review v6.0.0 and v6.0.10 documentation, release notes, runtime, inputs, and cache behavior.
- [x] T003 Create feature memory for the action update.

## Implementation

- [x] T004 Pin both pnpm setup steps to the v6.0.10 commit.
- [x] T005 Preserve action ordering, package-manager version selection, and cache ownership.

## Verification

- [x] T006 Run local preflight (`pnpm run preflight`).
- [x] T007 Confirm both pins and comments match v6.0.10 and no action inputs were added.
- [ ] T008 Confirm the current-head Codex review has no unresolved findings.
- [ ] T009 Confirm all required GitHub checks pass.

## Process Memory

### Dead Ends

- The original Dependabot PR omitted feature memory, so PR Guard rejected the production workflow change.
- The PR branch was based before PR #21 merged and required rebasing onto the new default-branch head.

### Decisions

- Keep the immutable upstream SHA in both locations.
- Keep `package.json` as the single pnpm version source and retain setup-node cache ownership.
- Accept the Node 24 runtime because both affected jobs use GitHub-hosted `ubuntu-latest`.
- Do not expand this dependency update into migration to the separately documented successor action.

### Known Issues

- GitHub's Codex review must complete for the current PR head before merge.
