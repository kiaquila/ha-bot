# AGENTS.md - HA Bot

HA Bot is a Telegram bot that monitors Hospital Aleman appointment slots.

- Primary stack: Python Telegram bot with HTTP polling.
- Deploy target: ARM64 Docker image from GHCR, run by the isolated
  `compose.production.yml` project. `Procfile.py` is retained for local and
  legacy tooling only.
- Owner model: project-specific human merge owner.

## Hard Rules

- Product-code changes must use one branch, one worktree, and one pull request.
- Product-code PRs must include one complete `specs/<feature-id>/` folder with `spec.md`, `plan.md`, and `tasks.md`.
- Acceptance criteria need concrete verification evidence before merge.
- Run `pnpm run preflight` or the configured equivalent before pushing.
- Never push directly to `main` or merge with missing, queued, red, or stale required checks.
- Do not put secrets, bearer tokens, patient identifiers, private URLs, or personal paths in docs, specs, examples, or templates.
- Every commit, merge commit, and squash-merge message must end with a `Co-authored-by:` trailer for the AI agent(s) involved (see Commit Protocol).

## Commit Protocol

Every commit — including GitHub's **Create a merge commit** and **Squash and merge** commits that land a PR on `main` — must end with a `Co-authored-by:` trailer identifying the AI agent(s) that produced the change, so AI authorship is recorded in the permanent history. This is mandatory, not optional.

- Put the trailer in the message footer: a blank line, then one `Co-authored-by: <Name> <email>` line per contributing agent. The trailer key is case-insensitive; GitHub renders these lines as co-authors.
- Examples: `Co-authored-by: Claude Opus 4.8 <noreply@anthropic.com>` or
  `Co-authored-by: OpenAI Codex <codex@openai.com>`.
- GitHub does not reliably copy trailers from PR commits into the final merge
  message. Before pressing the merge button, edit the final message and append the
  trailer(s), whether using **Create a merge commit** or **Squash and merge**.
- For example, a normal GitHub merge commit must end exactly like this:

  ```text
  Merge pull request #123 from kiaquila/feature-branch

  Add Docker production deployment

  Co-authored-by: OpenAI Codex <codex@openai.com>
  ```

- Do not complete the merge if the final message lacks the required trailer(s).
- Credit the AI collaborator alongside the human author; never attribute changes to
  a person who did not write them.

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
