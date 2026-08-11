# Tasks: Upgrade Docker Build and Push Action to 7.3.0

## Setup

- [x] T001 Confirm the action pin and affected production workflow.
- [x] T002 Review the v7.0.0 and v7.3.0 upstream release notes.
- [x] T003 Create feature memory for the action update.

## Implementation

- [x] T004 Pin `docker/build-push-action` to the v7.3.0 commit.
- [x] T005 Preserve every build input and production deployment behavior.

## Verification

- [x] T006 Run local preflight (`pnpm run preflight`).
- [x] T007 Confirm removed v7 summary environment variables are not used.
- [ ] T008 Confirm the current-head Codex review has no unresolved findings.
- [ ] T009 Confirm all required GitHub checks pass.

## Process Memory

### Dead Ends

- The original Dependabot PR omitted feature memory, so PR Guard correctly rejected the production workflow change.

### Decisions

- Keep the immutable Dependabot SHA rather than a mutable major-version tag.
- Accept the Node 24 action runtime because the workflow uses GitHub-hosted `ubuntu-latest`.
- Preserve all image build, cache, provenance, SBOM, and tagging inputs.

### Known Issues

- GitHub's Codex review must complete for the current PR head before merge.
