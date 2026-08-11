# Spec: Upgrade Docker Build and Push Action to 7.3.0

## Goal

Keep the production image build workflow on the supported Docker Build and Push action while preserving the immutable ARM64 image contract.

## Scope

In scope:

- Update `docker/build-push-action` from v6.19.2 to v7.3.0 using the immutable upstream commit SHA.
- Verify the existing build inputs remain supported.
- Verify the repository workflow and deployment tests.

Out of scope:

- Changes to the Dockerfile, image contents, registry, tags, cache policy, provenance, SBOM, or deployment cutover.
- Running a production deployment solely for this dependency update.

## User Story

As a maintainer, I want the image build action current so production builds receive supported action runtime and dependency updates without changing the artifact contract.

## Acceptance Criteria

1. Given the production workflow, when this change is applied, then `docker/build-push-action` is pinned to the v7.3.0 commit `53b7df96c91f9c12dcc8a07bcb9ccacbed38856a`.
2. Given the existing build step, when compatibility is inspected, then its context, ARM64 platform, push, immutable tag, labels, cache, provenance, and SBOM inputs remain unchanged.
3. Given v7's Node 24 runtime requirement, when the workflow runs on GitHub-hosted `ubuntu-latest`, then the action executes on a supported runner.
4. Given the updated PR head, when repository checks and Codex review complete, then all required gates pass with no unresolved findings.

## Negative Scenarios

1. Given v7 removes deprecated `DOCKER_BUILD_NO_SUMMARY` and `DOCKER_BUILD_EXPORT_RETENTION_DAYS`, when the workflow is inspected, then neither removed variable is used.
2. Given this is an action-only update, when the diff is reviewed, then image semantics and deployment commands are unchanged.

## Requirements

- FR-001: Pin the action to the exact v7.3.0 upstream commit.
- FR-002: Preserve all existing build inputs and outputs.
- FR-003: Do not introduce removed v7 environment variables or production behavior changes.

## Success Criteria

- SC-001: `pnpm run preflight` passes.
- SC-002: `guard`, `baseline-checks`, `osv-scan`, and `AI Review` pass for the current head.
- SC-003: Thread-aware review inspection reports no unresolved finding.
