# Tasks: Python Patch Refresh

## Setup

- [x] T001 Confirm the Dependabot PR head and grouped dependency changes.
- [x] T002 Create an isolated worktree on the existing PR branch.

## Implementation

- [x] T003 Retain the requested exact pins in `requirements.txt`.
- [x] T004 Add complete feature memory for the protected dependency change.
- [x] T005 Keep application, persistence, and deployment source unchanged.

## Verification

- [x] T006 Run `pnpm run preflight` on the final local tree (58 tests passed).
- [x] T007 Require green GitHub checks on the final PR head before merge.
- [x] T008 Require current-head Codex evidence and zero unresolved review threads before merge.

## Process Memory

### Decisions

- Keep both compatible patch updates in the existing grouped Dependabot PR.
- Preserve exact pins and validate the security-sensitive dependency update with the existing persistence tests.
- Record assisted-commit attribution in the commit trailer; GitHub identifies Kristina Aquila as the author and committer and OpenAI Codex as co-author.

### Known Issues

- The first Codex review reported a missing co-author trailer on `4ea4d10`, but both `git show` and GitHub commit metadata show the required final `Co-authored-by: OpenAI Codex <codex@openai.com>` trailer. The stale finding must be resolved and review rerun on the next head.
