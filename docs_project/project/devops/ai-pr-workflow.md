# AI PR Workflow

The active required-check list is `.unicorn-hub/config.json` (`requiredChecks`).

PRs are merge-ready only when all checks are green, blocking findings are
resolved, docs/specs are updated, and no conflicts remain.

`AI Review` is event-driven. It fails when a trusted current-head review request
or review evidence is missing. A trusted human review trigger records the
current head SHA, then review-result events rerun the check until acceptable
current-head evidence appears.

Before merge, the author should confirm:

- every acceptance criterion has evidence in the PR, plan, or linked checks
- a negative scenario is covered or explicitly waived
- process memory records dead ends, decisions, and known issues
- any remaining known issue is accepted by the human merge owner
