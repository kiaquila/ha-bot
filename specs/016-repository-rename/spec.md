# Spec: Rename Repository to ha-bot

## Goal

Rename the canonical GitHub repository and its local and production checkouts
from `ha_bot` to `ha-bot` without interrupting the running bot or breaking the
merge-driven production deployment.

## Scope

In scope:

- Transitional validation for the legacy and canonical GitHub/GHCR identities.
- Safe migration of the production stable-image ledger across the GHCR rename.
- Current deployment documentation and OCI source metadata.
- GitHub, production checkout, environment-secret, and local-worktree rename.

Out of scope:

- Renaming the Compose project, managed label, Python logger, or disabled legacy
  `ha_bot.service` unit.
- Deleting the legacy GHCR package during the migration.
- Changing bot behavior, credentials, persistence data, or external services.

## User Stories

### User Story 1

As the repository owner, I want the canonical repository name to use a hyphen,
so that it follows the naming convention used by my other repositories.

### User Story 2

As the production operator, I want the first deployment after the rename to
accept the existing legacy image ledger, so that the bot remains deployable and
retains one verified previous image.

## Acceptance Criteria

1. Given a legacy `ghcr.io/kiaquila/ha_bot` candidate and matching source label,
   when deployment validation runs before the rename, then deployment remains
   accepted.
2. Given a canonical `ghcr.io/kiaquila/ha-bot` candidate and a ledger containing
   verified legacy images, when the first post-rename deployment succeeds, then
   the canonical candidate is current and the legacy current image is previous.
3. Given a second successful canonical deployment, when retention runs, then
   only the new current and immediately preceding canonical image are retained
   by the stable ledger and stale legacy references are eligible for exact,
   non-forced removal.
4. Given an image repository and OCI source label from different supported
   identities, when validation runs, then deployment fails before systemd or
   Compose mutation.
5. Given the repository, server checkout, and local checkout are renamed, when
   verification runs, then GitHub Actions deploys the exact `main` SHA from the
   canonical repository to one healthy `ha-bot` Compose service while runtime
   data and unrelated containers remain unchanged.

## Negative Scenarios

1. Given an image outside the two exact migration identities, when deployment
   runs, then it is rejected before any cutover command.
2. Given a corrupt, missing, or mismatched legacy ledger image, when migration
   validation runs, then deployment fails before the running service is changed.
3. Given cleanup encounters an image without an exact supported repository and
   source pair, when retention runs, then that image is left untouched.

## Requirements

- FR-001: Candidate images must match either the legacy repository/source pair
  or the canonical repository/source pair; cross-pair combinations are invalid.
- FR-002: Stable ledger validation must accept verified images from either exact
  pair during the transition.
- FR-003: Retention may remove only exact digest references belonging to either
  supported pair and must retain the current and previous stable image IDs.
- FR-004: The checked-in Docker source metadata and current operator docs must
  identify `https://github.com/kiaquila/ha-bot` as canonical.
- FR-005: The production Compose identity and disabled legacy service contract
  must remain unchanged.
- FR-006: GitHub rename, environment-secret update, server-path move, and local
  worktree repair must be verified before completion.

## Success Criteria

- SC-001: Local preflight and all required PR checks pass on the rename PR head.
- SC-002: The post-merge `Deploy Production` run succeeds for the exact merge SHA.
- SC-003: The production container is healthy and reports the canonical image
  repository/source after deployment.
- SC-004: Every registered local worktree is usable under the `ha-bot` root.

## Assumptions

- GitHub preserves repository identity, PRs, environments, and redirects when
  the repository name changes.
- No other merge or manual production deployment occurs during the coordinated
  rename window.
- The legacy GHCR package remains available until at least two canonical
  deployments have completed successfully.
