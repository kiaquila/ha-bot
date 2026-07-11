# Plan: Docker Production Deployment

## Summary

Replace host-Python/systemd deployment with an immutable `linux/arm64` image
built in GitHub Actions, published to GHCR, and run as the isolated Compose
project `ha-bot`. Preserve the existing merge-to-`main` production deployment
contract while making the one-time cutover deliberately final: validate and pull
beforehand, then stop/disable systemd and do not roll back to it.

The production host is shared with six containers from the unrelated Compose
projects `app` and `deploy`. Every mutating Docker command is therefore scoped to
project `ha-bot` or to an exact HA Bot image reference. Local retention keeps the
current and immediately previous stable HA Bot images only; no global prune is
allowed.

## Technical Context

- application runtime: Python Telegram long-polling worker (`python bot.py`)
- image target: `linux/arm64`, built on GitHub-hosted runners with Buildx
- image registry: GHCR, immutable SHA tag plus deployment by captured digest
- deployment trigger: push to `main` or manual dispatch from `main`
- deployment status: existing GitHub environment `production`
- remote transport: SSH with pinned known-hosts and exact-SHA checkout
- container runtime: one-service Docker Compose project `ha-bot`
- shared-host boundary: six foreign containers owned by projects `app` and
  `deploy`; no authority to mutate any of their resources
- application data: fresh project-local runtime bind mount; no legacy state migration
- legacy runtime: systemd service stopped and disabled during cutover; no
  automatic systemd rollback

## Scope Boundaries

- in scope: container build files, production Compose definition, scoped deploy
  script, GitHub workflow changes, local image retention, tests, documentation,
  feature/process memory, and post-merge evidence
- out of scope: bot behavior changes, legacy state migration, zero-downtime
  handoff, Docker/host upgrades or restarts, foreign project changes, inbound
  ports, reverse proxying, and registry-side GHCR version deletion

## Architecture

### 1. Build one immutable artifact

The preflight job remains the first gate. A following image job checks out the
event SHA, builds only `linux/arm64`, applies an immutable full-SHA tag and OCI
revision metadata, pushes to GHCR with the job-scoped `GITHUB_TOKEN`, and exports
the registry digest as a job output. The production job consumes the digest, not
a mutable tag, so the artifact tested and selected by the workflow is the
artifact started on the host.

The image contains application source and pinned Python dependencies only.
`.dockerignore` excludes git metadata, local environments, runtime state, tests
not required at runtime, and secret-bearing environment files. The container
runs the worker directly rather than invoking the legacy `Procfile.py`/systemd
path.

### 2. Isolate the Compose runtime

`compose.production.yml` declares top-level project name `ha-bot`, and every
remote invocation also passes `--project-name ha-bot` as defense in depth. It
contains one `bot` service with:

- `image` supplied as the immutable GHCR digest reference;
- server-owned environment input, never values committed in YAML;
- no `ports`, `expose`, host networking, external networks, or foreign network
  names;
- a dedicated project-local runtime bind mount for future encrypted state,
  created empty at cutover;
- a restart policy and bounded log rotation suitable for a shared host;
- no fixed `container_name`, so Compose owns naming and labels consistently.

The service needs outbound network access for Telegram and the appointment
portal but no inbound host port.

### 3. Make deploy ordering explicit

Move the remote lifecycle into `scripts/deploy-production.sh` so ordering and
command scope are testable outside GitHub Actions. The script uses a host-side
lock and performs these phases:

1. Validate required variables, exact repository/image syntax, Docker/Compose
   availability, server environment input, and remote checkout SHA.
2. Render `docker compose config` with project `ha-bot` and reject ports,
   host/external network declarations, or an unexpected service set.
3. Verify that the candidate digest pre-pulled by the workflow is present locally
   and matches its OCI source, revision, and ARM64 architecture before cutover.
4. Snapshot the names/IDs/running state of the six foreign containers without
   mutating them.
5. Stop and disable the legacy systemd service (`disable --now`) and verify it is
   inactive and disabled. Repeated deploys tolerate that already-final state.
6. Start/update only project `ha-bot` and wait through a bounded stability window
   for the worker to remain running without restart churn.
7. Verify one project container, the requested digest/revision, zero published
   ports, isolated project labels/network, and no legacy process.
8. Re-snapshot the foreign containers and require the original IDs/running state
   to match.
9. Atomically mark the candidate stable, update the two-image keep-set, and run
   targeted cleanup.

All pre-cutover failures leave systemd running. A post-cutover failure captures
project-specific diagnostics, marks the GitHub deployment failed, and leaves
systemd disabled. Retaining a previous Docker image is for bounded storage and
manual Docker recovery; it does not authorize automatic legacy rollback.

### 4. Retain only two stable local images

The deploy script maintains a small server-local retention ledger containing
only immutable references/IDs for the last two successfully verified HA Bot
deployments. It is updated atomically only after the new container passes all
checks:

- new verified candidate → current stable;
- former current stable, when present → previous stable;
- former previous and all other exact references from the HA Bot repository →
  stale and eligible for removal;
- failed/unverified candidate → never enters the stable ledger and is removed
  only when no container uses it.

Cleanup first constructs an explicit keep-set, lists image references whose
repository field equals the HA Bot GHCR repository exactly, and calls
`docker image rm` on individual stale references without `--force`. It never
uses `docker system prune`, `docker image prune`, broad label/prefix deletion,
or foreign project commands. Shared layers remain whenever Docker still needs
them. On first deploy only the current image exists; from the second successful
deploy onward at most two stable HA Bot image objects remain locally.

Registry-side GHCR versions stay immutable and are not deleted by this host-side
policy. Adding registry retention would require a separately reviewed package
permission and lifecycle policy.

### 5. Preserve the GitHub deployment contract

Keep the workflow's `main` guards, `production-deploy` concurrency, strict SSH
configuration, exact remote checkout, and `production` environment. Replace host
`pip install` plus systemd restart with:

- Buildx setup/build/push and digest output;
- temporary GHCR pull authentication transmitted without printing the token;
- invocation of the checked-out deploy script with the exact SHA/digest;
- final server-side assertions as the success boundary;
- logout/temporary credential cleanup on every exit path.

Required workflow permissions remain minimal: read repository contents, write
packages only in the image-publish job, and write deployments/read packages only
where required by the production job.

## Expected Change Set

- `Dockerfile`, `.dockerignore`: deterministic ARM64-capable runtime image.
- `compose.production.yml`: one isolated `ha-bot` service and project-local
  runtime bind mount.
- `scripts/deploy-production.sh`: validated cutover, verification, foreign
  invariants, and targeted image retention.
- `.github/workflows/deploy-production.yml`: build/publish/digest handoff plus
  Docker deploy while preserving current environment/trigger/SHA guarantees.
- deployment tests: fake `docker`, `systemctl`, and SSH-side inputs to assert
  order, failure semantics, scoping, idempotency, and retention.
- operator docs and process configuration: Docker/GHCR contract, secret names,
  clean-cutover warning, verification, recovery, and new deploy product paths.
- `specs/006-docker-production-deployment/`: complete feature memory.

No change to Telegram or appointment-domain behavior is planned.

## Constitution Check

- Spec-first: this complete feature folder is created before the product/deploy
  implementation and remains the acceptance source of truth.
- Testable boundaries: the deploy lifecycle is a standalone shell boundary with
  fake-CLI command-contract tests; image and Compose artifacts are validated
  locally without the production host.
- Test-first bias: failure-order, project-scope, retention, and no-rollback tests
  are added before final deploy wiring, or any deferred integration evidence is
  recorded explicitly.
- Supervised verification: each acceptance criterion maps to local evidence or a
  named post-merge server assertion; summaries alone do not close the task.
- PR-only / one worktree: all changes remain in one feature branch, worktree, and
  PR until required checks and review are green.
- Deployability: preflight and image pull precede cutover; after cutover, the
  Docker runtime is the only supported production path by owner decision.
- Simplicity: one Compose service and one deploy script; the retention ledger is
  the minimum state needed to distinguish stable images from merely pulled or
  failed candidates.
- Process memory: decisions, dead ends, verification output, post-merge evidence,
  and known issues are recorded in `tasks.md` before completion.

## Complexity Tracking

- A standalone deploy script is introduced because lifecycle ordering, foreign
  resource isolation, and image cleanup are difficult to test safely inside an
  inline workflow heredoc. It also gives the host one auditable command boundary.
- A two-entry atomic retention ledger is introduced because image creation time
  cannot prove that an image ever passed production verification. The ledger
  distinguishes `stable` from `pulled`, enabling exact current/previous retention
  without global cleanup.
- No container orchestrator, reverse proxy, custom Docker network, or general
  deployment framework is added; one worker does not justify them.

## Verification

| Acceptance area | Planned evidence |
| --- | --- |
| Exact ARM64 artifact | Buildx metadata proves platform `linux/arm64`; inspect imported/pulled image architecture and OCI revision; workflow passes the captured digest to production. |
| Pre-cutover safety | A workflow contract test asserts login → pull → token removal → deploy-script ordering. Fake-CLI tests inject config, model, digest, ledger, and Docker-enumeration failures and assert no `systemctl disable/stop` or mutating Compose call occurred. |
| Clean cutover | Tests assert `disable --now` precedes Compose `up`; server evidence confirms systemd inactive/disabled and one running `ha-bot` container. |
| No legacy rollback | Post-cutover failure test asserts non-zero exit and no systemd enable/start/restart command. |
| Compose isolation | `docker compose config`, static assertions, and server inspect prove one service, project `ha-bot`, no host ports/host network/external networks. |
| Foreign resources | Fake-CLI tests reject foreign selectors; server before/after snapshot comparison proves the same six foreign container IDs remain running. |
| Image retention | Multi-deploy tests cover first success, second success, third-success eviction, failed candidate exclusion, idempotent redeploy, exact repository match, and in-use/no-force behavior. |
| No global impact | Static scan rejects prune, Docker daemon restart, reboot/shutdown, and unscoped Compose down/stop/rm commands. |
| Secret hygiene | Diff/log scan confirms only secret names and placeholders; no environment values, tokens, private endpoints, or personal paths. |
| End-to-end deployment | Post-merge `main` Actions run records green required checks and `production` deployment with matching merge SHA/image digest plus server assertions. |

Local commands include, as available in the repository/tooling:

- `pnpm run preflight`
- deployment command-contract unit tests
- `actionlint .github/workflows/deploy-production.yml`
- `shellcheck scripts/deploy-production.sh`
- `docker compose --project-name ha-bot -f compose.production.yml config`
- Buildx `linux/arm64` build and image architecture/revision inspection
- `git diff --check` and a targeted sensitive-data/global-command scan

## Delivery Sequence

1. Add failing/static deploy contract tests and container/Compose artifacts.
2. Implement the scoped deploy script and two-stable-image retention.
3. Update the GitHub workflow to build, publish, and deploy the exact digest.
4. Update operator docs/process config and run all local verification.
5. Push one branch, open one PR, run required checks, address review, and keep the
   PR unmerged until gates are green.
6. After owner-approved merge, observe the `main` production run and record the
   server-side acceptance evidence in process memory or the PR without secrets.

## Risks

- Post-cutover startup failure leaves the bot unavailable because automatic
  systemd rollback is intentionally excluded. Mitigation: render, authenticate,
  pull, and verify the candidate artifact before cutover; retain the previous
  stable Docker image for explicit manual Docker recovery.
- A broad cleanup command could affect shared workloads. Mitigation: exact
  repository equality, explicit two-image keep-set, no force, command-contract
  tests, and a hard prohibition on prune.
- ARM64 mismatch could make a valid image unusable on the host. Mitigation: build
  and inspect only `linux/arm64` before production deployment.
- A short-lived process can appear running and then restart. Mitigation: use a
  bounded stability window and verify restart count/state before marking stable.
- The post-merge deployment is the first complete integration test of the clean
  cutover. Mitigation: preserve all pre-cutover gates and require explicit
  server-side evidence before declaring the feature complete.
