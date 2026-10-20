import { createAiReviewRequestMarkerBody } from '../../scripts/ai-review-helpers.mjs';
const f = JSON.parse(process.env.AI_REVIEW_FIXTURE);
const start = '2026-10-15T10:00:00Z', end = '2026-10-15T10:01:00Z';
const bot = { login: 'chatgpt-codex-connector[bot]' };
let heads = 0;
let issueWrites = 0;
process.on('exit', () => { if (issueWrites) process.exitCode = 9; });
globalThis.fetch = async (url, options = {}) => {
  if (url.includes('/issues/1/comments') && options.method === 'POST') issueWrites++;
  let data;
  if (url.endsWith('/pulls/1')) data = { head: { sha: f.headRace && ++heads > 1 ? 'a'.repeat(40) : f.sha } };
  else if (url.includes('/issues/1/comments')) data = [
    ...f.noMarker ? [] : [{ id: 1, user: { login: 'github-actions[bot]' }, created_at: start, body: createAiReviewRequestMarkerBody({ agent: 'codex', headSha: f.sha, requestId: 'fixture', sourceCommentId: '1', sourceCommentCreatedAt: start, requestedAt: start }) }],
    { id: 2, user: f.spoof ? { login: 'spoof[bot]' } : bot, created_at: f.edited ? '2026-10-14T00:00:00Z' : end, updated_at: end, body: f.noSha ? "Codex Review: Didn't find any major issues." : f.body ?? f.receipt },
    ...(f.extraBodies || []).map((body, i) => ({ id: 3 + i, user: bot, created_at: "2026-10-15T10:03:00Z", updated_at: "2026-10-15T10:03:00Z", body }))
  ];
  else if (url.includes('/pulls/1/reviews')) data = f.formal || f.previousFailure || f.missingFormalSha ? [{ id: 10, user: bot, commit_id: f.missingFormalSha ? undefined : f.sha, submitted_at: f.previousFailure ? '2026-10-14T00:00:00Z' : f.formalSubmittedAt ?? '2026-10-15T10:02:00Z', state: f.previousFailure ? 'CHANGES_REQUESTED' : 'COMMENTED' }] : [];
  else if (url.includes('/pulls/1/comments')) data = f.advisory ? [{ pull_request_review_id: 10, user: bot, body: '[P3] advisory' }] : [];
  else if (url.includes('/issues/1/timeline')) data = f.timelineRace ? [{ event: 'committed', created_at: '2026-10-15T10:00:30Z' }] : [];
  else if (url.endsWith('/graphql')) data = f.graphqlError ? { errors: [{ message: 'fixture' }] } : { data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: false }, nodes: f.unresolved || f.unresolvedGraphqlBot ? [{ isResolved: false, comments: { nodes: [{ author: f.unresolvedGraphqlBot ? { login: "chatgpt-codex-connector", __typename: "Bot" } : bot, body: '[P3] unresolved' }] } }] : [] } } } } };
  else throw new Error(`Unexpected fixture endpoint: ${url}`);
  return { ok: true, status: 200, json: async () => data };
};
