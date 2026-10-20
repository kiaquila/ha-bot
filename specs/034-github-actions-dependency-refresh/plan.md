# Plan: GitHub Actions Dependency Refresh

## Summary

Retain the grouped Dependabot action updates without changing application or workflow behavior, add the required feature memory, and validate the repository controls that execute the workflows.

## Technical Context

- changed paths: `.github/workflows/ci.yml`, `.github/workflows/deploy-production.yml`, `.github/workflows/osv-scan.yml`
- changed dependencies: `actions/setup-node`, `google/osv-scanner-action/osv-scanner-action`
- application and data changes: none

## Scope Boundaries

- in scope: immutable action-revision updates, feature memory, local preflight, and GitHub review/check evidence
- out of scope: bot logic, workflow redesign, permissions, secrets, schedules, and deployment targets

## Constitution Check

- Spec-first: this complete feature-memory folder accompanies the protected workflow change.
- Testable boundaries: preflight and required GitHub checks exercise the repository guardrails and workflow definitions.
- PR-only: all changes remain on the existing Dependabot PR branch in its dedicated worktree.
- Simplicity: no workflow structure or runtime code is added.
- Deployability: the update retains immutable action pins and all existing workflow inputs.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Diff review confirms both setup-node pins use v7.1.0 and no inputs or ordering changed |
| AC-002 | Diff review confirms the OSV scanner pin uses v2.7.0 and scan arguments are unchanged |
| AC-003 | `pnpm run preflight` and final required GitHub checks |
| AC-004 | Current-head Codex review and zero unresolved review findings |

## Risks

- An upstream action release could alter workflow behavior; immutable SHAs, unchanged inputs, preflight, required checks, and current-head review constrain that risk.
