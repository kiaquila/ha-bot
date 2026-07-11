# HA Bot

Telegram bot for monitoring Hospital Aleman appointment availability.

## Runtime

- Python entrypoint: `bot.py`
- Required environment variable: `BOT_TOKEN`
- Optional `HA_CRED_KEY`: Fernet key for encrypted persistence. Without it, the
  bot keeps state in memory only.
- Optional `HA_STATE_PATH`: encrypted-state path for direct Python runs.
  Production Compose fixes it at `/data/ha_state.enc` in `runtime-data/`.

See `.env.example` for the complete runtime environment.

Run directly:

```bash
python3 -m pip install -r requirements.txt
BOT_TOKEN=... python3 bot.py
```

Run the production container contract locally on ARM64:

```bash
cp .env.example .env
# Set BOT_TOKEN in .env, then:
docker build --tag ha-bot:local .
mkdir -p runtime-data
HA_BOT_IMAGE=ha-bot:local HA_BOT_UID="$(id -u)" HA_BOT_GID="$(id -g)" \
  docker compose --project-name ha-bot --file compose.production.yml up -d
```

## Production deployment

A merge to `main` runs the repository preflight, builds a Linux ARM64 image,
pushes it to GHCR, and deploys that exact digest over SSH. The host runs only the
Compose project `ha-bot`; the deployment script does not publish ports, join
shared networks, prune Docker globally, or address containers from other
projects.

The first Docker deployment cleanly stops and disables the legacy systemd unit.
It does not migrate old runtime state and does not fall back to systemd on
failure. On the host, image retention keeps the current and previous successful
HA Bot image IDs; older unused HA Bot images are removed individually.

See `docs_project/project/devops/ssh-autodeploy.md` for the host contract and
required GitHub environment secrets.

## Multi-Agent Workflow

This repository carries the minimal Unicorn Hub control plane for PR-only,
review-gated development.

- `pnpm run preflight` runs local guardrails, Python validation, and tests.
- `scripts/new-worktree.mjs --slug <feature>` creates an isolated in-repo worktree.
- Product-code and production-runtime PRs must include complete feature memory
  under `specs/<feature-id>/`.
- Required checks are listed in `.unicorn-hub/config.json`.
