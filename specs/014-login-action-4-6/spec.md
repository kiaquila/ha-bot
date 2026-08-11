# Spec: Upgrade Docker Login Action to 4.6.0

## Goal

Keep production authentication to GitHub Container Registry on the supported Docker Login action without changing credentials, registry selection, or deployment behavior.

## Scope

In scope:

- Update `docker/login-action` from v3.7.0 to v4.6.0 using the immutable upstream commit SHA.
- Verify the existing GHCR inputs remain supported and unchanged.
- Verify production workflow and deployment tests.

Out of scope:

- Changes to registry credentials, token permissions, image naming, build settings, or deployment execution.
- Additional registries or authentication methods.

## User Story

As a maintainer, I want the production registry login step on a supported action release so image publication remains secure and maintainable.

## Acceptance Criteria

1. Given the production workflow, when this change is applied, then the login step is pinned to v4.6.0 commit `dbcb813823bdd20940b903addbd779551569679f`.
2. Given the existing GHCR authentication contract, when the workflow is inspected, then `registry`, `username`, and `password` inputs remain unchanged and supported by v4.6.0.
3. Given v4's Node 24 runtime requirement, when the job runs on GitHub-hosted `ubuntu-latest`, then the action executes on a supported runner.
4. Given the updated PR head, when repository checks and Codex review complete, then all required gates pass with no unresolved findings.

## Negative Scenarios

1. Given this is an action update, when the diff is reviewed, then no secret expression, token permission, registry, image tag, build, or deployment setting changes.
2. Given login cleanup remains enabled by default, when the action completes, then the workflow does not override logout behavior.

## Requirements

- FR-001: Pin the production login step to the exact v4.6.0 upstream commit.
- FR-002: Preserve all existing GHCR input expressions and job permissions.
- FR-003: Preserve the login step's position before image build and push.

## Success Criteria

- SC-001: `pnpm run preflight` passes.
- SC-002: Required GitHub checks pass for the current head.
- SC-003: Thread-aware review inspection reports no unresolved finding.
