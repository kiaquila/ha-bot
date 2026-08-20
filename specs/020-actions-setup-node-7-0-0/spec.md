# Spec: Upgrade Actions Setup Node to 7.0.0

## Goal

Keep CI and production preflight Node provisioning on the current supported setup action without changing the selected Node version, pnpm cache contract, package installation, or deployment behavior.

## Scope

In scope:

- Update both `actions/setup-node` references from v4.4.0 to v7.0.0 using the immutable upstream commit SHA.
- Preserve Node 20 selection, explicit pnpm caching, workflow order, and all existing inputs.
- Verify runtime, ESM, authentication, and cache compatibility and record repository evidence.

Out of scope:

- Changes to the project Node or pnpm versions, dependency files, registry authentication, workflow triggers, permissions, or deployment behavior.

## User Story

As a maintainer, I want CI and deployment preflight to use a current Node setup action while retaining the repository's existing Node 20 and pnpm cache behavior.

## Acceptance Criteria

1. Given the CI and deployment workflows, when this change is applied, then both setup-node steps are pinned to v7.0.0 commit `820762786026740c76f36085b0efc47a31fe5020` and labelled `v7.0.0`.
2. Given each step currently requests Node 20 and `cache: pnpm`, when the action is upgraded, then those inputs and the workflow ordering remain unchanged.
3. Given the action uses a Node 24 runtime, when both jobs run on GitHub-hosted `ubuntu-latest`, then the action itself executes on a supported runner while continuing to install Node 20 for subsequent steps.
4. Given v7 removes the dummy `NODE_AUTH_TOKEN` fallback, when the workflows are inspected, then compatibility is preserved because neither setup-node step configures `registry-url` or package publication authentication.
5. Given setup-node v5+ supports automatic npm cache detection, when these workflows explicitly select `cache: pnpm`, then their intended pnpm store cache remains explicit and unchanged.
6. Given the updated PR head, when repository checks and Codex review complete, then all required gates pass with no unresolved findings.

## Negative Scenarios

1. Given Node and cache choices are existing repository contracts, when the diff is reviewed, then no `node-version`, `cache`, `package-manager-cache`, `cache-dependency-path`, registry, token, mirror, or architecture input changes.
2. Given v7 migrates action internals to ESM, when the update is applied, then no repository scripts or module configuration are changed to accommodate an internal implementation detail.

## Requirements

- FR-001: Pin both setup-node steps to the exact v7.0.0 upstream commit.
- FR-002: Preserve Node 20 selection and explicit pnpm caching.
- FR-003: Preserve workflow ordering, authentication boundaries, and subsequent install commands.

## Success Criteria

- SC-001: `pnpm run preflight` passes.
- SC-002: Required GitHub checks pass for the current head.
- SC-003: Thread-aware review inspection reports no unresolved finding.
