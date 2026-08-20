# Tasks: Upgrade Actions Checkout to 7.0.1

## Setup

- [x] T001 Confirm all eleven affected checkout references across seven workflows.
- [x] T002 Review v5, v6, v7.0.0, and v7.0.1 documentation and release notes.
- [x] T003 Create feature memory for the action update.

## Implementation

- [x] T004 Pin all checkout steps to the v7.0.1 commit.
- [x] T005 Correct all adjacent version comments to `v7.0.1` while preserving checkout inputs and workflow order.

## Verification

- [x] T006 Run local preflight (`pnpm run preflight`).
- [x] T007 Confirm all jobs use GitHub-hosted runners and no workflow enables unsafe PR checkout.
- [ ] T008 Confirm the current-head Codex review has no unresolved findings.
- [ ] T009 Confirm all required GitHub checks pass.

## Process Memory

### Dead Ends

- The original Dependabot PR omitted feature memory, so PR Guard rejected the production workflow change.
- Dependabot updated the immutable SHA but left all adjacent version comments at `v4`, which would make manual audits misleading.

### Decisions

- Keep the immutable upstream SHA in all eleven locations.
- Preserve every checkout input and trust boundary exactly.
- Accept the Node 24 runtime because every affected job uses GitHub-hosted `ubuntu-latest`.
- Keep the v7 unsafe-fork protection enabled by omitting `allow-unsafe-pr-checkout`.

### Known Issues

- GitHub's Codex review must complete for the current PR head before merge.
