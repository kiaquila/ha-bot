# Spec: Docker Production Deployment

## Goal

Run HA Bot as an isolated Docker Compose project on the shared production host
and preserve automatic deployment from merged `main`, using an immutable
`linux/arm64` image built in GitHub Actions and published to GHCR.

## Background

Production currently runs the bot as a legacy systemd service. The same Docker
daemon already hosts six containers owned by the unrelated Compose projects
`app` and `deploy`; those containers, their images, networks, and volumes are
outside this feature's authority.

The owner has confirmed that the bot has no active monitoring tasks and accepts
a clean cutover with downtime and no state migration. The legacy systemd service
may therefore be stopped and disabled permanently after the candidate image and
Compose configuration have passed all checks that can run before cutover. If the
container later fails to start, deployment must fail visibly; it must not restore
the systemd runtime automatically.

## Scope

In scope:

- A production Docker image for the Python worker, built for `linux/arm64` in
  GitHub Actions and published to GHCR under an immutable merge-SHA reference.
- A single-service production Compose definition with the explicit project name
  `ha-bot`, no published host ports, no external networks, and project-scoped
  runtime resources.
- A clean transition that validates and pulls the candidate first, then stops and
  disables the legacy systemd service and starts the Compose service.
- Preservation of the existing `main` push trigger, exact-SHA deployment,
  GitHub `production` environment, strict SSH verification, and preflight gate.
- Production-host image retention limited to the current stable HA Bot image and
  the immediately previous stable HA Bot image. Cleanup is repository-scoped,
  uses exact image references without force, and never invokes a global prune.
- Automated command-contract tests, local container/Compose validation,
  documentation, and post-merge production evidence.

Out of scope:

- Migrating in-memory or on-disk bot state from the systemd runtime into Docker.
- Zero-downtime handoff or automatic rollback to the legacy systemd service.
- Changing Telegram commands, Hospital Alemán polling behavior, authentication,
  matching, or notifications.
- Provisioning or upgrading Docker, restarting the Docker daemon, rebooting the
  host, or changing host-wide Docker configuration.
- Starting, stopping, recreating, renaming, inspecting destructively, or cleaning
  resources belonging to the foreign `app` and `deploy` projects.
- Publishing inbound ports, joining foreign/external networks, or introducing a
  reverse proxy.
- Registry-side GHCR package deletion. The two-image retention requirement
  applies to the production host's local Docker image store.

## User Stories

### User Story 1 — Containerized production runtime

As the maintainer, I want the bot to run from a reproducible Docker image, so the
host no longer installs Python dependencies directly or relies on a host Python
environment.

### User Story 2 — Safe coexistence on a shared Docker host

As the owner of a shared server, I want HA Bot isolated under its own Compose
project with no inbound ports, so deploying it cannot disrupt the six containers
already owned by other projects.

### User Story 3 — Merge-driven deployment

As the maintainer, I want a merge to `main` to build and deploy the exact merged
revision through the existing GitHub `production` environment, so deployment
status remains visible and attributable to one commit.

### User Story 4 — Bounded local image storage

As the server operator, I want only the current and previous stable HA Bot images
retained locally, so repeated deployments do not consume disk indefinitely and
cleanup cannot affect unrelated workloads.

## Acceptance Criteria

1. Given a commit is pushed to `main`, when repository preflight passes, then
   GitHub Actions builds a `linux/arm64` image from that exact commit, pushes an
   immutable SHA reference to GHCR, records its digest, and starts the existing
   GitHub `production` environment deployment with that digest.
2. Given a candidate deployment, when remote pre-cutover validation runs, then it
   verifies the exact remote checkout SHA, renders the production Compose config,
   authenticates to GHCR without logging credentials, and pulls the candidate
   image before any systemd service is stopped or disabled.
3. Given pre-cutover validation succeeds, when the one-time cutover runs, then
   the legacy bot systemd service is stopped and disabled and exactly one running
   service in Compose project `ha-bot` uses the candidate image digest. No legacy
   bot process remains active.
4. Given the production Compose service is inspected, then it has no published
   host ports, no `network_mode: host`, no external/foreign network attachment,
   and Docker labels identify only project `ha-bot`.
5. Given the six foreign containers from projects `app` and `deploy` are
   snapshotted immediately before and after deployment, then the same six
   container IDs remain running and no deploy or cleanup command selects their
   containers, images, networks, or volumes.
6. Given a newly deployed container passes the bounded running/stability check,
   when image retention runs, then the local HA Bot keep-set contains the new
   current stable image and, when one exists, the immediately previous stable
   image. Older HA Bot image references are removed by exact repository-qualified
   reference without `--force`; the first deployment retains only its current
   image.
7. Given a candidate fails after it was pulled but before it is declared stable,
   when failure handling runs, then the candidate is not added to the stable
   keep-set, its unused project-specific image reference may be removed, the
   deployment reports failure, and the previous two stable image records remain
   unchanged. The systemd service is not re-enabled or restarted.
8. Given the same successful SHA is deployed again, when the deployment script
   runs, then it is idempotent: one `ha-bot` service remains, systemd remains
   disabled, the stable-image keep-set is unchanged, and no foreign resource is
   recreated.
9. Given the PR is reviewed, when changed files and workflow logs are inspected,
   then no bot token, registry credential, SSH private material, patient
   identifier, private URL, private hostname, or personal filesystem path is
   present.
10. Given the PR is merged, when the resulting production workflow completes,
    then acceptance evidence records the deployed SHA and digest, Compose project
    and port checks, legacy service state, foreign-container invariant, and local
    image-retention result without exposing sensitive values.

## Negative Scenarios

1. Given a workflow dispatch uses a non-`main` ref, when jobs are evaluated, then
   image publication and production deployment are skipped.
2. Given preflight, image build, Compose rendering, GHCR authentication, image
   pull, or exact-SHA verification fails, when deployment exits, then the legacy
   systemd service has not yet been stopped or disabled and all existing
   containers remain unchanged.
3. Given the Docker container fails its bounded startup/stability check after
   cutover, when deployment fails, then GitHub marks the production deployment
   failed and the legacy systemd service remains disabled; no automatic systemd
   rollback is attempted by explicit owner decision.
4. Given cleanup cannot prove an image belongs to the exact HA Bot repository or
   an image is in use, when cleanup runs, then it skips/fails safely without
   forcing removal. It never runs `docker system prune`, `docker image prune`, a
   daemon-wide cleanup, or an unscoped `docker compose down`.
5. Given a foreign-container snapshot differs after deployment, when the
   post-deploy invariant is evaluated, then deployment fails and reports the
   invariant violation; it does not try to repair, stop, or recreate the foreign
   containers.
6. Given the host or Docker daemon would need a restart for deployment, when the
   script evaluates that path, then it fails instead. Neither a host reboot nor a
   Docker daemon restart is an allowed deployment step.
7. Given SSH host verification is not pinned or the deployed image digest/revision
   does not match the requested merge SHA, when validation runs, then deployment
   fails rather than weakening SSH checks or starting the mismatched image.

## Requirements

- FR-001: Add a production `Dockerfile` and `.dockerignore` that build the bot for
  `linux/arm64` without copying runtime secrets or state into the image.
- FR-002: Add a production Compose definition for one `bot` service under project
  `ha-bot`, using an externally supplied immutable image reference, no host ports,
  no host networking, and no foreign/external network declarations.
- FR-003: Preserve future encrypted state inside a dedicated project-local bind
  mount while starting it empty; do not copy or migrate legacy state.
- FR-004: Update the production workflow to retain its `main` guards, preflight,
  exact-SHA checkout, strict SSH, concurrency control, and GitHub `production`
  environment while building/pushing the ARM64 image and deploying its digest.
- FR-005: Use job-scoped GitHub credentials for GHCR build/pull operations, avoid
  logging credentials, and remove temporary remote registry authentication when
  the deploy command exits.
- FR-006: Add a project-scoped deployment script that validates the exact image
  already pulled by the workflow before cutover, stops/disables the legacy
  service, starts only Compose project `ha-bot`, performs bounded verification,
  and never rolls back to systemd.
- FR-007: Snapshot the six foreign containers before and after deployment and
  enforce unchanged IDs/running state without issuing mutating commands against
  projects `app` or `deploy`.
- FR-008: Maintain an atomic stable-image keep-set for the production host and,
  only after successful verification, retain at most the current and immediately
  previous stable HA Bot image objects. Remove older exact HA Bot image references
  without force or global prune commands.
- FR-009: Add test coverage for deploy ordering, project scoping, clean cutover,
  failure without systemd rollback, foreign-container invariants, idempotency,
  digest matching, and current-plus-previous image retention.
- FR-010: Document the container runtime, secret-name contract, one-time cutover,
  routine deployment, targeted cleanup, verification, and manual recovery using
  only non-sensitive placeholders.

## Success Criteria

- SC-001: `pnpm run preflight`, deployment-script tests, workflow lint, shell
  lint, Compose config validation, and an ARM64 image smoke check pass on the PR
  head.
- SC-002: Static and command-contract tests prove there are no published ports,
  no foreign project selectors, no global prune commands, and no daemon/host
  restart commands in the production path.
- SC-003: The post-merge `main` workflow completes successfully and records a
  green GitHub `production` deployment for the exact merge SHA and image digest.
- SC-004: Server-side evidence confirms one running `ha-bot` container, disabled
  legacy systemd service, all six foreign containers unchanged and running, and
  no more than two stable HA Bot image objects locally.

## Assumptions

- The production host already has working Docker Engine and Docker Compose with
  outbound access to GHCR, and its CPU architecture is ARM64.
- The deploy user can run only the required Docker commands and stop/disable the
  named legacy systemd service non-interactively.
- Runtime environment values remain in a server-side environment file and are
  never baked into the image or committed.
- The owner accepts the explicit availability tradeoff: after the clean cutover,
  container startup failure leaves the bot down until a Docker-based fix or
  manual recovery; systemd is not restored automatically.
