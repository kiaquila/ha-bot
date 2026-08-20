# Spec: Upgrade pnpm Action Setup to 6.0.10

## Goal

Keep CI and production preflight pnpm installation on the current supported action release without changing the selected pnpm version, dependency installation, caching, or deployment behavior.

## Scope

In scope:

- Update both `pnpm/action-setup` references from v4.3.0 to v6.0.10 using the immutable upstream commit SHA.
- Preserve workflow order and the existing package-manager selection from `package.json`.
- Verify runtime, input, and cache compatibility and record repository evidence.

Out of scope:

- Changes to Node, pnpm, lockfile, dependency, cache, trigger, permission, or deployment versions and behavior.
- Migration to another pnpm setup action.

## User Story

As a maintainer, I want CI and deployment preflight to use a current pnpm setup action while continuing to install the repository-pinned pnpm version consistently.

## Acceptance Criteria

1. Given the CI and deployment workflows, when this change is applied, then both pnpm setup steps are pinned to v6.0.10 commit `0977fd99725f1db4007ccb2928dbb4e90d06cc86` and labelled `v6.0.10`.
2. Given neither step supplies a `version` input, when the action runs after checkout, then it reads `packageManager: pnpm@10.33.0` from `package.json` without a conflicting version source.
3. Given the action uses a Node 24 runtime, when both jobs run on GitHub-hosted `ubuntu-latest`, then the action executes on a supported runner.
4. Given `actions/setup-node` owns the existing `cache: pnpm` configuration, when the action is upgraded, then no additional action cache or installation behavior is enabled.
5. Given the updated PR head, when repository checks and Codex review complete, then all required gates pass with no unresolved findings.

## Negative Scenarios

1. Given pnpm version selection is repository-owned, when the diff is reviewed, then no workflow-level `version`, `run_install`, `cache`, `dest`, `standalone`, or `package_json_file` input is added.
2. Given production preflight shares the same setup contract as CI, when the update is applied, then workflow order and subsequent install commands remain unchanged.

## Requirements

- FR-001: Pin both pnpm setup steps to the exact v6.0.10 upstream commit.
- FR-002: Preserve `package.json` as the single pnpm version source.
- FR-003: Preserve existing workflow ordering, setup-node cache ownership, and install commands.

## Success Criteria

- SC-001: `pnpm run preflight` passes.
- SC-002: Required GitHub checks pass for the current head.
- SC-003: Thread-aware review inspection reports no unresolved finding.
