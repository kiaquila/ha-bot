# Spec: Upgrade Docker Setup QEMU Action to 4.2.0

## Goal

Keep CI and production ARM64 build preparation on the supported Docker Setup QEMU action without changing the build or deployment contract.

## Scope

In scope:

- Update both `docker/setup-qemu-action` references from v3.7.0 to v4.2.0 using the immutable upstream commit SHA.
- Verify the action remains ordered before Docker Buildx in CI and production.
- Verify workflow and deployment tests.

Out of scope:

- Changes to build platforms, emulators, Buildx configuration, image contents, or deployment execution.
- New action inputs or custom QEMU images.

## User Story

As a maintainer, I want current QEMU setup in both validation and deployment so ARM64 image builds remain supported and consistent.

## Acceptance Criteria

1. Given the CI and production workflows, when this change is applied, then both QEMU steps are pinned to v4.2.0 commit `96fe6ef7f33517b61c61be40b68a1882f3264fb8`.
2. Given the existing workflow order, when each job is inspected, then QEMU setup still runs before Buildx and no inputs or downstream build settings change.
3. Given v4's Node 24 runtime requirement, when the workflows run on GitHub-hosted `ubuntu-latest`, then the action executes on a supported runner.
4. Given the updated PR head, when repository checks and Codex review complete, then all required gates pass with no unresolved findings.

## Negative Scenarios

1. Given this is an action update, when the diff is reviewed, then no build platform, image tag, cache, provenance, SBOM, or deployment setting changes.
2. Given QEMU appears in two workflows, when the change is applied, then neither workflow is left on the old action version.

## Requirements

- FR-001: Pin both QEMU setup steps to the exact v4.2.0 upstream commit.
- FR-002: Preserve step order and the default QEMU configuration.
- FR-003: Preserve all downstream CI and deployment behavior.

## Success Criteria

- SC-001: `pnpm run preflight` passes.
- SC-002: Required GitHub checks pass for the current head.
- SC-003: Thread-aware review inspection reports no unresolved finding.
