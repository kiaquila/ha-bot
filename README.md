# HA Bot

Telegram bot for monitoring Hospital Aleman appointment availability.

## Runtime

- Python service entrypoint: `bot.py`
- Service command: `worker: python bot.py` in `Procfile.py`
- Required runtime environment: `BOT_TOKEN`

Install bot dependencies:

```bash
python3 -m pip install -r requirements.txt
```

Run locally:

```bash
BOT_TOKEN=... python3 bot.py
```

## Multi-Agent Workflow

This repository carries the minimal Unicorn Hub control plane for PR-only,
review-gated development.

- `pnpm run preflight` runs local guardrails and Python syntax validation.
- `scripts/new-worktree.mjs --slug <feature>` creates an isolated in-repo worktree.
- Product-code PRs that touch `bot.py`, `requirements.txt`, or `Procfile.py` must include complete feature memory under `specs/<feature-id>/`.
- Required checks are listed in `.unicorn-hub/config.json`.
