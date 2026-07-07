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

Manual redeploys can be started from the `Deploy Production` workflow, using the
`main` branch.
