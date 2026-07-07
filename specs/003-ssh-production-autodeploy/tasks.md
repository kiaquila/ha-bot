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
- [ ] T011 Record GitHub PR checks after push.

## Process Memory

### Dead Ends

- No existing repository secrets or deployment workflow were present, so the
  implementation defines a new secret contract instead of reusing one.

### Decisions

- Use GitHub environment `production` on the deploy job because that is what
  populates the repository Deployments block.
- Require `BOTS_SSH_KNOWN_HOSTS` and keep strict host checking enabled.
- Keep the remote deployment script inline because this repository has one SSH
  production target and no shared deploy framework.

### Known Issues

- The first merged run will fail until the maintainer adds the required GitHub
  secrets.
- Real SSH deployment success must be confirmed from the post-merge GitHub run.
