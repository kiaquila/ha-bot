# Plan: SSH Production Autodeploy

## Summary

Add a first-party GitHub Actions workflow that verifies the repository, opens a
GitHub `production` environment deployment, and updates the remote bot host over
SSH.

## Technical Context

- runtime: Python Telegram worker
- deployment trigger: push to `main` or manual workflow dispatch on `main`
- deployment target: existing SSH host alias `bots`
- deployment status: GitHub environment `production`
- product paths: none from `.unicorn-hub/config.json`
- data changes: none

## Scope Boundaries

- in scope: workflow automation, SSH secret contract, deployment documentation,
  feature memory
- out of scope: remote host provisioning, token storage, service unit creation,
  bot behavior changes

## Constitution Check

- Spec-first: this PR includes complete feature memory for the workflow change.
- Testable boundaries: local validation covers preflight and YAML parsing; the
  real SSH integration is verified after secrets exist on GitHub.
- PR-only: changes remain on the `codex/autodeploy-ssh-bots` branch until merge.
- Simplicity: the workflow uses built-in SSH tooling and pinned first-party setup
  actions instead of adding a deploy action dependency.
- Deployability: deployment only starts after repository preflight passes.

## Complexity Tracking

No reusable abstraction is introduced. The SSH steps are kept in the workflow
because there is only one deployment target.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | `actionlint .github/workflows/deploy-production.yml` passed; local YAML assertion confirmed a `production` environment job exists after `deploy-preflight`. GitHub run after merge is final evidence. |
| AC-002 | Workflow remote script resets to `${{ github.sha }}`, installs dependencies, and restarts via systemd or `BOTS_RESTART_COMMAND`. |
| AC-003 | Workflow validation checks required secret names and exits before SSH configuration. |
| AC-004 | Secret scan over changed docs/spec/workflow files found no credential-shaped values, private URLs, or personal paths. |
| Post-merge deploy fix | Failed run 28885648768 reached `Deploy merged main to bots`, then remote `git fetch --prune origin main` failed first with `Host key verification failed` and then, after host-key repair, `Permission denied (publickey)`. This fix fetches the repository over HTTPS with the job-scoped `GITHUB_TOKEN` instead of relying on remote GitHub SSH credentials. |

Additional local evidence:

- `pnpm run preflight` passed.
- `git diff --check` passed.
- `actionlint .github/workflows/deploy-production.yml` passed after the
  HTTPS fetch change.
- `ssh bots` remote validation confirmed `git -c http.extraHeader=... ls-remote
  https://github.com/kiaquila/ha_bot.git main` succeeds without relying on
  remote GitHub SSH credentials.

Negative scenario evidence:

- Non-`main` refs are guarded by `if: github.ref == 'refs/heads/main'` on both jobs.
- SSH config uses `StrictHostKeyChecking yes` with required `BOTS_SSH_KNOWN_HOSTS`.
- Remote SHA verification compares `git rev-parse HEAD` with the deployed SHA
  before install and restart commands.
- Remote GitHub repository access uses the workflow job's ephemeral
  `GITHUB_TOKEN` over HTTPS instead of a permanent GitHub SSH key on `bots`.

## Risks

- The first production run cannot succeed until repository secrets are added in
  GitHub.
- Remote hosts using a virtualenv or non-systemd supervisor must provide
  `BOTS_INSTALL_COMMAND` or `BOTS_RESTART_COMMAND`.
- GitHub Deployments evidence is only available after this PR is merged and the
  workflow runs on `main`.
- The deployment job depends on the remote host being able to reach GitHub over
  HTTPS during `git fetch`.
- Rerunning the old failed workflow and dispatching a fresh manual deployment
  produced jobs with no runner steps because GitHub Actions reported an account
  billing or spending-limit blocker. Final deployment evidence requires that
  GitHub account issue to be resolved first.
