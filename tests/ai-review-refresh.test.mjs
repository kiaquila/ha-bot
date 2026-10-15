import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { refreshUnresolvedCodexThreads } from '../scripts/ai-review-thread-refresh.mjs';

const sha = 'a'.repeat(40);
const pull = (number = 1, extra = {}) => ({ number, state: 'open', draft: false, head: { sha }, ...extra });
const run = (extra = {}) => ({ id: 10, event: 'pull_request', head_sha: sha, pull_requests: [{ number: 1 }],
  created_at: '2026-10-15T10:00:00Z', status: 'completed', conclusion: 'success', ...extra });

async function refresh(options = {}) {
  const posts = [];
  let runReads = 0;
  const result = await refreshUnresolvedCodexThreads({ token: 'fixture', repository: 'example/repo',
    selectedAgent: options.agent, config: {}, request: async (_token, _repo, path, request = {}) => {
      if (path === '/graphql') {
        if (options.graphqlError) return { errors: [{ message: 'unavailable' }] };
        return { data: { repository: { pullRequest: { headRefOid: options.threadHead || sha, reviewThreads: {
          nodes: [{ isResolved: Boolean(options.resolved), comments: { nodes: [{ author: {
            login: options.author || 'chatgpt-codex-connector', __typename: 'Bot'
          } }] } }], pageInfo: { hasNextPage: false, endCursor: null }
        } } } } };
      }
      if (request.method === 'POST') {
        posts.push(path);
        if (options.postError) throw new Error('Unknown POST outcome');
        return null;
      }
      if (path.includes('/actions/workflows/')) {
        runReads++;
        return { workflow_runs: options.runs || [run(runReads > 1 ? options.laterRun : {})] };
      }
      if (/\/pulls\?/.test(path)) return options.pulls || [pull()];
      if (/\/pulls\/\d+$/.test(path)) return pull(Number(path.match(/\d+$/)[0]), options.livePull);
      throw new Error(`Unexpected API path: ${path}`);
    }
  });
  return { result, posts, runReads };
}

test('bounded poller requeues one successful current-head PR gate with an unresolved Codex thread', async () => {
  assert.deepEqual((await refresh()).posts, ['/repos/example/repo/actions/runs/10/rerun']);
  const multiple = await refresh({ pulls: [pull(), pull(2)] });
  assert.equal(multiple.posts.length, 1);
  for (const options of [
    { resolved: true }, { author: 'spoof' }, { agent: 'gemini' }, { pulls: [pull(1, { draft: true })] },
    { runs: [] }, { runs: [run({ event: 'workflow_dispatch' })] }, { runs: [run({ conclusion: 'failure' })] },
    { runs: [run({ status: 'in_progress', conclusion: null })] },
    { runs: [run({ pull_requests: [{ number: 2 }] })] }, { threadHead: 'b'.repeat(40) },
    { livePull: { head: { sha: 'b'.repeat(40) } } }, { livePull: { state: 'closed' } },
    { laterRun: { conclusion: 'failure' } }, { laterRun: { status: 'queued', conclusion: null } },
    { runs: [run(), run({ id: 11, created_at: '2026-10-15T10:01:00Z', conclusion: 'cancelled' })] }
  ]) assert.deepEqual((await refresh(options)).posts, [], JSON.stringify(options));
  await assert.rejects(refresh({ graphqlError: true }), /thread evidence/);
  await assert.rejects(refresh({ postError: true, pulls: [pull(), pull(2)] }), /Unknown POST outcome/);
});

test('scheduled poller uses only default-branch scripts with one serialized invocation', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ai-review-thread-refresh.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron: '2-57\/5 \* \* \* \*'/);
  assert.match(workflow, /if: github.ref == format\('refs\/heads\/\{0\}', github.event.repository.default_branch\)/);
  assert.match(workflow, /ref: \$\{\{ github.event.repository.default_branch \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /actions: write\n  contents: read\n  pull-requests: read/);
  assert.doesNotMatch(workflow, /issues: write|statuses: write|checks: write|pull_request_target/);
});

test('poller paginates PRs, gate runs and review threads before its single write', async () => {
  const writes = [], cursors = [];
  const result = await refreshUnresolvedCodexThreads({ token: 'fixture', repository: 'example/repo',
    request: async (_token, _repo, path, options = {}) => {
      if (path === '/graphql') {
        const cursor = JSON.parse(options.body).variables.cursor;
        cursors.push(cursor);
        return { data: { repository: { pullRequest: { headRefOid: sha, reviewThreads: {
          nodes: cursor ? [{ isResolved: false, comments: { nodes: [{ author: { login: 'chatgpt-codex-connector[bot]', __typename: 'Bot' } }] } }] :
            Array.from({ length: 100 }, () => ({ isResolved: true })),
          pageInfo: { hasNextPage: !cursor, endCursor: cursor ? null : 'next' }
        } } } } };
      }
      if (options.method === 'POST') { writes.push(path); return null; }
      if (path.includes('/actions/workflows/')) return { workflow_runs: path.endsWith('page=1') ?
        Array.from({ length: 100 }, (_, id) => run({ id, created_at: '2026-10-14T10:00:00Z', conclusion: 'failure' })) : [run()] };
      if (/\/pulls\?/.test(path)) return path.endsWith('page=1') ? Array.from({ length: 100 }, (_, i) => pull(i + 2, { draft: true })) : [pull()];
      if (path.endsWith('/pulls/1')) return pull();
      throw new Error(`Unexpected API path: ${path}`);
    }
  });
  assert.equal(result.rerun, true);
  assert.deepEqual(cursors, [null, 'next']);
  assert.deepEqual(writes, ['/repos/example/repo/actions/runs/10/rerun']);
});
