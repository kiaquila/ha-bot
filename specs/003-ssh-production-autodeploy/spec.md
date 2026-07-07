# Spec: SSH Production Autodeploy

## Goal

Deploy the bot automatically to the SSH-accessible production host after changes
land on `main`, while publishing the result through GitHub Deployments.

## Scope

In scope:

- A GitHub Actions workflow that runs only for `main` pushes and manual `main`
  redeploys.
- A `production` environment job so GitHub records deployment status in the
  repository Deployments block.
- SSH-based remote checkout, dependency install, and worker restart.
- Operator documentation for the required secret names.

Out of scope:

- Provisioning the host, SSH key, systemd service, or runtime environment.
- Storing secret values, private hostnames, personal paths, or bot tokens in the
  repository.
- Changing bot command behavior.

## User Stories

### User Story 1

As the maintainer, I want a merge to `main` to update the production bot host
without a manual SSH session, so accepted fixes start running promptly.

### User Story 2

As the maintainer, I want GitHub to show the latest production deployment in the
repository sidebar, so I can see whether the current default branch is deployed.

## Acceptance Criteria

1. Given a commit is pushed to `main`, when repository preflight passes, then
   GitHub Actions starts a `production` environment deployment job.
2. Given required SSH secrets are configured, when the deployment job runs, then
   it connects to host alias `bots`, resets the remote clone to the pushed SHA,
   installs dependencies, and restarts or custom-runs the worker restart command.
3. Given required SSH configuration is missing, when the deployment job runs,
   then it fails before SSH and reports only missing secret names.
4. Given docs and specs are added, when the diff is reviewed, then no secret
   values, private URLs, patient identifiers, or personal filesystem paths are
   committed.

## Negative Scenarios

1. Given a workflow dispatch is started from a non-`main` ref, when jobs are
   evaluated, then the production deployment job is skipped.
2. Given a host key is not pinned in `BOTS_SSH_KNOWN_HOSTS`, when deployment
   configuration is validated, then deployment fails instead of disabling strict
   SSH host verification.
3. Given the remote checkout does not end at the pushed SHA, when deployment
   verifies the remote repository, then the job fails before restarting the
   worker.

## Requirements

- FR-001: Add a `Deploy Production` GitHub Actions workflow for `main` pushes and
  manual dispatches.
- FR-002: Run local guardrails before opening the production environment job.
- FR-003: Associate the deploy job with GitHub environment `production`.
- FR-004: Configure SSH from repository secrets and require strict known-hosts
  verification.
- FR-005: Reset the remote clone to the exact GitHub SHA being deployed.
- FR-006: Support default Python dependency install plus optional install and
  restart override commands.

## Success Criteria

- SC-001: `pnpm run preflight` passes locally on the PR branch.
- SC-002: The deploy workflow YAML parses locally.
- SC-003: After merge, the `Deploy Production` workflow creates a `production`
  deployment entry in GitHub.

## Assumptions

- The production host already has a clone of this repository and can fetch
  `origin main`.
- The deployment user can restart the worker service without an interactive
  password prompt, or the maintainer will provide `BOTS_RESTART_COMMAND`.
