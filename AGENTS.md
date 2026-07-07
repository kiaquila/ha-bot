# AGENTS.md - HA Bot

HA Bot is a Telegram bot that monitors Hospital Aleman appointment slots.

- Primary stack: Python Telegram bot with HTTP polling.
- Deploy target: service worker from `Procfile.py`.
- Owner model: project-specific human merge owner.

## Hard Rules

- Product-code changes must use one branch, one worktree, and one pull request.
- Product-code PRs must include one complete `specs/<feature-id>/` folder with `spec.md`, `plan.md`, and `tasks.md`.
- Acceptance criteria need concrete verification evidence before merge.
- Run `pnpm run preflight` or the configured equivalent before pushing.
- Never push directly to `main` or merge with missing, queued, red, or stale required checks.
- Do not put secrets, bearer tokens, patient identifiers, private URLs, or personal paths in docs, specs, examples, or templates.

## Task-Scoped Reading

Start with the active task, not a repository tour:

1. active `specs/<feature-id>/spec.md`
2. active `specs/<feature-id>/plan.md`
3. active `specs/<feature-id>/tasks.md`
4. `.unicorn-hub/config.json`
5. `docs_project/README.md` only as an index
6. relevant source files found by search or imports

Read `.specify/memory/constitution.md` when creating or changing feature memory.

## Completion

A task is complete only when the current PR head has green required checks, no blocking review findings, evidence for acceptance criteria, current process memory, and no unresolved conflicts.
