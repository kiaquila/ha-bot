# Plan: Upgrade Actions Setup Node to 7.0.0

## Summary

Retain the Dependabot-generated immutable v7.0.0 pins, document runtime and cache boundaries, and verify that CI and production preflight preserve their Node 20 and pnpm cache contracts.

## Technical Context

- workflows: `.github/workflows/ci.yml` and `.github/workflows/deploy-production.yml`
- action references: two
- old version: v4.4.0
- new version: v7.0.0
- installed toolchain: Node 20 for subsequent workflow steps
- action runtime: Node 24, requiring Actions Runner v2.327.1 or later
- cache boundary: explicit `cache: pnpm`, backed by repository lockfile and pnpm 10.33.0
- v7 internals: ESM migration with no input/output behavior change
- v7 authentication boundary: dummy `NODE_AUTH_TOKEN` fallback removed; no affected workflow configures `registry-url`
- data changes: none

## Scope Boundaries

- in scope: immutable pins, release-note/input compatibility review, workflow checks, and feature memory
- out of scope: Node or pnpm upgrades, registry publishing, lockfile changes, triggers, permissions, dependency installation, and deployment behavior

## Constitution Check

- Spec-first: this folder records the production and control-plane workflow dependency change.
- Testable boundaries: repository preflight and protected GitHub checks validate the unchanged workflow contracts.
- Test-first bias: no new product behavior is introduced; regression verification is the relevant evidence.
- PR-only: work remains on the existing dependency PR branch and dedicated worktree.
- Simplicity: the update changes only two immutable references plus process evidence.
- Deployability: merge is gated on protected checks and current-head review.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Search reports two exact v7.0.0 SHA pins and two `v7.0.0` comments |
| AC-002 | Workflow diff leaves both `node-version: "20"` and `cache: "pnpm"` blocks unchanged |
| AC-003 | Both affected jobs retain GitHub-hosted `ubuntu-latest`; upstream `action.yml` declares `node24` |
| AC-004 | Search reports no `registry-url` or `NODE_AUTH_TOKEN` use in the affected workflows |
| AC-005 | Both steps continue to request the pnpm cache explicitly |
| AC-006 | Required GitHub checks pass and all review threads are resolved |

## Risks

- Node 24 actions require a sufficiently current Actions runner. Both affected jobs use GitHub-hosted runners rather than pinned self-hosted infrastructure.
- The action runtime and the installed project Node version are separate: v7 runs on Node 24 but intentionally continues to provision Node 20 for repository commands.
- Removing the dummy authentication fallback can affect registry publishing workflows, but neither affected job supplies `registry-url` or publishes packages.
- Cache behavior must remain tied to the pnpm lockfile; the existing explicit `cache: pnpm` inputs and action ordering are preserved.
