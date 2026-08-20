# Plan: Rename Repository to ha-bot

## Summary

Introduce an explicit two-identity migration boundary in the deployment script,
prove it with command-contract tests, then rename GitHub and both checkouts in a
coordinated window before merging the single transition PR. The merge produces
the only production deployment and migrates the stable-image ledger naturally.

## Technical Context

- runtime: Bash deployment boundary, Docker Compose v2, Linux ARM64, GitHub Actions
- dependencies: existing shell, Python unittest fakes, GitHub CLI, SSH
- product paths: `Dockerfile`, `scripts/deploy-production.sh`, deployment tests,
  current deployment docs
- data changes: stable-image ledger may temporarily contain one legacy and one
  canonical GHCR digest; runtime application data is moved with the checkout

## Scope Boundaries

- in scope: exact repository/source allowlist, mixed-ledger transition, rename
  operations, verification, and durable operator documentation
- out of scope: bot features, broad image pruning, legacy package deletion,
  Compose identity changes, automatic rollback

## Constitution Check

- Spec-first: this complete feature folder precedes product-code changes.
- Testable boundaries: fake Docker/systemd tests cover the migration without
  external services.
- PR-only: all product changes use one worktree, branch, and ready PR.
- Simplicity: two constant identity pairs and small validation helpers extend
  the existing boundary without adding a framework.
- Deployability: both pre-rename and post-rename candidates remain valid, and
  mismatches fail before cutover.

## Complexity Tracking

The temporary legacy identity remains in the deploy allowlist because production
ledger validation is intentionally strict. Removing it immediately would require
destructive out-of-band ledger editing and would discard the verified previous
image. It can be removed in a later PR after the migration ledger has drained.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Existing legacy cutover test plus `pnpm run preflight` |
| AC-002 | `test_first_canonical_deploy_accepts_legacy_ledger_and_retains_legacy_current` |
| AC-003 | `test_second_canonical_deploy_drains_legacy_image_from_ledger` |
| AC-004 | Candidate and ledger identity-mismatch tests plus foreign-image test |
| AC-005 | Green Actions run plus read-only server, GitHub, and worktree assertions |

Negative scenario evidence:

- Unit tests assert no `systemctl` or Compose `up` occurs for unsupported or
  mismatched identities and no unrelated image reference is removed.

## Risks

- A deploy during the short path/secret mismatch window would fail before
  cutover; mitigation is to serialize the rename and confirm no active deploy.
- The first canonical deployment depends on the legacy package for the previous
  ledger image; mitigation is to keep that package and validate both exact pairs.
- Moving the main worktree changes absolute linked-worktree metadata; mitigation
  is a final `git worktree repair` and status check for every registered worktree.
- A failure after Compose cutover still has no automatic systemd rollback; the
  verified previous image remains available for the documented manual recovery.
