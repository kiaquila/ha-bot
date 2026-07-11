# Tasks: Docker Production Deployment

Status legend: `[x]` done, `[ ]` pending.

## Setup and Design

- [x] T001 Create an isolated feature branch/worktree from refreshed `origin/main`
  for `006-docker-production-deployment`.
- [x] T002 Read the constitution, features 003/005, current production workflow,
  and process configuration; record the owner-approved clean-cutover constraints.
- [x] T003 Create `spec.md`, `plan.md`, and `tasks.md` as the implementation and
  verification source of truth.
- [x] T004 Confirm the implementation diff starts from current GitHub `main` and
  record the active PR/branch status before product changes.

## Contract Tests

- [x] T005 Add static/command-contract tests for the production Compose project:
  one `bot` service, project `ha-bot`, immutable external image, no host ports,
  no host network, and no external/foreign networks.
- [x] T006 Add deploy-order tests proving workflow login/pull precedes script
  invocation and script config/model/digest failures precede any systemd cutover
  or mutating Compose command.
- [x] T007 Add clean-cutover and post-cutover failure tests: stop/disable legacy
  systemd, start only `ha-bot`, and never enable/start/restart systemd as rollback.
- [x] T008 Add foreign-resource tests proving no mutating command can select
  projects `app`/`deploy` and before/after snapshot mismatch fails without repair.
- [x] T009 Add image-retention tests for first success, current+previous after
  multiple successes, third-success eviction, failed-candidate exclusion,
  idempotent same-SHA deployment, exact repository matching, and no forced/global
  cleanup.
- [x] T010 Add static rejection tests for `docker system prune`,
  `docker image prune`, unscoped Compose removal, Docker daemon restart, and host
  reboot/shutdown commands.

## Container Runtime

- [x] T011 Add `.dockerignore` that excludes git data, local environments,
  runtime state, environment/secret files, and non-runtime artifacts.
- [x] T012 Add a production `Dockerfile` that installs pinned requirements,
  copies the worker source, runs the worker directly, and supports a
  `linux/arm64` Buildx build without embedding secrets.
- [x] T013 Add `compose.production.yml` with explicit project `ha-bot`, one
  immutable-image `bot` service, server-owned environment input, no published
  ports or foreign networks, bounded logs/restarts, and an empty project-local
  runtime bind mount.
- [x] T014 Validate the rendered Compose model and inspect a locally built ARM64
  image for architecture, command, OCI revision, and absence of secret/state
  files.

## Scoped Production Deployment

- [x] T015 Add `scripts/deploy-production.sh` with strict variable/image
  validation, a host-side lock, exact-SHA verification, Compose rendering, and
  verification of the workflow-pulled candidate digest before cutover.
- [x] T016 Snapshot the six foreign containers before cutover and compare their
  IDs/running state after deploy without issuing mutations against their projects
  or resources.
- [x] T017 Implement the final cutover: stop/disable the legacy systemd service,
  start/update only Compose project `ha-bot`, and perform a bounded running,
  restart-count, digest/revision, port, network, and project-label check.
- [x] T018 Implement post-cutover failure diagnostics and non-zero exit while
  deliberately leaving systemd disabled and avoiding automatic legacy rollback.
- [x] T019 Implement the atomic two-entry stable-image ledger and exact-reference
  cleanup: current plus previous stable only, failed candidates excluded, no
  `--force`, no prefix/broad deletion, and no prune.
- [x] T020 Make repeat deployment of the same SHA idempotent and ensure the first
  Docker cutover starts with an empty project-local runtime bind mount rather than
  migrating legacy state.

## GitHub Autodeploy

- [x] T021 Preserve the current `main` guards, preflight dependency, concurrency,
  exact remote checkout, strict SSH setup, and GitHub `production` environment.
- [x] T022 Add a Buildx job that builds only `linux/arm64`, tags with the full
  merge SHA, publishes to GHCR using job-scoped package permission, and exposes
  the immutable digest to the production job.
- [x] T023 Replace host `pip install`/systemd restart deployment with temporary
  GHCR pull authentication and invocation of the exact-SHA deploy script/image
  digest; remove temporary registry credentials on every exit path.
- [x] T024 Keep workflow permissions minimal and make a mismatched SHA, image
  digest/revision, or non-`main` dispatch fail/skip before production mutation.

## Documentation and Process Memory

- [x] T025 Update deploy/operator documentation for prerequisites, secret names,
  immutable GHCR images, one-time clean cutover, no-systemd-rollback decision,
  routine Compose deploys, verification, and manual Docker recovery.
- [x] T026 Document local current+previous image retention and explicitly state
  that registry-side GHCR cleanup, global prune, foreign project operations,
  Docker daemon restart, and host reboot are not part of deployment.
- [x] T027 Update repository/process indexes and product-path configuration for
  the new Docker, Compose, deploy-script, workflow, and test surfaces.
- [x] T028 Scan all changed files for bot/registry/SSH secret values, patient
  identifiers, private URLs/hostnames, and personal filesystem paths.

## Verification and Pull Request

- [x] T029 Run deploy command-contract tests and record the passing count/output.
- [x] T030 Run `docker compose --project-name ha-bot -f
  compose.production.yml config` plus static isolation/global-command assertions.
- [x] T031 Build/inspect the `linux/arm64` image and record architecture, immutable
  revision metadata, and runtime smoke evidence.
- [x] T032 Run `actionlint`, `shellcheck`, `git diff --check`, and
  `pnpm run preflight`; resolve every failure.

Local verification evidence (2026-07-10):

- `python3 -m unittest tests.test_deploy_production -v`: 21 tests passed,
  including fail-closed Docker enumeration, rendered-model rejection,
  pull-before-cutover ordering, signal-safe auth cleanup, no-systemd-rollback,
  foreign-container/network invariants, idempotency, atomic retention, and
  non-fatal targeted cleanup.
- `pnpm run preflight`: repository and context gates passed; the complete Python
  suite passed.
- `actionlint`, `shellcheck`, `bash -n`, `git diff --check`, sensitive-value
  scan, and forbidden global/foreign mutation scan passed.
- The rendered Compose model contained one isolated `bot`, no published ports or
  external network, and all configured hardening/resource bounds.
- A local `linux/arm64` image build passed build-check, OCI revision inspection,
  architecture inspection, and a read-only arbitrary-UID import smoke test.

- [ ] T033 Push the feature branch, open one PR with required attribution, and
  wait for all required GitHub checks to finish green with no blocking review
  findings.
- [ ] T034 Trigger the requested Codex review from the owner's GitHub identity,
  triage every actionable finding, and rerun affected checks.
- [ ] T035 Before merge, refresh GitHub state, compare the PR head with
  `origin/main`, confirm no conflict/stale required check, and obtain owner merge
  approval for the clean cutover.

## Post-Merge Production Evidence

- [ ] T036 Observe the merge-triggered `main` workflow and record the exact merge
  SHA, GHCR digest match, and green GitHub `production` deployment without
  exposing sensitive values.
- [ ] T037 Confirm the legacy bot systemd service is inactive/disabled, exactly
  one `ha-bot` service is stable, and it has no published ports or foreign network
  attachment.
- [ ] T038 Confirm all six foreign container IDs remain running and unchanged;
  record only the invariant result in public evidence, not sensitive host data.
- [ ] T039 Confirm the local HA Bot image store contains only current and previous
  stable image objects (current only on first deployment), with no global cleanup
  or foreign image removal.
- [ ] T040 Update verification evidence, dead ends, decisions, and known issues in
  feature process memory; do not mark complete until the PR head and post-merge
  production gates are satisfied.

## Process Memory

### Dead Ends

- A transition that preserved/migrated current bot task state or automatically
  restored systemd was intentionally rejected after the owner confirmed there
  are no active tasks and accepted downtime/state loss.
- Host-side image builds were rejected because they would consume build CPU,
  memory, and cache on a Docker daemon shared with foreign workloads. The image
  is built once in GitHub Actions for `linux/arm64` and pulled by digest.
- Global Docker pruning or age/prefix-based cleanup was rejected because the host
  contains unrelated containers and image creation time does not prove production
  stability.

### Decisions

- Treat the systemd-to-Compose cutover as final: pre-cutover failures preserve
  systemd; post-cutover failures do not re-enable or restart it.
- Use both top-level Compose name and explicit `--project-name ha-bot` for an
  auditable isolation boundary.
- Deploy an immutable GHCR digest tied to the exact merge SHA; do not build on the
  production host or deploy a mutable `latest` tag.
- Publish no host ports and join no external/foreign networks; the long-polling
  worker requires outbound access only.
- Keep exactly two successfully verified HA Bot image objects locally (current
  and previous), tracked by an atomic stable ledger. Failed pulls/starts never
  become stable.
- Delete only exact stale HA Bot repository references without force. Never use
  global prune, restart Docker, reboot the host, or mutate foreign resources.
- Limit the retention policy to the production host. GHCR package deletion needs
  separate package-lifecycle authority and is not included in this PR.

### Known Issues

- The first complete integration evidence is available only after merge because
  the production workflow is triggered from `main` and performs the one-time
  cutover.
- By explicit owner decision, a failure after systemd is disabled can leave the
  bot unavailable until a Docker-based fix or manual recovery is performed. The
  previous stable Docker image is retained for that recovery but is not restored
  automatically by this feature.
- Container process/running checks cannot prove upstream Telegram or appointment
  portal availability. The stability window proves the worker remains alive;
  external-service outages remain an operational dependency.
- Registry-side GHCR versions will continue to accumulate until a separately
  authorized package retention policy is introduced; local server storage is
  bounded by this feature.
