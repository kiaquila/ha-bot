# Tasks: Rename Repository to ha-bot

## Setup

- [x] T001 Confirm feature folder `016-repository-rename` and branch
  `codex/016-repository-rename` start from current `origin/main`.
- [x] T002 Run baseline `pnpm run preflight` before editing.
- [x] T003 Record the live GitHub, server, ledger, secret-name, and worktree state.

## Implementation

- [x] T004 Add failing tests for canonical deployment, mixed-ledger migration,
  follow-up retention, and repository/source mismatch rejection.
- [x] T005 Implement exact legacy/canonical identity validation and retention.
- [x] T006 Update canonical OCI metadata and current deployment documentation.

## Verification

- [x] T007 Run focused deployment tests, shellcheck/actionlint, and local preflight
  (58 tests passed).
- [x] T008 Create one ready PR and confirm all substantive-head required checks
  pass with a current Codex review and no findings.
- [x] T009 Rename GitHub and verify repository identity, old redirects, settings,
  production environment secrets, and PR state are preserved.
- [x] T010 Move the server checkout, update its origin and `BOTS_DEPLOY_PATH`, and
  confirm the existing container remains healthy.
- [ ] T011 Merge the PR and capture the exact green production deployment evidence.
- [ ] T012 Rename the local repository root, repair every linked worktree, and
  verify fresh GitHub state from the new path.

## Process Memory

### Dead Ends

- A GitHub-only rename was rejected because the workflow derives a new GHCR path
  while the deployed script and stable ledger strictly require the legacy path.
- Clearing the production ledger out of band was rejected because it would
  discard a verified rollback artifact and weaken the tested deployment boundary.
- A direct local Compose render without `.env` stops at the intended required
  env-file guard; the fake-CLI contract tests and CI render cover the model
  without creating a checkout-local secret file.

### Decisions

- Keep the Compose project, ownership label, Python logger, and disabled legacy
  systemd unit unchanged because none is a repository checkout name.
- Permit only exact legacy and canonical repository/source pairs during the
  bounded migration; never accept cross-pair combinations.
- Keep the legacy GHCR package after this task and let two successful canonical
  deployments drain it from the stable ledger before any separate cleanup.
- Rename GitHub before merging the transition PR so the merge creates exactly
  one canonical production image and deployment.

### Known Issues

- GitHub package metadata could not be queried with the active token because it
  lacks `read:packages`; live image and ledger inspection provide deployment
  evidence, and package deletion is intentionally out of scope.
- The Codex/IDE workspace must be reopened after the final local-root rename.
