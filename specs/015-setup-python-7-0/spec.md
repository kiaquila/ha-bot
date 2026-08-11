# Spec: Upgrade Setup Python Action to 7.0.0

## Goal

Keep CI and production validation on the supported Setup Python action without changing the selected Python version, dependency cache, or workflow behavior.

## Scope

In scope:

- Update both `actions/setup-python` references from v5.6.0 to v7.0.0 using the immutable upstream commit SHA.
- Verify the existing Python 3.12 and pip-cache inputs remain supported and unchanged.
- Verify workflow and deployment tests.

Out of scope:

- Changes to Python, pip, or dependency versions.
- Changes to cache selection, dependency installation, test execution, or deployment execution.

## User Story

As a maintainer, I want current Python setup in validation workflows so toolchain provisioning remains supported and consistent.

## Acceptance Criteria

1. Given the CI and production workflows, when this change is applied, then both setup steps are pinned to v7.0.0 commit `5fda3b95a4ea91299a34e894583c3862153e4b97`.
2. Given the existing toolchain contract, when each workflow is inspected, then `python-version: "3.12"` and `cache: "pip"` remain unchanged and supported by v7.0.0.
3. Given v6's Node 24 runtime requirement, when the workflows run on GitHub-hosted `ubuntu-latest`, then the v7 action executes on a supported runner.
4. Given v7 removes the temporary `pip-install` input, when both workflows are inspected, then neither relies on that input.
5. Given the updated PR head, when repository checks and Codex review complete, then all required gates pass with no unresolved findings.

## Negative Scenarios

1. Given this is an action update, when the diff is reviewed, then no Python version, cache mode, requirements file, install command, or deployment setting changes.
2. Given the action is referenced twice, when the change is applied, then neither workflow is left on the old action version.

## Requirements

- FR-001: Pin both Python setup steps to the exact v7.0.0 upstream commit.
- FR-002: Preserve the Python 3.12 selection and pip cache configuration.
- FR-003: Preserve all downstream validation and deployment behavior.

## Success Criteria

- SC-001: `pnpm run preflight` passes.
- SC-002: Required GitHub checks pass for the current head.
- SC-003: Thread-aware review inspection reports no unresolved finding.
