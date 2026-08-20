# Spec: Upgrade Actions Checkout to 7.0.1

## Goal

Keep repository checkout steps on the supported Actions Checkout release without changing which code, history, or trusted policy files each workflow receives.

## Scope

In scope:

- Update all eleven `actions/checkout` references from v4.3.1 to v7.0.1 using the immutable upstream commit SHA.
- Preserve every existing checkout input and workflow trust boundary.
- Update the adjacent version comments and verify repository workflows.

Out of scope:

- Changes to workflow triggers, permissions, tokens, refs, checkout paths, fetch depth, or deployment behavior.
- Enabling checkout of untrusted fork code in privileged workflow contexts.

## User Story

As a maintainer, I want current checkout behavior across CI, policy, review, scanning, and deployment workflows so repository access remains supported and consistently pinned.

## Acceptance Criteria

1. Given the seven affected workflows, when this change is applied, then all eleven checkout steps are pinned to v7.0.1 commit `3d3c42e5aac5ba805825da76410c181273ba90b1` and labelled `v7.0.1`.
2. Given existing specialized checkouts, when the diff is reviewed, then every `ref`, `path`, and `fetch-depth` input remains unchanged.
3. Given v7 uses Node 24, when each workflow runs on GitHub-hosted `ubuntu-latest`, then checkout executes on a runner satisfying the v2.327.1 minimum.
4. Given v6 stores persisted credentials under the runner temporary directory, when the workflows run, then their existing authenticated git behavior remains within supported checkout semantics.
5. Given v7 protects `pull_request_target` and `workflow_run` from unsafe fork checkout, when repository workflows are inspected, then none opts into `allow-unsafe-pr-checkout` or changes its event trust boundary.
6. Given the updated PR head, when repository checks and Codex review complete, then all required gates pass with no unresolved findings.

## Negative Scenarios

1. Given checkout controls trusted policy and deployment code, when the diff is reviewed, then no token, permission, ref, path, clean, history, or submodule setting changes.
2. Given the action appears eleven times, when the change is applied, then no reference or version comment remains on v4.3.1/v4.

## Requirements

- FR-001: Pin all checkout steps to the exact v7.0.1 upstream commit.
- FR-002: Preserve all explicit checkout inputs and workflow ordering.
- FR-003: Preserve existing trusted/untrusted code boundaries and do not enable unsafe PR checkout.

## Success Criteria

- SC-001: `pnpm run preflight` passes.
- SC-002: Required GitHub checks pass for the current head.
- SC-003: Thread-aware review inspection reports no unresolved finding.
