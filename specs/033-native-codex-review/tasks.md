# Tasks and Process Memory

- [x] Verify GitHub identity, refresh refs, compare main with origin/main.
- [x] Create a dedicated branch and in-repository worktree from origin/main.
- [x] Reproduce receipt-prefix rejection before changes.
- [x] Implement strict native-format classification and latest-result selection.
- [x] Wire unresolved findings and head-race validation into the required gate.
- [x] Fix workflow routing and bounded rerun after active-gate completion.
- [x] Connect substantive Node regressions to preflight and baseline CI.
- [ ] Record successful full local preflight.
- [ ] Obtain current-head native review, resolve findings, and pass required checks.
- [ ] Verify readiness, observe 120 seconds, recheck, and merge normally.

## Decisions

- Accept only observed versioned markers. Unknown or malformed evidence fails closed.
- Structured summaries require explicit clean code-review flags; findings require
  resolution and a fresh positive review, never a new administrative marker alone.
- Configuration follows trusted scripts rather than the PR checkout.
- Preserve the default-branch execution boundary during initial rollout.

## Dead ends and known issues

- Context7 rejected documentation lookup because its monthly quota was exhausted;
  official GitHub Actions and OpenAI documentation were read directly.
- Initial test-file creation failed when the execution host temporarily exhausted
  disk space. Free space recovered before retry; no source or cache was deleted.
- Initial rollout still needs real native evidence compatible with the old gate.
  The updated gate cannot validate its own PR through default-branch scripts yet.
