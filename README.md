# HA Bot

Telegram bot for monitoring Hospital Aleman appointment availability.

## Runtime

- Python service entrypoint: `bot.py`
- Service command: `worker: python bot.py` in `Procfile.py`
- Required runtime environment: `BOT_TOKEN`
- Optional runtime environment:
  - `HA_CRED_KEY` — Fernet key that enables encrypted on-disk persistence, so
    credentials, the selected patient, and active tasks survive a restart. When
    unset, the bot keeps state in memory only (lost on restart). Generate a key
    with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
  - `HA_STATE_PATH` — path to the encrypted state file (default `ha_state.enc`);
    point it at a location that persists across restarts on the deploy host.

See `.env.example` for the full set of environment variables.

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
