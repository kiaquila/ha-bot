import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { classifyCodexSummaryComment as classifyReceipt, latestCodexCommentResult as selectSummary, isAcceptableCodexSummaryComment as accepts, classifyCodexNativeReview, latestCodexNativeReviewResult, latestCodexCommentResult } from '../scripts/ai-review-helpers.mjs';
import { shouldRouteAiReviewRerunEvent as routes, selectAiReviewRun, rerunAiReviewForPrHead, rerunEvidenceUpdatedAt } from '../scripts/ai-review-rerun.mjs';
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
  }) + ' -->\n\n## Codex Review Summary\n\n| Review | Status | Commit | Review trigger |\n| 📝 **Code Review** | ✅ **Completed** <relative-time datetime="2026-10-15T10:01:00Z">2026-10-15T10:01:00Z</relative-time> | `2667f79` | Manual request |';
}
test('observed receipt, legacy and informational footer pass', () => {
  assert.equal(accepts(comment(observed.summary, { updated_at: "2026-10-15T21:49:23Z" }), sha, marker), true);
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
  for (const body of [summary().replace('"has_any_findings":false', '"has_any_findings":true,"has_any_findings":false'), summary().replace('"code_review":', '"other":'), summary().replace('"completed"', 'completed'), summary() + '\n<!-- codex-review-state:v1 {} -->', summary().replace('**Completed**', '**Running**'), summary().replace('`2667f79`', '`aaaaaaa`'), summary() + '\n[P1] Defect', summary() + '\n| Unexpected | Found major issues |', summary() + '\nFound unresolved issues.', summary().replace('**Completed**', '**Completed** Failed'), summary() + '\n<!-- codex-review-receipt:v1 -->']) assert.equal(accepts(comment(body), sha, marker), false, body);
  assert.equal(accepts(comment(summary({}, { has_any_findings: 'false' })), sha, marker), false);
  assert.equal(accepts(comment(summary({}, { commit_sha: [sha], has_any_findings: false, has_unresolved_findings: false, status: 'completed' })), sha, marker), false);
});
test('edited summary uses updated_at; newer negative/unfinished result overrides previous clean receipt', () => {
  const old = comment(receipt, { created_at: before });
  const edited = comment(summary(), { id: 1, created_at: '2026-10-14T10:00:00Z', updated_at: after });
  assert.equal(latestCodexCommentResult([old, edited], sha, marker), 'pass');
  assert.equal(latestCodexCommentResult([old, comment(receipt.replace('receipt:v1', 'receipt:v2'))], sha, marker), 'fail');
  assert.equal(latestCodexCommentResult([old, { ...edited, body: summary({ status: 'in_progress' }) }], sha, marker), 'pending');
  assert.equal(latestCodexCommentResult([old, { ...edited, body: summary({ has_any_findings: true, has_unresolved_findings: true }) }], sha, marker), 'fail');
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
const workflowRoutes = (event, name = 'issue_comment') => new Function('github', 'startsWith', 'contains', `return (${filter});`)({ event_name: name, event }, (s, p) => s?.toLowerCase().startsWith(p.toLowerCase()), (s, p) => s?.toLowerCase().includes(p.toLowerCase()));
test('actual workflow filter and runtime router handle created/edited signals', () => {
  assert.match(workflow, /types: \[created, edited, deleted\]/); assert.match(workflow, /cancel-in-progress: false/);
  for (const action of ['created', 'edited']) for (const body of [legacy, '\n  ' + legacy, receipt, summary(), receipt.replace('receipt:v1', 'receipt:v2'), '<!-- codex-review-state:v2 {} -->']) {
    const event = { action, issue: { number: 1, pull_request: {} }, comment: comment(body) };
    assert.equal(workflowRoutes(event), true); assert.equal(routes(event), true);
    assert.equal(routes({ ...event, comment: comment(body, { user: { login: 'spoof[bot]', type: 'Bot' } }) }), false);
    assert.equal(routes({ ...event, issue: {} }), false); assert.equal(routes({ ...event, action: 'deleted' }), true);
    assert.equal(routes({ ...event, action: 'unsupported' }), false);
  }
  assert.equal(routes({ action: 'created', issue: { pull_request: {} }, comment: comment('👍 Completed') }), true);
  assert.equal(routes({ action: 'submitted', review: { user: bot } }), true);
  assert.equal(workflowRoutes({ review: { user: bot } }, 'pull_request_review'), true);
});
const run = (extra = {}) => ({ id: 10, event: 'pull_request', head_sha: sha, created_at: before, run_started_at: before, status: 'completed', conclusion: 'failure', ...extra });
test('newest current-head run wins over old failed runs', () => {
  assert.equal(selectAiReviewRun([run(), run({ id: 11, created_at: after, conclusion: 'success' })], sha).action, 'already_success');
  assert.equal(selectAiReviewRun([run({ head_sha: 'a'.repeat(40) })], sha).action, 'not_found');
  assert.equal(selectAiReviewRun([run(), run({ id: 11, conclusion: 'success' })], sha).action, 'already_success');
  assert.equal(selectAiReviewRun([run({ event: 'workflow_dispatch', conclusion: 'success' }), run({ id: 11, created_at: after, conclusion: 'skipped' })], sha).action, 'already_success');
  assert.equal(selectAiReviewRun([run({ id: 10, conclusion: 'success' }), run({ id: 11, created_at: after, event: 'workflow_dispatch' })], sha).run.id, 10);
});
async function requeue({ runs = [run()], move = false, evidenceUpdatedAt = after, waitMs = 5000 } = {}) {
  let time = 0, gets = 0, lists = 0, posts = 0;
  const result = await rerunAiReviewForPrHead({ token: 'fixture', repository: 'example/repo', headSha: sha, prNumber: 1, evidenceUpdatedAt, waitMs,
    now: () => time, sleep: async (ms) => { time += ms; },
    request: async (_token, _repo, path, options = {}) => {
      if (options.method === 'POST') { posts++; return null; }
      if (path.endsWith('/pulls/1')) { gets++; return { state: 'open', head: { sha: move && gets > 1 ? 'b'.repeat(40) : sha } }; }
      assert.doesNotMatch(path, /event=pull_request/);
      return { workflow_runs: [runs[Math.min(lists++, runs.length - 1)]] };
    }
  }); return { result, posts, lists };
}
test('rerun covers active/completed gate, deduplication, updated successful gate and push race', async () => {
  assert.equal((await requeue()).posts, 1);
  const manual = await requeue({ runs: [run({ event: 'workflow_dispatch', conclusion: 'success' })] });
  assert.equal(manual.posts, 1); assert.equal(manual.result.run.event, 'workflow_dispatch');
  const active = await requeue({ runs: [run({ status: 'in_progress' }), run()] }); assert.equal(active.posts, 1); assert.equal(active.lists, 2);
  assert.equal((await requeue({ move: true })).posts, 0); assert.equal((await requeue({ evidenceUpdatedAt: '2026-10-15T09:59:59Z' })).posts, 0);
  assert.equal((await requeue({ evidenceUpdatedAt: before })).posts, 1);
  assert.equal((await requeue({ evidenceUpdatedAt: before, runs: [run({ conclusion: 'success' })] })).posts, 1);
  assert.equal((await requeue({ evidenceUpdatedAt: null, runs: [run({ conclusion: 'success' })] })).posts, 1);
  assert.equal((await requeue({ runs: [run({ conclusion: 'success' })] })).posts, 1);
  await assert.rejects(requeue({ runs: [run({ status: 'in_progress' })], waitMs: 100 }), /bounded rerun wait expired/);
});
function gate(fixture = {}) {
  return spawnSync(process.execPath, ['--import', './tests/fixtures/ai-review-fetch.mjs', 'scripts/ai-review-gate.mjs'], { encoding: 'utf8', env: { ...process.env,
    GITHUB_TOKEN: 'fixture', GITHUB_REPOSITORY: 'example/repo', AI_REVIEW_PR_NUMBER: '1', AI_REVIEW_HEAD_SHA: sha, AI_REVIEW_AGENT: 'codex', AI_REVIEW_TRIGGER_MODE: 'skip', AI_REVIEW_WAIT_MS: '1', AI_REVIEW_POLL_MS: '1', AI_REVIEW_DEBOUNCE_MS: '0', AI_REVIEW_FIXTURE: JSON.stringify({ sha, receipt, ...fixture }) }
  });
}
test('actual gate CLI accepts receipt, legacy, edited summary and formal review', () => {
  for (const fixture of [{}, { body: legacy }, { body: summary(), edited: true }, { formal: true }, { formal: true, advisory: true }, { noSha: true }]) { const result = gate(fixture); assert.equal(result.status, 0, result.stderr + result.stdout); }
});
test('actual gate blocks stale/missing SHA, findings before new request, unresolved P3 and races', () => {
  for (const fixture of [{ body: receipt.replace('2667f79cd7', 'aaaaaaaaaa') }, { noMarker: true }, { body: receipt.split('\n\n**')[0] }, { unresolved: true }, { unresolvedGraphqlBot: true }, { previousFailure: true }, { headRace: true }, { timelineRace: true }, { body: summary({ status: 'in_progress' }) }, { body: summary({ has_any_findings: true }) }, { body: summary({}, { commit_sha: sha, has_any_findings: true, has_unresolved_findings: true, status: 'completed' }) }, { spoof: true }, { graphqlError: true }, { missingFormalSha: true, body: 'Completed' }]) { const result = gate(fixture); assert.equal(result.status, 1, JSON.stringify(fixture) + result.stdout); }
});

test('actual manual runtime selection pins dispatch, checkout and PR head; ordinary events use main', async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const yaml = readFileSync(new URL('../.github/workflows/ai-review.yml', import.meta.url), 'utf8');
  assert.match(yaml, /permissions:\n  contents: read\n  pull-requests: read\n  issues: read/);
  assert.doesNotMatch(yaml, /first_install|skip\|comment/);
  const block = yaml.match(/- name: Select reviewed gate runtime[\s\S]*?        run: \|\n([\s\S]*?)\n      - name:/)[1].replace(/^          /gm, '');
  const dir = mkdtempSync(join(tmpdir(), 'ha-bot-review-selection-'));
  try {
    writeFileSync(join(dir, 'git'), '#!/bin/sh\nif [ "$1" = rev-parse ]; then echo "$FIXTURE_CHECKOUT_SHA"; else exit "$FIXTURE_DIRTY"; fi\n', { mode: 0o700 });
    for (const [extra, expected] of [
      [{}, 0], [{ REVIEWED_GATE_SHA: '' }, 0], [{ EVENT_NAME: 'pull_request' }, 1],
      [{ CURRENT_HEAD_SHA: 'a'.repeat(40) }, 1], [{ GITHUB_SHA: 'a'.repeat(40) }, 1],
      [{ FIXTURE_CHECKOUT_SHA: 'a'.repeat(40) }, 1], [{ FIXTURE_DIRTY: '1' }, 1],
      [{ REVIEWED_GATE_SHA: '', GITHUB_SHA: 'a'.repeat(40) }, 1],
      [{ REVIEWED_GATE_SHA: sha.slice(0, 10) }, 1], [{ SELECTED_AGENT: 'claude' }, 1]
    ]) {
      const output = join(dir, 'output');
      writeFileSync(output, '');
      const result = spawnSync('bash', ['-c', block], { encoding: 'utf8', env: { ...process.env,
        PATH: `${dir}:${process.env.PATH}`, FIXTURE_CHECKOUT_SHA: sha, FIXTURE_DIRTY: '0',
        REVIEWED_GATE_SHA: sha, CURRENT_HEAD_SHA: sha, GITHUB_SHA: sha,
        EVENT_ACTION: '', REVIEW_LABEL: '', EVENT_HEAD_SHA: sha, PR_LABELS: '[]',
        EVENT_NAME: 'workflow_dispatch', SELECTED_AGENT: 'codex', GITHUB_OUTPUT: output, ...extra
      } });
      assert.equal(result.status, expected, JSON.stringify(extra) + result.stderr);
      if (expected === 0) assert.equal(readFileSync(output, 'utf8').trim(),
        extra.REVIEWED_GATE_SHA === '' ? 'script_dir=.gate-trusted/scripts' : 'script_dir=scripts');
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('equal-time formal reviews prefer failure independently of API order or ID', () => {
  const positive = { id: 20, user: bot, commit_id: sha, state: 'APPROVED', submitted_at: after };
  const negative = { ...positive, id: 10, state: 'CHANGES_REQUESTED' };
  for (const reviews of [[positive, negative], [negative, positive]]) {
    assert.equal(latestCodexNativeReviewResult(reviews, [], sha), 'fail');
  }
  assert.equal(latestCodexNativeReviewResult([positive, { ...negative, submitted_at: undefined }], [], sha), 'fail');
  assert.equal(latestCodexNativeReviewResult([{ ...positive, submitted_at: undefined }], [], sha), null);
});


test('eligible labeled PR validation requires a writer and exact event, checkout and live SHA', async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const yaml = readFileSync(new URL('../.github/workflows/ai-review.yml', import.meta.url), 'utf8');
  assert.match(yaml, /types: \[opened, synchronize, reopened, ready_for_review, labeled\]/);
  const condition = yaml.match(/    if: \|\n([\s\S]*?)    runs-on:/)[1];
  const eligible = (action, label, draft = false) => new Function('github', 'startsWith', `return (${condition});`)(
    { event_name: 'pull_request', event: { action, label: { name: label }, pull_request: { draft } } },
    (s, p) => s?.toLowerCase().startsWith(p.toLowerCase()));
  assert.equal(eligible('labeled', 'gate:' + sha), true);
  // Unrelated labels must run the real trusted gate: a skipped required job would count as success.
  assert.equal(eligible('labeled', 'unrelated'), true);
  assert.equal(eligible('labeled', 'gate:' + sha, true), false);
  assert.equal(eligible('synchronize', ''), true);
  const block = yaml.match(/- name: Select reviewed gate runtime[\s\S]*?        run: \|\n([\s\S]*?)\n      - name:/)[1].replace(/^          /gm, '');
  const dir = mkdtempSync(join(tmpdir(), 'ha-bot-labeled-gate-'));
  try {
    writeFileSync(join(dir, 'git'), '#!/bin/sh\nif [ "$1" = rev-parse ]; then echo "$FIXTURE_CHECKOUT_SHA"; else exit "$FIXTURE_DIRTY"; fi\n', { mode: 0o700 });
    writeFileSync(join(dir, 'gh'), '#!/bin/sh\necho "$*" >> "$FIXTURE_GH_LOG"\ncase "$*" in *\"/events?\"*) echo "$FIXTURE_LABEL_EVENTS";; *) echo "$FIXTURE_PERMISSION";; esac\n', { mode: 0o700 });
    for (const [extra, expected, script] of [
      [{}, 0, 'scripts'], [{ FIXTURE_PERMISSION: 'write' }, 0, 'scripts'],
      [{ FIXTURE_PERMISSION: 'read' }, 1], [{ FIXTURE_PERMISSION: 'triage' }, 1],
      [{ FIXTURE_PERMISSION: '' }, 1], [{ FIXTURE_LABEL_ACTOR: '' }, 1],
      [{ GITHUB_ACTOR: 'read-only-trigger' }, 0, 'scripts'], [{ REVIEW_LABEL: 'gate:' + sha.slice(0, 10) }, 1],
      [{ REVIEW_LABEL: 'gate:' + 'a'.repeat(40) }, 1], [{ EVENT_HEAD_SHA: 'a'.repeat(40) }, 1],
      [{ CURRENT_HEAD_SHA: 'a'.repeat(40) }, 1], [{ FIXTURE_CHECKOUT_SHA: 'a'.repeat(40) }, 1],
      [{ FIXTURE_DIRTY: '1' }, 1], [{ SELECTED_AGENT: 'claude' }, 1],
      [{ EVENT_ACTION: 'synchronize', REVIEW_LABEL: 'gate:' + sha }, 0, 'scripts'],
      [{ EVENT_ACTION: 'reopened' }, 0, 'scripts'], [{ EVENT_ACTION: 'ready_for_review' }, 0, 'scripts'],
      [{ REVIEW_LABEL: 'unrelated' }, 0, 'scripts'],
      [{ REVIEW_LABEL: 'unrelated', PR_LABELS: '[]' }, 0, '.gate-trusted/scripts'],
      [{ EVENT_ACTION: 'synchronize', EVENT_HEAD_SHA: 'a'.repeat(40), CURRENT_HEAD_SHA: 'a'.repeat(40), FIXTURE_CHECKOUT_SHA: 'a'.repeat(40) }, 0, '.gate-trusted/scripts']
    ]) {
      const output = join(dir, 'output'); writeFileSync(output, '');
      const result = spawnSync('bash', ['-c', block], { encoding: 'utf8', env: { ...process.env,
        PATH: `${dir}:${process.env.PATH}`, FIXTURE_CHECKOUT_SHA: sha, FIXTURE_DIRTY: '0', FIXTURE_PERMISSION: 'admin',
        FIXTURE_LABEL_EVENTS: JSON.stringify([[{ event: 'labeled', label: { name: 'gate:' + sha }, actor: { login: extra.FIXTURE_LABEL_ACTOR ?? 'writer' } }]]), FIXTURE_GH_LOG: join(dir, 'gh-log'), PR_NUMBER: '1',
        REVIEWED_GATE_SHA: '', CURRENT_HEAD_SHA: sha, GITHUB_SHA: 'b'.repeat(40), EVENT_HEAD_SHA: sha,
        EVENT_NAME: 'pull_request', EVENT_ACTION: 'labeled', REVIEW_LABEL: 'gate:' + sha, PR_LABELS: JSON.stringify(['gate:' + sha]),
        GITHUB_REPOSITORY: 'example/repo', GITHUB_ACTOR: 'writer', SELECTED_AGENT: 'codex', GITHUB_OUTPUT: output, ...extra
      } });
      assert.equal(result.status, expected, JSON.stringify(extra) + result.stderr);
      if (expected === 0) assert.equal(readFileSync(output, 'utf8').trim(), 'script_dir=' + script);
      if (extra.GITHUB_ACTOR) {
        assert.match(readFileSync(join(dir, 'gh-log'), 'utf8'), /collaborators\/writer\/permission/);
        assert.doesNotMatch(readFileSync(join(dir, 'gh-log'), 'utf8'), /collaborators\/read-only-trigger/);
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('pre-merge rollout watcher requeues real PR gates on edited evidence and thread changes', async () => {
  const { watchRolloutReview } = await import('../scripts/ai-review-rollout-watch.mjs');
  async function watch({ changed = true, threadChange = false, move = false, missingRun = false, apiError = false, gateComments = false } = {}) {
    let tick = 0;
    const posts = [];
    await watchRolloutReview({ repository: 'example/repo', prNumber: 1, headSha: sha,
      now: () => tick * 1000, sleep: async () => { tick++; }, log: () => {}, maxMs: 10000,
      request: async (_token, _repo, path, options = {}) => {
        if (apiError) throw new Error('GitHub unavailable');
        if (path === '/graphql') return { data: { repository: { pullRequest: { reviewThreads: {
          pageInfo: { hasNextPage: false }, nodes: [{ id: 'thread', isResolved: !threadChange || tick === 0 }]
        } } } } };
        if (options.method === 'POST') { posts.push(path); return null; }
        if (path.endsWith('/pulls/1')) return { state: tick >= 2 ? 'closed' : 'open', merged: tick >= 2,
          head: { sha: move && tick > 0 ? 'a'.repeat(40) : sha } };
        if (path.includes('/actions/workflows/')) return { workflow_runs: missingRun ? [] : [run({ conclusion: 'success' })] };
        if (path.includes('/issues/1/comments')) return [{ id: 1, user: bot, body: changed && tick > 0 ? summary({ status: 'in_progress' }) : summary() }, ...(gateComments && tick > 0 ? [{ id: 2, user: { login: 'github-actions[bot]' }, body: 'AI Review gate failed.' }] : [])];
        return [];
      }
    });
    return posts;
  }
  assert.deepEqual(await watch(), ['/repos/example/repo/actions/runs/10/rerun']);
  assert.deepEqual(await watch({ changed: false }), []);
  assert.deepEqual(await watch({ changed: false, gateComments: true }), []);
  assert.deepEqual(await watch({ changed: false, threadChange: true }), ['/repos/example/repo/actions/runs/10/rerun']);
  await assert.rejects(watch({ move: true }), /head moved/);
  await assert.rejects(watch({ missingRun: true }), /could not invalidate/);
  await assert.rejects(watch({ apiError: true }), /GitHub unavailable/);
});

test('marker-removing edits route from the old body and cannot hide behind previous success', () => {
  for (const from of [receipt, summary(), '<!-- codex-review-state:v2 {} -->']) {
    const event = { action: 'edited', issue: { pull_request: {} }, comment: comment(''), changes: { body: { from } } };
    assert.equal(workflowRoutes(event), true); assert.equal(routes(event), true);
    assert.equal(routes({ ...event, comment: comment('', { user: { login: 'spoof[bot]' } }) }), false);
  }
  assert.equal(latestCodexCommentResult([comment(receipt, { updated_at: before }), comment('')], sha, marker), 'pending');
  const result = gate({ formal: true, formalSubmittedAt: '2026-10-15T10:00:30Z', body: '', edited: true });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.doesNotMatch(workflow, /first-install|script_dir=scripts/);
});


test('formal review edits and dismissals requeue without the original submission timestamp', () => {
  assert.match(workflow, /types: \[submitted, edited, dismissed\]/);
  for (const action of ['submitted', 'edited', 'dismissed']) {
    const event = { action, review: { user: bot, submitted_at: before } };
    assert.equal(workflowRoutes(event, 'pull_request_review'), true);
    assert.equal(routes(event), true);
    assert.equal(rerunEvidenceUpdatedAt(event), action === 'submitted' ? before : null);
    assert.equal(routes({ ...event, review: { ...event.review, user: { login: 'spoof[bot]' } } }), false);
  }
  const approval = { id: 1, user: bot, commit_id: sha, state: 'APPROVED', submitted_at: after };
  assert.equal(classifyCodexNativeReview({ ...approval, state: 'DISMISSED' }, [], sha), 'fail');
  assert.equal(classifyCodexNativeReview(approval, [{ pull_request_review_id: 1, user: bot, body: '[P1] defect' }], sha), 'fail');
  assert.equal(latestCodexNativeReviewResult([{ ...approval, id: 2 }, { ...approval, body: '[P1] edited old review', submitted_at: before }], [], sha), 'fail');
});


test('inline review mutations route and all blocking priority mentions are preserved', () => {
  for (const action of ['created', 'edited', 'deleted']) {
    const event = { action, pull_request: { number: 1 }, comment: { ...comment('[P3] advisory'), updated_at: after } };
    assert.equal(workflowRoutes(event, 'pull_request_review_comment'), true);
    assert.equal(routes(event), true);
    assert.equal(rerunEvidenceUpdatedAt(event), action === 'created' ? after : null);
    assert.equal(routes({ ...event, comment: comment('', { user: { login: 'spoof[bot]' } }) }), false);
  }
  const review = { id: 1, user: bot, commit_id: sha, state: 'COMMENTED' };
  assert.equal(classifyCodexNativeReview(review, [{ pull_request_review_id: 1, user: bot, body: '[P3] advisory with P1 blocker' }], sha), 'fail');
});


test('all new trusted Codex top-level comments route consistently with pending classification', () => {
  for (const body of ['', 'Unrecognized format', '<!-- CODEX-REVIEW-RECEIPT:v2 -->']) {
    const event = { action: 'created', issue: { pull_request: {} }, comment: comment(body) };
    assert.equal(workflowRoutes(event), true); assert.equal(routes(event), true);
    assert.equal(routes({ ...event, action: 'deleted' }), true);
    assert.equal(rerunEvidenceUpdatedAt({ ...event, action: 'deleted' }), null);
    assert.equal(latestCodexCommentResult([comment(receipt, { updated_at: before }), event.comment], sha, marker), 'pending');
  }
  assert.equal(routes({ action: 'created', issue: { pull_request: {} }, comment: comment('AI Review gate failed.', { user: { login: 'github-actions[bot]' } }) }), false);
});


test("unseen closings require an authoritative later structured verdict", () => {
  const head = '2667f79cd7676ff331730cabf661d38dbbcddb0d';
  const trusted = { login: 'chatgpt-codex-connector[bot]' };
  const request = { agent: 'codex', sha: head, requestedAt: '2026-10-15T01:00:00Z' };
  const make = (body, timestamp = '2026-10-15T02:00:00Z') => ({ id: 7, user: trusted, body, created_at: timestamp, updated_at: timestamp });
  for (const closing of ['Swish!', "You're on a roll.", 'Another round soon, please!', "Chef's kiss.",
    'May your coffee stay warm.', 'Authentication leaks credentials.', 'The deployment deletes all customer data.']) {
    const unknown = make(`<!-- codex-review-receipt:v1 -->\nCodex Review: Didn't find any major issues. ${closing}\n\n**Reviewed commit:** \`${head}\``);
    assert.notEqual(classifyReceipt(unknown, head, request), 'pass', closing);
    const clean = make(summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T03:00:00Z').replaceAll('2026-10-15T02:00:00Z', '2026-10-15T03:00:00Z'), '2026-10-15T03:00:00Z');
    assert.equal(selectSummary([unknown, clean], head, request), 'pass');
    assert.notEqual(selectSummary([clean, { ...unknown, updated_at: '2026-10-15T04:00:00Z' }], head, request), 'pass');
  }
  const clean = make(summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T03:00:00Z').replaceAll('2026-10-15T02:00:00Z', '2026-10-15T03:00:00Z'), '2026-10-15T03:00:00Z');
  for (const invalid of [
    summary({ status: 'in_progress' }), summary({ has_any_findings: true }),
    summary({ has_unresolved_findings: true }), summary({ commit_sha: 'a'.repeat(40) }),
    summary().replace('"has_any_findings":false', '"has_any_findings":true,"has_any_findings":false'),
    summary() + '\n<!-- codex-review-state:v1 {} -->', summary().replace('state:v1', 'state:v2'),
    summary() + '\nFound unresolved issues.'
  ]) assert.notEqual(selectSummary([clean, make(invalid, '2026-10-15T04:00:00Z')], head, request), 'pass', invalid);
});


test('actual gate requires newer structured authority and rejects late invalidation', () => {
  const unknown = receipt.replace(':rocket:', 'Swish!');
  for (const fixture of [{ body: unknown, extraBodies: [summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T10:03:00Z')] }]) {
    const result = gate(fixture); assert.equal(result.status, 0, result.stderr);
  }
  for (const body of [unknown, summary({ status: 'in_progress' }), summary({ has_any_findings: true }),
    summary({}, { commit_sha: sha, has_any_findings: false, has_unresolved_findings: false, status: 'running' })]) {
    const result = gate({ body: summary(), extraBodies: [unknown, body] }); assert.equal(result.status, 1, result.stdout);
  }
});


test("security-only edits cannot refresh or reorder old code completion", () => {
  const head = '2667f79cd7676ff331730cabf661d38dbbcddb0d';
  const user = { login: 'chatgpt-codex-connector[bot]' };
  const request = { agent: 'codex', sha: head, requestedAt: '2026-10-15T01:00:00Z' };
  const dated = (body, updated_at) => ({ user, body, created_at: '2026-10-15T00:00:00Z', updated_at });
  const codeAt = (time) => summary().replace(/datetime="[^"]+">[^<]+<\/relative-time>/g, `datetime="${time}">${time}</relative-time>`);
  const unknown = dated(`<!-- codex-review-receipt:v1 -->\nCodex Review: Didn't find any major issues. Needs work.\n\n**Reviewed commit:** \`${head}\``, '2026-10-15T02:30:00Z');
  const edited = dated(codeAt('2026-10-15T02:00:00Z'), '2026-10-15T03:00:00Z');
  assert.equal(selectSummary([unknown, edited], head, request), 'pending');
  const sameSecond = dated(codeAt('2026-10-15T02:30:00.070Z'), '2026-10-15T03:00:00Z');
  assert.equal(selectSummary([unknown, sameSecond], head, request), 'pending');
  assert.notEqual(classifyReceipt(dated(codeAt('2026-10-15T01:00:00.070Z'), '2026-10-15T03:00:00Z'), head, request), 'pass');
  assert.notEqual(classifyReceipt(dated(codeAt('2026-10-15T01:00:00Z'), '2026-10-15T03:00:00Z'), head, request), 'pass');
  assert.notEqual(classifyReceipt(dated(codeAt('2026-10-15T00:30:00Z'), '2026-10-15T03:00:00Z'), head, request), 'pass');
  assert.notEqual(classifyReceipt(dated(codeAt('2026-10-15T04:00:00Z'), '2026-10-15T03:00:00Z'), head, request), 'pass');
  assert.equal(selectSummary([unknown, dated(codeAt('2026-10-15T02:45:00Z'), '2026-10-15T03:00:00Z')], head, request), 'pass');
  assert.notEqual(classifyReceipt(dated(codeAt('2026-10-15T02:00:00Z').replace(/<relative-time[^>]+>[^<]+<\/relative-time>/, ''), '2026-10-15T03:00:00Z'), head, request), 'pass');
});


test('editing a static clean receipt cannot renew or reorder its approval', () => {
  const positive = comment(receipt, { created_at: '2026-10-15T10:01:00Z', updated_at: '2026-10-15T10:03:00Z' });
  const pending = comment(summary({ status: 'in_progress' }), { created_at: '2026-10-15T10:02:00Z', updated_at: '2026-10-15T10:02:00Z' });
  assert.equal(latestCodexCommentResult([positive, pending], sha, marker), 'pending');
  assert.notEqual(latestCodexCommentResult([comment(receipt, { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:03:00Z' })], sha, marker), 'pass');
});


test('new review requests can supersede historical prose failures and stale positive edits', () => {
  const oldFailure = comment('Codex Review: Found issues.', { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z' });
  const stale = comment(receipt, { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:03:00Z' });
  const fresh = comment(receipt, { created_at: '2026-10-15T10:02:00Z', updated_at: '2026-10-15T10:02:00Z' });
  assert.equal(latestCodexCommentResult([oldFailure, fresh], sha, marker), 'pass');
  assert.equal(latestCodexCommentResult([stale, fresh], sha, marker), 'pass');
});


test('formal review ordering uses code completion rather than security edit time', () => {
  const oldCode = comment(summary(), { created_at: '2026-10-15T10:01:00Z', updated_at: '2026-10-15T10:05:00Z' });
  const unknown = comment(receipt.replace(' :rocket:', ' Needs work.'), { created_at: '2026-10-15T10:03:00Z', updated_at: '2026-10-15T10:03:00Z' });
  const result = gate({ body: oldCode.body, comments: [oldCode, unknown], formal: true, formalSubmittedAt: '2026-10-15T10:04:00Z' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});


test('stale clean legacy edit cannot overtake current approval', () => {
  const stale = comment("Codex Review: Didn't find any major issues.", { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:03:00Z' });
  const fresh = comment(receipt, { created_at: '2026-10-15T10:02:00Z', updated_at: '2026-10-15T10:02:00Z' });
  assert.equal(latestCodexCommentResult([stale, fresh], sha, marker), 'pass');
  const result = gate({ body: fresh.body, comments: [stale] });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});


test('historical security findings require newer explicit clean security state', () => {
  const security = { commit_sha: sha, has_any_findings: true, has_unresolved_findings: true, status: 'completed' };
  const old = comment(summary({}, security), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z' });
  assert.notEqual(gate({ body: '', comments: [old], formal: true }).status, 0);
  const cleanBody = summary({}, { ...security, has_any_findings: false, has_unresolved_findings: false })
    .replaceAll('2026-10-15T10:01:00Z', '2026-10-15T10:05:00Z') + '\n| 🔒 **Security Review** | ✅ **Completed** <relative-time datetime="2026-10-15T10:05:00Z">2026-10-15T10:05:00Z</relative-time> | `2667f79` | Manual request |';
  const clean = comment(cleanBody, { created_at: '2026-10-15T10:05:00Z', updated_at: '2026-10-15T10:05:00Z' });
  assert.equal(gate({ body: '', comments: [old, clean] }).status, 0);
  const staleSecurity = { ...clean, body: clean.body.split('\n').map((line) => line.includes('**Security Review**') ? line.replaceAll('2026-10-15T10:05:00Z', '2026-10-15T09:00:00Z') : line).join('\n') };
  assert.notEqual(gate({ body: '', comments: [old, staleSecurity], formal: true }).status, 0);
  const missingTime = { ...clean, body: clean.body.split('\n').map((line) => line.includes('**Security Review**') ? line.replace(/ <relative-time[^>]+>[^<]+<\/relative-time>/, '') : line).join('\n') };
  assert.notEqual(gate({ body: '', comments: [old, missingTime], formal: true }).status, 0);
  for (const body of [old.body.replaceAll(sha, 'a'.repeat(40)), old.body.replace('"has_any_findings":true', '"has_any_findings":true,"has_any_findings":false')]) {
    assert.equal(gate({ body: '', comments: [{ ...old, body }], formal: true }).status, 0);
  }
});


test('security-only edits do not refresh a canonical typed finding clock', () => {
  const old = comment(summary({ has_any_findings: true }).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T09:00:00Z'), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:05:00Z' });
  const clean = comment(summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T10:04:00Z'), { created_at: '2026-10-15T10:04:00Z', updated_at: '2026-10-15T10:04:00Z' });
  assert.equal(gate({ body: '', comments: [old, clean] }).status, 0);
});


test('security finding completion survives unrelated newer code/comment edits', () => {
  const sec = { commit_sha: sha, has_any_findings: true, has_unresolved_findings: true, status: 'completed' };
  const securityRow = (time) => '\n| 🔒 **Security Review** | ✅ **Completed** <relative-time datetime="' + time + '">' + time + '</relative-time> | `2667f79` | Manual request |';
  const old = comment(summary({}, sec).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T10:05:00Z') + securityRow('2026-10-15T09:00:00Z'), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:05:00Z' });
  const clean = comment(summary({}, { ...sec, has_any_findings: false, has_unresolved_findings: false }).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T10:04:00Z') + securityRow('2026-10-15T10:04:00Z'), { created_at: '2026-10-15T10:04:00Z', updated_at: '2026-10-15T10:04:00Z' });
  assert.equal(gate({ body: '', comments: [old, clean] }).status, 0);
});


test('running section edit retains observation timestamp after code finding clearance', () => {
  const old = comment(summary({ has_any_findings: true }, { commit_sha: sha, status: 'in_progress', has_any_findings: false, has_unresolved_findings: false }).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T09:00:00Z'), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:05:00Z' });
  const clean = comment(summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T10:04:00Z'), { created_at: '2026-10-15T10:04:00Z', updated_at: '2026-10-15T10:04:00Z' });
  assert.notEqual(gate({ body: '', comments: [old, clean] }).status, 0);
});


test('historically resolved typed finding stays resolved across repeated requests', () => {
  const old = comment(summary({ has_any_findings: true }).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T08:00:00Z'), { created_at: '2026-10-15T08:00:00Z', updated_at: '2026-10-15T08:00:00Z' });
  const clean = comment(summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T09:00:00Z'), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z' });
  assert.equal(gate({ body: '', comments: [old, clean], formal: true }).status, 0);
});


test('historical code resolution is section-local with unrelated running security', () => {
  const old = comment(summary({ has_any_findings: true }).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T08:00:00Z'), { created_at: '2026-10-15T08:00:00Z', updated_at: '2026-10-15T08:00:00Z' });
  const clear = comment(summary({}, { commit_sha: sha, status: 'in_progress', has_any_findings: false, has_unresolved_findings: false }).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T09:00:00Z'), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z' });
  assert.equal(gate({ body: '', comments: [old, clear], formal: true }).status, 0);
});


test('contradictory historical section clear cannot resolve a typed finding', () => {
  const old = comment(summary({ has_any_findings: true }).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T08:00:00Z'), { created_at: '2026-10-15T08:00:00Z', updated_at: '2026-10-15T08:00:00Z' });
  for (const extra of ['Found P1 issues.', 'Security review failed.']) {
    const clear = comment(summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T09:00:00Z') + '\n' + extra, { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z' });
    assert.notEqual(gate({ body: '', comments: [old, clear], formal: true }).status, 0);
  }
});


test('mismatched visible finding head cannot lend an old clearance clock', () => {
  const old = comment(summary({ has_any_findings: true }).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T09:00:00Z').replaceAll('`' + sha.slice(0, 7) + '`', '`aaaaaaa`'), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:05:00Z' });
  const clean = comment(summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T10:04:00Z'), { created_at: '2026-10-15T10:04:00Z', updated_at: '2026-10-15T10:04:00Z' });
  assert.notEqual(gate({ body: '', comments: [old, clean] }).status, 0);
});


test('security-only completed finding keeps its canonical clock after clearance', () => {
  const absent = { commit_sha: null, status: null, has_any_findings: null, has_unresolved_findings: null };
  const sec = { commit_sha: sha, status: 'completed', has_any_findings: false, has_unresolved_findings: false };
  const row = (time) => '\n| 🔒 **Security Review** | ✅ **Completed** <relative-time datetime="' + time + '">' + time + '</relative-time> | `' + sha.slice(0, 7) + '` | Manual request |';
  const old = comment(summary(absent, { ...sec, has_any_findings: true }).replace(/\n\| 📝[^\n]*/, '') + row('2026-10-15T09:00:00Z'), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:05:00Z' });
  const clear = comment(summary({}, sec) + row('2026-10-15T10:01:00Z'));
  assert.equal(gate({ body: '', comments: [old, clear], formal: true }).status, 0);
});


test('historical typed findings survive multiline JSON and unrelated HTML comments', () => {
  const body = summary({ has_any_findings: true });
  const multiline = body.replace(/(<!-- codex-review-state:v1 )(.*?)( -->)/, (_, prefix, json, suffix) => prefix + JSON.stringify(JSON.parse(json), null, 2) + suffix);
  for (const variant of [multiline, body.replace('<!-- codex-review-state:', '<!-- TODO -->\n<!-- codex-review-state:')]) {
    const old = comment(variant.replaceAll('2026-10-15T10:01:00Z', '2026-10-15T09:00:00Z'), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z' });
    assert.notEqual(gate({ body: '', comments: [old], formal: true }).status, 0);
  }
});


test('canonical later security clear retires mismatched finding rendering', () => {
  const sec = { commit_sha: sha, status: 'completed', has_any_findings: false, has_unresolved_findings: false };
  const row = (time, short = sha.slice(0, 7)) => '\n| 🔒 **Security Review** | ✅ **Completed** <relative-time datetime="' + time + '">' + time + '</relative-time> | `' + short + '` | Manual request |';
  const old = comment(summary({}, { ...sec, has_any_findings: true }) + row('2026-10-15T10:01:00Z', 'aaaaaaa'), { updated_at: '2026-10-15T10:02:00Z' });
  const clear = comment(summary({}, sec).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T10:01:30Z') + row('2026-10-15T10:03:00Z'), { updated_at: '2026-10-15T10:03:00Z' });
  const outcome = gate({ body: '', comments: [old, clear] }); assert.equal(outcome.status, 0, outcome.stdout + outcome.stderr);
});


test('invalid completed companion retains newer observation after finding resolution', () => {
  const sec = { commit_sha: 'a'.repeat(40), status: 'completed', has_any_findings: false, has_unresolved_findings: false };
  const row = '\n| 🔒 **Security Review** | ✅ **Completed** <relative-time datetime="2026-10-15T10:05:00Z">2026-10-15T10:05:00Z</relative-time> | `2667f79` | Manual request |';
  const old = comment(summary({ has_any_findings: true }, sec).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T09:00:00Z') + row, { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:05:00Z' });
  const clear = comment(summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T10:04:00Z'), { updated_at: '2026-10-15T10:04:00Z' });
  assert.notEqual(gate({ body: '', comments: [old, clear] }).status, 0);
  const valid = { ...old, body: old.body.replace(row, row.replace('`2667f79`', '`aaaaaaa`')) };
  assert.equal(gate({ body: '', comments: [valid, clear] }).status, 0);
});


test('foreign-only negative edits remain observations and indented protocol is no historical finding', () => {
  const old = comment(summary({ commit_sha: 'a'.repeat(40), has_any_findings: true }).replaceAll('`2667f79`', '`aaaaaaa`').replaceAll(after, '2026-10-15T09:00:00Z'), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:05:00Z' });
  const clean = comment(summary().replaceAll(after, '2026-10-15T10:04:00Z'), { updated_at: '2026-10-15T10:04:00Z' });
  assert.notEqual(gate({ body: '', comments: [old, clean] }).status, 0);
  for (const prefix of [' ', '  ', '   ']) assert.equal(accepts(comment(summary().replace(/^<!-- codex-/gm, prefix + '<!-- codex-')), sha, marker), true);
  for (const prefix of ['    ', '\t', '\uFEFF    ', '\uFEFF\t']) {
    const example = comment(summary({ has_any_findings: true }).replace(/^<!-- codex-/gm, prefix + '<!-- codex-').replaceAll(after, '2026-10-15T09:00:00Z'), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z' });
    assert.equal(gate({ body: '', comments: [example], formal: true }).status, 0);
    assert.notEqual(gate({ body: summary().replace(/^<!-- codex-/gm, prefix + '<!-- codex-') }).status, 0);
    const finding = comment(summary({ has_any_findings: true }).replaceAll(after, '2026-10-15T08:00:00Z'), { created_at: '2026-10-15T08:00:00Z' });
    const exampleClear = comment(summary().replace(/^<!-- codex-/gm, prefix + '<!-- codex-').replaceAll(after, '2026-10-15T09:00:00Z'), { created_at: '2026-10-15T09:00:00Z' });
    assert.notEqual(gate({ body: '', comments: [finding, exampleClear], formal: true }).status, 0);
  }
});

test('finding-bearing foreign companion requires its own visible row and configured identity survives', () => {
  const sec = { commit_sha: 'a'.repeat(40), status: 'completed', has_any_findings: true, has_unresolved_findings: false };
  const old = comment(summary({ has_any_findings: true }, sec).replaceAll(after, '2026-10-15T09:00:00Z'), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:05:00Z' });
  const clean = comment(summary().replaceAll(after, '2026-10-15T10:04:00Z'), { updated_at: '2026-10-15T10:04:00Z' });
  assert.notEqual(gate({ body: '', comments: [old, clean] }).status, 0);
  const custom = { login: 'configured-codex[bot]' };
  const coherent = comment(summary({ has_any_findings: true }).replaceAll(after, '2026-10-15T09:00:00Z'), { user: custom, created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:05:00Z' });
  assert.equal(selectSummary([coherent, { ...clean, user: custom }], sha, marker, { trustedReviewLogins: [custom.login] }), 'pass');
});


test('case-varied unknown protocol cannot clear typed finding history', () => {
  const old = comment(summary({ has_any_findings: true }).replaceAll(after, '2026-10-15T08:00:00Z'), { created_at: '2026-10-15T08:00:00Z' });
  const invalidClear = comment(summary().replaceAll(after, '2026-10-15T09:00:00Z') + '\n<!-- CODEX-unknown -->', { created_at: '2026-10-15T09:00:00Z' });
  assert.notEqual(gate({ body: '', comments: [old, invalidClear], formal: true }).status, 0);
});


test('protocol discovery and partial projection preserve pending and genuine findings', () => {
  const clean = comment(summary().replaceAll(after, '2026-10-15T10:04:00Z'), { updated_at: '2026-10-15T10:04:00Z' });
  const upper = comment(summary().replace('codex-pull-request-review-summary', 'CODEX-PULL-REQUEST-REVIEW-SUMMARY'), { updated_at: '2026-10-15T10:05:00Z' });
  assert.notEqual(gate({ body: '', comments: [clean, upper] }).status, 0);
  const oldBody = summary({ has_any_findings: true }).replaceAll(after, '2026-10-15T08:00:00Z');
  const old = comment(oldBody + '\nExample:\n    <!-- codex-review-state:v1 {} -->', { created_at: '2026-10-15T08:00:00Z', updated_at: '2026-10-15T08:00:00Z' });
  assert.notEqual(gate({ body: '', comments: [old], formal: true }).status, 0);
  const running = { commit_sha: sha, status: 'in_progress', has_any_findings: false, has_unresolved_findings: false };
  const invalidClear = comment(summary({}, running).replaceAll(after, '2026-10-15T09:00:00Z') + '\n| 🔒 **Security Review** | ⚠️ Do not merge | `2667f79` | Manual request |', { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z' });
  assert.notEqual(gate({ body: '', comments: [comment(oldBody, { created_at: '2026-10-15T08:00:00Z' }), invalidClear], formal: true }).status, 0);
  const inactiveWarning = { ...invalidClear, body: summary().replaceAll(after, '2026-10-15T09:00:00Z') + '\n| 🔒 **Security Review** | ⚠️ Do not merge | `2667f79` | Manual request |' };
  assert.notEqual(gate({ body: '', comments: [comment(oldBody, { created_at: '2026-10-15T08:00:00Z' }), inactiveWarning], formal: true }).status, 0);
  for (const extraRow of ['🔒 **Security Review** | ✅ **Completed** <relative-time datetime="' + before + '">' + before + '</relative-time> | `2667f79` | Manual request |', '<details><summary>ℹ️ About Codex in GitHub</summary>\n> | 🛡️ **Security&#32;Review** | ✅ **Completed** <relative-time datetime="' + before + '">' + before + '</relative-time> | `2667f79` | Manual request |\n</details>']) {
    const ambiguous = comment(summary().replaceAll(after, before) + '\n' + extraRow, { created_at: before, updated_at: before });
    assert.notEqual(gate({ body: '', comments: [comment(oldBody, { created_at: '2026-10-15T08:00:00Z', updated_at: '2026-10-15T08:00:00Z' }), ambiguous], formal: true }).status, 0);
  }
  for (const label of ['**SECURITY REVIEW**', '**Security&#32;Review**', '**Security&nbsp;Review**', '**Security <em>Review</em>**']) {
    const encodedWarning = { ...inactiveWarning, body: inactiveWarning.body.replace('**Security Review**', label) };
    assert.notEqual(gate({ body: '', comments: [comment(oldBody, { created_at: '2026-10-15T08:00:00Z' }), encodedWarning], formal: true }).status, 0);
  }
  const canonical = { ...invalidClear, body: invalidClear.body.replace('⚠️ Do not merge', '🔄 **Running** since <relative-time datetime="2026-10-15T09:00:00Z">2026-10-15T09:00:00Z</relative-time>') };
  assert.equal(gate({ body: '', comments: [comment(oldBody, { created_at: '2026-10-15T08:00:00Z' }), canonical], formal: true }).status, 0);
  for (const prefix of ['    ', '\t', '\uFEFF    ', '<!-- presentation metadata -->    ']) {
    const todoClear = { ...canonical, body: summary().replaceAll(after, '2026-10-15T09:00:00Z') + '\n' + prefix + '<!-- TODO -->' };
    assert.notEqual(gate({ body: '', comments: [comment(oldBody, { created_at: '2026-10-15T08:00:00Z' }), todoClear], formal: true }).status, 0);
  }
  const warningLabel = { ...canonical, body: canonical.body.replace('🔒 **Security Review**', '⚠️ Do not merge 🔒 **Security Review**') };
  assert.notEqual(gate({ body: '', comments: [comment(oldBody, { created_at: '2026-10-15T08:00:00Z' }), warningLabel], formal: true }).status, 0);
});


test('leading typed findings survive trailing presentation without authorizing examples', () => {
  const time = '2026-10-15T08:00:00Z';
  const negative = summary({ has_any_findings: true }).replaceAll(after, time);
  for (const tail of ['\n> ```html\n> <!-- codex-review-state:v1 {} -->\n> ```', '\n<!-- codex-review-state:v1 {} -->']) {
    assert.notEqual(gate({ body: '', comments: [comment(negative + tail, { created_at: time, updated_at: time })], formal: true }).status, 0);
    assert.equal(accepts(comment(summary() + tail), sha, marker), false);
  }
  for (const body of ['```html\n' + negative + '\n```', negative.split('\n').map(line => '> ' + line).join('\n'), negative.replace('## Codex Review Summary', '<!-- codex-review-state:v1 {} -->\n## Codex Review Summary')]) {
    assert.equal(gate({ body: '', comments: [comment(body, { created_at: time, updated_at: time })], formal: true }).status, 0);
  }
  const fencedClear = comment('```html\n' + summary().replaceAll(after, '2026-10-15T09:00:00Z') + '\n```', { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z' });
  assert.notEqual(gate({ body: '', comments: [comment(negative, { created_at: time, updated_at: time }), fencedClear], formal: true }).status, 0);
});


test('warning-bearing own finding row keeps edit-time invalidation', () => {
  const old = comment(summary({ has_any_findings: true }).replaceAll(after, '2026-10-15T09:00:00Z').replace('📝 **Code Review**', '⚠️ Do not merge 📝 **Code Review**'), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:05:00Z' });
  const clean = comment(summary().replaceAll(after, '2026-10-15T10:04:00Z'), { updated_at: '2026-10-15T10:04:00Z' });
  assert.notEqual(gate({ body: '', comments: [old, clean], formal: true }).status, 0);
  for (const prose of ['Found P1 issues.', 'Security review failed.']) {
    const edited = { ...old, body: old.body.replace('⚠️ Do not merge 📝 **Code Review**', '📝 **Code Review**') + '\n' + prose };
    assert.notEqual(gate({ body: '', comments: [edited, clean], formal: true }).status, 0);
  }
});


test('leading metadata cannot hide a newer malformed protocol observation', () => {
  const malformed = comment('<!-- TODO -->\n<!-- codex-review-state:v1 broken -->', { created_at: '2026-10-15T10:05:00Z', updated_at: '2026-10-15T10:05:00Z' });
  assert.notEqual(gate({ body: '', comments: [comment(receipt), malformed] }).status, 0);
});


test('canonical newer clear resolves post-request typed finding prose only', () => {
  const clean = comment(summary().replaceAll(after, '2026-10-15T10:03:00Z'), { created_at: '2026-10-15T10:03:00Z', updated_at: '2026-10-15T10:03:00Z' });
  for (const prose of ['P1: defect', 'Found issues.']) {
    const typed = comment(summary({ has_any_findings: true }) + '\n' + prose);
    assert.equal(gate({ body: '', comments: [typed, clean] }).status, 0);
    assert.notEqual(gate({ body: '', comments: [comment(receipt + '\n' + prose), clean] }).status, 0);
    assert.notEqual(gate({ body: '', comments: [typed, comment(summary())] }).status, 0);
  }
});


test('code-indented heading and formatted warning triggers cannot approve', () => {
  const row = summary().split('\n').find((line) => line.startsWith('| 📝 **Code Review**'));
  assert.equal(accepts(comment(summary().replace('<!-- codex-pull-request-review-summary -->', '    \u00A0<!-- codex-pull-request-review-summary -->')), sha, marker), false);
  assert.equal(accepts(comment(summary().replace('<!-- codex-pull-request-review-summary -->', '    \uFEFF<!-- codex-pull-request-review-summary -->')), sha, marker), false);
  for (const body of [summary() + '\n<!--\n```html\n-->\n' + row, summary().replace('| 📝 **Code Review**', '<!--\n| 📝 **Code Review**'), summary().replace('<relative-time', '<!-- presentation\nmetadata --><relative-time')]) assert.equal(accepts(comment(body), sha, marker), false);
  for (const prefix of ['    ', '\t', '\uFEFF    ', '<!-- presentation metadata -->    ']) assert.equal(accepts(comment(summary().replace('## Codex Review Summary', prefix + '## Codex Review Summary')), sha, marker), false);
  for (const trigger of ['Do **not** merge', 'Do not&nbsp;merge', 'P&#8203;1 blocker', 'Do [not](https://example.com/(x)) merge', '<img src="invalid" alt="P1 blocker">', '[safe](P1 blocker)', 'Do [not][x] merge\n\n[x]: https://example.com', 'Do [not][] merge\n\n[not]: https://example.com', 'Do [not] merge\n\n[not]: https://example.com', 'Do [not](https://example.com "title") merge', "Do [not](https://example.com 'title') merge", 'Do [not](https://example.com (title)) merge', 'Do <span title="&#34;>">not</span> merge', '<!--[x](foo-->P1)', '[safe][P1 blocker]', '[safe](P1\\ blocker)', '[safe](P1>)', 'Found issues.', 'Found an issue.', 'Found one issue.', 'Found twenty-one issues.', 'Security review failed.', 'Review pending.', 'Changes requested.', 'Do [not]( https://example.com ) merge', 'Do [not]() merge', '\\[safe](P1)', '`[safe](P1)`', '```text\n[safe](P1)\n```', '~~~text\n[safe](P1)\n~~~', '<code>[safe](P1)</code>', '<P1?> blocker', '[safe\\]( P1)', '[safe [inner](url)](P1)', '    [safe](P1)', '\t[safe](P1)', '`<P1> blocker`', '```text\n<P1> blocker\n```', '> ~~~\n> [safe](P1)\n> ~~~', '- ~~~\n  [safe](P1)\n  ~~~', 'Do [not] merge\n\n[not]:\n  https://example.com', '[doc]: <https://example.test/P1', '    [doc]: https://example.test/P1', '`[doc]: https://example.test/P1`', '[safe\n\nlabel](P1)', '[foo[bar]: https://example.test/P1', '[doc]: P1)', '<div>\n[safe](P1)\n</div>', '<div>\n[doc]: https://example.test/P1\n</div>', 'Found\nan issue', 'note[^doc]\n\n[^doc]: P1', '[safe][^doc]\n\n[^doc]: P1', '</span P1>', '<span P1?>safe</span>', '<img / P1>', '<img =P1>', 'note[^DOC]\n\n[^doc]: P1', '[safe[^note]](https://example.test)\n\n[^note]: P1', 'root[^a]\n\n[^a]: safe [^b]\n[^b]: P1', 'note[^doc]\n\n[^doc]: safe\n  P1', 'note[^doc]\n\n[^doc]: safe\n    P1', 'There is an issue.', 'There is 1 issue', 'Detected 1 issue', '1 unresolved finding', '[safe](' + '('.repeat(33) + 'P1' + ')'.repeat(33) + ')', '[safe][doc]\n\n[doc]: ' + '('.repeat(33) + 'P1' + ')'.repeat(33), 'Found 0 code issues and 1 security issue.', '> <div>\n> [safe](P1)\n> </div>', '> - <div>\n>   [safe](P1)', '- <div>\n  [safe](P1)\n  </div>', '<div>\n<span>P&#49</span> blocker\n</div>', '<div>\n<span>Do&#32not&#32merge</span>\n</div>', 'Do<br>not<br>merge', 'P`1` blocker', 'Do `not` merge']) assert.equal(accepts(comment(summary().replace('Manual request', trigger)), sha, marker), false);
});


test('rendered footer warnings cannot approve or clear findings', () => {
  const time = '2026-10-15T09:00:00Z';
  const old = comment(summary({ has_any_findings: true }).replaceAll(after, time), { created_at: time, updated_at: time });
  const balancedPlain = summary() + '\n<details><summary>ℹ️ About Codex in GitHub</summary>\n\n[safe [plain]](P1)</details>';
  assert.equal(accepts(comment(balancedPlain), sha, marker), true);
  const securityRow = (when, label = '**Security Review**', short = '2667f79') => '\n| 🔒 ' + label + ' | ✅ **Completed** <relative-time datetime="' + when + '">' + when + '</relative-time> | `' + short + '` | Manual request |';
  const securityState = { commit_sha: sha, status: 'completed', has_any_findings: false, has_unresolved_findings: false };
  const oldSecurity = comment(summary({}, { ...securityState, has_any_findings: true }).replaceAll(after, time) + securityRow(time), { created_at: time, updated_at: time });
  const duplicateSecurity = summary({}, securityState) + securityRow(after) + securityRow(after, '**Security&#32;Review**', 'aaaaaaa');
  assert.equal(accepts(comment(duplicateSecurity), sha, marker), false);
  assert.notEqual(gate({ body: '', comments: [oldSecurity, comment(duplicateSecurity)], formal: true }).status, 0);
  const unbalancedFooter = summary() + '\n<details><summary>ℹ️ About Codex in GitHub</summary>Information\n</details>\n| 🔒 **Security Review** | ⚠️ Failed | `2667f79` | Manual request |\n</details>';
  assert.equal(accepts(comment(unbalancedFooter), sha, marker), false);
  assert.notEqual(gate({ body: '', comments: [old, comment(unbalancedFooter)], formal: true }).status, 0);
  const escapedBackticks = summary() + '\n<details><summary>ℹ️ About Codex in GitHub</summary>\n\n\\`[safe](P1)\\`</details>';
  assert.equal(accepts(comment(escapedBackticks), sha, marker), true);
  assert.equal(gate({ body: '', comments: [old, comment(escapedBackticks)], formal: true }).status, 0);
  const hiddenHtmlAttribute = summary() + '\n<details><summary>ℹ️ About Codex in GitHub</summary>\n\n<div>\n<span title="P1">safe</span>\n</div>\n</details>';
  assert.equal(accepts(comment(hiddenHtmlAttribute), sha, marker), true);
  for (const literalEntity of ['<span>P&#49</span> blocker', '<span>Do&#32not&#32merge</span>', '`P&#49` blocker']) {
    const body = summary() + '\n<details><summary>ℹ️ About Codex in GitHub</summary>\n\n' + literalEntity + '\n</details>';
    assert.equal(accepts(comment(body), sha, marker), true);
  }
  const rawEntityFooter = summary() + '\n<details><summary>ℹ️ About Codex in GitHub</summary><span>P&#49</span> blocker</details>';
  assert.equal(accepts(comment(rawEntityFooter), sha, marker), false);
  for (const cleanRendered of ['<span title="[^note]">safe</span>\n\n[^note]: P1', '[safe](https://example.test/[^note])\n\n[^note]: P1 example', '[^doc]: safe\n  P1', '[^doc]: safe\n    P1', '[^bad label]: P1', 'note[^bad label]\n\n[^bad label]: P1', '> <div>\n[safe](P1)', '- <div>\n[safe](P1)', '[safe](' + '('.repeat(32) + 'P1' + ')'.repeat(32) + ')', '[safe][doc]\n\n[doc]: ' + '('.repeat(32) + 'P1' + ')'.repeat(32), '[safe](<' + '('.repeat(33) + 'P1' + ')'.repeat(33) + '>)', '<div>\n</span P1>\n</div>']) {
    const body = summary() + '\n<details><summary>ℹ️ About Codex in GitHub</summary>\n\n' + cleanRendered + '\n</details>';
    assert.equal(accepts(comment(body), sha, marker), true);
  }
  const unusedFootnote = summary() + '\n<details><summary>ℹ️ About Codex in GitHub</summary>\n\n[^doc]: P1\n</details>';
  assert.equal(accepts(comment(unusedFootnote), sha, marker), true);
  const commentPipe = summary().replace('Manual request', 'Manual <!-- | --> request');
  assert.equal(accepts(comment(commentPipe), sha, marker), false);
  assert.notEqual(gate({ body: '', comments: [old, comment(commentPipe)], formal: true }).status, 0);
  const referenceDestination = summary() + '\n<details><summary>ℹ️ About Codex in GitHub</summary>\n\n[safe][doc]\n\n[doc]: https://example.test/P1</details>';
  assert.equal(accepts(comment(referenceDestination), sha, marker), true);
  assert.equal(gate({ body: '', comments: [old, comment(referenceDestination)], formal: true }).status, 0);
  for (const rawTag of ['script', 'style']) {
    const opaqueDetails = summary().replace(summary().split('\n').find((line) => line.startsWith('| 📝 **Code Review**')), '') + '\n<details><summary>ℹ️ About Codex in GitHub</summary>\n<' + rawTag + '>\n</details>\n</' + rawTag + '>\n' + summary().split('\n').find((line) => line.startsWith('| 📝 **Code Review**')) + '\n</details>';
    assert.equal(accepts(comment(opaqueDetails), sha, marker), false);
    assert.notEqual(gate({ body: '', comments: [old, comment(opaqueDetails)], formal: true }).status, 0);
  }
  for (const cleanCount of ['Found no issues.', 'Found zero issues.', 'Found 0 issues.', 'Found <em>no</em> issues.', 'Found <code>0</code> issues.', 'Found 0 code issues and 0 security issues.', 'There is no issue.']) {
    const cleanFooter = summary() + '\n<details><summary>ℹ️ About Codex in GitHub</summary>' + cleanCount + '</details>';
    assert.equal(accepts(comment(cleanFooter), sha, marker), true);
    const editedOld = { ...old, body: old.body + cleanFooter.slice(summary().length), updated_at: '2026-10-15T12:00:00Z' };
    assert.equal(gate({ body: summary(), comments: [editedOld, comment(summary())] }).status, 0, cleanCount);
  }
  const softLineLabel = summary() + '\n<details><summary>ℹ️ About Codex in GitHub</summary>\n\n[safe\nlabel](P1)</details>';
  assert.equal(accepts(comment(softLineLabel), sha, marker), true);
  const lateFooterFinding = { ...old, body: old.body + '\n<details><summary>ℹ️ About Codex in GitHub</summary>P1 blocker</details>', updated_at: '2026-10-15T12:00:00Z' };
  const articleFinding = { ...old, body: old.body + '\n<details><summary>ℹ️ About Codex in GitHub</summary>Found an issue.</details>', updated_at: '2026-10-15T12:00:00Z' };
  const renderedArticleFinding = { ...articleFinding, body: articleFinding.body.replace('Found an issue.', 'Found <em>an</em> issue.') };
  assert.notEqual(gate({ body: '', comments: [renderedArticleFinding, comment(summary())] }).status, 0);
  assert.notEqual(gate({ body: '', comments: [articleFinding, comment(summary())] }).status, 0);
  assert.notEqual(gate({ body: '', comments: [lateFooterFinding, comment(summary())] }).status, 0);
  const adjacent = summary() + '\n<details><summary>ℹ️ About Codex in GitHub</summary>P\uFE0F1 blocker</details>';
  assert.equal(accepts(comment(adjacent), sha, marker), false);
  assert.notEqual(gate({ body: '', comments: [old, comment(adjacent)], formal: true }).status, 0);
  const row = summary().split('\n').find((line) => line.startsWith('| 📝 **Code Review**'));
  const afterAboutDuplicate = summary() + '\n<details><summary>ℹ️ About Codex in GitHub</summary>\nInformational.\n</details>\n' + row;
  assert.equal(accepts(comment(afterAboutDuplicate), sha, marker), false);
  assert.notEqual(gate({ body: '', comments: [old, comment(afterAboutDuplicate)], formal: true }).status, 0);
  const visibleDuplicate = summary() + '\n<details><summary>ℹ️ About Codex in GitHub\n' + row.replace('`2667f79`', '`aaaaaaa`') + '\n</summary></details>';
  assert.equal(accepts(comment(visibleDuplicate), sha, marker), false);
  assert.notEqual(gate({ body: '', comments: [old, comment(visibleDuplicate)], formal: true }).status, 0);
  const nested = summary().replace(row, '') + '\n<details><summary>ℹ️ About Codex in GitHub</summary>\n<details><summary>inner</summary></details>\n' + row + '\n</details>';
  assert.equal(accepts(comment(nested), sha, marker), false);
  assert.notEqual(gate({ body: '', comments: [old, comment(nested)], formal: true }).status, 0);
  for (const tag of ['pre', 'code', 'div', 'script', 'style', 'textarea', 'table', 'section', 'article', 'blockquote', 'kbd']) {
    const wrapped = summary().replace(row, '<' + tag + '>\n' + row + '\n</' + tag + '>');
    const findingRow = old.body.split('\n').find((line) => line.startsWith('| 📝 **Code Review**'));
    const wrappedFinding = { ...old, body: old.body.replace(findingRow, '<' + tag + '>\n' + findingRow + '\n</' + tag + '>'), updated_at: '2026-10-15T12:00:00Z' };
    assert.equal(accepts(comment(wrapped), sha, marker), false);
    assert.notEqual(gate({ body: '', comments: [old, comment(wrapped)], formal: true }).status, 0);
    assert.notEqual(gate({ body: '', comments: [wrappedFinding, comment(summary())] }).status, 0);
  }
  const unmatched = summary().replace(row, '') + '\n<details><summary>ℹ️ About Codex in GitHub</summary>\n</pre>\n' + row + '\n</details>';
  assert.equal(accepts(comment(unmatched), sha, marker), false);
  assert.notEqual(gate({ body: '', comments: [old, comment(unmatched)], formal: true }).status, 0);
  const collapsed = summary().replace(row, '') + '\n<details> <summary>ℹ️ About Codex in GitHub</summary>\n' + row + '\n</details>';
  assert.equal(accepts(comment(collapsed), sha, marker), false);
  assert.notEqual(gate({ body: '', comments: [old, comment(collapsed)], formal: true }).status, 0);
  const blankCollapsed = summary().replace(row, '') + '\n<details> <summary>ℹ️ About Codex in GitHub</summary>\n\n' + row + '\n</details>';
  assert.equal(accepts(comment(blankCollapsed), sha, marker), false);
  assert.notEqual(gate({ body: '', comments: [old, comment(blankCollapsed)], formal: true }).status, 0);
  for (const body of [summary() + '\n<!--\n```html\n-->\n' + row, summary().replace('| 📝 **Code Review**', '<!--\n| 📝 **Code Review**'), summary().replace('<relative-time', '<!-- presentation\nmetadata --><relative-time')]) assert.notEqual(gate({ body: '', comments: [old, comment(body)], formal: true }).status, 0);
  for (const warning of ['P&#49; blocker', 'P*1* blocker', 'Do&#32;not&#32;merge', 'Do&MediumSpace;not&MediumSpace;merge', 'Do&hairsp;not&hairsp;merge', 'Do [not](https://example.com) merge', 'P<strong>1</strong> blocker', 'Do <em>not</em> merge', 'P&#8203;1 blocker', 'Do&#8203;not&#8203;merge', 'Do&ThinSpace;not&ThinSpace;merge', 'Do&ZeroWidthSpace;not&ZeroWidthSpace;merge', 'P\uFE0F1 blocker', 'Do <sub>not</sub> merge', 'P<kbd>1</kbd> blocker', 'Do <!--hidden-->not merge', 'P<!--hidden-->1 blocker', 'P<span></span>1 blocker', 'Do<span>not</span>merge', 'Do <span title=">">not</span> merge', 'Do [not](https://example.com/(x)) merge', '<img src="invalid" alt="P1 blocker">', '[safe](P1 blocker)', 'Do [not][x] merge\n\n[x]: https://example.com', 'Do [not][] merge\n\n[not]: https://example.com', 'Do [not] merge\n\n[not]: https://example.com', 'Do [not](https://example.com "title") merge', "Do [not](https://example.com 'title') merge", 'Do [not](https://example.com (title)) merge', 'Do <span title="&#34;>">not</span> merge', '<!--[x](foo-->P1)', '[safe][P1 blocker]', '[safe](P1\\ blocker)', '[safe](P1>)', 'Found issues.', 'Found an issue.', 'Found one issue.', 'Found twenty-one issues.', 'Security review failed.', 'Review pending.', 'Changes requested.', 'Do [not]( https://example.com ) merge', 'Do [not]() merge', '\\[safe](P1)', '`[safe](P1)`', '```text\n[safe](P1)\n```', '~~~text\n[safe](P1)\n~~~', '<code>[safe](P1)</code>', '<P1?> blocker', '[safe\\]( P1)', '[safe [inner](url)](P1)', '    [safe](P1)', '\t[safe](P1)', '`<P1> blocker`', '```text\n<P1> blocker\n```', '> ~~~\n> [safe](P1)\n> ~~~', '- ~~~\n  [safe](P1)\n  ~~~', 'Do [not] merge\n\n[not]:\n  https://example.com', '[doc]: <https://example.test/P1', '    [doc]: https://example.test/P1', '`[doc]: https://example.test/P1`', '[safe\n\nlabel](P1)', '[foo[bar]: https://example.test/P1', '[doc]: P1)', '<div>\n[safe](P1)\n</div>', '<div>\n[doc]: https://example.test/P1\n</div>', 'Found\nan issue', 'note[^doc]\n\n[^doc]: P1', '[safe][^doc]\n\n[^doc]: P1', '</span P1>', '<span P1?>safe</span>', '<img / P1>', '<img =P1>', 'note[^DOC]\n\n[^doc]: P1', '[safe[^note]](https://example.test)\n\n[^note]: P1', 'root[^a]\n\n[^a]: safe [^b]\n[^b]: P1', 'note[^doc]\n\n[^doc]: safe\n  P1', 'note[^doc]\n\n[^doc]: safe\n    P1', 'There is an issue.', 'There is 1 issue', 'Detected 1 issue', '1 unresolved finding', '[safe](' + '('.repeat(33) + 'P1' + ')'.repeat(33) + ')', '[safe][doc]\n\n[doc]: ' + '('.repeat(33) + 'P1' + ')'.repeat(33), 'Found 0 code issues and 1 security issue.', '> <div>\n> [safe](P1)\n> </div>', '> - <div>\n>   [safe](P1)', '- <div>\n  [safe](P1)\n  </div>', '<div>\n<span>P&#49</span> blocker\n</div>', '<div>\n<span>Do&#32not&#32merge</span>\n</div>', 'Do<br>not<br>merge', 'P`1` blocker', 'Do `not` merge']) {
    const body = summary() + '\n<details> <summary>ℹ️ About Codex in GitHub</summary>\n\n\n' + warning + '\n</details>';
    assert.equal(accepts(comment(body), sha, marker), false);
    assert.notEqual(gate({ body: '', comments: [old, comment(body)], formal: true }).status, 0);
  }
});
