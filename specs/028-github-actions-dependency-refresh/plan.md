# Plan: GitHub Actions Dependency Refresh

## Summary

Keep the grouped Dependabot action updates, add the required feature memory, and validate the repository controls that execute the affected workflows.

## Technical Context

- changed paths: `.github/workflows/ci.yml`, `.github/workflows/deploy-production.yml`
- changed dependencies: `pnpm/action-setup`, `docker/setup-qemu-action`
- application and data changes: none

## Scope Boundaries

- in scope: immutable action-revision updates, feature memory, local preflight, and GitHub review/check evidence
- out of scope: bot logic, workflow redesign, secrets, and deployment targets

## Constitution Check

- Spec-first: this complete feature-memory folder accompanies the protected workflow change.
- Testable boundaries: preflight and GitHub checks exercise the repository guardrails.
- PR-only: all changes remain on this Dependabot PR branch and its isolated worktree.
- Simplicity: no workflow structure or runtime code is added.
- Deployability: action changes retain the existing immutable-pin policy.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Diff review confirms the two requested SHAs and matching version comments in both affected workflows |
| AC-002 | `pnpm run preflight` and final required GitHub checks |
| AC-003 | Current-head Codex review and zero unresolved review threads |

Negative-scenario evidence:

- `git diff --name-only origin/main...HEAD` remains limited to the two workflow files and this feature-memory folder.
- The action references remain immutable full commit SHAs and no workflow permissions or commands change.

## Risks

- An upstream action release could alter workflow behavior; mitigate with immutable SHAs, local preflight, GitHub checks, and current-head review.

## Process Memory

### Dead Ends

- The initial Dependabot head failed `guard` because the production-deployment workflow is a protected product path and the PR had no complete feature-memory folder.
- The initial `AI Review` run failed because no trusted current-head review request marker had been recorded.

### Decisions

- Preserve Dependabot's grouped update instead of splitting the two compatible minor releases.
- Request Codex review only after the feature-memory commit is pushed so the marker and review evidence target the final PR head.

### Known Issues

- The same action pins are duplicated between CI and production deployment without an automated parity check; this PR keeps them aligned and defers a broader workflow invariant.
- `docker/setup-qemu-action` still uses its pre-existing floating default `tonistiigi/binfmt:latest`; pinning that nested runtime is outside this dependency-only update.
- Required checks passed on implementation head `b38f54f`; Codex reported no major issues after the single false-positive thread was answered with commit metadata and resolved.
