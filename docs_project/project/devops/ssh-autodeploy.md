# SSH Autodeploy

Merges to `main` trigger `.github/workflows/deploy-production.yml`. The workflow
runs the repository preflight, publishes a Linux ARM64 image to GHCR, and then
starts the GitHub environment job named `production`. The production job checks
out the pushed commit on the host and deploys the image by its immutable digest.

## Required secrets

- `BOTS_SSH_HOST`: SSH host name or address reachable from GitHub Actions.
- `BOTS_SSH_USER`: SSH deployment user.
- `BOTS_SSH_PRIVATE_KEY`: private key for that user.
- `BOTS_SSH_KNOWN_HOSTS`: pinned host-key entry for strict verification.
- `BOTS_DEPLOY_PATH`: existing repository clone on the host.
- `BOTS_SYSTEMD_SERVICE`: legacy bot unit to stop and disable during the clean
  Docker cutover. The value remains required so later deploys can verify that
  the old worker stays disabled. For shared-host safety, the deploy script
  accepts only the known HA Bot unit `ha_bot.service` and rejects every other
  systemd target.

`BOTS_SSH_PORT` is optional and defaults to `22`. No persistent registry token
is required: the workflow uses its job-scoped `GITHUB_TOKEN` and deletes its
temporary Docker client configuration before the job exits.

## Host contract

The host must provide:

- an ARM64 Linux Docker Engine with the Compose v2 plugin;
- an existing repository clone at `BOTS_DEPLOY_PATH`;
- a mode-restricted `.env` in that clone containing a non-empty `BOT_TOKEN`;
- permission for the deployment user to run Docker and to stop, disable, and
  query the legacy systemd unit with `sudo`;
- enough writable space for `runtime-data/` and two HA Bot image versions.

Runtime secrets stay in the host `.env`; they are never copied into an image or
the repository. `HA_CRED_KEY` remains optional. Compose always sets
`HA_STATE_PATH=/data/ha_state.enc` inside its private bind mount.

## Cutover and isolation

Before changing the bot, `scripts/deploy-production.sh` validates Docker,
Compose, the exact pulled image, the host `.env`, project-name ownership, and a
snapshot of all existing containers. It then stops and disables the legacy
systemd service and starts only:

```text
docker compose --project-name ha-bot --file compose.production.yml ...
```

The cutover intentionally starts with an empty `runtime-data/` directory. It
does not copy legacy state and has no automatic rollback to systemd. A failed
deployment leaves the workflow red for operator investigation.

The production service has no published ports, external networks, fixed
container name, privileged capabilities, or writable root filesystem. The
script verifies the exact image ID, a stable restart count, and that every
pre-existing non-HA container has the same running state after deployment.

## Image retention

After a successful verification, the host atomically records the current and
previous successful digest references in the host-only
`.deploy-state/stable-images` ledger. That directory is not mounted into the bot.
Cleanup resolves the two references to image IDs and considers only images
carrying this repository's OCI source label. It skips those IDs and every image
used by any container, then removes remaining candidates one by one with
`docker image rm --no-prune`, so Docker cannot cascade into untagged parent
layers.

There is deliberately no `docker image prune`, forced removal, volume cleanup,
network cleanup, or Compose command without the explicit `ha-bot` project. This
retention policy controls only the server's local image store; GHCR package
retention is outside this deployment's scope.

## Manual Docker recovery

The preferred recovery is a fix-forward merge to `main`. The retained previous
digest is an emergency artifact, not an automatic rollback. To activate it, an
operator must explicitly check out the revision stored in that image's OCI
revision label and invoke the same scoped deployment script with that revision,
digest, repository source, runtime UID/GID, and legacy service name. This keeps
all validation and foreign-container invariants in force. Recovery must not
restart systemd, use an unscoped Compose command, or prune Docker globally.

Manual redeploys can be started from the `Deploy Production` workflow on the
`main` branch.
