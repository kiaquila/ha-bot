import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isAcceptableCodexSummaryComment as accepts, classifyCodexNativeReview, latestCodexCommentResult } from '../scripts/ai-review-helpers.mjs';
import { shouldRouteAiReviewRerunEvent as routes, selectAiReviewRun, rerunAiReviewForPrHead } from '../scripts/ai-review-rerun.mjs';
const sha = '2667f79cd7676ff331730cabf661d38dbbcddb0d';
const before = '2026-10-15T10:00:00Z', after = '2026-10-15T10:01:00Z';
const bot = { login: 'chatgpt-codex-connector[bot]', type: 'Bot' };
const legacy = "Codex Review: Didn't find any major issues. :rocket:\n\n**Reviewed commit:** `2667f79cd7`";
const observed = JSON.parse(readFileSync(new URL('./fixtures/native-codex-review.json', import.meta.url), 'utf8'));
const receipt = observed.receipt;
const marker = { agent: 'codex', sha, requestedAt: before };
const comment = (body, extra = {}) => ({ id: 2, user: bot, body, created_at: after, ...extra });
function summary(code = {}, security = {}) {
  return '<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 ' + JSON.stringify({
    code_review: { commit_sha: sha, has_any_findings: false, has_unresolved_findings: false, status: 'completed', ...code },
    security_review: { commit_sha: null, has_any_findings: null, has_unresolved_findings: null, status: null, ...security }
  }) + ' -->\n\n## Codex Review Summary\n\n| Review | Status | Commit | Review trigger |\n| 📝 **Code Review** | ✅ **Completed** | `2667f79` | Manual request |';
}
test('observed receipt, legacy and informational footer pass', () => {
  assert.equal(accepts(comment(observed.summary), sha, marker), true);
  for (const body of [legacy, receipt, receipt.replace(':rocket:', 'Keep it up!'), legacy + '\n<details> <summary>ℹ️ About Codex in GitHub</summary>\nInformation\n</details>']) assert.equal(accepts(comment(body), sha, marker), true);
  const noSha = comment("Codex Review: Didn't find any major issues.");
  assert.equal(accepts(noSha, sha, marker), true); assert.equal(accepts(noSha, sha), false);
});
test('receipt rejects wrong/missing/ambiguous SHA, spoofing, malformed markers and conflicts', () => {
  for (const body of [receipt.replace('2667f79cd7', 'aaaaaaaaaa'), receipt.replace('2667f79cd7', sha.slice(0, 9)), receipt.split('\n\n**')[0], receipt + '\n**Reviewed commit:** `aaaaaaaaaa`', '<!-- codex-review-receipt:v1 -->\n' + receipt, receipt.replace('receipt:v1', 'receipt:v2'), receipt + '\nP2: blocker', receipt + '\nUnresolved issues.', receipt.replace("Didn't find any major issues.", 'Running.'), receipt.replace("Didn't find any major issues.", 'Found issues.')]) assert.equal(accepts(comment(body), sha, marker), false, body);
  assert.equal(accepts(comment(receipt, { user: { login: 'spoof[bot]' } }), sha, marker), false);
  assert.equal(accepts(comment(receipt), ''), false);
});
test('structured summary requires exact schema, full SHA, explicit verdict, completed state and matching row', () => {
  assert.equal(accepts(comment(summary()), sha, marker), true);
  for (const code of [{ commit_sha: sha.slice(0, 10) }, { commit_sha: 'a'.repeat(40) }, { commit_sha: null }, { status: 'in_progress' }, { status: 'failed' }, { status: null }, { has_any_findings: 'false' }, { has_any_findings: null }, { has_any_findings: true }, { has_unresolved_findings: true }, { extra: false }]) assert.equal(accepts(comment(summary(code)), sha, marker), false, JSON.stringify(code));
  for (const body of [summary().replace('"has_any_findings":false', '"has_any_findings":true,"has_any_findings":false'), summary().replace('"code_review":', '"other":'), summary().replace('"completed"', 'completed'), summary() + '\n<!-- codex-review-state:v1 {} -->', summary().replace('**Completed**', '**Running**'), summary().replace('`2667f79`', '`aaaaaaa`'), summary() + '\n[P1] Defect', summary() + '\nFound unresolved issues.', summary().replace('**Completed** |', '**Completed** Failed |'), summary() + '\n<!-- codex-review-receipt:v1 -->']) assert.equal(accepts(comment(body), sha, marker), false, body);
  assert.equal(accepts(comment(summary({}, { has_any_findings: 'false' })), sha, marker), false);
});
test('edited summary uses updated_at; newer negative/unfinished result overrides previous clean receipt', () => {
  const old = comment(receipt, { created_at: before });
  const edited = comment(summary(), { id: 1, created_at: '2026-10-14T10:00:00Z', updated_at: after });
  assert.equal(latestCodexCommentResult([old, edited], sha, marker), 'pass');
  assert.equal(latestCodexCommentResult([old, comment(receipt.replace('receipt:v1', 'receipt:v2'))], sha, marker), 'pending');
  assert.equal(latestCodexCommentResult([old, { ...edited, body: summary({ status: 'in_progress' }) }], sha, marker), 'pending');
  assert.equal(latestCodexCommentResult([old, { ...edited, body: summary({ has_any_findings: true }) }], sha, marker), 'fail');
  assert.equal(latestCodexCommentResult([comment(receipt), { ...edited, body: summary({ status: 'in_progress' }) }], sha, marker), 'pending');
});
test('formal reviews preserve P0-P2 severity and require exact commit_id', () => {
  const review = { id: 1, user: bot, commit_id: sha, state: 'COMMENTED' };
  assert.equal(classifyCodexNativeReview(review, [], sha), 'pass');
  for (const commit_id of [undefined, 'a'.repeat(40), sha.slice(0, 10)]) assert.equal(classifyCodexNativeReview({ ...review, commit_id }, [], sha), null);
  for (const body of ['P0', 'P1', 'P2', 'unknown']) assert.equal(classifyCodexNativeReview(review, [{ pull_request_review_id: 1, user: bot, body }], sha), 'fail');
  assert.equal(classifyCodexNativeReview(review, [{ pull_request_review_id: 1, user: bot, body: 'P3 advisory' }], sha), 'pass');
});
const workflow = readFileSync(new URL('../.github/workflows/ai-review-rerun.yml', import.meta.url), 'utf8');
const filter = workflow.match(/    if: \|\n([\s\S]*?)    runs-on:/)[1];
const workflowRoutes = (event, name = 'issue_comment') => new Function('github', 'startsWith', 'contains', `return (${filter});`)({ event_name: name, event }, (s, p) => s?.startsWith(p), (s, p) => s?.includes(p));
test('actual workflow filter and runtime router handle created/edited signals', () => {
  assert.match(workflow, /types: \[created, edited\]/); assert.match(workflow, /cancel-in-progress: false/);
  for (const action of ['created', 'edited']) for (const body of [legacy, receipt, summary(), receipt.replace('receipt:v1', 'receipt:v2')]) {
    const event = { action, issue: { number: 1, pull_request: {} }, comment: comment(body) };
    assert.equal(workflowRoutes(event), true); assert.equal(routes(event), true);
    assert.equal(routes({ ...event, comment: comment(body, { user: { login: 'spoof[bot]', type: 'Bot' } }) }), false);
    assert.equal(routes({ ...event, issue: {} }), false); assert.equal(routes({ ...event, action: 'deleted' }), false);
  }
  assert.equal(routes({ action: 'created', issue: { pull_request: {} }, comment: comment('👍 Completed') }), false);
  assert.equal(routes({ action: 'submitted', review: { user: bot } }), true);
  assert.equal(workflowRoutes({ review: { user: bot } }, 'pull_request_review'), true);
});
const run = (extra = {}) => ({ id: 10, event: 'pull_request', head_sha: sha, created_at: before, run_started_at: before, status: 'completed', conclusion: 'failure', ...extra });
test('newest current-head run wins over old failed runs', () => {
  assert.equal(selectAiReviewRun([run(), run({ id: 11, created_at: after, conclusion: 'success' })], sha).action, 'already_success');
  assert.equal(selectAiReviewRun([run({ head_sha: 'a'.repeat(40) })], sha).action, 'not_found');
});
async function requeue({ runs = [run()], move = false, evidenceUpdatedAt = after, waitMs = 5000 } = {}) {
  let time = 0, gets = 0, lists = 0, posts = 0;
  const result = await rerunAiReviewForPrHead({ token: 'fixture', repository: 'example/repo', headSha: sha, prNumber: 1, evidenceUpdatedAt, waitMs,
    now: () => time, sleep: async (ms) => { time += ms; },
    request: async (_token, _repo, path, options = {}) => {
      if (options.method === 'POST') { posts++; return null; }
      if (path.endsWith('/pulls/1')) { gets++; return { state: 'open', head: { sha: move && gets > 1 ? 'b'.repeat(40) : sha } }; }
      return { workflow_runs: [runs[Math.min(lists++, runs.length - 1)]] };
    }
  }); return { result, posts, lists };
}
test('rerun covers active/completed gate, deduplication, updated successful gate and push race', async () => {
  assert.equal((await requeue()).posts, 1);
  const active = await requeue({ runs: [run({ status: 'in_progress' }), run()] }); assert.equal(active.posts, 1); assert.equal(active.lists, 2);
  assert.equal((await requeue({ move: true })).posts, 0); assert.equal((await requeue({ evidenceUpdatedAt: before })).posts, 0);
  assert.equal((await requeue({ runs: [run({ conclusion: 'success' })] })).posts, 1);
  await assert.rejects(requeue({ runs: [run({ status: 'in_progress' })], waitMs: 100 }), /bounded rerun wait expired/);
});
function gate(fixture = {}) {
  return spawnSync(process.execPath, ['--import', './tests/fixtures/ai-review-fetch.mjs', 'scripts/ai-review-gate.mjs'], { encoding: 'utf8', env: { ...process.env,
    GITHUB_TOKEN: 'fixture', GITHUB_REPOSITORY: 'example/repo', AI_REVIEW_PR_NUMBER: '1', AI_REVIEW_HEAD_SHA: sha, AI_REVIEW_AGENT: 'codex', AI_REVIEW_TRIGGER_MODE: 'skip', AI_REVIEW_WAIT_MS: '1', AI_REVIEW_POLL_MS: '1', AI_REVIEW_DEBOUNCE_MS: '0', AI_REVIEW_FIXTURE: JSON.stringify({ sha, receipt, ...fixture }) }
  });
}
test('actual gate CLI accepts receipt, legacy, edited summary and formal review', () => {
  for (const fixture of [{}, { body: legacy }, { body: summary(), edited: true }, { formal: true }, { noSha: true }]) { const result = gate(fixture); assert.equal(result.status, 0, result.stderr + result.stdout); }
});
test('actual gate blocks stale/missing SHA, findings before new request, unresolved P3 and races', () => {
  for (const fixture of [{ body: receipt.replace('2667f79cd7', 'aaaaaaaaaa') }, { noMarker: true }, { body: receipt.split('\n\n**')[0] }, { unresolved: true }, { unresolvedGraphqlBot: true }, { previousFailure: true }, { headRace: true }, { timelineRace: true }, { body: summary({ status: 'in_progress' }) }, { body: summary({ has_any_findings: true }) }, { spoof: true }, { graphqlError: true }, { missingFormalSha: true, body: 'Completed' }]) { const result = gate(fixture); assert.equal(result.status, 1, JSON.stringify(fixture) + result.stdout); }
});
