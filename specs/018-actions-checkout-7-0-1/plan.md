# Plan: Upgrade Actions Checkout to 7.0.1

## Summary

Retain the Dependabot-generated immutable v7.0.1 pins, correct adjacent version comments, document runtime and security boundaries, and verify all existing checkout configurations remain unchanged.

## Technical Context

- workflows: seven files under `.github/workflows/`
- checkout references: eleven
- old version: v4.3.1
- new version: v7.0.1
- runtime boundary: Node 24, Actions Runner v2.327.1 or later
- credential boundary: v6 stores persisted credentials under `$RUNNER_TEMP`; Docker container actions need runner v2.329.0 or later for authenticated git
- v7 security boundary: unsafe fork checkout is blocked by default for `pull_request_target` and `workflow_run`
- data changes: none

## Scope Boundaries

- in scope: immutable pins, accurate version comments, release-note/input compatibility review, workflow checks, and feature memory
- out of scope: trigger, permission, token, checkout-input, source-code, and deployment changes

## Constitution Check

- Spec-first: this folder records the production and control-plane workflow dependency change.
- Testable boundaries: repository preflight and protected GitHub checks validate the unchanged workflow contracts.
- Test-first bias: no new behavior is introduced; regression verification is the relevant evidence.
- PR-only: work remains on the existing dependency PR branch and dedicated worktree.
- Simplicity: the update changes immutable references and their adjacent comments without adding abstraction.
- Deployability: merge is gated on protected checks and current-head review.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Search reports eleven exact v7.0.1 SHA pins and eleven `v7.0.1` comments |
| AC-002 | Workflow diff shows all existing `ref`, `path`, and `fetch-depth` blocks unchanged |
| AC-003 | Every affected job uses GitHub-hosted `ubuntu-latest` |
| AC-004 | No workflow changes authenticated git commands or credential inputs |
| AC-005 | Search reports no `allow-unsafe-pr-checkout`, `pull_request_target`, or `workflow_run` addition |
| AC-006 | Required GitHub checks pass and all review threads are resolved |

## Risks

- Older self-hosted runners cannot execute the Node 24 action runtime. All active checkout jobs use GitHub-hosted runners.
- Checkout controls both PR content and trusted default-branch policy scripts. Preserving each explicit ref and path is required to avoid weakening the review gate.
- v7 tightens fork handling. The repository does not opt into unsafe privileged checkout, so the safer default is compatible with current triggers.
