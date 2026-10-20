# Tasks and evidence

- [x] Refresh refs and isolate a worktree from origin/main.
- [x] Preserve strict receipt-only authority; rely on closed structured verdicts for modern evidence.
- [x] Test unseen closings, contrary prose and latest invalidation.
- [x] Update durable review contract.
- [x] `pnpm preflight` passed: Python syntax/unit tests, 23 Node regression groups, feature-memory, repository and context checks.
- [ ] Obtain native final-head review and confirm required GitHub checks.

## Decision and dead end
Arbitrary suffix acceptance via a word exclusion list cannot prove a closing harmless. Discarded that experimental approach before publication. Structured state provides authority; presentation is never an additional verdict.

## CI security follow-up

OSV found GHSA-6q48-6c7w-9gw2 in transitive certifi 2026.7.22. Added a minimal explicit certifi 2026.10.19 constraint, the scanner-confirmed fixed version. No other dependency was changed.
