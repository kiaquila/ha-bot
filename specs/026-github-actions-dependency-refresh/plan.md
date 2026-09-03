# Plan: GitHub Actions Dependency Refresh

## Summary

Apply the grouped Dependabot action updates without changing application code, then validate the repository controls that execute those workflows.

## Technical Context

- changed paths: `.github/workflows/ci.yml`, `.github/workflows/deploy-production.yml`, `.github/workflows/osv-scan.yml`
- changed dependencies: `docker/setup-buildx-action`, `google/osv-scanner-action/osv-scanner-action`
- application and data changes: none

## Scope Boundaries

- in scope: immutable action-revision updates, feature memory, local preflight, and GitHub review/check evidence
- out of scope: bot logic, workflow redesign, secrets, and deployment targets

## Constitution Check

- Spec-first: this complete feature-memory folder accompanies the workflow changes.
- Testable boundaries: preflight and GitHub checks exercise the repository guardrails.
- PR-only: all changes remain on this Dependabot PR branch.
- Simplicity: no workflow structure or runtime code is added.
- Deployability: action changes retain existing immutable pins.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Diff review of the three workflow action pins |
| AC-002 | `pnpm run preflight` and final required GitHub checks |
| AC-003 | Current-head Codex review and zero unresolved review threads |

## Risks

- An upstream action release could alter workflow behavior; mitigate with immutable SHAs, preflight, CI, and a current-head review.
