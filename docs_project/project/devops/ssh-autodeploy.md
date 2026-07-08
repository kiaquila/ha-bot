# SSH Autodeploy

Merges to `main` trigger `.github/workflows/deploy-production.yml`.
The workflow first runs the repository preflight, then starts a GitHub
environment job named `production`. That job is what makes GitHub show the
latest deployment in the repository `Deployments` block.

## Required Secrets

- `BOTS_SSH_HOST`: SSH host name or address reachable from GitHub Actions.
- `BOTS_SSH_USER`: SSH user for the deployment host.
- `BOTS_SSH_PRIVATE_KEY`: private key for the deployment user.
- `BOTS_SSH_KNOWN_HOSTS`: pinned host key entry for strict SSH verification.
- `BOTS_DEPLOY_PATH`: path to an existing clone of this repository on the host.
- `BOTS_SYSTEMD_SERVICE`: systemd unit to restart after the checkout updates.

## Optional Secrets

- `BOTS_SSH_PORT`: SSH port; defaults to `22`.
- `BOTS_INSTALL_COMMAND`: replaces the default `python3 -m pip install -r requirements.txt`.
- `BOTS_RESTART_COMMAND`: replaces the default systemd restart and health check.

## Host Expectations

The deployment user must be able to SSH to the host, update the repository clone
from `origin main`, install Python dependencies, and restart the worker service.
Runtime secrets such as the Telegram bot token stay on the host or in the
service manager; they are not stored in the repository.

## Runtime Persistence (optional)

The worker can persist encrypted state (credentials, selected patient, active
tasks) so monitoring survives a restart. Configure these as host/service-manager
environment variables — not GitHub Actions secrets and never committed:

- `HA_CRED_KEY`: url-safe base64 32-byte Fernet key. When set, the bot encrypts
  state at rest with it; when unset, the bot runs in memory only (state lost on
  restart). Generate with
  `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
- `HA_STATE_PATH` (optional): path to the encrypted state file (default
  `ha_state.enc`). Point it at a directory that persists across deploys and
  restarts. The default deploy resets the clone with `git reset --hard` (which
  keeps untracked files), but a path outside the checkout is safest. Rotating or
  losing `HA_CRED_KEY` makes an existing state file unreadable; the bot then
  starts empty and users re-authorize.

The remote host does not need a persistent GitHub deploy key. During deployment,
the workflow fetches the repository over HTTPS with the job-scoped
`GITHUB_TOKEN`, then resets the remote clone to the pushed SHA.

Manual redeploys can be started from the `Deploy Production` workflow, using the
`main` branch.
