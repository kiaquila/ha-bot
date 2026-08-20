# Spec: Upgrade Docker Setup Buildx Action to 4.2.0

## Goal

Keep both CI and production image workflows on the supported Docker Setup Buildx action without changing builder configuration or container behavior.

## Scope

In scope:

- Update both `docker/setup-buildx-action` references from v3.12.0 to v4.2.0 using the immutable upstream commit SHA.
- Verify the workflows continue to rely only on supported default inputs.
- Verify repository and production-workflow checks.

Out of scope:

- Changes to Buildx, BuildKit, Docker, image, registry, cache, or deployment configuration.
- Running a production deployment solely for this dependency update.

## User Story

As a maintainer, I want current Buildx setup in validation and deployment workflows so container builds receive supported action runtime and dependency updates without changing the build contract.

## Acceptance Criteria

1. Given the CI and production workflows, when this change is applied, then both setup steps are pinned to v4.2.0 commit `bb05f3f5519dd87d3ba754cc423b652a5edd6d2c`.
2. Given the existing builder contract, when both setup steps are inspected, then they continue to use the action defaults without a `with` block.
3. Given v4 uses the Node 24 action runtime, when both workflows run on GitHub-hosted `ubuntu-latest`, then the action executes on a supported runner.
4. Given v4 removes the deprecated `config`, `config-inline`, and `install` inputs, when both workflows are inspected, then none of those inputs is used.
5. Given the updated PR head, when repository checks and Codex review complete, then all required gates pass with no unresolved findings.

## Negative Scenarios

1. Given this is an action-only update, when the diff is reviewed, then no builder driver, platform, BuildKit flag, cache, image, or deployment behavior changes.
2. Given the action is referenced twice, when the change is applied, then neither workflow remains on v3.12.0.

## Requirements

- FR-001: Pin both Buildx setup steps to the exact v4.2.0 upstream commit.
- FR-002: Preserve the default builder configuration and all downstream workflow steps.
- FR-003: Do not introduce removed v3 inputs or production behavior changes.

## Success Criteria

- SC-001: `pnpm run preflight` passes.
- SC-002: Required GitHub checks pass for the current head.
- SC-003: Thread-aware review inspection reports no unresolved finding.
