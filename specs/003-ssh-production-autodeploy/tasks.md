# Tasks: SSH Production Autodeploy

## Setup

- [x] T001 Refresh GitHub state and confirm no open PR is being modified.
- [x] T002 Create isolated worktree and branch from fresh `origin/main`.
- [x] T003 Read current feature-memory, workflow, docs index, and constitution
  requirements.

## Implementation

- [x] T004 Add `Deploy Production` workflow for `main` pushes and manual `main`
  redeploys.
- [x] T005 Require strict SSH known-hosts configuration and named deploy secrets.
- [x] T006 Add deploy documentation and update the docs index.
- [x] T007 Add complete feature memory for the workflow change.

## Verification

- [x] T008 Parse deployment workflow YAML locally.
- [x] T009 Run `pnpm run preflight`.
- [x] T010 Scan changed files for accidental secret-like values and private
  paths.
- [x] T011 Record post-merge deployment failure root cause.
- [x] T012 Validate workflow repository fetch fix locally.
- [x] T013 Run `pnpm run preflight`.
- [x] T014 Validate remote HTTPS fetch auth pattern on `bots`.
- [ ] T015 Record GitHub PR checks after push.

## Process Memory

### Dead Ends

- No existing repository secrets or deployment workflow were present, so the
  implementation defines a new secret contract instead of reusing one.
- The first post-merge deployment reached the remote host, but the remote clone
  could not fetch from GitHub because `github.com` was missing from the
  deployment user's `known_hosts`.
- After repairing `known_hosts` on the remote host, the same deployment path
  failed with `git@github.com: Permission denied (publickey)`, showing that the
  remote clone also lacked GitHub SSH repository credentials.
- Rerunning the old failed workflow and dispatching a fresh manual deployment
  after the server-side `known_hosts` repair produced jobs with no runner steps;
  GitHub check-run annotations reported an account billing or spending-limit
  blocker.

### Decisions

- Use GitHub environment `production` on the deploy job because that is what
  populates the repository Deployments block.
- Require `BOTS_SSH_KNOWN_HOSTS` and keep strict host checking enabled.
- Keep the remote deployment script inline because this repository has one SSH
  production target and no shared deploy framework.
- Fetch the repository over HTTPS with the job-scoped `GITHUB_TOKEN` instead of
  requiring a permanent GitHub SSH key on `bots`.

### Known Issues

- Real SSH deployment success must be confirmed from the post-merge GitHub run.
- GitHub Actions jobs will not start until the repository owner's account
  billing or spending-limit blocker is resolved in GitHub settings.
